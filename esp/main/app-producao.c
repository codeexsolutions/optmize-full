/*
 * ===========================================================================
 * APP DE PRODUCAO — a camera, o QR e a conferencia item a item
 * ===========================================================================
 *
 * Le o QR da lista de producao e conduz a conferencia: um item por vez, a arte
 * na tela, passou ou nao passou. No fim, fecha o pedido.
 *
 * O fluxo inteiro ja existia no Optmize, escrito para um Raspberry Pi que
 * ficaria na calandra com uma camera. Esta placa e esse aparelho -- nada
 * precisou ser inventado do outro lado.
 *
 * ---------------------------------------------------------------------------
 * UM ITEM POR VEZ, E NAO UMA LISTA
 * ---------------------------------------------------------------------------
 *
 * A primeira versao mostrava os itens todos numa lista, com sim e nao em cada
 * linha e a arte atras de um botao. Estava errado, e o motivo e o lugar:
 *
 *   A ARTE E A DECISAO. Se ela precisa de um toque para aparecer, ninguem
 *   toca -- e a conferencia vira marcar linha por nome de arquivo, que e
 *   exatamente o que a tela existe para nao ser.
 *
 *   NA LISTA NAO HA ORDEM. As pecas saem da calandra em fila, uma atras da
 *   outra. Uma tela que mostra doze linhas convida a procurar a linha certa;
 *   e procurar linha com o rolo andando e onde se marca o item errado.
 *
 * Entao a tela mostra UM item, grande, com a arte ja carregada, e dois alvos.
 * Passou: vai para o proximo. Nao passou: pergunta o motivo, e depois se a
 * conferencia segue ou para ali.
 *
 * ---------------------------------------------------------------------------
 * AS TELAS
 * ---------------------------------------------------------------------------
 *
 * A PROCURA     a camera ocupa a area, esperando um codigo
 * A CONFERENCIA um item: arte, dados, passou / nao passou
 * O MOTIVO      por cima, quando nao passou
 * SEGUE OU PARA por cima, logo depois do motivo
 * O FIM         o resumo, e o pedido fechado
 *
 * A camera NAO fica num cantinho durante a conferencia. Quem esta conferindo
 * nao precisa dela, e um video ao vivo ao lado da arte rouba o olho para onde
 * nao ha decisao nenhuma a tomar. Ela volta quando se pede o proximo codigo.
 *
 * ---------------------------------------------------------------------------
 * ALVOS GRANDES
 * ---------------------------------------------------------------------------
 *
 * Os botoes de passou e nao passou tem quase meia tela cada. E muito para uma
 * tela de computador e e o certo aqui: isto fica em pe na calandra, e quem
 * confere pode estar de luva, com a mao suja, com pressa. Alvo pequeno nessas
 * condicoes e toque errado -- e toque errado aqui marca como boa uma peca que
 * nao passou.
 */

#include <stdio.h>
#include <string.h>

#include "esp_log.h"

#include "bsp/esp-bsp.h"
#include "interface.h"
#include "optmize.h"

static const char *TAG = "producao";

/* O video, ao lado (ver `video-da-camera.c`). */
esp_err_t video_da_camera_abrir(lv_obj_t *pai);
void video_da_camera_fechar(void);

/* O leitor de QR avisa aqui quando le alguma coisa (ver `leitor-de-qr.c`). */
void leitor_de_qr_avisar(void (*aviso)(const char *conteudo));

/* A arte do item, no painel e em tela cheia (ver `imagem-da-producao.c`). */
void imagem_da_producao_montar(lv_obj_t *pai, int x, int y, int w, int h,
                               const char *pedido_id, const char *item_id,
                               const char *titulo);
void imagem_da_producao_fechar(void);

static lv_obj_t *area_do_app;      /* a area que a casca entregou */
static lv_obj_t *moldura;          /* onde o video mora */
static lv_obj_t *rot_aviso;        /* o que o servidor respondeu, quando reclama */
static lv_obj_t *sobreposto;       /* o motivo, ou a pergunta de seguir */

static Pedido pedido;
static int  atual = -1;            /* qual item esta na frente; -1 = nenhum */
static bool conferindo;

/*
 * OS MOTIVOS DE NAO TER PASSADO.
 *
 * Lista curta e fechada, de proposito. Teclado na calandra e o caminho certo
 * para ninguem escrever nada: quem esta de luva, com pressa e com a fila
 * andando, digita "erro" e segue -- e "erro" nao ajuda ninguem a entender o que
 * aconteceu depois.
 *
 * Seis cabem numa tela em botoes grandes. Se faltar algum que acontece toda
 * semana, ele entra aqui; se sobrar um que nunca e tocado, sai. A lista tem de
 * ser da fabrica, nao minha -- estes sao um chute informado para comecar.
 */
static const char *MOTIVOS[] = {
    "Mancha ou sujeira",
    "Cor fora do padrao",
    "Desalinhado",
    "Falha na impressao",
    "Tecido com defeito",
    "Outro",
};
#define QUANTOS_MOTIVOS (sizeof(MOTIVOS) / sizeof(MOTIVOS[0]))

/* A area util, ja descontada a barra da casca. */
#define ALTURA_UTIL (LV_VER_RES - 56)

static void montar_a_procura(void);
static void montar_a_conferencia(void);
static void fechar_o_sobreposto(void);
static void montar_o_fim(bool ate_o_fim);

/*
 * ===========================================================================
 * TROCAR DE TELA NUNCA ACONTECE DENTRO DO TOQUE
 * ===========================================================================
 *
 * Todo botao daqui vive DENTRO da area que a proxima tela vai limpar. Se o
 * `lv_obj_clean` rodasse no meio do evento, o LVGL continuaria despachando por
 * uma arvore de objetos ja liberados.
 *
 * O LVGL se protege do caso simples -- ele marca quando o PROPRIO alvo do
 * evento e apagado. Nao se protege do avo: apagar a area inteira leva o botao
 * junto por tabela, e a protecao nao chega la.
 *
 * O preco disso apareceu no app de Pontos, batendo varias vezes seguidas: a
 * placa parava com o cao de guarda reclamando da tarefa do LVGL, e a pilha
 * mostrava `lv_tlsf_free` andando numa lista circular para sempre. Nao era
 * travamento: era a memoria do LVGL ja corrompida por objeto liberado duas
 * vezes, e o laco infinito so foi onde isso finalmente apareceu.
 *
 * Aqui o defeito ainda nao tinha mordido -- esta tela troca menos e mais devagar
 * --, mas e o mesmo defeito.
 */
typedef enum {
    TELA_PROCURA,
    TELA_CONFERENCIA,
    TELA_FIM,
    SO_FECHAR_A_PERGUNTA,   /* cancelar o motivo: volta ao item, sem remontar */
} TelaDaProducao;

static TelaDaProducao proxima_tela;
static bool o_fim_chegou_ao_fim;

static void trocar_de_tela(void *nada)
{
    (void)nada;
    if (area_do_app == NULL) {
        return;   /* saiu do app antes de a troca acontecer */
    }
    switch (proxima_tela) {
        case TELA_PROCURA:           montar_a_procura(); break;
        case TELA_CONFERENCIA:       montar_a_conferencia(); break;
        case TELA_FIM:               montar_o_fim(o_fim_chegou_ao_fim); break;
        case SO_FECHAR_A_PERGUNTA:   fechar_o_sobreposto(); break;
    }
}

static void ir_para(TelaDaProducao t)
{
    proxima_tela = t;
    lv_async_call(trocar_de_tela, NULL);
}

/* ------------------------------------------------------------ ajudas */

/*
 * A METRAGEM, ESCRITA SEM `%f`.
 *
 * `lv_label_set_text_fmt` nao usa o printf da biblioteca C: usa o do LVGL, e
 * esse vem compilado SEM ponto flutuante (`LV_USE_FLOAT` desligado -- liga-lo
 * puxa codigo e memoria no programa inteiro por causa de um numero so).
 *
 * O `%.1f` entao nunca funcionou. O formatador nao reconhecia o `f`, imprimia a
 * letra e seguia: na calandra aparecia "8 . f m", e a metragem -- que e
 * justamente o que diz se aquele item e o item -- sumia da tela.
 *
 * Decimos em inteiro resolvem sem depender de nada, e de quebra saem com
 * virgula, que e como se escreve metro por aqui.
 */
static void escrever_metros(char *onde, size_t quanto, float metros)
{
    const int decimos = (int)(metros * 10.0f + 0.5f);
    snprintf(onde, quanto, "%d,%d", decimos / 10, decimos % 10);
}

static bool ja_decidido(const ItemDoPedido *item)
{
    return strcmp(item->status, "ok") == 0 || strcmp(item->status, "erro") == 0;
}

/*
 * ONDE A CONFERENCIA COMECA.
 *
 * No primeiro item que ninguem decidiu ainda, e nao no item 1. Quem largou o
 * pedido no meio -- foi almocar, a maquina parou, alguem chamou -- le o mesmo
 * QR e continua de onde estava. Recomecar do inicio faria a pessoa passar de
 * novo por tudo que ja conferiu, e a segunda passagem e onde se marca no
 * automatico.
 */
static int primeiro_pendente(void)
{
    for (int i = 0; i < pedido.quantos; i++) {
        if (!ja_decidido(&pedido.itens[i])) {
            return i;
        }
    }
    return pedido.quantos;
}

static void fechar_o_sobreposto(void)
{
    if (sobreposto != NULL) {
        lv_obj_delete(sobreposto);
        sobreposto = NULL;
    }
}

/* Uma cortina do tamanho da area, para as perguntas que param tudo. */
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

/* Um botao grande com texto centrado -- o formato de quase tudo por aqui. */
static lv_obj_t *botao_grande(lv_obj_t *pai, int x, int y, int w, int h,
                              lv_color_t cor, const lv_font_t *fonte,
                              const char *texto, lv_event_cb_t quando_tocar,
                              void *carga)
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
    /*
     * Texto escuro nos botoes de cor forte, claro nos apagados. O verde e o
     * laranja daqui sao claros: letra branca em cima deles nao se le de dois
     * metros, que e a distancia de quem passa pela calandra.
     */
    const bool forte = lv_color_eq(cor, COR_CERTO) || lv_color_eq(cor, COR_DESTAQUE);
    lv_obj_set_style_text_color(r, forte ? lv_color_black() : COR_TEXTO, 0);
    lv_obj_set_style_text_align(r, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_center(r);
    return b;
}

/* --------------------------------------------------- marcar no servidor */

/* O servidor respondeu a marca. Roda na tarefa do Optmize, nao na do LVGL. */
static void marcou(const char *item_id, const char *erro)
{
    if (erro == NULL) {
        return;
    }
    if (bsp_display_lock(200)) {
        if (rot_aviso != NULL) {
            lv_label_set_text(rot_aviso, erro);
            lv_obj_set_style_text_color(rot_aviso, COR_DESTAQUE, 0);
        }
        bsp_display_unlock();
    }
    ESP_LOGW(TAG, "item %s: %s", item_id, erro);
}

/*
 * Aplica a decisao e manda ao servidor.
 *
 * A TELA ANDA NA HORA, antes de o servidor responder. Quem marcou precisa ver
 * que marcou -- esperar a rede para trocar de item deixaria o dedo no ar sem
 * saber se pegou, e a pessoa tocaria de novo, marcando o item seguinte.
 *
 * Se o servidor recusar, o aviso aparece na tela do item seguinte. Mostrar o
 * otimismo e corrigir e melhor que travar a conferencia em toda marcacao.
 */
static void decidir(int indice, bool passou, const char *motivo)
{
    if (indice < 0 || indice >= pedido.quantos) {
        return;
    }
    ItemDoPedido *item = &pedido.itens[indice];
    snprintf(item->status, sizeof(item->status), "%s", passou ? "ok" : "erro");

    optmize_marcar(pedido.id, item->id, passou, motivo, marcou);
    ESP_LOGI(TAG, "%s -> %s%s%s", item->tarefa, item->status,
             motivo ? " / " : "", motivo ? motivo : "");
}

/* ------------------------------------------------------- andar na fila */

/*
 * Anda um item.
 *
 * Nao monta nada aqui: quem chama e sempre um toque -- o "passou", o motivo
 * escolhido, o "continuar" --, e montar de dentro do toque e o defeito descrito
 * la em cima. A tela nova sobe na proxima volta do LVGL, e ela mesma fecha a
 * pergunta que estiver por cima.
 */
static void avancar(void)
{
    atual++;
    if (atual >= pedido.quantos) {
        o_fim_chegou_ao_fim = true;
        ir_para(TELA_FIM);
    } else {
        ir_para(TELA_CONFERENCIA);
    }
}

/* ------------------------------------------------- segue ou para */

static void tocou_continuar(lv_event_t *e)
{
    (void)e;
    avancar();
}

static void tocou_parar(lv_event_t *e)
{
    (void)e;
    o_fim_chegou_ao_fim = false;
    ir_para(TELA_FIM);
}

/*
 * A PERGUNTA DEPOIS DE UM "NAO PASSOU".
 *
 * Existe porque um defeito raramente vem sozinho. Cor fora do padrao ou
 * desalinhamento costumam ser da maquina, nao da peca -- e se for da maquina,
 * conferir o resto do rolo e perder tempo com pecas que vao todas dar errado.
 * Quem esta ali sabe disso na hora; a tela so precisa perguntar.
 *
 * Parar NAO fecha o pedido: os itens que sobraram continuam pendentes, e o
 * mesmo QR retoma daqui depois.
 */
static void perguntar_se_segue(const char *motivo)
{
    const int faltam = pedido.quantos - atual - 1;

    /*
     * No ultimo item nao ha o que perguntar. "Continuar" e "parar" levam ao
     * mesmo lugar, e uma pergunta sem consequencia so atrasa quem ja terminou.
     */
    if (faltam <= 0) {
        avancar();
        return;
    }

    /*
     * Esta troca de sobreposicao ACONTECE dentro do toque, e pode: ela apaga a
     * pergunta do motivo e poe outra no lugar -- mas as duas sao filhas diretas
     * da area, e o `abrir_o_sobreposto` apaga so a anterior. O botao tocado
     * morre junto, e o LVGL sabe disso: ele marca o proprio alvo do evento. O
     * que ele nao sabe cobrir e a area inteira sumindo por baixo.
     */
    lv_obj_t *c = abrir_o_sobreposto();

    lv_obj_t *titulo = lv_label_create(c);
    lv_label_set_text(titulo, "Marcado como nao passou");
    lv_obj_set_style_text_color(titulo, COR_DESTAQUE, 0);
    lv_obj_set_style_text_font(titulo, &lv_font_montserrat_28, 0);
    lv_obj_set_pos(titulo, 40, 60);

    lv_obj_t *qual = lv_label_create(c);
    lv_label_set_text_fmt(qual, "%s  .  %s", pedido.itens[atual].tarefa, motivo);
    lv_obj_set_style_text_color(qual, COR_APOIO, 0);
    lv_obj_set_style_text_font(qual, &lv_font_montserrat_16, 0);
    lv_label_set_long_mode(qual, LV_LABEL_LONG_DOT);
    lv_obj_set_width(qual, 900);
    lv_obj_set_pos(qual, 40, 102);

    lv_obj_t *pergunta = lv_label_create(c);
    lv_label_set_text_fmt(pergunta, "Continuar a conferencia?  Faltam %d item(ns).", faltam);
    lv_obj_set_style_text_color(pergunta, COR_TEXTO, 0);
    lv_obj_set_style_text_font(pergunta, &lv_font_montserrat_22, 0);
    lv_obj_set_pos(pergunta, 40, 168);

    botao_grande(c, 40, 240, 460, 120, COR_CERTO, &lv_font_montserrat_28,
                 LV_SYMBOL_OK "  Continuar", tocou_continuar, NULL);
    botao_grande(c, 524, 240, 460, 120, COR_CARTAO, &lv_font_montserrat_28,
                 LV_SYMBOL_STOP "  Parar agora", tocou_parar, NULL);

    lv_obj_t *nota = lv_label_create(c);
    lv_label_set_text(nota,
        "Parar nao fecha o pedido: o que sobrar continua pendente,\n"
        "e o mesmo QR retoma daqui.");
    lv_obj_set_style_text_color(nota, COR_APOIO, 0);
    lv_obj_set_style_text_font(nota, &lv_font_montserrat_16, 0);
    lv_obj_set_pos(nota, 40, 390);
}

/* ------------------------------------------------------- o motivo */

static void tocou_um_motivo(lv_event_t *e)
{
    const int qual = (int)(intptr_t)lv_event_get_user_data(e);
    const char *motivo = MOTIVOS[qual];

    decidir(atual, false, motivo);
    perguntar_se_segue(motivo);   /* ele mesmo troca a sobreposicao */
}

static void tocou_cancelar_motivo(lv_event_t *e)
{
    (void)e;
    /*
     * Fechar sem escolher NAO marca nada. Quem abriu por engano -- o dedo
     * escorregou para o X -- sai sem ter reprovado uma peca boa, e volta para
     * o mesmo item.
     */
    ir_para(SO_FECHAR_A_PERGUNTA);
}

/*
 * A pergunta do porque.
 *
 * Existe porque "erro" sem motivo nao ajuda ninguem depois: quem for entender o
 * que aconteceu com aquele pedido, semanas adiante, precisa saber se foi mancha
 * ou cor fora do padrao. E o momento de perguntar e este -- a peca esta na mao
 * de quem viu o defeito.
 */
static void perguntar_o_motivo(void)
{
    lv_obj_t *c = abrir_o_sobreposto();

    lv_obj_t *titulo = lv_label_create(c);
    lv_label_set_text(titulo, "Por que nao passou?");
    lv_obj_set_style_text_color(titulo, COR_TEXTO, 0);
    lv_obj_set_style_text_font(titulo, &lv_font_montserrat_28, 0);
    lv_obj_set_pos(titulo, 40, 20);

    lv_obj_t *qual = lv_label_create(c);
    lv_label_set_text(qual, pedido.itens[atual].tarefa);
    lv_obj_set_style_text_color(qual, COR_APOIO, 0);
    lv_obj_set_style_text_font(qual, &lv_font_montserrat_16, 0);
    lv_label_set_long_mode(qual, LV_LABEL_LONG_DOT);
    lv_obj_set_width(qual, 900);
    lv_obj_set_pos(qual, 40, 58);

    /* Dois por linha, grandes: mesma razao dos botoes de passou e nao passou. */
    for (int i = 0; i < (int)QUANTOS_MOTIVOS; i++) {
        botao_grande(c, 40 + (i % 2) * 484, 100 + (i / 2) * 100, 460, 84,
                     COR_CARTAO, &lv_font_montserrat_22, MOTIVOS[i],
                     tocou_um_motivo, (void *)(intptr_t)i);
    }

    botao_grande(c, 412, ALTURA_UTIL - 72, 200, 56, COR_BORDA,
                 &lv_font_montserrat_16, "Cancelar", tocou_cancelar_motivo, NULL);
}

/* --------------------------------------------------- a conferencia */

static void tocou_passou(lv_event_t *e)
{
    (void)e;
    decidir(atual, true, NULL);
    avancar();
}

static void tocou_nao_passou(lv_event_t *e)
{
    (void)e;
    perguntar_o_motivo();
}

static void linha_de_dado(lv_obj_t *pai, int y, const char *rotulo,
                          const char *valor, const lv_font_t *fonte)
{
    lv_obj_t *r = lv_label_create(pai);
    lv_label_set_text(r, rotulo);
    lv_obj_set_style_text_color(r, COR_APOIO, 0);
    lv_obj_set_style_text_font(r, &lv_font_montserrat_16, 0);
    lv_obj_set_pos(r, 0, y);

    lv_obj_t *v = lv_label_create(pai);
    lv_label_set_text(v, valor);
    lv_obj_set_style_text_color(v, COR_TEXTO, 0);
    lv_obj_set_style_text_font(v, fonte, 0);
    lv_label_set_long_mode(v, LV_LABEL_LONG_DOT);
    lv_obj_set_width(v, 420);
    lv_obj_set_pos(v, 0, y + 22);
}

static void montar_a_conferencia(void)
{
    conferindo = true;
    fechar_o_sobreposto();
    imagem_da_producao_fechar();
    lv_obj_clean(area_do_app);
    moldura = NULL;
    rot_aviso = NULL;

    const ItemDoPedido *item = &pedido.itens[atual];

    /* --- o cabecalho: onde estou, e quanto falta --- */

    lv_obj_t *onde = lv_label_create(area_do_app);
    lv_label_set_text_fmt(onde, "Item %d de %d", atual + 1, pedido.quantos);
    lv_obj_set_style_text_color(onde, COR_TEXTO, 0);
    lv_obj_set_style_text_font(onde, &lv_font_montserrat_22, 0);
    lv_obj_set_pos(onde, 16, 6);

    float total = 0.0f;
    for (int i = 0; i < pedido.quantos; i++) {
        total += pedido.itens[i].metros;
    }
    char metros_do_total[16];
    escrever_metros(metros_do_total, sizeof(metros_do_total), total);

    lv_obj_t *soma = lv_label_create(area_do_app);
    lv_label_set_text_fmt(soma, "%s m no pedido", metros_do_total);
    lv_obj_set_style_text_color(soma, COR_APOIO, 0);
    lv_obj_set_style_text_font(soma, &lv_font_montserrat_16, 0);
    lv_obj_align(soma, LV_ALIGN_TOP_RIGHT, -16, 12);

    /*
     * A BARRA DE PROGRESSO responde "quanto falta" sem ninguem ter de fazer a
     * conta entre dois numeros. Numa fila de vinte pecas, saber que ja passou
     * da metade muda o ritmo de quem esta conferindo.
     */
    lv_obj_t *barra = lv_bar_create(area_do_app);
    lv_obj_set_size(barra, LV_HOR_RES - 32, 6);
    lv_obj_set_pos(barra, 16, 36);
    lv_obj_set_style_bg_color(barra, COR_BORDA, 0);
    lv_obj_set_style_bg_color(barra, COR_CERTO, LV_PART_INDICATOR);
    lv_obj_set_style_radius(barra, 3, 0);
    lv_bar_set_range(barra, 0, pedido.quantos);
    lv_bar_set_value(barra, atual, LV_ANIM_OFF);

    /* --- a arte, que e a decisao --- */

    imagem_da_producao_montar(area_do_app, 16, 50, 480, 382,
                              pedido.id, item->id, item->tarefa);

    /* --- os dados, ao lado --- */

    lv_obj_t *ficha = lv_obj_create(area_do_app);
    lv_obj_set_size(ficha, 492, 382);
    lv_obj_set_pos(ficha, 512, 50);
    lv_obj_set_style_bg_color(ficha, COR_CARTAO, 0);
    lv_obj_set_style_border_color(ficha, COR_BORDA, 0);
    lv_obj_set_style_border_width(ficha, 1, 0);
    lv_obj_set_style_radius(ficha, 12, 0);
    lv_obj_set_style_pad_all(ficha, 20, 0);
    lv_obj_remove_flag(ficha, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *nome = lv_label_create(ficha);
    lv_label_set_text(nome, item->tarefa);
    lv_obj_set_style_text_color(nome, COR_TEXTO, 0);
    lv_obj_set_style_text_font(nome, &lv_font_montserrat_22, 0);
    lv_label_set_long_mode(nome, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(nome, 448);
    lv_obj_set_pos(nome, 0, 0);

    char metros_do_item[16];
    escrever_metros(metros_do_item, sizeof(metros_do_item), item->metros);
    char com_unidade[24];
    snprintf(com_unidade, sizeof(com_unidade), "%s m", metros_do_item);

    linha_de_dado(ficha, 108, "Metragem", com_unidade, &lv_font_montserrat_28);
    linha_de_dado(ficha, 186, "Maquina", item->maquina, &lv_font_montserrat_22);

    /*
     * O QUE JA ESTAVA MARCADO, quando estava. So aparece em item redecidido --
     * na conferencia normal a linha nao existe, porque dizer "pendente" a cada
     * item seria ruido em todas as telas para informar o obvio.
     */
    if (ja_decidido(item)) {
        const bool passou = strcmp(item->status, "ok") == 0;
        lv_obj_t *antes = lv_label_create(ficha);
        lv_label_set_text_fmt(antes, "%s  ja marcado como %s",
                              passou ? LV_SYMBOL_OK : LV_SYMBOL_CLOSE,
                              passou ? "passou" : "nao passou");
        lv_obj_set_style_text_color(antes, passou ? COR_CERTO : COR_DESTAQUE, 0);
        lv_obj_set_style_text_font(antes, &lv_font_montserrat_16, 0);
        lv_obj_set_pos(antes, 0, 264);
    }

    lv_obj_t *dica = lv_label_create(ficha);
    lv_label_set_text(dica, "Toque na arte para ver de perto.");
    lv_obj_set_style_text_color(dica, COR_APOIO, 0);
    lv_obj_set_style_text_font(dica, &lv_font_montserrat_16, 0);
    lv_obj_set_pos(dica, 0, 300);

    rot_aviso = lv_label_create(ficha);
    lv_label_set_text(rot_aviso, "");
    lv_obj_set_style_text_font(rot_aviso, &lv_font_montserrat_16, 0);
    lv_label_set_long_mode(rot_aviso, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(rot_aviso, 448);
    lv_obj_set_pos(rot_aviso, 0, 326);

    /* --- os dois alvos --- */

    botao_grande(area_do_app, 16, 446, 486, 86, COR_DESTAQUE,
                 &lv_font_montserrat_28, LV_SYMBOL_CLOSE "  Nao passou",
                 tocou_nao_passou, NULL);
    botao_grande(area_do_app, 522, 446, 486, 86, COR_CERTO,
                 &lv_font_montserrat_28, LV_SYMBOL_OK "  Passou",
                 tocou_passou, NULL);
}

/* ------------------------------------------------------------- o fim */

static lv_obj_t *rot_do_fecho;

/* O servidor respondeu ao fechamento. Roda na tarefa do Optmize. */
static void fechou(const char *erro)
{
    if (!bsp_display_lock(300)) {
        return;
    }
    if (rot_do_fecho != NULL) {
        if (erro != NULL) {
            lv_label_set_text_fmt(rot_do_fecho, "%s -- o pedido continua aberto", erro);
            lv_obj_set_style_text_color(rot_do_fecho, COR_DESTAQUE, 0);
        } else {
            snprintf(pedido.estado, sizeof(pedido.estado), "concluido");
            lv_label_set_text(rot_do_fecho, LV_SYMBOL_OK "  pedido fechado no Optmize");
            lv_obj_set_style_text_color(rot_do_fecho, COR_CERTO, 0);
        }
    }
    bsp_display_unlock();
}

static void tocou_fechar_o_pedido(lv_event_t *e)
{
    /*
     * O botao some ao ser tocado. Nao e so estetica: sem isso, um segundo
     * toque manda um segundo PATCH enquanto o primeiro ainda esta no ar, e
     * quem esta olhando nao sabe se a primeira vez pegou.
     */
    lv_obj_add_flag(lv_event_get_target(e), LV_OBJ_FLAG_HIDDEN);

    if (rot_do_fecho != NULL) {
        lv_label_set_text(rot_do_fecho, "fechando o pedido...");
        lv_obj_set_style_text_color(rot_do_fecho, COR_APOIO, 0);
    }
    optmize_concluir(pedido.id, fechou);
}

static void tocou_conferir_de_novo(lv_event_t *e)
{
    (void)e;
    atual = 0;
    ir_para(TELA_CONFERENCIA);
}

static void tocou_outro_codigo(lv_event_t *e)
{
    (void)e;
    ir_para(TELA_PROCURA);
}

/*
 * O RESUMO, e o botao de fechar o pedido.
 *
 * ---------------------------------------------------------------------------
 * O PEDIDO NAO FECHA SOZINHO, e ja fechou
 * ---------------------------------------------------------------------------
 *
 * A primeira versao fechava o pedido no instante em que o ultimo item era
 * marcado. Funcionava -- e estava errado por um motivo simples: NAO APARECIA
 * NADA. Quem terminou a conferencia via o resumo e mais nada, sem saber se
 * aquilo tinha virado alguma coisa do outro lado. O unico jeito de ver um
 * botao de fechar era ler o QR de novo, e ai ele oferecia fechar um pedido que
 * ja estava fechado.
 *
 * Fechar um pedido e o unico ato desta tela que muda a vida de outra gente: e
 * ele que tira a producao da lista de quem esta esperando. Um ato desses se
 * aperta, nao acontece.
 *
 * `ate_o_fim` diz se a conferencia chegou ao ultimo item ou se pararam no
 * meio -- e so muda o titulo e a cor. Quem decide se o botao aparece e o
 * numero de pendentes: um pedido fechado com item pendente esconderia trabalho
 * que ninguem fez, e sumiria da tela de Pedidos como se estivesse resolvido.
 */
static void montar_o_fim(bool ate_o_fim)
{
    conferindo = false;
    fechar_o_sobreposto();
    imagem_da_producao_fechar();
    lv_obj_clean(area_do_app);
    moldura = NULL;
    rot_aviso = NULL;
    rot_do_fecho = NULL;

    int passaram = 0, falharam = 0, pendentes = 0;
    float metros_bons = 0.0f;
    for (int i = 0; i < pedido.quantos; i++) {
        const ItemDoPedido *it = &pedido.itens[i];
        if (strcmp(it->status, "ok") == 0) {
            passaram++;
            metros_bons += it->metros;
        } else if (strcmp(it->status, "erro") == 0) {
            falharam++;
        } else {
            pendentes++;
        }
    }

    lv_obj_t *titulo = lv_label_create(area_do_app);
    lv_label_set_text(titulo, ate_o_fim ? "Producao conferida" : "Conferencia interrompida");
    lv_obj_set_style_text_color(titulo, ate_o_fim ? COR_CERTO : COR_DESTAQUE, 0);
    lv_obj_set_style_text_font(titulo, &lv_font_montserrat_28, 0);
    lv_obj_set_pos(titulo, 40, 40);

    char metros_ok[16];
    escrever_metros(metros_ok, sizeof(metros_ok), metros_bons);

    lv_obj_t *conta = lv_label_create(area_do_app);
    lv_label_set_text_fmt(conta,
        LV_SYMBOL_OK "  %d passaram  (%s m)\n"
        LV_SYMBOL_CLOSE "  %d nao passaram",
        passaram, metros_ok, falharam);
    lv_obj_set_style_text_color(conta, COR_TEXTO, 0);
    lv_obj_set_style_text_font(conta, &lv_font_montserrat_22, 0);
    lv_obj_set_style_text_line_space(conta, 12, 0);
    lv_obj_set_pos(conta, 40, 104);

    if (pendentes > 0) {
        lv_obj_t *resto = lv_label_create(area_do_app);
        lv_label_set_text_fmt(resto,
            "%d item(ns) continuam pendentes. O mesmo QR retoma daqui.", pendentes);
        lv_obj_set_style_text_color(resto, COR_APOIO, 0);
        lv_obj_set_style_text_font(resto, &lv_font_montserrat_16, 0);
        lv_obj_set_pos(resto, 40, 196);
    }

    rot_do_fecho = lv_label_create(area_do_app);
    lv_label_set_text(rot_do_fecho, "");
    lv_obj_set_style_text_font(rot_do_fecho, &lv_font_montserrat_16, 0);
    lv_label_set_long_mode(rot_do_fecho, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(rot_do_fecho, 900);
    lv_obj_set_pos(rot_do_fecho, 40, 228);

    const bool ja_fechado = strcmp(pedido.estado, "concluido") == 0;

    if (ja_fechado) {
        lv_label_set_text(rot_do_fecho, LV_SYMBOL_OK "  este pedido ja esta fechado");
        lv_obj_set_style_text_color(rot_do_fecho, COR_CERTO, 0);
    } else if (pendentes == 0) {
        lv_label_set_text(rot_do_fecho, "Falta so fechar o pedido no Optmize.");
        lv_obj_set_style_text_color(rot_do_fecho, COR_APOIO, 0);
        botao_grande(area_do_app, 40, 258, 944, 80, COR_CERTO,
                     &lv_font_montserrat_28, LV_SYMBOL_OK "  Fechar o pedido",
                     tocou_fechar_o_pedido, NULL);
    }

    botao_grande(area_do_app, 40, 356, 460, 110, COR_CERTO,
                 &lv_font_montserrat_28, LV_SYMBOL_REFRESH "  Outro codigo",
                 tocou_outro_codigo, NULL);
    botao_grande(area_do_app, 524, 356, 460, 110, COR_CARTAO,
                 &lv_font_montserrat_22, "Conferir este de novo",
                 tocou_conferir_de_novo, NULL);
}

/* ------------------------------------------------------- a leitura */

/*
 * O servidor traduziu o codigo. Roda numa tarefa do Optmize, nao na do LVGL --
 * por isso a tranca em volta de tudo que toca na tela.
 */
static void chegou_o_pedido(const Pedido *p, const char *erro)
{
    if (!bsp_display_lock(500)) {
        return;
    }

    if (erro != NULL) {
        if (rot_aviso != NULL) {
            lv_label_set_text(rot_aviso, erro);
            lv_obj_set_style_text_color(rot_aviso, COR_DESTAQUE, 0);
        }
        ESP_LOGW(TAG, "%s", erro);
    } else {
        pedido = *p;
        video_da_camera_fechar();   /* a conferencia toma a tela; ver o cabecalho */

        atual = primeiro_pendente();
        if (atual >= pedido.quantos) {
            /* Nada pendente: o pedido ja tinha sido conferido antes. */
            montar_o_fim(true);
        } else {
            montar_a_conferencia();
        }
    }

    bsp_display_unlock();
}

/* O leitor achou um QR. Pergunta ao servidor o que ele significa. */
static void leu_um_codigo(const char *conteudo)
{
    if (conferindo || atual >= 0) {
        return;   /* ja ha uma conferencia na tela; o codigo novo espera */
    }
    ESP_LOGI(TAG, "QR: %s", conteudo);

    if (bsp_display_lock(50)) {
        if (rot_aviso != NULL) {
            lv_label_set_text_fmt(rot_aviso, "lendo %s...", conteudo);
            lv_obj_set_style_text_color(rot_aviso, COR_APOIO, 0);
        }
        bsp_display_unlock();
    }

    optmize_ler_codigo(conteudo, chegou_o_pedido);
}

/* ------------------------------------------------------- a procura */

static void montar_a_procura(void)
{
    conferindo = false;
    atual = -1;
    fechar_o_sobreposto();
    imagem_da_producao_fechar();
    lv_obj_clean(area_do_app);
    rot_do_fecho = NULL;

    moldura = lv_obj_create(area_do_app);
    lv_obj_set_size(moldura, 660, 500);
    lv_obj_set_pos(moldura, 20, 22);
    lv_obj_set_style_bg_color(moldura, lv_color_black(), 0);
    lv_obj_set_style_border_color(moldura, COR_BORDA, 0);
    lv_obj_set_style_border_width(moldura, 1, 0);
    lv_obj_set_style_radius(moldura, 12, 0);
    lv_obj_set_style_pad_all(moldura, 0, 0);
    lv_obj_remove_flag(moldura, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *coluna = lv_obj_create(area_do_app);
    lv_obj_set_size(coluna, 300, 500);
    lv_obj_set_pos(coluna, 700, 22);
    lv_obj_set_style_bg_color(coluna, COR_CARTAO, 0);
    lv_obj_set_style_border_color(coluna, COR_BORDA, 0);
    lv_obj_set_style_border_width(coluna, 1, 0);
    lv_obj_set_style_radius(coluna, 14, 0);
    lv_obj_set_style_pad_all(coluna, 18, 0);
    lv_obj_remove_flag(coluna, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t *titulo = lv_label_create(coluna);
    lv_label_set_text(titulo, "Aponte o QR");
    lv_obj_set_style_text_color(titulo, COR_TEXTO, 0);
    lv_obj_set_style_text_font(titulo, &lv_font_montserrat_22, 0);
    lv_obj_set_pos(titulo, 0, 0);

    lv_obj_t *ajuda = lv_label_create(coluna);
    lv_label_set_text(ajuda,
        "o codigo da lista de producao\n\n"
        "deixe ele ocupar um terco\nda imagem, sem reflexo");
    lv_obj_set_style_text_color(ajuda, COR_APOIO, 0);
    lv_obj_set_style_text_font(ajuda, &lv_font_montserrat_16, 0);
    lv_label_set_long_mode(ajuda, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(ajuda, 264);
    lv_obj_set_pos(ajuda, 0, 40);

    rot_aviso = lv_label_create(coluna);
    lv_label_set_text(rot_aviso, "");
    lv_obj_set_style_text_font(rot_aviso, &lv_font_montserrat_16, 0);
    lv_label_set_long_mode(rot_aviso, LV_LABEL_LONG_WRAP);
    lv_obj_set_width(rot_aviso, 264);
    lv_obj_set_pos(rot_aviso, 0, 160);

    const esp_err_t e = video_da_camera_abrir(moldura);
    if (e != ESP_OK) {
        /*
         * O MOTIVO NA TELA, e nao "camera nao encontrada" para tudo.
         *
         * Aquela frase era uma mentira conveniente: cobria falta de memoria,
         * decodificador ocupado e camera ausente com a mesma explicacao -- e
         * mandava quem esta na calandra conferir o cabo USB de uma camera
         * ligada e funcionando. O codigo do erro nao diz tudo, mas nao mente,
         * e da para repetir no telefone para quem for arrumar.
         */
        lv_obj_t *sem = lv_label_create(moldura);
        lv_label_set_text_fmt(sem, "a camera nao abriu\n\n%s", esp_err_to_name(e));
        lv_obj_set_style_text_color(sem, COR_APOIO, 0);
        lv_obj_set_style_text_font(sem, &lv_font_montserrat_22, 0);
        lv_obj_set_style_text_align(sem, LV_TEXT_ALIGN_CENTER, 0);
        lv_obj_center(sem);
        ESP_LOGW(TAG, "sem camera");
    }
}

/* ------------------------------------------------------------ montagem */

void app_producao_montar(lv_obj_t *area)
{
    area_do_app = area;
    leitor_de_qr_avisar(leu_um_codigo);
    montar_a_procura();
}

void app_producao_desmontar(void)
{
    leitor_de_qr_avisar(NULL);
    video_da_camera_fechar();
    imagem_da_producao_fechar();

    /* Os objetos morrem com a arvore; os ponteiros nao podem sobreviver a eles. */
    area_do_app = NULL;
    moldura = NULL;
    rot_aviso = NULL;
    sobreposto = NULL;
    rot_do_fecho = NULL;
    atual = -1;
    conferindo = false;
}
