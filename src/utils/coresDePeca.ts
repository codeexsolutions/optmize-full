/**
 * As dez cores com que uma peça é marcada na tela.
 *
 * Elas vivem em `estilo/tokens.css` (`--peca-1` … `--peca-10`), que é o único
 * arquivo do projeto com hex escrito — escrever cor em qualquer outro lugar
 * quebra o tema. Aqui elas são LIDAS de lá, e não copiadas: um valor copiado
 * seria uma segunda paleta esperando divergir da primeira.
 *
 * A mesma sequência aparece em três lugares, e é de propósito que seja a
 * mesma: a bolinha da peça na lista do Encaixe, o contorno no risco, e a
 * miniatura da parte no molde. A pessoa aponta para a peça verde no risco e
 * procura a verde na lista.
 */

const QUANTAS = 10;

/**
 * Lidas uma vez, na primeira chamada.
 *
 * `getComputedStyle` obriga o navegador a resolver o estilo, e isso já apareceu
 * como custo dentro de um laço que desenhava peça por peça. As cores não mudam
 * enquanto a página está aberta — a troca de tema recarrega a folha, não os
 * valores destas dez variáveis.
 */
let lidas: string[] | null = null;

export function coresDePeca(): string[] {
  if (lidas) return lidas;
  const estilo = getComputedStyle(document.documentElement);
  lidas = Array.from({ length: QUANTAS },
    (_, i) => estilo.getPropertyValue(`--peca-${i + 1}`).trim());
  return lidas;
}

/** A cor da enésima peça, dando a volta na lista quando ela acaba. */
export function corDaPeca(indice: number): string {
  const cores = coresDePeca();
  return cores[indice % cores.length]!;
}
