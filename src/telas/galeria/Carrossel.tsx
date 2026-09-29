/**
 * ===========================================================================
 * O CARROSSEL DA GALERIA — as imagens passando sozinhas no topo
 * ===========================================================================
 *
 * Na raiz, as últimas imagens guardadas em qualquer pasta; dentro de uma
 * pasta, as imagens dela. É a vitrine da Galeria: abrir a tela e ver o
 * trabalho da loja passando, em vez de uma grade de ícones.
 *
 *   - troca sozinho a cada `INTERVALO_MS`, com a imagem nova entrando por cima
 *     da anterior e um zoom lento (o "Ken Burns"), para a foto parada não
 *     parecer congelada;
 *   - a foto aparece INTEIRA (`object-contain`): arte de estampa cortada nas
 *     bordas é arte errada. O que sobra da faixa é a mesma imagem, desfocada,
 *     por trás — nunca uma tarja preta;
 *   - PARA quando o mouse está em cima (quem parou para olhar não quer que a
 *     foto fuja) e quando a janela está escondida;
 *   - setas, pontinhos e o teclado (← →) quando ele tem o foco; clique na foto
 *     abre o visualizador da Galeria.
 */

import { useCallback, useEffect, useState } from "react";
import { Icone } from "../../casca/Icone";
import type { ArquivoDaGaleria } from "../../api/galeria";

const INTERVALO_MS = 5000;
/** Mais que isto, os pontinhos viram uma contagem: 40 bolinhas não se leem. */
const MAX_PONTOS = 12;

type Imagem = ArquivoDaGaleria & { onde?: string };

export function Carrossel({ imagens, aoAbrir }: { imagens: Imagem[]; aoAbrir: (imagem: Imagem) => void }) {
  const [indice, setIndice] = useState(0);
  const [parado, setParado] = useState(false);
  /* Com a janela escondida a troca não acontece; este tique força uma nova
     tentativa no próximo ciclo (mudar o índice para o mesmo valor não faria o
     efeito rodar de novo, e o carrossel ficaria parado para sempre). */
  const [tique, setTique] = useState(0);
  const total = imagens.length;

  // A lista mudou (outra pasta, imagem nova): volta para o começo se o índice sobrou.
  useEffect(() => {
    if (indice >= total) setIndice(0);
  }, [indice, total]);

  const ir = useCallback((passo: number) => {
    setIndice((atual) => (atual + passo + total) % total);
  }, [total]);

  // A troca automática. O `indice` na dependência reinicia o relógio a cada
  // troca — assim a seta à mão não deixa a próxima vir meio segundo depois.
  useEffect(() => {
    if (total < 2 || parado) return;
    const relogio = window.setTimeout(() => {
      if (document.visibilityState === "visible") ir(1);
      else setTique((t) => t + 1); // escondida: tenta de novo no próximo ciclo
    }, INTERVALO_MS);
    return () => window.clearTimeout(relogio);
  }, [indice, total, parado, ir, tique]);

  if (total === 0) return null;
  const atual = imagens[Math.min(indice, total - 1)]!;

  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Imagens da Galeria"
      tabIndex={0}
      onMouseEnter={() => setParado(true)}
      onMouseLeave={() => setParado(false)}
      onFocus={() => setParado(true)}
      onBlur={() => setParado(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") ir(1);
        if (e.key === "ArrowLeft") ir(-1);
      }}
      className="galeria-vidro group relative mb-7 h-[260px] overflow-hidden rounded-2xl outline-none focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] sm:h-[320px] xl:h-[360px]"
    >
      {imagens.map((imagem, i) => {
        const ativa = i === indice;
        // Só a atual e as vizinhas carregam: vinte fotos grandes de uma vez
        // pesariam na abertura da tela sem ninguém estar olhando para elas.
        const perto = Math.abs(i - indice) <= 1 || (indice === 0 && i === total - 1) || (indice === total - 1 && i === 0);
        return (
          <div
            key={imagem.id}
            aria-hidden={!ativa}
            className={`absolute inset-0 transition-opacity duration-700 ease-out ${ativa ? "opacity-100" : "pointer-events-none opacity-0"}`}
          >
            {perto && (
              <>
                {/* O fundo: a mesma foto, desfocada, cobrindo a faixa inteira. */}
                <img
                  src={imagem.miniatura || imagem.url}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 size-full scale-125 object-cover opacity-45 blur-2xl"
                />
                <button
                  type="button"
                  onClick={() => aoAbrir(imagem)}
                  tabIndex={ativa ? 0 : -1}
                  title={`Abrir ${imagem.nome}`}
                  className="absolute inset-0 grid cursor-zoom-in place-items-center p-4 pb-14"
                >
                  <img
                    src={imagem.url}
                    alt={imagem.nome}
                    draggable={false}
                    className={[
                      "max-h-full max-w-full rounded-lg object-contain shadow-[0_18px_50px_-20px_rgba(0,0,0,0.8)]",
                      "transition-transform ease-linear",
                      ativa ? "scale-[1.04] duration-[6000ms]" : "scale-100 duration-0",
                    ].join(" ")}
                  />
                </button>
              </>
            )}
          </div>
        );
      })}

      {/* A legenda, sobre um degradê que a separa da foto. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-5 pt-10 pb-4">
        <div className="min-w-0">
          <p className="m-0 truncate text-sm font-semibold text-white">{atual.nome}</p>
          {atual.onde && <p className="m-0 mt-0.5 truncate text-[11px] text-white/70">{atual.onde}</p>}
        </div>
        <span className="shrink-0 rounded-full bg-black/40 px-2.5 py-0.5 font-mono text-[11px] text-white/80">
          {indice + 1} / {total}
        </span>
      </div>

      {total > 1 && (
        <>
          <Seta lado="esquerda" aoClicar={() => ir(-1)} />
          <Seta lado="direita" aoClicar={() => ir(1)} />

          {total <= MAX_PONTOS && (
            <div className="absolute top-3 left-1/2 flex -translate-x-1/2 gap-1.5">
              {imagens.map((imagem, i) => (
                <button
                  key={imagem.id}
                  type="button"
                  aria-label={`Imagem ${i + 1}`}
                  onClick={() => setIndice(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === indice ? "w-5 bg-white" : "w-1.5 bg-white/45 hover:bg-white/70"}`}
                />
              ))}
            </div>
          )}

          {/* O tempo até a próxima: enche, e recomeça a cada troca. Para junto
              com o carrossel (mouse em cima). */}
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10">
            <div
              key={`${indice}-${parado}`}
              className="h-full origin-left bg-ambar"
              style={{
                animation: parado ? "none" : `galeria-carrossel-tempo ${INTERVALO_MS}ms linear forwards`,
                transform: parado ? "scaleX(0)" : undefined,
              }}
            />
          </div>
        </>
      )}
    </section>
  );
}

function Seta({ lado, aoClicar }: { lado: "esquerda" | "direita"; aoClicar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-label={lado === "esquerda" ? "Imagem anterior" : "Próxima imagem"}
      className={[
        "absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full",
        "bg-black/35 text-white opacity-0 backdrop-blur-sm transition-all duration-200",
        "group-hover:opacity-100 group-focus-visible:opacity-100 hover:bg-black/55",
        lado === "esquerda" ? "left-3" : "right-3",
      ].join(" ")}
    >
      <Icone referencia="icones.svg#chevron-right" className={`size-5 ${lado === "esquerda" ? "rotate-180" : ""}`} />
    </button>
  );
}
