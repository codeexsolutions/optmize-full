/*
 * ===========================================================================
 * A VOZ — a placa fala o que o servidor sintetizou
 * ===========================================================================
 *
 * Quem transforma texto em som e o servidor (ver `servidor/voz.js`). Aqui so
 * chegam amostras prontas e elas vao para o alto-falante.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A PLACA NAO SINTETIZA
 * ---------------------------------------------------------------------------
 *
 * Sintetizar fala exige um motor e vozes -- dezenas de megabytes de modelo, e
 * um trabalho que o P4 faria devagar. Do outro lado ja ha um computador com uma
 * voz de portugues instalada no proprio Windows, sem custo nenhum.
 *
 * E ha uma razao melhor que o tamanho: MUDAR O QUE SE FALA passa a ser uma
 * linha no servidor em vez de uma regravacao de cada terminal. Incluir a
 * maquina na frase, tirar a metragem, dizer o cliente -- nada disso chega
 * aqui. E a mesma razao pela qual os motivos de reprovacao sairam do firmware.
 *
 * ---------------------------------------------------------------------------
 * CHEGAM AMOSTRAS, E NADA MAIS
 * ---------------------------------------------------------------------------
 *
 * 16 kHz, 16 bits, um canal, sem cabecalho. Nao ha o que decodificar nem o que
 * interpretar: os bytes que chegam da rede sao os bytes que vao para o codec.
 *
 * A UNICA conversao e mono para dois canais, porque o ES8311 quer dois -- e ela
 * e copiar cada amostra ao lado dela mesma.
 *
 * ---------------------------------------------------------------------------
 * FALAR POR CIMA NAO EMPILHA
 * ---------------------------------------------------------------------------
 *
 * Quem passa rapido por tres itens da conferencia nao quer ouvir os tres em
 * fila, um depois do outro, muito depois de ja estar olhando o quarto. Uma fala
 * nova CORTA a anterior: o nome que se ouve e sempre o do item que esta na
 * tela.
 */

#include <stdio.h>
#include <string.h>

#include "esp_codec_dev.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "nvs.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"

#include "bsp/esp-bsp.h"
#include "optmize.h"

static const char *TAG = "voz";

/* O formato que o servidor manda; ver `servidor/voz.js`. */
#define TAXA   16000
#define BITS   16

/*
 * O pedaco que se le da rede e se escreve no codec de uma vez.
 *
 * 4 KB sao 128 ms de fala em mono. Grande o bastante para a rede nao ser
 * chamada a cada instante, pequeno o bastante para uma fala cortada no meio
 * parar quase na hora -- e nao no fim do pedaco atual.
 */
#define PEDACO 4096

/*
 * O VOLUME, E POR QUE ELE COMECA ALTO.
 *
 * 75 era o padrao, e na gráfica saiu baixo demais -- o que faz sentido: este
 * aparelho fica em pe ao lado de uma calandra, nao numa mesa. Uma caixa
 * pequena a dois metros de distancia, competindo com o barulho de uma maquina,
 * precisa de quase todo o alcance que o codec tem.
 *
 * 90 e o novo padrao, e deixa margem para nao distorcer. Quem quiser mais ou
 * menos mexe em Ajustes, e a escolha fica na NVS -- alguem que abaixou o volume
 * na sexta nao quer o aparelho gritando na segunda.
 */
#define GAVETA        "voz"
#define VOLUME_PADRAO 90

static int volume = VOLUME_PADRAO;

static esp_codec_dev_handle_t caixa;
static volatile uint32_t geracao;      /* anda a cada fala nova */
static volatile bool falando;

/*
 * A VEZ DE ESCREVER NO CODEC.
 *
 * Existe por um defeito observado na serial: ao marcar um item e passar para o
 * seguinte, a fala nova nascia enquanto a anterior ainda estava saindo, e o
 * codec respondia "Input already open". A segunda fala entao escrevia 169 mil
 * bytes -- 5,3 segundos de audio -- em 200 milissegundos, ou seja, no vazio.
 *
 * Nao dava erro em lugar nenhum. Simplesmente ninguem ouvia o segundo item.
 *
 * Com a tranca, a fala nova ESPERA a anterior largar o codec. E como a anterior
 * ja foi avisada de que perdeu a vez, ela larga em menos de um pedaco -- 128
 * milissegundos no pior caso.
 */
static SemaphoreHandle_t a_vez;

/* --------------------------------------------------------- a partida */

esp_err_t voz_iniciar(void)
{
    if (caixa != NULL) {
        return ESP_OK;
    }
    caixa = bsp_audio_codec_speaker_init();
    if (caixa == NULL) {
        ESP_LOGE(TAG, "o codec da saida nao subiu -- a placa fica muda");
        return ESP_FAIL;
    }

    /*
     * O CODEC ABRE UMA VEZ E FICA ABERTO.
     *
     * Abrir e fechar a cada frase era o que criava a corrida com a frase
     * seguinte -- e nao ganhava nada em troca: o amplificador consome o mesmo
     * parado, e um aparelho que fala e feito para falar.
     */
    const esp_codec_dev_sample_info_t formato = {
        .bits_per_sample = BITS,
        .channel = 2,           /* o ES8311 sai em dois canais */
        .sample_rate = TAXA,
    };
    if (esp_codec_dev_open(caixa, (esp_codec_dev_sample_info_t *)&formato) != ESP_OK) {
        ESP_LOGE(TAG, "nao consegui abrir a saida");
        caixa = NULL;
        return ESP_FAIL;
    }
    /* O que ficou guardado da ultima vez que alguem mexeu em Ajustes. */
    nvs_handle_t g;
    if (nvs_open(GAVETA, NVS_READONLY, &g) == ESP_OK) {
        int32_t guardado = VOLUME_PADRAO;
        if (nvs_get_i32(g, "volume", &guardado) == ESP_OK) {
            volume = (int)guardado;
        }
        nvs_close(g);
    }
    esp_codec_dev_set_out_vol(caixa, volume);
    ESP_LOGI(TAG, "volume da voz: %d%%", volume);

    a_vez = xSemaphoreCreateMutex();
    if (a_vez == NULL) {
        ESP_LOGE(TAG, "sem memoria para a tranca da voz");
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "voz pronta");
    return ESP_OK;
}

int voz_volume(void)
{
    return volume;
}

/*
 * Muda o volume agora, e guarda para o proximo boot.
 *
 * A mudanca vale NA HORA -- inclusive no meio de uma frase que esteja saindo.
 * E o que permite arrastar o controle ouvindo o resultado, em vez de arrastar,
 * soltar, esperar a proxima fala e adivinhar.
 */
void voz_guardar_volume(int novo)
{
    if (novo < 0)   novo = 0;
    if (novo > 100) novo = 100;
    volume = novo;

    if (caixa != NULL) {
        esp_codec_dev_set_out_vol(caixa, volume);
    }

    nvs_handle_t g;
    if (nvs_open(GAVETA, NVS_READWRITE, &g) == ESP_OK) {
        nvs_set_i32(g, "volume", volume);
        nvs_commit(g);
        nvs_close(g);
    }
}

void voz_calar(void)
{
    geracao++;   /* quem estiver tocando vai ver que nao e mais o da vez */
}

bool voz_esta_falando(void)
{
    return falando;
}

/* ---------------------------------------------------------- tocar */

typedef struct {
    char caminho[200];
    uint32_t minha;
} Fala;

static void tarefa_da_fala(void *arg)
{
    Fala *f = arg;
    uint8_t *pedaco = NULL;
    int16_t *dois_canais = NULL;
    bool tem_a_vez = false;

    char url[288];
    snprintf(url, sizeof(url), "http://%s%s", optmize_servidor(), f->caminho);

    esp_http_client_config_t conf = {
        .url = url,
        .method = HTTP_METHOD_GET,
        .timeout_ms = 15000,
        .disable_auto_redirect = true,
    };
    esp_http_client_handle_t c = optmize_servidor()[0] ? esp_http_client_init(&conf) : NULL;
    if (c == NULL) {
        ESP_LOGW(TAG, "sem servidor configurado");
        goto fim;
    }

    if (esp_http_client_open(c, 0) != ESP_OK) {
        ESP_LOGW(TAG, "o servidor nao respondeu");
        goto limpa;
    }
    esp_http_client_fetch_headers(c);
    if (esp_http_client_get_status_code(c) != 200) {
        ESP_LOGW(TAG, "o servidor recusou falar (%d)", esp_http_client_get_status_code(c));
        goto fecha;
    }

    pedaco = malloc(PEDACO);
    dois_canais = malloc(PEDACO * 2);
    if (pedaco == NULL || dois_canais == NULL) {
        ESP_LOGE(TAG, "sem memoria para tocar");
        goto fecha;
    }

    /*
     * A VEZ, antes do primeiro byte. A anterior ja sabe que perdeu -- quem
     * chamou `falar_o_caminho` andou a geracao antes de criar esta tarefa --,
     * entao a espera aqui e de um pedaco no pior caso.
     */
    if (xSemaphoreTake(a_vez, pdMS_TO_TICKS(3000)) != pdTRUE) {
        ESP_LOGW(TAG, "a fala anterior nao largou a saida");
        goto fecha;
    }
    tem_a_vez = true;
    falando = true;

    int total = 0;
    while (f->minha == geracao) {
        const int lidos = esp_http_client_read(c, (char *)pedaco, PEDACO);
        if (lidos <= 0) {
            break;   /* acabou a fala, ou a conexao caiu */
        }

        /*
         * Mono vira dois canais copiando cada amostra ao lado dela mesma. O
         * `lidos` pode ser impar num fim de transferencia; a divisao inteira
         * descarta o meio byte, que nao vale um estalo no alto-falante.
         */
        const int amostras = lidos / 2;
        const int16_t *mono = (const int16_t *)pedaco;
        for (int i = 0; i < amostras; i++) {
            dois_canais[i * 2 + 0] = mono[i];
            dois_canais[i * 2 + 1] = mono[i];
        }
        esp_codec_dev_write(caixa, dois_canais, amostras * 2 * sizeof(int16_t));
        total += lidos;
    }

    if (f->minha != geracao) {
        ESP_LOGI(TAG, "fala cortada -- veio outra por cima");
    } else {
        ESP_LOGI(TAG, "falou %d bytes (%.1f s)", total, total / 2.0f / TAXA);
    }

fecha:
    esp_http_client_close(c);
limpa:
    esp_http_client_cleanup(c);
fim:
    if (tem_a_vez) {
        xSemaphoreGive(a_vez);
    }
    free(pedaco);
    free(dois_canais);
    falando = false;
    free(f);
    vTaskDelete(NULL);
}

/*
 * Toca o que estiver no caminho dado, cortando o que estiver tocando.
 *
 * O caminho e montado por quem chama para que esta funcao sirva as duas rotas
 * do servidor -- a que fala um texto qualquer e a que fala um item de producao
 * -- sem saber de nenhuma das duas.
 */
static void falar_o_caminho(const char *caminho)
{
    if (caixa == NULL && voz_iniciar() != ESP_OK) {
        return;
    }
    voz_calar();   /* a anterior perde a vez ANTES de a nova comecar */

    Fala *f = calloc(1, sizeof(*f));
    if (f == NULL) {
        return;
    }
    snprintf(f->caminho, sizeof(f->caminho), "%s", caminho);
    f->minha = geracao;

    /*
     * 4 KB de pilha bastam: esta tarefa nao chama nada que empilhe fundo -- o
     * cliente HTTP e o codec trabalham em buffers que vieram do monte.
     */
    if (xTaskCreate(tarefa_da_fala, "voz", 4096, f, 4, NULL) != pdPASS) {
        free(f);
    }
}

/* ----------------------------------------------------- o que se fala */

/*
 * Percentagem em URL, a mao.
 *
 * Nome de arte tem espaco, acento e virgula, e todos os tres quebram uma URL de
 * um jeito diferente. Escapar so o espaco -- que e a tentacao -- deixa passar o
 * resto e da uma requisicao cortada ao meio no primeiro nome com cedilha.
 */
static void escapar(const char *texto, char *saida, size_t cabe)
{
    static const char *HEX = "0123456789ABCDEF";
    size_t j = 0;
    for (size_t i = 0; texto[i] != 0 && j + 4 < cabe; i++) {
        const unsigned char c = (unsigned char)texto[i];
        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
            (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~') {
            saida[j++] = (char)c;
        } else {
            saida[j++] = '%';
            saida[j++] = HEX[c >> 4];
            saida[j++] = HEX[c & 0x0F];
        }
    }
    saida[j] = 0;
}

void voz_falar(const char *texto)
{
    char escapado[420];
    escapar(texto, escapado, sizeof(escapado));

    char caminho[460];
    snprintf(caminho, sizeof(caminho), "/api/voz/falar?texto=%s", escapado);
    falar_o_caminho(caminho);
}

void voz_falar_o_item(const char *item_id)
{
    char escapado[120];
    escapar(item_id, escapado, sizeof(escapado));

    char caminho[160];
    snprintf(caminho, sizeof(caminho), "/api/voz/producao?item=%s", escapado);
    falar_o_caminho(caminho);
}
