/*
 * ===========================================================================
 * APP DE PONTOS — ainda nao existe
 * ===========================================================================
 *
 * Marcado no lugar de proposito. Um cartao na tela inicial que leva a uma tela
 * dizendo o que vai ser vale mais do que um cartao ausente: quem usa ve que o
 * sistema tem esse lugar, e quem programa sabe onde ele vai.
 */

#include "interface.h"

void app_pontos_montar(lv_obj_t *area)
{
    lv_obj_t *caixa = lv_obj_create(area);
    lv_obj_set_size(caixa, 600, 240);
    lv_obj_center(caixa);
    lv_obj_set_style_bg_color(caixa, COR_CARTAO, 0);
    lv_obj_set_style_border_color(caixa, COR_BORDA, 0);
    lv_obj_set_style_border_width(caixa, 1, 0);
    lv_obj_set_style_radius(caixa, 18, 0);
    lv_obj_remove_flag(caixa, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *simbolo = lv_label_create(caixa);
    lv_label_set_text(simbolo, LV_SYMBOL_LIST);
    lv_obj_set_style_text_color(simbolo, COR_APOIO, 0);
    lv_obj_set_style_text_font(simbolo, &lv_font_montserrat_48, 0);
    lv_obj_align(simbolo, LV_ALIGN_TOP_MID, 0, 20);

    lv_obj_t *rot = lv_label_create(caixa);
    lv_label_set_text(rot, "Em construcao");
    lv_obj_set_style_text_color(rot, COR_TEXTO, 0);
    lv_obj_set_style_text_font(rot, &lv_font_montserrat_28, 0);
    lv_obj_align(rot, LV_ALIGN_CENTER, 0, 20);

    lv_obj_t *sub = lv_label_create(caixa);
    lv_label_set_text(sub, "o apontamento de pontos entra aqui");
    lv_obj_set_style_text_color(sub, COR_APOIO, 0);
    lv_obj_set_style_text_font(sub, &lv_font_montserrat_16, 0);
    lv_obj_align(sub, LV_ALIGN_CENTER, 0, 60);
}

void app_pontos_desmontar(void)
{
    /* Nao segura nada: os objetos da tela a casca apaga sozinha. */
}
