/**
 * ===========================================================================
 * RELATÓRIO DO ENCAIXE — o que o contorno economizou, num período
 * ===========================================================================
 *
 * Mora dentro da aba de Encaixe (pedido do dono, 2026-11-10): um botão na
 * barra da mesa abre o relatório por cima dela. Ele lê o que o servidor local
 * já guarda de cada encaixe (`servidor/encaixe-relatorio.js`) e mostra, lado a
 * lado, a metragem PELO CONTORNO (a que o Optmize entregou) e a que o mesmo
 * trabalho gastaria PELO QUADRADO. A conta do quadrado sempre erra para mais
 * e nunca fica abaixo do contorno — a regra está toda no servidor.
 *
 * O período começa no dia 1 do mês e vai até hoje; os dois campos mudam isso.
 */

import { useCallback, useEffect, useState } from "react";
import { Modal } from "../casca/Modal";
import { SeletorDeData } from "../casca/SeletorDeData";
import { Paginacao } from "../casca/Paginacao";

const POR_PAGINA = 15;

interface Linha {
  id: number;
  /** O nome do arquivo que a pessoa salvou, sem a extensão. */
  nome: string;
  /** Quantas vezes este pedido foi exportado no período (conta uma só). */
  vezes: number;
  quando: string;
  pecas: number | null;
  larguraTecido: number | null;
  contornoCm: number;
  quadradoCm: number | null;
  economiaCm: number | null;
  aproveitamento: number | null;
}

interface Relatorio {
  de: string;
  ate: string;
  encaixes: number;
  totais: {
    contornoCm: number;
    pecas: number;
    comparaveis: number;
    contornoComparavelCm: number;
    quadradoCm: number;
    economiaCm: number;
    economiaPercentual: number | null;
  };
  linhas: Linha[];
}

const diaLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const metros = (cm: number | null | undefined) =>
  cm == null ? "—" : `${(cm / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;

const porcento = (v: number | null | undefined) =>
  v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

const quandoCurto = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const dataPorExtenso = (dia: string) => {
  const [a = 0, m = 1, d = 1] = dia.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
};

export function BotaoRelatorioDoEncaixe() {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="mr-2 inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-tinta-fraca transition-colors hover:bg-painel hover:text-tinta"
        title="Relatório: contorno contra quadrado no período"
      >
        <svg className="size-[15px]" viewBox="0 0 24 24" aria-hidden="true">
          <use href="icones.svg#file-text" />
        </svg>
        Relatório
      </button>
      {aberto && <RelatorioDoEncaixe aoFechar={() => setAberto(false)} />}
    </>
  );
}

function RelatorioDoEncaixe({ aoFechar }: { aoFechar: () => void }) {
  const hoje = new Date();
  const [de, setDe] = useState(diaLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1)));
  const [ate, setAte] = useState(diaLocal(hoje));
  const [dados, setDados] = useState<Relatorio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [pagina, setPagina] = useState(1);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await fetch(`/api/encaixe/relatorio?de=${de}&ate=${ate}`);
      const corpo = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(corpo.error || "Não foi possível montar o relatório.");
      setDados(corpo as Relatorio);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "O Optmize não respondeu.");
    } finally {
      setCarregando(false);
    }
  }, [de, ate]);

  useEffect(() => { void carregar(); }, [carregar]);
  // Outro período, outra lista: volta para a primeira página.
  useEffect(() => { setPagina(1); }, [de, ate]);

  const t = dados?.totais;
  const semQuadrado = dados ? dados.encaixes - dados.totais.comparaveis : 0;

  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo="Relatório do encaixe"
      subtitulo={dados ? `De ${dataPorExtenso(dados.de)} a ${dataPorExtenso(dados.ate)}` : "Contorno contra quadrado"}
      icone="icones.svg#file-text"
      largura={1100}
      cheio
    >
          <div className="mb-4 flex items-center gap-2 text-[12.5px] text-tinta-apagada">
            <SeletorDeData valor={de} maximo={ate} rotulo="Data inicial" aoMudar={setDe} />
            até
            <SeletorDeData valor={ate} minimo={de} maximo={diaLocal(new Date())} rotulo="Data final" aoMudar={setAte} />
          </div>

          {erro && <p className="m-0 mb-4 text-[13px] text-[var(--danger)]">{erro}</p>}

          {t && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Cartao rotulo="Encaixes" valor={String(dados!.encaixes)} nota={`${t.pecas} peças`} />
              <Cartao rotulo="Optmize" valor={metros(t.contornoComparavelCm)} />
              <Cartao rotulo="Quadrado" valor={metros(t.quadradoCm)} />
              <Cartao rotulo="Economizado" valor={metros(t.economiaCm)} nota={porcento(t.economiaPercentual)} destaque />
            </div>
          )}

          {t && semQuadrado > 0 && (
            <p className="m-0 mt-3 text-[12px] text-tinta-apagada">
              {semQuadrado === 1 ? "1 encaixe" : `${semQuadrado} encaixes`} de antes desta versão sem as medidas das
              peças: {semQuadrado === 1 ? "entra" : "entram"} na lista, mas fora da conta da economia.
            </p>
          )}

          {dados && dados.linhas.length === 0 && !carregando && (
            <p className="m-0 mt-6 text-center text-[13px] text-tinta-fraca">Nenhum encaixe neste período.</p>
          )}

          {dados && dados.linhas.length > 0 && (
            <table className="mt-5 w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-linha text-left text-[11px] uppercase tracking-wide text-tinta-apagada">
                  <th className="py-2 pr-3 font-normal">Pedido</th>
                  <th className="py-2 pr-3 font-normal">Quando</th>
                  <th className="py-2 pr-3 text-right font-normal">Peças</th>
                  <th className="py-2 pr-3 text-right font-normal">Rolo</th>
                  <th className="py-2 pr-3 text-right font-normal">Optmize</th>
                  <th className="py-2 pr-3 text-right font-normal">Quadrado</th>
                  <th className="py-2 pr-3 text-right font-normal">Economia</th>
                  <th className="py-2 text-right font-normal">%</th>
                </tr>
              </thead>
              <tbody>
                {dados.linhas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA).map((l) => (
                  <tr key={l.id} className="border-b border-linha/60 text-tinta">
                    <td className="max-w-[320px] py-2 pr-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate" title={l.nome}>{l.nome}</span>
                        {l.vezes > 1 && (
                          <span
                            className="shrink-0 rounded-[5px] border border-linha px-1.5 font-mono text-[10.5px] text-tinta-apagada"
                            title={`Exportado ${l.vezes} vezes no período — conta uma só`}
                          >
                            {l.vezes}×
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-tinta-fraca">{quandoCurto(l.quando)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{l.pecas ?? "—"}</td>
                    <td className="py-2 pr-3 text-right font-mono">{l.larguraTecido ? `${l.larguraTecido} cm` : "—"}</td>
                    <td className="py-2 pr-3 text-right font-mono">{metros(l.contornoCm)}</td>
                    <td className="py-2 pr-3 text-right font-mono text-tinta-fraca">{metros(l.quadradoCm)}</td>
                    <td className="py-2 pr-3 text-right font-mono text-ambar">{metros(l.economiaCm)}</td>
                    <td className="py-2 text-right font-mono text-ambar">
                      {l.economiaCm == null || !l.quadradoCm ? "—" : porcento((l.economiaCm / l.quadradoCm) * 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {dados && <Paginacao pagina={pagina} total={dados.linhas.length} porPagina={POR_PAGINA} aoMudar={setPagina} />}
    </Modal>
  );
}

function Cartao({ rotulo, valor, nota, destaque }: { rotulo: string; valor: string; nota?: string; destaque?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${destaque ? "border-[var(--accent-line)] bg-[var(--accent-soft)]" : "border-linha bg-painel-suave"}`}>
      <p className="m-0 text-[11px] uppercase tracking-wide text-tinta-apagada">{rotulo}</p>
      <p className={`m-0 mt-1 font-titulo text-xl ${destaque ? "text-ambar" : "text-tinta"}`}>{valor}</p>
      {nota && <p className="m-0 mt-0.5 text-[11.5px] text-tinta-fraca">{nota}</p>}
    </div>
  );
}
