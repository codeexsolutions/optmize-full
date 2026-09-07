/**
 * A tela de Macros: entregar o arquivo da macro e ajudar a pô-lo no Corel.
 *
 * O CorelDRAW 2025 roda macro em VSTA (C#), não em VBA — o editor do Alt+F11 é
 * o de estilo Visual Studio, e o projeto global dele é o `VSTAGlobal.CgsAddon`
 * da pasta `Draw`. Por isso a macro daqui é um `.cs`, e não um `.bas`.
 *
 * POR QUE ISTO AINDA NÃO INSTALA SOZINHO
 * -------------------------------------
 * O `.CgsAddon` é um ZIP de arquivos de texto, então gerá-lo é possível — e é o
 * caminho para a instalação virar um clique. O que segura hoje é que existe UM
 * projeto global por aplicativo, e sobrescrevê-lo apagaria qualquer macro que a
 * pessoa já tenha escrito ali. Enquanto não houver como acrescentar sem
 * substituir, a tela entrega o arquivo e diz onde colá-lo.
 *
 */

const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const router = express.Router();

const PASTA_DAS_MACROS = path.join(__dirname, "corel");

/**
 * O catálogo. Cada macro é um arquivo em `corel/` mais o que a tela precisa
 * dizer sobre ele.
 *
 * A versão é a data da última mexida no arquivo, e não um número escrito à mão:
 * número à mão envelhece calado, e o que a pessoa precisa saber é se o arquivo
 * dela é mais velho que o do sistema.
 */
const CATALOGO = [
  {
    id: "nomes-e-numeros",
    arquivo: "OptimizeCamisa.cs",
    nome: "Nome e número de camisa",
    resumo: "Monta uma página por jogador, nome em cima e número embaixo, "
      + "nas medidas da camisa. Nome comprido é condensado, nunca diminuído.",
    entrada: "Uma linha por jogador: NOME;NÚMERO",
    macro: "CamisaDeTime",
    // Um arquivo só. No VSTA o painel é WinForms montado em código, então não
    // existe o par .frm/.frx que o VBA obrigaria a carregar junto.
  },
];

/** Os dados de um item do catálogo, já com o que veio do disco. */
function comArquivo(item) {
  // O item pode ser mais de um arquivo (ver `extras`): o tamanho e a data são
  // do conjunto, e a data é a do mais novo — é ela que responde "o que está no
  // Corel é mais velho que o do sistema?".
  const todos = [item.arquivo, ...(item.extras || [])];
  let bytes = 0;
  let atualizado = 0;
  for (const nome of todos) {
    try {
      const info = fs.statSync(path.join(PASTA_DAS_MACROS, nome));
      bytes += info.size;
      if (info.mtimeMs > atualizado) atualizado = info.mtimeMs;
    } catch (erro) {
      return { ...item, arquivos: todos, existe: false, bytes: 0, atualizado: null };
    }
  }
  return {
    ...item, arquivos: todos, existe: true, bytes,
    atualizado: new Date(atualizado).toISOString(),
  };
}

/**
 * Onde o CorelDRAW desta máquina guarda as macros do usuário.
 *
 * Cada versão do Corel tem a pasta dela em `%APPDATA%\Corel`, e uma máquina de
 * produção costuma ter mais de uma instalada. Fica a mais nova: é a que a
 * pessoa está usando, e é onde ela vai procurar.
 */
function pastaDoCorel() {
  if (process.platform !== "win32") return null;
  const raiz = path.join(os.homedir(), "AppData", "Roaming", "Corel");
  let melhor = null;
  try {
    for (const nome of fs.readdirSync(raiz)) {
      if (!/CorelDRAW Graphics Suite/i.test(nome)) continue;
      const gms = path.join(raiz, nome, "Draw", "GMS");
      if (!fs.existsSync(gms)) continue;
      const ano = Number((nome.match(/(\d{4})/) || [])[1] || 0);
      if (!melhor || ano > melhor.ano) melhor = { ano, pasta: gms, versao: nome };
    }
  } catch (erro) {
    return null;
  }
  return melhor;
}

/** O catálogo e o que se sabe do Corel desta máquina. */
router.get("/", (req, res) => {
  const corel = pastaDoCorel();
  res.json({
    macros: CATALOGO.map(comArquivo),
    corel: corel ? { encontrado: true, versao: corel.versao, pasta: corel.pasta }
      : { encontrado: false },
  });
});

/** O arquivo em si, para baixar. */
router.get("/:id/arquivo/:nome?", (req, res) => {
  const item = CATALOGO.find((m) => m.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Macro desconhecida." });

  // Sem nome, vem o arquivo principal. Com nome, tem que ser um dos declarados
  // no catálogo — o nome vem da URL, e caminho vindo de fora nunca escolhe
  // arquivo sozinho.
  const pedido = req.params.nome || item.arquivo;
  const permitidos = [item.arquivo, ...(item.extras || [])];
  if (!permitidos.includes(pedido)) {
    return res.status(404).json({ error: "Esta macro não tem esse arquivo." });
  }

  const caminho = path.join(PASTA_DAS_MACROS, pedido);
  if (!fs.existsSync(caminho)) {
    return res.status(404).json({ error: "O arquivo da macro não está no servidor." });
  }
  // O .bas é ASCII de propósito (ver o cabeçalho dele): o editor do Corel lê
  // ANSI, e um arquivo em UTF-8 aparece lá com os acentos quebrados.
  res.setHeader("Content-Type", "text/plain; charset=windows-1252");
  res.setHeader("Content-Disposition", `attachment; filename="${pedido}"`);
  fs.createReadStream(caminho).pipe(res);
});

/**
 * Põe o arquivo na pasta do Corel e abre a pasta no Explorer.
 *
 * Isso NÃO instala — ver o cabeçalho. O que ele faz é tirar da frente a parte
 * chata: achar onde salvar e depois achar o que salvou. Depois disto sobra
 * `Alt+F11 > Arquivo > Importar arquivo`, com o arquivo já selecionado na
 * janela que abriu.
 */
router.post("/:id/salvar-no-corel", (req, res) => {
  const item = CATALOGO.find((m) => m.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Macro desconhecida." });

  const corel = pastaDoCorel();
  if (!corel) {
    return res.status(404).json({
      error: "Não achei a pasta do CorelDRAW nesta máquina. Baixe o arquivo e "
        + "guarde onde preferir.",
    });
  }

  const todos = [item.arquivo, ...(item.extras || [])];
  let para = null;
  try {
    for (const nome of todos) {
      const destino = path.join(corel.pasta, nome);
      fs.copyFileSync(path.join(PASTA_DAS_MACROS, nome), destino);
      if (!para) para = destino; // o Explorer abre no principal
    }
  } catch (erro) {
    return res.status(500).json({ error: `Não deu para salvar: ${erro.message}` });
  }

  // Abrir a pasta é conveniência, não parte do trabalho: se o Explorer não
  // abrir, o arquivo já está no lugar e o caminho vai na resposta.
  try {
    execFile("explorer.exe", ["/select,", para], () => {});
  } catch (erro) { /* segue sem abrir */ }

  res.json({ ok: true, caminho: para, arquivos: todos, versao: corel.versao });
});

module.exports = router;
