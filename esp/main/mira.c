/*
 * ===========================================================================
 * AS PECAS QUE VARIAS TELAS USAM
 * ===========================================================================
 *
 * A mira e o checklist das telas de camera, o titulo de secao, e o cartao de
 * estado dos momentos que precisam de peso -- "nao passou", "conferido",
 * "ponto registrado".
 *
 * Elas moram juntas porque a alternativa e cada tela desenhar a sua versao, e
 * ai o mesmo aviso aparece com tres aparencias diferentes no mesmo aparelho.
 *
 * Producao aponta para um QR, Pontos aponta para um rosto, e as duas fazem a
 * pessoa resolver o mesmo problema: ONDE PONHO A COISA.
 *
 * ---------------------------------------------------------------------------
 * A MIRA NAO E ENFEITE
 * ---------------------------------------------------------------------------
 *
 * Um retangulo preto com video dentro nao diz onde mirar. A pessoa aproxima,
 * afasta, inclina, e descobre o enquadramento por tentativa -- o que leva
 * segundos toda vez, para sempre.
 *
 * Quatro cantos desenhados respondem isso de uma vez: o que tem de caber ali
 * dentro, cabe. E os cantos, e nao um retangulo fechado, porque a moldura
 * inteira taparia justamente a borda do que se esta tentando enquadrar.
 *
 * ---------------------------------------------------------------------------
 * O CHECKLIST, E POR QUE NAO UM PARAGRAFO
 * ---------------------------------------------------------------------------
 *
 * O texto corrido que havia antes -- "olhe para a camera, de frente e com o
 * rosto iluminado" -- ninguem le em pe, com pressa. Tres linhas curtas com um
 * marcador cada uma se leem de relance, e cada uma e UMA coisa a corrigir.
 *
 * Sao tres, e nao cinco: uma lista que passa do que a vista pega de uma vez
 * volta a ser paragrafo, so que com bolinhas.
 */

#include <stdio.h>

#include "interface.h"

/*
 * A GROSSURA E O TAMANHO DOS CANTOS.
 *
 * 4 pixels para a barra ler de longe sem virar moldura, e cantos de 52 -- pouco
 * menos de um quarto do lado menor da moldura. Cantos maiores que isso se
 * encontram no meio e viram retangulo; menores somem no video.
 */
#define GROSSURA  4
#define CANTO    52

static void barra_do_canto(lv_obj_t *pai, lv_color_t cor,
                           lv_align_t onde, int32_t dx, int32_t dy, int32_t w, int32_t h)
{
    lv_obj_t *b = lv_obj_create(pai);
    lv_obj_set_size(b, w, h);
    lv_obj_align(b, onde, dx, dy);
    lv_obj_set_style_bg_color(b, cor, 0);
    lv_obj_set_style_border_width(b, 0, 0);
    lv_obj_set_style_radius(b, 2, 0);
    lv_obj_set_style_pad_all(b, 0, 0);
    lv_obj_remove_flag(b, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(b, LV_OBJ_FLAG_CLICKABLE);   /* o video por baixo continua */
}

/*
 * Desenha os quatro cantos dentro da moldura dada.
 *
 * `folga` afasta a mira da borda da moldura. Colada na borda, ela parece parte
 * do proprio quadro e para de significar "mire aqui".
 */
void mira_desenhar(lv_obj_t *moldura, lv_color_t cor, int32_t folga)
{
    const struct { lv_align_t onde; int sx; int sy; } cantos[] = {
        { LV_ALIGN_TOP_LEFT,      1,  1 },
        { LV_ALIGN_TOP_RIGHT,    -1,  1 },
        { LV_ALIGN_BOTTOM_LEFT,   1, -1 },
        { LV_ALIGN_BOTTOM_RIGHT, -1, -1 },
    };

    for (int i = 0; i < 4; i++) {
        const int sx = cantos[i].sx;
        const int sy = cantos[i].sy;
        /* Cada canto sao duas barras: uma deitada e uma em pe, encostadas. */
        barra_do_canto(moldura, cor, cantos[i].onde, sx * folga, sy * folga, CANTO, GROSSURA);
        barra_do_canto(moldura, cor, cantos[i].onde, sx * folga, sy * folga, GROSSURA, CANTO);
    }
}

/*
 * Uma linha do checklist: um ponto da cor certa e o texto ao lado.
 *
 * O marcador e um circulo pequeno e nao um simbolo de certo. Certo verde diria
 * "isto ja esta feito", e o que estas linhas dizem e "faca isto" -- a pessoa
 * ainda nao fez nada quando le.
 */
void checklist_linha(lv_obj_t *pai, int32_t y, lv_color_t cor, const char *texto)
{
    lv_obj_t *ponto = lv_obj_create(pai);
    lv_obj_set_size(ponto, 8, 8);
    lv_obj_set_pos(ponto, 0, y + 7);
    lv_obj_set_style_radius(ponto, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(ponto, cor, 0);
    lv_obj_set_style_border_width(ponto, 0, 0);
    lv_obj_set_style_pad_all(ponto, 0, 0);
    lv_obj_remove_flag(ponto, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(ponto, LV_OBJ_FLAG_CLICKABLE);

    lv_obj_t *r = lv_label_create(pai);
    lv_label_set_text(r, texto);
    lv_obj_set_style_text_color(r, COR_APOIO, 0);
    lv_obj_set_style_text_font(r, &fonte_16, 0);
    lv_label_set_long_mode(r, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(r, 252);
    lv_obj_set_pos(r, 20, y);
}

/*
 * O titulo de bloco das colunas laterais.
 *
 * Maiuscula, corpo pequeno, cor de acento, com folga entre letras -- o mesmo
 * tratamento dos titulos de Ajustes e do Sobre. Um so jeito de dizer "aqui
 * comeca outra coisa", em todas as telas.
 */
void titulo_de_bloco(lv_obj_t *pai, int32_t y, const char *texto)
{
    lv_obj_t *t = lv_label_create(pai);
    lv_label_set_text(t, texto);
    lv_obj_set_style_text_color(t, COR_DESTAQUE, 0);
    lv_obj_set_style_text_font(t, &fonte_16, 0);
    lv_obj_set_style_text_letter_space(t, 2, 0);
    lv_obj_set_pos(t, 0, y);
}

/* ------------------------------------------------- o cartao de estado */

/*
 * UM MOMENTO QUE PRECISA DE PESO.
 *
 * Um cartao com a borda na cor do estado e um icone grande dentro de um
 * circulo. Vale para "nao passou", para "conferido" e para "ponto registrado" --
 * os tres sao instantes em que alguma coisa foi decidida, e todos merecem a
 * mesma forma.
 *
 * O ICONE MORA NUM CIRCULO DE FUNDO APAGADO, e nao solto. Solto, ele fica do
 * tamanho de uma letra grande e se confunde com texto; dentro do circulo ele
 * vira um sinal, e sinal se ve antes de se ler.
 *
 * A borda e fina. Uma borda grossa na cor do estado pintaria a tela inteira de
 * vermelho num "nao passou" -- e o que nao passou foi um item, nao o dia.
 */
lv_obj_t *cartao_de_estado(lv_obj_t *pai, int32_t x, int32_t y, int32_t w, int32_t h,
                           lv_color_t cor, const char *icone)
{
    lv_obj_t *c = lv_obj_create(pai);
    lv_obj_set_size(c, w, h);
    lv_obj_set_pos(c, x, y);
    lv_obj_set_style_bg_color(c, COR_CARTAO, 0);
    lv_obj_set_style_border_color(c, cor, 0);
    lv_obj_set_style_border_width(c, 1, 0);
    lv_obj_set_style_border_opa(c, LV_OPA_60, 0);
    lv_obj_set_style_radius(c, RAIO, 0);
    lv_obj_set_style_pad_all(c, 22, 0);
    lv_obj_remove_flag(c, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(c, LV_OBJ_FLAG_CLICKABLE);

    lv_obj_t *disco = lv_obj_create(c);
    lv_obj_set_size(disco, 56, 56);
    lv_obj_set_pos(disco, 0, 0);
    lv_obj_set_style_radius(disco, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(disco, cor, 0);
    lv_obj_set_style_bg_opa(disco, LV_OPA_20, 0);
    lv_obj_set_style_border_color(disco, cor, 0);
    lv_obj_set_style_border_width(disco, 1, 0);
    lv_obj_set_style_border_opa(disco, LV_OPA_50, 0);
    lv_obj_set_style_pad_all(disco, 0, 0);
    lv_obj_remove_flag(disco, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(disco, LV_OBJ_FLAG_CLICKABLE);

    lv_obj_t *simbolo = lv_label_create(disco);
    lv_label_set_text(simbolo, icone);
    lv_obj_set_style_text_color(simbolo, cor, 0);
    lv_obj_set_style_text_font(simbolo, &fonte_28, 0);
    lv_obj_center(simbolo);

    return c;
}

/* ------------------------------------------------- um par da ficha */

/*
 * ROTULO A ESQUERDA, VALOR A DIREITA, numa linha so.
 *
 * O rotulo em corpo pequeno e cor de apoio; o valor no corpo do texto. A
 * coluna do rotulo tem largura FIXA, e e isso que faz os valores alinharem uns
 * sob os outros -- rotulos de tamanhos diferentes com valor colado ao lado dao
 * uma coluna serrilhada que se le pior que um paragrafo.
 */
void par_da_ficha(lv_obj_t *pai, int32_t y, const char *rotulo, const char *valor,
                  int32_t largura)
{
    lv_obj_t *r = lv_label_create(pai);
    lv_label_set_text(r, rotulo);
    lv_obj_set_style_text_color(r, COR_FRACA, 0);
    lv_obj_set_style_text_font(r, &fonte_16, 0);
    lv_obj_set_pos(r, 0, y + 2);

    lv_obj_t *v = lv_label_create(pai);
    lv_label_set_text(v, (valor && valor[0]) ? valor : "--");
    lv_obj_set_style_text_color(v, (valor && valor[0]) ? COR_TEXTO : COR_FRACA, 0);
    lv_obj_set_style_text_font(v, &fonte_16, 0);
    lv_label_set_long_mode(v, LV_LABEL_LONG_DOT);
    lv_obj_set_width(v, largura - 92);
    lv_obj_set_pos(v, 92, y);
}
