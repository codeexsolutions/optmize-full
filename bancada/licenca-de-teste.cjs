/**
 * ===========================================================================
 * O TOKEN DAS CONFERÊNCIAS
 * ===========================================================================
 *
 * Desde que o programa passou a exigir token (ver `servidor/licenca.js`), toda
 * conferência que sobe o servidor precisa ativar um — senão a API responde 402
 * e a bancada reprova por licença, não pelo que ela foi escrita para conferir.
 *
 * E ela ativa pelo CAMINHO DE VERDADE: assina um token com a chave privada (a
 * mesma que o painel usa, guardada fora do projeto na máquina de quem
 * desenvolve), manda para `POST /api/licenca` e segue. Não existe atalho,
 * variável mágica nem modo de teste que pule a trava — um atalho desses seria,
 * no fim, uma porta aberta dentro do programa que o cliente também recebe.
 *
 * Numa máquina sem a chave — a de outro desenvolvedor, um servidor de
 * integração —, `temChave` devolve falso. Quem chamou decide: as conferências
 * deste projeto avisam e saem sem reprovar, que é o mesmo tratamento que já
 * dão à falta do Chrome do Puppeteer.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A ASSINATURA ESTÁ AQUI, E NÃO DENTRO DO PROGRAMA
 * ---------------------------------------------------------------------------
 *
 * Porque o programa NÃO SABE assinar, e é isso que o protege: quem tem o
 * programa não tem como emitir token. Esta bancada assina porque ela roda na
 * sua máquina, com a sua chave — exatamente como o painel faz.
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

/** Onde a chave privada mora. A mesma variável que o `optmize-backend` usa. */
const CAMINHO_DA_CHAVE = process.env.OPTMIZE_CHAVE_DE_LICENCA_ARQUIVO
  || path.join(os.homedir(), ".codeex-optmize", "chave-de-licenca.pem");

function temChave() {
  return fs.existsSync(CAMINHO_DA_CHAVE);
}

function base64url(bytes) {
  return Buffer.from(bytes).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Uma data AAAA-MM-DD daqui a N meses. */
function daquiAMeses(meses) {
  const data = new Date();
  data.setMonth(data.getMonth() + Number(meses || 12));
  return data.toISOString().slice(0, 10);
}

/**
 * Assina um token igual ao que o painel emite (ver
 * `optmize-backend/src/domain/offline-token.ts`).
 *
 * A assinatura é sobre o TEXTO base64url dos dados, e não sobre o JSON cru —
 * é esse texto que o programa confere.
 */
function emitirToken({ cliente = "Bancada", maquinas, expira = daquiAMeses(1), observacao }) {
  const privada = crypto.createPrivateKey(fs.readFileSync(CAMINHO_DA_CHAVE, "utf8"));

  const dados = {
    v: 1,
    id: crypto.randomBytes(8).toString("hex"),
    cliente,
    maquinas,
    emitido: new Date().toISOString().slice(0, 10),
    expira,
    ...(observacao ? { observacao } : {}),
  };

  const corpo = base64url(Buffer.from(JSON.stringify(dados), "utf8"));
  const assinatura = base64url(crypto.sign(null, Buffer.from(corpo, "utf8"), privada));
  return { token: `OPTMIZE1.${corpo}.${assinatura}`, dados };
}

/** Ativa uma instalação recém-subida. Devolve `true` se ficou liberada. */
async function ativar(base, opcoes = {}) {
  if (!temChave()) return false;

  const estado = await fetch(`${base}/api/licenca`).then((r) => r.json());
  const { token } = emitirToken({ maquinas: [estado.maquina], ...opcoes });

  const resposta = await fetch(`${base}/api/licenca`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  if (!resposta.ok) {
    const erro = await resposta.json().catch(() => ({}));
    throw new Error(`a bancada não conseguiu ativar a licença: ${erro.error || resposta.status}`);
  }
  return true;
}

/** O recado padrão de quem não tem a chave e vai sair sem reprovar. */
const SEM_CHAVE = `sem a chave de licença em ${path.basename(CAMINHO_DA_CHAVE)}`
  + " — pulando (não é reprovação).";

module.exports = { emitirToken, ativar, temChave, daquiAMeses, SEM_CHAVE, CAMINHO_DA_CHAVE };
