import React, { useState, useEffect, useRef } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { PipelineChart } from "@/components/PipelineChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { FileBarChart, Upload, Loader2, Info, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function PipelineDashboard() {
  const { profile: user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      toast.error("Por favor, selecione um arquivo .csv");
      return;
    }

    setUploading(true);
    const toastId = toast.loading("Sincronizando Volumetria...");

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Sessão expirada.");

      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/sync_pipeline", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Falha na sincronização");
      }

      const result = await response.json();
      toast.success(`Pipeline atualizado! Processados: ${result.processed}, Removidos: ${result.deleted}`, { id: toastId });
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
            <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-brand-muted hover:text-brand-blue">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-brand-blue flex items-center gap-2">
                <FileBarChart className="h-6 w-6" />
                Dashboard de Volumetria
              </h1>
              <p className="text-sm text-brand-muted font-medium">Controle de Pipeline e Carga por Consultor</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
              id="pipeline-csv-input"
            />
            <Button
              asChild
              disabled={uploading}
              className="bg-brand-blue hover:bg-brand-blue/90 text-white font-bold py-5 px-6 shadow-md transition-all active:scale-95"
            >
              <label htmlFor="pipeline-csv-input" className="cursor-pointer flex items-center gap-2">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? "Sincronizando..." : "Sincronizar CSV Diário"}
              </label>
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-8">
        <div className="grid grid-cols-1 gap-8">
          {/* Info Alert */}
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-500 mt-0.5" />
            <div className="text-sm text-blue-700">
              <p className="font-bold mb-1">Como funciona a Volumetria?</p>
              <p>Este painel reflete exatamente o estado atual do CSV carregado. Somente os status <strong>"EM CURSO"</strong> e <strong>"FUTURA"</strong> são contabilizados. Empresas que mudarem para status finalizados ou que forem removidas do CSV sairão automaticamente deste gráfico.</p>
            </div>
          </div>

          {/* Chart Card */}
          <Card className="border border-borderLight shadow-sm overflow-hidden">
            <CardHeader className="bg-white border-b border-borderLight pb-4">
              <CardTitle className="text-lg font-bold text-brand-blue flex items-center gap-2 uppercase tracking-wider">
                Volumetria por Consultor (Pipeline Ativo)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 bg-white">
              {data.length === 0 ? (
                <div className="h-[400px] flex flex-col items-center justify-center text-brand-muted opacity-60">
                  <FileBarChart className="h-12 w-12 mb-4" />
                  <p className="font-medium">Nenhum dado de volumetria encontrado.</p>
                  <p className="text-sm">Faça o upload do CSV diário para começar.</p>
                </div>
              ) : (
                <PipelineChart data={data} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
