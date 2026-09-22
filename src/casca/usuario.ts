/**
 * ===========================================================================
 * QUEM ESTÁ USANDO O PROGRAMA
 * ===========================================================================
 *
 * O Optimize nasceu sem conta nenhuma: um programa por máquina, um `dados.db`
 * por máquina, e quem alcançasse a porta via tudo. Isso está mudando — o
 * sistema vai passar a ser UMA EMPRESA COM VÁRIOS ACESSOS: a empresa se
 * cadastra, as pessoas dela entram com a própria conta, e o que cada uma faz
 * fica no nome dela.
 *
 * ---------------------------------------------------------------------------
 * O LOGIN EXISTE, DESDE 2026-09-21
 * ---------------------------------------------------------------------------
 *
 * Aqui morava um `USUARIO_DE_TESTE` fixo, segurando o lugar até a conta
 * existir, e um bilhete dizendo que quem ligasse a autenticação trocaria
 * `usuarioAtual()` por uma leitura de sessão sem mexer em mais nada. Foi
 * exatamente o que aconteceu: é o `useSessao()` abaixo, e nem a barra, nem o
 * avatar, nem as iniciais precisaram mudar — elas só dependiam do formato.
 *
 * QUEM RESPONDE É O SERVIDOR LOCAL, em `/api/sessao/eu`, e não o backend. O
 * token da conta fica no Node e NÃO atravessa para cá: `server.js` escuta em
 * `0.0.0.0`, então esta página é alcançável por qualquer máquina da rede da
 * gráfica, e o que chega até ela precisa ser inofensivo. Um perfil é.
 * Ver o cabeçalho de `servidor/sessao.js`.
 */

import { useCallback, useEffect, useState } from "react";

export type Papel = "dono" | "admin" | "operador" | "leitor";

export interface Usuario {
  nome: string;
  /** A empresa dona da conta. Uma pessoa sozinha é uma empresa de um membro. */
  empresa: string;
  papel: Papel;
}

/*
 * O PAPEL É DADO, E NÃO APARECE NA BARRA.
 *
 * Ele fica no tipo porque é dele que a permissão vai sair — quem pode apagar
 * um molde, quem só olha o histórico. Mas não tem nome de tela aqui: o lugar
 * de mostrá-lo é onde ele TEM efeito (a lista de membros da empresa, o botão
 * que não abre), e não no alto do menu, onde seria a mesma palavra o dia
 * inteiro para quem já sabe o próprio cargo.
 *
 * Quando essa tela existir, o mapa de `Papel` para texto nasce junto com ela.
 */

/**
 * A conta pode trabalhar hoje?
 *
 * Vem pronta do servidor local, que a pediu ao backend — nada disto é
 * decidido aqui. Ver o cabeçalho de `servidor/sessao.js`.
 */
export interface Acesso {
  liberado: boolean;
  /** `true` quando o que falta é a CodeEx liberar, e não a pessoa pagar. */
  pendente: boolean;
  /** O motivo como o servidor o escreveu, em português. */
  motivo: string | null;
  plano: string;
  status: string;
  conferidoEm: string;
}

/**
 * Os estados possíveis enquanto a tela descobre quem está usando.
 *
 * `bloqueado` é a conta que ENTROU e ainda não pode trabalhar — plano por
 * acertar, ou liberação pendente no painel. Entrar e poder trabalhar são duas
 * perguntas diferentes, e antes deste estado o programa tratava as duas como
 * uma só: quem passava pelo login via o Optmize inteiro.
 */
export type EstadoDaSessao = "carregando" | "fora" | "dentro" | "bloqueado";

export interface Sessao {
  estado: EstadoDaSessao;
  usuario: Usuario | null;
  /** O acesso, quando já se sabe. `null` antes da primeira resposta. */
  acesso: Acesso | null;
  /** Relê `/api/sessao/eu`. É o que a tela de entrar chama ao conseguir. */
  recarregar: () => void;
  /** Pergunta de novo ao backend, e espera a resposta. O botão da espera. */
  conferir: () => Promise<void>;
}

/**
 * Quem está usando o programa agora.
 *
 * Começa em "carregando" de propósito, e a casca não desenha nada nesse
 * estado: mostrar a tela de entrar por meio segundo para quem já entrou seria
 * pior que meio segundo de tela vazia.
 */
interface RespostaDaSessao {
  entrou: boolean;
  perfil: Usuario | null;
  acesso: Acesso | null;
}

export function useSessao(): Sessao {
  const [estado, setEstado] = useState<EstadoDaSessao>("carregando");
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [acesso, setAcesso] = useState<Acesso | null>(null);

  const aplicar = useCallback((s: RespostaDaSessao) => {
    setUsuario(s.entrou ? s.perfil : null);
    setAcesso(s.acesso ?? null);
    if (!s.entrou) return setEstado("fora");
    /*
      SEM RESPOSTA SOBRE O ACESSO, O PROGRAMA ABRE.

      `acesso` é `null` quando o servidor local nunca conseguiu perguntar —
      primeira abertura sem internet, ou Railway fora do ar. Tratar isso como
      bloqueio pararia a gráfica que está em dia por causa de um link caído, e
      o prejuízo seria de quem paga. Ver o cabeçalho de `servidor/sessao.js`:
      a trava de verdade é no servidor, a cada operação.
    */
    setEstado(s.acesso && !s.acesso.liberado ? "bloqueado" : "dentro");
  }, []);

  const recarregar = useCallback(() => {
    fetch("/api/sessao/eu")
      .then((r) => r.json())
      .then(aplicar)
      .catch(() => {
        // O servidor local não respondeu: é o Optmize subindo ou fechando.
        // "fora" leva à tela de entrar, que é recuperável; supor "dentro"
        // abriria o programa sem conta nenhuma.
        setUsuario(null);
        setAcesso(null);
        setEstado("fora");
      });
  }, [aplicar]);

  const conferir = useCallback(async () => {
    try {
      const resposta = await fetch("/api/sessao/conferir", { method: "POST" });
      aplicar(await resposta.json());
    } catch {
      // Sem rede: fica como está. A tela de espera continua na frente, e o
      // botão pode ser apertado de novo quando a internet voltar.
    }
  }, [aplicar]);

  useEffect(() => { recarregar(); }, [recarregar]);

  return { estado, usuario, acesso, recarregar, conferir };
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  const primeira = partes[0]![0]!;
  const ultima = partes.length > 1 ? partes[partes.length - 1]![0]! : "";
  return (primeira + ultima).toUpperCase();
}
