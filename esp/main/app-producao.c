/*
 * ===========================================================================
 * APP DE PRODUCAO — a camera e o QR
 * ===========================================================================
 *
 * Abre a camera assim que entra, mostra o que ela ve e le codigos QR. O que for
 * lido aparece ao lado, como dados da ordem.
 *
 * Este arquivo e a TELA do app. Quem fala com a camera e `video-da-camera.c`;
 * quem le o QR e `leitor-de-qr.c`. A divisao importa: a camera continua
 * existindo sem esta tela (foi assim que ela nasceu, com a prova de painel), e
 * esta tela nao sabe nada de USB nem de JPEG.
 *
 * ---------------------------------------------------------------------------
 * LIGAR E DESLIGAR A CAMERA COM A TELA
 * ---------------------------------------------------------------------------
 *
 * A camera sobe ao entrar no app e cai ao sair. Sao quase 3 MB entre buffers de
 * quadro e a imagem do leitor, mais o trafego USB constante -- deixar isso vivo
 * atras de uma tela que ninguem esta olhando e gasto por nada.
 */

#include <stdio.h>
#include <string.h>

#include "esp_log.h"

#include "bsp/esp-bsp.h"
#include "interface.h"

static const char *TAG = "producao";

/* O video, ao lado (ver `video-da-camera.c`). */
esp_err_t video_da_camera_abrir(lv_obj_t *pai);
void video_da_camera_fechar(void);

/* O leitor de QR avisa aqui quando le alguma coisa (ver `leitor-de-qr.c`). */
void leitor_de_qr_avisar(void (*aviso)(const char *conteudo));

static lv_obj_t *rot_ordem;
static lv_obj_t *rot_conteudo;

/* ------------------------------------------------------- a leitura */

/*
 * Chamado pelo leitor quando um QR e decodificado.
 *
 * Roda na tarefa do video, nao na do LVGL -- por isso a tranca. E por isso
 * tambem que aqui so se escreve texto: qualquer coisa mais cara atrasaria o
 * proximo quadro.
 */
static void leu_um_codigo(const char *conteudo)
{
    if (rot_conteudo == NULL) {
        return;
    }
    ESP_LOGI(TAG, "QR: %s", conteudo);

    if (!bsp_display_lock(50)) {
        return;
    }
    lv_label_set_text(rot_ordem, "Codigo lido");
    lv_obj_set_style_text_color(rot_ordem, COR_CERTO, 0);
    lv_label_set_text(rot_conteudo, conteudo);
    bsp_display_unlock();
}

/* ------------------------------------------------------------ montagem */

void app_producao_montar(lv_obj_t *area)
{
    /*
     * A esquerda o video, a direita os dados. O video e 800x600 e a area util
     * tem 1024x544 -- entao ele entra reduzido, num quadro de 660 de largura,
     * e sobram 330 para a coluna da direita.
     */
    lv_obj_t *moldura = lv_obj_create(area);
    lv_obj_set_size(moldura, 660, 500);
    lv_obj_set_pos(moldura, 20, 22);
    lv_obj_set_style_bg_color(moldura, lv_color_black(), 0);
    lv_obj_set_style_border_color(moldura, COR_BORDA, 0);
    lv_obj_set_style_border_width(moldura, 1, 0);
    lv_obj_set_style_radius(moldura, 12, 0);
    lv_obj_set_style_pad_all(moldura, 0, 0);
    lv_obj_remove_flag(moldura, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *coluna = lv_obj_create(area);
    lv_obj_set_size(coluna, 300, 500);
    lv_obj_set_pos(coluna, 700, 22);
    lv_obj_set_style_bg_color(coluna, COR_CARTAO, 0);
    lv_obj_set_style_border_color(coluna, COR_BORDA, 0);
    lv_obj_set_style_border_width(coluna, 1, 0);
    lv_obj_set_style_radius(coluna, 14, 0);
    lv_obj_set_style_pad_all(coluna, 18, 0);
    lv_obj_remove_flag(coluna, LV_OBJ_FLAG_SCROLLABLE);

    rot_ordem = lv_label_create(coluna);
    lv_label_set_text(rot_ordem, "Aguardando QR");
    lv_obj_set_style_text_color(rot_ordem, COR_APOIO, 0);
    lv_obj_set_style_text_font(rot_ordem, &lv_font_montserrat_22, 0);
    lv_obj_set_pos(rot_ordem, 0, 0);

    rot_conteudo = lv_label_create(coluna);
    lv_label_set_text(rot_conteudo, "aponte o codigo da ordem\npara a camera");
    lv_obj_set_style_text_color(rot_conteudo, COR_TEXTO, 0);
    lv_obj_set_style_text_font(rot_conteudo, &lv_font_montserrat_16, 0);
    lv_label_set_long_mode(rot_conteudo, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(rot_conteudo, 264);
    lv_obj_set_pos(rot_conteudo, 0, 46);

    leitor_de_qr_avisar(leu_um_codigo);

    if (video_da_camera_abrir(moldura) != ESP_OK) {
        lv_obj_t *aviso = lv_label_create(moldura);
        lv_label_set_text(aviso, "camera nao encontrada\n\nligue-a na porta USB-OTG");
        lv_obj_set_style_text_color(aviso, COR_APOIO, 0);
        lv_obj_set_style_text_font(aviso, &lv_font_montserrat_22, 0);
        lv_obj_set_style_text_align(aviso, LV_TEXT_ALIGN_CENTER, 0);
        lv_obj_center(aviso);
        ESP_LOGW(TAG, "sem camera");
    }
}

void app_producao_desmontar(void)
{
    leitor_de_qr_avisar(NULL);
    video_da_camera_fechar();

    /* Os objetos morrem com a arvore; os ponteiros nao podem sobreviver a eles. */
    rot_ordem = NULL;
    rot_conteudo = NULL;
}
