/*
 * ===========================================================================
 * APP DE PONTOS — bater o ponto, e cadastrar quem vai bater
 * ===========================================================================
 *
 * Duas coisas moram aqui, e sao a mesma camera fazendo trabalhos diferentes:
 *
 *   BATER      a pessoa aperta, o terminal fotografa, o servidor reconhece e
 *              grava a batida. E o que acontece quatro vezes por dia, todo dia.
 *
 *   CADASTRAR  guarda mais um rosto de alguem, para que o reconhecimento
 *              funcione. Acontece uma vez por pessoa, e mais algumas quando
 *              alguem raspa a barba ou comeca a usar oculos.
 *
 * ---------------------------------------------------------------------------
 * POR QUE O CADASTRO E AQUI, E NAO SO NO COMPUTADOR
 * ---------------------------------------------------------------------------
 *
 * A tela de Funcionarios do Optmize tambem tira foto, pela webcam. Mas ela esta
 * no escritorio, e as pessoas estao no galpao -- cadastrar por la significa
 * chamar cada um ate um computador, um por vez.
 *
 * O terminal ja esta onde as pessoas passam. Cadastrar aqui e parar dez
 * segundos no caminho.
 *
 * O QUE O TERMINAL NAO FAZ E CRIAR PESSOA. Isso exige nome completo, matricula
 * e teclado -- e nome de gente digitado com o dedo, de pe, vira um "Jsoe" que
 * ninguem conserta depois: ele so reaparece como "o sistema nao me acha". Criar
 * fica no computador, onde ha teclado de verdade. Aqui se tira a foto.
 *
 * ---------------------------------------------------------------------------
 * O BOTAO DE BATER EXISTE DE PROPOSITO
 * ---------------------------------------------------------------------------
 *
 * A tentacao e bater sozinho: achou rosto, gravou. Nao serve. Este aparelho
 * fica em pe na calandra, e passa gente na frente dele o dia inteiro --
 * levando rolo, indo ao banheiro, conversando. Sem o botao, o ponto de todo
 * mundo seria batido varias vezes por dia por acidente, e alguem teria de
 * limpar isso na mao toda semana.
 *
 * ---------------------------------------------------------------------------
 * O ROSTO FALHA, E A TELA CONTINUA
 * ---------------------------------------------------------------------------
 *
 * Nenhum reconhecimento acerta sempre: bone, barba nova, luz de frente, alguem
 * que ainda nao cadastrou. Se a unica saida fosse o rosto, a primeira falha
 * deixaria uma pessoa sem bater o ponto -- e um relogio de ponto que as vezes
 * nao deixa bater e um relogio de ponto quebrado.
 *
 * Por isso "nao te reconheci" NAO e um erro: e a porta para a lista de nomes. A
 * batida sai igual, e o servidor grava a origem, entao quem confere depois ve
 * quais foram pelo rosto e quais na unha.
 */

#include <stdio.h>
#include <string.h>

#include "esp_log.h"

#include "bsp/esp-bsp.h"
#include "interface.h"
#include "optmize.h"

static const char *TAG = "pontos";

/* O video, ao lado (ver `video-da-camera.c`). */
esp_err_t video_da_camera_abrir(lv_obj_t *pai);
void video_da_camera_fechar(void);
esp_err_t video_da_camera_fotografar(uint8_t **jpeg, size_t *bytes, int prazo_ms);

/*
 * QUANTO A CONFIRMACAO FICA NA TELA.
 *
 * Quatro segundos: o tempo de ler um nome e uma hora e ter certeza de que foi o
 * seu. Menos, e quem estava guardando o cracha perde a confirmacao; mais, e a
 * fila espera por nada.
 */
#define QUANTO_MOSTRAR_MS 4000

/* O que a camera vai fazer com a foto que tirar. */
typedef enum { PARA_BATER, PARA_CADASTRAR } Proposito;

/* O que a lista de nomes faz quando alguem toca num nome. */
typedef enum { ESCOLHER_PARA_BATER, ESCOLHER_PARA_CADASTRAR, SO_MOSTRAR } DepoisDaLista;

static lv_obj_t *area_do_app;
static lv_obj_t *moldura;
static lv_obj_t *rot_estado;
static lv_obj_t *sobreposto;
static lv_timer_t *volta_sozinho;

static uint8_t *foto;
static size_t   foto_bytes;
static bool     esperando;

static Proposito proposito;
static DepoisDaLista depois_da_lista;
static int  quem_escolhido;
static char nome_escolhido[48];
static int  quantas_fotos;     /* quantas ja foram guardadas nesta visita */

/* Uma geracao por tela: o que estiver no ar deixa de valer ao trocar. */
static uint32_t geracao;
static uint32_t geracao_pedida;

static void montar_o_inicio(void);
static void montar_a_camera(Proposito para_que);
static void pedir_a_lista(DepoisDaLista para_que);
static void tocou_ver_a_lista(lv_event_t *e);

/*
 * ===========================================================================
 * TROCAR DE TELA NUNCA ACONTECE DENTRO DO TOQUE
 * ===========================================================================
 *
 * Todo botao desta tela vive DENTRO da area que a proxima tela vai limpar. Se o
 * `lv_obj_clean` rodasse ali mesmo, o LVGL continuaria despachando o evento por
 * uma arvore de objetos ja liberados.
 *
 * O LVGL se protege do caso simples -- ele marca quando o PROPRIO alvo do
 * evento e apagado. Nao se protege do avo: apagar a area inteira leva o botao
 * junto por tabela, e a protecao nao chega la.
 *
 * O preco disso apareceu como travamento: batendo ponto ou cadastrando varias
 * vezes seguidas, a placa parava com o cao de guarda reclamando da tarefa do
 * LVGL. A pilha dizia exatamente onde:
 *
 *     lv_tlsf_free  ->  block_link_next  ->  block_next
 *
 * O alocador do LVGL andando numa lista circular, para sempre. Nao era um
 * travamento: era a memoria dele ja corrompida por um objeto liberado duas
 * vezes, e o laco infinito so foi onde isso finalmente apareceu.
 *
 * `lv_async_call` marca a troca para acontecer na proxima volta do LVGL, com o
 * evento ja terminado e ninguem mais olhando para aqueles objetos.
 */
typedef enum {
    TELA_INICIO,
    TELA_CAMERA_BATER,
    TELA_CAMERA_CADASTRAR,
    TELA_LISTA_BATER,
    TELA_LISTA_CADASTRAR,
    TELA_QUEM_ESTA_CADASTRADO,
} Tela;

static Tela proxima_tela;

static void trocar_de_tela(void *nada)
{
    (void)nada;
    if (area_do_app == NULL) {
        return;   /* saiu do app antes de a troca acontecer */
    }
    switch (proxima_tela) {
        case TELA_INICIO:             montar_o_inicio(); break;
        case TELA_CAMERA_BATER:       montar_a_camera(PARA_BATER); break;
        case TELA_CAMERA_CADASTRAR:   montar_a_camera(PARA_CADASTRAR); break;
        case TELA_LISTA_BATER:        pedir_a_lista(ESCOLHER_PARA_BATER); break;
        case TELA_LISTA_CADASTRAR:    pedir_a_lista(ESCOLHER_PARA_CADASTRAR); break;
        case TELA_QUEM_ESTA_CADASTRADO: pedir_a_lista(SO_MOSTRAR); break;
    }
}

static void ir_para(Tela t)
{
    proxima_tela = t;
    lv_async_call(trocar_de_tela, NULL);
}

/* --------------------------------------------------------------- ajudas */

static void soltar_a_foto(void)
{
    if (foto != NULL) {
        free(foto);
        foto = NULL;
        foto_bytes = 0;
    }
}

static void fechar_o_sobreposto(void)
{
    if (volta_sozinho != NULL) {
        lv_timer_delete(volta_sozinho);
        volta_sozinho = NULL;
    }
    if (sobreposto != NULL) {
        lv_obj_delete(sobreposto);
        sobreposto = NULL;
    }
}

static lv_obj_t *abrir_o_sobreposto(void)
{
    fechar_o_sobreposto();

    sobreposto = lv_obj_create(area_do_app);
    lv_obj_set_size(sobreposto, LV_PCT(100), LV_PCT(100));
    lv_obj_set_pos(sobreposto, 0, 0);
    lv_obj_set_style_bg_color(sobreposto, COR_FUNDO, 0);
    lv_obj_set_style_bg_opa(sobreposto, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(sobreposto, 0, 0);
    lv_obj_set_style_radius(sobreposto, 0, 0);
    lv_obj_set_style_pad_all(sobreposto, 0, 0);
    lv_obj_remove_flag(sobreposto, LV_OBJ_FLAG_SCROLLABLE);
    return sobreposto;
}

static lv_obj_t *botao(lv_obj_t *pai, int x, int y, int w, int h, lv_color_t cor,
                       const lv_font_t *fonte, const char *texto,
                       lv_event_cb_t quando_tocar, void *carga)
{
    lv_obj_t *b = lv_button_create(pai);
    lv_obj_set_size(b, w, h);
    lv_obj_set_pos(b, x, y);
    lv_obj_set_style_bg_color(b, cor, 0);
    lv_obj_set_style_border_color(b, COR_BORDA, 0);
    lv_obj_set_style_border_width(b, 1, 0);
    lv_obj_set_style_radius(b, RAIO_MIUDO, 0);
    /*
     * Sem sombra, e com resposta ao dedo. Os dois vem do Optmize: ele separa
     * superficies por cor e borda, e escurece o que esta sendo apertado.
     */
    lv_obj_set_style_shadow_width(b, 0, 0);
    lv_obj_set_style_bg_opa(b, LV_OPA_80, LV_STATE_PRESSED);
    lv_obj_add_event_cb(b, quando_tocar, LV_EVENT_CLICKED, carga);

    lv_obj_t *r = lv_label_create(b);
    lv_label_set_text(r, texto);
    lv_obj_set_style_text_font(r, fonte, 0);
    /*
     * TINTA ESCURA SOBRE COR FORTE, e nao preto puro: preto sobre laranja
     * vibra na vista. `COR_DESTAQUE_TINTA` e o mesmo quase-preto que o Optmize
     * usa em cima do laranja dele.
     */
    const bool forte = lv_color_eq(cor, COR_CERTO) || lv_color_eq(cor, COR_DESTAQUE);
    lv_obj_set_style_text_color(r, forte ? COR_DESTAQUE_TINTA : COR_TEXTO, 0);
    lv_obj_set_style_text_align(r, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_center(r);
    return b;
}

static void avisar(const char *texto, lv_color_t cor)
{
    if (rot_estado != NULL) {
        lv_label_set_text(rot_estado, texto);
        lv_obj_set_style_text_color(rot_estado, cor, 0);
    }
}

/* ============================================================== o inicio */

/*
 * UMA PORTA DA TELA DE ENTRADA.
 *
 * `forte` pinta o cartao inteiro da cor, e so o de bater ponto usa isso. Os
 * outros sao superficie de cartao com o icone colorido -- que e como o Optmize
 * trata escolha secundaria.
 */
static void cartao_de_porta(lv_obj_t *pai, int32_t x, int32_t y, int32_t w, int32_t h,
                            lv_color_t cor, bool forte, const char *icone,
                            const char *nome, const char *apoio, lv_event_cb_t ao_tocar)
{
    lv_obj_t *c = lv_obj_create(pai);
    lv_obj_set_size(c, w, h);
    lv_obj_set_pos(c, x, y);
    lv_obj_set_style_bg_color(c, forte ? cor : COR_CARTAO, 0);
    lv_obj_set_style_bg_color(c, forte ? cor : COR_CARTAO_SUAVE, LV_STATE_PRESSED);
    lv_obj_set_style_bg_opa(c, forte ? LV_OPA_80 : LV_OPA_COVER, LV_STATE_PRESSED);
    lv_obj_set_style_border_color(c, forte ? cor : COR_BORDA, 0);
    lv_obj_set_style_border_width(c, 1, 0);
    lv_obj_set_style_radius(c, RAIO, 0);
    lv_obj_set_style_pad_all(c, 20, 0);
    lv_obj_remove_flag(c, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(c, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(c, ao_tocar, LV_EVENT_CLICKED, NULL);

    const lv_color_t tinta = forte ? COR_DESTAQUE_TINTA : COR_TEXTO;

    lv_obj_t *caixa = lv_obj_create(c);
    lv_obj_set_size(caixa, 52, 52);
    lv_obj_set_pos(caixa, 0, 0);
    lv_obj_set_style_radius(caixa, 14, 0);
    lv_obj_set_style_bg_color(caixa, forte ? COR_DESTAQUE_TINTA : cor, 0);
    lv_obj_set_style_bg_opa(caixa, LV_OPA_20, 0);
    lv_obj_set_style_border_width(caixa, 0, 0);
    lv_obj_set_style_pad_all(caixa, 0, 0);
    lv_obj_remove_flag(caixa, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(caixa, LV_OBJ_FLAG_CLICKABLE);

    lv_obj_t *simbolo = lv_label_create(caixa);
    lv_label_set_text(simbolo, icone);
    lv_obj_set_style_text_color(simbolo, forte ? tinta : cor, 0);
    lv_obj_set_style_text_font(simbolo, &fonte_28, 0);
    lv_obj_center(simbolo);

    lv_obj_t *rot = lv_label_create(c);
    lv_label_set_text(rot, nome);
    lv_obj_set_style_text_color(rot, tinta, 0);
    lv_obj_set_style_text_font(rot, forte ? &fonte_48 : &fonte_28, 0);
    lv_obj_set_pos(rot, 68, forte ? 0 : 2);

    lv_obj_t *sub = lv_label_create(c);
    lv_label_set_text(sub, apoio);
    lv_obj_set_style_text_color(sub, forte ? tinta : COR_FRACA, 0);
    lv_obj_set_style_text_opa(sub, forte ? LV_OPA_70 : LV_OPA_COVER, 0);
    lv_obj_set_style_text_font(sub, forte ? &fonte_22 : &fonte_16, 0);
    lv_label_set_long_mode(sub, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(sub, w - 108);
    lv_obj_set_pos(sub, 68, forte ? 54 : 40);
}

static void tocou_bater_ponto(lv_event_t *e)
{
    (void)e;
    ir_para(TELA_CAMERA_BATER);
}

static void tocou_cadastrar(lv_event_t *e)
{
    (void)e;
    ir_para(TELA_LISTA_CADASTRAR);
}

static void tocou_ver_a_lista(lv_event_t *e)
{
    (void)e;
    ir_para(TELA_QUEM_ESTA_CADASTRADO);
}

/*
 * DUAS PORTAS, E ELAS NAO TEM O MESMO TAMANHO.
 *
 * Bater ponto acontece quatro vezes por dia para cada pessoa; cadastrar rosto,
 * uma vez na vida. Dar o mesmo peso visual as duas faria a fila da manha parar
 * para escolher entre coisas igualmente importantes -- quando so uma delas
 * importa naquele momento.
 */
static void montar_o_inicio(void)
{
    geracao++;
    esperando = false;
    fechar_o_sobreposto();
    soltar_a_foto();
    video_da_camera_fechar();   /* a camera nao fica aberta na tela de escolha */
    lv_obj_clean(area_do_app);
    moldura = NULL;
    rot_estado = NULL;

    /*
     * O CARTAO DE BATER OCUPA A LARGURA TODA, e os outros dois dividem a linha
     * de baixo.
     *
     * Bater ponto acontece quatro vezes por dia para cada pessoa; cadastrar
     * rosto, uma vez na vida; ver quem esta cadastrado, quase nunca. Uma grade
     * de tres iguais diria que as tres pesam o mesmo, e a fila da manha pararia
     * para escolher entre coisas que nao competem.
     */
    cartao_de_porta(area_do_app, 20, 28, LV_HOR_RES - 40, 190, COR_CERTO, true,
                    LV_SYMBOL_OK, "Bater ponto", "olhe para a camera e aperte",
                    tocou_bater_ponto);

    cartao_de_porta(area_do_app, 20, 232, 492, 164, COR_DESTAQUE, false,
                    LV_SYMBOL_IMAGE, "Cadastrar rosto",
                    "guarda mais um rosto de quem ja esta no Optmize",
                    tocou_cadastrar);

    cartao_de_porta(area_do_app, 532, 232, 472, 164, COR_APOIO, false,
                    LV_SYMBOL_LIST, "Lista de pessoas",
                    "quem esta cadastrado, e quantos rostos cada um tem",
                    tocou_ver_a_lista);

    rot_estado = lv_label_create(area_do_app);
    lv_label_set_text(rot_estado, "");
    lv_obj_set_style_text_font(rot_estado, &fonte_22, 0);
    lv_label_set_long_mode(rot_estado, LV_LABEL_LONG_DOT);
    lv_obj_set_width(rot_estado, LV_HOR_RES - 40);
    lv_obj_set_style_text_align(rot_estado, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(rot_estado, LV_ALIGN_BOTTOM_MID, 0, -30);
}

/* ------------------------------------------------------ o que aconteceu */

/* Traduz o nome tecnico da batida para o que a pessoa chamaria aquilo. */
static const char *em_palavras(const char *tipo)
{
    if (strcmp(tipo, "entrada") == 0)      return "Entrada";
    if (strcmp(tipo, "almoco_saida") == 0) return "Saida para o almoco";
    if (strcmp(tipo, "almoco_volta") == 0) return "Volta do almoco";
    if (strcmp(tipo, "saida") == 0)        return "Saida";
    return "Batida registrada";
}

static void tempo_de_voltar(lv_timer_t *t)
{
    (void)t;
    volta_sozinho = NULL;
    montar_o_inicio();
}

/*
 * A CONFIRMACAO, grande.
 *
 * O nome em corpo enorme porque a pergunta que a pessoa faz aqui e "foi o MEU
 * ponto?" -- e ela pergunta isso de longe, ja andando. A hora e o tipo vem
 * abaixo, para quem parou para conferir.
 */
static void montar_o_sucesso(const Batida *b)
{
    lv_obj_t *c = abrir_o_sobreposto();
    lv_obj_set_style_bg_color(c, lv_color_black(), 0);

    /*
     * UM ANEL GRANDE COM O CERTO DENTRO, e nao um simbolo solto.
     *
     * Esta tela e vista de longe, ja de costas: a pessoa apertou, esta
     * guardando o cracha e virando para a maquina. O que ela precisa captar de
     * relance e "deu certo" -- e um anel de 120 pixels responde isso antes de
     * qualquer letra ser lida.
     */
    lv_obj_t *anel = lv_obj_create(c);
    lv_obj_set_size(anel, 120, 120);
    lv_obj_align(anel, LV_ALIGN_TOP_MID, 0, 44);
    lv_obj_set_style_radius(anel, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(anel, COR_CERTO, 0);
    lv_obj_set_style_bg_opa(anel, LV_OPA_20, 0);
    lv_obj_set_style_border_color(anel, COR_CERTO, 0);
    lv_obj_set_style_border_width(anel, 3, 0);
    lv_obj_set_style_pad_all(anel, 0, 0);
    lv_obj_remove_flag(anel, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(anel, LV_OBJ_FLAG_CLICKABLE);

    lv_obj_t *marca = lv_label_create(anel);
    lv_label_set_text(marca, LV_SYMBOL_OK);
    lv_obj_set_style_text_color(marca, COR_CERTO, 0);
    lv_obj_set_style_text_font(marca, &fonte_48, 0);
    lv_obj_center(marca);

    lv_obj_t *nome = lv_label_create(c);
    lv_label_set_text(nome, b->nome);
    lv_obj_set_style_text_color(nome, COR_TEXTO, 0);
    lv_obj_set_style_text_font(nome, &fonte_48, 0);
    lv_label_set_long_mode(nome, LV_LABEL_LONG_DOT);
    lv_obj_set_width(nome, LV_HOR_RES - 80);
    lv_obj_set_style_text_align(nome, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(nome, LV_ALIGN_TOP_MID, 0, 190);

    lv_obj_t *oque = lv_label_create(c);
    lv_label_set_text_fmt(oque, "%s  as  %s", em_palavras(b->tipo), b->hora);
    lv_obj_set_style_text_color(oque, COR_APOIO, 0);
    lv_obj_set_style_text_font(oque, &fonte_28, 0);
    lv_obj_align(oque, LV_ALIGN_TOP_MID, 0, 258);

    lv_obj_t *ok = lv_label_create(c);
    lv_label_set_text(ok, "Ponto registrado com sucesso");
    lv_obj_set_style_text_color(ok, COR_CERTO, 0);
    lv_obj_set_style_text_font(ok, &fonte_16, 0);
    lv_obj_align(ok, LV_ALIGN_TOP_MID, 0, 306);

    /*
     * A tela volta sozinha. Ninguem devia precisar tocar de novo so para
     * liberar o aparelho para a proxima pessoa da fila.
     */
    volta_sozinho = lv_timer_create(tempo_de_voltar, QUANTO_MOSTRAR_MS, NULL);
    lv_timer_set_repeat_count(volta_sozinho, 1);

    ESP_LOGI(TAG, "%s -- %s as %s", b->nome, b->tipo, b->hora);
}

/* ================================================== a lista de nomes */

static void bateu_pelo_nome(const Batida *b, const char *erro)
{
    const uint32_t minha = geracao_pedida;
    if (!bsp_display_lock(500)) {
        return;
    }
    if (minha == geracao && area_do_app != NULL) {
        if (b != NULL) {
            montar_o_sucesso(b);
        } else {
            avisar(erro ? erro : "nao deu", COR_ALERTA);
        }
    }
    bsp_display_unlock();
}

static void tocou_um_nome(lv_event_t *e)
{
    lv_obj_t *alvo = lv_event_get_target(e);
    quem_escolhido = (int)(intptr_t)lv_event_get_user_data(e);
    snprintf(nome_escolhido, sizeof(nome_escolhido), "%s",
             lv_label_get_text(lv_obj_get_child(alvo, 0)));

    if (depois_da_lista == ESCOLHER_PARA_CADASTRAR) {
        quantas_fotos = 0;
        ir_para(TELA_CAMERA_CADASTRAR);
        return;
    }

    /*
     * O pedido sai agora -- ele nao mexe na arvore de objetos. Quem mexe e a
     * tela de "registrando", e essa vai pela porta de sempre: depois do evento.
     */
    geracao_pedida = geracao;
    optmize_bater_pelo_nome(quem_escolhido, bateu_pelo_nome);
    avisar("registrando...", COR_APOIO);
}

static void tocou_voltar_ao_inicio(lv_event_t *e)
{
    (void)e;
    ir_para(TELA_INICIO);
}

/* Volta a camera COM A MESMA PESSOA: o proximo angulo e dela, nao de outro. */
static void tocou_outra_foto(lv_event_t *e)
{
    (void)e;
    ir_para(TELA_CAMERA_CADASTRAR);
}

static void chegou_a_lista(const Funcionario *lista, int quantos, const char *erro)
{
    const uint32_t minha = geracao_pedida;
    if (!bsp_display_lock(500)) {
        return;
    }
    if (minha != geracao || area_do_app == NULL) {
        bsp_display_unlock();
        return;
    }

    lv_obj_t *c = abrir_o_sobreposto();

    lv_obj_t *titulo = lv_label_create(c);
    lv_label_set_text(titulo, erro ? erro
        : (depois_da_lista == SO_MOSTRAR ? "Quem esta cadastrado"
           : depois_da_lista == ESCOLHER_PARA_CADASTRAR
             ? "Quem vai tirar a foto?" : "Toque no seu nome"));
    lv_obj_set_style_text_color(titulo, erro ? COR_ALERTA : COR_TEXTO, 0);
    lv_obj_set_style_text_font(titulo, &fonte_28, 0);
    lv_obj_set_pos(titulo, 24, 14);

    botao(c, LV_HOR_RES - 184, 10, 160, 56, COR_CARTAO, &fonte_16,
          LV_SYMBOL_LEFT "  voltar", tocou_voltar_ao_inicio, NULL);

    /*
     * O aviso mora NESTA tela, e nao na anterior. `rot_estado` e um ponteiro
     * so, e apontar para um rotulo da tela que acabou de ser coberta faria o
     * "registrando..." aparecer atras da lista, onde ninguem ve.
     */
    rot_estado = lv_label_create(c);
    lv_label_set_text(rot_estado, "");
    lv_obj_set_style_text_font(rot_estado, &fonte_22, 0);
    lv_label_set_long_mode(rot_estado, LV_LABEL_LONG_DOT);
    lv_obj_set_width(rot_estado, 620);
    lv_obj_set_pos(rot_estado, 24, 48);

    if (erro != NULL || quantos == 0) {
        lv_obj_t *nada = lv_label_create(c);
        lv_label_set_text(nada, (quantos == 0 && erro == NULL)
            ? "Ninguem cadastrado no Optmize ainda.\n"
              "Cadastre as pessoas na tela de Funcionarios, no computador."
            : "Sem lista de nomes -- confira a rede em Ajustes.");
        lv_obj_set_style_text_color(nada, COR_APOIO, 0);
        lv_obj_set_style_text_font(nada, &fonte_22, 0);
        lv_obj_set_style_text_align(nada, LV_TEXT_ALIGN_CENTER, 0);
        lv_obj_center(nada);
        bsp_display_unlock();
        return;
    }

    /*
     * DUAS COLUNAS de botoes altos, que rolam.
     *
     * Nome de gente e curto e a tela e larga: uma coluna so desperdicaria
     * metade dela e obrigaria a rolar em cima de uma lista de dez pessoas.
     */
    lv_obj_t *rolo = lv_obj_create(c);
    lv_obj_set_size(rolo, LV_HOR_RES - 32, LV_VER_RES - 56 - 96);
    lv_obj_set_pos(rolo, 16, 86);
    lv_obj_set_style_bg_opa(rolo, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(rolo, 0, 0);
    lv_obj_set_style_pad_all(rolo, 0, 0);

    const int largura = (LV_HOR_RES - 32 - 16) / 2;
    for (int i = 0; i < quantos; i++) {
        lv_obj_t *b = botao(rolo, (i % 2) * (largura + 16), (i / 2) * 88, largura, 76,
                            COR_CARTAO, &fonte_22, lista[i].nome,
                            tocou_um_nome, (void *)(intptr_t)lista[i].id);
        /*
         * EM MODO DE SO MOSTRAR, os nomes nao respondem ao toque.
         *
         * Um botao que nao faz nada e pior que um rotulo: a pessoa aperta,
         * espera, aperta de novo, e conclui que o aparelho travou. Tirar a
         * bandeira de clicavel faz a lista se comportar como o que ela e.
         */
        if (depois_da_lista == SO_MOSTRAR) {
            lv_obj_remove_flag(b, LV_OBJ_FLAG_CLICKABLE);
        }
    }

    bsp_display_unlock();
}

static void pedir_a_lista(DepoisDaLista para_que)
{
    depois_da_lista = para_que;
    geracao_pedida = geracao;

    lv_obj_t *c = abrir_o_sobreposto();
    lv_obj_t *r = lv_label_create(c);
    lv_label_set_text(r, "buscando os nomes...");
    lv_obj_set_style_text_color(r, COR_APOIO, 0);
    lv_obj_set_style_text_font(r, &fonte_28, 0);
    lv_obj_center(r);

    optmize_listar_funcionarios(chegou_a_lista);
}

/* ============================================ o cadastro deu certo */

/*
 * TRES ANGULOS, E A TELA PEDE O PROXIMO.
 *
 * Um rosto de frente nao e o mesmo de lado nem com bone, e basta parecer com um
 * deles para ser reconhecido. Quem cadastra uma foto so descobre isso meses
 * depois, como "o sistema nunca me reconhece" -- entao a tela conta quantas ja
 * foram e sugere continuar enquanto forem poucas.
 */
static void cadastrou(const char *erro)
{
    const uint32_t minha = geracao_pedida;
    if (!bsp_display_lock(500)) {
        return;
    }
    if (minha != geracao || area_do_app == NULL) {
        bsp_display_unlock();
        return;
    }

    esperando = false;
    soltar_a_foto();

    if (erro != NULL) {
        avisar(erro, COR_ALERTA);
        bsp_display_unlock();
        return;
    }

    quantas_fotos++;
    lv_obj_t *c = abrir_o_sobreposto();

    lv_obj_t *marca = lv_label_create(c);
    lv_label_set_text(marca, LV_SYMBOL_OK);
    lv_obj_set_style_text_color(marca, COR_CERTO, 0);
    lv_obj_set_style_text_font(marca, &fonte_48, 0);
    lv_obj_align(marca, LV_ALIGN_TOP_MID, 0, 40);

    lv_obj_t *quem = lv_label_create(c);
    lv_label_set_text_fmt(quem, "%s\n%d rosto(s) guardados agora",
                          nome_escolhido, quantas_fotos);
    lv_obj_set_style_text_color(quem, COR_TEXTO, 0);
    lv_obj_set_style_text_font(quem, &fonte_28, 0);
    lv_obj_set_style_text_align(quem, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(quem, LV_ALIGN_CENTER, 0, -40);

    lv_obj_t *dica = lv_label_create(c);
    lv_label_set_text(dica, quantas_fotos < 3
        ? "tire mais uma de outro angulo -- de lado, ou com o que voce usa na cabeca"
        : "ja da para o terminal reconhecer voce");
    lv_obj_set_style_text_color(dica, COR_APOIO, 0);
    lv_obj_set_style_text_font(dica, &fonte_16, 0);
    lv_obj_set_style_text_align(dica, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(dica, LV_ALIGN_CENTER, 0, 30);

    botao(c, 40, LV_VER_RES - 56 - 110, 460, 86,
          quantas_fotos < 3 ? COR_CERTO : COR_CARTAO, &fonte_28,
          LV_SYMBOL_IMAGE "  Outra foto", tocou_outra_foto, NULL);
    botao(c, 524, LV_VER_RES - 56 - 110, 460, 86,
          quantas_fotos < 3 ? COR_CARTAO : COR_CERTO, &fonte_28,
          "Terminei", tocou_voltar_ao_inicio, NULL);

    bsp_display_unlock();
    ESP_LOGI(TAG, "rosto de %s guardado (%d nesta visita)", nome_escolhido, quantas_fotos);
}

/* ================================================= a resposta do rosto */

static void chegou_a_resposta(const Batida *b, const char *erro, bool nao_reconheceu)
{
    const uint32_t minha = geracao_pedida;

    if (!bsp_display_lock(500)) {
        return;
    }
    /* Saiu do app enquanto a rede pensava: a resposta se descarta sozinha. */
    if (minha != geracao || area_do_app == NULL) {
        bsp_display_unlock();
        return;
    }

    esperando = false;
    soltar_a_foto();

    if (b != NULL) {
        montar_o_sucesso(b);
        bsp_display_unlock();
        return;
    }

    if (nao_reconheceu) {
        /*
         * A LISTA DE NOMES, e nao uma mensagem de erro. Quem chegou para bater
         * o ponto tem de sair daqui com o ponto batido -- dizer "nao te
         * reconheci" e parar por ali seria mandar a pessoa procurar o RH.
         */
        avisar("nao te reconheci -- buscando os nomes...", COR_APOIO);
        bsp_display_unlock();
        pedir_a_lista(ESCOLHER_PARA_BATER);
        return;
    }

    avisar(erro ? erro : "nao deu", COR_ALERTA);
    bsp_display_unlock();
}

/* ======================================================== fotografar */

static void tocou_a_camera(lv_event_t *e)
{
    (void)e;
    if (esperando) {
        return;   /* ja ha um pedido no ar; o segundo toque nao adianta nada */
    }

    soltar_a_foto();
    if (video_da_camera_fotografar(&foto, &foto_bytes, 1500) != ESP_OK) {
        avisar("a camera nao entregou a foto", COR_ALERTA);
        return;
    }

    esperando = true;
    geracao_pedida = geracao;

    /*
     * A FOTO PASSA A SER DA TAREFA QUE VAI MANDA-LA, e o ponteiro daqui cai na
     * mesma linha.
     *
     * Antes ela continuava nossa, e qualquer troca de tela chamava
     * `soltar_a_foto` -- inclusive com a tarefa no meio do envio para o
     * servidor. Liberar meio megabyte de PSRAM debaixo de quem esta lendo dele
     * e o tipo de defeito que corrompe a memoria longe de onde foi cometido, e
     * so aparece como uma placa que reinicia sozinha de vez em quando.
     *
     * Quem manda, entrega: quem recebe libera.
     */
    uint8_t *entregue = foto;
    const size_t quanto = foto_bytes;
    foto = NULL;
    foto_bytes = 0;

    if (proposito == PARA_CADASTRAR) {
        avisar("guardando...", COR_APOIO);
        optmize_cadastrar_rosto(quem_escolhido, entregue, quanto, cadastrou);
    } else {
        avisar("olhando...", COR_APOIO);
        optmize_bater_por_rosto(entregue, quanto, chegou_a_resposta);
    }
}

/* ------------------------------------------------------------ a camera */

static void montar_a_camera(Proposito para_que)
{
    geracao++;
    proposito = para_que;
    esperando = false;
    fechar_o_sobreposto();
    soltar_a_foto();
    lv_obj_clean(area_do_app);
    rot_estado = NULL;

    const bool cadastrando = (para_que == PARA_CADASTRAR);

    moldura = lv_obj_create(area_do_app);
    lv_obj_set_size(moldura, 620, 466);
    lv_obj_set_pos(moldura, 20, 14);
    lv_obj_set_style_bg_color(moldura, lv_color_black(), 0);
    lv_obj_set_style_border_color(moldura, COR_BORDA, 0);
    lv_obj_set_style_border_width(moldura, 1, 0);
    lv_obj_set_style_radius(moldura, RAIO, 0);
    lv_obj_set_style_pad_all(moldura, 0, 0);
    lv_obj_remove_flag(moldura, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *coluna = lv_obj_create(area_do_app);
    lv_obj_set_size(coluna, 340, 466);
    lv_obj_set_pos(coluna, 664, 14);
    lv_obj_set_style_bg_color(coluna, COR_CARTAO, 0);
    lv_obj_set_style_border_color(coluna, COR_BORDA, 0);
    lv_obj_set_style_border_width(coluna, 1, 0);
    lv_obj_set_style_radius(coluna, RAIO, 0);
    lv_obj_set_style_pad_all(coluna, 20, 0);
    lv_obj_remove_flag(coluna, LV_OBJ_FLAG_SCROLLABLE);

    titulo_de_bloco(coluna, 2, cadastrando ? "CADASTRANDO" : "POSICIONE SEU ROSTO");

    lv_obj_t *titulo = lv_label_create(coluna);
    lv_label_set_text(titulo, cadastrando ? nome_escolhido : "Olhe para a camera");
    lv_obj_set_style_text_color(titulo, COR_TEXTO, 0);
    lv_obj_set_style_text_font(titulo, &fonte_22, 0);
    lv_label_set_long_mode(titulo, LV_LABEL_LONG_DOT);
    lv_obj_set_width(titulo, 296);
    lv_obj_set_pos(titulo, 0, 26);

    checklist_linha(coluna, 74,  COR_CERTO, "mantenha o rosto no centro da mira");
    checklist_linha(coluna, 124, COR_CERTO, "boa iluminacao, de frente");
    checklist_linha(coluna, 174, COR_CERTO, cadastrando
        ? "ninguem atras -- uma pessoa so na foto"
        : "sem bone ou oculos escuros");

    lv_obj_t *risco = lv_obj_create(coluna);
    lv_obj_set_size(risco, 296, 1);
    lv_obj_set_pos(risco, 0, 240);
    lv_obj_set_style_bg_color(risco, COR_BORDA_SUAVE, 0);
    lv_obj_set_style_border_width(risco, 0, 0);
    lv_obj_remove_flag(risco, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(risco, LV_OBJ_FLAG_CLICKABLE);

    rot_estado = lv_label_create(coluna);
    lv_label_set_text(rot_estado, cadastrando
        ? "o servidor recusa a foto se nao achar exatamente um rosto"
        : "o servidor decide que batida e esta, pelo que voce ja bateu hoje");
    lv_obj_set_style_text_color(rot_estado, COR_FRACA, 0);
    lv_obj_set_style_text_font(rot_estado, &fonte_16, 0);
    lv_label_set_long_mode(rot_estado, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(rot_estado, 296);
    lv_obj_set_pos(rot_estado, 0, 256);

    botao(coluna, 0, 360, 296, 60, COR_BORDA, &fonte_16,
          LV_SYMBOL_LEFT "  voltar", tocou_voltar_ao_inicio, NULL);

    /*
     * O ALVO OCUPA A LARGURA DA TELA. E o unico botao que importa aqui, e quem
     * o aperta pode estar de luva, com a mao suja, com pressa -- as mesmas
     * condicoes da conferencia de producao.
     */
    botao(area_do_app, 20, 494, 984, 86, COR_CERTO, &fonte_28,
          cadastrando ? LV_SYMBOL_IMAGE "  Tirar a foto" : LV_SYMBOL_OK "  Bater o meu ponto",
          tocou_a_camera, NULL);

    const esp_err_t abriu = video_da_camera_abrir(moldura);
    /* Depois do video: no LVGL quem nasce depois fica por cima. */
    mira_desenhar(moldura, COR_CERTO, 44);

    if (abriu != ESP_OK) {
        lv_obj_t *sem = lv_label_create(moldura);
        lv_label_set_text(sem, "a camera nao abriu");
        lv_obj_set_style_text_color(sem, COR_APOIO, 0);
        lv_obj_set_style_text_font(sem, &fonte_22, 0);
        lv_obj_center(sem);
    }
}

/* ------------------------------------------------------------ montagem */

void app_pontos_montar(lv_obj_t *area)
{
    area_do_app = area;
    montar_o_inicio();
}

void app_pontos_desmontar(void)
{
    geracao++;              /* nada que esteja no ar vale mais */
    video_da_camera_fechar();
    fechar_o_sobreposto();
    soltar_a_foto();

    /* Os objetos morrem com a arvore; os ponteiros nao podem sobreviver a eles. */
    area_do_app = NULL;
    moldura = NULL;
    rot_estado = NULL;
    sobreposto = NULL;
    esperando = false;
    quantas_fotos = 0;
}
