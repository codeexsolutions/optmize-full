// src/telas/montagem/BarraDaMontagem.tsx
/**
 * A BARRA DA MONTAGEM — o nome, o estado da gravação e as saídas.
 *
 * PDF, SVG e Encaixar esperam a gravação terminar e saem do que está NO
 * BANCO: o arquivo baixado tem de ser o mesmo molde que o Encaixe vai
 * receber. Com algo sem salvar, os botões mandam gravar antes; se a gravação
 * falhar, não saem.
 *
 * ENCAIXAR só existe para molde concluído. O rascunho é o molde ainda sendo
 * identificado — peças sem papel no Encaixe viram "outro, outro, outro", e a
 * estampa não acha nenhuma.
 */
import { useEffect, useState } from "react";
import { Icone } from "../../casca/Icone";
import { useDialogo } from "../../casca/Dialogo";
import { useErroEmAlerta } from "../../casca/Alerta";
import { moldesApi, type Molde } from "../../api/moldes";
import { riscoApi } from "../../api/risco";
import { arranjar, desenhoDaPeca, lerLinhaMm, pecaParaGravar, svgDaMontagem } from "../../motores/montagem";
import { EnvioParaEncaixe } from "../moldes/EnvioParaEncaixe";
import type { MoldeEmMontagem } from "./useMoldeEmMontagem";

interface Props {
  molde: MoldeEmMontagem; moldeId: number; aoTrocar: () => void; aoIrParaPeca: (i: number) => void;
  /** O tamanho à mostra na mesa: é o que o PDF e o SVG levam, a não ser que se peça todos. */
  tamanhoAtivo: string;
}

const ROTULO_DA_GRAVACAO = { salvo: "salvo", pendente: "salvando em instantes…", salvando: "salvando…", erro: "não salvo" } as const;

function baixar(blob: Blob, arquivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = arquivo;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function BarraDaMontagem({ molde, moldeId, aoTrocar, aoIrParaPeca, tamanhoAtivo }: Props) {
  const dialogo = useDialogo();
  const setErro = useErroEmAlerta("Não deu certo na Montagem");
  const [ocupado, setOcupado] = useState("");
  const [envio, setEnvio] = useState<Molde | null>(null);

  // PDF e SVG: o tamanho marcado, ou a grade inteira.
  const [todos, setTodos] = useState(false);
  // A linha em volta da peça, como texto: aceita vírgula, e só muda o molde no blur ou no Enter
  // (um número de três teclas não enche três passos do desfazer).
  const [linhaEscrita, setLinhaEscrita] = useState(String(molde.linha).replace(".", ","));
  useEffect(() => { setLinhaEscrita(String(molde.linha).replace(".", ",")); }, [molde.linha]);
  const linhaLida = lerLinhaMm(linhaEscrita);
  const confirmarLinha = () => {
    if (linhaLida !== null && linhaLida !== molde.linha) molde.mudarLinha(linhaLida);
  };
  const desenhos = () => arranjar(molde.pecas
    .filter((p) => todos || molde.tamanhos.length < 2 || p.tamanho === tamanhoAtivo)
    .map((p) => desenhoDaPeca(pecaParaGravar(p).peca, molde.linha / 10)));
  const arquivo = (ext: string) => `${(molde.nome || "molde").replace(/[\\/:*?"<>|]+/g, "_")}-molde.${ext}`;

  /** Grava o que faltar; se não der, mostra por quê e devolve `false`. */
  const garantirSalvo = async () => {
    const ok = await molde.gravar();
    if (!ok && molde.problema?.peca != null) aoIrParaPeca(molde.problema.peca);
    return ok;
  };

  const pdf = async () => {
    setOcupado("Gerando o PDF…");
    try {
      if (!(await garantirSalvo())) return;
      baixar(await riscoApi.pdf(molde.nome, desenhos()), arquivo("pdf"));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado("");
    }
  };

  const svg = async () => {
    if (!(await garantirSalvo())) return;
    baixar(new Blob([svgDaMontagem(desenhos(), molde.nome)], { type: "image/svg+xml" }), arquivo("svg"));
  };

  const concluir = async () => {
    const semNome = molde.pecas.findIndex((p) => p.papel === "outro" && !p.nome);
    if (semNome >= 0) {
      aoIrParaPeca(semNome);
      const seguir = await dialogo.confirmar(
        `A peça ${semNome + 1} está como "outro" e sem nome: a estampa não vai achá-la pelo papel. Concluir assim mesmo?`,
      );
      if (!seguir) return;
    }
    setOcupado("Concluindo…");
    try {
      if (await molde.gravar("pronto")) await dialogo.avisar("Molde concluído. Ele já está na estante e pode ir ao Encaixe.");
      else if (molde.problema?.peca != null) aoIrParaPeca(molde.problema.peca);
    } finally {
      setOcupado("");
    }
  };

  const encaixar = async () => {
    if (!(await garantirSalvo())) return;
    try {
      setEnvio(await moldesApi.abrir(moldeId));
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  const podeSair = molde.gravacao !== "salvando" && !ocupado;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-linha px-3 py-2">
        <button type="button" className="btn secondary btn-sm" onClick={aoTrocar} title="Montar outro molde">
          <Icone referencia="icones.svg#arrow-left" className="size-4" />
        </button>
        <input
          type="text" value={molde.nome} onChange={(e) => molde.renomear(e.target.value)}
          className="w-[260px]! font-semibold" aria-label="Nome do molde"
        />
        {molde.situacao === "rascunho" && <span className="etiqueta-tamanho">rascunho</span>}
        <label
          className="flex items-center gap-1 text-[0.8rem] text-tinta-fraca"
          title="Traço preto em volta de cada peça, no Encaixe e no PDF/SVG. De 0 a 10 mm; 0 = sem linha."
        >
          Linha em volta (mm)
          <input
            type="text" inputMode="decimal" className="w-14!" aria-label="Linha em volta (mm)"
            value={linhaEscrita} aria-invalid={linhaLida === null}
            onChange={(e) => setLinhaEscrita(e.target.value)}
            onBlur={confirmarLinha}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          />
        </label>
        <span className={`text-[0.8rem] ${molde.gravacao === "erro" ? "text-[#ff4d4d]" : "text-tinta-fraca"}`}>
          {ROTULO_DA_GRAVACAO[molde.gravacao]}
          {molde.gravacao === "erro" && molde.problema ? ` — ${molde.problema.texto}` : ""}
        </span>
        {molde.gravacao === "erro" && (
          <button type="button" className="btn secondary btn-sm" onClick={() => void molde.gravar()}>Tentar de novo</button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" className="btn secondary btn-sm" disabled={!molde.podeDesfazer} onClick={molde.desfazer} title="Desfazer (Ctrl+Z)">
            <Icone referencia="icones.svg#rotate-ccw" className="size-4" />
            Desfazer
          </button>
          <button type="button" className="btn secondary btn-sm" disabled={!molde.podeRefazer} onClick={molde.refazer} title="Refazer (Ctrl+Y)">
            <Icone referencia="icones.svg#rotate-cw" className="size-4" />
            Refazer
          </button>
          {molde.tamanhos.length > 1 && (
            <select
              value={todos ? "todos" : "este"}
              onChange={(e) => setTodos(e.target.value === "todos")}
              className="w-auto!"
              aria-label="Tamanhos do PDF e do SVG"
            >
              <option value="este">Tamanho {tamanhoAtivo}</option>
              <option value="todos">Todos os tamanhos</option>
            </select>
          )}
          <button type="button" className="btn secondary btn-sm" disabled={!podeSair} onClick={() => void pdf()}
            title={'O PDF sai em tamanho real: imprima em 100% / "tamanho real", senão o visualizador reduz para caber na folha.'}>
            <Icone referencia="icones.svg#download" className="size-4" />
            {ocupado === "Gerando o PDF…" ? ocupado : "PDF"}
          </button>
          <button type="button" className="btn secondary btn-sm" disabled={!podeSair} onClick={() => void svg()}>
            <Icone referencia="icones.svg#download" className="size-4" />
            SVG
          </button>
          {molde.situacao === "rascunho" ? (
            <button type="button" className="btn primary btn-sm" disabled={!podeSair} onClick={() => void concluir()}>
              Concluir molde
            </button>
          ) : (
            <button type="button" className="btn primary btn-sm" disabled={!podeSair} onClick={() => void encaixar()}>
              Encaixar
            </button>
          )}
        </div>
      </div>
      {envio && (
        <EnvioParaEncaixe molde={envio} aoFechar={() => setEnvio(null)} aoRecarregar={setEnvio} />
      )}
    </>
  );
}
