/**
 * ===========================================================================
 * O `.adsx` DA AUDACES — o gabarito do molde graduado
 * ===========================================================================
 *
 * O `.adsx` é um ZIP: `index.json`, `file.ads` (o mesmo `.ads`), `file.jpg` e
 * `data.xml`. O `data.xml` não traz os pontos do contorno, mas traz o que falta
 * para nomear e conferir o PLT graduado: a grade (`SIZE_M`), o base, e de cada
 * peça (`PATTERN`) o nome, a quantidade e, POR TAMANHO, a largura e a altura
 * (`WIDTH_SP`, `HEIGHT_SP`, em cm). É com elas que cada contorno do PLT é casado
 * com a sua peça e o seu tamanho (`motores/pltGraduado.js`). Ver
 * docs/superpowers/specs/2026-10-05-importar-molde-graduado-design.md.
 *
 * Conta pura, no navegador e no Node: o ZIP é lido pelo diretório central, e o
 * deflate pelo `DecompressionStream`.
 */

const ASSINATURA_DO_FIM = 0x06054b50;

/** Os arquivos do ZIP: nome, método, onde estão os dados comprimidos e o tamanho. */
function entradasDoZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fim = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (v.getUint32(i, true) === ASSINATURA_DO_FIM) { fim = i; break; }
  }
  if (fim < 0) return null;
  const total = v.getUint16(fim + 10, true);
  let p = v.getUint32(fim + 16, true);
  const entradas = [];
  for (let k = 0; k < total; k++) {
    if (p + 46 > bytes.length || v.getUint32(p, true) !== 0x02014b50) return null;
    const metodo = v.getUint16(p + 10, true);
    const comprimido = v.getUint32(p + 20, true);
    const lnome = v.getUint16(p + 28, true);
    const lextra = v.getUint16(p + 30, true);
    const lcoment = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nome = new TextDecoder("latin1").decode(bytes.subarray(p + 46, p + 46 + lnome));
    const inicio = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    entradas.push({ nome, metodo, dados: bytes.subarray(inicio, inicio + comprimido) });
    p += 46 + lnome + lextra + lcoment;
  }
  return entradas;
}

async function descomprimir(entrada) {
  if (entrada.metodo === 0) return entrada.dados;
  if (entrada.metodo !== 8) throw new Error(`compressão ${entrada.metodo} não conhecida`);
  const fluxo = new Blob([entrada.dados]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

const numero = (texto) => {
  const n = Number(String(texto ?? "").trim());
  return Number.isFinite(n) ? n : null;
};
const dentro = (xml, tag) => {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
};

/**
 * O gabarito: `{ nome, tamanhos, base, pecas: [{ nome, quantidade, porTamanho:
 * { [tamanho]: { largura, altura } } }] }`, ou `{ erro }`.
 *
 * O nome da peça é o `NAME_P` (o `DESC_P` costuma vir vazio); a quantidade sai
 * do sufixo dele, como no `.ads` ("FRENTE2X" → "FRENTE", 2), e sem sufixo é o
 * `QT_MOD`.
 */
export async function lerAdsx(bytes) {
  const entradas = entradasDoZip(bytes);
  if (!entradas) return { erro: "Esse arquivo não é um .adsx (não abre como ZIP)." };
  const data = entradas.find((e) => e.nome.toLowerCase() === "data.xml");
  if (!data) return { erro: "O .adsx não traz o data.xml (os dados do modelo)." };
  let xml;
  try {
    xml = new TextDecoder("latin1").decode(await descomprimir(data));
  } catch (e) {
    return { erro: `Não consegui abrir o data.xml do .adsx: ${e.message}` };
  }

  const nome = (xml.match(/<MODEL[^>]*NAME_M="([^"]*)"/) || [])[1]?.trim() || "";
  const tamanhos = [...(dentro(xml, "SIZES_M") ?? "").matchAll(/<SIZE_M[^>]*NAME_SP="([^"]*)"/g)].map((m) => m[1].trim());
  let base = null;
  const pecas = [...xml.matchAll(/<PATTERN\b([^>]*)>([\s\S]*?)<\/PATTERN>/g)].map((m, i) => {
    const atributoNome = (m[1].match(/NAME_P="([^"]*)"/) || [])[1]?.trim() || "";
    const corpo = m[2];
    const descricao = (dentro(corpo, "DESC_P") ?? "").trim();
    const cru = atributoNome || descricao;
    const sufixo = cru.match(/^(.*?)\s*(\d+)\s*X$/i);
    const baseDaPeca = (dentro(corpo, "BASE_NAME") ?? "").replace(/"/g, "").trim();
    if (!base && baseDaPeca) base = baseDaPeca;
    const porTamanho = {};
    for (const t of corpo.matchAll(/<SIZE_P[^>]*NAME_SP="([^"]*)"[^>]*>([\s\S]*?)<\/SIZE_P>/g)) {
      const largura = numero(dentro(t[2], "WIDTH_SP"));
      const altura = numero(dentro(t[2], "HEIGHT_SP"));
      if (largura !== null && altura !== null) porTamanho[t[1].trim()] = { largura, altura };
    }
    return {
      nome: (sufixo ? sufixo[1].trim() : cru) || `Peça ${i + 1}`,
      quantidade: sufixo ? Number(sufixo[2]) : Math.max(1, Math.round(numero(dentro(corpo, "QT_MOD")) ?? 1)),
      porTamanho,
    };
  });
  if (tamanhos.length === 0) return { erro: "O data.xml do .adsx não traz a grade de tamanhos." };
  return { nome, tamanhos, base: tamanhos.includes(base) ? base : tamanhos[Math.floor((tamanhos.length - 1) / 2)], pecas };
}
