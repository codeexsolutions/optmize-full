/*
 * Os cenários com React da bancada do envio (`conferir-envio-por-tamanho.mjs`).
 *
 * A grade roda de verdade numa tela de mentira que guarda o estado com as
 * contas de `envioPorTamanho.ts`, do jeito que a janela Arte e encaixe guarda.
 */
import assert from "node:assert/strict";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { GradeDeQuantidades } from "../src/telas/moldes/GradeDeQuantidades";
import { EnvioParaEncaixe } from "../src/telas/moldes/EnvioParaEncaixe";
import { ProvedorDeDialogo } from "../src/casca/Dialogo";
import { ProvedorDaLigacao } from "../src/producao/ligacao";
import {
  colunasDaGrade, mexer, mudarQuantidade, type Mexidas, type Quantidades,
} from "../src/telas/moldes/envioPorTamanho";

type Qualquer = any;
const quadrado = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }];
export const peca = (tamanho: string, papel: string, quantidade: number, espelhar = false): Qualquer => ({
  tamanho, papel, nome: "", quantidade, largura: 10, altura: 20, contorno: quadrado, furos: [], origem: null,
  marcacoes: espelhar ? { espelhar: true } : null,
});
export const pecas = [peca("P", "frente", 1), peca("P", "manga", 2, true), peca("M", "frente", 1), peca("M", "manga", 2, true)];
export const grade = [
  { nome: "P", cor: "#000000", ordem: 0, base: false },
  { nome: "M", cor: "#000000", ordem: 1, base: true },
  { nome: "G", cor: "#000000", ordem: 2, base: false },
];

export async function montar(elemento: JSX.Element) {
  const caixa = document.createElement("div");
  document.body.appendChild(caixa);
  const raiz = createRoot(caixa);
  await act(async () => { raiz.render(elemento); });
  return async () => { await act(async () => { raiz.unmount(); }); caixa.remove(); };
}
export const fazer = async (f: () => void | Promise<void>) => { await act(async () => { await f(); }); };
export const campo = (rotulo: string) => document.querySelector<HTMLInputElement>(`input[aria-label="${rotulo}"]`);
export const botao = (rotulo: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${rotulo}"]`);
export const botaoPeloTexto = (texto: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.textContent ?? "").trim().startsWith(texto)) ?? null;
/** Escreve num campo como a pessoa escreveria: o React só vê o valor pelo evento `input`. */
export async function digitar(el: HTMLInputElement | null, valor: string) {
  assert.ok(el, "o campo existe");
  await fazer(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(el, valor);
    el!.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}
export const clicar = async (el: HTMLElement | null) => { assert.ok(el, "o botão existe"); await fazer(() => el!.click()); };

function TelaDaGrade() {
  const [quantidades, setQuantidades] = useState<Quantidades>({});
  const [mexidas, setMexidas] = useState<Mexidas>({});
  const [aberta, setAberta] = useState<string | null>(null);
  return (
    <GradeDeQuantidades
      linhas={[{ chave: "e:3", nome: "caveira" }, { chave: "sem", nome: "sem estampa" }]}
      colunas={colunasDaGrade({ pecas, tamanhos: grade })}
      pecas={pecas}
      quantidades={quantidades}
      mexidas={mexidas}
      aberta={aberta}
      aoMudarQuantidade={(l, t, v) => setQuantidades((q) => mudarQuantidade(q, l, t, v))}
      aoMexer={(c, i, v) => setMexidas((m) => mexer(m, c, i, v))}
      aoAbrir={setAberta}
    />
  );
}

export const cenariosDaTela: [string, () => Promise<void>][] = [];

/** Uma ligação de mentira: anota o que o Encaixe recebeu, e pode falhar na N-ésima chamada. */
function ligacaoFalsa(falharNa: number | null = null) {
  const recebidos: Qualquer[] = [];
  const idas: string[] = [];
  let chamadas = 0;
  const ligacao: Qualquer = {
    adicionarArquivos: async () => {},
    mandarProjetoParaOEncaixe: async () => {},
    async mandarMoldeParaOEncaixe(m: Qualquer) {
      chamadas++;
      if (chamadas === falharNa) throw new Error("Aguarde o trabalho atual terminar antes de enviar mais peças.");
      recebidos.push(m);
    },
    irPara: (destino: string) => { idas.push(destino); },
  };
  return { ligacao, recebidos, idas, parar: () => { falharNa = null; } };
}

const moldeDoPijama: Qualquer = {
  id: 7, nome: "pijama", observacoes: null, situacao: "pronto", pecas, tamanhos: grade,
  artes: [{ id: 3, nome: "caveira", pecas: [] }],
};

async function abrirJanela(ligacao: Qualquer) {
  let fechou = false;
  const desmontar = await montar(
    <ProvedorDeDialogo>
      <ProvedorDaLigacao value={ligacao}>
        <EnvioParaEncaixe molde={moldeDoPijama} aoFechar={() => { fechou = true; }} aoRecarregar={() => {}} />
      </ProvedorDaLigacao>
    </ProvedorDeDialogo>,
  );
  return { desmontar, fechou: () => fechou };
}
const mandar = () => clicar(botaoPeloTexto("Mandar para o encaixe"));
const resumoDoEnvio = (m: Qualquer) => [m.tamanho, m.unidades, m.pecas.map((p: Qualquer) => [p.nome || p.papel, p.quantidade, p.estampa ?? ""])];

// J. 1 — três células viram três chamadas, na ordem da grade, com unidades 1 e a quantidade em cada peça.
cenariosDaTela.push(["janela 1", async () => {
  const f = ligacaoFalsa();
  const j = await abrirJanela(f.ligacao);
  await digitar(campo("caveira P"), "2");
  await digitar(campo("caveira M"), "1");
  await digitar(campo("sem estampa M"), "3");
  await mandar();
  assert.deepEqual(f.recebidos.map(resumoDoEnvio), [
    ["P", 1, [["frente", 2, "caveira"], ["manga", 2, "caveira"], ["manga (espelhada)", 2, "caveira"]]],
    ["M", 1, [["frente", 1, "caveira"], ["manga", 1, "caveira"], ["manga (espelhada)", 1, "caveira"]]],
    ["M", 1, [["frente", 3, ""], ["manga", 3, ""], ["manga (espelhada)", 3, ""]]],
  ]);
  assert.equal(j.fechou(), true, "deu tudo certo: fecha");
  assert.deepEqual(f.idas, ["encaixe"]);
  await j.desmontar();
}]);

// J. 2 — a peça zerada no ▸ não vai; as prontas mudando refazem só a não mexida.
cenariosDaTela.push(["janela 2", async () => {
  const f = ligacaoFalsa();
  const j = await abrirJanela(f.ligacao);
  await digitar(campo("caveira M"), "1");
  await clicar(botao("Peças de caveira M"));
  await digitar(campo("Quantidade de frente"), "0");
  await digitar(campo("caveira M"), "2");
  await mandar();
  assert.deepEqual(f.recebidos.map(resumoDoEnvio), [
    ["M", 1, [["manga", 2, "caveira"], ["manga (espelhada)", 2, "caveira"]]],
  ]);
  await j.desmontar();
}]);

// J. 3 — falha no meio: a janela fica, o aviso diz o que foi e o que faltou, as mandadas zeram,
//        e o próximo clique manda só o que faltou.
cenariosDaTela.push(["janela 3", async () => {
  const f = ligacaoFalsa(2);
  const j = await abrirJanela(f.ligacao);
  (globalThis as Qualquer).alertas.length = 0;
  await digitar(campo("caveira P"), "2");
  await digitar(campo("caveira M"), "1");
  await digitar(campo("sem estampa M"), "3");
  await mandar();
  assert.equal(j.fechou(), false, "falhou: não fecha");
  const aviso = (globalThis as Qualquer).alertas.join("\n");
  assert.match(aviso, /Foram: caveira · P\./);
  assert.match(aviso, /Faltou: caveira · M, sem estampa · M — Aguarde o trabalho atual/);
  assert.equal(campo("caveira P")!.value, "", "a mandada zerou");
  assert.equal(campo("caveira M")!.value, "1", "a que faltou ficou");
  f.parar();
  await mandar();
  assert.deepEqual(f.recebidos.map((m: Qualquer) => m.tamanho), ["P", "M", "M"], "a segunda vez manda só o que faltou");
  assert.equal(j.fechou(), true);
  await j.desmontar();
}]);

// J. 4 — falha logo na primeira: nada zera, e o aviso diz "Faltou:" com tudo.
cenariosDaTela.push(["janela 4", async () => {
  const f = ligacaoFalsa(1);
  const j = await abrirJanela(f.ligacao);
  (globalThis as Qualquer).alertas.length = 0;
  await digitar(campo("caveira P"), "2");
  await mandar();
  assert.equal(j.fechou(), false);
  assert.doesNotMatch((globalThis as Qualquer).alertas.join("\n"), /Foram:/);
  assert.match((globalThis as Qualquer).alertas.join("\n"), /Faltou: caveira · P/);
  assert.equal(campo("caveira P")!.value, "2", "nada zerou");
  await j.desmontar();
}]);

// J. 5 — nada pedido: avisa e não manda; o "Ver no tamanho" só oferece os tamanhos com desenho.
cenariosDaTela.push(["janela 5", async () => {
  const f = ligacaoFalsa();
  const j = await abrirJanela(f.ligacao);
  (globalThis as Qualquer).alertas.length = 0;
  await mandar();
  assert.equal(f.recebidos.length, 0);
  assert.match((globalThis as Qualquer).alertas.join("\n"), /pelo menos um tamanho/);
  const ver = document.querySelector<HTMLSelectElement>('select[aria-label="Ver no tamanho"]');
  assert.ok(ver, "o seletor da prévia existe");
  assert.deepEqual([...ver!.options].map((o) => o.value), ["P", "M"]);
  assert.equal(ver!.value, "M", "começa no base da grade");
  await j.desmontar();
}]);

export async function rodar() {
  const falhas: string[] = [];
  const cenario = async (nome: string, f: () => Promise<void>) => {
    try { await f(); } catch (e) { falhas.push(`${nome}: ${(e as Error).message}`); }
  };

  // G. 1 — a célula: o ▸ só com número; a coluna sem desenho não aceita número.
  await cenario("grade 1", async () => {
    const desmontar = await montar(<TelaDaGrade />);
    assert.equal(botao("Peças de caveira M"), null, "sem número, sem ▸");
    assert.equal(campo("caveira G")!.disabled, true, "G não tem desenho");
    await digitar(campo("caveira M"), "3");
    assert.ok(botao("Peças de caveira M"), "com número, o ▸ aparece");
    await desmontar();
  });

  // G. 2 — o ▸ abre as peças com a conta; a mexida fica quando as prontas mudam; voltar à conta.
  await cenario("grade 2", async () => {
    const desmontar = await montar(<TelaDaGrade />);
    await digitar(campo("caveira M"), "3");
    await clicar(botao("Peças de caveira M"));
    assert.equal(campo("Quantidade de frente")!.value, "3");
    assert.equal(campo("Quantidade de manga (espelhada)")!.value, "3");
    await digitar(campo("Quantidade de frente"), "0");
    await digitar(campo("caveira M"), "5");
    assert.equal(campo("Quantidade de frente")!.value, "0", "a mexida fica");
    assert.equal(campo("Quantidade de manga")!.value, "5", "a não mexida acompanha");
    await clicar(botaoPeloTexto("voltar à conta"));
    assert.equal(campo("Quantidade de frente")!.value, "5", "voltou à conta");
    await desmontar();
  });

  // G. 3 — célula aberta que volta a 0: o painel some; o número de volta mostra a mexida guardada.
  await cenario("grade 3", async () => {
    const desmontar = await montar(<TelaDaGrade />);
    await digitar(campo("sem estampa P"), "2");
    await clicar(botao("Peças de sem estampa P"));
    await digitar(campo("Quantidade de frente"), "9");
    await digitar(campo("sem estampa P"), "");
    assert.equal(campo("Quantidade de frente"), null, "com 0, as peças somem");
    // A célula continua a aberta: com o número de volta, as peças voltam sozinhas (clicar no ▸ fecharia).
    await digitar(campo("sem estampa P"), "2");
    assert.equal(campo("Quantidade de frente")!.value, "9", "a mexida estava guardada");
    await desmontar();
  });

  for (const [nome, f] of cenariosDaTela) await cenario(nome, f);
  assert.deepEqual(falhas, [], `\n${falhas.join("\n")}`);
}
