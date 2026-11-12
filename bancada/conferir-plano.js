#!/usr/bin/env node
/**
 * BANCADA — a porta do plano do sparrow (`planoDoSparrow`, em encaixeEncolher.js)
 *
 *   node bancada/conferir-plano.js
 *
 * O plano só pode ligar no rolo longo com avaliação cara (contorno de muitos
 * vértices). Confere, com as partidas guardadas do laboratório, que ele liga
 * nos pedidos de produção (onde o E7/E8 mediu ganho) e fica desligado nos
 * curtos e no lote-grande (grade de 5 mm, onde o E7B mediu perda).
 */
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { carregarMotor } = require("./motor");
const { prepararPeca, expandir } = require("./pecas");
const { TRABALHOS } = require("./trabalhos");

const ESPERADO = {
  "producao-avulsa": true, "producao-misturada": true, "pedido-uniforme": true, "producao-uniforme": true,
  "lote-grande": false, "pedido-confeccao": false, "camiseta+manga+gola": false, "giro-livre": false,
  "calca-bolso": false, "misturado-pequeno": false,
};

(async () => {
  const motor = await carregarMotor({ comWasm: false });
  const partidas = JSON.parse(fs.readFileSync(path.join(__dirname, "../docs/optimize/vnext/dados/partidas.json"), "utf8"));
  for (const [nome, liga] of Object.entries(ESPERADO)) {
    const r = TRABALHOS[nome];
    const { passo, raio } = motor.grade(r.larguraTecido, r.espaco);
    const itens = expandir(r.pecas.map((p) => prepararPeca(motor, p.nome, { passo, raio, giro: p.giro || "180", qtd: p.qtd })));
    const vertices = motor.cargaDeVertices(itens);
    const comprimento = partidas[nome] ? partidas[nome].consumo : null;
    assert.ok(comprimento, `sem partida guardada para ${nome}`);
    const plano = motor.planoDoSparrow({ comprimento, larguraTecido: r.larguraTecido, vertices });
    console.log(`${nome.padEnd(22)} proporção ${(comprimento / r.larguraTecido).toFixed(1).padStart(5)}  vértices/peça ${vertices.toFixed(0).padStart(4)}  plano ${plano ? "LIGADO" : "desligado"}`);
    assert.equal(!!plano, liga, `${nome}: o plano devia estar ${liga ? "ligado" : "desligado"}`);
  }
  console.log("OK — o plano liga onde mediu ganho e fica de fora onde mediu perda");
})().catch((e) => { console.error(e); process.exit(1); });
