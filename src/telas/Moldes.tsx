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
 */

import { useCallback, useEffect, useState } from "react";
import { useDialogo } from "../casca/Dialogo";
import { moldesApi, type Molde, type MoldeNaEstante } from "../api/moldes";
import { EditorDeMolde } from "./moldes/EditorDeMolde";
import { EnvioParaEncaixe } from "./moldes/EnvioParaEncaixe";

/** Qual modal está na frente. `null` = só a estante. */
type Aberto =
  | { qual: "editor"; molde: Molde | null }
  | { qual: "envio"; molde: Molde }
  | null;

export function Moldes() {
  const dialogo = useDialogo();
  const [moldes, setMoldes] = useState<MoldeNaEstante[]>([]);
  const [aberto, setAberto] = useState<Aberto>(null);
  const [erro, setErro] = useState("");
  /** O recado de "salvo, mas faltou arquivo em tal tamanho". */
  const [aviso, setAviso] = useState("");

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

  const abrirParaEditar = async (id: number) => {
    try {
      setAberto({ qual: "editor", molde: await moldesApi.abrir(id) });
    } catch {
      setErro("Não achei esse molde.");
    }
  };

  const abrirParaEncaixar = async (id: number) => {
    try {
      setAberto({ qual: "envio", molde: await moldesApi.abrir(id) });
    } catch {
      setErro("Não achei esse molde.");
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
      setAberto(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    // Ver o cabeçalho: `producao.css` é escopada em `:where(.producao)`.
    <div className="producao tela-cheia">
      <section className="card">
        <div className="card-head">
          <div className="card-head-copy">
            <h2>Moldes guardados</h2>
            <p className="hint">
              Cada molde guarda o contorno em centímetros, então volta sempre na medida certa.
            </p>
          </div>
          <button
            type="button"
            className="btn primary"
            onClick={() => { setAviso(""); setAberto({ qual: "editor", molde: null }); }}
          >
            <span aria-hidden="true">+</span> Adicionar molde
          </button>
        </div>

        <details className="ajuda">
          <summary>Que arquivo eu mando para cá?</summary>
          <div className="ajuda-corpo">
            <p>
              O desenho é feito no seu programa (CorelDRAW, Audaces, Illustrator...) e mandado para
              cá em <strong>DXF</strong>, <strong>PLT</strong>, <strong>SVG</strong> ou{" "}
              <strong>PDF</strong> vetorial — são os formatos que trazem o contorno de verdade.
            </p>
          </div>
        </details>

        {erro && <p className="hint error">{erro}</p>}
        {aviso && <p className="hint error">{aviso}</p>}

        <div className="molde-lista">
          {moldes.length === 0 ? (
            <div className="lista-vazia">
              <strong>Nenhum molde guardado ainda</strong>
              <p>Mande o desenho em DXF, PLT, SVG ou PDF e o molde fica pronto para encaixar.</p>
            </div>
          ) : moldes.map((molde) => (
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
                  {molde.tamanhos.map((t) => <span className="etiqueta-tamanho" key={t}>{t}</span>)}
                </div>
              </div>

              <dl className="molde-numeros">
                <div><dt>Peças no molde</dt><dd>{molde.totalPecas}</dd></div>
                <div><dt>Por peça pronta</dt><dd>{molde.pecasPorUnidade}</dd></div>
              </dl>

              <div className="molde-acoes">
                <button type="button" className="btn primary btn-sm" onClick={() => void abrirParaEncaixar(molde.id)}>
                  Encaixar
                </button>
                <button type="button" className="btn secondary btn-sm" onClick={() => void abrirParaEditar(molde.id)}>
                  Editar
                </button>
                <button type="button" className="btn ghost-danger btn-sm" onClick={() => void excluir(molde)}>
                  Excluir
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {aberto?.qual === "editor" && (
        <EditorDeMolde
          // `key`: reabrir para editar outro molde monta um passo a passo novo,
          // em vez de reaproveitar o anterior com as partes do molde de antes.
          key={aberto.molde?.id ?? "novo"}
          molde={aberto.molde}
          aoFechar={() => setAberto(null)}
          aoSalvar={async (recado) => {
            setAberto(null);
            setAviso(recado);
            await carregar();
          }}
        />
      )}

      {aberto?.qual === "envio" && (
        <EnvioParaEncaixe
          key={aberto.molde.id}
          molde={aberto.molde}
          aoFechar={() => setAberto(null)}
          aoRecarregar={(molde) => setAberto({ qual: "envio", molde })}
        />
      )}
    </div>
  );
}
