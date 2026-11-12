# Próximos passos do motor (depois da VNext)

Em ordem de ganho esperado × confiança ÷ custo. Cada item traz o caminho já
verificado no código, para a próxima rodada não começar do zero.

## 1. P5 — sparrow com bancada (quem corta em mesa)

**Ganho medido pela missão anterior:** a bancada liga a regra "nenhuma peça
cruza a linha de corte" e **desliga o sparrow**; ~2,1% de mídia é o sparrow
desligado (1 semente, `conferir-escala.js --teste bancada`).

**O caminho, conferido no código (2026-11-12):**

1. jagua-rs (`probs/spp/entities/strip.rs`): `impl From<Strip> for Container`
   passa `vec![]` de zonas de qualidade. A faixa precisa carregar o período da
   bancada e a meia-largura da zona (campos `Copy`), e gerar uma zona de
   qualidade 0 em cada `x = k·B` (no quadro do sparrow, o rolo corre em `x`).
   Item com `min_quality: None` exige qualidade cheia — já colide com elas.
2. sparrow (`quantify/tracker.rs` e `eval/collision_loss.rs`): os dois `match`
   sobre `HazardEntity` têm `_ => unimplemented!("unsupported hazard entity")`.
   A zona precisa ser quantificada como a borda (`quantify_collision_poly_container`
   contra o retângulo da zona) e ter peso no GLS como o `container_collisions`.
3. A largura da zona tem de cobrir a sobra da ARTE além da silhueta
   (`sobraDaArte` / `reservaDaArte`, em encaixeMotor.js): é o retângulo da
   arte que não pode cruzar a linha.
4. A volta passa por `bancada/conferir-bancada.js` (corte) além da trava.
5. A mídia com bancada é `(b−1)·B + ℓ_b`: o sparrow minimiza a largura da
   faixa, que com as zonas fixas minimiza a mídia também.

Já existe a cópia local do sparrow (`wasm-encolher/sparrow/`); falta vendorar
o jagua-rs do mesmo jeito (crate maior) ou mandar a mudança para o autor.

## 2. Repetição na busca construtiva

Medido: 39% das tentativas dos trabalhos pequenos decodificam uma ordem
equivalente a uma já vista (`medir-repeticao.js`). Um filtro de estados já
visitados (a chave do medidor, antes de decodificar) economizaria esse
trabalho. Não é o gargalo do tecido final (a busca acha o melhor dela em
segundos e o sparrow decide o resto), mas é tempo devolvido ao sparrow nos
trabalhos pequenos.

## 3. P8 — aproveitamento com a área verdadeira

O aproveitamento mostrado usa a área da máscara (em vetor, 0,3% a 12% acima
da verdadeira por peça). O limite inferior do painel usa a mesma área, então
ele vale para o modelo do motor; para comparar com outro programa (Audaces),
o certo é a área do polígono/da arte em resolução cheia.

## 4. Comparação com o Audaces

Não há resultado de encaixe do Audaces nesta máquina. Para comparar de forma
justa: o mesmo conjunto de peças (os `.ads/.adsx` já são lidos), a mesma
largura, a mesma folga e as mesmas rotações, e registrar o comprimento do
Audaces com o tempo que ele levou. O laboratório já mede o nosso lado com
sementes e curva no tempo; falta o arquivo de resultados do Audaces.
