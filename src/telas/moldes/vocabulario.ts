/**
 * ===========================================================================
 * O VOCABULÁRIO DO MOLDE — o que dá para criar e como as partes se chamam
 * ===========================================================================
 *
 * As listas e as continhas de texto que a estante, o passo a passo e o painel
 * de arte usam. Ficam num arquivo só porque as três telas do molde falam da
 * mesma coisa, e um nome escrito de dois jeitos ("manga dir." num lugar,
 * "manga direita" no outro) faria a arte não achar a peça: é pelo PAPEL que a
 * estampa encontra o contorno.
 */

/** Uma parte enquanto está sendo montada no passo a passo. */
export interface ParteEmEdicao {
  /** Só para o React ter chave estável; não vai para o servidor. */
  id: number;
  /** Um item de `PAPEIS_DE_PECA`. */
  papel: string;
  /** O que a pessoa escreveu quando o papel é "outro". */
  papelEscrito: string;
  quantidade: number;
  nome: string | null;
  largura: number;
  altura: number;
  contorno: { x: number; y: number }[] | null;
  furos: { x: number; y: number }[][];
  /** "DXF · milímetro", para a linha dizer de onde a medida saiu. */
  origem: string | null;
}

/**
 * Cada tipo já vem com os pedaços que costuma ter. É só um chute bom: a pessoa
 * muda o número e troca o nome de qualquer parte na hora.
 */
export const TIPOS_DE_MOLDE = [
  { id: "camisa", nome: "Camisa", risco: "👕",
    partes: ["frente", "costas", "manga direita", "manga esquerda", "gola"] },
  { id: "regata", nome: "Regata", risco: "🎽",
    partes: ["frente", "costas", "vista"] },
  { id: "short", nome: "Short", risco: "🩳",
    partes: ["frente", "costas", "cós"] },
  { id: "banner", nome: "Banner", risco: "🖼️", partes: ["outro"] },
  { id: "outro", nome: "Outra coisa", risco: "✏️", partes: ["outro", "outro"] },
] as const;

export type TipoDeMolde = (typeof TIPOS_DE_MOLDE)[number];

export const PAPEIS_DE_PECA = [
  "frente", "costas", "manga direita", "manga esquerda", "manga",
  "gola", "punho", "cós", "bolso", "vista", "forro", "outro",
];

let proximoId = 1;

export function parteVazia(papel?: string): ParteEmEdicao {
  return {
    id: proximoId++,
    papel: papel || "outro",
    papelEscrito: "",
    quantidade: 1,
    nome: null, largura: 0, altura: 0, contorno: null, furos: [], origem: null,
  };
}

/** Um id de React para uma parte que veio do banco. */
export const novoIdDeParte = () => proximoId++;

/** Como a parte se chama de verdade: o papel da lista, ou o que foi escrito. */
export function nomeDaParte(parte: ParteEmEdicao): string {
  if (parte.papel !== "outro") return parte.papel;
  return String(parte.papelEscrito || "").trim() || "outro";
}

/**
 * Adivinha o papel da peça pelo nome que veio no arquivo. Acerta a maioria e
 * poupa a pessoa de escolher peça por peça; o que errar, é um clique.
 */
export function adivinharPapel(nome: string): string {
  const limpo = String(nome || "").toLowerCase();
  if (/manga.*(dir|d\b)|(dir|d)\b.*manga/.test(limpo)) return "manga direita";
  if (/manga.*(esq|e\b)|(esq|e)\b.*manga/.test(limpo)) return "manga esquerda";
  if (/manga/.test(limpo)) return "manga";
  if (/frente|front/.test(limpo)) return "frente";
  if (/costa|back/.test(limpo)) return "costas";
  if (/gola|colar/.test(limpo)) return "gola";
  if (/punho/.test(limpo)) return "punho";
  if (/c[óo]s\b/.test(limpo)) return "cós";
  if (/bolso|pocket/.test(limpo)) return "bolso";
  if (/vista/.test(limpo)) return "vista";
  if (/forro/.test(limpo)) return "forro";
  return "outro";
}

/** Lê "P, M, G GG" e devolve ["P","M","G","GG"], sem repetir. */
export function lerTamanhos(texto: string): string[] {
  const lista = String(texto || "").split(/[,;/]+|\s+/)
    .map((t) => t.trim()).filter(Boolean);
  const vistos = new Set<string>();
  const limpos: string[] = [];
  for (const t of lista) {
    const chave = t.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    limpos.push(t);
  }
  return limpos.length > 0 ? limpos : ["único"];
}

// ---------------------------------------------------------------------------
// As continhas de português. Existem para a pergunta do passo a passo não sair
// torta: "Quantos pedaços tem A camisa?" e "…tem O short?".
// ---------------------------------------------------------------------------

const ehFeminina = (palavra: string) => /a$/i.test(String(palavra || "peça").trim().split(" ")[0]!);

export function umArtigo(palavra: string): string {
  const p = String(palavra || "").trim() || "peça";
  return `${ehFeminina(p) ? "a" : "o"} ${p}`;
}

export function deArtigo(palavra: string): string {
  const p = String(palavra || "").trim() || "peça";
  return `${ehFeminina(p) ? "da" : "do"} ${p}`;
}

/** No meio da frase, "Almofada" vira "almofada" — mas "PVC" continua "PVC". */
export function comoNaFrase(palavra: string): string {
  const p = String(palavra || "").trim();
  if (!p || p === p.toUpperCase()) return p;
  return p[0]!.toLowerCase() + p.slice(1);
}

/** Medida para ler na tela: milímetro basta, e sem casa decimal sobrando. */
export const emCm = (v: number) => String(Math.round(Number(v) * 10) / 10);
