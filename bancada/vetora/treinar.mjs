/*
 * ===========================================================================
 * O TREINO DA REDE DA VETORA
 * ===========================================================================
 *
 *     node bancada/vetora/treinar.mjs [--dados bancada/vetora/dados/oraculo.jsonl] [--membros 5] [--epocas 120]
 *                                     [--escolhas escolhas.json]
 *
 * Lê o mapa de notas do oráculo (`oraculo.mjs`), separa as imagens em treino
 * (80%), validação (10%, para parar na hora certa e escolher o λ) e teste
 * (10%, que a rede nunca vê antes da nota final), e treina um comitê de redes
 * (`src/motores/vetorizador/rede/rede.js`): perceptrons de 64 → 64 com SiLU,
 * Adam com taxa em cosseno, parada antecipada pela validação. Cada membro é
 * um processo (os núcleos trabalham juntos) com semente própria.
 *
 * No fim, a NOTA DO TESTE compara, imagem a imagem, o que a rede escolheu
 * com o melhor possível (o oráculo) e com os ajustes fixos de antes — e os
 * pesos vão para `src/motores/vetorizador/rede/pesos.json`, com as métricas.
 * A avaliação usa o código do programa (`rede.js` e `escolher.js`), não uma
 * cópia: o que foi medido é o que vai rodar.
 *
 * AS ESCOLHAS DE QUEM USA (`--escolhas`): o histórico que a tela guarda
 * (`src/telas/vetora/gosto.ts`, a chave "vetora:escolhas" do armazenamento
 * do programa — no console: `copy(localStorage.getItem("vetora:escolhas"))`)
 * vira o gosto de partida da rede nova: o λ do Equilibrado que o treino
 * mediu anda, escolha por escolha, como anda na tela. A rede passa a nascer
 * com o gosto de quem já usou.
 */
import fs from "node:fs";
import path from "node:path";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, "..", "..");
const args = process.argv.slice(2);
const opcao = (nome, padrao) => { const i = args.indexOf(`--${nome}`); return i >= 0 ? args[i + 1] : padrao; };
const DADOS = path.resolve(opcao("dados", path.join(AQUI, "dados", "oraculo.jsonl")));
const MEMBROS = Number(opcao("membros", 5));
const EPOCAS = Number(opcao("epocas", 120));
const OCULTAS = (opcao("ocultas", "64,64")).split(",").map(Number);
/** A taxa de aprendizado inicial e o decaimento dos pesos (a regularização). */
const TAXA = Number(opcao("taxa", 2e-3));
const DECAIMENTO = Number(opcao("decaimento", 1e-5));
const SAIDA = path.resolve(opcao("saida", path.join(RAIZ, "src", "motores", "vetorizador", "rede", "pesos.json")));
const MEMBRO = opcao("membro", null);
const ESCOLHAS = opcao("escolhas", null);
/** A curva de aprendizado: treinar com só esta fração das imagens de treino (a validação e o teste não mudam). */
const FRACAO = Number(opcao("fracao", 1));

// ==================== OS DADOS ====================

const alvoFiel = (certos) => -Math.log10(1 - certos + 1e-3);
const alvoErro = (erro) => Math.log10(erro + 1e-4);
const alvoNos = (nos) => Math.log10(nos + 1);

/** Treino, validação ou teste — pela semente, para a mesma imagem cair sempre no mesmo lugar. */
const parte = (semente) => (semente % 10 === 0 ? "teste" : semente % 10 === 1 ? "validacao" : "treino");

function lerImagens() {
  const imagens = [];
  for (const l of fs.readFileSync(DADOS, "utf8").split("\n")) {
    if (!l.trim()) continue;
    let o;
    try { o = JSON.parse(l); } catch { continue; }
    const rs = o.resultados.filter((r) => !r.falhou);
    const base = rs.filter((r) => !r.ia);
    if (base.length < 20 || o.carac.some((v) => !Number.isFinite(v))) continue;
    const media = [0, 0, 0];
    for (const r of base) { media[0] += alvoFiel(r.certos); media[1] += alvoErro(r.erro); media[2] += alvoNos(r.nos); }
    for (let k = 0; k < 3; k++) media[k] /= base.length;
    const p = parte(o.semente);
    if (p === "treino" && FRACAO < 1 && ((Math.imul(o.semente, 2654435761) >>> 0) % 1000) / 1000 >= FRACAO) continue;
    imagens.push({ ...o, rs, media, parte: p });
  }
  return imagens;
}

function linhas(imagens, nIn) {
  const n = imagens.reduce((t, im) => t + im.rs.length, 0);
  const X = new Float32Array(n * nIn), Y = new Float32Array(n * 3);
  let k = 0;
  for (const im of imagens) {
    for (const r of im.rs) {
      const x = X.subarray(k * nIn, (k + 1) * nIn);
      for (let i = 0; i < im.carac.length; i++) x[i] = im.carac[i];
      x[im.carac.length] = r.d / 100; x[im.carac.length + 1] = r.s / 100; x[im.carac.length + 2] = r.ia ? 1 : 0;
      Y[k * 3] = alvoFiel(r.certos) - im.media[0];
      Y[k * 3 + 1] = alvoErro(r.erro) - im.media[1];
      Y[k * 3 + 2] = alvoNos(r.nos) - im.media[2];
      k++;
    }
  }
  return { X, Y, n };
}

// ==================== A REDE (treino) ====================

function aleatorio(semente) {
  let s = semente >>> 0 || 1;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function treinarMembro({ X, Y, n }, val, nIn, ocultas, semente, epocas) {
  const r = aleatorio(semente);
  const normal = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  const tamanhos = [nIn, ...ocultas, 3];
  const camadas = [];
  for (let k = 0; k + 1 < tamanhos.length; k++) {
    const entra = tamanhos[k], sai = tamanhos[k + 1];
    const W = new Float32Array(entra * sai).map(() => normal() * Math.sqrt(2 / entra));
    camadas.push({ entra, sai, W, b: new Float32Array(sai), gW: new Float32Array(entra * sai), gb: new Float32Array(sai),
      mW: new Float32Array(entra * sai), vW: new Float32Array(entra * sai), mb: new Float32Array(sai), vb: new Float32Array(sai) });
  }
  const PESO = [1, 0.5, 1];
  const L = camadas.length;
  const ativ = tamanhos.map((t) => new Float64Array(t));   // saída de cada camada (pós-ativação)
  const pre = tamanhos.map((t) => new Float64Array(t));    // pré-ativação
  const delta = tamanhos.map((t) => new Float64Array(t));
  const sig = (v) => 1 / (1 + Math.exp(-v));

  function frente(x) {
    for (let i = 0; i < nIn; i++) ativ[0][i] = x[i];
    for (let k = 0; k < L; k++) {
      const c = camadas[k], a = ativ[k], z = pre[k + 1], o = ativ[k + 1];
      for (let j = 0; j < c.sai; j++) {
        let s = c.b[j];
        const linha = j * c.entra;
        for (let i = 0; i < c.entra; i++) s += c.W[linha + i] * a[i];
        z[j] = s;
        o[j] = k < L - 1 ? s * sig(s) : s;
      }
    }
    return ativ[L];
  }

  function perdaDe(dados) {
    let soma = 0;
    for (let k = 0; k < dados.n; k++) {
      const y = frente(dados.X.subarray(k * nIn, (k + 1) * nIn));
      for (let m = 0; m < 3; m++) soma += PESO[m] * (y[m] - dados.Y[k * 3 + m]) ** 2;
    }
    return soma / dados.n;
  }

  const ordem = new Uint32Array(n).map((_, i) => i);
  const LOTE = 128;
  let passo = 0;
  const totalDePassos = epocas * Math.ceil(n / LOTE);
  let melhor = { perda: Infinity, pesos: null, epoca: 0 };
  let paciencia = 0;
  for (let ep = 0; ep < epocas; ep++) {
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = ordem[i]; ordem[i] = ordem[j]; ordem[j] = t; }
    for (let ini = 0; ini < n; ini += LOTE) {
      const fim = Math.min(n, ini + LOTE);
      for (const c of camadas) { c.gW.fill(0); c.gb.fill(0); }
      for (let q = ini; q < fim; q++) {
        const k = ordem[q];
        const y = frente(X.subarray(k * nIn, (k + 1) * nIn));
        const dS = delta[L];
        for (let m = 0; m < 3; m++) dS[m] = 2 * PESO[m] * (y[m] - Y[k * 3 + m]);
        for (let c = L - 1; c >= 0; c--) {
          const cam = camadas[c], a = ativ[c], d = delta[c + 1], dAntes = delta[c];
          for (let i = 0; i < cam.entra; i++) dAntes[i] = 0;
          for (let j = 0; j < cam.sai; j++) {
            const g = d[j];
            if (g === 0) continue;
            cam.gb[j] += g;
            const linha = j * cam.entra;
            for (let i = 0; i < cam.entra; i++) { cam.gW[linha + i] += g * a[i]; dAntes[i] += g * cam.W[linha + i]; }
          }
          if (c > 0) {
            const z = pre[c];
            for (let i = 0; i < cam.entra; i++) { const s = sig(z[i]); dAntes[i] *= s * (1 + z[i] * (1 - s)); }
          }
        }
      }
      // Adam, com a taxa caindo em cosseno e um pouco de decaimento de peso.
      passo++;
      const taxa = TAXA * 0.5 * (1 + Math.cos((Math.PI * passo) / totalDePassos)) + TAXA / 100;
      const b1 = 0.9, b2 = 0.999, c1 = 1 - b1 ** passo, c2 = 1 - b2 ** passo, m = fim - ini;
      for (const c of camadas) {
        for (let i = 0; i < c.W.length; i++) {
          const g = c.gW[i] / m + DECAIMENTO * c.W[i];
          c.mW[i] = b1 * c.mW[i] + (1 - b1) * g; c.vW[i] = b2 * c.vW[i] + (1 - b2) * g * g;
          c.W[i] -= (taxa * (c.mW[i] / c1)) / (Math.sqrt(c.vW[i] / c2) + 1e-8);
        }
        for (let i = 0; i < c.b.length; i++) {
          const g = c.gb[i] / m;
          c.mb[i] = b1 * c.mb[i] + (1 - b1) * g; c.vb[i] = b2 * c.vb[i] + (1 - b2) * g * g;
          c.b[i] -= (taxa * (c.mb[i] / c1)) / (Math.sqrt(c.vb[i] / c2) + 1e-8);
        }
      }
    }
    const perdaVal = perdaDe(val);
    if (perdaVal < melhor.perda - 1e-5) {
      melhor = { perda: perdaVal, epoca: ep, pesos: camadas.map((c) => ({ entra: c.entra, sai: c.sai, W: Float32Array.from(c.W), b: Float32Array.from(c.b) })) };
      paciencia = 0;
    } else if (++paciencia >= 15) break;
    if (process.send) process.send({ andamento: { ep, perdaVal } });
  }
  return { camadas: melhor.pesos, perdaVal: melhor.perda, epoca: melhor.epoca, perdaTreino: perdaDe({ X, Y, n }) };
}

// ==================== O MEMBRO (processo filho) ====================

const paraBase64 = (f32) => Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength).toString("base64");

function prepararDados() {
  const imagens = lerImagens();
  const nCarac = imagens[0].carac.length;
  const nIn = nCarac + 3;
  const treino = imagens.filter((im) => im.parte === "treino");
  // A padronização das entradas e das saídas, medida só no treino.
  const mediaEntrada = new Array(nCarac).fill(0), desvioEntrada = new Array(nCarac).fill(0);
  for (const im of treino) im.carac.forEach((v, i) => { mediaEntrada[i] += v; });
  mediaEntrada.forEach((_, i) => { mediaEntrada[i] /= treino.length; });
  for (const im of treino) im.carac.forEach((v, i) => { desvioEntrada[i] += (v - mediaEntrada[i]) ** 2; });
  desvioEntrada.forEach((_, i) => { desvioEntrada[i] = Math.sqrt(desvioEntrada[i] / treino.length) || 1; });
  const padronizar = (lista) => lista.map((im) => ({ ...im, carac: im.carac.map((v, i) => (v - mediaEntrada[i]) / desvioEntrada[i]) }));
  const dTreino = linhas(padronizar(treino), nIn);
  const mediaSaida = [0, 0, 0], desvioSaida = [0, 0, 0];
  for (let k = 0; k < dTreino.n; k++) for (let m = 0; m < 3; m++) mediaSaida[m] += dTreino.Y[k * 3 + m];
  for (let m = 0; m < 3; m++) mediaSaida[m] /= dTreino.n;
  for (let k = 0; k < dTreino.n; k++) for (let m = 0; m < 3; m++) desvioSaida[m] += (dTreino.Y[k * 3 + m] - mediaSaida[m]) ** 2;
  for (let m = 0; m < 3; m++) desvioSaida[m] = Math.sqrt(desvioSaida[m] / dTreino.n) || 1;
  const normalizarY = (d) => { for (let k = 0; k < d.n; k++) for (let m = 0; m < 3; m++) d.Y[k * 3 + m] = (d.Y[k * 3 + m] - mediaSaida[m]) / desvioSaida[m]; return d; };
  normalizarY(dTreino);
  const dVal = normalizarY(linhas(padronizar(imagens.filter((im) => im.parte === "validacao")), nIn));
  return { imagens, nCarac, nIn, dTreino, dVal, mediaEntrada, desvioEntrada, mediaSaida, desvioSaida };
}

if (MEMBRO !== null) {
  const d = prepararDados();
  const t0 = Date.now();
  const m = treinarMembro(d.dTreino, d.dVal, d.nIn, OCULTAS, 1000 + Number(MEMBRO) * 7919, EPOCAS);
  process.send({
    membro: Number(MEMBRO),
    resultado: {
      camadas: m.camadas.map((c) => ({ entra: c.entra, sai: c.sai, W: paraBase64(c.W), b: paraBase64(c.b) })),
      perdaVal: m.perdaVal, perdaTreino: m.perdaTreino, epoca: m.epoca, segundos: (Date.now() - t0) / 1000,
    },
  });
  process.exit(0);
}

// ==================== O COMITÊ (processo principal) ====================

const { carregarModulo } = await import("../carregarModulo.mjs");
const rede = await carregarModulo("src/motores/vetorizador/rede/rede.js");
const escolher = await carregarModulo("src/motores/vetorizador/rede/escolher.js");
const carac = await carregarModulo("src/motores/vetorizador/rede/caracteristicas.js");

const d = prepararDados();
const contagem = { treino: 0, validacao: 0, teste: 0 };
for (const im of d.imagens) contagem[im.parte]++;
console.log(`treino da rede da Vetora: ${d.imagens.length} imagens (${contagem.treino} treino, ${contagem.validacao} validação, ${contagem.teste} teste), ${d.dTreino.n} linhas de treino, ${d.nCarac} características, camadas ${OCULTAS.join("→")}, ${MEMBROS} membros`);

const t0 = Date.now();
const treinarUm = (k) => new Promise((ok, falhou) => {
  const filho = fork(fileURLToPath(import.meta.url), [...args, "--membro", String(k)], { stdio: ["ignore", "inherit", "inherit", "ipc"] });
  let ultimo = -1;
  filho.on("message", (msg) => {
    if (msg.andamento && msg.andamento.ep % 10 === 0 && msg.andamento.ep !== ultimo) {
      ultimo = msg.andamento.ep;
      console.log(`  membro ${k}: época ${msg.andamento.ep}, perda na validação ${msg.andamento.perdaVal.toFixed(4)}`);
    }
    if (msg.resultado) ok(msg.resultado);
  });
  filho.on("exit", (codigo) => { if (codigo) falhou(new Error(`membro ${k} saiu com ${codigo}`)); });
});
// JUNTAR COMITÊS (`--juntar a.json,b.json`): em vez de treinar, junta os
// membros de pesos já treinados NOS MESMOS DADOS (a padronização tem de ser
// a mesma) num comitê só — redes de tamanhos diferentes erram diferente, e a
// média delas erra menos. O λ, a folga e a nota saem de novo, para o
// comitê junto.
const JUNTAR = opcao("juntar", null);
let membros;
if (JUNTAR) {
  membros = [];
  for (const arquivo of JUNTAR.split(",")) {
    const p = JSON.parse(fs.readFileSync(path.resolve(arquivo), "utf8"));
    const igual = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
    if (!igual(p.mediaEntrada, d.mediaEntrada) || !igual(p.mediaSaida, d.mediaSaida)) throw new Error(`${arquivo}: treinado com outros dados (a padronização não bate)`);
    for (const m of p.modelos) membros.push({ camadas: m.camadas, perdaVal: NaN, perdaTreino: NaN, epoca: -1, de: path.basename(arquivo) });
  }
  console.log(`comitê juntado: ${membros.length} membros de ${JUNTAR.split(",").length} arquivos`);
} else {
  // Quantos membros treinam ao mesmo tempo (`--paralelos`): com a memória
  // curta, menos processos de uma vez; o resultado é o mesmo, só demora mais.
  const PARALELOS = Math.max(1, Number(opcao("paralelos", MEMBROS)));
  membros = new Array(MEMBROS);
  let proximo = 0;
  await Promise.all(Array.from({ length: Math.min(PARALELOS, MEMBROS) }, async () => {
    while (proximo < MEMBROS) {
      const k = proximo++;
      membros[k] = await treinarUm(k);
    }
  }));
  console.log(`comitê treinado em ${((Date.now() - t0) / 1000).toFixed(0)} s: ` + membros.map((m, k) => `#${k} val ${m.perdaVal.toFixed(4)} (treino ${m.perdaTreino.toFixed(4)}, época ${m.epoca})`).join("; "));
}

const pesos = {
  versao: 1,
  versaoCarac: carac.VERSAO_DAS_CARACTERISTICAS,
  criadaEm: new Date().toISOString().slice(0, 10),
  imagens: contagem,
  camadas: JUNTAR ? "misto" : OCULTAS,
  mediaEntrada: d.mediaEntrada, desvioEntrada: d.desvioEntrada, mediaSaida: d.mediaSaida, desvioSaida: d.desvioSaida,
  lambda: 0.35, folgaDoLimpo: 0.3,
  modelos: membros.map((m) => ({ camadas: m.camadas })),
};

// ==================== A NOTA ====================

const PADRAO = { d: 50, s: 67, ia: 0 };
const chave = (a) => `${a.d}/${a.s}/${a.ia}`;
const real = (im, a) => im.rs.find((r) => r.d === a.d && r.s === a.s && (r.ia ? 1 : 0) === (a.ia ? 1 : 0));

/** Avalia o comitê num conjunto de imagens, com um λ (e uma folga do limpo). */
function avaliar(lista, lambda, rr, folga = null) {
  const soma = { fielRede: 0, fielOraculo: 0, fielPadrao: 0, fielFixo: 0, nosPadrao: 0, nosEq: 0, fielEq: 0, nosLimpo: 0, fielLimpo: 0, nosFixoLimpo: 0, fielFixoLimpo: 0, topo3: 0, iaEscolhida: 0, iaPossivel: 0 };
  const errados = (c) => 1 - c;
  for (const im of lista) {
    const comIa = im.rs.some((r) => r.ia);
    const modelos = escolher.escolherModelos(rr, im.carac, { comIa, lambda, folga });
    const [fiel, eq, limpo] = modelos.map((m) => real(im, m.ajuste));
    const melhor = im.rs.reduce((a, r) => (r.certos > a.certos ? r : a));
    const padrao = real(im, PADRAO);
    const fixo = real(im, { d: 100, s: 0, ia: 0 });
    const fixoLimpo = real(im, { d: 0, s: 100, ia: 0 });
    soma.fielRede += errados(fiel.certos); soma.fielOraculo += errados(melhor.certos); soma.fielPadrao += errados(padrao.certos); soma.fielFixo += errados(fixo.certos);
    soma.nosPadrao += padrao.nos; soma.nosEq += eq.nos; soma.fielEq += errados(eq.certos);
    soma.nosLimpo += limpo.nos; soma.fielLimpo += errados(limpo.certos); soma.nosFixoLimpo += fixoLimpo.nos; soma.fielFixoLimpo += errados(fixoLimpo.certos);
    const ordenados = [...im.rs].sort((a, b) => b.certos - a.certos).slice(0, 3).map((r) => chave({ d: r.d, s: r.s, ia: r.ia ? 1 : 0 }));
    if (ordenados.includes(chave(modelos[0].ajuste))) soma.topo3++;
    if (comIa) { soma.iaPossivel++; if (modelos[0].ajuste.ia) soma.iaEscolhida++; }
  }
  const n = lista.length;
  const pct = (v) => (100 * v) / n;
  return {
    imagens: n,
    erradosFiel: { rede: pct(soma.fielRede), oraculo: pct(soma.fielOraculo), padrao: pct(soma.fielPadrao), fixoDetalhado: pct(soma.fielFixo) },
    equilibrado: { nos: soma.nosEq / n, errados: pct(soma.fielEq), nosPadrao: soma.nosPadrao / n, erradosPadrao: pct(soma.fielPadrao) },
    limpo: { nos: soma.nosLimpo / n, errados: pct(soma.fielLimpo), nosFixo: soma.nosFixoLimpo / n, erradosFixo: pct(soma.fielFixoLimpo) },
    fielNoTopo3: soma.topo3 / n,
    iaNoFiel: soma.iaPossivel ? soma.iaEscolhida / soma.iaPossivel : 0,
  };
}

const rr = rede.criarRede(JSON.parse(JSON.stringify(pesos)), carac.VERSAO_DAS_CARACTERISTICAS);
const validacao = d.imagens.filter((im) => im.parte === "validacao");
const teste = d.imagens.filter((im) => im.parte === "teste");

// O λ do equilibrado: o MAIS FIEL que não pesa mais que o padrão de antes
// (até 15% a mais de nós, na média da validação). É a definição do modelo do
// meio: a fidelidade que a rede consegue sem o vetor ficar mais pesado. Se
// nenhum λ cabe no peso, fica o de menos nós.
let melhorLambda = null, menorErro = Infinity, maisLeve = { l: 1.3, nos: Infinity };
for (const l of [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.45, 0.6, 0.8, 1.0, 1.3, 1.7]) {
  const a = avaliar(validacao, l, rr);
  const eq = a.equilibrado;
  const ok = eq.nos <= eq.nosPadrao * 1.15;
  if (eq.nos < maisLeve.nos) maisLeve = { l, nos: eq.nos };
  console.log(`  λ ${l.toFixed(2)}: equilibrado com ${eq.nos.toFixed(0)} nós e ${eq.errados.toFixed(3)}% errados (padrão: ${eq.nosPadrao.toFixed(0)} nós, ${eq.erradosPadrao.toFixed(3)}%)${ok ? " ✓" : ""}`);
  if (ok && eq.errados < menorErro) { menorErro = eq.errados; melhorLambda = l; }
}
if (melhorLambda === null) melhorLambda = maisLeve.l;

// A folga do limpo: a MAIOR que deixa o limpo com no máximo 25% a mais de
// pixels errados que o padrão de antes, na validação — ele tem de ficar bem
// mais simples, mas não feio.
let melhorFolga = 0.3;
for (const f of [0.2, 0.3, 0.5, 0.75, 1, 1.5, 2]) {
  const a = avaliar(validacao, melhorLambda, rr, f);
  const ok = a.limpo.errados <= a.equilibrado.erradosPadrao * 1.25;
  console.log(`  folga ${f.toFixed(2)}: limpo com ${a.limpo.nos.toFixed(0)} nós e ${a.limpo.errados.toFixed(3)}% errados (padrão: ${a.equilibrado.nosPadrao.toFixed(0)} nós, ${a.equilibrado.erradosPadrao.toFixed(3)}%)${ok ? " ✓" : ""}`);
  if (ok) melhorFolga = f;
}
pesos.folgaDoLimpo = melhorFolga;
pesos.lambda = melhorLambda;
if (ESCOLHAS) {
  const lista = JSON.parse(fs.readFileSync(ESCOLHAS, "utf8"));
  let l = melhorLambda;
  const conta = { fiel: 0, equilibrado: 0, limpo: 0 };
  for (const e of lista) { l = escolher.aprenderGosto(l, e.escolhida); conta[e.escolhida] = (conta[e.escolhida] || 0) + 1; }
  console.log(`  as escolhas de quem usa (${lista.length}: ${conta.fiel} fiel, ${conta.equilibrado} equilibrado, ${conta.limpo} limpo): λ ${melhorLambda} → ${l.toFixed(3)}`);
  pesos.lambda = Math.round(l * 1000) / 1000;
  pesos.escolhasUsadas = lista.length;
}
const rrFinal = rede.criarRede(JSON.parse(JSON.stringify(pesos)), carac.VERSAO_DAS_CARACTERISTICAS);
// A nota da VALIDAÇÃO, para comparar configurações da rede (camadas,
// decaimento) sem olhar o teste — o teste só dá a nota final.
const notaVal = avaliar(validacao, melhorLambda, rrFinal, melhorFolga);
console.log(`  validação: fiel com ${notaVal.erradosFiel.rede.toFixed(3)}% errados (oráculo ${notaVal.erradosFiel.oraculo.toFixed(3)}%, padrão ${notaVal.erradosFiel.padrao.toFixed(3)}%) — fecha ${(100 * (notaVal.erradosFiel.padrao - notaVal.erradosFiel.rede) / Math.max(1e-9, notaVal.erradosFiel.padrao - notaVal.erradosFiel.oraculo)).toFixed(0)}% da distância`);
const nota = avaliar(teste, melhorLambda, rrFinal, melhorFolga);
pesos.metricas = { teste: nota, validacao: notaVal, lambda: melhorLambda, folgaDoLimpo: melhorFolga, comite: membros.map((m) => ({ perdaVal: m.perdaVal, epoca: m.epoca })) };

console.log(`\nNOTA NO TESTE (${nota.imagens} imagens que a rede nunca viu), λ = ${melhorLambda}, folga do limpo = ${melhorFolga}:`);
console.log(`  pixels errados, modelo FIEL:  rede ${nota.erradosFiel.rede.toFixed(3)}%  ·  oráculo (o melhor possível) ${nota.erradosFiel.oraculo.toFixed(3)}%  ·  padrão de antes ${nota.erradosFiel.padrao.toFixed(3)}%  ·  "detalhe 100" fixo ${nota.erradosFiel.fixoDetalhado.toFixed(3)}%`);
console.log(`  modelo EQUILIBRADO: ${nota.equilibrado.nos.toFixed(0)} nós e ${nota.equilibrado.errados.toFixed(3)}% errados  ·  padrão de antes: ${nota.equilibrado.nosPadrao.toFixed(0)} nós e ${nota.equilibrado.erradosPadrao.toFixed(3)}%`);
console.log(`  modelo LIMPO: ${nota.limpo.nos.toFixed(0)} nós e ${nota.limpo.errados.toFixed(3)}% errados  ·  "detalhe 0, suavidade 100" fixo: ${nota.limpo.nosFixo.toFixed(0)} nós e ${nota.limpo.erradosFixo.toFixed(3)}%`);
console.log(`  o fiel da rede está entre os 3 melhores ajustes do oráculo em ${(nota.fielNoTopo3 * 100).toFixed(1)}% das imagens; usa a IA em ${(nota.iaNoFiel * 100).toFixed(1)}% das que podiam`);

fs.writeFileSync(SAIDA, `${JSON.stringify(pesos)}\n`);
console.log(`\npesos: ${SAIDA} (${(fs.statSync(SAIDA).size / 1024).toFixed(0)} KB)`);
