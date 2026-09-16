/*
 * ===========================================================================
 * A AJUDA — o que fazer quando alguma coisa nao vai
 * ===========================================================================
 *
 * Uma lista de sintomas. Toca-se no que esta acontecendo e a resposta abre
 * embaixo.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO MORA NO APARELHO
 * ---------------------------------------------------------------------------
 *
 * Tudo que esta aqui tambem esta escrito no `TELAS.md` do repositorio. E nao
 * adianta: quem esta na calandra as sete da manha, com a camera nao abrindo e
 * a fila esperando, nao vai abrir um documento num computador que fica noutra
 * sala.
 *
 * A ajuda tem de estar onde o problema esta.
 *
 * ---------------------------------------------------------------------------
 * PELO SINTOMA, E NAO PELO ASSUNTO
 * ---------------------------------------------------------------------------
 *
 * As entradas sao O QUE A PESSOA VE -- "a camera nao abriu", "nao te
 * reconheci" --, e nao categorias como "problemas de camera" ou "rede". Quem
 * esta com um problema sabe o que esta na tela; nao sabe em que gaveta aquilo
 * foi arquivado.
 *
 * Por isso os titulos aqui repetem, PALAVRA POR PALAVRA, as frases que as
 * outras telas mostram. Procurar aqui e achar a mesma frase, nao uma traducao
 * dela.
 */

#include <stdio.h>
#include <string.h>

#include "esp_log.h"

#include "interface.h"

static const char *TAG = "ajuda";

static lv_obj_t *cortina;
static lv_obj_t *rolo;
static lv_obj_t *aberta;      /* a resposta que esta aberta, se houver */

typedef struct {
    const char *sintoma;
    const char *resposta;
} Caso;

/*
 * OS CASOS, na ordem em que aparecem na vida -- nao em ordem alfabetica.
 *
 * Camera primeiro porque e o que mais aconteceu; rede por ultimo porque quando
 * ela cai quase tudo para, e a pessoa percebe sozinha.
 */
static const Caso CASOS[] = {
    {
        "A camera nao abriu",
        "O codigo ao lado da frase e o motivo de verdade.\n\n"
        "ESP_ERR_NO_MEM e falta de memoria, e nao cabo solto -- saia do app e "
        "entre de novo. Se repetir, desligue e ligue o aparelho na tomada.\n\n"
        "Antes esta tela dizia \"camera nao encontrada\" para tudo, o que mandava "
        "conferir o cabo de uma camera ligada e funcionando."
    },
    {
        "Diz \"procurando a camera...\"",
        "Normal nos primeiros segundos: a camera leva uns quatro segundos para "
        "se apresentar no USB depois que a placa liga.\n\n"
        "O terminal insiste sozinho. Nao precisa sair e voltar."
    },
    {
        "Diz \"a camera caiu -- reconectando\"",
        "Passaram tres segundos sem nenhum quadro. O terminal reergue a "
        "transmissao sozinho, e a imagem costuma voltar em dois segundos.\n\n"
        "Se ficar repetindo, o problema e de ALIMENTACAO e nao de programa: "
        "baixe o brilho da tela em Ajustes e veja se para. A camera e a tela "
        "dividem a mesma fonte."
    },
    {
        "Diz que o QR nao e de uma lista de producao",
        "O codigo foi lido certo -- ele so nao serve aqui.\n\n"
        "Cada folha tem codigos diferentes: o de ordem de servico comeca com O, "
        "o de um trabalho avulso com R. O que esta tela quer e o QR GRANDE do "
        "rodape da folha de producao, que comeca com P."
    },
    {
        "Diz \"nao te reconheci\"",
        "Isto nao e erro: a lista de nomes abre logo em seguida, e a batida "
        "pelo nome vale igual.\n\n"
        "Se acontecer sempre com a mesma pessoa, o cadastro dela tem rostos de "
        "menos. Entre em Pontos, Cadastrar rosto, e tire mais dois -- um de "
        "lado e um com o que ela usa na cabeca."
    },
    {
        "Diz \"achei 2 rostos nesta foto\"",
        "Alguem passou atras na hora da foto.\n\n"
        "Tire outra com uma pessoa so. O servidor recusa de proposito: guardar "
        "o rosto errado no nome de alguem faria o ponto dessa pessoa ser batido "
        "por outra, e ninguem descobriria ate o fim do mes."
    },
    {
        "O relogio mostra --:-- e a rede esta em ambar",
        "O terminal esta sem rede, e por isso sem hora.\n\n"
        "Producao e Pontos param: os dois dependem do servidor. O texto ao lado "
        "do simbolo na barra diz o motivo -- senha errada, rede nao encontrada.\n\n"
        "Va em Ajustes, toque em buscar, escolha a rede e digite a senha."
    },
    {
        "Diz \"sem servidor configurado\"",
        "O endereco do Optmize nao esta gravado nesta placa.\n\n"
        "Ele fica guardado no aparelho e se ajusta em Ajustes. E o endereco do "
        "computador onde o Optmize roda, com a porta -- por exemplo "
        "192.168.0.194:8000."
    },
    {
        "A tela virou um relogio grande",
        "Nao ha nada errado: sao tres minutos sem ninguem tocar.\n\n"
        "Toque em qualquer lugar da tela e ela volta ao inicio."
    },
};
#define QUANTOS_CASOS (sizeof(CASOS) / sizeof(CASOS[0]))

/* ------------------------------------------------------------ fechar */

void ajuda_fechar(void)
{
    if (cortina == NULL) {
        return;
    }
    /* Assincrono: quem chama e o toque no proprio botao de fechar. */
    lv_obj_delete_async(cortina);
    cortina = NULL;
    rolo = NULL;
    aberta = NULL;
}

static void tocou_fechar(lv_event_t *e)
{
    (void)e;
    ajuda_fechar();
}

/* ------------------------------------------------------ abrir um caso */

/*
 * UMA RESPOSTA POR VEZ.
 *
 * Abrir a segunda fecha a primeira. Com todas abertas a lista viraria uma
 * parede de texto, e a pessoa perderia de vista quais eram as perguntas --
 * que e justamente como ela se acha aqui.
 */
static void tocou_um_caso(lv_event_t *e)
{
    lv_obj_t *linha = lv_event_get_target(e);
    lv_obj_t *resposta = lv_obj_get_user_data(linha);
    if (resposta == NULL) {
        return;
    }

    const bool ja_estava_aberta = (resposta == aberta);

    if (aberta != NULL) {
        lv_obj_add_flag(aberta, LV_OBJ_FLAG_HIDDEN);
        aberta = NULL;
    }
    if (!ja_estava_aberta) {
        lv_obj_remove_flag(resposta, LV_OBJ_FLAG_HIDDEN);
        aberta = resposta;
        /* Rola ate ela: aberta abaixo da dobra, ninguem saberia que abriu. */
        lv_obj_scroll_to_view(resposta, LV_ANIM_ON);
    }
}

/* ------------------------------------------------------------ montar */

void ajuda_mostrar(lv_obj_t *pai)
{
    ajuda_fechar();

    cortina = lv_obj_create(pai);
    lv_obj_set_size(cortina, LV_PCT(100), LV_PCT(100));
    lv_obj_set_pos(cortina, 0, 0);
    lv_obj_set_style_bg_color(cortina, COR_FUNDO, 0);
    lv_obj_set_style_bg_opa(cortina, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(cortina, 0, 0);
    lv_obj_set_style_radius(cortina, 0, 0);
    lv_obj_set_style_pad_all(cortina, 0, 0);
    lv_obj_remove_flag(cortina, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *titulo = lv_label_create(cortina);
    lv_label_set_text(titulo, "O que esta acontecendo?");
    lv_obj_set_style_text_color(titulo, COR_TEXTO, 0);
    lv_obj_set_style_text_font(titulo, &fonte_28, 0);
    lv_obj_set_pos(titulo, 24, 12);

    lv_obj_t *apoio = lv_label_create(cortina);
    lv_label_set_text(apoio, "toque no que aparece na tela");
    lv_obj_set_style_text_color(apoio, COR_FRACA, 0);
    lv_obj_set_style_text_font(apoio, &fonte_16, 0);
    lv_obj_set_pos(apoio, 26, 48);

    lv_obj_t *fechar = lv_button_create(cortina);
    lv_obj_set_size(fechar, 120, 48);
    lv_obj_align(fechar, LV_ALIGN_TOP_RIGHT, -20, 12);
    lv_obj_set_style_bg_color(fechar, COR_CARTAO, 0);
    lv_obj_set_style_border_color(fechar, COR_BORDA, 0);
    lv_obj_set_style_border_width(fechar, 1, 0);
    lv_obj_set_style_radius(fechar, RAIO_MIUDO, 0);
    lv_obj_set_style_shadow_width(fechar, 0, 0);
    lv_obj_add_event_cb(fechar, tocou_fechar, LV_EVENT_CLICKED, NULL);
    lv_obj_t *rf = lv_label_create(fechar);
    lv_label_set_text(rf, "Fechar");
    lv_obj_set_style_text_font(rf, &fonte_16, 0);
    lv_obj_center(rf);

    rolo = lv_obj_create(cortina);
    lv_obj_set_size(rolo, LV_HOR_RES - 40, LV_VER_RES - 56 - 86);
    lv_obj_set_pos(rolo, 20, 78);
    lv_obj_set_style_bg_opa(rolo, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(rolo, 0, 0);
    lv_obj_set_style_pad_all(rolo, 0, 0);
    lv_obj_set_flex_flow(rolo, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_row(rolo, 6, 0);

    for (int i = 0; i < (int)QUANTOS_CASOS; i++) {
        lv_obj_t *linha = lv_obj_create(rolo);
        lv_obj_set_size(linha, LV_PCT(100), 54);
        lv_obj_set_style_bg_color(linha, COR_CARTAO, 0);
        lv_obj_set_style_bg_color(linha, COR_CARTAO_SUAVE, LV_STATE_PRESSED);
        lv_obj_set_style_border_color(linha, COR_BORDA, 0);
        lv_obj_set_style_border_width(linha, 1, 0);
        lv_obj_set_style_radius(linha, RAIO_MIUDO, 0);
        lv_obj_set_style_pad_all(linha, 14, 0);
        lv_obj_remove_flag(linha, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_add_flag(linha, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_add_event_cb(linha, tocou_um_caso, LV_EVENT_CLICKED, NULL);

        lv_obj_t *r = lv_label_create(linha);
        lv_label_set_text(r, CASOS[i].sintoma);
        lv_obj_set_style_text_color(r, COR_TEXTO, 0);
        lv_obj_set_style_text_font(r, &fonte_22, 0);
        lv_label_set_long_mode(r, LV_LABEL_LONG_DOT);
        lv_obj_set_width(r, LV_HOR_RES - 120);
        lv_obj_set_pos(r, 0, 0);

        lv_obj_t *seta = lv_label_create(linha);
        lv_label_set_text(seta, LV_SYMBOL_RIGHT);
        lv_obj_set_style_text_color(seta, COR_FRACA, 0);
        lv_obj_set_style_text_font(seta, &fonte_16, 0);
        lv_obj_align(seta, LV_ALIGN_RIGHT_MID, 0, 0);

        /*
         * A resposta nasce escondida e e IRMA da linha, nao filha: filha dentro
         * de uma linha de altura fixa ficaria cortada, e mudar a altura da
         * linha empurraria a seta para fora do lugar.
         */
        lv_obj_t *resposta = lv_obj_create(rolo);
        lv_obj_set_size(resposta, LV_PCT(100), LV_SIZE_CONTENT);
        lv_obj_set_style_bg_color(resposta, COR_FUNDO, 0);
        lv_obj_set_style_border_color(resposta, COR_DESTAQUE, 0);
        lv_obj_set_style_border_width(resposta, 0, 0);
        lv_obj_set_style_border_side(resposta, LV_BORDER_SIDE_LEFT, 0);
        lv_obj_set_style_border_width(resposta, 2, 0);
        lv_obj_set_style_radius(resposta, 0, 0);
        lv_obj_set_style_pad_all(resposta, 14, 0);
        lv_obj_remove_flag(resposta, LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_remove_flag(resposta, LV_OBJ_FLAG_CLICKABLE);
        lv_obj_add_flag(resposta, LV_OBJ_FLAG_HIDDEN);

        lv_obj_t *texto = lv_label_create(resposta);
        lv_label_set_text(texto, CASOS[i].resposta);
        lv_obj_set_style_text_color(texto, COR_APOIO, 0);
        lv_obj_set_style_text_font(texto, &fonte_16, 0);
        lv_obj_set_style_text_line_space(texto, 4, 0);
        lv_label_set_long_mode(texto, LV_LABEL_LONG_WRAP);
        lv_obj_set_width(texto, LV_HOR_RES - 100);

        lv_obj_set_user_data(linha, resposta);
    }

    ESP_LOGI(TAG, "ajuda aberta (%d casos)", (int)QUANTOS_CASOS);
}
