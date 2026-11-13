# A Vetora — o motor próprio, medido

A tela **Vetora** (rota `vetorizar`, `src/telas/Vetorizar.tsx` +
`src/telas/vetora/`) recebe uma imagem que já é arte — logo, estampa, arquivo
de cliente em PNG ou JPG — e devolve **três vetores** para escolher (Fiel,
Equilibrado e Limpo), em SVG ou PDF. Quem escolhe os ajustes de cada um é a
rede neural própria (ver [vetora-rede.md](vetora-rede.md)); quem vetoriza é o
motor próprio, `src/motores/vetorizador/`, em Web Workers. Não depende de
serviço de fora: roda inteiro no computador.

## Como o motor trabalha

| Passo | Arquivo | O que faz |
|---|---|---|
| Paleta | `paleta.js` | As cores de verdade da arte, em OKLab, tiradas do miolo das manchas (a borda antisserrilhada não vota). A quantidade é automática: o grupo que mais se espalha é dividido até tudo caber na tolerância. Uma cor pequena e distinta (o anel fino) conta pela cauda; um rastro de ruído colado na cor principal (o JPEG) não. Duas cores pequenas e bem distintas (o texto fino em duas cores, num JPEG grande) se separam mesmo abaixo do peso mínimo. E a cor que NÃO tem miolo — a letra de 2 px — sai dos núcleos dos traços: o pixel que a paleta não explica (nem como cor, nem como mistura de duas), mais longe dela que os vizinhos e com a mesma cor dos dois lados (o "sanduíche"); vira cor nova só se ficar a 0,18 de toda cor da paleta. |
| Regiões | `regioes.js` | Cada pixel na cor mais próxima; a franja grudada (o pixel da divisa que pegou a cor de uma terceira região) volta para um dos lados pela mistura de cor; cisco e franja fina são absorvidos pela vizinha — menos o detalhe pequeno de verdade (o acento, o pingo do "i", o ponto): ilha compacta, de cor bem diferente da que a cerca, de 6 px para cima. |
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

Hoje quem decide é a **rede da Vetora**, modelo a modelo: na imagem de até
512 px, com a rede de ampliar instalada, os ajustes "com a IA" entram entre
os candidatos, e a rede usa a IA onde prevê que ela ajuda (no teste, o
modelo Fiel a usou em 38% das imagens que podiam). Na imagem borrada, quem
resolve é o próprio motor. E as cores dos traços finos (ver a paleta acima)
fizeram o minúsculo sem IA chegar perto do com IA: o selo de 100 px foi a
98,74% e as letras a 98,83%, sem passar pela rede de ampliar.

Na imagem ampliada pela IA, a franja é medida pela borda dela (a rede
entrega a borda nítida), e não pelo fator da ampliação — senão o acento e o
pingo do "i" eram tomados por franja e sumiam do vetor.

## Os números

`npm run bancada:vetorizador` rasteriza cada desenho original (SVG feito na
bancada), estraga como um cliente estragaria (JPEG, imagem pequena, borrada) e
compara o vetor com o **desenho**, não com os pixels: "certos" é a fração de
pixels a menos de 0,08 em OKLab do verdadeiro, no dobro do tamanho. O "antes"
é o `vetor.js` do Extrator, com o número certo de cores, para ser justo.

Rodada de 2026-11-12, com a rede de ampliar instalada (24 casos, com o texto
fino em três cores):

| | Motor novo | `vetor.js` |
|---|---|---|
| Pixels certos (média) | **99,28%** | 95,27% |
| Erro médio (OKLab) | **0,0046** | 0,0153 |
| Nós (média) | **172** | 681 |

(Os nós médios subiram com o caso do texto fino: são centenas de letras com
acento; o `vetor.js` faz 6.598 nós no mesmo texto.)

Alguns casos, para ter ideia:

| Caso | Novo | `vetor.js` |
|---|---|---|
| Selo com JPEG 55 | 99,79%, 93 nós | 89,58%, 609 nós |
| Selo de 200 px, JPEG 70 | 99,50%, 83 nós | 89,41%, 1.672 nós |
| Selo borrado | 98,19%, 80 nós | 87,30%, 304 nós |
| Letras, PNG limpo | 99,77%, 100 nós | 99,45%, 81 nós |
| Texto fino em três cores, 1000 px, JPEG 80 | 99,20%, as 4 cores | 98,61%, 6.598 nós |

O tempo: logo de 2000 × 2000 px em 1,3 a 1,5 s; os casos de 400 px em menos
de 0,1 s. O CI roda a mesma bancada sem a rede de ampliar (o caminho da IA
usa Lanczos) e falha se algum caso ficar abaixo de 97% — o motor e o modelo
Fiel da rede —, se faltar cor, ou se os três modelos da rede saírem iguais.

`npm run bancada:vetorizar-tela` abre a tela de verdade num Chromium sem
janela: escolhe o arquivo, espera os três modelos ficarem prontos, aproxima
o visor e liga os nós, troca de modelo, e baixa o PDF pelo botão para
desenhá-lo com o pdf.js contra o SVG do modelo escolhido (100% dos pixels
iguais). Com `--ia`, ela sobe a rota do Extrator num servidor de teste
próprio (o servidor do programa exige a conta logada, e a bancada não mexe
em sessão).

## O que ele não faz

- **Foto não é o alvo.** Foto vira pôster de poucas cores (6, numa imagem de
  teste com degradê e ruído). O motor é para arte chapada.
- **Degradê vira faixas.** Não há malha de gradiente.
- **Sem traço (stroke).** Linha fina sai como forma preenchida — certo para
  impressão e para recorte, mas não editável como linha.
- A tela não tem trava de plano: está aberta a todos (o campo `escopo` da
  rota em `src/rotas.ts` muda isso).
