/**
 * ===========================================================================
 * A ENTRADA — do login para o programa, no efeito do CodeEx Flow
 * ===========================================================================
 *
 * Vem do `shared/session/TransicaoSessao.tsx` do Flow. O cartão do login não
 * some num corte: ele se desfaz (ver `consumindo`, em `Porta.tsx`) enquanto um
 * halo acende no meio da tela, partículas sobem, um anel se desenha e o nome
 * de quem entrou aparece letra por letra. Quando o programa já está montado
 * atrás, a camada se abre — cresce, desfoca e dissolve — revelando-o.
 *
 * Substitui a antiga cortina "Bom trabalho", que era uma segunda tela entre o
 * login e o programa: aqui a espera acontece DENTRO do login (o botão gira
 * enquanto o servidor confere a senha), e o que vem depois é só a passagem.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A CAMADA MORA FORA DO LOGIN
 * ---------------------------------------------------------------------------
 *
 * O login é desmontado no instante em que a sessão passa a valer — é assim
 * que a casca troca a tela de entrar pelo programa. Uma animação que morasse
 * nele sumiria no primeiro quadro dessa troca, e a passagem viraria corte.
 *
 * Então ela fica em `main.tsx`, acima de tudo, e é comandada por duas
 * funções: `tocarEntrada` (o login chama, e espera a animação acabar) e
 * `encerrarEntrada` (a casca chama, quando o programa já está desenhado atrás).
 * Separar as duas é o que evita o piscar: a camada só sai quando já existe o
 * que revelar.
 *
 * Duração curta de propósito — ~2,2 s. Quem entra no programa várias vezes
 * por dia paga essa animação todas as vezes. Com movimento reduzido ela vira
 * um "Bem-vindo" parado de 0,7 s.
 */

import { useMemo, useSyncExternalStore } from "react";

/* ------------------------------------------------------------------------- */
/* O ESTADO, FORA DO REACT                                                    */
/* ------------------------------------------------------------------------- */

interface Estado {
  nome: string;
  /** A camada está se abrindo para revelar o programa. */
  saindo: boolean;
}

let estado: Estado | null = null;
const ouvintes = new Set<() => void>();

function mudar(novo: Estado | null) {
  estado = novo;
  ouvintes.forEach((ouvir) => ouvir());
}

function assinar(ouvir: () => void) {
  ouvintes.add(ouvir);
  return () => ouvintes.delete(ouvir);
}

const reduzido = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A saída da camada, em `entrada.css` (`.entrada-camada.saindo`). */
const SAIDA_MS = 420;

/**
 * Toca a entrada e só resolve quando a animação terminou.
 *
 * Se ninguém chamar `encerrarEntrada` depois (a casca não montou, a sessão
 * caiu), a camada sai sozinha: uma tela escura com "Bem-vindo" parada para
 * sempre seria um programa que não abre.
 */
export function tocarEntrada(nome: string): Promise<void> {
  mudar({ nome, saindo: false });
  const duracao = reduzido() ? 700 : 2200;
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve();
      window.setTimeout(encerrarEntrada, 2500);
    }, duracao);
  });
}

/** Abre a camada, revelando o que já está montado atrás. Chamar à toa não faz nada. */
export function encerrarEntrada() {
  if (!estado || estado.saindo) return;
  mudar({ ...estado, saindo: true });
  window.setTimeout(() => mudar(null), SAIDA_MS);
}

/* ------------------------------------------------------------------------- */
/* O DESENHO                                                                  */
/* ------------------------------------------------------------------------- */

const PARTICULAS = 26;

export function CamadaDeEntrada() {
  const atual = useSyncExternalStore(assinar, () => estado);
  if (!atual) return null;
  return <Passagem nome={atual.nome} saindo={atual.saindo} />;
}

function Passagem({ nome, saindo }: { nome: string; saindo: boolean }) {
  const primeiro = nome.trim().split(/\s+/)[0] || "de volta";
  const letras = `Bem-vindo, ${primeiro}`.split("");

  /* Sorteadas uma vez: recalcular a cada desenho faria as partículas pularem
     de lugar no meio da subida. */
  const particulas = useMemo(
    () => Array.from({ length: PARTICULAS }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      atraso: Math.random() * 0.5,
      tamanho: 2 + Math.random() * 4,
      distancia: 90 + Math.random() * 140,
    })),
    [],
  );

  return (
    <div className={`entrada-camada${saindo ? " saindo" : ""}`} role="status" aria-label={`Bem-vindo, ${primeiro}`}>
      <div aria-hidden="true" className="entrada-halo" />

      <div aria-hidden="true" className="entrada-particulas">
        {particulas.map((p) => (
          <span
            key={p.id}
            style={{
              left: `${p.x}%`,
              width: p.tamanho,
              height: p.tamanho,
              animationDelay: `${p.atraso}s`,
              ["--subida" as string]: `${-p.distancia}px`,
            }}
          />
        ))}
      </div>

      <svg aria-hidden="true" className="entrada-anel" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="46" />
      </svg>

      <div className="entrada-nome">
        <p className="entrada-kicker">CodeEx Optmize</p>
        <p className="entrada-letras">
          {letras.map((letra, i) => (
            <span key={`${letra}-${i}`} style={{ animationDelay: `${0.5 + i * 0.028}s` }}>
              {letra}
            </span>
          ))}
        </p>
        <span aria-hidden="true" className="entrada-traco" />
      </div>
    </div>
  );
}
