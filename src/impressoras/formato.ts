/**
 * Como os números das impressoras aparecem na tela.
 *
 * Fica separado das telas porque metragem, tempo e tinta aparecem em quatro
 * lugares diferentes (painel, cartão da máquina, lista, cartão de produção) e
 * já foram formatados de quatro jeitos diferentes no sistema de onde isto
 * veio. Uma medida escrita de duas formas na mesma tela faz parecer que são
 * duas medidas.
 */

/** Metros com duas casas: é a unidade em que a produção fala. */
export function metros(valor: number | null | undefined): string {
  return `${Number(valor || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} m`;
}

/**
 * Metragem grande, para o número de destaque do painel.
 *
 * Passando de mil metros as casas decimais só atrapalham: "34.628 m" se lê de
 * relance, "34.627,53 m" não.
 */
export function metrosCurtos(valor: number | null | undefined): string {
  const n = Number(valor || 0);
  if (n >= 1000) return `${Math.round(n).toLocaleString("pt-BR")} m`;
  return metros(n);
}

export function metrosQuadrados(valor: number | null | undefined): string {
  return `${Number(valor || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} m²`;
}

/**
 * Duração em horas e minutos.
 *
 * Segundos não entram: uma impressão leva de dez minutos a duas horas, e o
 * segundo só polui. Abaixo de um minuto mostra "menos de 1 min" em vez de
 * "0 min", que pareceria dado faltando.
 */
export function duracao(segundos: number | null | undefined): string {
  const total = Math.max(0, Math.round(Number(segundos || 0)));
  if (!total) return "—";
  if (total < 60) return "menos de 1 min";
  const horas = Math.floor(total / 3600);
  const minutos = Math.round((total % 3600) / 60);
  if (!horas) return `${minutos} min`;
  return minutos ? `${horas} h ${minutos} min` : `${horas} h`;
}

/** Tinta em mililitros, ou em litros quando o número fica grande demais para ler. */
export function tinta(ml: number | null | undefined): string {
  const n = Number(ml || 0);
  if (!n) return "—";
  if (n >= 1000) return `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L`;
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mL`;
}

/** `2026-09-09` vira `09/09/2026`. */
export function dataBr(iso: string | null | undefined): string {
  if (!iso) return "";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Hoje, no formato que as rotas esperam. Sem UTC: a fábrica trabalha no fuso daqui. */
export function hojeIso(): string {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

/** A mesma data, tantos dias antes. */
export function somarDias(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = new Date(ano!, mes! - 1, dia! + dias);
  const m = String(data.getMonth() + 1).padStart(2, "0");
  const d = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${m}-${d}`;
}

/**
 * A variação entre duas janelas do mesmo tamanho, em porcentagem.
 *
 * Devolve `null` quando a janela anterior foi zero: "subiu 100%" a partir do
 * nada não informa nada, e `Infinity` na tela é pior ainda.
 */
export function variacao(agora: number, antes: number): number | null {
  if (!antes) return null;
  return ((agora - antes) / antes) * 100;
}

/** As cores de canal como a produção as chama. */
export const NOME_DO_CANAL: Record<string, string> = {
  C: "Ciano",
  M: "Magenta",
  Y: "Amarelo",
  K: "Preto",
};
