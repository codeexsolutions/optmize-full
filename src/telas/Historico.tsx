/**
 * ===========================================================================
 * HISTÓRICO — os trabalhos que saíram das máquinas
 * ===========================================================================
 *
 * Dois modos sobre exatamente os mesmos dados e os mesmos filtros:
 *
 * - **Lista** — a tabela, para conferir e somar.
 * - **Produção** — os cartões com o preview da arte, para reconhecer o
 *   trabalho pelo desenho quando o nome do arquivo não diz nada.
 *
 * A seleção é a mesma nos dois: dá para marcar no modo Produção, olhando a
 * arte, e passar para a Lista para conferir a metragem sem perder o que já
 * tinha marcado. Foi por isso que a seleção mora aqui em cima e não dentro de
 * cada modo.
 *
 * A tela lê apenas o banco local (ver `impressoras-api.js`), nunca a
 * impressora. Quem conversa com as máquinas são os leitores ao vivo do
 * servidor; quando eles gravam algo novo, chega um evento e a lista se
 * atualiza sozinha — sem ninguém apertar nada.
 */

import { useMemo, useState } from "react";
import { api } from "../api/cliente";
import { useDados } from "../api/useDados";
import { Cartao } from "../casca/Cartao";
import { Icone } from "../casca/Icone";
import { useRecarregarComEventos } from "../impressoras/socket";
import { LancarPedido } from "../impressoras/LancarPedido";
import { dataBr, duracao, hojeIso, metros, metrosCurtos, somarDias, tinta } from "../impressoras/formato";
import type { RespostaDeHistorico, Registro } from "../impressoras/tipos";

type Modo = "lista" | "producao";

/** O último modo escolhido fica no navegador: quem usa a Produção quase sempre volta nela. */
const CHAVE_DO_MODO = "optimize:impressoras:modo";

function lerModoGuardado(): Modo {
  try {
    return localStorage.getItem(CHAVE_DO_MODO) === "producao" ? "producao" : "lista";
  } catch {
    // Janela anônima ou site com armazenamento bloqueado. Não é erro: só não
    // lembra da preferência.
    return "lista";
  }
}

export function Historico() {
  const [inicio, setInicio] = useState(() => somarDias(hojeIso(), -6));
  const [fim, setFim] = useState(hojeIso);
  const [maquinaId, setMaquinaId] = useState("all");
  const [busca, setBusca] = useState("");
  const [modo, setModoBruto] = useState<Modo>(lerModoGuardado);
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set());
  const [lancando, setLancando] = useState(false);
  const [pedidoCriado, setPedidoCriado] = useState(false);

  const setModo = (novo: Modo) => {
    setModoBruto(novo);
    try { localStorage.setItem(CHAVE_DO_MODO, novo); } catch { /* ver lerModoGuardado */ }
  };

  const { dados, carregando, erro, recarregar } = useDados<RespostaDeHistorico>(
    () => api.get<RespostaDeHistorico>(
      `/impressoras/history?start=${inicio}&end=${fim}&machine=${encodeURIComponent(maquinaId)}`,
    ),
    [inicio, fim, maquinaId],
  );

  // Trabalho novo, cancelamento descoberto depois, importação: tudo que mexe no
  // histórico chega por evento.
  useRecarregarComEventos(["new-print", "history-updated"], recarregar);

  // A busca é local de propósito: o intervalo já veio inteiro do servidor, e
  // filtrar 300 linhas no navegador é instantâneo. Uma ida ao servidor a cada
  // tecla digitada seria pior em tudo.
  const registros = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = dados?.records || [];
    return termo ? lista.filter((r) => r.task.toLowerCase().includes(termo)) : lista;
  }, [dados, busca]);

  const selecionados = useMemo(
    () => registros.filter((r) => marcados.has(r.id)),
    [registros, marcados],
  );

  const alternar = (id: string) => {
    setMarcados((antes) => {
      const proximo = new Set(antes);
      if (proximo.has(id)) proximo.delete(id); else proximo.add(id);
      return proximo;
    });
  };

  const metragemMarcada = selecionados.reduce((soma, r) => soma + Number(r.printLength || 0), 0);

  return (
    <>
      <Cartao
        titulo="Período"
        icone="icones.svg#calendar"
        apoio="Escolha o intervalo e a máquina. O resultado sai do banco local, não da impressora."
        acao={
          /*
           * O relatório sai sempre dos 30 dias que terminam na data "Até" — é
           * assim que o servidor o monta, e forçá-lo a seguir o intervalo da
           * tela seria mudar o documento por causa de um filtro de consulta.
           * O texto do botão diz isso, para ninguém pedir um mês e receber
           * outro.
           */
          <a
            href={`/api/impressoras/report-production.pdf?end=${fim}&machine=${encodeURIComponent(maquinaId)}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-[9px] border border-linha bg-painel-suave px-3.5 py-2 text-[0.82rem] font-semibold text-tinta-fraca no-underline transition-colors hover:border-[var(--accent-line)] hover:text-tinta"
          >
            <Icone referencia="icones.svg#file-text" className="size-4" />
            Relatório de 30 dias (PDF)
          </a>
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          <Campo rotulo="De">
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={ESTILO_CAMPO} />
          </Campo>
          <Campo rotulo="Até">
            <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className={ESTILO_CAMPO} />
          </Campo>
          <Campo rotulo="Máquina">
            <select value={maquinaId} onChange={(e) => setMaquinaId(e.target.value)} className={ESTILO_CAMPO}>
              <option value="all">Todas</option>
              {(dados?.machines || []).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Nome do trabalho">
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="parte do nome"
              className={ESTILO_CAMPO}
            />
          </Campo>

          <div className="ml-auto flex gap-1 rounded-[9px] border border-linha bg-painel-suave p-1">
            <BotaoDeModo atual={modo} valor="lista" aoEscolher={setModo} icone="icones.svg#list" rotulo="Lista" />
            <BotaoDeModo atual={modo} valor="producao" aoEscolher={setModo} icone="icones.svg#image" rotulo="Produção" />
          </div>
        </div>

        {dados && (
          <div className="mt-4 grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
            <Indicador rotulo="Trabalhos" valor={String(dados.summary.jobs)} />
            <Indicador rotulo="Concluídos" valor={String(dados.summary.completed)} />
            <Indicador rotulo="Cancelados" valor={String(dados.summary.cancelled)} />
            <Indicador rotulo="Metragem" valor={metrosCurtos(dados.summary.printLength)} destaque />
            <Indicador rotulo="Tempo" valor={duracao(dados.summary.timeSeconds)} />
            <Indicador rotulo="Tinta" valor={tinta(dados.summary.inkMl)} />
          </div>
        )}
      </Cartao>

      {selecionados.length > 0 && (
        <Cartao
          titulo={`${selecionados.length} trabalho(s) marcado(s)`}
          icone="icones.svg#check"
          apoio={`${metros(metragemMarcada)} no total. As duas folhas saem dos mesmos itens.`}
          acao={
            <button
              type="button"
              onClick={() => setMarcados(new Set())}
              className="rounded-[9px] border border-linha px-3 py-1.5 text-[0.78rem] text-tinta-fraca transition-colors hover:text-tinta"
            >
              Limpar
            </button>
          }
        >
          <div className="flex flex-wrap gap-2">
            {/*
              Lançar pedido vem primeiro porque é o caminho completo: cria a
              fila da calandra E imprime a folha com o QR que o aparelho de lá
              lê. Os dois botões de imprimir continuam, para quem só quer o
              papel sem abrir pedido nenhum.
            */}
            <button
              type="button"
              onClick={() => { setPedidoCriado(false); setLancando((antes) => !antes); }}
              className="flex items-center gap-2 rounded-[9px] border border-ambar bg-ambar px-4 py-2 text-[0.85rem] font-semibold text-ambar-tinta transition-colors hover:bg-ambar-claro"
            >
              <Icone referencia="icones.svg#list-checks" className="size-4" />
              {lancando ? "Fechar" : "Lançar pedido"}
            </button>
            <BotaoDeImpressao itens={selecionados} modo="production" rotulo="Imprimir produção" icone="icones.svg#image" />
            <BotaoDeImpressao itens={selecionados} modo="list" rotulo="Imprimir lista" icone="icones.svg#list" />
          </div>

          {pedidoCriado && (
            <p className="mt-3 mb-0 flex items-center gap-2 text-[0.82rem] text-certo">
              <Icone referencia="icones.svg#check" className="size-4 shrink-0" />
              Pedido criado. Ele está na tela de Pedidos, e a folha com o QR sai por lá.
            </p>
          )}

          {lancando && (
            <div className="mt-3">
              <LancarPedido
                itens={selecionados}
                aoFechar={() => setLancando(false)}
                aoCriar={() => {
                  setLancando(false);
                  setPedidoCriado(true);
                  // A seleção é limpa: deixá-la marcada convida a lançar o
                  // mesmo pedido duas vezes com um clique de distância.
                  setMarcados(new Set());
                }}
              />
            </div>
          )}
        </Cartao>
      )}

      <Cartao
        titulo={modo === "lista" ? "Trabalhos" : "Produção"}
        icone="icones.svg#printer"
        apoio={`${registros.length} de ${dados?.records.length ?? 0} no período.`}
      >
        {carregando && <p className="m-0 text-[0.85rem] text-tinta-fraca">Carregando o histórico...</p>}
        {erro && (
          <p className="m-0 flex items-center gap-2 text-[0.85rem] text-alerta">
            <Icone referencia="icones.svg#triangle-alert" className="size-4 shrink-0" />
            {erro}
          </p>
        )}
        {dados && registros.length === 0 && (
          <p className="m-0 text-[0.85rem] text-tinta-fraca">
            {dados.machines.length === 0
              ? "Nenhuma impressora cadastrada ainda. Vá em Máquinas e clique em Procurar máquinas."
              : "Nenhum trabalho nesse período."}
          </p>
        )}

        {registros.length > 0 && (
          modo === "lista"
            ? <Tabela registros={registros} marcados={marcados} aoAlternar={alternar} />
            : <Cartoes registros={registros} marcados={marcados} aoAlternar={alternar} />
        )}
      </Cartao>
    </>
  );
}

const ESTILO_CAMPO =
  "rounded-[9px] border border-linha bg-painel-suave px-3 py-2 text-[0.85rem] text-tinta outline-none placeholder:text-tinta-apagada focus:border-[var(--accent-line)]";

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[0.75rem] text-tinta-fraca">{rotulo}</span>
      {children}
    </label>
  );
}

function BotaoDeModo({ atual, valor, aoEscolher, icone, rotulo }: {
  atual: Modo; valor: Modo; aoEscolher: (m: Modo) => void; icone: string; rotulo: string;
}) {
  const ligado = atual === valor;
  return (
    <button
      type="button"
      onClick={() => aoEscolher(valor)}
      aria-pressed={ligado}
      className={`flex items-center gap-2 rounded-[7px] px-3 py-1.5 text-[0.8rem] font-semibold transition-colors ${
        ligado ? "bg-ambar text-ambar-tinta" : "text-tinta-fraca hover:text-tinta"
      }`}
    >
      <Icone referencia={icone} className="size-4" />
      {rotulo}
    </button>
  );
}

function Indicador({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="rounded-[10px] border border-linha bg-painel-suave px-3 py-2.5">
      <span className="block text-[0.72rem] text-tinta-apagada">{rotulo}</span>
      <strong className={`block font-mono text-[1.05rem] ${destaque ? "text-ambar" : "text-tinta"}`}>{valor}</strong>
    </div>
  );
}

function BotaoDeImpressao({ itens, modo, rotulo, icone }: {
  itens: Registro[]; modo: "list" | "production"; rotulo: string; icone: string;
}) {
  return (
    <button
      type="button"
      onClick={() => void abrirFolha(itens, modo)}
      className="flex items-center gap-2 rounded-[9px] border border-linha bg-painel-suave px-4 py-2 text-[0.85rem] font-semibold text-tinta transition-colors hover:border-[var(--accent-line)]"
    >
      <Icone referencia={icone} className="size-4" />
      {rotulo}
    </button>
  );
}

/**
 * Pede a folha ao servidor e abre numa aba.
 *
 * A aba é aberta ANTES do `await`: navegador só deixa `window.open` passar
 * dentro do clique. Abrindo depois da resposta, o bloqueador de pop-up mata a
 * janela e não acontece nada — sem erro nenhum na tela.
 */
async function abrirFolha(itens: Registro[], mode: "list" | "production") {
  const aba = window.open("", "_blank");

  const resposta = await fetch("/api/impressoras/print-list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode,
      items: itens.map((r) => ({
        id: r.id,
        task: r.task,
        machineId: r.machineId,
        machineName: r.machineName,
        printLength: r.printLength,
        previewRef: r.previewRef,
      })),
    }),
  });

  const html = await resposta.text();
  if (!aba) return;
  aba.document.open();
  aba.document.write(html);
  aba.document.close();
}

function Tabela({ registros, marcados, aoAlternar }: {
  registros: Registro[]; marcados: Set<string>; aoAlternar: (id: string) => void;
}) {
  return (
    // Tabela larga rola dentro da própria caixa: sem isto a página inteira
    // ganha barra horizontal no celular.
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full border-collapse text-[0.82rem]">
        <thead>
          <tr className="text-left text-tinta-apagada">
            <th className="w-9 px-2 py-2 font-medium" />
            <th className="px-2 py-2 font-medium">Data</th>
            <th className="px-2 py-2 font-medium">Máquina</th>
            <th className="px-2 py-2 font-medium">Trabalho</th>
            <th className="px-2 py-2 text-right font-medium">Metragem</th>
            <th className="px-2 py-2 text-right font-medium">Tempo</th>
            <th className="px-2 py-2 text-right font-medium">Tinta</th>
            <th className="px-2 py-2 font-medium">Situação</th>
          </tr>
        </thead>
        <tbody>
          {registros.map((r) => (
            <tr key={r.id} className="border-t border-linha-suave align-middle">
              <td className="px-2 py-2">
                <input
                  type="checkbox"
                  checked={marcados.has(r.id)}
                  onChange={() => aoAlternar(r.id)}
                  aria-label={`Marcar ${r.task}`}
                  className="size-4 accent-[var(--accent)]"
                />
              </td>
              <td className="whitespace-nowrap px-2 py-2 font-mono text-[0.76rem] text-tinta-fraca">
                {dataBr(r.date)} {r.time}
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-tinta-fraca">{r.machineName}</td>
              <td className="max-w-[320px] truncate px-2 py-2 text-tinta" title={r.task}>{r.task}</td>
              <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-tinta">
                {metros(r.printLength)}
                {/* Metragem deduzida não é metragem medida, e a diferença importa na hora de cobrar. */}
                {r.metricEstimated && <span className="ml-1 text-atencao" title="Metragem deduzida, não medida">~</span>}
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-right text-tinta-fraca">{duracao(r.timeSeconds)}</td>
              <td className="whitespace-nowrap px-2 py-2 text-right text-tinta-fraca">
                {tinta(r.inkMl)}
                {r.inkExperimental && r.inkMl > 0 && (
                  <span className="ml-1 text-tinta-apagada" title="Consumo ainda não conferido contra a tela da máquina">?</span>
                )}
              </td>
              <td className="whitespace-nowrap px-2 py-2"><Situacao registro={r} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cartoes({ registros, marcados, aoAlternar }: {
  registros: Registro[]; marcados: Set<string>; aoAlternar: (id: string) => void;
}) {
  return (
    <ul className="m-0 grid list-none gap-3 p-0 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
      {registros.map((r) => {
        const marcado = marcados.has(r.id);
        return (
          <li
            key={r.id}
            className={`overflow-hidden rounded-xl border bg-painel-suave transition-colors ${
              marcado ? "border-ambar" : "border-linha"
            }`}
          >
            <button
              type="button"
              onClick={() => aoAlternar(r.id)}
              aria-pressed={marcado}
              className="block w-full cursor-pointer border-0 bg-transparent p-0 text-left"
            >
              <Preview registro={r} />
              <span className="block px-3 py-2.5">
                <strong className="block truncate text-[0.85rem] text-tinta" title={r.task}>{r.task}</strong>
                <span className="mt-0.5 block text-[0.73rem] text-tinta-apagada">
                  {r.machineName} — {dataBr(r.date)} {r.time}
                </span>
                <span className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="font-mono text-[0.85rem] text-ambar">{metros(r.printLength)}</span>
                  <Situacao registro={r} />
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * O preview da arte.
 *
 * Nasce escondido e aparece no `onLoad`: nem todo trabalho tem imagem, e a
 * máquina pode estar desligada. Deixar o quadro vazio piscando um ícone de
 * imagem quebrada seria pior do que não mostrar nada.
 */
function Preview({ registro }: { registro: Registro }) {
  const [estado, setEstado] = useState<"carregando" | "ok" | "sem">("carregando");
  const endereco =
    `/api/impressoras/preview-image?machine=${encodeURIComponent(registro.machineId)}` +
    `&task=${encodeURIComponent(registro.task)}` +
    `&ref=${encodeURIComponent(registro.previewRef || "")}&channel=0`;

  return (
    <span className="flex h-[150px] items-center justify-center bg-painel">
      {estado !== "ok" && (
        <span className="text-[0.75rem] text-tinta-apagada">
          {estado === "carregando" ? "" : "sem imagem"}
        </span>
      )}
      <img
        src={endereco}
        alt=""
        loading="lazy"
        onLoad={() => setEstado("ok")}
        onError={() => setEstado("sem")}
        className={`h-[150px] w-full object-contain ${estado === "ok" ? "" : "hidden"}`}
      />
    </span>
  );
}

function Situacao({ registro }: { registro: Registro }) {
  const { cor, texto } = registro.cancelled
    ? { cor: "text-alerta", texto: "Cancelado" }
    : registro.error
      ? { cor: "text-atencao", texto: "Erro" }
      : registro.progressState === "printing"
        ? { cor: "text-ambar", texto: registro.status || "Em impressão" }
        : { cor: "text-certo", texto: registro.status || "Concluído" };

  return <span className={`text-[0.75rem] font-semibold ${cor}`}>{texto}</span>;
}
