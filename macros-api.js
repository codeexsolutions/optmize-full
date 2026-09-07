/**
 * A tela de Macros: entregar o arquivo da macro e ajudar a pô-lo no Corel.
 *
 * POR QUE ISTO NÃO INSTALA SOZINHO
 * --------------------------------
 * O caminho óbvio seria o sistema enfiar a macro no Corel sem ninguém mexer.
 * Ele não existe, e isso foi conferido nesta máquina, não deduzido:
 *
 *   - `CorelDRAW.Application.VBE` responde, mas devolve um objeto vazio — o
 *     `MainWindow.Visible` nem existe nele e `VBProjects.Count` fica em zero
 *     mesmo com o programa aberto e um documento na tela. O modelo de projeto
 *     do VBA não é alcançável por automação, então não dá para importar o
 *     `.bas` por fora.
 *
 *   - A pasta que o Corel varre sozinho ao abrir (`GMSManager.UserGMSPath`)
 *     carrega `.gms`, que é projeto compilado do VBA — formato binário que não
 *     se escreve à mão. Copiar um `.bas` para lá não faz o Corel enxergá-lo.
 *
 * Então o que sobra, e é o que esta tela faz bem: entregar o arquivo, deixá-lo
 * num lugar que a pessoa acha, e dizer os três cliques que faltam. O passo
 * manual é `Alt+F11 > Arquivo > Importar arquivo`, e é uma vez só por máquina.
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
    arquivo: "Optimize.bas",
    nome: "Nome e número de camisa",
    resumo: "Monta uma página por jogador, nome em cima e número embaixo, "
      + "nas medidas da camisa. Nome comprido é condensado, nunca diminuído.",
    entrada: "Uma linha por jogador: NOME;NÚMERO",
    macro: "Optimize.NomesENumeros",
  },
];

/** Os dados de um item do catálogo, já com o que veio do disco. */
function comArquivo(item) {
  const caminho = path.join(PASTA_DAS_MACROS, item.arquivo);
  let bytes = 0;
  let atualizado = null;
  try {
    const info = fs.statSync(caminho);
    bytes = info.size;
    atualizado = info.mtime.toISOString();
  } catch (erro) {
    return { ...item, existe: false, bytes: 0, atualizado: null };
  }
  return { ...item, existe: true, bytes, atualizado };
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
router.get("/:id/arquivo", (req, res) => {
  const item = CATALOGO.find((m) => m.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Macro desconhecida." });

  const caminho = path.join(PASTA_DAS_MACROS, item.arquivo);
  if (!fs.existsSync(caminho)) {
    return res.status(404).json({ error: "O arquivo da macro não está no servidor." });
  }
  // O .bas é ASCII de propósito (ver o cabeçalho dele): o editor do Corel lê
  // ANSI, e um arquivo em UTF-8 aparece lá com os acentos quebrados.
  res.setHeader("Content-Type", "text/plain; charset=windows-1252");
  res.setHeader("Content-Disposition", `attachment; filename="${item.arquivo}"`);
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

  const de = path.join(PASTA_DAS_MACROS, item.arquivo);
  const para = path.join(corel.pasta, item.arquivo);
  try {
    fs.copyFileSync(de, para);
  } catch (erro) {
    return res.status(500).json({ error: `Não deu para salvar: ${erro.message}` });
  }

  // Abrir a pasta é conveniência, não parte do trabalho: se o Explorer não
  // abrir, o arquivo já está no lugar e o caminho vai na resposta.
  try {
    execFile("explorer.exe", ["/select,", para], () => {});
  } catch (erro) { /* segue sem abrir */ }

  res.json({ ok: true, caminho: para, versao: corel.versao });
});

module.exports = router;
