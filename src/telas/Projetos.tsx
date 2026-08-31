/**
 * Projetos — a estante por cliente.
 *
 * É a primeira tela em React de verdade, e por enquanto mostra a estante: a
 * lista de clientes com quantos projetos cada um tem. Serve de prova do
 * caminho inteiro — `useDados` -> `api` -> Express -> SQLite -> tela — antes
 * de trazer para cá o editor de projeto, que é a parte grande.
 */

import { api } from "../api/cliente";
import { useDados } from "../api/useDados";
import { Cartao } from "../casca/Cartao";
import { Icone } from "../casca/Icone";

interface ClienteDaEstante {
  id: number;
  nome: string;
  observacoes: string | null;
  criado_em: string | null;
  projetos: number;
}

export function Projetos() {
  const { dados, carregando, erro } = useDados<ClienteDaEstante[]>(
    () => api.get<ClienteDaEstante[]>("/projetos/clientes"),
  );

  return (
    <Cartao
      titulo="Clientes"
      icone="icones.svg#users"
      apoio="Cada cliente é uma pasta: dentro dela ficam os projetos prontos para repetir."
    >
      {carregando && <p className="m-0 text-[0.88rem] text-tinta-fraca">Carregando a estante...</p>}

      {erro && (
        <p className="m-0 flex items-center gap-2 text-[0.88rem] text-[var(--danger)]">
          <Icone referencia="icones.svg#triangle-alert" className="size-4 shrink-0" />
          {erro}
        </p>
      )}

      {dados && dados.length === 0 && (
        <p className="m-0 text-[0.88rem] text-tinta-fraca">
          Nenhum cliente ainda. O primeiro aparece aqui assim que for criado.
        </p>
      )}

      {dados && dados.length > 0 && (
        <ul className="m-0 grid list-none gap-2 p-0">
          {dados.map((cliente) => (
            <li
              key={cliente.id}
              className="flex items-center gap-3 rounded-[10px] border border-linha bg-painel-suave px-3.5 py-3 transition-colors hover:border-[var(--accent-line)]"
            >
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-[9px] border border-linha text-tinta-fraca"
              >
                <Icone referencia="icones.svg#folder-open" className="size-[18px]" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-[0.92rem] font-semibold text-tinta">{cliente.nome}</strong>
                {cliente.observacoes && (
                  <small className="block truncate text-[0.75rem] text-tinta-apagada">{cliente.observacoes}</small>
                )}
              </span>
              <span className="shrink-0 rounded-full border border-linha px-2.5 py-1 font-mono text-[11px] text-tinta-fraca">
                {cliente.projetos} {cliente.projetos === 1 ? "projeto" : "projetos"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}
