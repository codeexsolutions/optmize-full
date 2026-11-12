# A rede da Vetora

A Vetora (a tela de vetorizar) entrega **três vetores** para cada imagem — o
**Fiel**, o **Equilibrado** e o **Limpo** — e quem escolhe os ajustes de cada
um é uma rede neural própria, treinada aqui, que roda dentro do programa
(no worker do vetorizador, sem servidor e sem internet).

## O que a rede faz

O vetorizador tem ajustes (detalhe, suavidade, e passar ou não pela IA de
ampliação antes). O melhor ajuste muda de imagem para imagem: o logo limpo
quer detalhe máximo; o JPEG pequeno quer a IA; o borrado quer menos detalhe.
A rede olha a imagem e **prevê o resultado de cada ajuste** — quanto ele vai
acertar e quantos nós vai ter — sem precisar vetorizar. Com as previsões:

| Modelo | O que busca |
|---|---|
| **Fiel** | o ajuste que mais acerta a imagem |
| **Equilibrado** | o mais fiel que não fica mais pesado que o padrão de antes (λ medido na validação) — e no gosto de quem usa |
| **Limpo** | o de menos nós dentro de uma folga de fidelidade (medida na validação) |

Os três vetorizam ao mesmo tempo, cada um num worker, e aparecem embaixo do
visor. O visor compara o original com o vetor com zoom até 64× e mostra os
nós (as âncoras e as alças das curvas).

### O que ela olha

`src/motores/vetorizador/rede/caracteristicas.js` — 21 números tirados das
primeiras etapas do próprio vetorizador: o tamanho e a proporção, quanto da
imagem é liso, quantas cores ela tem com pouca, média e muita tolerância, a
largura da borda (nítida ou borrada), as regiões e os ciscos, a densidade de
divisas, o ruído no liso, os blocos do JPEG, as distâncias entre as cores da
paleta, o peso da maior e da menor cor. A mesma função roda no treino e no
programa; a lista tem versão, e pesos de outra versão não são usados.

### A rede

`src/motores/vetorizador/rede/rede.js` — perceptron (21 características + o
ajuste → 64 → 64 → 3, ativação SiLU), em comitê: várias redes treinadas com
sementes diferentes e a previsão é a média delas. As saídas são relativas à
média dos ajustes da mesma imagem (a rede não precisa saber quão difícil a
imagem é, só o que cada ajuste muda nela). Os pesos (`pesos.json`) vão no
worker, em base64 de Float32.

## Como ela é treinada

Tudo em `bancada/vetora/`, em JavaScript puro (sem Python, sem GPU):

1. **Os logos** (`logos.mjs`) — milhares de logos sintéticos, cada semente
   um diferente: emblemas, carimbos, nomes em dez fontes, ícone com nome,
   estampas, abstratos; fundos branco, claro, escuro, colorido e
   transparente; de 2 a 7 cores em esquemas de marca. O SVG é a verdade.
2. **O estrago** (`imagem.mjs`) — cada logo vira a imagem que um cliente
   mandaria: de 64 a 900 px, JPEG de 30 a 95, borrado (pequeno e esticado),
   PNG limpo.
3. **O oráculo** (`oraculo.mjs`) — para cada imagem, o vetorizador roda com
   28 ajustes (detalhe × suavidade) e, nas pequenas, com 6 ajustes passando
   pela IA de ampliação (Real-ESRGAN); cada vetor ganha a nota contra a
   verdade (pixels certos em OKLab, como `bancada/conferir-vetorizador.mjs`).
   Roda em processos paralelos e retoma de onde parou.
4. **O treino** (`treinar.mjs`) — 80% das imagens treinam, 10% validam
   (parada antecipada, o λ do Equilibrado e a folga do Limpo) e 10% testam
   (a nota final, em imagens que a rede nunca viu). Adam com taxa em
   cosseno; os membros do comitê treinam em paralelo. A avaliação usa o
   código do programa (`rede.js`, `escolher.js`), não uma cópia.

```
node bancada/vetora/oraculo.mjs --de 0 --ate 6000          # ~80 min em 9 núcleos
node bancada/vetora/treinar.mjs --membros 5                  # alguns minutos
```

Para treinar mais: mais sementes no oráculo (`--de 6000 --ate 12000`, no
mesmo arquivo) e treinar de novo. Os dados (`bancada/vetora/dados/`) ficam
fora do git: o oráculo os refaz quando quiser.

## Como ela melhora com o uso

- **O gosto de quem usa** (`src/telas/vetora/gosto.ts`): cada vetor levado
  embora (SVG, PDF ou cópia) anota qual modelo foi escolhido. O λ do
  Equilibrado anda um passo na direção da escolha — quem sempre leva o Fiel
  passa a ver um Equilibrado mais fiel; quem leva o Limpo, um mais limpo — já
  na próxima imagem. Só números: a imagem não é guardada.
- **O próximo treino** aproveita o histórico: `treinar.mjs --escolhas
  arquivo.json` (o conteúdo de `localStorage["vetora:escolhas"]`) faz a rede
  nova nascer com o gosto de quem já usou.
- **Mais dados**: o oráculo é infinito (cada semente é um logo novo); mais
  sementes, mais treino.

O que ainda não existe: juntar as escolhas de todos os clientes num treino
só. Isso pede mandar o histórico (só números) para a conta na nuvem — uma
decisão de privacidade e de servidor, que fica para depois.

## Os números

Rede final (2026-11-12): perceptron 128→64, comitê de 5, escolhida pela
validação entre 64→64, 128→64 e 32→32. Treinada em **2.425 logos** (o oráculo
de 6.000 parou por falta de memória da máquina; retoma de onde parou).

| No teste (244 logos que a rede nunca viu) | Pixels errados | Nós |
|---|---|---|
| Ajuste padrão de antes | 1,93% | 48 |
| **Fiel** da rede | **1,67%** (fecha 52% da distância até o melhor possível, 1,43%) | — |
| **Equilibrado** (λ 0,6) | 1,89% | 52 |
| **Limpo** (folga 2) | 2,23% | 39 (o "mais simples" fixo: 2,33% com os mesmos 39) |

A curva de aprendizado (validação, quanto da distância o Fiel fecha): 35% com
25% dos dados, 33% com 50%, 57% com 100% — mais dados ainda ajudam.

Nos casos desenhados à mão da bancada (sem IA, 18 casos): padrão 99,30%,
Fiel 99,38%, Equilibrado 99,34%, Limpo 98,81% de pixels certos.

Atenção: o motor melhorou depois do oráculo (o traço fino sem miolo, o
detalhe pequeno, a franja na imagem da IA); a próxima rodada do oráculo já
mede o motor novo, e o treino seguinte se ajusta a ele.
