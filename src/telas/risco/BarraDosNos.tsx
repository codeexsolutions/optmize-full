/**
 * A BARRA DOS NÓS — a barra de propriedades do Corel, numa linha só.
 *
 * Spec de 2026-10-05 (curvas fáceis da Montagem): Liso | Quina | Auto · + Nó |
 * − Nó · Reta | Curva · Alinhar ▾ · Reduzir ▾ · Girar ▾ · Alças · ?. Os três
 * com ▾ abrem um menu pequeno, em vez de ocupar a barra; cada botão diz na dica
 * o atalho. A mesma barra serve o Digitalizar e a Montagem.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { EditorDeNos } from "./useEditorDeNos";

interface Props {
  editor: EditorDeNos;
  aoGirar?: (graus: number) => void;
}

const Separador = () => <span className="mx-1 h-5 w-px shrink-0 bg-linha" />;
const BOTAO = "btn secondary btn-sm";

/** Um botão que abre um painel pequeno embaixo dele; fecha no Esc, no clique fora e quando pedido. */
function MenuDaBarra({ rotulo, dica, desligado, children }: {
  rotulo: string; dica: string; desligado?: boolean; children: (fechar: () => void) => ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    window.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", fora); window.removeEventListener("keydown", esc); };
  }, [aberto]);
  return (
    <div ref={caixa} className="relative">
      <button type="button" className={`${BOTAO} ${aberto ? "primary!" : ""}`} title={dica} disabled={desligado}
        aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
        {rotulo} ▾
      </button>
      {aberto && (
        <div className="absolute top-full left-0 z-30 mt-1 flex items-center gap-1 rounded-lg border border-linha bg-painel p-1.5 shadow-xl shadow-black/40">
          {children(() => setAberto(false))}
        </div>
      )}
    </div>
  );
}

export function BarraDosNos({ editor, aoGirar }: Props) {
  const [anguloEscrito, setAnguloEscrito] = useState("");
  const angulo = Number(anguloEscrito.trim().replace(",", "."));
  const anguloValido = anguloEscrito.trim() !== "" && Number.isFinite(angulo) && angulo !== 0;
  const n = editor.selecionados.size;
  const forma = editor.formaComum;

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-linha px-3 py-1.5 text-[0.8rem]" role="toolbar" aria-label="Barra dos nós">
      <button type="button" disabled={!editor.podeLiso} aria-pressed={forma === "liso"} onClick={editor.tornarLiso}
        className={`btn btn-sm ${forma === "liso" ? "primary" : "secondary"}`}
        title="Liso (L): a curva passa pelo ponto sem quebra, e os puxadores abrem cada lado">Liso</button>
      <button type="button" disabled={!editor.podeQuina} aria-pressed={forma === "quina"} onClick={editor.tornarQuina}
        className={`btn btn-sm ${forma === "quina" ? "primary" : "secondary"}`}
        title="Quina (Q): o ponto vira bico, e cada lado faz o que quiser">Quina</button>
      <button type="button" className={BOTAO} disabled={!editor.podeLiso} onClick={editor.voltarAoAuto}
        title="Automático (A): os dois lados voltam ao natural">Auto</button>
      <Separador />
      <button type="button" className={BOTAO} disabled={!editor.podePor} onClick={editor.porNo}
        title="Pôr um nó no meio de cada trecho entre os selecionados (+)">+ Nó</button>
      <button type="button" className={BOTAO} disabled={!editor.podeApagar} onClick={editor.apagar}
        title="Apagar os nós selecionados; o trecho é refeito perto do desenho de antes (Delete)">− Nó</button>
      <Separador />
      <button type="button" className={BOTAO} disabled={!editor.podeLinha} onClick={() => editor.converter("linha")}
        title="Reta (R): o trecho fica reto, os nós no lugar">Reta</button>
      <button type="button" className={BOTAO} disabled={!editor.podeCurva} onClick={() => editor.converter("curva")}
        title="Curva (C): o trecho reto ganha curva, e dá para puxar">Curva</button>
      <Separador />
      <MenuDaBarra rotulo="Alinhar" dica="Alinhar os nós selecionados (H / Shift+H)" desligado={!editor.podeAlinhar}>
        {(fechar) => (
          <>
            <button type="button" className={BOTAO} onClick={() => { editor.alinhar("horizontal"); fechar(); }}
              title="Na mesma altura do último nó clicado, ou da média (H)">↔ Altura</button>
            <button type="button" className={BOTAO} onClick={() => { editor.alinhar("vertical"); fechar(); }}
              title="Na mesma coluna do último nó clicado, ou da média (Shift+H)">↕ Coluna</button>
          </>
        )}
      </MenuDaBarra>
      <MenuDaBarra rotulo="Reduzir" dica="Reduzir nós: tira os que sobram, sem o desenho mudar mais que o controle (E)" desligado={!editor.podeReduzir}>
        {() => (
          <>
            <button type="button" className={BOTAO} onClick={editor.reduzirUmaVez}
              title="Reduz a seleção, ou a peça inteira sem seleção (E)">Reduzir</button>
            <input
              type="range" min={0.2} max={3} step={0.1} value={editor.folga}
              onChange={(e) => editor.reduzirAoVivo(Number(e.target.value))}
              onPointerUp={editor.terminarReducao} onBlur={editor.terminarReducao}
              className="w-28! shrink-0" aria-label="Quanto o desenho pode mudar ao reduzir"
            />
            <span className="w-16 shrink-0 font-mono text-tinta-fraca">
              {editor.comMedida ? `${editor.folga.toFixed(1).replace(".", ",")} mm` : "pouco ↔ muito"}
            </span>
          </>
        )}
      </MenuDaBarra>
      {aoGirar && (
        <MenuDaBarra rotulo="Girar" dica="Girar a peça inteira ([ e ])">
          {(fechar) => (
            <>
              <button type="button" className={BOTAO} title="90° para a esquerda ([)" onClick={() => aoGirar(-90)}>↺ 90°</button>
              <button type="button" className={BOTAO} title="90° para a direita (])" onClick={() => aoGirar(90)}>↻ 90°</button>
              <input type="text" inputMode="decimal" value={anguloEscrito} placeholder="graus" aria-label="Ângulo para girar, em graus"
                onChange={(e) => setAnguloEscrito(e.target.value)} className="w-16!"
                onKeyDown={(e) => { if (e.key === "Enter" && anguloValido) { aoGirar(angulo); fechar(); } }} />
              <button type="button" className={BOTAO} disabled={!anguloValido}
                onClick={() => { if (anguloValido) { aoGirar(angulo); fechar(); } }}>Girar</button>
            </>
          )}
        </MenuDaBarra>
      )}
      <Separador />
      <button type="button" aria-pressed={editor.alcas} onClick={editor.alternarAlcas}
        className={`btn btn-sm ${editor.alcas ? "primary" : "secondary"}`}
        title="Ajuste fino: as alças do Corel no lugar dos puxadores (mexer numa alça tira o nó do automático)">Alças</button>
      <button type="button" className={BOTAO} onClick={() => editor.abrirAtalhos(true)} title="Os atalhos (?)">?</button>
      <span className="ml-2 text-tinta-fraca" role="status">
        {n > 0 ? `${n} de ${editor.total} nós` : `${editor.total} nós`}
        {editor.contagem ? ` · ${editor.contagem.antes} → ${editor.contagem.depois}` : ""}
        {editor.aviso ? <span className="text-ambar"> · {editor.aviso}</span> : null}
      </span>
    </div>
  );
}
