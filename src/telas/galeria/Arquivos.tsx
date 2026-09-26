/**
 * ===========================================================================
 * GALERIA · MEUS ARQUIVOS — o drive da fábrica
 * ===========================================================================
 *
 * A metade da Galeria que guarda o que não vai ao encaixe: pastas dentro de
 * pastas, e nelas imagens e PDFs — o fardamento, a foto da peça pronta, o
 * PDF do pedido. Só isso: o resto é deixado de fora já na tela, e o servidor
 * confere de novo pelos bytes (ver `aceito`).
 *
 * O jeito é o de um drive, de propósito, porque é o que todo mundo já sabe
 * usar sem aprender:
 *
 *   - a busca no topo procura em TODAS as pastas, e diz onde cada achado mora;
 *   - na raiz, "Acesso rápido" mostra o que foi guardado por último;
 *   - grade ou lista, lembrado entre uma visita e outra;
 *   - soltar arquivos (ou uma pasta inteira do computador) no miolo ou numa
 *     pasta da árvore envia; arrastar um item até uma pasta o muda de lugar;
 *   - imagem e PDF abrem por cima da tela (o TIFF, que o navegador não
 *     desenha, baixa).
 *
 * A moldura (lateral, armazenamento, o fundo com aurora) é da
 * `Casca.tsx`, a mesma da metade dos Projetos.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { useDialogo } from "../../casca/Dialogo";
import { Icone } from "../../casca/Icone";
import {
  galeriaApi, type ArquivoDaGaleria, type ComOnde, type ConteudoDaPasta, type PastaDaGaleria,
} from "../../api/galeria";
import { FundoDaGaleria, LateralDaGaleria, tamanhoLegivel, type NavegacaoDaGaleria } from "./Casca";

/** O tipo que marca um arraste de dentro da própria tela (e não do Windows). */
const ARRASTE_INTERNO = "application/x-optmize-galeria";
const CHAVE_DO_JEITO = "optmize.galeria.jeito";

/** O que a Galeria guarda. O servidor confere de novo, pelo conteúdo. */
const EXTENSOES_ACEITAS = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff", "pdf"];
const ACEITA_NO_SELETOR = "image/png,image/jpeg,image/webp,image/gif,image/bmp,image/tiff,application/pdf,.tif,.tiff,.pdf";

/** Pelo nome ou pelo tipo que o navegador deu: a primeira peneira. */
function aceito(arquivo: File) {
  return EXTENSOES_ACEITAS.includes(extensao(arquivo.name))
    || arquivo.type.startsWith("image/") && arquivo.type !== "image/svg+xml"
    || arquivo.type === "application/pdf";
}

type Arrastado = { tipo: "arquivo" | "pasta"; id: number };
type Jeito = "grade" | "lista";

/** Um arquivo a subir e a pasta onde ele mora, relativa ao destino. */
interface ParaEnviar {
  arquivo: File;
  caminho: string[];
}

interface Envio {
  feitos: number;
  total: number;
  nome: string;
  fracao: number;
}

interface Achados {
  pastas: ComOnde<PastaDaGaleria>[];
  arquivos: ComOnde<ArquivoDaGaleria>[];
}

export function ArquivosDaGaleria({ nav }: { nav: NavegacaoDaGaleria }) {
  const dialogo = useDialogo();
  const [pastas, setPastas] = useState<PastaDaGaleria[]>([]);
  const [aberta, setAberta] = useState<number | null>(null);
  const [conteudo, setConteudo] = useState<ConteudoDaPasta | null>(null);
  const [expandidas, setExpandidas] = useState<ReadonlySet<number>>(new Set());
  const [erro, setErro] = useState("");
  const [envio, setEnvio] = useState<Envio | null>(null);
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<Achados | null>(null);
  const [vendo, setVendo] = useState<ArquivoDaGaleria | null>(null);
  const [jeito, setJeito] = useState<Jeito>(() => {
    try { return localStorage.getItem(CHAVE_DO_JEITO) === "lista" ? "lista" : "grade"; } catch { return "grade"; }
  });
  /** Onde o arraste está por cima agora: `raiz`, `p12` (árvore), `c12` (cartão) ou `miolo`. */
  const [alvo, setAlvo] = useState<string | null>(null);
  const ultimaLeitura = useRef(0);
  const entradaDeArquivos = useRef<HTMLInputElement>(null);
  const entradaDePasta = useRef<HTMLInputElement>(null);
  const { atualizarResumo, resumo } = nav;

  const falhou = (e: unknown) => setErro(e instanceof Error ? e.message : String(e));

  const lerArvore = useCallback(async () => {
    setPastas((await galeriaApi.pastas()).pastas);
  }, []);

  const lerPasta = useCallback(async (id: number | null) => {
    const leitura = ++ultimaLeitura.current;
    const novo = await galeriaApi.conteudo(id);
    if (leitura === ultimaLeitura.current) setConteudo(novo);
  }, []);

  /** Relê a árvore, a pasta aberta e o resumo: é o que toda ação faz no fim. */
  const recarregar = useCallback(async (id: number | null = aberta) => {
    try {
      await Promise.all([lerArvore(), lerPasta(id)]);
      setErro("");
    } catch (e) {
      falhou(e);
    }
    atualizarResumo();
  }, [aberta, lerArvore, lerPasta, atualizarResumo]);

  // Só na chegada: depois, quem relê é cada ação, com a pasta que ela mexeu.
  useEffect(() => { void recarregar(null); }, []);

  // A busca procura em tudo, com uma folga de digitação para não pedir a
  // cada letra.
  const termo = busca.trim();
  useEffect(() => {
    if (!termo) { setAchados(null); return; }
    let valendo = true;
    const espera = setTimeout(() => {
      galeriaApi.busca(termo).then((r) => { if (valendo) setAchados(r); }).catch(falhou);
    }, 180);
    return () => { valendo = false; clearTimeout(espera); };
  }, [termo, conteudo]);

  const trocarJeito = (novo: Jeito) => {
    setJeito(novo);
    try { localStorage.setItem(CHAVE_DO_JEITO, novo); } catch { /* fica só nesta visita */ }
  };

  /** Abrir uma pasta também abre, na árvore, o caminho até ela. */
  const abrir = async (id: number | null) => {
    setAberta(id);
    setBusca("");
    if (id !== null) {
      setExpandidas((antes) => {
        const proximo = new Set(antes);
        let atual = pastas.find((p) => p.id === id);
        while (atual) {
          proximo.add(atual.id);
          const pai = atual.paiId;
          atual = pai === null ? undefined : pastas.find((p) => p.id === pai);
        }
        return proximo;
      });
    }
    try {
      await lerPasta(id);
      setErro("");
    } catch (e) {
      falhou(e);
    }
  };

  const alternar = (id: number) =>
    setExpandidas((antes) => {
      const proximo = new Set(antes);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });

  // ------------------------------------------------------------ as pastas

  const novaPasta = async (paiId: number | null = aberta) => {
    const nome = await dialogo.perguntar({
      titulo: "Nova pasta",
      kicker: "MEUS ARQUIVOS",
      texto: "O nome da pasta, do jeito que você procuraria por ela.",
      exemplo: "Fardamento Padaria Sol",
      confirmar: "Criar",
    });
    if (!nome) return;
    try {
      await galeriaApi.criarPasta(nome, paiId);
      if (paiId !== null) setExpandidas((antes) => new Set(antes).add(paiId));
      await recarregar();
    } catch (e) {
      falhou(e);
    }
  };

  const renomearPasta = async (pasta: { id: number; nome: string }) => {
    const nome = await dialogo.perguntar({
      titulo: "Renomear pasta", kicker: "MEUS ARQUIVOS", valor: pasta.nome, confirmar: "Salvar",
    });
    if (!nome || nome === pasta.nome) return;
    try {
      await galeriaApi.mexerNaPasta(pasta.id, { nome });
      await recarregar();
    } catch (e) {
      falhou(e);
    }
  };

  const apagarPasta = async (pasta: { id: number; nome: string }) => {
    const certeza = await dialogo.confirmar(
      `Apagar "${pasta.nome}" apaga tudo o que está dentro dela — pastas e arquivos. Não tem volta.`,
      { titulo: "Excluir pasta", confirmar: "Excluir" },
    );
    if (!certeza) return;
    try {
      await galeriaApi.apagarPasta(pasta.id);
      // Se a pasta aberta estava dentro da que saiu, volta para a de cima.
      const dentro = conteudo?.caminho.some((c) => c.id === pasta.id);
      const destino = dentro ? (pastas.find((p) => p.id === pasta.id)?.paiId ?? null) : aberta;
      if (dentro) setAberta(destino);
      await recarregar(destino);
    } catch (e) {
      falhou(e);
    }
  };

  // ------------------------------------------------------------ os arquivos

  const renomearArquivo = async (arquivo: ArquivoDaGaleria) => {
    const nome = await dialogo.perguntar({
      titulo: "Renomear arquivo", kicker: "MEUS ARQUIVOS", valor: arquivo.nome, confirmar: "Salvar",
    });
    if (!nome || nome === arquivo.nome) return;
    try {
      await galeriaApi.mexerNoArquivo(arquivo.id, { nome });
      await recarregar();
    } catch (e) {
      falhou(e);
    }
  };

  const apagarArquivo = async (arquivo: ArquivoDaGaleria) => {
    const certeza = await dialogo.confirmar(`Apagar "${arquivo.nome}"? Não tem volta.`, {
      titulo: "Excluir arquivo", confirmar: "Excluir",
    });
    if (!certeza) return;
    try {
      await galeriaApi.apagarArquivo(arquivo.id);
      if (vendo?.id === arquivo.id) setVendo(null);
      await recarregar();
    } catch (e) {
      falhou(e);
    }
  };

  /** Abrir um arquivo: o que dá para ver na tela abre aqui, o resto baixa. */
  const abrirArquivo = (arquivo: ArquivoDaGaleria) => {
    if (comoMostrar(arquivo)) setVendo(arquivo);
    else baixar(arquivo);
  };

  /**
   * Sobe a lista para dentro de `destino`, recriando as pastas que vieram
   * junto (quem solta uma pasta do computador quer a mesma árvore aqui).
   */
  const enviar = async (tudo: ParaEnviar[], destino: number | null) => {
    if (tudo.length === 0 || envio) return;
    const lista = tudo.filter(({ arquivo }) => aceito(arquivo));
    const deFora = tudo.length - lista.length;
    if (lista.length === 0) {
      setErro("A Galeria guarda só imagens (PNG, JPG, WEBP, GIF, BMP, TIFF) e PDF — nada do que foi solto era isso.");
      return;
    }
    const criadas = new Map<string, number | null>([["", destino]]);

    /** A pasta de um caminho, criada na primeira vez que ele aparece. */
    const pastaDe = async (caminho: string[]): Promise<number | null> => {
      const chave = caminho.join("/");
      if (criadas.has(chave)) return criadas.get(chave)!;
      const pai = await pastaDe(caminho.slice(0, -1));
      const { id } = await galeriaApi.criarPasta(caminho[caminho.length - 1] ?? "pasta", pai);
      criadas.set(chave, id);
      return id;
    };

    let feitos = 0;
    const falhas: string[] = [];
    for (const { arquivo, caminho } of lista) {
      setEnvio({ feitos, total: lista.length, nome: arquivo.name, fracao: 0 });
      try {
        const pasta = await pastaDe(caminho);
        const salvo = await galeriaApi.enviar(arquivo, pasta, (fracao) =>
          setEnvio({ feitos, total: lista.length, nome: arquivo.name, fracao }));
        // A prévia é feita aqui, com o arquivo ainda na memória, e guardada:
        // a grade nunca precisa abrir a imagem inteira de novo.
        const miniatura = await miniaturaDoArquivo(arquivo);
        if (miniatura) await galeriaApi.mexerNoArquivo(salvo.id, { miniatura }).catch(() => {});
      } catch (e) {
        falhas.push(`"${arquivo.name}": ${e instanceof Error ? e.message : String(e)}`);
      }
      feitos++;
    }

    setEnvio(null);
    if (destino !== null) setExpandidas((antes) => new Set(antes).add(destino));
    await recarregar();
    const avisos: string[] = [];
    if (deFora > 0) avisos.push(`${deFora} arquivo(s) ficaram de fora por não serem imagem nem PDF.`);
    if (falhas.length > 0) {
      avisos.push(`${falhas.length} de ${lista.length} não subiram. ${falhas.slice(0, 3).join(" · ")}`);
    }
    if (avisos.length > 0) setErro(avisos.join(" "));
  };

  /** Muda um arquivo ou uma pasta de lugar (arrastado de dentro da tela). */
  const mover = async (item: Arrastado, destino: number | null) => {
    try {
      if (item.tipo === "arquivo") await galeriaApi.mexerNoArquivo(item.id, { pastaId: destino });
      else {
        if (item.id === destino) return;
        await galeriaApi.mexerNaPasta(item.id, { paiId: destino });
      }
      await recarregar();
    } catch (e) {
      falhou(e);
    }
  };

  // ------------------------------------------------------------ o arraste

  /**
   * As três coisas que um alvo de soltura faz: acender, apagar e receber.
   * Vale para a raiz e as pastas da árvore, os cartões de pasta e o miolo.
   */
  const alvoDeSoltura = (chave: string, destino: number | null) => ({
    onDragOver: (e: DragEvent) => {
      const tipos = e.dataTransfer.types;
      if (!tipos.includes("Files") && !tipos.includes(ARRASTE_INTERNO)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = tipos.includes("Files") ? "copy" : "move";
      if (alvo !== chave) setAlvo(chave);
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAlvo(null);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setAlvo(null);
      const interno = e.dataTransfer.getData(ARRASTE_INTERNO);
      if (interno) {
        try { void mover(JSON.parse(interno) as Arrastado, destino); } catch { /* arraste estranho */ }
        return;
      }
      void lerSoltura(e.dataTransfer).then((lista) => enviar(lista, destino));
    },
  });

  const arrastavel = (item: Arrastado) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(ARRASTE_INTERNO, JSON.stringify(item));
      e.dataTransfer.effectAllowed = "move";
    },
  });

  // ------------------------------------------------------------ a tela

  const filhos = useMemo(() => {
    const mapa = new Map<number | null, PastaDaGaleria[]>();
    pastas.forEach((p) => mapa.set(p.paiId, [...(mapa.get(p.paiId) || []), p]));
    return mapa;
  }, [pastas]);

  const buscando = achados !== null;
  const pastasNaTela: (PastaDaGaleria & { onde?: string })[] = buscando ? achados.pastas : conteudo?.pastas || [];
  const arquivosNaTela: (ArquivoDaGaleria & { onde?: string })[] = buscando ? achados.arquivos : conteudo?.arquivos || [];
  const vazia = !buscando && conteudo !== null && conteudo.pastas.length === 0 && conteudo.arquivos.length === 0;
  const nomeDaAberta = conteudo?.caminho.at(-1)?.nome ?? "Meus arquivos";
  const bytesNaPasta = (conteudo?.arquivos || []).reduce((s, a) => s + a.bytes, 0);
  const recentes = aberta === null && !buscando ? (resumo?.recentes || []) : [];

  const acoesDaPasta = (pasta: { id: number; nome: string }) => (
    <>
      <AcaoMiuda titulo="Renomear" onClick={() => void renomearPasta(pasta)}>
        <Icone referencia="icones.svg#pencil" className="size-3.5" />
      </AcaoMiuda>
      <AcaoMiuda titulo="Apagar" perigoso onClick={() => void apagarPasta(pasta)}>
        <Icone referencia="icones.svg#trash-2" className="size-3.5" />
      </AcaoMiuda>
    </>
  );

  const acoesDoArquivo = (arquivo: ArquivoDaGaleria) => (
    <>
      <AcaoMiuda titulo="Baixar" onClick={() => baixar(arquivo)}>
        <Icone referencia="icones.svg#download" className="size-3.5" />
      </AcaoMiuda>
      <AcaoMiuda titulo="Renomear" onClick={() => void renomearArquivo(arquivo)}>
        <Icone referencia="icones.svg#pencil" className="size-3.5" />
      </AcaoMiuda>
      <AcaoMiuda titulo="Apagar" perigoso onClick={() => void apagarArquivo(arquivo)}>
        <Icone referencia="icones.svg#trash-2" className="size-3.5" />
      </AcaoMiuda>
    </>
  );

  const ramo = (pasta: PastaDaGaleria): ReactNode => {
    const dentro = filhos.get(pasta.id) || [];
    const aberto = expandidas.has(pasta.id);
    const ativa = aberta === pasta.id;
    return (
      <div key={pasta.id}>
        <div
          {...alvoDeSoltura(`p${pasta.id}`, pasta.id)}
          {...arrastavel({ tipo: "pasta", id: pasta.id })}
          className={[
            "group flex items-center gap-1 rounded-lg px-1 py-1 transition-colors",
            alvo === `p${pasta.id}` ? "bg-[var(--accent-line)]"
              : ativa ? "bg-[var(--accent-soft)]"
                : "hover:bg-[var(--surface-hover)]",
          ].join(" ")}
        >
          <button
            type="button"
            onClick={() => alternar(pasta.id)}
            aria-label={aberto ? "Recolher" : "Mostrar pastas de dentro"}
            className={`grid size-5 shrink-0 place-items-center rounded text-tinta-apagada transition-colors hover:text-ambar ${dentro.length === 0 ? "invisible" : ""}`}
          >
            <Icone referencia={aberto ? "icones.svg#chevron-down" : "icones.svg#chevron-right"} className="size-3" />
          </button>
          <button type="button" onClick={() => void abrir(pasta.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <Icone
              referencia={ativa ? "icones.svg#folder-open" : "icones.svg#folder"}
              className={`size-4 shrink-0 ${ativa ? "text-ambar" : "text-tinta-apagada"}`}
            />
            <span className={`truncate text-[13px] ${ativa ? "font-medium text-ambar" : "text-tinta-fraca group-hover:text-tinta"}`}>{pasta.nome}</span>
          </button>
          <span className="hidden shrink-0 group-hover:block">
            <AcaoMiuda titulo="Nova pasta dentro" onClick={() => void novaPasta(pasta.id)}>
              <Icone referencia="icones.svg#folder-plus" className="size-3" />
            </AcaoMiuda>
          </span>
        </div>
        {aberto && dentro.length > 0 && (
          <div className="ml-3.5 border-l border-linha pl-1.5">{dentro.map(ramo)}</div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full overflow-hidden">
      <LateralDaGaleria nav={nav}>
        <div
          {...alvoDeSoltura("raiz", null)}
          className={`rounded-lg transition-colors ${alvo === "raiz" ? "bg-[var(--accent-line)]" : ""}`}
        >
          <div className="ml-4 border-l border-linha py-0.5 pl-1.5">
            {(filhos.get(null) || []).length === 0
              ? <p className="m-0 px-2 py-1.5 text-[11px] text-tinta-apagada">nenhuma pasta ainda</p>
              : (filhos.get(null) || []).map(ramo)}
          </div>
        </div>
      </LateralDaGaleria>

      <FundoDaGaleria {...alvoDeSoltura("miolo", aberta)} className="relative overflow-hidden">
        {/* ------------------------------------------------ a barra do topo */}
        <div className="flex shrink-0 items-center gap-3 px-6 pt-5">
          <label className="galeria-vidro group relative flex h-12 min-w-0 flex-1 items-center rounded-full pr-2 pl-5 transition-shadow focus-within:shadow-[0_0_0_3px_var(--accent-soft)]">
            <Icone referencia="icones.svg#search" className="size-[18px] shrink-0 text-tinta-apagada group-focus-within:text-ambar" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setBusca(""); }}
              placeholder="Pesquisar em todos os arquivos e pastas"
              className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-tinta placeholder:text-tinta-apagada focus:outline-none"
            />
            {busca && (
              <button type="button" onClick={() => setBusca("")} aria-label="Limpar a busca" className="grid size-8 place-items-center rounded-full text-tinta-apagada hover:bg-[var(--surface-hover)] hover:text-tinta">
                <Icone referencia="icones.svg#x" className="size-4" />
              </button>
            )}
          </label>

          <div className="galeria-vidro flex shrink-0 items-center rounded-full p-1">
            {(["grade", "lista"] as const).map((j) => (
              <button
                key={j}
                type="button"
                onClick={() => trocarJeito(j)}
                aria-pressed={jeito === j}
                title={j === "grade" ? "Ver em grade" : "Ver em lista"}
                className={`grid size-9 place-items-center rounded-full transition-colors ${jeito === j ? "bg-[var(--accent-soft)] text-ambar" : "text-tinta-apagada hover:text-tinta"}`}
              >
                <Icone referencia={j === "grade" ? "icones.svg#layout-grid" : "icones.svg#list"} className="size-4" />
              </button>
            ))}
          </div>
        </div>

        {/* ------------------------------------------------ o título da pasta */}
        <div className="flex shrink-0 flex-wrap items-end gap-4 px-6 pt-6 pb-4">
          <div className="min-w-0 flex-1">
            <nav className="mb-1 flex min-w-0 flex-wrap items-center gap-1 text-xs text-tinta-apagada">
              {buscando ? (
                <span>Resultado da busca</span>
              ) : (
                <>
                  <button type="button" onClick={() => void abrir(null)} className="rounded-md px-1 py-0.5 hover:bg-[var(--surface-hover)] hover:text-ambar">
                    Meus arquivos
                  </button>
                  {(conteudo?.caminho || []).slice(0, -1).map((c) => (
                    <span key={c.id} className="flex items-center gap-1">
                      <Icone referencia="icones.svg#chevron-right" className="size-3" />
                      <button type="button" onClick={() => void abrir(c.id)} className="truncate rounded-md px-1 py-0.5 hover:bg-[var(--surface-hover)] hover:text-ambar">
                        {c.nome}
                      </button>
                    </span>
                  ))}
                </>
              )}
            </nav>
            <h1 className="m-0 truncate font-titulo text-3xl font-semibold tracking-tight text-tinta">
              {buscando ? `“${termo}”` : nomeDaAberta}
            </h1>
            <p className="mt-1 mb-0 text-xs text-tinta-apagada">
              {buscando
                ? `${achados.pastas.length} pasta(s) e ${achados.arquivos.length} arquivo(s) encontrados`
                : conteudo
                  ? `${conteudo.pastas.length} pasta(s) · ${conteudo.arquivos.length} arquivo(s) · ${tamanhoLegivel(bytesNaPasta)}`
                  : "Carregando…"}
            </p>
          </div>

          {!buscando && (
            <div className="flex shrink-0 items-center gap-2">
              <BotaoDeVidro onClick={() => void novaPasta()} icone="icones.svg#folder-plus">Nova pasta</BotaoDeVidro>
              <BotaoDeVidro onClick={() => entradaDePasta.current?.click()} icone="icones.svg#folder-input">Enviar pasta</BotaoDeVidro>
              <button
                type="button"
                disabled={envio !== null}
                onClick={() => entradaDeArquivos.current?.click()}
                className="galeria-novo flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold disabled:opacity-60"
              >
                <Icone referencia="icones.svg#upload" className="size-4" />
                Enviar
              </button>
            </div>
          )}
        </div>

        {erro && (
          <div className="mx-6 mb-3 flex items-start gap-2.5 rounded-2xl border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-4 py-3">
            <Icone referencia="icones.svg#triangle-alert" className="mt-0.5 size-4 shrink-0 text-[var(--danger)]" />
            <p className="m-0 min-w-0 flex-1 text-xs leading-relaxed text-[var(--danger)]">{erro}</p>
            <button type="button" onClick={() => void recarregar()} className="shrink-0 text-xs font-semibold text-ambar hover:underline">
              Tentar de novo
            </button>
            <button type="button" onClick={() => setErro("")} aria-label="Fechar o aviso" className="shrink-0 text-tinta-apagada hover:text-tinta">
              <Icone referencia="icones.svg#x" className="size-3.5" />
            </button>
          </div>
        )}

        {/* ------------------------------------------------ o conteúdo */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-24">
          {conteudo === null && !buscando ? (
            <Esqueleto />
          ) : vazia ? (
            <PastaVazia
              raiz={aberta === null}
              aoEnviar={() => entradaDeArquivos.current?.click()}
              aoCriar={() => void novaPasta()}
            />
          ) : (
            <>
              {recentes.length > 0 && (
                <Secao rotulo="Acesso rápido" icone="icones.svg#clock">
                  <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pt-1 pb-3">
                    {recentes.map((arquivo, i) => (
                      <CartaoDeArquivo
                        key={arquivo.id}
                        arquivo={arquivo}
                        ordem={i}
                        largo
                        aoAbrir={() => abrirArquivo(arquivo)}
                        acoes={acoesDoArquivo(arquivo)}
                        arraste={arrastavel({ tipo: "arquivo", id: arquivo.id })}
                      />
                    ))}
                  </div>
                </Secao>
              )}

              {pastasNaTela.length > 0 && (
                <Secao rotulo="Pastas" icone="icones.svg#folder" contagem={pastasNaTela.length}>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
                    {pastasNaTela.map((pasta, i) => (
                      <div
                        key={pasta.id}
                        {...alvoDeSoltura(`c${pasta.id}`, pasta.id)}
                        {...arrastavel({ tipo: "pasta", id: pasta.id })}
                        data-alvo={alvo === `c${pasta.id}` ? "sim" : undefined}
                        onClick={() => void abrir(pasta.id)}
                        style={{ "--ordem": i } as CSSProperties}
                        className="galeria-cartao galeria-entra group flex cursor-pointer items-center gap-3.5 rounded-2xl px-4 py-3.5"
                      >
                        <span className="galeria-pasta" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-tinta">{pasta.nome}</span>
                          <span className="block truncate text-[11px] text-tinta-apagada">
                            {pasta.onde ? `em ${pasta.onde}` : `${pasta.pastas ? `${pasta.pastas} pasta(s) · ` : ""}${pasta.arquivos} arquivo(s)`}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          {acoesDaPasta(pasta)}
                        </span>
                      </div>
                    ))}
                  </div>
                </Secao>
              )}

              {arquivosNaTela.length > 0 && (
                <Secao rotulo="Arquivos" icone="icones.svg#file" contagem={arquivosNaTela.length}>
                  {jeito === "grade" ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4">
                      {arquivosNaTela.map((arquivo, i) => (
                        <CartaoDeArquivo
                          key={arquivo.id}
                          arquivo={arquivo}
                          ordem={i}
                          onde={arquivo.onde}
                          aoAbrir={() => abrirArquivo(arquivo)}
                          acoes={acoesDoArquivo(arquivo)}
                          arraste={arrastavel({ tipo: "arquivo", id: arquivo.id })}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="galeria-vidro overflow-hidden rounded-2xl">
                      <div className="grid grid-cols-[minmax(0,1fr)_110px_120px_104px] items-center gap-3 border-b border-linha px-4 py-2.5 text-[10px] font-bold tracking-widest text-tinta-apagada uppercase">
                        <span>Nome</span>
                        <span>Tamanho</span>
                        <span>Guardado em</span>
                        <span />
                      </div>
                      {arquivosNaTela.map((arquivo, i) => {
                        const tipo = tipoDoArquivo(arquivo);
                        return (
                          <div
                            key={arquivo.id}
                            {...arrastavel({ tipo: "arquivo", id: arquivo.id })}
                            onClick={() => abrirArquivo(arquivo)}
                            style={{ "--ordem": i, "--cor-do-tipo": `var(${tipo.cor})` } as CSSProperties}
                            className="galeria-entra group grid cursor-pointer grid-cols-[minmax(0,1fr)_110px_120px_104px] items-center gap-3 border-b border-[var(--border-hairline)] px-4 py-2 transition-colors last:border-b-0 hover:bg-[var(--surface-hover)]"
                          >
                            <span className="flex min-w-0 items-center gap-3">
                              <span className="galeria-selo grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg">
                                {arquivo.miniatura
                                  ? <img src={arquivo.miniatura} alt="" className="size-full object-cover" draggable={false} />
                                  : <Icone referencia={tipo.icone} className="size-4" />}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm text-tinta">{arquivo.nome}</span>
                                {arquivo.onde && <span className="block truncate text-[11px] text-tinta-apagada">em {arquivo.onde}</span>}
                              </span>
                            </span>
                            <span className="font-mono text-xs text-tinta-fraca">{tamanhoLegivel(arquivo.bytes)}</span>
                            <span className="font-mono text-xs text-tinta-fraca">{dataCurta(arquivo.criadoEm)}</span>
                            <span className="flex justify-end opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                              {acoesDoArquivo(arquivo)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Secao>
              )}

              {buscando && pastasNaTela.length === 0 && arquivosNaTela.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <span className="galeria-vidro grid size-16 place-items-center rounded-3xl text-tinta-apagada">
                    <Icone referencia="icones.svg#search" className="size-7" />
                  </span>
                  <p className="m-0 text-sm text-tinta-fraca">Nada com “{termo}” em nenhuma pasta.</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* ------------------------------------------------ o envio, flutuando */}
        {envio && (
          <div className="galeria-vidro absolute right-6 bottom-6 z-20 w-80 rounded-2xl p-4 shadow-[var(--shadow-lift)] animar-entrada">
            <div className="flex items-center gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-ambar">
                <Icone referencia="icones.svg#cloud-upload" className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-tinta">
                  Enviando {envio.feitos + 1} de {envio.total}
                </span>
                <span className="block truncate text-[11px] text-tinta-apagada">{envio.nome}</span>
              </span>
              <span className="font-mono text-xs text-ambar">
                {Math.round(((envio.feitos + envio.fracao) / envio.total) * 100)}%
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-hover)]">
              <div
                className="galeria-andamento h-full rounded-full transition-[width]"
                style={{ width: `${Math.max(3, Math.round(((envio.feitos + envio.fracao) / envio.total) * 100))}%` }}
              />
            </div>
          </div>
        )}

        {alvo === "miolo" && (
          <div className="pointer-events-none absolute inset-3 z-30 grid place-items-center rounded-3xl border-2 border-dashed border-[var(--accent)] bg-[color-mix(in_srgb,var(--bg)_55%,transparent)] backdrop-blur-sm animar-entrada">
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="galeria-novo grid size-20 place-items-center rounded-3xl">
                <Icone referencia="icones.svg#cloud-upload" className="size-9" />
              </span>
              <p className="m-0 font-titulo text-xl font-semibold text-tinta">Solte para guardar</p>
              <p className="m-0 text-sm text-tinta-fraca">em <span className="text-ambar">{nomeDaAberta}</span></p>
            </div>
          </div>
        )}

        <input
          ref={entradaDeArquivos}
          type="file"
          accept={ACEITA_NO_SELETOR}
          multiple
          className="hidden"
          onChange={(e) => {
            const lista = [...(e.target.files || [])].map((arquivo) => ({ arquivo, caminho: [] }));
            e.target.value = "";
            void enviar(lista, aberta);
          }}
        />
        <input
          ref={entradaDePasta}
          type="file"
          multiple
          className="hidden"
          {...{ webkitdirectory: "" }}
          onChange={(e) => {
            // `webkitRelativePath` = "Pasta/sub/arquivo.pdf": tudo menos o
            // último pedaço vira a árvore de pastas aqui dentro.
            const lista = [...(e.target.files || [])].map((arquivo) => ({
              arquivo,
              caminho: (arquivo.webkitRelativePath || arquivo.name).split("/").slice(0, -1),
            }));
            e.target.value = "";
            void enviar(lista, aberta);
          }}
        />
      </FundoDaGaleria>

      {vendo && <Visualizador arquivo={vendo} aoFechar={() => setVendo(null)} />}
    </div>
  );
}

// ==================== OS CARTÕES ====================

function CartaoDeArquivo({ arquivo, ordem, largo, onde, aoAbrir, acoes, arraste }: {
  arquivo: ArquivoDaGaleria;
  ordem: number;
  /** O do "Acesso rápido": largura fixa, numa fileira que rola de lado. */
  largo?: boolean;
  onde?: string;
  aoAbrir: () => void;
  acoes: ReactNode;
  arraste: { draggable: boolean; onDragStart: (e: DragEvent) => void };
}) {
  const tipo = tipoDoArquivo(arquivo);
  return (
    <article
      {...arraste}
      onClick={aoAbrir}
      title={comoMostrar(arquivo) ? "Abrir" : "Baixar"}
      style={{ "--ordem": ordem, "--cor-do-tipo": `var(${tipo.cor})` } as CSSProperties}
      className={`galeria-cartao galeria-entra group flex cursor-pointer flex-col overflow-hidden rounded-2xl ${largo ? "w-52 shrink-0" : ""}`}
    >
      <div className="galeria-previa relative grid aspect-[4/3] place-items-center overflow-hidden">
        {arquivo.miniatura ? (
          <img src={arquivo.miniatura} alt="" className="size-full object-cover" draggable={false} />
        ) : (
          <span className="text-[var(--cor-do-tipo)]">
            <Icone referencia={tipo.icone} className="size-11 drop-shadow-[0_6px_16px_currentColor]" />
          </span>
        )}
        <span className="galeria-selo absolute bottom-2 left-2 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider uppercase backdrop-blur">
          {extensao(arquivo.nome) || tipo.rotulo}
        </span>
        <span className="galeria-vidro absolute top-2 right-2 flex items-center rounded-full p-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {acoes}
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-2.5 px-3 py-2.5">
        <span className="shrink-0 text-[var(--cor-do-tipo)]">
          <Icone referencia={tipo.icone} className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-tinta" title={arquivo.nome}>{arquivo.nome}</span>
          <span className="block truncate text-[11px] text-tinta-apagada">
            {onde ? `em ${onde}` : `${tamanhoLegivel(arquivo.bytes)} · ${dataCurta(arquivo.criadoEm)}`}
          </span>
        </span>
      </div>
    </article>
  );
}

function Secao({ rotulo, icone, contagem, children }: {
  rotulo: string; icone: string; contagem?: number; children: ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="mt-0 mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-tinta-fraca">
        <Icone referencia={icone} className="size-3.5 text-tinta-apagada" />
        {rotulo}
        {contagem !== undefined && (
          <span className="rounded-full bg-[var(--surface-hover)] px-2 py-0.5 font-mono text-[10px] font-normal text-tinta-apagada">
            {contagem}
          </span>
        )}
      </h2>
      {children}
    </section>
  );
}

function PastaVazia({ raiz, aoEnviar, aoCriar }: { raiz: boolean; aoEnviar: () => void; aoCriar: () => void }) {
  return (
    <div className="grid min-h-[60%] place-items-center py-10">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        {/* Três pastas empilhadas, a da frente com brilho. */}
        <div className="relative h-28 w-44" aria-hidden="true">
          <span className="galeria-pasta absolute top-6 left-4 scale-[1.5] -rotate-12 opacity-40" />
          <span className="galeria-pasta absolute top-6 right-4 scale-[1.5] rotate-12 opacity-40" />
          <span className="galeria-pasta absolute top-10 left-1/2 -ml-[23px] scale-[2] drop-shadow-[0_20px_40px_rgba(255,83,31,0.45)]" />
        </div>
        <div>
          <p className="m-0 font-titulo text-2xl font-semibold text-tinta">
            {raiz ? "Seu drive está pronto" : "Esta pasta está vazia"}
          </p>
          <p className="mt-2 mb-0 text-sm leading-relaxed text-tinta-fraca">
            Arraste para cá imagens e PDFs, ou uma pasta inteira do computador — PNG, JPG,
            WEBP, GIF, BMP, TIFF e PDF. Uma pasta por empresa, e dentro dela o que for dela: o
            fardamento, as fotos das peças, os pedidos.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" onClick={aoEnviar} className="galeria-novo flex h-11 items-center gap-2 rounded-full px-6 text-sm font-semibold">
            <Icone referencia="icones.svg#upload" className="size-4" />
            Enviar arquivos
          </button>
          <BotaoDeVidro onClick={aoCriar} icone="icones.svg#folder-plus" grande>Nova pasta</BotaoDeVidro>
        </div>
      </div>
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4 pt-2">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="galeria-vidro h-48 animate-pulse rounded-2xl" style={{ animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
  );
}

function BotaoDeVidro({ onClick, icone, grande, children }: {
  onClick: () => void; icone: string; grande?: boolean; children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`galeria-vidro flex items-center gap-2 rounded-full text-sm text-tinta transition-colors hover:text-ambar ${grande ? "h-11 px-6" : "h-10 px-4"}`}
    >
      <Icone referencia={icone} className="size-4" />
      {children}
    </button>
  );
}

function AcaoMiuda({ titulo, perigoso, onClick, children }: {
  titulo: string; perigoso?: boolean; onClick: () => void; children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={titulo}
      title={titulo}
      className={[
        "grid size-7 place-items-center rounded-full text-tinta-fraca transition-colors",
        perigoso
          ? "hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:text-[var(--danger)]"
          : "hover:bg-[var(--surface-hover)] hover:text-ambar",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/** Imagem e PDF abrem por cima da tela; o TIFF só baixa. */
function Visualizador({ arquivo, aoFechar }: { arquivo: ArquivoDaGaleria; aoFechar: () => void }) {
  useEffect(() => {
    const noEsc = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar(); };
    window.addEventListener("keydown", noEsc);
    return () => window.removeEventListener("keydown", noEsc);
  }, [aoFechar]);

  const jeito = comoMostrar(arquivo);
  const tipo = tipoDoArquivo(arquivo);
  return (
    <div onClick={aoFechar} className="fixed inset-0 z-90 flex flex-col bg-black/75 p-6 backdrop-blur-md animar-entrada">
      <div onClick={(e) => e.stopPropagation()} className="galeria-vidro mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-3xl shadow-[var(--shadow-lift)]">
        <header className="flex shrink-0 items-center gap-3 border-b border-linha px-5 py-3">
          <span className="galeria-selo grid size-9 shrink-0 place-items-center rounded-xl" style={{ "--cor-do-tipo": `var(${tipo.cor})` } as CSSProperties}>
            <Icone referencia={tipo.icone} className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-tinta">{arquivo.nome}</span>
            <span className="block text-[11px] text-tinta-apagada">
              {tamanhoLegivel(arquivo.bytes)} · guardado em {dataCurta(arquivo.criadoEm)}
            </span>
          </span>
          <button type="button" onClick={() => baixar(arquivo)} className="galeria-novo flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold">
            <Icone referencia="icones.svg#download" className="size-4" />
            Baixar
          </button>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="grid size-9 place-items-center rounded-full text-tinta-fraca hover:bg-[var(--surface-hover)] hover:text-tinta">
            <Icone referencia="icones.svg#x" className="size-4" />
          </button>
        </header>
        <div className="grid min-h-0 flex-1 place-items-center overflow-auto p-4">
          {jeito === "imagem" ? (
            <img src={arquivo.url} alt={arquivo.nome} className="max-h-full max-w-full rounded-xl object-contain shadow-[var(--shadow-lift)]" />
          ) : (
            <iframe src={arquivo.url} title={arquivo.nome} className="size-full rounded-xl border-0 bg-white" />
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== AS CONTAS ====================

function baixar(arquivo: ArquivoDaGaleria) {
  const link = document.createElement("a");
  link.href = galeriaApi.baixar(arquivo.id);
  link.download = arquivo.nome;
  link.click();
}

/** O mesmo que o servidor aceita mostrar (`VER_NA_TELA`). */
function comoMostrar(arquivo: ArquivoDaGaleria): "imagem" | "documento" | null {
  const tipo = arquivo.tipo || "";
  if (["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"].includes(tipo)) return "imagem";
  if (tipo === "application/pdf") return "documento";
  return null;
}

function extensao(nome: string) {
  const ponto = nome.lastIndexOf(".");
  return ponto > 0 ? nome.slice(ponto + 1).toLowerCase().slice(0, 6) : "";
}

function dataCurta(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * O ícone, a cor (um token de `estilo/tokens.css`) e o nome do tipo.
 *
 * As referências ficam escritas por inteiro, entre aspas: é assim que o
 * `empacotar/icones.js` acha os ícones para pôr no sprite.
 */
function tipoDoArquivo(arquivo: ArquivoDaGaleria): { icone: string; cor: string; rotulo: string } {
  const tipo = arquivo.tipo || "";
  const ext = extensao(arquivo.nome);
  if (tipo === "application/pdf" || ext === "pdf") return { icone: "icones.svg#file-text", cor: "--tipo-pdf", rotulo: "pdf" };
  if (tipo === "image/tiff" || ext === "tif" || ext === "tiff") return { icone: "icones.svg#file-image", cor: "--tipo-tiff", rotulo: "tiff" };
  if (tipo === "image/png" || ext === "png") return { icone: "icones.svg#file-image", cor: "--tipo-png", rotulo: "png" };
  return { icone: "icones.svg#file-image", cor: "--tipo-imagem", rotulo: "imagem" };
}

/** A prévia de 240 px de uma imagem, ou `null` para o que não é imagem. */
async function miniaturaDoArquivo(arquivo: File): Promise<string | null> {
  if (!["image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp"].includes(arquivo.type)) return null;
  try {
    const bitmap = await createImageBitmap(arquivo);
    const fator = Math.min(1, 240 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * fator));
    canvas.height = Math.max(1, Math.round(bitmap.height * fator));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/**
 * O que foi solto na tela, com as pastas abertas por dentro.
 *
 * `dataTransfer.files` traz uma pasta solta como um "arquivo" vazio que não
 * sobe. O `webkitGetAsEntry` é o que enxerga a pasta e deixa descer por ela.
 * As entradas são lidas ANTES de qualquer `await`: depois dele o navegador
 * esvazia o `dataTransfer`.
 */
async function lerSoltura(dados: DataTransfer): Promise<ParaEnviar[]> {
  const entradas = [...dados.items]
    .map((item) => (item.kind === "file" ? item.webkitGetAsEntry() : null))
    .filter((e): e is FileSystemEntry => e !== null);
  if (entradas.length === 0) return [...dados.files].map((arquivo) => ({ arquivo, caminho: [] }));

  const lista: ParaEnviar[] = [];
  const descer = async (entrada: FileSystemEntry, caminho: string[]) => {
    if (entrada.isFile) {
      const arquivo = await new Promise<File>((ok, falha) => (entrada as FileSystemFileEntry).file(ok, falha));
      lista.push({ arquivo, caminho });
      return;
    }
    const leitor = (entrada as FileSystemDirectoryEntry).createReader();
    // `readEntries` devolve em lotes (100 no Chrome): lê até vir vazio.
    for (;;) {
      const lote = await new Promise<FileSystemEntry[]>((ok, falha) => leitor.readEntries(ok, falha));
      if (lote.length === 0) break;
      for (const filha of lote) await descer(filha, [...caminho, entrada.name]);
    }
  };
  for (const entrada of entradas) await descer(entrada, []);
  return lista;
}
