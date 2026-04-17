import React, { useRef, useState, useEffect } from "react";
import { collection, doc, onSnapshot, orderBy, query, where } from "firebase/firestore";
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
  const lines = text.split(/\r?\n/);
  let headerRowIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith(HEADER_STARTS_WITH)) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) return null;

  const columns = lines[headerRowIndex].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const dataRows = lines.slice(headerRowIndex + 1).filter((l) => l.trim() !== "");
  const missingColumns = REQUIRED_HEADER_FIELDS.filter(
    (req) => !columns.some((col) => col.toLowerCase() === req.toLowerCase())
  );

  return {
    headerRow: headerRowIndex + 1,
    totalDataRows: dataRows.length,
    columns,
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

export default function UploadCsvPanel() {
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
      where("tipo", "==", "sync_pendencias_csv"),
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
        setParseError(`Cabeçalho inválido: não foi encontrada a linha iniciando com "${HEADER_STARTS_WITH}". Verifique o arquivo.`);
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
      const response = await fetch("/api/sync_csv", {
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
        clientPayload: JSON.stringify({ idToken }),
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
      // 1. Obter ID Token do Firebase
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error("Sessão expirada. Faça login novamente.");
      }

      // 2. Escolher caminho baseado no tamanho
      if (selectedFile.size <= MAX_DIRECT_UPLOAD_SIZE) {
        console.log("Using direct sync path (<= 4MB)");
        await handleDirectUpload(idToken);
      } else {
        console.log("Using Blob sync path (> 4MB)");
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
      {/* Upload Section */}
      <div
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "12px",
          padding: "24px",
        }}
      >
        <h3 style={{ color: "#f1f5f9", marginBottom: "8px", fontSize: "16px", fontWeight: 600 }}>
          📂 Sincronizar Pendências via CSV (Vercel Node)
        </h3>
        <p style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "20px" }}>
          Upload direto para arquivos até 4MB. Arquivos maiores usam Vercel Blob e processamento assíncrono.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          style={{ display: "none" }}
          id="csv-upload-input"
        />
        <label
          htmlFor="csv-upload-input"
          style={{
            display: "inline-block",
            padding: "10px 20px",
            background: "rgba(99,102,241,0.15)",
            border: "1px solid rgba(99,102,241,0.4)",
            borderRadius: "8px",
            color: "#818cf8",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: 500,
            transition: "all 0.2s",
          }}
        >
          Selecionar arquivo .csv
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
              ✅ Arquivo válido — Preview
            </p>
            <div style={{ color: "#94a3b8", fontSize: "13px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span>📄 Arquivo: <strong style={{ color: "#e2e8f0" }}>{selectedFile?.name}</strong></span>
              <span>⚖️ Tamanho: <strong style={{ color: "#e2e8f0" }}>{(selectedFile!.size / 1024).toFixed(1)} KB</strong></span>
              <span>📍 Cabeçalho encontrado na linha: <strong style={{ color: "#e2e8f0" }}>{csvInfo.headerRow}</strong></span>
              <span>📊 Linhas de dados: <strong style={{ color: "#e2e8f0" }}>{csvInfo.totalDataRows}</strong></span>
              <span>⚡ Modo: <strong style={{ color: "#e2e8f0" }}>{selectedFile!.size <= MAX_DIRECT_UPLOAD_SIZE ? "Síncrono (Direto)" : "Assíncrono (Blob)"}</strong></span>
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
                ❌ Colunas obrigatórias ausentes:
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
                  background: uploading ? "rgba(99,102,241,0.4)" : "rgba(99,102,241,0.8)",
                  border: "none",
                  borderRadius: "8px",
                  color: "#fff",
                  cursor: uploading ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  fontWeight: 600,
                  transition: "all 0.2s",
                }}
              >
                {uploading ? `🚀 Processando… ${uploadProgress > 0 ? `${uploadProgress}%` : ""}` : "🚀 Iniciar Sincronização"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Recent Jobs Section */}
      <div
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "12px",
          padding: "24px",
        }}
      >
        <h3 style={{ color: "#f1f5f9", marginBottom: "16px", fontSize: "16px", fontWeight: 600 }}>
          🕒 Execuções Recentes
        </h3>

        {recentJobs.length === 0 ? (
          <p style={{ color: "#64748b", fontSize: "13px" }}>Nenhum job de sincronização encontrado.</p>
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
                    📄 {job.file.name || job.file.pathname} ({Math.round(job.file.size / 1024)} KB)
                  </p>
                )}

                {job.status === "success" && job.result && (
                  <div style={{ marginTop: "8px", color: "#6ee7b7", fontSize: "12px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    <span>Total: {job.result.linhas_total}</span>
                    <span>•</span>
                    <span>Ignoradas: {job.result.ignoradas_por_status}</span>
                    <span>•</span>
                    <span>Criadas: {job.result.criadas}</span>
                    <span>•</span>
                    <span>Atualizadas: {job.result.atualizadas}</span>
                  </div>
                )}

                {job.status === "failed" && job.error && (
                  <p style={{ color: "#fca5a5", fontSize: "12px", marginTop: "6px" }}>
                    ❌ {job.error}
                  </p>
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
