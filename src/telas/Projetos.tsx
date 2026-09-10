/**
 * ===========================================================================
 * TELA DE PROJETOS — a estante do trabalho que se repete
 * ===========================================================================
 *
 * A navegação é a de uma gaveta: a lista começa nos clientes e entra num deles
 * para ver as pastas de projeto. Abrir um projeto abre o editor, onde ficam as
 * peças (a arte já finalizada, com a medida real) e os ajustes do encaixe.
 *
 * O que esta tela NÃO faz, de propósito: aplicar estampa em molde. Isso é a
 * tela de Moldes, e o fluxo é outro — lá a arte é colocada dentro de um
 * contorno; aqui ela já chega colocada.
 *
 * ---------------------------------------------------------------------------
 * ERA IMPERATIVA, E O QUE MUDOU AO SAIR DE LÁ
 * ---------------------------------------------------------------------------
 *
 * Esta tela era 620 linhas dentro de `producao/controlador.js`: `innerHTML`
 * para desenhar a estante, `getElementById` para ler cada campo, e um `pecas`
 * de módulo que a tela reescrevia a cada tecla. O estado agora é `useState`, o
 * React desenha, e a lista de peças é a única fonte da verdade — não há mais
 * um DOM guardando um valor que o objeto não tem.
 *
 * **As classes de `producao.css` ficaram.** Elas são as mesmas da tela antiga,
 * e a folha inteira é escopada em `:where(.producao)` — daí o `<div
 * className="producao">` em volta. Trocar o desenho por utilitários do
 * Tailwind no mesmo passo em que se troca o motor da tela faria uma mudança
 * invisível (o estado) chegar à fábrica junto com uma visível (o desenho), e
 * qualquer coisa fora do lugar viraria dúvida sobre as duas. O desenho muda
 * depois, quando as três telas tiverem saído do controlador.
 *
 * A ida para o Encaixe continua passando pelo controlador, pela `ligacao`: o
 * Encaixe ainda é imperativo. É a última amarra desta tela, e some com ele.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useDialogo } from "../casca/Dialogo";
import { projetosApi, type Cliente, type Projeto, type ProjetoNaLista } from "../api/projetos";
import { medidasDoArquivo, pixelsPorCmDoArquivo, PPCM_PADRAO } from "../motores/medidaDoArquivo";
import { useLigacao } from "../producao/ligacao";

/**
 * A arte reduzida para caber na tela.
 *
 * A lista e o editor mostram a peça num quadrado de ~57 px. Apontar o `<img>`
 * para o arquivo de impressão faz o navegador decodificar dezenas de
 * megapixels para pintar isso — medido em 526 ms ao abrir o editor e 1,8 s ao
 * trocar de aba. A miniatura é gerada uma vez, no envio, e fica guardada.
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
  const [clienteAberto, setClienteAberto] = useState<{ id: number; nome: string } | null>(null);
  const [projetos, setProjetos] = useState<ProjetoNaLista[]>([]);
  const [erro, setErro] = useState("");
  const [projetoAberto, setProjetoAberto] = useState<Projeto | null>(null);

  const mostrarClientes = useCallback(async () => {
    try {
      setClientes(await projetosApi.clientes());
      setClienteAberto(null);
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const abrirCliente = useCallback(async (id: number) => {
    try {
      const { cliente, projetos: lista } = await projetosApi.projetosDoCliente(id);
      setClienteAberto(cliente);
      setProjetos(lista);
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }, []);

  /*
   * A estante é carregada ao entrar na tela. Antes isso era um evento de troca
   * de tela e uma trava de "já montou", porque a tela existia o tempo todo no
   * DOM; agora ela é uma rota, e entrar nela É a montagem.
   */
  useEffect(() => { void mostrarClientes(); }, [mostrarClientes]);

  const abrirProjeto = async (id: number) => {
    await tentar(async () => setProjetoAberto(await projetosApi.abrir(id)));
  };

  /**
   * Toda ação da estante passa por aqui.
   *
   * Sem isto, um servidor fora do ar (ou um nome que ele recusa) vira uma
   * promessa rejeitada que ninguém pega: no console aparece o erro, e na tela
   * não acontece nada — o botão parece simplesmente não funcionar. É o pior
   * formato de defeito para quem está usando, porque não dá o que contar.
   */
  const tentar = async (acao: () => Promise<void>) => {
    try {
      await acao();
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
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
      await mostrarClientes();
    });
  };

  const renomearCliente = async (cliente: Cliente) => {
    const nome = await dialogo.perguntar({
      titulo: "Renomear cliente", kicker: "PASTA DO CLIENTE", valor: cliente.nome, confirmar: "Salvar",
    });
    if (!nome) return;
    await tentar(async () => {
      await projetosApi.renomearCliente(cliente.id, nome);
      await mostrarClientes();
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
      await mostrarClientes();
    });
  };

  const novoProjeto = async () => {
    if (!clienteAberto) return;
    const nome = await dialogo.perguntar({
      titulo: "Novo projeto",
      kicker: `PASTA DE ${clienteAberto.nome.toUpperCase()}`,
      texto: "O nome deste trabalho, do jeito que você o chama.",
      exemplo: "Camisa Time Azul 2026",
      confirmar: "Criar",
    });
    if (!nome) return;
    await tentar(async () => {
      const novo = await projetosApi.criar(clienteAberto.id, nome);
      await abrirCliente(clienteAberto.id);
      await abrirProjeto(novo.id);
    });
  };

  /** Depois de mexer num projeto, a pasta aberta precisa refletir a mudança. */
  const recarregarPasta = async () => {
    if (clienteAberto) await abrirCliente(clienteAberto.id);
  };

  return (
    // Ver o cabeçalho: a folha `producao.css` é escopada em `:where(.producao)`.
    <div className="producao">
      <section className="card">
        <div className="card-head">
          <div className="card-head-copy">
            <h2>{clienteAberto ? clienteAberto.nome : "Clientes"}</h2>
            <p className="hint">
              {clienteAberto
                ? "Os projetos deste cliente. Abrir um deles leva às peças e aos ajustes."
                : "Cada cliente tem a sua pasta; dentro dela, uma pasta por projeto."}
            </p>
          </div>

          <span className="card-head-acoes">
            {clienteAberto ? (
              <>
                <button className="btn secondary" type="button" onClick={() => void mostrarClientes()}>
                  ← Todos os clientes
                </button>
                <button className="btn primary" type="button" onClick={() => void novoProjeto()}>
                  <span aria-hidden="true">+</span> Novo projeto
                </button>
              </>
            ) : (
              <button className="btn primary" type="button" onClick={() => void novoCliente()}>
                <span aria-hidden="true">+</span> Novo cliente
              </button>
            )}
          </span>
        </div>

        <details className="ajuda">
          <summary>Para que serve esta tela</summary>
          <div className="ajuda-corpo">
            <p>
              Aqui fica o trabalho que <strong>se repete</strong>. A arte entra já pronta — a
              estampa aplicada na camisa, na bandeira, no que for — junto com a medida real e
              quantas vão em cada unidade.
            </p>
            <p>
              É diferente de <strong>Moldes</strong>, e de propósito. No molde guarda-se o
              contorno da peça, para a estampa ser aplicada nele depois, em qualquer tamanho.
              Aqui a estampa já está aplicada: a peça vai direto para o encaixe.
            </p>
            <p>
              O projeto guarda também a largura do tecido, a folga, o comprimento da bancada e
              o giro que deram certo. Repetir o pedido é abrir, dizer quantas unidades e mandar
              calcular.
            </p>
          </div>
        </details>

        {erro && <p className="hint error">Não deu para carregar: {erro}</p>}

        <div className="projeto-lista">
          {clienteAberto
            ? <PastasDeProjeto projetos={projetos} aoAbrir={abrirProjeto} />
            : <PastasDeCliente clientes={clientes} aoAbrir={abrirCliente} aoRenomear={renomearCliente} aoExcluir={excluirCliente} />}
        </div>
      </section>

      {projetoAberto && (
        <EditorDoProjeto
          // `key`: trocar de projeto monta um editor novo, em vez de reaproveitar
          // o anterior com os campos do projeto de antes.
          key={projetoAberto.id}
          projeto={projetoAberto}
          aoFechar={() => setProjetoAberto(null)}
          aoMudarOProjeto={recarregarPasta}
        />
      )}
    </div>
  );
}

// ==================== A ESTANTE ====================

function PastasDeCliente({ clientes, aoAbrir, aoRenomear, aoExcluir }: {
  clientes: Cliente[];
  aoAbrir: (id: number) => void;
  aoRenomear: (cliente: Cliente) => void;
  aoExcluir: (cliente: Cliente) => void;
}) {
  if (clientes.length === 0) {
    return (
      <div className="lista-vazia">
        <strong>Nenhum cliente ainda</strong>
        <p>Crie a pasta de um cliente para começar a guardar os projetos dele.</p>
      </div>
    );
  }

  return (
    <>
      {clientes.map((cliente) => (
        <article
          key={cliente.id}
          className="projeto-pasta"
          tabIndex={0}
          role="button"
          onClick={() => aoAbrir(cliente.id)}
          // A pasta é clicável, então tem que abrir no Enter também.
          onKeyDown={(evento) => {
            if (evento.key !== "Enter" && evento.key !== " ") return;
            evento.preventDefault();
            aoAbrir(cliente.id);
          }}
        >
          <span className="pasta-icone" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7.5a2 2 0 012-2h4l1.8 2H19a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
          </span>

          <div className="pasta-copy">
            <h3 className="pasta-nome">{cliente.nome}</h3>
            {cliente.observacoes && <p className="pasta-obs">{cliente.observacoes}</p>}
            <p className="pasta-conta">{cliente.projetos} projeto{cliente.projetos === 1 ? "" : "s"}</p>
          </div>

          {/*
            Os botões vivem dentro da pasta, que também é um botão. O
            `stopPropagation` é o que impede "Excluir" de abrir a pasta no mesmo
            clique em que pergunta se ela pode ser apagada.
          */}
          <div className="pasta-acoes">
            <button
              type="button"
              className="btn secondary btn-sm"
              onClick={(evento) => { evento.stopPropagation(); aoRenomear(cliente); }}
            >
              Renomear
            </button>
            <button
              type="button"
              className="btn ghost-danger btn-sm"
              onClick={(evento) => { evento.stopPropagation(); aoExcluir(cliente); }}
            >
              Excluir
            </button>
          </div>
        </article>
      ))}
    </>
  );
}

function PastasDeProjeto({ projetos, aoAbrir }: { projetos: ProjetoNaLista[]; aoAbrir: (id: number) => void }) {
  if (projetos.length === 0) {
    return (
      <div className="lista-vazia">
        <strong>Nenhum projeto nesta pasta</strong>
        <p>Crie um projeto e mande para dentro dele a arte já finalizada.</p>
      </div>
    );
  }

  return (
    <>
      {projetos.map((projeto) => (
        <article
          key={projeto.id}
          className="projeto-pasta"
          tabIndex={0}
          role="button"
          onClick={() => aoAbrir(projeto.id)}
          onKeyDown={(evento) => {
            if (evento.key !== "Enter" && evento.key !== " ") return;
            evento.preventDefault();
            aoAbrir(projeto.id);
          }}
        >
          <span className="pasta-capa" aria-hidden="true">
            {projeto.capa
              ? <img src={projeto.capa} alt="" />
              : <span className="pasta-sem-capa">sem prévia</span>}
          </span>

          <div className="pasta-copy">
            <h3 className="pasta-nome">{projeto.nome}</h3>
            {projeto.observacoes && <p className="pasta-obs">{projeto.observacoes}</p>}
            <p className="pasta-conta">
              {projeto.pecas} arte{projeto.pecas === 1 ? "" : "s"}
              {" · "}{projeto.pecasPorUnidade} peça{projeto.pecasPorUnidade === 1 ? "" : "s"} por unidade
              {projeto.largura_tecido ? ` · tecido ${projeto.largura_tecido} cm` : ""}
            </p>
          </div>

          <div className="pasta-acoes">
            <button
              type="button"
              className="btn primary btn-sm"
              onClick={(evento) => { evento.stopPropagation(); aoAbrir(projeto.id); }}
            >
              Abrir
            </button>
          </div>
        </article>
      ))}
    </>
  );
}

// ==================== O EDITOR ====================

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
  const campoNome = useRef<HTMLInputElement>(null);

  useEffect(() => { campoNome.current?.focus(); }, []);

  /*
   * O corpo ganha `dialog-open` enquanto o editor está aberto: é ele que
   * segura a rolagem da página por baixo do modal. Sai na desmontagem, e não
   * num "fechar" — assim ele sai também quando a tela inteira é trocada com o
   * editor aberto.
   */
  useEffect(() => {
    document.body.classList.add("dialog-open");
    return () => document.body.classList.remove("dialog-open");
  }, []);

  useEffect(() => {
    const noEsc = (evento: KeyboardEvent) => { if (evento.key === "Escape") aoFechar(); };
    window.addEventListener("keydown", noEsc);
    return () => window.removeEventListener("keydown", noEsc);
  }, [aoFechar]);

  /**
   * Peça guardada antes da miniatura existir mostra o arquivo inteiro no
   * quadradinho — o que trava a página. Aqui ela ganha a sua, sem bloquear:
   * `createImageBitmap` decodifica fora da thread da tela. As medidas saem do
   * cabeçalho do arquivo para a redução manter a proporção; passar 240x240
   * fixo esticaria a arte.
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
   * A troca de aba vem ANTES do trabalho, e não depois. O painel de andamento
   * do Encaixe mora dentro daquela tela; com o editor ainda na frente ele
   * ficava escondido, e a pessoa via só a tela parada.
   */
  const mandarParaOEncaixe = async () => {
    if (pecas.length === 0) { setErro("O projeto não tem nenhuma arte para encaixar."); return; }
    if (!ligacao) { setErro("O editor de produção não está montado."); return; }
    if (!await salvar()) return;

    const quantas = Math.max(1, Math.floor(Number(unidades) || 1));
    const paraEnviar = pecas.slice();
    const nomeDoTrabalho = nome.trim();

    aoFechar();
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
    <div
      className="modal-fundo"
      onClick={(evento) => { if (evento.target === evento.currentTarget) aoFechar(); }}
    >
      <section className="modal modal-projeto" role="dialog" aria-modal="true" aria-labelledby="projeto-editor-titulo">
        <header className="modal-topo">
          <div>
            <span className="eyebrow">{(projeto.cliente?.nome || "CLIENTE").toUpperCase()}</span>
            <h3 id="projeto-editor-titulo">{projeto.nome}</h3>
          </div>
          <button type="button" className="btn-x" aria-label="Fechar projeto" onClick={aoFechar}>×</button>
        </header>

        <div className="modal-corpo">
          <div className="row">
            <label style={{ flex: "2 1 260px" }}>
              Nome do projeto
              <input
                ref={campoNome}
                type="text"
                maxLength={120}
                placeholder="Camisa Time Azul 2026"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </label>

            <label style={{ flex: "3 1 300px" }}>
              Observações
              <input
                type="text"
                maxLength={500}
                placeholder="opcional"
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
              />
            </label>
          </div>

          <h4 className="projeto-secao">Peças da produção</h4>
          <p className="hint">
            A arte já finalizada. A medida vem do dpi gravado no arquivo; quando ele não traz,
            digite os centímetros — fica guardado para a próxima vez.
          </p>

          <div className="row">
            <label className="btn secondary file-label">
              Adicionar arte
              <input
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
            </label>
            <span className="hint">{status}</span>
          </div>

          <div className="projeto-pecas">
            {pecas.length === 0 ? (
              <div className="lista-vazia">
                <strong>Nenhuma arte no projeto</strong>
                <p>Clique em "Adicionar arte" e mande a estampa já aplicada na peça.</p>
              </div>
            ) : pecas.map((peca, indice) => (
              <article className="projeto-peca" key={peca.id ?? `nova-${indice}-${peca.arquivo}`}>
                <span className="peca-capa">
                  {peca.miniatura
                    ? <img src={peca.miniatura} alt="" />
                    : <span className="peca-capa-vazia" aria-label="preparando a prévia">…</span>}
                </span>

                <label className="peca-campo peca-campo-nome">
                  Nome
                  <input
                    type="text"
                    maxLength={120}
                    value={peca.nome}
                    onChange={(e) => mexerNaPeca(indice, { nome: e.target.value })}
                  />
                </label>

                <label className="peca-campo">
                  Largura (cm)
                  <input
                    type="number" min="0.1" step="0.1"
                    value={peca.largura}
                    onChange={(e) => mexerNaPeca(indice, { largura: Number(e.target.value) })}
                  />
                </label>

                <label className="peca-campo">
                  Altura (cm)
                  <input
                    type="number" min="0.1" step="0.1"
                    value={peca.altura}
                    onChange={(e) => mexerNaPeca(indice, { altura: Number(e.target.value) })}
                  />
                </label>

                <label className="peca-campo">
                  Qtd por unidade
                  <input
                    type="number" min="1" step="1"
                    value={peca.quantidade}
                    onChange={(e) => mexerNaPeca(indice, { quantidade: Number(e.target.value) })}
                  />
                </label>

                <button
                  type="button"
                  className="btn ghost-danger btn-sm"
                  aria-label="Tirar esta arte"
                  onClick={() => setPecas((atuais) => atuais.filter((_, i) => i !== indice))}
                >
                  ×
                </button>
              </article>
            ))}
          </div>

          <h4 className="projeto-secao">Ajustes do encaixe</h4>
          <p className="hint">Guardados com o projeto, para a repetição já sair calculada do mesmo jeito.</p>

          <div className="row">
            <label>
              Largura do tecido (cm)
              <input type="number" min="10" step="1" placeholder="160"
                value={larguraTecido} onChange={(e) => setLarguraTecido(e.target.value)} />
            </label>

            <label>
              Folga entre peças (mm)
              <input type="number" min="0" max="100" step="1" placeholder="5"
                value={espaco} onChange={(e) => setEspaco(e.target.value)} />
            </label>

            <label>
              Comprimento da bancada (cm)
              <input type="number" min="0" step="1" placeholder="sem limite"
                value={comprimento} onChange={(e) => setComprimento(e.target.value)} />
            </label>

            <label>
              Giro das peças
              <select value={giro} onChange={(e) => setGiro(e.target.value)}>
                <option value="180">180° — vira de cabeça para baixo</option>
                <option value="livre">90° — a volta inteira</option>
                <option value="fixa">Fixa — não gira</option>
              </select>
            </label>
          </div>

          {erro && <p className="hint error">{erro}</p>}
        </div>

        <footer className="modal-rodape projeto-rodape">
          <div className="projeto-repetir">
            <label>
              Unidades
              <input type="number" min="1" step="1" value={unidades} onChange={(e) => setUnidades(e.target.value)} />
            </label>

            {/* A conta que a pessoa faria de cabeça: quantas peças vão ao encaixe. */}
            <span className="hint">
              {pecas.length === 0 ? "" : (
                `${porUnidade} peça${porUnidade === 1 ? "" : "s"} por unidade × ${quantas} = `
                + `${porUnidade * quantas} peça${porUnidade * quantas === 1 ? "" : "s"} no encaixe`
              )}
            </span>

            <span className="hint projeto-aviso">
              O cálculo não começa sozinho: no Encaixe você escolhe o tempo de procura e aperta <strong>Optmizar</strong>.
            </span>
          </div>

          <span className="card-head-acoes">
            <button className="btn ghost-danger" type="button" onClick={() => void excluir()}>Excluir projeto</button>
            <button
              className="btn secondary"
              type="button"
              onClick={async () => {
                if (await salvar()) { setStatus("Projeto salvo."); await aoMudarOProjeto(); }
              }}
            >
              Salvar
            </button>
            <button className="btn primary" type="button" onClick={() => void mandarParaOEncaixe()}>
              Salvar e levar pro Encaixe
            </button>
          </span>
        </footer>
      </section>
    </div>
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
