/*
 * ===========================================================================
 * APP DE PONTOS — a camera bate o ponto
 * ===========================================================================
 *
 * A pessoa para na frente da tela, aperta um botao do tamanho da mao, e o
 * terminal fotografa. O servidor diz de quem e o rosto e ja grava a batida.
 *
 * ---------------------------------------------------------------------------
 * O BOTAO EXISTE, E ISSO E DE PROPOSITO
 * ---------------------------------------------------------------------------
 *
 * A tentacao e bater sozinho: achou rosto, gravou. Nao serve aqui. Este
 * aparelho fica em pe na calandra, e passa gente na frente dele o dia inteiro
 * -- levando rolo, indo ao banheiro, conversando. Sem o botao, o ponto de todo
 * mundo seria batido varias vezes por dia por acidente, e alguem teria de
 * limpar isso na mao toda semana.
 *
 * O toque e o que diz "eu quero bater agora". Vale o segundo que custa.
 *
 * ---------------------------------------------------------------------------
 * O ROSTO FALHA, E A TELA CONTINUA
 * ---------------------------------------------------------------------------
 *
 * Nenhum reconhecimento acerta sempre: bone, barba nova, luz de frente, alguem
 * que ainda nao cadastrou o rosto. Se a unica saida fosse o rosto, a primeira
 * falha deixaria uma pessoa sem bater o ponto -- e um relogio de ponto que as
 * vezes nao deixa bater e um relogio de ponto quebrado.
 *
 * Por isso "nao te reconheci" NAO e um erro: e a porta para a lista de nomes. A
 * batida sai igual, e o servidor grava a origem, entao quem confere depois ve
 * quais foram pelo rosto e quais foram na unha.
 *
 * ---------------------------------------------------------------------------
 * AS QUATRO TELAS
 * ---------------------------------------------------------------------------
 *
 * A CAMERA     o video e um botao grande
 * ESPERANDO    a foto subiu, o servidor esta olhando
 * DEU CERTO    o nome, a hora e que batida foi -- some sozinha
 * A LISTA      os nomes, quando o rosto nao resolveu
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
 * QUANTO A TELA DO "DEU CERTO" FICA.
 *
 * Quatro segundos: o tempo de ler um nome e uma hora e ter certeza de que foi o
 * seu. Menos que isso e quem estava guardando o cracha perde a confirmacao;
 * mais, e a fila espera por nada.
 */
#define QUANTO_MOSTRAR_MS 4000

static lv_obj_t *area_do_app;
static lv_obj_t *moldura;        /* onde o video mora */
static lv_obj_t *rot_estado;
static lv_obj_t *sobreposto;     /* o resultado, ou a lista de nomes */
static lv_timer_t *volta_sozinho;

static uint8_t *foto;            /* a ultima foto, nossa ate soltarmos */
static size_t   foto_bytes;
static bool     esperando;       /* ha um pedido no ar */

/* Uma geracao por tela: ver `chegou_a_resposta`. */
static uint32_t geracao;
static uint32_t geracao_pedida;

static void montar_a_camera(void);

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
    lv_obj_set_style_radius(b, 12, 0);
    lv_obj_add_event_cb(b, quando_tocar, LV_EVENT_CLICKED, carga);

    lv_obj_t *r = lv_label_create(b);
    lv_label_set_text(r, texto);
    lv_obj_set_style_text_font(r, fonte, 0);
    const bool forte = lv_color_eq(cor, COR_CERTO) || lv_color_eq(cor, COR_DESTAQUE);
    lv_obj_set_style_text_color(r, forte ? lv_color_black() : COR_TEXTO, 0);
    lv_obj_set_style_text_align(r, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_center(r);
    return b;
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
    montar_a_camera();
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

    lv_obj_t *marca = lv_label_create(c);
    lv_label_set_text(marca, LV_SYMBOL_OK);
    lv_obj_set_style_text_color(marca, COR_CERTO, 0);
    lv_obj_set_style_text_font(marca, &lv_font_montserrat_48, 0);
    lv_obj_align(marca, LV_ALIGN_TOP_MID, 0, 40);

    lv_obj_t *nome = lv_label_create(c);
    lv_label_set_text(nome, b->nome);
    lv_obj_set_style_text_color(nome, COR_TEXTO, 0);
    lv_obj_set_style_text_font(nome, &lv_font_montserrat_48, 0);
    lv_label_set_long_mode(nome, LV_LABEL_LONG_DOT);
    lv_obj_set_width(nome, LV_HOR_RES - 80);
    lv_obj_set_style_text_align(nome, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(nome, LV_ALIGN_CENTER, 0, -30);

    lv_obj_t *oque = lv_label_create(c);
    lv_label_set_text_fmt(oque, "%s  as  %s", em_palavras(b->tipo), b->hora);
    lv_obj_set_style_text_color(oque, COR_APOIO, 0);
    lv_obj_set_style_text_font(oque, &lv_font_montserrat_28, 0);
    lv_obj_align(oque, LV_ALIGN_CENTER, 0, 40);

    /*
     * A tela volta sozinha. Ninguem devia precisar tocar de novo so para
     * liberar o aparelho para a proxima pessoa da fila.
     */
    volta_sozinho = lv_timer_create(tempo_de_voltar, QUANTO_MOSTRAR_MS, NULL);
    lv_timer_set_repeat_count(volta_sozinho, 1);

    ESP_LOGI(TAG, "%s -- %s as %s", b->nome, b->tipo, b->hora);
}

/* -------------------------------------------------- a lista de nomes */

static void bateu_pelo_nome(const Batida *b, const char *erro)
{
    const uint32_t minha = geracao_pedida;
    if (!bsp_display_lock(500)) {
        return;
    }
    if (minha == geracao && area_do_app != NULL) {
        if (b != NULL) {
            montar_o_sucesso(b);
        } else if (rot_estado != NULL) {
            lv_label_set_text(rot_estado, erro ? erro : "nao deu");
            lv_obj_set_style_text_color(rot_estado, COR_DESTAQUE, 0);
        }
    }
    bsp_display_unlock();
}

static void tocou_um_nome(lv_event_t *e)
{
    const int id = (int)(intptr_t)lv_event_get_user_data(e);
    geracao_pedida = geracao;
    optmize_bater_pelo_nome(id, bateu_pelo_nome);

    /* Some na hora: a fila nao precisa ver a lista enquanto a rede responde. */
    lv_obj_t *c = abrir_o_sobreposto();
    lv_obj_t *r = lv_label_create(c);
    lv_label_set_text(r, "registrando...");
    lv_obj_set_style_text_color(r, COR_APOIO, 0);
    lv_obj_set_style_text_font(r, &lv_font_montserrat_28, 0);
    lv_obj_center(r);
    rot_estado = r;
}

static void tocou_voltar_a_camera(lv_event_t *e)
{
    (void)e;
    montar_a_camera();
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
    lv_label_set_text(titulo, erro ? erro : "Toque no seu nome");
    lv_obj_set_style_text_color(titulo, erro ? COR_DESTAQUE : COR_TEXTO, 0);
    lv_obj_set_style_text_font(titulo, &lv_font_montserrat_28, 0);
    lv_obj_set_pos(titulo, 24, 14);

    botao(c, LV_HOR_RES - 224, 10, 200, 56, COR_CARTAO, &lv_font_montserrat_16,
          LV_SYMBOL_REFRESH "  tentar o rosto", tocou_voltar_a_camera, NULL);

    if (erro != NULL || quantos == 0) {
        lv_obj_t *nada = lv_label_create(c);
        lv_label_set_text(nada, (quantos == 0 && erro == NULL)
            ? "Ninguem cadastrado no Optmize ainda."
            : "Sem lista de nomes -- confira a rede em Ajustes.");
        lv_obj_set_style_text_color(nada, COR_APOIO, 0);
        lv_obj_set_style_text_font(nada, &lv_font_montserrat_22, 0);
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
    lv_obj_set_size(rolo, LV_HOR_RES - 32, LV_VER_RES - 56 - 86);
    lv_obj_set_pos(rolo, 16, 76);
    lv_obj_set_style_bg_opa(rolo, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(rolo, 0, 0);
    lv_obj_set_style_pad_all(rolo, 0, 0);

    const int largura = (LV_HOR_RES - 32 - 16) / 2;
    for (int i = 0; i < quantos; i++) {
        botao(rolo, (i % 2) * (largura + 16), (i / 2) * 88, largura, 76,
              COR_CARTAO, &lv_font_montserrat_22, lista[i].nome,
              tocou_um_nome, (void *)(intptr_t)lista[i].id);
    }

    bsp_display_unlock();
}

/* ------------------------------------------------- a resposta do rosto */

/*
 * Roda na tarefa do Optmize, nao na do LVGL -- por isso a tranca em volta de
 * tudo que toca na tela.
 */
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
        if (rot_estado != NULL) {
            lv_label_set_text(rot_estado, "nao te reconheci -- buscando os nomes...");
            lv_obj_set_style_text_color(rot_estado, COR_APOIO, 0);
        }
        bsp_display_unlock();
        optmize_listar_funcionarios(chegou_a_lista);
        return;
    }

    if (rot_estado != NULL) {
        lv_label_set_text(rot_estado, erro ? erro : "nao deu");
        lv_obj_set_style_text_color(rot_estado, COR_DESTAQUE, 0);
    }
    bsp_display_unlock();
}

/* ------------------------------------------------------- fotografar */

static void tocou_bater(lv_event_t *e)
{
    (void)e;
    if (esperando) {
        return;   /* ja ha um pedido no ar; o segundo toque nao adianta nada */
    }

    soltar_a_foto();
    const esp_err_t r = video_da_camera_fotografar(&foto, &foto_bytes, 1500);
    if (r != ESP_OK) {
        if (rot_estado != NULL) {
            lv_label_set_text(rot_estado, "a camera nao entregou a foto");
            lv_obj_set_style_text_color(rot_estado, COR_DESTAQUE, 0);
        }
        return;
    }

    esperando = true;
    geracao_pedida = geracao;
    if (rot_estado != NULL) {
        lv_label_set_text(rot_estado, "olhando...");
        lv_obj_set_style_text_color(rot_estado, COR_APOIO, 0);
    }
    optmize_bater_por_rosto(foto, foto_bytes, chegou_a_resposta);
}

/* ---------------------------------------------------------- a camera */

static void montar_a_camera(void)
{
    geracao++;              /* o que estiver no ar deixa de valer */
    esperando = false;
    fechar_o_sobreposto();
    soltar_a_foto();
    lv_obj_clean(area_do_app);
    rot_estado = NULL;

    moldura = lv_obj_create(area_do_app);
    lv_obj_set_size(moldura, 620, 466);
    lv_obj_set_pos(moldura, 20, 14);
    lv_obj_set_style_bg_color(moldura, lv_color_black(), 0);
    lv_obj_set_style_border_color(moldura, COR_BORDA, 0);
    lv_obj_set_style_border_width(moldura, 1, 0);
    lv_obj_set_style_radius(moldura, 12, 0);
    lv_obj_set_style_pad_all(moldura, 0, 0);
    lv_obj_remove_flag(moldura, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *coluna = lv_obj_create(area_do_app);
    lv_obj_set_size(coluna, 340, 466);
    lv_obj_set_pos(coluna, 664, 14);
    lv_obj_set_style_bg_color(coluna, COR_CARTAO, 0);
    lv_obj_set_style_border_color(coluna, COR_BORDA, 0);
    lv_obj_set_style_border_width(coluna, 1, 0);
    lv_obj_set_style_radius(coluna, 14, 0);
    lv_obj_set_style_pad_all(coluna, 20, 0);
    lv_obj_remove_flag(coluna, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *titulo = lv_label_create(coluna);
    lv_label_set_text(titulo, "Bater ponto");
    lv_obj_set_style_text_color(titulo, COR_TEXTO, 0);
    lv_obj_set_style_text_font(titulo, &lv_font_montserrat_28, 0);
    lv_obj_set_pos(titulo, 0, 0);

    lv_obj_t *ajuda = lv_label_create(coluna);
    lv_label_set_text(ajuda,
        "olhe para a camera, de frente e com o rosto iluminado\n\n"
        "o servidor decide que batida e esta, pelo que voce ja bateu hoje");
    lv_obj_set_style_text_color(ajuda, COR_APOIO, 0);
    lv_obj_set_style_text_font(ajuda, &lv_font_montserrat_16, 0);
    lv_label_set_long_mode(ajuda, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(ajuda, 296);
    lv_obj_set_pos(ajuda, 0, 46);

    rot_estado = lv_label_create(coluna);
    lv_label_set_text(rot_estado, "");
    lv_obj_set_style_text_font(rot_estado, &lv_font_montserrat_16, 0);
    lv_label_set_long_mode(rot_estado, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(rot_estado, 296);
    lv_obj_set_pos(rot_estado, 0, 210);

    /*
     * O ALVO DE BATER OCUPA A LARGURA DA TELA. E o unico botao que importa
     * aqui, e quem o aperta pode estar de luva, com a mao suja, com pressa --
     * as mesmas condicoes da conferencia de producao.
     */
    botao(area_do_app, 20, 494, 984, 86, COR_CERTO, &lv_font_montserrat_28,
          LV_SYMBOL_OK "  Bater o meu ponto", tocou_bater, NULL);

    if (video_da_camera_abrir(moldura) != ESP_OK) {
        lv_obj_t *sem = lv_label_create(moldura);
        lv_label_set_text(sem, "a camera nao abriu");
        lv_obj_set_style_text_color(sem, COR_APOIO, 0);
        lv_obj_set_style_text_font(sem, &lv_font_montserrat_22, 0);
        lv_obj_center(sem);
    }
}

/* ------------------------------------------------------------ montagem */

void app_pontos_montar(lv_obj_t *area)
{
    area_do_app = area;
    montar_a_camera();
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
}
