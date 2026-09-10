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
 * Largura, recuos, a marca, o estado do item ativo e o relógio no pé: tudo
 * aqui foi copiado de `public/style.css` e `public/interface.css`, que era o
 * menu da tela antiga. Enquanto as duas cascas conviveram, um clique que
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

/** O item do menu, nas medidas do `.nav-btn` da casca antiga. */
const ITEM =
  "grid min-h-[50px] grid-cols-[30px_minmax(0,1fr)] items-center gap-[10px] rounded-[10px]" +
  // `no-underline`: o item virou <a>, e link sublinhado num menu lateral não é
  // o desenho desta casca — era <button> antes e assim continua parecendo.
  " border border-transparent px-[10px] py-2 text-left no-underline transition-colors" +
  // Barra estreita: o ícone sozinho, centrado.
  " tela:max-[1100px]:grid-cols-[1fr] tela:max-[1100px]:justify-items-center tela:max-[1100px]:p-[7px]";

/** O rótulo e a linha de apoio somem quando a barra encolhe. */
const TEXTO_DO_ITEM = "grid min-w-0 gap-0.5 tela:max-[1100px]:hidden";

const ITEM_PARADO = "text-tinta-fraca hover:border-linha hover:bg-[var(--surface-hover)] hover:text-tinta";

/** O ativo: borda âmbar, fundo suave e a barrinha de 3px encostada na esquerda. */
const ITEM_ATIVO =
  "border-[var(--accent-line)] bg-[var(--accent-soft)] text-white shadow-[inset_3px_0_var(--accent)]" +
  // Estreita, a barrinha vai para baixo: de lado ela encostaria no ícone.
  " tela:max-[1100px]:shadow-[inset_0_-2px_var(--accent)]";

const ICONE = "size-[30px] shrink-0 rounded-[8px] border p-[6px]";
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
          "fixed inset-y-0 left-0 z-80 flex w-[244px] flex-col gap-[18px] overflow-x-hidden overflow-y-auto",
          "border-r border-[var(--border-hairline)] bg-[var(--sidebar-bg)] px-4 pt-[22px] pb-[17px]",
          // A barra estreita, entre 801 e 1100px. Ver o cabeçalho.
          "tela:max-[1100px]:w-[78px] tela:max-[1100px]:px-[10px]",
          "shadow-[6px_0_18px_-8px_rgba(0,0,0,0.55)] transition-transform duration-200",
          aberto ? "translate-x-0" : "-translate-x-[105%]",
          "tela:translate-x-0",
        ].join(" ")}
      >
        {/* A marca. O mesmo logo.png da casca antiga, servido de `estatico/`. */}
        <div className="flex items-center gap-3 px-[7px] pt-0.5 pb-[18px] tela:max-[1100px]:justify-center tela:max-[1100px]:px-0">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt=""
            width={40}
            height={40}
            draggable={false}
            className="size-10 shrink-0 rounded-[11px] border border-[var(--accent-line)] bg-ambar shadow-[0_8px_18px_rgba(0,0,0,0.4)]"
          />
          <span className="flex min-w-0 flex-col tela:max-[1100px]:hidden">
            <span className="truncate font-titulo text-[17px] font-bold tracking-[-0.02em] text-tinta">Optimize</span>
            <small className="mt-[3px] text-[10px] font-semibold tracking-[0.1em] text-tinta-apagada uppercase">
              Moldes &amp; encaixe
            </small>
          </span>
        </div>

        {/*
          Um <nav> por grupo, cada um rotulado pelo próprio título. É o que faz
          um leitor de tela anunciar "navegação Produção" em vez de despejar dez
          itens seguidos sem dizer onde um assunto acaba e o outro começa.
        */}
        <div className="flex flex-col gap-4">
          {GRUPOS.map((grupo) => {
            const telas = telasDoGrupo(grupo.nome);
            if (!telas.length) return null;

            return (
              <nav key={grupo.nome} aria-labelledby={`grupo-${grupo.nome}`} className="flex flex-col gap-[3px]">
                <h2
                  id={`grupo-${grupo.nome}`}
                  className="mt-0 mb-1 px-3 text-[10px] font-semibold tracking-[0.12em] text-tinta-apagada uppercase tela:max-[1100px]:hidden"
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
                          <small className={isActive ? APOIO_ATIVO : APOIO}>{tela.apoioMenu}</small>
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
          O relógio mora no pé do menu, e não no cabeçalho — mesma decisão da
          casca antiga, e o motivo está lá: o cabeçalho some na tela de encaixe,
          que é onde a pessoa passa a tarde, e levava o relógio junto. Aqui
          embaixo ele fica de pé em todas as telas.

          `mt-auto` encosta no pé por conta própria, sem depender de quantos
          botões o menu tem.
        */}
        <div className="mt-auto flex items-center gap-[9px] border-t border-[var(--border-hairline)] px-[10px] pt-[11px] pb-0.5 tela:max-[1100px]:justify-center">
          <Icone referencia="icones.svg#clock" className="size-3.5 shrink-0 text-ambar opacity-75" />
          <span className="flex min-w-0 flex-col gap-px leading-[1.25] tela:max-[1100px]:hidden">
            <span className="text-[10.5px] text-tinta-apagada capitalize">{relogio.data}</span>
            <strong className="font-mono text-xs font-semibold text-tinta-fraca">{relogio.hora}</strong>
          </span>
        </div>
      </aside>
    </>
  );
}
