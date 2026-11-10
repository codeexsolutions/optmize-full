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

interface Linha {
  id: number;
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

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aoFechar]);

  const t = dados?.totais;
  const semQuadrado = dados ? dados.encaixes - dados.totais.comparaveis : 0;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="relatorio-encaixe-titulo"
      onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}
    >
      <div className="flex max-h-[calc(100vh-32px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-linha bg-painel shadow-2xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-linha bg-painel-suave px-5 py-4">
          <div className="min-w-0 flex-1">
            <h3 id="relatorio-encaixe-titulo" className="m-0 font-titulo text-lg text-tinta">
              Relatório do encaixe
            </h3>
            <p className="m-0 text-[12.5px] text-tinta-fraca">
              {dados ? `De ${dataPorExtenso(dados.de)} a ${dataPorExtenso(dados.ate)}` : "Contorno contra quadrado"}
            </p>
          </div>
          <label className="flex items-center gap-1.5 text-[12px] text-tinta-fraca">
            De
            <input type="date" value={de} max={ate} onChange={(e) => e.target.value && setDe(e.target.value)}
              className="rounded-md border border-linha bg-painel px-2 py-1 text-[12px] text-tinta" />
          </label>
          <label className="flex items-center gap-1.5 text-[12px] text-tinta-fraca">
            até
            <input type="date" value={ate} min={de} onChange={(e) => e.target.value && setAte(e.target.value)}
              className="rounded-md border border-linha bg-painel px-2 py-1 text-[12px] text-tinta" />
          </label>
          <button type="button" onClick={aoFechar} aria-label="Fechar"
            className="grid size-8 place-items-center rounded-md text-tinta-fraca transition-colors hover:bg-painel hover:text-tinta">
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {erro && <p className="m-0 mb-4 text-[13px] text-[var(--danger)]">{erro}</p>}

          {t && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Cartao rotulo="Encaixes" valor={String(dados!.encaixes)} nota={`${t.pecas} peças`} />
              <Cartao rotulo="Pelo contorno" valor={metros(t.contornoComparavelCm)} nota="o que o Optmize usou" />
              <Cartao rotulo="Pelo quadrado" valor={metros(t.quadradoCm)} nota="como seria no retângulo" />
              <Cartao rotulo="Economizado" valor={metros(t.economiaCm)} nota={porcento(t.economiaPercentual) + " de tecido"} destaque />
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
                  <th className="py-2 pr-3 font-normal">Quando</th>
                  <th className="py-2 pr-3 text-right font-normal">Peças</th>
                  <th className="py-2 pr-3 text-right font-normal">Rolo</th>
                  <th className="py-2 pr-3 text-right font-normal">Contorno</th>
                  <th className="py-2 pr-3 text-right font-normal">Quadrado</th>
                  <th className="py-2 text-right font-normal">Economia</th>
                </tr>
              </thead>
              <tbody>
                {dados.linhas.map((l) => (
                  <tr key={l.id} className="border-b border-linha/60 text-tinta">
                    <td className="py-2 pr-3 text-tinta-fraca">{quandoCurto(l.quando)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{l.pecas ?? "—"}</td>
                    <td className="py-2 pr-3 text-right font-mono">{l.larguraTecido ? `${l.larguraTecido} cm` : "—"}</td>
                    <td className="py-2 pr-3 text-right font-mono">{metros(l.contornoCm)}</td>
                    <td className="py-2 pr-3 text-right font-mono text-tinta-fraca">{metros(l.quadradoCm)}</td>
                    <td className="py-2 text-right font-mono text-ambar">
                      {l.economiaCm == null || l.quadradoCm == null
                        ? "—"
                        : `${metros(l.economiaCm)} · ${porcento((l.economiaCm / l.quadradoCm) * 100)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="m-0 mt-5 text-[11.5px] leading-relaxed text-tinta-apagada">
            O quadrado é o mesmo trabalho com cada peça ocupando o retângulo inteiro dela (mais a folga), arrumado em
            fileiras no rolo e arredondado para cima de 10 em 10 cm — a conta sempre erra para mais, nunca para menos.
          </p>
        </div>
      </div>
    </div>
  );
}

function Cartao({ rotulo, valor, nota, destaque }: { rotulo: string; valor: string; nota: string; destaque?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${destaque ? "border-[var(--accent-line)] bg-[var(--accent-soft)]" : "border-linha bg-painel-suave"}`}>
      <p className="m-0 text-[11px] uppercase tracking-wide text-tinta-apagada">{rotulo}</p>
      <p className={`m-0 mt-1 font-titulo text-xl ${destaque ? "text-ambar" : "text-tinta"}`}>{valor}</p>
      <p className="m-0 mt-0.5 text-[11.5px] text-tinta-fraca">{nota}</p>
    </div>
  );
}
