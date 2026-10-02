/*
 * Os cenários da bancada do editor de nós (`conferir-editor-de-nos.mjs`).
 *
 * O gancho `useEditorDeNos` roda de verdade, em duas telas de mentira: uma com
 * os nós e uma pilha de desfazer de nós (o jeito do Digitalizar), outra com a
 * peça inteira no estado — piques e regras da graduação vão junto (o jeito da
 * Montagem). O `desfazer` delas é a mudança que vem DE FORA do editor.
 */
import assert from "node:assert/strict";
import { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useEditorDeNos, type AlvoDoEditor, type EditorDeNos } from "../src/telas/risco/useEditorDeNos";
import { apagarNos, porNosNoTraco, reduzirNos } from "../src/motores/edicaoDeNos";
import { apagarNosDaPeca, porNosDaPeca, reduzirNosDaPeca } from "../src/motores/montagem";

type Qualquer = any;
let tela: { editor: EditorDeNos; nos: Qualquer[]; pilha: unknown[]; desfazer: () => void; peca?: Qualquer } = null as Qualquer;
let agora = 1.7e12;
Date.now = () => agora;
const tecla = (key: string) => ({ key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {} }) as unknown as KeyboardEvent;

/** A tela do jeito do Digitalizar: os nós, e uma pilha de listas de nós. */
function TelaDeNos({ inicial }: { inicial: Qualquer[] }) {
  const [nos, setNos] = useState<Qualquer[]>(inicial);
  const [pilha, setPilha] = useState<Qualquer[][]>([]);
  const atual = useRef(nos);
  atual.current = nos;
  const lembrar = () => setPilha((p) => [...p, atual.current]);
  const desfazer = () => setPilha((p) => {
    if (!p.length) return p;
    setNos(p[p.length - 1]!);
    return p.slice(0, -1);
  });
  const alvo: AlvoDoEditor = {
    nos,
    mudarNos: (mudar, lembrarAntes) => { if (lembrarAntes) lembrar(); setNos((n) => mudar(n)); },
    apagarNos: (indices) => {
      const r: Qualquer = apagarNos(nos, indices);
      if (r.erro) return r.erro;
      lembrar();
      setNos(r.nos);
      return null;
    },
    porNos: (pontos) => { lembrar(); setNos((n) => porNosNoTraco(n, pontos)); },
    retrato: () => nos,
    reduzir: (retrato, indices, folga) => {
      const r: Qualquer = reduzirNos(retrato as Qualquer[], indices, folga, []);
      if (r.erro) return { erro: r.erro };
      return { antes: r.antes, depois: r.depois, aplicar: () => setNos(r.nos) };
    },
    voltar: (retrato) => setNos(retrato as Qualquer[]),
    lembrar,
    passos: { curto: 0.1, longo: 1 },
    folgaEmUnidades: (mm) => mm / 10,
    comMedida: true,
  };
  const editor = useEditorDeNos(alvo, 0);
  tela = { editor, nos, pilha, desfazer };
  return null;
}

/** A tela do jeito da Montagem: a peça inteira no estado, piques e regras da graduação juntos. */
function TelaDaPeca({ inicial }: { inicial: Qualquer }) {
  const [peca, setPeca] = useState<Qualquer>(inicial);
  const [pilha, setPilha] = useState<Qualquer[]>([]);
  const atual = useRef(peca);
  atual.current = peca;
  const lembrar = () => setPilha((p) => [...p, atual.current]);
  const desfazer = () => setPilha((p) => {
    if (!p.length) return p;
    setPeca(p[p.length - 1]);
    return p.slice(0, -1);
  });
  const mudar = (f: (p: Qualquer) => Qualquer, lembrarAntes: boolean) => { if (lembrarAntes) lembrar(); setPeca((p: Qualquer) => f(p)); };
  const alvo: AlvoDoEditor = {
    nos: peca.nos,
    mudarNos: (m, l) => mudar((p) => ({ ...p, nos: m(p.nos) }), l),
    apagarNos: (indices) => {
      const r: Qualquer = apagarNosDaPeca(peca, indices);
      if (r.erro) return r.erro;
      mudar(() => r.peca, true);
      return null;
    },
    porNos: (pontos) => mudar((p) => porNosDaPeca(p, pontos), true),
    retrato: () => peca,
    reduzir: (retrato, indices, folga) => {
      const r: Qualquer = reduzirNosDaPeca(retrato, indices, folga);
      if (r.erro) return { erro: r.erro };
      return { antes: r.antes, depois: r.depois, aplicar: () => mudar(() => r.peca, false) };
    },
    voltar: (retrato) => mudar(() => retrato, false),
    lembrar,
    passos: { curto: 0.1, longo: 1 },
    folgaEmUnidades: (mm) => mm / 10,
    comMedida: true,
  };
  const editor = useEditorDeNos(alvo, 0);
  tela = { editor, nos: peca.nos, pilha, desfazer, peca };
  return null;
}

const reto = (x: number, y: number) => ({ x, y, entrada: { x, y }, saida: { x, y }, canto: true, retaDepois: true });
function circulo(N: number, R: number) {
  const h = (4 / 3) * Math.tan(((2 * Math.PI) / N) / 4) * R;
  return Array.from({ length: N }, (_, k) => {
    const a = (k / N) * 2 * Math.PI;
    const p = { x: 50 + R * Math.cos(a), y: 50 + R * Math.sin(a) };
    const tg = { x: -Math.sin(a), y: Math.cos(a) };
    return { x: p.x, y: p.y, entrada: { x: p.x - tg.x * h, y: p.y - tg.y * h }, saida: { x: p.x + tg.x * h, y: p.y + tg.y * h } };
  });
}

async function montar(elemento: JSX.Element) {
  const caixa = document.createElement("div");
  document.body.appendChild(caixa);
  const raiz = createRoot(caixa);
  await act(async () => { raiz.render(elemento); });
  return async () => { await act(async () => { raiz.unmount(); }); caixa.remove(); };
}
const fazer = async (f: () => void) => { await act(async () => { f(); }); };
/** Um clique num nó: aperta e solta sem mexer. */
const clicar = async (no: { x: number; y: number }) => {
  await fazer(() => { tela.editor.apertar({ x: no.x, y: no.y }, 0.5, false); });
  await fazer(() => tela.editor.soltar());
};

export async function rodar() {
  const falhas: string[] = [];
  const cenario = async (nome: string, f: () => Promise<void>) => {
    try { await f(); } catch (e) { falhas.push(`${nome}: ${(e as Error).message}`); }
  };
  // 1. O Reduzir pelo teclado, e um Ctrl+Z no meio: o passo seguinte do controle recomeça do desenho de
  //    agora (e guarda o desfazer de novo) — não reaplica o retrato de antes do Ctrl+Z.
  await cenario("cenário 1", async () => {
    const original = circulo(40, 30);
    const desmontar = await montar(<TelaDeNos inicial={original} />);
    await clicar(original[5]!);
    await fazer(() => { tela.editor.teclar(tecla("ArrowRight")); });
    await fazer(() => { tela.editor.teclar(tecla("Escape")); });
    await fazer(() => tela.editor.reduzirAoVivo(1.0));
    assert.ok(tela.nos.length < 40, "a redução ao vivo tirou nós");
    await fazer(() => tela.desfazer());
    await fazer(() => tela.desfazer());
    assert.deepEqual(tela.nos, original, "dois Ctrl+Z voltam ao começo");
    assert.equal(tela.editor.contagem, null, "a contagem da redução desfeita não fica na barra");
    await fazer(() => tela.editor.reduzirAoVivo(1.1));
    assert.equal(tela.pilha.length, 1, "o passo depois do Ctrl+Z guarda o desfazer de novo");
    await fazer(() => tela.desfazer());
    assert.deepEqual(tela.nos, original, "e o Ctrl+Z volta ao começo, sem a seta desfeita");
    await desmontar();
  });

  // 2. Ctrl+Z com nós selecionados: a seleção acaba (os números podem ser de outros nós agora), e as setas
  //    não continuam a sequência de antes do Ctrl+Z.
  await cenario("cenário 2", async () => {
    const original = circulo(12, 30);
    const desmontar = await montar(<TelaDeNos inicial={original} />);
    await clicar(original[0]!);
    await fazer(() => { tela.editor.teclar(tecla("ArrowDown")); });
    agora += 5000;
    await fazer(() => { tela.editor.teclar(tecla("ArrowRight")); });
    agora += 400;
    await fazer(() => tela.desfazer());
    assert.equal(tela.editor.selecionados.size, 0, "o Ctrl+Z limpa a seleção");
    agora += 400;
    let tratou = true;
    await fazer(() => { tratou = tela.editor.teclar(tecla("ArrowLeft")); });
    assert.equal(tratou, false, "sem seleção, a seta não é do editor");
    await desmontar();
  });

  // 3. Delete no meio de um arrasto não faz nada: senão os piques e as regras da graduação iam para os nós
  //    errados quando o arrasto seguinte reescrevesse os nós de antes.
  await cenario("cenário 3", async () => {
    const nos = [reto(0, 0), reto(10, 0), reto(20, 0), reto(20, 10), reto(10, 10), reto(0, 10)];
    const peca = {
      nos, papel: "frente", tamanho: "M", quantidade: 1, nome: "",
      marcacoes: { margem: 0, espelhar: false, fio: { x: 10, y: 5, angulo: 0, comprimento: 6 }, piques: [{ no: 3, t: 0.5, profundidade: 0.5 }], pontos: [] },
      graduacao: { jeito: "pontos", porcentagem: 0, regras: [{ no: 4, modo: "igual", passo: { dx: 1, dy: 0 } }] },
    };
    const desmontar = await montar(<TelaDaPeca inicial={peca} />);
    await fazer(() => { tela.editor.apertar({ x: 20, y: 0 }, 0.5, false); });
    await fazer(() => tela.editor.mover({ x: 21, y: -1 }));
    await fazer(() => { tela.editor.teclar(tecla("Delete")); });
    await fazer(() => tela.editor.mover({ x: 22, y: -2 }));
    await fazer(() => tela.editor.soltar());
    assert.equal(tela.peca.nos.length, 6, "nenhum nó apagado no meio do arrasto");
    assert.equal(tela.peca.graduacao.regras[0].no, 4, "a regra continua no nó 4");
    assert.deepEqual({ x: tela.peca.nos[4].x, y: tela.peca.nos[4].y }, { x: 10, y: 10 });
    assert.equal(tela.peca.marcacoes.piques[0].no, 3, "o pique continua no trecho 3");
    await desmontar();
  });

  // 4. Ctrl+Z no meio de um arrasto encerra o arrasto: o movimento seguinte não reescreve os nós de antes.
  await cenario("cenário 4", async () => {
    const original = circulo(12, 30);
    const desmontar = await montar(<TelaDeNos inicial={original} />);
    await fazer(() => { tela.editor.apertar({ x: original[2]!.x, y: original[2]!.y }, 0.5, false); });
    await fazer(() => tela.editor.mover({ x: original[2]!.x + 3, y: original[2]!.y }));
    await fazer(() => tela.desfazer());
    assert.deepEqual(tela.nos, original, "o Ctrl+Z desfez o arrasto");
    await fazer(() => tela.editor.mover({ x: original[2]!.x + 6, y: original[2]!.y }));
    await fazer(() => tela.editor.soltar());
    assert.deepEqual(tela.nos, original, "o arrasto acabou no Ctrl+Z");
    await desmontar();
  });
  assert.deepEqual(falhas, [], `\n${falhas.join("\n")}`);
}
