import { COLUMN_ALIASES as aliasesJson } from '../_config/column_aliases.js';

/**
 * Verifica se um valor é considerado vazio (null, undefined, "-", "", etc)
 * "SIM" e "NÃO" não são considerados vazios.
 */
function isEmpty(value: any): boolean {
  if (value === null || value === undefined) return true;
  const str = value.toString().trim();
  if (str === "" || str === "-" || str === "—" || str === "–") return true;
  return false;
}

/**
 * Normaliza strings para IDs e comparações (remover acentos, espaços, etc)
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
 * Avalia regras V1 e retorna lista de pendências
 */
export function evaluateRules(row: any): string[] {
  const itens: string[] = [];

  // 1. Required fields
  for (const field of (rulesJson.required_fields as string[])) {
    if (isEmpty(row[field])) {
      itens.push(field);
    }
  }

  // 2. Conditional required
  for (const cond of (rulesJson.conditional_required as any[])) {
    const triggerValue = (row[cond.if.field] || "").toString().trim().toUpperCase();
    const matches = (cond.if.equals_any as string[]).some(v => v.toUpperCase() === triggerValue);

    if (matches) {
      for (const reqField of (cond.then_require as string[])) {
        if (isEmpty(row[reqField]) && !itens.includes(reqField)) {
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

  return itens;
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
  
  // Extrair o ano da Vigência para filtrar (ignorar 2025 para baixo)
  const vigenciaStr = (row["Inicio da Vigência de Contrato"] || "").toString();
  const matchAno = vigenciaStr.match(/\b(20\d{2})\b/);
  if (matchAno) {
    const anoVigencia = parseInt(matchAno[1], 10);
    if (anoVigencia <= 2025) {
      console.log(`[Regra Data] Linha ignorada. Ano ${anoVigencia} <= 2025.`);
      return { action: 'ignored_by_year' };
    }
  }

  // Gate
  if (!passesGate(row)) return { action: 'ignored_by_gate' };

  // Rules
  const itens = evaluateRules(row);
  
  // Resolve Collab (Mudança para CONSULTOR DE ONBOARDING)
  const representante = row["CONSULTOR DE ONBOARDING"] || "";
  const { id: collabId, mapped } = resolveCollaborator(representante);
  
  if (!mapped) {
    itens.push("Sem responsável (mapear consultor onboarding)");
  }

  // Se nada pendente, ignorar
  if (itens.length === 0) {
    return { action: 'no_pendency' };
  }

  // Fingerprint
  const fp = generateFingerprint(row);
  const docRef = db.collection('pendencias').doc(fp);
  
  console.log(`[Firestore] Verificando documento: pendencias/${fp}`);
  const docSnap = await docRef.get().catch(e => {
    console.error(`[Firestore] Falha ao ler documento ${fp}:`, e.message);
    throw e;
  });
  
  const before = docSnap.exists ? docSnap.data() : null;

  const texto = `Pendências identificadas: ${itens.join(', ')}. Favor regularizar e atualizar.`;
  
  const payload: any = {
    fingerprint: fp,
    razao_social: row["Razão Social do Cliente"] || "N/A",
    produto: row["Produto"] || "N/A",
    data_vigencia: row["Inicio da Vigência de Contrato"] || "N/A",
    status: "Pendente",
    prioridade: "Media",
    origem: "Automatica",
    isDeleted: false,
    itens_pendentes: itens,
    pendencias: itens, // Alias para frontend
    texto_pendencia: texto,
    colaborador_id: collabId,
    colaborador_nome: representante,
    atualizado_em: FieldValue.serverTimestamp(),
    linha_planilha: lineNum,
    linha_csv: row,
    tipo_implantacao: row["Produto"] || "Saúde" // Fallback seguro
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
    const hasChanged = JSON.stringify(oldItens.sort()) !== JSON.stringify(itens.sort());
    
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
      return { action: 'sem_mudanca', fp };
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
    // Não lançamos erro aqui para não invalidar a criação do doc principal, 
    // mas logamos o erro crítico.
  });

  return { action, fp };
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
