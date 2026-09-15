/*
 * ===========================================================================
 * A PROVA DE AUDIO — o microfone desta placa existe?
 * ===========================================================================
 *
 * Diagnostico, nao produto. Responde uma pergunta so, e responde com numero.
 *
 * ---------------------------------------------------------------------------
 * POR QUE PERGUNTAR ANTES DE CONSTRUIR
 * ---------------------------------------------------------------------------
 *
 * O BSP deste projeto e o da placa da ESPRESSIF, copiado e corrigido a mao para
 * esta Waveshare. Os pinos da TELA estavam errados nele e custaram um dia
 * inteiro de tela preta -- reset no 33 e nao no 27, luz no 32 e invertida.
 *
 * Nada garante que os do AUDIO estejam certos. Construir um assistente de voz
 * em cima de um microfone que talvez nao exista seria repetir o mesmo dia.
 *
 * ---------------------------------------------------------------------------
 * DUAS PERGUNTAS, NESTA ORDEM
 * ---------------------------------------------------------------------------
 *
 * 1. O CODEC RESPONDE? Varre o I2C inteiro e diz quem atende. O ES8311 deveria
 *    estar em 0x30 (7 bits: 0x18). Se ninguem atender ali, o resto nao importa
 *    -- ou o pino esta errado, ou a placa nao tem codec.
 *
 * 2. ENTRA SOM? Le alguns segundos do microfone e imprime o nivel medido. Fala
 *    perto do aparelho tem de mexer o numero; silencio tem de deixa-lo baixo.
 *    Um nivel FIXO -- sempre zero, ou sempre no teto -- e pior que nenhum: quer
 *    dizer que o caminho esta ligado no lugar errado.
 */

#include <math.h>
#include <stdio.h>
#include <string.h>

#include "driver/i2c_master.h"
#include "esp_codec_dev.h"
#include "esp_codec_dev_defaults.h"
#include "esp_log.h"
#include "es7210_adc.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "bsp/esp-bsp.h"

static const char *TAG = "audio";

/*
 * 16 kHz, 16 bits, um canal.
 *
 * E o que o reconhecimento de fala quer -- o Whisper reamostra tudo para 16 kHz
 * de qualquer jeito, entao gravar em 48 seria carregar tres vezes mais bytes
 * pela rede para jogar dois tercos fora.
 */
#define TAXA        16000
#define BITS        16
#define CANAIS      1
#define QUANTO_LER  (TAXA / 10)   /* 100 ms por leitura */

/* --------------------------------------------------- quem atende no I2C */

static void varrer_o_i2c(void)
{
    ESP_LOGI(TAG, "varrendo o I2C (SDA %d, SCL %d)...", BSP_I2C_SDA, BSP_I2C_SCL);

    i2c_master_bus_handle_t barramento = NULL;
    if (i2c_master_get_bus_handle(BSP_I2C_NUM, &barramento) != ESP_OK || barramento == NULL) {
        ESP_LOGW(TAG, "o barramento I2C ainda nao subiu -- subindo");
        if (bsp_i2c_init() != ESP_OK ||
            i2c_master_get_bus_handle(BSP_I2C_NUM, &barramento) != ESP_OK) {
            ESP_LOGE(TAG, "nao consegui o barramento I2C");
            return;
        }
    }

    int quantos = 0;
    for (uint8_t endereco = 1; endereco < 0x7F; endereco++) {
        if (i2c_master_probe(barramento, endereco, 50) == ESP_OK) {
            const char *quem =
                endereco == 0x18 ? "  <-- ES8311, o codec de audio" :
                endereco == 0x5D ? "  <-- GT911, o toque" :
                endereco == 0x14 ? "  <-- GT911, o toque (endereco alternativo)" :
                endereco == 0x40 ? "  <-- expansor de pinos, talvez" : "";
            ESP_LOGI(TAG, "  0x%02X responde%s", endereco, quem);
            quantos++;
        }
    }
    if (quantos == 0) {
        ESP_LOGE(TAG, "  ninguem respondeu -- os pinos do I2C estao errados");
    }
}

/* ------------------------------------------------- o chip certo */

/*
 * O MICROFONE NAO E DO ES8311 NESTA PLACA. E de um ES7210.
 *
 * O BSP que este projeto carrega e o da placa da ESPRESSIF, e o
 * `bsp_audio_codec_microphone_init` dele monta um ES8311 -- o mesmo chip da
 * SAIDA. Com ele, a leitura abria sem erro nenhum e devolvia zeros exatos por
 * seis segundos seguidos. Nao era silencio: silencio num microfone de verdade
 * tem chiado, e chiado nao e zero. Era nao haver caminho de dados.
 *
 * A varredura do I2C mostrou tres aparelhos, e um deles respondia em 0x40. Eu
 * o rotulei como "expansor de pinos, talvez" -- e ele e o ES7210, um conversor
 * dedicado a microfones: `ES7210_CODEC_DEFAULT_ADDR` e 0x80 em oito bits, que
 * sao os mesmos 0x40 em sete.
 *
 * A confirmacao veio do firmware de fabrica guardado em `backup/`: "ES7210"
 * aparece dez vezes dentro dele.
 *
 * E a mesma historia dos pinos da tela, e pela mesma razao: o BSP descreve
 * OUTRA placa.
 */
static esp_codec_dev_handle_t abrir_o_microfone(void)
{
    /* Os relogios e a ligacao de I2S sao os do BSP, e esses conferem. */
    if (bsp_audio_init(NULL) != ESP_OK) {
        ESP_LOGW(TAG, "o I2S ja estava de pe, ou nao subiu");
    }

    audio_codec_i2c_cfg_t i2c_cfg = {
        .port = BSP_I2C_NUM,
        .addr = ES7210_CODEC_DEFAULT_ADDR,
        .bus_handle = bsp_i2c_get_handle(),
    };
    const audio_codec_ctrl_if_t *controle = audio_codec_new_i2c_ctrl(&i2c_cfg);
    if (controle == NULL) {
        ESP_LOGE(TAG, "nao consegui falar com o ES7210 por I2C");
        return NULL;
    }

    /*
     * OS QUATRO CANAIS, e nao so o primeiro.
     *
     * O ES7210 atende quatro microfones, e nao ha como saber daqui em qual
     * deles esta o desta placa. Ligar os quatro e a pergunta certa a fazer numa
     * prova: se algum tiver som, o nivel sobe. Escolher um e chutar, e um chute
     * errado aqui daria exatamente o mesmo zero de antes -- com a diferenca de
     * que eu ja teria trocado o chip e acharia que o problema era outro.
     */
    es7210_codec_cfg_t cfg = {
        .ctrl_if = controle,
        .master_mode = false,
        .mic_selected = ES7120_SEL_MIC1 | ES7120_SEL_MIC2 | ES7120_SEL_MIC3 | ES7120_SEL_MIC4,
        .mclk_src = ES7210_MCLK_FROM_PAD,
    };
    const audio_codec_if_t *es7210 = es7210_codec_new(&cfg);
    if (es7210 == NULL) {
        ESP_LOGE(TAG, "o ES7210 recusou a configuracao");
        return NULL;
    }

    esp_codec_dev_cfg_t aparelho = {
        .dev_type = ESP_CODEC_DEV_TYPE_IN,
        .codec_if = es7210,
        .data_if = bsp_audio_get_codec_itf(),
    };
    return esp_codec_dev_new(&aparelho);
}

/* -------------------------------------------------- sai som? */

/*
 * UM TOM NA CAIXA, para responder a outra metade da pergunta.
 *
 * A SAIDA e do ES8311 -- esse o BSP acerta, e ele respondeu em 0x18 na
 * varredura. O que pode nao acertar e o pino do amplificador
 * (`BSP_POWER_AMP_IO`, 53 aqui): sem ele ligado, o codec toca e ninguem ouve.
 *
 * O tom sobe e desce de proposito, em vez de ser uma nota so. Uma nota fixa e
 * facil de confundir com zumbido de fonte; uma que varia e inconfundivelmente
 * a placa falando.
 */
static void tocar_um_tom(void)
{
    esp_codec_dev_handle_t caixa = bsp_audio_codec_speaker_init();
    if (caixa == NULL) {
        ESP_LOGE(TAG, "o codec da saida nao subiu");
        return;
    }

    const esp_codec_dev_sample_info_t formato = {
        .bits_per_sample = BITS,
        .channel = 2,           /* o ES8311 sai em dois canais */
        .sample_rate = TAXA,
    };
    if (esp_codec_dev_open(caixa, (esp_codec_dev_sample_info_t *)&formato) != ESP_OK) {
        ESP_LOGE(TAG, "nao consegui abrir a saida");
        return;
    }
    esp_codec_dev_set_out_vol(caixa, 70);

    const int amostras = TAXA / 5;   /* 200 ms por nota */
    int16_t *onda = malloc(amostras * 2 * sizeof(int16_t));
    if (onda == NULL) {
        esp_codec_dev_close(caixa);
        return;
    }

    ESP_LOGI(TAG, "tocando quatro notas na caixa -- VOCE DEVE OUVIR");
    const int notas[] = { 440, 554, 659, 880 };
    for (int n = 0; n < 4; n++) {
        for (int i = 0; i < amostras; i++) {
            const double t = (double)i / TAXA;
            const int16_t v = (int16_t)(8000.0 * sin(2.0 * M_PI * notas[n] * t));
            onda[i * 2 + 0] = v;
            onda[i * 2 + 1] = v;
        }
        esp_codec_dev_write(caixa, onda, amostras * 2 * sizeof(int16_t));
    }

    free(onda);
    esp_codec_dev_close(caixa);
    ESP_LOGI(TAG, "as notas foram tocadas (se nao ouviu, o amplificador nao ligou)");
}

/* ------------------------------------------------------ entra som? */

void prova_de_audio(void)
{
    ESP_LOGI(TAG, "=== PROVA DE AUDIO ===");
    varrer_o_i2c();
    tocar_um_tom();

    esp_codec_dev_handle_t microfone = abrir_o_microfone();
    if (microfone == NULL) {
        ESP_LOGE(TAG, "o codec do microfone nao subiu -- nao ha entrada de audio");
        return;
    }

    const esp_codec_dev_sample_info_t formato = {
        .bits_per_sample = BITS,
        .channel = CANAIS,
        .sample_rate = TAXA,
    };
    esp_err_t e = esp_codec_dev_open(microfone, (esp_codec_dev_sample_info_t *)&formato);
    if (e != ESP_OK) {
        ESP_LOGE(TAG, "nao consegui abrir o microfone: %s", esp_err_to_name(e));
        return;
    }

    /*
     * O ganho do ES8311 vai ate 42 dB. 30 e alto o bastante para pegar alguem
     * falando a um metro e ainda nao ser so chiado -- e este numero e o que o
     * deslizante de Ajustes vai comandar quando esta prova virar produto.
     */
    esp_codec_dev_set_in_gain(microfone, 30.0);

    int16_t *pedaco = malloc(QUANTO_LER * sizeof(int16_t));
    if (pedaco == NULL) {
        ESP_LOGE(TAG, "sem memoria para o buffer");
        esp_codec_dev_close(microfone);
        return;
    }

    ESP_LOGI(TAG, "ouvindo por 10 segundos -- FALE PERTO DO APARELHO, alto");

    int mudou = 0;
    int menor = 32767, maior = 0;

    for (int volta = 0; volta < 100; volta++) {
        if (esp_codec_dev_read(microfone, pedaco, QUANTO_LER * sizeof(int16_t)) != ESP_OK) {
            ESP_LOGE(TAG, "a leitura falhou -- o caminho de dados nao esta de pe");
            break;
        }

        /*
         * RMS, e nao a amostra maior: um estalo isolado levanta o pico e nao
         * quer dizer que ha som entrando. A media quadratica e o que acompanha
         * uma voz.
         */
        double soma = 0;
        for (int i = 0; i < QUANTO_LER; i++) {
            soma += (double)pedaco[i] * pedaco[i];
        }
        const int nivel = (int)sqrt(soma / QUANTO_LER);

        if (nivel < menor) menor = nivel;
        if (nivel > maior) maior = nivel;

        if (volta % 5 == 0) {
            /* Uma barrinha, para dar para ver a voz subindo na serial. */
            char barra[41];
            int quantas = nivel / 200;
            if (quantas > 40) quantas = 40;
            memset(barra, '#', quantas);
            barra[quantas] = 0;
            ESP_LOGI(TAG, "  nivel %5d  %s", nivel, barra);
        }
        if (maior - menor > 300) {
            mudou = 1;
        }
    }

    free(pedaco);
    esp_codec_dev_close(microfone);

    ESP_LOGI(TAG, "---------------------------------------------");
    ESP_LOGI(TAG, "menor %d, maior %d", menor, maior);

    /*
     * TRES VEREDITOS, e o do meio custou uma leitura errada.
     *
     * Na primeira medida boa o nivel oscilou entre 82 e 281 com a sala em
     * silencio, e eu chamei isso de "nivel preso" porque exigia variacao de
     * 300 para dizer que havia som. Estava errado: isso e o PISO DE RUIDO de um
     * microfone vivo. Zero nao oscila -- a diferenca entre 82 e 281 ja e a
     * prova de que ha caminho de dados.
     *
     * O que distingue os casos nao e a variacao absoluta: e a RAZAO entre o
     * maior e o menor. Voz levanta o nivel varias vezes acima do piso.
     */
    if (maior == 0) {
        ESP_LOGE(TAG, "SILENCIO ABSOLUTO: chegam zeros. Nao ha caminho de dados.");
    } else if (menor > 0 && maior > menor * 3) {
        ESP_LOGI(TAG, "O MICROFONE FUNCIONA: o nivel subiu %dx acima do piso.",
                 maior / (menor > 0 ? menor : 1));
    } else {
        ESP_LOGI(TAG, "ENTRA SOM (piso de ruido entre %d e %d), mas nada alto.", menor, maior);
        ESP_LOGI(TAG, "Fale perto do aparelho durante a medida para confirmar a voz.");
    }
    (void)mudou;
    ESP_LOGI(TAG, "=============================================");
}
