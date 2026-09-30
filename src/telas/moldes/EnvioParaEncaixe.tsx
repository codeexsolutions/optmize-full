/**
 * ===========================================================================
 * ARTE, PRÉVIA E ENCAIXE — o painel que veste o molde e o manda para o tecido
 * ===========================================================================
 *
 * A arte fica guardada pelo PAPEL da peça — frente, costas, manga direita… —
 * e não pela peça de um tamanho. É isso que faz a mesma arte servir para P, M
 * e G: ao trocar o tamanho, o contorno muda e a arte se ajusta ao contorno
 * novo sem ninguém precisar mandar tudo de novo.
 *
 * Um jogo dessas artes é uma **estampa**, e ela é guardada junto com o molde.
 * Assim a mesma camiseta tem a estampa da caveira, a da flor e a lisa, e dá
 * para mandar mais de uma no mesmo encaixe, cada uma com a sua quantidade.
 *
 * ---------------------------------------------------------------------------
 * O QUE É DESENHADO QUANDO
 * ---------------------------------------------------------------------------
 *
 * A prévia de cada peça é pequena de propósito (260 px): ela serve para
 * conferir o ajuste, não para imprimir, e é redesenhada a cada tecla no campo
 * de tamanho ou de deslocamento.
 *
 * A arte GRANDE — a que vai para o tecido, no dpi escolhido — só é desenhada
 * no clique de "Mandar para o encaixe". Desenhá-la a cada ajuste custaria
 * segundos por peça para mostrar a mesma coisa que a prévia já mostra.
 */

import { useEffect, useMemo, useState } from "react";
import { useDialogo } from "../../casca/Dialogo";
import { moldesApi, type AjusteDaArte, type Estampa, type Molde, type PecaDoMolde } from "../../api/moldes";
import { pecasParaOEncaixe } from "../../motores/montagem";
import {
  AJUSTE_PADRAO, MODOS_DE_ARTE, TIPOS_DE_ARTE, ajusteNovo, desenharArteNoMolde, ppcmDaArte, tamanhoDoRapport,
} from "../../motores/arteMolde";
import { pixelsPorCmDoArquivo } from "../../motores/medidaDoArquivo";
import { carregarImagem, lerComoDataURL } from "../../utils/arquivoDeImagem";
import { formatarNumero } from "../../utils/numero";
import { useLigacao } from "../../producao/ligacao";
import { emCm } from "./vocabulario";
import { GradeDeQuantidades, type LinhaDaGrade } from "./GradeDeQuantidades";
import {
  LINHA_NOVA, LINHA_SEM_ESTAMPA, celulasParaMandar, colunasDaGrade, depoisDaFalha, levarLinha,
  linhaDaEstampa, mexer, mudarQuantidade, resumo, tirarLinha,
  type CelulaParaMandar, type Mexidas, type Quantidades,
} from "./envioPorTamanho";
import { useErroEmAlerta } from "../../casca/Alerta";

/** A prévia é pequena de propósito: serve para conferir, não para imprimir. */
const LADO_DA_PREVIA = 260;

/** Uma arte na mão: a imagem carregada, o ajuste, e de onde ela veio. */
interface ArteNaMao {
  nome: string;
  img: HTMLImageElement;
  ajuste: AjusteDaArte;
  /** O arquivo escolhido no disco, enquanto ainda não subiu. */
  file?: File;
  /** O nome no servidor, depois de subir (ou vindo de uma estampa guardada). */
  arquivo?: string;
}

/** papel -> a arte daquela parte. */
type ArtesPorPapel = Record<string, ArteNaMao>;

const ehArquivoDeArte = (file: File) =>
  /^image\//.test(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name);

interface Props {
  molde: Molde;
  aoFechar: () => void;
  /** Recarrega o molde do servidor depois de mexer nas estampas. */
  aoRecarregar: (molde: Molde) => void;
}

export function EnvioParaEncaixe({ molde, aoFechar, aoRecarregar }: Props) {
  const dialogo = useDialogo();
  const ligacao = useLigacao();

  // A grade: uma coluna por tamanho, uma linha por estampa (ver `envioPorTamanho.ts`).
  const colunas = useMemo(() => colunasDaGrade(molde), [molde]);
  const [quantidades, setQuantidades] = useState<Quantidades>({});
  const [mexidas, setMexidas] = useState<Mexidas>({});
  const [aberta, setAberta] = useState<string | null>(null);
  // A prévia da arte num tamanho só: a arte é por papel e serve a todos. Não tem nada a ver com o que vai.
  const comDesenho = colunas.filter((c) => !c.semDesenho).map((c) => c.nome);
  const baseDaGrade = molde.tamanhos.find((t) => t.base)?.nome;
  const [tamanhoDaPrevia, setTamanhoDaPrevia] = useState(
    baseDaGrade && comDesenho.includes(baseDaGrade) ? baseDaGrade : (comDesenho[0] ?? ""),
  );
  const [dpi, setDpi] = useState("150");

  const [artes, setArtes] = useState<ArtesPorPapel>({});
  const [nomeDaEstampa, setNomeDaEstampa] = useState("");
  const [emEdicao, setEmEdicao] = useState<number | null>(null);

  const setErro = useErroEmAlerta("Não deu certo no envio");
  const [ocupado, setOcupado] = useState("");

  useEffect(() => {
    document.body.classList.add("modal-aberto");
    return () => document.body.classList.remove("modal-aberto");
  }, []);

  useEffect(() => {
    const noEsc = (evento: KeyboardEvent) => { if (evento.key === "Escape") aoFechar(); };
    window.addEventListener("keydown", noEsc);
    return () => window.removeEventListener("keydown", noEsc);
  }, [aoFechar]);

  const estampas = molde.artes || [];
  // A estampa nova só é linha enquanto tem arte no painel e ainda não foi salva no molde.
  const temEstampaNova = emEdicao === null && Object.keys(artes).length > 0;
  const linhas: LinhaDaGrade[] = [
    ...estampas.map((e) => ({ chave: linhaDaEstampa(e.id), nome: e.nome })),
    ...(temEstampaNova ? [{ chave: LINHA_NOVA, nome: nomeDaEstampa.trim() || "estampa nova" }] : []),
    { chave: LINHA_SEM_ESTAMPA, nome: "sem estampa" },
  ];
  const nomeDaLinha = (linha: string) => linhas.find((l) => l.chave === linha)?.nome ?? "";
  /** A linha usa as artes do painel: a estampa nova, e a guardada que está aberta para edição. */
  const usaOPainel = (linha: string) => linha === LINHA_NOVA || (emEdicao !== null && linha === linhaDaEstampa(emEdicao));
  const temArte = (linha: string, papel: string) => {
    if (linha === LINHA_SEM_ESTAMPA) return false;
    if (usaOPainel(linha)) return !!artes[papel];
    return !!estampas.find((e) => linhaDaEstampa(e.id) === linha)?.pecas.some((x) => x.papel === papel);
  };
  const celulas = celulasParaMandar(linhas.map((l) => l.chave), colunas, molde.pecas, quantidades, mexidas);
  const rotulo = (c: { linha: string; tamanho: string }) => `${nomeDaLinha(c.linha)} · ${c.tamanho}`;
  /** Outra estampa no painel: os números da "estampa nova" não ficam pendurados para reaparecer nela. */
  const esquecerANova = () => {
    const r = tirarLinha(quantidades, mexidas, LINHA_NOVA);
    setQuantidades(r.quantidades);
    setMexidas(r.mexidas);
    setAberta(null);
  };
  // A peça marcada "espelhar" na Montagem vira duas — uma do avesso. Ver
  // `pecasParaOEncaixe`: o espelho é no contorno, então a arte entra nele
  // como em qualquer outro.
  const pecas = useMemo(
    () => pecasParaOEncaixe(molde.pecas.filter((p) => p.tamanho === tamanhoDaPrevia)) as PecaDoMolde[],
    [molde, tamanhoDaPrevia],
  );

  // ==================== AS ESTAMPAS GUARDADAS ====================

  /** Traz a estampa guardada para o painel de baixo, imagem e ajuste. */
  const abrirEstampa = async (estampa: Estampa) => {
    setOcupado(`Abrindo "${estampa.nome}"…`);
    try {
      const carregadas: ArtesPorPapel = {};
      for (const peca of estampa.pecas) {
        carregadas[peca.papel] = {
          nome: peca.nomeOriginal || peca.arquivo,
          img: await carregarImagem(peca.url),
          ajuste: { ...AJUSTE_PADRAO, ...peca.ajuste },
          arquivo: peca.arquivo,
        };
      }
      esquecerANova();
      setArtes(carregadas);
      setEmEdicao(estampa.id);
      setNomeDaEstampa(estampa.nome);
      setErro("");
    } catch (e) {
      setErro(`Não consegui abrir a estampa: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOcupado("");
    }
  };

  const excluirEstampa = async (estampa: Estampa) => {
    const certeza = await dialogo.confirmar(
      `A estampa "${estampa.nome}" será excluída deste molde.`,
      { titulo: "Excluir estampa", confirmar: "Excluir estampa" },
    );
    if (!certeza) return;
    try {
      await moldesApi.apagarEstampa(molde.id, estampa.id);
      if (emEdicao === estampa.id) setEmEdicao(null);
      aoRecarregar(await moldesApi.abrir(molde.id));
    } catch {
      setErro("Não deu para excluir essa estampa.");
    }
  };

  const salvarEstampa = async () => {
    setErro("");
    const nome = nomeDaEstampa.trim();
    if (!nome) return setErro("Dê um nome à estampa antes de salvar.");
    const papeis = Object.keys(artes);
    if (papeis.length === 0) return setErro("Mande a arte de pelo menos uma parte.");

    try {
      // Cada arte nova sobe uma vez; a que veio de uma estampa guardada já tem
      // arquivo no servidor e é só reaproveitada.
      const subidas: ArtesPorPapel = { ...artes };
      let subiu = 0;
      for (const papel of papeis) {
        const arte = subidas[papel]!;
        if (arte.arquivo || !arte.file) continue;
        subiu++;
        setOcupado(`Subindo arte (${subiu})…`);
        const { arquivo } = await moldesApi.mandarArte(molde.id, papel, arte.file);
        subidas[papel] = { ...arte, arquivo };
      }
      setArtes(subidas);

      setOcupado("Salvando…");
      const { id } = await moldesApi.guardarEstampa(molde.id, {
        id: emEdicao,
        nome,
        pecas: papeis.map((papel) => ({
          papel,
          arquivo: subidas[papel]!.arquivo!,
          nomeOriginal: subidas[papel]!.nome,
          ajuste: subidas[papel]!.ajuste,
        })),
      });

      // A estampa nova virou guardada: os números dela vão junto para a linha nova.
      if (emEdicao === null) {
        const r = levarLinha(quantidades, mexidas, LINHA_NOVA, linhaDaEstampa(id));
        setQuantidades(r.quantidades);
        setMexidas(r.mexidas);
        setAberta(null);
      }
      // Recarrega o molde para a lista vir do servidor, já com a estampa nova.
      aoRecarregar(await moldesApi.abrir(molde.id));
      setEmEdicao(id);
    } catch (e) {
      setErro(`Não deu para salvar a estampa: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setOcupado("");
    }
  };

  // ==================== A ARTE DE UMA PARTE ====================

  const mandarArteParaPapel = async (papel: string, file: File) => {
    setErro("");
    if (!ehArquivoDeArte(file)) {
      return setErro(`"${file.name}": a arte precisa ser uma imagem (PNG, JPG ou WEBP).`);
    }
    try {
      // O dpi gravado no arquivo é o que diz o tamanho de verdade da imagem, e
      // sem ele não existe rapport: um azulejo de 3000 px pode ser 25 cm ou 1 m.
      const ppcmArquivo = pixelsPorCmDoArquivo(new Uint8Array(await file.arrayBuffer()));
      const img = await carregarImagem(await lerComoDataURL(file));
      // Guarda o arquivo original: é ele que sobe para o servidor quando a
      // estampa for salva, sem passar por conversão nenhuma no meio.
      setArtes((atuais) => ({
        ...atuais,
        [papel]: { nome: file.name, img, file, ajuste: { ...ajusteNovo(), ppcmArquivo: ppcmArquivo || null } },
      }));
    } catch (e) {
      // A mensagem amigável não pode ser o único destino do erro, senão bug de
      // código vira "imagem ruim".
      console.error("mandarArteParaPapel:", e);
      setErro(`"${file.name}": não consegui abrir essa imagem.`);
    }
  };

  const mexerNoAjuste = (papel: string, mudanca: Partial<AjusteDaArte>) =>
    setArtes((atuais) => {
      const arte = atuais[papel];
      if (!arte) return atuais;
      return { ...atuais, [papel]: { ...arte, ajuste: { ...arte.ajuste, ...mudanca } } };
    });

  const tirarArte = (papel: string) =>
    setArtes((atuais) => {
      const sobrou = { ...atuais };
      delete sobrou[papel];
      return sobrou;
    });

  // ==================== O QUE VAI PARA O ENCAIXE ====================

  const total = resumo(celulas);
  const textoDoResumo = comDesenho.length === 0
    ? "Este molde não tem peça nenhuma."
    : celulas.length === 0
      ? "Nenhuma quantidade pedida ainda."
      : `${total.prontas} peça(s) pronta(s) → ${total.pecas} peça(s) para encaixar, em ${celulas.length} envio(s).`;

  /** Quanto a arte vai pesar de verdade, no dpi escolhido, somando todas as células que vão. Conta de soma: sem memo. */
  const qualidade = (() => {
    const alvo = Number(dpi) || 150;
    let pontos = 0;
    let ppcmMenor = Infinity;
    let comArte = 0;
    for (const celula of celulas) {
      for (const peca of celula.pecas) {
        if (!temArte(celula.linha, peca.papel)) continue;
        comArte++;
        const ppcm = ppcmDaArte(peca.largura, peca.altura, alvo);
        ppcmMenor = Math.min(ppcmMenor, ppcm);
        pontos += peca.largura * ppcm * peca.altura * ppcm;
      }
    }
    if (comArte === 0) return "";
    const dpiReal = Math.round(ppcmMenor * 2.54);
    return `${comArte} peça(s) com arte a ${dpiReal} dpi (${formatarNumero(pontos / 1e6, 0)} milhões de pontos)`
      + (dpiReal < alvo - 1 ? " — abaixei o dpi para caber na memória." : "");
  })();

  /** As artes de uma linha. A estampa guardada só carrega as imagens aqui, uma vez para todos os tamanhos. */
  const artesDaLinha = async (linha: string, guardadas: Map<string, ArtesPorPapel>): Promise<ArtesPorPapel> => {
    if (linha === LINHA_SEM_ESTAMPA) return {};
    if (usaOPainel(linha)) return artes;
    const ja = guardadas.get(linha);
    if (ja) return ja;
    const carregadas: ArtesPorPapel = {};
    for (const peca of estampas.find((e) => linhaDaEstampa(e.id) === linha)?.pecas ?? []) {
      carregadas[peca.papel] = {
        nome: peca.nomeOriginal || peca.arquivo,
        img: await carregarImagem(peca.url),
        ajuste: { ...AJUSTE_PADRAO, ...peca.ajuste },
      };
    }
    guardadas.set(linha, carregadas);
    return carregadas;
  };

  const mandarParaOEncaixe = async () => {
    setErro("");
    if (!ligacao) return setErro("O editor de produção não está montado.");
    if (celulas.length === 0) {
      const pediu = Object.values(quantidades).some((q) => Object.values(q).some((n) => n > 0));
      return setErro(pediu
        ? "As peças dos tamanhos pedidos estão todas em zero."
        : "Diga quantas peças prontas você quer, em pelo menos um tamanho.");
    }

    const alvo = Number(dpi) || 150;
    const guardadas = new Map<string, ArtesPorPapel>();
    const mandadas: CelulaParaMandar[] = [];
    try {
      // Célula por célula: o Encaixe soma o que chega, então vários tamanhos são vários envios.
      for (const [k, celula] of celulas.entries()) {
        setOcupado(`Montando ${rotulo(celula)} (${k + 1} de ${celulas.length})…`);
        const artesDaCelula = await artesDaLinha(celula.linha, guardadas);
        const estampa = celula.linha === LINHA_SEM_ESTAMPA ? "" : nomeDaLinha(celula.linha);

        // A arte grande só é desenhada agora, na hora de mandar.
        const comArte = celula.pecas.map((peca) => {
          const arte = artesDaCelula[peca.papel];
          if (!arte) return { ...peca, estampa };
          const ppcm = ppcmDaArte(peca.largura, peca.altura, alvo);
          const desenho = desenharArteNoMolde(
            { contorno: peca.contorno, furos: peca.furos || [], largura: peca.largura, altura: peca.altura },
            arte.img, arte.ajuste, ppcm, { margem: 0 });
          return { ...peca, desenho, arte: arte.nome, estampa };
        });

        // `unidades: 1` com a quantidade final em cada peça, e só as > 0: o Encaixe faz
        // `max(1, quantidade × unidades)`, e uma peça em 0 chegaria como 1.
        await ligacao.mandarMoldeParaOEncaixe({ nome: molde.nome, tamanho: celula.tamanho, pecas: comArte, unidades: 1 });
        mandadas.push(celula);
      }

      aoFechar();
      ligacao.irPara("encaixe");
    } catch (e) {
      // O que já chegou fica no Encaixe; as células dele zeram, e o próximo clique manda só o que faltou.
      const faltou = celulas.filter((c) => !mandadas.includes(c));
      setQuantidades((q) => depoisDaFalha(q, mandadas));
      setAberta(null);
      setErro([
        mandadas.length > 0 ? `Foram: ${mandadas.map(rotulo).join(", ")}.` : "",
        `Faltou: ${faltou.map(rotulo).join(", ")} — ${e instanceof Error ? e.message : String(e)}`,
      ].filter(Boolean).join(" "));
    } finally {
      setOcupado("");
    }
  };

  return (
    <div
      className="modal-fundo"
      onClick={(evento) => { if (evento.target === evento.currentTarget) aoFechar(); }}
    >
      <div className="modal modal-largo">
        <header className="modal-topo">
          <h3>Arte e encaixe — {molde.nome}</h3>
          <button type="button" className="btn-x" title="Fechar" onClick={aoFechar}>×</button>
        </header>

        <div className="modal-corpo">
          <p className="hint">
            Mande a arte de cada parte — o retângulo que saiu do seu programa de desenho. O sistema
            coloca a arte dentro do contorno do molde e recorta pela linha da peça. A mesma arte serve
            para todos os tamanhos: o "Ver no tamanho" mostra a prévia em cada um. Parte sem arte vai
            para o encaixe só como contorno.
          </p>

          <div className="row">
            <label style={{ flex: "0 0 150px" }}>
              Qualidade da arte
              <select value={dpi} onChange={(e) => setDpi(e.target.value)}>
                <option value="100">100 dpi</option>
                <option value="150">150 dpi</option>
                <option value="200">200 dpi</option>
                <option value="300">300 dpi</option>
              </select>
            </label>
          </div>

          <section className="estampas-guardadas">
            <div className="estampas-topo">
              <strong>Estampas guardadas neste molde</strong>
              <button
                type="button"
                className="btn secondary btn-sm"
                onClick={() => { esquecerANova(); setArtes({}); setEmEdicao(null); setNomeDaEstampa(""); }}
              >
                Começar outra estampa
              </button>
            </div>

            <div>
              {estampas.length === 0 ? (
                <p className="hint">
                  Nenhuma estampa guardada ainda. Monte a arte aqui embaixo e clique em "Salvar no molde".
                </p>
              ) : estampas.map((estampa) => (
                <div key={estampa.id} className={`estampa${emEdicao === estampa.id ? " em-edicao" : ""}`}>
                  <span className="estampa-nome">{estampa.nome}</span>
                  <span className="hint">{estampa.pecas.map((p) => p.papel).join(", ")}</span>

                  {emEdicao === estampa.id && <span className="etiqueta-tamanho">em edição</span>}

                  <span className="estampa-botoes">
                    <button type="button" className="btn secondary btn-sm" disabled={!!ocupado}
                      onClick={() => void abrirEstampa(estampa)}>
                      Abrir
                    </button>
                    <button type="button" className="btn danger btn-sm"
                      onClick={() => void excluirEstampa(estampa)}>
                      Excluir
                    </button>
                  </span>
                </div>
              ))}
            </div>

            <p className="hint">
              Ponha na grade quantas peças prontas quer de cada estampa em cada tamanho. O que ficar em
              zero não vai para o encaixe. O ▸ de uma célula mostra as peças dela, e dá para mudar a
              quantidade de cada uma só neste envio.
            </p>
          </section>

          <GradeDeQuantidades
            linhas={linhas}
            colunas={colunas}
            pecas={molde.pecas}
            quantidades={quantidades}
            mexidas={mexidas}
            aberta={aberta}
            aoMudarQuantidade={(linha, tamanho, valor) => setQuantidades((q) => mudarQuantidade(q, linha, tamanho, valor))}
            aoMexer={(celula, indice, valor) => setMexidas((m) => mexer(m, celula, indice, valor))}
            aoAbrir={setAberta}
          />

          <div className="estampa-titulo">
            <strong>
              {emEdicao
                ? `Editando a estampa: ${estampas.find((x) => x.id === emEdicao)?.nome ?? nomeDaEstampa}`
                : "Estampa nova"}
            </strong>
            <span className="estampa-salvar">
              <input
                type="text" placeholder="Nome da estampa (ex: caveira)"
                value={nomeDaEstampa} onChange={(e) => setNomeDaEstampa(e.target.value)}
              />
              <button type="button" className="btn secondary btn-sm" disabled={!!ocupado}
                onClick={() => void salvarEstampa()}>
                {ocupado || "Salvar no molde"}
              </button>
            </span>
          </div>

          <label style={{ maxWidth: 200 }}>
            Ver no tamanho
            <select aria-label="Ver no tamanho" value={tamanhoDaPrevia} onChange={(e) => setTamanhoDaPrevia(e.target.value)}>
              {comDesenho.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          <div className="partes-arte">
            {pecas.length === 0
              ? <p className="hint">Esse tamanho não tem peça nenhuma.</p>
              : pecas.map((peca, i) => (
                <ParteComArte
                  // A metade espelhada de `pecasParaOEncaixe` repete o mesmo
                  // `id`/`ordem` da peça original (mesmo papel, só o contorno
                  // vira) — sem o índice aqui as duas cairiam na mesma chave.
                  key={`${peca.tamanho}-${peca.papel}-${peca.id ?? peca.ordem}-${i}`}
                  peca={peca}
                  arte={artes[peca.papel]}
                  aoMandarArte={(arquivo) => void mandarArteParaPapel(peca.papel, arquivo)}
                  aoMexer={(mudanca) => mexerNoAjuste(peca.papel, mudanca)}
                  aoTirar={() => tirarArte(peca.papel)}
                />
              ))}
          </div>

          <p className="hint">{textoDoResumo}</p>
        </div>

        <footer className="modal-rodape">
          <span className="hint">{qualidade}</span>
          <button type="button" className="btn primary" disabled={!!ocupado} onClick={() => void mandarParaOEncaixe()}>
            {ocupado || "Mandar para o encaixe"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Uma peça do tamanho aberto: a prévia, a arte dela e os ajustes. */
function ParteComArte({ peca, arte, aoMandarArte, aoMexer, aoTirar }: {
  peca: PecaDoMolde;
  arte: ArteNaMao | undefined;
  aoMandarArte: (arquivo: File) => void;
  aoMexer: (mudanca: Partial<AjusteDaArte>) => void;
  aoTirar: () => void;
}) {
  const ajuste = arte ? arte.ajuste : AJUSTE_PADRAO;

  /*
   * A prévia. Refeita quando a peça, a imagem ou o ajuste mudam — e só então:
   * é um desenho em canvas, e ele acontece a cada tecla dos campos de tamanho
   * e deslocamento, que é justamente onde o custo apareceria.
   */
  const previa = useMemo(() => {
    const ppcm = LADO_DA_PREVIA / Math.max(peca.largura, peca.altura, 1);
    return desenharArteNoMolde(
      { contorno: peca.contorno, furos: peca.furos || [], largura: peca.largura, altura: peca.altura },
      arte ? arte.img : null,
      arte ? arte.ajuste : null,
      ppcm,
      {
        fundo: arte ? null : "rgba(140, 152, 158, 0.22)",
        linha: "rgba(226, 236, 240, 0.9)",
        linhaGrossura: 1,
      },
    ).src;
  }, [peca, arte, ajuste.tipo, ajuste.modo, ajuste.escala, ajuste.giro, ajuste.x, ajuste.y]);

  const medidaDoRapport = () => {
    const t = tamanhoDoRapport(arte!.img, ajuste);
    return `${emCm(t.largura)} × ${emCm(t.altura)} cm`;
  };

  return (
    <div className={`parte-arte${arte ? " com-arte" : ""}`}>
      <div className="parte-arte-previa">
        <img src={previa} alt={peca.papel} />
      </div>

      <div className="parte-arte-lado">
        {/* O nome, quando há: é ele que separa a peça "outro" das outras e a metade "(espelhada)" da normal. */}
        <span className="peca-nome">{peca.nome || peca.papel}</span>
        <span className="hint">
          {emCm(peca.largura)} × {emCm(peca.altura)} cm · {peca.quantidade} por peça pronta
        </span>

        <label className="btn secondary btn-sm file-label">
          {arte ? "Trocar arte" : "Enviar arte"}
          <input
            type="file" accept="image/*" className="hidden"
            onChange={(evento) => {
              const arquivo = (evento.target.files || [])[0];
              evento.target.value = "";
              if (arquivo) aoMandarArte(arquivo);
            }}
          />
        </label>

        {!arte ? (
          <span className="hint">Sem arte, vai só o contorno da peça.</span>
        ) : (
          <>
            <span className="hint">
              {arte.nome} · {arte.img.width} × {arte.img.height} px
              {ajuste.tipo === "rapport" ? ` · azulejo de ${medidaDoRapport()}` : ""}
            </span>

            <div className="tipo-de-arte">
              {TIPOS_DE_ARTE.map((t: { id: string; nome: string; dica: string }) => (
                <button
                  key={t.id}
                  type="button"
                  className={`btn btn-sm ${t.id === ajuste.tipo ? "" : "secondary"}`}
                  title={t.dica}
                  onClick={() => {
                    if (t.id === ajuste.tipo) return;
                    // Trocar de jeito zera o deslocamento: em arte ele é a
                    // partir do centro da peça, em rapport é onde a repetição
                    // começa. Manter o número velho jogaria a estampa para um
                    // canto sem explicação nenhuma.
                    aoMexer({ tipo: t.id, x: 0, y: 0 });
                  }}
                >
                  {t.nome}
                </button>
              ))}
            </div>

            {ajuste.tipo === "rapport" && !(Number(ajuste.ppcmArquivo) > 0) && (
              <span className="hint aviso">
                Esse arquivo não traz a resolução gravada. Estou usando
                300 dpi, o que dá o azulejo acima — se a medida não bater com a estampa de verdade,
                corrija no "Tamanho %" ou salve o arquivo com o dpi certo.
              </span>
            )}

            <div className="ajustes-arte">
              {ajuste.tipo !== "rapport" && (
                <label>
                  Como entra
                  <select value={ajuste.modo} onChange={(e) => aoMexer({ modo: e.target.value })}>
                    {MODOS_DE_ARTE.map((m: { id: string; nome: string }) => (
                      <option key={m.id} value={m.id}>{m.nome}</option>
                    ))}
                  </select>
                </label>
              )}

              <label>
                Tamanho %
                <input type="number" min="10" max="400" step="5"
                  value={ajuste.escala}
                  onChange={(e) => aoMexer({ escala: Number(e.target.value) || 0 })} />
              </label>

              <label>
                Girar
                <select value={ajuste.giro} onChange={(e) => aoMexer({ giro: Number(e.target.value) })}>
                  {[0, 90, 180, 270].map((g) => <option key={g} value={g}>{g}°</option>)}
                </select>
              </label>

              <label>
                {ajuste.tipo === "rapport" ? "Onde começa (esq./dir.)" : "Esquerda / direita"}
                <input type="number" step="0.5" value={ajuste.x}
                  onChange={(e) => aoMexer({ x: Number(e.target.value) || 0 })} />
              </label>

              <label>
                {ajuste.tipo === "rapport" ? "Onde começa (cima/baixo)" : "Cima / baixo"}
                <input type="number" step="0.5" value={ajuste.y}
                  onChange={(e) => aoMexer({ y: Number(e.target.value) || 0 })} />
              </label>

              <span className="ajustes-botoes">
                <button type="button" className="btn secondary btn-sm" onClick={() => aoMexer({ x: 0, y: 0 })}>
                  {ajuste.tipo === "rapport" ? "Voltar ao começo" : "Centralizar"}
                </button>
                <button type="button" className="btn danger btn-sm" onClick={aoTirar}>Tirar arte</button>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
