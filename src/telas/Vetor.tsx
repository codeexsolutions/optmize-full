/**
 * ===========================================================================
 * VETOR — a imagem virando desenho
 * ===========================================================================
 *
 * Aqui só tem tela: escolher o arquivo, mexer nos controles, mostrar as duas
 * imagens lado a lado e entregar o SVG. Quem faz a conta é `motores/vetor.js`,
 * do mesmo jeito que a tela de Encaixe não sabe encaixar — e a conta roda
 * dentro de um Web Worker, fora daqui, para a página não travar enquanto ela
 * acontece.
 *
 * ---------------------------------------------------------------------------
 * ELA É UMA BANCADA, E NÃO UMA PÁGINA DE CARTÕES
 * ---------------------------------------------------------------------------
 *
 * Era uma pilha de três cartões que rolava: a imagem em cima, os ajustes no
 * meio, a comparação embaixo. O problema não era feiúra — era o trabalho:
 * vetorizar é MEXER NUM BOTÃO E OLHAR A BORDA, dezenas de vezes, e naquela
 * arrumação o botão e a borda nunca estavam na tela ao mesmo tempo. Cada
 * ajuste custava uma rolada para ver o efeito e outra para voltar.
 *
 * Agora é bancada, como o Encaixe: os controles moram numa coluna fixa à
 * esquerda e a comparação ocupa todo o resto da janela, sem cabeçalho de
 * página e sem folga em volta (ver `bancada`, em `casca/Casca.tsx`). Mexeu no
 * controle, a borda mudou do lado — sem rolar nada.
 *
 * A ordem da coluna é a ordem do trabalho: o arquivo em cima, os ajustes no
 * meio (é neles que se passa o tempo), e a saída no pé, colada no botão que a
 * produz.
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
import { Icone } from "../casca/Icone";
import { carregarImagem, lerComoDataURL } from "../utils/arquivoDeImagem";
import { formatarCm, formatarNumero, formatarSegundos } from "../utils/numero";
import { vetorizarImagem } from "../motores/vetor";
import { tirarFundoDosPixels } from "../motores/encaixeMascara";
import { pixelsPorCmDoArquivo } from "../motores/medidaDoArquivo";

/**
 * Acima disto a imagem é reduzida antes de virar vetor.
 *
 * Não é economia de memória: é qualidade. Numa foto de 5000 pontos de largura,
 * cada fiapo de compressão do JPG vira um contorno, e o desenho sai com
 * milhares de caminhos que ninguém enxerga e que travam a faca de corte. Em
 * 1800 pontos o desenho ainda tem toda a forma e o traço sai limpo.
 */
const LADO_MAXIMO = 1800;

/**
 * O lado do RASCUNHO — o primeiro passo, que existe para a tela responder.
 *
 * Vetorizar uma imagem grande leva de meio segundo a alguns segundos, e nesse
 * tempo o que se via era o desenho ANTERIOR, parado, sem nada dizendo que uma
 * conta nova estava rodando. Quem arrasta uma faixa de cor e não vê nada
 * acontecer arrasta de novo — e aí são duas contas na fila.
 *
 * Com 560 pontos o traço sai em cerca de um décimo do tempo: não é o desenho
 * final (a borda ainda tem degraus), mas responde à pergunta que a pessoa
 * acabou de fazer — "mais ou menos cores?" — enquanto o bom é calculado.
 *
 * O rascunho NUNCA é o que se baixa: ele é substituído pelo passo final antes
 * de qualquer botão de saída ligar. Ver `gerar`.
 */
const LADO_DO_RASCUNHO = 560;

/*
 * As medidas da bancada, escritas aqui porque esta tela NÃO é alcançada pelo
 * `producao.css`: aquela folha é escopada em `.producao`, e as telas de rota
 * ficam fora daquele div (ver `producao/Producao.tsx`). O Encaixe usa
 * `.barra-bancada` e `.eyebrow` de lá; aqui os mesmos 43px de barra e o mesmo
 * rótulo âmbar vêm em utilitário, para as duas telas parecerem a mesma coisa.
 */
const BARRA = "flex min-h-[43px] shrink-0 items-center gap-3 border-b border-linha bg-painel-suave px-3 py-1";
const ROTULO = "font-titulo text-[10px] font-bold tracking-[0.16em] text-ambar uppercase";

/* O rótulo de cada metade fica POR CIMA do desenho, e numa imagem alta ele cai
   em cima da arte: daí o fundo próprio, que o separa do que está atrás. */
const SELO = "pointer-events-none absolute top-2 left-2 z-10 rounded-md bg-[color-mix(in_srgb,var(--card-bg)_82%,transparent)] px-2 py-1 backdrop-blur-sm";
const ZOOM_MAXIMO = 20;

/**
 * O que a tela manda para `vetorizarImagem`.
 *
 * O núcleo é `.js` e não declara isto (ver o cabeçalho de `motores/vetor.js`);
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
  /**
   * Em que passo o rastreio está — e, por tabela, se há rastreio em curso.
   *
   * Era um `gerando` de sim/não. Com o desenho em dois passos, "está
   * calculando" deixou de ser uma coisa só: o rascunho na tela já é resposta,
   * e o que falta é o acabamento. A tela diz qual dos dois está acontecendo.
   */
  const [fase, setFase] = useState<"parado" | "rascunho" | "final">("parado");
  /** O que está na tela é o traço final (e não o rascunho)? */
  const [saidaPronta, setSaidaPronta] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [escalaNaTela, setEscalaNaTela] = useState(1);

  const original = useRef<HTMLDivElement | null>(null);
  const saida = useRef<HTMLDivElement | null>(null);
  const lupa = useRef({ escala: 1, x: 0, y: 0 });
  const arraste = useRef<{ x: number; y: number } | null>(null);
  const worker = useRef<Worker | null | false>(null);
  const pedido = useRef(0);
  /** Qual chamada de `gerar` manda agora. Ver o cabeçalho de `gerar`. */
  const geracao = useRef(0);

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
      const w = new Worker(new URL("../motores/vetorWorker.js", import.meta.url), { type: "module" });
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
   * e a regra da pasta `motores/` é conta pura. O que atravessa para o worker
   * são os bytes já lidos.
   */
  const prepararPixels = useCallback((img: HTMLImageElement, tirarFundo: boolean, lado = LADO_MAXIMO) => {
    const fator = Math.min(1, lado / Math.max(img.width, img.height));
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

  /**
   * O DESENHO, EM DOIS PASSOS.
   *
   * Primeiro um rascunho pequeno, que aparece quase imediatamente; depois o
   * traço final, na resolução de verdade, que entra por cima. Quem mexeu num
   * controle vê a resposta na hora e o acabamento chega sozinho.
   *
   * Só o passo final liga os botões de saída (ver `temSaida`): baixar o
   * rascunho seria entregar um desenho pior do que o que a tela mostrou um
   * segundo depois.
   *
   * `geracao` é o que cancela o que ficou para trás. Arrastar uma faixa
   * dispara uma chamada por movimento, e sem isto o rascunho de um pedido
   * velho chegaria DEPOIS do final de um novo e apagaria o desenho bom — o
   * defeito clássico deste tipo de tela, e o mais difícil de reproduzir.
   */
  const gerar = useCallback(async (imagem: Aberta, quais: Ajustes) => {
    const meuTurno = ++geracao.current;
    const aindaSouEu = () => geracao.current === meuTurno;

    setErro("");

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

    /** Um passo: prepara os pixels naquele tamanho e manda vetorizar. */
    const passo = async (lado: number) => {
      const preparar = () => prepararPixels(imagem.img, quais.fundo, lado);
      const { dados, largura, fator, fundo } = preparar();
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
      return { r, ms: Date.now() - comecou, largura, fator, fundo };
    };

    try {
      // ---- 1. o rascunho, só para a tela responder --------------------
      setFase("rascunho");
      const rascunho = await passo(LADO_DO_RASCUNHO);
      if (!aindaSouEu()) return;
      if (rascunho.r.svg) {
        setResultado(rascunho.r);
        setSaidaPronta(false);
      }

      // ---- 2. o traço de verdade --------------------------------------
      setFase("final");
      const bom = await passo(LADO_MAXIMO);
      if (!aindaSouEu()) return;

      if (!bom.r.svg) {
        setResultado(null);
        setSaidaPronta(false);
        setErro(bom.r.erro || "Não consegui vetorizar essa imagem.");
        return;
      }

      setResultado(bom.r);
      setSaidaPronta(true);
      setResumo(montarResumo(bom.r, bom.ms, bom.largura, bom.fator, bom.fundo, quais.fundo));
    } catch (e) {
      if (!aindaSouEu()) return;
      // O aviso na tela é para quem usa; o erro real vai para o console. Sem
      // esta linha, uma função que não existia ficou um bom tempo escondida
      // atrás de um "não consegui abrir essa imagem".
      console.error("Vetor:", e);
      setErro("Deu erro ao vetorizar: " + (e instanceof Error ? e.message : "erro desconhecido"));
    } finally {
      if (aindaSouEu()) {
        setFase("parado");
      }
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

  const temSaida = saidaPronta && !!resultado?.svg;

  return (
    <div className="flex h-full min-h-0 flex-col tela:flex-1 tela:flex-row">
      {/*
        A COLUNA. Fixa em 320px como a do Encaixe — as duas telas são a mesma
        ideia, e uma largura diferente em cada faria o olho recalibrar ao
        trocar de aba.
      */}
      {/*
        Coluna e mesa são COLADAS na janela: sem canto redondo, sem folga e com
        borda só na costura entre elas. É o mesmo arranjo do Encaixe (lá as
        medidas vêm do `producao.css`), e é o que faz a tela parecer uma
        bancada em vez de dois cartões soltos num fundo preto.
      */}
      <aside className="flex max-h-[55vh] w-full shrink-0 flex-col overflow-hidden border-b border-linha bg-painel tela:max-h-none tela:w-80 tela:border-r tela:border-b-0">
        <div className={`${BARRA} justify-between`}>
          <span className="flex min-w-0 items-baseline gap-2">
            <span className={`${ROTULO} shrink-0`}>IMAGEM</span>
            <span className="truncate font-mono text-[10px] text-tinta-apagada" title={aberta?.nome}>
              {aberta ? aberta.nome : "nenhuma"}
            </span>
          </span>

          {aberta && (
            <label className="shrink-0 cursor-pointer rounded-[9px] border border-linha bg-painel px-3 py-1.5 text-[0.78rem] font-semibold text-tinta-fraca transition-colors hover:text-tinta">
              Trocar
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
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {!aberta ? (
            /*
              Sem imagem, a coluna é só a porta de entrada: a zona de arrastar
              ocupa o lugar dos ajustes, que não teriam o que ajustar.
            */
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
          ) : (
            <>
              {/*
                OS ATALHOS VÊM ANTES DAS FAIXAS, e isso é o desenho da tela.

                Quem chega aqui quer um logo limpo ou uma foto traçada, não um
                número de tensão de curva. Um clique põe os seis controles no
                lugar certo para aquele tipo de imagem; as faixas embaixo são
                para o ajuste fino de quem já viu o resultado.
              */}
              <p className={`${ROTULO} mb-2`}>COMEÇAR POR</p>
              <div className="mb-4 grid grid-cols-2 gap-2">
                {JEITOS.map((jeito) => (
                  <button
                    key={jeito.nome}
                    type="button"
                    title={jeito.ajuda}
                    onClick={() => mexer(jeito.valores)}
                    className="rounded-[9px] border border-linha bg-painel-suave px-2.5 py-2 text-[0.78rem] font-semibold text-tinta-fraca transition-colors hover:border-[var(--accent-line)] hover:text-tinta"
                  >
                    {jeito.rotulo}
                  </button>
                ))}
              </div>

              <p className={`${ROTULO} mb-2 border-t border-linha pt-3`}>AJUSTE FINO</p>
              <div className="grid gap-3.5">
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

              <div className="mt-4 grid gap-2.5 border-t border-linha pt-3">
                <Marcar rotulo="Tirar o fundo" ligado={ajustes.fundo} aoMudar={(v) => mexer({ fundo: v })} />
                <Marcar rotulo="Achar formas redondas" ligado={ajustes.redondas} aoMudar={(v) => mexer({ redondas: v })} />
                <Marcar rotulo="Afinar no subpixel" ligado={ajustes.subpixel} aoMudar={(v) => mexer({ subpixel: v })} />
              </div>
            </>
          )}

          {erro && (
            <p className="mt-3 mb-0 flex items-start gap-2 text-[0.82rem] text-alerta">
              <Icone referencia="icones.svg#triangle-alert" className="mt-0.5 size-4 shrink-0" />
              {erro}
            </p>
          )}
        </div>

        {/*
          O PÉ DA COLUNA: o que sai daqui.

          Fica FORA da parte que rola, colado embaixo — o botão que entrega o
          trabalho não pode depender de rolar seis faixas para aparecer.
        */}
        {aberta && (
          <div className="shrink-0 space-y-2 border-t border-linha p-3">
            <p className="m-0 text-[0.75rem] leading-snug text-tinta-apagada">
              {fase === "rascunho" ? "Traçando um rascunho..."
                : fase === "final" ? "Refinando o traço..."
                  : resumo}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={baixar}
                disabled={!temSaida}
                className="flex-1 rounded-[9px] border border-ambar bg-ambar px-3 py-2 text-[0.85rem] font-semibold text-ambar-tinta transition-colors hover:bg-ambar-claro disabled:opacity-50"
              >
                Baixar SVG
              </button>
              <button
                type="button"
                onClick={() => void copiar()}
                disabled={!temSaida}
                className="rounded-[9px] border border-linha px-3 py-2 text-[0.82rem] text-tinta-fraca transition-colors hover:text-tinta disabled:opacity-50"
              >
                {copiado ? "Copiado" : "Copiar"}
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* ------------------------------------------------------------- A MESA */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-painel">
        <div className={BARRA}>
          <span className={`${ROTULO} shrink-0`}>ANTES E DEPOIS</span>

          {aberta && (
            <>
              <p className="m-0 hidden min-w-0 truncate text-[0.78rem] text-tinta-fraca tela:block">
                Aproxime e arraste para comparar a borda — a lupa é a mesma nas duas.
              </p>

              <span className="ml-auto flex shrink-0 items-center gap-2">
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
              </span>
            </>
          )}
        </div>

        {!aberta ? (
          /* A mesa vazia diz o que fazer, em vez de ser um retângulo preto. */
          <div className="grid min-h-0 flex-1 place-items-center p-6">
            <div className="max-w-sm rounded-2xl border border-linha bg-painel-suave/90 p-6 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-xl border border-linha bg-painel text-[color-mix(in_srgb,var(--accent)_45%,var(--text-dim))]">
                <Icone referencia="icones.svg#spline" className="size-[22px]" />
              </span>
              <p className="mt-3 mb-0 font-titulo text-base font-semibold text-tinta">
                Escolha uma imagem para vetorizar
              </p>
              <p className="mt-1 mb-0 text-[0.8rem] leading-relaxed text-tinta-fraca">
                O desenho sai em contornos, para cortar ou imprimir em qualquer tamanho. A imagem
                original fica à esquerda e o vetor à direita, com a mesma lupa nos dois.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/*
              As duas caixas têm exatamente a mesma altura e o conteúdo de
              ambas preenche a caixa do mesmo jeito (`object-contain`). Isto
              não é capricho: a lupa é UMA só para as duas, e comparar a borda
              de uma com a da outra só funciona se o mesmo pedaço do desenho
              cair no mesmo lugar. Com a imagem no tamanho natural e o SVG
              esticado, as duas mostram lugares diferentes e a comparação não
              diz nada.

              `grid-cols-2` e não `auto-fit`: lado a lado é o ponto da tela, e
              numa janela estreita elas empilham pela media query, não por
              acidente de largura mínima.
            */}
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-px bg-linha tela:grid-cols-2">
              <div className="relative min-h-0 touch-none overflow-hidden bg-painel-suave">
                <span className={`${ROTULO} ${SELO} text-tinta-apagada`}>ORIGINAL</span>
                <div
                  className={`grid h-full place-items-center [&_img]:size-full [&_img]:object-contain ${
                    escalaNaTela >= 3 ? "[&_img]:[image-rendering:pixelated]" : ""
                  }`}
                  {...gestos(original)}
                >
                  <img src={aberta.img.src} alt={aberta.nome} />
                </div>
              </div>

              <div className="relative min-h-0 touch-none overflow-hidden bg-painel-suave">
                <span className={`${ROTULO} ${SELO}`}>
                  VETOR
                  {fase !== "parado" && (
                    <span className="ml-2 font-texto text-[9px] font-semibold tracking-normal text-tinta-apagada normal-case">
                      {fase === "rascunho" ? "rascunho" : "refinando"}
                    </span>
                  )}
                </span>

                {fase !== "parado" && <Varredura />}

                <div
                  className={`grid h-full place-items-center [&_svg]:size-full [&_svg]:object-contain [&_svg]:transition-opacity [&_svg]:duration-200 ${
                    fase === "rascunho" ? "[&_svg]:opacity-60" : ""
                  }`}
                  {...gestos(saida)}
                  /*
                    O SVG vem de `motores/vetor.js`, gerado nesta máquina a partir
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

          </>
        )}
      </section>
    </div>
  );
}

/**
 * A VARREDURA — o que se vê enquanto o traço é calculado.
 *
 * Uma linha âmbar que desce pela metade do vetor, de cima a baixo, sem parar,
 * com um rastro atrás. É o desenho do que está acontecendo: o rastreio varre a
 * imagem linha por linha, e a animação conta isso em vez de girar uma rodinha
 * que serviria para qualquer tela de qualquer programa.
 *
 * Ela é decoração honesta e nada mais: NÃO é barra de progresso, porque não há
 * progresso para medir — o traço volta do worker inteiro ou não volta. Por
 * isso ela repete em velocidade fixa, e o que diz em que passo a conta está é
 * a palavra ao lado do rótulo ("rascunho", "refinando").
 *
 * `pointer-events-none` porque a lupa continua funcionando por baixo: dá para
 * arrastar e aproximar enquanto o desenho está sendo refeito.
 */
function Varredura() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <div className="vetor-varredura absolute inset-x-0 h-[38%]">
        {/* O rastro: um degradê que morre para cima, como o que fica na tela de
            um scanner depois que a lâmpada passa. */}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,color-mix(in_srgb,var(--accent)_16%,transparent))]" />
        {/* A linha, no pé do rastro — é ela que está "lendo" agora. */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-ambar shadow-[0_0_12px_2px_color-mix(in_srgb,var(--accent)_55%,transparent)]" />
      </div>
    </div>
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
