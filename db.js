/**
 * Banco de dados SQLite (arquivo local `dados.db`) para a biblioteca de moldes
 * e a memória do encaixe. Usa better-sqlite3 (síncrono, simples, sem servidor
 * separado). Onde o arquivo fica é decisão de `caminhos.js`: na pasta do
 * projeto quando se roda por `npm start`, na pasta de dados do usuário quando
 * é o app instalado.
 *
 * As tabelas do antigo módulo comercial/financeiro (clientes, produtos,
 * produções, lojas, notas, pagamentos, orçamentos e configurações) não são mais
 * criadas nem usadas. Num `dados.db` que já existia elas continuam gravadas,
 * intactas, caso algum dia seja preciso recuperar aqueles registros.
 */

const Database = require("better-sqlite3");
const { ARQUIVO_DO_BANCO } = require("./caminhos");

const db = new Database(ARQUIVO_DO_BANCO);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  -- Biblioteca de moldes. O desenho é feito fora (CorelDRAW, Audaces...) e
  -- mandado para cá; aqui fica guardado o que o sistema precisa saber: qual
  -- peça é qual, quantas vão em cada peça pronta, e em que tamanho.
  CREATE TABLE IF NOT EXISTS moldes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    observacoes TEXT,
    criado_em TEXT NOT NULL,
    atualizado_em TEXT
  );

  -- Cada peça do molde, guardada como o contorno em centímetros. Guardar a
  -- geometria (e não uma imagem) é o que deixa o molde sair depois em qualquer
  -- tamanho e em qualquer formato, sem perder precisão.
  CREATE TABLE IF NOT EXISTS molde_pecas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    molde_id INTEGER NOT NULL REFERENCES moldes(id) ON DELETE CASCADE,
    tamanho TEXT NOT NULL DEFAULT 'único',
    papel TEXT NOT NULL,
    nome TEXT,
    quantidade INTEGER NOT NULL DEFAULT 1,
    largura REAL NOT NULL,
    altura REAL NOT NULL,
    contorno TEXT NOT NULL,
    furos TEXT,
    origem TEXT,
    ordem INTEGER NOT NULL DEFAULT 0
  );

  -- As estampas guardadas de um molde: a mesma camiseta pode ter a arte da
  -- caveira, a da flor e a lisa. Cada estampa guarda a arte de cada parte e
  -- como ela foi ajustada, para voltar igualzinha no dia em que for preciso
  -- — e para dar para mandar duas estampas no mesmo encaixe.
  CREATE TABLE IF NOT EXISTS molde_artes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    molde_id INTEGER NOT NULL REFERENCES moldes(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    criado_em TEXT NOT NULL,
    atualizado_em TEXT
  );

  -- A arte de uma parte (frente, costas, manga direita...). A imagem fica em
  -- uploads/artes-molde; aqui fica o nome do arquivo e o ajuste (como entra,
  -- tamanho, giro e deslocamento). Guardar por papel, e não por tamanho, é o
  -- que faz a mesma estampa servir para P, M e G.
  CREATE TABLE IF NOT EXISTS molde_arte_pecas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    arte_id INTEGER NOT NULL REFERENCES molde_artes(id) ON DELETE CASCADE,
    papel TEXT NOT NULL,
    arquivo TEXT NOT NULL,
    nome_original TEXT,
    ajuste TEXT
  );

  -- O que a tela de Encaixe aprendeu. Cada linha é uma "receita" (qual
  -- encaixador, agrupamento, ordem e critério de posição) e como ela se saiu
  -- num tipo de trabalho — a assinatura agrupa trabalhos com peças de formato
  -- parecido. É isso que faz a busca começar mais esperta a cada encaixe.
  CREATE TABLE IF NOT EXISTS encaixe_receitas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assinatura TEXT NOT NULL,
    receita TEXT NOT NULL,
    usos INTEGER NOT NULL DEFAULT 0,
    vitorias INTEGER NOT NULL DEFAULT 0,
    atualizado_em TEXT NOT NULL,
    UNIQUE(assinatura, receita)
  );

  -- O melhor encaixe que já saiu de um trabalho, guardado inteiro: não só a
  -- metragem, mas a posição de cada peça. Sem isso, um encaixe bom aparecia
  -- uma vez e sumia — a busca é sorteada, e a rodada seguinte podia sair pior
  -- e apagar o que já tinha sido conseguido.
  --
  -- A chave é o trabalho exato (as mesmas peças, nas mesmas quantidades, na
  -- mesma largura de tecido, com a mesma folga). Trabalho diferente, encaixe
  -- diferente: por isso não dá para usar a "assinatura", que agrupa trabalhos
  -- só parecidos.
  CREATE TABLE IF NOT EXISTS encaixe_guardados (
    chave TEXT PRIMARY KEY,
    assinatura TEXT,
    largura_tecido REAL,
    espaco REAL,
    margem REAL,
    consumo REAL NOT NULL,
    aproveitamento REAL,
    pecas TEXT,
    posicoes TEXT NOT NULL,
    receita TEXT,
    criado_em TEXT NOT NULL,
    atualizado_em TEXT
  );

  -- Um registro por encaixe feito, para acompanhar se está melhorando mesmo.
  -- ==================== PROJETOS DE CLIENTE ====================
  --
  -- A estante de trabalho repetido: cliente -> projeto -> peças prontas.
  --
  -- É outra coisa que a biblioteca de moldes. No molde guarda-se a GEOMETRIA da
  -- peça, para a estampa ser aplicada nela depois. Aqui a estampa já está
  -- aplicada: o que entra é a arte final da camisa, da bandeira, do que for —
  -- pronta para ir ao encaixe sem mais nenhum passo.
  --
  -- O nome não é "clientes" de propósito. Um dados.db de instalação antiga
  -- ainda tem a tabela "clientes" do módulo comercial que saiu, e um
  -- CREATE TABLE IF NOT EXISTS com aquele nome não criaria nada — o código
  -- passaria a ler a tabela velha, com as colunas erradas.
  CREATE TABLE IF NOT EXISTS projeto_clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    observacoes TEXT,
    criado_em TEXT NOT NULL,
    atualizado_em TEXT
  );

  -- O projeto guarda também os ajustes do encaixe (largura do tecido, folga,
  -- margem e giro). É isso que faz "repetir" ser um clique: abrir o projeto e
  -- mandar para o Encaixe já vai com tudo preenchido, do jeito que deu certo da
  -- última vez.
  CREATE TABLE IF NOT EXISTS projetos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL REFERENCES projeto_clientes(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    observacoes TEXT,
    largura_tecido REAL,
    espaco REAL,
    margem REAL,
    giro TEXT,
    criado_em TEXT NOT NULL,
    atualizado_em TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_projetos_cliente ON projetos(cliente_id);

  -- Cada peça é a arte final e a medida dela em centímetros. A medida vem do
  -- dpi gravado no arquivo quando ele traz; quando não traz, é digitada — e
  -- fica guardada, para não ter que descobrir de novo na próxima repetição.
  CREATE TABLE IF NOT EXISTS projeto_pecas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projeto_id INTEGER NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    arquivo TEXT NOT NULL,
    largura REAL NOT NULL,
    altura REAL NOT NULL,
    quantidade INTEGER NOT NULL DEFAULT 1,
    ordem INTEGER NOT NULL DEFAULT 0,
    -- A arte reduzida a ~240 px, em data URL, só para a tela.
    --
    -- Sem ela, a lista e o editor apontavam <img> de 57 px para o arquivo
    -- inteiro: o navegador decodificava 29 a 67 megapixels para pintar um
    -- quadradinho, e isso travava a página por 0,5 a 1,8 s a cada abertura.
    miniatura TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_projeto_pecas_projeto ON projeto_pecas(projeto_id);

  CREATE TABLE IF NOT EXISTS encaixe_historico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assinatura TEXT NOT NULL,
    largura_tecido REAL,
    pecas INTEGER,
    consumo REAL,
    aproveitamento REAL,
    receita TEXT,
    tentativas INTEGER,
    criado_em TEXT NOT NULL
  );
`);

/**
 * Coluna que chegou depois: um dados.db criado antes desta versão já tem a
 * tabela, e o CREATE TABLE IF NOT EXISTS acima não a alteraria.
 */
function garantirColuna(tabela, coluna, definicao) {
  const existe = db.prepare(`PRAGMA table_info(${tabela})`).all().some((c) => c.name === coluna);
  if (!existe) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
}

garantirColuna("projeto_pecas", "miniatura", "TEXT");

db.pragma("optimize");

module.exports = db;
