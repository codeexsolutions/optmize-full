/**
 * ===========================================================================
 * CASCA — a moldura que fica de pé enquanto as telas passam
 * ===========================================================================
 *
 * Menu à esquerda, cabeçalho no topo, a tela da rota no miolo. Não sabe o que
 * é molde, encaixe ou vetor: só qual linha da tabela de rotas está aberta.
 *
 * Ela é a rota-mãe do `react-router`, e não um componente que o `App` desenha
 * por fora. A diferença importa: o `<Outlet/>` troca só o miolo, então o menu
 * e o cabeçalho não são remontados a cada navegação — e, mais importante, o
 * `<Producao/>` abaixo continua montado o tempo todo.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A PRODUÇÃO MORA AQUI, E NÃO NUMA ROTA
 * ---------------------------------------------------------------------------
 *
 * O editor de produção (Moldes, Projetos, Encaixe, Cor) guarda em memória as
 * artes já lidas — imagens decodificadas, máscaras de silhueta, o resultado do
 * último encaixe. Isso é trabalho de minutos, e desmontá-lo ao trocar de tela
 * jogaria tudo fora. Então ele fica montado sempre e se esconde quando não é a
 * vez dele; as rotas daquelas quatro telas não desenham nada por conta própria
 * (ver `App.tsx`).
 *
 * Quando as três telas imperativas virarem React de verdade, o que sobra deste
 * arranjo é a memória — que passa a ser estado num provedor, e este `hidden`
 * some junto com o `controlador.js`.
 */

import { Suspense, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { Menu } from "./Menu";
import { ProvedorDeDialogo } from "./Dialogo";
import { Cabecalho } from "./Cabecalho";
import { Icone } from "./Icone";
import { Producao } from "../producao/Producao";
import { useTelaAtual, type NomeDeTela } from "../rotas";
import { PainelDaLicenca, useLicenca, type EstadoDaLicenca } from "../telas/Licenca";
import { ProvedorSemCabecalho } from "./semCabecalho";

/*
 * ===========================================================================
 * O PORTÃO DA LICENÇA
 * ===========================================================================
 *
 * Antes de qualquer tela, a casca pergunta ao servidor local se esta
 * instalação está liberada. Sem token ou com ele vencido, o que se vê é a tela
 * de licença e mais nada: o código desta máquina, para mandar ao fornecedor, e
 * o campo onde o token novo é colado.
 *
 * Isto é CONVENIÊNCIA, e é importante não confundir: quem tranca de verdade é
 * o servidor, que responde 402 em toda a API sem licença (ver
 * `servidor/licenca.js`) e sai em bytecode dentro do instalador. Se alguém
 * apagar este portão com o F12 aberto, chega a uma tela bonita onde nada
 * funciona.
 *
 * Enquanto a resposta não chega, a casca desenha normalmente. É de propósito:
 * um piscar de tela de bloqueio a cada abertura, em quem está em dia, seria
 * pior do que o meio segundo em que uma instalação vencida ainda mostra o
 * menu — e o servidor já está recusando tudo nesse meio segundo.
 */
function Bloqueio({ estado }: { estado: EstadoDaLicenca }) {
  return (
    <div className="flex h-screen flex-col overflow-y-auto bg-fundo px-4 py-8 font-texto text-tinta antialiased">
      <div className="mx-auto w-full max-w-[640px]">
        <div className="mb-5 flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}icone.png`} alt="CodeEx Optmize" width={34} height={34} className="size-[34px]" />
          <div>
            <p className="m-0 font-titulo text-[1.1rem] font-semibold tracking-[-0.02em] text-tinta">CodeEx Optmize</p>
            <p className="m-0 text-[0.82rem] text-tinta-fraca">Este computador precisa de um token para continuar.</p>
          </div>
        </div>
        <PainelDaLicenca estado={estado} />
      </div>
    </div>
  );
}

/** A faixa dos últimos dias. Some sozinha quando o token novo entra. */
function FaixaDeVencimento({ dias }: { dias: number }) {
  return (
    <Link
      to="/licenca"
      className="flex shrink-0 items-center justify-center gap-2 border-b border-[var(--accent-line)] bg-[var(--accent-soft)] px-4 py-1.5 text-[0.8rem] text-ambar-claro no-underline transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]"
    >
      <Icone referencia="icones.svg#shield-check" className="size-4 shrink-0" />
      <span>
        {dias === 0
          ? "A licença deste computador vence hoje."
          : `A licença deste computador vence em ${dias} dia${dias === 1 ? "" : "s"}.`}{" "}
        <strong className="font-semibold">Peça o token novo ao fornecedor.</strong>
      </span>
    </Link>
  );
}

export function Casca() {
  const tela = useTelaAtual();
  const navegar = useNavigate();
  const [menuAberto, setMenuAberto] = useState(false);
  const [semCabecalho, setSemCabecalho] = useState(false);
  const licenca = useLicenca();

  const irPara = (nome: NomeDeTela) => navegar(`/${nome}`);

  /*
   * ===========================================================================
   * AS TELAS DE BANCADA: SEM CABEÇALHO E SEM FOLGA
   * ===========================================================================
   *
   * Duas telas não são documento, são BANCADA — uma coluna de um lado, a área
   * de trabalho do outro, as duas medindo-se pela janela:
   *
   *   ENCAIXE    a lista de peças e a mesa do risco;
   *   PROJETOS   a árvore de clientes e o projeto aberto.
   *
   * Num arranjo desses o cabeçalho cobra 57px de altura para repetir a palavra
   * que o menu já mostra acesa, e a folga em volta rouba mais 30 de cada lado
   * — com ela, a coluna da esquerda pareceria um cartão solto no meio da tela
   * em vez da lateral que ela é.
   *
   * Sem os dois, o que sobra para a bancada é a janela inteira, sem `calc()`
   * nenhum. E sem rolagem de página: o que não couber é problema de quem está
   * dentro — a lista rola sozinha, a mesa se ajusta —, nunca da página.
   *
   * Era assim na casca antiga, para o Encaixe
   * (`.producao[data-tela="encaixe"] .pageheader`, em producao.css).
   */
  const bancada = tela.nome === "encaixe" || tela.nome === "projetos";

  /* Bancada ou tela que pediu (ver `useSemCabecalho`): as duas trocam o
     cabeçalho pelo botão flutuante da gaveta. */
  const semTopo = bancada || semCabecalho;

  /*
   * O provedor do diálogo envolve a casca inteira: a caixa de confirmar e a de
   * perguntar são de quem estiver na frente, e uma tela não deveria precisar
   * montar a sua para poder perguntar alguma coisa.
   */
  // Vencida, não há casca: a tela de licença é o programa inteiro.
  if (licenca.dados && !licenca.dados.liberado) {
    return (
      <ProvedorDeDialogo>
        <Bloqueio estado={licenca.dados} />
      </ProvedorDeDialogo>
    );
  }

  const vencendo = licenca.dados && licenca.dados.motivo === "vencendo" ? licenca.dados.dias : null;

  return (
    <ProvedorDeDialogo>
    <ProvedorSemCabecalho value={setSemCabecalho}>
    <div data-tela={tela.nome} className="app-react h-screen overflow-hidden bg-fundo font-texto text-tinta antialiased">
      <Menu aberto={menuAberto} aoFechar={() => setMenuAberto(false)} />

      {/*
        A casca ocupa a janela e não rola. O cabeçalho fica parado no alto e o
        que sobra é do miolo — assim uma tela que precise da altura toda a
        recebe pronta, em vez de descontar o topo numa conta de viewport.
      */}
      {/*
        As duas margens abaixo são A LARGURA DA BARRA, e têm que bater com as
        do `Menu.tsx` no pixel: a barra é `fixed`, então ela não empurra nada —
        quem abre espaço para ela é este `ml`. Quando a barra encolheu de 244
        para 236 e este número ficou para trás, sobrou uma faixa de 8px do
        fundo entre ela e a tela, e a bancada do Encaixe — que é colada na
        janela — deixou de ocupar a largura toda.
      */}
      <main className="flex h-screen flex-col overflow-hidden tela:ml-[236px] tela:max-[1100px]:ml-[78px]">
        {vencendo !== null && <FaixaDeVencimento dias={vencendo} />}
        {semTopo ? (
          /*
           * O BOTÃO FLUTUANTE DA GAVETA.
           *
           * No celular o menu lateral é uma gaveta, e quem a abre é o botão do
           * cabeçalho. Nas telas que não têm cabeçalho, ele precisa existir de
           * outro jeito — senão, num telefone, dá para ENTRAR no Encaixe e não
           * dar para sair dele.
           *
           * Some no `tela:` (801px para cima), onde o menu está sempre à vista.
           * A casca antiga tinha o mesmo botão, na mesma posição, pelo mesmo
           * motivo (`.mobile-menu-btn`, em producao.css).
           */
          <button
            type="button"
            onClick={() => setMenuAberto(true)}
            aria-label="Abrir menu"
            className="fixed top-2 left-2 z-60 grid size-10 place-items-center rounded-[9px] border border-linha bg-painel text-tinta shadow-lg shadow-black/40 tela:hidden"
          >
            <Icone referencia="icones.svg#menu" className="size-5" />
          </button>
        ) : (
          <Cabecalho tela={tela} aoAbrirMenu={() => setMenuAberto(true)} />
        )}

        {/*
          O miolo é uma COLUNA de altura total. Quem rola, no caso comum, é a
          tela lá dentro: o cartão marcado com `preencher` cresce até o pé da
          janela e corre por dentro.

          O `overflow-y-auto` continua aqui como rede: tela sem cartão que
          preenche (as de leitura corrida, como Macros) flui como sempre fluiu
          e rola a página. Sem ele, uma tela mais alta que a janela seria
          cortada sem barra nenhuma.

          A diferença aparece numa lista comprida: rolando a página, o título e
          o filtro sobem e somem; rolando o cartão, eles ficam parados e só a
          lista corre. Num painel que fica aberto o dia inteiro num monitor da
          produção, é a segunda coisa que se espera.
        */}
        <div
          className={[
            "flex min-h-0 flex-1 flex-col",
            bancada
              // `pt-[52px]` só no celular: sem o cabeçalho, quem abre a gaveta
              // é o botão flutuante (abaixo), e sem esta faixa ele cairia em
              // cima da primeira barra da tela.
              ? "overflow-hidden pt-[52px] tela:pt-0"
              : "overflow-y-auto px-3 pb-6 tela:px-[30px]",
            // A tela que escondeu o cabeçalho continua sendo documento: mantém
            // a folga e a rolagem, e só abre a faixa do botão da gaveta.
            !bancada && semCabecalho ? "pt-[52px] tela:pt-3" : "",
          ].join(" ")}
        >
          {/*
            As telas da rota vão DENTRO da `Producao`, e não ao lado dela: é lá
            que mora o provedor da ponte com o controlador imperativo, e a tela
            de Projetos ainda precisa dele para levar um trabalho ao Encaixe. O
            que a `Producao` desenha por conta própria continua escondido
            quando a tela da vez não é dela.

            O `<Suspense>` é a espera das telas que chegam sob demanda (ver o
            `lazy` em `rotas.ts`). É uma linha de texto e não um esqueleto da
            tela: o pedaço baixa em milésimos numa máquina da fábrica, e um
            desenho piscando ali chamaria mais atenção do que a troca de tela.
          */}
          <Producao pagina={tela.nome} irPara={irPara}>
            <Suspense fallback={<p className="p-6 text-sm text-tinta-apagada">Abrindo {tela.rotulo}…</p>}>
              <Outlet />
            </Suspense>
          </Producao>
        </div>
      </main>
    </div>
    </ProvedorSemCabecalho>
    </ProvedorDeDialogo>
  );
}
