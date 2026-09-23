/**
 * ===========================================================================
 * A ARTE QUE PRECISA DO SERVIDOR PARA ENTRAR
 * ===========================================================================
 *
 * O Encaixe carrega toda arte por `<img>` e canvas, e dois tipos de arquivo
 * não atravessam esse caminho: o TIFF, que o navegador não abre, e o CMYK sem
 * perfil, que ele abre e pinta errado (medido: erro de 85 num verde).
 *
 * Quem decide se um arquivo é desses é `motores/corDoArquivo.js`, olhando o
 * cabeçalho — conta pura, sem rede. Este arquivo é só a conversa com
 * `/api/arte/preparar`, que devolve a mesma arte em sRGB, com o dpi e a
 * transparência de pé (ver `servidor/arte-entrada.js`).
 *
 * ---------------------------------------------------------------------------
 * FALHAR AQUI NÃO PODE PARAR O TRABALHO
 * ---------------------------------------------------------------------------
 *
 * Se o servidor não responder, o arquivo ORIGINAL segue adiante. Para o CMYK
 * sem perfil isso significa a cor de antes — pior, e ainda assim trabalho
 * andando. Para o TIFF significa o erro que a leitura já dava ("não parece ser
 * uma imagem válida"), agora com o motivo do servidor junto.
 *
 * O contrário — barrar a arte porque a conversão falhou — trocaria uma cor
 * aproximada por uma tela vazia no meio do expediente.
 */

import {
  ARTE_COR_ERRADA, ARTE_NAO_ABRE, COR_BYTES_PARA_LER, comoONavegadorLe,
} from "../motores/corDoArquivo";

export interface ArtePreparada {
  /** O arquivo que deve seguir para o Encaixe: o convertido, ou o original. */
  file: File;
  /** Houve conversão? `false` também quando não era preciso. */
  convertida: boolean;
  /** O espaço de cor de onde ela veio ("cmyk"), quando houve conversão. */
  espaco: string;
  /** A cor saiu de um perfil assumido, e não do perfil do arquivo. */
  perfilAssumido: boolean;
  /** A cor veio da conta do Corel, e não da travessia do perfil. */
  direta: boolean;
  /** O que impediu a conversão, quando ela era necessária e falhou. */
  erro?: string;
}

const INTACTA = (file: File): ArtePreparada => ({
  file, convertida: false, espaco: "", perfilAssumido: false, direta: false,
});

/**
 * Deixa a arte do jeito que o navegador lê.
 *
 * Devolve o arquivo ORIGINAL quando ele já serve — que é o caso da grande
 * maioria, e por isso a decisão vem antes de qualquer ida ao servidor.
 */
export async function prepararArteParaONavegador(
  file: File, { direta = false } = {},
): Promise<ArtePreparada> {
  let precisa: string;
  try {
    const inicio = new Uint8Array(await file.slice(0, COR_BYTES_PARA_LER).arrayBuffer());
    precisa = comoONavegadorLe(inicio, file.name);
  } catch {
    // Não conseguir ler o cabeçalho não decide nada: segue como sempre seguiu.
    return INTACTA(file);
  }

  /*
   * A CONVERSÃO DIRETA PASSA MESMO QUANDO O NAVEGADOR DARIA CONTA.
   *
   * Arte CMYK COM perfil o navegador abre sozinho, e por isso ela não vem para
   * cá — mas o preto dela volta lavado do mesmo jeito, porque o navegador
   * também atravessa o perfil. Quem pede a conta do Corel está pedindo
   * justamente para NÃO atravessar, então essa arte passa a vir.
   */
  if (!direta && precisa !== ARTE_NAO_ABRE && precisa !== ARTE_COR_ERRADA) return INTACTA(file);

  try {
    const endereco = `/api/arte/preparar?nome=${encodeURIComponent(file.name)}`
      + (direta ? "&direta=1" : "");
    const resposta = await fetch(endereco, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: file,
    });

    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => ({}));
      return { ...INTACTA(file), erro: erro.error || "o servidor não conseguiu preparar esta arte." };
    }

    const bytes = await resposta.blob();
    const convertida = resposta.headers.get("X-Arte-Convertida") === "1";
    if (!convertida) return INTACTA(file);

    /*
     * O NOME DO ARQUIVO CONTINUA SENDO O DE ANTES.
     *
     * O nome não é enfeite no Encaixe: dele saem a quantidade ("5x"), o corte e
     * o nome que aparece na lista e no PDF (ver `nomeDeArquivo.js`). Trocar
     * "capa 5x.tif" por "capa 5x.jpg" mudaria a peça que a pessoa reconhece; a
     * extensão que não bate com o conteúdo não incomoda ninguém daqui para a
     * frente, porque quem lê os bytes é o navegador, e eles agora são de JPEG.
     */
    return {
      file: new File([bytes], file.name, { type: bytes.type, lastModified: file.lastModified }),
      convertida: true,
      espaco: resposta.headers.get("X-Arte-Espaco") || "",
      perfilAssumido: resposta.headers.get("X-Arte-Perfil-Assumido") === "1",
      direta: resposta.headers.get("X-Arte-Direta") === "1",
    };
  } catch {
    return { ...INTACTA(file), erro: "o Optmize não conseguiu falar com o servidor para preparar esta arte." };
  }
}
