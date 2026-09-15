/*
 * ===========================================================================
 * LEITOR DE QR
 * ===========================================================================
 *
 * Le codigos QR do que a camera esta vendo e mostra o conteudo na tela.
 *
 * ---------------------------------------------------------------------------
 * DE ONDE VEM A IMAGEM EM CINZA
 * ---------------------------------------------------------------------------
 *
 * Do quadro que JA FOI decodificado para a tela, convertido aqui.
 *
 * A primeira versao pedia ao decodificador de JPEG uma segunda saida, em cinza.
 * Nao funciona: o decodificador do P4 so entrega cinza se a ORIGEM ja for
 * cinza, e a da camera e colorida. Ele recusa com `Detected not GRAY but want
 * to convert to GRAY, which is not supported`.
 *
 * Converter aqui saiu melhor que a ideia original: economiza a segunda
 * decodificacao inteira. O que sobra e uma passada pelos pixels, e dela se tira
 * so o VERDE -- no RGB565 ele tem 6 bits, contra 5 dos outros, e e o canal que
 * mais se aproxima do brilho que o olho percebe. Para achar um QR, que e preto
 * no branco, e de sobra.
 *
 * ---------------------------------------------------------------------------
 * METADE DA RESOLUCAO
 * ---------------------------------------------------------------------------
 *
 * A varredura usa um pixel a cada dois, em cada direcao: 800x608 viram 400x304.
 * Isso corta por QUATRO tanto a conversao quanto o trabalho da `quirc`, que e
 * quem custa caro.
 *
 * O preco e o tamanho minimo do codigo na imagem. Um QR comum, de 25 modulos,
 * ocupando um terco da largura da tela, ainda da cinco pixels por modulo em
 * 400 de largura -- confortavel. Se um dia precisar ler codigo pequeno ou de
 * longe, e so voltar `DIVISOR` para 1 e pagar o processador.
 *
 * ---------------------------------------------------------------------------
 * NAO SE LE TODO QUADRO
 * ---------------------------------------------------------------------------
 *
 * Procurar QR e caro: a `quirc` varre a imagem inteira atras de quadrados de
 * alinhamento antes de decodificar qualquer coisa. Fazer isso 30 vezes por
 * segundo consumiria o processador sem ganho nenhum -- ninguem aponta um codigo
 * para a camera e o tira em 33 milissegundos.
 *
 * Entao se le um quadro a cada `UM_A_CADA`. Com 30 quadros por segundo e o
 * valor em 6, sao cinco leituras por segundo: mais que suficiente para parecer
 * instantaneo a quem esta segurando o papel.
 *
 * ---------------------------------------------------------------------------
 * REPETICAO
 * ---------------------------------------------------------------------------
 *
 * Um codigo parado na frente da camera e lido cinco vezes por segundo, sempre
 * igual. Anunciar todas seria inundar o log e piscar a tela a toa, entao so se
 * anuncia quando o conteudo MUDA -- ou quando o mesmo volta depois de um tempo
 * fora de vista, que e o caso de quem le a mesma ordem de servico duas vezes de
 * proposito.
 */

#include <stdio.h>
#include <string.h>
#include <inttypes.h>

#include "esp_check.h"
#include "esp_err.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "quirc.h"


static const char *TAG = "qr";

/* Um quadro lido a cada seis: cinco leituras por segundo a 30 fps. */
#define UM_A_CADA 6

/* Um pixel a cada dois, em cada direcao. Ver o cabecalho. */
#define DIVISOR 2

/* O mesmo codigo so e anunciado de novo depois deste tempo sem aparecer. */
#define ESQUECER_DEPOIS_DE_MS 3000

static struct quirc *leitor;
static int largura, altura;       /* ja divididos por DIVISOR */

/*
 * O leitor NAO DESENHA. Ele avisa, e quem mostra e o app -- foi assim que a
 * tela do app de Producao pode ser reorganizada sem tocar nesta logica, e e
 * assim que amanha outro app pode ler QR com outra aparencia.
 */
static void (*avisar)(const char *conteudo);
static char ultimo[256];
static int64_t visto_em;
static uint32_t lidos;

/* Quem recebe os avisos. NULL desliga. */
void leitor_de_qr_avisar(void (*aviso)(const char *conteudo))
{
    avisar = aviso;
}

/* --------------------------------------------------------- a instalacao */

esp_err_t leitor_de_qr_iniciar(int w, int h)
{
    /* A `quirc` trabalha sobre a imagem JA REDUZIDA. */
    largura = w / DIVISOR;
    altura = h / DIVISOR;

    leitor = quirc_new();
    if (leitor == NULL) {
        ESP_LOGE(TAG, "sem memoria para o leitor");
        return ESP_ERR_NO_MEM;
    }
    if (quirc_resize(leitor, largura, altura) < 0) {
        ESP_LOGE(TAG, "sem memoria para uma imagem de %dx%d", largura, altura);
        quirc_destroy(leitor);
        leitor = NULL;
        return ESP_ERR_NO_MEM;
    }

    ESP_LOGI(TAG, "leitor pronto: varre %dx%d (do quadro %dx%d), um a cada %d",
             largura, altura, w, h, UM_A_CADA);
    return ESP_OK;
}

/* ---------------------------------------------------------- a leitura */

/*
 * Chamado pela tarefa do video a cada quadro, com a imagem QUE JA FOI
 * DECODIFICADA para a tela. Devolve cedo na maioria das vezes -- so trabalha de
 * verdade num quadro a cada `UM_A_CADA`.
 */
void leitor_de_qr_olhar(const uint16_t *rgb565, int w)
{
    static uint32_t contador;
    if (leitor == NULL || (++contador % UM_A_CADA) != 0) {
        return;
    }

    /*
     * A `quirc` escreve no buffer DELA: `quirc_begin` diz onde. Converte-se
     * direto para la, sem passo intermediario.
     */
    int qw = 0, qh = 0;
    uint8_t *destino = quirc_begin(leitor, &qw, &qh);
    if (destino == NULL || qw != largura || qh != altura) {
        quirc_end(leitor);
        return;
    }

    for (int y = 0; y < altura; y++) {
        const uint16_t *linha = rgb565 + (size_t)(y * DIVISOR) * w;
        uint8_t *saida = destino + (size_t)y * largura;
        for (int x = 0; x < largura; x++) {
            /* O verde do RGB565: bits 5 a 10, seis bits, esticados para oito. */
            const uint16_t p = linha[x * DIVISOR];
            saida[x] = (uint8_t)(((p >> 5) & 0x3F) << 2);
        }
    }
    quirc_end(leitor);

    const int quantos = quirc_count(leitor);
    if (quantos <= 0) {
        return;
    }

    /*
     * ESTAS DUAS NAO PODEM FICAR NA PILHA.
     *
     * `quirc_data` carrega o conteudo lido -- 8896 bytes -- e `quirc_code` o
     * mapa de celulas do codigo, quase 4 KB. Juntas passam de 13 KB, e a tarefa
     * que chama esta funcao tem 8. Declaradas como variaveis locais elas
     * estouraram a pilha na primeira leitura: `Stack protection fault`, com a
     * placa reiniciando em laco.
     *
     * `static` resolve porque UMA tarefa so chama esta funcao -- a do video. Se
     * um dia outra passar a chamar, isto vira corrupcao silenciosa, e ai o
     * certo e alocar na pilha do monte, nao duplicar o static.
     */
    static struct quirc_code codigo;
    static struct quirc_data dados;

    for (int i = 0; i < quantos; i++) {
        quirc_extract(leitor, i, &codigo);
        if (quirc_decode(&codigo, &dados) != QUIRC_SUCCESS) {
            /*
             * Codigo visto mas ilegivel: borrado, cortado na borda, ou o papel
             * inclinado demais. Nao e erro -- e o caso normal de quem esta
             * aproximando o codigo da camera.
             */
            continue;
        }

        char texto[256];
        const size_t n = dados.payload_len < sizeof(texto) - 1
                         ? (size_t)dados.payload_len : sizeof(texto) - 1;
        memcpy(texto, dados.payload, n);
        texto[n] = '\0';

        const int64_t agora = esp_timer_get_time() / 1000;
        const bool mudou = strcmp(texto, ultimo) != 0;
        const bool sumiu_e_voltou = (agora - visto_em) > ESQUECER_DEPOIS_DE_MS;

        visto_em = agora;
        if (!mudou && !sumiu_e_voltou) {
            continue;   /* o mesmo codigo ainda parado na frente da camera */
        }

        strncpy(ultimo, texto, sizeof(ultimo) - 1);
        ultimo[sizeof(ultimo) - 1] = '\0';
        lidos++;

        ESP_LOGI(TAG, "QR #%" PRIu32 ": %s", lidos, texto);
        if (avisar != NULL) {
            avisar(texto);
        }
    }
}

/* Solta a `quirc` -- ela segura mais de um megabyte para a imagem dela. */
void leitor_de_qr_parar(void)
{
    if (leitor != NULL) {
        quirc_destroy(leitor);
        leitor = NULL;
    }
    avisar = NULL;
    ultimo[0] = '\0';
    visto_em = 0;
}
