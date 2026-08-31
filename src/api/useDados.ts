/**
 * Buscar dados do servidor, com os três estados que toda tela precisa mostrar:
 * carregando, deu erro (com a mensagem do servidor) e chegou.
 *
 * É pouco código de propósito. Uma biblioteca de cache de dados resolveria
 * mais casos, mas aqui o servidor é local, roda na mesma máquina e responde em
 * milissegundos: não há rede para amortecer nem estado de servidor remoto para
 * sincronizar. O `recarregar` cobre o resto — depois de gravar, pede de novo.
 */

import { useCallback, useEffect, useState } from "react";

interface Estado<T> {
  dados: T | null;
  carregando: boolean;
  erro: string | null;
}

export function useDados<T>(buscar: () => Promise<T>, dependencias: unknown[] = []) {
  const [estado, setEstado] = useState<Estado<T>>({ dados: null, carregando: true, erro: null });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const buscarEstavel = useCallback(buscar, dependencias);

  const recarregar = useCallback(() => {
    let cancelado = false;
    setEstado((antes) => ({ ...antes, carregando: true, erro: null }));

    buscarEstavel()
      .then((dados) => { if (!cancelado) setEstado({ dados, carregando: false, erro: null }); })
      .catch((erro: unknown) => {
        if (cancelado) return;
        const mensagem = erro instanceof Error ? erro.message : "Não consegui falar com o servidor.";
        setEstado({ dados: null, carregando: false, erro: mensagem });
      });

    return () => { cancelado = true; };
  }, [buscarEstavel]);

  useEffect(() => recarregar(), [recarregar]);

  return { ...estado, recarregar };
}
