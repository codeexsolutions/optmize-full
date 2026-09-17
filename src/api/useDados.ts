/**
 * Buscar dados do servidor, com os três estados que toda tela precisa mostrar:
 * carregando, deu erro (com a mensagem do servidor) e chegou.
 *
 * É pouco código de propósito. Uma biblioteca de cache de dados resolveria
 * mais casos, mas aqui o servidor é local, roda na mesma máquina e responde em
 * milissegundos: não há rede para amortecer nem estado de servidor remoto para
 * sincronizar. O `recarregar` cobre o resto — depois de gravar, pede de novo.
 *
 * O `setDados` é a exceção a esse "peça de novo": quando o próprio servidor
 * empurra o estado completo por um evento — é o caso do progresso da varredura
 * da rede, que chega inteiro a cada passo —, ir buscar de novo o que acabou de
 * chegar é uma volta ao servidor para receber a mesma coisa.
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface Estado<T> {
  dados: T | null;
  carregando: boolean;
  erro: string | null;
}

export function useDados<T>(buscar: () => Promise<T>, dependencias: unknown[] = []) {
  const [estado, setEstado] = useState<Estado<T>>({ dados: null, carregando: true, erro: null });
  const ultimaConsulta = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const buscarEstavel = useCallback(buscar, dependencias);

  const recarregar = useCallback(() => {
    const consulta = ++ultimaConsulta.current;
    setEstado((antes) => ({ ...antes, carregando: true, erro: null }));

    Promise.resolve().then(buscarEstavel)
      .then((dados) => { if (consulta === ultimaConsulta.current) setEstado({ dados, carregando: false, erro: null }); })
      .catch((erro: unknown) => {
        if (consulta !== ultimaConsulta.current) return;
        const mensagem = erro instanceof Error ? erro.message : "Não consegui falar com o servidor.";
        setEstado({ dados: null, carregando: false, erro: mensagem });
      });

    return () => { if (consulta === ultimaConsulta.current) ultimaConsulta.current++; };
  }, [buscarEstavel]);

  useEffect(() => {
    recarregar();
    // Invalida também as recargas manuais que começaram depois da primeira.
    return () => { ultimaConsulta.current++; };
  }, [recarregar]);

  /** Substitui o que está na tela sem ir ao servidor. Ver o cabeçalho. */
  const setDados = useCallback((dados: T) => {
    // Um evento já trouxe o estado novo; uma consulta anterior não pode apagá-lo.
    ultimaConsulta.current++;
    setEstado({ dados, carregando: false, erro: null });
  }, []);

  return { ...estado, recarregar, setDados };
}
