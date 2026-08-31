/**
 * A data e a hora do cabeçalho, em português, atualizadas de meio em meio
 * minuto — o relógio mostra hora e minuto, então não há o que ganhar olhando
 * mais vezes que isso.
 */

import { useEffect, useState } from "react";

const DATA = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
const HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

function agora() {
  const momento = new Date();
  return { data: DATA.format(momento).replace(".", ""), hora: HORA.format(momento) };
}

export function useRelogio() {
  const [relogio, setRelogio] = useState(agora);

  useEffect(() => {
    const timer = window.setInterval(() => setRelogio(agora()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return relogio;
}
