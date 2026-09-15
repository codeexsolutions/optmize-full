/*
 * ===========================================================================
 * O PROGRAMA — Waveshare ESP32-P4-WIFI6-Touch-LCD-7B
 * ===========================================================================
 *
 * Sobe o hardware na ordem certa e entrega a tela a casca. Nada mais: quem
 * desenha e `interface.c`, e cada app cuida do seu.
 *
 * ---------------------------------------------------------------------------
 * A PLACA NAO E A DA ESPRESSIF, e isso custou um dia inteiro
 * ---------------------------------------------------------------------------
 *
 * O firmware de fabrica se chama `phone_p4_function_ev_board` e leva a crer que
 * o hardware e a ESP32-P4-Function-EV-Board. Nao e: e uma adaptacao daquele
 * projeto para esta placa Waveshare -- por isso a versao dele termina em
 * `-dirty`. Os pinos da tela sao outros.
 *
 * O BSP em `components/` e o da placa da Espressif, COPIADO PARA DENTRO DO
 * PROJETO e corrigido a mao: reset no GPIO 33 (nao 27), luz de fundo no 32 e
 * acesa em nivel BAIXO (nao 26 em nivel alto), lanes a 900 Mbps (nao 1000).
 *
 * Esta em `components/` e nao em `managed_components/` de proposito: a segunda
 * e pasta gerada, e o gerenciador restaura o original nela ao primeiro
 * `reconfigure` -- levando as correcoes junto e deixando a tela preta sem
 * explicacao.
 *
 * ---------------------------------------------------------------------------
 * A ORDEM DA PARTIDA
 * ---------------------------------------------------------------------------
 *
 *   1. a tela, porque tudo depois dela tem onde aparecer
 *   2. o giro de 180 graus, porque a placa esta montada de ponta-cabeca
 *   3. a rede, que demora e roda sozinha -- a casca mostra "sem rede" enquanto
 *      ela nao conecta, e a hora chega quando chegar
 *   4. a pilha USB, uma vez so (a transmissao de video abre e fecha com o app)
 *   5. a casca
 */

#include <stdio.h>

#include "esp_lcd_panel_ops.h"
#include "esp_log.h"

#include "bsp/esp-bsp.h"
#include "bsp/touch.h"
#include "interface.h"
#include "optmize.h"

static const char *TAG = "tela";

/* As provas, ao lado. Diagnostico, nao produto -- ver os arquivos. */
void prova_de_painel(void);
void prova_de_camera(void);
void prova_de_audio(void);   /* ver o `#if 0` la embaixo */

/*
 * A prova de painel pinta cor solida sem LVGL e responde "o painel recebe
 * pixel?" sem nada no meio. Fica desligada; vale 1 no dia em que a tela parar.
 */
#define DESVIAR_PARA_A_PROVA 0

/* ------------------------------------------------------ a orientacao */

/*
 * A PLACA ESTA MONTADA DE PONTA-CABECA, entao a tela toda gira 180 graus.
 *
 * O giro acontece NO PAINEL, e nao no LVGL. A diferenca nao e de estilo:
 *
 *   pelo LVGL   `lv_display_set_rotation` gira em software, e o
 *               `esp_lvgl_port` reserva um TERCEIRO buffer de desenho inteiro
 *               -- 1,2 MB nesta tela. Foi o que faltou quando o leitor de QR
 *               entrou, e a placa passou a reiniciar em laco.
 *
 *   pelo painel o EK79007 espelha por comando proprio. Zero memoria, zero
 *               processador -- ele passa a ler a memoria ao contrario.
 *
 * Espelhar nos dois eixos e, para uma imagem retangular, girar meia volta.
 *
 * E O TOQUE NAO ACOMPANHA, justamente porque o giro e no painel: o GT911 mede o
 * vidro fisico, que nao girou. Sem espelhar o toque tambem, tocar em cima
 * responde embaixo.
 */
static void girar_de_cabeca_para_baixo(void)
{
    esp_lcd_panel_handle_t painel = bsp_display_get_panel_handle();
    if (painel == NULL) {
        ESP_LOGW(TAG, "sem painel: a tela nao girou");
        return;
    }
    esp_err_t e = esp_lcd_panel_mirror(painel, true, true);
    if (e != ESP_OK) {
        ESP_LOGW(TAG, "o painel recusou espelhar: %s", esp_err_to_name(e));
        return;
    }

    esp_lcd_touch_handle_t toque = bsp_touch_get_handle();
    if (toque == NULL) {
        ESP_LOGW(TAG, "sem controlador de toque: a tela girou, o toque nao");
        return;
    }
    esp_lcd_touch_set_mirror_x(toque, true);
    esp_lcd_touch_set_mirror_y(toque, true);
    ESP_LOGI(TAG, "tela e toque girados 180 graus (no painel, sem custo)");
}

/* ------------------------------------------------------------ partida */

void app_main(void)
{
    ESP_LOGI(TAG, "subindo");

#if DESVIAR_PARA_A_PROVA
    prova_de_painel();
    return;
#endif

    bsp_display_start();
    girar_de_cabeca_para_baixo();

    /*
     * A luz de fundo depois da tela montada. Ligada antes, o primeiro quadro
     * que aparece e o lixo que estava na PSRAM: um flash de ruido a cada boot.
     */
    bsp_display_backlight_on();

    /* Demora e roda sozinha. A casca mostra o estado enquanto isso. */
    rede_iniciar();

    /* So le o endereco guardado; nao fala com ninguem ainda. */
    optmize_iniciar();

    /*
     * A pilha USB sobe UMA VEZ. Quem abre e fecha com o app de Producao e a
     * transmissao de video, nao o driver -- instalar e desinstalar driver de
     * USB a cada entrada no app seria pedir problema, e a enumeracao demora.
     */
    prova_de_camera();

    /*
     * A PROVA DE AUDIO ja respondeu, e por isso nao roda mais.
     *
     * Ela custava dez segundos em cada boot, e as duas perguntas dela tem
     * resposta guardada no LEIA-ME:
     *
     *   A SAIDA e do ES8311 em 0x18, e o BSP a monta certo -- as quatro notas
     *   sairam na caixa ligada no SPK.
     *
     *   A ENTRADA NAO E do ES8311. Com ele chegavam zeros exatos; o microfone
     *   desta placa e de um ES7210 em 0x40, que o BSP nem tenta montar. Com o
     *   chip certo o nivel passou a oscilar entre 82 e 359 em sala silenciosa,
     *   que e o piso de ruido de um microfone vivo.
     *
     * O arquivo fica: vale 1 no dia em que o som parar.
     */
#if 0
    prova_de_audio();
#endif

    /*
     * A VOZ sobe junto e fica. Abrir o codec custa milissegundos, mas o
     * primeiro `bsp_audio_init` levanta o I2S inteiro -- e faze-lo na hora da
     * primeira fala poria esse custo bem no instante em que alguem espera ouvir
     * o nome de um item.
     */
    voz_iniciar();

    interface_iniciar();
    ESP_LOGI(TAG, "no ar");
}
