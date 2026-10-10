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
import { Alternativa, BotaoPrincipal, Cabecalho, Campo, Porta } from "./Porta";

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
        <Alternativa pergunta="Lembrou a senha?" icone="icones.svg#arrow-left" onClick={aoVoltar}>
          Voltar ao login
        </Alternativa>
      }
    >
      <div className="flex flex-col gap-5">
        <Cabecalho
          titulo="Redefinir senha"
          subtitulo={
            passo === "email"
              ? "Vamos mandar um código de 6 números para o seu e-mail."
              : <>Se houver uma conta com <span className="text-tinta">{email}</span>, o código
                  chegou. Vale por 15 minutos — confira também o spam.</>
          }
        />

        {passo === "email" ? (
          <form onSubmit={mandarCodigo}>
            <fieldset disabled={enviando} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
              <Campo
                classe="entrada-degrau"
                rotulo="E-mail"
                icone="icones.svg#mail"
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@suaempresa.com"
              />

              <BotaoPrincipal icone="icones.svg#arrow-right" esperando={enviando}>
                {enviando ? "Mandando…" : "Mandar o código"}
              </BotaoPrincipal>
            </fieldset>
          </form>
        ) : (
          <form onSubmit={redefinir}>
            <fieldset disabled={enviando} className="m-0 flex min-w-0 flex-col gap-5 border-0 p-0">
              <Campo
                classe="entrada-degrau"
                rotulo="Código do e-mail"
                icone="icones.svg#badge-check"
                required
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="font-mono tracking-[0.4em]"
              />

              <Campo
                classe="entrada-degrau"
                rotulo="Senha nova"
                icone="icones.svg#lock"
                senha
                required
                minLength={8}
                autoComplete="new-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Crie uma senha"
                dica="Ao menos 8 caracteres."
              />

              <BotaoPrincipal icone="icones.svg#arrow-right" esperando={enviando} disabled={codigo.length !== 6}>
                {enviando ? "Trocando…" : "Trocar a senha"}
              </BotaoPrincipal>

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
