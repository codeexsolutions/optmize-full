/**
 * O aviso das telas que ainda não migraram.
 *
 * Enquanto a migração acontece, as duas telas rodam ao mesmo tempo: a antiga
 * em `/`, a nova em `/app/`. Uma tela que ainda não veio para cá diz isso na
 * cara, com o caminho de volta — é melhor do que uma tela vazia que parece
 * quebrada, e some sozinha quando a migração daquela tela terminar.
 */

import { Cartao } from "../casca/Cartao";
import { Icone } from "../casca/Icone";

export function AindaNaTelaAntiga({ nome, oQueFaz }: { nome: string; oQueFaz: string }) {
  return (
    <Cartao titulo={`${nome} ainda roda na tela antiga`} icone="icones.svg#construction" apoio={oQueFaz}>
      <p className="m-0 text-[0.88rem] leading-relaxed text-tinta-fraca">
        Esta parte do sistema continua inteira e funcionando — ela só ainda não foi trazida
        para a interface nova. Nada foi perdido nem reescrito pela metade.
      </p>
      <a
        href="/"
        className="mt-4 inline-flex items-center gap-2 rounded-[9px] border border-[var(--accent-line)] bg-[var(--accent-soft)] px-3.5 py-2 text-[0.85rem] font-semibold text-ambar transition-colors hover:bg-ambar hover:text-ambar-tinta"
      >
        <Icone referencia="icones.svg#arrow-left" className="size-4" />
        Abrir {nome} na tela antiga
      </a>
    </Cartao>
  );
}
