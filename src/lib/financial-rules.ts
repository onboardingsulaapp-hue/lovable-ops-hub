// src/lib/financial-rules.ts

import { AuditoriaFinanceiraItem } from "./financial-store";

// Utilitário interno para normalização de textos (ignora case, acentos e espaços)
const normalizeStr = (str: string | null | undefined): string => {
  if (!str) return "";
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};

/**
 * Motor de Análise Financeira
 * 
 * Regras:
 * 1. Escudo de Segurança: Vigência <= 2025 ignorada.
 * 2. Critério de Disparo: Particularidades preenchido E diferente de "Não/Nao/nao" etc.
 * 3. Validação Cruzada: A Razão Social não foi encontrada no relatório do Financeiro.
 * 
 * @param dadosTime Array de objetos lidos do CSV do Time.
 * @param dadosFinanceiro Array de objetos lidos do CSV do Financeiro.
 * @param nomePlanilhaOrigem Nome do arquivo do Time para rastreabilidade.
 */
export const analisarDivergenciasFinanceiras = (
  dadosTime: any[],
  dadosFinanceiro: any[],
  nomePlanilhaOrigem: string
): AuditoriaFinanceiraItem[] => {
  const divergencias: AuditoriaFinanceiraItem[] = [];

  // 1. Otimização: Criar um Set com as empresas do Financeiro para busca O(1)
  const empresasFinanceiro = new Set<string>();
  for (const rowFin of dadosFinanceiro) {
    const nomeEmpresa = normalizeStr(rowFin["Nome Empresa"] || rowFin["nome_empresa"] || "");
    if (nomeEmpresa) {
      empresasFinanceiro.add(nomeEmpresa);
    }
  }

  // Valores de particularidade que anulam o gatilho (falsos positivos)
  const ignorarParticularidade = ["nao", "não", "-", "n/a", "vazio"];

  // 2. Iterar linha a linha da planilha do Time
  for (let i = 0; i < dadosTime.length; i++) {
    const row = dadosTime[i];

    // Buscar as colunas de forma segura (usando aliases possíveis caso não tenham sido unificados)
    const razaoSocial = String(row["Razão Social do Cliente"] || row["razao_social_do_cliente"] || row["razao_social"] || "").trim();
    const particularidades = String(row["Particularidades"] || row["particularidades"] || "").trim();
    const fatura = String(row["Fatura"] || row["fatura"] || "").trim();
    const faturamento = String(row["Faturamento"] || row["faturamento"] || "").trim();
    const consultor = String(row["Consultor Onboarding"] || row["consultor_onboarding"] || row["consultor_de_onboarding"] || "").trim();
    const linhaCsv = Number(row._linha_csv) || (i + 2); // Fallback para índice caso não exista metadado

    // ----------------------------------------------------
    // Escudo de Segurança: Vigência <= 2025 é ignorada
    // ----------------------------------------------------
    let anoDaVigencia = 0;
    const vigenciaKey = Object.keys(row).find(k => normalizeStr(k).includes("vigencia"));
    
    if (vigenciaKey && row[vigenciaKey]) {
      const valVigencia = String(row[vigenciaKey]);
      const anoMatch = valVigencia.match(/\b(20\d\d)\b/); // Busca um ano (ex: 2025, 2026)
      if (anoMatch) {
        anoDaVigencia = parseInt(anoMatch[1], 10);
      }
    }

    if (anoDaVigencia > 0 && anoDaVigencia <= 2025) {
      continue; // Ignora o passado sumariamente
    }

    // ----------------------------------------------------
    // Filtro contra Falsos Positivos: Verificação de dados
    // ----------------------------------------------------
    if (!razaoSocial) {
      continue; // Linha sem empresa não pode ser analisada
    }

    const particNorm = normalizeStr(particularidades);
    
    // Critério: Tem que ter particularidade E não pode ser uma negação explícita ("Não")
    const particularidadePreenchidaEValida = particularidades !== "" && !ignorarParticularidade.includes(particNorm);

    // Se NÃO atende ao critério de erro financeiro, segue a vida
    if (!particularidadePreenchidaEValida) {
      continue;
    }

    // ----------------------------------------------------
    // Validação Cruzada: A empresa está no financeiro?
    // ----------------------------------------------------
    const razaoNorm = normalizeStr(razaoSocial);
    
    if (!empresasFinanceiro.has(razaoNorm)) {
      // É uma pendência! Empresa do time COM particularidade não apareceu no financeiro.
      divergencias.push({
        id: razaoNorm.replace(/\s+/g, '_'),
        razao_social: razaoSocial,
        particularidades: particularidades,
        fatura: fatura,
        faturamento: faturamento,
        consultor_onboarding: consultor || "Sem Responsável",
        linha_csv: linhaCsv,
        planilha_origem: nomePlanilhaOrigem,
        // Status inicial padrão é sempre "Em Aberto". O merge rule cuidará do Firestore.
        status: "Em Aberto"
      });
    }
  }

  return divergencias;
};
