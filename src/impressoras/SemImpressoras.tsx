/**
 * ===========================================================================
 * A PORTA — o painel de Impressoras enquanto não existe nenhuma impressora
 * ===========================================================================
 *
 * Esta é a primeira tela que o sistema mostra a quem acabou de instalá-lo, e
 * ela tem exatamente uma coisa a dizer: procure as máquinas na rede. Não é um
 * painel vazio nem uma lista com zero linhas — é uma porta, e uma porta tem
 * uma maçaneta só.
 *
 * Daí o desenho: A IMPRESSORA É O BOTÃO. Um bloco grande no meio da janela
 * com o desenho dela dentro, e mais nada — clicou, a máquina começa a
 * imprimir e a rede começa a ser varrida; clicou de novo, para. Não é uma
 * ilustração ao lado de um botão: é o mesmo objeto, e por isso ninguém
 * precisa ler para saber onde clicar.
 *
 * Sem cabeçalho de página (o `useSemCabecalho` o esconde): ele repetiria a
 * palavra "Impressoras" em cima de uma tela que ainda não tem impressora
 * nenhuma, e cobraria 57px justo do bloco que precisa ficar no meio da
 * altura.
 *
 * E sem o resto: os passos da varredura, o placar de endereços testados, a
 * barra de progresso e o atalho para a tela de Máquinas saíram todos. Eram
 * seis blocos de informação para uma tela que faz uma coisa só. O que sobrou
 * é o que a pessoa precisa: a máquina, uma frase dizendo o que está
 * acontecendo, e o clique.
 *
 * A tela de Máquinas só abre SE A VARREDURA ACHAR ALGUMA COISA — e só a
 * varredura desta visita. As impressoras encontradas precisam de um NOME
 * antes de entrar (ver `telas/Maquinas.tsx`), e é para isso que a porta leva
 * para lá; é o único momento em que ela navega sozinha. Terminando sem achar
 * nada, a tela FICA: mandar alguém para uma lista vazia de máquinas é trocar
 * "não achei nada" por "não tem nada aqui", que é a mesma notícia dada pior.
 *
 * Também não é o `results` sozinho que decide. Ele é o resultado da última
 * varredura que o SERVIDOR rodou, e pode ser de ontem, de outro computador ou
 * de quem já disse "agora não" para as máquinas que apareceram: quem abrisse
 * o painel cairia direto em Máquinas sem ter procurado nada. Por isso a porta
 * só se afasta depois de uma varredura que ELA começou, e depois que essa
 * varredura terminou.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icone } from "../casca/Icone";
import { useSemCabecalho } from "../casca/semCabecalho";
import { ImpressoraProcurando } from "./Procura";
import { useVarredura } from "./varredura";

/**
 * Quanto tempo a notícia "achei duas impressoras" fica na tela antes de a
 * porta dar lugar à tela de Máquinas. Curto o bastante para não parecer
 * travado, longo o bastante para ser lido.
 */
const ESPERA_ANTES_DE_ABRIR = 1400;

export function SemImpressoras() {
  useSemCabecalho(true);

  const navegar = useNavigate();
  const { estado, rodando, falha, procurar, parar } = useVarredura();

  const fase = estado?.phase ?? "idle";
  const achadas = estado?.results.length ?? 0;

  /* `procureiAqui` é o que separa a varredura desta visita da que já estava
     guardada no servidor. Ver o cabeçalho. */
  const [procureiAqui, setProcureiAqui] = useState(false);
  const achou = procureiAqui && !rodando && fase === "done" && achadas > 0;
  const terminouVazio = procureiAqui && fase === "done" && achadas === 0;

  const comecar = useCallback(() => {
    setProcureiAqui(true);
    procurar();
  }, [procurar]);

  /*
   * A varredura NÃO começa sozinha.
   *
   * Ela já começou, numa versão anterior desta tela, e fazia sentido enquanto
   * o botão era um botão comum embaixo de uma ilustração: a ilustração não
   * pedia nada, então a tela se adiantava. Agora a máquina É o botão, e ela
   * parada é o convite — deixar a animação já rodando ao abrir tira da pessoa
   * a única coisa que esta tela tem para ela fazer, e transforma o clique num
   * "parar" que ninguém pediu.
   *
   * Quem chega aqui vê a impressora quieta e uma frase; clica, e ela imprime.
   */

  /*
   * Achou: quem manda agora é a tela de dar nome. A troca espera a varredura
   * terminar e ainda demora `ESPERA_ANTES_DE_ABRIR` — sem isso a tela
   * desapareceria no mesmo quadro em que a notícia apareceu, e ninguém leria
   * quantas impressoras entraram.
   */
  useEffect(() => {
    if (!achou) return;
    const relogio = window.setTimeout(() => navegar("/maquinas"), ESPERA_ANTES_DE_ABRIR);
    return () => window.clearTimeout(relogio);
  }, [achou, navegar]);

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-[460px] flex-col items-center text-center">
        {/*
          O BOTÃO GIGANTE. A impressora mora dentro dele, e é ele a tela
          inteira: um <button> de verdade, então Tab chega nele, Enter e Espaço
          acionam, e um leitor de tela o anuncia como botão — coisas que um
          <div> com `onClick` não daria de graça.

          Enquanto está de saída (achou, e vai abrir Máquinas) ele fica
          `disabled`: clicar ali naquele segundo só atrapalharia o que já deu
          certo.
        */}
        <button
          type="button"
          onClick={() => (rodando ? parar() : comecar())}
          disabled={achou}
          aria-label={rodando ? "Parar a procura" : "Procurar impressoras na rede"}
          className={[
            "group grid w-[min(78vw,340px)] place-items-center rounded-[32px] border-2 p-6 transition-all duration-200",
            "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ambar",
            rodando
              ? "border-[var(--accent-line)] bg-[var(--accent-soft)] shadow-[0_30px_70px_-30px_var(--accent)]"
              : "border-linha bg-painel hover:border-[var(--accent-line)] hover:bg-painel-suave",
            achou ? "cursor-default" : "cursor-pointer active:scale-[0.98]",
          ].join(" ")}
        >
          <ImpressoraProcurando ativo={rodando} className="w-full" />
        </button>

        <h1 className="mt-8 mb-0 font-titulo text-[1.35rem] leading-tight font-semibold tracking-[-0.03em] text-tinta">
          {achou
            ? `${achadas} impressora${achadas > 1 ? "s" : ""} encontrada${achadas > 1 ? "s" : ""}`
            : rodando
              ? "Procurando na rede..."
              : terminouVazio
                ? "Nenhuma impressora respondeu"
                : "Nenhuma impressora ainda"}
        </h1>

        {/*
          UMA frase. A da varredura em curso é a do servidor ("Varrendo
          192.168.0.0/24"), que é a única informação de progresso que sobrou —
          e é a que diz, sozinha, que a coisa não travou.
        */}
        <p className="mt-2.5 mb-0 max-w-[400px] text-[0.86rem] leading-relaxed text-tinta-fraca">
          {achou
            ? "Abrindo a tela de Máquinas para você dar um nome a cada uma..."
            : rodando
              ? estado?.message || "Testando os endereços da rede local."
              : terminouVazio
                ? "Confira se as máquinas estão ligadas e na mesma rede, e toque de novo."
                : "Toque na impressora para procurar as máquinas na rede."}
        </p>

        {(falha || estado?.error) && (
          <p className="mt-4 mb-0 flex items-center gap-2 text-[0.82rem] text-alerta">
            <Icone referencia="icones.svg#triangle-alert" className="size-4 shrink-0" />
            {falha || estado?.error}
          </p>
        )}
      </div>
    </div>
  );
}
