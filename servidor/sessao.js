/**
 * ===========================================================================
 * A SESSÃO — quem está usando o Optmize
 * ===========================================================================
 *
 * O Optmize abria sozinho desde sempre: um programa por máquina, e quem
 * alcançasse a porta via tudo. Isto é a entrada da conta.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O LOGIN PASSA POR AQUI, E NÃO DIRETO DA PÁGINA
 * ---------------------------------------------------------------------------
 *
 * Por duas razões, e a segunda é a que importa de verdade:
 *
 *   1. CORS. A interface é servida por este Node em `127.0.0.1:8000`, e o
 *      backend mora no Railway. Um `fetch` da página para lá é requisição
 *      entre origens, e passa a depender da lista de origens permitidas do
 *      servidor — que muda de porta conforme a máquina.
 *
 *   2. O TOKEN NÃO PODE MORAR NA PÁGINA. `server.js` escuta em `0.0.0.0`:
 *      qualquer computador da rede da gráfica alcança esta interface. Token em
 *      `localStorage` seria token ao alcance do F12 de qualquer um. Guardado
 *      aqui, ele nunca atravessa para o navegador — o que a tela recebe é um
 *      PERFIL (nome, empresa, papel), que não abre porta nenhuma.
 *
 * ---------------------------------------------------------------------------
 * O QUE ISTO AINDA NÃO É
 * ---------------------------------------------------------------------------
 *
 * Isto usa o `POST /auth/login` do backend, que cria uma SESSÃO DE USUÁRIO —
 * e sessão de usuário tem, lá, a regra de uma tela ativa por conta: entrar
 * aqui DERRUBA o painel web que a mesma pessoa tenha aberto, e vice-versa.
 *
 * Não é descuido, é uma etapa: o desenho aprovado (ver
 * `docs/superpowers/specs/2026-09-21-identidade-no-full-design.md`) dá ao programa
 * um TOKEN DE DISPOSITIVO, que vive em outra tabela e não derruba sessão
 * nenhuma. Quando `/device/authorize` e `/device/token` existirem no backend,
 * o que muda é só a função `entrar()` abaixo — as rotas, o formato do perfil e
 * a tela seguem iguais.
 */

const fs = require("node:fs");
const path = require("node:path");
const express = require("express");

const { pastaDeDados } = require("./caminhos");

/**
 * Onde o backend mora. O mesmo endereço que o atualizador do Tauri já usa
 * (ver `src-tauri/tauri.conf.json`). A variável de ambiente existe para
 * apontar a bancada a um servidor de mentira, não para configuração de cliente.
 */
const BACKEND = process.env.OPTMIZE_BACKEND
  || "https://optmize-backend-production.up.railway.app";

const ARQUIVO = path.join(pastaDeDados("sessao"), "sessao.json");

/**
 * O que está guardado, em memória depois da primeira leitura.
 *
 * `null` = ainda não procuramos; `false` = procuramos e não há nada. A
 * distinção evita reler o disco a cada `GET /eu`, que a tela chama de hora em
 * hora e a cada abertura.
 */
let guardado = null;

function ler() {
  if (guardado !== null) return guardado;
  try {
    guardado = JSON.parse(fs.readFileSync(ARQUIVO, "utf8"));
  } catch {
    guardado = false;
  }
  return guardado;
}

/*
  `mode: 0o600` é o que dá para fazer, e este comentário não finge que é cofre:
  quem tem a senha desta máquina lê o arquivo. O que o protege de verdade é o
  token ser curto e revogável do lado do servidor — e a senha, essa, nunca é
  gravada em lugar nenhum.
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

/** O que a tela pode ver. Nunca inclui token. */
function perfilDaTela() {
  const atual = ler();
  if (!atual) return { entrou: false, perfil: null, acesso: null };
  return { entrou: true, perfil: atual.perfil, acesso: atual.acesso ?? null };
}

async function falarComOBackend(rota, corpo) {
  const resposta = await fetch(BACKEND + rota, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const dados = await resposta.json().catch(() => ({}));
  return { ok: resposta.ok, status: resposta.status, dados };
}

/*
 * ===========================================================================
 * O ACESSO — a conta pode trabalhar hoje?
 * ===========================================================================
 *
 * Entrar e PODER TRABALHAR são duas perguntas diferentes, e o programa tratava
 * as duas como uma só: quem passava pelo login via o Optmize inteiro. A conta
 * que escolheu um plano pago e ainda não acertou o pagamento entrava igual —
 * enquanto a própria tela de cadastro prometia que o plano seria liberado
 * quando a CodeEx confirmasse. A promessa existia sem nada atrás dela.
 *
 * Quem decide é o backend, em `GET /billing/subscription`, e a decisão vem
 * pronta: `allowed`, `pendingRelease` e um motivo escrito em português. Nada
 * disso é recalculado aqui — repetir a regra criaria uma segunda verdade, e é
 * sempre a segunda que fica desatualizada.
 *
 * ---------------------------------------------------------------------------
 * SEM INTERNET, O PROGRAMA CONTINUA ABRINDO
 * ---------------------------------------------------------------------------
 *
 * Esta é a decisão que mais importa neste arquivo. O Optmize é instalado na
 * gráfica e fica aberto o dia inteiro; o link da rua cai. Barrar quem já
 * trabalhava porque o Railway não respondeu transformaria queda de internet em
 * expediente parado — e o prejuízo seria de quem PAGA, não de quem deve.
 *
 * Então: a última resposta conhecida fica gravada junto da sessão, e vale
 * enquanto não houver uma nova. Sem resposta nenhuma (primeira vez, sem rede),
 * abre. A trava de verdade não é esta tela, e o comentário de `Casca.tsx` já
 * dizia isso antes de eu chegar aqui: quem barra o trabalho é o servidor, a
 * cada operação que depende dele.
 *
 * ---------------------------------------------------------------------------
 * DE QUANTO EM QUANTO
 * ---------------------------------------------------------------------------
 *
 * Uma vez por hora, e sempre que a tela pedir de propósito (o botão "conferir
 * de novo" de quem está esperando a liberação). Conferir a cada `GET /eu`
 * faria uma ida ao Railway por abertura de menu, para uma resposta que muda
 * uma vez na vida da conta.
 */

const ACESSO_VALE_POR_MS = 60 * 60 * 1000;

/** Foi conferido há pouco? */
function acessoFresco(atual) {
  const acesso = atual && atual.acesso;
  if (!acesso || !acesso.conferidoEm) return false;
  return Date.now() - Date.parse(acesso.conferidoEm) < ACESSO_VALE_POR_MS;
}

/**
 * Uma chamada autenticada ao backend, renovando o token uma vez se preciso.
 *
 * O `accessToken` dura meia hora e o programa fica aberto o dia inteiro, então
 * a primeira conferência do dia cai num token vencido — sem o refresh, ela
 * responderia 401 e a tela diria "aguardando liberação" para quem está em dia.
 * Uma tentativa só: se o refresh também falhar, a sessão acabou de verdade.
 */
async function pedirComToken(rota) {
  const atual = ler();
  if (!atual) return null;

  const tentar = async (token) =>
    fetch(BACKEND + rota, { headers: { Authorization: `Bearer ${token}` } });

  let resposta = await tentar(atual.accessToken);
  if (resposta.status !== 401) return resposta;

  const renovada = await falarComOBackend("/auth/refresh", {
    refreshToken: atual.refreshToken,
  });
  if (!renovada.ok || !renovada.dados.accessToken) return resposta;

  gravar({
    ...atual,
    accessToken: renovada.dados.accessToken,
    refreshToken: renovada.dados.refreshToken || atual.refreshToken,
  });
  return tentar(renovada.dados.accessToken);
}

/**
 * Pergunta ao backend e grava a resposta junto da sessão.
 *
 * Devolve o acesso como a tela o vê. `forcar` pula a validade de uma hora —
 * é o botão de quem está olhando a tela de espera e acabou de falar com a
 * CodeEx pelo WhatsApp.
 */
async function conferirAcesso(forcar = false) {
  const atual = ler();
  if (!atual) return null;
  if (!forcar && acessoFresco(atual)) return atual.acesso;

  let resposta;
  try {
    resposta = await pedirComToken("/billing/subscription");
  } catch {
    // Sem rede. Fica valendo o que já se sabia — ver a nota acima.
    return atual.acesso ?? null;
  }
  if (!resposta || !resposta.ok) return atual.acesso ?? null;

  const dados = await resposta.json().catch(() => null);
  if (!dados) return atual.acesso ?? null;

  const acesso = {
    liberado: Boolean(dados.allowed),
    /** `true` quando o que falta é a CodeEx liberar, e não a pessoa pagar. */
    pendente: Boolean(dados.pendingRelease),
    motivo: dados.blockedReason || null,
    plano: dados.planName || "",
    status: dados.status || "none",
    conferidoEm: new Date().toISOString(),
  };

  gravar({ ...ler(), acesso });
  return acesso;
}

const rotas = express.Router();

/**
 * Quem está usando agora, e se pode trabalhar. A tela chama isto ao abrir.
 *
 * RESPONDE COM O QUE JÁ SABE e confere depois, sem segurar a resposta: a tela
 * espera este pedido para desenhar qualquer coisa, e uma ida ao Railway no
 * caminho dela seria meio segundo de tela vazia a cada abertura. O que estava
 * gravado é de uma hora atrás, no máximo — e o que muda nele muda uma vez na
 * vida da conta.
 */
rotas.get("/eu", (_req, res) => {
  res.json(perfilDaTela());
  const atual = ler();
  if (atual && !acessoFresco(atual)) {
    conferirAcesso().catch(() => {
      // Já está tratado lá dentro; aqui é só não derrubar o processo.
    });
  }
});

/**
 * Confere agora, e responde com o resultado.
 *
 * É o botão da tela de espera. Diferente do `/eu`, este ESPERA a resposta:
 * quem apertou está olhando para a tela querendo saber se já liberou.
 */
rotas.post("/conferir", async (_req, res) => {
  await conferirAcesso(true).catch(() => null);
  res.json(perfilDaTela());
});

rotas.post("/entrar", async (req, res) => {
  const email = String((req.body && req.body.email) || "").trim().toLowerCase();
  const senha = String((req.body && req.body.senha) || "");
  /*
    O DOCUMENTO DA EMPRESA (CNPJ ou CPF) VAI JUNTO, só com os dígitos.

    Quem confere se aquela conta é daquela empresa é o backend, no mesmo
    `/auth/login` — aqui ele só atravessa. Conferir neste arquivo exigiria uma
    segunda ida ao servidor para descobrir a empresa da conta, e daria uma
    segunda regra de acesso para manter em dia.
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

  let entrada;
  try {
    entrada = await falarComOBackend("/auth/login", {
      email,
      password: senha,
      documento,
    });
  } catch {
    // Sem rede, ou servidor fora do ar. É um caso distinto de senha errada, e
    // a tela precisa poder dizer isso — "não foi possível validar" manda a
    // pessoa telefonar; "confira a internet" ela resolve sozinha.
    return res.status(503).json({
      code: "sem_rede",
      message: "O Optmize não conseguiu falar com o servidor. Confira a internet.",
    });
  }

  if (!entrada.ok) {
    return res.status(entrada.status || 401).json({
      code: entrada.dados.code || "invalid_credentials",
      message: entrada.dados.message || "E-mail ou senha incorretos.",
    });
  }

  /*
    Quem é a pessoa vem numa segunda pergunta: o `/auth/login` devolve os
    tokens, e é o `/auth/me` que devolve nome, papel e empresa. Sem este passo
    a barra do menu mostraria uma conta sem nome.
  */
  let perfil = { nome: email, empresa: "", papel: "operador" };
  try {
    const eu = await fetch(`${BACKEND}/auth/me`, {
      headers: { Authorization: `Bearer ${entrada.dados.accessToken}` },
    });
    if (eu.ok) {
      const dados = await eu.json();
      const u = dados.user || dados;
      perfil = {
        nome: u.name || email,
        empresa: u.organizationName || u.organizationId || "",
        papel: u.role || "operador",
      };
    }
  } catch {
    // O nome é enfeite comparado a estar dentro: entra com o e-mail no lugar.
  }

  gravar({
    accessToken: entrada.dados.accessToken,
    refreshToken: entrada.dados.refreshToken,
    perfil,
    entrouEm: new Date().toISOString(),
  });

  /*
    O ACESSO É CONFERIDO AQUI, ANTES DE RESPONDER, e só aqui a espera se
    justifica: é a única vez em que a tela não tem nada gravado para mostrar.
    Sem isto, quem entra numa conta pendente veria o programa inteiro por um
    instante e a tela de espera depois — que é pior do que meio segundo a mais
    no login.
  */
  await conferirAcesso(true).catch(() => null);

  res.json(perfilDaTela());
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
    res.status(resposta.status).json(dados);
  } catch {
    res.status(503).json({
      code: "sem_rede",
      message: "O Optmize não conseguiu falar com o servidor. Confira a internet.",
    });
  }
});

rotas.post("/sair", (_req, res) => {
  apagar();
  res.json(perfilDaTela());
});

module.exports = { rotas, perfilDaTela };
