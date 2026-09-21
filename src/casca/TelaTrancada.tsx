/**
 * ===========================================================================
 * TELA TRANCADA — o que aparece no lugar de uma tela fechada
 * ===========================================================================
 *
 * A tela continua no menu, com um cadeado, e o endereço dela continua
 * abrindo — o que muda é o miolo: em vez do conteúdo, este aviso. Trancar é
 * diferente de tirar do menu (`foraDoMenu`, como a de Máquinas): quem conhece
 * a tela continua vendo que ela existe, e vê que ela está fechada, em vez de
 * achar que ela sumiu.
 *
 * Quem tranca é a tabela de `rotas.ts`: `trancada: true` põe o cadeado no
 * menu, e o `Componente` da linha passa a ser este. Destrancar é devolver as
 * duas coisas.
 *
 * Isto é TELA, não segurança: a API da tela trancada continua respondendo no
 * servidor. Serve para a pessoa não usar, não para impedir quem quiser.
 */

import { Icone } from "./Icone";

export function TelaTrancada() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="flex max-w-[420px] flex-col items-center gap-3 text-center">
        <Icone referencia="icones.svg#lock" className="size-8 text-tinta-apagada" />
        <p className="m-0 text-[0.95rem] font-semibold text-tinta">Esta tela está trancada</p>
        <p className="m-0 text-[0.85rem] leading-relaxed text-tinta-fraca">
          Ela não está disponível por enquanto. Se você precisa dela, fale com quem cuida do Optmize.
        </p>
      </div>
    </div>
  );
}
