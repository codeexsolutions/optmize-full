/**
 * ===========================================================================
 * LICENÇA — o token deste computador
 * ===========================================================================
 *
 * A tela mostra até quando o programa está liberado e o código desta
 * instalação — o que o cliente manda ao fornecedor — e tem o campo onde o
 * token é colado, uma vez.
 *
 * Não existe gerador aqui: os tokens são emitidos no painel do fornecedor, que
 * é outro projeto, e este programa não sabe assinar nada. Ele também não fala
 * com servidor nenhum: confere a assinatura do token na própria máquina, sem
 * internet (ver `servidor/licenca.js`).
 *
 * A tela não decide nada — quem confere e conta os dias é o servidor local,
 * que sai em bytecode dentro do instalador. Aqui só se mostra o que ele
 * respondeu e se manda o que a pessoa colou, porque tela é código que o
 * cliente pode mexer com o F12 aberto.
 */

import { useCallback, useEffect, useState } from "react";
import { api } from "../api/cliente";
import { useDados } from "../api/useDados";
import { Cartao } from "../casca/Cartao";
import { Icone } from "../casca/Icone";
import { useSemCabecalho } from "../casca/semCabecalho";
import { dataBr } from "../utils/formato";

export interface EstadoDaLicenca {
  liberado: boolean;
  /** `ok`, `vencendo`, `vencido`, `sem-token`, `outra-maquina`, `ja-usado`... */
  motivo: string;
  /** O código desta instalação — é o que o cliente manda para pedir o token. */
  maquina: string;
  nomeDaMaquina: string;
  cliente: string | null;
  expira: string | null;
  observacao: string | null;
  dias: number | null;
}

/** Busca o estado da licença. Usada pela tela e pelo portão da casca. */
export function useLicenca() {
  return useDados<EstadoDaLicenca>(() => api.get<EstadoDaLicenca>("/licenca"));
}

/**
 * A tela da rota `/licenca`.
 *
 * Sem cabeçalho e ocupando a janela toda: é uma tela de um assunto só, e o
 * cabeçalho repetiria a palavra "Licença" logo acima do cartão que já a diz —
 * cobrando 57px de uma tela que quer ficar centrada na vertical.
 */
export function Licenca() {
  useSemCabecalho(true);
  const licenca = useLicenca();

  return (
    <div className="flex min-h-0 w-full flex-1 items-center justify-center px-4 py-8">
      <div className="w-full max-w-[560px]">
        <PainelDaLicenca estado={licenca.dados} />
      </div>
    </div>
  );
}

export function PainelDaLicenca({ estado }: { estado: EstadoDaLicenca | null }) {
  return (
    <>
      <Cartao
        titulo="Licença deste computador"
        icone="icones.svg#shield-check"
        apoio="O programa confere o token sozinho, na máquina, sem internet. Quando ele vencer, peça um novo ao fornecedor."
      >
        <Situacao estado={estado} />
        <EstaMaquina estado={estado} />
        <ColarToken />
      </Cartao>

    </>
  );
}

/* ------------------------------------------------------------------ estado */

interface Recado { titulo: string; texto: string; cor: string }

const RECADO: Record<string, Recado | undefined> = {
  ok: { titulo: "Liberado", texto: "Está tudo certo com esta instalação.", cor: "text-certo" },
  vencendo: {
    titulo: "Vence em breve",
    texto: "Peça o token novo antes da data para não parar no meio do trabalho.",
    cor: "text-atencao",
  },
  vencido: {
    titulo: "Vencido",
    texto: "O programa está bloqueado até um token novo ser colado aqui.",
    cor: "text-alerta",
  },
  "sem-token": {
    titulo: "Computador não ativado",
    texto: "Mande o código desta máquina ao fornecedor e cole aqui o token que ele responder.",
    cor: "text-alerta",
  },
  formato: { titulo: "Token inválido", texto: "O que está guardado não é um token do Optmize.", cor: "text-alerta" },
  assinatura: {
    titulo: "Token inválido",
    texto: "A assinatura não confere — este token não foi emitido pelo fornecedor.",
    cor: "text-alerta",
  },
  "outra-maquina": {
    titulo: "Token de outro computador",
    texto: "Este token foi emitido para outra máquina. Peça um para o código abaixo.",
    cor: "text-alerta",
  },
  "ja-usado": {
    titulo: "Token já usado",
    texto: "Cada token vale uma ativação só. Peça um novo com o código desta máquina.",
    cor: "text-alerta",
  },
  relogio: {
    titulo: "Relógio atrasado",
    texto: "A data do computador está atrás da última vez que o programa rodou. Acerte o relógio do Windows e abra de novo.",
    cor: "text-alerta",
  },
};

function Situacao({ estado }: { estado: EstadoDaLicenca | null }) {
  if (!estado) return <p className="m-0 text-[0.85rem] text-tinta-fraca">Conferindo a licença...</p>;
  const recado: Recado = RECADO[estado.motivo] || RECADO.formato!;

  return (
    <div className="rounded-[12px] border border-linha bg-painel-suave px-4 py-3.5">
      <p className={`m-0 font-titulo text-[1.05rem] font-semibold tracking-[-0.02em] ${recado.cor}`}>
        {recado.titulo}
      </p>
      <p className="mt-1 mb-0 text-[0.83rem] text-tinta-fraca">{recado.texto}</p>

      {estado.cliente && (
        <dl className="mt-3.5 mb-0 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(130px,1fr))]">
          <Campo rotulo="Cliente" valor={estado.cliente} />
          <Campo rotulo="Vence em" valor={estado.expira ? dataBr(estado.expira) : "—"} />
          <Campo
            rotulo="Dias restantes"
            valor={estado.dias === null ? "—" : String(estado.dias)}
            destaque={estado.dias !== null && estado.dias <= 10}
          />
        </dl>
      )}
      {estado.observacao && (
        <p className="mt-2.5 mb-0 text-[0.78rem] text-tinta-apagada">{estado.observacao}</p>
      )}
    </div>
  );
}

function Campo({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div>
      <dt className="text-[0.68rem] tracking-[0.08em] text-tinta-apagada uppercase">{rotulo}</dt>
      <dd className={`m-0 mt-0.5 text-[0.92rem] font-semibold ${destaque ? "text-atencao" : "text-tinta"}`}>
        {valor}
      </dd>
    </div>
  );
}

/**
 * QUAL COMPUTADOR É ESTE.
 *
 * A chave gruda numa máquina só, então "qual máquina" é a primeira pergunta de
 * todo chamado de suporte — e o nome do computador sozinho não serve, porque
 * gráfica tem três PCs chamados PC01. O código curto ao lado dele é o que
 * identifica a instalação sem ambiguidade, e por isso tem botão de copiar:
 * ditar doze caracteres por telefone é como o erro entra.
 */
function EstaMaquina({ estado }: { estado: EstadoDaLicenca | null }) {
  const [copiado, setCopiado] = useState(false);
  if (!estado) return null;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(estado.maquina);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* sem área de transferência: o código está na tela, dá para copiar à mão */
    }
  };

  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-3 rounded-[12px] border border-[var(--accent-line)] bg-[var(--accent-soft)] px-4 py-3">
      <div className="min-w-0">
        <p className="m-0 text-[0.68rem] tracking-[0.08em] text-tinta-apagada uppercase">
          Este computador — {estado.nomeDaMaquina}
        </p>
        <p className="mt-1 mb-0 font-mono text-[1.25rem] font-semibold tracking-[0.08em] text-ambar-claro">
          {estado.maquina}
        </p>
      </div>
      <button
        type="button"
        onClick={copiar}
        className="ml-auto flex items-center gap-2 rounded-[9px] border border-linha bg-painel px-3.5 py-2 text-[0.82rem] font-semibold text-tinta-fraca transition-colors hover:text-tinta"
      >
        <Icone referencia={copiado ? "icones.svg#check" : "icones.svg#copy"} className="size-4" />
        {copiado ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------ colar o token */

/**
 * O CAMPO DA CHAVE.
 *
 * A chave é ditada por telefone e digitada à mão por quem está instalando, e
 * o alfabeto dela já evita os símbolos que se confundem (o backend não usa
 * `0`, `O`, `1`, `I` nem `L`). O que sobra para a tela fazer é não atrapalhar:
 * ela mesma põe os hífens enquanto se digita, aceita colar com ou sem eles, e
 * não deixa passar minúscula.
 */
function ColarToken() {
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [ativado, setAtivado] = useState<EstadoDaLicenca | null>(null);

  const ativar = useCallback(async () => {
    if (!texto.trim()) return;
    setSalvando(true);
    setErro(null);
    try {
      const estado = await api.post<EstadoDaLicenca>("/licenca", { token: texto.trim() });
      setTexto("");
      /*
       * NADA de avisar a casca aqui, e isso não é esquecimento.
       *
       * O portão da licença (em `casca/Casca.tsx`) troca a tela inteira no
       * instante em que a licença fica boa — e, ao trocar, desmonta este
       * componente, levando a animação junto. Ela chegou a durar quatro
       * quadros até alguém reparar.
       *
       * Então a tela continua como está, a festa roda por cima de tudo, e a
       * recarga no fim dela é que traz o sistema liberado (ver `Ativacao`).
       */
      setAtivado(estado);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui ativar.");
      setSalvando(false);
    }
  }, [texto]);

  return (
    <div className="mt-4">
      {ativado && <Ativacao estado={ativado} />}

      <label className="block">
        <span className="mb-1.5 block text-[0.78rem] text-tinta-fraca">
          Cole aqui o token que o fornecedor mandou
        </span>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          spellCheck={false}
          placeholder="OPTMIZE1...."
          className="w-full resize-y rounded-[9px] border border-linha bg-painel-suave px-3 py-2 font-mono text-[0.76rem] break-all text-tinta outline-none placeholder:text-tinta-apagada focus:border-[var(--accent-line)]"
        />
      </label>

      {erro && (
        <p className="mt-2 mb-0 flex items-start gap-2 text-[0.8rem] text-alerta">
          <Icone referencia="icones.svg#triangle-alert" className="mt-0.5 size-4 shrink-0" />
          {erro}
        </p>
      )}

      <button
        type="button"
        onClick={ativar}
        disabled={salvando || !texto.trim()}
        className="mt-3 flex items-center gap-2 rounded-[9px] border border-ambar bg-ambar px-4 py-2 text-[0.85rem] font-semibold text-ambar-tinta transition-colors hover:bg-ambar-claro disabled:opacity-50"
      >
        <Icone referencia="icones.svg#shield-check" className="size-4" />
        {salvando ? "Conferindo..." : "Ativar"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------- a ativação */

/**
 * O MOMENTO EM QUE O PROGRAMA LIBERA.
 *
 * Ativar é a única coisa que esta tela faz, e acontece uma vez por ano numa
 * gráfica — quase sempre com alguém parado esperando, às vezes com o
 * fornecedor no telefone. Uma faixinha verde no canto não responde à pergunta
 * que a pessoa está fazendo ("deu certo? posso voltar a trabalhar?"); esta
 * tela responde, ocupando a janela inteira por dois segundos e meio.
 *
 * A ordem da animação conta uma história: o selo aparece, o traço do certo é
 * DESENHADO (não aparece pronto), as ondas saem dele, e só então o texto sobe
 * dizendo até quando. São 1,2s de encenação e mais um tempo de leitura antes
 * da recarga.
 *
 * E a recarga é obrigatória, não enfeite: a licença estava trancando a API
 * inteira, então cada tela precisa recomeçar sabendo que agora pode pedir. A
 * animação é o que transforma essa recarga técnica numa confirmação.
 */
function Ativacao({ estado }: { estado: EstadoDaLicenca }) {
  useEffect(() => {
    const relogio = window.setTimeout(() => window.location.reload(), 2500);
    return () => window.clearTimeout(relogio);
  }, []);

  return (
    <div
      role="status"
      className="licenca-veu fixed inset-0 z-100 grid place-items-center bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-6 backdrop-blur-md"
    >
      <div className="flex flex-col items-center text-center">
        <span className="relative grid size-[160px] shrink-0 place-items-center">
          {/* As ondas saindo do selo. Duas, defasadas. */}
          <span className="licenca-onda absolute inset-0 rounded-full border-2 border-ambar" />
          <span className="licenca-onda absolute inset-0 rounded-full border-2 border-ambar" style={{ animationDelay: "0.45s" }} />

          <span className="licenca-selo relative grid size-[104px] place-items-center rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] shadow-[0_24px_60px_-20px_var(--accent)]">
            <svg viewBox="0 0 52 52" className="size-[52px]" aria-hidden="true">
              <path
                className="licenca-risco"
                d="M14 27 l8 8 l16 -18"
                fill="none"
                stroke="var(--success)"
                strokeWidth="4.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </span>

        <p className="licenca-sobe mt-8 mb-0 font-titulo text-[1.6rem] leading-tight font-semibold tracking-[-0.03em] text-tinta">
          Programa liberado
        </p>

        <p className="licenca-sobe mt-2.5 mb-0 text-[0.92rem] text-tinta-fraca" style={{ animationDelay: "1.05s" }}>
          {estado.cliente}
          {estado.expira ? ` · até ${dataBr(estado.expira)}` : ""}
        </p>

        <p className="licenca-sobe mt-6 mb-0 text-[0.78rem] text-tinta-apagada" style={{ animationDelay: "1.35s" }}>
          Abrindo o sistema...
        </p>
      </div>
    </div>
  );
}
