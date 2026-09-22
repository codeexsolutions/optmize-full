/**
 * ===========================================================================
 * A PORTA — a moldura de quem ainda não entrou
 * ===========================================================================
 *
 * Duas colunas no computador: a marca e o que o programa faz à esquerda, um
 * cartão à direita. É o desenho do painel web (`layouts/AuthLayout.tsx`, no
 * outro repositório), e é por isso que ele é um arquivo à parte aqui também:
 * há DUAS telas antes de entrar — o login e o cadastro da empresa —, e elas
 * têm de ser a mesma casa.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO SAIU DE DENTRO DO `Entrar.tsx`
 * ---------------------------------------------------------------------------
 *
 * Porque a moldura nasceu lá dentro, quando o login era a única porta. Quando
 * o cadastro chegou, ele foi desenhado como uma página de rolagem, sem coluna
 * e sem cartão — e clicar em "Cadastrar a minha empresa" trocava de prédio no
 * meio da frase. Copiar as duas colunas para o outro arquivo resolveria a
 * vista de hoje e criaria duas molduras para manter: no dia de trocar o
 * brilho do fundo, uma das duas ficaria para trás.
 *
 * O que muda entre as duas telas é só o miolo do cartão (`children`) e o que
 * vem debaixo dele (`rodape`) — o convite para cadastrar, num lado; o caminho
 * de volta ao login, no outro.
 */

import type { ReactNode } from "react";

import { Icone } from "../casca/Icone";

/** O que o programa faz, para a coluna da esquerda. */
const VANTAGENS = [
  {
    icone: "icones.svg#layers",
    titulo: "Encaixe automático",
    texto: "Acha o arranjo que gasta menos tecido.",
  },
  {
    icone: "icones.svg#ruler",
    titulo: "Metragem na hora",
    texto: "O número que vira orçamento, antes de cortar.",
  },
  {
    icone: "icones.svg#printer",
    titulo: "Central das impressoras",
    texto: "A produção inteira num painel só.",
  },
  {
    icone: "icones.svg#badge-check",
    titulo: "Sem perder cor",
    texto: "A arte sai igual à que entrou.",
  },
];

export function Porta({
  children,
  rodape,
}: {
  /** O miolo do cartão. */
  children: ReactNode;
  /** O que vem debaixo do cartão, fora dele. */
  rodape?: ReactNode;
}) {
  return (
    <div className="grid h-screen w-full overflow-hidden bg-fundo font-texto text-tinta antialiased tela:grid-cols-[1.05fr_1fr]">
      {/*
        A COLUNA DA ESQUERDA some abaixo de 801px (`tela:`), como no painel web: numa
        janela estreita ela empurraria o cartão para fora da vista, e o cartão
        é a única coisa aqui que alguém precisa alcançar.
      */}
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-linha p-12 tela:flex">
        {/*
          O fundo da coluna: o mesmo par de camadas da barra lateral — um
          brilho âmbar no alto à esquerda sobre um degradê vertical. Nenhum hex:
          tudo sai dos tokens, então trocar a cor da marca leva esta tela junto.
        */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_50%_at_0%_0%,var(--accent-soft)_0%,transparent_60%),linear-gradient(178deg,var(--card-bg)_0%,var(--sidebar-bg)_45%,var(--bg)_100%)]"
        />
        <div className="relative flex items-center gap-3">
          {/* A MARCA DE VERDADE, e não um ícone genérico: é o mesmo desenho
              que o instalador, a aba do navegador e o pé da barra usavam. */}
          <img
            src={`${import.meta.env.BASE_URL}icone.png`}
            alt=""
            className="size-10 shrink-0 rounded-[10px]"
          />
          {/*
            O NOME é "CodeEx Optmize", e nada mais.

            Não há edição, versão nem sufixo a distinguir: é um programa só, e o
            que muda entre os planos é como se paga por ele. Na porta de
            entrada, o que a pessoa lê é o mesmo nome que está no instalador,
            na aba do navegador e na tela Sobre.
          */}
          <span className="font-titulo text-[20px] tracking-tight">
            <span className="text-tinta-fraca">CodeEx </span>
            <span className="font-bold text-ambar">Optmize</span>
          </span>
        </div>

        <div className="relative max-w-md">
          <h2 className="font-titulo text-[34px] leading-[1.1] tracking-tight text-tinta">
            Menos tecido
            <br />
            <span className="text-ambar">no mesmo pedido.</span>
          </h2>

          <ul className="mt-8 flex list-none flex-col gap-4 p-0">
            {VANTAGENS.map((v) => (
              <li key={v.titulo} className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[var(--accent-line)] bg-[var(--accent-soft)] text-ambar">
                  <Icone referencia={v.icone} className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] text-tinta">{v.titulo}</span>
                  <span className="block text-[12.5px] leading-relaxed text-tinta-fraca">
                    {v.texto}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative m-0 text-[11.5px] text-tinta-apagada">
          © {new Date().getFullYear()} Optmize · CodeEx Solutions
        </p>
      </aside>

      <div className="relative flex h-full w-full justify-center overflow-y-auto px-4 py-6">
        {/* Os brilhos presos à coluna do cartão, como no painel web. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-24 -left-24 size-[420px] rounded-full bg-ambar opacity-[0.10] blur-[130px]" />
          <div className="absolute -right-24 -bottom-24 size-[420px] rounded-full bg-ambar opacity-[0.07] blur-[130px]" />
        </div>

        {/*
          `my-auto`, E NÃO `items-center` NA COLUNA.

          Os dois centram o cartão enquanto ele cabe. A diferença aparece
          quando ele não cabe — e o do cadastro não cabe, com os planos e os
          cinco campos: centrado pelo `items-center`, um cartão mais alto que a
          janela tem o TOPO CORTADO, e a rolagem não alcança o que ficou acima
          do zero. A margem automática cede, e a tela rola inteira.

          `max-w-[480px]` é a largura do cartão do login, e o cadastro herda a
          mesma: é o que faz as duas telas parecerem o mesmo cartão com outro
          conteúdo dentro, em vez de duas telas parecidas.
        */}
        <div className="entrada-sobe relative z-10 my-auto w-full max-w-[480px]">
          {/* No computador a marca já está na coluna ao lado; aqui repetiria. */}
          <div className="mb-6 flex flex-col items-center gap-3 tela:hidden">
            <img
              src={`${import.meta.env.BASE_URL}icone.png`}
              alt=""
              className="size-14 rounded-xl"
            />
            <h1 className="m-0 font-titulo text-2xl tracking-tight">
              <span className="font-medium text-tinta-fraca">CodeEx </span>
              <span className="font-bold text-ambar">Optmize</span>
            </h1>
          </div>

          <div className="relative rounded-2xl border border-linha bg-painel/90 p-8 backdrop-blur transition-[border-color,box-shadow] duration-300 shadow-[0_30px_70px_-24px_rgba(0,0,0,0.85)] focus-within:border-[var(--accent-line)] focus-within:shadow-[0_30px_70px_-24px_rgba(0,0,0,0.85),0_0_0_1px_var(--accent-line)]">
            {/* O fio de luz no topo do cartão — o detalhe que o painel web tem. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent opacity-60"
            />

            {children}
          </div>

          {rodape}
        </div>
      </div>
    </div>
  );
}

/**
 * O CNPJ **ou** o CPF com máscara enquanto se digita.
 *
 * UM CAMPO SÓ, sem escolher o tipo antes. Onze dígitos viram
 * `529.982.247-25`; catorze viram `11.222.333/0001-81`. Como nenhum CPF tem
 * catorze dígitos e nenhum CNPJ tem onze, o tamanho decide sozinho — e um
 * seletor "CPF/CNPJ" seria um clique a mais para dizer o que o próprio número
 * já diz.
 *
 * NO CAMINHO ATÉ ONZE DÍGITOS a máscara é a do CPF, porque é o formato que os
 * dois compartilham no começo (`000.000.000`). Ao chegar no décimo segundo,
 * ela vira CNPJ inteira. O pulo é visível e é o certo: quem está digitando um
 * CNPJ vê a barra aparecer na hora em que ele deixa de caber num CPF.
 *
 * A máscara é só da TELA: o que viaja é o que a pessoa escreveu, e quem
 * normaliza e confere os dígitos verificadores é o servidor
 * (`domain/documento.ts`). Conferir aqui também daria duas respostas para a
 * mesma pergunta no dia em que uma das duas mudasse.
 */
export function mascararDocumento(texto: string): string {
  const d = texto.replace(/\D/g, "").slice(0, 14);

  if (d.length <= 11) {
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }

  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * Um campo com o ícone DENTRO, à esquerda.
 *
 * O ícone é absoluto e o campo ganha recuo para não escrever por cima dele; é
 * por isso que o `<span>` de fora é `relative` e o ícone é
 * `pointer-events-none` — sem isso, clicar no desenho não põe o cursor no
 * campo, e o alvo de clique mais óbvio da linha seria justamente o pedaço
 * morto.
 *
 * Vive aqui, e não em cada tela, porque o login e o cadastro desenham o mesmo
 * campo: quem digita o e-mail nas duas telas tem de ver a mesma caixa.
 */
export const CAMPO =
  "w-full rounded-xl border border-linha bg-fundo py-3.5 pr-3 pl-10 text-[14px] text-tinta"
  + " outline-none transition-[border-color,box-shadow]"
  + " focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]";

/** O rótulo pequeno acima de cada campo. */
export const ROTULO = "text-[11px] font-medium text-tinta-fraca";

/**
 * O rótulo de um GRUPO de campos.
 *
 * Não usa a classe `.eyebrow` do programa, e o motivo é o mesmo do
 * `botao-entrar`: aquela regra vive dentro de `:where(.producao)`, e estas
 * telas estão fora da produção — a classe existiria no HTML sem pintar nada.
 */
export const GRUPO =
  "mb-0 p-0 text-[10.5px] font-medium tracking-[1.4px] text-tinta-apagada uppercase";
