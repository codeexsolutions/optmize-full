import { podeDeitar } from "./encaixeGiro";

/*
 * A PEÇA MAIS LARGA QUE A MÍDIA FICA NO ENCAIXE, COM AVISO.
 *
 * O motor punha de fora a peça que não cabe na largura nem deitada, e o
 * Exportar travava. Mas o caso de todo dia é o arquivo de 178,2 cm numa mídia
 * de 178: dois milímetros, que a impressora corta sem ninguém perceber — e a
 * peça sumia do risco (2026-10-27). Agora ela entra: depois das outras, cada
 * uma na sua fileira, centralizada (o que passa fica metade de cada lado) e
 * deitada quando o giro deixa e isso a estreita. Quem lê o resultado vê o
 * aviso de quanto passou (`renderResultado`, em producao/controlador.js) e
 * decide.
 */
export function cabeNaMidia(item, larguraTecido) {
  return item.largura <= larguraTecido || (podeDeitar(item) && item.altura <= larguraTecido);
}

/** O resultado de uma busca que não teve peça para encaixar: só largas. */
export function resultadoSemBusca() {
  return {
    posicoes: [], naoEncaixadas: [], consumo: 0, venceuContorno: true,
    tentativas: 0, decorridoMs: 0, ganhos: [], placar: [],
  };
}

/**
 * Põe as peças largas no fim do rolo, presas à grade das outras.
 *
 * A posição da máscara (`x + offX`, `y + offY`) cai num múltiplo do `passo`:
 * é assim que as posições da busca nascem, e o guarda da sobreposição compara
 * as máscaras pela diferença em células. Com bancada, a peça vai para a
 * bancada seguinte quando não cabe no resto da que está aberta.
 */
export function assentarAsLargas(r, largas, { larguraTecido, espaco, comprimentoBancada, passo }) {
  if (!r || largas.length === 0) return r;
  const periodo = comprimentoBancada > 0 ? comprimentoBancada + espaco : 0;
  const posicoes = [...r.posicoes];
  let bancada = posicoes.length > 0 ? Math.max(...posicoes.map((p) => Number(p.bancada) || 0)) : 0;
  // Uma célula a mais que a folga: as fileiras de cima já estão engordadas.
  let y = posicoes.length > 0 ? r.consumo + espaco + passo : 0;
  if (periodo && posicoes.length > 0) {
    bancada += 1;
    y = bancada * periodo;
  }

  const naGrade = (valor, arredondar) => arredondar(valor / passo) * passo;
  largas.forEach((item) => {
    const deitar = podeDeitar(item) && item.altura < item.largura;
    const rot = deitar ? 90 : 0;
    const largura = deitar ? item.altura : item.largura;
    const altura = deitar ? item.largura : item.altura;
    if (periodo && y > bancada * periodo && y + altura > (bancada + 1) * periodo - espaco) {
      bancada += 1;
      y = bancada * periodo;
    }
    const mascara = item.mascaras ? item.mascaras.rotacoes[rot] : null;
    const offX = mascara ? mascara.offX || 0 : 0;
    const offY = mascara ? mascara.offY || 0 : 0;
    const x = naGrade((larguraTecido - largura) / 2 + offX, Math.round) - offX;
    const yNaGrade = naGrade(y + offY, Math.ceil) - offY;
    posicoes.push({
      item, x, y: yNaGrade, largura, altura, rot, girado: deitar, mascara, passo,
      bancada: periodo ? bancada : 0,
    });
    y = yNaGrade + altura + espaco + passo;
  });

  return {
    ...r,
    posicoes,
    consumo: Math.max(r.consumo || 0, ...posicoes.map((p) => p.y + p.altura)),
    largas: largas.map((item) => ({ nome: item.nome, largura: Math.min(item.largura,
      podeDeitar(item) ? item.altura : item.largura) })),
  };
}
