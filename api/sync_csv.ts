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
            
            // Auto-detect encoding (UTF-8 vs Latin-1)
            let csvText = buffer.toString('utf-8');
            if (csvText.includes('\uFFFD')) {
              console.log('[CSV] Detected non-UTF8 encoding, falling back to latin1.');
              csvText = buffer.toString('latin1');
            }

            // Detectar onde o cabeçalho real começa
            const fromLine = await getCsvHeaderOffset(csvText);
            
            const records = parse(csvText, {
              columns: true,
              skip_empty_lines: true,
              trim: true,
              bom: true,
              relax_column_count: true,
              from_line: fromLine // Pular as linhas de "lixo"
            });

            // Validação de Cabeçalho Robusta
            if (Array.isArray(records) && records.length > 0) {
              const firstRecord = records[0];
              const rawHeaders = Object.keys(firstRecord);
              console.log("[CSV] Colunas brutas:", rawHeaders);
              
              const firstRowCleaned = cleanRow(firstRecord);
              const mappedHeaders = Object.keys(firstRowCleaned);
              console.log("[CSV] Colunas mapeadas:", mappedHeaders);

              // Função de normalização idêntica à do rules-engine para garantir paridade
              const normalizeCol = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
              const targetNorm = normalizeCol("Congênere de origem");
              const targetConsultor = normalizeCol("CONSULTOR DE ONBOARDING");

              const hasCongenere = mappedHeaders.some(h => normalizeCol(h) === targetNorm);
              const hasConsultor = mappedHeaders.some(h => normalizeCol(h) === targetConsultor);

              if (!hasCongenere || !hasConsultor) {
                const missing = [];
                if (!hasCongenere) missing.push("'Congênere de origem'");
                if (!hasConsultor) missing.push("'CONSULTOR DE ONBOARDING'");
                
                result.erros_processamento.push({
                   erro: `Coluna(s) obrigatória(s) não encontrada(s): ${missing.join(", ")}`,
                   detalhes: `Colunas identificadas no seu CSV: ${rawHeaders.join(", ")}`,
                   severidade: "critical"
                });
              }
            } else if (records.length === 0) {
               console.warn("[CSV] Arquivo parece estar vazio (apenas cabeçalho ou sem dados)");
            }

            for (const rawRow of records) {
              result.linhas_total++;
              const row = cleanRow(rawRow);

              try {
                // Rastrear status únicos para o diagnóstico
                const rawStatus = row['Status da Empresa'] || 'N/A';
                result.status_unicos_encontrados[rawStatus] = (result.status_unicos_encontrados[rawStatus] || 0) + 1;

                // Calcular a linha real no arquivo original (fromLine é a linha do cabeçalho)
                // A primeira linha de dados é fromLine + 1
                const lineInFile = fromLine + result.linhas_total;
                const resRow = await processRow(row, lineInFile, uid);

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
                  result.linhas_gate++; // Linhas que passaram pelo Gate (total - ignoradas)

                  if (resRow.action === 'criada' || resRow.action === 'editada') {
                    if (resRow.action === 'criada') result.criadas++;
                    else result.atualizadas++;

                    // Verificar se houve falha no mapeamento de colaborador
                    const representante = row["CONSULTOR DE ONBOARDING"] || "";
                    if (representante && !result.nao_mapeados.includes(representante)) {
                      // Se processRow adicionou o item de erro de mapeamento, capturamos aqui
                      // Nota: No rules-engine, se não mapeado, itens.push("Sem responsável...")
                      // Aqui poderíamos checar o payload enviado mas resRow não retorna o payload
                      // Então confiamos no contador geral e amostra
                      // Para este requisito, se o representante for capturado e não estiver mapeado no sistema (usuarios/map)
                      // No rules-engine temos resolveCollaborator.
                    }

                    if (result.exemplos_de_pendencia.length < 5) {
                      result.exemplos_de_pendencia.push({
                        razao_social: row['Razão Social do Cliente'] || 'N/A',
                        status: rawStatus,
                        tipo: resRow.action,
                        // Notamos que não temos o array 'itens' aqui direto, mas o processRow logou
                        // Para simplificar, registramos a ocorrência
                      });
                    }
                  }
                }
              } catch (err: any) {
                console.error(`Error processing line ${result.linhas_total}:`, err);
                result.erros_processamento.push({
                  linha: result.linhas_total,
                  cliente: row['Razão Social do Cliente'] || 'N/A',
                  erro: err.message,
                  stack: err.stack?.substring(0, 200)
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
