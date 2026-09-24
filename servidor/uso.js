/**
 * ===========================================================================
 * A METRAGEM DO PLANO — pedir licença antes de exportar
 * ===========================================================================
 *
 * Cada plano dá uma METRAGEM por período: 200 m no Essencial, 800 m no
 * Profissional, sem teto no Completo e no anual. O saldo cai conforme a
 * gráfica exporta — por METRO, e não por exportação, porque quem manda 2 m
 * para a impressora não pode gastar a mesma cota de quem manda 60 m.
 *
 * Encaixar continua à vontade em todos: quem experimenta não gasta nada, e é
 * experimentando que a pessoa descobre que o encaixe é bom.
 *
 * Quem conta é o backend, e tem de ser ele: as três máquinas de uma conta do
 * Profissional gastam dos mesmos 800 metros, e cada uma contando sozinha daria
 * 2.400.
 *
 * ---------------------------------------------------------------------------
 * SEM INTERNET, EXPORTA
 * ---------------------------------------------------------------------------
 *
 * É a decisão mais importante deste arquivo. O Optmize é instalado na gráfica
 * e o link da rua cai; recusar a exportação porque o Railway não respondeu
 * transformaria queda de internet em pedido parado, e o prejuízo seria de
 * quem PAGA — não de quem deve.
 *
 * Então: erro de rede libera. O que isso permite está dito em voz alta —
 * quem tirar a máquina da internet exporta à vontade. É o mesmo teto da
 * licença offline do programa: quem quer burlar já tinha por onde, e castigar
 * cem gráficas honestas para incomodar uma é troca ruim.
 *
 * ---------------------------------------------------------------------------
 * SEM CONTA, TAMBÉM EXPORTA
 * ---------------------------------------------------------------------------
 *
 * O programa pede login para abrir (ver `casca/Casca.tsx`), então "sem sessão"
 * aqui significa quase sempre um Optmize aberto antes de a conta existir, ou
 * um teste de bancada. Recusar seria inventar uma trava que a tela de entrada
 * já faz melhor.
 */

const { pedirComToken } = require("./sessao");

/**
 * Pede a metragem desta exportação ao servidor.
 *
 * `metrosPedidos` é o comprimento do PDF — a soma das páginas, o mesmo
 * número que a tela mostra como metragem.
 *
 * Devolve sempre um objeto, nunca lança: quem chama está no meio de gerar um
 * PDF e não tem o que fazer com uma exceção de rede.
 *
 * `permitido: false` só acontece quando o SERVIDOR disse não — ou seja,
 * quando a conta existe, a rede foi, e a metragem do período não cobre este
 * trabalho.
 */
async function permitirExportacao(metrosPedidos) {
  const metros = Number(metrosPedidos);
  /*
    SEM METRAGEM CONHECIDA, LIBERA.

    Acontece em caminho de bancada e em pedido antigo sem o campo. Recusar
    seria inventar uma trava onde não há o que descontar.
  */
  if (!Number.isFinite(metros) || metros <= 0) {
    return { permitido: true, semMetragem: true };
  }

  let resposta;
  try {
    resposta = await pedirComToken("/uso/exportacao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metros }),
    });
  } catch {
    return { permitido: true, offline: true };
  }

  // `null` é "não há sessão gravada" — ver a nota no cabeçalho.
  if (!resposta) return { permitido: true, semConta: true };

  const dados = await resposta.json().catch(() => null);

  /*
    QUALQUER RESPOSTA QUE NÃO SEJA UM "NÃO" EXPLÍCITO LIBERA.

    402 é o não da cota (ver `uso.routes.ts`, no backend). Um 500, um 404 de
    rota que ainda não subiu, um corpo que não é JSON: nada disso é a conta
    estourando o limite, e nenhum deles justifica segurar o pedido de um
    cliente.
  */
  if (resposta.status === 402 && dados) {
    return {
      permitido: false,
      motivo: dados.motivo || "A metragem do seu plano acabou.",
      metros: dados.metros ?? null,
      metrosUsados: dados.metrosUsados ?? null,
      metrosRestantes: dados.metrosRestantes ?? null,
      plano: dados.plano || "",
      periodo: dados.periodoEmPalavras || "",
      podeComprarAvulso: Boolean(dados.podeComprarAvulso),
    };
  }

  if (!resposta.ok) return { permitido: true, falhou: true };

  return {
    permitido: true,
    metrosRestantes: dados?.metrosRestantes ?? null,
    metros: dados?.metros ?? null,
    metrosUsados: dados?.metrosUsados ?? null,
  };
}

module.exports = { permitirExportacao };
