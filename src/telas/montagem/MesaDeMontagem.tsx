/**
 * A MESA DE MONTAGEM — a bancada inteira: lista à esquerda, mesa no meio,
 * painel da peça à direita, barra em cima. Quem guarda o molde é o
 * `useMoldeEmMontagem`; quem mexe na peça são as contas de
 * `motores/montagem.js`. Aqui só se liga uma coisa na outra.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Icone } from "../../casca/Icone";
import { useMoldeEmMontagem, type PecaEmMontagem } from "./useMoldeEmMontagem";
import { ChipsDeTamanho } from "./ChipsDeTamanho";
import { JanelaDaGrade } from "./JanelaDaGrade";
import {
  ORIGEM_AJUSTADA, ORIGEM_GERADA, alinhamentoDaCamada, aplicarGeracao, gerarTamanho, graduacaoVazia, planejarGeracao, transladarNos,
} from "../../motores/graduacao";
import { apagarNosDaPeca, girarPeca, pecaParaGravar, porNosDaPeca, reduzirNosDaPeca } from "../../motores/montagem";
import { BarraDosNos } from "../risco/BarraDosNos";
import { useEditorDeNos, type AlvoDoEditor } from "../risco/useEditorDeNos";
import { useDialogo } from "../../casca/Dialogo";
import { JanelaDeSubstituir } from "./JanelaDeSubstituir";
import type { Graduacao } from "../../api/moldes";
import { BlocoDaGraduacao } from "./BlocoDaGraduacao";
import { aplicarNoGrupo, comunsDoGrupo, gruposDasPecas } from "../../motores/tamanhos";
import type { GrupoDePecas } from "./useMoldeEmMontagem";
import { EscolhaDoMolde } from "./EscolhaDoMolde";
import { ListaDePecas } from "./ListaDePecas";
import { Mesa, type Ferramenta } from "./Mesa";
import { PainelDaPeca } from "./PainelDaPeca";
import { BarraDaMontagem } from "./BarraDaMontagem";

interface Props { id: number; aoTrocar: () => void; aoEscolherOutro: (id: number) => void }

const FERRAMENTAS: { qual: Ferramenta; rotulo: string; icone: string; dica: string }[] = [
  { qual: "nos", rotulo: "Nós", icone: "icones.svg#spline", dica: "Clique, Shift e retângulo selecionam; arraste nós, alças ou a curva; setas movem; dois cliques põem ou tiram nó" },
  { qual: "pique", rotulo: "Pique", icone: "icones.svg#scissors", dica: "Clique no traço para pôr um pique; num pique, para tirar" },
  { qual: "ponto", rotulo: "Ponto", icone: "icones.svg#crosshair", dica: "Clique dentro da peça para marcar pence ou bolso" },
  { qual: "fio", rotulo: "Fio", icone: "icones.svg#move-vertical", dica: "Arraste o meio para mover, uma ponta para girar" },
  { qual: "graduar", rotulo: "Graduar", icone: "icones.svg#ruler", dica: "Clique num nó para ver ou pôr a regra de graduação; os outros tamanhos aparecem tracejados" },
];

type AlvoDeGeracao = {
  grupo: number; tamanho: string; iBase: number; iExistente: number;
  acao: "criar" | "refazer" | "perguntar"; origem: string | null; nome: string;
};

export function MesaDeMontagem({ id, aoTrocar, aoEscolherOutro }: Props) {
  const molde = useMoldeEmMontagem(id);
  // A peça mostrada é um GRUPO (a mesma peça em todos os tamanhos) num
  // TAMANHO. Ver `motores/tamanhos.js`.
  const [grupo, setGrupo] = useState(0);
  const [tamanhoAtivo, setTamanhoAtivo] = useState("");
  const [verTamanhos, setVerTamanhos] = useState(false);
  const [gradeAberta, setGradeAberta] = useState(false);
  const dialogo = useDialogo();
  const [perguntando, setPerguntando] = useState<AlvoDeGeracao[] | null>(null);
  const [ferramenta, setFerramenta] = useState<Ferramenta>("nos");
  const [verTodas, setVerTodas] = useState(false);
  const [noAtivo, setNoAtivo] = useState<number | null>(null);

  const grupos = useMemo(() => gruposDasPecas(molde.pecas) as GrupoDePecas[], [molde.pecas]);
  // O tamanho que a pessoa escolheu no chip ("" = ainda não escolheu).
  const escolhido = molde.tamanhos.some((t) => t.nome === tamanhoAtivo) ? tamanhoAtivo : "";
  const baseDaGrade = molde.tamanhos.find((t) => t.base)?.nome ?? molde.tamanhos[0]?.nome ?? "";
  const doGrupo = grupos.find((g) => g.grupo === grupo) ?? grupos[0];
  // Escolheu um tamanho que a peça não tem: a mesa AVISA, em vez de mostrar
  // outro tamanho no lugar — editar ali mexeria no tamanho errado.
  const semDesenho = !!escolhido && !!doGrupo && doGrupo.porTamanho[escolhido] === undefined;
  const tamanhoMostrado = escolhido && !semDesenho ? escolhido : baseDaGrade;

  // Um só índice (na lista plana de peças), usado em TUDO (peça mostrada,
  // `mudarEsta`, a Mesa). Sem escolha, o base; se o grupo não tem o base, o
  // primeiro tamanho que ele tem.
  const atual = doGrupo ? (doGrupo.porTamanho[tamanhoMostrado] ?? Object.values(doGrupo.porTamanho)[0] ?? 0) : 0;
  const peca = molde.pecas[atual];
  // A linha graduada do grupo (a que guarda a regra): é por ela que as camadas se alinham.
  const baseDoGrupo = doGrupo
    ? Object.values(doGrupo.porTamanho).map((i) => molde.pecas[i]).find((p) => p?.graduacao) ?? null
    : null;

  // O base da graduação desta peça: a linha que guarda a regra, ou a do base da grade.
  const iDaBase: number | undefined = doGrupo
    ? (Object.values(doGrupo.porTamanho).find((i) => molde.pecas[i]?.graduacao) ?? doGrupo.porTamanho[baseDaGrade])
    : undefined;
  const pecaDaBase = iDaBase === undefined ? null : molde.pecas[iDaBase] ?? null;

  // A prévia: com a ferramenta Graduar, os outros tamanhos da grade, calculados das regras, tracejados.
  const previa = useMemo(() => {
    if (ferramenta !== "graduar" || !pecaDaBase?.graduacao) return [];
    return molde.tamanhos
      .filter((t) => t.nome !== pecaDaBase.tamanho)
      .map((t) => {
        const r = gerarTamanho(pecaDaBase, molde.tamanhos, t.nome);
        return r.peca ? { nos: r.peca.nos, cor: t.cor, tracejada: true } : null;
      })
      .filter((c): c is { nos: PecaEmMontagem["nos"]; cor: string; tracejada: boolean } => c !== null);
  }, [ferramenta, pecaDaBase, molde.tamanhos]);
  const regrasNaMesa = useMemo(
    () => (ferramenta === "graduar" && pecaDaBase?.graduacao?.jeito === "pontos" ? pecaDaBase.graduacao.regras.map((r) => r.no) : []),
    [ferramenta, pecaDaBase],
  );

  // A ferramenta Graduar trabalha no base: troca para ele se outro chip estiver
  // marcado. Compara o chip, e não `peca`: com um tamanho sem desenho marcado,
  // `peca` já é o base (é o que a mesa mostraria), mas a tela mostra o aviso.
  useEffect(() => {
    if (ferramenta !== "graduar" || !pecaDaBase || escolhido === pecaDaBase.tamanho) return;
    setTamanhoAtivo(pecaDaBase.tamanho);
  }, [ferramenta, pecaDaBase, escolhido]);

  // As peças do tamanho da peça mostrada: é o que a Mesa desenha e o "ver todas" arranja.
  const doTamanho = useMemo(
    () => molde.pecas.map((p, i) => ({ p, i })).filter((x) => peca && x.p.tamanho === peca.tamanho),
    [molde.pecas, peca],
  );
  const naMesa = Math.max(0, doTamanho.findIndex((x) => x.i === atual));
  const camadas = useMemo(() => (verTamanhos && doGrupo && peca
    ? Object.entries(doGrupo.porTamanho)
      .filter(([t]) => t !== peca.tamanho)
      .map(([t, i]) => {
        const outra = molde.pecas[i]!;
        const d = alinhamentoDaCamada(peca, outra, baseDoGrupo, molde.tamanhos);
        return { nos: transladarNos(outra.nos, d), cor: molde.tamanhos.find((x) => x.nome === t)?.cor ?? "#888888" };
      })
    : []), [verTamanhos, doGrupo, peca, baseDoGrupo, molde.pecas, molde.tamanhos]);

  // Mexer à mão num tamanho gerado tira dele a marca da graduação: gerar de
  // novo passa a perguntar antes de perder o ajuste.
  const mudarEsta = (mudar: Parameters<typeof molde.mudarPeca>[1], lembrarAntes: boolean) =>
    molde.mudarPeca(atual, (p) => {
      const q = mudar(p);
      return p.origem === ORIGEM_GERADA ? { ...q, origem: ORIGEM_AJUSTADA } : q;
    }, lembrarAntes);

  // O editor estilo Corel da ferramenta Nós: piques e regras da graduação vão junto
  // nas mexidas que mudam quantos nós há (ver `motores/montagem.js`).
  const alvoDoEditor: AlvoDoEditor = {
    nos: peca?.nos ?? [],
    mudarNos: (mudar, lembrarAntes) => mudarEsta((p) => ({ ...p, nos: mudar(p.nos) }), lembrarAntes),
    apagarNos: (indices) => {
      if (!peca) return null;
      const r = apagarNosDaPeca(peca, indices);
      if (r.erro) return r.erro;
      mudarEsta(() => r.peca, true);
      return null;
    },
    porNos: (pontos) => mudarEsta((p) => porNosDaPeca(p, pontos), true),
    retrato: () => peca,
    reduzir: (retrato, indices, folga) => {
      const r = reduzirNosDaPeca(retrato as PecaEmMontagem, indices, folga) as
        { erro: string } | { peca: PecaEmMontagem; antes: number; depois: number };
      if ("erro" in r) return { erro: r.erro };
      return { antes: r.antes, depois: r.depois, aplicar: () => mudarEsta(() => r.peca, false) };
    },
    voltar: (retrato) => mudarEsta(() => retrato as PecaEmMontagem, false),
    lembrar: molde.lembrar,
    passos: { curto: 0.1, longo: 1 },
    folgaEmUnidades: (mm) => mm / 10,
    comMedida: true,
  };
  const editor = useEditorDeNos(alvoDoEditor, atual);
  // O teclado do editor, pela referência mais nova: o ouvinte é posto uma vez só.
  const editorAtual = useRef(editor);
  editorAtual.current = editor;
  useEffect(() => {
    if (ferramenta !== "nos" || verTodas) return;
    const ouvir = (e: KeyboardEvent) => { editorAtual.current.teclar(e); };
    window.addEventListener("keydown", ouvir);
    return () => window.removeEventListener("keydown", ouvir);
  }, [ferramenta, verTodas]);

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
      // Só campo de texto: rádio e caixa de marcar (o bloco da graduação) não
      // têm texto para desfazer, e o foco fica neles depois do clique.
      const foco = document.activeElement as HTMLElement | null;
      const digitando = !!foco && (foco.tagName === "TEXTAREA" || (foco.tagName === "INPUT"
        && !["radio", "checkbox", "button", "color", "range"].includes((foco as HTMLInputElement).type)));
      if (digitando) return;
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

  /** Mexe na graduação da peça (na linha do base). */
  const mudarGraduacao = (mudar: (g: Graduacao) => Graduacao, lembrarAntes: boolean) => {
    if (iDaBase === undefined) return;
    molde.mudarPeca(iDaBase, (p) => ({ ...p, graduacao: mudar(p.graduacao ?? (graduacaoVazia() as Graduacao)) }), lembrarAntes);
  };

  const chaveDoAlvo = (a: { grupo: number; tamanho: string }) => `${a.grupo}/${a.tamanho}`;

  /** Aplica a geração: um passo só no desfazer, e a mensagem diz o que entrou e o que ficou de fora. */
  const aplicarAlvos = (alvos: AlvoDeGeracao[]) => {
    const r = aplicarGeracao(molde.pecas, molde.tamanhos, alvos, pecaParaGravar);
    if (r.gerados.length > 0) molde.mudarPecas(() => r.pecas, true);
    const linhas: string[] = [];
    if (r.gerados.length > 0) linhas.push(`Gerados: ${r.gerados.map((a: AlvoDeGeracao) => `${a.nome} ${a.tamanho}`).join(", ")}.`);
    for (const n of r.naoGerados as (AlvoDeGeracao & { motivo: string })[]) {
      linhas.push(`Não gerei o ${n.tamanho} de ${n.nome}: ${n.motivo}.`);
    }
    linhas.push(...(r.avisos as string[]));
    void dialogo.avisar(linhas.join(" ") || "Nada foi gerado.");
  };

  const gerar = (todas: boolean) => {
    if (!todas && !pecaDaBase?.graduacao) {
      void dialogo.avisar("Esta peça ainda não tem graduação: marque pontos ou uma porcentagem.");
      return;
    }
    const alvos: AlvoDeGeracao[] = planejarGeracao(molde.pecas, molde.tamanhos, todas ? null : (pecaDaBase!.grupo ?? -1));
    if (alvos.length === 0) {
      void dialogo.avisar(molde.tamanhos.length < 2
        ? "A grade só tem um tamanho: acrescente tamanhos na Grade antes de gerar."
        : "Nenhuma peça com graduação para gerar.");
      return;
    }
    if (alvos.some((a) => a.acao === "perguntar")) { setPerguntando(alvos); return; }
    aplicarAlvos(alvos);
  };

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
      <BarraDaMontagem molde={molde} moldeId={id} aoTrocar={aoTrocar} aoIrParaPeca={irParaPeca} tamanhoAtivo={tamanhoMostrado} />
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
      {ferramenta === "nos" && !verTodas && !semDesenho && peca && (
        <BarraDosNos editor={editor} aoGirar={(graus) => mudarEsta((p) => girarPeca(p, graus), true)} />
      )}
      <ChipsDeTamanho
        tamanhos={molde.tamanhos}
        ativo={escolhido || peca?.tamanho || baseDaGrade}
        comDesenho={new Set(Object.keys(doGrupo?.porTamanho ?? {}))}
        aoEscolher={setTamanhoAtivo}
        verTamanhos={verTamanhos}
        aoVerTamanhos={setVerTamanhos}
        aoAbrirGrade={() => setGradeAberta(true)}
      />
      {gradeAberta && <JanelaDaGrade molde={molde} aoFechar={() => setGradeAberta(false)} />}
      {perguntando && (
        <JanelaDeSubstituir
          alvos={perguntando.filter((a) => a.acao === "perguntar")
            .map((a) => ({ chave: chaveDoAlvo(a), nome: a.nome, tamanho: a.tamanho, origem: a.origem }))}
          aoCancelar={() => setPerguntando(null)}
          aoConfirmar={(escolhidos) => {
            // Planeja de novo: com a janela aberta, um Ctrl+Z pode ter mudado a
            // lista de peças (desfeito um "Tirar" da Grade, por exemplo), e os
            // índices do plano de antes apontariam para OUTRA peça. Do plano
            // novo, só os alvos que a pessoa pediu — e, dos perguntados, os marcados.
            const pedidos = new Set(perguntando.map(chaveDoAlvo));
            setPerguntando(null);
            const agora: AlvoDeGeracao[] = planejarGeracao(molde.pecas, molde.tamanhos, null);
            aplicarAlvos(agora.filter((a) => pedidos.has(chaveDoAlvo(a)) && (a.acao !== "perguntar" || escolhidos.has(chaveDoAlvo(a)))));
          }}
        />
      )}
      <div className="flex min-h-0 flex-1">
        <ListaDePecas molde={molde} moldeId={id} grupo={doGrupo?.grupo ?? 0} aoEscolherGrupo={setGrupo} />
        <div className="min-w-0 flex-1">
          {semDesenho ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-tinta-fraca">
              <p className="m-0">Esta peça ainda não tem o tamanho {escolhido}.</p>
              <p className="m-0">Gradue a partir do base (ferramenta Graduar) ou junte um molde como {escolhido}.</p>
              <button type="button" className="btn secondary btn-sm" onClick={() => setTamanhoAtivo("")}>Ver o base</button>
            </div>
          ) : (
          <Mesa
            pecas={doTamanho.map((x) => x.p)}
            indice={naMesa}
            camadas={ferramenta === "graduar" ? previa : camadas}
            regras={regrasNaMesa}
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
            editor={editor}
          />
          )}
        </div>
        {ferramenta === "graduar" ? (
          <BlocoDaGraduacao base={pecaDaBase} baseDaGrade={baseDaGrade} grade={molde.tamanhos}
            noDaRegra={noAtivo} aoMudarGraduacao={mudarGraduacao} aoGerar={gerar} />
        ) : (
          peca && !semDesenho && <PainelDaPeca peca={peca} aoMudar={mudarEsta} aoMudarGrupo={mudarGrupo} />
        )}
      </div>
    </div>
  );
}
