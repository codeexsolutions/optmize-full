# Encolher o rolo — o sparrow dentro do motor de encaixe

Data: 2026-09-21 · Estado: aprovado (fluxo) e delegado (detalhes)

## Por que

O motor monta o encaixe peça por peça e sacode a ordem da fila. Esse jeito de
encaixar chegou num platô: no pedido de produção `producao-avulsa` (175 peças,
rolo de 179 cm, folga de 4 mm) ele fecha em **32,300 m** com 3 s por fatia e nos
**mesmos 32,300 m** com 300 s. A varredura de 17/09 já tinha mostrado que ajuste
de busca não rende mais; faltava saber se havia tecido para ganhar de outro
jeito.

Medição de 2026-09-21, 5 minutos de cada lado, mesmo pedido:

| quem | metros | contra hoje |
|---|---|---|
| nosso motor | 32,300 | — |
| sparrow nas máscaras do motor (escada de células de 0,2 cm) | **31,394** | **−2,8%** |
| sparrow nos contornos exatos, folga 0,4 cm | 31,154 | −3,6% |

O resultado nas máscaras passou pela trava da produção (`acharSobreposicao`)
sem nenhum par sobreposto e sem ajuste. O sparrow
(github.com/JeroenGar/sparrow, licença MIT, sobre o jagua-rs, MPL-2.0) encaixa
por outro princípio: parte de um encaixe pronto, encurta o rolo, deixa as
peças que ficaram de fora entrarem por cima das outras e vai empurrando e
virando peça até a sobreposição sumir; conseguindo, encurta de novo.

Compilado para WebAssembly e rodando numa thread só, ele funciona sem mexer no
código dele (o rayon cai sozinho para a thread atual em wasm32) e, partindo do
zero, passa os 32,300 m em ~28 s.

## Decisão

**Embutir o sparrow em WebAssembly, nos workers que o motor já usa**, como uma
segunda fase depois da busca de hoje. Descartados:

- escrever um encolhedor próprio: semanas de trabalho para tentar chegar onde o
  sparrow já chega, sem garantia;
- rodar o sparrow nativo pelo Tauri: mais rápido, mas só existiria no
  aplicativo — a bancada e o navegador ficariam de fora. Fica como saída se o
  WASM se mostrar lento demais.

Os 0,8% da diferença entre máscara e contorno exato ficam para depois: exigem
que a trava da produção passe a conferir contorno em vez de célula.

## Fluxo

O botão **Optmizar** não muda para o operador. Dentro do tempo de procura `T`:

1. **Busca de hoje**, inalterada, com `t1 = min(T, max(3 s, min(20 s, 15% de T)))`.
   Ela satura cedo (3 s já dão os 32,300 m); o que sobra é o tempo do sparrow.
2. **Encolher o rolo**: o melhor encaixe da busca vai para todos os workers.
   Cada um roda o sparrow com uma semente diferente, partindo desse encaixe,
   pelo resto do tempo. Cada encaixe válido mais curto volta na hora — a tela
   mostra a metragem caindo.
3. **Fica o melhor**: cada encaixe do sparrow é convertido para a grade e só
   vale se passar pela validação (abaixo). Se nenhum passar, fica o da busca.
   **Nunca sai pior que hoje.**

A divisão do tempo e o tempo sugerido pela tela são ajustados pela medição
(ver "Medição"), e não fixados no chute.

## Componentes

| unidade | o que faz | depende de |
|---|---|---|
| `wasm-encolher/` (Rust) | embrulha o sparrow (fixado no commit medido, `7f0e10f`): `encolher(instancia, partida, tempo_ms, fracao_compressao, semente, separacao, trabalhadores, relatar)` → JSON do melhor encaixe; `relatar(json, largura)` a cada encaixe válido mais curto | sparrow, jagua-rs, wasm-bindgen |
| `estatico/encolher_bg.wasm` + `src/motores/encolher/encolher.js` | o compilado e a cola do wasm-bindgen, versionados como o `encaixe.wasm` — o build do app não precisa de Rust | `npm run build:encolher` |
| `src/motores/encaixeEncolher.js` | a ponte, em funções puras: quem pode encolher, tipos de peça, contorno em escada, instância, partida, conversão de volta, validação; mais o carregador do WASM | `encaixeMotor`, `encaixeSobreposicao` |
| `encaixeWorker.js` | mensagem nova `encolher`: roda a ponte, manda cada encaixe válido (`encolhido`) e o final | ponte |
| `encaixeParalelo.js` | a segunda rodada: divide o tempo, reparte sementes, guarda o último `encolhido` de cada worker, encerra os workers ao parar | worker |
| `controlador.js` | fase `encolhendo` no andamento; o resultado diz quanto o rolo encolheu | — |
| `bancada/corrida.js`, `medir.js` | a corrida "como a produção" ganha a segunda fase (`--extra encolher=true`) | ponte |
| `bancada/conferir-encolher.js` | prova que o que volta do sparrow é válido na grade, com giro 180 e livre | ponte |

## A tradução

- **Tipos de peça**: um tipo do sparrow por balde de `agruparPorSilhueta`
  (mesma silhueta e mesmo giro), com a demanda = número de cópias. No pedido
  de produção, 155 arquivos viram 5 tipos. Na volta, as colocações de um tipo
  são distribuídas pelas peças do balde, na ordem.
- **Forma**: o contorno em escada da máscara de 0° (topo/base por coluna,
  células inteiras), transposto — o comprimento do rolo é o eixo que o sparrow
  encolhe, a largura do rolo é o `strip_height` (em células). A folga já está
  dentro da máscara. Coluna vazia no meio da peça (arte partida) ganha uma
  ponte de uma célula: engordar a forma nunca cria sobreposição.
- **Giro**: as rotações úteis da peça (`rotacoesUteis`). A transposição inverte
  o sentido: 0°→0°, 90°→−90°, 180°→180°, 270°→90°.
- **Partida**: o encaixe da busca, na mesma tradução, com o rolo do tamanho do
  consumo dele mais uma célula.
- **Separação mínima de 0,01 célula**: com ela, arredondar a origem de cada
  peça para a célula mais próxima não cria sobreposição (folga positiva num
  eixo continua ≥ 0 depois do arredondamento). As peças da partida se encostam
  e ficam 0,01 "sobrepostas" para o sparrow; a primeira separação dele desfaz
  isso com passos mínimos.
- **Validação da volta**: todas as peças colocadas, uma vez cada; todas dentro
  do rolo; a trava da produção sem nenhum par. Encaixe que falhar é ignorado e
  vale o último bom.

## Parar, prazo e falhas

- A chamada ao WASM é síncrona e dura o tempo inteiro: o worker não lê
  mensagem enquanto roda. Por isso todo encaixe válido é mandado na hora, e o
  botão de parar ENCERRA os workers da rodada — o que já chegou fica. O pool é
  refeito na próxima busca (mesma regra do prazo duro de hoje).
- WASM que não carregar, sparrow que quebrar, worker que calar: a rodada sai
  sem aquele worker; sem nenhum, fica o resultado da busca. O motivo vai no
  resultado (`encolhimento.motivo`) — queda silenciosa foi o que já escondeu
  defeito neste motor, então ela é registrada e a bancada falha se a fase
  pedida não rodou.
- **Fora da primeira versão** (fica o resultado da busca, com o motivo):
  bancada ligada (peça não pode cruzar a linha da mesa), grupos marcados (o
  sparrow espalharia o grupo), peça que não coube na busca.

## Medição (critério de aceite)

Regra da casa: o que decide é metro no pedido grande
(`producao-avulsa`, `lote-grande`, `lote-enorme`, com
`--extra motores=contorno+retangulo+vaos+faixas`), com a máquina livre e as
duas corridas seguidas. Os seis lotes padrão são contraprova de regressão.

- A segunda fase tem de ganhar nos três grandes, no mesmo tempo total.
- Nos seis padrão, nenhuma piora acima do ruído (~0,25% na soma).
- `bancada:sobreposicao`, `bancada:conferir` e a conferência nova sem falha.
- A curva metro × tempo do WASM decide `t1` e o tempo sugerido pela tela.
