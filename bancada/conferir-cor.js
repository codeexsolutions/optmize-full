#!/usr/bin/env node
/**
 * ===========================================================================
 * CONFERIR A COR — a travessia CMYK -> sRGB continua chegando na cor certa?
 * ===========================================================================
 *
 * O `cor-icc.js` não usa biblioteca de cor: ele abre o perfil ICC embutido no
 * arquivo, lê a tabela A2B e caminha na LUT à mão. É código que ninguém relê,
 * e é o tipo de conta em que um erro **não parece erro**: o arquivo abre, a
 * imagem aparece, as cores só ficam um pouco diferentes. Quem descobre é o
 * tecido impresso, depois de pago.
 *
 * A conferência é de IDA E VOLTA. Parte-se de cores sRGB conhecidas, o `sharp`
 * as leva para CMYK pelo perfil U.S. Web Coated (SWOP) que vem no Windows, e o
 * `cor-icc.js` tem que trazer de volta para perto de onde começaram.
 *
 * Ida e volta é a única asserção honesta aqui. Dizer "ciano puro tem que dar
 * tal RGB" seria inventar o gabarito a partir do próprio código que está sendo
 * conferido. "O que entrou tem que voltar" é uma propriedade independente, e
 * ela só se sustenta se as duas travessias do perfil estiverem certas.
 *
 * A tolerância é por cor, e não é frouxa por conveniência: CMYK simplesmente
 * não alcança tudo que o sRGB alcança. O preto é o exemplo claro — o mais
 * escuro que uma prensa coated imprime fica em L* perto de 16, que em sRGB dá
 * uns (39,37,40). Exigir (0,0,0) de volta seria exigir da tinta o que a tinta
 * não faz.
 *
 *   npm run bancada:cor
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { converterParaSrgb, nomeDoPerfil, perfilDoJpeg } = require("../cor-icc");

/*
 * O SWOP que acompanha o Windows. Em máquina sem ele a conferência não falha:
 * ela avisa e sai limpa, porque não ter um perfil CMYK instalado não é defeito
 * do Optimize.
 */
const PERFIL_CMYK = path.join(
  process.env.SystemRoot || "C:/Windows",
  "System32/spool/drivers/color/RSWOP.icm",
);

const CORES = [
  { nome: "cinza médio", rgb: [128, 128, 128], tolerancia: 20 },
  { nome: "branco", rgb: [255, 255, 255], tolerancia: 12 },
  { nome: "preto", rgb: [0, 0, 0], tolerancia: 48 },
  { nome: "azul de céu", rgb: [90, 150, 210], tolerancia: 28 },
  { nome: "vermelho vivo", rgb: [220, 40, 40], tolerancia: 60 },
];

let passou = 0;
const falhas = [];

function conferir(oque, condicao, detalhe = "") {
  if (condicao) {
    passou++;
    console.log("  ok   " + oque);
  } else {
    falhas.push(oque + (detalhe ? " — " + detalhe : ""));
    console.log("  FALHOU " + oque + (detalhe ? " — " + detalhe : ""));
  }
}

async function principal() {
  if (!fs.existsSync(PERFIL_CMYK)) {
    console.log("Sem perfil CMYK instalado (" + PERFIL_CMYK + ") — nada a conferir.");
    return;
  }

  const largura = CORES.length;
  const cru = Buffer.alloc(largura * 3);
  CORES.forEach((c, i) => { for (let k = 0; k < 3; k++) cru[i * 3 + k] = c.rgb[k]; });

  /*
   * `toColourspace("cmyk")` é o que separa de verdade em quatro tintas. Passar
   * um buffer cru com `channels: 4` NÃO faz isso: o sharp o lê como RGBA, e o
   * resultado parece um defeito do conversor quando é do teste. Já aconteceu.
   */
  const jpegCmyk = await sharp(cru, { raw: { width: largura, height: 1, channels: 3 } })
    .toColourspace("cmyk")
    .withMetadata({ icc: PERFIL_CMYK })
    .jpeg({ quality: 100 })
    .toBuffer();

  const icc = perfilDoJpeg(jpegCmyk);
  conferir("o JPEG de prova sai com perfil embutido", !!icc);
  if (icc) console.log("       perfil: " + nomeDoPerfil(icc));

  const r = converterParaSrgb(jpegCmyk);
  conferir("o conversor reconhece o arquivo como CMYK",
    r && String(r.espaco).toLowerCase() === "cmyk", r ? String(r.espaco) : "");
  conferir("e converte", r && r.convertido === true, r ? "motivo: " + r.motivo : "");
  if (!r || !r.convertido) return;

  conferir("as medidas batem", r.largura === largura && r.altura === 1);

  const px = await sharp(r.arquivo).raw().toBuffer({ resolveWithObject: true });
  const lidos = CORES.map((_, i) => {
    const o = i * px.info.channels;
    return [px.data[o], px.data[o + 1], px.data[o + 2]];
  });

  CORES.forEach((c, i) => {
    const saiu = lidos[i];
    const desvio = Math.max(...c.rgb.map((v, k) => Math.abs(v - saiu[k])));
    console.log("       " + c.nome.padEnd(14)
      + " (" + c.rgb.join(",") + ") -> (" + saiu.join(",") + ")  desvio " + desvio);
    conferir("ida e volta do " + c.nome + " dentro de " + c.tolerancia,
      desvio <= c.tolerancia, "desvio " + desvio);
  });

  conferir("as cores continuam distintas entre si (a LUT foi mesmo percorrida)",
    new Set(lidos.map((c) => c.join(","))).size === CORES.length);

  console.log("");
  if (falhas.length) {
    console.error("FALHOU — " + falhas.length + " de " + (passou + falhas.length) + ":");
    falhas.forEach((f) => console.error("  - " + f));
    process.exit(1);
  }
  console.log("OK — " + passou + " conferências, a travessia de cor chega onde deve.");
}

principal().catch((erro) => { console.error(erro); process.exit(1); });
