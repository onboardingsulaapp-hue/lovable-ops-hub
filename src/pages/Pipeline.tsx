import React, { useState, useEffect, useRef, useMemo } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { PipelineChart } from "@/components/PipelineChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { FileBarChart, Info, ArrowLeft, Calendar, FilterX } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function PipelineDashboard() {
  const { profile: user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtros de Data
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedConsultor, setSelectedConsultor] = useState<string>("all");

  useEffect(() => {
    if (!user || (user.role !== "admin" && user.role !== "socio")) {
      navigate("/");
      return;
    }

    const q = query(collection(db, "pipeline_volumetria"), orderBy("consultor", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setData(docs);
      setLoading(false);
    });

    return () => unsub();
  }, [user, navigate]);

  // Lista única de consultores para filtro dropdown
  const consultores = useMemo(() => {
    const nomes = new Set<string>();
    data.forEach(item => {
      if (item.consultor) {
        nomes.add(item.consultor.trim());
      }
    });
    return Array.from(nomes).sort();
  }, [data]);

  const filteredData = useMemo(() => {
    return data.filter(item => {
      // Filtro de Consultor
      const matchConsultor = selectedConsultor === "all" || item.consultor === selectedConsultor;
      if (!matchConsultor) return false;

      if (!item.data_vigencia) return selectedMonths.length === 0 && selectedYear === "all";
      
      const vigenciaStr = String(item.data_vigencia);
      // Tentar extrair mês e ano (formatos DD/MM/YYYY ou YYYY-MM-DD)
      let month = "";
      let year = "";

      if (vigenciaStr.includes("/")) {
        const parts = vigenciaStr.split("/");
        if (parts.length === 3) {
          month = parts[1];
          year = parts[2];
        }
      } else if (vigenciaStr.includes("-")) {
        const parts = vigenciaStr.split("-");
        if (parts.length === 3) {
          year = parts[0];
          month = parts[1];
        }
      }

      const matchMonth = selectedMonths.length === 0 || selectedMonths.includes(month.padStart(2, "0"));
      const matchYear = selectedYear === "all" || year === selectedYear;

      return matchMonth && matchYear;
    });
  }, [data, selectedMonths, selectedYear, selectedConsultor]);

  const months = [
    { value: "01", label: "Janeiro" },
    { value: "02", label: "Fevereiro" },
    { value: "03", label: "Março" },
    { value: "04", label: "Abril" },
    { value: "05", label: "Maio" },
    { value: "06", label: "Junho" },
    { value: "07", label: "Julho" },
    { value: "08", label: "Agosto" },
    { value: "09", label: "Setembro" },
    { value: "10", label: "Outubro" },
    { value: "11", label: "Novembro" },
    { value: "12", label: "Dezembro" },
  ];

  const years = ["2026", "2027", "2028"];

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] pb-12">
      {/* Header */}
      <div className="bg-white border-b border-borderLight py-6 px-4 md:px-8 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-brand-blue flex items-center gap-2">
                <FileBarChart className="h-6 w-6" />
                Dashboard de Volumetria
              </h1>
              <p className="text-sm text-brand-muted font-medium">Controle de Pipeline e Carga por Consultor</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Filtros de Vigência e Consultor */}
            <div className="flex items-center gap-2 bg-brand-light/50 p-1.5 rounded-lg border border-brand-blue/10">
              <Calendar className="h-4 w-4 text-brand-blue ml-2" />
              <Popover>
                <PopoverTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-[150px] h-9 bg-white border-none shadow-none focus:ring-0 flex items-center justify-between px-3 text-sm font-normal text-left truncate"
                  >
                    <span className="truncate mr-1">
                      {selectedMonths.length === 0 
                        ? "Todos os Meses" 
                        : selectedMonths.length === 1 
                          ? months.find(m => m.value === selectedMonths[0])?.label 
                          : `${selectedMonths.length} Meses`
                      }
                    </span>
                    <span className="text-muted-foreground text-xs opacity-50">▼</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2 bg-white border border-borderLight shadow-md rounded-md z-[100]" align="start">
                  <div className="space-y-1">
                    <div 
                      className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded-sm"
                      onClick={() => setSelectedMonths([])}
                    >
                      <Checkbox 
                        id="month-all" 
                        checked={selectedMonths.length === 0} 
                        onCheckedChange={() => setSelectedMonths([])}
                      />
                      <label htmlFor="month-all" className="text-sm font-medium leading-none cursor-pointer flex-1">
                        Todos os Meses
                      </label>
                    </div>
                    <div className="h-px bg-border/50 my-1" />
                    <div className="max-h-60 overflow-y-auto space-y-0.5">
                      {months.map((m) => {
                        const isChecked = selectedMonths.includes(m.value);
                        return (
                          <div 
                            key={m.value} 
                            className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded-sm"
                            onClick={(e) => {
                              e.preventDefault();
                              setSelectedMonths(prev => 
                                isChecked 
                                  ? prev.filter(v => v !== m.value) 
                                  : [...prev, m.value]
                              );
                            }}
                          >
                            <Checkbox 
                              id={`month-${m.value}`} 
                              checked={isChecked}
                              onCheckedChange={() => {}}
                            />
                            <label htmlFor={`month-${m.value}`} className="text-sm font-normal leading-none cursor-pointer flex-1 select-none">
                              {m.label}
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-[100px] h-9 bg-white border-none shadow-none focus:ring-0">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {years.map(y => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="h-4 w-px bg-brand-blue/20 mx-1" />

              <Select value={selectedConsultor} onValueChange={setSelectedConsultor}>
                <SelectTrigger className="w-[160px] h-9 bg-white border-none shadow-none focus:ring-0 font-medium">
                  <SelectValue placeholder="Filtrar Consultor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos Consultores</SelectItem>
                  {consultores.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {(selectedMonths.length > 0 || selectedYear !== "all" || selectedConsultor !== "all") && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => { setSelectedMonths([]); setSelectedYear("all"); setSelectedConsultor("all"); }}
                  className="h-8 w-8 p-0 text-brand-muted hover:text-red-500"
                >
                  <FilterX className="h-4 w-4" />
                </Button>
              )}
            </div>

          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-8">
        <div className="grid grid-cols-1 gap-8">
          {/* Chart Card */}
          <Card className="border border-borderLight shadow-sm overflow-hidden">
            <CardHeader className="bg-white border-b border-borderLight pb-4">
              <CardTitle className="text-lg font-bold text-brand-blue flex items-center gap-2 uppercase tracking-wider">
                Volumetria por Consultor (Pipeline Ativo)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 bg-white">
              {filteredData.length === 0 ? (
                <div className="h-[400px] flex flex-col items-center justify-center text-brand-muted opacity-60">
                  <FileBarChart className="h-12 w-12 mb-4" />
                  <p className="font-medium">Nenhuma empresa encontrada para este período.</p>
                  <p className="text-sm">Tente ajustar os filtros ou sincronize a planilha geral na Home.</p>
                </div>
              ) : (
                <PipelineChart 
                  data={filteredData} 
                  onConsultorClick={(consultorName) => {
                    setSelectedConsultor(prev => {
                      const alreadySelected = prev === consultorName;
                      if (alreadySelected) {
                        toast.info("Filtro de consultor removido");
                        return "all";
                      } else {
                        toast.success(`Filtrando consultor: ${consultorName}`);
                        return consultorName;
                      }
                    });
                  }} 
                />
              )}
            </CardContent>
          </Card>

          {/* Details Table */}
          <Card className="border-none shadow-md overflow-hidden">
            <CardHeader className="bg-white border-b border-borderLight">
              <CardTitle className="text-lg font-bold text-brand-blue flex items-center gap-2">
                <Info className="h-5 w-5 text-brand-blue" />
                Detalhamento da Volumetria {(selectedMonths.length > 0 || selectedYear !== "all" || selectedConsultor !== "all") && (
                  <span className="text-sm font-normal text-brand-muted">
                    - {selectedMonths.length > 0 ? selectedMonths.map(v => months.find(m => m.value === v)?.label).join(", ") : ""} {selectedYear !== "all" ? selectedYear : ""} {selectedConsultor !== "all" ? `(${selectedConsultor})` : ""}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F8FAFC]">
                      <th className="px-6 py-4 text-sm font-bold text-brand-blue border-b border-borderLight uppercase tracking-wider">Empresa</th>
                      <th className="px-6 py-4 text-sm font-bold text-brand-blue border-b border-borderLight uppercase tracking-wider">Consultor</th>
                      <th className="px-6 py-4 text-sm font-bold text-brand-blue border-b border-borderLight uppercase tracking-wider">Produto</th>
                      <th className="px-6 py-4 text-sm font-bold text-brand-blue border-b border-borderLight uppercase tracking-wider">Vigência</th>
                      <th className="px-6 py-4 text-sm font-bold text-brand-blue border-b border-borderLight uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borderLight bg-white">
                    {filteredData.length > 0 ? (
                      filteredData.map((item) => (
                        <tr key={item.id} className="hover:bg-brand-light/30 transition-colors">
                          <td className="px-6 py-4 text-sm font-bold text-brand-blue">{item.razao_social}</td>
                          <td className="px-6 py-4 text-sm text-brand-muted">{item.consultor}</td>
                          <td className="px-6 py-4 text-sm text-brand-muted">{item.produto}</td>
                          <td className="px-6 py-4 text-sm text-brand-muted font-medium">{item.data_vigencia || "-"}</td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                              item.status_normalizado?.includes("OPERACAO") ? "bg-green-100 text-green-700" :
                              item.status_normalizado?.includes("CLIENTE") ? "bg-blue-100 text-blue-700" :
                              "bg-orange-100 text-orange-700"
                            }`}>
                              {item.status_pipeline}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-brand-muted font-medium bg-white">
                          <div className="flex flex-col items-center gap-2">
                            <FilterX className="h-8 w-8 text-brand-muted/30" />
                            Nenhuma empresa encontrada para este período.
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
