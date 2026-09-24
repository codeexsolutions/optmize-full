/**
 * ===========================================================================
 * RECUPERAR A SENHA — o código chega no e-mail, a senha nova é feita aqui
 * ===========================================================================
 *
 * Dois passos no mesmo cartão:
 *
 *   1. O E-MAIL. O backend manda um código de seis números para ele.
 *   2. O CÓDIGO E A SENHA NOVA. Conferiu, a senha troca e a pessoa volta ao
 *      login com o e-mail preenchido.
 *
 * Código, e não link: um link abriria o navegador para trocar a senha longe
 * do Optmize. Aqui a pessoa lê o e-mail, digita seis números e já entra.
 *
 * O passo 1 responde IGUAL com e sem conta ("se houver uma conta, o código
 * chegou") — é o backend que faz assim, para a tela não virar um jeito de
 * descobrir quem é cliente. Ver `services/password-reset.service.ts` no
 * optmize-backend.
 */

import { useState, type FormEvent } from "react";

import { alerta } from "../casca/Alerta";
import { Icone } from "../casca/Icone";
import { CAMPO, Porta, ROTULO } from "./Porta";

type Passo = "email" | "codigo";

async function pedir(rota: string, corpo: object): Promise<{ ok: boolean; mensagem: string }> {
  try {
    const resposta = await fetch(`/api/sessao/${rota}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    if (resposta.ok) return { ok: true, mensagem: "" };
    const dados = await resposta.json().catch(() => ({}));
    return { ok: false, mensagem: dados.message || "Não foi possível agora. Tente de novo." };
  } catch {
    return { ok: false, mensagem: "O Optmize não respondeu. Feche e abra o programa de novo." };
  }
}

export function RecuperarSenha({
  emailInicial,
  aoVoltar,
  aoRedefinir,
}: {
  emailInicial: string;
  aoVoltar: () => void;
  /** Senha trocada: volta ao login com o e-mail preenchido. */
  aoRedefinir: (email: string) => void;
}) {
  const [passo, setPasso] = useState<Passo>("email");
  const [email, setEmail] = useState(emailInicial);
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [senhaAberta, setSenhaAberta] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function mandarCodigo(evento?: FormEvent) {
    evento?.preventDefault();
    if (enviando) return;
    setEnviando(true);
    const { ok, mensagem } = await pedir("esqueci", { email });
    setEnviando(false);
    if (!ok) return void alerta.erro("Não foi possível mandar o código", mensagem);
    setCodigo("");
    setPasso("codigo");
  }

  async function redefinir(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    if (senha.length < 8) {
      return void alerta.erro("Senha curta", "A senha nova precisa ter ao menos 8 caracteres.");
    }
    setEnviando(true);
    const { ok, mensagem } = await pedir("redefinir", { email, codigo, senha });
    setEnviando(false);
    if (!ok) return void alerta.erro("Não foi possível trocar a senha", mensagem);
    void alerta.sucesso("Senha trocada", "Entre com a senha nova.");
    aoRedefinir(email.trim().toLowerCase());
  }

  return (
    <Porta
      rodape={
        <button
          type="button"
          onClick={aoVoltar}
          className="mt-5 flex w-full items-center justify-center gap-2 border-0 bg-transparent p-0 text-[13px] text-tinta-apagada transition-colors hover:text-ambar"
        >
          <Icone referencia="icones.svg#arrow-left" className="size-4" />
          Voltar ao login
        </button>
      }
    >
      <div className="flex flex-col gap-5">
        <header>
          <h2 className="m-0 font-titulo text-xl font-semibold text-tinta">Redefinir a senha</h2>
          <p className="mt-1.5 mb-0 text-[13px] leading-relaxed text-tinta-fraca">
            {passo === "email"
              ? "Mandamos um código de 6 números para o e-mail da sua conta."
              : <>Se houver uma conta com <strong className="text-tinta">{email}</strong>, o código
                  chegou. Ele vale por 15 minutos — confira também a caixa de spam.</>}
          </p>
        </header>

        {passo === "email" ? (
          <form onSubmit={mandarCodigo}>
            <fieldset disabled={enviando} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
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
                    autoFocus
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="E-mail"
                    className={CAMPO}
                  />
                </span>
              </label>

              <button type="submit" className="botao-entrar w-full gap-2 px-4 text-[15px]">
                <Icone
                  referencia={enviando ? "icones.svg#loader-circle" : "icones.svg#mail"}
                  className={`size-4${enviando ? " gira" : ""}`}
                />
                {enviando ? "Mandando…" : "Mandar o código"}
              </button>
            </fieldset>
          </form>
        ) : (
          <form onSubmit={redefinir}>
            <fieldset disabled={enviando} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
              <label className="flex flex-col gap-1.5">
                <span className={ROTULO}>Código do e-mail</span>
                <span className="relative flex items-center">
                  <Icone
                    referencia="icones.svg#badge-check"
                    className="pointer-events-none absolute left-3 size-4 text-tinta-apagada"
                  />
                  <input
                    required
                    autoFocus
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    className={`${CAMPO} font-mono tracking-[0.4em]`}
                  />
                </span>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className={ROTULO}>Senha nova</span>
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
                    placeholder="Senha nova"
                    className={`${CAMPO} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setSenhaAberta((v) => !v)}
                    title={senhaAberta ? "Esconder a senha" : "Mostrar a senha"}
                    aria-label={senhaAberta ? "Esconder a senha" : "Mostrar a senha"}
                    className="absolute right-2 grid size-8 place-items-center rounded-lg border-0 bg-transparent p-0 text-tinta-apagada transition-colors hover:text-ambar"
                  >
                    <Icone
                      referencia={senhaAberta ? "icones.svg#eye-off" : "icones.svg#eye"}
                      className="size-4"
                    />
                  </button>
                </span>
              </label>

              <button
                type="submit"
                disabled={codigo.length !== 6}
                className="botao-entrar w-full gap-2 px-4 text-[15px]"
              >
                <Icone
                  referencia={enviando ? "icones.svg#loader-circle" : "icones.svg#check"}
                  className={`size-4${enviando ? " gira" : ""}`}
                />
                {enviando ? "Trocando…" : "Trocar a senha"}
              </button>

              <button
                type="button"
                onClick={() => mandarCodigo()}
                className="-mt-1 self-center border-0 bg-transparent p-0 text-[12px] text-tinta-apagada transition-colors hover:text-ambar"
              >
                Não chegou? Mandar outro código
              </button>
            </fieldset>
          </form>
        )}
      </div>
    </Porta>
  );
}
