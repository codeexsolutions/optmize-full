/**
 * A VITRINE DA VETORA — a animação da tela inicial e da espera do vetor.
 */
import { useEffect, useMemo, useState } from "react";

/**
 * A VITRINE DA VETORA — o pixel virando curva, em três desenhos que se
 * revezam (o círculo, a estrela, o coração). Em cada um: a imagem em pixel
 * (a escada) aparece em onda, a caneta corre a borda traçando a curva por
 * cima, os nós e as alças saltam, a forma se enche de cor com um brilho
 * passando, e o pixel some por baixo. Seis segundos cada, em laço; parada no
 * desenho pronto para quem pede menos movimento. Só cor do tema.
 */
interface DesenhoDaVitrine { d: string; nos: { x: number; y: number; h?: [number, number][] }[] }
const DESENHOS_DA_VITRINE: DesenhoDaVitrine[] = [
  {
    d: "M60 16C84 16 104 36 104 60C104 84 84 104 60 104C36 104 16 84 16 60C16 36 36 16 60 16Z",
    nos: [
      { x: 60, y: 16, h: [[36, 16], [84, 16]] }, { x: 104, y: 60, h: [[104, 36], [104, 84]] },
      { x: 60, y: 104, h: [[84, 104], [36, 104]] }, { x: 16, y: 60, h: [[16, 84], [16, 36]] },
    ],
  },
  {
    d: "M60 12L72 46L108 47L80 69L90 104L60 84L30 104L40 69L12 47L48 46Z",
    nos: ([[60, 12], [72, 46], [108, 47], [80, 69], [90, 104], [60, 84], [30, 104], [40, 69], [12, 47], [48, 46]] as [number, number][]).map(([x, y]) => ({ x, y })),
  },
  {
    d: "M60 104C22 78 10 52 22 34C34 18 54 22 60 38C66 22 86 18 98 34C110 52 98 78 60 104Z",
    nos: [
      { x: 60, y: 104, h: [[22, 78], [98, 78]] }, { x: 60, y: 38, h: [[54, 22], [66, 22]] },
      { x: 22, y: 34, h: [[10, 52], [34, 18]] }, { x: 98, y: 34, h: [[86, 18], [110, 52]] },
    ],
  },
];

/** Os pixels de cada desenho: as casas de 8 px cujo centro cai dentro dele. */
const pixelsDaVitrine = new Map<string, [number, number][]>();
function pixelsDe(d: string): [number, number][] {
  const guardado = pixelsDaVitrine.get(d);
  if (guardado) return guardado;
  const lista: [number, number][] = [];
  const ctx = document.createElement("canvas").getContext("2d");
  const forma = new Path2D(d);
  for (let y = 0; y < 120; y += 8) for (let x = 0; x < 120; x += 8) {
    if (ctx && ctx.isPointInPath(forma, x + 4, y + 4)) lista.push([x, y]);
  }
  pixelsDaVitrine.set(d, lista);
  return lista;
}

export const ESTILO_DA_VITRINE = `
  .vetora-animacao .px { animation: vetora-px 6s ease-in-out infinite both; transform-box: fill-box; transform-origin: center; }
  .vetora-animacao .traco { stroke-dasharray: 100; animation: vetora-traco 6s cubic-bezier(.6,0,.3,1) infinite both; }
  .vetora-animacao .miolo { animation: vetora-miolo 6s ease-in-out infinite both; }
  .vetora-animacao .brilho { animation: vetora-brilho 6s ease-in-out infinite both; }
  .vetora-animacao .no, .vetora-animacao .alca { animation: vetora-no 6s cubic-bezier(.3,1.6,.5,1) infinite both; transform-box: fill-box; transform-origin: center; }
  .vetora-animacao .caneta { animation: vetora-caneta 6s linear infinite both; }
  .vetora-animacao .halo { animation: vetora-halo 6s ease-in-out infinite both; transform-origin: 60px 60px; }
  @keyframes vetora-px { 0% { opacity: 0; transform: scale(.2); } 10%, 30% { opacity: .6; transform: scale(1); } 56%, 100% { opacity: 0; transform: scale(.4); } }
  @keyframes vetora-traco { 0%, 22% { stroke-dashoffset: 100; opacity: 1; } 54% { stroke-dashoffset: 0; } 90% { stroke-dashoffset: 0; opacity: 1; } 100% { stroke-dashoffset: 0; opacity: 0; } }
  @keyframes vetora-caneta { 0%, 20% { opacity: 0; } 24%, 54% { opacity: 1; } 60%, 100% { opacity: 0; } }
  @keyframes vetora-miolo { 0%, 54% { opacity: 0; } 68%, 90% { opacity: 1; } 100% { opacity: 0; } }
  @keyframes vetora-brilho { 0%, 62% { transform: translateX(-140px); opacity: 0; } 66% { opacity: .55; } 82% { transform: translateX(140px); opacity: 0; } 100% { transform: translateX(140px); opacity: 0; } }
  @keyframes vetora-no { 0%, 44% { opacity: 0; transform: scale(0); } 54%, 88% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(.4); } }
  @keyframes vetora-halo { 0%, 56% { opacity: 0; transform: scale(.85); } 72% { opacity: .9; transform: scale(1.08); } 90% { opacity: .5; transform: scale(1.12); } 100% { opacity: 0; transform: scale(1.2); } }
  .vetora-entra { animation: vetora-entra .5s ease-out; }
  .vetora-pulso { animation: vetora-pulso 1.1s ease-in-out infinite; }
  @keyframes vetora-pulso { 0%, 100% { opacity: .35; transform: scale(.75); } 50% { opacity: 1; transform: scale(1); } }
  @keyframes vetora-entra { from { opacity: 0; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) {
    .vetora-animacao *, .vetora-entra, .vetora-pulso { animation: none !important; }
    .vetora-animacao .px, .vetora-animacao .caneta, .vetora-animacao .brilho, .vetora-animacao .halo { opacity: 0; }
    .vetora-animacao .traco { stroke-dashoffset: 0; } .vetora-animacao .miolo { opacity: 1; }
  }
`;

export function AnimacaoVetora() {
  const [vez, setVez] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const relogio = setInterval(() => setVez((v) => v + 1), 6000);
    return () => clearInterval(relogio);
  }, []);
  const desenho = DESENHOS_DA_VITRINE[vez % DESENHOS_DA_VITRINE.length]!;
  const pixels = useMemo(() => pixelsDe(desenho.d), [desenho]);
  return (
    <svg key={vez} viewBox="-10 -10 140 140" className="vetora-animacao size-60 overflow-visible text-tinta-apagada" aria-hidden="true">
      <defs>
        <linearGradient id="vetora-cor" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="1" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity=".7" />
        </linearGradient>
        <linearGradient id="vetora-luz" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".7" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="vetora-recorte"><path d={desenho.d} /></clipPath>
        <filter id="vetora-desfoque" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9" /></filter>
      </defs>
      <path className="halo" d={desenho.d} fill="var(--accent)" filter="url(#vetora-desfoque)" />
      {pixels.map(([x, y], k) => (
        <rect key={k} className="px" x={x + 1} y={y + 1} width={6} height={6} rx={1.4} fill="currentColor"
          style={{ animationDelay: `${((x + y) / 240) * 0.5}s` }} />
      ))}
      <path className="miolo" d={desenho.d} fill="url(#vetora-cor)" />
      <g clipPath="url(#vetora-recorte)">
        <rect className="brilho" x={-20} y={-10} width={40} height={140} fill="url(#vetora-luz)" transform="skewX(-20)" />
      </g>
      <path className="traco" pathLength={100} d={desenho.d} fill="none" stroke="var(--accent)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      {desenho.nos.map((n, k) => (
        <g key={k}>
          {(n.h || []).map(([hx, hy], j) => (
            <g key={j} className="alca" style={{ animationDelay: `${k * 0.07}s` }}>
              <line x1={n.x} y1={n.y} x2={hx} y2={hy} stroke="currentColor" strokeWidth={0.9} />
              <circle cx={hx} cy={hy} r={2.4} fill="currentColor" />
            </g>
          ))}
          <rect className="no" x={n.x - 3.5} y={n.y - 3.5} width={7} height={7} rx={1.4} fill="var(--card-bg)" stroke="var(--accent)" strokeWidth={1.8}
            style={{ animationDelay: `${k * 0.07}s` }} />
        </g>
      ))}
      {/* A caneta: a ponta corre a borda enquanto a curva é traçada. */}
      <g className="caneta">
        <animateMotion dur="6s" repeatCount="indefinite" rotate="auto" path={desenho.d}
          keyPoints="0;0;1;1" keyTimes="0;0.22;0.54;1" calcMode="spline"
          keySplines="0 0 1 1;0.6 0 0.3 1;0 0 1 1" />
        <path d="M0 0L-12 -5L-9 0L-12 5Z" fill="var(--accent)" stroke="var(--card-bg)" strokeWidth={1} />
        <circle cx={-14} cy={0} r={2.2} fill="currentColor" />
      </g>
    </svg>
  );
}

