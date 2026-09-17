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
 *   PDF        as artes na resolução de impressão e o desenho da página.
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
   * Monta o PDF com as artes já enviadas nesta sessão e devolve o CANO dele.
   *
   * O corpo vem como fluxo, e não como `Blob`, porque quem grava é o arquivo
   * que a pessoa escolheu antes de exportar (ver `escolherOndeSalvar`, na
   * tela): o PDF escorre do servidor direto para o disco, sem passar inteiro
   * pela memória do navegador. Um encaixe de 11 metros não é pequeno.
   */
  async pdf(corpo: unknown): Promise<ReadableStream<Uint8Array>> {
    const resposta = await fetch("/api/encaixe/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => ({}));
      throw new Error(erro.error || "O servidor não conseguiu gerar o PDF.");
    }
    if (!resposta.body) throw new Error("O servidor não mandou o PDF.");
    return resposta.body;
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
 * Tudo o que distingue uma peça de outra, num texto só.
 *
 * É a unidade da chave do trabalho E a impressão digital que o encaixe
 * guardado leva para o banco. As duas TÊM que sair daqui: a chave ignora a
 * ordem das peças (ela ordena a lista), e o encaixe guardado é todo por
 * índice de linha da tabela. Se as duas coisas divergirem, a chave diz "é o
 * mesmo trabalho" enquanto os índices apontam para peças trocadas — ver
 * `traduzirIndicesDoGuardado`.
 *
 * O grupo entra: ele muda a fila de entrada e, com ela, o encaixe. Sem isso,
 * agrupar peças e refazer a procura traria de volta o risco salvo de ANTES do
 * grupo, e a tela mostraria um encaixe que ignora o agrupamento como se fosse
 * a resposta a ele.
 */
function impressaoDaPeca(p: PecaNaChave): string {
  return [p.nome, p.largura, p.altura, p.qtd, p.giro, p.contorno, p.pxW, p.pxH, p.grupo || ""].join("~");
}

/** As peças do jeito que o encaixe guardado precisa delas: uma impressão por linha, NA ORDEM. */
export function pecasParaGuardar(pecas: PecaNaChave[]): string[] {
  return pecas.map(impressaoDaPeca);
}

/**
 * De qual linha de HOJE saiu cada linha de ONTEM.
 *
 * A chave do trabalho ordena as peças antes de resumir, então ela é a mesma
 * para qualquer ordem da tabela. Os índices gravados no encaixe guardado, não:
 * eles são a linha da tabela, e só. Tirar uma peça e pôr de volta (ela volta
 * para o fim da lista) bastava para a chave continuar batendo e cada posição
 * passar a apontar para a peça errada — a tela remontava o encaixe com as
 * peças trocadas de tamanho, uma por cima da outra.
 *
 * Então aqui a ordem de ontem é casada com a de hoje, peça por peça. Se for só
 * uma troca de ordem, o encaixe volta inteiro e certo. Se não casar — peça
 * diferente, ou lista gravada antes de isto existir, quando só o nome e a
 * quantidade iam para o banco — devolve `null`, e quem chamou não oferece um
 * encaixe que não sabe remontar.
 */
export function traduzirIndicesDoGuardado(
  impressoesDeOntem: unknown, pecasDeHoje: PecaNaChave[],
): number[] | null {
  if (!Array.isArray(impressoesDeOntem) || impressoesDeOntem.length !== pecasDeHoje.length) return null;
  if (!impressoesDeOntem.every((i) => typeof i === "string")) return null;

  // Peças de impressão igual são intercambiáveis por definição: a chave do
  // trabalho também não sabe distingui-las. Vão por ordem de chegada.
  const livres = new Map<string, number[]>();
  pecasDeHoje.forEach((peca, i) => {
    const impressao = impressaoDaPeca(peca);
    const fila = livres.get(impressao);
    if (fila) fila.push(i); else livres.set(impressao, [i]);
  });

  const paraHoje: number[] = [];
  for (const impressao of impressoesDeOntem as string[]) {
    const fila = livres.get(impressao);
    if (!fila || fila.length === 0) return null;
    paraHoje.push(fila.shift() as number);
  }
  return paraHoje;
}

/** Um resultado parcial não pode voltar do histórico como trabalho completo. */
export function posicoesGuardadasValidas(
  posicoes: unknown, pecas: { qtd: number }[], paraHoje: number[],
): boolean {
  if (!Array.isArray(posicoes) || posicoes.length !== pecas.reduce((s, p) => s + p.qtd, 0)) return false;
  const vistas = new Set<string>();
  for (const p of posicoes) {
    if (!p || !Number.isInteger(p.indice) || !Number.isInteger(p.copia)) return false;
    const indice = paraHoje[p.indice];
    const peca = indice === undefined ? undefined : pecas[indice];
    if (!peca || p.copia < 1 || p.copia > peca.qtd) return false;
    // A borda transparente da arte pode ficar fora do tecido, com origem negativa.
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)
      || ![0, 90, 180, 270].includes(p.rot)) return false;
    const chave = `${indice}/${p.copia}`;
    if (vistas.has(chave)) return false;
    vistas.add(chave);
  }
  return true;
}

/**
 * A identidade de um trabalho: as mesmas peças, no mesmo tecido, com a mesma
 * folga e a mesma bancada.
 */
export function chaveDoTrabalho(
  pecas: PecaNaChave[], larguraTecido: number, espaco: number, comprimentoBancada: number,
): string {
  const lista = pecas.map(impressaoDaPeca).sort().join("|");
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
