/**
 * Como número aparece na tela.
 *
 * Veio de `public/ui.js`, onde os três moravam pendurados no `window` porque
 * era assim que os `<script>` soltos se enxergavam. Aqui são `export`, e a
 * conta é a mesma.
 *
 * `pt-BR` em todos: vírgula decimal e ponto de milhar. Um "1.234,5" lido como
 * "1234.5" numa tela de produção é um erro de mil vezes.
 */

/** Um número com casas decimais fixas, no formato daqui. */
export function formatarNumero(valor: number | null | undefined, casas = 1): string {
  return Number(valor || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

/** Centímetros — a unidade em que molde e arte são medidos. */
export function formatarCm(valor: number | null | undefined): string {
  return `${formatarNumero(valor, 1)} cm`;
}

/** Milissegundos viram segundos: é a escala do que a pessoa espera olhando. */
export function formatarSegundos(ms: number | null | undefined, casas = 1): string {
  return `${formatarNumero((Number(ms) || 0) / 1000, casas)} s`;
}

/** Metragem de tecido, recebida em centímetros: "5,32 m". */
export function formatarMetros(cm: number | null | undefined): string {
  return `${formatarNumero((Number(cm) || 0) / 100, 2)} m`;
}

/** Área: "8,00 m²". */
export function formatarM2(m2: number | null | undefined): string {
  return `${formatarNumero(m2, 2)} m²`;
}

/** Porcentagem: "70,0%". */
export function formatarPorcento(pct: number | null | undefined, casas = 1): string {
  return `${formatarNumero(pct, casas)}%`;
}
