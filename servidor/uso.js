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
 * Então: erro de rede libera — MAS FICA ANOTADO. Cada exportação feita sem
 * internet entra numa fila no disco e é descontada quando a conexão volta
 * (`enviarPendentes`). Tirar a máquina da internet deixa de ser metragem de
 * graça: é metragem a prazo, e o prazo é de 48 horas, porque é quanto o
 * programa trabalha sem falar com o servidor (ver `sessao.js`).
 *
 * ---------------------------------------------------------------------------
 * SEM CONTA, NÃO CHEGA AQUI
 * ---------------------------------------------------------------------------
 *
 * A trava de `server.js` não deixa a API responder sem conta liberada nesta
 * máquina, e a exportação passa por ela.
 */

const fs = require("node:fs");
const path = require("node:path");
const { pedirComToken } = require("./sessao");
const { pastaDeDados } = require("./caminhos");

/** As exportações feitas sem internet, esperando para ser descontadas. */
const ARQUIVO_PENDENTE = path.join(pastaDeDados("sessao"), "uso-pendente.json");

function lerPendentes() {
  try {
    const lista = JSON.parse(fs.readFileSync(ARQUIVO_PENDENTE, "utf8"));
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

function gravarPendentes(lista) {
  if (lista.length === 0) {
    fs.rmSync(ARQUIVO_PENDENTE, { force: true });
    return;
  }
  fs.writeFileSync(ARQUIVO_PENDENTE, JSON.stringify(lista), { mode: 0o600 });
}

function anotarPendente(metros, metrosCaixa) {
  const lista = lerPendentes();
  lista.push({ metros, metrosCaixa, quando: new Date().toISOString() });
  gravarPendentes(lista);
}

let enviando = null;

/**
 * Manda ao servidor as exportações feitas sem internet. Nunca lança.
 *
 * Para na primeira que falhar por rede — a ordem se mantém, e a próxima
 * tentativa recomeça dali. Uma que o servidor recusar por dado inválido sai da
 * fila: ficar reenviando para sempre não desconta nada.
 */
function enviarPendentes() {
  if (enviando) return enviando;
  enviando = (async () => {
    let lista = lerPendentes();
    while (lista.length > 0) {
      const [item] = lista;
      let resposta;
      try {
        resposta = await pedirComToken("/uso/exportacao", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...item, semRede: true }),
        });
      } catch {
        return; // sem rede de novo
      }
      if (!resposta || resposta.status === 401 || resposta.status >= 500) return;
      lista = lista.slice(1);
      gravarPendentes(lista);
    }
  })().catch(() => {}).finally(() => {
    enviando = null;
  });
  return enviando;
}

// Na subida e de hora em hora, além de antes de cada exportação.
setTimeout(() => void enviarPendentes(), 5000).unref();
setInterval(() => void enviarPendentes(), 60 * 60 * 1000).unref();

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
 *
 * `metrosCaixa` é a metragem que o mesmo arquivo daria encaixado pela caixa
 * (ver `metragemPelaCaixa`, no motor). Não decide nada: vai junto só para o
 * servidor somar a economia da empresa. `null` quando não houve como medir.
 */
async function permitirExportacao(metrosPedidos, metrosCaixa = null) {
  const metros = Number(metrosPedidos);
  /*
    SEM METRAGEM CONHECIDA, LIBERA.

    Acontece em caminho de bancada e em pedido antigo sem o campo. Recusar
    seria inventar uma trava onde não há o que descontar.
  */
  if (!Number.isFinite(metros) || metros <= 0) {
    return { permitido: true, semMetragem: true };
  }

  // As de antes vêm primeiro: o saldo que decide esta tem de contar com elas.
  await enviarPendentes();

  const caixa = Number.isFinite(metrosCaixa) && metrosCaixa >= metros ? metrosCaixa : null;

  let resposta;
  try {
    resposta = await pedirComToken("/uso/exportacao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(caixa !== null ? { metros, metrosCaixa: caixa } : { metros }),
    });
  } catch {
    // Sem rede: exporta, e fica na fila para ser descontada depois.
    anotarPendente(metros, caixa);
    return { permitido: true, offline: true };
  }

  // `null` é "não há conta nesta máquina"; 401 depois de renovar, a conta
  // saiu daqui. Nos dois casos não há de quem descontar, e não se exporta.
  if (!resposta || resposta.status === 401) {
    return { permitido: false, motivo: "Entre na sua conta do Optmize para exportar." };
  }

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

  if (!resposta.ok) {
    // Servidor com problema não é cota estourada: exporta, e desconta depois.
    if (resposta.status >= 500) anotarPendente(metros, caixa);
    return { permitido: true, falhou: true };
  }

  return {
    permitido: true,
    metrosRestantes: dados?.metrosRestantes ?? null,
    metros: dados?.metros ?? null,
    metrosUsados: dados?.metrosUsados ?? null,
  };
}

module.exports = { permitirExportacao };
