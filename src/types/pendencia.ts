export type Status = "Pendente" | "Corrigida" | "OK" | "Ignorada" | "Em Espera";
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
  itens_em_tratativa?: string[]; // Campos condicionais "Em Tratativa" — aviso, não pendência
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

// ========================
// JOB (Fila de Tarefas)
// ========================
export type JobStatus = "queued" | "running" | "success" | "failed";
export type JobType = "sync_pendencias_csv";

export interface JobFileRef {
  path?: string;
  url?: string;
  pathname?: string;
  name?: string;
  size?: number;
  contentType?: string;
}

export interface SyncJobResult {
  linhas_total: number;
  linhas_gate: number;
  linhas_com_pendencia: number;
  ignoradas_por_status: number;
  criadas: number;
  atualizadas: number;
  nao_mapeados: string[];
  amostras: string[];
  status_unicos_encontrados?: Record<string, number>;
  exemplos_de_pendencia?: any[];
  exemplos_ignorados?: any[];
}

export interface Job {
  id: string;
  tipo: JobType;
  status: JobStatus;
  requested_by: string;
  requested_by_role: string;
  requested_at: any;
  file?: JobFileRef;
  params?: Record<string, any>;
  result?: SyncJobResult;
  error?: string;
  started_at?: any;
  finished_at?: any;
}


