/**
 * ===========================================================================
 * PONTO — quem bateu, e quando
 * ===========================================================================
 *
 * O terminal de chão de fábrica registra as batidas; esta tela é onde alguém
 * OLHA para elas. São trabalhos diferentes, e o que esta tela precisa fazer bem
 * é um só: deixar ver, de relance, o que está faltando.
 *
 * ---------------------------------------------------------------------------
 * POR QUE GRADE, E NÃO LISTA
 * ---------------------------------------------------------------------------
 *
 * O banco guarda uma linha por batida, que é o jeito certo de guardar (ver
 * `servidor/ponto-api.js`). Mostrar assim seria fiel e inútil: uma coluna de
 * horários em ordem cronológica não responde a pergunta que se faz ao abrir
 * esta tela, que é "quem está com o dia incompleto?".
 *
 * Em grade — uma linha por pessoa, uma coluna por batida — o buraco aparece
 * sozinho. É ele que se procura, e ele tem de ser a coisa mais visível da tela.
 *
 * ---------------------------------------------------------------------------
 * A QUINTA BATIDA
 * ---------------------------------------------------------------------------
 *
 * O dia comum tem quatro. Quem sai ao banco no meio da tarde tem seis, e o
 * servidor marca as extras como `extra` porque não tem como adivinhar o que
 * são. Elas não cabem nas quatro colunas, e escondê-las seria mentir sobre o
 * dia — então aparecem numa linha própria, abaixo, com o horário de cada uma.
 */

import { useState } from "react";
import { api } from "../api/cliente";
import { useDados } from "../api/useDados";
import { Cartao } from "../casca/Cartao";
import { Icone } from "../casca/Icone";
import { dataBr, hojeIso, somarDias } from "../utils/formato";

/** As quatro do dia comum, na ordem em que acontecem. */
const COLUNAS = [
  { tipo: "entrada", rotulo: "Entrada" },
  { tipo: "almoco_saida", rotulo: "Saída almoço" },
  { tipo: "almoco_volta", rotulo: "Volta almoço" },
  { tipo: "saida", rotulo: "Saída" },
] as const;

interface Batida {
  id: number;
  momento: string;
  tipo: string;
  origem: string;
  confianca: number | null;
  observacao: string | null;
}

interface DiaDeAlguem {
  dia: string;
  funcionario: { id: number; nome: string; apelido: string | null; matricula: string | null };
  batidas: Batida[];
}

interface Resposta {
  de: string;
  ate: string;
  dias: DiaDeAlguem[];
}

/** A hora de uma batida, em HH:MM e no fuso de quem está olhando. */
function hora(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function Ponto() {
  /*
   * O período começa em HOJE, e não na semana. Quem abre esta tela quase sempre
   * quer saber do dia que está correndo -- a semana inteira é a exceção, e para
   * ela existem os atalhos.
   */
  const [de, setDe] = useState(hojeIso());
  const [ate, setAte] = useState(hojeIso());

  const registros = useDados<Resposta>(
    () => api.get<Resposta>(`/ponto/batidas?de=${de}&ate=${ate}`),
    [de, ate],
  );

  const dias = registros.dados?.dias ?? [];

  /* Os dias vêm em ordem; agrupa-se para mostrar um bloco por data. */
  const porData = new Map<string, DiaDeAlguem[]>();
  for (const d of dias) {
    if (!porData.has(d.dia)) porData.set(d.dia, []);
    porData.get(d.dia)!.push(d);
  }

  const atalho = (rotulo: string, novoDe: string, novoAte: string) => (
    <button
      type="button"
      onClick={() => { setDe(novoDe); setAte(novoAte); }}
      className={[
        "rounded-lg border px-3 py-1.5 text-sm transition-colors",
        de === novoDe && ate === novoAte
          ? "border-ambar bg-ambar text-ambar-tinta"
          : "border-linha bg-painel-suave text-tinta-fraca hover:text-tinta",
      ].join(" ")}
    >
      {rotulo}
    </button>
  );

  return (
    <>
      <Cartao
        titulo="Período"
        apoio="O que mostrar. Comece pelo dia de hoje; a semana é a exceção."
        icone="icones.svg#calendar"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-tinta-apagada">De</span>
            <input
              type="date"
              value={de}
              max={ate}
              onChange={(e) => setDe(e.target.value)}
              className="rounded-lg border border-linha bg-painel-suave px-3 py-2 text-tinta"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-tinta-apagada">Até</span>
            <input
              type="date"
              value={ate}
              min={de}
              onChange={(e) => setAte(e.target.value)}
              className="rounded-lg border border-linha bg-painel-suave px-3 py-2 text-tinta"
            />
          </label>

          <div className="flex flex-wrap gap-2 pb-0.5">
            {atalho("Hoje", hojeIso(), hojeIso())}
            {atalho("Ontem", somarDias(hojeIso(), -1), somarDias(hojeIso(), -1))}
            {atalho("7 dias", somarDias(hojeIso(), -6), hojeIso())}
            {atalho("30 dias", somarDias(hojeIso(), -29), hojeIso())}
          </div>
        </div>
      </Cartao>

      <Cartao
        titulo="Batidas"
        apoio="Uma linha por pessoa. O que está faltando aparece como traço."
        icone="icones.svg#clock"
        preencher
      >
        {registros.carregando && (
          <p className="py-8 text-center text-tinta-fraca">Carregando…</p>
        )}

        {registros.erro && (
          <p className="py-8 text-center text-alerta">{registros.erro}</p>
        )}

        {!registros.carregando && !registros.erro && dias.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-tinta-fraca">Ninguém bateu ponto neste período.</p>
            <p className="mt-1 text-sm text-tinta-apagada">
              As batidas chegam do terminal de chão de fábrica.
            </p>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {[...porData.entries()].map(([data, pessoas]) => (
            <section key={data} className="mb-6 last:mb-0">
              <h3 className="mb-2 text-sm font-medium text-tinta-fraca">{dataBr(data)}</h3>

              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-linha text-left text-xs text-tinta-apagada">
                    <th className="pb-2 pr-3 font-medium">Quem</th>
                    {COLUNAS.map((c) => (
                      <th key={c.tipo} className="pb-2 pr-3 font-medium">{c.rotulo}</th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {pessoas.map((p) => {
                    /*
                     * Cada coluna pega a PRIMEIRA batida do tipo dela. Se
                     * alguém bateu duas vezes a entrada -- acontece, o dedo
                     * escorrega --, a segunda vira `extra` no servidor e
                     * aparece na linha de baixo, em vez de sumir.
                     */
                    const extras = p.batidas.filter((b) => b.tipo === "extra");
                    const incompleto = COLUNAS.some(
                      (c) => !p.batidas.some((b) => b.tipo === c.tipo),
                    );

                    return (
                      <tr key={p.funcionario.id} className="border-b border-linha-suave last:border-0">
                        <td className="py-2 pr-3">
                          <span className="text-tinta">
                            {p.funcionario.apelido || p.funcionario.nome}
                          </span>
                          {incompleto && (
                            <span
                              className="ml-2 align-middle text-atencao"
                              title="Dia incompleto"
                            >
                              <Icone referencia="icones.svg#triangle-alert" className="inline size-4" />
                            </span>
                          )}
                          {extras.length > 0 && (
                            <span className="ml-2 text-xs text-tinta-apagada">
                              + {extras.map((b) => hora(b.momento)).join("  ")}
                            </span>
                          )}
                        </td>

                        {COLUNAS.map((c) => {
                          const b = p.batidas.find((x) => x.tipo === c.tipo);
                          return (
                            <td key={c.tipo} className="py-2 pr-3">
                              {b ? (
                                <span
                                  className="tabular-nums text-tinta"
                                  title={b.origem === "manual" ? "Lançada à mão" : "Veio do terminal"}
                                >
                                  {hora(b.momento)}
                                  {b.origem === "manual" && (
                                    <span className="ml-1 text-xs text-tinta-apagada">✎</span>
                                  )}
                                </span>
                              ) : (
                                /* O buraco é o que se procura: ele fica visível. */
                                <span className="text-atencao">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </Cartao>
    </>
  );
}
