import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Estrutura } from "./Estrutura";
import { montarProducao } from "./controlador";
import { ProvedorDaLigacao, type Ligacao } from "./ligacao";
import type { NomeDeTela } from "../rotas";
import "./producao.css";

/**
 * As telas que o controlador imperativo ainda desenha.
 *
 * Elas têm rota, mas a rota não desenha nada: quem as desenha é este
 * componente. A lista encolhendo é a medida do quanto a migração andou —
 * Projetos e Moldes já saíram dela, e a Cor saiu do programa (2026-09-21).
 */
export const ehProducaoIntegrada = (pagina: string) => ["encaixe"].includes(pagina);

/**
 * ===========================================================================
 * O EDITOR DE PRODUÇÃO — nasce quando precisa, fica enquanto há trabalho
 * ===========================================================================
 *
 * ELE JÁ FICOU MONTADO O TEMPO TODO, escondido com `hidden` em toda rota que
 * não fosse a dele. O motivo era bom: o editor guarda em memória as artes já
 * lidas — imagens decodificadas, máscaras de silhueta, o último encaixe —, e
 * isso é trabalho de minutos que desmontar jogaria fora.
 *
 * O preço era alto e invisível. Em QUALQUER tela do programa havia duas
 * árvores de DOM: a da tela e a de um editor que ninguém estava vendo. No
 * Histórico, dois terços dos elementos da página eram do Encaixe — com
 * `<aside>`, diálogo e canvas próprios, disputando nome com os da tela de
 * verdade. Quem fosse depurar uma tela achava elementos que não eram dela, e
 * quem varresse a página encontrava dois de tudo.
 *
 * ---------------------------------------------------------------------------
 * A REGRA DE AGORA
 * ---------------------------------------------------------------------------
 *
 * O editor existe quando:
 *
 *   1. a tela da vez é dele (o Encaixe); ou
 *   2. ele tem trabalho guardado — peças na lista ou um risco pronto.
 *
 * Fora disso ele não está na página. Quem abre o programa e vai ao Histórico
 * não carrega editor nenhum; quem encaixou e foi ver os Pedidos volta e
 * encontra tudo como deixou, porque o caso 2 o segura montado.
 *
 * O QUE SE PERDE, DITO EM VOZ ALTA: sair do Encaixe com a lista vazia desmonta
 * o editor, e com ele vão os ajustes que alguém tenha digitado sem carregar
 * peça nenhuma (largura do tecido, espaçamento). São campos com valor padrão
 * e nenhum minuto de trabalho atrás — é a troca que este arquivo faz.
 */
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

  /** Se o editor está na página. Começa montado só se a tela for a dele. */
  const [montado, setMontado] = useState(() => ehProducaoIntegrada(pagina));

  /*
   * QUEM ESTÁ ESPERANDO O EDITOR SUBIR.
   *
   * A ponte (abaixo) é chamada de outras telas, e pode chegar antes de o
   * editor existir: a tela de Moldes manda o trabalho AINDA em /moldes, e a
   * de Projetos manda logo depois de pedir a troca de rota — mais cedo do que
   * o React monta qualquer coisa. Então quem chama espera aqui, e o efeito de
   * montagem acorda todo mundo.
   */
  const esperando = useRef<(() => void)[]>([]);

  useLayoutEffect(() => {
    if (!montado) return;

    const elemento = raiz.current!;
    const aoErro = (evento: Event) => setErro((evento as CustomEvent<string>).detail);
    elemento.addEventListener("producao:erro", aoErro);

    try {
      controle.current = montarProducao(elemento, (destino: NomeDeTela) => navegar.current(destino));
      // Acabou de subir: a tela da vez precisa ser dita, senão o editor abre
      // na página em que estava quando foi desmontado.
      controle.current.navegar(pagina);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }

    /*
     * ACORDA QUEM ESPERAVA — inclusive quando a montagem FALHOU. Sem isto, um
     * erro aqui deixaria a tela de Moldes pendurada para sempre num `await`
     * que nunca volta, sem mensagem nenhuma.
     */
    esperando.current.splice(0).forEach((seguir) => seguir());

    return () => {
      elemento.removeEventListener("producao:erro", aoErro);
      controle.current?.destruir();
      controle.current = null;
    };
    // `pagina` de propósito fora: trocar de tela não remonta o editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montado]);

  /*
   * A TROCA DE TELA, E A DECISÃO DE FICAR OU SAIR.
   *
   * Chegando ao Encaixe, o editor sobe (se já não estiver de pé). Saindo
   * dele, ele só fica se tiver trabalho guardado — e quem responde isso é o
   * próprio controlador, que é quem sabe o que tem na lista.
   */
  useLayoutEffect(() => {
    if (ehProducaoIntegrada(pagina)) {
      setMontado(true);
      controle.current?.navegar(pagina);
      return;
    }
    if (!controle.current) return;
    if (controle.current.temTrabalho()) {
      controle.current.navegar(pagina);
      return;
    }
    setMontado(false);
  }, [pagina]);

  /**
   * Garante o editor de pé e devolve o controle.
   *
   * É o que permite a outra tela mandar trabalho para o Encaixe sem se
   * importar se o editor existe neste instante.
   */
  const garantirEditor = useCallback(async () => {
    if (controle.current) return controle.current;
    setMontado(true);
    await new Promise<void>((seguir) => esperando.current.push(seguir));
    if (!controle.current) throw new Error("o editor de produção não subiu");
    return controle.current;
  }, []);

  /*
   * A ponte para as telas que já são React. Ela chama o controlador pelo
   * `ref`, então não muda de identidade a cada render e não faz as telas
   * redesenharem à toa.
   */
  const ligacao = useMemo<Ligacao>(() => ({
    async adicionarArquivos(arquivos) {
      await (await garantirEditor()).adicionarArquivos(arquivos);
    },
    async mandarProjetoParaOEncaixe(projeto) {
      await (await garantirEditor()).mandarProjeto(projeto);
    },
    async mandarMoldeParaOEncaixe(molde) {
      await (await garantirEditor()).mandarMolde(molde);
    },
    irPara: (destino) => navegar.current(destino),
  }), [garantirEditor]);

  /*
   * A ordem aqui importa. O `<div className="producao">` é o que o controlador
   * dirige e o que a folha `producao.css` escopa — e ele fica ESCONDIDO quando
   * a tela da vez não é dele (o que só acontece enquanto ele segura trabalho;
   * sem trabalho, ele nem está na página). As telas React que a rota desenha
   * (o `children`) ficam FORA desse div, senão sumiriam junto; mas continuam
   * dentro do provedor, porque uma delas (Projetos) ainda entrega trabalho ao
   * Encaixe.
   */
  return <ProvedorDaLigacao value={ligacao}>
    {montado && (
      <div ref={raiz} className="producao h-full" hidden={!ehProducaoIntegrada(pagina)}>
        {erro && <p role="alert">{erro} <button type="button" onClick={() => setErro("")}>Fechar aviso</button></p>}
        <Estrutura />
      </div>
    )}
    {children}
  </ProvedorDaLigacao>;
}
