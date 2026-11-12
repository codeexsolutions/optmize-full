/**
 * ===========================================================================
 * VETORIZAR — a imagem vira vetor, com o motor próprio do Optmize
 * ===========================================================================
 *
 * A pessoa solta um PNG ou JPG (logo, estampa, arte de cliente) e recebe o
 * vetor em SVG ou PDF. Quem vetoriza é `src/motores/vetorizador` (o motor
 * próprio: paleta perceptual, mapa planar, borda no subpixel, retas e curvas
 * de verdade), num Web Worker — a tela não trava enquanto ele trabalha.
 *
 * A IA ENTRA ANTES, na imagem pequena: ela passa pela rede de ampliação do
 * programa (Real-ESRGAN, a mesma do Extrator, rodando no servidor local),
 * que recupera a cor e a borda fina que o JPEG apagou; o vetor é feito na
 * imagem ampliada e sai no tamanho original. Medido na bancada
 * (`bancada/conferir-vetorizador.mjs`): no logo de 100 px com JPEG, a IA
 * leva o vetor de 91% a 98,5% de pixels certos (o selo) e de 96% a 99% (as
 * letras); na imagem de 200 px ela empata, e na BORRADA ela piora (a rede
 * inventa halo e faceta). Por isso ela liga sozinha só na imagem de até
 * 256 px que não é borrada (a borda medida pelo motor, `estatisticas.borda`),
 * e a pessoa pode ligar à mão até 512 px.
 *
 * A ampliação fica guardada para a mesma imagem: mexer nos ajustes depois
 * disso só vetoriza de novo — e mexer DURANTE a ampliação não a recomeça.
 *
 * Cada ajuste mexido vetoriza de novo sozinho (com uma pequena espera, para
 * o arrastar do controle não disparar vinte vezes).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Botao } from "../casca/Botao";
import { Cartao } from "../casca/Cartao";
import { Icone } from "../casca/Icone";
import { extratorApi } from "../api/extrator";

interface Forma { cor: string; d: string; area: number }
interface Resultado {
  svg: string;
  formas: Forma[];
  paleta: { hex: string; area: number }[];
  estatisticas: { cores: number; formas: number; nos: number; bytes: number; ms: number; largura: number; altura: number; tirouFundo: boolean; borda: number };
}
interface Imagem { nome: string; largura: number; altura: number; px: Uint8ClampedArray<ArrayBuffer>; url: string }
interface Ampliada { px: Uint8ClampedArray<ArrayBuffer>; largura: number; altura: number; fator: number }

/** O maior lado vetorizado direto (acima disso a imagem é reduzida: o vetor não ganha nada). */
const LADO_MAXIMO = 2400;
/** Até aqui a pessoa pode ligar a IA (acima, a imagem já tem detalhe de sobra). */
const LADO_PARA_AMPLIAR = 512;
/** Até aqui a IA liga sozinha, se a imagem não for borrada (é onde ela rende). */
const LADO_IA_SOZINHA = 256;
/** A borda acima disso é borrada (ver `larguraDaBorda`, no motor): a IA não ajuda. */
const BORDA_BORRADA = 1.6;
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

/** Os pixels de um arquivo de imagem, sem gerenciar cor, com o maior lado até `teto`. */
async function lerPixels(fonte: Blob, teto: number) {
  const bitmap = await createImageBitmap(fonte, { premultiplyAlpha: "none", colorSpaceConversion: "none", imageOrientation: "from-image" });
  try {
    const escala = Math.min(1, teto / Math.max(bitmap.width, bitmap.height));
    const largura = Math.max(1, Math.round(bitmap.width * escala));
    const altura = Math.max(1, Math.round(bitmap.height * escala));
    const tela = new OffscreenCanvas(largura, altura);
    const ctx = tela.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("O navegador não deu um canvas para ler a imagem.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    const dados = ctx.getImageData(0, 0, largura, altura);
    return { px: new Uint8ClampedArray(dados.data), largura, altura };
  } finally {
    bitmap.close();
  }
}

/** O worker do vetorizador, com o pedido mais novo valendo (os velhos são descartados). */
function useVetorizador() {
  const worker = useRef<Worker | null>(null);
  const ultimo = useRef(0);
  useEffect(() => () => { worker.current?.terminate(); }, []);
  return useCallback((px: Uint8ClampedArray, largura: number, altura: number, opcoes: Record<string, unknown>,
    aoAndar: (fase: string, fracao: number) => void) => new Promise<Resultado | null>((pronto, falhou) => {
    // Um pedido novo interrompe o anterior de verdade: o worker velho é
    // encerrado, em vez de terminar uma conta que ninguém vai usar.
    if (worker.current) worker.current.terminate();
    const w = new Worker(new URL("../motores/vetorizadorWorker.js", import.meta.url), { type: "module" });
    worker.current = w;
    const id = ++ultimo.current;
    w.onmessage = (e: MessageEvent) => {
      const msg = e.data as { id: number; tipo: string; fase?: string; fracao?: number; resultado?: Resultado; erro?: string };
      if (msg.id !== ultimo.current) return;
      if (msg.tipo === "andamento") aoAndar(msg.fase || "", msg.fracao || 0);
      else if (msg.tipo === "pronto") { pronto(msg.resultado || null); w.terminate(); if (worker.current === w) worker.current = null; }
      else if (msg.tipo === "falhou") { falhou(new Error(msg.erro || "O vetorizador parou no meio.")); w.terminate(); if (worker.current === w) worker.current = null; }
    };
    w.onerror = (e) => falhou(new Error(e.message || "O vetorizador quebrou."));
    const copia = new Uint8ClampedArray(px);
    w.postMessage({ id, px: copia.buffer, largura, altura, opcoes }, [copia.buffer]);
  }), []);
}

export function Vetorizar() {
  const entrada = useRef<HTMLInputElement>(null);
  const [imagem, setImagem] = useState<Imagem | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [svgUrl, setSvgUrl] = useState<string | null>(null);
  const [andamento, setAndamento] = useState<{ texto: string; fracao: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [avisoIa, setAvisoIa] = useState<string | null>(null);
  const [motivoSemIa, setMotivoSemIa] = useState<string | null>("Conferindo a rede de ampliação…");
  const [arquivoEmCima, setArquivoEmCima] = useState(false);
  const [divisao, setDivisao] = useState(50);
  const [larguraCm, setLarguraCm] = useState(20);
  const [opcoes, setOpcoes] = useState({
    automatico: true, cores: 6, detalhe: 50, suavidade: 50, semFundo: false, ia: false, costura: true,
  });
  const vetorizarNoWorker = useVetorizador();
  /** A ampliação da imagem atual: uma só, guardada, que os pedidos seguintes esperam. */
  const ampliacao = useRef<{ imagem: Imagem; promessa: Promise<Ampliada>; sinal: AbortController } | null>(null);
  /** A pessoa mexeu na IA nesta imagem? Então a escolha é dela, e a tela não liga sozinha. */
  const iaTocada = useRef(false);
  useEffect(() => () => ampliacao.current?.sinal.abort(), []);

  // A rede de ampliar está instalada? (o mesmo estado do Extrator)
  useEffect(() => {
    extratorApi.estado()
      .then((e) => setMotivoSemIa(e.ampliar))
      .catch(() => setMotivoSemIa("O servidor do programa não respondeu."));
  }, []);

  const abrir = useCallback(async (arquivo: File) => {
    setErro(null);
    try {
      const { px, largura, altura } = await lerPixels(arquivo, LADO_MAXIMO);
      setImagem((antes) => {
        if (antes) URL.revokeObjectURL(antes.url);
        return { nome: arquivo.name.replace(/\.[^.]+$/, ""), largura, altura, px, url: URL.createObjectURL(arquivo) };
      });
      ampliacao.current?.sinal.abort();
      ampliacao.current = null;
      iaTocada.current = false;
      setAvisoIa(null);
      setOpcoes((o) => (o.ia ? { ...o, ia: false } : o));
      setResultado(null);
      // A largura física inicial: a imagem a 300 pontos por polegada (a do
      // arquivo de impressão), e no mínimo 10 cm — o logo de 160 px daria
      // 1,4 cm, e o vetor não tem tamanho certo: a pessoa escolhe.
      setLarguraCm(Math.max(10, Math.round(((largura / 300) * 2.54) * 10) / 10));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui abrir a imagem.");
    }
  }, []);

  /**
   * A imagem ampliada pela IA — uma vez por imagem. O pedido que chega com a
   * ampliação em andamento espera a mesma (mexer num ajuste no meio não a
   * recomeça); só a imagem nova a cancela.
   */
  const garantirAmpliada = useCallback((img: Imagem): Promise<Ampliada> => {
    const atual = ampliacao.current;
    if (atual && atual.imagem === img) return atual.promessa;
    atual?.sinal.abort();
    const sinal = new AbortController();
    const fator = Math.max(2, Math.min(4, Math.floor(LADO_AMPLIADO / Math.max(img.largura, img.altura))));
    setAndamento({ texto: "Limpando e ampliando com IA", fracao: 0 });
    const promessa = (async () => {
      const png = await extratorApi.ampliar(
        { rgba: img.px, largura: img.largura, altura: img.altura },
        { largura: img.largura * fator, altura: img.altura * fator },
        (feitos, total) => setAndamento({ texto: `Limpando e ampliando com IA (${feitos} de ${total})`, fracao: total ? (0.6 * feitos) / total : 0 }),
        sinal.signal,
      );
      const lida = await lerPixels(png, LADO_AMPLIADO * 2);
      return { ...lida, fator: lida.largura / img.largura };
    })();
    ampliacao.current = { imagem: img, promessa, sinal };
    // A que falhou não fica guardada: a próxima tentativa amplia de novo.
    promessa.catch(() => { if (ampliacao.current?.promessa === promessa) ampliacao.current = null; });
    return promessa;
  }, []);

  // Vetoriza de novo quando a imagem ou um ajuste muda (com uma pequena espera).
  useEffect(() => {
    if (!imagem) return;
    let vivo = true;
    const espera = setTimeout(async () => {
      try {
        setErro(null);
        const lado = Math.max(imagem.largura, imagem.altura);
        const usarIa = opcoes.ia && !motivoSemIa && lado <= LADO_PARA_AMPLIAR;
        let fonte: Ampliada | null = null;
        if (usarIa) {
          try {
            fonte = await garantirAmpliada(imagem);
          } catch (e) {
            if (!vivo || (e as Error).name === "AbortError") return;
            // A IA falhou: o vetor segue sem ela (desligar a IA vetoriza de
            // novo), e o aviso fica junto da opção até a próxima imagem.
            iaTocada.current = true;
            setAvisoIa(`A IA não conseguiu ampliar (${e instanceof Error ? e.message : "erro desconhecido"}); o vetor saiu sem ela.`);
            setAndamento(null);
            setOpcoes((o) => ({ ...o, ia: false }));
            return;
          }
        }
        if (!vivo) return;
        const px = fonte ? fonte.px : imagem.px;
        const largura = fonte ? fonte.largura : imagem.largura;
        const altura = fonte ? fonte.altura : imagem.altura;
        const base = usarIa ? 0.6 : 0;
        setAndamento({ texto: FASES.cores!, fracao: base });
        const r = await vetorizarNoWorker(px, largura, altura, {
          cores: opcoes.automatico ? undefined : opcoes.cores,
          detalhe: opcoes.detalhe,
          suavidade: opcoes.suavidade,
          semFundo: opcoes.semFundo,
          costura: opcoes.costura,
          escala: fonte ? 1 / fonte.fator : 1,
        }, (fase, fracao) => { if (vivo) setAndamento({ texto: FASES[fase] || fase, fracao: base + (1 - base) * fracao }); });
        if (!vivo || !r) return;
        setResultado(r);
        setAndamento(null);
        // O vetor direto da imagem pequena e nítida chegou: a IA liga sozinha
        // (a menos que a pessoa já tenha escolhido), e o vetor melhor vem por
        // cima deste.
        if (!usarIa && !iaTocada.current && !motivoSemIa && lado <= LADO_IA_SOZINHA && r.estatisticas.borda < BORDA_BORRADA) {
          setOpcoes((o) => (o.ia ? o : { ...o, ia: true }));
        }
      } catch (e) {
        if (!vivo || (e as Error).name === "AbortError") return;
        setAndamento(null);
        setErro(e instanceof Error ? e.message : "O vetorizador parou no meio.");
      }
    }, 250);
    return () => { vivo = false; clearTimeout(espera); };
  }, [imagem, opcoes, motivoSemIa, garantirAmpliada, vetorizarNoWorker]);

  // O endereço do SVG para a prévia.
  useEffect(() => {
    if (!resultado) { setSvgUrl(null); return; }
    const url = URL.createObjectURL(new Blob([resultado.svg], { type: "image/svg+xml" }));
    setSvgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [resultado]);

  const mudar = <K extends keyof typeof opcoes>(chave: K, valor: (typeof opcoes)[K]) => setOpcoes((o) => ({ ...o, [chave]: valor }));
  const areaTotal = useMemo(() => (resultado ? resultado.paleta.reduce((t, c) => t + c.area, 0) : 0), [resultado]);
  const imagemGrande = imagem ? Math.max(imagem.largura, imagem.altura) > LADO_PARA_AMPLIAR : false;
  const imagemBorrada = resultado ? resultado.estatisticas.borda >= BORDA_BORRADA : false;
  const apoioDaIa = motivoSemIa
    ? motivoSemIa
    : avisoIa
      ? avisoIa
      : imagemGrande
        ? `A IA só ajuda em imagem pequena (até ${LADO_PARA_AMPLIAR} px); esta já tem detalhe de sobra.`
        : imagemBorrada && !opcoes.ia
          ? "Esta imagem é borrada: nela a IA inventa halo em vez de limpar. O vetorizador já trata a borda borrada sozinho."
          : `Liga sozinha em imagem pequena e nítida (até ${LADO_IA_SOZINHA} px): a rede de ampliação (Real-ESRGAN) recupera a cor e a borda fina que o JPEG apagou. Roda no seu computador.`;

  async function baixarPdf() {
    if (!resultado || !imagem) return;
    try {
      // Sob demanda: o pdf-lib só carrega quando a pessoa pede o PDF.
      const { pdfDoVetor } = await import("../motores/vetorizador/pdf");
      const bytes = await pdfDoVetor({
        formas: resultado.formas, largura: resultado.estatisticas.largura, altura: resultado.estatisticas.altura,
      }, larguraCm);
      baixar(new Blob([bytes as BlobPart], { type: "application/pdf" }), `${imagem.nome}-vetor.pdf`);
    } catch (e) {
      setErro(e instanceof Error ? `Não consegui montar o PDF: ${e.message}` : "Não consegui montar o PDF.");
    }
  }

  return (
    <div
      className="grid gap-3.5 xl:grid-cols-[minmax(0,1fr)_360px]"
      onDragOver={(e) => { e.preventDefault(); setArquivoEmCima(true); }}
      onDragLeave={() => setArquivoEmCima(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArquivoEmCima(false);
        const f = e.dataTransfer?.files?.[0];
        if (f) void abrir(f);
      }}
    >
      <div className="min-w-0">
        <Cartao
          titulo={imagem ? imagem.nome : "A imagem"}
          icone="icones.svg#pen-tool"
          apoio={imagem
            ? `${imagem.largura} × ${imagem.altura} px · arraste a divisória para comparar o original com o vetor`
            : "Solte aqui um PNG ou JPG — logo, estampa, arte de cliente — e receba o vetor em SVG ou PDF."}
          acao={(
            <Botao jeito="secundario" icone={<Icone referencia="icones.svg#image-plus" className="size-4" />} onClick={() => entrada.current?.click()}>
              {imagem ? "Outra imagem" : "Escolher imagem"}
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
              className={`grid min-h-[420px] w-full cursor-pointer place-items-center rounded-xl border-2 border-dashed transition-colors ${arquivoEmCima ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-linha hover:border-[var(--accent-line)]"}`}
            >
              <span className="flex flex-col items-center gap-3 text-tinta-fraca">
                <Icone referencia="icones.svg#pen-tool" className="size-10 text-ambar" />
                <span className="text-[0.95rem] text-tinta">Solte a imagem aqui, ou clique para escolher</span>
                <span className="text-[0.8rem]">PNG, JPG, WebP · o vetor sai em SVG e PDF</span>
              </span>
            </button>
          ) : (
            <div className="relative overflow-hidden rounded-xl border border-linha"
              style={{ background: "repeating-conic-gradient(#d9d9d9 0% 25%, #ffffff 0% 50%) 50% / 18px 18px" }}>
              <div className="relative mx-auto" style={{ aspectRatio: `${imagem.largura} / ${imagem.altura}`, maxHeight: "68vh" }}>
                <img src={imagem.url} alt="A imagem original" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
                {svgUrl && (
                  <img
                    src={svgUrl}
                    alt="O vetor"
                    className="absolute inset-0 h-full w-full object-contain"
                    style={{ clipPath: `inset(0 0 0 ${divisao}%)` }}
                    draggable={false}
                  />
                )}
                <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-[var(--accent)] shadow-[0_0_0_1px_rgba(0,0,0,0.25)]" style={{ left: `${divisao}%` }} />
                <span className="pointer-events-none absolute top-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] text-white">Original</span>
                <span className="pointer-events-none absolute top-2 right-2 rounded-md bg-black/60 px-2 py-0.5 text-[11px] text-white">Vetor</span>
                {andamento && (
                  <div className="absolute inset-x-0 bottom-0 bg-black/70 px-3 py-2 text-[12px] text-white">
                    <div className="mb-1 flex justify-between"><span>{andamento.texto}</span><span>{Math.round(andamento.fracao * 100)}%</span></div>
                    <div className="h-1 overflow-hidden rounded bg-white/20"><div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${Math.round(andamento.fracao * 100)}%` }} /></div>
                  </div>
                )}
              </div>
              <input
                type="range" min={0} max={100} value={divisao}
                onChange={(e) => setDivisao(Number(e.target.value))}
                aria-label="Divisória entre o original e o vetor"
                className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
              />
            </div>
          )}
        </Cartao>
      </div>

      <div className="flex min-w-0 flex-col gap-3.5">
        <Cartao titulo="Ajustes" icone="icones.svg#settings">
          <div className="flex flex-col gap-4 text-[0.85rem]">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-tinta">Cores</span>
                <span className="flex overflow-hidden rounded-lg border border-linha text-[12px]">
                  <button type="button" onClick={() => mudar("automatico", true)} className={`px-2.5 py-1 ${opcoes.automatico ? "bg-[var(--accent-soft)] text-ambar" : "text-tinta-fraca"}`}>Automático</button>
                  <button type="button" onClick={() => mudar("automatico", false)} className={`px-2.5 py-1 ${!opcoes.automatico ? "bg-[var(--accent-soft)] text-ambar" : "text-tinta-fraca"}`}>Escolher</button>
                </span>
              </div>
              {!opcoes.automatico && (
                <label className="flex items-center gap-3">
                  <input type="range" min={1} max={32} value={opcoes.cores} onChange={(e) => mudar("cores", Number(e.target.value))} className="flex-1 accent-[var(--accent)]" />
                  <span className="w-6 text-right font-mono text-tinta">{opcoes.cores}</span>
                </label>
              )}
            </div>
            <label className="block">
              <span className="mb-1 flex justify-between"><span className="text-tinta">Detalhe</span><span className="font-mono text-tinta-fraca">{opcoes.detalhe}</span></span>
              <input type="range" min={0} max={100} value={opcoes.detalhe} onChange={(e) => mudar("detalhe", Number(e.target.value))} className="w-full accent-[var(--accent)]" />
              <span className="text-[11.5px] text-tinta-apagada">Mais detalhe: mais cores no automático, ciscos menores ficam, curva mais justa.</span>
            </label>
            <label className="block">
              <span className="mb-1 flex justify-between"><span className="text-tinta">Suavidade</span><span className="font-mono text-tinta-fraca">{opcoes.suavidade}</span></span>
              <input type="range" min={0} max={100} value={opcoes.suavidade} onChange={(e) => mudar("suavidade", Number(e.target.value))} className="w-full accent-[var(--accent)]" />
              <span className="text-[11.5px] text-tinta-apagada">Mais suave: curvas mais lisas e só canto bem vivo vira quina.</span>
            </label>
            <label className="flex items-start gap-2.5">
              <input type="checkbox" checked={opcoes.semFundo} onChange={(e) => mudar("semFundo", e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
              <span><span className="text-tinta">Tirar o fundo</span><br /><span className="text-[11.5px] text-tinta-apagada">A cor lisa que encosta na borda da imagem vira transparente.</span></span>
            </label>
            <label className={`flex items-start gap-2.5 ${motivoSemIa || imagemGrande ? "opacity-60" : ""}`}>
              <input
                type="checkbox"
                checked={opcoes.ia && !imagemGrande}
                disabled={!!motivoSemIa || imagemGrande}
                onChange={(e) => { iaTocada.current = true; mudar("ia", e.target.checked); }}
                className="mt-0.5 accent-[var(--accent)]"
              />
              <span>
                <span className="text-tinta">Limpar e ampliar com IA</span><br />
                <span className="text-[11.5px] text-tinta-apagada">{apoioDaIa}</span>
              </span>
            </label>
            <label className="flex items-start gap-2.5">
              <input type="checkbox" checked={opcoes.costura} onChange={(e) => mudar("costura", e.target.checked)} className="mt-0.5 accent-[var(--accent)]" />
              <span><span className="text-tinta">Sem frestas na tela</span><br /><span className="text-[11.5px] text-tinta-apagada">Um traço fino por baixo das divisas esconde o fio claro entre duas cores. Desligue para corte em plotter.</span></span>
            </label>
          </div>
        </Cartao>

        <Cartao titulo="O vetor" icone="icones.svg#spline">
          {!resultado ? (
            <p className="m-0 text-[0.85rem] text-tinta-fraca">{imagem ? "Vetorizando…" : "Escolha uma imagem para começar."}</p>
          ) : (
            <div className="flex flex-col gap-3.5 text-[0.85rem]">
              <div className="flex flex-wrap gap-1.5">
                {resultado.paleta.map((c) => (
                  <span key={c.hex} className="flex items-center gap-1.5 rounded-md border border-linha px-1.5 py-1 font-mono text-[11px] text-tinta-fraca" title={`${((c.area / Math.max(1, areaTotal)) * 100).toFixed(1)}% do desenho`}>
                    <span className="size-3.5 rounded-sm border border-black/10" style={{ background: c.hex }} />
                    {c.hex}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12.5px]">
                <span className="text-tinta-fraca">Cores</span><span className="text-right font-mono text-tinta">{resultado.estatisticas.cores}</span>
                <span className="text-tinta-fraca">Formas</span><span className="text-right font-mono text-tinta">{resultado.estatisticas.formas}</span>
                <span className="text-tinta-fraca">Nós</span><span className="text-right font-mono text-tinta">{resultado.estatisticas.nos.toLocaleString("pt-BR")}</span>
                <span className="text-tinta-fraca">Tamanho do SVG</span><span className="text-right font-mono text-tinta">{(resultado.estatisticas.bytes / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} KB</span>
                <span className="text-tinta-fraca">Tempo</span><span className="text-right font-mono text-tinta">{(resultado.estatisticas.ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s</span>
              </div>
              <label className="flex items-center justify-between gap-3 text-[12.5px]">
                <span className="text-tinta-fraca">Largura no PDF</span>
                <span className="flex items-center gap-1.5">
                  <input type="number" min={1} step={0.5} value={larguraCm} onChange={(e) => setLarguraCm(Math.max(1, Number(e.target.value) || 1))}
                    className="w-20 rounded-md border border-linha bg-painel-suave px-2 py-1 text-right font-mono text-tinta" />
                  <span className="text-tinta-fraca">cm</span>
                </span>
              </label>
              <div className="flex flex-col gap-2">
                <Botao jeito="primario" icone={<Icone referencia="icones.svg#download" className="size-4" />}
                  onClick={() => imagem && baixar(new Blob([resultado.svg], { type: "image/svg+xml" }), `${imagem.nome}-vetor.svg`)}>
                  Baixar SVG
                </Botao>
                <div className="grid grid-cols-2 gap-2">
                  <Botao jeito="secundario" icone={<Icone referencia="icones.svg#file-down" className="size-4" />} onClick={() => void baixarPdf()}>
                    PDF
                  </Botao>
                  <Botao jeito="secundario" icone={<Icone referencia="icones.svg#file-text" className="size-4" />}
                    onClick={() => void navigator.clipboard.writeText(resultado.svg)}>
                    Copiar SVG
                  </Botao>
                </div>
              </div>
            </div>
          )}
        </Cartao>
      </div>
    </div>
  );
}
