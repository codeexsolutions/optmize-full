/**
 * ===========================================================================
 * REPOSIÇÃO — o que foi reimpresso, semana a semana
 * ===========================================================================
 *
 * Reposição é trabalho refeito: peça que saiu errada, rasgou, desbotou, e
 * precisou ser impressa de novo. Ela é metro gasto duas vezes pelo mesmo
 * pedido, então acompanhar quanto ela pesa por semana é acompanhar quanto a
 * produção está custando de retrabalho.
 *
 * Como um trabalho é reconhecido como reposição: pelo nome. Quem monta o
 * arquivo escreve "reposição" nele, e o servidor procura essa palavra sem
 * acento e sem caixa (`normalizeText`, em `impressoras/utils/text.js`). Não é
 * um campo do sistema — é uma convenção da produção que o sistema apenas lê.
 *
 * Isso tem uma consequência que vale dizer em voz alta: **o número aqui é um
 * piso, não um total.** Reposição que ninguém escreveu no nome não aparece.
 * Se um dia isso virar decisão de dinheiro, o caminho é marcar a reposição no
 * momento de lançar o trabalho, não afinar a busca por palavra.
 *
 * A semana é de segunda a domingo (`weekBounds`), e não a semana do
 * calendário do navegador: é como a fábrica conta o turno.
 */

import { useState } from "react";
import { api } from "../api/cliente";
import { useDados } from "../api/useDados";
import { Cartao } from "../casca/Cartao";
import { Icone } from "../casca/Icone";
import { useRecarregarComEventos } from "../impressoras/socket";
import { dataBr, metros, metrosCurtos } from "../impressoras/formato";

interface ItemDaSemana {
  id: string;
  date: string;
  time: string;
  machineName: string;
  task: string;
  printLength: number;
}

interface Semana {
  weekStart: string;
  weekEnd: string;
  totalMeters: number;
  count: number;
  items: ItemDaSemana[];
}

interface RespostaDeReposicao {
  weeks: Semana[];
  totalMeters: number;
  totalCount: number;
}

export function Reposicao() {
  const { dados, carregando, erro, recarregar } = useDados<RespostaDeReposicao>(
    () => api.get<RespostaDeReposicao>("/impressoras/reposicao"),
  );

  useRecarregarComEventos(["new-print", "history-updated"], recarregar);

  // A semana mais recente já vem aberta: é a única que alguém costuma querer
  // ver por inteiro. As de trás são para comparar o número, não para reler.
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set());

  const alternar = (semana: string) => {
    setAbertas((antes) => {
      const proximo = new Set(antes);
      if (proximo.has(semana)) proximo.delete(semana); else proximo.add(semana);
      return proximo;
    });
  };

  const media = dados && dados.weeks.length
    ? dados.totalMeters / dados.weeks.length
    : 0;

  return (
    <>
      <Cartao
        titulo="Reposição"
        icone="icones.svg#rotate-ccw"
        apoio="Trabalho refeito, por semana. Reconhecido pela palavra “reposição” no nome do arquivo."
      >
        {carregando && <p className="m-0 text-[0.85rem] text-tinta-fraca">Carregando...</p>}

        {erro && (
          <p className="m-0 flex items-center gap-2 text-[0.85rem] text-alerta">
            <Icone referencia="icones.svg#triangle-alert" className="size-4 shrink-0" />
            {erro}
          </p>
        )}

        {dados && dados.totalCount === 0 && (
          <p className="m-0 text-[0.85rem] text-tinta-fraca">
            Nenhuma reposição no histórico. Ou não houve, ou o nome do arquivo não
            trazia a palavra — ver o cabeçalho desta tela.
          </p>
        )}

        {dados && dados.totalCount > 0 && (
          <>
            <p className="m-0 font-mono text-[2.2rem] leading-none font-semibold text-atencao">
              {metrosCurtos(dados.totalMeters)}
            </p>
            <p className="mt-1 mb-0 text-[0.8rem] text-tinta-fraca">
              {dados.totalCount} reposição(ões) em {dados.weeks.length} semana(s) —
              média de {metrosCurtos(media)} por semana.
            </p>
          </>
        )}
      </Cartao>

      {dados && dados.weeks.length > 0 && (
        <Cartao titulo="Por semana" icone="icones.svg#calendar" apoio="Da mais recente para a mais antiga. Clique para ver os trabalhos.">
          <ul className="m-0 grid list-none gap-2 p-0">
            {dados.weeks.map((semana) => {
              const aberta = abertas.has(semana.weekStart);
              return (
                <li key={semana.weekStart} className="overflow-hidden rounded-[10px] border border-linha bg-painel-suave">
                  <button
                    type="button"
                    onClick={() => alternar(semana.weekStart)}
                    aria-expanded={aberta}
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--surface-hover)]"
                  >
                    <Icone
                      referencia="icones.svg#chevron-right"
                      className={`size-4 shrink-0 text-tinta-apagada transition-transform ${aberta ? "rotate-90" : ""}`}
                    />
                    <span className="min-w-0 flex-1 text-[0.85rem] text-tinta">
                      {dataBr(semana.weekStart)} a {dataBr(semana.weekEnd)}
                    </span>
                    <span className="shrink-0 text-[0.75rem] text-tinta-apagada">
                      {semana.count} trabalho(s)
                    </span>
                    <strong className="w-24 shrink-0 text-right font-mono text-[0.88rem] text-atencao">
                      {metros(semana.totalMeters)}
                    </strong>
                  </button>

                  {aberta && (
                    <div className="border-t border-linha px-3.5 py-2.5">
                      <ul className="m-0 grid list-none gap-1.5 p-0">
                        {semana.items.map((item) => (
                          <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.78rem]">
                            <span className="font-mono text-tinta-apagada">
                              {dataBr(item.date)} {item.time}
                            </span>
                            <span className="text-tinta-apagada">{item.machineName}</span>
                            <span className="min-w-0 flex-1 truncate text-tinta-fraca" title={item.task}>
                              {item.task}
                            </span>
                            <span className="shrink-0 font-mono text-tinta">{metros(item.printLength)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Cartao>
      )}
    </>
  );
}
