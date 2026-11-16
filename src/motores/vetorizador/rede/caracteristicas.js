/**
 * ===========================================================================
 * O QUE A REDE DA VETORA VÊ — as características da imagem
 * ===========================================================================
 *
 * A rede (`rede.js`) não olha os pixels um a um: olha um punhado de números
 * que dizem COMO a imagem é — grande ou pequena, nítida ou borrada, lisa ou
 * com lixo de JPEG, de poucas cores bem separadas ou de muitas parecidas.
 * São esses números que decidem qual ajuste do vetorizador acerta mais.
 *
 * A MESMA função roda no treino (`bancada/vetora/`) e no programa (o worker
 * do vetorizador): se uma mudar sem a outra, a rede passa a ver números que
 * nunca viu. Por isso a lista tem versão (`VERSAO_DAS_CARACTERISTICAS`), e a
 * rede treinada guarda a versão que viu — os pesos de outra versão não são
 * usados.
 *
 * Tudo sai das primeiras etapas do próprio vetorizador (o miolo, a paleta, os
 * rótulos e a largura da borda), que custam menos que um vetor inteiro.
 */

import { acharPaleta, medirMiolo, ALFA_OPACO } from "../paleta";
import { rotularPixels, separarRegioes } from "../regioes";
import { larguraDaBorda } from "../index";

export const VERSAO_DAS_CARACTERISTICAS = 1;

/** Os nomes, na ordem do vetor de características. */
export const NOMES_DAS_CARACTERISTICAS = [
  "lado", "proporcao", "opacos", "miolo",
  "cores_pouco", "cores_meio", "cores_muito",
  "borda", "regioes", "regioes_pequenas", "divisa",
  "ruido_liso", "blocos_jpeg",
  "dist_min", "dist_media", "dist_max",
  "cor_menor", "cor_maior", "croma", "claridade_maior",
  "tamanho_regiao",
];

const log2 = (v) => Math.log(v) / Math.LN2;

/**
 * As características de uma imagem RGBA: `{ valores: Float64Array, nomes }`.
 * O maior lado conta até 1600 px: acima disso a imagem é lida pulando pixels
 * (a borda e o ruído são medidos na escala do vetorizador, que também
 * reduz a imagem gigante).
 */
export function caracteristicas(px, largura, altura) {
  const total = largura * altura;
  const medida = medirMiolo(px, largura, altura);
  let opacos = 0;
  for (let i = 0; i < total; i++) if (px[i * 4 + 3] >= ALFA_OPACO) opacos++;
  const opacosOu1 = Math.max(1, opacos);

  // A paleta automática em três tolerâncias: quantas cores a imagem "tem"
  // com pouco, médio e muito detalhe.
  const paletas = [0.075, 0.0485, 0.022].map((tolerancia) => acharPaleta(px, largura, altura, medida, { tolerancia, maximo: 24 }).cores);
  const cores = paletas[1];
  const rotulos = cores.length ? rotularPixels(px, medida.lab, largura, altura, cores) : new Int16Array(total).fill(-1);
  const borda = cores.length ? larguraDaBorda(medida.lab, rotulos, largura, altura, cores) : 1;
  const { quantas, areaDa } = separarRegioes(rotulos, largura, altura);
  let pequenas = 0;
  for (let k = 0; k < quantas; k++) if (areaDa[k] < 8) pequenas++;

  // A divisa (pixel cujo vizinho da direita ou de baixo tem outro rótulo), o
  // ruído no liso (o pixel cercado do mesmo rótulo, e quanto ele difere da
  // média dos quatro vizinhos) e os blocos do JPEG (o salto entre as colunas
  // 7 e 8 de cada bloco contra o salto médio entre as outras).
  const lab = medida.lab;
  let divisa = 0, somaRuido = 0, nRuido = 0, saltoBloco = 0, nBloco = 0, saltoOutro = 0, nOutro = 0;
  for (let y = 1; y < altura - 1; y++) {
    for (let x = 1; x < largura - 1; x++) {
      const i = y * largura + x;
      const r = rotulos[i];
      if (r < 0) continue;
      if (rotulos[i + 1] !== r || rotulos[i + largura] !== r) divisa++;
      if (rotulos[i - 1] === r && rotulos[i + 1] === r && rotulos[i - largura] === r && rotulos[i + largura] === r) {
        const media = (lab[(i - 1) * 3] + lab[(i + 1) * 3] + lab[(i - largura) * 3] + lab[(i + largura) * 3]) / 4;
        somaRuido += Math.abs(lab[i * 3] - media);
        nRuido++;
      }
      const salto = Math.abs(lab[(i + 1) * 3] - lab[i * 3]);
      if (salto < 0.08) { // só o salto pequeno: a borda de verdade não conta
        if ((x & 7) === 7) { saltoBloco += salto; nBloco++; } else { saltoOutro += salto; nOutro++; }
      }
    }
  }

  // As distâncias entre as cores da paleta (do meio) e o peso de cada uma.
  let dMin = 1, dMax = 0, dSoma = 0, pares = 0;
  for (let a = 0; a < cores.length; a++) {
    for (let b = a + 1; b < cores.length; b++) {
      const d = Math.hypot(cores[a].L - cores[b].L, cores[a].a - cores[b].a, cores[a].b - cores[b].b);
      dMin = Math.min(dMin, d); dMax = Math.max(dMax, d); dSoma += d; pares++;
    }
  }
  const pesos = cores.map((c) => c.peso);
  const somaPesos = Math.max(1e-9, pesos.reduce((t, p) => t + p, 0));
  const maior = cores.length ? cores[pesos.indexOf(Math.max(...pesos))] : null;
  const croma = cores.reduce((t, c) => t + Math.hypot(c.a, c.b) * c.peso, 0) / somaPesos;

  const valores = new Float64Array([
    log2(Math.max(largura, altura)) / 10,
    log2(largura / altura),
    opacos / total,
    medida.quantosMiolo / opacosOu1,
    log2(paletas[0].length + 1) / 4,
    log2(paletas[1].length + 1) / 4,
    log2(paletas[2].length + 1) / 4,
    log2(Math.max(0.5, Math.min(16, borda))),
    log2(1 + (quantas * 10000) / opacosOu1) / 10,
    quantas ? pequenas / quantas : 0,
    (divisa / opacosOu1) * 10,
    nRuido ? Math.min(1, (somaRuido / nRuido) * 50) : 0,
    nBloco && nOutro && saltoOutro > 0 ? Math.max(-2, Math.min(2, log2((saltoBloco / nBloco + 1e-4) / (saltoOutro / nOutro + 1e-4)))) : 0,
    pares ? dMin : 0,
    pares ? dSoma / pares : 0,
    pares ? dMax : 0,
    cores.length ? Math.min(...pesos) / somaPesos : 0,
    cores.length ? Math.max(...pesos) / somaPesos : 0,
    croma * 4,
    maior ? maior.L : 0,
    log2(1 + opacosOu1 / Math.max(1, quantas)) / 16,
  ]);
  return { valores, nomes: NOMES_DAS_CARACTERISTICAS, borda, coresDoMeio: cores.length };
}
