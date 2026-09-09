/**
 * ===========================================================================
 * WHATSAPP — os avisos de impressão num grupo
 * ===========================================================================
 *
 * Avisa num grupo do WhatsApp quando uma impressão começa e quando termina,
 * em qualquer máquina. Não há servidor externo nem chave de API: o servidor
 * abre um Chrome invisível com o WhatsApp Web dentro do próprio processo.
 *
 * O que essa escolha custa, e por que está escrito na tela e não só aqui:
 * o Chrome consome 300 a 500 MB de memória enquanto o bot está conectado, e
 * a biblioteca não é oficial — uma mudança no WhatsApp Web pode derrubá-la
 * até sair versão nova. Quem liga isso precisa saber disso antes, não depois.
 *
 * A pasta da sessão é uma credencial: quem a copiar entra no WhatsApp do bot.
 * Ela mora junto do `dados.db` (ver `caminhos.js`), e não no meio do código.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTA TELA PERGUNTA E NÃO ESCUTA
 * ---------------------------------------------------------------------------
 *
 * O QR se renova a cada ~20 segundos e não passa pelo socket dos eventos de
 * impressão — ele é do cliente do WhatsApp, não do painel. Então enquanto a
 * conexão está subindo esta tela pergunta o estado de tempos em tempos, e para
 * assim que conecta. É o único lugar do módulo que consulta em laço, e só
 * enquanto a janela do QR está aberta.
 */

import { useEffect, useState } from "react";
import { api } from "../api/cliente";
import { useDados } from "../api/useDados";
import { Cartao } from "../casca/Cartao";
import { Icone } from "../casca/Icone";
import type { AjustesDoWhatsapp, EstadoDoWhatsapp } from "../impressoras/tipos";

interface RespostaDeAjustes {
  settings: AjustesDoWhatsapp;
  ready: boolean;
  machines: { id: string; name: string }[];
}

interface Grupo { id: string; name: string }

const ROTULO_DO_ESTADO: Record<EstadoDoWhatsapp["status"], string> = {
  off: "Desligado",
  starting: "Abrindo o WhatsApp Web...",
  qr: "Esperando você ler o QR",
  ready: "Conectado",
  error: "Falhou",
};

export function Whatsapp() {
  const estado = useDados<EstadoDoWhatsapp>(() => api.get<EstadoDoWhatsapp>("/impressoras/whatsapp/status"));
  const ajustes = useDados<RespostaDeAjustes>(() => api.get<RespostaDeAjustes>("/impressoras/whatsapp/settings"));

  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);

  // Enquanto está subindo ou mostrando QR, o estado muda sozinho no servidor:
  // é o único caso do módulo em que perguntar de novo é o certo. Conectado ou
  // desligado, o laço para.
  const situacao = estado.dados?.status;
  const recarregarEstado = estado.recarregar;
  useEffect(() => {
    if (situacao !== "starting" && situacao !== "qr") return;
    const relogio = setInterval(recarregarEstado, 3000);
    return () => clearInterval(relogio);
  }, [situacao, recarregarEstado]);

  const conectar = async () => {
    setErro(null);
    try {
      await api.post("/impressoras/whatsapp/connect", {});
      estado.recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui iniciar a conexão.");
    }
  };

  const sair = async () => {
    setErro(null);
    try {
      await api.post("/impressoras/whatsapp/logout", {});
      estado.recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui desconectar.");
    }
  };

  const testar = async () => {
    setErro(null);
    setRecado(null);
    try {
      await api.post("/impressoras/whatsapp/test", {});
      setRecado("Mensagem de teste enviada.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui enviar o teste.");
    }
  };

  const conectado = estado.dados?.status === "ready";

  return (
    <>
      <Cartao
        titulo="Conexão"
        icone="icones.svg#message-circle"
        apoio="O número do bot precisa já ser membro do grupo que vai receber os avisos."
        acao={
          conectado ? (
            <button
              type="button"
              onClick={sair}
              className="rounded-[9px] border border-linha px-4 py-2 text-[0.85rem] text-tinta-fraca transition-colors hover:text-tinta"
            >
              Desconectar
            </button>
          ) : (
            <button
              type="button"
              onClick={conectar}
              className="rounded-[9px] border border-ambar bg-ambar px-4 py-2 text-[0.85rem] font-semibold text-ambar-tinta transition-colors hover:bg-ambar-claro"
            >
              Conectar WhatsApp
            </button>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            aria-hidden="true"
            className={`size-2.5 shrink-0 rounded-full ${conectado ? "bg-certo" : estado.dados?.status === "error" ? "bg-alerta" : "bg-[var(--text-faint)]"}`}
          />
          <strong className="text-[0.9rem] text-tinta">
            {estado.dados ? ROTULO_DO_ESTADO[estado.dados.status] : "Consultando..."}
          </strong>
          {estado.dados?.me?.pushname && (
            <span className="text-[0.8rem] text-tinta-fraca">como {estado.dados.me.pushname}</span>
          )}
        </div>

        {estado.dados?.lastError && (
          <p className="mt-2 mb-0 text-[0.8rem] text-atencao">{estado.dados.lastError}</p>
        )}

        {/*
          O QR vem do servidor já desenhado em SVG — o navegador não gera nada.
          É conteúdo do próprio servidor local, não de terceiro.
        */}
        {estado.dados?.status === "qr" && estado.dados.qrSvg && (
          <div className="mt-3.5">
            <p className="mt-0 mb-2 text-[0.82rem] text-tinta-fraca">
              No celular do bot: WhatsApp → Aparelhos conectados → Conectar aparelho.
              O código se renova sozinho a cada ~20 segundos.
            </p>
            <div
              className="inline-block rounded-[10px] bg-white p-3 [&_svg]:block [&_svg]:size-[220px]"
              // O SVG é gerado por `impressoras/services/qrcode.js`, deste
              // mesmo servidor — não há texto de fora entrando aqui.
              dangerouslySetInnerHTML={{ __html: estado.dados.qrSvg }}
            />
          </div>
        )}

        <details className="mt-3">
          <summary className="cursor-pointer text-[0.78rem] text-tinta-apagada">
            O que ligar isto custa
          </summary>
          <p className="mt-1.5 mb-0 text-[0.78rem] text-tinta-fraca">
            O bot mantém um Chrome invisível aberto: 300 a 500 MB de memória enquanto
            estiver conectado. A biblioteca usada não é oficial, então uma mudança no
            WhatsApp Web pode derrubá-la até sair uma versão nova dela. E o nome do
            trabalho vem da linha que a impressora escreve ao <em>iniciar</em>: se o
            servidor reiniciar no meio de uma impressão, aquele trabalho não gera aviso.
          </p>
        </details>

        {erro && (
          <p className="mt-2.5 mb-0 flex items-center gap-2 text-[0.8rem] text-alerta">
            <Icone referencia="icones.svg#triangle-alert" className="size-4 shrink-0" />
            {erro}
          </p>
        )}
        {recado && <p className="mt-2.5 mb-0 text-[0.8rem] text-certo">{recado}</p>}
      </Cartao>

      {ajustes.dados && (
        <PainelDeAjustes
          dados={ajustes.dados}
          conectado={conectado}
          aoSalvar={ajustes.recarregar}
          aoTestar={testar}
        />
      )}
    </>
  );
}

function PainelDeAjustes({ dados, conectado, aoSalvar, aoTestar }: {
  dados: RespostaDeAjustes; conectado: boolean; aoSalvar: () => void; aoTestar: () => void;
}) {
  const [ajustes, setAjustes] = useState(dados.settings);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Os grupos só existem com a conexão de pé: pedi-los desconectado devolveria
  // erro e encheria a tela de aviso à toa.
  const grupos = useDados<Grupo[]>(
    () => (conectado ? api.get<Grupo[]>("/impressoras/whatsapp/groups") : Promise.resolve([])),
    [conectado],
  );

  const gravar = async (mudanca: Partial<AjustesDoWhatsapp>) => {
    const proximo = { ...ajustes, ...mudanca };
    setAjustes(proximo);
    setSalvando(true);
    setErro(null);
    try {
      await api.put("/impressoras/whatsapp/settings", mudanca);
      aoSalvar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui salvar.");
    }
    setSalvando(false);
  };

  return (
    <Cartao
      titulo="O que avisar"
      icone="icones.svg#bell"
      apoio="Sem nenhuma máquina marcada, avisa de todas."
      acao={
        conectado && ajustes.groupId ? (
          <button
            type="button"
            onClick={aoTestar}
            className="rounded-[9px] border border-linha px-3 py-1.5 text-[0.8rem] text-tinta-fraca transition-colors hover:text-tinta"
          >
            Enviar teste
          </button>
        ) : undefined
      }
    >
      <Interruptor
        rotulo="Ligar os avisos"
        apoio="Desligado aqui, o bot não manda nada mesmo conectado."
        ligado={ajustes.enabled}
        aoMudar={(valor) => gravar({ enabled: valor })}
      />

      <label className="mt-3.5 block">
        <span className="mb-1.5 block text-[0.75rem] text-tinta-fraca">Grupo que recebe</span>
        <select
          value={ajustes.groupId}
          disabled={!conectado}
          onChange={(evento) => {
            const escolhido = (grupos.dados || []).find((g) => g.id === evento.target.value);
            gravar({ groupId: evento.target.value, groupName: escolhido?.name || "" });
          }}
          className="w-full rounded-[9px] border border-linha bg-painel-suave px-3 py-2 text-[0.85rem] text-tinta outline-none focus:border-[var(--accent-line)] disabled:opacity-50"
        >
          <option value="">
            {conectado ? "Escolha um grupo" : "Conecte o WhatsApp para listar os grupos"}
          </option>
          {(grupos.dados || []).map((grupo) => (
            <option key={grupo.id} value={grupo.id}>{grupo.name}</option>
          ))}
        </select>
        {ajustes.groupName && !conectado && (
          <span className="mt-1 block text-[0.75rem] text-tinta-apagada">
            Guardado: {ajustes.groupName}
          </span>
        )}
      </label>

      <div className="mt-3.5 grid gap-2">
        <Interruptor rotulo="Quando começa" ligado={ajustes.notifyStart} aoMudar={(v) => gravar({ notifyStart: v })} />
        <Interruptor rotulo="Quando termina" ligado={ajustes.notifyFinish} aoMudar={(v) => gravar({ notifyFinish: v })} />
        <Interruptor rotulo="Quando dá erro ou é cancelada" ligado={ajustes.notifyError} aoMudar={(v) => gravar({ notifyError: v })} />
      </div>

      {dados.machines.length > 0 && (
        <fieldset className="mt-3.5 border-0 p-0">
          <legend className="mb-1.5 p-0 text-[0.75rem] text-tinta-fraca">De quais máquinas</legend>
          <div className="flex flex-wrap gap-2">
            {dados.machines.map((maquina) => {
              const marcada = ajustes.machines.includes(maquina.id);
              return (
                <button
                  key={maquina.id}
                  type="button"
                  onClick={() => gravar({
                    machines: marcada
                      ? ajustes.machines.filter((id) => id !== maquina.id)
                      : [...ajustes.machines, maquina.id],
                  })}
                  aria-pressed={marcada}
                  className={`rounded-full border px-3 py-1.5 text-[0.78rem] transition-colors ${
                    marcada ? "border-ambar bg-ambar text-ambar-tinta" : "border-linha text-tinta-fraca hover:text-tinta"
                  }`}
                >
                  {maquina.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {salvando && <p className="mt-2.5 mb-0 text-[0.78rem] text-tinta-apagada">Salvando...</p>}
      {erro && <p className="mt-2.5 mb-0 text-[0.8rem] text-alerta">{erro}</p>}
    </Cartao>
  );
}

function Interruptor({ rotulo, apoio, ligado, aoMudar }: {
  rotulo: string; apoio?: string; ligado: boolean; aoMudar: (valor: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={ligado}
        onChange={(evento) => aoMudar(evento.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
      />
      <span className="min-w-0">
        <span className="block text-[0.85rem] text-tinta">{rotulo}</span>
        {apoio && <span className="block text-[0.75rem] text-tinta-apagada">{apoio}</span>}
      </span>
    </label>
  );
}
