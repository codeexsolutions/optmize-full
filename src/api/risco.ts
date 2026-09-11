/**
 * ===========================================================================
 * API DO RISCO — o PDF em tamanho real
 * ===========================================================================
 *
 * Uma conversa só, com `servidor/risco-pdf.js`: manda os contornos que a tela
 * Digitalizar achou, em centímetros, e recebe o PDF de volta.
 *
 * Estoura em vez de devolver `null`, ao contrário da memória do encaixe: aqui
 * a pessoa PEDIU um arquivo, e não receber é uma resposta que ela precisa ver.
 * É a mesma regra do PDF do encaixe (ver `api/encaixe.ts`).
 */

/** Um nó do contorno, com as alças da curva que entra e da que sai. */
export interface NoDoRisco {
  x: number;
  y: number;
  entrada: { x: number; y: number };
  saida: { x: number; y: number };
  canto?: boolean;
  /** O trecho deste nó até o seguinte é reta, e não curva. */
  retaDepois?: boolean;
}

export interface PecaDoRisco {
  /** O contorno fechado, em centímetros, relativo ao canto da peça. */
  nos: NoDoRisco[];
  /** Onde a peça está no conjunto, em centímetros. */
  emX: number;
  emY: number;
}

export const riscoApi = {
  /** O PDF do risco, em tamanho real, como blob pronto para gravar. */
  async pdf(nome: string, pecas: PecaDoRisco[]): Promise<Blob> {
    const resposta = await fetch("/api/risco/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, pecas }),
    });
    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => ({}));
      throw new Error(erro.error || "O servidor não conseguiu gerar o PDF.");
    }
    return resposta.blob();
  },
};
