/**
 * ===========================================================================
 * IMPRESSORAS — o que o servidor devolve
 * ===========================================================================
 *
 * Os tipos das respostas de `/api/impressoras`. Ficam num arquivo só porque
 * quase toda tela daqui lê mais de uma rota: o painel junta máquinas, resumo
 * do dia e o que está imprimindo agora; o histórico usa os mesmos registros
 * em duas apresentações.
 *
 * Os nomes estão em inglês por um motivo: o servidor foi portado de um sistema
 * que já rodava, e as chaves do JSON são as dele. Traduzir aqui obrigaria a
 * traduzir de volta em cada `fetch` — um mapa a mais para manter, com a chance
 * de errar um campo em silêncio. O tipo acompanha o dado.
 */

/** O tipo de software que a impressora usa, e que decide como o histórico é lido. */
export type TipoDeMaquina = "csv" | "xml" | "at-binary";

/**
 * O resumo de um conjunto de trabalhos.
 *
 * Metragem, área, tempo e tinta contam **apenas o que foi concluído**: um
 * trabalho cancelado gastou tecido de verdade, mas contá-lo na metragem faria
 * o total do dia crescer quando a produção deu errado.
 */
export interface Resumo {
  jobs: number;
  completed: number;
  cancelled: number;
  errors: number;
  printLength: number;
  printArea: number;
  timeSeconds: number;
  inkMl: number;
}

/** Um trabalho impresso, do jeito que ficou guardado no banco. */
export interface Registro {
  id: string;
  machineId: string;
  machineName: string;
  sourceType: string;
  dateTime: string;
  date: string;
  time: string;
  task: string;
  status: string;
  cancelled: boolean;
  error: boolean;
  printArea: number;
  printLength: number;
  /**
   * A metragem não veio do arquivo — foi deduzida (dos dots e da resolução do
   * Joblist, quando o CSV grava `0 x 0` num trabalho Clip/Tile). A tela marca
   * esses para ninguém tomar um número deduzido por medido.
   */
  metricEstimated: boolean;
  timeSeconds: number;
  inkMl: number;
  /** O consumo de tinta do arquivo binário do AT ainda não foi conferido contra a tela da máquina. */
  inkExperimental: boolean;
  inkChannels: { code: string; color: string; ml: number }[];
  /** Como achar o preview desta arte na pasta da máquina. */
  previewRef: string;
  progressPercent: number | null;
  progressState: string | null;
  isClipOrTile: boolean;
}


/** Os caminhos de rede de uma máquina. Quem os preenche é a varredura. */
export interface RotasDaMaquina {
  historyPath?: string;
  previewDir?: string;
  liveLogDir?: string;
  liveLogFile?: string;
  statusLogDir?: string;
  jobListPath?: string;
  inkStatsPath?: string;
}

/** O que a tela de gestão mostra: as rotas cruas e o tamanho do histórico. */
export interface MaquinaGerenciada extends RotasDaMaquina {
  id: string;
  name: string;
  type: TipoDeMaquina;
  typeLabel: string;
  enabled: boolean;
  host: string | null;
  ip: string | null;
  origin: string;
  online: boolean;
  error: string | null;
  paths: RotasDaMaquina;
  stats: {
    records: number;
    firstDate: string | null;
    lastDate: string | null;
    meters: number;
    pedidoItems: number;
    pedidos: number;
  };
}

/**
 * O que a varredura fez com cada máquina que achou.
 *
 * `pending` é o estado que importa: a máquina existe na rede, mas ainda não
 * existe no sistema. Ela fica esperando alguém dar um nome — cadastrar sozinho
 * encheria a lista de "DESKTOP-5KFPUBG", que ninguém reconhece na tela.
 */
export type AcaoDaVarredura = "pending" | "created" | "updated" | "unchanged";

export interface AchadoDaVarredura {
  action: AcaoDaVarredura;
  host: string;
  ip: string | null;
  type: TipoDeMaquina;
  typeLabel: string;
  share: string;
  root: string;
  machineId: string | null;
  machineName: string | null;
  paths: RotasDaMaquina;
  /** Quantos registros de histórico entraram depois de cadastrar. */
  imported?: number;
  importError?: string | null;
  importing?: boolean;
}

export interface EstadoDaVarredura {
  running: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  phase: "idle" | "starting" | "sweep" | "hosts" | "identify" | "history" | "done" | "error";
  scanned: number;
  total: number;
  message: string;
  reachable: number;
  results: AchadoDaVarredura[];
  error: string | null;
}

/** Uma impressão acontecendo agora. */
export interface AoVivo {
  machineId: string;
  machineName?: string;
  task?: string;
  dateTime?: string;
  progressPercent?: number | null;
  progressState?: string | null;
  finish?: number | null;
  total?: number | null;
  printLength?: number;
  progressAt?: number;
}

export interface RespostaDeHistorico {
  start: string;
  end: string;
  records: Registro[];
  summary: Resumo;
  machines: {
    id: string;
    name: string;
    type: TipoDeMaquina;
    online: boolean;
    error: string | null;
    inkLowColors: string[];
    summary: Resumo;
  }[];
}

export interface DiaDaSerie {
  date: string;
  meters: number;
  jobs: number;
  inkMl: number;
}

export interface RespostaDeDashboard {
  date: string;
  start: string;
  end: string;
  days: number;
  today: Resumo;
  period: Resumo;
  /** A janela anterior do mesmo tamanho, só para a variação percentual. */
  previous: Resumo;
  series: DiaDaSerie[];
  inkChannels: { code: string; color: string; ml: number }[];
  machines: {
    machine: { id: string; name: string; type: TipoDeMaquina };
    online: boolean;
    error: string | null;
    inkLowColors: string[];
    today: Resumo;
    period: Resumo;
    series: DiaDaSerie[];
  }[];
}

/** O estado do bot do WhatsApp. */
export interface EstadoDoWhatsapp {
  status: "off" | "starting" | "qr" | "ready" | "error";
  connected: boolean;
  qrSvg: string;
  qrAt: number;
  lastError: string | null;
  me: { pushname?: string; number?: string } | null;
  hasSession: boolean;
  running: boolean;
}

export interface AjustesDoWhatsapp {
  groupId: string;
  groupName: string;
  enabled: boolean;
  notifyStart: boolean;
  notifyFinish: boolean;
  notifyError: boolean;
  /** Vazio quer dizer todas. */
  machines: string[];
}
