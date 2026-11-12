/**
 * ===========================================================================
 * OS TRÊS MODELOS DE VETOR — o que a rede escolhe para cada imagem
 * ===========================================================================
 *
 * Para cada imagem a rede prevê o resultado de todos os ajustes candidatos
 * (`AJUSTES_CANDIDATOS`, a mesma grade do treino) e daí saem três vetores
 * diferentes, para a pessoa comparar e escolher:
 *
 *   fiel         o que mais acerta a imagem, custe os nós que custar
 *   equilibrado  o melhor acerto por nó: max(fiel − λ·nós), com o λ do gosto
 *                da pessoa (aprendido das escolhas dela, ver `gosto`)
 *   limpo        o de MENOS nós que ainda acerta quase tanto quanto o fiel —
 *                a folga (`folgaDoLimpo`, medida no treino) é quantos pixels
 *                errados a mais ele pode ter que o fiel
 *
 * Os três são sempre ajustes diferentes: se dois caem no mesmo, o segundo
 * pega o melhor dos que sobram para o critério dele.
 *
 * Sem a rede (pesos ausentes ou de outra versão das características), os
 * três saem de ajustes fixos que funcionam bem na média (`SEM_REDE`).
 */

export const AJUSTES_CANDIDATOS = [];
for (const d of [0, 17, 33, 50, 67, 83, 100]) for (const s of [0, 33, 67, 100]) AJUSTES_CANDIDATOS.push({ d, s, ia: 0 });
export const AJUSTES_COM_IA = [];
for (const d of [17, 50, 83]) for (const s of [33, 67]) AJUSTES_COM_IA.push({ d, s, ia: 1 });

/** O maior lado em que a IA de ampliação entra (o mesmo do treino). */
export const LADO_COM_IA = 512;

export const NOMES_DOS_MODELOS = { fiel: "Fiel", equilibrado: "Equilibrado", limpo: "Limpo" };

const SEM_REDE = {
  fiel: { d: 100, s: 0, ia: 0 },
  equilibrado: { d: 50, s: 67, ia: 0 },
  limpo: { d: 0, s: 100, ia: 0 },
};

const LAMBDA_PADRAO = 0.35;
const LAMBDA_MIN = 0.05, LAMBDA_MAX = 2;

/**
 * Escolhe os três ajustes. `rede`: a de `criarRede` (ou null); `carac`: as
 * características; `comIa`: se a IA de ampliação pode entrar nesta imagem;
 * `lambda`: o peso dos nós no "equilibrado" (o gosto da pessoa).
 *
 * Devolve `[{ chave, nome, ajuste, previsto }]`, na ordem fiel, equilibrado,
 * limpo.
 */
export function escolherModelos(rede, carac, { comIa = false, lambda = null, folga = null } = {}) {
  if (!rede) {
    return Object.entries(SEM_REDE).map(([chave, ajuste]) => ({ chave, nome: NOMES_DOS_MODELOS[chave], ajuste, previsto: null }));
  }
  const candidatos = comIa ? [...AJUSTES_CANDIDATOS, ...AJUSTES_COM_IA] : AJUSTES_CANDIDATOS;
  const previsoes = rede.prever(carac, candidatos);
  const lista = candidatos.map((ajuste, i) => ({ ajuste, ...previsoes[i] }));
  const usados = new Set();
  const chaveDo = (c) => `${c.ajuste.d}/${c.ajuste.s}/${c.ajuste.ia}`;
  const melhor = (pontuar, filtro = () => true) => {
    let escolhido = null, nota = -Infinity;
    for (const c of lista) {
      if (usados.has(chaveDo(c)) || !filtro(c)) continue;
      const p = pontuar(c);
      if (p > nota) { nota = p; escolhido = c; }
    }
    return escolhido;
  };

  // O fiel: o maior acerto; no empate (diferença menor que 0,005), menos nós.
  const fiel = melhor((c) => c.fiel - 0.005 * c.nos);
  usados.add(chaveDo(fiel));
  // O limpo: o de menos nós dentro da folga do fiel.
  const margem = Math.log10(1 + (folga ?? rede.folgaDoLimpo ?? 0.3));
  const limpo = melhor((c) => -c.nos + 0.01 * c.fiel, (c) => c.fiel >= fiel.fiel - margem)
    || melhor((c) => -c.nos);
  usados.add(chaveDo(limpo));
  // O equilibrado: o melhor acerto por nó, no gosto da pessoa.
  const l = Math.min(LAMBDA_MAX, Math.max(LAMBDA_MIN, lambda ?? rede.lambda ?? LAMBDA_PADRAO));
  const equilibrado = melhor((c) => c.fiel - l * c.nos);

  const sair = (chave, c) => ({ chave, nome: NOMES_DOS_MODELOS[chave], ajuste: { ...c.ajuste }, previsto: { fiel: c.fiel, erro: c.erro, nos: c.nos } });
  return [sair("fiel", fiel), sair("equilibrado", equilibrado), sair("limpo", limpo)];
}

/**
 * O GOSTO DA PESSOA — o λ do "equilibrado", aprendido das escolhas.
 *
 * Cada vez que a pessoa exporta um dos três, o λ anda um passo na direção
 * dele: escolher o fiel diz "quero mais fidelidade" (λ menor), escolher o
 * limpo diz "quero mais limpeza" (λ maior), e o equilibrado confirma o λ de
 * agora. Assim o modelo do meio vai virando o que a pessoa costuma querer.
 */
export function aprenderGosto(lambda, chaveEscolhida) {
  const atual = Math.min(LAMBDA_MAX, Math.max(LAMBDA_MIN, lambda ?? LAMBDA_PADRAO));
  const fator = chaveEscolhida === "fiel" ? 0.85 : chaveEscolhida === "limpo" ? 1.18 : 1;
  return Math.min(LAMBDA_MAX, Math.max(LAMBDA_MIN, atual * fator));
}
