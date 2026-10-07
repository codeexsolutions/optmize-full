/**
 * Os arquivos de cada elemento. O SVG e o EPS saem aqui mesmo, do vetor; os
 * PNGs saem do servidor (o desenho do SVG, ou a ampliação). O ZIP junta tudo
 * pelo `fflate`, sem comprimir o PNG — ele já vem comprimido.
 */
import { zipSync, type Zippable } from "fflate";
import { extratorApi } from "../../api/extrator";
import { nomesUnicos, tamanhoDaSaida } from "../../motores/extrator";
import { epsDasCamadas } from "../../motores/vetorParaArquivo";
import { trabalhador } from "./trabalhador";
import type { Elemento, ResultadoDoVetor } from "./tipos";

export function baixar(blob: Blob, arquivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = arquivo;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const larguraCmDe = (el: Elemento) => (el.tamanho.tipo === "cm" ? el.tamanho.larguraCm : undefined);

export const svgDe = (v: ResultadoDoVetor) => new Blob([v.svg ?? ""], { type: "image/svg+xml" });

export const epsDe = (v: ResultadoDoVetor, el: Elemento) =>
  new Blob([epsDasCamadas(v.camadas, v.largura, v.altura, { larguraCm: larguraCmDe(el) ?? null })], { type: "application/postscript" });

/** O PNG do elemento: o SVG desenhado no servidor (Chapado), ou a ampliação (Foto). */
export async function pngDe(
  el: Elemento, v: ResultadoDoVetor | null, aoAndar: (feitos: number, total: number) => void, sinal?: AbortSignal,
): Promise<Blob> {
  const saida = tamanhoDaSaida(el.recorte.largura, el.recorte.altura, el.tamanho);
  if (el.jeito === "chapado") {
    if (!v?.svg) throw new Error("O vetor deste elemento ainda não ficou pronto.");
    return extratorApi.png(v.svg, saida.largura, saida.altura);
  }
  return extratorApi.ampliar(el.recorte, saida, aoAndar, sinal);
}

/** O vetor de cada elemento, guardado pelas opções: mexer e voltar não vetoriza de novo. */
export function cacheDeVetores() {
  const guardados = new Map<string, Promise<ResultadoDoVetor>>();
  return (el: Elemento): Promise<ResultadoDoVetor> => {
    const chave = `${el.id}|${el.cores}|${el.juntarSombras}|${larguraCmDe(el) ?? ""}`;
    let p = guardados.get(chave);
    if (!p) {
      p = trabalhador.vetorizar(el.recorte, { cores: el.cores, juntarSombras: el.juntarSombras, larguraCm: larguraCmDe(el) });
      p.catch(() => guardados.delete(chave));
      guardados.set(chave, p);
    }
    return p;
  };
}

export type VetorDe = ReturnType<typeof cacheDeVetores>;

/** Todos os elementos num ZIP: SVG, EPS e PNG do chapado; PNG da foto. Os nomes não se repetem. */
export async function zipDosElementos(
  elementos: Elemento[], vetorDe: VetorDe, aoAndar: (texto: string) => void, sinal?: AbortSignal,
): Promise<Blob> {
  const nomes = nomesUnicos(elementos.map((e) => e.nome));
  const arquivos: Zippable = {};
  const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
  for (let i = 0; i < elementos.length; i++) {
    sinal?.throwIfAborted();
    const el = elementos[i]!, nome = nomes[i]!;
    aoAndar(`Preparando ${i + 1} de ${elementos.length}: ${nome}…`);
    if (el.jeito === "chapado") {
      const v = await vetorDe(el);
      arquivos[`${nome}.svg`] = await bytes(svgDe(v));
      arquivos[`${nome}.eps`] = await bytes(epsDe(v, el));
      arquivos[`${nome}.png`] = [await bytes(await pngDe(el, v, () => {}, sinal)), { level: 0 }];
    } else {
      const andar = (f: number, t: number) => aoAndar(`Ampliando ${nome}: ${f} de ${t} pedaços…`);
      arquivos[`${nome}.png`] = [await bytes(await pngDe(el, null, andar, sinal)), { level: 0 }];
    }
  }
  return new Blob([zipSync(arquivos) as Uint8Array<ArrayBuffer>], { type: "application/zip" });
}
