/**
 * O EDITOR DE PRODUÇÃO num pedaço só, carregado quando o Encaixe é preciso.
 *
 * O controlador, a estrutura do Encaixe e os motores que eles puxam somam uns
 * 190 KB que não fazem nada na abertura do programa: a tela inicial é Moldes,
 * e o editor só sobe quando alguém vai ao Encaixe ou manda trabalho para lá
 * (ver `Producao.tsx`). Este arquivo existe para os dois virem juntos, num
 * `import()` só.
 */
export { montarProducao } from "./controlador";
export { Estrutura } from "./Estrutura";
