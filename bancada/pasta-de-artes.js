/**
 * Um trabalho de bancada a partir de uma PASTA DE ARTES de verdade (PNG/JPG),
 * como a pessoa joga no Encaixe: a medida sai do dpi do arquivo (300 dpi
 * quando ele não diz), a quantidade do nome ("10X ...", "5x"), e a silhueta
 * do alfa, reduzida à grade com sub-amostras — o mesmo `silhuetaDeDados` da
 * tela. Serve para medir o motor no trabalho de um cliente, e não só nas
 * peças desenhadas da bancada.
 *
 *   const { trabalhoDaPasta } = require("./pasta-de-artes");
 *   const t = await trabalhoDaPasta(motor, "C:/.../DTF", { larguraTecido: 58.5, espaco: 0.2, giro: "livre" });
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { expandir } = require("./pecas");

const DPI_PADRAO = 300;
const SUB_MAX = 4;

function quantidadeDoNome(nome) {
  const semMedidas = nome.replace(/\d+\s*[xX]\s*\d+/g, (m) => "\0".repeat(m.length));
  const m = semMedidas.match(/(^|[^\d])(\d+)\s*[xX](?![\d])/) || semMedidas.match(/[xX]\s*(\d+)()/);
  const qtd = m ? Number(m[2] || m[1]) : 1;
  return qtd >= 1 && qtd < 1000 ? qtd : 1;
}

async function pecaDaArte(motor, arquivo, { passo, raio, giro }) {
  const meta = await sharp(arquivo).metadata();
  const dpi = meta.density && meta.density > 30 ? meta.density : DPI_PADRAO;
  const largura = (meta.width / dpi) * 2.54;
  const altura = (meta.height / dpi) * 2.54;
  const { cols, rows } = motor.gradeDaPeca({ largura, altura }, passo);
  const sub = Math.max(1, Math.min(SUB_MAX, Math.floor(meta.width / (largura / passo))));
  // A arte entra na grade no tamanho de verdade, sem esticar: o que sobra da
  // última coluna e linha fica transparente (ver `gradeDaPeca`).
  const W = cols * sub, H = rows * sub;
  const w = Math.max(1, Math.round((largura / passo) * sub));
  const h = Math.max(1, Math.round((altura / passo) * sub));
  const { data } = await sharp(arquivo).ensureAlpha()
    .resize(w, h, { fit: "fill", kernel: "lanczos3" })
    .extend({ right: W - w, bottom: H - h, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw().toBuffer({ resolveWithObject: true });
  const silhueta = motor.silhuetaDeDados(new Uint8ClampedArray(data), cols, rows, sub);
  const mascaras = motor.mascarasDeSilhueta(silhueta, cols, rows, passo, raio, { largura, altura });
  const nome = path.basename(arquivo).replace(/\.[^.]+$/, "");
  return { nome, giro, qtd: quantidadeDoNome(nome), largura, altura, mascaras, ocupacao: mascaras.ocupacao };
}

async function trabalhoDaPasta(motor, pasta, { larguraTecido, espaco, giro = "livre" }) {
  const { passo, raio, folgaReal } = motor.grade(larguraTecido, espaco);
  const arquivos = fs.readdirSync(pasta).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();
  const pecas = [];
  for (const f of arquivos) pecas.push(await pecaDaArte(motor, path.join(pasta, f), { passo, raio, giro }));
  const itens = expandir(pecas);
  const alturaMax = itens.reduce((soma, it) => soma + Math.max(it.largura, it.altura) + espaco, 0);
  const receita = { larguraTecido, espaco, comprimentoBancada: 0, pecas: pecas.map((p) => ({ nome: p.nome, qtd: p.qtd, giro })) };
  return { nome: path.basename(pasta), receita, pecas, itens, passo, raio, folgaReal, alturaMax };
}

module.exports = { trabalhoDaPasta, quantidadeDoNome };
