/**
 * Servidor do Optimize.
 *
 * Roda um servidor local (Express) que serve o painel web e as rotas de dados
 * de moldes, projetos e encaixe.
 *
 * O painel é UM só, servido na raiz: o `dist/`, que o Vite compila a partir de
 * `src/`. Durante a migração houve duas telas ao mesmo tempo — a antiga em `/`
 * (a pasta `public/`, de scripts soltos) e a nova em `/app` — e o Tauri nunca
 * precisou saber disso, porque ele sempre abriu a raiz. Quando o `public/`
 * saiu, a raiz passou a ser o React sem uma linha de mudança do lado do
 * desktop. Tudo fica nesta máquina: o banco é o arquivo `dados.db` e as
 * imagens ficam em `uploads/` (ver `caminhos.js` para onde exatamente).
 *
 * A escuta é só nesta máquina (`127.0.0.1`): de 2026-09 a 2026-10 ela foi em
 * `0.0.0.0`, para a fábrica olhar o painel das impressoras pelo IP deste PC.
 * O painel saiu, e com ele o motivo de abrir a porta para a rede — e o pedido
 * de liberação do firewall que vinha junto na primeira abertura.
 *
 * Abra http://localhost:8000 depois de rodar `npm start`. Instalado, quem
 * sobe este mesmo arquivo é o app do Tauri, numa porta livre qualquer.
 */

const path = require("path");
const http = require("http");
const express = require("express");

const { RAIZ_DE_UPLOADS, PASTA_DO_APP } = require("./caminhos");
require("./db"); // garante que o banco SQLite e as tabelas existem antes de tudo
const encaixePdfRouter = require("./encaixe-pdf");
const encaixeMemoriaRouter = require("./encaixe-memoria");
const riscoPdfRouter = require("./risco-pdf");
const moldesRouter = require("./moldes-api");
const projetosRouter = require("./projetos-api");
const galeriaArquivosRouter = require("./galeria-arquivos-api");

const app = express();
const servidor = http.createServer(app);

/*
 * ===========================================================================
 * A TRAVA DA CONTA
 * ===========================================================================
 *
 * Sem conta liberada nesta máquina, a API não responde. É ESTA a trava — a
 * tela de entrar só esconde o programa, e qualquer programa desta máquina
 * alcança `/api/*` direto, sem passar por tela nenhuma.
 *
 * Quem decide é `sessao.liberado()`, que só aceita o atestado assinado pelo
 * servidor (ver o cabeçalho de `sessao.js`). Ficam de fora só as rotas por
 * onde se entra: as da conta.
 *
 * Os arquivos da interface continuam sendo servidos — sem eles não haveria
 * tela de entrar. O que se tranca é o que TRABALHA: a API e as imagens
 * enviadas.
 */
const sessaoDaConta = require("./sessao");

app.use((req, res, next) => {
  const caminho = req.path;
  const protegido = caminho.startsWith("/api/") || caminho.startsWith("/uploads/");
  if (!protegido) return next();
  if (caminho.startsWith("/api/sessao/")) return next();
  if (sessaoDaConta.liberado()) return next();
  return res.status(401).json({
    erro: "conta",
    code: "conta",
    message: "Entre na sua conta do Optmize para usar esta função.",
  });
});

// O PDF do encaixe carrega as artes em tamanho de impressão, então precisa de
// um limite bem maior que o resto da API. Vem antes do express.json geral
// porque quem chega primeiro é quem manda no limite.
// As artes sobem em binário pela rota /arte (o próprio router cuida do
// limite); aqui sobra só o desenho do encaixe, que é pequeno.
// Os ajustes do último Optmizar, guardados para o próximo (ver o arquivo).
app.use("/api/encaixe", require("./ajustes-encaixe-api"));
app.use("/api/encaixe", express.json({ limit: "20mb" }), encaixePdfRouter);
app.use("/api/encaixe", express.json({ limit: "2mb" }), encaixeMemoriaRouter);

// A arte que o navegador não lê — o TIFF e o CMYK sem perfil — entra por aqui
// antes de chegar ao Encaixe. Recebe o arquivo cru, pelo mesmo motivo das
// rotas acima. Ver o cabeçalho de `arte-entrada.js`.
app.use("/api/arte", require("./arte-entrada"));

// O Extrator recebe a foto crua (ver o cabeçalho de `extrator-api.js`): vem
// antes do express.json geral, pelo mesmo motivo do /api/arte.
app.use("/api/extrator", require("./extrator-api"));

// O PDF do risco que a tela Digitalizar achou. Linha, e só linha — não sobe
// arte nenhuma —, então o limite dele mora dentro da própria rota, e não aqui.
app.use("/api/risco", riscoPdfRouter);

app.use(express.json({ limit: "15mb" })); // dá folga para o contorno de um molde com muitas peças

// Os arquivos que as duas telas usam como estão: o sprite de ícones e o wasm
// do encaixe. Vêm primeiro porque as duas os pedem pelo mesmo caminho.
app.use(express.static(path.join(PASTA_DO_APP, "estatico")));

// O painel compilado. Um arquivo que existe é servido como está.
app.use(express.static(path.join(PASTA_DO_APP, "dist")));

/*
 * `/app` foi o endereço do painel durante a migração, então ele continua
 * levando a algum lugar em vez de dar 404: são meses de link salvo, aba
 * aberta e atalho na área de trabalho da fábrica.
 *
 * Ele carrega adiante a tela que o link pedia, e essa tela pode vir das duas
 * formas — `/app/#/moldes`, do tempo do "#", ou `/app/moldes`, de agora. O
 * "#" NÃO chega ao servidor, então quem o traduz é a página de uma linha
 * devolvida aqui, já dentro do navegador.
 */
app.get(/^\/app(\/.*)?$/, (req, res) => {
  // O caminho depois de `/app`, para o caso de o link antigo não ter "#".
  const caminho = req.path.replace(/^\/app/, "") || "/";
  res.type("html").send('<!doctype html><meta charset="utf-8"><script>'
    // O "#" só existe aqui dentro do navegador; `slice(1)` tira o "#" e
    // deixa o que vem depois, que já é o caminho da tela.
    + 'var tela = location.hash.slice(1);'
    + 'location.replace(tela ? (tela[0] === "/" ? tela : "/" + tela) : '
    + JSON.stringify(caminho) + ');'
    + '</script>');
});

app.use("/uploads", express.static(RAIZ_DE_UPLOADS));

/*
 * A CONTA DE QUEM ESTÁ USANDO.
 *
 * Fica FORA de qualquer trava: é por estas rotas que se entra, e barrá-las
 * trancaria a instalação para sempre na primeira abertura. Ver o cabeçalho de
 * `sessao.js` para por que o login passa pelo Node em vez de a página falar
 * direto com o backend.
 */
app.use("/api/sessao", sessaoDaConta.rotas);

app.use("/api/moldes", moldesRouter);
app.use("/api/projetos", projetosRouter);
app.use("/api/galeria", galeriaArquivosRouter);
// A Reposição: cada trabalho exportado, guardado para refazer peças.
// O JSON leva as miniaturas das peças, por isso o limite maior.
app.use("/api/reposicao", express.json({ limit: "30mb" }), require("./reposicao-api"));

/*
 * ===========================================================================
 * A ROTA-CURINGA DO PAINEL
 * ===========================================================================
 *
 * As telas passaram a morar no CAMINHO do endereço (`/encaixe`) em vez do "#"
 * (`#/encaixe`), e a diferença cai toda aqui: o "#" nunca chegava ao
 * servidor, e o caminho chega. Sem esta rota, abrir `/encaixe` direto,
 * recarregar a página numa tela, ou dar um atalho na área de trabalho para
 * uma tela daria 404 — no navegador E dentro do app instalado, que é o mesmo
 * servidor (ver `src-tauri/src/main.rs`: a janela navega para a raiz dele).
 *
 * Vem DEPOIS de tudo, e é isso que a mantém inofensiva: arquivo que existe já
 * foi servido pelo `express.static` acima, e rota de API que existe já
 * respondeu. O que sobra é endereço de tela, e todo endereço de tela é o mesmo
 * `index.html` — quem decide o que desenhar é o React, no navegador.
 *
 * `/api` e `/uploads` ficam de fora de propósito: um caminho de API que não
 * existe tem que responder 404, e não devolver a página inteira do painel —
 * senão um erro de digitação numa chamada vira um `JSON.parse` engasgando em
 * "<!doctype html>", que é o pior jeito de contar que a rota está errada.
 */
app.get(/^\/(?!api\/|uploads\/).*/, (req, res) => {
  res.sendFile(path.join(PASTA_DO_APP, "dist", "index.html"));
});

const PORT = process.env.PORT || 8000;

servidor.listen(PORT, "127.0.0.1", () => {
  // A memória coletiva do encaixe: manda a fila e baixa o que as outras lojas
  // ensinaram, logo depois de subir e de tempo em tempo (ver encaixe-coletivo.js).
  require("./encaixe-coletivo").iniciar();
  console.log("");
  console.log(`Optimize rodando em http://localhost:${PORT}`);
  console.log("");
});
