/**
 * ===========================================================================
 * TELA DE COR — arrumar a cor das artes antes de encaixar
 * ===========================================================================
 *
 * O problema, em uma frase: o encaixe desenha tudo em canvas, canvas só existe
 * em RGB, e a conversão que o navegador faz de uma arte CMYK não é a que o
 * Photoshop faz. O desenho sai certo e a cor não — o preto fecha demais e as
 * cores fortes mudam de tom.
 *
 * A conversão certa custa segundos por arte, porque é preciso decodificar o
 * arquivo inteiro e atravessar o perfil de cor pixel a pixel. Pendurar isso na
 * hora de largar os arquivos no Encaixe faria todo mundo pagar o preço — até
 * quem mandou 30 artes que já estavam certas. Aqui o custo é escolhido: a
 * pessoa vem, converte o que precisa, confere, e leva tudo pronto.
 *
 * O caminho da tela
 * -----------------
 *   1. lê o cabeçalho de cada arquivo         (`nucleo/corDoArquivo`, instantâneo)
 *   2. manda para o servidor só o que precisa (`api/cor` → `cor-icc.js`)
 *   3. mostra o antes e o depois lado a lado
 *   4. entrega tudo ao Encaixe — o convertido no lugar do original
 *
 * As duas miniaturas do passo 3 são desenhadas AQUI, pelo navegador, e não no
 * servidor. A razão é que o "antes" só vale alguma coisa se for de verdade o
 * que o Encaixe mostraria — e a única forma de garantir isso é deixar quem
 * desenha o Encaixe desenhá-lo: o mesmo `createImageBitmap`, o mesmo canvas.
 *
 * A primeira versão simulava o "antes" no servidor, com a fórmula ingênua de
 * CMYK para RGB, na suposição de que fosse ela que o navegador usava. Medido
 * contra o Chrome, não é: ele aplica o perfil embutido. O painel mostrava então
 * uma cor que ninguém veria em lugar nenhum — mais viva que a real, o que fazia
 * o "antes" parecer certo e a conversão, desnecessária.
 *
 * O que a conversão realmente acrescenta ao que o navegador já faz é a
 * COMPENSAÇÃO DE PONTO PRETO. Sem ela o preto de tinta não fecha: no Chrome, o
 * preto rico desta loja sai `rgb(0,35,34)` — escuro, esverdeado e lavado. Com
 * ela, sai preto. É a queixa do "fica mais cinza", e é ela que a comparação
 * precisa deixar ver.
 *
 * O passo 4 é o ponto da tela. Não adianta converter e deixar a pessoa
 * procurando onde o arquivo foi parar: a arte convertida entra no Encaixe no
 * lugar da original, e as que não precisavam de nada seguem junto, intactas.
 *
 * ---------------------------------------------------------------------------
 * A PRIMEIRA TELA DECLARATIVA DAS QUATRO
 * ---------------------------------------------------------------------------
 *
 * Moldes, Projetos e Encaixe ainda são dirigidos pelo `producao/controlador.js`
 * por `getElementById`. Esta não é mais: o estado mora no `useState` e o React
 * desenha a lista.
 *
 * Duas consequências que valem para as próximas:
 *
 * 1. **O `data-page` saiu do elemento raiz.** É por ele que o controlador acha
 *    as telas e liga/desliga a classe `active`. Se ele mexesse na classe de um
 *    elemento que o React desenha, o próximo render desfaria a mudança e a tela
 *    sumiria no meio do uso. Aqui quem manda na visibilidade é o `hidden`, que
 *    chega por `prop`.
 * 2. **A lista sobrevive à navegação** porque este componente fica montado o
 *    tempo todo, escondido — do mesmo jeito que o trabalho do Encaixe
 *    sobrevive. Foi decisão, não acaso: quem converteu 25 artes e foi conferir
 *    um molde não pode voltar e encontrar a lista vazia.
 */

import { useCallback, useRef, useState } from "react";
import { COR_SEGURA, diagnosticoDeCorDoArquivo } from "../nucleo/corDoArquivo";
import { miniaturaDaArte } from "../nucleo/miniaturaDaArte";
import { buscarArteConvertida, converterArte } from "../api/cor";
import { formatarNumero } from "../casca/numero";
import { useLigacao } from "../producao/ligacao";

type Estado = "esperando" | "convertendo" | "pronto" | "intacto" | "parado" | "erro";

const ESTADOS: Record<Estado, { rotulo: string; classe: string }> = {
  esperando: { rotulo: "na fila", classe: "cor-estado-espera" },
  convertendo: { rotulo: "convertendo…", classe: "cor-estado-espera" },
  pronto: { rotulo: "cor corrigida", classe: "cor-estado-pronto" },
  intacto: { rotulo: "já estava certa", classe: "cor-estado-intacto" },
  parado: { rotulo: "nada a converter", classe: "cor-estado-intacto" },
  // Separado do "parado" de propósito: "nada a converter" é uma resposta sobre
  // a ARTE, e "deu erro" é uma resposta sobre o PROGRAMA. Confundir os dois faz
  // a pessoa ir mexer num arquivo que está bom.
  erro: { rotulo: "deu erro", classe: "cor-estado-parado" },
};

/**
 * Uma linha da tela.
 *
 * `arquivo` é sempre o que deve ir para o Encaixe: o original enquanto nada foi
 * convertido, e o convertido depois. É esse campo que o botão do rodapé lê, e
 * por isso ele nunca guarda um estado intermediário.
 *
 * O `id` existe porque a lista cresce enquanto conversões antigas ainda estão
 * correndo: usar o índice como `key` faria o React reaproveitar o `<img>` de
 * uma arte na linha de outra no meio de uma atualização.
 */
interface Item {
  id: number;
  arquivo: File;
  estado: Estado;
  detalhe: string;
  antes: string | null;
  depois: string | null;
}

let proximoId = 1;

/**
 * `ativa` é opcional por um motivo de tipo, não de desenho: a tabela de
 * `rotas.ts` guarda um `Componente` sem props para cada tela, e o `App` só o
 * desenha quando `ehProducaoIntegrada` diz que não. Como "cor" está nessa
 * lista, aquele caminho nunca desenha esta tela — quem a desenha é o
 * `Producao`, passando o `ativa`. O padrão `false` existe para que, se um dia
 * alguém tirar "cor" da lista sem ler isto, a tela apareça escondida (defeito
 * visível de imediato) em vez de aparecer duplicada.
 */
export function Cor({ ativa = false }: { ativa?: boolean }) {
  const [itens, setItens] = useState<Item[]>([]);
  const [erro, setErro] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const ligacao = useLigacao();

  /*
   * A conversão é uma fila assíncrona que mexe em itens já desenhados, então
   * toda atualização é por `id`, e não por índice: entre o começo e o fim de
   * uma conversão a pessoa pode ter largado mais arquivos na tela.
   */
  const atualizar = useCallback((id: number, mudanca: Partial<Item>) => {
    setItens((atuais) => atuais.map((i) => (i.id === id ? { ...i, ...mudanca } : i)));
  }, []);

  /** Converte uma arte no servidor e guarda o resultado no item. */
  const converterUm = useCallback(async (item: Item) => {
    atualizar(item.id, {
      estado: "convertendo",
      detalhe: "lendo o perfil e atravessando a tabela de cor…",
    });

    const dados = await converterArte(item.arquivo);
    if (!dados.convertido) {
      atualizar(item.id, { estado: "parado", detalhe: dados.motivo ?? "" });
      return;
    }

    const blob = await buscarArteConvertida(dados.id!);

    /*
     * SÓ O "ANTES" É DESENHADO AQUI.
     *
     * O "depois" vem pronto do servidor: são os pixels que ele acabou de
     * converter, subamostrados, e não custam decodificação nenhuma. O "antes"
     * não pode vir de lá, porque ele é uma afirmação sobre o que o NAVEGADOR
     * faz com o arquivo — e quem responde isso sem errar é o próprio navegador.
     *
     * Isso custa uma decodificação de imagem cheia: medido no Chrome com uma
     * arte de 65 megapixels, 3,8 s. Desenhar os dois lados aqui custava o
     * dobro, e era o que fazia quatro artes levarem quase três minutos.
     *
     * É também o ponto mais frágil da tela, porque depende da memória que a aba
     * tem sobrando. Se falhar, o que se perde é a conferência visual: a
     * conversão já terminou e o arquivo já está aqui. Derrubar o item por causa
     * da miniatura seria jogar fora quinze segundos de trabalho e mandar a
     * pessoa investigar uma arte sem defeito.
     *
     * O "antes" sai do arquivo ORIGINAL, então é tirado antes da troca.
     */
    let antes: string | null = null;
    let semComparacao = "";
    try {
      antes = await miniaturaDaArte(item.arquivo, dados.largura!, dados.altura!);
    } catch (falha) {
      console.warn("[cor] não deu para desenhar o antes de", item.arquivo.name, falha);
      semComparacao = "a arte é grande demais para o navegador montar a comparação aqui,"
        + " mas a conversão terminou e o arquivo já está pronto";
    }

    atualizar(item.id, {
      arquivo: new File([blob], dados.nomeNovo!, { type: "image/jpeg" }),
      antes,
      depois: dados.depois ?? null,
      estado: "pronto",
      detalhe: `${dados.espaco} · perfil "${dados.perfil}" · `
        + `${dados.largura} × ${dados.altura} px · ${formatarNumero(dados.cores, 0)} cores`
        + (semComparacao ? ` — ${semComparacao}` : ""),
    });
  }, [atualizar]);

  /**
   * Recebe os arquivos, separa quem precisa de conversão e converte um de cada
   * vez.
   *
   * Um de cada vez de propósito: uma arte de 50 megapixels ocupa mais de 1 GB
   * no servidor enquanto está sendo convertida, e três ao mesmo tempo
   * derrubariam o processo. Em fila, o pico é sempre o de uma arte só.
   */
  const receberArquivos = useCallback(async (arquivos: File[]) => {
    const imagens = arquivos.filter(
      (f) => /^image\//.test(f.type) || /\.(jpe?g|png)$/i.test(f.name));
    if (imagens.length === 0) {
      setErro("Esta tela trabalha com imagem (JPG ou PNG).");
      return;
    }
    setErro("");

    const novos: Item[] = [];
    for (const arquivo of imagens) {
      const cor = await diagnosticoDeCorDoArquivo(arquivo);
      const precisa = cor.risco !== COR_SEGURA;
      novos.push({
        id: proximoId++,
        arquivo,
        estado: precisa ? "esperando" : "intacto",
        detalhe: precisa ? (cor.detalhe ?? "") : `${cor.perfil || "sRGB"} — não precisa de conversão.`,
        antes: null,
        depois: null,
      });
    }
    setItens((atuais) => [...atuais, ...novos]);

    for (const item of novos) {
      if (item.estado !== "esperando") continue;
      try {
        await converterUm(item);
      } catch (falha) {
        console.error("[cor] falhou ao converter", item.arquivo.name, falha);
        // "Failed to fetch" é o que o navegador diz quando a conexão caiu no
        // meio — servidor reiniciado, ou a arte grande demais para o envio
        // terminar. Sozinho não diz nada a quem lê.
        let motivo = falha instanceof Error ? falha.message : String(falha);
        if (/failed to fetch|networkerror|load failed/i.test(motivo)) {
          motivo = "a conexão com o servidor do programa caiu no meio do envio";
        }
        atualizar(item.id, {
          estado: "erro",
          detalhe: `A conversão não rodou: ${motivo}. `
            + "A arte não foi mexida e segue para o encaixe como está.",
        });
      }
    }
  }, [atualizar, converterUm]);

  /**
   * Leva tudo para o Encaixe e troca de tela.
   *
   * Vai a lista inteira, não só o que foi convertido: quem chegou aqui trouxe o
   * trabalho todo, e obrigar a pessoa a arrastar de novo as artes que já
   * estavam certas seria devolver a ela o trabalho que esta tela existe para
   * poupar.
   *
   * A lista só é limpa DEPOIS que o Encaixe leu tudo. Se limpasse antes e a
   * leitura falhasse no meio, as artes teriam sumido dos dois lados.
   */
  const mandarParaOEncaixe = useCallback(async () => {
    if (!ligacao || itens.length === 0) return;
    ligacao.irPara("encaixe");
    await ligacao.adicionarArquivos(itens.map((i) => i.arquivo));
    setItens([]);
  }, [itens, ligacao]);

  const corrigidas = itens.filter((i) => i.estado === "pronto").length;
  const faltando = itens.filter(
    (i) => i.estado === "esperando" || i.estado === "convertendo").length;
  const paradas = itens.filter((i) => i.estado === "parado").length;
  const comErro = itens.filter((i) => i.estado === "erro").length;

  const resumo = [`${itens.length} ${itens.length === 1 ? "arte" : "artes"}`];
  if (faltando) resumo.push(`${faltando} na fila`);
  if (corrigidas) resumo.push(`${corrigidas} com a cor corrigida`);
  if (paradas) resumo.push(`${paradas} sem perfil para aplicar`);
  if (comErro) resumo.push(`${comErro} que deram erro`);

  return (
    <div className="page active" hidden={!ativa}>
      <section className="card">
        <div className="card-head">
          <div className="card-head-copy">
            <h2>Cor das artes</h2>
            <p className="hint">
              Converte arte em CMYK (ou em outro perfil) para a cor certa, antes de encaixar.
            </p>
          </div>
        </div>

        <details className="ajuda">
          <summary>Por que a cor muda, e o que esta tela faz</summary>
          <div className="ajuda-corpo">
            <p>
              O encaixe desenha as peças numa tela do navegador, e tela só existe em RGB.
              Quando a arte vem em <strong>CMYK</strong> — as quatro tintas da impressão —, o
              navegador faz uma conversão própria, rápida e sem gerenciamento de cor: o desenho
              sai certo e a cor não. O preto fecha demais, e as cores fortes mudam de tom.
            </p>
            <p>
              Aqui a conversão é feita <strong>pelo perfil embutido no próprio arquivo</strong>,
              do jeito que o Photoshop faz. Você confere o antes e o depois, e manda tudo para o
              Encaixe já resolvido — as artes que já estavam certas passam direto, sem mexer.
            </p>
            <p>
              Converter uma arte grande leva alguns segundos. É justamente por isso que fica
              numa tela separada: esse tempo não pode cair em cima de quem só quer encaixar.
            </p>
          </div>
        </details>

        <div
          className={`vetor-solta${arrastando ? " arrastando" : ""}`}
          onDragEnter={(e) => { e.preventDefault(); setArrastando(true); }}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            const arquivos = Array.from(e.dataTransfer?.files ?? []);
            if (arquivos.length) void receberArquivos(arquivos);
          }}
        >
          <label className="btn primary">
            Escolher as artes
            <input
              ref={entrada}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={() => {
                const arquivos = Array.from(entrada.current?.files ?? []);
                // Zerar o campo deixa a pessoa escolher o MESMO arquivo de
                // novo — sem isso o `change` não dispara na segunda vez.
                if (entrada.current) entrada.current.value = "";
                if (arquivos.length) void receberArquivos(arquivos);
              }}
            />
          </label>
          <span className="hint">ou arraste os arquivos para cá</span>
        </div>

        {erro && <p className="hint error">{erro}</p>}

        {itens.length > 0 && (
          <div>
            <p className="hint">{resumo.join(" · ")}</p>

            <div className="cor-lista">
              {itens.map((item) => {
                const estado = ESTADOS[item.estado];
                return (
                  <article className="cor-item" key={item.id}>
                    <header>
                      <strong>{item.arquivo.name}</strong>
                      <span className={`cor-estado ${estado.classe}`}>{estado.rotulo}</span>
                    </header>
                    <p className="hint">{item.detalhe}</p>
                    {item.antes && item.depois && (
                      <div className="cor-par">
                        <figure>
                          <img src={item.antes} alt="" />
                          <figcaption>como estava indo</figcaption>
                        </figure>
                        <figure>
                          <img src={item.depois} alt="" />
                          <figcaption>com o perfil aplicado</figcaption>
                        </figure>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            <div className="vetor-acoes">
              <button
                type="button"
                className="btn primary"
                disabled={faltando > 0}
                onClick={() => void mandarParaOEncaixe()}
              >
                {faltando > 0
                  ? "Convertendo…"
                  : `Mandar ${itens.length === 1 ? "a arte" : `as ${itens.length} artes`} para o Encaixe`}
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => { setItens([]); setErro(""); }}
              >
                Limpar a lista
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
