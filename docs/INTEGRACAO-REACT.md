# Integração das telas de produção — 9 de setembro de 2026

Moldes, Projetos, Encaixe e Cor vivem no painel React. A navegação entre elas
conserva os arquivos, as imagens e o resultado do encaixe na mesma montagem.

**Três das quatro já saíram do controlador imperativo:** Cor, Projetos e
Moldes. Resta o Encaixe.

## Onde cada uma está

| Tela | Quem a desenha | O que falta |
|---|---|---|
| **Cor** | React (`telas/Cor.tsx`) | nada — mora dentro do `Producao` só para conservar a lista ao navegar |
| **Projetos** | React (`telas/Projetos.tsx`), desenhada pela ROTA | nada — a única amarra é levar um trabalho ao Encaixe, pela `ligacao` |
| **Moldes** | React (`telas/Moldes.tsx` + `telas/moldes/`), desenhada pela ROTA | nada — a amarra é levar o molde vestido ao Encaixe, pela `ligacao` |
| **Encaixe** | `producao/controlador.js` | a lista de peças, o canvas do risco e o painel de andamento — **o domínio já saiu** (ver abaixo) |

## Limite desta etapa

Esta ainda é uma integração de compatibilidade para UMA tela, **não a conclusão
da migração declarativa descrita em ARQUITETURA.md**. A lista de peças, o canvas
do risco e o painel de andamento do Encaixe continuam sendo atualizados pelo
controlador imperativo em `src/producao/controlador.js` — que caiu de 5.921 para
3.815 linhas no caminho. A estrutura inicial é
React, e o ciclo de vida, a navegação e a apresentação de erros são gerenciados
por `Producao.tsx`.

O código de domínio é importado de `src/motores/`. Não há iframe, carregamento de scripts de `public/` nem publicação das funções de tela no `window`. `escopo.js` limita consultas de elementos à montagem e remove eventos, temporizadores e URLs temporárias na desmontagem. Eventos de navegação fecham os editores abertos. A lista de Cor e o trabalho do Encaixe permanecem em memória ao visitar as demais telas.

Os elementos de listas e canvas são espaços de uso exclusivo do controlador: não adicionar filhos React dinâmicos nesses mesmos elementos enquanto essa integração existir. Os componentes de estrutura são memoizados para evitar reconciliação sobre conteúdo que o controlador modificou.

## Verificação

- `npm run tipos`
- `npx vite build`
- `npm run bancada:tela`: o painel num navegador de verdade, contra um servidor
  em pasta descartável — as artes entrando pelo `<input type="file">`, a medida
  saindo do dpi, a busca rodando nos workers, o risco no canvas e o PDF vindo do
  servidor. É o que o jsdom não alcança.
- `node bancada/conferir-react.cjs`: monta o `App` inteiro (com o router) num jsdom e anda por ele — rotas, StrictMode, ausência de gravações duplicadas, clientes e projetos, preservação dos milímetros no projeto, modais, Cor e conservação dos ajustes do Encaixe ao trocar de aba.
- `npm run bancada:conferir`: 624 rodadas provando que o motor em WebAssembly dá exatamente o mesmo resultado do motor em JavaScript.
- `npm run bancada:pdf`: geometria e tamanho real em oito configurações e sete tipos de arte.
- `npm run bancada:gravacao`: molde, estampa e projeto atravessam o banco e voltam. As coordenadas são feias de propósito (12,3456789) para que nenhum arredondamento passe despercebido, e a folga zero é conferida à parte, porque o `projetos-api.js` desvia do `numero()` só por causa dela.
- `npm run bancada:cor`: ida e volta sRGB → CMYK → sRGB pelo perfil U.S. Web Coated (SWOP), com tolerância por cor.
- Navegador em prévia isolada: cadastro de molde, importação de SVG de 10 × 20 cm e cálculo completo com workers.

A gravação de moldes/estampas e a conversão CMYK **passaram a ser conferidas**
(ver as duas linhas acima), e as duas viraram bancada, para não dependerem de
alguém lembrar de testar. Duas ressalvas honestas sobre o alcance delas:

- A conferência de gravação usa dados sintéticos **adversariais** — o objetivo
  é que nenhum arredondamento sobreviva —, não arte de produção. O que ela
  prova é que o caminho pelo banco não perde medida.
- A de cor parte de um perfil CMYK real (o SWOP que vem no Windows) e mede ida
  e volta. Ela **não** compara com um arquivo que já passou pela impressora.

O que continua sem conferência automática é o fluxo com **arquivo de produção
de verdade**: um molde exportado do Audaces ou do Corel, e uma arte CMYK vinda
do cliente. Esses dependem de material que só existe na loja.

## O que já saiu do Encaixe, e o que falta

O Encaixe é a última tela imperativa, e a maior: era mais da metade do
controlador. O que já foi separado dele — sem mexer numa conta, e conferido
pela `bancada:tela` a cada passo:

| Onde está agora | O que é |
|---|---|
| `motores/desenhoDoEncaixe.js` | o risco: rolo, peças, contornos e marcas de metro. Um desenho só para a tela, o PNG e o PDF |
| `motores/exportarEncaixe.js` | a arte de cada peça na resolução de impressão: escolha PNG/JPEG medida, passa-direto do JPEG, o dpi que não negocia |
| `api/encaixe.ts` | memória, recordes e PDF — com a regra de que falha de rede nunca derruba o encaixe |

O desenho deixou de ler variáveis de módulo: zoom, seleção e cores **chegam
como argumento**, e a "vista" (a escala que traduz pixel do mouse em
centímetro de tecido) é **devolvida** em vez de escrita numa variável de fora.
Era essa amarra que impedia a tela de virar React.

**O que falta é a tela em si**, e ela se divide em cinco pedaços que podem ir
um de cada vez, cada um com a `bancada:tela` como rede:

1. **A entrada de arquivos** (`adicionarArquivos`, `lerImagemCrua`,
   `montarPecaDaImagem`, `lerMoldesDoArquivo`) — vira
   `motores/entradaDoEncaixe.js`. Cuidado já pago: `lerImagemCrua` e
   `montarPecaDaImagem` moram entre funções que parecem vizinhas e não são;
   uma extração por recorte de texto já as levou junto por engano.
2. **A lista de peças e os grupos** — é `innerHTML` mais um `Map` de grupos;
   vira estado com uma linha por peça.
3. **A busca** (`optmizar`, ~380 linhas) — vira `motores/buscaDoEncaixe.js`
   recebendo ganchos de progresso, e o painel de andamento vira componente.
4. **O risco** — um `<canvas>` num `ref`, com o zoom e a seleção por área em
   estado; o desenho já está pronto para isso.
5. **O confere e o menu de exportar** — dois modais, o caminho mais curto.

Quando o quinto sair, somem juntos o `producao/controlador.js`, a
`Estrutura.tsx`, a `ligacao.ts` e o `<div className="producao">` das telas
migradas — e a `producao.css` pode virar utilitários.

## Próximos passos para concluir a arquitetura

1. Substituir progressivamente as listas, formulários e diálogos do controlador por componentes com estado React, conservando as funções de domínio e as medidas existentes. **Cor e Projetos já foram** — é o molde para as outras três, e o que ela ensinou está no cabeçalho de `src/telas/Cor.tsx`: o `data-page` tem de sair do elemento raiz (senão o controlador mexe numa classe que o próximo render desfaz), a tela sai de dentro da `Estrutura` memoizada, e a amarra com o Encaixe passa a ser o contexto de `src/producao/ligacao.ts` — cuja lista de funções, encolhendo, é a medida do quanto a migração andou.
   A de Projetos acrescentou três coisas ao que a Cor ensinou:

   - **A caixa de diálogo virou React** (`casca/Dialogo.tsx`): `avisar`,
     `confirmar` e `perguntar`, com o mesmo desenho da imperativa. As duas
     convivem enquanto Moldes e Encaixe usarem a de lá — e a de lá continua no
     DOM, escondida, o que importa saber na hora de escrever um teste: um
     seletor `.ui-dialog` acha as DUAS.
   - **Uma tela migrada vira rota de verdade.** Ela sai da `Estrutura` e passa
     a ser desenhada pelo `<Outlet/>`, dentro do `<Producao>` — que é onde mora
     o provedor da `ligacao`, ainda necessário para levar trabalho ao Encaixe.
   - **As classes de `producao.css` ficam.** Elas são escopadas em
     `:where(.producao)`, então a tela migrada se embrulha num `<div
     className="producao">`. Trocar o motor da tela e o desenho dela no mesmo
     passo faria uma mudança invisível chegar junto com uma visível.

   A de Moldes acrescentou mais duas lições, as duas achadas por um navegador
   de verdade e nenhuma delas visível no `tsc` ou no build:

   - **A caixa de diálogo React precisa da marca de escopo.** `producao.css` é
     escopada em `:where(.producao)`, e a caixa mora na casca, fora de qualquer
     editor de produção. Sem a marca ela saía sem estilo nenhum — e não era só
     feio: sem `position: fixed` ela caía no fim da página e o clique no botão
     ia parar em outro elemento, então "Excluir" deixava de excluir sem erro
     nenhum no console. A marca é `class="producao so-o-escopo"`, um
     `display: contents` que casa com o seletor sem gerar caixa. A bancada do
     React agora confere isso.
   - **O modal ficava por baixo do menu lateral.** `.modal-fundo` nasceu com
     `z-index: 60` e a barra é 80: o menu atravessava o véu e ficava aceso por
     cima do modal. Era assim desde antes da migração — só o modal de Optmizar
     escapava, porque tinha z-index próprio. Agora `.modal-fundo` é 90.

2. Separar a transferência de peças em um contexto tipado, retirando a dependência de campos do formulário. **Metade feito**: `ligacao.ts` já leva um projeto inteiro tipado (`ProjetoParaOEncaixe`), mas quem o recebe ainda escreve nos campos do formulário do Encaixe — some quando o Encaixe virar React.
3. ~~Validar CRUD de moldes e estampas, conversão de cor e exportação integrada em uma cópia descartável do banco com amostras representativas.~~ **Feito** — `bancada:gravacao` e `bancada:cor`, os dois em pasta descartável, sem encostar no `dados.db`. Falta só a exportação integrada e o material de produção de verdade.
4. ~~Somente então retirar a interface antiga, ajustar o endereço de entrada e eliminar as cópias transitórias.~~ **Feito, e antes da ordem prevista** — a interface antiga não tinha mais nada apontando para ela depois que as quatro telas passaram a viver em `/app`, então segurá-la só mantinha o domínio duplicado. O `public/` saiu (22.608 linhas), o painel voltou para a raiz, e `/app` responde com um redirecionamento que carrega o `#` adiante, por causa dos links salvos.
