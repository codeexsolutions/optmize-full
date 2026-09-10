/** Recursos de uma montagem: nada é instalado no window ou document globais. */
export function criarEscopo(raiz) {
  const real = globalThis;
  const eventos = new EventTarget();
  const listeners = [];
  const timers = new Set();
  const intervalos = new Set();
  const frames = new Set();
  const urls = new Set();
  const requisicoes = new Set();
  let ativo = true;
  function ouvir(alvo, tipo, fn, opcoes) {
    function falhou(erro) {
      if (ativo && erro?.name !== 'AbortError') raiz.dispatchEvent(new real.CustomEvent('producao:erro', { detail: erro?.message || String(erro) }));
    }
    function tratar(evento) {
      if (!ativo) return;
      try { const resultado = fn.call(this, evento); resultado?.catch?.(falhou); } catch (erro) { falhou(erro); }
    }
    alvo.addEventListener(tipo, tratar, opcoes);
    listeners.push([alvo, tipo, tratar, opcoes, fn]);
  }
  function remover(alvo, tipo, fn, opcoes) {
    for (let i=listeners.length-1; i>=0; i--) {
      const entrada=listeners[i];
      if(entrada[0] === alvo && entrada[1] === tipo && entrada[4] === fn) {
        alvo.removeEventListener(tipo, entrada[2], opcoes);
        listeners.splice(i,1);
      }
    }
  }
  const document = new Proxy(real.document, {
    get(alvo, chave) {
      if (chave === 'body') return raiz;
      if (chave === 'getElementById') return id => raiz.querySelector('#' + CSS.escape(id));
      if (chave === 'querySelector' || chave === 'querySelectorAll') return raiz[chave].bind(raiz);
      if (chave === 'addEventListener') return (tipo, fn, opcoes) => ouvir(tipo.startsWith('optimize:') ? eventos : alvo, tipo, fn, opcoes);
      if (chave === 'removeEventListener') return (tipo, fn, opcoes) => remover(tipo.startsWith('optimize:') ? eventos : alvo, tipo, fn, opcoes);
      if (chave === 'dispatchEvent') return eventos.dispatchEvent.bind(eventos);
      const valor = Reflect.get(alvo, chave, alvo);
      return typeof valor === 'function' ? valor.bind(alvo) : valor;
    }
  });
  const window = new Proxy(real.window, {
    get(alvo, chave) {
      if (chave === 'document') return document;
      if (chave === 'addEventListener') return (tipo, fn, opcoes) => ouvir(alvo, tipo, fn, opcoes);
      if (chave === 'removeEventListener') return (tipo, fn, opcoes) => remover(alvo, tipo, fn, opcoes);
      const valor = Reflect.get(alvo, chave, alvo);
      return typeof valor === 'function' ? valor.bind(alvo) : valor;
    }
  });
  class URLDaMontagem extends real.URL {
    static createObjectURL(blob) { const url = real.URL.createObjectURL(blob); urls.add(url); return url; }
    static revokeObjectURL(url) { urls.delete(url); real.URL.revokeObjectURL(url); }
  }
  return {
    document, window, URL: URLDaMontagem, ouvir,
    setTimeout(fn, prazo, ...args) {
      const id = real.setTimeout(() => { timers.delete(id); if (ativo) fn(...args); }, prazo);
      timers.add(id); return id;
    },
    clearTimeout(id) { timers.delete(id); real.clearTimeout(id); },
    setInterval(fn, prazo) { const id = real.setInterval(() => { if (ativo) fn(); }, prazo); intervalos.add(id); return id; },
    clearInterval(id) { intervalos.delete(id); real.clearInterval(id); },
    requestAnimationFrame(fn) {
      const id = real.requestAnimationFrame(t => { frames.delete(id); if (ativo) fn(t); });
      frames.add(id); return id;
    },
    async fetch(url, opcoes = {}) {
      if (!ativo) throw new DOMException('Editor desmontado', 'AbortError');
      const controller = new AbortController();
      requisicoes.add(controller);
      try {
        return await real.fetch(url, { ...opcoes, signal: opcoes.signal ? AbortSignal.any([opcoes.signal, controller.signal]) : controller.signal });
      } finally { requisicoes.delete(controller); }
    },
    destruir() {
      ativo = false;
      for (const [alvo, tipo, fn, opcoes] of listeners) alvo.removeEventListener(tipo, fn, opcoes);
      for (const id of timers) real.clearTimeout(id);
      for (const id of intervalos) real.clearInterval(id);
      for (const id of frames) real.cancelAnimationFrame(id);
      for (const url of urls) real.URL.revokeObjectURL(url);
      for (const controller of requisicoes) controller.abort();
    }
  };
}
