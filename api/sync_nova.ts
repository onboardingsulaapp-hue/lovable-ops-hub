import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore, verifyFirebaseIdToken } from './_utils/firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';
import { cleanRow, processRow } from './_utils/rules-engine.js';
import { getCsvHeaderOffset } from './_utils/csv-helper.js';
import { parse } from 'csv-parse/sync';
import Busboy from 'busboy';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ 
        ok: false, 
        error: 'Método não permitido', 
        hint: 'Esta rota aceita apenas chamadas POST multipart/form-data.' 
      });
    }

    // 1. Validar Autenticação
    let uid: string;
    try {
        uid = await verifyFirebaseIdToken(req.headers.authorization);
    } catch (error: any) {
        return res.status(error.status || 401).json({ 
          ok: false, 
          error: error.message, 
          hint: error.hint || 'Verifique se você está logado e tem privilégios de Admin.' 
        });
    }

    const db = getFirestore();

    // 2. Setup do Job no Firestore (Tipo específico: sync_nova_csv)
    const jobId = `job_${Date.now()}_nova`;
    const jobRef = db.collection('jobs').doc(jobId);

    await jobRef.set({
      tipo: 'sync_nova_csv',
      status: 'running',
      requested_by: uid,
      requested_by_role: 'Admin',
      requested_at: FieldValue.serverTimestamp(),
      started_at: FieldValue.serverTimestamp(),
      file: {
        name: 'Google Forms Upload',
        size: parseInt(req.headers['content-length'] || '0'),
        contentType: 'text/csv'
      }
    });

    const busboy = Busboy({ headers: req.headers });
    let result: any = {
      linhas_total: 0,
      linhas_gate: 0,
      linhas_com_pendencia: 0,
      ignoradas_por_status: 0,
      criadas: 0,
      atualizadas: 0,
      nao_mapeados: [] as string[],
      status_unicos_encontrados: {} as Record<string, number>,
      exemplos_de_pendencia: [] as any[],
      exemplos_ignorados: [] as any[],
      erros_processamento: [] as any[]
    };

    return new Promise((resolve) => {
      busboy.on('file', (name, file, info) => {
        const chunks: any[] = [];
        file.on('data', (chunk) => chunks.push(chunk));
        
        file.on('end', async () => {
          try {
            const buffer = Buffer.concat(chunks);
            let csvText = buffer.toString('utf-8');
            if (csvText.includes('\uFFFD')) {
              csvText = buffer.toString('latin1');
            }

            const fromLine = await getCsvHeaderOffset(csvText);
            
            const records = parse(csvText, {
              columns: true,
              skip_empty_lines: true,
              trim: true,
              bom: true,
              relax_column_count: true,
              from_line: fromLine
            });

            if (Array.isArray(records) && records.length > 0) {
              const firstRecord = records[0];
              const rawHeaders = Object.keys(firstRecord);
              
              // Validação de cabeçalho específica para Nova Planilha
              const firstRowCleaned = cleanRow(firstRecord, 'nova');
              const mappedHeaders = Object.keys(firstRowCleaned);

              const normalizeCol = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
              const targetRazao = normalizeCol("Razão Social do Cliente");
              const targetVigencia = normalizeCol("Inicio da Vigência de Contrato");

              const hasRazao = mappedHeaders.some(h => normalizeCol(h) === targetRazao);
              const hasVigencia = mappedHeaders.some(h => normalizeCol(h) === targetVigencia);

              if (!hasRazao || !hasVigencia) {
                result.erros_processamento.push({
                   erro: "Este arquivo não parece ser da Planilha Nova (Campos obrigatórios não identificados).",
                   detalhes: `Colunas mapeadas: ${mappedHeaders.join(", ")}`,
                   severidade: "critical"
                });
              }
            }

            for (const rawRow of records) {
              result.linhas_total++;
              const row = cleanRow(rawRow, 'nova');

              try {
                const rawStatus = row['Status da Empresa'] || 'N/A';
                result.status_unicos_encontrados[rawStatus] = (result.status_unicos_encontrados[rawStatus] || 0) + 1;

                const lineInFile = fromLine + result.linhas_total;
                const resRow = await processRow(row, lineInFile, uid, 'nova');

                if (resRow.action === 'ignored_by_gate' || resRow.action === 'ignored_by_year') {
                  result.ignoradas_por_status++;
                  if (result.exemplos_ignorados.length < 5) {
                    result.exemplos_ignorados.push({
                      razao_social: row['Razão Social do Cliente'] || 'N/A',
                      status: rawStatus,
                      motivo: resRow.action
                    });
                  }
                } else {
                  result.linhas_gate++;
                  if (resRow.action === 'criada' || resRow.action === 'editada') {
                    if (resRow.action === 'criada') result.criadas++;
                    else result.atualizadas++;

                    if (result.exemplos_de_pendencia.length < 5) {
                      result.exemplos_de_pendencia.push({
                        razao_social: row['Razão Social do Cliente'] || 'N/A',
                        status: rawStatus,
                        tipo: resRow.action
                      });
                    }
                  }
                }
              } catch (err: any) {
                result.erros_processamento.push({
                  linha: result.linhas_total,
                  cliente: row['Razão Social do Cliente'] || 'N/A',
                  erro: err.message
                });
              }
            }

            result.linhas_com_pendencia = result.criadas + result.atualizadas;

            await jobRef.update({
              status: result.erros_processamento.length > 0 && result.linhas_gate === 0 ? 'failed' : 'success',
              result,
              finished_at: FieldValue.serverTimestamp()
            });

            res.status(200).json({ ok: true, jobId, status: 'success', result });
            resolve(true);
          } catch (err: any) {
            res.status(500).json({ ok: false, error: err.message });
            resolve(false);
          }
        });
      });

      busboy.on('error', (err) => {
        res.status(400).json({ ok: false, error: 'Falha no parsing multipart' });
        resolve(false);
      });

      req.pipe(busboy);
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
