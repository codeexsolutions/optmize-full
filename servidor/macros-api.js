/**
 * A tela de Macros: entregar o arquivo da macro e ajudar a pô-lo no Corel.
 *
 * O CorelDRAW 2025 roda macro em VSTA (C#), não em VBA — o editor do Alt+F11 é
 * o de estilo Visual Studio, e o projeto global dele é o `VSTAGlobal.CgsAddon`
 * da pasta `Draw`. Por isso a macro daqui é um `.cs`, e não um `.bas`.
 *
 * COMO A INSTALAÇÃO FUNCIONA
 * --------------------------
 * O `.CgsAddon` é um ZIP com o projeto C# dentro, e existe UM só por aplicativo
 * — o da pessoa, com as macros dela. Por isso instalar é ACRESCENTAR, nunca
 * substituir: `corel/instalar-no-corel.ps1` abre o pacote, põe o `.cs` dentro e
 * cita o arquivo nas duas listas que o VSTA lê, deixando o resto intocado.
 * Desinstalar desfaz exatamente esses três passos.
 *
 * O script é PowerShell, e não Node, porque quem mexe no projeto de macros do
 * Corel precisa rodar sozinho na máquina do usuário quando o servidor não está
 * de pé — e porque o formato do pacote exige controle de byte que o `zlib` do
 * Node não dá de graça (o `mimetype` tem que vir primeiro e sem compressão).
 */

const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const router = express.Router();

const { PASTA_DO_APP } = require("./caminhos");

const PASTA_DAS_MACROS = path.join(PASTA_DO_APP, "corel");

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
 * O CorelDRAW desta máquina: onde ficam as macros e onde fica o projeto VSTA.
 *
 * Cada versão do Corel tem a pasta dela em `%APPDATA%\Corel`, e uma máquina de
 * produção costuma ter mais de uma instalada. Fica a mais nova: é a que a
 * pessoa está usando, e é onde ela vai procurar.
 *
 * O que interessa é a pasta `Draw`: é lá que mora o `VSTAGlobal.CgsAddon`. A
 * pasta `CorelVSTA` ao lado é só o diretório de trabalho do editor, e costuma
 * estar vazia — procurar a macro por lá não acha nada.
 */
function pastaDoCorel() {
  if (process.platform !== "win32") return null;
  const raiz = path.join(os.homedir(), "AppData", "Roaming", "Corel");
  let melhor = null;
  try {
    for (const nome of fs.readdirSync(raiz)) {
      if (!/CorelDRAW Graphics Suite/i.test(nome)) continue;
      const draw = path.join(raiz, nome, "Draw");
      const addon = path.join(draw, "VSTAGlobal.CgsAddon");
      if (!fs.existsSync(addon)) continue;
      const ano = Number((nome.match(/(\d{4})/) || [])[1] || 0);
      if (!melhor || ano > melhor.ano) melhor = { ano, pasta: draw, addon, versao: nome };
    }
  } catch (erro) {
    return null;
  }
  return melhor;
}

/**
 * A macro já está dentro do projeto do Corel?
 *
 * Procura o nome do arquivo nos bytes do pacote em vez de descompactá-lo: o
 * ZIP guarda os nomes em texto claro nos cabeçalhos, então o nome aparece ali
 * sempre que a entrada existe. É uma resposta de milissegundos para uma tela
 * que a pede a cada carregamento — e o preço de errar é pequeno: o botão
 * apareceria com o rótulo trocado, nunca instalaria errado.
 */
function jaInstalada(addon, nomeArquivo) {
  try {
    return fs.readFileSync(addon).includes(Buffer.from(nomeArquivo, "utf8"));
  } catch (erro) {
    return false;
  }
}

/** Roda o instalador e devolve o JSON que ele imprime. */
function rodarInstalador(args) {
  return new Promise((resolve) => {
    execFile("powershell.exe", [
      "-NoProfile", "-ExecutionPolicy", "Bypass",
      "-File", path.join(PASTA_DAS_MACROS, "instalar-no-corel.ps1"),
      ...args,
    ], { windowsHide: true }, (erro, saida, erroSaida) => {
      // O script responde em JSON tanto no sucesso quanto na falha, e sai com
      // código 1 quando falha — então `erro` sozinho não diz o que houve. O que
      // vale é o JSON; o `erro` só entra se nem isso vier.
      const texto = String(saida || "").trim();
      try {
        resolve(JSON.parse(texto.split(/\r?\n/).filter(Boolean).pop()));
      } catch (falha) {
        resolve({
          ok: false,
          mensagem: texto || String(erroSaida || "").trim()
            || (erro ? erro.message : "O instalador não respondeu."),
        });
      }
    });
  });
}

/** O catálogo e o que se sabe do Corel desta máquina. */
router.get("/", (req, res) => {
  const corel = pastaDoCorel();
  res.json({
    macros: CATALOGO.map((item) => {
      const dados = comArquivo(item);
      dados.instalada = corel ? jaInstalada(corel.addon, item.arquivo) : false;
      return dados;
    }),
    corel: corel
      ? { encontrado: true, versao: corel.versao, pasta: corel.pasta, addon: corel.addon }
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
  // O .cs é ASCII de propósito: o editor do VSTA abre o arquivo na página de
  // código do sistema, e um acento em UTF-8 chegaria lá quebrado. Sem acento
  // nenhum no arquivo, as duas leituras dão no mesmo.
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${pedido}"`);
  fs.createReadStream(caminho).pipe(res);
});

/**
 * Põe o arquivo na pasta do Corel e abre a pasta no Explorer.
 *
 * É a saída para quando a instalação automática não serve: o Corel está aberto
 * e a pessoa não quer fechá-lo agora, ou ela prefere pôr a macro num projeto
 * seu em vez do global. O que ele faz é tirar da frente a parte chata — achar
 * onde salvar e depois achar o que salvou —, deixando só o
 * `Alt+F11 > Add > Existing Item` com o arquivo já selecionado na janela.
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

/**
 * Instala (ou remove) a macro dentro do projeto VSTA do Corel.
 *
 * O trabalho todo é do `instalar-no-corel.ps1` — inclusive a recusa quando o
 * CorelDRAW está aberto, que não é frescura: ao fechar, ele reescreve o projeto
 * de macros a partir do que tem em memória e desfaria a instalação em silêncio.
 */
router.post("/:id/instalar-no-corel", async (req, res) => {
  const item = CATALOGO.find((m) => m.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Macro desconhecida." });

  const corel = pastaDoCorel();
  if (!corel) {
    return res.status(404).json({
      error: "Não achei o projeto de macros do CorelDRAW nesta máquina.",
    });
  }

  const tirar = req.query.remover === "1";
  const resposta = await rodarInstalador([
    "-Origem", path.join(PASTA_DAS_MACROS, item.arquivo),
    "-Addon", corel.addon,
    ...(tirar ? ["-Desinstalar"] : []),
  ]);

  if (!resposta.ok) return res.status(409).json({ error: resposta.mensagem });
  res.json({
    ok: true,
    mensagem: resposta.mensagem,
    versao: corel.versao,
    instalada: !tirar,
    macro: item.macro,
  });
});

module.exports = router;
