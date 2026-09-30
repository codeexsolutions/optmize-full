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
import { Cartao } from "../casca/Cartao";
import { Icone } from "../casca/Icone";
import { carregarImagem, lerComoDataURL } from "../utils/arquivoDeImagem";
import { formatarCm } from "../utils/numero";
import { aliviarContorno, contornosDasManchas } from "../motores/moldes";
import { achatarCurvas } from "../motores/ajusteDeCurvas";
import { moldesApi } from "../api/moldes";
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
const PEGA = 10;

const ZOOM_MIN = 1;
const ZOOM_MAX = 12;

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
  const [criando, setCriando] = useState(false);
  /** Um arquivo sendo arrastado por cima do cartão. */
  const [arquivoEmCima, setArquivoEmCima] = useState(false);

  const entrada = useRef<HTMLInputElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const moldura = useRef<HTMLDivElement>(null);

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
    if (editor.apertar(alvo, raio, e.shiftKey)) e.currentTarget.setPointerCapture(e.pointerId);
  };

  const aoMover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const alvo = naGrade(e);
    if (alvo) editor.mover(alvo);
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
  }, []);

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

    desenharNos(ctx, escolhida, editor.selecionados, emTela);
    if (editor.retangulo) desenharRetangulo(ctx, editor.retangulo.de, editor.retangulo.ate, emTela);
  }, [imagem, achado, edicao, qual, editor.selecionados, editor.retangulo]);

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
                    A <strong>peça {qual + 1}</strong> tem {nosDaEscolhida} nós. É o editor do Corel:{" "}
                    <strong>clique</strong> num nó para selecionar, <strong>Shift</strong> para somar,{" "}
                    <strong>arraste numa área vazia</strong> para selecionar pelo retângulo; arraste os
                    nós, as <span className="text-[#4d9dff]">alças azuis</span> ou o próprio{" "}
                    <strong>traço</strong> para dobrar a curva; <strong>setas</strong> empurram (Shift, dez vezes
                    mais); <strong>Delete</strong> apaga; <strong>dois cliques</strong> no traço põem um nó.
                    Nó <strong>redondo</strong> é curva, <strong>quadrado</strong> é canto.{" "}
                    <strong>Roda do mouse</strong> aproxima onde o ponteiro está.
                  </p>
                  <div className="mb-2 overflow-hidden rounded-[8px] border border-linha bg-painel">
                    <BarraDosNos editor={editor} />
                  </div>

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

                {/* ------------------------------------------------ as medidas */}
                <div className="rounded-[10px] border border-linha bg-painel-suave p-3">
                  <p className="mt-0 mb-1 text-[0.85rem] font-semibold">
                    Meça as peças com a fita e diga quanto deu cada uma
                  </p>
                  <p className="mt-0 mb-2 text-[0.8rem] text-tinta-fraca">
                    Cada peça medida fica com a sua medida. A que ficar sem medida segue a média das
                    medidas — numa foto tirada reta de cima, medir uma já basta.
                  </p>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[0.82rem]">
                    {edicao.map((_, i) => {
                      const m = medidas[i] ?? MEDIDA_VAZIA;
                      const p = emCm?.pecas[i];
                      const escolher = () => setQual(i);
                      return (
                        <li
                          key={i}
                          className={`flex flex-wrap items-center gap-2 rounded-[8px] px-1.5 py-1 ${i === qual ? "bg-[var(--accent-soft)]" : ""}`}
                        >
                          <button type="button" className="flex items-center gap-2" onClick={escolher} title="Ver esta peça na foto">
                            <span className="size-2.5 shrink-0 rounded-full" style={{ background: corDa(i) }} />
                            <span className={i === qual ? "font-semibold text-ambar" : ""}>Peça {i + 1}</span>
                          </button>
                          <select
                            value={m.lado}
                            onChange={(e) => mudarMedida(i, { lado: e.target.value as Lado })}
                            onFocus={escolher}
                            className="w-auto!"
                            aria-label={`Lado medido da peça ${i + 1}`}
                          >
                            <option value="altura">altura</option>
                            <option value="largura">largura</option>
                          </select>
                          <input
                            type="text" inputMode="decimal" value={m.texto} placeholder="0,0"
                            onChange={(e) => mudarMedida(i, { texto: e.target.value })}
                            onFocus={escolher}
                            className="w-20!" aria-label={`Medida da peça ${i + 1} em centímetros`}
                            aria-invalid={m.texto.trim() !== "" && lerCm(m.texto) === null}
                          />
                          <span className="text-tinta-fraca">cm</span>
                          {p && (
                            <span className={p.medida ? "" : "text-tinta-fraca"}>
                              → {formatarCm(p.largura)} × {formatarCm(p.altura)}{p.medida ? "" : " (pela média)"}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  {emCm && emCm.discordantes.length > 0 && (() => {
                    // Numa foto só, as escalas batem: medida que foge é número
                    // errado, ou altura no lugar da largura. Ver `riscosEmCm`.
                    const nums = emCm.discordantes.map((i: number) => i + 1);
                    const medidasContadas = emCm.pecas.filter((p: any) => p.medida).length;
                    const quais = nums.length === 1
                      ? `A medida da peça ${nums[0]} não bate com as outras`
                      : `As medidas das peças ${nums.slice(0, -1).join(", ")} e ${nums[nums.length - 1]} não batem ${nums.length === medidasContadas ? "entre si" : "com as outras"}`;
                    return (
                      <p className="mt-2 mb-0 text-[0.82rem] text-ambar" role="status">
                        {quais} — mais de 10% de diferença na escala. Confira o número e se é altura ou largura.
                      </p>
                    );
                  })()}
                  {!emCm && (
                    <p className="mt-2.5 mb-0 text-[0.82rem] text-tinta-fraca">
                      Sem medida os riscos não têm tamanho — a foto sozinha não diz se o molde tem 60 cm
                      ou 6 cm.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-[0.85rem]">
                    <span className="shrink-0">Nome do molde</span>
                    <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} className="w-[240px]!" />
                  </label>
                  <button type="button" className="btn primary" onClick={() => void continuar()} disabled={!emCm || criando}>
                    <Icone referencia="icones.svg#arrow-right" className="size-4" />
                    {criando ? "Criando o molde…" : "Continuar para a montagem"}
                  </button>
                </div>

                <p className="m-0 text-[0.8rem] text-tinta-fraca">
                  O molde vai para a estante como <strong>rascunho</strong>, e a Montagem abre em cima
                  dele: lá cada peça ganha nome, pique, fio e margem, e de lá saem o PDF, o SVG e o
                  Encaixe.
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
