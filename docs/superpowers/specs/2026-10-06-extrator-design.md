# O Extrator — a foto vira cada logo, texto e estampa separados

Data: 2026-10-06 · Estado: design aprovado em conversa, parte por parte; falta
a revisão desta spec escrita.

## Por que

O pedido: uma área nova para a produção de arte, parecida com o Extrator do
subliai.com ("mande a foto e receba cada logo, texto e estampa separados e em
4K"). Só o Extrator: o gerador de imagem, o mockup 3D e a biblioteca do site
ficam para outro programa.

O caso da fábrica: o cliente manda a foto de uma camisa pronta (ou um mockup,
um print) e quer a mesma arte de novo. Hoje alguém redesenha no Corel.

## O que foi decidido em conversa

- **Tudo no computador.** Sem IA na nuvem, sem custo por imagem, sem internet.
  A consequência foi dita em voz alta: o que a rede local faz é separar,
  recortar, endireitar e ampliar — ela não "redesenha" um logo amassado como a
  IA generativa do site. Para cor chapada, juntar as cores apaga a sombra e a
  dobra, e o vetor fica limpo; para foto, a dobra continua lá.
- **A foto que chega:** metade camisa fotografada (dobra, luz, perspectiva),
  metade imagem digital (mockup, print do WhatsApp).
- **A saída:** vetor (SVG e EPS) e PNG transparente grande.
- **O operador clica no que quer:** o programa recorta o que foi clicado, o
  operador corrige com mais cliques e acerta os 4 cantos quando a foto está
  torta. Não é automático de ponta a ponta.
- **Abordagem B:** uma rede de recorte por clique (da família do Segment
  Anything, versão leve) rodando local. Foi escolhida contra (A) separar só
  pela cor, que falha em foto de tecido, e (C) começar pela A, que seria
  refeita.

## O que o programa já tem

- **O Vetor e a Imagem saíram em 2026-09-21** (`f569e1a`, `0659ecf`) porque
  ninguém usava — não por qualidade. O `vetor.js` (1.209 linhas: corte da
  mediana, divisas de cor, curvas) e o worker do Real-ESRGAN
  (`realesr-general-x4v3`, ladrilho de 128 px com margem) estão no histórico.
- **O servidor já roda ONNX:** o reconhecimento facial (`servidor/rostos.js`)
  usa o `onnxruntime-node`, e o `npm run modelos` (`empacotar/modelos.js`)
  baixa os pesos com tamanho e sha256, fora do git; o `lancar.yml` roda esse
  passo antes de compilar o instalador.
- **O `sharp`** desenha SVG (rsvg), e o "a borda é o fundo" do
  `moldeDaImagem.js` e o tirar fundo do Encaixe separam a arte da cor de baixo.
- **A máquina:** i5-8400 (6 núcleos), 32 GB, vídeo integrado (UHD 630). A
  ampliação antiga levava cerca de um minuto numa imagem de 1500 × 1500.
- **Não há biblioteca de ZIP** nas dependências.

## 1. A tela e o fluxo

Tela nova **Extrator**, no grupo **Produção**, junto do Digitalizar: uma linha
em `src/rotas.ts`, como toda tela.

1. **Mandar a foto** (JPG, PNG, WebP). Enquanto ela aparece, o servidor lê a
   foto com a rede, com aviso na tela.
2. **Endireitar (opcional).** O operador arrasta 4 cantos sobre a área da
   estampa e a foto é desentortada (perspectiva de um plano). Endireitar troca
   a foto, então a leitura da rede é refeita.
3. **Separar.** Clique esquerdo **inclui** (ponto verde), clique direito
   **exclui** (ponto vermelho), arrastar faz uma **caixa**. A máscara aparece
   sobre a foto a cada clique. **Guardar elemento** põe o recorte na lista do
   lado, com miniatura e nome editável (Logo 1, Texto 2…), e limpa os pontos
   para o próximo.
4. **Limpar e baixar.** Cada elemento tem um de dois jeitos, que o programa
   sugere pela quantidade de cores e o operador troca:
   - **Chapado** (logo, texto, brasão): junta as cores parecidas num número
     pequeno (a paleta aparece, com mais e menos), vetoriza e sai em **SVG**,
     **EPS** e **PNG transparente**.
   - **Foto** (degradê, rosto, foto): amplia com o Real-ESRGAN e sai só em
     **PNG transparente**.
   - O PNG sai, por padrão, com o lado maior em **4096 px**; o operador pode
     pedir **por medida** (cm, a 300 dpi).
   - Baixa um elemento por vez ou **todos num ZIP**.

## 2. Onde cada coisa roda

**A rede roda no servidor**, como o reconhecimento facial: o
`onnxruntime-node` usa os 6 núcleos em código nativo, e a tela não trava.

`servidor/extrator-api.js`, montado em `/api/extrator`:

| Rota | Faz |
|---|---|
| `POST /ler` | recebe a foto (já endireitada, se for o caso), roda o **codificador** da rede de recorte uma vez e guarda o resultado em memória com um id (expira em 30 min sem uso) |
| `POST /mascara` | id + pontos (inclui/exclui) + caixa → roda o **decodificador**, que é leve, e devolve a máscara |
| `POST /ampliar` | o elemento recortado → Real-ESRGAN em ladrilhos → PNG (o jeito Foto) |
| `POST /png` | SVG + tamanho → PNG transparente desenhado pelo `sharp` (o jeito Chapado) |

**Os modelos** (a rede de recorte e o Real-ESRGAN) entram na lista do
`empacotar/modelos.js`, com tamanho e sha256, em `servidor/modelos/`,
ignorados no git. O lançamento já roda `npm run modelos`.

**Motores** (`src/motores/`, conta pura, sem DOM, testáveis na bancada):

- `perspectiva.js` — os 4 cantos → a homografia → a foto desentortada.
- `vetor.js` — volta do git **sem mudar conta nenhuma**: junta as cores,
  acha as divisas, passa curva.
- `vetorParaArquivo.js` — escreve o SVG e o EPS a partir das curvas.
- `recorte.js` — aplica a máscara na foto original, em resolução cheia, e
  limpa a borda tirando a cor de baixo que sobrou (a separação pela cor, como
  ajuda e não como seleção).

**Tela:** `src/telas/Extrator.tsx` e `src/telas/extrator/` (a mesa com foto,
máscara e cantos; a lista de elementos; o painel de limpeza); o cliente em
`src/api/extrator.ts`. O ZIP sai na tela pelo `fflate` (MIT, pequeno).

**O caminho de uma foto:**

```
foto ─(4 cantos → perspectiva.js)─▶ /ler ─▶ cliques ─▶ /mascara ─▶ Guardar
  ─▶ recorte.js (PNG transparente, resolução da foto)
       ├─ Chapado: vetor.js ─▶ vetorParaArquivo.js (SVG/EPS) ─▶ /png (4096 px)
       └─ Foto:    /ampliar ─▶ PNG
```

**A rede de recorte sai de uma medição, e não de palpite.** O primeiro passo do
plano compara MobileSAM, SlimSAM e EfficientSAM nas fotos reais, nesta
máquina: tempo do codificador e do decodificador, e quanto a máscara cobre o
elemento contra um gabarito feito à mão. Fica a de melhor recorte com o
codificador em até ~6 s por foto. A licença de cada uma (Apache 2.0, pelo que
se sabe; o Real-ESRGAN é BSD-3) é conferida no mesmo passo e escrita no
`empacotar/modelos.js`, como a dos modelos do rosto.

## 3. Quando dá errado

| Situação | A tela |
|---|---|
| Modelos ausentes | "A rede do Extrator não está instalada" com o comando; endireitar e vetorizar um PNG já recortado continuam funcionando |
| Foto acima de ~40 megapixels | recusa, com a medida, em vez de travar o servidor |
| Foto ilegível | diz qual arquivo e por quê |
| Id da leitura vencido (ou servidor reiniciado) | a tela refaz o `/ler` sozinha e repete o clique, sem erro na cara do operador |
| Máscara vazia, ou a foto inteira | "A rede não achou nada aqui; clique mais perto do elemento", e não guarda |
| Chapado com mais de ~12 cores depois de juntar | sugere trocar para Foto |
| Ampliação | barra por ladrilho e botão de cancelar (pode passar de um minuto) |

Toda falha do servidor chega com mensagem em português, como o `riscoApi`
(estoura com a mensagem do servidor, em vez de devolver `null`).

## 4. Como se prova

- **`bancada:extrator`** (sem navegador, sem modelos; entra no Conferir):
  - os 4 cantos de um quadrado conhecido voltam ao quadrado, ao pixel;
  - o `vetor.js` dá o mesmo resultado da versão do git (`f569e1a^`) em
    imagens sintéticas;
  - o SVG e o EPS abrem e têm o número de cores certo (o SVG desenhado pelo
    `sharp`; o EPS conferido pelo cabeçalho e pelos caminhos);
  - o recorte com máscara deixa transparente o que está fora dela.
- **`bancada:extrator-rede`** (precisa dos modelos e das fotos; local):
  em cada foto real, o clique conhecido dá uma máscara que cobre o elemento
  (área comparada com o gabarito), e o `/ler` fica em até 6 s por foto.
- **`bancada:tela`**: o fluxo inteiro no navegador — manda a foto, clica,
  guarda, baixa o SVG e o PNG, e confere os arquivos.

**As fotos de teste:** 8 a 10 reais, metade camisa fotografada e metade mockup
ou print, fora do git (como as artes da Reposição), numa pasta que a pessoa
indicar. **Pendente:** a pasta ainda não foi passada.

## Fora deste trabalho

Guardar o trabalho do Extrator para abrir depois (o resultado são os arquivos
baixados); editar os nós do vetor (é no Corel); reconhecer texto e fonte (o
texto vira forma); TIFF CMYK com perfil ICC; separação automática sem clique;
mandar o elemento direto para o Encaixe ou a Galeria.
