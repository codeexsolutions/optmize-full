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
#include "freertos/idf_additions.h"
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

/*
 * O QUE O DRIVER RECLAMOU, anotado de dentro da tarefa do USB.
 *
 * `volatile` e nao mutex porque o callback de evento roda na tarefa do USB e
 * nao pode bloquear: tudo que ele faz e levantar a bandeira. Quem age e a
 * tarefa do video, no proprio ritmo dela.
 */
static volatile bool o_usb_reclamou;
static uvc_host_stream_config_t configuracao;

/*
 * O PEDIDO DE FOTO.
 *
 * A camera ja entrega MJPEG -- cada quadro E um arquivo JPEG inteiro --, e o
 * servidor quer JPEG. Entao fotografar aqui nao e codificar nada: e guardar uma
 * copia do proximo quadro que passar, antes de ele ser decodificado e jogado
 * fora.
 *
 * Re-codificar o quadro ja decodificado seria perder qualidade duas vezes e
 * gastar o decodificador para desfazer o que a camera acabou de fazer.
 */
static volatile bool querem_uma_foto;
static uint8_t *foto_guardada;
static size_t   foto_bytes;
static lv_obj_t *pai_do_video;      /* onde o aviso de reconexao aparece */
static lv_obj_t *rot_reconectando;

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

/*
 * O AVISO DE RECONEXAO, por cima do video.
 *
 * Existe porque sem ele a camera parando parece a placa travada: a imagem fica
 * congelada no ultimo quadro e nada muda mais. Um retangulo preto com "camera
 * caiu, reconectando" e a diferenca entre "quebrou" e "espera dois segundos".
 *
 * So pode ser chamado com a tranca da tela na mao.
 */
static void mostrar_reconectando(bool mostrar)
{
    if (!mostrar) {
        if (rot_reconectando != NULL) {
            lv_obj_delete(rot_reconectando);
            rot_reconectando = NULL;
        }
        return;
    }
    if (rot_reconectando != NULL || pai_do_video == NULL) {
        return;
    }
    rot_reconectando = lv_label_create(pai_do_video);
    lv_label_set_text(rot_reconectando, "procurando a camera...");
    lv_obj_set_style_text_color(rot_reconectando, COR_DESTAQUE, 0);
    lv_obj_set_style_text_font(rot_reconectando, &fonte_22, 0);
    lv_obj_set_style_text_align(rot_reconectando, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_bg_color(rot_reconectando, lv_color_black(), 0);
    lv_obj_set_style_bg_opa(rot_reconectando, LV_OPA_80, 0);
    lv_obj_set_style_pad_all(rot_reconectando, 20, 0);
    lv_obj_center(rot_reconectando);
}

static void anunciar_reconexao(bool mostrar)
{
    if (bsp_display_lock(100)) {
        mostrar_reconectando(mostrar);
        bsp_display_unlock();
    }
}

/*
 * POR AS COISAS NO LUGAR ANTES DE DESISTIR.
 *
 * Duas tentativas, da mais barata para a mais cara:
 *
 *   1. parar e comecar. Resolve quando o que travou foi a negociacao da
 *      transmissao -- o aparelho continua la, so parou de mandar.
 *
 *   2. fechar e abrir. Resolve quando o driver perdeu o fio da meada com o
 *      aparelho. Custa a enumeracao de novo, quase um segundo.
 *
 * Se as duas falharem, o aparelho provavelmente saiu da tomada de verdade, e
 * a proxima rodada tenta outra vez -- nao ha nada melhor a fazer do que
 * insistir devagar.
 */
static bool remendar_a_transmissao(const uvc_host_stream_config_t *conf)
{
    if (transmissao != NULL) {
        uvc_host_stream_stop(transmissao);
        vTaskDelay(pdMS_TO_TICKS(120));
        if (uvc_host_stream_start(transmissao) == ESP_OK) {
            ESP_LOGW(TAG, "transmissao reiniciada");
            return true;
        }

        const esp_err_t e = uvc_host_stream_close(transmissao);
        if (e != ESP_OK) {
            ESP_LOGE(TAG, "nao consegui fechar para reabrir: %s", esp_err_to_name(e));
        }
        transmissao = NULL;
    }

    if (uvc_host_stream_open(conf, pdMS_TO_TICKS(2000), &transmissao) != ESP_OK) {
        transmissao = NULL;
        return false;
    }
    if (uvc_host_stream_start(transmissao) != ESP_OK) {
        uvc_host_stream_close(transmissao);
        transmissao = NULL;
        return false;
    }
    ESP_LOGW(TAG, "transmissao reaberta do zero");
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

    /*
     * O CAO DE GUARDA DA CAMERA.
     *
     * A 30 quadros por segundo, um quadro chega a cada 33 ms. Tres segundos de
     * silencio nao e lentidao: e a transmissao morta.
     *
     * Ele existe porque a falha mais comum NAO AVISA. O driver chama o callback
     * de evento quando ha erro de transferencia ou o aparelho some, mas a
     * transmissao tambem para calada -- e ai a unica pista e a imagem
     * congelada no ultimo quadro, que de longe parece a placa travada.
     */
    const int SILENCIO_ATE_DESCONFIAR = 3000 / 200;   /* em voltas de 200 ms */
    int silencio = 0;
    int remendos = 0;

    while (rodando) {
        if (xQueueReceive(fila_de_quadros, &f, pdMS_TO_TICKS(200)) != pdTRUE) {
            if (!o_usb_reclamou && ++silencio < SILENCIO_ATE_DESCONFIAR) {
                continue;
            }
            o_usb_reclamou = false;
            silencio = 0;

            /*
             * Espera crescente entre tentativas, ate 5 s. Uma camera
             * desligada da tomada nao volta por insistencia rapida, e tentar
             * reabrir 30 vezes por minuto mantem o barramento ocupado e a
             * serial ilegivel justamente quando alguem precisa ler.
             */
            ESP_LOGW(TAG, "sem quadros ha 3 s -- remendando (tentativa %d)", remendos + 1);
            anunciar_reconexao(true);

            if (remendar_a_transmissao(&configuracao)) {
                remendos = 0;
                anunciar_reconexao(false);
            } else if (rodando) {
                remendos++;
                vTaskDelay(pdMS_TO_TICKS(remendos < 5 ? remendos * 1000 : 5000));
            }
            continue;
        }

        /*
         * A COPIA VEM ANTES DA DECODIFICACAO, e nao depois.
         *
         * Depois, o quadro ja foi devolvido ao driver e os bytes dele podem
         * estar sendo reescritos pela proxima transferencia do USB. Aqui eles
         * ainda sao nossos.
         */
        if (querem_uma_foto && foto_guardada == NULL) {
            uint8_t *copia = heap_caps_malloc(f->data_len, MALLOC_CAP_SPIRAM);
            if (copia != NULL) {
                memcpy(copia, f->data, f->data_len);
                foto_bytes = f->data_len;
                foto_guardada = copia;   /* por ultimo: e o que sinaliza pronto */
                ESP_LOGI(TAG, "foto guardada (%u bytes)", (unsigned)foto_bytes);
            } else {
                ESP_LOGW(TAG, "sem memoria para a foto");
            }
            querem_uma_foto = false;
        }

        silencio = 0;
        if (remendos != 0 || rot_reconectando != NULL) {
            remendos = 0;
            anunciar_reconexao(false);
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

    /*
     * ANTES DE SAIR, DEVOLVER OS QUADROS QUE SOBRARAM NA FILA.
     *
     * Isto nao e limpeza de boas maneiras: `uvc_host_stream_close` RECUSA
     * fechar -- ESP_ERR_INVALID_STATE -- enquanto houver quadro que o driver
     * emprestou e ninguem devolveu. O `chegou_um_quadro` devolve `false`
     * justamente para ficar com o quadro ate a tarefa acabar com ele; um
     * quadro parado na fila na hora de fechar e um emprestimo em aberto.
     *
     * Foi isso que fez a camera "parar do nada" depois que a conferencia
     * passou a fechar a transmissao a cada QR lido: com sorte a fila estava
     * vazia e fechava; sem sorte o fecho falhava calado, a transmissao velha
     * ficava pendurada, e a proxima abertura pegava um driver em estado
     * impossivel. Nada aparecia na tela -- so a imagem que nunca mais voltava.
     */
    const uvc_host_frame_t *sobrou = NULL;
    while (xQueueReceive(fila_de_quadros, &sobrou, 0) == pdTRUE) {
        if (transmissao != NULL) {
            uvc_host_frame_return(transmissao, (uvc_host_frame_t *)sobrou);
        }
    }

    /*
     * Quanto da pilha sobrou, uma vez, na saida. E a unica medida honesta do
     * quanto os 32 KB sao necessarios -- se um dia sobrar muito, da para
     * baixar; enquanto a `quirc` puser 9 KB de estrutura na pilha dela, nao.
     */
    ESP_LOGI(TAG, "saindo -- sobraram %u bytes de pilha",
             (unsigned)(uxTaskGetStackHighWaterMark(NULL)));

    tarefa = NULL;
    vTaskDeleteWithCaps(NULL);   /* WithCaps na criacao, WithCaps na morte */
}

static void evento_da_transmissao(const uvc_host_stream_event_data_t *ev, void *ctx)
{
    (void)ctx;
    /*
     * So levanta a bandeira -- isto roda na tarefa do USB, e trabalho pesado
     * aqui trava o barramento inteiro. Quem remenda e a tarefa do video.
     */
    if (ev->type == UVC_HOST_DEVICE_DISCONNECTED) {
        ESP_LOGW(TAG, "a camera foi desconectada");
        o_usb_reclamou = true;
    } else if (ev->type == UVC_HOST_TRANSFER_ERROR) {
        ESP_LOGW(TAG, "erro de transferencia no USB");
        o_usb_reclamou = true;
    } else if (ev->type == UVC_HOST_FRAME_BUFFER_OVERFLOW) {
        ESP_LOGW(TAG, "quadro maior que o buffer -- descartado");
    }
}

/* ------------------------------------------------------------- abrir */

/*
 * Poe o objeto de imagem dentro da moldura dada.
 *
 * Separado porque acontece em DOIS momentos: quando o video sobe, e quando ele
 * ja esta no ar e a tela em volta foi refeita.
 */
static void por_a_imagem_na_moldura(lv_obj_t *pai)
{
    bsp_display_lock(0);
    pai_do_video = pai;
    rot_reconectando = NULL;   /* o aviso, se havia, morreu com a moldura velha */
    imagem = lv_image_create(pai);
    lv_image_set_src(imagem, &descritor);
    /*
     * 211 de 256 e 82%: 800 viram 658, que cabe na moldura de 660. O LVGL
     * escala com numero inteiro sobre 256, entao e assim que se pede 82%.
     */
    lv_image_set_scale(imagem, 211);
    lv_obj_center(imagem);
    bsp_display_unlock();
}

esp_err_t video_da_camera_abrir(lv_obj_t *pai)
{
    if (rodando) {
        /*
         * JA NO AR, E A MOLDURA E OUTRA.
         *
         * Antes esta linha era `return ESP_OK` e mais nada -- e foi um defeito
         * de verdade, com nome e sintoma.
         *
         * Quem chama aqui acabou de refazer a tela com `lv_obj_clean`, o que
         * destruiu a moldura antiga E o objeto de imagem dentro dela. Devolver
         * "tudo certo" deixava `imagem` apontando para memoria ja liberada, e a
         * tarefa do video seguia escrevendo nela TRINTA VEZES POR SEGUNDO.
         *
         * O estrago aparecia longe: a placa travava com o cao de guarda
         * reclamando do LVGL, preso dentro do proprio alocador.
         *
         * Aparecia so ao CADASTRAR duas vezes seguidas, e a assimetria explica
         * tudo: bater ponto termina na tela inicial, que fecha o video antes de
         * limpar; cadastrar vai de camera para camera, e a moldura era trocada
         * com o video no ar.
         *
         * A transmissao USB nao se mexe -- fecha-la e reabri-la a cada troca de
         * tela seria um segundo de espera e desgaste de driver por nada. So o
         * objeto da tela e refeito.
         */
        /*
         * SEMPRE REFAZ, e nao so quando a moldura parece outra.
         *
         * Comparar `pai` com a moldura anterior seria natural e estaria errado:
         * o alocador do LVGL costuma devolver O MESMO ENDERECO para um objeto
         * do mesmo tamanho criado logo depois de um ser destruido. A moldura
         * nova teria o endereco da velha, a comparacao diria "e a mesma", e o
         * ponteiro de imagem continuaria pendurado -- exatamente o defeito que
         * esta funcao existe para fechar.
         *
         * Chamar `abrir` significa "ponha o video NESTA moldura". Quem chama
         * acabou de refazer a tela, entao o objeto antigo nunca sobrevive.
         */
        ESP_LOGI(TAG, "video ja no ar; refazendo a imagem na moldura nova");
        por_a_imagem_na_moldura(pai);
        return ESP_OK;
    }
    recebidos = mostrados = descartados = recusados = 0;

    /*
     * QUANTA MEMORIA SOBRA, ANOTADO ANTES DE PEDIR.
     *
     * Este bloco pede quase 2 MB de PSRAM em dois pedacos, e a transmissao
     * pede mais. Quando algo aqui falha, a tela dizia "camera nao encontrada"
     * -- uma mentira: a camera estava la, o que faltou foi memoria. Com os
     * numeros no log da para ver a diferenca sem adivinhar.
     */
    ESP_LOGI(TAG, "abrindo -- psram %u KB (bloco %u KB)  |  interna %u KB (bloco %u KB)",
             (unsigned)(heap_caps_get_free_size(MALLOC_CAP_SPIRAM) / 1024),
             (unsigned)(heap_caps_get_largest_free_block(MALLOC_CAP_SPIRAM) / 1024),
             (unsigned)(heap_caps_get_free_size(MALLOC_CAP_INTERNAL) / 1024),
             (unsigned)(heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL) / 1024));

    const jpeg_decode_engine_cfg_t motor = {
        .intr_priority = 0,
        .timeout_ms = 100,   /* a 30 fps um quadro tem 33 ms; 100 e folga */
    };
    esp_err_t ed = jpeg_new_decoder_engine(&motor, &decodificador);
    if (ed != ESP_OK) {
        /*
         * O P4 tem UM decodificador de JPEG, e a tela da arte tambem usa ele.
         * Se a arte ainda estiver decodificando quando alguem pede "outro
         * codigo", esta chamada falha -- e a culpa nao e da camera.
         */
        ESP_LOGE(TAG, "o decodificador de JPEG esta ocupado: %s", esp_err_to_name(ed));
        decodificador = NULL;
        return ed;
    }

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
            ESP_LOGE(TAG, "sem memoria para o quadro %d (pedi %u KB, maior bloco livre %u KB)",
                     i, (unsigned)(pedido / 1024),
                     (unsigned)(heap_caps_get_largest_free_block(MALLOC_CAP_SPIRAM) / 1024));
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

    por_a_imagem_na_moldura(pai);

    if (leitor_de_qr_iniciar(LARGURA_DO_VIDEO, ALTURA_DECODIFICADA) != ESP_OK) {
        ESP_LOGW(TAG, "sem leitor de QR -- o video segue normalmente");
    }

    /* --- a transmissao --- */

    fila_de_quadros = xQueueCreate(1, sizeof(uvc_host_frame_t *));
    if (fila_de_quadros == NULL) {
        video_da_camera_fechar();
        return ESP_ERR_NO_MEM;
    }

    /*
     * A CONFIGURACAO FICA GUARDADA. Reabrir a transmissao depois de uma queda
     * precisa dela exatamente igual, e a tarefa do video nao tem como
     * remonta-la sozinha.
     */
    configuracao = (uvc_host_stream_config_t) {
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
     * A PRIMEIRA TENTATIVA PODE FALHAR, E ISSO NAO E O FIM.
     *
     * Dois segundos de espera, e nao cinco: quem entrou no app esta olhando a
     * tela, e dizer logo que esta procurando e melhor que um retangulo preto
     * calado.
     *
     * Mas FALHAR AQUI NAO DESISTE MAIS. A versao anterior voltava com erro, a
     * tela escrevia "camera nao encontrada" e ficava assim para sempre -- so
     * sair do app e voltar trazia a imagem. E a falha mais comum era de
     * tempo, nao de hardware: a camera leva uns 4 segundos para se apresentar
     * no USB depois que a placa liga, e quem entra em Producao antes disso
     * pegava o "nao encontrada" com a camera perfeitamente viva do lado.
     *
     * Entao a tarefa sobe de qualquer jeito, e o cao de guarda dela assume: e
     * a mesma engrenagem que reergue a transmissao quando ela cai no meio do
     * uso. Um caminho so para "ainda nao apareceu" e "sumiu agora" -- nao dois.
     */
    esp_err_t e = uvc_host_stream_open(&configuracao, pdMS_TO_TICKS(2000), &transmissao);
    if (e != ESP_OK) {
        ESP_LOGW(TAG, "a camera nao respondeu ainda (%s) -- vou insistindo",
                 esp_err_to_name(e));
        transmissao = NULL;
        anunciar_reconexao(true);
    }

    rodando = true;
    /*
     * 32 KB, e a conta e da `quirc`, nao nossa.
     *
     * A `quirc_decode` declara `struct datastream ds` COMO VARIAVEL LOCAL, e
     * essa estrutura carrega `data[QUIRC_MAX_PAYLOAD]` -- 8896 bytes -- mais o
     * resto. Só ela passa de 9 KB de pilha, e ainda chama funcoes que empilham
     * por cima.
     *
     * Com 8 KB a placa reiniciava no instante em que um QR aparecia na frente
     * da camera -- e so nesse instante, porque sem candidato a `quirc_decode`
     * nunca e chamada. Na tela dava um quadro corrompido e um reinicio, sem
     * pista nenhuma do motivo.
     *
     * A licao, que ja tinha aparecido uma vez: tirar as NOSSAS estruturas da
     * pilha nao basta se a biblioteca poe as dela.
     */
    /*
     * A PILHA DESTA TAREFA MORA NA PSRAM, e nao na RAM interna.
     *
     * ---------------------------------------------------------------------
     * O QUE ACONTECIA
     * ---------------------------------------------------------------------
     *
     * Pilha de tarefa sai da RAM interna por padrao, e ela precisa dos 32 KB
     * EM UM PEDACO SO. Nesta placa o maior pedaco livre de RAM interna e 32 KB
     * mesmo parada -- a pilha do WiFi, o USB e o LVGL picam o resto. Ou seja:
     * o pedido cabia exatamente, sem um byte de folga.
     *
     * Ai a abertura da transmissao USB, uma linha antes, reserva os buffers
     * dela na RAM interna (tres transferencias ISOC de 12 KB). O maior pedaco
     * cai para 31 KB, e a criacao da tarefa falha:
     *
     *     interna livre 94 KB, maior bloco 31 KB   <- faltou 1 KB
     *
     * A tela dizia "camera nao encontrada", e mandava conferir o cabo USB de
     * uma camera ligada, enumerada e funcionando. Por um kilobyte.
     *
     * ---------------------------------------------------------------------
     * POR QUE A PSRAM RESOLVE, E NAO SO ADIA
     * ---------------------------------------------------------------------
     *
     * La ha 27 MB livres num bloco de 27 MB. Nao e folga maior: e sair de uma
     * disputa por um recurso escasso que outra gente -- WiFi, USB -- aperta
     * sem avisar. Diminuir a pilha para 16 KB tambem funcionaria hoje e
     * voltaria a falhar no dia em que o USB pedir mais.
     *
     * O custo e latencia: pilha na PSRAM e mais lenta que na interna. Aqui nao
     * pesa, porque 32 KB cabem folgados no cache L2 de 256 KB desta placa --
     * na pratica a pilha vive no cache, e a PSRAM so aparece na primeira
     * tocada em cada pagina.
     *
     * ATENCAO: tarefa criada com `WithCaps` TEM de morrer com
     * `vTaskDeleteWithCaps`. Com o `vTaskDelete` comum a pilha nunca e
     * liberada, e sao 32 KB por entrada no app.
     */
    if (xTaskCreatePinnedToCoreWithCaps(tarefa_do_video, "video", 32768, NULL, 4,
                                        &tarefa, 1, MALLOC_CAP_SPIRAM) != pdPASS) {
        ESP_LOGE(TAG, "nao coube a pilha da tarefa do video "
                      "(psram livre %u KB, maior bloco %u KB)",
                 (unsigned)(heap_caps_get_free_size(MALLOC_CAP_SPIRAM) / 1024),
                 (unsigned)(heap_caps_get_largest_free_block(MALLOC_CAP_SPIRAM) / 1024));
        rodando = false;
        video_da_camera_fechar();
        return ESP_ERR_NO_MEM;
    }

    if (transmissao != NULL) {
        e = uvc_host_stream_start(transmissao);
        if (e != ESP_OK) {
            /*
             * Abriu e nao comecou: devolve o que abriu e deixa o cao de guarda
             * tentar de novo. Manter uma transmissao aberta e parada seria
             * pior que nao ter nenhuma -- ela segura o aparelho, e a proxima
             * abertura falha por causa dela.
             */
            ESP_LOGW(TAG, "abriu mas nao comecou (%s) -- vou insistindo",
                     esp_err_to_name(e));
            uvc_host_stream_close(transmissao);
            transmissao = NULL;
            anunciar_reconexao(true);
        } else {
            ESP_LOGI(TAG, "video no ar (MJPEG %dx%d)", LARGURA_DO_VIDEO, ALTURA_DO_VIDEO);
        }
    }
    return ESP_OK;
}

/* ---------------------------------------------------------- fotografar */

/*
 * Espera o proximo quadro e devolve uma copia dele em JPEG.
 *
 * O BUFFER E DE QUEM PEDE: sao centenas de quilobytes de PSRAM, e esquecer o
 * `free` derruba a placa depois de algumas fotos, longe de onde o erro foi
 * cometido.
 *
 * BLOQUEIA ate um quadro passar. A 30 por segundo isso e um piscar de olhos --
 * mas se a camera estiver caida nao passa nenhum, e por isso ha prazo.
 */
esp_err_t video_da_camera_fotografar(uint8_t **jpeg, size_t *bytes, int prazo_ms)
{
    if (!rodando) {
        return ESP_ERR_INVALID_STATE;
    }
    if (foto_guardada != NULL) {
        free(foto_guardada);   /* sobra de um pedido que ninguem recolheu */
        foto_guardada = NULL;
    }

    querem_uma_foto = true;
    for (int esperou = 0; esperou < prazo_ms; esperou += 20) {
        if (foto_guardada != NULL) {
            *jpeg = foto_guardada;
            *bytes = foto_bytes;
            foto_guardada = NULL;   /* daqui em diante e de quem pediu */
            return ESP_OK;
        }
        vTaskDelay(pdMS_TO_TICKS(20));
    }

    querem_uma_foto = false;
    return ESP_ERR_TIMEOUT;
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
        /*
         * O RESULTADO DO FECHO IMPORTA. Ele falha com ESP_ERR_INVALID_STATE
         * quando algum quadro emprestado nao voltou -- e um fecho que falha
         * calado deixa a transmissao velha pendurada, com a proxima abertura
         * herdando a bagunca. A tarefa drena a fila antes de sair justamente
         * para isto nunca acontecer; se aparecer, o bug esta la e nao aqui.
         */
        const esp_err_t e = uvc_host_stream_close(transmissao);
        if (e != ESP_OK) {
            ESP_LOGE(TAG, "o fecho da transmissao falhou: %s", esp_err_to_name(e));
        }
        transmissao = NULL;
    }
    if (fila_de_quadros != NULL) {
        vQueueDelete(fila_de_quadros);
        fila_de_quadros = NULL;
    }

    leitor_de_qr_parar();

    /* Morrem com a arvore de objetos; aqui so se soltam os ponteiros. */
    imagem = NULL;
    rot_reconectando = NULL;
    querem_uma_foto = false;
    if (foto_guardada != NULL) {
        free(foto_guardada);
        foto_guardada = NULL;
    }
    pai_do_video = NULL;
    o_usb_reclamou = false;

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
