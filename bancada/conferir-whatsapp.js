#!/usr/bin/env node
/**
 * ===========================================================================
 * CONFERIR O WHATSAPP — o navegador é sempre fechado?
 * ===========================================================================
 *
 * O bot mantém um Chrome invisível aberto, e isso custa de 300 a 500 MB. É um
 * preço conhecido e aceito ENQUANTO ELE ESTÁ CONECTADO. O que não pode
 * acontecer é pagar esse preço sem estar conectado — e era o que acontecia:
 *
 *   - o watchdog do `start()` só olhava o estado "starting", então assim que o
 *     primeiro QR aparecia ele desistia, e nada mais desligava o cliente. Um
 *     servidor real ficou 8,9 horas de pé renovando 906 QRs que ninguém leu, e
 *     morreu com falha de alocação de memória;
 *   - quando o `initialize()` falhava, a referência era solta mas o Chrome já
 *     tinha subido: virava órfão, sem ninguém para fechá-lo.
 *
 * Nenhum dos dois dá erro. O programa continua respondendo, a tela continua
 * desenhando, e a conta chega dias depois como "o servidor caiu sozinho".
 *
 * ---------------------------------------------------------------------------
 * POR QUE COM UM CLIENTE DE MENTIRA
 * ---------------------------------------------------------------------------
 *
 * Subir o WhatsApp Web de verdade depende de rede, de uma biblioteca não
 * oficial e de um site que muda sem avisar — tentando aqui, a primeira corrida
 * morreu num "Execution context was destroyed" que não tem nada a ver com o
 * que se quer medir. Uma conferência que falha por motivo alheio é uma
 * conferência que as pessoas aprendem a ignorar.
 *
 * O que precisa ser conferido é NOSSO: quando o relógio dispara, quando ele é
 * cancelado, e se o `destroy()` é chamado em cada saída. Um cliente de mentira
 * responde isso de forma determinística, em milissegundos.
 *
 *   npm run bancada:whatsapp
 */

const { EventEmitter } = require("events");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), "optimize-wa-"));
process.env.OPTIMIZE_DADOS = PASTA;
// Curto para a conferência não levar minutos; o padrão de verdade são 5 min.
process.env.WA_QR_TIMEOUT_MS = "250";

let passou = 0;
const falhas = [];

function conferir(oque, condicao, detalhe = "") {
  if (condicao) {
    passou++;
    console.log("  ok   " + oque);
  } else {
    falhas.push(oque + (detalhe ? " — " + detalhe : ""));
    console.log("  FALHOU " + oque + (detalhe ? " — " + detalhe : ""));
  }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ==================== O CLIENTE DE MENTIRA ====================

/** O último cliente que o módulo construiu, para a conferência espiar. */
let ultimo = null;

/*
 * Fica FORA da classe de propósito. Na primeira versão isto era uma
 * propriedade posta no protótipo antes do `start()` — e o construtor a
 * sombreava com `this.falharAoIniciar = false`, então a falha nunca acontecia
 * e o cenário passava sem exercitar nada.
 */
let proximoInicioFalha = false;

class ClienteFalso extends EventEmitter {
  constructor() {
    super();
    this.fechado = 0;
    this.saiu = 0;
    ultimo = this;
  }

  initialize() {
    if (!proximoInicioFalha) return Promise.resolve();
    proximoInicioFalha = false;
    return Promise.reject(new Error("Execution context was destroyed."));
  }

  destroy() { this.fechado++; return Promise.resolve(); }
  logout() { this.saiu++; return Promise.resolve(); }
}

/*
 * Trocar o módulo no `require.cache` antes de o `client.js` ser carregado é o
 * que faz o `require("whatsapp-web.js")` de lá receber isto. Vale também para
 * o `./navegador`: assim a conferência roda em máquina sem Chrome nenhum.
 */
function plantarMentiras() {
  const alvo = require.resolve("whatsapp-web.js");
  require.cache[alvo] = {
    id: alvo, filename: alvo, loaded: true, exports: {
      Client: ClienteFalso,
      LocalAuth: class { constructor() { /* nada */ } },
    },
  };

  const nav = require.resolve("../servidor/impressoras/whatsapp/navegador");
  require.cache[nav] = {
    id: nav, filename: nav, loaded: true, exports: {
      acharNavegador: () => "C:/chrome-de-mentira.exe",
      RECADO_SEM_NAVEGADOR: "sem navegador",
    },
  };
}

/** Um `client.js` novo em folha: o estado dele é de módulo, e não se reseta. */
function carregarClienteLimpo() {
  const alvo = require.resolve("../servidor/impressoras/whatsapp/client");
  delete require.cache[alvo];
  return require(alvo);
}

// ==================== AS CONFERÊNCIAS ====================

async function qrSemLeituraFechaONavegador() {
  console.log("\nQR que ninguém lê");
  const client = carregarClienteLimpo();

  client.start();
  ultimo.emit("qr", "2@abc/def+ghi=");
  conferir("o QR coloca o estado em 'qr'", client.getStatus().status === "qr",
    client.getStatus().status);
  conferir("o navegador continua aberto enquanto o QR vale", ultimo.fechado === 0);

  /*
   * Um QR NOVO no meio do caminho, que é o que o WhatsApp faz a cada ~20 s.
   *
   * A conta é o que prova a regra: o prazo são 250 ms contados do PRIMEIRO
   * código; o segundo chega aos 150 ms; a espera termina aos 350 ms. Se o
   * relógio reiniciasse a cada código, ele só dispararia aos 400 ms e o estado
   * ainda seria "qr" aqui embaixo — que é o defeito original, com outro nome.
   */
  await esperar(150);
  ultimo.emit("qr", "2@outro/codigo+novo=");
  await esperar(200);

  const cliente = ultimo;
  conferir("passado o prazo, o estado volta para 'off' — e o relógio conta"
    + " desde o PRIMEIRO QR, não desde o último",
    client.getStatus().status === "off", client.getStatus().status);
  conferir("E O NAVEGADOR É FECHADO", cliente.fechado === 1,
    `destroy() chamado ${cliente.fechado}x`);
  const recado = client.getStatus().lastError || "";
  conferir("o recado explica como tentar de novo", /Conectar/.test(recado), recado);
  conferir("e não diz que ainda está rodando", client.getStatus().running === false);

  // O defeito irmão: `stopping` preso em true fazia todo start() seguinte não
  // fazer nada, e o bot ficava morto sem dizer por quê.
  client.start();
  conferir("dá para conectar de novo depois da expiração",
    client.getStatus().status === "starting", client.getStatus().status);
  await client.stop();
}

async function quemLeONaoEhInterrompido() {
  console.log("\nQR que alguém lê a tempo");
  const client = carregarClienteLimpo();

  client.start();
  ultimo.emit("qr", "2@abc/def+ghi=");
  const cliente = ultimo;

  // Leu antes do prazo.
  await esperar(100);
  cliente.emit("authenticated");
  await esperar(300); // passa do prazo do relógio, que já devia estar solto

  conferir("o relógio é cancelado quando alguém lê o QR", cliente.fechado === 0,
    `destroy() chamado ${cliente.fechado}x`);
  conferir("o estado segue para 'starting'", client.getStatus().status === "starting",
    client.getStatus().status);

  cliente.emit("ready");
  await esperar(300);
  conferir("conectado, o navegador continua de pé (é o trabalho dele)",
    cliente.fechado === 0, `destroy() chamado ${cliente.fechado}x`);
  conferir("e o estado é 'ready'", client.getStatus().status === "ready");
  await client.stop();
  conferir("o stop() fecha o navegador", cliente.fechado === 1,
    `destroy() chamado ${cliente.fechado}x`);
}

async function inicioQueFalhaNaoDeixaOrfao() {
  console.log("\nInício que falha");
  const client = carregarClienteLimpo();

  proximoInicioFalha = true;
  client.start();

  await esperar(200);
  conferir("o estado vira 'error'", client.getStatus().status === "error",
    client.getStatus().status);
  conferir("E O NAVEGADOR JÁ SUBIDO É FECHADO", ultimo.fechado === 1,
    `destroy() chamado ${ultimo.fechado}x — orfão significa memória presa até o servidor morrer`);
  conferir("e dá para tentar de novo", client.start().status === "starting");
  await client.stop();
}

/*
 * O terceiro defeito, e o que explicava o sintoma que apareceu na loja: todo
 * restart do servidor abria um Chrome sozinho, num QR que ninguém pediu.
 *
 * A causa era o `hasSession()` perguntar só "a pasta tem alguma coisa dentro?".
 * A pasta é um perfil de Chrome inteiro, que o `LocalAuth` cria no instante em
 * que o navegador abre — antes de qualquer QR ser lido. Uma tentativa de
 * pareamento abandonada deixava 76 MB para trás e o servidor passava a achar,
 * para sempre, que havia sessão.
 */
async function autoStartSoAbreQuandoDeve() {
  console.log("\nO que o autoStart decide");
  const { SESSION_DIR } = carregarClienteLimpo();
  const RAIZ = path.dirname(SESSION_DIR);
  const MARCA = path.join(RAIZ, "pareado.json");

  const limpar = () => {
    fs.rmSync(SESSION_DIR, { recursive: true, force: true });
    fs.rmSync(MARCA, { force: true });
  };

  // 1. Nada guardado: não pode abrir navegador nenhum.
  limpar();
  let client = carregarClienteLimpo();
  ultimo = null;
  client.autoStart();
  conferir("sem nada guardado, o autoStart não abre navegador", ultimo === null,
    ultimo ? "abriu mesmo assim" : "");

  // 2. Perfil sem marca — o caso da tentativa abandonada. Tenta, porque pode
  //    ser alguém que já usava o bot antes de a marca existir; e agora o
  //    relógio do QR limita o estrago.
  limpar();
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  fs.writeFileSync(path.join(SESSION_DIR, "Preferences"), "{}", "utf8");
  client = carregarClienteLimpo();
  ultimo = null;
  client.autoStart();
  conferir("com perfil mas sem pareamento anotado, ainda tenta (não quebra quem"
    + " já usava o bot)", ultimo !== null);
  await client.stop();

  // 3. O `ready` tem que ANOTAR o pareamento — é o que faz o caso 2 virar
  //    caso 1 na próxima subida.
  limpar();
  client = carregarClienteLimpo();
  client.start();
  ultimo.emit("ready");
  await esperar(50);
  conferir("o 'ready' anota o pareamento em disco", fs.existsSync(MARCA),
    "sem a anotação, o servidor nunca reconecta sozinho");

  // 4. E o logout tem que apagar a anotação, senão o próximo restart tentaria
  //    reconectar uma sessão que a pessoa acabou de encerrar.
  await client.logout();
  conferir("o logout apaga a anotação", !fs.existsSync(MARCA));

  limpar();
}

async function principal() {
  plantarMentiras();
  await qrSemLeituraFechaONavegador();
  await quemLeONaoEhInterrompido();
  await inicioQueFalhaNaoDeixaOrfao();
  await autoStartSoAbreQuandoDeve();

  console.log("");
  if (falhas.length) {
    console.error(`FALHOU — ${falhas.length} de ${passou + falhas.length}:`);
    falhas.forEach((f) => console.error("  - " + f));
    process.exitCode = 1;
    return;
  }
  console.log(`OK — ${passou} conferências, o navegador é sempre fechado.`);
}

principal()
  .catch((erro) => { console.error(erro); process.exitCode = 1; })
  .finally(() => {
    try { fs.rmSync(PASTA, { recursive: true, force: true }); } catch { /* o SO recolhe */ }
    // Os relógios são `unref`, então o processo sai sozinho; isto é só para o
    // caso de a biblioteca de mentira ter deixado algo pendurado.
    process.exit(process.exitCode || 0);
  });
