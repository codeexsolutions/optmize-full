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
 * (`/historico`), então mudar uma tela de grupo não quebra link guardado.
 */

import { lazy, type ComponentType } from "react";
import { useLocation } from "react-router-dom";

/*
 * ---------------------------------------------------------------------------
 * CADA TELA CHEGA QUANDO É ABERTA
 * ---------------------------------------------------------------------------
 *
 * `lazy` em vez de `import` direto: o navegador baixa e compila o código de
 * uma tela na primeira vez que alguém entra nela, e não todo ele antes de
 * desenhar a primeira. Eram treze telas num pacote só — quem abre o painel
 * para olhar as impressoras esperava o vetorizador e a rede neural da Imagem
 * carregarem junto, e nunca ia usar nenhum dos dois.
 *
 * A troca de tela passa por um `<Suspense>` (ver `casca/Casca.tsx`), e o
 * pedaço fica no cache do navegador: a espera acontece uma vez por tela.
 *
 * As que ainda são do editor de produção NÃO entram aqui (Encaixe e Cor). Elas não são desenhadas pela rota — quem as desenha é o
 * `<Producao/>`, que fica montado o tempo todo (ver `casca/Casca.tsx`), então
 * dividi-las não adiantaria nada: o pacote viria junto de qualquer forma, na
 * primeira tela.
 */
import { Encaixe } from "./telas/Encaixe";
import { Cor } from "./telas/Cor";

const Moldes = lazy(() => import("./telas/Moldes").then((m) => ({ default: m.Moldes })));
const Projetos = lazy(() => import("./telas/Projetos").then((m) => ({ default: m.Projetos })));
const Vetor = lazy(() => import("./telas/Vetor").then((m) => ({ default: m.Vetor })));
const Digitalizar = lazy(() => import("./telas/Digitalizar").then((m) => ({ default: m.Digitalizar })));
const Imagem = lazy(() => import("./telas/Imagem").then((m) => ({ default: m.Imagem })));
const Macros = lazy(() => import("./telas/Macros").then((m) => ({ default: m.Macros })));
const Impressoras = lazy(() => import("./telas/Impressoras").then((m) => ({ default: m.Impressoras })));
const Pedidos = lazy(() => import("./telas/Pedidos").then((m) => ({ default: m.Pedidos })));
const Maquinas = lazy(() => import("./telas/Maquinas").then((m) => ({ default: m.Maquinas })));
const Whatsapp = lazy(() => import("./telas/Whatsapp").then((m) => ({ default: m.Whatsapp })));
const Historico = lazy(() => import("./telas/Historico").then((m) => ({ default: m.Historico })));
const Reposicao = lazy(() => import("./telas/Reposicao").then((m) => ({ default: m.Reposicao })));

export type NomeDeTela =
  | "cor" | "moldes" | "projetos" | "encaixe" | "vetor" | "digitalizar" | "imagem" | "macros"
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
  {
    nome: "digitalizar",
    grupo: "producao",
    rotulo: "Digitalizar",
    apoioMenu: "Molde a partir da foto",
    apoioTopo: "Mande a imagem do molde e tire o risco dele, na medida que você informar.",
    icone: "icones.svg#scan-line",
    Componente: Digitalizar,
  },

  // ------------------------------------------------------------ Impressão
  {
    nome: "imagem",
    grupo: "producao",
    rotulo: "Imagem",
    apoioMenu: "Resolução para imprimir",
    apoioTopo: "Aumenta a resolução da arte com rede neural, para imprimir grande sem borrar.",
    icone: "icones.svg#zoom-in",
    Componente: Imagem,
  },
  {
    nome: "macros",
    grupo: "producao",
    rotulo: "Macros",
    apoioMenu: "Ferramentas no CorelDRAW",
    apoioTopo: "Baixe e instale as macros que rodam dentro do Corel e falam com este sistema.",
    icone: "icones.svg#puzzle",
    Componente: Macros,
  },

  {
    nome: "cor", grupo: "producao", rotulo: "Cor",
    apoioMenu: "Arte na cor certa", apoioTopo: "Confira e corrija a cor antes de mandar ao encaixe.",
    icone: "icones.svg#palette", Componente: Cor,
  },
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

export const TELA_PADRAO: NomeDeTela = "moldes";

export function acharTela(nome: string | null | undefined): Tela {
  return TELAS.find((tela) => tela.nome === nome) ?? TELAS[0]!;
}

/**
 * A linha da tabela correspondente ao endereço aberto.
 *
 * O menu e o cabeçalho precisam da tela inteira (rótulo, ícone, apoio), e não
 * só do nome que está na URL. Quem lê o endereço é o `react-router`; este hook
 * traduz o que ele devolve para a linguagem da tabela, e é o único lugar do
 * projeto que faz essa tradução.
 */
export function useTelaAtual(): Tela {
  const { pathname } = useLocation();
  return acharTela(pathname.replace(/^\/+/, ""));
}
