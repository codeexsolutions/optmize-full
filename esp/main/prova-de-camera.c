/*
 * ===========================================================================
 * PROVA DE CAMERA — o que ela é, e o que ela sabe entregar
 * ===========================================================================
 *
 * A camera do usuario e USB, ligada na porta USB-OTG. Nao e a OV5647 do
 * conector flat: o conector `CAMERA` desta placa esta vazio. Sao dois caminhos
 * completamente diferentes no software -- a do flat entra por MIPI-CSI, esta
 * aqui por pilha USB host mais o driver UVC.
 *
 * ---------------------------------------------------------------------------
 * POR QUE COMECAR LISTANDO, E NAO MOSTRANDO
 * ---------------------------------------------------------------------------
 *
 * A tentacao e ir direto ao video na tela. Mas "camera comum" nao quer dizer
 * "camera que serve": webcam de computador costuma oferecer YUY2 em 720p ou
 * mais, e isso e mais dado do que o USB do P4 entrega e mais memoria do que faz
 * sentido gastar por quadro. O que serve e MJPEG em resolucao modesta -- ja
 * comprimido pela propria camera.
 *
 * Entao esta prova PERGUNTA A CAMERA o que ela sabe fazer e imprime a lista
 * inteira: formato, resolucao e taxa de quadros. Com ela na mao se decide se da
 * para mostrar video, e em que modo -- em vez de tentar no escuro e ficar sem
 * saber se a culpa e do codigo, da camera ou da banda.
 *
 * Foi essa a licao do dia em que a tela nao subia: medir antes de tentar.
 *
 * ---------------------------------------------------------------------------
 * ALIMENTACAO
 * ---------------------------------------------------------------------------
 *
 * Quem alimenta a camera e a placa, pela USB-OTG. Se ela for gulosa demais,
 * pode nem enumerar -- e o sintoma disso e silencio, nao erro. Se nada
 * acontecer ao plugar, vale testar a camera num computador antes de suspeitar
 * do codigo.
 */

#include <stdio.h>
#include <string.h>

#include "esp_err.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "usb/usb_host.h"
#include "usb/uvc_host.h"

static const char *TAG = "camera";

/* Quantos modos cabem na lista que pedimos ao driver. */
#define MAXIMO_DE_MODOS 40

static const char *nome_do_formato(enum uvc_host_stream_format f)
{
    switch (f) {
    case UVC_VS_FORMAT_MJPEG:  return "MJPEG";
    case UVC_VS_FORMAT_YUY2:   return "YUY2";
    case UVC_VS_FORMAT_H264:   return "H.264";
    case UVC_VS_FORMAT_H265:   return "H.265";
    case UVC_VS_FORMAT_NV12:   return "NV12";
    case UVC_VS_FORMAT_DEFAULT: return "padrao";
    default: return "?";
    }
}

/*
 * O intervalo entre quadros vem em unidades de 100 ns -- a conta do UVC, nao
 * uma escolha nossa. 333333 unidades sao 33,3 ms, ou seja 30 quadros por
 * segundo.
 */
static unsigned quadros_por_segundo(uint32_t intervalo)
{
    if (intervalo == 0) {
        return 0;
    }
    return (unsigned)(10000000UL / intervalo);
}

static void listar_o_que_a_camera_oferece(uint8_t endereco, uint8_t indice)
{
    size_t quantos = 0;

    /* Com a lista nula, ele so conta -- e assim se sabe quanto alocar. */
    esp_err_t e = uvc_host_get_frame_list(endereco, indice, NULL, &quantos);
    if (e != ESP_OK) {
        ESP_LOGE(TAG, "nao consegui a lista de modos: %s", esp_err_to_name(e));
        return;
    }
    ESP_LOGI(TAG, "a camera oferece %u modos", (unsigned)quantos);

    if (quantos > MAXIMO_DE_MODOS) {
        ESP_LOGW(TAG, "mostrando so os primeiros %d", MAXIMO_DE_MODOS);
        quantos = MAXIMO_DE_MODOS;
    }

    static uvc_host_frame_info_t modos[MAXIMO_DE_MODOS];
    e = uvc_host_get_frame_list(endereco, indice, &modos, &quantos);
    if (e != ESP_OK) {
        ESP_LOGE(TAG, "nao consegui ler os modos: %s", esp_err_to_name(e));
        return;
    }

    ESP_LOGI(TAG, "---------------------------------------------");
    int serve = 0;
    for (size_t i = 0; i < quantos; i++) {
        const uvc_host_frame_info_t *m = &modos[i];
        const unsigned fps = quadros_por_segundo(m->default_interval);

        /*
         * O que "serve" aqui: MJPEG, porque vem comprimido da camera, e cabendo
         * na tela (1024x600) sem precisar reduzir. Fora disso da para usar,
         * mas custa banda e memoria que esta placa tem coisa melhor a fazer.
         */
        const bool bom = (m->format == UVC_VS_FORMAT_MJPEG)
                         && m->h_res <= 1024 && m->v_res <= 600;
        if (bom) {
            serve++;
        }

        ESP_LOGI(TAG, "  %-7s %4ux%-4u  %2u fps  %s",
                 nome_do_formato(m->format), m->h_res, m->v_res, fps,
                 bom ? "<<< serve" : "");
    }
    ESP_LOGI(TAG, "---------------------------------------------");

    if (serve > 0) {
        ESP_LOGI(TAG, "%d modo(s) servem: da para mostrar video na tela.", serve);
    } else {
        ESP_LOGW(TAG, "nenhum modo MJPEG que caiba na tela.");
        ESP_LOGW(TAG, "da para usar assim mesmo, mas custa banda e memoria;");
        ESP_LOGW(TAG, "uma camera com MJPEG em 640x480 resolveria melhor.");
    }
}

/* O driver avisa aqui quando alguem pluga uma camera. */
static void quando_conectar(const uvc_host_driver_event_data_t *evento, void *ctx)
{
    (void)ctx;
    if (evento->type != UVC_HOST_DRIVER_EVENT_DEVICE_CONNECTED) {
        return;
    }

    ESP_LOGI(TAG, "");
    ESP_LOGI(TAG, "=== CAMERA CONECTADA (endereco USB %u, stream %u) ===",
             evento->device_connected.dev_addr,
             evento->device_connected.uvc_stream_index);

    listar_o_que_a_camera_oferece(evento->device_connected.dev_addr,
                                  evento->device_connected.uvc_stream_index);
}

/*
 * A pilha USB precisa de alguem chamando `usb_host_lib_handle_events` sem
 * parar; sem essa tarefa nada e enumerado e o silencio parece "camera nao
 * funciona".
 */
static void tarefa_do_usb(void *arg)
{
    (void)arg;
    while (1) {
        uint32_t flags = 0;
        usb_host_lib_handle_events(portMAX_DELAY, &flags);
        if (flags & USB_HOST_LIB_EVENT_FLAGS_NO_CLIENTS) {
            usb_host_device_free_all();
        }
    }
}

void prova_de_camera(void)
{
    ESP_LOGI(TAG, "=== PROVA DE CAMERA USB ===");

    const usb_host_config_t usb = {
        .skip_phy_setup = false,
        .intr_flags = ESP_INTR_FLAG_LEVEL1,
    };
    esp_err_t e = usb_host_install(&usb);
    if (e != ESP_OK) {
        ESP_LOGE(TAG, "usb_host_install falhou: %s", esp_err_to_name(e));
        return;
    }

    if (xTaskCreatePinnedToCore(tarefa_do_usb, "usb", 4096, NULL, 5, NULL, 0) != pdPASS) {
        ESP_LOGE(TAG, "nao consegui subir a tarefa do USB");
        return;
    }

    const uvc_host_driver_config_t uvc = {
        .driver_task_stack_size = 6 * 1024,
        .driver_task_priority = 6,
        .xCoreID = 0,
        .create_background_task = true,
        .event_cb = quando_conectar,
        .user_ctx = NULL,
    };
    e = uvc_host_install(&uvc);
    if (e != ESP_OK) {
        ESP_LOGE(TAG, "uvc_host_install falhou: %s", esp_err_to_name(e));
        return;
    }

    ESP_LOGI(TAG, "pilha USB no ar. Plugue a camera na porta USB-OTG.");
    ESP_LOGI(TAG, "(se ela ja estiver plugada, tire e ponha de novo)");
}
