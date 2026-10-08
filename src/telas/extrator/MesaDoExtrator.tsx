/**
 * A MESA DO EXTRATOR — a foto, a máscara por cima e os cliques.
 *
 * O canvas tem o tamanho da FOTO DE TRABALHO (lado maior em 2048) e o CSS o
 * encaixa na mesa: o ponto do ponteiro vira pixel da foto pela proporção do
 * retângulo na tela, como no Digitalizar.
 *
 * Clique esquerdo inclui, direito exclui, arrastar faz caixa. No modo
 * "cantos" os quatro puxadores da perspectiva são arrastados no lugar.
 *
 * `data-pontos-da-mascara` e `data-cobertura` estão no canvas para a bancada
 * saber qual máscara está à mostra, sem ler pixel.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as EventoDoPonteiro } from "react";
import type { CaixaDoClique, Mascara, Ponto, PontoDoClique, Trabalho } from "./tipos";

/** Menos que isto, em pixels da tela, é clique, e não caixa. */
const ARRASTO_MINIMO_PX = 5;
/** O raio de pega dos puxadores dos cantos, em pixels da tela. */
const PEGA_PX = 14;

interface Props {
  trabalho: Trabalho;
  mascara: Mascara | null;
  pontos: PontoDoClique[];
  caixa: CaixaDoClique | null;
  modo: "separar" | "cantos";
  cantos: Ponto[];
  aoMudarCantos: (cantos: Ponto[]) => void;
  aoClicar: (p: PontoDoClique) => void;
  aoPassarCaixa: (c: CaixaDoClique) => void;
  desligada: boolean;
}

/** A cor do destaque da casa, do token (ver `estilo/tokens.css`). */
function corDoDestaque(): [number, number, number] {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  const m = /^#([0-9a-f]{6})$/i.exec(v);
  if (!m) return [255, 83, 31];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

interface Arrasto { de: Ponto; ate: Ponto; botao: number; telaX: number; telaY: number }

export function MesaDoExtrator({ trabalho, mascara, pontos, caixa, modo, cantos, aoMudarCantos, aoClicar, aoPassarCaixa, desligada }: Props) {
  const tela = useRef<HTMLCanvasElement>(null);
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const [puxando, setPuxando] = useState<number | null>(null);

  // A máscara pintada uma vez por máscara: o destaque, com metade da opacidade dela.
  const veu = useMemo(() => {
    if (!mascara) return null;
    const c = document.createElement("canvas");
    c.width = mascara.largura;
    c.height = mascara.altura;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const img = ctx.createImageData(mascara.largura, mascara.altura);
    const [r, g, b] = corDoDestaque();
    for (let i = 0; i < mascara.alfa.length; i++) {
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = mascara.alfa[i]! >> 1;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }, [mascara]);

  const naFoto = (e: { clientX: number; clientY: number }): Ponto | null => {
    const c = tela.current;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    if (r.width === 0) return null;
    return { x: ((e.clientX - r.left) / r.width) * trabalho.largura, y: ((e.clientY - r.top) / r.height) * trabalho.altura };
  };
  /** Quantos pixels da foto valem um pixel da tela: os marcadores ficam do mesmo tamanho em qualquer zoom. */
  const porPixelDaTela = () => {
    const r = tela.current?.getBoundingClientRect();
    return r && r.width > 0 ? trabalho.largura / r.width : 1;
  };

  // Um canvas só, redesenhado a cada render: as entradas mudam juntas.
  useEffect(() => {
    const c = tela.current;
    if (!c) return;
    c.width = trabalho.largura;
    c.height = trabalho.altura;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(trabalho.bitmap, 0, 0);
    const k = porPixelDaTela();
    if (modo === "separar") {
      if (veu) ctx.drawImage(veu, 0, 0, trabalho.largura, trabalho.altura);
      for (const p of pontos) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6 * k, 0, Math.PI * 2);
        ctx.fillStyle = p.inclui ? "#22c55e" : "#ef4444";
        ctx.fill();
        ctx.lineWidth = 2 * k;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
      }
      const desenhada = arrasto && arrasto.botao === 0
        ? { x0: arrasto.de.x, y0: arrasto.de.y, x1: arrasto.ate.x, y1: arrasto.ate.y }
        : caixa;
      if (desenhada) {
        ctx.setLineDash([8 * k, 6 * k]);
        ctx.lineWidth = 2 * k;
        ctx.strokeStyle = "#ffffff";
        ctx.strokeRect(Math.min(desenhada.x0, desenhada.x1), Math.min(desenhada.y0, desenhada.y1),
          Math.abs(desenhada.x1 - desenhada.x0), Math.abs(desenhada.y1 - desenhada.y0));
        ctx.setLineDash([]);
      }
    } else {
      ctx.beginPath();
      cantos.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.lineWidth = 2 * k;
      ctx.strokeStyle = "#ff531f";
      ctx.stroke();
      for (const p of cantos) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(p.x - 7 * k, p.y - 7 * k, 14 * k, 14 * k);
        ctx.strokeRect(p.x - 7 * k, p.y - 7 * k, 14 * k, 14 * k);
      }
    }
  });

  const apertar = (e: EventoDoPonteiro<HTMLCanvasElement>) => {
    if (desligada) return;
    const p = naFoto(e);
    if (!p) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (modo === "cantos") {
      let melhor = -1;
      let menor = Infinity;
      cantos.forEach((c, i) => {
        const d = Math.hypot(c.x - p.x, c.y - p.y);
        if (d < menor) { menor = d; melhor = i; }
      });
      if (melhor >= 0 && menor <= PEGA_PX * porPixelDaTela()) setPuxando(melhor);
      return;
    }
    setArrasto({ de: p, ate: p, botao: e.button, telaX: e.clientX, telaY: e.clientY });
  };

  const mover = (e: EventoDoPonteiro<HTMLCanvasElement>) => {
    const p = naFoto(e);
    if (!p) return;
    if (puxando !== null) {
      const dentro = { x: Math.min(trabalho.largura, Math.max(0, p.x)), y: Math.min(trabalho.altura, Math.max(0, p.y)) };
      aoMudarCantos(cantos.map((c, i) => (i === puxando ? dentro : c)));
      return;
    }
    if (arrasto) setArrasto({ ...arrasto, ate: p });
  };

  const soltar = (e: EventoDoPonteiro<HTMLCanvasElement>) => {
    if (puxando !== null) {
      setPuxando(null);
      return;
    }
    if (!arrasto) return;
    const p = naFoto(e) ?? arrasto.ate;
    const andou = Math.hypot(e.clientX - arrasto.telaX, e.clientY - arrasto.telaY);
    setArrasto(null);
    if (arrasto.botao === 0 && andou >= ARRASTO_MINIMO_PX) {
      aoPassarCaixa({ x0: arrasto.de.x, y0: arrasto.de.y, x1: p.x, y1: p.y });
      return;
    }
    if (arrasto.botao === 0 || arrasto.botao === 2) aoClicar({ x: arrasto.de.x, y: arrasto.de.y, inclui: arrasto.botao === 0 });
  };

  return (
    <div className="grid place-items-center overflow-hidden rounded-[10px] border border-linha bg-painel-suave">
      <canvas
        ref={tela}
        id="extrator-mesa"
        data-pontos-da-mascara={mascara?.pontos ?? 0}
        data-cobertura={mascara ? mascara.cobertura.toFixed(4) : "0"}
        className={[
          "block h-auto max-h-[70vh] w-auto max-w-full touch-none select-none",
          modo === "cantos" ? "cursor-move" : "cursor-crosshair",
          desligada ? "opacity-60" : "",
        ].join(" ")}
        onPointerDown={apertar}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={() => { setArrasto(null); setPuxando(null); }}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
