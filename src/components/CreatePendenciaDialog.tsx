import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { Pendencia, Prioridade, TipoImplantacao } from "@/types/pendencia";
import { Badge } from "@/components/ui/badge";

interface CreatePendenciaDialogProps {
  colaboradores: string[];
  onSubmit: (data: Omit<Pendencia, "id" | "historico" | "ultima_atualizacao" | "status" | "origem" | "pendencias" | "fingerprint">) => void;
}

export function CreatePendenciaDialog({ colaboradores, onSubmit }: CreatePendenciaDialogProps) {
  const [open, setOpen] = useState(false);
  const [colaborador, setColaborador] = useState("");
  const [texto, setTexto] = useState("");
  const [dataVigencia, setDataVigencia] = useState("");
  const [prioridade, setPrioridade] = useState<Prioridade>("Média");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [linhaPlanilha, setLinhaPlanilha] = useState("");
  const [tipoImplantacao, setTipoImplantacao] = useState<TipoImplantacao | "">("");
  const [erros, setErros] = useState<string[]>([]);
  const [novoErro, setNovoErro] = useState("");

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddErro();
    }
  };

  const isValid = colaborador && texto && dataVigencia && razaoSocial && linhaPlanilha && tipoImplantacao && erros.length > 0;

  const handleSubmit = () => {
    if (!isValid) return;
    onSubmit({
      colaborador,
      texto_pendencia: texto,
      data_vigencia: dataVigencia,
      prioridade,
      razao_social: razaoSocial,
      linha_planilha: parseInt(linhaPlanilha, 10),
      tipo_implantacao: tipoImplantacao as TipoImplantacao,
      erros,
    });
    resetForm();
    setOpen(false);
  };

  const resetForm = () => {
    setColaborador("");
    setTexto("");
    setDataVigencia("");
    setPrioridade("Média");
    setRazaoSocial("");
    setLinhaPlanilha("");
    setTipoImplantacao("");
    setErros([]);
    setNovoErro("");
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Nova Pendência
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar Pendência Manual</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Colaborador *</label>
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
            <label className="text-sm font-medium text-foreground mb-1 block">Razão Social *</label>
            <Input
              value={razaoSocial}
              onChange={(e) => setRazaoSocial(e.target.value)}
              placeholder="Ex: Empresa ABC Saúde Ltda"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Linha da Planilha *</label>
              <Input
                type="number"
                min={1}
                value={linhaPlanilha}
                onChange={(e) => setLinhaPlanilha(e.target.value)}
                placeholder="Ex: 152"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Tipo de Implantação *</label>
              <Select value={tipoImplantacao} onValueChange={(v) => setTipoImplantacao(v as TipoImplantacao)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Saúde">Saúde</SelectItem>
                  <SelectItem value="Odonto">Odonto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Data de Vigência *</label>
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

          {/* Erros / Inconsistências */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Erros / Inconsistências *</label>
            <div className="flex gap-2">
              <Input
                value={novoErro}
                onChange={(e) => setNovoErro(e.target.value)}
                onKeyDown={handleKeyDown}
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
            <label className="text-sm font-medium text-foreground mb-1 block">Resumo + Ação Recomendada *</label>
            <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Descreva o resumo da pendência e a ação recomendada..." rows={3} />
          </div>

          <Button onClick={handleSubmit} className="w-full" disabled={!isValid}>
            Criar Pendência
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
