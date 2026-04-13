import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Cache em memória para evitar IO repetitivo
const cache: Record<string, any> = {};

/**
 * Carrega e faz o parse de um arquivo JSON de forma assíncrona com cache.
 * @param relativePath Caminho relativo a partir deste arquivo utilitário.
 * @param callerUrl A URL do módulo que está chamando (import.meta.url) para resolver caminhos relativos corretamente.
 */
export async function loadConfigJson(relativePath: string, callerUrl: string) {
  const callerDir = dirname(fileURLToPath(callerUrl));
  const fullPath = join(callerDir, relativePath);

  if (cache[fullPath]) {
    return cache[fullPath];
  }

  try {
    console.log(`[Loader] Lendo JSON: ${fullPath}`);
    const content = await readFile(fullPath, 'utf-8');
    const data = JSON.parse(content);
    cache[fullPath] = data;
    return data;
  } catch (error) {
    console.error(`[Loader] Erro ao carregar JSON em ${fullPath}:`, error);
    throw new Error(`Falha ao carregar configuração: ${relativePath}`);
  }
}
