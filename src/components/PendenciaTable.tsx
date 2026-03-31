import { useState } from "react";
import { Pendencia, UserRole, Prioridade } from "@/types/pendencia";
import { StatusBadge, PrioridadeBadge } from "@/components/StatusBadge";
import { HistoricoPanel } from "@/components/HistoricoPanel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, RotateCcw, History, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

interface PendenciaTableProps {
  pendencias: Pendencia[];
  userRole: UserRole;
  userName: string;
  onUpdatePendencia: (id: string, updates: Partial<Pendencia>) => void;
}

export function PendenciaTable({ pendencias, userRole, userName, onUpdatePendencia }: PendenciaTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [corrigirDialogId, setCorrigirDialogId] = useState<string | null>(null);
  const [comentario, setComentario] = useState("");

  const handleMarcarCorrigida = (id: string) => {
    const now = new Date().toISOString();
    const pendencia = pendencias.find((p) => p.id === id);
    if (!pendencia) return;

    onUpdatePendencia(id, {
      status: "Corrigida",
      comentario_colaborador: comentario || undefined,
      ultima_atualizacao: now,
      historico: [
        ...pendencia.historico,
        {
          id: `h-${Date.now()}`,
          acao: "Status alterado para Corrigida",
          usuario: userName,
          dataHora: now,
          detalhes: comentario || undefined,
        },
      ],
    });
    setCorrigirDialogId(null);
    setComentario("");
    toast.success("Pendência marcada como corrigida!");
  };

  const handleValidar = (id: string) => {
    const now = new Date().toISOString();
    const pendencia = pendencias.find((p) => p.id === id);
    if (!pendencia) return;

    onUpdatePendencia(id, {
      status: "OK",
      ultima_atualizacao: now,
      historico: [
        ...pendencia.historico,
        { id: `h-${Date.now()}`, acao: "Status validado para OK", usuario: userName, dataHora: now },
      ],
    });
    toast.success("Correção validada!");
  };

  const handleReabrir = (id: string) => {
    const now = new Date().toISOString();
    const pendencia = pendencias.find((p) => p.id === id);
    if (!pendencia) return;

    onUpdatePendencia(id, {
      status: "Pendente",
      ultima_atualizacao: now,
      historico: [
        ...pendencia.historico,
        { id: `h-${Date.now()}`, acao: "Pendência reaberta", usuario: userName, dataHora: now },
      ],
    });
    toast.info("Pendência reaberta.");
  };

  const handleAlterarPrioridade = (id: string, prioridade: Prioridade) => {
    const now = new Date().toISOString();
    const pendencia = pendencias.find((p) => p.id === id);
    if (!pendencia) return;

    onUpdatePendencia(id, {
      prioridade,
      ultima_atualizacao: now,
      historico: [
        ...pendencia.historico,
        { id: `h-${Date.now()}`, acao: `Prioridade alterada para ${prioridade}`, usuario: userName, dataHora: now },
      ],
    });
    toast.success(`Prioridade alterada para ${prioridade}.`);
  };

  return (
    <>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-10"></TableHead>
              <TableHead className="text-xs font-semibold">ID</TableHead>
              {userRole === "admin" && <TableHead className="text-xs font-semibold">Colaborador</TableHead>}
              <TableHead className="text-xs font-semibold">Vigência</TableHead>
              <TableHead className="text-xs font-semibold">Status</TableHead>
              <TableHead className="text-xs font-semibold">Prioridade</TableHead>
              <TableHead className="text-xs font-semibold">Origem</TableHead>
              <TableHead className="text-xs font-semibold max-w-xs">Pendência</TableHead>
              <TableHead className="text-xs font-semibold">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendencias.length === 0 && (
              <TableRow>
                <TableCell colSpan={userRole === "admin" ? 9 : 8} className="text-center py-10 text-muted-foreground">
                  Nenhuma pendência encontrada.
                </TableCell>
              </TableRow>
            )}
            {pendencias.map((p) => (
              <>
                <TableRow key={p.id} className="hover:bg-muted/30 transition-colors">
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
                  {userRole === "admin" && <TableCell className="text-sm font-medium">{p.colaborador}</TableCell>}
                  <TableCell className="text-sm">{new Date(p.data_vigencia).toLocaleDateString("pt-BR")}</TableCell>
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
                  <TableCell className="text-sm max-w-xs truncate" title={p.texto_pendencia}>{p.texto_pendencia}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {userRole === "colaborador" && p.status === "Pendente" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCorrigirDialogId(p.id)}>
                          <Check className="h-3 w-3 mr-1" />
                          Corrigir
                        </Button>
                      )}
                      {userRole === "admin" && p.status === "Corrigida" && (
                        <>
                          <Button size="sm" className="h-7 text-xs" onClick={() => handleValidar(p.id)}>
                            <Check className="h-3 w-3 mr-1" />
                            Validar
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleReabrir(p.id)}>
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Reabrir
                          </Button>
                        </>
                      )}
                      {userRole === "admin" && p.status === "OK" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleReabrir(p.id)}>
                          <RotateCcw className="h-3 w-3 mr-1" />
                          Reabrir
                        </Button>
                      )}
                      {p.comentario_colaborador && (
                        <span title={p.comentario_colaborador}>
                          <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        </span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                {expandedId === p.id && (
                  <TableRow key={`${p.id}-detail`}>
                    <TableCell colSpan={userRole === "admin" ? 9 : 8} className="bg-muted/20 p-0">
                      <div className="grid md:grid-cols-2 gap-4 p-4">
                        <div className="space-y-2">
                          <h4 className="text-sm font-semibold text-foreground">Detalhes</h4>
                          <p className="text-sm text-foreground">{p.texto_pendencia}</p>
                          <div className="text-xs text-muted-foreground">
                            <strong>Campos pendentes:</strong> {p.pendencias.join(", ")}
                          </div>
                          {p.comentario_colaborador && (
                            <div className="mt-2 bg-primary/5 rounded-md p-3">
                              <p className="text-xs font-medium text-primary mb-1">Comentário do colaborador:</p>
                              <p className="text-sm text-foreground">{p.comentario_colaborador}</p>
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Última atualização: {new Date(p.ultima_atualizacao).toLocaleString("pt-BR")}
                          </p>
                        </div>
                        <HistoricoPanel historico={p.historico} />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
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
    </>
  );
}
