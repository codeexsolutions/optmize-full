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
 *   - **Produção** — o molde e o trabalho: a biblioteca, o molde tirado da
 *     foto, o projeto do cliente, o encaixe no tecido e as macros do Corel.
 *   - **Impressão** — o que acontece ENQUANTO se imprime, e as máquinas em si.
 *   - **Relatórios** — o que se olha DEPOIS, para conferir e comparar.
 *
 * HOUVE UM QUINTO GRUPO, **Design**, para o que se fazia com a ARTE antes de
 * ela virar trabalho: Vetor, Digitalizar, Imagem e Cor. Três dessas telas
 * saíram do programa em 2026-09-21 e sobrou o Digitalizar sozinho — um grupo
 * de um item, que cobrava uma linha de título no menu para separar nada. O
 * Digitalizar passou para Produção, que é onde ele já estava na cabeça de
 * quem usa: o que sai dele é um molde, e molde é Produção.
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
 * A que ainda é do editor de produção NÃO entra aqui (o Encaixe). Ela não é desenhada pela rota — quem a desenha é o
 * `<Producao/>`, que fica montado o tempo todo (ver `casca/Casca.tsx`), então
 * dividi-la não adiantaria nada: o pacote viria junto de qualquer forma, na
 * primeira tela.
 */
import { Encaixe } from "./telas/Encaixe";
import { TelaTrancada } from "./casca/TelaTrancada";

const Moldes = lazy(() => import("./telas/Moldes").then((m) => ({ default: m.Moldes })));
const Projetos = lazy(() => import("./telas/Projetos").then((m) => ({ default: m.Projetos })));
const Digitalizar = lazy(() => import("./telas/Digitalizar").then((m) => ({ default: m.Digitalizar })));
const Impressoras = lazy(() => import("./telas/Impressoras").then((m) => ({ default: m.Impressoras })));
const Pedidos = lazy(() => import("./telas/Pedidos").then((m) => ({ default: m.Pedidos })));
const Maquinas = lazy(() => import("./telas/Maquinas").then((m) => ({ default: m.Maquinas })));
const Whatsapp = lazy(() => import("./telas/Whatsapp").then((m) => ({ default: m.Whatsapp })));
const Historico = lazy(() => import("./telas/Historico").then((m) => ({ default: m.Historico })));
const Reposicao = lazy(() => import("./telas/Reposicao").then((m) => ({ default: m.Reposicao })));
const Ponto = lazy(() => import("./telas/Ponto").then((m) => ({ default: m.Ponto })));
const Funcionarios = lazy(() => import("./telas/Funcionarios").then((m) => ({ default: m.Funcionarios })));
const Sobre = lazy(() => import("./telas/Sobre").then((m) => ({ default: m.Sobre })));
const Conta = lazy(() => import("./telas/Conta").then((m) => ({ default: m.Conta })));
const Painel = lazy(() => import("./telas/Painel").then((m) => ({ default: m.Painel })));

export type NomeDeTela =
  | "moldes" | "projetos" | "encaixe" | "digitalizar" | "macros"
  | "impressoras" | "pedidos" | "maquinas" | "whatsapp"
  | "historico" | "reposicao" | "ponto" | "funcionarios"
  // As duas do PÉ da barra. Não pertencem a assunto nenhum da lista: são o
  // programa falando de si mesmo e da conta, não trabalho de produção.
  | "sobre" | "conta"
  // O painel do dono: abre pelo botão logo acima do pé, e só para ele.
  | "painel";

export type NomeDeGrupo = "producao" | "impressao" | "relatorios";

/**
 * Os grupos, na ordem em que aparecem no menu — que é a ordem do trabalho:
 * primeiro se prepara o molde, depois se imprime, por último se confere.
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
  /**
   * A tela existe, tem endereço e cabeçalho — mas não aparece no menu.
   *
   * O primeiro caso foi **Máquinas**: ela é uma porta, não um lugar onde se
   * trabalha. Quem precisa dela ou não tem impressora nenhuma (e aí é o painel
   * de Impressoras que leva para lá sozinho), ou vai trocar o nome de uma
   * máquina e apagar outra — uma vez por ano. Num menu de treze itens, ela
   * cobrava uma linha permanente ao lado de "Impressoras" para dizer quase a
   * mesma palavra, e a dupla obrigava a escolher entre as duas toda vez.
   *
   * Desde 2026-09-21 são sete: saíram também **Macros**, **WhatsApp** e o
   * grupo **Relatórios** inteiro (Histórico, Ponto, Funcionários, Reposição).
   * Aí a razão é outra, e vale dizê-la em voz alta para ninguém "consertar"
   * isso por engano: foi decisão de desenho, para o menu do dia a dia mostrar
   * só onde se trabalha. O menu caiu de doze linhas para quatro.
   *
   * ATENÇÃO, e é o preço: diferente de Máquinas, essas seis **não têm outra
   * porta**. Nada no programa leva a elas depois desta mudança — só o endereço
   * digitado (`/historico`, `/ponto`, …) ou um link guardado. Se alguma voltar
   * a ser usada no dia a dia, o certo não é devolvê-la ao menu por reflexo: é
   * decidir de onde ela passa a ser alcançada.
   *
   * Em todas elas o endereço continua funcionando inteiro, com o mesmo
   * cabeçalho. O que sai é só a linha do menu — o código da tela fica de pé.
   */
  foraDoMenu?: boolean;
  /**
   * A tela está TRANCADA: aparece no menu com um cadeado, e o endereço abre o
   * aviso de tela trancada (`casca/TelaTrancada.tsx`) — que é o `Componente`
   * da linha enquanto ela estiver assim. É o contrário do `foraDoMenu`: lá a
   * tela funciona e não aparece; aqui ela aparece e não funciona.
   */
  trancada?: boolean;
  /**
   * A tela só existe para quem tem este escopo no plano.
   *
   * Diferente de `trancada`, que é decisão nossa e vale para todo mundo: aqui
   * quem decide é o PLANO da conta, e a mesma tela abre para uns e não para
   * outros. Sem escopo escrito, a tela é de todos.
   *
   * Quem confere é `casca/Escopos.tsx`, entre a rota e o componente — a tela
   * não precisa saber que existe plano.
   */
  escopo?: "impressoras";
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
    /*
     * Logo depois de Moldes, e não no fim do grupo: é daqui que um molde
     * NASCE quando não existe arquivo dele, só a peça em cima da mesa. Quem
     * chega ao menu sem o molde pronto lê as duas primeiras linhas e já sabe
     * por onde entrar.
     */
    nome: "digitalizar",
    grupo: "producao",
    rotulo: "Digitalizar",
    apoioMenu: "Molde a partir da foto",
    apoioTopo: "Mande a imagem do molde e tire o risco dele, na medida que você informar.",
    icone: "icones.svg#scan-line",
    Componente: Digitalizar,
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
    /*
     * TRANCADA desde 2026-09-21. Para destrancar: tirar o `trancada`, trocar
     * o `Componente` por `Macros` e devolver lá em cima a linha
     *   const Macros = lazy(() => import("./telas/Macros").then((m) => ({ default: m.Macros })));
     * O arquivo da tela (`telas/Macros.tsx`) continua no repositório.
     */
    nome: "macros",
    grupo: "producao",
    foraDoMenu: true,
    rotulo: "Macros",
    apoioMenu: "Ferramentas no CorelDRAW",
    apoioTopo: "Baixe e instale as macros que rodam dentro do Corel e falam com este sistema.",
    icone: "icones.svg#puzzle",
    trancada: true,
    Componente: TelaTrancada,
  },

  // ------------------------------------------------------------ Impressão
  {
    nome: "impressoras",
    grupo: "impressao",
    rotulo: "Impressoras",
    apoioMenu: "O que está saindo agora",
    apoioTopo: "Acompanhe a produção das impressoras em tempo real.",
    icone: "icones.svg#printer",
    escopo: "impressoras",
    Componente: Impressoras,
  },
  {
    nome: "pedidos",
    grupo: "impressao",
    rotulo: "Pedidos",
    apoioMenu: "A fila da calandra",
    apoioTopo: "A lista de produção na ordem da calandra, e o que já passou por lá.",
    icone: "icones.svg#list-checks",
    escopo: "impressoras",
    Componente: Pedidos,
  },
  {
    nome: "maquinas",
    grupo: "impressao",
    rotulo: "Máquinas",
    foraDoMenu: true,
    apoioMenu: "Achar na rede",
    apoioTopo: "Encontre as impressoras da rede e cadastre-as — os caminhos vêm sozinhos.",
    icone: "icones.svg#radar",
    escopo: "impressoras",
    Componente: Maquinas,
  },
  {
    nome: "whatsapp",
    grupo: "impressao",
    foraDoMenu: true,
    rotulo: "WhatsApp",
    apoioMenu: "Avisos automáticos",
    apoioTopo: "Avise num grupo quando uma impressão começa e quando termina.",
    icone: "icones.svg#message-circle",
    /* Os avisos são da produção: sem a central, não há o que avisar. */
    escopo: "impressoras",
    Componente: Whatsapp,
  },

  // ----------------------------------------------------------- Relatórios
  {
    nome: "historico",
    grupo: "relatorios",
    foraDoMenu: true,
    rotulo: "Histórico",
    apoioMenu: "Tudo que já foi impresso",
    apoioTopo: "Consulte, filtre e mande para a folha de produção o que já saiu.",
    icone: "icones.svg#history",
    Componente: Historico,
  },
  {
    /*
     * O ponto fica em Relatórios, e não em Produção, porque é o mesmo gesto
     * das outras telas daqui: alguém abre para CONFERIR o que já aconteceu,
     * não para fazer acontecer. Quem bate ponto é o terminal de chão de
     * fábrica; esta tela é onde se olha para o que ele registrou.
     */
    nome: "ponto",
    grupo: "relatorios",
    foraDoMenu: true,
    rotulo: "Ponto",
    apoioMenu: "Quem bateu, e quando",
    apoioTopo: "As batidas que vieram do terminal, em grade — o que está faltando aparece como traço.",
    icone: "icones.svg#clock",
    Componente: Ponto,
  },
  {
    nome: "funcionarios",
    grupo: "relatorios",
    foraDoMenu: true,
    rotulo: "Funcionários",
    apoioMenu: "Quem é quem, e quais rostos",
    apoioTopo: "Cadastre as pessoas e os rostos que o terminal precisa reconhecer.",
    icone: "icones.svg#users",
    Componente: Funcionarios,
  },
  {
    nome: "reposicao",
    grupo: "relatorios",
    foraDoMenu: true,
    rotulo: "Reposição",
    apoioMenu: "Quanto foi refeito",
    apoioTopo: "Acompanhe semana a semana quanto tecido foi gasto refazendo trabalho.",
    icone: "icones.svg#rotate-ccw",
    Componente: Reposicao,
  },

  /*
    AS DUAS DO PÉ DA BARRA.

    `foraDoMenu` porque elas não entram na lista de telas: quem as abre é o pé
    (ver o rodapé de `casca/Menu.tsx`), e repeti-las na lista cobraria duas
    linhas permanentes de quem trabalha para mostrar o que se procura uma vez
    por mês.

    O `grupo` é obrigatório no tipo e não tem efeito nelas — `telasDoGrupo`
    descarta `foraDoMenu` antes de olhar o grupo. Ficam em "relatorios" por ser
    o grupo que já não aparece no menu, e não por parentesco de assunto.
  */
  {
    nome: "sobre",
    grupo: "relatorios",
    foraDoMenu: true,
    rotulo: "Sobre",
    apoioMenu: "Que programa é este",
    apoioTopo: "A versão instalada, quem faz o Optmize e como falar com a gente.",
    icone: "icones.svg#info",
    Componente: Sobre,
  },
  {
    nome: "conta",
    grupo: "relatorios",
    foraDoMenu: true,
    rotulo: "Configurações da conta",
    apoioMenu: "Quem está usando",
    apoioTopo: "A conta que está aberta nesta máquina e a empresa dela.",
    icone: "icones.svg#user-cog",
    Componente: Conta,
  },
  {
    /*
      O PAINEL DO DONO. `foraDoMenu` como as duas acima: quem o abre é o botão
      logo acima do pé da barra (ver `casca/Menu.tsx`), que só aparece para a
      conta dona da empresa.
    */
    nome: "painel",
    grupo: "relatorios",
    foraDoMenu: true,
    rotulo: "Painel",
    apoioMenu: "Acessos dos funcionários",
    apoioTopo: "Crie, desative e exclua os acessos dos funcionários da empresa.",
    icone: "icones.svg#shield-user",
    Componente: Painel,
  },
];

/** As telas de um grupo que aparecem no menu, na ordem em que estão declaradas acima. */
export function telasDoGrupo(grupo: NomeDeGrupo): Tela[] {
  return TELAS.filter((tela) => tela.grupo === grupo && !tela.foraDoMenu);
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
