import { VercelRequest, VercelResponse } from '@vercel/node';
import { admin, getFirestore } from '../_utils/firebase-admin.js';
import { cleanRow, processRow } from '../_utils/rules-engine.js';
import { parse } from 'csv-parse/sync';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Verificar autorização via CRON_SECRET
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Cron Secret' });
  }

  try {
    const adminDb = getFirestore();
    
    // 2. Buscar 1 job pendente (queued)
    const jobsRef = adminDb.collection('jobs');
    const q = await jobsRef
      .where('tipo', '==', 'sync_pendencias_csv')
      .where('status', '==', 'queued')
      .orderBy('requested_at', 'asc')
      .limit(1)
      .get();

    if (q.empty) {
      return res.status(200).json({ message: 'No queued jobs found' });
    }

    const jobDoc = q.docs[0];
    const jobId = jobDoc.id;
    const jobData = jobDoc.data();
    const blobUrl = jobData.file?.url;
    const requestedBy = jobData.requested_by;

    if (!blobUrl) {
        throw new Error(`Job ${jobId} has no file URL`);
    }

    // 3. Marcar como 'running'
    await jobDoc.ref.update({
      status: 'running',
      started_at: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`[Worker] Processing Job ${jobId} with URL ${blobUrl}`);

    // 4. Baixar e Parsear o CSV
    const response = await fetch(blobUrl);
    if (!response.ok) throw new Error(`Failed to download blob: ${response.statusText}`);
    const csvContent = await response.text();

    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: true
    });

    // 5. Processar Linhas
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

    for (const rawRow of records) {
        result.linhas_total++;
        const row = cleanRow(rawRow);
        
        try {
          const resRow = await processRow(row, result.linhas_total, requestedBy);
          
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

    // 6. Sucesso
    await jobDoc.ref.update({
      status: 'success',
      result,
      finished_at: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`[Worker] Job ${jobId} completed successfully.`);
    return res.status(200).json({ jobId, status: 'success', result });

  } catch (error: any) {
    console.error('[Worker] Fatal Error:', error);
    
    // Tentar marcar o job como falho (se possível)
    try {
        const adminDb = getFirestore();
        const jobsRef = adminDb.collection('jobs');
        const q = await jobsRef
          .where('tipo', '==', 'sync_pendencias_csv')
          .where('status', '==', 'running')
          .limit(1)
          .get();
          
        if (!q.empty) {
            await q.docs[0].ref.update({
                status: 'failed',
                error: error.message,
                finished_at: admin.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (e) {}

    return res.status(500).json({ error: error.message });
  }
}
