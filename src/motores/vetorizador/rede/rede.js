/**
 * ===========================================================================
 * A REDE DA VETORA — o que ela prevê, e como
 * ===========================================================================
 *
 * Uma rede neural pequena (perceptron de camadas: entrada → 64 → 64 → 3, com
 * ativação SiLU), treinada em milhares de logos sintéticos com a verdade
 * conhecida (`bancada/vetora/`). Ela recebe as características da imagem
 * (`caracteristicas.js`) e UM ajuste do vetorizador (detalhe, suavidade, com
 * ou sem a IA de ampliação), e prevê, para aquele ajuste:
 *
 *   fiel   o quanto o vetor acerta a imagem (−log10 dos pixels errados)
 *   erro   a distância média de cor (log10)
 *   nos    quantos nós o vetor terá (log10)
 *
 * — os três RELATIVOS à média dos ajustes sem IA da mesma imagem: a rede não
 * precisa saber o quanto aquela imagem é difícil, só o que cada ajuste muda
 * nela. É o bastante para escolher (`escolher.js`).
 *
 * São várias redes treinadas com sementes diferentes (um "comitê"), e a
 * previsão é a média delas: o erro de uma é compensado pelas outras.
 *
 * Os pesos moram em `pesos.json` (gerado por `bancada/vetora/treinar.mjs`):
 * cada matriz em base64 de Float32, com a média e o desvio das entradas e das
 * saídas do treino.
 */

function deBase64(texto) {
  const binario = typeof atob === "function" ? atob(texto) : Buffer.from(texto, "base64").toString("binary");
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

const silu = (x) => x / (1 + Math.exp(-x));

/** Monta a rede a partir do JSON dos pesos. `null` se os pesos não servem. */
export function criarRede(pesos, versaoDasCaracteristicas) {
  if (!pesos || !pesos.modelos || !pesos.modelos.length) return null;
  if (versaoDasCaracteristicas != null && pesos.versaoCarac !== versaoDasCaracteristicas) return null;
  const modelos = pesos.modelos.map((m) => m.camadas.map((c) => ({ W: deBase64(c.W), b: deBase64(c.b), entra: c.entra, sai: c.sai })));
  const { mediaEntrada, desvioEntrada, mediaSaida, desvioSaida } = pesos;
  const nCarac = mediaEntrada.length;

  /** A entrada da rede: as características padronizadas e o ajuste. */
  function entrada(carac, ajuste) {
    const x = new Float64Array(nCarac + 3);
    for (let i = 0; i < nCarac; i++) x[i] = (carac[i] - mediaEntrada[i]) / (desvioEntrada[i] || 1);
    x[nCarac] = ajuste.d / 100;
    x[nCarac + 1] = ajuste.s / 100;
    x[nCarac + 2] = ajuste.ia ? 1 : 0;
    return x;
  }

  function passar(camadas, x) {
    let v = x;
    camadas.forEach((c, k) => {
      const saida = new Float64Array(c.sai);
      for (let o = 0; o < c.sai; o++) {
        let soma = c.b[o];
        const linha = o * c.entra;
        for (let i = 0; i < c.entra; i++) soma += c.W[linha + i] * v[i];
        saida[o] = k < camadas.length - 1 ? silu(soma) : soma;
      }
      v = saida;
    });
    return v;
  }

  return {
    versao: pesos.versao,
    criadaEm: pesos.criadaEm,
    lambda: pesos.lambda,
    folgaDoLimpo: pesos.folgaDoLimpo,
    /** A previsão (`{ fiel, erro, nos }`, relativas) de cada ajuste. */
    prever(carac, ajustes) {
      return ajustes.map((ajuste) => {
        const x = entrada(carac, ajuste);
        const soma = [0, 0, 0];
        for (const m of modelos) {
          const y = passar(m, x);
          for (let k = 0; k < 3; k++) soma[k] += y[k];
        }
        const y = soma.map((v, k) => (v / modelos.length) * desvioSaida[k] + mediaSaida[k]);
        return { fiel: y[0], erro: y[1], nos: y[2] };
      });
    },
  };
}
