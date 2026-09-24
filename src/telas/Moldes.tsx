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
 * ELA OCUPA A JANELA, E EXPLICA O QUE FAZ
 * ---------------------------------------------------------------------------
 *
 * Era um cartão com título, um "?" fechado e a lista dentro. Duas coisas
 * mudaram, pelo mesmo motivo que a tela de Vetor virou bancada:
 *
 *   A JANELA INTEIRA, sem cabeçalho de página e sem folga em volta. O
 *   cabeçalho repetia a palavra "Moldes" em cima de um cartão chamado "Moldes
 *   guardados", e a folga transformava a estante num cartão flutuando no
 *   preto. Agora a barra do topo fica parada, a estante rola por dentro, e o
 *   botão de adicionar não sai da vista quando a lista cresce.
 *
 *   E A EXPLICAÇÃO SAIU DE DENTRO DO "?". Quem abre esta tela pela primeira
 *   vez precisa saber três coisas — de onde vem o desenho, o que fica
 *   guardado e o que fazer depois — e nenhuma delas cabia num `<details>`
 *   fechado que ninguém clica. Elas agora estão na tira embaixo da barra (uma
 *   linha, sempre à vista) e, por extenso, na estante vazia, que é onde a
 *   pessoa está quando a dúvida existe de verdade.
 *
 * A BUSCA entrou junto: uma estante de trinta moldes sem campo de procurar é
 * uma lista para rolar procurando com o olho, e o nome do molde é justamente o
 * que quem chega aqui já sabe.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useDialogo } from "../casca/Dialogo";
import { moldesApi, type Molde, type MoldeNaEstante } from "../api/moldes";
import { EditorDeMolde } from "./moldes/EditorDeMolde";
import { EnvioParaEncaixe } from "./moldes/EnvioParaEncaixe";
import { useErroEmAlerta } from "../casca/Alerta";

/** Qual modal está na frente. `null` = só a estante. */
type Aberto =
  | { qual: "editor"; molde: Molde | null }
  | { qual: "envio"; molde: Molde }
  | null;

export function Moldes() {
  const dialogo = useDialogo();
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

  return (
    // Ver o cabeçalho: `producao.css` é escopada em `:where(.producao)`.
    <div className="producao flex h-full min-h-0 flex-col bg-fundo">
      {/* ---------------------------------------------------------- A BARRA */}
      <div className="flex min-h-[43px] shrink-0 flex-wrap items-center gap-3 border-b border-linha bg-painel-suave px-3 py-1.5">
        <span className="font-titulo text-[10px] font-bold tracking-[0.16em] text-ambar uppercase">
          MOLDES
        </span>
        <span className="font-mono text-[10px] text-tinta-apagada">
          {moldes.length === 0 ? "nenhum guardado"
            : busca.trim() ? `${filtrados.length} de ${moldes.length}`
              : `${moldes.length} guardado${moldes.length === 1 ? "" : "s"}`}
        </span>

        <span className="ml-auto flex flex-wrap items-center gap-2">
          {moldes.length > 0 && (
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Procurar pelo nome"
              aria-label="Procurar molde"
              className="w-48 rounded-[9px] border border-linha bg-painel px-3 py-1.5 text-[0.82rem] text-tinta outline-none placeholder:text-tinta-apagada focus:border-[var(--accent-line)]"
            />
          )}
          <button
            type="button"
            className="btn primary btn-sm"
            onClick={() => { setAviso(""); trocarAberto({ qual: "editor", molde: null }); }}
          >
            <span aria-hidden="true">+</span> Adicionar molde
          </button>
        </span>
      </div>

      {/*
        A TIRA DO QUE ESTA TELA É.

        Uma linha, sempre à vista, com as três coisas que definem o trabalho
        daqui: de onde vem o desenho, o que fica guardado e para onde ele vai.
        Estava escondida atrás de um "?" que ninguém abria.
      */}
      <p className="m-0 shrink-0 border-b border-linha bg-painel px-3 py-2 text-[0.78rem] leading-relaxed text-tinta-fraca">
        O desenho vem do seu programa em{" "}
        <strong className="font-semibold text-tinta">DXF, PLT, SVG ou PDF vetorial</strong> — o que
        fica guardado aqui é o <strong className="font-semibold text-tinta">contorno em
        centímetros</strong>, e não uma figura, então o molde volta sempre na medida certa. De cada
        molde você manda as peças para o <strong className="font-semibold text-tinta">Encaixe</strong>,
        que as acomoda no tecido.
      </p>

      {/* ---------------------------------------------------------- A ESTANTE */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {aviso && <p className="hint error mt-0!">{aviso}</p>}

        {moldes.length === 0 ? (
          <Vazia />
        ) : filtrados.length === 0 ? (
          <div className="lista-vazia">
            <strong>Nenhum molde com “{busca.trim()}”</strong>
            <p>A busca olha o nome e a observação. Apague o texto para ver a estante inteira.</p>
          </div>
        ) : (
          <div className="molde-lista">
            {filtrados.map((molde) => (
              /*
               * Cada molde é um cartão, não uma linha de tabela: numa tabela o
               * nome disputava peso com o resto da linha. "Encaixar" é o que se
               * faz quase sempre, então é o único botão cheio.
               */
              <article className="molde-linha" key={molde.id}>
                <div className="molde-identidade">
                  <h3 className="molde-nome">{molde.nome}</h3>
                  {molde.observacoes && <p className="molde-obs">{molde.observacoes}</p>}
                  <div className="molde-tamanhos">
                    {molde.tamanhos.length === 0 ? (
                      <span className="text-[0.74rem] text-tinta-apagada">sem tamanho definido</span>
                    ) : molde.tamanhos.map((t) => (
                      <span className="etiqueta-tamanho" key={t} title="Tamanho guardado neste molde">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                {/*
                  Os dois números respondem perguntas diferentes, e por isso
                  cada um tem o seu balão: um é o tamanho do desenho, o outro é
                  quanto vale UMA peça pronta — que é por onde o Encaixe
                  multiplica a quantidade pedida.
                */}
                <dl className="molde-numeros">
                  <div title="Quantas peças o desenho tem ao todo, somando os tamanhos.">
                    <dt>Peças no molde</dt><dd>{molde.totalPecas}</dd>
                  </div>
                  <div title="Quantas destas peças formam uma unidade acabada. É o número que o Encaixe multiplica pela quantidade que você pedir.">
                    <dt>Por peça pronta</dt><dd>{molde.pecasPorUnidade}</dd>
                  </div>
                </dl>

                <div className="molde-acoes">
                  <button
                    type="button"
                    className="btn primary btn-sm"
                    title="Escolher a arte e mandar as peças deste molde para o tecido"
                    onClick={() => void abrirMolde(molde.id, "envio")}
                  >
                    Encaixar
                  </button>
                  <button
                    type="button"
                    className="btn secondary btn-sm"
                    title="Mexer nas peças, nos tamanhos e nos arquivos deste molde"
                    onClick={() => void abrirMolde(molde.id, "editor")}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn ghost-danger btn-sm"
                    title="Apagar o molde e todas as peças dele"
                    onClick={() => void excluir(molde)}
                  >
                    Excluir
                  </button>
                </div>
              </article>
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

/**
 * A ESTANTE VAZIA — onde a explicação importa de verdade.
 *
 * É a primeira coisa que alguém vê ao abrir o programa numa gráfica nova, e a
 * pergunta dessa pessoa não é "como adiciono", é "o que é um molde aqui
 * dentro?". Por isso o caminho inteiro está escrito, em três passos, em vez de
 * uma linha dizendo para mandar um arquivo.
 */
function Vazia() {
  const passos = [
    {
      titulo: "Desenhe fora daqui",
      texto: "No CorelDRAW, Audaces, Illustrator — onde você já trabalha. O molde chega pronto.",
    },
    {
      titulo: "Mande o arquivo",
      texto: "DXF, PLT, SVG ou PDF vetorial. São os formatos que trazem o contorno de verdade; foto e PNG não servem aqui.",
    },
    {
      titulo: "Encaixe no tecido",
      texto: "Guardado, o molde volta sempre na medida — e o Encaixe acomoda as peças no rolo com o melhor aproveitamento.",
    },
  ];

  return (
    <div className="grid h-full place-items-center p-4">
      <div className="w-full max-w-[560px]">
        <p className="m-0 text-center font-titulo text-[1.3rem] font-semibold tracking-[-0.02em] text-tinta">
          A estante está vazia
        </p>
        <p className="mx-auto mt-2 mb-6 max-w-[420px] text-center text-[0.85rem] leading-relaxed text-tinta-fraca">
          Um molde guardado aqui é o contorno das peças em centímetros — não uma imagem. É isso
          que o faz voltar exato, no tamanho certo, todas as vezes.
        </p>

        <ol className="m-0 grid list-none gap-2 p-0">
          {passos.map((passo, i) => (
            <li
              key={passo.titulo}
              className="flex items-start gap-3 rounded-[12px] border border-linha bg-painel-suave px-4 py-3"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] font-mono text-[0.72rem] font-semibold text-ambar">
                {i + 1}
              </span>
              <span className="min-w-0">
                <strong className="block text-[0.88rem] font-semibold text-tinta">{passo.titulo}</strong>
                <span className="mt-0.5 block text-[0.8rem] leading-relaxed text-tinta-fraca">
                  {passo.texto}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
