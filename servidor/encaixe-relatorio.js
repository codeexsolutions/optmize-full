/**
 * ===========================================================================
 * O RELATÓRIO DO ENCAIXE — contorno contra quadrado, num período
 * ===========================================================================
 *
 * Cada encaixe feito já fica no `encaixe_historico` com a metragem PELO
 * CONTORNO (a que o Optmize entregou). O relatório põe ao lado quanto o mesmo
 * trabalho gastaria PELO QUADRADO — cada peça ocupando o retângulo inteiro dela,
 * como encaixa quem não lê o contorno — e a diferença é o tecido economizado.
 *
 * ---------------------------------------------------------------------------
 * COMO O QUADRADO É CONTADO — e por que ele erra sempre para MAIS
 * ---------------------------------------------------------------------------
 *
 * Pedido do dono (2026-11-10): o quadrado sempre para mais, o contorno sempre
 * o menor. Então a conta é a de quem arruma retângulos em FILEIRAS no rolo
 * (NFDH: as peças da mais alta para a mais baixa, lado a lado até a largura
 * acabar, e a fileira seguinte começa na altura da mais alta da anterior):
 *
 *   - cada peça vira largura × altura, mais a folga pedida em cada eixo;
 *   - a peça entra como veio (o mesmo lado certo do encaixe); só deita se
 *     em pé não couber na largura do rolo;
 *   - o total é arredondado PARA CIMA, de 10 em 10 cm;
 *   - e nunca sai menor que o contorno do mesmo trabalho.
 *
 * Fileira é o que um operador faz à mão no Corel, e não o melhor arranjo de
 * retângulos possível — é de propósito: o número é uma referência honesta do
 * "como seria", e não um concorrente otimizado.
 *
 * ---------------------------------------------------------------------------
 * DE ONDE VÊM AS MEDIDAS
 * ---------------------------------------------------------------------------
 *
 * Encaixe novo: a tela manda as medidas das peças junto com o resultado, e o
 * quadrado é gravado na hora (`consumo_quadrado`). Encaixe de antes desta
 * versão: o quadrado é refeito com as peças do `encaixe_guardados` do mesmo
 * trabalho (mesma assinatura e mesma metragem). Sem isso, a linha aparece sem
 * o quadrado — melhor um traço do que um número inventado.
 */

const express = require("express");
const db = require("./db");

const router = express.Router();

// A conta do quadrado mora num arquivo só, o mesmo que a tela usa.
const { consumoNoQuadrado, quadradoParaComparar } = require("../src/motores/consumoNoQuadrado.mjs");

/**
 * As medidas a partir das peças guardadas (`pecasParaGuardar`, na tela):
 * cada peça é um texto "id~largura~altura~quantidade~giro~...".
 */
function medidasDasPecasGuardadas(pecasEmTexto) {
  try {
    const lista = JSON.parse(pecasEmTexto);
    if (!Array.isArray(lista)) return null;
    const medidas = lista.map((texto) => {
      const partes = String(texto).split("~");
      return [Number(partes[1]), Number(partes[2]), Number(partes[3])];
    }).filter((m) => m[0] > 0 && m[1] > 0 && m[2] > 0);
    return medidas.length ? medidas : null;
  } catch {
    return null;
  }
}

/** "AAAA-MM-DD" no fuso desta máquina → o instante em ISO (UTC). */
function inicioDoDia(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto || ""));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toISOString();
}

function proximoDia(texto) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto || ""));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1).toISOString();
}

/**
 * GET /api/encaixe/relatorio?de=AAAA-MM-DD&ate=AAAA-MM-DD
 *
 * Os dois dias entram inteiros, no fuso da máquina. Sem datas: do dia 1 do
 * mês até hoje.
 */
router.get("/relatorio", (req, res) => {
  const hoje = new Date();
  const dia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const de = String(req.query.de || dia(new Date(hoje.getFullYear(), hoje.getMonth(), 1)));
  const ate = String(req.query.ate || dia(hoje));
  const desde = inicioDoDia(de);
  const antesDe = proximoDia(ate);
  if (!desde || !antesDe || desde >= antesDe) {
    return res.status(400).json({ error: "Período inválido." });
  }

  const linhas = db.prepare(`
    SELECT id, assinatura, largura_tecido, pecas, consumo, aproveitamento, criado_em,
           consumo_quadrado, espaco
      FROM encaixe_historico
     WHERE criado_em >= ? AND criado_em < ? AND consumo > 0
     ORDER BY criado_em DESC
  `).all(desde, antesDe);

  // Para as linhas de antes desta versão: as peças do trabalho guardado com a
  // mesma assinatura e a mesma metragem.
  const guardado = db.prepare(`
    SELECT pecas, espaco, largura_tecido FROM encaixe_guardados
     WHERE assinatura = ? AND ABS(consumo - ?) < 0.01
     LIMIT 1
  `);

  const saida = linhas.map((l) => {
    let quadrado = l.consumo_quadrado > 0 ? l.consumo_quadrado : null;
    if (quadrado === null) {
      const g = guardado.get(l.assinatura, l.consumo);
      const medidas = g && medidasDasPecasGuardadas(g.pecas);
      if (medidas) quadrado = consumoNoQuadrado(medidas, l.largura_tecido || g.largura_tecido, g.espaco);
    }
    // O contorno nunca perde para o quadrado: se a conta das fileiras sair
    // menor (peça muito comprida, por exemplo), o quadrado fica no contorno.
    quadrado = quadradoParaComparar(quadrado, l.consumo);
    return {
      id: l.id,
      quando: l.criado_em,
      pecas: l.pecas,
      larguraTecido: l.largura_tecido,
      contornoCm: l.consumo,
      quadradoCm: quadrado,
      economiaCm: quadrado === null ? null : quadrado - l.consumo,
      aproveitamento: l.aproveitamento,
    };
  });

  const comQuadrado = saida.filter((l) => l.quadradoCm !== null);
  const soma = (lista, campo) => lista.reduce((t, l) => t + (l[campo] || 0), 0);
  const contornoComparavel = soma(comQuadrado, "contornoCm");
  const quadrado = soma(comQuadrado, "quadradoCm");
  res.json({
    de,
    ate,
    encaixes: saida.length,
    totais: {
      contornoCm: soma(saida, "contornoCm"),
      pecas: soma(saida, "pecas"),
      // A economia só soma as linhas que têm os dois números: comparar o
      // contorno de vinte encaixes com o quadrado de quinze inflaria a conta.
      comparaveis: comQuadrado.length,
      contornoComparavelCm: contornoComparavel,
      quadradoCm: quadrado,
      economiaCm: quadrado - contornoComparavel,
      economiaPercentual: quadrado > 0 ? ((quadrado - contornoComparavel) / quadrado) * 100 : null,
    },
    linhas: saida,
  });
});

module.exports = router;
module.exports.consumoNoQuadrado = consumoNoQuadrado;
module.exports.medidasDasPecasGuardadas = medidasDasPecasGuardadas;
