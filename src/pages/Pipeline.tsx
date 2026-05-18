import React, { useState, useEffect, useRef, useMemo } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { PipelineChart } from "@/components/PipelineChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileBarChart, Upload, Loader2, Info, ArrowLeft, Calendar, FilterX } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function PipelineDashboard() {
  const { profile: user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  
  // Filtros de Data
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");

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

  const filteredData = useMemo(() => {
    return data.filter(item => {
      if (!item.data_vigencia) return selectedMonth === "all" && selectedYear === "all";
      
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

      const matchMonth = selectedMonth === "all" || month === selectedMonth.padStart(2, "0");
      const matchYear = selectedYear === "all" || year === selectedYear;

      return matchMonth && matchYear;
    });
  }, [data, selectedMonth, selectedYear]);

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, source: 'tradicional' | 'nova') => {
    // ... (rest of the upload logic remains the same)
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      toast.error("Por favor, selecione um arquivo .csv");
      return;
    }

    setUploading(true);
    const toastId = toast.loading(`Sincronizando Volumetria (${source === 'nova' ? 'Forms' : 'Tradicional'})...`);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Sessão expirada.");

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`/api/sync_pipeline?source=${source}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Falha na sincronização");
      }

      const result = await response.json();
      toast.success(`Pipeline ${source} atualizado! Processados: ${result.processed}, Removidos: ${result.deleted}`, { id: toastId });
    } catch (err: any) {
      console.error("Upload Error:", err);
      toast.error(err.message, { id: toastId });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

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
            {/* Filtros de Vigência */}
            <div className="flex items-center gap-2 bg-brand-light/50 p-1.5 rounded-lg border border-brand-blue/10">
              <Calendar className="h-4 w-4 text-brand-blue ml-2" />
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[130px] h-9 bg-white border-none shadow-none focus:ring-0">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Meses</SelectItem>
                  {months.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

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

              {(selectedMonth !== "all" || selectedYear !== "all") && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => { setSelectedMonth("all"); setSelectedYear("all"); }}
                  className="h-8 w-8 p-0 text-brand-muted hover:text-red-500"
                >
                  <FilterX className="h-4 w-4" />
                </Button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={(e) => {
                const target = e.target as any;
                const source = target.dataset.source;
                handleFileUpload(e, source);
              }}
              className="hidden"
              id="pipeline-csv-input"
            />
            
            <div className="flex gap-2">
              <Button
                disabled={uploading}
                variant="outline"
                size="sm"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.dataset.source = 'tradicional';
                    fileInputRef.current.click();
                  }
                }}
                className="border-brand-blue text-brand-blue hover:bg-brand-light font-bold h-9"
              >
                <Upload className="h-4 w-4 mr-2" />
                Tradicional
              </Button>

              <Button
                disabled={uploading}
                size="sm"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.dataset.source = 'nova';
                    fileInputRef.current.click();
                  }
                }}
                className="bg-brand-blue hover:bg-brand-blue/90 text-white font-bold h-9"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                Nova (Forms)
              </Button>
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
                  <p className="text-sm">Tente ajustar os filtros ou faça o upload do CSV.</p>
                </div>
              ) : (
                <PipelineChart data={filteredData} />
              )}
            </CardContent>
          </Card>

          {/* Details Table */}
          <Card className="border-none shadow-md overflow-hidden">
            <CardHeader className="bg-white border-b border-borderLight">
              <CardTitle className="text-lg font-bold text-brand-blue flex items-center gap-2">
                <Info className="h-5 w-5 text-brand-blue" />
                Detalhamento da Volumetria {(selectedMonth !== "all" || selectedYear !== "all") && (
                  <span className="text-sm font-normal text-brand-muted">
                    - {selectedMonth !== "all" ? months.find(m => m.value === selectedMonth)?.label : ""} {selectedYear !== "all" ? selectedYear : ""}
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
