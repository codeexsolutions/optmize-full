import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Estrutura } from "./Estrutura";
import { montarProducao } from "./controlador";
import { ProvedorDaLigacao, type Ligacao } from "./ligacao";
import { Cor } from "../telas/Cor";
import type { NomeDeTela } from "../rotas";
import "./producao.css";

/**
 * As telas que o controlador imperativo ainda desenha.
 *
 * Elas têm rota, mas a rota não desenha nada: quem as desenha é este
 * componente, que fica montado o tempo todo para não perder o trabalho em
 * memória ao trocar de aba (ver `casca/Casca.tsx`). A lista encolhendo é a
 * medida do quanto a migração andou — Cor, Projetos e Moldes já saíram dela.
 */
export const ehProducaoIntegrada = (pagina: string) => ["encaixe", "cor"].includes(pagina);

/** Mantém o trabalho em memória ao navegar; desmontar libera os recursos. */
export function Producao({ pagina, irPara, children }: {
  pagina: NomeDeTela;
  irPara: (pagina: NomeDeTela) => void;
  /** As telas React, que vão DENTRO do provedor da ligação. Ver abaixo. */
  children?: ReactNode;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  const controle = useRef<ReturnType<typeof montarProducao> | null>(null);
  const navegar = useRef(irPara);
  navegar.current = irPara;
  const [erro, setErro] = useState("");
  useLayoutEffect(() => {
    const elemento = raiz.current!;
    const aoErro = (evento: Event) => setErro((evento as CustomEvent<string>).detail);
    elemento.addEventListener("producao:erro", aoErro);
    try {
      controle.current = montarProducao(raiz.current!, (destino: NomeDeTela) => navegar.current(destino));
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
    return () => { elemento.removeEventListener("producao:erro", aoErro); controle.current?.destruir(); controle.current = null; };
  }, []);
  useLayoutEffect(() => { controle.current?.navegar(pagina); }, [pagina]);

  /*
   * A ponte para as telas que já são React. Ela chama o controlador pelo `ref`,
   * então não muda de identidade a cada render e não faz a Cor redesenhar à
   * toa; e cai fora com um aviso se o controlador não tiver subido, em vez de
   * estourar no clique.
   */
  const ligacao = useMemo<Ligacao>(() => ({
    async adicionarArquivos(arquivos) {
      if (!controle.current) throw new Error("o editor de produção não está montado");
      await controle.current.adicionarArquivos(arquivos);
    },
    async mandarProjetoParaOEncaixe(projeto) {
      if (!controle.current) throw new Error("o editor de produção não está montado");
      await controle.current.mandarProjeto(projeto);
    },
    async mandarMoldeParaOEncaixe(molde) {
      if (!controle.current) throw new Error("o editor de produção não está montado");
      await controle.current.mandarMolde(molde);
    },
    irPara: (destino) => navegar.current(destino),
  }), []);

  /*
   * A ordem aqui importa. O `<div className="producao">` é o que o controlador
   * dirige e o que a folha `producao.css` escopa — e ele fica ESCONDIDO quando
   * a tela da vez não é dele. As telas React que a rota desenha (o `children`)
   * ficam FORA desse div, senão sumiriam junto; mas continuam dentro do
   * provedor, porque uma delas (Projetos) ainda entrega trabalho ao Encaixe.
   */
  return <ProvedorDaLigacao value={ligacao}>
    <div ref={raiz} className="producao h-full" hidden={!ehProducaoIntegrada(pagina)}>
      {erro && <p role="alert">{erro} <button type="button" onClick={() => setErro("")}>Fechar aviso</button></p>}
      <Estrutura />
      {/*
        A Cor é React de verdade, então fica FORA da `Estrutura`: aquela é
        memoizada para o controlador poder mexer nos nós dela sem o React desfazer,
        e esta precisa redesenhar a cada arte convertida. Montada sempre, escondida
        quando não é a vez — é o que conserva a lista ao navegar.
      */}
      <Cor ativa={pagina === "cor"} />
    </div>
    {children}
  </ProvedorDaLigacao>;
}
