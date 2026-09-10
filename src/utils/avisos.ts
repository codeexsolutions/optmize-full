/**
 * ===========================================================================
 * AVISOS — quando uma impressão nova aparece
 * ===========================================================================
 *
 * O painel fica aberto num monitor da produção, e quem passa por ele nem
 * sempre está olhando. Então trabalho novo pode avisar de três jeitos, cada um
 * ligado ou desligado por quem usa: som, voz e notificação do sistema.
 *
 * ---------------------------------------------------------------------------
 * TRÊS DECISÕES QUE VALEM EXPLICAÇÃO
 * ---------------------------------------------------------------------------
 *
 * **O som é sintetizado, não é arquivo.** Um `.mp3` de bipe seriam mais 20 KB
 * no `dist` e mais um arquivo para o empacotador levar — para um bipe. O
 * `AudioContext` faz o mesmo som com uma senoide e um envelope, e o navegador
 * já tem tudo isso dentro.
 *
 * **O navegador não deixa tocar som sem interação.** Uma aba que nunca foi
 * clicada tem o áudio suspenso, e um `AudioContext` criado ali nasce parado.
 * Por isso o contexto só é criado no clique que LIGA o aviso — que é uma
 * interação de verdade — e não na carga da página.
 *
 * **Permissão de notificação também precisa de clique.** `Notification.
 * requestPermission()` chamado na carga é ignorado pelos navegadores atuais.
 * Ela é pedida no mesmo clique que liga o aviso, e se for negada o interruptor
 * volta sozinho: interruptor ligado que não notifica é pior do que desligado.
 *
 * As preferências ficam no `localStorage` — são de quem está naquela máquina,
 * não do sistema. Um monitor na parede da produção quer som; o computador de
 * quem está no telefone o dia todo, não.
 */

export interface PreferenciasDeAviso {
  som: boolean;
  voz: boolean;
  notificacao: boolean;
}

const PADRAO: PreferenciasDeAviso = { som: false, voz: false, notificacao: false };
const CHAVE = "optimize:impressoras:avisos";

export function lerPreferencias(): PreferenciasDeAviso {
  try {
    const cru = localStorage.getItem(CHAVE);
    if (!cru) return PADRAO;
    const lido = JSON.parse(cru) as Partial<PreferenciasDeAviso>;
    return {
      som: lido.som === true,
      voz: lido.voz === true,
      notificacao: lido.notificacao === true,
    };
  } catch {
    // Janela anônima, armazenamento bloqueado, JSON estragado. Nada disso é
    // erro: só quer dizer "sem preferência guardada".
    return PADRAO;
  }
}

export function gravarPreferencias(valor: PreferenciasDeAviso) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(valor));
  } catch { /* ver lerPreferencias */ }
}

let contexto: AudioContext | null = null;

/**
 * Prepara o áudio. Tem que ser chamado de dentro de um clique.
 *
 * Devolve `false` quando o navegador não tem `AudioContext` — nesse caso o
 * interruptor de som não deve nem aparecer ligado.
 */
export function prepararSom(): boolean {
  try {
    const Contexto = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Contexto) return false;
    contexto ??= new Contexto();
    // Uma aba que ficou em segundo plano volta com o contexto suspenso.
    void contexto.resume();
    return true;
  } catch {
    return false;
  }
}

/**
 * Dois bipes curtos, subindo.
 *
 * Subindo de propósito: som que desce é o que todo sistema usa para erro, e
 * este aviso é de coisa boa acontecendo — a máquina está produzindo.
 */
export function tocarBipe() {
  if (!contexto) return;
  const agora = contexto.currentTime;

  for (const [posicao, frequencia] of [[0, 880], [0.16, 1174.7]] as const) {
    const oscilador = contexto.createOscillator();
    const volume = contexto.createGain();

    oscilador.type = "sine";
    oscilador.frequency.value = frequencia;

    // Envelope curto: sem ele o som começa e termina num estalo, que é o
    // clique da onda cortada no zero errado.
    const inicio = agora + posicao;
    volume.gain.setValueAtTime(0, inicio);
    volume.gain.linearRampToValueAtTime(0.14, inicio + 0.01);
    volume.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.13);

    oscilador.connect(volume).connect(contexto.destination);
    oscilador.start(inicio);
    oscilador.stop(inicio + 0.14);
  }
}

/** Fala o recado, em português. Silencioso se o navegador não tiver voz. */
export function falar(texto: string) {
  try {
    if (!("speechSynthesis" in window)) return;
    // Sem cancelar, dois trabalhos seguidos viram duas falas por cima uma da
    // outra e não se entende nenhuma das duas.
    window.speechSynthesis.cancel();
    const fala = new SpeechSynthesisUtterance(texto);
    fala.lang = "pt-BR";
    fala.rate = 1.05;
    window.speechSynthesis.speak(fala);
  } catch { /* voz é enfeite: nunca pode derrubar a tela */ }
}

/**
 * Pede a permissão de notificação. Tem que ser chamado de dentro de um clique.
 *
 * Devolve se ficou permitido. "default" (a pessoa fechou a caixa sem escolher)
 * conta como não: o interruptor não pode ficar ligado prometendo um aviso que
 * não vai chegar.
 */
export async function pedirPermissaoDeNotificacao(): Promise<boolean> {
  try {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

export function notificar(titulo: string, corpo: string) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    new Notification(titulo, { body: corpo, tag: "optimize-impressao" });
  } catch { /* idem: enfeite */ }
}
