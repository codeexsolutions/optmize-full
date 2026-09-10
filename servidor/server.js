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
 * Além do painel, este servidor é a central das impressoras da produção:
 * acha as máquinas na rede sozinho, lê o histórico de cada uma e guarda no
 * mesmo `dados.db` (ver `impressoras-api.js`). Como esse painel é para a
 * fábrica olhar, e não só quem está nesta mesa, a escuta é em `0.0.0.0` — de
 * outra máquina, abre-se pelo IP deste PC.
 *
 * Abra http://localhost:8000 depois de rodar `npm start`. Instalado, quem
 * sobe este mesmo arquivo é o app do Tauri, numa porta livre qualquer.
 */

const os = require("os");
const path = require("path");
const http = require("http");
const express = require("express");
const { Server: ServidorDeSocket } = require("socket.io");

const { RAIZ_DE_UPLOADS, PASTA_DO_APP } = require("./caminhos");
require("./db"); // garante que o banco SQLite e as tabelas existem antes de tudo
const encaixePdfRouter = require("./encaixe-pdf");
const macrosRouter = require("./macros-api");
const encaixeMemoriaRouter = require("./encaixe-memoria");
const encaixeResolverRouter = require("./encaixe-resolver");
const moldesRouter = require("./moldes-api");
const projetosRouter = require("./projetos-api");
const corRouter = require("./cor-api");
const { criarRotasDeImpressoras, iniciarImpressoras } = require("./impressoras-api");

const app = express();

// O socket precisa do servidor HTTP nu, não do Express. É por ele que a tela
// das impressoras fica sabendo de trabalho novo, do progresso da varredura da
// rede e do andamento de uma impressão — sem ficar perguntando.
const servidor = http.createServer(app);
const io = new ServidorDeSocket(servidor);

// O PDF do encaixe carrega as artes em tamanho de impressão, então precisa de
// um limite bem maior que o resto da API. Vem antes do express.json geral
// porque quem chega primeiro é quem manda no limite.
// As artes sobem em binário pela rota /arte (o próprio router cuida do
// limite); aqui sobra só o desenho do encaixe, que é pequeno.
app.use("/api/encaixe", express.json({ limit: "20mb" }), encaixePdfRouter);
app.use("/api/encaixe", express.json({ limit: "2mb" }), encaixeMemoriaRouter);

// Encaixar do lado de cá, para quem não tem navegador que dê conta — hoje, o
// CorelDRAW. Ver o cabeçalho de `encaixe-resolver.js` para o porquê.
//
// O limite é maior que o da memória porque o que chega aqui é geometria: um
// molde com contorno detalhado passa fácil dos 2 MB quando vêm vinte peças
// juntas, e recusar um pedido legítimo por causa do limite daria um 413 sem
// explicação no meio de uma macro.
app.use("/api/encaixe", express.json({ limit: "20mb" }), encaixeResolverRouter);

// A conversão de cor recebe a arte crua, e arte de produção passa de 15 MB com
// frequência. Como o PDF acima, precisa vir antes do express.json geral.
app.use("/api/cor", corRouter);

app.use(express.json({ limit: "15mb" })); // dá folga para o contorno de um molde com muitas peças

// Os arquivos que as duas telas usam como estão: o sprite de ícones e o wasm
// do encaixe. Vêm primeiro porque as duas os pedem pelo mesmo caminho.
app.use(express.static(path.join(PASTA_DO_APP, "estatico")));

// O painel. Não precisa de rota-curinga: as telas moram no "#" do endereço,
// que nunca chega ao servidor.
app.use(express.static(path.join(PASTA_DO_APP, "dist")));

/*
 * `/app` foi o endereço do painel durante toda a migração, então ele continua
 * levando a algum lugar em vez de dar 404: são meses de link salvo, aba
 * aberta e atalho na área de trabalho da fábrica.
 *
 * O redirecionamento carrega o "#" adiante — `/app/#/moldes` vira `/#/moldes`
 * —, senão quem clicasse num link antigo cairia na tela inicial em vez da que
 * pediu. O "#" NÃO chega ao servidor, então quem o transporta é a página de
 * uma linha devolvida abaixo, já no navegador.
 */
app.get(/^\/app(\/.*)?$/, (req, res) => {
  res.type("html").send('<!doctype html><meta charset="utf-8">'
    + '<script>location.replace("/" + location.hash)</script>');
});

app.use("/uploads", express.static(RAIZ_DE_UPLOADS));
// A tela de Macros: entrega o .bas da macro do Corel e ajuda a pô-lo lá.
app.use("/api/macros", macrosRouter);
app.use("/api/moldes", moldesRouter);
app.use("/api/projetos", projetosRouter);
// As impressoras da produção: varredura da rede, histórico, ordens de
// serviço, lista da calandra e os avisos no WhatsApp.
app.use("/api/impressoras", criarRotasDeImpressoras(io));

const PORT = process.env.PORT || 8000;

io.on("connection", (socket) => {
  socket.emit("connected", { ok: true });
});

// Os leitores das impressoras sobem antes da escuta: o backfill do histórico
// roda solto e pode levar um minuto, e não há motivo para o painel esperar
// por ele.
iniciarImpressoras(io);

/** Os IPs desta máquina na rede local, para dizer por onde os outros entram. */
function enderecosDaRede() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((rede) => rede && rede.family === "IPv4" && !rede.internal)
    .map((rede) => rede.address);
}

// "0.0.0.0" e não localhost: o painel das impressoras é para a fábrica inteira
// olhar. Quem roda o Optimize só para moldes e encaixe não perde nada — o
// endereço local continua sendo o mesmo de sempre.
servidor.listen(PORT, "0.0.0.0", () => {
  console.log("");
  console.log(`Optimize rodando em http://localhost:${PORT}`);
  for (const endereco of enderecosDaRede()) {
    console.log(`Na rede:              http://${endereco}:${PORT}`);
  }
  console.log("");
});
