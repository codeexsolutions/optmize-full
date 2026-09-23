/**
 * ===========================================================================
 * ENTRAR — a porta do CodeEx Optmize
 * ===========================================================================
 *
 * O desenho é o do Optmize Lite (`features/auth/LoginPage.tsx`, lá no outro
 * repositório): duas colunas no computador — a marca e o que o programa faz à
 * esquerda, o cartão do formulário à direita —, brilhos no fundo e um fio de
 * luz no topo do cartão. Quem já viu o Lite reconhece a casa.
 *
 * A MOLDURA NÃO ESTÁ MAIS AQUI: as duas colunas, os brilhos e o cartão viraram
 * a `Porta` (`Porta.tsx`), porque o cadastro da empresa é a segunda tela de
 * quem ainda não entrou e tem de ser a mesma casa. O que sobrou neste arquivo
 * é o formulário de entrar.
 *
 * ---------------------------------------------------------------------------
 * O QUE NÃO VEIO JUNTO, E POR QUÊ
 * ---------------------------------------------------------------------------
 *
 * O Lite anima tudo com `framer-motion` e desenha os ícones com
 * `lucide-react`. Nenhuma das duas entra aqui:
 *
 *   as ANIMAÇÕES são CSS. São quatro entradas escalonadas e um tremor no
 *   erro — o que o framer-motion resolve elegantemente e o `@keyframes`
 *   resolve igual, sem 40 KB a mais dentro de um programa instalado;
 *
 *   os ÍCONES saem do sprite (`Icone`, com `icones.svg#nome`), que é como
 *   todo o resto do Full desenha ícone. Trazer os mesmos desenhos como
 *   componentes faria o programa ter duas maneiras de fazer a mesma coisa.
 *
 * As CORES também não vieram: `surface-*` e `brand-*` são do tema do Lite e
 * não existem aqui. O que existe são os tokens do Full (`tinta`, `painel`,
 * `linha`, `ambar`, em `estilo/tokens.css`), e é deles que sai cada cor
 * abaixo. É o que faz a tela de entrada parecer a mesma casa que o programa
 * que ela abre — copiar o hex do Lite daria uma porta de outro prédio.
 *
 * ---------------------------------------------------------------------------
 * O QUE ACONTECE AO ENTRAR
 * ---------------------------------------------------------------------------
 *
 * O formulário manda e-mail e senha para `/api/sessao/entrar`, que é o SERVIDOR
 * LOCAL — nunca direto para o backend. Quem conversa com o Railway é o Node,
 * e é lá que o token fica. Esta tela nunca vê token nenhum: ela recebe um
 * perfil e pronto. Ver o cabeçalho de `servidor/sessao.js`.
 */

import { useState } from "react";

import { Icone } from "../casca/Icone";
import { Cortina, CORTINA_MS } from "./Cortina";
import { CriarConta } from "./CriarConta";
import { Porta } from "./Porta";

export function Entrar({ aoEntrar }: { aoEntrar: () => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  /** Nome de quem entrou, enquanto a cortina está na tela. */
  const [entrando, setEntrando] = useState<string | null>(null);
  /** O olho da senha: ver o que se digitou poupa um telefonema. */
  const [senhaAberta, setSenhaAberta] = useState(false);
  /** O texto de "Esqueci a senha", que abre e fecha no mesmo botão. */
  const [ajudaDaSenha, setAjudaDaSenha] = useState(false);
  /** `true` enquanto a tela de cadastro da empresa está na frente. */
  const [cadastrando, setCadastrando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      const resposta = await fetch("/api/sessao/entrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), senha }),
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}));
        setErro(corpo.message || "Não foi possível entrar agora.");
        /*
          SOLTA O BOTÃO AQUI, e não num `finally`.

          Quem erra a senha tenta de novo na mesma tela, e sem isto o botão
          ficava "Entrando…" desabilitado para sempre — com o `if (enviando)`
          lá em cima barrando até o Enter. Só fechar e abrir o programa
          destravava.

          Um `finally` resolveria esta linha e quebraria a de cima: no
          sucesso o botão TEM de continuar travado, porque a cortina fica
          meio segundo na tela antes de a casca trocar, e um botão que volta
          a "Entrar" nesse intervalo convida a um segundo login.
        */
        setEnviando(false);
        return;
      }
      /*
        A CORTINA SOBE ANTES DE A CASCA TROCAR.

        O `aoEntrar()` faz a casca reler a sessão e desenhar o programa — e é
        justamente esse instante que a cortina existe para cobrir. Chamá-lo
        primeiro e mostrar a cortina depois seria cobrir uma espera que já
        aconteceu.

        O nome vem da própria resposta do login, então a cortina já abre
        dizendo de quem é a conta, sem uma segunda ida ao servidor.
      */
      const dados = await resposta.json().catch(() => null);
      setEntrando((dados && dados.perfil && dados.perfil.nome) || "");
      window.setTimeout(aoEntrar, CORTINA_MS);
      return;
    } catch {
      // O servidor local não respondeu — é o Optmize fechando, ou ainda
      // subindo. Distinto de senha errada, e o texto tem de dizer isso.
      setErro("O Optmize não respondeu. Feche e abra o programa de novo.");
      setEnviando(false);
    }
  }

  // A cortina cobre a tela inteira e FICA FORA do cartão: dentro dele, ela
  // sumiria junto com o formulário ao trocar de tela.
  if (entrando !== null) return <Cortina nome={entrando} />;

  /*
    O CADASTRO SUBSTITUI O LOGIN, em vez de abrir por cima dele.

    São dois caminhos que se excluem — ninguém cadastra e entra ao mesmo tempo
    —, e o cadastro é comprido: plano, empresa e conta do dono não caberiam num
    cartão flutuante sem rolagem dentro de rolagem.

    Ao terminar, a pessoa volta para cá COM O E-MAIL PREENCHIDO. O cadastro
    cria a conta; quem abre a sessão é o login. Entrar direto de lá exigiria um
    segundo caminho que grava sessão, e o dia em que um deles mudasse, o outro
    ficaria para trás.
  */
  if (cadastrando) {
    return (
      <CriarConta
        aoVoltar={() => setCadastrando(false)}
        aoCadastrar={(emailCriado) => {
          setEmail(emailCriado);
          setCadastrando(false);
        }}
      />
    );
  }

  return (
    <Porta
      rodape={
        <>
          {/*
            O CONVITE DE QUEM AINDA NÃO TEM CONTA.

            FORA do cartão e separado por um traço: dentro dele, viraria um
            quinto campo do formulário, e quem entra todo dia leria um botão a
            mais na altura do "Entrar". Aqui embaixo ele existe para quem
            procura, sem atrapalhar quem não procura.

            Este botão só passou a fazer sentido quando o Full ganhou plano sem
            mensalidade: antes, mandar alguém se cadastrar levaria a um
            pagamento que não destrava o programa instalado. Com o Padrão, o
            cadastro TERMINA em alguém trabalhando.
          */}
          <div className="mt-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-linha" />
            <span className="text-[10.5px] tracking-[1.4px] text-tinta-apagada uppercase">
              Ainda não tem conta?
            </span>
            <span className="h-px flex-1 bg-linha" />
          </div>

          <button
            type="button"
            onClick={() => setCadastrando(true)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--accent-line)] bg-[var(--accent-soft)] px-4 py-3 text-[14px] font-medium text-ambar transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]"
          >
            <Icone referencia="icones.svg#building-2" className="size-4" />
            Cadastrar a minha empresa
          </button>
        </>
      }
    >
      <form onSubmit={enviar} className="flex flex-col gap-5">
        <div className="entrada-degrau">
          <h2 className="m-0 font-titulo text-xl font-semibold text-tinta">Entrar</h2>
          <p className="mt-1 mb-0 text-[12px] text-tinta-apagada">
            Acesse sua conta para continuar
          </p>
        </div>

        {/*
          O ÍCONE FICA DENTRO DO CAMPO, absoluto, e o campo ganha recuo à
          esquerda para não escrever por cima dele. É por isso que o
          `<label>` é `relative` e o ícone `pointer-events-none`: sem
          isso, clicar no desenho não põe o cursor no campo, e o alvo de
          clique mais óbvio da linha seria justamente o pedaço morto.
        */}
        <label className="entrada-degrau flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-tinta-fraca">E-mail</span>
          <span className="relative flex items-center">
            <Icone
              referencia="icones.svg#mail"
              className="pointer-events-none absolute left-3 size-4 text-tinta-apagada"
            />
            <input
              type="email"
              autoComplete="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@empresa.com"
              className="w-full rounded-xl border border-linha bg-fundo py-3.5 pr-3 pl-10 text-[14px] text-tinta outline-none transition-[border-color,box-shadow] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
            />
          </span>
        </label>

        <label className="entrada-degrau flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-tinta-fraca">Senha</span>
          <span className="relative flex items-center">
            <Icone
              referencia="icones.svg#lock"
              className="pointer-events-none absolute left-3 size-4 text-tinta-apagada"
            />
            <input
              type={senhaAberta ? "text" : "password"}
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-linha bg-fundo py-3.5 pr-11 pl-10 text-[14px] text-tinta outline-none transition-[border-color,box-shadow] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
            />
            {/*
              O OLHO. Senha digitada errada às cegas é a causa mais comum
              de "não consigo entrar" — e no chão de fábrica, com teclado
              sujo e pressa, ver o que se escreveu poupa um telefonema.
            */}
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

        {erro && (
          <p
            role="alert"
            className="entrada-treme m-0 rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-[13px] text-[var(--danger)]"
          >
            {erro}
          </p>
        )}

        {/*
          ESQUECI A SENHA — acima do botão e à esquerda.

          Acima porque a ordem de leitura é a ordem em que a dúvida
          aparece: quem não lembra a senha percebe isso ANTES de tentar
          entrar, não depois. E à esquerda, alinhado com os rótulos dos
          campos, porque ele pertence ao campo de senha logo acima — no
          centro, ele flutuava entre o formulário e o botão sem pertencer
          a nenhum dos dois.

          ELE NÃO MANDA E-MAIL, e o texto que abre diz isso sem rodeio:
          não existe rota de redefinição no backend. Quem troca a senha é
          o dono, pelo painel. Prometer um e-mail que nunca chega faria a
          pessoa esperar em vez de resolver.
        */}
        <button
          type="button"
          onClick={() => setAjudaDaSenha((v) => !v)}
          className="entrada-degrau -mt-1 self-start border-0 bg-transparent p-0 text-[12px] text-tinta-apagada transition-colors hover:text-ambar"
        >
          Esqueci a senha
        </button>

        <button
          type="submit"
          disabled={enviando}
          /*
            `botao-entrar`, e NÃO `btn primary`: aquela classe vive em
            `:where(.producao)`, e esta tela não está dentro da produção
            — o botão ficava sem estilo nenhum. Ver `estilo/entrada.css`.
          */
          className="entrada-degrau botao-entrar mt-1 w-full gap-2 px-4 text-[15px]"
        >
          <Icone referencia="icones.svg#log-in" className="size-4" />
          {enviando ? "Entrando…" : "Entrar"}
        </button>

        {ajudaDaSenha && (
          <div className="entrada-treme rounded-xl border border-linha bg-fundo/60 px-3.5 py-3">
            <p className="m-0 text-[12.5px] leading-relaxed text-tinta-fraca">
              Quem redefine a sua senha é <strong className="font-semibold text-tinta">o
              dono da conta da sua empresa</strong>, pelo painel web —
              não há envio de e-mail.
            </p>
            <p className="mt-1.5 mb-0 text-[12px] leading-relaxed text-tinta-apagada">
              Se você é o dono e perdeu a senha, fale com a CodeEx
              Solutions pelo <span className="font-mono">@codeexsolutions</span>.
            </p>
          </div>
        )}
      </form>
    </Porta>
  );
}
