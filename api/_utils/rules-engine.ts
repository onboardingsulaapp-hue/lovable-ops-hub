import { COLUMN_ALIASES as aliasesJson } from '../_config/column_aliases.js';
import { RULES_VALIDACAO_V1 as rulesJson } from '../_config/rules_validacao_v1.js';
import { COLAB_MAP as collaboratorsJson } from '../_config/colaboradores_map.js';
import { getFirestore } from '../_utils/firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';

/**
 * Verifica se um valor é considerado vazio (null, undefined, "-", "", etc)
 * "SIM" e "NÃO" não são considerados vazios.
 */
function isEmpty(value: any): boolean {
  if (value === null || value === undefined) return true;
  const str = value.toString().trim().toUpperCase();
  const emptyMarkers = ["", "-", "—", "–", "N/A", "PENDENTE", "A DEFINIR", "...", "N.A"];
  return emptyMarkers.includes(str);
}

/**
 * Normalização robusta para campos de seleção (Remover acentos, espaços extras, uppercase)
 */
function normalizeSelect(value: any): string {
  if (value === null || value === undefined) return "";
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Normaliza strings para IDs e comparações simples (sem uppercase)
 */
function normalize(text: string): string {
  if (!text) return 'vazio';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

/**
 * Normaliza nomes de colaboradores para busca no mapeamento
 */
function normalizeCollabName(name: string): string {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Normalização robusta para comparação (remove acentos, espaços extras e uppercase)
 */
function compareNormalize(text: string): string {
  if (!text) return '';
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Converte string de data (DD/MM/YYYY ou YYYY-MM-DD) em objeto Date
 */
function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const clean = dateStr.trim();
  
  // Formato brasileiro DD/MM/YYYY
  const brMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) {
    const day = parseInt(brMatch[1], 10);
    const month = parseInt(brMatch[2], 10) - 1;
    const year = parseInt(brMatch[3], 10);
    const d = new Date(year, month, day);
    // Validar se a data é real (ex: evitar 31/02)
    if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
      return d;
    }
  }
  
  // Formato ISO YYYY-MM-DD
  const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const d = new Date(clean);
    if (!isNaN(d.getTime())) return d;
  }
  
  return null;
}

/**
 * Resolve o nome da coluna caso existam aliases
 */
function getCanonicalColumn(colName: string): string {
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const inputNorm = norm(colName);
  
  for (const [canonical, aliases] of Object.entries(aliasesJson)) {
    if (norm(canonical) === inputNorm) return canonical;
    if ((aliases as string[]).some(a => norm(a) === inputNorm)) {
      return canonical;
    }
  }
  return colName.trim();
}

/**
 * Gera o fingerprint (ID do documento)
 */
export function generateFingerprint(row: any): string {
  const razao = normalize(row["Razão Social do Cliente"]);
  const produto = normalize(row["Produto"]);
  const vigencia = normalize(row["Inicio da Vigência de Contrato"]);
  return `${razao}__${produto}__${vigencia}`.substring(0, 250);
}

/**
 * Verifica se a linha passa pelo Gate
 */
export function passesGate(row: any): boolean {
  const field = rulesJson.gate.field;
  const allowed = (rulesJson.gate.allowed as string[]).map(s => compareNormalize(s));
  const rawValue = (row[field] || "").toString();
  const status = compareNormalize(rawValue);
  
  const ok = allowed.includes(status);
  
  if (!ok) {
    console.log(`[Gate] Linha ignorada. Status: "${rawValue}" (normalizado: "${status}"). Esperados: ${JSON.stringify(allowed)}`);
  }
  
  return ok;
}

/**
 * Verifica se um valor está "Em Tratativa" (em andamento) —
 * campos com esses valores não geram pendência condicional.
 */
function isInProgress(value: any): boolean {
  if (!value) return false;
  const valNorm = normalizeSelect(value);
  const progressValues = ((rulesJson as any).in_progress_values as string[] || []).map(v => normalizeSelect(v));
  // Adicionar variações comuns se não estiverem no JSON
  if (!progressValues.includes("EM TRATATIVA")) progressValues.push("EM TRATATIVA");
  if (!progressValues.includes("EM TRATATIVAS")) progressValues.push("EM TRATATIVAS");
  if (!progressValues.includes("TRATATIVA")) progressValues.push("TRATATIVA");
  if (!progressValues.includes("TRATATIVAS")) progressValues.push("TRATATIVAS");
  
  return progressValues.includes(valNorm);
}

// ============================================================
// CONSTANTES DE ADITIVO
// Campos que definem a regra especial de "Aditivo Em Tratativa"
// ============================================================
const ADITIVO_TRIGGER_FIELD = "Houve pedido de Aditivo";
const ADITIVO_FINALIZADO_FIELD = "Adtivo Finalizado ?";
const ADITIVO_PENDENCY_FIELDS = [
  "Data do pedido de Aditivo",
  "Data da Assinatura do Aditivo",
  "Adtivo Finalizado ?",
];

function isAditivoEmTratativa(row: any): { isTratativa: boolean, triggerVal: string, finalizadoVal: string } {
  const triggerVal = row[ADITIVO_TRIGGER_FIELD];
  const triggerNorm = normalizeSelect(triggerVal);
  
  if (triggerNorm !== "SIM") {
    return { isTratativa: false, triggerVal, finalizadoVal: "" };
  }

  const finalizadoVal = row[ADITIVO_FINALIZADO_FIELD];
  const finalizadoNorm = normalizeSelect(finalizadoVal);
  
  const isTratativa = isInProgress(finalizadoVal);
  
  return { 
    isTratativa,
    triggerVal,
    finalizadoVal
  };
}

/**
 * Avalia regras V1 e retorna:
 * - itens: campos com pendência real
 * - emTratativa: campos genéricos em andamento
 * - aditivoEmTratativa: flag específica — bloco de aditivo está em tratativa
 */
export function evaluateRules(row: any): {
  itens: string[];
  emTratativa: string[];
  aditivoEmTratativa: boolean;
  aditivoSim: boolean;
  aditivoFinalizadoVal: string;
} {
  try {
    const itens: string[] = [];
    const emTratativa: string[] = [];

    // 1. Required fields
    for (const field of (rulesJson.required_fields as string[])) {
      if (isEmpty(row[field])) {
        itens.push(field);
      }
    }

    // 2. Conditional required fields
    const { isTratativa: aditivoETratativa, finalizadoVal, triggerVal } = isAditivoEmTratativa(row);
    const aditivoSim = normalizeSelect(triggerVal) === "SIM";
    const triggerNorm = normalizeSelect(row[ADITIVO_TRIGGER_FIELD]);

    for (const cond of (rulesJson.conditional_required as any[])) {
      const actualValue = normalizeSelect(row[cond.if.field]);
      const triggerValues = (cond.if.equals_any as string[]).map(v => normalizeSelect(v));

      if (triggerValues.includes(actualValue)) {
        // Regra especial: bloco de Aditivo + "EM TRATATIVA"
        if (cond.if.field === ADITIVO_TRIGGER_FIELD && aditivoETratativa) {
          // Adicionamos aos "avisos" para visibilidade
          for (const reqField of (cond.then_require as string[])) {
            if (!emTratativa.includes(reqField)) emTratativa.push(reqField);
          }
          continue;
        }
        for (const reqField of (cond.then_require as string[])) {
          const fieldValue = row[reqField];
          // Campo genérico "Em Tratativa"
          if (isInProgress(fieldValue)) {
            if (!emTratativa.includes(reqField)) emTratativa.push(reqField);
            continue;
          }
          if (isEmpty(fieldValue) && !itens.includes(reqField)) {
            itens.push(reqField);
          }
        }
      }
    }

    // 3. Marketing block
    const marketingFields = rulesJson.marketing.fields as string[];
    const anyMarketingEmpty = marketingFields.some(f => isEmpty(row[f]));
    if (anyMarketingEmpty) {
      const mktName = rulesJson.marketing.pendencia_name_if_any_empty;
      if (!itens.includes(mktName)) {
        itens.push(mktName);
      }
    }

    return { 
      itens, 
      emTratativa, 
      aditivoEmTratativa: aditivoETratativa,
      aditivoSim,
      aditivoFinalizadoVal: finalizadoVal
    };
  } catch (error) {
    console.error("[rules-engine] Erro crítico ao avaliar regras:", error);
    // IMPORTANTE: Retornar algo que sinalize erro, para NÃO dar 'OK' automático
    throw error;
  }
}

/**
 * Upsert idempotente de um alerta de "Em Tratativa" na collection alertas
 */
async function upsertTratativaAlert(
  db: FirebaseFirestore.Firestore,
  fp: string,
  row: any,
  colaboradorNome: string,
  colaboradorId: string | null,
  emTratativa: string[],
  aditivoEmTratativa: boolean
) {
  console.log(`[Alertas] Iniciando upsert de alerta para fingerprint: ${fp}`);
  const alertId = `tratativa_${fp}`;
  const alertRef = db.collection("alertas").doc(alertId);
  const snap = await alertRef.get();
  const now = FieldValue.serverTimestamp();

  // Construir mensagem detalhada
  let mensagem = "";
  if (aditivoEmTratativa) {
    mensagem = "Aditivo em tratativa — pendências de aditivo suprimidas.";
  } else {
    mensagem = `Itens em tratativa identificados: ${emTratativa.join(", ")}.`;
  }

  const base = {
    tipo: "aditivo_em_tratativa", // Mantemos o tipo para compatibilidade com UI atual ou mudamos se necessário
    fingerprint: fp,
    razao_social: row["Razão Social do Cliente"] || "N/A",
    produto: row["Produto"] || "N/A",
    data_vigencia: row["Inicio da Vigência de Contrato"] || "N/A",
    colaborador_nome: colaboradorNome,
    colaborador_id: colaboradorId,
    status_empresa: row["Status da Empresa"] || "N/A",
    aditivo_status: aditivoEmTratativa ? "EM TRATATIVA" : "AVISO",
    mensagem,
    itens_em_tratativa: emTratativa,
    updated_at: now,
  };

  if (!snap.exists) {
    await alertRef.set({ ...base, resolved: false, created_at: now });
    console.log(`[Alertas] Alerta CRIADO com sucesso: ${alertId}`);
  } else {
    // Reativar o alerta se ele já existia (garantir que apareça na aba de alertas)
    await alertRef.update({ ...base, resolved: false });
    console.log(`[Alertas] Alerta ATUALIZADO (reativado) com sucesso: ${alertId}`);
  }
}

/**
 * Resolve colaborador_id
 */
export function resolveCollaborator(name: string): { id: string | null, mapped: boolean } {
  const normalized = normalizeCollabName(name);
  const uid = (collaboratorsJson as any)[normalized];
  
  if (uid && uid !== "PREENCHER_UID") {
    return { id: uid, mapped: true };
  }
  return { id: null, mapped: false };
}

/**
 * Processamento principal de uma linha
 */
export async function processRow(row: any, lineNum: number, adminUid: string) {
  const db = getFirestore();
  const cleanedRow = cleanRow(row);
  
  // Extrair a Vigência para filtrar (Permitir apenas >= 2026 e < hoje)
  const vigenciaStr = (cleanedRow["Inicio da Vigência de Contrato"] || "").toString();
  const dataVigencia = parseDate(vigenciaStr);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0); // Resetar horas para comparar apenas a data

  if (dataVigencia) {
    const anoVigencia = dataVigencia.getFullYear();
    
    // 1. Ignorar se for anterior a 2026
    if (anoVigencia <= 2025) {
      console.log(`[Regra Data] Linha ignorada. Ano ${anoVigencia} <= 2025.`);
      return { action: 'ignored_by_year' };
    }
    
    // 2. Ignorar se for hoje ou no futuro
    if (dataVigencia >= hoje) {
      console.log(`[Regra Data] Linha ignorada. Data ${vigenciaStr} >= Hoje (${hoje.toLocaleDateString('pt-BR')}).`);
      return { action: 'ignored_by_future' };
    }
  } else {
    // Fallback: Se não conseguir parsear a data completa, tenta capturar o ano por regex
    const matchAno = vigenciaStr.match(/\b(20\d{2})\b/);
    if (matchAno) {
      const anoVigencia = parseInt(matchAno[1], 10);
      if (anoVigencia <= 2025) {
        console.log(`[Regra Data] Linha ignorada (fallback ano). Ano ${anoVigencia} <= 2025.`);
        return { action: 'ignored_by_year' };
      }
    }
  }

  // Gate
  if (!passesGate(cleanedRow)) return { action: 'ignored_by_gate' };

  // Rules
  const { itens, emTratativa, aditivoEmTratativa, aditivoSim, aditivoFinalizadoVal } = evaluateRules(cleanedRow);

  // Resolve Collab (Mudança para CONSULTOR DE ONBOARDING)
  const representante = cleanedRow["CONSULTOR DE ONBOARDING"] || "";
  const { id: collabId, mapped } = resolveCollaborator(representante);

  if (!mapped && itens.length > 0) {
    itens.push("Sem responsável (mapear consultor onboarding)");
  }

  // Fingerprint (necessário antes do alerta e do upsert)
  const fp = generateFingerprint(cleanedRow);

  // ── ALERTA: Itens Em Tratativa / Aditivo ──────────────────────────
  if (aditivoEmTratativa || emTratativa.length > 0) {
    await upsertTratativaAlert(db, fp, cleanedRow, representante, collabId, emTratativa, aditivoEmTratativa).catch(e => {
      console.error(`[Alertas] Falha ao gravar alerta para ${fp}:`, e.message);
    });
  }

  // Se nada pendente e NADA em tratativa, tenta resolver pendência antiga
  if (itens.length === 0 && emTratativa.length === 0 && !aditivoEmTratativa) {
    try {
      // DESATIVADO TEMPORARIAMENTE PARA INVESTIGAÇÃO
      // await autoResolvePendency(db, fp);
      console.log(`[AutoResolve] Ignorado para ${fp} (desativado)`);
    } catch (e) {
      console.error(`[AutoResolve] Falha ao resolver ${fp}:`, e.message);
    }
  }

  // Se nada pendente real, mas pode haver tratativas/avisos, encerrar processamento da linha
  if (itens.length === 0) {
    return { action: 'no_pendency', aditivoEmTratativa, aditivoSim, aditivoFinalizadoVal };
  }

  const docRef = db.collection('pendencias').doc(fp);

  console.log(`[Firestore] Verificando documento: pendencias/${fp}`);
  const docSnap = await docRef.get().catch(e => {
    console.error(`[Firestore] Falha ao ler documento ${fp}:`, e.message);
    throw e;
  });

  const before = docSnap.exists ? docSnap.data() : null;

  // Remover itens de aditivo antigos (caso o doc já existia com eles e agora é Em Tratativa)
  const itensFinais = aditivoEmTratativa
    ? itens.filter(i => !ADITIVO_PENDENCY_FIELDS.includes(i))
    : itens;

  const texto = `Pendências identificadas: ${itensFinais.join(', ')}. Favor regularizar e atualizar.`;

  const payload: any = {
    fingerprint: fp,
    razao_social: cleanedRow["Razão Social do Cliente"] || "N/A",
    produto: cleanedRow["Produto"] || "N/A",
    data_vigencia: cleanedRow["Inicio da Vigência de Contrato"] || "N/A",
    status: "Pendente",
    prioridade: "Média",
    origem: "Automático",
    isDeleted: false,
    itens_pendentes: itensFinais,
    pendencias: itensFinais, // Alias para frontend
    itens_em_tratativa: emTratativa, // Campos em andamento — geram aviso, não pendência
    texto_pendencia: texto,
    colaborador_id: collabId,
    colaborador_nome: representante,
    atualizado_em: FieldValue.serverTimestamp(),
    linha_planilha: lineNum,
    linha_csv: cleanedRow,
    tipo_implantacao: (cleanedRow["Produto"] || "").toString().toUpperCase().includes("ODONTO") ? "Odonto" : "Saúde"
  };

  let action: 'criada' | 'editada' | 'sem_mudanca' = 'sem_mudanca';

  if (!docSnap.exists) {
    payload.criado_em = FieldValue.serverTimestamp();
    console.log(`[Firestore] Criando novo documento: ${fp}`);
    await docRef.set(payload).catch(e => {
      console.error(`[Firestore] Falha ao criar documento ${fp}:`, e.message);
      throw e;
    });
    action = 'criada';
  } else {
    // Verificar se houve mudança nos itens
    const oldItens = before?.itens_pendentes || [];
    const hasChanged = JSON.stringify([...oldItens].sort()) !== JSON.stringify([...itensFinais].sort());

    if (hasChanged) {
      console.log(`[Firestore] Atualizando documento (mudança detectada): ${fp}`);
      await docRef.update(payload).catch(e => {
        console.error(`[Firestore] Falha ao atualizar documento ${fp}:`, e.message);
        throw e;
      });
      action = 'editada';
    } else {
      console.log(`[Firestore] Documento sem mudanças de itens, atualizando metadados: ${fp}`);
      await docRef.update({
        atualizado_em: FieldValue.serverTimestamp(),
        linha_planilha: lineNum
      }).catch(e => {
        console.error(`[Firestore] Falha ao atualizar metadados ${fp}:`, e.message);
        throw e;
      });
      return { action: 'sem_mudanca', fp, aditivoEmTratativa, aditivoSim, aditivoFinalizadoVal };
    }
  }

  // Registrar Histórico
  console.log(`[Firestore] Registrando histórico para: ${fp}`);
  await docRef.collection('historico').add({
    acao: action,
    usuario_id: "SYSTEM_CSV",
    usuario_nome: "Sincronizador Automático (Vercel)",
    perfil: "system",
    timestamp: FieldValue.serverTimestamp(),
    comentario: "Sincronização via processamento de CSV.",
    antes: before,
    depois: payload
  }).catch(e => {
    console.error(`[Firestore] Falha ao registrar histórico para ${fp}:`, e.message);
  });

  return { 
    action, 
    fp, 
    aditivoEmTratativa, 
    aditivoSim, 
    aditivoFinalizadoVal 
  };
}

/**
 * Função para limpar os nomes das colunas (remover trim, aspas e aplicar aliases)
 */
export function cleanRow(rawRow: any): any {
  const cleaned: any = {};
  for (const [key, value] of Object.entries(rawRow)) {
    const trimmedKey = key.trim();
    // Ignorar colunas sem nome (vazias) que quebram o Firestore
    if (!trimmedKey) continue;
    
    const canonicalKey = getCanonicalColumn(trimmedKey);
    cleaned[canonicalKey] = (value as string || "").toString().trim();
  }
  return cleaned;
}
/**
 * Caso a linha do CSV esteja limpa, verifica se havia uma pendência aberta
 * e a marca como 'OK' automaticamente.
 */
async function autoResolvePendency(db: any, fp: string) {
  const docRef = db.collection('pendencias').doc(fp);
  const snap = await docRef.get();
  
  if (snap.exists) {
    const data = snap.data();
    if (data.status !== "OK" && !data.isDeleted) {
      console.log(`[AutoResolve] Resolvendo pendência para ${fp}`);
      await docRef.update({
        status: "OK",
        atualizado_em: FieldValue.serverTimestamp()
      });
      return true;
    }
  }
  return false;
}
