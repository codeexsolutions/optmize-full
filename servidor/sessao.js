/**
 * ===========================================================================
 * A SESSÃO — quem está usando o Optmize, e se esta máquina pode trabalhar
 * ===========================================================================
 *
 * O Optmize só funciona com uma conta. Este arquivo é a única parte do
 * programa que fala com o backend sobre isso, e é ele que responde à trava de
 * `server.js`: "esta instalação está liberada?".
 *
 * ---------------------------------------------------------------------------
 * O TOKEN É DA MÁQUINA, E NÃO DE UMA SESSÃO
 * ---------------------------------------------------------------------------
 *
 * Entrar troca e-mail, senha e documento por um código (`/device/authorize`),
 * e o código por um token de 48 horas preso a esta máquina (`/device/token`).
 * Ver `optmize-backend/src/services/device.service.ts`. Duas consequências:
 *
 *   - entrar aqui NÃO derruba o painel web da mesma conta (o `/auth/login`
 *     derrubava: uma tela ativa por conta);
 *   - a conta fica numa máquina só. Entrar em outro computador tira esta da
 *     conta, e a próxima renovação traz a pessoa de volta para o login.
 *
 * ---------------------------------------------------------------------------
 * AS 48 HORAS
 * ---------------------------------------------------------------------------
 *
 * Com internet, o token é renovado de hora em hora e nunca chega perto de
 * vencer. Sem internet, o programa trabalha até a validade que veio do
 * servidor — no máximo 48 horas depois da última conversa — e então tranca.
 * Nas últimas 12 horas aparece a tarja avisando, para ninguém ser pego de
 * surpresa no meio de um pedido.
 *
 * A validade é a do SERVIDOR, e não uma conta feita com o relógio daqui. E o
 * relógio do Windows não volta atrás para esticá-la: guarda-se o maior
 * horário já visto, e vale o maior dos dois.
 *
 * ---------------------------------------------------------------------------
 * O TOKEN NÃO MORA NA PÁGINA
 * ---------------------------------------------------------------------------
 *
 * `server.js` escuta em `0.0.0.0`: qualquer computador da rede da gráfica
 * alcança a interface. Token em `localStorage` estaria ao alcance do F12 de
 * qualquer um. Guardado aqui, ele nunca atravessa para o navegador — o que a
 * tela recebe é um PERFIL (nome, empresa, papel), que não abre porta nenhuma.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
const { spawn } = require("node:child_process");

const { pastaDeDados, PASTA_DO_APP } = require("./caminhos");
const { ehDestaMaquina } = require("./so-nesta-maquina");

/**
 * Onde o backend mora. O mesmo endereço que o atualizador do Tauri já usa
 * (ver `src-tauri/tauri.conf.json`). A variável de ambiente existe para
 * apontar a bancada a um servidor de mentira, não para configuração de cliente.
 */
const BACKEND = process.env.OPTMIZE_BACKEND
  || "https://optmize-backend-production.up.railway.app";

/**
 * O arquivo do token. O `main.rs` também o lê — é o token que vai no pedido
 * de atualização —, então o nome e o campo `token` são contrato com ele.
 */
const ARQUIVO = path.join(pastaDeDados("sessao"), "sessao.json");

/** De quanto em quanto tempo renovar, com o programa aberto. */
const RENOVAR_A_CADA_MS = 60 * 60 * 1000;

/**
 * De quanto em quanto tempo perguntar se esta máquina ainda é a da conta.
 * Ver `conferirMaquina`.
 */
const CONFERIR_MAQUINA_A_CADA_MS = 60 * 1000;

/** A tarja aparece quando falta menos que isto e a última renovação falhou. */
const AVISAR_ANTES_MS = 12 * 60 * 60 * 1000;

/** A versão instalada, que vai junto em cada renovação e aparece no painel. */
const VERSAO = (() => {
  try {
    return String(require(path.join(PASTA_DO_APP, "package.json")).version || "");
  } catch {
    return "";
  }
})();

/*
 * ---------------------------------------------------------------------------
 * A IDENTIDADE DA MÁQUINA
 * ---------------------------------------------------------------------------
 *
 * Aleatória, gerada na primeira execução e guardada fora do arquivo da sessão
 * — sair da conta não a apaga, e entrar de novo reaproveita o mesmo vínculo.
 * Não é impressão digital de hardware, de propósito: trocar o HD não pode
 * desvincular a máquina sozinho.
 */
const ARQUIVO_DA_MAQUINA = path.join(pastaDeDados("sessao"), "maquina.json");

let maquinaEmMemoria = null;

function idDaMaquina() {
  if (maquinaEmMemoria) return maquinaEmMemoria;
  maquinaEmMemoria = lerOuCriarIdDaMaquina();
  return maquinaEmMemoria;
}

function lerOuCriarIdDaMaquina() {
  try {
    const { deviceId } = JSON.parse(fs.readFileSync(ARQUIVO_DA_MAQUINA, "utf8"));
    if (typeof deviceId === "string" && deviceId.length >= 16) return deviceId;
  } catch {
    // Primeira execução.
  }
  const deviceId = crypto.randomBytes(24).toString("hex");
  fs.writeFileSync(ARQUIVO_DA_MAQUINA, JSON.stringify({ deviceId }), { mode: 0o600 });
  return deviceId;
}

function daMaquina() {
  return {
    deviceId: idDaMaquina(),
    deviceName: os.hostname().slice(0, 120),
    appVersion: VERSAO,
  };
}

/*
 * ---------------------------------------------------------------------------
 * O ARQUIVO
 * ---------------------------------------------------------------------------
 */

/**
 * O que está guardado, em memória depois da primeira leitura.
 *
 * `null` = ainda não procuramos; `false` = procuramos e não há nada.
 */
let guardado = null;

function ler() {
  if (guardado !== null) return guardado;
  try {
    const dados = JSON.parse(fs.readFileSync(ARQUIVO, "utf8"));
    /*
      Sessão gravada pela versão de antes do token de máquina (tinha
      `accessToken`, e não `token`): não vale mais nada. Volta para o login
      uma vez, e daí em diante é o token novo.
    */
    guardado = dados && typeof dados.token === "string" ? dados : false;
  } catch {
    guardado = false;
  }
  return guardado;
}

/*
  `mode: 0o600` é o que dá para fazer, e este comentário não finge que é cofre:
  quem tem a senha desta máquina lê o arquivo. O que o protege de verdade é o
  token ser preso a esta máquina, valer 48 horas e ser revogável do lado do
  servidor — e a senha, essa, nunca é gravada em lugar nenhum.
*/
function gravar(dados) {
  guardado = dados;
  fs.writeFileSync(ARQUIVO, JSON.stringify(dados), { mode: 0o600 });
}

function apagar() {
  guardado = false;
  try {
    fs.unlinkSync(ARQUIVO);
  } catch {
    // Já não existia. Sair duas vezes não é erro.
  }
}

/*
 * ---------------------------------------------------------------------------
 * A EMPRESA DESTA MÁQUINA
 * ---------------------------------------------------------------------------
 *
 * O documento, o nome e a logo da última empresa que entrou aqui, num arquivo
 * À PARTE do token. Sair da conta apaga a sessão e deixa este: o computador da
 * gráfica continua sendo da gráfica, e quem entra de novo só põe e-mail e
 * senha, com a logo já na tela. Ele só some quando alguém escolhe "Trocar
 * empresa" no login.
 *
 * Nada aqui abre a conta: o documento ainda vai junto no login e o backend
 * confere tudo de novo.
 */
const ARQUIVO_DA_EMPRESA = path.join(pastaDeDados("sessao"), "empresa.json");

function lerEmpresa() {
  try {
    const dados = JSON.parse(fs.readFileSync(ARQUIVO_DA_EMPRESA, "utf8"));
    return dados && typeof dados.documento === "string" && dados.documento ? dados : null;
  } catch {
    return null;
  }
}

function gravarEmpresa(dados) {
  try {
    fs.writeFileSync(ARQUIVO_DA_EMPRESA, JSON.stringify(dados), { mode: 0o600 });
  } catch {
    // Sem lembrar a empresa o login só pede o documento de novo. Não é erro.
  }
}

/** Nome e logo novos, de uma renovação ou da troca da logo — o documento fica. */
function atualizarEmpresa(perfil) {
  const atual = lerEmpresa();
  if (!atual || !perfil) return;
  gravarEmpresa({ ...atual, nome: perfil.empresa || atual.nome, logo: perfil.logo || null });
}

/**
 * Por que a pessoa saiu da conta sem ter clicado em "Sair" — a tela de entrar
 * mostra. Só em memória: é recado para a próxima tela, não estado.
 */
let motivoDaSaida = null;

/*
 * ---------------------------------------------------------------------------
 * O RELÓGIO
 * ---------------------------------------------------------------------------
 */

/** De quanto em quanto tempo o maior horário visto vai para o disco. */
const GRAVAR_RELOGIO_A_CADA_MS = 10 * 60 * 1000;

/**
 * A hora que vale: a do Windows, mas nunca antes da maior que já se viu.
 *
 * Atrasar a data do computador para esticar as 48 horas não funciona — o
 * maior horário fica gravado. Ele só é reposto pela hora do SERVIDOR, a cada
 * renovação, o que também conserta um relógio que estava adiantado.
 */
function agora() {
  const atual = ler();
  const local = Date.now();
  if (!atual) return local;
  const maior = Number(atual.maiorRelogio) || 0;
  if (local > maior) {
    // Grava de tempos em tempos, e não a cada pedido.
    if (local - maior > GRAVAR_RELOGIO_A_CADA_MS) gravar({ ...atual, maiorRelogio: local });
    return local;
  }
  return maior;
}

/*
 * ---------------------------------------------------------------------------
 * O ATESTADO
 * ---------------------------------------------------------------------------
 *
 * A trava NÃO confia no que está escrito no arquivo — um JSON no disco da
 * gráfica se edita no Bloco de Notas. Ela confia no ATESTADO: máquina,
 * validade e liberação, assinados pelo servidor com uma chave que só existe
 * lá (ver `optmize-backend/src/infra/crypto/atestado.ts`). Aqui mora a chave
 * pública, que só confere. Mudar uma vírgula do atestado o invalida; copiá-lo
 * para outro computador também, porque ele diz de qual máquina é.
 */
const CHAVE_DO_ATESTADO = crypto.createPublicKey(
  "-----BEGIN PUBLIC KEY-----\n"
  + "MCowBQYDK2VwAyEABZS9PxD/dpd62qyLdQOf1zsaur5DUaY6WoxXRu3v65E=\n"
  + "-----END PUBLIC KEY-----\n",
);

/** A última conferência, para não refazer a criptografia a cada pedido. */
let conferido = { texto: null, dados: null };

/** Os dados do atestado, se a assinatura e a máquina baterem; senão `null`. */
function atestado(atual) {
  if (!atual || typeof atual.atestado !== "string") return null;
  if (conferido.texto === atual.atestado) return conferido.dados;

  let dados = null;
  try {
    const [prefixo, corpo, assinatura] = atual.atestado.split(".");
    const valido = prefixo === "OPTMIZE-ATESTADO1"
      && crypto.verify(
        null,
        Buffer.from(corpo, "utf8"),
        CHAVE_DO_ATESTADO,
        Buffer.from(assinatura, "base64url"),
      );
    if (valido) {
      const lido = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8"));
      if (lido && lido.deviceId === idDaMaquina()) dados = lido;
    }
  } catch {
    dados = null;
  }
  conferido = { texto: atual.atestado, dados };
  return dados;
}

/*
 * ---------------------------------------------------------------------------
 * A TRAVA
 * ---------------------------------------------------------------------------
 */

/** A validade que vale: a do atestado. Sem atestado válido, já venceu. */
function validade(atual) {
  const dados = atestado(atual);
  return dados ? Date.parse(dados.expira) : 0;
}

/** O token venceu sem renovar? */
function venceu(atual) {
  return !atual || !(agora() < validade(atual));
}

/**
 * Esta instalação pode trabalhar agora?
 *
 * É a pergunta da trava de `server.js`, feita a cada pedido — por isso só lê
 * memória. Tudo sai do atestado: é desta máquina, não venceu, e a conta
 * estava liberada quando o servidor o assinou.
 */
function liberado() {
  const atual = ler();
  if (!atual || venceu(atual)) return false;
  return atestado(atual).liberado === true;
}

/** O acesso como a tela o vê — com o motivo de quando o token venceu. */
function acessoDaTela(atual) {
  if (!venceu(atual)) {
    // A tela segue o atestado, e não o `liberado` do arquivo: os dois só
    // discordam se alguém editou o arquivo, e aí quem vale é a assinatura.
    return atual.acesso ? { ...atual.acesso, liberado: atestado(atual).liberado === true } : null;
  }
  return {
    ...(atual.acesso || {}),
    liberado: false,
    pendente: false,
    podePagar: false,
    motivo:
      "O Optmize está sem falar com o servidor há mais de 48 horas. "
      + "Confira a internet deste computador e clique em conferir de novo.",
  };
}

/**
 * A tarja das últimas 12 horas: sem contato, e o acesso trava em breve.
 * `null` quando não há o que avisar.
 */
function tarja(atual) {
  if (!atual || !atual.ultimaFalha || venceu(atual)) return null;
  const falta = validade(atual) - agora();
  if (falta > AVISAR_ANTES_MS) return null;
  const horas = Math.max(1, Math.round(falta / 3_600_000));
  return "O Optmize está sem contato com o servidor. Confira a internet: "
    + `o acesso trava em ${horas} ${horas === 1 ? "hora" : "horas"}.`;
}

/** O que a tela pode ver. Nunca inclui token. */
function perfilDaTela() {
  const atual = ler();
  if (!atual) {
    return { entrou: false, perfil: null, acesso: null, aviso: motivoDaSaida, tarja: null };
  }
  return {
    entrou: true,
    perfil: atual.perfil,
    acesso: acessoDaTela(atual),
    aviso: null,
    tarja: tarja(atual),
  };
}

/*
 * ---------------------------------------------------------------------------
 * A CONVERSA COM O BACKEND
 * ---------------------------------------------------------------------------
 */

async function falarComOBackend(rota, corpo) {
  const resposta = await fetch(BACKEND + rota, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const dados = await resposta.json().catch(() => ({}));
  return { ok: resposta.ok, status: resposta.status, dados };
}

/**
 * Grava o que o `/device/token` respondeu — no vínculo e em cada renovação.
 *
 * O formato do `acesso` é o mesmo que a tela já conhecia (ele vinha do
 * `/billing/subscription`); só a origem mudou.
 */
function aplicarResposta(dados) {
  const a = dados.acesso || {};
  const servidorAgora = Date.parse(dados.agora);
  gravar({
    token: dados.token,
    expira: dados.expira,
    atestado: dados.atestado,
    // A hora do servidor repõe o relógio guardado — ver `agora()`.
    maiorRelogio: Number.isFinite(servidorAgora) ? servidorAgora : Date.now(),
    ultimoContato: new Date().toISOString(),
    ultimaFalha: null,
    perfil: {
      nome: (dados.usuario && dados.usuario.nome) || "",
      email: (dados.usuario && dados.usuario.email) || "",
      empresa: (dados.empresa && dados.empresa.nome) || "",
      // A logo da empresa (data URL), que a barra mostra no lugar das iniciais.
      logo: (dados.empresa && dados.empresa.logo) || null,
      papel: dados.papel === "dono" ? "dono" : "operador",
    },
    acesso: {
      liberado: Boolean(a.allowed),
      /*
        O QUE O PLANO LIBERA. A tela usa para trancar o que não foi comprado —
        hoje, a central das impressoras de quem está no Padrão. Quem decide é o
        catálogo no servidor; aqui isto só atravessa.
      */
      escopos: Array.isArray(a.scopes) ? a.scopes.map(String) : null,
      /** `true` quando o que falta é a CodeEx liberar, e não a pessoa pagar. */
      pendente: Boolean(a.pendingRelease),
      motivo: a.blockedReason || null,
      plano: a.planName || "",
      podePagar: Boolean(a.payable),
      status: a.status || "none",
      conferidoEm: new Date().toISOString(),
    },
  });
  atualizarEmpresa(ler().perfil);
  motivoDaSaida = null;
}

/** As recusas que tiram a máquina da conta (ver `device.service.ts`). */
const FORA_DA_CONTA = new Set(["maquina_desvinculada", "token_vencido"]);

let renovando = null;

/**
 * Renova o token e traz o acesso de novo. Nunca lança.
 *
 * Um pedido por vez: a trava, o relógio e a tela de espera podem pedir ao
 * mesmo tempo, e duas renovações simultâneas seriam duas idas ao Railway para
 * a mesma resposta.
 */
function renovar() {
  if (renovando) return renovando;
  renovando = (async () => {
    const atual = ler();
    if (!atual) return;
    let resposta;
    try {
      resposta = await falarComOBackend("/device/token", { token: atual.token, ...daMaquina() });
    } catch {
      resposta = null;
    }

    if (resposta && resposta.ok && resposta.dados.token) {
      aplicarResposta(resposta.dados);
      return;
    }
    if (resposta && resposta.status === 401 && FORA_DA_CONTA.has(resposta.dados.code)) {
      // A conta saiu desta máquina. Volta para o login, dizendo por quê.
      apagar();
      motivoDaSaida = resposta.dados.message || "Entre na conta de novo.";
      return;
    }
    // Sem rede, servidor fora, erro do lado de lá: fica o que já se sabia, e a
    // falha fica anotada para a tarja.
    const ainda = ler();
    if (ainda) gravar({ ...ainda, ultimaFalha: new Date().toISOString() });
  })().finally(() => {
    renovando = null;
  });
  return renovando;
}

// Renova ao subir — é aqui que a segunda-feira de manhã destrava — e de hora
// em hora, com o programa aberto. `unref` para o relógio não segurar o Node.
setTimeout(() => void renovar(), 1500).unref();
setInterval(() => void renovar(), RENOVAR_A_CADA_MS).unref();

/**
 * UMA SESSÃO ABERTA POR ACESSO — e valendo em um minuto, não em uma hora.
 *
 * Entrar noutra máquina já tirava a conta desta (`exchange`, no backend), mas
 * só a renovação, de hora em hora, ficava sabendo: por até uma hora o mesmo
 * login trabalhava em dois computadores. Agora, de minuto em minuto, uma
 * pergunta barata (`/device/conferir`: só "esta máquina ainda é a da conta?")
 * derruba a antiga, e a tela volta para o login com o motivo.
 *
 * Sem rede, ou com o backend antigo que não conhece a rota, nada acontece: a
 * conferência só tira a conta quando o servidor DIZ que ela saiu. Cair a
 * internet não pode derrubar a produção.
 */
async function conferirMaquina() {
  const atual = ler();
  if (!atual || !atual.token || renovando) return;
  let resposta;
  try {
    resposta = await falarComOBackend("/device/conferir", {
      token: atual.token,
      deviceId: daMaquina().deviceId,
    });
  } catch {
    return;
  }
  if (resposta.status === 401 && FORA_DA_CONTA.has(resposta.dados.code)) {
    // O token pode ter mudado no meio (entrou de novo nesta máquina): só sai
    // quem perguntou com o token que ainda está guardado.
    const agora = ler();
    if (!agora || agora.token !== atual.token) return;
    apagar();
    motivoDaSaida = resposta.dados.message || "Esta conta entrou em outro computador. Entre de novo.";
  }
}

setInterval(() => void conferirMaquina(), CONFERIR_MAQUINA_A_CADA_MS).unref();

/**
 * Uma chamada autenticada ao backend, com o token da máquina.
 *
 * Um 401 é o token que venceu sem a renovação ter rodado ainda (a máquina
 * acordou da suspensão, por exemplo): renova uma vez e tenta de novo. Se a
 * renovação também falhar, a conta acabou nesta máquina de verdade.
 */
async function pedirComToken(rota, opcoes = {}) {
  if (!ler()) return null;

  const tentar = async () =>
    fetch(BACKEND + rota, {
      ...opcoes,
      headers: { ...(opcoes.headers || {}), Authorization: `Bearer ${ler().token}` },
    });

  const resposta = await tentar();
  if (resposta.status !== 401) return resposta;

  await renovar();
  if (!ler()) return resposta;
  return tentar();
}

const rotas = express.Router();

/**
 * Quem está usando agora, e se pode trabalhar. A tela chama isto ao abrir.
 *
 * Responde com o que já sabe, sem ir ao Railway: a renovação de hora em hora
 * mantém isto em dia, e uma ida ao servidor aqui seria meio segundo de tela
 * vazia a cada abertura.
 */
rotas.get("/eu", (req, res) => {
  // `remoto`: quem pergunta é outro computador da rede, que só vê o painel
  // das impressoras (ver `so-nesta-maquina.js`).
  res.json({ ...perfilDaTela(), remoto: !ehDestaMaquina(req) });
});

/**
 * Confere agora, e responde com o resultado.
 *
 * É o botão da tela de espera — e o da tela de "sem contato há 48 horas".
 * Diferente do `/eu`, este ESPERA a resposta: quem apertou está olhando para
 * a tela querendo saber se já liberou.
 */
rotas.post("/conferir", async (_req, res) => {
  await renovar();
  res.json(perfilDaTela());
});

rotas.post("/entrar", async (req, res) => {
  const email = String((req.body && req.body.email) || "").trim().toLowerCase();
  const senha = String((req.body && req.body.senha) || "");
  /*
    O DOCUMENTO DA EMPRESA (CNPJ ou CPF) VAI JUNTO, só com os dígitos.

    Quem confere se aquela conta é daquela empresa é o backend, no
    `/device/authorize` — aqui ele só atravessa.
  */
  const documento = String((req.body && req.body.documento) || "").replace(/\D/g, "");
  if (!email || !senha) {
    return res.status(400).json({ code: "faltou", message: "Informe e-mail e senha." });
  }
  if (!documento) {
    return res.status(400).json({
      code: "faltou",
      message: "Informe o CNPJ ou o CPF da empresa.",
    });
  }

  // Sem rede é um caso distinto de senha errada, e a tela precisa poder dizer
  // isso — "confira a internet" a pessoa resolve sozinha.
  const semRede = () =>
    res.status(503).json({
      code: "sem_rede",
      message: "O Optmize não conseguiu falar com o servidor. Confira a internet.",
    });

  let autorizacao;
  try {
    autorizacao = await falarComOBackend("/device/authorize", {
      email,
      password: senha,
      documento,
    });
  } catch {
    return semRede();
  }
  if (!autorizacao.ok || !autorizacao.dados.codigo) {
    return res.status(autorizacao.status || 401).json({
      code: autorizacao.dados.code || "invalid_credentials",
      message: autorizacao.dados.message || "E-mail ou senha incorretos.",
    });
  }

  let vinculo;
  try {
    vinculo = await falarComOBackend("/device/token", {
      codigo: autorizacao.dados.codigo,
      ...daMaquina(),
    });
  } catch {
    return semRede();
  }
  if (!vinculo.ok || !vinculo.dados.token) {
    return res.status(vinculo.status || 401).json({
      code: vinculo.dados.code || "nao_vinculou",
      message: vinculo.dados.message || "Não foi possível vincular esta máquina. Tente de novo.",
    });
  }

  aplicarResposta(vinculo.dados);
  const { perfil } = ler();
  gravarEmpresa({ documento, nome: perfil.empresa, logo: perfil.logo });
  res.json(perfilDaTela());
});

/** A empresa lembrada, para o login vir com ela preenchida. */
rotas.get("/empresa-lembrada", (_req, res) => {
  res.json({ empresa: lerEmpresa() });
});

/** "Trocar empresa": só assim a máquina esquece o documento. */
rotas.delete("/empresa-lembrada", (_req, res) => {
  try {
    fs.unlinkSync(ARQUIVO_DA_EMPRESA);
  } catch {
    // Já não havia nenhuma.
  }
  res.json({ empresa: null });
});

/*
 * ===========================================================================
 * O CADASTRO DA EMPRESA
 * ===========================================================================
 *
 * As duas rotas abaixo são REPASSE para o backend, e não lógica daqui. Elas
 * existem pelo mesmo motivo que o login passa por este arquivo: a página é
 * servida em 127.0.0.1 e o backend mora no Railway, então um `fetch` direto da
 * tela seria requisição entre origens.
 *
 * Nada é guardado nem decidido neste caminho — quem valida CNPJ, recusa
 * empresa repetida e escolhe o que cada plano custa é o servidor. Repetir
 * qualquer uma dessas regras aqui criaria uma segunda verdade, e é sempre a
 * segunda que fica desatualizada.
 */

/*
 * A RECUPERAÇÃO DE SENHA — mais dois repasses, pelo mesmo motivo do cadastro.
 *
 * O backend manda um código de seis números para o e-mail da conta, e a tela
 * troca a senha com ele. Nada é guardado aqui, nem o código nem a senha.
 */
async function repassarSemConta(res, rota, corpo) {
  try {
    const resposta = await falarComOBackend(rota, corpo);
    if (resposta.status === 204) return res.status(204).end();
    res.status(resposta.status).json(resposta.dados);
  } catch {
    res.status(503).json({
      code: "sem_rede",
      message: "O Optmize não conseguiu falar com o servidor. Confira a internet.",
    });
  }
}

rotas.post("/esqueci", (req, res) =>
  repassarSemConta(res, "/auth/password/forgot", {
    email: String((req.body && req.body.email) || "").trim().toLowerCase(),
  }));

rotas.post("/redefinir", (req, res) =>
  repassarSemConta(res, "/auth/password/reset", {
    email: String((req.body && req.body.email) || "").trim().toLowerCase(),
    code: String((req.body && req.body.codigo) || "").replace(/\D/g, ""),
    password: String((req.body && req.body.senha) || ""),
  }));

/** Os planos que a tela de cadastro mostra. */
rotas.get("/planos", async (_req, res) => {
  try {
    const resposta = await fetch(`${BACKEND}/signup/company/plans`);
    const dados = await resposta.json().catch(() => ({ planos: [] }));
    res.status(resposta.status).json(dados);
  } catch {
    res.status(503).json({
      code: "sem_rede",
      message: "Não foi possível buscar os planos. Confira a internet.",
    });
  }
});

/**
 * Cria a empresa e a conta do dono.
 *
 * NÃO ENTRA SOZINHO depois de cadastrar, e é de propósito: o cadastro cria a
 * conta, o login abre a sessão. Entrar aqui significaria repetir o `/auth/login`
 * neste arquivo e ter dois caminhos que gravam a sessão — e o dia em que um
 * deles mudasse, o outro ficaria para trás. A tela leva a pessoa ao login com
 * o e-mail já preenchido, que resolve a mesma coisa sem duplicar nada.
 */
rotas.post("/cadastrar", async (req, res) => {
  try {
    const resposta = await fetch(`${BACKEND}/signup/company`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {}),
    });
    const dados = await resposta.json().catch(() => ({}));
    // Plano pago na compra: o checkout já abre no navegador.
    if (resposta.ok && dados.checkoutUrl) abrirPagamento(dados.checkoutUrl);
    res.status(resposta.status).json(dados);
  } catch {
    res.status(503).json({
      code: "sem_rede",
      message: "O Optmize não conseguiu falar com o servidor. Confira a internet.",
    });
  }
});

/*
 * ===========================================================================
 * O PAINEL — os acessos dos funcionários
 * ===========================================================================
 *
 * Repasse para o `/team` do backend, com o token que só este arquivo enxerga.
 * Quem decide TUDO é o servidor: se a conta é a dona, se o plano comporta
 * equipe, quantas vagas sobram, se o e-mail já existe. Aqui só se traduz o
 * caminho e se devolve a resposta como veio — inclusive a mensagem de erro,
 * que o backend já escreve em português.
 *
 * Desativar e excluir derrubam a sessão do funcionário lá no backend, na
 * hora: não é preciso esperar o token dele vencer.
 */
async function repassar(res, rota, opcoes = {}) {
  let resposta;
  try {
    resposta = await pedirComToken(rota, {
      ...opcoes,
      headers: opcoes.body ? { "Content-Type": "application/json" } : {},
    });
  } catch {
    return res.status(503).json({
      code: "sem_rede",
      message: "O Optmize não conseguiu falar com o servidor. Confira a internet.",
    });
  }
  if (!resposta) {
    return res.status(401).json({ code: "fora", message: "Entre na conta de novo." });
  }
  if (resposta.status === 204) return res.status(204).end();
  const dados = await resposta.json().catch(() => ({}));
  res.status(resposta.status).json(dados);
}

rotas.get("/equipe", (_req, res) => repassar(res, "/team"));

rotas.post("/equipe", (req, res) => {
  const corpo = req.body || {};
  return repassar(res, "/team/members", {
    method: "POST",
    body: JSON.stringify({
      name: String(corpo.nome || "").trim(),
      email: String(corpo.email || "").trim().toLowerCase(),
      password: String(corpo.senha || ""),
    }),
  });
});

rotas.patch("/equipe/:id/ativo", (req, res) =>
  repassar(res, `/team/members/${encodeURIComponent(req.params.id)}/active`, {
    method: "PATCH",
    body: JSON.stringify({ isActive: Boolean(req.body && req.body.ativo) }),
  }));

rotas.delete("/equipe/:id", (req, res) =>
  repassar(res, `/team/members/${encodeURIComponent(req.params.id)}`, { method: "DELETE" }));

/*
 * A LOGO DA EMPRESA. Quem decide se pode trocar (só o dono) é o backend. Deu
 * certo, a logo nova vai direto para o perfil guardado: a barra a mostra na
 * hora, sem esperar a próxima renovação do token.
 */
rotas.put("/empresa/logo", async (req, res) => {
  const logo = req.body && typeof req.body.logo === "string" ? req.body.logo : null;
  let resposta;
  try {
    resposta = await pedirComToken("/team/logo", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logo }),
    });
  } catch {
    return res.status(503).json({
      code: "sem_rede",
      message: "O Optmize não conseguiu falar com o servidor. Confira a internet.",
    });
  }
  if (!resposta) return res.status(401).json({ code: "fora", message: "Entre na conta de novo." });
  if (!resposta.ok) {
    const dados = await resposta.json().catch(() => ({}));
    return res.status(resposta.status).json(dados);
  }
  const atual = ler();
  if (atual && atual.perfil) {
    gravar({ ...atual, perfil: { ...atual.perfil, logo } });
    atualizarEmpresa(ler().perfil);
  }
  res.json(perfilDaTela());
});

/*
 * A LOJA DE ACESSOS — mais um acesso além do plano.
 *
 * Preço, Pix e pedido à CodeEx: tudo decidido no backend
 * (`services/acesso.service.ts`). Aqui só o caminho muda.
 */
rotas.get("/equipe/acessos", (_req, res) => repassar(res, "/team/acessos"));

rotas.post("/equipe/acessos/compra", (_req, res) =>
  repassar(res, "/team/acessos/compra", { method: "POST" }));

rotas.get("/equipe/acessos/compra/:id", (req, res) =>
  repassar(res, `/team/acessos/compra/${encodeURIComponent(req.params.id)}`));

rotas.post("/equipe/acessos/pedido", (_req, res) =>
  repassar(res, "/team/acessos/pedido", { method: "POST" }));

/*
 * ===========================================================================
 * O PAGAMENTO NA HORA DA COMPRA
 * ===========================================================================
 *
 * Essencial e Profissional são pagos no cadastro: o backend devolve o link do
 * checkout do Mercado Pago, e este arquivo o abre no navegador da máquina. É
 * o Node quem abre, e não a página: a interface roda dentro da janela do
 * Tauri, que não é um navegador onde se paga com cartão.
 *
 * Quem libera a conta é o webhook do Mercado Pago, lá no backend. Aqui não se
 * decide nada — a tela de espera só pergunta de novo.
 */

/**
 * Só abre link de pagamento: Mercado Pago, ou o próprio backend (o checkout
 * de mentira do ambiente de desenvolvimento). Qualquer outro endereço seria
 * este servidor, alcançável pela rede da gráfica, abrindo o que lhe mandarem.
 */
function linkDePagamento(url) {
  try {
    const endereco = new URL(String(url));
    const host = endereco.hostname;
    if (endereco.origin === new URL(BACKEND).origin) return endereco.href;
    if (endereco.protocol !== "https:") return null;
    const doMercadoPago = /(^|\.)mercadopago\.com(\.br)?$/.test(host);
    return doMercadoPago ? endereco.href : null;
  } catch {
    return null;
  }
}

function abrirPagamento(url) {
  const link = linkDePagamento(url);
  if (!link) return false;
  /*
    No Windows, `rundll32 url.dll` e não `cmd /c start`: o `start` lê o `&`
    da URL como separador de comando e abriria o checkout cortado ao meio.
  */
  const [programa, argumentos] =
    process.platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", link]]
      : process.platform === "darwin" ? ["open", [link]]
        : ["xdg-open", [link]];
  try {
    spawn(programa, argumentos, { detached: true, stdio: "ignore" }).unref();
    return true;
  } catch {
    return false;
  }
}

/** Abre de novo o link que o cadastro devolveu (o botão "abrir o pagamento"). */
rotas.post("/abrir-pagamento", (req, res) => {
  const aberto = abrirPagamento(req.body && req.body.url);
  if (!aberto) {
    return res.status(400).json({ code: "link_invalido", message: "Este link de pagamento não é válido." });
  }
  res.json({ aberto: true });
});

/**
 * Pede ao backend o checkout do plano da conta logada e o abre.
 *
 * É o "Pagar agora" da tela de espera: quem fechou o navegador antes de pagar
 * volta a ele sem refazer o cadastro. O backend reaproveita o checkout
 * pendente, então clicar de novo não cria uma segunda assinatura.
 */
rotas.post("/pagar", async (_req, res) => {
  let resposta;
  try {
    resposta = await pedirComToken("/billing/checkout", { method: "POST" });
  } catch {
    return res.status(503).json({
      code: "sem_rede",
      message: "O Optmize não conseguiu falar com o servidor. Confira a internet.",
    });
  }
  if (!resposta) {
    return res.status(401).json({ code: "fora", message: "Entre na conta de novo." });
  }
  const dados = await resposta.json().catch(() => ({}));
  if (resposta.ok && dados.checkoutUrl) abrirPagamento(dados.checkoutUrl);
  res.status(resposta.status).json(dados);
});

/*
  A TROCA DE PLANO pela tela trancada (ver `services/troca-de-plano.ts`, no
  backend): o cliente do Mensal Encaixe clica no Extrator ou nos Moldes e
  compra ali mesmo. Estas três só atravessam — quem decide preço e para onde se
  pode subir é o catálogo do servidor.
*/
rotas.get("/trocas", (_req, res) => repassar(res, "/billing/trocas"));

/** Abre o checkout do plano novo no navegador e devolve a assinatura para conferir. */
rotas.post("/trocas", async (req, res) => {
  let resposta;
  try {
    resposta = await pedirComToken("/billing/trocas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: String((req.body && req.body.planId) || "") }),
    });
  } catch {
    return res.status(503).json({
      code: "sem_rede",
      message: "O Optmize não conseguiu falar com o servidor. Confira a internet.",
    });
  }
  if (!resposta) {
    return res.status(401).json({ code: "fora", message: "Entre na conta de novo." });
  }
  const dados = await resposta.json().catch(() => ({}));
  if (resposta.ok && dados.checkoutUrl) abrirPagamento(dados.checkoutUrl);
  res.status(resposta.status).json(dados);
});

/**
 * A troca já foi paga? Quando foi, renova o acesso aqui antes de responder: é
 * o acesso guardado que diz à tela o que destrancar.
 */
rotas.post("/trocas/conferir", async (req, res) => {
  let resposta;
  try {
    resposta = await pedirComToken("/billing/trocas/conferir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assinatura: String((req.body && req.body.assinatura) || "") }),
    });
  } catch {
    return res.status(503).json({
      code: "sem_rede",
      message: "O Optmize não conseguiu falar com o servidor. Confira a internet.",
    });
  }
  if (!resposta) {
    return res.status(401).json({ code: "fora", message: "Entre na conta de novo." });
  }
  const dados = await resposta.json().catch(() => ({}));
  if (resposta.ok && dados.trocado) await renovar();
  res.status(resposta.status).json(dados);
});

rotas.post("/sair", (_req, res) => {
  apagar();
  motivoDaSaida = null;
  res.json(perfilDaTela());
});

/*
  `pedirComToken` sai daqui para o `uso.js` usar antes de cada exportação, e
  `liberado` para a trava de `server.js`.

  É a única função deste arquivo que outro módulo enxerga, e de propósito: ela
  guarda o token, renova quando vence e devolve a resposta crua. Duplicar esse
  cuidado em outro arquivo daria dois lugares para consertar no dia em que o
  refresh mudar — e o segundo ficaria para trás.
*/
module.exports = { rotas, perfilDaTela, pedirComToken, liberado };
