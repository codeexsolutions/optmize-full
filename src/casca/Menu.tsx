/**
 * O menu lateral.
 *
 * No computador ele fica fixo à esquerda. No celular vira gaveta: sai da tela
 * até alguém tocar no botão do cabeçalho, e fecha ao escolher uma tela, ao
 * clicar fora ou no Esc.
 */

import { useEffect } from "react";
import { Icone } from "./Icone";
import { TELAS, type NomeDeTela } from "../rotas";

interface Props {
  atual: NomeDeTela;
  aberto: boolean;
  aoEscolher: (nome: NomeDeTela) => void;
  aoFechar: () => void;
}

export function Menu({ atual, aberto, aoEscolher, aoFechar }: Props) {
  useEffect(() => {
    if (!aberto) return;
    const noEsc = (evento: KeyboardEvent) => { if (evento.key === "Escape") aoFechar(); };
    window.addEventListener("keydown", noEsc);
    return () => window.removeEventListener("keydown", noEsc);
  }, [aberto, aoFechar]);

  return (
    <>
      {/* A cortina só existe no celular, e só com a gaveta aberta. */}
      {aberto && (
        <div
          aria-hidden="true"
          onClick={aoFechar}
          className="fixed inset-0 z-70 bg-black/65 tela:hidden"
        />
      )}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-80 flex w-[244px] flex-col gap-[18px] overflow-y-auto border-r border-[var(--border-hairline)] bg-[var(--sidebar-bg)] px-4 pt-[22px] pb-[17px] transition-transform duration-200",
          aberto ? "translate-x-0" : "-translate-x-[105%]",
          "tela:translate-x-0",
        ].join(" ")}
      >
        <div className="flex items-center gap-3 px-[7px] pt-0.5 pb-[18px]">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-[11px] border border-[var(--accent-line)] bg-ambar font-titulo text-[13px] font-bold tracking-[-0.02em] text-ambar-tinta shadow-[0_8px_18px_rgba(0,0,0,0.4)]"
          >
            OP
          </span>
          <span className="flex min-w-0 flex-col leading-[1.15]">
            <span className="text-[1.02rem] font-bold tracking-[0.01em] text-tinta">Optimize</span>
            <small className="mt-1 text-[0.68rem] tracking-[0.03em] text-tinta-apagada">Moldes &amp; encaixe</small>
          </span>
        </div>

        <nav className="flex flex-col gap-[3px]">
          {TELAS.map((tela) => {
            const ativa = tela.nome === atual;
            return (
              <button
                key={tela.nome}
                type="button"
                aria-current={ativa ? "page" : undefined}
                onClick={() => { aoEscolher(tela.nome); aoFechar(); }}
                className={[
                  "flex items-center gap-[11px] rounded-[11px] px-3 py-[7px] text-left transition-colors",
                  ativa ? "bg-painel-suave text-tinta" : "text-tinta-fraca hover:bg-painel-suave hover:text-tinta",
                ].join(" ")}
              >
                <Icone
                  referencia={tela.icone}
                  className={[
                    "size-[30px] shrink-0 rounded-lg border p-1.5",
                    ativa ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-ambar" : "border-linha",
                  ].join(" ")}
                />
                <span className="grid min-w-0 gap-0.5">
                  <strong className="truncate text-[0.9rem] font-semibold">{tela.rotulo}</strong>
                  <small className="truncate text-[0.68rem] text-tinta-apagada">{tela.apoioMenu}</small>
                </span>
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
