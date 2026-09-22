/**
 * ===========================================================================
 * O QUE O PLANO LIBERA — e as telas que ele não libera
 * ===========================================================================
 *
 * A central das impressoras deixou de valer para todo mundo: ela é dos planos
 * pagos, e quem está no Padrão (assinatura zero, crédito por exportação)
 * encaixa, otimiza e exporta, mas não acompanha a produção. A separação mora
 * no catálogo, no servidor (`domain/plans.ts`, escopo `impressoras`), e chega
 * aqui pronta — esta pasta não decide nada, só obedece.
 *
 * ---------------------------------------------------------------------------
 * POR QUE UM CONTEXTO, E NÃO UMA LEITURA POR TELA
 * ---------------------------------------------------------------------------
 *
 * Quem sabe quem está usando é a `Casca`, e ela envolve tudo. Cada tela ler
 * `/api/sessao/eu` por conta própria daria um pedido por troca de aba, e o
 * menu e a tela responderiam a perguntas feitas em momentos diferentes —
 * piscando o cadeado numa e não na outra. Uma leitura, um valor, dois
 * consumidores.
 *
 * ---------------------------------------------------------------------------
 * ISTO É TELA, NÃO SEGURANÇA
 * ---------------------------------------------------------------------------
 *
 * Vale o mesmo que está escrito na `TelaTrancada` e no portão da conta: a API
 * local continua respondendo, e `server.js` escuta em `0.0.0.0`. Quem barra de
 * verdade é o servidor, em cada operação que depende dele. O que se esconde
 * aqui é o que não foi comprado — para ninguém trabalhar meia hora numa tela
 * que vai recusar o trabalho no fim.
 *
 * E o silêncio vale a favor de quem usa: sem resposta sobre os escopos
 * (`null`), tudo aparece. É a mesma escolha do portão da conta — primeira
 * abertura sem internet não pode esconder o programa de quem pagou por ele.
 */

import { createContext, useContext, type ReactNode } from "react";

import { Icone } from "./Icone";
import type { Tela } from "../rotas";

const ContextoDeEscopos = createContext<readonly string[] | null>(null);

export function ProvedorDeEscopos({
  escopos,
  children,
}: {
  escopos: readonly string[] | null;
  children: ReactNode;
}) {
  return (
    <ContextoDeEscopos.Provider value={escopos}>{children}</ContextoDeEscopos.Provider>
  );
}

/** O que o plano libera, ou `null` enquanto não se sabe. */
export function useEscopos(): readonly string[] | null {
  return useContext(ContextoDeEscopos);
}

/**
 * Esta tela está fora do plano?
 *
 * `false` para tela sem escopo (a maioria) e enquanto os escopos são `null`.
 */
export function useForaDoPlano(tela: Pick<Tela, "escopo">): boolean {
  const escopos = useEscopos();
  if (!tela.escopo || escopos === null) return false;
  return !escopos.includes(tela.escopo);
}

/**
 * O miolo da tela, ou o aviso de que ela não está no plano.
 *
 * Fica entre a rota e o componente para a tela não precisar saber que existe
 * plano: `Impressoras.tsx` continua sendo uma tela de impressoras, e não uma
 * tela de impressoras que às vezes é um aviso de venda.
 */
export function ComEscopo({ tela, children }: { tela: Tela; children: ReactNode }) {
  const fora = useForaDoPlano(tela);
  if (!fora) return <>{children}</>;
  return <ForaDoPlano rotulo={tela.rotulo} />;
}

/**
 * O aviso. Diz o que falta e o que fazer — e não "acesso negado".
 *
 * Quem chega aqui não errou nada: escolheu um plano que não inclui esta
 * parte. A frase que resolve é qual plano inclui, e com quem falar.
 */
function ForaDoPlano({ rotulo }: { rotulo: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="flex max-w-[440px] flex-col items-center gap-3 text-center">
        <span className="grid size-12 place-items-center rounded-2xl border border-[var(--accent-line)] bg-[var(--accent-soft)]">
          <Icone referencia="icones.svg#lock" className="size-6 text-ambar" />
        </span>
        <p className="m-0 text-[0.95rem] font-semibold text-tinta">
          {rotulo} não está no seu plano
        </p>
        <p className="m-0 text-[0.85rem] leading-relaxed text-tinta-fraca">
          A central das impressoras acompanha a produção das máquinas da
          gráfica — ela vem no plano mensal e na licença anual. O seu plano
          encaixa, otimiza e exporta à vontade.
        </p>
        <p className="m-0 text-[0.8rem] text-tinta-apagada">
          Para mudar de plano, fale com a CodeEx Solutions pelo{" "}
          <span className="text-ambar">@codeexsolutions</span>.
        </p>
      </div>
    </div>
  );
}
