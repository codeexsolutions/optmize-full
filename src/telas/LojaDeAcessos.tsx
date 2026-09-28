/**
 * ===========================================================================
 * A LOJA DE ACESSOS — mais um acesso além do plano
 * ===========================================================================
 *
 * Aparece no Painel quando todas as vagas estão em uso. Dois caminhos, e a
 * escolha é de quem compra:
 *
 *   - PAGAR COM PIX: o QR sai aqui mesmo, e a vaga entra sozinha quando o
 *     banco confirma. A tela pergunta a cada 3 segundos; se a pessoa fechar
 *     antes, o backend confere a compra na próxima abertura do Painel;
 *   - PEDIR À CODEEX: vai um pedido para o painel da CodeEx, que libera a
 *     vaga e manda a cobrança pelo WhatsApp.
 *
 * O PREÇO VEM PRONTO DO BACKEND (`domain/acessos.ts`): o do plano dividido
 * pelos acessos que ele traz, proporcional até a renovação. Esta tela não
 * calcula dinheiro nenhum.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Botao } from "../casca/Botao";
import { Icone } from "../casca/Icone";

interface Loja {
  acessosDoPlano: number;
  acessosExtras: number;
  precoCheioCents: number;
  precoAgoraCents: number;
  proporcionalAte: string | null;
  pixDisponivel: boolean;
  pedidoPendente: { id: string; criadoEm: string } | null;
}

interface Cobranca {
  id: string;
  qrCode: string;
  qrCodeImage: string;
  amountCents: number;
}

async function pedir(caminho: string, opcoes: RequestInit = {}) {
  const resposta = await fetch(`/api/sessao/equipe/acessos${caminho}`, opcoes);
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(dados.message || "Não foi possível falar com o servidor.");
  return dados;
}

const reais = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

export function LojaDeAcessos({ aoLiberar }: { aoLiberar: () => void }) {
  const [loja, setLoja] = useState<Loja | null>(null);
  const [cobranca, setCobranca] = useState<Cobranca | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"pix" | "pedido" | null>(null);
  const [copiado, setCopiado] = useState(false);
  const liberou = useRef(aoLiberar);
  liberou.current = aoLiberar;

  const carregar = useCallback(async () => {
    try {
      setLoja(await pedir(""));
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Enquanto o QR está na tela: "já caiu?" a cada 3 segundos.
  useEffect(() => {
    if (!cobranca) return;
    const relogio = setInterval(async () => {
      try {
        const r = await pedir(`/compra/${encodeURIComponent(cobranca.id)}`);
        if (r.liberado) {
          setCobranca(null);
          liberou.current();
        } else if (r.status === "rejected" || r.status === "cancelled" || r.status === "expired") {
          setCobranca(null);
          setErro("O Pix expirou ou foi recusado. Gere outro.");
        }
      } catch {
        /* rede instável: pergunta de novo no próximo tique */
      }
    }, 3000);
    return () => clearInterval(relogio);
  }, [cobranca]);

  async function pagar() {
    setOcupado("pix");
    setErro(null);
    try {
      setCobranca(await pedir("/compra", { method: "POST" }));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  async function pedirACodeex() {
    setOcupado("pedido");
    setErro(null);
    try {
      await pedir("/pedido", { method: "POST" });
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(null);
    }
  }

  async function copiar() {
    if (!cobranca) return;
    try {
      await navigator.clipboard.writeText(cobranca.qrCode);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* sem área de transferência: o código está na tela para copiar à mão */
    }
  }

  if (!loja) {
    return erro ? <p className="m-0 text-[13px] text-[var(--danger)]">{erro}</p> : null;
  }

  return (
    <div className="mt-4 rounded-2xl border border-[var(--accent-line)] bg-[var(--accent-soft)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 flex items-center gap-2 text-sm font-semibold text-tinta">
            <Icone referencia="icones.svg#user-plus" className="size-4 text-ambar" />
            Mais um acesso
          </p>
          <p className="mt-1 mb-0 text-[12px] leading-relaxed text-tinta-fraca">
            {loja.acessosDoPlano} acessos vêm no plano
            {loja.acessosExtras > 0 && ` e ${loja.acessosExtras} já foram comprados à parte`}.{" "}
            {loja.proporcionalAte
              ? `Agora sai proporcional até a renovação (${data(loja.proporcionalAte)}); depois entra na fatura por ${reais(loja.precoCheioCents)}.`
              : `Cada acesso extra custa ${reais(loja.precoCheioCents)} por período do plano.`}
          </p>
        </div>
        <p className="m-0 shrink-0 font-titulo text-2xl font-semibold text-ambar">{reais(loja.precoAgoraCents)}</p>
      </div>

      {cobranca ? (
        <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          <img src={cobranca.qrCodeImage} alt="QR do Pix" className="size-44 shrink-0 rounded-xl bg-white p-2" />
          <div className="min-w-0 flex-1 space-y-2 text-[13px] text-tinta-fraca">
            <p className="m-0">
              Pague {reais(cobranca.amountCents)} pelo app do banco. A vaga entra sozinha assim que o
              pagamento cair.
            </p>
            <p className="m-0 flex items-center gap-2 font-mono text-[11px] text-ambar">
              <Icone referencia="icones.svg#loader-circle" className="size-3.5 animate-spin" />
              aguardando o pagamento…
            </p>
            <div className="flex flex-wrap gap-2">
              <Botao tamanho="pequeno" onClick={copiar}>
                {copiado ? "Copiado!" : "Copiar Pix copia e cola"}
              </Botao>
              <Botao tamanho="pequeno" jeito="fantasma" onClick={() => setCobranca(null)}>
                Fechar
              </Botao>
            </div>
          </div>
        </div>
      ) : loja.pedidoPendente ? (
        <p className="mt-3 mb-0 flex items-center gap-2 text-[13px] text-tinta-fraca">
          <Icone referencia="icones.svg#clock" className="size-4 text-ambar" />
          Pedido enviado à CodeEx em {data(loja.pedidoPendente.criadoEm)}. Ela libera a vaga e manda a
          cobrança pelo WhatsApp.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          {loja.pixDisponivel && (
            <Botao
              jeito="primario"
              disabled={ocupado !== null}
              onClick={pagar}
              icone={<Icone referencia="icones.svg#qr-code" className="size-4" />}
            >
              {ocupado === "pix" ? "Gerando o Pix…" : "Pagar com Pix"}
            </Botao>
          )}
          <Botao disabled={ocupado !== null} onClick={pedirACodeex}>
            {ocupado === "pedido" ? "Enviando…" : "Pedir à CodeEx"}
          </Botao>
        </div>
      )}

      {erro && <p className="mt-3 mb-0 text-[13px] text-[var(--danger)]">{erro}</p>}
    </div>
  );
}
