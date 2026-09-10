/**
 * ===========================================================================
 * LANÇAR PEDIDO — a conferência antes de mandar para a calandra
 * ===========================================================================
 *
 * Entre marcar os trabalhos no Histórico e criar o pedido existe um passo, e
 * ele é o motivo desta tela existir: o servidor olha cada trabalho marcado e
 * responde uma coisa que ninguém tem como saber de cabeça — **se aquilo já foi
 * rodado antes**, isto é, se existe no histórico outra impressão do mesmo
 * cliente e tecido. Nem sempre é erro (reposição é legítima), mas é exatamente
 * o aviso que evita imprimir duas vezes o mesmo pedido.
 *
 * A comparação sai do NOME DO ARQUIVO, lido como "CLIENTE - TECIDO"
 * (`impressoras/services/matching.js`). É convenção da fábrica, não campo de
 * sistema — então o palpite erra de vez em quando, e o aviso é aviso, não
 * impedimento.
 *
 * A mesma consulta ainda devolve uma Ordem de Serviço sugerida. Ela é ignorada
 * aqui: a tela de OS saiu do sistema. O servidor continua respondendo o campo,
 * e ler ou não ler é decisão desta tela — não de uma mudança no servidor.
 *
 * Nada é gravado até alguém clicar em confirmar. A consulta é só consulta.
 */

import { useEffect, useState } from "react";
import { api } from "../api/cliente";
import { Icone } from "../casca/Icone";
import { dataBr, metros, metrosCurtos } from "../utils/formato";
import type { Registro } from "./tipos";

interface ConferenciaDoItem {
  recordId: string;
  client: string;
  fabric: string;
  alreadyRan: boolean;
  historyMatches: { id: string; date: string; time: string; machineName: string; printLength: number }[];
}

interface Props {
  itens: Registro[];
  aoFechar: () => void;
  /** Chamado depois de criar, com o pedido já gravado. */
  aoCriar: () => void;
}

export function LancarPedido({ itens, aoFechar, aoCriar }: Props) {
  const [conferencia, setConferencia] = useState<ConferenciaDoItem[] | null>(null);
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // A conferência é pedida uma vez, quando a caixa abre. Ela lê o histórico
  // inteiro no servidor, então não é coisa de refazer a cada tecla.
  useEffect(() => {
    let cancelado = false;
    setErro(null);

    api
      .post<{ items: ConferenciaDoItem[] }>("/impressoras/pedidos/preview", {
        items: itens.map((registro) => ({ id: registro.id, task: registro.task })),
      })
      .then((resposta) => {
        if (!cancelado) setConferencia(resposta.items);
      })
      .catch((e: unknown) => {
        if (!cancelado) setErro(e instanceof Error ? e.message : "Não consegui conferir os itens.");
      });

    return () => { cancelado = true; };
  }, [itens]);

  const confirmar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      await api.post("/impressoras/pedidos", {
        note: observacao.trim(),
        items: itens.map((registro) => ({
          id: registro.id,
          task: registro.task,
          machineId: registro.machineId,
          machineName: registro.machineName,
          printLength: registro.printLength,
          date: registro.date,
        })),
      });
      aoCriar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui criar o pedido.");
      setSalvando(false);
    }
  };

  const total = itens.reduce((soma, registro) => soma + Number(registro.printLength || 0), 0);
  const repetidos = (conferencia || []).filter((item) => item.alreadyRan).length;

  return (
    <div className="rounded-[10px] border border-[var(--accent-line)] bg-painel-suave px-3.5 py-3.5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <strong className="text-[0.92rem] text-tinta">
          Lançar pedido com {itens.length} trabalho(s)
        </strong>
        <span className="text-[0.8rem] text-tinta-fraca">{metrosCurtos(total)}</span>
        <button
          type="button"
          onClick={aoFechar}
          className="ml-auto rounded-[9px] border border-linha px-3 py-1.5 text-[0.78rem] text-tinta-fraca transition-colors hover:text-tinta"
        >
          Cancelar
        </button>
      </div>

      {!conferencia && !erro && (
        <p className="m-0 text-[0.82rem] text-tinta-fraca">Conferindo contra o histórico...</p>
      )}

      {erro && (
        <p className="m-0 flex items-center gap-2 text-[0.82rem] text-alerta">
          <Icone referencia="icones.svg#triangle-alert" className="size-4 shrink-0" />
          {erro}
        </p>
      )}

      {conferencia && (
        <>
          {repetidos > 0 && (
            <p className="mt-0 mb-3 flex items-start gap-2 rounded-[8px] border border-[var(--warn)] px-3 py-2 text-[0.8rem] text-atencao">
              <Icone referencia="icones.svg#triangle-alert" className="mt-0.5 size-4 shrink-0" />
              <span>
                {repetidos} {repetidos === 1 ? "trabalho já foi rodado antes" : "trabalhos já foram rodados antes"}.
                Reposição é normal; repetir por engano, não. Confira abaixo antes de confirmar.
              </span>
            </p>
          )}

          <ul className="m-0 grid list-none gap-2 p-0">
            {itens.map((registro) => {
              const item = conferencia.find((c) => c.recordId === registro.id);
              if (!item) return null;

              return (
                <li key={registro.id} className="rounded-[8px] border border-linha bg-painel px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                    <strong className="min-w-0 truncate text-[0.85rem] text-tinta" title={registro.task}>
                      {registro.task}
                    </strong>
                    <span className="font-mono text-[0.78rem] text-tinta-fraca">{metros(registro.printLength)}</span>
                    {item.alreadyRan && (
                      <span className="rounded-full border border-[var(--warn)] px-2 py-0.5 text-[0.68rem] text-atencao">
                        já rodado
                      </span>
                    )}
                  </div>

                  <p className="mt-0.5 mb-0 text-[0.72rem] text-tinta-apagada">
                    {item.client || "cliente não identificado"}
                    {item.fabric && ` · ${item.fabric}`}
                  </p>

                  {item.historyMatches.length > 0 && (
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-[0.72rem] text-tinta-apagada">
                        {item.historyMatches.length} impressão(ões) anterior(es)
                      </summary>
                      <ul className="mt-1 mb-0 grid list-none gap-0.5 p-0">
                        {item.historyMatches.map((anterior) => (
                          <li key={anterior.id} className="flex flex-wrap gap-x-2.5 text-[0.72rem] text-tinta-fraca">
                            <span className="font-mono text-tinta-apagada">
                              {dataBr(anterior.date)} {anterior.time}
                            </span>
                            <span>{anterior.machineName}</span>
                            <span className="font-mono">{metros(anterior.printLength)}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>

          <label className="mt-3 block">
            <span className="mb-1.5 block text-[0.75rem] text-tinta-fraca">Observação do pedido</span>
            <input
              type="text"
              value={observacao}
              onChange={(evento) => setObservacao(evento.target.value)}
              placeholder="opcional"
              className="w-full rounded-[9px] border border-linha bg-painel px-3 py-2 text-[0.85rem] text-tinta outline-none placeholder:text-tinta-apagada focus:border-[var(--accent-line)]"
            />
          </label>

          <button
            type="button"
            onClick={confirmar}
            disabled={salvando}
            className="mt-3 rounded-[9px] border border-ambar bg-ambar px-4 py-2 text-[0.85rem] font-semibold text-ambar-tinta transition-colors hover:bg-ambar-claro disabled:opacity-50"
          >
            {salvando ? "Criando..." : `Criar pedido com ${itens.length} trabalho(s)`}
          </button>
        </>
      )}
    </div>
  );
}
