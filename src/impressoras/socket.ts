/**
 * ===========================================================================
 * O SOCKET — como a tela fica sabendo sem perguntar
 * ===========================================================================
 *
 * As impressoras são a única parte do Optimize que muda sozinha: moldes e
 * projetos só mudam quando alguém mexe, mas uma impressão começa e termina
 * sem ninguém tocar na tela. Por isso aqui existe socket, e no resto do app
 * não.
 *
 * Uma conexão só para o app inteiro. Cada tela diz que eventos lhe interessam
 * (`useEventos`) e recebe uma chamada quando eles chegam; ninguém abre socket
 * próprio, senão quatro telas abertas seriam quatro conexões repetindo o
 * mesmo tráfego.
 *
 * **Falha de socket não derrota a tela.** É a mesma regra que vale para a
 * memória do Encaixe: sem o servidor de eventos, tudo continua funcionando —
 * a tela só deixa de se atualizar sozinha e volta a depender de quem recarrega
 * ou do próprio `useEventos`, que também tem um relógio de reserva. Por isso
 * nada aqui lança erro para fora.
 */

import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";

/**
 * Os eventos que o servidor publica (ver `impressoras/services/`).
 *
 * - `new-print` — apareceu trabalho novo no histórico de alguma máquina.
 * - `history-updated` — o histórico mudou em bloco (importação, cancelamento
 *   descoberto depois).
 * - `print-progress` — o andamento de uma impressão em curso.
 * - `machine-status` — uma máquina ficou online ou saiu do ar.
 * - `ink-level-alert` / `ink-level-status` — o nível de tinta acusado pela máquina.
 * - `machines:scan` — o progresso da varredura da rede.
 */
export type EventoDeImpressora =
  | "new-print"
  | "history-updated"
  | "print-progress"
  | "machine-status"
  | "ink-level-alert"
  | "ink-level-status"
  | "machines:scan";

let conexao: Socket | null = null;

/**
 * A conexão, criada na primeira vez que alguém precisa dela.
 *
 * O caminho é relativo de propósito: em desenvolvimento o Vite atende em 5173
 * e repassa para o Express (ver o `proxy` do `vite.config.mts`); no programa
 * instalado a porta é sorteada pelo Tauri. Escrever a porta aqui quebraria os
 * dois casos.
 */
function conectar(): Socket {
  if (!conexao) {
    conexao = io({ path: "/socket.io", transports: ["websocket", "polling"] });
  }
  return conexao;
}

/**
 * Escuta eventos do servidor enquanto a tela estiver aberta.
 *
 * O `aoReceber` é guardado numa `ref` para o efeito não precisar dele nas
 * dependências: uma função nova a cada render faria a tela desinscrever e
 * reinscrever a cada pintura, e num evento por segundo (o progresso da
 * impressão) isso é um vaivém constante à toa.
 */
export function useEventos(
  eventos: readonly EventoDeImpressora[],
  aoReceber: (evento: EventoDeImpressora, dados: unknown) => void,
) {
  const guardado = useRef(aoReceber);
  guardado.current = aoReceber;

  // `join` e não o array: um literal novo a cada render mudaria a dependência
  // sem que a lista de eventos tenha mudado de verdade.
  const chave = eventos.join(",");

  useEffect(() => {
    const socket = conectar();
    const nomes = chave ? (chave.split(",") as EventoDeImpressora[]) : [];

    const ouvintes = nomes.map((nome) => {
      const ouvir = (dados: unknown) => guardado.current(nome, dados);
      socket.on(nome, ouvir);
      return { nome, ouvir };
    });

    return () => {
      for (const { nome, ouvir } of ouvintes) socket.off(nome, ouvir);
    };
  }, [chave]);
}

/**
 * Recarrega quando um dos eventos chegar, mas no máximo uma vez a cada
 * `esperaMs`.
 *
 * As máquinas AT reescrevem o mesmo registro enquanto imprimem, e o progresso
 * chega quase a cada segundo. Sem esta espera, cada aviso viraria uma consulta
 * ao servidor e um repinte da lista inteira — a tela ficaria tremendo e o
 * banco levaria uma rajada de consultas para mostrar o mesmo número.
 */
export function useRecarregarComEventos(
  eventos: readonly EventoDeImpressora[],
  recarregar: () => void,
  esperaMs = 1500,
) {
  const pendente = useRef<ReturnType<typeof setTimeout> | null>(null);
  const acao = useRef(recarregar);
  acao.current = recarregar;

  useEventos(eventos, () => {
    if (pendente.current) return;
    pendente.current = setTimeout(() => {
      pendente.current = null;
      acao.current();
    }, esperaMs);
  });

  useEffect(() => () => {
    if (pendente.current) clearTimeout(pendente.current);
  }, []);
}
