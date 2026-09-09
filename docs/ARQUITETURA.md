# Arquitetura

Como este projeto é organizado, por que assim, e como a migração para React
acontece sem o sistema ficar quebrado no meio do caminho.

## A decisão

O front vira **React + TypeScript, compilado pelo Vite**. O servidor Express, o
SQLite e o Tauri **não mudam**: o instalador continua subindo o `server.js` com
o `node.exe` embutido e abrindo uma janela nele. O que muda é o que o Express
serve.

O que **não** vai acontecer é uma reescrita. São 12.447 linhas de front, e a
maior parte delas não é tela — é o produto.

## A linha que corta o projeto

Este é o levantamento real, contando quantas vezes cada arquivo toca o DOM:

| Camada | Linhas | O que é |
|---|---:|---|
| **Domínio puro** (zero DOM) | 4.407 | `encaixe-motor`, `vetor`, `encaixe-mascara`, `encaixe-wasm`, `geometria`, `encaixe-giro` e os 3 workers (o `nfp` estava nesta conta e saiu do projeto) |
| **Domínio com uma ponta no navegador** | 2.905 | `moldes` (o DXF e o PLT são puros; o leitor de SVG mede no DOM de verdade), `encaixe-paralelo`, `encaixe-prepara`, `arte-molde` |
| **Tela** | 5.135 | `encaixe`, `moldes-tela`, `projetos`, `vetor-tela`, `ui`, `interface` |

**7.312 linhas — quase 60% do front — não têm nada a ver com React.** São as
contas de encaixe, os leitores de DXF/PLT/SVG/PDF, a vetorização e o polígono
de não-encaixe. Esse código é o produto; a tela é a moldura dele.

Daí a regra que manda em tudo o resto:

> **Domínio se porta, não se reescreve.** Portar é acrescentar `export` e
> tirar a dependência do escopo global. Se uma conta mudou de resultado, o
> porte está errado.

`src/nucleo/geometria.ts` é a referência de como um módulo de domínio TIPADO se
parece.

### O domínio grande atravessa como `.js`, e isso é deliberado

A regra dizia "acrescentar `export` **e tipos**". Na prática, tipar à mão os
~9.000 linhas de domínio que faltam (motor de encaixe, vetor, leitores de
DXF/PLT/SVG, máscara, rede) seriam ~1.400 anotações em código numérico denso —
e cada anotação é uma chance de ler um índice errado e mudar um resultado sem
ninguém ver. Que é exatamente o que a regra acima proíbe.

Então o domínio grande entra como `.js`, por transformação **mecânica**: só
`import` e `export`, nada mais. O `tsconfig.json` aceita (`allowJs`), o Vite
empacota igual, e o porte é conferível — a prova de cada arquivo portado é
quantas linhas diferem do original:

| Arquivo | Linhas | Diferem |
|---|---|---|
| `nucleo/vetor.js` | 1.209 | **1** |
| `nucleo/encaixeMascara.js` | 452 | **6** |
| `nucleo/imagemWorker.js` | 423 | **5** |
| `nucleo/diagnosticoDaImagem.js` | 197 | só os `export` |

Os tipos entram depois, arquivo por arquivo, quando alguém tiver motivo para
mexer lá dentro. Quem chama declara o contrato do seu lado enquanto isso — ver
`OpcoesDoVetor`, em `src/telas/Vetor.tsx`.

### A cópia dupla é transitória, e tem regra

Enquanto o Encaixe não migrar, `encaixe-mascara`, `geometria` e o leitor de dpi
existem **nos dois lados**: a cópia de `public/` é a que a tela antiga carrega
por `<script>`, a que os workers carregam por `importScripts`, e — no caso da
máscara — a que a BANCADA lê como texto para medir o motor.

**Mexeu numa conta de um lado, mexe no outro, e rode `npm run bancada` antes e
depois.** As duas somem numa quando a Etapa C terminar.

## As pastas

```
src/                     A tela nova (React + TypeScript)
├── main.tsx             entrada: monta o React e carrega o CSS
├── App.tsx              a casca: menu + cabeçalho + a tela da vez
├── rotas.ts             a tabela das telas — uma linha por aba, e mais nada
├── casca/               o que toda tela usa: Menu, Cabecalho, Cartao, Icone
├── telas/               uma pasta por aba, quando ela migrar
├── api/                 cliente.ts (o fetch) e useDados.ts (os 3 estados)
└── nucleo/              DOMÍNIO PURO — sem DOM, sem React, roda em worker

estilo/
├── tokens.css           a paleta. O ÚNICO arquivo com hex no projeto
└── entrada.css          traduz os tokens em utilitários do Tailwind

estatico/                servido como está pelas duas telas
├── icones.svg           gerado: só os ícones do Lucide que o código usa
└── encaixe.wasm         gerado pelo Rust em wasm/

public/                  A TELA ANTIGA — some quando a migração terminar
dist/                    gerado pelo Vite; é o que o Express serve em /app
```

## Por que o Tauri não precisou mudar

O Tauri nunca soube o que é React, jQuery ou HTML solto. O que ele sabe está no
`tauri.conf.json`: rode `empacotar/preparar.js` antes de compilar, e leve a
pasta `src-tauri/servidor/` para dentro do instalador.

```
npm run front ──> icones.svg + tailwind.css + dist/
                        │
preparar.js ────────────┴──> src-tauri/servidor/  (+ node.exe + node_modules)
                                     │
tauri build ─────────────────────────┴──> Optimize_2.0.0_x64-setup.exe
```

O que mudou foi só a lista de pastas que o `preparar.js` copia (`dist` e
`estatico` entraram). O `tauri.conf.json` está intacto.

## A migração: uma tela de cada vez

As duas telas rodam ao mesmo tempo: a antiga em `/`, a nova em `/app`. Não é
provisório-eterno — é o que permite parar no meio de uma tela sem deixar o
sistema quebrado, e ter sempre a versão antiga do lado para comparar
comportamento.

### As duas telas têm o MESMO menu

Isto custou caro para ser aprendido: o programa instalado abre `/`, e quem o
abriu não tinha como adivinhar que metade do sistema morava noutro endereço.
A central das impressoras existia, funcionava, e era invisível.

Então os dois menus listam as treze telas. O que muda é o tipo do item:

- tela desta casca é botão;
- tela da outra casca é `<a>`, com uma seta discreta avisando que o clique sai
  da página. Na antiga são as seis de impressora; na nova são Cor, Imagem e
  Macros.

**Uma porta só.** Abre-se `localhost:8000` e tudo está no menu. O pulo entre
as cascas acontece no clique, não no conhecimento de quem usa.

### E as duas cascas são IGUAIS por fora

Listar tudo nos dois menus não bastou: clicar num item de impressora levava a
uma casca visivelmente diferente — outra largura de barra, outra marca, outro
jeito de marcar o item aberto, o relógio noutro canto. Parecia ter trocado de
programa, não de tela.

A casca nova nasceu como um REDESENHO da antiga, e enquanto as duas convivem
isso é defeito, não melhoria. Então `src/casca/Menu.tsx` e `Cabecalho.tsx`
copiam as medidas de `public/style.css` e `public/interface.css`: largura de
252px, os recuos, o `logo.png` (que passou a morar em `estatico/`, servido
pelas duas), o ativo com borda âmbar e a barrinha de 3px, e o relógio no pé do
menu — onde a casca antiga já o tinha posto, e pelo motivo dela: o cabeçalho
some na tela de encaixe e levava o relógio junto.

Até a ORDEM dos itens é a mesma, e foi a antiga que cedeu: Cor saiu do meio da
lista para junto de Imagem e Macros, no fim de Produção.

**A regra, enquanto durar a migração: mexeu na aparência de uma casca, mexe na
outra.** É trabalho dobrado, é temporário, e acaba junto com o `public/`.

Os links moram em `public/index.html` (mão) e em `TELAS_DA_CASCA_ANTIGA`, no
`src/rotas.ts`. **Tela que migra sai de um lado e vira botão do outro** — e
quando a última migrar, os dois blocos somem junto com o `public/`.

**A ordem que estava escrita aqui não sobreviveu ao levantamento.** Ela ia do
mais fácil para o mais arriscado e deixava o Encaixe por último. Mas três telas
ENTREGAM ARQUIVOS ao Encaixe por função global na mesma página:

```
Moldes   ─┐
Projetos ─┼─→  adicionarArquivos(File[])  →  Encaixe
Cor      ─┘
```

`File` em memória não atravessa uma navegação de página. Enquanto o Encaixe
estiver na casca antiga, qualquer uma das três que migre perde a entrega — que
no caso da Cor é o passo 4, o que o próprio arquivo dela chama de "o ponto da
tela".

Então a ordem passou a ser ditada pelas dependências:

| Etapa | O que | Estado |
|---|---|---|
| **A** | **Vetor**, **Imagem** e **Macros** — não conversam com ninguém | ✅ feita |
| **B** | O **motor de encaixe** vira módulo, sem tocar na lógica | a fazer |
| **C** | **Encaixe + Moldes + Projetos + Cor** juntos — as entregas viram estado React | a fazer |
| **D** | Apagar o `public/`, `base` do Vite vira `/` | a fazer |

### O grafo do domínio, que é raso

Levantado antes da Etapa A, porque cada tela puxava uma dependência nova e
estava sendo descoberta uma por vez:

```
geometria       independente        ← portado (.ts)
encaixe-giro    independente
encaixe-rede    independente
cor-do-arquivo  independente
arte-molde      independente

encaixe-mascara  ← geometria                     ← portado
vetor            ← geometria                     ← portado
moldes           ← geometria, encaixe-mascara
encaixe-prepara  ← encaixe-mascara
encaixe-paralelo ← encaixe-motor
encaixe-motor    ↔ encaixe-wasm      (ciclo)
```

Cinco arquivos podem ir sozinhos a qualquer momento. O `encaixe-motor` e o
`encaixe-wasm` **se exigem mutuamente** — funciona em `<script>` global e
funciona em ESM (as chamadas são em tempo de execução), mas é o ponto que
merece cuidado na Etapa B.

**Uma tela está migrada quando:** faz tudo que a antiga fazia, o arquivo dela
saiu do `public/` e do `index.html` antigo, e o domínio que ela usava virou
módulo em `src/nucleo/` com `export`.

**No fim:** `base` do Vite vira `"/"`, o `public/` inteiro é apagado, o
`npm run css` (que existe só para a tela antiga) some junto, e os links entre
as cascas deixam de existir porque só há uma.

## Regras

- **Um hex só no projeto**, em `estilo/tokens.css`. As duas telas leem os
  mesmos tokens: o React pelos utilitários do Tailwind, a antiga pelo
  `var(--accent)` do CSS à mão.
- **Nada de DOM, React ou fetch em `src/nucleo/`.** É o que deixa esse código
  rodar dentro de um Web Worker e ser testado sem navegador.
- **Ícone é referência entre aspas** (`"icones.svg#shapes"`), nunca string
  montada em pedaços: o gerador do sprite lê o código para saber o que incluir.
- **React e Vite são `devDependencies`.** Eles viram `dist/` no build e não são
  carregados pelo Node em execução — por isso não entram no instalador.
- **A rota mora no `#`.** Sem rota-curinga no Express, e recarregar a página em
  qualquer tela funciona. **O grupo do menu não entra no endereço**: a rota
  continua sendo só o nome da tela (`#/historico`), então mudar uma tela de
  grupo não quebra link guardado nem favorito.
- **Botão em `/app` precisa do reset de `#raiz`.** Sem o preflight do Tailwind,
  o navegador estiliza `<button>` como controle do sistema. O reset mínimo está
  em `estilo/entrada.css`, em `@layer base` e preso ao `#raiz`.

## A central das impressoras entrou já em React

A parte que acompanha as impressoras da produção não passou pela tela antiga:
ela nasceu direto em `/app`, nas cinco telas de `src/telas/` (Impressoras,
Histórico, Ordens de Serviço, Máquinas e WhatsApp). Não havia motivo para
escrevê-la em `public/` — seria escrever, no mesmo mês, código para a pasta que
este documento diz que vai ser apagada.

Isso muda uma coisa no desenho: `/app` deixou de ser só o destino da migração e
passou a ter função própria. Quem quer acompanhar impressora abre `/app` hoje.

Duas peças novas apareceram por causa dela:

- **`src/impressoras/`** — o que as cinco telas dividem: os tipos das respostas
  do servidor, a formatação de metragem/tempo/tinta e o cliente do socket. Não
  é `nucleo/`: `nucleo/` é domínio puro que roda em worker, e isto conversa com
  o servidor.
- **socket.io** — as impressoras são a única parte do Optimize que muda
  sozinha. Moldes e projetos só mudam quando alguém mexe; uma impressão começa
  e termina sem ninguém tocar na tela. Há **uma** conexão para o app inteiro
  (`src/impressoras/socket.ts`), e cada tela diz que eventos lhe interessam.

E uma regra que veio junto: **falha de socket não derruba a tela**. É a mesma
que já valia para a memória do Encaixe — sem o servidor de eventos, tudo
continua funcionando, a tela só deixa de se atualizar sozinha.

## O que já está de pé

- Vite + React + TypeScript (`strict`, com `noUncheckedIndexedAccess`).
- A casca inteira em React: menu lateral em três grupos (Produção, Impressão,
  Relatórios), com gaveta no celular, cabeçalho com selo por aba, relógio e
  rota por `#`.
- `api/cliente.ts` e `api/useDados.ts` — toda chamada num lugar só, com erro do
  servidor virando mensagem na tela.
- `casca/Cartao.tsx` — a caixa padrão das telas.
- Tela de Projetos lendo a estante de clientes da API de verdade.
- `nucleo/geometria.ts` portado, como referência da receita.
- Servidor e empacotador servindo e levando as duas telas.
- A central das impressoras inteira, em React: painel, histórico, pedidos,
  varredura da rede e o bot do WhatsApp.
- **Vetor**, **Imagem** e **Macros** migradas (Etapa A), com o domínio delas em
  `src/nucleo/`: `vetor.js`, `vetorWorker.js`, `imagemWorker.js`,
  `diagnosticoDaImagem.js`, `encaixeMascara.js` e `medidaDoArquivo.js`.
- `src/casca/numero.ts` e `src/casca/arquivoDeImagem.ts` — os auxiliares que
  moravam pendurados no `window` do `ui.js`.

## Dívidas conhecidas

- **As fontes vêm do Google.** `fonts.googleapis.com` no `<head>` das duas
  telas. O programa instalado roda sem internet, então hoje ele cai para a
  fonte do sistema quando está offline. As fontes precisam ir para `estatico/`.
- **`npm run css` existe só para a tela antiga.** Some com ela.
- **A tela de Cor não pode migrar antes do Encaixe.** É a última que ainda
  aparece no menu novo como link para a casca antiga, e o motivo é a entrega de
  arquivos descrita acima.
- **A varredura da rede é do Windows.** `nbtstat`, `net view` e `ping -a` são
  chamados como processo. É onde o sistema roda, e o UNC do resto do módulo já
  seria de todo jeito específico do Windows — mas está escrito aqui para não
  ser descoberto no dia em que alguém tentar rodar isto em outro sistema.
- **O leitor de SVG do `moldes.js` precisa do DOM de verdade** (mede texto e
  caminho no documento). Quando ele for para o núcleo, vai marcado: roda na
  thread principal, não em worker.
