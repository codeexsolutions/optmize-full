/*
 * ===========================================================================
 * O DESCANSO — a tela que fica quando ninguem esta ali
 * ===========================================================================
 *
 * Tres minutos sem um toque e a placa vira um relogio digital de parede. Um
 * toque em qualquer lugar e ela volta para a tela inicial.
 *
 * ---------------------------------------------------------------------------
 * ISTO NAO E PROTECAO DE TELA
 * ---------------------------------------------------------------------------
 *
 * LCD nao queima imagem parada -- a moda de "protetor de tela" morreu com o
 * tubo. Isto existe por outra razao, que e o que este aparelho e:
 *
 *   UM RELOGIO DE PAREDE quando ninguem precisa dele para outra coisa. Ele
 *   fica em pe na calandra o dia inteiro, e a maior parte desse dia ninguem
 *   esta mexendo nele. Mostrar tres cartoes de app parados e desperdicar a
 *   unica tela grande do galpao.
 *
 * ---------------------------------------------------------------------------
 * OS DIGITOS SAO DESENHADOS, E NAO ESCRITOS
 * ---------------------------------------------------------------------------
 *
 * Cada numero e feito de SETE SEGMENTOS -- as mesmas sete barrinhas do relogio
 * de cabeceira. Nao e enfeite: e o que resolve o problema de tamanho.
 *
 * A maior Montserrat que o LVGL traz pronta tem 48 pixels, e ampliar essa por
 * transformacao daria um borrao (o que estica e o desenho, nao a letra). Gerar
 * uma fonte de 200 custou 85 KB de flash e continuaria tendo um teto: para 300
 * pixels seria outra fonte, outro arquivo, mais flash.
 *
 * Barras desenhadas nao tem teto nenhum. A altura do digito e um numero neste
 * arquivo; todo o resto se ajusta sozinho, e sai nitido em qualquer tamanho
 * porque sao retangulos, nao imagem esticada.
 *
 * OS SEGMENTOS APAGADOS FICAM VISIVEIS, bem fracos. E o detalhe que faz a coisa
 * parecer um mostrador de verdade em vez de numeros flutuando: num relogio de
 * cabeceira voce ve as barras que nao acenderam.
 *
 * ---------------------------------------------------------------------------
 * TUDO NUMA GRADE
 * ---------------------------------------------------------------------------
 *
 * Os quatro digitos, os dois pontos e a linha da data vivem numa GRADE do LVGL,
 * e nao em posicoes contadas a mao. A diferenca aparece na data: ela ocupa
 * exatamente a largura do relogio, com o dia da semana encostado na esquerda e
 * o dia e o mes na direita. As bordas batem porque sao a MESMA largura, nao
 * porque alguem acertou os numeros.
 */

#include <stdio.h>
#include <time.h>

#include "esp_log.h"

#include "bsp/esp-bsp.h"
#include "interface.h"

static const char *TAG = "descanso";

/*
 * TRES MINUTOS.
 *
 * Curto o bastante para a tela virar relogio na maior parte do dia, e longo o
 * bastante para nao cair na cara de quem parou para pensar. Conferir uma peca
 * dificil -- olhar o tecido, olhar a arte, olhar de novo -- passa de um minuto
 * com facilidade; de tres, nao.
 */
#define ESPERA_MS (3 * 60 * 1000)

/*
 * O TAMANHO DO MOSTRADOR, e as contas que saem dele.
 *
 * ALTURA e o unico numero escolhido; largura e espessura sao proporcoes de
 * mostrador de verdade (metade da altura, e um oitavo dela de barra). Mudar so
 * a altura muda o relogio inteiro sem desalinhar nada.
 *
 * 300 numa tela de 600: o relogio ocupa metade da altura e sobra espaco para a
 * data e para o ar em volta. A largura fecha em 748 dos 1024 -- e uma margem de
 * 138 de cada lado, que e o que faz nao parecer apertado.
 */
#define ALTURA_DO_DIGITO   300
#define LARGURA_DO_DIGITO  (ALTURA_DO_DIGITO / 2)
#define BARRA              (ALTURA_DO_DIGITO / 8)
#define LARGURA_DOS_PONTOS (BARRA + 22)
#define FOLGA_ENTRE        22

#define LARGURA_DO_RELOGIO (4 * LARGURA_DO_DIGITO + LARGURA_DOS_PONTOS + 4 * FOLGA_ENTRE)

/*
 * QUAIS BARRAS ACENDEM EM CADA NUMERO.
 *
 * Um bit por barra, na ordem de sempre: A e a de cima, depois B e C descendo
 * pela direita, D embaixo, E e F subindo pela esquerda, G no meio.
 *
 *        A
 *      F   B
 *        G
 *      E   C
 *        D
 */
enum { SEG_A = 1 << 0, SEG_B = 1 << 1, SEG_C = 1 << 2, SEG_D = 1 << 3,
       SEG_E = 1 << 4, SEG_F = 1 << 5, SEG_G = 1 << 6 };

static const uint8_t ACENDE[10] = {
    SEG_A|SEG_B|SEG_C|SEG_D|SEG_E|SEG_F,          /* 0 */
    SEG_B|SEG_C,                                  /* 1 */
    SEG_A|SEG_B|SEG_G|SEG_E|SEG_D,                /* 2 */
    SEG_A|SEG_B|SEG_G|SEG_C|SEG_D,                /* 3 */
    SEG_F|SEG_G|SEG_B|SEG_C,                      /* 4 */
    SEG_A|SEG_F|SEG_G|SEG_C|SEG_D,                /* 5 */
    SEG_A|SEG_F|SEG_G|SEG_E|SEG_C|SEG_D,          /* 6 */
    SEG_A|SEG_B|SEG_C,                            /* 7 */
    SEG_A|SEG_B|SEG_C|SEG_D|SEG_E|SEG_F|SEG_G,    /* 8 */
    SEG_A|SEG_B|SEG_C|SEG_D|SEG_F|SEG_G,          /* 9 */
};

static lv_obj_t *cortina;
static lv_obj_t *barra_do_digito[4][7];   /* quatro numeros, sete barras cada */
static lv_obj_t *ponto_de_cima;
static lv_obj_t *ponto_de_baixo;
static lv_obj_t *rot_dia_da_semana;
static lv_obj_t *rot_dia_e_mes;
static lv_obj_t *rot_sem_rede;

static bool os_pontos_acesos;

static const char *DIAS[] = { "DOMINGO", "SEGUNDA", "TERCA", "QUARTA",
                              "QUINTA", "SEXTA", "SABADO" };
static const char *MESES[] = { "JANEIRO", "FEVEREIRO", "MARCO", "ABRIL",
                               "MAIO", "JUNHO", "JULHO", "AGOSTO",
                               "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO" };

bool descanso_esta_na_frente(void)
{
    return cortina != NULL;
}

void descanso_acordar(void)
{
    if (cortina == NULL) {
        return;
    }
    /*
     * APAGAR DEPOIS, e nao agora.
     *
     * Quem chama isto normalmente e o toque NA PROPRIA cortina, de dentro do
     * evento dela. Apagar o objeto que esta tratando o evento deixa o LVGL
     * continuando a trata-lo em memoria ja liberada -- o tipo de defeito que
     * nao aparece em teste e derruba a placa uma vez por semana.
     *
     * O `_async` marca para apagar no fim da volta do LVGL, quando o evento ja
     * acabou. Os ponteiros caem aqui mesmo, entao ninguem mais mexe nela.
     */
    lv_obj_delete_async(cortina);
    cortina = NULL;
    ponto_de_cima = NULL;
    ponto_de_baixo = NULL;
    rot_dia_da_semana = NULL;
    rot_dia_e_mes = NULL;
    rot_sem_rede = NULL;
    ESP_LOGI(TAG, "acordou");
}

static void tocou(lv_event_t *e)
{
    (void)e;
    descanso_acordar();
    /*
     * Volta para a tela inicial, e nao para onde estava. Quem sumiu por tres
     * minutos provavelmente nao e quem esta chegando agora -- e a casa e o
     * unico lugar que nao pressupoe nada sobre a pessoa na frente.
     */
    interface_voltar_ao_inicio();
}

/* ------------------------------------------------ as barras de um numero */

/*
 * Onde cada barra fica dentro do retangulo do numero.
 *
 * As verticais se sobrepoem as horizontais de proposito, meia barra em cada
 * ponta: sem isso ficariam quinas vazadas em todo canto, e o numero pareceria
 * montado com peca faltando.
 */
static void por_a_barra_no_lugar(lv_obj_t *b, int qual)
{
    const int H = ALTURA_DO_DIGITO;
    const int W = LARGURA_DO_DIGITO;
    const int T = BARRA;
    const int meia = (H - T) / 2;   /* altura de uma barra vertical */

    switch (qual) {
        case 0: lv_obj_set_size(b, W - T, T);  lv_obj_set_pos(b, T / 2, 0);           break; /* A */
        case 1: lv_obj_set_size(b, T, meia);   lv_obj_set_pos(b, W - T, T / 2);       break; /* B */
        case 2: lv_obj_set_size(b, T, meia);   lv_obj_set_pos(b, W - T, H / 2);       break; /* C */
        case 3: lv_obj_set_size(b, W - T, T);  lv_obj_set_pos(b, T / 2, H - T);       break; /* D */
        case 4: lv_obj_set_size(b, T, meia);   lv_obj_set_pos(b, 0, H / 2);           break; /* E */
        case 5: lv_obj_set_size(b, T, meia);   lv_obj_set_pos(b, 0, T / 2);           break; /* F */
        case 6: lv_obj_set_size(b, W - T, T);  lv_obj_set_pos(b, T / 2, (H - T) / 2); break; /* G */
        default: break;
    }
}

static lv_obj_t *caixa_limpa(lv_obj_t *pai)
{
    lv_obj_t *o = lv_obj_create(pai);
    lv_obj_set_style_bg_opa(o, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(o, 0, 0);
    lv_obj_set_style_radius(o, 0, 0);
    lv_obj_set_style_pad_all(o, 0, 0);
    lv_obj_remove_flag(o, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(o, LV_OBJ_FLAG_CLICKABLE);   /* o toque e da cortina */
    return o;
}

static void montar_um_digito(lv_obj_t *pai, int indice, int coluna)
{
    lv_obj_t *caixa = caixa_limpa(pai);
    lv_obj_set_size(caixa, LARGURA_DO_DIGITO, ALTURA_DO_DIGITO);
    lv_obj_set_grid_cell(caixa, LV_GRID_ALIGN_CENTER, coluna, 1,
                         LV_GRID_ALIGN_CENTER, 0, 1);

    for (int i = 0; i < 7; i++) {
        lv_obj_t *b = caixa_limpa(caixa);
        por_a_barra_no_lugar(b, i);
        lv_obj_set_style_bg_color(b, COR_TEXTO, 0);
        lv_obj_set_style_radius(b, BARRA / 2, 0);   /* pontas arredondadas */
        barra_do_digito[indice][i] = b;
    }
}

static void acender(int indice, int numero)
{
    const uint8_t quais = (numero >= 0 && numero <= 9) ? ACENDE[numero] : 0;
    for (int i = 0; i < 7; i++) {
        /*
         * Aceso e opaco; apagado nao some, fica em 10% -- e a barra que voce ve
         * sem acender no relogio de cabeceira. Sem ela o numero parece flutuar;
         * com ela ha um mostrador por tras.
         */
        lv_obj_set_style_bg_opa(barra_do_digito[indice][i],
                                (quais & (1 << i)) ? LV_OPA_COVER : LV_OPA_10, 0);
    }
}

/* ---------------------------------------------------- o que muda a cada s */

void descanso_atualizar(void)
{
    if (cortina == NULL) {
        return;
    }

    if (rede_tem_hora()) {
        time_t agora = time(NULL);
        struct tm hoje;
        localtime_r(&agora, &hoje);

        acender(0, hoje.tm_hour / 10);
        acender(1, hoje.tm_hour % 10);
        acender(2, hoje.tm_min / 10);
        acender(3, hoje.tm_min % 10);

        /*
         * OS DOIS PONTOS PISCAM a cada segundo. E a assinatura do relogio
         * digital, e faz um trabalho de verdade: de longe, um mostrador parado
         * e um aparelho travado sao a mesma imagem. O pisca diz que esta vivo.
         */
        os_pontos_acesos = !os_pontos_acesos;
        const lv_opa_t opa = os_pontos_acesos ? LV_OPA_COVER : LV_OPA_20;
        lv_obj_set_style_bg_opa(ponto_de_cima, opa, 0);
        lv_obj_set_style_bg_opa(ponto_de_baixo, opa, 0);

        lv_label_set_text(rot_dia_da_semana, DIAS[hoje.tm_wday % 7]);
        lv_label_set_text_fmt(rot_dia_e_mes, "%d DE %s",
                              hoje.tm_mday, MESES[hoje.tm_mon % 12]);
    } else {
        /* Sem hora da rede, nao se inventa uma -- a mesma regra da barra. */
        for (int i = 0; i < 4; i++) {
            acender(i, -1);   /* so o mostrador apagado, sem numero nenhum */
        }
        lv_obj_set_style_bg_opa(ponto_de_cima, LV_OPA_20, 0);
        lv_obj_set_style_bg_opa(ponto_de_baixo, LV_OPA_20, 0);
        lv_label_set_text(rot_dia_da_semana, "SEM HORA CERTA");
        lv_label_set_text(rot_dia_e_mes, "");
    }

    /* O aviso so existe quando ha o que avisar. */
    if (rede_conectada()) {
        lv_obj_add_flag(rot_sem_rede, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_remove_flag(rot_sem_rede, LV_OBJ_FLAG_HIDDEN);
    }
}

/* ------------------------------------------------------------ a montagem */

/*
 * A GRADE DO RELOGIO: cinco colunas, uma linha.
 *
 *     digito  digito  pontos  digito  digito
 *
 * A largura de cada uma e FIXA porque numero de relogio nao pode dancar: com
 * coluna elastica, o "1" -- que acende so duas barras -- encolheria a coluna e
 * o mostrador inteiro se mexeria a cada minuto.
 */
static const int32_t COLUNAS_DO_RELOGIO[] = {
    LARGURA_DO_DIGITO, LARGURA_DO_DIGITO, LARGURA_DOS_PONTOS,
    LARGURA_DO_DIGITO, LARGURA_DO_DIGITO, LV_GRID_TEMPLATE_LAST
};
static const int32_t LINHA_DO_RELOGIO[] = { ALTURA_DO_DIGITO, LV_GRID_TEMPLATE_LAST };

/*
 * A GRADE DA DATA: duas colunas que se dividem a MESMA largura do relogio.
 *
 * `LV_GRID_FR(1)` nas duas faz cada uma valer metade. O dia da semana encosta
 * na esquerda, o dia e o mes na direita, e as duas pontas batem com as pontas
 * do mostrador -- porque e a mesma largura, nao porque alguem acertou numeros
 * na mao.
 */
static const int32_t COLUNAS_DA_DATA[] = {
    LV_GRID_FR(1), LV_GRID_FR(1), LV_GRID_TEMPLATE_LAST
};
static const int32_t LINHA_DA_DATA[] = { LV_GRID_CONTENT, LV_GRID_TEMPLATE_LAST };

static void montar(void)
{
    /*
     * A cortina nasce na CAMADA DE CIMA, e nao na tela.
     *
     * Na tela ela seria irma da barra do topo e da area do app, e a ordem entre
     * irmaos depende de quem foi criado quando -- montar um app depois poria a
     * area por cima da cortina. A camada de cima do LVGL existe para isto: o
     * que esta nela fica por cima de tudo, sempre, sem depender de ordem.
     */
    cortina = lv_obj_create(lv_layer_top());
    lv_obj_set_size(cortina, LV_PCT(100), LV_PCT(100));
    lv_obj_set_pos(cortina, 0, 0);
    lv_obj_set_style_bg_color(cortina, lv_color_black(), 0);
    lv_obj_set_style_bg_opa(cortina, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(cortina, 0, 0);
    lv_obj_set_style_radius(cortina, 0, 0);
    lv_obj_set_style_pad_all(cortina, 0, 0);
    lv_obj_remove_flag(cortina, LV_OBJ_FLAG_SCROLLABLE);

    /*
     * A TELA INTEIRA E O BOTAO. Nao ha "toque aqui para voltar": quem chega
     * encosta em qualquer lugar e volta. Um alvo de 1024 por 600 e o unico que
     * ninguem erra de luva, no escuro, com pressa.
     */
    lv_obj_add_flag(cortina, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(cortina, tocou, LV_EVENT_CLICKED, NULL);

    /* --- a coluna que segura tudo, centrada --- */

    lv_obj_t *tudo = caixa_limpa(cortina);
    lv_obj_set_size(tudo, LARGURA_DO_RELOGIO, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(tudo, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_row(tudo, 34, 0);
    lv_obj_center(tudo);

    /* --- o mostrador --- */

    lv_obj_t *relogio = caixa_limpa(tudo);
    lv_obj_set_size(relogio, LV_PCT(100), ALTURA_DO_DIGITO);
    lv_obj_set_grid_dsc_array(relogio, COLUNAS_DO_RELOGIO, LINHA_DO_RELOGIO);
    lv_obj_set_style_pad_column(relogio, FOLGA_ENTRE, 0);

    montar_um_digito(relogio, 0, 0);
    montar_um_digito(relogio, 1, 1);

    lv_obj_t *pontos = caixa_limpa(relogio);
    lv_obj_set_size(pontos, LARGURA_DOS_PONTOS, ALTURA_DO_DIGITO);
    lv_obj_set_grid_cell(pontos, LV_GRID_ALIGN_CENTER, 2, 1,
                         LV_GRID_ALIGN_CENTER, 0, 1);

    /*
     * Os dois pontos ficam nos quartos da altura -- alinhados com os meios das
     * metades de cima e de baixo do numero, que e onde eles caem num mostrador
     * de verdade. E o que faz o conjunto parecer uma peca so.
     */
    for (int i = 0; i < 2; i++) {
        lv_obj_t *p = caixa_limpa(pontos);
        lv_obj_set_size(p, BARRA, BARRA);
        lv_obj_set_pos(p, (LARGURA_DOS_PONTOS - BARRA) / 2,
                       i == 0 ? ALTURA_DO_DIGITO / 4 - BARRA / 2
                              : ALTURA_DO_DIGITO * 3 / 4 - BARRA / 2);
        lv_obj_set_style_bg_color(p, COR_TEXTO, 0);
        lv_obj_set_style_radius(p, BARRA / 2, 0);
        if (i == 0) {
            ponto_de_cima = p;
        } else {
            ponto_de_baixo = p;
        }
    }

    montar_um_digito(relogio, 2, 3);
    montar_um_digito(relogio, 3, 4);

    /* --- a data, na largura do mostrador --- */

    lv_obj_t *data = caixa_limpa(tudo);
    lv_obj_set_size(data, LV_PCT(100), LV_SIZE_CONTENT);
    lv_obj_set_grid_dsc_array(data, COLUNAS_DA_DATA, LINHA_DA_DATA);

    rot_dia_da_semana = lv_label_create(data);
    lv_label_set_text(rot_dia_da_semana, "");
    lv_obj_set_style_text_font(rot_dia_da_semana, &lv_font_montserrat_28, 0);
    lv_obj_set_style_text_color(rot_dia_da_semana, COR_APOIO, 0);
    lv_obj_set_style_text_letter_space(rot_dia_da_semana, 3, 0);
    lv_obj_set_grid_cell(rot_dia_da_semana, LV_GRID_ALIGN_START, 0, 1,
                         LV_GRID_ALIGN_CENTER, 0, 1);

    rot_dia_e_mes = lv_label_create(data);
    lv_label_set_text(rot_dia_e_mes, "");
    lv_obj_set_style_text_font(rot_dia_e_mes, &lv_font_montserrat_28, 0);
    lv_obj_set_style_text_color(rot_dia_e_mes, COR_APOIO, 0);
    lv_obj_set_style_text_letter_space(rot_dia_e_mes, 3, 0);
    lv_obj_set_grid_cell(rot_dia_e_mes, LV_GRID_ALIGN_END, 1, 1,
                         LV_GRID_ALIGN_CENTER, 0, 1);

    /* --- o aviso, quando houver --- */

    rot_sem_rede = lv_label_create(cortina);
    lv_label_set_text(rot_sem_rede, LV_SYMBOL_WARNING "  SEM REDE");
    lv_obj_set_style_text_font(rot_sem_rede, &lv_font_montserrat_22, 0);
    lv_obj_set_style_text_color(rot_sem_rede, COR_DESTAQUE, 0);
    lv_obj_set_style_text_letter_space(rot_sem_rede, 2, 0);
    lv_obj_align(rot_sem_rede, LV_ALIGN_BOTTOM_MID, 0, -26);
    lv_obj_add_flag(rot_sem_rede, LV_OBJ_FLAG_HIDDEN);

    os_pontos_acesos = false;   /* o primeiro desenho ja acende */
    descanso_atualizar();
    ESP_LOGI(TAG, "entrou em descanso (digito %dx%d, mostrador %d de largura)",
             LARGURA_DO_DIGITO, ALTURA_DO_DIGITO, LARGURA_DO_RELOGIO);
}

/*
 * Chamado a cada segundo pela casca.
 *
 * A ociosidade vem do PROPRIO LVGL (`lv_display_get_inactive_time`), que ja
 * conta desde o ultimo evento de entrada. Contar por fora exigiria pendurar um
 * ouvinte em cada tela e lembrar de faze-lo em toda tela nova -- e a primeira
 * esquecida vira uma tela que nunca descansa, ou pior, uma que descansa no meio
 * de alguem usando.
 */
void descanso_conferir(void)
{
    if (cortina != NULL) {
        descanso_atualizar();
        return;
    }
    if (lv_display_get_inactive_time(NULL) >= ESPERA_MS) {
        montar();
    }
}
