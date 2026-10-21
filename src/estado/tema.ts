/**
 * ===========================================================================
 * O TEMA — escuro, claro ou o do sistema, como a Aparência do Flow
 * ===========================================================================
 *
 * A escolha fica guardada NESTA máquina (localStorage): o computador do corte,
 * perto da janela, pode ficar claro, e o da arte, escuro, com a mesma conta.
 * "sistema" segue o Windows e muda junto com ele.
 *
 * O destaque vem junto com o tema: laranja no escuro, azul (o oposto do
 * laranja) no claro. A tira CMYK da barra é de todos — ver `.menu-tira`.
 *
 * Quem pinta é o CSS: o `<html>` ganha `data-tema`, e `estilo/tokens.css`
 * troca os tokens pelo atributo. Nenhuma tela precisa saber o que está
 * valendo — todas leem os mesmos tokens.
 */

import { create } from "zustand";

export type ModoDoTema = "escuro" | "claro" | "sistema";

const CHAVE = "optmize-tema";
const consultaEscuro = () => window.matchMedia("(prefers-color-scheme: dark)");

function ler(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null; // localStorage bloqueado: fica no padrão.
  }
}

function gravar(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // Sem localStorage a escolha vale até fechar o programa.
  }
}

function lido(): ModoDoTema {
  const valor = ler(CHAVE);
  if (valor === "claro" || valor === "escuro" || valor === "sistema") return valor;
  // "impressao" foi tema por algumas horas em 2026-10-21: era claro.
  if (valor === "impressao") return "claro";
  // O Optmize sempre foi escuro: quem nunca escolheu continua como estava.
  return "escuro";
}

function pintar(modo: ModoDoTema): void {
  const efetivo = modo === "sistema" ? (consultaEscuro().matches ? "escuro" : "claro") : modo;
  document.documentElement.dataset.tema = efetivo;
  document.documentElement.style.colorScheme = efetivo === "escuro" ? "dark" : "light";
  // Quem desenha em canvas (a mesa do Encaixe) redesenha com as cores novas.
  window.dispatchEvent(new Event("optmize:tema"));
}

interface EstadoDoTema {
  modo: ModoDoTema;
  /** `origem` é o ponto do clique: dali o tema novo se abre em círculo. */
  escolher: (modo: ModoDoTema, origem?: { x: number; y: number }) => void;
}

/*
 * A TROCA COM O CÍRCULO, como no Flow (`shared/theme/transition.ts`): o tema
 * novo se abre em círculo a partir do clique, por cima do antigo. Sem a API
 * de transição de vista, no modo leve (é uma captura da tela inteira, pesada
 * sem placa de vídeo) ou com menos movimento pedido, troca direto.
 */
function trocarComCirculo(trocar: () => void, origem?: { x: number; y: number }) {
  const documento = document as Document & { startViewTransition?: (feito: () => void) => { ready: Promise<void> } };
  const semEfeito =
    !origem ||
    !documento.startViewTransition ||
    document.documentElement.classList.contains("leve") ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (semEfeito) return trocar();

  const { x, y } = origem;
  const raio = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transicao = documento.startViewTransition!(trocar);
  transicao.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${raio}px at ${x}px ${y}px)`] },
      { duration: 550, easing: "cubic-bezier(0.65, 0, 0.35, 1)", pseudoElement: "::view-transition-new(root)" },
    );
  });
}

export const useTema = create<EstadoDoTema>((set) => ({
  modo: lido(),
  escolher: (modo, origem) => {
    gravar(CHAVE, modo);
    trocarComCirculo(() => {
      pintar(modo);
      set({ modo });
    }, origem);
  },
}));

/** Pinta o tema guardado. Chamada uma vez, antes de a tela montar. */
export function aplicarTema(): void {
  const { modo } = useTema.getState();
  gravar(CHAVE, modo); // troca o "impressao" de antes pelo claro
  pintar(modo);
  // No modo "sistema", acompanha o Windows quando ele troca.
  consultaEscuro().addEventListener("change", () => {
    if (useTema.getState().modo === "sistema") pintar("sistema");
  });
}
