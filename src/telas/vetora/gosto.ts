/**
 * O GOSTO DE QUEM USA — a Vetora aprendendo com as escolhas
 *
 * Toda vez que a pessoa leva um vetor embora (baixa o SVG ou o PDF, ou copia),
 * fica anotado qual dos três modelos ela levou, com os ajustes e as
 * características da imagem (só números: a imagem não é guardada). Duas
 * coisas saem disso:
 *
 *   - o λ do modelo Equilibrado anda um passo na direção da escolha
 *     (`aprenderGosto`, em `motores/vetorizador/rede/escolher.js`): quem
 *     sempre leva o Fiel passa a ver um Equilibrado mais fiel, quem leva o
 *     Limpo, um mais limpo — já na próxima imagem;
 *   - o histórico (as últimas 300 escolhas) fica pronto para entrar no
 *     próximo treino da rede (`bancada/vetora/treinar.mjs --escolhas`).
 *
 * Mora no armazenamento do navegador do programa, nesta máquina; tudo
 * protegido (`try`), porque o armazenamento pode estar cheio ou bloqueado, e
 * a tela funciona igual sem ele.
 */

import { aprenderGosto } from "../../motores/vetorizador/rede/escolher";
import type { Ajuste, Chave } from "./trabalho";

const CHAVE_DO_GOSTO = "vetora:gosto";
const CHAVE_DAS_ESCOLHAS = "vetora:escolhas";
const MAXIMO_DE_ESCOLHAS = 300;

export interface Escolha {
  quando: string;
  rede: string | null;
  carac: number[];
  modelos: { chave: Chave; ajuste: Ajuste; nos: number | null; cores: number | null }[];
  escolhida: Chave;
  ajusteFinal: Ajuste;
  mexeu: boolean;
  como: "svg" | "pdf" | "copia";
}

/** O λ aprendido até aqui (ou `null`: o da rede). */
export function lerLambda(): number | null {
  try {
    const v = Number(localStorage.getItem(CHAVE_DO_GOSTO));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function lerEscolhas(): Escolha[] {
  try {
    const lista = JSON.parse(localStorage.getItem(CHAVE_DAS_ESCOLHAS) || "[]");
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

/** Anota a escolha e aprende o gosto. Devolve o λ novo. */
export function registrarEscolha(escolha: Escolha, lambdaDaRede: number | null): number {
  const novo = aprenderGosto(lerLambda() ?? lambdaDaRede, escolha.escolhida);
  try {
    localStorage.setItem(CHAVE_DO_GOSTO, String(novo));
    const lista = lerEscolhas();
    lista.push({ ...escolha, carac: escolha.carac.map((v) => Math.round(v * 1e4) / 1e4) });
    localStorage.setItem(CHAVE_DAS_ESCOLHAS, JSON.stringify(lista.slice(-MAXIMO_DE_ESCOLHAS)));
  } catch {
    /* sem armazenamento: o gosto vale só até fechar */
  }
  return novo;
}
