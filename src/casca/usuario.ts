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

/** Os estados possíveis enquanto a tela descobre quem está usando. */
export type EstadoDaSessao = "carregando" | "fora" | "dentro";

export interface Sessao {
  estado: EstadoDaSessao;
  usuario: Usuario | null;
  /** Relê `/api/sessao/eu`. É o que a tela de entrar chama ao conseguir. */
  recarregar: () => void;
}

/**
 * Quem está usando o programa agora.
 *
 * Começa em "carregando" de propósito, e a casca não desenha nada nesse
 * estado: mostrar a tela de entrar por meio segundo para quem já entrou seria
 * pior que meio segundo de tela vazia.
 */
export function useSessao(): Sessao {
  const [estado, setEstado] = useState<EstadoDaSessao>("carregando");
  const [usuario, setUsuario] = useState<Usuario | null>(null);

  const recarregar = useCallback(() => {
    fetch("/api/sessao/eu")
      .then((r) => r.json())
      .then((s: { entrou: boolean; perfil: Usuario | null }) => {
        setUsuario(s.entrou ? s.perfil : null);
        setEstado(s.entrou ? "dentro" : "fora");
      })
      .catch(() => {
        // O servidor local não respondeu: é o Optmize subindo ou fechando.
        // "fora" leva à tela de entrar, que é recuperável; supor "dentro"
        // abriria o programa sem conta nenhuma.
        setUsuario(null);
        setEstado("fora");
      });
  }, []);

  useEffect(() => { recarregar(); }, [recarregar]);

  return { estado, usuario, recarregar };
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  const primeira = partes[0]![0]!;
  const ultima = partes.length > 1 ? partes[partes.length - 1]![0]! : "";
  return (primeira + ultima).toUpperCase();
}
