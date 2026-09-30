/**
 * A BARRA DOS NÓS — a barra de propriedades do Corel, igual no Digitalizar e na
 * Montagem. Só mostra e chama: o que cada botão faz mora no `useEditorDeNos` e
 * nas contas de `motores/edicaoDeNos.js`. Cada botão só acende quando serve
 * para a seleção, e a dica diz o que faz e o atalho.
 */
import { useState } from "react";
import type { EditorDeNos, TipoDeNo } from "./useEditorDeNos";

interface Props {
  editor: EditorDeNos;
  /** Só na Montagem: girar a peça (graus positivos giram no sentido do relógio). */
  aoGirar?: (graus: number) => void;
}

const TIPOS: { tipo: TipoDeNo; rotulo: string; dica: string }[] = [
  { tipo: "canto", rotulo: "Canto", dica: "Canto: as duas alças soltas (ponto de costura)" },
  { tipo: "suave", rotulo: "Suave", dica: "Suave: as duas alças na mesma reta, cada uma do seu tamanho" },
  { tipo: "simetrico", rotulo: "Simétrico", dica: "Simétrico: as duas alças na mesma reta e do mesmo tamanho" },
];

const Separador = () => <span className="mx-1 h-5 w-px shrink-0 bg-linha" />;

export function BarraDosNos({ editor, aoGirar }: Props) {
  const [anguloEscrito, setAnguloEscrito] = useState("");
  const angulo = Number(anguloEscrito.trim().replace(",", "."));
  const anguloValido = anguloEscrito.trim() !== "" && Number.isFinite(angulo) && angulo !== 0;
  const n = editor.selecionados.size;
  const botao = "btn secondary btn-sm";

  return (
    <div className="flex flex-col gap-1 border-b border-linha px-3 py-1.5 text-[0.8rem]">
      <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Barra dos nós">
        <button type="button" className={botao} disabled={!editor.podePor} onClick={editor.porNo}
          title="Pôr um nó no meio de cada trecho entre os selecionados (tecla +)">+ Nó</button>
        <button type="button" className={botao} disabled={!editor.podeApagar} onClick={editor.apagar}
          title="Apagar os nós selecionados; o trecho é refeito perto do desenho de antes (Delete)">− Nó</button>
        <Separador />
        <button type="button" className={botao} disabled={!editor.podeLinha} onClick={() => editor.converter("linha")}
          title="Converter em linha: o trecho fica reto, os nós no lugar">Linha</button>
        <button type="button" className={botao} disabled={!editor.podeCurva} onClick={() => editor.converter("curva")}
          title="Converter em curva: o trecho reto ganha alças, e dá para puxar">Curva</button>
        <Separador />
        {TIPOS.map((t) => (
          <button key={t.tipo} type="button" title={t.dica} disabled={n === 0} aria-pressed={editor.tipoComum === t.tipo}
            className={`btn btn-sm ${editor.tipoComum === t.tipo ? "primary" : "secondary"}`} onClick={() => editor.mudarTipo(t.tipo)}>
            {t.rotulo}
          </button>
        ))}
        <Separador />
        <button type="button" className={botao} disabled={!editor.podeAlinhar} onClick={() => editor.alinhar("horizontal")}
          title="Alinhar na horizontal: a mesma altura do último nó clicado (ou a média)">Alinhar ↔</button>
        <button type="button" className={botao} disabled={!editor.podeAlinhar} onClick={() => editor.alinhar("vertical")}
          title="Alinhar na vertical: a mesma coluna do último nó clicado (ou a média)">Alinhar ↕</button>
        <Separador />
        <button type="button" className={botao} disabled={!editor.podeReduzir} onClick={editor.reduzirUmaVez}
          title="Reduzir nós: tira os que sobram, sem o desenho mudar mais que o controle (sem seleção, a peça inteira)">
          Reduzir nós
        </button>
        <input
          type="range" min={0.2} max={3} step={0.1} value={editor.folga}
          onChange={(e) => editor.reduzirAoVivo(Number(e.target.value))}
          onPointerUp={editor.terminarReducao} onBlur={editor.terminarReducao}
          disabled={!editor.podeReduzir} className="w-28! shrink-0" aria-label="Quanto o desenho pode mudar ao reduzir"
        />
        <span className="w-16 shrink-0 font-mono text-tinta-fraca">
          {editor.comMedida ? `${editor.folga.toFixed(1).replace(".", ",")} mm` : "pouco ↔ muito"}
        </span>
        {aoGirar && (
          <>
            <Separador />
            <button type="button" className={botao} title="Girar a peça 90° para a esquerda" onClick={() => aoGirar(-90)}>↺ 90°</button>
            <button type="button" className={botao} title="Girar a peça 90° para a direita" onClick={() => aoGirar(90)}>↻ 90°</button>
            <input type="text" inputMode="decimal" value={anguloEscrito} placeholder="graus" aria-label="Ângulo para girar, em graus"
              onChange={(e) => setAnguloEscrito(e.target.value)} className="w-16!" />
            <button type="button" className={botao} disabled={!anguloValido}
              onClick={() => { if (anguloValido) aoGirar(angulo); }}>Girar</button>
          </>
        )}
      </div>
      <p className="m-0 text-tinta-fraca" role="status">
        {n > 0 ? `${n} de ${editor.total} nós selecionados` : `${editor.total} nós`}
        {editor.contagem ? ` · ${editor.contagem.antes} → ${editor.contagem.depois} nós` : ""}
        {editor.aviso ? <span className="text-ambar"> · {editor.aviso}</span> : null}
      </p>
    </div>
  );
}
