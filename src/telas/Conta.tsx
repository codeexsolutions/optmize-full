/**
 * ===========================================================================
 * CONTA — quem está usando, e de que empresa
 * ===========================================================================
 *
 * A tela que o pé da barra abre em "Configurações da conta".
 *
 * O QUE ELA MOSTRA HOJE é o que o programa realmente sabe: o nome de quem
 * entrou, a empresa a que a conta pertence e o papel dela. Nada disso se
 * edita aqui, e a tela diz isso em voz alta em vez de oferecer campos que não
 * salvam — um formulário que parece editável e não é custa mais confiança do
 * que a ausência dele.
 *
 * QUEM EDITA É O PAINEL WEB, e não por preguiça: trocar senha, criar
 * funcionário e escolher as telas de cada um são coisas da EMPRESA, não da
 * instalação. Fazê-las aqui significaria que a gráfica só consegue gerir a
 * própria equipe sentada na máquina em que o Optmize está instalado — e o dono
 * costuma estar em outra sala, ou em casa.
 *
 * O que falta para esta tela crescer está escrito no plano da identidade
 * (`docs/superpowers/plans/2026-09-21-identidade-no-full.md`): é o pedaço C,
 * o painel do dono.
 */

import { Icone } from "../casca/Icone";
import { useDialogo } from "../casca/Dialogo";
import { iniciais, useSessao } from "../casca/usuario";

/** Como o papel se chama em português, para quem não fala `owner`. */
const PAPEL: Record<string, string> = {
  owner: "Dono da empresa",
  dono: "Dono da empresa",
  admin: "Administrador",
  member: "Funcionário",
  operador: "Funcionário",
  leitor: "Somente leitura",
};

export function Conta() {
  /*
    A TELA LÊ A SESSÃO SOZINHA, e não a recebe de cima: as rotas montam o
    componente sem props (ver `Componente`, em rotas.ts), e inventar um caminho
    para passar o usuário até aqui custaria mais do que o pedido a mais. É uma
    tela que se abre raramente; um `GET /api/sessao/eu` nela não pesa.
  */
  const { usuario } = useSessao();
  const dialogo = useDialogo();

  /*
    SAIR daqui RECARREGA a página, e isso é de propósito.

    Esta tela tem a própria leitura da sessão, separada da que a casca usa para
    decidir entre o programa e o login. Avisar a casca exigiria um contexto
    compartilhado só para este botão. Recarregar resolve melhor: além de a
    casca reler a sessão do zero, TODO o trabalho em memória vai junto — as
    artes carregadas, o último encaixe, a lista de peças. Sair e deixar o
    trabalho da pessoa anterior na memória seria o erro pior.
  */
  async function sair() {
    const ok = await dialogo.confirmar(
      "Na próxima vez o Optmize vai pedir o seu e-mail e a sua senha de novo.",
      { titulo: "Sair da conta", kicker: "CONTA", confirmar: "Sair", perigoso: false },
    );
    if (!ok) return;
    try {
      await fetch("/api/sessao/sair", { method: "POST" });
    } finally {
      window.location.assign("/");
    }
  }

  if (!usuario) return null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 py-2">
      {/* QUEM ESTÁ USANDO. */}
      <div className="flex items-center gap-4 rounded-xl border border-linha bg-painel-suave p-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-xl border border-[var(--accent-line)] bg-[var(--accent-soft)] font-titulo text-lg font-semibold text-ambar">
          {iniciais(usuario.nome)}
        </span>
        <div className="min-w-0">
          <h2 className="m-0 truncate font-titulo text-lg font-semibold text-tinta">
            {usuario.nome}
          </h2>
          <p className="mt-0.5 mb-0 truncate text-[13px] text-tinta-fraca">
            {usuario.empresa || "Sem empresa vinculada"}
          </p>
          <p className="mt-1 mb-0 font-mono text-[11px] tracking-[0.06em] text-tinta-apagada uppercase">
            {PAPEL[usuario.papel] || usuario.papel}
          </p>
        </div>
      </div>

      {/*
        O QUE SE MUDA, E ONDE.

        Dizer o lugar é o serviço que esta tela presta hoje. Sem esta caixa, a
        pessoa procuraria o botão de trocar senha por toda a interface antes de
        desistir e telefonar.
      */}
      <div className="rounded-xl border border-linha bg-painel p-4">
        <span className="eyebrow">MUDANÇAS NA CONTA</span>
        <p className="mt-2 mb-0 text-[13px] leading-relaxed text-tinta-fraca">
          Os acessos dos funcionários — criar, desativar e excluir — ficam no
          botão <strong className="font-semibold text-tinta">Painel</strong>,
          logo acima do pé da barra, visível só para o administrador da
          empresa. Trocar a senha é feito no painel web da empresa.
        </p>
        <p className="mt-2 mb-0 text-[13px] leading-relaxed text-tinta-apagada">
          Não sabe o endereço do painel? Fale com quem cuida do Optmize na sua
          empresa.
        </p>
      </div>

      {/*
        SAIR, também aqui.

        É o mesmo botão do pé da barra, repetido de propósito: quem abre
        "Configurações da conta" procurando como sair não deveria ter de
        aprender que a saída fica noutro canto da tela.
      */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={sair}
          className="btn secondary flex w-fit items-center gap-2"
        >
          <Icone referencia="icones.svg#log-out" className="size-4" />
          Sair da conta
        </button>
        <p className="m-0 text-[12px] text-tinta-apagada">
          Na próxima vez o Optmize vai pedir o seu e-mail e a sua senha.
        </p>
      </div>
    </div>
  );
}
