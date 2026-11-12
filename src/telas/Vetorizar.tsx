/**
 * ===========================================================================
 * VETORA — a imagem vira vetor, com o motor e a rede próprios do Optmize
 * ===========================================================================
 *
 * A pessoa solta um PNG ou JPG (logo, estampa, arte de cliente) e recebe TRÊS
 * vetores para escolher, feitos ao mesmo tempo:
 *
 *   Fiel         o mais parecido com a imagem
 *   Equilibrado  fiel e leve — e no gosto de quem usa (`vetora/gosto.ts`)
 *   Limpo        o de menos nós, com as curvas mais lisas
 *
 * Quem escolhe os ajustes de cada um é a REDE DA VETORA
 * (`motores/vetorizador/rede/`): uma rede neural treinada em milhares de
 * logos com a verdade conhecida (`bancada/vetora/`), que olha a imagem e
 * prevê o resultado de cada ajuste do vetorizador — inclusive se vale a pena
 * passar a imagem pela IA de ampliação antes (Real-ESRGAN, a mesma do
 * Extrator, rodando no servidor local). Quem vetoriza é o motor próprio
 * (`motores/vetorizador`), em workers: a tela não trava.
 *
 * O visor (`vetora/Visor.tsx`) compara o original com o vetor com zoom até 64
 * vezes, e mostra os nós. Os ajustes da coluna mexem no modelo escolhido; o
 * que a pessoa leva embora (SVG, PDF ou cópia) ensina o gosto.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Botao } from "../casca/Botao";
import { Cartao } from "../casca/Cartao";
import { Icone } from "../casca/Icone";
import { extratorApi } from "../api/extrator";
import { LADO_COM_IA } from "../motores/vetorizador/rede/escolher";
import { CHAVES, lerPixels, useTrabalhadores, type Ajuste, type Analise, type Chave, type Resultado } from "./vetora/trabalho";
import { Visor } from "./vetora/Visor";
import { Modelos } from "./vetora/Modelos";
import { AnimacaoVetora, ESTILO_DA_VITRINE } from "./vetora/vitrine";
import { lerLambda, registrarEscolha } from "./vetora/gosto";

interface Imagem { id: number; nome: string; largura: number; altura: number; px: Uint8ClampedArray<ArrayBuffer>; url: string }
interface Ampliada { px: Uint8ClampedArray<ArrayBuffer>; largura: number; altura: number; fator: number }
interface Versao { nome: string; ajuste: Ajuste; ajustado: boolean; resultado: Resultado | null; assinatura: string | null }

/** O maior lado vetorizado direto (acima disso a imagem é reduzida: o vetor não ganha nada). */
const LADO_MAXIMO = 2400;
/** O maior lado depois da ampliação. */
const LADO_AMPLIADO = 2048;

const FASES: Record<string, string> = {
  cores: "Achando as cores",
  "regiões": "Separando as regiões",
  divisas: "Traçando as divisas",
  curvas: "Ajustando as curvas",
  montagem: "Montando o vetor",
  pronto: "Pronto",
};

function baixar(blob: Blob, arquivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = arquivo;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

let proximoId = 1;

export function Vetorizar() {
  const entrada = useRef<HTMLInputElement>(null);
  const [imagem, setImagem] = useState<Imagem | null>(null);
  const [original, setOriginal] = useState<HTMLImageElement | null>(null);
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [versoes, setVersoes] = useState<Record<Chave, Versao> | null>(null);
  const [fracoes, setFracoes] = useState<Partial<Record<Chave, number | null>>>({});
  const [faseDaEscolhida, setFaseDaEscolhida] = useState<string | null>(null);
  const [selecionada, setSelecionada] = useState<Chave>("equilibrado");
  const [opcoes, setOpcoes] = useState({ automatico: true, cores: 6, semFundo: false, costura: true });
  const [divisao, setDivisao] = useState(0.5);
  const [mostrarNos, setMostrarNos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [motivoSemIa, setMotivoSemIa] = useState<string | null>("Conferindo a rede de ampliação…");
  const [iaConhecida, setIaConhecida] = useState(false);
  const [arquivoEmCima, setArquivoEmCima] = useState(false);
  const [larguraCm, setLarguraCm] = useState(20);
  const trabalhadores = useTrabalhadores();
  /** A ampliação da imagem atual: uma só, guardada, que os modelos com IA esperam juntos. */
  const ampliacao = useRef<{ imagem: Imagem; promessa: Promise<Ampliada>; sinal: AbortController } | null>(null);
  /** O pedido em andamento de cada modelo (a assinatura dele): o resultado velho é descartado. */
  const emAndamento = useRef(new Map<Chave, string>());
  /**
   * O que cada modelo já terminou, anotado NA HORA em que termina. O efeito
   * que dispara os pedidos roda depois da pintura, às vezes com o estado de
   * antes do resultado chegar — sem esta anotação ele via o modelo "sem
   * resultado e sem pedido" e vetorizava tudo de novo (medido: o segundo
   * vetor de cada modelo, 1,5 s a mais).
   */
  const concluidos = useRef(new Map<Chave, string>());
  const versoesAgora = useRef(versoes);
  versoesAgora.current = versoes;
  const selecionadaAgora = useRef(selecionada);
  selecionadaAgora.current = selecionada;
  useEffect(() => () => ampliacao.current?.sinal.abort(), []);

  // A rede de ampliar está instalada? (o mesmo estado do Extrator)
  useEffect(() => {
    extratorApi.estado()
      .then((e) => setMotivoSemIa(e.ampliar))
      .catch(() => setMotivoSemIa("O servidor do programa não respondeu."))
      .finally(() => setIaConhecida(true));
  }, []);

  const limpar = useCallback(() => {
    ampliacao.current?.sinal.abort();
    ampliacao.current = null;
    emAndamento.current.clear();
    concluidos.current.clear();
    trabalhadores.pararTudo();
    setAnalise(null);
    setVersoes(null);
    setFracoes({});
    setFaseDaEscolhida(null);
    setErro(null);
  }, [trabalhadores]);

  const abrir = useCallback(async (arquivo: File) => {
    try {
      const { px, largura, altura } = await lerPixels(arquivo, LADO_MAXIMO);
      limpar();
      const url = URL.createObjectURL(arquivo);
      const img = new Image();
      img.src = url;
      await img.decode().catch(() => {});
      setOriginal(img);
      setImagem((antes) => {
        if (antes) URL.revokeObjectURL(antes.url);
        return { id: proximoId++, nome: arquivo.name.replace(/\.[^.]+$/, ""), largura, altura, px, url };
      });
      setSelecionada("equilibrado");
      setDivisao(0.5);
      // A largura do PDF: a imagem a 300 pontos por polegada (a do arquivo de
      // impressão), e no mínimo 10 cm.
      setLarguraCm(Math.max(10, Math.round(((largura / 300) * 2.54) * 10) / 10));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui abrir a imagem.");
    }
  }, [limpar]);

  /** Tira a imagem: para tudo no meio, solta o arquivo e volta à vitrine. */
  function remover() {
    limpar();
    setOriginal(null);
    setImagem((antes) => { if (antes) URL.revokeObjectURL(antes.url); return null; });
  }

  /**
   * A imagem ampliada pela IA — uma vez por imagem, esperada por todos os
   * modelos que a usam; só a imagem nova a cancela.
   */
  const garantirAmpliada = useCallback((img: Imagem): Promise<Ampliada> => {
    const atual = ampliacao.current;
    if (atual && atual.imagem === img) return atual.promessa;
    atual?.sinal.abort();
    const sinal = new AbortController();
    const fator = Math.max(2, Math.min(4, Math.floor(LADO_AMPLIADO / Math.max(img.largura, img.altura))));
    const promessa = (async () => {
      const png = await extratorApi.ampliar(
        { rgba: img.px, largura: img.largura, altura: img.altura },
        { largura: img.largura * fator, altura: img.altura * fator },
        (feitos, total) => {
          const versoesComIa = CHAVES.filter((c) => versoesAgora.current?.[c]?.ajuste.ia);
          setFracoes((f) => ({ ...f, ...Object.fromEntries(versoesComIa.map((c) => [c, total ? (0.6 * feitos) / total : 0])) }));
          if (versoesAgora.current?.[selecionadaAgora.current]?.ajuste.ia) setFaseDaEscolhida(`Limpando e ampliando com IA (${feitos} de ${total})`);
        },
        sinal.signal,
      );
      const lida = await lerPixels(png, LADO_AMPLIADO * 2);
      return { ...lida, fator: lida.largura / img.largura };
    })();
    ampliacao.current = { imagem: img, promessa, sinal };
    promessa.catch(() => { if (ampliacao.current?.promessa === promessa) ampliacao.current = null; });
    return promessa;
  }, []);

  // 1. A rede olha a imagem e escolhe os três modelos.
  useEffect(() => {
    if (!imagem || !iaConhecida) return;
    let vivo = true;
    const lado = Math.max(imagem.largura, imagem.altura);
    trabalhadores.analisar(imagem.px, imagem.largura, imagem.altura, { comIa: !motivoSemIa && lado <= LADO_COM_IA, lambda: lerLambda() })
      .then((a) => {
        if (!vivo) return;
        setAnalise(a);
        setVersoes(Object.fromEntries(a.modelos.map((m) => [m.chave, { nome: m.nome, ajuste: m.ajuste, ajustado: false, resultado: null, assinatura: null }])) as Record<Chave, Versao>);
      })
      .catch((e) => { if (vivo && (e as Error).name !== "AbortError") setErro(e instanceof Error ? e.message : "A análise da imagem falhou."); });
    return () => { vivo = false; };
  }, [imagem, iaConhecida]); // eslint-disable-line react-hooks/exhaustive-deps

  const assinaturaDe = useCallback((img: Imagem, a: Ajuste) =>
    `${img.id}|${a.d}|${a.s}|${a.ia}|${opcoes.automatico ? "a" : opcoes.cores}|${opcoes.semFundo ? 1 : 0}|${opcoes.costura ? 1 : 0}`, [opcoes]);

  const vetorizarModelo = useCallback(async (chave: Chave, img: Imagem, ajuste: Ajuste, assinatura: string) => {
    emAndamento.current.set(chave, assinatura);
    const valendo = () => emAndamento.current.get(chave) === assinatura;
    try {
      let fonte: Ampliada | null = null;
      if (ajuste.ia) {
        try {
          fonte = await garantirAmpliada(img);
        } catch (e) {
          if (!valendo() || (e as Error).name === "AbortError") return;
          // A IA falhou (servidor fora, rede ausente): o modelo segue sem ela.
          console.warn("Vetora: a IA não ampliou; o modelo segue sem ela.", e);
          emAndamento.current.delete(chave);
          setVersoes((vs) => (vs ? { ...vs, [chave]: { ...vs[chave], ajuste: { ...vs[chave].ajuste, ia: 0 } } } : vs));
          return;
        }
      }
      if (!valendo()) return;
      const base = fonte ? 0.6 : 0;
      const r = await trabalhadores.vetorizar(chave, fonte ? fonte.px : img.px, fonte ? fonte.largura : img.largura, fonte ? fonte.altura : img.altura, {
        cores: opcoes.automatico ? undefined : opcoes.cores,
        detalhe: ajuste.d,
        suavidade: ajuste.s,
        semFundo: opcoes.semFundo,
        costura: opcoes.costura,
        escala: fonte ? 1 / fonte.fator : 1,
      }, (fase, fracao) => {
        if (!valendo()) return;
        setFracoes((f) => ({ ...f, [chave]: base + (1 - base) * fracao }));
        if (chave === selecionadaAgora.current) setFaseDaEscolhida(FASES[fase] || fase);
      });
      if (!valendo()) return;
      concluidos.current.set(chave, assinatura);
      emAndamento.current.delete(chave);
      setVersoes((vs) => (vs ? { ...vs, [chave]: { ...vs[chave], resultado: r, assinatura } } : vs));
      setFracoes((f) => ({ ...f, [chave]: null }));
    } catch (e) {
      if (!valendo() || (e as Error).name === "AbortError") return;
      emAndamento.current.delete(chave);
      setFracoes((f) => ({ ...f, [chave]: null }));
      setErro(e instanceof Error ? e.message : "O vetorizador parou no meio.");
    }
  }, [garantirAmpliada, opcoes, trabalhadores]);

  // 2. Cada modelo cujo ajuste (ou as opções) mudou vetoriza de novo — os
  //    três ao mesmo tempo, cada um no seu worker. A pequena espera segura o
  //    arrastar dos controles.
  useEffect(() => {
    if (!imagem || !versoes) return;
    const pendentes = CHAVES.filter((c) => {
      const v = versoes[c];
      const s = assinaturaDe(imagem, v.ajuste);
      return v.assinatura !== s && emAndamento.current.get(c) !== s && concluidos.current.get(c) !== s;
    });
    if (!pendentes.length) return;
    const primeiraVez = pendentes.every((c) => !versoes[c].resultado);
    const espera = setTimeout(() => {
      for (const c of pendentes) void vetorizarModelo(c, imagem, versoes[c].ajuste, assinaturaDe(imagem, versoes[c].ajuste));
    }, primeiraVez ? 0 : 220);
    return () => clearTimeout(espera);
  }, [imagem, versoes, assinaturaDe, vetorizarModelo]);

  // Os endereços dos SVGs (miniaturas), um por resultado, soltos quando trocam.
  const urls = useRef(new Map<Chave, { svg: string; url: string }>());
  const svgUrlDe = (c: Chave) => {
    const r = versoes?.[c]?.resultado;
    const guardado = urls.current.get(c);
    if (!r) { if (guardado) { URL.revokeObjectURL(guardado.url); urls.current.delete(c); } return null; }
    if (guardado && guardado.svg === r.svg) return guardado.url;
    if (guardado) URL.revokeObjectURL(guardado.url);
    const url = URL.createObjectURL(new Blob([r.svg], { type: "image/svg+xml" }));
    urls.current.set(c, { svg: r.svg, url });
    return url;
  };
  useEffect(() => () => { for (const g of urls.current.values()) URL.revokeObjectURL(g.url); }, []);

  const escolhida = versoes ? versoes[selecionada] : null;
  const resultado = escolhida?.resultado ?? null;
  const areaTotal = useMemo(() => (resultado ? resultado.paleta.reduce((t, c) => t + c.area, 0) : 0), [resultado]);
  const vetorDoVisor = useMemo(() => (resultado ? { formas: resultado.formas, costura: resultado.costura, larguraTraco: resultado.larguraTraco } : null), [resultado]);

  const mudarAjuste = (campo: "d" | "s", valor: number) => setVersoes((vs) => (vs ? {
    ...vs, [selecionada]: { ...vs[selecionada], ajuste: { ...vs[selecionada].ajuste, [campo]: valor }, ajustado: true },
  } : vs));
  const mudar = <K extends keyof typeof opcoes>(chave: K, valor: (typeof opcoes)[K]) => setOpcoes((o) => ({ ...o, [chave]: valor }));

  /** A pessoa levou um vetor: o gosto aprende (ver `vetora/gosto.ts`). */
  const levou = (como: "svg" | "pdf" | "copia") => {
    if (!analise || !versoes || !escolhida) return;
    registrarEscolha({
      quando: new Date().toISOString(),
      rede: analise.versaoDaRede,
      carac: analise.carac,
      modelos: CHAVES.map((c) => ({ chave: c, ajuste: versoes[c].ajuste, nos: versoes[c].resultado?.estatisticas.nos ?? null, cores: versoes[c].resultado?.estatisticas.cores ?? null })),
      escolhida: selecionada,
      ajusteFinal: escolhida.ajuste,
      mexeu: escolhida.ajustado,
      como,
    }, analise.lambda);
  };

  async function baixarPdf() {
    if (!resultado || !imagem) return;
    try {
      // Sob demanda: o pdf-lib só carrega quando a pessoa pede o PDF.
      const { pdfDoVetor } = await import("../motores/vetorizador/pdf");
      const bytes = await pdfDoVetor({
        formas: resultado.formas, largura: resultado.estatisticas.largura, altura: resultado.estatisticas.altura,
      }, larguraCm);
      baixar(new Blob([bytes as BlobPart], { type: "application/pdf" }), `${imagem.nome}-vetor.pdf`);
      levou("pdf");
    } catch (e) {
      setErro(e instanceof Error ? `Não consegui montar o PDF: ${e.message}` : "Não consegui montar o PDF.");
    }
  }

  const sufixo = selecionada === "equilibrado" ? "" : `-${selecionada}`;

  return (
    <div
      className="grid min-h-0 flex-1 gap-3.5 overflow-y-auto p-3 lg:p-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:grid-rows-[minmax(0,1fr)] xl:overflow-hidden"
      onDragOver={(e) => { e.preventDefault(); setArquivoEmCima(true); }}
      onDragLeave={() => setArquivoEmCima(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArquivoEmCima(false);
        const f = e.dataTransfer?.files?.[0];
        if (f) void abrir(f);
      }}
    >
      <style>{ESTILO_DA_VITRINE}</style>
      <div className="flex min-h-0 min-w-0 flex-col">
        <Cartao
          titulo={imagem ? imagem.nome : "Nova vetorização"}
          icone="icones.svg#pen-tool"
          apoio={imagem ? `${imagem.largura} × ${imagem.altura} px` : undefined}
          preencher
          acao={imagem ? (
            <div className="flex gap-2">
              <Botao jeito="secundario" icone={<Icone referencia="icones.svg#image-plus" className="size-4" />} onClick={() => entrada.current?.click()}>
                Outra imagem
              </Botao>
              <Botao jeito="perigo" icone={<Icone referencia="icones.svg#trash-2" className="size-4" />} onClick={remover}>
                Remover
              </Botao>
            </div>
          ) : (
            <Botao jeito="secundario" icone={<Icone referencia="icones.svg#image-plus" className="size-4" />} onClick={() => entrada.current?.click()}>
              Escolher imagem
            </Botao>
          )}
        >
          <input
            ref={entrada}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.bmp,.gif,image/png,image/jpeg,image/webp,image/bmp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void abrir(f);
              e.target.value = "";
            }}
          />
          <div className="flex h-full min-h-[320px] flex-col">
            {erro && (
              <p className="mt-0 mb-3 flex items-start gap-2 text-[0.85rem] text-[var(--danger)]">
                <Icone referencia="icones.svg#triangle-alert" className="mt-0.5 size-4 shrink-0" />
                <span>{erro}</span>
              </p>
            )}
            {!imagem ? (
              <button
                type="button"
                onClick={() => entrada.current?.click()}
                className={`vetora-vitrine group relative grid flex-1 w-full cursor-pointer place-items-center overflow-hidden rounded-xl border-2 border-dashed transition-colors ${arquivoEmCima ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-linha hover:border-[var(--accent-line)]"}`}
              >
                <span className="relative flex flex-col items-center px-6 text-center">
                  <AnimacaoVetora />
                  <span className="mt-5 font-titulo text-[2.4rem] leading-none tracking-[-0.02em] text-tinta">
                    Vetor<span className="text-ambar">a</span>
                  </span>
                  <span className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-[0.9rem] text-white shadow-lg shadow-black/30 transition-transform group-hover:-translate-y-0.5">
                    <Icone referencia="icones.svg#image-plus" className="size-4" />
                    {arquivoEmCima ? "Pode soltar" : "Escolher imagem"}
                  </span>
                </span>
              </button>
            ) : (
              <>
                <Visor
                  original={original}
                  largura={imagem.largura}
                  altura={imagem.altura}
                  vetor={vetorDoVisor}
                  divisao={divisao}
                  aoDividir={setDivisao}
                  mostrarNos={mostrarNos}
                  aoMostrarNos={setMostrarNos}
                  progresso={fracoes[selecionada] ?? null}
                  espera={(
                    <div className="flex w-64 flex-col items-center text-center text-white">
                      <AnimacaoVetora />
                      <span className="mt-2 text-[0.9rem]">{versoes ? (faseDaEscolhida || "Preparando") : "A rede está olhando a imagem"}…</span>
                      <div className="mt-2 h-1 w-full overflow-hidden rounded bg-white/20">
                        <div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${Math.round((fracoes[selecionada] ?? 0) * 100)}%` }} />
                      </div>
                      {/* Outro modelo já pronto (o da IA demora mais): dá para olhar ele enquanto isso. */}
                      {versoes && (() => {
                        const pronto = CHAVES.find((c) => c !== selecionada && versoes[c].resultado);
                        return pronto ? (
                          <button type="button" onClick={() => setSelecionada(pronto)}
                            className="mt-4 rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-[0.82rem] text-white hover:bg-white/20">
                            Ver o {versoes[pronto].nome} enquanto isso
                          </button>
                        ) : null;
                      })()}
                    </div>
                  )}
                />
                {versoes && (
                  <Modelos
                    selecionada={selecionada}
                    aoEscolher={(c) => { setSelecionada(c); setFaseDaEscolhida(null); }}
                    itens={CHAVES.map((c) => ({
                      chave: c,
                      nome: versoes[c].nome,
                      ia: !!versoes[c].ajuste.ia,
                      ajustado: versoes[c].ajustado,
                      resultado: versoes[c].resultado,
                      svgUrl: svgUrlDe(c),
                      fracao: fracoes[c] ?? null,
                    }))}
                  />
                )}
              </>
            )}
          </div>
        </Cartao>
      </div>

      <div className="flex min-h-0 min-w-0 flex-col gap-3.5 xl:overflow-y-auto">
        <Cartao titulo="Ajustes" icone="icones.svg#settings" apoio={escolhida ? `Do modelo ${escolhida.nome}` : undefined}>
          {/*
            Compacto, para a coluna caber na janela de notebook sem rolar: a
            explicação de cada controle mora na dica (`title`), não embaixo.
          */}
          <div className="flex flex-col gap-3 text-[0.85rem]">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-tinta">Cores</span>
                <span className="flex overflow-hidden rounded-lg border border-linha text-[12px]">
                  <button type="button" onClick={() => mudar("automatico", true)} className={`px-2.5 py-1 ${opcoes.automatico ? "bg-[var(--accent-soft)] text-ambar" : "text-tinta-fraca"}`}>Automático</button>
                  <button type="button" onClick={() => mudar("automatico", false)} className={`px-2.5 py-1 ${!opcoes.automatico ? "bg-[var(--accent-soft)] text-ambar" : "text-tinta-fraca"}`}>Escolher</button>
                </span>
              </div>
              {!opcoes.automatico && (
                <label className="mt-1.5 flex items-center gap-3">
                  <input type="range" min={1} max={32} value={opcoes.cores} onChange={(e) => mudar("cores", Number(e.target.value))} className="flex-1 accent-[var(--accent)]" />
                  <span className="w-6 text-right font-mono text-tinta">{opcoes.cores}</span>
                </label>
              )}
            </div>
            <label className={`block ${escolhida ? "" : "opacity-50"}`} title="Mais detalhe: mais cores no automático, ciscos menores ficam, curva mais justa.">
              <span className="flex justify-between"><span className="text-tinta">Detalhe</span><span className="font-mono text-tinta-fraca">{escolhida ? escolhida.ajuste.d : "—"}</span></span>
              <input type="range" min={0} max={100} disabled={!escolhida} value={escolhida ? escolhida.ajuste.d : 50} onChange={(e) => mudarAjuste("d", Number(e.target.value))} className="w-full accent-[var(--accent)]" />
            </label>
            <label className={`block ${escolhida ? "" : "opacity-50"}`} title="Mais suave: curvas mais lisas e só canto bem vivo vira quina.">
              <span className="flex justify-between"><span className="text-tinta">Suavidade</span><span className="font-mono text-tinta-fraca">{escolhida ? escolhida.ajuste.s : "—"}</span></span>
              <input type="range" min={0} max={100} disabled={!escolhida} value={escolhida ? escolhida.ajuste.s : 50} onChange={(e) => mudarAjuste("s", Number(e.target.value))} className="w-full accent-[var(--accent)]" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2" title="A cor lisa que encosta na borda da imagem vira transparente.">
                <input type="checkbox" checked={opcoes.semFundo} onChange={(e) => mudar("semFundo", e.target.checked)} className="accent-[var(--accent)]" />
                <span className="text-tinta">Tirar o fundo</span>
              </label>
              <label className="flex items-center gap-2" title="Um traço fino por baixo das divisas esconde o fio claro entre duas cores na tela. Desligue para corte em plotter.">
                <input type="checkbox" checked={opcoes.costura} onChange={(e) => mudar("costura", e.target.checked)} className="accent-[var(--accent)]" />
                <span className="text-tinta">Sem frestas</span>
              </label>
            </div>
          </div>
        </Cartao>

        {/* Só aparece com o vetor do modelo escolhido feito. */}
        {resultado && (
          <Cartao titulo={`O vetor · ${escolhida!.nome}`} icone="icones.svg#spline">
            <div className="flex flex-col gap-3.5 text-[0.85rem]">
              <div className="flex flex-wrap gap-1">
                {resultado.paleta.map((c) => (
                  <span key={c.hex} className="size-5 rounded-[5px] border border-white/10 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)]" style={{ background: c.hex }}
                    title={`${c.hex} · ${((c.area / Math.max(1, areaTotal)) * 100).toFixed(1)}% do desenho`} />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  ["Cores", String(resultado.estatisticas.cores)],
                  ["Formas", resultado.estatisticas.formas.toLocaleString("pt-BR")],
                  ["Nós", resultado.estatisticas.nos.toLocaleString("pt-BR")],
                ].map(([rotulo, valor]) => (
                  <div key={rotulo} className="rounded-lg border border-linha bg-painel-suave px-2 py-1.5">
                    <div className="text-[11px] text-tinta-apagada">{rotulo}</div>
                    <div className="font-mono text-[13px] text-tinta">{valor}</div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <Botao jeito="primario" icone={<Icone referencia="icones.svg#download" className="size-4" />}
                  onClick={() => { if (!imagem) return; baixar(new Blob([resultado.svg], { type: "image/svg+xml" }), `${imagem.nome}-vetor${sufixo}.svg`); levou("svg"); }}>
                  Baixar SVG
                </Botao>
                <div className="grid grid-cols-2 gap-2">
                  <Botao jeito="secundario" icone={<Icone referencia="icones.svg#file-down" className="size-4" />} onClick={() => void baixarPdf()}>
                    PDF
                  </Botao>
                  <Botao jeito="secundario" icone={<Icone referencia="icones.svg#file-text" className="size-4" />}
                    onClick={() => { void navigator.clipboard.writeText(resultado.svg); levou("copia"); }}>
                    Copiar SVG
                  </Botao>
                </div>
              </div>
            </div>
          </Cartao>
        )}
      </div>
    </div>
  );
}
