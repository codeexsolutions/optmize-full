/**
 * ===========================================================================
 * A SESSÃO DAS BANCADAS DE NAVEGADOR — entrar sem backend e sem digitar
 * ===========================================================================
 *
 * Desde 2026-09-21 o painel pede conta para abrir: a casca lê
 * `/api/sessao/eu` e, se ninguém entrou, desenha a tela de entrar no lugar do
 * programa (ver `src/casca/Casca.tsx`). As três bancadas que sobem um Chrome
 * de verdade — `conferir-tela`, `conferir-pdf-entrada` e
 * `conferir-molde-da-imagem` — passaram a parar ali, e o sintoma não dizia
 * nada: `Cannot read properties of null (reading 'uploadFile')`, porque o
 * campo de arquivo que elas procuram mora numa tela que nunca foi desenhada.
 *
 * ---------------------------------------------------------------------------
 * POR QUE SEMEAR O ARQUIVO, E NÃO PREENCHER O FORMULÁRIO
 * ---------------------------------------------------------------------------
 *
 * Entrar pela tela obrigaria a bancada a falar com o backend no Railway: ela
 * passaria a reprovar quando a internet caísse, quando a conta de teste
 * expirasse ou quando o servidor de produção estivesse em manutenção — e
 * nenhuma dessas coisas é o que ela mede. Pior: cada corrida abriria uma
 * sessão de verdade, e a regra de uma tela ativa por conta derrubaria o painel
 * de quem estivesse trabalhando.
 *
 * O que `servidor/sessao.js` guarda é um arquivo, e é ele a única verdade que
 * a tela consulta. Escrevê-lo direto na pasta de dados descartável é entrar
 * pelo mesmo lugar que o login entra, sem rede nenhuma no meio.
 *
 * O TOKEN É DE MENTIRA de propósito. Nada nestas bancadas o usa: as rotas que
 * elas exercitam (`/api/encaixe`, `/api/moldes`, …) são locais e não pedem
 * conta. No dia em que o portão do servidor existir (o pedaço B do plano da
 * identidade), é aqui que o token de teste passa a ser emitido — num lugar só,
 * e não em três.
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * Deixa a pasta de dados com alguém já dentro.
 *
 * `pasta` é a mesma que vai em `OPTIMIZE_DADOS`, e isto roda ANTES de subir o
 * servidor: `sessao.js` lê o arquivo na primeira pergunta e guarda a resposta
 * em memória, então semear depois não teria efeito nenhum.
 */
function semearSessao(pasta) {
  const destino = path.join(pasta, 'sessao');
  fs.mkdirSync(destino, { recursive: true });
  fs.writeFileSync(path.join(destino, 'sessao.json'), JSON.stringify({
    accessToken: 'bancada-sem-valor',
    refreshToken: 'bancada-sem-valor',
    perfil: { nome: 'Bancada de Teste', empresa: 'Optmize', papel: 'dono' },
    entrouEm: new Date().toISOString(),
  }));
  return destino;
}

module.exports = { semearSessao };
