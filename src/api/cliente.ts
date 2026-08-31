/**
 * ===========================================================================
 * API — a conversa com o servidor, num lugar só
 * ===========================================================================
 *
 * A tela antiga espalhava `fetch` por dentro de cada arquivo, e cada um
 * tratava erro do seu jeito (ou não tratava). Aqui é o contrário: toda
 * chamada passa por `pedir`, que resolve três coisas de uma vez — o caminho
 * relativo (`/api/...`, que funciona tanto no Vite quanto no Express), o JSON
 * dos dois lados, e o erro virando exceção com a mensagem que o servidor
 * mandou, em vez de um `undefined` chegando na tela.
 */

export class ErroDaApi extends Error {
  constructor(readonly status: number, mensagem: string) {
    super(mensagem);
    this.name = "ErroDaApi";
  }
}

async function pedir<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  const temCorpo = opcoes.body !== undefined && !(opcoes.body instanceof ArrayBuffer);

  const resposta = await fetch(`/api${caminho}`, {
    ...opcoes,
    headers: {
      ...(temCorpo ? { "Content-Type": "application/json" } : {}),
      ...opcoes.headers,
    },
  });

  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : null;

  if (!resposta.ok) {
    const mensagem = (dados && typeof dados === "object" && "error" in dados && String(dados.error)) ||
      `O servidor respondeu ${resposta.status}.`;
    throw new ErroDaApi(resposta.status, mensagem);
  }

  return dados as T;
}

export const api = {
  get: <T,>(caminho: string) => pedir<T>(caminho),
  post: <T,>(caminho: string, corpo: unknown) =>
    pedir<T>(caminho, { method: "POST", body: JSON.stringify(corpo) }),
  put: <T,>(caminho: string, corpo: unknown) =>
    pedir<T>(caminho, { method: "PUT", body: JSON.stringify(corpo) }),
  apagar: <T,>(caminho: string) => pedir<T>(caminho, { method: "DELETE" }),
};
