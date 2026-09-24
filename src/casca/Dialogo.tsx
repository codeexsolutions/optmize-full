/**
 * ===========================================================================
 * DIÁLOGO — avisar, perguntar sim/não e pedir um texto
 * ===========================================================================
 *
 * Substitui `alert`, `confirm` e `prompt` do navegador. Três portas, todas
 * assíncronas, então quem chama escreve `await` e lê a resposta na linha
 * seguinte:
 *
 *   `avisar(texto)`      avisa e espera o "Entendi";
 *   `confirmar(texto)`   pergunta sim/não e devolve `true`/`false`;
 *   `perguntar({...})`   pede um texto e devolve o que foi escrito, ou `null`.
 *
 * QUEM DESENHA É O ALERTA (`Alerta.tsx`), no desenho do CodeEx Flow. Este
 * arquivo ficou como a porta de sempre para as telas que já perguntavam por
 * aqui — elas não mudaram uma linha, e passaram a abrir a caixa nova.
 *
 * As caixas nativas do navegador ficam de fora por um motivo além do visual:
 * elas TRAVAM A PÁGINA INTEIRA enquanto estão abertas, e o Encaixe passa
 * minutos calculando em segundo plano.
 */

import { createContext, useContext, type ReactNode } from "react";

import { alerta } from "./Alerta";

interface Pergunta {
  titulo?: string;
  /** A linha acima do título, em versalete. */
  kicker?: string;
  texto?: string;
  /** O que vem escrito no campo quando ele abre. */
  valor?: string;
  exemplo?: string;
  confirmar?: string;
  cancelavel?: boolean;
}

interface Aviso {
  titulo?: string;
  kicker?: string;
  perigoso?: boolean;
}

interface Confirmacao extends Aviso {
  confirmar?: string;
}

export interface Dialogo {
  avisar(texto: string, opcoes?: Aviso): Promise<void>;
  confirmar(texto: string, opcoes?: Confirmacao): Promise<boolean>;
  perguntar(opcoes?: Pergunta): Promise<string | null>;
}

const dialogo: Dialogo = {
  async avisar(texto, opcoes = {}) {
    await alerta.mostrar({
      tipo: opcoes.perigoso ? "erro" : "aviso",
      titulo: opcoes.titulo || "Atenção",
      kicker: opcoes.kicker,
      texto,
      confirmar: "Entendi",
    });
  },

  async confirmar(texto, opcoes = {}) {
    // Perigoso por padrão: quem chama `confirmar` está prestes a fazer algo
    // que não tem volta. Quem não estiver diz `perigoso: false`.
    const perigoso = opcoes.perigoso !== false;
    const resposta = await alerta.mostrar({
      tipo: perigoso ? "aviso" : "pergunta",
      titulo: opcoes.titulo || "Confirmar ação",
      kicker: opcoes.kicker,
      texto,
      confirmar: opcoes.confirmar || "Confirmar",
      cancelavel: true,
      perigoso,
    });
    return resposta.confirmado;
  },

  async perguntar(opcoes = {}) {
    const resposta = await alerta.mostrar({
      tipo: "pergunta",
      titulo: opcoes.titulo || "Digite",
      kicker: opcoes.kicker,
      texto: opcoes.texto,
      confirmar: opcoes.confirmar || "Confirmar",
      cancelavel: opcoes.cancelavel !== false,
      campo: { valor: opcoes.valor, exemplo: opcoes.exemplo },
    });
    return resposta.confirmado && resposta.valor ? resposta.valor : null;
  },
};

const Contexto = createContext<Dialogo | null>(null);

/**
 * Sem provedor isto estoura, e é o certo: uma tela que pergunta e recebe
 * `null` calado tomaria a resposta errada por resposta da pessoa — apagaria
 * sem confirmar, ou deixaria de apagar sem dizer por quê.
 */
export function useDialogo(): Dialogo {
  const atual = useContext(Contexto);
  if (!atual) throw new Error("Falta o <ProvedorDeDialogo> em volta desta tela.");
  return atual;
}

export function ProvedorDeDialogo({ children }: { children: ReactNode }) {
  return <Contexto.Provider value={dialogo}>{children}</Contexto.Provider>;
}
