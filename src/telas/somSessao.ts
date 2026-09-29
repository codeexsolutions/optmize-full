/**
 * ===========================================================================
 * O SOM DA SESSÃO — a assinatura sonora do login e do logout
 * ===========================================================================
 *
 * O MESMO SOM DO CODEEX FLOW (`codex-flow-frontend/src/shared/session/
 * somSessao.ts`), nota por nota: quem usa os dois sistemas ouve a mesma casa
 * abrindo. A transição visual já tinha vindo de lá (ver `Entrada.tsx`); o som
 * tinha ficado para trás.
 *
 * É SINTETIZADO NA HORA com a Web Audio API, não é arquivo: não pesa no
 * instalador, não depende de cache, e o volume é o que está escrito aqui, e
 * não o de como um mp3 foi masterizado.
 *
 * A entrada é um "power on": um acorde de lá menor com nona que nasce grave e
 * sobe em escada (grave, quinta, oitava e o brilho por cima), com ataque lento
 * e cauda longa — um sinal de que a casa abriu, não um alerta. A saída são os
 * mesmos graus descendo, mais curtos.
 *
 * Duas regras de convivência, as mesmas do Flow:
 *
 *   - SÓ DEPOIS DE UM CLIQUE: o som entra quando a pessoa aperta Entrar ou
 *     Sair, nunca sozinho. Áudio bloqueado desiste em silêncio;
 *   - A CHAVE `optmize-som` DESLIGA DE VEZ ("0" no localStorage).
 *
 * O Flow também cala com `prefers-reduced-motion`. Aqui não: o programa
 * instalado força "sem preferência" no WebView2 (ver src-tauri/src/main.rs),
 * porque no Windows 10 essa caixa vinha marcada em máquina que ninguém
 * escolheu — e o som iria junto com as animações.
 */

const CHAVE = "optmize-som";

function somLigado(): boolean {
  try {
    return localStorage.getItem(CHAVE) !== "0";
  } catch {
    return true;
  }
}

function novoContexto(): AudioContext | null {
  if (typeof window === "undefined" || !somLigado()) return null;
  const Contexto = window.AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Contexto ? new Contexto() : null;
}

/** Uma voz do acorde: senoide com envelope próprio. */
function voz(ctx: AudioContext, destino: AudioNode, hz: number, inicio: number, duracao: number, pico: number, tipo: OscillatorType = "sine") {
  const osc = ctx.createOscillator();
  const ganho = ctx.createGain();

  osc.type = tipo;
  osc.frequency.setValueAtTime(hz, inicio);

  // Ataque suave e queda exponencial: é o que soa "aberto" em vez de "bipe".
  ganho.gain.setValueAtTime(0.0001, inicio);
  ganho.gain.exponentialRampToValueAtTime(pico, inicio + 0.18);
  ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);

  osc.connect(ganho).connect(destino);
  osc.start(inicio);
  osc.stop(inicio + duracao + 0.05);
}

/**
 * O som da entrada. Não espera acabar: a animação do login tem o próprio
 * tempo, e prender uma na outra deixaria o programa mais lento por um efeito.
 */
export function somDeEntrada(): void {
  try {
    const ctx = novoContexto();
    if (!ctx) return;
    // Aberto por gesto do usuário; se ainda vier suspenso, retoma.
    void ctx.resume?.();

    const mestre = ctx.createGain();
    mestre.gain.value = 0.16;

    // Tira a aspereza dos harmônicos altos — o som fica "de sala", não de fone.
    const filtro = ctx.createBiquadFilter();
    filtro.type = "lowpass";
    filtro.frequency.setValueAtTime(1200, ctx.currentTime);
    filtro.frequency.exponentialRampToValueAtTime(4200, ctx.currentTime + 0.9);

    mestre.connect(filtro).connect(ctx.destination);

    const t = ctx.currentTime + 0.02;

    /* Lá menor com nona — grave, quinta, oitava e a nona no fim. Entram em
       escada, não juntos: é a escada que dá a sensação de algo ligando. */
    voz(ctx, mestre, 110.0, t, 2.6, 0.5); // A2 — fundação
    voz(ctx, mestre, 164.81, t + 0.1, 2.4, 0.34); // E3 — quinta
    voz(ctx, mestre, 220.0, t + 0.2, 2.3, 0.3); // A3 — oitava
    voz(ctx, mestre, 329.63, t + 0.34, 2.0, 0.2); // E4
    voz(ctx, mestre, 493.88, t + 0.5, 1.7, 0.12, "triangle"); // B4 — o brilho

    // Fecha o contexto sozinho: um AudioContext vivo por login vaza recurso.
    window.setTimeout(() => void ctx.close?.(), 3200);
  } catch {
    /* Áudio é enfeite: se o navegador recusar, o login segue igual. */
  }
}

/** O som da saída: os mesmos graus, na ordem inversa e mais curtos. */
export function somDeSaida(): void {
  try {
    const ctx = novoContexto();
    if (!ctx) return;
    void ctx.resume?.();

    const mestre = ctx.createGain();
    mestre.gain.value = 0.12;
    mestre.connect(ctx.destination);

    const t = ctx.currentTime + 0.02;

    voz(ctx, mestre, 329.63, t, 1.1, 0.22);
    voz(ctx, mestre, 220.0, t + 0.09, 1.2, 0.28);
    voz(ctx, mestre, 110.0, t + 0.18, 1.4, 0.4);

    window.setTimeout(() => void ctx.close?.(), 1900);
  } catch {
    /* silêncio */
  }
}
