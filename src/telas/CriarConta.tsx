/**
 * ===========================================================================
 * CRIAR CONTA — a empresa se cadastra pelo próprio programa
 * ===========================================================================
 *
 * Quem baixa e instala o Optmize cria a empresa aqui, sem passar por ninguém:
 * o plano, os dados da gráfica e a conta do dono. É o que faz o plano Padrão
 * existir de verdade — um plano sem mensalidade que dependesse de alguém
 * liberar à mão não seria autoatendimento, seria formulário de contato.
 *
 * ---------------------------------------------------------------------------
 * A MESMA CASA DO LOGIN, COM O PLANO DENTRO
 * ---------------------------------------------------------------------------
 *
 * Esta tela usa a `Porta` — as mesmas duas colunas, o mesmo cartão e os mesmos
 * brilhos do `Entrar`. Antes ela era uma página de rolagem, larga e sem coluna
 * nenhuma, e o clique em "Cadastrar a minha empresa" mudava de prédio no meio
 * da frase: a pessoa tinha de reconhecer o programa de novo, no momento em que
 * estava decidindo se ficava.
 *
 * O que muda dentro do cartão é só o miolo — e a primeira coisa dele é a
 * ESCOLHA DO PLANO. Escolher depois de preencher faria a pessoa digitar CNPJ e
 * senha para só então descobrir que o caminho que ela queria custa R$ 3.500,00.
 * A escolha muda o que acontece no fim — o Padrão entra valendo na hora, o
 * pago fica esperando o acerto —, então ela pertence ao começo.
 *
 * ---------------------------------------------------------------------------
 * O QUE ESTA TELA NÃO DECIDE
 * ---------------------------------------------------------------------------
 *
 * Nada. Ela desenha o que `/api/sessao/planos` devolve e manda o que a pessoa
 * escreveu para `/api/sessao/cadastrar`. Quem confere o CNPJ, recusa empresa
 * repetida e sabe quanto cada plano custa é o servidor — repetir qualquer
 * dessas regras aqui criaria uma segunda verdade, e é sempre a segunda que
 * fica desatualizada. Nem o preço é escrito neste arquivo.
 */

import { useEffect, useState } from "react";

import { Icone } from "../casca/Icone";
import { CAMPO, GRUPO, Porta, ROTULO } from "./Porta";

interface Plano {
  id: string;
  nome: string;
  descricao: string;
  precoCentavos: number;
  moeda: string;
  cobranca: "mensal" | "anual" | "creditos";
  vantagens: string[];
  acessos: number;
}

/** O preço como se lê em português, com a periodicidade junto. */
function precoDoPlano(plano: Plano): string {
  if (plano.cobranca === "creditos") return "Sem mensalidade";
  const valor = (plano.precoCentavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: plano.moeda || "BRL",
  });
  return plano.cobranca === "anual" ? `${valor} por ano` : `${valor} por mês`;
}

/**
 * O CNPJ com máscara enquanto se digita.
 *
 * A máscara é só da TELA: o que viaja é o que a pessoa escreveu, e quem
 * normaliza e confere os dígitos verificadores é o servidor (`domain/cnpj.ts`).
 * Conferir aqui também daria duas respostas para a mesma pergunta no dia em
 * que uma das duas mudasse.
 */
function mascararCnpj(texto: string): string {
  const d = texto.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function CriarConta({
  aoVoltar,
  aoCadastrar,
}: {
  aoVoltar: () => void;
  /** Leva ao login com o e-mail já preenchido. */
  aoCadastrar: (email: string) => void;
}) {
  const [planos, setPlanos] = useState<Plano[] | null>(null);
  const [escolhido, setEscolhido] = useState<string | null>(null);

  const [nomeEmpresa, setNomeEmpresa] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [nomeDono, setNomeDono] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  /** O olho da senha, igual ao do login: ver o que se digitou poupa um erro. */
  const [senhaAberta, setSenhaAberta] = useState(false);

  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState<{ liberado: boolean } | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/sessao/planos")
      .then((r) => r.json())
      .then((dados: { planos?: Plano[] }) => {
        if (!vivo) return;
        const lista = dados.planos ?? [];
        setPlanos(lista);
        /*
          O PADRÃO JÁ VEM MARCADO. É o caminho sem cartão e sem compromisso, e
          é o que alguém que acabou de instalar o programa quer experimentar —
          deixar tudo desmarcado obrigaria um clique a mais antes do primeiro
          campo, para chegar na escolha que a maioria faria de qualquer jeito.
        */
        const padrao = lista.find((p) => p.cobranca === "creditos");
        setEscolhido(padrao?.id ?? lista[0]?.id ?? null);
      })
      .catch(() => vivo && setPlanos([]));
    return () => { vivo = false; };
  }, []);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando || !escolhido) return;
    setErro(null);
    setEnviando(true);
    try {
      const resposta = await fetch("/api/sessao/cadastrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa: { nome: nomeEmpresa.trim(), cnpj },
          dono: { nome: nomeDono.trim(), email: email.trim().toLowerCase(), senha },
          plano: escolhido,
        }),
      });
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) {
        setErro(dados.message || "Não foi possível criar a conta agora.");
        return;
      }
      setPronto({ liberado: Boolean(dados.liberado) });
    } catch {
      setErro("O Optmize não respondeu. Feche e abra o programa de novo.");
    } finally {
      setEnviando(false);
    }
  }

  /*
    A TELA DE PRONTO OCUPA O CARTÃO INTEIRO, e não é um aviso verde embaixo do
    formulário: o que vem depois muda conforme o plano — o Padrão já pode
    entrar, o pago precisa acertar o pagamento — e essa diferença é a
    informação mais importante do momento. No pé de um formulário preenchido,
    ela passaria despercebida.
  */
  if (pronto) {
    return (
      <Porta>
        <div className="text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl border border-[var(--accent-line)] bg-[var(--accent-soft)]">
            <Icone referencia="icones.svg#badge-check" className="size-7 text-ambar" />
          </span>
          <h2 className="mt-4 mb-0 font-titulo text-xl font-semibold text-tinta">
            Conta criada
          </h2>
          <p className="mt-2 mb-0 text-[13.5px] leading-relaxed text-tinta-fraca">
            {pronto.liberado
              ? "Sua empresa está cadastrada e já pode trabalhar. Entre com o e-mail e a senha que você acabou de escolher."
              : "Sua empresa está cadastrada. Para liberar o plano escolhido falta acertar o pagamento — fale com a CodeEx Solutions pelo @codeexsolutions."}
          </p>
          <button
            type="button"
            onClick={() => aoCadastrar(email.trim().toLowerCase())}
            className="botao-entrar mt-6 w-full gap-2 px-4 text-[15px]"
          >
            <Icone referencia="icones.svg#log-in" className="size-4" />
            Ir para o login
          </button>
        </div>
      </Porta>
    );
  }

  return (
    <Porta
      rodape={
        /*
          A VOLTA FICA FORA DO CARTÃO, no mesmo lugar em que o login põe o
          convite para cadastrar: é o caminho de saída desta tela, e dentro do
          cartão ele viraria mais um controle do formulário.
        */
        <button
          type="button"
          onClick={aoVoltar}
          className="mt-5 flex w-full items-center justify-center gap-2 border-0 bg-transparent p-0 text-[13px] text-tinta-apagada transition-colors hover:text-ambar"
        >
          <Icone referencia="icones.svg#arrow-left" className="size-4" />
          Já tenho conta — voltar ao login
        </button>
      }
    >
      <form onSubmit={enviar} className="flex flex-col gap-5">
        <div className="entrada-degrau">
          <h2 className="m-0 font-titulo text-xl font-semibold text-tinta">
            Cadastrar a sua empresa
          </h2>
          <p className="mt-1 mb-0 text-[12px] text-tinta-apagada">
            Leva um minuto. Depois é só entrar e começar a encaixar.
          </p>
        </div>

        {/* ── O plano ───────────────────────────────────────────────────── */}
        <fieldset className="entrada-degrau m-0 border-0 p-0">
          <legend className={GRUPO}>Como você quer pagar</legend>

          {planos === null && (
            <p className="mt-3 mb-0 text-[13px] text-tinta-apagada">Buscando os planos…</p>
          )}
          {planos?.length === 0 && (
            <p className="mt-3 mb-0 text-[12.5px] leading-relaxed text-tinta-apagada">
              Não foi possível buscar os planos. Confira a internet e abra o
              programa de novo.
            </p>
          )}

          <div className="mt-3 flex flex-col gap-2">
            {(planos ?? []).map((plano) => {
              const marcado = escolhido === plano.id;
              return (
                <label
                  key={plano.id}
                  className={[
                    "flex cursor-pointer gap-2.5 rounded-xl border p-3.5 transition-colors",
                    marcado
                      ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                      : "border-linha bg-fundo hover:border-[var(--accent-line)]",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="plano"
                    value={plano.id}
                    checked={marcado}
                    onChange={() => setEscolhido(plano.id)}
                    className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <span className="font-titulo text-[14px] font-semibold text-tinta">
                        {plano.nome}
                      </span>
                      <span
                        className={`font-mono text-[12px] ${marcado ? "text-ambar" : "text-tinta-fraca"}`}
                      >
                        {precoDoPlano(plano)}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-relaxed text-tinta-fraca">
                      {plano.descricao}
                    </span>
                    {/*
                      AS VANTAGENS SÓ APARECEM NO PLANO MARCADO. Abertas nos
                      três, a lista tomaria o cartão inteiro e a escolha —
                      que é a pergunta desta parte da tela — sairia da vista.
                    */}
                    {marcado && (
                      <ul className="mt-2 mb-0 flex list-none flex-col gap-1 p-0">
                        {plano.vantagens.map((v) => (
                          <li
                            key={v}
                            className="flex items-start gap-2 text-[12px] leading-relaxed text-tinta-fraca"
                          >
                            <Icone
                              referencia="icones.svg#check"
                              className="mt-0.5 size-3.5 shrink-0 text-ambar"
                            />
                            {v}
                          </li>
                        ))}
                      </ul>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* ── A empresa ─────────────────────────────────────────────────── */}
        <fieldset className="entrada-degrau m-0 flex flex-col gap-4 border-0 p-0">
          <legend className={GRUPO}>A empresa</legend>

          <label className="mt-3 flex flex-col gap-1.5">
            <span className={ROTULO}>Nome da empresa</span>
            <span className="relative flex items-center">
              <Icone
                referencia="icones.svg#building-2"
                className="pointer-events-none absolute left-3 size-4 text-tinta-apagada"
              />
              <input
                required
                maxLength={200}
                value={nomeEmpresa}
                onChange={(e) => setNomeEmpresa(e.target.value)}
                placeholder="Theory Printer"
                className={CAMPO}
              />
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={ROTULO}>CNPJ</span>
            <span className="relative flex items-center">
              <Icone
                referencia="icones.svg#file-text"
                className="pointer-events-none absolute left-3 size-4 text-tinta-apagada"
              />
              <input
                required
                inputMode="numeric"
                value={cnpj}
                onChange={(e) => setCnpj(mascararCnpj(e.target.value))}
                placeholder="00.000.000/0000-00"
                className={`${CAMPO} font-mono`}
              />
            </span>
            <span className="text-[11.5px] leading-relaxed text-tinta-apagada">
              É por ele que a nota é emitida, e é o que impede a sua empresa
              ser cadastrada duas vezes.
            </span>
          </label>
        </fieldset>

        {/* ── O dono ────────────────────────────────────────────────────── */}
        <fieldset className="entrada-degrau m-0 flex flex-col gap-4 border-0 p-0">
          <legend className={GRUPO}>A sua conta</legend>

          <p className="mt-3 mb-0 text-[12px] leading-relaxed text-tinta-apagada">
            Esta é a conta do dono: é ela que cria os acessos dos designers e
            abre o painel da empresa.
          </p>

          <label className="flex flex-col gap-1.5">
            <span className={ROTULO}>Seu nome</span>
            <span className="relative flex items-center">
              <Icone
                referencia="icones.svg#users"
                className="pointer-events-none absolute left-3 size-4 text-tinta-apagada"
              />
              <input
                required
                maxLength={200}
                value={nomeDono}
                onChange={(e) => setNomeDono(e.target.value)}
                placeholder="Maria Silva"
                className={CAMPO}
              />
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={ROTULO}>E-mail</span>
            <span className="relative flex items-center">
              <Icone
                referencia="icones.svg#mail"
                className="pointer-events-none absolute left-3 size-4 text-tinta-apagada"
              />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com"
                className={CAMPO}
              />
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={ROTULO}>Senha</span>
            <span className="relative flex items-center">
              <Icone
                referencia="icones.svg#lock"
                className="pointer-events-none absolute left-3 size-4 text-tinta-apagada"
              />
              <input
                type={senhaAberta ? "text" : "password"}
                required
                minLength={8}
                autoComplete="new-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Ao menos 8 caracteres"
                className={`${CAMPO} pr-11`}
              />
              <button
                type="button"
                onClick={() => setSenhaAberta((v) => !v)}
                title={senhaAberta ? "Esconder a senha" : "Mostrar a senha"}
                aria-label={senhaAberta ? "Esconder a senha" : "Mostrar a senha"}
                className="absolute right-2 grid size-7 place-items-center rounded-md text-tinta-apagada transition-colors hover:text-tinta"
              >
                <Icone
                  referencia={senhaAberta ? "icones.svg#eye-off" : "icones.svg#eye"}
                  className="size-4"
                />
              </button>
            </span>
          </label>
        </fieldset>

        {erro && (
          <p
            role="alert"
            className="entrada-treme m-0 rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-[13px] text-[var(--danger)]"
          >
            {erro}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando || !escolhido}
          className="entrada-degrau botao-entrar mt-1 w-full gap-2 px-4 text-[15px]"
        >
          <Icone referencia="icones.svg#building-2" className="size-4" />
          {enviando ? "Criando…" : "Criar conta da empresa"}
        </button>
      </form>
    </Porta>
  );
}
