/**
 * ===========================================================================
 * A VOZ — o servidor fala, o terminal só toca
 * ===========================================================================
 *
 * O terminal de chão de fábrica tem uma caixa de som na saída SPK. Esta é a
 * peça que transforma texto em som para ela.
 *
 * ---------------------------------------------------------------------------
 * A VOZ É A DO WINDOWS, E ISSO É UMA ESCOLHA
 * ---------------------------------------------------------------------------
 *
 * `Microsoft Maria Desktop`, pt-BR, já instalada — conferido nesta máquina, não
 * suposto. Sintetizar por ela custa **zero dependência nova**: nem pacote npm,
 * nem modelo para baixar, nem chave de API, nem internet.
 *
 * Uma voz neural (Piper, ou serviço na nuvem) soaria melhor. Mas o que este
 * aparelho fala são nomes de arquivo e metragens, ditos por cima do barulho de
 * uma calandra — inteligibilidade importa, timbre não. E a Maria não deixa de
 * funcionar quando a internet cai, que é o que importa num galpão.
 *
 * Quando isso não bastar, o lugar de trocar é este arquivo. O terminal não
 * sabe nem quer saber quem falou.
 *
 * ---------------------------------------------------------------------------
 * PCM CRU, SEM CABEÇALHO
 * ---------------------------------------------------------------------------
 *
 * A resposta são amostras e nada mais: 16 kHz, 16 bits, um canal — exatamente o
 * que o codec do terminal quer receber.
 *
 * Nem WAV, nem MP3. Um WAV obrigaria a placa a pular 44 bytes de cabeçalho e a
 * torcer para que os campos fossem os esperados; um MP3 obrigaria a
 * decodificar. Mandar cru é o servidor fazer o trabalho que ele tem sobrando e
 * a placa fazer o que só ela pode: empurrar bytes para o alto-falante.
 *
 * ---------------------------------------------------------------------------
 * A MESMA FRASE NÃO SE SINTETIZA DUAS VEZES
 * ---------------------------------------------------------------------------
 *
 * Abrir o sintetizador do Windows custa uns 400 ms, e numa conferência de vinte
 * itens as mesmas palavras voltam o tempo todo — "metros", nomes de máquina,
 * números pequenos. O resultado fica em disco, nomeado pelo resumo do texto.
 *
 * O cache é por TEXTO INTEIRO e não por palavra: juntar pedaços gravados
 * separadamente dá aquela fala de robô de elevador, com a entonação errada em
 * cada emenda.
 */

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

/** O formato que o terminal toca sem converter nada. */
const TAXA = 16000;
const BITS = 16;
const CANAIS = 1;

/** Onde as falas já sintetizadas ficam. */
const PASTA = path.join(os.tmpdir(), "optmize-voz");

/**
 * Teto de texto.
 *
 * Existe para que uma chamada com um texto absurdo não vire um minuto de
 * PowerShell ocupado e alguns megabytes de PCM. O que este aparelho fala são
 * frases curtas; 300 caracteres já são o dobro da maior delas.
 */
const TEXTO_MAXIMO = 300;

function chaveDe(texto, voz) {
  return crypto.createHash("sha1").update(`${voz}|${texto}`).digest("hex").slice(0, 16);
}

/**
 * Sintetiza um texto e devolve o caminho do arquivo com as amostras.
 *
 * O PowerShell recebe o texto por VARIÁVEL DE AMBIENTE, e não dentro do script.
 * Texto de item vem do banco e pode ter aspas, cifrão, acento e crase — todos
 * significam alguma coisa para o PowerShell, e montar o comando por concatenação
 * seria deixar um nome de arquivo executar o que quisesse na máquina.
 */
function sintetizar(texto, voz = "Microsoft Maria Desktop") {
  return new Promise((resolve, reject) => {
    const limpo = String(texto || "").trim().slice(0, TEXTO_MAXIMO);
    if (!limpo) return reject(new Error("Nada para falar."));

    fs.mkdirSync(PASTA, { recursive: true });
    const cru = path.join(PASTA, `${chaveDe(limpo, voz)}.pcm`);
    if (fs.existsSync(cru)) return resolve(cru);

    const wav = `${cru}.wav`;
    const script = `
      Add-Type -AssemblyName System.Speech
      $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
      try { $s.SelectVoice($env:VOZ_NOME) } catch { }
      # VELOCIDADE NORMAL. Eu tinha posto um degrau abaixo, supondo que fala
      # lenta se entende melhor por cima do barulho da calandra. Medido: a
      # mesma frase leva 7,71 s em -1 e 6,92 s em 0 -- e fala arrastada não é
      # mais clara, é só mais longa. Numa conferência de vinte itens, aquele
      # degrau custava dezesseis segundos de espera por nada.
      $s.Rate = 0
      $f = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
             ${TAXA}, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
             [System.Speech.AudioFormat.AudioChannel]::Mono)
      $s.SetOutputToWaveFile($env:VOZ_ARQUIVO, $f)
      $s.Speak($env:VOZ_TEXTO)
      $s.Dispose()
    `;

    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { env: { ...process.env, VOZ_TEXTO: limpo, VOZ_ARQUIVO: wav, VOZ_NOME: voz }, timeout: 20000 },
      (erro) => {
        if (erro) return reject(new Error(`A síntese falhou: ${erro.message}`));
        if (!fs.existsSync(wav)) return reject(new Error("O sintetizador não escreveu nada."));

        /*
         * O cabeçalho sai aqui, uma vez, e não a cada tocada.
         *
         * 44 bytes é o tamanho do cabeçalho WAV canônico que o SAPI escreve.
         * Confere-se o "RIFF" antes de cortar: se um dia ele escrever outro
         * formato, é melhor falhar alto do que servir ruído para a caixa.
         */
        const dados = fs.readFileSync(wav);
        fs.unlinkSync(wav);
        if (dados.slice(0, 4).toString() !== "RIFF") {
          return reject(new Error("O sintetizador não escreveu um WAV."));
        }
        fs.writeFileSync(cru, dados.subarray(44));
        resolve(cru);
      },
    );
  });
}

/**
 * Como se lê um número de metros em voz alta.
 *
 * "8.49" vira "8 vírgula 5 metros", e não "oito ponto quatro nove". Duas
 * decisões dentro disso:
 *
 *   UMA CASA, porque é a precisão que importa na calandra — ninguém confere
 *   centímetro, e "oito vírgula quatro nove" é mais som para a mesma
 *   informação.
 *
 *   VÍRGULA, porque o sintetizador lê "8.5" em inglês como "eight point five".
 *   A palavra escrita por extenso tira a ambiguidade de vez.
 */
function metrosEmPalavras(metros) {
  const decimos = Math.round(Number(metros || 0) * 10);
  const inteiro = Math.floor(decimos / 10);
  const resto = decimos % 10;
  if (resto === 0) return `${inteiro} metros`;
  return `${inteiro} vírgula ${resto} metros`;
}

module.exports = { sintetizar, metrosEmPalavras, TAXA, BITS, CANAIS };
