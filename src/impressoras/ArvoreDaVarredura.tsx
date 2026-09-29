/**
 * ===========================================================================
 * A VARREDURA EM ÁRVORE — o que foi olhado, onde, e o que saiu de cada lugar
 * ===========================================================================
 *
 * O painel da varredura diz QUANTO (endereços, quem respondeu, impressoras). A
 * árvore diz ONDE: este computador e cada disco, a rede e cada IP que
 * respondeu, os compartilhamentos de cada um e cada pasta testada — com o que
 * deu em cada uma. É a tela de quem quer entender por que uma impressora não
 * apareceu ("o PC respondeu? que compartilhamentos ele tem? olharam a pasta
 * certa?").
 *
 * Os nós vêm prontos do servidor, na ordem em que apareceram (ver "A TRILHA",
 * em servidor/impressoras/services/discovery.js). Aqui só se monta a árvore e
 * se desenha, no jeito do comando `tree`: ├─ └─ │.
 *
 * TUDO COMEÇA ABERTO: a árvore é para ver cada pasta percorrida, então nada
 * fica escondido. A seta de cada nó fecha o galho, se ele atrapalhar.
 *
 * COM `revelar`, ELA APARECE NO RITMO DE UMA VARREDURA: linha por linha, na
 * ordem em que o servidor percorreu, mesmo quando ele terminou num piscar. O
 * que chegou de uma vez não pareceria procura nenhuma — e é justamente essa a
 * tela que mostra a procura. O ritmo se ajusta ao tamanho: a árvore inteira
 * leva de 4 a 12 segundos, nunca mais que isso, e a linha "sendo olhada"
 * fica em destaque, com a lista acompanhando o fim.
 */

import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Icone } from "../casca/Icone";
import type { EstadoDaVarredura, NoDaVarredura } from "./tipos";

const COR: Record<NoDaVarredura["estado"], string> = {
  ok: "text-[var(--success)]",
  nada: "text-tinta-apagada",
  erro: "text-[var(--danger)]",
  info: "text-tinta-fraca",
  andando: "text-ambar",
  pasta: "text-tinta-fraca",
};

function Marca({ estado }: { estado: NoDaVarredura["estado"] }) {
  if (estado === "andando") return <Icone referencia="icones.svg#loader-circle" className="size-3.5 shrink-0 animate-spin text-ambar" />;
  if (estado === "pasta") return <Icone referencia="icones.svg#folder" className="size-3.5 shrink-0 text-tinta-apagada" />;
  const simbolo = { ok: "✓", nada: "·", erro: "✕", info: "i" }[estado];
  return <span className={`inline-block w-3.5 shrink-0 text-center font-bold ${COR[estado]}`}>{simbolo}</span>;
}

/** A árvore inteira se revela em pelo menos 4 s e no máximo 12 s. */
const REVELAR_MIN_MS = 4000;
const REVELAR_MAX_MS = 12000;
const TIQUE_MS = 30;

export function ArvoreDaVarredura({ estado, className = "", revelar = false, aoTerminarDeRevelar }: {
  estado: EstadoDaVarredura | null;
  className?: string;
  /** Mostra linha por linha, como varredura (ver o cabeçalho). */
  revelar?: boolean;
  /** Chamado quando a última linha apareceu e o servidor já terminou. */
  aoTerminarDeRevelar?: () => void;
}) {
  const todos = estado?.arvore ?? [];
  const rodando = Boolean(estado?.running);
  // Os galhos fechados à mão. O resto está aberto.
  const [fechados, setFechados] = useState<ReadonlySet<string>>(new Set());

  // Quantos nós já apareceram. Sem `revelar`, todos, sempre.
  const [revelados, setRevelados] = useState(0);
  const total = todos.length;
  const mostrados = revelar ? Math.min(revelados, total) : total;
  const revelando = revelar && mostrados < total;

  useEffect(() => {
    if (!revelar || revelados >= total) return;
    // Quantos por tique para caber no tempo: rede grande anda mais depressa.
    const duracao = Math.min(REVELAR_MAX_MS, Math.max(REVELAR_MIN_MS, total * 25));
    const porTique = Math.max(1, Math.ceil(total / (duracao / TIQUE_MS)));
    const relogio = window.setTimeout(() => setRevelados((r) => Math.min(total, r + porTique)), TIQUE_MS);
    return () => window.clearTimeout(relogio);
  }, [revelar, revelados, total]);

  const avisou = useRef(false);
  useEffect(() => {
    if (!revelar || avisou.current || rodando || total === 0 || mostrados < total) return;
    avisou.current = true;
    aoTerminarDeRevelar?.();
  }, [revelar, rodando, total, mostrados, aoTerminarDeRevelar]);

  const nos = useMemo(() => todos.slice(0, mostrados), [todos, mostrados]);
  const atual = revelando ? nos[nos.length - 1]?.id : null;

  /*
   * A LISTA ACOMPANHA A LINHA SENDO OLHADA — e não o fim da lista.
   *
   * Numa árvore a linha nova nem sempre cai embaixo: quando a procura volta
   * para uma pasta de cima (sai de Program Files e entra em Users), o nó novo
   * nasce no MEIO. Seguir o fim deixava a linha em destaque fora da vista, e
   * a lista "parava de acompanhar". Então segue a linha, e a mantém no meio
   * da caixa.
   *
   * Mexer na rolagem pausa o acompanhamento por uns segundos: quem subiu para
   * ler alguma coisa não é arrastado de volta no meio da leitura.
   */
  const caixa = useRef<HTMLDivElement>(null);
  const mexeuEm = useRef(0);
  const marcarMexida = () => { mexeuEm.current = Date.now(); };
  useEffect(() => {
    const el = caixa.current;
    if (!el || !revelando || !atual) return;
    if (Date.now() - mexeuEm.current < 3000) return;
    const linha = el.querySelector<HTMLElement>(`[data-no="${CSS.escape(atual)}"]`);
    if (!linha) return;
    const alvo = linha.offsetTop - el.clientHeight / 2 + linha.offsetHeight / 2;
    el.scrollTop = Math.max(0, alvo);
  }, [mostrados, revelando, atual]);

  const filhos = useMemo(() => {
    const mapa = new Map<string | null, NoDaVarredura[]>();
    for (const no of nos) {
      const lista = mapa.get(no.pai) ?? [];
      lista.push(no);
      mapa.set(no.pai, lista);
    }
    return mapa;
  }, [nos]);

  if (nos.length === 0 && !revelar) {
    return (
      <p className={`m-0 font-mono text-[12px] text-tinta-apagada ${className}`}>
        {rodando ? "Começando…" : "Nenhuma varredura ainda. Clique em Procurar na rede."}
      </p>
    );
  }

  const temFilhos = (id: string) => (filhos.get(id)?.length ?? 0) > 0;
  const aberto = (no: NoDaVarredura) => !fechados.has(no.id);
  const alternar = (id: string) =>
    setFechados((antes) => {
      const novo = new Set(antes);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  function ramo(pai: string | null, prefixo: string): ReactElement[] {
    const lista = filhos.get(pai) ?? [];
    return lista.flatMap((no, indice) => {
      const ultimo = indice === lista.length - 1;
      const galho = pai === null ? "" : ultimo ? "└─ " : "├─ ";
      const podeAbrir = temFilhos(no.id);
      const estaAberto = podeAbrir && aberto(no);
      const linha = (
        <div
          key={no.id}
          data-no={no.id}
          className={[
            "flex min-w-0 items-center gap-1.5 whitespace-pre rounded-[4px] py-[1px]",
            no.id === atual ? "bg-[var(--accent-soft)] text-ambar-claro" : "",
          ].join(" ")}
        >
          <span className="text-tinta-apagada/60">{prefixo}{galho}</span>
          {podeAbrir ? (
            <button
              type="button"
              onClick={() => alternar(no.id)}
              className="grid size-4 shrink-0 place-items-center rounded text-tinta-apagada hover:bg-[var(--surface-hover)] hover:text-tinta"
              aria-label={estaAberto ? "Fechar" : "Abrir"}
            >
              <Icone referencia="icones.svg#chevron-right" className={`size-3 transition-transform ${estaAberto ? "rotate-90" : ""}`} />
            </button>
          ) : (
            <span className="inline-block size-4 shrink-0" />
          )}
          <Marca estado={no.estado} />
          <span className={`min-w-0 truncate ${no.pai === null ? "font-semibold text-tinta" : no.estado === "nada" ? "text-tinta-apagada" : "text-tinta-fraca"}`} title={no.rotulo}>
            {no.rotulo}
          </span>
          {no.detalhe && <span className={`shrink-0 ${COR[no.estado]} opacity-90`}>— {no.detalhe}</span>}
          {podeAbrir && !estaAberto && (
            <span className="shrink-0 text-tinta-apagada">({filhos.get(no.id)!.length})</span>
          )}
        </div>
      );
      if (!estaAberto) return [linha];
      const prefixoDosFilhos = pai === null ? "" : prefixo + (ultimo ? "   " : "│  ");
      return [linha, ...ramo(no.id, prefixoDosFilhos)];
    });
  }

  const contagem = {
    ok: nos.filter((n) => n.estado === "ok").length,
    erro: nos.filter((n) => n.estado === "erro").length,
    pastas: nos.filter((n) => n.estado === "pasta").length,
  };

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-tinta-apagada">
        <span>
          {(rodando || revelando) && <span className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-ambar align-middle" />}
          {contagem.pastas} pasta(s) percorrida(s) · {nos.length} passo(s) ·{" "}
          <span className="text-[var(--success)]">{contagem.ok} ok</span>
          {contagem.erro > 0 && <> · <span className="text-[var(--danger)]">{contagem.erro} erro(s)</span></>}
        </span>
        {fechados.size > 0 && (
          <button type="button" onClick={() => setFechados(new Set())} className="hover:text-ambar">
            abrir tudo
          </button>
        )}
      </div>
      <div
        ref={caixa}
        onWheel={marcarMexida}
        onPointerDown={marcarMexida}
        onTouchMove={marcarMexida}
        onKeyDown={marcarMexida}
        className={`relative ${revelar ? "h-[62vh]" : "max-h-[70vh]"} overflow-auto rounded-[10px] border border-linha bg-[var(--bg)] px-3 py-2.5 font-mono text-[12px] leading-[1.55]`}
      >
        {ramo(null, "")}
        {/* O cursor da procura, enquanto ainda há o que mostrar. */}
        {(revelando || rodando) && (
          <div className="flex items-center gap-2 py-[1px] text-ambar">
            <span className="inline-block h-3.5 w-2 animate-pulse bg-ambar" />
            <span className="text-tinta-apagada">{nos.length === 0 ? "iniciando a varredura…" : "varrendo…"}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A JANELA — a árvore por cima da tela de Impressoras.
 *
 * Mais larga que o `Modal` da casca (que é para uma pergunta de duas linhas):
 * caminho de rede é comprido, e cortado ele não serve para conferir nada.
 */
export function JanelaDaVarredura({ estado, aoFechar, aoParar }: {
  estado: EstadoDaVarredura | null;
  aoFechar: () => void;
  aoParar?: () => void;
}) {
  const rodando = Boolean(estado?.running);
  return (
    <div onClick={aoFechar} className="fixed inset-0 z-90 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animar-entrada">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="A varredura em árvore"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-linha bg-painel-suave p-5 shadow-2xl shadow-black/60"
      >
        <div className="mb-3 flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-ambar">
            <Icone referencia="icones.svg#radar" className={`size-5 ${rodando ? "animate-pulse" : ""}`} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="m-0 font-titulo text-base font-semibold text-tinta">
              {rodando ? "Varrendo a rede" : "A última varredura"}
            </h2>
            <p className="m-0 mt-0.5 truncate text-[12px] text-tinta-fraca">{estado?.error || estado?.message}</p>
          </div>
          {rodando && aoParar && (
            <button type="button" onClick={aoParar} className="rounded-[9px] border border-linha px-3 py-1.5 text-[12px] font-semibold text-tinta-fraca hover:text-tinta">
              Parar
            </button>
          )}
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="grid size-7 shrink-0 place-items-center rounded-lg text-tinta-apagada hover:bg-[var(--surface-hover)] hover:text-tinta">
            <Icone referencia="icones.svg#x" className="size-4" />
          </button>
        </div>
        <ArvoreDaVarredura estado={estado} className="min-h-0" />
      </div>
    </div>
  );
}
