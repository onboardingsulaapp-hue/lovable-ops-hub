import React, { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, FileDown, Loader2 } from "lucide-react";
import { exportMonthlyReport } from "@/lib/exportMonthlyReport";

const meses = [
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

const anos = ["2026", "2027", "2028", "2029", "2030"];

export default function RelatorioMensal() {
  const { profile: user, loading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [file, setFile] = useState<File | null>(null);
  const [mes, setMes] = useState<string>("");
  const [ano, setAno] = useState<string>(new Date().getFullYear().toString());
  const [isProcessing, setIsProcessing] = useState(false);

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-brand-blue" /></div>;
  }

  if (!user || user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  const handleProcessar = async () => {
    if (!file) {
      toast.error("Por favor, selecione um arquivo CSV bruto.");
      return;
    }
    if (!mes || !ano) {
      toast.error("Por favor, selecione o mês e o ano para filtrar.");
      return;
    }

    setIsProcessing(true);
    toast.loading("Processando relatório...", { id: "relatorio" });

    try {
      const totalProcessado = await exportMonthlyReport({
        file,
        selectedMonth: mes,
        selectedYear: ano
      });
      
      toast.success(`Relatório gerado com sucesso! ${totalProcessado} linhas extraídas.`, { id: "relatorio" });
      
      // Limpar campos após sucesso
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setMes("");
      
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Erro inesperado ao gerar o relatório.", { id: "relatorio" });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full font-sans text-brand-blue pb-12">
      {/* Header específico da página */}
      <div className="bg-white border-b border-borderLight py-6 px-4 sm:px-8 lg:px-12 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-brand-blue flex items-center gap-2">
              <FileDown className="h-6 w-6" />
              Relatório Mensal
            </h1>
            <div className="text-[12px] text-brand-muted flex items-center gap-2 uppercase font-semibold tracking-wider mt-1">
              <span>Admin</span>
              <span className="text-border">/</span>
              <span className="text-brand-blue">Extração de Relatório Mensal</span>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-8 lg:px-12 py-8 space-y-8 animate-fade-in">
        <Card className="border border-borderLight shadow-sm max-w-2xl mx-auto">
          <CardHeader className="bg-white border-b border-borderLight pb-4">
            <CardTitle className="text-xl font-bold text-brand-blue">Gerador de Relatório</CardTitle>
            <CardDescription className="text-sm text-brand-muted mt-2">
              Carregue a planilha bruta da SulAmérica. O sistema irá remover o lixo do cabeçalho, 
              filtrar pelo mês selecionado (onde Status = Concluída) e gerar um novo CSV pronto para uso.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="p-6 space-y-6 bg-white">
            
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <label className="text-sm font-semibold text-brand-blue">Mês da Vigência</label>
                <Select value={mes} onValueChange={setMes}>
                  <SelectTrigger className="w-full border-borderLight">
                    <SelectValue placeholder="Selecione o mês" />
                  </SelectTrigger>
                  <SelectContent>
                    {meses.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-2">
                <label className="text-sm font-semibold text-brand-blue">Ano</label>
                <Select value={ano} onValueChange={setAno}>
                  <SelectTrigger className="w-full border-borderLight">
                    <SelectValue placeholder="Selecione o ano" />
                  </SelectTrigger>
                  <SelectContent>
                    {anos.map(a => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-brand-blue">Planilha Bruta (CSV)</label>
              <div className="flex flex-col items-center justify-center min-h-[140px] border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50 hover:bg-gray-50 transition-colors">
                <input
                  type="file"
                  accept=".csv"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                {file ? (
                  <div className="text-center p-4">
                    <p className="text-sm font-semibold text-brand-blue">{file.name}</p>
                    <p className="text-xs text-brand-muted mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                    <Button variant="link" size="sm" onClick={() => setFile(null)} className="text-red-500 mt-2 hover:text-red-600">Remover arquivo</Button>
                  </div>
                ) : (
                  <div className="text-center p-4">
                    <Upload className="h-8 w-8 text-brand-muted/50 mx-auto mb-2" />
                    <p className="text-sm text-brand-muted mb-4">Selecione ou arraste o arquivo CSV bruto aqui</p>
                    <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="border-brand-blue text-brand-blue hover:bg-brand-light">
                      Selecionar Arquivo
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <Button 
              size="lg" 
              onClick={handleProcessar}
              disabled={!file || !mes || !ano || isProcessing}
              className="w-full bg-brand-orange hover:bg-brand-orange/90 text-white font-bold shadow-md mt-4"
            >
              {isProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <FileDown className="mr-2 h-5 w-5" />}
              Gerar e Baixar Relatório
            </Button>
            
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
