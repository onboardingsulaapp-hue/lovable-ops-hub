export type Status = "Pendente" | "Corrigida" | "OK" | "Ignorada";
export type Prioridade = "Baixa" | "Média" | "Alta";
export type Origem = "Automático" | "Manual";
export type TipoImplantacao = "Saúde" | "Odonto";
export type UserRole = "admin" | "colaborador" | "socio";

export interface HistoricoAcao {
  id: string;
  acao: string;
  usuario_id: string;
  usuario_nome: string;
  perfil: string;
  timestamp: string; // ISO string para facilitar renderização
  comentario?: string;
  antes?: any;
  depois?: any;
}

export interface AdminLog {
  id: string;
  acao: string;
  usuarioAdmin: string;
  dataHora: string;
  detalhes?: string;
}

export interface Pendencia {
  id: string; // id do documento = id da pendencia
  colaborador_id: string;
  colaborador_nome: string;
  data_vigencia: string;
  status: Status;
  prioridade: Prioridade;
  pendencias: string[]; // No Firebase: itens_pendentes
  texto_pendencia: string;
  comentario_colaborador?: string;
  origem: Origem;
  criado_em: string;
  atualizado_em: string;
  historico: HistoricoAcao[];
  razao_social: string;
  linha_planilha: number;
  tipo_implantacao: TipoImplantacao;
  fingerprint: string;
  erros: string[];
  isDeleted?: boolean; // Podemos usar Ignorada em vez disso
}

export interface User {
  id: string; // O ID do documento será o email do usuário no pre_cadastro ou o UID no usuarios
  nome: string;
  email: string;
  role: UserRole; // Mapeado para 'role' no Firestore
  status: "ativo" | "inativo"; // Mapeado para 'status' (string) no Firestore
  uid?: string;
  criado_em?: any;
  atualizado_em?: any;
}

