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
#include "optmize.h"

static const char *TAG = "ajustes";

#define CABEM 16

static lv_obj_t *lista_de_redes;
static lv_obj_t *campo_senha;
static lv_obj_t *teclado;
static lv_obj_t *rot_estado;
static lv_obj_t *rot_escolhida;
static lv_obj_t *campo_servidor;

static lv_timer_t *relogio_do_estado;
static char escolhida[33];
static char achadas[CABEM][33];
static volatile bool montado;

/*
 * O ESTADO SE ATUALIZA SOZINHO.
 *
 * Na primeira versao a tela escrevia "conectando..." e nunca mais tocava
 * naquele texto. Com a senha errada o Wi-Fi tenta de novo para sempre -- e a
 * tela ficava mentindo, dizendo que estava conectando, sem fim.
 *
 * Agora um relogio confere o estado a cada segundo e diz o que realmente esta
 * acontecendo: conectada com o endereco, ou o motivo de nao ter dado.
 */
static void conferir_o_estado(lv_timer_t *t)
{
    (void)t;
    if (!montado || rot_estado == NULL) {
        return;
    }

    if (rede_conectada()) {
        lv_label_set_text_fmt(rot_estado, "conectada -- %s", rede_endereco());
        lv_obj_set_style_text_color(rot_estado, COR_CERTO, 0);
        return;
    }

    const char *porque = rede_por_que_nao();
    if (porque != NULL) {
        lv_label_set_text(rot_estado, porque);
        lv_obj_set_style_text_color(rot_estado, COR_DESTAQUE, 0);
    } else {
        lv_label_set_text(rot_estado, "sem conexao");
        lv_obj_set_style_text_color(rot_estado, COR_APOIO, 0);
    }
}

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
            lv_obj_set_style_text_font(b, &fonte_16, 0);
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

    /*
     * "conectando..." aqui e so o primeiro quadro: o relogio de um segundo
     * substitui isto assim que houver resposta -- endereco, ou o motivo de nao
     * ter dado.
     */
    lv_label_set_text(rot_estado, "conectando...");
    lv_obj_set_style_text_color(rot_estado, COR_APOIO, 0);
    ESP_LOGI(TAG, "conectando em %s", escolhida);
}

static void tocou_salvar_servidor(lv_event_t *e)
{
    (void)e;
    const char *endereco = lv_textarea_get_text(campo_servidor);
    if (endereco == NULL || endereco[0] == 0) {
        return;
    }
    optmize_guardar_servidor(endereco);
    ESP_LOGI(TAG, "servidor do Optmize: %s", endereco);
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

static void mudou_o_ganho(lv_event_t *e)
{
    lv_obj_t *barra = lv_event_get_target(e);
    const int valor = (int)lv_slider_get_value(barra);
    lv_label_set_text_fmt((lv_obj_t *)lv_event_get_user_data(e), "%d%%", valor);

    /*
     * O ganho ainda nao chega ao codec, e agora por outra razao: o microfone
     * EXISTE (um ES7210 em 0x40, ver `prova-de-audio.c`), mas nada no sistema
     * o escuta ainda. Ligar o controle a um microfone que ninguem le seria um
     * botao que mexe em nada.
     */
    ESP_LOGI(TAG, "ganho do microfone: %d%% (ainda nao aplicado)", valor);
}

/*
 * O VOLUME DA VOZ, e a frase de prova.
 *
 * Arrastar um controle de volume sem ouvir nada e adivinhar. Por isso, ao
 * SOLTAR, a placa fala uma frase curta no volume novo -- e o ajuste passa a ser
 * "arrasta, ouve, arrasta de novo" em vez de "arrasta, sai da tela, le um QR,
 * descobre que ficou baixo".
 *
 * A frase sai so no SOLTAR, e nao a cada pixel arrastado: falando a cada
 * mudanca, o controle viraria uma gagueira.
 */
static void mudou_o_volume_da_voz(lv_event_t *e)
{
    lv_obj_t *barra = lv_event_get_target(e);
    const int valor = (int)lv_slider_get_value(barra);
    lv_label_set_text_fmt((lv_obj_t *)lv_event_get_user_data(e), "%d%%", valor);

    voz_guardar_volume(valor);

    if (lv_event_get_code(e) == LV_EVENT_RELEASED) {
        voz_falar("volume assim");
    }
}

/* ------------------------------------------------------------ montagem */

/* Uma linha de ajuste: nome, barra, e o valor a direita. */
static void deslizante(lv_obj_t *pai, const char *nome, int32_t y,
                       int inicial, lv_event_cb_t ao_mudar)
{
    lv_obj_t *rot = lv_label_create(pai);
    lv_label_set_text(rot, nome);
    lv_obj_set_style_text_color(rot, COR_TEXTO, 0);
    lv_obj_set_style_text_font(rot, &fonte_16, 0);
    lv_obj_set_pos(rot, 0, y);

    lv_obj_t *valor = lv_label_create(pai);
    lv_obj_set_style_text_color(valor, COR_TEXTO, 0);
    lv_obj_set_style_text_font(valor, &fonte_16, 0);
    /*
     * O numero a DIREITA do trilho e alinhado a direita, nao a esquerda: assim
     * ele cresce para dentro ao passar de 9 para 10 e de 99 para 100, em vez de
     * empurrar a borda do cartao.
     */
    lv_obj_set_width(valor, 60);
    lv_obj_set_style_text_align(valor, LV_TEXT_ALIGN_RIGHT, 0);
    lv_obj_set_pos(valor, 350, y);
    lv_label_set_text_fmt(valor, "%d%%", inicial);

    lv_obj_t *barra = lv_slider_create(pai);
    lv_obj_set_size(barra, 410, 18);
    lv_obj_set_pos(barra, 0, y + 28);
    lv_slider_set_range(barra, 0, 100);
    lv_slider_set_value(barra, inicial, LV_ANIM_OFF);
    /*
     * Trilho na cor do FUNDO -- afundado no cartao --, indicador no acento,
     * botao branco. Antes o trilho era da cor da borda e o deslizante parecia
     * um objeto pousado em cima do painel em vez de um sulco nele.
     */
    lv_obj_set_style_bg_color(barra, COR_FUNDO, 0);
    lv_obj_set_style_border_color(barra, COR_BORDA_SUAVE, 0);
    lv_obj_set_style_border_width(barra, 1, 0);
    lv_obj_set_style_bg_color(barra, COR_DESTAQUE, LV_PART_INDICATOR);
    lv_obj_set_style_bg_color(barra, COR_TEXTO, LV_PART_KNOB);
    lv_obj_set_style_shadow_width(barra, 0, LV_PART_KNOB);
    lv_obj_add_event_cb(barra, ao_mudar, LV_EVENT_VALUE_CHANGED, valor);
    /*
     * O SOLTAR tambem chama, para quem quiser fazer alguma coisa so no fim do
     * arrasto -- tocar uma frase de prova, por exemplo. Quem nao quiser ignora,
     * porque o codigo do evento esta no proprio evento.
     */
    lv_obj_add_event_cb(barra, ao_mudar, LV_EVENT_RELEASED, valor);
}

void app_ajustes_montar(lv_obj_t *area)
{
    montado = true;
    snprintf(escolhida, sizeof(escolhida), "%s", rede_nome_da_rede());

    /* --- esquerda: a rede --- */

    lv_obj_t *esq = lv_obj_create(area);
    lv_obj_set_size(esq, 490, 506);
    lv_obj_set_pos(esq, 20, 18);
    lv_obj_set_style_bg_color(esq, COR_CARTAO, 0);
    lv_obj_set_style_border_color(esq, COR_BORDA, 0);
    lv_obj_set_style_border_width(esq, 1, 0);
    lv_obj_set_style_radius(esq, RAIO, 0);
    lv_obj_set_style_pad_all(esq, 18, 0);
    lv_obj_remove_flag(esq, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *t1 = lv_label_create(esq);
    lv_label_set_text(t1, "REDE SEM FIO");
    lv_obj_set_style_text_color(t1, COR_DESTAQUE, 0);
    lv_obj_set_style_text_font(t1, &fonte_16, 0);
    /*
     * Titulo de bloco em maiuscula, corpo pequeno e cor de acento -- o mesmo
     * tratamento do "sobre". Titulo grande competiria com o conteudo; assim ele
     * organiza sem chamar atencao para si.
     */
    lv_obj_set_style_text_letter_space(t1, 2, 0);
    lv_obj_set_pos(t1, 0, 4);

    lv_obj_t *procurar = lv_button_create(esq);
    lv_obj_set_size(procurar, 130, 40);
    lv_obj_set_pos(procurar, 320, 0);
    lv_obj_set_style_bg_color(procurar, COR_CARTAO_SUAVE, 0);
    lv_obj_set_style_border_color(procurar, COR_BORDA, 0);
    lv_obj_set_style_border_width(procurar, 1, 0);
    lv_obj_set_style_radius(procurar, RAIO_MIUDO, 0);
    lv_obj_set_style_shadow_width(procurar, 0, 0);
    lv_obj_add_event_cb(procurar, tocou_procurar, LV_EVENT_CLICKED, NULL);
    lv_obj_t *rp = lv_label_create(procurar);
    lv_label_set_text(rp, LV_SYMBOL_REFRESH "  buscar");
    lv_obj_set_style_text_font(rp, &fonte_16, 0);
    lv_obj_center(rp);

    lista_de_redes = lv_list_create(esq);
    lv_obj_set_size(lista_de_redes, 450, 210);
    lv_obj_set_pos(lista_de_redes, 0, 48);
    /*
     * A lista e um degrau MAIS ESCURA que o cartao que a contem, e nao mais
     * clara. O que esta dentro afunda; o que esta na frente sobe. Invertido,
     * a lista parecia flutuar por cima do painel.
     */
    lv_obj_set_style_bg_color(lista_de_redes, COR_FUNDO, 0);
    lv_obj_set_style_border_color(lista_de_redes, COR_BORDA_SUAVE, 0);
    lv_obj_set_style_border_width(lista_de_redes, 1, 0);
    lv_obj_set_style_radius(lista_de_redes, RAIO_MIUDO, 0);
    lv_obj_set_style_pad_all(lista_de_redes, 6, 0);
    lv_list_add_text(lista_de_redes, "toque em buscar");

    rot_escolhida = lv_label_create(esq);
    lv_obj_set_style_text_font(rot_escolhida, &fonte_16, 0);
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
    lv_obj_set_style_bg_color(campo_senha, COR_FUNDO, 0);
    lv_obj_set_style_border_color(campo_senha, COR_BORDA_SUAVE, 0);
    lv_obj_set_style_border_color(campo_senha, COR_DESTAQUE, LV_STATE_FOCUSED);
    lv_obj_set_style_border_width(campo_senha, 1, 0);
    lv_obj_set_style_radius(campo_senha, RAIO_MIUDO, 0);
    lv_obj_set_style_text_color(campo_senha, COR_TEXTO, 0);
    lv_obj_set_style_text_font(campo_senha, &fonte_16, 0);
    lv_obj_add_event_cb(campo_senha, campo_em_foco, LV_EVENT_ALL, NULL);

    lv_obj_t *revelar = lv_button_create(esq);
    lv_obj_set_size(revelar, 55, 48);
    lv_obj_set_pos(revelar, 395, 296);
    lv_obj_set_style_bg_color(revelar, COR_CARTAO_SUAVE, 0);
    lv_obj_set_style_border_color(revelar, COR_BORDA, 0);
    lv_obj_set_style_border_width(revelar, 1, 0);
    lv_obj_set_style_radius(revelar, RAIO_MIUDO, 0);
    lv_obj_set_style_shadow_width(revelar, 0, 0);
    lv_obj_add_event_cb(revelar, tocou_revelar, LV_EVENT_CLICKED, NULL);
    lv_obj_t *olho = lv_label_create(revelar);
    lv_label_set_text(olho, LV_SYMBOL_EYE_CLOSE);
    lv_obj_center(olho);

    lv_obj_t *conectar = lv_button_create(esq);
    lv_obj_set_size(conectar, 170, 48);
    lv_obj_set_pos(conectar, 0, 360);
    /*
     * O UNICO BOTAO LARANJA DESTA TELA. Tudo o mais aqui e secundario --
     * buscar, revelar a senha --, e dar laranja a todos faria a tela inteira
     * gritar igual. O acento so vale enquanto for raro.
     */
    lv_obj_set_style_bg_color(conectar, COR_DESTAQUE, 0);
    lv_obj_set_style_bg_opa(conectar, LV_OPA_80, LV_STATE_PRESSED);
    lv_obj_set_style_border_width(conectar, 0, 0);
    lv_obj_set_style_radius(conectar, RAIO_MIUDO, 0);
    lv_obj_set_style_shadow_width(conectar, 0, 0);
    lv_obj_add_event_cb(conectar, tocou_conectar, LV_EVENT_CLICKED, NULL);
    lv_obj_t *rc = lv_label_create(conectar);
    lv_label_set_text(rc, "Conectar");
    lv_obj_set_style_text_color(rc, COR_DESTAQUE_TINTA, 0);
    lv_obj_set_style_text_font(rc, &fonte_16, 0);
    lv_obj_center(rc);

    /*
     * O ESTADO DA CONEXAO FICA NO PE DA COLUNA, ao lado do botao que o muda.
     *
     * E o unico lugar onde ele faz trabalho: quem acabou de tocar em "Conectar"
     * esta olhando para aquele botao, e a resposta tem de aparecer no campo de
     * visao dele. No topo da coluna, seria lida antes de qualquer tentativa e
     * ignorada depois.
     */
    rot_estado = lv_label_create(esq);
    lv_obj_set_style_text_font(rot_estado, &fonte_16, 0);
    lv_label_set_long_mode(rot_estado, LV_LABEL_LONG_DOT);
    lv_obj_set_width(rot_estado, 262);
    lv_obj_set_pos(rot_estado, 188, 374);
    if (rede_conectada()) {
        lv_label_set_text_fmt(rot_estado, LV_SYMBOL_WIFI "  %s", rede_endereco());
        lv_obj_set_style_text_color(rot_estado, COR_CERTO, 0);
    } else {
        const char *porque = rede_por_que_nao();
        lv_label_set_text_fmt(rot_estado, "%s", porque ? porque : "sem conexao");
        lv_obj_set_style_text_color(rot_estado, COR_ATENCAO, 0);
    }

    /*
     * A FICHA DA CONEXAO, embaixo de tudo: o que o terminal sabe da rede em que
     * esta. E o que alguem le por telefone quando o Optmize "nao aparece" --
     * endereco daqui, e endereco do servidor.
     */
    lv_obj_t *risco_da_rede = lv_obj_create(esq);
    lv_obj_set_size(risco_da_rede, 450, 1);
    lv_obj_set_pos(risco_da_rede, 0, 416);
    lv_obj_set_style_bg_color(risco_da_rede, COR_BORDA_SUAVE, 0);
    lv_obj_set_style_border_width(risco_da_rede, 0, 0);
    lv_obj_remove_flag(risco_da_rede, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(risco_da_rede, LV_OBJ_FLAG_CLICKABLE);

    par_da_ficha(esq, 430, "Endereco", rede_conectada() ? rede_endereco() : "--", 450);
    par_da_ficha(esq, 456, "Servidor", optmize_servidor(), 450);

    /* --- direita: tela e audio --- */

    lv_obj_t *dir = lv_obj_create(area);
    lv_obj_set_size(dir, 470, 300);
    lv_obj_set_pos(dir, 530, 18);
    lv_obj_set_style_bg_color(dir, COR_CARTAO, 0);
    lv_obj_set_style_border_color(dir, COR_BORDA, 0);
    lv_obj_set_style_border_width(dir, 1, 0);
    lv_obj_set_style_radius(dir, RAIO, 0);
    lv_obj_set_style_pad_all(dir, 18, 0);
    lv_obj_remove_flag(dir, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *t2 = lv_label_create(dir);
    lv_label_set_text(t2, "TELA E SOM");
    lv_obj_set_style_text_color(t2, COR_DESTAQUE, 0);
    lv_obj_set_style_text_font(t2, &fonte_16, 0);
    lv_obj_set_style_text_letter_space(t2, 2, 0);
    lv_obj_set_pos(t2, 0, 0);

    deslizante(dir, "Brilho da tela", 50, 100, mudou_o_brilho);
    deslizante(dir, "Volume da voz", 140, voz_volume(), mudou_o_volume_da_voz);
    deslizante(dir, "Ganho do microfone", 230, 50, mudou_o_ganho);

    /*
     * O ENDERECO DO SERVIDOR.
     *
     * Sem ele a placa le o QR e nao tem a quem perguntar o que ele significa --
     * o codigo impresso e opaco de proposito (ver `optmize.c`). Fica aqui, e nao
     * no codigo, pelo mesmo motivo da senha: muda de grafica para grafica, e
     * quem instala o aparelho na parede nao tem compilador.
     *
     * Vai com a porta junto (`192.168.0.194:8000`) porque o servidor nao
     * atende na 80, e um endereco sem porta falharia com "nao respondeu" --
     * mensagem que manda procurar problema na rede, e nao no campo.
     */
    lv_obj_t *t3 = lv_label_create(dir);
    lv_label_set_text(t3, "Servidor do Optmize");
    lv_obj_set_style_text_color(t3, COR_TEXTO, 0);
    lv_obj_set_style_text_font(t3, &fonte_16, 0);
    lv_obj_set_pos(t3, 0, 200);

    campo_servidor = lv_textarea_create(dir);
    lv_obj_set_size(campo_servidor, 290, 48);
    lv_obj_set_pos(campo_servidor, 0, 224);
    lv_textarea_set_one_line(campo_servidor, true);
    lv_textarea_set_placeholder_text(campo_servidor, "192.168.0.194:8000");
    lv_textarea_set_text(campo_servidor, optmize_servidor());
    lv_obj_add_event_cb(campo_servidor, campo_em_foco, LV_EVENT_ALL, NULL);

    lv_obj_t *salvar = lv_button_create(dir);
    lv_obj_set_size(salvar, 120, 48);
    lv_obj_set_pos(salvar, 300, 224);
    lv_obj_set_style_bg_color(salvar, COR_BORDA, 0);
    lv_obj_add_event_cb(salvar, tocou_salvar_servidor, LV_EVENT_CLICKED, NULL);
    lv_obj_t *rsv = lv_label_create(salvar);
    lv_label_set_text(rsv, "Salvar");
    lv_obj_set_style_text_font(rsv, &fonte_16, 0);
    lv_obj_center(rsv);

    /* --- o teclado, escondido ate alguem tocar na senha --- */

    teclado = lv_keyboard_create(area);
    lv_obj_set_size(teclado, LV_PCT(100), 250);
    lv_obj_align(teclado, LV_ALIGN_BOTTOM_MID, 0, 0);
    lv_obj_add_flag(teclado, LV_OBJ_FLAG_HIDDEN);

    relogio_do_estado = lv_timer_create(conferir_o_estado, 1000, NULL);
    conferir_o_estado(NULL);
}

void app_ajustes_desmontar(void)
{
    /*
     * `montado` primeiro: a tarefa de varredura pode estar no meio de uma busca,
     * e ao terminar ela confere esta bandeira antes de mexer na tela. Sem isso,
     * ela preencheria objetos que a casca ja apagou.
     */
    montado = false;

    /*
     * O relogio morre com a tela. Um timer do LVGL sobrevive aos objetos que
     * ele escreve -- deixa-lo vivo seria escrever em memoria ja liberada no
     * proximo segundo.
     */
    if (relogio_do_estado != NULL) {
        lv_timer_delete(relogio_do_estado);
        relogio_do_estado = NULL;
    }

    lista_de_redes = NULL;
    campo_senha = NULL;
    teclado = NULL;
    rot_estado = NULL;
    rot_escolhida = NULL;
    campo_servidor = NULL;
}
