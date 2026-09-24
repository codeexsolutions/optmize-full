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
 * ---------------------------------------------------------------------------
 * DOIS PASSOS: O PLANO, DEPOIS OS DADOS
 * ---------------------------------------------------------------------------
 *
 * Tudo cabia num cartão só, e era justamente o problema: três planos abertos
 * mais seis campos davam uma coluna que rolava duas telas, em que a escolha
 * do plano — a única decisão real desta página — ficava no topo, fora da
 * vista, enquanto a pessoa digitava.
 *
 * O PLANO VEM PRIMEIRO, e não por gosto de assistente: ele muda o que
 * acontece no fim. O Padrão entra valendo na hora; o pago fica esperando o
 * acerto. Escolher depois de preencher faria alguém digitar CNPJ e senha para
 * só então descobrir que o caminho que queria custa R$ 3.500,00.
 *
 * Cada passo cabe na tela, e o de cima diz onde a pessoa está. O que a pessoa
 * já escolheu viaja com ela para o segundo passo, num resumo de uma linha com
 * o caminho de volta dentro — voltar não apaga nada, porque os dois passos são
 * o mesmo estado, e não duas telas.
 *
 * ---------------------------------------------------------------------------
 * SEM TEXTO DE APOIO, MAS COM EXEMPLO DENTRO DO CAMPO
 * ---------------------------------------------------------------------------
 *
 * Cada campo diz o que espera, na primeira pessoa de quem preenche: "seu
 * e-mail aqui", "crie uma senha aqui". O rótulo em cima nomeia, o exemplo
 * dentro CONVIDA — e num cadastro que a gráfica faz uma vez na vida, o convite
 * vale o custo conhecido do `placeholder`, que é sumir no primeiro caractere.
 *
 * Já as explicações DEBAIXO dos campos saíram, e essas não voltam. "É por ele
 * que a nota é emitida", "esta é a conta do dono": cada uma era verdade e
 * nenhuma era pergunta. Quem preenche um cadastro de cinco campos não está
 * lendo — está procurando o próximo campo, e três parágrafos no caminho são
 * três paradas.
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
import AliceCarousel from "react-alice-carousel";
import { Check, Printer, Ruler, Users } from "lucide-react";

import "react-alice-carousel/lib/alice-carousel.css";

import { Icone } from "../casca/Icone";
import { CAMPO, mascararDocumento, Porta, ROTULO } from "./Porta";
import { useErroEmAlerta } from "../casca/Alerta";

/** Em qual dos dois passos a pessoa está. */
type Passo = "plano" | "dados";

/**
 * A METRAGEM DO PLANO, em uma linha.
 *
 * É o que a gráfica está comprando: quantos metros de tecido ela pode mandar
 * para a impressora antes de o saldo acabar. Encaixar é de graça e não entra
 * nessa conta — o que desconta é o arquivo que vai para a produção.
 */
function metragemDoPlano(plano: Plano): string {
  if (plano.metrosPorPeriodo === null) return "Metragem sem limite";
  const quando =
    plano.periodoDaCota === "mensal"
      ? "por mês"
      : plano.periodoDaCota === "semanal"
        ? "por semana"
        : "por dia";
  return `${plano.metrosPorPeriodo.toLocaleString("pt-BR")} metros ${quando}`;
}

/** Centavos como se lê em português: R$ 3.500,00. */
function emReais(centavos: number, moeda: string): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: moeda || "BRL",
  });
}

interface Plano {
  id: string;
  nome: string;
  descricao: string;
  precoCentavos: number;
  moeda: string;
  cobranca: "mensal" | "anual" | "creditos";
  vantagens: string[];
  acessos: number;
  /** A metragem do plano, em metros por período. `null` = sem teto. */
  metrosPorPeriodo: number | null;
  /** De quanto em quanto tempo ela volta a encher. */
  periodoDaCota: "diario" | "semanal" | "mensal";
  /** Dias de teste; `0` = sem teste. Quem decide é o catálogo, não a tela. */
  diasDeTeste: number;
}

/** O nome sem o prefixo da marca: "Completo", "Licença anual". */
function nomeCurto(plano: Plano): string {
  return plano.nome.replace(/^CodeEx Optmize — /, "");
}

/**
 * O preço em DUAS PARTES: o número e a periodicidade.
 *
 * Numa linha só — "R$ 3.500,00 por ano" — o olho lê a frase inteira para
 * achar o valor, e a comparação entre três planos vira leitura de três
 * frases. Separados, os três números ficam alinhados na mesma coluna, no
 * mesmo tamanho, e a escolha se faz de relance.
 */
function precoDoPlano(plano: Plano): { valor: string; periodo: string } {
  if (plano.cobranca === "creditos") {
    return { valor: "Sem mensalidade", periodo: "recarga quando quiser" };
  }
  return {
    valor: emReais(plano.precoCentavos, plano.moeda),
    periodo: plano.cobranca === "anual" ? "por ano" : "por mês",
  };
}

/**
 * Quanto a licença anual economiza contra doze meses da mensal.
 *
 * CALCULADO A PARTIR DOS DOIS PREÇOS QUE O SERVIDOR MANDOU, e não escrito à
 * mão: "42% a menos" é verdade hoje, com R$ 499,90 e R$ 3.500,00. No dia em
 * que o painel mudar um dos dois, um número fixo aqui viraria propaganda
 * enganosa numa tela de cadastro — e ninguém lembraria de vir corrigir.
 *
 * `null` quando não há o que comparar ou quando o anual não sai mais barato:
 * nesse caso o selo simplesmente não aparece.
 */
function economiaDoAnual(planos: Plano[]): number | null {
  /*
    COMPARA COM O MENSAL MAIS CARO, e não com o primeiro que aparecer.

    A licença anual é a versão de doze meses do COMPLETO, e desde que a escada
    ganhou degraus mais baratos o "primeiro mensal da lista" passou a ser o
    Essencial — contra ele o anual sai mais CARO, e o selo simplesmente sumia
    da tela sem ninguém entender por quê.
  */
  const mensal = planos
    .filter((p) => p.cobranca === "mensal")
    .sort((a, b) => b.precoCentavos - a.precoCentavos)[0];
  const anual = planos.find((p) => p.cobranca === "anual");
  if (!mensal || !anual || mensal.precoCentavos <= 0) return null;
  const dozeMeses = mensal.precoCentavos * 12;
  if (anual.precoCentavos >= dozeMeses) return null;
  return Math.round((1 - anual.precoCentavos / dozeMeses) * 100);
}

/**
 * O telefone com máscara enquanto se digita — (11) 99999-9999.
 *
 * Pela mesma razão do CNPJ: a máscara é só da TELA. O que viaja é o que a
 * pessoa escreveu, e quem tira a pontuação, corta o +55 colado do WhatsApp e
 * confere o DDD é o servidor (`domain/telefone.ts`).
 *
 * Aceita até onze dígitos: celular tem nove depois do DDD, fixo tem oito, e o
 * campo serve aos dois — gráfica pequena cadastra o fixo do balcão.
 */
function mascararTelefone(texto: string): string {
  const d = texto.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * A TRILHA DOS DOIS PASSOS.
 *
 * Dois números e um fio entre eles. Existe para responder "quanto falta" sem
 * gastar uma frase: num cadastro de duas telas, a pergunta que faz alguém
 * desistir não é "o que é isto", é "isto acaba?".
 *
 * O passo já cumprido vira um certo, e não continua sendo o número 1: o que
 * ficou para trás não é mais uma etapa a fazer, é uma decisão tomada.
 */
function Trilha({ passo }: { passo: Passo }) {
  const noPlano = passo === "plano";
  const marca = (ativo: boolean, pronto: boolean) =>
    [
      "grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold transition-colors",
      pronto
        ? "border-[var(--accent)] bg-[var(--accent)] text-fundo"
        : ativo
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-ambar"
          : "border-linha bg-fundo text-tinta-apagada",
    ].join(" ");

  return (
    <div className="flex items-center gap-2.5">
      <span className={marca(noPlano, !noPlano)}>
        {noPlano ? "1" : <Icone referencia="icones.svg#check" className="size-3.5" />}
      </span>
      <span className={`text-[12px] ${noPlano ? "text-tinta" : "text-tinta-apagada"}`}>
        O plano
      </span>

      <span
        aria-hidden="true"
        className={`h-px flex-1 ${noPlano ? "bg-linha" : "bg-[var(--accent-line)]"}`}
      />

      <span className={marca(!noPlano, false)}>2</span>
      <span className={`text-[12px] ${noPlano ? "text-tinta-apagada" : "text-tinta"}`}>
        Os seus dados
      </span>
    </div>
  );
}

export function CriarConta({
  aoVoltar,
  aoCadastrar,
}: {
  aoVoltar: () => void;
  /** Leva ao login com o e-mail já preenchido. */
  aoCadastrar: (email: string) => void;
}) {
  const [passo, setPasso] = useState<Passo>("plano");

  const [planos, setPlanos] = useState<Plano[] | null>(null);
  const [escolhido, setEscolhido] = useState<string | null>(null);

  const [documento, setDocumento] = useState("");
  const [nomeDono, setNomeDono] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  /** O olho da senha, igual ao do login: ver o que se digitou poupa um erro. */
  const [senhaAberta, setSenhaAberta] = useState(false);

  const setErro = useErroEmAlerta("Não foi possível criar a conta");
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
          O MAIS BARATO JÁ VEM MARCADO.

          Deixar tudo desmarcado obrigaria um clique a mais antes do primeiro
          campo. E o degrau de entrada é o padrão honesto: ninguém se arrepende
          de ter começado barato e subido, e quem precisa de mais sobe com a
          régua de cada linha na frente. O contrário — vir marcado no caro —
          seria a tela escolhendo pelo bolso de quem está lendo.

          A lista chega ordenada do mais barato ao mais caro pelo servidor.
        */
        setEscolhido(lista[0]?.id ?? null);
      })
      .catch(() => vivo && setPlanos([]));
    return () => { vivo = false; };
  }, []);

  /*
    Os dois derivados do catálogo. Calculados no corpo, e não guardados em
    estado: são função do que já está em `planos` e `escolhido`, e um
    `useState` a mais aqui seria uma segunda verdade para manter em dia.
  */
  const planoEscolhido = (planos ?? []).find((p) => p.id === escolhido) ?? null;
  const economia = economiaDoAnual(planos ?? []);
  /*
    O TESTE NÃO É DE TODOS: só o Completo e a Licença anual têm.

    Quem decide é o catálogo (`diasDeTeste` de cada plano); a tela só junta
    os que têm, para a frase de cima nomeá-los em vez de prometer teste a quem
    escolher o Essencial. O `Math.min` garante que ela não diga mais dias do
    que o plano mais curto dá.
  */
  const planosComTeste = (planos ?? []).filter((p) => p.diasDeTeste > 0);
  const diasDeTeste = planosComTeste.length
    ? Math.min(...planosComTeste.map((p) => p.diasDeTeste))
    : 0;
  const nomesComTeste = planosComTeste.map((p) => nomeCurto(p));
  const quemTesta =
    planosComTeste.length === (planos ?? []).length
      ? "qualquer plano"
      : nomesComTeste.length > 1
        ? `${nomesComTeste.slice(0, -1).join(", ")} ou ${nomesComTeste.at(-1)}`
        : nomesComTeste[0];
  /*
    O DO MEIO É O SUGERIDO.

    Não é achismo de marketing: numa escada de quatro, o degrau de entrada
    existe para caber no bolso e o de cima para a gráfica grande. Quem está
    lendo pela primeira vez quase nunca é nenhum dos dois, e um selo no meio
    responde "por onde eu começo?" sem precisar ler as quatro réguas.
  */
  const sugerido = (planos ?? [])[1]?.id ?? null;

  /*
    A CENTRAL DAS IMPRESSORAS ENTRA NA RÉGUA, riscada em quem não a tem.

    É a única diferença de CAPACIDADE entre os planos (o resto é volume), e
    riscada ela responde de relance a pergunta que fazia a pessoa abrir a
    lista de vantagens: "o que eu perco escolhendo o barato?".
  */
  const temCentral = (plano: Plano) => plano.metrosPorPeriodo === null || plano.acessos > 1;

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
          /*
            SEM `nome`: quem identifica a empresa é o documento, e o servidor
            usa o documento formatado como nome de quem não manda um.
          */
          empresa: { documento },
          dono: {
            nome: nomeDono.trim(),
            email: email.trim().toLowerCase(),
            telefone,
            senha,
          },
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

  /* ── Passo 1: o plano ─────────────────────────────────────────────────── */

  if (passo === "plano") {
    return (
      <Porta rodape={<VoltarAoLogin aoVoltar={aoVoltar} />}>
        <div className="flex flex-col gap-5">
          <header className="entrada-degrau flex flex-col gap-4">
            <h2 className="m-0 font-titulo text-xl font-semibold text-tinta">
              Escolha o seu plano
            </h2>
            <Trilha passo="plano" />
          </header>

          {/*
            O TESTE É DITO AQUI EM CIMA, com o nome de quem o tem.

            Não são todos os planos: dizer "qualquer plano" levaria quem
            escolheu o Essencial a esperar uma semana grátis que não vem. O
            cartão de cada um repete, embaixo do preço, se ele tem teste.
          */}
          {diasDeTeste > 0 && (
            <p className="entrada-degrau m-0 flex items-start gap-2 text-[12px] leading-relaxed text-tinta-fraca">
              <Icone
                referencia="icones.svg#badge-check"
                className="mt-0.5 size-3.5 shrink-0 text-ambar"
              />
              Você testa {quemTesta} por {diasDeTeste} dias, sem cartão. Dá
              para mudar de plano depois — fale com a CodeEx Solutions.
            </p>
          )}

          {planos === null && (
            <p className="m-0 text-[13px] text-tinta-apagada">Buscando os planos…</p>
          )}
          {planos?.length === 0 && (
            <p className="m-0 text-[12.5px] leading-relaxed text-tinta-apagada">
              Não foi possível buscar os planos. Confira a internet e abra o
              programa de novo.
            </p>
          )}

          {/*
            O CARROSSEL É O `react-alice-carousel`.

            Ele traz o arraste com inércia, o encaixe por item e os pontinhos
            de posição prontos — três coisas que a rolagem com `snap` fazia
            pela metade: no notebook sem tela de toque, arrastar não existia,
            e nada dizia quantos planos havia à direita.

            O PREÇO É PESO NO INSTALADOR, e vale dizer: são ~30 KB que entram
            no pacote por uma tela que a gráfica vê uma vez na vida. Foi
            decisão de quem manda no produto, não descuido.

            `mouseTracking` liga o arraste com o mouse; `disableButtonsControls`
            tira as setas embutidas (a escolha é o cartão, e uma seta ao lado
            de um rádio vira dois alvos para a mesma intenção).
          */}
          {/*
            `min-w-0` NO FIELDSET, e não é zelo: `fieldset` nasce com
            `min-inline-size: min-content`, então ele se ESTICA para caber o
            conteúdo em vez de encolher para caber no pai. O carrossel media
            876px de largura dentro de um cartão de 416px, e os pontinhos
            apareciam fora da vista, do lado direito.
          */}
          <fieldset className="entrada-degrau m-0 w-full min-w-0 border-0 p-0">
            <legend className="sr-only">Como você quer pagar</legend>

            <AliceCarousel
              mouseTracking
              touchTracking
              disableButtonsControls
              /* O ponto marcado diz onde se está — é o que a rolagem crua não
                 dizia. Clicar nele anda, e isso basta de navegação. */
              renderDotsItem={({ isActive }) => (
                <span
                  className={`mx-[3px] block size-1.5 rounded-full transition-colors ${
                    isActive ? "bg-[var(--accent)]" : "bg-linha"
                  }`}
                />
              )}
              responsive={{
                /*
                  DOIS CARTÕES E UMA LASCA DO TERCEIRO.

                  A lasca é o que diz "tem mais para o lado" sem precisar de
                  seta nenhuma. Tentei 2,4 primeiro e o cartão caiu para 163px:
                  "15 exportações por dia" quebrava em duas linhas e a régua
                  virava um parágrafo. Cabe mais informação em dois cartões
                  legíveis do que em três espremidos.
                */
                0: { items: 1.35 },
                420: { items: 2.1 },
              }}
              items={(planos ?? []).map((plano) => {
                const marcado = escolhido === plano.id;
                const preco = precoDoPlano(plano);
                const selo =
                  plano.cobranca === "anual" && economia !== null
                    ? `${economia}% a menos`
                    : plano.id === sugerido
                      ? "Mais escolhido"
                      : null;

                return (
                  <label
                    key={plano.id}
                    data-plano={plano.id}
                    className={[
                      "group relative mr-2.5 flex cursor-pointer flex-col rounded-2xl border p-3.5",
                      "transition-[border-color,background-color,box-shadow] duration-200",
                      marcado
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_0_0_1px_var(--accent-line),0_18px_40px_-28px_rgba(0,0,0,0.9)]"
                        : "border-linha bg-fundo hover:border-[var(--accent-line)]",
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      name="plano"
                      value={plano.id}
                      checked={marcado}
                      onChange={() => setEscolhido(plano.id)}
                      className="peer sr-only"
                    />

                    <span className="flex h-5 items-start">
                      {selo && (
                        <span className="rounded-full border border-[var(--accent-line)] bg-[var(--accent-soft)] px-1.5 py-px text-[9.5px] font-medium text-ambar">
                          {selo}
                        </span>
                      )}
                    </span>

                    <span className="mt-1 flex items-start gap-2">
                      <span
                        aria-hidden="true"
                        className={[
                          "mt-0.5 grid size-[16px] shrink-0 place-items-center rounded-full border transition-colors",
                          marcado
                            ? "border-[var(--accent)] bg-[var(--accent)]"
                            : "border-linha bg-painel group-hover:border-[var(--accent-line)]",
                        ].join(" ")}
                      >
                        <Check
                          size={10}
                          strokeWidth={3}
                          className={`text-fundo transition-opacity ${marcado ? "opacity-100" : "opacity-0"}`}
                        />
                      </span>
                      <span className="font-titulo text-[13.5px] leading-tight font-semibold text-tinta">
                        {nomeCurto(plano)}
                      </span>
                    </span>

                    <span className="mt-2.5 block">
                      <span
                        className={`block font-titulo text-[17px] leading-none font-semibold tracking-tight ${marcado ? "text-ambar" : "text-tinta"}`}
                      >
                        {preco.valor}
                      </span>
                      <span className="mt-1 block text-[10.5px] text-tinta-apagada">
                        {preco.periodo}
                        {plano.diasDeTeste > 0 && (
                          <span className="text-ambar"> · {plano.diasDeTeste} dias grátis</span>
                        )}
                      </span>
                    </span>

                    {/*
                      A RÉGUA, AGORA COM AS DUAS LINHAS QUE SOBRARAM.

                      O bloco de vantagens que ficava embaixo do carrossel
                      saiu: ele repetia, em quatro linhas de texto, a mesma
                      diferença que estes dois números já dizem — e empurrava
                      o botão para fora da vista.
                    */}
                    <span className="mt-2.5 flex flex-col gap-1 border-t border-linha pt-2.5 text-[11px] leading-snug text-tinta-fraca">
                      <span className="flex items-center gap-1.5">
                        <Ruler size={12} className="shrink-0 text-ambar" />
                        {metragemDoPlano(plano)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Users size={12} className="shrink-0 text-ambar" />
                        {plano.acessos === 1 ? "1 acesso" : `${plano.acessos} acessos`}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Printer
                          size={12}
                          className={`shrink-0 ${temCentral(plano) ? "text-ambar" : "text-tinta-apagada/50"}`}
                        />
                        <span className={temCentral(plano) ? "" : "text-tinta-apagada/70 line-through"}>
                          Central das impressoras
                        </span>
                      </span>
                    </span>
                  </label>
                );
              })}
            />
          </fieldset>

          <button
            type="button"
            disabled={!escolhido}
            onClick={() => setPasso("dados")}
            className="entrada-degrau botao-entrar w-full gap-2 px-4 text-[15px]"
          >
            Continuar
            <Icone referencia="icones.svg#arrow-right" className="size-4" />
          </button>
        </div>
      </Porta>
    );
  }

  /* ── Passo 2: os dados ────────────────────────────────────────────────── */

  return (
    <Porta rodape={<VoltarAoLogin aoVoltar={aoVoltar} />}>
      <form onSubmit={enviar} className="flex flex-col gap-5">
        <header className="entrada-degrau flex flex-col gap-4">
          <h2 className="m-0 font-titulo text-xl font-semibold text-tinta">
            Os seus dados
          </h2>
          <Trilha passo="dados" />
        </header>

        {/*
          O QUE FICOU DECIDIDO, numa linha — com o caminho de volta DENTRO
          dela. O resumo sem o "trocar" obrigaria um botão "voltar" solto em
          algum canto; juntos, a linha responde "qual plano mesmo?" e "e se eu
          mudar de ideia?" no mesmo lugar em que a pergunta aparece.
        */}
        {planoEscolhido && (
          <div className="entrada-degrau flex items-center gap-3 rounded-xl border border-[var(--accent-line)] bg-[var(--accent-soft)] px-3.5 py-2.5">
            <Icone
              referencia="icones.svg#badge-check"
              className="size-4 shrink-0 text-ambar"
            />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-tinta">
              {planoEscolhido.nome}
              <span className="text-tinta-apagada">
                {" · "}
                {precoDoPlano(planoEscolhido).valor}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setPasso("plano")}
              className="shrink-0 border-0 bg-transparent p-0 text-[12px] text-ambar transition-opacity hover:opacity-70"
            >
              trocar
            </button>
          </div>
        )}

        {/*
          A ORDEM: QUEM É VOCÊ, DE QUE EMPRESA, E COMO SE FALA COM VOCÊ.

          Nome e documento primeiro, e os dois juntos — são o que identifica a
          conta, e é a ordem em que qualquer balcão pergunta. Depois o contato
          (e-mail, telefone). A senha por último, de propósito: é o único
          campo que a pessoa INVENTA em vez de lembrar, e interromper a
          digitação com ele no meio faz voltar ao formulário depois de pensar.

          "Nome da empresa" saiu. Numa gráfica que trabalha no CPF do dono, é
          uma pergunta sem resposta boa — e quem identifica a conta é o
          documento, que é único no banco. O servidor usa o documento como
          nome até alguém acertar isso no painel.
        */}
        <fieldset className="entrada-degrau m-0 flex flex-col gap-4 border-0 p-0">
          <legend className="sr-only">Os seus dados</legend>

          <label className="flex flex-col gap-1.5">
            <span className={ROTULO}>Nome do representante</span>
            <span className="relative flex items-center">
              <Icone
                referencia="icones.svg#users"
                className="pointer-events-none absolute left-3 size-4 text-tinta-apagada"
              />
              <input
                required
                autoFocus
                maxLength={200}
                autoComplete="name"
                value={nomeDono}
                onChange={(e) => setNomeDono(e.target.value)}
                placeholder="seu nome completo aqui"
                className={CAMPO}
              />
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={ROTULO}>CNPJ ou CPF</span>
            <span className="relative flex items-center">
              <Icone
                referencia="icones.svg#file-text"
                className="pointer-events-none absolute left-3 size-4 text-tinta-apagada"
              />
              <input
                required
                inputMode="numeric"
                value={documento}
                onChange={(e) => setDocumento(mascararDocumento(e.target.value))}
                placeholder="seu CNPJ ou CPF aqui"
                className={`${CAMPO} font-mono placeholder:font-texto`}
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
                placeholder="seu e-mail aqui"
                className={CAMPO}
              />
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={ROTULO}>Telefone / WhatsApp</span>
            <span className="relative flex items-center">
              <Icone
                referencia="icones.svg#smartphone"
                className="pointer-events-none absolute left-3 size-4 text-tinta-apagada"
              />
              <input
                type="tel"
                required
                inputMode="numeric"
                autoComplete="tel"
                value={telefone}
                onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
                placeholder="seu WhatsApp aqui"
                className={`${CAMPO} font-mono placeholder:font-texto`}
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
                placeholder="crie uma senha aqui"
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
            {/*
              A ÚNICA REGRA QUE SOBREVIVEU DEBAIXO DE UM CAMPO, e porque ela é
              uma REGRA, não uma explicação: sem este aviso, o tamanho mínimo
              só apareceria como recusa depois de a pessoa ter escolhido uma
              senha — e escolher senha duas vezes é o pior lugar para descobrir
              qualquer coisa.
            */}
            <span className="text-[11.5px] text-tinta-apagada">
              Ao menos 8 caracteres.
            </span>
          </label>
        </fieldset>

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

/**
 * A SAÍDA DA TELA, no mesmo lugar em que o login põe o convite para cadastrar.
 *
 * Fica FORA do cartão, nos dois passos: dentro dele viraria mais um controle
 * do formulário, e sair do cadastro não é uma opção do cadastro.
 */
function VoltarAoLogin({ aoVoltar }: { aoVoltar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoVoltar}
      className="mt-5 flex w-full items-center justify-center gap-2 border-0 bg-transparent p-0 text-[13px] text-tinta-apagada transition-colors hover:text-ambar"
    >
      <Icone referencia="icones.svg#arrow-left" className="size-4" />
      Já tenho conta — voltar ao login
    </button>
  );
}
