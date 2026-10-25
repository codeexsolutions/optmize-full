/**
 * ===========================================================================
 * O MOLDE DE EXEMPLO — para a estante vazia ter com o que começar
 * ===========================================================================
 *
 * Uma camiseta básica (frente, costas, manga curta e gola) em P, M, G e GG,
 * desenhada aqui por conta: decote, ombro caído, cava e copa da manga em
 * curva. Serve para quem abre o programa pela primeira vez ver o caminho
 * inteiro — escolher o molde, pedir as quantidades por tamanho e mandar para o
 * Encaixe — sem precisar ter um DXF à mão.
 *
 * NÃO É MODELAGEM DE PRODUÇÃO. As medidas são de uma tabela média, sem prova
 * de costura; a observação do molde diz isso a quem for usar.
 */

import type { MoldeParaGravar, PecaDoMolde, Ponto, TamanhoDoMolde } from "../../api/moldes";

/** As medidas de cada tamanho, em cm. */
const MEDIDAS = {
  P: { largura: 48, comprimento: 70, ombros: 43, manga: 37, mangaAltura: 19, gola: 44 },
  M: { largura: 52, comprimento: 72, ombros: 46, manga: 40, mangaAltura: 20, gola: 46 },
  G: { largura: 56, comprimento: 74, ombros: 49, manga: 43, mangaAltura: 21, gola: 48 },
  GG: { largura: 60, comprimento: 76, ombros: 52, manga: 46, mangaAltura: 22, gola: 50 },
} as const;

type Tamanho = keyof typeof MEDIDAS;

const CORES: Record<Tamanho, string> = { P: "#3b82f6", M: "#10b981", G: "#f59e0b", GG: "#ef4444" };

export const NOME_DO_EXEMPLO = "Camiseta básica (exemplo)";

/** Curva de Bézier quadrática, sem o ponto de partida. */
function curva(de: Ponto, controle: Ponto, ate: Ponto, passos = 10): Ponto[] {
  const saida: Ponto[] = [];
  for (let i = 1; i <= passos; i++) {
    const t = i / passos;
    const u = 1 - t;
    saida.push({
      x: u * u * de.x + 2 * u * t * controle.x + t * t * ate.x,
      y: u * u * de.y + 2 * u * t * controle.y + t * t * ate.y,
    });
  }
  return saida;
}

/** Corpo (frente ou costas): só o decote muda entre os dois. */
function corpo(m: (typeof MEDIDAS)[Tamanho], decote: number): Ponto[] {
  const L = m.largura;
  const c = L / 2;
  const meioDecote = 8.5;
  const queda = 4;
  const ombro = c - m.ombros / 2; // x da ponta do ombro esquerdo
  const cava = queda + 22; // onde a cava encontra a lateral

  const pontos: Ponto[] = [{ x: c - meioDecote, y: 0 }, { x: ombro, y: queda }];
  // Cava esquerda: entra um pouco e desce até a lateral.
  pontos.push(...curva({ x: ombro, y: queda }, { x: ombro + 1.5, y: cava - 6 }, { x: 0, y: cava }));
  pontos.push({ x: 0, y: m.comprimento }, { x: L, y: m.comprimento }, { x: L, y: cava });
  // Cava direita, espelhada.
  pontos.push(...curva({ x: L, y: cava }, { x: L - ombro - 1.5, y: cava - 6 }, { x: L - ombro, y: queda }));
  pontos.push({ x: c + meioDecote, y: 0 });
  // O decote, de volta ao ponto de partida.
  pontos.push(...curva({ x: c + meioDecote, y: 0 }, { x: c, y: decote * 2 }, { x: c - meioDecote, y: 0 }).slice(0, -1));
  return pontos;
}

/** Manga curta: copa em sino e boca um pouco mais estreita. */
function manga(m: (typeof MEDIDAS)[Tamanho]): Ponto[] {
  const W = m.manga;
  const copa = 12;
  const pontos: Ponto[] = [{ x: 0, y: copa }];
  pontos.push(...curva({ x: 0, y: copa }, { x: W * 0.18, y: -1 }, { x: W / 2, y: 0 }));
  pontos.push(...curva({ x: W / 2, y: 0 }, { x: W * 0.82, y: -1 }, { x: W, y: copa }));
  pontos.push({ x: W - 2, y: copa + m.mangaAltura }, { x: 2, y: copa + m.mangaAltura });
  return pontos;
}

function retangulo(largura: number, altura: number): Ponto[] {
  return [{ x: 0, y: 0 }, { x: largura, y: 0 }, { x: largura, y: altura }, { x: 0, y: altura }];
}

/** Largura e altura saem do próprio contorno (que começa em 0, 0). */
function peca(tamanho: string, papel: string, nome: string, quantidade: number, grupo: number,
  contorno: Ponto[]): Omit<PecaDoMolde, "id"> {
  const minX = Math.min(...contorno.map((p) => p.x));
  const minY = Math.min(...contorno.map((p) => p.y));
  const pontos = contorno.map((p) => ({ x: +(p.x - minX).toFixed(2), y: +(p.y - minY).toFixed(2) }));
  return {
    tamanho, papel, nome, quantidade, grupo,
    largura: Math.max(...pontos.map((p) => p.x)),
    altura: Math.max(...pontos.map((p) => p.y)),
    contorno: pontos,
    furos: [],
    origem: "exemplo",
  };
}

/** O molde pronto para `moldesApi.criar`. */
export function moldeDeExemplo(): MoldeParaGravar {
  const tamanhos = Object.keys(MEDIDAS) as Tamanho[];
  const pecas = tamanhos.flatMap((t) => {
    const m = MEDIDAS[t];
    return [
      peca(t, "frente", "Frente", 1, 0, corpo(m, 9)),
      peca(t, "costas", "Costas", 1, 1, corpo(m, 2.5)),
      peca(t, "manga", "Manga", 2, 2, manga(m)),
      peca(t, "gola", "Gola", 1, 3, retangulo(m.gola, 4)),
    ];
  });
  const grade: TamanhoDoMolde[] = tamanhos.map((nome, ordem) => ({
    nome, cor: CORES[nome], ordem, base: nome === "M",
  }));
  return {
    nome: NOME_DO_EXEMPLO,
    observacoes: "Molde de exemplo para conhecer o programa. Confira as medidas numa peça de prova antes de produzir.",
    situacao: "pronto",
    pecas,
    tamanhos: grade,
  };
}

/** As peças do tamanho M, no formato da prévia do cartão (para a estante vazia). */
export function previaDoExemplo() {
  return moldeDeExemplo().pecas.filter((p) => p.tamanho === "M").map((p) => ({
    papel: p.papel,
    quantidade: p.quantidade,
    largura: p.largura,
    altura: p.altura,
    contorno: p.contorno.map((pt) => [pt.x, pt.y] as [number, number]),
  }));
}
