/**
 * ===========================================================================
 * BOTÃO — o mesmo desenho do Optmize Lite
 * ===========================================================================
 *
 * Quatro jeitos (`primario`, `secundario`, `fantasma`, `perigo`) e três
 * tamanhos, copiados do `components/ui/Button.tsx` da Lite para a tela de
 * Projetos sair igual à de lá.
 *
 * As cores saem dos TOKENS deste projeto, e não da escala `brand-*`/`surface-*`
 * da Lite. Quando esta tela veio de lá as duas paletas eram a mesma — o
 * laranja da Lite é `#f97316`, que era o `--accent` daqui. Hoje o acento é o
 * laranja do logo (`#ff531f`, ver `estilo/tokens.css`), e é justamente por
 * ler o token que este botão mudou junto com o resto do sistema, sem ninguém
 * precisar abrir este arquivo. Escrever a escala da Lite aqui seria uma
 * segunda paleta no projeto, esperando divergir da primeira.
 *
 * Os cantos são `rounded-xl` como lá — mais redondos que os do resto desta
 * casca, e é isso que dá o ar da Lite à tela.
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Jeito = "primario" | "secundario" | "fantasma" | "perigo";
type Tamanho = "pequeno" | "medio" | "grande";

const JEITOS: Record<Jeito, string> = {
  primario:
    "bg-ambar text-ambar-tinta shadow-lg shadow-black/40 hover:bg-[var(--accent-bright)]" +
    " disabled:bg-[var(--border)] disabled:text-tinta-apagada disabled:shadow-none",
  secundario:
    "border border-linha bg-painel-suave text-tinta-fraca hover:border-[var(--accent-line)]" +
    " hover:bg-[var(--surface-hover)] hover:text-tinta disabled:text-tinta-apagada",
  fantasma:
    "text-tinta-fraca hover:bg-[var(--surface-hover)] hover:text-tinta disabled:text-tinta-apagada",
  perigo:
    "border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]" +
    " text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] disabled:text-tinta-apagada",
};

const TAMANHOS: Record<Tamanho, string> = {
  pequeno: "h-8 gap-1.5 px-3 text-xs",
  medio: "h-10 gap-2 px-4 text-sm",
  grande: "h-11 gap-2 px-5 text-sm",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  jeito?: Jeito;
  tamanho?: Tamanho;
  icone?: ReactNode;
  larguraCheia?: boolean;
}

export function Botao({
  jeito = "secundario",
  tamanho = "medio",
  icone,
  larguraCheia = false,
  children,
  className = "",
  ...resto
}: Props) {
  return (
    <button
      type="button"
      {...resto}
      className={[
        "inline-flex shrink-0 items-center justify-center rounded-xl font-semibold transition-colors",
        JEITOS[jeito],
        TAMANHOS[tamanho],
        larguraCheia ? "w-full" : "",
        className,
      ].join(" ")}
    >
      {icone}
      {children}
    </button>
  );
}

/** Botão só de ícone, para barras de ferramenta densas. */
export function BotaoDeIcone({
  children,
  title,
  perigoso = false,
  className = "",
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & { perigoso?: boolean }) {
  return (
    <button
      type="button"
      {...resto}
      title={title}
      aria-label={title}
      className={[
        "grid size-8 shrink-0 place-items-center rounded-lg text-tinta-fraca transition-colors",
        perigoso
          ? "hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] hover:text-[var(--danger)]"
          : "hover:bg-[var(--surface-hover)] hover:text-ambar",
        "disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-tinta-fraca",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}
