import { useState } from "react";
import { collection, query, where, getDocs, limit, startAfter, QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { FileText, Loader2, ChevronDown } from "lucide-react";

interface PendenciaDoc {
  colaborador_nome?: string;
  colaborador_email?: string;
  colaborador_id?: string;
  linha_planilha?: number | string;
  linha_csv?: number | string;
  razao_social?: string;
  tipo_implantacao?: string;
  produto?: string;
  data_vigencia?: string;
  inicio_vigencia_contrato?: string;
  itens_pendentes?: string[];
  pendencias?: string[];
  erros?: string[];
  fingerprint?: string;
  atualizado_em?: any;
  updated_at?: any;
  last_update?: any;
  status?: string;
  isDeleted?: boolean;
  id: string;
}

type FormatoRelatorio = "txt" | "md";

const BATCH_SIZE = 250;

function formatDate(val: any): string {
  if (!val) return "-";
  if (typeof val === "object" && "seconds" in val) {
    return new Date(val.seconds * 1000).toLocaleString("pt-BR");
  }
  if (typeof val === "string") {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toLocaleString("pt-BR");
    return val;
  }
  return String(val);
}

function getGroupKey(p: PendenciaDoc): string {
  return p.colaborador_id?.trim() ||
    p.colaborador_email?.trim() ||
    p.colaborador_nome?.trim() ||
    "__sem_responsavel__";
}

function getLinhaDisplay(p: PendenciaDoc): string {
  const linha = p.linha_planilha ?? p.linha_csv;
  if (linha === undefined || linha === null || linha === "") return "-";
  return String(linha).padStart(4, "0");
}

function getItens(p: PendenciaDoc): string[] {
  const arr = p.itens_pendentes ?? p.pendencias ?? p.erros ?? [];
  return Array.isArray(arr) ? arr : [];
}

function getAtualizadoEm(p: PendenciaDoc): string {
  return formatDate(p.atualizado_em ?? p.updated_at ?? p.last_update);
}

function getDataVigencia(p: PendenciaDoc): string {
  return p.data_vigencia ?? p.inicio_vigencia_contrato ?? "-";
}

function getProduto(p: PendenciaDoc): string {
  return p.tipo_implantacao ?? p.produto ?? "-";
}

async function fetchAllPendencias(): Promise<PendenciaDoc[]> {
  const all: PendenciaDoc[] = [];
  const colRef = collection(db, "pendencias");
  let lastDoc: QueryDocumentSnapshot | null = null;
  let hasMore = true;

  while (hasMore) {
    let q = query(
      colRef,
      where("status", "==", "Pendente"),
      where("isDeleted", "==", false),
      limit(BATCH_SIZE)
    );

    if (lastDoc) {
      q = query(
        colRef,
        where("status", "==", "Pendente"),
        where("isDeleted", "==", false),
        limit(BATCH_SIZE),
        startAfter(lastDoc)
      );
    }

    const snap = await getDocs(q);

    if (snap.empty) {
      hasMore = false;
      break;
    }

    snap.docs.forEach((doc) => {
      all.push({ id: doc.id, ...doc.data() } as PendenciaDoc);
    });

    if (snap.docs.length < BATCH_SIZE) {
      hasMore = false;
    } else {
      lastDoc = snap.docs[snap.docs.length - 1];
    }
  }

  // Fallback: tentar também pendências sem o campo isDeleted (retrocompatibilidade)
  if (all.length === 0) {
    const q2 = query(colRef, where("status", "==", "Pendente"), limit(1000));
    const snap2 = await getDocs(q2);
    snap2.docs.forEach((doc) => {
      const data = doc.data();
      if (!data.isDeleted) {
        all.push({ id: doc.id, ...data } as PendenciaDoc);
      }
    });
  }

  return all;
}

function buildRelatorio(pendencias: PendenciaDoc[], formato: FormatoRelatorio, geradoEm: string): string {
  const hr = formato === "md"
    ? "\n---\n"
    : "\n" + "=".repeat(80) + "\n";

  const lines: string[] = [];

  const titulo = "RELATÓRIO DE PENDÊNCIAS — AGRUPADO POR COLABORADOR";
  if (formato === "md") {
    lines.push(`# ${titulo}`);
    lines.push(`\n**Gerado em:** ${geradoEm}  `);
    lines.push(`**Total de pendências:** ${pendencias.length}  \n`);
  } else {
    lines.push(titulo);
    lines.push("=".repeat(80));
    lines.push(`Gerado em: ${geradoEm}`);
    lines.push(`Total de pendências: ${pendencias.length}`);
  }

  lines.push(hr);

  // Agrupar
  const grupos = new Map<string, PendenciaDoc[]>();
  for (const p of pendencias) {
    const key = getGroupKey(p);
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key)!.push(p);
  }

  // Ordenar colaboradores por nome
  const sortedGroups = Array.from(grupos.entries()).sort(([, a], [, b]) => {
    const nomeA = (a[0].colaborador_nome ?? "Sem responsável").toUpperCase();
    const nomeB = (b[0].colaborador_nome ?? "Sem responsável").toUpperCase();
    if (nomeA === "SEM RESPONSÁVEL") return 1;
    if (nomeB === "SEM RESPONSÁVEL") return -1;
    return nomeA.localeCompare(nomeB, "pt-BR");
  });

  for (const [, pends] of sortedGroups) {
    const primeiro = pends[0];
    const nome = primeiro.colaborador_nome?.trim() || "Sem responsável";
    const email = primeiro.colaborador_email?.trim() || "-";

    // Ordenar pendências dentro do grupo
    const ordenado = [...pends].sort((a, b) => {
      const la = Number(a.linha_planilha ?? a.linha_csv ?? 0);
      const lb = Number(b.linha_planilha ?? b.linha_csv ?? 0);
      if (la !== lb) return la - lb;
      return (a.razao_social ?? "").localeCompare(b.razao_social ?? "", "pt-BR");
    });

    if (formato === "md") {
      lines.push(`## Colaborador: ${nome}`);
      lines.push(`- **Email:** ${email}`);
      lines.push(`- **Total de pendências:** ${ordenado.length}`);
      lines.push("");
    } else {
      lines.push(`Colaborador: ${nome}`);
      lines.push(`Email: ${email}`);
      lines.push(`Total de pendências: ${ordenado.length}`);
      lines.push("");
    }

    for (const p of ordenado) {
      const linha = getLinhaDisplay(p);
      const razao = p.razao_social?.trim() || "-";
      const produto = getProduto(p);
      const vigencia = getDataVigencia(p);
      const itens = getItens(p);
      const fp = p.fingerprint || p.id;
      const atualizado = getAtualizadoEm(p);

      if (formato === "md") {
        lines.push(`### Linha ${linha} | ${razao}`);
        lines.push(`- **Produto/Tipo:** ${produto}`);
        lines.push(`- **Início Vigência:** ${vigencia}`);
        lines.push(`- **ID/Fingerprint:** \`${fp}\``);
        lines.push(`- **Última atualização:** ${atualizado}`);
        lines.push(`- **Pendências:**`);
        if (itens.length === 0) {
          lines.push(`  - *(sem itens listados)*`);
        } else {
          for (const item of itens) {
            lines.push(`  - ${item}`);
          }
        }
        lines.push("");
      } else {
        lines.push(`- Linha ${linha} | Razão Social: ${razao} | Produto: ${produto} | Início Vigência: ${vigencia}`);
        lines.push(`  Pendências:`);
        if (itens.length === 0) {
          lines.push(`   - (sem itens listados)`);
        } else {
          for (const item of itens) {
            lines.push(`   - ${item}`);
          }
        }
        lines.push(`  ID/Fingerprint: ${fp}`);
        lines.push(`  Última atualização: ${atualizado}`);
        lines.push("");
      }
    }

    lines.push(hr);
  }

  // Rodapé
  if (formato === "md") {
    lines.push("## Resumo Geral");
    lines.push(`- **Total de colaboradores:** ${sortedGroups.length}`);
    lines.push(`- **Total de pendências:** ${pendencias.length}`);
    lines.push(`- **Data/Hora de geração:** ${geradoEm}`);
  } else {
    lines.push("RESUMO GERAL");
    lines.push("-".repeat(40));
    lines.push(`Total de colaboradores: ${sortedGroups.length}`);
    lines.push(`Total de pendências: ${pendencias.length}`);
    lines.push(`Data/Hora de geração: ${geradoEm}`);
  }

  return lines.join("\n");
}

function downloadFile(content: string, formato: FormatoRelatorio, nomeBase: string) {
  const mimeType = formato === "md" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8";
  const ext = formato === "md" ? "md" : "txt";
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nomeBase}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function GenerateReportButton() {
  const [loading, setLoading] = useState(false);

  async function handleGenerate(formato: FormatoRelatorio) {
    setLoading(true);
    const toastId = toast.loading("Gerando relatório...");

    try {
      const pendencias = await fetchAllPendencias();

      if (pendencias.length === 0) {
        toast.warning("Nenhuma pendência ativa encontrada para gerar o relatório.", { id: toastId });
        setLoading(false);
        return;
      }

      const geradoEm = new Date().toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      });

      // Nome do arquivo: relatorio_pendencias_YYYY-MM-DD_HH-mm
      const now = new Date();
      const nomeBase = `relatorio_pendencias_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}-${String(now.getMinutes()).padStart(2, "0")}`;

      const content = buildRelatorio(pendencias, formato, geradoEm);
      downloadFile(content, formato, nomeBase);

      toast.success(`Relatório gerado com sucesso! (${pendencias.length} pendências)`, { id: toastId });
    } catch (err: any) {
      console.error("[GenerateReport] Erro:", err);
      toast.error(
        err?.code === "permission-denied"
          ? "Falha ao gerar relatório. Verifique permissões do Firestore."
          : "Falha ao gerar relatório. Verifique o console para detalhes.",
        { id: toastId }
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          id="btn-gerar-relatorio"
          variant="outline"
          size="sm"
          disabled={loading}
          className="bg-white border-[#1D2E5D] text-[#1D2E5D] hover:bg-[#F7F8FA] font-bold py-5 px-6 shadow-none"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <FileText className="h-4 w-4 mr-2" />
          )}
          {loading ? "Gerando..." : "Gerar Relatório"}
          {!loading && <ChevronDown className="h-3 w-3 ml-2 opacity-60" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        <DropdownMenuItem
          onClick={() => handleGenerate("txt")}
          className="cursor-pointer font-medium"
        >
          <FileText className="h-4 w-4 mr-2" />
          Baixar como TXT
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleGenerate("md")}
          className="cursor-pointer font-medium"
        >
          <FileText className="h-4 w-4 mr-2" />
          Baixar como Markdown
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
