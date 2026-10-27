#!/usr/bin/env node
/**
 * ===========================================================================
 * AS NOTAS DE UM LANÇAMENTO — o que o lançador mostra antes de atualizar
 * ===========================================================================
 *
 * Roda no lançamento automático (`.github/workflows/lancar.yml`), antes do
 * `publicar`. Lê os commits desde a última etiqueta `v*` e escreve, na saída
 * padrão, o texto que vai como `notes` da release:
 *
 *     Correções
 *     - O PDF do encaixe volta a sair com a cor da arte
 *     Adições
 *     - A pergunta de atualizar mostra o que mudou
 *
 * É esse texto que o lançador desenha na pergunta "Atualizar agora / Depois"
 * (ver `desenharNotas`, em `empacotar/janela/lancador.html`).
 *
 * DE ONDE VEM CADA LINHA
 * ----------------------
 * 1. Do corpo do commit, quando ele diz com todas as letras:
 *
 *        Correção: o PDF do encaixe volta a sair com a cor da arte
 *        Adição: a pergunta de atualizar mostra o que mudou
 *
 *    (também valem "Corrige:", "Conserta:", "Adiciona:", "Novo:", "Nova:").
 *    É o jeito certo — o texto é escrito para quem usa o programa.
 *
 * 2. Sem isso, do título do commit, classificado pelas palavras: "corrige",
 *    "conserta", "volta a", "erro", "falha", "trava"... é Correção; o resto
 *    é Adição.
 *
 * Ficam de fora: merges, "Build da tela..." (o painel recompilado, que não
 * diz nada a quem usa) e commits que não mexem em nada que vai no instalador
 * (documentação, bancada, firmware do ESP) — a mesma lista do `paths` do
 * lancar.yml.
 *
 *     node empacotar/notas-do-lancamento.js          → o texto, na tela
 *     node empacotar/notas-do-lancamento.js v1.2.400 → desde essa etiqueta
 */

const { execFileSync } = require("child_process");
const path = require("path");

const RAIZ = path.join(__dirname, "..");

/** O que vai para dentro do instalador — igual ao `paths` do lancar.yml. */
const DO_INSTALADOR = [
  /^src\//, /^dist\//, /^servidor\//, /^estatico\//, /^empacotar\//, /^src-tauri\//,
  /^estilo\//, /^index\.html$/, /^vite\.config\.mts$/, /^tsconfig\.json$/,
  /^package(-lock)?\.json$/, /^\.node-version$/,
];

/** O servidor guarda as notas na query da URL: um teto folgado para ela. */
const LIMITE = 2500;

const CORRECAO = /^\s*(corre[çc][ãa]o|corrige|conserta|corrigido)\s*:\s*(.+)$/i;
const ADICAO = /^\s*(adi[çc][ãa]o|adiciona|novo|nova|melhoria)\s*:\s*(.+)$/i;
const PALAVRAS_DE_CORRECAO =
  /\b(corrig\w*|corre[çc][ãa]o|consert\w*|arrum\w*|bug|erros?|falh\w*|quebr\w*|trav\w*|resolv\w*|volta(m)? a|n[ãa]o \S+( \S+)? mais|deixa(m)? de)\b/i;

function git(...args) {
  return execFileSync("git", args, { cwd: RAIZ, encoding: "utf8" });
}

/** A última etiqueta `v*` antes deste commit (a dele mesmo não conta: é um relançamento). */
function etiquetaAnterior() {
  const deste = new Set(git("tag", "--points-at", "HEAD").split(/\s+/).filter(Boolean));
  const todas = git("tag", "--merged", "HEAD", "--sort=-v:refname", "--list", "v*")
    .split(/\s+/)
    .filter(Boolean);
  return todas.find((t) => !deste.has(t)) ?? null;
}

function commits(desde) {
  const faixa = desde ? `${desde}..HEAD` : "HEAD~30..HEAD";
  const SEP = "\x1e";
  const CAMPO = "\x1f";
  const saida = git("log", "--no-merges", "--reverse", `--format=${SEP}%s${CAMPO}%b${CAMPO}`, "--name-only", faixa);
  return saida
    .split(SEP)
    .filter((b) => b.trim())
    .map((bloco) => {
      const [titulo, corpo, arquivos] = bloco.split(CAMPO);
      return {
        titulo: titulo.trim(),
        corpo: corpo ?? "",
        arquivos: (arquivos ?? "").split(/\r?\n/).map((a) => a.trim()).filter(Boolean),
      };
    });
}

/** A primeira letra maiúscula e sem ponto final: as linhas viram itens de lista. */
function limpar(texto) {
  const t = texto.trim().replace(/[.;]+$/, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function montar(desde) {
  const correcoes = [];
  const adicoes = [];

  for (const c of commits(desde)) {
    if (/^build da tela/i.test(c.titulo) || /^merge\b/i.test(c.titulo)) continue;
    if (c.arquivos.length && !c.arquivos.some((a) => DO_INSTALADOR.some((r) => r.test(a)))) continue;

    let explicito = false;
    for (const linha of c.corpo.split(/\r?\n/)) {
      let m;
      if ((m = CORRECAO.exec(linha))) {
        correcoes.push(limpar(m[2]));
        explicito = true;
      } else if ((m = ADICAO.exec(linha))) {
        adicoes.push(limpar(m[2]));
        explicito = true;
      }
    }
    if (explicito) continue;

    (PALAVRAS_DE_CORRECAO.test(c.titulo) ? correcoes : adicoes).push(limpar(c.titulo));
  }

  const unicos = (lista) => [...new Set(lista)];
  const secoes = [
    ["Correções", unicos(correcoes)],
    ["Adições", unicos(adicoes)],
  ].filter(([, itens]) => itens.length);

  // Cabe no limite tirando itens do fim, e diz quantos ficaram de fora.
  let texto = "";
  let fora = 0;
  for (;;) {
    texto = secoes.map(([nome, itens]) => [nome, ...itens.map((i) => `- ${i}`)].join("\n")).join("\n");
    if (fora) texto += `\n- E mais ${fora} ${fora === 1 ? "mudança" : "mudanças"}`;
    if (texto.length <= LIMITE) break;
    const maior = secoes.reduce((a, b) => (b[1].length > a[1].length ? b : a));
    if (!maior[1].length) break;
    maior[1].pop();
    fora++;
  }
  return texto;
}

if (require.main === module) {
  process.stdout.write(montar(process.argv[2] ?? etiquetaAnterior()) + "\n");
}

module.exports = { montar };
