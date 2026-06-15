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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Upload, Play, CheckCircle2, Circle, FileSpreadsheet, Loader2, MoreHorizontal, PauseCircle, RotateCcw, Clock, Mail } from "lucide-react";
import emailjs from "@emailjs/browser";
import { analisarDivergenciasFinanceiras } from "@/lib/financial-rules";
import { salvarPendenciasFinanceiras, resolverPendenciasFinanceiras, AuditoriaFinanceiraItem, normalizeId } from "@/lib/financial-store";

interface Divergencia {
  id: string; // fingerprint (razao_social_normalizada)
  razao_social: string;
  particularidades: string;
  fatura: string;
  faturamento: string;
  linha_csv: number;
  planilha_origem: string;
  status?: "Em Aberto" | "Em Espera" | "Resolvido";
  consultor_onboarding?: string;
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
  const [historicoStatus, setHistoricoStatus] = useState<Record<string, string>>({});

  // Carregar histórico de divergências resolvidas/em espera do Firestore
  useEffect(() => {
    if (!user || user.role !== "admin") return;
    const q = query(collection(db, "divergencias_financeiras"));
    const unsub = onSnapshot(q, (snap) => {
      const dbDivergencias = snap.docs.map(d => {
        return { ...d.data(), id: d.id } as Divergencia;
      });
      // Opcional: ordenar para mostrar "Em Aberto" primeiro
      dbDivergencias.sort((a, b) => {
        if (a.status === "Em Aberto" && b.status !== "Em Aberto") return -1;
        if (a.status !== "Em Aberto" && b.status === "Em Aberto") return 1;
        return 0;
      });
      setDivergencias(dbDivergencias);
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
    
    // Encontra a linha de cabeçalho real usando palavras-chave definitivas
    // que só aparecem nos nomes de colunas e não em sub-títulos genéricos.
    for (let i = 0; i < lines.length; i++) {
      const lineLower = lines[i].toLowerCase();
      // Exigir palavras-chave muito específicas de cabeçalho (evita linhas de subtítulo com "Faturamento" etc.)
      const ehCabecalhoReal = 
        lineLower.includes("razão social") || lineLower.includes("razao social") ||
        lineLower.includes("nome empresa") || lineLower.includes("nome da empresa") ||
        lineLower.includes("cnpj");
      const temDelimitadores = lines[i].split(/[;,\t]/).length > 3;
      
      if (ehCabecalhoReal && temDelimitadores) {
        headerRowIndex = i;
        break;
      }
    }

    const csvData = text.split(/\r?\n/).slice(headerRowIndex).join("\n");

    console.log(`[CSV Parser] Arquivo: ${file.name} | Cabeçalho encontrado na linha: ${headerRowIndex}`);
    console.log(`[CSV Parser] Cabeçalho: ${lines[headerRowIndex].substring(0, 200)}...`);

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

      // 1. Analisar Divergências Financeiras (Motor de Regras Estrito)
      const divergenciasEncontradas = analisarDivergenciasFinanceiras(dadosTime, dadosFinanceiro, fileTime.name);

      // 2. Salvar as pendências de forma persistente na coleção `auditoria_financeira`
      const dataAtual = new Date();
      const mesAno = `${String(dataAtual.getMonth() + 1).padStart(2, '0')}_${dataAtual.getFullYear()}`;
      await salvarPendenciasFinanceiras(divergenciasEncontradas, mesAno);

      // 3. Resolução Automática: As que estavam pendentes/em espera e sumiram agora, foram resolvidas!
      const novasIds = new Set(divergenciasEncontradas.map(d => `${normalizeId(d.razao_social)}_${mesAno}`));
      const docsToResolve = divergencias.filter(d => 
        d.id.endsWith(`_${mesAno}`) && 
        d.status !== "Resolvido" && 
        !novasIds.has(d.id)
      );

      if (docsToResolve.length > 0) {
        await resolverPendenciasFinanceiras(docsToResolve.map(d => d.id));
      }

      if (divergenciasEncontradas.length > 0 || docsToResolve.length > 0) {
        toast.success(`Foram encontradas ${divergenciasEncontradas.length} pendências e ${docsToResolve.length} foram resolvidas automaticamente.`, { id: "cruzamento" });
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

  const handleUpdateStatus = async (div: Divergencia, novoStatus: "Em Aberto" | "Em Espera" | "Resolvido") => {
    // Como a tabela agora é reativa ao onSnapshot do banco, atualizar o banco é suficiente.
    try {
      const docRef = doc(db, "divergencias_financeiras", div.id);
      
      await setDoc(docRef, {
        status: novoStatus,
        data_atualizacao: new Date().toISOString(),
        atualizado_por: user?.nome
      }, { merge: true });
      
      toast.success(`Status alterado para ${novoStatus}.`);
    } catch (error) {
      console.error("Erro ao salvar no Firestore:", error);
      toast.error("Erro ao atualizar o status.");
    }
  };

  const handleSendEmails = async () => {
    const pendentes = divergencias.filter(d => d.status === "Em Aberto");
    if (pendentes.length === 0) {
      toast.info("Não há pendências financeiras 'Em Aberto' para disparar.");
      return;
    }

    const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID || "";
    const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || "";
    const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY || "";

    if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
      toast.error("Chaves do EmailJS não configuradas.");
      return;
    }

    // Agrupar por consultor
    const pendsByColab: Record<string, Divergencia[]> = {};
    pendentes.forEach(d => {
      const nome = d.consultor_onboarding || "Sem Responsável";
      const lowerNome = nome.toLowerCase();
      if (lowerNome.includes("sem respons") || lowerNome.includes("não informado")) return;
      
      const nomeNorm = normalizeString(nome);
      if (!pendsByColab[nomeNorm]) pendsByColab[nomeNorm] = [];
      pendsByColab[nomeNorm].push(d);
    });

    const entries = Object.entries(pendsByColab);
    if (entries.length === 0) {
      toast.info("Nenhuma pendência válida vinculada a um consultor.");
      return;
    }

    let metricas = { enviados: 0, falhas: 0 };
    toast.loading(`Iniciando disparos para ${entries.length} consultores...`, { id: "email-batch" });

    try {
      const { getDocs } = await import("firebase/firestore");
      const usersSnap = await getDocs(collection(db, "usuarios"));
      const allUsers = usersSnap.docs.map(doc => doc.data());

      for (let i = 0; i < entries.length; i++) {
        const [colabNorm, pends] = entries[i];
        
        const target = allUsers.find(u => normalizeString(u.nome) === colabNorm || normalizeString(u.email) === colabNorm);
        
        if (!target || !target.email) {
          console.warn(`Pulando ${colabNorm}: E-mail não encontrado.`);
          metricas.falhas++;
          continue;
        }

        toast.loading(`Enviando ${i + 1} de ${entries.length}: ${target.nome}...`, { id: "email-batch" });

        let rowsHtml = "";
        pends.forEach(d => {
          rowsHtml += `
            <tr style="border-bottom: 1px solid #E2E8F0; background-color: #ffffff;">
              <td style="padding: 12px; font-size: 13px; color: #1D2E5D; font-weight: bold;">${d.razao_social}</td>
              <td style="padding: 12px; font-size: 13px; color: #EF482B; font-weight: 500;">${d.particularidades}</td>
              <td style="padding: 12px; font-size: 13px; color: #1D2E5D;">${d.fatura}</td>
            </tr>
          `;
        });

        const my_html_content = `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1D2E5D; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #1D2E5D; color: white; padding: 24px; text-align: center;">
              <h2 style="margin: 0; font-size: 22px; font-weight: bold; text-transform: uppercase;">Divergências Financeiras</h2>
              <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.8;">Auditoria de Faturamento | SulAmérica</p>
            </div>
            
            <div style="padding: 32px; background-color: #ffffff;">
              <p style="font-size: 16px; margin-bottom: 20px;">Olá <strong>${target.nome}</strong>,</p>
              
              <div style="background-color: #FFF5F5; border-left: 4px solid #EF482B; padding: 20px; margin: 24px 0; border-radius: 4px;">
                <p style="margin: 0; color: #EF482B; font-weight: 800; font-size: 16px;">
                  ⚠️ AÇÃO NECESSÁRIA
                </p>
                <p style="margin: 8px 0 0 0; font-size: 14px; color: #737D9A; font-weight: 500;">
                  As empresas abaixo sob sua responsabilidade constam na auditoria de faturamento com informações pendentes ou divergentes.
                </p>
              </div>

              <p style="font-size: 14px; color: #737D9A; margin-bottom: 16px;">
                Foram encontradas <strong>${pends.length}</strong> pendência(s):
              </p>
              
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
                <thead>
                  <tr style="background-color: #F7F8FA;">
                    <th style="padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #737D9A; border-bottom: 2px solid #E2E8F0;">Empresa</th>
                    <th style="padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #737D9A; border-bottom: 2px solid #E2E8F0;">Particularidades</th>
                    <th style="padding: 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #737D9A; border-bottom: 2px solid #E2E8F0;">Fatura</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>

              <div style="text-align: center; margin: 32px 0;">
                <a href="https://docs.google.com/spreadsheets/d/19xXuVjLdy2ZiKhZFtClAwcH3kOPrNj8_sUQzY4XTcrI/edit?usp=sharing" target="_blank" style="background-color: #EF482B; color: white; padding: 14px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px rgba(239, 72, 43, 0.2);">
                  Acessar Controle Financeiro
                </a>
              </div>

              <div style="border-top: 1px solid #E2E8F0; padding-top: 24px; margin-top: 32px; text-align: center;">
                <p style="font-size: 12px; color: #737D9A; margin: 0;">
                  Esta é uma mensagem automática. Por favor, não responda a este e-mail.<br>
                  <strong>SulAmérica | Operações Corporativas</strong>
                </p>
              </div>
            </div>
          </div>
        `;

        try {
          await emailjs.send(SERVICE_ID, TEMPLATE_ID, {
            to_name: target.nome,
            to_email: target.email,
            subject: `Divergências de Faturamento (${pends.length} pendentes)`,
            my_html_content: my_html_content
          }, PUBLIC_KEY);
          
          metricas.enviados++;
        } catch (err) {
          console.error(`[EmailJS] Falha ao enviar para ${target.nome}:`, err);
          metricas.falhas++;
        }

        if (i < entries.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      toast.success(`Processo concluído: ${metricas.enviados} enviados, ${metricas.falhas} falhas.`, { id: "email-batch" });
    } catch (err) {
      console.error(err);
      toast.error("Erro geral no disparo de e-mails.", { id: "email-batch" });
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

        {/* Botões de Ação */}
        <div className="flex justify-center gap-4">
          <Button 
            size="lg" 
            onClick={handleProcessar}
            disabled={!fileTime || !fileFinanceiro || isProcessing}
            className="bg-brand-blue hover:bg-brand-blue/90 text-white font-bold px-8 shadow-md"
          >
            {isProcessing ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Play className="mr-2 h-5 w-5 fill-current" />}
            Iniciar Cruzamento de Dados
          </Button>

          {divergencias.length > 0 && (
            <Button
              size="lg"
              onClick={handleSendEmails}
              disabled={divergencias.filter(d => d.status === "Em Aberto").length === 0}
              className="bg-brand-orange hover:bg-brand-orange/90 text-white font-bold px-8 shadow-md"
            >
              <Mail className="mr-2 h-5 w-5" />
              Disparar Cobranças
            </Button>
          )}
        </div>

        {/* Resultados */}
        {divergencias.length > 0 && (
          <Card className="border-none shadow-md overflow-hidden mt-8 animate-fade-in">
            <CardHeader className="bg-white border-b border-borderLight flex flex-row items-center justify-between">
              <CardTitle className="text-lg font-bold text-red-600 flex items-center gap-2">
                Divergências Encontradas ({divergencias.filter(d => d.status === "Em Aberto").length} Pendentes)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#F8FAFC]">
                      <th className="px-6 py-4 text-xs font-bold text-brand-muted border-b border-borderLight uppercase tracking-wider">Ações</th>
                      <th className="px-6 py-4 text-xs font-bold text-brand-muted border-b border-borderLight uppercase tracking-wider">Razão Social (Origem)</th>
                      <th className="px-6 py-4 text-xs font-bold text-brand-muted border-b border-borderLight uppercase tracking-wider">Particularidades</th>
                      <th className="px-6 py-4 text-xs font-bold text-brand-muted border-b border-borderLight uppercase tracking-wider">Fatura</th>
                      <th className="px-6 py-4 text-xs font-bold text-brand-muted border-b border-borderLight uppercase tracking-wider">Faturamento</th>
                      <th className="px-6 py-4 text-xs font-bold text-brand-muted border-b border-borderLight uppercase tracking-wider">Consultor</th>
                      <th className="px-6 py-4 text-xs font-bold text-brand-muted border-b border-borderLight uppercase tracking-wider">Linha CSV</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borderLight bg-white">
                    {divergencias.map((div) => (
                      <tr key={div.id} className={`transition-colors ${div.status === 'Resolvido' ? 'bg-gray-50/50 opacity-60' : div.status === 'Em Espera' ? 'bg-amber-50/50 opacity-80' : 'hover:bg-red-50/30'}`}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {div.status === 'Resolvido' ? (
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                            ) : div.status === 'Em Espera' ? (
                              <Clock className="h-5 w-5 text-amber-500" />
                            ) : (
                              <Circle className="h-5 w-5 text-gray-300" />
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 flex-shrink-0">
                                  <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-48">
                                {div.status === 'Resolvido' && (
                                  <DropdownMenuItem onClick={() => handleUpdateStatus(div, "Em Aberto")}>
                                    <RotateCcw className="h-4 w-4 mr-2" />
                                    Reabrir
                                  </DropdownMenuItem>
                                )}
                                {div.status !== 'Resolvido' && (
                                  <DropdownMenuItem onClick={() => handleUpdateStatus(div, "Resolvido")}>
                                    <CheckCircle2 className="h-4 w-4 mr-2" />
                                    Marcar Resolvido
                                  </DropdownMenuItem>
                                )}
                                {div.status !== 'Resolvido' && (
                                  <DropdownMenuItem onClick={() => handleUpdateStatus(div, div.status === "Em Espera" ? "Em Aberto" : "Em Espera")}>
                                    <PauseCircle className="h-4 w-4 mr-2" />
                                    {div.status === "Em Espera" ? "Retirar de Espera" : "Colocar em Espera"}
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-brand-blue flex flex-col gap-1">
                          {div.razao_social}
                          {div.status === "Em Espera" && (
                            <span className="inline-flex w-fit items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              Em Espera
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-brand-muted">{div.particularidades}</td>
                        <td className="px-6 py-4 text-sm text-brand-muted">{div.fatura}</td>
                        <td className="px-6 py-4 text-sm text-brand-muted">{div.faturamento || "-"}</td>
                        <td className="px-6 py-4 text-sm text-brand-muted font-medium">{div.consultor_onboarding || "Sem Responsável"}</td>
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
