/**
 * ===========================================================================
 * API DO EXTRATOR — a foto, os cliques e os arquivos do elemento
 * ===========================================================================
 *
 * A conversa com `servidor/extrator-api.js`. Estoura com a mensagem do
 * servidor em vez de devolver `null`: a pessoa PEDIU a máscara ou o arquivo,
 * e não receber é uma resposta que ela precisa ver (a regra do `risco.ts`).
 *
 * A única falha que não chega à pessoa é a leitura vencida: ela vira
 * `LeituraVencida`, e a tela lê a foto de novo sozinha.
 */

export interface EstadoDoExtrator {
  rede: string;
  pronta: boolean;
  /** Por que a rede de recorte não roda, ou `null`. */
  motivo: string | null;
  aceitaCaixa: boolean;
  /** Por que a rede de ampliar não roda, ou `null`. */
  ampliar: string | null;
}

export interface Leitura { id: string; largura: number; altura: number; ms: number; aceitaCaixa: boolean }
export interface PontoDoClique { x: number; y: number; inclui: boolean }
export interface CaixaDoClique { x0: number; y0: number; x1: number; y1: number }
export interface MascaraLida { alfa: Uint8Array; largura: number; altura: number; nota: number }

export class LeituraVencida extends Error {}

/**
 * O `fetch`, com o "servidor fora do ar" em português. O cancelamento
 * (`AbortError`) passa intacto: a tela depende dele para não mostrar erro.
 */
async function chamar(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new Error("Não consegui falar com o servidor do Extrator. Ele está ligado?");
  }
}

async function falhou(resposta: Response, padrao: string): Promise<Error> {
  const corpo = (await resposta.json().catch(() => ({}))) as { error?: string; codigo?: string | null };
  const texto = corpo.error || padrao;
  return corpo.codigo === "leitura-vencida" ? new LeituraVencida(texto) : new Error(texto);
}

/** O PNG cinza da máscara, de volta a um byte por pixel. */
async function alfaDoPng(png: Blob): Promise<{ alfa: Uint8Array; largura: number; altura: number }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(png, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  } catch {
    throw new Error("O servidor mandou uma máscara que o navegador não conseguiu abrir.");
  }
  try {
    const tela = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = tela.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("O navegador não deu um canvas para ler a máscara.");
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const alfa = new Uint8Array(bitmap.width * bitmap.height);
    for (let i = 0; i < alfa.length; i++) alfa[i] = data[i * 4]!;
    return { alfa, largura: bitmap.width, altura: bitmap.height };
  } finally {
    bitmap.close();
  }
}

const espera = (ms: number) => new Promise((pronto) => setTimeout(pronto, ms));

export const extratorApi = {
  async estado(): Promise<EstadoDoExtrator> {
    const r = await chamar("/api/extrator/estado");
    if (!r.ok) throw await falhou(r, "O servidor não respondeu sobre o Extrator.");
    return (await r.json()) as EstadoDoExtrator;
  },

  async ler(foto: Blob, sinal?: AbortSignal): Promise<Leitura> {
    const r = await chamar("/api/extrator/ler", {
      method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: foto, signal: sinal,
    });
    if (!r.ok) throw await falhou(r, "O servidor não conseguiu ler a foto.");
    return (await r.json()) as Leitura;
  },

  async mascara(id: string, pontos: PontoDoClique[], caixa: CaixaDoClique | null, sinal?: AbortSignal): Promise<MascaraLida> {
    const r = await chamar("/api/extrator/mascara", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, pontos, caixa }), signal: sinal,
    });
    if (!r.ok) throw await falhou(r, "O servidor não conseguiu achar o elemento.");
    const nota = Number(r.headers.get("X-Mascara-Nota")) || 0;
    return { ...(await alfaDoPng(await r.blob())), nota };
  },

  async png(svg: string, largura: number, altura: number): Promise<Blob> {
    const r = await chamar("/api/extrator/png", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ svg, largura, altura }),
    });
    if (!r.ok) throw await falhou(r, "O servidor não conseguiu desenhar o PNG.");
    return r.blob();
  },

  /** Amplia o elemento no servidor, avisando o andamento; o `sinal` cancela lá também. */
  async ampliar(
    recorte: { rgba: Uint8ClampedArray<ArrayBuffer>; largura: number; altura: number },
    saida: { largura: number; altura: number },
    aoAndar: (feitos: number, total: number) => void,
    sinal?: AbortSignal,
  ): Promise<Blob> {
    const q = new URLSearchParams({
      largura: String(recorte.largura), altura: String(recorte.altura),
      saidaLargura: String(saida.largura), saidaAltura: String(saida.altura),
    });
    const r = await chamar(`/api/extrator/ampliar?${q}`, {
      method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: recorte.rgba, signal: sinal,
    });
    if (!r.ok) throw await falhou(r, "O servidor não conseguiu começar a ampliação.");
    const { id, total } = (await r.json()) as { id: string; total: number };
    aoAndar(0, total);
    const cancelar = () => { void fetch(`/api/extrator/ampliar/${id}`, { method: "DELETE" }).catch(() => {}); };
    sinal?.addEventListener("abort", cancelar, { once: true });
    try {
      for (;;) {
        await espera(400);
        if (sinal?.aborted) throw new DOMException("cancelado", "AbortError");
        const g = await chamar(`/api/extrator/ampliar/${id}`, { signal: sinal });
        if (!g.ok) throw await falhou(g, "A ampliação parou no meio.");
        if ((g.headers.get("Content-Type") || "").startsWith("image/png")) return await g.blob();
        const andamento = (await g.json()) as { feitos: number; total: number };
        aoAndar(andamento.feitos, andamento.total);
      }
    } finally {
      sinal?.removeEventListener("abort", cancelar);
    }
  },
};
