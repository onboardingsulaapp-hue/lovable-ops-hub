import { AlertCircle, CheckCircle2, Clock, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Pendencia } from "@/types/pendencia";

interface StatsCardsProps {
  pendencias: Pendencia[];
}

export function StatsCards({ pendencias }: StatsCardsProps) {
  const total = pendencias.length;
  const pendentes = pendencias.filter((p) => p.status === "Pendente").length;
  const corrigidas = pendencias.filter((p) => p.status === "Corrigida").length;
  const ok = pendencias.filter((p) => p.status === "OK").length;
  const colaboradores = new Set(pendencias.map((p) => p.colaborador)).size;

  const cards = [
    { label: "Total", value: total, icon: Clock, color: "text-primary", bg: "bg-primary/10" },
    { label: "Pendentes", value: pendentes, icon: AlertCircle, color: "text-status-pendente", bg: "bg-status-pendente/10" },
    { label: "Corrigidas", value: corrigidas, icon: CheckCircle2, color: "text-status-corrigida", bg: "bg-status-corrigida/10" },
    { label: "Validadas (OK)", value: ok, icon: CheckCircle2, color: "text-status-ok", bg: "bg-status-ok/10" },
    { label: "Colaboradores", value: colaboradores, icon: Users, color: "text-accent", bg: "bg-accent/10" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {cards.map((card) => (
        <Card key={card.label} className="border border-border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${card.bg}`}>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{card.value}</p>
                <p className="text-xs text-muted-foreground">{card.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
