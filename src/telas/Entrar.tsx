/**
 * ===========================================================================
 * ENTRAR — a porta do CodeEx Optmize
 * ===========================================================================
 *
 * O desenho é o do painel web (`features/auth/LoginPage.tsx`, lá no outro
 * repositório): duas colunas no computador — a marca e o que o programa faz à
 * esquerda, o cartão do formulário à direita —, brilhos no fundo e um fio de
 * luz no topo do cartão. Quem já viu o painel web reconhece a casa.
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
 * O painel web anima tudo com `framer-motion` e desenha os ícones com
 * `lucide-react`. Nenhuma das duas entra aqui:
 *
 *   as ANIMAÇÕES são CSS. São quatro entradas escalonadas e um tremor no
 *   erro — o que o framer-motion resolve elegantemente e o `@keyframes`
 *   resolve igual, sem 40 KB a mais dentro de um programa instalado;
 *
 *   os ÍCONES saem do sprite (`Icone`, com `icones.svg#nome`), que é como
 *   todo o resto do programa desenha ícone. Trazer os mesmos desenhos como
 *   componentes faria o programa ter duas maneiras de fazer a mesma coisa.
 *
 * As CORES também não vieram: `surface-*` e `brand-*` são do tema do painel web e
 * não existem aqui. O que existe são os tokens daqui (`tinta`, `painel`,
 * `linha`, `ambar`, em `estilo/tokens.css`), e é deles que sai cada cor
 * abaixo. É o que faz a tela de entrada parecer a mesma casa que o programa
 * que ela abre — copiar o hex do painel web daria uma porta de outro prédio.
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

import { useEffect, useState } from "react";

import { alerta } from "../casca/Alerta";
import { encerrarEntrada, tocarEntrada } from "./Entrada";
import { CriarConta } from "./CriarConta";
import { RecuperarSenha } from "./RecuperarSenha";
import { Alternativa, BotaoPrincipal, Cabecalho, Campo, mascararDocumento, Porta } from "./Porta";
import { usePlanos } from "../estado/planos";

export function Entrar({
  aoEntrar,
  aviso = null,
}: {
  aoEntrar: () => void;
  /**
   * Por que a conta saiu desta máquina sem a pessoa clicar em "Sair" — outra
   * máquina entrou na conta, ou o acesso foi retirado. Vem do servidor local.
   */
  aviso?: string | null;
}) {
  /*
    O DOCUMENTO DA EMPRESA — CNPJ ou CPF — É O PRIMEIRO CAMPO.

    Ele responde DE QUAL EMPRESA é este acesso, e essa é a primeira pergunta
    numa máquina de chão de fábrica: a mesma pessoa cuida de duas gráficas, o
    mesmo computador atende dois turnos. O e-mail diz quem é; o documento diz
    onde. O servidor confere os dois juntos e recusa a conta que não for
    daquela empresa.
  */
  const [documento, setDocumento] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  /** O cartão se desfazendo, enquanto a entrada no programa acende. */
  const [consumindo, setConsumindo] = useState(false);

  /*
    OS PLANOS JÁ SÃO PEDIDOS AQUI, enquanto a pessoa ainda está no login. Se
    ela for criar conta, a lista chega pronta ao cadastro em vez de mostrar
    "Buscando os planos…". Ver `estado/planos.ts`.
  */
  const carregarPlanos = usePlanos((e) => e.carregar);
  useEffect(() => { carregarPlanos(); }, [carregarPlanos]);

  /** `true` enquanto a tela de redefinir a senha está na frente. */
  const [recuperando, setRecuperando] = useState(false);
  /** `true` enquanto a tela de cadastro da empresa está na frente. */
  const [cadastrando, setCadastrando] = useState(false);

  /*
    QUEM ACABOU DE SAIR DA CONTA chega aqui com o "Até logo" ainda na tela: a
    camada fica no ar até existir o que revelar, e o que revelar é esta tela.
    Um quadro depois de montar, para o login já estar pintado atrás. Na
    abertura normal do programa não há camada nenhuma, e isto não faz nada.
  */
  useEffect(() => {
    const quadro = requestAnimationFrame(() => encerrarEntrada());
    return () => cancelAnimationFrame(quadro);
  }, []);

  // Quem foi tirado da conta precisa saber por quê, senão parece defeito.
  useEffect(() => {
    if (aviso) void alerta.erro("Você saiu da conta nesta máquina", aviso);
  }, [aviso]);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    setEnviando(true);
    try {
      const resposta = await fetch("/api/sessao/entrar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documento,
          email: email.trim().toLowerCase(),
          senha,
        }),
      });
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}));
        void alerta.erro("Não foi possível entrar", corpo.message || "Tente de novo em instantes.");
        /*
          SOLTA O BOTÃO AQUI, e não num `finally`.

          Quem erra a senha tenta de novo na mesma tela, e sem isto o botão
          ficava "Entrando…" desabilitado para sempre — com o `if (enviando)`
          lá em cima barrando até o Enter. Só fechar e abrir o programa
          destravava.

          Um `finally` resolveria esta linha e quebraria a de cima: no
          sucesso o botão TEM de continuar travado, porque a entrada leva
          dois segundos antes de a casca trocar, e um botão que volta a
          "Entrar" nesse intervalo convida a um segundo login.
        */
        setEnviando(false);
        return;
      }
      /*
        A ENTRADA ACENDE ANTES DE A CASCA TROCAR.

        Não há mais a tela "Bom trabalho": a espera aconteceu aqui dentro, no
        botão girando. O que vem agora é a passagem do Flow — o cartão se
        desfaz, o nome aparece — e só quando ela termina o `aoEntrar()` faz a
        casca reler a sessão e desenhar o programa. A camada da entrada
        continua na tela até a casca avisar que montou (ver `Entrada.tsx`).

        O nome vem da própria resposta do login, sem segunda ida ao servidor.
      */
      const dados = await resposta.json().catch(() => null);
      setConsumindo(true);
      await tocarEntrada((dados && dados.perfil && dados.perfil.nome) || "");
      aoEntrar();
      return;
    } catch {
      // O servidor local não respondeu — é o Optmize fechando, ou ainda
      // subindo. Distinto de senha errada, e o texto tem de dizer isso.
      void alerta.erro("O Optmize não respondeu", "Feche e abra o programa de novo.");
      setEnviando(false);
    }
  }

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
  /*
    ESQUECI A SENHA substitui o login do mesmo jeito que o cadastro: o código
    chega no e-mail, a senha troca lá, e a pessoa volta com o e-mail preenchido.
  */
  if (recuperando) {
    return (
      <RecuperarSenha
        emailInicial={email}
        aoVoltar={() => setRecuperando(false)}
        aoRedefinir={(emailDaConta) => {
          setEmail(emailDaConta);
          setSenha("");
          setRecuperando(false);
        }}
      />
    );
  }

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
      consumido={consumindo}
      rodape={
        /*
          O CONVITE DE QUEM AINDA NÃO TEM CONTA.

          Este botão só passou a fazer sentido quando o programa ganhou plano
          sem mensalidade: antes, mandar alguém se cadastrar levaria a um
          pagamento que não destrava o programa instalado. Com o Padrão, o
          cadastro TERMINA em alguém trabalhando.
        */
        <Alternativa
          pergunta="Ainda não tem conta?"
          icone="icones.svg#building-2"
          onClick={() => setCadastrando(true)}
        >
          Cadastrar a minha empresa
        </Alternativa>
      }
    >
      <form onSubmit={enviar}>
        {/*
          O "ENTRANDO" ACONTECE AQUI DENTRO, como no optmize-lite: o botão
          gira e os campos travam enquanto o servidor confere a senha. O
          `fieldset` desliga os campos todos de uma vez, sem um `disabled`
          em cada um.
        */}
        <fieldset disabled={enviando} className="m-0 flex min-w-0 flex-col gap-6 border-0 p-0">
          <Cabecalho titulo="Entrar" />

          <Campo
            classe="entrada-degrau"
            rotulo="CNPJ ou CPF"
            icone="icones.svg#file-text"
            inputMode="numeric"
            required
            autoFocus
            value={documento}
            onChange={(e) => setDocumento(mascararDocumento(e.target.value))}
            placeholder="00.000.000/0000-00"
            className="font-mono placeholder:font-texto"
          />

          <Campo
            classe="entrada-degrau"
            rotulo="E-mail"
            icone="icones.svg#mail"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@suaempresa.com"
          />

          {/*
            A SENHA COM O "ESQUECI" NA MESMA ALTURA DO RÓTULO, à direita: ele
            pertence a este campo, e quem não lembra a senha percebe isso
            ANTES de tentar entrar. Manda um código para o e-mail e abre a tela
            de redefinir (`RecuperarSenha.tsx`), já com o e-mail digitado aqui.
          */}
          <Campo
            classe="entrada-degrau"
            rotulo="Senha"
            icone="icones.svg#lock"
            senha
            autoComplete="current-password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Sua senha"
            acessorio={
              <button
                type="button"
                onClick={() => setRecuperando(true)}
                className="border-0 bg-transparent p-0 text-[12px] text-tinta-apagada transition-colors hover:text-ambar"
              >
                Esqueci a senha
              </button>
            }
          />

          <BotaoPrincipal icone="icones.svg#arrow-right" esperando={enviando} disabled={enviando} className="mt-2">
            {enviando ? "Entrando…" : "Entrar"}
          </BotaoPrincipal>
        </fieldset>
      </form>
    </Porta>
  );
}
