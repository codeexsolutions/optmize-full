/**
 * ===========================================================================
 * IMPRESSORAS — o painel da produção
 * ===========================================================================
 *
 * A tela de abrir de manhã: o que está imprimindo agora, como foi o dia, e
 * como foi o período. Tudo sai do banco local; quem conversa com as máquinas
 * são os leitores do servidor, e o que eles descobrem chega aqui por evento.
 *
 * ---------------------------------------------------------------------------
 * SOBRE OS DOIS GRÁFICOS
 * ---------------------------------------------------------------------------
 *
 * **Produção por dia** é uma série só (metros por dia, todas as máquinas
 * somadas). Série única não leva legenda — o título já diz o que está
 * plotado, e uma caixinha com um quadradinho só repetiria o título.
 *
 * **Composição da tinta** foi o gráfico que mudou de forma no meio do
 * caminho, e vale registrar por quê. A ideia óbvia era pintar cada canal com
 * a cor dele — ciano, magenta, amarelo e preto. Rodando o validador de
 * paleta, os três primeiros passam; o preto não passa de jeito nenhum:
 *
 *   - cinza reprova o piso de croma (uma cor que "lê como cinza"), o que é
 *     inevitável, porque tinta preta É acromática;
 *   - e, pior, reprova o piso de visão normal — o par cinza/amarelo fica em
 *     ΔE 12,3, abaixo de 15. Esse piso é o único que a regra não deixa
 *     compensar com rótulo: se nem quem enxerga todas as cores separa o par,
 *     a cor não está identificando nada.
 *
 * Então a cor não carrega a identidade aqui: a letra carrega. São quatro
 * linhas rotuladas C, M, Y e K, cada uma com uma barra de magnitude na mesma
 * cor (é a mesma medida — mililitros — nas quatro), e o valor escrito na
 * ponta. Sem paleta categórica, sem par de cores para confundir, e o
 * operador lê o canal pela letra, que é como ele já o chama.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/cliente";
import { useDados } from "../api/useDados";
import { Cartao } from "../casca/Cartao";
import { Icone } from "../casca/Icone";
import { useEventos, useRecarregarComEventos } from "../impressoras/socket";
import {
  falar, gravarPreferencias, lerPreferencias, notificar,
  pedirPermissaoDeNotificacao, prepararSom, tocarBipe,
  type PreferenciasDeAviso,
} from "../utils/avisos";
import {
  NOME_DO_CANAL, dataBr, duracao, metros, metrosCurtos,
  metrosQuadrados, tinta, variacao,
} from "../utils/formato";
import type { AoVivo, DiaDaSerie, RespostaDeDashboard } from "../impressoras/tipos";

const JANELAS = [
  { dias: 7, rotulo: "7 dias" },
  { dias: 30, rotulo: "30 dias" },
  { dias: 90, rotulo: "90 dias" },
];

export function Impressoras() {
  const [dias, setDias] = useState(7);

  const painel = useDados<RespostaDeDashboard>(
    () => api.get<RespostaDeDashboard>(`/impressoras/dashboard?days=${dias}`),
    [dias],
  );
  const aoVivo = useDados<AoVivo[]>(() => api.get<AoVivo[]>("/impressoras/live-progress"));

  const [avisos, setAvisos] = useState<PreferenciasDeAviso>(lerPreferencias);

  /*
   * O aviso sai do MESMO evento que atualiza a tela, e não de uma consulta
   * própria: assim é impossível o painel mostrar um trabalho que não avisou,
   * ou avisar de um que a tela não mostra.
   *
   * Trabalho cancelado não avisa. O aviso existe para dizer "a máquina está
   * produzindo"; cancelamento é o contrário disso, e ele já aparece em
   * vermelho na lista de quem for olhar.
   */
  useEventos(["new-print"], (_evento, dados) => {
    const registro = dados as { task?: string; machineName?: string; cancelled?: boolean };
    if (registro.cancelled) return;

    const maquina = registro.machineName || "uma impressora";
    const trabalho = registro.task || "trabalho sem nome";

    if (avisos.som) tocarBipe();
    if (avisos.voz) falar(`Impressão nova em ${maquina}`);
    if (avisos.notificacao) notificar(`Impressão nova — ${maquina}`, trabalho);
  });

  useRecarregarComEventos(["new-print", "history-updated", "machine-status"], painel.recarregar);
  // O progresso chega quase a cada segundo nas máquinas AT; a espera curta
  // deixa o cartão vivo sem repintar a tela inteira o tempo todo.
  useRecarregarComEventos(["print-progress", "new-print"], aoVivo.recarregar, 900);

  const dados = painel.dados;
  const semMaquinas = dados && dados.machines.length === 0;

  return (
    <>
      {aoVivo.dados && aoVivo.dados.length > 0 && (
        <Cartao
          titulo="Imprimindo agora"
          icone="icones.svg#activity"
          apoio="O que está rodando neste momento, direto do log de cada máquina."
        >
          <ul className="m-0 grid list-none gap-2.5 p-0 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
            {aoVivo.dados.map((item) => <CartaoAoVivo key={item.machineId} item={item} />)}
          </ul>
        </Cartao>
      )}

      <Cartao
        titulo="Hoje"
        icone="icones.svg#printer"
        apoio={dados ? dataBr(dados.date) : "Carregando..."}
      >
        {painel.carregando && !dados && <p className="m-0 text-[0.85rem] text-tinta-fraca">Carregando o painel...</p>}
        {painel.erro && (
          <p className="m-0 flex items-center gap-2 text-[0.85rem] text-alerta">
            <Icone referencia="icones.svg#triangle-alert" className="size-4 shrink-0" />
            {painel.erro}
          </p>
        )}

        {semMaquinas && (
          <p className="m-0 text-[0.85rem] text-tinta-fraca">
            Nenhuma impressora cadastrada. Abra <strong className="text-tinta">Máquinas</strong> e
            clique em <strong className="text-tinta">Procurar máquinas</strong> — elas são achadas na
            rede sozinhas, com os caminhos e o histórico.
          </p>
        )}

        {dados && !semMaquinas && (
          <>
            {/*
              O número que a fábrica pergunta primeiro é "quantos metros hoje".
              Ele vem como figura grande; o resto acompanha em ladrilhos.
            */}
            <p className="m-0 font-mono text-[2.6rem] leading-none font-semibold text-ambar">
              {metrosCurtos(dados.today.printLength)}
            </p>
            <p className="mt-1 mb-4 text-[0.8rem] text-tinta-fraca">
              {dados.today.completed} concluído(s)
              {dados.today.cancelled > 0 && `, ${dados.today.cancelled} cancelado(s)`}
              {dados.today.jobs === 0 && "nenhum trabalho ainda hoje"}
            </p>

            <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
              <Ladrilho rotulo="Área impressa" valor={metrosQuadrados(dados.today.printArea)} />
              <Ladrilho rotulo="Tempo de máquina" valor={duracao(dados.today.timeSeconds)} />
              <Ladrilho rotulo="Tinta" valor={tinta(dados.today.inkMl)} />
              <Ladrilho rotulo="Trabalhos" valor={String(dados.today.jobs)} />
            </div>
          </>
        )}
      </Cartao>

      {dados && !semMaquinas && (
        <Cartao
          titulo="Produção por dia"
          icone="icones.svg#chart-line"
          apoio={`Metros concluídos por dia, todas as máquinas somadas — de ${dataBr(dados.start)} a ${dataBr(dados.end)}.`}
          acao={
            <div className="flex gap-1 rounded-[9px] border border-linha bg-painel-suave p-1">
              {JANELAS.map((janela) => (
                <button
                  key={janela.dias}
                  type="button"
                  onClick={() => setDias(janela.dias)}
                  aria-pressed={dias === janela.dias}
                  className={`rounded-[7px] px-2.5 py-1 text-[0.78rem] font-semibold transition-colors ${
                    dias === janela.dias ? "bg-ambar text-ambar-tinta" : "text-tinta-fraca hover:text-tinta"
                  }`}
                >
                  {janela.rotulo}
                </button>
              ))}
            </div>
          }
        >
          <ComparacaoComAnterior atual={dados.period.printLength} anterior={dados.previous.printLength} dias={dados.days} />
          <GraficoDeProducao serie={dados.series} />
          <TabelaDaSerie serie={dados.series} />
        </Cartao>
      )}

      {dados && dados.inkChannels.length > 0 && (
        <Cartao
          titulo="Composição da tinta"
          icone="icones.svg#droplet"
          apoio="Quanto de cada canal saiu no período. A letra identifica o canal; a barra é a quantidade."
        >
          <BarrasDeTinta canais={dados.inkChannels} />
        </Cartao>
      )}

      <CartaoDeAvisos
        preferencias={avisos}
        aoMudar={(proximo) => { setAvisos(proximo); gravarPreferencias(proximo); }}
      />

      {dados && !semMaquinas && (
        <Cartao titulo="Máquinas" icone="icones.svg#server" apoio="Uma por impressora cadastrada, com o dia dela e o estado agora.">
          <ul className="m-0 grid list-none gap-2.5 p-0 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
            {dados.machines.map((m) => (
              <li key={m.machine.id} className="rounded-[10px] border border-linha bg-painel-suave px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`size-2 shrink-0 rounded-full ${m.online ? "bg-certo" : "bg-[var(--text-faint)]"}`}
                  />
                  <strong className="truncate text-[0.92rem] text-tinta">{m.machine.name}</strong>
                  <span className="ml-auto shrink-0 text-[0.72rem] text-tinta-apagada">
                    {m.online ? "online" : "offline"}
                  </span>
                </div>

                <p className="mt-2 mb-0 font-mono text-[1.15rem] text-tinta">{metros(m.today.printLength)}</p>
                <p className="mt-0.5 mb-0 text-[0.73rem] text-tinta-apagada">
                  hoje — {m.today.jobs} trabalho(s) · {metrosCurtos(m.period.printLength)} no período
                </p>

                {m.inkLowColors.length > 0 && (
                  <p className="mt-2 mb-0 flex items-center gap-1.5 text-[0.75rem] text-atencao">
                    <Icone referencia="icones.svg#droplet" className="size-3.5 shrink-0" />
                    tinta baixa: {m.inkLowColors.map((c) => NOME_DO_CANAL[c] || c).join(", ")}
                  </p>
                )}
                {!m.online && m.error && (
                  <p className="mt-2 mb-0 text-[0.72rem] text-tinta-apagada">{m.error}</p>
                )}
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </>
  );
}

/**
 * Como o painel avisa quando entra trabalho novo.
 *
 * As três preferências são de quem está NAQUELA máquina, não do sistema: o
 * monitor pendurado na parede da produção quer som e voz; o computador de quem
 * fica no telefone o dia todo, não. Por isso moram no navegador.
 *
 * Som e notificação só podem ser ligados de dentro de um clique — é o
 * navegador que exige. Ligar aqui é esse clique; ver `impressoras/avisos.ts`.
 */
function CartaoDeAvisos({ preferencias, aoMudar }: {
  preferencias: PreferenciasDeAviso;
  aoMudar: (proximo: PreferenciasDeAviso) => void;
}) {
  const [recado, setRecado] = useState<string | null>(null);

  const alternar = async (chave: keyof PreferenciasDeAviso) => {
    const ligando = !preferencias[chave];
    setRecado(null);

    if (ligando && chave === "som" && !prepararSom()) {
      setRecado("Este navegador não deixa tocar som.");
      return;
    }
    if (ligando && chave === "notificacao" && !(await pedirPermissaoDeNotificacao())) {
      // Interruptor ligado prometendo um aviso que não chega é pior do que
      // interruptor desligado. Ele não liga, e a tela diz por quê.
      setRecado("O navegador não deu permissão para notificar. Libere nas configurações do site.");
      return;
    }

    aoMudar({ ...preferencias, [chave]: ligando });
  };

  return (
    <Cartao
      titulo="Avisar quando entrar trabalho novo"
      icone="icones.svg#bell"
      apoio="Vale só neste computador. O aviso sai do mesmo evento que atualiza a tela."
    >
      <div className="flex flex-wrap gap-2">
        <BotaoDeAviso ligado={preferencias.som} aoClicar={() => void alternar("som")} icone="icones.svg#volume-2" rotulo="Som" />
        <BotaoDeAviso ligado={preferencias.voz} aoClicar={() => void alternar("voz")} icone="icones.svg#message-circle" rotulo="Voz" />
        <BotaoDeAviso ligado={preferencias.notificacao} aoClicar={() => void alternar("notificacao")} icone="icones.svg#bell" rotulo="Notificação" />
      </div>

      {recado && <p className="mt-2.5 mb-0 text-[0.8rem] text-atencao">{recado}</p>}

      <p className="mt-2.5 mb-0 text-[0.75rem] text-tinta-apagada">
        Trabalho cancelado não avisa: o aviso é para dizer que a máquina está produzindo.
      </p>
    </Cartao>
  );
}

function BotaoDeAviso({ ligado, aoClicar, icone, rotulo }: {
  ligado: boolean; aoClicar: () => void; icone: string; rotulo: string;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={ligado}
      className={`flex items-center gap-2 rounded-[9px] border px-3.5 py-2 text-[0.82rem] font-semibold transition-colors ${
        ligado ? "border-ambar bg-ambar text-ambar-tinta" : "border-linha text-tinta-fraca hover:text-tinta"
      }`}
    >
      <Icone referencia={icone} className="size-4" />
      {rotulo}
    </button>
  );
}

function Ladrilho({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-[10px] border border-linha bg-painel-suave px-3 py-2.5">
      <span className="block text-[0.72rem] text-tinta-apagada">{rotulo}</span>
      <strong className="block font-mono text-[1.05rem] text-tinta">{valor}</strong>
    </div>
  );
}

/**
 * Quanto o período rendeu contra a janela anterior do mesmo tamanho.
 *
 * Some quando a janela anterior foi zero: "subiu 100%" a partir do nada não
 * informa nada, e é justamente o que acontece na primeira semana de uso.
 */
function ComparacaoComAnterior({ atual, anterior, dias }: { atual: number; anterior: number; dias: number }) {
  const delta = variacao(atual, anterior);
  if (delta === null) return null;

  const subiu = delta >= 0;
  return (
    <p className="mt-0 mb-3 flex items-center gap-2 text-[0.8rem] text-tinta-fraca">
      <span className={`font-mono font-semibold ${subiu ? "text-certo" : "text-atencao"}`}>
        {subiu ? "+" : ""}{delta.toFixed(1)}%
      </span>
      contra os {dias} dias anteriores ({metrosCurtos(anterior)}).
    </p>
  );
}

/* ========================================================================== */
/* Os gráficos                                                                */
/* ========================================================================== */

const ALTURA = 190;
const MARGEM = { topo: 22, direita: 16, baixo: 26, esquerda: 56 };

/**
 * Mede a largura de verdade do elemento.
 *
 * Um `viewBox` com `preserveAspectRatio="none"` seria menos código, e foi a
 * primeira tentativa — mas ele escala X e Y por fatores diferentes, e aí os
 * números do eixo saem espremidos na horizontal, como letra de fonte
 * condensada. Desenhar em pixel de verdade custa este hook e resolve de uma
 * vez: texto, traço e ponta de linha saem todos no tamanho pedido.
 */
function useLargura<T extends HTMLElement>() {
  const alvo = useRef<T | null>(null);
  const [largura, setLargura] = useState(720);

  useEffect(() => {
    const elemento = alvo.current;
    if (!elemento) return;
    const observador = new ResizeObserver(([entrada]) => {
      const medida = entrada?.contentRect.width ?? 0;
      if (medida > 0) setLargura(medida);
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  return [alvo, largura] as const;
}

/**
 * Metros por dia, em área.
 *
 * SVG à mão em vez de biblioteca: é uma série só, num eixo só, e uma
 * biblioteca de gráficos entraria no `dist` inteira para desenhar um polígono
 * e cinco linhas. O Optimize já embute o Node e dois modelos de rede no
 * instalador; peso aqui é peso lá.
 */
function GraficoDeProducao({ serie }: { serie: DiaDaSerie[] }) {
  const [caixa, largura] = useLargura<HTMLDivElement>();
  const [emFoco, setEmFoco] = useState<number | null>(null);

  const areaLargura = Math.max(80, largura - MARGEM.esquerda - MARGEM.direita);
  const areaAltura = ALTURA - MARGEM.topo - MARGEM.baixo;

  const maximo = Math.max(1, ...serie.map((d) => d.meters));
  // O eixo tem que terminar num número redondo: "3.847" no topo não se lê.
  const teto = tetoRedondo(maximo);

  const x = (i: number) =>
    MARGEM.esquerda + (serie.length <= 1 ? areaLargura / 2 : (i / (serie.length - 1)) * areaLargura);
  const y = (v: number) => MARGEM.topo + areaAltura - (v / teto) * areaAltura;

  const linha = serie.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.meters).toFixed(1)}`).join(" ");
  const base = (MARGEM.topo + areaAltura).toFixed(1);
  const area = serie.length
    ? `${linha} L${x(serie.length - 1).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z`
    : "";

  const marcas = [0, teto / 2, teto];
  const indiceDoPico = serie.reduce((melhor, d, i) => (d.meters > (serie[melhor]?.meters ?? 0) ? i : melhor), 0);
  const pico = serie[indiceDoPico];
  const foco = emFoco !== null ? serie[emFoco] : null;

  // O rótulo do pico vira para dentro quando o ponto está perto da borda
  // direita: ancorado no início, ele sairia do desenho e seria cortado.
  const picoNaDireita = indiceDoPico > serie.length / 2;

  return (
    <figure className="m-0" ref={caixa}>
      <svg
        width={largura}
        height={ALTURA}
        role="img"
        aria-label={`Produção diária de ${dataBr(serie[0]?.date)} a ${dataBr(serie[serie.length - 1]?.date)}, com pico de ${Math.round(pico?.meters ?? 0)} metros.`}
        className="block touch-none"
        onMouseLeave={() => setEmFoco(null)}
        onMouseMove={(evento) => {
          const limites = evento.currentTarget.getBoundingClientRect();
          const passo = serie.length <= 1 ? areaLargura : areaLargura / (serie.length - 1);
          const indice = Math.round((evento.clientX - limites.left - MARGEM.esquerda) / passo);
          setEmFoco(indice >= 0 && indice < serie.length ? indice : null);
        }}
      >
        {/* Grade: um passo fora da superfície, fio de 1px, sólida — recessiva. */}
        {marcas.map((valor) => (
          <g key={valor}>
            <line
              x1={MARGEM.esquerda} x2={largura - MARGEM.direita}
              y1={y(valor)} y2={y(valor)}
              stroke="var(--border)" strokeWidth="1"
            />
            <text
              x={MARGEM.esquerda - 8} y={y(valor) + 4}
              textAnchor="end" fill="var(--text-faint)"
              fontSize="10" fontFamily="var(--font-mono)"
            >
              {Math.round(valor).toLocaleString("pt-BR")}
            </text>
          </g>
        ))}

        {/* A área é lavagem, não bloco: 10% do âmbar. */}
        <path d={area} fill="var(--accent)" fillOpacity="0.1" />
        <path d={linha} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* Rótulo direto só no pico: número em todo ponto vira ruído e não se lê. */}
        {serie.length > 1 && pico && pico.meters > 0 && (
          <>
            <circle
              cx={x(indiceDoPico)} cy={y(pico.meters)} r="4"
              fill="var(--accent)" stroke="var(--card-bg)" strokeWidth="2"
            />
            <text
              x={x(indiceDoPico) + (picoNaDireita ? -8 : 8)}
              y={y(pico.meters) - 8}
              textAnchor={picoNaDireita ? "end" : "start"}
              fill="var(--text-dim)"
              fontSize="10" fontFamily="var(--font-mono)"
            >
              {Math.round(pico.meters).toLocaleString("pt-BR")} m
            </text>
          </>
        )}

        {/* A mira do ponto sob o cursor. */}
        {foco && emFoco !== null && (
          <>
            <line
              x1={x(emFoco)} x2={x(emFoco)}
              y1={MARGEM.topo} y2={MARGEM.topo + areaAltura}
              stroke="var(--text-faint)" strokeWidth="1"
            />
            <circle
              cx={x(emFoco)} cy={y(foco.meters)} r="4"
              fill="var(--accent)" stroke="var(--card-bg)" strokeWidth="2"
            />
          </>
        )}

        {/* Extremos do eixo do tempo. O meio fica para o cursor. */}
        <text x={MARGEM.esquerda} y={ALTURA - 8} fill="var(--text-faint)" fontSize="10" fontFamily="var(--font-mono)">
          {dataBr(serie[0]?.date).slice(0, 5)}
        </text>
        <text
          x={largura - MARGEM.direita} y={ALTURA - 8} textAnchor="end"
          fill="var(--text-faint)" fontSize="10" fontFamily="var(--font-mono)"
        >
          {dataBr(serie[serie.length - 1]?.date).slice(0, 5)}
        </text>
      </svg>

      {/*
        O valor sob o cursor sai em HTML, fora do SVG: texto em SVG não herda a
        tipografia da tela nem quebra linha. A altura é fixa para o gráfico não
        pular quando o cursor entra e sai.
      */}
      <figcaption className="mt-1 flex min-h-[20px] items-center gap-3 text-[0.78rem]">
        {foco ? (
          <>
            <span className="text-tinta-fraca">{dataBr(foco.date)}</span>
            <strong className="font-mono text-tinta">{metros(foco.meters)}</strong>
            <span className="text-tinta-apagada">{foco.jobs} trabalho(s)</span>
          </>
        ) : (
          <span className="text-tinta-apagada">Passe o cursor para ver o dia.</span>
        )}
      </figcaption>
    </figure>
  );
}

/** O mesmo conteúdo do gráfico em texto: quem não lê a curva lê a tabela. */
function TabelaDaSerie({ serie }: { serie: DiaDaSerie[] }) {
  const comTrabalho = useMemo(() => serie.filter((d) => d.jobs > 0), [serie]);

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[0.78rem] text-tinta-apagada">
        Ver os números ({comTrabalho.length} dia(s) com produção)
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-[0.8rem]">
          <thead>
            <tr className="text-left text-tinta-apagada">
              <th className="px-2 py-1.5 font-medium">Dia</th>
              <th className="px-2 py-1.5 text-right font-medium">Metros</th>
              <th className="px-2 py-1.5 text-right font-medium">Trabalhos</th>
              <th className="px-2 py-1.5 text-right font-medium">Tinta</th>
            </tr>
          </thead>
          <tbody>
            {comTrabalho.map((dia) => (
              <tr key={dia.date} className="border-t border-linha-suave">
                <td className="px-2 py-1.5 font-mono text-tinta-fraca">{dataBr(dia.date)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-tinta">{metros(dia.meters)}</td>
                <td className="px-2 py-1.5 text-right text-tinta-fraca">{dia.jobs}</td>
                <td className="px-2 py-1.5 text-right text-tinta-fraca">{tinta(dia.inkMl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * Os quatro canais de tinta, em linhas rotuladas.
 *
 * Uma cor só nas quatro barras porque a medida é a mesma (mililitros): a
 * barra responde "quanto", e quem responde "de qual" é a letra do canal. Ver
 * o cabeçalho do arquivo para por que a ideia de pintar cada canal com a cor
 * dele não sobreviveu à checagem de contraste.
 */
function BarrasDeTinta({ canais }: { canais: { code: string; color: string; ml: number }[] }) {
  const maximo = Math.max(1, ...canais.map((c) => c.ml));

  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {canais.map((canal) => (
        <li key={canal.code} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-[0.8rem] text-tinta-fraca">
            <strong className="font-mono text-tinta">{canal.code}</strong>
            <span className="ml-1.5 text-tinta-apagada">{NOME_DO_CANAL[canal.code] || canal.color}</span>
          </span>

          {/* Trilho recessivo + barra de no máximo 24px, ponta arredondada. */}
          <span className="h-[14px] min-w-0 flex-1 rounded-[4px] bg-painel-suave">
            <span
              className="block h-full rounded-r-[4px] bg-ambar"
              style={{ width: `${Math.max(1.5, (canal.ml / maximo) * 100)}%` }}
            />
          </span>

          <strong className="w-20 shrink-0 text-right font-mono text-[0.82rem] text-tinta">
            {tinta(canal.ml)}
          </strong>
        </li>
      ))}
    </ul>
  );
}

/** O eixo termina num número redondo: 1, 2, 5 vezes uma potência de dez. */
function tetoRedondo(valor: number): number {
  const grandeza = Math.pow(10, Math.floor(Math.log10(valor)));
  for (const passo of [1, 2, 2.5, 5, 10]) {
    if (valor <= passo * grandeza) return passo * grandeza;
  }
  return 10 * grandeza;
}

/* ========================================================================== */
/* Ao vivo                                                                    */
/* ========================================================================== */

/**
 * Uma impressão em curso.
 *
 * As máquinas AT dão `Finish / Total` e permitem porcentagem de verdade. As
 * outras não dão número nenhum — nelas a barra é indeterminada de propósito,
 * em vez de inventar um percentual que não existe.
 */
function CartaoAoVivo({ item }: { item: AoVivo }) {
  const temPercentual = typeof item.progressPercent === "number" && item.progressPercent >= 0;
  const parado = item.progressState === "stalled";

  return (
    <li className="rounded-[10px] border border-[var(--accent-line)] bg-painel-suave px-3.5 py-3">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className="size-2 shrink-0 animate-pulse rounded-full bg-ambar" />
        <strong className="truncate text-[0.88rem] text-tinta">{item.machineName || item.machineId}</strong>
        {temPercentual && (
          <span className="ml-auto shrink-0 font-mono text-[0.8rem] text-ambar">
            {Math.round(item.progressPercent!)}%
          </span>
        )}
      </div>

      <p className="mt-1 mb-2 truncate text-[0.78rem] text-tinta-fraca" title={item.task}>
        {item.task || "trabalho sem nome"}
      </p>

      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className={`h-full rounded-full bg-ambar ${temPercentual ? "transition-[width] duration-500" : "w-1/3 animate-pulse"}`}
          style={temPercentual ? { width: `${Math.min(100, item.progressPercent!)}%` } : undefined}
        />
      </div>

      <p className="mt-1.5 mb-0 text-[0.72rem] text-tinta-apagada">
        {parado
          ? "sem avanço — pode estar pausada"
          : item.finish != null && item.total != null
            // O AT devolve os dois como número quebrado. Mostrar
            // "4.573804738045745 de 100" na tela não é precisão: é o formato
            // do arquivo vazando para quem só quer saber o andamento.
            ? `${Math.round(item.finish)} de ${Math.round(item.total)}`
            : item.printLength
              ? metros(item.printLength)
              : "em impressão"}
      </p>
    </li>
  );
}
