/**
 * A MESA DE MONTAGEM — a bancada inteira: lista à esquerda, mesa no meio,
 * painel da peça à direita, barra em cima. Quem guarda o molde é o
 * `useMoldeEmMontagem`; quem mexe na peça são as contas de
 * `motores/montagem.js`. Aqui só se liga uma coisa na outra.
 */
import { useEffect, useState } from "react";
import { Icone } from "../../casca/Icone";
import { useMoldeEmMontagem } from "./useMoldeEmMontagem";
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
  const [indice, setIndice] = useState(0);
  const [ferramenta, setFerramenta] = useState<Ferramenta>("nos");
  const [verTodas, setVerTodas] = useState(false);
  const [noAtivo, setNoAtivo] = useState<number | null>(null);

  // Um só índice clampado, usado em TUDO (peça mostrada, `mudarEsta`, a Mesa e
  // a Lista) — nunca `indice` cru fora daqui. Duas fontes da verdade (uma
  // clampada só "para mostrar", outra crua "para mexer") foi exatamente o bug:
  // a tela mostrava uma peça e a mexida ia para outra. Calculado ANTES dos
  // hooks abaixo porque o efeito do `noAtivo` depende de `peca`.
  const atual = Math.min(indice, Math.max(0, molde.pecas.length - 1));
  const peca = molde.pecas[atual];

  useEffect(() => { setNoAtivo(null); }, [indice, ferramenta]);

  // O `indice` pode ficar velho depois de um desfazer ou de apagar peça: a
  // pilha do desfazer não sabe de `indice`, e "apagar a peça 5" também não
  // mexe nele. Sem isto a mesa MOSTRA a última peça (por causa do clamp de
  // `atual`) mas toda mexida ainda mira o índice de antes — que ou não existe
  // mais, ou é outra peça — e a mexida se perde em silêncio (ver o bug
  // relatado: juntar, escolher a peça 4, desfazer até sobrar 3, editar).
  useEffect(() => {
    setIndice((i) => Math.min(i, Math.max(0, molde.pecas.length - 1)));
  }, [molde.pecas.length]);

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

  return (
    <div className="flex h-full flex-col">
      <BarraDaMontagem molde={molde} moldeId={id} aoTrocar={aoTrocar} aoIrParaPeca={setIndice} />
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
      <div className="flex min-h-0 flex-1">
        <ListaDePecas molde={molde} moldeId={id} indice={atual} aoEscolher={setIndice} />
        <div className="min-w-0 flex-1">
          <Mesa
            pecas={molde.pecas}
            indice={atual}
            ferramenta={ferramenta}
            verTodas={verTodas}
            noAtivo={noAtivo}
            comErro={molde.problema?.peca ?? null}
            aoMarcarNo={setNoAtivo}
            aoEscolherPeca={(i) => { setIndice(i); setVerTodas(false); }}
            aoLembrar={molde.lembrar}
            aoMudar={mudarEsta}
          />
        </div>
        {peca && <PainelDaPeca peca={peca} aoMudar={mudarEsta} />}
      </div>
    </div>
  );
}
