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
  return s.includes("CONCLUÍDA") || s.includes("CONCLUIDA");
};

const matchesDate = (dateStr: string, month: string, year: string) => {
  if (!dateStr) return false;
  // Assumindo formato DD/MM/YYYY ou YYYY-MM-DD
  const str = cleanString(dateStr);
  let dMonth = "";
  let dYear = "";

  if (str.includes("/")) {
    const parts = str.split("/");
    if (parts.length >= 3) {
      dMonth = parts[1].padStart(2, '0');
      dYear = parts[2].substring(0, 4);
    }
  } else if (str.includes("-")) {
    const parts = str.split("-");
    if (parts.length >= 3) {
      dYear = parts[0].substring(0, 4);
      dMonth = parts[1].padStart(2, '0');
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
  const colSegmento = "SEGMENTO CORPORATIVO OU VAREJO?";
  const colCorretora = "RAZÃO SOCIAL DA CORRETORA RESPONSÁVEL PELA IMPLANTAÇÃO";
  const colTipoImplantacao = "TIPO DE IMPLANTAÇÃO";
  const colProduto = "PRODUTO";
  const colCodigoProduto = "CÓDIGO DO PRODUTO";
  const colDataVigenciaForms = "DATA DE VIGÊNCIA (DD/MM/AAAA)";
  const colInicioVigencia = "INICIO DA VIGÊNCIA DE CONTRATO";
  const colCodEmpresa = "CÓD. DA EMPRESA (SAÚDE/ODONTO)";
  const colCodGrupo = "CÓD. DO GRUPO/APÓLICE";
  const colVidas = "VIDAS IMPLANTADAS";
  const colSupRelacionamento = "SUPERINTÊNCIA DE RELACIONAMENTO";
  const colGerenteRelacionamento = "GERENTE RELACIONAMENTO";
  const colConsultorRelacionamento = "CONSULTOR DE RELACIONAMENTO";
  const colCidadeRH = "CIDADE DO RH DECISÓRIO";
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
    const inicioVigencia = getVal(colInicioVigencia) || getVal("INÍCIO DA VIGÊNCIA DE CONTRATO") || getVal("DATA DE VIGÊNCIA (DD/MM/AAAA)") || getVal("DATA DE VIGÊNCIA");

    if (isValidStatus(status) && matchesDate(inicioVigencia, selectedMonth, selectedYear)) {
      
      const representante = getVal("CONSULTOR DE IMPLANTAÇÃO/OPERACIONAL") || getVal("CONSULTOR DE ONBOARDING") || getVal("ANALISTA DE IMPLANTAÇÃO");

      const outRow = {
        "Razão Social do Cliente": cleanString(getVal(colRazaoSocial)),
        "Segmento Corporativo ou Varejo": cleanString(getVal(colSegmento)),
        "Razão Social da Corretora": cleanString(getVal(colCorretora)),
        "Tipo de implantação": cleanString(getVal(colTipoImplantacao)),
        "Produto": cleanString(getVal(colProduto)),
        "Código do Produto": cleanString(getVal(colCodigoProduto)),
        "Data de Vigência (DD/MM/AAAA)": cleanString(getVal(colDataVigenciaForms) || getVal("DATA DE VIGÊNCIA")),
        "Inicio da vigência de Contrato": cleanString(inicioVigencia),
        "Representante da Implantação": cleanString(representante),
        "Cód. da Empresa (Saúde/Odonto)": cleanString(getVal(colCodEmpresa)),
        "Cód. do Grupo/Apólice": cleanString(getVal(colCodGrupo)),
        "Vidas Implantadas": cleanString(getVal(colVidas)),
        "Superintendência de Relacionamento": cleanString(getVal(colSupRelacionamento) || getVal("SUPERINTENDÊNCIA DE RELACIONAMENTO")),
        "Gerente Relacionamento": cleanString(getVal(colGerenteRelacionamento)),
        "Consultor de Relacionamento": cleanString(getVal(colConsultorRelacionamento)),
        "Cidade do RH Decisório": cleanString(getVal(colCidadeRH)),
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
