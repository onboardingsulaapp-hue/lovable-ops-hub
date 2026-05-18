import { parse } from "csv-parse/browser/esm/sync";

export interface ReportConfig {
  file: File;
  selectedMonth: string; // '01' to '12'
  selectedYear: string;  // '2026', '2027', etc.
}

// Limpeza de string genérica e de cabeçalho
const cleanString = (str: string) => str ? str.trim().replace(/[\u200B-\u200D\uFEFF]/g, "") : "";
const cleanHeader = (header: string) => cleanString(header).replace(/\s+/g, " ").toUpperCase();

const isValidStatus = (status: string) => {
  const s = cleanString(status).toUpperCase();
  return s === "IMPLANTAÇÃO CONCLUÍDA COMPLETA" || s === "IMPLANTAÇÃO CONCLUÍDA COM PENDÊNCIA";
};

const matchesDate = (dateStr: string, month: string, year: string) => {
  if (!dateStr) return false;
  // Assumindo formato DD/MM/YYYY ou YYYY-MM-DD
  const str = cleanString(dateStr);
  let dMonth = "";
  let dYear = "";

  if (str.includes("/")) {
    const parts = str.split("/");
    if (parts.length === 3) {
      dMonth = parts[1];
      dYear = parts[2];
    }
  } else if (str.includes("-")) {
    const parts = str.split("-");
    if (parts.length === 3) {
      dYear = parts[0];
      dMonth = parts[1];
    }
  }

  return dMonth === month && dYear === year;
};

const cleanEmailForCommercialConsultant = (email: string) => {
  if (!email) return "";
  const beforeAt = email.split("@")[0];
  return beforeAt.replace(/\./g, " ").trim();
};

export const exportMonthlyReport = async ({ file, selectedMonth, selectedYear }: ReportConfig) => {
  const text = await file.text();
  const lines = text.split(/\r?\n/);

  // 1. Achar a linha do cabeçalho
  let headerRowIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (cleanString(lines[i]).toLowerCase().startsWith("carimbo de data/hora")) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error("Não foi possível encontrar a linha de cabeçalho (Carimbo de data/hora). Verifique se o arquivo é um CSV válido exportado do formulário.");
  }

  // 2. Extrair o conteúdo real do CSV
  const csvContent = lines.slice(headerRowIndex).join("\n");

  // 3. Fazer o parser
  const records = parse(csvContent, {
    columns: (headers: string[]) => headers.map(cleanHeader),
    skip_empty_lines: true,
    relax_column_count: true,
  });

  // 4. Procurar as chaves exatas mapeadas (buscando pelos nomes limpos e upper case)
  // Como usamos toUpperCase() nos cabeçalhos lidos, faremos a busca assim:
  const colRazaoSocial = "RAZÃO SOCIAL DO CLIENTE";
  const colVidas = "VIDAS IMPLANTADAS";
  const colFaturamento = "FATURAMENTO EMITIDO (R$ MENSAL)";
  const colCongenere = "CONGÊNERE DE ORIGEM";
  const colConsultorOnboarding = "CONSULTOR DE ONBOARDING";
  const colEmail = "ENDEREÇO DE E-MAIL";
  const colDiretoria = "QUAL A SUA DIRETORIA?";
  const colProduto = "PRODUTO";
  const colCodigoProduto = "CÓDIGO DO PRODUTO";
  const colInicioVigencia = "INICIO DA VIGÊNCIA DE CONTRATO";
  const colStatus = "STATUS DA EMPRESA";

  const outputRows: any[] = [];

  // 5. Filtrar e mapear
  records.forEach((row: any) => {
    // Buscar valores baseados nas colunas tratadas
    // Caso a coluna exata tenha pequenas variações no forms, tentamos um match flexível se precisar, 
    // mas o cleanHeader já resolve a maioria dos casos de espaços invisíveis.
    
    // Função auxiliar para pegar valor independente de acentos mínimos se necessário (opcional)
    const getVal = (key: string) => {
        // Tenta achar a chave exata
        if (row[key] !== undefined) return row[key];
        // Fallback: tenta achar chave que inclua a palavra
        const foundKey = Object.keys(row).find(k => k.includes(key));
        return foundKey ? row[foundKey] : "";
    };

    const status = getVal(colStatus);
    const inicioVigencia = getVal(colInicioVigencia) || getVal("INÍCIO DA VIGÊNCIA DE CONTRATO");

    if (isValidStatus(status) && matchesDate(inicioVigencia, selectedMonth, selectedYear)) {
      
      let faturamento = cleanString(getVal(colFaturamento));
      if (!faturamento || faturamento === "0" || faturamento === "0,00" || faturamento.toLowerCase() === "vazio") {
        faturamento = "Sem Dados";
      }

      const rawEmail = getVal(colEmail);
      const consultorComercial = cleanEmailForCommercialConsultant(rawEmail);

      const diretoria = cleanString(getVal(colDiretoria) || getVal("DIRETORIA"));

      const outRow = {
        "Razão Social do Cliente": cleanString(getVal(colRazaoSocial)),
        "Vidas Implantadas": cleanString(getVal(colVidas)),
        "Faturamento Emitido (R$ Mensal)": faturamento,
        "Congênere de Origem": cleanString(getVal(colCongenere)),
        "Consultor de Onboarding": cleanString(getVal(colConsultorOnboarding)),
        "Consultor Comercial": consultorComercial,
        "Qual sua diretoria?": diretoria,
        "Produto": cleanString(getVal(colProduto)),
        "Código do Produto": cleanString(getVal(colCodigoProduto)),
        "Inicio de vigência de contrato": cleanString(inicioVigencia),
      };

      outputRows.push(outRow);
    }
  });

  if (outputRows.length === 0) {
    throw new Error("Nenhum dado encontrado para os filtros selecionados (Mês/Ano e Status).");
  }

  // 6. Gerar CSV string
  const outputHeaders = Object.keys(outputRows[0]);
  const csvString = [
    outputHeaders.join(";"), // Usando ponto e vírgula para abrir no Excel em PT-BR sem dor de cabeça
    ...outputRows.map(row => 
      outputHeaders.map(h => {
        const val = String(row[h] || "");
        // Se tiver ponto e vírgula ou aspas no valor, precisa encapsular
        if (val.includes(";") || val.includes('"')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(";")
    )
  ].join("\n");

  // 7. Download com BOM
  const blob = new Blob(["\uFEFF" + csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `Relatorio_Mensal_${selectedMonth}_${selectedYear}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return outputRows.length;
};
