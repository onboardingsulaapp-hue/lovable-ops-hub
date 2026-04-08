import { Status, Prioridade } from "@/types/pendencia";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: Status }) {
  const s = (status || "").toLowerCase();
  const label = s === "ok" ? "OK" : s.charAt(0).toUpperCase() + s.slice(1);
  
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[11px] font-bold px-2 py-0.5 border shadow-none rounded-md uppercase tracking-wider",
        s === "pendente" && "status-pendente",
        s === "corrigida" && "status-corrigida",
        s === "ok" && "status-ok",
        s === "ignorada" && "status-ignorada"
      )}
    >
      {label}
    </Badge>
  );
}

export function PrioridadeBadge({ prioridade }: { prioridade: Prioridade }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-medium px-2.5 py-0.5",
        prioridade === "Alta" && "priority-alta",
        prioridade === "Média" && "priority-media",
        prioridade === "Baixa" && "priority-baixa"
      )}
    >
      {prioridade}
    </Badge>
  );
}
