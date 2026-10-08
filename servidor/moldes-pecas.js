/**
 * A peça de molde como o servidor aceita guardar — conferida e limpa.
 *
 * Saiu de `moldes-api.js` para poder ser testada sem abrir o banco
 * (`bancada/conferir-moldes-pecas.cjs`): lá, o `require("./db")` abre o
 * dados.db de verdade no primeiro `require`.
 *
 * `nos` e `marcacoes` são da tela de Montagem. A peça que chega sem eles (o
 * passo a passo antigo, um DXF) continua sem, e é só polígono como sempre foi.
 */

/** Papéis conhecidos. "outro" aceita qualquer nome escrito à mão. */
const PAPEIS = [
  "frente", "costas", "manga direita", "manga esquerda", "manga",
  "gola", "punho", "cós", "bolso", "vista", "forro", "outro",
];

function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function lerPonto(p) {
  const x = numero(p && p.x);
  const y = numero(p && p.y);
  return x === null || y === null ? null : { x, y };
}

/**
 * O nó liso automático (spec de 2026-10-05): a abertura de cada lado, presa
 * entre 0,05 e 4, e o giro entre −π e π. Número que não é número tira o campo —
 * o nó volta como suave, com as alças que já tem.
 */
function autoLido(a) {
  if (!a || typeof a !== "object") return null;
  const { antes, depois, giro } = a;
  if (![antes, depois, giro].every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  const prender = (v) => Math.min(4, Math.max(0.05, v));
  let g = giro % (2 * Math.PI);
  if (g > Math.PI) g -= 2 * Math.PI;
  if (g < -Math.PI) g += 2 * Math.PI;
  return { antes: prender(antes), depois: prender(depois), giro: g };
}

function lerNos(brutos) {
  if (!Array.isArray(brutos) || brutos.length < 3) return null;
  const nos = [];
  for (const n of brutos) {
    const centro = lerPonto(n);
    if (!centro) return null;
    nos.push({
      ...centro,
      entrada: lerPonto(n.entrada) || centro,
      saida: lerPonto(n.saida) || centro,
      canto: !!n.canto,
      retaDepois: !!n.retaDepois,
      // O tipo simétrico do Corel: só vale em nó que não é canto. Sem ele, o nó é suave.
      ...(n.simetrico && !n.canto ? { simetrico: true } : {}),
      ...(() => {
        const auto = n.canto ? null : autoLido(n.auto);
        return auto ? { auto } : {};
      })(),
    });
  }
  return nos;
}

function lerMarcacoes(bruta, totalDeNos) {
  if (!bruta || typeof bruta !== "object") return null;
  const fio = bruta.fio || {};
  return {
    margem: Math.max(0, Math.min(10, numero(bruta.margem) || 0)),
    espelhar: !!bruta.espelhar,
    fio: {
      x: numero(fio.x) || 0,
      y: numero(fio.y) || 0,
      angulo: numero(fio.angulo) || 0,
      comprimento: Math.max(0, numero(fio.comprimento) || 0),
    },
    piques: (Array.isArray(bruta.piques) ? bruta.piques : [])
      .map((p) => ({ no: Math.floor(numero(p && p.no) ?? -1), t: numero(p && p.t), profundidade: numero(p && p.profundidade) }))
      .filter((p) => p.no >= 0 && p.no < totalDeNos && p.t !== null && p.t >= 0 && p.t <= 1
        && p.profundidade > 0 && p.profundidade <= 5),
    pontos: (Array.isArray(bruta.pontos) ? bruta.pontos : []).map(lerPonto).filter(Boolean),
  };
}

function lerDeslocamento(d) {
  const dx = numero(d && d.dx);
  const dy = numero(d && d.dy);
  if (dx === null || dy === null || Math.abs(dx) > 100 || Math.abs(dy) > 100) return null;
  return { dx, dy };
}

/**
 * A graduação da peça (ver `motores/graduacao.js`), conferida e limpa. Regra
 * de nó que não existe, número absurdo, modo desconhecido e tamanho sem nome
 * saem; o que não confere é descartado, não gravado torto.
 */
function lerGraduacao(bruta, totalDeNos) {
  if (!bruta || typeof bruta !== "object") return null;
  const jeito = ["pontos", "porcentagem", "medida"].includes(bruta.jeito) ? bruta.jeito : null;
  if (!jeito) return null;
  const p = numero(bruta.porcentagem);
  const regras = [];
  const vistos = new Set();
  for (const r of Array.isArray(bruta.regras) ? bruta.regras : []) {
    const no = Math.floor(numero(r && r.no) ?? -1);
    if (no < 0 || no >= totalDeNos || vistos.has(no)) continue;
    if (r.modo === "igual") {
      const passo = lerDeslocamento(r.passo);
      if (!passo) continue;
      regras.push({ no, modo: "igual", passo });
    } else if (r.modo === "porTamanho") {
      const deslocamentos = {};
      for (const [tamanho, d] of Object.entries(r.deslocamentos || {})) {
        const nome = String(tamanho).trim();
        const valor = lerDeslocamento(d);
        if (nome && nome.length <= 20 && valor) deslocamentos[nome] = valor;
      }
      regras.push({ no, modo: "porTamanho", deslocamentos });
    } else {
      continue;
    }
    vistos.add(no);
  }
  // A peça inteira em cm por tamanho (a largura e a altura do salto), de −50 a 50.
  const cm = (v) => { const n = numero(v); return n !== null && n >= -50 && n <= 50 ? n : 0; };
  return {
    jeito,
    regras,
    porcentagem: p !== null && p >= -50 && p <= 50 ? p : 0,
    medida: { largura: cm(bruta.medida && bruta.medida.largura), altura: cm(bruta.medida && bruta.medida.altura) },
    perdidos: Math.max(0, Math.floor(numero(bruta.perdidos) || 0)),
  };
}

/** Confere e limpa uma peça que chegou da tela. `null` quando não tem contorno. */
function arrumarPeca(bruta, ordem) {
  const contorno = Array.isArray(bruta && bruta.contorno) ? bruta.contorno : null;
  if (!contorno || contorno.length < 3) return null;

  const pontos = contorno.map(lerPonto).filter(Boolean);
  if (pontos.length < 3) return null;

  const furos = (Array.isArray(bruta.furos) ? bruta.furos : [])
    .map((f) => (Array.isArray(f) ? f.map((p) => ({ x: Number(p.x), y: Number(p.y) })) : []))
    .filter((f) => f.length >= 3);

  const nos = lerNos(bruta.nos);
  const marcacoes = nos ? lerMarcacoes(bruta.marcacoes, nos.length) : null;
  const graduacao = nos ? lerGraduacao(bruta.graduacao, nos.length) : null;

  const papel = String(bruta.papel || "outro").trim().toLowerCase();
  return {
    tamanho: String(bruta.tamanho || "único").trim() || "único",
    papel: papel || "outro",
    nome: String(bruta.nome || "").trim() || null,
    quantidade: Math.max(1, Math.floor(Number(bruta.quantidade) || 1)),
    largura: Number(bruta.largura) || 0,
    altura: Number(bruta.altura) || 0,
    contorno: JSON.stringify(pontos),
    furos: furos.length > 0 ? JSON.stringify(furos) : null,
    origem: String(bruta.origem || "").trim() || null,
    nos: nos ? JSON.stringify(nos) : null,
    marcacoes: marcacoes ? JSON.stringify(marcacoes) : null,
    graduacao: graduacao ? JSON.stringify(graduacao) : null,
    ordem,
    // As linhas com o mesmo grupo são a mesma peça em tamanhos diferentes.
    grupo: bruta.grupo !== null && bruta.grupo !== "" && Number.isInteger(Number(bruta.grupo)) && Number(bruta.grupo) >= 0
      ? Number(bruta.grupo) : null,
  };
}

/**
 * A grade de tamanhos que chegou da tela. `null` quando não veio nada — é o
 * sinal para o PUT MANTER a grade guardada: o passo a passo antigo regrava as
 * peças sem saber de tamanhos com cor, e não pode apagá-los.
 */
function arrumarTamanhos(brutos) {
  if (!Array.isArray(brutos)) return null;
  const vistos = new Set();
  let temBase = false;
  const saida = [];
  for (const b of brutos) {
    const nome = String((b && b.nome) || "").trim();
    if (!nome || vistos.has(nome)) continue;
    vistos.add(nome);
    const cru = String((b && b.cor) || "").trim().toLowerCase();
    const hex = cru.startsWith("#") ? cru : `#${cru}`;
    const base = !!(b && b.base) && !temBase;
    if (base) temBase = true;
    saida.push({ nome, cor: /^#[0-9a-f]{6}$/.test(hex) ? hex : null, ordem: saida.length, base });
  }
  return saida;
}

function lerSituacao(valor) {
  return valor === "rascunho" || valor === "pronto" ? valor : null;
}

/**
 * A grossura da linha em volta da peça, em mm: de 0 a 10, com um décimo. `null` quando não veio
 * ou não é número — quem chama decide (o POST usa 0; o PUT mantém a guardada).
 */
function lerLinha(valor) {
  if (valor === undefined || valor === null || valor === "") return null;
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  return Math.min(10, Math.max(0, Math.round(n * 10) / 10));
}

/** A linha de `molde_pecas` como a tela a recebe. */
function pecaDoBanco(linha) {
  return {
    ...linha,
    contorno: JSON.parse(linha.contorno),
    furos: linha.furos ? JSON.parse(linha.furos) : [],
    nos: linha.nos ? JSON.parse(linha.nos) : null,
    marcacoes: linha.marcacoes ? JSON.parse(linha.marcacoes) : null,
    graduacao: linha.graduacao ? JSON.parse(linha.graduacao) : null,
  };
}

module.exports = { PAPEIS, arrumarPeca, arrumarTamanhos, lerLinha, lerSituacao, pecaDoBanco };
