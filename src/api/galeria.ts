/**
 * ===========================================================================
 * API DOS ARQUIVOS DA GALERIA — pastas, imagens e PDFs
 * ===========================================================================
 *
 * A tela conversa com `servidor/galeria-arquivos-api.js` só por aqui. É a
 * metade "drive" da Galeria; a metade dos projetos continua em `projetos.ts`.
 */

import { api } from "./cliente";

/** Uma pasta, solta. A árvore da lateral é montada a partir da lista. */
export interface PastaDaGaleria {
  id: number;
  paiId: number | null;
  nome: string;
  /** Quantos arquivos estão direto nela (sem contar as de dentro). */
  arquivos: number;
  /** Só vem no conteúdo de uma pasta: quantas pastas ela tem dentro. */
  pastas?: number;
}

export interface ArquivoDaGaleria {
  id: number;
  pastaId: number | null;
  nome: string;
  tipo: string | null;
  bytes: number;
  miniatura: string | null;
  criadoEm: string;
  /** Mostra na tela quando o tipo deixa; senão, baixa. */
  url: string;
}

export interface ConteudoDaPasta {
  id: number | null;
  /** Da raiz até a pasta aberta, sem a raiz. */
  caminho: { id: number; nome: string }[];
  pastas: PastaDaGaleria[];
  arquivos: ArquivoDaGaleria[];
}

/** Um achado da busca, com o caminho de onde ele mora. */
export type ComOnde<T> = T & { onde: string };

const daPasta = (id: number | null) => (id === null ? "raiz" : String(id));

export const galeriaApi = {
  pastas: () => api.get<{ pastas: PastaDaGaleria[]; arquivosNaRaiz: number }>("/galeria/pastas"),
  conteudo: (id: number | null) => api.get<ConteudoDaPasta>(`/galeria/pastas/${daPasta(id)}/conteudo`),
  busca: (termo: string) =>
    api.get<{ pastas: ComOnde<PastaDaGaleria>[]; arquivos: ComOnde<ArquivoDaGaleria>[] }>(
      `/galeria/busca?q=${encodeURIComponent(termo)}`,
    ),
  criarPasta: (nome: string, paiId: number | null) =>
    api.post<{ id: number }>("/galeria/pastas", { nome, paiId }),
  mexerNaPasta: (id: number, mudanca: { nome?: string; paiId?: number | null }) =>
    api.patch(`/galeria/pastas/${id}`, mudanca),
  apagarPasta: (id: number) => api.apagar(`/galeria/pastas/${id}`),

  mexerNoArquivo: (id: number, mudanca: { nome?: string; pastaId?: number | null; miniatura?: string }) =>
    api.patch<ArquivoDaGaleria>(`/galeria/arquivos/${id}`, mudanca),
  apagarArquivo: (id: number) => api.apagar(`/galeria/arquivos/${id}`),
  baixar: (id: number) => `/api/galeria/arquivos/${id}/baixar`,

  /**
   * Sobe um arquivo em binário, contando o andamento.
   *
   * É `XMLHttpRequest`, e não `fetch`, por um motivo só: o `fetch` não conta
   * quanto já subiu, e um TIFF de 400 MB sem barra de andamento parece
   * travado. O corpo vai sempre como octet-stream: um JSON renomeado seria
   * lido pelo `express.json` geral do servidor. O tipo quem decide é o
   * servidor, pelos primeiros bytes.
   */
  enviar(arquivo: File, pastaId: number | null, aoAndar?: (fracao: number) => void) {
    return new Promise<ArquivoDaGaleria>((resolver, falhar) => {
      const xhr = new XMLHttpRequest();
      const pasta = pastaId === null ? "" : `?pasta=${pastaId}`;
      xhr.open("POST", `/api/galeria/arquivos${pasta}`);
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      xhr.setRequestHeader("X-Nome-Do-Arquivo", encodeURIComponent(arquivo.name));
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) aoAndar?.(e.loaded / e.total); };
      xhr.onload = () => {
        let corpo: { error?: string } & Partial<ArquivoDaGaleria> = {};
        try { corpo = JSON.parse(xhr.responseText); } catch { /* resposta sem JSON */ }
        if (xhr.status >= 200 && xhr.status < 300) resolver(corpo as ArquivoDaGaleria);
        else falhar(new Error(corpo.error || `O servidor respondeu ${xhr.status}.`));
      };
      xhr.onerror = () => falhar(new Error("A conexão com o servidor caiu no meio do envio."));
      xhr.send(arquivo);
    });
  },
};
