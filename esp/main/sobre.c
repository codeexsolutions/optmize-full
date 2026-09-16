/*
 * ===========================================================================
 * O SOBRE — o que responder quando alguem liga perguntando
 * ===========================================================================
 *
 * Um circulo pequeno no canto da tela inicial, e atras dele a ficha do
 * aparelho.
 *
 * ---------------------------------------------------------------------------
 * PARA QUE ISTO EXISTE
 * ---------------------------------------------------------------------------
 *
 * Nao e vitrine. E a tela que alguem abre quando o terminal esta estranho e
 * precisa contar, por telefone, o que ele e. Toda linha daqui responde a uma
 * pergunta que ja foi feita nesta sala:
 *
 *   "qual versao esta gravada?"        -> a versao e a data da compilacao
 *   "ele esta na rede?"                -> a rede, o endereco e o servidor
 *   "esta sobrando memoria?"           -> PSRAM e interna, com o maior bloco
 *   "ha quanto tempo ele esta ligado?" -> o tempo de pe
 *
 * O MAIOR BLOCO LIVRE aparece ao lado do total de proposito. Os dois juntos
 * contam uma historia que nenhum conta sozinho: a camera falhou um dia inteiro
 * com 94 KB de RAM interna livre, porque o maior pedaco continuo era de 31 KB e
 * a pilha da tarefa precisava de 32.
 *
 * ---------------------------------------------------------------------------
 * O CIRCULO E PEQUENO DE PROPOSITO
 * ---------------------------------------------------------------------------
 *
 * Os tres cartoes da tela inicial sao o trabalho; isto e manutencao, e se abre
 * uma vez por mes. Um quarto cartao do mesmo tamanho diria que as quatro coisas
 * pesam igual, e fariam a fila da manha parar para ler um botao que ninguem vai
 * apertar.
 */

#include <stdio.h>
#include <string.h>

#include "esp_app_desc.h"
#include "esp_chip_info.h"
#include "esp_heap_caps.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_timer.h"

#include "bsp/esp-bsp.h"
#include "interface.h"
#include "optmize.h"

static const char *TAG = "sobre";

static lv_obj_t *cortina;

void sobre_fechar(void)
{
    if (cortina == NULL) {
        return;
    }
    /*
     * Apagar depois, e nao agora: quem chama e o toque no proprio botao de
     * fechar, que vive dentro desta cortina. Apagar o objeto que esta tratando
     * o evento deixa o LVGL trabalhando em memoria ja liberada.
     */
    lv_obj_delete_async(cortina);
    cortina = NULL;
}

static void tocou_fechar(lv_event_t *e)
{
    (void)e;
    sobre_fechar();
}

/* Uma linha da ficha: o que e, e o valor. */
static void linha(lv_obj_t *pai, int coluna, int *y, const char *rotulo, const char *valor)
{
    const int x = coluna * 496 + 24;

    lv_obj_t *r = lv_label_create(pai);
    lv_label_set_text(r, rotulo);
    lv_obj_set_style_text_color(r, COR_APOIO, 0);
    lv_obj_set_style_text_font(r, &fonte_16, 0);
    lv_obj_set_pos(r, x, *y);

    lv_obj_t *v = lv_label_create(pai);
    lv_label_set_text(v, valor);
    lv_obj_set_style_text_color(v, COR_TEXTO, 0);
    lv_obj_set_style_text_font(v, &fonte_16, 0);
    lv_label_set_long_mode(v, LV_LABEL_LONG_DOT);
    lv_obj_set_width(v, 290);
    lv_obj_set_pos(v, x + 170, *y);

    *y += 30;
}

/* O titulo de um bloco DENTRO de uma das duas colunas desta tela. */
static void titulo_da_coluna(lv_obj_t *pai, int coluna, int *y, const char *texto)
{
    lv_obj_t *t = lv_label_create(pai);
    lv_label_set_text(t, texto);
    lv_obj_set_style_text_color(t, COR_DESTAQUE, 0);
    lv_obj_set_style_text_font(t, &fonte_16, 0);
    lv_obj_set_style_text_letter_space(t, 2, 0);
    lv_obj_set_pos(t, coluna * 496 + 24, *y);
    *y += 28;
}

void sobre_mostrar(lv_obj_t *pai)
{
    sobre_fechar();

    cortina = lv_obj_create(pai);
    lv_obj_set_size(cortina, LV_PCT(100), LV_PCT(100));
    lv_obj_set_pos(cortina, 0, 0);
    lv_obj_set_style_bg_color(cortina, COR_FUNDO, 0);
    lv_obj_set_style_bg_opa(cortina, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(cortina, 0, 0);
    lv_obj_set_style_radius(cortina, 0, 0);
    lv_obj_set_style_pad_all(cortina, 0, 0);
    lv_obj_remove_flag(cortina, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *nome = lv_label_create(cortina);
    lv_label_set_text(nome, "Terminal Optmize");
    lv_obj_set_style_text_color(nome, COR_TEXTO, 0);
    lv_obj_set_style_text_font(nome, &fonte_28, 0);
    lv_obj_set_pos(nome, 24, 12);

    lv_obj_t *fechar = lv_button_create(cortina);
    lv_obj_set_size(fechar, 120, 48);
    lv_obj_align(fechar, LV_ALIGN_TOP_RIGHT, -20, 10);
    lv_obj_set_style_bg_color(fechar, COR_CARTAO, 0);
    lv_obj_set_style_border_color(fechar, COR_BORDA, 0);
    lv_obj_set_style_border_width(fechar, 1, 0);
    lv_obj_add_event_cb(fechar, tocou_fechar, LV_EVENT_CLICKED, NULL);
    lv_obj_t *rf = lv_label_create(fechar);
    lv_label_set_text(rf, "Fechar");
    lv_obj_set_style_text_font(rf, &fonte_16, 0);
    lv_obj_center(rf);

    char texto[96];

    /* ===================== coluna da esquerda: o programa ================ */

    int y = 62;
    titulo_da_coluna(cortina, 0, &y, "PROGRAMA");

    const esp_app_desc_t *app = esp_app_get_description();
    linha(cortina, 0, &y, "Versao", app->version);
    snprintf(texto, sizeof(texto), "%s  %s", app->date, app->time);
    linha(cortina, 0, &y, "Compilado em", texto);
    linha(cortina, 0, &y, "ESP-IDF", app->idf_ver);

    y += 12;
    titulo_da_coluna(cortina, 0, &y, "APARELHO");

    /*
     * A PLACA NAO E A DA ESPRESSIF, e dizer isso aqui nao e detalhe de
     * arquivo: quem for depurar este aparelho um dia vai procurar o BSP da
     * Function-EV-Board e achar os pinos da tela errados, como ja aconteceu.
     */
    linha(cortina, 0, &y, "Placa", "Waveshare ESP32-P4-WIFI6-Touch-LCD-7B");

    esp_chip_info_t chip;
    esp_chip_info(&chip);
    snprintf(texto, sizeof(texto), "ESP32-P4 rev v%d.%d, %d nucleo(s)",
             chip.revision / 100, chip.revision % 100, chip.cores);
    linha(cortina, 0, &y, "Chip", texto);

    snprintf(texto, sizeof(texto), "%dx%d, EK79007 por MIPI-DSI",
             (int)LV_HOR_RES, (int)LV_VER_RES);
    linha(cortina, 0, &y, "Tela", texto);
    linha(cortina, 0, &y, "Toque", "GT911");
    linha(cortina, 0, &y, "Audio", "ES8311 saida, ES7210 microfone");
    linha(cortina, 0, &y, "Camera", "USB UVC, MJPEG 800x600");

    /* ===================== coluna da direita: o estado ================== */

    y = 62;
    titulo_da_coluna(cortina, 1, &y, "REDE");

    linha(cortina, 1, &y, "Wi-Fi", rede_conectada() ? rede_nome_da_rede() : "sem rede");
    linha(cortina, 1, &y, "Endereco", rede_conectada() ? rede_endereco() : "--");

    uint8_t mac[6] = { 0 };
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    snprintf(texto, sizeof(texto), "%02X:%02X:%02X:%02X:%02X:%02X",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    linha(cortina, 1, &y, "MAC", texto);

    const char *servidor = optmize_servidor();
    linha(cortina, 1, &y, "Servidor", servidor[0] ? servidor : "nao configurado");
    linha(cortina, 1, &y, "Hora", rede_tem_hora() ? "acertada pela rede" : "sem hora certa");

    y += 12;
    titulo_da_coluna(cortina, 1, &y, "MEMORIA E TEMPO");

    /*
     * O TOTAL E O MAIOR BLOCO, lado a lado. Os dois juntos contam o que nenhum
     * conta sozinho: a camera falhou um dia inteiro com 94 KB de interna livre,
     * porque o maior pedaco continuo era de 31 KB e a pilha pedia 32.
     */
    snprintf(texto, sizeof(texto), "%u KB livres, maior bloco %u KB",
             (unsigned)(heap_caps_get_free_size(MALLOC_CAP_SPIRAM) / 1024),
             (unsigned)(heap_caps_get_largest_free_block(MALLOC_CAP_SPIRAM) / 1024));
    linha(cortina, 1, &y, "PSRAM", texto);

    snprintf(texto, sizeof(texto), "%u KB livres, maior bloco %u KB",
             (unsigned)(heap_caps_get_free_size(MALLOC_CAP_INTERNAL) / 1024),
             (unsigned)(heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL) / 1024));
    linha(cortina, 1, &y, "RAM interna", texto);

    const int64_t segundos = esp_timer_get_time() / 1000000;
    snprintf(texto, sizeof(texto), "%d dia(s), %02d:%02d:%02d",
             (int)(segundos / 86400), (int)((segundos % 86400) / 3600),
             (int)((segundos % 3600) / 60), (int)(segundos % 60));
    linha(cortina, 1, &y, "Ligado ha", texto);

    snprintf(texto, sizeof(texto), "%d%%", voz_volume());
    linha(cortina, 1, &y, "Volume da voz", texto);

    lv_obj_t *rodape = lv_label_create(cortina);
    lv_label_set_text(rodape,
        "O terminal nao guarda dado nenhum: tudo vem do Optmize, e volta para ele.");
    lv_obj_set_style_text_color(rodape, COR_APOIO, 0);
    lv_obj_set_style_text_font(rodape, &fonte_16, 0);
    lv_obj_align(rodape, LV_ALIGN_BOTTOM_LEFT, 24, -16);

    ESP_LOGI(TAG, "versao %s, compilado em %s %s", app->version, app->date, app->time);
}
