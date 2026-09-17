/*
 * ===========================================================================
 * APP DE AJUSTES — rede, brilho e audio
 * ===========================================================================
 *
 * Tres coisas que quem instala o aparelho precisa mexer sem compilador:
 *
 *   REDE      escolhida numa lista do que esta no ar, e a senha digitada
 *   SERVIDOR  o endereco do Optmize, sem o qual o QR lido nao quer dizer nada
 *   BRILHO    a tela vai para uma parede -- o que serve numa sala escura cega
 *             numa sala clara, e vice-versa
 *   AUDIO     o volume da voz, e o ganho do microfone
 *
 * ---------------------------------------------------------------------------
 * A GRADE
 * ---------------------------------------------------------------------------
 *
 * Duas colunas de 482, tres cartoes. A rede ocupa a coluna inteira da esquerda
 * porque e a unica coisa aqui com varios passos em ordem -- buscar, escolher,
 * digitar, conectar --, e cortar isso em dois cartoes cortaria a sequencia.
 *
 * A direita, dois cartoes: o servidor em cima, curto, e tela e som embaixo.
 * As medidas estao todas juntas num bloco de `#define` perto da montagem; foi
 * assim que se descobriu que as duas colunas tinham alturas diferentes.
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

/*
 * A GRADE DESTA TELA, num lugar so.
 *
 * Os numeros estavam espalhados pelas chamadas, e foi assim que a coluna da
 * direita ficou com 300 de altura enquanto a esquerda tinha 506: ninguem
 * compara dois numeros escritos a duzentas linhas de distancia. Aqui embaixo
 * eles ficam um sobre o outro, e um erro de conta se ve a olho nu.
 */
#define MARGEM        20
#define TOPO          18
#define COLUNA        482      /* (1024 - 3 * MARGEM) / 2 */
#define DIREITA_X     (MARGEM + COLUNA + MARGEM)
#define RESPIRO       18       /* o `pad_all` dos cartoes */
#define DENTRO        (COLUNA - 2 * RESPIRO)   /* 446: a largura util */
#define ALTURA_TOTAL  506      /* TOPO + isto + MARGEM = 544, a area inteira */
#define ALTURA_DE_CIMA 176
#define ENTRE_CARTOES   16

/*
 * A CONTA DE CIMA PARA BAIXO, com a altura de linha MEDIDA e nao chutada:
 * `fonte_16` tem `line_height = 19` (ver `fonte-16.c`).
 *
 *   esquerda   470 uteis: ficha acaba em 440 + 19 = 459
 *   direita, em cima      140 uteis: apoio comeca em 92 e cabe em DUAS linhas
 *   direita, embaixo      278 uteis: o ultimo deslizante acaba em 270
 *
 * Tres cartoes com folga de um digito cada. Foi apertado assim de proposito:
 * a versao anterior desta tela tinha a ficha cortada embaixo e o campo do
 * servidor por cima do deslizante do microfone, e os dois defeitos eram a
 * mesma coisa -- ninguem tinha somado nada.
 */

/*
 * A ALTURA DO TECLADO, e o quanto o cartao da rede sobe quando ele aparece.
 *
 * A area util tem 544 (600 menos a barra do topo), entao o teclado ocupa de
 * 334 para baixo. O campo da senha termina em 360 -- 26 debaixo do teclado --,
 * e por isso o cartao sobe 40: os 26 que faltam, mais uma folga que impede o
 * campo de ficar encostado na primeira fileira de teclas.
 */
#define ALTURA_DO_TECLADO 210
#define SUBIDA_DO_CARTAO   40

static lv_obj_t *lista_de_redes;
static lv_obj_t *campo_senha;
static lv_obj_t *teclado;
static lv_obj_t *rot_estado;
static lv_obj_t *rot_escolhida;
static lv_obj_t *campo_servidor;

/*
 * O CARTAO DA REDE, guardado porque ele SE MEXE: quando o teclado sobe para a
 * senha, ele sobe junto (ver `campo_em_foco`).
 */
static lv_obj_t *cartao_da_rede;

/*
 * O ultimo deslizante montado, e o rotulo do valor dele -- para quem precisa
 * mexer neles depois de criados (o microfone, que sai apagado).
 */
static lv_obj_t *ultimo_deslizante;
static lv_obj_t *ultimo_valor;

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

    /*
     * ESTE E O UNICO LUGAR QUE ESCREVE NESTE ROTULO.
     *
     * A montagem tambem escrevia, com outras palavras e outra cor, e um segundo
     * depois este relogio apagava aquilo -- a tela trocava de aparencia sozinha
     * sem nada ter acontecido. Agora a montagem so chama esta funcao.
     */
    if (rede_conectada()) {
        lv_label_set_text_fmt(rot_estado, LV_SYMBOL_WIFI "  %s", rede_endereco());
        lv_obj_set_style_text_color(rot_estado, COR_CERTO, 0);
        return;
    }

    const char *porque = rede_por_que_nao();
    if (porque != NULL) {
        lv_label_set_text(rot_estado, porque);
        lv_obj_set_style_text_color(rot_estado, COR_ATENCAO, 0);
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

/*
 * O TECLADO SO APARECE QUANDO O CAMPO E TOCADO, e some quando ele sai.
 *
 * Duas coisas estavam erradas aqui:
 *
 * O CAMPO DA SENHA FICAVA DEBAIXO DO TECLADO. Ele termina em 360 da area util,
 * o teclado comeca em 334, e a pessoa digitava a senha sem ver o campo -- que e
 * exatamente o defeito que o botao de revelar existe para evitar. Agora o
 * cartao da rede sobe enquanto o teclado esta no ar, e volta ao sair.
 *
 * O "X" DO TECLADO NAO FECHAVA NADA. Ele manda `LV_EVENT_CANCEL`, que nao
 * estava na lista; quem tocava no X via o teclado continuar ali, o que parece
 * travamento. O `LV_EVENT_READY` do "OK" ja estava.
 */
static void campo_em_foco(lv_event_t *e)
{
    lv_obj_t *campo = lv_event_get_target(e);
    const lv_event_code_t codigo = lv_event_get_code(e);

    if (codigo == LV_EVENT_FOCUSED) {
        lv_keyboard_set_textarea(teclado, campo);
        lv_obj_remove_flag(teclado, LV_OBJ_FLAG_HIDDEN);

        /* So a senha fica no caminho; o endereco do servidor esta bem acima. */
        if (campo == campo_senha && cartao_da_rede != NULL) {
            lv_obj_set_y(cartao_da_rede, TOPO - SUBIDA_DO_CARTAO);
        }
    } else if (codigo == LV_EVENT_DEFOCUSED || codigo == LV_EVENT_READY ||
               codigo == LV_EVENT_CANCEL) {
        lv_keyboard_set_textarea(teclado, NULL);
        lv_obj_add_flag(teclado, LV_OBJ_FLAG_HIDDEN);

        if (cartao_da_rede != NULL) {
            lv_obj_set_y(cartao_da_rede, TOPO);
        }
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
static void deslizante(lv_obj_t *pai, const char *nome, int32_t y, int32_t largura,
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
    lv_obj_set_pos(valor, largura - 60, y);
    lv_label_set_text_fmt(valor, "%d%%", inicial);

    lv_obj_t *barra = lv_slider_create(pai);
    lv_obj_set_size(barra, largura, 18);
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

    ultimo_deslizante = barra;
    ultimo_valor = valor;
}

/* Um cartao vazio da grade. */
static lv_obj_t *cartao(lv_obj_t *area, int32_t x, int32_t y, int32_t altura)
{
    lv_obj_t *c = lv_obj_create(area);
    lv_obj_set_size(c, COLUNA, altura);
    lv_obj_set_pos(c, x, y);
    lv_obj_set_style_bg_color(c, COR_CARTAO, 0);
    lv_obj_set_style_border_color(c, COR_BORDA, 0);
    lv_obj_set_style_border_width(c, 1, 0);
    lv_obj_set_style_radius(c, RAIO, 0);
    lv_obj_set_style_pad_all(c, RESPIRO, 0);
    lv_obj_remove_flag(c, LV_OBJ_FLAG_SCROLLABLE);
    return c;
}

/* Um botao secundario: fundo de cartao claro, borda, sem sombra. */
static lv_obj_t *botao_calado(lv_obj_t *pai, int32_t x, int32_t y, int32_t l,
                              int32_t a, const char *texto, lv_event_cb_t ao_tocar)
{
    lv_obj_t *b = lv_button_create(pai);
    lv_obj_set_size(b, l, a);
    lv_obj_set_pos(b, x, y);
    lv_obj_set_style_bg_color(b, COR_CARTAO_SUAVE, 0);
    lv_obj_set_style_bg_color(b, COR_BORDA, LV_STATE_PRESSED);
    lv_obj_set_style_border_color(b, COR_BORDA, 0);
    lv_obj_set_style_border_width(b, 1, 0);
    lv_obj_set_style_radius(b, RAIO_MIUDO, 0);
    lv_obj_set_style_shadow_width(b, 0, 0);
    lv_obj_add_event_cb(b, ao_tocar, LV_EVENT_CLICKED, NULL);

    lv_obj_t *r = lv_label_create(b);
    lv_label_set_text(r, texto);
    lv_obj_set_style_text_color(r, COR_TEXTO, 0);
    lv_obj_set_style_text_font(r, &fonte_16, 0);
    lv_obj_center(r);
    return b;
}

/*
 * Um campo de texto escuro.
 *
 * Existe porque o campo do servidor nao tinha estilo nenhum e saia com as cores
 * de fabrica do LVGL -- fundo claro, letra escura -- no meio de uma tela preta.
 * Nao era uma escolha de design: era um campo que alguem esqueceu de vestir.
 */
static lv_obj_t *campo_escuro(lv_obj_t *pai, int32_t x, int32_t y, int32_t l,
                              const char *dica)
{
    lv_obj_t *c = lv_textarea_create(pai);
    lv_obj_set_size(c, l, 48);
    lv_obj_set_pos(c, x, y);
    lv_textarea_set_one_line(c, true);
    lv_textarea_set_placeholder_text(c, dica);
    lv_obj_set_style_bg_color(c, COR_FUNDO, 0);
    lv_obj_set_style_border_color(c, COR_BORDA_SUAVE, 0);
    lv_obj_set_style_border_color(c, COR_DESTAQUE, LV_STATE_FOCUSED);
    lv_obj_set_style_border_width(c, 1, 0);
    lv_obj_set_style_radius(c, RAIO_MIUDO, 0);
    lv_obj_set_style_text_color(c, COR_TEXTO, 0);
    lv_obj_set_style_text_font(c, &fonte_16, 0);
    lv_obj_add_event_cb(c, campo_em_foco, LV_EVENT_ALL, NULL);
    return c;
}

/* Uma linha de apoio: corpo pequeno, cor fraca, quebrando em varias linhas. */
static void apoio(lv_obj_t *pai, int32_t y, int32_t l, const char *texto)
{
    lv_obj_t *r = lv_label_create(pai);
    lv_label_set_text(r, texto);
    lv_obj_set_style_text_color(r, COR_FRACA, 0);
    lv_obj_set_style_text_font(r, &fonte_16, 0);
    lv_label_set_long_mode(r, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(r, l);
    lv_obj_set_pos(r, 0, y);
}

void app_ajustes_montar(lv_obj_t *area)
{
    montado = true;
    snprintf(escolhida, sizeof(escolhida), "%s", rede_nome_da_rede());

    /* ================================================== esquerda: a rede */

    cartao_da_rede = cartao(area, MARGEM, TOPO, ALTURA_TOTAL);
    lv_obj_t *esq = cartao_da_rede;

    titulo_de_bloco(esq, 4, "REDE SEM FIO");
    botao_calado(esq, DENTRO - 130, 0, 130, 40,
                 LV_SYMBOL_REFRESH "  buscar", tocou_procurar);

    lista_de_redes = lv_list_create(esq);
    lv_obj_set_size(lista_de_redes, DENTRO, 190);
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
    lv_label_set_long_mode(rot_escolhida, LV_LABEL_LONG_DOT);
    lv_obj_set_width(rot_escolhida, DENTRO);
    lv_obj_set_pos(rot_escolhida, 0, 250);
    if (escolhida[0]) {
        lv_label_set_text_fmt(rot_escolhida, "rede: %s", escolhida);
        lv_obj_set_style_text_color(rot_escolhida, COR_TEXTO, 0);
    } else {
        lv_label_set_text(rot_escolhida, "nenhuma rede escolhida");
        lv_obj_set_style_text_color(rot_escolhida, COR_APOIO, 0);
    }

    campo_senha = campo_escuro(esq, 0, 276, DENTRO - 65, "senha");
    lv_textarea_set_password_mode(campo_senha, true);

    lv_obj_t *revelar = botao_calado(esq, DENTRO - 55, 276, 55, 48,
                                     LV_SYMBOL_EYE_CLOSE, tocou_revelar);
    lv_obj_set_style_text_font(lv_obj_get_child(revelar, 0), &fonte_22, 0);

    lv_obj_t *conectar = lv_button_create(esq);
    lv_obj_set_size(conectar, 170, 48);
    lv_obj_set_pos(conectar, 0, 338);
    /*
     * O UNICO BOTAO LARANJA DESTA TELA. Tudo o mais aqui e secundario --
     * buscar, revelar a senha, salvar o endereco --, e dar laranja a todos
     * faria a tela inteira gritar igual. O acento so vale enquanto for raro.
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
     * O ESTADO DA CONEXAO FICA AO LADO DO BOTAO QUE O MUDA.
     *
     * E o unico lugar onde ele faz trabalho: quem acabou de tocar em "Conectar"
     * esta olhando para aquele botao, e a resposta tem de aparecer no campo de
     * visao dele. No topo do cartao, seria lida antes de qualquer tentativa e
     * ignorada depois.
     *
     * Alinhado pelo MEIO do botao (338 + (48 - 22) / 2), e nao pelo topo dele:
     * uma linha de texto ao lado de um botao alto, encostada em cima, parece
     * ter escorregado.
     */
    rot_estado = lv_label_create(esq);
    lv_obj_set_style_text_font(rot_estado, &fonte_16, 0);
    lv_label_set_long_mode(rot_estado, LV_LABEL_LONG_DOT);
    lv_obj_set_width(rot_estado, DENTRO - 186);
    lv_obj_set_pos(rot_estado, 186, 351);

    /*
     * A FICHA DA CONEXAO, no pe do cartao: o que o terminal sabe da rede em que
     * esta. E o que alguem le por telefone quando o Optmize "nao aparece" --
     * endereco daqui, e endereco do servidor.
     */
    lv_obj_t *risco = lv_obj_create(esq);
    lv_obj_set_size(risco, DENTRO, 1);
    lv_obj_set_pos(risco, 0, 402);
    lv_obj_set_style_bg_color(risco, COR_BORDA_SUAVE, 0);
    lv_obj_set_style_border_width(risco, 0, 0);
    lv_obj_remove_flag(risco, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(risco, LV_OBJ_FLAG_CLICKABLE);

    par_da_ficha(esq, 414, "Endereco",
                 rede_conectada() ? rede_endereco() : "--", DENTRO);
    par_da_ficha(esq, 440, "Servidor", optmize_servidor(), DENTRO);

    /* ====================================== direita, em cima: o servidor */

    /*
     * O ENDERECO DO SERVIDOR SAIU DE DENTRO DE "TELA E SOM".
     *
     * Ele estava no fim daquele cartao, debaixo do controle de volume, e nao
     * tem nada a ver com tela nem com som: e o segundo ajuste de REDE desta
     * pagina. Pior: ali embaixo ele passava POR CIMA do deslizante do
     * microfone, os dois disputando as mesmas linhas.
     *
     * Vai com a porta junto (`192.168.0.194:8000`) porque o servidor nao
     * atende na 80, e um endereco sem porta falharia com "nao respondeu" --
     * mensagem que manda procurar problema na rede, e nao no campo.
     */
    lv_obj_t *cima = cartao(area, DIREITA_X, TOPO, ALTURA_DE_CIMA);
    titulo_de_bloco(cima, 4, "SERVIDOR DO OPTMIZE");

    campo_servidor = campo_escuro(cima, 0, 36, DENTRO - 146, "192.168.0.194:8000");
    lv_textarea_set_text(campo_servidor, optmize_servidor());

    botao_calado(cima, DENTRO - 136, 36, 136, 48, "Salvar", tocou_salvar_servidor);

    apoio(cima, 92, DENTRO,
          "Sem ele o terminal le o QR e nao tem a quem perguntar o que ele diz.");

    /* ================================== direita, embaixo: a tela e o som */

    lv_obj_t *baixo = cartao(area, DIREITA_X, TOPO + ALTURA_DE_CIMA + ENTRE_CARTOES,
                             ALTURA_TOTAL - ALTURA_DE_CIMA - ENTRE_CARTOES);
    titulo_de_bloco(baixo, 4, "TELA E SOM");

    deslizante(baixo, "Brilho da tela", 48, DENTRO, 100, mudou_o_brilho);
    deslizante(baixo, "Volume da voz", 136, DENTRO, voz_volume(),
               mudou_o_volume_da_voz);

    /*
     * O GANHO DO MICROFONE SAI APAGADO, e nao igual aos outros dois.
     *
     * Ele mostra um numero e nao chega ao codec: o microfone existe (um ES7210
     * em 0x40, ver `prova-de-audio.c`), mas nada no sistema o escuta ainda. Com
     * a mesma cara dos outros, ele MENTE -- alguem arrasta, nada acontece, e
     * passa a desconfiar tambem do volume, que funciona.
     *
     * Apagado e com o motivo escrito embaixo, ele deixa de mentir sem sumir da
     * tela, que e onde ele precisa estar no dia em que alguem escutar o
     * microfone.
     */
    deslizante(baixo, "Ganho do microfone", 224, DENTRO, 50, mudou_o_ganho);
    lv_obj_set_style_opa(ultimo_deslizante, LV_OPA_40, 0);
    /*
     * ONDE OS OUTROS DOIS MOSTRAM A PORCENTAGEM, ESTE MOSTRA "sem uso".
     *
     * Um numero que nao governa nada e pior que nenhum: alguem arrasta, le
     * "70%", nada acontece, e passa a desconfiar tambem do volume -- que
     * funciona. A palavra ocupa a mesma linha, entao nao custa altura nenhuma
     * (e a conta la em cima nao tem altura sobrando para uma linha a mais).
     *
     * Ele fica na tela, e nao sai dela, porque o microfone EXISTE: um ES7210 em
     * 0x40, ver `prova-de-audio.c`. O que falta e alguem escutar.
     */
    lv_obj_set_width(ultimo_valor, 100);
    lv_obj_set_pos(ultimo_valor, DENTRO - 100, 224);
    lv_label_set_text(ultimo_valor, "sem uso");
    lv_obj_set_style_text_color(ultimo_valor, COR_FRACA, 0);

    /* ============================== o teclado, escondido ate alguem tocar */

    /*
     * 210 DE ALTURA, e nao 250. Com 250 o teclado subia ate o campo da senha e
     * tapava justamente o campo que a pessoa estava digitando -- digitar senha
     * as cegas e exatamente o defeito que o botao de revelar existe para
     * evitar. Em 1024 de largura, 210 ainda dao teclas de 102 x 50.
     */
    teclado = lv_keyboard_create(area);
    lv_obj_set_size(teclado, LV_PCT(100), ALTURA_DO_TECLADO);
    lv_obj_align(teclado, LV_ALIGN_BOTTOM_MID, 0, 0);
    lv_obj_set_style_bg_color(teclado, COR_BARRA, 0);
    lv_obj_set_style_bg_color(teclado, COR_CARTAO, LV_PART_ITEMS);
    lv_obj_set_style_text_color(teclado, COR_TEXTO, LV_PART_ITEMS);
    lv_obj_set_style_border_color(teclado, COR_BORDA_SUAVE, LV_PART_ITEMS);
    lv_obj_set_style_border_width(teclado, 1, LV_PART_ITEMS);
    lv_obj_set_style_radius(teclado, RAIO_MIUDO, LV_PART_ITEMS);
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

    cartao_da_rede = NULL;
    ultimo_deslizante = NULL;
    ultimo_valor = NULL;
    lista_de_redes = NULL;
    campo_senha = NULL;
    teclado = NULL;
    rot_estado = NULL;
    rot_escolhida = NULL;
    campo_servidor = NULL;
}
