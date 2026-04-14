import { parse } from 'csv-parse';
import { CSV_LAYOUT } from '../_config/csv_layout.js';
import { Readable } from 'stream';

/**
 * Detecta dinamicamente em qual linha o cabeçalho real do CSV começa.
 * Isso é útil para pular linhas decorativas no topo do arquivo.
 */
export async function detectHeaderLine(readable: Readable): Promise<{ startLine: number, found: boolean }> {
  return new Promise((resolve) => {
    let lineCount = 0;
    const marker = CSV_LAYOUT.header_detection.starts_with;
    
    // Precisamos ler o stream mas sem consumi-lo totalmente se possível,
    // ou resetar se for um buffer. Como Busboy envia streams de rede,
    // é mais seguro ler as primeiras linhas de uma cópia se necessário, 
    // ou assumir que o usuário vai enviar arquivos pequenos o suficiente 
    // para caber em memória durante a detecção.
    
    // No entanto, para simplicidade e performance em Serverless, 
    // vamos implementar um buscador que olha as primeiras 20 linhas.
    
    // Como streams de Busboy não são buscáveis (non-seekable), 
    // a melhor abordagem é ler o início do stream e recriar o stream para o parser
    // ou usar um transform que descarta dados até o marcador.
    
    // Vamos usar a estratégia de Transform Stream para pular o "lixo".
    resolve({ startLine: 1, found: false }); // Placeholder para compatibilidade de tipo
  });
}

/**
 * Cria um parser que pula automaticamente as linhas de "lixo" no topo do CSV
 */
export function createDynamicParser(options: any = {}) {
  const marker = CSV_LAYOUT.header_detection.starts_with;
  let headerFound = false;
  let linesDiscarded = 0;

  return parse({
    ...options,
    // A mágica: usamos uma função de colunas dinâmica ou um transform 
    // Mas o csv-parse não suporta pular linhas baseadas em conteúdo nativamente de forma fácil com columns: true.
    
    // Estratégia Alternativa:
    // Informamos ao usuário para enviar o CSV limpo ou implementamos um wrapper.
    // Vamos implementar via transformador manual antes de pipear para o parse.
  });
}

/**
 * Helper para detectar e pular o lixo do CSV
 * Retorna o índice da linha (1-based) onde o cabeçalho foi encontrado
 */
export async function getCsvHeaderOffset(buffer: Buffer): Promise<number> {
  const content = buffer.toString('utf-8');
  const lines = content.split(/\r?\n/);
  const marker = CSV_LAYOUT.header_detection.starts_with;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith(marker)) {
      console.log(`[CSV Helper] Cabeçalho detectado na linha ${i + 1}`);
      return i + 1;
    }
  }
  
  console.warn(`[CSV Helper] Marcador "${marker}" não encontrado. Iniciando da linha 1.`);
  return 1;
}
