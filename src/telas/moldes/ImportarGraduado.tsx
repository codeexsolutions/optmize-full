/**
 * IMPORTAR O MOLDE GRADUADO — o PLT da Audaces com todos os tamanhos.
 *
 * Ver docs/superpowers/specs/2026-10-05-importar-molde-graduado-design.md. O
 * botão abre o seletor (`.plt`, e o `.adsx` ou o `.ads` do mesmo modelo, juntos):
 *
 *   - com o `.adsx`, cada contorno é casado com a sua peça e o seu tamanho pela
 *     medida (`casarComOGabarito`), e os nomes vêm de lá;
 *   - sem ele, os tamanhos são agrupados pela forma (`agruparTamanhos`) e a
 *     grade é perguntada: os nomes do menor para o maior, e o base;
 *
 * e antes de criar vem a CONFERÊNCIA — cada peça com os tamanhos sobrepostos nas
 * cores da grade —, porque sem o `.adsx` o agrupamento acerta 42 de 67 peças nos
 * modelos reais. Criar grava um rascunho e abre a Montagem nele.
 */
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { moldesApi } from "../../api/moldes";
import { lerAdsx } from "../../motores/audacesAdsx";
import { resumoDoAds } from "../../motores/audacesAds";
import {
  agruparTamanhos, casarComOGabarito, lacosDoPLT, moldeGraduado, pecasDoAgrupamento,
} from "../../motores/pltGraduado";
import { PALETA } from "../../motores/tamanhos";
import { adivinharPapel } from "./vocabulario";

type Laco = { pontos: { x: number; y: number }[]; largura: number; altura: number; area: number };
type Peca = { nome: string; quantidade: number; porTamanho: Record<string, Laco>; faltam: string[] };

/** Os nomes de sempre, do menor para o maior. */
const GRADE_PADRAO = ["PP", "P", "M", "G", "GG", "XG", "EXG", "XXG"];
function gradePadrao(n: number): string[] {
  if (n <= 4) return ["P", "M", "G", "GG"].slice(0, n);
  return GRADE_PADRAO.slice(0, n).length === n ? GRADE_PADRAO.slice(0, n) : Array.from({ length: n }, (_, i) => `T${i + 1}`);
}

/** O PLT como texto de 8 bits: o PE (comprimido) usa bytes acima de 127. */
async function textoDoPlt(arquivo: File): Promise<string> {
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  let texto = "";
  for (let i = 0; i < bytes.length; i += 8192) texto += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return texto;
}

/** Os tamanhos da peça sobrepostos, cada um na cor da grade. */
function Miniatura({ peca, grade }: { peca: Peca; grade: string[] }) {
  const distintos = grade.map((t, i) => ({ t, i, l: peca.porTamanho[t] }))
    .filter((x, k, todos) => x.l && todos.findIndex((o) => o.l === x.l) === k);
  const pontos = distintos.flatMap((x) => x.l!.pontos);
  if (pontos.length === 0) return <div className="size-20" />;
  const x0 = Math.min(...pontos.map((p) => p.x)), x1 = Math.max(...pontos.map((p) => p.x));
  const y0 = Math.min(...pontos.map((p) => p.y)), y1 = Math.max(...pontos.map((p) => p.y));
  const lado = Math.max(x1 - x0, y1 - y0) || 1;
  return (
    <svg viewBox={`${x0 - lado * 0.05} ${y0 - lado * 0.05} ${lado * 1.1} ${lado * 1.1}`} className="size-20 shrink-0 rounded-lg bg-painel">
      {distintos.map((x) => (
        <polygon key={x.t} points={x.l!.pontos.map((p) => `${p.x},${p.y}`).join(" ")} fill="none"
          stroke={distintos.length === 1 ? "#cccccc" : PALETA[x.i % PALETA.length]} strokeWidth={lado / 120} />
      ))}
    </svg>
  );
}

export function ImportarGraduado() {
  const navegar = useNavigate();
  const entrada = useRef<HTMLInputElement>(null);
  const [etapa, setEtapa] = useState<"fechado" | "grade" | "conferir">("fechado");
  const [erro, setErro] = useState("");
  const [avisos, setAvisos] = useState<string[]>([]);
  const [nome, setNome] = useState("");
  const [grade, setGrade] = useState<string[]>([]);
  const [base, setBase] = useState("");
  const [pecas, setPecas] = useState<Peca[]>([]);
  const [agrupado, setAgrupado] = useState<ReturnType<typeof agruparTamanhos> | null>(null);
  const [criando, setCriando] = useState(false);

  const fechar = () => { setEtapa("fechado"); setErro(""); setAvisos([]); setPecas([]); setAgrupado(null); };

  const ler = async (arquivos: File[]) => {
    setErro("");
    const plt = arquivos.find((a) => /\.(plt|hpgl)$/i.test(a.name));
    if (!plt) { setErro("Escolha o .plt do molde (com o .adsx ou o .ads do mesmo modelo, se tiver)."); setEtapa("conferir"); return; }
    const adsx = arquivos.find((a) => /\.adsx$/i.test(a.name));
    const ads = arquivos.find((a) => /\.ads$/i.test(a.name));
    const r = lacosDoPLT(await textoDoPlt(plt)) as { erro?: string; lacos: Laco[]; avisos: string[] };
    if (r.erro) { setErro(r.erro); setEtapa("conferir"); return; }
    const recados = [...(r.avisos ?? [])];
    setNome(plt.name.replace(/\.[^.]+$/, ""));

    if (adsx) {
      const gab = await lerAdsx(new Uint8Array(await adsx.arrayBuffer())) as any;
      if (!gab.erro) {
        const casado = casarComOGabarito(r.lacos, gab) as { pecas: Peca[]; semDono: Laco[]; avisos: string[] };
        const avulsas: Peca[] = casado.semDono.map((l, i) => ({
          nome: `Avulsa ${i + 1}`, quantidade: 1, porTamanho: Object.fromEntries(gab.tamanhos.map((t: string) => [t, l])), faltam: [],
        }));
        setNome(gab.nome || plt.name.replace(/\.[^.]+$/, ""));
        setGrade(gab.tamanhos);
        setBase(gab.base);
        setPecas([...casado.pecas, ...avulsas]);
        setAvisos([...recados, ...casado.avisos]);
        setEtapa("conferir");
        return;
      }
      recados.push(`O .adsx não serviu (${gab.erro}); os tamanhos foram agrupados pela forma.`);
    }

    const g = agruparTamanhos(r.lacos) as ReturnType<typeof agruparTamanhos>;
    let nomes = gradePadrao(g.tamanhos);
    if (ads) {
      const resumo = resumoDoAds(new Uint8Array(await ads.arrayBuffer())) as any;
      if (!resumo.erro && resumo.tamanhos?.length === g.tamanhos) nomes = resumo.tamanhos.map((t: { nome: string }) => t.nome);
      if (!resumo.erro && resumo.nome) setNome(resumo.nome);
    }
    setAgrupado(g);
    setGrade(nomes);
    setBase(nomes[Math.floor((nomes.length - 1) / 2)] ?? "");
    setAvisos(recados);
    setEtapa("grade");
  };

  const conferir = () => {
    if (!agrupado) return;
    setPecas(pecasDoAgrupamento(agrupado, grade) as Peca[]);
    setEtapa("conferir");
  };

  const criar = async () => {
    setCriando(true);
    try {
      const molde = moldeGraduado({
        nome: nome.trim(), tamanhos: grade.map((t) => ({ nome: t, base: t === base })), pecas, papelDe: adivinharPapel,
      });
      const { id } = await moldesApi.criar(molde as any);
      fechar();
      navegar(`/montagem?molde=${id}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui criar o molde.");
    } finally {
      setCriando(false);
    }
  };

  const nomesValidos = grade.every((t) => t.trim()) && new Set(grade.map((t) => t.trim())).size === grade.length;

  return (
    <>
      <button type="button" className="btn secondary btn-sm" onClick={() => entrada.current?.click()}
        title="O PLT da Audaces com todos os tamanhos (junte o .adsx do mesmo modelo para os nomes e a conferência)">
        Importar graduado
      </button>
      <input
        ref={entrada} type="file" multiple accept=".plt,.hpgl,.adsx,.ads" className="hidden" aria-label="Arquivos do molde graduado"
        onChange={(e) => { const lista = Array.from(e.target.files ?? []); e.target.value = ""; if (lista.length) void ler(lista); }}
      />
      {etapa !== "fechado" && (
        <div className="fixed inset-0 z-90 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label="Importar o molde graduado"
            className="flex max-h-[90vh] w-full max-w-3xl flex-col gap-3 rounded-2xl border border-linha bg-painel-suave p-5 shadow-2xl shadow-black/60">
            <h2 className="m-0 font-titulo text-base font-semibold text-tinta">Importar o molde graduado</h2>

            {erro && <p className="m-0 text-sm text-[#ff4d4d]">{erro}</p>}

            {etapa === "grade" && agrupado && (
              <>
                <p className="m-0 text-sm text-tinta-fraca">
                  Achei {agrupado.tamanhos} tamanho(s). Diga o nome de cada um, do menor para o maior, e qual é o base.
                </p>
                <div className="flex flex-wrap items-center gap-2" aria-label="A grade">
                  {grade.map((t, i) => (
                    <label key={i} className="flex items-center gap-1 rounded-lg border border-linha bg-painel px-2 py-1">
                      <span className="size-3 rounded-full" style={{ background: PALETA[i % PALETA.length] }} />
                      <input type="text" value={t} aria-label={`Tamanho ${i + 1}`} className="w-14!"
                        onChange={(e) => { const g = [...grade]; const velho = g[i]; g[i] = e.target.value; setGrade(g); if (base === velho) setBase(e.target.value); }} />
                      <input type="radio" name="base-da-grade" checked={base === t} onChange={() => setBase(t)} aria-label={`${t} é o base`} />
                    </label>
                  ))}
                  <span className="text-xs text-tinta-apagada">● = base</span>
                </div>
              </>
            )}

            {etapa === "conferir" && pecas.length > 0 && (
              <>
                <label className="flex items-center gap-2 text-sm text-tinta-fraca">
                  Nome do molde
                  <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} className="flex-1" aria-label="Nome do molde" />
                </label>
                <p className="m-0 text-sm text-tinta-fraca">
                  {pecas.length} peça(s) em {grade.length} tamanho(s): {grade.map((t) => (t === base ? `${t} (base)` : t)).join(", ")}.
                  Confira antes de criar.
                </p>
                <ul className="m-0 grid min-h-0 flex-1 list-none grid-cols-2 gap-2 overflow-y-auto p-0" aria-label="As peças">
                  {pecas.map((p, i) => {
                    const achados = grade.filter((t) => p.porTamanho[t]).length;
                    const incompleta = achados < grade.length;
                    return (
                      <li key={i} className={`flex items-center gap-3 rounded-xl border p-2 ${incompleta ? "border-ambar" : "border-linha"}`}>
                        <Miniatura peca={p} grade={grade} />
                        <span className="min-w-0 text-sm">
                          <span className="block truncate font-semibold text-tinta">{p.nome}{p.quantidade > 1 ? ` ×${p.quantidade}` : ""}</span>
                          <span className={`block text-xs ${incompleta ? "text-ambar" : "text-tinta-apagada"}`}>
                            {incompleta ? `achei ${achados} de ${grade.length} tamanhos` : `${grade.length} tamanhos`}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {avisos.length > 0 && (
              <ul className="m-0 max-h-24 list-disc overflow-y-auto pl-5 text-xs text-tinta-apagada">
                {avisos.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" className="btn secondary btn-sm" onClick={fechar}>Cancelar</button>
              {etapa === "grade" && (
                <button type="button" className="btn primary btn-sm" disabled={!nomesValidos || !base} onClick={conferir}>Conferir</button>
              )}
              {etapa === "conferir" && pecas.length > 0 && (
                <button type="button" className="btn primary btn-sm" disabled={criando || !nome.trim()} onClick={() => void criar()}>
                  {criando ? "Criando…" : "Criar molde"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
