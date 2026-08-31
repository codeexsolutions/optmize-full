/**
 * ===========================================================================
 * ÍCONES — monta `public/icones.svg` com os ícones do Lucide que a tela usa
 * ===========================================================================
 *
 * O Lucide tem 2048 ícones e o pacote inteiro passa de 1 MB. Mandar isso para
 * o navegador (ou para dentro do instalador) por causa de meia dúzia de
 * desenhos não faz sentido, e escolher a dedo numa lista aqui dentro só adia o
 * problema: um dia alguém põe um ícone no HTML, esquece da lista e o desenho
 * não aparece.
 *
 * Então a lista é a própria tela. Este script varre o HTML e o JS/TSX atrás
 * de `icones.svg#nome-do-icone` e monta o sprite com exatamente o que
 * encontrou — usou, entra; parou de usar, sai sozinho no próximo
 * `npm run icones`. Vale para as duas telas: a antiga em `public/` e a nova
 * em `src/`.
 *
 * No HTML o uso é sempre este, e a cor vem do CSS (`currentColor`):
 *
 *     <svg class="size-5" aria-hidden="true"><use href="icones.svg#scissors" /></svg>
 *
 * A espessura do traço é normalizada em 1.8 (o Lucide entrega 2). É a mesma
 * dos ícones que o menu lateral já usava desenhados à mão, e é ela que dá o
 * ar mais fino da interface. Um `<use>` não consegue trocar isso por fora: o
 * atributo do símbolo ganha do que vem herdado, então quem quiser outro peso
 * muda aqui, para todo mundo de uma vez.
 */

const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const LUCIDE = path.join(RAIZ, "node_modules", "lucide-static");
const DESTINO = path.join(RAIZ, "estatico", "icones.svg");
const TRACO = "1.8";

/** Onde procurar por `icones.svg#...`: as duas telas, inteiras. */
function fontes() {
  const achados = [];
  const vale = /.(html|js|jsx|ts|tsx)$/;

  const varrer = (pasta) => {
    if (!fs.existsSync(pasta)) return;
    for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
      const caminho = path.join(pasta, item.name);
      if (item.isDirectory()) varrer(caminho);
      else if (vale.test(item.name)) achados.push(caminho);
    }
  };

  varrer(path.join(RAIZ, "public"));
  varrer(path.join(RAIZ, "src"));
  if (fs.existsSync(path.join(RAIZ, "index.html"))) achados.push(path.join(RAIZ, "index.html"));
  return achados;
}

/**
 * Só conta o que está entre aspas: "icones.svg#shapes" é uso, mas o mesmo
 * texto solto num comentário é documentação. Sem essa distinção, explicar o
 * formato num comentário faz o build sair procurando um ícone chamado
 * nome-do-icone — foi exatamente o que aconteceu na primeira versão disto.
 */
function nomesUsados() {
  const achados = new Set();
  for (const arquivo of fontes()) {
    const texto = fs.readFileSync(arquivo, "utf-8");
    for (const achado of texto.matchAll(/["']icones\.svg#([a-z0-9-]+)["']/g)) {
      achados.add(achado[1]);
    }
  }
  return [...achados].sort();
}

/**
 * O SVG do Lucide vira `<symbol>`: sai o cabeçalho do arquivo solto (licença,
 * `xmlns`, `width`, `height`, `class`) e fica só o desenho, com os atributos
 * de traço no símbolo para o ícone se pintar sozinho onde for usado.
 */
function virarSimbolo(nome, svg) {
  const abertura = svg.indexOf(">", svg.indexOf("<svg"));
  const desenho = svg
    .slice(abertura + 1, svg.lastIndexOf("</svg>"))
    .replace(/\s+/g, " ")
    .trim();

  return (
    `<symbol id="${nome}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="${TRACO}" stroke-linecap="round" stroke-linejoin="round">${desenho}</symbol>`
  );
}

const versao = JSON.parse(fs.readFileSync(path.join(LUCIDE, "package.json"), "utf-8")).version;
const nomes = nomesUsados();
const faltando = nomes.filter((nome) => !fs.existsSync(path.join(LUCIDE, "icons", `${nome}.svg`)));

if (faltando.length) {
  console.error(
    `icones: a tela pede ${faltando.length} ícone(s) que não existem no Lucide:\n` +
      faltando.map((nome) => `  - ${nome}`).join("\n") +
      `\nOs nomes certos estão em https://lucide.dev/icons ou em node_modules/lucide-static/icons/.`,
  );
  process.exit(1);
}

const simbolos = nomes.map((nome) =>
  virarSimbolo(nome, fs.readFileSync(path.join(LUCIDE, "icons", `${nome}.svg`), "utf-8")),
);

const sprite =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<!-- Gerado por empacotar/icones.js. Não edite à mão. -->\n` +
  `<!-- Ícones do Lucide ${versao} (licença ISC) — https://lucide.dev -->\n` +
  `<svg xmlns="http://www.w3.org/2000/svg">\n` +
  simbolos.map((s) => "  " + s).join("\n") +
  `\n</svg>\n`;

fs.writeFileSync(DESTINO, sprite);
console.log(`icones: ${nomes.length} ícones em estatico/icones.svg (${(sprite.length / 1024).toFixed(1)} KB)`);
