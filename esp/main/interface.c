/*
 * ===========================================================================
 * A CASCA — a barra de cima, a tela inicial e a troca de app
 * ===========================================================================
 *
 * O programa tem tres apps e uma casca em volta. A casca desenha a barra do
 * topo -- relogio, nome do que esta aberto, botao de voltar e o estado da rede
 * -- e guarda a area util para o app que estiver na frente.
 *
 * ---------------------------------------------------------------------------
 * MONTAR E DESMONTAR, EM VEZ DE MOSTRAR E ESCONDER
 * ---------------------------------------------------------------------------
 *
 * Trocar de app apaga os objetos do anterior e chama o `desmontar` dele. E mais
 * trabalho do que esconder, e e o certo: o app de Producao segura a camera, dois
 * buffers de quadro e o leitor de QR -- quase 3 MB. Deixar isso vivo atras de
 * uma tela que ninguem esta olhando seria gastar memoria e barramento por nada,
 * e a placa tem mais o que fazer.
 *
 * ---------------------------------------------------------------------------
 * O RELOGIO
 * ---------------------------------------------------------------------------
 *
 * Mostra tracos ate a hora chegar da rede. A placa nao tem relogio proprio em
 * uso -- ligada do zero ela acha que e 1970 --, e um relogio que mostra
 * 21:03 de 1970 com ar de certeza e pior que um que assume nao saber.
 */

#include <stdio.h>
#include <string.h>
#include <time.h>

#include "esp_heap_caps.h"
#include "esp_log.h"

#include "bsp/esp-bsp.h"
#include "interface.h"

static const char *TAG = "casca";

#define ALTURA_DA_BARRA 56

static lv_obj_t *area;          /* onde o app da vez desenha */
static lv_obj_t *rot_titulo;
static lv_obj_t *rot_relogio;
static lv_obj_t *rot_rede;
static lv_obj_t *sinal_de_rede;   /* o simbolo ao lado do relogio */
static lv_obj_t *botao_voltar;

/* Qual app esta aberto, para saber o que desmontar. */
static enum { NENHUM, PRODUCAO, PONTOS, AJUSTES } aberto = NENHUM;

static void abrir_inicio(void);

/* ---------------------------------------------------------- a barra */

/*
 * O PULSO NA SERIAL.
 *
 * Uma linha a cada 30 segundos, e so isso. Existe por uma pergunta que a
 * serial muda nao respondia: a placa esta congelada ou so parada esperando
 * alguem tocar? Sem o pulso, os dois casos sao identicos de fora -- e foi
 * exatamente esse silencio que atrasou a caca ao problema da camera.
 *
 * Sai da tarefa do LVGL de proposito: se ELA travar, o pulso para junto, e a
 * ausencia dele passa a significar alguma coisa.
 */
static void pulso(void)
{
    static int voltas;
    if (++voltas < 30) {
        return;
    }
    voltas = 0;
    /*
     * A MEMORIA INTERNA TAMBEM, e o maior bloco dela.
     *
     * Nao e curiosidade: a pilha da tarefa do video pede 32 KB DE UMA VEZ, e
     * pilha de tarefa so pode sair da RAM interna. Com 147 KB livres no total
     * mas picados, esse pedido falha -- e a tela dizia "camera nao encontrada"
     * como se o problema fosse o cabo.
     */
    ESP_LOGI("pulso", "vivo -- psram %u KB (bloco %u KB)  |  interna %u KB (bloco %u KB)",
             (unsigned)(heap_caps_get_free_size(MALLOC_CAP_SPIRAM) / 1024),
             (unsigned)(heap_caps_get_largest_free_block(MALLOC_CAP_SPIRAM) / 1024),
             (unsigned)(heap_caps_get_free_size(MALLOC_CAP_INTERNAL) / 1024),
             (unsigned)(heap_caps_get_largest_free_block(MALLOC_CAP_INTERNAL) / 1024));
}

static void a_cada_segundo(lv_timer_t *t)
{
    (void)t;
    pulso();

    if (rede_tem_hora()) {
        time_t agora = time(NULL);
        struct tm hoje;
        localtime_r(&agora, &hoje);
        lv_label_set_text_fmt(rot_relogio, "%02d:%02d", hoje.tm_hour, hoje.tm_min);
    } else {
        /* Sem hora da rede, nao se inventa uma. Ver o cabecalho. */
        lv_label_set_text(rot_relogio, "--:--");
    }

    /*
     * O SIMBOLO DIZ O ESTADO DE LONGE, o texto diz o detalhe de perto.
     *
     * Quem passa pela tela quer saber se esta conectada, nao qual e o endereco
     * -- e um simbolo verde ou apagado se le a tres metros, o que um IP nao se
     * le. O texto continua para quem chega perto e precisa do numero.
     */
    if (rede_conectada()) {
        lv_label_set_text(sinal_de_rede, LV_SYMBOL_WIFI);
        lv_obj_set_style_text_color(sinal_de_rede, COR_CERTO, 0);
        lv_label_set_text(rot_rede, rede_endereco());
        lv_obj_set_style_text_color(rot_rede, COR_APOIO, 0);
    } else {
        lv_label_set_text(sinal_de_rede, LV_SYMBOL_CLOSE);
        lv_obj_set_style_text_color(sinal_de_rede, COR_DESTAQUE, 0);

        /* Sem conexao, o que interessa e o porque -- nao um endereco vazio. */
        const char *porque = rede_por_que_nao();
        lv_label_set_text(rot_rede, porque ? porque : "sem rede");
        lv_obj_set_style_text_color(rot_rede, COR_APOIO, 0);
    }
}

static void tocou_voltar(lv_event_t *e)
{
    (void)e;
    interface_voltar_ao_inicio();
}

static void montar_a_barra(lv_obj_t *pai)
{
    lv_obj_t *barra = lv_obj_create(pai);
    lv_obj_set_size(barra, LV_PCT(100), ALTURA_DA_BARRA);
    lv_obj_set_pos(barra, 0, 0);
    lv_obj_set_style_bg_color(barra, COR_CARTAO, 0);
    lv_obj_set_style_border_width(barra, 0, 0);
    lv_obj_set_style_border_side(barra, LV_BORDER_SIDE_BOTTOM, 0);
    lv_obj_set_style_border_color(barra, COR_BORDA, 0);
    lv_obj_set_style_border_width(barra, 1, 0);
    lv_obj_set_style_radius(barra, 0, 0);
    lv_obj_set_style_pad_all(barra, 0, 0);
    lv_obj_remove_flag(barra, LV_OBJ_FLAG_SCROLLABLE);

    /*
     * O voltar ocupa 120x44. Nao e enfeite: quem usa isto na fabrica pode estar
     * de luva, e alvo pequeno com dedo grosso e frustracao garantida.
     */
    botao_voltar = lv_button_create(barra);
    lv_obj_set_size(botao_voltar, 120, 44);
    lv_obj_align(botao_voltar, LV_ALIGN_LEFT_MID, 10, 0);
    lv_obj_set_style_bg_color(botao_voltar, COR_BORDA, 0);
    lv_obj_set_style_radius(botao_voltar, 8, 0);
    lv_obj_add_event_cb(botao_voltar, tocou_voltar, LV_EVENT_CLICKED, NULL);
    lv_obj_add_flag(botao_voltar, LV_OBJ_FLAG_HIDDEN);   /* so fora do inicio */

    lv_obj_t *seta = lv_label_create(botao_voltar);
    lv_label_set_text(seta, LV_SYMBOL_LEFT "  voltar");
    lv_obj_set_style_text_color(seta, COR_TEXTO, 0);
    lv_obj_set_style_text_font(seta, &lv_font_montserrat_16, 0);
    lv_obj_center(seta);

    rot_titulo = lv_label_create(barra);
    lv_obj_set_style_text_color(rot_titulo, COR_TEXTO, 0);
    lv_obj_set_style_text_font(rot_titulo, &lv_font_montserrat_22, 0);
    lv_obj_align(rot_titulo, LV_ALIGN_LEFT_MID, 150, 0);

    rot_relogio = lv_label_create(barra);
    lv_obj_set_style_text_color(rot_relogio, COR_TEXTO, 0);
    lv_obj_set_style_text_font(rot_relogio, &lv_font_montserrat_28, 0);
    lv_obj_align(rot_relogio, LV_ALIGN_RIGHT_MID, -20, 0);

    sinal_de_rede = lv_label_create(barra);
    lv_obj_set_style_text_font(sinal_de_rede, &lv_font_montserrat_22, 0);
    lv_obj_align(sinal_de_rede, LV_ALIGN_RIGHT_MID, -110, 0);

    rot_rede = lv_label_create(barra);
    lv_obj_set_style_text_font(rot_rede, &lv_font_montserrat_16, 0);
    lv_obj_align(rot_rede, LV_ALIGN_RIGHT_MID, -140, 0);
    lv_obj_set_style_text_align(rot_rede, LV_TEXT_ALIGN_RIGHT, 0);

    lv_timer_create(a_cada_segundo, 1000, NULL);
    a_cada_segundo(NULL);
}

/* ------------------------------------------------------- a troca de app */

/* Esvazia a area e solta o que o app anterior estava segurando. */
static void fechar_o_que_estiver_aberto(void)
{
    switch (aberto) {
    case PRODUCAO: app_producao_desmontar(); break;
    case PONTOS:   app_pontos_desmontar();   break;
    case AJUSTES:  app_ajustes_desmontar();  break;
    default: break;
    }
    aberto = NENHUM;
    lv_obj_clean(area);
}

static void tocou_producao(lv_event_t *e)
{
    (void)e;
    fechar_o_que_estiver_aberto();
    lv_label_set_text(rot_titulo, "Producao");
    lv_obj_remove_flag(botao_voltar, LV_OBJ_FLAG_HIDDEN);
    aberto = PRODUCAO;
    app_producao_montar(area);
}

static void tocou_pontos(lv_event_t *e)
{
    (void)e;
    fechar_o_que_estiver_aberto();
    lv_label_set_text(rot_titulo, "Pontos");
    lv_obj_remove_flag(botao_voltar, LV_OBJ_FLAG_HIDDEN);
    aberto = PONTOS;
    app_pontos_montar(area);
}

static void tocou_ajustes(lv_event_t *e)
{
    (void)e;
    fechar_o_que_estiver_aberto();
    lv_label_set_text(rot_titulo, "Ajustes");
    lv_obj_remove_flag(botao_voltar, LV_OBJ_FLAG_HIDDEN);
    aberto = AJUSTES;
    app_ajustes_montar(area);
}

/* ---------------------------------------------------------- o inicio */

/* Um cartao de app: grande, de tocar com o dedo, com icone e nome. */
static void cartao_de_app(lv_obj_t *pai, const char *icone, const char *nome,
                          const char *apoio, lv_color_t cor,
                          lv_event_cb_t ao_tocar, int32_t x)
{
    lv_obj_t *cartao = lv_button_create(pai);
    lv_obj_set_size(cartao, 300, 300);
    lv_obj_set_pos(cartao, x, 90);
    lv_obj_set_style_bg_color(cartao, COR_CARTAO, 0);
    lv_obj_set_style_border_color(cartao, COR_BORDA, 0);
    lv_obj_set_style_border_width(cartao, 1, 0);
    lv_obj_set_style_radius(cartao, 18, 0);
    lv_obj_set_style_shadow_width(cartao, 0, 0);
    lv_obj_add_event_cb(cartao, ao_tocar, LV_EVENT_CLICKED, NULL);

    lv_obj_t *simbolo = lv_label_create(cartao);
    lv_label_set_text(simbolo, icone);
    lv_obj_set_style_text_color(simbolo, cor, 0);
    lv_obj_set_style_text_font(simbolo, &lv_font_montserrat_48, 0);
    lv_obj_align(simbolo, LV_ALIGN_TOP_MID, 0, 40);

    lv_obj_t *rot = lv_label_create(cartao);
    lv_label_set_text(rot, nome);
    lv_obj_set_style_text_color(rot, COR_TEXTO, 0);
    lv_obj_set_style_text_font(rot, &lv_font_montserrat_28, 0);
    lv_obj_align(rot, LV_ALIGN_CENTER, 0, 30);

    lv_obj_t *sub = lv_label_create(cartao);
    lv_label_set_text(sub, apoio);
    lv_obj_set_style_text_color(sub, COR_APOIO, 0);
    lv_obj_set_style_text_font(sub, &lv_font_montserrat_16, 0);
    lv_obj_align(sub, LV_ALIGN_CENTER, 0, 70);
}

static void abrir_inicio(void)
{
    fechar_o_que_estiver_aberto();
    lv_label_set_text(rot_titulo, "");
    lv_obj_add_flag(botao_voltar, LV_OBJ_FLAG_HIDDEN);

    lv_obj_t *titulo = lv_label_create(area);
    lv_label_set_text(titulo, "Optmize");
    lv_obj_set_style_text_color(titulo, COR_TEXTO, 0);
    lv_obj_set_style_text_font(titulo, &lv_font_montserrat_28, 0);
    lv_obj_set_pos(titulo, 40, 30);

    /* Tres cartoes de 300, com 32 de vao, centrados em 1024. */
    cartao_de_app(area, LV_SYMBOL_VIDEO, "Producao",
                  "camera e leitura de QR", COR_DESTAQUE, tocou_producao, 32);
    cartao_de_app(area, LV_SYMBOL_LIST, "Pontos",
                  "em construcao", COR_APOIO, tocou_pontos, 362);
    cartao_de_app(area, LV_SYMBOL_SETTINGS, "Ajustes",
                  "rede, brilho e audio", COR_TEXTO, tocou_ajustes, 692);
}

void interface_voltar_ao_inicio(void)
{
    abrir_inicio();
}

void interface_iniciar(void)
{
    bsp_display_lock(0);

    lv_obj_t *tela = lv_screen_active();
    lv_obj_set_style_bg_color(tela, COR_FUNDO, 0);
    lv_obj_set_style_pad_all(tela, 0, 0);
    lv_obj_remove_flag(tela, LV_OBJ_FLAG_SCROLLABLE);

    montar_a_barra(tela);

    /* A area util: tudo abaixo da barra, sem moldura nem folga propria. */
    area = lv_obj_create(tela);
    lv_obj_set_size(area, LV_PCT(100), LV_VER_RES - ALTURA_DA_BARRA);
    lv_obj_set_pos(area, 0, ALTURA_DA_BARRA);
    lv_obj_set_style_bg_color(area, COR_FUNDO, 0);
    lv_obj_set_style_border_width(area, 0, 0);
    lv_obj_set_style_radius(area, 0, 0);
    lv_obj_set_style_pad_all(area, 0, 0);
    lv_obj_remove_flag(area, LV_OBJ_FLAG_SCROLLABLE);

    abrir_inicio();
    bsp_display_unlock();

    ESP_LOGI(TAG, "casca no ar");
}
