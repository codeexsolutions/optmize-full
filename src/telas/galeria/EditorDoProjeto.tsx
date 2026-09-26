/**
 * ===========================================================================
 * O PROJETO ABERTO — o editor do Optmize Lite, aqui dentro
 * ===========================================================================
 *
 * É a tela de projeto do painel web (`optmize-lite/src/features/projects/
 * ProjectEditor.tsx` e `SubprojectPanel.tsx`), com a mesma estrutura:
 *
 *   ┌ ← Nome do projeto ✎ ·········· [ Levar pro Encaixe ] │ 🗑 ┐
 *   │ [Camisa 12] [Bandeira 4] [+ Subprojeto]              🗑 │  as abas
 *   │ Camisa ✎   3 categoria(s) · 12 peça(s)                  │
 *   │ ┌ CATEGORIA ──────────────────────────────────────────┐ │
 *   │ │ [P  −2+] [M  −5+] [G  −1+]   nova… [Adicionar] +GG  │ │
 *   │ └─────────────────────────────────────────────────────┘ │
 *   │ ┌ M · 2 peça(s) × 5 unidade(s) ───────────────────────┐ │
 *   │ │ [arte] [arte] [+ anexar]     nova peça… [Peça]      │ │
 *   │ └─────────────────────────────────────────────────────┘ │
 *   └ SUBPROJETOS 2 · CATEGORIAS 3 · PEÇAS 12 ······· salvo ┘
 *
 * O que muda em relação ao lite é só o que a casa pede: os ícones saem do
 * sprite, os componentes são os daqui (`Botao`, o `Dialogo` para confirmar),
 * a arte fica no disco desta máquina (`/uploads/projetos`) e a medida dela é
 * guardada em centímetros junto da peça — o Encaixe precisa dela, e o dpi do
 * arquivo nem sempre está certo, então dá para corrigir no cartão.
 *
 * TUDO SALVA SOZINHO, meio segundo depois da última mudança. "Levar pro
 * Encaixe" é a super cópia do lite: multiplica tudo (quantidade da categoria
 * × por item) e entrega as peças prontas. Os ajustes do Encaixe (tecido,
 * bancada, giro, folga) não saem daqui — são do confere do Optmizar.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useDialogo } from "../../casca/Dialogo";
import { Icone } from "../../casca/Icone";
import { Botao } from "../../casca/Botao";
import { useErroEmAlerta } from "../../casca/Alerta";
import {
  projetosApi,
  type ArteDaPeca, type CategoriaDoSubprojeto, type EstruturaDoProjeto, type PecaDaCategoria,
  type Projeto, type Subprojeto,
} from "../../api/projetos";
import { medidasDoArquivo, pixelsPorCmDoArquivo, PPCM_PADRAO } from "../../motores/medidaDoArquivo";
import { useLigacao } from "../../producao/ligacao";
import { carregarImagem } from "../../utils/arquivoDeImagem";

/** Os atalhos de categoria, os mesmos do lite. */
const CATEGORIAS_COMUNS = ["PP", "P", "M", "G", "GG", "XG"] as const;

/** O que entra como arte: o que o Encaixe sabe desenhar. */
const TIPOS_DE_ARTE = ["image/png", "image/jpeg", "image/webp"];

const LADO_DA_MINIATURA = 240;

const novoId = (prefixo: string) => `${prefixo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const urlDaArte = (arte: ArteDaPeca) => `/uploads/projetos/${arte.arquivo}`;
const corDaPeca = (cor: number) => `var(--peca-${(cor % 10) + 1})`;

/** Sem as setinhas do campo numérico: o − e o + ao lado já fazem isso. */
const SEM_SETINHAS = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/** Onde uma arte vai entrar: a peça de uma categoria de um subprojeto. */
interface Alvo { sub: string; cat: string; peca: string }

type Gravacao = "salvo" | "salvando" | { erro: string };

export function EditorDoProjeto({ projeto, aoFechar, aoMudarOProjeto }: {
  projeto: Projeto;
  aoFechar: () => void;
  aoMudarOProjeto: () => Promise<void>;
}) {
  const dialogo = useDialogo();
  const ligacao = useLigacao();
  const setErro = useErroEmAlerta("Não deu certo no projeto");

  const [nome, setNome] = useState(projeto.nome);
  const [estrutura, setEstrutura] = useState<EstruturaDoProjeto>(projeto.estrutura);
  const [subAberto, setSubAberto] = useState<string | null>(projeto.estrutura.subprojetos[0]?.id ?? null);
  const [gravacao, setGravacao] = useState<Gravacao>("salvo");
  /** Quantas artes estão subindo agora — a barra de baixo avisa. */
  const [subindo, setSubindo] = useState(0);

  const entrada = useRef<HTMLInputElement>(null);
  const alvoDoSeletor = useRef<Alvo | null>(null);

  // ------------------------------------------------------------ a gravação

  /*
   * O que está na tela agora, para a gravação ler sem closure velha: ela pode
   * rodar quando o editor já está saindo. E `aoMudarOProjeto` vai num ref
   * porque o pai a recria a cada render — e cada gravação faz o pai
   * renderizar; sem o ref, uma gravação agendaria outra, para sempre.
   */
  const atual = useRef({ nome, estrutura });
  atual.current = { nome, estrutura };
  const aoMudar = useRef(aoMudarOProjeto);
  aoMudar.current = aoMudarOProjeto;
  const pendente = useRef(false);
  const primeiraVez = useRef(true);

  const gravar = useCallback(async (): Promise<boolean> => {
    const { nome, estrutura } = atual.current;
    if (!nome.trim()) { setGravacao({ erro: "o projeto está sem nome" }); return false; }
    pendente.current = false;
    setGravacao("salvando");
    try {
      await projetosApi.gravarEstrutura(projeto.id, nome.trim(), estrutura);
      setGravacao(pendente.current ? "salvando" : "salvo");
      await aoMudar.current();
      return true;
    } catch (e) {
      pendente.current = true;
      setGravacao({ erro: e instanceof Error ? e.message : String(e) });
      return false;
    }
  }, [projeto.id]);
  const gravarAgora = useRef(gravar);
  gravarAgora.current = gravar;

  // Toda mudança grava sozinha, meio segundo depois da última.
  useEffect(() => {
    if (primeiraVez.current) { primeiraVez.current = false; return; }
    pendente.current = true;
    setGravacao("salvando");
    const espera = setTimeout(() => { void gravarAgora.current(); }, 500);
    return () => clearTimeout(espera);
  }, [nome, estrutura]);

  // Saindo com gravação pendente: grava antes de ir.
  useEffect(() => () => { if (pendente.current) void gravarAgora.current(); }, []);

  // ------------------------------------------------------------ mexer na estrutura

  const mexerNoSub = useCallback((subId: string, mudar: (s: Subprojeto) => Subprojeto) =>
    setEstrutura((e) => ({ subprojetos: e.subprojetos.map((s) => (s.id === subId ? mudar(s) : s)) })), []);

  const mexerNaCategoria = useCallback((subId: string, catId: string, mudar: (c: CategoriaDoSubprojeto) => CategoriaDoSubprojeto) =>
    mexerNoSub(subId, (s) => ({ ...s, categorias: s.categorias.map((c) => (c.id === catId ? mudar(c) : c)) })), [mexerNoSub]);

  const mexerNaPeca = useCallback((alvo: Alvo, mudar: (p: PecaDaCategoria) => PecaDaCategoria) =>
    mexerNaCategoria(alvo.sub, alvo.cat, (c) => ({ ...c, pecas: c.pecas.map((p) => (p.id === alvo.peca ? mudar(p) : p)) })), [mexerNaCategoria]);

  const novoSubprojeto = (nomeDele?: string) => {
    const id = novoId("sp");
    setEstrutura((e) => ({
      subprojetos: [...e.subprojetos, {
        id, nome: nomeDele?.trim() || `Subprojeto ${e.subprojetos.length + 1}`, categorias: [],
      }],
    }));
    setSubAberto(id);
  };

  const apagarSubprojeto = async (sub: Subprojeto) => {
    const artes = sub.categorias.reduce((n, c) => n + c.pecas.filter((p) => p.arte).length, 0);
    const certeza = await dialogo.confirmar(
      `"${sub.nome}", suas ${pecasDoSub(sub)} peça(s)${artes > 0 ? ` e ${artes} arte(s) anexada(s)` : ""} serão removidos. Não dá para desfazer.`,
      { titulo: "Apagar subprojeto", confirmar: "Apagar" },
    );
    if (!certeza) return;
    setEstrutura((e) => ({ subprojetos: e.subprojetos.filter((s) => s.id !== sub.id) }));
    setSubAberto(null);
  };

  /**
   * Anexa (ou troca) a arte de uma peça: lê a medida do cabeçalho, sobe o
   * arquivo e só então aponta a peça para ele. Gravar a referência antes
   * deixaria o projeto citando um arquivo que talvez não exista.
   */
  const anexar = async (alvo: Alvo, arquivo: File) => {
    if (!TIPOS_DE_ARTE.includes(arquivo.type)) {
      setErro(`"${arquivo.name}" não entra: a arte precisa ser PNG, JPG ou WEBP.`);
      return;
    }
    setSubindo((n) => n + 1);
    try {
      const bytes = new Uint8Array(await arquivo.arrayBuffer());
      const ppcm = pixelsPorCmDoArquivo(bytes) || PPCM_PADRAO;
      const { arquivo: nomeNoDisco, url } = await projetosApi.mandarImagem(projeto.id, arquivo);
      const img = await carregarImagem(url);
      const arte: ArteDaPeca = {
        arquivo: nomeNoDisco,
        nome: arquivo.name,
        miniatura: miniaturaDaImagem(img),
        largura: Math.round((img.naturalWidth / ppcm) * 10) / 10,
        altura: Math.round((img.naturalHeight / ppcm) * 10) / 10,
      };
      mexerNaPeca(alvo, (p) => ({ ...p, arte }));
    } catch (e) {
      setErro(`Não foi possível enviar "${arquivo.name}": ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSubindo((n) => n - 1);
    }
  };

  const escolherArte = (alvo: Alvo) => {
    alvoDoSeletor.current = alvo;
    entrada.current?.click();
  };

  /*
   * Arte guardada antes da miniatura existir mostraria o arquivo inteiro no
   * cartão — o que trava a página. Aqui ela ganha a sua, sem bloquear; a
   * gravação automática a guarda para a próxima vez.
   */
  useEffect(() => {
    const faltando: { alvo: Alvo; arte: ArteDaPeca }[] = [];
    projeto.estrutura.subprojetos.forEach((s) => s.categorias.forEach((c) => c.pecas.forEach((p) => {
      if (p.arte && !p.arte.miniatura) faltando.push({ alvo: { sub: s.id, cat: c.id, peca: p.id }, arte: p.arte });
    })));
    if (faltando.length === 0) return;
    let cancelado = false;
    (async () => {
      for (const { alvo, arte } of faltando) {
        try {
          const blob = await fetch(urlDaArte(arte)).then((r) => r.blob());
          const miniatura = await miniaturaDoBlob(blob, medidasDoArquivo(new Uint8Array(await blob.arrayBuffer())));
          if (cancelado) return;
          if (miniatura) mexerNaPeca(alvo, (p) => (p.arte ? { ...p, arte: { ...p.arte, miniatura } } : p));
        } catch {
          // sem miniatura: o cartão mostra o nome do arquivo
        }
      }
    })();
    return () => { cancelado = true; };
  }, [projeto, mexerNaPeca]);

  // ------------------------------------------------------------ a super cópia

  /**
   * Leva as peças já multiplicadas ao Encaixe.
   *
   * A troca de tela vem ANTES do trabalho: o andamento do Encaixe mora
   * naquela tela, e com esta na frente a pessoa via só a tela parada.
   */
  const levarProEncaixe = async () => {
    const pecas = expandir(estrutura);
    if (pecas.length === 0) {
      setErro("Nenhuma peça para levar: confira se as categorias têm quantidade e se cada peça tem a arte.");
      return;
    }
    if (!ligacao) { setErro("O editor de produção não está montado."); return; }
    if (!await gravar()) { setErro("O projeto não foi salvo — confira o aviso na barra de baixo."); return; }

    ligacao.irPara("encaixe");
    try {
      await ligacao.mandarProjetoParaOEncaixe({
        nome: nome.trim(),
        unidades: 1,
        pecas,
        // `null` e giro vazio: deixe os campos do Encaixe como estão.
        ajustes: { larguraTecido: null, espaco: null, comprimentoBancada: null, giro: "" },
      });
    } catch (e) {
      await dialogo.avisar(
        `Não deu para mandar o projeto ao encaixe: ${e instanceof Error ? e.message : String(e)}`,
        { perigoso: true },
      );
    }
  };

  const excluirProjeto = async () => {
    const certeza = await dialogo.confirmar(
      `"${nome}", seus subprojetos e as artes guardadas serão apagados. Não dá para desfazer.`,
      { titulo: "Apagar projeto", confirmar: "Apagar" },
    );
    if (!certeza) return;
    pendente.current = false;
    try {
      await projetosApi.apagar(projeto.id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      return;
    }
    aoFechar();
    await aoMudarOProjeto();
  };

  // ------------------------------------------------------------ a tela

  const totalDePecas = useMemo(() => expandir(estrutura).reduce((n, p) => n + p.quantidade, 0), [estrutura]);
  const atualSub = estrutura.subprojetos.find((s) => s.id === subAberto) ?? null;
  const faltam = atualSub ? pecasSemArte(atualSub) : [];

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* Barra de ferramentas */}
      <div className="galeria-vidro flex shrink-0 flex-wrap items-center gap-3 border-x-0 border-t-0 px-3 py-1.5">
        <button
          type="button"
          onClick={aoFechar}
          title="Voltar para os projetos do cliente"
          className="grid size-7 shrink-0 place-items-center rounded-lg text-tinta-apagada transition-colors hover:bg-[var(--surface-hover)] hover:text-ambar"
        >
          <Icone referencia="icones.svg#arrow-left" className="size-3.5" />
        </button>
        <span className="text-[10px] font-bold tracking-widest text-tinta-apagada uppercase">
          {projeto.cliente?.nome ?? "Cliente"}
        </span>
        <TextoEditavel
          valor={nome}
          aoMudar={setNome}
          className="text-sm font-semibold text-tinta"
          rotulo="Nome do projeto"
        />

        {/*
          Canto superior direito: a ação que conclui o trabalho e, separada
          dela, a que o destrói. Esta é a barra do projeto, então aqui se apaga
          o projeto.
        */}
        <div className="ml-auto flex items-center gap-2">
          <Botao
            tamanho="pequeno"
            jeito="primario"
            disabled={totalDePecas === 0 || subindo > 0}
            onClick={() => void levarProEncaixe()}
            icone={<Icone referencia="icones.svg#blocks" className="size-3.5" />}
            title="Multiplica tudo e leva as peças para o Encaixe, prontas para encaixar"
          >
            Levar pro Encaixe
          </Botao>
          <span className="h-5 w-px shrink-0 bg-[var(--border)]" />
          <button
            type="button"
            onClick={() => void excluirProjeto()}
            aria-label={`Apagar o projeto ${nome}`}
            title="Apagar este projeto"
            className="grid size-7 shrink-0 place-items-center rounded-lg text-tinta-apagada transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:text-[var(--danger)]"
          >
            <Icone referencia="icones.svg#trash-2" className="size-3.5" />
          </button>
        </div>
      </div>

      {estrutura.subprojetos.length === 0 ? (
        <div className="grid flex-1 place-items-center p-8">
          <div className="flex max-w-sm flex-col items-center gap-4 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-painel text-tinta-apagada">
              <Icone referencia="icones.svg#layers" className="size-6" />
            </span>
            <div>
              <p className="m-0 font-titulo text-base font-semibold text-tinta">Adicione o primeiro subprojeto</p>
              <p className="mt-1 mb-0 text-sm text-tinta-fraca">
                É o que você produz: uma camisa, uma bandeira, um wind banner.
              </p>
            </div>
            <div className="flex flex-col items-center gap-3">
              <Botao jeito="primario" onClick={() => novoSubprojeto()} icone={<Icone referencia="icones.svg#plus" className="size-4" />}>
                Novo subprojeto
              </Botao>
              <div className="flex flex-wrap justify-center gap-1">
                {CATEGORIAS_COMUNS.map((rotulo) => (
                  <Atalho key={rotulo} rotulo={rotulo} aoClicar={() => novoSubprojeto(rotulo)} />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/*
            Abas dos subprojetos. As abas rolam; a ação de apagar não — fica
            encostada na direita, fora da rolagem.
          */}
          <div className="flex shrink-0 items-stretch border-b border-linha">
            <div className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto px-3 py-1.5">
              {estrutura.subprojetos.map((sub) => {
                const ativo = sub.id === atualSub?.id;
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => setSubAberto(sub.id)}
                    className={[
                      "flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors",
                      ativo
                        ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-ambar"
                        : "border-transparent bg-painel text-tinta-fraca hover:text-tinta",
                    ].join(" ")}
                  >
                    <span className="max-w-40 truncate font-medium">{sub.nome}</span>
                    <span className="font-mono text-[10px] text-tinta-apagada">{pecasDoSub(sub)}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => novoSubprojeto()}
                title="Novo subprojeto"
                className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-tinta-apagada transition-colors hover:bg-painel hover:text-ambar"
              >
                <Icone referencia="icones.svg#plus" className="size-3" />
                Subprojeto
              </button>
            </div>

            {atualSub && (
              <div className="flex shrink-0 items-center border-l border-linha px-2">
                <button
                  type="button"
                  onClick={() => void apagarSubprojeto(atualSub)}
                  aria-label={`Apagar o subprojeto ${atualSub.nome}`}
                  title={`Apagar o subprojeto "${atualSub.nome}"`}
                  className="grid size-7 place-items-center rounded-lg text-tinta-apagada transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:text-[var(--danger)]"
                >
                  <Icone referencia="icones.svg#trash-2" className="size-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 2xl:px-6">
            {atualSub ? (
              <div key={atualSub.id} className="animar-entrada">
                <PainelDoSubprojeto
                  sub={atualSub}
                  aoMexer={(mudar) => mexerNoSub(atualSub.id, mudar)}
                  aoMexerNaCategoria={(catId, mudar) => mexerNaCategoria(atualSub.id, catId, mudar)}
                  aoMexerNaPeca={(catId, pecaId, mudar) => mexerNaPeca({ sub: atualSub.id, cat: catId, peca: pecaId }, mudar)}
                  aoEscolherArte={(catId, pecaId) => escolherArte({ sub: atualSub.id, cat: catId, peca: pecaId })}
                  aoSoltarArte={(catId, pecaId, arquivo) => void anexar({ sub: atualSub.id, cat: catId, peca: pecaId }, arquivo)}
                  confirmar={(texto, titulo) => dialogo.confirmar(texto, { titulo, confirmar: "Apagar" })}
                />

                {/* O que falta — antes de levar ao Encaixe, não depois. */}
                {faltam.length > 0 && (
                  <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--warn)_30%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] px-3 py-2.5">
                    <Icone referencia="icones.svg#triangle-alert" className="mt-0.5 size-4 shrink-0 text-[var(--warn)]" />
                    <p className="m-0 text-xs leading-relaxed text-tinta-fraca">
                      <span className="font-semibold text-[var(--warn)]">{faltam.length} arte(s) faltando:</span>{" "}
                      {faltam.slice(0, 6).join(", ")}
                      {faltam.length > 6 && ` e mais ${faltam.length - 6}`}. Essas peças não vão para o Encaixe.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid min-h-[50vh] place-items-center">
                <div className="flex max-w-sm flex-col items-center gap-4 text-center">
                  <span className="grid size-14 place-items-center rounded-2xl bg-painel text-tinta-apagada">
                    <Icone referencia="icones.svg#layers" className="size-6" />
                  </span>
                  <div>
                    <p className="m-0 font-titulo text-base font-semibold text-tinta">Escolha um subprojeto</p>
                    <p className="mt-1 mb-0 text-sm text-tinta-fraca">Escolha uma das abas acima, ou crie um novo.</p>
                  </div>
                  <Botao jeito="primario" onClick={() => novoSubprojeto()} icone={<Icone referencia="icones.svg#plus" className="size-4" />}>
                    Novo subprojeto
                  </Botao>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Barra de status — os números do pedido e o estado da gravação. */}
      <div className="galeria-vidro flex shrink-0 items-center gap-4 border-x-0 border-b-0 px-3 py-1.5">
        <Status rotulo="Subprojetos" valor={String(estrutura.subprojetos.length)} />
        <Status rotulo="Categorias" valor={String(estrutura.subprojetos.reduce((n, s) => n + s.categorias.length, 0))} />
        <Status rotulo="Peças" valor={totalDePecas.toLocaleString("pt-BR")} destaque />
        <span className="ml-auto shrink-0">
          {subindo > 0 ? (
            <span className="flex items-center gap-1.5 font-mono text-[11px] text-ambar">
              <Icone referencia="icones.svg#loader-circle" className="size-3 animate-spin" />
              enviando {subindo} arte(s)…
            </span>
          ) : typeof gravacao === "object" ? (
            <button
              type="button"
              onClick={() => void gravar()}
              title={`${gravacao.erro} — clique para tentar de novo`}
              className="flex items-center gap-1 font-mono text-[11px] text-[var(--danger)]"
            >
              <Icone referencia="icones.svg#triangle-alert" className="size-3" />
              não salvo
            </button>
          ) : gravacao === "salvando" ? (
            <span className="font-mono text-[11px] text-tinta-apagada">salvando…</span>
          ) : (
            <span className="font-mono text-[11px] text-tinta-apagada" title="O projeto e as artes ficam guardados nesta máquina.">
              salvo
            </span>
          )}
        </span>
      </div>

      <input
        ref={entrada}
        type="file"
        accept={TIPOS_DE_ARTE.join(",")}
        className="hidden"
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          e.target.value = "";
          const alvo = alvoDoSeletor.current;
          if (arquivo && alvo) void anexar(alvo, arquivo);
        }}
      />
    </div>
  );
}

// ==================== O SUBPROJETO: CATEGORIAS E PEÇAS ====================

function PainelDoSubprojeto({ sub, aoMexer, aoMexerNaCategoria, aoMexerNaPeca, aoEscolherArte, aoSoltarArte, confirmar }: {
  sub: Subprojeto;
  aoMexer: (mudar: (s: Subprojeto) => Subprojeto) => void;
  aoMexerNaCategoria: (catId: string, mudar: (c: CategoriaDoSubprojeto) => CategoriaDoSubprojeto) => void;
  aoMexerNaPeca: (catId: string, pecaId: string, mudar: (p: PecaDaCategoria) => PecaDaCategoria) => void;
  aoEscolherArte: (catId: string, pecaId: string) => void;
  aoSoltarArte: (catId: string, pecaId: string, arquivo: File) => void;
  confirmar: (texto: string, titulo: string) => Promise<boolean>;
}) {
  // A categoria aberta é local; se ela sumir, cai na primeira.
  const [catAberta, setCatAberta] = useState<string | null>(null);
  const cat = sub.categorias.find((c) => c.id === catAberta) ?? sub.categorias[0] ?? null;
  const [novaCategoria, setNovaCategoria] = useState("");
  const [novaPeca, setNovaPeca] = useState("");
  const usadas = new Set(sub.categorias.map((c) => c.rotulo.toUpperCase()));

  const adicionarCategoria = (rotulo: string) => {
    const limpo = rotulo.trim();
    if (!limpo) return;
    setNovaCategoria("");
    // Categoria repetida criaria dois cartões idênticos.
    if (usadas.has(limpo.toUpperCase())) return;
    const id = novoId("ct");
    aoMexer((s) => ({ ...s, categorias: [...s.categorias, { id, rotulo: limpo, quantidade: 1, pecas: [] }] }));
    setCatAberta(id);
  };

  const adicionarPeca = () => {
    const nome = novaPeca.trim();
    if (!nome || !cat) return;
    setNovaPeca("");
    aoMexerNaCategoria(cat.id, (c) => ({
      ...c,
      pecas: [...c.pecas, { id: novoId("pc"), nome, porItem: 1, cor: c.pecas.length, arte: null }],
    }));
  };

  const apagarCategoria = async (c: CategoriaDoSubprojeto) => {
    const artes = c.pecas.filter((p) => p.arte).length;
    const certeza = await confirmar(
      `A categoria ${c.rotulo} e todas as peças dela${artes > 0 ? ` — incluindo ${artes} arte(s) anexada(s)` : ""} serão removidas. Não dá para desfazer.`,
      "Apagar categoria",
    );
    if (certeza) aoMexer((s) => ({ ...s, categorias: s.categorias.filter((x) => x.id !== c.id) }));
  };

  const apagarPeca = async (p: PecaDaCategoria) => {
    if (!cat) return;
    const certeza = await confirmar(
      `A peça ${p.nome} será removida${p.arte ? ", junto com a arte anexada nela" : ""}. Não dá para desfazer.`,
      "Apagar peça",
    );
    if (certeza) aoMexerNaCategoria(cat.id, (c) => ({ ...c, pecas: c.pecas.filter((x) => x.id !== p.id) }));
  };

  return (
    <div className="space-y-4">
      {/* Cabeçalho do subprojeto */}
      <div className="min-w-0">
        <TextoEditavel
          valor={sub.nome}
          aoMudar={(nome) => aoMexer((s) => ({ ...s, nome }))}
          className="font-titulo text-xl font-semibold text-tinta"
          rotulo="Nome do subprojeto"
        />
        <p className="mt-0.5 mb-0 font-mono text-[11px] text-tinta-apagada">
          {sub.categorias.length} categoria(s) · <span className="text-ambar">{pecasDoSub(sub)} peça(s)</span>
        </p>
      </div>

      {/* Categorias */}
      <section className="rounded-xl border border-linha bg-painel p-3">
        <p className="mt-0 mb-2.5 text-[10px] font-bold tracking-widest text-tinta-apagada uppercase">Categoria</p>

        {sub.categorias.length === 0 ? (
          <p className="mt-0 mb-3 text-xs text-tinta-apagada">Nenhuma categoria. Pode ser P/M/G ou “1,5 × 3 m”.</p>
        ) : (
          <div className="mb-3 grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2">
            {sub.categorias.map((c) => (
              <CartaoDaCategoria
                key={c.id}
                categoria={c}
                ativa={c.id === cat?.id}
                aoEscolher={() => setCatAberta(c.id)}
                aoRenomear={(rotulo) => aoMexerNaCategoria(c.id, (x) => ({ ...x, rotulo }))}
                aoQuantidade={(quantidade) => aoMexerNaCategoria(c.id, (x) => ({ ...x, quantidade }))}
                aoApagar={() => void apagarCategoria(c)}
              />
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={novaCategoria}
            onChange={(e) => setNovaCategoria(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") adicionarCategoria(novaCategoria); }}
            placeholder="Nova categoria…"
            aria-label="Nova categoria"
            className="h-8 w-40 rounded-lg border border-linha bg-painel-suave px-2.5 text-xs text-tinta placeholder:text-tinta-apagada focus:border-[var(--accent-line)] focus:outline-none"
          />
          <Botao
            tamanho="pequeno"
            disabled={!novaCategoria.trim()}
            onClick={() => adicionarCategoria(novaCategoria)}
            icone={<Icone referencia="icones.svg#plus" className="size-3" />}
          >
            Adicionar
          </Botao>
          <span className="ml-1 flex flex-wrap gap-1">
            {CATEGORIAS_COMUNS.filter((r) => !usadas.has(r)).map((rotulo) => (
              <Atalho key={rotulo} rotulo={rotulo} aoClicar={() => adicionarCategoria(rotulo)} />
            ))}
          </span>
        </div>
      </section>

      {/* Peças da categoria aberta */}
      {cat && (
        <section className="rounded-xl border border-linha bg-painel p-3">
          <div className="mb-3 flex flex-wrap items-baseline gap-2 border-b border-linha pb-2.5">
            <span className="font-mono text-sm font-bold text-tinta">{cat.rotulo}</span>
            <span className="font-mono text-[10px] text-tinta-apagada">
              {cat.pecas.length} peça(s) × {cat.quantidade} unidade(s)
            </span>
          </div>

          {cat.pecas.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <Icone referencia="icones.svg#file-text" className="size-5 text-tinta-apagada" />
              <p className="m-0 max-w-xs text-xs text-tinta-apagada">
                Nenhuma peça em <span className="font-mono text-tinta-fraca">{cat.rotulo}</span> — gola, frente, lona…
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
              {cat.pecas.map((p) => (
                <CartaoDaPeca
                  key={p.id}
                  peca={p}
                  aoRenomear={(nome) => aoMexerNaPeca(cat.id, p.id, (x) => ({ ...x, nome }))}
                  aoPorItem={(porItem) => aoMexerNaPeca(cat.id, p.id, (x) => ({ ...x, porItem }))}
                  aoMedida={(medida) => aoMexerNaPeca(cat.id, p.id, (x) => (x.arte ? { ...x, arte: { ...x.arte, ...medida } } : x))}
                  aoApagar={() => void apagarPeca(p)}
                  aoEscolherArte={() => aoEscolherArte(cat.id, p.id)}
                  aoSoltarArte={(arquivo) => aoSoltarArte(cat.id, p.id, arquivo)}
                  aoTirarArte={() => aoMexerNaPeca(cat.id, p.id, (x) => ({ ...x, arte: null }))}
                />
              ))}
            </div>
          )}

          {/* Nova peça */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={novaPeca}
              onChange={(e) => setNovaPeca(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") adicionarPeca(); }}
              placeholder="Nova peça — gola, frente, lona…"
              aria-label="Nova peça"
              className="h-8 min-w-40 flex-1 rounded-lg border border-linha bg-painel-suave px-2.5 text-xs text-tinta placeholder:text-tinta-apagada focus:border-[var(--accent-line)] focus:outline-none"
            />
            <Botao
              tamanho="pequeno"
              disabled={!novaPeca.trim()}
              onClick={adicionarPeca}
              icone={<Icone referencia="icones.svg#plus" className="size-3" />}
            >
              Peça
            </Botao>
          </div>
        </section>
      )}
    </div>
  );
}

function CartaoDaCategoria({ categoria, ativa, aoEscolher, aoRenomear, aoQuantidade, aoApagar }: {
  categoria: CategoriaDoSubprojeto;
  ativa: boolean;
  aoEscolher: () => void;
  aoRenomear: (rotulo: string) => void;
  aoQuantidade: (quantidade: number) => void;
  aoApagar: () => void;
}) {
  return (
    /*
      Clique no cartão escolhe a categoria. É `div` porque tem controles
      dentro — botão dentro de botão é HTML inválido. Os controles internos
      param a propagação.
    */
    <div
      onClick={aoEscolher}
      className={[
        "flex cursor-pointer flex-col gap-2 rounded-xl border p-2.5 transition-colors",
        ativa
          ? "border-[var(--accent-line)] bg-[var(--accent-soft)]"
          : "border-linha bg-painel-suave hover:border-[var(--border)]",
      ].join(" ")}
    >
      <div className="flex min-w-0 items-center justify-between gap-1.5" onClick={(e) => e.stopPropagation()}>
        <TextoEditavel
          valor={categoria.rotulo}
          aoMudar={aoRenomear}
          className={`min-w-0 truncate font-mono text-sm font-bold ${ativa ? "text-ambar" : "text-tinta"}`}
          rotulo={`Nome da categoria ${categoria.rotulo}`}
        />
        <button
          type="button"
          onClick={aoApagar}
          aria-label={`Apagar categoria ${categoria.rotulo}`}
          title="Apagar categoria"
          className="grid size-5 shrink-0 place-items-center rounded text-tinta-apagada transition-colors hover:text-[var(--danger)]"
        >
          <Icone referencia="icones.svg#trash-2" className="size-3" />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
        <span className="text-[10px] text-tinta-apagada">quantidade</span>
        <Contador valor={categoria.quantidade} aoMudar={aoQuantidade} min={0} rotulo={`Quantidade da categoria ${categoria.rotulo}`} />
      </div>

      <button
        type="button"
        onClick={aoEscolher}
        className={`border-t border-linha pt-1.5 text-left font-mono text-[10px] transition-colors ${ativa ? "text-ambar" : "text-tinta-apagada hover:text-ambar"}`}
      >
        {categoria.pecas.length} peça(s)
      </button>
    </div>
  );
}

function CartaoDaPeca({ peca, aoRenomear, aoPorItem, aoMedida, aoApagar, aoEscolherArte, aoSoltarArte, aoTirarArte }: {
  peca: PecaDaCategoria;
  aoRenomear: (nome: string) => void;
  aoPorItem: (porItem: number) => void;
  aoMedida: (medida: { largura?: number; altura?: number }) => void;
  aoApagar: () => void;
  aoEscolherArte: () => void;
  aoSoltarArte: (arquivo: File) => void;
  aoTirarArte: () => void;
}) {
  const [soltando, setSoltando] = useState(false);
  const arte = peca.arte;

  /** Soltar um arquivo em cima da arte anexa (ou troca) direto. */
  const soltura = {
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      setSoltando(true);
    },
    onDragLeave: () => setSoltando(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setSoltando(false);
      const arquivo = e.dataTransfer.files[0];
      if (arquivo) aoSoltarArte(arquivo);
    },
  };

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-linha bg-painel-suave transition-colors hover:border-[var(--border)] animar-entrada">
      {/*
        A miniatura É o botão de trocar: um gesto só, e a peça nunca fica
        vazia no meio — ou tem a arte velha, ou a nova.
      */}
      <button
        type="button"
        {...soltura}
        onClick={aoEscolherArte}
        title={arte ? `Trocar a arte de ${peca.nome}` : `Anexar a arte de ${peca.nome}`}
        className={`group/arte relative flex w-full justify-center border-b border-linha p-2 transition-colors ${soltando ? "bg-[var(--accent-soft)]" : "bg-painel hover:bg-painel-suave"}`}
      >
        {arte ? (
          <div className="relative grid aspect-square w-full max-w-44 place-items-center overflow-hidden rounded-lg">
            {arte.miniatura
              ? <img src={arte.miniatura} alt={arte.nome} className="size-full object-contain" />
              : <span className="font-mono text-[9px] text-tinta-apagada">carregando…</span>}
            <span className="pointer-events-none absolute inset-0 grid place-items-center rounded-lg bg-[color-mix(in_srgb,var(--bg)_70%,transparent)] opacity-0 transition-opacity group-hover/arte:opacity-100">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ambar">
                <Icone referencia="icones.svg#refresh-cw" className="size-3" />
                trocar arte
              </span>
            </span>
          </div>
        ) : (
          <span className="grid aspect-square w-full max-w-44 place-items-center content-center gap-1 rounded-lg border border-dashed border-linha text-tinta-apagada transition-colors group-hover/arte:text-ambar">
            <Icone referencia="icones.svg#plus" className="size-4.5" />
            <span className="text-[10px] font-medium">anexar arquivo</span>
          </span>
        )}
      </button>

      <div className="flex min-h-0 flex-col gap-2 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: corDaPeca(peca.cor) }} />
            <TextoEditavel
              valor={peca.nome}
              aoMudar={aoRenomear}
              className="min-w-0 truncate text-xs font-semibold text-tinta"
              rotulo={`Nome da peça ${peca.nome}`}
            />
          </span>
          <button
            type="button"
            onClick={aoApagar}
            aria-label={`Apagar peça ${peca.nome}`}
            className="grid size-5 shrink-0 place-items-center rounded text-tinta-apagada transition-colors hover:text-[var(--danger)]"
          >
            <Icone referencia="icones.svg#trash-2" className="size-3" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-tinta-apagada">por item</span>
          <Contador valor={peca.porItem} aoMudar={aoPorItem} min={1} rotulo={`Unidades de ${peca.nome} por item`} />
        </div>

        {arte && (
          <>
            {/* A medida real: vem do dpi do arquivo, e dá para corrigir. */}
            <div className="flex items-center gap-1 font-mono text-[10px] text-tinta-apagada">
              <input
                type="number" min="0.1" step="0.1"
                value={arte.largura}
                onChange={(e) => aoMedida({ largura: Number(e.target.value) })}
                aria-label="Largura em cm"
                className={`w-14 rounded border border-linha bg-painel px-1 py-0.5 text-center text-tinta focus:border-[var(--accent-line)] focus:outline-none ${SEM_SETINHAS}`}
              />
              ×
              <input
                type="number" min="0.1" step="0.1"
                value={arte.altura}
                onChange={(e) => aoMedida({ altura: Number(e.target.value) })}
                aria-label="Altura em cm"
                className={`w-14 rounded border border-linha bg-painel px-1 py-0.5 text-center text-tinta focus:border-[var(--accent-line)] focus:outline-none ${SEM_SETINHAS}`}
              />
              cm
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-linha pt-1.5">
              <span className="truncate font-mono text-[9px] text-tinta-apagada">{arte.nome}</span>
              <button
                type="button"
                onClick={aoTirarArte}
                aria-label={`Remover arquivo ${arte.nome}`}
                className="shrink-0 text-[9px] font-semibold text-tinta-apagada transition-colors hover:text-[var(--danger)]"
              >
                remover
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ==================== PEÇAS PEQUENAS ====================

/**
 * Texto que vira campo ao clicar — o `EditableText` do lite. Nome vazio volta
 * ao anterior em silêncio: uma linha sem rótulo seria pior que um repetido.
 */
function TextoEditavel({ valor, aoMudar, className = "", rotulo }: {
  valor: string; aoMudar: (valor: string) => void; className?: string; rotulo: string;
}) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(valor);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editando) { campo.current?.focus(); campo.current?.select(); }
  }, [editando]);
  useEffect(() => { if (!editando) setRascunho(valor); }, [valor, editando]);

  const confirmar = () => {
    const limpo = rascunho.trim();
    if (limpo && limpo !== valor) aoMudar(limpo);
    else setRascunho(valor);
    setEditando(false);
  };

  if (editando) {
    return (
      <input
        ref={campo}
        value={rascunho}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === "Enter") confirmar();
          if (e.key === "Escape") { setRascunho(valor); setEditando(false); }
        }}
        aria-label={rotulo}
        className={`min-w-0 max-w-full rounded border border-[var(--accent)] bg-painel-suave px-1.5 py-0.5 outline-none ${className}`}
      />
    );
  }
  return (
    <button type="button" onClick={() => setEditando(true)} title="Clique para renomear" className="group flex min-w-0 items-center gap-1 text-left">
      <span className={`truncate ${className}`}>{valor}</span>
      <Icone referencia="icones.svg#pencil" className="size-2.5 shrink-0 text-tinta-apagada transition-colors group-hover:text-ambar" />
    </button>
  );
}

/** − número + — o `NumberStepper` do lite. */
function Contador({ valor, aoMudar, min = 1, max = 99999, rotulo }: {
  valor: number; aoMudar: (v: number) => void; min?: number; max?: number; rotulo: string;
}) {
  const prender = (v: number) => Math.max(min, Math.min(max, v));
  const botao = "grid size-6 shrink-0 place-items-center text-tinta-fraca transition-colors hover:bg-[var(--surface-hover)] hover:text-ambar disabled:opacity-30";
  return (
    <div className="inline-flex shrink-0 items-center overflow-hidden rounded-lg border border-linha bg-painel">
      <button type="button" onClick={() => aoMudar(prender(valor - 1))} disabled={valor <= min} aria-label="Diminuir" className={botao}>−</button>
      <input
        type="number" min={min} max={max}
        value={valor}
        aria-label={rotulo}
        onChange={(e) => aoMudar(prender(Number(e.target.value) || min))}
        className={`w-10 border-x border-linha bg-transparent py-0.5 text-center font-mono text-sm text-tinta focus:outline-none ${SEM_SETINHAS}`}
      />
      <button type="button" onClick={() => aoMudar(prender(valor + 1))} disabled={valor >= max} aria-label="Aumentar" className={botao}>+</button>
    </div>
  );
}

function Atalho({ rotulo, aoClicar }: { rotulo: string; aoClicar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      className="rounded-md border border-linha px-2 py-1 font-mono text-[10px] text-tinta-apagada transition-colors hover:border-[var(--accent-line)] hover:text-ambar"
    >
      +{rotulo}
    </button>
  );
}

/** Um par rótulo/valor da barra de status. */
function Status({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <span className="flex shrink-0 items-baseline gap-1.5">
      <span className="text-[9px] font-bold tracking-widest text-tinta-apagada uppercase">{rotulo}</span>
      <span className={`font-mono text-[11px] ${destaque ? "font-bold text-ambar" : "text-tinta-fraca"}`}>{valor}</span>
    </span>
  );
}

// ==================== AS CONTAS ====================

/** Quantas peças um subprojeto dá: soma de quantidade × por item. */
function pecasDoSub(sub: Subprojeto) {
  return sub.categorias.reduce((n, c) => n + c.quantidade * c.pecas.reduce((m, p) => m + p.porItem, 0), 0);
}

/** As peças sem arte do subprojeto, para o aviso: "Frente (M)". */
function pecasSemArte(sub: Subprojeto) {
  return sub.categorias.flatMap((c) => c.pecas.filter((p) => !p.arte).map((p) => `${p.nome} (${c.rotulo})`));
}

/**
 * A super cópia: uma linha por peça com arte, já com a quantidade final.
 * Quantidade zero não vai; peça sem arte não vai (o aviso já disse).
 */
function expandir(estrutura: EstruturaDoProjeto) {
  const varios = estrutura.subprojetos.length > 1;
  return estrutura.subprojetos.flatMap((s) => s.categorias.flatMap((c) => c.pecas
    .filter((p) => p.arte && c.quantidade * p.porItem > 0)
    .map((p) => ({
      nome: `${varios ? `${s.nome} · ` : ""}${p.nome} ${c.rotulo}`,
      url: urlDaArte(p.arte!),
      largura: p.arte!.largura,
      altura: p.arte!.altura,
      quantidade: c.quantidade * p.porItem,
    }))));
}

function miniaturaDaImagem(img: HTMLImageElement): string | null {
  try {
    const fator = Math.min(1, LADO_DA_MINIATURA / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * fator));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * fator));
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/**
 * A miniatura de uma arte que já está no disco, decodificada JÁ no tamanho
 * dela — abrir a arte inteira para depois encolher custava quase 1 s.
 */
async function miniaturaDoBlob(blob: Blob, medidas: { largura: number; altura: number } | null): Promise<string | null> {
  let opcoes: ImageBitmapOptions | undefined;
  if (medidas && medidas.largura > 0 && medidas.altura > 0) {
    const fator = Math.min(1, LADO_DA_MINIATURA / Math.max(medidas.largura, medidas.altura));
    opcoes = {
      resizeWidth: Math.max(1, Math.round(medidas.largura * fator)),
      resizeHeight: Math.max(1, Math.round(medidas.altura * fator)),
      resizeQuality: "medium",
    };
  }
  const bitmap = await createImageBitmap(blob, opcoes);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.toDataURL("image/png");
}
