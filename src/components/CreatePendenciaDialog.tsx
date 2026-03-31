import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus } from "lucide-react";
import { Pendencia, Prioridade } from "@/types/pendencia";

interface CreatePendenciaDialogProps {
  colaboradores: string[];
  onSubmit: (data: Omit<Pendencia, "id" | "historico" | "ultima_atualizacao" | "status" | "origem" | "pendencias">) => void;
}

export function CreatePendenciaDialog({ colaboradores, onSubmit }: CreatePendenciaDialogProps) {
  const [open, setOpen] = useState(false);
  const [colaborador, setColaborador] = useState("");
  const [texto, setTexto] = useState("");
  const [dataVigencia, setDataVigencia] = useState("");
  const [prioridade, setPrioridade] = useState<Prioridade>("Média");

  const handleSubmit = () => {
    if (!colaborador || !texto || !dataVigencia) return;
    onSubmit({
      colaborador,
      texto_pendencia: texto,
      data_vigencia: dataVigencia,
      prioridade,
    });
    setColaborador("");
    setTexto("");
    setDataVigencia("");
    setPrioridade("Média");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Nova Pendência
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Criar Pendência Manual</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Colaborador</label>
            <Select value={colaborador} onValueChange={setColaborador}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {colaboradores.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Data de Vigência</label>
            <Input type="date" value={dataVigencia} onChange={(e) => setDataVigencia(e.target.value)} />
          </div>
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
            <label className="text-sm font-medium text-foreground mb-1 block">Descrição da Pendência</label>
            <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Descreva a pendência..." rows={3} />
          </div>
          <Button onClick={handleSubmit} className="w-full" disabled={!colaborador || !texto || !dataVigencia}>
            Criar Pendência
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
