/**
 * ===========================================================================
 * REPOSIÇÃO — os trabalhos exportados, para refazer peças
 * ===========================================================================
 *
 * Todo encaixe exportado fica guardado aqui, inteiro: o Encaixe guarda sozinho
 * logo depois de a exportação dar certo (`guardarParaReposicao`, em
 * producao/controlador.js). Quando uma peça sai errada, rasga ou desbota, é
 * aqui que o trabalho é aberto, as peças que faltam são marcadas — com quantas
 * de cada — e elas voltam ao Encaixe com a medida e o giro de antes.
 *
 *   ┌ busca ──────────┬──────────────────────────────────────────────┐
 *   │ HOJE            │  encaixe-camisas-5,32m        🗑             │
 *   │ ▣ camisas 5,32m │  160 cm · 5,32 m · 82% · 38 peças            │
 *   │ ▣ bandeira 2,1m │  [✓ frente ×2] [  costas  ] [✓ manga ×1] ... │
 *   │ ONTEM           │                                              │
 *   │ ▣ ...           │  3 peças · 4 unidades  [Levar para o Encaixe]│
 *   └─────────────────┴──────────────────────────────────────────────┘
 *
 * O visual é o da Galeria (a lateral e o fundo com aurora), porque é o mesmo
 * gesto: abrir o que está guardado e escolher.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Botao } from "../casca/Botao";
import { useDialogo } from "../casca/Dialogo";
import { Icone } from "../casca/Icone";
import { useLigacao } from "../producao/ligacao";
import { FundoDaGaleria } from "./galeria/Casca";

interface Trabalho {
  id: number;
  nome: string;
  larguraTecido: number | null;
  consumoCm: number | null;
  aproveitamento: number | null;
  folga: number | null;
  totalPecas: number;
  miniatura: string | null;
  criadoEm: string;
}

interface Peca {
  id: number;
  nome: string;
  largura: number;
  altura: number;
  qtd: number;
  giro: string | null;
  miniatura: string | null;
  pedido: string | null;
  sigla: string | null;
  url: string | null;
}

type TrabalhoAberto = Trabalho & { pecas: Peca[] };

async function pedir<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const resposta = await fetch(`/api/reposicao${caminho}`, {
    ...opcoes,
    headers: opcoes.body ? { "Content-Type": "application/json" } : undefined,
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error((dados as { error?: string }).error || "O servidor não respondeu.");
  return dados as T;
}

const metros = (cm: number | null) =>
  cm == null ? "—" : `${(cm / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
const cm = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** "Hoje", "Ontem" ou a data: o jeito de achar um trabalho de memória. */
function diaDe(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje.getTime() - 86_400_000);
  const mesmo = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mesmo(d, hoje)) return "Hoje";
  if (mesmo(d, ontem)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
}

export function Reposicao() {
  const ligacao = useLigacao();
  const dialogo = useDialogo();
  const [trabalhos, setTrabalhos] = useState<Trabalho[] | null>(null);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<TrabalhoAberto | null>(null);
  /** Peça marcada → quantas refazer. */
  const [escolhidas, setEscolhidas] = useState<Map<number, number>>(new Map());
  const [erro, setErro] = useState<string | null>(null);
  const [levando, setLevando] = useState(false);

  const carregar = useCallback(async (termo = "") => {
    try {
      const r = await pedir<{ trabalhos: Trabalho[] }>(`/trabalhos${termo ? `?q=${encodeURIComponent(termo)}` : ""}`);
      setTrabalhos(r.trabalhos);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  // A busca com folga de digitação, para não pedir a cada letra.
  useEffect(() => {
    const espera = setTimeout(() => void carregar(busca.trim()), 180);
    return () => clearTimeout(espera);
  }, [busca, carregar]);

  const abrir = async (id: number) => {
    try {
      setAberto(await pedir<TrabalhoAberto>(`/trabalhos/${id}`));
      setEscolhidas(new Map());
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  // Abre o mais recente sozinho: quem chega aqui quase sempre quer o último.
  useEffect(() => {
    if (!aberto && trabalhos && trabalhos.length > 0 && !busca) void abrir(trabalhos[0]!.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trabalhos]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, Trabalho[]>();
    for (const t of trabalhos ?? []) {
      const dia = diaDe(t.criadoEm);
      mapa.set(dia, [...(mapa.get(dia) ?? []), t]);
    }
    return [...mapa.entries()];
  }, [trabalhos]);

  const alternar = (peca: Peca) =>
    setEscolhidas((antes) => {
      const nova = new Map(antes);
      if (nova.has(peca.id)) nova.delete(peca.id);
      else nova.set(peca.id, 1);
      return nova;
    });

  const mudarQuantidade = (peca: Peca, qtd: number) =>
    setEscolhidas((antes) => new Map(antes).set(peca.id, Math.max(1, Math.min(9999, qtd))));

  const comArte = aberto?.pecas.filter((p) => p.url) ?? [];
  const todasMarcadas = comArte.length > 0 && comArte.every((p) => escolhidas.has(p.id));
  const unidades = [...escolhidas.values()].reduce((s, n) => s + n, 0);

  const levar = async () => {
    if (!aberto || !ligacao || escolhidas.size === 0) return;
    const pecas = aberto.pecas
      .filter((p) => escolhidas.has(p.id) && p.url)
      .map((p) => ({
        nome: p.nome,
        url: p.url!,
        largura: p.largura,
        altura: p.altura,
        quantidade: escolhidas.get(p.id)!,
        giro: p.giro,
        pedido: p.pedido ?? undefined,
        sigla: p.sigla ?? undefined,
      }));
    setLevando(true);
    // A troca de tela vem ANTES: o andamento do Encaixe mora naquela tela.
    ligacao.irPara("encaixe");
    try {
      await ligacao.mandarProjetoParaOEncaixe({
        nome: `Reposição · ${aberto.nome}`,
        unidades: 1,
        pecas,
        // O tecido e a folga de quando o trabalho saiu: a peça refeita tem de
        // sair igual à primeira.
        ajustes: {
          larguraTecido: aberto.larguraTecido,
          espaco: aberto.folga,
          comprimentoBancada: null,
          giro: "",
        },
      });
      setEscolhidas(new Map());
    } catch (e) {
      await dialogo.avisar(`Não deu para mandar as peças ao Encaixe: ${(e as Error).message}`, { perigoso: true });
    } finally {
      setLevando(false);
    }
  };

  const renomear = async () => {
    if (!aberto) return;
    const nome = (await dialogo.perguntar({ titulo: "Nome do trabalho", valor: aberto.nome, confirmar: "Salvar" }))?.trim();
    if (!nome || nome === aberto.nome) return;
    try {
      await pedir(`/trabalhos/${aberto.id}`, { method: "PATCH", body: JSON.stringify({ nome }) });
      setAberto({ ...aberto, nome });
      await carregar(busca.trim());
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  const apagar = async () => {
    if (!aberto) return;
    const certeza = await dialogo.confirmar(
      `"${aberto.nome}" e as artes guardadas dele saem da Reposição. Não dá para desfazer.`,
      { titulo: "Apagar trabalho", confirmar: "Apagar", perigoso: true },
    );
    if (!certeza) return;
    try {
      await pedir(`/trabalhos/${aberto.id}`, { method: "DELETE" });
      setAberto(null);
      await carregar(busca.trim());
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 overflow-hidden">
      {/* ------------------------------------------------ a lista, à esquerda */}
      <aside className="galeria-lateral flex w-80 shrink-0 flex-col overflow-hidden border-r border-linha">
        <div className="shrink-0 border-b border-linha p-4">
          <h1 className="m-0 flex items-center gap-2 font-titulo text-lg font-semibold text-tinta">
            <Icone referencia="icones.svg#rotate-ccw" className="size-5 text-ambar" />
            Reposição
          </h1>
          <p className="mt-1 mb-3 text-[12px] leading-relaxed text-tinta-apagada">
            Todo encaixe exportado fica guardado aqui. Abra, marque as peças que precisam sair de novo.
          </p>
          <label className="galeria-vidro flex h-10 items-center gap-2 rounded-full px-4 focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
            <Icone referencia="icones.svg#search" className="size-4 shrink-0 text-tinta-apagada" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Procurar trabalho"
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-tinta placeholder:text-tinta-apagada focus:outline-none"
            />
          </label>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {trabalhos === null ? (
            <p className="m-0 px-2 text-[12px] text-tinta-apagada">Carregando…</p>
          ) : trabalhos.length === 0 ? (
            <p className="m-0 px-2 text-[12px] leading-relaxed text-tinta-apagada">
              {busca ? `Nenhum trabalho com "${busca}".` : "Nenhum trabalho ainda. Exporte um encaixe e ele aparece aqui."}
            </p>
          ) : (
            grupos.map(([dia, lista]) => (
              <div key={dia} className="mb-3">
                <p className="mt-0 mb-1.5 px-2 text-[10px] font-bold tracking-widest text-tinta-apagada uppercase">{dia}</p>
                {lista.map((t) => {
                  const ativo = aberto?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => void abrir(t.id)}
                      className={[
                        "mb-1 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors",
                        ativo ? "bg-[var(--accent-soft)] shadow-[inset_0_0_0_1px_var(--accent-line)]" : "hover:bg-[var(--surface-hover)]",
                      ].join(" ")}
                    >
                      <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-linha bg-painel">
                        {t.miniatura
                          ? <img src={t.miniatura} alt="" className="size-full object-cover" />
                          : <Icone referencia="icones.svg#blocks" className="size-5 text-tinta-apagada" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[13px] ${ativo ? "font-semibold text-ambar" : "text-tinta"}`}>{t.nome}</span>
                        <span className="block truncate font-mono text-[11px] text-tinta-apagada">
                          {metros(t.consumoCm)} · {t.totalPecas} peça{t.totalPecas === 1 ? "" : "s"} ·{" "}
                          {new Date(t.criadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </nav>
      </aside>

      {/* ------------------------------------------------ o trabalho aberto */}
      <FundoDaGaleria className="relative overflow-hidden">
        {erro && (
          <p className="m-4 mb-0 flex items-center gap-2 text-[13px] text-[var(--danger)]">
            <Icone referencia="icones.svg#triangle-alert" className="size-4" />
            {erro}
          </p>
        )}

        {!aberto ? (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div className="max-w-sm">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-linha bg-painel text-tinta-apagada">
                <Icone referencia="icones.svg#rotate-ccw" className="size-6" />
              </span>
              <p className="mt-4 mb-0 font-titulo text-base font-semibold text-tinta">Escolha um trabalho</p>
              <p className="mt-1 mb-0 text-sm leading-relaxed text-tinta-fraca">
                Cada encaixe que você exporta entra na lista ao lado, com todas as peças. Quando uma
                sair errada, abra o trabalho e marque o que precisa refazer.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* O cabeçalho do trabalho. */}
            <div className="flex shrink-0 flex-wrap items-start gap-4 px-6 pt-6 pb-4">
              {aberto.miniatura && (
                <img src={aberto.miniatura} alt="O risco do trabalho" className="h-20 max-w-[220px] rounded-lg border border-linha object-contain bg-painel" />
              )}
              <div className="min-w-0 flex-1">
                <button type="button" onClick={() => void renomear()} title="Clique para renomear" className="group flex max-w-full items-center gap-1.5 text-left">
                  <h2 className="m-0 truncate font-titulo text-xl font-semibold text-tinta">{aberto.nome}</h2>
                  <Icone referencia="icones.svg#pencil" className="size-3.5 shrink-0 text-tinta-apagada opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
                <p className="mt-1 mb-0 font-mono text-[12px] text-tinta-apagada">
                  {aberto.larguraTecido ? `${cm(aberto.larguraTecido)} cm de tecido · ` : ""}
                  {metros(aberto.consumoCm)}
                  {aberto.aproveitamento != null ? ` · ${aberto.aproveitamento.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% de aproveitamento` : ""}
                  {` · ${aberto.totalPecas} peça${aberto.totalPecas === 1 ? "" : "s"}`}
                </p>
                <p className="mt-0.5 mb-0 text-[12px] text-tinta-apagada">
                  Exportado {new Date(aberto.criadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <Botao
                tamanho="pequeno"
                jeito="perigo"
                onClick={() => void apagar()}
                title="Apagar este trabalho"
                aria-label="Apagar este trabalho"
                className="w-8 px-0"
                icone={<Icone referencia="icones.svg#trash-2" className="size-4" />}
              />
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 px-6 pb-3">
              <p className="m-0 text-[10px] font-bold tracking-widest text-tinta-apagada uppercase">
                Peças do trabalho · marque as que vão sair de novo
              </p>
              <button
                type="button"
                onClick={() => setEscolhidas(todasMarcadas ? new Map() : new Map(comArte.map((p) => [p.id, escolhidas.get(p.id) ?? 1])))}
                className="text-[12px] font-semibold text-tinta-fraca hover:text-ambar"
              >
                {todasMarcadas ? "Desmarcar todas" : "Marcar todas"}
              </button>
            </div>

            {/* As peças. */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-28">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
                {aberto.pecas.map((p, i) => {
                  const marcada = escolhidas.has(p.id);
                  const semArte = !p.url;
                  return (
                    <div
                      key={p.id}
                      style={{ "--ordem": i } as React.CSSProperties}
                      className={[
                        "galeria-cartao galeria-entra flex flex-col overflow-hidden rounded-2xl",
                        marcada ? "!border-[var(--accent)] shadow-[0_0_0_3px_var(--accent-soft)]" : "",
                        semArte ? "opacity-50" : "",
                      ].join(" ")}
                    >
                      <button
                        type="button"
                        disabled={semArte}
                        onClick={() => alternar(p)}
                        className="relative grid aspect-[4/3] place-items-center bg-[repeating-conic-gradient(var(--surface-hover)_0_25%,transparent_0_50%)] bg-[length:16px_16px] p-3 disabled:cursor-not-allowed"
                        title={semArte ? "A arte desta peça não foi guardada" : marcada ? "Desmarcar" : "Marcar para refazer"}
                      >
                        {p.miniatura || p.url
                          ? <img src={p.miniatura || p.url!} alt={p.nome} className="max-h-full max-w-full object-contain" />
                          : <Icone referencia="icones.svg#image" className="size-8 text-tinta-apagada" />}
                        <span
                          className={[
                            "absolute top-2 left-2 grid size-6 place-items-center rounded-md border transition-colors",
                            marcada ? "border-[var(--accent)] bg-ambar text-ambar-tinta" : "border-linha bg-painel/80 text-transparent",
                          ].join(" ")}
                        >
                          <Icone referencia="icones.svg#check" className="size-4" />
                        </span>
                      </button>
                      <div className="flex flex-col gap-1.5 p-3">
                        <p className="m-0 truncate text-[13px] font-medium text-tinta" title={p.nome}>{p.nome}</p>
                        <p className="m-0 font-mono text-[11px] text-tinta-apagada">
                          {cm(p.largura)} × {cm(p.altura)} cm · no trabalho: {p.qtd}
                        </p>
                        {marcada && (
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <span className="text-[11px] text-tinta-fraca">Refazer</span>
                            <div className="flex items-center rounded-lg border border-linha">
                              <button type="button" onClick={() => mudarQuantidade(p, escolhidas.get(p.id)! - 1)} className="grid size-7 place-items-center text-tinta-fraca hover:text-ambar" aria-label="Menos">−</button>
                              <input
                                type="number"
                                min={1}
                                value={escolhidas.get(p.id)}
                                onChange={(e) => mudarQuantidade(p, Math.floor(Number(e.target.value) || 1))}
                                className="h-7 w-12 bg-transparent text-center font-mono text-[12px] text-tinta focus:outline-none"
                                aria-label={`Quantas de ${p.nome}`}
                              />
                              <button type="button" onClick={() => mudarQuantidade(p, escolhidas.get(p.id)! + 1)} className="grid size-7 place-items-center text-tinta-fraca hover:text-ambar" aria-label="Mais">+</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* A barra de baixo: o que foi marcado e o botão que conclui. */}
            <div className="galeria-vidro absolute inset-x-4 bottom-4 flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
              <span className="text-[13px] text-tinta-fraca">
                {escolhidas.size === 0
                  ? "Nenhuma peça marcada"
                  : `${escolhidas.size} peça${escolhidas.size === 1 ? "" : "s"} · ${unidades} unidade${unidades === 1 ? "" : "s"} para refazer`}
              </span>
              <Botao
                jeito="primario"
                disabled={escolhidas.size === 0 || levando || !ligacao}
                onClick={() => void levar()}
                icone={<Icone referencia="icones.svg#blocks" className="size-4" />}
              >
                {levando ? "Levando…" : "Levar para o Encaixe"}
              </Botao>
            </div>
          </>
        )}
      </FundoDaGaleria>
    </div>
  );
}
