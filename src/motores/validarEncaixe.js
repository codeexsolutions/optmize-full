/**
 * Verificador independente do posicionador, para o modelo atual: centímetros,
 * retângulos ou máscaras conservadoras com rotações de 90 graus.
 * Não certifica curvas originais, furos, defeitos nem restrições não modeladas.
 */
import { acharSobreposicao } from './encaixeSobreposicao';
import { rotacoesDe } from './encaixeGiro';

const chave = item => item && `${item.indice}#${item.copia ?? 0}`;
const perto = (a, b) => Number.isFinite(a) && Number.isFinite(b)
  && Math.abs(a - b) <= 32 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));

/**
 * Resultado parcial é válido quando cada cópia ausente está declarada em
 * naoEncaixadas. `completo` distingue isso de um pedido pronto para produção.
 */
export function validarEncaixe(resultado, itens, config) {
  const erros = [];
  const erro = (codigo, indice = null) => { if (erros.length < 32) erros.push({ codigo, indice }); };
  if (!resultado || !Array.isArray(resultado.posicoes) || !Array.isArray(resultado.naoEncaixadas)
      || !Array.isArray(itens) || !Number.isFinite(config?.larguraTecido) || config.larguraTecido <= 0) {
    return { valido: false, completo: false, erros: [{ codigo: 'estrutura' }] };
  }
  if (!Number.isFinite(resultado.consumo) || resultado.consumo < 0) erro('consumo');
  const esperadas = new Map();
  for (const item of itens) {
    const id = chave(item);
    if (!item || !Number.isSafeInteger(item.indice) || !Number.isSafeInteger(item.copia ?? 0)
        || (item.copia ?? 0) < 0 || esperadas.has(id)) erro('identidade-de-entrada');
    else esperadas.set(id, item);
  }
  const vistas = new Set();
  const registrar = item => {
    const id = chave(item);
    const original = esperadas.get(id);
    if (!original) erro('peca-desconhecida');
    if (vistas.has(id)) erro('copia-repetida');
    vistas.add(id);
    return original;
  };
  let area = 0;
  const caixasComFolga = [];
  const folga = Number(config.espaco ?? 0);
  if (!Number.isFinite(folga) || folga < 0) erro('folga');
  resultado.posicoes.forEach((p, indice) => {
    if (!p || ![p.x, p.y, p.largura, p.altura].every(Number.isFinite)
        || p.largura <= 0 || p.altura <= 0) { erro('posicao-nao-finita', indice); return; }
    const original = registrar(p.item);
    if (!original) return;
    const rot = p.rot ?? (p.girado ? 90 : 0);
    if (!rotacoesDe(original).includes(rot)) erro('rotacao-proibida', indice);
    const deitada = rot === 90 || rot === 270;
    if (!perto(p.largura, deitada ? original.altura : original.largura)
        || !perto(p.altura, deitada ? original.largura : original.altura)) erro('medida-alterada', indice);
    area += original.mascaras?.areaReal ?? original.largura * original.altura;
    const eps = 32 * Number.EPSILON * Math.max(1, Math.abs(p.x), Math.abs(p.y), resultado.consumo, config.larguraTecido);
    if (!p.mascara) {
      if (p.x < -eps || p.y < -eps || p.x + p.largura > config.larguraTecido + eps
          || p.y + p.altura > resultado.consumo + eps) erro('fora-do-material', indice);
      caixasComFolga.push({ ...p, largura: p.largura + folga, altura: p.altura + folga });
    } else {
      // Não use a caixa da imagem: ela pode conter transparência fora do rolo.
      // A máscara carrega o halo. Os limites dele são convertidos para a
      // região física como no contrato da grade, sem arredondar a posição.
      const m = p.mascara, passo = p.passo;
      if (!Number.isFinite(passo) || passo <= 0 || !m.topo || !m.base
          || !Number.isSafeInteger(m.cols) || m.cols <= 0 || !Number.isSafeInteger(m.rows) || m.rows <= 0
          || m.topo.length !== m.cols || m.base.length !== m.cols
          || !Number.isFinite(m.offX ?? 0) || !Number.isFinite(m.offY ?? 0)) { erro('mascara', indice); return; }
      const esperada = original.mascaras?.rotacoes?.[rot];
      if (!esperada) erro('mascara-sem-origem', indice);
      if (!(config.passo > 0) || !perto(passo, config.passo)) erro('passo-alterado', indice);
      const raio = original.mascaras?.raio;
      if (!Number.isSafeInteger(raio) || raio < 0
          || (config.raio != null && config.raio !== raio)) { erro('halo-incompativel', indice); return; }
      const halo = raio * passo;
      if (folga > 2 * halo && !perto(folga, 2 * halo)) erro('halo-insuficiente', indice);
      let esq = Infinity, dir = -Infinity, topo = Infinity, base = -Infinity;
      for (let c = 0; c < m.cols; c++) {
        if (m.topo[c] < 0) continue;
        esq = Math.min(esq, p.x + (m.offX || 0) + c * passo - halo);
        dir = Math.max(dir, p.x + (m.offX || 0) + (c + 1) * passo - halo);
        topo = Math.min(topo, p.y + (m.offY || 0) + m.topo[c] * passo - halo);
        base = Math.max(base, p.y + (m.offY || 0) + (m.base[c] + 1) * passo - halo);
      }
      // O último pixel conservador pode sobrar além da arte; recorte só pelo
      // limite original da imagem. Não altera a geometria usada em colisões.
      const direitaReal = Math.min(dir - halo, p.x + p.largura);
      const fundoReal = Math.min(base - halo, p.y + p.altura);
      if (![esq, dir, topo, base].every(Number.isFinite)
          || esq < -halo - eps || topo < -halo - eps
          || direitaReal > config.larguraTecido + eps || fundoReal > resultado.consumo + eps) erro('fora-do-material', indice);
      // Confere a máscara orientada original quando disponível. O verificador
      // não aceita trocar de formato preservando somente índice e dimensões.
      if (esperada && m !== esperada) {
        if (m.cols !== esperada.cols || m.rows !== esperada.rows || m.offX !== esperada.offX || m.offY !== esperada.offY
            || m.topo.length !== esperada.topo.length || m.base.length !== esperada.base.length) erro('mascara-alterada', indice);
        else for (let c = 0; c < m.cols; c++) {
          if (m.topo[c] !== esperada.topo[c] || m.base[c] !== esperada.base[c]) { erro('mascara-alterada', indice); break; }
        }
      }
    }
  });
  for (const item of resultado.naoEncaixadas) registrar(item);
  if (vistas.size !== esperadas.size) erro('peca-ausente');
  const guarda = acharSobreposicao(resultado.posicoes);
  if (guarda.conferidas !== resultado.posicoes.length) erro('geometria-nao-conferivel');
  if (guarda.pares > 0) erro('sobreposicao');
  // Nos resultados por caixa, a reserva é à direita/embaixo. Na máscara o
  // próprio halo já incorpora a folga; não engorde uma segunda vez.
  if (caixasComFolga.length === resultado.posicoes.length && folga > 0
      && acharSobreposicao(caixasComFolga).pares > 0) erro('folga-insuficiente');
  if (folga > 0 && caixasComFolga.length > 0 && caixasComFolga.length !== resultado.posicoes.length)
    erro('folga-em-modelo-misto-nao-certificada');
  if (resultado.areaReal != null && !perto(resultado.areaReal, area)) erro('area-inconsistente');
  return { valido: erros.length === 0, completo: erros.length === 0 && resultado.naoEncaixadas.length === 0,
    erros, conferidas: guarda.conferidas, colisoes: guarda.pares, areaCm2: area,
    // Limite inferior somente para as peças colocadas; pedido parcial não
    // fornece certificado sobre o comprimento necessário ao pedido completo.
    limiteAreaCm: area / config.larguraTecido };
}
