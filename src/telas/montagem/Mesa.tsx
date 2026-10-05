// src/telas/montagem/Mesa.tsx
/**
 * ===========================================================================
 * A MESA — onde a peça é marcada
 * ===========================================================================
 *
 * Um canvas em cima de uma grade de 1 cm. Cinco ferramentas, uma de cada vez:
 *
 *   NÓS      o editor estilo Corel, o mesmo do Digitalizar (`risco/useEditorDeNos.ts`);
 *   PIQUE    clique no traço põe, clique num pique tira;
 *   PONTO    clique dentro da peça põe, clique num ponto tira;
 *   FIO      arrasta pelo meio, gira pelas pontas;
 *   GRADUAR  clique num nó abre a regra dele (o bloco da graduação); nada se arrasta.
 *
 * Uma ferramenta por vez, e não um clique que adivinha, porque os alvos se
 * sobrepõem: pique mora em cima do traço, e o traço é onde o nó também mora.
 *
 * A VISTA NÃO SE MEXE DURANTE O ARRASTO. Ela se ajusta à caixa da peça, e a
 * caixa muda enquanto se arrasta um nó para fora dela; se a vista seguisse,
 * o nó fugiria de baixo do ponteiro. A vista é congelada no aperto e refeita
 * na soltura.
 *
 * A PEÇA ABRE INTEIRA (spec de 2026-10-05): o zoom 1 cabe na largura E na
 * altura da mesa — antes era só a largura, e peça comprida saía cortada. A
 * roda aproxima em volta do ponteiro; os botões do canto, o 0 (ajusta) e o Z
 * (aproxima nos nós selecionados) também; Espaço+arrastar ou o botão do meio
 * andam pela peça.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { achatarCurvas } from "../../motores/ajusteDeCurvas";
import { margemDeCostura } from "../../motores/margemDeCostura";
import { pegaSob, tracoSob } from "../../motores/edicaoDeNos";
import {
  PROFUNDIDADE_DO_PIQUE, arranjar, caixaDe, desenhoDaPeca, pecaParaGravar, posicaoDoPique,
} from "../../motores/montagem";
import { desenharNos, desenharPontosDeGraduacao, desenharRetangulo, tracarCaminho, type Ponto } from "../risco/desenhoDeNos";
import type { EditorDeNos } from "../risco/useEditorDeNos";
import { corDaPeca } from "../../utils/coresDePeca";
import type { PecaEmMontagem } from "./useMoldeEmMontagem";

export type Ferramenta = "nos" | "pique" | "ponto" | "fio" | "graduar";

/** Pixels de canvas por centímetro enquanto a largura da mesa não é conhecida. */
const PX_POR_CM = 24;
const LADO_MAXIMO_PX = 4096;
/** Raio de pega, em pixels da tela (era 10: o nó era difícil de acertar). */
const PEGA = 16;
const ZOOM_MIN = 1;
const ZOOM_MAX = 12;

interface Vista { minX: number; minY: number; largura: number; altura: number }

type Arrasto =
  | { tipo: "editor" }
  | { tipo: "fio"; modo: "mover" | "girar" }
  | { tipo: "mao"; x: number; y: number; esquerda: number; topo: number };

/** Uma tecla que é da mesa? Não dentro de um campo de texto nem com uma janela aberta na frente. */
function teclaDaMesa(e: KeyboardEvent): boolean {
  const foco = document.activeElement as HTMLElement | null;
  if (foco && (["INPUT", "TEXTAREA", "SELECT"].includes(foco.tagName) || foco.isContentEditable)) return false;
  if ([...document.querySelectorAll('[aria-modal="true"]')].some((el) => el.getClientRects().length > 0)) return false;
  return !e.ctrlKey && !e.metaKey && !e.altKey;
}

interface Props {
  pecas: PecaEmMontagem[];
  indice: number;
  ferramenta: Ferramenta;
  verTodas: boolean;
  noAtivo: number | null;
  /** Peças que não gravam (margem que se cruza), para pintar de vermelho. */
  comErro: number | null;
  aoMarcarNo: (no: number | null) => void;
  aoEscolherPeca: (indice: number) => void;
  aoLembrar: () => void;
  aoMudar: (mudar: (peca: PecaEmMontagem) => PecaEmMontagem, lembrarAntes: boolean) => void;
  /** Os outros tamanhos da peça, desenhados por baixo, cada um na sua cor; `tracejada` na prévia da graduação. */
  camadas?: { nos: PecaEmMontagem["nos"]; cor: string; tracejada?: boolean }[];
  /** Na ferramenta Graduar: os nós que têm regra (ganham o losango). */
  regras?: readonly number[];
  /** Na ferramenta Nós: o editor estilo Corel (a seleção e o que o ponteiro faz). */
  editor?: EditorDeNos;
}

/**
 * Par-ímpar (ray casting): `alvo` está dentro do polígono fechado `pontos`?
 *
 * A ferramenta PONTO só marca pence/bolso DENTRO da peça — um clique fora do
 * traço não é "sem querer perto da peça", é fora mesmo, e não deve criar
 * nada.
 */
function dentroDoPoligono(alvo: Ponto, pontos: Ponto[]): boolean {
  let dentro = false;
  for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i++) {
    const a = pontos[i]!;
    const b = pontos[j]!;
    const cruza = a.y > alvo.y !== b.y > alvo.y
      && alvo.x < ((b.x - a.x) * (alvo.y - a.y)) / (b.y - a.y) + a.x;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

/** O desenho de uma peça para o "ver todas": se a margem não fecha, sem margem (e em vermelho). */
function desenhoParaVer(p: PecaEmMontagem) {
  const g = pecaParaGravar(p);
  if (g.peca) return { desenho: desenhoDaPeca(g.peca), erro: false };
  const semMargem = pecaParaGravar({ ...p, marcacoes: { ...p.marcacoes, margem: 0 } });
  return { desenho: desenhoDaPeca(semMargem.peca), erro: true };
}

export function Mesa(props: Props) {
  const { pecas, indice, ferramenta, verTodas, noAtivo, comErro } = props;
  const camadas = useMemo(() => props.camadas ?? [], [props.camadas]);
  const regras = useMemo(() => props.regras ?? [], [props.regras]);
  const peca = pecas[indice];
  const tela = useRef<HTMLCanvasElement>(null);
  const moldura = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [moldura_, setMoldura] = useState({ largura: 0, altura: 0 });
  const [cursor, setCursor] = useState("crosshair");
  const [mao, setMao] = useState<"" | "pronta" | "andando">("");
  /** Depois de um Z: o ponto (em cm) que tem de ficar no meio da mesa quando o zoom novo assentar. */
  const centrarEm = useRef<Ponto | null>(null);
  const arrasto = useRef<Arrasto | null>(null);
  const vistaCongelada = useRef<Vista | null>(null);
  const ajusteCongelado = useRef<number | null>(null);
  const [, repintar] = useState(0);

  const risco = useMemo(() => (peca ? achatarCurvas(peca.nos) : []), [peca]);
  const corte = useMemo(
    () => (peca && peca.marcacoes.margem > 0 ? margemDeCostura(risco, peca.marcacoes.margem) : null),
    [peca, risco],
  );
  const todas = useMemo(() => {
    if (!verTodas) return [];
    const vistos = pecas.map(desenhoParaVer);
    const postos = arranjar(vistos.map((v) => v.desenho));
    return postos.map((d: any, i: number) => ({ ...d, erro: vistos[i]!.erro }));
  }, [verTodas, pecas]);

  const vistaCalculada = useMemo<Vista>(() => {
    if (verTodas) {
      let maxX = 0; let maxY = 0;
      for (const d of todas) { maxX = Math.max(maxX, d.emX + d.largura); maxY = Math.max(maxY, d.emY + d.altura); }
      return { minX: -3, minY: -3, largura: maxX + 6, altura: maxY + 6 };
    }
    // As camadas entram na vista: o G é maior que o M e sairia cortado.
    const c = caixaDe([...(corte ?? risco), ...camadas.flatMap((k) => achatarCurvas(k.nos))]);
    const folga = 3;
    return { minX: c.minX - folga, minY: c.minY - folga, largura: c.largura + 2 * folga, altura: c.altura + 2 * folga };
  }, [verTodas, todas, corte, risco, camadas]);
  const vista = vistaCongelada.current ?? vistaCalculada;
  // Um pixel do canvas = um pixel da tela. Com px/cm fixo, peça pequena saía
  // esticada (borrada, traço grosso) e peça grande espremida (nó e texto
  // minúsculos) — o CSS é que acertava a largura. O zoom 1 cabe na largura E na
  // altura da mesa: a peça inteira à vista.
  const ajusteCalculado = moldura_.largura > 0 && moldura_.altura > 0
    ? Math.min(moldura_.largura / Math.max(vista.largura, 1), moldura_.altura / Math.max(vista.altura, 1))
    : PX_POR_CM;
  // Congelado no arrasto, junto com a vista: se a mesa mudar de tamanho no meio do gesto (uma barra que
  // quebra de linha), a peça não encolhe debaixo do ponteiro.
  const ajusteNaMesa = ajusteCongelado.current ?? ajusteCalculado;
  const escalaTela = ajusteNaMesa * zoom;
  const escala = Math.min(escalaTela, LADO_MAXIMO_PX / Math.max(vista.largura, vista.altura, 1));

  // `noAtivo` chega do pai, e pode estar velho: um desfazer troca `peca.nos`
  // inteiro e não necessariamente encolhe até esbarrar no índice marcado, mas
  // quando esbarra, usar o índice cru faria `pegaSob`/`desenharNos` mirar um
  // nó que já é outro. `pegaSob` já é seguro sozinho (`nos[noAtivo]` vem
  // `undefined` e o `if` falha), mas sanitizar aqui também evita "quase pegar"
  // um nó errado nas alças por coincidência de índice.
  const noAtivoValido = peca && noAtivo !== null && noAtivo < peca.nos.length ? noAtivo : null;

  /** Onde o ponteiro caiu, em cm. */
  const noCm = (e: { clientX: number; clientY: number }): Ponto | null => {
    const r = tela.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    return {
      x: vista.minX + ((e.clientX - r.left) / r.width) * vista.largura,
      y: vista.minY + ((e.clientY - r.top) / r.height) * vista.altura,
    };
  };
  const raioCm = () => {
    const r = tela.current?.getBoundingClientRect();
    return r && r.width > 0 ? (PEGA * vista.largura) / r.width : 0.5;
  };

  // ------------------------------------------------------------ o desenho
  useEffect(() => {
    const canvas = tela.current;
    if (!canvas) return;
    canvas.width = Math.round(vista.largura * escala);
    canvas.height = Math.round(vista.altura * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const emTela = (p: Ponto): Ponto => ({ x: (p.x - vista.minX) * escala, y: (p.y - vista.minY) * escala });

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // A grade: 1 cm fraca, 10 cm mais forte. É a régua da mesa.
    for (let cm = Math.ceil(vista.minX); cm <= vista.minX + vista.largura; cm++) {
      ctx.strokeStyle = cm % 10 === 0 ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.05)";
      ctx.beginPath(); ctx.moveTo(emTela({ x: cm, y: 0 }).x, 0); ctx.lineTo(emTela({ x: cm, y: 0 }).x, canvas.height); ctx.stroke();
    }
    for (let cm = Math.ceil(vista.minY); cm <= vista.minY + vista.altura; cm++) {
      ctx.strokeStyle = cm % 10 === 0 ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.05)";
      ctx.beginPath(); ctx.moveTo(0, emTela({ x: 0, y: cm }).y); ctx.lineTo(canvas.width, emTela({ x: 0, y: cm }).y); ctx.stroke();
    }

    const pintarDesenho = (d: any, dx: number, dy: number, cor: string, grosso: boolean) => {
      const em = (p: Ponto) => emTela({ x: p.x + dx, y: p.y + dy });
      ctx.setLineDash([]);
      tracarCaminho(ctx, d.corte, em);
      ctx.strokeStyle = cor; ctx.lineWidth = grosso ? 3 : 2; ctx.stroke();
      if (d.costura) {
        ctx.setLineDash([6, 4]);
        tracarCaminho(ctx, d.costura, em);
        ctx.lineWidth = 1.5; ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2;
      for (const q of d.piques) { const a = em(q.de); const b = em(q.ate); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      for (const q of d.pontos) { const c = em(q); ctx.beginPath(); ctx.arc(c.x, c.y, 5, 0, Math.PI * 2); ctx.stroke(); }
      if (d.fio) {
        ctx.strokeStyle = "#4d9dff"; ctx.lineWidth = 2;
        const a = em(d.fio.linha[0]); const b = em(d.fio.linha[1]);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        for (const s of d.fio.setas) {
          ctx.beginPath();
          s.forEach((q: Ponto, i: number) => { const c = em(q); if (i === 0) ctx.moveTo(c.x, c.y); else ctx.lineTo(c.x, c.y); });
          ctx.stroke();
        }
      }
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = `${Math.max(11, d.texto.tamanho * escala * 0.8)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      d.texto.linhas.forEach((l: string, i: number) => {
        const c = em({ x: d.texto.x, y: d.texto.y + i * d.texto.tamanho * 1.3 });
        ctx.fillText(l, c.x, c.y);
      });
    };

    if (verTodas) {
      todas.forEach((d: any, i: number) => pintarDesenho(d, d.emX, d.emY, d.erro ? "#ff4d4d" : corDaPeca(i), i === indice));
      return;
    }
    if (!peca) return;
    // Os outros tamanhos da peça, por baixo, finos, cada um na sua cor.
    for (const k of camadas) {
      tracarCaminho(ctx, k.nos, emTela);
      ctx.strokeStyle = k.cor;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1.25;
      ctx.setLineDash(k.tracejada ? [6, 4] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    // A peça escolhida, na posição em que está sendo editada (sem encostar no canto).
    const desenho = desenhoDaPeca({
      ...peca,
      contorno: corte ?? risco,
      marcacoes: corte ? peca.marcacoes : { ...peca.marcacoes, margem: 0 },
    });
    // Como no PDF: corte contínuo, costura (o risco, quando há margem) tracejada.
    pintarDesenho(desenho, 0, 0, corDaPeca(indice), true);
    if ((peca.marcacoes.margem > 0 && !corte) || comErro === indice) {
      // O canvas é esticado/encolhido pelo CSS; o texto segue a proporção
      // para sair com 14px na tela, e não com 14px do canvas.
      const naTela = canvas.getBoundingClientRect().width;
      const fator = naTela > 0 ? canvas.width / naTela : 1;
      ctx.fillStyle = "#ff4d4d";
      ctx.font = `bold ${Math.round(14 * fator)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText("A margem fecha a peça sobre ela mesma: diminua a margem.", 12 * fator, 22 * fator);
    }
    if (ferramenta === "nos") {
      desenharNos(ctx, peca.nos, props.editor?.selecionados ?? null, emTela, { sob: props.editor?.sob ?? null, alcas: props.editor?.alcas });
      if (props.editor?.retangulo) desenharRetangulo(ctx, props.editor.retangulo.de, props.editor.retangulo.ate, emTela);
    }
    if (ferramenta === "graduar") {
      desenharNos(ctx, peca.nos, null, emTela);
      desenharPontosDeGraduacao(ctx, peca.nos, regras, noAtivoValido, emTela);
    }
  }, [vista, escala, verTodas, todas, peca, indice, corte, risco, ferramenta, noAtivoValido, comErro, camadas, regras,
    props.editor?.selecionados, props.editor?.retangulo, props.editor?.sob, props.editor?.alcas]);

  // ------------------------------------------------------------ o ponteiro
  const aoApertar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Espaço segurado, ou o botão do meio: a mão anda pela peça, e nada se edita.
    if (mao === "pronta" || e.button === 1) {
      const caixa = moldura.current;
      if (!caixa) return;
      e.preventDefault();
      arrasto.current = { tipo: "mao", x: e.clientX, y: e.clientY, esquerda: caixa.scrollLeft, topo: caixa.scrollTop };
      setMao("andando");
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    const alvo = noCm(e);
    if (!alvo) return;
    if (verTodas) {
      const i = todas.findIndex((d: any) => alvo.x >= d.emX && alvo.x <= d.emX + d.largura && alvo.y >= d.emY && alvo.y <= d.emY + d.altura);
      if (i >= 0) props.aoEscolherPeca(i);
      return;
    }
    if (!peca) return;
    const raio = raioCm();

    if (ferramenta === "nos") {
      if (!props.editor?.apertar(alvo, raio, e.shiftKey, e.altKey)) return;
      arrasto.current = { tipo: "editor" };
    } else if (ferramenta === "pique") {
      // Mesmo filtro que `desenhoDaPeca` aplica antes de desenhar: um pique
      // cujo `no` não existe mais (dado velho, ou um `apagarNoDaPeca` que não
      // remapeou tudo) faria `posicaoDoPique` estourar. Guarda o índice
      // ORIGINAL da lista, porque é ele que `piques.filter((_, k) => …)`
      // precisa para apagar o pique certo.
      const validos = peca.marcacoes.piques
        .map((q, indiceOriginal) => ({ q, indiceOriginal }))
        .filter(({ q }) => q.no < peca.nos.length);
      const achado = validos.find(({ q }) => {
        const p = posicaoDoPique(peca.nos, q).ponto;
        return Math.hypot(p.x - alvo.x, p.y - alvo.y) < raio;
      });
      if (achado) {
        const removerIndice = achado.indiceOriginal;
        props.aoMudar((p) => ({ ...p, marcacoes: { ...p.marcacoes, piques: p.marcacoes.piques.filter((_, k) => k !== removerIndice) } }), true);
        return;
      }
      const traco = tracoSob(peca.nos, alvo, raio);
      if (!traco) return;
      props.aoMudar((p) => ({
        ...p,
        marcacoes: { ...p.marcacoes, piques: [...p.marcacoes.piques, { no: traco.no, t: traco.t, profundidade: PROFUNDIDADE_DO_PIQUE }] },
      }), true);
      return;
    } else if (ferramenta === "ponto") {
      const perto = peca.marcacoes.pontos.findIndex((q) => Math.hypot(q.x - alvo.x, q.y - alvo.y) < raio);
      if (perto >= 0) {
        props.aoMudar((p) => ({ ...p, marcacoes: { ...p.marcacoes, pontos: p.marcacoes.pontos.filter((_, k) => k !== perto) } }), true);
        return;
      }
      // Clique fora da peça: nada. O ponto marca pence/bolso — não existe
      // "pence" no meio do nada, fora do traço.
      if (!dentroDoPoligono(alvo, risco)) return;
      props.aoMudar((p) => ({
        ...p,
        marcacoes: { ...p.marcacoes, pontos: [...p.marcacoes.pontos, alvo] },
      }), true);
      return;
    } else if (ferramenta === "graduar") {
      // Clicar num nó abre a regra dele no bloco da graduação. Nada se arrasta.
      // O campo do bloco que estava sendo digitado grava AGORA, no nó de antes:
      // o blur natural só viria depois deste pointerdown, com o bloco já no nó
      // novo — e o número cairia nele.
      (document.activeElement as HTMLElement | null)?.blur?.();
      const sob = pegaSob(peca.nos, alvo, raio, null);
      props.aoMarcarNo(sob ? sob.no : null);
      return;
    } else {
      const f = peca.marcacoes.fio;
      const rad = (f.angulo * Math.PI) / 180;
      const ponta = { x: f.x + Math.sin(rad) * (f.comprimento / 2), y: f.y + Math.cos(rad) * (f.comprimento / 2) };
      const outra = { x: 2 * f.x - ponta.x, y: 2 * f.y - ponta.y };
      const naPonta = [ponta, outra].some((q) => Math.hypot(q.x - alvo.x, q.y - alvo.y) < raio * 1.5);
      if (!naPonta && Math.hypot(f.x - alvo.x, f.y - alvo.y) > raio * 1.5) return;
      props.aoLembrar();
      arrasto.current = { tipo: "fio", modo: naPonta ? "girar" : "mover" };
    }
    vistaCongelada.current = vista;
    ajusteCongelado.current = ajusteNaMesa;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const aoMover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const a = arrasto.current;
    if (a && a.tipo === "mao") {
      const caixa = moldura.current;
      if (caixa) {
        caixa.scrollLeft = a.esquerda - (e.clientX - a.x);
        caixa.scrollTop = a.topo - (e.clientY - a.y);
      }
      return;
    }
    const alvo = noCm(e);
    if (!alvo) return;
    if (!a) {
      // Sem apertar: o editor guarda o que está debaixo do ponteiro e diz o cursor.
      if (ferramenta === "nos" && !verTodas && props.editor) setCursor(props.editor.passar(alvo, raioCm()));
      return;
    }
    if (a.tipo === "editor") {
      props.editor?.mover(alvo);
    } else if (a.modo === "mover") {
      props.aoMudar((p) => ({ ...p, marcacoes: { ...p.marcacoes, fio: { ...p.marcacoes.fio, x: alvo.x, y: alvo.y } } }), false);
    } else {
      props.aoMudar((p) => {
        const f = p.marcacoes.fio;
        const angulo = Math.round((Math.atan2(alvo.x - f.x, alvo.y - f.y) * 180) / Math.PI);
        return { ...p, marcacoes: { ...p.marcacoes, fio: { ...f, angulo } } };
      }, false);
    }
  };

  const aoSoltar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!arrasto.current) return;
    if (arrasto.current.tipo === "mao") {
      arrasto.current = null;
      setMao((m) => (m === "andando" ? (espacoSegurado.current ? "pronta" : "") : m));
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      return;
    }
    if (arrasto.current.tipo === "editor") props.editor?.soltar();
    arrasto.current = null;
    vistaCongelada.current = null;
    ajusteCongelado.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    repintar((n) => n + 1);
  };

  /** Dois cliques (ferramenta Nós): no nó apaga, no traço põe nó sem mudar o desenho. */
  const aoDobrarClique = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (verTodas || ferramenta !== "nos" || !peca) return;
    const alvo = noCm(e);
    if (alvo) props.editor?.dobrarClique(alvo, raioCm());
  };

  // A largura e a altura da mesa, para o canvas nascer do tamanho em que aparece.
  useEffect(() => {
    const caixa = moldura.current;
    if (!caixa) return;
    const medir = () => setMoldura({ largura: caixa.clientWidth, altura: caixa.clientHeight });
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(caixa);
    return () => observador.disconnect();
  }, []);

  /**
   * Muda o zoom mantendo o ponto `(cx, cy)` da mesa (em pixels da moldura) parado
   * debaixo dele. Sem ponto: o meio da mesa.
   */
  const mudarZoom = (fator: number, cx?: number, cy?: number) => {
    const caixa = moldura.current;
    const canvas = tela.current;
    if (!caixa || !canvas) return;
    const r = caixa.getBoundingClientRect();
    const c = canvas.getBoundingClientRect();
    const mx = cx ?? r.width / 2;
    const my = cy ?? r.height / 2;
    const px = (r.left + mx - c.left) / Math.max(1, c.width);
    const py = (r.top + my - c.top) / Math.max(1, c.height);
    setZoom((z) => {
      const novo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * fator));
      requestAnimationFrame(() => {
        if (!tela.current) return;
        caixa.scrollLeft = tela.current.offsetLeft + px * tela.current.clientWidth - mx;
        caixa.scrollTop = tela.current.offsetTop + py * tela.current.clientHeight - my;
      });
      return novo;
    });
  };
  const ajustar = () => {
    setZoom(1);
    requestAnimationFrame(() => { if (moldura.current) { moldura.current.scrollLeft = 0; moldura.current.scrollTop = 0; } });
  };

  // Zoom pela roda, ancorado no ponteiro — o mesmo do Digitalizar.
  const zoomPelaRoda = useRef(mudarZoom);
  zoomPelaRoda.current = mudarZoom;
  useEffect(() => {
    const caixa = moldura.current;
    if (!caixa) return;
    const aoRodar = (e: WheelEvent) => {
      e.preventDefault();
      const r = caixa.getBoundingClientRect();
      zoomPelaRoda.current(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
    };
    caixa.addEventListener("wheel", aoRodar, { passive: false });
    return () => caixa.removeEventListener("wheel", aoRodar);
  }, []);

  // Depois do Z: o centro da seleção no meio da mesa, já no zoom novo.
  useEffect(() => {
    const ponto = centrarEm.current;
    const caixa = moldura.current;
    const canvas = tela.current;
    if (!ponto || !caixa || !canvas) return;
    centrarEm.current = null;
    caixa.scrollLeft = canvas.offsetLeft + (ponto.x - vista.minX) * escalaTela - caixa.clientWidth / 2;
    caixa.scrollTop = canvas.offsetTop + (ponto.y - vista.minY) * escalaTela - caixa.clientHeight / 2;
  }, [zoom, escalaTela, vista]);

  /** Z: os nós selecionados (com 15% de folga) ocupando a mesa. */
  const aproximarNaSelecao = () => {
    const sel = props.editor?.selecionados;
    if (!peca || !sel || sel.size === 0 || ajusteNaMesa <= 0) return;
    const pts = [...sel].map((i) => peca.nos[i]).filter(Boolean) as Ponto[];
    if (pts.length === 0) return;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const largura = Math.max(2, (Math.max(...xs) - Math.min(...xs)) * 1.3);
    const altura = Math.max(2, (Math.max(...ys) - Math.min(...ys)) * 1.3);
    const porCm = Math.min(moldura_.largura / largura, moldura_.altura / altura);
    centrarEm.current = { x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2 };
    setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, porCm / ajusteNaMesa)));
  };

  // As teclas da vista: 0 ajusta, Z aproxima na seleção, Espaço segurado vira mão.
  const espacoSegurado = useRef(false);
  const teclasDaVista = useRef({ ajustar, aproximarNaSelecao });
  teclasDaVista.current = { ajustar, aproximarNaSelecao };
  useEffect(() => {
    if (verTodas) return;
    const descer = (e: KeyboardEvent) => {
      if (e.key === " " && !e.ctrlKey && !e.metaKey) {
        const foco = document.activeElement as HTMLElement | null;
        if (foco && (["INPUT", "TEXTAREA", "SELECT"].includes(foco.tagName) || foco.isContentEditable)) return;
        // Botão com o foco (o "+" do zoom, uma ferramenta que acabou de ser clicada): o Espaço o
        // apertaria de novo na soltura. Ele perde o foco, e o Espaço é da mão.
        if (foco && foco.tagName === "BUTTON") foco.blur();
        e.preventDefault();
        espacoSegurado.current = true;
        setMao((m) => (m === "" ? "pronta" : m));
        return;
      }
      if (!teclaDaMesa(e)) return;
      if (e.key === "0") { e.preventDefault(); teclasDaVista.current.ajustar(); }
      else if (e.key.toLowerCase() === "z") { e.preventDefault(); teclasDaVista.current.aproximarNaSelecao(); }
    };
    const subir = (e: KeyboardEvent) => {
      if (e.key !== " ") return;
      espacoSegurado.current = false;
      setMao((m) => (m === "pronta" ? "" : m));
    };
    window.addEventListener("keydown", descer);
    window.addEventListener("keyup", subir);
    return () => { window.removeEventListener("keydown", descer); window.removeEventListener("keyup", subir); };
  }, [verTodas]);

  const cursorDaMesa = verTodas ? "pointer" : mao === "andando" ? "grabbing" : mao === "pronta" ? "grab"
    : ferramenta === "nos" ? cursor : "crosshair";

  return (
    <div className="relative h-full">
      <div ref={moldura} className="h-full overflow-auto bg-painel-suave">
        {/* `margin: auto` centraliza a peça menor que a mesa sem esconder nada quando ela é maior. */}
        <div className="flex min-h-full min-w-full">
          <canvas
            ref={tela}
            data-mesa
            className="m-auto block h-auto max-w-none touch-none select-none"
            style={{ width: `${Math.round(vista.largura * escalaTela)}px`, cursor: cursorDaMesa }}
            onPointerDown={aoApertar}
            onPointerMove={aoMover}
            onPointerUp={aoSoltar}
            onPointerCancel={aoSoltar}
            onPointerLeave={() => { if (!arrasto.current) props.editor?.sair(); }}
            onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
            onDoubleClick={aoDobrarClique}
          />
        </div>
      </div>
      {!verTodas && (
        <div className="absolute right-3 bottom-3 flex items-center gap-1 rounded-lg border border-linha bg-painel/90 p-1 shadow-lg shadow-black/40">
          <button type="button" className="btn secondary btn-sm" title="Afastar (roda do mouse)" aria-label="Afastar"
            onClick={() => mudarZoom(1 / 1.25)}>−</button>
          <span className="w-12 text-center font-mono text-[11px] text-tinta-fraca">{Math.round(zoom * 100)}%</span>
          <button type="button" className="btn secondary btn-sm" title="Aproximar (roda do mouse)" aria-label="Aproximar"
            onClick={() => mudarZoom(1.25)}>+</button>
          <button type="button" className="btn secondary btn-sm" title="A peça inteira na mesa (0)" onClick={ajustar}>Ajustar</button>
        </div>
      )}
    </div>
  );
}
