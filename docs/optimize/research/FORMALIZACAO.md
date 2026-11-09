# Formalização do problema do Optimize

**Autor:** Claude · **Data:** 2026-11-09 · **Estado:** proposta, aguardando revisão do Codex

Este documento escreve em matemática o problema que a loja precisa resolver e,
separado dele, o problema que o motor resolve de fato. A distância entre os dois
é o que a representação custa, e os limites inferiores do §5 dão uma medida
provada dessa distância.

---

## 1. O problema da loja (contínuo)

**Dados.**

- Largura útil do tecido $W > 0$ (cm). Comprimento livre (rolo) ou fatiado em
  bancadas de comprimento $B > 0$.
- Folga mínima entre peças $s \ge 0$. A borda do tecido não leva folga
  (decisão do produto, ver `raioDaBorda`).
- Peças $i = 1..n$, cada uma com forma $P_i \subset \mathbb{R}^2$ compacta
  (a silhueta: alfa ≥ 8 na arte, ou o contorno vetorial), quantidade $q_i$ e
  conjunto de giros permitidos $\Theta_i \subseteq \{0, 90, 180, 270\}$. Não há
  espelhamento no produto hoje.
- Opcional: grupos $G_k$ (peças que devem sair perto umas das outras) e a
  regra de bancada.

**Decisão.** Para cada cópia $j$ de cada peça, um giro $\theta_{ij} \in \Theta_i$
e uma translação $t_{ij} \in \mathbb{R}^2$. A cópia ocupa
$P_{ij} = R(\theta_{ij}) P_i + t_{ij}$.

**Restrições.**

1. **Contenção:** $P_{ij} \subseteq [0, W] \times [0, L]$.
2. **Folga:** $\operatorname{dist}(P_{ij}, P_{kl}) \ge s$ para toda dupla
   de cópias distintas. Com $s > 0$, isso equivale a dizer que as engordadas
   $P_{ij} \oplus D_{s/2}$ têm interiores disjuntos ($D_r$ é o disco de raio $r$).
3. **Bancada** (se $B > 0$): nenhuma peça cruza uma linha $y = kB$. No código
   o que não pode cruzar é o **retângulo da arte**, que é o que se imprime, e
   não só a silhueta (`sobraDaArte`).
4. **Giro:** $\theta_{ij} \in \Theta_i$.

**Objetivo, em ordem lexicográfica** (nunca se troca um nível de cima por um
ganho no de baixo):

1. viabilidade geométrica (restrições 1–4);
2. todas as cópias colocadas (o número de peças de fora é zero);
3. **menor mídia consumida** $M$: sem bancada, $M = L$; com bancada,
   $M = (b - 1)B + \ell_b$, onde $b$ é o número de bancadas e $\ell_b$ é o que
   a última usa (`midiaConsumida`);
4. desperdício irrecuperável (por exemplo, o vão que nenhuma peça do
   catálogo do cliente cabe — ainda não modelado);
5. tempo de cálculo;
6. preferências (grupos juntos, peças do mesmo pedido próximas).

Os grupos hoje entram como **regra do encaixador** (as peças do grupo entram
grudadas na fila), e não como restrição: uma solução sem grupo junto é
viável, só pior no nível 6.

**Aproveitamento.**

$$\eta = \frac{\sum_{i} q_i\,A(P_i)}{W \cdot M}$$

com $A(P_i)$ a área **verdadeira** da silhueta. O código usa a área da máscara
na grade (`areaReal`), que em vetor passa a verdadeira em 0,3% a 12% por peça
(ver o `GEOMETRY_AUDIT-CLAUDE.md`, §2). Proposta: relatar $\eta$ com a área
verdadeira, a da arte em resolução cheia (cobertura de alfa) ou a do polígono.

## 2. As três famílias de problema

| Situação | Problema | Objetivo |
|---|---|---|
| rolo sem bancada | *irregular strip packing* (ISPP) | min $L$ |
| rolo com bancada $B$ | sequência de chapas de tamanho $W \times B$ (*multiple bin packing* com a última parcial) | min $(b-1)B + \ell_b$ |
| chapa fixa (madeira, metal) | *bin packing* irregular | min número de chapas, depois a sobra útil |

As três são NP-difíceis (o ISPP contém o *bin packing* unidimensional como caso
particular). Não há o que esperar de prova de ótimo em escala de produção: o
que dá para certificar são **limites inferiores** (§5).

**O preço da bancada, medido.** No `producao-avulsa` (175 peças, 179 cm, 4 mm),
a regra "nenhuma peça cruza $y = kB$" com $B = 3$ m custou ~1,6% de mídia na
busca, e desligou o sparrow, que rendia mais ~2,1% (`conferir-escala.js
--teste bancada`, 1 semente). A primeira parcela é do problema; a segunda é do
motor (P5).

## 3. O problema que o motor resolve (discreto)

O motor troca o contínuo por uma grade de passo $h$ (`grade`, com
$h = \frac{s}{2m}$ para algum inteiro $m \ge 1$, limitado por
$[W/1000,\ \mathrm{clamp}(W/300, 0{,}2, 1)]$).

- Cada peça vira, para cada giro, um conjunto de células $S_i^\theta$: toda
  célula que a silhueta toca, que é uma **aproximação por fora**.
- A folga vira o engorde $E_i^\theta = S_i^\theta \oplus K_m$, onde $K_m$ é o
  "disco" discreto de `discoDoRaio(m)`, o menor que garante distância entre
  **quadrados** (no raio 1, o quadrado 3×3).
- A **pegada** usada pelo encaixe é o fecho coluna-convexo:
  $F_i^\theta = \{(c, r) : \min_r E \le r \le \max_r E \text{ na coluna } c\}$.
- O tecido tem $C = \lfloor W/h \rfloor + 2m$ colunas (a borda absorve o
  engorde). As pegadas não podem dividir célula.
- O consumo é o fundo em células, menos $2m$, vezes $h$.

**Correção (soundness).** Toda solução do motor é viável para a loja: a
pegada contém a silhueta engordada, e o disco garante a folga entre quadrados.
O inverso não vale: existem arranjos viáveis que o motor não enxerga (a peça
na cava de outra, por exemplo). O motor é **conservador e incompleto**, e o
preço da incompletude tem limite medido no §5.

**A fase do sparrow** resolve o mesmo modelo, com o polígono em escada de
$F_i^\theta$ em coordenadas reais (f32), separação mínima de 0,01 célula, e a
volta é arredondada para a grade e conferida.

## 4. A busca, em termos clássicos

- **Codificação por ordem + decodificador** (estilo Jakobs/BLF): uma
  permutação $\pi$ das unidades e uma receita $\rho$ (decodificador e
  heurística) definem uma solução $D_\rho(\pi)$ deterministicamente.
- A busca é uma **ILS** (busca local iterada) sobre $(\rho, \pi)$: perturbação
  por trocas com força adaptativa, reparo dirigido à pior unidade, aceitação
  "só melhora" e duas regimes (explorar a partir da ordem crua; refinar a partir
  da melhor ordem guardada), alternados quando a busca empaca.
- A escolha de $\rho$ é um **bandit com contexto rudimentar**: o contexto é a
  assinatura do trabalho (baldes) e o vetor da rede; o placar vem da memória;
  a poda é uma eliminação sucessiva com fresta de exploração (15%).
- A segunda fase é **minimização de sobreposição com encolhimento**
  (Egeblad et al.; Gardeyn & Wauters, sparrow): partindo de uma solução
  viável, encurta $L$, aceita sobreposição e a remove por busca local guiada.

## 5. Limites inferiores (provados)

Para qualquer solução viável da loja, com $r = s/2$:

**(LB_area)** As peças não se sobrepõem e cabem em $W \times L$:
$$L \ge \frac{\sum_i q_i A(P_i)}{W}.$$

**(LB_BM)** As engordadas $P_{ij} \oplus D_r$ têm interiores disjuntos e cabem
em $[-r, W + r] \times [-r, L + r]$. Pela desigualdade de Brunn–Minkowski no
plano, $\sqrt{A(P \oplus D_r)} \ge \sqrt{A(P)} + \sqrt{A(D_r)}$, então
$$L \ge \frac{\sum_i q_i \left(\sqrt{A(P_i)} + r\sqrt{\pi}\right)^2}{W + 2r} - 2r.$$
É mais forte que o LB_area quando $s > 0$, e vale para qualquer forma, convexa
ou não. É frouxo de propósito: ignora a incompatibilidade de formas.

**(LB_modelo)** Para o motor, as pegadas $F$ não dividem célula e cabem em $C$
colunas:
$$L_{\text{motor}} \ge h\left(\frac{\sum_i q_i \min_{\theta \in \Theta_i} |F_i^\theta|}{C} - 2m\right).$$

A razão $\mathrm{LB\_modelo}/\mathrm{LB\_BM}$ é um piso para o quanto a
representação custa em relação à geometria verdadeira. Medida na bancada
(`bancada/auditar-geometria.js`): **de 1,1% (uniformes, 4 mm) a 13,5% (peças
pequenas, 10 mm)**.

**Como ler o gap.** $\mathrm{gap} = (M_{\text{achado}} - \mathrm{LB})/\mathrm{LB}$
é um **teto** para a melhoria possível, não uma promessa. Um gap grande pode
ser só um limite frouxo.

## 6. Invariâncias que o motor deve respeitar (testáveis)

| Invariância | Enunciado | Teste |
|---|---|---|
| Translação ao longo do rolo | começar o rolo $K$ linhas adiante desloca tudo em $K$, sem mudar coluna nem giro | `bancada/conferir-invariancia.js` |
| Escala do tecido (folga exata) | $W$ e $s$ escalados pelo mesmo fator mantêm a folga relativa; hoje **não vale**, porque o piso de $h$ é $W/1000$ | `bancada/auditar-geometria.js` §1 |
| Giro global de 180° | o rolo inteiro girado 180° é um encaixe de mesmo consumo | proposto |
| Permutação de cópias idênticas | trocar duas cópias da mesma silhueta não muda nada | proposto |
| Salvo ≡ exportado | o encaixe guardado, remontado, é o mesmo do PDF | proposto (falta verificador único) |
