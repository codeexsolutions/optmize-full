/**
 * ===========================================================================
 * DIGITALIZAR — a foto da mesa virando risco, e o risco na mão da pessoa
 * ===========================================================================
 *
 * Larga-se a foto dos moldes na mesa (PNG, BMP, JPG), o sistema acha a volta
 * por fora de CADA peça e desenha os riscos em cima da foto. A pessoa corrige
 * o que quiser — arrastando nós e alças de curva —, mede UMA peça com a fita e
 * diz quanto deu; aí todas ganham centímetro.
 *
 * Aqui só tem tela. Quem acha os contornos é `motores/moldeDaImagem.js` e quem
 * os transforma em curva é `motores/ajusteDeCurvas.js`, do mesmo jeito que a
 * tela de Encaixe não sabe encaixar. O que esta tela faz do lado de cá é o que
 * exige navegador: reduzir a foto à grade com um canvas (motor não mexe com
 * DOM, ver `utils/arquivoDeImagem.ts`) e a edição.
 *
 * ---------------------------------------------------------------------------
 * NÓS COM ALÇA, E NÃO UMA NUVEM DE PONTOS
 * ---------------------------------------------------------------------------
 *
 * Antes o risco era uma poligonal: uma calça saía com 377 pontos, e ajustar um
 * gancho à mão queria dizer arrastar trinta deles, um a um, tentando mantê-los
 * alinhados. Agora o mesmo gancho tem dois ou três nós com alça — pega-se a
 * alça e a curva inteira acompanha.
 *
 * O nó redondo é curva; o quadrado é CANTO, e canto é ponto de costura: a
 * conta marca esses e a tela os desenha diferente para ninguém arredondar um
 * bico por engano.
 *
 * ---------------------------------------------------------------------------
 * O RISCO ACHADO É UM PALPITE; O EDITADO É A VERDADE
 * ---------------------------------------------------------------------------
 *
 * O que o motor devolve fica guardado como veio, e a edição trabalha numa
 * CÓPIA (`edicao`). Os dois precisam existir separados porque mexer nos
 * controles de busca refaz tudo, e refazer joga fora o trabalho manual — se
 * fosse o mesmo objeto, um esbarrão no controle apagaria meia hora de ajuste
 * sem perguntar. Por isso aqueles controles avisam antes.
 *
 * Daí para a frente quem manda é sempre a cópia editada: a medida, a lista de
 * peças, o SVG e o PDF saem dela.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A MEDIDA É DIGITADA, E NÃO ADIVINHADA
 * ---------------------------------------------------------------------------
 *
 * Uma foto não carrega medida. A mesma imagem pode ser um molde de 60 cm ou
 * uma miniatura de 6 cm — os pixels são idênticos. Só o dpi de um scanner
 * diria, e foto de câmera não tem dpi nenhum: seria chute.
 *
 * E chute aqui é pior do que nada, porque não aparece. Um risco com a forma
 * certa e o tamanho errado atravessa a conferência, o encaixe e a impressão
 * sem levantar suspeita — o erro só aparece com o tecido já cortado. Por isso
 * a tela não mostra centímetro nenhum enquanto a medida não for informada.
 *
 * ---------------------------------------------------------------------------
 * A SAÍDA
 * ---------------------------------------------------------------------------
 *
 * PDF em tamanho real, para imprimir e usar de gabarito, e SVG para abrir no
 * CorelDRAW ou no Illustrator — este com as curvas como curvas (`C`), então
 * quem abrir recebe os mesmos poucos nós que viu aqui. Esta tela não manda
 * nada para o Encaixe: o que sai daqui é arquivo.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cartao } from "../casca/Cartao";
import { Icone } from "../casca/Icone";
import { carregarImagem, lerComoDataURL } from "../utils/arquivoDeImagem";
import { formatarCm } from "../utils/numero";
import { aliviarContorno, contornosDasManchas } from "../motores/moldes";
import { achatarCurvas } from "../motores/ajusteDeCurvas";
import { riscoApi } from "../api/risco";
import {
  CELULAS_NO_LADO_MAIOR, ERRO_DE_CURVA_PADRAO, FORMATOS_DE_IMAGEM, areaDo, caixaDo,
  ehImagemDeMolde, riscosDosPixels, riscosEmCm, svgDosRiscos,
} from "../motores/moldeDaImagem";

type Lado = "largura" | "altura";
type Ponto = { x: number; y: number };
type No = { x: number; y: number; entrada: Ponto; saida: Ponto; canto?: boolean };
/** O que o ponteiro pegou: um nó, ou uma das alças dele. */
type Pega = { peca: number; no: number; parte: "no" | "entrada" | "saida" };
/** Onde o ponteiro caiu em cima do traço: que trecho, e em que ponto dele. */
type NoTraco = { peca: number; no: number; t: number };

/** As cores dos riscos na prévia, para dar para falar "a peça verde". */
const CORES = ["#ff7a1a", "#25c2a0", "#4d9dff", "#f45d9c", "#f5c518", "#9d7bff"];
const corDa = (i: number): string => CORES[i % CORES.length] || "#ff7a1a";

/** Quantos passos de desfazer a tela guarda. */
const PASSOS_DE_DESFAZER = 40;

/** Raio de pega, em pixels da tela. */
const PEGA = 10;

const ZOOM_MIN = 1;
const ZOOM_MAX = 12;

/** Um ponto da cúbica em `t`. */
function naCurva(p0: Ponto, p1: Ponto, p2: Ponto, p3: Ponto, t: number): Ponto {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/**
 * Parte a cúbica em duas, em `t`, sem mudar o desenho (de Casteljau).
 *
 * É o que deixa "pôr um nó no meio da curva" ser inofensivo: o traço fica
 * exatamente onde estava, só passa a ter mais um nó para pegar. Se o nó novo
 * fosse simplesmente enfiado na lista, a curva mudaria de forma no ato.
 */
function dividirCurva(p0: Ponto, p1: Ponto, p2: Ponto, p3: Ponto, t: number) {
  const meio = (a: Ponto, b: Ponto): Ponto => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const a1 = meio(p0, p1);
  const a2 = meio(p1, p2);
  const a3 = meio(p2, p3);
  const b1 = meio(a1, a2);
  const b2 = meio(a2, a3);
  const centro = meio(b1, b2);
  return { saidaDoAnterior: a1, entradaDoNovo: b1, no: centro, saidaDoNovo: b2, entradaDoSeguinte: a3 };
}

export function Digitalizar() {
  const [nome, setNome] = useState("");
  const [imagem, setImagem] = useState<HTMLImageElement | null>(null);
  const [achado, setAchado] = useState<any>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erroDeCurva, setErroDeCurva] = useState(ERRO_DE_CURVA_PADRAO);

  /** Os contornos como a pessoa os deixou. Ver o cabeçalho. */
  const [edicao, setEdicao] = useState<No[][]>([]);
  const [desfazer, setDesfazer] = useState<No[][][]>([]);

  const [medida, setMedida] = useState("");
  const [lado, setLado] = useState<Lado>("altura");
  const [qual, setQual] = useState(0);
  /** O nó cujas alças estão à mostra. */
  const [noAtivo, setNoAtivo] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  /** Um arquivo sendo arrastado por cima do cartão. */
  const [arquivoEmCima, setArquivoEmCima] = useState(false);

  const entrada = useRef<HTMLInputElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const moldura = useRef<HTMLDivElement>(null);
  /** O que está sendo arrastado agora. `null` quando nada. */
  const pegando = useRef<{ peca: number; no: number; parte: "no" | "entrada" | "saida" } | null>(null);

  // A caixa e a área saem da curva ACHATADA: mover uma alça muda a barriga da
  // curva sem mexer em nó nenhum, e a medida da peça tem que acompanhar isso.
  const pecas = useMemo(
    () => edicao.map((nos) => {
      const achatado = achatarCurvas(nos);
      return { nos, caixa: caixaDo(achatado), area: areaDo(achatado) };
    }),
    [edicao],
  );

  const cm = Number(String(medida).replace(",", "."));
  const emCm = pecas.length > 0 && cm > 0 ? riscosEmCm(pecas, qual, lado, cm) : null;

  const clonar = (fonte: No[][]): No[][] => fonte.map((nos) => nos.map((n) => ({
    x: n.x, y: n.y, entrada: { ...n.entrada }, saida: { ...n.saida }, canto: n.canto,
  })));

  /** Guarda o estado atual na pilha do desfazer, antes de mexer. */
  const lembrar = useCallback(() => {
    setDesfazer((pilha) => [...pilha.slice(-(PASSOS_DE_DESFAZER - 1)), clonar(edicao)]);
  }, [edicao]);

  const voltarUmPasso = useCallback(() => {
    setDesfazer((pilha) => {
      if (pilha.length === 0) return pilha;
      setEdicao(pilha[pilha.length - 1]!);
      return pilha.slice(0, -1);
    });
  }, []);

  /**
   * Reduz a foto à grade e procura os riscos.
   *
   * A redução é daqui, e não do motor, por duas razões: canvas é DOM, e a
   * média que o navegador faz ao reduzir já alisa o ruído do sensor e a textura
   * do papel — que, no tamanho original, deixariam o contorno tremido.
   */
  const procurar = useCallback((img: HTMLImageElement, erroCurva: number) => {
    setOcupado(true);
    setErro("");
    // Um quadro de respiro antes da conta: sem ele o "Procurando" não chega a
    // ser pintado, porque a busca segura a thread da tela até o fim.
    requestAnimationFrame(() => {
      try {
        const larguraOriginal = img.naturalWidth || img.width;
        const alturaOriginal = img.naturalHeight || img.height;
        const escala = CELULAS_NO_LADO_MAIOR / Math.max(larguraOriginal, alturaOriginal);
        const cols = Math.max(2, Math.round(larguraOriginal * escala));
        const rows = Math.max(2, Math.round(alturaOriginal * escala));

        const grade = document.createElement("canvas");
        grade.width = cols;
        grade.height = rows;
        const gtx = grade.getContext("2d", { willReadFrequently: true });
        if (!gtx) throw new Error("o navegador não deu um canvas para trabalhar.");
        gtx.imageSmoothingQuality = "high";
        gtx.drawImage(img, 0, 0, cols, rows);

        const saida = riscosDosPixels(gtx.getImageData(0, 0, cols, rows).data, cols, rows, {
          erroDeCurva: erroCurva,
          contornar: contornosDasManchas,
          aliviar: aliviarContorno,
        });
        if (saida.erro) {
          setAchado(null);
          setEdicao([]);
          setErro(saida.erro);
        } else {
          setAchado({ ...saida, cols, rows });
          setEdicao(clonar(saida.riscos.map((r: any) => r.nos)));
          setDesfazer([]);
          setQual(0);
          setNoAtivo(null);
        }
      } catch (e: any) {
        setAchado(null);
        setEdicao([]);
        setErro(e?.message || "Não consegui ler essa imagem.");
      } finally {
        setOcupado(false);
      }
    });
  }, []);

  const abrir = async (file: File | undefined) => {
    if (!file) return;
    if (!ehImagemDeMolde(file)) {
      setErro(`"${file.name}" não é um formato que eu leia. Mande ${FORMATOS_DE_IMAGEM}.`);
      return;
    }
    setErro("");
    setAchado(null);
    setEdicao([]);
    setDesfazer([]);
    setMedida("");
    setZoom(1);
    setNome(file.name.replace(/\.[^.]+$/, ""));
    try {
      // `lerComoDataURL` e não `URL.createObjectURL`: ver o cabeçalho de
      // `utils/arquivoDeImagem`. O endereço de objeto morre quando o `<input>`
      // é limpo logo depois da escolha, e esta tela segura a imagem enquanto
      // durar o ajuste — com ele, a prévia some no meio.
      const img = await carregarImagem(await lerComoDataURL(file));
      setImagem(img);
      procurar(img, erroDeCurva);
    } catch {
      setErro(`Não consegui abrir "${file.name}".`);
    }
  };

  /*
   * Arrastar e soltar, como nas telas de Vetor, Imagem e Cor.
   *
   * Vale no cartão INTEIRO, e não só na caixa de "nenhuma foto ainda": depois
   * da primeira foto aquela caixa some, e sem isto o arrasta-e-solta sumiria
   * com ela — quem quisesse trocar a foto teria que voltar ao botão, que é
   * justamente o que o arrasto existe para evitar.
   */
  const aoArrastar = {
    onDragEnter: (e: React.DragEvent) => { e.preventDefault(); setArquivoEmCima(true); },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setArquivoEmCima(true); },
    onDragLeave: (e: React.DragEvent) => {
      // Sair para um filho não é sair do cartão; sem esta conferência a moldura
      // pisca a cada elemento que o ponteiro atravessa.
      if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) return;
      setArquivoEmCima(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setArquivoEmCima(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) void abrir(file);
    },
  };

  /** Onde o ponteiro caiu, em unidades da grade. */
  const naGrade = (e: { clientX: number; clientY: number }): Ponto | null => {
    const canvas = tela.current;
    if (!canvas || !achado) return null;
    const caixa = canvas.getBoundingClientRect();
    if (caixa.width === 0) return null;
    return {
      x: ((e.clientX - caixa.left) / caixa.width) * achado.cols,
      y: ((e.clientY - caixa.top) / caixa.height) * achado.rows,
    };
  };

  /** Quantas unidades de grade valem um pixel da tela. Vira o raio de pega. */
  const gradePorPixel = () => {
    const canvas = tela.current;
    if (!canvas || !achado) return 1;
    const caixa = canvas.getBoundingClientRect();
    return caixa.width > 0 ? achado.cols / caixa.width : 1;
  };

  /** O que está debaixo do ponteiro: alça do nó ativo, nó, ou nada. */
  const oQueEstaSob = (alvo: Ponto): Pega | null => {
    const raio = PEGA * gradePorPixel();

    // As alças primeiro: elas ficam por cima e costumam estar perto do nó.
    const contorno = edicao[qual];
    if (contorno && noAtivo !== null && contorno[noAtivo]) {
      const n = contorno[noAtivo]!;
      for (const parte of ["entrada", "saida"] as const) {
        const a = n[parte];
        if (Math.hypot(a.x - alvo.x, a.y - alvo.y) < raio) return { peca: qual, no: noAtivo, parte };
      }
    }

    let achadoNo: Pega | null = null;
    let menor = raio;
    for (let p = 0; p < edicao.length; p++) {
      const nos = edicao[p]!;
      for (let i = 0; i < nos.length; i++) {
        const n = nos[i]!;
        const d = Math.hypot(n.x - alvo.x, n.y - alvo.y);
        if (d < menor) { menor = d; achadoNo = { peca: p, no: i, parte: "no" }; }
      }
    }
    return achadoNo;
  };

  /** Em que trecho de curva o ponteiro caiu, e em que `t`. */
  const noTracoSob = (alvo: Ponto): NoTraco | null => {
    const raio = PEGA * gradePorPixel();
    let melhor: NoTraco | null = null;
    let menor = raio;
    for (let p = 0; p < edicao.length; p++) {
      const nos = edicao[p]!;
      for (let i = 0; i < nos.length; i++) {
        const a = nos[i]!;
        const b = nos[(i + 1) % nos.length]!;
        const passos = 16;
        for (let k = 0; k <= passos; k++) {
          const t = k / passos;
          const q = naCurva(a, a.saida, b.entrada, b, t);
          const d = Math.hypot(q.x - alvo.x, q.y - alvo.y);
          if (d < menor) { menor = d; melhor = { peca: p, no: i, t }; }
        }
      }
    }
    return melhor;
  };

  const aoApertar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const alvo = naGrade(e);
    if (!alvo) return;
    const sob = oQueEstaSob(alvo);
    if (sob) {
      setQual(sob.peca);
      if (sob.parte === "no") setNoAtivo(sob.no);
      lembrar();
      pegando.current = sob;
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    // Fora de nó e de alça: só escolhe a peça, se clicou perto do traço de uma.
    const noTraco = noTracoSob(alvo);
    if (noTraco) {
      setQual(noTraco.peca);
      setNoAtivo(null);
    }
  };

  const aoMover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pega = pegando.current;
    if (!pega) return;
    const alvo = naGrade(e);
    if (!alvo) return;
    setEdicao((antes) => antes.map((nos, p) => {
      if (p !== pega.peca) return nos;
      return nos.map((n, i) => {
        if (i !== pega.no) return n;
        if (pega.parte === "no") {
          // O nó leva as alças junto: sem isso, mover um nó deformaria as duas
          // curvas vizinhas em vez de arrastar o trecho inteiro.
          const dx = alvo.x - n.x;
          const dy = alvo.y - n.y;
          return {
            ...n,
            x: alvo.x,
            y: alvo.y,
            entrada: { x: n.entrada.x + dx, y: n.entrada.y + dy },
            saida: { x: n.saida.x + dx, y: n.saida.y + dy },
          };
        }
        if (pega.parte === "entrada") {
          // Nó de curva mantém as duas alças alinhadas (a curva passa lisa por
          // ele); nó de CANTO não, senão o bico se perderia ao mexer num lado.
          const saida = n.canto ? n.saida : { x: 2 * n.x - alvo.x, y: 2 * n.y - alvo.y };
          return { ...n, entrada: { x: alvo.x, y: alvo.y }, saida };
        }
        const entradaNova = n.canto ? n.entrada : { x: 2 * n.x - alvo.x, y: 2 * n.y - alvo.y };
        return { ...n, saida: { x: alvo.x, y: alvo.y }, entrada: entradaNova };
      });
    }));
  };

  const aoSoltar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pegando.current) {
      pegando.current = null;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    }
  };

  /**
   * Apaga um nó.
   *
   * Num lugar só porque há dois caminhos até aqui — a tecla Delete e os dois
   * cliques —, e os dois precisam do mesmo piso de três nós: com dois, não
   * existe contorno para fechar.
   */
  const apagarNo = useCallback((peca: number, no: number) => {
    const contorno = edicao[peca];
    if (!contorno || contorno.length <= 3) {
      setErro("A peça ficaria com menos de três nós; não dá para apagar mais.");
      return;
    }
    lembrar();
    setNoAtivo(null);
    setEdicao((antes) => antes.map((c, p) => (p === peca ? c.filter((_, i) => i !== no) : c)));
  }, [edicao, lembrar]);

  /**
   * Dois cliques: em cima de um nó, apaga; em cima do traço, põe um nó novo
   * ali, sem mudar o desenho (ver `dividirCurva`).
   */
  const aoDobrarClique = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const alvo = naGrade(e);
    if (!alvo) return;
    const sob = oQueEstaSob(alvo);
    if (sob && sob.parte === "no") {
      apagarNo(sob.peca, sob.no);
      return;
    }
    const noTraco = noTracoSob(alvo);
    if (!noTraco) return;
    lembrar();
    setEdicao((antes) => antes.map((nos, p) => {
      if (p !== noTraco.peca) return nos;
      const a = nos[noTraco.no]!;
      const b = nos[(noTraco.no + 1) % nos.length]!;
      const corte = dividirCurva(a, a.saida, b.entrada, b, noTraco.t);
      const saida = nos.slice();
      saida[noTraco.no] = { ...a, saida: corte.saidaDoAnterior };
      const seguinte = (noTraco.no + 1) % nos.length;
      saida[seguinte] = { ...b, entrada: corte.entradaDoSeguinte };
      saida.splice(noTraco.no + 1, 0, {
        x: corte.no.x, y: corte.no.y,
        entrada: corte.entradaDoNovo, saida: corte.saidaDoNovo,
        canto: false,
      });
      return saida;
    }));
    setNoAtivo(noTraco.no + 1);
  };

  /**
   * Zoom pela roda, ancorado no ponteiro.
   *
   * Ancorar importa mais do que parece: sem isso, aproximar joga o pedaço que
   * se está olhando para fora do quadro, e a pessoa passa o tempo procurando
   * de novo onde estava. Com a âncora, o ponto sob o cursor fica parado.
   *
   * `passive: false` e `preventDefault` porque senão a página inteira rola
   * junto — o React não deixa marcar isso pelo `onWheel`, daí o ouvinte na
   * mão, no `useEffect`.
   */
  useEffect(() => {
    const caixa = moldura.current;
    if (!caixa) return;
    const aoRodar = (e: WheelEvent) => {
      if (!tela.current) return;
      e.preventDefault();
      const antes = caixa.getBoundingClientRect();
      const px = (caixa.scrollLeft + (e.clientX - antes.left)) / Math.max(1, tela.current.clientWidth);
      const py = (caixa.scrollTop + (e.clientY - antes.top)) / Math.max(1, tela.current.clientHeight);
      setZoom((z) => {
        const novo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        // O ajuste da rolagem sai depois do repintar, quando o canvas já tem o
        // tamanho novo; antes disso não há para onde rolar.
        requestAnimationFrame(() => {
          if (!tela.current) return;
          caixa.scrollLeft = px * tela.current.clientWidth - (e.clientX - antes.left);
          caixa.scrollTop = py * tela.current.clientHeight - (e.clientY - antes.top);
        });
        return novo;
      });
    };
    caixa.addEventListener("wheel", aoRodar, { passive: false });
    return () => caixa.removeEventListener("wheel", aoRodar);
  }, []);

  /*
   * O teclado: Ctrl+Z desfaz, Delete e Backspace apagam o nó marcado.
   *
   * A conferência do campo em foco não é frescura: o Backspace é a tecla que a
   * pessoa usa para corrigir a MEDIDA, e sem isto apagar um dígito errado
   * apagaria também um nó do molde — um estrago silencioso, porque o traço
   * muda longe de onde ela está olhando.
   */
  useEffect(() => {
    const digitando = () => {
      const foco = document.activeElement;
      if (!foco) return false;
      const etiqueta = foco.tagName;
      return etiqueta === "INPUT" || etiqueta === "TEXTAREA" || etiqueta === "SELECT"
        || (foco as HTMLElement).isContentEditable;
    };
    const ouvir = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        voltarUmPasso();
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (digitando()) return;
      if (noAtivo === null) return;
      e.preventDefault();
      apagarNo(qual, noAtivo);
    };
    window.addEventListener("keydown", ouvir);
    return () => window.removeEventListener("keydown", ouvir);
  }, [voltarUmPasso, apagarNo, qual, noAtivo]);

  // A prévia: a foto por baixo, os riscos por cima, os nós da peça escolhida
  // por cima de tudo. É a conferência que a pessoa faz antes de confiar em
  // qualquer medida — se um traço não acompanhou a peça, nenhum centímetro
  // depois conserta isso.
  useEffect(() => {
    const canvas = tela.current;
    if (!canvas || !imagem) return;
    const largura = imagem.naturalWidth || imagem.width;
    const altura = imagem.naturalHeight || imagem.height;
    const escala = Math.min(1, 1400 / Math.max(largura, altura));
    canvas.width = Math.round(largura * escala);
    canvas.height = Math.round(altura * escala);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height);
    if (!achado || edicao.length === 0) return;

    const px = canvas.width / achado.cols;
    const py = canvas.height / achado.rows;
    const emTela = (p: Ponto) => ({ x: p.x * px, y: p.y * py });
    ctx.lineJoin = "round";

    edicao.forEach((nos, i) => {
      ctx.beginPath();
      const zero = emTela(nos[0]!);
      ctx.moveTo(zero.x, zero.y);
      for (let k = 0; k < nos.length; k++) {
        const a = nos[k]!;
        const b = nos[(k + 1) % nos.length]!;
        const c1 = emTela(a.saida);
        const c2 = emTela(b.entrada);
        const fim = emTela(b);
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, fim.x, fim.y);
      }
      ctx.closePath();
      // Duas passadas: uma grossa e escura por baixo, uma fina e colorida por
      // cima. O risco precisa aparecer tanto sobre papel claro quanto sobre a
      // esteira escura, e uma cor só some numa das duas.
      ctx.strokeStyle = "rgba(10, 14, 16, 0.85)";
      ctx.lineWidth = i === qual ? 6 : 4;
      ctx.stroke();
      ctx.strokeStyle = corDa(i);
      ctx.lineWidth = i === qual ? 3.5 : 2;
      ctx.stroke();

      const caixa = caixaDo(achatarCurvas(nos));
      const rotulo = String(i + 1);
      const x = caixa.minX * px + 6;
      const y = caixa.minY * py + 20;
      ctx.font = "bold 16px ui-sans-serif, system-ui, sans-serif";
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "rgba(10, 14, 16, 0.9)";
      ctx.strokeText(rotulo, x, y);
      ctx.fillStyle = corDa(i);
      ctx.fillText(rotulo, x, y);
    });

    // Os nós só da peça escolhida. Desenhar os de todas encheria a foto de
    // bolinha e esconderia justamente o traço que se quer conferir.
    const escolhida = edicao[qual];
    if (!escolhida) return;

    // As alças, só do nó ativo, e por baixo dos nós.
    if (noAtivo !== null && escolhida[noAtivo]) {
      const n = escolhida[noAtivo]!;
      const centro = emTela(n);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 1.5;
      for (const parte of ["entrada", "saida"] as const) {
        const a = emTela(n[parte]);
        ctx.beginPath();
        ctx.moveTo(centro.x, centro.y);
        ctx.lineTo(a.x, a.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(a.x, a.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = "#4d9dff";
        ctx.fill();
        ctx.strokeStyle = "rgba(10, 14, 16, 0.9)";
        ctx.stroke();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      }
    }

    escolhida.forEach((n, i) => {
      const c = emTela(n);
      const marcado = i === noAtivo;
      // O nó marcado cresce, muda de cor e ganha um halo. Três sinais em vez de
      // um porque ele é quem o Delete apaga: dá para ver o que vai embora antes
      // de apertar a tecla.
      if (marcado) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, 9, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 122, 26, 0.25)";
        ctx.fill();
      }
      const raio = marcado ? 5.2 : 3.6;
      ctx.fillStyle = marcado ? "#ff7a1a" : "#ffffff";
      ctx.strokeStyle = marcado ? "#ffffff" : "rgba(10, 14, 16, 0.95)";
      ctx.lineWidth = marcado ? 2 : 1.5;
      if (n.canto) {
        // Canto é quadrado, curva é redondo. Ver o cabeçalho: canto é ponto de
        // costura, e tem que dar para reconhecer sem clicar.
        ctx.beginPath();
        ctx.rect(c.x - raio, c.y - raio, raio * 2, raio * 2);
      } else {
        ctx.beginPath();
        ctx.arc(c.x, c.y, raio, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();
    });
  }, [imagem, achado, edicao, qual, noAtivo]);

  /** Grava um blob com o nome pedido. */
  const gravar = (blob: Blob, extensao: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nome || "molde"}-risco.${extensao}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const baixarSvg = () => {
    if (!emCm) return;
    gravar(new Blob([svgDosRiscos(emCm, nome)], { type: "image/svg+xml" }), "svg");
  };

  /*
   * O PDF sai do servidor, com o `pdfkit` que já gera o do encaixe — ver o
   * cabeçalho de `servidor/risco-pdf.js`. Ele vem em TAMANHO REAL, para servir
   * de gabarito: uma página do tamanho do desenho, sem margem e sem ajuste.
   */
  const baixarPdf = async () => {
    if (!emCm) return;
    setGerandoPdf(true);
    setErro("");
    try {
      gravar(await riscoApi.pdf(nome, emCm.pecas), "pdf");
    } catch (e: any) {
      setErro(e?.message || "Não consegui gerar o PDF.");
    } finally {
      setGerandoPdf(false);
    }
  };

  /** Refaz a busca. Avisa antes, porque joga fora o ajuste manual. */
  const refazer = (erroCurva: number) => {
    if (!imagem) return;
    if (desfazer.length > 0 && !window.confirm(
      "Refazer o traço joga fora os nós que você ajustou à mão. Quer continuar?",
    )) return;
    setErroDeCurva(erroCurva);
    procurar(imagem, erroCurva);
  };

  const nosDaEscolhida = edicao[qual]?.length ?? 0;

  return (
    <>
      <div
        {...aoArrastar}
        className={`rounded-[12px] transition-colors ${
          arquivoEmCima ? "outline outline-2 outline-offset-2 outline-[var(--accent-line)]" : ""
        }`}
      >
      <Cartao
        titulo="Digitalizar molde"
        icone="icones.svg#scan-line"
        apoio="Mande a foto dos moldes na mesa; eu acho o risco de cada um. A medida você informa depois."
        acao={
          <button type="button" className="btn secondary" onClick={() => entrada.current?.click()}>
            <Icone referencia="icones.svg#image-plus" className="size-4" />
            Escolher imagem
          </button>
        }
      >
        <input
          ref={entrada}
          id="digitalizar-imagem"
          type="file"
          accept=".png,.bmp,.jpg,.jpeg,.webp,image/*"
          className="hidden"
          onChange={(e) => { abrir(e.target.files?.[0]); e.target.value = ""; }}
        />

        {!imagem && (
          <div
            onClick={() => entrada.current?.click()}
            className={`cursor-pointer rounded-[10px] border border-dashed p-6 text-center transition-colors ${
              arquivoEmCima ? "border-ambar bg-[var(--accent-soft)]" : "border-linha"
            }`}
          >
            <Icone referencia="icones.svg#scan-line" className="mx-auto size-8 text-tinta-apagada" />
            <p className="mt-2 mb-1 text-[0.9rem] font-semibold">
              {arquivoEmCima ? "Solte a foto aqui" : "Arraste a foto para cá, ou clique para escolher"}
            </p>
            <p className="m-0 text-[0.82rem] text-tinta-fraca">
              {FORMATOS_DE_IMAGEM}. Os moldes <strong>recortados</strong>, espalhados na mesa
              <strong> sem encostar um no outro</strong>, fotografados <strong>de cima</strong>.
              Tanto faz molde claro em mesa escura ou o contrário — o que importa é contrastar.
              Foto tirada de lado sai torta: esta tela ainda não corrige perspectiva.
            </p>
          </div>
        )}

        {erro && (
          <p className="m-0 flex items-start gap-2 text-[0.85rem] text-alerta">
            <Icone referencia="icones.svg#triangle-alert" className="mt-0.5 size-4 shrink-0" />
            {erro}
          </p>
        )}

        {imagem && (
          <div className="flex flex-col gap-3">
            <div
              ref={moldura}
              className="max-h-[70vh] overflow-auto rounded-[10px] border border-linha bg-painel-suave"
            >
              <canvas
                ref={tela}
                id="digitalizar-tela"
                className="block h-auto max-w-none touch-none select-none"
                style={{ width: `${zoom * 100}%`, cursor: edicao.length > 0 ? "crosshair" : "default" }}
                onPointerDown={aoApertar}
                onPointerMove={aoMover}
                onPointerUp={aoSoltar}
                onPointerCancel={aoSoltar}
                onDoubleClick={aoDobrarClique}
              />
            </div>

            {ocupado && <p className="m-0 text-[0.85rem] text-tinta-fraca">Procurando os riscos...</p>}

            {edicao.length > 0 && achado && (
              <>
                <p className="m-0 text-[0.85rem]">
                  Achei <strong className="text-ambar">{edicao.length}</strong>
                  {edicao.length === 1 ? " peça" : " peças"} na foto.
                </p>

                {achado.avisos.map((a: string) => (
                  <p key={a} className="m-0 flex items-start gap-2 text-[0.82rem] text-tinta-fraca">
                    <Icone referencia="icones.svg#triangle-alert" className="mt-0.5 size-3.5 shrink-0 text-ambar" />
                    {a}
                  </p>
                ))}

                {/* ------------------------------------------------ a edição */}
                <div className="rounded-[10px] border border-linha bg-painel-suave p-3">
                  <p className="mt-0 mb-1 text-[0.85rem] font-semibold">Ajustar o traço à mão</p>
                  <p className="mt-0 mb-2 text-[0.8rem] text-tinta-fraca">
                    A <strong>peça {qual + 1}</strong> tem {nosDaEscolhida} nós.{" "}
                    <strong>Arraste</strong> um nó para mover; clique nele e arraste as{" "}
                    <span className="text-[#4d9dff]">alças azuis</span> para mexer na curva.{" "}
                    <strong>Clique</strong> num nó para marcá-lo e aperte{" "}
                    <strong>Delete</strong> ou <strong>Backspace</strong> para apagar — ou{" "}
                    <strong>dois cliques</strong> em cima dele. Dois cliques no traço põem um nó
                    novo sem mudar o desenho. Nó <strong>redondo</strong> é curva,{" "}
                    <strong>quadrado</strong> é canto — e canto não arredonda ao mexer.{" "}
                    <strong>Roda do mouse</strong> aproxima onde o ponteiro está.
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button" className="btn secondary"
                      onClick={voltarUmPasso} disabled={desfazer.length === 0}
                    >
                      <Icone referencia="icones.svg#rotate-ccw" className="size-4" />
                      Desfazer {desfazer.length > 0 ? `(${desfazer.length})` : ""}
                    </button>
                    <label className="flex min-w-[180px] flex-1 items-center gap-2 text-[0.82rem] text-tinta-fraca">
                      <span className="shrink-0">Aproximar</span>
                      <input
                        type="range" min={ZOOM_MIN} max={ZOOM_MAX} step="0.25" value={zoom}
                        onChange={(e) => setZoom(Number(e.target.value))}
                        className="min-w-0 flex-1"
                      />
                      <span className="w-12 shrink-0 text-right font-mono">{zoom.toFixed(1)}x</span>
                    </label>
                  </div>
                </div>

                {/* Refaz a busca, então mora longe dos botões de edição e avisa
                    antes de jogar o ajuste fora. */}
                <label className="flex items-center gap-3 text-[0.82rem] text-tinta-fraca">
                  <span className="shrink-0">Nós por curva</span>
                  <input
                    type="range" min="0.3" max="4" step="0.1" value={erroDeCurva}
                    onChange={(e) => refazer(Number(e.target.value))}
                    className="min-w-0 flex-1"
                  />
                  <span className="w-20 shrink-0 text-right font-mono">
                    {erroDeCurva <= 0.8 ? "mais" : erroDeCurva >= 2.5 ? "menos" : "médio"}
                  </span>
                </label>

                {/* ------------------------------------------------ a medida */}
                <div className="rounded-[10px] border border-linha bg-painel-suave p-3">
                  <p className="mt-0 mb-1 text-[0.85rem] font-semibold">
                    Meça UMA peça com a fita e diga quanto deu
                  </p>
                  <p className="mt-0 mb-2 text-[0.8rem] text-tinta-fraca">
                    A foto inteira tem uma escala só, então uma medida basta: as outras peças saem
                    junto. Convém medir a maior — erro de meio centímetro pesa menos nela.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={qual}
                      onChange={(e) => { setQual(Number(e.target.value)); setNoAtivo(null); }}
                      className="w-auto!"
                      aria-label="Qual peça você mediu"
                    >
                      {edicao.map((_, i) => (
                        <option key={i} value={i}>Peça {i + 1}</option>
                      ))}
                    </select>
                    <select
                      value={lado}
                      onChange={(e) => setLado(e.target.value as Lado)}
                      className="w-auto!"
                      aria-label="Qual lado você mediu"
                    >
                      <option value="altura">altura</option>
                      <option value="largura">largura</option>
                    </select>
                    <input
                      type="text" inputMode="decimal" value={medida} placeholder="0,0"
                      onChange={(e) => setMedida(e.target.value)}
                      className="w-24!" aria-label="Medida em centímetros"
                    />
                    <span className="text-[0.85rem] text-tinta-fraca">cm</span>
                  </div>

                  {emCm ? (
                    <ul className="mt-2.5 mb-0 grid list-none gap-1 p-0 text-[0.82rem] sm:grid-cols-2">
                      {emCm.pecas.map((p: any, i: number) => (
                        <li key={i} className="flex items-center gap-2">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ background: corDa(i) }}
                          />
                          <span className={i === qual ? "font-semibold text-ambar" : ""}>
                            Peça {i + 1}: {formatarCm(p.largura)} × {formatarCm(p.altura)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2.5 mb-0 text-[0.82rem] text-tinta-fraca">
                      Sem essa medida os riscos não têm tamanho — a foto sozinha não diz se o
                      molde tem 60 cm ou 6 cm.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn primary" onClick={baixarPdf} disabled={!emCm || gerandoPdf}>
                    <Icone referencia="icones.svg#download" className="size-4" />
                    {gerandoPdf ? "Gerando o PDF..." : "Baixar em PDF"}
                  </button>
                  <button type="button" className="btn secondary" onClick={baixarSvg} disabled={!emCm}>
                    <Icone referencia="icones.svg#download" className="size-4" />
                    Baixar em SVG
                  </button>
                </div>

                <p className="m-0 text-[0.8rem] text-tinta-fraca">
                  Os dois saem medidos em centímetros, com uma peça por contorno e as curvas como
                  curvas. O <strong>PDF</strong> vem em tamanho real, para imprimir e usar de
                  gabarito — mande em 100% no diálogo de impressão, senão o visualizador reduz para
                  caber na folha. O <strong>SVG</strong> é para abrir no CorelDRAW ou no Illustrator.
                </p>
              </>
            )}
          </div>
        )}
      </Cartao>
      </div>
    </>
  );
}
