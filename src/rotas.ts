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
 * Sobrou um grupo que aparece no menu, **Produção**: o molde e o trabalho —
 * a biblioteca, o molde tirado da foto, o projeto do cliente e o encaixe no
 * tecido. **Relatórios** guarda só as telas do pé da barra, que ficam fora do
 * menu. Houve um terceiro, **Impressão** (a central das impressoras, os
 * Pedidos, as Máquinas e o WhatsApp), que saiu do programa em 2026-10-27 junto
 * com o Histórico, o Retrabalho e as Macros do Corel.
 *
 * HOUVE UM QUINTO GRUPO, **Design**, para o que se fazia com a ARTE antes de
 * ela virar trabalho: Vetor, Digitalizar, Imagem e Cor. Três dessas telas
 * saíram do programa em 2026-09-21 e sobrou o Digitalizar sozinho — um grupo
 * de um item, que cobrava uma linha de título no menu para separar nada. O
 * Digitalizar passou para Produção, que é onde ele já estava na cabeça de
 * quem usa: o que sai dele é um molde, e molde é Produção.
 *
 * O grupo não entra no endereço. A rota continua sendo só o nome da tela
 * (`/moldes`), então mudar uma tela de grupo não quebra link guardado.
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
 * desenhar a primeira. Eram treze telas num pacote só — quem abria uma
 * esperava todas as outras carregarem junto.
 *
 * A troca de tela passa por um `<Suspense>` (ver `casca/Casca.tsx`), e o
 * pedaço fica no cache do navegador: a espera acontece uma vez por tela.
 *
 * A que ainda é do editor de produção (o Encaixe) não é desenhada pela rota:
 * quem a desenha é o `<Producao/>`, que carrega o editor sob demanda (ver
 * `producao/editor.ts`). A rota dela leva `DoEditor`, que não desenha nada.
 */
/** O lugar da tela do Encaixe na rota: quem a desenha é o `<Producao/>`. */
const DoEditor = () => null;

const Moldes = lazy(() => import("./telas/Moldes").then((m) => ({ default: m.Moldes })));
const Projetos = lazy(() => import("./telas/Projetos").then((m) => ({ default: m.Projetos })));
const Digitalizar = lazy(() => import("./telas/Digitalizar").then((m) => ({ default: m.Digitalizar })));
const Montagem = lazy(() => import("./telas/Montagem").then((m) => ({ default: m.Montagem })));
const Extrator = lazy(() => import("./telas/Extrator").then((m) => ({ default: m.Extrator })));
const Reposicao = lazy(() => import("./telas/Reposicao").then((m) => ({ default: m.Reposicao })));
const Sobre = lazy(() => import("./telas/Sobre").then((m) => ({ default: m.Sobre })));
const Conta = lazy(() => import("./telas/Conta").then((m) => ({ default: m.Conta })));
const Painel = lazy(() => import("./telas/Painel").then((m) => ({ default: m.Painel })));

export type NomeDeTela =
  | "moldes" | "projetos" | "encaixe" | "digitalizar" | "montagem" | "extrator"
  | "reposicao"
  // As duas do PÉ da barra. Não pertencem a assunto nenhum da lista: são o
  // programa falando de si mesmo e da conta, não trabalho de produção.
  | "sobre" | "conta"
  // O painel do dono: abre pelo botão logo acima do pé, e só para ele.
  | "painel";

export type NomeDeGrupo = "producao" | "relatorios";

/**
 * Os grupos, na ordem em que aparecem no menu.
 */
export const GRUPOS: readonly { nome: NomeDeGrupo; rotulo: string }[] = [
  { nome: "producao", rotulo: "Produção" },
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
   * O vídeo de COMO USAR a tela (`casca/ComoUsar.tsx`): o botão no item do
   * menu e na própria tela só existe quando ele existe. `feminino` é para a
   * frase — "como usar a Montagem", "como usar o Encaixe".
   */
  comoUsar?: { video: string; feminino?: boolean; capitulos?: { titulo: string; inicio: number }[] };
  /**
   * A tela existe, tem endereço e cabeçalho — mas não aparece no menu: quem
   * a abre é outro botão (o pé da barra, o botão do painel do dono).
   */
  foraDoMenu?: boolean;
  /**
   * A tela só existe para quem tem este escopo no plano.
   *
   * Quem decide é o PLANO da conta, e a mesma tela abre para uns e não para
   * outros. Sem escopo escrito, a tela é de todos.
   *
   * Quem confere é `casca/Escopos.tsx`, entre a rota e o componente — a tela
   * não precisa saber que existe plano.
   *
   * Desde 2026-09-28 o Mensal é só o Encaixe e a Galeria (que não têm
   * escopo): `moldes` tranca Moldes, Digitalizar e Montagem, `extrator` o
   * Extrator (desde 2026-10-27). Os nomes são os do servidor
   * (`ALL_SCOPES`, em optmize-backend/src/domain/plans.ts).
   */
  escopo?: Escopo;
  Componente: ComponentType;
}

/** Os escopos que trancam tela — o nome é o do servidor. */
export type Escopo = "moldes" | "extrator";

export const TELAS: readonly Tela[] = [
  // ------------------------------------------------------------- Produção
  /*
   * ENCAIXE, REPOSIÇÃO E GALERIA PRIMEIRO (pedido do dono, 2026-10-27): é o
   * que todo plano tem, e o Mensal Encaixe só tem isso. Moldes, Digitalizar,
   * Montagem e Extrator vêm depois — para quem não comprou, com o cadeado.
   */
  {
    nome: "encaixe",
    grupo: "producao",
    rotulo: "Encaixe",
    apoioMenu: "Aproveitamento do tecido",
    apoioTopo: "Otimize o uso do tecido e prepare arquivos para impressão.",
    icone: "icones.svg#blocks",
    // Os capítulos saem de brag-output-2026-10-27-como-usar/composicoes/*/capitulos.json.
    comoUsar: {
      video: "video/como-usar-encaixe.mp4",
      capitulos: [
        { titulo: "A produção", inicio: 0 },
        { titulo: "O nome manda", inicio: 20.262 },
        { titulo: "A cor não muda", inicio: 37.062 },
        { titulo: "Optmizar", inicio: 48.25 },
        { titulo: "O encaixe", inicio: 62.572 },
        { titulo: "O resultado", inicio: 82.455 },
      ],
    },
    Componente: DoEditor,
  },
  {
    /*
     * A REPOSIÇÃO: todo encaixe exportado fica guardado aqui, peça por peça,
     * e as que saírem erradas voltam ao Encaixe com a medida de antes. Ao
     * lado da Galeria porque as duas guardam trabalho pronto — a Galeria o
     * que se repete, a Reposição o que se refaz.
     */
    nome: "reposicao",
    grupo: "producao",
    rotulo: "Reposição",
    apoioMenu: "Refazer peças de um trabalho",
    apoioTopo: "Cada encaixe exportado fica guardado aqui: escolha as peças que precisam sair de novo e mande ao Encaixe.",
    icone: "icones.svg#rotate-ccw",
    comoUsar: { video: "video/reposicao.mp4", feminino: true },
    Componente: Reposicao,
  },
  {
    nome: "projetos",
    grupo: "producao",
    // A tela se chama Galeria desde que o Encaixe passou a complementar com
    // as artes guardadas aqui; o nome interno continua `projetos`, que é o
    // da rota, da API e das tabelas.
    rotulo: "Galeria",
    apoioMenu: "Artes guardadas por cliente",
    apoioTopo: "Guarde por cliente as artes prontas: repita o trabalho ou complete os vãos do encaixe com elas.",
    icone: "icones.svg#image",
    Componente: Projetos,
  },
  {
    nome: "moldes",
    grupo: "producao",
    rotulo: "Moldes",
    apoioMenu: "Modelagem da produção",
    apoioTopo: "Centralize moldes, tamanhos e estampas da produção.",
    icone: "icones.svg#shapes",
    escopo: "moldes",
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
    // Digitalizar é o jeito de CRIAR molde: vai junto da biblioteca.
    escopo: "moldes",
    comoUsar: { video: "video/digitalizar.mp4" },
    Componente: Digitalizar,
  },
  {
    /*
     * Logo depois de Digitalizar, porque é para onde ele leva: a foto vira
     * risco lá, e o risco vira MOLDE aqui — peça com nome, pique, fio e
     * margem, pronto para a estante e para o Encaixe. Fica no menu (e não
     * como porta, feito Máquinas) porque é lugar de trabalho: qualquer molde
     * da estante, inclusive de DXF, é montado aqui, e a graduação (parte 2)
     * vai morar aqui também.
     */
    nome: "montagem",
    grupo: "producao",
    rotulo: "Montagem",
    apoioMenu: "Peças, marcações e tamanhos",
    apoioTopo: "Dê nome às peças, marque piques, fio e margem, e mande o molde ao Encaixe.",
    icone: "icones.svg#layers",
    // Mexe nos moldes da estante: mesma tranca de Moldes e Digitalizar.
    escopo: "moldes",
    comoUsar: { video: "video/montagem.mp4", feminino: true },
    Componente: Montagem,
  },
  {
    /*
     * Depois da Montagem e antes da Galeria: os três de cima começam numa
     * foto ou num molde e terminam num MOLDE; este começa na foto e termina
     * na ARTE — cada logo, texto e estampa separados, em vetor ou PNG grande.
     * Ver docs/superpowers/specs/2026-10-06-extrator-design.md.
     *
     * Trancado desde 2026-10-26: o Mensal Encaixe é só o Encaixe, a
     * Reposição e a Galeria. Desde 2026-10-27 pelo escopo próprio,
     * `extrator`, e não mais por `moldes`: o Extrator e os Moldes são
     * vendidos à parte (ver `ForaDoPlano`, em casca/Escopos.tsx). Todo plano
     * que tinha `moldes` ganhou `extrator` no servidor.
     */
    nome: "extrator",
    grupo: "producao",
    rotulo: "Extrator",
    apoioMenu: "A arte separada da foto",
    apoioTopo: "Mande a foto da camisa e receba cada logo, texto e estampa separados, em vetor ou PNG grande.",
    icone: "icones.svg#wand-sparkles",
    escopo: "extrator",
    Componente: Extrator,
  },

  /*
    AS DUAS DO PÉ DA BARRA.

    `foraDoMenu` porque elas não entram na lista de telas: quem as abre é o pé
    (ver o rodapé de `casca/Menu.tsx`), e repeti-las na lista cobraria duas
    linhas permanentes de quem trabalha para mostrar o que se procura uma vez
    por mês.

    O `grupo` é obrigatório no tipo e não tem efeito nelas — `telasDoGrupo`
    descarta `foraDoMenu` antes de olhar o grupo. Ficam em "relatorios" por ser
    o grupo que não aparece no menu, e não por parentesco de assunto.
  */
  {
    nome: "sobre",
    grupo: "relatorios",
    foraDoMenu: true,
    rotulo: "Sobre e suporte",
    apoioMenu: "Que programa é este",
    apoioTopo: "A versão instalada, quem faz o Optmize e como falar com a gente.",
    icone: "icones.svg#life-buoy",
    Componente: Sobre,
  },
  {
    nome: "conta",
    grupo: "relatorios",
    foraDoMenu: true,
    rotulo: "Configurações",
    apoioMenu: "Conta, aparência e equipe",
    apoioTopo: "A conta aberta nesta máquina, o tema e os acessos da equipe.",
    icone: "icones.svg#settings",
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

/**
 * A tela que abre o programa: o Encaixe (2026-10-27). Era Moldes, que o Mensal
 * Encaixe nem tem — quem abria caía direto numa tela trancada.
 */
export const TELA_PADRAO: NomeDeTela = "encaixe";

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
