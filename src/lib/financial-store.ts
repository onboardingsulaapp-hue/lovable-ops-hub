import { collection, doc, getDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export interface AuditoriaFinanceiraItem {
  razao_social: string;
  particularidades: string;
  fatura: string;
  faturamento: string;
  linha_csv: number;
  planilha_origem: string;
  consultor_onboarding?: string;
  status?: "Em Aberto" | "Em Espera" | "Resolvido";
  mes_ano?: string;
  id?: string;
}

/**
 * Normaliza uma string removendo acentos e espaços extras para gerar IDs previsíveis
 */
export const normalizeId = (str: string) => {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
};

/**
 * Salva as pendências financeiras geradas a partir do cruzamento de planilhas.
 * Garante que status "Em Espera" não sejam sobrescritos acidentalmente.
 * @param pendencias Array de pendências encontradas no CSV.
 * @param mesAno Referência de mês/ano (ex: "06_2026") para compor a chave única.
 */
export const salvarPendenciasFinanceiras = async (pendencias: AuditoriaFinanceiraItem[], mesAno: string) => {
  if (!pendencias || pendencias.length === 0) return;

  const batch = writeBatch(db);
  const auditoriaRef = collection(db, "divergencias_financeiras");

  for (const item of pendencias) {
    // Chave única previsível: NomeEmpresa_MesAno
    const empresaNorm = normalizeId(item.razao_social);
    const docId = `${empresaNorm}_${mesAno}`;
    const itemRef = doc(auditoriaRef, docId);

    // Verifica o estado atual do documento no banco
    const docSnap = await getDoc(itemRef);

    let statusFinal = item.status || "Em Aberto";

    if (docSnap.exists()) {
      const dataAtual = docSnap.data();
      // Regra de Ouro do Merge: Não sobrescrever "Em Espera" e "Resolvido" (a menos que a lógica exija).
      // Se já está "Em Espera" no banco, mantemos "Em Espera".
      if (dataAtual.status === "Em Espera") {
        statusFinal = "Em Espera";
      }
      // Se estava "Resolvido", e apareceu de novo no CSV como pendente, volta para "Em Aberto".
    }

    batch.set(itemRef, {
      ...item,
      id: docId,
      status: statusFinal,
      mes_ano: mesAno,
      data_atualizacao: serverTimestamp()
    }, { merge: true });
  }

  // Executa as operações atômicas
  await batch.commit();
};

/**
 * Marca como "Resolvido" as pendências financeiras que não apareceram mais no novo cruzamento.
 * @param docIds Array de IDs dos documentos a serem resolvidos.
 */
export const resolverPendenciasFinanceiras = async (docIds: string[]) => {
  if (!docIds || docIds.length === 0) return;

  const batch = writeBatch(db);
  const auditoriaRef = collection(db, "divergencias_financeiras");

  for (const id of docIds) {
    const itemRef = doc(auditoriaRef, id);
    batch.update(itemRef, {
      status: "Resolvido",
      data_atualizacao: serverTimestamp()
    });
  }

  await batch.commit();
};
