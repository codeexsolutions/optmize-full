/**
 * ===========================================================================
 * SOBRE E SUPORTE — que programa é este, e como falar com a gente
 * ===========================================================================
 *
 * O desenho é o da Ajuda do CodeEx Flow (`features/ajuda/pages/AjudaPage.tsx`,
 * no outro repositório): a marca grande num cartão, os canais de contato ao
 * lado, a instalação logo abaixo e as perguntas de sempre, que abrem uma por
 * vez. É aberto pelo item "Sobre e suporte", embaixo na barra lateral.
 *
 * A versão sai do `package.json` na compilação (ver `vite.config.mts`): é a
 * primeira coisa que o suporte pergunta.
 */

import { useState } from "react";

import { Icone } from "../casca/Icone";

/** O WhatsApp comercial, o mesmo do site. */
const WHATSAPP = "(85) 99298-9066";
const LINK_DO_WHATSAPP = `https://wa.me/5585992989066?text=${encodeURIComponent("Olá! Preciso de ajuda com o CodeEx Optmize.")}`;

const PERGUNTAS: { titulo: string; resumo: string; resposta: string }[] = [
  {
    titulo: "Como a quantidade de cada arte entra no encaixe?",
    resumo: "Pelo nome do arquivo",
    resposta:
      "Escreva a quantidade no nome do arquivo, como frente 5x.png. O Encaixe lê o número e coloca as cinco cópias sozinho. A medida vem do próprio arquivo.",
  },
  {
    titulo: "Quais arquivos o Optmize abre?",
    resumo: "DXF, PLT, SVG, PDF, PNG e JPG",
    resposta:
      "Moldes em DXF, PLT, SVG ou PDF vetorial, e artes em PNG ou JPG. O encaixe sai em PDF, com a arte intocada: vetor continua vetor e a cor não muda.",
  },
  {
    titulo: "Como crio o acesso de um funcionário?",
    resumo: "Em Configurações, na aba Equipe",
    resposta:
      "Só o dono da empresa vê a aba Equipe, em Configurações (a engrenagem no pé da barra). Lá se cria, desativa e exclui cada acesso.",
  },
];

export function Sobre() {
  const [aberta, setAberta] = useState<number | null>(null);

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="grid items-stretch gap-3 lg:grid-cols-[auto_1fr]">
        {/* A MARCA, grande, com o que o programa faz e o horário do suporte. */}
        <div className="flex items-center gap-5 rounded-2xl border border-linha bg-painel px-7 py-7">
          <img
            src={`${import.meta.env.BASE_URL}icone.png`}
            alt="CodeEx Optmize"
            className="size-[68px] shrink-0 rounded-2xl shadow-[0_10px_30px_-12px_var(--accent)]"
          />
          <div className="min-w-0">
            <p className="m-0 font-titulo text-[30px] leading-none text-tinta">
              CodeEx <span className="text-ambar">Optmize</span>
            </p>
            <p className="mt-2 mb-0 text-[12.5px] leading-relaxed text-tinta-fraca">
              Moldes e encaixe para confecção e gráfica
            </p>
            <p className="mt-0.5 mb-0 text-[11.5px] text-tinta-apagada">Segunda a sexta, 8h às 18h</p>
          </div>
        </div>

        {/* OS CANAIS: WhatsApp e Instagram. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <Canal
            href={LINK_DO_WHATSAPP}
            icone="icones.svg#message-circle"
            cor="sucesso"
            titulo="WhatsApp"
            texto={WHATSAPP}
          />
          <Canal
            href="https://instagram.com/codeexsolutions"
            icone="icones.svg#at-sign"
            cor="marca"
            titulo="Instagram"
            texto="@codeexsolutions"
          />
        </div>
      </div>

      {/* ESTA INSTALAÇÃO: o que o suporte pergunta antes de tudo. */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-2xl border border-linha bg-painel px-5 py-4 text-[13px]">
        <span className="flex items-center gap-2.5 text-tinta">
          <span className="grid size-9 place-items-center rounded-xl bg-[var(--accent-soft)] text-ambar">
            <Icone referencia="icones.svg#info" className="size-4" />
          </span>
          Esta instalação
        </span>
        <span className="text-tinta-apagada">
          Versão <span className="font-mono text-tinta">{__VERSAO__}</span>
        </span>
        <span className="text-tinta-apagada">O programa avisa quando há versão nova e pergunta antes de atualizar.</span>
      </div>

      {/* AS PERGUNTAS DE SEMPRE, uma aberta por vez. */}
      <div className="flex flex-col gap-2">
        {PERGUNTAS.map((p, i) => {
          const on = aberta === i;
          return (
            <div key={p.titulo} className="overflow-hidden rounded-2xl border border-linha bg-painel">
              <button
                type="button"
                aria-expanded={on}
                onClick={() => setAberta(on ? null : i)}
                className="flex w-full items-center gap-3 border-0 bg-transparent px-4 py-3.5 text-left transition-colors hover:bg-[var(--surface-hover)]"
              >
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl transition-colors ${on ? "bg-[var(--accent-soft)] text-ambar" : "bg-[var(--surface-hover)] text-tinta-fraca"}`}>
                  <Icone referencia="icones.svg#circle-help" className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] text-tinta">{p.titulo}</span>
                  <span className="block truncate text-[11.5px] text-tinta-apagada">{p.resumo}</span>
                </span>
                <Icone
                  referencia="icones.svg#chevron-down"
                  className={`size-4 shrink-0 text-tinta-apagada transition-transform duration-200 ${on ? "rotate-180" : ""}`}
                />
              </button>
              {on && (
                <p className="m-0 border-t border-linha px-4 py-4 text-[12.5px] leading-relaxed text-tinta-fraca">
                  {p.resposta}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <p className="m-0 text-[11px] text-tinta-apagada">© CodeEx Solutions. Todos os direitos reservados.</p>
    </div>
  );
}

function Canal({ href, icone, cor, titulo, texto }: { href: string; icone: string; cor: "sucesso" | "marca"; titulo: string; texto: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="flex items-center gap-3 rounded-2xl border border-linha bg-painel p-4 no-underline transition-transform hover:-translate-y-0.5 hover:border-[var(--accent-line)]"
    >
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-xl ${
          cor === "sucesso" ? "bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-certo" : "bg-[var(--accent-soft)] text-ambar"
        }`}
      >
        <Icone referencia={icone} className="size-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] text-tinta">{titulo}</span>
        <span className="block truncate text-[12.5px] text-ambar">{texto}</span>
      </span>
      <Icone referencia="icones.svg#external-link" className="ml-auto size-3.5 shrink-0 text-tinta-apagada" />
    </a>
  );
}
