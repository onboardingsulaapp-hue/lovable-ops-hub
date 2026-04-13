import { VercelRequest, VercelResponse } from '@vercel/node';
import { admin, getFirestore, verifyFirebaseIdToken } from './_utils/firebase-admin.js';
import { cleanRow, processRow } from './_utils/rules-engine.js';
import { parse } from 'csv-parse';
import Busboy from 'busboy';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 1. Validar Autenticação (Firebase ID Token) através do helper centralizado
    let uid: string;
    try {
        uid = await verifyFirebaseIdToken(req.headers.authorization);
    } catch (error: any) {
        return res.status(error.status || 401).json({ error: error.message });
    }

    const adminDb = getFirestore();

    // 2. Setup do Job no Firestore
    const jobId = `job_${Date.now()}_direct`;
    const jobRef = adminDb.collection('jobs').doc(jobId);

    await jobRef.set({
      tipo: 'sync_pendencias_csv',
      status: 'running',
      requested_by: uid,
      requested_by_role: 'Admin',
      requested_at: admin.firestore.FieldValue.serverTimestamp(),
      started_at: admin.firestore.FieldValue.serverTimestamp(),
      file: {
        name: 'Direct Upload',
        size: parseInt(req.headers['content-length'] || '0'),
        contentType: 'text/csv'
      }
    });

    // 3. Processar Multipart Form Data
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
        const parser = file.pipe(parse({
          columns: true,
          skip_empty_lines: true,
          trim: true,
          bom: true,
          relax_column_count: true
        }));

        parser.on('data', async (rawRow) => {
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
        });

        parser.on('end', async () => {
          result.linhas_com_pendencia = result.criadas + result.atualizadas;

          await jobRef.update({
            status: 'success',
            result,
            finished_at: admin.firestore.FieldValue.serverTimestamp()
          });

          res.status(200).json({ jobId, status: 'success', result });
          resolve(true);
        });

        parser.on('error', async (err) => {
          console.error('Parsing Error:', err);
          await jobRef.update({
            status: 'failed',
            error: err.message,
            finished_at: admin.firestore.FieldValue.serverTimestamp()
          });
          res.status(500).json({ error: err.message });
          resolve(false);
        });
      });

      busboy.on('error', (err) => {
        console.error('Busboy Error:', err);
        res.status(400).json({ error: 'Multipart parsing failed' });
        resolve(false);
      });

      req.pipe(busboy);
    });
  } catch (err: any) {
    console.error('Global API Error:', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}
