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
static lv_obj_t *rot_data;
static lv_obj_t *marca_da_barra;
static lv_obj_t *nome_na_barra;
static lv_obj_t *rot_rede;
static lv_obj_t *sinal_de_rede;   /* o simbolo ao lado do relogio */
static lv_obj_t *botao_voltar;

/* Qual app esta aberto, para saber o que desmontar. */
static enum { NENHUM, PRODUCAO, PONTOS, AJUSTES } aberto = NENHUM;

static void abrir_inicio(void);
static void tocou_ajuda(lv_event_t *e)
{
    (void)e;
    ajuda_mostrar(area);
}

static void tocou_sobre(lv_event_t *e);
static void tocou_ajuda(lv_event_t *e);

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
    descanso_conferir();

    if (rede_tem_hora()) {
        time_t agora = time(NULL);
        struct tm hoje;
        localtime_r(&agora, &hoje);
        lv_label_set_text_fmt(rot_relogio, "%02d:%02d", hoje.tm_hour, hoje.tm_min);
        lv_label_set_text_fmt(rot_data, "%02d/%02d/%04d",
                              hoje.tm_mday, hoje.tm_mon + 1, hoje.tm_year + 1900);
    } else {
        /* Sem hora da rede, nao se inventa uma. Ver o cabecalho. */
        lv_label_set_text(rot_relogio, "--:--");
        lv_label_set_text(rot_data, "sem data");
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
        lv_obj_set_style_text_color(sinal_de_rede, COR_ATENCAO, 0);

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
    /*
     * A barra usa a cor da BARRA LATERAL do painel (`--sidebar-bg`), e nao a de
     * cartao. No Optmize a navegacao e um degrau mais escura que o conteudo, e
     * e isso que faz a moldura parecer moldura em vez de mais um cartao.
     *
     * A linha de baixo e `--border-soft`: ela separa sem desenhar. Uma borda
     * cheia aqui viraria um risco atravessando a tela.
     */
    lv_obj_set_style_bg_color(barra, COR_BARRA, 0);
    lv_obj_set_style_border_side(barra, LV_BORDER_SIDE_BOTTOM, 0);
    lv_obj_set_style_border_color(barra, COR_BORDA_SUAVE, 0);
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
    lv_obj_set_style_bg_color(botao_voltar, COR_CARTAO, 0);
    lv_obj_set_style_border_color(botao_voltar, COR_BORDA, 0);
    lv_obj_set_style_border_width(botao_voltar, 1, 0);
    lv_obj_set_style_radius(botao_voltar, RAIO_MIUDO, 0);
    lv_obj_set_style_shadow_width(botao_voltar, 0, 0);
    lv_obj_add_event_cb(botao_voltar, tocou_voltar, LV_EVENT_CLICKED, NULL);
    lv_obj_add_flag(botao_voltar, LV_OBJ_FLAG_HIDDEN);   /* so fora do inicio */

    lv_obj_t *seta = lv_label_create(botao_voltar);
    lv_label_set_text(seta, LV_SYMBOL_LEFT "  voltar");
    lv_obj_set_style_text_color(seta, COR_TEXTO, 0);
    lv_obj_set_style_text_font(seta, &fonte_16, 0);
    lv_obj_center(seta);

    /*
     * A MARCA NA BARRA, e nao so na tela inicial.
     *
     * Este aparelho fica em pe num galpao com outras telas -- a da impressora,
     * a do computador da mesa. Quem olha de longe precisa saber de qual sistema
     * e a tela que esta vendo, e a marca responde isso sem ler nada.
     *
     * Ela mora a ESQUERDA do titulo e some quando o botao de voltar aparece:
     * dentro de um app, o que importa e onde a pessoa esta, nao de quem e o
     * programa.
     */
    marca_da_barra = lv_image_create(barra);
    lv_image_set_src(marca_da_barra, &logo_28);
    lv_obj_set_style_image_recolor(marca_da_barra, COR_DESTAQUE, 0);
    lv_obj_set_style_image_recolor_opa(marca_da_barra, LV_OPA_COVER, 0);
    lv_obj_align(marca_da_barra, LV_ALIGN_LEFT_MID, 14, 0);

    nome_na_barra = lv_label_create(barra);
    lv_label_set_text(nome_na_barra, "Optmize");
    lv_obj_set_style_text_color(nome_na_barra, COR_TEXTO, 0);
    lv_obj_set_style_text_font(nome_na_barra, &fonte_22, 0);
    lv_obj_align(nome_na_barra, LV_ALIGN_LEFT_MID, 50, 0);

    rot_titulo = lv_label_create(barra);
    lv_obj_set_style_text_color(rot_titulo, COR_TEXTO, 0);
    lv_obj_set_style_text_font(rot_titulo, &fonte_22, 0);
    lv_obj_align(rot_titulo, LV_ALIGN_LEFT_MID, 150, 0);

    rot_relogio = lv_label_create(barra);
    lv_obj_set_style_text_color(rot_relogio, COR_TEXTO, 0);
    lv_obj_set_style_text_font(rot_relogio, &fonte_28, 0);
    /*
     * Numero de relogio com espacamento fixo. Sem isto, os digitos tem larguras
     * diferentes e a hora DANCA de um lado para o outro a cada minuto -- o tipo
     * de tremor que se ve sem saber o que se esta vendo.
     */
    lv_obj_set_style_text_letter_space(rot_relogio, 1, 0);
    lv_obj_align(rot_relogio, LV_ALIGN_RIGHT_MID, -20, 0);

    /*
     * A DATA ABAIXO DA HORA, em corpo pequeno.
     *
     * Parece supérfluo num aparelho e nao e: as batidas de ponto e as marcas de
     * conferencia levam a data do servidor, e quem confere o ponto no fim do mes
     * precisa saber que dia o terminal acha que e. Um terminal com a data errada
     * grava tudo no dia errado, e isso so aparece semanas depois.
     */
    rot_data = lv_label_create(barra);
    lv_obj_set_style_text_color(rot_data, COR_FRACA, 0);
    lv_obj_set_style_text_font(rot_data, &fonte_16, 0);
    lv_obj_align(rot_data, LV_ALIGN_RIGHT_MID, -20, 14);
    lv_obj_align(rot_relogio, LV_ALIGN_RIGHT_MID, -20, -8);

    sinal_de_rede = lv_label_create(barra);
    lv_obj_set_style_text_font(sinal_de_rede, &fonte_22, 0);
    lv_obj_align(sinal_de_rede, LV_ALIGN_RIGHT_MID, -120, 0);

    rot_rede = lv_label_create(barra);
    lv_obj_set_style_text_font(rot_rede, &fonte_16, 0);
    lv_obj_align(rot_rede, LV_ALIGN_RIGHT_MID, -140, 0);
    lv_obj_set_style_text_align(rot_rede, LV_TEXT_ALIGN_RIGHT, 0);

    lv_timer_create(a_cada_segundo, 1000, NULL);
    a_cada_segundo(NULL);
}

/* ------------------------------------------------------- a troca de app */

/* Esvazia a area e solta o que o app anterior estava segurando. */
static void fechar_o_que_estiver_aberto(void)
{
    sobre_fechar();   /* os ponteiros nao podem sobreviver ao `lv_obj_clean` abaixo */
    ajuda_fechar();

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
    /* Dentro de um app importa ONDE a pessoa esta, nao de quem e o programa. */
    lv_obj_add_flag(marca_da_barra, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(nome_na_barra, LV_OBJ_FLAG_HIDDEN);
    aberto = PRODUCAO;
    app_producao_montar(area);
}

static void tocou_pontos(lv_event_t *e)
{
    (void)e;
    fechar_o_que_estiver_aberto();
    lv_label_set_text(rot_titulo, "Pontos");
    lv_obj_remove_flag(botao_voltar, LV_OBJ_FLAG_HIDDEN);
    /* Dentro de um app importa ONDE a pessoa esta, nao de quem e o programa. */
    lv_obj_add_flag(marca_da_barra, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(nome_na_barra, LV_OBJ_FLAG_HIDDEN);
    aberto = PONTOS;
    app_pontos_montar(area);
}

static void tocou_ajustes(lv_event_t *e)
{
    (void)e;
    fechar_o_que_estiver_aberto();
    lv_label_set_text(rot_titulo, "Ajustes");
    lv_obj_remove_flag(botao_voltar, LV_OBJ_FLAG_HIDDEN);
    /* Dentro de um app importa ONDE a pessoa esta, nao de quem e o programa. */
    lv_obj_add_flag(marca_da_barra, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_flag(nome_na_barra, LV_OBJ_FLAG_HIDDEN);
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
    lv_obj_set_pos(cartao, x, 98);
    lv_obj_set_style_bg_color(cartao, COR_CARTAO, 0);
    lv_obj_set_style_border_color(cartao, COR_BORDA, 0);
    lv_obj_set_style_border_width(cartao, 1, 0);
    lv_obj_set_style_radius(cartao, RAIO, 0);
    lv_obj_set_style_shadow_width(cartao, 0, 0);
    lv_obj_add_event_cb(cartao, ao_tocar, LV_EVENT_CLICKED, NULL);

    /*
     * O CARTAO REAGE AO TOQUE: fundo um degrau mais claro e a borda na cor do
     * app enquanto o dedo esta em cima. Sem isso, tocar num alvo de 300 por 296
     * nao da retorno nenhum ate a tela seguinte montar -- e quem nao ve retorno
     * toca de novo.
     */
    lv_obj_set_style_bg_color(cartao, COR_CARTAO_SUAVE, LV_STATE_PRESSED);
    lv_obj_set_style_border_color(cartao, cor, LV_STATE_PRESSED);

    /*
     * A COR DO APP ENTRA POR TRES CAMINHOS, todos discretos: uma tarja no topo
     * do cartao, o icone, e um quadrado de fundo bem apagado atras dele.
     *
     * Pintar o cartao inteiro da cor -- como se ve em muita tela de aparelho --
     * faria tres retangulos gritando ao mesmo tempo, e nenhum deles e mais
     * importante que os outros dois. A tarja identifica sem competir.
     */
    lv_obj_t *tarja = lv_obj_create(cartao);
    lv_obj_set_size(tarja, 300 - 24, 3);
    lv_obj_align(tarja, LV_ALIGN_TOP_MID, 0, 0);
    lv_obj_set_style_bg_color(tarja, cor, 0);
    lv_obj_set_style_border_width(tarja, 0, 0);
    lv_obj_set_style_radius(tarja, 2, 0);
    lv_obj_remove_flag(tarja, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(tarja, LV_OBJ_FLAG_CLICKABLE);

    /*
     * QUADRADO ARREDONDADO, e nao circulo: e a forma da propria marca do
     * Optmize, que e feita de dois colchetes de canto reto. Circulo seria
     * emprestado de outro sistema.
     */
    lv_obj_t *caixa_do_icone = lv_obj_create(cartao);
    lv_obj_set_size(caixa_do_icone, 76, 76);
    lv_obj_align(caixa_do_icone, LV_ALIGN_TOP_MID, 0, 40);
    lv_obj_set_style_radius(caixa_do_icone, 18, 0);
    lv_obj_set_style_bg_color(caixa_do_icone, cor, 0);
    lv_obj_set_style_bg_opa(caixa_do_icone, LV_OPA_20, 0);
    lv_obj_set_style_border_color(caixa_do_icone, cor, 0);
    lv_obj_set_style_border_width(caixa_do_icone, 1, 0);
    lv_obj_set_style_border_opa(caixa_do_icone, LV_OPA_40, 0);
    lv_obj_set_style_pad_all(caixa_do_icone, 0, 0);
    lv_obj_remove_flag(caixa_do_icone, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(caixa_do_icone, LV_OBJ_FLAG_CLICKABLE);   /* o alvo e o cartao */

    lv_obj_t *simbolo = lv_label_create(caixa_do_icone);
    lv_label_set_text(simbolo, icone);
    lv_obj_set_style_text_color(simbolo, cor, 0);
    lv_obj_set_style_text_font(simbolo, &fonte_28, 0);
    lv_obj_center(simbolo);

    lv_obj_t *rot = lv_label_create(cartao);
    lv_label_set_text(rot, nome);
    lv_obj_set_style_text_color(rot, COR_TEXTO, 0);
    lv_obj_set_style_text_font(rot, &fonte_28, 0);
    lv_obj_align(rot, LV_ALIGN_CENTER, 0, 34);

    lv_obj_t *sub = lv_label_create(cartao);
    lv_label_set_text(sub, apoio);
    lv_obj_set_style_text_color(sub, COR_FRACA, 0);
    lv_obj_set_style_text_font(sub, &fonte_16, 0);
    lv_label_set_long_mode(sub, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(sub, 240);
    lv_obj_set_style_text_align(sub, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_align(sub, LV_ALIGN_CENTER, 0, 76);
}

static void tocou_sobre(lv_event_t *e)
{
    (void)e;
    /*
     * A cortina nasce na area, e nao na tela: assim ela sai junto quando
     * alguem abre um app, sem que ninguem precise se lembrar de fecha-la.
     */
    sobre_mostrar(area);
}

static void abrir_inicio(void)
{
    fechar_o_que_estiver_aberto();
    lv_label_set_text(rot_titulo, "");
    lv_obj_add_flag(botao_voltar, LV_OBJ_FLAG_HIDDEN);
    lv_obj_remove_flag(marca_da_barra, LV_OBJ_FLAG_HIDDEN);
    lv_obj_remove_flag(nome_na_barra, LV_OBJ_FLAG_HIDDEN);

    lv_obj_t *marca = lv_image_create(area);
    lv_image_set_src(marca, &logo_64);
    lv_obj_set_style_image_recolor(marca, COR_DESTAQUE, 0);
    lv_obj_set_style_image_recolor_opa(marca, LV_OPA_COVER, 0);
    lv_obj_set_pos(marca, 26, 14);

    lv_obj_t *titulo = lv_label_create(area);
    lv_label_set_text(titulo, "Optmize");
    lv_obj_set_style_text_color(titulo, COR_TEXTO, 0);
    lv_obj_set_style_text_font(titulo, &fonte_28, 0);
    lv_obj_set_style_text_letter_space(titulo, 1, 0);
    lv_obj_set_pos(titulo, 94, 26);

    lv_obj_t *apoio_do_titulo = lv_label_create(area);
    lv_label_set_text(apoio_do_titulo, "CHAO DE FABRICA");
    lv_obj_set_style_text_color(apoio_do_titulo, COR_FRACA, 0);
    lv_obj_set_style_text_font(apoio_do_titulo, &fonte_16, 0);
    /*
     * Maiuscula com folga entre letras, embaixo do nome. E o mesmo par que a
     * marca do painel usa, e o que faz duas palavras soltas lerem como
     * assinatura em vez de frase.
     */
    lv_obj_set_style_text_letter_space(apoio_do_titulo, 3, 0);
    lv_obj_set_pos(apoio_do_titulo, 96, 60);

    /* Tres cartoes de 300, com 32 de vao, centrados em 1024. */
    cartao_de_app(area, LV_SYMBOL_VIDEO, "Producao",
                  "camera e leitura de QR", COR_DESTAQUE, tocou_producao, 32);
    cartao_de_app(area, LV_SYMBOL_LIST, "Pontos",
                  "bater ponto e cadastrar rosto", COR_CERTO, tocou_pontos, 362);
    cartao_de_app(area, LV_SYMBOL_SETTINGS, "Ajustes",
                  "rede, brilho e voz", COR_TEXTO, tocou_ajustes, 692);

    /*
     * O CIRCULO DO "SOBRE", pequeno, no canto de baixo a direita.
     *
     * Pequeno de proposito: os tres cartoes sao o trabalho, e isto e
     * manutencao -- abre-se uma vez por mes, quando alguem precisa dizer por
     * telefone o que este aparelho e. Um quarto cartao do mesmo tamanho diria
     * que as quatro coisas pesam igual, e faria a fila da manha parar para ler
     * um botao que ninguem vai apertar.
     *
     * 44 de diametro ainda e alvo de dedo. Menor que isso viraria enfeite que
     * so quem sabe onde fica consegue acertar.
     */
    lv_obj_t *info = lv_button_create(area);
    lv_obj_set_size(info, 44, 44);
    lv_obj_align(info, LV_ALIGN_BOTTOM_RIGHT, -26, -14);
    lv_obj_set_style_radius(info, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(info, COR_CARTAO, 0);
    lv_obj_set_style_bg_color(info, COR_CARTAO_SUAVE, LV_STATE_PRESSED);
    lv_obj_set_style_border_color(info, COR_BORDA, 0);
    lv_obj_set_style_border_width(info, 1, 0);
    lv_obj_set_style_shadow_width(info, 0, 0);
    lv_obj_add_event_cb(info, tocou_sobre, LV_EVENT_CLICKED, NULL);

    lv_obj_t *i = lv_label_create(info);
    lv_label_set_text(i, "i");
    lv_obj_set_style_text_color(i, COR_APOIO, 0);
    lv_obj_set_style_text_font(i, &fonte_22, 0);
    lv_obj_center(i);

    /*
     * A AJUDA AO LADO DO SOBRE, e nao dentro dele.
     *
     * Sao duas perguntas diferentes de duas pessoas diferentes: "que aparelho e
     * este" e quem liga do escritorio; "o que esta acontecendo" e quem esta com
     * o problema na frente. Por uma dentro da outra faria a segunda passar pela
     * primeira, e ela e a urgente das duas.
     */
    lv_obj_t *ajuda = lv_button_create(area);
    lv_obj_set_size(ajuda, 44, 44);
    lv_obj_align(ajuda, LV_ALIGN_BOTTOM_RIGHT, -78, -14);
    lv_obj_set_style_radius(ajuda, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(ajuda, COR_CARTAO, 0);
    lv_obj_set_style_bg_color(ajuda, COR_CARTAO_SUAVE, LV_STATE_PRESSED);
    lv_obj_set_style_border_color(ajuda, COR_BORDA, 0);
    lv_obj_set_style_border_width(ajuda, 1, 0);
    lv_obj_set_style_shadow_width(ajuda, 0, 0);
    lv_obj_add_event_cb(ajuda, tocou_ajuda, LV_EVENT_CLICKED, NULL);

    lv_obj_t *interrogacao = lv_label_create(ajuda);
    lv_label_set_text(interrogacao, "?");
    lv_obj_set_style_text_color(interrogacao, COR_APOIO, 0);
    lv_obj_set_style_text_font(interrogacao, &fonte_22, 0);
    lv_obj_center(interrogacao);

    /*
     * O RODAPE DE ESTADO: rede, e a versao gravada.
     *
     * Repete o que a barra ja diz, e de proposito. A barra e lida por quem esta
     * usando; este rodape e lido por quem ACABOU DE CHEGAR na frente do
     * aparelho e ainda nao tocou nele -- e a primeira pergunta de quem chega
     * num terminal estranho e "ele esta funcionando?".
     *
     * A versao aparece aqui porque e o que alguem pergunta por telefone antes
     * de qualquer outra coisa, e obrigar a abrir o Sobre para isso e um toque a
     * mais no meio de uma conversa.
     */
    lv_obj_t *rodape = lv_obj_create(area);
    lv_obj_set_size(rodape, LV_HOR_RES - 52, 1);
    lv_obj_set_pos(rodape, 26, 412);
    lv_obj_set_style_bg_color(rodape, COR_BORDA_SUAVE, 0);
    lv_obj_set_style_border_width(rodape, 0, 0);
    lv_obj_set_style_radius(rodape, 0, 0);
    lv_obj_remove_flag(rodape, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_remove_flag(rodape, LV_OBJ_FLAG_CLICKABLE);

    lv_obj_t *estado = lv_label_create(area);
    if (rede_conectada()) {
        lv_label_set_text_fmt(estado, LV_SYMBOL_WIFI "  Conectado  ·  %s", rede_endereco());
        lv_obj_set_style_text_color(estado, COR_CERTO, 0);
    } else {
        const char *porque = rede_por_que_nao();
        lv_label_set_text_fmt(estado, LV_SYMBOL_CLOSE "  %s", porque ? porque : "sem rede");
        lv_obj_set_style_text_color(estado, COR_ATENCAO, 0);
    }
    lv_obj_set_style_text_font(estado, &fonte_16, 0);
    lv_obj_set_pos(estado, 28, 428);

    lv_obj_t *versao = lv_label_create(area);
    lv_label_set_text(versao, "Terminal Optmize  ·  v1.0");
    lv_obj_set_style_text_color(versao, COR_FRACA, 0);
    lv_obj_set_style_text_font(versao, &fonte_16, 0);
    lv_obj_align(versao, LV_ALIGN_TOP_RIGHT, -86, 428);
}

void interface_voltar_ao_inicio(void)
{
    abrir_inicio();
}

/*
 * O TEMA DO LVGL, com as cores do Optmize.
 *
 * Nem tudo nesta tela e desenhado por nos. Deslizantes, teclado e barras de
 * rolagem vem do tema padrao do LVGL, e ele nasce azul -- a mesma cor que a
 * paleta antiga tinha e que o Optmize nao tem. Sem isto, o controle de brilho
 * em Ajustes ficaria azul no meio de uma tela laranja.
 *
 * Tambem e aqui que a SOMBRA dos botoes some. O tema padrao poe uma sombra
 * larga embaixo de cada um, e ela e o que mais data uma interface: telas de
 * hoje separam por cor e borda, nao por sombra projetada.
 */
static void por_o_tema_da_casa(void)
{
    lv_display_t *tela = lv_display_get_default();
    lv_theme_t *tema = lv_theme_default_init(tela, COR_DESTAQUE, COR_CERTO,
                                             true, &fonte_16);
    lv_display_set_theme(tela, tema);

    static lv_style_t sem_sombra;
    lv_style_init(&sem_sombra);
    lv_style_set_shadow_width(&sem_sombra, 0);
    lv_obj_add_style(lv_screen_active(), &sem_sombra, LV_PART_MAIN);
}

void interface_iniciar(void)
{
    bsp_display_lock(0);
    por_o_tema_da_casa();

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
