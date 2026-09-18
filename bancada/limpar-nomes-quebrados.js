#!/usr/bin/env node
/**
 * ===========================================================================
 * Remove o registro que ficou com o nome mal decodificado, e SÓ ele
 * ===========================================================================
 *
 * O leitor do PrintExp lia o `PrintData.xml` inteiro como GBK, e isso estragava
 * nome acentuado de duas formas (ver o cabeçalho de `sources/printExp.js`):
 *
 *   FALCÃO   ->  FALC肙        o acento e a letra seguinte viraram um ideograma
 *   MAJOÁ    ->  MAJO<U+FFFD>  o byte do acento foi destruído na leitura
 *
 * Consertar o leitor não corrige o passado. O id de um registro embute o nome
 * do trabalho, então o nome certo entra como registro NOVO e o trabalho passa a
 * aparecer duas vezes — na tela e na soma de produção.
 *
 * POR QUE NÃO LIMPAR E REIMPORTAR TUDO. Seria uma linha, e perderia produção:
 * o PrintExp corta o começo do XML quando ele cresce, e o banco guarda
 * trabalhos que o arquivo já não tem. Reimportar traria só a janela atual.
 *
 * ENTÃO A REGRA AQUI É ESTREITA, e é o que torna a remoção segura:
 *
 *   só apaga registro cujo NOME tem a assinatura do erro, E
 *   só se existir um GÊMEO — mesmo horário, mesma área — com nome limpo.
 *
 * Sem gêmeo, o registro fica. Nome feio é ruim; perder um trabalho que a
 * origem já não tem é pior, e é irreversível.
 *
 * Roda sem argumento para só LISTAR. `--apagar` executa.
 *
 *   node bancada/limpar-nomes-quebrados.js
 *   node bancada/limpar-nomes-quebrados.js --apagar
 */

const { queryAll, deleteByIds } = require("../servidor/impressoras/db/records");

/** A assinatura do erro: ideograma cercado de letra latina, ou byte destruído. */
function nomeQuebrado(nome) {
  const texto = String(nome || "");
  if (texto.includes("�")) return "byte destruído";
  const temCjk = /[㐀-䶿一-鿿豈-﫿]/.test(texto);
  if (temCjk && /[A-Za-z]/.test(texto)) return "ideograma no meio de letras";
  return null;
}

/* Mesmo trabalho: mesma máquina, mesmo instante, mesma área impressa. O nome
   fica FORA da chave de propósito — é justamente ele que difere entre os dois. */
const chaveDoTrabalho = (r) =>
  `${r.machineId}|${r.dateTime}|${Number(r.printArea || 0).toFixed(4)}`;

const apagar = process.argv.includes("--apagar");
const registros = queryAll();

const porChave = new Map();
for (const r of registros) {
  const chave = chaveDoTrabalho(r);
  if (!porChave.has(chave)) porChave.set(chave, []);
  porChave.get(chave).push(r);
}

const paraApagar = [];
const semGemeo = [];

for (const r of registros) {
  const motivo = nomeQuebrado(r.task);
  if (!motivo) continue;
  const irmaos = porChave.get(chaveDoTrabalho(r)) || [];
  const limpo = irmaos.find((outro) => outro.id !== r.id && !nomeQuebrado(outro.task));
  if (limpo) paraApagar.push({ r, motivo, limpo });
  else semGemeo.push({ r, motivo });
}

console.log(`${registros.length} registros no banco.\n`);

if (paraApagar.length) {
  console.log(`=== ${paraApagar.length} duplicata(s) para remover ===`);
  for (const { r, motivo, limpo } of paraApagar) {
    console.log(`  ${r.machineName || r.machineId}  ${r.dateTime}  (${motivo})`);
    console.log(`    apaga  ${JSON.stringify(r.task)}`);
    console.log(`    fica   ${JSON.stringify(limpo.task)}`);
  }
  console.log("");
}

if (semGemeo.length) {
  console.log(`=== ${semGemeo.length} com nome quebrado e SEM gêmeo — ficam como estão ===`);
  console.log("  (o arquivo da máquina já não tem esses trabalhos; apagar perderia produção)");
  for (const { r, motivo } of semGemeo) {
    console.log(`  ${r.machineName || r.machineId}  ${r.dateTime}  ${JSON.stringify(r.task)}  (${motivo})`);
  }
  console.log("");
}

if (!paraApagar.length && !semGemeo.length) {
  console.log("Nenhum nome quebrado. Nada a fazer.");
  process.exit(0);
}

if (!apagar) {
  console.log("Nada foi alterado. Rode com --apagar para remover as duplicatas listadas.");
  process.exit(0);
}

const removidos = deleteByIds(paraApagar.map(({ r }) => r.id));
console.log(`${removidos} registro(s) removido(s).`);
