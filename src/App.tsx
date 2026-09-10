/**
 * ===========================================================================
 * APP — a tabela de rotas virando rotas de verdade
 * ===========================================================================
 *
 * O roteamento era escrito à mão: um `hashchange` num `useState`, em
 * `casca/useRota.ts`. Enquanto foram quatro telas sem sub-rota aquilo cabia;
 * com treze, e com telas que vão ganhar endereço próprio (um molde aberto, um
 * pedido, um encaixe guardado), passou a ser o `react-router` — que dá de
 * graça o que aquilo não dava: rota aninhada, link que é `<a>` de verdade
 * (abre em outra aba, o teclado enxerga), redirecionamento e endereço
 * desconhecido caindo em algum lugar em vez de na primeira tela por acidente.
 *
 * ---------------------------------------------------------------------------
 * POR QUE `HashRouter`, E NÃO `BrowserRouter`
 * ---------------------------------------------------------------------------
 *
 * O endereço continua sendo `#/moldes`. Não é gosto: são meses de link salvo,
 * aba aberta e atalho na área de trabalho da fábrica apontando para o "#" — e
 * o `server.js` tem um redirecionamento de `/app` que carrega o "#" adiante,
 * escrito para essa forma.
 *
 * Além disso o "#" nunca chega ao servidor, então o Express não precisa de
 * rota-curinga para o painel: ele serve `dist/` como arquivo estático e pronto.
 * Com `BrowserRouter`, abrir `/encaixe` direto (ou recarregar a página nela)
 * daria 404 no Express até alguém lembrar de acrescentar o curinga — e daria
 * 404 também no app instalado, onde o servidor é o mesmo.
 *
 * ---------------------------------------------------------------------------
 * AS ROTAS SAEM DA MESMA TABELA QUE O MENU
 * ---------------------------------------------------------------------------
 *
 * `src/rotas.ts` continua sendo a única lista de telas do sistema: o menu, o
 * cabeçalho e as rotas saem dela. Tela nova é uma linha lá e mais nada aqui.
 *
 * As quatro telas do editor de produção (Moldes, Projetos, Encaixe, Cor) têm
 * rota, mas a rota não desenha nada: quem as desenha é o `<Producao/>` da
 * casca, que fica montado o tempo todo para não perder as artes já lidas ao
 * trocar de aba (ver `casca/Casca.tsx`). A rota existe para o endereço, o
 * menu e o cabeçalho funcionarem como nas outras.
 */

import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Casca } from "./casca/Casca";
import { ehProducaoIntegrada } from "./producao/Producao";
import { TELAS, TELA_PADRAO } from "./rotas";

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Casca />}>
          {/* A raiz (`#/`) leva à tela inicial, sem deixar o endereço vazio. */}
          <Route index element={<Navigate to={`/${TELA_PADRAO}`} replace />} />

          {TELAS.map(({ nome, Componente }) => (
            <Route
              key={nome}
              path={nome}
              element={ehProducaoIntegrada(nome) ? null : <Componente />}
            />
          ))}

          {/*
            Endereço que não existe volta para a tela inicial em vez de mostrar
            a casca vazia. `replace` para o botão "voltar" não cair de novo no
            endereço quebrado.
          */}
          <Route path="*" element={<Navigate to={`/${TELA_PADRAO}`} replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
