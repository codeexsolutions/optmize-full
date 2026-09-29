/**
 * A MESA DE MONTAGEM — a bancada inteira: lista à esquerda, mesa no meio,
 * painel da peça à direita, barra em cima. Quem guarda o molde é o
 * `useMoldeEmMontagem`; quem mexe na peça são as contas de
 * `motores/montagem.js`. Aqui só se liga uma coisa na outra.
 */
import { useEffect, useMemo, useState } from "react";
import { Icone } from "../../casca/Icone";
import { useMoldeEmMontagem, type PecaEmMontagem } from "./useMoldeEmMontagem";
import { ChipsDeTamanho } from "./ChipsDeTamanho";
import { aplicarNoGrupo, comunsDoGrupo, gruposDasPecas } from "../../motores/tamanhos";
import type { GrupoDePecas } from "./useMoldeEmMontagem";
import { EscolhaDoMolde } from "./EscolhaDoMolde";
import { ListaDePecas } from "./ListaDePecas";
import { Mesa, type Ferramenta } from "./Mesa";
import { PainelDaPeca } from "./PainelDaPeca";
import { BarraDaMontagem } from "./BarraDaMontagem";

interface Props { id: number; aoTrocar: () => void; aoEscolherOutro: (id: number) => void }

const FERRAMENTAS: { qual: Ferramenta; rotulo: string; icone: string; dica: string }[] = [
  { qual: "nos", rotulo: "Nós", icone: "icones.svg#spline", dica: "Arrastar nós e alças; dois cliques põem ou tiram nó" },
  { qual: "pique", rotulo: "Pique", icone: "icones.svg#scissors", dica: "Clique no traço para pôr um pique; num pique, para tirar" },
  { qual: "ponto", rotulo: "Ponto", icone: "icones.svg#crosshair", dica: "Clique dentro da peça para marcar pence ou bolso" },
  { qual: "fio", rotulo: "Fio", icone: "icones.svg#move-vertical", dica: "Arraste o meio para mover, uma ponta para girar" },
];

export function MesaDeMontagem({ id, aoTrocar, aoEscolherOutro }: Props) {
  const molde = useMoldeEmMontagem(id);
  // A peça mostrada é um GRUPO (a mesma peça em todos os tamanhos) num
  // TAMANHO. Ver `motores/tamanhos.js`.
  const [grupo, setGrupo] = useState(0);
  const [tamanhoAtivo, setTamanhoAtivo] = useState("");
  const [verTamanhos, setVerTamanhos] = useState(false);
  const [ferramenta, setFerramenta] = useState<Ferramenta>("nos");
  const [verTodas, setVerTodas] = useState(false);
  const [noAtivo, setNoAtivo] = useState<number | null>(null);

  const grupos = useMemo(() => gruposDasPecas(molde.pecas) as GrupoDePecas[], [molde.pecas]);
  const tamanhoValido = molde.tamanhos.some((t) => t.nome === tamanhoAtivo)
    ? tamanhoAtivo
    : (molde.tamanhos.find((t) => t.base)?.nome ?? molde.tamanhos[0]?.nome ?? "");
  const doGrupo = grupos.find((g) => g.grupo === grupo) ?? grupos[0];

  // Um só índice (na lista plana de peças), usado em TUDO (peça mostrada,
  // `mudarEsta`, a Mesa) — duas fontes da verdade (uma "para mostrar", outra
  // "para mexer") foi exatamente o bug de antes: a tela mostrava uma peça e a
  // mexida ia para outra. Se o grupo não tem o tamanho ativo, vale o primeiro
  // tamanho que ele tem.
  const atual = doGrupo ? (doGrupo.porTamanho[tamanhoValido] ?? Object.values(doGrupo.porTamanho)[0] ?? 0) : 0;
  const peca = molde.pecas[atual];

  // As peças do tamanho da peça mostrada: é o que a Mesa desenha e o "ver todas" arranja.
  const doTamanho = useMemo(
    () => molde.pecas.map((p, i) => ({ p, i })).filter((x) => peca && x.p.tamanho === peca.tamanho),
    [molde.pecas, peca],
  );
  const naMesa = Math.max(0, doTamanho.findIndex((x) => x.i === atual));
  const camadas = useMemo(() => (verTamanhos && doGrupo && peca
    ? Object.entries(doGrupo.porTamanho)
      .filter(([t]) => t !== peca.tamanho)
      .map(([t, i]) => ({ nos: molde.pecas[i]!.nos, cor: molde.tamanhos.find((x) => x.nome === t)?.cor ?? "#888888" }))
    : []), [verTamanhos, doGrupo, peca, molde.pecas, molde.tamanhos]);

  useEffect(() => { setNoAtivo(null); }, [atual, ferramenta]);

  // O `indice` pode ficar velho depois de um desfazer ou de apagar peça: a
  // pilha do desfazer não sabe de `indice`, e "apagar a peça 5" também não
  // mexe nele. Sem isto a mesa MOSTRA a última peça (por causa do clamp de
  // `atual`) mas toda mexida ainda mira o índice de antes — que ou não existe
  // mais, ou é outra peça — e a mexida se perde em silêncio (ver o bug
  // relatado: juntar, escolher a peça 4, desfazer até sobrar 3, editar).
  useEffect(() => {
    if (grupos.length > 0 && !grupos.some((g) => g.grupo === grupo)) setGrupo(grupos[0]!.grupo);
  }, [grupos, grupo]);

  // O nó marcado também pode ficar velho: um desfazer troca a lista de nós da
  // peça inteira (não só o índice), e um `noAtivo` que apontava para o nó 7
  // pode sobrar apontando para um nó que não existe mais na lista de agora.
  // Delete, nesse estado, chamaria `apagarNoDaPeca` com um índice de outro nó
  // — os nós ficam intactos, mas os piques presos ao nó vizinho são
  // remapeados (ver `apagarNoDaPeca`) e "andam" sem ninguém ter mexido neles.
  useEffect(() => {
    if (noAtivo !== null && (!peca || noAtivo >= peca.nos.length)) setNoAtivo(null);
  }, [peca, noAtivo]);

  // Ctrl+Z desfaz, fora de campo de texto (lá ele desfaz o texto).
  useEffect(() => {
    const ouvir = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const foco = document.activeElement as HTMLElement | null;
      if (foco && ["INPUT", "TEXTAREA"].includes(foco.tagName)) return;
      e.preventDefault();
      molde.desfazer();
    };
    window.addEventListener("keydown", ouvir);
    return () => window.removeEventListener("keydown", ouvir);
  }, [molde]);

  if (molde.carregando) return <p className="p-6 text-sm text-tinta-apagada">Abrindo o molde…</p>;
  if (molde.naoAchado) return <EscolhaDoMolde sumiu aoEscolher={aoEscolherOutro} />;
  // Erro de carga que NÃO é "sumiu" (rede, servidor fora): sem isto a tela
  // mostraria "0 peça(s) · salvo", como se o molde estivesse vazio de
  // propósito. Ver `erroAoAbrir` em `useMoldeEmMontagem.ts`.
  if (molde.erroAoAbrir) {
    return (
      <div className="flex flex-col gap-2 p-6 text-sm">
        <p className="m-0 text-tinta-apagada">{molde.erroAoAbrir}</p>
        <button type="button" onClick={molde.tentarAbrirDeNovo} className="self-start">
          Tentar de novo
        </button>
      </div>
    );
  }

  const mudarEsta = (mudar: Parameters<typeof molde.mudarPeca>[1], lembrarAntes: boolean) =>
    molde.mudarPeca(atual, mudar, lembrarAntes);

  /** Nome, papel, quantidade, espelhar e margem: o grupo inteiro, todos os tamanhos. */
  const mudarGrupo = (mudar: (p: PecaEmMontagem) => PecaEmMontagem, lembrarAntes: boolean) => {
    if (!peca) return;
    molde.mudarPecas((antes) => {
      const modelo = mudar(antes[atual]!);
      return aplicarNoGrupo(antes, modelo.grupo, (p: PecaEmMontagem) => (p === antes[atual] ? modelo : comunsDoGrupo(modelo)(p)));
    }, lembrarAntes);
  };

  /** Leva a tela a uma peça da lista plana (a que deu problema ao gravar). */
  const irParaPeca = (i: number) => {
    const p = molde.pecas[i];
    if (!p) return;
    setGrupo(p.grupo ?? 0);
    setTamanhoAtivo(p.tamanho);
  };

  return (
    <div className="flex h-full flex-col">
      <BarraDaMontagem molde={molde} moldeId={id} aoTrocar={aoTrocar} aoIrParaPeca={irParaPeca} tamanhoAtivo={peca?.tamanho ?? tamanhoValido} />
      <div className="flex items-center gap-1 border-b border-linha px-3 py-1.5">
        {FERRAMENTAS.map((f) => (
          <button
            key={f.qual} type="button" title={f.dica}
            className={`btn btn-sm ${ferramenta === f.qual && !verTodas ? "primary" : "secondary"}`}
            onClick={() => { setFerramenta(f.qual); setVerTodas(false); }}
          >
            <Icone referencia={f.icone} className="size-4" />
            {f.rotulo}
          </button>
        ))}
        <span className="mx-2 h-5 w-px bg-linha" />
        <button type="button" className={`btn btn-sm ${verTodas ? "primary" : "secondary"}`} onClick={() => setVerTodas((v) => !v)}>
          <Icone referencia="icones.svg#layers" className="size-4" />
          Ver todas
        </button>
        <span className="ml-auto text-[0.78rem] text-tinta-fraca">
          {FERRAMENTAS.find((f) => f.qual === ferramenta)?.dica}. Roda do mouse aproxima.
        </span>
      </div>
      {molde.tamanhos.length > 1 && (
        <ChipsDeTamanho
          tamanhos={molde.tamanhos}
          ativo={peca?.tamanho ?? tamanhoValido}
          aoEscolher={setTamanhoAtivo}
          verTamanhos={verTamanhos}
          aoVerTamanhos={setVerTamanhos}
        />
      )}
      <div className="flex min-h-0 flex-1">
        <ListaDePecas molde={molde} moldeId={id} grupo={doGrupo?.grupo ?? 0} aoEscolherGrupo={setGrupo} />
        <div className="min-w-0 flex-1">
          <Mesa
            pecas={doTamanho.map((x) => x.p)}
            indice={naMesa}
            camadas={camadas}
            ferramenta={ferramenta}
            verTodas={verTodas}
            noAtivo={noAtivo}
            comErro={(() => {
              const i = molde.problema?.peca;
              const k = i == null ? -1 : doTamanho.findIndex((x) => x.i === i);
              return k < 0 ? null : k;
            })()}
            aoMarcarNo={setNoAtivo}
            aoEscolherPeca={(i) => { setGrupo(doTamanho[i]?.p.grupo ?? 0); setVerTodas(false); }}
            aoLembrar={molde.lembrar}
            aoMudar={mudarEsta}
          />
        </div>
        {peca && <PainelDaPeca peca={peca} aoMudar={mudarEsta} aoMudarGrupo={mudarGrupo} />}
      </div>
    </div>
  );
}
