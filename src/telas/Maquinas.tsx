/**
 * ===========================================================================
 * MÁQUINAS — achar as impressoras na rede
 * ===========================================================================
 *
 * Esta é a única porta de entrada de uma impressora no sistema. Não existe
 * lista escrita no código nem arquivo de configuração para editar: a máquina
 * entra porque a varredura a encontrou na rede e alguém deu um nome a ela.
 *
 * O fluxo, de propósito, tem dois passos e não um:
 *
 *   1. **Procurar** — varre as sub-redes locais, descobre quem responde em SMB,
 *      resolve o nome do computador e reconhece o tipo da impressora pelo que
 *      ela deixa no compartilhamento.
 *   2. **Dar o nome** — cada máquina nova fica esperando. Cadastrar sozinho
 *      encheria a lista de "DESKTOP-5KFPUBG", que ninguém reconhece na tela.
 *
 * Máquina que já existe não passa pelo passo 2: ela é reconhecida pelo nome do
 * computador, mantém o id e o nome que já tinha, e só tem as rotas reescritas.
 * É o que impede que uma nova varredura duplique o histórico já guardado.
 *
 * A varredura leva perto de meio minuto numa rede /24, então o progresso chega
 * pelo socket. Sem isso a tela ficaria parada num botão apagado, e quem está
 * olhando não teria como saber se está funcionando ou travou.
 */

import { useCallback, useState } from "react";
import { api } from "../api/cliente";
import { useDados } from "../api/useDados";
import { Cartao } from "../casca/Cartao";
import { Icone } from "../casca/Icone";
import { useEventos } from "../impressoras/socket";
import { dataBr, metrosCurtos } from "../utils/formato";
import type { AchadoDaVarredura, EstadoDaVarredura, MaquinaGerenciada, RotasDaMaquina } from "../impressoras/tipos";

const ROTULO_DA_FASE: Record<EstadoDaVarredura["phase"], string> = {
  idle: "Parada",
  starting: "Começando",
  hosts: "Testando os computadores informados",
  sweep: "Varrendo a rede",
  identify: "Identificando as impressoras",
  history: "Puxando o histórico",
  done: "Terminou",
  error: "Falhou",
};

export function Maquinas() {
  const varredura = useDados<EstadoDaVarredura>(
    () => api.get<EstadoDaVarredura>("/impressoras/machines/scan"),
  );
  const cadastradas = useDados<MaquinaGerenciada[]>(
    () => api.get<MaquinaGerenciada[]>("/impressoras/machines/manage"),
  );

  const [alvos, setAlvos] = useState("");
  const [falha, setFalha] = useState<string | null>(null);

  // O progresso da varredura vem inteiro no evento, então dá para pintar
  // direto sem uma volta ao servidor a cada passo.
  const recarregarCadastradas = cadastradas.recarregar;
  useEventos(["machines:scan"], (_evento, dados) => {
    const estado = dados as EstadoDaVarredura;
    varredura.setDados(estado);
    if (estado.phase === "done") recarregarCadastradas();
  });

  const procurar = useCallback(async () => {
    setFalha(null);
    const hosts = alvos.split(",").map((h) => h.trim()).filter(Boolean);
    try {
      await api.post("/impressoras/machines/scan", { hosts });
      varredura.recarregar();
    } catch (erro) {
      setFalha(erro instanceof Error ? erro.message : "Não consegui começar a varredura.");
    }
  }, [alvos, varredura]);

  const parar = useCallback(async () => {
    try {
      await api.post("/impressoras/machines/scan/stop", {});
      varredura.recarregar();
    } catch {
      /* parar é um pedido, não uma garantia: a varredura em curso termina o passo atual */
    }
  }, [varredura]);

  const estado = varredura.dados;
  const rodando = Boolean(estado?.running);
  const pendentes = (estado?.results || []).filter((r) => r.action === "pending");
  const reconhecidas = (estado?.results || []).filter((r) => r.action !== "pending");

  return (
    <>
      <Cartao
        titulo="Procurar máquinas"
        icone="icones.svg#radar"
        apoio="Varre a rede local, reconhece cada impressora pelo que ela compartilha e guarda os caminhos sozinha."
        acao={
          rodando ? (
            <button
              type="button"
              onClick={parar}
              className="rounded-[9px] border border-linha bg-painel-suave px-4 py-2 text-[0.85rem] font-semibold text-tinta-fraca transition-colors hover:text-tinta"
            >
              Parar
            </button>
          ) : (
            <button
              type="button"
              onClick={procurar}
              className="flex items-center gap-2 rounded-[9px] border border-ambar bg-ambar px-4 py-2 text-[0.85rem] font-semibold text-ambar-tinta transition-colors hover:bg-ambar-claro"
            >
              <Icone referencia="icones.svg#radar" className="size-4" />
              Procurar máquinas
            </button>
          )
        }
      >
        <label className="mb-3 block">
          <span className="mb-1.5 block text-[0.78rem] text-tinta-fraca">
            Computadores a testar — separados por vírgula. Em branco, varre a rede toda.
          </span>
          <input
            type="text"
            value={alvos}
            onChange={(evento) => setAlvos(evento.target.value)}
            placeholder="NOME-DO-PC, 192.168.0.10"
            disabled={rodando}
            className="w-full rounded-[9px] border border-linha bg-painel-suave px-3 py-2 font-mono text-[0.82rem] text-tinta outline-none placeholder:text-tinta-apagada focus:border-[var(--accent-line)] disabled:opacity-50"
          />
        </label>

        {falha && <Aviso texto={falha} />}
        {estado?.error && <Aviso texto={estado.error} />}

        {estado && (
          <div className="rounded-[10px] border border-linha bg-painel-suave px-3.5 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[0.85rem] font-semibold text-tinta">{ROTULO_DA_FASE[estado.phase]}</span>
              {estado.total > 0 && (
                <span className="font-mono text-[0.75rem] text-tinta-apagada">
                  {estado.scanned} / {estado.total}
                </span>
              )}
            </div>
            <p className="mt-1 mb-0 text-[0.8rem] text-tinta-fraca">{estado.message}</p>

            {rodando && estado.total > 0 && (
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={estado.total}
                aria-valuenow={estado.scanned}
                className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[var(--border)]"
              >
                <div
                  className="h-full rounded-full bg-ambar transition-[width] duration-300"
                  style={{ width: `${Math.min(100, (estado.scanned / estado.total) * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}
      </Cartao>

      {pendentes.length > 0 && (
        <Cartao
          titulo="Esperando um nome"
          icone="icones.svg#circle-help"
          apoio="Estas impressoras existem na rede e ainda não existem aqui. Dê um nome e elas entram — o histórico vem junto."
        >
          <ul className="m-0 grid list-none gap-2.5 p-0">
            {pendentes.map((achado) => (
              <Pendente
                key={achado.host}
                achado={achado}
                aoMudar={() => { varredura.recarregar(); cadastradas.recarregar(); }}
              />
            ))}
          </ul>
        </Cartao>
      )}

      {reconhecidas.length > 0 && (
        <Cartao
          titulo="Reconhecidas na última varredura"
          icone="icones.svg#check"
          apoio="Máquinas que já existiam aqui. Elas mantêm o id e o nome; só os caminhos são reescritos."
        >
          <ul className="m-0 grid list-none gap-2 p-0">
            {reconhecidas.map((achado) => (
              <li
                key={achado.host}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] border border-linha bg-painel-suave px-3.5 py-2.5"
              >
                <strong className="text-[0.9rem] text-tinta">{achado.machineName || achado.host}</strong>
                <span className="font-mono text-[0.72rem] text-tinta-apagada">{achado.host}</span>
                <span className="text-[0.78rem] text-tinta-fraca">{achado.typeLabel}</span>
                <span className="ml-auto text-[0.75rem] text-tinta-apagada">
                  {achado.importing
                    ? "importando o histórico..."
                    : achado.importError
                      ? achado.importError
                      : achado.imported
                        ? `${achado.imported} registro(s)`
                        : achado.action === "updated" ? "caminhos atualizados" : "sem mudança"}
                </span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <Cartao
        titulo="Impressoras cadastradas"
        icone="icones.svg#printer"
        apoio="O que o sistema conhece hoje. Desativar tira do painel e guarda uma planilha do histórico antes."
      >
        {cadastradas.carregando && <Apoio texto="Carregando..." />}
        {cadastradas.erro && <Aviso texto={cadastradas.erro} />}
        {cadastradas.dados?.length === 0 && (
          <Apoio texto="Nenhuma ainda. Clique em Procurar máquinas — elas aparecem sozinhas." />
        )}

        <ul className="m-0 grid list-none gap-2.5 p-0">
          {(cadastradas.dados || []).map((maquina) => (
            <Cadastrada key={maquina.id} maquina={maquina} aoMudar={cadastradas.recarregar} />
          ))}
        </ul>
      </Cartao>
    </>
  );
}

/** Uma máquina achada na rede que ainda não existe aqui. */
function Pendente({ achado, aoMudar }: { achado: AchadoDaVarredura; aoMudar: () => void }) {
  // O nome do computador é só o palpite: quem opera chama a máquina de
  // "Impressora 04", não de "DESKTOP-I756TIT".
  const [nome, setNome] = useState(achado.host);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const cadastrar = async () => {
    if (!nome.trim()) { setErro("Dê um nome para a máquina antes de cadastrar."); return; }
    setSalvando(true);
    setErro(null);
    try {
      await api.post("/impressoras/machines/register", { host: achado.host, name: nome.trim() });
      aoMudar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui cadastrar.");
      setSalvando(false);
    }
  };

  const descartar = async () => {
    try {
      await api.post("/impressoras/machines/dismiss", { host: achado.host });
      aoMudar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui descartar.");
    }
  };

  return (
    <li className="rounded-[10px] border border-[var(--accent-line)] bg-painel-suave px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-[0.8rem] text-tinta">{achado.host}</span>
        {achado.ip && <span className="font-mono text-[0.72rem] text-tinta-apagada">{achado.ip}</span>}
        <span className="rounded-full border border-linha px-2.5 py-0.5 text-[0.72rem] text-tinta-fraca">
          {achado.typeLabel}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={nome}
          onChange={(evento) => setNome(evento.target.value)}
          placeholder="Como esta máquina é chamada na produção"
          className="min-w-[200px] flex-1 rounded-[9px] border border-linha bg-painel px-3 py-2 text-[0.85rem] text-tinta outline-none placeholder:text-tinta-apagada focus:border-[var(--accent-line)]"
        />
        <button
          type="button"
          onClick={cadastrar}
          disabled={salvando}
          className="rounded-[9px] border border-ambar bg-ambar px-4 py-2 text-[0.82rem] font-semibold text-ambar-tinta transition-colors hover:bg-ambar-claro disabled:opacity-50"
        >
          {salvando ? "Cadastrando..." : "Cadastrar"}
        </button>
        <button
          type="button"
          onClick={descartar}
          className="rounded-[9px] border border-linha px-3 py-2 text-[0.82rem] text-tinta-fraca transition-colors hover:text-tinta"
        >
          Agora não
        </button>
      </div>

      {erro && <Aviso texto={erro} />}

      <ListaDeRotas rotas={achado.paths} />
    </li>
  );
}

/**
 * Uma máquina que já está no sistema.
 *
 * ---------------------------------------------------------------------------
 * POR QUE EXCLUIR EXIGE DESATIVAR ANTES
 * ---------------------------------------------------------------------------
 *
 * Não é burocracia: desativar é o que EXPORTA A PLANILHA do histórico
 * (`POST /machines/:id/deactivate`, em `impressoras/routes/machines.js`).
 * Excluir apaga a máquina e tudo que veio dela — os registros, os itens de
 * pedido que apontavam para eles e o pedido que ficar vazio. Sem a planilha
 * gravada antes, isso é perda definitiva de meses de produção com dois
 * cliques.
 *
 * O servidor recusa a exclusão de máquina ativa, e esta tela não tenta
 * contornar: ela mostra o caminho na ordem certa e diz, na confirmação,
 * exatamente quantos registros vão embora.
 *
 * Desativar sozinho já resolve a maior parte dos casos: a máquina some do
 * painel, para de ser lida, e o histórico continua inteiro e consultável.
 */
function Cadastrada({ maquina, aoMudar }: { maquina: MaquinaGerenciada; aoMudar: () => void }) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [renomeando, setRenomeando] = useState(false);
  const [nome, setNome] = useState(maquina.name);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const comErro = async (oQueFazer: () => Promise<void>, recado: string) => {
    setOcupado(true);
    setErro(null);
    try {
      await oQueFazer();
      aoMudar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : recado);
    }
    setOcupado(false);
  };

  const desativar = () => comErro(
    async () => { await api.post(`/impressoras/machines/${maquina.id}/deactivate`, {}); },
    "Não consegui desativar.");

  const reativar = () => comErro(
    async () => { await api.patch(`/impressoras/machines/${maquina.id}`, { enabled: true }); },
    "Não consegui reativar.");

  /*
   * Renomear troca só o rótulo. O `id` fica como está de propósito: é ele que
   * amarra o histórico já gravado (`imp_records.machineId`) e os itens de
   * pedido. Trocá-lo junto órfãozaria tudo que a máquina produziu — que é
   * exatamente o que a varredura evita ao reconhecer uma máquina pelo nome do
   * computador em vez de cadastrá-la de novo.
   */
  const salvarNome = () => comErro(async () => {
    const limpo = nome.trim();
    if (!limpo) throw new Error("O nome não pode ficar vazio.");
    await api.patch(`/impressoras/machines/${maquina.id}`, { name: limpo });
    setRenomeando(false);
  }, "Não consegui renomear.");

  const excluir = () => comErro(async () => {
    await api.apagar(`/impressoras/machines/${maquina.id}`);
    setConfirmandoExclusao(false);
  }, "Não consegui excluir.");

  return (
    <li className={`rounded-[10px] border px-3.5 py-3 ${maquina.enabled ? "border-linha bg-painel-suave" : "border-linha-suave bg-painel opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          aria-hidden="true"
          className={`size-2 shrink-0 rounded-full ${maquina.online ? "bg-certo" : "bg-[var(--text-faint)]"}`}
        />

        {renomeando ? (
          <input
            type="text"
            value={nome}
            autoFocus
            onChange={(evento) => setNome(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === "Enter") salvarNome();
              if (evento.key === "Escape") { setNome(maquina.name); setRenomeando(false); }
            }}
            aria-label="Nome da máquina"
            className="min-w-[160px] flex-1 rounded-[9px] border border-[var(--accent-line)] bg-painel px-2.5 py-1 text-[0.95rem] text-tinta outline-none"
          />
        ) : (
          <strong className="text-[0.95rem] text-tinta">{maquina.name}</strong>
        )}

        <span className="font-mono text-[0.72rem] text-tinta-apagada">{maquina.host || maquina.ip}</span>
        <span className="rounded-full border border-linha px-2.5 py-0.5 text-[0.72rem] text-tinta-fraca">
          {maquina.typeLabel}
        </span>
        {!maquina.enabled && (
          <span className="rounded-full border border-linha px-2.5 py-0.5 text-[0.72rem] text-tinta-apagada">
            desativada
          </span>
        )}

        <span className="ml-auto flex flex-wrap items-center gap-2">
          {renomeando ? (
            <>
              <button
                type="button"
                onClick={salvarNome}
                disabled={ocupado}
                className="rounded-[9px] border border-ambar bg-ambar px-3 py-1.5 text-[0.78rem] font-semibold text-ambar-tinta transition-colors hover:bg-ambar-claro disabled:opacity-50"
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={() => { setNome(maquina.name); setRenomeando(false); setErro(null); }}
                className="rounded-[9px] border border-linha px-3 py-1.5 text-[0.78rem] text-tinta-fraca transition-colors hover:text-tinta"
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setRenomeando(true)}
              className="rounded-[9px] border border-linha px-3 py-1.5 text-[0.78rem] text-tinta-fraca transition-colors hover:text-tinta"
            >
              Renomear
            </button>
          )}

          <a
            href={`/api/impressoras/machines/${maquina.id}/export.xlsx`}
            className="rounded-[9px] border border-linha px-3 py-1.5 text-[0.78rem] text-tinta-fraca no-underline transition-colors hover:text-tinta"
          >
            Planilha
          </a>

          {maquina.enabled ? (
            <button
              type="button"
              onClick={desativar}
              disabled={ocupado}
              className="rounded-[9px] border border-linha px-3 py-1.5 text-[0.78rem] text-tinta-fraca transition-colors hover:text-tinta disabled:opacity-50"
            >
              Desativar
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={reativar}
                disabled={ocupado}
                className="rounded-[9px] border border-linha px-3 py-1.5 text-[0.78rem] text-tinta-fraca transition-colors hover:text-tinta disabled:opacity-50"
              >
                Reativar
              </button>
              <button
                type="button"
                onClick={() => setConfirmandoExclusao(true)}
                disabled={ocupado}
                className="rounded-[9px] border border-linha px-3 py-1.5 text-[0.78rem] text-tinta-fraca transition-colors hover:text-alerta disabled:opacity-50"
              >
                Excluir
              </button>
            </>
          )}
        </span>
      </div>

      <p className="mt-1.5 mb-0 text-[0.78rem] text-tinta-apagada">
        {maquina.stats.records.toLocaleString("pt-BR")} registro(s)
        {maquina.stats.firstDate && ` — de ${dataBr(maquina.stats.firstDate)} a ${dataBr(maquina.stats.lastDate)}`}
        {maquina.stats.meters > 0 && ` — ${metrosCurtos(maquina.stats.meters)}`}
      </p>

      {/*
        A confirmação diz o TAMANHO do que some, e não só "tem certeza?".
        "Excluir 9.965 registros" é uma pergunta que dá para responder;
        "excluir a máquina" não é.
      */}
      {confirmandoExclusao && (
        <div className="mt-2.5 rounded-[9px] border border-alerta px-3 py-2.5">
          <p className="m-0 text-[0.82rem] text-tinta">
            Excluir <strong>{maquina.name}</strong> apaga também{" "}
            <strong>{maquina.stats.records.toLocaleString("pt-BR")} registro(s)</strong> de histórico
            {maquina.stats.pedidoItems > 0 && (
              <> e <strong>{maquina.stats.pedidoItems}</strong> item(ns) em {maquina.stats.pedidos} pedido(s)</>
            )}
            . Não tem como desfazer.
          </p>
          <p className="mt-1 mb-2.5 text-[0.75rem] text-tinta-apagada">
            A planilha do histórico foi gravada quando você desativou — ela fica em{" "}
            <code className="font-mono">exportado/</code>, ao lado do banco.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={excluir}
              disabled={ocupado}
              className="rounded-[9px] border border-alerta px-3 py-1.5 text-[0.78rem] font-semibold text-alerta disabled:opacity-50"
            >
              Excluir mesmo
            </button>
            <button
              type="button"
              onClick={() => setConfirmandoExclusao(false)}
              className="rounded-[9px] border border-linha px-3 py-1.5 text-[0.78rem] text-tinta-fraca"
            >
              Não
            </button>
          </div>
        </div>
      )}

      {maquina.enabled && (
        <p className="mt-1 mb-0 text-[0.72rem] text-tinta-apagada">
          Para excluir, desative antes — é o que grava a planilha do histórico.
        </p>
      )}

      {!maquina.online && maquina.error && (
        <p className="mt-2 mb-0 text-[0.75rem] text-atencao">{maquina.error}</p>
      )}
      {erro && <Aviso texto={erro} />}

      <ListaDeRotas rotas={maquina.paths} />
    </li>
  );
}

/**
 * Os caminhos de rede da máquina, recolhidos atrás de um "?".
 *
 * São seis linhas de UNC comprido: abertos, empurram tudo para baixo da dobra,
 * e quase nunca são o que se quer ver. Mas quando a máquina aparece offline,
 * são exatamente eles que respondem por quê.
 */
function ListaDeRotas({ rotas }: { rotas: RotasDaMaquina }) {
  const linhas = Object.entries(rotas).filter(([, valor]) => Boolean(valor));
  if (!linhas.length) return null;

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-[0.75rem] text-tinta-apagada">
        Caminhos na rede ({linhas.length})
      </summary>
      <dl className="mt-1.5 mb-0 grid gap-1">
        {linhas.map(([campo, valor]) => (
          <div key={campo} className="flex flex-wrap gap-x-2">
            <dt className="font-mono text-[0.7rem] text-tinta-apagada">{campo}</dt>
            <dd className="m-0 min-w-0 break-all font-mono text-[0.7rem] text-tinta-fraca">{valor}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function Aviso({ texto }: { texto: string }) {
  return (
    <p className="mt-2 mb-0 flex items-center gap-2 text-[0.8rem] text-alerta">
      <Icone referencia="icones.svg#triangle-alert" className="size-4 shrink-0" />
      {texto}
    </p>
  );
}

function Apoio({ texto }: { texto: string }) {
  return <p className="m-0 text-[0.85rem] text-tinta-fraca">{texto}</p>;
}
