/**
 * ===========================================================================
 * A PROCURA — a espera da varredura da rede
 * ===========================================================================
 *
 * A varredura leva perto de meio minuto numa rede /24, e durante quase todo
 * esse tempo não há NADA para mostrar: nenhuma impressora foi identificada
 * ainda, e os números que existem (219 de 254) não dizem quase nada a quem
 * está olhando. Era uma barrinha e uma linha de texto.
 *
 * O problema é onde essa espera acontece. Ela é a primeira tela do sistema
 * para quem acabou de instalar — o painel de Impressoras, sem máquina
 * nenhuma cadastrada, É esta espera (ver `SemImpressoras.tsx`). Meio minuto
 * de barra cinza é o primeiro recado que o programa dá de si mesmo.
 *
 * Então a espera ganhou cara: uma impressora imprimindo, os passos da
 * varredura em ordem, e os três números que de fato importam — quantos
 * endereços já foram testados, quantos responderam e quantas impressoras
 * saíram dali.
 *
 * ---------------------------------------------------------------------------
 * POR QUE UMA IMPRESSORA, E NÃO UM RADAR
 * ---------------------------------------------------------------------------
 *
 * O desenho daqui já foi um radar girando — que é a metáfora certa para
 * "varrer a rede" e a errada para esta tela. Quem está olhando não está
 * pensando em rede: está esperando UMA IMPRESSORA aparecer. O desenho agora é
 * o próprio objeto procurado, imprimindo — a folha saindo é o que qualquer
 * pessoa da produção reconhece como "está trabalhando, espera".
 *
 * As ondas atrás dela é que dizem o resto: alguma coisa está sendo chamada lá
 * fora.
 *
 * Nada aqui inventa progresso: a folha sai em velocidade fixa (não é uma
 * barra disfarçada de animação), e a barra de progresso de verdade só aparece
 * quando o servidor já sabe o total. Enquanto ele não sabe, a tela diz
 * "procurando", que é a verdade.
 *
 * As keyframes moram em `estilo/entrada.css`, junto das outras da casca.
 */

import { Icone } from "../casca/Icone";
import type { EstadoDaVarredura } from "./tipos";

/** A ordem em que a varredura acontece. É o que a fita de passos desenha. */
const PASSOS: { fase: EstadoDaVarredura["phase"]; rotulo: string }[] = [
  { fase: "sweep", rotulo: "Varrer a rede" },
  { fase: "identify", rotulo: "Identificar" },
  { fase: "history", rotulo: "Puxar histórico" },
];

/** Onde cada fase entra na fita. `hosts` é uma varredura curta: conta como a primeira. */
const ORDEM: Record<EstadoDaVarredura["phase"], number> = {
  idle: -1, starting: 0, hosts: 0, sweep: 0, identify: 1, history: 2, done: 3, error: -1,
};

/**
 * A IMPRESSORA IMPRIMINDO.
 *
 * `ativo` é o que separa "procurando" de "parada": parada, o desenho continua
 * na tela inteiro, só não se mexe nada. É de propósito — uma impressora
 * imprimindo sem nada estar acontecendo faz a pessoa esperar por uma coisa
 * que não vem.
 *
 * O `clipPath` é o truque da folha: ela desce de trás da máquina e só é
 * desenhada abaixo da boca de saída, então parece sair de dentro. São duas,
 * defasadas em meio ciclo, para a saída ser contínua.
 */
export function ImpressoraProcurando({ ativo, className = "" }: { ativo: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 200 180"
      role="img"
      aria-label={ativo ? "Procurando impressoras na rede" : "Procura parada"}
      className={`${ativo ? "" : "impressora-parada opacity-60"} ${className}`}
    >
      <defs>
        <radialGradient id="procura-brilho" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.14" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
        {/* Só existe folha abaixo da boca de saída. */}
        <clipPath id="procura-saida">
          <rect x="0" y="123" width="200" height="60" />
        </clipPath>
      </defs>

      <circle cx="100" cy="92" r="88" fill="url(#procura-brilho)" />

      {/* As ondas: o programa chamando a rede. Três, defasadas. */}
      <g fill="none" stroke="var(--accent)" strokeWidth="1.5">
        <circle className="procura-onda" cx="100" cy="92" r="84" opacity="0" />
        <circle className="procura-onda" cx="100" cy="92" r="84" opacity="0" style={{ animationDelay: "0.87s" }} />
        <circle className="procura-onda" cx="100" cy="92" r="84" opacity="0" style={{ animationDelay: "1.73s" }} />
      </g>

      {/* A folha esperando na bandeja de cima. */}
      <g>
        <rect x="70" y="34" width="60" height="26" rx="3" fill="var(--card-bg)" stroke="var(--border)" />
        <rect x="64" y="40" width="72" height="22" rx="3" fill="var(--card-bg-soft)" stroke="var(--border)" />
      </g>

      {/* O corpo da máquina. */}
      <rect x="26" y="58" width="148" height="72" rx="14" fill="var(--card-bg-soft)" stroke="var(--accent-line)" strokeWidth="1.5" />

      {/* O painel: a cabeça de impressão correndo de um lado ao outro. */}
      <rect x="44" y="74" width="74" height="16" rx="5" fill="var(--bg)" />
      <rect className="procura-cabeca" x="47" y="77" width="22" height="10" rx="3" fill="var(--accent)" />

      {/* A luz de estado e os dois botões. */}
      <circle className="procura-luz" cx="136" cy="82" r="4" fill="var(--accent-bright)" opacity="0.3" />
      <circle cx="150" cy="82" r="2.5" fill="var(--border)" />
      <circle cx="160" cy="82" r="2.5" fill="var(--border)" />

      {/* A boca de saída e os pés. */}
      <rect x="50" y="119" width="100" height="7" rx="3.5" fill="var(--bg)" />
      <rect x="36" y="130" width="18" height="7" rx="2" fill="var(--card-bg)" />
      <rect x="146" y="130" width="18" height="7" rx="2" fill="var(--card-bg)" />

      {/* As folhas saindo. Ver o `clipPath`, lá em cima. */}
      <g clipPath="url(#procura-saida)">
        <Folha />
        <Folha atraso="1.15s" />
      </g>
    </svg>
  );
}

/** Uma folha impressa, saindo. O atraso é o que faz a segunda alternar com a primeira. */
function Folha({ atraso }: { atraso?: string }) {
  return (
    <g className="procura-folha" opacity={atraso ? 0 : 1} style={atraso ? { animationDelay: atraso } : undefined}>
      <rect x="56" y="123" width="88" height="46" rx="3" fill="var(--text)" opacity="0.93" />
      <rect x="66" y="133" width="56" height="3.5" rx="1.75" fill="var(--accent)" opacity="0.85" />
      <rect x="66" y="142" width="68" height="3" rx="1.5" fill="#b4ada5" />
      <rect x="66" y="150" width="48" height="3" rx="1.5" fill="#b4ada5" />
      <rect x="66" y="158" width="60" height="3" rx="1.5" fill="#b4ada5" />
    </g>
  );
}

/**
 * O painel da varredura: a impressora, o passo em que ela está e o placar.
 *
 * É o bloco da tela de Máquinas. A porta do painel (`SemImpressoras.tsx`)
 * monta as mesmas peças em outro arranjo — centradas, sem cartão em volta —,
 * e é por isso que elas são exportadas uma a uma daqui: o desenho da espera é
 * um só, e ter dois era o caminho mais curto para os dois divergirem.
 */
export function PainelDaVarredura({ estado, aoProcurar }: {
  estado: EstadoDaVarredura | null;
  /** Botão de recomeçar, mostrado quando a varredura terminou sem achar nada. */
  aoProcurar?: () => void;
}) {
  const rodando = Boolean(estado?.running);
  const fase = estado?.phase ?? "idle";
  const achadas = estado?.results.length ?? 0;
  const terminouVazio = fase === "done" && achadas === 0;

  return (
    <div className="flex flex-wrap items-center gap-x-7 gap-y-5 rounded-[12px] border border-linha bg-painel-suave px-5 py-5">
      <ImpressoraProcurando ativo={rodando} className="size-[136px] shrink-0 max-[520px]:mx-auto" />

      <div className="min-w-[220px] flex-1">
        <p className="m-0 font-titulo text-[1.05rem] font-semibold tracking-[-0.02em] text-tinta">
          {tituloDaVarredura(estado)}
        </p>
        <p className="mt-1 mb-0 min-h-[1.2em] text-[0.83rem] text-tinta-fraca">
          {estado?.error || estado?.message || "A varredura testa os endereços da rede local e reconhece cada impressora pelo que ela compartilha."}
        </p>

        <FitaDePassos fase={fase} className="mt-3.5" />
        <BarraDaVarredura estado={estado} className="mt-3.5" />
        {estado && <Placar estado={estado} className="mt-3.5" />}

        {terminouVazio && (
          <div className="mt-4">
            <p className="m-0 text-[0.8rem] text-tinta-apagada">{RECADO_VAZIO}</p>
            {aoProcurar && (
              <button
                type="button"
                onClick={aoProcurar}
                className="mt-2.5 flex items-center gap-2 rounded-[9px] border border-ambar bg-ambar px-4 py-2 text-[0.85rem] font-semibold text-ambar-tinta transition-colors hover:bg-ambar-claro"
              >
                <Icone referencia="icones.svg#radar" className="size-4" />
                Procurar de novo
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** O que a varredura está fazendo, em uma frase. */
export function tituloDaVarredura(estado: EstadoDaVarredura | null): string {
  if (estado?.running) return "Procurando impressoras na rede";
  if (estado?.phase === "error") return "A varredura falhou";
  if (estado?.phase === "done") {
    return estado.results.length === 0 ? "Nenhuma impressora respondeu" : "Varredura concluída";
  }
  return "Pronto para procurar";
}

export const RECADO_VAZIO =
  "Confira se as máquinas estão ligadas e na mesma rede. Se elas ficam em outra faixa de IP, " +
  "escreva os endereços à mão na tela de Máquinas e procure de novo.";

/**
 * A FITA DE PASSOS.
 *
 * Ela existe porque "Varrendo a rede" sozinho não diz se o trabalho está no
 * começo ou no fim — e a varredura tem três partes de duração bem diferente.
 * Vendo as três, meio minuto de espera passa a ter forma.
 */
export function FitaDePassos({ fase, className = "" }: { fase: EstadoDaVarredura["phase"]; className?: string }) {
  const passoAtual = ORDEM[fase];

  return (
    <ol className={`mb-0 flex list-none flex-wrap items-center gap-x-2 gap-y-1.5 p-0 ${className}`}>
      {PASSOS.map((passo, indice) => {
        const feito = passoAtual > indice;
        const agora = passoAtual === indice;
        return (
          <li key={passo.fase} className="flex items-center gap-2">
            <span
              className={[
                "flex items-center gap-1.5 rounded-full border px-2.5 py-[3px] text-[0.72rem] font-semibold transition-colors",
                agora ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-ambar-claro"
                  : feito ? "border-linha text-tinta-fraca"
                    : "border-linha-suave text-tinta-apagada",
              ].join(" ")}
            >
              {feito && <Icone referencia="icones.svg#check" className="size-3" />}
              {agora && <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-ambar" />}
              {passo.rotulo}
            </span>
            {indice < PASSOS.length - 1 && (
              <span aria-hidden="true" className={`h-px w-4 ${feito ? "bg-ambar/40" : "bg-linha"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A barra só aparece quando o servidor já sabe o total de endereços — antes
 * disso não há fração honesta para mostrar, e a tela diz "procurando", que é
 * a verdade.
 */
export function BarraDaVarredura({ estado, className = "" }: { estado: EstadoDaVarredura | null; className?: string }) {
  if (!estado?.running || estado.total <= 0) return null;
  const parte = Math.min(100, (estado.scanned / estado.total) * 100);

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={estado.total}
      aria-valuenow={estado.scanned}
      className={`h-1.5 overflow-hidden rounded-full bg-[var(--border)] ${className}`}
    >
      <div className="h-full rounded-full bg-ambar transition-[width] duration-300" style={{ width: `${parte}%` }} />
    </div>
  );
}

/** Os três números que importam: testados, quem respondeu, quantas saíram dali. */
export function Placar({ estado, className = "" }: { estado: EstadoDaVarredura; className?: string }) {
  const achadas = estado.results.length;

  return (
    <dl className={`mb-0 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(96px,1fr))] ${className}`}>
      <Numero rotulo="Endereços" valor={estado.total > 0 ? `${estado.scanned}/${estado.total}` : String(estado.scanned)} />
      <Numero rotulo="Responderam" valor={String(estado.reachable)} />
      <Numero rotulo="Impressoras" valor={String(achadas)} destaque={achadas > 0} />
    </dl>
  );
}

function Numero({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div>
      <dt className="text-[0.68rem] tracking-[0.08em] text-tinta-apagada uppercase">{rotulo}</dt>
      <dd className={`m-0 font-mono text-[1.1rem] font-semibold tabular-nums ${destaque ? "text-ambar" : "text-tinta"}`}>
        {valor}
      </dd>
    </div>
  );
}
