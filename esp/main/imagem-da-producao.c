/*
 * ===========================================================================
 * A IMAGEM DA PRODUCAO — ver a arte, e ver de perto
 * ===========================================================================
 *
 * Quem esta na calandra com o tecido na mao precisa comparar o que saiu com o
 * que deveria sair. Um nome de arquivo -- "MORANGO DOCE - CROPPED 03" -- nao
 * responde isso. A arte, sim.
 *
 * ---------------------------------------------------------------------------
 * DOIS TAMANHOS, UMA SO COPIA NA MEMORIA
 * ---------------------------------------------------------------------------
 *
 * INTEIRA, dentro da tela do item. E o que a pessoa ve sem pedir nada: a arte
 *          ao lado do nome e da metragem, enquanto decide.
 *
 * DE PERTO, na tela toda, ao tocar nela. Defeito de impressao e coisa de
 *          centimetro, e uma arte de 8 metros encolhida para caber num painel
 *          de 480 pixels nao mostra mancha nenhuma.
 *
 * Os dois desenham O MESMO buffer decodificado -- sao dois objetos do LVGL
 * apontando para um descritor so. A imagem nao e baixada nem decodificada de
 * novo para ampliar: seriam 2 MB e alguns segundos para mostrar o que ja esta
 * na memoria.
 *
 * ---------------------------------------------------------------------------
 * DE ONDE VEM A IMAGEM
 * ---------------------------------------------------------------------------
 *
 * Do preview que a propria impressora gerou ao rodar o arquivo. O servidor a
 * redimensiona e a re-codifica antes de mandar, por duas razoes que a placa nao
 * resolveria sozinha: o original tem 692 KB, e pode ser PNG. O decodificador
 * daqui le JPEG de linha de base e mais nada.
 *
 * ---------------------------------------------------------------------------
 * O ZOOM, E POR QUE NAO E `lv_image_set_scale`
 * ---------------------------------------------------------------------------
 *
 * `lv_image_set_scale` desenha maior sem mudar o tamanho do objeto. O objeto
 * continua pequeno, a caixa em volta nao descobre que ha o que rolar, e a
 * imagem ampliada fica presa: da para ver o meio dela ampliado e nunca as
 * bordas.
 *
 * Na tela cheia o objeto CRESCE de verdade -- `lv_obj_set_size` com o tamanho
 * ampliado, e `LV_IMAGE_ALIGN_STRETCH` para o desenho acompanhar. Ai a caixa em
 * volta ve um filho maior que ela e o arrastar com o dedo passa a funcionar
 * sozinho, porque e disso que rolagem trata.
 *
 * (No painel inteiro e `LV_IMAGE_ALIGN_CONTAIN`, que faz a conta de caber
 * sozinho. Ali nao ha o que rolar.)
 *
 * ---------------------------------------------------------------------------
 * ONDE CADA COISA RODA
 * ---------------------------------------------------------------------------
 *
 * O download e a decodificacao numa tarefa de fundo. Baixar meio megabyte leva
 * segundos e decodificar leva dezenas de milissegundos; qualquer um dos dois na
 * tarefa do LVGL congela a tela inteira -- e congelar bem na hora em que alguem
 * pediu para ver a imagem parece a placa ter travado.
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "driver/jpeg_decode.h"
#include "esp_heap_caps.h"
#include "esp_log.h"

#include "bsp/esp-bsp.h"
#include "interface.h"
#include "optmize.h"

static const char *TAG = "imagem";

/*
 * A LARGURA QUE SE PEDE AO SERVIDOR.
 *
 * 800 num aparelho de tela 1024 nao e desperdicio. O painel do item tem 480 de
 * largura, e uma arte de calandra e comprida: cabe ali com uns 280. Os 800 sao
 * a reserva para a tela cheia -- e o detalhe que ainda existe quando alguem
 * amplia para olhar uma mancha.
 *
 * Pedir 1024 daria mais um pouco e custaria 3,4 MB de PSRAM decodificada por
 * imagem, contra 2. Nao paga.
 */
#define LARGURA_PEDIDA 800

/*
 * Quanto o zoom anda a cada toque, e ate onde -- em porcento do tamanho real
 * da imagem BAIXADA, nao da arte original.
 *
 * O teto e 200 porque em 100 cada pixel do arquivo ja ocupa um pixel da tela.
 * Dali para cima nao aparece detalhe nenhum novo: o que cresce e o borrao. Os
 * 200 sao a folga para quem quer a mancha maior mesmo sabendo disso.
 *
 * Uma arte de 8 metros cabe em 1292 linhas aqui -- olhar mais de perto de
 * verdade exigiria pedir ao servidor um PEDACO em tamanho maior, e nao ampliar
 * o que ja veio. Isso e outro trabalho, e este teto e onde ele comeca.
 */
#define PASSO_DO_ZOOM 40
#define ZOOM_MAXIMO   200

static lv_obj_t *raiz;         /* a area do app: onde a tela cheia nasce */
static lv_obj_t *painel;       /* a moldura do tamanho do item */
static lv_obj_t *inteira;      /* a imagem dentro do painel */
static lv_obj_t *rot_estado;   /* "carregando...", ou o que deu errado */

static lv_obj_t *cortina;      /* a tela toda, quando alguem quer de perto */
static lv_obj_t *caixa;        /* a area que rola, dentro da cortina */
static lv_obj_t *figura;       /* a imagem ampliada */
static lv_obj_t *rot_zoom;

static lv_image_dsc_t descritor;
static uint8_t *pixels;        /* RGB565 decodificado -- nosso, ate trocar de item */

static int largura_real, altura_real;
static int zoom;               /* porcento */
static int zoom_de_ajuste;     /* o que faz a imagem caber inteira */

static char o_titulo[96];

/*
 * UMA GERACAO POR ITEM.
 *
 * O numero anda a cada troca. Um download em voo responde com o numero que
 * pegou na partida, e se ele nao for mais o atual a resposta se joga fora
 * sozinha -- e o que impede a arte do item 3 de aparecer na tela do item 4
 * quando a rede demora e o dedo nao.
 */
static uint32_t geracao;
static uint32_t geracao_pedida;

static void soltar_os_pixels(void)
{
    if (pixels != NULL) {
        free(pixels);
        pixels = NULL;
    }
}

static void avisar(const char *texto, lv_color_t cor)
{
    if (rot_estado == NULL) {
        return;
    }
    lv_label_set_text(rot_estado, texto);
    lv_obj_set_style_text_color(rot_estado, cor, 0);
    lv_obj_remove_flag(rot_estado, LV_OBJ_FLAG_HIDDEN);
}

/* ------------------------------------------------------- o zoom */

static void aplicar_o_zoom(int novo, bool manter_o_centro)
{
    if (figura == NULL || caixa == NULL) {
        return;
    }
    /*
     * O teto primeiro, o piso depois -- nao o contrario. Numa imagem pequena o
     * ajuste ja passa dos 200%, e aplicar o teto por ultimo a encolheria para
     * menos do que cabe: o botao de "ajustar" deixaria de ajustar.
     */
    if (novo > ZOOM_MAXIMO)    novo = ZOOM_MAXIMO;
    if (novo < zoom_de_ajuste) novo = zoom_de_ajuste;

    const int larg_antes = (largura_real * zoom) / 100;
    const int alt_antes  = (altura_real  * zoom) / 100;
    const int vw = lv_obj_get_content_width(caixa);
    const int vh = lv_obj_get_content_height(caixa);

    /*
     * QUE PONTO DA IMAGEM ESTA NO MEIO DA TELA, em fracao do total. Guardado
     * antes e restaurado depois, o zoom passa a ampliar o que a pessoa esta
     * olhando. Sem isso ele amplia sempre o canto superior esquerdo, e quem
     * estava examinando uma mancha no meio a perde de vista a cada toque.
     */
    float fx = 0.5f, fy = 0.5f;
    if (manter_o_centro && larg_antes > 0 && alt_antes > 0) {
        fx = (lv_obj_get_scroll_x(caixa) + vw / 2.0f) / larg_antes;
        fy = (lv_obj_get_scroll_y(caixa) + vh / 2.0f) / alt_antes;
    }

    zoom = novo;
    const int lz = (largura_real * zoom) / 100;
    const int az = (altura_real  * zoom) / 100;

    lv_obj_set_size(figura, lz, az);
    /* Menor que a area: centrada. Maior: encostada no canto, e o dedo passeia. */
    lv_obj_set_pos(figura, lz < vw ? (vw - lz) / 2 : 0, az < vh ? (vh - az) / 2 : 0);
    lv_obj_update_layout(caixa);

    if (lz > vw) {
        int x = (int)(fx * lz) - vw / 2;
        if (x < 0) x = 0;
        if (x > lz - vw) x = lz - vw;
        lv_obj_scroll_to_x(caixa, x, LV_ANIM_OFF);
    }
    if (az > vh) {
        int y = (int)(fy * az) - vh / 2;
        if (y < 0) y = 0;
        if (y > az - vh) y = az - vh;
        lv_obj_scroll_to_y(caixa, y, LV_ANIM_OFF);
    }

    if (rot_zoom != NULL) {
        lv_label_set_text_fmt(rot_zoom, "%d%%", zoom);
    }
}

static void tocou_mais(lv_event_t *e)    { (void)e; aplicar_o_zoom(zoom + PASSO_DO_ZOOM, true); }
static void tocou_menos(lv_event_t *e)   { (void)e; aplicar_o_zoom(zoom - PASSO_DO_ZOOM, true); }
static void tocou_ajustar(lv_event_t *e) { (void)e; aplicar_o_zoom(zoom_de_ajuste, false); }

/* --------------------------------------------------- a tela cheia */

void imagem_da_producao_fechar_o_zoom(void)
{
    if (cortina != NULL) {
        lv_obj_delete(cortina);
        cortina = NULL;
    }
    caixa = NULL;
    figura = NULL;
    rot_zoom = NULL;
}

static void tocou_fechar_o_zoom(lv_event_t *e)
{
    (void)e;
    imagem_da_producao_fechar_o_zoom();
}

static void tocou_a_imagem(lv_event_t *e)
{
    (void)e;
    if (pixels == NULL || raiz == NULL || cortina != NULL) {
        return;   /* ainda carregando, ou ja esta aberta */
    }

    cortina = lv_obj_create(raiz);
    lv_obj_set_size(cortina, LV_PCT(100), LV_PCT(100));
    lv_obj_set_pos(cortina, 0, 0);
    lv_obj_set_style_bg_color(cortina, COR_FUNDO, 0);
    lv_obj_set_style_bg_opa(cortina, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(cortina, 0, 0);
    lv_obj_set_style_radius(cortina, 0, 0);
    lv_obj_set_style_pad_all(cortina, 0, 0);
    lv_obj_remove_flag(cortina, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *nome = lv_label_create(cortina);
    lv_label_set_text(nome, o_titulo);
    lv_obj_set_style_text_color(nome, COR_TEXTO, 0);
    lv_obj_set_style_text_font(nome, &lv_font_montserrat_16, 0);
    lv_label_set_long_mode(nome, LV_LABEL_LONG_DOT);
    lv_obj_set_width(nome, 500);
    lv_obj_set_pos(nome, 16, 14);

    rot_zoom = lv_label_create(cortina);
    lv_label_set_text(rot_zoom, "");
    lv_obj_set_style_text_color(rot_zoom, COR_APOIO, 0);
    lv_obj_set_style_text_font(rot_zoom, &lv_font_montserrat_16, 0);
    lv_obj_set_pos(rot_zoom, 16, 38);

    /*
     * Os botoes tem 76 de largura e 52 de altura. Tamanho de dedo com luva, a
     * mesma conta dos botoes de sim e nao -- e aqui errar o alvo e so chato,
     * mas errar SEMPRE e o que faz alguem parar de usar a tela.
     */
    const struct { const char *r; lv_event_cb_t f; int x; } botoes[] = {
        { LV_SYMBOL_MINUS, tocou_menos,        600 },
        { LV_SYMBOL_PLUS,  tocou_mais,         684 },
        { LV_SYMBOL_LOOP,  tocou_ajustar,      768 },
        { LV_SYMBOL_CLOSE, tocou_fechar_o_zoom, 880 },
    };
    for (int i = 0; i < 4; i++) {
        lv_obj_t *b = lv_button_create(cortina);
        lv_obj_set_size(b, 76, 52);
        lv_obj_set_pos(b, botoes[i].x, 12);
        lv_obj_set_style_bg_color(b, i == 3 ? COR_DESTAQUE : COR_CARTAO, 0);
        lv_obj_set_style_border_color(b, COR_BORDA, 0);
        lv_obj_set_style_border_width(b, 1, 0);
        lv_obj_add_event_cb(b, botoes[i].f, LV_EVENT_CLICKED, NULL);

        lv_obj_t *r = lv_label_create(b);
        lv_label_set_text(r, botoes[i].r);
        lv_obj_set_style_text_font(r, &lv_font_montserrat_22, 0);
        lv_obj_set_style_text_color(r, i == 3 ? lv_color_black() : COR_TEXTO, 0);
        lv_obj_center(r);
    }

    caixa = lv_obj_create(cortina);
    lv_obj_set_size(caixa, LV_PCT(100), LV_VER_RES - 56 - 76);
    lv_obj_set_pos(caixa, 0, 76);
    lv_obj_set_style_bg_color(caixa, lv_color_black(), 0);
    lv_obj_set_style_border_width(caixa, 0, 0);
    lv_obj_set_style_radius(caixa, 0, 0);
    lv_obj_set_style_pad_all(caixa, 0, 0);
    lv_obj_set_scroll_dir(caixa, LV_DIR_ALL);
    /*
     * Sem elastico nas bordas. Numa foto ampliada, o "puxa e volta" faz a
     * imagem parecer escorregar da mao -- e aqui o dedo esta posicionando um
     * detalhe, nao folheando uma lista.
     */
    lv_obj_remove_flag(caixa, LV_OBJ_FLAG_SCROLL_ELASTIC | LV_OBJ_FLAG_SCROLL_MOMENTUM);

    figura = lv_image_create(caixa);
    lv_image_set_src(figura, &descritor);
    lv_image_set_inner_align(figura, LV_IMAGE_ALIGN_STRETCH);

    /* O ajuste e o menor dos dois lados: e o que faz a imagem INTEIRA caber. */
    const int vw = lv_obj_get_content_width(caixa);
    const int vh = lv_obj_get_content_height(caixa);
    const int por_largura = (vw * 100) / largura_real;
    const int por_altura  = (vh * 100) / altura_real;
    zoom_de_ajuste = por_largura < por_altura ? por_largura : por_altura;
    if (zoom_de_ajuste < 5) zoom_de_ajuste = 5;

    zoom = zoom_de_ajuste;
    aplicar_o_zoom(zoom_de_ajuste, false);
}

/* ---------------------------------------------------------- fechar */

void imagem_da_producao_fechar(void)
{
    /*
     * A geracao anda ANTES de tudo. Se ha um download em voo, a resposta dele
     * chega depois desta linha e vai se ver com um numero velho -- e se
     * descarta sozinha em vez de desenhar numa tela que nao existe mais.
     */
    geracao++;

    imagem_da_producao_fechar_o_zoom();

    if (painel != NULL) {
        lv_obj_delete(painel);
        painel = NULL;
    }
    raiz = NULL;
    inteira = NULL;
    rot_estado = NULL;
    soltar_os_pixels();
}

/* ------------------------------------------------- a imagem que chegou */

/*
 * Roda na tarefa do Optmize. O JPEG e nosso a partir daqui -- inclusive a
 * obrigacao de liberar, em todos os caminhos.
 */
static void chegou_a_imagem(uint8_t *jpeg, size_t bytes, const char *erro)
{
    const uint32_t minha = geracao_pedida;

    if (jpeg == NULL) {
        if (bsp_display_lock(500)) {
            if (minha == geracao) {
                avisar(erro ? erro : "nao deu", COR_APOIO);
            }
            bsp_display_unlock();
        }
        return;
    }

    /* Trocou de item enquanto baixava: joga fora sem tocar na tela. */
    if (minha != geracao) {
        free(jpeg);
        return;
    }

    /* --- o tamanho, que so o cabecalho do arquivo sabe --- */

    jpeg_decode_picture_info_t info = { 0 };
    if (jpeg_decoder_get_info(jpeg, (uint32_t)bytes, &info) != ESP_OK) {
        free(jpeg);
        if (bsp_display_lock(500)) {
            if (minha == geracao) {
                avisar("imagem ilegivel", COR_DESTAQUE);
            }
            bsp_display_unlock();
        }
        return;
    }

    jpeg_decoder_handle_t motor = NULL;
    uint8_t *entrada = NULL, *saida = NULL;
    size_t cabe = 0;
    int larg_decodificada = 0;   /* a largura REAL das linhas escritas -- ver abaixo */
    const char *falha = NULL;

    const jpeg_decode_engine_cfg_t cfg_motor = {
        .intr_priority = 0,
        .timeout_ms = 2000,   /* uma foto grande, uma vez -- nao ha pressa de video */
    };
    if (jpeg_new_decoder_engine(&cfg_motor, &motor) != ESP_OK) {
        falha = "decodificador ocupado";
        goto pronto;
    }

    /*
     * Os dois buffers vem do alocador DO DECODIFICADOR, e nao de `malloc`: ele
     * resolve alinhamento e cache do jeito que o periferico exige. Com memoria
     * comum a imagem sai rasgada, ou nao sai -- a mesma licao do video.
     *
     * Por isso o JPEG baixado e COPIADO para o buffer de entrada em vez de ser
     * usado onde esta. Sao algumas centenas de KB de memcpy, microssegundos.
     */
    jpeg_decode_memory_alloc_cfg_t mem = { .buffer_direction = JPEG_DEC_ALLOC_INPUT_BUFFER };
    entrada = jpeg_alloc_decoder_mem(bytes, &mem, &cabe);
    if (entrada == NULL) {
        falha = "sem memoria";
        goto pronto;
    }
    memcpy(entrada, jpeg, bytes);

    /*
     * O QUE O DECODIFICADOR ESCREVE NAO TEM O TAMANHO DA IMAGEM.
     *
     * Ele trabalha em blocos -- MCU -- e arredonda os DOIS lados para cima,
     * escrevendo a sobra. Com a altura isso so custa memoria. Com a largura
     * custa a imagem inteira: se o buffer for descrito com a largura real e o
     * decodificador escrever linhas mais compridas, cada linha comeca alguns
     * pixels adiante da anterior e a foto sai cortada na diagonal.
     *
     * O tamanho do bloco vem da subamostragem do arquivo, que so o cabecalho
     * conta: 16 no 4:2:2 e no 4:2:0, 8 no 4:4:4 e no cinza. Chutar 16 sempre
     * seria errado pelo outro lado -- num 4:4:4 de 808 pixels o decodificador
     * escreve 808, e quem esperasse 816 veria a mesma diagonal.
     *
     * (O video nao sofre disso porque 800 ja e multiplo de 16. Aqui a largura
     * vem do servidor, e um dia vem uma que nao e.)
     */
    const int mcux = (info.sample_method == JPEG_DOWN_SAMPLING_YUV422 ||
                      info.sample_method == JPEG_DOWN_SAMPLING_YUV420) ? 16 : 8;
    larg_decodificada = (int)(((info.width + mcux - 1) / mcux) * mcux);
    const int alt_decodificada = (int)(((info.height + 15) / 16) * 16);
    const size_t precisa = (size_t)larg_decodificada * alt_decodificada * 2;

    mem.buffer_direction = JPEG_DEC_ALLOC_OUTPUT_BUFFER;
    saida = jpeg_alloc_decoder_mem(precisa, &mem, &cabe);
    if (saida == NULL) {
        falha = "imagem grande demais para a memoria";
        goto pronto;
    }

    const jpeg_decode_cfg_t cfg = {
        .output_format = JPEG_DECODE_OUT_FORMAT_RGB565,
        .rgb_order = JPEG_DEC_RGB_ELEMENT_ORDER_BGR,
        .conv_std = JPEG_YUV_RGB_CONV_STD_BT601,
    };
    uint32_t saiu = 0;
    if (jpeg_decoder_process(motor, &cfg, entrada, bytes, saida, cabe, &saiu) != ESP_OK) {
        falha = "nao consegui abrir a imagem";
        goto pronto;
    }

pronto:
    if (motor != NULL)   jpeg_del_decoder_engine(motor);
    if (entrada != NULL) free(entrada);
    free(jpeg);

    if (!bsp_display_lock(1000)) {
        free(saida);
        return;
    }

    /* Trocou de item entre a decodificacao e a tranca: o trabalho se perde. */
    if (minha != geracao || painel == NULL) {
        free(saida);
        bsp_display_unlock();
        return;
    }

    if (falha != NULL) {
        free(saida);
        avisar(falha, COR_DESTAQUE);
        ESP_LOGW(TAG, "%s", falha);
        bsp_display_unlock();
        return;
    }

    soltar_os_pixels();
    pixels = saida;
    largura_real = (int)info.width;
    altura_real  = (int)info.height;

    descritor.header.magic  = LV_IMAGE_HEADER_MAGIC;
    descritor.header.cf     = LV_COLOR_FORMAT_RGB565;
    /*
     * LARGURA E ALTURA sao as da IMAGEM: e o que se quer ver. O PASSO e o da
     * memoria, que pode ser maior -- e assim o LVGL pula a sobra de cada linha
     * em vez de mostra-la, sem que ninguem tenha de copiar nada.
     */
    descritor.header.w      = largura_real;
    descritor.header.h      = altura_real;
    descritor.header.stride = larg_decodificada * 2;
    descritor.data_size     = (size_t)larg_decodificada * altura_real * 2;
    descritor.data          = pixels;

    lv_obj_add_flag(rot_estado, LV_OBJ_FLAG_HIDDEN);

    inteira = lv_image_create(painel);
    lv_image_set_src(inteira, &descritor);
    /* CONTAIN faz a conta de caber sozinho, sem perder a proporcao. */
    lv_image_set_inner_align(inteira, LV_IMAGE_ALIGN_CONTAIN);
    lv_obj_set_size(inteira, LV_PCT(100), LV_PCT(100));
    lv_obj_set_pos(inteira, 0, 0);

    /*
     * A IMAGEM INTEIRA E O BOTAO de ver de perto. Um alvo de 480x380 nao se
     * erra nem de luva, e dispensa explicar onde fica o zoom -- tocar na foto
     * para aumenta-la e o gesto que a pessoa ja traz do telefone.
     */
    lv_obj_add_flag(inteira, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(inteira, tocou_a_imagem, LV_EVENT_CLICKED, NULL);

    ESP_LOGI(TAG, "%dx%d no painel", largura_real, altura_real);
    bsp_display_unlock();
}

/* ----------------------------------------------------------- montar */

void imagem_da_producao_montar(lv_obj_t *pai, int x, int y, int w, int h,
                               const char *pedido_id, const char *item_id,
                               const char *titulo)
{
    imagem_da_producao_fechar();

    raiz = pai;
    geracao_pedida = geracao;
    snprintf(o_titulo, sizeof(o_titulo), "%s", titulo ? titulo : "");

    painel = lv_obj_create(pai);
    lv_obj_set_size(painel, w, h);
    lv_obj_set_pos(painel, x, y);
    lv_obj_set_style_bg_color(painel, lv_color_black(), 0);
    lv_obj_set_style_border_color(painel, COR_BORDA, 0);
    lv_obj_set_style_border_width(painel, 1, 0);
    lv_obj_set_style_radius(painel, 12, 0);
    lv_obj_set_style_pad_all(painel, 0, 0);
    lv_obj_remove_flag(painel, LV_OBJ_FLAG_SCROLLABLE);

    rot_estado = lv_label_create(painel);
    lv_label_set_text(rot_estado, "carregando a arte...");
    lv_obj_set_style_text_color(rot_estado, COR_APOIO, 0);
    lv_obj_set_style_text_font(rot_estado, &lv_font_montserrat_16, 0);
    lv_obj_set_style_text_align(rot_estado, LV_TEXT_ALIGN_CENTER, 0);
    lv_label_set_long_mode(rot_estado, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(rot_estado, w - 40);
    lv_obj_center(rot_estado);

    optmize_baixar_imagem(pedido_id, item_id, LARGURA_PEDIDA, chegou_a_imagem);
}
