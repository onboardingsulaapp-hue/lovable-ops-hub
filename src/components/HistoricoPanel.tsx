import { HistoricoAcao } from "@/types/pendencia";
import { Clock, User } from "lucide-react";

export function HistoricoPanel({ historico }: { historico: HistoricoAcao[] }) {
  return (
    <div className="space-y-3 p-4">
      <h4 className="text-sm font-semibold text-foreground">Histórico de Ações</h4>
      <div className="relative space-y-0">
        {historico.map((item, index) => (
          <div key={item.id} className="flex gap-3 pb-4 relative">
            {index < historico.length - 1 && (
              <div className="absolute left-[11px] top-6 bottom-0 w-px bg-border" />
            )}
            <div className="mt-1 h-[22px] w-[22px] rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <div className="h-2 w-2 rounded-full bg-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{item.acao}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {item.usuario}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(item.dataHora).toLocaleString("pt-BR")}
                </span>
              </div>
              {item.detalhes && (
                <p className="mt-1 text-xs text-muted-foreground italic">"{item.detalhes}"</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
