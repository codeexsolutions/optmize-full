/**
 * ===========================================================================
 * MACROS — as ferramentas que rodam dentro do CorelDRAW
 * ===========================================================================
 *
 * Instala a macro no Corel num clique: o servidor mexe no projeto VSTA pela
 * pessoa (ver `macros-api.js`).
 *
 * Esta tela não tem domínio nenhum. Ela mostra o que `/api/macros` responde e
 * chama três rotas — por isso foi a primeira das três a migrar da casca antiga
 * para cá: não havia conta para portar, só marcação para reescrever.
 *
 * ---------------------------------------------------------------------------
 * O CAMINHO MANUAL FICA À VISTA, E NÃO ATRÁS DE UM "VER DETALHES"
 * ---------------------------------------------------------------------------
 *
 * A instalação automática depende de duas coisas: achar o Corel na máquina, e
 * ele estar FECHADO. Quando qualquer uma falha — e falha —, quem está na tela
 * precisa dos passos ali mesmo, não numa página de ajuda. Foi decisão da tela
 * antiga e continua valendo.
 *
 * Por que o Corel precisa estar fechado: ele guarda todas as macros num
 * arquivo só e, ao fechar, reescreve esse arquivo a partir do que tem na
 * memória. Instalar com ele aberto seria desfeito sem aviso na hora em que a
 * pessoa saísse do programa.
 */

import { useState } from "react";
import { api } from "../api/cliente";
import { useDados } from "../api/useDados";
import { Cartao } from "../casca/Cartao";
import { Icone } from "../casca/Icone";

interface Macro {
  id: string;
  arquivo: string;
  nome: string;
  resumo: string;
  entrada: string;
  macro: string;
  arquivos?: string[];
  existe: boolean;
  bytes: number;
  atualizado: string;
  instalada: boolean;
}

interface Corel {
  encontrado: boolean;
  versao?: string;
  pasta?: string;
  addon?: string;
}

interface RespostaDeMacros {
  macros: Macro[];
  corel: Corel | null;
}

const emKb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

function quando(iso: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(iso));
}

export function Macros() {
  const { dados, carregando, erro, recarregar } = useDados<RespostaDeMacros>(
    () => api.get<RespostaDeMacros>("/macros"),
  );

  const corel = dados?.corel ?? null;

  return (
    <Cartao
      titulo="Macros do CorelDRAW"
      icone="icones.svg#puzzle"
      apoio="Ferramentas que rodam dentro do Corel e conversam com este sistema."
    >
      <details className="mb-3">
        <summary className="cursor-pointer text-[0.8rem] text-tinta-apagada">
          Por que o Corel precisa estar fechado
        </summary>
        <div className="mt-2 grid gap-2 text-[0.8rem] leading-relaxed text-tinta-fraca">
          <p className="m-0">
            O Corel guarda TODAS as macros num arquivo só, o projeto do editor. Instalar daqui
            não troca esse arquivo: acrescenta a macro a ele e deixa o resto como estava — o que
            você já tiver escrito lá continua lá. Remover desfaz só o que foi acrescentado.
          </p>
          <p className="m-0">
            O Corel precisa estar fechado porque, ao fechar, ele reescreve esse arquivo a partir
            do que tem na memória. Se estivesse aberto durante a instalação, ela seria desfeita
            sem aviso na hora em que você saísse do programa.
          </p>
          <p className="m-0">
            Antes de mexer, uma cópia do projeto original fica guardada ao lado dele, com{" "}
            <code className="font-mono text-[0.75rem] text-tinta">.antes-do-optimize</code> no fim do nome.
          </p>
        </div>
      </details>

      {carregando && <p className="m-0 text-[0.85rem] text-tinta-fraca">Carregando...</p>}

      {erro && (
        <p className="m-0 flex items-center gap-2 text-[0.85rem] text-alerta">
          <Icone referencia="icones.svg#triangle-alert" className="size-4 shrink-0" />
          Não deu para carregar a lista de macros: {erro}
        </p>
      )}

      {corel && <FaixaDoCorel corel={corel} />}

      {dados && dados.macros.length === 0 && (
        <p className="m-0 text-[0.85rem] text-tinta-fraca">Nenhuma macro disponível.</p>
      )}

      <div className="grid gap-2">
        {(dados?.macros || []).map((macro) => (
          <CartaoDaMacro
            key={macro.id}
            macro={macro}
            temCorel={Boolean(corel?.encontrado)}
            aoMudar={recarregar}
          />
        ))}
      </div>
    </Cartao>
  );
}

/** O que o sistema sabe do Corel desta máquina. */
function FaixaDoCorel({ corel }: { corel: Corel }) {
  if (corel.encontrado) {
    return (
      <div className="mb-3 rounded-[10px] border border-linha bg-painel-suave px-3 py-2">
        <span className="flex items-center gap-2 text-[0.78rem] text-tinta">
          <Icone referencia="icones.svg#circle-check" className="size-3.5 shrink-0 text-certo" />
          <strong>{corel.versao}</strong> encontrado nesta máquina.
        </span>
        <span className="mt-1 block break-all font-mono text-[0.65rem] text-tinta-apagada">{corel.pasta}</span>
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-[10px] border border-linha px-3 py-2">
      <span className="flex items-center gap-2 text-[0.78rem] text-tinta-apagada">
        <Icone referencia="icones.svg#plug" className="size-3.5 shrink-0" />
        Não achei o CorelDRAW nesta máquina — dá para baixar o arquivo e guardar onde preferir.
      </span>
    </div>
  );
}

function CartaoDaMacro({ macro, temCorel, aoMudar }: {
  macro: Macro; temCorel: boolean; aoMudar: () => void;
}) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ondeSalvou, setOndeSalvou] = useState<string | null>(null);

  /**
   * Instala ou remove, e depois RECARREGA a lista em vez de mexer no botão.
   *
   * O que muda não é só o rótulo dele: mudam o selo "instalada", os passos
   * manuais e o outro botão. Um lugar só decide como a tela fica, e é a
   * resposta do servidor.
   */
  const mexerNoCorel = async (remover: boolean) => {
    setOcupado(remover ? "Removendo..." : "Instalando...");
    setErro(null);
    try {
      await api.post(`/macros/${macro.id}/instalar-no-corel${remover ? "?remover=1" : ""}`, {});
      aoMudar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não deu");
    }
    setOcupado(null);
  };

  const salvarArquivo = async () => {
    setOcupado("Salvando...");
    setErro(null);
    try {
      const resposta = await api.post<{ caminho: string }>(`/macros/${macro.id}/salvar-no-corel`, {});
      // O caminho fica escrito na tela: se o Explorer não abrir (acontece em
      // sessão remota), a pessoa ainda sabe para onde ir.
      setOndeSalvou(resposta.caminho);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não deu");
    }
    setOcupado(null);
  };

  return (
    <article className="rounded-[10px] border border-linha">
      <div className="flex items-start gap-3 px-3 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[9px] border border-linha text-ambar">
          <Icone referencia="icones.svg#puzzle" className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block text-[0.85rem] text-tinta">
            {macro.nome}
            {macro.instalada && (
              <span className="ml-1.5 rounded border border-linha px-1 py-px align-middle text-[0.62rem] font-normal text-certo">
                instalada
              </span>
            )}
          </strong>
          <span className="mt-0.5 block text-[0.78rem] leading-snug text-tinta-apagada">{macro.resumo}</span>
          <span className="mt-1 block font-mono text-[0.65rem] text-tinta-apagada">
            {macro.arquivo} · {emKb(macro.bytes)} · {quando(macro.atualizado)}
          </span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-linha px-3 py-2">
        {(macro.arquivos || [macro.arquivo]).map((nome) => (
          <a
            key={nome}
            href={`/api/macros/${macro.id}/arquivo/${encodeURIComponent(nome)}`}
            download
            className="rounded-[8px] border border-linha px-2.5 py-1.5 text-[0.75rem] text-tinta-fraca no-underline transition-colors hover:text-tinta"
          >
            {nome}
          </a>
        ))}

        {temCorel && !macro.instalada && (
          <button
            type="button"
            disabled={Boolean(ocupado)}
            onClick={() => void mexerNoCorel(false)}
            className="rounded-[8px] border border-ambar bg-ambar px-2.5 py-1.5 text-[0.75rem] font-semibold text-ambar-tinta transition-colors hover:bg-ambar-claro disabled:opacity-50"
          >
            {ocupado || "Instalar no Corel"}
          </button>
        )}

        {temCorel && macro.instalada && (
          <button
            type="button"
            disabled={Boolean(ocupado)}
            onClick={() => void mexerNoCorel(true)}
            className="rounded-[8px] border border-linha px-2.5 py-1.5 text-[0.75rem] text-tinta-fraca transition-colors hover:text-tinta disabled:opacity-50"
          >
            {ocupado || "Remover do Corel"}
          </button>
        )}

        {temCorel && (
          <button
            type="button"
            disabled={Boolean(ocupado)}
            onClick={() => void salvarArquivo()}
            className="rounded-[8px] border border-linha px-2.5 py-1.5 text-[0.75rem] text-tinta-fraca transition-colors hover:text-tinta disabled:opacity-50"
          >
            {ondeSalvou ? "Salvo — a pasta abriu" : "Só salvar o arquivo"}
          </button>
        )}
      </div>

      {ondeSalvou && (
        <p className="m-0 border-t border-linha px-3 py-2 break-all font-mono text-[0.65rem] text-tinta-apagada">
          {ondeSalvou}
        </p>
      )}

      {erro && <p className="m-0 border-t border-linha px-3 py-2 text-[0.78rem] text-alerta">{erro}</p>}

      {macro.instalada ? (
        <p className="m-0 border-t border-linha px-3 py-2.5 text-[0.78rem] leading-relaxed text-tinta-apagada">
          Já está no Corel. Para usar: <strong className="text-tinta">Ferramentas &gt; Macros &gt; Executar
          macro</strong> e rode <code className="font-mono text-tinta">{macro.macro}</code>.
        </p>
      ) : (
        /*
          Os passos manuais ficam à vista mesmo com o botão de instalar logo
          acima: o botão recusa quando o Corel está aberto, e nessa hora a
          pessoa precisa da alternativa na mesma tela.
        */
        <ol className="m-0 list-none border-t border-linha px-3 py-2.5 text-[0.78rem] leading-relaxed text-tinta-apagada">
          <li className="mb-1 text-tinta">Se preferir fazer à mão:</li>
          <li><strong className="text-tinta">1.</strong> No Corel: <strong className="text-tinta">Ferramentas &gt; Macros &gt; Editor de macros</strong> (Alt+F11).</li>
          <li>
            <strong className="text-tinta">2.</strong> No Solution Explorer, botão direito no projeto &gt;{" "}
            <strong className="text-tinta">Add &gt; Existing Item</strong> e escolha o{" "}
            <code className="font-mono text-tinta">{macro.arquivo}</code>.
          </li>
          <li><strong className="text-tinta">3.</strong> Salve e feche o editor.</li>
          <li>
            <strong className="text-tinta">4.</strong>{" "}
            <strong className="text-tinta">Ferramentas &gt; Macros &gt; Executar macro</strong> e rode{" "}
            <code className="font-mono text-tinta">{macro.macro}</code>.
          </li>
        </ol>
      )}

      <p className="m-0 border-t border-linha px-3 py-2 text-[0.72rem] leading-relaxed text-tinta-apagada">
        Para virar botão ou atalho: <strong className="text-tinta">Ferramentas &gt; Opções &gt;
        Personalização &gt; Comandos</strong>, escolha <strong className="text-tinta">Macros</strong> na
        lista e arraste <code className="font-mono text-tinta">{macro.macro}</code> para uma barra — ou
        dê a ela uma tecla de atalho.
      </p>

      <p className="m-0 border-t border-linha px-3 py-2 text-[0.72rem] leading-relaxed text-tinta-apagada">
        A macro só roda com o Optimize aberto: ela pergunta ao sistema se ele está de pé antes de
        começar. Para instalar ou remover, o CorelDRAW precisa estar{" "}
        <strong className="text-tinta">fechado</strong> — ao fechar, ele reescreve o projeto de macros
        e desfaria o que foi feito.
      </p>
    </article>
  );
}
