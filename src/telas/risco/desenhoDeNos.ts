/**
 * ===========================================================================
 * DESENHO DE NÓS — o risco, os nós e as alças no canvas
 * ===========================================================================
 *
 * O Digitalizar e a Montagem desenham o mesmo risco editável: um em cima da
 * foto, o outro em cima da grade. O que muda entre os dois é o fundo e a
 * conversão para a tela (`emTela`); o nó e a alça têm de ter a mesma cara nas
 * duas, senão quem passa de uma para a outra reaprende o que é canto.
 */

export type Ponto = { x: number; y: number };
export type No = { x: number; y: number; entrada: Ponto; saida: Ponto; canto?: boolean; retaDepois?: boolean };

/** O caminho fechado dos nós. Só traça o caminho: a cor e a grossura são de quem chama. */
export function tracarCaminho(ctx: CanvasRenderingContext2D, nos: No[], emTela: (p: Ponto) => Ponto) {
  if (nos.length === 0) return;
  ctx.beginPath();
  const zero = emTela(nos[0]!);
  ctx.moveTo(zero.x, zero.y);
  for (let k = 0; k < nos.length; k++) {
    const a = nos[k]!;
    const b = nos[(k + 1) % nos.length]!;
    const fim = emTela(b);
    if (a.retaDepois) {
      ctx.lineTo(fim.x, fim.y);
      continue;
    }
    const c1 = emTela(a.saida);
    const c2 = emTela(b.entrada);
    ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, fim.x, fim.y);
  }
  ctx.closePath();
}

/**
 * As alças do nó ativo (por baixo) e os nós (por cima).
 *
 * Canto é quadrado, curva é redondo: canto é ponto de costura, e tem que dar
 * para reconhecer sem clicar. O nó marcado cresce, muda de cor e ganha halo —
 * é ele que o Delete apaga, então dá para ver o que vai embora antes.
 */
export function desenharNos(
  ctx: CanvasRenderingContext2D, nos: No[], noAtivo: number | null, emTela: (p: Ponto) => Ponto,
) {
  if (noAtivo !== null && nos[noAtivo]) {
    const n = nos[noAtivo]!;
    const anterior = nos[(noAtivo - 1 + nos.length) % nos.length]!;
    const centro = emTela(n);
    for (const parte of ["entrada", "saida"] as const) {
      if (parte === "saida" && n.retaDepois) continue;
      if (parte === "entrada" && anterior.retaDepois) continue;
      const a = emTela(n[parte]);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(centro.x, centro.y);
      ctx.lineTo(a.x, a.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(a.x, a.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "#4d9dff";
      ctx.fill();
      ctx.strokeStyle = "rgba(10, 14, 16, 0.9)";
      ctx.stroke();
    }
  }

  nos.forEach((n, i) => {
    const c = emTela(n);
    const marcado = i === noAtivo;
    if (marcado) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 122, 26, 0.25)";
      ctx.fill();
    }
    const raio = marcado ? 5.2 : 3.6;
    ctx.fillStyle = marcado ? "#ff7a1a" : "#ffffff";
    ctx.strokeStyle = marcado ? "#ffffff" : "rgba(10, 14, 16, 0.95)";
    ctx.lineWidth = marcado ? 2 : 1.5;
    ctx.beginPath();
    if (n.canto) ctx.rect(c.x - raio, c.y - raio, raio * 2, raio * 2);
    else ctx.arc(c.x, c.y, raio, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}
