import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { collection, onSnapshot, query, setDoc, doc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { parse } from "csv-parse/browser/esm/sync";
import columnAliases from "@/config/column_aliases.json";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Upload, Play, CheckCircle2, Circle, FileSpreadsheet, Loader2 } from "lucide-react";

interface Divergencia {
  id: string; // fingerprint (razao_social_normalizada)
  razao_social: string;
  particularidades: string;
  fatura: string;
  faturamento: string;
  linha_csv: number;
  planilha_origem: string;
  resolvido?: boolean;
}

// Normalizador genérico
const normalizeString = (str: string) => {
  if (!str) return "";
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};

// Encontra o nome real da coluna baseado nos aliases
const getOriginalColumnName = (header: string) => {
  const normalizedHeader = normalizeString(header);
  for (const [original, aliases] of Object.entries(columnAliases)) {
    if (original === header || aliases.some(alias => normalizeString(alias) === normalizedHeader)) {
      return original;
    }
  }
  return header; // Fallback
};

export default function Financas() {
  const { profile: user, loading } = useAuth();
  
  const [fileTime, setFileTime] = useState<File | null>(null);
  const [fileFinanceiro, setFileFinanceiro] = useState<File | null>(null);
  const fileInputTimeRef = useRef<HTMLInputElement>(null);
  const fileInputFinRef = useRef<HTMLInputElement>(null);

  const [divergencias, setDivergencias] = useState<Divergencia[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [historicoResolvidos, setHistoricoResolvidos] = useState<Record<string, boolean>>({});

  // Carregar histórico de divergências resolvidas do Firestore
  useEffect(() => {
    if (!user || user.role !== "admin") return;
    const q = query(collection(db, "divergencias_financeiras"));
    const unsub = onSnapshot(q, (snap) => {
      const history: Record<string, boolean> = {};
      snap.docs.forEach(d => {
        history[d.id] = d.data().resolvido;
      });
      setHistoricoResolvidos(history);
      
      // Atualizar lista atual se houver
      setDivergencias(prev => prev.map(div => ({
        ...div,
        resolvido: history[div.id] || false
      })));
    });
    return () => unsub();
  }, [user]);

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-brand-blue" /></div>;
  }

  if (!user || user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  const parseCsvFile = async (file: File): Promise<any[]> => {
    const text = await file.text();
    // Encontrar linha de cabeçalho (que contenha pelo menos algumas colunas)
    const lines = text.split(/\r?\n/);
    let headerRowIndex = 0;
    
    // Simplificação: vamos assumir que a primeira linha não vazia é o cabeçalho, ou procurar palavras-chave
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes("empresa") || lines[i].toLowerCase().includes("social")) {
        headerRowIndex = i;
        break;
      }
    }

    const csvData = text.split(/\r?\n/).slice(headerRowIndex).join("\n");

    const records = parse(csvData, {
      columns: (headers: string[]) => headers.map(getOriginalColumnName),
      skip_empty_lines: true,
      relax_column_count: true,
    });

    // Adicionar número da linha original (aproximado)
    return records.map((record: any, index: number) => ({
      ...record,
      _linha_csv: headerRowIndex + index + 2,
    }));
  };

  const handleProcessar = async () => {
    if (!fileTime || !fileFinanceiro) {
      toast.error("Por favor, carregue ambas as planilhas antes de iniciar.");
      return;
    }

    setIsProcessing(true);
    toast.loading("Processando cruzamento de dados...", { id: "cruzamento" });

    try {
      const dadosTime = await parseCsvFile(fileTime);
      const dadosFinanceiro = await parseCsvFile(fileFinanceiro);

      // 1. Construir Set de empresas do Financeiro para O(1) lookup
      const empresasFinanceiro = new Set<string>();
      dadosFinanceiro.forEach(row => {
        const nomeEmpresa = row["Nome Empresa"];
        if (nomeEmpresa) {
          empresasFinanceiro.add(normalizeString(nomeEmpresa));
        }
      });

      // 2. Filtrar e Cruzar dados do Time
      const ignorarValores = ["nao ha", "nao tem", "n/a", "-", "vazio"];
      
      const novasDivergencias: Divergencia[] = [];

      dadosTime.forEach(row => {
        // Encontrar a coluna de vigência para checar o ano
        let anoDaVigencia = 0;
        const vigenciaKey = Object.keys(row).find(k => k.toLowerCase().includes("vigência") || k.toLowerCase().includes("vigencia"));
        
        if (vigenciaKey && row[vigenciaKey]) {
          const val = String(row[vigenciaKey]);
          const anoMatch = val.match(/\b(20\d\d)\b/);
          if (anoMatch) {
            anoDaVigencia = parseInt(anoMatch[1], 10);
          }
        }

        // Se o ano for menor que 2026, pula (somos orientados a auditar apenas 2026 pra frente)
        if (anoDaVigencia > 0 && anoDaVigencia < 2026) {
          return;
        }

        const particularidades = String(row["Particularidades"] || "").trim();
        const fatura = String(row["Fatura"] || "").trim();
        const razaoSocial = String(row["Razão Social do Cliente"] || "").trim();

        // Regra: Particularidades e Fatura precisam ter valores "reais"
        const particNorm = normalizeString(particularidades);
        const faturaNorm = normalizeString(fatura);

        const temParticularidadeReal = particularidades !== "" && !ignorarValores.includes(particNorm);
        const temFaturaReal = fatura !== "" && !ignorarValores.includes(faturaNorm);

        if (temParticularidadeReal && temFaturaReal && razaoSocial) {
          const razaoSocialNorm = normalizeString(razaoSocial);
          
          // Se não encontrou no financeiro, é uma divergência
          if (!empresasFinanceiro.has(razaoSocialNorm)) {
            const id = razaoSocialNorm.replace(/\s+/g, '_');
            novasDivergencias.push({
              id,
              razao_social: razaoSocial,
              particularidades,
              fatura,
              faturamento: String(row["Faturamento"] || ""),
              linha_csv: row._linha_csv,
              planilha_origem: fileTime.name,
              resolvido: historicoResolvidos[id] || false
            });
          }
        }
      });

      setDivergencias(novasDivergencias);
      
      if (novasDivergencias.length > 0) {
        toast.success(`Encontradas ${novasDivergencias.length} empresas não faturadas.`, { id: "cruzamento" });
      } else {
        toast.success("Nenhuma divergência encontrada! Tudo certo.", { id: "cruzamento" });
      }

    } catch (error) {
      console.error("Erro no cruzamento:", error);
      toast.error("Erro ao ler os arquivos. Verifique se são CSVs válidos.", { id: "cruzamento" });
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleResolvido = async (div: Divergencia) => {
    const novoStatus = !div.resolvido;
    
    // Atualiza estado local otimista
    setDivergencias(prev => prev.map(d => d.id === div.id ? { ...d, resolvido: novoStatus } : d));

    try {
      const docRef = doc(db, "divergencias_financeiras", div.id);
      if (novoStatus) {
        await setDoc(docRef, {
          razao_social: div.razao_social,
          resolvido: true,
          data_resolucao: new Date().toISOString(),
          resolvido_por: user?.nome
        }, { merge: true });
        toast.success(`Marcado como resolvido.`);
      } else {
        // Se desmarcou, podemos remover ou setar como false. Vamos setar como false para histórico.
        await setDoc(docRef, { resolvido: false }, { merge: true });
        toast.success(`Marcado como pendente.`);
      }
    } catch (error) {
      console.error("Erro ao salvar no Firestore:", error);
      toast.error("Erro ao atualizar o status.");
      // Reverter estado em caso de erro
      setDivergencias(prev => prev.map(d => d.id === div.id ? { ...d, resolvido: !novoStatus } : d));
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA] pb-12">
      <div className="bg-white border-b border-borderLight py-6 px-4 md:px-8 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-brand-blue flex items-center gap-2">
              <FileSpreadsheet className="h-6 w-6" />
              Auditoria Financeira
            </h1>
            <p className="text-sm text-brand-muted font-medium">Cruzamento automático de faturamento</p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-8 space-y-8">
        
        {/* Painel de Uploads */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Upload Time */}
          <Card className="border border-borderLight shadow-sm">
            <CardHeader className="bg-white border-b border-borderLight pb-4">
              <CardTitle className="text-base font-bold text-brand-blue flex items-center gap-2">
                <Upload className="h-5 w-5 text-brand-orange" />
                1. Planilha do Time (Origem)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 bg-white flex flex-col items-center justify-center min-h-[160px] border-2 border-dashed border-gray-200 rounded-b-xl m-4 bg-gray-50/50">
              <input
                type="file"
                accept=".csv"
                ref={fileInputTimeRef}
                className="hidden"
                onChange={(e) => setFileTime(e.target.files?.[0] || null)}
              />
              {fileTime ? (
                <div className="text-center">
                  <p className="text-sm font-semibold text-brand-blue">{fileTime.name}</p>
                  <p className="text-xs text-brand-muted">{(fileTime.size / 1024).toFixed(1)} KB</p>
                  <Button variant="link" size="sm" onClick={() => setFileTime(null)} className="text-red-500 mt-2">Remover</Button>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm text-brand-muted mb-4">Carregue o CSV de controle do time</p>
                  <Button variant="outline" onClick={() => fileInputTimeRef.current?.click()} className="border-brand-blue text-brand-blue hover:bg-brand-light">
                    Selecionar Arquivo
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upload Financeiro */}
          <Card className="border border-borderLight shadow-sm">
            <CardHeader className="bg-white border-b border-borderLight pb-4">
              <CardTitle className="text-base font-bold text-brand-blue flex items-center gap-2">
                <Upload className="h-5 w-5 text-green-600" />
                2. Planilha do Financeiro (Conferência)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 bg-white flex flex-col items-center justify-center min-h-[160px] border-2 border-dashed border-gray-200 rounded-b-xl m-4 bg-gray-50/50">
              <input
                type="file"
                accept=".csv"
                ref={fileInputFinRef}
                className="hidden"
                onChange={(e) => setFileFinanceiro(e.target.files?.[0] || null)}
              />
              {fileFinanceiro ? (
                <div className="text-center">
                  <p className="text-sm font-semibold text-brand-blue">{fileFinanceiro.name}</p>
                  <p className="text-xs text-brand-muted">{(fileFinanceiro.size / 1024).toFixed(1)} KB</p>
                  <Button variant="link" size="sm" onClick={() => setFileFinanceiro(null)} className="text-red-500 mt-2">Remover</Button>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm text-brand-muted mb-4">Carregue o CSV do sistema financeiro</p>
                  <Button variant="outline" onClick={() => fileInputFinRef.current?.click()} className="border-green-600 text-green-700 hover:bg-green-50">
                    Selecionar Arquivo
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Botão de Ação */}
        <div className="flex justify-center">
          <Button 
            size="lg" 
            onClick={handleProcessar}
            disabled={!fileTime || !fileFinanceiro || isProcessing}
            className="bg-brand-blue hover:bg-brand-blue/90 text-white font-bold px-8 shadow-md"
          >
            {isProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5 fill-current" />}
            Iniciar Cruzamento de Dados
          </Button>
        </div>

        {/* Resultados */}
        {divergencias.length > 0 && (
          <Card className="border-none shadow-md overflow-hidden mt-8 animate-fade-in">
            <CardHeader className="bg-white border-b border-borderLight flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-bold text-red-600 flex items-center gap-2">
                Divergências Encontradas ({divergencias.filter(d => !d.resolvido).length} Pendentes)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F8FAFC]">
                      <th className="px-6 py-4 text-xs font-bold text-brand-muted border-b border-borderLight uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-xs font-bold text-brand-muted border-b border-borderLight uppercase tracking-wider">Razão Social (Origem)</th>
                      <th className="px-6 py-4 text-xs font-bold text-brand-muted border-b border-borderLight uppercase tracking-wider">Particularidades</th>
                      <th className="px-6 py-4 text-xs font-bold text-brand-muted border-b border-borderLight uppercase tracking-wider">Fatura</th>
                      <th className="px-6 py-4 text-xs font-bold text-brand-muted border-b border-borderLight uppercase tracking-wider">Faturamento</th>
                      <th className="px-6 py-4 text-xs font-bold text-brand-muted border-b border-borderLight uppercase tracking-wider">Linha CSV</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borderLight bg-white">
                    {divergencias.map((div) => (
                      <tr key={div.id} className={`transition-colors ${div.resolvido ? 'bg-gray-50/50 opacity-60' : 'hover:bg-red-50/30'}`}>
                        <td className="px-6 py-4">
                          <button onClick={() => toggleResolvido(div)} className="focus:outline-none transition-transform hover:scale-110">
                            {div.resolvido ? (
                              <CheckCircle2 className="h-6 w-6 text-green-500" />
                            ) : (
                              <Circle className="h-6 w-6 text-gray-300 hover:text-green-400" />
                            )}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-brand-blue">{div.razao_social}</td>
                        <td className="px-6 py-4 text-sm text-brand-muted">{div.particularidades}</td>
                        <td className="px-6 py-4 text-sm text-brand-muted">{div.fatura}</td>
                        <td className="px-6 py-4 text-sm text-brand-muted">{div.faturamento || "-"}</td>
                        <td className="px-6 py-4 text-sm text-brand-muted">L{div.linha_csv}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
