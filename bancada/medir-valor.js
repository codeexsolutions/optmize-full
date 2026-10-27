#!/usr/bin/env node
/**
 * QUANTO O CONTORNO ECONOMIZA, EM TRABALHO DE VERDADE.
 *
 * Lê os encaixes guardados (`encaixe_guardados`) do programa instalado nesta
 * máquina e, para cada um, põe lado a lado:
 *
 *   pelo quadrado  `metragemPelaCaixa`, a MESMA régua que a tela do Encaixe
 *                  mostra como "pelo quadrado": cada peça na caixa dela;
 *   Optmize        o consumo que a produção recebeu de fato, pelo contorno.
 *
 * Nada é estimado: as peças, a largura do rolo, o espaço e o consumo são os
 * gravados. É daqui que saem os números da tela de entrada (`ProvaDeValor`,
 * em src/telas/Entrar.tsx).
 *
 *   node bancada/medir-valor.js [pasta-de-dados]
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const Database = require("better-sqlite3");
const { carregarMotor } = require("./motor");

const PASTA = process.argv[2]
  || path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "br.com.optimize.desktop");
const BANCO = path.join(PASTA, "dados.db");
if (!fs.existsSync(BANCO)) {
  console.log(`Sem ${BANCO}: não há encaixe guardado para medir.`);
  process.exit(0);
}

(async () => {
  const { metragemPelaCaixa } = await carregarMotor({ comWasm: false });
  const db = new Database(BANCO, { readonly: true });
  const linhas = db.prepare("SELECT * FROM encaixe_guardados ORDER BY atualizado_em").all();
  const vistos = new Map();
  for (const g of linhas) {
    const pecas = JSON.parse(g.pecas).map((t) => {
      const [nome, largura, altura, qtd, giro] = t.split("~");
      return { nome, largura: Number(largura), altura: Number(altura), qtd: Number(qtd), giro };
    });
    const itens = pecas.flatMap((p) => Array.from({ length: p.qtd }, () => ({ ...p })));
    const config = {
      larguraTecido: g.largura_tecido, espaco: g.espaco, comprimentoBancada: g.comprimento_bancada || 0,
      alturaMax: itens.reduce((s, it) => s + Math.max(it.largura, it.altura) + g.espaco, 0),
    };
    const caixa = metragemPelaCaixa(itens, config);
    if (!caixa) continue;
    // O mesmo trabalho guardado várias vezes: fica a melhor rodada.
    const chave = g.assinatura;
    const caso = { data: String(g.atualizado_em).slice(0, 10), pecas: itens.length, rolo: g.largura_tecido,
      espaco: g.espaco, caixa, contorno: g.consumo };
    const antes = vistos.get(chave);
    if (!antes || caso.contorno < antes.contorno) vistos.set(chave, caso);
  }
  const casos = [...vistos.values()].sort((a, b) => b.caixa - a.caixa);
  for (const c of casos) {
    const economia = c.caixa - c.contorno;
    console.log(`${c.data}  ${String(c.pecas).padStart(3)} peças  rolo ${c.rolo} cm  espaço ${c.espaco}  `
      + `quadrado ${(c.caixa / 100).toFixed(2)} m  Optmize ${(c.contorno / 100).toFixed(2)} m  `
      + `economia ${(economia / 100).toFixed(2)} m (${(100 * economia / c.caixa).toFixed(1)}%)`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
