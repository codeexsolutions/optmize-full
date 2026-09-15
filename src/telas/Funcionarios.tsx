/**
 * ===========================================================================
 * FUNCIONÁRIOS — quem trabalha, e quais rostos o sistema conhece
 * ===========================================================================
 *
 * O terminal de chão de fábrica fotografa quem chega e pergunta ao servidor de
 * quem é aquele rosto. Esta tela é onde as respostas possíveis são cadastradas.
 *
 * ---------------------------------------------------------------------------
 * VÁRIOS ROSTOS POR PESSOA, DE PROPÓSITO
 * ---------------------------------------------------------------------------
 *
 * Um rosto de frente não é o mesmo de lado, nem com boné, nem com a luz da
 * manhã batendo de um jeito e a da tarde de outro. Cada foto vira uma entrada
 * própria, e basta parecer com UMA delas para ser reconhecido.
 *
 * Três ângulos por pessoa, no cadastro, poupam meses de "o sistema nunca me
 * reconhece" — que é como uma pessoa descreve um cadastro feito com uma foto só.
 *
 * ---------------------------------------------------------------------------
 * A FOTO FICA GUARDADA, E NÃO SÓ OS NÚMEROS
 * ---------------------------------------------------------------------------
 *
 * O que o reconhecimento usa é um vetor de 128 números. A foto não é
 * necessária para reconhecer — e mesmo assim fica, por duas razões:
 *
 *   - trocar de modelo um dia vira um recálculo em vez de uma sessão de fotos
 *     com a gráfica inteira de novo;
 *   - dá para OLHAR e julgar um cadastro ruim (escuro, de lado, com o colega
 *     atrás) antes que ele vire uma pessoa que o terminal nunca acerta.
 *
 * ---------------------------------------------------------------------------
 * DESLIGAR NÃO APAGA
 * ---------------------------------------------------------------------------
 *
 * Quem sai da gráfica fica inativo, não apagado: a chave do banco é em cascata,
 * e apagar levaria junto o histórico de ponto da pessoa. O que se quer é parar
 * de reconhecê-la, e é isso que `ativo = 0` faz.
 */

import { useEffect, useRef, useState } from "react";
import { api, ErroDaApi } from "../api/cliente";
import { useDados } from "../api/useDados";
import { Cartao } from "../casca/Cartao";
import { Icone } from "../casca/Icone";

interface Rosto {
  id: number;
  arquivo: string;
  modelo: string | null;
  criado_em: string;
}

interface Funcionario {
  id: number;
  nome: string;
  apelido: string | null;
  matricula: string | null;
  ativo: number;
  rostos?: Rosto[];
}

interface EstadoDoReconhecimento {
  pronto: boolean;
  modelo: string;
  corte: number;
  motivo: string | null;
  modelosNoDisco: boolean;
  rostosCadastrados: number;
}

const BOTAO = "rounded-[9px] border border-linha px-3 py-1.5 text-[0.78rem] text-tinta-fraca transition-colors hover:text-tinta";
const BOTAO_FORTE = "rounded-[9px] border border-ambar bg-ambar px-3 py-1.5 text-[0.78rem] text-ambar-tinta transition-colors";
const CAMPO = "rounded-lg border border-linha bg-painel-suave px-3 py-2 text-tinta";

/* ====================================================== a câmera do cadastro */

/**
 * A captura por webcam.
 *
 * O VÍDEO É ESPELHADO NA TELA e a foto NÃO. Quem se vê numa câmera espera o
 * comportamento de espelho — mexer a mão direita e ver a da direita mexer —, e
 * sem isso a pessoa se posiciona para o lado errado. Mas o que vai para o
 * servidor precisa ser o rosto como ele é: o reconhecimento tem noção de lado
 * (olho direito, olho esquerdo), e mandar espelhado é entregar uma pessoa que
 * não existe.
 */
function Camera({ aoTirar, aoFechar }: { aoTirar: (foto: Blob) => void; aoFechar: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let fluxo: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" }, audio: false })
      .then((s) => {
        fluxo = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
      })
      .catch((e: Error) => setErro(`Não consegui abrir a câmera: ${e.message}`));

    // Sem isto a luzinha da webcam fica acesa depois de fechar a caixa, e o
    // navegador segura o aparelho contra qualquer outro programa.
    return () => fluxo?.getTracks().forEach((t) => t.stop());
  }, []);

  function tirar() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    setOcupado(true);

    const tela = document.createElement("canvas");
    tela.width = v.videoWidth;
    tela.height = v.videoHeight;
    tela.getContext("2d")!.drawImage(v, 0, 0);
    tela.toBlob(
      (b) => {
        setOcupado(false);
        if (b) aoTirar(b);
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={aoFechar}>
      <div
        className="w-full max-w-2xl rounded-xl border border-linha bg-painel p-5 shadow-[var(--shadow)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-base font-medium text-tinta">Uma foto do rosto</h2>
        <p className="mb-4 text-sm text-tinta-apagada">
          De frente, com o rosto iluminado e sem ninguém atrás. Cadastre também um de
          perfil e um com boné, se for o caso — basta parecer com um deles.
        </p>

        {erro ? (
          <p className="py-10 text-center text-alerta">{erro}</p>
        ) : (
          <video
            ref={video}
            muted
            playsInline
            className="w-full rounded-lg bg-black"
            style={{ transform: "scaleX(-1)" }}
          />
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={BOTAO} onClick={aoFechar}>
            Cancelar
          </button>
          <button type="button" className={BOTAO_FORTE} onClick={tirar} disabled={!!erro || ocupado}>
            {ocupado ? "Um momento…" : "Tirar a foto"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ======================================================= apagar de vez */

/**
 * A pergunta antes de apagar.
 *
 * Não é cerimônia: apagar leva as batidas junto, e isso é irreversível de um
 * jeito que "desligar" não é. A caixa diz o número de batidas que vão embora —
 * quem clicou por engano descobre o tamanho do estrago ANTES, e não depois.
 *
 * O botão que apaga fica em laranja e à direita, longe do dedo que vinha
 * clicando em "Desligar".
 */
function Confirmar({
  quem,
  aoConfirmar,
  aoFechar,
}: {
  quem: Funcionario;
  aoConfirmar: () => void;
  aoFechar: () => void;
}) {
  const rostos = quem.rostos?.length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={aoFechar}>
      <div
        className="w-full max-w-md rounded-xl border border-linha bg-painel p-5 shadow-[var(--shadow)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-2 text-base font-medium text-tinta">Apagar {quem.nome}?</h2>
        <p className="mb-2 text-sm text-tinta-fraca">
          Vão junto <strong>todas as batidas de ponto</strong> desta pessoa e {rostos} rosto(s)
          cadastrados. Não há como desfazer.
        </p>
        <p className="mb-4 text-sm text-tinta-apagada">
          Se a pessoa saiu da gráfica, o certo é <strong>Desligar</strong>: ela some do terminal e
          do reconhecimento, e o histórico continua inteiro para a folha.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className={BOTAO} onClick={aoFechar}>
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-[9px] border border-alerta px-3 py-1.5 text-[0.78rem] text-alerta transition-colors hover:bg-alerta hover:text-painel"
            onClick={aoConfirmar}
          >
            Apagar de vez
          </button>
        </div>
      </div>
    </div>
  );
}

/* =============================================================== a tela */

export function Funcionarios() {
  const lista = useDados(() => api.get<Funcionario[]>("/ponto/funcionarios?todos=1"), []);
  const motor = useDados(() => api.get<EstadoDoReconhecimento>("/ponto/reconhecimento"), []);

  const [nome, setNome] = useState("");
  const [apelido, setApelido] = useState("");
  const [matricula, setMatricula] = useState("");
  const [fotografando, setFotografando] = useState<Funcionario | null>(null);
  const [apagando, setApagando] = useState<Funcionario | null>(null);
  const [recado, setRecado] = useState<{ tom: "bom" | "ruim"; texto: string } | null>(null);

  function recarregar() {
    lista.recarregar();
    motor.recarregar();
  }

  async function tentar(oQue: () => Promise<unknown>, aoDarCerto: string) {
    try {
      await oQue();
      setRecado({ tom: "bom", texto: aoDarCerto });
      recarregar();
    } catch (e) {
      setRecado({ tom: "ruim", texto: e instanceof ErroDaApi ? e.message : String(e) });
    }
  }

  const cadastrar = () =>
    void tentar(async () => {
      if (!nome.trim()) throw new ErroDaApi(400, "O nome é obrigatório.");
      await api.post("/ponto/funcionarios", {
        nome: nome.trim(),
        apelido: apelido.trim() || null,
        matricula: matricula.trim() || null,
      });
      setNome("");
      setApelido("");
      setMatricula("");
    }, "Funcionário cadastrado.");

  const guardarRosto = (quem: Funcionario, foto: Blob) =>
    void tentar(async () => {
      await api.enviarImagem(`/ponto/funcionarios/${quem.id}/rostos`, foto);
      setFotografando(null);
    }, `Rosto guardado para ${quem.nome}.`);

  const apagarDeVez = (quem: Funcionario) =>
    void tentar(async () => {
      const r = await api.apagar<{ batidasApagadas: number }>(
        `/ponto/funcionarios/${quem.id}?apagar=1`,
      );
      setApagando(null);
      return r;
    }, `${quem.nome} foi apagado.`);

  return (
    <>
      {fotografando && (
        <Camera
          aoTirar={(foto) => guardarRosto(fotografando, foto)}
          aoFechar={() => setFotografando(null)}
        />
      )}

      {apagando && (
        <Confirmar
          quem={apagando}
          aoConfirmar={() => apagarDeVez(apagando)}
          aoFechar={() => setApagando(null)}
        />
      )}

      <Cartao titulo="O reconhecimento" icone="icones.svg#circle-check">
        {motor.dados && <Motor estado={motor.dados} aoRecalcular={recarregar} />}
      </Cartao>

      <Cartao titulo="Cadastrar" icone="icones.svg#plus">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-tinta-apagada">Nome</span>
            <input className={CAMPO} value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-tinta-apagada">Apelido</span>
            <input className={CAMPO} value={apelido} onChange={(e) => setApelido(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-tinta-apagada">Matrícula</span>
            <input className={CAMPO} value={matricula} onChange={(e) => setMatricula(e.target.value)} />
          </label>
          <button type="button" className={BOTAO_FORTE} onClick={cadastrar}>
            Cadastrar
          </button>
        </div>

        {recado && (
          <p className={`mt-3 text-sm ${recado.tom === "bom" ? "text-tinta-fraca" : "text-alerta"}`}>
            {recado.texto}
          </p>
        )}
      </Cartao>

      <Cartao titulo="Quem trabalha aqui" icone="icones.svg#users" preencher>
        {lista.carregando && <p className="py-12 text-center text-tinta-fraca">Carregando…</p>}
        {lista.erro && <p className="py-8 text-center text-alerta">{lista.erro}</p>}
        {lista.dados?.length === 0 && (
          <p className="py-12 text-center text-tinta-fraca">
            Ninguém cadastrado ainda. O terminal não tem como reconhecer quem não está aqui.
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {lista.dados?.map((quem) => (
            <Pessoa
              key={quem.id}
              quem={quem}
              aoFotografar={() => setFotografando(quem)}
              aoMudar={(promessa, recadoBom) => void tentar(() => promessa, recadoBom)}
              aoApagar={setApagando}
            />
          ))}
        </div>
      </Cartao>
    </>
  );
}

/* --------------------------------------------------------- o cabeçalho */

function Motor({ estado, aoRecalcular }: { estado: EstadoDoReconhecimento; aoRecalcular: () => void }) {
  const [ocupado, setOcupado] = useState(false);

  async function recalcular() {
    setOcupado(true);
    try {
      await api.post("/ponto/rostos/recalcular", {});
    } finally {
      setOcupado(false);
      aoRecalcular();
    }
  }

  if (!estado.modelosNoDisco) {
    return (
      <div>
        <p className="text-alerta">
          <Icone referencia="icones.svg#triangle-alert" className="mr-1 inline size-4 align-text-bottom" />
          Os modelos não estão instalados neste servidor.
        </p>
        <p className="mt-1 text-sm text-tinta-apagada">
          Sem eles o terminal não reconhece ninguém e cai para escolher o nome na tela. Os
          arquivos são <code>yunet.onnx</code> e <code>sface.onnx</code>, em{" "}
          <code>servidor/modelos</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <span className="text-tinta">
        <Icone referencia="icones.svg#circle-check" className="mr-1 inline size-4 align-text-bottom" />
        {estado.rostosCadastrados} rosto(s) prontos para comparação
      </span>
      <span className="text-sm text-tinta-apagada">
        modelo <code>{estado.modelo}</code> · corte {estado.corte}
      </span>
      <button type="button" className={`${BOTAO} ml-auto`} onClick={() => void recalcular()}>
        {ocupado ? "Recalculando…" : "Recalcular os vetores"}
      </button>
    </div>
  );
}

/* ----------------------------------------------------------- uma pessoa */

function Pessoa({
  quem,
  aoFotografar,
  aoMudar,
  aoApagar,
}: {
  quem: Funcionario;
  aoFotografar: () => void;
  aoMudar: (promessa: Promise<unknown>, recado: string) => void;
  aoApagar: (quem: Funcionario) => void;
}) {
  const rostos = quem.rostos ?? [];
  const semVetor = rostos.filter((r) => !r.modelo).length;

  return (
    <div className="mb-4 rounded-lg border border-linha-suave p-3 last:mb-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={quem.ativo ? "text-tinta" : "text-tinta-apagada line-through"}>
          {quem.nome}
        </span>
        {quem.apelido && <span className="text-sm text-tinta-apagada">“{quem.apelido}”</span>}
        {quem.matricula && <span className="text-xs text-tinta-apagada">nº {quem.matricula}</span>}

        <span className="text-xs text-tinta-apagada">
          {rostos.length === 0 ? "nenhum rosto" : `${rostos.length} rosto(s)`}
          {semVetor > 0 && <span className="ml-1 text-atencao">· {semVetor} sem vetor</span>}
        </span>

        <span className="ml-auto flex gap-1.5">
          <button type="button" className={BOTAO} onClick={aoFotografar}>
            <Icone referencia="icones.svg#camera" className="mr-1 inline size-4 align-text-bottom" />
            Tirar foto
          </button>
          <button
            type="button"
            className={BOTAO}
            onClick={() =>
              aoMudar(
                api.patch(`/ponto/funcionarios/${quem.id}`, { ativo: quem.ativo ? 0 : 1 }),
                quem.ativo ? `${quem.nome} ficou inativo.` : `${quem.nome} voltou.`,
              )
            }
          >
            {quem.ativo ? "Desligar" : "Reativar"}
          </button>
          <button
            type="button"
            title="Apagar de vez, com as batidas"
            className={`${BOTAO} hover:text-alerta`}
            onClick={() => aoApagar(quem)}
          >
            <Icone referencia="icones.svg#trash" className="inline size-4" />
          </button>
        </span>
      </div>

      {rostos.length === 0 ? (
        <p className="mt-2 text-sm text-tinta-apagada">
          Sem rosto cadastrado, o terminal não tem como reconhecer esta pessoa.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {rostos.map((r) => (
            <figure key={r.id} className="relative">
              <img
                src={`/api/ponto/rostos/${r.id}/imagem`}
                alt=""
                className="size-20 rounded-lg border border-linha object-cover"
              />
              {!r.modelo && (
                <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-black/70 text-center text-[0.6rem] text-atencao">
                  sem vetor
                </span>
              )}
              <button
                type="button"
                title="Apagar este rosto"
                className="absolute -right-1.5 -top-1.5 size-5 rounded-full border border-linha bg-painel text-xs text-tinta-fraca hover:text-alerta"
                onClick={() => aoMudar(api.apagar(`/ponto/rostos/${r.id}`), "Rosto apagado.")}
              >
                ×
              </button>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
