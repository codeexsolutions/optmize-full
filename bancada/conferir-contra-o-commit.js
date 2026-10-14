#!/usr/bin/env node
/**
 * Confere que o motor de agora encaixa EXATAMENTE como o de um commit.
 *
 * Para que serve
 * --------------
 * Mexida de desempenho no motor tem uma regra só: o encaixe não pode mudar.
 * Mais rápido e diferente é outra coisa — é mexida no resultado, e essa se
 * mede na bancada de metragem (`medir.js`), não se presume. Esta conferência é
 * a prova de que uma refatoração é só refatoração.
 *
 * Como funciona
 * -------------
 * Tira do git a árvore do commit pedido (`src/` e o `.wasm`) para uma pasta
 * temporária, empacota as duas versões do motor com o mesmo esbuild da bancada
 * e roda os CINCO encaixadores — contorno (em JavaScript e em WASM), vãos,
 * faixas, blocos e caixa — nos trabalhos da bancada, em várias ordens
 * sorteadas, nas duas heurísticas, nos dois saltos, com e sem bancada e com e
 * sem a repescagem. Compara peça por peça: posição, giro, consumo e o que
 * ficou de fora.
 *
 *   node bancada/conferir-contra-o-commit.js            contra o HEAD
 *   node bancada/conferir-contra-o-commit.js main~3     contra outro commit
 *   node bancada/conferir-contra-o-commit.js --ordens 2 mais rápido
 *
 * O que ela NÃO compara: a área das peças lidas de imagem (`areaReal`). As
 * peças da bancada nascem de polígono e não passam por essa conta.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { PARA_A_BANCADA } = require("../empacotar/modulos-do-motor");
const { prepararPeca, expandir } = require("./pecas");
const { TRABALHOS } = require("./trabalhos");

const RAIZ = path.join(__dirname, "..");

function lerArgumentos(argv) {
  const opcoes = { commit: "HEAD", ordens: 3, trabalhos: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--ordens") opcoes.ordens = Math.max(1, Number(argv[++i]) || 3);
    else if (argv[i] === "--trabalhos") opcoes.trabalhos = argv[++i].split(",");
    else opcoes.commit = argv[i];
  }
  return opcoes;
}

/** Empacota os motores de `raiz` e carrega o WASM que mora nela. */
async function carregarDe(raiz, pastaTemporaria, comWasm) {
  const esbuild = require("esbuild");
  const entrada = path.join(pastaTemporaria, `entrada-${comWasm ? "w" : "j"}-${path.basename(raiz)}.js`);
  const saida = entrada.replace(/\.js$/, ".mjs");
  fs.writeFileSync(entrada, PARA_A_BANCADA
    .map((nome) => `export * from ${JSON.stringify(path.join(raiz, "src", nome).split(path.sep).join("/"))};`)
    .join("\n"), "utf8");
  await esbuild.build({
    entryPoints: [entrada], outfile: saida, bundle: true, format: "esm", platform: "neutral",
    target: "node24", resolveExtensions: [".mjs", ".js", ".ts", ".tsx", ".jsx", ".json"],
    define: { "import.meta.env.BASE_URL": '"/"' }, logLevel: "warning",
  });
  const motor = { ...(await import("file:///" + saida.split(path.sep).join("/"))) };
  if (comWasm && !(await motor.carregarMotorWasm(fs.readFileSync(path.join(raiz, "estatico/encaixe.wasm"))))) {
    throw new Error(`o WASM de ${raiz} não carregou`);
  }
  return motor;
}

function embaralharFixo(lista, semente) {
  const saida = lista.slice();
  let estado = semente >>> 0;
  for (let i = saida.length - 1; i > 0; i--) {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    const j = estado % (i + 1);
    [saida[i], saida[j]] = [saida[j], saida[i]];
  }
  return saida;
}

const assinar = (r) => [
  `consumo=${r.consumo.toFixed(6)}`,
  `fora=${r.naoEncaixadas.length}`,
  ...r.posicoes.map((p) => `${p.item.indice}#${p.item.copia}@${p.x.toFixed(4)},${p.y.toFixed(4)}`
    + `r${p.rot == null ? (p.girado ? "g" : "") : p.rot}b${p.bancada || 0}`),
].join("\n");

function montar(motor, nome) {
  const receita = TRABALHOS[nome];
  const { passo, raio } = motor.grade(receita.larguraTecido, receita.espaco);
  const pecas = receita.pecas.map((p) => prepararPeca(motor, p.nome, {
    passo, raio, giro: p.giro || "180", qtd: p.qtd,
  }));
  const itens = expandir(pecas);
  const alturaMax = itens.reduce((s, it) => s + Math.max(it.largura, it.altura) + receita.espaco, 0);
  return { receita, passo, raio, itens, alturaMax };
}

/** Todas as rodadas de um trabalho, numa instância do motor. Devolve as assinaturas. */
function rodadas(motor, nome, ordens) {
  const t = montar(motor, nome);
  const saida = [];
  const base = {
    larguraTecido: t.receita.larguraTecido, espaco: t.receita.espaco, passo: t.passo, raio: t.raio,
    alturaMax: t.alturaMax,
  };
  for (const bancada of [0, 200]) {
    for (const tamanho of [1, 2]) {
      const unidades = motor.montarUnidades(t.itens, tamanho);
      const cortes = motor.cortesDeFaixa(motor.montarUnidades(t.itens, 2), { ...base, comprimentoBancada: bancada });
      for (let o = 0; o < ordens; o++) {
        const lista = embaralharFixo(unidades.map((_, i) => i), 1 + o * 7919).map((i) => unidades[i]);
        for (const heuristica of ["fundo", "vazio"]) {
          for (const saltoX of [1, 3]) {
            const config = { ...base, comprimentoBancada: bancada, heuristica, saltoX };
            saida.push([`contorno ${tamanho}/${o}/${heuristica}/${saltoX}/b${bancada}`,
              assinar(motor.encaixarContorno(lista, config))]);
            saida.push([`vaos ${tamanho}/${o}/${heuristica}/${saltoX}/b${bancada}`,
              assinar(motor.encaixarPorVaos(lista, config))]);
            saida.push([`blocos ${tamanho}/${o}/${heuristica}/${saltoX}/b${bancada}`,
              assinar(motor.encaixarPorBlocos(lista, config))]);
            if (cortes.length > 0) {
              saida.push([`faixas ${tamanho}/${o}/${heuristica}/${saltoX}/b${bancada}`,
                assinar(motor.encaixarPorFaixas(lista, { ...config, corteCols: cortes[o % cortes.length] }))]);
            }
          }
          const repescado = { ...base, comprimentoBancada: bancada, heuristica, saltoX: 3, repescar: true, repescaVoltas: 3 };
          saida.push([`contorno+repesca ${tamanho}/${o}/${heuristica}/b${bancada}`,
            assinar(motor.encaixarContorno(lista, repescado))]);
          saida.push([`vaos+repesca ${tamanho}/${o}/${heuristica}/b${bancada}`,
            assinar(motor.encaixarPorVaos(lista, repescado))]);
        }
      }
    }
    for (let o = 0; o < ordens; o++) {
      const lista = embaralharFixo(t.itens.map((_, i) => i), 31 + o * 104729).map((i) => t.itens[i]);
      for (const heuristica of motor.HEURISTICAS_RETANGULO) {
        saida.push([`caixa ${o}/${heuristica}/b${bancada}`,
          assinar(motor.encaixar(lista, { ...base, comprimentoBancada: bancada, heuristica }))]);
      }
    }
  }
  return saida;
}

(async () => {
  const opcoes = lerArgumentos(process.argv.slice(2));
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "optimize-contra-commit-"));
  try {
    const antiga = path.join(pasta, "antiga");
    fs.mkdirSync(antiga);
    const tar = execFileSync("git", ["archive", opcoes.commit, "src", "estatico/encaixe.wasm"],
      { cwd: RAIZ, maxBuffer: 1 << 30 });
    fs.writeFileSync(path.join(pasta, "antiga.tar"), tar);
    // Caminhos RELATIVOS, de dentro da pasta: o `tar` do Git Bash lê o "C:"
    // de um caminho absoluto do Windows como nome de servidor remoto.
    execFileSync("tar", ["-xf", "antiga.tar", "-C", "antiga"], { cwd: pasta });

    const motores = {
      "antiga JS": await carregarDe(antiga, pasta, false),
      "agora JS": await carregarDe(RAIZ, pasta, false),
    };
    const comWasm = {
      "antiga WASM": await carregarDe(antiga, pasta, true),
      "agora WASM": await carregarDe(RAIZ, pasta, true),
    };

    const nomes = opcoes.trabalhos || Object.keys(TRABALHOS);
    let total = 0;
    let falhas = 0;
    for (const nome of nomes) {
      for (const [a, b] of [["antiga JS", "agora JS"], ["antiga WASM", "agora WASM"]]) {
        const ma = motores[a] || comWasm[a];
        const mb = motores[b] || comWasm[b];
        const ra = rodadas(ma, nome, opcoes.ordens);
        const rb = rodadas(mb, nome, opcoes.ordens);
        for (let i = 0; i < ra.length; i++) {
          total++;
          if (ra[i][1] !== rb[i][1]) {
            falhas++;
            if (falhas <= 8) {
              const la = ra[i][1].split("\n"), lb = rb[i][1].split("\n");
              const k = la.findIndex((l, j) => l !== lb[j]);
              console.error(`DIFERENTE · ${nome} · ${ra[i][0]} · ${a} × ${b}\n    antes: ${la[k]}\n    agora: ${lb[k]}`);
            }
          }
        }
      }
      process.stdout.write(`  ${nome}: conferido\n`);
    }
    console.log("");
    if (falhas > 0) {
      console.error(`FALHOU — ${falhas} de ${total} rodadas saíram diferentes do commit ${opcoes.commit}.`);
      process.exit(1);
    }
    console.log(`OK — ${total} rodadas, o motor de agora encaixou idêntico ao do commit ${opcoes.commit}.`);
    process.exit(0);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
})();
