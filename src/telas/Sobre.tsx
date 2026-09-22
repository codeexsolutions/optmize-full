/**
 * ===========================================================================
 * SOBRE — que programa é este, e de quem
 * ===========================================================================
 *
 * TUDO QUE ESTÁ AQUI MORAVA NO PÉ DA BARRA LATERAL: o desenho da marca, o
 * nome por extenso, o botão do Instagram e a linha de direitos reservados.
 *
 * Saiu de lá por uma razão de espaço e uma de propósito. A de espaço: o pé
 * virou um menu de três ações (Sobre, Conta, Sair), e ação precisa de alvo de
 * clique — a marca e os créditos empurravam as três para baixo da dobra numa
 * janela de 768px. A de propósito: crédito de quem fez é coisa que se procura
 * uma vez, não coisa que se olha o dia inteiro. Um programa aberto oito horas
 * por dia não deve gastar 90px permanentes dizendo o próprio nome para quem já
 * o abriu.
 *
 * O que sobrou no pé é o que se CLICA. O que veio para cá é o que se LÊ.
 */

import { Icone } from "../casca/Icone";

export function Sobre() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 py-2">
      {/*
        A MARCA, agora com o espaço que ela não tinha no pé: o desenho grande,
        o nome por extenso e a versão logo abaixo.
      */}
      <div className="flex items-center gap-4">
        <img
          src={`${import.meta.env.BASE_URL}icone.png`}
          alt="CodeEx Optmize"
          className="size-14 shrink-0 rounded-xl"
        />
        <div className="min-w-0">
          {/*
            O NOME É "CodeEx Optmize", por extenso. A barra lateral abrevia
            para caber em 180px; aqui não há aperto nenhum, e o nome inteiro é
            o que vale num chamado de suporte ou numa foto de tela.
          */}
          <h2 className="m-0 font-titulo text-xl font-semibold tracking-tight text-tinta">
            CodeEx Optmize
          </h2>
          <p className="mt-0.5 mb-0 text-[13px] text-tinta-fraca">
            Moldes, encaixe das peças no tecido e a central das impressoras.
          </p>
        </div>
      </div>

      {/*
        O QUE O SUPORTE PERGUNTA.

        Estes três dados são exatamente o que alguém do outro lado da linha
        pede antes de qualquer outra coisa — e, sem uma tela assim, a resposta
        era "não sei" ou um print do instalador. A versão sai do `package.json`
        na compilação (ver `empacotar/versao-do-lancamento.js`).
      */}
      <div className="rounded-xl border border-linha bg-painel-suave p-4">
        <span className="eyebrow">ESTA INSTALAÇÃO</span>
        <dl className="m-0 mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]">
          <dt className="text-tinta-apagada">Versão</dt>
          <dd className="m-0 font-mono text-tinta">{__VERSAO__}</dd>
          <dt className="text-tinta-apagada">Atualização</dt>
          <dd className="m-0 text-tinta-fraca">
            Automática — o programa avisa quando há versão nova.
          </dd>
        </dl>
      </div>

      {/* QUEM FEZ. */}
      <div className="flex flex-col gap-3">
        <span className="eyebrow">QUEM FAZ O OPTMIZE</span>
        <a
          href="https://instagram.com/codeexsolutions"
          target="_blank"
          rel="noreferrer noopener"
          title="CodeEx Solutions no Instagram"
          className="flex w-fit items-center gap-2 rounded-[9px] border border-linha bg-painel px-3 py-2 text-[13px] text-tinta-fraca no-underline transition-colors hover:border-[var(--accent-line)] hover:text-tinta"
        >
          {/*
            `at-sign`, e não um ícone do Instagram: a lucide não desenha marcas
            de terceiros, e o gerador do sprite recusa nome que ela não tem
            (ver `empacotar/icones.js`). O arroba diz a mesma coisa aqui, ao
            lado do próprio @ escrito.
          */}
          <Icone referencia="icones.svg#at-sign" className="size-4 shrink-0" />
          @codeexsolutions
          <Icone
            referencia="icones.svg#external-link"
            className="size-3 shrink-0 opacity-60"
          />
        </a>
        <p className="m-0 text-[11px] leading-relaxed tracking-[0.06em] text-tinta-apagada uppercase opacity-70">
          © CodeEx Solutions · Todos os direitos reservados
        </p>
      </div>
    </div>
  );
}
