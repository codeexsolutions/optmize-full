/**
 * ===========================================================================
 * O VISOR DA VETORA — o original e o vetor, lado a lado, com zoom
 * ===========================================================================
 *
 * Um canvas, e não duas imagens: o vetor é DESENHADO a cada quadro a partir
 * das curvas (`Path2D` de cada forma, na ordem do SVG, com a costura por
 * baixo), então fica nítido em qualquer zoom — de longe até 64 vezes o pixel
 * da imagem —, enquanto o original, no mesmo zoom, mostra o pixel dele. É a
 * comparação que importa: a escada do original contra a curva do vetor.
 *
 *   roda do mouse      zoom em volta do cursor
 *   arrastar           move a imagem; perto da divisória, move a divisória
 *   duplo clique       aproxima 2×
 *   + − 0 1 N          aproxima, afasta, cabe na tela, pixel a pixel, nós
 *
 * "Nós" desenha o esqueleto do vetor por cima: o contorno de cada forma, as
 * âncoras (quadradinhos) e, de perto, as alças das curvas — para ver se o
 * vetor está limpo (poucos nós, curvas longas) ou picotado.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icone } from "../../casca/Icone";

export interface VetorDoVisor {
  formas: { cor: string; d: string }[];
  costura: { cor: string; d: string }[];
  larguraTraco: number;
}

interface Vista { escala: number; x: number; y: number }

const ZOOM_MAXIMO = 64;
/** De quanto perto (em pixels de tela) a divisória pega o arrasto. */
const PEGA_DA_DIVISORIA = 14;
/** Acima de tantas âncoras na tela o desenho delas vira borrão: só o contorno. */
const ANCORAS_NO_MAXIMO = 8000;

/** As âncoras e as alças de um caminho M/L/C/Z (absoluto, como o motor escreve). */
export function nosDoCaminho(d: string) {
  const ancoras: number[] = [];
  const alcas: number[] = [];
  const t = d.match(/[MLCZmlcz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  let i = 0, cmd = "", x = 0, y = 0, x0 = 0, y0 = 0;
  const n = () => Number(t[i++]);
  while (i < t.length) {
    const tok = t[i]!;
    if (/^[MLCZmlcz]$/.test(tok)) {
      cmd = tok.toUpperCase();
      i++;
      if (cmd === "Z") { x = x0; y = y0; }
      continue;
    }
    if (cmd === "M") { x = n(); y = n(); x0 = x; y0 = y; ancoras.push(x, y); cmd = "L"; }
    else if (cmd === "L") { x = n(); y = n(); ancoras.push(x, y); }
    else if (cmd === "C") {
      const x1 = n(), y1 = n(), x2 = n(), y2 = n(), xx = n(), yy = n();
      alcas.push(x, y, x1, y1, xx, yy, x2, y2);
      x = xx; y = yy;
      ancoras.push(x, y);
    } else i++;
  }
  return { ancoras, alcas };
}

let xadrezGuardado: { ctx: CanvasRenderingContext2D; padrao: CanvasPattern } | null = null;
function xadrez(ctx: CanvasRenderingContext2D) {
  if (xadrezGuardado && xadrezGuardado.ctx === ctx) return xadrezGuardado.padrao;
  const c = document.createElement("canvas");
  c.width = 20; c.height = 20;
  const x = c.getContext("2d")!;
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, 20, 20);
  x.fillStyle = "#dcdcdc"; x.fillRect(0, 0, 10, 10); x.fillRect(10, 10, 10, 10);
  const padrao = ctx.createPattern(c, "repeat")!;
  xadrezGuardado = { ctx, padrao };
  return padrao;
}

interface Props {
  original: HTMLImageElement | null;
  /** O tamanho da imagem no espaço do vetor (o vetor e o original se alinham nele). */
  largura: number;
  altura: number;
  vetor: VetorDoVisor | null;
  divisao: number;
  aoDividir: (v: number) => void;
  mostrarNos: boolean;
  aoMostrarNos: (v: boolean) => void;
  /** Por cima de tudo enquanto o primeiro vetor não chega (a animação). */
  espera?: ReactNode;
  /** A barrinha do vetor sendo refeito (0–1), ou null. */
  progresso?: number | null;
}

export function Visor({ original, largura, altura, vetor, divisao, aoDividir, mostrarNos, aoMostrarNos, espera, progresso }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const [tamanho, setTamanho] = useState({ w: 0, h: 0 });
  const [vista, setVista] = useState<Vista | null>(null);
  const [pertoDaDivisoria, setPertoDaDivisoria] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  /** Ainda no "caber na tela": a mudança de tamanho da janela reencaixa. */
  const encaixada = useRef(true);
  const arrasto = useRef<{ modo: "divisoria" | "mover"; x: number; y: number } | null>(null);

  const caminhos = useMemo(() => (vetor ? {
    formas: vetor.formas.map((f) => ({ cor: f.cor, p: new Path2D(f.d) })),
    costura: vetor.costura.map((c) => ({ cor: c.cor, p: new Path2D(c.d) })),
    larguraTraco: vetor.larguraTraco,
  } : null), [vetor]);
  const nos = useMemo(() => (mostrarNos && vetor ? vetor.formas.map((f) => nosDoCaminho(f.d)) : null), [mostrarNos, vetor]);

  const escalaQueCabe = tamanho.w && largura ? Math.min(tamanho.w / largura, tamanho.h / altura) * 0.92 : 1;
  const encaixar = useCallback(() => {
    if (!tamanho.w || !largura) return;
    const e = Math.min(tamanho.w / largura, tamanho.h / altura) * 0.92;
    setVista({ escala: e, x: (tamanho.w - largura * e) / 2, y: (tamanho.h - altura * e) / 2 });
    encaixada.current = true;
  }, [tamanho, largura, altura]);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setTamanho({ w: el.clientWidth, h: el.clientHeight });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Imagem nova (outro tamanho) ou janela nova com a vista ainda encaixada: reencaixa.
  const ultimaImagem = useRef("");
  useEffect(() => {
    const chave = `${largura}x${altura}`;
    if (encaixada.current || ultimaImagem.current !== chave || !vista) encaixar();
    ultimaImagem.current = chave;
  }, [tamanho, largura, altura, encaixar]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomEm = useCallback((fator: number, cx: number, cy: number) => {
    setVista((v) => {
      if (!v) return v;
      const nova = Math.max(Math.min(escalaQueCabe * 0.5, 0.05), Math.min(ZOOM_MAXIMO, v.escala * fator));
      const k = nova / v.escala;
      encaixada.current = false;
      return { escala: nova, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  }, [escalaQueCabe]);

  const pixelAPixel = useCallback(() => {
    setVista((v) => {
      if (!v) return v;
      const cx = tamanho.w / 2, cy = tamanho.h / 2, k = 1 / v.escala;
      encaixada.current = false;
      return { escala: 1, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  }, [tamanho]);

  // A roda do mouse: o ouvinte é "não passivo" para a página não rolar junto.
  useEffect(() => {
    const el = tela.current;
    if (!el) return;
    const roda = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const passo = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      zoomEm(Math.exp(-passo * 0.0016), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", roda, { passive: false });
    return () => el.removeEventListener("wheel", roda);
  }, [zoomEm]);

  // ==================== O DESENHO ====================

  useEffect(() => {
    const quadro = requestAnimationFrame(() => {
      const c = tela.current;
      if (!c || !vista || !tamanho.w) return;
      const dpr = window.devicePixelRatio || 1;
      const W = tamanho.w, H = tamanho.h;
      const cw = Math.round(W * dpr), ch = Math.round(H * dpr);
      if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
      const ctx = c.getContext("2d");
      if (!ctx) return;
      const estilo = getComputedStyle(c);
      const acento = estilo.getPropertyValue("--accent").trim() || "#ff5a1f";
      const fundoDoNo = estilo.getPropertyValue("--card-bg").trim() || "#111";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const { escala: e, x, y } = vista;
      const iw = largura * e, ih = altura * e;
      // O xadrez da transparência, só dentro da imagem (fora é a mesa).
      ctx.fillStyle = xadrez(ctx);
      const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(W, x + iw), y1 = Math.min(H, y + ih);
      if (x1 > x0 && y1 > y0) ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      const divX = caminhos ? divisao * W : W;
      // O original, à esquerda da divisória: de perto, o pixel dele aparece.
      if (original && divX > 0) {
        ctx.save();
        ctx.beginPath(); ctx.rect(0, 0, divX, H); ctx.clip();
        ctx.imageSmoothingEnabled = e < 2;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(original, x, y, iw, ih);
        ctx.restore();
      }
      // O vetor, à direita: desenhado das curvas, nítido em qualquer zoom.
      if (caminhos && divX < W) {
        ctx.save();
        ctx.beginPath(); ctx.rect(divX, 0, W - divX, H); ctx.clip();
        ctx.setTransform(dpr * e, 0, 0, dpr * e, dpr * x, dpr * y);
        if (caminhos.costura.length) {
          ctx.lineWidth = caminhos.larguraTraco;
          ctx.lineJoin = "round"; ctx.lineCap = "round";
          for (const k of caminhos.costura) { ctx.strokeStyle = k.cor; ctx.stroke(k.p); }
        }
        for (const f of caminhos.formas) { ctx.fillStyle = f.cor; ctx.fill(f.p, "evenodd"); }
        if (nos) {
          const px = 1 / e;
          ctx.lineWidth = px;
          ctx.strokeStyle = acento;
          ctx.globalAlpha = 0.9;
          for (const f of caminhos.formas) ctx.stroke(f.p);
          // A janela do vetor que está na tela, para só desenhar o que se vê.
          const vx0 = (divX - x) / e - 4 * px, vx1 = (W - x) / e + 4 * px, vy0 = -y / e - 4 * px, vy1 = (H - y) / e + 4 * px;
          const dentro = (ax: number, ay: number) => ax >= vx0 && ax <= vx1 && ay >= vy0 && ay <= vy1;
          if (e >= 2.5) {
            ctx.strokeStyle = "rgba(120,120,120,0.9)";
            ctx.fillStyle = "rgba(120,120,120,0.95)";
            ctx.beginPath();
            for (const n of nos) {
              const a = n.alcas;
              // Só a alça de âncora que está na tela: a de uma âncora lá fora
              // atravessaria a vista inteira (a alça do círculo grande é longa).
              for (let k = 0; k < a.length; k += 4) {
                if (!dentro(a[k]!, a[k + 1]!)) continue;
                ctx.moveTo(a[k]!, a[k + 1]!); ctx.lineTo(a[k + 2]!, a[k + 3]!);
              }
            }
            ctx.stroke();
            for (const n of nos) {
              const a = n.alcas;
              for (let k = 0; k < a.length; k += 4) {
                if (!dentro(a[k]!, a[k + 1]!)) continue;
                ctx.beginPath(); ctx.arc(a[k + 2]!, a[k + 3]!, 2.2 * px, 0, Math.PI * 2); ctx.fill();
              }
            }
          }
          let visiveis = 0;
          for (const n of nos) for (let k = 0; k < n.ancoras.length; k += 2) if (dentro(n.ancoras[k]!, n.ancoras[k + 1]!)) visiveis++;
          if (visiveis <= ANCORAS_NO_MAXIMO) {
            const lado = (visiveis > 2000 ? 3.5 : 5) * px;
            ctx.fillStyle = fundoDoNo;
            ctx.strokeStyle = acento;
            ctx.lineWidth = 1.2 * px;
            ctx.globalAlpha = 1;
            for (const n of nos) {
              const a = n.ancoras;
              for (let k = 0; k < a.length; k += 2) {
                if (!dentro(a[k]!, a[k + 1]!)) continue;
                ctx.fillRect(a[k]! - lado / 2, a[k + 1]! - lado / 2, lado, lado);
                ctx.strokeRect(a[k]! - lado / 2, a[k + 1]! - lado / 2, lado, lado);
              }
            }
          }
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      }
      // A divisória, com a pega no meio.
      if (caminhos) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = acento;
        ctx.fillRect(Math.round(divX) - 1, 0, 2, H);
        ctx.beginPath(); ctx.arc(divX, H / 2, 13, 0, Math.PI * 2);
        ctx.fillStyle = acento; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.moveTo(divX - 3, H / 2 - 5); ctx.lineTo(divX - 8, H / 2); ctx.lineTo(divX - 3, H / 2 + 5); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(divX + 3, H / 2 - 5); ctx.lineTo(divX + 8, H / 2); ctx.lineTo(divX + 3, H / 2 + 5); ctx.closePath(); ctx.fill();
      }
    });
    return () => cancelAnimationFrame(quadro);
  });

  // ==================== AS MÃOS ====================

  const ponto = (e: { clientX: number; clientY: number }) => {
    const r = tela.current!.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  };

  return (
    <div
      ref={caixa}
      tabIndex={0}
      className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-linha bg-[var(--card-bg-soft)] outline-none focus-visible:border-[var(--accent)]"
      onKeyDown={(e) => {
        const cx = tamanho.w / 2, cy = tamanho.h / 2;
        if (e.key === "+" || e.key === "=") zoomEm(1.5, cx, cy);
        else if (e.key === "-" || e.key === "_") zoomEm(1 / 1.5, cx, cy);
        else if (e.key === "0") encaixar();
        else if (e.key === "1") pixelAPixel();
        else if (e.key === "n" || e.key === "N") aoMostrarNos(!mostrarNos);
        else return;
        e.preventDefault();
      }}
    >
      <canvas
        ref={tela}
        className={`absolute inset-0 h-full w-full touch-none ${pertoDaDivisoria ? "cursor-ew-resize" : arrastando ? "cursor-grabbing" : "cursor-grab"}`}
        onPointerDown={(e) => {
          const { px, py } = ponto(e);
          const modo = caminhos && Math.abs(px - divisao * tamanho.w) < PEGA_DA_DIVISORIA ? "divisoria" : "mover";
          arrasto.current = { modo, x: px, y: py };
          setArrastando(modo === "mover");
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const { px, py } = ponto(e);
          const a = arrasto.current;
          if (!a) { setPertoDaDivisoria(!!caminhos && Math.abs(px - divisao * tamanho.w) < PEGA_DA_DIVISORIA); return; }
          if (a.modo === "divisoria") aoDividir(Math.max(0, Math.min(1, px / tamanho.w)));
          else {
            const dx = px - a.x, dy = py - a.y;
            encaixada.current = false;
            setVista((v) => (v ? { ...v, x: v.x + dx, y: v.y + dy } : v));
          }
          a.x = px; a.y = py;
        }}
        onPointerUp={(e) => {
          arrasto.current = null;
          setArrastando(false);
          (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        }}
        onDoubleClick={(e) => { const { px, py } = ponto(e); zoomEm(2, px, py); }}
      />

      {caminhos && (
        <>
          <span className="pointer-events-none absolute top-2.5 left-2.5 rounded-md bg-black/60 px-2 py-0.5 text-[11px] text-white">Original</span>
          <span className="pointer-events-none absolute top-2.5 right-2.5 rounded-md bg-black/60 px-2 py-0.5 text-[11px] text-white">Vetor</span>
        </>
      )}

      {/* Os controles do zoom, flutuando no canto. */}
      {caminhos && vista && (
        <div className="absolute right-2.5 bottom-2.5 flex items-center gap-0.5 rounded-xl border border-linha bg-[var(--card-bg)] p-1 text-tinta shadow-lg shadow-black/30">
          <button type="button" title="Afastar (−)" onClick={() => zoomEm(1 / 1.5, tamanho.w / 2, tamanho.h / 2)}
            className="grid size-7 place-items-center rounded-lg hover:bg-[var(--surface-hover)]"><Icone referencia="icones.svg#zoom-out" className="size-4" /></button>
          <span className="w-14 text-center font-mono text-[12px] text-tinta-fraca">{Math.round(vista.escala * 100)}%</span>
          <button type="button" title="Aproximar (+)" onClick={() => zoomEm(1.5, tamanho.w / 2, tamanho.h / 2)}
            className="grid size-7 place-items-center rounded-lg hover:bg-[var(--surface-hover)]"><Icone referencia="icones.svg#zoom-in" className="size-4" /></button>
          <button type="button" title="Caber na tela (0)" onClick={encaixar}
            className="grid size-7 place-items-center rounded-lg hover:bg-[var(--surface-hover)]"><Icone referencia="icones.svg#maximize" className="size-4" /></button>
          <button type="button" title="Pixel a pixel (1)" onClick={pixelAPixel}
            className="h-7 rounded-lg px-1.5 font-mono text-[11px] hover:bg-[var(--surface-hover)]">1:1</button>
          <span className="mx-1 h-5 w-px bg-[var(--linha,rgba(255,255,255,0.12))]" />
          <button type="button" title="Mostrar os nós do vetor (N)" aria-pressed={mostrarNos} onClick={() => aoMostrarNos(!mostrarNos)}
            className={`flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12px] ${mostrarNos ? "bg-[var(--accent-soft)] text-ambar" : "hover:bg-[var(--surface-hover)]"}`}>
            <Icone referencia="icones.svg#spline" className="size-4" /> Nós
          </button>
        </div>
      )}

      {progresso != null && caminhos && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-black/30">
          <div className="h-full bg-[var(--accent)] transition-[width]" style={{ width: `${Math.round(progresso * 100)}%` }} />
        </div>
      )}

      {!caminhos && espera && <div className="absolute inset-0 grid place-items-center bg-black/40">{espera}</div>}
    </div>
  );
}
