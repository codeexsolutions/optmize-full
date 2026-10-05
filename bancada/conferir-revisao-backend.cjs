#!/usr/bin/env node
/** Regressões de arquivos e sessões do backend, somente com dados descartáveis. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const sharp = require("sharp");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "optimize-revisao-backend-"));
process.env.OPTIMIZE_DADOS = pasta;
// Até as artes temporárias do PDF ficam dentro da pasta descartável do teste.
const tmpdirOriginal = os.tmpdir;
os.tmpdir = () => pasta;
const db = require("../servidor/db");
const { limparImagensSoltas } = require("../servidor/uploads-arquivos");
let servidor;
let passou = 0;
const conferir = (nome, fn) => { fn(); passou++; console.log(`  ok   ${nome}`); };

async function principal() {
  const app = express();
  app.use(express.json());
  app.use("/api/moldes", require("../servidor/moldes-api"));
  app.use("/api/projetos", require("../servidor/projetos-api"));
  app.use("/api/encaixe", require("../servidor/encaixe-pdf"));
  app.use("/api/encaixe", require("../servidor/encaixe-memoria"));
  app.use("/api/reposicao", require("../servidor/reposicao-api"));
  servidor = await new Promise((resolve) => {
    const atual = app.listen(0, "127.0.0.1", () => resolve(atual));
  });
  const base = `http://127.0.0.1:${servidor.address().port}`;
  async function api(method, rota, body) {
    const cru = Buffer.isBuffer(body);
    const resposta = await fetch(base + rota, {
      method,
      headers: body === undefined ? {} : { "Content-Type": cru ? "image/jpeg" : "application/json" },
      body: body === undefined ? undefined : cru ? body : JSON.stringify(body),
    });
    const bytes = Buffer.from(await resposta.arrayBuffer());
    return {
      status: resposta.status, bytes, headers: resposta.headers,
      dados: resposta.headers.get("content-type")?.includes("application/json")
        ? JSON.parse(bytes.toString()) : null,
    };
  }
  const peca = {
    papel: "frente", largura: 10, altura: 10, quantidade: 1,
    contorno: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
  };
  const recorde = { chave: "regressao-parcial", consumo: 10, pecas: ["peca-1"],
    posicoes: [{ indice: 0, copia: 1, x: 0, y: 0, rot: 0 }] };
  await api("POST", "/api/encaixe/guardado", recorde);
  const completo = await api("POST", "/api/encaixe/guardado", { ...recorde, consumo: 20, totalItens: 2,
    posicoes: [...recorde.posicoes, { indice: 0, copia: 2, x: 10, y: 0, rot: 0 }] });
  conferir("recorde parcial antigo não impede guardar todas as peças", () => {
    assert.equal(completo.status, 200);
    assert.equal(completo.dados.guardado, true);
  });
  const parcial = await api("POST", "/api/encaixe/guardado", { ...recorde, totalItens: 2 });
  conferir("recorde que declara peças ausentes é recusado", () => assert.equal(parcial.status, 400));
  const molde = (await api("POST", "/api/moldes", { nome: "Molde", pecas: [peca] })).dados.id;
  // A linha em volta da peça (docs/superpowers/specs/2026-09-30-linha-em-volta-da-peca-design.md):
  // molde sem o campo lê 0; gravada volta igual; PUT sem o campo mantém; fora de 0–10 é limitada.
  const semLinha = (await api("GET", `/api/moldes/${molde}`)).dados;
  const comLinha = (await api("POST", "/api/moldes", { nome: "Com linha", pecas: [peca], linha: 2.5 })).dados.id;
  const lidoComLinha = (await api("GET", `/api/moldes/${comLinha}`)).dados;
  await api("PUT", `/api/moldes/${comLinha}`, { nome: "Com linha", pecas: [peca] });
  const linhaMantida = (await api("GET", `/api/moldes/${comLinha}`)).dados;
  await api("PUT", `/api/moldes/${comLinha}`, { nome: "Com linha", pecas: [peca], linha: 99 });
  const limitada = (await api("GET", `/api/moldes/${comLinha}`)).dados;
  await api("DELETE", `/api/moldes/${comLinha}`);
  conferir("a linha em volta da peça: 0 sem o campo, grava, PUT sem o campo mantém, limita a 10 mm", () => {
    assert.equal(semLinha.linha, 0);
    assert.equal(lidoComLinha.linha, 2.5);
    assert.equal(linhaMantida.linha, 2.5);
    assert.equal(limitada.linha, 10);
    assert.equal("linha_mm" in lidoComLinha, false, "a tela recebe `linha`, não o nome da coluna");
  });
  const cliente = (await api("POST", "/api/projetos/clientes", { nome: "Cliente" })).dados.id;
  const projeto = (await api("POST", "/api/projetos", { nome: "Projeto", clienteId: cliente })).dados.id;
  const original = { nome: "Projeto", pecas: [{ ...peca, arquivo: "original.png" }] };
  assert.equal((await api("PUT", `/api/projetos/${projeto}`, original)).status, 200);

  for (const arquivo of ["../../fora.txt", "..\\..\\fora.txt", "C:\\fora.txt", "imagem.png:stream"]) {
    const projetoRuim = await api("PUT", `/api/projetos/${projeto}`, {
      nome: "Não deve gravar", pecas: [{ ...peca, arquivo }],
    });
    const estampaRuim = await api("POST", `/api/moldes/${molde}/artes`, {
      nome: "Estampa", pecas: [{ papel: "frente", arquivo }],
    });
    conferir(`caminho externo recusado em projeto e estampa (${arquivo})`, () => {
      assert.equal(projetoRuim.status, 400);
      assert.equal(estampaRuim.status, 400);
    });
  }
  const preservado = (await api("GET", `/api/projetos/${projeto}`)).dados;
  conferir("validação preserva o projeto anterior", () => {
    assert.equal(preservado.nome, "Projeto");
    assert.equal(preservado.pecas[0].arquivo, "original.png");
  });

  const uploads = path.join(pasta, "uploads", "projetos");
  const fora = path.join(pasta, "fora.txt");
  fs.writeFileSync(fora, "preservar");
  fs.writeFileSync(path.join(uploads, "compartilhada.png"), "compartilhada");
  fs.writeFileSync(path.join(uploads, "solta.png"), "solta");
  limparImagensSoltas(uploads, { all: () => [{ arquivo: "compartilhada.png" }] }, [
    "../../fora.txt", "..\\..\\fora.txt", "compartilhada.png", "solta.png", "solta.png",
  ]);
  conferir("limpeza ignora caminhos antigos inseguros e mantém imagem compartilhada", () => {
    assert.equal(fs.readFileSync(fora, "utf8"), "preservar");
    assert.ok(fs.existsSync(path.join(uploads, "compartilhada.png")));
    assert.ok(!fs.existsSync(path.join(uploads, "solta.png")));
  });
  if (process.platform === "win32") {
    limparImagensSoltas(uploads, { all: () => [{ arquivo: "COMPARTILHADA.PNG" }] }, ["compartilhada.png"]);
    conferir("nome com caixa diferente ainda conta como arquivo compartilhado no Windows", () => {
      assert.ok(fs.existsSync(path.join(uploads, "compartilhada.png")));
    });
  }

  const jpeg = (background) => sharp({ create: { width: 2, height: 2, channels: 3, background } }).jpeg().toBuffer();
  const vermelha = await jpeg("red");
  const azul = await jpeg("blue");
  async function enviar(sessao, chave, bytes) {
    const r = await api("POST", `/api/encaixe/arte?sessao=${encodeURIComponent(sessao)}&chave=${encodeURIComponent(chave)}`, bytes);
    assert.equal(r.status, 200);
  }
  async function pdf(sessao, chaves, extras = {}) {
    return api("POST", "/api/encaixe/pdf", {
      sessao, larguraTecido: 20, consumo: 20,
      imagens: chaves.map((chave) => ({ chave })),
      posicoes: chaves.map((chave, i) => ({ chave, x: i * 5, y: 0, largura: 5, altura: 5 })),
      ...extras,
    });
  }
  await enviar("sessao.1", "frente", vermelha);
  await enviar("sessao1", "frente", azul);
  const primeira = await pdf("sessao.1", ["frente"]);
  const segunda = await pdf("sessao1", ["frente"]);
  conferir("sessões com identificadores parecidos guardam e limpam suas próprias artes", () => {
    assert.equal(primeira.status, 200);
    assert.equal(segunda.status, 200);
    assert.ok(primeira.bytes.includes(vermelha));
    assert.ok(!primeira.bytes.includes(azul));
    assert.ok(segunda.bytes.includes(azul));
  });
  await enviar("pecas", "frente.1", vermelha);
  await enviar("pecas", "frente1", azul);
  const duas = await pdf("pecas", ["frente.1", "frente1"]);
  conferir("chaves diferentes da mesma sessão não sobrescrevem imagens", () => {
    assert.equal(duas.status, 200);
    assert.ok(duas.bytes.includes(vermelha));
    assert.ok(duas.bytes.includes(azul));
  });
  await enviar("nome", "arte", vermelha);
  const unicode = await pdf("nome", ["arte"], { nome: 'João "Equipe" 日本' });
  conferir("nome de PDF aceita aspas e Unicode", () => {
    assert.equal(unicode.status, 200);
    assert.ok(unicode.headers.get("content-disposition").includes("filename*=UTF-8''"));
    assert.ok(unicode.bytes.includes(vermelha));
  });
  await enviar("reenvio", "arte", vermelha);
  await enviar("reenvio", "arte", azul);
  const mantida = await pdf("reenvio", ["arte"], { manterSessao: true });
  const encerrada = await pdf("reenvio", ["arte"]);
  const removida = await pdf("reenvio", ["arte"]);
  conferir("reenvio substitui a arte e manterSessao atende as bancadas seguintes", () => {
    assert.ok(mantida.bytes.includes(azul));
    assert.ok(encerrada.bytes.includes(azul));
    assert.equal(removida.status, 400);
  });

  // A rede é simulada, mas a leitura da foto é a do Sharp de produção. Assim
  // exercitamos o erro de decodificação sem modelos nem rostos de pessoas.
  const arquivoRostos = path.join(__dirname, "../servidor/rostos.js");
  const requireRostos = createRequire(arquivoRostos);
  const moduloRostos = { exports: {} };
  const saidasVazias = {};
  for (const passo of [8, 16, 32]) {
    const celulas = (640 / passo) ** 2;
    for (const [nome, canais] of [["cls", 1], ["obj", 1], ["bbox", 4], ["kps", 10]]) {
      saidasVazias[`${nome}_${passo}`] = { data: new Float32Array(celulas * canais) };
    }
  }
  const carregarRostos = vm.runInThisContext(
    `(function(require, module, exports, __dirname) {${fs.readFileSync(arquivoRostos, "utf8")}\n})`,
    { filename: arquivoRostos },
  );
  carregarRostos((nome) => {
    if (nome === "fs") return { ...fs, existsSync: () => true };
    if (nome === "onnxruntime-node") return {
      InferenceSession: { create: async () => ({ run: async () => saidasVazias }) },
      Tensor: class {},
    };
    return requireRostos(nome);
  }, moduloRostos, moduloRostos.exports, path.dirname(arquivoRostos));
  const rostos = moduloRostos.exports;
  const quebrada = await rostos.vetorDaFoto(Buffer.from("imagem corrompida"));
  const semRosto = await rostos.vetorDaFoto(vermelha);
  conferir("imagem corrompida devolve erro de reconhecimento sem rejeição não tratada", () => {
    assert.equal(typeof quebrada.erro, "string");
    assert.equal(semRosto.erro, "Não achei nenhum rosto nesta foto.");
  });
  const criado = await api("POST", "/api/reposicao/trabalhos", {
    nome: "teste-pedidos", larguraTecido: 178, consumoCm: 100,
    pecas: [
      { nome: "COSTAS G", largura: 50, altura: 70, qtd: 2, giro: "180", pedido: "joão", sigla: "xy" },
      { nome: "TIRA", largura: 12, altura: 60, qtd: 1, giro: "180" },
    ],
  });
  const lido = await api("GET", `/api/reposicao/trabalhos/${criado.dados.id}`);
  conferir("a reposição guarda o pedido e a sigla de cada peça, e devolve igual", () => {
    assert.equal(criado.status, 200);
    assert.equal(lido.dados.pecas[0].pedido, "JOAO");
    assert.equal(lido.dados.pecas[0].sigla, "XY");
    assert.equal(lido.dados.pecas[1].pedido, null);
    assert.equal(lido.dados.pecas[1].sigla, null);
  });

  console.log(`OK — ${passou} regressões do backend.`);
}

principal().catch((erro) => { console.error(erro); process.exitCode = 1; }).finally(async () => {
  if (servidor) await new Promise((resolve) => servidor.close(resolve));
  db.close();
  os.tmpdir = tmpdirOriginal;
  fs.rmSync(pasta, { recursive: true, force: true });
});
