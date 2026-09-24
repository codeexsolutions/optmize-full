/**
 * ===========================================================================
 * ESPERA — a conta entrou, mas ainda não pode trabalhar
 * ===========================================================================
 *
 * O programa tinha dois estados: fora (tela de entrar) e dentro (o Optmize
 * inteiro). Faltava este terceiro, e a falta era visível de fora: quem
 * cadastrava num plano pago entrava e via o programa completo, com a
 * assinatura pendente — enquanto a tela de cadastro prometia, com todas as
 * letras, que o plano seria liberado quando a CodeEx confirmasse o pagamento.
 *
 * ---------------------------------------------------------------------------
 * POR QUE UMA TELA, E NÃO UM AVISO POR CIMA DO PROGRAMA
 * ---------------------------------------------------------------------------
 *
 * Porque um aviso se fecha, e o que está por trás dele funciona. Quem abre o
 * Optmize para encaixar um pedido e encontra o programa inteiro atrás de uma
 * tarja entende que pode trabalhar — e trabalha, até esbarrar na primeira
 * operação que o servidor recusa, no meio do serviço. A tela cheia responde a
 * pergunta antes de o trabalho começar.
 *
 * ---------------------------------------------------------------------------
 * O QUE ELA NÃO DECIDE
 * ---------------------------------------------------------------------------
 *
 * Nada. Quem diz se a conta pode trabalhar é o backend, e o motivo escrito
 * aqui é o que ele mandou (`blockedReason`). Esta tela desenha, oferece o
 * caminho de falar com quem resolve, e um botão para perguntar de novo.
 *
 * E ELA NÃO É SEGURANÇA — pelo mesmo motivo que a tela de entrar não é: é a
 * TELA que se esconde. A trava de verdade é no servidor, a cada operação que
 * depende dele. Esta aqui existe para ser honesta com quem está esperando, e
 * não para impedir quem quiser contornar.
 */

import { useState } from "react";

import { Icone } from "../casca/Icone";
import type { Acesso } from "../casca/usuario";
import { Porta } from "./Porta";

/** O contato de quem resolve. O mesmo que a tela de cadastro já dava. */
const CONTATO = "@codeexsolutions";

export function Espera({
  acesso,
  nome,
  aoConferir,
  aoSair,
}: {
  acesso: Acesso;
  /** Nome de quem entrou — a tela fala com a pessoa, não com "o usuário". */
  nome: string;
  /** Pergunta de novo ao servidor e relê a sessão. */
  aoConferir: () => Promise<void>;
  aoSair: () => void;
}) {
  const [conferindo, setConferindo] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [erroDoPagamento, setErroDoPagamento] = useState<string | null>(null);

  /*
    DUAS ESPERAS DIFERENTES, e a diferença é o que a pessoa faz a seguir.

    `pendente` é "está na mão da CodeEx": pagou, ou escolheu o plano por
    crédito, e falta alguém liberar. Não há nada a fazer além de avisar.

    O outro caso é "está na sua mão": a assinatura não foi acertada. Mandar as
    duas ao mesmo lugar faria metade das pessoas esperar por um telefonema que
    não vai vir, porque quem tem de agir são elas.
  */
  const naMaoDeles = acesso.pendente;

  /** Plano que se paga pelo checkout: a pessoa resolve sozinha, agora. */
  const podePagar = !naMaoDeles && Boolean(acesso.podePagar);

  async function pagar() {
    if (pagando) return;
    setPagando(true);
    setErroDoPagamento(null);
    try {
      const resposta = await fetch("/api/sessao/pagar", { method: "POST" });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) setErroDoPagamento(dados.message || "Não foi possível abrir o pagamento.");
      // Já liberado (sem link): a conferência abaixo tira a pessoa daqui.
      else if (!dados.checkoutUrl) await aoConferir();
    } catch {
      setErroDoPagamento("O Optmize não respondeu. Tente de novo.");
    } finally {
      setPagando(false);
    }
  }

  async function conferir() {
    if (conferindo) return;
    setConferindo(true);
    try {
      await aoConferir();
    } finally {
      setConferindo(false);
    }
  }

  return (
    <Porta
      rodape={
        <button
          type="button"
          onClick={aoSair}
          className="mt-5 flex w-full items-center justify-center gap-2 border-0 bg-transparent p-0 text-[13px] text-tinta-apagada transition-colors hover:text-ambar"
        >
          <Icone referencia="icones.svg#log-out" className="size-4" />
          Sair desta conta
        </button>
      }
    >
      <div className="flex flex-col gap-5 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-[var(--accent-line)] bg-[var(--accent-soft)]">
          <Icone
            referencia={naMaoDeles ? "icones.svg#clock" : "icones.svg#info"}
            className="size-7 text-ambar"
          />
        </span>

        <div>
          <h2 className="m-0 font-titulo text-xl font-semibold text-tinta">
            {naMaoDeles ? "Estamos liberando a sua conta" : "Falta acertar o plano"}
          </h2>
          <p className="mt-2 mb-0 text-[13.5px] leading-relaxed text-tinta-fraca">
            {naMaoDeles
              ? `${nome}, o seu cadastro chegou aqui. Assim que a CodeEx Solutions confirmar, o Optmize abre — não é preciso instalar nada de novo.`
              : podePagar
                ? `${nome}, a sua conta existe e falta pagar o plano. Clique em "Pagar agora": o pagamento abre no navegador e, aprovado, o programa libera sozinho.`
                : `${nome}, a sua conta existe e o plano ainda não foi acertado. Fale com a CodeEx Solutions para liberar o programa.`}
          </p>
        </div>

        {/*
          O MOTIVO, COMO O SERVIDOR O ESCREVEU.

          Fica num quadro à parte, e não misturado ao texto acima: aquele é o
          que a gente diz, este é o que o sistema diz. Quando alguém ligar para
          o suporte, é esta frase que vai ser lida ao telefone — e ela precisa
          ser a mesma que o painel mostra do outro lado.
        */}
        {acesso.motivo && (
          <p className="m-0 rounded-xl border border-linha bg-fundo px-3.5 py-2.5 text-left text-[12.5px] leading-relaxed text-tinta-fraca">
            {acesso.motivo}
          </p>
        )}

        {acesso.plano && (
          <p className="m-0 flex items-center justify-center gap-2 text-[12px] text-tinta-apagada">
            <Icone referencia="icones.svg#badge-check" className="size-3.5 text-ambar" />
            Plano escolhido: {acesso.plano}
          </p>
        )}

        {podePagar && (
          <button
            type="button"
            onClick={pagar}
            disabled={pagando}
            className="botao-entrar w-full gap-2 px-4 text-[15px]"
          >
            <Icone referencia="icones.svg#external-link" className="size-4" />
            {pagando ? "Abrindo o pagamento…" : "Pagar agora"}
          </button>
        )}
        {erroDoPagamento && (
          <p className="m-0 text-[12.5px] text-[var(--danger)]">{erroDoPagamento}</p>
        )}

        {/*
          Com "Pagar agora" na frente, o conferir vira o segundo botão —
          contornado, e não cheio: são dois passos, e o primeiro é pagar.
        */}
        <button
          type="button"
          onClick={conferir}
          disabled={conferindo}
          className={podePagar
            ? "flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--accent-line)] bg-[var(--accent-soft)] px-4 py-3 text-[14px] font-medium text-ambar transition-colors hover:border-[var(--accent)]"
            : "botao-entrar w-full gap-2 px-4 text-[15px]"}
        >
          <Icone referencia="icones.svg#refresh-cw" className="size-4" />
          {conferindo ? "Conferindo…" : podePagar ? "Já paguei — conferir" : "Já liberaram — conferir de novo"}
        </button>

        <p className="m-0 text-[12px] leading-relaxed text-tinta-apagada">
          Fale com a CodeEx Solutions pelo{" "}
          <span className="text-ambar">{CONTATO}</span>.
        </p>
      </div>
    </Porta>
  );
}
