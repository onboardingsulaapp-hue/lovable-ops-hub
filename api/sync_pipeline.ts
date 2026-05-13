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
              from_line: fromLine
            });

            const source = req.query.source || 'tradicional'; // 'tradicional' ou 'nova'
            const seenFingerprints = new Set<string>();
            const batch = db.batch();
            const collection = db.collection('pipeline_volumetria');
            
            let countProcessed = 0;

            for (const rawRow of records) {
              const row = cleanRow(rawRow);
              const rawStatus = row['Status da Empresa'] || row['Status de Implantação'] || row['Status'] || '';
              const normalizedStatus = normalize(rawStatus);

              // 1. Validar Status
              const isAllowedStatus = ALLOWED_STATUSES.some(s => 
                normalizedStatus === s || 
                normalizedStatus.includes(s) || 
                s.includes(normalizedStatus)
              );
              
              if (!isAllowedStatus) continue;

              // 2. Validar Data (Apenas 2026 em diante, sem limite final)
              const rawVigencia = row['Inicio da Vigência de Contrato'] || row['Vigência'] || '';
              let isYearValid = true;
              if (rawVigencia) {
                // Tenta extrair o ano (formatos DD/MM/YYYY ou YYYY-MM-DD)
                const yearMatch = rawVigencia.match(/\d{4}/);
                if (yearMatch) {
                  const year = parseInt(yearMatch[0]);
                  if (year < 2026) isYearValid = false;
                }
              }

              if (isAllowedStatus && isYearValid) {
                const razao = row['Razão Social do Cliente'] || row['Cliente'] || 'N/A';
                const produto = row['Produto'] || 'N/A';
                const consultor = row['CONSULTOR DE ONBOARDING'] || row['Consultor'] || 'Sem Consultor';
                
                const fp = `vol_${normalize(razao)}__${normalize(produto)}`.substring(0, 240);
                seenFingerprints.add(fp);

                const docRef = collection.doc(fp);
                batch.set(docRef, {
                  razao_social: razao,
                  produto: produto,
                  consultor: consultor,
                  status_pipeline: rawStatus,
                  status_normalizado: normalizedStatus,
                  origem: source,
                  data_vigencia: rawVigencia,
                  updated_at: FieldValue.serverTimestamp(),
                  last_sync_by: uid
                }, { merge: true });

                countProcessed++;
              }
            }

            if (countProcessed > 0) {
              await batch.commit();
            }

            // Snapshot Seletivo: Remover apenas o que for da mesma ORIGEM e não estiver no CSV
            const allDocs = await collection.where('origem', '==', source).get();
            const deleteBatch = db.batch();
            let countDeleted = 0;

            allDocs.forEach(doc => {
              if (!seenFingerprints.has(doc.id)) {
                deleteBatch.delete(doc.ref);
                countDeleted++;
              }
            });

            if (countDeleted > 0) {
              await deleteBatch.commit();
            }

            res.status(200).json({ 
              ok: true, 
              processed: countProcessed, 
              deleted: countDeleted,
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
