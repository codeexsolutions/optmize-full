/**
 * ===========================================================================
 * A CASCA DA GALERIA — a lateral de drive e o fundo com aurora
 * ===========================================================================
 *
 * As duas abas da Galeria (a Galeria de arquivos e os Projetos da produção) vestem a
 * mesma roupa, e ela mora aqui:
 *
 *   ┌───────────────┬──────────────────────────────────────┐
 *   │[Galeria|Proj.]│  (aurora + grade de pontos)          │
 *   │ ───────────── │   o conteúdo da metade aberta        │
 *   │ ├─ pasta      │                                      │
 *   │ ├─ pasta      │                                      │
 *   │ ───────────── │                                      │
 *   │ armazenamento │                                      │
 *   └───────────────┴──────────────────────────────────────┘
 *
 * Cada metade continua dona do próprio estado e da própria árvore; a casca só
 * desenha a moldura e troca de metade. Criar e enviar ficam nos botões do
 * topo de cada metade — a lateral é só para navegar. O efeito do fundo está em
 * `estilo/galeria.css`.
 */

import { useCallback, useEffect, useState, type HTMLAttributes, type ReactNode } from "react";
import { Icone } from "../../casca/Icone";
import { api } from "../../api/cliente";
import type { ArquivoDaGaleria } from "../../api/galeria";

export type AbaDaGaleria = "projetos" | "arquivos";

export interface ResumoDaGaleria {
  arquivos: number;
  bytes: number;
  pastas: number;
  clientes: number;
  projetos: number;
  recentes: ArquivoDaGaleria[];
  disco: { total: number; livre: number } | null;
}

/** O que as duas metades recebem da casca para desenhar a lateral. */
export interface NavegacaoDaGaleria {
  aba: AbaDaGaleria;
  aoTrocar: (aba: AbaDaGaleria) => void;
  resumo: ResumoDaGaleria | null;
  /** Chamado depois de toda mudança: os números da lateral acompanham. */
  atualizarResumo: () => void;
}

export function useResumoDaGaleria() {
  const [resumo, setResumo] = useState<ResumoDaGaleria | null>(null);
  const atualizar = useCallback(() => {
    api.get<ResumoDaGaleria>("/galeria/resumo").then(setResumo).catch(() => {});
  }, []);
  useEffect(atualizar, [atualizar]);
  return [resumo, atualizar] as const;
}

// ==================== A LATERAL ====================

export function LateralDaGaleria({ nav, children }: {
  nav: NavegacaoDaGaleria;
  /** A árvore da metade aberta, pendurada embaixo do item dela. */
  children: ReactNode;
}) {
  const { aba, aoTrocar, resumo } = nav;
  const posicao = usePosicaoDoSeletor(aba);
  return (
    <aside className="galeria-lateral flex w-72 shrink-0 flex-col overflow-hidden border-r border-linha">
      {/*
        As duas metades são ABAS, lado a lado no alto — e não itens de uma
        lista, que misturavam a troca de metade com a árvore da metade aberta.
      */}
      <div className="shrink-0 border-b border-linha p-3">
        <div role="tablist" aria-label="Galeria" className="galeria-vidro relative grid grid-cols-2 gap-1 rounded-xl p-1">
          {/*
            O SELETOR. Um só, que desliza de uma aba para a outra — em vez de
            cada aba acender o próprio fundo, que só pisca. Ocupa meia barra
            menos a folga (p-1 dos lados, gap-1 no meio), e anda uma largura
            dele mais o gap.
          */}
          <span
            aria-hidden
            className="pointer-events-none absolute top-1 bottom-1 left-1 w-[calc(50%-6px)] rounded-lg bg-[var(--accent-soft)] shadow-[inset_0_0_0_1px_var(--accent-line),0_0_14px_var(--accent-soft)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            style={{ transform: posicao === "projetos" ? "translateX(calc(100% + 4px))" : "translateX(0)" }}
          />
          <AbaDaLateral
            ativo={aba === "arquivos"}
            icone="icones.svg#image"
            rotulo="Galeria"
            contagem={resumo?.arquivos}
            aoClicar={() => aoTrocar("arquivos")}
          />
          <AbaDaLateral
            ativo={aba === "projetos"}
            icone="icones.svg#folder"
            rotulo="Projetos"
            dica="Projetos da produção"
            contagem={resumo?.clientes}
            aoClicar={() => aoTrocar("projetos")}
          />
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-3">
        <p className="mt-0 mb-1.5 px-2 text-[10px] font-bold tracking-widest text-tinta-apagada uppercase">
          {aba === "arquivos" ? "Pastas" : "Clientes"}
        </p>
        {children}
      </nav>

      <Armazenamento resumo={resumo} />
    </aside>
  );
}

/**
 * Onde o seletor está desenhado.
 *
 * Cada metade desenha a PRÓPRIA lateral, então trocar de aba remonta esta
 * aqui — e o seletor nasceria já no lugar novo, sem deslizar. Por isso a
 * lateral nova começa onde a velha parou (`ultimaAba`, que sobrevive à
 * remontagem) e só no quadro seguinte vai para a aba da vez: é essa troca
 * que a transição anima.
 */
let ultimaAba: AbaDaGaleria | null = null;

function usePosicaoDoSeletor(aba: AbaDaGaleria) {
  const [posicao, setPosicao] = useState<AbaDaGaleria>(ultimaAba ?? aba);
  useEffect(() => {
    ultimaAba = aba;
    if (posicao === aba) return;
    // Dois quadros: o primeiro pinta a posição velha, o segundo pede a nova.
    let quadro = requestAnimationFrame(() => {
      quadro = requestAnimationFrame(() => setPosicao(aba));
    });
    return () => cancelAnimationFrame(quadro);
  }, [aba, posicao]);
  return posicao;
}

function AbaDaLateral({ ativo, icone, rotulo, dica, contagem, aoClicar }: {
  ativo: boolean; icone: string; rotulo: string; dica?: string; contagem: number | undefined; aoClicar: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={ativo}
      onClick={aoClicar}
      title={dica ?? rotulo}
      className={[
        // O fundo da aba ativa é o seletor que desliza (acima); aqui só a cor
        // do texto muda, e acompanha o tempo dele.
        "relative flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[13px] font-semibold transition-colors duration-300",
        ativo
          ? "text-ambar"
          : "text-tinta-fraca hover:text-tinta",
      ].join(" ")}
    >
      <Icone referencia={icone} className="size-4 shrink-0" />
      <span className="truncate">{rotulo}</span>
      {contagem !== undefined && (
        <span className={`rounded-full px-1.5 py-px font-mono text-[10px] transition-colors duration-300 ${ativo ? "bg-[var(--accent-line)] text-tinta" : "bg-[var(--surface-hover)] text-tinta-apagada"}`}>
          {contagem}
        </span>
      )}
    </button>
  );
}

function Armazenamento({ resumo }: { resumo: ResumoDaGaleria | null }) {
  const disco = resumo?.disco;
  const ocupado = disco && disco.total > 0 ? (disco.total - disco.livre) / disco.total : null;
  return (
    <div className="shrink-0 border-t border-linha p-4">
      <div className="galeria-vidro rounded-2xl p-3.5">
        <div className="flex items-center gap-2 text-xs text-tinta-fraca">
          <Icone referencia="icones.svg#cloud-upload" className="size-4 text-ambar" />
          Armazenamento
        </div>
        <p className="mt-1.5 mb-0 font-titulo text-lg font-semibold text-tinta">
          {resumo ? tamanhoLegivel(resumo.bytes) : "—"}
          <span className="ml-1 text-xs font-normal text-tinta-apagada">na Galeria</span>
        </p>
        {ocupado !== null && disco && (
          <>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-hover)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--accent-dark)] to-[var(--accent-bright)]"
                style={{ width: `${Math.max(2, Math.round(ocupado * 100))}%` }}
              />
            </div>
            <p className="mt-1.5 mb-0 text-[11px] text-tinta-apagada">
              {tamanhoLegivel(disco.livre)} livres de {tamanhoLegivel(disco.total)} no disco
            </p>
          </>
        )}
        {resumo && (
          <p className="mt-1 mb-0 font-mono text-[10px] text-tinta-apagada">
            {resumo.arquivos} arquivo(s) · {resumo.pastas} pasta(s) · {resumo.projetos} projeto(s)
          </p>
        )}
      </div>
    </div>
  );
}

// ==================== O FUNDO ====================

/** A área principal, sobre o fundo com aurora (ver `estilo/galeria.css`). */
export function FundoDaGaleria({ children, className = "", ...resto }: {
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLElement>) {
  return (
    <section {...resto} className={`galeria-fundo flex min-w-0 flex-1 flex-col ${className}`}>
      {children}
    </section>
  );
}

// ==================== CONTAS ====================

export function tamanhoLegivel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const unidades = ["KB", "MB", "GB", "TB"];
  let valor = bytes / 1024;
  let i = 0;
  while (valor >= 1024 && i < unidades.length - 1) { valor /= 1024; i++; }
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: valor < 10 ? 1 : 0 })} ${unidades[i]}`;
}
