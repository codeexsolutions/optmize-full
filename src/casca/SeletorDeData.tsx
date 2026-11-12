/**
 * ===========================================================================
 * SELETOR DE DATA — um dia, num calendário do Optmize
 * ===========================================================================
 *
 * Pedido do dono (2026-11-11): o `<input type="date">` puro destoava do resto
 * do Optmize. Este é o mesmo campo — um dia só — com a cara do programa: um
 * botão com a data escrita e um calendário de um mês que abre embaixo dele.
 *
 * A data entra e sai como "AAAA-MM-DD", no fuso da máquina — o formato do
 * input de data, para quem chama não mudar nada. `minimo` e `maximo` apagam
 * os dias de fora, como o `min`/`max` do input.
 *
 * Esc e clique fora fecham só o calendário: o Esc é pego antes do modal em
 * volta, para não fechar a caixa inteira junto.
 */

import { useEffect, useRef, useState } from "react";
import { Icone } from "./Icone";

interface Props {
  valor: string;
  aoMudar: (dia: string) => void;
  minimo?: string;
  maximo?: string;
  /** Nome do campo para leitor de tela ("Data inicial"). */
  rotulo?: string;
}

const DIAS_DA_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

const paraTexto = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const paraData = (texto: string) => {
  const [a = 1970, m = 1, d = 1] = texto.split("-").map(Number);
  return new Date(a, m - 1, d);
};

/** "1 de novembro de 2026" — o mês por extenso, como se escreve em português. */
const escrita = (texto: string) =>
  paraData(texto).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });

const nomeDoMes = (ano: number, mes: number) => {
  const nome = new Date(ano, mes, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
};

export function SeletorDeData({ valor, aoMudar, minimo, maximo, rotulo }: Props) {
  const [aberto, setAberto] = useState(false);
  const [vista, setVista] = useState(() => {
    const d = paraData(valor);
    return { ano: d.getFullYear(), mes: d.getMonth() };
  });
  const caixa = useRef<HTMLDivElement>(null);
  const hoje = paraTexto(new Date());

  const abrir = () => {
    const d = paraData(valor);
    setVista({ ano: d.getFullYear(), mes: d.getMonth() });
    setAberto(true);
  };

  useEffect(() => {
    if (!aberto) return;
    const noClique = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const noEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setAberto(false);
    };
    document.addEventListener("mousedown", noClique);
    window.addEventListener("keydown", noEsc, true);
    return () => {
      document.removeEventListener("mousedown", noClique);
      window.removeEventListener("keydown", noEsc, true);
    };
  }, [aberto]);

  const { ano, mes } = vista;
  const primeiro = new Date(ano, mes, 1).getDay();
  const total = new Date(ano, mes + 1, 0).getDate();
  const casas: (string | null)[] = [
    ...Array.from({ length: primeiro }, () => null),
    ...Array.from({ length: total }, (_, i) => paraTexto(new Date(ano, mes, i + 1))),
  ];
  while (casas.length % 7) casas.push(null);

  const foraDoLimite = (dia: string) => (minimo != null && dia < minimo) || (maximo != null && dia > maximo);
  const podeVoltar = minimo == null || paraTexto(new Date(ano, mes, 0)) >= minimo;
  const podeAvancar = maximo == null || paraTexto(new Date(ano, mes + 1, 1)) <= maximo;
  const mover = (n: number) => setVista((v) => {
    const d = new Date(v.ano, v.mes + n, 1);
    return { ano: d.getFullYear(), mes: d.getMonth() };
  });

  const seta = "grid size-8 place-items-center rounded-[8px] text-tinta-fraca transition-colors hover:bg-[var(--surface-hover)] hover:text-tinta disabled:pointer-events-none disabled:opacity-30";

  return (
    <div ref={caixa} className="relative inline-block">
      <button
        type="button"
        onClick={() => (aberto ? setAberto(false) : abrir())}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={rotulo ? `${rotulo}: ${escrita(valor)}` : undefined}
        className={`inline-flex h-10 items-center gap-2.5 rounded-[10px] border bg-painel-suave pr-3.5 pl-3 text-[13.5px] tabular-nums text-tinta transition-colors hover:border-[var(--accent-line)] ${
          aberto ? "border-[var(--accent-line)]" : "border-linha"
        }`}
      >
        <Icone referencia="icones.svg#calendar" className="size-[17px] text-ambar" />
        {escrita(valor)}
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label={rotulo || "Escolher a data"}
          className="animar-entrada absolute top-[calc(100%+6px)] left-0 z-20 w-[316px] rounded-[12px] border border-linha bg-painel p-3.5 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.55)]"
        >
          <div className="mb-2 flex h-8 items-center justify-between">
            <button type="button" onClick={() => mover(-1)} disabled={!podeVoltar} aria-label="Mês anterior" className={seta}>
              <Icone referencia="icones.svg#chevron-left" className="size-4" />
            </button>
            <span className="text-[14px] font-medium text-tinta">{nomeDoMes(ano, mes)}</span>
            <button type="button" onClick={() => mover(1)} disabled={!podeAvancar} aria-label="Próximo mês" className={seta}>
              <Icone referencia="icones.svg#chevron-right" className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-[11px] font-medium text-tinta-apagada">
            {DIAS_DA_SEMANA.map((d, i) => <span key={i} className="py-1">{d}</span>)}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {casas.map((dia, i) => {
              if (!dia) return <span key={i} className="h-10" />;
              const escolhido = dia === valor;
              const bloqueado = foraDoLimite(dia);
              return (
                <button
                  key={dia}
                  type="button"
                  disabled={bloqueado}
                  onClick={() => { setAberto(false); aoMudar(dia); }}
                  className={`relative grid h-10 place-items-center rounded-[9px] font-mono text-[13px] tabular-nums transition-colors ${
                    escolhido
                      ? "bg-ambar font-semibold text-ambar-tinta"
                      : bloqueado
                        ? "cursor-default text-tinta-apagada/40"
                        : "text-tinta-fraca hover:bg-[var(--surface-hover)] hover:text-tinta"
                  }`}
                >
                  {Number(dia.slice(8))}
                  {dia === hoje && !escolhido && (
                    <span className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-ambar" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-linha pt-2.5">
            <span className="text-[12px] text-tinta-apagada">
              {paraData(hoje).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
            </span>
            <button
              type="button"
              disabled={foraDoLimite(hoje)}
              onClick={() => { setAberto(false); aoMudar(hoje); }}
              className="rounded-[7px] px-2.5 py-1 text-[12.5px] text-ambar transition-colors hover:bg-[var(--accent-soft)] disabled:opacity-30"
            >
              Hoje
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
