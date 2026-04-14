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
  // Envolver absolutamente tudo em um try/catch global para garantir retorno JSON
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ 
        ok: false, 
        error: 'Método não permitido', 
        hint: 'Esta rota aceita apenas chamadas POST multipart/form-data.' 
      });
    }

    // 1. Validar Autenticação e Autorização (Helper centralizado)
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

    // 2. Setup do Job no Firestore (Rastreabilidade)
    const jobId = `job_${Date.now()}_direct`;
    const jobRef = db.collection('jobs').doc(jobId);

    await jobRef.set({
      tipo: 'sync_pendencias_csv',
      status: 'running',
      requested_by: uid,
      requested_by_role: 'Admin',
      requested_at: FieldValue.serverTimestamp(),
      started_at: FieldValue.serverTimestamp(),
      file: {
        name: 'Direct Upload',
        size: parseInt(req.headers['content-length'] || '0'),
        contentType: 'text/csv'
      }
    });

    // 3. Processar Multipart Form Data usando Busboy
    const busboy = Busboy({ headers: req.headers });
    let result = {
      linhas_total: 0,
      linhas_gate: 0,
      linhas_com_pendencia: 0,
      ignoradas_por_status: 0,
      criadas: 0,
      atualizadas: 0,
      nao_mapeados: [] as string[],
      amostras: [] as string[]
    };

    return new Promise((resolve) => {
      busboy.on('file', (name, file, info) => {
        const chunks: any[] = [];
        
        file.on('data', (chunk) => chunks.push(chunk));
        
        file.on('end', async () => {
          try {
            const buffer = Buffer.concat(chunks);
            
            // Auto-detect encoding (UTF-8 vs Latin-1)
            let csvText = buffer.toString('utf-8');
            if (csvText.includes('\uFFFD')) {
              console.log('[CSV] Detected non-UTF8 encoding, falling back to latin1.');
              csvText = buffer.toString('latin1');
            }

            // Detectar onde o cabeçalho real começa
            const fromLine = await getCsvHeaderOffset(buffer);
            
            const records = parse(csvText, {
              columns: true,
              skip_empty_lines: true,
              trim: true,
              bom: true,
              relax_column_count: true,
              from_line: fromLine // Pular as linhas de "lixo"
            });

            for (const rawRow of records) {
              result.linhas_total++;
              const row = cleanRow(rawRow);

              try {
                const resRow = await processRow(row, result.linhas_total, uid);

                if (resRow.action === 'ignored_by_gate') {
                  result.ignoradas_por_status++;
                } else if (resRow.action === 'criada') {
                  result.criadas++;
                  result.linhas_gate++;
                  if (result.amostras.length < 10) result.amostras.push(`[CRIADA] ${row['Razão Social do Cliente']}`);
                } else if (resRow.action === 'editada') {
                  result.atualizadas++;
                  result.linhas_gate++;
                  if (result.amostras.length < 10) result.amostras.push(`[ATUALIZADA] ${row['Razão Social do Cliente']}`);
                } else if (resRow.action === 'sem_mudanca' || resRow.action === 'no_pendency') {
                  result.linhas_gate++;
                }
              } catch (err) {
                console.error(`Error processing line ${result.linhas_total}:`, err);
              }
            }

            result.linhas_com_pendencia = result.criadas + result.atualizadas;

            await jobRef.update({
              status: 'success',
              result,
              finished_at: FieldValue.serverTimestamp()
            });

            res.status(200).json({ ok: true, jobId, status: 'success', result });
            resolve(true);
            
          } catch (err: any) {
            console.error('File Processing Error:', err);
            res.status(500).json({ ok: false, error: err.message });
            resolve(false);
          }
        });
      });

      busboy.on('error', (err) => {
        console.error('Busboy Error:', err);
        res.status(400).json({ 
          ok: false, 
          error: 'Falha no parsing multipart', 
          hint: 'Certifique-se de que o corpo da requisição é um multipart/form-data válido.' 
        });
        resolve(false);
      });

      req.pipe(busboy);
    });

  } catch (err: any) {
    console.error('Global API Error:', err);
    return res.status(500).json({ 
      ok: false, 
      error: err.message || 'Erro interno no servidor', 
      hint: 'Verifique as variáveis de ambiente (FIREBASE_SERVICE_ACCOUNT) e logs do Vercel.' 
    });
  }
}
