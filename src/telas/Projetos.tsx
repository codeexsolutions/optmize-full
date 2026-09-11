/**
 * ===========================================================================
 * TELA DE PROJETOS — a estante do trabalho que se repete
 * ===========================================================================
 *
 * O trabalho começa numa árvore à esquerda e acontece à direita:
 *
 *   CLIENTES            TIME AZUL
 *   ├─ Time Azul        └─ Camisa 2026  → as artes e os ajustes do encaixe
 *   │  ├─ Camisa 2026
 *   │  └─ Abrigo
 *   └─ Padaria Sol
 *
 * O que esta tela NÃO faz, de propósito: aplicar estampa em molde. Isso é a
 * tela de Moldes, e o fluxo é outro — lá a arte é colocada dentro de um
 * contorno; aqui ela já chega colocada.
 *
 * ---------------------------------------------------------------------------
 * O DESENHO VEIO DO OPTMIZE LITE, E SÓ O DESENHO
 * ---------------------------------------------------------------------------
 *
 * A árvore na lateral, o cabeçalho em versalete com a contagem ao lado, o item
 * que se abre em cascata, a tipografia miúda com os números em mono, o estado
 * vazio com o ícone grande no meio: tudo isso é a tela de Projetos da Lite
 * (`optmize-lite/src/features/projects/ProjectsPage.tsx`), reproduzida aqui.
 *
 * O que NÃO veio é a estrutura de dados dela. Lá um projeto tem subprojetos,
 * tamanhos e categorias, e as artes moram na nuvem por conta; aqui continua
 * **Cliente → Projeto → peças**, no `dados.db` desta máquina, com os ajustes do
 * encaixe guardados no projeto. Nenhum projeto salvo mudou de forma, e o
 * "levar pro Encaixe" é o mesmo de sempre.
 *
 * A correspondência entre as duas telas é direta, e é o que faz o desenho
 * encaixar sem forçar: o CLIENTE ocupa o lugar do "projeto" da Lite (é o que
 * expande) e o PROJETO ocupa o do "subprojeto" (é o que abre no miolo).
 *
 * Duas diferenças assumidas:
 *
 * - os ícones saem do sprite (`icones.svg`), e não do `lucide-react`. São os
 *   mesmos desenhos do Lucide — o sprite existe para o app instalado não
 *   depender de internet, e trazer o pacote seria uma segunda fonte deles;
 * - as animações são de CSS, e não do `framer-motion`. O que a Lite anima aqui
 *   é a entrada de cada item da lista: é uma transição, não vale uma
 *   dependência a mais dentro do instalador.
 *
 * E uma mudança que veio junto e é melhoria de verdade: o editor deixou de ser
 * um modal por cima da estante e virou a ÁREA PRINCIPAL, como na Lite. O modal
 * cobria a lista, então trocar de projeto era fechar, procurar e abrir de novo.
 *
 * A ida para o Encaixe continua passando pelo controlador, pela `ligacao`: o
 * Encaixe ainda é imperativo. É a última amarra desta tela, e some com ele.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useDialogo } from "../casca/Dialogo";
import { Icone } from "../casca/Icone";
import { Botao, BotaoDeIcone } from "../casca/Botao";
import { projetosApi, type Cliente, type Projeto, type ProjetoNaLista } from "../api/projetos";
import { medidasDoArquivo, pixelsPorCmDoArquivo, PPCM_PADRAO } from "../motores/medidaDoArquivo";
import { useLigacao } from "../producao/ligacao";

/**
 * A arte reduzida para caber na tela.
 *
 * A lista mostra a peça num quadrado pequeno. Apontar o `<img>` para o arquivo
 * de impressão faz o navegador decodificar dezenas de megapixels para pintar
 * isso — medido em 526 ms ao abrir o editor e 1,8 s ao trocar de aba. A
 * miniatura é gerada uma vez, no envio, e fica guardada.
 */
const LADO_DA_MINIATURA = 240;

/** Uma peça enquanto está sendo editada. Sem `id` quando acabou de subir. */
interface Peca {
  id?: number;
  nome: string;
  arquivo: string;
  url: string;
  miniatura: string | null;
  largura: number;
  altura: number;
  quantidade: number;
}

export function Projetos() {
  const dialogo = useDialogo();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  /** Os projetos de cada cliente, lidos quando a pasta dele abre. */
  const [projetosPorCliente, setProjetosPorCliente] = useState<Record<number, ProjetoNaLista[]>>({});
  const [abertos, setAbertos] = useState<ReadonlySet<number>>(new Set());
  const [projetoAberto, setProjetoAberto] = useState<Projeto | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  const carregarClientes = useCallback(async () => {
    try {
      setClientes(await projetosApi.clientes());
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void carregarClientes(); }, [carregarClientes]);

  /**
   * Toda ação da árvore passa por aqui.
   *
   * Sem isto, um servidor fora do ar vira uma promessa rejeitada que ninguém
   * pega: no console aparece o erro e na tela não acontece nada — o botão
   * parece simplesmente não funcionar.
   */
  const tentar = async (acao: () => Promise<void>) => {
    try {
      await acao();
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };

  const carregarProjetos = useCallback(async (clienteId: number) => {
    const { projetos } = await projetosApi.projetosDoCliente(clienteId);
    setProjetosPorCliente((antes) => ({ ...antes, [clienteId]: projetos }));
  }, []);

  const alternarCliente = async (cliente: Cliente) => {
    const aberto = abertos.has(cliente.id);
    setAbertos((antes) => {
      const proximo = new Set(antes);
      if (aberto) proximo.delete(cliente.id);
      else proximo.add(cliente.id);
      return proximo;
    });
    if (!aberto) await tentar(() => carregarProjetos(cliente.id));
  };

  const abrirProjeto = async (id: number) => {
    await tentar(async () => setProjetoAberto(await projetosApi.abrir(id)));
  };

  const novoCliente = async () => {
    const nome = await dialogo.perguntar({
      titulo: "Novo cliente",
      kicker: "PASTA DO CLIENTE",
      texto: "O nome da pasta onde os projetos dele vão ficar.",
      exemplo: "Time Azul",
      confirmar: "Criar",
    });
    if (!nome) return;
    await tentar(async () => {
      await projetosApi.criarCliente(nome);
      await carregarClientes();
    });
  };

  const renomearCliente = async (cliente: Cliente) => {
    const nome = await dialogo.perguntar({
      titulo: "Renomear cliente", kicker: "PASTA DO CLIENTE", valor: cliente.nome, confirmar: "Salvar",
    });
    if (!nome) return;
    await tentar(async () => {
      await projetosApi.renomearCliente(cliente.id, nome);
      await carregarClientes();
    });
  };

  const excluirCliente = async (cliente: Cliente) => {
    const certeza = await dialogo.confirmar(
      "Apagar este cliente apaga todos os projetos e as artes dentro dele. Não tem volta.",
      { titulo: "Excluir cliente", confirmar: "Excluir" },
    );
    if (!certeza) return;
    await tentar(async () => {
      await projetosApi.apagarCliente(cliente.id);
      if (projetoAberto?.cliente?.id === cliente.id) setProjetoAberto(null);
      await carregarClientes();
    });
  };

  const novoProjeto = async (cliente: Cliente) => {
    const nome = await dialogo.perguntar({
      titulo: "Novo projeto",
      kicker: `PASTA DE ${cliente.nome.toUpperCase()}`,
      texto: "O nome deste trabalho, do jeito que você o chama.",
      exemplo: "Camisa Time Azul 2026",
      confirmar: "Criar",
    });
    if (!nome) return;
    await tentar(async () => {
      const novo = await projetosApi.criar(cliente.id, nome);
      setAbertos((antes) => new Set(antes).add(cliente.id));
      await carregarProjetos(cliente.id);
      await carregarClientes();
      await abrirProjeto(novo.id);
    });
  };

  /** Depois de mexer num projeto, a pasta dele precisa refletir a mudança. */
  const recarregarPasta = async () => {
    const clienteId = projetoAberto?.cliente?.id;
    if (clienteId) await tentar(() => carregarProjetos(clienteId));
    await carregarClientes();
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* ---------------------------------------------- a árvore, à esquerda */}
      <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-linha bg-painel">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-linha bg-painel-suave px-3 py-2">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="text-[10px] font-bold tracking-widest text-tinta-fraca uppercase">Clientes</span>
            <span className="font-mono text-[10px] text-tinta-apagada">{clientes.length}</span>
          </span>
          <Botao
            tamanho="pequeno"
            onClick={() => void novoCliente()}
            icone={<Icone referencia="icones.svg#plus" className="size-3.5" />}
          >
            Novo
          </Botao>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {/*
            Falha de carga tem lugar próprio, acima da lista. Sem isto, um erro
            de rede aparecia como "nenhum cliente ainda" — a mensagem mais cara
            possível para quem tem trinta pedidos guardados.
          */}
          {erro && (
            <div className="mb-2 flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] p-2.5">
              <Icone referencia="icones.svg#triangle-alert" className="mt-0.5 size-3.5 shrink-0 text-[var(--danger)]" />
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[11px] leading-relaxed text-[var(--danger)]">{erro}</p>
                <button
                  type="button"
                  onClick={() => void carregarClientes()}
                  className="mt-1 text-[11px] font-semibold text-ambar underline-offset-2 hover:underline"
                >
                  Tentar de novo
                </button>
              </div>
            </div>
          )}

          {carregando ? (
            <p className="px-2 py-6 text-center text-[11px] text-tinta-apagada">Carregando…</p>
          ) : clientes.length === 0 && !erro ? (
            <p className="px-2 py-6 text-center text-[11px] leading-relaxed text-tinta-apagada">
              Nenhum cliente ainda.
              <br />
              Crie a pasta do primeiro.
            </p>
          ) : (
            clientes.map((cliente) => (
              <PastaDoCliente
                key={cliente.id}
                cliente={cliente}
                aberto={abertos.has(cliente.id)}
                ativo={projetoAberto?.cliente?.id === cliente.id}
                projetos={projetosPorCliente[cliente.id]}
                projetoAbertoId={projetoAberto?.id ?? null}
                aoAlternar={() => void alternarCliente(cliente)}
                aoAbrirProjeto={(id) => void abrirProjeto(id)}
                aoNovoProjeto={() => void novoProjeto(cliente)}
                aoRenomear={() => void renomearCliente(cliente)}
                aoExcluir={() => void excluirCliente(cliente)}
              />
            ))
          )}
        </div>
      </aside>

      {/* ------------------------------------------- o trabalho, à direita */}
      {projetoAberto === null ? (
        <div className="grid flex-1 place-items-center p-8">
          <div className="flex max-w-sm flex-col items-center gap-5 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-painel text-tinta-apagada">
              <Icone referencia="icones.svg#folder-tree" className="size-6" />
            </span>
            <div>
              <p className="m-0 font-titulo text-lg font-semibold text-tinta">Abra um projeto</p>
              <p className="mt-1 mb-0 text-sm leading-relaxed text-tinta-fraca">
                Cada cliente tem a sua pasta; dentro dela, uma pasta por projeto. O projeto guarda
                a arte já finalizada, a medida real e os ajustes do encaixe — repetir o pedido é
                abrir, dizer quantas unidades e mandar calcular.
              </p>
            </div>
            <Botao
              jeito="primario"
              onClick={() => void novoCliente()}
              icone={<Icone referencia="icones.svg#plus" className="size-4" />}
            >
              Novo cliente
            </Botao>
          </div>
        </div>
      ) : (
        <EditorDoProjeto
          // `key`: trocar de projeto monta um editor novo, em vez de
          // reaproveitar o anterior com os campos do projeto de antes.
          key={projetoAberto.id}
          projeto={projetoAberto}
          aoFechar={() => setProjetoAberto(null)}
          aoMudarOProjeto={recarregarPasta}
        />
      )}
    </div>
  );
}

// ==================== A PASTA DE UM CLIENTE, NA ÁRVORE ====================

function PastaDoCliente({
  cliente, aberto, ativo, projetos, projetoAbertoId,
  aoAlternar, aoAbrirProjeto, aoNovoProjeto, aoRenomear, aoExcluir,
}: {
  cliente: Cliente;
  aberto: boolean;
  ativo: boolean;
  projetos: ProjetoNaLista[] | undefined;
  projetoAbertoId: number | null;
  aoAlternar: () => void;
  aoAbrirProjeto: (id: number) => void;
  aoNovoProjeto: () => void;
  aoRenomear: () => void;
  aoExcluir: () => void;
}) {
  return (
    <div className="mb-1 animar-entrada">
      <div
        className={[
          "group flex items-center gap-1 rounded-lg border px-1.5 py-1.5 transition-colors",
          ativo
            ? "border-[var(--accent-line)] bg-[var(--accent-soft)]"
            : "border-transparent hover:bg-painel-suave",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={aoAlternar}
          aria-label={aberto ? "Recolher projetos" : "Mostrar projetos"}
          title={aberto ? "Recolher projetos" : "Mostrar projetos"}
          className="grid size-5 shrink-0 place-items-center rounded text-tinta-apagada transition-colors hover:text-ambar"
        >
          <Icone
            referencia={aberto ? "icones.svg#chevron-down" : "icones.svg#chevron-right"}
            className="size-3"
          />
        </button>

        <button type="button" onClick={aoAlternar} className="min-w-0 flex-1 text-left">
          <span className={`block truncate text-xs font-medium ${ativo ? "text-ambar" : "text-tinta"}`}>
            {cliente.nome}
          </span>
          <span className="block font-mono text-[10px] text-tinta-apagada">
            {cliente.projetos} projeto(s)
          </span>
        </button>

        {/*
          As duas ações da pasta só aparecem com o ponteiro em cima, como na
          Lite: a lista fica limpa, e o que se faz o tempo todo (abrir) não
          disputa espaço com o que se faz uma vez. `focus-within` mantém as
          duas alcançáveis pelo teclado.
        */}
        <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={aoRenomear}
            aria-label={`Renomear ${cliente.nome}`}
            title="Renomear cliente"
            className="grid size-6 place-items-center rounded text-tinta-apagada transition-colors hover:bg-[var(--surface-hover)] hover:text-ambar"
          >
            <Icone referencia="icones.svg#pencil" className="size-3" />
          </button>
          <button
            type="button"
            onClick={aoExcluir}
            aria-label={`Apagar ${cliente.nome}`}
            title="Apagar cliente"
            className="grid size-6 place-items-center rounded text-tinta-apagada transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:text-[var(--danger)]"
          >
            <Icone referencia="icones.svg#trash-2" className="size-3" />
          </button>
        </span>
      </div>

      {aberto && (
        <div className="mt-0.5 ml-3 space-y-0.5 border-l border-linha pl-1.5">
          {projetos === undefined ? (
            <p className="px-2 py-1 text-[10px] text-tinta-apagada">carregando…</p>
          ) : projetos.length === 0 ? (
            <p className="px-2 py-1 text-[10px] text-tinta-apagada">nenhum projeto ainda</p>
          ) : (
            projetos.map((projeto) => (
              <button
                key={projeto.id}
                type="button"
                onClick={() => aoAbrirProjeto(projeto.id)}
                className={[
                  "block w-full truncate rounded-md px-2 py-1 text-left text-[11px] transition-colors",
                  projeto.id === projetoAbertoId
                    ? "bg-[var(--accent-soft)] font-medium text-ambar"
                    : "text-tinta-fraca hover:bg-painel-suave hover:text-tinta",
                ].join(" ")}
              >
                {projeto.nome}
              </button>
            ))
          )}

          <button
            type="button"
            onClick={aoNovoProjeto}
            className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-[11px] text-tinta-apagada transition-colors hover:bg-painel-suave hover:text-ambar"
          >
            <Icone referencia="icones.svg#plus" className="size-3 shrink-0" />
            novo projeto
          </button>
        </div>
      )}
    </div>
  );
}

// ==================== O EDITOR, NA ÁREA PRINCIPAL ====================

function EditorDoProjeto({ projeto, aoFechar, aoMudarOProjeto }: {
  projeto: Projeto;
  aoFechar: () => void;
  aoMudarOProjeto: () => Promise<void>;
}) {
  const dialogo = useDialogo();
  const ligacao = useLigacao();

  const [nome, setNome] = useState(projeto.nome);
  const [observacoes, setObservacoes] = useState(projeto.observacoes || "");
  const [larguraTecido, setLarguraTecido] = useState(projeto.largura_tecido?.toString() ?? "");
  const [espaco, setEspaco] = useState(projeto.espaco?.toString() ?? "");
  const [comprimento, setComprimento] = useState(projeto.comprimento_bancada?.toString() ?? "");
  const [giro, setGiro] = useState(projeto.giro || "180");
  const [unidades, setUnidades] = useState("1");
  const [pecas, setPecas] = useState<Peca[]>(projeto.pecas);
  const [erro, setErro] = useState("");
  const [status, setStatus] = useState("");
  const entrada = useRef<HTMLInputElement>(null);

  /**
   * Peça guardada antes da miniatura existir mostra o arquivo inteiro no
   * quadradinho — o que trava a página. Aqui ela ganha a sua, sem bloquear:
   * `createImageBitmap` decodifica fora da thread da tela. As medidas saem do
   * cabeçalho do arquivo para a redução manter a proporção.
   */
  useEffect(() => {
    const faltando = projeto.pecas.filter((peca) => !peca.miniatura && peca.url);
    if (faltando.length === 0) return;
    let cancelado = false;

    (async () => {
      const feitas: { id: number; miniatura: string }[] = [];
      for (const peca of faltando) {
        try {
          const blob = await fetch(peca.url).then((r) => r.blob());
          const medidas = medidasDoArquivo(new Uint8Array(await blob.arrayBuffer()));
          const miniatura = await miniaturaDoBlob(blob, medidas);
          if (cancelado) return;
          if (!miniatura) continue;
          feitas.push({ id: peca.id, miniatura });
          setPecas((atuais) => atuais.map((x) => (x.id === peca.id ? { ...x, miniatura } : x)));
        } catch {
          // sem miniatura: a linha continua mostrando o arquivo, como antes
        }
      }

      // Guarda as prévias recém-feitas, para a próxima abertura ser instantânea.
      // Falhar aqui não é problema: a tela continua funcionando e tenta de novo
      // na próxima vez.
      if (feitas.length > 0 && !cancelado) {
        projetosApi.guardarMiniaturas(projeto.id, feitas).catch(() => {});
      }
    })();

    return () => { cancelado = true; };
  }, [projeto]);

  const mexerNaPeca = (indice: number, mudanca: Partial<Peca>) =>
    setPecas((atuais) => atuais.map((peca, i) => (i === indice ? { ...peca, ...mudanca } : peca)));

  /**
   * A medida sai do dpi gravado no arquivo, exatamente como no Encaixe — é a
   * única fonte confiável do tamanho real. Sem dpi, vale 300 (o padrão de arte
   * para impressão) e o número fica editável na linha.
   */
  const mandarArquivos = async (arquivos: File[]) => {
    setErro("");
    let enviados = 0;

    for (const arquivo of arquivos) {
      setStatus(`Enviando ${arquivo.name}…`);
      try {
        const bytes = new Uint8Array(await arquivo.arrayBuffer());
        const ppcm = pixelsPorCmDoArquivo(bytes) || PPCM_PADRAO;
        const { arquivo: nomeNoDisco, url } = await projetosApi.mandarImagem(projeto.id, arquivo);
        const img = await carregarImagem(url);

        setPecas((atuais) => [...atuais, {
          nome: arquivo.name.replace(/\.[^.]+$/, "").slice(0, 120) || "peça",
          arquivo: nomeNoDisco,
          url,
          miniatura: miniaturaDaImagem(img),
          largura: Math.round((img.naturalWidth / ppcm) * 10) / 10,
          altura: Math.round((img.naturalHeight / ppcm) * 10) / 10,
          quantidade: 1,
        }]);
        enviados++;
      } catch (e) {
        setErro(`"${arquivo.name}": ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    setStatus(enviados > 0 ? `${enviados} arte(s) adicionada(s).` : "");
  };

  const salvar = async (): Promise<boolean> => {
    if (!nome.trim()) { setErro("Dê um nome ao projeto."); return false; }
    const semMedida = pecas.find((peca) => !(Number(peca.largura) > 0) || !(Number(peca.altura) > 0));
    if (semMedida) {
      setErro(`"${semMedida.nome}" está sem medida. Preencha largura e altura em centímetros.`);
      return false;
    }

    try {
      await projetosApi.gravar(projeto.id, {
        nome: nome.trim(),
        observacoes: observacoes.trim(),
        larguraTecido: larguraTecido === "" ? null : Number(larguraTecido),
        espaco: espaco === "" ? null : Number(espaco),
        comprimentoBancada: comprimento === "" ? null : Number(comprimento),
        giro,
        pecas: pecas.map((peca) => ({
          nome: peca.nome,
          arquivo: peca.arquivo,
          miniatura: peca.miniatura,
          largura: Number(peca.largura),
          altura: Number(peca.altura),
          quantidade: Math.max(1, Math.floor(Number(peca.quantidade) || 1)),
        })),
      });
      setErro("");
      return true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      return false;
    }
  };

  /**
   * A repetição: salva, leva os ajustes guardados ao Encaixe e manda as peças.
   *
   * A troca de tela vem ANTES do trabalho, e não depois. O painel de andamento
   * do Encaixe mora dentro daquela tela; com esta ainda na frente ele ficava
   * escondido, e a pessoa via só a tela parada.
   */
  const mandarParaOEncaixe = async () => {
    if (pecas.length === 0) { setErro("O projeto não tem nenhuma arte para encaixar."); return; }
    if (!ligacao) { setErro("O editor de produção não está montado."); return; }
    if (!await salvar()) return;

    const quantas = Math.max(1, Math.floor(Number(unidades) || 1));
    const paraEnviar = pecas.slice();
    const nomeDoTrabalho = nome.trim();

    ligacao.irPara("encaixe");

    try {
      await ligacao.mandarProjetoParaOEncaixe({
        nome: nomeDoTrabalho,
        unidades: quantas,
        pecas: paraEnviar.map((peca) => ({
          nome: peca.nome,
          url: peca.url,
          largura: Number(peca.largura),
          altura: Number(peca.altura),
          quantidade: Math.max(1, Math.floor(Number(peca.quantidade) || 1)),
        })),
        ajustes: {
          larguraTecido: larguraTecido === "" ? null : Number(larguraTecido),
          /*
           * O projeto guarda a folga em MILÍMETRO (é o que o campo desta tela
           * pergunta) e o Encaixe trabalha em CENTÍMETRO. A conversão é aqui,
           * na passagem, e não no que está gravado: mexer na unidade do banco
           * reinterpretaria todo projeto já salvo — 5 viraria 5 cm, dez vezes
           * a folga, e o tecido a mais só apareceria depois de imprimir.
           */
          espaco: espaco === "" ? null : Number(espaco) / 10,
          comprimentoBancada: comprimento === "" ? null : Number(comprimento),
          giro,
        },
      });
    } catch (e) {
      // O aviso aparece na tela do Encaixe, que é onde a pessoa está agora.
      await dialogo.avisar(
        `Não deu para mandar o projeto ao encaixe: ${e instanceof Error ? e.message : String(e)}`,
        { perigoso: true },
      );
    }
  };

  const excluir = async () => {
    const certeza = await dialogo.confirmar(
      "Apagar este projeto apaga as artes dentro dele. Não tem volta.",
      { titulo: "Excluir projeto", confirmar: "Excluir" },
    );
    if (!certeza) return;
    try {
      await projetosApi.apagar(projeto.id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      return;
    }
    aoFechar();
    await aoMudarOProjeto();
  };

  const porUnidade = pecas.reduce((soma, peca) => soma + (Number(peca.quantidade) || 0), 0);
  const quantas = Math.max(1, Math.floor(Number(unidades) || 1));

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* O topo e o pé ficam parados; o miolo é que rola. */}
      <header className="flex shrink-0 items-center gap-3 border-b border-linha bg-painel-suave px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold tracking-widest text-tinta-apagada uppercase">
            {projeto.cliente?.nome ?? "Cliente"}
          </span>
          {/*
            O nome do projeto é editado ali mesmo, sem campo com moldura — é o
            `EditableText` da Lite. A moldura aparece ao passar o ponteiro.
          */}
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={120}
            aria-label="Nome do projeto"
            className="w-full truncate rounded-md border border-transparent bg-transparent px-1 py-0.5 font-titulo text-base font-semibold text-tinta transition-colors hover:border-linha focus:border-[var(--accent-line)] focus:outline-none"
          />
        </div>

        <span className="flex shrink-0 items-center gap-2">
          <BotaoDeIcone title="Excluir projeto" perigoso onClick={() => void excluir()}>
            <Icone referencia="icones.svg#trash-2" className="size-3.5" />
          </BotaoDeIcone>
          <Botao
            tamanho="pequeno"
            onClick={async () => {
              if (await salvar()) { setStatus("Projeto salvo."); await aoMudarOProjeto(); }
            }}
          >
            Salvar
          </Botao>
          <Botao
            jeito="primario"
            tamanho="pequeno"
            onClick={() => void mandarParaOEncaixe()}
            icone={<Icone referencia="icones.svg#blocks" className="size-3.5" />}
          >
            Levar pro Encaixe
          </Botao>
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <label className="block max-w-xl">
          <span className="mb-1.5 block text-[10px] font-bold tracking-widest text-tinta-fraca uppercase">
            Observações
          </span>
          <input
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            maxLength={500}
            placeholder="opcional"
            className={CAMPO}
          />
        </label>

        {/* ---------------------------------------------------- as artes */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="text-[10px] font-bold tracking-widest text-tinta-fraca uppercase">
              Peças da produção
            </span>
            <span className="font-mono text-[10px] text-tinta-apagada">{pecas.length}</span>
          </span>

          <span className="flex shrink-0 items-center gap-2">
            <span className="font-mono text-[10px] text-tinta-apagada">{status}</span>
            <Botao
              tamanho="pequeno"
              onClick={() => entrada.current?.click()}
              icone={<Icone referencia="icones.svg#plus" className="size-3.5" />}
            >
              Adicionar arte
            </Botao>
            <input
              ref={entrada}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(evento) => {
                const arquivos = [...(evento.target.files || [])];
                evento.target.value = "";
                if (arquivos.length > 0) void mandarArquivos(arquivos);
              }}
            />
          </span>
        </div>

        <p className="mt-1 mb-0 text-xs leading-relaxed text-tinta-apagada">
          A arte já finalizada. A medida vem do dpi gravado no arquivo; quando ele não traz,
          digite os centímetros — fica guardado para a próxima vez.
        </p>

        <div className="mt-3 space-y-2">
          {pecas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-linha px-4 py-8 text-center">
              <p className="m-0 text-sm font-medium text-tinta-fraca">Nenhuma arte no projeto</p>
              <p className="mt-1 mb-0 text-xs text-tinta-apagada">
                Clique em "Adicionar arte" e mande a estampa já aplicada na peça.
              </p>
            </div>
          ) : pecas.map((peca, indice) => (
            <article
              key={peca.id ?? `nova-${indice}-${peca.arquivo}`}
              className="group flex flex-wrap items-center gap-3 rounded-xl border border-linha bg-painel px-3 py-2.5 transition-colors hover:border-[var(--accent-line)] animar-entrada"
            >
              <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-linha bg-painel-suave">
                {peca.miniatura
                  ? <img src={peca.miniatura} alt="" className="size-full object-contain" />
                  : <span className="text-[10px] text-tinta-apagada">…</span>}
              </span>

              <input
                value={peca.nome}
                onChange={(e) => mexerNaPeca(indice, { nome: e.target.value })}
                maxLength={120}
                aria-label="Nome da peça"
                className="min-w-32 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm text-tinta transition-colors hover:border-linha focus:border-[var(--accent-line)] focus:outline-none"
              />

              <MedidaDaPeca rotulo="Larg. cm">
                <input
                  type="number" min="0.1" step="0.1"
                  value={peca.largura}
                  onChange={(e) => mexerNaPeca(indice, { largura: Number(e.target.value) })}
                  className={MEDIDA}
                />
              </MedidaDaPeca>

              <MedidaDaPeca rotulo="Alt. cm">
                <input
                  type="number" min="0.1" step="0.1"
                  value={peca.altura}
                  onChange={(e) => mexerNaPeca(indice, { altura: Number(e.target.value) })}
                  className={MEDIDA}
                />
              </MedidaDaPeca>

              <MedidaDaPeca rotulo="Qtd">
                <input
                  type="number" min="1" step="1"
                  value={peca.quantidade}
                  onChange={(e) => mexerNaPeca(indice, { quantidade: Number(e.target.value) })}
                  className={`${MEDIDA} w-16`}
                />
              </MedidaDaPeca>

              <button
                type="button"
                onClick={() => setPecas((atuais) => atuais.filter((_, i) => i !== indice))}
                aria-label="Tirar esta arte"
                title="Tirar esta arte"
                className="grid size-7 shrink-0 place-items-center rounded-lg text-tinta-apagada opacity-0 transition-all hover:bg-[color-mix(in_srgb,var(--danger)_20%,transparent)] hover:text-[var(--danger)] group-hover:opacity-100 focus:opacity-100"
              >
                <Icone referencia="icones.svg#trash-2" className="size-3.5" />
              </button>
            </article>
          ))}
        </div>

        {/* ------------------------------------------ os ajustes do encaixe */}
        <p className="mt-6 mb-1 text-[10px] font-bold tracking-widest text-tinta-fraca uppercase">
          Ajustes do encaixe
        </p>
        <p className="mt-0 mb-3 text-xs text-tinta-apagada">
          Guardados com o projeto, para a repetição já sair calculada do mesmo jeito.
        </p>

        <div className="flex flex-wrap gap-3">
          <CampoDoAjuste rotulo="Largura do tecido (cm)">
            <input type="number" min="10" step="1" placeholder="160"
              value={larguraTecido} onChange={(e) => setLarguraTecido(e.target.value)} className={CAMPO} />
          </CampoDoAjuste>

          <CampoDoAjuste rotulo="Folga entre peças (mm)">
            <input type="number" min="0" max="100" step="1" placeholder="5"
              value={espaco} onChange={(e) => setEspaco(e.target.value)} className={CAMPO} />
          </CampoDoAjuste>

          <CampoDoAjuste rotulo="Comprimento da bancada (cm)">
            <input type="number" min="0" step="1" placeholder="sem limite"
              value={comprimento} onChange={(e) => setComprimento(e.target.value)} className={CAMPO} />
          </CampoDoAjuste>

          <CampoDoAjuste rotulo="Giro das peças">
            <select value={giro} onChange={(e) => setGiro(e.target.value)} className={CAMPO}>
              <option value="180">180° — vira de cabeça para baixo</option>
              <option value="livre">90° — a volta inteira</option>
              <option value="fixa">Fixa — não gira</option>
            </select>
          </CampoDoAjuste>
        </div>

        {erro && (
          <p className="mt-4 mb-0 flex items-center gap-2 text-sm text-[var(--danger)]">
            <Icone referencia="icones.svg#triangle-alert" className="size-4 shrink-0" />
            {erro}
          </p>
        )}
      </div>

      {/* ------------------------------------------------- a conta, no pé */}
      <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-linha bg-painel-suave px-4 py-2.5">
        <label className="flex shrink-0 items-center gap-2">
          <span className="text-[10px] font-bold tracking-widest text-tinta-fraca uppercase">Unidades</span>
          <input
            type="number" min="1" step="1"
            value={unidades} onChange={(e) => setUnidades(e.target.value)}
            className="w-20 rounded-lg border border-linha bg-painel px-2 py-1 text-center font-mono text-sm text-tinta focus:border-[var(--accent-line)] focus:outline-none"
          />
        </label>

        {/* A conta que a pessoa faria de cabeça: quantas peças vão ao encaixe. */}
        <span className="font-mono text-xs text-tinta-fraca">
          {pecas.length === 0
            ? ""
            : `${porUnidade} peça(s) por unidade × ${quantas} = ${porUnidade * quantas} peça(s) no encaixe`}
        </span>

        <span className="ml-auto text-xs text-tinta-apagada">
          O cálculo não começa sozinho: no Encaixe você escolhe o tempo de procura e aperta{" "}
          <strong className="font-semibold text-tinta-fraca">Optmizar</strong>.
        </span>
      </footer>
    </section>
  );
}

/** O campo dos ajustes, na medida da Lite: rótulo em versalete sobre a caixa. */
const CAMPO =
  "h-10 w-full rounded-xl border border-linha bg-painel-suave px-3 text-sm text-tinta" +
  " placeholder:text-tinta-apagada focus:border-[var(--accent-line)] focus:outline-none";

/** O campo miúdo de medida, dentro da linha de uma peça. */
const MEDIDA =
  "w-20 rounded-lg border border-linha bg-painel-suave px-2 py-1 text-center font-mono text-xs" +
  " text-tinta focus:border-[var(--accent-line)] focus:outline-none";

function CampoDoAjuste({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="block w-52 shrink-0">
      <span className="mb-1.5 block text-[10px] font-semibold tracking-wider text-tinta-fraca uppercase">
        {rotulo}
      </span>
      {children}
    </label>
  );
}

function MedidaDaPeca({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="shrink-0">
      <span className="mb-0.5 block text-[9px] font-semibold tracking-wider text-tinta-apagada uppercase">
        {rotulo}
      </span>
      {children}
    </label>
  );
}

// ==================== AS MINIATURAS ====================

const carregarImagem = (src: string) => new Promise<HTMLImageElement>((ok, falhou) => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = () => falhou(new Error("não deu para abrir a imagem"));
  img.src = src;
});

function miniaturaDaImagem(img: HTMLImageElement): string | null {
  try {
    const fator = Math.min(1, LADO_DA_MINIATURA / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * fator));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * fator));
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/**
 * A miniatura de uma arte que já está no disco.
 *
 * Decodifica JÁ no tamanho da miniatura: o navegador faz a redução fora da
 * thread da tela, e o canvas só copia 240 px. Abrir e desenhar a arte inteira
 * para depois encolher custava quase 1 s de página parada, para chegar ao
 * mesmo quadradinho.
 */
async function miniaturaDoBlob(
  blob: Blob,
  medidas: { largura: number; altura: number } | null,
): Promise<string | null> {
  let opcoes: ImageBitmapOptions | undefined;
  if (medidas && medidas.largura > 0 && medidas.altura > 0) {
    const fator = Math.min(1, LADO_DA_MINIATURA / Math.max(medidas.largura, medidas.altura));
    opcoes = {
      resizeWidth: Math.max(1, Math.round(medidas.largura * fator)),
      resizeHeight: Math.max(1, Math.round(medidas.altura * fator)),
      resizeQuality: "medium",
    };
  }

  const bitmap = await createImageBitmap(blob, opcoes);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.toDataURL("image/png");
}
