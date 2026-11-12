/**
 * O TRABALHO PESADO DA VETORA, FORA DA TELA
 *
 * Os pixels de um arquivo (`lerPixels`) e os workers do vetorizador
 * (`useTrabalhadores`): um para a análise da rede e um para CADA modelo de
 * vetor — os três vetorizam ao mesmo tempo, em núcleos diferentes. Um pedido
 * novo de um modelo encerra o worker velho daquele modelo (a conta que
 * ninguém vai usar para de verdade); os outros seguem.
 */

import { useCallback, useEffect, useRef } from "react";

export type Chave = "fiel" | "equilibrado" | "limpo";
export const CHAVES: Chave[] = ["fiel", "equilibrado", "limpo"];

export interface Ajuste { d: number; s: number; ia: number }
export interface ModeloEscolhido { chave: Chave; nome: string; ajuste: Ajuste; previsto: { fiel: number; erro: number; nos: number } | null }
export interface Analise { modelos: ModeloEscolhido[]; comRede: boolean; versaoDaRede: string | null; lambda: number | null; carac: number[] }

export interface Forma { cor: string; d: string; area: number }
export interface Resultado {
  svg: string;
  formas: Forma[];
  costura: { cor: string; d: string }[];
  larguraTraco: number;
  paleta: { hex: string; area: number }[];
  estatisticas: { cores: number; formas: number; nos: number; bytes: number; ms: number; largura: number; altura: number; tirouFundo: boolean; borda: number };
}

/** Os pixels de um arquivo de imagem, sem gerenciar cor, com o maior lado até `teto`. */
export async function lerPixels(fonte: Blob, teto: number) {
  const bitmap = await createImageBitmap(fonte, { premultiplyAlpha: "none", colorSpaceConversion: "none", imageOrientation: "from-image" });
  try {
    const escala = Math.min(1, teto / Math.max(bitmap.width, bitmap.height));
    const largura = Math.max(1, Math.round(bitmap.width * escala));
    const altura = Math.max(1, Math.round(bitmap.height * escala));
    const tela = new OffscreenCanvas(largura, altura);
    const ctx = tela.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("O navegador não deu um canvas para ler a imagem.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    const dados = ctx.getImageData(0, 0, largura, altura);
    return { px: new Uint8ClampedArray(dados.data), largura, altura };
  } finally {
    bitmap.close();
  }
}

type Mensagem = { id: number; tipo: string; fase?: string; fracao?: number; resultado?: Resultado; analise?: Analise; erro?: string };

export function useTrabalhadores() {
  const ativos = useRef(new Map<string, Worker>());
  const contador = useRef(0);
  useEffect(() => () => {
    for (const w of ativos.current.values()) w.terminate();
    ativos.current.clear();
  }, []);

  /** Quem espera cada vaga: o pedido substituído é avisado (AbortError) em vez de esperar para sempre. */
  const esperando = useRef(new Map<string, (e: Error) => void>());

  const rodar = useCallback(<T,>(vaga: string, mensagem: Record<string, unknown>, px: Uint8ClampedArray,
    aoAndar?: (fase: string, fracao: number) => void) => new Promise<T>((pronto, falhou) => {
    ativos.current.get(vaga)?.terminate();
    esperando.current.get(vaga)?.(new DOMException("Trocado por um pedido mais novo.", "AbortError"));
    esperando.current.set(vaga, falhou);
    const w = new Worker(new URL("../../motores/vetorizadorWorker.js", import.meta.url), { type: "module" });
    ativos.current.set(vaga, w);
    const id = ++contador.current;
    const soltar = () => {
      w.terminate();
      if (ativos.current.get(vaga) === w) ativos.current.delete(vaga);
      if (esperando.current.get(vaga) === falhou) esperando.current.delete(vaga);
    };
    w.onmessage = (e: MessageEvent<Mensagem>) => {
      const msg = e.data;
      if (msg.id !== id) return;
      if (msg.tipo === "andamento") aoAndar?.(msg.fase || "", msg.fracao || 0);
      else if (msg.tipo === "pronto") { soltar(); pronto(msg.resultado as T); }
      else if (msg.tipo === "analise") { soltar(); pronto(msg.analise as T); }
      else if (msg.tipo === "falhou") { soltar(); falhou(new Error(msg.erro || "O vetorizador parou no meio.")); }
    };
    w.onerror = (e) => { soltar(); falhou(new Error(e.message || "O vetorizador quebrou.")); };
    const copia = new Uint8ClampedArray(px);
    w.postMessage({ ...mensagem, id, px: copia.buffer }, [copia.buffer]);
  }), []);

  const analisar = useCallback((px: Uint8ClampedArray, largura: number, altura: number, opcoes: { comIa: boolean; lambda: number | null }) =>
    rodar<Analise>("analise", { tipo: "analisar", largura, altura, opcoes }, px), [rodar]);

  const vetorizar = useCallback((chave: Chave, px: Uint8ClampedArray, largura: number, altura: number, opcoes: Record<string, unknown>,
    aoAndar: (fase: string, fracao: number) => void) =>
    rodar<Resultado>(chave, { tipo: "vetorizar", largura, altura, opcoes }, px, aoAndar), [rodar]);

  /** Para tudo (a imagem saiu): nenhum worker velho termina uma conta por nada. */
  const pararTudo = useCallback(() => {
    for (const w of ativos.current.values()) w.terminate();
    ativos.current.clear();
    for (const avisar of esperando.current.values()) avisar(new DOMException("A imagem saiu.", "AbortError"));
    esperando.current.clear();
  }, []);

  return { analisar, vetorizar, pararTudo };
}
