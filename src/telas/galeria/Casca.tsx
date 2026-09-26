/**
 * ===========================================================================
 * A CASCA DA GALERIA — a lateral de drive e o fundo com aurora
 * ===========================================================================
 *
 * As duas metades da Galeria (os Arquivos e os Projetos da produção) vestem a
 * mesma roupa, e ela mora aqui:
 *
 *   ┌───────────────┬──────────────────────────────────────┐
 *   │ ⌂ Meus arq. 12│  (aurora + grade de pontos)          │
 *   │   ├─ pasta    │   o conteúdo da metade aberta        │
 *   │ ▤ Projetos  5 │                                      │
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
  return (
    <aside className="galeria-lateral flex w-72 shrink-0 flex-col overflow-hidden border-r border-linha">
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pt-4 pb-3">
        <ItemDaNavegacao
          ativo={aba === "arquivos"}
          icone="icones.svg#hard-drive"
          rotulo="Meus arquivos"
          contagem={resumo?.arquivos}
          aoClicar={() => aoTrocar("arquivos")}
        />
        {aba === "arquivos" && <div className="mt-1 mb-3">{children}</div>}

        <ItemDaNavegacao
          ativo={aba === "projetos"}
          icone="icones.svg#folder"
          rotulo="Projetos da produção"
          contagem={resumo?.clientes}
          aoClicar={() => aoTrocar("projetos")}
        />
        {aba === "projetos" && <div className="mt-1 mb-3">{children}</div>}
      </nav>

      <Armazenamento resumo={resumo} />
    </aside>
  );
}

function ItemDaNavegacao({ ativo, icone, rotulo, contagem, aoClicar }: {
  ativo: boolean; icone: string; rotulo: string; contagem: number | undefined; aoClicar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-current={ativo ? "page" : undefined}
      className={[
        "relative mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
        ativo
          ? "bg-[var(--accent-soft)] font-semibold text-ambar"
          : "text-tinta-fraca hover:bg-[var(--surface-hover)] hover:text-tinta",
      ].join(" ")}
    >
      {ativo && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-[var(--accent)] shadow-[0_0_12px_var(--accent)]" />}
      <Icone referencia={icone} className="size-[18px] shrink-0" />
      <span className="min-w-0 flex-1 truncate">{rotulo}</span>
      {contagem !== undefined && (
        <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${ativo ? "bg-[var(--accent-line)] text-tinta" : "bg-[var(--surface-hover)] text-tinta-apagada"}`}>
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
