/*
 * ===========================================================================
 * APP DE AJUSTES — rede, brilho e audio
 * ===========================================================================
 *
 * Tres coisas que quem instala o aparelho precisa mexer sem compilador:
 *
 *   REDE     escolhida numa lista do que esta no ar, e a senha digitada
 *   BRILHO   a tela vai para uma parede -- o que serve numa sala escura cega
 *            numa sala clara, e vice-versa
 *   AUDIO    o ganho do microfone
 *
 * ---------------------------------------------------------------------------
 * A REDE SE ESCOLHE, NAO SE DIGITA
 * ---------------------------------------------------------------------------
 *
 * Digitar o nome da rede a mao e convite a erro: um espaco a mais, um acento,
 * um "5G" no fim que ninguem lembra -- e o sintoma e sempre o mesmo, "nao
 * conecta", sem dizer por que. A lista mostra o que o radio realmente ouve, e
 * escolher e um toque.
 *
 * A VARREDURA BLOQUEIA por alguns segundos, entao roda numa tarefa propria.
 * Feita na tarefa do LVGL, a tela congelaria -- e tela congelada durante uma
 * busca parece tela travada.
 *
 * ---------------------------------------------------------------------------
 * A SENHA
 * ---------------------------------------------------------------------------
 *
 * Nasce escondida, com um botao de revelar. Digitar senha as cegas em teclado
 * de tela, com o dedo tampando a tecla, e como se erra -- e o erro so aparece
 * depois, disfarcado de "nao conecta".
 */

#include <stdio.h>
#include <string.h>

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "bsp/esp-bsp.h"
#include "interface.h"

static const char *TAG = "ajustes";

#define CABEM 16

static lv_obj_t *lista_de_redes;
static lv_obj_t *campo_senha;
static lv_obj_t *teclado;
static lv_obj_t *rot_estado;
static lv_obj_t *rot_escolhida;

static char escolhida[33];
static char achadas[CABEM][33];
static volatile bool montado;

/* --------------------------------------------------------- a varredura */

static void tocou_numa_rede(lv_event_t *e)
{
    lv_obj_t *botao = lv_event_get_target(e);
    const char *nome = lv_list_get_button_text(lista_de_redes, botao);
    if (nome == NULL) {
        return;
    }
    snprintf(escolhida, sizeof(escolhida), "%s", nome);

    lv_label_set_text_fmt(rot_escolhida, "rede: %s", escolhida);
    lv_obj_set_style_text_color(rot_escolhida, COR_TEXTO, 0);
    ESP_LOGI(TAG, "rede escolhida: %s", escolhida);
}

/*
 * A tarefa que varre. Existe porque `rede_procurar` bloqueia: na tarefa do
 * LVGL, a tela ficaria parada durante a busca inteira.
 *
 * Ela so mexe na tela sob a tranca, e confere `montado` antes -- entre o inicio
 * da varredura e o fim dela a pessoa pode ter saido do app, e os objetos que
 * esta tarefa ia preencher ja nao existiriam.
 */
static void tarefa_de_procurar(void *arg)
{
    (void)arg;
    const int quantas = rede_procurar(achadas, CABEM);

    if (montado && bsp_display_lock(200)) {
        lv_obj_clean(lista_de_redes);
        for (int i = 0; i < quantas; i++) {
            lv_obj_t *b = lv_list_add_button(lista_de_redes, LV_SYMBOL_WIFI, achadas[i]);
            lv_obj_set_style_text_font(b, &lv_font_montserrat_16, 0);
            lv_obj_add_event_cb(b, tocou_numa_rede, LV_EVENT_CLICKED, NULL);
        }
        if (quantas == 0) {
            lv_list_add_text(lista_de_redes, "nenhuma rede por perto");
        }
        lv_label_set_text_fmt(rot_estado, "%d rede(s) encontradas", quantas);
        lv_obj_set_style_text_color(rot_estado, COR_APOIO, 0);
        bsp_display_unlock();
    }
    vTaskDelete(NULL);
}

static void tocou_procurar(lv_event_t *e)
{
    (void)e;
    lv_obj_clean(lista_de_redes);
    lv_list_add_text(lista_de_redes, "procurando...");
    lv_label_set_text(rot_estado, "varrendo o ar");
    lv_obj_set_style_text_color(rot_estado, COR_APOIO, 0);

    xTaskCreate(tarefa_de_procurar, "varrer", 4096, NULL, 4, NULL);
}

/* ------------------------------------------------------------- conectar */

static void tocou_conectar(lv_event_t *e)
{
    (void)e;
    const char *senha = lv_textarea_get_text(campo_senha);

    if (escolhida[0] == 0) {
        lv_label_set_text(rot_estado, "escolha uma rede na lista");
        lv_obj_set_style_text_color(rot_estado, COR_DESTAQUE, 0);
        return;
    }

    /*
     * Guarda ANTES de conectar. Se a senha estiver errada, o que se quer na
     * proxima tentativa e corrigir um campo ja preenchido, nao digitar tudo de
     * novo -- e se faltar energia no meio, o que ficou guardado vale.
     */
    if (rede_guardar(escolhida, senha) != ESP_OK) {
        lv_label_set_text(rot_estado, "nao consegui guardar a rede");
        lv_obj_set_style_text_color(rot_estado, COR_DESTAQUE, 0);
        return;
    }

    rede_conectar(escolhida, senha);
    lv_label_set_text(rot_estado, "conectando...");
    lv_obj_set_style_text_color(rot_estado, COR_APOIO, 0);
    ESP_LOGI(TAG, "conectando em %s", escolhida);
}

/* O teclado so aparece quando o campo e tocado, e some quando ele sai. */
static void campo_em_foco(lv_event_t *e)
{
    lv_obj_t *campo = lv_event_get_target(e);
    const lv_event_code_t codigo = lv_event_get_code(e);

    if (codigo == LV_EVENT_FOCUSED) {
        lv_keyboard_set_textarea(teclado, campo);
        lv_obj_remove_flag(teclado, LV_OBJ_FLAG_HIDDEN);
    } else if (codigo == LV_EVENT_DEFOCUSED || codigo == LV_EVENT_READY) {
        lv_keyboard_set_textarea(teclado, NULL);
        lv_obj_add_flag(teclado, LV_OBJ_FLAG_HIDDEN);
    }
}

static void tocou_revelar(lv_event_t *e)
{
    lv_obj_t *botao = lv_event_get_target(e);
    const bool escondendo = lv_textarea_get_password_mode(campo_senha);
    lv_textarea_set_password_mode(campo_senha, !escondendo);
    lv_label_set_text(lv_obj_get_child(botao, 0),
                      escondendo ? LV_SYMBOL_EYE_CLOSE : LV_SYMBOL_EYE_OPEN);
}

/* ------------------------------------------------------ brilho e audio */

static void mudou_o_brilho(lv_event_t *e)
{
    lv_obj_t *barra = lv_event_get_target(e);
    const int valor = (int)lv_slider_get_value(barra);
    bsp_display_brightness_set(valor);

    lv_label_set_text_fmt((lv_obj_t *)lv_event_get_user_data(e), "%d%%", valor);
}

static void mudou_o_volume(lv_event_t *e)
{
    lv_obj_t *barra = lv_event_get_target(e);
    const int valor = (int)lv_slider_get_value(barra);
    lv_label_set_text_fmt((lv_obj_t *)lv_event_get_user_data(e), "%d%%", valor);

    /*
     * O ganho ainda nao chega ao codec: a entrada de audio do sistema nao
     * existe. Mostrar o numero ja serve, e quando o audio entrar e aqui que ele
     * sai. Melhor isto do que um controle que finge funcionar.
     */
    ESP_LOGI(TAG, "ganho do microfone: %d%% (ainda nao aplicado)", valor);
}

/* ------------------------------------------------------------ montagem */

/* Uma linha de ajuste: nome, barra, e o valor a direita. */
static void deslizante(lv_obj_t *pai, const char *nome, int32_t y,
                       int inicial, lv_event_cb_t ao_mudar)
{
    lv_obj_t *rot = lv_label_create(pai);
    lv_label_set_text(rot, nome);
    lv_obj_set_style_text_color(rot, COR_TEXTO, 0);
    lv_obj_set_style_text_font(rot, &lv_font_montserrat_16, 0);
    lv_obj_set_pos(rot, 0, y);

    lv_obj_t *valor = lv_label_create(pai);
    lv_obj_set_style_text_color(valor, COR_APOIO, 0);
    lv_obj_set_style_text_font(valor, &lv_font_montserrat_16, 0);
    lv_obj_set_pos(valor, 370, y);
    lv_label_set_text_fmt(valor, "%d%%", inicial);

    lv_obj_t *barra = lv_slider_create(pai);
    lv_obj_set_size(barra, 410, 18);
    lv_obj_set_pos(barra, 0, y + 28);
    lv_slider_set_range(barra, 0, 100);
    lv_slider_set_value(barra, inicial, LV_ANIM_OFF);
    lv_obj_set_style_bg_color(barra, COR_BORDA, 0);
    lv_obj_set_style_bg_color(barra, COR_DESTAQUE, LV_PART_INDICATOR);
    lv_obj_set_style_bg_color(barra, COR_TEXTO, LV_PART_KNOB);
    lv_obj_add_event_cb(barra, ao_mudar, LV_EVENT_VALUE_CHANGED, valor);
}

void app_ajustes_montar(lv_obj_t *area)
{
    montado = true;
    snprintf(escolhida, sizeof(escolhida), "%s", rede_nome_da_rede());

    /* --- esquerda: a rede --- */

    lv_obj_t *esq = lv_obj_create(area);
    lv_obj_set_size(esq, 490, 500);
    lv_obj_set_pos(esq, 20, 20);
    lv_obj_set_style_bg_color(esq, COR_CARTAO, 0);
    lv_obj_set_style_border_color(esq, COR_BORDA, 0);
    lv_obj_set_style_border_width(esq, 1, 0);
    lv_obj_set_style_radius(esq, 14, 0);
    lv_obj_set_style_pad_all(esq, 18, 0);
    lv_obj_remove_flag(esq, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *t1 = lv_label_create(esq);
    lv_label_set_text(t1, "Rede sem fio");
    lv_obj_set_style_text_color(t1, COR_TEXTO, 0);
    lv_obj_set_style_text_font(t1, &lv_font_montserrat_22, 0);
    lv_obj_set_pos(t1, 0, 0);

    lv_obj_t *procurar = lv_button_create(esq);
    lv_obj_set_size(procurar, 130, 40);
    lv_obj_set_pos(procurar, 320, 0);
    lv_obj_set_style_bg_color(procurar, COR_BORDA, 0);
    lv_obj_add_event_cb(procurar, tocou_procurar, LV_EVENT_CLICKED, NULL);
    lv_obj_t *rp = lv_label_create(procurar);
    lv_label_set_text(rp, LV_SYMBOL_REFRESH "  buscar");
    lv_obj_set_style_text_font(rp, &lv_font_montserrat_16, 0);
    lv_obj_center(rp);

    lista_de_redes = lv_list_create(esq);
    lv_obj_set_size(lista_de_redes, 450, 210);
    lv_obj_set_pos(lista_de_redes, 0, 48);
    lv_obj_set_style_bg_color(lista_de_redes, COR_FUNDO, 0);
    lv_obj_set_style_border_color(lista_de_redes, COR_BORDA, 0);
    lv_obj_set_style_border_width(lista_de_redes, 1, 0);
    lv_obj_set_style_radius(lista_de_redes, 10, 0);
    lv_list_add_text(lista_de_redes, "toque em buscar");

    rot_escolhida = lv_label_create(esq);
    lv_obj_set_style_text_font(rot_escolhida, &lv_font_montserrat_16, 0);
    lv_obj_set_pos(rot_escolhida, 0, 268);
    if (escolhida[0]) {
        lv_label_set_text_fmt(rot_escolhida, "rede: %s", escolhida);
        lv_obj_set_style_text_color(rot_escolhida, COR_TEXTO, 0);
    } else {
        lv_label_set_text(rot_escolhida, "nenhuma rede escolhida");
        lv_obj_set_style_text_color(rot_escolhida, COR_APOIO, 0);
    }

    campo_senha = lv_textarea_create(esq);
    lv_obj_set_size(campo_senha, 385, 48);
    lv_obj_set_pos(campo_senha, 0, 296);
    lv_textarea_set_one_line(campo_senha, true);
    lv_textarea_set_password_mode(campo_senha, true);
    lv_textarea_set_placeholder_text(campo_senha, "senha");
    lv_obj_add_event_cb(campo_senha, campo_em_foco, LV_EVENT_ALL, NULL);

    lv_obj_t *revelar = lv_button_create(esq);
    lv_obj_set_size(revelar, 55, 48);
    lv_obj_set_pos(revelar, 395, 296);
    lv_obj_set_style_bg_color(revelar, COR_BORDA, 0);
    lv_obj_add_event_cb(revelar, tocou_revelar, LV_EVENT_CLICKED, NULL);
    lv_obj_t *olho = lv_label_create(revelar);
    lv_label_set_text(olho, LV_SYMBOL_EYE_CLOSE);
    lv_obj_center(olho);

    lv_obj_t *conectar = lv_button_create(esq);
    lv_obj_set_size(conectar, 170, 48);
    lv_obj_set_pos(conectar, 0, 360);
    lv_obj_set_style_bg_color(conectar, COR_DESTAQUE, 0);
    lv_obj_add_event_cb(conectar, tocou_conectar, LV_EVENT_CLICKED, NULL);
    lv_obj_t *rc = lv_label_create(conectar);
    lv_label_set_text(rc, "Conectar");
    lv_obj_set_style_text_font(rc, &lv_font_montserrat_16, 0);
    lv_obj_center(rc);

    rot_estado = lv_label_create(esq);
    lv_obj_set_style_text_font(rot_estado, &lv_font_montserrat_16, 0);
    lv_obj_set_pos(rot_estado, 190, 375);
    if (rede_conectada()) {
        lv_label_set_text_fmt(rot_estado, "conectada -- %s", rede_endereco());
        lv_obj_set_style_text_color(rot_estado, COR_CERTO, 0);
    } else {
        lv_label_set_text(rot_estado, "sem conexao");
        lv_obj_set_style_text_color(rot_estado, COR_APOIO, 0);
    }

    /* --- direita: tela e audio --- */

    lv_obj_t *dir = lv_obj_create(area);
    lv_obj_set_size(dir, 470, 260);
    lv_obj_set_pos(dir, 530, 20);
    lv_obj_set_style_bg_color(dir, COR_CARTAO, 0);
    lv_obj_set_style_border_color(dir, COR_BORDA, 0);
    lv_obj_set_style_border_width(dir, 1, 0);
    lv_obj_set_style_radius(dir, 14, 0);
    lv_obj_set_style_pad_all(dir, 18, 0);
    lv_obj_remove_flag(dir, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *t2 = lv_label_create(dir);
    lv_label_set_text(t2, "Tela e audio");
    lv_obj_set_style_text_color(t2, COR_TEXTO, 0);
    lv_obj_set_style_text_font(t2, &lv_font_montserrat_22, 0);
    lv_obj_set_pos(t2, 0, 0);

    deslizante(dir, "Brilho da tela", 50, 100, mudou_o_brilho);
    deslizante(dir, "Ganho do microfone", 140, 50, mudou_o_volume);

    /* --- o teclado, escondido ate alguem tocar na senha --- */

    teclado = lv_keyboard_create(area);
    lv_obj_set_size(teclado, LV_PCT(100), 250);
    lv_obj_align(teclado, LV_ALIGN_BOTTOM_MID, 0, 0);
    lv_obj_add_flag(teclado, LV_OBJ_FLAG_HIDDEN);
}

void app_ajustes_desmontar(void)
{
    /*
     * `montado` primeiro: a tarefa de varredura pode estar no meio de uma busca,
     * e ao terminar ela confere esta bandeira antes de mexer na tela. Sem isso,
     * ela preencheria objetos que a casca ja apagou.
     */
    montado = false;

    lista_de_redes = NULL;
    campo_senha = NULL;
    teclado = NULL;
    rot_estado = NULL;
    rot_escolhida = NULL;
}
