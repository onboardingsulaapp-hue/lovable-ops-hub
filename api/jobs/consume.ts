import { VercelRequest, VercelResponse } from '@vercel/node';
import { getFirestore } from '../_utils/firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';
import { cleanRow, processRow } from '../_utils/rules-engine.js';
import { getCsvHeaderOffset } from '../_utils/csv-helper.js';
import { parse } from 'csv-parse/sync';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // 1. Verificar autorização via CRON_SECRET
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ 
        ok: false, 
        error: 'Unauthorized: Invalid Cron Secret',
        hint: 'O endpoint consume é protegido e deve ser chamado apenas pelo Vercel Cron ou com o CRON_SECRET correto.'
      });
    }

    const db = getFirestore();
    
    // 2. Buscar 1 job pendente (queued)
    const jobsRef = db.collection('jobs');
    const q = await jobsRef
      .where('tipo', '==', 'sync_pendencias_csv')
      .where('status', '==', 'queued')
      .orderBy('requested_at', 'asc')
      .limit(1)
      .get();

    if (q.empty) {
      return res.status(200).json({ ok: true, message: 'No queued jobs found' });
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
      started_at: FieldValue.serverTimestamp()
    });

    console.log(`[Worker] Processing Job ${jobId} with URL ${blobUrl}`);

    // 4. Baixar e Parsear o CSV
    const response = await fetch(blobUrl);
    if (!response.ok) throw new Error(`Failed to download blob: ${response.statusText}`);
    const buffer = Buffer.from(await response.arrayBuffer());

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

    // 5. Processar Linhas
    let result = {
        linhas_total: 0,
        linhas_gate: 0,
        linhas_com_pendencia: 0,
        ignoradas_por_status: 0,
        criadas: 0,
        atualizadas: 0,
        nao_mapeados: [] as string[],
        amostras: [] as string[],
        erros_processamento: [] as any[],
        // Diagnóstico de Aditivo Em Tratativa
        qtd_aditivo_sim: 0,
        qtd_aditivo_em_tratativa: 0,
        qtd_alertas_aditivo_tratativa: 0,
        valores_unicos_aditivo_finalizado: {} as Record<string, number>,
        exemplos_em_tratativa: [] as any[],
        exemplos_aditivo_sim_sem_finalizado: [] as any[],
        error_columns_missing: [] as string[]
    };

    // Verificar colunas obrigatórias para aditivo
    const requiredAditivo = ["Houve pedido de Aditivo", "Adtivo Finalizado ?"];
    if (records.length > 0) {
      const sample = records[0];
      for (const col of requiredAditivo) {
        if (!(col in sample)) result.error_columns_missing.push(col);
      }
    }

    for (const rawRow of records) {
        result.linhas_total++;
        const row = cleanRow(rawRow);
        
        try {
          // Calcular a linha real no arquivo original
          const lineInFile = fromLine + result.linhas_total;
          const resRow = await processRow(row, lineInFile, requestedBy);
          
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
          // Contabilizar alertas de aditivo (independente da ação principal)
          const res = resRow as any;
          if (res.aditivoSim) {
            result.qtd_aditivo_sim++;
            const fValRaw = res.aditivoFinalizadoVal || "";
            const fValNorm = fValRaw.trim().toUpperCase() || "(VAZIO)";
            result.valores_unicos_aditivo_finalizado[fValNorm] = (result.valores_unicos_aditivo_finalizado[fValNorm] || 0) + 1;
            
            if (!fValRaw && result.exemplos_aditivo_sim_sem_finalizado.length < 5) {
              result.exemplos_aditivo_sim_sem_finalizado.push({
                razao_social: row['Razão Social do Cliente'] || 'N/A',
                valor_cru: fValRaw
              });
            }
          }

          if (res.aditivoEmTratativa) {
            result.qtd_aditivo_em_tratativa++;
            result.qtd_alertas_aditivo_tratativa++; // Contabiliza cada vez que a regra é ativada
            
            if (result.exemplos_em_tratativa.length < 5) {
              result.exemplos_em_tratativa.push({
                razao_social: row['Razão Social do Cliente'] || 'N/A',
                valor_cru: res.aditivoFinalizadoVal,
                valor_normalizado: "EM TRATATIVA"
              });
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

    // 6. Sucesso
    // Converter valores_unicos para array top 10
    const top10 = Object.entries(result.valores_unicos_aditivo_finalizado)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    (result as any).valores_unicos_aditivo_finalizado = top10;

    await jobDoc.ref.update({
      status: result.erros_processamento.length > 0 && result.linhas_gate === 0 ? 'failed' : 'success',
      result,
      finished_at: FieldValue.serverTimestamp()
    });

    console.log(`[Worker] Job ${jobId} completed successfully.`);
    return res.status(200).json({ ok: true, jobId, status: 'success', result });

  } catch (error: any) {
    console.error('[Worker] Fatal Error:', error);
    
    return res.status(500).json({ 
        ok: false, 
        error: error.message,
        hint: 'Erro no processamento do worker. Verifique os logs da Vercel para detalhes do parsing CSV ou acesso ao Firestore.'
    });
  }
}
