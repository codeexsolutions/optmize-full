import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Estrutura } from "./Estrutura";
import { montarProducao } from "./controlador";
import { ProvedorDaLigacao, type Ligacao } from "./ligacao";
import { Cor } from "../telas/Cor";
import type { NomeDeTela } from "../rotas";
import "./producao.css";

export const ehProducaoIntegrada = (pagina: string) => ["moldes", "projetos", "encaixe", "cor"].includes(pagina);

/** Mantém o trabalho em memória ao navegar; desmontar libera os recursos. */
export function Producao({ pagina, irPara }: { pagina: NomeDeTela; irPara: (pagina: NomeDeTela) => void }) {
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
    irPara: (destino) => navegar.current(destino),
  }), []);

  return <div ref={raiz} className="producao h-full" hidden={!ehProducaoIntegrada(pagina)}>
    {erro && <p role="alert">{erro} <button type="button" onClick={() => setErro("")}>Fechar aviso</button></p>}
    <Estrutura />
    {/*
      A Cor é React de verdade, então fica FORA da `Estrutura`: aquela é
      memoizada para o controlador poder mexer nos nós dela sem o React desfazer,
      e esta precisa redesenhar a cada arte convertida. Montada sempre, escondida
      quando não é a vez — é o que conserva a lista ao navegar.
    */}
    <ProvedorDaLigacao value={ligacao}>
      <Cor ativa={pagina === "cor"} />
    </ProvedorDaLigacao>
  </div>;
}
