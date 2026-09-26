/**
 * ===========================================================================
 * API DOS PROJETOS — clientes, pastas e as artes de dentro
 * ===========================================================================
 *
 * A tela conversa com `servidor/projetos-api.js` só por aqui. O que este
 * arquivo acrescenta ao `api/cliente.ts` é o VOCABULÁRIO: os tipos do que vai
 * e do que volta.
 *
 * Vale um aviso sobre os nomes: o banco usa `largura_tecido`,
 * `comprimento_bancada`, `cliente_id` — e o corpo que se ENVIA usa
 * `larguraTecido`, `comprimentoBancada`, `clienteId`. Não é descuido: o `PUT`
 * recebe um corpo escrito pela tela e o `GET` devolve a linha do SQLite como
 * ela está. Os dois formatos estão declarados abaixo, cada um do seu lado, em
 * vez de "arrumados" numa tradução que esconderia a diferença.
 */

import { api } from "./cliente";

/** Uma pasta de cliente, com quantos projetos tem dentro. */
export interface Cliente {
  id: number;
  nome: string;
  observacoes: string | null;
  projetos: number;
}

/** Um projeto na lista de uma pasta. */
export interface ProjetoNaLista {
  id: number;
  nome: string;
  observacoes: string | null;
  largura_tecido: number | null;
  /** Quantas artes o projeto tem. */
  pecas: number;
  /** A soma das quantidades: quantas peças saem de UMA unidade. */
  pecasPorUnidade: number;
  /** A miniatura da primeira arte — nunca o arquivo de impressão. */
  capa: string | null;
}

/** Uma arte dentro do projeto, do jeito que o servidor a devolve. */
export interface PecaDoProjeto {
  id: number;
  nome: string;
  arquivo: string;
  url: string;
  miniatura: string | null;
  largura: number;
  altura: number;
  quantidade: number;
}

/*
 * A ESTRUTURA DO PROJETO, no jeito do Optmize Lite:
 *
 *   subprojeto (as abas: Camisa, Bandeira)
 *   └─ categoria (PP × 2, M × 5 — a quantidade pedida)
 *      └─ peça (Frente, Manga — quantas por item, e a arte)
 *
 * Levar ao Encaixe multiplica: cada peça sai `quantidade × porItem` vezes.
 */

/** A arte de uma peça, já no servidor, com a medida real em centímetros. */
export interface ArteDaPeca {
  /** O nome no disco, em `/uploads/projetos/`. */
  arquivo: string;
  /** O nome do arquivo como a pessoa o mandou. */
  nome: string;
  miniatura: string | null;
  largura: number;
  altura: number;
}

export interface PecaDaCategoria {
  id: string;
  nome: string;
  porItem: number;
  /** Índice da cor da bolinha (`--peca-1` a `--peca-10`). */
  cor: number;
  arte: ArteDaPeca | null;
}

export interface CategoriaDoSubprojeto {
  id: string;
  rotulo: string;
  quantidade: number;
  pecas: PecaDaCategoria[];
}

export interface Subprojeto {
  id: string;
  nome: string;
  categorias: CategoriaDoSubprojeto[];
}

export interface EstruturaDoProjeto {
  subprojetos: Subprojeto[];
}

/** O projeto aberto, inteiro. */
export interface Projeto {
  id: number;
  nome: string;
  observacoes: string | null;
  largura_tecido: number | null;
  espaco: number | null;
  comprimento_bancada: number | null;
  giro: string | null;
  cliente: { id: number; nome: string } | null;
  pecas: PecaDoProjeto[];
  /** Sempre vem: num projeto de antes dela, o servidor a monta das peças. */
  estrutura: EstruturaDoProjeto;
}

/** O corpo do `PUT`: o projeto inteiro, como a tela o edita. */
export interface ProjetoParaGravar {
  nome: string;
  observacoes: string;
  larguraTecido: number | null;
  /** Em MILÍMETRO, que é o que o campo desta tela pergunta. */
  espaco: number | null;
  comprimentoBancada: number | null;
  giro: string;
  pecas: {
    nome: string;
    arquivo: string;
    miniatura: string | null;
    largura: number;
    altura: number;
    quantidade: number;
  }[];
}

export const projetosApi = {
  clientes: () => api.get<Cliente[]>("/projetos/clientes"),
  criarCliente: (nome: string) => api.post<{ id: number }>("/projetos/clientes", { nome }),
  renomearCliente: (id: number, nome: string) => api.put(`/projetos/clientes/${id}`, { nome }),
  apagarCliente: (id: number) => api.apagar(`/projetos/clientes/${id}`),

  projetosDoCliente: (id: number) =>
    api.get<{ cliente: { id: number; nome: string }; projetos: ProjetoNaLista[] }>(
      `/projetos/clientes/${id}/projetos`,
    ),

  abrir: (id: number) => api.get<Projeto>(`/projetos/${id}`),
  criar: (clienteId: number, nome: string) => api.post<{ id: number }>("/projetos", { clienteId, nome }),
  gravar: (id: number, corpo: ProjetoParaGravar) => api.put(`/projetos/${id}`, corpo),
  apagar: (id: number) => api.apagar(`/projetos/${id}`),
  /** Grava o nome e a estrutura inteira; as peças do projeto saem dela. */
  gravarEstrutura: (id: number, nome: string, estrutura: EstruturaDoProjeto) =>
    api.put(`/projetos/${id}/estrutura`, { nome, estrutura }),

  /**
   * As prévias feitas na hora, para a próxima abertura ser instantânea.
   * É `PATCH` porque mexe só nesse campo e deixa o resto do projeto em paz.
   */
  guardarMiniaturas: (id: number, miniaturas: { id: number; miniatura: string }[]) =>
    api.patch(`/projetos/${id}/miniaturas`, { miniaturas }),

  /**
   * A arte sobe em binário, e não em JSON: uma camiseta em 300 dpi passa de
   * 29 megapixels, e em base64 dentro de um JSON isso cresce um terço e ainda
   * obriga o servidor a decodificar a string inteira na memória.
   */
  async mandarImagem(id: number, arquivo: File): Promise<{ arquivo: string; url: string }> {
    const resposta = await fetch(`/api/projetos/${id}/imagem`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Uint8Array(await arquivo.arrayBuffer()),
    });
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(corpo.error || "falhou o envio");
    return corpo;
  },
};
