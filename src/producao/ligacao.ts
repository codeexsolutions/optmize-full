/**
 * A ponte entre uma tela React e o controlador imperativo da produção.
 *
 * Enquanto Moldes, Projetos e Encaixe forem dirigidos pelo `controlador.js`,
 * uma tela que já virou React precisa de um jeito de entregar trabalho a eles.
 * Este contexto é esse jeito, e é de propósito que ele seja PEQUENO: cada
 * função aqui é uma amarra que ainda existe, então a lista encolhendo é a
 * medida do quanto a migração andou.
 *
 * Some junto com o controlador.
 */

import { createContext, useContext } from "react";
import type { NomeDeTela } from "../rotas";

/** Os ajustes que um projeto guarda e o Encaixe recebe prontos. */
export interface AjustesDoEncaixe {
  larguraTecido: number | null;
  /** Em CENTÍMETRO — a unidade do Encaixe. Quem guarda em milímetro converte. */
  espaco: number | null;
  comprimentoBancada: number | null;
  /** "180" | "livre" | "fixa", os mesmos valores do seletor. */
  giro: string;
}

/** Uma arte já finalizada, com a medida real, indo para o Encaixe. */
export interface PecaParaOEncaixe {
  nome: string;
  /** Onde a arte está no servidor (`/uploads/projetos/...`). */
  url: string;
  largura: number;
  altura: number;
  quantidade: number;
}

export interface ProjetoParaOEncaixe {
  nome: string;
  pecas: PecaParaOEncaixe[];
  unidades: number;
  ajustes: AjustesDoEncaixe;
}

export interface Ligacao {
  /**
   * Entrega arquivos ao Encaixe. Resolve quando ele terminou de ler todos —
   * quem entrega precisa saber disso para só então limpar a própria lista.
   */
  adicionarArquivos(arquivos: File[]): Promise<void>;

  /**
   * Entrega um projeto inteiro ao Encaixe: os ajustes guardados vão para os
   * campos dele e as artes entram na lista, já sem fundo.
   *
   * Resolve quando o Encaixe terminou de ler tudo. O cálculo NÃO começa
   * sozinho — quem aperta "Optmizar" é a pessoa, depois de escolher o tempo de
   * procura.
   */
  mandarProjetoParaOEncaixe(projeto: ProjetoParaOEncaixe): Promise<void>;

  irPara(pagina: NomeDeTela): void;
}

const Contexto = createContext<Ligacao | null>(null);

export const ProvedorDaLigacao = Contexto.Provider;

/**
 * O `null` acontece de verdade: o controlador monta num `useLayoutEffect`, e
 * se ele tiver falhado ao subir (banco fora, worker barrado) o contexto fica
 * vazio enquanto a mensagem de erro aparece. Quem usa precisa tratar, e por
 * isso o tipo devolve `null` em vez de mentir com um `!`.
 */
export function useLigacao(): Ligacao | null {
  return useContext(Contexto);
}
