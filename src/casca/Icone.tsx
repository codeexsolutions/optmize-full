/**
 * Um ícone do sprite gerado por `empacotar/icones.js`.
 *
 * A cor vem de `currentColor` — quem manda é o `text-*` do elemento em volta —
 * e a espessura do traço é decidida lá no gerador, igual para todos. Aqui só
 * se escolhe o desenho e o tamanho.
 *
 * O `referencia` chega inteiro (`"icones.svg#shapes"`) porque é essa string
 * literal que o gerador procura no código para montar o sprite.
 */
export function Icone({ referencia, className }: { referencia: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <use href={`${import.meta.env.BASE_URL}${referencia}`} />
    </svg>
  );
}
