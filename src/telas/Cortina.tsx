/**
 * ===========================================================================
 * A CORTINA — entre o login e a área de trabalho
 * ===========================================================================
 *
 * Vem do Optmize Lite (`features/auth/EntranceCurtain.tsx`), e existe por dois
 * motivos que se somam:
 *
 *   1. COBRE UMA ESPERA QUE EXISTE. Entrar não é instantâneo: a casca monta, o
 *      editor de produção sobe, as telas chegam por `import()`. Sem a cortina,
 *      o clique em "Entrar" é seguido de um pedaço de tela em branco, e branco
 *      lê como travou.
 *
 *   2. DIZ EM NOME DE QUEM. Numa gráfica onde três pessoas dividem o mesmo
 *      computador, "de quem é esta conta?" é a primeira pergunta do dia. A
 *      cortina responde antes de alguém mexer num pedido — e é por isso que
 *      ela mostra o PRIMEIRO NOME, e não o e-mail: é como as pessoas se
 *      chamam ali dentro.
 *
 * No Full ela dura o mesmo tempo do Lite e é escrita com as cores e o sprite
 * daqui; as animações do `framer-motion` viraram CSS, em `estilo/entrada.css`.
 */

import { Icone } from "../casca/Icone";

/**
 * Quanto tempo a cortina fica na tela.
 *
 * 1,5 s é o número do Lite, e é deliberadamente MAIS do que a casca leva para
 * montar: uma cortina que sai antes da tela estar pronta devolve o branco que
 * ela existe para cobrir. Errar para o lado longo custa um segundo por dia a
 * quem abre o programa uma vez; errar para o curto devolve o problema.
 */
export const CORTINA_MS = 1500;

export function Cortina({ nome }: { nome: string }) {
  const primeiro = nome.trim().split(/\s+/)[0] || "";

  return (
    <div className="cortina-entra fixed inset-0 z-100 grid place-items-center bg-fundo">
      {/* O mesmo brilho da coluna da tela de entrar, para ser a mesma casa. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_50%_at_50%_40%,var(--accent-soft)_0%,transparent_65%)]"
      />

      <div className="cortina-sobe relative flex flex-col items-center gap-4 text-center">
        <div className="relative">
          {/* O halo pulsando atrás da marca. */}
          <span
            aria-hidden="true"
            className="cortina-pulsa absolute -inset-5 rounded-full bg-[var(--accent-soft)] blur-2xl"
          />
          <img
            src={`${import.meta.env.BASE_URL}icone.png`}
            alt=""
            className="relative size-16 rounded-2xl"
          />
        </div>

        <h1 className="m-0 font-titulo text-[22px] tracking-tight text-tinta">
          Bom trabalho{primeiro ? `, ${primeiro}` : ""}.
        </h1>

        <p className="m-0 flex items-center gap-2 text-[12.5px] text-tinta-fraca">
          <Icone
            referencia="icones.svg#loader-circle"
            className="cortina-gira size-3.5 text-ambar"
          />
          Abrindo sua área de trabalho…
        </p>
      </div>
    </div>
  );
}
