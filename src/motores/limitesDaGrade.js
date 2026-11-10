// O perfil em JS e a ABI do WASM usam células i32. Recusar antes da conversão
// impede que uma altura positiva vire negativa silenciosamente em Int32Array.
export const MAX_CELULA = 0x7fffffff;

export function conferirLimitesDaGrade(unidades, config, cols, linhas = 0) {
  const falhar = () => { throw new RangeError('O trabalho excede o intervalo seguro da grade de encaixe. Divida o material em regiões antes de continuar.'); };
  if (!Number.isFinite(config.passo) || config.passo <= 0 || !Number.isSafeInteger(cols)
      || cols <= 0 || cols > MAX_CELULA || !Number.isSafeInteger(linhas) || linhas < 0 || linhas > MAX_CELULA) falhar();
  let teto = 0;
  if (config.perfilInicial) {
    if (config.perfilInicial.length < cols) falhar();
    for (let c = 0; c < cols; c++) {
      const valor = config.perfilInicial[c];
      if (!Number.isSafeInteger(valor) || valor < 0 || valor > MAX_CELULA) falhar();
      teto = Math.max(teto, valor);
    }
  }
  // Empilhar a maior orientação é uma cota conservadora. Com bancada, cada
  // inserção pode ainda avançar até uma mesa. É uma proteção de overflow,
  // não uma afirmação de que o pedido exige esse comprimento.
  for (const unidade of unidades) {
    let altura = 0;
    for (const forma of unidade.formas) {
      const h = forma.maxBase + 1;
      if (!Number.isSafeInteger(h) || h <= 0 || h > MAX_CELULA
          || !Number.isSafeInteger(forma.somaTopo) || forma.somaTopo < 0 || forma.somaTopo > MAX_CELULA) falhar();
      altura = Math.max(altura, h);
    }
    teto += altura + linhas;
    if (teto > MAX_CELULA) falhar();
  }
}
