/**
 * ===========================================================================
 * O PASSO A PASSO DO MOLDE — criar e reeditar
 * ===========================================================================
 *
 * Criar um molde é um passo a passo, para não pedir tudo de uma vez:
 *   1. o que é (camisa, regata, short, banner, ou outra coisa);
 *   2. quantos pedaços tem, o nome e os tamanhos;
 *   3. um espaço por pedaço, para dizer o que é aquela parte e mandar o arquivo.
 *
 * Reeditar pula direto para o passo 3: o molde já sabe o que é e quantos são.
 *
 * ---------------------------------------------------------------------------
 * AS ABAS DE TAMANHO
 * ---------------------------------------------------------------------------
 *
 * Cada tamanho tem o seu arquivo: o molde do P não é o do G. Por isso o passo
 * 3 é dividido em abas — uma por tamanho — e o que está na tela é sempre o
 * tamanho aberto. Guardar por tamanho, e não tudo numa lista só, é o que deixa
 * mandar a grade inteira sem misturar peça de um tamanho com a do outro.
 *
 * Na versão imperativa isso era um `partesPorTamanho` de módulo mais um
 * `partesDoMolde` que apontava para o de dentro dele, e uma função
 * `guardarTamanhoAberto()` chamada à mão antes de cada troca de aba — porque
 * os dois podiam sair de sincronia. Aqui só existe o mapa: o tamanho aberto é
 * uma chave dele, e não há o que guardar antes de trocar.
 */

import { useEffect, useState } from "react";
import { moldesApi, type Molde, type MoldeParaGravar } from "../../api/moldes";
import { ehArquivoDeMolde, FORMATOS_DE_MOLDE, lerMoldeVetorial, moldeParaImagem } from "../../motores/moldes";
import { lerQuantidadeDoNome } from "../../motores/nomeDeArquivo";
import { corDaPeca } from "../../utils/coresDePeca";
import { useDialogo } from "../../casca/Dialogo";
import {
  PAPEIS_DE_PECA, TIPOS_DE_MOLDE, adivinharPapel, comoNaFrase, deArtigo, lerTamanhos,
  nomeDaParte, novoIdDeParte, parteVazia, umArtigo,
  type ParteEmEdicao, type TipoDeMolde,
} from "./vocabulario";

/** Uma peça fechada, do jeito que o leitor de DXF/PLT/SVG/PDF a devolve. */
interface DesenhoLido {
  nome: string;
  largura: number;
  altura: number;
  contorno: { x: number; y: number }[];
  furos?: { x: number; y: number }[][];
}

/** As partes de cada tamanho. A chave é o nome do tamanho ("P", "único"). */
type PorTamanho = Record<string, ParteEmEdicao[]>;

interface Props {
  /** O molde aberto para reedição, ou `null` para um molde novo. */
  molde: Molde | null;
  aoFechar: () => void;
  aoSalvar: (aviso: string) => void;
}

export function EditorDeMolde({ molde, aoFechar, aoSalvar }: Props) {
  const dialogo = useDialogo();

  // ---- passo 1 ----
  const [tipo, setTipo] = useState<TipoDeMolde | null>(null);
  const [tipoOutro, setTipoOutro] = useState("");

  // ---- passo 2 ----
  const [pedacos, setPedacos] = useState("5");
  const [nome, setNome] = useState(molde?.nome ?? "");
  const [tamanhosEscritos, setTamanhosEscritos] = useState("único");
  const [modoVetor, setModoVetor] = useState("marcador");
  const [unidade, setUnidade] = useState("");
  const [observacoes, setObservacoes] = useState(molde?.observacoes ?? "");

  // ---- passo 3 ----
  const [porTamanho, setPorTamanho] = useState<PorTamanho>({});
  const [tamanhoAberto, setTamanhoAberto] = useState("único");
  const [tamanhoNovo, setTamanhoNovo] = useState("");

  const [passo, setPasso] = useState(molde ? 3 : 1);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  /*
   * Reeditar: as peças voltam separadas por tamanho, cada tamanho na sua aba —
   * do mesmo jeito que foram mandadas.
   */
  useEffect(() => {
    if (!molde) return;
    const mapa: PorTamanho = {};
    for (const peca of molde.pecas) {
      const tamanho = peca.tamanho || "único";
      (mapa[tamanho] ||= []).push({
        id: novoIdDeParte(),
        papel: PAPEIS_DE_PECA.includes(peca.papel) ? peca.papel : "outro",
        papelEscrito: PAPEIS_DE_PECA.includes(peca.papel) ? "" : peca.papel,
        quantidade: peca.quantidade,
        nome: peca.nome,
        largura: peca.largura,
        altura: peca.altura,
        contorno: peca.contorno,
        furos: peca.furos || [],
        origem: peca.origem || "guardado",
      });
    }
    const tamanhos = Object.keys(mapa);
    setPorTamanho(tamanhos.length > 0 ? mapa : { "único": [] });
    setTamanhoAberto(tamanhos[0] ?? "único");
    setTamanhosEscritos((tamanhos.length > 0 ? tamanhos : ["único"]).join(" "));
    setPedacos(String((mapa[tamanhos[0] ?? ""] || []).length || 1));
  }, [molde]);

  // O corpo não rola atrás do modal. Sai na desmontagem, e não num "fechar":
  // assim sai também quando a tela inteira é trocada com o modal aberto.
  useEffect(() => {
    document.body.classList.add("modal-aberto");
    return () => document.body.classList.remove("modal-aberto");
  }, []);

  useEffect(() => {
    const noEsc = (evento: KeyboardEvent) => { if (evento.key === "Escape") aoFechar(); };
    window.addEventListener("keydown", noEsc);
    return () => window.removeEventListener("keydown", noEsc);
  }, [aoFechar]);

  const tamanhos = Object.keys(porTamanho);
  const partes = porTamanho[tamanhoAberto] ?? [];

  const tituloDoTipo = () => {
    if (!tipo) return "peça";
    if (tipo.id === "outro") return comoNaFrase(tipoOutro) || "peça";
    return tipo.nome.toLowerCase();
  };

  /** Mexe só nas partes do tamanho aberto. */
  const mexerNasPartes = (mudar: (partes: ParteEmEdicao[]) => ParteEmEdicao[]) =>
    setPorTamanho((mapa) => ({ ...mapa, [tamanhoAberto]: mudar(mapa[tamanhoAberto] ?? []) }));

  // ==================== AS ABAS ====================

  /**
   * As partes de um tamanho novo nascem iguais às do primeiro tamanho — mesmos
   * papéis e mesmas quantidades, só sem arquivo. É quase sempre o que se quer:
   * a camiseta G tem as mesmas cinco peças da M.
   */
  const partesNovasDoModelo = (mapa: PorTamanho, quantos: number): ParteEmEdicao[] => {
    const primeiro = mapa[Object.keys(mapa)[0] ?? ""];
    if (primeiro && primeiro.length > 0) {
      return primeiro.map((p) => ({ ...parteVazia(p.papel), papelEscrito: p.papelEscrito, quantidade: p.quantidade }));
    }
    const sugeridas: readonly string[] = tipo?.partes ?? [];
    return Array.from({ length: Math.max(1, quantos) }, (_, i) => parteVazia(sugeridas[i] || "outro"));
  };

  const acrescentarTamanho = () => {
    const novo = tamanhoNovo.trim();
    if (!novo) return setErro("Escreva o nome do tamanho para acrescentar.");
    if (tamanhos.some((t) => t.toLowerCase() === novo.toLowerCase())) {
      return setErro(`O tamanho "${novo}" já está aí.`);
    }
    setErro("");
    setPorTamanho((mapa) => ({ ...mapa, [novo]: partesNovasDoModelo(mapa, Number(pedacos) || 1) }));
    setTamanhosEscritos([...tamanhos, novo].join(" "));
    setTamanhoNovo("");
    setTamanhoAberto(novo);
  };

  const tirarTamanho = async (tamanho: string) => {
    const comArquivo = (porTamanho[tamanho] ?? []).filter((p) => p.contorno).length;
    if (comArquivo > 0) {
      const certeza = await dialogo.confirmar(
        `O tamanho "${tamanho}" será removido junto com ${comArquivo} peça(s) já enviada(s).`,
        { titulo: "Remover tamanho", confirmar: "Remover" },
      );
      if (!certeza) return;
    }
    setPorTamanho((mapa) => {
      const sobrou = { ...mapa };
      delete sobrou[tamanho];
      const nomes = Object.keys(sobrou);
      setTamanhosEscritos(nomes.join(" "));
      if (tamanhoAberto === tamanho) setTamanhoAberto(nomes[0] ?? "único");
      return sobrou;
    });
  };

  // ==================== LER O ARQUIVO DE UMA PARTE ====================

  /** Guarda o desenho lido dentro da parte, sem apagar o que a pessoa escreveu. */
  const comDesenho = (
    parte: ParteEmEdicao,
    desenho: { nome: string; largura: number; altura: number; contorno: { x: number; y: number }[]; furos?: { x: number; y: number }[][] },
    formato: string,
    unidadeLida: string,
    jaEscolhido: boolean,
  ): ParteEmEdicao => {
    const doNome = lerQuantidadeDoNome(desenho.nome);
    const palpite = jaEscolhido ? null : adivinharPapel(desenho.nome);
    return {
      ...parte,
      nome: doNome.nome,
      largura: Math.round(desenho.largura * 10) / 10,
      altura: Math.round(desenho.altura * 10) / 10,
      contorno: desenho.contorno,
      furos: desenho.furos || [],
      origem: `${formato} · ${unidadeLida}`,
      quantidade: doNome.qtd > 1 ? doNome.qtd : parte.quantidade,
      // Só palpita no papel se a pessoa ainda não tinha dito o que era.
      papel: palpite && palpite !== "outro" ? palpite : parte.papel,
    };
  };

  /**
   * Um arquivo pode trazer só aquela parte — o normal aqui — ou o marcador
   * inteiro. Se vier mais de uma peça fechada, as sobrantes caem nos espaços
   * seguintes que ainda estão vazios, e o que faltar de espaço é criado.
   */
  const mandarArquivoParaParte = async (parteId: number, arquivo: File) => {
    setErro("");
    if (!ehArquivoDeMolde(arquivo)) {
      return setErro(`"${arquivo.name}": só leio molde em ${FORMATOS_DE_MOLDE}.`);
    }

    /*
     * `lerMoldeVetorial` é JavaScript sem tipos (é motor portado, ver a regra
     * em ARQUITETURA.md), e o que ele devolve muda de forma conforme deu certo
     * ou não. O tipo aqui é a leitura declarada UMA vez, na porta de entrada,
     * em vez de espalhar `any` por dentro da função.
     */
    let lido: {
      erro?: string;
      formato: string;
      /* Só vêm quando a leitura deu certo — daí os opcionais. */
      unidade?: string;
      avisos?: string[];
      moldes?: DesenhoLido[];
    };
    try {
      lido = await lerMoldeVetorial(arquivo, unidade || null, modoVetor || "marcador");
    } catch (e) {
      return setErro(`"${arquivo.name}": ${e instanceof Error ? e.message : String(e)}`);
    }
    if (lido.erro) return setErro(`"${arquivo.name}": ${lido.erro}`);
    if (!lido.moldes || lido.moldes.length === 0) {
      return setErro(`"${arquivo.name}": não achei nenhuma peça fechada aí dentro.`);
    }

    let recado = "";
    mexerNasPartes((atuais) => {
      const lista = atuais.slice();
      const indice = lista.findIndex((p) => p.id === parteId);
      if (indice < 0) return atuais;

      // Um arquivo com várias peças é o marcador inteiro, não "o arquivo desta
      // parte": aí quem manda são os nomes que vieram no desenho, inclusive
      // nesta primeira vaga. Com uma peça só, o que a pessoa escolheu vale.
      const jaEscolhido = lido.moldes!.length === 1
        && (lista[indice]!.papel !== "outro" || lista[indice]!.papelEscrito.trim() !== "");
      lista[indice] = comDesenho(lista[indice]!, lido.moldes![0]!, lido.formato, lido.unidade ?? "", jaEscolhido);

      let daqui = indice + 1;
      for (const sobrando of lido.moldes!.slice(1)) {
        while (daqui < lista.length && lista[daqui]!.contorno) daqui++;
        if (daqui >= lista.length) lista.push(parteVazia("outro"));
        lista[daqui] = comDesenho(lista[daqui]!, sobrando, lido.formato, lido.unidade ?? "", false);
        daqui++;
      }

      if (lido.moldes!.length > 1) {
        recado = `"${arquivo.name}" trouxe ${lido.moldes!.length} peças; `
          + "usei todas e completei os espaços. Confira o que é cada uma.";
        setPedacos(String(lista.length));
      }
      return lista;
    });

    const avisos = lido.avisos || [];
    if (avisos.length > 0) setErro(`"${arquivo.name}": ${avisos.join(" ")}`);
    else if (recado) setErro(recado);
  };

  // ==================== ANDAR E GRAVAR ====================

  const avancar = async () => {
    if (passo === 1) {
      if (!tipo) return setErro("Escolha primeiro o que você vai criar.");
      if (tipo.id === "outro" && !tipoOutro.trim()) {
        return setErro("Escreva o que é, para eu saber como chamar.");
      }
      if (!nome.trim()) setNome(tipoOutro.trim() || tipo.nome);
      setErro("");
      return setPasso(2);
    }

    if (passo === 2) {
      if (!nome.trim()) return setErro("Dê um nome ao molde.");
      const quantos = Math.max(1, Math.min(60, Math.floor(Number(pedacos) || 0)));
      setPedacos(String(quantos));
      const lista = lerTamanhos(tamanhosEscritos);
      setTamanhosEscritos(lista.join(" "));
      setPorTamanho((mapa) => prepararTamanhos(mapa, lista, quantos));
      setTamanhoAberto((atual) => (lista.includes(atual) ? atual : lista[0]!));
      setErro("");
      return setPasso(3);
    }

    await salvar();
  };

  /** Monta as abas a partir dos tamanhos escritos no passo 2. */
  const prepararTamanhos = (mapa: PorTamanho, lista: string[], quantos: number): PorTamanho => {
    const novo: PorTamanho = {};
    // Primeiro os que já existiam, para o modelo sair do que já foi preenchido.
    for (const t of lista) if (mapa[t]) novo[t] = mapa[t]!;
    for (const t of lista) if (!novo[t]) novo[t] = partesNovasDoModelo(novo, quantos);

    const aberto = lista.includes(tamanhoAberto) ? tamanhoAberto : lista[0]!;
    novo[aberto] = ajustarQuantidade(novo[aberto] ?? [], quantos);
    return novo;
  };

  /** Cresce ou encolhe a lista de partes, aproveitando o que já foi preenchido. */
  const ajustarQuantidade = (atuais: ParteEmEdicao[], quantos: number): ParteEmEdicao[] => {
    const sugeridas: readonly string[] = tipo?.partes ?? [];
    let lista = atuais.slice();
    while (lista.length < quantos) lista.push(parteVazia(sugeridas[lista.length] || "outro"));
    // Ao encolher, some primeiro com os espaços que ainda estão vazios.
    while (lista.length > quantos) {
      const vazia = [...lista].reverse().find((p) => !p.contorno);
      if (!vazia) { lista = lista.slice(0, quantos); break; }
      lista = lista.filter((p) => p !== vazia);
    }
    return lista;
  };

  const salvar = async () => {
    setErro("");
    if (!nome.trim()) { setPasso(2); return setErro("Dê um nome ao molde antes de salvar."); }

    // O molde é salvo com todos os tamanhos de uma vez: o que está aberto na
    // aba e os que ficaram nas outras.
    const todas: (ParteEmEdicao & { tamanho: string })[] = [];
    let faltando = 0;
    const semArquivo: string[] = [];
    for (const tamanho of tamanhos) {
      const lista = porTamanho[tamanho] ?? [];
      const prontas = lista.filter((p) => p.contorno);
      if (prontas.length < lista.length) {
        faltando += lista.length - prontas.length;
        if (prontas.length === 0) semArquivo.push(tamanho);
      }
      for (const p of prontas) todas.push({ ...p, tamanho });
    }

    if (todas.length === 0) return setErro("Nenhuma parte tem arquivo ainda. Mande pelo menos um.");

    const corpo: MoldeParaGravar = {
      nome: nome.trim(),
      observacoes,
      pecas: todas.map((p, ordem) => ({
        tamanho: p.tamanho,
        papel: nomeDaParte(p),
        nome: nomeDaParte(p) === "outro" ? (p.nome || "peça") : nomeDaParte(p),
        quantidade: p.quantidade,
        largura: p.largura,
        altura: p.altura,
        contorno: p.contorno!,
        furos: p.furos,
        origem: p.origem,
        ordem,
      })),
    };

    setSalvando(true);
    try {
      if (molde) await moldesApi.regravar(molde.id, corpo);
      else await moldesApi.criar(corpo);

      const quantosTamanhos = new Set(todas.map((p) => p.tamanho)).size;
      aoSalvar(faltando === 0 ? "" :
        `Molde salvo com ${todas.length} peça(s) em ${quantosTamanhos} tamanho(s). `
        + `${faltando} espaço(s) ficaram sem arquivo e não entraram`
        + (semArquivo.length > 0 ? ` — ${semArquivo.join(", ")} ficou de fora inteiro.` : "."));
    } catch (e) {
      setErro(`Não deu para salvar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSalvando(false);
    }
  };

  const faltandoArquivo = tamanhos.filter((t) => (porTamanho[t] ?? []).some((p) => !p.contorno));

  return (
    <div
      className="modal-fundo"
      onClick={(evento) => { if (evento.target === evento.currentTarget) aoFechar(); }}
    >
      <div className="modal">
        <header className="modal-topo">
          <h3>{molde ? `Editando: ${molde.nome}` : "Novo molde"}</h3>
          <button type="button" className="btn-x" title="Fechar" onClick={aoFechar}>×</button>
        </header>

        <div className="modal-corpo">
          {passo === 1 && (
            <section className="modal-passo">
              <p className="passo-pergunta">O que você vai criar?</p>
              <div className="escolhas">
                {TIPOS_DE_MOLDE.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`escolha${tipo?.id === item.id ? " escolhida" : ""}`}
                    onClick={() => {
                      setTipo(item);
                      // O número de pedaços acompanha o tipo escolhido.
                      setPedacos(String(item.partes.length));
                      setErro("");
                    }}
                  >
                    <span className="escolha-risco">{item.risco}</span>
                    <span className="escolha-nome">{item.nome}</span>
                  </button>
                ))}
              </div>

              {tipo?.id === "outro" && (
                <label>
                  Então é o quê?
                  <input
                    type="text"
                    autoFocus
                    placeholder="Ex: avental, boné, almofada, toalha"
                    value={tipoOutro}
                    onChange={(e) => setTipoOutro(e.target.value)}
                  />
                </label>
              )}
            </section>
          )}

          {passo === 2 && (
            <section className="modal-passo">
              <p className="passo-pergunta">Quantos pedaços tem {umArtigo(tituloDoTipo())}?</p>

              <div className="row">
                <label style={{ flex: "0 0 130px" }}>
                  Pedaços
                  <input type="number" min="1" max="60" step="1"
                    value={pedacos} onChange={(e) => setPedacos(e.target.value)} />
                </label>

                <label style={{ flex: "1 1 220px" }}>
                  Nome do molde
                  <input type="text" placeholder="Ex: Camiseta básica gola careca"
                    value={nome} onChange={(e) => setNome(e.target.value)} />
                </label>

                <label style={{ flex: "1 1 200px" }}>
                  Tamanhos
                  <input type="text" placeholder="Ex: P M G GG"
                    value={tamanhosEscritos} onChange={(e) => setTamanhosEscritos(e.target.value)} />
                </label>

                <label style={{ flex: "0 0 210px" }}>
                  Como ler o arquivo
                  <select value={modoVetor} onChange={(e) => setModoVetor(e.target.value)}>
                    <option value="marcador">Marcador: cada peça separada</option>
                    <option value="inteiro">Arte: o arquivo inteiro é uma peça</option>
                  </select>
                </label>

                <label style={{ flex: "0 0 180px" }}>
                  Unidade do arquivo
                  <select value={unidade} onChange={(e) => setUnidade(e.target.value)}>
                    <option value="">Automático</option>
                    <option value="mm">Milímetro</option>
                    <option value="cm">Centímetro</option>
                    <option value="polegada">Polegada</option>
                    <option value="m">Metro</option>
                    <option value="unidade de plotter">Unidade de plotter (PLT)</option>
                  </select>
                </label>
              </div>

              <label>
                Observações (opcional)
                <textarea rows={2} placeholder="Tecido indicado, detalhes de costura, o que for útil lembrar"
                  value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
              </label>

              <p className="hint">
                Conte os pedaços diferentes. Manga direita e esquerda contam como dois; se a mesma
                peça é cortada duas vezes, conte uma só e escreva a quantidade lá na frente.
              </p>
              <p className="hint">
                Nos <strong>tamanhos</strong>, escreva todos que este molde vai ter, separados por
                espaço ou vírgula ("P M G GG"). Cada um ganha a sua aba no passo seguinte, para você
                mandar o arquivo tamanho por tamanho — e dá para acrescentar mais tamanhos lá.
              </p>
            </section>
          )}

          {passo === 3 && (
            <section className="modal-passo">
              <p className="passo-pergunta">
                Diga o que é cada parte {deArtigo(tituloDoTipo())} e mande o arquivo, tamanho por tamanho.
              </p>

              <div className="abas-tamanho">
                <div className="abas">
                  {tamanhos.map((tamanho) => {
                    const lista = porTamanho[tamanho] ?? [];
                    const prontas = lista.filter((p) => p.contorno).length;
                    const completa = prontas === lista.length && lista.length > 0;
                    return (
                      <button
                        key={tamanho}
                        type="button"
                        className={`aba${tamanho === tamanhoAberto ? " aberta" : ""}${completa ? " completa" : ""}`}
                        onClick={() => setTamanhoAberto(tamanho)}
                      >
                        <span className="aba-nome">{tamanho}</span>
                        <span className="aba-conta">{prontas}/{lista.length}</span>
                        {tamanhos.length > 1 && (
                          <span
                            className="aba-x"
                            title="Tirar este tamanho"
                            onClick={(evento) => { evento.stopPropagation(); void tirarTamanho(tamanho); }}
                          >
                            ×
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <span className="aba-nova">
                  <input
                    type="text" placeholder="outro tamanho" size={10}
                    value={tamanhoNovo}
                    onChange={(e) => setTamanhoNovo(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); acrescentarTamanho(); } }}
                  />
                  <button type="button" className="btn secondary btn-sm" onClick={acrescentarTamanho}>
                    + tamanho
                  </button>
                </span>
              </div>

              <p className="hint">
                {faltandoArquivo.length === 0
                  ? "Todos os tamanhos estão com os arquivos completos."
                  : `Ainda falta arquivo em: ${faltandoArquivo.join(", ")}.`}
              </p>

              <div>
                <p className="hint partes-de-que-tamanho">
                  Peças do tamanho <strong>{tamanhoAberto}</strong>
                  {tamanhos.length > 1 && " — os outros tamanhos ficam nas abas aí em cima, cada um com o arquivo dele."}
                </p>

                {partes.map((parte, i) => (
                  <LinhaDaParte
                    key={parte.id}
                    parte={parte}
                    numero={i + 1}
                    cor={corDaPeca(i)}
                    aoMexer={(mudanca) => mexerNasPartes((atuais) =>
                      atuais.map((p) => (p.id === parte.id ? { ...p, ...mudanca } : p)))}
                    aoTirar={() => {
                      mexerNasPartes((atuais) => {
                        const lista = atuais.filter((p) => p.id !== parte.id);
                        setPedacos(String(lista.length || 1));
                        return lista;
                      });
                    }}
                    aoMandarArquivo={(arquivo) => void mandarArquivoParaParte(parte.id, arquivo)}
                  />
                ))}
              </div>

              <button
                type="button"
                className="btn secondary btn-sm"
                onClick={() => mexerNasPartes((atuais) => {
                  const lista = [...atuais, parteVazia("outro")];
                  setPedacos(String(lista.length));
                  return lista;
                })}
              >
                + mais uma parte
              </button>
            </section>
          )}

          {erro && <p className="hint error">{erro}</p>}
        </div>

        <footer className="modal-rodape">
          {passo > 1 && (
            <button type="button" className="btn secondary" onClick={() => { setErro(""); setPasso(passo - 1); }}>
              Voltar
            </button>
          )}
          <span className="passo-conta hint">Passo {passo} de 3</span>
          <button type="button" className="btn primary" disabled={salvando} onClick={() => void avancar()}>
            {passo === 3 ? "Salvar molde" : "Continuar"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Um espaço do passo 3: o que é a parte, quantas são, e o arquivo dela. */
function LinhaDaParte({ parte, numero, cor, aoMexer, aoTirar, aoMandarArquivo }: {
  parte: ParteEmEdicao;
  numero: number;
  cor: string;
  aoMexer: (mudanca: Partial<ParteEmEdicao>) => void;
  aoTirar: () => void;
  aoMandarArquivo: (arquivo: File) => void;
}) {
  /*
   * A miniatura do contorno, para dar para reconhecer a peça de relance.
   *
   * Desenhada num `useMemo`? Não: `moldeParaImagem` devolve uma `<img>` nova a
   * cada chamada, e o contorno só muda quando um arquivo novo chega. Guardar o
   * `src` num ref amarrado ao contorno é o mesmo trabalho com mais peças; o
   * custo real é o desenho, e ele acontece uma vez por render de uma lista que
   * tem poucas linhas.
   */
  const miniatura = parte.contorno
    ? moldeParaImagem(
        { contorno: parte.contorno, furos: parte.furos, largura: parte.largura, altura: parte.altura },
        cor,
      ).src
    : null;

  return (
    <div className={`parte-molde${parte.contorno ? " parte-pronta" : ""}`}>
      <span className="peca-thumb" style={{ borderColor: cor }}>
        {miniatura ? <img src={miniatura} alt="" /> : <span className="peca-vazia">{numero}</span>}
      </span>

      <div className="parte-campos">
        <label>
          O que é esta parte
          <select value={parte.papel} onChange={(e) => aoMexer({ papel: e.target.value })}>
            {PAPEIS_DE_PECA.map((papel) => <option key={papel} value={papel}>{papel}</option>)}
          </select>
        </label>

        {parte.papel === "outro" && (
          <label style={{ flex: "1 1 150px" }}>
            Escreva o que é
            <input
              type="text" placeholder="Ex: bolso de trás"
              value={parte.papelEscrito}
              onChange={(e) => aoMexer({ papelEscrito: e.target.value })}
            />
          </label>
        )}

        <label style={{ flex: "0 0 90px" }}>
          Quantas
          <input
            type="number" min="1" step="1"
            value={parte.quantidade}
            onChange={(e) => aoMexer({ quantidade: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
          />
        </label>
      </div>

      <div className="parte-arquivo">
        <label className="btn secondary btn-sm file-label">
          {parte.contorno ? "Trocar arquivo" : "Enviar arquivo"}
          <input
            type="file" accept=".dxf,.plt,.hpgl,.svg,.pdf" className="hidden"
            onChange={(evento) => {
              const arquivo = (evento.target.files || [])[0];
              evento.target.value = "";
              if (arquivo) aoMandarArquivo(arquivo);
            }}
          />
        </label>
        <span className="hint">
          {parte.contorno
            ? `${parte.largura} × ${parte.altura} cm · ${parte.origem}`
            : `falta o arquivo (${FORMATOS_DE_MOLDE})`}
        </span>
      </div>

      <button type="button" className="btn danger btn-sm" title="Tirar esta parte" onClick={aoTirar}>×</button>
    </div>
  );
}
