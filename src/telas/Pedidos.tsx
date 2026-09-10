/**
 * ===========================================================================
 * PEDIDOS — a fila da calandra
 * ===========================================================================
 *
 * Um pedido é uma lista de trabalhos já impressos, na ordem em que vão passar
 * na calandra. Ele nasce no Histórico: marcam-se os trabalhos, confere-se o
 * aviso, e a lista sai impressa com um QR no rodapé.
 *
 * ---------------------------------------------------------------------------
 * QUEM FECHA O CICLO NÃO É ESTA TELA
 * ---------------------------------------------------------------------------
 *
 * O `calandraStatus` de cada item (pendente / ok / erro) não é marcado aqui: é
 * o aparelho da calandra que lê o QR da folha e manda o resultado
 * (`POST /pedidos/:id/items/:itemId/result`). Esta tela **mostra** o que ele
 * marcou. Por isso não existe botão de "marcar como ok": inventar um faria a
 * fila divergir do que aconteceu na máquina, que é justamente o que o QR
 * existe para evitar.
 *
 * O que se faz por aqui é o que o operador da calandra não pode fazer: mudar o
 * andamento do pedido e reimprimir a folha.
 *
 * O item de pedido ainda guarda um `osId` — a Ordem de Serviço que dava a
 * imagem de referência ao aparelho da calandra. A tela de OS saiu do sistema,
 * então não há mais como escolher uma, e o campo fica sempre vazio. O servidor
 * continua sabendo lidar com ele (ver `impressoras/routes/pedidos.js`), para o
 * dia em que a OS voltar não ser uma migração.
 *
 * ---------------------------------------------------------------------------
 * O CLIENTE E O TECIDO SAÍREM DO NOME DO ARQUIVO
 * ---------------------------------------------------------------------------
 *
 * Não são campos: são lidos de "CLIENTE - TECIDO.prt", que é como a fábrica
 * nomeia o arquivo (`impressoras/services/matching.js`). É o que permite
 * avisar "isso já foi rodado antes" e sugerir a OS certa sem ninguém digitar
 * nada. Também é o motivo de o palpite às vezes sair errado — daí a sugestão
 * de OS ser sugestão, e poder ser trocada item a item.
 */

import { useState } from "react";
import { api } from "../api/cliente";
import { useDados } from "../api/useDados";
import { Cartao } from "../casca/Cartao";
import { Icone } from "../casca/Icone";
import { dataBr, metros, metrosCurtos } from "../utils/formato";

type AndamentoDoPedido = "aberto" | "pausado" | "concluido";
type ResultadoDaCalandra = "pendente" | "ok" | "erro";

interface PedidoNaLista {
  id: string;
  createdAt: number;
  status: AndamentoDoPedido;
  note: string | null;
  itemCount: number;
  okCount: number;
  erroCount: number;
}

interface ItemDoPedido {
  id: string;
  pedidoId: string;
  position: number;
  recordId: string;
  clientName: string | null;
  fabric: string | null;
  task: string;
  machineId: string;
  machineName: string;
  printLength: number;
  date: string;
  osId: string | null;
  calandraStatus: ResultadoDaCalandra;
  calandraReason: string | null;
  calandraCustomReason: string | null;
  calandraAt: number | null;
}

interface PedidoCompleto extends Omit<PedidoNaLista, "itemCount" | "okCount" | "erroCount"> {
  items: ItemDoPedido[];
}

const ROTULO_DO_ANDAMENTO: Record<AndamentoDoPedido, string> = {
  aberto: "Em aberto",
  pausado: "Pausado",
  concluido: "Concluído",
};

export function Pedidos() {
  const lista = useDados<PedidoNaLista[]>(() => api.get<PedidoNaLista[]>("/impressoras/pedidos"));
  const [aberto, setAberto] = useState<string | null>(null);

  return (
    <>
      <Cartao
        titulo="Pedidos"
        icone="icones.svg#list-checks"
        apoio="A lista de produção na ordem da calandra. Monta-se no Histórico, marcando os trabalhos."
        preencher
      >
        {lista.carregando && <p className="m-0 text-[0.85rem] text-tinta-fraca">Carregando...</p>}

        {lista.erro && (
          <p className="m-0 flex items-center gap-2 text-[0.85rem] text-alerta">
            <Icone referencia="icones.svg#triangle-alert" className="size-4 shrink-0" />
            {lista.erro}
          </p>
        )}

        {lista.dados?.length === 0 && (
          <p className="m-0 text-[0.85rem] text-tinta-fraca">
            Nenhum pedido ainda. Vá em <strong className="text-tinta">Histórico</strong>, marque os
            trabalhos que vão junto e clique em <strong className="text-tinta">Lançar pedido</strong>.
          </p>
        )}

        {lista.dados && lista.dados.length > 0 && (
          <ul className="m-0 grid list-none gap-2 p-0">
            {lista.dados.map((pedido) => (
              <li key={pedido.id} className="overflow-hidden rounded-[10px] border border-linha bg-painel-suave">
                <button
                  type="button"
                  onClick={() => setAberto(aberto === pedido.id ? null : pedido.id)}
                  aria-expanded={aberto === pedido.id}
                  className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--surface-hover)]"
                >
                  <Icone
                    referencia="icones.svg#chevron-right"
                    className={`size-4 shrink-0 text-tinta-apagada transition-transform ${aberto === pedido.id ? "rotate-90" : ""}`}
                  />
                  <span className="min-w-0 flex-1">
                    <strong className="block text-[0.88rem] text-tinta">
                      {new Date(pedido.createdAt).toLocaleString("pt-BR")}
                    </strong>
                    {pedido.note && (
                      <small className="block truncate text-[0.72rem] text-tinta-apagada">{pedido.note}</small>
                    )}
                  </span>

                  <Andamento status={pedido.status} />
                  <ProgressoDaCalandra pedido={pedido} />
                </button>

                {aberto === pedido.id && (
                  <Detalhe id={pedido.id} aoMudar={lista.recarregar} />
                )}
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </>
  );
}

function Andamento({ status }: { status: AndamentoDoPedido }) {
  const cor = status === "concluido" ? "text-certo" : status === "pausado" ? "text-atencao" : "text-tinta-fraca";
  return <span className={`shrink-0 text-[0.75rem] font-semibold ${cor}`}>{ROTULO_DO_ANDAMENTO[status]}</span>;
}

/**
 * Quanto do pedido já passou na calandra.
 *
 * O número é o que importa e vem escrito; a barra é só o relance. Erro aparece
 * em separado, e não somado ao "feito": item que deu errado vai voltar, então
 * contá-lo como pronto mentiria sobre o que falta.
 */
function ProgressoDaCalandra({ pedido }: { pedido: PedidoNaLista }) {
  const feitos = pedido.okCount + pedido.erroCount;
  const parte = pedido.itemCount ? (feitos / pedido.itemCount) * 100 : 0;

  return (
    <span className="flex w-32 shrink-0 flex-col items-end gap-1">
      <span className="font-mono text-[0.75rem] text-tinta-fraca">
        {pedido.okCount}/{pedido.itemCount}
        {pedido.erroCount > 0 && <span className="ml-1.5 text-alerta">{pedido.erroCount} erro</span>}
      </span>
      <span className="h-1 w-full overflow-hidden rounded-full bg-[var(--border)]">
        <span className="block h-full rounded-full bg-certo" style={{ width: `${parte}%` }} />
      </span>
    </span>
  );
}

function Detalhe({ id, aoMudar }: { id: string; aoMudar: () => void }) {
  const pedido = useDados<PedidoCompleto>(() => api.get<PedidoCompleto>(`/impressoras/pedidos/${id}`), [id]);

  const [erro, setErro] = useState<string | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const trocarAndamento = async (status: AndamentoDoPedido) => {
    setErro(null);
    try {
      await api.patch(`/impressoras/pedidos/${id}/status`, { status });
      pedido.recarregar();
      aoMudar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui mudar o andamento.");
    }
  };

  const excluir = async () => {
    setErro(null);
    try {
      await api.apagar(`/impressoras/pedidos/${id}`);
      aoMudar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui excluir o pedido.");
    }
  };

  if (pedido.carregando) {
    return <p className="m-0 border-t border-linha px-3.5 py-3 text-[0.8rem] text-tinta-fraca">Carregando o pedido...</p>;
  }
  if (!pedido.dados) {
    return <p className="m-0 border-t border-linha px-3.5 py-3 text-[0.8rem] text-alerta">{pedido.erro}</p>;
  }

  const total = pedido.dados.items.reduce((soma, item) => soma + Number(item.printLength || 0), 0);

  return (
    <div className="border-t border-linha px-3.5 py-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[0.78rem] text-tinta-fraca">
          {pedido.dados.items.length} item(ns) — {metrosCurtos(total)}
        </span>

        <span className="ml-auto flex flex-wrap gap-1.5">
          {(["aberto", "pausado", "concluido"] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => trocarAndamento(status)}
              aria-pressed={pedido.dados!.status === status}
              className={`rounded-[9px] border px-3 py-1.5 text-[0.78rem] transition-colors ${
                pedido.dados!.status === status
                  ? "border-ambar bg-ambar text-ambar-tinta"
                  : "border-linha text-tinta-fraca hover:text-tinta"
              }`}
            >
              {ROTULO_DO_ANDAMENTO[status]}
            </button>
          ))}

          <button
            type="button"
            onClick={() => void reimprimir(pedido.dados!)}
            className="rounded-[9px] border border-linha px-3 py-1.5 text-[0.78rem] text-tinta-fraca transition-colors hover:text-tinta"
          >
            Reimprimir folha
          </button>
        </span>
      </div>

      <ul className="m-0 grid list-none gap-1.5 p-0">
        {pedido.dados.items.map((item) => (
          <li
            key={item.id}
            className="grid gap-1.5 rounded-[8px] border border-linha-suave px-2.5 py-2 [grid-template-columns:auto_1fr_auto] items-center"
          >
            <span className="font-mono text-[0.72rem] text-tinta-apagada">{item.position + 1}</span>

            <span className="min-w-0">
              <strong className="block truncate text-[0.82rem] text-tinta" title={item.task}>{item.task}</strong>
              <small className="block text-[0.7rem] text-tinta-apagada">
                {[item.clientName, item.fabric].filter(Boolean).join(" · ") || "cliente não identificado"}
                {" — "}{item.machineName} · {dataBr(item.date)}
              </small>
            </span>

            <span className="flex shrink-0 items-center gap-2.5">
              <span className="font-mono text-[0.78rem] text-tinta-fraca">{metros(item.printLength)}</span>
              <ResultadoNaCalandra item={item} />
            </span>
          </li>
        ))}
      </ul>

      {erro && <p className="mt-2.5 mb-0 text-[0.8rem] text-alerta">{erro}</p>}

      <div className="mt-3 flex gap-2">
        {confirmandoExclusao ? (
          <>
            <button
              type="button"
              onClick={excluir}
              className="rounded-[9px] border border-alerta px-3 py-1.5 text-[0.78rem] font-semibold text-alerta"
            >
              Excluir mesmo — o pedido some, os trabalhos ficam
            </button>
            <button
              type="button"
              onClick={() => setConfirmandoExclusao(false)}
              className="rounded-[9px] border border-linha px-3 py-1.5 text-[0.78rem] text-tinta-fraca"
            >
              Não
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmandoExclusao(true)}
            className="rounded-[9px] border border-linha px-3 py-1.5 text-[0.78rem] text-tinta-fraca transition-colors hover:text-alerta"
          >
            Excluir pedido
          </button>
        )}
      </div>
    </div>
  );
}

/** O que a calandra marcou neste item — e, quando deu errado, por quê. */
function ResultadoNaCalandra({ item }: { item: ItemDoPedido }) {
  if (item.calandraStatus === "ok") {
    return <span className="text-[0.73rem] font-semibold text-certo">passou</span>;
  }
  if (item.calandraStatus === "erro") {
    const motivo = item.calandraCustomReason || item.calandraReason;
    return (
      <span className="text-[0.73rem] font-semibold text-alerta" title={motivo || undefined}>
        erro{motivo ? `: ${motivo}` : ""}
      </span>
    );
  }
  return <span className="text-[0.73rem] text-tinta-apagada">na fila</span>;
}

/**
 * Reimprime a folha do pedido, com o QR que o aparelho da calandra lê.
 *
 * A aba é aberta ANTES do `await`: navegador só deixa `window.open` passar
 * dentro do clique. Depois da resposta, o bloqueador de pop-up mata a janela e
 * não acontece nada — sem erro nenhum na tela.
 */
async function reimprimir(pedido: PedidoCompleto) {
  const aba = window.open("", "_blank");

  const resposta = await fetch("/api/impressoras/print-list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "production",
      pedidoId: pedido.id,
      items: pedido.items.map((item) => ({
        id: item.recordId,
        task: item.task,
        machineId: item.machineId,
        machineName: item.machineName,
        printLength: item.printLength,
        previewRef: "",
      })),
    }),
  });

  const html = await resposta.text();
  if (!aba) return;
  aba.document.open();
  aba.document.write(html);
  aba.document.close();
}
