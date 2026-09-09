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
 *
 * ---------------------------------------------------------------------------
 * OS GRUPOS
 * ---------------------------------------------------------------------------
 *
 * A lista era plana e cabia: eram quatro telas, todas do mesmo assunto. Com a
 * central das impressoras dentro, viraram dez, e dez itens seguidos sem
 * separação nenhuma obrigam a ler o menu inteiro toda vez para achar um.
 *
 * A divisão é por **momento do trabalho**, e não por parentesco técnico:
 *
 *   - **Produção** — o que se faz ANTES de imprimir: o molde, o projeto, o
 *     encaixe, o vetor.
 *   - **Impressão** — o que acontece ENQUANTO se imprime, e as máquinas em si.
 *   - **Relatórios** — o que se olha DEPOIS, para conferir e comparar.
 *
 * O WhatsApp está em Impressão, e não num grupo de ajustes, porque a única
 * coisa que ele faz é avisar sobre impressão: quem o procura está pensando na
 * máquina, não em configuração.
 *
 * O grupo não entra no endereço. A rota continua sendo só o nome da tela
 * (`#/historico`), então mudar uma tela de grupo não quebra link guardado.
 */

import type { ComponentType } from "react";
import { Moldes } from "./telas/Moldes";
import { Projetos } from "./telas/Projetos";
import { Encaixe } from "./telas/Encaixe";
import { Vetor } from "./telas/Vetor";
import { Impressoras } from "./telas/Impressoras";
import { Historico } from "./telas/Historico";
import { Maquinas } from "./telas/Maquinas";
import { Whatsapp } from "./telas/Whatsapp";
import { Reposicao } from "./telas/Reposicao";
import { Pedidos } from "./telas/Pedidos";

export type NomeDeTela =
  | "moldes" | "projetos" | "encaixe" | "vetor"
  | "impressoras" | "pedidos" | "maquinas" | "whatsapp"
  | "historico" | "reposicao";

export type NomeDeGrupo = "producao" | "impressao" | "relatorios";

/**
 * Os grupos, na ordem em que aparecem no menu — que é a ordem do trabalho:
 * primeiro se prepara, depois se imprime, por último se confere.
 */
export const GRUPOS: readonly { nome: NomeDeGrupo; rotulo: string }[] = [
  { nome: "producao", rotulo: "Produção" },
  { nome: "impressao", rotulo: "Impressão" },
  { nome: "relatorios", rotulo: "Relatórios" },
];

export interface Tela {
  /** O que vai no endereço, depois do `#`. */
  nome: NomeDeTela;
  /** Em que parte do menu ela mora. Não aparece no endereço. */
  grupo: NomeDeGrupo;
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
  // ------------------------------------------------------------- Produção
  {
    nome: "moldes",
    grupo: "producao",
    rotulo: "Moldes",
    apoioMenu: "Modelagem da produção",
    apoioTopo: "Centralize moldes, tamanhos e estampas da produção.",
    icone: "icones.svg#shapes",
    Componente: Moldes,
  },
  {
    nome: "projetos",
    grupo: "producao",
    rotulo: "Projetos",
    apoioMenu: "Trabalho que se repete",
    apoioTopo: "Guarde por cliente o trabalho pronto para repetir e mandar ao encaixe.",
    icone: "icones.svg#folder-open",
    Componente: Projetos,
  },
  {
    nome: "encaixe",
    grupo: "producao",
    rotulo: "Encaixe",
    apoioMenu: "Aproveitamento do tecido",
    apoioTopo: "Otimize o uso do tecido e prepare arquivos para impressão.",
    icone: "icones.svg#blocks",
    Componente: Encaixe,
  },
  {
    nome: "vetor",
    grupo: "producao",
    rotulo: "Vetor",
    apoioMenu: "Traço a partir da imagem",
    apoioTopo: "Transforme uma imagem em desenho vetorial para corte e impressão.",
    icone: "icones.svg#spline",
    Componente: Vetor,
  },

  // ------------------------------------------------------------ Impressão
  {
    nome: "impressoras",
    grupo: "impressao",
    rotulo: "Impressoras",
    apoioMenu: "O que está saindo agora",
    apoioTopo: "Acompanhe a produção das impressoras em tempo real.",
    icone: "icones.svg#printer",
    Componente: Impressoras,
  },
  {
    nome: "pedidos",
    grupo: "impressao",
    rotulo: "Pedidos",
    apoioMenu: "A fila da calandra",
    apoioTopo: "A lista de produção na ordem da calandra, e o que já passou por lá.",
    icone: "icones.svg#list-checks",
    Componente: Pedidos,
  },
  {
    nome: "maquinas",
    grupo: "impressao",
    rotulo: "Máquinas",
    apoioMenu: "Achar na rede",
    apoioTopo: "Encontre as impressoras da rede e cadastre-as — os caminhos vêm sozinhos.",
    icone: "icones.svg#radar",
    Componente: Maquinas,
  },
  {
    nome: "whatsapp",
    grupo: "impressao",
    rotulo: "WhatsApp",
    apoioMenu: "Avisos automáticos",
    apoioTopo: "Avise num grupo quando uma impressão começa e quando termina.",
    icone: "icones.svg#message-circle",
    Componente: Whatsapp,
  },

  // ----------------------------------------------------------- Relatórios
  {
    nome: "historico",
    grupo: "relatorios",
    rotulo: "Histórico",
    apoioMenu: "Tudo que já foi impresso",
    apoioTopo: "Consulte, filtre e mande para a folha de produção o que já saiu.",
    icone: "icones.svg#history",
    Componente: Historico,
  },
  {
    nome: "reposicao",
    grupo: "relatorios",
    rotulo: "Reposição",
    apoioMenu: "Quanto foi refeito",
    apoioTopo: "Acompanhe semana a semana quanto tecido foi gasto refazendo trabalho.",
    icone: "icones.svg#rotate-ccw",
    Componente: Reposicao,
  },
];

/** As telas de um grupo, na ordem em que estão declaradas acima. */
export function telasDoGrupo(grupo: NomeDeGrupo): Tela[] {
  return TELAS.filter((tela) => tela.grupo === grupo);
}

/**
 * As telas que existem, mas moram na casca antiga (`/`).
 *
 * Cor, Imagem e Macros nunca vieram para o React, e enquanto não vierem elas
 * são inalcançáveis a partir daqui — quem entra por uma tela de impressora
 * fica preso numa metade do sistema. Aparecem no menu como link, e o clique
 * sai desta página.
 *
 * Não entram em `TELAS` de propósito: elas não têm componente, não têm rota
 * no `#` daqui, e tratá-las como tela obrigaria todo o resto do código a
 * lembrar da exceção. Aqui a exceção é um tipo à parte, e quem a ignora
 * continua correto.
 *
 * Some quando as três migrarem — junto com o `public/`.
 */
export interface TelaDaCascaAntiga {
  grupo: NomeDeGrupo;
  rotulo: string;
  apoioMenu: string;
  icone: string;
  /** O endereço na casca antiga. */
  endereco: string;
}

export const TELAS_DA_CASCA_ANTIGA: readonly TelaDaCascaAntiga[] = [
  {
    grupo: "producao",
    rotulo: "Cor",
    apoioMenu: "Arte na cor certa",
    icone: "icones.svg#palette",
    endereco: "/#/cor",
  },
  {
    grupo: "producao",
    rotulo: "Imagem",
    apoioMenu: "Resolução para imprimir",
    icone: "icones.svg#image",
    endereco: "/#/imagem",
  },
  {
    grupo: "producao",
    rotulo: "Macros",
    apoioMenu: "Ferramentas no CorelDRAW",
    icone: "icones.svg#puzzle",
    endereco: "/#/macros",
  },
];

export function externasDoGrupo(grupo: NomeDeGrupo): TelaDaCascaAntiga[] {
  return TELAS_DA_CASCA_ANTIGA.filter((tela) => tela.grupo === grupo);
}

export const TELA_PADRAO: NomeDeTela = "moldes";

export function acharTela(nome: string | null | undefined): Tela {
  return TELAS.find((tela) => tela.nome === nome) ?? TELAS[0]!;
}
