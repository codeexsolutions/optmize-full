/**
 * ===========================================================================
 * OS PLANOS — buscados uma vez, lidos por quem precisar
 * ===========================================================================
 *
 * O catálogo vinha de um `fetch` dentro do `CriarConta`, disparado só quando
 * a pessoa clicava em "Criar conta" — e aí ela via "Buscando os planos…"
 * enquanto a ida ao Railway acontecia.
 *
 * Com o store, a tela de ENTRAR já pede os planos ao abrir. Quando a pessoa
 * chega ao cadastro, a lista já está aqui e aparece na hora. O cadastro ainda
 * pede de novo ao abrir, mas SEM ESVAZIAR a lista: o que mudou no painel
 * troca por baixo, e a tela nunca volta ao "Buscando…".
 *
 * `carregar()` pode ser chamado à vontade: enquanto uma busca está em curso,
 * a segunda chamada devolve a mesma promessa em vez de abrir outra.
 */

import { create } from "zustand";

export interface Plano {
  id: string;
  nome: string;
  descricao: string;
  precoCentavos: number;
  moeda: string;
  cobranca: "mensal" | "anual" | "creditos";
  vantagens: string[];
  acessos: number;
  /** A metragem do plano, em metros por período. `null` = sem teto. */
  metrosPorPeriodo: number | null;
  /** De quanto em quanto tempo ela volta a encher. */
  periodoDaCota: "diario" | "semanal" | "mensal";
  /** Dias de teste; `0` = sem teste. Quem decide é o catálogo, não a tela. */
  diasDeTeste: number;
}

interface EstadoDosPlanos {
  /**
   * `null` = nunca chegou resposta. `[]` = a busca falhou sem nada guardado
   * (sem internet) — a tela diz isso em vez de ficar esperando para sempre.
   */
  planos: Plano[] | null;
  carregar: () => Promise<void>;
}

let emCurso: Promise<void> | null = null;

export const usePlanos = create<EstadoDosPlanos>((set, get) => ({
  planos: null,
  carregar: () => {
    if (emCurso) return emCurso;
    emCurso = fetch("/api/sessao/planos")
      .then((r) => r.json())
      .then((dados: { planos?: Plano[] }) => {
        // Resposta sem lista não apaga uma lista boa que já estava aqui.
        if (Array.isArray(dados.planos)) set({ planos: dados.planos });
        else if (get().planos === null) set({ planos: [] });
      })
      .catch(() => {
        // Sem rede: fica o que já se sabia. Só marca a falha se não havia nada.
        if (get().planos === null) set({ planos: [] });
      })
      .finally(() => { emCurso = null; });
    return emCurso;
  },
}));
