/**
 * ===========================================================================
 * IMAGEM — resolução para o que vai ser impresso
 * ===========================================================================
 *
 * A pergunta que chega aqui costuma ser "dá para melhorar essa imagem?". A
 * resposta honesta tem três partes, e a tela dá as três nesta ordem:
 *
 *   1. ELA PRECISA MELHORAR? Uma imagem de 1000 px impressa a 10 cm sai a
 *      254 dpi e está ótima; a MESMA impressa a 1,20 m sai a 21 dpi e não há
 *      algoritmo que salve. Sem o tamanho de impressão na mão, "melhorar" não
 *      quer dizer nada — por isso o tamanho é a primeira coisa que se pergunta,
 *      e não uma opção escondida.
 *
 *   2. SE FOR LOGO, NÃO É AQUI. Arte chapada vetorizada dá resolução infinita
 *      e não inventa nada. A tela reconhece esse caso e aponta para o Vetor,
 *      em vez de fingir que ampliar é equivalente.
 *
 *   3. SE FOR FOTO, A REDE. Aí sim vale ampliar com o Real-ESRGAN, que
 *      reconstrói detalhe plausível.
 *
 * ---------------------------------------------------------------------------
 * O QUE A REDE FAZ, DITO SEM ENFEITE
 * ---------------------------------------------------------------------------
 *
 * Ela INVENTA. O detalhe que aparece não estava no arquivo: é o que a rede
 * aprendeu que costuma existir ali. Em textura — pele, tecido, folhagem — isso
 * é exatamente o que se quer. Em rosto conhecido e em letra pequena, o que ela
 * inventa pode não ser o que estava escrito. A tela avisa isso onde importa, e
 * o antes/depois existe para a conferência ser possível, e não decorativa.
 *
 * ---------------------------------------------------------------------------
 * TRÊS COISAS QUE ESTA TELA APRENDEU DEPOIS DE ALGUÉM USAR
 * ---------------------------------------------------------------------------
 *
 * O primeiro uso de verdade devolveu "deu certo mas saiu meio estranho", e o
 * estranho tinha três nomes: a cor mudou, ficou plastificado, e apareceu halo
 * nas bordas. A cor era defeito, e está consertada no worker. Os outros dois
 * são a rede sendo a rede — e para eles a resposta não é um conserto, é dar
 * controle e dar como ver:
 *
 *   A PROVA. A rede roda primeiro num pedaço do meio da imagem, em segundos.
 *   Descobrir que ficou estranho tem que ser barato; antes disso custava dois
 *   minutos de espera para então se arrepender.
 *
 *   A LUPA. Miniatura lado a lado não serve para julgar nada — o defeito que
 *   incomoda na impressão tem o tamanho de um pixel. A comparação é 1:1, e é
 *   entre a AMPLIAÇÃO LIMPA e a rede, porque é essa a decisão de verdade: vale
 *   o que a rede inventou, ou era melhor sem ela?
 *
 *   A DOSE. Uma barra entre as duas. Plastificado e halo são o exagero da
 *   rede, e a dose é o remédio: em 70% costuma sobrar o ganho e sumir o ar de
 *   plástico. Ela mistura duas imagens já prontas, então mexer na barra é
 *   instantâneo — a rede não roda de novo.
 *
 * ---------------------------------------------------------------------------
 * ONDE O TRABALHO ACONTECE, E O QUE MUDOU NO PORTE
 * ---------------------------------------------------------------------------
 *
 * No navegador, em worker (`motores/imagemWorker.js`). **Nada sobe para
 * servidor nenhum**: a arte do cliente não sai da máquina da gráfica.
 *
 * Veio de `public/imagem.js`. O diagnóstico — que era conta pura no meio da
 * tela — foi para `motores/diagnosticoDaImagem.js` sem uma linha alterada. O
 * que sobrou aqui é o que mexe com canvas, com o worker e com a tela.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Cartao } from "../casca/Cartao";
import { Icone } from "../casca/Icone";
import {
  ESPERA_CONFORTAVEL_MS, REDES, dpiNaLargura, pareceArteChapada,
  planoDaImagem, vereditoDoDpi,
} from "../motores/diagnosticoDaImagem";

/** O tamanho da janela da lupa, em pixels de tela. */
const LUPA_LARGURA = 300;
const LUPA_ALTURA = 220;

/** O lado do quadrado que a prova recorta. Dois ladrilhos da rede. */
const LADO_DA_PROVA = 224;

type NomeDaRede = "rapido" | "capricho";

interface Item {
  id: number;
  nome: string;
  bytes: number;
  antes: ImageData;
  /** O que a lupa e o download usam, já com a dose. */
  depois: ImageData | null;
  /** O resultado puro da rede. */
  resultadoDaRede: ImageData | null;
  /** A ampliação sem rede, o outro extremo da dose. */
  limpo: ImageData | null;
  /** Veio de um pedaço só? */
  ehProva: boolean;
  ondeRodou: string | null;
  chapada: boolean;
  larguraCm: number;
  andamento: { etapa: string; feitos?: number; total?: number; restaMs?: number } | null;
  erro: string | null;
  rede: NomeDaRede | null;
  dose: number;
  vista: { x: number; y: number };
}

interface Plano {
  escala: number;
  largura: number;
  altura: number;
  ladrilhos: number;
  tempos: Record<string, { ladrilhos: number; ms: number }>;
  cortadaPeloTeto: boolean;
  dpiQueDa: number | null;
  jaBasta: boolean;
  grandeDemais: boolean;
  demorado: boolean;
}

export function Imagem() {
  const [itens, setItens] = useState<Item[]>([]);
  const [trabalhando, setTrabalhando] = useState<number | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const proximoId = useRef(1);
  const worker = useRef<Worker | null>(null);

  useEffect(() => () => { worker.current?.terminate(); }, []);

  const mexerNoItem = useCallback((id: number, mudanca: Partial<Item>) => {
    setItens((antes) => antes.map((i) => (i.id === id ? { ...i, ...mudanca } : i)));
  }, []);

  const receber = useCallback(async (arquivos: File[]) => {
    const novos: Item[] = [];
    for (const arquivo of arquivos) {
      if (!/^image\//.test(arquivo.type)) continue;
      try {
        const dados = await lerImagem(arquivo);
        novos.push({
          id: proximoId.current++,
          nome: arquivo.name,
          bytes: arquivo.size,
          antes: dados,
          depois: null,
          resultadoDaRede: null,
          limpo: null,
          ehProva: false,
          ondeRodou: null,
          chapada: pareceArteChapada(dados),
          // Um palpite para a conta já aparecer preenchida.
          larguraCm: 30,
          andamento: null,
          erro: null,
          rede: null,
          dose: REDES.rapido.dose,
          vista: { x: 0, y: 0 },
        });
      } catch {
        // Arquivo que o navegador não abre: passa adiante em silêncio, do
        // mesmo jeito que a casca antiga fazia.
      }
    }
    if (novos.length) setItens((antes) => [...antes, ...novos]);
  }, []);

  const pegarWorker = useCallback(() => {
    if (!worker.current) {
      worker.current = new Worker(new URL("../motores/imagemWorker.js", import.meta.url), { type: "module" });
    }
    return worker.current;
  }, []);

  /**
   * Roda a rede. Com `ehProva`, só num recorte do meio — segundos em vez de
   * minutos, e o suficiente para ver se o resultado agrada.
   */
  const ampliarComRede = useCallback((item: Item, plano: Plano, ehProva: boolean) => {
    const w = pegarWorker();
    setTrabalhando(item.id);
    mexerNoItem(item.id, { erro: null, andamento: { etapa: "runtime" } });

    const fonte = ehProva ? recorteDaProva(item.antes) : item.antes;
    const copia = new Uint8ClampedArray(fonte.data);
    const qualRede = redeEscolhida(item, plano);

    /*
     * Sem isto, um worker que morre (modelo que não carrega, memória que
     * acaba) deixa `trabalhando` preso para sempre e TODOS os botões da tela
     * apagados, sem dizer por quê. Foi assim que a primeira versão travou.
     */
    w.onerror = (evento) => {
      setTrabalhando(null);
      mexerNoItem(item.id, {
        andamento: null,
        erro: 'A rede parou: ' + (evento.message || "erro dentro do worker")
          + '. Tente de novo, ou use "Só ampliar".',
      });
      worker.current = null;   // o próximo clique cria um worker novo
    };

    w.onmessage = (evento) => {
      const dados = evento.data;

      if (dados.andamento) {
        mexerNoItem(item.id, { andamento: dados.andamento });
        return;
      }

      setTrabalhando(null);

      if (dados.erro) {
        mexerNoItem(item.id, { andamento: null, erro: dados.cancelado ? null : dados.erro });
        return;
      }

      const r = dados.resultado;
      const daRede = new ImageData(r.pixels, r.largura, r.altura);
      const limpo = new ImageData(r.limpo, r.largura, r.altura);
      /*
       * A dose ótima é a da rede que ROUDOU, e não a de quando o arquivo
       * entrou: trocar de rede sem trocar a dose entregaria o capricho
       * segurado em 70%, que é jogar fora metade do que se esperou.
       */
      const rede = (r.modelo || qualRede) as NomeDaRede;
      const dose = REDES[rede] ? REDES[rede].dose : item.dose;

      mexerNoItem(item.id, {
        andamento: null,
        resultadoDaRede: daRede,
        limpo,
        rede,
        dose,
        ehProva,
        ondeRodou: r.ondeRodou,
        depois: misturarDose(daRede, limpo, dose),
        // A lupa começa no meio: é onde a prova recortou, e onde o assunto
        // costuma estar.
        vista: {
          x: Math.max(0, Math.round((daRede.width - LUPA_LARGURA) / 2)),
          y: Math.max(0, Math.round((daRede.height - LUPA_ALTURA) / 2)),
        },
      });
    };

    w.postMessage(
      {
        id: item.id,
        pixels: copia.buffer,
        largura: fonte.width,
        altura: fonte.height,
        escala: plano.escala,
        modelo: qualRede,
      },
      [copia.buffer],
    );
  }, [mexerNoItem, pegarWorker]);

  const soAmpliar = (item: Item) => {
    // Sem rede não há dose nem comparação: os dois lados seriam iguais.
    const limpo = ampliarLimpo(item.antes);
    mexerNoItem(item.id, {
      limpo, resultadoDaRede: null, depois: limpo, ehProva: false, erro: null,
    });
  };

  return (
    <>
      <Cartao
        titulo="Melhorar a imagem"
        icone="icones.svg#image"
        apoio="Aumenta a resolução com rede neural, para imprimir grande sem borrar. Nada sai desta máquina."
        /* Enquanto não há imagem na mesa, é este que ocupa a janela. Com
           imagens, cada uma é um cartão e a leitura passa a ser corrida. */
        preencher={itens.length === 0}
      >
        <label
          onDragEnter={(e) => { e.preventDefault(); setArrastando(true); }}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            void receber(Array.from(e.dataTransfer?.files || []));
          }}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-[10px] border border-dashed px-4 py-8 text-center transition-colors ${
            arrastando ? "border-ambar bg-[var(--accent-soft)]" : "border-linha bg-painel-suave"
          }`}
        >
          <Icone referencia="icones.svg#zoom-in" className="size-7 text-tinta-apagada" />
          <span className="text-[0.88rem] text-tinta">Solte uma imagem aqui, ou escolha o arquivo</span>
          <span className="text-[0.75rem] text-tinta-apagada">PNG, JPG ou WEBP</span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const arquivos = Array.from(e.target.files || []);
              e.target.value = "";
              void receber(arquivos);
            }}
          />
        </label>
      </Cartao>

      {itens.map((item) => (
        <CartaoDaImagem
          key={item.id}
          item={item}
          ocupado={trabalhando !== null}
          aoMudar={mexerNoItem}
          aoRemover={() => setItens((antes) => antes.filter((i) => i.id !== item.id))}
          aoAmpliar={(plano, ehProva) => ampliarComRede(item, plano, ehProva)}
          aoSoAmpliar={() => soAmpliar(item)}
          aoCancelar={() => worker.current?.postMessage({ tipo: "cancelar" })}
        />
      ))}
    </>
  );
}

/* ========================================================================== */
/* O cartão de uma imagem                                                     */
/* ========================================================================== */

function CartaoDaImagem({ item, ocupado, aoMudar, aoRemover, aoAmpliar, aoSoAmpliar, aoCancelar }: {
  item: Item;
  ocupado: boolean;
  aoMudar: (id: number, mudanca: Partial<Item>) => void;
  aoRemover: () => void;
  aoAmpliar: (plano: Plano, ehProva: boolean) => void;
  aoSoAmpliar: () => void;
  aoCancelar: () => void;
}) {
  const plano = planoDaImagem(item) as Plano;
  const qualRede = redeEscolhida(item, plano);

  return (
    <Cartao>
      <div className="flex items-start gap-3 border-b border-linha pb-2.5">
        <Miniatura dados={item.antes} lado={120} className="size-14 shrink-0 rounded border border-linha object-contain" />
        <span className="min-w-0 flex-1">
          <strong className="block truncate text-[0.88rem] text-tinta">{item.nome}</strong>
          <span className="mt-0.5 block text-[0.72rem] text-tinta-apagada">{comoTamanho(item.bytes)}</span>
        </span>
        <button
          type="button"
          onClick={aoRemover}
          className="rounded-[8px] border border-linha px-2.5 py-1.5 text-[0.75rem] text-tinta-fraca transition-colors hover:text-tinta"
        >
          Tirar
        </button>
      </div>

      {/*
        A largura de impressão vem ANTES dos botões porque é ela que diz se
        algum deles é necessário. Perguntar depois seria pedir para a pessoa
        esperar um minuto para então descobrir que não precisava.
      */}
      <label className="flex flex-wrap items-center gap-1.5 border-b border-linha py-2 text-[0.78rem] text-tinta-apagada">
        Vai imprimir com
        <input
          type="number"
          min={1}
          step={1}
          value={item.larguraCm}
          onChange={(e) => aoMudar(item.id, { larguraCm: Number(e.target.value) || 1 })}
          className="w-20 rounded-[8px] border border-linha bg-painel-suave px-2 py-1 text-[0.8rem] text-tinta outline-none focus:border-[var(--accent-line)]"
        />
        cm de largura
      </label>

      {/*
        A linha "depois" mostra o que a IMAGEM INTEIRA vai dar, e nunca o
        tamanho da prova: a prova é um recorte, e anunciar os 331 px dela como
        resultado seria dizer que a foto encolheu.
      */}
      <div className="grid gap-1 py-2.5">
        <LinhaDoDpi larguraCm={item.larguraCm} largura={item.antes.width} altura={item.antes.height} rotulo="hoje" />
        {item.depois && !item.ehProva ? (
          <LinhaDoDpi larguraCm={item.larguraCm} largura={item.depois.width} altura={item.depois.height} rotulo="depois" />
        ) : !plano.jaBasta && !plano.grandeDemais ? (
          <LinhaDoDpi larguraCm={item.larguraCm} largura={plano.largura} altura={plano.altura} rotulo="vai dar" />
        ) : null}
      </div>

      {/*
        A escolha da rede fica ao lado do TEMPO que cada uma custa nesta
        imagem. "Rápida ou capricho?" sem o tempo não é uma pergunta que dê
        para responder; com ele, responde-se sozinha.
      */}
      {!plano.grandeDemais && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-linha py-2">
          <span className="mr-1 text-[0.68rem] tracking-wide text-tinta-apagada uppercase">Rede</span>
          {(Object.keys(REDES) as NomeDaRede[]).map((chave) => (
            <button
              key={chave}
              type="button"
              disabled={ocupado}
              onClick={() => aoMudar(item.id, {
                rede: chave,
                dose: REDES[chave].dose,
                // O resultado que estava na tela é da OUTRA rede: mantê-lo ao
                // lado do novo botão diria que ele veio dela.
                depois: null, resultadoDaRede: null, limpo: null,
              })}
              className={`rounded-[8px] border px-2.5 py-1.5 text-[0.75rem] transition-colors disabled:opacity-50 ${
                chave === qualRede
                  ? "border-ambar bg-ambar font-semibold text-ambar-tinta"
                  : "border-linha text-tinta-fraca hover:text-tinta"
              }`}
            >
              {REDES[chave].nome} · {comoTempo(plano.tempos[chave]!.ms)}
            </button>
          ))}
          <span className="w-full text-[0.7rem] leading-relaxed text-tinta-apagada">
            {REDES[qualRede].resumo}
            {qualRede === "rapido"
              ? " — o capricho rende mais detalhe, se a espera couber."
              : " — é a melhor que existe aqui."}
          </span>
        </div>
      )}

      {item.chapada && !item.depois && (
        <p className="m-0 border-t border-linha py-2 text-[0.72rem] leading-relaxed text-tinta-apagada">
          Isto parece <strong className="text-tinta">arte chapada</strong> — logo, escudo, poucas
          cores. Para esse tipo, a tela de <strong className="text-tinta">Vetor</strong> dá resolução
          infinita e não inventa nada. Ampliar aqui funciona, mas é o segundo melhor caminho.
        </p>
      )}

      {item.andamento && (
        <div className="border-t border-linha py-2.5">
          {item.andamento.etapa === "ampliando" ? (
            <>
              <span className="flex items-baseline justify-between text-[0.78rem] text-tinta">
                <span>Melhorando... {item.andamento.feitos} de {item.andamento.total} pedaços</span>
                <span className="text-tinta-apagada">faltam {comoTempo(item.andamento.restaMs || 0)}</span>
              </span>
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-painel-suave">
                <span
                  className="block h-full rounded-full bg-ambar transition-[width]"
                  style={{ width: `${Math.round(((item.andamento.feitos || 0) / (item.andamento.total || 1)) * 100)}%` }}
                />
              </span>
            </>
          ) : (
            <span className="text-[0.78rem] text-tinta-apagada">
              {item.andamento.etapa === "runtime" ? "Ligando a rede neural..." : "Carregando o modelo..."}
            </span>
          )}
          <button
            type="button"
            onClick={aoCancelar}
            className="mt-2 rounded-[8px] border border-linha px-2.5 py-1.5 text-[0.75rem] text-tinta-fraca"
          >
            Cancelar
          </button>
        </div>
      )}

      {item.erro && (
        <p className="m-0 border-t border-linha py-2 text-[0.78rem] text-alerta">{item.erro}</p>
      )}

      {item.depois && item.resultadoDaRede && (
        <Comparacao item={item} aoMudar={aoMudar} />
      )}

      {item.depois && !item.resultadoDaRede && (
        <div className="border-t border-linha py-3">
          <span className="mb-2 block text-[0.78rem] text-tinta-apagada">Ampliada sem inventar detalhe.</span>
          <div className="grid grid-cols-2 gap-2">
            <figure className="m-0">
              <Miniatura dados={item.antes} lado={420} className="w-full rounded border border-linha" />
              <figcaption className="mt-1 text-[0.7rem] text-tinta-apagada">antes</figcaption>
            </figure>
            <figure className="m-0">
              <Miniatura dados={item.depois} lado={420} className="w-full rounded border border-linha" />
              <figcaption className="mt-1 text-[0.7rem] text-tinta-apagada">depois</figcaption>
            </figure>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 border-t border-linha pt-2">
        {/*
          O rótulo diz a escala REAL, e não "4x": é o número que a impressão
          pediu. Botão que promete quatro e entrega dois mente; botão que diz
          "1,8x" explica sozinho por que a espera é curta.
        */}
        <button
          type="button"
          disabled={ocupado || plano.grandeDemais}
          onClick={() => aoAmpliar(plano, false)}
          className="rounded-[9px] border border-ambar bg-ambar px-3.5 py-2 text-[0.8rem] font-semibold text-ambar-tinta transition-colors hover:bg-ambar-claro disabled:opacity-50"
        >
          {plano.jaBasta ? "Passar a rede (limpar)" : `Melhorar para ${plano.escala.toFixed(1).replace(".", ",")}×`}
        </button>
        {/*
          A prova vem ANTES da imagem inteira porque descobrir que ficou
          estranho tem que ser barato. São segundos contra minutos.
        */}
        <button
          type="button"
          disabled={ocupado || plano.grandeDemais}
          onClick={() => aoAmpliar(plano, true)}
          className="rounded-[9px] border border-linha px-3.5 py-2 text-[0.8rem] text-tinta-fraca transition-colors hover:text-tinta disabled:opacity-50"
        >
          Ver uma prova
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={aoSoAmpliar}
          className="rounded-[9px] border border-linha px-3.5 py-2 text-[0.8rem] text-tinta-fraca transition-colors hover:text-tinta disabled:opacity-50"
        >
          Só ampliar, sem inventar
        </button>
        {item.depois && !item.ehProva && (
          <button
            type="button"
            onClick={() => baixar(item)}
            className="rounded-[9px] border border-linha px-3.5 py-2 text-[0.8rem] text-tinta-fraca transition-colors hover:text-tinta"
          >
            Baixar PNG
          </button>
        )}
      </div>

      <Explicacao item={item} plano={plano} />
    </Cartao>
  );
}

/** O recado do rodapé, que muda com o que o plano descobriu. */
function Explicacao({ item, plano }: { item: Item; plano: Plano }) {
  if (plano.grandeDemais) {
    return (
      <p className="m-0 border-t border-linha pt-2 text-[0.72rem] leading-relaxed text-atencao">
        Esta imagem sozinha já passa do que o navegador desenha
        ({(item.antes.width * item.antes.height / 1e6).toFixed(0)} megapixels). Não há ampliação a
        oferecer — e uma imagem desse tamanho dificilmente precisa de uma.
      </p>
    );
  }
  if (plano.cortadaPeloTeto) {
    return (
      <p className="m-0 border-t border-linha pt-2 text-[0.72rem] leading-relaxed text-tinta-apagada">
        A {item.larguraCm.toLocaleString("pt-BR")} cm, 300 dpi pediria mais pixels do que o navegador
        desenha. Vai até onde cabe: {plano.largura.toLocaleString("pt-BR")} ×{" "}
        {plano.altura.toLocaleString("pt-BR")} px, que dão{" "}
        <strong className="text-tinta">{Math.round(plano.dpiQueDa || 0)} dpi</strong> nessa largura —
        e trabalho desse tamanho é visto de longe.
      </p>
    );
  }
  if (plano.jaBasta) {
    return (
      <p className="m-0 border-t border-linha pt-2 text-[0.72rem] leading-relaxed text-tinta-apagada">
        Esta imagem <strong className="text-tinta">já tem tamanho de sobra</strong> para imprimir a{" "}
        {item.larguraCm.toLocaleString("pt-BR")} cm. Passar a rede aqui não vai aumentar nada — serve
        só para limpar ruído e marca de JPEG, e leva o mesmo tempo de uma ampliação.
      </p>
    );
  }
  if (plano.demorado) {
    return (
      <p className="m-0 border-t border-linha pt-2 text-[0.72rem] text-tinta-apagada">
        São {plano.ladrilhos.toLocaleString("pt-BR")} pedaços para a rede processar: pode levar
        vários minutos. Dá para cancelar no meio.
      </p>
    );
  }
  return null;
}

/* ========================================================================== */
/* A comparação 1:1                                                           */
/* ========================================================================== */

/**
 * As duas janelas da lupa: a ampliação limpa e o resultado com a dose.
 *
 * 1:1, sem suavizar. Ampliar a comparação seria inventar um defeito que a
 * impressão não tem; encolher esconderia o que ela tem. O que se procura aqui
 * — halo, textura de plástico, detalhe inventado — vive no tamanho de um pixel.
 *
 * A comparação é entre a AMPLIAÇÃO LIMPA e a rede, e não contra o original
 * pequeno: as duas no mesmo tamanho é a única forma de responder a pergunta que
 * interessa — vale o que a rede inventou?
 */
function Comparacao({ item, aoMudar }: {
  item: Item; aoMudar: (id: number, mudanca: Partial<Item>) => void;
}) {
  const telaAntes = useRef<HTMLCanvasElement | null>(null);
  const telaDepois = useRef<HTMLCanvasElement | null>(null);
  const arraste = useRef<{ x: number; y: number } | null>(null);

  // Os canvas de origem ficam guardados: refazê-los a cada quadro da lupa
  // seria copiar dezenas de megabytes por movimento de ponteiro.
  const fontes = useRef<{ limpo: HTMLCanvasElement; depois: HTMLCanvasElement } | null>(null);

  useEffect(() => {
    if (!item.limpo || !item.depois) return;
    fontes.current = { limpo: telaDe(item.limpo), depois: telaDe(item.depois) };
    desenhar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.limpo, item.depois]);

  const desenhar = useCallback(() => {
    const f = fontes.current;
    if (!f || !telaAntes.current || !telaDepois.current || !item.depois) return;
    for (const [tela, fonte] of [[telaAntes.current, f.limpo], [telaDepois.current, f.depois]] as const) {
      const pincel = tela.getContext("2d")!;
      pincel.imageSmoothingEnabled = false;
      pincel.clearRect(0, 0, tela.width, tela.height);
      pincel.drawImage(fonte, item.vista.x, item.vista.y, tela.width, tela.height, 0, 0, tela.width, tela.height);
    }
  }, [item.vista, item.depois]);

  useEffect(desenhar, [desenhar]);

  const andar = (dx: number, dy: number) => {
    if (!item.depois) return;
    const maxX = Math.max(0, item.depois.width - LUPA_LARGURA);
    const maxY = Math.max(0, item.depois.height - LUPA_ALTURA);
    aoMudar(item.id, {
      vista: {
        x: Math.max(0, Math.min(maxX, item.vista.x - dx)),
        y: Math.max(0, Math.min(maxY, item.vista.y - dy)),
      },
    });
  };

  const gestos = {
    onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => {
      arraste.current = { x: e.clientX, y: e.clientY };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!arraste.current) return;
      andar(e.clientX - arraste.current.x, e.clientY - arraste.current.y);
      arraste.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: () => { arraste.current = null; },
    onPointerCancel: () => { arraste.current = null; },
  };

  return (
    <div className="border-t border-linha py-3">
      {item.ehProva && (
        <p className="m-0 mb-2 rounded border border-linha bg-painel-suave px-2 py-1.5 text-[0.72rem] leading-relaxed text-tinta">
          Isto é uma <strong>prova</strong>: a rede rodou só num pedaço do meio da imagem. Se
          agradar, mande fazer a imagem inteira.
        </p>
      )}

      <span className="mb-1.5 flex items-baseline justify-between text-[0.7rem] text-tinta-apagada">
        <span>Comparação 1:1 — arraste para andar pela imagem</span>
        {item.ondeRodou === "cpu" && <span>rodou no processador</span>}
      </span>

      <div className="grid grid-cols-2 gap-2">
        <figure className="m-0">
          <canvas
            ref={telaAntes}
            width={LUPA_LARGURA}
            height={LUPA_ALTURA}
            {...gestos}
            className="w-full cursor-move touch-none rounded border border-linha"
          />
          <figcaption className="mt-1 text-[0.7rem] text-tinta-apagada">só ampliada</figcaption>
        </figure>
        <figure className="m-0">
          <canvas
            ref={telaDepois}
            width={LUPA_LARGURA}
            height={LUPA_ALTURA}
            {...gestos}
            className="w-full cursor-move touch-none rounded border border-linha"
          />
          <figcaption className="mt-1 text-[0.7rem] text-tinta-apagada">
            rede {item.rede ? REDES[item.rede].nome : ""}, {item.dose}%
          </figcaption>
        </figure>
      </div>

      <label className="mt-2.5 flex items-center gap-2 text-[0.78rem] text-tinta-apagada">
        <span className="shrink-0">Dose da rede</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={item.dose}
          onChange={(e) => {
            const dose = Number(e.target.value);
            aoMudar(item.id, {
              dose,
              depois: misturarDose(item.resultadoDaRede, item.limpo, dose),
            });
          }}
          className="w-full accent-[var(--accent)]"
        />
        <strong className="w-9 shrink-0 text-right text-tinta">{item.dose}%</strong>
      </label>
      <p className="m-0 mt-1 text-[0.7rem] leading-relaxed text-tinta-apagada">
        Em 0% é só ampliação, sem inventar nada. Em 100% é a rede inteira — que é também onde
        aparecem o ar de plástico e o contorno duro. Mexa e olhe a janela da direita: ela muda na
        hora.
      </p>
    </div>
  );
}

/* ========================================================================== */
/* Pedaços de tela                                                            */
/* ========================================================================== */

function LinhaDoDpi({ larguraCm, largura, altura, rotulo }: {
  larguraCm: number; largura: number; altura: number; rotulo: string;
}) {
  const dpi = dpiNaLargura(largura, larguraCm) as number | null;
  const v = vereditoDoDpi(dpi) as { texto: string; tom: string };
  const cor = { bom: "text-certo", meio: "text-atencao", ruim: "text-alerta", neutro: "text-tinta-apagada" }[v.tom]
    || "text-tinta-apagada";

  return (
    <span className="flex flex-wrap items-baseline gap-1.5 text-[0.78rem]">
      <span className="w-14 shrink-0 text-tinta-apagada">{rotulo}</span>
      <strong className="text-tinta">{largura} × {altura} px</strong>
      {dpi !== null && <span className={cor}>· {Math.round(dpi)} dpi — {v.texto}</span>}
    </span>
  );
}

/** A miniatura de um ImageData, para caber na tela sem carregar tudo. */
function Miniatura({ dados, lado, className }: { dados: ImageData; lado: number; className?: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => { setSrc(miniatura(dados, lado)); }, [dados, lado]);
  return <img src={src} alt="" className={className} />;
}

/* ========================================================================== */
/* Canvas e arquivo — o que só existe na página                               */
/* ========================================================================== */

async function lerImagem(arquivo: File): Promise<ImageData> {
  const url = URL.createObjectURL(arquivo);
  try {
    const bitmap = await createImageBitmap(await fetch(url).then((r) => r.blob()));
    const tela = document.createElement("canvas");
    tela.width = bitmap.width;
    tela.height = bitmap.height;
    const pincel = tela.getContext("2d", { willReadFrequently: true })!;
    pincel.drawImage(bitmap, 0, 0);
    bitmap.close();
    return pincel.getImageData(0, 0, tela.width, tela.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * A ampliação limpa, sem rede: só a conta do navegador, em dois passos.
 *
 * Dobrar de uma vez para 4x borra; dobrar duas vezes com a suavização ligada
 * dá um resultado bem mais firme, e é instantâneo. Isto é a saída para quem
 * não quer esperar, e o pé no chão do resto da tela: é ATÉ AQUI que dá para
 * chegar sem inventar pixel.
 */
function ampliarLimpo(dados: ImageData): ImageData {
  let atual = dados;
  for (let vez = 0; vez < 2; vez++) {
    const tela = document.createElement("canvas");
    tela.width = atual.width * 2;
    tela.height = atual.height * 2;
    const pincel = tela.getContext("2d", { willReadFrequently: true })!;
    pincel.imageSmoothingEnabled = true;
    pincel.imageSmoothingQuality = "high";

    const fonte = document.createElement("canvas");
    fonte.width = atual.width;
    fonte.height = atual.height;
    fonte.getContext("2d")!.putImageData(atual, 0, 0);

    pincel.drawImage(fonte, 0, 0, tela.width, tela.height);
    atual = pincel.getImageData(0, 0, tela.width, tela.height);
  }
  return atual;
}

/**
 * Um recorte do meio da imagem, para a rede rodar em segundos.
 *
 * Do MEIO porque é onde costuma estar o assunto — rosto, escudo, o que
 * importa. Canto de foto é céu ou parede, e julgar a rede por um pedaço de
 * parede lisa não diz nada.
 */
function recorteDaProva(dados: ImageData): ImageData {
  const lado = Math.min(LADO_DA_PROVA, dados.width, dados.height);
  const x0 = Math.floor((dados.width - lado) / 2);
  const y0 = Math.floor((dados.height - lado) / 2);

  const tela = telaDe(dados);
  const corte = document.createElement("canvas");
  corte.width = lado;
  corte.height = lado;
  const pincel = corte.getContext("2d", { willReadFrequently: true })!;
  pincel.drawImage(tela, x0, y0, lado, lado, 0, 0, lado, lado);
  return pincel.getImageData(0, 0, lado, lado);
}

/**
 * Mistura a ampliação limpa com o resultado da rede.
 *
 * As duas já estão prontas e do mesmo tamanho, então isto é uma passada por
 * pixel — rápido o bastante para a barra responder enquanto se arrasta. Se a
 * rede rodasse de novo a cada mexida, a barra seria inútil.
 */
function misturarDose(daRede: ImageData | null, limpo: ImageData | null, valor: number): ImageData | null {
  if (!daRede || !limpo) return null;
  const dose = Math.max(0, Math.min(100, valor)) / 100;
  if (dose >= 1) return daRede;
  if (dose <= 0) return limpo;

  const r = daRede.data;
  const l = limpo.data;
  const saida = new ImageData(daRede.width, daRede.height);
  const d = saida.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = l[i]! + (r[i]! - l[i]!) * dose;
    d[i + 1] = l[i + 1]! + (r[i + 1]! - l[i + 1]!) * dose;
    d[i + 2] = l[i + 2]! + (r[i + 2]! - l[i + 2]!) * dose;
    d[i + 3] = r[i + 3]!;
  }
  return saida;
}

/** Canvas com um ImageData dentro. */
function telaDe(dados: ImageData): HTMLCanvasElement {
  const tela = document.createElement("canvas");
  tela.width = dados.width;
  tela.height = dados.height;
  tela.getContext("2d")!.putImageData(dados, 0, 0);
  return tela;
}

function miniatura(dados: ImageData, ladoMaximo: number): string {
  const escala = Math.min(1, ladoMaximo / Math.max(dados.width, dados.height));
  const tela = document.createElement("canvas");
  tela.width = Math.max(1, Math.round(dados.width * escala));
  tela.height = Math.max(1, Math.round(dados.height * escala));

  const pincel = tela.getContext("2d")!;
  pincel.imageSmoothingEnabled = true;
  pincel.imageSmoothingQuality = "high";
  pincel.drawImage(telaDe(dados), 0, 0, tela.width, tela.height);
  return tela.toDataURL("image/png");
}

function baixar(item: Item) {
  const dados = item.depois || item.antes;
  // PNG, e não JPEG: a imagem acabou de ser reconstruída, e comprimir com
  // perda logo depois jogaria fora parte do que se esperou para ganhar.
  telaDe(dados).toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = item.nome.replace(/\.[^.]+$/, "") + "-melhorada.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, "image/png");
}

/**
 * Qual rede usar, quando ninguém escolheu ainda.
 *
 * O capricho é melhor sempre; o que muda é se cabe na paciência. Numa imagem
 * pequena ele custa segundos e não há razão para não usá-lo. Numa foto de
 * celular ele custaria vinte minutos, e aí o padrão tem que ser o rápido — com
 * o tempo do capricho escrito ao lado, para a escolha existir.
 */
function redeEscolhida(item: Item, plano: Plano): NomeDaRede {
  if (item.rede) return item.rede;
  return plano.tempos.capricho!.ms <= ESPERA_CONFORTAVEL_MS ? "capricho" : "rapido";
}

function comoTempo(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return s + " s";
  return Math.floor(s / 60) + " min " + String(s % 60).padStart(2, "0") + " s";
}

function comoTamanho(bytes: number): string {
  if (bytes < 1048576) return Math.round(bytes / 1024) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}
