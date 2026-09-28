/**
 * ===========================================================================
 * MARGEM DE COSTURA — o contorno de corte em volta do risco
 * ===========================================================================
 *
 * Com margem, o risco que a pessoa desenhou é a linha de COSTURA, e o que vai
 * para o tecido é esta linha afastada para fora. O resultado vira o
 * `contorno` do molde — o que o Encaixe corta —, então a conta é conservadora:
 * quando não há resposta certa, devolve `null` e a tela avisa, em vez de
 * gravar um contorno torto.
 *
 * ---------------------------------------------------------------------------
 * A CONTA
 * ---------------------------------------------------------------------------
 *
 * Cada lado anda `margem` para fora, pela normal. Onde dois lados se
 * encontram, o ponto novo é o cruzamento das duas retas afastadas (junta em
 * ponta): `(n1 + n2) · margem / (1 + n1·n2)`. O "para fora" sai do sentido da
 * volta (o sinal da área), e é por isso que a conta não liga se o contorno
 * veio horário ou anti-horário.
 *
 * Quina CONVEXA muito aguda seria uma ponta a metros de distância; passou de
 * três margens, é aparada em dois pontos. Quina CÔNCAVA nunca é aparada:
 * aparar ali abriria o vinco em vez de fechá-lo, e o erro não se cruza (a
 * conferência não pegaria).
 *
 * ---------------------------------------------------------------------------
 * QUANDO NÃO HÁ RESPOSTA
 * ---------------------------------------------------------------------------
 *
 * Numa fenda mais estreita que duas margens, as paredes afastadas trocam de
 * lado. Às vezes isso cruza traço (pego pelo `seCruza`); às vezes elas só
 * passam uma pela outra, paralelas, e nada se cruza — mas o trecho fica do
 * AVESSO, andando ao contrário do lado original. As duas conferências juntas
 * pegam os dois casos. Resolver de verdade (fechar a fenda) pede recorte de
 * polígono, e não compensa para molde de roupa: quem tem uma fenda dessas
 * reduz a margem.
 */

/** Passou disso, a ponta de uma quina convexa é aparada. Em margens. */
const LIMITE_DA_PONTA = 3;
const EPS = 1e-9;

/** Metade do laço de Gauss. O sinal diz o sentido da volta. */
export function areaComSinalDe(pontos) {
  let soma = 0;
  for (let i = 0; i < pontos.length; i++) {
    const a = pontos[i];
    const b = pontos[(i + 1) % pontos.length];
    soma += a.x * b.y - b.x * a.y;
  }
  return soma / 2;
}

/** Tira ponto repetido em sequência (o achatar das curvas deixa alguns). */
function semRepetidos(pontos) {
  const saida = [];
  for (const p of pontos) {
    const ultimo = saida[saida.length - 1];
    if (!ultimo || Math.hypot(p.x - ultimo.x, p.y - ultimo.y) > 1e-6) saida.push({ x: p.x, y: p.y });
  }
  while (saida.length > 1) {
    const a = saida[0];
    const b = saida[saida.length - 1];
    if (Math.hypot(a.x - b.x, a.y - b.y) > 1e-6) break;
    saida.pop();
  }
  return saida;
}

const orientacao = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

/** Algum par de lados não vizinhos se cruza? Quadrático, e basta: peça tem centenas de pontos. */
export function seCruza(pontos) {
  const n = pontos.length;
  for (let i = 0; i < n; i++) {
    const a = pontos[i];
    const b = pontos[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = pontos[j];
      const d = pontos[(j + 1) % n];
      if (orientacao(a, b, c) * orientacao(a, b, d) < 0 && orientacao(c, d, a) * orientacao(c, d, b) < 0) {
        return true;
      }
    }
  }
  return false;
}

/** Distância do ponto à reta que liga os dois vizinhos dele. */
function desvioDoNo(p, i) {
  const n = p.length;
  const a = p[(i - 1 + n) % n];
  const b = p[(i + 1) % n];
  const comprimento = Math.hypot(b.x - a.x, b.y - a.y);
  if (comprimento < EPS) return Math.hypot(p[i].x - a.x, p[i].y - a.y);
  return Math.abs(orientacao(a, b, p[i])) / comprimento;
}

/*
 * O traço que sai da foto tem DOBRINHAS: vincos de décimos de milímetro onde
 * o lápis ou a sombra entortou a beira. Qualquer côncavo mais estreito que a
 * margem vira do avesso na conta de cima — e o offset de verdade simplesmente
 * o enche. Então, quando um lado sai do avesso, o nó daquele lado que menos
 * se afasta da reta dos vizinhos sai do risco (só para a conta do corte) e a
 * conta recomeça. Só sai nó a até MEIA margem da reta: a dobrinha some, mas
 * a fenda de verdade (a do caso 4 da bancada) continua dando null.
 */
export function margemDeCostura(pontos, margem) {
  let p = semRepetidos(pontos);
  if (p.length < 3) return null;
  if (!(margem > 0)) return p;

  for (;;) {
    const r = afastar(p, margem);
    if (r === null) return null;
    if (!("avesso" in r)) return seCruza(r.pontos) ? null : r.pontos;
    if (p.length <= 3) return null;
    const i = r.avesso;
    const j = (i + 1) % p.length;
    const qual = desvioDoNo(p, i) <= desvioDoNo(p, j) ? i : j;
    if (desvioDoNo(p, qual) > margem / 2) return null;
    p = p.filter((_, k) => k !== qual);
  }
}

/**
 * Um passo da conta: `{ pontos }` quando deu certo, `{ avesso: i }` quando o
 * lado `i` saiu do avesso, `null` quando não há resposta nenhuma.
 */
function afastar(p, margem) {
  const sinal = areaComSinalDe(p) >= 0 ? 1 : -1;
  const n = p.length;
  const normal = (a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const comprimento = Math.hypot(dx, dy);
    return { x: (sinal * dy) / comprimento, y: (-sinal * dx) / comprimento };
  };

  // Os pontos novos de cada nó: um (junta em ponta) ou dois (ponta aparada).
  const porNo = [];
  for (let i = 0; i < n; i++) {
    const anterior = p[(i - 1 + n) % n];
    const atual = p[i];
    const proximo = p[(i + 1) % n];
    const n1 = normal(anterior, atual);
    const n2 = normal(atual, proximo);
    const denominador = 1 + n1.x * n2.x + n1.y * n2.y;
    const bx = n1.x + n2.x;
    const by = n1.y + n2.y;
    const cruz = (atual.x - anterior.x) * (proximo.y - atual.y) - (atual.y - anterior.y) * (proximo.x - atual.x);
    const concavo = cruz * sinal < 0;
    if (concavo && denominador <= EPS) return null;
    const ponta = denominador > EPS ? (margem * Math.hypot(bx, by)) / denominador : Infinity;

    if (concavo || ponta <= LIMITE_DA_PONTA * margem) {
      porNo.push([{ x: atual.x + (bx * margem) / denominador, y: atual.y + (by * margem) / denominador }]);
    } else {
      porNo.push([
        { x: atual.x + n1.x * margem, y: atual.y + n1.y * margem },
        { x: atual.x + n2.x * margem, y: atual.y + n2.y * margem },
      ]);
    }
  }

  // Cada lado afastado tem de andar para o mesmo lado que o original.
  for (let i = 0; i < n; i++) {
    const a = p[i];
    const b = p[(i + 1) % n];
    const de = porNo[i][porNo[i].length - 1];
    const ate = porNo[(i + 1) % n][0];
    if ((b.x - a.x) * (ate.x - de.x) + (b.y - a.y) * (ate.y - de.y) <= 0) return { avesso: i };
  }

  return { pontos: porNo.flat() };
}
