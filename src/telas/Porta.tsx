/**
 * ===========================================================================
 * A PORTA — a moldura de quem ainda não entrou
 * ===========================================================================
 *
 * Duas colunas no computador: a marca, a impressora e o que o programa faz à
 * esquerda, o cartão à direita. É o desenho do painel web
 * (`layouts/AuthLayout.tsx`, no outro repositório), com a rede animada no
 * fundo da coluna da esquerda.
 *
 * A IMPRESSORA voltou em 3D (`Impressora3D.tsx`, em Three.js): uma impressora
 * de grande formato imprimindo a marca num filme que desce pela saída. Fica
 * por cima da rede, com fundo transparente, entre a marca e as vantagens.
 *
 * Há várias telas antes de entrar — login, cadastro, senha, espera — e todas
 * usam esta moldura. O que muda entre elas é só o miolo do cartão
 * (`children`) e o pé dele (`rodape`).
 */

import {
  lazy,
  Suspense,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

import { Icone } from "../casca/Icone";
import { RedeAnimada } from "./RedeAnimada";

/*
  O THREE.JS SÓ CHEGA COM A PORTA. São centenas de KB que nenhuma outra tela
  usa; carregado sob demanda, o programa não paga por ele depois de entrar.
*/
const Impressora3D = lazy(() => import("./Impressora3D").then((m) => ({ default: m.Impressora3D })));

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
    icone: "icones.svg#scan-line",
    titulo: "Moldes por foto",
    texto: "A foto da peça vira molde na medida certa.",
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
  consumido = false,
}: {
  /**
   * O cartão se desfaz: encolhe, desfoca e some, enquanto a entrada no
   * programa acende por cima (ver `telas/Entrada.tsx`).
   */
  consumido?: boolean;
  /** O miolo do cartão. */
  children: ReactNode;
  /** O pé do cartão, debaixo de um traço. */
  rodape?: ReactNode;
}) {
  return (
    <div className="porta grid h-screen w-full overflow-hidden bg-fundo font-texto text-tinta antialiased tela:grid-cols-[1.05fr_1fr]">
      {/*
        A COLUNA DA ESQUERDA some abaixo de 801px (`tela:`): numa janela
        estreita ela empurraria o cartão para fora da vista, e o cartão é a
        única coisa aqui que alguém precisa alcançar.
      */}
      <aside className="relative hidden flex-col overflow-hidden border-r border-linha p-12 tela:flex">
        {/*
          O fundo da coluna: o mesmo par de camadas da barra lateral — um
          brilho âmbar no alto à esquerda sobre um degradê vertical. Nenhum hex:
          tudo sai dos tokens, então trocar a cor da marca leva esta tela junto.
        */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_50%_at_0%_0%,var(--accent-soft)_0%,transparent_60%),linear-gradient(178deg,var(--card-bg)_0%,var(--sidebar-bg)_45%,var(--bg)_100%)]"
        />
        {/*
          A REDE, POR CIMA DO DEGRADÊ E POR BAIXO DE TUDO O MAIS — o fundo do
          login do Flow em laranja. A 60 quadros e com parada longa: é a
          primeira tela que alguém vê, e a 20 o movimento lia como travado.
        */}
        <RedeAnimada className="absolute inset-0 z-0" quadrosPorSegundo={60} pararAposMs={60000} />

        <div className="relative flex items-center gap-3">
          {/* O halo que respira atrás da marca, como no painel web. */}
          <span className="relative grid shrink-0 place-items-center">
            <span
              aria-hidden="true"
              className="porta-pulsa pointer-events-none absolute -inset-3 rounded-full bg-ambar blur-xl"
            />
            <img
              src={`${import.meta.env.BASE_URL}icone.png`}
              alt=""
              className="relative size-10 rounded-[10px]"
            />
          </span>
          <span className="font-titulo text-[20px] ">
            <span className="text-tinta-fraca">CodeEx </span>
            <span className=" text-ambar">Optmize</span>
          </span>
        </div>

        {/*
          A IMPRESSORA OCUPA O QUE SOBRA entre a marca e as vantagens
          (`flex-1 min-h-0`): numa janela baixa ela encolhe, e o texto não é
          empurrado para fora.
        */}
        <div className="relative my-4 min-h-0 flex-1">
          <Suspense fallback={null}>
            <Impressora3D className="absolute inset-0" />
          </Suspense>
        </div>

        <div className="relative">
          <h2 className="m-0 font-titulo text-[30px] leading-[1.1]  text-tinta">
            Menos tecido
            <br />
            <span className="text-ambar">no mesmo pedido.</span>
          </h2>

          {/* Em duas colunas, para a impressora ficar com a altura. */}
          <ul className="mt-6 mb-0 grid list-none grid-cols-2 gap-x-6 gap-y-4 p-0">
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

        {/*
          A versão fica na porta porque quem liga para o suporte quase nunca
          está DENTRO do programa: está parado nesta tela.
        */}
        <p className="relative mt-8 mb-0 text-[11.5px] text-tinta-apagada">
          © {new Date().getFullYear()} Optmize · CodeEx Solutions
          <span className="font-mono text-tinta-apagada/60"> · v{__VERSAO__}</span>
        </p>
      </aside>

      {/*
        A MESA: a coluna do cartão é a bancada onde a folha cai, com a grade
        de centímetros de uma base de corte bem apagada por baixo. Saíram os
        brilhos desfocados — eram o que dava à porta cara de modelo pronto.
      */}
      <div className="porta-mesa relative flex h-full w-full justify-center overflow-y-auto px-6 py-8">

        {/*
          `my-auto`, E NÃO `items-center`: centrado pelo `items-center`, um
          cartão mais alto que a janela (o cadastro) tem o TOPO CORTADO, e a
          rolagem não alcança o que ficou acima do zero. A margem automática
          cede, e a tela rola inteira.
        */}
        <div className={`${consumido ? "consumido" : "entrada-sobe"} porta-cartao relative z-10 my-auto w-full max-w-[480px]`}>
          {/* No computador a marca já está na coluna ao lado; aqui repetiria. */}
          <div className="mb-6 flex flex-col items-center gap-3 tela:hidden">
            <span className="relative grid place-items-center">
              <span
                aria-hidden="true"
                className="porta-pulsa pointer-events-none absolute -inset-4 rounded-full bg-ambar blur-2xl"
              />
              <img
                src={`${import.meta.env.BASE_URL}icone.png`}
                alt=""
                className="relative size-14 rounded-xl"
              />
            </span>
            <h1 className="m-0 font-titulo text-2xl ">
              <span className=" text-tinta-fraca">CodeEx </span>
              <span className=" text-ambar">Optmize</span>
            </h1>
          </div>

          {/*
            A FOLHA QUE SAIU DA IMPRESSORA. Superfície chapada, sem vidro;
            as marcas de corte nos quatro cantos, por fora, e a tira de
            conferência de cor descendo pela margem esquerda — a mesma que
            sai na beira do papel de sublimação. Ver `estilo/entrada.css`.
          */}
          <div className="porta-folha">
            <span aria-hidden="true" className="porta-corte porta-corte-1" />
            <span aria-hidden="true" className="porta-corte porta-corte-2" />
            <span aria-hidden="true" className="porta-corte porta-corte-3" />
            <span aria-hidden="true" className="porta-corte porta-corte-4" />
            <span aria-hidden="true" className="porta-tira">
              <i /><i /><i /><i /><i /><i /><i />
            </span>
            <div className="py-9 pr-9 pl-16">{children}</div>
            {rodape && <div className="porta-folha-pe py-4 pr-9 pl-16">{rodape}</div>}
          </div>
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
 * O CAMPO DA FOLHA — uma caixa com o rótulo DENTRO, em cima do que se digita,
 * e, na senha, o olho.
 *
 * Era a linha de uma ficha, com um ícone à esquerda de cada campo. O ícone
 * saiu (`icone` fica no tipo para quem ainda o passa, e não desenha nada): três
 * desenhos dizendo "documento, envelope, cadeado" ao lado de rótulos que já
 * dizem isso é enfeite. A caixa inteira é clicável e acende em laranja no foco.
 *
 * `senha` liga o olho e cuida do `type` sozinho. Todo o resto vai direto para o `<input>`.
 */
export function Campo({
  rotulo,
  icone: _icone,
  senha = false,
  dica,
  acessorio,
  classe = "",
  className = "",
  ...props
}: {
  rotulo: string;
  /** Não desenha mais nada — ver acima. */
  icone?: string;
  senha?: boolean;
  /** Uma regra curta debaixo do campo ("Ao menos 8 caracteres"). */
  dica?: ReactNode;
  /** Algo à direita do rótulo, na mesma linha ("Esqueci a senha"). */
  acessorio?: ReactNode;
  /** Classe do bloco de fora (o `entrada-degrau`, por exemplo). */
  classe?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const [aberta, setAberta] = useState(false);
  const idGerado = useId();
  const id = props.id ?? idGerado;

  return (
    <div className={`flex flex-col gap-2 ${classe}`}>
      {/*
        A caixa toda leva ao campo: o clique no rótulo ou na borda cai no
        `<input>`, que é onde a pessoa queria escrever.
      */}
      <div className="porta-campo" onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          document.getElementById(id)?.focus();
        }
      }}>
        <label htmlFor={id} className="porta-campo-rotulo">
          {rotulo}
        </label>
        <input
          {...props}
          id={id}
          type={senha ? (aberta ? "text" : "password") : props.type}
          className={`porta-campo-entrada${senha ? " pr-10" : ""} ${className}`}
        />
        {/*
          O OLHO. Senha digitada errada às cegas é a causa mais comum de "não
          consigo entrar" — e no chão de fábrica, com teclado sujo e pressa,
          ver o que se escreveu poupa um telefonema.
        */}
        {senha && (
          <button
            type="button"
            onClick={() => setAberta((v) => !v)}
            title={aberta ? "Esconder a senha" : "Mostrar a senha"}
            aria-label={aberta ? "Esconder a senha" : "Mostrar a senha"}
            className="absolute right-2.5 bottom-2 grid size-8 place-items-center rounded-md text-tinta-apagada transition-colors hover:text-ambar"
          >
            <Icone referencia={aberta ? "icones.svg#eye-off" : "icones.svg#eye"} className="size-4" />
          </button>
        )}
      </div>
      {(dica || acessorio) && (
        <div className="flex items-baseline justify-between gap-3">
          {dica ? <span className="text-[11.5px] text-tinta-apagada">{dica}</span> : <span />}
          {acessorio}
        </div>
      )}
    </div>
  );
}

/**
 * O CABEÇALHO DA FOLHA: o título e uma linha dizendo o que se faz ali. `children` é o que
 * vem embaixo — a trilha dos passos, no cadastro.
 */
export function Cabecalho({
  titulo,
  subtitulo,
  children,
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="entrada-degrau flex flex-col gap-5">
      <div>
        <h2 className="m-0 font-titulo text-[32px] leading-[1.05]  text-tinta">
          {titulo}
        </h2>
        {subtitulo && (
          <p className="mt-1.5 mb-0 text-[13.5px] leading-relaxed text-tinta-fraca">{subtitulo}</p>
        )}
      </div>
      {children}
    </header>
  );
}

/**
 * O BOTÃO PRINCIPAL da folha, com o canto CORTADO — o do molde — e o giro de
 * "esperando" embutido. A seta anda para a frente quando o mouse passa.
 *
 * `botao-entrar`, e NÃO `btn primary`: aquela classe vive em
 * `:where(.producao)`, e estas telas não estão dentro da produção — o botão
 * ficava sem estilo nenhum. Ver `estilo/entrada.css`.
 */
export function BotaoPrincipal({
  icone,
  esperando = false,
  children,
  className = "",
  ...props
}: {
  icone: string;
  esperando?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="submit"
      {...props}
      className={`entrada-degrau botao-entrar w-full justify-between! pr-2 pl-5 text-[15px] ${className}`}
    >
      <span>{children}</span>
      {/* A seta mora numa pastilha escura, que anda quando o mouse passa. */}
      <span className="botao-entrar-pastilha">
        <Icone
          referencia={esperando ? "icones.svg#loader-circle" : icone}
          className={`botao-entrar-seta size-[17px]${esperando ? " gira" : ""}`}
        />
      </span>
    </button>
  );
}

/**
 * O CANHOTO: a pergunta à esquerda e o caminho para a outra tela à direita.
 * É o mesmo desenho no login ("Ainda não tem conta?"), no cadastro e na senha
 * ("Já tem conta?"), para ir e voltar serem o mesmo gesto dos dois lados.
 */
export function Alternativa({
  pergunta,
  icone,
  children,
  onClick,
}: {
  pergunta: string;
  icone: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <span className="text-[13px] text-tinta-apagada">{pergunta}</span>
      <button
        type="button"
        onClick={onClick}
        className="group/alt flex items-center gap-2 border-0 bg-transparent p-0 text-[13.5px] text-ambar transition-colors hover:text-[var(--accent-bright)]"
      >
        <Icone referencia={icone} className="size-4" />
        <span className="bg-[linear-gradient(currentColor,currentColor)] bg-[length:0%_1px] bg-left-bottom bg-no-repeat pb-px transition-[background-size] duration-300 group-hover/alt:bg-[length:100%_1px]">
          {children}
        </span>
      </button>
    </div>
  );
}
