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
 * O ENDEREÇO É `/encaixe`, SEM "#"
 * ---------------------------------------------------------------------------
 *
 * Já foi `#/encaixe`, e o motivo de ter sido era o servidor: o "#" nunca chega
 * a ele, então o Express servia `dist/` como arquivo estático e pronto. O
 * preço era o endereço — um "#" no meio, que não se lê nem se dita por
 * telefone.
 *
 * Agora o caminho chega ao servidor, e ele sabe responder: `servidor/server.js`
 * tem uma rota-curinga que devolve o `index.html` para todo endereço que não
 * seja `/api`, `/uploads` ou arquivo que exista. Isso vale para o navegador E
 * para o app instalado, porque a janela do Tauri navega para esse MESMO
 * servidor (ver `src-tauri/src/main.rs`) — não há um segundo caminho para
 * manter em pé.
 *
 * Os endereços antigos continuam funcionando: quem abrir um `#/moldes` salvo é
 * levado a `/moldes` na entrada (ver `main.tsx`), e o `/app` de antes da
 * migração continua traduzindo os dois formatos.
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

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Casca } from "./casca/Casca";
import { ehProducaoIntegrada } from "./producao/Producao";
import { TELAS, TELA_PADRAO } from "./rotas";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Casca />}>
          {/* A raiz leva à tela inicial, sem deixar o endereço vazio. */}
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
    </BrowserRouter>
  );
}
