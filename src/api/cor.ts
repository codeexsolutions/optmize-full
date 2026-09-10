/**
 * A conversão de cor, do lado do navegador.
 *
 * Não passa pelo `cliente.ts` porque não é uma rota JSON: o arquivo sobe cru,
 * em `application/octet-stream`, e o nome vai num cabeçalho. Mandar uma arte de
 * 50 MB em base64 dentro de um JSON custaria um terço a mais de rede e uma
 * cópia inteira na memória da aba.
 */

/** O que o servidor conta sobre a arte depois de olhar o perfil dela. */
export interface RespostaDaConversao {
  nome: string;
  convertido: boolean;
  /** Quando `convertido` é falso: por que não havia o que fazer. */
  motivo?: string;
  nomeNovo?: string;
  perfil?: string;
  espaco?: string;
  largura?: number;
  altura?: number;
  cores?: number;
  /** A miniatura do DEPOIS, já pronta — são pixels que o servidor tinha na mão. */
  depois?: string;
  /** A chave para buscar o arquivo convertido, uma vez só. */
  id?: string;
}

/**
 * Manda a arte para o servidor converter.
 *
 * Um 404 aqui não é uma arte difícil: é o servidor sem a rota. A tela e o
 * servidor viajam juntos mas chegam por caminhos diferentes — recarregar a
 * página já traz a tela nova, enquanto `/api/cor` só passa a existir quando o
 * processo do Node reinicia. Entre uma coisa e outra, a tela aparece e a rota
 * não responde.
 *
 * A primeira versão fazia `.json()` antes de olhar o status, e a página de erro
 * em HTML estourava um "Unexpected token '<'" que virava, na lista, um "não dá
 * para converter" ao lado da arte — como se o problema fosse ela. Diagnóstico
 * errado no lugar mais caro: o que a pessoa faria em seguida é mexer num
 * arquivo que está bom.
 */
export async function converterArte(arquivo: File): Promise<RespostaDaConversao> {
  const resposta = await fetch("/api/cor/converter", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Nome-Do-Arquivo": encodeURIComponent(arquivo.name),
    },
    body: arquivo,
  });

  if (resposta.status === 404) {
    throw new Error("o servidor deste programa ainda não tem a conversão de cor."
      + " Feche e abra o programa (ou reinicie o servidor) para ela entrar");
  }

  let dados: RespostaDaConversao & { erro?: string };
  try {
    dados = await resposta.json();
  } catch {
    throw new Error(`o servidor respondeu ${resposta.status} sem explicar o motivo`);
  }
  if (!resposta.ok) throw new Error(dados.erro || "o servidor não conseguiu ler o arquivo");
  return dados;
}

/**
 * Busca o arquivo já convertido e o traz para cá.
 *
 * Ele vem uma vez só: o servidor o entrega e o esquece. Trazer o Blob para o
 * navegador é o que permite o servidor não segurar 25 artes de 4 MB esperando
 * alguém clicar num botão, e o que faz o "Mandar para o Encaixe" não esperar
 * rede nenhuma.
 */
export async function buscarArteConvertida(id: string): Promise<Blob> {
  const bytes = await fetch(`/api/cor/arquivo/${id}`);
  if (!bytes.ok) throw new Error("a conversão terminou mas o arquivo não voltou");
  return bytes.blob();
}
