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
import { Outlet, useNavigate } from "react-router-dom";
import { Menu } from "./Menu";
import { ProvedorDeDialogo } from "./Dialogo";
import { Cabecalho } from "./Cabecalho";
import { Producao } from "../producao/Producao";
import { useTelaAtual, type NomeDeTela } from "../rotas";

export function Casca() {
  const tela = useTelaAtual();
  const navegar = useNavigate();
  const [menuAberto, setMenuAberto] = useState(false);

  const irPara = (nome: NomeDeTela) => navegar(`/${nome}`);

  /*
   * O provedor do diálogo envolve a casca inteira: a caixa de confirmar e a de
   * perguntar são de quem estiver na frente, e uma tela não deveria precisar
   * montar a sua para poder perguntar alguma coisa.
   */
  return (
    <ProvedorDeDialogo>
    <div data-tela={tela.nome} className="app-react h-screen overflow-hidden bg-fundo font-texto text-tinta antialiased">
      <Menu aberto={menuAberto} aoFechar={() => setMenuAberto(false)} />

      {/*
        A casca ocupa a janela e não rola. O cabeçalho fica parado no alto e a
        rolagem é do miolo — assim uma tela que precise da altura toda pede
        `h-full` em vez de descontar o topo numa conta de viewport.
      */}
      <main className="flex h-screen flex-col overflow-hidden tela:ml-[244px] tela:max-[1100px]:ml-[78px]">
        <Cabecalho tela={tela} aoAbrirMenu={() => setMenuAberto(true)} />

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 tela:px-[30px]">
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
    </ProvedorDeDialogo>
  );
}
