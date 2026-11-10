/**
 * ===========================================================================
 * O MESMO TRABALHO PELO QUADRADO — a referência do "quanto o contorno poupou"
 * ===========================================================================
 *
 * Usado em dois lugares, e por isso mora aqui, num arquivo só: a tela do
 * Encaixe (a linha "Economizou … contra o quadrado", em
 * producao/controlador.js) e o relatório (servidor/encaixe-relatorio.js). Se
 * cada um tivesse a sua conta, a tela diria um número e o relatório outro.
 *
 * A conta, e por que ela erra SEMPRE PARA MAIS (pedido do dono, 2026-11-10):
 *
 *   - cada peça vira o retângulo inteiro dela, mais a folga em cada eixo;
 *   - entra como veio (o mesmo lado certo do encaixe); só deita se em pé não
 *     couber na largura do rolo;
 *   - as peças vão em FILEIRAS (NFDH): da mais alta para a mais baixa, lado a
 *     lado até a largura acabar; a fileira seguinte começa na altura da mais
 *     alta da anterior — o que um operador faz à mão, e não o melhor arranjo
 *     de retângulos possível;
 *   - o total é arredondado para cima, de 10 em 10 cm.
 *
 * Quem compara com o contorno ainda garante que o quadrado nunca fique abaixo
 * dele (`quadradoParaComparar`).
 *
 * `.mjs` pelo mesmo motivo do `encaixeRede.mjs`: o servidor é CommonJS e o
 * carrega com `require`; o Vite o resolve do mesmo jeito.
 */

/** O arredondamento do quadrado: sempre para cima, de 10 em 10 cm. */
export const ARREDONDAR_CM = 10;

const paraCima = (cm) => Math.ceil(cm / ARREDONDAR_CM - 1e-9) * ARREDONDAR_CM;

/**
 * Quanto o trabalho gastaria pelo quadrado, em cm de rolo.
 *
 * `medidas`: [[largura, altura, quantidade], ...] em cm.
 * Devolve `null` quando não há o que contar.
 */
export function consumoNoQuadrado(medidas, larguraTecido, folgaX, folgaY = folgaX) {
  const W = Number(larguraTecido);
  if (!(W > 0) || !Array.isArray(medidas)) return null;
  const fx = Math.max(0, Number(folgaX) || 0);
  const fy = Math.max(0, Number(folgaY) || 0);

  const caixas = [];
  for (const m of medidas) {
    if (!Array.isArray(m)) continue;
    let w = Number(m[0]);
    let h = Number(m[1]);
    const qtd = Math.max(0, Math.round(Number(m[2]) || 0));
    if (!(w > 0) || !(h > 0) || qtd === 0) continue;
    // Em pé não cabe na largura: deita. Nem deitada: fica como está, e a
    // fileira dela estoura a largura — o que só aumenta o quadrado.
    if (w + fx > W && h + fx <= W) [w, h] = [h, w];
    for (let i = 0; i < qtd; i++) caixas.push({ w: w + fx, h: h + fy });
  }
  if (caixas.length === 0) return null;

  caixas.sort((a, b) => b.h - a.h || b.w - a.w);
  let total = 0;
  let usadoNaFileira = 0;
  let alturaDaFileira = 0;
  for (const c of caixas) {
    if (usadoNaFileira > 0 && usadoNaFileira + c.w > W) {
      total += alturaDaFileira;
      usadoNaFileira = 0;
      alturaDaFileira = 0;
    }
    usadoNaFileira += c.w;
    alturaDaFileira = Math.max(alturaDaFileira, c.h);
  }
  total += alturaDaFileira;
  return paraCima(total);
}

/** O quadrado para pôr ao lado do contorno: nunca abaixo dele. */
export function quadradoParaComparar(quadradoCm, contornoCm) {
  if (quadradoCm == null || !(contornoCm > 0)) return quadradoCm ?? null;
  return Math.max(quadradoCm, paraCima(contornoCm));
}
