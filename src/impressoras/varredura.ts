/**
 * A varredura da rede, do lado de cá.
 *
 * O estado inteiro mora no servidor (é uma varredura só, para todo mundo que
 * estiver com o programa aberto), e chega aqui de dois jeitos: uma consulta ao
 * abrir a tela e o evento `machines:scan` a cada passo. Este hook é só isso
 * mais os dois comandos — começar e parar.
 *
 * Ele existe porque agora são DUAS telas mexendo na mesma varredura: a de
 * Máquinas e a porta do painel de Impressoras, quando não há impressora
 * nenhuma cadastrada. Com o código dos dois lados, a primeira diferença
 * silenciosa entre eles seria questão de tempo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/cliente";
import { useDados } from "../api/useDados";
import { useEventos } from "./socket";
import type { EstadoDaVarredura } from "./tipos";

export function useVarredura(aoTerminar?: () => void) {
  const varredura = useDados<EstadoDaVarredura>(
    () => api.get<EstadoDaVarredura>("/impressoras/machines/scan"),
  );
  const [falha, setFalha] = useState<string | null>(null);

  const { setDados, recarregar } = varredura;

  /* O aviso do fim vai por referência para o ouvinte do socket não precisar
     ser refeito toda vez que quem chamou redesenhar. */
  const terminou = useRef(aoTerminar);
  useEffect(() => { terminou.current = aoTerminar; }, [aoTerminar]);

  // O progresso vem INTEIRO no evento, então dá para pintar direto sem uma
  // volta ao servidor a cada passo.
  useEventos(["machines:scan"], (_evento, dados) => {
    const estado = dados as EstadoDaVarredura;
    setDados(estado);
    if (estado.phase === "done") terminou.current?.();
  });

  const procurar = useCallback(async (hosts: string[] = []) => {
    setFalha(null);
    try {
      await api.post("/impressoras/machines/scan", { hosts });
      recarregar();
    } catch (erro) {
      setFalha(erro instanceof Error ? erro.message : "Não consegui começar a varredura.");
    }
  }, [recarregar]);

  const parar = useCallback(async () => {
    try {
      await api.post("/impressoras/machines/scan/stop", {});
      recarregar();
    } catch {
      /* parar é um pedido, não uma garantia: a varredura em curso termina o passo atual */
    }
  }, [recarregar]);

  return {
    estado: varredura.dados,
    rodando: Boolean(varredura.dados?.running),
    falha,
    procurar,
    parar,
    recarregar,
  };
}
