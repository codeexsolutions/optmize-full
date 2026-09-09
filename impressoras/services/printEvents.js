const { EventEmitter } = require("events");

// Barramento interno dos eventos de impressão.
//
// Os serviços que leem as máquinas (realtime, liveLog, printer2Live) só
// conhecem o `io` do socket.io e mandam tudo pro navegador. Em vez de mexer
// nos três pra avisar o bot do WhatsApp, o server passa pra eles um "tap":
// um objeto que repassa cada emit pro socket.io E pra cá. Assim o bot escuta
// exatamente os mesmos eventos que a tela mostra, sem duplicar leitura de
// arquivo nem correr o risco de divergir do painel.
const printEvents = new EventEmitter();
printEvents.setMaxListeners(0);

function tapIo(io) {
  return {
    emit(event, payload) {
      try {
        printEvents.emit(event, payload);
      } catch (error) {
        // Um listener quebrado nunca pode derrubar o envio pro navegador.
        console.warn(`[print-events] listener de "${event}" falhou: ${error.message}`);
      }
      return io.emit(event, payload);
    },
    on: (...args) => io.on(...args),
    of: (...args) => io.of(...args),
    to: (...args) => io.to(...args)
  };
}

module.exports = { printEvents, tapIo };
