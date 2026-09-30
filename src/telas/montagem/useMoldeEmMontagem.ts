/**
 * ===========================================================================
 * O MOLDE EM MONTAGEM — carregar, desfazer e gravar sozinho
 * ===========================================================================
 *
 * A Montagem não tem botão de salvar: grava um segundo depois da última
 * mexida. O molde já está no banco desde que o Digitalizar o criou, e a pessoa
 * não pode perder meia hora de pique porque a luz piscou.
 *
 * A gravação é o PUT inteiro (`moldesApi.regravar`), que troca as peças de
 * uma vez — o mesmo que o passo a passo antigo usa. As estampas (artes) ficam
 * noutra tabela e não são tocadas.
 *
 * ---------------------------------------------------------------------------
 * NUNCA DUAS AO MESMO TEMPO, NUNCA A VERSÃO VELHA POR ÚLTIMO
 * ---------------------------------------------------------------------------
 *
 * Cada mexida sobe a `versao`. A gravação guarda qual versão mandou; se,
 * quando voltar, a versão já andou, o estado fica "pendente" e a próxima
 * rodada manda a nova. Uma gravação só por vez (`emVoo`): duas PUT
 * concorrentes poderiam chegar fora de ordem e a velha ganhar — por isso quem
 * chega e encontra uma gravação em voo ESPERA A FILA TODA esvaziar (não só a
 * que estava lá quando entrou), e só solta a vaga (`emVoo`) quem ainda é o
 * dono dela; ver `gravar` abaixo.
 *
 * ---------------------------------------------------------------------------
 * A VERSÃO ANDA JUNTO COM O DADO, NUNCA SOZINHA
 * ---------------------------------------------------------------------------
 *
 * `versao.current++` acontece na hora (síncrono, dentro do próprio evento);
 * `atual.current` — o snapshot que a gravação lê — só é atualizado quando o
 * componente RENDERIZA de novo. Entre uma coisa e outra pode haver uma chamada
 * direta a `gravar()` (por exemplo, um botão que faz `mudarPeca(...)` e na
 * sequência `gravar("pronto")`, sem esperar o React re-renderizar): naquele
 * instante `versao.current` já subiu, mas `atual.current.pecas` ainda é o
 * valor de ANTES da mexida. Se `gravar` lesse a versão de um lugar e o dado de
 * outro, mandaria a peça velha etiquetada como se fosse a versão nova — e ao
 * voltar marcaria "salvo" um trabalho que nunca chegou ao servidor.
 *
 * A correção é fazer `versao` e `pecas`/`nome`/`observacoes` viajarem sempre
 * PAREADOS no mesmo objeto (`atual.current`), atualizados juntos a cada
 * render. `gravar` lê os quatro campos de uma vez só: manda sempre o dado que
 * de fato corresponde ao número que está mandando, nunca uma mistura dos
 * dois. Se a mexida ficou de fora por chegar cedo demais, a comparação com a
 * `versao.current` AO VIVO (feita depois que o PUT volta) acusa que ainda há
 * mexida sem mandar, o estado vira "pendente" de novo, e o temporizador manda
 * o resto na rodada seguinte.
 *
 * Margem que se cruza (ver `motores/margemDeCostura.js`) NÃO é gravada: o
 * banco fica com o último contorno bom, a peça aparece em vermelho, e o
 * `problema` diz qual.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { moldesApi, type Marcacoes, type PecaDoMolde, type SituacaoDoMolde, type TamanhoDoMolde } from "../../api/moldes";
import type { NoDoRisco } from "../../api/risco";
import { ErroDaApi } from "../../api/cliente";
import { pecaParaGravar, pecaParaMontar } from "../../motores/montagem";
import { completarGrupos, tamanhosDoMolde } from "../../motores/tamanhos";

export type PecaEmMontagem = PecaDoMolde & { nos: NoDoRisco[]; marcacoes: Marcacoes };
export type EstadoDaGravacao = "salvo" | "pendente" | "salvando" | "erro";

/** Uma peça em todos os tamanhos: `porTamanho[t]` é o índice na lista de peças. */
export interface GrupoDePecas { grupo: number; porTamanho: Record<string, number> }

export interface MoldeEmMontagem {
  carregando: boolean;
  naoAchado: boolean;
  /** A carga deu erro que não é "sumiu" (rede, servidor fora). `null` = carregou. */
  erroAoAbrir: string | null;
  nome: string;
  situacao: SituacaoDoMolde;
  pecas: PecaEmMontagem[];
  /** A grade de tamanhos, com cor e o base. Ver `motores/tamanhos.js`. */
  tamanhos: TamanhoDoMolde[];
  /** A linha preta em volta de cada peça, em mm (0 = sem). Vale para o molde todo. */
  linha: number;
  gravacao: EstadoDaGravacao;
  /** Por que a última gravação não foi: margem que se cruza, servidor fora. */
  problema: { peca: number | null; texto: string } | null;
  podeDesfazer: boolean;
  lembrar(): void;
  desfazer(): void;
  mudarPecas(mudar: (antes: PecaEmMontagem[]) => PecaEmMontagem[], lembrarAntes?: boolean): void;
  mudarPeca(indice: number, mudar: (peca: PecaEmMontagem) => PecaEmMontagem, lembrarAntes?: boolean): void;
  renomear(nome: string): void;
  /** Muda a linha em volta da peça (mm): um passo no desfazer, e grava como as outras mexidas. */
  mudarLinha(mm: number): void;
  mudarTamanhos(mudar: (antes: TamanhoDoMolde[]) => TamanhoDoMolde[]): void;
  /** Grava agora (e muda a situação, se pedido). `true` se ficou tudo salvo. */
  gravar(situacao?: SituacaoDoMolde): Promise<boolean>;
  /** Tenta abrir de novo depois de um `erroAoAbrir`. */
  tentarAbrirDeNovo(): void;
}

const ESPERA_PARA_GRAVAR = 1000;
const PASSOS_DE_DESFAZER = 40;

export function useMoldeEmMontagem(id: number): MoldeEmMontagem {
  const [carregando, setCarregando] = useState(true);
  const [naoAchado, setNaoAchado] = useState(false);
  const [erroAoAbrir, setErroAoAbrir] = useState<string | null>(null);
  // Sobe a cada `tentarAbrirDeNovo()`, só para forçar o efeito de carga a
  // rodar de novo sem depender do `id` (que não muda numa nova tentativa).
  const [tentativa, setTentativa] = useState(0);
  const [nome, setNome] = useState("");
  const [observacoes, setObservacoes] = useState<string | null>(null);
  const [situacao, setSituacao] = useState<SituacaoDoMolde>("pronto");
  const [pecas, setPecas] = useState<PecaEmMontagem[]>([]);
  const [tamanhos, setTamanhos] = useState<TamanhoDoMolde[]>([]);
  const [linha, setLinha] = useState(0);
  const [gravacao, setGravacao] = useState<EstadoDaGravacao>("salvo");
  const [problema, setProblema] = useState<MoldeEmMontagem["problema"]>(null);
  const [pilha, setPilha] = useState<{ pecas: PecaEmMontagem[]; tamanhos: TamanhoDoMolde[]; linha: number }[]>([]);

  const versao = useRef(0);
  const gravada = useRef(0);
  const emVoo = useRef<Promise<boolean> | null>(null);
  // Vira `true` só depois da carga dar certo — antes disso não há molde de
  // verdade para gravar, e uma mexida "fantasma" (ou o efeito de desmontar)
  // não pode mandar um PUT vazio por cima do que está no banco.
  const carregouOk = useRef(false);

  // O snapshot que a gravação lê, sempre com a VERSÃO que valia quando este
  // render aconteceu — nunca a versão "ao vivo" isolada. Ver a nota grande no
  // topo do arquivo ("A VERSÃO ANDA JUNTO COM O DADO").
  const atual = useRef({ nome, observacoes, pecas, tamanhos, linha, versao: 0 });
  atual.current = { nome, observacoes, pecas, tamanhos, linha, versao: versao.current };

  useEffect(() => {
    let vivo = true;
    carregouOk.current = false;
    moldesApi.abrir(id)
      .then((m) => {
        if (!vivo) return;
        setNome(m.nome);
        setObservacoes(m.observacoes);
        setSituacao(m.situacao);
        // Molde de antes da linha (ou servidor antigo): sem o campo, é sem linha.
        setLinha(m.linha ?? 0);
        // Molde de antes da graduação não tem grupo: ele sai da posição da
        // peça dentro do seu tamanho (ver `completarGrupos`).
        const montadas = completarGrupos(m.pecas.map((p) => pecaParaMontar(p) as PecaEmMontagem));
        setPecas(montadas);
        setTamanhos(tamanhosDoMolde(montadas, m.tamanhos ?? []));
        carregouOk.current = true;
      })
      .catch((e) => {
        if (!vivo) return;
        if (e instanceof ErroDaApi && e.status === 404) { setNaoAchado(true); return; }
        // Rede caiu, servidor fora, 500: não é "o molde sumiu", é "não deu
        // para saber". Sem isto a tela ficava com 0 peças e "salvo" — como se
        // o molde estivesse vazio de propósito.
        setErroAoAbrir(e instanceof Error ? e.message : "Não consegui abrir o molde.");
      })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [id, tentativa]);

  const tentarAbrirDeNovo = useCallback(() => {
    setNaoAchado(false);
    setErroAoAbrir(null);
    setCarregando(true);
    setTentativa((t) => t + 1);
  }, []);

  const marcarMexida = () => {
    // Sem carga bem-sucedida não há versão nenhuma para perseguir: ver
    // `carregouOk` acima.
    if (!carregouOk.current) return;
    versao.current++;
    setGravacao("pendente");
  };

  // Peças, grade e linha: desfazer uma junção tira também o tamanho que ela criou.
  const lembrar = useCallback(() => {
    setPilha((p) => [...p.slice(-(PASSOS_DE_DESFAZER - 1)),
      { pecas: atual.current.pecas, tamanhos: atual.current.tamanhos, linha: atual.current.linha }]);
  }, []);

  const desfazer = useCallback(() => {
    setPilha((p) => {
      if (p.length === 0) return p;
      const topo = p[p.length - 1]!;
      setPecas(topo.pecas);
      setTamanhos(topo.tamanhos);
      setLinha(topo.linha);
      marcarMexida();
      return p.slice(0, -1);
    });
  }, []);

  const mudarPecas = useCallback((mudar: (antes: PecaEmMontagem[]) => PecaEmMontagem[], lembrarAntes = true) => {
    if (lembrarAntes) lembrar();
    setPecas(mudar);
    marcarMexida();
  }, [lembrar]);

  const mudarPeca = useCallback((indice: number, mudar: (peca: PecaEmMontagem) => PecaEmMontagem, lembrarAntes = true) => {
    mudarPecas((antes) => antes.map((p, i) => (i === indice ? mudar(p) : p)), lembrarAntes);
  }, [mudarPecas]);

  const mudarTamanhos = useCallback((mudar: (antes: TamanhoDoMolde[]) => TamanhoDoMolde[]) => {
    setTamanhos(mudar);
    marcarMexida();
  }, []);

  const renomear = useCallback((novo: string) => {
    setNome(novo);
    marcarMexida();
  }, []);

  const mudarLinha = useCallback((mm: number) => {
    lembrar();
    setLinha(mm);
    marcarMexida();
  }, [lembrar]);

  const gravar = useCallback(async (novaSituacao?: SituacaoDoMolde): Promise<boolean> => {
    // Sem carga bem-sucedida, não há o que mandar — nem placeholder vazio.
    if (!carregouOk.current) return false;

    /*
     * UMA GRAVAÇÃO POR VEZ, EM FILA. `while` (e não `if`) porque quem chega
     * aqui pode não ser o único esperando: enquanto este `await` dorme, outra
     * chamada a `gravar()` pode ter entrado, visto `emVoo.current` livre por
     * um instante e partido na frente. O `while` garante que só se segue
     * quando a vaga estiver REALMENTE livre, não só na primeira olhada.
     */
    while (emVoo.current) await emVoo.current;

    // Versão e dado do MESMO snapshot — nunca a versão de um render com o
    // `pecas` de outro (ver a nota grande no topo do arquivo).
    const { nome: nomeAgora, observacoes: obsAgora, pecas: pecasAgora, tamanhos: tamanhosAgora, linha: linhaAgora, versao: mandada } = atual.current;
    if (!novaSituacao && mandada === gravada.current) return true;

    const prontas = [];
    for (let i = 0; i < pecasAgora.length; i++) {
      const g = pecaParaGravar(pecasAgora[i]);
      if (!g.peca) {
        setProblema({ peca: i, texto: `Peça ${i + 1}: ${g.erro}.` });
        setGravacao("erro");
        return false;
      }
      prontas.push(g.peca);
    }

    setGravacao("salvando");
    const voo: Promise<boolean> = moldesApi.regravar(id, {
      nome: nomeAgora.trim() || "Molde sem nome",
      observacoes: obsAgora ?? "",
      pecas: prontas.map(({ id: _id, ...resto }) => resto),
      // Recalculada: um tamanho que veio numa junção entra, a ordem se refaz.
      tamanhos: tamanhosDoMolde(pecasAgora, tamanhosAgora),
      linha: linhaAgora,
      ...(novaSituacao ? { situacao: novaSituacao } : {}),
    })
      .then(() => {
        gravada.current = mandada;
        if (novaSituacao) setSituacao(novaSituacao);
        setProblema(null);
        // A versão AO VIVO pode ter andado mais do que a que foi mandada —
        // seja por mexida nova durante o voo, seja por uma mexida que ficou
        // de fora do snapshot por ter chegado cedo demais (ver a nota do
        // topo). Só é "salvo" se ninguém ficou para trás.
        setGravacao(versao.current === mandada ? "salvo" : "pendente");
        return true;
      })
      .catch((e) => {
        setProblema({ peca: null, texto: `Não consegui salvar: ${e instanceof Error ? e.message : String(e)}` });
        setGravacao("erro");
        return false;
      })
      .finally(() => {
        // Só esvazia a vaga se ainda for A NOSSA gravação: enquanto o `while`
        // acima dormia, outra `gravar()` pode ter posto a dela ali — e nesse
        // caso não é esta que deve liberá-la.
        if (emVoo.current === voo) emVoo.current = null;
      });
    emVoo.current = voo;
    return voo;
  }, [id]);

  // Grava sozinho um segundo depois da última mexida.
  useEffect(() => {
    if (gravacao !== "pendente") return;
    const espera = window.setTimeout(() => { void gravar(); }, ESPERA_PARA_GRAVAR);
    return () => window.clearTimeout(espera);
  }, [gravacao, pecas, nome, gravar]);

  // Fechar a JANELA (fechar a aba, recarregar) com mexida não salva pergunta
  // antes. Sair da TELA por dentro do programa (trocar de molde, ir para
  // outro menu) é o efeito de desmontar logo abaixo — ali não dá para
  // perguntar nada, então ele grava sozinho.
  useEffect(() => {
    if (gravacao === "salvo") return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [gravacao]);

  /*
   * GRAVA AO SAIR DA TELA, MESMO DENTRO DO SEGUNDO DE ESPERA.
   *
   * A Montagem é rota `lazy` e some (troca de molde via `key`, saída pelo
   * menu) sem avisar ninguém — o `useEffect` do temporizador acima só limpa o
   * `setTimeout`, e uma mexida feita no último segundo antes de sair ficaria
   * só na tela, nunca chegando ao banco.
   *
   * `gravarRef` guarda sempre a `gravar` mais nova (ela é estável por `id`,
   * mas o hábito de ler pela ref evita depender da ordem de efeitos). O efeito
   * de desmontar em si tem `deps: []` de propósito — só quer rodar a limpeza
   * uma vez, quando o componente sai de cena de verdade.
   */
  const gravarRef = useRef(gravar);
  useEffect(() => { gravarRef.current = gravar; }, [gravar]);

  useEffect(() => {
    return () => {
      if (carregouOk.current && versao.current !== gravada.current) {
        void gravarRef.current();
      }
    };
  }, []);

  // A grade que a tela vê: a guardada (tamanhos declarados, mesmo sem desenho)
  // mais os tamanhos que só existem nas peças, com as cores guardadas.
  const tamanhosDasPecas = useMemo(() => tamanhosDoMolde(pecas, tamanhos) as TamanhoDoMolde[], [pecas, tamanhos]);

  return {
    carregando, naoAchado, erroAoAbrir, nome, situacao, pecas, tamanhos: tamanhosDasPecas, linha, gravacao, problema,
    podeDesfazer: pilha.length > 0,
    lembrar, desfazer, mudarPecas, mudarPeca, renomear, mudarLinha, mudarTamanhos, gravar, tentarAbrirDeNovo,
  };
}
