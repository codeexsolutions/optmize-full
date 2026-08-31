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
| **Domínio puro** (zero DOM) | 4.407 | `encaixe-motor`, `vetor`, `nfp`, `encaixe-mascara`, `encaixe-wasm`, `geometria`, `encaixe-giro` e os 3 workers |
| **Domínio com uma ponta no navegador** | 2.905 | `moldes` (o DXF e o PLT são puros; o leitor de SVG mede no DOM de verdade), `encaixe-paralelo`, `encaixe-prepara`, `arte-molde` |
| **Tela** | 5.135 | `encaixe`, `moldes-tela`, `projetos`, `vetor-tela`, `ui`, `interface` |

**7.312 linhas — quase 60% do front — não têm nada a ver com React.** São as
contas de encaixe, os leitores de DXF/PLT/SVG/PDF, a vetorização e o polígono
de não-encaixe. Esse código é o produto; a tela é a moldura dele.

Daí a regra que manda em tudo o resto:

> **Domínio se porta, não se reescreve.** Portar é acrescentar `export` e
> tipos, e tirar a dependência do escopo global. Se uma conta mudou de
> resultado, o porte está errado.

`src/nucleo/geometria.ts` já está portado e serve de referência da receita.

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

**A ordem, do mais fácil para o mais arriscado:**

1. **Projetos** (574 linhas de tela) — CRUD contra a API, sem geometria e sem
   canvas. É a tela que prova o padrão. *A estante de clientes já está em pé.*
2. **Moldes** (1.385) — formulário de vários passos e upload de arquivo. O
   `moldes.js` (2.017) vai junto para `nucleo/moldes/`, portado.
3. **Vetor** (508 de tela) — canvas e worker. O `vetor.js` (1.196) é puro e vai
   inteiro para o núcleo sem uma linha alterada.
4. **Encaixe** (2.429) — por último, porque é a maior e a que mais tem estado:
   pool de workers, wasm, desenho em canvas e o PDF. O motor (1.357 + 812 do
   NFP) é puro e não se toca.

**Uma tela está migrada quando:** faz tudo que a antiga fazia, o arquivo dela
saiu do `public/` e do `index.html` antigo, e o domínio que ela usava virou
módulo em `src/nucleo/` com `export`.

**No fim:** `base` do Vite vira `"/"`, o `public/` inteiro é apagado, e o
`npm run css` (que existe só para a tela antiga) some junto.

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
  qualquer tela funciona.

## O que já está de pé

- Vite + React + TypeScript (`strict`, com `noUncheckedIndexedAccess`).
- A casca inteira em React: menu lateral (com gaveta no celular), cabeçalho com
  selo por aba, relógio, rota por `#`.
- `api/cliente.ts` e `api/useDados.ts` — toda chamada num lugar só, com erro do
  servidor virando mensagem na tela.
- `casca/Cartao.tsx` — a caixa padrão das telas.
- Tela de Projetos lendo a estante de clientes da API de verdade.
- `nucleo/geometria.ts` portado, como referência da receita.
- Servidor e empacotador servindo e levando as duas telas.

## Dívidas conhecidas

- **As fontes vêm do Google.** `fonts.googleapis.com` no `<head>` das duas
  telas. O programa instalado roda sem internet, então hoje ele cai para a
  fonte do sistema quando está offline. As fontes precisam ir para `estatico/`.
- **`npm run css` existe só para a tela antiga.** Some com ela.
- **O leitor de SVG do `moldes.js` precisa do DOM de verdade** (mede texto e
  caminho no documento). Quando ele for para o núcleo, vai marcado: roda na
  thread principal, não em worker.
