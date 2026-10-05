#!/usr/bin/env node
/**
 * A medição com as ARTES REAIS: os trabalhos que a Reposição guardou, com a
 * silhueta tirada da arte como a tela tira, encaixados como a produção encaixa
 * (busca + sparrow). Foi daqui que saiu a spec de juntar pedidos (2026-10-01).
 *
 * Nenhuma arte entra no repositório: isto lê o `dados.db` e o
 * `uploads/reposicao/` DESTA máquina. Sem eles, avisa e sai.
 *
 *   node bancada/medir-guardados.js                 todos os trabalhos
 *   node bancada/medir-guardados.js 6,1             só esses
 *   node bancada/medir-guardados.js 6+1             os dois num rolo só
 *   node bancada/medir-guardados.js 6 --tempo 180   tempo fixo, em segundos
 *   node bancada/medir-guardados.js 6 --mult 1,3    1x e 3x o tempo sugerido
 *   node bancada/medir-guardados.js 6 --busca       também só a busca, sem o sparrow
 *
 * O tempo "da produção" é o `tempoSugerido` de src/producao/tempoSugerido.js.
 */
const fs = require("fs");
const path = require("path");
const RAIZ = path.join(__dirname, "..");
const BANCO = path.join(RAIZ, "dados.db");
if (!fs.existsSync(BANCO)) {
  console.log("Sem dados.db nesta máquina: não há trabalho guardado para medir.");
  process.exit(0);
}
const Database = require("better-sqlite3");
const sharp = require("sharp");
const { carregarMotor } = require("./motor");
const { expandir } = require("./pecas");
const { buscarComoAProducao, FATIAS } = require("./corrida");

const args = process.argv.slice(2);
const opcao = (nome) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : null; };
const ids = (args.find((a) => /^[\d,+]+$/.test(a)) || "").split(",").filter(Boolean);
const mults = (opcao("--mult") || "1").split(",").map(Number);
const tempoFixo = Number(opcao("--tempo")) || 0;
const comSoBusca = args.includes("--busca");

async function pecaReal(motor, p, passo, raio) {
  const arquivo = path.join(RAIZ, "uploads", "reposicao", p.arquivo);
  const meta = await sharp(arquivo).metadata();
  // A medida é a gravada: é a que a tela usou (a do arquivo pode ser a de uma
  // prancheta inteira).
  const L = p.largura, A = p.altura;
  const { cols, rows } = motor.gradeDaPeca({ largura: L, altura: A }, passo);
  const sub = motor.subamostrasDaArte(meta.width, L, cols, rows, passo);
  const W = cols * sub, H = rows * sub;
  const w = Math.max(1, Math.min(W, Math.round((L / passo) * sub)));
  const h = Math.max(1, Math.min(H, Math.round((A / passo) * sub)));
  const dados = await sharp(arquivo, { limitInputPixels: false }).ensureAlpha()
    .resize(w, h, { fit: "fill", kernel: "linear" })
    .extend({ right: W - w, bottom: H - h, extendWith: "copy" })
    .raw().toBuffer();
  const silhueta = motor.silhuetaDeDados(new Uint8ClampedArray(dados), cols, rows, sub,
    { fundoSaiNoPdf: !meta.hasAlpha });
  const mascaras = motor.mascarasDeSilhueta(silhueta, cols, rows, passo, raio, { largura: L, altura: A });
  return { nome: p.nome, giro: p.giro || "180", qtd: p.qtd, largura: L, altura: A, mascaras,
    ocupacao: mascaras.ocupacao, _cacheMascaras: mascaras };
}

(async () => {
  const { tempoSugerido } = await import("./carregarModulo.mjs")
    .then(({ carregarModulo }) => carregarModulo("src/producao/tempoSugerido.js"));
  const motor = await carregarMotor({ comWasm: true });
  if (!motor.comEncolhedor) throw new Error("o encolhedor não carregou (npm run build:encolher)");
  const db = new Database(BANCO, { readonly: true });
  const todos = db.prepare("SELECT id FROM reposicao_trabalhos ORDER BY id").all().map((t) => String(t.id));
  for (const id of ids.length ? ids : todos) {
    const grupo = id.split("+").map(Number);
    const ts = grupo.map((g) => db.prepare("SELECT * FROM reposicao_trabalhos WHERE id = ?").get(g));
    if (ts.some((t) => !t)) { console.log(`#${id}: não existe`); continue; }
    const linhas = grupo.flatMap((g) =>
      db.prepare("SELECT * FROM reposicao_pecas WHERE trabalho_id = ? ORDER BY ordem").all(g));
    if (linhas.some((p) => !p.arquivo || !fs.existsSync(path.join(RAIZ, "uploads", "reposicao", p.arquivo)))) {
      console.log(`#${id}: falta arte no disco — pulado`);
      continue;
    }
    const largura = ts[0].largura_tecido, espaco = ts[0].folga;
    const { passo, raio } = motor.grade(largura, espaco);
    const pecas = [];
    for (const p of linhas) pecas.push(await pecaReal(motor, p, passo, raio));
    const itens = expandir(pecas);
    const areaReal = itens.reduce((s, it) => s + it.mascaras.areaReal, 0);
    const piso = areaReal / largura;
    const trabalho = {
      nome: id, pecas, itens, passo, raio,
      alturaMax: itens.reduce((s, it) => s + Math.max(it.largura, it.altura) + espaco, 0),
      receita: { larguraTecido: largura, espaco, comprimentoBancada: 0 },
    };
    const base = tempoFixo || tempoSugerido(pecas);
    const guardado = ts.reduce((s, t) => s + t.consumo_cm, 0);
    console.log(`\n#${id}: ${itens.length} cópias, rolo ${largura}, folga ${espaco} | guardado `
      + `${(guardado / 100).toFixed(2)} m | piso ${(piso / 100).toFixed(2)} m | `
      + `area média ${(areaReal / itens.length).toFixed(0)} cm² | tempo ${base} s`);
    for (const mult of mults) {
      for (const encolher of comSoBusca ? [false, true] : [true]) {
        const relogio = Date.now();
        const r = await buscarComoAProducao(motor, trabalho, {
          tempoMs: base * mult * 1000, semente: 20261001, meta: 0, fatias: FATIAS,
          extra: { motores: "contorno+retangulo+vaos+faixas", encolher }, espalharSemente: true,
        });
        console.log(`  ${mult}x ${encolher ? "busca+sparrow" : "só busca     "}: ${(r.consumo / 100).toFixed(3)} m`
          + ` | aprov ${(r.aproveitamento * 100).toFixed(1)}% | acima do piso `
          + `${(100 * (r.consumo - piso) / piso).toFixed(1)}% [${((Date.now() - relogio) / 1000).toFixed(0)} s]`);
      }
    }
  }
})().catch((e) => { console.error(e); process.exit(1); });
