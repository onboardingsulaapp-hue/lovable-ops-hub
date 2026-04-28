export interface Alerta {
  id: string;
  tipo: string;
  fingerprint: string;
  razao_social: string;
  produto: string;
  data_vigencia: string;
  colaborador_nome: string;
  colaborador_id: string | null;
  status_empresa: string;
  aditivo_status: string;
  mensagem: string;
  created_at: any;
  updated_at: any;
  itens_em_tratativa?: string[];
  resolved: boolean;
}
