/**
 * ===========================================================================
 * O EDITOR DE NÓS ESTILO COREL — a interação, igual no Digitalizar e na Montagem
 * ===========================================================================
 *
 * As contas moram em `motores/edicaoDeNos.js`; aqui mora o que o ponteiro e o
 * teclado fazem: a seleção, o retângulo, arrastar nós, alças ou o próprio
 * traço, as setas e o Reduzir ao vivo. Cada tela entrega um `AlvoDoEditor` —
 * os nós da peça em edição e como mudá-los (a Montagem leva junto piques e
 * regras da graduação; o Digitalizar, não) — e liga os eventos do canvas nas
 * funções que este gancho devolve. Ver
 * docs/superpowers/specs/2026-09-29-editor-estilo-corel-design.md.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  alinharNos, converterTrechos, moverNos, moverPega, mudarTipoDosNos, nosNoRetangulo, pegaSob, puxarTrecho,
  tipoDoNo, tracoSob, trechosDaSelecao,
} from "../../motores/edicaoDeNos";
import type { No, Ponto } from "./desenhoDeNos";

export type TipoDeNo = "canto" | "suave" | "simetrico";

/** Uma redução já calculada: `aplicar` a põe na peça. */
export interface ReducaoPronta { antes: number; depois: number; aplicar: () => void }

export interface AlvoDoEditor {
  /** Os nós da peça em edição, como estão agora. */
  nos: No[];
  /** Mexida que muda só a forma (mover, puxar, tipo, converter, alinhar), sem mudar quantos nós há. */
  mudarNos: (mudar: (nos: No[]) => No[], lembrarAntes: boolean) => void;
  /** Apaga os nós (o pedaço é refeito). Devolve o aviso quando não dá, ou `null`. */
  apagarNos: (indices: number[]) => string | null;
  /** Um nó em cada ponto `{ no, t }`, um por trecho. */
  porNos: (pontos: { no: number; t: number }[]) => void;
  /** O que o Reduzir guarda antes de começar (os nós; na Montagem, a peça inteira). */
  retrato: () => unknown;
  /** Calcula a redução a partir do retrato (não acumula). Nada muda até `aplicar`. */
  reduzir: (retrato: unknown, indices: number[] | null, folga: number) => ReducaoPronta | { erro: string };
  /** Põe o retrato de volta (o controle do Reduzir voltou para onde não há o que tirar). */
  voltar: (retrato: unknown) => void;
  /** Guarda o estado de agora no desfazer. */
  lembrar: () => void;
  /** Quanto as setas andam, nas unidades dos nós: 1 mm e 1 cm (sem medida, 1 e 10 células). */
  passos: { curto: number; longo: number };
  /** A folga do Reduzir, do valor do controle (mm; sem medida, "pouco ↔ muito") para as unidades dos nós. */
  folgaEmUnidades: (valor: number) => number;
  /** Com medida, o controle do Reduzir mostra milímetros; sem, "pouco ↔ muito". */
  comMedida: boolean;
}

type Arrasto =
  | { tipo: "nos"; base: No[]; indices: number[]; de: Ponto; mexeu: boolean; soEle: number | null }
  | { tipo: "alca"; no: number; parte: "entrada" | "saida"; mexeu: boolean }
  | { tipo: "trecho"; base: No[]; no: number; t: number; de: Ponto; mexeu: boolean }
  | { tipo: "retangulo"; de: Ponto; ate: Ponto; somar: boolean; antes: Set<number> };

/** Abaixo disto (em fração do raio de pega), o aperto é clique, não arrasto. */
const MEXEU = 0.3;
/** Setas com menos que isto entre uma e outra são um passo só no desfazer. */
const SETAS_SEGUIDAS_MS = 1000;
/** Sem peça, as telas mandam um `[]` novo a cada render; este fica sempre o mesmo. */
const SEM_NOS: No[] = [];

/** Há uma janela aberta na frente? Então as teclas são dela, não do editor. */
function janelaAberta(): boolean {
  return [...document.querySelectorAll('[aria-modal="true"]')].some((el) => el.getClientRects().length > 0);
}

export function useEditorDeNos(alvo: AlvoDoEditor, chave: unknown) {
  const nos = alvo.nos.length > 0 ? alvo.nos : SEM_NOS;
  const [selecionados, setSelecionados] = useState<Set<number>>(() => new Set());
  /** O último nó clicado: a referência do Alinhar. Seleção pelo retângulo ou Ctrl+A: `null` (a média). */
  const [referencia, setReferencia] = useState<number | null>(null);
  const [retangulo, setRetangulo] = useState<{ de: Ponto; ate: Ponto } | null>(null);
  const [aviso, setAviso] = useState("");
  const [folga, setFolga] = useState(0.5);
  const [contagem, setContagem] = useState<{ antes: number; depois: number } | null>(null);
  const arrasto = useRef<Arrasto | null>(null);
  const raioDoArrasto = useRef(0);
  const ultimaSeta = useRef(0);
  const reducao = useRef<{ retrato: unknown; indices: number[] | null; lembrou: boolean } | null>(null);
  /** Os nós que o editor já viu, e se a mexida que está chegando é dele. */
  const nosVistos = useRef(nos);
  const mexidaDoEditor = useRef(false);
  const [, marcarMexida] = useState(0);

  /** Toda mexida do editor passa por aqui antes de chamar a tela; a que não passou veio de fora. */
  const doEditor = () => {
    mexidaDoEditor.current = true;
    marcarMexida((n) => n + 1);
  };
  const mudarNos: AlvoDoEditor["mudarNos"] = (mudar, lembrarAntes) => { doEditor(); alvo.mudarNos(mudar, lembrarAntes); };
  const apagarNos: AlvoDoEditor["apagarNos"] = (indices) => { doEditor(); return alvo.apagarNos(indices); };
  const porNos: AlvoDoEditor["porNos"] = (pontos) => { doEditor(); alvo.porNos(pontos); };
  const voltar: AlvoDoEditor["voltar"] = (retrato) => { doEditor(); alvo.voltar(retrato); };
  const aplicar = (feito: ReducaoPronta) => { doEditor(); feito.aplicar(); };

  // Os nós mudaram DE FORA do editor (o Ctrl+Z, o refazer do traço): o que estava em andamento acaba —
  // a seleção (os números podem ser de outros nós agora), o arrasto, a sessão do Reduzir e a sequência
  // de setas. Senão o passo seguinte reaplica um desenho velho, sem desfazer.
  useEffect(() => {
    const deFora = nos !== nosVistos.current && !mexidaDoEditor.current;
    nosVistos.current = nos;
    mexidaDoEditor.current = false;
    if (!deFora) return;
    arrasto.current = null;
    reducao.current = null;
    ultimaSeta.current = 0;
    setRetangulo(null);
    setSelecionados((s) => (s.size > 0 ? new Set() : s));
    setReferencia(null);
    setContagem(null);
    setAviso("");
  });

  // Outra peça: seleção nova.
  useEffect(() => {
    setSelecionados(new Set());
    setReferencia(null);
    setAviso("");
    setContagem(null);
    reducao.current = null;
  }, [chave]);

  // Um desfazer pode tirar nós: a seleção perde o que não existe mais.
  useEffect(() => {
    setSelecionados((s) => ([...s].every((i) => i < nos.length) ? s : new Set([...s].filter((i) => i < nos.length))));
  }, [nos.length]);

  const lista = useMemo(() => [...selecionados].sort((a, b) => a - b), [selecionados]);
  const trechos: number[] = useMemo(() => (lista.length > 0 ? trechosDaSelecao(nos, lista) : []), [nos, lista]);
  const tipoComum: TipoDeNo | null = lista.length > 0 && nos[lista[0]!]
    && lista.every((i) => nos[i] && tipoDoNo(nos[i]) === tipoDoNo(nos[lista[0]!]!))
    ? (tipoDoNo(nos[lista[0]!]!) as TipoDeNo)
    : null;

  /** Qualquer mexida que não é seta quebra a sequência de setas. */
  const outraMexida = () => { ultimaSeta.current = 0; };

  // ------------------------------------------------------------ o ponteiro

  /** Aperto do ponteiro, nas unidades dos nós. `true` quando começou um arrasto (a tela captura o ponteiro). */
  const apertar = (ponto: Ponto, raio: number, shift: boolean): boolean => {
    setAviso("");
    outraMexida();
    raioDoArrasto.current = raio;
    const sob = pegaSob(nos, ponto, raio, selecionados);
    if (sob && sob.parte !== "no") {
      arrasto.current = { tipo: "alca", no: sob.no, parte: sob.parte as "entrada" | "saida", mexeu: false };
      return true;
    }
    if (sob) {
      const i: number = sob.no;
      if (shift && selecionados.has(i)) {
        const s = new Set(selecionados);
        s.delete(i);
        setSelecionados(s);
        return false;
      }
      const s = shift ? new Set([...selecionados, i]) : selecionados.has(i) ? selecionados : new Set([i]);
      if (s !== selecionados) setSelecionados(s);
      setReferencia(i);
      // Clique (sem arrastar) num nó de uma seleção de vários: ao soltar, fica só ele.
      const soEle = !shift && selecionados.has(i) && selecionados.size > 1 ? i : null;
      arrasto.current = { tipo: "nos", base: nos, indices: [...s], de: ponto, mexeu: false, soEle };
      return true;
    }
    const traco = tracoSob(nos, ponto, raio);
    if (traco) {
      if (nos[traco.no]?.retaDepois) {
        setAviso("Trecho reto: converta em curva para dobrar.");
        return false;
      }
      arrasto.current = { tipo: "trecho", base: nos, no: traco.no, t: traco.t, de: ponto, mexeu: false };
      return true;
    }
    arrasto.current = { tipo: "retangulo", de: ponto, ate: ponto, somar: shift, antes: shift ? new Set(selecionados) : new Set() };
    setRetangulo({ de: ponto, ate: ponto });
    return true;
  };

  const mover = (ponto: Ponto) => {
    const a = arrasto.current;
    if (!a) return;
    const limiar = raioDoArrasto.current * MEXEU;
    if (a.tipo === "retangulo") {
      a.ate = ponto;
      setRetangulo({ de: a.de, ate: ponto });
      setSelecionados(new Set([...a.antes, ...nosNoRetangulo(nos, a.de, ponto)]));
      return;
    }
    if (a.tipo === "alca") {
      const primeiro = !a.mexeu;
      a.mexeu = true;
      mudarNos((atuais) => moverPega(atuais, { no: a.no, parte: a.parte }, ponto), primeiro);
      return;
    }
    const dx = ponto.x - a.de.x;
    const dy = ponto.y - a.de.y;
    if (!a.mexeu && Math.hypot(dx, dy) < limiar) return;
    const primeiro = !a.mexeu;
    a.mexeu = true;
    if (a.tipo === "nos") {
      mudarNos(() => moverNos(a.base, a.indices, dx, dy), primeiro);
      return;
    }
    const puxado = puxarTrecho(a.base, a.no, a.t, ponto);
    if (puxado) mudarNos(() => puxado, primeiro);
  };

  const soltar = () => {
    const a = arrasto.current;
    arrasto.current = null;
    if (!a) return;
    if (a.tipo === "retangulo") {
      setRetangulo(null);
      const mexeu = Math.hypot(a.ate.x - a.de.x, a.ate.y - a.de.y) >= raioDoArrasto.current * MEXEU;
      if (mexeu) setReferencia(null);
      else if (!a.somar) setSelecionados(new Set());
    } else if (a.tipo === "nos" && !a.mexeu && a.soEle !== null) {
      setSelecionados(new Set([a.soEle]));
    }
  };

  /** Dois cliques: num nó, apaga; no traço, põe um nó ali sem mudar o desenho. */
  const dobrarClique = (ponto: Ponto, raio: number) => {
    outraMexida();
    const sob = pegaSob(nos, ponto, raio, null);
    if (sob) {
      const erro = apagarNos([sob.no]);
      if (erro) setAviso(erro);
      else setSelecionados(new Set());
      return;
    }
    const traco = tracoSob(nos, ponto, raio);
    if (!traco) return;
    porNos([{ no: traco.no, t: traco.t }]);
    setSelecionados(new Set([traco.no + 1]));
    setReferencia(traco.no + 1);
  };

  // ------------------------------------------------------------ a barra

  const apagar = () => {
    outraMexida();
    if (lista.length === 0) return;
    const erro = apagarNos(lista);
    if (erro) { setAviso(erro); return; }
    setSelecionados(new Set());
    setReferencia(null);
  };

  const porNo = () => {
    outraMexida();
    if (trechos.length === 0) return;
    porNos(trechos.map((no) => ({ no, t: 0.5 })));
    setSelecionados(new Set());
  };

  const converter = (jeito: "linha" | "curva") => {
    outraMexida();
    if (trechos.length === 0) return;
    mudarNos((atuais) => converterTrechos(atuais, trechos, jeito), true);
  };

  const mudarTipo = (tipo: TipoDeNo) => {
    outraMexida();
    if (lista.length === 0) return;
    mudarNos((atuais) => mudarTipoDosNos(atuais, lista, tipo), true);
  };

  const alinhar = (eixo: "horizontal" | "vertical") => {
    outraMexida();
    if (lista.length < 2) return;
    const clicado = referencia !== null && selecionados.has(referencia) ? nos[referencia] : undefined;
    const ref = clicado ?? {
      x: lista.reduce((s, i) => s + nos[i]!.x, 0) / lista.length,
      y: lista.reduce((s, i) => s + nos[i]!.y, 0) / lista.length,
    };
    mudarNos((atuais) => alinharNos(atuais, lista, eixo, ref), true);
  };

  const selecionarTodos = () => {
    setSelecionados(new Set(nos.map((_, i) => i)));
    setReferencia(null);
  };

  /** Mexer no controle do Reduzir: refaz a redução a partir do retrato guardado no primeiro movimento. */
  const reduzirAoVivo = (valor: number) => {
    outraMexida();
    setFolga(valor);
    if (!reducao.current) reducao.current = { retrato: alvo.retrato(), indices: lista.length > 0 ? lista : null, lembrou: false };
    const r = reducao.current;
    const feito = alvo.reduzir(r.retrato, r.indices, alvo.folgaEmUnidades(valor));
    if ("erro" in feito) {
      setAviso(feito.erro);
      setContagem(null);
      if (r.lembrou) voltar(r.retrato);
      return;
    }
    if (!r.lembrou) { alvo.lembrar(); r.lembrou = true; }
    aplicar(feito);
    setAviso("");
    setContagem({ antes: feito.antes, depois: feito.depois });
  };

  /** Soltar o controle: a redução fica (um passo no desfazer). */
  const terminarReducao = () => {
    if (!reducao.current) return;
    reducao.current = null;
    setSelecionados(new Set());
    setReferencia(null);
  };

  /** O botão "Reduzir nós": uma vez, com o valor do controle, a partir do desenho de agora. */
  const reduzirUmaVez = () => {
    outraMexida();
    const feito = alvo.reduzir(alvo.retrato(), lista.length > 0 ? lista : null, alvo.folgaEmUnidades(folga));
    if ("erro" in feito) { setAviso(feito.erro); setContagem(null); return; }
    alvo.lembrar();
    aplicar(feito);
    setAviso("");
    setContagem({ antes: feito.antes, depois: feito.depois });
    setSelecionados(new Set());
    setReferencia(null);
  };

  // ------------------------------------------------------------ o teclado

  /** Uma tecla. `true` quando ela era do editor (e já foi tratada). */
  const teclar = (e: KeyboardEvent): boolean => {
    const foco = document.activeElement as HTMLElement | null;
    if (foco && (["INPUT", "TEXTAREA", "SELECT"].includes(foco.tagName) || foco.isContentEditable)) return false;
    if (janelaAberta()) return false;
    // No meio de um arrasto, as teclas do editor não mexem nos nós: o movimento seguinte do arrasto
    // reescreveria os nós de antes, e os piques e as regras da graduação iam para os nós errados.
    if (arrasto.current) {
      const ctrlA = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a";
      if (!ctrlA && (e.ctrlKey || e.metaKey || e.altKey)) return false;
      if (!ctrlA && !["Escape", "Delete", "Backspace", "+", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return false;
      e.preventDefault();
      return true;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      selecionarTodos();
      return true;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key === "Escape") {
      if (selecionados.size === 0) return false;
      setSelecionados(new Set());
      return true;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (selecionados.size === 0) return false;
      e.preventDefault();
      apagar();
      return true;
    }
    if (e.key === "+") {
      if (trechos.length === 0) return false;
      e.preventDefault();
      porNo();
      return true;
    }
    const setas: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = setas[e.key];
    if (!d || selecionados.size === 0) return false;
    e.preventDefault();
    const passo = e.shiftKey ? alvo.passos.longo : alvo.passos.curto;
    const agora = Date.now();
    const seguida = agora - ultimaSeta.current < SETAS_SEGUIDAS_MS;
    ultimaSeta.current = agora;
    mudarNos((atuais) => moverNos(atuais, lista, d[0] * passo, d[1] * passo), !seguida);
    return true;
  };

  return {
    selecionados, retangulo, aviso, folga, contagem, tipoComum, total: nos.length,
    comMedida: alvo.comMedida,
    podeApagar: lista.length > 0,
    podePor: trechos.length > 0,
    podeLinha: trechos.some((i) => !nos[i]?.retaDepois),
    podeCurva: trechos.some((i) => !!nos[i]?.retaDepois),
    podeAlinhar: lista.length >= 2,
    podeReduzir: nos.length > 3,
    apertar, mover, soltar, dobrarClique, teclar,
    apagar, porNo, converter, mudarTipo, alinhar, selecionarTodos,
    reduzirAoVivo, terminarReducao, reduzirUmaVez,
  };
}

export type EditorDeNos = ReturnType<typeof useEditorDeNos>;
