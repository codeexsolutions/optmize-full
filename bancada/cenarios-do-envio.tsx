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
