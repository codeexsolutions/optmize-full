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
const { spawn } = require("node:child_process");

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
async function pedirComToken(rota, opcoes = {}) {
  const atual = ler();
  if (!atual) return null;

  const tentar = async (token) =>
    fetch(BACKEND + rota, {
      ...opcoes,
      headers: { ...(opcoes.headers || {}), Authorization: `Bearer ${token}` },
    });

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
    /*
      O QUE O PLANO LIBERA. A tela usa para trancar o que não foi comprado —
      hoje, a central das impressoras de quem está no Padrão. Quem decide é o
      catálogo no servidor; aqui isto só atravessa.
    */
    escopos: Array.isArray(dados.scopes) ? dados.scopes.map(String) : null,
    /** `true` quando o que falta é a CodeEx liberar, e não a pessoa pagar. */
    pendente: Boolean(dados.pendingRelease),
    motivo: dados.blockedReason || null,
    plano: dados.planName || "",
    /**
     * Há "Pagar agora"? Quem decide é o backend, pelo plano no banco — a tela
     * não guarda lista de planos nenhuma.
     */
    podePagar: Boolean(dados.payable),
    status: dados.status || "none",
    conferidoEm: new Date().toISOString(),
  };

  gravar({ ...ler(), acesso });
  await conferirPapel();
  return acesso;
}

/*
 * ---------------------------------------------------------------------------
 * QUEM É O DONO
 * ---------------------------------------------------------------------------
 *
 * O `role` do `/auth/me` não responde isto: ele é do USUÁRIO (cliente ou
 * admin da CodeEx), não do lugar dele na empresa. Quem sabe se a conta é a
 * dona é o `GET /team`, no `isOwner` — a mesma regra que o backend usa para
 * deixar criar, desativar e excluir funcionário.
 *
 * O papel vai para o perfil porque é dele que a barra decide mostrar o botão
 * do Painel. Esconder o botão é conforto, não trava: a trava é o backend, que
 * recusa com 403 quem não é dono.
 *
 * Sem rede, fica o papel que já estava.
 */
async function conferirPapel() {
  let resposta;
  try {
    resposta = await pedirComToken("/team");
  } catch {
    return;
  }
  if (!resposta || !resposta.ok) return;
  const dados = await resposta.json().catch(() => null);
  if (!dados) return;

  const atual = ler();
  if (!atual) return;
  gravar({
    ...atual,
    perfil: { ...atual.perfil, papel: dados.isOwner ? "dono" : "operador" },
    papelConferidoEm: new Date().toISOString(),
  });
}

const rotas = express.Router();

let papelTentado = false;

/**
 * Quem está usando agora, e se pode trabalhar. A tela chama isto ao abrir.
 *
 * RESPONDE COM O QUE JÁ SABE e confere depois, sem segurar a resposta: a tela
 * espera este pedido para desenhar qualquer coisa, e uma ida ao Railway no
 * caminho dela seria meio segundo de tela vazia a cada abertura. O que estava
 * gravado é de uma hora atrás, no máximo — e o que muda nele muda uma vez na
 * vida da conta.
 */
rotas.get("/eu", async (_req, res) => {
  /*
    Sessão gravada antes de o papel existir: descobre agora, UMA vez, e só
    então responde. Sem isto, o dono que já estava logado abriria o programa
    sem o botão do Painel até a conferência de uma hora passar.
  */
  if (ler() && !ler().papelConferidoEm && !papelTentado) {
    // Uma tentativa por processo: sem rede, não pode segurar toda abertura.
    papelTentado = true;
    await conferirPapel().catch(() => null);
  }
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

rotas.post("/sair", (_req, res) => {
  apagar();
  res.json(perfilDaTela());
});

/*
  `pedirComToken` sai daqui para o `uso.js` usar antes de cada exportação.

  É a única função deste arquivo que outro módulo enxerga, e de propósito: ela
  guarda o token, renova quando vence e devolve a resposta crua. Duplicar esse
  cuidado em outro arquivo daria dois lugares para consertar no dia em que o
  refresh mudar — e o segundo ficaria para trás.
*/
module.exports = { rotas, perfilDaTela, pedirComToken };
