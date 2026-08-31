/**
 * O preparo das peças espalhado pelos núcleos.
 *
 * Medindo seis arquivos de tamanho real, o preparo custava 2,4 segundos de
 * tela travada: 1,3 s montando as máscaras (na hora de clicar em "Fazer
 * encaixe") e 1,0 s tirando o fundo branco (na hora de arrastar os arquivos).
 * Tudo numa thread só, uma peça de cada vez.
 *
 * Como cada peça é independente das outras, isso se divide entre núcleos do
 * mesmo jeito que a busca do encaixe (ver encaixe-paralelo.js).
 *
 * Não dando para usar worker, cai nas funções de sempre do encaixe.js, uma por
 * uma. A tela não fica sabendo da diferença.
 */

// O mesmo raciocínio do pool da busca: um núcleo fica de fora para a tela
// continuar respondendo. O teto é menor porque quem manda aqui é a quantidade
// de peças, que raramente passa de uma dúzia.
const PREPARA_MAX_WORKERS = 6;

let poolPrepara = [];

function derrubarPoolPrepara() {
  poolPrepara.forEach((w) => { try { w.terminate(); } catch (erro) { /* já estava morto */ } });
  poolPrepara = [];
}

function pegarPoolPrepara(quantidade) {
  if (poolPrepara.length >= quantidade) return poolPrepara.slice(0, quantidade);
  derrubarPoolPrepara();
  for (let k = 0; k < quantidade; k++) poolPrepara.push(new Worker("/prepara-worker.js"));
  return poolPrepara;
}

/**
 * O que o preparo em worker precisa do navegador.
 *
 * `OffscreenCanvas` é usado só para gerar o PNG da arte sem fundo; a leitura
 * dos pixels continua sendo da página (ver prepara-worker.js para o porquê).
 * Faltando qualquer coisa, o preparo volta a ser na tela mesmo.
 */
function podePrepararEmWorker() {
  return typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined";
}

/**
 * Reparte as tarefas entre os workers e devolve as respostas na ordem em que
 * as tarefas entraram.
 *
 * Cada worker pega a próxima tarefa da fila assim que termina a anterior, em
 * vez de receber um bloco fixo no começo: peça grande e peça pequena custam
 * muito diferente, e com bloco fixo um worker terminava cedo e ficava parado.
 */
function repartirEntreWorkers(workers, tarefas) {
  const respostas = new Array(tarefas.length);
  let proxima = 0;

  return Promise.all(workers.map((w) => new Promise((pronto) => {
    const mandarProxima = () => {
      if (proxima >= tarefas.length) { pronto(); return; }
      const indice = proxima++;
      const { mensagem, transferir } = tarefas[indice];
      w.__indice = indice;
      w.postMessage(mensagem, transferir || []);
    };

    const aoResponder = (evento) => {
      respostas[w.__indice] = evento.data;
      mandarProxima();
    };
    const aoQuebrar = (evento) => {
      respostas[w.__indice] = { tipo: "falhou", erro: String(evento.message || evento) };
      mandarProxima();
    };

    w.addEventListener("message", aoResponder);
    w.addEventListener("error", aoQuebrar);
    // Guarda para poder desligar no fim: worker do pool é reaproveitado, e sem
    // isto os ouvintes de uma rodada continuariam vivos na próxima.
    w.__desligar = () => {
      w.removeEventListener("message", aoResponder);
      w.removeEventListener("error", aoQuebrar);
    };
    mandarProxima();
  }))).then(() => {
    workers.forEach((w) => { if (w.__desligar) w.__desligar(); });
    return respostas;
  });
}

/**
 * Monta as máscaras de várias peças de uma vez, em paralelo.
 *
 * Só entram as peças cujo cache não serve mais — as outras já estão prontas e
 * nem viram tarefa. Devolve a quantidade que foi realmente calculada, para
 * quem chamou poder contar na tela.
 */
async function prepararMascarasEmParalelo(pecas, passo, raio, aoAndar) {
  const pendentes = pecas.filter((peca) => {
    const chave = chaveDasMascaras(peca, passo, raio);
    return !(peca._cacheMascaras && peca._cacheMascaras.chave === chave);
  });
  if (pendentes.length === 0) return 0;

  const emSerie = async () => {
    for (let i = 0; i < pendentes.length; i++) {
      mascarasDaPeca(pendentes[i], passo, raio);
      if (aoAndar) aoAndar(i + 1, pendentes.length);
      await respirarNaTela();
    }
    return pendentes.length;
  };

  if (!podePrepararEmWorker()) return emSerie();

  // Trabalho pequeno não paga o worker. Mandar mensagem, transferir memória e
  // esperar a resposta tem um custo fixo, e abaixo de um certo tamanho ele
  // passa do cálculo: com grade grossa (folga grande) as seis peças de teste
  // levavam 29 ms na tela e 40 ms nos workers. O piso é em células de grade,
  // que é o que manda no custo — não no número de peças.
  const CELULAS_PARA_VALER = 150000;
  const celulas = pendentes.reduce((soma, peca) => {
    const { cols, rows } = gradeDaPeca(peca, passo);
    return soma + cols * rows;
  }, 0);
  if (celulas < CELULAS_PARA_VALER) return emSerie();

  let workers;
  try {
    workers = pegarPoolPrepara(Math.min(PREPARA_MAX_WORKERS,
      Math.max(1, (navigator.hardwareConcurrency || 4) - 1), pendentes.length));
  } catch (erro) {
    console.warn("[encaixe] sem workers para o preparo, indo em série:", erro);
    derrubarPoolPrepara();
    return emSerie();
  }

  try {
    let prontas = 0;
    // Os pixels são lidos aqui, na página, e mandados prontos. O worker não
    // redimensiona nada: se ele reduzisse a imagem por conta, a silhueta sairia
    // diferente da que a versão sem worker acha (explicado em
    // prepara-worker.js). Esta parte custa ~18% do preparo das máscaras.
    const semPixels = [];
    const tarefas = [];
    pendentes.forEach((peca) => {
      const { cols, rows } = gradeDaPeca(peca, passo);
      const dados = peca.contorno === "caixa" ? null : pixelsDaArteNaGrade(peca, cols, rows);
      if (peca.contorno !== "caixa" && !dados) {
        // Canvas bloqueado: esta peça é resolvida na tela mesmo, mais adiante.
        semPixels.push(peca);
        return;
      }
      const pixels = dados ? dados.data.buffer : null;
      tarefas.push({
        peca,
        mensagem: { tipo: "mascaras", id: peca.id, pixels, cols, rows, passo, raio,
          contorno: peca.contorno },
        transferir: pixels ? [pixels] : [],
      });
    });
    semPixels.forEach((peca) => mascarasDaPeca(peca, passo, raio));

    const respostas = await repartirEntreWorkers(workers, tarefas);

    respostas.forEach((resposta, i) => {
      const peca = tarefas[i].peca;
      if (!resposta || resposta.tipo !== "mascaras") {
        // Uma peça que falhou é refeita aqui mesmo: melhor um segundo a mais
        // do que um encaixe sem essa peça.
        console.warn("[encaixe] preparo da peça falhou, refazendo na tela:",
          resposta && resposta.erro);
        mascarasDaPeca(peca, passo, raio);
      } else {
        peca._cacheMascaras = { chave: chaveDasMascaras(peca, passo, raio), ...resposta.mascaras };
      }
      prontas++;
      if (aoAndar) aoAndar(prontas + semPixels.length, pendentes.length);
    });
    return pendentes.length;
  } catch (erro) {
    console.warn("[encaixe] preparo em paralelo falhou, indo em série:", erro);
    derrubarPoolPrepara();
    return emSerie();
  }
}

/**
 * Tira o fundo de vários arquivos de uma vez, em paralelo.
 *
 * Recebe e devolve na mesma ordem. Cada resposta é `{ src, apagados, cor }` —
 * o mesmo formato que `removerFundoDaImagem` devolvia — ou `null` quando não
 * havia fundo para tirar.
 *
 * O `src` que volta é um endereço de blob, não mais uma imagem em base64. Ele
 * serve para tudo que a tela faz com ele (a miniatura da tabela e o
 * `carregarImagem`), e evita converter cinco milhões de pixels para texto.
 */
/**
 * `aoAndar(i, total)` é chamado ANTES de cada leitura de pixels. Serve para
 * duas coisas ao mesmo tempo: mostrar o andamento e — porque quem passa a
 * função devolve uma promessa — **ceder a vez ao navegador entre uma imagem e
 * outra**.
 *
 * Sem essa cessão, ler os pixels de quatro artes de 1800×1550 era um bloco só
 * de ~11 milhões de pixels na thread da tela, e o navegador acusava a página
 * como travada. Os pixels precisam ser lidos aqui (só a tela tem canvas), mas
 * não precisam ser lidos todos de uma vez sem respirar.
 */
async function tirarFundoEmParalelo(imagens, forcar = false, aoAndar = null) {
  if (imagens.length === 0) return [];

  const emSerie = async () => {
    const saida = [];
    for (let i = 0; i < imagens.length; i++) {
      if (aoAndar) await aoAndar(i, imagens.length);
      saida.push(removerFundoDaImagem(imagens[i], forcar));
    }
    return saida;
  };
  if (!podePrepararEmWorker()) return emSerie();

  let workers;
  try {
    workers = pegarPoolPrepara(Math.min(PREPARA_MAX_WORKERS,
      Math.max(1, (navigator.hardwareConcurrency || 4) - 1), imagens.length));
  } catch (erro) {
    console.warn("[encaixe] sem workers para tirar o fundo, indo em série:", erro);
    derrubarPoolPrepara();
    return emSerie();
  }

  try {
    // Mesma regra do preparo das máscaras: os pixels são lidos aqui e mandados
    // prontos. Aqui não há redimensionamento envolvido, mas a porta única
    // (`pixelsDaImagem`) garante que os dois caminhos vejam os mesmos bytes.
    // Custa ~13% do trabalho de tirar o fundo.
    const bloqueadas = new Map(); // índice -> resolvida na tela mesmo
    const tarefas = [];
    for (let i = 0; i < imagens.length; i++) {
      if (aoAndar) await aoAndar(i, imagens.length);
      const img = imagens[i];

      // Caminho bom: o ImageBitmap atravessa transferido e QUEM LÊ OS PIXELS É
      // O WORKER. Ler 29 megapixels na página custava 1,2 a 1,8 s de thread
      // travada por arte — era isso que fazia o navegador acusar a página como
      // travada. Lá dentro o desenho é 1:1, sem redução, então os bytes são os
      // mesmos que a página leria.
      if (typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap) {
        tarefas.push({
          indice: i,
          mensagem: { tipo: "fundo", bitmap: img, forcar },
          transferir: [img],
        });
        continue;
      }

      // Caminho antigo, para <img>: os pixels são lidos aqui.
      const lido = pixelsDaImagem(img);
      if (!lido) { bloqueadas.set(i, null); continue; }
      const pixels = lido.dados.data.buffer;
      tarefas.push({
        indice: i,
        mensagem: { tipo: "fundo", pixels, largura: lido.largura, altura: lido.altura, forcar },
        transferir: [pixels],
      });
    }

    const respostas = await repartirEntreWorkers(workers, tarefas);

    const saida = new Array(imagens.length).fill(null);
    bloqueadas.forEach((_, i) => { saida[i] = null; });
    respostas.forEach((resposta, k) => {
      const i = tarefas[k].indice;
      if (!resposta || resposta.tipo !== "fundo") {
        console.warn("[encaixe] tirar o fundo falhou:", resposta && resposta.erro);
        // Refazer na tela só é possível quando a imagem ainda existe aqui. O
        // bitmap foi transferido (e fechado) ao ser mandado, então não dá para
        // relê-lo: a arte segue com o fundo, que é ruim mas não quebra nada.
        const img = imagens[i];
        const foiTransferida = typeof ImageBitmap !== "undefined" && img instanceof ImageBitmap;
        saida[i] = foiTransferida ? null : removerFundoDaImagem(img, forcar);
        return;
      }
      saida[i] = resposta.semMudanca ? null
        : {
            src: URL.createObjectURL(resposta.blob),
            // O blob vai junto de propósito: quem for desenhar a arte pode
            // fazer `createImageBitmap(blob)` e decodificar fora da thread da
            // tela, em vez de carregar o objectURL num <img> e pagar a
            // decodificação travando a página.
            blob: resposta.blob,
            apagados: resposta.apagados,
            cor: resposta.cor,
          };
    });
    return saida;
  } catch (erro) {
    console.warn("[encaixe] tirar o fundo em paralelo falhou, indo em série:", erro);
    derrubarPoolPrepara();
    return emSerie();
  }
}
