/**
 * ===========================================================================
 * ALERTA — o aviso do programa, no desenho do CodeEx Flow
 * ===========================================================================
 *
 * Vem do `shared/ui/Alert.tsx` do Flow: o ícone que se DESENHA ao abrir (o
 * anel e depois o sinal), o halo da cor do tipo respirando atrás, a superfície
 * de vidro com o fio de luz no topo. Quem já usa o Flow reconhece a caixa.
 *
 * O que muda é a pele: as cores são os tokens daqui (`--danger`, `--success`,
 * `--warn`, `--accent`, em `estilo/tokens.css`), e as animações são CSS puro
 * (`estilo/alerta.css`) — o programa não carrega `framer-motion`.
 *
 * ---------------------------------------------------------------------------
 * AS FORMAS
 * ---------------------------------------------------------------------------
 *
 *   caixa        no meio da tela, com véu atrás. Erro, sucesso, aviso,
 *                informação, pergunta — e pergunta com campo de texto;
 *   toast        no canto, sem bloquear nada, some sozinho;
 *   carregando   a caixa sem botão, com o anel girando. Quem fecha é o código
 *                que abriu (ver `durante`), nunca a pessoa: fechar a caixa não
 *                cancelaria o pedido que continua a caminho.
 *
 * Um alerta por vez. Abrir outro por cima responde o de baixo como
 * "dispensado" — quem esperava por ele não fica esperando para sempre.
 *
 * ---------------------------------------------------------------------------
 * DE ONDE SE CHAMA
 * ---------------------------------------------------------------------------
 *
 * De qualquer lugar, sem hook: `alerta.erro("Não deu para salvar", motivo)`.
 * O `<ProvedorDeAlerta>` fica em `main.tsx`, acima de tudo — o login usa o
 * alerta antes de a casca existir. O editor de produção, que é JavaScript
 * imperativo, chega pelo mesmo `alerta` (ver `mostrarErroEncaixe`, em
 * `producao/controlador.js`).
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type TipoDeAlerta = "sucesso" | "erro" | "aviso" | "info" | "pergunta" | "carregando";

export interface OpcoesDoAlerta {
  tipo?: TipoDeAlerta;
  titulo?: string;
  texto?: ReactNode;
  /** A linha pequena, em versalete, acima do título. */
  kicker?: string;
  confirmar?: string;
  cancelar?: string;
  /** Mostra o botão de cancelar. */
  cancelavel?: boolean;
  /** O botão de confirmar vai em vermelho: a ação não tem volta. */
  perigoso?: boolean;
  /** Pede um texto; a resposta vem em `valor`. */
  campo?: { valor?: string; exemplo?: string };
  /** Canto da tela, sem véu, some sozinho. */
  toast?: boolean;
  /** Fecha sozinho depois de N ms (4000 no toast; nunca na caixa, se omitido). */
  tempo?: number;
}

export interface RespostaDoAlerta {
  confirmado: boolean;
  /** O texto escrito, quando a caixa tinha campo. */
  valor: string;
}

/* ------------------------------------------------------------------------- */
/* O ÍCONE QUE SE DESENHA                                                     */
/* ------------------------------------------------------------------------- */

function Icone({ tipo }: { tipo: TipoDeAlerta }) {
  return (
    <div className="alerta-icone" aria-hidden="true">
      <span className="alerta-halo" />
      <svg viewBox="0 0 60 60" width={78} height={78}>
        {/*
          No carregamento o anel não se desenha — ele GIRA. Um anel que se
          desenha uma vez e para, numa caixa sem botão, é indistinguível de
          tela travada.
        */}
        {tipo === "carregando" ? (
          <>
            <circle cx="30" cy="30" r="26.5" className="alerta-trilho" />
            <circle cx="30" cy="30" r="26.5" className="alerta-gira" strokeDasharray="42 125" />
          </>
        ) : (
          <circle cx="30" cy="30" r="26.5" className="alerta-anel" />
        )}
        {tipo === "sucesso" && <polyline className="alerta-sinal" points="19,31 27,39 42,22" />}
        {tipo === "erro" && (
          <>
            <line className="alerta-sinal" x1="21" y1="21" x2="39" y2="39" />
            <line className="alerta-sinal alerta-sinal-2" x1="39" y1="21" x2="21" y2="39" />
          </>
        )}
        {tipo === "aviso" && (
          <>
            <line className="alerta-sinal" x1="30" y1="18" x2="30" y2="34" />
            <circle className="alerta-ponto" cx="30" cy="42" r="2.6" />
          </>
        )}
        {tipo === "info" && (
          <>
            <circle className="alerta-ponto" cx="30" cy="20" r="2.6" />
            <line className="alerta-sinal" x1="30" y1="28" x2="30" y2="42" />
          </>
        )}
        {tipo === "pergunta" && (
          <>
            <path className="alerta-sinal" d="M23 24a7 7 0 0 1 13 2c0 5-6 5-6 9" />
            <circle className="alerta-ponto" cx="30" cy="42" r="2.6" />
          </>
        )}
      </svg>
    </div>
  );
}

const SINAL_DO_TOAST: Record<TipoDeAlerta, string> = {
  sucesso: "✓", erro: "✕", aviso: "!", info: "i", pergunta: "?", carregando: "",
};

/* ------------------------------------------------------------------------- */
/* A CAIXA                                                                    */
/* ------------------------------------------------------------------------- */

function Caixa({
  opcoes, fechando, valor, setValor, aoConfirmar, aoCancelar,
}: {
  opcoes: OpcoesDoAlerta;
  fechando: boolean;
  valor: string;
  setValor: (v: string) => void;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}) {
  const tipo = opcoes.tipo ?? "info";
  const travado = tipo === "carregando";
  const botao = useRef<HTMLButtonElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (travado) return;
    if (opcoes.campo) campo.current?.select();
    else botao.current?.focus();

    /*
      Esc só fecha o que tem saída lateral. Um aviso sem "Cancelar" fecha
      pelo botão, que é o jeito de garantir que alguém o leu.
    */
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === "Escape" && opcoes.cancelavel) aoCancelar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [travado, opcoes.campo, opcoes.cancelavel, aoCancelar]);

  return (
    <div
      role="presentation"
      className={`alerta-veu${fechando ? " fechando" : ""}`}
      onMouseDown={(evento) => {
        if (!travado && opcoes.cancelavel && evento.target === evento.currentTarget) aoCancelar();
      }}
    >
      <div
        role={travado ? "status" : "alertdialog"}
        aria-busy={travado || undefined}
        aria-modal="true"
        aria-label={opcoes.titulo}
        data-tipo={tipo}
        className={`alerta-caixa${fechando ? " fechando" : ""}`}
      >
        <span aria-hidden="true" className="alerta-brilho" />
        <span aria-hidden="true" className="alerta-fio" />

        {!travado && opcoes.cancelavel && (
          <button type="button" aria-label="Fechar" onClick={aoCancelar} className="alerta-x">✕</button>
        )}

        <Icone tipo={tipo} />

        {opcoes.kicker && <p className="alerta-kicker">{opcoes.kicker}</p>}
        {opcoes.titulo && <h2 className="alerta-titulo">{opcoes.titulo}</h2>}
        {opcoes.texto && <div className="alerta-texto">{opcoes.texto}</div>}

        {opcoes.campo && (
          <input
            ref={campo}
            type="text"
            maxLength={120}
            value={valor}
            placeholder={opcoes.campo.exemplo}
            onChange={(evento) => setValor(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === "Enter") { evento.preventDefault(); aoConfirmar(); }
            }}
            className="alerta-campo"
          />
        )}

        {/* Sem botões no carregamento: um "Cancelar" que não cancela o
            pedido mente. */}
        {!travado && (
          <div className="alerta-botoes">
            {opcoes.cancelavel && (
              <button type="button" onClick={aoCancelar} className="alerta-botao secundario">
                {opcoes.cancelar ?? "Cancelar"}
              </button>
            )}
            <button
              ref={botao}
              type="button"
              onClick={aoConfirmar}
              className={`alerta-botao principal${opcoes.perigoso ? " perigoso" : ""}`}
            >
              {opcoes.confirmar ?? "Entendi"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* O TOAST                                                                    */
/* ------------------------------------------------------------------------- */

function Toast({ opcoes, fechando, aoFechar }: { opcoes: OpcoesDoAlerta; fechando: boolean; aoFechar: () => void }) {
  const tipo = opcoes.tipo ?? "info";
  const tempo = opcoes.tempo ?? 4000;
  return (
    <div role="status" data-tipo={tipo} className={`alerta-toast${fechando ? " fechando" : ""}`}>
      <span aria-hidden="true" className="alerta-toast-faixa" />
      <span aria-hidden="true" className="alerta-toast-sinal">
        {tipo === "carregando" ? (
          <svg viewBox="0 0 24 24" width={15} height={15}>
            <circle cx="12" cy="12" r="9" className="alerta-trilho" />
            <circle cx="12" cy="12" r="9" className="alerta-gira" strokeDasharray="14 43" />
          </svg>
        ) : SINAL_DO_TOAST[tipo]}
      </span>
      <div className="alerta-toast-corpo">
        {opcoes.titulo && <div className="alerta-toast-titulo">{opcoes.titulo}</div>}
        {opcoes.texto && <div className="alerta-toast-texto">{opcoes.texto}</div>}
      </div>
      <button type="button" aria-label="Fechar" onClick={aoFechar} className="alerta-toast-x">✕</button>
      {tempo > 0 && (
        <span aria-hidden="true" className="alerta-toast-tempo" style={{ animationDuration: `${tempo}ms` }} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* O PROVEDOR                                                                 */
/* ------------------------------------------------------------------------- */

type Abrir = (opcoes: OpcoesDoAlerta) => { id: number; resposta: Promise<RespostaDoAlerta> };
type Fechar = (id: number) => void;

// A ponte para o uso sem hook. Fica `null` até o provedor montar.
let abrirAgora: Abrir | null = null;
let fecharAgora: Fechar | null = null;

/** A animação de saída da caixa, em `alerta.css`. */
const SAIDA_MS = 200;

export function ProvedorDeAlerta({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState<OpcoesDoAlerta | null>(null);
  const [fechando, setFechando] = useState(false);
  const [valor, setValor] = useState("");
  const valorAtual = useRef("");
  valorAtual.current = valor;

  const responder = useRef<((r: RespostaDoAlerta) => void) | null>(null);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
    CADA ALERTA GANHA UM NÚMERO, e só mexe na tela quem ainda é o atual.

    Sem isso a sequência mais comum — fecha o "Salvando…", abre o "Salvo!" —
    dava errado de dois jeitos: a animação de saída do primeiro (200 ms)
    terminava depois de o segundo abrir e limpava a tela; e um `fechar()`
    atrasado derrubava um alerta que não era o dele.
  */
  const contador = useRef(0);
  const atual = useRef(0);

  const concluir = useCallback((id: number, confirmado: boolean) => {
    if (atual.current !== id) return;
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = null;
    const resolve = responder.current;
    responder.current = null;
    resolve?.({ confirmado, valor: valorAtual.current.trim() });
    setFechando(true);
    setTimeout(() => {
      if (atual.current !== id) return; // outro abriu no meio da saída
      setAberto(null);
      setFechando(false);
    }, SAIDA_MS);
  }, []);

  const abrir = useCallback<Abrir>((opcoes) => {
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = null;
    // O de baixo é respondido como dispensado, em vez de esquecido.
    responder.current?.({ confirmado: false, valor: "" });
    responder.current = null;

    const id = ++contador.current;
    atual.current = id;
    setValor(opcoes.campo?.valor ?? "");
    setFechando(false);
    setAberto(opcoes);

    const resposta = new Promise<RespostaDoAlerta>((resolve) => { responder.current = resolve; });

    const tempo = opcoes.toast ? (opcoes.tempo ?? 4000) : (opcoes.tempo ?? 0);
    if (tempo > 0) relogio.current = setTimeout(() => concluir(id, false), tempo);

    return { id, resposta };
  }, [concluir]);

  const fechar = useCallback<Fechar>((id) => concluir(id, false), [concluir]);

  useEffect(() => {
    abrirAgora = abrir;
    fecharAgora = fechar;
    return () => {
      if (abrirAgora === abrir) abrirAgora = null;
      if (fecharAgora === fechar) fecharAgora = null;
    };
  }, [abrir, fechar]);

  const id = atual.current;

  return (
    <>
      {children}
      {aberto && createPortal(
        aberto.toast ? (
          <Toast opcoes={aberto} fechando={fechando} aoFechar={() => concluir(id, false)} />
        ) : (
          <Caixa
            opcoes={aberto}
            fechando={fechando}
            valor={valor}
            setValor={setValor}
            aoConfirmar={() => concluir(id, true)}
            aoCancelar={() => concluir(id, false)}
          />
        ),
        document.body,
      )}
    </>
  );
}

/* ------------------------------------------------------------------------- */
/* O USO                                                                      */
/* ------------------------------------------------------------------------- */

/**
 * Abre um alerta e espera a resposta.
 *
 * Sem provedor montado, cai no `window.alert` em vez de sumir calado: um erro
 * que ninguém vê é pior do que um erro feio.
 */
function mostrar(opcoes: OpcoesDoAlerta): Promise<RespostaDoAlerta> {
  if (!abrirAgora) {
    const texto = [opcoes.titulo, typeof opcoes.texto === "string" ? opcoes.texto : ""].filter(Boolean).join("\n\n");
    if (opcoes.tipo === "carregando") return Promise.resolve({ confirmado: false, valor: "" });
    if (opcoes.cancelavel) return Promise.resolve({ confirmado: window.confirm(texto), valor: "" });
    window.alert(texto);
    return Promise.resolve({ confirmado: true, valor: "" });
  }
  return abrirAgora(opcoes).resposta;
}

/** A mensagem legível de qualquer coisa que tenha sido lançada. */
export function mensagemDoErro(erro: unknown, padrao = "Aconteceu um erro inesperado."): string {
  if (erro instanceof Error && erro.message) return erro.message;
  if (typeof erro === "string" && erro) return erro;
  return padrao;
}

export const alerta = {
  mostrar,

  sucesso: (titulo: string, texto?: ReactNode, o?: OpcoesDoAlerta) =>
    mostrar({ tipo: "sucesso", titulo, texto, ...o }),

  erro: (titulo: string, texto?: ReactNode, o?: OpcoesDoAlerta) =>
    mostrar({ tipo: "erro", titulo, texto, ...o }),

  aviso: (titulo: string, texto?: ReactNode, o?: OpcoesDoAlerta) =>
    mostrar({ tipo: "aviso", titulo, texto, ...o }),

  info: (titulo: string, texto?: ReactNode, o?: OpcoesDoAlerta) =>
    mostrar({ tipo: "info", titulo, texto, ...o }),

  /** Sim ou não. `true` só quando a pessoa confirmou. */
  confirmar: async (titulo: string, texto?: ReactNode, o?: OpcoesDoAlerta) =>
    (await mostrar({ tipo: "pergunta", titulo, texto, cancelavel: true, confirmar: "Confirmar", ...o })).confirmado,

  /** Pede um texto. `null` quando a pessoa desistiu ou deixou vazio. */
  perguntar: async (titulo: string, texto?: ReactNode, o?: OpcoesDoAlerta) => {
    const r = await mostrar({ tipo: "pergunta", titulo, texto, cancelavel: true, confirmar: "Confirmar", campo: {}, ...o });
    return r.confirmado && r.valor ? r.valor : null;
  },

  /** O aviso rápido do canto, que não interrompe ninguém. */
  toast: (tipo: TipoDeAlerta, titulo: string, texto?: ReactNode, o?: OpcoesDoAlerta) =>
    mostrar({ tipo, titulo, texto, toast: true, ...o }),

  /**
   * Mostra "estou trabalhando" e devolve quem o fecha. Prefira `durante`,
   * que fecha sozinho até quando a tarefa falha.
   */
  carregando: (titulo: string, texto?: ReactNode): (() => void) => {
    if (!abrirAgora) return () => {};
    const { id } = abrirAgora({ tipo: "carregando", titulo, texto });
    return () => fecharAgora?.(id);
  },

  /**
   * Roda a tarefa com o carregamento na tela e o tira ao terminar. O erro
   * sobe normalmente: quem chamou continua tratando a falha.
   */
  durante: async <T,>(titulo: string, tarefa: () => Promise<T>, texto?: ReactNode): Promise<T> => {
    const fechar = alerta.carregando(titulo, texto);
    try {
      return await tarefa();
    } finally {
      fechar();
    }
  },
};

/**
 * O `setErro` de uma tela, virando alerta.
 *
 * As telas guardavam o erro num estado e o pintavam numa faixa vermelha,
 * cada uma do seu jeito e num canto diferente. Com isto, o `setErro(texto)`
 * que já existe em cada `catch` abre o alerta de erro — e o `setErro(null)`
 * do começo de cada ação continua valendo, sem fazer nada.
 */
export function useErroEmAlerta(titulo: string) {
  return useCallback(
    (texto: string | null | undefined) => {
      if (texto) void alerta.erro(titulo, texto);
    },
    [titulo],
  );
}

/*
  A PONTE PARA O CÓDIGO SEM REACT.

  O editor de produção (`producao/controlador.js`) é JavaScript imperativo, e
  não importa módulos de tela. Ele acha o alerta aqui.
*/
declare global {
  interface Window {
    __alertaOptmize?: typeof alerta;
  }
}
window.__alertaOptmize = alerta;
