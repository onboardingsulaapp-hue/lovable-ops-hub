import React, { useRef, useState, useEffect } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Job } from "@/types/pendencia";
import { toast } from "sonner";
import { upload } from "@vercel/blob/client";

const REQUIRED_HEADER_FIELDS = [
  "Razão Social do Cliente",
  "Produto",
  "Status da Empresa",
  "Inicio da Vigência de Contrato",
  "CONSULTOR DE ONBOARDING",
];

const HEADER_STARTS_WITH = "Carimbo de data/hora";
const MAX_DIRECT_UPLOAD_SIZE = 4 * 1024 * 1024; // 4MB

interface ParsedCsvInfo {
  headerRow: number;
  totalDataRows: number;
  columns: string[];
  missingColumns: string[];
}

function parseCsvHeader(text: string): ParsedCsvInfo | null {
  const marker = HEADER_STARTS_WITH;
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) return null;

  // Scanner de cabeçalho resiliente
  const sub = text.substring(markerIndex);
  const columns: string[] = [];
  let current = "";
  let inQuotes = false;
  let charIndex = 0;

  for (; charIndex < sub.length; charIndex++) {
    const char = sub[charIndex];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      columns.push(current.trim().replace(/^"|"$/g, "").replace(/\n/g, " "));
      current = "";
    } else if (char === '\n' && !inQuotes) {
      columns.push(current.trim().replace(/^"|"$/g, "").replace(/\n/g, " "));
      current = "";
      break;
    } else {
      current += char;
    }
  }
  
  if (current) {
    columns.push(current.trim().replace(/^"|"$/g, "").replace(/\n/g, " "));
  }

  const cleanedColumns = columns;
  
  // O resto do arquivo são os dados
  const dataPart = sub.substring(charIndex + 1);
  const dataRows = dataPart.split(/\r?\n/).filter(l => l.trim().length > 5);

  const missingColumns = REQUIRED_HEADER_FIELDS.filter(
    (req) => !cleanedColumns.some((col) => col.toLowerCase().includes(req.toLowerCase()))
  );

  const linesBefore = text.substring(0, markerIndex).split('\n').length;

  return {
    headerRow: linesBefore,
    totalDataRows: dataRows.length,
    columns: cleanedColumns,
    missingColumns,
  };
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    queued: "⏳ Aguardando…",
    running: "🔄 Processando…",
    success: "✅ Concluído",
    failed: "❌ Falhou",
  };
  return map[status] ?? status;
}

function statusColor(status: string) {
  const map: Record<string, string> = {
    queued: "#f59e0b",
    running: "#3b82f6",
    success: "#10b981",
    failed: "#ef4444",
  };
  return map[status] ?? "#6b7280";
}

export default function UploadNovaCsvPanel() {
  const { profile: user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvInfo, setCsvInfo] = useState<ParsedCsvInfo | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);

  useEffect(() => {
    if (!user || user.role !== "admin") return;

    const q = query(
      collection(db, "jobs"),
      where("tipo", "==", "sync_nova_csv"),
      orderBy("requested_at", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const jobs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Job));
        setRecentJobs(jobs.slice(0, 10));
      },
      (err) => {
        console.error("Erro ao escutar jobs:", err);
      }
    );

    return () => unsub();
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setParseError(null);
    setCsvInfo(null);
    setSelectedFile(null);

    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      setParseError("Por favor, selecione um arquivo .csv");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const info = parseCsvHeader(text);
      if (!info) {
        setParseError(`Cabeçalho inválido: não foi encontrada a coluna "${HEADER_STARTS_WITH}". Verifique se este é o arquivo correto do Google Forms.`);
        return;
      }
      setCsvInfo(info);
      setSelectedFile(file);
    };
    reader.readAsText(file, "utf-8");
  };

  const handleDirectUpload = async (idToken: string) => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch("/api/sync_nova", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro no processamento direto");
      }

      const result = await response.json();
      toast.success(`Sincronização concluída! Job ID: ${result.jobId}`);
    } catch (err: any) {
      console.error("Direct Upload Error:", err);
      toast.error(err.message);
    }
  };

  const handleBlobUpload = async (idToken: string) => {
    if (!selectedFile) return;

    try {
      const newBlob = await upload(selectedFile.name, selectedFile, {
        access: "public",
        handleUploadUrl: "/api/blob/upload-csv",
        clientPayload: JSON.stringify({ idToken, tipoSync: 'nova' }), // Passamos o tipo para o blob handler saber (se necessário)
        onUploadProgress: (progressEvent) => {
          setUploadProgress(progressEvent.percentage);
        },
      });

      toast.success(`Upload grande concluído! Job agendado.`);
      console.log("Blob created:", newBlob.url);
    } catch (err: any) {
      console.error("Blob Upload Error:", err);
      toast.error(err.message);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !csvInfo || csvInfo.missingColumns.length > 0) return;
    if (!user || user.role !== "admin") {
      toast.error("Apenas administradores podem iniciar a sincronização.");
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error("Sessão expirada. Faça login novamente.");
      }

      if (selectedFile.size <= MAX_DIRECT_UPLOAD_SIZE) {
        console.log("Using direct sync path (nova) (<= 4MB)");
        await handleDirectUpload(idToken);
      } else {
        console.log("Using Blob sync path (nova) (> 4MB)");
        await handleBlobUpload(idToken);
      }

      setSelectedFile(null);
      setCsvInfo(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      console.error("Upload process error:", err);
      toast.error(err.message);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div
        style={{
          background: "rgba(16,185,129,0.04)",
          border: "1px solid rgba(16,185,129,0.2)",
          borderRadius: "12px",
          padding: "24px",
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <h3 style={{ color: "#f1f5f9", fontSize: "16px", fontWeight: 600 }}>
              📝 Sincronizar Planilha Geral
            </h3>
            <span style={{ fontSize: '10px', color: '#10b981', background: 'rgba(16,185,129,0.1)', padding: '2px 6px', borderRadius: '4px' }}>UNIFICADO</span>
        </div>
        <p style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "20px" }}>
          Sincronize as Pendências e a Pipeline da Planilha de forma unificada.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          style={{ display: "none" }}
          id="csv-nova-upload-input"
        />
        <label
          htmlFor="csv-nova-upload-input"
          style={{
            display: "inline-block",
            padding: "10px 20px",
            background: "rgba(16,185,129,0.15)",
            border: "1px solid rgba(16,185,129,0.4)",
            borderRadius: "8px",
            color: "#6ee7b7",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: 500,
            transition: "all 0.2s",
          }}
        >
          Selecionar arquivo .csv (Geral)
        </label>

        {parseError && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px",
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "8px",
              color: "#fca5a5",
              fontSize: "13px",
            }}
          >
            ⚠️ {parseError}
          </div>
        )}

        {csvInfo && (
          <div
            style={{
              marginTop: "16px",
              padding: "16px",
              background: "rgba(16,185,129,0.08)",
              border: "1px solid rgba(16,185,129,0.25)",
              borderRadius: "8px",
            }}
          >
            <p style={{ color: "#6ee7b7", fontSize: "13px", fontWeight: 600, marginBottom: "8px" }}>
              ✅ Arquivo Planilha Geral Detectado
            </p>
            <div style={{ color: "#94a3b8", fontSize: "13px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span>📄 Arquivo: <strong style={{ color: "#e2e8f0" }}>{selectedFile?.name}</strong></span>
              <span>📍 Linha do cabeçalho: <strong style={{ color: "#e2e8f0" }}>{csvInfo.headerRow}</strong></span>
              <span>📊 Linhas de dados: <strong style={{ color: "#e2e8f0" }}>{csvInfo.totalDataRows}</strong></span>
            </div>

            {csvInfo.missingColumns.length > 0 && (
              <div
                style={{
                  marginTop: "12px",
                  padding: "10px",
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: "6px",
                  color: "#fca5a5",
                  fontSize: "12px",
                }}
              >
                ❌ Colunas obrigatórias ausentes para o modo Nova:
                <ul style={{ margin: "6px 0 0 16px", paddingLeft: 0 }}>
                  {csvInfo.missingColumns.map((col) => (
                    <li key={col}>{col}</li>
                  ))}
                </ul>
              </div>
            )}

            {csvInfo.missingColumns.length === 0 && (
              <button
                onClick={handleUpload}
                disabled={uploading}
                style={{
                  marginTop: "16px",
                  padding: "10px 24px",
                  background: uploading ? "rgba(16,185,129,0.4)" : "rgba(16,185,129,0.8)",
                  border: "none",
                  borderRadius: "8px",
                  color: "#fff",
                  cursor: uploading ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  fontWeight: 600,
                  transition: "all 0.2s",
                }}
              >
                {uploading ? `🚀 Sincronizando Planilha Geral… ${uploadProgress > 0 ? `${uploadProgress}%` : ""}` : "🚀 Iniciar Sincronização Geral"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Recent Nova Jobs */}
      <div
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "12px",
          padding: "24px",
        }}
      >
        <h3 style={{ color: "#f1f5f9", marginBottom: "16px", fontSize: "16px", fontWeight: 600 }}>
          🕒 Histórico de Sincronizações
        </h3>

        {recentJobs.length === 0 ? (
          <p style={{ color: "#64748b", fontSize: "13px" }}>Nenhum job de sincronização nova encontrado.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {recentJobs.map((job) => (
              <div
                key={job.id}
                style={{
                  padding: "14px 16px",
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid ${statusColor(job.status)}44`,
                  borderLeft: `3px solid ${statusColor(job.status)}`,
                  borderRadius: "8px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#e2e8f0", fontSize: "13px", fontWeight: 500 }}>
                    {statusLabel(job.status)}
                  </span>
                  <span style={{ color: "#475569", fontSize: "11px" }}>
                    {job.requested_at?.toDate?.()?.toLocaleString?.("pt-BR") ?? "—"}
                  </span>
                </div>

                {job.file && (
                  <p style={{ color: "#64748b", fontSize: "12px", marginTop: "4px" }}>
                    📄 {job.file.name || job.file.pathname}
                  </p>
                )}

                {job.status === "success" && job.result && (
                  <div style={{ marginTop: "8px", color: "#6ee7b7", fontSize: "12px", display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      <strong>Pendências:</strong>
                      <span>Total: {job.result.linhas_total}</span>
                      <span>•</span>
                      <span>Criadas: {job.result.criadas}</span>
                      <span>•</span>
                      <span>Atualizadas: {job.result.atualizadas}</span>
                    </div>
                    {job.result.pipeline_stats && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", color: "#60a5fa" }}>
                        <strong>Pipeline:</strong>
                        <span>Processadas: {job.result.pipeline_stats.processed}</span>
                        <span>•</span>
                        <span>Removidas: {job.result.pipeline_stats.deleted}</span>
                      </div>
                    )}
                  </div>
                )}
                
                <p style={{ color: "#334155", fontSize: "10px", marginTop: "4px" }}>ID: {job.id}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
