import { adminDb, admin } from './firebase-admin';
import rulesJson from '../../src/config/rules_validacao_v1.json';
import collaboratorsJson from '../../src/config/colaboradores_map.json';
import aliasesJson from '../../src/config/column_aliases.json';

// Interfaces para tipagem
interface SyncResult {
  linhas_total: number;
  linhas_gate: number;
  linhas_com_pendencia: number;
  ignoradas_por_status: number;
  criadas: number;
  atualizadas: number;
  nao_mapeados: string[];
  amostras: string[];
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
 * Resolve o nome da coluna caso existam aliases
 */
function getCanonicalColumn(colName: string): string {
  const lowerCol = colName.trim().toLowerCase();
  for (const [canonical, aliases] of Object.entries(aliasesJson)) {
    if (aliases.some(a => a.toLowerCase() === lowerCol)) {
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
  const allowed = rulesJson.gate.allowed.map(s => s.toUpperCase());
  const status = (row[field] || "").toString().trim().toUpperCase();
  return allowed.includes(status);
}

/**
 * Avalia regras V1 e retorna lista de pendências
 */
export function evaluateRules(row: any): string[] {
  const itens: string[] = [];

  // 1. Required fields
  for (const field of rulesJson.required_fields) {
    if (!row[field] || row[field].toString().trim() === "") {
      itens.push(field);
    }
  }

  // 2. Conditional required
  for (const cond of rulesJson.conditional_required) {
    const triggerValue = (row[cond.if.field] || "").toString().trim().toUpperCase();
    const matches = cond.if.equals_any.some(v => v.toUpperCase() === triggerValue);

    if (matches) {
      for (const reqField of cond.then_require) {
        if ((!row[reqField] || row[reqField].toString().trim() === "") && !itens.includes(reqField)) {
          itens.push(reqField);
        }
      }
    }
  }

  // 3. Marketing block
  const marketingFields = rulesJson.marketing.fields;
  const anyMarketingEmpty = marketingFields.some(f => !row[f] || row[f].toString().trim() === "");
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
  // Gate
  if (!passesGate(row)) return { action: 'ignored_by_gate' };

  // Rules
  const itens = evaluateRules(row);
  
  // Resolve Collab
  const representante = row["Representante da Implantação"] || "";
  const { id: collabId, mapped } = resolveCollaborator(representante);
  
  if (!mapped) {
    itens.push("Sem responsável (mapear representante)");
  }

  // Se nada pendente, ignorar
  if (itens.length === 0) return { action: 'no_pendency' };

  // Fingerprint
  const fp = generateFingerprint(row);
  const docRef = adminDb.collection('pendencias').doc(fp);
  const docSnap = await docRef.get();
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
    atualizado_em: admin.firestore.FieldValue.serverTimestamp(),
    linha_planilha: lineNum,
    linha_csv: row,
    tipo_implantacao: row["Produto"] || "Saúde" // Fallback seguro
  };

  let action: 'criada' | 'editada' | 'sem_mudanca' = 'sem_mudanca';

  if (!docSnap.exists) {
    payload.criado_em = admin.firestore.FieldValue.serverTimestamp();
    await docRef.set(payload);
    action = 'criada';
  } else {
    // Verificar se houve mudança nos itens
    const oldItens = before?.itens_pendentes || [];
    const hasChanged = JSON.stringify(oldItens.sort()) !== JSON.stringify(itens.sort());
    
    if (hasChanged) {
      await docRef.update(payload);
      action = 'editada';
    } else {
      // Mesmo sem mudar itens, atualizamos timestamp e linha caso necessário, 
      // mas não registramos no histórico como mudança de conteúdo.
      await docRef.update({ 
        atualizado_em: admin.firestore.FieldValue.serverTimestamp(),
        linha_planilha: lineNum 
      });
      return { action: 'sem_mudanca', fp };
    }
  }

  // Registrar Histórico
  await docRef.collection('historico').add({
    acao: action,
    usuario_id: "SYSTEM_CSV",
    usuario_nome: "Sincronizador Automático (Vercel)",
    perfil: "system",
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    comentario: "Sincronização via processamento de CSV.",
    antes: before,
    depois: payload
  });

  return { action, fp };
}

/**
 * Função para limpar os nomes das colunas (remover trim, aspas e aplicar aliases)
 */
export function cleanRow(rawRow: any): any {
  const cleaned: any = {};
  for (const [key, value] of Object.entries(rawRow)) {
    const canonicalKey = getCanonicalColumn(key);
    cleaned[canonicalKey] = (value as string || "").toString().trim();
  }
  return cleaned;
}
