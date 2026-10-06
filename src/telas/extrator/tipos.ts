/** Os tipos da tela do Extrator. Os da conversa com o servidor moram em `api/extrator.ts`. */
import type { CaixaDoClique, PontoDoClique } from "../../api/extrator";

export type { CaixaDoClique, PontoDoClique };

/** Pixels RGBA, como o canvas os entrega e o `ImageData` os aceita. */
export type Pixels = Uint8ClampedArray<ArrayBuffer>;

export interface Ponto { x: number; y: number }

/** A foto inteira, na resolução em que chegou (já em pé pelo EXIF). */
export interface Imagem { pixels: Pixels; largura: number; altura: number }

/** Um elemento recortado: a foto com a máscara no alfa, e onde ele estava nela. */
export interface Recorte { rgba: Pixels; largura: number; altura: number; x0: number; y0: number }

/** A foto de trabalho: o que a mesa mostra e o que vai ao servidor (lado maior em 2048). */
export interface Trabalho { bitmap: ImageBitmap; jpeg: Blob; largura: number; altura: number; escala: number }

/** A máscara mostrada na mesa, com quantos cliques (e caixa) a fizeram. */
export interface Mascara { alfa: Uint8Array; largura: number; altura: number; nota: number; cobertura: number; pontos: number }

export type Jeito = "chapado" | "foto";
export type PedidoDeTamanho = { tipo: "4k" } | { tipo: "cm"; larguraCm: number };

export interface Elemento {
  id: number;
  nome: string;
  recorte: Recorte;
  /** O PNG pequeno da lista (data URL). */
  miniatura: string;
  jeito: Jeito;
  cores: number;
  juntarSombras: number;
  tamanho: PedidoDeTamanho;
}

export interface OpcoesDoVetor { cores: number; juntarSombras: number; larguraCm?: number }
export interface CamadaDoVetor { cor: string; pontos: number; caminhos: number; d: string }
export interface ResultadoDoVetor { svg: string | null; camadas: CamadaDoVetor[]; largura: number; altura: number; erro?: string }
