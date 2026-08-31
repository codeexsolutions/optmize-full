/**
 * ===========================================================================
 * ROTAS — a tabela das telas
 * ===========================================================================
 *
 * Uma tela é uma linha aqui e mais nada: o menu lateral, o cabeçalho e o
 * miolo saem todos desta tabela. Era assim no `interface.js` da tela antiga e
 * continua sendo — foi a melhor ideia daquele arquivo e ela sobreviveu à
 * mudança de arquitetura.
 *
 * O ícone vai escrito inteiro (`"icones.svg#shapes"`), nunca montado em
 * pedaços: o `empacotar/icones.js` varre o código atrás dessa string literal
 * para saber quais desenhos entram no sprite. Um `"icones.svg#" + nome`
 * deixaria o ícone de fora do arquivo gerado e a tela sairia sem ele.
 */

import type { ComponentType } from "react";
import { Moldes } from "./telas/Moldes";
import { Projetos } from "./telas/Projetos";
import { Encaixe } from "./telas/Encaixe";
import { Vetor } from "./telas/Vetor";

export type NomeDeTela = "moldes" | "projetos" | "encaixe" | "vetor";

export interface Tela {
  /** O que vai no endereço, depois do `#`. */
  nome: NomeDeTela;
  /** O nome curto: menu lateral e título do cabeçalho. */
  rotulo: string;
  /** A linha de apoio embaixo do rótulo, no menu. */
  apoioMenu: string;
  /** A linha de apoio embaixo do título, no cabeçalho. */
  apoioTopo: string;
  /** Referência ao sprite: `icones.svg#nome-do-icone`. */
  icone: string;
  Componente: ComponentType;
}

export const TELAS: readonly Tela[] = [
  {
    nome: "moldes",
    rotulo: "Moldes",
    apoioMenu: "Modelagem da produção",
    apoioTopo: "Centralize moldes, tamanhos e estampas da produção.",
    icone: "icones.svg#shapes",
    Componente: Moldes,
  },
  {
    nome: "projetos",
    rotulo: "Projetos",
    apoioMenu: "Trabalho que se repete",
    apoioTopo: "Guarde por cliente o trabalho pronto para repetir e mandar ao encaixe.",
    icone: "icones.svg#folder-open",
    Componente: Projetos,
  },
  {
    nome: "encaixe",
    rotulo: "Encaixe",
    apoioMenu: "Aproveitamento do tecido",
    apoioTopo: "Otimize o uso do tecido e prepare arquivos para impressão.",
    icone: "icones.svg#blocks",
    Componente: Encaixe,
  },
  {
    nome: "vetor",
    rotulo: "Vetor",
    apoioMenu: "Traço a partir da imagem",
    apoioTopo: "Transforme uma imagem em desenho vetorial para corte e impressão.",
    icone: "icones.svg#spline",
    Componente: Vetor,
  },
];

export const TELA_PADRAO: NomeDeTela = "moldes";

export function acharTela(nome: string | null | undefined): Tela {
  return TELAS.find((tela) => tela.nome === nome) ?? TELAS[0]!;
}
