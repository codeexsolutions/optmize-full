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
 * AS MEDIDAS VIERAM DA CASCA ANTIGA, E ISSO FOI DE PROPÓSITO
 * ---------------------------------------------------------------------------
 *
 * Largura, recuos, o estado do item ativo e o relógio no pé: tudo aqui foi
 * copiado de `public/style.css` e `public/interface.css`, que era o menu da
 * tela antiga. (A marca do alto — logo, nome e "Moldes & encaixe" — saiu; o
 * nome do programa vive agora no pé.) Enquanto as duas cascas conviveram, um clique que
 * trocava de casca não podia parecer um clique que trocou de programa — e era
 * o que parecia, porque esta nasceu como um redesenho e não como uma cópia.
 *
 * O `public/` já foi apagado e não há mais o que manter em dois lugares. As
 * medidas ficam como estão porque são as que a fábrica já conhece; mexer nelas
 * agora é decisão de desenho, não mais uma obrigação de casar com a outra.
 *
 * Inclusive a FAIXA ESTREITA: entre 801 e 1100px a casca antiga encolhe a
 * barra para 78px e deixa só os ícones. Esta não encolhia, e o resultado era o
 * pior dos dois mundos — na mesma janela de 1080px, um clique que trocava de
 * casca trocava também a largura do menu, e parecia outro programa. A regra
 * vive nas duas: lá no `@media` do `interface.css`, aqui nas variantes
 * `tela:max-[1100px]:`.
 */

import { useEffect } from "react";
import { NavLink } from "react-router-dom";
import { Icone } from "./Icone";
import { useRelogio } from "./useRelogio";
import { GRUPOS, telasDoGrupo } from "../rotas";

interface Props {
  aberto: boolean;
  aoFechar: () => void;
}

/*
 * ---------------------------------------------------------------------------
 * A ALTURA DA JANELA MANDA NA DENSIDADE
 * ---------------------------------------------------------------------------
 *
 * São treze telas, e no tamanho cheio (item de 50px com duas linhas de texto)
 * o menu pede ~940px de altura. Num monitor de 1366x768 — o mais comum no
 * chão de fábrica — isso não cabia: dois itens ficavam fora da vista e o
 * relógio ia parar 119px abaixo do fim da janela, inalcançável.
 *
 * Então o item encolhe conforme a janela: abaixo de 900px de altura a linha
 * de apoio sai (o rótulo sozinho já identifica a tela), e abaixo de 760px o
 * item aperta mais um pouco. Em 1366x768 o menu inteiro passa a caber sem
 * rolagem nenhuma.
 *
 * `curta:` e `baixinha:` são variantes de ALTURA, declaradas em
 * `estilo/entrada.css` — o Tailwind só traz as de largura.
 *
 * E elas vão ESCRITAS POR INTEIRO nas classes, nunca montadas em pedaços: o
 * Tailwind gera CSS a partir do que ENCONTRA no código-fonte, e um
 * `${PREFIXO}min-h-[42px]` não existe como texto em lugar nenhum — a regra não
 * nasceria, a tela ficaria igual e nada acusaria. Foi o que aconteceu na
 * primeira versão disto.
 */

/** O item do menu. As medidas vieram do `.nav-btn` da casca antiga, que já saiu. */
const ITEM =
  "grid min-h-[50px] grid-cols-[30px_minmax(0,1fr)] items-center gap-[10px] rounded-[10px] baixinha:grid-cols-[26px_minmax(0,1fr)]" +
  // `no-underline`: o item virou <a>, e link sublinhado num menu lateral não é
  // o desenho desta casca — era <button> antes e assim continua parecendo.
  " border border-transparent px-[10px] py-2 text-left no-underline transition-colors" +
  " curta:min-h-[40px] curta:py-1" +
  " baixinha:min-h-[36px]" +
  // Barra estreita: o ícone sozinho, centrado.
  " tela:max-[1100px]:grid-cols-[1fr] tela:max-[1100px]:justify-items-center tela:max-[1100px]:p-[7px]";

/** O rótulo e a linha de apoio somem quando a barra encolhe. */
const TEXTO_DO_ITEM = "grid min-w-0 gap-0.5 tela:max-[1100px]:hidden";

/**
 * A linha de apoio sai quando a janela é baixa: ela é útil, mas é a primeira
 * coisa que se troca por caber — o rótulo sozinho já diz qual tela é.
 */
const APOIO_SOME = "curta:hidden";

const ITEM_PARADO = "text-tinta-fraca hover:border-linha hover:bg-[var(--surface-hover)] hover:text-tinta";

/** O ativo: borda âmbar, fundo suave e a barrinha de 3px encostada na esquerda. */
const ITEM_ATIVO =
  "border-[var(--accent-line)] bg-[var(--accent-soft)] text-white shadow-[inset_3px_0_var(--accent)]" +
  // Estreita, a barrinha vai para baixo: de lado ela encostaria no ícone.
  " tela:max-[1100px]:shadow-[inset_0_-2px_var(--accent)]";

/*
 * O ícone é o piso da altura do item: `min-h` não encolhe nada enquanto o
 * conteúdo for maior que ele. Por isso, na janela mais baixa, quem encolhe é
 * o ícone — e é o que faz as treze telas caberem num monitor de 1280x720.
 */
const ICONE = "size-[30px] shrink-0 rounded-[8px] border p-[6px] baixinha:size-[26px] baixinha:p-[5px]";
const ICONE_PARADO = "border-linha text-tinta-fraca";
const ICONE_ATIVO = "border-[var(--accent-line)] bg-[var(--accent-soft)] text-ambar";

const ROTULO = "truncate text-[13px] font-semibold tracking-[-0.01em]";
const APOIO = "truncate text-[10.5px] font-[450] text-tinta-apagada";
const APOIO_ATIVO = "truncate text-[10.5px] font-[450] text-[color-mix(in_srgb,var(--accent)_55%,var(--text))]";

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
          // A barra NÃO rola: quem rola é a lista de telas, no meio dela. A
          // marca fica presa no alto e o relógio no pé — antes os dois iam
          // embora junto com a rolagem, e o relógio chegava a cair fora da
          // janela numa tela de 768px.
          "fixed inset-y-0 left-0 z-80 flex w-[244px] flex-col overflow-x-hidden",
          "border-r border-[var(--border-hairline)] bg-[var(--sidebar-bg)] px-4 pt-[22px] pb-[17px]",
          // A barra estreita, entre 801 e 1100px. Ver o cabeçalho.
          "tela:max-[1100px]:w-[78px] tela:max-[1100px]:px-[10px]",
          "shadow-[6px_0_18px_-8px_rgba(0,0,0,0.55)] transition-transform duration-200",
          aberto ? "translate-x-0" : "-translate-x-[105%]",
          "tela:translate-x-0",
        ].join(" ")}
      >
        {/*
          AQUI MORAVA A MARCA — o logo, "Optimize" e "Moldes & encaixe".
          Ela saiu: o nome do programa passou para o pé da barra, junto do
          relógio, e o alto virou o que a barra existe para ser — a lista de
          telas, começando na primeira linha.

          Não é só arrumação: eram ~70px de altura gastos para dizer onde a
          pessoa está, num programa que ela abre o dia inteiro. Com eles de
          volta, as treze telas cabem com folga até num monitor baixo (ver a
          nota sobre `curta:` e `baixinha:`, acima).
        */}

        {/*
          Um <nav> por grupo, cada um rotulado pelo próprio título. É o que faz
          um leitor de tela anunciar "navegação Produção" em vez de despejar dez
          itens seguidos sem dizer onde um assunto acaba e o outro começa.
        */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain curta:gap-2.5 baixinha:gap-2">
          {GRUPOS.map((grupo) => {
            const telas = telasDoGrupo(grupo.nome);
            if (!telas.length) return null;

            return (
              <nav key={grupo.nome} aria-labelledby={`grupo-${grupo.nome}`} className="flex flex-col gap-[3px]">
                <h2
                  id={`grupo-${grupo.nome}`}
                  className="mt-0 mb-1 px-3 text-[10px] font-semibold tracking-[0.12em] text-tinta-apagada uppercase curta:mb-0.5 tela:max-[1100px]:hidden"
                >
                  {grupo.rotulo}
                </h2>

                {telas.map((tela) => (
                  <NavLink
                    key={tela.nome}
                    to={`/${tela.nome}`}
                    onClick={aoFechar}
                    className={({ isActive }) => [ITEM, isActive ? ITEM_ATIVO : ITEM_PARADO].join(" ")}
                  >
                    {({ isActive }) => (
                      <>
                        <Icone
                          referencia={tela.icone}
                          className={[ICONE, isActive ? ICONE_ATIVO : ICONE_PARADO].join(" ")}
                        />
                        <span className={TEXTO_DO_ITEM}>
                          <strong className={ROTULO}>{tela.rotulo}</strong>
                          <small className={`${isActive ? APOIO_ATIVO : APOIO} ${APOIO_SOME}`}>{tela.apoioMenu}</small>
                        </span>
                      </>
                    )}
                  </NavLink>
                ))}

              </nav>
            );
          })}
        </div>

        {/*
          O PÉ DA BARRA: o nome do programa e o relógio.

          O relógio está aqui, e não no cabeçalho, pela mesma razão da casca
          antiga: o cabeçalho some nas telas de bancada — que é onde a pessoa
          passa a tarde — e levava o relógio junto. Aqui embaixo ele fica de pé
          em todas as telas.

          O nome desceu para cá quando a marca saiu do alto. É o lugar certo
          para ele: quem usa o programa não precisa dele para trabalhar, mas
          quem OLHA a tela — de longe, numa foto, num chamado de suporte —
          precisa saber que programa é.

          O bloco fica FORA da parte que rola, encostado no pé: era `mt-auto`
          dentro dela, e numa janela baixa descia junto com a lista para fora
          da vista.
        */}
        <div className="shrink-0 border-t border-[var(--border-hairline)] px-[10px] pt-[9px] pb-0.5">
          <span className="block truncate font-titulo text-[12px] font-semibold tracking-[-0.01em] text-tinta-fraca tela:max-[1100px]:hidden">
            CodeEx Optmize
          </span>

          <span className="mt-[5px] flex items-center gap-[9px] tela:max-[1100px]:mt-0 tela:max-[1100px]:justify-center">
            <Icone referencia="icones.svg#clock" className="size-3.5 shrink-0 text-ambar opacity-75" />
            <span className="flex min-w-0 items-baseline gap-1.5 leading-[1.25] tela:max-[1100px]:hidden">
              <span className="truncate text-[10.5px] text-tinta-apagada capitalize">{relogio.data}</span>
              <strong className="font-mono text-[11px] font-semibold text-tinta-fraca">{relogio.hora}</strong>
            </span>
          </span>
        </div>
      </aside>
    </>
  );
}
