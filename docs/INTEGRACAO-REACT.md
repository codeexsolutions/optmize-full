# Integração das telas de produção — 9 de setembro de 2026

Moldes, Projetos, Encaixe e Cor agora têm estrutura JSX e estão disponíveis dentro de `/app/`. A navegação entre essas telas conserva os arquivos, as imagens e o resultado do encaixe na mesma montagem. Projetos contém o editor completo, em vez de apenas listar clientes.

## Limite desta etapa

Esta é uma integração de compatibilidade, **não a conclusão da migração declarativa descrita em ARQUITETURA.md**. As listas, formulários e o canvas ainda são atualizados pelo controlador imperativo em `src/producao/controlador.js`. A estrutura inicial é React, e o ciclo de vida, a navegação e a apresentação de erros são gerenciados por `Producao.tsx`.

O código de domínio é importado de `src/motores/`. Não há iframe, carregamento de scripts de `public/` nem publicação das funções de tela no `window`. `escopo.js` limita consultas de elementos à montagem e remove eventos, temporizadores e URLs temporárias na desmontagem. Eventos de navegação fecham os editores abertos. A lista de Cor e o trabalho do Encaixe permanecem em memória ao visitar as demais telas.

Os elementos de listas e canvas são espaços de uso exclusivo do controlador: não adicionar filhos React dinâmicos nesses mesmos elementos enquanto essa integração existir. Os componentes de estrutura são memoizados para evitar reconciliação sobre conteúdo que o controlador modificou.

## Verificação

- `npm run tipos`
- `npx vite build`
- `node bancada/conferir-react.cjs`: StrictMode, ausência de gravações duplicadas, clientes e projetos, preservação dos milímetros no projeto, modais, navegação, Cor e conservação dos ajustes.
- `npm run bancada:porte`: 637 comparações entre os motores antigo e portado.
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

## Próximos passos para concluir a arquitetura

1. Substituir progressivamente as listas, formulários e diálogos do controlador por componentes com estado React, conservando as funções de domínio e as medidas existentes. **A tela de Cor já foi** — é o molde para as outras três, e o que ela ensinou está no cabeçalho de `src/telas/Cor.tsx`: o `data-page` tem de sair do elemento raiz (senão o controlador mexe numa classe que o próximo render desfaz), a tela sai de dentro da `Estrutura` memoizada, e a amarra com o Encaixe passa a ser o contexto de `src/producao/ligacao.ts` — cuja lista de funções, encolhendo, é a medida do quanto a migração andou.
2. Separar a transferência de peças em um contexto tipado, retirando a dependência de campos do formulário.
3. ~~Validar CRUD de moldes e estampas, conversão de cor e exportação integrada em uma cópia descartável do banco com amostras representativas.~~ **Feito** — `bancada:gravacao` e `bancada:cor`, os dois em pasta descartável, sem encostar no `dados.db`. Falta só a exportação integrada e o material de produção de verdade.
4. ~~Somente então retirar a interface antiga, ajustar o endereço de entrada e eliminar as cópias transitórias.~~ **Feito, e antes da ordem prevista** — a interface antiga não tinha mais nada apontando para ela depois que as quatro telas passaram a viver em `/app`, então segurá-la só mantinha o domínio duplicado. O `public/` saiu (22.608 linhas), o painel voltou para a raiz, e `/app` responde com um redirecionamento que carrega o `#` adiante, por causa dos links salvos.
