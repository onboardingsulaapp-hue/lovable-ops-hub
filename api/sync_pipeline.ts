import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore, verifyFirebaseIdToken } from './_utils/firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';
import { cleanRow } from './_utils/rules-engine.js';
import { getCsvHeaderOffset } from './_utils/csv-helper.js';
import { parse } from 'csv-parse/sync';
import Busboy from 'busboy';

export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Normaliza strings para comparação robusta e caminhos de documentos seguros
 */
const normalize = (s: string) => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/\//g, "_") : "";

const ALLOWED_STATUSES = [
  "EM CURSO - OPERACAO",
  "EM CURSO - CLIENTE / CORRETORA",
  "IMPLANTACAO FUTURA"
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Método não permitido' });
    }

    // 1. Validar Autenticação
    let uid: string;
    try {
        uid = await verifyFirebaseIdToken(req.headers.authorization);
    } catch (error: any) {
        return res.status(401).json({ ok: false, error: 'Não autorizado' });
    }

    const db = getFirestore();
    const busboy = Busboy({ headers: req.headers });

    return new Promise((resolve) => {
      busboy.on('file', (name, file) => {
        const chunks: any[] = [];
        file.on('data', (chunk) => chunks.push(chunk));
        
        file.on('end', async () => {
          try {
            const buffer = Buffer.concat(chunks);
            let csvText = buffer.toString('utf-8');
            if (csvText.includes('\uFFFD')) csvText = buffer.toString('latin1');

            const fromLine = await getCsvHeaderOffset(csvText);
            const records = parse(csvText, {
              columns: true,
              skip_empty_lines: true,
              trim: true,
              bom: true,
              relax_column_count: true,
              from_line: fromLine,
              delimiter: [',', ';'] // Suporte a vírgula e ponto e vírgula
            });

            const source = req.query.source || 'tradicional'; 
            const seenFingerprints = new Set<string>();
            const collection = db.collection('pipeline_volumetria');
            let countProcessed = 0;
            let countIgnoredStatus = 0;
            let countIgnoredYear = 0;
            const ignoredEx: any[] = [];
            let rowIndex = 0;
            
            // Usar um contador de operações para o batch principal
            let currentBatch = db.batch();
            let opCount = 0;

            for (const rawRow of records) {
              rowIndex++;
              const row = cleanRow(rawRow);
              
              const getValueByKeyword = (keywords: string[]) => {
                const entry = Object.entries(row).find(([key]) => {
                  const normKey = normalize(String(key));
                  return keywords.some(kw => normKey.includes(kw));
                });
                return entry ? entry[1] : null;
              };

              const rawStatus = getValueByKeyword(["STATUS", "SITUACAO", "FASE", "ETAPA"]) || "";
              const normalizedStatus = normalize(String(rawStatus));

              // Regra Estrita de Status: Se tiver "CONCLUIDA" ou "CONCLUIDO", ignora 100%
              if (normalizedStatus.includes("CONCLUIDA") || normalizedStatus.includes("CONCLUIDO") || normalizedStatus.includes("COMPLETA")) {
                countIgnoredStatus++;
                continue;
              }

              const isDeclinada = normalizedStatus.includes("DECLINADA") || normalizedStatus.includes("CANCELADA");
              const isAtivo = normalizedStatus.includes("CURSO") || 
                              normalizedStatus.includes("OPERACAO") || 
                              normalizedStatus.includes("ANDAMENTO") ||
                              normalizedStatus.includes("FUTURA") || 
                              normalizedStatus.includes("IMPLANTACAO") ||
                              normalizedStatus.includes("CLIENTE") || 
                              normalizedStatus.includes("CORRETORA");

              if (isDeclinada || !isAtivo) {
                countIgnoredStatus++;
                continue;
              }

              const rawVigencia = getValueByKeyword(["VIGENCIA", "CONTRATO"]) || "";
              const strVigencia = normalize(String(rawVigencia));
              const yearMatch = strVigencia.match(/\d{4}/);
              const year = yearMatch ? parseInt(yearMatch[0]) : 0;

              const isEmCursoExplicit = normalizedStatus.includes("CURSO") || normalizedStatus.includes("OPERACAO");
              if (year > 0 && year < 2026 && !isEmCursoExplicit) {
                countIgnoredYear++;
                continue;
              }

              const razao = getValueByKeyword(["RAZAO SOCIAL", "CLIENTE", "EMPRESA"]) || "N/A";
              const produto = getValueByKeyword(["PRODUTO"]) || "N/A";
              
              // Busca ESTRITA: Apenas na coluna CONSULTOR DE ONBOARDING
              const consultor = getValueByKeyword(["CONSULTOR DE ONBOARDING"]);
              
              if (!consultor || String(consultor).trim() === "" || String(consultor).trim() === "-") continue;
              
              const consultorTrim = String(consultor).trim().toUpperCase();
              const blacklist = ["LEGADO", "DECLINADO", "PENDENTE", "N/A", "N/H", "NH", "LIXO", "TESTE"];
              const isBlacklisted = blacklist.some(b => consultorTrim === b || consultorTrim.includes(`*${b}*`));
              const isIdTecnico = consultorTrim.length > 20 && /[0-9]/.test(consultorTrim);

              if (isBlacklisted || isIdTecnico) continue;

              const uniqueKey = `${normalize(String(razao))}_${normalize(String(produto))}_${strVigencia}_${rowIndex}`;
              const fp = `vol_${source}_${uniqueKey}`.substring(0, 240);
              seenFingerprints.add(fp);

              const docRef = collection.doc(fp);
              currentBatch.set(docRef, {
                razao_social: String(razao),
                produto: String(produto),
                consultor: consultorTrim,
                status_pipeline: String(rawStatus),
                status_normalizado: normalizedStatus,
                origem: source,
                data_vigencia: String(rawVigencia),
                updated_at: FieldValue.serverTimestamp(),
                last_sync_by: uid
              }, { merge: true });

              countProcessed++;
              opCount++;

              if (opCount >= 450) {
                await currentBatch.commit();
                currentBatch = db.batch();
                opCount = 0;
              }
            }

            if (opCount > 0) {
              await currentBatch.commit();
            }

            // Snapshot Seletivo: Remover apenas o que for da mesma ORIGEM e não estiver no CSV
            const allDocs = await collection.where('origem', '==', source).get();
            let deleteBatch = db.batch();
            let deleteCount = 0;
            let currentDelCount = 0;

            for (const doc of allDocs.docs) {
              if (!seenFingerprints.has(doc.id)) {
                deleteBatch.delete(doc.ref);
                deleteCount++;
                currentDelCount++;
                
                if (currentDelCount >= 450) {
                  await deleteBatch.commit();
                  deleteBatch = db.batch();
                  currentDelCount = 0;
                }
              }
            }

            if (currentDelCount > 0) {
              await deleteBatch.commit();
            }

            res.status(200).json({ 
              ok: true, 
              processed: countProcessed, 
              deleted: deleteCount,
              ignored: { status: countIgnoredStatus, year: countIgnoredYear, examples: ignoredEx },
              total_active: seenFingerprints.size
            });
            resolve(true);

          } catch (err: any) {
            console.error('Pipeline Sync Error:', err);
            res.status(500).json({ ok: false, error: err.message });
            resolve(false);
          }
        });
      });

      req.pipe(busboy);
    });

  } catch (err: any) {
    console.error('Global Error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
