/**
 * ===========================================================================
 * TELA DE MOLDES — a estante de moldes da produção
 * ===========================================================================
 *
 * O desenho vem pronto de fora, em DXF, PLT, SVG ou PDF. O que fica guardado é
 * o contorno em centímetros, não uma figura — é isso que faz o molde continuar
 * exato: ele volta na tela, vai para o encaixe e sai em PDF sempre na medida.
 *
 * Esta tela é a estante e mais nada. Os dois modais dela moram ao lado:
 *
 *   - `moldes/EditorDeMolde.tsx` — o passo a passo de criar e reeditar;
 *   - `moldes/EnvioParaEncaixe.tsx` — a arte, a prévia e o envio ao tecido.
 *
 * ---------------------------------------------------------------------------
 * ERA IMPERATIVA, E O QUE MUDOU AO SAIR DE LÁ
 * ---------------------------------------------------------------------------
 *
 * Eram ~1.400 linhas dentro de `producao/controlador.js`, com sete variáveis
 * de módulo guardando o que estava na tela (`partesPorTamanho`, `artesPorPapel`,
 * `moldeParaEnviar`, `estampaEmEdicao`…) e um `renderX()` chamado à mão depois
 * de cada mexida — esquecer um deixava a tela mostrando o estado anterior.
 *
 * Duas coisas desceram para lugares compartilhados no caminho, porque o
 * Encaixe também as usa e duas cópias divergiriam:
 * `motores/nomeDeArquivo.js` (o "5x" no nome do arquivo) e
 * `utils/coresDePeca.ts` (as dez cores que marcam as peças).
 *
 * As classes de `producao.css` ficaram, e o `<div className="producao">` em
 * volta existe por causa disso — a folha inteira é escopada em
 * `:where(.producao)`. Ver o cabeçalho de `telas/Projetos.tsx`, que fez a
 * mesma escolha e explica por quê.
 *
 * ---------------------------------------------------------------------------
 * UMA VITRINE, E NÃO UMA LISTA (2026-10-25)
 * ---------------------------------------------------------------------------
 *
 * Cada molde é um cartão com o DESENHO das peças de um tamanho (a `previa` que
 * a estante já traz do servidor), o nome, os tamanhos com a cor deles e uma
 * ação cheia só: "Encaixar", que é o que se faz quase sempre. Montagem, editar
 * e excluir ficam como ícones. A tira de explicação fixa saiu: dizia a mesma
 * coisa toda vez a quem já sabia.
 *
 * A ESTANTE VAZIA MOSTRA UM EXEMPLO. Quem abre a tela pela primeira vez não
 * tem DXF à mão; a camiseta de `moldes/exemplo.ts` vai para a estante com um
 * clique e já abre o envio para o Encaixe — o caminho inteiro, na prática.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDialogo } from "../casca/Dialogo";
import { moldesApi, type Molde, type MoldeNaEstante } from "../api/moldes";
import { EditorDeMolde } from "./moldes/EditorDeMolde";
import { EnvioParaEncaixe } from "./moldes/EnvioParaEncaixe";
import { ImportarGraduado } from "./moldes/ImportarGraduado";
import { useErroEmAlerta } from "../casca/Alerta";
import { Icone } from "../casca/Icone";
import { moldeDeExemplo, NOME_DO_EXEMPLO, previaDoExemplo } from "./moldes/exemplo";

/** Qual modal está na frente. `null` = só a estante. */
type Aberto =
  | { qual: "editor"; molde: Molde | null }
  | { qual: "envio"; molde: Molde }
  | null;

export function Moldes() {
  const dialogo = useDialogo();
  const navegar = useNavigate();
  const [moldes, setMoldes] = useState<MoldeNaEstante[]>([]);
  const [aberto, setAberto] = useState<Aberto>(null);
  const ultimaAbertura = useRef(0);
  const setErro = useErroEmAlerta("Não deu certo nos moldes");
  /** O recado de "salvo, mas faltou arquivo em tal tamanho". */
  const [aviso, setAviso] = useState("");
  const [busca, setBusca] = useState("");

  const carregar = useCallback(async () => {
    try {
      setMoldes(await moldesApi.estante());
      setErro("");
    } catch (e) {
      setMoldes([]);
      setErro(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => () => { ultimaAbertura.current++; }, []);

  const trocarAberto = (proximo: Aberto) => {
    ultimaAbertura.current++;
    setAberto(proximo);
  };

  const abrirMolde = async (id: number, qual: "editor" | "envio") => {
    const abertura = ++ultimaAbertura.current;
    try {
      const molde = await moldesApi.abrir(id);
      if (abertura !== ultimaAbertura.current) return;
      setAberto({ qual, molde });
      setErro("");
    } catch {
      if (abertura === ultimaAbertura.current) setErro("Não achei esse molde.");
    }
  };

  const excluir = async (molde: MoldeNaEstante) => {
    const certeza = await dialogo.confirmar(
      `O molde "${molde.nome}" e suas peças serão excluídos.`,
      { titulo: "Excluir molde", confirmar: "Excluir molde" },
    );
    if (!certeza) return;
    try {
      await moldesApi.apagar(molde.id);
      trocarAberto(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  /*
   * A busca casa com o nome e com a observação — quem procura "gola v" pode
   * ter escrito isso em qualquer um dos dois.
   */
  const filtrados = busca.trim()
    ? moldes.filter((m) => `${m.nome} ${m.observacoes || ""}`.toLowerCase()
      .includes(busca.trim().toLowerCase()))
    : moldes;

  /** Põe na estante a camiseta de exemplo e já abre o envio dela. */
  const usarExemplo = async () => {
    try {
      const { id } = await moldesApi.criar(moldeDeExemplo());
      await carregar();
      void abrirMolde(id, "envio");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  const novoMolde = () => { setAviso(""); trocarAberto({ qual: "editor", molde: null }); };

  return (
    <div className="producao flex h-full min-h-0 flex-col bg-fundo">
      {/* ---------------------------------------------------------- O TOPO */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-linha px-5 py-3.5">
        <div className="min-w-0">
          <h1 className="m-0 font-titulo text-[1.25rem] leading-tight text-tinta">Moldes</h1>
          <p className="m-0 mt-0.5 text-[0.78rem] text-tinta-apagada">
            {moldes.length === 0 ? "Escolha o molde, diga quantas peças de cada tamanho e mande para o Encaixe."
              : busca.trim() ? `${filtrados.length} de ${moldes.length} moldes`
                : `${moldes.length} molde${moldes.length === 1 ? "" : "s"} na estante`}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {moldes.length > 0 && (
            <div className="relative w-56">
              <Icone referencia="icones.svg#search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-tinta-apagada" />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Procurar molde"
                aria-label="Procurar molde"
                className="m-0! h-9 w-full rounded-full! border border-linha bg-painel py-0! pr-3! pl-9! text-[0.84rem] text-tinta outline-none placeholder:text-tinta-apagada focus:border-[var(--accent-line)]"
              />
            </div>
          )}
          <ImportarGraduado />
          <button type="button" className="btn primary btn-sm" onClick={novoMolde}>
            <Icone referencia="icones.svg#plus" className="size-4" />
            Adicionar molde
          </button>
        </div>
      </header>

      {/* ---------------------------------------------------------- A ESTANTE */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {aviso && <p className="hint error mt-0!">{aviso}</p>}

        {moldes.length === 0 ? (
          <Vazia aoUsarExemplo={() => void usarExemplo()} aoAdicionar={novoMolde} />
        ) : filtrados.length === 0 ? (
          <div className="grid place-items-center py-16 text-center">
            <Icone referencia="icones.svg#search-x" className="size-8 text-tinta-apagada" />
            <p className="m-0 mt-3 text-[0.95rem] text-tinta">Nenhum molde com “{busca.trim()}”</p>
            <p className="m-0 mt-1 text-[0.8rem] text-tinta-apagada">A busca olha o nome e a observação.</p>
          </div>
        ) : (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
            {filtrados.map((molde) => (
              <CartaoDoMolde
                key={molde.id}
                molde={molde}
                aoEncaixar={() => void abrirMolde(molde.id, "envio")}
                aoMontar={() => navegar(`/montagem?molde=${molde.id}`)}
                aoEditar={() => void abrirMolde(molde.id, "editor")}
                aoExcluir={() => void excluir(molde)}
              />
            ))}
          </div>
        )}
      </div>

      {aberto?.qual === "editor" && (
        <EditorDeMolde
          // `key`: reabrir para editar outro molde monta um passo a passo novo,
          // em vez de reaproveitar o anterior com as partes do molde de antes.
          key={aberto.molde?.id ?? "novo"}
          molde={aberto.molde}
          aoFechar={() => trocarAberto(null)}
          aoSalvar={async (recado) => {
            trocarAberto(null);
            setAviso(recado);
            await carregar();
          }}
        />
      )}

      {aberto?.qual === "envio" && (
        <EnvioParaEncaixe
          key={aberto.molde.id}
          molde={aberto.molde}
          aoFechar={() => trocarAberto(null)}
          aoRecarregar={(molde) => setAberto((atual) =>
            atual?.qual === "envio" && atual.molde.id === molde.id ? { qual: "envio", molde } : atual)}
        />
      )}
    </div>
  );
}

type Previa = NonNullable<MoldeNaEstante["previa"]>;

/**
 * O CARTÃO DO MOLDE — o desenho das peças em cima, o nome e os tamanhos, e
 * "Encaixar" como a única ação cheia: é o que se faz quase sempre. Montagem,
 * editar e excluir ficam como ícones, à mão sem disputar com ela.
 */
function CartaoDoMolde({ molde, aoEncaixar, aoMontar, aoEditar, aoExcluir }: {
  molde: MoldeNaEstante;
  aoEncaixar: () => void;
  aoMontar: () => void;
  aoEditar: () => void;
  aoExcluir: () => void;
}) {
  const rascunho = molde.situacao === "rascunho";
  return (
    <article data-molde={molde.id} className="group flex flex-col overflow-hidden rounded-2xl border border-linha bg-painel transition-colors hover:border-[var(--accent-line)]">
      <button
        type="button"
        onClick={rascunho ? aoMontar : aoEncaixar}
        title={rascunho ? "Continuar a montagem" : "Encaixar este molde"}
        className="relative block h-36 w-full border-0 border-b border-linha bg-painel-suave p-4"
      >
        <MiniaturaDoMolde pecas={molde.previa || []} />
        {rascunho && (
          <span className="absolute top-2 left-2 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[0.68rem] text-ambar">
            rascunho
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="min-w-0">
          <h3 className="m-0 truncate text-[0.95rem] text-tinta" title={molde.nome}>{molde.nome}</h3>
          {molde.observacoes && (
            <p className="m-0 mt-0.5 line-clamp-2 text-[0.75rem] leading-snug text-tinta-apagada">{molde.observacoes}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-1">
          {molde.tamanhos.length === 0 ? (
            <span className="text-[0.74rem] text-tinta-apagada">sem tamanho definido</span>
          ) : molde.tamanhos.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-md border border-linha px-1.5 py-0.5 font-mono text-[0.7rem] text-tinta-fraca">
              {molde.cores?.[t] && <span className="inline-block size-1.5 rounded-full" style={{ background: molde.cores[t] }} />}
              {t}
            </span>
          ))}
        </div>

        <p className="m-0 text-[0.74rem] text-tinta-apagada"
          title="Quantas peças de tecido saem de uma peça pronta — é o que o Encaixe multiplica pela quantidade pedida.">
          {molde.pecasPorUnidade} peça{molde.pecasPorUnidade === 1 ? "" : "s"} por unidade · {molde.totalPecas} no molde
        </p>

        <div className="mt-auto flex items-center gap-1 pt-1">
          <button type="button" className="btn primary btn-sm mr-auto" onClick={rascunho ? aoMontar : aoEncaixar}>
            <Icone referencia={rascunho ? "icones.svg#layers" : "icones.svg#scissors"} className="size-4" />
            {rascunho ? "Continuar montagem" : "Encaixar"}
          </button>
          {!rascunho && <BotaoIcone titulo="Montagem: piques, fio, margem e PDF" icone="icones.svg#layers" aoClicar={aoMontar} />}
          <BotaoIcone titulo="Editar peças e tamanhos" icone="icones.svg#pencil" aoClicar={aoEditar} />
          <BotaoIcone titulo="Excluir o molde" icone="icones.svg#trash-2" aoClicar={aoExcluir} perigoso />
        </div>
      </div>
    </article>
  );
}

function BotaoIcone({ titulo, icone, aoClicar, perigoso = false }: {
  titulo: string; icone: string; aoClicar: () => void; perigoso?: boolean;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      onClick={aoClicar}
      className={[
        "grid size-8 place-items-center rounded-full border-0 bg-transparent text-tinta-apagada transition-colors",
        perigoso
          ? "hover:bg-[color-mix(in_srgb,var(--danger)_18%,transparent)] hover:text-[var(--danger)]"
          : "hover:bg-[var(--surface-hover)] hover:text-tinta",
      ].join(" ")}
    >
      <Icone referencia={icone} className="size-4" />
    </button>
  );
}

/**
 * As peças de um tamanho lado a lado, na proporção de verdade entre elas: a
 * manga sai menor que a frente, como no tecido. Sem prévia (molde sem
 * contorno), um ícone no lugar.
 */
function MiniaturaDoMolde({ pecas }: { pecas: Previa }) {
  if (pecas.length === 0) {
    return (
      <span className="grid size-full place-items-center text-tinta-apagada">
        <Icone referencia="icones.svg#shapes" className="size-8" />
      </span>
    );
  }
  const vao = Math.max(...pecas.map((p) => Math.max(p.largura, p.altura))) * 0.08;
  let x = 0;
  const postas = pecas.map((p) => {
    const aqui = x;
    x += p.largura + vao;
    return { ...p, x: aqui };
  });
  const largura = Math.max(1, x - vao);
  const altura = Math.max(1, ...pecas.map((p) => p.altura));
  return (
    <svg viewBox={`${-vao / 2} ${-vao / 2} ${largura + vao} ${altura + vao}`} className="size-full" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {postas.map((p, i) => (
        <path
          key={i}
          d={`M${p.contorno.map(([px, py]) => `${(px + p.x).toFixed(1)},${py.toFixed(1)}`).join("L")}Z`}
          vectorEffect="non-scaling-stroke"
          className="fill-[var(--accent-soft)] stroke-[var(--accent)] transition-[fill] group-hover:fill-[color-mix(in_srgb,var(--accent)_28%,transparent)]"
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

/**
 * A ESTANTE VAZIA — com um molde de exemplo pronto para usar.
 *
 * Quem abre a tela pela primeira vez não tem DXF à mão, e uma estante vazia
 * com três parágrafos não mostra nada. Aqui ela mostra o que um molde É (o
 * desenho da camiseta de exemplo), e um clique põe o exemplo na estante e
 * abre o envio para o Encaixe — o caminho inteiro, na prática.
 */
function Vazia({ aoUsarExemplo, aoAdicionar }: { aoUsarExemplo: () => void; aoAdicionar: () => void }) {
  const passos = [
    { icone: "icones.svg#file-up", titulo: "Mande o arquivo", texto: "DXF, PLT, SVG ou PDF vetorial — do CorelDRAW, Audaces ou Illustrator." },
    { icone: "icones.svg#ruler", titulo: "Diga as quantidades", texto: "Quantas peças de cada tamanho. O molde volta sempre na medida certa." },
    { icone: "icones.svg#scissors", titulo: "Encaixe no tecido", texto: "As peças vão para o Encaixe, que acomoda tudo no rolo." },
  ];
  return (
    <div className="mx-auto grid max-w-[880px] gap-6 py-4 md:grid-cols-[1.1fr_1fr] md:items-center">
      <div className="overflow-hidden rounded-2xl border border-linha bg-painel">
        <div className="h-48 border-b border-linha bg-painel-suave p-5">
          <MiniaturaDoMolde pecas={previaDoExemplo()} />
        </div>
        <div className="p-4">
          <p className="m-0 text-[0.95rem] text-tinta">{NOME_DO_EXEMPLO}</p>
          <p className="m-0 mt-0.5 text-[0.76rem] text-tinta-apagada">Frente, costas, manga e gola · P, M, G e GG</p>
          <button type="button" className="btn primary btn-sm mt-3" onClick={aoUsarExemplo}>
            <Icone referencia="icones.svg#sparkles" className="size-4" />
            Usar este exemplo
          </button>
        </div>
      </div>

      <div>
        <p className="m-0 font-titulo text-[1.2rem] text-tinta">Sua estante ainda está vazia</p>
        <p className="m-0 mt-1.5 text-[0.84rem] leading-relaxed text-tinta-fraca">
          Teste com a camiseta de exemplo ou traga os moldes que você já usa.
        </p>
        <ol className="m-0 mt-4 grid list-none gap-3 p-0">
          {passos.map((p) => (
            <li key={p.titulo} className="flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-ambar">
                <Icone referencia={p.icone} className="size-4" />
              </span>
              <span className="min-w-0">
                <strong className="block text-[0.86rem] text-tinta">{p.titulo}</strong>
                <span className="block text-[0.78rem] leading-relaxed text-tinta-apagada">{p.texto}</span>
              </span>
            </li>
          ))}
        </ol>
        <button type="button" className="btn secondary btn-sm mt-5" onClick={aoAdicionar}>
          <Icone referencia="icones.svg#plus" className="size-4" />
          Adicionar meu molde
        </button>
      </div>
    </div>
  );
}
