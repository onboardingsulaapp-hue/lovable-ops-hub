import { Pendencia } from "@/types/pendencia";
import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SocioChartsProps {
  pendencias: Pendencia[];
}

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];

export function SocioCharts({ pendencias }: SocioChartsProps) {
  // Aggregate data for Status
  const statusData = useMemo(() => {
    const counts = { OK: 0, Corrigida: 0, Pendente: 0 };
    pendencias.forEach(p => {
      const s = p.status?.toLowerCase();
      if (s === "ok") counts.OK++;
      else if (s === "corrigida") counts.Corrigida++;
      else if (s === "pendente") counts.Pendente++;
    });
    return [
      { name: "OK", value: counts.OK, color: "#10b981" },
      { name: "Corrigida", value: counts.Corrigida, color: "#3b82f6" },
      { name: "Pendente", value: counts.Pendente, color: "#ef4444" }
    ].filter(item => item.value > 0);
  }, [pendencias]);

  // Aggregate data for Colaborador
  const colaboradorData = useMemo(() => {
    const counts: Record<string, { total: number, pendente: number }> = {};
    pendencias.forEach(p => {
      const nome = p.colaborador_nome || "Sem Atribuição";
      if (!counts[nome]) counts[nome] = { total: 0, pendente: 0 };
      counts[nome].total += 1;
      if (p.status?.toLowerCase() === "pendente") counts[nome].pendente += 1;
    });
    return Object.entries(counts)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10); // Top 10
  }, [pendencias]);

  // Aggregate data for Tipo Implantação
  const implData = useMemo(() => {
    const counts: Record<string, number> = {};
    pendencias.forEach(p => {
      counts[p.tipo_implantacao] = (counts[p.tipo_implantacao] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value], idx) => ({ name, value, color: COLORS[idx % COLORS.length] }));
  }, [pendencias]);

  // Aggregate over time (By data_vigencia month/year)
  const timeData = useMemo(() => {
    const history: Record<string, number> = {};
    pendencias.forEach(p => {
      if (!p.data_vigencia) return;
      
      let date: Date;
      const val = p.data_vigencia as any;
      
      if (val && typeof val === 'object' && 'seconds' in val) {
        date = new Date(val.seconds * 1000);
      } else {
        date = new Date(p.data_vigencia);
      }

      if (isNaN(date.getTime())) return;

      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      history[key] = (history[key] || 0) + 1;
    });
    return Object.entries(history)
      .sort(([k1], [k2]) => k1.localeCompare(k2))
      .map(([date, count]) => ({ date, count }));
  }, [pendencias]);

  if (pendencias.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center border rounded-lg bg-card text-muted-foreground p-8 text-center text-sm">
        Nenhum dado encontrado com os filtros atuais.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in mt-6">
      
      {/* Gráfico 1: Status */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Distribuição por Status</CardTitle>
        </CardHeader>
        <CardContent className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
                labelLine={true}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [`${value} logs`, "Quantidade"]} contentStyle={{borderRadius: '8px', fontSize: '13px'}} />
              <Legend verticalAlign="bottom" height={36} iconType="circle"/>
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Gráfico 2: Colaborador */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Top 10 Colaboradores (Volumetria)</CardTitle>
        </CardHeader>
        <CardContent className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={colaboradorData} layout="vertical" margin={{ left: 50, right: 30, bottom: 5, top: 5 }}>
              <XAxis type="number" hide />
              <YAxis dataKey="name" type="category" width={130} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{fill: 'transparent'}} contentStyle={{borderRadius: '8px', fontSize: '13px'}} />
              <Legend iconType="circle" />
              <Bar dataKey="total" name="Total Atribuído" fill="#94a3b8" radius={[0, 4, 4, 0]} barSize={12} />
              <Bar dataKey="pendente" name="Pendentes Críticos" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={12} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Gráfico 3: Tipo de Implantação */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Tipos de Implantação</CardTitle>
        </CardHeader>
        <CardContent className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={implData}
                cx="50%"
                cy="50%"
                outerRadius={100}
                dataKey="value"
                labelLine={true}
                label={({ name, value }) => `${name} (${value})`}
              >
                {implData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => [`${value} itens`, "Aberturas"]} contentStyle={{borderRadius: '8px', fontSize: '13px'}} />
              <Legend verticalAlign="bottom" height={36} iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Gráfico 4: Evolução Temporal */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Evolução por Entregas (Vigências)</CardTitle>
        </CardHeader>
        <CardContent className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
              <XAxis dataKey="date" tick={{fontSize: 12}} axisLine={false} tickLine={false} tickMargin={10} />
              <YAxis tick={{fontSize: 12}} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{borderRadius: '8px', fontSize: '13px'}} />
              <Line type="monotone" dataKey="count" name="Casos Reportados" stroke="#3b82f6" strokeWidth={3} dot={{ strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      
    </div>
  );
}
