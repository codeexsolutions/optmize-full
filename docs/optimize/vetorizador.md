# O Vetorizar — o motor próprio, medido

A tela **Vetorizar** (`src/telas/Vetorizar.tsx`) recebe uma imagem que já é
arte — logo, estampa, arquivo de cliente em PNG ou JPG — e devolve o vetor em
SVG ou PDF. Quem vetoriza é o motor próprio, `src/motores/vetorizador/`, num
Web Worker. Não depende de serviço de fora: roda inteiro no computador.

## Como o motor trabalha

| Passo | Arquivo | O que faz |
|---|---|---|
| Paleta | `paleta.js` | As cores de verdade da arte, em OKLab, tiradas só do miolo das manchas (a borda antisserrilhada não vota). A quantidade é automática: o grupo que mais se espalha é dividido até tudo caber na tolerância. Uma cor pequena e distinta (o anel fino) conta pela cauda; um rastro de ruído colado na cor principal (o JPEG) não. |
| Regiões | `regioes.js` | Cada pixel na cor mais próxima; a franja grudada (o pixel da divisa que pegou a cor de uma terceira região) volta para um dos lados pela mistura de cor; cisco e franja fina são absorvidos pela vizinha. |
| Mapa | `mapa.js` | O mapa planar: cada divisa entre duas regiões, uma vez só. As duas vizinhas usam a mesma curva, e não sobra fresta. |
| Curvas | `curvas.js` | A borda no subpixel (pela cobertura do antisserrilhado), as quinas pela interseção das retas, as retas compridas (sem cara de arco), as Bézier entre elas com tangente contínua, e o laço que é elipse saindo em quatro arcos exatos. |
| Montagem | `montar.js` | Os anéis de cada região, o empilhamento (o furo coberto não é recortado), a costura que esconde o fio claro da tela, o SVG. |
| PDF | `pdf.js` | O mesmo desenho, em pontos, com preenchimento par-ímpar (`f*`), a regra do SVG. |

**A borda borrada.** O motor mede quantos pixels a imagem leva para ir de uma
cor à outra (`larguraDaBorda`, pela luminância — o JPEG guarda a cor na
metade da resolução e toda borda de cor pareceria borrada). Na arte nítida a
medida fica perto de 1 e nada muda; no logo borrado da internet ela dá 2 a
2,5, e a franja, o ruído da posição da borda, a janela das quinas e o
tamanho do cisco passam a valer nessa escala.

## A IA

A IA é a rede de ampliação que o programa já tem (Real-ESRGAN `x4v3`, a do
Extrator, no servidor local). A imagem é ampliada 4× **antes** de traçar, e o
vetor volta ao tamanho original. Ela não é ligada às cegas, porque a medição
mostrou onde ela ajuda e onde atrapalha:

| Imagem | Sem IA | Com IA |
|---|---|---|
| Selo de 100 px, JPEG 60 | 91,32% (perde o anel amarelo) | **98,53%** (4 cores) |
| Letras de 100 px, JPEG 60 | 96,27% (perde uma cor) | **99,20%** |
| Formas de 100 px, JPEG 60 | 99,27% | 99,20% |
| Selo de 200 px, JPEG 70 | 99,50% | 99,31% |
| Logo borrado (100 px esticado a 400), com a IA | — | pior: a rede inventa halo e faceta |

Por isso a tela liga a IA **sozinha** só na imagem de até 256 px que não é
borrada (a medida da borda abaixo de 1,6), deixa ligar à mão até 512 px, e
acima disso a esconde. Na imagem borrada, quem resolve é o próprio motor.

## Os números

`npm run bancada:vetorizador` rasteriza cada desenho original (SVG feito na
bancada), estraga como um cliente estragaria (JPEG, imagem pequena, borrada) e
compara o vetor com o **desenho**, não com os pixels: "certos" é a fração de
pixels a menos de 0,08 em OKLab do verdadeiro, no dobro do tamanho. O "antes"
é o `vetor.js` do Extrator, com o número certo de cores, para ser justo.

Rodada de 2026-11-12, com a rede de ampliar instalada (22 casos):

| | Motor novo | `vetor.js` |
|---|---|---|
| Pixels certos (média) | **98,85%** | 94,96% |
| Erro médio (OKLab) | **0,0057** | 0,0161 |
| Nós (média) | **91** | 443 |

Alguns casos, para ter ideia:

| Caso | Novo | `vetor.js` |
|---|---|---|
| Selo com JPEG 55 | 99,79%, 93 nós | 89,58%, 609 nós |
| Selo de 200 px, JPEG 70 | 99,50%, 83 nós | 89,41%, 1.672 nós |
| Selo borrado | 98,19%, 80 nós | 87,30%, 304 nós |
| Letras, PNG limpo | 99,77%, 100 nós | 99,45%, 81 nós |

O tempo: logo de 2000 × 2000 px em 1,3 a 1,5 s; os casos de 400 px em menos
de 0,1 s. O CI roda a mesma bancada sem a rede (o caminho da IA usa Lanczos)
e falha se algum caso ficar abaixo de 97% — menos o minúsculo sem a IA, que é
justamente o caso que a IA existe para resolver — ou se faltar cor.

`npm run bancada:vetorizar-tela` abre a tela de verdade num Chromium sem
janela: escolhe o arquivo, espera o vetor, confere que a IA liga sozinha na
imagem pequena e que o vetor dela sai no tamanho original, e baixa o PDF
pelo botão para desenhá-lo com o pdf.js contra o SVG (100% dos pixels iguais
na rodada acima). Com `--ia`, ela sobe a rota do Extrator num servidor de
teste próprio (o servidor do programa exige a conta logada, e a bancada não
mexe em sessão).

## O que ele não faz

- **Foto não é o alvo.** Foto vira pôster de poucas cores (6, numa imagem de
  teste com degradê e ruído). O motor é para arte chapada.
- **Degradê vira faixas.** Não há malha de gradiente.
- **Sem traço (stroke).** Linha fina sai como forma preenchida — certo para
  impressão e para recorte, mas não editável como linha.
- A tela não tem trava de plano: está aberta a todos (o campo `escopo` da
  rota em `src/rotas.ts` muda isso).
