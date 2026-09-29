/*
 * BANCADA — os tamanhos do molde
 *
 *     npm run bancada:tamanhos
 *
 * Roda no CI. O caso que mais importa é o dos pijamas: dois arquivos da
 * Audaces, M e G, com as peças em outra ordem e com nomes diferentes — o
 * casamento tem de sugerir o par certo, e a pessoa confirma.
 */
import assert from "node:assert/strict";
import { carregarModulo } from "./carregarModulo.mjs";

const t = await carregarModulo("src/motores/tamanhos.js");
const peca = (tamanho, nome, extra = {}) => ({
  tamanho, nome, papel: "outro", quantidade: 1, largura: 10, altura: 10,
  nos: [], marcacoes: { margem: 0, espelhar: false, fio: { x: 0, y: 0, angulo: 0, comprimento: 0 }, piques: [], pontos: [] },
  ...extra,
});

// 1. Tamanhos: guardados na ordem deles, mais os que só existem nas peças, com cor da paleta.
{
  const r = t.tamanhosDoMolde(
    [peca("P", "A"), peca("M", "A"), peca("GG", "A")],
    [{ nome: "M", cor: "#00ffff", ordem: 0, base: false }, { nome: "P", cor: null, ordem: 1, base: false }],
  );
  assert.deepEqual(r.map((x) => x.nome), ["M", "P", "GG"]);
  assert.equal(r[0].cor, "#00ffff");
  assert.ok(/^#[0-9a-f]{6}$/.test(r[1].cor) && /^#[0-9a-f]{6}$/.test(r[2].cor), "sem cor: paleta");
  assert.equal(r.filter((x) => x.base).length, 1, "exatamente um base");
  assert.equal(r[0].base, true, "sem base marcado, o primeiro");
}

// 2. Molde antigo: grupo pela posição dentro do tamanho.
{
  const r = t.completarGrupos([peca("P", "FRENTE"), peca("P", "COSTAS"), peca("G", "FRENTE"), peca("G", "COSTAS")]);
  assert.deepEqual(r.map((p) => p.grupo), [0, 1, 0, 1]);
  const g = t.gruposDasPecas(r);
  assert.deepEqual(g, [{ grupo: 0, porTamanho: { P: 0, G: 2 } }, { grupo: 1, porTamanho: { P: 1, G: 3 } }]);
}

// 3. Dados comuns vão ao grupo inteiro; o desenho não.
{
  const pecas = t.completarGrupos([peca("P", "FRENTE"), peca("G", "FRENTE"), peca("P", "COSTAS")]);
  const mudada = { ...pecas[0], quantidade: 3, marcacoes: { ...pecas[0].marcacoes, margem: 1, espelhar: true, piques: [{ no: 0, t: 0.5, profundidade: 0.5 }] } };
  const r = t.aplicarNoGrupo(pecas, 0, t.comunsDoGrupo(mudada));
  assert.equal(r[1].quantidade, 3);
  assert.equal(r[1].marcacoes.margem, 1);
  assert.equal(r[1].marcacoes.espelhar, true);
  assert.deepEqual(r[1].marcacoes.piques, [], "piques são por tamanho");
  assert.equal(r[2].quantidade, 1, "outro grupo não muda");
  assert.equal(pecas[1].quantidade, 1, "não mexe na lista recebida");
}

// 4. Nomes: sem acento, sem "2X", maiúsculo.
assert.equal(t.normalizarNomeDePeca("  Cós 1x "), "COS");
assert.equal(t.normalizarNomeDePeca("BERMUDA  MASC. 2X"), "BERMUDA MASC.");

// 5. Os pijamas de verdade: M daqui, G de lá, outra ordem e nomes diferentes.
{
  const nomesM = ["FRENTE 2X", "COSTA 1X", "BERMUDA FEM. 2X", "BERMUDA MASC. 2X", "MANGA 2X", "PALA SHORT 2X", "PALA MG 2X", "PALA BLUSA 1X"];
  const nomesG = ["BERMUDA FEM. 2X", "MANGA 2X", "FRENTE 2X", "COSTA 1X", "BEMUDA MASC. 2X", "PALA 2X", "PALA MANGA 2X", "PALA BLUSA 1X"];
  const daqui = nomesM.map((nome, grupo) => ({ grupo, nome, papel: "outro", largura: 20 + grupo, altura: 30 }));
  const dela = nomesG.map((nome) => ({ nome, papel: "outro", largura: 20 + nomesM.findIndex((m) => t.normalizarNomeDePeca(m).slice(0, 4) === t.normalizarNomeDePeca(nome).slice(0, 4)), altura: 31 }));
  const pares = t.casarPecasParaJuntar(daqui, dela);
  const nomeDe = (i) => (i === null ? null : nomesG[i]);
  assert.equal(nomeDe(pares[0].indiceDela), "FRENTE 2X");
  assert.equal(nomeDe(pares[3].indiceDela), "BEMUDA MASC. 2X", "erro de digitação casa");
  assert.equal(nomeDe(pares[7].indiceDela), "PALA BLUSA 1X");
  assert.equal(new Set(pares.map((p) => p.indiceDela).filter((i) => i !== null)).size,
    pares.filter((p) => p.indiceDela !== null).length, "peça de lá não é usada duas vezes");
}

// 6. Juntar como tamanho: peça de lá entra no grupo do par, com os dados comuns daqui.
{
  const pecas = t.completarGrupos([peca("M", "FRENTE", { quantidade: 2, papel: "frente" })]);
  const r = t.juntarComoTamanho(pecas, [peca("X", "FRENTE 2X", { largura: 12 })], [{ grupo: 0, indiceDela: 0 }], "G");
  assert.equal(r.length, 2);
  assert.equal(r[1].tamanho, "G");
  assert.equal(r[1].grupo, 0);
  assert.equal(r[1].papel, "frente");
  assert.equal(r[1].quantidade, 2);
  assert.equal(r[1].largura, 12, "o desenho é o de lá");
  assert.equal(r[1].id, undefined, "peça nova, sem id do outro molde");
}

console.log("OK — os tamanhos do molde conferem.");
