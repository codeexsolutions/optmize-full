/**
 * ===========================================================================
 * O ESTADO DO EXTRATOR — a foto, a leitura, os cliques e os elementos
 * ===========================================================================
 *
 * A tela (`Extrator.tsx`) desenha o que este gancho guarda; as contas moram
 * nos motores (pelo `trabalhador`) e no servidor (pela `extratorApi`).
 *
 * TRÊS CUIDADOS QUE NÃO APARECEM NA TELA, e que a bancada confere:
 *
 *   - a foto é lida no servidor UMA vez, e o clique que chega enquanto ela
 *     ainda está sendo lida espera essa leitura, em vez de pedir outra;
 *   - a máscara mostrada é sempre a do ÚLTIMO pedido: o anterior é abortado,
 *     e a resposta velha que chegar depois é jogada fora;
 *   - a leitura vencida (o servidor reiniciou, ou passou meia hora) é refeita
 *     sozinha, e o clique repetido — sem erro na cara do operador.
 *
 * Os cliques moram também numa ref: dois cliques seguidos não podem depender
 * de a tela ter redesenhado entre eles para o segundo saber do primeiro.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { extratorApi, LeituraVencida, type EstadoDoExtrator, type Leitura, type MascaraLida } from "../../api/extrator";
import { avisoDaMascara, coberturaDaMascara, coresSugeridas, jeitoSugerido } from "../../motores/extrator";
import { dataUrlDoRecorte, lerFoto, trabalhoDe } from "./desenho";
import { trabalhador } from "./trabalhador";
import type { CaixaDoClique, Elemento, Imagem, Jeito, Mascara, Ponto, PontoDoClique, Recorte, Trabalho } from "./tipos";

type Mudanca = Partial<Pick<Elemento, "nome" | "jeito" | "cores" | "juntarSombras" | "tamanho">>;

export function useExtrator() {
  const [estado, setEstado] = useState<EstadoDoExtrator | null>(null);
  const [foto, setFoto] = useState<Imagem | null>(null);
  const [nomeDaFoto, setNomeDaFoto] = useState("");
  const [trabalho, setTrabalho] = useState<Trabalho | null>(null);
  const [lendo, setLendo] = useState(false);
  const [pontos, setPontos] = useState<PontoDoClique[]>([]);
  const [caixa, setCaixa] = useState<CaixaDoClique | null>(null);
  const [mascara, setMascara] = useState<Mascara | null>(null);
  const [procurando, setProcurando] = useState(false);
  const [elementos, setElementos] = useState<Elemento[]>([]);
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const estadoPedido = useRef<Promise<EstadoDoExtrator> | null>(null);
  const trabalhoAtual = useRef<Trabalho | null>(null);
  const leitura = useRef<{ de: Trabalho; leitura: Leitura } | null>(null);
  const lendoAgora = useRef<{ de: Trabalho; promessa: Promise<Leitura> } | null>(null);
  const cliques = useRef<{ pontos: PontoDoClique[]; caixa: CaixaDoClique | null }>({ pontos: [], caixa: null });
  const pedidoDaVez = useRef(0);
  const controle = useRef<AbortController | null>(null);
  const proximoId = useRef(1);

  /** O estado da rede, perguntado uma vez (e de novo, se a pergunta falhou). */
  const oEstado = useCallback(() => {
    if (!estadoPedido.current) {
      estadoPedido.current = extratorApi.estado().then(
        (e) => { setEstado(e); return e; },
        (e: unknown) => { estadoPedido.current = null; throw e; },
      );
    }
    return estadoPedido.current;
  }, []);

  useEffect(() => { oEstado().catch((e: Error) => setErro(e.message)); }, [oEstado]);

  // O bitmap da foto anterior NÃO é fechado à mão: num efeito, o StrictMode
  // roda a limpeza logo depois de montar e a mesa desenharia um bitmap
  // fechado. Ele tem no máximo 2048 × 2048, e o coletor de lixo o solta.

  /** A leitura desta foto: a guardada, a que já está a caminho, ou uma nova. */
  const lerNoServidor = useCallback((t: Trabalho, deNovo = false): Promise<Leitura> => {
    if (!deNovo && leitura.current?.de === t) return Promise.resolve(leitura.current.leitura);
    if (lendoAgora.current?.de === t) return lendoAgora.current.promessa;
    setLendo(true);
    const promessa: Promise<Leitura> = extratorApi.ler(t.jpeg)
      .then((l) => {
        if (trabalhoAtual.current === t) leitura.current = { de: t, leitura: l };
        return l;
      })
      .finally(() => {
        if (lendoAgora.current?.promessa === promessa) lendoAgora.current = null;
        setLendo(false);
      });
    lendoAgora.current = { de: t, promessa };
    return promessa;
  }, []);

  const pedirMascara = useCallback(async (novos: PontoDoClique[], novaCaixa: CaixaDoClique | null) => {
    const t = trabalhoAtual.current;
    if (!t) return;
    const vez = ++pedidoDaVez.current;
    controle.current?.abort();
    if (!novaCaixa && !novos.some((p) => p.inclui)) {
      setMascara(null);
      setProcurando(false);
      return;
    }
    const c = new AbortController();
    controle.current = c;
    setProcurando(true);
    try {
      let l = await lerNoServidor(t);
      let m: MascaraLida;
      try {
        m = await extratorApi.mascara(l.id, novos, novaCaixa, c.signal);
      } catch (e) {
        if (!(e instanceof LeituraVencida)) throw e;
        l = await lerNoServidor(t, true);
        m = await extratorApi.mascara(l.id, novos, novaCaixa, c.signal);
      }
      if (vez !== pedidoDaVez.current) return;
      setMascara({ ...m, cobertura: coberturaDaMascara(m.alfa), pontos: novos.length + (novaCaixa ? 1 : 0) });
      setErro(null);
    } catch (e) {
      if ((e as Error).name === "AbortError" || vez !== pedidoDaVez.current) return;
      setErro((e as Error).message);
    } finally {
      if (vez === pedidoDaVez.current) setProcurando(false);
    }
  }, [lerNoServidor]);

  /** Troca os cliques e pede a máscara deles. */
  const mudarCliques = useCallback((novos: PontoDoClique[], novaCaixa: CaixaDoClique | null) => {
    cliques.current = { pontos: novos, caixa: novaCaixa };
    setPontos(novos);
    setCaixa(novaCaixa);
    void pedirMascara(novos, novaCaixa);
  }, [pedirMascara]);

  const clicar = useCallback((p: PontoDoClique) => mudarCliques([...cliques.current.pontos, p], cliques.current.caixa), [mudarCliques]);
  const passarCaixa = useCallback((c: CaixaDoClique) => mudarCliques(cliques.current.pontos, c), [mudarCliques]);
  const desfazerClique = useCallback(() => {
    const { pontos: atuais, caixa: atual } = cliques.current;
    if (atuais.length === 0) mudarCliques([], null);
    else mudarCliques(atuais.slice(0, -1), atual);
  }, [mudarCliques]);

  const limparCliques = useCallback(() => {
    pedidoDaVez.current++;
    controle.current?.abort();
    cliques.current = { pontos: [], caixa: null };
    setPontos([]);
    setCaixa(null);
    setMascara(null);
    setProcurando(false);
  }, []);

  /** Uma foto nova (aberta ou endireitada) entra na mesa e vai ser lida. */
  const usar = useCallback(async (nova: Imagem) => {
    const t = await trabalhoDe(nova);
    trabalhoAtual.current = t;
    leitura.current = null;
    limparCliques();
    setFoto(nova);
    setTrabalho(t);
    const e = await oEstado();
    // Sem esperar: o clique que vier antes do fim da leitura espera ela sozinho.
    if (e.pronta) lerNoServidor(t).catch((falha: Error) => setErro(falha.message));
  }, [limparCliques, lerNoServidor, oEstado]);

  const abrir = useCallback(async (file: File) => {
    setErro(null);
    setOcupado("Abrindo a foto…");
    try {
      const nova = await lerFoto(file);
      setNomeDaFoto(file.name.replace(/\.[^.]+$/, ""));
      await usar(nova);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado("");
    }
  }, [usar]);

  /** Endireita a foto pelos quatro cantos marcados na mesa (na medida da foto de trabalho). */
  const endireitar = useCallback(async (cantosNaMesa: Ponto[]) => {
    const t = trabalhoAtual.current;
    if (!foto || !t) return;
    setErro(null);
    setOcupado("Endireitando a foto…");
    try {
      const cantos = cantosNaMesa.map((p) => ({ x: p.x / t.escala, y: p.y / t.escala }));
      const r = await trabalhador.desentortar(foto, cantos);
      if (!r) throw new Error("Os quatro cantos se cruzaram: arraste cada um para o seu canto da estampa.");
      await usar({ pixels: r.rgba, largura: r.largura, altura: r.altura });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado("");
    }
  }, [foto, usar]);

  const acrescentar = useCallback((r: Recorte, nome?: string) => {
    const id = proximoId.current++;
    const el: Elemento = {
      id, nome: nome || `Elemento ${id}`, recorte: r, miniatura: dataUrlDoRecorte(r, 96),
      jeito: jeitoSugerido(r.rgba) as Jeito, cores: coresSugeridas(r.rgba), juntarSombras: 50, tamanho: { tipo: "4k" },
    };
    setElementos((antes) => [...antes, el]);
    setEscolhido(id);
  }, []);

  const guardar = useCallback(async () => {
    if (!foto || !mascara) return;
    const aviso = avisoDaMascara(mascara.cobertura);
    if (aviso) {
      setErro(aviso);
      return;
    }
    setErro(null);
    setOcupado("Recortando o elemento…");
    try {
      const r = await trabalhador.recortar(foto, mascara.alfa, mascara.largura, mascara.altura);
      if (!r) throw new Error("A rede não achou nada aqui; clique mais perto do elemento.");
      acrescentar(r);
      limparCliques();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado("");
    }
  }, [foto, mascara, acrescentar, limparCliques]);

  /** A imagem inteira como elemento: o PNG já recortado, ou o que fazer sem a rede. */
  const guardarInteira = useCallback(async () => {
    if (!foto) return;
    setErro(null);
    setOcupado("Guardando a imagem inteira…");
    try {
      const r = await trabalhador.inteira(foto);
      if (!r) throw new Error("A imagem é toda transparente: não há o que guardar.");
      acrescentar(r, nomeDaFoto);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado("");
    }
  }, [foto, nomeDaFoto, acrescentar]);

  const mudarElemento = useCallback((id: number, mudanca: Mudanca) => {
    setElementos((antes) => antes.map((e) => (e.id === id ? { ...e, ...mudanca } : e)));
  }, []);

  const removerElemento = useCallback((id: number) => {
    setElementos((antes) => antes.filter((e) => e.id !== id));
    setEscolhido((atual) => (atual === id ? null : atual));
  }, []);

  return {
    estado, foto, nomeDaFoto, trabalho, lendo, pontos, caixa, mascara, procurando, elementos, escolhido, ocupado, erro,
    setErro, setEscolhido, abrir, endireitar, clicar, passarCaixa, desfazerClique, limparCliques,
    guardar, guardarInteira, mudarElemento, removerElemento,
  };
}

export type Extrator = ReturnType<typeof useExtrator>;
