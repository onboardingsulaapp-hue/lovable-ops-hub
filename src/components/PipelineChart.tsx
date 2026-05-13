import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts';

interface PipelineData {
  consultor: string;
  status_pipeline: string;
  status_normalizado: string;
}

interface PipelineChartProps {
  data: PipelineData[];
}

const STATUS_COLORS: Record<string, string> = {
  "EM CURSO - OPERACAO": "#10B981", // Verde
  "EM CURSO - CLIENTE / CORRETORA": "#F59E0B", // Amarelo/Laranja
  "IMPLANTACAO FUTURA": "#3B82F6", // Azul
};

const normalize = (s: string) => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim() : "";

export function PipelineChart({ data }: PipelineChartProps) {
  const chartData = useMemo(() => {
    const groups: Record<string, any> = {};

    data.forEach(item => {
      const name = item.consultor || "Sem Consultor";
      if (!groups[name]) {
        groups[name] = { 
          name, 
          "EM CURSO - OPERACAO": 0, 
          "EM CURSO - CLIENTE / CORRETORA": 0, 
          "IMPLANTACAO FUTURA": 0,
          total: 0 
        };
      }

      const statusNorm = item.status_normalizado;
      // Match status
      let key = "";
      if (statusNorm.includes("OPERACAO")) key = "EM CURSO - OPERACAO";
      else if (statusNorm.includes("CLIENTE") || statusNorm.includes("CORRETORA") || statusNorm.includes("CORRETORRA")) key = "EM CURSO - CLIENTE / CORRETORA";
      else if (statusNorm.includes("FUTURA")) key = "IMPLANTACAO FUTURA";

      if (key) {
        groups[name][key]++;
        groups[name].total++;
      }
    });

    return Object.values(groups).sort((a, b) => b.total - a.total);
  }, [data]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border border-borderLight shadow-xl rounded-lg">
          <p className="font-bold text-brand-blue mb-2 uppercase text-xs tracking-wider">{label}</p>
          <div className="space-y-1">
            <p className="text-sm text-gray-600">Total Atribuído: <span className="font-bold text-brand-blue">{payload[0].payload.total}</span></p>
            <div className="pt-2 border-t mt-2">
              {payload.map((entry: any, index: number) => (
                <p key={index} className="text-[11px] font-medium" style={{ color: entry.color }}>
                  {entry.name}: {entry.value}
                </p>
              ))}
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-[500px] mt-8">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
          barSize={20}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
          <XAxis type="number" hide />
          <YAxis 
            dataKey="name" 
            type="category" 
            tick={{ fontSize: 11, fontWeight: 600, fill: '#1D2E5D' }} 
            width={90}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F7F8FA' }} />
          <Legend 
            verticalAlign="bottom" 
            align="center" 
            wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 600 }}
          />
          <Bar 
            dataKey="EM CURSO - OPERACAO" 
            name="Em Operação" 
            stackId="a" 
            fill={STATUS_COLORS["EM CURSO - OPERACAO"]} 
            radius={[0, 0, 0, 0]}
          />
          <Bar 
            dataKey="EM CURSO - CLIENTE / CORRETORA" 
            name="Cliente / Corretora" 
            stackId="a" 
            fill={STATUS_COLORS["EM CURSO - CLIENTE / CORRETORA"]} 
          />
          <Bar 
            dataKey="IMPLANTACAO FUTURA" 
            name="Implantação Futura" 
            stackId="a" 
            fill={STATUS_COLORS["IMPLANTACAO FUTURA"]} 
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
