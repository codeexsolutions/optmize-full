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
 * Com o item numa linha só, a barra inteira mede ~520px: as treze telas cabem
 * sem rolagem até num monitor de 1366x768, que era o problema que as variantes
 * de altura resolviam à força. Restou o ajuste fino do `curta:`, para a janela
 * bem baixa.
 *
 * A FAIXA ESTREITA continua: entre 801 e 1100px a barra encolhe para 78px e
 * deixa só os ícones, como a casca antiga fazia. Sem isso, na mesma janela de
 * 1080px a largura do menu mudava conforme a tela aberta.
 */

import { useEffect } from "react";
import { Link, NavLink } from "react-router-dom";
import { Icone } from "./Icone";
import { useRelogio } from "./useRelogio";
import { GRUPOS, telasDoGrupo } from "../rotas";

interface Props {
  aberto: boolean;
  aoFechar: () => void;
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

/** O item do menu: uma linha, ícone e rótulo. */
const ITEM =
  "relative grid min-h-[36px] grid-cols-[20px_minmax(0,1fr)] items-center gap-[11px] rounded-[8px]" +
  // `no-underline`: o item virou <a>, e link sublinhado num menu lateral não é
  // o desenho desta casca — era <button> antes e assim continua parecendo.
  " px-[10px] py-[6px] text-left no-underline transition-colors duration-100" +
  " curta:min-h-[32px] curta:py-1" +
  // Barra estreita: o ícone sozinho, centrado.
  " tela:max-[1100px]:grid-cols-[1fr] tela:max-[1100px]:justify-items-center tela:max-[1100px]:px-0";

/** O rótulo some quando a barra encolhe — sobra o ícone. */
const TEXTO_DO_ITEM = "truncate text-[13px] font-medium tracking-[-0.005em] tela:max-[1100px]:hidden";

const ITEM_PARADO = "text-tinta-fraca hover:bg-[var(--surface-hover)] hover:text-tinta";
const ITEM_ATIVO = "bg-[var(--accent-soft)] text-ambar-claro";

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
 */
const TRILHO = "absolute left-0 top-[6px] bottom-[6px] w-[3px] rounded-r-full bg-ambar";

/** O ícone, sem moldura: é um desenho, não um botão dentro do botão. */
const ICONE = "size-[18px] shrink-0 transition-colors duration-100";

export function Menu({ aberto, aoFechar }: Props) {
  const relogio = useRelogio();

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
          "border-r border-[var(--border-hairline)] bg-[var(--sidebar-bg)] px-[10px] pt-4 pb-[14px]",
          // A barra estreita, entre 801 e 1100px. Ver o cabeçalho.
          "tela:max-[1100px]:w-[78px] tela:max-[1100px]:px-[10px]",
          "shadow-[6px_0_18px_-8px_rgba(0,0,0,0.55)] transition-transform duration-200",
          aberto ? "translate-x-0" : "-translate-x-[105%]",
          "tela:translate-x-0",
        ].join(" ")}
      >
        {/*
          AQUI MORAVA A MARCA — o logo, o nome e "Moldes & encaixe".
          Ela saiu: o logo e o nome passaram para o pé da barra, junto do
          relógio, e o alto virou o que a barra existe para ser — a lista de
          telas, começando na primeira linha.

          Não é só arrumação: eram ~70px de altura gastos para dizer onde a
          pessoa está, num programa que ela abre o dia inteiro.
        */}

        {/*
          Um <nav> por grupo, cada um rotulado pelo próprio título. É o que faz
          um leitor de tela anunciar "navegação Produção" em vez de despejar dez
          itens seguidos sem dizer onde um assunto acaba e o outro começa.
        */}
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-1 curta:gap-3.5">
          {GRUPOS.map((grupo) => {
            const telas = telasDoGrupo(grupo.nome);
            if (!telas.length) return null;

            return (
              <nav key={grupo.nome} aria-labelledby={`grupo-${grupo.nome}`} className="flex flex-col gap-[2px]">
                {/*
                  O título do grupo na barra estreita vira um traço: sem ele os
                  três grupos viram uma coluna só de ícones, e a divisão que o
                  menu inteiro existe para mostrar some justo onde há menos
                  espaço para procurar.
                */}
                <h2
                  id={`grupo-${grupo.nome}`}
                  className={[
                    "mt-0 mb-[6px] px-[10px] text-[9.5px] font-semibold tracking-[0.14em] text-tinta-apagada uppercase",
                    "curta:mb-1",
                    "tela:max-[1100px]:mx-auto tela:max-[1100px]:mb-2 tela:max-[1100px]:h-px tela:max-[1100px]:w-6",
                    "tela:max-[1100px]:overflow-hidden tela:max-[1100px]:bg-linha tela:max-[1100px]:px-0 tela:max-[1100px]:text-transparent",
                  ].join(" ")}
                >
                  {grupo.rotulo}
                </h2>

                {telas.map((tela) => (
                  <NavLink
                    key={tela.nome}
                    to={`/${tela.nome}`}
                    onClick={aoFechar}
                    /* A linha de apoio não é mais desenhada: vive aqui, no balão. */
                    title={`${tela.rotulo} — ${tela.apoioMenu}`}
                    className={({ isActive }) => [ITEM, isActive ? ITEM_ATIVO : ITEM_PARADO].join(" ")}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span aria-hidden="true" className={TRILHO} />}
                        <Icone
                          referencia={tela.icone}
                          className={`${ICONE} ${isActive ? "text-ambar" : ""}`}
                        />
                        <span className={TEXTO_DO_ITEM}>{tela.rotulo}</span>
                      </>
                    )}
                  </NavLink>
                ))}

              </nav>
            );
          })}
        </div>

        {/*
          O PÉ DA BARRA: a marca do programa e o relógio.

          O relógio está aqui, e não no cabeçalho, pela mesma razão da casca
          antiga: o cabeçalho some nas telas de bancada — que é onde a pessoa
          passa a tarde — e levava o relógio junto. Aqui embaixo ele fica de pé
          em todas as telas.

          A marca desceu para cá quando saiu do alto da barra. É o lugar certo
          para ela: quem usa o programa não precisa dela para trabalhar, mas
          quem OLHA a tela — de longe, numa foto, num chamado de suporte —
          precisa saber que programa é. Na barra estreita sobra só o desenho,
          um pouco maior, com a hora embaixo.

          Os dois dividem uma linha só: marca à esquerda, hora à direita, do
          jeito que uma barra de estado faz. Eram dois blocos empilhados, e o
          pé pesava mais que o item ativo logo acima dele.

          O bloco fica FORA da parte que rola, encostado no pé: era `mt-auto`
          dentro dela, e numa janela baixa descia junto com a lista para fora
          da vista.
        */}
        <div className="mt-3 shrink-0 border-t border-[var(--border-hairline)] px-[11px] pt-[10px]">
          <div className="flex items-center justify-between gap-2 tela:max-[1100px]:flex-col tela:max-[1100px]:gap-2">
            {/*
              A marca é um LINK para a licença.

              É o único caminho para essa tela quando está tudo em dia (ela
              fica fora do menu, e a faixa de aviso só aparece perto de
              vencer), e é onde qualquer pessoa procura "sobre este programa"
              — que é exatamente o que a tela de licença é: nome, validade e o
              código desta instalação.
            */}
            <Link
              to="/licenca"
              title="Licença deste computador"
              className="flex min-w-0 items-center gap-[7px] no-underline"
            >
              {/*
                A MARCA.

                O arquivo é servido como está, de `estatico/` (é o que o
                `publicDir` do Vite aponta), e o caminho passa pelo
                `BASE_URL` como o do sprite de ícones — ver `Icone.tsx`.

                O desenho é branco e laranja, sem fundo: foi feito para cair
                sobre escuro, que é o que a barra é. O ícone do PROGRAMA (o da
                barra de tarefas) é este mesmo sobre uma placa escura, porque
                lá o fundo é do Windows e pode ser claro — ver
                `empacotar/icone.png`.

                O nome do programa é "CodeEx Optmize", escrito por extenso: é
                assim que ele se chama no instalador, no chamado de suporte e na
                boca de quem usa.

                O `alt` carrega o nome e o texto ao lado fica `aria-hidden`:
                na barra estreita o nome escrito some (é `hidden`, sai da
                árvore de acessibilidade junto), e sem isso a marca não seria
                anunciada por nada ali.
              */}
              <img
                src={`${import.meta.env.BASE_URL}icone.png`}
                alt="CodeEx Optmize"
                width={20}
                height={20}
                /* 20px e não 18: o desenho tem um recorte pequeno no meio, e
                   abaixo disso ele vira um borrão. Na barra estreita, onde é a
                   única identidade que sobra, ele cresce mais um pouco. */
                className="size-[20px] shrink-0 tela:max-[1100px]:size-[26px]"
              />
              <span
                aria-hidden="true"
                className="truncate font-titulo text-[12.5px] font-semibold tracking-[-0.01em] text-tinta tela:max-[1100px]:hidden"
              >
                CodeEx Optmize
              </span>
            </Link>

            <strong
              title={relogio.data}
              className="shrink-0 font-mono text-[11px] font-medium text-tinta-apagada tabular-nums"
            >
              {relogio.hora}
            </strong>
          </div>
        </div>
      </aside>
    </>
  );
}
