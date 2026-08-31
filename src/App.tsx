/**
 * A casca: menu à esquerda, cabeçalho no topo, tela escolhida no miolo.
 *
 * Não sabe o que é molde, encaixe ou vetor — só qual linha da tabela de rotas
 * está aberta. Era o contrato do `interface.js` antigo e continua valendo:
 * tela nova entra em `src/rotas.ts` e mais nada aqui muda.
 */

import { useState } from "react";
import { Menu } from "./casca/Menu";
import { Cabecalho } from "./casca/Cabecalho";
import { useRota } from "./casca/useRota";
import { acharTela } from "./rotas";

export function App() {
  const [rota, irPara] = useRota();
  const [menuAberto, setMenuAberto] = useState(false);
  const tela = acharTela(rota);
  const { Componente } = tela;

  return (
    <div className="h-screen overflow-hidden bg-fundo font-texto text-tinta antialiased">
      <Menu
        atual={rota}
        aberto={menuAberto}
        aoEscolher={irPara}
        aoFechar={() => setMenuAberto(false)}
      />

      {/*
        A casca ocupa a janela e não rola. O cabeçalho fica parado no alto e a
        rolagem é do outlet — assim uma tela que precise da altura toda pede
        `h-full` em vez de descontar o topo numa conta de viewport.
      */}
      <main className="flex h-screen flex-col overflow-hidden tela:ml-[244px]">
        <Cabecalho tela={tela} aoAbrirMenu={() => setMenuAberto(true)} />

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 tela:px-[30px]">
          <Componente />
        </div>
      </main>
    </div>
  );
}
