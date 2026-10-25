/**
 * ===========================================================================
 * DIGITALIZAR — a foto da mesa virando risco, e o risco na mão da pessoa
 * ===========================================================================
 *
 * Larga-se a foto dos moldes na mesa (PNG, BMP, JPG), o sistema acha a volta
 * por fora de CADA peça e desenha os riscos em cima da foto. A pessoa corrige
 * o que quiser — com o editor estilo Corel, o mesmo da Montagem —, mede as peças com a fita e
 * diz quanto deu cada uma. Cada peça medida fica com a sua medida; a que ficar
 * sem medida segue a média das medidas, então medir uma só ainda basta.
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
 * Esta tela não baixa arquivo. O risco medido vira um molde-RASCUNHO na
 * estante e a Montagem abre em cima dele (`telas/Montagem.tsx`): é lá que a
 * peça ganha papel, pique e margem, e é de lá que saem o PDF, o SVG e o
 * Encaixe. Baixar daqui entregava um risco sem nome nem pique, que alguém
 * tinha de marcar à mão no Corel e mandar de volta pela estante.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icone } from "../casca/Icone";
import { carregarImagem, lerComoDataURL } from "../utils/arquivoDeImagem";
import { prepararArteParaONavegador } from "../api/arte";
import { formatarCm } from "../utils/numero";
import { aliviarContorno, contornosDasManchas } from "../motores/moldes";
import { achatarCurvas } from "../motores/ajusteDeCurvas";
import { moldesApi } from "../api/moldes";
import { previaDoExemplo } from "./moldes/exemplo";
import { marcacoesPadrao, pecaParaGravar } from "../motores/montagem";
import {
  CELULAS_NO_LADO_MAIOR, ERRO_DE_CURVA_PADRAO, FORMATOS_DE_IMAGEM, areaDo, caixaDo,
  ehImagemDeMolde, riscosDosPixels, riscosEmCm,
} from "../motores/moldeDaImagem";
import { useErroEmAlerta } from "../casca/Alerta";
import {
  apagarNos as apagarNosDoRisco, clonarNos, pegaSob, porNosNoTraco, reduzirNos, tracoSob,
} from "../motores/edicaoDeNos";
import { desenharNos, desenharRetangulo, tracarCaminho } from "./risco/desenhoDeNos";
import { BarraDosNos } from "./risco/BarraDosNos";
import { JanelaDeAtalhos } from "./risco/JanelaDeAtalhos";
import { useEditorDeNos, type AlvoDoEditor } from "./risco/useEditorDeNos";

type Lado = "largura" | "altura";
/** A medida de uma peça como a pessoa digitou: o lado e o texto do campo. */
type MedidaDaPeca = { lado: Lado; texto: string };
const MEDIDA_VAZIA: MedidaDaPeca = { lado: "altura", texto: "" };

/** O número do campo de medida (vírgula vale ponto); `null` se não é uma medida. */
function lerCm(texto: string): number | null {
  const n = Number(texto.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}
type Ponto = { x: number; y: number };
type No = { x: number; y: number; entrada: Ponto; saida: Ponto; canto?: boolean; retaDepois?: boolean };

/** As cores dos riscos na prévia, para dar para falar "a peça verde". */
const CORES = ["#ff7a1a", "#25c2a0", "#4d9dff", "#f45d9c", "#f5c518", "#9d7bff"];
const corDa = (i: number): string => CORES[i % CORES.length] || "#ff7a1a";

/** Quantos passos de desfazer a tela guarda. */
const PASSOS_DE_DESFAZER = 40;

/** Raio de pega, em pixels da tela. */
/** Raio de pega, em pixels da tela (era 10: o nó era difícil de acertar). */
const PEGA = 16;

const ZOOM_MIN = 1;
const ZOOM_MAX = 12;

/**
 * UMA FOTO DE EXEMPLO, desenhada aqui: as peças da camiseta de exemplo
 * (`moldes/exemplo.ts`, tamanho M) em papel claro sobre mesa escura, cada uma
 * levemente torta, com um granulado de foto. É para quem abre a tela sem foto
 * nenhuma ver o caminho inteiro — achar os riscos, informar a medida, mandar
 * para a Montagem.
 */
async function fotoDeExemplo(): Promise<File> {
  const ESCALA = 9; // pixels por cm
  // Sem a gola: tira de 4 cm o digitalizador descarta como fina, e o exemplo
  // começaria com um aviso.
  const pecas = previaDoExemplo().filter((p) => p.papel !== "gola");
  const lugares = [
    { x: 6, y: 6, giro: -3 }, { x: 66, y: 8, giro: 2 },
    { x: 126, y: 10, giro: -6 }, { x: 128, y: 52, giro: 4 },
  ];
  const canvas = document.createElement("canvas");
  canvas.width = 180 * ESCALA;
  canvas.height = 92 * ESCALA;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#2b2f33";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  pecas.forEach((p, i) => {
    const lugar = lugares[i] || { x: 6 + i * 40, y: 50, giro: 0 };
    ctx.save();
    ctx.translate((lugar.x + p.largura / 2) * ESCALA, (lugar.y + p.altura / 2) * ESCALA);
    ctx.rotate((lugar.giro * Math.PI) / 180);
    ctx.beginPath();
    p.contorno.forEach(([x, y], k) => {
      const px = (x - p.largura / 2) * ESCALA;
      const py = (y - p.altura / 2) * ESCALA;
      if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = "#ecebe4";
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();
  });
  // O granulado: sem ele a "foto" é limpa demais para parecer uma.
  const dados = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = dados.data;
  for (let i = 0; i < px.length; i += 4) {
    const ruido = (Math.random() - 0.5) * 14;
    px[i] = (px[i] ?? 0) + ruido;
    px[i + 1] = (px[i + 1] ?? 0) + ruido;
    px[i + 2] = (px[i + 2] ?? 0) + ruido;
  }
  ctx.putImageData(dados, 0, 0);
  const blob = await new Promise<Blob>((pronto, falhou) =>
    canvas.toBlob((b) => (b ? pronto(b) : falhou(new Error("não deu para montar a foto de exemplo"))), "image/png"));
  return new File([blob], "moldes-de-exemplo.png", { type: "image/png" });
}

export function Digitalizar() {
  const navegar = useNavigate();
  const [nome, setNome] = useState("");
  const [imagem, setImagem] = useState<HTMLImageElement | null>(null);
  const [achado, setAchado] = useState<any>(null);
  const setErro = useErroEmAlerta("Não deu certo no Vetor");
  const [ocupado, setOcupado] = useState(false);
  const [erroDeCurva, setErroDeCurva] = useState(ERRO_DE_CURVA_PADRAO);

  /** Os contornos como a pessoa os deixou. Ver o cabeçalho. */
  const [edicao, setEdicao] = useState<No[][]>([]);
  const [desfazer, setDesfazer] = useState<No[][][]>([]);

  /** A medida de cada peça, na ordem de `edicao`. Peça sem entrada = sem medida. */
  const [medidas, setMedidas] = useState<MedidaDaPeca[]>([]);
  /** A peça escolhida: destacada na foto, com os nós à mostra. */
  const [qual, setQual] = useState(0);
  const [zoom, setZoom] = useState(1);
  /** O cursor da foto: o editor diz o que está debaixo do ponteiro (ver `passar`). */
  const [cursor, setCursor] = useState<"move" | "copy" | "crosshair">("crosshair");
  const [criando, setCriando] = useState(false);
  /** Um arquivo sendo arrastado por cima do cartão. */
  const [arquivoEmCima, setArquivoEmCima] = useState(false);

  const entrada = useRef<HTMLInputElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const moldura = useRef<HTMLDivElement>(null);

  /*
   * A FOTO CABE INTEIRA NA ÁREA, nos dois sentidos, no zoom de 100%: a largura
   * em que ela cabe sai do tamanho da área (menos a folga de 16 px de cada
   * lado) e da proporção da foto. O zoom multiplica essa largura. Era sempre a
   * largura da área inteira, e foto em pé passava da tela por baixo.
   */
  const [larguraNaTela, setLarguraNaTela] = useState(0);
  useEffect(() => {
    const caixa = moldura.current;
    if (!caixa || !imagem) return;
    const proporcao = (imagem.naturalWidth || imagem.width) / Math.max(1, imagem.naturalHeight || imagem.height);
    const medir = () => {
      const w = Math.max(50, caixa.clientWidth - 32);
      const h = Math.max(50, caixa.clientHeight - 32);
      const cabe = Math.floor(Math.min(w, h * proporcao));
      setLarguraNaTela((antes) => (Math.abs(antes - cabe) > 1 ? cabe : antes));
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(caixa);
    return () => observador.disconnect();
  }, [imagem]);

  // A caixa e a área saem da curva ACHATADA: mover uma alça muda a barriga da
  // curva sem mexer em nó nenhum, e a medida da peça tem que acompanhar isso.
  const pecas = useMemo(
    () => edicao.map((nos) => {
      const achatado = achatarCurvas(nos);
      return { nos, caixa: caixaDo(achatado), area: areaDo(achatado) };
    }),
    [edicao],
  );

  const emCm = pecas.length > 0
    ? riscosEmCm(pecas, pecas.map((_, i) => {
      const m = medidas[i];
      const cm = m ? lerCm(m.texto) : null;
      return m && cm !== null ? { lado: m.lado, cm } : null;
    }))
    : null;

  const mudarMedida = (i: number, parcial: Partial<MedidaDaPeca>) =>
    setMedidas((antes) => edicao.map((_, k) => (k === i ? { ...(antes[k] ?? MEDIDA_VAZIA), ...parcial } : antes[k] ?? MEDIDA_VAZIA)));

  const clonar = (fonte: No[][]): No[][] => fonte.map(clonarNos);

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

  /*
   * O editor estilo Corel na peça escolhida (`risco/useEditorDeNos.ts`). As
   * setas e o Reduzir andam em milímetros pela escala da peça — a medida dela,
   * ou a média (ver a medida por peça); sem medida nenhuma ainda, em células.
   */
  const escalaDaPeca: number | null = emCm?.pecas[qual]?.porCelula ?? null;
  const naEscolhida = (mudar: (nos: No[]) => No[]) =>
    setEdicao((antes) => antes.map((c, p) => (p === qual ? mudar(c) : c)));
  const alvoDoEditor: AlvoDoEditor = {
    nos: edicao[qual] ?? [],
    mudarNos: (mudar, lembrarAntes) => {
      if (lembrarAntes) lembrar();
      naEscolhida(mudar);
    },
    apagarNos: (indices) => {
      const r = apagarNosDoRisco(edicao[qual] ?? [], indices) as { erro: string } | { nos: No[] };
      if ("erro" in r) return r.erro;
      lembrar();
      naEscolhida(() => r.nos);
      return null;
    },
    porNos: (pontos) => {
      lembrar();
      naEscolhida((nos) => porNosNoTraco(nos, pontos));
    },
    retrato: () => edicao[qual] ?? [],
    reduzir: (retrato, indices, folga) => {
      const r = reduzirNos(retrato as No[], indices, folga, []) as { erro: string } | { nos: No[]; antes: number; depois: number };
      if ("erro" in r) return { erro: r.erro };
      return { antes: r.antes, depois: r.depois, aplicar: () => naEscolhida(() => r.nos) };
    },
    voltar: (retrato) => naEscolhida(() => retrato as No[]),
    lembrar,
    passos: escalaDaPeca ? { curto: 0.1 / escalaDaPeca, longo: 1 / escalaDaPeca } : { curto: 1, longo: 10 },
    folgaEmUnidades: (valor) => (escalaDaPeca ? valor / 10 / escalaDaPeca : valor),
    comMedida: escalaDaPeca !== null,
  };
  const editor = useEditorDeNos(alvoDoEditor, qual);
  const editorAtual = useRef(editor);
  editorAtual.current = editor;

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
          // O Refazer acha as mesmas peças, na mesma ordem: as medidas ficam. Se
          // o número de peças mudou, elas não valem mais para peça nenhuma.
          setMedidas((antes) => (antes.length === saida.riscos.length ? antes : []));
          setQual(0);
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
    setMedidas([]);
    setZoom(1);
    setNome(file.name.replace(/\.[^.]+$/, ""));
    try {
      // `lerComoDataURL` e não `URL.createObjectURL`: ver o cabeçalho de
      // `utils/arquivoDeImagem`. O endereço de objeto morre quando o `<input>`
      // é limpo logo depois da escolha, e esta tela segura a imagem enquanto
      // durar o ajuste — com ele, a prévia some no meio.
      // O TIFF (e o CMYK sem perfil) passa pelo servidor antes: o navegador
      // não abre um e pinta o outro errado. O resto segue intacto, sem ida ao
      // servidor (ver `api/arte.ts`).
      const preparada = await prepararArteParaONavegador(file);
      try {
        const img = await carregarImagem(await lerComoDataURL(preparada.file));
        setImagem(img);
        procurar(img, erroDeCurva);
      } catch {
        setErro(`Não consegui abrir "${file.name}"${preparada.erro ? `: ${preparada.erro}` : "."}`);
      }
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

  /** A peça (outra que não a escolhida) com nó ou traço debaixo do ponteiro. */
  const outraPecaSob = (alvo: Ponto, raio: number): number | null => {
    let melhor: number | null = null;
    let menor = Infinity;
    for (let p = 0; p < edicao.length; p++) {
      if (p === qual) continue;
      const nos = edicao[p]!;
      const sob = pegaSob(nos, alvo, raio, null) ?? tracoSob(nos, alvo, raio);
      if (sob && sob.distancia < menor) { menor = sob.distancia; melhor = p; }
    }
    return melhor;
  };

  /**
   * O aperto. A peça escolhida tem a vez (o editor decide: alça, nó, traço ou
   * retângulo); fora dela, um nó ou traço de outra peça troca de peça, e a
   * seleção começa de novo nela.
   */
  const aoApertar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const alvo = naGrade(e);
    if (!alvo) return;
    const raio = PEGA * gradePorPixel();
    const escolhida = edicao[qual] ?? [];
    if (!pegaSob(escolhida, alvo, raio, editor.selecionados) && !tracoSob(escolhida, alvo, raio)) {
      const outra = outraPecaSob(alvo, raio);
      if (outra !== null) { setQual(outra); return; }
    }
    if (editor.apertar(alvo, raio, e.shiftKey, e.altKey)) e.currentTarget.setPointerCapture(e.pointerId);
  };

  const aoMover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const alvo = naGrade(e);
    if (!alvo) return;
    editor.mover(alvo);
    // Sem apertar, o editor guarda o que está debaixo do ponteiro (o anel, o fantasma) e diz o cursor.
    setCursor(editor.passar(alvo, PEGA * gradePorPixel()));
  };

  const aoSoltar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    editor.soltar();
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  /** Dois cliques: num nó, apaga; no traço, põe um nó ali sem mudar o desenho. */
  const aoDobrarClique = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const alvo = naGrade(e);
    if (alvo) editor.dobrarClique(alvo, PEGA * gradePorPixel());
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
    // `imagem`: a área da foto só existe com uma foto aberta. Ligado só na
    // montagem da tela, o ouvinte nunca achava a área e a roda não aproximava.
  }, [imagem]);

  /*
   * O teclado: Ctrl+Z desfaz; Delete, setas, +, Ctrl+A e Esc são do editor
   * (`teclar`), que não mexe em nada enquanto se digita num campo — o
   * Backspace é a tecla que a pessoa usa para corrigir a MEDIDA, e sem isso
   * apagar um dígito errado apagaria também um nó do molde.
   */
  useEffect(() => {
    const ouvir = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        voltarUmPasso();
        return;
      }
      editorAtual.current.teclar(e);
    };
    window.addEventListener("keydown", ouvir);
    return () => window.removeEventListener("keydown", ouvir);
  }, [voltarUmPasso]);

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
      tracarCaminho(ctx, nos, emTela);
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
      ctx.font = '16px "Inter Variable", "Inter", "Segoe UI", sans-serif';
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

    desenharNos(ctx, escolhida, editor.selecionados, emTela, { sob: editor.sob, alcas: editor.alcas });
    if (editor.retangulo) desenharRetangulo(ctx, editor.retangulo.de, editor.retangulo.ate, emTela);
  }, [imagem, achado, edicao, qual, editor.selecionados, editor.retangulo, editor.sob, editor.alcas]);

  /*
   * O risco vira um molde-RASCUNHO na estante, e a tela passa para a
   * Montagem em cima dele. Rascunho porque as peças ainda não sabem o que são
   * — "outro", sem nome — e é lá que ganham papel, pique e margem. Ver
   * docs/superpowers/specs/2026-09-26-montagem-de-moldes-design.md.
   */
  const continuar = async () => {
    if (!emCm) return;
    setCriando(true);
    setErro("");
    try {
      const pecasProntas = emCm.pecas.map((p: any, i: number) => {
        const g = pecaParaGravar({
          tamanho: "base", papel: "outro", nome: null, quantidade: 1, furos: [], origem: "Digitalizar",
          largura: 0, altura: 0, contorno: [], nos: p.nos, marcacoes: marcacoesPadrao(p.nos),
        });
        if (!g.peca) throw new Error(`A peça ${i + 1}: ${g.erro}.`);
        return g.peca;
      });
      const { id } = await moldesApi.criar({
        nome: nome.trim() || "Molde digitalizado",
        observacoes: "Digitalizado de uma foto.",
        situacao: "rascunho",
        pecas: pecasProntas,
      });
      navegar(`/montagem?molde=${id}`);
    } catch (e: any) {
      setErro(e?.message || "Não consegui criar o molde.");
    } finally {
      setCriando(false);
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


  return (
    /*
     * A JANELA INTEIRA, no padrão dos Moldes: a barra própria em cima, parada,
     * sem o cabeçalho de página da casca (ver `bancada`, em casca/Casca.tsx),
     * e o trabalho rolando por baixo dela.
     */
    <div {...aoArrastar} className="flex h-full min-h-0 flex-col bg-fundo">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-linha px-5 py-3.5">
        <div className="min-w-0">
          <h1 className="m-0 font-titulo text-[1.25rem] leading-tight text-tinta">Digitalizar</h1>
          <p className="m-0 mt-0.5 text-[0.78rem] text-tinta-apagada">
            Mande a foto dos moldes na mesa; eu acho o risco de cada um. A medida você informa depois.
          </p>
        </div>
        {/* Sem foto, quem escolhe é a área grande de soltar; com foto, troca daqui. */}
        {imagem && (
          <button type="button" className="btn secondary btn-sm ml-auto" onClick={() => entrada.current?.click()}>
            <Icone referencia="icones.svg#image-plus" className="size-4" />
            Trocar a foto
          </button>
        )}
      </header>

      <div
        className={`flex min-h-0 flex-1 flex-col px-5 py-4 transition-colors ${imagem ? "overflow-hidden" : "overflow-y-auto"} ${
          arquivoEmCima ? "outline outline-2 -outline-offset-4 outline-[var(--accent-line)]" : ""
        }`}
      >
        <input
          ref={entrada}
          id="digitalizar-imagem"
          type="file"
          accept=".png,.bmp,.jpg,.jpeg,.webp,.tif,.tiff,image/*"
          className="hidden"
          onChange={(e) => { abrir(e.target.files?.[0]); e.target.value = ""; }}
        />

        {!imagem && (
          <div className="grid min-h-0 flex-1 gap-5 md:grid-cols-[1.25fr_1fr] md:items-stretch">
            <button
              type="button"
              onClick={() => entrada.current?.click()}
              className={`group flex h-full min-h-[260px] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
                arquivoEmCima
                  ? "border-ambar bg-[var(--accent-soft)]"
                  : "border-linha bg-painel-suave hover:border-[var(--accent-line)]"
              }`}
            >
              <span className="grid size-14 place-items-center rounded-2xl bg-[var(--accent-soft)] text-ambar transition-transform group-hover:scale-105">
                <Icone referencia="icones.svg#scan-line" className="size-7" />
              </span>
              <span className="text-[1rem] text-tinta">
                {arquivoEmCima ? "Solte a foto aqui" : "Arraste a foto dos moldes para cá"}
              </span>
              <span className="text-[0.8rem] text-tinta-apagada">ou clique para escolher · {FORMATOS_DE_IMAGEM}</span>
            </button>

            <div className="flex flex-col gap-3 self-start rounded-2xl border border-linha bg-painel p-5">
              <p className="m-0 text-[0.9rem] text-tinta">Para sair certo</p>
              {[
                { icone: "icones.svg#scissors", titulo: "Moldes recortados", texto: "Cada peça solta, de papel ou papelão." },
                { icone: "icones.svg#layout-grid", titulo: "Sem encostar um no outro", texto: "Espalhados na mesa, com espaço entre eles." },
                { icone: "icones.svg#camera", titulo: "Foto de cima, com contraste", texto: "Molde claro em mesa escura, ou o contrário. Foto de lado sai torta." },
              ].map((dica) => (
                <div key={dica.titulo} className="flex items-start gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-ambar">
                    <Icone referencia={dica.icone} className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-[0.84rem] text-tinta">{dica.titulo}</strong>
                    <span className="block text-[0.77rem] leading-relaxed text-tinta-apagada">{dica.texto}</span>
                  </span>
                </div>
              ))}
              <button
                type="button"
                className="btn secondary btn-sm mt-2 self-start"
                onClick={() => void fotoDeExemplo().then((foto) => abrir(foto))}
              >
                <Icone referencia="icones.svg#sparkles" className="size-4" />
                Testar com foto de exemplo
              </button>
            </div>
          </div>
        )}

        {imagem && (
          /*
           * A FOTO ABERTA É BANCADA: a foto à esquerda, do tamanho que sobrar da
           * janela, e um painel estreito à direita com o que se decide. A página
           * não rola — quem rola é a foto (no zoom) e o painel, cada um por si.
           */
          <div className="flex min-h-0 flex-1 gap-4">
            <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-linha bg-painel-suave">
              {edicao.length > 0 && achado && (
                <div className="shrink-0 bg-painel">
                  <BarraDosNos editor={editor} />
                  <JanelaDeAtalhos aberto={editor.atalhosAbertos} aoFechar={() => editor.abrirAtalhos(false)} comMontagem={false} />
                </div>
              )}

              <div ref={moldura} className="min-h-0 flex-1 overflow-auto">
                <div className="grid min-h-full min-w-full w-max place-items-center p-4">
                  <canvas
                    ref={tela}
                    id="digitalizar-tela"
                    className="block h-auto max-w-none touch-none select-none rounded-lg shadow-[var(--shadow-lift)]"
                    style={{
                      width: larguraNaTela ? `${Math.round(larguraNaTela * zoom)}px` : "100%",
                      cursor: edicao.length > 0 ? cursor : "default",
                    }}
                    onPointerLeave={() => editor.sair()}
                    onPointerDown={aoApertar}
                    onPointerMove={aoMover}
                    onPointerUp={aoSoltar}
                    onPointerCancel={aoSoltar}
                    onDoubleClick={aoDobrarClique}
                  />
                </div>
              </div>

              {ocupado && (
                <div className="absolute inset-0 grid place-items-center bg-[color-mix(in_srgb,var(--bg)_55%,transparent)]">
                  <span className="flex items-center gap-2 rounded-full bg-painel px-4 py-2 text-[0.85rem] text-tinta shadow-[var(--shadow-lift)]">
                    <Icone referencia="icones.svg#loader-circle" className="size-4 animate-spin text-ambar" />
                    Procurando os riscos…
                  </span>
                </div>
              )}

              {/* O zoom e o desfazer, flutuando sobre a foto. */}
              {edicao.length > 0 && achado && (
                <div className="pointer-events-none absolute right-3 bottom-3 left-3 flex items-end justify-between gap-2">
                  <button
                    type="button"
                    className="btn secondary btn-sm pointer-events-auto border border-linha bg-painel! shadow-[var(--shadow-lift)]"
                    onClick={voltarUmPasso} disabled={desfazer.length === 0}
                    title="Desfazer (Ctrl+Z)"
                  >
                    <Icone referencia="icones.svg#rotate-ccw" className="size-4" />
                    Desfazer
                  </button>
                  <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-linha bg-painel px-1.5 py-1 shadow-[var(--shadow-lift)]">
                    <button type="button" className="grid size-7 place-items-center rounded-full text-tinta-fraca hover:bg-[var(--surface-hover)] hover:text-tinta"
                      onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z / 1.25))} aria-label="Afastar">
                      <Icone referencia="icones.svg#minus" className="size-4" />
                    </button>
                    <button type="button" className="min-w-12 rounded-full px-1 font-mono text-[0.75rem] text-tinta-fraca hover:text-tinta"
                      onClick={() => setZoom(1)} title="Ver a foto inteira">
                      {Math.round(zoom * 100)}%
                    </button>
                    <button type="button" className="grid size-7 place-items-center rounded-full text-tinta-fraca hover:bg-[var(--surface-hover)] hover:text-tinta"
                      onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z * 1.25))} aria-label="Aproximar">
                      <Icone referencia="icones.svg#plus" className="size-4" />
                    </button>
                  </div>
                </div>
              )}
            </section>

            {edicao.length > 0 && achado && (
              <aside className="flex min-h-0 w-[320px] shrink-0 flex-col overflow-hidden rounded-2xl border border-linha bg-painel">
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <p className="m-0 text-[0.95rem] text-tinta">
                    <strong className="text-ambar">{edicao.length}</strong> {edicao.length === 1 ? "peça encontrada" : "peças encontradas"}
                  </p>
                  <p className="m-0 mt-0.5 text-[0.76rem] text-tinta-apagada">Clique numa peça na foto para ajustar o traço.</p>

                  {achado.avisos.map((a: string) => (
                    <p key={a} className="m-0 mt-2 flex items-start gap-2 text-[0.76rem] text-tinta-fraca">
                      <Icone referencia="icones.svg#triangle-alert" className="mt-0.5 size-3.5 shrink-0 text-ambar" />
                      {a}
                    </p>
                  ))}

                  <p className="m-0 mt-5 text-[0.84rem] text-tinta">Medidas</p>
                  <p className="m-0 mt-0.5 text-[0.74rem] text-tinta-apagada">Meça uma peça com a fita; as outras seguem a escala.</p>
                  <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
                    {edicao.map((_, i) => {
                      const m = medidas[i] ?? MEDIDA_VAZIA;
                      const p = emCm?.pecas[i];
                      const escolher = () => setQual(i);
                      return (
                        <li
                          key={i}
                          className={`rounded-xl border px-2.5 py-2 transition-colors ${i === qual ? "border-[var(--accent-line)] bg-[var(--accent-soft)]" : "border-linha"}`}
                        >
                          <button type="button" className="flex w-full items-center gap-2 text-left" onClick={escolher} title="Ver esta peça na foto">
                            <span className="size-2.5 shrink-0 rounded-full" style={{ background: corDa(i) }} />
                            <span className={`text-[0.82rem] ${i === qual ? "text-ambar" : "text-tinta"}`}>Peça {i + 1}</span>
                            {p && (
                              <span className="ml-auto font-mono text-[0.72rem] text-tinta-apagada">
                                {formatarCm(p.largura)} × {formatarCm(p.altura)}
                              </span>
                            )}
                          </button>
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <select
                              value={m.lado}
                              onChange={(e) => mudarMedida(i, { lado: e.target.value as Lado })}
                              onFocus={escolher}
                              className="m-0! w-auto! py-1! text-[0.78rem]!"
                              aria-label={`Lado medido da peça ${i + 1}`}
                            >
                              <option value="altura">altura</option>
                              <option value="largura">largura</option>
                            </select>
                            <input
                              type="text" inputMode="decimal" value={m.texto}
                              placeholder={p && !p.medida ? "pela escala" : "0,0"}
                              onChange={(e) => mudarMedida(i, { texto: e.target.value })}
                              onFocus={escolher}
                              className="m-0! min-w-0 flex-1 py-1! text-[0.8rem]!"
                              aria-label={`Medida da peça ${i + 1} em centímetros`}
                              aria-invalid={m.texto.trim() !== "" && lerCm(m.texto) === null}
                            />
                            <span className="text-[0.76rem] text-tinta-apagada">cm</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {emCm && emCm.discordantes.length > 0 && (
                    <p className="m-0 mt-2 flex items-start gap-2 text-[0.76rem] text-ambar" role="status">
                      <Icone referencia="icones.svg#triangle-alert" className="mt-0.5 size-3.5 shrink-0" />
                      {emCm.discordantes.length === 1
                        ? `A medida da peça ${emCm.discordantes[0] + 1} não bate com as outras.`
                        : `As medidas das peças ${emCm.discordantes.map((i: number) => i + 1).join(", ")} não batem.`}
                      {" "}Confira o número e se é altura ou largura.
                    </p>
                  )}

                  {/* Refaz a busca, então mora longe dos botões de edição. */}
                  <label className="mt-5 block">
                    <span className="flex items-center justify-between text-[0.84rem] text-tinta">
                      Detalhe do traço
                      <span className="text-[0.74rem] text-tinta-apagada">
                        {erroDeCurva <= 0.8 ? "mais nós" : erroDeCurva >= 2.5 ? "menos nós" : "médio"}
                      </span>
                    </span>
                    <input
                      type="range" min="0.3" max="4" step="0.1" value={erroDeCurva}
                      onChange={(e) => refazer(Number(e.target.value))}
                      className="mt-1 w-full"
                    />
                  </label>
                </div>

                <div className="shrink-0 border-t border-linha p-4">
                  <label className="block">
                    <span className="text-[0.78rem] text-tinta-fraca">Nome do molde</span>
                    <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} className="m-0! mt-1 w-full!" />
                  </label>
                  <button type="button" className="btn primary mt-3 w-full justify-center" onClick={() => void continuar()} disabled={!emCm || criando}
                    title={emCm ? "O molde vai para a estante como rascunho e abre na Montagem" : "Informe a medida de pelo menos uma peça"}>
                    <Icone referencia="icones.svg#arrow-right" className="size-4" />
                    {criando ? "Criando o molde…" : "Continuar para a montagem"}
                  </button>
                  {!emCm && <p className="m-0 mt-2 text-center text-[0.74rem] text-tinta-apagada">Falta a medida de uma peça.</p>}
                </div>
              </aside>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
