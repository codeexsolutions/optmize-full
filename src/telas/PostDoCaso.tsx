/**
 * ===========================================================================
 * O POST DO CASO — a prova de valor da porta, no formato de um post
 * ===========================================================================
 *
 * Pedido do dono (2026-10-27): a prova tinha cara de painel, e quem chega
 * achando o plano caro não lê painel. Lê post. Então é um post: a marca no
 * alto, um carrossel com um trabalho por quadro, a linha de ações e a legenda.
 *
 * OS NÚMEROS SÃO DE VERDADE. Cada quadro é um trabalho da produção encaixado
 * no Optmize e guardado no programa — as mesmas peças, o mesmo rolo, o mesmo
 * espaço. "Pelo quadrado" é o que o mesmo trabalho gasta com cada peça na
 * caixa dela: a régua `metragemPelaCaixa`, a mesma que a tela do Encaixe
 * mostra. Saem de `node bancada/medir-valor.js`; mudou o caso, roda de novo e
 * copia para `CASOS`.
 *
 * São os quatro maiores trabalhos distintos, e não os quatro melhores por
 * cento: o de 18 peças economiza pouco, e fica para ninguém achar que a lista
 * foi escolhida a dedo.
 *
 * O metro de tecido sublimado vai de R$ 15 a R$ 20; a média, R$ 17,50, é o que
 * dá o dinheiro. O plano é o de entrada (o Mensal Encaixe).
 */

import { useEffect, useState } from "react";

import { Icone } from "../casca/Icone";

/*
 * A ORDEM É A DA DIFERENÇA, da maior para a menor (pedido do dono: "deixe a
 * diferença mais evidente"). Os números não mudam — mudar a escala das barras
 * ou arredondar a favor seria maquiar a prova, e quem já acha caro é quem
 * desconfia primeiro.
 */
const CASOS = [
  { data: "27 out", pecas: 36, rolo: 178, quadradoM: 3.12, optmizeM: 2.29 },
  { data: "26 out", pecas: 81, rolo: 179, quadradoM: 9.8, optmizeM: 8.67 },
  { data: "27 out", pecas: 304, rolo: 158, quadradoM: 39.04, optmizeM: 36.63 },
  { data: "21 out", pecas: 18, rolo: 160, quadradoM: 6.96, optmizeM: 6.72 },
] as const;
const METRO_MEDIO = (15 + 20) / 2;
const PLANO = 199.9;
/** Quanto tempo cada quadro fica, se ninguém mexer. */
const QUADRO_MS = 6000;

const reais = (valor: number, casas = 0) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL",
    minimumFractionDigits: casas, maximumFractionDigits: casas });
const metros = (m: number) =>
  `${m.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;

export function PostDoCaso() {
  const [atual, setAtual] = useState(0);
  const [parado, setParado] = useState(false);

  // O carrossel anda sozinho; com o mouse em cima, espera quem está lendo.
  useEffect(() => {
    if (parado) return;
    const passo = window.setTimeout(() => setAtual((i) => (i + 1) % CASOS.length), QUADRO_MS);
    return () => window.clearTimeout(passo);
  }, [atual, parado]);

  const caso = CASOS[atual]!;
  const poupado = caso.quadradoM - caso.optmizeM;
  const porCento = Math.round((100 * poupado) / caso.quadradoM);
  const noBolso = poupado * METRO_MEDIO;
  /** Quanto da faixa do quadrado o Optmize ocupa. */
  const parte = (100 * caso.optmizeM) / caso.quadradoM;
  const pagam = Math.ceil(PLANO / noBolso);
  /*
   * A MESMA PORCENTAGEM EM 100 m DE PRODUÇÃO. Não é outro caso: é o medido,
   * levado para um volume em que a diferença se sente — e a legenda diz que é
   * "no mesmo ritmo", para ninguém ler como trabalho que aconteceu.
   */
  const em100M = (100 * poupado) / caso.quadradoM;
  const em100Reais = em100M * METRO_MEDIO;
  const ir = (passo: number) => setAtual((i) => (i + passo + CASOS.length) % CASOS.length);

  return (
    /*
      O POST EM 3D, VIRADO PARA O LADO: a perspectiva mora no embrulho, o giro
      no próprio post (`.post-3d`, em estilo/entrada.css). Com o mouse em cima
      ele se endireita, que é quando alguém está lendo.
    */
    <div className="post-palco w-full max-w-[420px]">
    <article
      className="post-do-caso post-3d w-full overflow-hidden rounded-[20px] border border-linha bg-[var(--card-bg)]"
      onMouseEnter={() => setParado(true)}
      onMouseLeave={() => setParado(false)}
    >
      {/* O alto do post: quem publicou e de quando é o caso. */}
      <header className="flex items-center gap-3 px-4 py-3">
        <span className="rounded-full bg-[conic-gradient(from_200deg,var(--accent),#ffb347,var(--accent))] p-[2px]">
          <img
            src={`${import.meta.env.BASE_URL}icone.png`}
            alt=""
            className="block size-8 rounded-full border-2 border-[var(--card-bg)] bg-[var(--card-bg)]"
          />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="flex items-center gap-1 text-[13px] text-tinta">
            codeex.optmize
            <Icone referencia="icones.svg#badge-check" className="size-3.5 text-ambar" />
          </span>
          <span className="block text-[11px] text-tinta-apagada">Caso real da produção · {caso.data}</span>
        </span>
        <Icone referencia="icones.svg#ellipsis" className="size-4 text-tinta-apagada" />
      </header>

      {/*
        O QUADRO. Um trabalho por vez: os dois números e as duas faixas de
        rolo, a de cima pelo quadrado e a de baixo pelo Optmize, na mesma
        escala. O pedaço que falta embaixo é o tecido que ficou no rolo.
      */}
      <div className="relative aspect-[16/10] overflow-hidden bg-[radial-gradient(90%_80%_at_80%_0%,var(--accent-soft)_0%,transparent_60%),linear-gradient(160deg,var(--sidebar-bg),var(--bg))]">
        <div key={atual} className="post-quadro absolute inset-0 flex flex-col justify-between p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="rounded-full bg-black/35 px-2.5 py-1 font-mono text-[10.5px] text-tinta-fraca">
              {caso.pecas} peças · rolo {caso.rolo} cm
            </span>
            <span className="rounded-full bg-ambar px-2.5 py-1 font-mono text-[11px] text-[var(--bg)]">
              −{porCento}%
            </span>
          </div>

          {/*
            OS DOIS NÚMEROS, GRANDES E LADO A LADO: o do quadrado em vermelho e
            riscado, o do Optmize em laranja. É o "antes e depois" do post.
          */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div>
              <span className="block text-[10.5px] tracking-wide text-[#ff7a7e] uppercase">Pelo quadrado</span>
              <span className="block font-titulo text-[28px] leading-none text-[#ff6b6f] line-through decoration-2">
                {metros(caso.quadradoM)}
              </span>
            </div>
            <Icone referencia="icones.svg#arrow-right" className="mb-1.5 size-5 text-tinta-apagada" />
            <div className="text-right">
              <span className="block text-[10.5px] tracking-wide text-ambar uppercase">Com o Optmize</span>
              <span className="block font-titulo text-[34px] leading-none text-ambar">
                {metros(caso.optmizeM)}
              </span>
            </div>
          </div>

          {/*
            AS DUAS FAIXAS, NA MESMA ESCALA. A do quadrado vai até o fim, e o
            pedaço dela que passa do Optmize é o desperdício, em vermelho, com a
            metragem escrita dentro. A do Optmize para antes. Assim o quadrado
            é SEMPRE a faixa maior, e a diferença se lê como comprimento.
          */}
          <div className="flex flex-col gap-1.5">
            <span className="relative flex h-5 overflow-hidden rounded-md">
              <span className="h-full bg-tinta-apagada/40" style={{ width: `${parte}%` }} />
              <span className="post-sobra relative grid h-full flex-1 place-items-center bg-[repeating-linear-gradient(135deg,#e5484d_0_6px,#b4232a_6px_11px)]">
                <span className="font-mono text-[10px] text-white drop-shadow">+{metros(poupado)}</span>
              </span>
            </span>
            <span className="relative flex h-5">
              <span className="post-barra h-full rounded-md bg-ambar" style={{ width: `${parte}%` }} />
            </span>
            <p className="m-0 mt-1 text-center text-[12.5px] text-tinta">
              <span className="font-titulo text-[16px] text-[#ff6b6f]">{metros(poupado)}</span>
              {" "}de tecido jogados fora pelo quadrado
            </p>
          </div>
        </div>

        <button
          type="button"
          aria-label="Caso anterior"
          onClick={() => ir(-1)}
          className="post-seta absolute top-1/2 left-2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-tinta"
        >
          <Icone referencia="icones.svg#chevron-left" className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Próximo caso"
          onClick={() => ir(1)}
          className="post-seta absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-tinta"
        >
          <Icone referencia="icones.svg#chevron-right" className="size-4" />
        </button>
      </div>

      {/* A linha de ações, com os pontinhos do carrossel no meio. */}
      <div className="relative flex items-center gap-3.5 px-4 pt-3 text-tinta">
        <Icone referencia="icones.svg#heart" className="size-[19px] fill-ambar text-ambar" />
        <Icone referencia="icones.svg#message-circle" className="size-[19px]" />
        <Icone referencia="icones.svg#send" className="size-[19px]" />
        <span className="absolute left-1/2 flex -translate-x-1/2 gap-1.5">
          {CASOS.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Caso ${i + 1}`}
              onClick={() => setAtual(i)}
              className={`size-1.5 rounded-full border-0 p-0 transition-colors ${i === atual ? "bg-ambar" : "bg-tinta-apagada/50"}`}
            />
          ))}
        </span>
        <Icone referencia="icones.svg#bookmark" className="ml-auto size-[19px]" />
      </div>

      <div className="px-4 pt-2 pb-4">
        <p className="m-0 text-[13px] text-tinta">
          {reais(noBolso)} no bolso nesta produção ·{" "}
          <span className="text-ambar">{reais(em100Reais)} a cada 100 m</span>
        </p>
        <p className="mt-1 mb-0 text-[12.5px] leading-relaxed text-tinta-fraca">
          <span className="text-tinta">codeex.optmize </span>
          Pelo quadrado iam {metros(caso.quadradoM)}; pelo contorno da arte, {metros(caso.optmizeM)}.
          {" "}No mesmo ritmo, a cada 100 m de produção são {Math.round(em100M)} m a menos.
          {/* Só quando a conta convence: "14 produções pagam o plano" afasta mais do que atrai. */}
          {pagam <= 6 && (pagam === 1
            ? " Uma produção assim já paga o plano do mês."
            : ` ${pagam} produções assim pagam o plano de ${reais(PLANO, 2)} do mês.`)}
          {" "}<span className="text-ambar/90">#casoreal #sublimação</span>
        </p>
        <p className="mt-1.5 mb-0 text-[10.5px] tracking-wide text-tinta-apagada uppercase">
          Caso {atual + 1} de {CASOS.length} · metro a R$ 17,50
        </p>
      </div>
    </article>
    </div>
  );
}
