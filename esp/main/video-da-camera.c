/*
 * ===========================================================================
 * O VIDEO DA CAMERA
 * ===========================================================================
 *
 * A camera USB entrega MJPEG: cada quadro chega ja comprimido, como um arquivo
 * JPEG inteiro. O caminho ate o vidro tem tres pernas:
 *
 *     USB (MJPEG)  ->  decodificador de JPEG  ->  objeto de imagem do LVGL
 *
 * ---------------------------------------------------------------------------
 * POR QUE MJPEG, E NAO YUY2
 * ---------------------------------------------------------------------------
 *
 * A camera oferece os dois (ver `prova-de-camera.c`, que listou os 14 modos
 * dela). YUY2 e video cru: 800x600 a 30 quadros dariam 27 MB por segundo no
 * barramento USB, mais do que ele entrega. MJPEG sai comprimido DA CAMERA -- o
 * trabalho de compressao e dela, e pelo fio passa uma fracao disso.
 *
 * O preco e descomprimir aqui, e o P4 tem decodificador de JPEG EM HARDWARE.
 * Ele entrega RGB565, que e o formato da tela: nao ha conversao no meio.
 *
 * ---------------------------------------------------------------------------
 * ABRIR E FECHAR COM O APP
 * ---------------------------------------------------------------------------
 *
 * A PILHA USB sobe uma vez, na partida do programa, e fica: instalar e
 * desinstalar driver de USB a cada entrada no app seria pedir problema, e a
 * enumeracao demora.
 *
 * A TRANSMISSAO, nao. Ela abre ao entrar no app de Producao e fecha ao sair,
 * junto com os buffers -- sao quase 2 MB de quadro mais o trafego constante, e
 * nada disso tem razao de existir enquanto a tela mostra outra coisa.
 *
 * ---------------------------------------------------------------------------
 * QUEM DECODIFICA, E ONDE
 * ---------------------------------------------------------------------------
 *
 * Numa tarefa nossa, nunca no callback do driver. O callback roda na tarefa do
 * USB; decodificar ali a trava, e uma tarefa de driver parada 20 ms por quadro
 * monopoliza o nucleo -- na primeira versao o cao de guarda disparou por isso.
 *
 * A fila entre os dois tem UMA vaga. Quadro que chega enquanto o anterior ainda
 * decodifica e descartado: video ao vivo prefere perder quadro a acumular
 * atraso, e fila maior so faria a imagem ficar cada vez mais velha.
 */

#include <stdio.h>
#include <string.h>
#include <inttypes.h>

#include "driver/jpeg_decode.h"
#include "esp_cache.h"
#include "esp_check.h"
#include "esp_err.h"
#include "esp_heap_caps.h"
#include "esp_lcd_mipi_dsi.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "usb/uvc_host.h"

#include "bsp/esp-bsp.h"
#include "interface.h"

static const char *TAG = "video";

/* O leitor de QR, ao lado (ver `leitor-de-qr.c`). */
esp_err_t leitor_de_qr_iniciar(int w, int h);
void leitor_de_qr_parar(void);
void leitor_de_qr_olhar(const uint16_t *rgb565, int w);

/* O modo escolhido entre os que a camera oferece. Ver `prova-de-camera.c`. */
#define LARGURA_DO_VIDEO 800
#define ALTURA_DO_VIDEO  600
#define QUADROS_POR_SEGUNDO 30

/*
 * A ALTURA QUE O DECODIFICADOR USA, que nao e a da imagem.
 *
 * JPEG trabalha em blocos de 16 pixels de altura. 600 linhas dao 37,5 blocos,
 * entao ele arredonda para 38 e escreve 608 -- as oito ultimas sao sobra que
 * ninguem mostra, MAS SAO ESCRITAS. Reservar pelas 600 da imagem faz o
 * decodificador recusar todo quadro por falta de 800x8x2 bytes.
 */
#define ALTURA_DECODIFICADA (((ALTURA_DO_VIDEO + 15) / 16) * 16)

static jpeg_decoder_handle_t decodificador;
static uvc_host_stream_hdl_t transmissao;
static QueueHandle_t fila_de_quadros;
static TaskHandle_t tarefa;
static volatile bool rodando;

static uint8_t *quadro[2];
static size_t   quadro_bytes;
static int      exibindo;

static lv_obj_t *imagem;
static lv_image_dsc_t descritor;

static uint32_t recebidos, mostrados, descartados, recusados;

void video_da_camera_fechar(void);

/* ------------------------------------------------------- o quadro que chega */

static bool chegou_um_quadro(const uvc_host_frame_t *f, void *ctx)
{
    (void)ctx;
    if (!rodando) {
        return true;
    }
    recebidos++;

    /*
     * `false` significa "fico com o quadro": o driver nao o reusa ate alguem
     * chamar `uvc_host_frame_return`. Quem chama e a tarefa, depois de
     * decodificar. Fila cheia: devolve na hora com `true`.
     */
    if (xQueueSend(fila_de_quadros, &f, 0) == pdTRUE) {
        return false;
    }
    descartados++;
    return true;
}

static void tarefa_do_video(void *arg)
{
    (void)arg;
    const uvc_host_frame_t *f = NULL;

    const jpeg_decode_cfg_t cfg = {
        .output_format = JPEG_DECODE_OUT_FORMAT_RGB565,
        .rgb_order = JPEG_DEC_RGB_ELEMENT_ORDER_BGR,
        .conv_std = JPEG_YUV_RGB_CONV_STD_BT601,
    };

    while (rodando) {
        if (xQueueReceive(fila_de_quadros, &f, pdMS_TO_TICKS(200)) != pdTRUE) {
            continue;
        }

        const int destino = exibindo ^ 1;   /* pinta no que NAO esta na tela */
        uint32_t saiu = 0;
        esp_err_t e = jpeg_decoder_process(decodificador, &cfg, f->data, f->data_len,
                                           quadro[destino], quadro_bytes, &saiu);

        /* Devolver o quadro ao driver e obrigacao nossa, deu certo ou nao. */
        uvc_host_frame_return(transmissao, (uvc_host_frame_t *)f);

        if (e != ESP_OK) {
            /* USB perde pacote, a camera manda JPEG truncado. Descarta e segue. */
            recusados++;
            if (recusados % 60 == 1) {
                ESP_LOGW(TAG, "quadro recusado (%s) -- %" PRIu32 " de %" PRIu32,
                         esp_err_to_name(e), recusados, recebidos);
            }
            continue;
        }

        if (bsp_display_lock(50)) {
            if (imagem != NULL) {
                descritor.data = quadro[destino];
                lv_image_set_src(imagem, &descritor);
                lv_obj_invalidate(imagem);
            }
            exibindo = destino;
            bsp_display_unlock();
        }

        /*
         * O QR olha a imagem JA DECODIFICADA, depois de ela chegar na tela: a
         * leitura nao deve atrasar o que a pessoa ve.
         */
        leitor_de_qr_olhar((const uint16_t *)quadro[destino], LARGURA_DO_VIDEO);

        mostrados++;
        if (mostrados % 300 == 0) {
            ESP_LOGI(TAG, "%" PRIu32 " quadros  (%" PRIu32 " recebidos, %" PRIu32
                     " atrasados, %" PRIu32 " com defeito)",
                     mostrados, recebidos, descartados, recusados);
        }
    }

    tarefa = NULL;
    vTaskDelete(NULL);
}

static void evento_da_transmissao(const uvc_host_stream_event_data_t *ev, void *ctx)
{
    (void)ctx;
    if (ev->type == UVC_HOST_DEVICE_DISCONNECTED) {
        ESP_LOGW(TAG, "a camera foi desconectada");
    } else if (ev->type == UVC_HOST_TRANSFER_ERROR) {
        ESP_LOGW(TAG, "erro de transferencia no USB");
    }
}

/* ------------------------------------------------------------- abrir */

esp_err_t video_da_camera_abrir(lv_obj_t *pai)
{
    if (rodando) {
        return ESP_OK;
    }
    recebidos = mostrados = descartados = recusados = 0;

    const jpeg_decode_engine_cfg_t motor = {
        .intr_priority = 0,
        .timeout_ms = 100,   /* a 30 fps um quadro tem 33 ms; 100 e folga */
    };
    ESP_RETURN_ON_ERROR(jpeg_new_decoder_engine(&motor, &decodificador),
                        TAG, "nao consegui o decodificador de JPEG");

    /*
     * Os buffers vem do alocador DO DECODIFICADOR: ele resolve alinhamento e
     * cache do jeito que o periferico exige. Com memoria comum a imagem sai
     * rasgada, ou nao sai.
     */
    const jpeg_decode_memory_alloc_cfg_t mem = {
        .buffer_direction = JPEG_DEC_ALLOC_OUTPUT_BUFFER,
    };
    const size_t pedido = (size_t)LARGURA_DO_VIDEO * ALTURA_DECODIFICADA * 2;
    for (int i = 0; i < 2; i++) {
        quadro[i] = jpeg_alloc_decoder_mem(pedido, &mem, &quadro_bytes);
        if (quadro[i] == NULL) {
            ESP_LOGE(TAG, "sem memoria para o quadro %d", i);
            video_da_camera_fechar();
            return ESP_ERR_NO_MEM;
        }
        memset(quadro[i], 0, quadro_bytes);
    }

    /* --- a imagem na tela, reduzida para caber na moldura --- */

    descritor.header.magic = LV_IMAGE_HEADER_MAGIC;
    descritor.header.cf = LV_COLOR_FORMAT_RGB565;
    descritor.header.w = LARGURA_DO_VIDEO;
    descritor.header.h = ALTURA_DO_VIDEO;   /* a da IMAGEM, nao a decodificada */
    descritor.header.stride = LARGURA_DO_VIDEO * 2;
    descritor.data_size = (size_t)LARGURA_DO_VIDEO * ALTURA_DO_VIDEO * 2;
    descritor.data = quadro[0];

    bsp_display_lock(0);
    imagem = lv_image_create(pai);
    lv_image_set_src(imagem, &descritor);
    /*
     * 211 de 256 e 82%: 800 viram 658, que cabe na moldura de 660. O LVGL
     * escala com numero inteiro sobre 256, entao e assim que se pede 82%.
     */
    lv_image_set_scale(imagem, 211);
    lv_obj_center(imagem);
    bsp_display_unlock();

    if (leitor_de_qr_iniciar(LARGURA_DO_VIDEO, ALTURA_DECODIFICADA) != ESP_OK) {
        ESP_LOGW(TAG, "sem leitor de QR -- o video segue normalmente");
    }

    /* --- a transmissao --- */

    fila_de_quadros = xQueueCreate(1, sizeof(uvc_host_frame_t *));
    if (fila_de_quadros == NULL) {
        video_da_camera_fechar();
        return ESP_ERR_NO_MEM;
    }

    const uvc_host_stream_config_t conf = {
        .event_cb = evento_da_transmissao,
        .frame_cb = chegou_um_quadro,
        .usb = { .dev_addr = 0, .vid = 0, .pid = 0, .uvc_stream_index = 0 },
        .vs_format = {
            .h_res = LARGURA_DO_VIDEO,
            .v_res = ALTURA_DO_VIDEO,
            .fps = QUADROS_POR_SEGUNDO,
            .format = UVC_VS_FORMAT_MJPEG,
        },
        .advanced = {
            .number_of_frame_buffers = 3,
            .frame_size = 0,
            .frame_heap_caps = MALLOC_CAP_SPIRAM,
            .number_of_urbs = 3,
        },
    };

    /*
     * Dois segundos de espera, e nao cinco: quem entrou no app esta olhando a
     * tela. Se nao ha camera, e melhor dizer isso rapido do que deixar a pessoa
     * diante de um retangulo preto sem explicacao.
     */
    esp_err_t e = uvc_host_stream_open(&conf, pdMS_TO_TICKS(2000), &transmissao);
    if (e != ESP_OK) {
        ESP_LOGW(TAG, "nenhuma camera respondeu: %s", esp_err_to_name(e));
        video_da_camera_fechar();
        return e;
    }

    rodando = true;
    /*
     * 8 KB porque esta tarefa tambem chama o leitor de QR, e a `quirc` usa
     * pilha propria para decodificar.
     */
    if (xTaskCreatePinnedToCore(tarefa_do_video, "video", 8192, NULL, 4, &tarefa, 1) != pdPASS) {
        rodando = false;
        video_da_camera_fechar();
        return ESP_FAIL;
    }

    e = uvc_host_stream_start(transmissao);
    if (e != ESP_OK) {
        ESP_LOGE(TAG, "nao consegui iniciar a transmissao: %s", esp_err_to_name(e));
        video_da_camera_fechar();
        return e;
    }

    ESP_LOGI(TAG, "video no ar (MJPEG %dx%d)", LARGURA_DO_VIDEO, ALTURA_DO_VIDEO);
    return ESP_OK;
}

/* ------------------------------------------------------------ fechar */

void video_da_camera_fechar(void)
{
    /*
     * A ORDEM IMPORTA. Primeiro a tarefa para de trabalhar, depois a
     * transmissao fecha, e so entao os buffers somem. Invertido, a tarefa
     * acordaria com um quadro apontando para memoria ja liberada.
     */
    rodando = false;
    while (tarefa != NULL) {
        vTaskDelay(pdMS_TO_TICKS(20));   /* ela sai sozinha em ate 200 ms */
    }

    if (transmissao != NULL) {
        uvc_host_stream_stop(transmissao);
        uvc_host_stream_close(transmissao);
        transmissao = NULL;
    }
    if (fila_de_quadros != NULL) {
        vQueueDelete(fila_de_quadros);
        fila_de_quadros = NULL;
    }

    leitor_de_qr_parar();

    /* A imagem morre com a arvore de objetos; aqui so se solta o ponteiro. */
    imagem = NULL;

    for (int i = 0; i < 2; i++) {
        if (quadro[i] != NULL) {
            free(quadro[i]);
            quadro[i] = NULL;
        }
    }
    if (decodificador != NULL) {
        jpeg_del_decoder_engine(decodificador);
        decodificador = NULL;
    }
    exibindo = 0;
}
