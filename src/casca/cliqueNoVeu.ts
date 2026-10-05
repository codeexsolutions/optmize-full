/**
 * O CLIQUE NO VÉU — fechar a caixa só quando o clique foi MESMO lá fora.
 *
 * O `click` sozinho não serve: quem aperta o mouse dentro de um campo, arrasta
 * para selecionar o texto e solta em cima do véu gera um `click` no ancestral
 * comum dos dois pontos — que é o próprio véu. A caixa fechava no meio de uma
 * seleção, levando junto o que a pessoa tinha escrito.
 *
 * Daqui só fecha o clique que COMEÇOU e TERMINOU no véu. Espalhe o retorno no
 * elemento do fundo: `<div {...veu} className="...">`.
 */

import { useRef, type MouseEvent } from "react";

export function useCliqueNoVeu(aoFechar: () => void) {
  const comecouNoVeu = useRef(false);
  return {
    onMouseDown: (evento: MouseEvent) => {
      comecouNoVeu.current = evento.target === evento.currentTarget;
    },
    onClick: (evento: MouseEvent) => {
      const foraDeVerdade = comecouNoVeu.current && evento.target === evento.currentTarget;
      comecouNoVeu.current = false;
      if (foraDeVerdade) aoFechar();
    },
  };
}
