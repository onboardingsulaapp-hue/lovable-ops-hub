import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Clock, Send } from "lucide-react";
import { Pendencia } from "@/types/pendencia";

interface SendEmailDialogProps {
  pendencias: Pendencia[];
  onConfirm: (prazo: number) => void;
}

export function SendEmailDialog({ pendencias, onConfirm }: SendEmailDialogProps) {
  const [open, setOpen] = useState(false);
  const [prazo, setPrazo] = useState<number | "">("");

  // Get distinct collaborators from the currently filtered pendencias
  const involvedCollaborators = Array.from(new Set(pendencias.map(p => p.colaborador_nome)));
  
  const handleConfirm = () => {
    if (typeof prazo !== "number" || prazo <= 0) return;
    onConfirm(prazo);
    setOpen(false);
    setPrazo("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" className="bg-[#1D2E5D] hover:bg-[#1D2E5D]/90 shadow-md font-bold py-5 px-6">
          📧 Enviar e-mails de pendências
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Disparar Cobrança (via Backend)</DialogTitle>
          <DialogDescription className="mt-2 text-xs">
            Este evento gerará uma notificação ao servidor (Python) com os parâmetros atuais de tela. O servidor é responsável por montar a matriz de e-mails para os colaboradores abaixo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-2">
          <div className="bg-muted/30 p-4 border rounded-lg">
            <h4 className="text-sm font-semibold mb-2">Resumo do escopo filtrado:</h4>
            <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground pb-2 border-b">
              <div>Volume de dados alvo: <span className="font-semibold text-foreground">{pendencias.length}</span></div>
              <div>Colaboradores alvo: <span className="font-semibold text-foreground">{involvedCollaborators.length}</span></div>
            </div>
            
            <div className="mt-3">
              <span className="text-[10px] font-semibold uppercase text-muted-foreground tracking-wider block mb-1">Impactados pela cobrança:</span>
              <div className="text-xs p-2 bg-background border rounded-md max-h-24 overflow-y-auto font-mono text-muted-foreground">
                {involvedCollaborators.length > 0 ? (
                  involvedCollaborators.map(c => <div key={c} className="py-0.5 whitespace-nowrap overflow-hidden text-ellipsis">• {c}</div>)
                ) : (
                  <span>Nenhum colaborador foi mapeado pelos filtros.</span>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">
              Prazo para Regularização (Dias Corridos) <span className="text-destructive">*</span>
            </label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                type="number"
                min="1"
                placeholder="Ex: 5"
                value={prazo}
                onChange={(e) => setPrazo(e.target.value ? Number(e.target.value) : "")}
                className="pl-9 h-11"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">Esse prazo será concatenado na mensagem automática enviada aos devedores solicitando atuação urgente.</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button 
            onClick={handleConfirm} 
            disabled={!prazo || prazo <= 0 || involvedCollaborators.length === 0}
            className="bg-[#1D2E5D] hover:bg-[#1D2E5D]/90 transition-colors font-bold"
          >
            🚀 Efetuar Disparo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
