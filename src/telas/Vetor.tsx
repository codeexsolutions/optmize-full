/**
 * ===========================================================================
 * VETOR — a imagem virando desenho
 * ===========================================================================
 *
 * Aqui só tem tela: escolher o arquivo, mexer nos controles, mostrar as duas
 * imagens lado a lado e entregar o SVG. Quem faz a conta é `nucleo/vetor.js`,
 * do mesmo jeito que a tela de Encaixe não sabe encaixar — e a conta roda
 * dentro de um Web Worker, fora daqui, para a página não travar enquanto ela
 * acontece.
 *
 * ---------------------------------------------------------------------------
 * A LUPA É UM ESTADO SÓ PARA AS DUAS PRÉVIAS
 * ---------------------------------------------------------------------------
 *
 * Elas têm o mesmo tamanho e recebem a mesma transformação, então o mesmo
 * pedaço do desenho fica no mesmo lugar nas duas — e é só assim que dá para
 * comparar a borda de uma com a da outra sem ficar procurando onde é onde.
 *
 * Sem aproximar, as prévias dizem se as cores estão certas e mais nada: o que
 * separa "traçado" de "vetorizado" mora na borda, que naquele tamanho não se
 * enxerga.
 *
 * ---------------------------------------------------------------------------
 * O QUE MUDOU NO PORTE
 * ---------------------------------------------------------------------------
 *
 * Veio de `public/vetor-tela.js`. O comportamento é o mesmo; o que mudou é de
 * onde as coisas vêm: as contas eram nomes soltos no escopo global da página e
 * agora são `import`, e o estado que morava em variáveis de módulo virou
 * estado de componente.
 *
 * A lupa continua em `useRef`, e não em `useState`, de propósito: ela muda a
 * cada movimento do ponteiro, e repintar a árvore do React a cada pixel
 * arrastado seria trocar uma transformação de CSS por um render inteiro.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Cartao } from "../casca/Cartao";
import { Icone } from "../casca/Icone";
import { carregarImagem, lerComoDataURL } from "../casca/arquivoDeImagem";
import { formatarCm, formatarNumero, formatarSegundos } from "../casca/numero";
import { vetorizarImagem } from "../nucleo/vetor";
import { tirarFundoDosPixels } from "../nucleo/encaixeMascara";
import { pixelsPorCmDoArquivo } from "../nucleo/medidaDoArquivo";

/**
 * Acima disto a imagem é reduzida antes de virar vetor.
 *
 * Não é economia de memória: é qualidade. Numa foto de 5000 pontos de largura,
 * cada fiapo de compressão do JPG vira um contorno, e o desenho sai com
 * milhares de caminhos que ninguém enxerga e que travam a faca de corte. Em
 * 1800 pontos o desenho ainda tem toda a forma e o traço sai limpo.
 */
const LADO_MAXIMO = 1800;
const ZOOM_MAXIMO = 20;

/**
 * O que a tela manda para `vetorizarImagem`.
 *
 * O núcleo é `.js` e não declara isto (ver o cabeçalho de `nucleo/vetor.js`);
 * o contrato mora aqui, do lado de quem chama. Quando aquele arquivo ganhar
 * tipos, este bloco sai e o tipo vem de lá.
 */
interface OpcoesDoVetor {
  cores: number;
  detalhe: number;
  suavidade: number;
  quina: number;
  juntarSombras: number;
  redondas: boolean;
  subpixel: boolean;
  tensao: number;
  larguraCm: number | null;
}

interface Ajustes {
  cores: number;
  detalhe: number;
  suavidade: number;
  quina: number;
  sombras: number;
  tensao: number;
  fundo: boolean;
  redondas: boolean;
  subpixel: boolean;
}

const PADRAO: Ajustes = {
  cores: 8, detalhe: 12, suavidade: 1.2, quina: 55,
  sombras: 0, tensao: 1, fundo: false, redondas: true, subpixel: true,
};

/**
 * Ajustes prontos para os trabalhos que aparecem.
 *
 * Seis controles em fila são muitos para quem só quer o logo do cliente
 * vetorizado. Cada atalho é um ponto de partida tirado da bancada, não um
 * palpite — e continua sendo ponto de partida: depois de clicar, mexer em
 * qualquer controle refaz o desenho como sempre.
 */
const JEITOS: { nome: string; rotulo: string; ajuda: string; valores: Partial<Ajustes> }[] = [
  {
    nome: "chapada",
    rotulo: "Cor chapada",
    ajuda: "Logo, escudo, letra. É onde o vetor sai praticamente igual ao original — oito cores bastam.",
    valores: { cores: 8, detalhe: 12, suavidade: 1.2, quina: 55, sombras: 0, tensao: 1, fundo: false },
  },
  {
    /*
     * Faca de corte: uma cor só, e a mancha pequena some. O fundo TEM que sair
     * junto, e isso custou uma volta: numa arte de fundo branco, uma cor só é
     * a imagem inteira — o desenho sai como o retângulo do arquivo, quatro
     * retas e nada dentro.
     */
    nome: "silhueta",
    rotulo: "Silhueta",
    ajuda: "Uma cor só, para faca de corte. Tira o fundo junto, senão sai o retângulo do arquivo.",
    valores: { cores: 1, detalhe: 60, suavidade: 1.6, quina: 55, sombras: 0, tensao: 1, fundo: true },
  },
  {
    nome: "sombra",
    rotulo: "Sombreado",
    ajuda: "Junta o claro e o escuro da mesma cor, senão a paleta gasta os lugares dela em faixas de sombra.",
    valores: { cores: 16, detalhe: 12, suavidade: 1.2, quina: 55, sombras: 40, tensao: 1, fundo: false },
  },
  {
    nome: "fino",
    rotulo: "Traço fino",
    ajuda: "Quando a borda tem que ficar exata. Custa nós e arquivo.",
    valores: { cores: 12, detalhe: 4, suavidade: 0.4, quina: 45, sombras: 0, tensao: 1, fundo: false },
  },
];

interface Resultado {
  svg: string;
  camadas: { cor: string; caminhos: number }[];
  totalCaminhos: number;
  larguraCm?: number | null;
  alturaCm?: number | null;
  erro?: string;
}

interface Aberta {
  img: HTMLImageElement;
  nome: string;
  ppcmArquivo: number | null;
}

export function Vetor() {
  const [aberta, setAberta] = useState<Aberta | null>(null);
  const [ajustes, setAjustes] = useState<Ajustes>(PADRAO);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [resumo, setResumo] = useState("");
  const [erro, setErro] = useState("");
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [escalaNaTela, setEscalaNaTela] = useState(1);

  const original = useRef<HTMLDivElement | null>(null);
  const saida = useRef<HTMLDivElement | null>(null);
  const lupa = useRef({ escala: 1, x: 0, y: 0 });
  const arraste = useRef<{ x: number; y: number } | null>(null);
  const worker = useRef<Worker | null | false>(null);
  const pedido = useRef(0);

  useEffect(() => () => {
    if (worker.current) worker.current.terminate();
  }, []);

  /*
   * O worker nasce na primeira vez que alguém precisa dele, e é derrubado de
   * vez se falhar: `false` quer dizer "o navegador não deixou", e daí em diante
   * a conta roda aqui mesmo, travando a página. É ruim, e é melhor do que a
   * tela não funcionar.
   */
  const pegarWorker = useCallback((): Worker | false => {
    if (worker.current !== null) return worker.current;
    try {
      const w = new Worker(new URL("../nucleo/vetorWorker.js", import.meta.url), { type: "module" });
      w.addEventListener("error", () => { worker.current = false; });
      worker.current = w;
      return w;
    } catch {
      worker.current = false;
      return false;
    }
  }, []);

  /**
   * Os pixels da imagem, já reduzidos ao tamanho de trabalho.
   *
   * Reduzir aqui, e não no núcleo, é de propósito: canvas só existe na página,
   * e a regra da pasta `nucleo/` é conta pura. O que atravessa para o worker
   * são os bytes já lidos.
   */
  const prepararPixels = useCallback((img: HTMLImageElement, tirarFundo: boolean) => {
    const fator = Math.min(1, LADO_MAXIMO / Math.max(img.width, img.height));
    const largura = Math.max(1, Math.round(img.width * fator));
    const altura = Math.max(1, Math.round(img.height * fator));

    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, largura, altura);
    const dados = ctx.getImageData(0, 0, largura, altura);

    // O fundo sai com a mesma conta da tela de Encaixe: quem decide se existe
    // fundo é a borda inteira, e não quatro pixels dos cantos.
    const fundo = tirarFundo ? tirarFundoDosPixels(dados.data, largura, altura, true) : null;
    return { dados, largura, fator, fundo };
  }, []);

  /**
   * A vetorização, no worker quando dá.
   *
   * Os pixels vão **transferidos**, sem cópia — são treze megabytes numa
   * imagem no teto de 1800 pontos, e copiar seria repetir na thread da tela o
   * trabalho que se está tirando dela. O preço é que o buffer não serve mais
   * aqui depois de mandado: quem precisar dele de novo lê os pixels outra vez.
   */
  const vetorizarNoWorker = useCallback((dados: ImageData, opcoes: OpcoesDoVetor): Promise<Resultado> => {
    const w = pegarWorker();
    if (!w) return Promise.resolve(vetorizarImagem(dados, opcoes) as Resultado);

    const id = ++pedido.current;
    return new Promise((pronto, falhou) => {
      const ouvir = (e: MessageEvent) => {
        // Resposta de um pedido que já foi trocado por outro: descarta.
        if (!e.data || e.data.id !== id) return;
        w.removeEventListener("message", ouvir);
        if (e.data.erro) falhou(new Error(e.data.erro));
        else pronto(e.data.resultado as Resultado);
      };
      w.addEventListener("message", ouvir);
      w.addEventListener("error", () => falhou(new Error("o worker do vetor caiu")), { once: true });
      w.postMessage(
        { id, pixels: dados.data.buffer, largura: dados.width, altura: dados.height, opcoes },
        [dados.data.buffer],
      );
    });
  }, [pegarWorker]);

  const aplicarLupa = useCallback(() => {
    const caixa = original.current?.parentElement;
    if (caixa) {
      // A folga é o quanto o desenho ampliado sobra para fora da caixa:
      // arrastar além disso só traria borda vazia para dentro.
      const folgaX = Math.max(0, (caixa.clientWidth * lupa.current.escala - caixa.clientWidth) / 2);
      const folgaY = Math.max(0, (caixa.clientHeight * lupa.current.escala - caixa.clientHeight) / 2);
      lupa.current.x = Math.max(-folgaX, Math.min(folgaX, lupa.current.x));
      lupa.current.y = Math.max(-folgaY, Math.min(folgaY, lupa.current.y));
    }
    const t = `translate(${lupa.current.x.toFixed(1)}px, ${lupa.current.y.toFixed(1)}px) scale(${lupa.current.escala})`;
    for (const alvo of [original.current, saida.current]) {
      if (alvo) alvo.style.transform = t;
    }
    setEscalaNaTela(lupa.current.escala);
  }, []);

  /**
   * Aproxima deixando parado o ponto que está debaixo de (mx, my), medidos a
   * partir do centro da caixa — que é a origem da transformação.
   *
   * Sem essa conta a roda do mouse aproximaria sempre o meio da imagem, e quem
   * quer olhar um canto teria que aproximar e depois procurar.
   */
  const aproximar = useCallback((nova: number, mx: number, my: number) => {
    const alvo = Math.max(1, Math.min(ZOOM_MAXIMO, nova));
    const k = alvo / lupa.current.escala;
    lupa.current.x = mx - (mx - lupa.current.x) * k;
    lupa.current.y = my - (my - lupa.current.y) * k;
    lupa.current.escala = alvo;
    aplicarLupa();
  }, [aplicarLupa]);

  const zerarLupa = useCallback(() => {
    lupa.current = { escala: 1, x: 0, y: 0 };
    aplicarLupa();
  }, [aplicarLupa]);

  const gerar = useCallback(async (imagem: Aberta, quais: Ajustes) => {
    setErro("");
    setGerando(true);
    try {
      const preparar = () => prepararPixels(imagem.img, quais.fundo);
      const { dados, largura, fator, fundo } = preparar();

      // A medida real da arte, quando o arquivo traz o dpi: o SVG sai em
      // centímetros de verdade e a plotter imprime no tamanho certo.
      const larguraCm = imagem.ppcmArquivo && imagem.ppcmArquivo > 0
        ? imagem.img.width / imagem.ppcmArquivo
        : null;

      const opcoes: OpcoesDoVetor = {
        cores: quais.cores, detalhe: quais.detalhe, suavidade: quais.suavidade,
        quina: quais.quina, juntarSombras: quais.sombras, redondas: quais.redondas,
        subpixel: quais.subpixel, tensao: quais.tensao, larguraCm,
      };

      const comecou = Date.now();
      let r: Resultado;
      try {
        r = await vetorizarNoWorker(dados, opcoes);
      } catch (falha) {
        // O worker caiu: refaz aqui mesmo, lendo os pixels de novo — os
        // primeiros foram embora na transferência.
        if (worker.current !== false) throw falha;
        r = vetorizarImagem(preparar().dados, opcoes) as Resultado;
      }
      const ms = Date.now() - comecou;

      if (!r.svg) {
        setResultado(null);
        setErro(r.erro || "Não consegui vetorizar essa imagem.");
        return;
      }
      setResultado(r);
      setResumo(montarResumo(r, ms, largura, fator, fundo, quais.fundo));
    } catch (e) {
      // O aviso na tela é para quem usa; o erro real vai para o console. Sem
      // esta linha, uma função que não existia ficou um bom tempo escondida
      // atrás de um "não consegui abrir essa imagem".
      console.error("Vetor:", e);
      setErro("Deu erro ao vetorizar: " + (e instanceof Error ? e.message : "erro desconhecido"));
    } finally {
      setGerando(false);
    }
  }, [prepararPixels, vetorizarNoWorker]);

  const abrir = useCallback(async (file: File) => {
    setErro("");
    if (!file || !/^image\//.test(file.type)) {
      setErro("Mande uma imagem: PNG, JPG ou WEBP.");
      return;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ppcmArquivo = pixelsPorCmDoArquivo(bytes) as number | null;
      const img = await carregarImagem(await lerComoDataURL(file));
      const nova: Aberta = { img, nome: file.name, ppcmArquivo };
      setAberta(nova);
      // Imagem nova, lupa zerada: o pedaço que interessava na anterior não tem
      // nada a ver com esta.
      zerarLupa();
      await gerar(nova, ajustes);
    } catch (e) {
      console.error("abrir imagem para vetor:", e);
      setErro(`"${file.name}": não consegui abrir essa imagem.`);
    }
  }, [ajustes, gerar, zerarLupa]);

  /** Mexeu no controle, refaz o desenho. */
  const mexer = (mudanca: Partial<Ajustes>) => {
    const proximo = { ...ajustes, ...mudanca };
    setAjustes(proximo);
    if (aberta) void gerar(aberta, proximo);
  };

  const gestos = (alvo: React.RefObject<HTMLDivElement | null>) => ({
    ref: alvo,
    onWheel: (e: React.WheelEvent<HTMLDivElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      // Um passo por entalhe da roda, sempre proporcional: de 1× para 2× e de
      // 10× para 20× o gesto tem que ser o mesmo.
      aproximar(
        lupa.current.escala * (e.deltaY < 0 ? 1.25 : 1 / 1.25),
        e.clientX - r.left - r.width / 2,
        e.clientY - r.top - r.height / 2,
      );
    },
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (lupa.current.escala <= 1) return;
      arraste.current = { x: e.clientX - lupa.current.x, y: e.clientY - lupa.current.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (!arraste.current) return;
      lupa.current.x = e.clientX - arraste.current.x;
      lupa.current.y = e.clientY - arraste.current.y;
      aplicarLupa();
    },
    onPointerUp: () => { arraste.current = null; },
    onPointerCancel: () => { arraste.current = null; },
    onDoubleClick: zerarLupa,
  });

  const baixar = () => {
    if (!resultado?.svg) return;
    const nome = (aberta?.nome || "vetor").replace(/\.[^.]+$/, "");
    const url = URL.createObjectURL(new Blob([resultado.svg], { type: "image/svg+xml" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nome}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  // Copiar em vez de baixar: SVG é texto, e colar direto no CorelDRAW ou no
  // Illustrator poupa a viagem pela pasta de downloads.
  const copiar = async () => {
    if (!resultado?.svg) return;
    try {
      await navigator.clipboard.writeText(resultado.svg);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      setErro("O navegador não deixou copiar. Use o Baixar SVG.");
    }
  };

  return (
    <>
      <Cartao
        titulo="Imagem para vetor"
        icone="icones.svg#spline"
        apoio="Transforma a imagem em desenho de contornos, para corte e para imprimir em qualquer tamanho."
      >
        <label
          onDragEnter={(e) => { e.preventDefault(); setArrastando(true); }}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            const file = e.dataTransfer?.files?.[0];
            if (file) void abrir(file);
          }}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-[10px] border border-dashed px-4 py-8 text-center transition-colors ${
            arrastando ? "border-ambar bg-[var(--accent-soft)]" : "border-linha bg-painel-suave"
          }`}
        >
          <Icone referencia="icones.svg#image" className="size-7 text-tinta-apagada" />
          <span className="text-[0.88rem] text-tinta">Escolha a imagem ou arraste para cá</span>
          <span className="text-[0.75rem] text-tinta-apagada">PNG, JPG ou WEBP</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void abrir(file);
            }}
          />
        </label>

        {erro && (
          <p className="mt-3 mb-0 flex items-center gap-2 text-[0.85rem] text-alerta">
            <Icone referencia="icones.svg#triangle-alert" className="size-4 shrink-0" />
            {erro}
          </p>
        )}
      </Cartao>

      {aberta && (
        <>
          <Cartao titulo="Ajustes" icone="icones.svg#palette" apoio="Comece por um atalho; depois mexa no que precisar.">
            <div className="mb-4 flex flex-wrap gap-2">
              {JEITOS.map((jeito) => (
                <button
                  key={jeito.nome}
                  type="button"
                  title={jeito.ajuda}
                  onClick={() => mexer(jeito.valores)}
                  className="rounded-[9px] border border-linha bg-painel-suave px-3.5 py-2 text-[0.82rem] font-semibold text-tinta-fraca transition-colors hover:border-[var(--accent-line)] hover:text-tinta"
                >
                  {jeito.rotulo}
                </button>
              ))}
            </div>

            <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
              <Faixa rotulo="Cores" valor={ajustes.cores} min={1} max={32} passo={1}
                aoMudar={(v) => mexer({ cores: v })} />
              <Faixa rotulo="Detalhe mínimo" valor={ajustes.detalhe} min={1} max={200} passo={1}
                aoMudar={(v) => mexer({ detalhe: v })} sufixo=" px" />
              <Faixa rotulo="Suavidade" valor={ajustes.suavidade} min={0} max={4} passo={0.1}
                aoMudar={(v) => mexer({ suavidade: v })} />
              <Faixa rotulo="Quina a partir de" valor={ajustes.quina} min={10} max={170} passo={1}
                aoMudar={(v) => mexer({ quina: v })} sufixo="°" />
              <Faixa rotulo="Juntar sombras" valor={ajustes.sombras} min={0} max={100} passo={1}
                aoMudar={(v) => mexer({ sombras: v })} />
              <Faixa rotulo="Tensão da curva" valor={ajustes.tensao} min={0} max={2} passo={0.05}
                aoMudar={(v) => mexer({ tensao: v })} />
            </div>

            <div className="mt-4 flex flex-wrap gap-4">
              <Marcar rotulo="Tirar o fundo" ligado={ajustes.fundo} aoMudar={(v) => mexer({ fundo: v })} />
              <Marcar rotulo="Achar formas redondas" ligado={ajustes.redondas} aoMudar={(v) => mexer({ redondas: v })} />
              <Marcar rotulo="Afinar no subpixel" ligado={ajustes.subpixel} aoMudar={(v) => mexer({ subpixel: v })} />
            </div>
          </Cartao>

          <Cartao
            titulo="Antes e depois"
            icone="icones.svg#zoom-in"
            apoio="A lupa é a mesma nas duas: aproxime e arraste para comparar a borda. Dois cliques volta ao inteiro."
            acao={
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={1}
                  max={ZOOM_MAXIMO}
                  step={0.05}
                  value={escalaNaTela}
                  onChange={(e) => aproximar(Number(e.target.value), 0, 0)}
                  aria-label="Aproximação"
                  className="w-28 accent-[var(--accent)]"
                />
                <span className="w-12 shrink-0 font-mono text-[0.75rem] text-tinta-fraca">
                  {formatarNumero(escalaNaTela, 2).replace(/,?0+$/, "")}×
                </span>
                <button
                  type="button"
                  onClick={zerarLupa}
                  className="rounded-[9px] border border-linha px-3 py-1.5 text-[0.78rem] text-tinta-fraca transition-colors hover:text-tinta"
                >
                  Ver inteiro
                </button>
              </div>
            }
          >
            {/*
              As duas caixas têm exatamente a mesma altura e o conteúdo de
              ambas preenche a caixa do mesmo jeito (`object-contain`). Isto
              não é capricho: a lupa é UMA só para as duas, e comparar a borda
              de uma com a da outra só funciona se o mesmo pedaço do desenho
              cair no mesmo lugar. Com a imagem no tamanho natural e o SVG
              esticado, as duas mostram lugares diferentes e a comparação não
              diz nada.
            */}
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
              <div className="touch-none overflow-hidden rounded-[10px] border border-linha bg-painel-suave">
                <div
                  className={`grid h-[320px] place-items-center [&_img]:size-full [&_img]:object-contain ${
                    escalaNaTela >= 3 ? "[&_img]:[image-rendering:pixelated]" : ""
                  }`}
                  {...gestos(original)}
                >
                  <img src={aberta.img.src} alt={aberta.nome} />
                </div>
              </div>
              <div className="touch-none overflow-hidden rounded-[10px] border border-linha bg-painel-suave">
                <div
                  className="grid h-[320px] place-items-center [&_svg]:size-full [&_svg]:object-contain"
                  {...gestos(saida)}
                  /*
                    O SVG vem de `nucleo/vetor.js`, gerado nesta máquina a partir
                    dos pixels da própria imagem — não há texto de fora entrando
                    aqui. O `width`/`height` sai: o arquivo guardado tem o
                    tamanho real, o da tela precisa caber na caixa.
                  */
                  dangerouslySetInnerHTML={{
                    __html: (resultado?.svg || "")
                      .replace(/<\?xml[^>]*\?>/, "")
                      .replace(/(<svg\b[^>]*?)\s(?:width|height)="[^"]*"/g, "$1")
                      .replace(/(<svg\b[^>]*?)\s(?:width|height)="[^"]*"/g, "$1"),
                  }}
                />
              </div>
            </div>

            <p className="mt-3 mb-0 text-[0.8rem] text-tinta-fraca">
              {gerando ? "Gerando..." : resumo}
            </p>

            {resultado && resultado.camadas.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {resultado.camadas.map((camada) => (
                  <span
                    key={camada.cor}
                    title={`${camada.caminhos} contorno(s)`}
                    className="flex items-center gap-1.5 rounded-full border border-linha px-2.5 py-1 font-mono text-[0.68rem] text-tinta-fraca"
                  >
                    <i aria-hidden="true" className="size-2.5 rounded-full" style={{ background: camada.cor }} />
                    {camada.cor}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-3.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={baixar}
                disabled={!resultado?.svg}
                className="rounded-[9px] border border-ambar bg-ambar px-4 py-2 text-[0.85rem] font-semibold text-ambar-tinta transition-colors hover:bg-ambar-claro disabled:opacity-50"
              >
                Baixar SVG
              </button>
              <button
                type="button"
                onClick={() => void copiar()}
                disabled={!resultado?.svg}
                className="rounded-[9px] border border-linha px-4 py-2 text-[0.85rem] text-tinta-fraca transition-colors hover:text-tinta disabled:opacity-50"
              >
                Copiar SVG
              </button>
              {copiado && <span className="text-[0.8rem] text-certo">Copiado.</span>}
            </div>
          </Cartao>
        </>
      )}
    </>
  );
}

/** O texto do rodapé: o que saiu, quanto pesa e quanto demorou. */
function montarResumo(
  r: Resultado, ms: number, largura: number, fator: number,
  fundo: unknown, pediuTirarFundo: boolean,
): string {
  const partes = [
    `${r.camadas.length} cor${r.camadas.length === 1 ? "" : "es"}`,
    `${r.totalCaminhos} contorno${r.totalCaminhos === 1 ? "" : "s"}`,
    `${formatarNumero(r.svg.length / 1024, 0)} KB`,
    formatarSegundos(ms),
  ];

  /*
   * Quantos trechos saíram como arco de verdade, e não como curva que passa
   * perto. Vale dizer: é a diferença entre um arquivo que o CorelDRAW abre com
   * circunferências e um que ele abre com quarenta nós soltos.
   *
   * Cada comando `A` é um arco. Um círculo inteiro são dois (as duas metades),
   * um canto arredondado é um só — por isso a conta não divide nada, o que já
   * rendeu um "8.5 formas redondas" no rodapé.
   */
  const arcos = (r.svg.match(/A/g) || []).length;
  const retas = (r.svg.match(/L/g) || []).length;
  const curvas = (r.svg.match(/C/g) || []).length;
  const feito: string[] = [];
  if (retas > 0) feito.push(`${retas} reta${retas === 1 ? "" : "s"}`);
  if (arcos > 0) feito.push(`${arcos} arco${arcos === 1 ? "" : "s"}`);
  if (curvas > 0) feito.push(`${curvas} curva${curvas === 1 ? "" : "s"}`);
  if (feito.length) partes.push(feito.join(" + "));

  if (r.larguraCm) partes.push(`${formatarNumero(r.larguraCm, 1)} × ${formatarCm(r.alturaCm)}`);
  if (fator < 1) partes.push(`trabalhado em ${largura} px de largura`);

  /*
   * Pedir para tirar o fundo e não sair nada precisa aparecer. Sem isso o
   * atalho da silhueta entrega o retângulo do arquivo — uma cor só, quatro
   * retas — e não há como adivinhar por quê: quem decide se existe fundo é a
   * mesma leitura do Encaixe, e arte que sangra até a borda não tem fundo para
   * reconhecer.
   */
  if (fundo) partes.push("fundo removido");
  else if (pediuTirarFundo) partes.push("não achei fundo para tirar");

  return partes.join(" · ");
}

function Faixa({ rotulo, valor, min, max, passo, sufixo = "", aoMudar }: {
  rotulo: string; valor: number; min: number; max: number; passo: number;
  sufixo?: string; aoMudar: (valor: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[0.78rem] text-tinta-fraca">{rotulo}</span>
        <strong className="font-mono text-[0.78rem] text-tinta">
          {formatarNumero(valor, passo < 1 ? 2 : 0).replace(/,?0+$/, "")}{sufixo}
        </strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={passo}
        value={valor}
        onChange={(e) => aoMudar(Number(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
    </label>
  );
}

function Marcar({ rotulo, ligado, aoMudar }: {
  rotulo: string; ligado: boolean; aoMudar: (ligado: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[0.82rem] text-tinta-fraca">
      <input
        type="checkbox"
        checked={ligado}
        onChange={(e) => aoMudar(e.target.checked)}
        className="size-4 accent-[var(--accent)]"
      />
      {rotulo}
    </label>
  );
}
