/**
 * ===========================================================================
 * CONFIGURAÇÕES — a conta, a aparência e a equipe, em abas, como no Flow
 * ===========================================================================
 *
 * A tela que a engrenagem do pé da barra abre. A rota continua `/conta` (é a
 * que está guardada em atalho e link), e a aba aberta vai no endereço
 * (`/conta?aba=aparencia`), para o link levar direto a ela.
 *
 *   CONTA      quem está usando, de que empresa, e o Sair. Nada disso se edita
 *              aqui — trocar senha é no painel web da empresa —, e a tela diz
 *              isso em vez de oferecer campos que não salvam.
 *
 *   APARÊNCIA  escuro, claro ou o do sistema (ver `estado/tema.ts`), com a
 *              prévia de cada um, como a Aparência do Flow.
 *
 *   EQUIPE     o antigo PAINEL (`telas/Painel.tsx`): criar, desativar e
 *              excluir os acessos dos funcionários. Saiu da barra lateral em
 *              2026-10-21 e só aparece para a conta dona da empresa; a trava
 *              de verdade continua no backend.
 */

import { useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import { Icone } from "../casca/Icone";
import { NoCabecalho } from "../casca/Cabecalho";
import { iniciais, SESSAO_MUDOU, useSessao } from "../casca/usuario";
import { useTema, type ModoDoTema } from "../estado/tema";
import { Painel } from "./Painel";

/** Como o papel se chama em português, para quem não fala `owner`. */
const PAPEL: Record<string, string> = {
  owner: "Dono da empresa",
  dono: "Dono da empresa",
  admin: "Administrador",
  member: "Funcionário",
  operador: "Funcionário",
  leitor: "Somente leitura",
};

type Aba = "conta" | "aparencia" | "equipe";

const ABAS: { id: Aba; rotulo: string; icone: string; soDono?: boolean }[] = [
  { id: "conta", rotulo: "Conta", icone: "icones.svg#user" },
  { id: "aparencia", rotulo: "Aparência", icone: "icones.svg#palette" },
  { id: "equipe", rotulo: "Equipe", icone: "icones.svg#users", soDono: true },
];

export function Conta() {
  /*
    A tela lê a sessão sozinha: as rotas montam o componente sem props (ver
    `Componente`, em rotas.ts). Abre raramente; o pedido a mais não pesa.
  */
  const { usuario } = useSessao();
  const [parametros, setParametros] = useSearchParams();

  if (!usuario) return null;

  const dono = usuario.papel === "dono";
  const abas = ABAS.filter((a) => !a.soDono || dono);
  const pedida = parametros.get("aba") as Aba | null;
  const aberta: Aba = abas.some((a) => a.id === pedida) ? (pedida as Aba) : "conta";

  return (
    <div className="flex w-full flex-col gap-3">
      {/* AS ABAS vão no cabeçalho, à direita, como no Flow. */}
      <NoCabecalho>
      <div role="tablist" aria-label="Configurações" className="flex gap-1 rounded-xl border border-[var(--border-hairline)] bg-painel/70 p-1">
        {abas.map((aba) => {
          const ativa = aba.id === aberta;
          return (
            <button
              key={aba.id}
              type="button"
              role="tab"
              aria-selected={ativa}
              onClick={() => setParametros(aba.id === "conta" ? {} : { aba: aba.id }, { replace: true })}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border-0 px-3 py-1.5 text-[12.5px] transition-all duration-200 ${
                ativa ? "menu-item-aberto text-ambar-tinta" : "bg-transparent text-tinta-fraca hover:bg-[var(--surface-hover)] hover:text-tinta"
              }`}
            >
              <Icone referencia={aba.icone} className="size-[15px]" />
              {aba.rotulo}
            </button>
          );
        })}
      </div>
      </NoCabecalho>

      {aberta === "conta" && <AbaConta />}
      {aberta === "aparencia" && <AbaAparencia />}
      {aberta === "equipe" && <Painel />}
    </div>
  );
}

/* ── Conta ───────────────────────────────────────────────────────────── */

function AbaConta() {
  const { usuario } = useSessao();

  /*
    SAIR daqui RECARREGA a página, de propósito: a casca relê a sessão do zero
    e TODO o trabalho em memória vai junto — deixar as artes da pessoa
    anterior na memória seria o erro pior.
  */
  // Sem perguntar, como o botão de sair da barra: quem aperta quer sair.
  async function sair() {
    try {
      await fetch("/api/sessao/sair", { method: "POST" });
    } finally {
      window.location.assign("/");
    }
  }

  if (!usuario) return null;

  return (
    <>
      {/* A EMPRESA em cima, com a logo; quem está nesta máquina embaixo dela. */}
      <div className="flex items-center gap-4 rounded-2xl border border-linha bg-painel p-5">
        {usuario.logo ? (
          <img src={usuario.logo} alt="" className="size-14 shrink-0 rounded-2xl border border-linha bg-white object-contain p-1.5" />
        ) : (
          <span className="menu-avatar grid size-14 shrink-0 place-items-center rounded-2xl font-titulo text-lg text-ambar-tinta">
            {iniciais(usuario.empresa || usuario.nome)}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="m-0 truncate font-titulo text-lg text-tinta">{usuario.empresa || "Sem empresa vinculada"}</h2>
          <p className="mt-0.5 mb-0 truncate text-[13px] text-tinta-fraca">{usuario.nome}</p>
          <p className="mt-1 mb-0 text-[12px] text-tinta-apagada">{PAPEL[usuario.papel] || usuario.papel}</p>
        </div>
      </div>

      {usuario.papel === "dono" && <LogoDaEmpresa logo={usuario.logo ?? null} />}

      <Bloco titulo="Senha e acessos" icone="icones.svg#key-round">
        Trocar a senha é feito no painel web da empresa. Os acessos dos funcionários — criar,
        desativar e excluir — ficam na aba Equipe, visível só para o dono da empresa.
      </Bloco>

      <div className="flex flex-col gap-2">
        <button type="button" onClick={sair} className="btn secondary flex w-fit items-center gap-2">
          <Icone referencia="icones.svg#log-out" className="size-4" />
          Sair da conta
        </button>
        <p className="m-0 text-[12px] text-tinta-apagada">
          Na próxima vez o Optmize vai pedir o seu e-mail e a sua senha.
        </p>
      </div>
    </>
  );
}

/**
 * A LOGO DA EMPRESA, que aparece no pé da barra de todo mundo da empresa.
 *
 * Só o dono vê este bloco (o backend recusa os outros de qualquer jeito). A
 * imagem é reduzida AQUI, num canvas, para caber em 256 px: a logo vai em toda
 * renovação do token de cada máquina, e uma foto de 4 MB viajando a cada hora
 * seria peso à toa. PNG para manter o fundo transparente da logo.
 */
const LADO_DA_LOGO = 256;

async function logoReduzida(arquivo: File): Promise<string> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, LADO_DA_LOGO / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const png = canvas.toDataURL("image/png");
  // Logo que é foto (muita cor, nada liso) pode passar do teto do servidor em
  // PNG; WebP guarda a transparência e cabe.
  return png.length <= 280_000 ? png : canvas.toDataURL("image/webp", 0.9);
}

function LogoDaEmpresa({ logo }: { logo: string | null }) {
  const campo = useRef<HTMLInputElement>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function gravar(nova: string | null) {
    setSalvando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/sessao/empresa/logo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logo: nova }),
      });
      if (!resposta.ok) {
        const dados = await resposta.json().catch(() => ({}));
        throw new Error(dados.message || "Não deu para salvar a logo.");
      }
      // A barra (e este bloco) releem a sessão, que já tem a logo nova.
      window.dispatchEvent(new Event(SESSAO_MUDOU));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    try {
      await gravar(await logoReduzida(arquivo));
    } catch {
      setErro("Não deu para ler esta imagem. Use um PNG ou JPG.");
    }
  }

  return (
    <Bloco titulo="Logo da empresa" icone="icones.svg#image" texto="Aparece no pé da barra, para todo mundo da empresa, no lugar das iniciais.">
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-linha bg-white">
          {logo ? (
            <img src={logo} alt="Logo da empresa" className="size-full object-contain p-1.5" />
          ) : (
            <Icone referencia="icones.svg#image-plus" className="size-6 text-[#9a948d]" />
          )}
        </span>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={salvando} onClick={() => campo.current?.click()} className="btn primary flex items-center gap-2">
            <Icone referencia="icones.svg#upload" className="size-4" />
            {salvando ? "Salvando…" : logo ? "Trocar a logo" : "Enviar a logo"}
          </button>
          {logo && (
            <button type="button" disabled={salvando} onClick={() => gravar(null)} className="btn secondary flex items-center gap-2">
              <Icone referencia="icones.svg#trash-2" className="size-4" />
              Tirar
            </button>
          )}
        </div>
        <input
          ref={campo}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => { escolher(e.target.files?.[0]); e.target.value = ""; }}
        />
      </div>
      {erro && <p className="mt-3 mb-0 text-[13px] text-alerta">{erro}</p>}
    </Bloco>
  );
}

/* ── Aparência ───────────────────────────────────────────────────────── */

/*
 * A PRÉVIA DE CADA TEMA: uma barra e um cartão em miniatura, nas cores do
 * próprio tema — hex escrito à mão de propósito, porque a prévia mostra o
 * tema que NÃO está valendo, e os tokens só sabem o que está.
 */
const TEMAS: { id: ModoDoTema; rotulo: string; texto: string; icone: string; fundo: string; painel: string; linha: string; acento: string }[] = [
  { id: "escuro", rotulo: "Escuro", texto: "O de sempre do Optmize", icone: "icones.svg#moon", fundo: "#0b0b0c", painel: "#141416", linha: "#2a2a2f", acento: "#ff531f" },
  { id: "claro", rotulo: "Claro", texto: "Para sala bem iluminada", icone: "icones.svg#sun", fundo: "#f5f4f1", painel: "#ffffff", linha: "#d9d5ce", acento: "#0062c4" },
  { id: "sistema", rotulo: "Sistema", texto: "Segue o Windows", icone: "icones.svg#monitor", fundo: "", painel: "", linha: "", acento: "" },
];

function Previa({ tema }: { tema: (typeof TEMAS)[number] }) {
  const escuro = TEMAS[0]!;
  const claro = TEMAS[1]!;
  const metade = (t: typeof escuro) => (
    <div className="flex h-full flex-1 gap-1 p-1.5" style={{ background: t.fundo }}>
      <div className="flex w-1/4 flex-col gap-1 rounded p-1" style={{ background: t.painel }}>
        <div className="h-1.5 w-full rounded-full" style={{ background: t.acento }} />
        <div className="h-1 w-3/4 rounded-full" style={{ background: t.linha }} />
        <div className="h-1 w-2/3 rounded-full" style={{ background: t.linha }} />
      </div>
      <div className="flex flex-1 flex-col gap-1 rounded p-1.5" style={{ background: t.painel }}>
        <div className="h-1.5 w-1/2 rounded-full" style={{ background: t.linha }} />
        <div className="h-1 w-full rounded-full" style={{ background: t.linha }} />
        <div className="mt-auto h-2 w-1/3 self-end rounded" style={{ background: t.acento }} />
      </div>
    </div>
  );
  return (
    <div className="mb-3 flex h-16 w-full overflow-hidden rounded-lg border border-linha">
      {tema.id === "sistema" ? (
        <>
          {metade(escuro)}
          {metade(claro)}
        </>
      ) : (
        metade(tema)
      )}
    </div>
  );
}

function AbaAparencia() {
  const modo = useTema((e) => e.modo);
  const escolher = useTema((e) => e.escolher);

  return (
    <>
    <Bloco titulo="Tema" icone="icones.svg#palette" texto="Vale só para este computador.">
      <div className="mt-4 grid max-w-[760px] gap-3 sm:grid-cols-3">
        {TEMAS.map((tema) => {
          const ativo = tema.id === modo;
          return (
            <button
              key={tema.id}
              type="button"
              aria-pressed={ativo}
              onClick={(e) => escolher(tema.id, { x: e.clientX, y: e.clientY })}
              className={`rounded-xl border bg-painel p-3 text-left transition-colors ${
                ativo ? "border-ambar shadow-[0_0_0_3px_var(--accent-soft)]" : "border-linha hover:border-[var(--accent-line)]"
              }`}
            >
              <Previa tema={tema} />
              <span className="flex items-center gap-2">
                <Icone referencia={tema.icone} className={`size-4 ${ativo ? "text-ambar" : "text-tinta-apagada"}`} />
                <span className="flex-1 text-[13.5px] text-tinta">{tema.rotulo}</span>
                {ativo && (
                  <span className="grid size-4 place-items-center rounded-full bg-ambar text-ambar-tinta">
                    <Icone referencia="icones.svg#check" className="size-3" />
                  </span>
                )}
              </span>
              <span className="mt-0.5 block text-[12px] text-tinta-apagada">{tema.texto}</span>
            </button>
          );
        })}
      </div>
    </Bloco>
    </>
  );
}

/* ── Peças ───────────────────────────────────────────────────────────── */

function Bloco({ titulo, icone, texto, children }: { titulo: string; icone: string; texto?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-linha bg-painel p-5">
      <h3 className="m-0 flex items-center gap-2.5 text-[15px] text-tinta">
        <span className="grid size-8 place-items-center rounded-lg bg-[var(--accent-soft)] text-ambar">
          <Icone referencia={icone} className="size-4" />
        </span>
        {titulo}
      </h3>
      {texto && <p className="mt-2 mb-0 text-[13px] text-tinta-apagada">{texto}</p>}
      {typeof children === "string" ? (
        <p className="mt-3 mb-0 text-[13px] leading-relaxed text-tinta-fraca">{children}</p>
      ) : (
        children
      )}
    </section>
  );
}
