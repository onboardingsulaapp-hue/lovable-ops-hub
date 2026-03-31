import { Status, Prioridade } from "@/types/pendencia";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge
      className={cn(
        "text-xs font-semibold px-2.5 py-0.5 border-0",
        status === "Pendente" && "status-pendente",
        status === "Corrigida" && "status-corrigida",
        status === "OK" && "status-ok"
      )}
    >
      {status}
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
