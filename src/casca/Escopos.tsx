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

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { Botao } from "./Botao";
import { Icone } from "./Icone";
import { SESSAO_MUDOU } from "./usuario";
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
  return <ForaDoPlano tela={tela} />;
}

/**
 * As partes que se compram pela tela trancada (ver `ForaDoPlano`). O menu as
 * mostra com o cadeado em vez de escondê-las: a tela trancada é a vitrine.
 */
export const VENDIDOS_A_PARTE: ReadonlySet<string> = new Set(["moldes", "extrator"]);

/** O que cada escopo é, em uma frase — é o que o aviso diz que falta. */
const O_QUE_E: Record<NonNullable<Tela["escopo"]>, string> = {
  impressoras: "A central das impressoras acompanha a produção das máquinas da gráfica.",
  moldes:
    "Os Moldes guardam a modelagem da produção, o Digitalizar tira o molde de uma foto e a Montagem dá nome às peças, piques e tamanhos.",
  extrator:
    "O Extrator separa da foto da camisa cada logo, texto e estampa, em vetor ou PNG grande.",
  relatorios: "Os relatórios mostram o histórico, o ponto, os funcionários e a reposição.",
  macro: "As macros ligam o CorelDRAW a este sistema.",
};

/** O nome da parte no botão de comprar: as três telas dos Moldes são uma compra só. */
const NO_BOTAO: Partial<Record<NonNullable<Tela["escopo"]>, string>> = {
  moldes: "Quero os Moldes",
  extrator: "Quero o Extrator",
};

/**
 * O VÍDEO DO QUE FALTA. Os Moldes mostram as duas telas gravadas para o site —
 * o Digitalizar e a Montagem —, começando pela que a pessoa clicou. O Extrator
 * ainda não tem vídeo: vai o ícone dele.
 */
const VIDEOS: Partial<Record<NonNullable<Tela["escopo"]>, { nome: string; rotulo: string }[]>> = {
  moldes: [
    { nome: "digitalizar", rotulo: "Digitalizar" },
    { nome: "montagem", rotulo: "Montagem" },
  ],
};

interface Oferta {
  id: string;
  nome: string;
  precoCentavos: number;
  aMaisCentavos: number;
  escopos: string[];
}

interface Trocas {
  podeTrocar: boolean;
  ofertas: Oferta[];
}

const reais = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * O aviso. Diz o que falta, mostra, e vende ali mesmo.
 *
 * Quem chega aqui não errou nada: escolheu um plano que não inclui esta
 * parte. Desde 2026-10-27 o Mensal Encaixe compra o Extrator ou os Moldes daqui
 * (+R$ 100 cada, ver `TROCAS_DE_PLANO`, no backend): o pagamento abre no
 * navegador, e a tela pergunta de poucos em poucos segundos se já caiu — caiu,
 * a sessão relê o acesso e a tela destranca sozinha. O preço vem do servidor;
 * aqui nada é calculado.
 *
 * Plano que não troca por aqui (o anual, o Equipe) e servidor fora do ar caem
 * no aviso de sempre: falar com a CodeEx.
 */
function ForaDoPlano({ tela }: { tela: Tela }) {
  const { rotulo, escopo } = tela;
  const [trocas, setTrocas] = useState<Trocas | null>(null);
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [videoAtual, setVideoAtual] = useState(0);

  useEffect(() => {
    let vivo = true;
    fetch("/api/sessao/trocas")
      .then((r) => (r.ok ? r.json() : null))
      .then((dados) => {
        if (vivo && dados && Array.isArray(dados.ofertas)) setTrocas(dados);
      })
      .catch(() => {
        // Sem rede: fica o aviso de sempre.
      });
    return () => {
      vivo = false;
    };
  }, []);

  // Com o checkout aberto, pergunta se já foi pago. Pagou: a sessão relê o
  // acesso e o `ComEscopo` de cima passa a mostrar a tela de verdade.
  useEffect(() => {
    if (!assinatura) return;
    const relogio = window.setInterval(async () => {
      try {
        const resposta = await fetch("/api/sessao/trocas/conferir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assinatura }),
        });
        const dados = await resposta.json().catch(() => ({}));
        if (resposta.ok && dados.trocado) window.dispatchEvent(new Event(SESSAO_MUDOU));
      } catch {
        // Sem rede agora: tenta de novo na próxima volta.
      }
    }, 4000);
    return () => window.clearInterval(relogio);
  }, [assinatura]);

  const comprar = useCallback(async (oferta: Oferta) => {
    setOcupado(oferta.id);
    setErro(null);
    try {
      const resposta = await fetch("/api/sessao/trocas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: oferta.id }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(dados.message || "Não foi possível abrir o pagamento.");
      setAssinatura(dados.assinatura || null);
      setCheckout(dados.checkoutUrl || null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir o pagamento.");
    } finally {
      setOcupado(null);
    }
  }, []);

  const abrirDeNovo = useCallback(() => {
    if (!checkout) return;
    void fetch("/api/sessao/abrir-pagamento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: checkout }),
    });
  }, [checkout]);

  // A oferta desta parte é a mais barata que a traz. A "de tudo" é a que traz
  // também a outra parte vendida à parte — o Mensal, que tem o programa inteiro.
  const queTrazem = (trocas?.ofertas ?? [])
    .filter((o) => escopo && o.escopos.includes(escopo))
    .sort((a, b) => a.precoCentavos - b.precoCentavos);
  const principal = queTrazem[0] ?? null;
  const completa =
    queTrazem.find(
      (o) => o !== principal && o.escopos.includes("moldes") && o.escopos.includes("extrator"),
    ) ?? null;

  const videos = escopo ? (VIDEOS[escopo] ?? []) : [];
  const ordem = [...videos].sort(
    (a, b) => Number(b.nome === tela.nome) - Number(a.nome === tela.nome),
  );
  const video = ordem[videoAtual] ?? null;

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-8">
      <div className="flex w-full max-w-[720px] flex-col items-center gap-4 text-center">
        <span className="grid size-12 place-items-center rounded-2xl border border-[var(--accent-line)] bg-[var(--accent-soft)]">
          <Icone referencia="icones.svg#lock" className="size-6 text-ambar" />
        </span>
        <div className="flex flex-col gap-1.5">
          <p className="m-0 text-[1rem] text-tinta">{rotulo} não está no seu plano</p>
          <p className="m-0 text-[0.85rem] leading-relaxed text-tinta-fraca">
            {escopo ? O_QUE_E[escopo] : ""}
          </p>
        </div>

        {principal && trocas && (
          <>
            {video ? (
              <div className="w-full overflow-hidden rounded-2xl border border-linha bg-painel-suave">
                <video
                  key={video.nome}
                  src={`video/${video.nome}.mp4`}
                  poster={`video/${video.nome}.webp`}
                  className="block aspect-[16/10] w-full bg-black object-cover"
                  muted
                  loop
                  playsInline
                  autoPlay
                  aria-label={`Gravação da tela ${video.rotulo}`}
                />
                {ordem.length > 1 && (
                  <div className="flex justify-center gap-1 border-t border-linha p-1.5">
                    {ordem.map((v, i) => (
                      <Botao
                        key={v.nome}
                        tamanho="pequeno"
                        jeito={i === videoAtual ? "secundario" : "fantasma"}
                        onClick={() => setVideoAtual(i)}
                      >
                        {v.rotulo}
                      </Botao>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <span className="grid size-20 place-items-center rounded-3xl border border-linha bg-painel-suave">
                <Icone referencia={tela.icone} className="size-9 text-ambar" />
              </span>
            )}

            <div className="flex w-full flex-col items-center gap-3 rounded-2xl border border-[var(--accent-line)] bg-[var(--accent-soft)] p-4">
              <p className="m-0 font-titulo text-3xl text-ambar">
                +{reais(principal.aMaisCentavos)}
                <span className="ml-1.5 font-sans text-sm text-tinta-fraca">por mês</span>
              </p>
              <p className="m-0 max-w-[460px] text-[12.5px] leading-relaxed text-tinta-fraca">
                O seu plano passa a {reais(principal.precoCentavos)} por mês. O que você já pagou
                deste mês não é cobrado de novo.
              </p>

              {!trocas.podeTrocar ? (
                <p className="m-0 text-[13px] text-tinta">
                  Só o dono da conta pode incluir. Peça a ele para abrir esta tela no Optmize dele.
                </p>
              ) : assinatura ? (
                <div className="flex flex-col items-center gap-2 text-[13px] text-tinta-fraca">
                  <p className="m-0 flex items-center gap-2 text-ambar">
                    <Icone referencia="icones.svg#loader-circle" className="size-4 animate-spin" />
                    O pagamento abriu no navegador. Assim que ele cair, esta tela abre sozinha.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {checkout && (
                      <Botao
                        tamanho="pequeno"
                        onClick={abrirDeNovo}
                        icone={<Icone referencia="icones.svg#external-link" className="size-3.5" />}
                      >
                        Abrir o pagamento de novo
                      </Botao>
                    )}
                    <Botao tamanho="pequeno" jeito="fantasma" onClick={() => setAssinatura(null)}>
                      Voltar
                    </Botao>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap justify-center gap-2">
                  <Botao
                    jeito="primario"
                    tamanho="grande"
                    disabled={ocupado !== null}
                    onClick={() => comprar(principal)}
                  >
                    {ocupado === principal.id
                      ? "Abrindo o pagamento…"
                      : (escopo && NO_BOTAO[escopo]) || `Quero ${rotulo}`}
                  </Botao>
                  {completa && (
                    <Botao
                      tamanho="grande"
                      disabled={ocupado !== null}
                      onClick={() => comprar(completa)}
                    >
                      {ocupado === completa.id
                        ? "Abrindo o pagamento…"
                        : `O programa inteiro por ${reais(completa.precoCentavos)}`}
                    </Botao>
                  )}
                </div>
              )}
              {erro && <p className="m-0 text-[13px] text-[var(--danger)]">{erro}</p>}
            </div>
          </>
        )}

        {!principal && (
          <p className="m-0 text-[0.8rem] text-tinta-apagada">
            Para incluir no seu plano, fale com a CodeEx Solutions pelo{" "}
            <span className="text-ambar">@codeexsolutions</span>.
          </p>
        )}
      </div>
    </div>
  );
}
