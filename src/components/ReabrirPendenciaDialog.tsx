import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pendencia, Prioridade } from "@/types/pendencia";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";

interface ReabrirPendenciaDialogProps {
  pendencia: Pendencia | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (id: string, updates: Partial<Pendencia>, comentarioReabertura: string) => void;
}

export function ReabrirPendenciaDialog({ pendencia, open, onOpenChange, onSubmit }: ReabrirPendenciaDialogProps) {
  const [texto, setTexto] = useState("");
  const [prioridade, setPrioridade] = useState<Prioridade>("Média");
  const [erros, setErros] = useState<string[]>([]);
  const [novoErro, setNovoErro] = useState("");
  const [comentario, setComentario] = useState("");

  useEffect(() => {
    if (open && pendencia) {
      setTexto(pendencia.texto_pendencia);
      setPrioridade(pendencia.prioridade);
      setErros([...pendencia.erros]);
      setComentario("");
      setNovoErro("");
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

  const isValid = comentario.trim().length > 0;

  const handleSubmit = () => {
    if (!pendencia || !isValid) return;
    
    onSubmit(
      pendencia.id,
      { texto_pendencia: texto, prioridade, erros },
      comentario
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reabrir Pendência {pendencia?.id}</DialogTitle>
        </DialogHeader>

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

          <div className="pt-4 border-t">
            <label className="text-sm font-medium text-foreground mb-1 block text-destructive">
              Comentário de Reabertura (Obrigatório) *
            </label>
            <Textarea 
              value={comentario} 
              onChange={(e) => setComentario(e.target.value)} 
              placeholder="Explique o motivo da devolução ao colaborador..." 
              rows={3} 
              className={comentario.trim() ? "" : "border-destructive/50"}
            />
            <p className="text-xs text-muted-foreground mt-1">Este comentário ficará visível ao colaborador.</p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={!isValid}>Confirmar Reabertura</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
