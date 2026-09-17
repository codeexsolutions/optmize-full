/** Falhas de workers não podem prender o preparo nem inutilizar a arte original. */
const assert = require('node:assert/strict');
const { carregarDosMotores } = require('./motores');

class Bitmap {
  constructor() { this.width = 2; this.height = 2; }
  close() { this.width = 0; this.height = 0; }
}

class WorkerDeTeste extends EventTarget {
  static modo = 'normal';
  constructor() { super(); this.ouvintes = new Set(); }
  addEventListener(tipo, fn, opcoes) {
    this.ouvintes.add(fn);
    super.addEventListener(tipo, fn, opcoes);
  }
  removeEventListener(tipo, fn, opcoes) {
    this.ouvintes.delete(fn);
    super.removeEventListener(tipo, fn, opcoes);
  }
  postMessage(mensagem, transferir = []) {
    if (WorkerDeTeste.modo === 'envio-falha') throw new Error('Falha ao enviar');
    for (const bitmap of transferir) bitmap.close();
    queueMicrotask(() => {
      const falha = WorkerDeTeste.modo === 'worker-falha';
      const evento = new Event(falha ? 'error' : 'message');
      if (falha) evento.message = 'Worker não carregou';
      else evento.data = { ...mensagem, semMudanca: true };
      this.dispatchEvent(evento);
    });
  }
  terminate() {}
}

async function noPrazo(promessa) {
  let timer;
  try {
    return await Promise.race([promessa, new Promise((_, rejeitar) => {
      timer = setTimeout(() => rejeitar(new Error('O preparo ficou preso')), 1000);
    })]);
  } finally { clearTimeout(timer); }
}

async function main() {
  const originais = new Map();
  const canais = [];
  const definir = (nome, valor) => {
    originais.set(nome, Object.getOwnPropertyDescriptor(globalThis, nome));
    Object.defineProperty(globalThis, nome, { value: valor, configurable: true, writable: true });
  };
  definir('document', { createElement: () => ({
    getContext: () => ({
      drawImage(img) { assert.ok(img.width > 0, 'a imagem continua utilizável no fallback'); },
      getImageData: () => ({ data: new Uint8ClampedArray(16).fill(255) }),
    }),
  }) });
  definir('Worker', WorkerDeTeste);
  definir('OffscreenCanvas', class {});
  definir('ImageBitmap', Bitmap);
  definir('createImageBitmap', async (img) => {
    assert.ok(img.width > 0, 'repetir a remoção recebe uma imagem válida');
    return new Bitmap();
  });
  definir('navigator', { hardwareConcurrency: 4 });
  definir('MessageChannel', class extends require('node:worker_threads').MessageChannel {
    constructor() { super(); canais.push(this); }
  });

  let preparo;
  try {
    preparo = await carregarDosMotores(['motores/encaixePrepara.js']);
    const { posicoesGuardadasValidas } = await carregarDosMotores(['api/encaixe.ts']);
    const pecas = [{ qtd: 2 }, { qtd: 1 }];
    const posicoes = [
      { indice: 0, copia: 1, x: 0, y: 0, rot: 0 },
      { indice: 0, copia: 2, x: 10, y: 0, rot: 0 },
      { indice: 1, copia: 1, x: 20, y: 0, rot: 90 },
    ];
    assert.equal(posicoesGuardadasValidas(posicoes, pecas, [0, 1]), true);
    assert.equal(posicoesGuardadasValidas([{ ...posicoes[0], x: -1, y: -2 }, ...posicoes.slice(1)], pecas, [0, 1]), true,
      'a origem da arte pode ser negativa quando o encaixe desconta bordas transparentes');
    assert.equal(posicoesGuardadasValidas(posicoes, [...pecas].reverse(), [1, 0]), true);
    assert.equal(posicoesGuardadasValidas(posicoes.slice(1), pecas, [0, 1]), false);
    assert.equal(posicoesGuardadasValidas([posicoes[0], posicoes[0], posicoes[2]], pecas, [0, 1]), false);
    assert.equal(posicoesGuardadasValidas([{ ...posicoes[0], x: NaN }, ...posicoes.slice(1)], pecas, [0, 1]), false);
    const tarefas = Array.from({ length: 5 }, (_, id) => ({ mensagem: { id } }));
    const workers = [new WorkerDeTeste(), new WorkerDeTeste()];
    const respostas = await noPrazo(preparo.repartirEntreWorkers(workers, tarefas));
    assert.deepEqual(respostas.map(r => r.id), [0, 1, 2, 3, 4]);
    assert.ok(workers.every(w => w.ouvintes.size === 0));
    assert.deepEqual(await preparo.repartirEntreWorkers([], []), []);
    await assert.rejects(preparo.repartirEntreWorkers([], tarefas), /Nenhum worker/);

    for (const modo of ['worker-falha', 'envio-falha']) {
      WorkerDeTeste.modo = modo;
      await assert.rejects(noPrazo(preparo.repartirEntreWorkers(workers, tarefas)),
        modo === 'worker-falha' ? /não carregou/ : /Falha ao enviar/);
      assert.ok(workers.every(w => w.ouvintes.size === 0), 'limpa ouvintes também quando falha');
    }

    WorkerDeTeste.modo = 'normal';
    const img = new Bitmap();
    for (let i = 0; i < 2; i++) {
      assert.deepEqual(await noPrazo(preparo.tirarFundoEmParalelo([img])), [null]);
      assert.equal(img.width, 2, 'o worker nunca recebe o bitmap original por transferência');
    }
    WorkerDeTeste.modo = 'worker-falha';
    const avisar = console.warn;
    console.warn = () => {};
    try {
      // Uma arte preta não muda no automático; testamos a leitura do original
      // intacto pelo caminho de fallback, sem precisar emular a pintura.
      globalThis.document.createElement = () => ({ getContext: () => ({
        drawImage(bitmap) { assert.equal(bitmap.width, 2); },
        getImageData: () => ({ data: Uint8ClampedArray.from([0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255]) }),
      }) });
      assert.deepEqual(await noPrazo(preparo.tirarFundoEmParalelo([img])), [null]);
      assert.equal(img.width, 2);
    } finally { console.warn = avisar; }
    console.log('OK — fila, limpeza de ouvintes, falhas, fallback e remoção repetida preservam a imagem.');
  } finally {
    preparo?.derrubarPoolPrepara();
    canais.forEach(canal => { canal.port1.close(); canal.port2.close(); });
    for (const [nome, descritor] of originais) {
      if (descritor) Object.defineProperty(globalThis, nome, descritor);
      else delete globalThis[nome];
    }
  }
}

main().catch(erro => { console.error(erro); process.exitCode = 1; });
