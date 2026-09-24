/**
 * ===========================================================================
 * PAINEL — os acessos dos funcionários
 * ===========================================================================
 *
 * A tela que o botão "Painel", logo acima do pé da barra, abre. Só o DONO da
 * empresa a vê no menu: é daqui que ele cria o acesso de cada funcionário
 * (nome, e-mail e senha), desliga e religa, e exclui.
 *
 * QUEM DECIDE É O BACKEND, pelo `/team` — este arquivo só conversa. Se a conta
 * não é a dona, se o plano não comporta equipe, se as vagas acabaram ou se o
 * e-mail já tem conta, a recusa vem de lá, escrita em português, e a tela a
 * mostra como veio. Repetir as regras aqui criaria uma segunda verdade.
 *
 * O caminho passa pelo servidor local (`/api/sessao/equipe`), e não direto ao
 * Railway, pela mesma razão do login: o token da conta não atravessa para a
 * página. Ver o cabeçalho de `servidor/sessao.js`.
 *
 * DESATIVAR não apaga nada: o funcionário não consegue mais trabalhar, e a
 * sessão aberta dele cai na hora. EXCLUIR apaga a conta — o e-mail fica livre
 * para ser cadastrado de novo.
 */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Botao, BotaoDeIcone } from "../casca/Botao";
import { Cartao } from "../casca/Cartao";
import { Icone } from "../casca/Icone";
import { useDialogo } from "../casca/Dialogo";
import { iniciais, useSessao } from "../casca/usuario";

interface Membro {
  id: string;
  email: string;
  name: string;
  role: "owner" | "member";
  isActive: boolean;
  createdAt: string;
}

interface Equipe {
  organization: { id: string; name: string };
  plan: { name: string; seats: number; team: boolean };
  isOwner: boolean;
  seats: number;
  used: number;
  members: Membro[];
}

const CAMPO =
  "h-10 w-full rounded-xl border border-linha bg-painel-suave px-3 text-sm text-tinta" +
  " placeholder:text-tinta-apagada focus:border-[var(--accent-line)] focus:outline-none";

const ROTULO = "text-[11px] font-medium text-tinta-fraca";

/** A senha mínima do backend (`addMemberSchema`). Um CPF tem 11 dígitos, e passa. */
const SENHA_MINIMA = 8;

async function pedir(caminho: string, opcoes: RequestInit = {}) {
  const resposta = await fetch(`/api/sessao/equipe${caminho}`, {
    ...opcoes,
    headers: opcoes.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (resposta.status === 204) return null;
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    throw new Error(dados.message || "Não foi possível falar com o servidor.");
  }
  return dados;
}

export function Painel() {
  const { usuario } = useSessao();
  const dialogo = useDialogo();

  const [equipe, setEquipe] = useState<Equipe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erroDoFormulario, setErroDoFormulario] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setEquipe(await pedir(""));
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function criar(evento: FormEvent) {
    evento.preventDefault();
    if (nome.trim().length < 2) return setErroDoFormulario("Informe o nome do funcionário.");
    if (!email.includes("@")) return setErroDoFormulario("Informe um e-mail válido.");
    if (senha.length < SENHA_MINIMA) {
      return setErroDoFormulario(`A senha precisa ter ao menos ${SENHA_MINIMA} caracteres.`);
    }

    setCriando(true);
    setErroDoFormulario(null);
    try {
      await pedir("", { method: "POST", body: JSON.stringify({ nome, email, senha }) });
      setNome("");
      setEmail("");
      setSenha("");
      await carregar();
    } catch (e) {
      setErroDoFormulario((e as Error).message);
    } finally {
      setCriando(false);
    }
  }

  async function alternar(membro: Membro) {
    setOcupado(membro.id);
    try {
      await pedir(`/${membro.id}/ativo`, {
        method: "PATCH",
        body: JSON.stringify({ ativo: !membro.isActive }),
      });
      await carregar();
    } catch (e) {
      await dialogo.avisar((e as Error).message, { titulo: "Não deu certo" });
    } finally {
      setOcupado(null);
    }
  }

  async function excluir(membro: Membro) {
    const ok = await dialogo.confirmar(
      `O acesso de ${membro.name} (${membro.email}) será apagado. Para ele voltar, será preciso criar de novo.`,
      { titulo: "Excluir acesso", kicker: "PAINEL", confirmar: "Excluir" },
    );
    if (!ok) return;
    setOcupado(membro.id);
    try {
      await pedir(`/${membro.id}`, { method: "DELETE" });
      await carregar();
    } catch (e) {
      await dialogo.avisar((e as Error).message, { titulo: "Não deu certo" });
    } finally {
      setOcupado(null);
    }
  }

  if (!usuario) return null;

  /*
    Quem não é dono e chegou pelo endereço digitado: diz o porquê em vez de
    uma lista vazia. O backend recusaria qualquer ação de qualquer jeito.
  */
  if (usuario.papel !== "dono" || (equipe && !equipe.isOwner)) {
    return (
      <div className="mx-auto max-w-2xl py-2">
        <Cartao titulo="Só o administrador" icone="icones.svg#lock">
          <p className="m-0 text-[13px] leading-relaxed text-tinta-fraca">
            O painel de acessos é da conta que criou a empresa. Peça a ela para
            criar, desativar ou excluir acessos.
          </p>
        </Cartao>
      </div>
    );
  }

  const membros = equipe?.members ?? [];
  const semVaga = equipe ? equipe.used >= equipe.seats : false;
  const semEquipe = equipe ? !equipe.plan.team : false;

  return (
    <div className="mx-auto flex max-w-3xl flex-col py-2">
      {erro && (
        <div className="mb-3.5 flex items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-4 py-3 text-[13px] text-[var(--danger)]">
          <Icone referencia="icones.svg#triangle-alert" className="size-4 shrink-0" />
          <span className="flex-1">{erro}</span>
          <Botao tamanho="pequeno" jeito="fantasma" onClick={carregar}>Tentar de novo</Botao>
        </div>
      )}

      <Cartao
        titulo="Novo acesso"
        apoio="O funcionário entra no Optmize com este e-mail e esta senha, e o CNPJ ou CPF da empresa."
        icone="icones.svg#user-plus"
      >
        {semEquipe ? (
          <p className="m-0 text-[13px] leading-relaxed text-tinta-fraca">
            O plano <strong className="text-tinta">{equipe!.plan.name}</strong> não
            permite funcionários. Fale com a CodeEx para mudar de plano.
          </p>
        ) : (
          <form onSubmit={criar} className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className={ROTULO}>Nome</span>
              <input
                className={CAMPO}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Maria Souza"
                autoComplete="off"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={ROTULO}>E-mail</span>
              <input
                className={CAMPO}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="maria@grafica.com"
                autoComplete="off"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className={ROTULO}>Senha</span>
              <input
                className={CAMPO}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Ex.: o CPF dele"
                autoComplete="new-password"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
              <Botao
                type="submit"
                jeito="primario"
                disabled={criando || semVaga}
                icone={<Icone referencia="icones.svg#plus" className="size-4" />}
              >
                {criando ? "Criando…" : "Criar acesso"}
              </Botao>
              {equipe && (
                <span className="font-mono text-[11px] tracking-[0.06em] text-tinta-apagada uppercase">
                  {equipe.used} de {equipe.seats} acessos em uso
                </span>
              )}
              {erroDoFormulario && (
                <span className="text-[13px] text-[var(--danger)]">{erroDoFormulario}</span>
              )}
              {semVaga && !erroDoFormulario && (
                <span className="text-[13px] text-tinta-fraca">
                  Todas as vagas do plano estão em uso. Exclua um acesso para criar outro.
                </span>
              )}
            </div>
          </form>
        )}
      </Cartao>

      <Cartao
        titulo="Acessos"
        apoio={equipe ? `${equipe.organization.name} · ${equipe.plan.name}` : "Carregando…"}
        icone="icones.svg#users"
      >
        {membros.length === 0 && equipe && (
          <p className="m-0 text-[13px] text-tinta-apagada">Nenhum acesso criado ainda.</p>
        )}
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {membros.map((membro) => {
            const dono = membro.role === "owner";
            return (
              <li
                key={membro.id}
                className={[
                  "flex items-center gap-3 rounded-xl border border-linha bg-painel-suave px-3 py-2.5",
                  membro.isActive || dono ? "" : "opacity-60",
                ].join(" ")}
              >
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-[9px] border border-[var(--accent-line)] bg-[var(--accent-soft)] font-mono text-[11px] font-semibold text-ambar"
                >
                  {iniciais(membro.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[14px] font-medium text-tinta">{membro.name}</p>
                  <p className="m-0 truncate text-[12px] text-tinta-fraca">{membro.email}</p>
                </div>

                <span
                  className={[
                    "shrink-0 rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.08em] uppercase",
                    dono
                      ? "bg-[var(--accent-soft)] text-ambar"
                      : membro.isActive
                        ? "bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)]"
                        : "bg-[var(--surface-hover)] text-tinta-apagada",
                  ].join(" ")}
                >
                  {dono ? "Administrador" : membro.isActive ? "Ativo" : "Desativado"}
                </span>

                {!dono && (
                  <span className="flex shrink-0 items-center gap-1">
                    <Botao
                      tamanho="pequeno"
                      jeito="secundario"
                      disabled={ocupado === membro.id}
                      onClick={() => alternar(membro)}
                    >
                      {membro.isActive ? "Desativar" : "Ativar"}
                    </Botao>
                    <BotaoDeIcone
                      title="Excluir acesso"
                      perigoso
                      disabled={ocupado === membro.id}
                      onClick={() => excluir(membro)}
                    >
                      <Icone referencia="icones.svg#trash" className="size-4" />
                    </BotaoDeIcone>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Cartao>
    </div>
  );
}
