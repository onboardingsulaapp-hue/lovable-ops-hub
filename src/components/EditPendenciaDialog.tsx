import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pendencia, Prioridade } from "@/types/pendencia";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Trash2 } from "lucide-react";

interface EditPendenciaDialogProps {
  pendencia: Pendencia | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (id: string, updates: Partial<Pendencia>) => void;
  onDelete: (id: string, motivo: string) => void;
}

export function EditPendenciaDialog({ pendencia, open, onOpenChange, onSubmit, onDelete }: EditPendenciaDialogProps) {
  const [texto, setTexto] = useState("");
  const [prioridade, setPrioridade] = useState<Prioridade>("Média");
  const [erros, setErros] = useState<string[]>([]);
  const [novoErro, setNovoErro] = useState("");
  
  // Para exclusão
  const [showDelete, setShowDelete] = useState(false);
  const [motivoDelete, setMotivoDelete] = useState("");

  useEffect(() => {
    if (open && pendencia) {
      setTexto(pendencia.texto_pendencia);
      setPrioridade(pendencia.prioridade);
      setErros([...pendencia.erros]);
      setNovoErro("");
      setShowDelete(false);
      setMotivoDelete("");
    }
  }, [open, pendencia]);

  const handleAddErro = () => {
    const trimmed = novoErro.trim();
    if (trimmed && !erros.includes(trimmed)) {
      setErros([...erros, trimmed]);
      setNovoErro("");
    }
  };

  const handleRemoveErro = (index: number) => {
    setErros(erros.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!pendencia) return;
    onSubmit(pendencia.id, { texto_pendencia: texto, prioridade, erros });
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (!pendencia || !motivoDelete.trim()) return;
    onDelete(pendencia.id, motivoDelete);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Pendência {pendencia?.id}</DialogTitle>
        </DialogHeader>

        {showDelete ? (
          <div className="space-y-4 mt-2 bg-destructive/10 p-4 rounded-md border border-destructive/20">
            <h4 className="font-semibold text-destructive">Atenção: Exclusão de Pendência</h4>
            <p className="text-sm">Você está prestes a excluir esta pendência. Essa ação requer um motivo e ficará registrada no Histórico de Auditoria.</p>
            
            <label className="text-sm font-medium block mt-4">Motivo da exclusão *</label>
            <Textarea 
              value={motivoDelete} 
              onChange={(e) => setMotivoDelete(e.target.value)} 
              placeholder="Descreva detalhadamente o motivo da exclusão..." 
              rows={3}
            />

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowDelete(false)}>Cancelar</Button>
              <Button variant="destructive" className="flex-1" disabled={!motivoDelete.trim()} onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                Confirmar Exclusão
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Prioridade</label>
              <Select value={prioridade} onValueChange={(v) => setPrioridade(v as Prioridade)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Baixa">Baixa</SelectItem>
                  <SelectItem value="Média">Média</SelectItem>
                  <SelectItem value="Alta">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Erros / Inconsistências</label>
              <div className="flex gap-2">
                <Input
                  value={novoErro}
                  onChange={(e) => setNovoErro(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddErro(); } }}
                  placeholder="Descreva o erro e pressione Enter"
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={handleAddErro} disabled={!novoErro.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {erros.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {erros.map((erro, i) => (
                    <Badge key={i} variant="secondary" className="flex items-center gap-1 text-xs">
                      {erro}
                      <button onClick={() => handleRemoveErro(i)} className="ml-1 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Texto da Pendência</label>
              <Textarea 
                value={texto} 
                onChange={(e) => setTexto(e.target.value)} 
                rows={3} 
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t gap-2">
              <Button variant="outline" className="text-destructive hover:bg-destructive/10" onClick={() => setShowDelete(true)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                <Button onClick={handleSubmit}>Salvar Alterações</Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
