/**
 * ===========================================================================
 * O PLAYER — os vídeos do programa, com os controles da casa
 * ===========================================================================
 *
 * Pedido do dono (2026-10-27): players "totalmente personalizados e mais
 * bonitos". O controle nativo do WebView2 é o do Edge — cinza, pequeno, com
 * um menu de três pontos que oferece "baixar" e "imagem dentro de imagem".
 * Este é desenhado aqui, nas cores do Optmize:
 *
 *   - o botão grande no meio quando está parado;
 *   - a barra embaixo, que some enquanto o vídeo corre e volta com o mouse;
 *   - a linha do tempo com os CAPÍTULOS marcados (o "Como usar o Encaixe"
 *     tem seis), e o nome do capítulo e o tempo no balão ao passar o mouse;
 *   - voltar e avançar 10 s, velocidade, som e tela cheia;
 *   - o teclado: espaço ou K para tocar, ← e → para andar 5 s, M para o som,
 *     F para a tela cheia.
 *
 * `vitrine` é o jeito da tela trancada (`casca/Escopos.tsx`): mudo, em
 * repetição, sem barra — ele mostra a tela trabalhando, não ensina.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export interface Capitulo {
  titulo: string;
  /** Em segundos do vídeo. */
  inicio: number;
}

const VELOCIDADES = [1, 1.25, 1.5, 2];

function relogio(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) return "0:00";
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function capituloEm(capitulos: Capitulo[] | undefined, t: number): Capitulo | null {
  if (!capitulos || capitulos.length === 0) return null;
  let atual: Capitulo | null = null;
  for (const c of capitulos) if (c.inicio <= t + 0.05) atual = c;
  return atual;
}

/* Os ícones do player moram aqui: o sprite do programa não tem play nem som. */
const Svg = ({ children, className = "size-5" }: { children: ReactNode; className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const IconePlay = ({ className }: { className?: string }) => (
  <Svg className={className}><path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" /></Svg>
);
const IconePausa = ({ className }: { className?: string }) => (
  <Svg className={className}><rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none" /><rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none" /></Svg>
);
const IconeVoltar = () => (
  <Svg><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v4h4" /><text x="12" y="15.5" fontSize="7.5" textAnchor="middle" fill="currentColor" stroke="none" fontWeight="700">10</text></Svg>
);
const IconeAvancar = () => (
  <Svg><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v4h-4" /><text x="12" y="15.5" fontSize="7.5" textAnchor="middle" fill="currentColor" stroke="none" fontWeight="700">10</text></Svg>
);
const IconeSom = ({ mudo }: { mudo: boolean }) => (
  <Svg>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none" />
    {mudo ? <><path d="M16 9.5l5 5" /><path d="M21 9.5l-5 5" /></> : <><path d="M15.5 9a4.5 4.5 0 0 1 0 6" /><path d="M18.5 6.5a8 8 0 0 1 0 11" /></>}
  </Svg>
);
const IconeTelaCheia = ({ cheia }: { cheia: boolean }) => (
  <Svg>
    {cheia
      ? <><path d="M9 4v5H4" /><path d="M15 4v5h5" /><path d="M9 20v-5H4" /><path d="M15 20v-5h5" /></>
      : <><path d="M4 9V4h5" /><path d="M20 9V4h-5" /><path d="M4 15v5h5" /><path d="M20 15v5h-5" /></>}
  </Svg>
);

const BOTAO = "grid size-9 shrink-0 place-items-center rounded-lg text-white/85 transition-colors hover:bg-white/10 hover:text-white";

export function PlayerDeVideo({
  src,
  poster,
  capitulos,
  vitrine = false,
  autoPlay = true,
  rotulo,
  className = "",
}: {
  src: string;
  poster?: string;
  capitulos?: Capitulo[];
  vitrine?: boolean;
  autoPlay?: boolean;
  rotulo?: string;
  className?: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const trilho = useRef<HTMLDivElement>(null);
  const [tocando, setTocando] = useState(false);
  const [tempo, setTempo] = useState(0);
  const [duracao, setDuracao] = useState(0);
  const [carregado, setCarregado] = useState(0);
  const [mudo, setMudo] = useState(vitrine);
  const [volume, setVolume] = useState(1);
  const [velocidade, setVelocidade] = useState(1);
  const [cheia, setCheia] = useState(false);
  const [mostrarBarra, setMostrarBarra] = useState(true);
  const [sobre, setSobre] = useState<{ x: number; t: number } | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const esconder = useRef<number | undefined>(undefined);

  const v = () => video.current;

  const alternar = useCallback(() => {
    const el = v();
    if (!el) return;
    if (el.paused || el.ended) void el.play().catch(() => {});
    else el.pause();
  }, []);

  const andar = useCallback((segundos: number) => {
    const el = v();
    if (!el) return;
    el.currentTime = Math.min(Math.max(0, el.currentTime + segundos), el.duration || 0);
  }, []);

  const alternarSom = useCallback(() => {
    const el = v();
    if (!el) return;
    el.muted = !el.muted;
    if (!el.muted && el.volume === 0) el.volume = 0.6;
  }, []);

  const alternarTelaCheia = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void caixa.current?.requestFullscreen().catch(() => {});
  }, []);

  // A barra some 2,5 s depois do último movimento — só com o vídeo correndo.
  const acordar = useCallback(() => {
    setMostrarBarra(true);
    window.clearTimeout(esconder.current);
    esconder.current = window.setTimeout(() => {
      if (v() && !v()!.paused) setMostrarBarra(false);
    }, 2500);
  }, []);
  useEffect(() => () => window.clearTimeout(esconder.current), []);

  useEffect(() => {
    const aoMudar = () => setCheia(document.fullscreenElement === caixa.current);
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, []);

  // Teclado: só quando o player é o que está na frente (sem campo de texto em foco).
  useEffect(() => {
    if (vitrine) return;
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if (k === " " || k === "k") { e.preventDefault(); alternar(); acordar(); }
      else if (k === "arrowleft") { e.preventDefault(); andar(-5); acordar(); }
      else if (k === "arrowright") { e.preventDefault(); andar(5); acordar(); }
      else if (k === "m") { alternarSom(); acordar(); }
      else if (k === "f") { alternarTelaCheia(); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [vitrine, alternar, andar, alternarSom, alternarTelaCheia, acordar]);

  // A posição do mouse na linha do tempo, em segundos.
  const tempoNoTrilho = (clientX: number) => {
    const r = trilho.current?.getBoundingClientRect();
    if (!r || !duracao) return { x: 0, t: 0 };
    const x = Math.min(Math.max(0, clientX - r.left), r.width);
    return { x, t: (x / r.width) * duracao };
  };
  const irPara = (clientX: number) => {
    const el = v();
    if (!el || !duracao) return;
    el.currentTime = tempoNoTrilho(clientX).t;
  };

  useEffect(() => {
    if (!arrastando) return;
    const mover = (e: PointerEvent) => { irPara(e.clientX); setSobre(tempoNoTrilho(e.clientX)); };
    const soltar = () => setArrastando(false);
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    return () => { window.removeEventListener("pointermove", mover); window.removeEventListener("pointerup", soltar); };
  });

  const progresso = duracao ? (tempo / duracao) * 100 : 0;
  const capituloAtual = capituloEm(capitulos, tempo);
  const capituloSobre = sobre ? capituloEm(capitulos, sobre.t) : null;
  const barraVisivel = !vitrine && (mostrarBarra || !tocando || arrastando);

  return (
    <div
      ref={caixa}
      className={`group/player relative overflow-hidden bg-black ${cheia ? "" : "aspect-video"} ${barraVisivel || vitrine ? "" : "cursor-none"} ${className}`}
      onPointerMove={vitrine ? undefined : acordar}
      onPointerLeave={() => { if (v() && !v()!.paused) setMostrarBarra(false); setSobre(null); }}
    >
      <video
        ref={video}
        src={src}
        poster={poster}
        className="absolute inset-0 size-full object-contain"
        autoPlay={autoPlay}
        muted={vitrine}
        loop={vitrine}
        playsInline
        aria-label={rotulo}
        onClick={vitrine ? undefined : () => { alternar(); acordar(); }}
        onDoubleClick={vitrine ? undefined : alternarTelaCheia}
        onPlay={() => { setTocando(true); acordar(); }}
        onPause={() => { setTocando(false); setMostrarBarra(true); }}
        onTimeUpdate={(e) => setTempo(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuracao(e.currentTarget.duration)}
        onDurationChange={(e) => setDuracao(e.currentTarget.duration)}
        onProgress={(e) => {
          const el = e.currentTarget;
          if (el.buffered.length && el.duration) setCarregado((el.buffered.end(el.buffered.length - 1) / el.duration) * 100);
        }}
        onVolumeChange={(e) => { setMudo(e.currentTarget.muted); setVolume(e.currentTarget.volume); }}
        onRateChange={(e) => setVelocidade(e.currentTarget.playbackRate)}
      />

      {/* O botão do meio: parado, ou no fim. */}
      {!vitrine && !tocando && (
        <button
          type="button"
          onClick={() => { alternar(); acordar(); }}
          aria-label={tempo > 0 && tempo >= duracao - 0.2 ? "Ver de novo" : "Tocar"}
          className="absolute top-1/2 left-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-ambar text-ambar-tinta shadow-[0_0_0_10px_color-mix(in_srgb,var(--accent)_22%,transparent),0_20px_60px_rgba(0,0,0,.6)] transition-transform duration-200 hover:scale-105"
        >
          <IconePlay className="ml-1 size-9" />
        </button>
      )}

      {/* A barra de baixo. */}
      {!vitrine && (
        <div
          className={`absolute inset-x-0 bottom-0 px-4 pt-14 pb-3 transition-opacity duration-300 ${barraVisivel ? "opacity-100" : "pointer-events-none opacity-0"}`}
          style={{ background: "linear-gradient(to top, rgba(0,0,0,.85), rgba(0,0,0,.45) 55%, transparent)" }}
        >
          {/* A linha do tempo, com os capítulos. */}
          <div
            ref={trilho}
            className="group/trilho relative h-5 cursor-pointer touch-none"
            onPointerDown={(e) => { setArrastando(true); irPara(e.clientX); }}
            onPointerMove={(e) => setSobre(tempoNoTrilho(e.clientX))}
            onPointerLeave={() => { if (!arrastando) setSobre(null); }}
            role="slider"
            aria-label="Posição do vídeo"
            aria-valuemin={0}
            aria-valuemax={Math.round(duracao)}
            aria-valuenow={Math.round(tempo)}
          >
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/20 transition-[height] duration-150 group-hover/trilho:h-1.5">
              <div className="absolute inset-y-0 left-0 bg-white/25" style={{ width: `${carregado}%` }} />
              <div className="absolute inset-y-0 left-0 bg-ambar" style={{ width: `${progresso}%` }} />
            </div>
            {/* Os cortes entre capítulos: um vão escuro na linha. */}
            {duracao > 0 && capitulos?.slice(1).map((c) => (
              <span
                key={c.inicio}
                aria-hidden="true"
                className="absolute top-1/2 h-2 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/70"
                style={{ left: `${(c.inicio / duracao) * 100}%` }}
              />
            ))}
            <span
              aria-hidden="true"
              className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_4px_color-mix(in_srgb,var(--accent)_45%,transparent)] transition-transform duration-150 group-hover/trilho:scale-110"
              style={{ left: `${progresso}%` }}
            />
            {sobre && duracao > 0 && (
              <span
                className="pointer-events-none absolute bottom-6 -translate-x-1/2 rounded-md border border-white/10 bg-black/90 px-2 py-1 text-center text-[11.5px] whitespace-nowrap text-white"
                style={{ left: Math.min(Math.max(sobre.x, 40), (trilho.current?.clientWidth ?? 0) - 40) }}
              >
                {capituloSobre && <span className="block text-ambar">{capituloSobre.titulo}</span>}
                <span className="font-mono">{relogio(sobre.t)}</span>
              </span>
            )}
          </div>

          <div className="mt-1.5 flex items-center gap-1">
            <button type="button" className={BOTAO} onClick={alternar} aria-label={tocando ? "Pausar" : "Tocar"}>
              {tocando ? <IconePausa /> : <IconePlay />}
            </button>
            <button type="button" className={BOTAO} onClick={() => andar(-10)} aria-label="Voltar 10 segundos"><IconeVoltar /></button>
            <button type="button" className={BOTAO} onClick={() => andar(10)} aria-label="Avançar 10 segundos"><IconeAvancar /></button>

            {/* O som: o botão, e o volume que abre ao passar o mouse. */}
            <div className="group/som flex items-center">
              <button type="button" className={BOTAO} onClick={alternarSom} aria-label={mudo ? "Ligar o som" : "Tirar o som"}>
                <IconeSom mudo={mudo || volume === 0} />
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={mudo ? 0 : volume}
                onChange={(e) => {
                  const el = v();
                  if (!el) return;
                  el.volume = Number(e.target.value);
                  el.muted = el.volume === 0;
                }}
                aria-label="Volume"
                className="player-volume w-0 opacity-0 transition-[width,opacity] duration-200 group-hover/som:w-20 group-hover/som:opacity-100 focus-visible:w-20 focus-visible:opacity-100"
                style={{ ["--cheio" as string]: `${(mudo ? 0 : volume) * 100}%` }}
              />
            </div>

            <span className="ml-2 font-mono text-[12px] text-white/80 tabular-nums">
              {relogio(tempo)} <span className="text-white/40">/ {relogio(duracao)}</span>
            </span>
            {capituloAtual && (
              <span className="ml-3 hidden truncate text-[12.5px] text-white/80 sm:inline">
                <span className="text-white/40">·</span> {capituloAtual.titulo}
              </span>
            )}

            <span className="flex-1" />

            <button
              type="button"
              onClick={() => {
                const el = v();
                if (!el) return;
                el.playbackRate = VELOCIDADES[(VELOCIDADES.indexOf(velocidade) + 1) % VELOCIDADES.length]!;
              }}
              className="h-7 min-w-12 rounded-md border border-white/15 px-2 font-mono text-[12px] text-white/85 transition-colors hover:border-ambar hover:text-white"
              aria-label="Velocidade"
              title="Velocidade"
            >
              {velocidade.toLocaleString("pt-BR")}×
            </button>
            <button type="button" className={BOTAO} onClick={alternarTelaCheia} aria-label={cheia ? "Sair da tela cheia" : "Tela cheia"}>
              <IconeTelaCheia cheia={cheia} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
