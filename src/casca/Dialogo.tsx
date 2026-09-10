/**
 * ===========================================================================
 * DIÁLOGO — avisar, perguntar sim/não e pedir um texto
 * ===========================================================================
 *
 * Substitui `alert`, `confirm` e `prompt` do navegador por uma caixa que
 * combina com o resto da tela. Três portas, todas assíncronas, então quem
 * chama escreve `await` e lê a resposta na linha seguinte:
 *
 *   `avisar(texto)`      avisa e espera o "Entendi";
 *   `confirmar(texto)`   pergunta sim/não e devolve `true`/`false`;
 *   `perguntar({...})`   pede um texto e devolve o que foi escrito, ou `null`.
 *
 * Existe um motivo além do visual, e ele é o mesmo de sempre neste projeto: as
 * caixas nativas TRAVAM A PÁGINA INTEIRA enquanto estão abertas, o que
 * atrapalha qualquer coisa rodando em segundo plano — e o Encaixe passa
 * minutos calculando.
 *
 * ---------------------------------------------------------------------------
 * ELE JÁ EXISTIA, EM `controlador.js`
 * ---------------------------------------------------------------------------
 *
 * Aquele é imperativo: escreve num `<div id="ui-dialog">` que mora na
 * `Estrutura`. Este é a mesma caixa em React, com o mesmo desenho (as classes
 * de `producao.css` são as mesmas, de propósito: as duas convivem enquanto a
 * migração acontece, e a pessoa não pode ver duas caixas diferentes conforme a
 * tela). Cada tela que sai do controlador passa a usar este; quando a última
 * sair, o de lá some junto com o arquivo.
 *
 * A promessa fica guardada num `ref`, e não em estado: resolvê-la é um efeito
 * colateral do clique, não algo que a tela desenha.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

interface Pergunta {
  titulo?: string;
  /** A linha acima do título, em versalete. */
  kicker?: string;
  texto?: string;
  /** O que vem escrito no campo quando ele abre. */
  valor?: string;
  exemplo?: string;
  confirmar?: string;
  cancelavel?: boolean;
}

interface Aviso {
  titulo?: string;
  kicker?: string;
  perigoso?: boolean;
}

interface Confirmacao extends Aviso {
  confirmar?: string;
}

export interface Dialogo {
  avisar(texto: string, opcoes?: Aviso): Promise<void>;
  confirmar(texto: string, opcoes?: Confirmacao): Promise<boolean>;
  perguntar(opcoes?: Pergunta): Promise<string | null>;
}

const Contexto = createContext<Dialogo | null>(null);

/**
 * Sem provedor isto estoura, e é o certo: uma tela que pergunta e recebe
 * `null` calado tomaria a resposta errada por resposta da pessoa — apagaria
 * sem confirmar, ou deixaria de apagar sem dizer por quê.
 */
export function useDialogo(): Dialogo {
  const dialogo = useContext(Contexto);
  if (!dialogo) throw new Error("Falta o <ProvedorDeDialogo> em volta desta tela.");
  return dialogo;
}

/** O que está aberto agora. `null` = nada. */
interface Aberto {
  titulo: string;
  kicker: string;
  texto: string;
  confirmar: string;
  cancelavel: boolean;
  perigoso: boolean;
  /** Quando tem campo, a resposta é o texto escrito. */
  campo: boolean;
  exemplo: string;
}

export function ProvedorDeDialogo({ children }: { children: ReactNode }) {
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const [valor, setValor] = useState("");
  const [fechando, setFechando] = useState(false);
  const responder = useRef<((resposta: boolean) => void) | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const confirmar = useRef<HTMLButtonElement>(null);
  const valorAtual = useRef("");
  valorAtual.current = valor;

  /*
   * A caixa sai com a animação de `producao.css` (a classe `closing`), e só
   * depois dela a promessa é resolvida. Os 140 ms são os mesmos de lá — a
   * caixa some antes de a tela por baixo mudar, senão a mudança acontece atrás
   * de uma caixa ainda visível.
   */
  const fechar = useCallback((resposta: boolean) => {
    setFechando(true);
    setTimeout(() => {
      setFechando(false);
      setAberto(null);
      document.body.classList.remove("dialog-open");
      responder.current?.(resposta);
      responder.current = null;
    }, 140);
  }, []);

  const abrir = useCallback((pedido: Aberto) => {
    // Uma caixa por vez: se já houver alguém esperando, ele recebe "não".
    responder.current?.(false);
    responder.current = null;
    setAberto(pedido);
    document.body.classList.add("dialog-open");
    return new Promise<boolean>((resolve) => { responder.current = resolve; });
  }, []);

  // O foco vai para o campo (quando tem) ou para o botão de confirmar: quem
  // abriu a caixa pelo teclado não pode ter de procurar onde ela caiu.
  useEffect(() => {
    if (!aberto) return;
    if (aberto.campo) campo.current?.select();
    else confirmar.current?.focus();
  }, [aberto]);

  // Esc fecha, mas só quando há um "Cancelar" — um aviso sem saída lateral não
  // pode ser dispensado sem alguém ter lido.
  useEffect(() => {
    if (!aberto || !aberto.cancelavel) return;
    const noEsc = (evento: KeyboardEvent) => { if (evento.key === "Escape") fechar(false); };
    window.addEventListener("keydown", noEsc);
    return () => window.removeEventListener("keydown", noEsc);
  }, [aberto, fechar]);

  const dialogo = useRef<Dialogo>({
    async avisar(texto, opcoes = {}) {
      await abrir({
        titulo: opcoes.titulo || "Atenção",
        kicker: opcoes.kicker || "AVISO DO SISTEMA",
        texto,
        confirmar: "Entendi",
        cancelavel: false,
        perigoso: !!opcoes.perigoso,
        campo: false,
        exemplo: "",
      });
    },
    confirmar(texto, opcoes = {}) {
      return abrir({
        titulo: opcoes.titulo || "Confirmar ação",
        kicker: opcoes.kicker || "CONFIRMAÇÃO",
        texto,
        confirmar: opcoes.confirmar || "Confirmar",
        cancelavel: true,
        // Perigoso por padrão: quem chama `confirmar` está prestes a fazer
        // algo que não tem volta. Quem não estiver diz `perigoso: false`.
        perigoso: opcoes.perigoso !== false,
        campo: false,
        exemplo: "",
      });
    },
    async perguntar(opcoes = {}) {
      setValor(opcoes.valor || "");
      const ok = await abrir({
        titulo: opcoes.titulo || "Digite",
        kicker: opcoes.kicker || "",
        texto: opcoes.texto || "",
        confirmar: opcoes.confirmar || "Confirmar",
        cancelavel: opcoes.cancelavel !== false,
        perigoso: false,
        campo: true,
        exemplo: opcoes.exemplo || "",
      });
      // O valor sai do `ref` e não do estado: a promessa é resolvida dentro do
      // `setTimeout` do fechamento, e ali o `valor` desta closure já é velho.
      const escrito = valorAtual.current.trim();
      return ok && escrito ? escrito : null;
    },
  });

  return (
    <Contexto.Provider value={dialogo.current}>
      {children}

      {aberto && (
        <div
          className={`ui-dialog-backdrop${fechando ? " closing" : ""}`}
          role="presentation"
          onClick={(evento) => {
            // Clicar fora fecha, pelo mesmo critério do Esc.
            if (evento.target === evento.currentTarget && aberto.cancelavel) fechar(false);
          }}
        >
          <section
            className={`ui-dialog${aberto.perigoso ? " danger-dialog" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialogo-titulo"
            aria-describedby="dialogo-texto"
          >
            <div className="ui-dialog-icon">{aberto.perigoso ? "!" : "✓"}</div>

            <div className="ui-dialog-content">
              {aberto.kicker && <span className="eyebrow">{aberto.kicker}</span>}
              <h2 id="dialogo-titulo">{aberto.titulo}</h2>
              <p id="dialogo-texto">{aberto.texto}</p>

              {aberto.campo && (
                <input
                  ref={campo}
                  type="text"
                  maxLength={120}
                  value={valor}
                  placeholder={aberto.exemplo}
                  onChange={(evento) => setValor(evento.target.value)}
                  // Enter no campo vale como clicar em confirmar.
                  onKeyDown={(evento) => {
                    if (evento.key === "Enter") { evento.preventDefault(); fechar(true); }
                  }}
                />
              )}
            </div>

            <div className="ui-dialog-actions">
              {aberto.cancelavel && (
                <button type="button" className="btn secondary" onClick={() => fechar(false)}>
                  Cancelar
                </button>
              )}
              <button
                ref={confirmar}
                type="button"
                className={`btn ${aberto.perigoso ? "danger" : "primary"}`}
                onClick={() => fechar(true)}
              >
                {aberto.confirmar}
              </button>
            </div>
          </section>
        </div>
      )}
    </Contexto.Provider>
  );
}
