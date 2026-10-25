/**
 * O menu lateral.
 *
 * No computador ele fica fixo à esquerda. No celular vira gaveta: sai da tela
 * até alguém tocar no botão do cabeçalho, e fecha ao escolher uma tela, ao
 * clicar fora ou no Esc.
 *
 * As telas vêm separadas por grupo. Quem decide o grupo de cada uma é
 * `src/rotas.ts`: este arquivo não sabe o que é molde, encaixe ou impressora —
 * só desenha a tabela que recebe.
 *
 * Cada item é um `<NavLink>`, um `<a>` de verdade: abre em outra aba pelo meio
 * do mouse, mostra o endereço ao passar por cima e é anunciado como link por
 * um leitor de tela. Quem marca o item aberto é o próprio router.
 *
 * ---------------------------------------------------------------------------
 * O DESENHO, DESDE 2026-10-21: O DO FLOW
 * ---------------------------------------------------------------------------
 *
 * A mesma barra do CodeEx Flow (`shared/ui/Sidebar.tsx`, lá no outro
 * repositório), nas cores do Optmize, para quem usa os dois reconhecer a casa:
 *
 *   - a marca numa caixa com anel laranja, o nome grande e a empresa embaixo;
 *   - o item aberto é uma PÍLULA cheia na cor da marca, com o texto claro;
 *   - o título do grupo em laranja suave, com um traço que apaga;
 *   - o Sobre fica embaixo, fora da navegação, onde o Flow põe "Ajuda";
 *   - no pé, o cartão de quem está usando, com Configurações e Sair. O Painel
 *     dos acessos foi para dentro de Configurações (ver `telas/Conta.tsx`).
 *
 * O fundo leva a malha de pontos e o brilho no alto do Flow (`.menu-fundo`,
 * em `estilo/entrada.css`).
 *
 * ---------------------------------------------------------------------------
 * ELA RECOLHE SOZINHA (desde 2026-10-21)
 * ---------------------------------------------------------------------------
 *
 * No computador a barra fica RECOLHIDA, com 72px — só os ícones. Quando o
 * mouse entra (ou o foco, pelo teclado) ela abre para 272px POR CIMA da tela,
 * sem empurrar nada; quando o mouse sai e o foco sai, ela recolhe. Quem abre
 * espaço para ela é o `ml-[72px]` do <main>, em `Casca.tsx` — por isso a
 * tela não pula quando ela abre.
 *
 * O texto não some de uma vez: os rótulos ficam no lugar e a barra os corta
 * enquanto encolhe, apagando junto (`.menu-some`). Os ícones não se mexem,
 * porque estão sempre na mesma coluna à esquerda. No celular continua sendo
 * a gaveta inteira.
 */

import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { Icone } from "./Icone";
import { iniciais, type Usuario } from "./usuario";
import { GRUPOS, telasDoGrupo, type Tela } from "../rotas";
import { useEscopos, useForaDoPlano } from "./Escopos";
import { useTema } from "../estado/tema";

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  /**
   * Quem está usando, vindo de cima. A barra não lê a sessão sozinha: a casca
   * já a lê, e um segundo hook faria um segundo pedido para saber a mesma
   * coisa. `null` é ninguém logado, e aí o cartão da conta não nasce.
   */
  usuario: Usuario | null;
  /** Sai da conta, JÁ CONFIRMADO — quem pergunta é a barra, logo abaixo. */
  aoSair: () => void;
}

/** O que cada papel lê no cartão do pé. */
const PAPEL: Record<string, string> = {
  dono: "Usuário master",
  admin: "Administrador",
  operador: "Funcionário",
  leitor: "Consulta",
};

/*
 * O ITEM, como no Flow: pílula de canto redondo, 15px, ícone numa coluna de
 * 24px. `curta:` é variante de ALTURA de janela (ver `estilo/entrada.css`) e
 * vai escrita por inteiro: o Tailwind só gera a regra que encontra como texto.
 */
const ITEM =
  "menu-item group relative flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px]" +
  " no-underline transition-colors duration-200 curta:min-h-[38px] curta:py-1.5";

/** O rótulo some quando a barra encolhe — sobra o ícone. */
const TEXTO_DO_ITEM = "menu-some relative min-w-0 flex-1 truncate";

const ITEM_PARADO = "text-tinta-fraca hover:bg-[var(--surface-hover)] hover:text-tinta";

/** O aberto: a pílula cheia (`.menu-item-aberto`), com o texto na tinta do laranja. */
const ITEM_ATIVO = "menu-item-aberto text-ambar-tinta";

const ICONE_CAIXA = "relative flex w-6 shrink-0 justify-center transition-colors duration-200";
const ICONE_PARADO = "text-tinta-apagada group-hover:text-ambar";
const ICONE_ATIVO = "text-ambar-tinta";

/** Os botões do cartão do pé: Configurações e Sair. */
const PE_BOTAO =
  "grid size-9 shrink-0 place-items-center rounded-lg border-0 bg-transparent p-0 no-underline transition-all duration-200";

export function Menu({ aberto, aoFechar, usuario, aoSair }: Props) {
  /*
    O QUE NÃO ESTÁ NO PLANO NEM APARECE, e o grupo que ficar vazio some junto.
    Sem resposta sobre o plano (`null`), tudo aparece — a mesma escolha de
    `casca/Escopos.tsx`: não esconder o programa de quem pagou.
  */
  const escopos = useEscopos();
  const noPlano = (tela: Tela) => !tela.escopo || escopos === null || escopos.includes(tela.escopo);

  /*
    SAIR VAI DIRETO para a tela de saída, sem perguntar (pedido do dono em
    2026-10-21): quem aperta o botão de sair quer sair.
  */
  function pedirParaSair() {
    aoSair();
  }

  /*
    RECOLHIDA sempre que o mouse sai. O foco só a segura aberta quando veio do
    TECLADO (`:focus-visible`): o clique num item também deixa o foco nele, e
    aí a barra ficava aberta depois de o mouse sair. A saída espera um
    instante, para passar rente à borda não fazer a barra piscar.
    Só no computador (`tela:`, 801px ou mais): no celular ela é a gaveta.
  */
  const [ehComputador, setEhComputador] = useState(() => window.matchMedia("(min-width: 801px)").matches);
  const [expandida, setExpandida] = useState(false);
  const saida = useRef<number | undefined>(undefined);
  const barra = useRef<HTMLElement>(null);
  useEffect(() => {
    const consulta = window.matchMedia("(min-width: 801px)");
    const mudou = () => setEhComputador(consulta.matches);
    consulta.addEventListener("change", mudou);
    return () => consulta.removeEventListener("change", mudou);
  }, []);
  const abrir = () => { window.clearTimeout(saida.current); setExpandida(true); };
  const recolher = () => {
    window.clearTimeout(saida.current);
    saida.current = window.setTimeout(() => {
      const foco = document.activeElement;
      const comMouse = barra.current?.matches(":hover");
      const focoDoTeclado = !!foco && !!barra.current?.contains(foco) && foco.matches(":focus-visible");
      if (!comMouse && !focoDoTeclado) setExpandida(false);
    }, 180);
  };
  useEffect(() => () => window.clearTimeout(saida.current), []);
  const recolhida = ehComputador && !expandida;

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
        ref={barra}
        onMouseEnter={abrir}
        onMouseLeave={recolher}
        onFocus={(e) => { if (e.target.matches(":focus-visible")) abrir(); }}
        onBlur={recolher}
        className={[
          // A barra não rola: quem rola é a lista de telas. O pé fica preso embaixo.
          "menu-fundo fixed inset-y-0 left-0 z-80 flex w-[272px] flex-col overflow-x-hidden",
          "border-r border-[var(--border-hairline)]",
          // Recolhida: 72px, só os ícones. Aberta, a sombra diz que está por cima.
          recolhida ? "menu-recolhida tela:w-[72px]" : "menu-expandida",
          "transition-[transform,width,box-shadow] duration-200",
          aberto ? "translate-x-0" : "-translate-x-[105%]",
          "tela:translate-x-0",
        ].join(" ")}
      >
        {/* O fio de luz na borda direita, na cor da marca, apagando para baixo. */}
        <span aria-hidden="true" className="menu-fio pointer-events-none absolute inset-y-0 right-0 w-px" />

        {/*
          A CABEÇA: a marca numa caixa com anel laranja, o nome grande e a
          empresa que assina a licença embaixo.
        */}
        <div className="relative flex shrink-0 items-center gap-3.5 px-3 pt-5 pb-3 curta:pt-3">
          <span className="relative size-12 shrink-0 curta:size-10">
            <span aria-hidden="true" className="menu-logo-brilho absolute -inset-1 rounded-xl bg-[var(--accent-line)] blur-md" />
            <span className="menu-logo relative grid size-full place-items-center overflow-hidden rounded-2xl bg-painel ring-1 ring-[var(--accent-line)]">
              <img src={`${import.meta.env.BASE_URL}icone.png`} alt="" className="size-[70%] rounded-[6px]" />
            </span>
          </span>
          {/* Na barra estreita o texto vira `sr-only`: some da vista e continua sendo lido. */}
          <span className="menu-some min-w-0 flex-1">
            <span className="block truncate font-titulo text-[17px] leading-tight text-tinta">
              CodeEx <span className="text-ambar">Optmize</span>
            </span>
            <span className="mt-1 block truncate text-[12px] leading-tight text-ambar/80">
              {usuario?.empresa || "Moldes e encaixe"}
            </span>
          </span>
        </div>
        {/* A tira de conferência de cor: só no tema Impressão (ver `.menu-tira`). */}
        <span aria-hidden="true" className="menu-tira mx-3 mb-1">
          <i /><i /><i /><i /><i /><i /><i />
        </span>

        {/*
          Um <nav> por grupo, rotulado pelo próprio título: o leitor de tela
          anuncia "navegação Produção" em vez de despejar os itens seguidos.
        */}
        <div className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-4">
          {GRUPOS.map((grupo) => {
            const telas = telasDoGrupo(grupo.nome).filter(noPlano);
            if (!telas.length) return null;

            return (
              <nav key={grupo.nome} aria-labelledby={`grupo-${grupo.nome}`}>
                <h2
                  id={`grupo-${grupo.nome}`}
                  className="menu-some m-0 flex items-center gap-2 px-3 pt-2 pb-2 text-[12px] whitespace-nowrap text-ambar"
                >
                  {grupo.rotulo}
                  <span aria-hidden="true" className="menu-traco h-px flex-1" />
                </h2>
                <div className="flex flex-col gap-0.5">
                  {telas.map((tela) => (
                    <ItemDoMenu key={tela.nome} tela={tela} aoFechar={aoFechar} />
                  ))}
                </div>
              </nav>
            );
          })}
        </div>

        {/*
          O SOBRE fica fora da navegação, como o "Ajuda e suporte" do Flow: não
          é lugar que se visita no trabalho, é a saída para quando algo trava.
        */}
        <div className="relative mx-3 mb-3 flex shrink-0 flex-col gap-0.5">
          <BotaoDoTema />
          <NavLink
            to="/sobre"
            onClick={aoFechar}
            title="Sobre o Optmize e suporte"
            className={({ isActive }) => [ITEM, isActive ? ITEM_ATIVO : ITEM_PARADO].join(" ")}
          >
            {({ isActive }) => (
              <>
                <span className={`${ICONE_CAIXA} ${isActive ? ICONE_ATIVO : ICONE_PARADO}`}>
                  <Icone referencia="icones.svg#life-buoy" className="size-[21px]" />
                </span>
                <span className={TEXTO_DO_ITEM}>Sobre e suporte</span>
              </>
            )}
          </NavLink>
        </div>

        {/*
          O PÉ: o cartão de quem está sentado nesta máquina, com Configurações
          (onde moram a conta, a aparência e o painel dos acessos) e Sair.

          Na barra estreita o cartão vira coluna: o avatar em cima, os dois
          botões embaixo.
        */}
        <div className="relative shrink-0 border-t border-[var(--border-hairline)] p-2.5">
          <div className="flex items-center gap-2.5 rounded-2xl border border-[var(--border-hairline)] bg-[var(--surface-hover)]/40 p-2">
            {/*
              A EMPRESA EM PRIMEIRO, e não a pessoa (pedido do dono em
              2026-10-21): quem compra é a empresa, e quem senta na máquina é
              um funcionário dela. A logo no lugar das iniciais — sem logo
              enviada, as iniciais da EMPRESA —, e embaixo, pequeno, quem
              entrou nesta máquina.
            */}
            {usuario && (
              <>
                {usuario.logo ? (
                  <img
                    src={usuario.logo}
                    alt=""
                    className="size-10 shrink-0 rounded-xl border border-[var(--border-hairline)] bg-white object-contain p-1"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="menu-avatar grid size-10 shrink-0 place-items-center rounded-xl text-[13px] text-ambar-tinta"
                  >
                    {iniciais(usuario.empresa || usuario.nome)}
                  </span>
                )}
                <span className="menu-some min-w-0 flex-1">
                  <span title={usuario.empresa || usuario.nome} className="block truncate text-[14px] leading-tight text-tinta">
                    {usuario.empresa || usuario.nome}
                  </span>
                  <span
                    title={`${usuario.nome} · ${PAPEL[usuario.papel] || "Conectado"}`}
                    className="mt-0.5 block truncate text-[12px] leading-tight text-tinta-apagada"
                  >
                    {usuario.empresa ? usuario.nome : PAPEL[usuario.papel] || "Conectado"}
                  </span>
                </span>
              </>
            )}

            <NavLink
              to="/conta"
              onClick={aoFechar}
              title="Configurações"
              aria-label="Configurações"
              className={({ isActive }) =>
                `${PE_BOTAO} hover:rotate-45 hover:bg-[var(--surface-hover)] ${isActive ? "text-ambar" : "text-tinta-apagada hover:text-ambar"}`}
            >
              <Icone referencia="icones.svg#settings" className="size-[20px]" />
            </NavLink>

            {/*
              SAIR só existe quando há de quem sair. O aviso antes não é
              cerimônia: num computador compartilhado, um clique acidental no
              fim do expediente deixa o turno seguinte parado na porta.
            */}
            {usuario && (
              <button
                type="button"
                onClick={pedirParaSair}
                title="Sair da conta"
                aria-label="Sair da conta"
                className={`${PE_BOTAO} text-tinta-apagada hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] hover:text-alerta`}
              >
                <Icone referencia="icones.svg#log-out" className="size-[20px]" />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}


/**
 * CLARO OU ESCURO, num clique, logo acima do Sobre.
 *
 * O ícone é o tema que está valendo (sol no claro, lua no escuro); o clique
 * troca para o outro, com o círculo de `estado/tema.ts` saindo do botão. No
 * modo "Sistema" (escolhido em Configurações › Aparência) vale o que o Windows
 * está mostrando agora, e o clique passa a fixar o oposto.
 */
function BotaoDoTema() {
  const modo = useTema((e) => e.modo);
  const escolher = useTema((e) => e.escolher);
  const escuro = modo === "sistema" ? document.documentElement.dataset.tema !== "claro" : modo === "escuro";

  return (
    <button
      type="button"
      onClick={(e) => escolher(escuro ? "claro" : "escuro", { x: e.clientX, y: e.clientY })}
      title={escuro ? "Mudar para o tema claro" : "Mudar para o tema escuro"}
      aria-label={escuro ? "Mudar para o tema claro" : "Mudar para o tema escuro"}
      className={`${ITEM} ${ITEM_PARADO} w-full cursor-pointer border-0 bg-transparent`}
    >
      <span className={`${ICONE_CAIXA} ${ICONE_PARADO}`}>
        <Icone referencia={escuro ? "icones.svg#moon" : "icones.svg#sun"} className="size-[21px]" />
      </span>
      <span className={TEXTO_DO_ITEM}>{escuro ? "Tema escuro" : "Tema claro"}</span>
      {/* O par, com o que está valendo aceso. */}
      <span aria-hidden="true" className="menu-some relative flex shrink-0 gap-0.5 rounded-lg border border-[var(--border-hairline)] p-0.5">
        <span className={`grid size-6 place-items-center rounded-md ${escuro ? "text-tinta-apagada" : "bg-[var(--surface-hover)] text-ambar"}`}>
          <Icone referencia="icones.svg#sun" className="size-3.5" />
        </span>
        <span className={`grid size-6 place-items-center rounded-md ${escuro ? "bg-[var(--surface-hover)] text-ambar" : "text-tinta-apagada"}`}>
          <Icone referencia="icones.svg#moon" className="size-3.5" />
        </span>
      </span>
    </button>
  );
}

/**
 * Uma linha do menu.
 *
 * Componente por causa do cadeado: saber se a tela está no plano é pergunta
 * de hook (`useForaDoPlano`), e hook não se chama dentro de um `map`.
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
      /* A linha de apoio não é desenhada: vive aqui, no balão. */
      title={balao}
      className={({ isActive }) => [ITEM, isActive ? ITEM_ATIVO : ITEM_PARADO,
        comCadeado && !isActive ? "opacity-55" : ""].join(" ")}
    >
      {({ isActive }) => (
        <>
          {/* Tela com cadeado troca o ícone pelo cadeado: na barra estreita o nome some e o ícone fica. */}
          <span className={`${ICONE_CAIXA} ${isActive ? ICONE_ATIVO : ICONE_PARADO}`}>
            <Icone referencia={comCadeado ? "icones.svg#lock" : tela.icone} className="size-[21px]" />
          </span>
          <span className={TEXTO_DO_ITEM}>{tela.rotulo}</span>
        </>
      )}
    </NavLink>
  );
}
