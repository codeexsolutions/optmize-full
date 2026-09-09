/**
 * ===========================================================================
 * LICENÇA — acesso controlado, mesmo esquema de assinatura do OptimizePro
 * ===========================================================================
 *
 * Porte 1:1 do formato de código do OptimizePro (.NET) — mesmo payload de 8
 * bytes + assinatura ECDSA P-256/SHA-256 (64 bytes, r‖s "IEEE P1363") + Base32
 * Crockford — só a CHAVE é diferente (nunca reaproveitar a chave privada de
 * outro produto: se uma vazar, o outro continua seguro). Isso significa que a
 * MESMA ferramenta `Ferramentas/GeradorDeLicenca` do OptimizePro gera código
 * pra este produto também — só rodar `gerar-chave` de novo pra ter um par
 * próprio, e usar esse mesmo gerador daqui pra frente.
 *
 * Diferença de verdade pro OptimizePro: como este app PODE acessar internet,
 * a checagem de assinatura offline continua sendo a autoridade (nunca deixa
 * de funcionar sem rede) — mas quando há internet, `conferirRevogacaoOnline`
 * também confere se aquele código foi revogado (cliente inadimplente, código
 * vazado) num endpoint HTTP configurável. Falha de rede nunca bloqueia: é
 * reforço, não requisito (mesma regra "acelerador, não requisito" do resto do
 * sistema — ver README).
 *
 * Persistência local: o estado (qual código foi ativado + a marca d'água
 * "maior data já vista", contra relógio voltado pra trás) fica cifrado com
 * DPAPI do Windows (`CurrentUser`) — a mesma API que o OptimizePro usa, só
 * chamada via PowerShell em vez de C# direto, porque é Node. Decifrável só
 * pelo mesmo usuário Windows na mesma máquina: copiar o arquivo pra outra
 * máquina/usuário não copia o acesso.
 */

const crypto = require("crypto");
const fs = require("fs");
const { spawnSync } = require("child_process");
const { ARQUIVO_DE_LICENCA } = require("./caminhos");

// ---------------------------------------------------------------------------
// Chave pública — só confere assinatura, não forja. A privada NUNCA entra
// neste repositório: fica só na máquina de quem gera código pra vender,
// dentro de Ferramentas/GeradorDeLicenca do OptimizePro.
//
// ATENÇÃO: esta é uma chave de DEMONSTRAÇÃO (a mesma usada nos testes do
// OptimizePro durante o desenvolvimento) — troque por uma gerada só pra este
// produto (`GeradorDeLicenca gerar-chave`) antes de vender pra cliente real.
// ---------------------------------------------------------------------------
const CHAVE_PUBLICA_BASE64 =
  "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEPkgzpFF8sWdclY7ydb2m8iUzFnHoXtiJvcrBHbRH3U/+i0Am98uYSRoVMPcnZP4nOs69mkvLrQB9zX1fV1THXA==";

// Confere revogação online quando há valor aqui (ex.: "https://licencas.suaempresa.com").
// Vazio = checagem online desligada, só a assinatura offline vale (continua seguro,
// só não dá pra revogar um código já emitido antes dele vencer sozinho).
const URL_BASE_DE_REVOGACAO = process.env.OPTIMIZE_LICENCA_URL || "";

const ALFABETO_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const EPOCA_MS = Date.UTC(2025, 0, 1);
const VERSAO_ATUAL = 1;
const TAMANHO_PAYLOAD = 8;
const TAMANHO_ASSINATURA = 64;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** @typedef {"nunca-ativada"|"valida"|"expirada"|"relogio-suspeito"|"revogada"} SituacaoDaLicenca */

function decodificarBase32(texto) {
  const bytes = [];
  let buffer = 0;
  let bits = 0;

  for (const caractere of texto) {
    if (caractere === "-" || caractere === " ") continue;
    const valor = ALFABETO_BASE32.indexOf(caractere.toUpperCase());
    if (valor < 0) return null;

    buffer = (buffer << 5) | valor;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return Buffer.from(bytes);
}

/** Confere a assinatura e devolve os dados do código, ou `null` pra qualquer código inválido/adulterado — nunca lança. */
function verificarCodigo(codigoDigitado) {
  if (typeof codigoDigitado !== "string" || codigoDigitado.trim() === "") return null;

  const blob = decodificarBase32(codigoDigitado);
  if (!blob || blob.length !== TAMANHO_PAYLOAD + TAMANHO_ASSINATURA) return null;

  const payload = blob.subarray(0, TAMANHO_PAYLOAD);
  const assinatura = blob.subarray(TAMANHO_PAYLOAD);

  let valido;
  try {
    const chavePublica = crypto.createPublicKey({
      key: Buffer.from(CHAVE_PUBLICA_BASE64, "base64"),
      format: "der",
      type: "spki",
    });
    valido = crypto.verify("sha256", payload, { key: chavePublica, dsaEncoding: "ieee-p1363" }, assinatura);
  } catch {
    return null; // chave/assinatura mal formada — trata como código inválido, não crash
  }

  if (!valido) return null;
  if (payload[0] !== VERSAO_ATUAL) return null;

  const dias = (payload[2] << 8) | payload[3];
  const clienteIdHash = ((payload[4] << 24) | (payload[5] << 16) | (payload[6] << 8) | payload[7]) >>> 0;

  return {
    validoAte: new Date(EPOCA_MS + dias * MS_POR_DIA),
    clienteIdHash,
    tipo: payload[1] === 1 ? "teste" : "pago",
  };
}

// ---------------------------------------------------------------------------
// Persistência local cifrada (DPAPI via PowerShell)
// ---------------------------------------------------------------------------

function rodarPowerShell(scriptPs, entradaBase64) {
  const comandoCodificado = Buffer.from(scriptPs, "utf16le").toString("base64");
  const resultado = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", comandoCodificado],
    { input: entradaBase64, encoding: "utf8", timeout: 5000 }
  );

  if (resultado.error || resultado.status !== 0) {
    throw new Error(`PowerShell (DPAPI) falhou: ${resultado.stderr || resultado.error || resultado.status}`);
  }
  return resultado.stdout.trim();
}

function protegerDpapi(textoClaro) {
  const script = `
Add-Type -AssemblyName System.Security
$bytes = [Convert]::FromBase64String([Console]::In.ReadToEnd())
$protegido = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[Console]::Out.Write([Convert]::ToBase64String($protegido))
`;
  const entrada = Buffer.from(textoClaro, "utf8").toString("base64");
  return rodarPowerShell(script, entrada);
}

function desprotegerDpapi(base64Cifrado) {
  const script = `
Add-Type -AssemblyName System.Security
$bytes = [Convert]::FromBase64String([Console]::In.ReadToEnd())
$claro = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[Console]::Out.Write([Convert]::ToBase64String($claro))
`;
  const saidaBase64 = rodarPowerShell(script, base64Cifrado);
  return Buffer.from(saidaBase64, "base64").toString("utf8");
}

/** Nunca lança — arquivo ausente/corrompido/de outra máquina vira `null`, tratado como "nunca ativada". */
function lerEstadoPersistido() {
  try {
    if (!fs.existsSync(ARQUIVO_DE_LICENCA)) return null;
    const cifrado = fs.readFileSync(ARQUIVO_DE_LICENCA, "utf8");
    const json = desprotegerDpapi(cifrado);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function salvarEstadoPersistido(estado) {
  const cifrado = protegerDpapi(JSON.stringify(estado));
  fs.writeFileSync(ARQUIVO_DE_LICENCA, cifrado, "utf8");
}

// ---------------------------------------------------------------------------
// API pública do módulo
// ---------------------------------------------------------------------------

/** @returns {{ situacao: SituacaoDaLicenca, validoAte: Date|null, tipo: string|null, liberado: boolean }} */
function obterEstado() {
  const estadoSalvo = lerEstadoPersistido();
  if (!estadoSalvo) {
    return { situacao: "nunca-ativada", validoAte: null, tipo: null, liberado: false };
  }

  const info = verificarCodigo(estadoSalvo.codigo);
  if (!info) {
    return { situacao: "nunca-ativada", validoAte: null, tipo: null, liberado: false };
  }

  if (estadoSalvo.revogado) {
    return { situacao: "revogada", validoAte: info.validoAte, tipo: info.tipo, liberado: false };
  }

  const hoje = new Date();
  const maiorDataJaVista = estadoSalvo.maiorDataJaVista ? new Date(estadoSalvo.maiorDataJaVista) : hoje;

  if (hoje < maiorDataJaVista) {
    return { situacao: "relogio-suspeito", validoAte: info.validoAte, tipo: info.tipo, liberado: false };
  }

  // Marca d'água só avança — protege contra "voltar o relógio" pra reviver código vencido.
  if (hoje > maiorDataJaVista) {
    try {
      salvarEstadoPersistido({ ...estadoSalvo, maiorDataJaVista: hoje.toISOString() });
    } catch {
      /* falha ao regravar não derruba a checagem desta vez */
    }
  }

  if (hoje > info.validoAte) {
    return { situacao: "expirada", validoAte: info.validoAte, tipo: info.tipo, liberado: false };
  }

  return { situacao: "valida", validoAte: info.validoAte, tipo: info.tipo, liberado: true };
}

/** @returns {{ sucesso: boolean, mensagem: string }} */
function ativar(codigoDigitado) {
  const info = verificarCodigo(codigoDigitado);
  if (!info) {
    return { sucesso: false, mensagem: "Código inválido. Confira se copiou tudo certinho, sem espaço a mais." };
  }

  const hoje = new Date();
  if (hoje > info.validoAte) {
    return {
      sucesso: false,
      mensagem: `Este código venceu em ${info.validoAte.toLocaleDateString("pt-BR")}. Peça um código novo.`,
    };
  }

  try {
    salvarEstadoPersistido({ codigo: codigoDigitado, maiorDataJaVista: hoje.toISOString(), revogado: false });
  } catch (erro) {
    return { sucesso: false, mensagem: `Não deu pra salvar a ativação nesta máquina: ${erro.message}` };
  }

  return { sucesso: true, mensagem: `Licença ativada — válida até ${info.validoAte.toLocaleDateString("pt-BR")}.` };
}

/**
 * Reforço online, best-effort — nunca bloqueia por falta de rede (fail-open).
 * Só quando o servidor responde `{ "revogado": true }` de propósito é que o
 * código é marcado como revogado localmente (persistindo pra próxima checagem
 * offline também barrar, mesmo sem internet naquele momento).
 */
async function conferirRevogacaoOnline() {
  if (!URL_BASE_DE_REVOGACAO) return; // checagem desligada — sem URL configurada

  const estadoSalvo = lerEstadoPersistido();
  if (!estadoSalvo || !estadoSalvo.codigo) return;

  const controle = new AbortController();
  const tempoEsgotado = setTimeout(() => controle.abort(), 4000);

  try {
    const resposta = await fetch(
      `${URL_BASE_DE_REVOGACAO}/status?codigo=${encodeURIComponent(estadoSalvo.codigo)}`,
      { signal: controle.signal }
    );
    if (!resposta.ok) return;

    const corpo = await resposta.json();
    if (corpo && corpo.revogado === true && !estadoSalvo.revogado) {
      salvarEstadoPersistido({ ...estadoSalvo, revogado: true });
    } else if (corpo && corpo.revogado === false && estadoSalvo.revogado) {
      salvarEstadoPersistido({ ...estadoSalvo, revogado: false }); // servidor "perdoou" — reativa
    }
  } catch {
    // sem internet, servidor fora do ar, o que for — a checagem offline continua valendo sozinha
  } finally {
    clearTimeout(tempoEsgotado);
  }
}

module.exports = { obterEstado, ativar, conferirRevogacaoOnline, verificarCodigo };
