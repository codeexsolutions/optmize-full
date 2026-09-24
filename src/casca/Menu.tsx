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
 * OS ITENS DO PÉ — Sobre, Conta e Sair
 * ---------------------------------------------------------------------------
 *
 * MENORES QUE OS DA LISTA, de propósito: 34px contra 44px, ícone de 16 contra
 * 20, texto de 12,5 contra 14. A diferença de tamanho é o que diz, sem
 * palavra nenhuma, que ali embaixo não é trabalho — são três coisas que se
 * procuram de vez em quando, e dar a elas o mesmo peso das telas de produção
 * faria a barra parecer ter nove destinos igualmente importantes.
 *
 * E SEM A BARRINHA ÂMBAR do ativo: o indicador da lista existe para dizer "a
 * tela aberta é esta". Repeti-lo aqui criaria dois lugares acesos ao mesmo
 * tempo quando alguém abre o Sobre — a lista apagada e o pé aceso —, e o olho
 * perderia a referência de onde está. No pé, o aberto é só o texto em âmbar.
 */
const PE_ITEM =
  "grid min-h-[34px] grid-cols-[16px_minmax(0,1fr)] items-center gap-2.5 rounded-lg" +
  " border-0 bg-transparent px-2.5 py-1 text-left no-underline transition-colors duration-100" +
  " tela:max-[1100px]:grid-cols-[1fr] tela:max-[1100px]:justify-items-center tela:max-[1100px]:px-0";

const PE_PARADO = "text-tinta-apagada hover:bg-[var(--surface-hover)] hover:text-tinta";

const PE_ATIVO = "text-ambar-claro";

const PE_ICONE = "size-4 shrink-0";

const PE_TEXTO = "truncate text-[12.5px] font-medium tela:max-[1100px]:hidden";

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
          O CABEÇALHO: QUEM ESTÁ USANDO O PROGRAMA.

          AQUI MORAVA A MARCA — o logo, o nome e "Moldes & encaixe" —, e ela
          saiu justamente por ocupar ~70px de altura para dizer uma coisa que
          não muda, num programa que se abre o dia inteiro. O logo desceu para
          o pé e o alto virou a lista de telas.

          O que volta agora NÃO é a marca: é a conta. A diferença é que isto
          muda, e importa saber. O sistema está deixando de ser um programa por
          máquina e virando UMA EMPRESA COM VÁRIOS ACESSOS — cada pessoa entra
          com a própria conta, e o que ela faz fica no nome dela. Numa fábrica
          onde três pessoas dividem o mesmo computador, "em nome de quem este
          encaixe vai sair?" é a primeira pergunta do dia, e o lugar de
          respondê-la é o alto da barra, antes de qualquer tela.

          POR ENQUANTO É UM USUÁRIO DE TESTE, fixo em `casca/usuario.ts`. Não
          há login ainda; há a tela dele. O valor é de mentira, o formato não —
          ver o cabeçalho daquele arquivo para o que troca no dia em que a
          autenticação existir (resposta curta: a função `usuarioAtual()`, e
          nada aqui).

          O bloco é uma FAIXA, igual à do pé: sangra até as duas bordas
          (`-mx-[10px]`) e até o topo (`-mt-4`, o `pt` da barra devolvido), com
          fundo sólido separando-o do degradê. A barra passa a ter cabeça,
          corpo e pé — três superfícies, e a lista de telas no meio, que é onde
          o olho deve cair.

          O BLOCO CONTINUA SENDO UMA `<div>`: não há tela de conta para onde
          ir, e um bloco inteiro que parece botão e não leva a lugar nenhum é
          pior que um bloco parado. O que é clicável é só o ícone de sair, no
          canto — uma ação, num alvo do tamanho dela.
        */}
        {usuario && (
          <div
            title={`${usuario.nome} — ${usuario.empresa}`}
            /*
              `px-7` são 28px, e eles não são estéticos: é exatamente onde
              começa a coluna de ícones da lista (12px do `px-3` da barra, mais
              4px do `px-1` do contêiner, mais 12px do `px-3` do item). Antes
              eram 21px contra 24px dos ícones — três pixels de diferença, que
              ninguém mede e todo mundo sente: o avatar pairava fora do prumo
              da coluna. Mexer no recuo do item obriga a mexer aqui junto.
            */
            className="-mx-3 -mt-4 mb-4 shrink-0 border-b border-[var(--border-hairline)] bg-[var(--sidebar-bg)] px-7 py-4 curta:mb-2 curta:py-3"
          >
            <div className="flex items-center gap-3 tela:max-[1100px]:justify-center">
              {/*
                O AVATAR: as iniciais num quadrado de canto arredondado.

                Quadrado, e não círculo: o arredondamento de 9px é o mesmo dos
                itens do menu e do botão do pé, e um círculo no meio disso
                seria a única forma redonda da barra inteira.

                As cores são as do acento em brilho baixo — o mesmo par
                (`--accent-soft` no fundo, `--accent-line` na borda) que o item
                ativo usa. Sem foto, é o que dá ao bloco a marca da casa em vez
                de um quadrado cinza.
              */}
              <span
                aria-hidden="true"
                className="grid size-[30px] shrink-0 place-items-center rounded-[9px] border border-[var(--accent-line)] bg-[var(--accent-soft)] font-mono text-[11px] font-semibold text-ambar tela:max-[1100px]:size-[32px]"
              >
                {iniciais(usuario.nome)}
              </span>

              {/*
                Na barra estreita o texto vira `sr-only` em vez de `hidden`:
                some da vista mas continua sendo lido, senão o avatar ficaria
                sozinho e mudo — um quadrado com duas letras não diz a ninguém
                de quem é a conta.
              */}
              <span className="min-w-0 flex-1 tela:max-[1100px]:sr-only">
                <span className="block truncate font-titulo text-[12.5px] leading-[1.3] font-semibold tracking-[-0.01em] text-tinta">
                  {usuario.nome}
                </span>
                {/*
                  SÓ A EMPRESA. O papel (dono, operador…) continua no dado, em
                  `usuario.ts`, mas não aparece aqui: quem está usando o
                  programa já sabe o próprio cargo, e ler "Dono" na barra o dia
                  inteiro não muda nada do que a pessoa vai fazer. O lugar do
                  papel é onde ele TEM efeito — na tela que lista os membros da
                  empresa, e no botão que a pessoa não pode apertar.
                */}
                <span className="block truncate font-mono text-[10px] leading-[1.35] tracking-[0.02em] text-tinta-apagada">
                  {usuario.empresa}
                </span>
              </span>

              {/*
                SAIR.

                Um ícone, e não um botão com a palavra: o bloco tem 28px de
                respiro de cada lado e o nome da pessoa já disputa a largura —
                "Sair" escrito empurraria o nome para as reticências.

                O aviso antes de sair NÃO é cerimônia. Sair apaga a sessão
                guardada, e a próxima abertura volta a pedir a senha; num
                computador compartilhado da produção, um clique acidental no
                fim do expediente deixa o turno seguinte parado na porta sem
                saber a senha de ninguém.
              */}
              <button
                type="button"
                onClick={pedirParaSair}
                title="Sair da conta"
                aria-label="Sair da conta"
                className="grid size-7 shrink-0 place-items-center rounded-md text-tinta-apagada transition-colors hover:bg-[var(--surface-hover)] hover:text-tinta tela:max-[1100px]:hidden"
              >
                <Icone referencia="icones.svg#log-out" className="size-4" />
              </button>
            </div>
          </div>
        )}

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
        <div className="-mx-3 -mb-4 mt-4 flex shrink-0 flex-col gap-0.5 border-t border-[var(--border-hairline)] bg-[var(--sidebar-bg)] px-4 py-3">
          <NavLink
            to="/sobre"
            onClick={aoFechar}
            title="Sobre o Optmize"
            className={({ isActive }) => [PE_ITEM, isActive ? PE_ATIVO : PE_PARADO].join(" ")}
          >
            <Icone referencia="icones.svg#info" className={PE_ICONE} />
            <span className={PE_TEXTO}>Sobre</span>
          </NavLink>

          <NavLink
            to="/conta"
            onClick={aoFechar}
            title="Configurações da conta"
            className={({ isActive }) => [PE_ITEM, isActive ? PE_ATIVO : PE_PARADO].join(" ")}
          >
            <Icone referencia="icones.svg#user-cog" className={PE_ICONE} />
            <span className={PE_TEXTO}>Configurações da conta</span>
          </NavLink>

          {/*
            SAIR só existe quando há de quem sair. Sem conta, o item some em
            vez de aparecer desabilitado: um botão apagado convida a descobrir
            por que não funciona.
          */}
          {usuario && (
            <button
              type="button"
              onClick={pedirParaSair}
              title="Sair da conta"
              className={`${PE_ITEM} ${PE_PARADO} w-full text-left`}
            >
              <Icone referencia="icones.svg#log-out" className={PE_ICONE} />
              <span className={PE_TEXTO}>Sair</span>
            </button>
          )}

          {/*
            A VERSÃO, NO CANTO DE BAIXO.

            É o primeiro dado que o suporte pede, e até agora ele morava só na
            tela Sobre — o que transformava "qual versão você está usando?" em
            duas instruções ao telefone. Aqui ela está sempre à vista, e uma
            foto de tela de qualquer canto do programa já a traz junto.

            BEM APAGADA, de propósito: quem trabalha não precisa dela, e um
            número legível no pé da barra competiria com os itens que se
            clicam. Quem procura, acha; quem não procura, não vê.

            Na barra estreita (78px) ela some junto com os rótulos: `1.1.158`
            não cabe em 58px úteis, e o `title` de cada item continua dizendo o
            que é o quê.
          */}
          <p
            title={`CodeEx Optmize ${__VERSAO__}`}
            className="m-0 mt-1.5 px-2 font-mono text-[10.5px] leading-none text-tinta-apagada/60 tela:max-[1100px]:hidden"
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
