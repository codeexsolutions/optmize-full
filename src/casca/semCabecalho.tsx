/**
 * ===========================================================================
 * A TELA QUE PEDE O CABEÇALHO DE VOLTA
 * ===========================================================================
 *
 * O cabeçalho é decidido pela ROTA (ver `bancada`, em `Casca.tsx`), e isso
 * resolve quase tudo: Encaixe e Projetos são bancada sempre, as outras são
 * documento sempre. Só que existem telas em que ele atrapalha e a rota não
 * tem como saber:
 *
 *   IMPRESSORAS sem nenhuma máquina  não é um painel, é uma porta — um radar
 *               no meio da janela e um botão. Isso a tela só descobre depois
 *               de perguntar ao servidor.
 *
 *   LICENÇA     é uma tela de uma coisa só, que precisa da altura inteira
 *               para ficar centrada. O cabeçalho repetiria a palavra
 *               "Licença" logo acima do cartão que já diz isso.
 *
 * Daí o pedido vir de dentro. É um interruptor só, e ele se desliga sozinho
 * quando a tela sai do ar (o `return` do efeito), então uma tela não consegue
 * esconder o cabeçalho da próxima.
 *
 * Mora num arquivo próprio, e não dentro da `Casca`, porque a tela de Licença
 * precisa dele e a Casca precisa da tela de Licença (é ela que desenha o
 * bloqueio). Com os dois no mesmo arquivo isso seria um ciclo de importação —
 * que o empacotador aceita e que quebra na ordem errada de inicialização, do
 * jeito mais difícil de achar.
 */

import { createContext, useContext, useEffect } from "react";

const PedirSemCabecalho = createContext<(esconder: boolean) => void>(() => {});

export const ProvedorSemCabecalho = PedirSemCabecalho.Provider;

/** Esconde o cabeçalho enquanto `ativo` for verdade. Ver o bloco acima. */
export function useSemCabecalho(ativo: boolean) {
  const pedir = useContext(PedirSemCabecalho);
  useEffect(() => {
    if (!ativo) return;
    pedir(true);
    return () => pedir(false);
  }, [ativo, pedir]);
}
