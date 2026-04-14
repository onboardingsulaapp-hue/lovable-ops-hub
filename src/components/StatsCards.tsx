import { AlertCircle, CheckCircle2, Clock, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Pendencia } from "@/types/pendencia";
import { cn } from "@/lib/utils";

interface StatsCardsProps {
  pendencias: Pendencia[];
}

export function StatsCards({ pendencias }: StatsCardsProps) {
  const total = pendencias.length;
  const pendentes = pendencias.filter((p) => p.status?.toLowerCase() === "pendente").length;
  const corrigidas = pendencias.filter((p) => p.status?.toLowerCase() === "corrigida").length;
  const ok = pendencias.filter((p) => p.status?.toLowerCase() === "ok").length;
  const colaboradores = new Set(pendencias.map((p) => p.colaborador_nome)).size;

  const cards = [
    { label: "Total", value: total, icon: Clock, color: "text-[#1D2E5D]", bgColor: "bg-[#F7F8FA]" },
    { label: "Pendentes", value: pendentes, icon: AlertCircle, color: "text-[#EF482B]", bgColor: "bg-[#FEF2F2]" },
    { label: "Corrigidas", value: corrigidas, icon: CheckCircle2, color: "text-[#1D2E5D]", bgColor: "bg-[#EFF6FF]" },
    { label: "Validadas (OK)", value: ok, icon: CheckCircle2, color: "text-[#166534]", bgColor: "bg-[#F0FDF4]" },
    { label: "Colaboradores", value: colaboradores, icon: Users, color: "text-[#1D2E5D]", bgColor: "bg-[#F7F8FA]" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {cards.map((card) => (
        <Card key={card.label} className="border border-borderLight shadow-[0px_2px_8px_rgba(0,0,0,0.04)] bg-white overflow-hidden group transition-all duration-300 hover:border-brand-blue/30 hover:shadow-[0px_4px_16px_rgba(29,46,93,0.08)] rounded-[12px] relative">
          <div className={`absolute top-0 left-0 w-full h-1 ${card.bgColor.replace('bg-', 'bg-').replace('/10', '')}`} style={{ opacity: 0.8 }} />
          <CardContent className="p-5 pt-6">
            <div className="flex flex-col gap-4">
              <div className={cn("p-2 rounded-lg w-fit transition-colors", card.bgColor)}>
                <card.icon className={cn("h-5 w-5", card.color)} strokeWidth={2} />
              </div>
              <div className="space-y-1">
                <p className="text-[26px] font-bold text-brand-blue tracking-tight leading-none">{card.value}</p>
                <p className="text-[11px] font-semibold text-brand-muted uppercase tracking-widest">{card.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
