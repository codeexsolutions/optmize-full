/**
 * ===========================================================================
 * DIAGNÓSTICO DO MOTOR — o que a procura está fazendo, em números de verdade
 * ===========================================================================
 *
 * Pedido de 2026-11-12 (o "painel técnico" da missão do motor): acompanhar a
 * procura sem precisar abrir a bancada. A linha que o cliente lê continua só
 * "tentativa X · melhor: Y" (pedido do dono, 2026-10-27); este painel é para
 * quem cuida do motor e fica FECHADO por padrão, atrás de um botão discreto
 * na barra da mesa.
 *
 * NADA AQUI É ESTIMADO OU ANIMADO. O controlador (`src/producao/controlador.js`,
 * "O DIAGNÓSTICO DO MOTOR") manda, a cada andamento e no fim, o retrato da
 * corrida pelo evento `encaixe:diagnostico`; este componente só desenha o
 * último retrato:
 *
 *   - o melhor encaixe VÁLIDO (já passou pela trava) e o aproveitamento;
 *   - o limite inferior provado (`src/motores/limitesInferiores.js`) e a
 *     distância até ele — o teto do que ainda pode haver para ganhar;
 *   - o trabalho feito: tentativas da busca, avaliações geométricas do
 *     sparrow, separações que resolveram, encaixes recusados pela trava;
 *   - de onde veio cada melhoria (busca, com a receita; sparrow, exploração
 *     ou compressão), com a hora.
 */

import { useEffect, useState, type ReactNode } from "react";
import { Icone } from "../casca/Icone";

export interface MelhoriaDoDiagnostico {
  /** Milissegundos desde o começo da procura. */
  ms: number;
  /** Mídia consumida, em cm (o número que a tela mostra). */
  consumo: number;
  /** Quem achou: "busca · vaos/solta/area/fundo", "sparrow · exploração"... */
  origem: string;
}

export interface RetratoDoDiagnostico {
  rodando: boolean;
  fase: string;
  estrategia: string;
  decorridoMs: number;
  totalMs: number;
  workers: number;
  /** Mídia do melhor encaixe válido, em cm. */
  consumo: number | null;
  /** Mídia do encaixe com que a busca terminou (a partida do sparrow), em cm. */
  consumoDaBusca: number | null;
  aproveitamento: number | null;
  limite: { limite: number; area: number; bm: number; peca: number } | null;
  tentativas: number;
  sparrow: {
    avaliacoes: number;
    separacoes: number;
    resolvidas: number;
    relatos: number;
    rejeitados: number;
  } | null;
  historico: MelhoriaDoDiagnostico[];
}

const CHAVE_ABERTO = "optmize:diagnostico-do-encaixe-aberto";

const metros = (cm: number | null | undefined) =>
  cm == null || !Number.isFinite(cm) ? "—" : `${(cm / 100).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} m`;

const porcento = (fracao: number | null | undefined, casas = 1) =>
  fracao == null || !Number.isFinite(fracao) ? "—" : `${(fracao * 100).toLocaleString("pt-BR", { maximumFractionDigits: casas })}%`;

const inteiro = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : Math.round(n).toLocaleString("pt-BR");

const segundos = (ms: number) => `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;

function lerAberto() {
  try { return localStorage.getItem(CHAVE_ABERTO) === "1"; } catch { return false; }
}

function gravarAberto(aberto: boolean) {
  try { localStorage.setItem(CHAVE_ABERTO, aberto ? "1" : "0"); } catch { /* sem armazenamento: só não lembra */ }
}

export function BotaoDiagnosticoDoEncaixe() {
  const [aberto, setAberto] = useState(lerAberto);
  const [retrato, setRetrato] = useState<RetratoDoDiagnostico | null>(null);

  useEffect(() => {
    const ouvir = (evento: Event) => setRetrato((evento as CustomEvent<RetratoDoDiagnostico>).detail);
    window.addEventListener("encaixe:diagnostico", ouvir);
    return () => window.removeEventListener("encaixe:diagnostico", ouvir);
  }, []);

  const alternar = () => setAberto((a) => { gravarAberto(!a); return !a; });

  return (
    <>
      <button
        type="button"
        onClick={alternar}
        aria-pressed={aberto}
        className={`mr-1 grid size-7 place-items-center rounded-md transition-colors hover:bg-painel hover:text-tinta ${aberto ? "text-ambar" : "text-tinta-fraca"}`}
        title="Diagnóstico do motor: o que a procura está fazendo, em números"
      >
        <Icone referencia="icones.svg#activity" className="size-[15px]" />
      </button>
      {aberto && <PainelDiagnostico retrato={retrato} aoFechar={alternar} />}
    </>
  );
}

function PainelDiagnostico({ retrato, aoFechar }: { retrato: RetratoDoDiagnostico | null; aoFechar: () => void }) {
  const r = retrato;
  const distancia = r && r.consumo != null && r.limite && r.limite.limite > 0 ? r.consumo / r.limite.limite - 1 : null;
  const primeira = r ? r.historico[0] : undefined;
  const inicial = primeira ? primeira.consumo : null;
  const ganho = r && inicial && r.consumo != null ? 1 - r.consumo / inicial : null;
  const sp = r && r.sparrow;
  const porOrigem = new Map<string, number>();
  (r ? r.historico.slice(1) : []).forEach((m) => {
    const grupo = m.origem.startsWith("busca") ? "busca" : m.origem;
    porOrigem.set(grupo, (porOrigem.get(grupo) || 0) + 1);
  });

  return (
    <aside
      className="animar-entrada fixed top-[108px] right-4 z-[85] flex max-h-[calc(100vh-130px)] w-[352px] flex-col overflow-hidden rounded-xl border border-linha bg-painel shadow-[0_18px_50px_-12px_rgba(0,0,0,0.55)]"
      aria-label="Diagnóstico do motor"
    >
      <div className="flex items-start gap-3 border-b border-linha px-4 pt-3.5 pb-3">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 font-titulo text-[14px] text-tinta">Diagnóstico do motor</h2>
          <p className="m-0 mt-0.5 text-[11.5px] text-tinta-apagada">
            {r ? (r.rodando ? `${r.fase} · ${segundos(r.decorridoMs)} de ${segundos(r.totalMs)}` : `${r.fase} · ${segundos(r.decorridoMs)}`) : "Rode um encaixe para ver os números."}
          </p>
        </div>
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar o diagnóstico"
          className="grid size-7 shrink-0 place-items-center rounded-[8px] text-tinta-apagada transition-colors hover:bg-[var(--surface-hover)] hover:text-tinta"
        >
          <Icone referencia="icones.svg#x" className="size-4" />
        </button>
      </div>

      {r && (
        <div className="min-h-0 overflow-y-auto px-4 py-3 text-[12.5px]">
          <Grupo titulo="Resultado">
            <Linha rotulo="Melhor encaixe válido" valor={metros(r.consumo)} destaque />
            <Linha rotulo="Aproveitamento" valor={porcento(r.aproveitamento)} />
            <Linha rotulo="Ganho desde o primeiro" valor={porcento(ganho, 2)} />
            <Linha
              rotulo="Limite inferior provado"
              valor={metros(r.limite ? r.limite.limite : null)}
              dica="Nenhum encaixe gasta menos que isto: maior entre área/largura, Brunn–Minkowski com a folga e a maior peça."
            />
            <Linha
              rotulo="Distância até o limite"
              valor={distancia == null ? "—" : `${porcento(distancia, 1)} acima`}
              dica="Teto do que ainda pode haver para ganhar. O limite é frouxo de propósito: distância grande não prova que o encaixe é ruim."
            />
          </Grupo>

          <Grupo titulo="Agora">
            <Linha rotulo="Estratégia" valor={r.estrategia || "—"} />
            <Linha rotulo="Núcleos trabalhando" valor={inteiro(r.workers)} />
          </Grupo>

          <Grupo titulo="Trabalho feito">
            <Linha rotulo="Tentativas da busca" valor={inteiro(r.tentativas)} />
            {sp && (
              <>
                <Linha rotulo="Avaliações geométricas (sparrow)" valor={inteiro(sp.avaliacoes)} />
                <Linha
                  rotulo="Separações resolvidas"
                  valor={sp.separacoes > 0 ? `${inteiro(sp.resolvidas)} de ${inteiro(sp.separacoes)} (${porcento(sp.resolvidas / sp.separacoes, 0)})` : "—"}
                  dica="Cada separação tenta desfazer a sobreposição depois de encurtar o rolo. As que resolvem viram encaixe mais curto; as outras são o custo da procura."
                />
                <Linha
                  rotulo="Recusados pela trava"
                  valor={`${inteiro(sp.rejeitados)} de ${inteiro(sp.relatos)}`}
                  dica="Encaixes do sparrow que a conferência da produção não aceitou. O normal é zero."
                />
                {sp.avaliacoes > 0 && r.consumoDaBusca != null && r.consumo != null && (
                  <Linha
                    rotulo="Ganho do sparrow por mil avaliações"
                    valor={`${((r.consumoDaBusca - r.consumo) / (sp.avaliacoes / 1000)).toLocaleString("pt-BR", { maximumFractionDigits: 4 })} cm`}
                    dica="Quanto rolo a compactação encurtou a cada mil posições testadas, desde o encaixe com que a busca terminou."
                  />
                )}
              </>
            )}
          </Grupo>

          {r.historico.length > 0 && (
            <Grupo titulo={`Melhorias (${r.historico.length - 1})`}>
              {porOrigem.size > 0 && (
                <p className="m-0 mb-2 text-[11.5px] text-tinta-apagada">
                  {[...porOrigem.entries()].map(([origem, n]) => `${origem}: ${n}`).join(" · ")}
                </p>
              )}
              <table className="w-full border-collapse text-[11.5px]">
                <tbody>
                  {r.historico.slice(-14).reverse().map((m, i) => (
                    <tr key={`${m.ms}-${i}`} className="border-b border-linha/60">
                      <td className="py-1 pr-2 font-mono text-tinta-apagada">{segundos(m.ms)}</td>
                      <td className="py-1 pr-2 text-right font-mono text-tinta">{metros(m.consumo)}</td>
                      <td className="max-w-[150px] truncate py-1 text-tinta-fraca" title={m.origem}>{m.origem}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Grupo>
          )}
        </div>
      )}
    </aside>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mb-3 last:mb-0">
      <p className="m-0 mb-1.5 text-[10.5px] uppercase tracking-wide text-tinta-apagada">{titulo}</p>
      {children}
    </section>
  );
}

function Linha({ rotulo, valor, destaque, dica }: { rotulo: string; valor: string; destaque?: boolean; dica?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]" title={dica}>
      <span className="text-tinta-fraca">{rotulo}</span>
      <span className={`text-right font-mono ${destaque ? "text-ambar" : "text-tinta"}`}>{valor}</span>
    </div>
  );
}
