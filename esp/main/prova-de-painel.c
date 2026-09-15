/*
 * ===========================================================================
 * PROVA DE PAINEL — o teste que separa as duas metades
 * ===========================================================================
 *
 * ISTO E DIAGNOSTICO, NAO PRODUTO. Sai do projeto assim que a tela funcionar.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ELE EXISTE
 * ---------------------------------------------------------------------------
 *
 * Escrita quando a placa subia inteira e a tela ficava preta: o log dizia
 * `Display initialized`, `1024x600`, o toque respondia -- e nada aparecia.
 *
 * A causa acabou sendo outra, e fora do alcance desta prova: a placa e uma
 * Waveshare ESP32-P4-WIFI6-Touch-LCD-7B, nao a ESP32-P4-Function-EV-Board do
 * BSP, e os pinos da tela sao outros (ver o cabecalho do BSP corrigido).
 *
 * O problema de continuar trocando peca e que `Display initialized` nao prova
 * que PIXEL chega ao vidro: prova que a sequencia de init foi enviada. Entre a
 * nossa tela e o vidro ha duas metades que o log nao distingue:
 *
 *     LVGL desenha  ->  o painel recebe e mostra
 *
 * Tela preta pode ser qualquer uma das duas, e trocar componente as cegas
 * testa as duas de uma vez, sem dizer qual falhou.
 *
 * Esta prova corta no meio: pinta a tela de cor solida CHAMANDO O DRIVER
 * DIRETO, sem LVGL. Se a cor aparece, a metade de baixo esta boa e o defeito e
 * do LVGL. Se nao aparece, o LVGL nunca foi o problema e nao adianta mexer
 * nele.
 *
 * ---------------------------------------------------------------------------
 * A LUZ DE FUNDO
 * ---------------------------------------------------------------------------
 *
 * Um detalhe atrapalha o teste: se a luz estiver apagada, a tela fica preta
 * mesmo com o painel perfeito, e a prova nao conclui nada. Por isso aqui se
 * acendem os TRES candidatos de uma vez -- o 26 que este BSP usa, o 23 do
 * painel grande e o 32 que o firmware de fabrica usa. Um deles e o certo.
 *
 * Nao e elegante e nao vai para o produto. E que uma prova so vale se ela nao
 * puder falhar por um motivo que nao e o que ela esta medindo.
 */

#include <string.h>

#include "driver/gpio.h"
#include "esp_cache.h"
#include "esp_err.h"
#include "esp_heap_caps.h"
#include "esp_lcd_mipi_dsi.h"
#include "esp_lcd_panel_ops.h"
#include "esp_log.h"
#include "esp_private/esp_gpio_reserve.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "bsp/esp-bsp.h"

static const char *TAG = "prova";

#define LARGURA 1024
#define ALTURA  600

/* RGB565. O vermelho puro e 0xF800; escrito em bytes, depende da ordem. */
struct cor {
    const char *nome;
    uint16_t valor;
};

/*
 * RGB565: 5 bits de vermelho, 6 de verde, 5 de azul -- o verde ganha o bit a
 * mais porque o olho enxerga mais degrau nele.
 */
static const struct cor CORES[] = {
    { "AMARELO",  0xFFE0 },
    { "VERMELHO", 0xF800 },
    { "VERDE",    0x07E0 },
    { "AZUL",     0x001F },
    { "ROXO",     0x8010 },
    { "ROSA",     0xFB56 },
    { "MARROM",   0x8A22 },
    { "BRANCO",   0xFFFF },
};

#define QUANTAS_CORES (sizeof(CORES) / sizeof(CORES[0]))

/*
 * Nao ha mais pino para forcar. O BSP agora tem os pinos DESTA placa -- luz no
 * GPIO 32, acesa em nivel baixo, e reset no 33 -- e cuida dela sozinho. O que
 * havia aqui era tentativa as cegas nos pinos da placa errada.
 */

void prova_de_painel(void)
{
    ESP_LOGI(TAG, "=== PROVA DE PAINEL: cor solida sem LVGL ===");

    /*
     * A configuracao do barramento MIPI-DSI, com os mesmos valores que o BSP
     * usa no caminho normal (ver `bsp_display_start`).
     *
     * Na primeira versao isto era um NULL, e o resultado foi a placa reiniciar
     * em laco: `Load access fault`, `MTVAL 0x00000004` -- o BSP le
     * `config->dsi_bus.lane_bit_rate_mbps` sem conferir o ponteiro, e o offset
     * 4 de NULL e exatamente esse campo. Nao ha valor padrao aqui: quem chama
     * o driver direto passa a configuracao, e ponto.
     */
    const bsp_display_config_t hw = {
        .dsi_bus = {
            .phy_clk_src = MIPI_DSI_PHY_CLK_SRC_DEFAULT,
            .lane_bit_rate_mbps = BSP_LCD_MIPI_DSI_LANE_BITRATE_MBPS,
        },
    };

    bsp_lcd_handles_t telas = {0};
    esp_err_t e = bsp_display_new_with_handles(&hw, &telas);
    if (e != ESP_OK) {
        ESP_LOGE(TAG, "bsp_display_new_with_handles falhou: %s", esp_err_to_name(e));
        return;
    }
    ESP_LOGI(TAG, "painel criado (handle %p)", telas.panel);

    /*
     * LIGAR A EXIBICAO -- o que o BSP nao faz neste caminho.
     *
     * Dentro do BSP, o caminho do ILI9881C (1280x800) termina com
     * `reset` + `init` + `disp_on_off(true)`. O do EK79007, que e o desta
     * placa, para no `init`: nunca manda o comando de ligar a saida.
     *
     * Bate com o sintoma exato -- painel sincronizado (a tela pisca a cada
     * pintura), driver aceitando tudo (`ESP_OK` em toda chamada) e nada
     * aparecendo. Um painel com a exibicao desligada faz precisamente isso.
     */
    e = esp_lcd_panel_disp_on_off(telas.panel, true);
    ESP_LOGI(TAG, "ligar exibicao -> %s", esp_err_to_name(e));

    /* O BSP so instala o LEDC da luz dentro do caminho do LVGL; chamando o
     * driver direto, e aqui que ele precisa ser ligado. */
    bsp_display_brightness_init();
    bsp_display_backlight_on();

    /*
     * ESCREVER NO FRAMEBUFFER DO PAINEL, e nao mandar um buffer nosso.
     *
     * Ate agora a prova pintava um buffer proprio e chamava
     * `esp_lcd_panel_draw_bitmap`. Devolvia `ESP_OK` e nada aparecia.
     *
     * O firmware de fabrica desta placa -- que acende -- nao faz assim. Nas
     * strings do binario esta, textualmente:
     *
     *     esp_lcd_dpi_panel_get_frame_buffer(display_panel_, 3,
     *                                        &lcd_buffer_[0], ...)
     *
     * Ele PEGA os framebuffers do painel e escreve dentro. E o mesmo caminho
     * que se tenta aqui: pedir o buffer que o painel varre e pintar nele.
     */
    void *quadros[3] = {0};
    e = esp_lcd_dpi_panel_get_frame_buffer(telas.panel, 3, &quadros[0], &quadros[1], &quadros[2]);
    if (e != ESP_OK || quadros[0] == NULL) {
        ESP_LOGE(TAG, "nao consegui os framebuffers do painel: %s", esp_err_to_name(e));
        return;
    }
    ESP_LOGI(TAG, "framebuffers: %p  %p  %p", quadros[0], quadros[1], quadros[2]);

    const size_t pixels = (size_t)LARGURA * ALTURA;
    const size_t bytes = pixels * 2;

    /*
     * COM TRES BUFFERS, PINTA-SE OS TRES.
     *
     * O painel alterna entre eles. Pintar so um e apostar que justamente aquele
     * esta sendo varrido -- e com tres, a chance de errar e de duas em tres.
     * Antes so havia um buffer e a questao nem existia.
     */
    uint16_t *pix = (uint16_t *)quadros[0];

    /*
     * AS BARRAS DE HARDWARE -- o corte final.
     *
     * O controlador MIPI-DSI do P4 sabe gerar barras coloridas sozinho, dentro
     * do proprio periferico. Elas nao passam por framebuffer, nem por PSRAM,
     * nem por cache: e o silicio desenhando direto no barramento.
     *
     * Por isso este teste separa o que sobrou:
     *
     *   barras aparecem  -> DSI, temporizacao, lanes e painel estao bons, e o
     *                       defeito esta so no caminho ate o framebuffer;
     *   barras nao apare. -> o defeito e do proprio DSI, e nada que se faca com
     *                       memoria vai adiantar.
     *
     * Fica 12 segundos ligado antes de o ciclo de cores comecar, tempo de
     * sobra para olhar.
     */
    e = esp_lcd_dpi_panel_set_pattern(telas.panel, MIPI_DSI_PATTERN_BAR_VERTICAL);
    ESP_LOGI(TAG, ">>> BARRAS VERTICAIS DE HARDWARE por 12s -> %s", esp_err_to_name(e));
    vTaskDelay(pdMS_TO_TICKS(6000));

    e = esp_lcd_dpi_panel_set_pattern(telas.panel, MIPI_DSI_PATTERN_BAR_HORIZONTAL);
    ESP_LOGI(TAG, ">>> BARRAS HORIZONTAIS DE HARDWARE por 6s -> %s", esp_err_to_name(e));
    vTaskDelay(pdMS_TO_TICKS(6000));

    e = esp_lcd_dpi_panel_set_pattern(telas.panel, MIPI_DSI_PATTERN_NONE);
    ESP_LOGI(TAG, ">>> barras desligadas -> %s; voltando ao framebuffer",
             esp_err_to_name(e));

    /*
     * AS FAIXAS -- oito cores na tela ao mesmo tempo.
     *
     * Melhor que alternar cor cheia: se qualquer coisa aparecer, mesmo fraca,
     * o desenho e inconfundivel (ninguem confunde oito listras com reflexo).
     * E se alguma faixa aparecer e outra nao, isso por si so diz alguma coisa
     * sobre o formato de cor.
     */
    const size_t largura_da_faixa = LARGURA / QUANTAS_CORES;
    for (int q = 0; q < 3 && quadros[q] != NULL; q++) {
        uint16_t *destino = (uint16_t *)quadros[q];
        for (size_t y = 0; y < ALTURA; y++) {
            for (size_t x = 0; x < LARGURA; x++) {
                size_t faixa = x / largura_da_faixa;
                if (faixa >= QUANTAS_CORES) {
                    faixa = QUANTAS_CORES - 1;
                }
                destino[y * LARGURA + x] = CORES[faixa].valor;
            }
        }
        esp_cache_msync(destino, bytes, ESP_CACHE_MSYNC_FLAG_DIR_C2M);
    }
    ESP_LOGI(TAG, ">>> OITO FAIXAS nos tres buffers, por 15s (amarelo, vermelho,"
                  " verde, azul, roxo, rosa, marrom, branco)");
    vTaskDelay(pdMS_TO_TICKS(15000));

    for (int volta = 0;; volta++) {
        const struct cor *c = &CORES[volta % QUANTAS_CORES];

        for (int q = 0; q < 3 && quadros[q] != NULL; q++) {
            uint16_t *destino = (uint16_t *)quadros[q];
            for (size_t i = 0; i < pixels; i++) {
                destino[i] = c->valor;
            }
            esp_cache_msync(destino, bytes, ESP_CACHE_MSYNC_FLAG_DIR_C2M);
        }

        /*
         * O `esp_cache_msync` de cada buffer ja foi feito no laco acima, e e
         * obrigatorio: o framebuffer mora na PSRAM e o controlador o le por
         * fora do cache. Sem devolver o cache a memoria, o que se escreveu
         * fica na cache do processador e o painel varre o conteudo velho --
         * tela parada, sem um unico erro.
         */
        ESP_LOGI(TAG, "pintei %s (0x%04X) nos tres buffers", c->nome, c->valor);

        vTaskDelay(pdMS_TO_TICKS(2500));
    }
}
