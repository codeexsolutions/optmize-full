/**
 * ===========================================================================
 * API DO ENCAIXE — a memória, os recordes e o PDF
 * ===========================================================================
 *
 * Três conversas com `servidor/encaixe-memoria.js` e `servidor/encaixe-pdf.js`:
 *
 *   MEMÓRIA    o que a busca aprendeu sobre trabalho PARECIDO — quais receitas
 *              deram certo, para a próxima busca começar mais esperta;
 *   GUARDADO   o melhor encaixe já conseguido para um trabalho IDÊNTICO, para
 *              não pagar de novo por um resultado que já existe;
 *   PDF        as artes na resolução de impressão e o desenho da página, que
 *              sai gravado na PASTA DE SAÍDA — o arquivo não volta pelo cano.
 *
 * ---------------------------------------------------------------------------
 * A REGRA QUE MANDA AQUI: FALHA DE REDE NUNCA DERRUBA O ENCAIXE
 * ---------------------------------------------------------------------------
 *
 * A memória MELHORA o resultado; ela não pode impedi-lo. Servidor reiniciando,
 * ocupado ou fora do ar significa apenas que a tela começa do zero e tenta
 * salvar na próxima vez — e por isso tudo aqui devolve `null` em vez de
 * estourar, e tem prazo (2,5 s) em vez de esperar para sempre.
 *
 * A exceção é o PDF: ali a pessoa PEDIU um arquivo, e não receber é uma
 * resposta que ela precisa ver. Aquele caminho estoura de propósito.
 */

/** Uma posição do encaixe, do jeito que ela vai para o banco. */
export interface PosicaoGuardada {
  indice: number;
  copia: number;
  x: number;
  y: number;
  rot: number;
  comMascara: boolean;
  bancada: number;
}

/**
 * Onde um arquivo exportado foi parar.
 *
 * `caminho` só existe quando o arquivo ficou GRAVADO na pasta de saída — o
 * caso normal, com o painel aberto na mesma máquina do servidor. Aberto pela
 * rede não há pasta que sirva (seria o disco de quem serve), e aí o servidor
 * devolve o arquivo pelo cano: vem `blob`, e quem exporta recebe um download.
 * Ver `servidor/pasta-de-saida.js`.
 */
export interface ArquivoNaSaida {
  /** O arquivo, com caminho completo — é o que a tela mostra para a pessoa. */
  caminho?: string;
  /** A pasta de saída em si. */
  pasta?: string;
  /** Só o nome do arquivo, já com o "(2)" quando houve repetido. */
  nome?: string;
  /** O arquivo em mãos, quando o pedido veio de outra máquina. */
  blob?: Blob;
}

/**
 * Lê a resposta de uma exportação, que vem de um jeito ou de outro.
 *
 * JSON significa "gravei, e está aqui o endereço"; qualquer outra coisa é o
 * arquivo em si.
 */
async function lerExportacao(resposta: Response, oQueFalhou: string): Promise<ArquivoNaSaida> {
  const tipo = resposta.headers.get("Content-Type") || "";
  if (tipo.includes("application/json")) {
    const dados = (await resposta.json().catch(() => ({}))) as ArquivoNaSaida & { error?: string };
    if (!resposta.ok) throw new Error(dados.error || oQueFalhou);
    return dados;
  }
  if (!resposta.ok) throw new Error(oQueFalhou);
  return { blob: await resposta.blob() };
}

/**
 * O prazo das conversas com a memória.
 *
 * Curto de propósito: quem está esperando é a pessoa que apertou Optmizar, e
 * um servidor lento não pode virar uma tela parada.
 */
const PRAZO_MS = 2500;

async function pedir<T>(caminho: string, opcoes?: RequestInit): Promise<T | null> {
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(), PRAZO_MS);
  try {
    const resposta = await fetch(caminho, { ...opcoes, signal: controlador.signal });
    return resposta.ok ? ((await resposta.json()) as T) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const enviar = <T,>(caminho: string, dados: unknown) =>
  pedir<T>(caminho, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });

export const encaixeApi = {
  /** O que a busca aprendeu sobre trabalho parecido com este. */
  memoria: (assinatura: string) =>
    pedir<{ receitas?: unknown[] } | null>(`/api/encaixe/memoria?assinatura=${encodeURIComponent(assinatura)}`),

  /** Anota como foi este encaixe, para o próximo começar mais esperto. */
  anotarNaMemoria: (dados: unknown) => enviar<{ anotado?: boolean }>("/api/encaixe/memoria", dados),

  /** O melhor encaixe já conseguido para este trabalho exato. */
  async guardado(chave: string) {
    const r = await pedir<{ guardado: unknown }>(`/api/encaixe/guardado?chave=${encodeURIComponent(chave)}`);
    return r ? r.guardado : null;
  },

  guardar: (dados: unknown) => enviar("/api/encaixe/guardado", dados),

  /**
   * Cada arte sobe sozinha, em binário.
   *
   * Mandá-las dentro do JSON em base64 engordava tudo em um terço e derrubava
   * o servidor com arte de verdade.
   */
  async mandarArte(sessao: string, chave: string, arte: Blob): Promise<void> {
    const endereco = `/api/encaixe/arte?sessao=${encodeURIComponent(sessao)}&chave=${encodeURIComponent(chave)}`;
    const envio = await fetch(endereco, { method: "POST", body: arte });
    if (!envio.ok) throw new Error("o servidor não aceitou uma das artes.");
  },

  /**
   * Monta o PDF com as artes já enviadas nesta sessão e o GUARDA na pasta de
   * saída, devolvendo o endereço dele.
   *
   * O arquivo não volta pelo cano: ele nasce no servidor, e mandá-lo de volta
   * só para o navegador regravá-lo em algum lugar que a tela não conhece
   * custava a travessia de um encaixe inteiro — e deixava a pessoa sem saber
   * para onde o arquivo foi. Ver `servidor/pasta-de-saida.js`.
   */
  async pdf(corpo: unknown): Promise<ArquivoNaSaida> {
    const resposta = await fetch("/api/encaixe/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    return lerExportacao(resposta, "O servidor não conseguiu gerar o PDF.");
  },

  /**
   * Guarda na pasta de saída um arquivo montado aqui na tela (o PNG do risco).
   *
   * Sobe em binário puro, como as artes: base64 dentro de JSON engorda um
   * terço à toa, e o PNG de um rolo grande não é pequeno.
   */
  async salvarNaSaida(nome: string, arquivo: Blob): Promise<ArquivoNaSaida> {
    const resposta = await fetch(`/api/encaixe/salvar?nome=${encodeURIComponent(nome)}`, {
      method: "POST",
      body: arquivo,
    });
    return lerExportacao(resposta, "O servidor não conseguiu salvar o arquivo.");
  },
};

/**
 * Um número curto e estável a partir de um texto (FNV-1a).
 *
 * Serve para a chave do trabalho caber num campo de banco sem carregar a lista
 * inteira de peças. Não é criptografia e não precisa ser: o pior caso de uma
 * colisão é a tela oferecer um encaixe guardado que não serve, e a conferência
 * de índices em `usarEncaixeGuardado` recusa.
 */
export function embaralharTexto(texto: string): string {
  let n = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    n ^= texto.charCodeAt(i);
    n = Math.imul(n, 0x01000193) >>> 0;
  }
  return n.toString(36);
}

/** Uma peça, do pouco que a chave do trabalho precisa saber sobre ela. */
interface PecaNaChave {
  nome: string;
  largura: number;
  altura: number;
  qtd: number;
  giro: string;
  contorno: string;
  pxW: number;
  pxH: number;
  grupo?: string | null;
}

/**
 * A identidade de um trabalho: as mesmas peças, no mesmo tecido, com a mesma
 * folga e a mesma bancada.
 */
export function chaveDoTrabalho(
  pecas: PecaNaChave[], larguraTecido: number, espaco: number, comprimentoBancada: number,
): string {
  // O grupo entra na chave: ele muda a fila de entrada e, com ela, o encaixe.
  // Sem isso, agrupar peças e refazer a procura traria de volta o risco salvo
  // de ANTES do grupo, e a tela mostraria um encaixe que ignora o agrupamento
  // como se fosse a resposta a ele.
  const lista = pecas.map((p) =>
    [p.nome, p.largura, p.altura, p.qtd, p.giro, p.contorno, p.pxW, p.pxH, p.grupo || ""].join("~"),
  ).sort().join("|");
  // O "b" antes do comprimento não é enfeite: sem ele, uma chave nova de
  // bancada 1 cm cairia em cima da chave velha de margem 1 cm, e o trabalho
  // abriria com um encaixe guardado que não respeita bancada nenhuma.
  return `${larguraTecido}/${espaco}/b${comprimentoBancada}/${embaralharTexto(lista)}`;
}

/** O encaixe do jeito que ele vai para o banco: só o essencial de cada peça. */
export function posicoesParaGuardar(resultado: {
  posicoes: { item: { indice: number; copia?: number }; x: number; y: number; rot?: number; girado?: boolean; mascara?: unknown; bancada?: number }[];
}): PosicaoGuardada[] {
  return resultado.posicoes.map((p) => ({
    indice: p.item.indice,
    copia: p.item.copia == null ? 1 : p.item.copia,
    x: Math.round(p.x * 1000) / 1000,
    y: Math.round(p.y * 1000) / 1000,
    rot: p.rot == null ? (p.girado ? 90 : 0) : p.rot,
    comMascara: !!p.mascara,
    // A bancada vai junto: um encaixe guardado sem ela voltaria como um rolo
    // inteiriço, e o PDF sairia numa página só depois de a busca ter respeitado
    // a bancada. A chave do trabalho já inclui o comprimento (`chaveDoTrabalho`),
    // então um guardado só volta para o mesmo comprimento de bancada.
    bancada: p.bancada || 0,
  }));
}
