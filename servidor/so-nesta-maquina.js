/**
 * ===========================================================================
 * O PROGRAMA É DESTA MÁQUINA — a rede local só vê as impressoras (2026-10-25)
 * ===========================================================================
 *
 * O servidor escuta em `0.0.0.0` porque o painel das impressoras é para a
 * fábrica inteira olhar (ver `server.js`). Só que a trava da conta é da
 * MÁQUINA (`sessao.liberado()`): com ela liberada, qualquer computador da rede
 * abria `http://IP:porta` no navegador e usava o Optmize inteiro — encaixe,
 * PDF, galeria — no acesso desta máquina. Um acesso virava a gráfica toda, e
 * "uma sessão por acesso" não queria dizer nada.
 *
 * Agora quem chega de fora da máquina alcança só o que o painel usa:
 *
 *   - os arquivos da interface (sem eles não há tela nenhuma);
 *   - `/api/impressoras/*` e o canal `socket.io` das impressoras;
 *   - `/api/sessao/eu`, para a tela saber que é visita e mostrar só o painel.
 *
 * Todo o resto da API e as imagens enviadas (`/uploads`) respondem 403 —
 * inclusive entrar e sair da conta, que de fora mexeriam na sessão desta
 * máquina.
 *
 * "Desta máquina" é a conexão vir do loopback. A janela do Tauri navega para
 * `127.0.0.1` (ver `src-tauri/src/main.rs`), e o Vite do desenvolvimento
 * também repassa por ele.
 */

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** O pedido saiu desta mesma máquina? */
function ehDestaMaquina(req) {
  const endereco = req.socket && req.socket.remoteAddress;
  return Boolean(endereco) && LOOPBACK.has(endereco);
}

/** O que a rede local pode alcançar. Ver o cabeçalho. */
function liberadoParaARede(caminho) {
  if (!caminho.startsWith("/api/") && !caminho.startsWith("/uploads/")) return true;
  return caminho === "/api/impressoras" || caminho.startsWith("/api/impressoras/")
    || caminho === "/api/sessao/eu";
}

function soNestaMaquina(req, res, next) {
  if (ehDestaMaquina(req) || liberadoParaARede(req.path)) return next();
  return res.status(403).json({
    erro: "so_nesta_maquina",
    code: "so_nesta_maquina",
    message: "Pela rede, o Optmize mostra só o painel das impressoras. "
      + "O programa é usado no computador em que a conta entrou.",
  });
}

module.exports = { ehDestaMaquina, liberadoParaARede, soNestaMaquina };
