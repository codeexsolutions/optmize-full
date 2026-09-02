/**
 * Servidor do Optimize.
 *
 * Roda um servidor local (Express) que serve o painel web e as rotas de dados
 * de moldes, projetos e encaixe.
 *
 * O painel está no meio de uma mudança de arquitetura, e por isso são duas
 * telas ao mesmo tempo: a antiga em `/` (`public/`, scripts soltos) e a nova
 * em `/app` (`dist/`, React compilado pelo Vite). Quem serve as duas é este
 * mesmo arquivo, e é por isso que o Tauri não precisou mudar nada: ele sobe
 * este servidor exatamente como sempre subiu. Quando a última tela migrar,
 * `/app` vira `/` e o `public/` some. Tudo fica nesta máquina: o
 * banco é o arquivo `dados.db` e as imagens ficam em `uploads/` (ver
 * `caminhos.js` para onde exatamente).
 *
 * Abra http://localhost:8000 depois de rodar `npm start`. Instalado, quem
 * sobe este mesmo arquivo é o app do Tauri, numa porta livre qualquer.
 */

const path = require("path");
const express = require("express");

const { RAIZ_DE_UPLOADS } = require("./caminhos");
require("./db"); // garante que o banco SQLite e as tabelas existem antes de tudo
const encaixePdfRouter = require("./encaixe-pdf");
const encaixeMemoriaRouter = require("./encaixe-memoria");
const moldesRouter = require("./moldes-api");
const projetosRouter = require("./projetos-api");
const corRouter = require("./cor-api");

const app = express();

// O PDF do encaixe carrega as artes em tamanho de impressão, então precisa de
// um limite bem maior que o resto da API. Vem antes do express.json geral
// porque quem chega primeiro é quem manda no limite.
// As artes sobem em binário pela rota /arte (o próprio router cuida do
// limite); aqui sobra só o desenho do encaixe, que é pequeno.
app.use("/api/encaixe", express.json({ limit: "20mb" }), encaixePdfRouter);
app.use("/api/encaixe", express.json({ limit: "2mb" }), encaixeMemoriaRouter);

// A conversão de cor recebe a arte crua, e arte de produção passa de 15 MB com
// frequência. Como o PDF acima, precisa vir antes do express.json geral.
app.use("/api/cor", corRouter);

app.use(express.json({ limit: "15mb" })); // dá folga para o contorno de um molde com muitas peças

// Os arquivos que as duas telas usam como estão: o sprite de ícones e o wasm
// do encaixe. Vêm primeiro porque as duas os pedem pelo mesmo caminho.
app.use(express.static(path.join(__dirname, "estatico")));

// A tela antiga, na raiz.
app.use(express.static(path.join(__dirname, "public")));

// A tela nova. Não precisa de rota-curinga: as telas dela moram no "#" do
// endereço, que nunca chega ao servidor.
app.use("/app", express.static(path.join(__dirname, "dist")));

app.use("/uploads", express.static(RAIZ_DE_UPLOADS));
app.use("/api/moldes", moldesRouter);
app.use("/api/projetos", projetosRouter);

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
