/**
 * O PAINEL DO ELEMENTO — limpar e baixar.
 *
 * O jeito (Chapado ou Foto), as cores e o juntar sombras do vetor, o tamanho
 * do PNG, e os botões de cada arquivo. O vetor é refeito 300 ms depois da
 * última mexida, no worker, e guardado pelas opções (`cacheDeVetores`).
 */
import { useEffect, useRef, useState } from "react";
import { Botao } from "../../casca/Botao";
import { CORES_DEMAIS, DPI_DA_SAIDA, LADO_DO_4K, nomesUnicos, tamanhoDaSaida } from "../../motores/extrator";
import { baixar, epsDe, pngDe, svgDe, type VetorDe } from "./arquivos";
import { dataUrlDoRecorte } from "./desenho";
import type { Elemento, ResultadoDoVetor } from "./tipos";

type Mudanca = Partial<Pick<Elemento, "jeito" | "cores" | "juntarSombras" | "tamanho">>;

interface Props {
  elemento: Elemento;
  aoMudar: (mudanca: Mudanca) => void;
  aoErro: (texto: string) => void;
  vetorDe: VetorDe;
}

export function PainelDoElemento({ elemento, aoMudar, aoErro, vetorDe }: Props) {
  const [vetor, setVetor] = useState<ResultadoDoVetor | null>(null);
  const [vetorizando, setVetorizando] = useState(false);
  const [previa, setPrevia] = useState<string | null>(null);
  const [baixando, setBaixando] = useState("");
  const [andamento, setAndamento] = useState<{ feitos: number; total: number } | null>(null);
  const controle = useRef<AbortController | null>(null);

  // Trocar de elemento (ou apagar este) desmonta o painel: a ampliação em curso para junto, sem baixar nada.
  useEffect(() => () => controle.current?.abort(), []);

  // O vetor, 300 ms depois da última mexida.
  useEffect(() => {
    if (elemento.jeito !== "chapado") {
      setVetor(null);
      return;
    }
    let vivo = true;
    setVetorizando(true);
    const espera = setTimeout(() => {
      vetorDe(elemento)
        .then((v) => {
          if (!vivo) return;
          setVetor(v);
          if (v.erro) aoErro(v.erro);
        })
        .catch((e: Error) => { if (vivo) aoErro(e.message); })
        .finally(() => { if (vivo) setVetorizando(false); });
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
  }, [elemento, vetorDe, aoErro]);

  // A prévia: o SVG do chapado, ou o próprio recorte da foto. Só o jeito, o
  // recorte e o vetor a refazem (renomear não), e o endereço antigo só é
  // devolvido depois de a imagem nova ter tomado o lugar: revogar na hora
  // deixava a <img> pedir um blob que já não existia.
  const { jeito, recorte } = elemento;
  useEffect(() => {
    if (jeito !== "chapado") {
      setPrevia(dataUrlDoRecorte(recorte, 480));
      return;
    }
    if (!vetor?.svg) {
      setPrevia(null);
      return;
    }
    const url = URL.createObjectURL(svgDe(vetor));
    setPrevia(url);
    return () => { setTimeout(() => URL.revokeObjectURL(url), 2000); };
  }, [jeito, recorte, vetor]);

  const saida = tamanhoDaSaida(elemento.recorte.largura, elemento.recorte.altura, elemento.tamanho);
  const nome = nomesUnicos([elemento.nome])[0]!;
  const chapado = elemento.jeito === "chapado";
  const larguraCm = elemento.tamanho.tipo === "cm" ? elemento.tamanho.larguraCm : 30;

  const baixarComo = async (tipo: "svg" | "eps" | "png") => {
    setBaixando(tipo);
    const c = new AbortController();
    controle.current = c;
    try {
      if (tipo !== "png" && !vetor?.svg) throw new Error("O vetor ainda não ficou pronto.");
      if (tipo === "svg") baixar(svgDe(vetor!), `${nome}.svg`);
      else if (tipo === "eps") baixar(epsDe(vetor!, elemento), `${nome}.eps`);
      else baixar(await pngDe(elemento, vetor, (feitos, total) => setAndamento({ feitos, total }), c.signal), `${nome}.png`);
    } catch (e) {
      if ((e as Error).name !== "AbortError") aoErro((e as Error).message);
    } finally {
      setBaixando("");
      setAndamento(null);
      controle.current = null;
    }
  };

  return (
    <div id="extrator-painel" className="flex flex-col gap-3">
      <div className="grid min-h-40 place-items-center overflow-hidden rounded-[10px] border border-linha bg-[repeating-conic-gradient(#ddd_0_25%,#fff_0_50%)] bg-[length:16px_16px] p-2">
        {previa
          ? <img id="extrator-previa" src={previa} alt={`Prévia de ${elemento.nome}`} className="max-h-72 max-w-full object-contain" />
          : <p className="m-0 text-[0.82rem] text-tinta-fraca">{vetorizando ? "Vetorizando…" : "Sem prévia"}</p>}
      </div>

      <div className="flex gap-1.5" role="group" aria-label="Jeito do elemento">
        <Botao id="extrator-jeito-chapado" tamanho="pequeno" jeito={chapado ? "primario" : "secundario"} onClick={() => aoMudar({ jeito: "chapado" })}>
          Chapado (vetor)
        </Botao>
        <Botao id="extrator-jeito-foto" tamanho="pequeno" jeito={chapado ? "secundario" : "primario"} onClick={() => aoMudar({ jeito: "foto" })}>
          Foto (ampliar)
        </Botao>
      </div>

      {chapado ? (
        <>
          <div className="flex items-center gap-2 text-[0.85rem]">
            <span className="text-tinta-fraca">Cores</span>
            <Botao tamanho="pequeno" jeito="secundario" aria-label="Menos cores" disabled={elemento.cores <= 1} onClick={() => aoMudar({ cores: elemento.cores - 1 })}>−</Botao>
            <span id="extrator-cores" className="w-6 text-center font-mono">{elemento.cores}</span>
            <Botao tamanho="pequeno" jeito="secundario" aria-label="Mais cores" disabled={elemento.cores >= 32} onClick={() => aoMudar({ cores: elemento.cores + 1 })}>+</Botao>
            {vetor && (
              <span className="ml-auto flex gap-1">
                {vetor.camadas.map((c) => <span key={c.cor} title={c.cor} className="size-4 rounded-full border border-linha" style={{ background: c.cor }} />)}
              </span>
            )}
          </div>
          <label className="flex items-center gap-3 text-[0.85rem] text-tinta-fraca">
            <span className="shrink-0">Juntar sombras</span>
            <input type="range" min={0} max={100} step={5} value={elemento.juntarSombras}
              onChange={(e) => aoMudar({ juntarSombras: Number(e.target.value) })} className="min-w-0 flex-1" />
            <span className="w-10 shrink-0 text-right font-mono">{elemento.juntarSombras}</span>
          </label>
          {elemento.cores > CORES_DEMAIS && (
            <p className="m-0 text-[0.82rem] text-ambar">Com mais de {CORES_DEMAIS} cores, isto parece foto: experimente o jeito Foto.</p>
          )}
        </>
      ) : (
        <p className="m-0 text-[0.82rem] text-tinta-fraca">
          A rede de ampliação reconstrói detalhe que a foto não tinha: confira de perto texto pequeno e rosto.
        </p>
      )}

      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0 text-[0.85rem]">
        <legend className="mb-1 p-0 text-tinta-fraca">Tamanho do PNG</legend>
        <label className="flex items-center gap-2">
          <input id="extrator-tamanho-4k" type="radio" name="extrator-tamanho" checked={elemento.tamanho.tipo === "4k"}
            onChange={() => aoMudar({ tamanho: { tipo: "4k" } })} />
          4K (lado maior com {LADO_DO_4K} px)
        </label>
        <label className="flex flex-wrap items-center gap-2">
          <input id="extrator-tamanho-cm" type="radio" name="extrator-tamanho" checked={elemento.tamanho.tipo === "cm"}
            onChange={() => aoMudar({ tamanho: { tipo: "cm", larguraCm } })} />
          Por medida:
          <input id="extrator-largura-cm" type="number" min={1} max={500} step={0.5} value={larguraCm}
            disabled={elemento.tamanho.tipo !== "cm"}
            onChange={(e) => { const v = Number(e.target.value); if (v > 0) aoMudar({ tamanho: { tipo: "cm", larguraCm: v } }); }}
            className="w-20 rounded-md border border-linha bg-painel-suave px-2 py-1" />
          cm de largura, a {DPI_DA_SAIDA} dpi
        </label>
        <p id="extrator-medida-png" className="m-0 font-mono text-[11px] text-tinta-apagada">
          {saida.largura} × {saida.altura} px{saida.cortada ? " (cortado no teto de 80 megapixels)" : ""}
        </p>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        {chapado && (
          <>
            <Botao id="extrator-baixar-svg" jeito="secundario" disabled={!vetor?.svg || Boolean(baixando)} onClick={() => void baixarComo("svg")}>Baixar SVG</Botao>
            <Botao id="extrator-baixar-eps" jeito="secundario" disabled={!vetor?.svg || Boolean(baixando)} onClick={() => void baixarComo("eps")}>Baixar EPS</Botao>
          </>
        )}
        <Botao id="extrator-baixar-png" jeito="primario" disabled={Boolean(baixando) || (chapado && !vetor?.svg)} onClick={() => void baixarComo("png")}>
          Baixar PNG
        </Botao>
      </div>

      {andamento && (
        <div className="flex items-center gap-3">
          <progress id="extrator-andamento" max={Math.max(1, andamento.total)} value={andamento.feitos} className="h-2 flex-1" />
          <span className="font-mono text-[11px] text-tinta-apagada">{andamento.feitos}/{andamento.total}</span>
          <Botao id="extrator-cancelar" tamanho="pequeno" jeito="fantasma" onClick={() => controle.current?.abort()}>Cancelar</Botao>
        </div>
      )}
    </div>
  );
}
