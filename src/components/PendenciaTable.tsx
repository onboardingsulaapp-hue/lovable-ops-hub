import React, { useState } from "react";
import { Pendencia, UserRole, Prioridade } from "@/types/pendencia";
import { StatusBadge, PrioridadeBadge } from "@/components/StatusBadge";
import { HistoricoPanel } from "@/components/HistoricoPanel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Check, RotateCcw, MessageSquare, ChevronDown, ChevronUp, Building2, FileSpreadsheet, Fingerprint, Edit2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { ReabrirPendenciaDialog } from "./ReabrirPendenciaDialog";
import { EditPendenciaDialog } from "./EditPendenciaDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface PendenciaTableProps {
  pendencias: Pendencia[];
  userRole: UserRole;
  userName: string;
  onUpdatePendencia: (id: string, updates: Partial<Pendencia>) => void;
  onDeletePendencia?: (id: string, motivo: string) => void;
  colaboradores?: { id: string; nome: string }[];
}

export function PendenciaTable({ pendencias, userRole, userName, onUpdatePendencia, onDeletePendencia, colaboradores = [] }: PendenciaTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [corrigirDialogId, setCorrigirDialogId] = useState<string | null>(null);
  const [comentario, setComentario] = useState("");
  
  const [reabrirPendencia, setReabrirPendencia] = useState<Pendencia | null>(null);
  const [editPendencia, setEditPendencia] = useState<Pendencia | null>(null);

  const handleMarcarCorrigida = (id: string) => {
    onUpdatePendencia(id, {
      status: "Corrigida",
      comentario_colaborador: comentario || undefined,
    });
    setCorrigirDialogId(null);
    setComentario("");
    toast.success("Pendência marcada como corrigida!");
  };

  const handleValidar = (id: string) => {
    onUpdatePendencia(id, {
      status: "OK",
    });
    toast.success("Correção validada!");
  };

  const handleReabrirSubmit = (id: string, updates: Partial<Pendencia>, comentarioReabertura: string) => {
    onUpdatePendencia(id, {
      ...updates,
      status: "Pendente",
      comentario_colaborador: comentarioReabertura,
    });
    toast.info("Pendência reaberta com as novas edições.");
  };

  const handleEditSubmit = (id: string, updates: Partial<Pendencia>) => {
    onUpdatePendencia(id, updates);
    toast.success("Pendência atualizada.");
  };

  const handleAlterarPrioridade = (id: string, prioridade: Prioridade) => {
    onUpdatePendencia(id, { prioridade });
    toast.success(`Prioridade alterada para ${prioridade}.`);
  };

  const colSpan = userRole === "admin" ? 11 : 10;

  return (
    <>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#F7F8FA] border-b border-[#D9CDCD]">
                <TableHead className="w-10"></TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#737D9A]">ID</TableHead>
                {userRole === "admin" && <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#737D9A]">Colaborador</TableHead>}
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#737D9A]">Razão Social</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#737D9A]">Linha</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#737D9A]">Tipo</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#737D9A]">Vigência</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#737D9A]">Status</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#737D9A]">Prioridade</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#737D9A]">Origem</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider text-[#737D9A]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendencias.length === 0 && (
                <TableRow>
                  <TableCell colSpan={colSpan} className="text-center py-10 text-muted-foreground">
                    Nenhuma pendência encontrada nessa sessão.
                  </TableCell>
                </TableRow>
              )}
              {pendencias.map((p) => (
                <React.Fragment key={p.id}>
                  <TableRow className="hover:bg-[#E9ECF2] even:bg-[#F7F8FA]/50 transition-colors border-b border-[#D9CDCD]/50">
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                      >
                        {expandedId === p.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{p.id}</TableCell>
                    {userRole === "admin" && <TableCell className="text-sm font-medium">{p.colaborador_nome}</TableCell>}
                    <TableCell className="text-sm max-w-[160px] truncate" title={p.razao_social}>{p.razao_social}</TableCell>
                    <TableCell className="text-sm text-center">{p.linha_planilha}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {p.tipo_implantacao}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {(() => {
                        if (!p.data_vigencia) return "—";
                        
                        // Caso 1: Se for um Timestamp do Firebase (objeto com .seconds)
                        const val = p.data_vigencia as any;
                        if (val && typeof val === 'object' && 'seconds' in val) {
                          try {
                            return new Date(val.seconds * 1000).toLocaleDateString("pt-BR");
                          } catch {
                            return "Erro na data";
                          }
                        }

                        // Caso 2: Tenta criar o objeto Date a partir de string/number
                        const date = new Date(p.data_vigencia);
                        
                        // Se for válido, retorna formato BR
                        if (!isNaN(date.getTime())) {
                          return date.toLocaleDateString("pt-BR", { timeZone: 'UTC' });
                        }
                        
                        // Caso 3: Se falhou (Invalid Date), mas parece uma data BR (Ex: 01/04/2026)
                        if (typeof p.data_vigencia === 'string' && p.data_vigencia.includes('/')) {
                          return p.data_vigencia;
                        }

                        // Fallback: Se for objeto e chegou aqui, evita crash convertendo pra string
                        if (typeof p.data_vigencia === 'object') return JSON.stringify(p.data_vigencia);

                        return p.data_vigencia || "—";
                      })()}
                    </TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    <TableCell>
                      {userRole === "admin" ? (
                        <Select value={p.prioridade} onValueChange={(v) => handleAlterarPrioridade(p.id, v as Prioridade)}>
                          <SelectTrigger className="h-7 w-24 text-xs border-0 p-0">
                            <PrioridadeBadge prioridade={p.prioridade} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Baixa">Baixa</SelectItem>
                            <SelectItem value="Média">Média</SelectItem>
                            <SelectItem value="Alta">Alta</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <PrioridadeBadge prioridade={p.prioridade} />
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.origem}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {userRole === "colaborador" && p.status === "Pendente" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs flex-shrink-0" onClick={() => setCorrigirDialogId(p.id)}>
                            <Check className="h-3 w-3 mr-1" />
                            Registrar Correção
                          </Button>
                        )}
                        {userRole === "admin" && p.status === "Corrigida" && (
                          <Button size="sm" className="h-7 text-xs flex-shrink-0" onClick={() => handleValidar(p.id)}>
                            <Check className="h-3 w-3 mr-1" />
                            Validar Resolução
                          </Button>
                        )}
                        
                        {(userRole === "admin" || p.comentario_colaborador) && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 flex-shrink-0">
                                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              {userRole === "admin" && (p.status === "Corrigida" || p.status === "OK") && (
                                <DropdownMenuItem onClick={() => setReabrirPendencia(p)}>
                                  <RotateCcw className="h-4 w-4 mr-2" />
                                  Reabrir
                                </DropdownMenuItem>
                              )}
                              {userRole === "admin" && (
                                <DropdownMenuItem onClick={() => setEditPendencia(p)}>
                                  <Edit2 className="h-4 w-4 mr-2" />
                                  Editar / Excluir
                                </DropdownMenuItem>
                              )}
                              {p.comentario_colaborador && (
                                <DropdownMenuItem disabled className="text-muted-foreground">
                                  <MessageSquare className="h-4 w-4 mr-2" />
                                  Comentário incluído
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedId === p.id && (
                    <TableRow key={`${p.id}-detail`}>
                      <TableCell colSpan={colSpan} className="bg-[#F7F8FA] p-0 border-b border-[#D9CDCD]">
                        <div className="grid md:grid-cols-2 gap-8 p-8">
                          <div className="space-y-6">
                            <h4 className="text-xs font-bold text-[#1D2E5D] uppercase tracking-widest border-b border-[#D9CDCD] pb-2">Detalhes da Pendência</h4>

                            <div className="grid grid-cols-2 gap-y-4 text-sm">
                              <div className="flex items-center gap-2 text-[#737D9A]">
                                <Building2 className="h-4 w-4" />
                                <span className="font-bold uppercase text-[10px]">Razão Social:</span>
                              </div>
                              <span className="text-[#1D2E5D] font-medium">{p.razao_social}</span>

                              <div className="flex items-center gap-2 text-[#737D9A]">
                                <FileSpreadsheet className="h-4 w-4" />
                                <span className="font-bold uppercase text-[10px]">Linha:</span>
                              </div>
                              <span className="text-[#1D2E5D] font-medium">{p.linha_planilha}</span>

                              <span className="text-[#737D9A] font-bold uppercase text-[10px]">Tipo:</span>
                              <span className="text-[#1D2E5D] font-medium">{p.tipo_implantacao}</span>

                              <div className="flex items-center gap-2 text-[#737D9A]">
                                <Fingerprint className="h-4 w-4" />
                                <span className="font-bold uppercase text-[10px]">Fingerprint:</span>
                              </div>
                              <span className="text-[#1D2E5D] text-xs font-mono break-all">{p.fingerprint}</span>
                            </div>

                            {/* Erros */}
                            {p.erros && p.erros.length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold text-[#737D9A] mb-2 uppercase tracking-tight">Erros encontrados:</p>
                                <div className="flex flex-wrap gap-2">
                                  {p.erros.map((erro, i) => (
                                    <Badge key={i} variant="outline" className="text-[11px] font-semibold border-red-200 bg-red-50 text-red-700 rounded-sm">
                                      {erro}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Resumo */}
                            <div className="bg-white p-4 rounded-lg border border-[#D9CDCD] shadow-sm">
                              <p className="text-[10px] font-bold text-[#737D9A] mb-2 uppercase">Resumo / Ação recomendada:</p>
                              <p className="text-sm text-[#1D2E5D] leading-relaxed">{p.texto_pendencia}</p>
                            </div>

                            {p.comentario_colaborador && (
                              <div className="bg-[#EFF6FF] border-l-4 border-[#1D2E5D] p-4">
                                <p className="text-[10px] font-bold text-[#1D2E5D] mb-2 uppercase">Comentário do colaborador:</p>
                                <p className="text-sm text-[#1D2E5D] italic">"{p.comentario_colaborador}"</p>
                              </div>
                            )}

                            <p className="text-[10px] text-[#737D9A] font-bold uppercase font-mono">
                              Atualizado: {p.atualizado_em ? new Date(p.atualizado_em).toLocaleString("pt-BR") : "—"}
                            </p>
                          </div>
                          <HistoricoPanel pendenciaId={p.id} />
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={!!corrigirDialogId} onOpenChange={(open) => { if (!open) { setCorrigirDialogId(null); setComentario(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar como Corrigida</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              Confirme que a pendência foi corrigida. Adicione um comentário opcional explicando a correção.
            </p>
            <Textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Comentário opcional..."
              rows={3}
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setCorrigirDialogId(null); setComentario(""); }}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={() => corrigirDialogId && handleMarcarCorrigida(corrigirDialogId)}>
                Confirmar Correção
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      <ReabrirPendenciaDialog
        pendencia={reabrirPendencia}
        open={!!reabrirPendencia}
        onOpenChange={(v) => !v && setReabrirPendencia(null)}
        onSubmit={handleReabrirSubmit}
      />
      
      <EditPendenciaDialog
        pendencia={editPendencia}
        open={!!editPendencia}
        onOpenChange={(v) => !v && setEditPendencia(null)}
        onSubmit={handleEditSubmit}
        onDelete={(id, motivo) => onDeletePendencia && onDeletePendencia(id, motivo)}
        colaboradores={colaboradores}
        userRole={userRole}
      />
    </>
  );
}
