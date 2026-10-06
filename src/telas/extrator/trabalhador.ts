/**
 * O worker do Extrator, com promessa: cada pedido leva um número, e a
 * resposta volta para quem pediu.
 *
 * O que vai para lá é o que travaria a tela: endireitar e recortar a foto
 * inteira (12 megapixels de celular) e vetorizar o elemento. Os pixels vão
 * COPIADOS, e não transferidos: a tela continua precisando da foto depois.
 *
 * Se o navegador não deixar criar o worker, a conta roda aqui mesmo — a tela
 * engasga enquanto ela roda, mas funciona (a regra do antigo `vetorWorker`).
 */
import type { Imagem, OpcoesDoVetor, Pixels, Ponto, Recorte, ResultadoDoVetor } from "./tipos";

type Pedido =
  | { tipo: "desentortar"; pixels: Pixels; largura: number; altura: number; cantos: Ponto[] }
  | { tipo: "recortar"; pixels: Pixels; largura: number; altura: number; alfa: Uint8Array; la: number; aa: number }
  | { tipo: "inteira"; pixels: Pixels; largura: number; altura: number }
  | { tipo: "vetorizar"; pixels: Pixels; largura: number; altura: number; opcoes: OpcoesDoVetor };

let worker: Worker | null | undefined;
let proximo = 1;
const esperando = new Map<number, { pronto: (v: unknown) => void; falhou: (e: Error) => void }>();

function oWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const w = new Worker(new URL("../../motores/extratorWorker.js", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<{ id: number; resultado?: unknown; erro?: string }>) => {
      const p = esperando.get(e.data.id);
      if (!p) return;
      esperando.delete(e.data.id);
      if (e.data.erro) p.falhou(new Error(e.data.erro));
      else p.pronto(e.data.resultado);
    };
    w.onerror = () => {
      for (const p of esperando.values()) p.falhou(new Error("O trabalhador do Extrator parou no meio."));
      esperando.clear();
      worker = null;
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

async function aquiMesmo<T>(pedido: Pedido): Promise<T> {
  const { executar } = await import("../../motores/extratorTarefas");
  return executar(pedido) as T;
}

function pedir<T>(pedido: Pedido): Promise<T> {
  const w = oWorker();
  if (!w) return aquiMesmo<T>(pedido);
  const id = proximo++;
  return new Promise<T>((pronto, falhou) => {
    esperando.set(id, { pronto: pronto as (v: unknown) => void, falhou });
    w.postMessage({ id, ...pedido });
  });
}

export const trabalhador = {
  desentortar: (foto: Imagem, cantos: Ponto[]) =>
    pedir<{ rgba: Pixels; largura: number; altura: number } | null>({ tipo: "desentortar", pixels: foto.pixels, largura: foto.largura, altura: foto.altura, cantos }),
  recortar: (foto: Imagem, alfa: Uint8Array, la: number, aa: number) =>
    pedir<Recorte | null>({ tipo: "recortar", pixels: foto.pixels, largura: foto.largura, altura: foto.altura, alfa, la, aa }),
  inteira: (foto: Imagem) =>
    pedir<Recorte | null>({ tipo: "inteira", pixels: foto.pixels, largura: foto.largura, altura: foto.altura }),
  vetorizar: (r: Recorte, opcoes: OpcoesDoVetor) =>
    pedir<ResultadoDoVetor>({ tipo: "vetorizar", pixels: r.rgba, largura: r.largura, altura: r.altura, opcoes }),
};
