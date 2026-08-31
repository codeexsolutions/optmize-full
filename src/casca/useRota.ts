/**
 * A rota, guardada no `#` do endereço.
 *
 * São quatro telas e nenhuma delas tem sub-rota, então uma biblioteca de
 * roteamento aqui seria mais peso do que ajuda. O `#` dá de graça o que se
 * quer de verdade: voltar e avançar funcionam, dá para abrir o app direto
 * numa tela, e recarregar a página não perde onde se estava — sem precisar
 * que o Express saiba de rota nenhuma do front.
 */

import { useEffect, useState } from "react";
import { TELA_PADRAO, acharTela, type NomeDeTela } from "../rotas";

function lerDoEndereco(): NomeDeTela {
  const nome = window.location.hash.replace(/^#\/?/, "");
  return nome ? acharTela(nome).nome : TELA_PADRAO;
}

export function useRota(): [NomeDeTela, (nome: NomeDeTela) => void] {
  const [rota, setRota] = useState<NomeDeTela>(lerDoEndereco);

  useEffect(() => {
    const aoTrocar = () => setRota(lerDoEndereco());
    window.addEventListener("hashchange", aoTrocar);
    return () => window.removeEventListener("hashchange", aoTrocar);
  }, []);

  return [rota, (nome: NomeDeTela) => { window.location.hash = `/${nome}`; }];
}
