/**
 * A LISTA DOS ATALHOS — a tecla `?` e o botão `?` da barra dos nós.
 *
 * É a seção 3 da spec de 2026-10-05 (curvas fáceis da Montagem). O Digitalizar
 * usa a mesma janela, sem as linhas que são só da Montagem (`comMontagem`).
 */
import { Modal } from "../../casca/Modal";

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  /** As linhas da Montagem (ferramentas, girar, zoom, refazer). */
  comMontagem: boolean;
}

type Linha = [tecla: string, faz: string, soMontagem?: boolean];

const GRUPOS: { titulo: string; linhas: Linha[] }[] = [
  {
    titulo: "Ferramentas",
    linhas: [
      ["N P M F G", "Nós, Pique, Ponto, Fio, Graduar", true],
      ["V", "ver todas as peças", true],
    ],
  },
  {
    titulo: "Nós",
    linhas: [
      ["Clique · Shift · arrastar", "seleciona · soma · retângulo"],
      ["Tab · Shift+Tab", "o nó seguinte · o anterior"],
      ["Ctrl+A · Esc", "todos · limpa"],
      ["Setas · Shift · Alt", "1 mm · 1 cm · 0,1 mm"],
      ["L · Q · A", "liso · quina · automático"],
      ["R · C", "o trecho vira reta · curva"],
      ["+ · Delete", "põe nó · apaga"],
      ["H · Shift+H", "alinha na altura · na coluna"],
      ["E", "reduz os nós"],
      ["[ · ]", "gira a peça 90°", true],
      ["Dois cliques", "no traço põe nó; no nó apaga"],
    ],
  },
  {
    titulo: "Puxadores do nó liso",
    linhas: [
      ["Arrastar", "abre ou fecha aquele lado; gira os dois"],
      ["Alt+arrastar", "vira quina; só aquele lado anda"],
      ["Dois cliques", "aquele lado volta ao natural"],
    ],
  },
  {
    titulo: "Vista",
    linhas: [
      ["Roda", "aproxima e afasta"],
      ["0 · Z", "ajusta à tela · aproxima na seleção", true],
      ["Espaço+arrastar", "anda pela peça", true],
      ["Ctrl+Z · Ctrl+Y", "desfaz · refaz", true],
      ["?", "esta lista"],
    ],
  },
];

export function JanelaDeAtalhos({ aberto, aoFechar, comMontagem }: Props) {
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Atalhos" icone="icones.svg#keyboard">
      <div className="mt-3 flex max-h-[60vh] flex-col gap-3 overflow-y-auto text-[11px]">
        {GRUPOS.map((g) => {
          const linhas = g.linhas.filter(([, , soMontagem]) => comMontagem || !soMontagem);
          if (linhas.length === 0) return null;
          return (
            <section key={g.titulo}>
              <h3 className="m-0 mb-1 text-[10px] font-semibold tracking-wide text-tinta-apagada uppercase">{g.titulo}</h3>
              <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {linhas.map(([tecla, faz]) => (
                  <div key={tecla} className="contents">
                    <dt className="font-mono whitespace-nowrap text-tinta">{tecla}</dt>
                    <dd className="m-0 text-tinta-fraca">{faz}</dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>
    </Modal>
  );
}
