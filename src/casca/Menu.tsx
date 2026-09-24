/**
 * O menu lateral.
 *
 * No computador ele fica fixo à esquerda. No celular vira gaveta: sai da tela
 * até alguém tocar no botão do cabeçalho, e fecha ao escolher uma tela, ao
 * clicar fora ou no Esc.
 *
 * As telas vêm separadas por grupo (Produção, Impressão, Relatórios). Quem
 * decide o grupo de cada uma é `src/rotas.ts`, como sempre foi com o resto:
 * este arquivo continua sem saber o que é molde, encaixe ou impressora — só
 * desenha a tabela que recebe.
 *
 * Cada item é um `<NavLink>`, e não um `<button>` com `onClick`: é um `<a>` de
 * verdade, então abre em outra aba pelo meio do mouse, mostra o endereço ao
 * passar por cima e é anunciado como link por um leitor de tela. Quem marca o
 * item aberto é o próprio router (o `isActive` do `NavLink`), e não uma
 * comparação feita aqui — este arquivo deixou de precisar saber qual tela está
 * na frente.
 *
 * ---------------------------------------------------------------------------
 * O DESENHO: UMA BARRA DE PROGRAMA, NÃO UMA LISTA DE AJUSTES
 * ---------------------------------------------------------------------------
 *
 * As medidas vieram da casca antiga (`public/style.css`), e por um tempo
 * tinham que vir: enquanto as duas cascas conviveram, um clique que trocava de
 * casca não podia parecer um clique que trocou de programa. O `public/` já foi
 * apagado, e o que sobrou era um menu que parecia a tela de ajustes de um
 * celular — cada tela num cartão de duas linhas, com o ícone dentro de uma
 * caixinha de borda própria, e o item ativo com borda âmbar em volta.
 *
 * Três coisas mudaram, e é disso que vem o ar de programa:
 *
 *   1. **Uma linha por tela.** A linha de apoio ("Aproveitamento do tecido")
 *      virou o `title` do link — continua a um segundo de distância, no
 *      balãozinho, mas sai da vista de quem já sabe onde clica. Treze cartões
 *      de duas linhas pedem leitura; treze linhas se varrem de olho.
 *
 *   2. **O ícone é um ícone.** Sem moldura, sem fundo. A moldura fazia cada
 *      item parecer um botão dentro do menu, e o menu inteiro, uma barra de
 *      ferramentas empilhada.
 *
 *   3. **O ativo é uma barrinha, não uma caixa.** Um traço âmbar de 3px
 *      encostado na esquerda, o texto e o ícone em âmbar, e um fundo de brilho
 *      baixo. É o que o olho já procura numa barra lateral (é o que fazem o
 *      VS Code, o Figma e a casca antiga) — e sem a borda em volta, a lista
 *      volta a parecer uma lista.
 *
 * Com o item numa linha só, a barra inteira media ~520px: as treze telas
 * cabiam sem rolagem até num monitor de 1366x768, que era o problema que as
 * variantes de altura resolviam à força. Restou o ajuste fino do `curta:`,
 * para a janela bem baixa.
 *
 * DESDE 2026-09-21 SÃO SEIS TELAS no menu — Macros, WhatsApp e o grupo
 * Relatórios saíram (ver `foraDoMenu`, em rotas.ts) —, e isso desfez a conta
 * acima. O aperto das três mudanças continua certo como LINGUAGEM (uma linha
 * por tela, ícone sem moldura, ativo em barrinha), mas as MEDIDAS que o
 * serviam não: elas existiam para ganhar pixels que já não faltam. Por isso a
 * segunda passagem, logo abaixo nas constantes — item de 44px, escala de 4px,
 * respiro real entre os grupos. Seis itens de 44px ocupam menos altura que
 * treze de 36px, então nada disso volta a cobrar rolagem.
 *
 * ---------------------------------------------------------------------------
 * O ACABAMENTO: DE BARRA CORRETA A PAINEL DE MÁQUINA
 * ---------------------------------------------------------------------------
 *
 * A estrutura acima resolveu a LEITURA. O que veio depois é o acabamento, e
 * são quatro coisas, cada uma comentada no lugar onde é escrita:
 *
 *   - **A barra tem luz.** O fundo deixou de ser uma cor chapada e virou um
 *     degradê vertical com um brilho laranja no alto, à esquerda. Uma coluna
 *     iluminada de cima lê como superfície; um retângulo de cor única lê como
 *     um bloco colado na tela.
 *
 *   - **O título do grupo é rótulo de painel**: monoespaçada, versalete
 *     apertado, e um traço que corre até a borda direita.
 *
 *   - **O ativo ACENDE.** A barrinha e o ícone ganharam halo, e o fundo do
 *     item virou um degradê que morre antes da borda direita, em vez de um
 *     retângulo de cor uniforme.
 *
 *   - **O pé perdeu o relógio** e ficou só com a marca.
 *
 * Nenhuma dessas mudanças escreve um hex: todas as cores saem dos tokens de
 * `estilo/tokens.css`, como manda o resto do projeto. Trocar o laranja da
 * marca continua sendo mudar uma linha lá, e a barra acompanha.
 *
 * A FAIXA ESTREITA continua: entre 801 e 1100px a barra encolhe para 78px e
 * deixa só os ícones, como a casca antiga fazia. Sem isso, na mesma janela de
 * 1080px a largura do menu mudava conforme a tela aberta.
 */

import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { RedeAnimada } from "../telas/RedeAnimada";
import { Icone } from "./Icone";
import { useDialogo } from "./Dialogo";
import { iniciais, type Usuario } from "./usuario";
import { GRUPOS, telasDoGrupo, type Tela } from "../rotas";
import { useForaDoPlano } from "./Escopos";

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  /**
   * Quem está usando, vindo de cima.
   *
   * A barra NÃO lê a sessão sozinha, de propósito: a casca já a lê para
   * decidir entre a tela de entrar e o programa, e um segundo hook aqui faria
   * um segundo pedido a `/api/sessao/eu` para saber a mesma coisa. `null` é
   * ninguém logado, e aí o bloco da conta simplesmente não nasce.
   */
  usuario: Usuario | null;
  /**
   * Sai da conta, JÁ CONFIRMADO.
   *
   * Quem pergunta é a barra, logo abaixo, porque o diálogo da casca só existe
   * dentro do provedor e a casca é quem o renderiza. Quem apaga a sessão no
   * servidor é a casca. A divisão segue a regra de sempre: a barra cuida da
   * conversa com a pessoa, a casca cuida do efeito.
   */
  aoSair: () => void;
}

/*
 * ---------------------------------------------------------------------------
 * AS VARIANTES DE ALTURA
 * ---------------------------------------------------------------------------
 *
 * `curta:` é variante de ALTURA de janela, declarada em `estilo/entrada.css`
 * — o Tailwind só traz as de largura. Ela aperta o item nos poucos pixels que
 * faltam numa janela baixa.
 *
 * E vai ESCRITA POR INTEIRO nas classes, nunca montada em pedaços: o Tailwind
 * gera CSS a partir do que ENCONTRA no código-fonte, e um
 * `${PREFIXO}min-h-[34px]` não existe como texto em lugar nenhum — a regra não
 * nasceria, a tela ficaria igual e nada acusaria. Foi o que aconteceu na
 * primeira versão disto.
 */

/*
 * O ITEM: uma linha, ícone e rótulo.
 *
 * TODAS AS MEDIDAS DAQUI PARA BAIXO ESTÃO NA ESCALA DE 4px, e isso é uma
 * mudança de 2026-09-21. Antes eram 6, 7, 9, 10, 11, 13, 14 e 21 — números
 * herdados da casca antiga, cada um resolvendo o seu caso sozinho. Nenhum
 * estava errado, e é justamente por isso que o conjunto parecia improvisado:
 * sem uma escala comum, o olho não encontra o ritmo e lê a barra como coisas
 * empilhadas em vez de um painel.
 *
 * A ALTURA SUBIU DE 36px PARA 44px porque a pressão que a segurava acabou. O
 * aperto foi calculado para TREZE telas caberem sem rolagem num monitor de
 * 1366x768. Desde que Macros, WhatsApp e o grupo Relatórios saíram do menu
 * (ver `foraDoMenu`, em rotas.ts), são SEIS — e seis itens de 44px ocupam
 * menos que treze de 36px. O espaço que sobrou não é para encher: é para
 * distribuir, e é por isso que o alvo de clique cresceu junto do respiro.
 */
const ITEM =
  "relative grid min-h-[44px] grid-cols-[20px_minmax(0,1fr)] items-center gap-3 rounded-[10px]" +
  // `no-underline`: o item virou <a>, e link sublinhado num menu lateral não é
  // o desenho desta casca — era <button> antes e assim continua parecendo.
  " px-3 py-2 text-left no-underline transition-colors duration-100" +
  // Janela baixa: volta ao aperto de antes, que é onde ele ainda se justifica.
  " curta:min-h-[36px] curta:py-1" +
  // Barra estreita: o ícone sozinho, centrado.
  " tela:max-[1100px]:grid-cols-[1fr] tela:max-[1100px]:justify-items-center tela:max-[1100px]:px-0";

/**
 * O rótulo some quando a barra encolhe — sobra o ícone.
 *
 * 14px, e não os 13px de antes: numa linha de 44px, 13px flutuava pequeno
 * demais no meio do espaço. Cabe com folga — "Digitalizar", o mais longo,
 * ocupa pouco mais da metade dos 180px úteis.
 */
const TEXTO_DO_ITEM = "truncate text-[14px] font-medium tracking-[-0.005em] tela:max-[1100px]:hidden";

const ITEM_PARADO = "text-tinta-fraca hover:bg-[var(--surface-hover)] hover:text-tinta";

/*
 * O ATIVO É UM DEGRADÊ QUE MORRE, NÃO UMA FAIXA CHAPADA.
 *
 * Era `bg-[var(--accent-soft)]`: um retângulo de cor uniforme da esquerda à
 * direita, que reaparecia inteiro no canto direito do item e desenhava uma
 * segunda borda vertical ali — três itens ativos ao longo do dia e o olho já
 * espera o bloco. O degradê sai forte na barrinha e chega transparente antes
 * do fim do item: o realce nasce do indicador e se apaga, em vez de emoldurar
 * o texto. É o mesmo gesto da barra lateral do VS Code e do Linear.
 */
const ITEM_ATIVO =
  "bg-[linear-gradient(90deg,var(--accent-soft)_0%,transparent_82%)] text-ambar-claro";

/**
 * A BARRINHA DO ATIVO.
 *
 * Fica fora do fluxo, colada na borda esquerda do item, com as pontas
 * arredondadas. Era um `shadow-[inset_3px_0]` — que funciona, mas desenha o
 * traço de canto vivo, encostado no topo e no pé do item, e some junto com o
 * fundo se alguém mexer no arredondamento depois.
 *
 * Na barra estreita ela vai para a esquerda da própria barra (não do item),
 * porque de lado, com 78px, encostaria no ícone.
 *
 * O `shadow` é o brilho do traço: laranja espalhado num raio curto, na mesma
 * transparência da linha de acento. Num painel escuro é o que faz o indicador
 * parecer ACESO em vez de pintado — e num raio de 9px ele não vaza para o item
 * de cima nem para o de baixo.
 */
const TRILHO =
  // 8px de recuo em cima e embaixo, e não 6: a barrinha acompanha a altura do
  // item. Mantida a proporção de antes, ela cresceria junto e viraria um traço
  // comprido demais — o indicador deve marcar o item, não desenhá-lo.
  "absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-ambar" +
  " shadow-[0_0_9px_var(--accent-line)]";

/**
 * O ícone, sem moldura: é um desenho, não um botão dentro do botão.
 *
 * 20px preenche a coluna de 20px do grid. Em 18px ele ficava com um pixel de
 * folga de cada lado, e o desalinhamento aparecia justamente na barra estreita,
 * onde o ícone é a única coisa que sobra.
 */
const ICONE = "size-5 shrink-0 transition-colors duration-100";

/** Aceso, o ícone ganha o mesmo halo do trilho — os dois acendem juntos. */
const ICONE_ATIVO = "text-ambar drop-shadow-[0_0_5px_var(--accent-line)]";

/*
 * ---------------------------------------------------------------------------
 * OS ÍCONES DO PÉ — Sobre, Conta e Sair
 * ---------------------------------------------------------------------------
 *
 * SÓ O ÍCONE, num alvo quadrado de 28px. Eles já foram três linhas com rótulo
 * escrito, empilhadas: ocupavam ~100px do pé para dizer três palavras que
 * ninguém lê duas vezes. Ao lado do nome de quem está logado — que é onde eles
 * passaram a viver —, o rótulo por extenso empurraria o nome para as
 * reticências, e "Configurações da conta" é a mais comprida das três.
 *
 * O `title` e o `aria-label` de cada um continuam dizendo o nome inteiro: o
 * desenho perde a palavra, não a informação.
 *
 * E SEM A BARRINHA ÂMBAR do ativo: o indicador da lista existe para dizer "a
 * tela aberta é esta". Repeti-lo aqui criaria dois lugares acesos ao mesmo
 * tempo quando alguém abre o Sobre — a lista apagada e o pé aceso —, e o olho
 * perderia a referência de onde está. No pé, o aberto é só o ícone em âmbar.
 */
const PE_ITEM =
  "grid size-7 shrink-0 place-items-center rounded-lg border-0 bg-transparent p-0" +
  " no-underline transition-colors duration-100";

const PE_PARADO = "text-tinta-apagada hover:bg-[var(--surface-hover)] hover:text-tinta";

const PE_ATIVO = "text-ambar-claro";

const PE_ICONE = "size-4 shrink-0";

export function Menu({ aberto, aoFechar, usuario, aoSair }: Props) {
  const dialogo = useDialogo();

  /*
    A PERGUNTA MORA AQUI, e não na casca, por uma razão mecânica: `useDialogo`
    só vale dentro do `<ProvedorDeDialogo>`, e quem o renderiza é a casca — de
    lá o contexto ainda não existe. A barra está dentro dele.

    `perigoso: false` é a escolha que importa no texto desta caixa. O
    `confirmar` do diálogo pinta o botão de vermelho por padrão, supondo que
    quem confirma está prestes a apagar alguma coisa. Sair não apaga nada: o
    trabalho continua guardado, a conta continua existindo, e a pessoa volta
    com a senha. Um botão vermelho aqui trataria o fim do expediente como
    acidente prestes a acontecer.
  */
  async function pedirParaSair() {
    const ok = await dialogo.confirmar(
      "Na próxima vez o Optmize vai pedir o seu e-mail e a sua senha de novo.",
      { titulo: "Sair da conta", kicker: "CONTA", confirmar: "Sair", perigoso: false },
    );
    if (ok) aoSair();
  }

  useEffect(() => {
    if (!aberto) return;
    const noEsc = (evento: KeyboardEvent) => { if (evento.key === "Escape") aoFechar(); };
    window.addEventListener("keydown", noEsc);
    return () => window.removeEventListener("keydown", noEsc);
  }, [aberto, aoFechar]);

  return (
    <>
      {/* A cortina só existe no celular, e só com a gaveta aberta. */}
      {aberto && (
        <div
          aria-hidden="true"
          onClick={aoFechar}
          className="fixed inset-0 z-70 bg-black/65 tela:hidden"
        />
      )}

      <aside
        className={[
          // A barra NÃO rola: quem rola é a lista de telas, no meio dela. O pé
          // fica preso embaixo — antes ia embora junto com a rolagem, e o
          // relógio chegava a cair fora da janela numa tela de 768px.
          // 236px e 78px: quem repete estas duas medidas é o `ml` do <main>,
          // em `Casca.tsx` — a barra é `fixed` e não empurra o miolo sozinha.
          "fixed inset-y-0 left-0 z-80 flex w-[236px] flex-col overflow-x-hidden",
          "border-r border-[var(--border-hairline)] px-3 pt-4 pb-4",
          /*
            O FUNDO É DUAS CAMADAS, E NENHUMA DELAS TEM HEX.
            Toda cor sai de `estilo/tokens.css`, como no resto do projeto.

            Embaixo, um degradê vertical que vai do painel (mais claro que a
            barra) ao fundo do programa: a barra passa a ter uma FONTE DE LUZ
            em cima, então o pé escurece sozinho e o olho entende a coluna como
            uma superfície, não como um retângulo de cor única.

            Em cima, um brilho laranja no canto superior esquerdo, na mesma
            transparência do item aceso (`--accent-soft`, 12%). É de onde vem
            o ar de painel de máquina: a cor da marca lavando o alto da barra,
            fraca o bastante para não competir com o item ativo — que é a única
            coisa ali que pode ser laranja de verdade.
          */
          "bg-[radial-gradient(130%_46%_at_0%_0%,var(--accent-soft)_0%,transparent_62%),linear-gradient(178deg,var(--card-bg)_0%,var(--sidebar-bg)_40%,var(--bg)_100%)]",
          // A barra estreita, entre 801 e 1100px. Ver o cabeçalho.
          "tela:max-[1100px]:w-[78px] tela:max-[1100px]:px-3",
          "shadow-[6px_0_18px_-8px_rgba(0,0,0,0.55)] transition-transform duration-200",
          aberto ? "translate-x-0" : "-translate-x-[105%]",
          "tela:translate-x-0",
        ].join(" ")}
      >
        {/*
          A REDE, ATRÁS DE TUDO — a mesma da porta de entrar.

          `-z-10` a põe ACIMA do degradê da barra e ABAIXO do conteúdo: com
          `z-0` ela venceria o texto, porque elemento posicionado pinta por
          cima de texto de elemento estático, e a lista de telas sumiria atrás
          dos pontinhos. O `-z-10` fica preso aqui dentro porque a barra tem
          `transform` (o `translate-x` que a esconde no celular), e transform
          abre contexto de empilhamento.

          `opacity-70` porque esta barra fica aberta o dia inteiro, e o que na
          porta é recepção aqui seria distração: a rede tem de ser textura de
          fundo, não coisa para olhar.
        */}
        <RedeAnimada
          className="absolute inset-0 -z-10 opacity-70"
          densidade={6000}
          seguirPonteiro={false}
        />

        {/*
          A CABEÇA DA BARRA: DE QUEM É ESTE PROGRAMA.

          Aqui morava o cartão de quem está USANDO — avatar, nome, empresa e um
          ícone de sair —, e ele desceu para o pé. No lugar dele voltou a
          marca, com a empresa embaixo.

          A divisão é a do Flow, e ela responde duas perguntas diferentes em
          dois lugares: em cima, de quem é a casa (o programa e a gráfica que
          assina a licença); embaixo, quem está sentado nesta máquina agora.
          Juntas num bloco só, as duas se misturavam — o nome da pessoa colado
          no nome da empresa parecia um endereço.

          A EMPRESA SAIU DO PÉ por isto: ela é da instalação, não da sessão.
          Repeti-la nos dois cantos gastaria duas linhas para dizer o mesmo.
        */}
        <div className="-mx-3 -mt-4 mb-4 flex shrink-0 items-center gap-2.5 border-b border-[var(--border-hairline)] bg-[var(--sidebar-bg)] px-4 py-3 curta:mb-2 curta:py-2 tela:max-[1100px]:justify-center tela:max-[1100px]:px-0">
          {/*
            O HALO ATRÁS DA MARCA é o mesmo da porta de entrar (`porta-pulsa`),
            e aqui ele NÃO pulsa: na porta o movimento diz "o programa está
            vivo" para quem espera; numa barra que fica aberta oito horas ele
            seria uma luz piscando no canto do olho o dia inteiro.
          */}
          <span className="relative grid shrink-0 place-items-center">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-1.5 rounded-full bg-ambar opacity-25 blur-md"
            />
            <img
              src={`${import.meta.env.BASE_URL}icone.png`}
              alt=""
              className="relative size-[30px] rounded-[9px]"
            />
          </span>

          {/*
            Na barra estreita o texto vira `sr-only`, como no pé: some da vista
            e continua sendo lido. A marca sozinha basta para o olho, não para
            quem ouve a tela.
          */}
          <span className="min-w-0 flex-1 tela:max-[1100px]:sr-only">
            <span className="block truncate font-titulo text-[13px] leading-[1.25] tracking-[-0.01em]">
              <span className="text-tinta-fraca">CodeEx </span>
              <span className="text-ambar">Optmize</span>
            </span>
            {/*
              A EMPRESA, ou o que o programa faz enquanto não há conta.

              O segundo caso é a bancada e o primeiro minuto antes do login —
              deixar a linha vazia ali faria a marca dançar para cima quando a
              conta chegasse.
            */}
            <span className="block truncate font-mono text-[9px] leading-[1.35] tracking-[0.06em] text-tinta-apagada uppercase">
              {usuario?.empresa || "Moldes & encaixe"}
            </span>
          </span>
        </div>

        {/*
          Um <nav> por grupo, cada um rotulado pelo próprio título. É o que faz
          um leitor de tela anunciar "navegação Produção" em vez de despejar dez
          itens seguidos sem dizer onde um assunto acaba e o outro começa.
        */}
        {/*
          32px entre os grupos, contra 20px de antes. É o respiro que carrega a
          leitura agora que não há rótulo de sobra para separar assunto: com
          quatro itens e dois, o branco entre os blocos faz mais divisão do que
          qualquer linha a mais faria.
        */}
        <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto overscroll-contain px-1 curta:gap-4">
          {GRUPOS.map((grupo) => {
            const telas = telasDoGrupo(grupo.nome);
            if (!telas.length) return null;

            return (
              <nav key={grupo.nome} aria-labelledby={`grupo-${grupo.nome}`} className="flex flex-col gap-1">
                {/*
                  O TÍTULO DO GRUPO: rótulo em monoespaçada e um traço que
                  corre até a borda.

                  A monoespaçada (a mesma `--font-mono` do resto do sistema) é
                  o que separa um RÓTULO DE MÁQUINA de um subtítulo de texto:
                  largura fixa por letra, versalete apertado, tamanho pequeno.
                  É como um esquema elétrico nomeia uma seção, e é o motivo de
                  a barra ler como instrumento e não como menu de site.

                  O traço à direita fecha a linha e faz a separação existir sem
                  cobrar altura: antes, o que dizia "acabou um assunto" era só
                  o espaço em branco entre os grupos.

                  Na barra estreita o rótulo vira `sr-only` — sai da vista mas
                  CONTINUA sendo lido, que é o que dá nome ao <nav> pelo
                  `aria-labelledby`. Some o texto, sobra o traço, e a divisão
                  entre os grupos continua visível justo onde há menos espaço
                  para procurar.
                */}
                <h2
                  id={`grupo-${grupo.nome}`}
                  className="mt-0 mb-3 flex items-center gap-3 px-3 curta:mb-2 tela:max-[1100px]:mb-2 tela:max-[1100px]:px-0"
                >
                  {/*
                    10px, e não 9: em 9px a versalete com 0.2em de entreletra
                    virava textura antes de virar palavra — legível de perto,
                    ilegível de relance, que é como se lê um rótulo de seção.
                  */}
                  <span className="font-mono text-[10px] font-semibold tracking-[0.2em] text-tinta-apagada uppercase tela:max-[1100px]:sr-only">
                    {grupo.rotulo}
                  </span>
                  <span
                    aria-hidden="true"
                    className="h-px flex-1 bg-[var(--border-hairline)] tela:max-[1100px]:mx-auto tela:max-[1100px]:max-w-6 tela:max-[1100px]:bg-linha"
                  />
                </h2>

                {telas.map((tela) => (
                  <ItemDoMenu key={tela.nome} tela={tela} aoFechar={aoFechar} />
                ))}

              </nav>
            );
          })}
        </div>

        {/*
          ===========================================================================
          O PÉ DA BARRA — o que não é trabalho
          ===========================================================================

          Três ações: Sobre, Configurações da conta e Sair. É o canto do
          programa que fala do PROGRAMA e da CONTA, e não da produção.

          AQUI MORAVA A MARCA — o desenho, "CodeEx Optmize", o botão do
          Instagram e a linha de direitos reservados. Tudo isso mudou-se para a
          tela Sobre (`telas/Sobre.tsx`), e a troca tem duas razões. A de
          espaço: ação precisa de alvo de clique, e os créditos empurravam as
          três para fora da vista numa janela de 768px. A de propósito: crédito
          de quem fez se procura uma vez, não se olha oito horas por dia — o pé
          de um programa aberto o expediente inteiro deve guardar o que se
          CLICA, não o que se lê.

          A faixa de borda a borda continua (`-mx-3`, o `px` da barra
          devolvido) pelo mesmo motivo de antes: com seis telas na lista sobra
          muito vazio entre o último item e o pé, e só uma mudança de
          superfície segura o olho ali embaixo. É o que o Discord faz com o
          painel de quem está logado.

          Na barra estreita (78px) sobram os três ícones, centrados: o rótulo
          não cabe em 58px úteis, e o `title` de cada um diz o nome.
        */}
        <div className="-mx-3 -mb-4 mt-4 flex shrink-0 flex-col gap-2 border-t border-[var(--border-hairline)] bg-[var(--sidebar-bg)] px-3 py-3">
          {/*
            UMA LINHA SÓ: quem está usando, e as três coisas que se faz com
            isso.

            Eram dois blocos — o cartão da conta no alto da barra e uma pilha
            de três linhas aqui embaixo —, e o "Sair" ficava a uma barra
            inteira de distância do nome de quem sai. Numa linha só, com os
            três como ícones ao lado do nome, o pé custa ~50px em vez de ~130,
            e a lista de telas fica com o que sobrou.

            NA BARRA ESTREITA (78px) a linha vira coluna: o avatar em cima, os
            três ícones embaixo. Lado a lado seriam quatro alvos em 58px úteis,
            e nenhum deles acertável.
          */}
          <div className="flex items-center gap-2.5 tela:max-[1100px]:flex-col tela:max-[1100px]:gap-2">
            {usuario && (
              <>
                {/*
                  O AVATAR: as iniciais num quadrado de canto arredondado.

                  Quadrado, e não círculo: o arredondamento de 9px é o mesmo
                  dos itens do menu, e um círculo seria a única forma redonda
                  da barra inteira. As cores são as do item ativo em brilho
                  baixo — sem foto, é o que dá ao bloco a marca da casa em vez
                  de um quadrado cinza.
                */}
                <span
                  aria-hidden="true"
                  className="grid size-[30px] shrink-0 place-items-center rounded-[9px] border border-[var(--accent-line)] bg-[var(--accent-soft)] font-mono text-[11px] font-semibold text-ambar"
                >
                  {iniciais(usuario.nome)}
                </span>

                {/*
                  Na barra estreita o texto vira `sr-only` em vez de `hidden`:
                  some da vista mas continua sendo lido, senão o avatar ficaria
                  sozinho e mudo — um quadrado com duas letras não diz a
                  ninguém de quem é a conta.
                */}
                {/*
                  UMA LINHA SÓ: o nome de quem está logado.

                  A empresa subiu para a cabeça da barra — ela é da
                  instalação, não de quem sentou na máquina. E o papel (dono,
                  operador) continua fora: quem usa o programa já sabe o
                  próprio cargo, e o lugar do papel é onde ele TEM efeito — na
                  tela dos membros, e no botão que a pessoa não pode apertar.
                */}
                <span
                  title={`${usuario.nome} — ${usuario.empresa}`}
                  className="min-w-0 flex-1 truncate font-titulo text-[12.5px] leading-[1.3] tracking-[-0.01em] text-tinta tela:max-[1100px]:sr-only"
                >
                  {usuario.nome}
                </span>
              </>
            )}

            {/*
              OS TRÊS ÍCONES, sem rótulo escrito: o nome da pessoa já disputa a
              largura, e "Configurações da conta" por extenso empurraria o nome
              para as reticências. O `title` de cada um diz o que é.

              Sem usuário, os ícones ficam sozinhos e centrados — é o que
              acontece na bancada, antes de haver conta.
            */}
            <span className={`flex shrink-0 items-center gap-0.5 ${usuario ? "" : "flex-1 justify-center"}`}>
              <NavLink
                to="/sobre"
                onClick={aoFechar}
                title="Sobre o Optmize"
                aria-label="Sobre o Optmize"
                className={({ isActive }) => [PE_ITEM, isActive ? PE_ATIVO : PE_PARADO].join(" ")}
              >
                <Icone referencia="icones.svg#info" className={PE_ICONE} />
              </NavLink>

              <NavLink
                to="/conta"
                onClick={aoFechar}
                title="Configurações da conta"
                aria-label="Configurações da conta"
                className={({ isActive }) => [PE_ITEM, isActive ? PE_ATIVO : PE_PARADO].join(" ")}
              >
                <Icone referencia="icones.svg#user-cog" className={PE_ICONE} />
              </NavLink>

              {/*
                SAIR só existe quando há de quem sair. Sem conta, o ícone some
                em vez de aparecer desabilitado: um botão apagado convida a
                descobrir por que não funciona.

                O aviso antes de sair NÃO é cerimônia: sair apaga a sessão
                guardada, e num computador compartilhado da produção um clique
                acidental no fim do expediente deixa o turno seguinte parado na
                porta sem saber a senha de ninguém.
              */}
              {usuario && (
                <button
                  type="button"
                  onClick={pedirParaSair}
                  title="Sair da conta"
                  aria-label="Sair da conta"
                  className={`${PE_ITEM} ${PE_PARADO}`}
                >
                  <Icone referencia="icones.svg#log-out" className={PE_ICONE} />
                </button>
              )}
            </span>
          </div>

          {/*
            A VERSÃO, NO CANTO DE BAIXO.

            É o primeiro dado que o suporte pede, e até pouco tempo morava só
            na tela Sobre — o que transformava "qual versão você está usando?"
            em duas instruções ao telefone. Aqui ela está sempre à vista, e uma
            foto de tela de qualquer canto do programa já a traz junto.

            BEM APAGADA, de propósito: quem trabalha não precisa dela, e um
            número legível no pé competiria com os ícones que se clicam.

            Na barra estreita (78px) ela some: não cabe em 58px úteis.
          */}
          <p
            title={`CodeEx Optmize ${__VERSAO__}`}
            className="m-0 px-1 font-mono text-[10.5px] leading-none text-tinta-apagada/60 tela:max-[1100px]:hidden"
          >
            v{__VERSAO__}
          </p>
        </div>
      </aside>
    </>
  );
}


/**
 * Uma linha do menu.
 *
 * Virou componente por causa do cadeado: saber se a tela está no plano é uma
 * pergunta de hook (`useForaDoPlano`), e hook não se chama dentro de um
 * `map`. O desenho é o mesmo de antes.
 *
 * DUAS RAZÕES PARA O CADEADO, e a linha não distingue: `trancada` é decisão
 * nossa e vale para todo mundo; fora do plano é decisão do plano da conta. O
 * que muda entre as duas é o que a pessoa vê ao clicar — e aí aí ela já está
 * na tela, que explica qual dos dois é.
 */
function ItemDoMenu({ tela, aoFechar }: { tela: Tela; aoFechar: () => void }) {
  const foraDoPlano = useForaDoPlano(tela);
  const comCadeado = Boolean(tela.trancada) || foraDoPlano;

  const balao = tela.trancada
    ? `${tela.rotulo} — trancada`
    : foraDoPlano
      ? `${tela.rotulo} — não está no seu plano`
      : `${tela.rotulo} — ${tela.apoioMenu}`;

  return (
    <NavLink
      to={`/${tela.nome}`}
      onClick={aoFechar}
      /* A linha de apoio não é mais desenhada: vive aqui, no balão. */
      title={balao}
      className={({ isActive }) => [ITEM, isActive ? ITEM_ATIVO : ITEM_PARADO,
        comCadeado && !isActive ? "opacity-60" : ""].join(" ")}
    >
      {({ isActive }) => (
        <>
          {isActive && <span aria-hidden="true" className={TRILHO} />}
          {/*
            Tela com cadeado troca o ícone pelo cadeado (ver `trancada` e
            `escopo`, em rotas.ts). No lugar do ícone, e não ao lado do nome,
            porque na barra estreita o nome some e o ícone fica.
          */}
          <Icone
            referencia={comCadeado ? "icones.svg#lock" : tela.icone}
            className={`${ICONE} ${isActive ? ICONE_ATIVO : ""}`}
          />
          <span className={TEXTO_DO_ITEM}>{tela.rotulo}</span>
        </>
      )}
    </NavLink>
  );
}
