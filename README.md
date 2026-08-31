# Optimize

Sistema web local para preparar o que vai para a máquina: biblioteca de moldes,
encaixe das peças no tecido e vetorização de imagem, tudo salvo em um banco
SQLite local. Backend em Node.js (Express + better-sqlite3), frontend em
HTML/CSS/JS puro — sem dependências externas de conta ou nuvem.

A interface é âmbar sobre preto, num tema só. Toda cor sai dos tokens de
`public/interface.css`: nenhum outro arquivo deve escrever um hex direto.

## Importante antes de usar

- **Este sistema roda na sua própria máquina.** Não há servidor externo,
  login nem nuvem: o banco é o arquivo `dados.db` e as imagens ficam em
  `uploads/`, na pasta do projeto.
- Faça cópia de `dados.db` e de `uploads/` de vez em quando: é ali que estão
  os moldes, as estampas e os projetos.

## Pré-requisitos

- [Node.js](https://nodejs.org/) versão 24 ou superior (a linha LTS atual)
  instalada — só para rodar a partir do código. O programa instalado não precisa de nada: o Node
  vai dentro dele (ver [Gerando o instalável](#gerando-o-instalável-windows)).

## Instalação

```bash
cd optimize
npm install
```

## Rodando

```bash
npm start
```

Abra **http://localhost:8000** no navegador. A tela tem quatro áreas: **Moldes**,
**Projetos**, **Encaixe** e **Vetor**.

Não há login nem identificação: quem abre o painel entra direto na tela de
Moldes.

O texto que explica o porquê de cada coisa fica recolhido atrás de um
**"?"** em cada cartão. Abre com um clique e continua aberto enquanto a aba
estiver aberta — quem já sabe não precisa passar por cima dele toda vez.

No resultado do Encaixe, o painel informa a largura total do tecido, a largura
realmente ocupada pelas peças e a sobra lateral. A sobra aparece separada entre
lado esquerdo e direito, com uma referência adicional de quanto ficaria em cada
lado se o conjunto fosse centralizado.

## Organização do projeto

> **O front está no meio de uma mudança de arquitetura para React.** As duas
> telas rodam ao mesmo tempo — a antiga em `/`, a nova em `/app` — e a
> migração acontece uma tela por vez. O desenho completo, com a ordem das
> telas e as regras, está em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).
>
> Para desenvolver a tela nova são dois terminais: `npm start` (o servidor,
> na 8000) e `npm run dev:app` (o Vite, na 5173, que abre em
> `localhost:5173/app/` e manda `/api` para o servidor). A tela antiga
> continua precisando só do `npm start`.

A paleta, a tipografia e a responsividade ficam em `public/interface.css`,
enquanto `public/interface.js` cuida somente do menu e do relógio. As regras de
moldes, encaixe e vetor continuam isoladas da interface. Veja a divisão completa
em [`docs/ESTRUTURA.md`](docs/ESTRUTURA.md).

### Tailwind

As telas novas são escritas em utilitários do Tailwind, direto no HTML.
`estilo/entrada.css` é a folha de entrada e `npm run css` gera
`public/tailwind.css` (`npm run css:dev` fica olhando os arquivos e
regerando; `npm start` e `npm run build:app` já geram sozinhos). Duas regras
seguram a mistura com o CSS antigo:

- **A paleta não muda de dono.** Todo token do Tailwind (`bg-topo`,
  `text-ambar`, `border-linha`) aponta para a variável correspondente do
  `interface.css`. Mexer no âmbar continua sendo mexer em um hex só.
- **O preflight fica de fora, e utilitário não divide elemento com CSS antigo.**
  O reset do Tailwind apagaria a interface inteira que já está escrita à mão; e
  como o CSS das duas folhas antigas está fora de camada, ele venceria o
  utilitário calado. Então a tela que migra para o Tailwind perde as regras
  antigas dela — foi o que aconteceu com `.topbar`, que virou o `<header>`
  do topo e não tem mais nenhuma linha de CSS própria.

### Ícones

São os do [Lucide](https://lucide.dev), e ficam num sprite próprio para o app
instalado não depender de internet:

```html
<svg class="size-5" viewBox="0 0 24 24" aria-hidden="true"><use href="icones.svg#scissors" /></svg>
```

`npm run icones` varre o HTML e o JS atrás de `icones.svg#nome` e gera
`public/icones.svg` com **exatamente** os ícones encontrados — hoje 6, 1,8 KB,
contra mais de 1 MB da biblioteca inteira. Não existe lista para manter: usou,
entra; parou de usar, sai. Nome que não existe no Lucide para o build com o
erro apontando o nome errado.

Duas consequências de usar sprite: a cor vem de `currentColor` (quem manda é o
`color` do elemento em volta) e a espessura do traço é fixa em 1.8 para todos,
decidida no `empacotar/icones.js` — um `<use>` não consegue trocar isso por
fora, porque o atributo do símbolo ganha do valor herdado.

### Aba Moldes

A estante de moldes da produção. O molde é desenhado fora daqui — CorelDRAW,
Audaces, Illustrator, o que a pessoa usar — e mandado para cá em **DXF**,
**PLT**, **SVG** ou **PDF vetorial**, que são os formatos que trazem o contorno
de verdade. O que fica guardado é o **contorno em centímetros**, não uma figura:
por isso o molde volta na medida certa toda vez, vai para o encaixe e sai em PDF
sem depender de resolução.

Criar um molde é um passo a passo, no botão **Adicionar novo**:

1. **O que você vai criar?** — camisa, regata, short, banner ou outra coisa. Em
   "outra coisa", escreva o que é (avental, almofada, toalha...).
2. **Quantos pedaços tem?** — o número já vem preenchido pelo tipo escolhido
   (camisa vem com 5), junto com o nome do molde, os **tamanhos** e a unidade do
   desenho. Conte os pedaços diferentes: manga direita e esquerda contam duas; a
   mesma peça cortada duas vezes conta uma só, e a quantidade se escreve na
   frente. Nos tamanhos, escreva todos que o molde vai ter, separados por espaço
   ou vírgula ("P M G GG"). O campo **"Como ler o arquivo"** é o mesmo da aba
   Encaixe: *marcador* (cada peça fechada do arquivo é uma peça) ou *arte* (o
   arquivo inteiro é uma peça só) — está explicado lá embaixo, na aba Encaixe.
3. **Cada parte, com seu arquivo, tamanho por tamanho** — cada tamanho ganha a
   sua **aba**, e a aba mostra quanto já está pronto ("M 4/5"). Dentro da aba
   aparece um espaço por pedaço, já sugerindo o que costuma ser cada um (frente,
   costas, manga direita, manga esquerda, gola). Em cada espaço você confirma o
   que é aquela parte, quantas saem por peça pronta, e manda o arquivo **daquele
   tamanho** — o molde do P não é o do G, e cada um fica guardado no seu lugar. A
   miniatura do contorno aparece ao lado com a medida lida do arquivo.

   Dá para acrescentar tamanho ali mesmo, no campo ao lado das abas: o tamanho
   novo nasce com os mesmos papéis e quantidades do primeiro, só sem arquivo.
   O **×** da aba tira um tamanho (se já tiver arquivo, ele pergunta antes). Uma
   linha embaixo das abas diz onde ainda falta arquivo, e o molde é salvo com
   todos os tamanhos de uma vez.

Detalhes que evitam retrabalho:

- Se o arquivo enviado for o **marcador inteiro** (várias peças fechadas num
  arquivo só), o sistema usa todas: a primeira fica naquele espaço e as demais
  caem nos espaços seguintes que ainda estão vazios, criando mais espaços se
  faltar. O aviso diz quantas peças vieram. Nesse caso quem manda nos nomes é o
  desenho, inclusive no espaço onde você clicou — com um arquivo de peça só, o
  que você escolheu na tela continua valendo.
- O **nome que veio no desenho** é usado para adivinhar o que é a peça
  ("COSTAS 20x" → costas) e para ler a quantidade ("40x" → 40). Mas o que você
  escolheu na tela sempre manda mais que o nome do arquivo.
- O **tamanho** fica em cada peça, e é a aba que diz de qual tamanho é o arquivo
  que está entrando. Um molde guarda P, M e G juntos, e a lista mostra as
  etiquetas de todos.
- Uma parte sem arquivo não é salva; o aviso diz quantos espaços ficaram vazios.

Na lista de moldes guardados, cada linha tem três botões:

- **Encaixar** — abre a tela de arte e encaixe, explicada logo abaixo. As peças
  são **acrescentadas** às que já estiverem na aba Encaixe, então dá para
  encaixar dois moldes no mesmo tecido.
- **Editar** — reabre o molde direto no passo 3, com as partes preenchidas.
  Regravar troca as peças por inteiro, sem deixar sobra.
- **Excluir** — pede confirmação e apaga o molde com as peças dele.

#### Colocar a arte no molde, ver a prévia e mandar para o encaixe

O botão **Encaixar**, na linha do molde, abre "Arte e encaixe". Ali você escolhe
o tamanho, quantas peças prontas vai fazer, e manda **a arte de cada parte** —
o retângulo que saiu do seu programa de desenho, em PNG, JPG ou WEBP.

O sistema mede a peça em centímetros, encaixa a arte nessa medida e **recorta
pelo contorno do molde**: o que passa da linha da peça é cortado, e fora do
contorno fica transparente (é assim que o encaixe reconhece a silhueta de
verdade e o PDF sai sem moldura branca em volta).

A arte é guardada **pelo que a parte é** — frente, costas, manga direita... — e
não pela peça de um tamanho. Por isso a mesma arte serve para o molde inteiro:
trocando o tamanho ali em cima, o contorno muda e a arte se ajusta sozinha ao
contorno novo, sem mandar nada de novo. Fechar e reabrir o mesmo molde também
não perde as artes; trocar de molde limpa.

Ao mandar a arte, os dois botões dizem **o que ela é**, e isso muda tudo o que
vem depois:

- **Só a arte** — um desenho que entra **uma vez** na peça: um escudo no peito,
  uma foto, um letreiro. Ele se ajusta ao tamanho da peça, e é por isso que a
  mesma arte serve para o P e para o G.
- **Rapport** — um azulejo. Ele **não** se ajusta a nada: sai no tamanho de
  verdade dele e se repete, encostado nas quatro direções, até tapar a peça
  inteira.

A diferença não é enfeite. Esticar um rapport para caber na peça estragaria a
estampa duas vezes: o desenho sairia de escala (um avião de 6 cm viraria um
avião de 9 cm) e a emenda não fecharia com a próxima peça na hora de costurar.
Por isso o rapport ignora "como entra" e vai pelo tamanho real.

**De onde sai o tamanho real.** Do dpi gravado no próprio arquivo — é a única
fonte confiável, porque o número de pixels sozinho não diz nada. Uma arte de
1260 × 1260 px salva a 50 pixels por centímetro é um azulejo de **25,2 × 25,2
cm**, e é essa medida que a tela mostra ao lado do nome do arquivo. Quando o
arquivo não traz a resolução, o sistema usa 300 dpi e **avisa na tela** que
supôs — aí é conferir a medida e corrigir no "Tamanho %", ou salvar o arquivo
com o dpi certo, que é o melhor caminho.

Cada parte tem a prévia ao lado dos ajustes:

- **Como entra** (só para arte) — *cobrir a peça inteira* (a arte cresce até
  tapar tudo e o excesso é cortado), *caber por dentro* (a arte inteira aparece,
  sobrando peça em volta) ou *esticar até as bordas* (força a medida exata da
  peça, deformando o desenho). No rapport esse campo some, porque não há o que
  ajustar.
- **Tamanho %** — na arte, aumenta ou diminui a partir do que o modo decidiu.
  No rapport, 100% é o tamanho de verdade do azulejo; mexer aqui é pedir a
  estampa maior ou menor **de propósito**.
- **Girar** — 90°, 180° ou 270°. Serve para arte deitada em peça em pé, como
  acontece com manga; no rapport, gira o ladrilho inteiro.
- **Esquerda / direita** e **cima / baixo** — em centímetros. Na arte, contados
  do centro da peça, e o botão **Centralizar** volta os dois para zero. No
  rapport eles dizem **onde a repetição começa**, que é como se resolve "a
  emenda caiu bem no meio do peito"; ali o botão vira **Voltar ao começo**.

> **Formato do arquivo.** O rapport entra em PNG ou JPG, como o resto das
> artes. TIFF ainda não abre — quem trabalha com o arquivo-mestre em `.tif`
> precisa exportar uma cópia em PNG (o dpi vai junto e o sistema lê).

**Qualidade da arte** é o dpi com que a peça é montada; 150 dpi é o padrão de
sublimação. Peça muito grande em dpi alto vira imagem gigante, então há um teto
de pontos por peça: quando o dpi pedido passa do teto, ele cai e o rodapé avisa
qual foi o dpi usado de verdade. O tamanho em centímetros nunca muda.

Parte sem arte não trava nada: vai para o encaixe só como contorno.

No fim, **Mandar para o encaixe** monta as artes no tamanho de impressão (é a
parte demorada — o botão avisa "Montando a arte…") e joga tudo na aba Encaixe,
com as quantidades já multiplicadas pelas peças prontas. Na tabela de peças, a
coluna de origem mostra de qual molde, de qual tamanho, qual parte e qual
arquivo de arte veio cada peça.

**Estampas guardadas no molde.** O jogo de artes de um molde — a arte da
frente, a das costas, a da manga, cada uma com o ajuste que você deu — é uma
**estampa**, e ela fica guardada junto com o molde. Escreva o nome ("caveira",
"flor", "time 2025") e clique em **Salvar no molde**: a imagem vai para
`uploads/artes-molde` e o molde passa a lembrar dela.

Guardar a estampa é o que deixa **mandar mais de uma arte no mesmo encaixe**.
Na lista "Estampas guardadas neste molde", cada uma tem o seu campo de *peças
prontas*: ponha 12 na caveira e 8 na flor, aperte **Mandar para o encaixe**, e
as duas vão para o mesmo tecido, cada peça marcada com a estampa dela
("frente · caveira", "costas · flor"). A estampa que estiver aberta para edição
usa a quantidade lá de cima; as que ficarem em zero não vão.

- **Abrir** traz a estampa de volta para o painel de baixo, com as imagens e os
  ajustes como estavam. Mexer em alguma coisa e clicar em "Salvar no molde"
  regrava a mesma estampa — não cria outra.
- **Começar outra estampa** limpa o painel para montar uma nova, sem mexer nas
  guardadas.
- **Excluir** apaga a estampa e as imagens dela do disco. Apagar o molde apaga
  todas as estampas dele junto.

Como a estampa é guardada por papel da peça, e não por tamanho, ela serve para
o molde inteiro: guarde uma vez e use no P, no M e no G.

### Aba Projetos

A estante do trabalho que **se repete**. A organização é a de uma gaveta:

```
Time Azul/
  Camisa 2026/        frente.png  costas.png  manga.png
  Bandeira grande/    bandeira.png
```

É outra coisa que a aba **Moldes**, e a diferença é o ponto todo. No molde
guarda-se a **geometria** da peça, porque a estampa vai ser aplicada nela
depois, em qualquer tamanho. Aqui a estampa **já está aplicada**: o que entra é
a arte final da camisa, da bandeira, do que for. Ela não precisa de mais nenhum
passo — vai direto para o encaixe.

1. **Cliente** — "Novo cliente" cria a pasta de fora. Ela guarda só o nome e uma
   observação: não é cadastro comercial, é onde os projetos dele ficam.
2. **Projeto** — dentro da pasta do cliente, "Novo projeto" cria a pasta do
   trabalho, com o nome que você usa para ele ("Camisa Time Azul 2026").
3. **Peças** — "Adicionar arte" manda a estampa já finalizada. A medida em
   centímetros vem do **dpi gravado no arquivo**; quando ele não traz, vale 300
   dpi e o número fica editável na linha — e o que você corrigir fica guardado,
   para não ter que descobrir de novo na próxima repetição. Cada arte diz também
   **quantas vão em uma unidade** (uma manga entra 2×).
4. **Ajustes do encaixe** — largura do tecido, folga, margem e giro ficam
   guardados **com o projeto**. É isso que faz a repetição ser um clique: não se
   redescobre o que já deu certo.
5. **Fundo** — a arte é guardada **como veio**, com o fundo que tinha: a
   biblioteca não é lugar de imagem recortada, porque um recorte errado não
   teria volta. O fundo em volta é apagado **na passagem para o Encaixe**, com o
   mesmo código de quando o arquivo é arrastado direto para lá. Sem isso a peça
   entraria como o retângulo inteiro e o encaixe reservaria espaço para a
   moldura branca. Na tabela do Encaixe dá para conferir: a coluna Contorno
   mostra quanto da caixa a peça ocupa de verdade (numa camiseta, ~64%).
6. **Repetir** — no rodapé, diga quantas unidades. A conta aparece na hora
   ("3 peças por unidade × 20 = 60 peças no encaixe") e "Salvar e mandar pro
   encaixe" preenche os campos do Encaixe com os ajustes do projeto e joga as
   peças lá dentro, já multiplicadas.

Apagar um cliente leva os projetos e as artes junto; apagar um projeto leva as
artes dele. As imagens saem do disco só depois que a gravação passa, e nunca uma
que outro projeto ainda esteja usando.

### Aba Encaixe

Monta o encaixe (risco) das peças no tecido, na mesma ideia do Audaces
Encaixe / eCut: você manda os moldes em DXF, PLT, SVG ou PDF (ou as artes em
PNG/JPG), diz a largura do rolo e o sistema posiciona tudo sozinho, calculando
quantos metros vão ser gastos.

1. **Tecido** — largura útil do rolo em centímetros, o **espaço entre peças em
   milímetros** (a folga da faca/tesoura) e a margem nas bordas. O comprimento
   é livre: o resultado diz quantos metros o encaixe consumiu.

   A folga é aplicada engordando cada peça pela metade dela, e esse engorde
   acontece na grade do encaixe — então é a grade que decide a precisão. Por
   isso ela acompanha a folga pedida: uma célula vale metade do pedido, e a
   folga sai exata. De 5 mm para cima é exata; abaixo disso a grade tem um piso
   (senão o encaixe fica lento demais) e a folga sai um pouco maior — **nunca
   menor**, porque errar para mais gasta um tiquinho de tecido e errar para
   menos estraga o corte. A linha de resumo mostra a folga que saiu de verdade.

   Folga pequena custa tempo: a grade fica mais fina e o encaixe olha mais
   células. Pedir 5 mm quadruplica o custo de cada tentativa em relação a
   10 mm; como a busca é limitada por tempo, ela simplesmente faz menos
   tentativas.
2. **Peças** — clique em "Adicionar arquivos" ou arraste para a tela. Aceita
   **DXF**, **PLT**, **SVG** e **PDF** (molde vetorial) e **PNG/JPG** (arte);
   dá para misturar todos no mesmo encaixe. Cada peça vira uma linha na tabela. Informe a
   quantidade e, em "Girar", escolha como a peça pode ser virada:

   - **Vira 180°** (padrão) — a peça entra de cabeça para baixo quando isso
     ajudar. É o giro que o tecido permite, porque mantém o sentido do fio (e
     do desenho) na mesma direção. Nunca deita a peça de lado.
   - **Fixa** — não vira de jeito nenhum.
   - **Livre (90°)** — também deita de lado. Só para arte que não tem sentido;
     em tecido com fio, deitar a peça estraga o caimento.

   **Giro de todas as peças** — o seletor ao lado de "Como ler o vetor" aplica
   o giro na produção inteira de uma vez, e vale também para as peças que
   entrarem depois. Quando o lote todo tem que girar igual, mexer linha a linha
   na tabela não escala; a coluna "Girar" continua ali para a exceção de uma ou
   duas peças.

   São três posições, que é o que o motor sabe fazer — `ROTACOES_POR_GIRO` em
   `public/encaixe-motor.js`:

   | Escolha | Posições tentadas |
   |---|---|
   | Fixa | 0° |
   | 180° | 0°, 180° |
   | 90° | 0°, 90°, 180°, 270° |

   O 90° **é** a volta inteira: as quatro posições de 360° em passos de 90°.
   Não existe giro em ângulo livre (37°, por exemplo) — além de o motor não
   fazer, ângulo quebrado perde o sentido do fio, que é justamente o que o
   180° existe para preservar.

   Num teste com as 100 peças de uma camiseta em tecido de 160 cm, trocar só
   este seletor deu 2,61 m em "Fixa" e "180°" contra **2,55 m em "90°"** —
   73,9% de aproveitamento no lugar de 72,1%.

   **Molde vetorial (DXF, PLT, SVG e PDF)** — cada contorno fechado do arquivo vira uma
   peça, já com a medida real em centímetros: não precisa digitar largura
   nenhuma. Um arquivo com a camiseta inteira entra como quatro linhas (frente,
   costas, manga, gola). Os dois formatos costuram os traços soltos até fechar a
   volta e tratam contorno de dentro de outro como furo (piquete, casa de
   botão). O nome sai do texto que estiver dentro da peça — e se esse nome
   trouxer a quantidade (`MANGA 40x`), ela também já vem preenchida.

   - **DXF** (Audaces, Modaris, Optitex, AutoCAD): entende LINE, POLYLINE,
     LWPOLYLINE (com bulge), ARC, CIRCLE, ELLIPSE, SPLINE e blocos com INSERT.
     Só DXF **ASCII**; DXF binário é recusado com aviso. A unidade vem do
     cabeçalho `$INSUNITS`.
   - **PLT / HP-GL** (mesa de corte, eCut, CorelDRAW): entende PU/PD, PA/PR,
     arco (AA/AR), círculo (CI), rótulo (LB, com o terminador que o DT definir)
     e PE, a polilinha codificada do HP-GL/2 — inclusive com bits de fração e
     as marcas de salto e de coordenada absoluta. PLT não tem cabeçalho de
     unidade: o padrão é unidade de plotter (1016 por polegada), e se o molde
     sair com um tamanho impossível o sistema cai para mm/cm e avisa. Se o
     arquivo definir escala própria (SC/IP), que não é aplicada, o aviso
     também vai para a tela.
   - **SVG** (Illustrator, Inkscape, CorelDRAW): entende `path` (com curva de
     Bézier e arco), `rect`, `circle`, `ellipse`, `line`, `polyline` e
     `polygon`, junto com o `transform` de grupos aninhados. Quem percorre o
     desenho é o próprio navegador, então curva e transformação saem exatas.
     Um `path` com vários pedaços (contorno mais o furo do meio) é separado
     sozinho. A medida vem do `width` do arquivo quando ele traz unidade de
     verdade (`width="1800mm"`); sem unidade, é lido como pixel a 96 dpi e a
     tela avisa.
   - **PDF** vetorial (qualquer programa que exporte PDF): lê os comandos de
     desenho da primeira página — reta, retângulo, curva de Bézier — junto com
     a matriz de transformação e os XObjects de formulário. A medida sai do
     tamanho da página, que no PDF já é em centímetro de verdade. O arquivo é
     varrido objeto por objeto, sem usar a tabela xref: PDF que passou por
     vários programas costuma ter essa tabela quebrada, e assim ele é lido do
     mesmo jeito. Também abre os fluxos comprimidos (Flate) e os objetos
     empacotados do PDF moderno (ObjStm).

     Dois casos ficam de fora, com aviso na tela: PDF **protegido por senha**
     (salve uma cópia sem proteção) e PDF **escaneado**, que é só uma foto
     dentro da página e não tem desenho vetorial nenhum para ler.

   Quando o chute da unidade sair errado, o seletor **Unidade do molde** força
   mm, cm, polegada, metro ou uma das escalas de plotter.

   **PNG/JPG** — a medida vem da resolução gravada no próprio arquivo (o dpi):
   uma arte de 1772 x 2008 px salva a 150 dpi entra como 30 x 34 cm. Quando o
   arquivo não traz essa informação, o sistema usa 300 dpi (o padrão de arte
   para impressão) e a linha avisa "(suposto)" — daí é só corrigir a largura na
   tabela. Não existe "largura padrão" para digitar: a medida é sempre a do
   arquivo.

   O **fundo em volta da arte é apagado** na hora de carregar. O corte começa
   pelas bordas e só avança enquanto a cor continua parecida com a do fundo,
   então um desenho branco no meio da peça não some junto.

   Quem decide se existe fundo é **a borda inteira**, em dois passos: uma cor
   que domina a volta é fundo, seja ela qual for; e, quando nenhuma domina, o
   sistema procura o **papel** — se pelo menos um quarto da volta é claro, o
   claro mais repetido é o fundo.

   Antes essa decisão saía de quatro pixels, um em cada canto, e bastava um
   respingo, uma marca de corte ou um cantinho da arte encostando para o
   sistema achar que não havia fundo e mandar a peça como retângulo. O segundo
   passo existe pelo motivo oposto: peça grande costuma **sangrar numa borda**
   (frente e costas de camiseta encostam no rodapé da folha), e aí o branco
   pode ficar em 59% da volta sem ter deixado de ser fundo. Juntos, os dois
   passos são o que faz um JPG e o outro lerem igual.

   Se a arte sangra até a borda, nada é apagado (não há fundo). Fundo escuro ou
   colorido também fica: no automático o sistema não arrisca, porque costuma
   ser desenho de propósito. Para esses, a coluna "Contorno" tem a opção
   **Tirar o fundo**, que refaz a remoção com a cor da borda seja ela qual for.
   A linha da tabela mostra "fundo removido" quando aconteceu.

   **Como ler o arquivo vetorial.** Um DXF, PLT, SVG ou PDF pode ser duas coisas
   bem diferentes, e o seletor **"Como ler o vetor"** diz qual delas:

   - **Marcador: cada peça separada** (o padrão) — o arquivo traz as peças do
     molde, e cada contorno fechado vira uma peça. É o caso do risco que sai do
     Audaces, do Modaris ou do CorelDRAW com as peças lado a lado.
   - **Arte: o arquivo inteiro é uma peça** — o arquivo é um desenho (estampa,
     logo, letreiro), e o que vale é a volta por fora de tudo o que está
     desenhado. Sem isso, cada forma da arte virava uma peça, ou o desenho de
     dentro virava furo no meio da peça — que é o que se vê quando o sistema
     "lê cada camada em vez do arquivo inteiro".

   Dois cuidados valem para os dois modos, e resolvem a maioria dos arquivos que
   vinham errados:

   - **O retângulo do tamanho da folha não é peça.** Quase todo export traz um: o
     fundo branco da página, a moldura, a área de corte. Ele engolia o desenho
     inteiro — o molde saía como uma peça do tamanho da folha e as peças de
     verdade viravam furos dentro dela. Agora ele é reconhecido e deixado de fora,
     com aviso. O que separa "folha" de "peça com furo" é o tamanho do que está
     dentro: um piquete é um confete perto da peça; uma peça dentro da folha ocupa
     um pedaço de verdade dela.
   - **Peça desenhada duas vezes conta uma.** Export que preenche e contorna a
     mesma peça mandava duas peças iguais, uma em cima da outra.

   No SVG, o `<use>` (como o Illustrator e o Inkscape repetem a mesma forma) é
   aberto antes da leitura, e desenho que está só dentro de `<defs>`, `<clipPath>`,
   `<mask>` ou `<symbol>` não conta como peça — é molde de repetição, quem aparece
   é a cópia.

   **Quantidade pelo nome do arquivo** — quando o arquivo já vem com o número
   ao lado de um `x`, a quantidade é preenchida sozinha e a peça é multiplicada
   no encaixe. Funciona dos dois lados e com os separadores mais comuns:
   `frente 5x.png`, `x3 manga.png`, `costas-12x.png`, `manga (4x).png`,
   `bolso4x.png`. O nome que aparece na tabela sai limpo, sem o `5x`, e as
   linhas preenchidas assim ficam marcadas com "qtd do nome do arquivo".

   Medida não vira quantidade: como `30x40` tem número dos dois lados do `x`,
   `camisa 30x40.png` continua sendo 1 peça. Num nome com as duas coisas,
   como `camisa 30x40 5x.png`, o sistema entende 5 peças e mantém o `30x40`
   no nome. Se a peça não tiver número nenhum, a quantidade começa em 1 e é
   só digitar.
3. **Contorno** — o sistema lê a silhueta de cada arte e encaixa uma peça no
   vão da outra, como o Audaces faz. A silhueta sai do fundo transparente (do PNG, ou do JPG
   que já teve o fundo tirado ao carregar) ou do fundo de cor lisa em volta,
   espalhando a partir da borda. Se não houver fundo reconhecível — arte que
   sangra até a borda —, o sistema não arrisca e usa o retângulo. A decisão é a
   mesma da remoção de fundo, de propósito: quando as duas discordavam, o PDF
   saía com o fundo pintado e o encaixe empilhava as peças como se ele não
   existisse. Cada linha da tabela mostra quanto da caixa a silhueta ocupa (ex:
   "68% da caixa"), e a coluna "Contorno" permite forçar **Retângulo** ou
   **Tirar o fundo** numa peça específica.

   Quanto isso economiza depende do formato da peça, não do formato do
   arquivo. Peça quase retangular (uma frente de camiseta ocupa uns 90% da
   caixa) não ganha nada — nesses casos o encaixe por retângulo costuma gastar
   menos. Já manga, gola e recorte em diagonal economizam de 10% a 45%: numa
   grade de 22 mangas medimos 1,80 m pelo contorno contra 2,18 m por caixa.

   O campo **"Como encaixar"** decide o que fazer com isso:

   - **Automático** (o padrão) — os dois jeitos correm e fica o que gastar
     menos tecido.
   - **Sempre pelo contorno** — mesmo que a caixa tenha saído melhor. É o modo
     de quem quer ver a peça entrando no vão da outra: em pedido com muita
     manga isso é o que economiza, e em pedido de peça grande costuma custar
     alguns centímetros a mais.
   - **Sempre pela caixa** — o mais rápido, e o que a produção entende de
     relance quando o corte é na tesoura.

   No automático, o resumo do resultado diz **quanto cada jeito gastou** ("pela
   caixa deu 11,68 m e pelo contorno daria 12,16 m"), para a escolha ficar às
   claras em vez de virar palpite.

   Um aviso que ficava errado: a frase do resultado olhava um campo que nunca
   era preenchido, então dizia "as peças são quase retangulares, usei o
   retângulo" **mesmo quando o contorno tinha vencido**. Agora ela olha o motor
   que realmente ganhou.
4. **Fazer encaixe** — o sistema não roda uma vez e entrega: ele **fica
   procurando enquanto estiver achando encaixe melhor**.

   Cada tentativa segue uma "receita" — qual encaixador usar, se as peças
   repetidas entram soltas, **em dupla** ou **em trio**, em que ordem as peças
   entram e qual critério de posição vale. Primeiro ele passa por todas as
   receitas; depois fica sorteando receita e embaralhando um pouco a ordem das
   peças, porque o encaixe é guloso e uma peça mal posicionada no começo
   estraga tudo que vem depois.

   O bloco é o truque do marcador de confecção: uma manga com outra manga
   invertida fecham quase um retângulo, e aí o bloco ladrilha o tecido sem
   sobra entre as peças. O trio é a mesma ideia levada adiante — a **tira**,
   que empaca mais apertado que o par (ver "O bloco de três", adiante).

   O campo **"Procurar por até N segundos"** define quanto tempo ela pode ficar
   tentando. A procura termina antes disso quando empaca (um bom tempo sem achar
   nada melhor, proporcional ao que você pediu), e você pode cortar a qualquer
   momento em **"Parar e usar este"** — fica com o melhor encontrado até ali.
   Enquanto trabalha, a linha embaixo do botão mostra a tentativa, o tempo
   decorrido, o melhor resultado até o momento e o que a memória já sabe.

   Dar mais tempo rende pouco e rende cada vez menos. Medido numa camiseta de
   100 peças: de 0,3 s para 3 s não mudou nada; 10 s deu 0,16% menos tecido; e
   só aos 30 s apareceu 1,14%. Vale aumentar num lote grande que vai repetir
   muito; para conferir um pedido, 5 segundos resolve.

   **A busca larga a receita que ficou para trás.** Depois da passada base,
   cada receita já mostrou o que sabe fazer neste trabalho. A partir daí, o
   sorteio só considera as que estão até 6% atrás do melhor encontrado; as
   outras saem da roda. Não é o mesmo que insistir na receita que ganhou *antes*
   (isso foi medido e atrapalha, veja abaixo): aqui o que conta é o que está
   acontecendo **nesta** busca.

   Três detalhes que a medição obrigou a incluir:

   - receita que ainda não rodou nenhuma vez nunca é largada — ela não teve a
     chance dela;
   - uma fresta do sorteio (15%) continua indo para a lista inteira, porque a
     passada base roda cada receita **sem embaralhar**, e uma receita pode ir
     mal na ordem crua e ser a melhor com as peças sacudidas. Sem essa fresta,
     um dos trabalhos de teste piorou 4,5%;
   - perseguindo um recorde conhecido, a poda sai de cena: ali o objetivo deixa
     de ser render o tempo e passa a ser alcançar um número que já se sabe
     possível.

   O que isso rendeu, somando quatro trabalhos de teste (média de três sementes
   cada, mesmo tempo de procura):

   | | soma dos quatro |
   |---|---|
   | como era (dois encaixadores, sem poda) | 26,867 m |
   | com a poda | **26,518 m** |
   | com a poda e um terceiro encaixador na disputa | **26,515 m** |

   São **1,3% menos tecido** — e, o mais importante, a poda é o que deixa ter
   mais encaixadores na disputa sem diluir o tempo de procura. Num dos
   trabalhos o ganho foi de 2,34%.

   **O sistema aprende com os encaixes que já fez.** Cada encaixe fica
   registrado por *tipo de trabalho* — uma assinatura montada a partir do
   formato das peças (quanto cada uma preenche a caixa dela e se é comprida ou
   quadrada) e da largura do tecido, e não do nome ou do cliente. Assim,
   pedidos diferentes com peças parecidas compartilham o que foi aprendido.

   O que mais pesa nisso é o **recorde do tipo**: sabendo que um trabalho
   parecido já saiu com 5,32 m, a busca não se contenta com 5,40 m — ela segue
   procurando, sacudindo mais a ordem, até alcançar aquilo ou bater o teto de
   tempo. Foi medido: num dos casos de teste isso levou o resultado de 5,47 m
   para 5,32 m (2,7% menos tecido) só por ter o recorde na mão.

   O placar das receitas também é guardado, mas serve para uma coisa só:
   ordenar a primeira passada, para quem manda parar cedo já levar o melhor.
   Ele **não** enviesa o sorteio das tentativas seguintes. Cheguei a fazer
   isso e medi: não rendia nada — a primeira passada já experimenta todas as
   receitas de qualquer jeito — e ainda chegava a piorar o resultado, porque
   insistir nas receitas que ganharam antes sufoca a variação que acharia algo
   melhor desta vez. O sorteio é parelho de propósito.

   **O melhor encaixe já conseguido fica guardado inteiro.** Guardar só a
   metragem do recorde não bastava: a busca é sorteada, então ela acha um
   encaixe muito bom numa rodada e pode não chegar lá de novo na seguinte — e o
   encaixe bom, que tinha sido desenhado uma vez, sumia quando a rodada pior
   tomava o lugar dele na tela. Agora fica gravada a **posição de cada peça**.

   Quando a rodada sai pior do que o melhor já conseguido com aquelas mesmas
   peças, aparece um aviso em cima do resultado — *"o melhor encaixe já
   conseguido com estas mesmas peças gastou 1,77 m — este saiu 1,79 m"* — com o
   botão **"Usar o melhor de antes"**, que remonta o encaixe guardado na tela,
   pronto para baixar em PDF.

   O que identifica "o mesmo trabalho" é a lista exata de peças (nome, medida,
   quantidade, giro e contorno de cada uma) junto com a largura do tecido, a
   folga e a margem. Mudou qualquer coisa disso, o encaixe guardado não serve e
   não é oferecido — diferente da *assinatura* do aprendizado, que agrupa
   trabalhos só parecidos de propósito. Encaixe melhor toma o lugar do
   guardado; empate não troca.

   Nada disso é obrigatório: se o servidor estiver fora do ar, o encaixe roda
   igual, só começa sem memória (e sem o encaixe guardado).

   O resultado mostra consumo em metros, aproveitamento, área das peças e
   sobra, junto do desenho do rolo com cada arte no lugar e o contorno que o
   encaixe enxergou.

   **Baixar PDF (tamanho real)** gera o encaixe em escala 1:1, numa **página
   só**: ela tem exatamente a largura do tecido e o comprimento do encaixe, em
   centímetros de verdade, por mais comprida que fique — um encaixe de 11,31 m
   sai como uma página de 160 x 1131 cm. É esse o formato que o RIP da plotter
   espera; quebrar em trechos estraga o envio. As artes vão embutidas na
   resolução de impressão (até 150 dpi, ou a resolução da arte, o que for
   menor). Imprimindo sem "ajustar à página", o que sai no papel mede o que a
   peça mede. Vai só o desenho — nada de régua, nome de peça ou rodapé, que
   seriam impressos junto no tecido.

   As artes sobem para o servidor **uma a uma, em binário**, e só o desenho do
   encaixe vai em JSON (poucos KB). Antes elas iam dentro do próprio JSON, em
   base64: isso engorda o dado em um terço e ainda obriga o servidor a segurar
   tudo como texto na memória — com arte de verdade o pedido passava do limite
   e o download simplesmente falhava. Se mesmo assim as artes forem grandes
   demais, o sistema **reduz a resolução na medida certa para caber** e avisa
   qual foi usada; o tamanho em centímetros continua exato.

   O PDF não aceita página com mais de 5,08 m de lado, e encaixe de vários
   metros passa longe disso. Em vez de cortar em trechos, o arquivo usa o
   campo **`/UserUnit`**, que diz quanto vale uma unidade da página: com
   `/UserUnit 2,23`, uma página de 5,07 m "de arquivo" é lida como 11,31 m de
   verdade. Os números ficam dentro do limite, o tamanho real continua o mesmo
   e o arquivo segue conforme o formato — nenhum leitor reclama. Encaixe que
   já cabe no limite sai sem `/UserUnit` nenhum, que é o caso de maior
   compatibilidade.

   Também dá para baixar o desenho em PNG (só para conferir na tela, não tem
   escala) ou imprimir a tela.

   O **aproveitamento** é sempre a área real das peças (a silhueta) dividida
   pelo tecido gasto — nunca a caixa em volta da peça. Medir pela caixa
   inflaria o número, porque o vazio ao redor do desenho apareceria como
   aproveitado; com a silhueta, o número dos dois modos dá para comparar.

Se alguma peça for maior que a largura do tecido, ela fica de fora e o
sistema avisa quais foram — é só reduzir a medida, liberar o giro ou usar
um tecido mais largo.

Tudo roda no navegador: as imagens não sobem para o servidor e não ficam
salvas, então o encaixe se perde ao recarregar a página.

> O encaixe encosta as peças pelo contorno, mas não enfia uma peça pequena
> **dentro** de um vazado fechado de outra (o buraco do meio de uma gola
> redonda, por exemplo).

#### O encaixe por faixas (na disputa, mesmo perdendo quase sempre)

Dividir o rolo ao comprido em duas faixas e dar a cada uma o seu grupo de
peças — é o que o riscador faz na mão quando o tecido é largo: uma faixa para
as peças grandes, outra para as pequenas, cada uma encaixada no seu ritmo.

O que está pronto e conferido: as divisões candidatas saem das larguras das
próprias peças (uma peça por fileira, duas, três...) e só entram na lista se o
que sobra ainda comporta a peça mais estreita; o reparte manda cada peça para a
faixa onde ela cabe e, quando cabe nas duas, para a que estiver mais vazia; as
faixas dividem a margem do rolo em vez de cada uma criar a sua; e o consumo é o
da faixa mais comprida. Nada atravessa a linha da divisão e nada fica em cima
de nada.

O que **não** está pronto é ganhar do encaixe que já existe. Medindo:

| Trabalho | Retângulo | Perfil | Faixas |
|---|---|---|---|
| regata 45 cm + manga 22 cm | 5,46 m | **4,98 m** | 5,24 m |
| regata 50 cm + gola 55×8 | **4,96 m** | 5,12 m | 5,31 m |
| camiseta 56 cm + manga 46 cm | 13,02 m | **12,01 m** | 12,35 m |
| só peça grande | **5,82 m** | 6,59 m | 6,59 m |

Nos arquivos de produção que motivaram o teste (52 peças, rolo de 160 cm), a
diferença foi ainda maior: retângulo 11,41 m, perfil 11,84 m, **faixas 13,29 m**.

O motivo é geométrico: a divisão fixa proíbe a peça de atravessar a linha das
faixas. O encaixe por perfil já forma colunas sozinho quando isso ajuda — e, ao
contrário da faixa, pode mudar a coluna de lugar quando não ajuda. Foram
testadas duas maneiras de escolher onde cortar (a divisão mais equilibrada e a
que cabe mais peça grande por fileira); a segunda saiu bem pior (26% contra 5%
de perda no mesmo trabalho).

Mesmo assim ele **fica na disputa**, e é aí que está o ponto: quem decide qual
encaixe vale não é a nossa expectativa, é o resultado. Um trabalho pode ter
justamente o formato em que a faixa ajuda, e não custa nada tê-la à mão — o que
paga esse custo é a poda das receitas, explicada logo acima. Medido: com a poda,
acrescentar o terceiro encaixador mudou a soma de quatro trabalhos de 26,518 m
para 26,515 m, ou seja, nada.

#### O encaixe por NFP (na disputa, com uma fatia só)

`public/nfp.js` traz um encaixe por **polígono de não-encaixe** — a técnica que
os programas profissionais usam. O NFP de duas peças é o desenho de todas as
posições em que a segunda encosta na primeira sem invadir; sabendo esse
contorno, dá para parar a peça exatamente colada, sem depender de grade.

A diferença que importa: o encaixe por perfil só deixa a peça **descer** até
encostar. O NFP também enxerga a posição de lado, encaixada num vão que só se
alcança andando na diagonal. Numa fila de 24 camisetas ele fecha em **5,70 m**
contra 6,37 m do perfil — 10% menos tecido. Conferido peça por peça: nenhuma
sobrepondo outra, nenhuma fora do rolo.

Em compensação uma passada dele custa **segundos**, enquanto as outras custam
milissegundos. Botando ele para disputar em todas as fatias, ele rouba o tempo
das receitas que estavam ganhando: medido, ganhava 10,45% em dois trabalhos e
perdia até 1,90% em quatro outros.

Por isso ele fica com **uma fatia só** das cinco (ver "A busca espalhada pelos
núcleos", logo abaixo). Ali ele tem o tempo inteiro dela para as poucas
passadas que consegue; as outras quatro seguem como antes. Quando ele ganha,
ganha muito; quando não ganha, custou um quinto da capacidade. Somando os
quatro trabalhos de teste, a fatia dedicada valeu **2,66% menos tecido**
(melhorou 4, empatou 3, piorou 1). Vale só no automático: quem pediu contorno
na tela quer ver o contorno.

**Acelerar o NFP não compra tecido**, e isso foi medido. Dando 2x e 4x mais
tempo à fatia dele:

| Trabalho | 6 s | 12 s | 24 s |
|---|---|---|---|
| camiseta+manga+gola | 7,455 m | 7,226 m | **7,140 m** |
| só camiseta | 5,700 m | 5,700 m | 5,700 m |
| calça+bolso | 7,090 m | 7,090 m | 7,090 m |
| misturado pequeno | 6,000 m | 6,000 m | 6,000 m |

Em três dos quatro ele bate no chão dele já nas primeiras passadas, e
quadruplicar o tempo não move um centímetro. Só num deles melhora — e mesmo lá
ele chega em 7,140 m, que é *empatar* com o que o contorno já entrega. Ou seja:
o gargalo do NFP não é velocidade, é o teto do encaixador guloso. Portá-lo para
WebAssembly, como foi feito com o de contorno, daria quatro vezes mais passadas
para não mudar nada em três de quatro trabalhos. Fica de fora por medição, não
por opinião.

#### A busca espalhada pelos núcleos

Cada tentativa de encaixe é independente da outra: nada do que a receita A
descobre muda o que a receita B vai fazer. Rodando numa thread só, um i5 de 6
núcleos usava **um** — os outros cinco ficavam olhando.

`public/encaixe-paralelo.js` abre um worker por núcleo (menos um, para a tela
continuar respondendo, com teto de 8) e dá a cada um uma fatia do portfólio: as
receitas de índice k, k+n, k+2n… Cada fatia roda a busca inteira dela e devolve
o melhor que achou; a página fica com o melhor de todas. É a mesma jogada do
servidor de encaixe do Audaces: o que compra tecido não é um encaixador mais
esperto, é caber mais tentativas no mesmo tempo. Sem worker disponível —
navegador antigo, erro ao carregar —, cai na busca de uma thread só, e a tela
não fica sabendo: mesma chamada, mesmo resultado.

Duas coisas são decididas por fatia, e as duas saíram de medição:

- **a varredura**. Ela pode testar toda posição do rolo (exata) ou andar de três
  em três e refinar depois. Pulando, cada tentativa sai ~2,5x mais barata. Com
  todas as fatias pulando, a média foi 1,08% menos tecido, mas em 2 de 12 casos
  saiu **pior**. Deixando fatia com a varredura exata e as outras pulando, o
  melhor de todas nunca fica atrás: 1,16% de média, melhorou em 8 dos 12,
  empatou em 4 e piorou em nenhum. A fatia exata funciona como piso.

  **Quantas fatias varrem exato** foi remedido depois do WASM, que barateou a
  tentativa e mudou a conta: hoje são **duas**, não uma. Somando os quatro
  trabalhos, 1 exata deu 51,438 m, 2 exatas deram 51,333 m, todas exatas
  51,370 m e uma escada 1/2/3/3 também 51,370 m. São 0,20% — pouco, mas a
  repartição nova empatou ou ganhou nas 8 medições e não perdeu em nenhuma.
  Varrer tudo exato já é demais: cai para metade das tentativas e a conta se
  inverte.
- **o encaixador**. A última fatia é a do NFP, explicada acima.

#### O bloco de três

A dupla junta a peça com a cópia dela invertida. O marcador de confecção não
para no par — ele monta a **tira**: três, quatro peças alternadas, e a tira
inteira ladrilha o rolo. Medindo a caixa que cada peça carrega dentro do bloco:

| Peça | Solta | Bloco de 2 | Bloco de 3 | Bloco de 4 | Bloco de 6 |
|---|---|---|---|---|---|
| camiseta | 62376 | 58374 | **57040** | 60907 | 62376 |
| manga | 17856 | 16512 | **16064** | 17003 | 17856 |
| gola | 2886 | 2442 | 2294 | 2220 | **2146** |
| calça | 79588 | 68359 | 66980 | 66291 | **65601** |
| regata | 37884 | 36039 | **35424** | 37376 | 37884 |

O trio empaca mais apertado que a dupla em todas as peças. Só que bloco mais
apertado não é o mesmo que menos tecido — bloco maior é mais difícil de
posicionar —, então ele entrou como **mais uma receita na disputa**, ao lado da
dupla e da peça solta, e não no lugar delas. Medido, 5 fatias de 5 s, duas
sementes:

| | soma dos quatro trabalhos |
|---|---|
| como era (dupla e solta) | 47,330 m |
| com o trio na disputa | **46,500 m** |
| com o trio e o quarteto | 46,483 m |

São **1,75% menos tecido**, e onde o trio ganha ele ganha muito: só camiseta
5,763 → 5,540 m, calça+bolso 5,230 → 4,945 m. Nesses casos a receita vencedora
foi literalmente `contorno/trio/altura/vazio`. Em "misturado pequeno" ele perde
um pouco, e é por isso que ele disputa em vez de substituir.

O **quarteto ficou de fora**: 46,483 contra 46,500 m é nada, e ele custa seis
receitas a mais na passada base — que em lote grande é o orçamento inteiro. Ele
continua no motor, disponível por `config.agrupamentos`, para quem quiser
estudar.

Somando o trio com a segunda fatia exata, em três sementes:

| | soma dos quatro | aproveitamento |
|---|---|---|
| como era | 71,313 m | 69,2% |
| só o trio | 69,835 m | 71,0% |
| trio + 2 fatias exatas | **69,733 m** | **71,1%** |

**2,22% menos tecido.** Os dois ganhos somam em vez de se comerem, o que não
era garantido: os dois mexem no mesmo recurso, que é quantas tentativas boas
cabem no tempo.

> **Nota sobre as peças de teste.** Esses números vieram de peças com as
> concavidades que molde de verdade tem — decote, cava, cabeça de manga, gancho
> da calça. As silhuetas usadas antes eram lisas demais e escondiam justamente
> o que o agrupamento faz: a manga era uma lente simétrica, então girada 180°
> ela era ela mesma e "manga com manga invertida" rendia **0,0%**; com a manga
> de verdade rende 7,5%. Toda medição de agrupamento feita com as peças lisas
> subestimava o ganho.

#### O que foi tentado e não passou

- **Bloco de peças diferentes** (a gola na curva da manga, a manga no vão do
  decote), que é o agrupamento automático dos programas profissionais. Todos os
  pares mistos saíram **piores** que as duas peças soltas: manga+gola +13,6%,
  camiseta+manga +4,8%, calça+bolso +2,3%. O motivo é geométrico — juntar peça
  grande com peça pequena sempre deixa um canto vazio na caixa do bloco.
- **A dupla montada pelo NFP**, para ela enxergar a posição de lado que o
  "desliza e deixa cair" não alcança. Perdeu da dupla de hoje em todas as peças
  (+0,5% a +6,3%): a varredura horizontal exaustiva que já existe cobre mais
  posições que os vértices do NFP.

#### O laço do encaixe em WebAssembly

O laço mais quente do encaixe por contorno — descer a peça pelo relevo do tecido
e medir onde ela para — está portado para WebAssembly em `wasm/src/lib.rs`, com
a ponte em `public/encaixe-wasm.js`. Rende **3,9x mais tentativas no mesmo
tempo**:

| Trabalho | salto | tentativas em JS | com WASM | ganho |
|---|---|---|---|---|
| camiseta+manga+gola | 1 | 228 | 868 | 3,81x |
| camiseta+manga+gola | 3 | 588 | 2340 | 3,98x |
| misturado pequeno | 1 | 300 | 1188 | 3,96x |
| misturado pequeno | 3 | 796 | 3124 | 3,92x |

O consumo saiu igual ou melhor em todos os quatro.

O que atravessa a ponte foi o que decidiu o desenho. As **formas** das peças vão
uma vez por busca — são elas que custam a montar e não mudam de uma tentativa
para a outra —, e a cada tentativa atravessa só a **ordem**, um número por peça,
voltando onde cada uma parou. Chamando por peça, em vez de portar a rodada
inteira, o relevo do tecido teria que ser copiado 21 mil vezes por busca, e a
cópia comeria o ganho. Assim o relevo nasce e morre do lado do WASM.

Nada disso é obrigatório: se o módulo não carregar, `encaixarContornoWasm`
devolve `null` e o encaixe segue pelo caminho de sempre em JavaScript — que
continua sendo a referência de correção. Existe um teste que compara os dois
posição por posição, e eles batem.

Para reconstruir o módulo depois de mexer no Rust: `npm run build:wasm` (precisa
do `cargo` com o alvo `wasm32-unknown-unknown`). O arquivo gerado vai para
`public/encaixe.wasm` e tem 4,8 KB.

#### O lote grande não usa mais atalho

Com 120 peças ou mais, o automático **desligava o encaixe por contorno** e usava
só a caixa. A razão era real e medida: no histórico de 222 peças da loja, o
contorno conseguia **38 tentativas** contra 1496 da caixa, e perdia por 5,4
pontos de aproveitamento. Cada tentativa pelo contorno custava caro demais para
o tamanho do trabalho.

O WASM desfez essa conta. Hoje, em lote grande, o contorno faz *mais* tentativas
que a caixa — e o atalho passou a custar caro. Medido na bancada, 5 fatias de
5 s, o mesmo tempo de tela:

| Trabalho | Só a caixa (como era) | Automático | Diferença |
|---|---|---|---|
| 130 peças, rolo 160 | 13,51 m (60,8%) | **10,81 m (75,9%)** | 20,0% menos |
| 222 peças, rolo 179 | 18,84 m (66,1%) | **15,71 m (79,3%)** | 16,6% menos |
| 235 peças, rolo 160 | 20,39 m (62,0%) | **18,00 m (70,3%)** | 11,7% menos |

De 10% a 20% menos tecido, com o mesmo tempo de tela (25,2 s contra 25,0 s): a
busca roda nos workers, então a tela não sente. O atalho saiu. O que "lote
grande" ainda decide é só o ritmo — uma tentativa por rodada, para o botão de
parar continuar respondendo.

#### A meta de aproveitamento

Antes, a busca nunca parava antes do tempo pedido — mesmo tendo achado um
encaixe ótimo no primeiro segundo, ela continuava tentando até o cronômetro
zerar (ou a pessoa apertar "Parar e usar este"). `config.metaAproveitamento`
(em `encaixe-motor.js`) dá a ela um segundo motivo para parar sozinha: além do
recorde da memória, ela agora também persegue um número fixo — hoje, **95%**,
ligado por padrão em `encaixe.js` — e para assim que bater essa marca com toda
peça encaixada. Não bateu, cai de volta no que já fazia: usa o tempo pedido
inteiro e entrega o melhor que achou.

O alvo perseguido é sempre o mais exigente entre os dois (recorde da memória e
meta), porque bater o mais apertado já garante o outro. E como a busca roda
espalhada pelos núcleos (`encaixe-paralelo.js`), a fatia que bate a meta manda
as outras pararem também — sem isso a fatia mais lenta seguraria o resultado
até o fim do tempo à toa, e a meta batida cedo por uma não economizaria nada.

Medido com peças sintéticas de contorno realista (decote, cava, gancho —
silhueta lisa demais esconde esse tipo de efeito, como já registrado na "Nota
sobre as peças de teste" mais abaixo): quando a meta é alcançável, o tempo de
busca cai em torno da metade sem perder tecido; quando não é (a maioria das
peças de vestuário, mais irregulares, fica bem abaixo de 95%), o resultado sai
igual ao de antes. Como sem meta a busca nunca parava mais cedo, isto só pode
economizar tempo, nunca piorar o encaixe — por isso entrou como padrão sem
precisar da disputa que os outros encaixadores passam.

#### A rede das receitas

O placar por assinatura (lá em cima) só enxerga trabalho **idêntico** a um já
visto — mesmo balde de ocupação e proporção, arredondado para caber num texto.
`public/encaixe-rede.js` é uma segunda camada de memória: uma rede neural
pequena, escrita à mão (sem TensorFlow nem parecido — o motor roda em Web
Worker sem acesso a nada de fora, e o instalador embute um Node standalone;
uma biblioteca de ML pesaria dezenas de MB para um problema deste tamanho),
que aprende do **formato** das peças — ocupação, proporção, quantidade — em
vez do balde exato. Um trabalho novo, parecido mas não idêntico a nenhum já
feito, ainda ganha um palpite que faz sentido.

O servidor treina (retropropagação de verdade, ~150 épocas) toda vez que
exemplo suficiente se acumula no histórico (`encaixe-memoria.js`,
`REDE_RETREINO_A_CADA`), e manda os pesos prontos — só o passe para frente,
puro JS — para a busca pontuar cada receita candidata. O uso é híbrido:

- **Sempre** que existe rede treinada, a pontuação dela entra no mesmo peso
  que já decidia a ordem da primeira passada, junto com o placar por
  assinatura (o maior dos dois manda) — nunca tira receita nenhuma da
  disputa, só ajuda a tentar as boas primeiro.
- **Só depois de bastante histórico E de bastante variedade** (ver
  `REDE_LIMIAR_MADUREZA` e `REDE_LIMIAR_DIVERSIDADE`, os dois em
  `encaixe-memoria.js`), quando a rede já viu trabalho de sobra e formato de
  sobra para a opinião dela valer alguma coisa, uma receita que ela pontua
  muito mal (`REDE_CORTE_LIMIAR`) para de entrar na disputa — mas nunca um
  motor inteiro: se nenhuma receita de um motor passou do corte, é sinal de
  que a rede não tem opinião boa nenhuma para aquele motor neste trabalho, e
  todas ficam.

Testado com um servidor de verdade (Express + SQLite descartável): trabalho
sintético foi suficiente para a rede acertar de 93% a 98% de um lote novo,
numa regra que ela nunca tinha visto exemplificada daquele jeito.

**Testado também contra o `dados.db` real** (só leitura) — e foi isso que
achou o problema que fez nascer o `REDE_LIMIAR_DIVERSIDADE`. O banco real
tinha só **6 formatos de trabalho distintos** (1.450 usos somados, mas todos
espremidos nesses 6). Validação "deixa um formato de fora, treina nos outros
5, testa nele" (o teste mais duro que dá para fazer com esse tamanho de dado):
a rede acertou só **4 de 6** ao apontar a receita certa num formato nunca
visto — e nos dois erros, deu menos de 1% para a receita que **de fato**
tinha ganhado sempre. Volume sozinho (1.450 usos) já passaria fácil dos 200
exemplos de `REDE_LIMIAR_MADUREZA` e deixaria o corte ligar; só que com 6
formatos repetidos a rede não tinha aprendido a generalizar coisa nenhuma —
tinha decorado aqueles 6. Por isso a maturidade agora exige as duas coisas:
exemplo (`REDE_LIMIAR_MADUREZA`) **e** formato distinto
(`REDE_LIMIAR_DIVERSIDADE`, hoje 20) — testado de novo depois do ajuste: 230
exemplos na mesma assinatura, sozinhos, não ligam mais o corte. O número 20
é um piso conservador, sem calibração ainda — precisa ser remedido quando
houver histórico de produção variado de verdade para isso.

### Aba Vetor

Transforma um PNG ou JPG em desenho **vetorial** (SVG): contornos com
preenchimento, que crescem sem perder qualidade. É o que a plotter, a faca de
corte e a impressão grande pedem — e é o que resolve a foto de logo que o
cliente mandou pelo WhatsApp e não dá para ampliar.

Escolha a imagem (ou arraste para a tela) e o vetor sai na hora, lado a lado com
o original. A linha de **atalhos** no alto — *Logo e arte chapada*, *Silhueta
para faca*, *Arte com sombra*, *Detalhe fino* — deixa o ajuste pronto para o
trabalho que estiver na mão; daí para frente, mexer em qualquer controle refaz o
desenho:

- **Cores** — quantas cores a paleta terá, de 1 a 24. É o controle que mais muda
  o resultado. Com 1 sai a silhueta (boa para faca de corte); logo de confecção
  costuma fechar entre 6 e 16.
- **Detalhe mínimo** — a mancha menor que isso, em pontos, é considerada cisco e
  some. Sobra de anti-serrilhado vira centenas de contorninhos que não se
  enxergam, mas pesam no arquivo e fazem a faca levantar e baixar à toa.
- **Suavidade** — o quanto o contorno pode se afastar da grade ao ser
  simplificado. Baixo demais deixa os degraus de pixel; alto demais come
  detalhe fino.
- **Quina a partir de** — de quantos graus para cima um ponto é canto vivo e não
  é arredondado. É o que preserva a ponta da estrela sem deixar a barriga do "S"
  em degraus.
- **Juntar sombras** (0 a 100) — trata o claro e o escuro de uma mesma cor como
  **uma cor só**. Em 0 nada muda. Ver "Sombra não é peça", abaixo.
- **Arredondar** (0 a 2) — o quanto a curva encorpa entre um ponto e outro. Em 1
  ela segue a tangente sem estufar; em 0 vira quase reta; acima de 1 arredonda.
- **Borda no subpixel** — lê no anti-serrilhado onde a borda realmente passa, em
  vez de deixá-la na divisa do pixel. Ligado por padrão. Ver "A borda não fica
  na divisa do pixel", abaixo.
- **Círculo vira círculo** — reconhece contorno redondo e o escreve como arco de
  verdade, não como uma curva que passa perto. Ligado por padrão.
- **Tirar o fundo** — usa a mesma leitura de fundo da tela de Encaixe (quem
  decide é a borda inteira, não quatro pixels dos cantos). Arte que sangra até a
  borda não tem fundo para reconhecer, e nesse caso o rodapé avisa.
- **Aproximar** (1× a 20×) — a roda do mouse aproxima no ponto onde o ponteiro
  está e arrastar move. As duas prévias andam juntas, que é o que deixa comparar
  a borda de uma com a da outra. Ver "Olhar de perto, e sem travar", abaixo.

O rodapé diz quantas cores e quantos contornos saíram, o tamanho do arquivo, o
tempo e — quando o arquivo traz o dpi — **a medida real em centímetros**, que vai
gravada no SVG. Assim a plotter imprime no tamanho certo sem ninguém digitar
medida nenhuma. No fim, **Baixar SVG** ou **Copiar o SVG** — este último cola
direto no CorelDRAW ou no Illustrator, sem passar pela pasta de downloads.

**Como é feito.** O caminho tem quatro passos, em `public/vetor.js`:

1. **juntar cores.** Uma arte "de três cores" costuma ter oito mil, por causa do
   anti-serrilhado e da compressão do JPG. A paleta sai por corte da mediana, e
   duas coisas nela custaram uma versão errada cada:

   - contando **pixel**, o branco de fundo é metade da imagem e a mediana caía
     sempre dentro dele — as divisões iam embora separando branco de branco, e
     num desenho de três cores o vermelho e o azul terminavam na mesma caixa,
     virando um roxo. Contando **cor** (cada uma uma vez, com o número de pixels
     do lado), a divisão cai entre cores diferentes.
   - deixando o **anti-serrilhado votar**, a paleta era gasta com tons que não
     existem no desenho. Medido no logo da casa: de oito lugares, **três** iam
     para tons de borda (`#a0d6e5`, `#272024`, `#955a53`), que somavam 1,1% da
     imagem e **41 dos 73 contornos** do arquivo. Hoje a paleta é escolhida só
     pelo **miolo** das cores — ponto que não está em cima de uma divisa — e
     depois todo mundo é atribuído à cor mais próxima, inclusive os da borda:
     a faixa se parte no meio e some dentro das duas cores que ela separava.
2. **limpar o cisco**, entregando cada mancha pequena à cor que mais a cerca.
3. **achar a borda.** De cada cor sai um mapa preto e branco, e dele saem todos
   os contornos fechados. O caminho anda pelas quinas das células, então ele cai
   exatamente na divisa entre cheio e vazio; o contorno de fora e o buraco de
   dentro saem com sentidos contrários, que é do que o SVG precisa para vazar o
   buraco em vez de pintá-lo por cima.
4. **remontar.** O contorno é simplificado (Douglas-Peucker, o mesmo do encaixe)
   e depois **remontado**: em cada ponto o desenho pergunta até onde vai uma
   reta e até onde vai um arco, e fica com o que alcançar mais longe. O que não
   é nem reta nem arco sai como curva de Bézier, com as quinas preservadas. Ver
   "Reta é reta, arco é arco", adiante. Dois cuidados na parte da curva saíram
   de olhar o desenho ampliado:

   - **a tolerância acompanha o tamanho do contorno.** Fixa, ela come letra:
     1,2 ponto some num círculo de 300 pontos, mas numa perna de "R" de 6
     pontos de largura é 20% da espessura, e a letra sai redonda.
   - **a alça da curva é limitada a um terço do segmento.** Sem isso, num
     contorno pequeno com virada fechada a curva passava do lado de fora do
     desenho, e aparecia um fiapo de cor onde não havia nada.

As camadas saem da maior para a menor. Isso importa: as cores se encostam pela
borda, e um fio de fundo entre duas delas apareceria como risco branco.
Desenhando a maior primeiro e as outras por cima, qualquer folga de meio ponto
fica escondida embaixo da camada seguinte.

Imagem maior que 1800 pontos de largura é reduzida antes de virar vetor. Não é
economia de memória, é qualidade: numa foto de 5000 pontos cada fiapo de
compressão do JPG vira um contorno, e o desenho sai com milhares de caminhos que
ninguém enxerga.

**Como isso é medido.** O SVG gerado é desenhado num canvas do tamanho da
imagem e comparado com ela ponto a ponto. Saem duas medidas: o *erro* (a
diferença média por canal, 0 = idêntico) e os *iguais* (quantos por cento dos
pontos ficaram a menos de 8 de distância). Fidelidade sozinha não decide nada —
dá para chegar perto com 200 cores e um arquivo de 3 MB —, então o que conta é
fidelidade **pelo tamanho do arquivo**.

As três correções acima, medidas em dois trabalhos:

| | erro (logo) | iguais (logo) | erro (arte) | iguais (arte) |
|---|---|---|---|---|
| primeira versão | 2,70 | 96,1% | 13,98 | 66,2% |
| paleta só pelo miolo | 1,92 | 96,5% | 10,33 | 88,3% |
| \+ tolerância por tamanho e alça limitada | **1,73** | **96,6%** | **7,63** | **89,5%** |

São **36% menos erro** no logo e **45% menos** na arte, com o arquivo do mesmo
tamanho no logo (11 KB) e 18% maior na arte — o que é o preço de guardar o
detalhe fino que antes se perdia.

O teto medido (sem simplificar nada, 24 cores) é 93,6% de iguais na arte: os
quatro pontos que faltam para lá são a simplificação, e quem decide quanto
gastar neles é o controle de **Suavidade**.

Vale saber: passar de 8 cores **não melhora** nessa arte (89,5% com 8, 16 ou
24). Depois que a paleta parou de gastar lugar com borda, oito cores já cobrem o
que a imagem tem; os lugares a mais viram quase-duplicatas.

Tempo: um logo de 442 × 442 px sai em **0,1 s** com 56 contornos e 11 KB (contra
31 KB do PNG); uma arte de camiseta de 1061 × 617 px, cheia de detalhe, sai em
**0,7 s**.

#### Círculo tem que sair círculo

Um contorno redondo virava uma sequência de Béziers que passa **perto** do
círculo, mas não é um. Isso tem dois defeitos: ampliado, a barriga oscila; e
aberto no CorelDRAW, ele é um punhado de nós soltos em vez de uma circunferência
que se pega pelo raio.

Agora, antes de virar curva, cada contorno é testado por mínimos quadrados: cabe
num círculo? cabe numa elipse? Cabendo, sai como arco (`A` do SVG), que é a
circunferência exata. Duas peneiras evitam o falso positivo:

- **a área tem que bater.** Uma meia-lua se ajusta bem a um círculo — os pontos
  dela estão todos em cima dele —, e sem essa conferência ela viraria um círculo
  inteiro.
- **a forma tem que ter tamanho.** Num contorno de quatro pontos qualquer coisa
  se ajusta a qualquer coisa.

Medido num desenho de teste com três círculos, um anel e uma bola: **11 formas
redondas** reconhecidas (inclusive o furo do anel) e o arquivo caiu de 6,9 KB
para **2,6 KB** — 62% menor, porque um arco vale dois comandos e a curva
equivalente valia quarenta.

#### A borda não fica na divisa do pixel

O traçado anda pelas quinas das células, então todo ponto do contorno caía numa
divisa **inteira** de pixel. Isso põe um piso em tudo o que vem depois: uma borda
que de verdade passa em y = 10,3 era gravada em y = 10, e a diferença virava
degrau — reta em escada, círculo levemente poligonal, e a simplificação depois
jogando fora degraus que só existiam porque a grade os inventou.

A informação de onde a borda está não se perdeu: ela está no **anti-serrilhado**.
Um pixel na divisa entre o laranja e o branco não é laranja nem branco, é a
mistura dos dois na proporção de quanto cada um cobre aquele pixel. Lendo a
proporção, sabe-se que a borda passa a 30% do pixel — e o ponto vai para lá.

O ganho aparece onde ele deve aparecer. Num desenho de duas cores (círculo,
retângulo girado e triângulo), variando a tolerância da simplificação:

| Suavidade | sem subpixel | com subpixel |
|---|---|---|
| 1,2 | erro 1,51 · 27 nós | erro **0,92** · 29 nós |
| 0,4 | erro 0,62 · **1125 nós** | erro **0,49** · **36 nós** |
| 0,2 | erro 0,62 · 1125 nós | erro **0,39** · **41 nós** |

Sem subpixel, apertar a tolerância abaixo de 0,8 só empilha nós perseguindo a
escada da grade: trava em 0,62 com 1125 nós. Com subpixel, 0,39 com 41 — **27
vezes menos nós e mais fiel**. E o raio de um canto arredondado de 28 pontos, que
saía 26,03, passa a sair **28,07**.

**Foram quatro tentativas até funcionar, e as três primeiras estragavam o
desenho.** Vale registrar porque os erros são todos da mesma família — supor em
vez de perguntar:

1. supus que a perpendicular calculada pelos vizinhos apontava para fora. Vale só
   se o contorno rodar num sentido; buraco roda ao contrário, e ali o ponto ia
   para o lado errado. **Quem responde onde é dentro é o mapa da camada.**
2. fui buscar as duas cores puras com uma sonda a 1,5 pixel. Num traço de letra
   com quatro pixels de largura, a sonda atravessa e traz a cor do outro lado: a
   conta inverte e a letra fecha. O texto do logo virou mancha. **As duas cores
   já são conhecidas — estão na paleta.**
3. deixei cada camada refinar a borda dela sozinha. Duas cores vizinhas dividem a
   mesma divisa, e cada uma calculava a direção pelos próprios degraus: as duas
   se afastavam e abria fresta. Por isso apertar a tolerância piorava.
   **O deslocamento passa a ser calculado uma vez por ponto e compartilhado.**
4. e um erro que o subpixel só expôs: as bandeiras do comando `A` do SVG (arco
   curto ou longo, e para que lado vira) eram decididas pelo ângulo do ponto do
   meio. Perto de meia volta, meio pixel bastava para a conta virar e o arco
   saía pelo lado errado — um balão gigante atravessando o desenho. **Agora o
   arco escolhido é conferido contra o ponto por onde o contorno passou, e se
   nenhuma combinação bater ele desiste de ser arco.**

#### Canto e tangente

Duas peças que se sustentam uma na outra.

**O canto** era medido pelo ângulo entre um ponto e os dois vizinhos imediatos do
polígono simplificado — frágil dos dois lados: num contorno denso, dois vizinhos
a um pixel fazem qualquer curva parecer canto; num esparso, um canto de verdade
fica com vizinhos longe e o ângulo suaviza. Agora ele é medido no contorno
**bruto**, com janela proporcional ao tamanho do desenho, e só vale se for o mais
fechado da vizinhança — senão um canto vivo marcava três pontos seguidos e saía
chanfrado.

**A tangente** não existia: as alças da Bézier apontavam para o vizinho seguinte,
então a direção vinha do acaso de onde o vizinho caiu, e o traço ondulava de leve
mesmo depois de simplificado. Agora cada ponto tem uma tangente tirada de uma
janela do contorno bruto: a direção passa a ser a do desenho. Nas quinas ela é
cortada em duas, uma para cada lado, que é o que mantém o canto vivo — e fora
delas a curva entra e sai de cada ponto na mesma direção dos dois lados, o que
faz a emenda entre um pedaço e outro sumir na ampliação.

Somando subpixel, canto e tangente:

| | sem | com |
|---|---|---|
| logo, suavidade 1,2 | erro 1,78 · 417 nós | erro **1,44** · 399 nós |
| logo, suavidade 0,3 | erro 1,48 · 2919 nós | erro **1,19** · **737 nós** |
| arte de camiseta, suavidade 0,3 | erro 7,09 · 9041 nós | erro **7,05** · **5392 nós** |

No logo é melhor em tudo: menos erro e um quarto dos nós. Na arte de camiseta o
erro fica igual com 40% menos nós. Em arte muito colorida e com tolerância
frouxa o erro sobe uns 3% — por isso a chave existe.

#### Reta é reta, arco é arco

Alisar o contorno inteiro do mesmo jeito trata reta, arco e curva como a mesma
coisa, e o resultado tem dois defeitos que aparecem ampliando o desenho:

- **reta torta.** Uma linha quase horizontal tirada de uma grade de pixels vem
  em degraus de um ponto. A simplificação não consegue jogar todos fora, e a
  curva passa ondulando por eles: a reta sai com barriga.
- **arco imperfeito.** Um canto arredondado vira uma sequência de pedacinhos de
  Bézier que passam perto do arco, cada um com o seu errinho.

Por isso o contorno é percorrido e remontado, escolhendo a primitiva certa em
cada trecho. Num desenho de teste feito só de barra, triângulo, retângulo de
cantos arredondados, círculo e uma diagonal comprida:

| | curvas | retas | arcos | arquivo |
|---|---|---|---|---|
| curva em tudo | 78 | 36 | 0 | 3,3 KB |
| reta + arco + curva | **0** | 40 | 6 | **1,1 KB** |

Zero curvas — porque o desenho não tem nenhuma. O retângulo de cantos
arredondados sai como `reta, arco, reta, arco…` com o **raio certo** (26,0
contra os 28 desenhados, a diferença sendo o meio pixel da borda), e a barra e o
triângulo saem com quatro retas cada.

**Duas tentativas erradas antes de acertar**, as duas pelo mesmo motivo de
fundo. Conferindo o arco só nos **vértices** do polígono simplificado, ele
passava rente a eles e fazia barriga no meio: a lateral reta do retângulo sumia
dentro de um arco de raio 81, três vezes o canto. Conferindo também o **meio dos
segmentos**, deu o contrário — a corda de uma curva passa por dentro dela, então
o arco certo era recusado e o canto arredondado saía poligonal. Os dois erram
porque o polígono simplificado não é o desenho; é uma aproximação. Hoje reta e
arco são conferidos contra o contorno **bruto**, o que saiu da grade de pixels,
e o polígono simplificado serve só para oferecer os pontos onde vale a pena
quebrar o caminho.

Em arte de verdade isso não custa fidelidade e economiza metade do arquivo:

| | erro | pontos iguais | nós | arquivo |
|---|---|---|---|---|
| logo, curva em tudo | 1,73 | 96,6% | 632 | 11 KB |
| logo, remontado | 1,78 | 96,6% | **417** | **4 KB** |
| arte de camiseta, curva em tudo | 7,63 | 89,5% | 4633 | 64 KB |
| arte de camiseta, remontada | 7,64 | **89,7%** | **3579** | **34 KB** |

#### Sombra não é peça

Uma bola laranja iluminada de cima tem cem laranjas diferentes, do quase preto ao
quase amarelo. Para a paleta isso é uma cor que se espalha muito — e cor que se
espalha muito é justamente o que o corte da mediana adora partir.

Medido no mesmo desenho de teste: **seis dos oito lugares** da paleta foram para
faixas de sombra, e o vermelho, o verde e o roxo dos círculos foram jogados fora.
A bola saiu listrada de faixas diagonais, cada faixa virando um contorno separado
— sombra virando peça.

O controle **Juntar sombras** troca o que a paleta compara. Em 0 ela compara em
RGB, como sempre. Subindo, ela passa a comparar a **proporção** entre os canais:
o mesmo laranja no claro e na sombra tem a mesma proporção, então os dois viram
uma cor só. O brilho continua pesando um pouco, e nunca vale zero — branco,
cinza e preto têm todos a mesma proporção, e é só o brilho que os separa; sem
essa sobra, texto branco em fundo preto viraria uma mancha cinza.

Com o controle em 40, no desenho de teste: a bola virou **uma peça só**, o roxo
do anel voltou, e os contornos caíram de 20 para 18.

**Fica desligado por padrão, e isso saiu de medição.** Ele ajuda no sombreado e
atrapalha em arte comum:

| | erro | pontos iguais |
|---|---|---|
| logo, sem juntar | **1,78** | **96,6%** |
| logo, juntando 40 | 2,85 | 96,1% |
| arte de camiseta, sem juntar | **7,58** | **89,5%** |
| arte de camiseta, juntando 40 | 12,90 | 64,9% |
| desenho com sombreado, sem juntar | 7,26 | 65,0% |
| desenho com sombreado, juntando 40 | **5,95** | **71,4%** |

Ou seja: ligue quando a arte tiver sombreado ou degradê que você **não** quer ver
picado em faixas; deixe em 0 para logo e arte chapada.

> **Onde ele é bom e onde não é.** Logo, letra, escudo e arte de cor chapada
> saem praticamente iguais ao original. **Degradê não vetoriza bem** — nem aqui
> nem em programa nenhum: um arco-íris com 16 cores sai em faixas, porque é isso
> que 16 cores conseguem fazer com uma variação contínua. Para esse tipo de arte,
> ou se aumenta muito o número de cores, ou o certo é continuar em imagem.

#### O arco escorregava perto de meia volta

Um defeito que só aparecia quando se pedia **mais** fidelidade, que é o pior
lugar para um defeito estar. Baixando a Suavidade de 0,6 para 0,4 no logo da
casa, o erro **subia** de 1,29 para 3,13 — o contrário do que o controle
promete. Ampliando, o anel branco de fora estava engordado uns três pontos ao
longo da volta inteira.

A causa é uma sutileza do `A` do SVG. Ele não diz onde fica o centro do arco:
diz o raio e duas bandeiras, e quem desenha calcula o centro a partir das duas
pontas. Quando as pontas ficam quase em lados opostos do círculo, meia corda
encosta no raio — e aí **um centésimo a menos** no raio ajustado faz o
programa esticá-lo para caber, o que arrasta o centro para cima da corda. O arco
continua sendo um arco bonito; só que de outro círculo.

A conferência que existia não via nada porque media contra o círculo **ajustado**
— que continuava certinho —, num único ponto do meio do trecho e com folga
proporcional ao raio: num arco de raio 213, isso é **53 pontos de folga**, e a
volta inteira do logo cabe ali dentro. Hoje as quatro combinações de bandeira
são desenhadas de mentira, cada uma com o centro que o SVG calcularia para ela, e
medidas contra os pontos por onde o contorno realmente passou; o raio é esticado
de propósito até meia corda e já sai arredondado, para o que foi conferido ser
exatamente o texto que vai para o arquivo. Ponto que cai fora da varredura é
medido até a ponta mais próxima — é isso que derruba o lado errado, porque ali o
desenho inteiro fica fora do arco.

| | erro antes | erro depois |
|---|---|---|
| logo, suavidade 0,6 | 1,29 | **1,29** |
| logo, suavidade 0,4 | 3,13 | **1,25** |
| logo, suavidade 0,2 | 3,14 | **1,33** |

Com isso a Suavidade volta a fazer o que diz: apertar melhora. E o atalho de
**Detalhe fino** passou a fazer sentido, porque antes ele levava direto para o
pior número da tabela.

#### A paleta se acomoda

O corte da mediana entrega caixas de cor, e a cor de cada caixa é a média do que
caiu **nela**. Só que na hora de pintar ninguém pergunta de que caixa o ponto
veio: ele vai para a cor mais próxima da paleta, que muitas vezes é a da caixa
vizinha. As duas contas não fecham, e a diferença é cor errada no desenho.

Agora a paleta é reatribuída e recalculada algumas vezes, até parar de se mexer.
É barato porque roda em cima do **histograma** — alguns milhares de cores, cada
uma com o peso dela —, e não dos pixels: o laço pesado, o de atribuir ponto a
ponto, continua rodando uma vez só. O tempo não muda de forma medível.

Em arte chapada não muda nada, e isso é esperado: ali as caixas do corte da
mediana já batem com o resultado, e a conta para na primeira passada. O ganho
está onde a cor é contínua — que é justamente onde este gerador era mais fraco:

| | erro antes | erro depois | iguais antes | iguais depois |
|---|---|---|---|---|
| logo | 1,45 | 1,45 | 96,5% | 96,5% |
| arte de camiseta | 7,55 | 7,55 | 88,8% | 88,8% |
| desenho com sombreado, 4 cores | 14,21 | **8,80** | 61,1% | **63,6%** |
| desenho com sombreado, 8 cores | 7,23 | **5,16** | 65,1% | **67,1%** |
| desenho com sombreado, 16 cores | 3,65 | **2,56** | 72,3% | **80,2%** |

Junto com o conserto do arco, medido em quatro trabalhos numa rodada só:

| | erro | pontos iguais | nós | arquivo |
|---|---|---|---|---|
| logo, suavidade 0,4 | 3,13 → **1,25** | 95,8% → **96,6%** | 822 → 874 | 11,3 → **11,2 KB** |
| arte de camiseta, suavidade 0,4 | 6,99 → **6,58** | 89,6% → **89,9%** | 6473 → 7455 | 86,7 → 88,7 KB |
| desenho com sombreado, suavidade 0,4 | 7,20 → **5,09** | 65,0% → **67,0%** | 1027 → **984** | 9,3 → **8,8 KB** |
| avião, suavidade 0,4 | 0,94 → **0,82** | 97,1% → **97,2%** | 12178 → 13757 | 166 → 172 KB |

Os nós a mais são arcos que agora são **recusados** com razão e viram curva. É o
preço de estar certo, e é pequeno: 3% de arquivo.

#### Olhar de perto, e sem travar

Duas coisas que não são conta, e que mudam o uso.

**A lupa.** Duas prévias do tamanho de um cartão dizem se as cores estão certas e
mais nada — e o que separa "traçado" de "vetorizado" mora na borda, que naquele
tamanho não se enxerga. Agora a roda do mouse aproxima até 20×, no ponto onde o
ponteiro está, e arrastar move; as duas prévias andam **juntas**, com o mesmo
estado, porque comparar duas imagens que se mexem cada uma para um lado não é
comparar nada. De perto o pixel da imagem original aparece inteiro (de longe
não, senão a redução da tela sai serrilhada e o serrilhado passa por defeito do
arquivo).

Isso já cobrou o primeiro conserto: a imagem original estava com `max-width`, que
encolhe uma imagem grande mas **não aumenta** uma pequena. Um logo de 442 pontos
numa caixa de 624 ficava no tamanho dele enquanto o vetor ao lado ocupava a caixa
inteira — as duas prévias em escalas diferentes, exatamente o que a lupa não pode
ter. As duas passaram a usar `object-fit: contain`, que é o que o SVG já fazia
sozinho com o viewBox dele.

**A tela não trava.** A conta rodava na thread da página, e como cada mexida num
controle refaz o desenho, o travamento não acontecia uma vez — acontecia toda
vez. Agora ela roda no `vetor-worker.js`, e os pixels vão transferidos, sem
cópia. Medido com uma batida contínua na thread da tela (o maior intervalo entre
duas batidas é o tempo que ela ficou parada; em repouso dá 5 ms):

| | tempo total | tela parada |
|---|---|---|
| logo 442 × 442, na tela | 165 ms | 165 ms |
| logo 442 × 442, no worker | 132 ms | **6 ms** |
| arte 1260 × 1260, na tela | 1089 ms | 1089 ms |
| arte 1260 × 1260, no worker | 1007 ms | **8 ms** |

O trabalho é o mesmo; o que muda é onde ele acontece. Se o navegador não deixar
criar o worker, a tela chama a conta direto — o arquivo já está carregado nela de
qualquer jeito.

**Os atalhos.** Seis controles em fila são muitos para quem só quer o logo do
cliente vetorizado. *Logo e arte chapada*, *Silhueta para faca*, *Arte com
sombra* e *Detalhe fino* deixam o ajuste pronto e refazem o desenho; cada um saiu
das medidas acima, e continua sendo ponto de partida — mexer em qualquer controle
depois refaz como sempre.

Cada atalho diz o ajuste **inteiro**, inclusive o "Tirar o fundo", e isso saiu de
um erro: com o fundo ligado por conta de quem clicou, uma cor só numa arte de
fundo branco é a imagem inteira, e a silhueta saía como o retângulo do arquivo —
quatro retas e nada dentro. Quando não há fundo reconhecível para tirar (arte que
sangra até a borda), o rodapé agora **diz isso**, em vez de deixar o retângulo
sem explicação.

E dá para **copiar o SVG** em vez de baixar: SVG é texto, e colar direto no
CorelDRAW ou no Illustrator poupa a viagem pela pasta de downloads.

Tudo roda no navegador: a imagem não sobe para o servidor e não fica salva.

## Estrutura do projeto

```
optimize/
├── server.js               # backend: Express — serve o painel e monta as rotas da API
├── encaixe-pdf.js           # rota que monta o PDF do encaixe em tamanho real
├── encaixe-memoria.js       # o que a tela de Encaixe aprendeu: recordes, placar das receitas e o melhor encaixe guardado inteiro
├── moldes-api.js            # rotas da biblioteca de moldes (guardar, reabrir, apagar)
├── projetos-api.js          # rotas dos projetos de cliente: cliente -> projeto -> peças prontas
├── db.js                     # conexão SQLite + criação das tabelas
├── caminhos.js               # onde ficam o banco e os uploads (pasta do projeto ou do usuário)
├── src-tauri/                # o app de janela: só sobe o servidor e abre a janela nele
│   ├── src/main.rs           # arranca o node.exe embutido numa porta livre e navega para ela
│   ├── tauri.conf.json       # o que entra no instalador, o ícone, o nome
│   └── icons/                # gerados por `npx tauri icon` a partir de empacotar/icone.png
├── empacotar/
│   ├── preparar.js           # junta servidor + node.exe em src-tauri/servidor antes do build
│   ├── icones.js             # gera public/icones.svg com os ícones do Lucide que a tela usa
│   ├── icone.png             # a marca de onde saem todos os ícones
│   └── janela/               # as duas telas do app antes do servidor subir: abrindo e erro
├── wasm/
│   ├── Cargo.toml            # o módulo Rust do laço quente do encaixe
│   └── src/lib.rs            # descer a peça pelo relevo do tecido, em WebAssembly
├── src/                      # a tela nova: React + TypeScript (ver docs/ARQUITETURA.md)
│   ├── App.tsx               # a casca: menu + cabeçalho + a tela da vez
│   ├── rotas.ts              # a tabela das telas — uma linha por aba
│   ├── casca/                # Menu, Cabecalho, Cartao, Icone: o que toda tela usa
│   ├── telas/                # uma por aba, conforme migram
│   ├── api/                  # o fetch num lugar só, com os três estados de carga
│   └── nucleo/               # domínio puro: sem DOM, sem React, roda em worker
├── estilo/
│   ├── tokens.css            # a paleta — o único arquivo com hex no projeto
│   └── entrada.css           # traduz os tokens em utilitários do Tailwind
├── estatico/                 # servido como está pelas duas telas
│   ├── icones.svg            # gerado por `npm run icones`
│   └── encaixe.wasm          # gerado por `npm run build:wasm`
├── public/                   # a tela ANTIGA — some quando a migração terminar
│   ├── index.html           # tela do sistema (4 abas)
│   ├── style.css             # estrutura das telas — sem nenhuma cor própria
│   ├── interface.css         # a paleta Optimize, a tipografia e o responsivo
│   ├── tailwind.css          # gerado por `npm run css` — só os utilitários usados
│   ├── interface.js          # menu lateral, troca de tela e relógio
│   ├── moldes.js              # leitores de DXF, PLT, SVG e PDF: molde vetorial vira peça em centímetros
│   ├── encaixe.js             # tela de Encaixe: a tela, o desenho e quem manda na busca
│   ├── encaixe-motor.js       # os encaixadores (contorno, caixa, faixas) e a busca por receitas
│   ├── encaixe-mascara.js     # silhueta da arte: tira o fundo, engorda pela folga e vira grade
│   ├── encaixe-prepara.js     # prepara as peças antes da busca (máscaras, rotações, duplas)
│   ├── prepara-worker.js      # o preparo fora da thread da tela
│   ├── encaixe-paralelo.js    # espalha a busca pelos núcleos e junta o melhor de cada fatia
│   ├── encaixe-worker.js      # uma fatia da busca, rodando fora da tela
│   ├── encaixe-wasm.js        # a ponte com wasm/src/lib.rs (cai no JavaScript se não carregar)
│   ├── encaixe.wasm           # gerado por `npm run build:wasm`
│   ├── nfp.js                 # encaixe por polígono de não-encaixe (uma fatia da busca é dele)
│   ├── vetor.js               # imagem vira desenho: paleta, contorno e curva
│   ├── vetor-worker.js        # a vetorização fora da thread da tela
│   ├── vetor-tela.js          # tela de Vetor: os controles, a lupa e as duas prévias
│   ├── arte-molde.js          # coloca a arte dentro do contorno da peça e recorta pela linha
│   ├── moldes-tela.js         # tela de Moldes: o passo a passo de criar molde e a estante
│   └── projetos.js            # tela de Projetos: a estante por cliente e o editor do projeto
├── package.json
├── dados.db                  # gerado no primeiro uso — moldes e memória do encaixe (SQLite)
├── uploads/artes-molde/      # gerado ao salvar a 1ª estampa — artes guardadas nos moldes
└── uploads/projetos/         # gerado ao mandar a 1ª arte — as peças prontas dos projetos
```

## Gerando o instalável (Windows)

O sistema também sai como um programa de verdade: um `.exe` que instala, cria
atalho no menu iniciar e abre numa janela própria, sem navegador e sem terminal.
Por dentro continua sendo o mesmo servidor Express — o [Tauri](https://tauri.app)
é só a casca de janela, e o `node.exe` vai embutido no instalador (quem usa não
precisa ter Node instalado).

Escolhi Tauri e não Electron pelo peso: a janela usa o WebView2 que já vem no
Windows 10/11, então o instalador fica em ~25 MB em vez dos ~150 MB que o
Chromium embutido do Electron custaria.

### O que precisa na máquina que compila

- [Rust](https://rustup.rs/) (o `rustup` padrão já basta) — é a linguagem da
  casca de janela.
- **Build Tools do Visual Studio** com a carga "Desenvolvimento para desktop
  com C++" — é o que liga o executável no Windows.
- Node 24+. **A versão do Node que compila é a que vai dentro do
  instalador**: o `empacotar/preparar.js` copia o `node.exe` que está
  rodando o build e refaz a cópia sempre que a versão da máquina muda —
  atualizou o Node, o próximo instalador já sai com ele.

### Compilando

```bash
npm install
npm run build:app
```

O instalador sai em
`src-tauri/target/release/bundle/nsis/Optimize_2.0.0_x64-setup.exe`.

A primeira compilação leva alguns minutos (o Rust baixa e compila as
dependências do Tauri uma vez); as seguintes ficam em torno de um minuto e
meio. Para mexer no app de janela sem gerar instalador, `npm run app` abre a
janela em modo de desenvolvimento.

Para desenvolver o sistema em si nada muda: `npm start` e o navegador continuam
sendo o caminho mais rápido.

### Onde ficam os dados do programa instalado

Rodando por `npm start`, o `dados.db` e a pasta `uploads/` ficam na pasta do
projeto, como sempre foram.

Instalado, eles vão para **`%APPDATA%r.com.optimize.desktop`**. Não é
capricho: o programa fica numa pasta que o Windows protege contra escrita, e
gravar o banco lá dentro ou falha, ou o Windows desvia a escrita para uma pasta
virtual e os dados somem na primeira atualização. Quem decide isso é o
`caminhos.js`, pela variável `OPTIMIZE_DADOS`.

**É essa a pasta do backup.** Desinstalar não a apaga, mas trocar de máquina
sim: copie ela inteira.

## Próximos passos possíveis

- Encaixar a grade de tamanhos junta (P, M e G no mesmo risco), que é de onde
  os programas profissionais tiram os últimos pontos de aproveitamento: as
  peças de tamanhos diferentes preenchem a sobra da fileira umas das outras.
- Aproveitar o vazado fechado de uma peça para encaixar peça pequena dentro.
- Mostrar na tela o histórico de encaixes de cada tipo, para acompanhar a
  melhora ao longo do tempo (os dados já são guardados).
