/**
 * ===========================================================================
 * O MODO LEVE — o que sai nas máquinas que não aguentam
 * ===========================================================================
 *
 * O programa força "sem preferência" de movimento no WebView2 (ver
 * `--force-prefers-no-reduced-motion`, em src-tauri/src/main.rs), e com isso
 * perdeu o único sinal que o Windows dava de máquina fraca: "Ajustar para
 * obter o melhor desempenho" é justo o que o técnico liga no PC que já
 * engasga. Nessas máquinas — e no acesso remoto, onde não há placa de vídeo
 * e o Chromium desenha tudo no processador — o desfoque do cabeçalho, refeito
 * a cada rolagem, e a rede da barra lateral, desenhada enquanto o mouse anda,
 * deixaram o programa inteiro atrasado.
 *
 * Aqui se decide UMA VEZ, antes de a tela montar, se a máquina é dessas. Se
 * for, o `<html>` ganha a classe `leve`: o CSS tira o desfoque (ver o fim de
 * `estilo/entrada.css`) e a `RedeAnimada` desenha um quadro só e para. As
 * animações curtas de entrada continuam — custam pouco e eram o motivo de
 * forçar o movimento.
 *
 * O que conta como fraca:
 * - placa de vídeo de software (SwiftShader, "Microsoft Basic Render Driver",
 *   llvmpipe) ou WebGL nenhum — é o acesso remoto e o driver de vídeo velho;
 * - 4 núcleos ou menos;
 * - 4 GB de memória ou menos (o Chromium arredonda e nunca diz mais de 8).
 *
 * E quem quiser decidir na mão grava `optmize-modo-leve` no localStorage:
 * "sim" liga, "nao" desliga, qualquer outra coisa volta ao automático.
 */

const CHAVE = "optmize-modo-leve";

function escolhaManual(): boolean | null {
  try {
    const valor = localStorage.getItem(CHAVE);
    if (valor === "sim") return true;
    if (valor === "nao") return false;
  } catch {
    // localStorage bloqueado: fica no automático.
  }
  return null;
}

function videoDeSoftware(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") as WebGLRenderingContext | null;
    if (!gl) return true;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const placa = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    // Devolve o contexto na hora: o Chromium tem teto de contextos abertos.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return /swiftshader|basic render|llvmpipe|software/i.test(placa);
  } catch {
    return false;
  }
}

function maquinaFraca(): boolean {
  const nucleos = navigator.hardwareConcurrency || 0;
  const memoria = (navigator as Navigator & { deviceMemory?: number }).deviceMemory || 0;
  return (nucleos > 0 && nucleos <= 4) || (memoria > 0 && memoria <= 4) || videoDeSoftware();
}

let decidido: boolean | null = null;

/** A máquina está no modo leve? Decide na primeira chamada e guarda. */
export function modoLeve(): boolean {
  if (decidido === null) decidido = escolhaManual() ?? maquinaFraca();
  return decidido;
}

/** Põe a classe `leve` no `<html>`. Chamada uma vez, antes de a tela montar. */
export function aplicarModoLeve(): void {
  document.documentElement.classList.toggle("leve", modoLeve());
}
