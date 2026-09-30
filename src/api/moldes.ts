/**
 * ===========================================================================
 * API DOS MOLDES — a estante, as peças e as estampas
 * ===========================================================================
 *
 * A conversa com `servidor/moldes-api.js`, tipada num lugar só.
 *
 * O que guarda um molde é o CONTORNO em centímetros, e não uma figura: é isso
 * que faz a peça voltar à tela, ir ao encaixe e sair em PDF sempre na medida.
 * O `contorno` abaixo é essa lista de pontos, e `furos` são os buracos de
 * dentro dela (a casa da gola, o vazado de um bolso).
 *
 * Uma ESTAMPA (`Estampa`) é um jogo de artes guardado junto com o molde, uma
 * por papel de peça — frente, costas, manga. Guardar por PAPEL, e não por peça
 * de um tamanho, é o que faz a mesma estampa servir para P, M e G: ao trocar o
 * tamanho o contorno muda e a arte se ajusta ao contorno novo.
 */

import { api } from "./cliente";
import type { NoDoRisco } from "./risco";

/** Um ponto do contorno, em centímetros. */
export type Ponto = { x: number; y: number };

/** Rascunho: acabou de sair do Digitalizar e ainda não vai ao Encaixe. */
export type SituacaoDoMolde = "rascunho" | "pronto";

/** As marcações da Montagem. Ver `motores/montagem.js`. */
export interface Marcacoes {
  /** Margem de costura em cm. 0 = o risco já é o corte. */
  margem: number;
  espelhar: boolean;
  /** Centro, ângulo em graus (0 = vertical) e comprimento, em cm. */
  fio: { x: number; y: number; angulo: number; comprimento: number };
  /** Presos ao traço: trecho que começa no nó `no`, em `t` (0..1). */
  piques: { no: number; t: number; profundidade: number }[];
  pontos: Ponto[];
}

/** Um tamanho da grade, com a cor em que a Audaces o desenha. */
export interface TamanhoDoMolde {
  nome: string;
  /** `#rrggbb`. */
  cor: string;
  ordem: number;
  /** O tamanho de onde os outros foram graduados. Um só por molde. */
  base: boolean;
}

/** Quanto um ponto anda, em cm (x para a direita, y para baixo). */
export interface Deslocamento { dx: number; dy: number }

/** A regra de um nó. Ver `motores/graduacao.js`. */
export type RegraDeGraduacao =
  | { no: number; modo: "igual"; passo: Deslocamento }
  | { no: number; modo: "porTamanho"; deslocamentos: Record<string, Deslocamento> };

/** A graduação de uma peça, guardada na linha do tamanho base. */
export interface Graduacao {
  jeito: "pontos" | "porcentagem";
  regras: RegraDeGraduacao[];
  /** % por tamanho, no jeito "porcentagem". */
  porcentagem: number;
  /** Regras perdidas quando nós do base foram apagados (a tela avisa). */
  perdidos?: number;
}

/** Uma peça do molde: o contorno de UMA parte, num tamanho. */
export interface PecaDoMolde {
  id?: number;
  tamanho: string;
  /** "frente", "costas", "manga direita"… — é por ele que a arte encontra a peça. */
  papel: string;
  nome: string;
  quantidade: number;
  largura: number;
  altura: number;
  contorno: Ponto[];
  furos: Ponto[][];
  origem: string | null;
  nos?: NoDoRisco[] | null;
  marcacoes?: Marcacoes | null;
  ordem?: number;
  /** Linhas com o mesmo grupo são a mesma peça em tamanhos diferentes. */
  grupo?: number | null;
  /** Só na linha do base: a regra que gera os outros tamanhos. */
  graduacao?: Graduacao | null;
}

/** O ajuste de uma arte dentro do contorno. Ver `motores/arteMolde.js`. */
export interface AjusteDaArte {
  tipo: string;
  modo: string;
  escala: number;
  giro: number;
  x: number;
  y: number;
  ppcmArquivo?: number | null;
}

export interface PecaDaEstampa {
  papel: string;
  arquivo: string;
  url: string;
  nomeOriginal: string | null;
  ajuste: AjusteDaArte;
}

export interface Estampa {
  id: number;
  nome: string;
  pecas: PecaDaEstampa[];
}

/** O molde na estante: só o resumo que o cartão mostra. */
export interface MoldeNaEstante {
  id: number;
  nome: string;
  observacoes: string | null;
  situacao: SituacaoDoMolde;
  tamanhos: string[];
  /** A cor de cada tamanho que tem cor guardada. */
  cores: Record<string, string>;
  totalPecas: number;
  /** Quantas peças de tecido saem de UMA peça pronta, num tamanho só. */
  pecasPorUnidade: number;
}

/** O molde aberto, com tudo dentro. */
export interface Molde {
  id: number;
  nome: string;
  observacoes: string | null;
  situacao: SituacaoDoMolde;
  pecas: PecaDoMolde[];
  /** A grade guardada; vazia num molde que nunca teve cor de tamanho. */
  tamanhos: TamanhoDoMolde[];
  /** A linha preta em volta de cada peça, em mm (0 = sem). Ver a spec da linha em volta da peça. */
  linha: number;
  artes: Estampa[];
}

export interface MoldeParaGravar {
  nome: string;
  observacoes: string;
  situacao?: SituacaoDoMolde;
  pecas: Omit<PecaDoMolde, "id">[];
  /** Sem o campo, o servidor mantém a grade guardada (o passo a passo antigo). */
  tamanhos?: TamanhoDoMolde[];
  /** A linha em volta da peça, em mm. Sem o campo, o servidor mantém a guardada. */
  linha?: number;
}

export const moldesApi = {
  estante: () => api.get<MoldeNaEstante[]>("/moldes"),
  abrir: (id: number) => api.get<Molde>(`/moldes/${id}`),
  criar: (corpo: MoldeParaGravar) => api.post<{ id: number }>("/moldes", corpo),
  regravar: (id: number, corpo: MoldeParaGravar) => api.put(`/moldes/${id}`, corpo),
  apagar: (id: number) => api.apagar(`/moldes/${id}`),

  /**
   * A imagem da arte sobe em binário, e não em base64 dentro de JSON: a mesma
   * arte em base64 cresce um terço e ainda passa pelo montador de texto do
   * servidor — foi o que já derrubou o download do PDF quando a arte era
   * grande.
   */
  async mandarArte(moldeId: number, papel: string, arquivo: File): Promise<{ arquivo: string; url: string }> {
    const resposta = await fetch(
      `/api/moldes/${moldeId}/artes/imagem?papel=${encodeURIComponent(papel)}`,
      {
        method: "POST",
        headers: { "Content-Type": arquivo.type || "application/octet-stream" },
        body: arquivo,
      },
    );
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(corpo.error || "o servidor não aceitou a imagem");
    return corpo;
  },

  /** Guarda uma estampa nova, ou regrava uma que já existe (mandando o `id`). */
  guardarEstampa: (
    moldeId: number,
    estampa: {
      id: number | null;
      nome: string;
      pecas: { papel: string; arquivo: string; nomeOriginal: string; ajuste: AjusteDaArte }[];
    },
  ) => api.post<{ id: number }>(`/moldes/${moldeId}/artes`, estampa),

  apagarEstampa: (moldeId: number, estampaId: number) =>
    api.apagar(`/moldes/${moldeId}/artes/${estampaId}`),
};
