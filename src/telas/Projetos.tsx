/**
 * ===========================================================================
 * TELA DE PROJETOS — a estante do trabalho que se repete
 * ===========================================================================
 *
 * O trabalho começa numa árvore à esquerda e acontece à direita:
 *
 *   CLIENTES            TIME AZUL / CAMISA 2026
 *   ├─ Time Azul        [Camisa] [Short]           ← subprojetos
 *   │  ├─ Camisa 2026   P ×10  M ×5  G ×2          ← categorias
 *   │  └─ Abrigo        Frente · Costas · Manga    ← peças, com a arte
 *   └─ Padaria Sol
 *
 * O que esta tela NÃO faz, de propósito: aplicar estampa em molde. Isso é a
 * tela de Moldes, e o fluxo é outro — lá a arte é colocada dentro de um
 * contorno; aqui ela já chega colocada.
 *
 * ---------------------------------------------------------------------------
 * VEIO DO OPTMIZE LITE: O DESENHO E, DEPOIS, A ESTRUTURA
 * ---------------------------------------------------------------------------
 *
 * A árvore na lateral, o cabeçalho em versalete com a contagem ao lado, o item
 * que se abre em cascata, a tipografia miúda com os números em mono, o estado
 * vazio com o ícone grande no meio: tudo isso é a tela de Projetos do painel web
 * (`optmize-lite/src/features/projects/ProjectsPage.tsx`), reproduzida aqui.
 *
 * Por dentro do projeto também: subprojetos em abas, categorias com a
 * quantidade pedida e as peças de cada uma, com a arte — o editor do lite, em
 * `galeria/EditorDoProjeto.tsx`. Por fora continua **Cliente → Projeto**, no
 * `dados.db` desta máquina; o CLIENTE ocupa o lugar do "projeto" de lá na
 * árvore (é o que expande) e o PROJETO é o que abre no miolo. Os projetos de
 * antes da estrutura abrem como um subprojeto com uma categoria só, com as
 * mesmas peças — nada guardado se perdeu.
 *
 * Duas diferenças assumidas:
 *
 * - os ícones saem do sprite (`icones.svg`), e não do `lucide-react`. São os
 *   mesmos desenhos do Lucide — o sprite existe para o app instalado não
 *   depender de internet, e trazer o pacote seria uma segunda fonte deles;
 * - as animações são de CSS, e não do `framer-motion`. O que a painel web anima aqui
 *   é a entrada de cada item da lista: é uma transição, não vale uma
 *   dependência a mais dentro do instalador.
 *
 * E uma mudança que veio junto e é melhoria de verdade: o editor deixou de ser
 * um modal por cima da estante e virou a ÁREA PRINCIPAL, como no painel web. O modal
 * cobria a lista, então trocar de projeto era fechar, procurar e abrir de novo.
 *
 * A ida para o Encaixe continua passando pelo controlador, pela `ligacao`: o
 * Encaixe ainda é imperativo. É a última amarra desta tela, e some com ele.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useDialogo } from "../casca/Dialogo";
import { Icone } from "../casca/Icone";
import { BotaoDeIcone } from "../casca/Botao";
import { projetosApi, type Cliente, type Projeto, type ProjetoNaLista } from "../api/projetos";
import { ArquivosDaGaleria } from "./galeria/Arquivos";
import { EditorDoProjeto } from "./galeria/EditorDoProjeto";
import {
  FundoDaGaleria, LateralDaGaleria, useResumoDaGaleria, type AbaDaGaleria, type NavegacaoDaGaleria,
} from "./galeria/Casca";

/** Qual metade da Galeria estava aberta, para voltar a ela. */
const CHAVE_DA_ABA = "optmize.galeria.aba";

function lerAbaGuardada(): AbaDaGaleria {
  try {
    return localStorage.getItem(CHAVE_DA_ABA) === "arquivos" ? "arquivos" : "projetos";
  } catch {
    return "projetos";
  }
}

/**
 * A Galeria tem duas metades, trocadas na lateral como as seções de um drive:
 * os ARQUIVOS (o drive da fábrica, em `galeria/Arquivos.tsx`) e os PROJETOS
 * DA PRODUÇÃO (arte pronta para o encaixe, logo abaixo). A moldura das duas —
 * lateral, armazenamento e o fundo com aurora — é `galeria/Casca.tsx`.
 */
export function Projetos() {
  const [aba, setAba] = useState<AbaDaGaleria>(lerAbaGuardada);
  const [resumo, atualizarResumo] = useResumoDaGaleria();
  const trocarAba = (nova: AbaDaGaleria) => {
    setAba(nova);
    try { localStorage.setItem(CHAVE_DA_ABA, nova); } catch { /* fica só nesta visita */ }
  };
  const nav: NavegacaoDaGaleria = { aba, aoTrocar: trocarAba, resumo, atualizarResumo };

  return aba === "arquivos"
    ? <ArquivosDaGaleria nav={nav} />
    : <ProjetosDaGaleria nav={nav} />;
}

function ProjetosDaGaleria({ nav }: { nav: NavegacaoDaGaleria }) {
  const dialogo = useDialogo();
  /** O cliente cujos projetos aparecem em cartões no miolo (sem projeto aberto). */
  const [clienteNoMiolo, setClienteNoMiolo] = useState<number | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  /** Os projetos de cada cliente, lidos quando a pasta dele abre. */
  const [projetosPorCliente, setProjetosPorCliente] = useState<Record<number, ProjetoNaLista[]>>({});
  const [abertos, setAbertos] = useState<ReadonlySet<number>>(new Set());
  const [projetoAberto, setProjetoAberto] = useState<Projeto | null>(null);
  const ultimaAbertura = useRef(0);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  const carregarClientes = useCallback(async () => {
    try {
      setClientes(await projetosApi.clientes());
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregarClientes(); }, [carregarClientes]);
  useEffect(() => () => { ultimaAbertura.current++; }, []);

  /**
   * Toda ação da árvore passa por aqui.
   *
   * Sem isto, um servidor fora do ar vira uma promessa rejeitada que ninguém
   * pega: no console aparece o erro e na tela não acontece nada — o botão
   * parece simplesmente não funcionar.
   */
  const tentar = async (acao: () => Promise<void>) => {
    try {
      await acao();
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
    nav.atualizarResumo();
  };

  const carregarProjetos = useCallback(async (clienteId: number) => {
    const { projetos } = await projetosApi.projetosDoCliente(clienteId);
    setProjetosPorCliente((antes) => ({ ...antes, [clienteId]: projetos }));
  }, []);

  const alternarCliente = async (cliente: Cliente) => {
    const aberto = abertos.has(cliente.id);
    setAbertos((antes) => {
      const proximo = new Set(antes);
      if (aberto) proximo.delete(cliente.id);
      else proximo.add(cliente.id);
      return proximo;
    });
    if (!aberto) {
      setClienteNoMiolo(cliente.id);
      await tentar(() => carregarProjetos(cliente.id));
    }
  };

  /** O cartão de um cliente, no miolo: abre a pasta dele ali e na árvore. */
  const entrarNoCliente = async (cliente: Cliente) => {
    setClienteNoMiolo(cliente.id);
    setAbertos((antes) => new Set(antes).add(cliente.id));
    await tentar(() => carregarProjetos(cliente.id));
  };

  const abrirProjeto = async (id: number) => {
    const abertura = ++ultimaAbertura.current;
    try {
      const projeto = await projetosApi.abrir(id);
      if (abertura !== ultimaAbertura.current) return;
      setProjetoAberto(projeto);
      setErro("");
    } catch (e) {
      if (abertura === ultimaAbertura.current) setErro(e instanceof Error ? e.message : String(e));
    }
  };

  const novoCliente = async () => {
    const nome = await dialogo.perguntar({
      titulo: "Novo cliente",
      kicker: "PASTA DO CLIENTE",
      texto: "O nome da pasta onde os projetos dele vão ficar.",
      exemplo: "Time Azul",
      confirmar: "Criar",
    });
    if (!nome) return;
    await tentar(async () => {
      await projetosApi.criarCliente(nome);
      await carregarClientes();
    });
  };

  const renomearCliente = async (cliente: Cliente) => {
    const nome = await dialogo.perguntar({
      titulo: "Renomear cliente", kicker: "PASTA DO CLIENTE", valor: cliente.nome, confirmar: "Salvar",
    });
    if (!nome) return;
    await tentar(async () => {
      await projetosApi.renomearCliente(cliente.id, nome);
      await carregarClientes();
    });
  };

  const excluirCliente = async (cliente: Cliente) => {
    const certeza = await dialogo.confirmar(
      "Apagar este cliente apaga todos os projetos e as artes dentro dele. Não tem volta.",
      { titulo: "Excluir cliente", confirmar: "Excluir" },
    );
    if (!certeza) return;
    await tentar(async () => {
      await projetosApi.apagarCliente(cliente.id);
      if (projetoAberto?.cliente?.id === cliente.id) setProjetoAberto(null);
      if (clienteNoMiolo === cliente.id) setClienteNoMiolo(null);
      await carregarClientes();
    });
  };

  const novoProjeto = async (cliente: Cliente) => {
    const nome = await dialogo.perguntar({
      titulo: "Novo projeto",
      kicker: `PASTA DE ${cliente.nome.toUpperCase()}`,
      texto: "O nome deste trabalho, do jeito que você o chama.",
      exemplo: "Camisa Time Azul 2026",
      confirmar: "Criar",
    });
    if (!nome) return;
    await tentar(async () => {
      const novo = await projetosApi.criar(cliente.id, nome);
      setAbertos((antes) => new Set(antes).add(cliente.id));
      await carregarProjetos(cliente.id);
      await carregarClientes();
      await abrirProjeto(novo.id);
    });
  };

  /** Depois de mexer num projeto, a pasta dele precisa refletir a mudança. */
  const recarregarPasta = async () => {
    const clienteId = projetoAberto?.cliente?.id;
    if (clienteId) await tentar(() => carregarProjetos(clienteId));
    await carregarClientes();
  };

  const clienteAberto = clientes.find((c) => c.id === clienteNoMiolo) ?? null;
  const projetosDoMiolo = clienteAberto ? projetosPorCliente[clienteAberto.id] : undefined;

  return (
    <div className="flex h-full overflow-hidden">
      {/* ---------------------------------------------- a árvore, à esquerda */}
      <LateralDaGaleria nav={nav}>
        <div className="ml-4 border-l border-linha py-0.5 pl-1.5">
          {/*
            Falha de carga tem lugar próprio, acima da lista. Sem isto, um erro
            de rede aparecia como "nenhum cliente ainda" — a mensagem mais cara
            possível para quem tem trinta pedidos guardados.
          */}
          {erro && (
            <div className="mb-2 flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] p-2.5">
              <Icone referencia="icones.svg#triangle-alert" className="mt-0.5 size-3.5 shrink-0 text-[var(--danger)]" />
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[11px] leading-relaxed text-[var(--danger)]">{erro}</p>
                <button
                  type="button"
                  onClick={() => void carregarClientes()}
                  className="mt-1 text-[11px] font-semibold text-ambar underline-offset-2 hover:underline"
                >
                  Tentar de novo
                </button>
              </div>
            </div>
          )}

          {carregando ? (
            <p className="m-0 px-2 py-1.5 text-[11px] text-tinta-apagada">carregando…</p>
          ) : clientes.length === 0 && !erro ? (
            <p className="m-0 px-2 py-1.5 text-[11px] text-tinta-apagada">nenhum cliente ainda</p>
          ) : (
            clientes.map((cliente) => (
              <PastaDoCliente
                key={cliente.id}
                cliente={cliente}
                aberto={abertos.has(cliente.id)}
                ativo={projetoAberto?.cliente?.id === cliente.id || (!projetoAberto && clienteNoMiolo === cliente.id)}
                projetos={projetosPorCliente[cliente.id]}
                projetoAbertoId={projetoAberto?.id ?? null}
                aoAlternar={() => void alternarCliente(cliente)}
                aoAbrirProjeto={(id) => void abrirProjeto(id)}
                aoNovoProjeto={() => void novoProjeto(cliente)}
                aoRenomear={() => void renomearCliente(cliente)}
                aoExcluir={() => void excluirCliente(cliente)}
              />
            ))
          )}
        </div>
      </LateralDaGaleria>

      {/* ------------------------------------------- o trabalho, à direita */}
      <FundoDaGaleria>
        {projetoAberto !== null ? (
          <EditorDoProjeto
            // `key`: trocar de projeto monta um editor novo, em vez de
            // reaproveitar o anterior com os campos do projeto de antes.
            key={projetoAberto.id}
            projeto={projetoAberto}
            aoFechar={() => {
              setClienteNoMiolo(projetoAberto.cliente?.id ?? null);
              setProjetoAberto(null);
            }}
            aoMudarOProjeto={recarregarPasta}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-7 pb-16">
            {/* O título, com as migalhas de drive */}
            <nav className="mb-1 flex items-center gap-1 text-xs text-tinta-apagada">
              <button type="button" onClick={() => setClienteNoMiolo(null)} className="rounded-md px-1 py-0.5 hover:bg-[var(--surface-hover)] hover:text-ambar">
                Projetos da produção
              </button>
              {clienteAberto && (
                <>
                  <Icone referencia="icones.svg#chevron-right" className="size-3" />
                  <span className="px-1">{clienteAberto.nome}</span>
                </>
              )}
            </nav>
            <div className="mb-6 flex flex-wrap items-end gap-4">
              <div className="min-w-0 flex-1">
                <h1 className="m-0 truncate font-titulo text-3xl font-semibold tracking-tight text-tinta">
                  {clienteAberto ? clienteAberto.nome : "Clientes"}
                </h1>
                <p className="mt-1 mb-0 text-xs text-tinta-apagada">
                  {clienteAberto
                    ? `${clienteAberto.projetos} projeto(s) — a arte pronta, a medida real e os ajustes do encaixe`
                    : `${clientes.length} cliente(s) — uma pasta por empresa, um projeto por fardamento`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {clienteAberto && (
                  <>
                    <BotaoDeIcone title="Renomear cliente" onClick={() => void renomearCliente(clienteAberto)}>
                      <Icone referencia="icones.svg#pencil" className="size-3.5" />
                    </BotaoDeIcone>
                    <BotaoDeIcone title="Excluir cliente" perigoso onClick={() => void excluirCliente(clienteAberto)}>
                      <Icone referencia="icones.svg#trash-2" className="size-3.5" />
                    </BotaoDeIcone>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => void (clienteAberto ? novoProjeto(clienteAberto) : novoCliente())}
                  className="galeria-novo flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold"
                >
                  <Icone referencia="icones.svg#plus" className="size-4" />
                  {clienteAberto ? "Novo projeto" : "Novo cliente"}
                </button>
              </div>
            </div>

            {clienteAberto === null ? (
              clientes.length === 0 && !carregando ? (
                <VazioDosProjetos
                  titulo="Guarde o fardamento de cada empresa"
                  texto="Cada cliente é uma pasta; dentro dela, um projeto por trabalho. O projeto guarda a arte já finalizada, a medida real e os ajustes do encaixe — repetir o pedido é abrir, dizer quantas unidades e mandar calcular."
                  botao="Novo cliente"
                  aoClicar={() => void novoCliente()}
                />
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
                  {clientes.map((cliente, i) => (
                    <button
                      key={cliente.id}
                      type="button"
                      onClick={() => void entrarNoCliente(cliente)}
                      style={{ "--ordem": i } as CSSProperties}
                      className="galeria-cartao galeria-entra flex items-center gap-3.5 rounded-2xl px-4 py-4 text-left"
                    >
                      <span className="galeria-pasta" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-tinta">{cliente.nome}</span>
                        <span className="block text-[11px] text-tinta-apagada">{cliente.projetos} projeto(s)</span>
                      </span>
                      <Icone referencia="icones.svg#chevron-right" className="size-4 shrink-0 text-tinta-apagada" />
                    </button>
                  ))}
                </div>
              )
            ) : projetosDoMiolo === undefined ? (
              <p className="py-10 text-center text-sm text-tinta-apagada">Carregando…</p>
            ) : projetosDoMiolo.length === 0 ? (
              <VazioDosProjetos
                titulo="Nenhum projeto ainda"
                texto={`Crie o primeiro projeto de ${clienteAberto.nome}: a camisa, o avental, a bandeira — cada trabalho que se repete.`}
                botao="Novo projeto"
                aoClicar={() => void novoProjeto(clienteAberto)}
              />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4">
                {projetosDoMiolo.map((projeto, i) => (
                  <button
                    key={projeto.id}
                    type="button"
                    onClick={() => void abrirProjeto(projeto.id)}
                    style={{ "--ordem": i, "--cor-do-tipo": "var(--accent)" } as CSSProperties}
                    className="galeria-cartao galeria-entra group flex flex-col overflow-hidden rounded-2xl text-left"
                  >
                    <span className="galeria-previa grid aspect-[4/3] place-items-center overflow-hidden">
                      {projeto.capa
                        ? <img src={projeto.capa} alt="" className="size-full object-contain p-3" />
                        : <span className="galeria-pasta scale-150" aria-hidden="true" />}
                    </span>
                    <span className="block min-w-0 px-3.5 py-3">
                      <span className="block truncate text-sm font-medium text-tinta">{projeto.nome}</span>
                      <span className="block text-[11px] text-tinta-apagada">
                        {projeto.pecas} arte(s) · {projeto.pecasPorUnidade} peça(s) por unidade
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </FundoDaGaleria>
    </div>
  );
}

function VazioDosProjetos({ titulo, texto, botao, aoClicar }: {
  titulo: string; texto: string; botao: string; aoClicar: () => void;
}) {
  return (
    <div className="grid place-items-center py-14">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <div className="relative h-24 w-44" aria-hidden="true">
          <span className="galeria-pasta absolute top-5 left-4 scale-[1.5] -rotate-12 opacity-40" />
          <span className="galeria-pasta absolute top-5 right-4 scale-[1.5] rotate-12 opacity-40" />
          <span className="galeria-pasta absolute top-9 left-1/2 -ml-[23px] scale-[2] drop-shadow-[0_20px_40px_rgba(255,83,31,0.45)]" />
        </div>
        <div>
          <p className="m-0 font-titulo text-2xl font-semibold text-tinta">{titulo}</p>
          <p className="mt-2 mb-0 text-sm leading-relaxed text-tinta-fraca">{texto}</p>
        </div>
        <button type="button" onClick={aoClicar} className="galeria-novo flex h-11 items-center gap-2 rounded-full px-6 text-sm font-semibold">
          <Icone referencia="icones.svg#plus" className="size-4" />
          {botao}
        </button>
      </div>
    </div>
  );
}

// ==================== A PASTA DE UM CLIENTE, NA ÁRVORE ====================

function PastaDoCliente({
  cliente, aberto, ativo, projetos, projetoAbertoId,
  aoAlternar, aoAbrirProjeto, aoNovoProjeto, aoRenomear, aoExcluir,
}: {
  cliente: Cliente;
  aberto: boolean;
  ativo: boolean;
  projetos: ProjetoNaLista[] | undefined;
  projetoAbertoId: number | null;
  aoAlternar: () => void;
  aoAbrirProjeto: (id: number) => void;
  aoNovoProjeto: () => void;
  aoRenomear: () => void;
  aoExcluir: () => void;
}) {
  return (
    <div className="mb-1 animar-entrada">
      <div
        className={[
          "group flex items-center gap-1 rounded-lg border px-1.5 py-1.5 transition-colors",
          ativo
            ? "border-[var(--accent-line)] bg-[var(--accent-soft)]"
            : "border-transparent hover:bg-painel-suave",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={aoAlternar}
          aria-label={aberto ? "Recolher projetos" : "Mostrar projetos"}
          title={aberto ? "Recolher projetos" : "Mostrar projetos"}
          className="grid size-5 shrink-0 place-items-center rounded text-tinta-apagada transition-colors hover:text-ambar"
        >
          <Icone
            referencia={aberto ? "icones.svg#chevron-down" : "icones.svg#chevron-right"}
            className="size-3"
          />
        </button>

        {/* A pasta do cliente, aberta quando os projetos dele estão à vista. */}
        <button type="button" onClick={aoAlternar} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <Icone
            referencia={aberto ? "icones.svg#folder-open" : "icones.svg#folder"}
            className={`size-4 shrink-0 ${ativo || aberto ? "text-ambar" : "text-tinta-apagada"}`}
          />
          <span className="min-w-0">
            <span className={`block truncate text-xs font-medium ${ativo ? "text-ambar" : "text-tinta"}`}>
              {cliente.nome}
            </span>
            <span className="block font-mono text-[10px] text-tinta-apagada">
              {cliente.projetos} projeto(s)
            </span>
          </span>
        </button>

        {/*
          As duas ações da pasta só aparecem com o ponteiro em cima, como na
          painel web: a lista fica limpa, e o que se faz o tempo todo (abrir) não
          disputa espaço com o que se faz uma vez. `focus-within` mantém as
          duas alcançáveis pelo teclado.
        */}
        <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={aoRenomear}
            aria-label={`Renomear ${cliente.nome}`}
            title="Renomear cliente"
            className="grid size-6 place-items-center rounded text-tinta-apagada transition-colors hover:bg-[var(--surface-hover)] hover:text-ambar"
          >
            <Icone referencia="icones.svg#pencil" className="size-3" />
          </button>
          <button
            type="button"
            onClick={aoExcluir}
            aria-label={`Apagar ${cliente.nome}`}
            title="Apagar cliente"
            className="grid size-6 place-items-center rounded text-tinta-apagada transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:text-[var(--danger)]"
          >
            <Icone referencia="icones.svg#trash-2" className="size-3" />
          </button>
        </span>
      </div>

      {aberto && (
        <div className="mt-0.5 ml-3 space-y-0.5 border-l border-linha pl-1.5">
          {projetos === undefined ? (
            <p className="px-2 py-1 text-[10px] text-tinta-apagada">carregando…</p>
          ) : projetos.length === 0 ? (
            <p className="px-2 py-1 text-[10px] text-tinta-apagada">nenhum projeto ainda</p>
          ) : (
            projetos.map((projeto) => (
              <button
                key={projeto.id}
                type="button"
                onClick={() => aoAbrirProjeto(projeto.id)}
                className={[
                  "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] transition-colors",
                  projeto.id === projetoAbertoId
                    ? "bg-[var(--accent-soft)] font-medium text-ambar"
                    : "text-tinta-fraca hover:bg-painel-suave hover:text-tinta",
                ].join(" ")}
              >
                <Icone
                  referencia={projeto.id === projetoAbertoId ? "icones.svg#folder-open" : "icones.svg#folder"}
                  className="size-3.5 shrink-0"
                />
                <span className="truncate">{projeto.nome}</span>
              </button>
            ))
          )}

          <button
            type="button"
            onClick={aoNovoProjeto}
            className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-[11px] text-tinta-apagada transition-colors hover:bg-painel-suave hover:text-ambar"
          >
            <Icone referencia="icones.svg#plus" className="size-3 shrink-0" />
            novo projeto
          </button>
        </div>
      )}
    </div>
  );
}
