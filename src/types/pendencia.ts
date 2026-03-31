export type Status = "Pendente" | "Corrigida" | "OK";
export type Prioridade = "Baixa" | "Média" | "Alta";
export type Origem = "Automático" | "Manual";
export type TipoImplantacao = "Saúde" | "Odonto";
export type UserRole = "admin" | "colaborador";

export interface HistoricoAcao {
  id: string;
  acao: string;
  usuario: string;
  dataHora: string;
  detalhes?: string;
}

export interface AdminLog {
  id: string;
  acao: string;
  usuarioAdmin: string;
  dataHora: string;
  detalhes?: string;
}

export interface Pendencia {
  id: string;
  colaborador: string;
  data_vigencia: string;
  status: Status;
  prioridade: Prioridade;
  pendencias: string[];
  texto_pendencia: string;
  comentario_colaborador?: string;
  origem: Origem;
  ultima_atualizacao: string;
  historico: HistoricoAcao[];
  razao_social: string;
  linha_planilha: number;
  tipo_implantacao: TipoImplantacao;
  fingerprint: string;
  erros: string[];
  isDeleted?: boolean;
}

export interface User {
  id: string;
  nome: string;
  role: UserRole;
  status: "ativo" | "inativo";
}
