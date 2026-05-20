import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore, verifyFirebaseIdToken } from './_utils/firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';
import { cleanRow, processRow, parseDate, standardizeCollaboratorName } from './_utils/rules-engine.js';
import { getCsvHeaderOffset } from './_utils/csv-helper.js';
import { parse } from 'csv-parse/sync';
import Busboy from 'busboy';

export const config = {
  api: {
    bodyParser: false,
  },
};

const normalizeForFp = (s: string) => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/\s+/g, "_").replace(/\//g, "_") : "";

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
        name: 'Planilha Geral Upload',
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
      erros_processamento: [] as any[],
      pipeline_stats: {
        processed: 0,
        deleted: 0
      }
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
              
              // Validação de cabeçalho baseada no formato da planilha (Nova / Geral)
              const firstRowCleaned = cleanRow(firstRecord, 'nova');
              const mappedHeaders = Object.keys(firstRowCleaned);

              const normalizeCol = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
              const targetRazao = normalizeCol("Razão Social do Cliente");
              const targetVigencia = normalizeCol("Inicio da Vigência de Contrato");

              const hasRazao = mappedHeaders.some(h => normalizeCol(h) === targetRazao);
              const hasVigencia = mappedHeaders.some(h => normalizeCol(h) === targetVigencia);

              if (!hasRazao || !hasVigencia) {
                result.erros_processamento.push({
                   erro: "Este arquivo não possui as colunas necessárias para processamento.",
                   detalhes: `Colunas mapeadas: ${mappedHeaders.join(", ")}`,
                   severidade: "critical"
                });
              }
            }

            let pipelineBatch = db.batch();
            let pipelineOpCount = 0;
            const seenPipelineFps = new Set<string>();

            for (const rawRow of records) {
              result.linhas_total++;
              const lineInFile = fromLine + result.linhas_total;
              
              // Definir tipo de regras baseado na linha do corte (1201)
              const tipoRegra = lineInFile <= 1201 ? 'antiga' : 'nova';
              const row = cleanRow(rawRow, tipoRegra);

              try {
                const rawStatus = row['Status da Empresa'] || 'N/A';
                result.status_unicos_encontrados[rawStatus] = (result.status_unicos_encontrados[rawStatus] || 0) + 1;

                // ── 1. Geração de Pendências ──
                const resRow = await processRow(rawRow, lineInFile, uid, tipoRegra);

                if (resRow.action === 'ignored_by_gate' || resRow.action === 'ignored_by_year' || resRow.action === 'ignored_by_future' || resRow.action === 'ignored_by_invalid_date') {
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

                // ── 2. Volumetria da Pipeline ──
                const razao = row["Razão Social do Cliente"] || "N/A";
                const produto = row["Produto"] || "N/A";
                const consultorRaw = row["CONSULTOR DE ONBOARDING"];
                const rawVigencia = row["Inicio da Vigência de Contrato"] || "";

                if (consultorRaw && String(consultorRaw).trim() !== "" && String(consultorRaw).trim() !== "-") {
                  const consultorTrim = String(consultorRaw).trim().toUpperCase();
                  const blacklist = ["LEGADO", "DECLINADO", "PENDENTE", "N/A", "N/H", "NH", "LIXO", "TESTE"];
                  const isBlacklisted = blacklist.some(b => consultorTrim === b || consultorTrim.includes(`*${b}*`));
                  const isIdTecnico = consultorTrim.length > 20 && /[0-9]/.test(consultorTrim);

                  if (!isBlacklisted && !isIdTecnico) {
                    const normalizedStatus = rawStatus.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/\s+/g, " ");
                    const isDeclinada = normalizedStatus.includes("DECLINADA") || normalizedStatus.includes("CANCELADA");
                    const isConcluida = normalizedStatus.includes("CONCLUIDA") || normalizedStatus.includes("CONCLUIDO") || normalizedStatus.includes("COMPLETA");
                    const isAtivo = normalizedStatus.includes("CURSO") || 
                                    normalizedStatus.includes("OPERACAO") || 
                                    normalizedStatus.includes("ANDAMENTO") ||
                                    normalizedStatus.includes("FUTURA") || 
                                    normalizedStatus.includes("IMPLANTACAO") ||
                                    normalizedStatus.includes("CLIENTE") || 
                                    normalizedStatus.includes("CORRETORA");

                    if (isAtivo && !isDeclinada && !isConcluida) {
                      // Validar data da vigência para pipeline (vigencia >= 2026-01-01)
                      const dataVigencia = parseDate(String(rawVigencia));
                      let year = 0;
                      if (dataVigencia) {
                        year = dataVigencia.getFullYear();
                      } else {
                        const yearMatch = String(rawVigencia).match(/\b(20\d{2})\b/);
                        year = yearMatch ? parseInt(yearMatch[0], 10) : 0;
                      }

                      if (year >= 2026) {
                        const consultorName = standardizeCollaboratorName(consultorRaw).toUpperCase();
                        const uniqueKey = `${normalizeForFp(String(razao))}_${normalizeForFp(String(produto))}_${normalizeForFp(String(rawVigencia))}_${lineInFile}`;
                        const fpPipeline = `vol_nova_${uniqueKey}`.substring(0, 240);

                        pipelineBatch.set(db.collection('pipeline_volumetria').doc(fpPipeline), {
                          razao_social: String(razao),
                          produto: String(produto),
                          consultor: consultorName,
                          status_pipeline: String(rawStatus),
                          status_normalizado: normalizedStatus,
                          origem: 'nova',
                          data_vigencia: String(rawVigencia),
                          updated_at: FieldValue.serverTimestamp(),
                          last_sync_by: uid
                        }, { merge: true });

                        pipelineOpCount++;
                        seenPipelineFps.add(fpPipeline);
                        result.pipeline_stats.processed++;

                        if (pipelineOpCount >= 400) {
                          await pipelineBatch.commit();
                          pipelineBatch = db.batch();
                          pipelineOpCount = 0;
                        }
                      }
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

            // Commit final do batch da pipeline
            if (pipelineOpCount > 0) {
              await pipelineBatch.commit();
            }

            // Limpeza geral de registros antigos de volumetria (deletar os que não vieram neste CSV)
            const allPipelineDocs = await db.collection('pipeline_volumetria').get();
            let deleteBatch = db.batch();
            let deleteCount = 0;
            let currentDelCount = 0;

            for (const doc of allPipelineDocs.docs) {
              if (!seenPipelineFps.has(doc.id)) {
                deleteBatch.delete(doc.ref);
                deleteCount++;
                currentDelCount++;
                
                if (currentDelCount >= 400) {
                  await deleteBatch.commit();
                  deleteBatch = db.batch();
                  currentDelCount = 0;
                }
              }
            }

            if (currentDelCount > 0) {
              await deleteBatch.commit();
            }

            result.pipeline_stats.deleted = deleteCount;
            result.linhas_com_pendencia = result.criadas + result.atualizadas;

            await jobRef.update({
              status: result.erros_processamento.length > 0 && result.linhas_gate === 0 ? 'failed' : 'success',
              result,
              finished_at: FieldValue.serverTimestamp()
            });

            res.status(200).json({ ok: true, jobId, status: 'success', result });
            resolve(true);
          } catch (err: any) {
            console.error('File sync execution error:', err);
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
