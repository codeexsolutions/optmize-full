/*
 * ===========================================================================
 * O OPTMIZE — a conversa da placa com o servidor
 * ===========================================================================
 *
 * A placa le um QR e precisa saber o que ele significa. Quem sabe e o servidor:
 * o codigo impresso e opaco de proposito.
 *
 *     "P" + os 10 primeiros hex do SHA-1 do id do pedido   ->  Pdb655d4db3
 *
 * Opaco porque assim o QR cabe na versao 1 -- a menor, a de modulos maiores, a
 * mais facil de uma camera ler de longe. O preco e que o codigo nao diz nada
 * sozinho, e alguem tem de traduzi-lo.
 *
 * Tres prefixos, e so um interessa aqui:
 *
 *     O   a ordem de servico -- dados do cliente, sem lista para marcar
 *     R   um trabalho so
 *     P   O PEDIDO INTEIRO, com todos os itens na ordem
 *
 * ---------------------------------------------------------------------------
 * ISTO NAO E CODIGO NOVO DO OUTRO LADO
 * ---------------------------------------------------------------------------
 *
 * As duas rotas ja existiam no Optmize, escritas para um Raspberry Pi que
 * ficaria na calandra com uma camera. Esta placa e esse aparelho -- so que com
 * tela, toque e som. Nada precisou ser inventado no servidor.
 *
 * ---------------------------------------------------------------------------
 * ONDE ISTO RODA
 * ---------------------------------------------------------------------------
 *
 * Numa tarefa propria, sempre. Uma chamada HTTP espera a rede, e esperar a rede
 * na tarefa do LVGL congela a tela; na tarefa do video, trava o quadro. As duas
 * coisas parecem defeito para quem esta olhando.
 */

#include <stdio.h>
#include <string.h>

#include "cJSON.h"
#include "esp_err.h"
#include "esp_heap_caps.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs.h"

#include "optmize.h"

static const char *TAG = "optmize";

#define GAVETA "optmize"
#define RESPOSTA_MAXIMA 8192

/*
 * O endereco do servidor. Fica na NVS porque muda de gráfica para gráfica, e
 * quem instala o aparelho na parede nao tem compilador.
 */
static char servidor[64];

/* O que a tarefa de fundo tem para fazer, e para quem responder. */
static char codigo_pedido[24];
static char marcar_pedido[48];
static char marcar_item[48];
static char marcar_status[8];
static char marcar_motivo[64];
static void (*aviso_do_pedido)(const Pedido *p, const char *erro);
static void (*aviso_da_marca)(const char *item_id, const char *erro);

static Pedido lido;

/* ------------------------------------------------------------ o endereco */

const char *optmize_servidor(void) { return servidor; }

esp_err_t optmize_guardar_servidor(const char *endereco)
{
    nvs_handle_t g;
    esp_err_t e = nvs_open(GAVETA, NVS_READWRITE, &g);
    if (e != ESP_OK) {
        return e;
    }
    e = nvs_set_str(g, "servidor", endereco);
    if (e == ESP_OK) {
        e = nvs_commit(g);
    }
    nvs_close(g);

    if (e == ESP_OK) {
        snprintf(servidor, sizeof(servidor), "%s", endereco);
        ESP_LOGI(TAG, "servidor: %s", servidor);
    }
    return e;
}

void optmize_iniciar(void)
{
    nvs_handle_t g;
    if (nvs_open(GAVETA, NVS_READONLY, &g) == ESP_OK) {
        size_t n = sizeof(servidor);
        if (nvs_get_str(g, "servidor", servidor, &n) != ESP_OK) {
            servidor[0] = 0;
        }
        nvs_close(g);
    }
    if (servidor[0] == 0) {
        ESP_LOGW(TAG, "sem servidor configurado -- ponha o endereco em Ajustes");
    } else {
        ESP_LOGI(TAG, "servidor: %s", servidor);
    }
}

/* --------------------------------------------------------------- HTTP */

/*
 * Uma chamada, e o corpo inteiro na memoria.
 *
 * Nao e streaming porque nao precisa: a maior resposta daqui e um pedido com
 * algumas dezenas de itens, uns poucos quilobytes. Ler em pedacos custaria
 * complexidade para economizar memoria que sobra.
 */
static char *pedir(const char *caminho, const char *metodo, const char *corpo, int *status)
{
    if (servidor[0] == 0) {
        return NULL;
    }

    char url[160];
    snprintf(url, sizeof(url), "http://%s%s", servidor, caminho);

    /*
     * Tres verbos, e cada um por um motivo do outro lado: GET para ler, POST
     * para registrar a marca de um item, PATCH para mudar o estado do pedido.
     * Nao e capricho -- sao as rotas que o Optmize ja expunha, e mandar o verbo
     * errado nelas da 404 sem dizer por que.
     */
    esp_http_client_method_t verbo = HTTP_METHOD_GET;
    if (strcmp(metodo, "POST") == 0) {
        verbo = HTTP_METHOD_POST;
    } else if (strcmp(metodo, "PATCH") == 0) {
        verbo = HTTP_METHOD_PATCH;
    }

    esp_http_client_config_t conf = {
        .url = url,
        .method = verbo,
        .timeout_ms = 8000,
        .disable_auto_redirect = true,
    };

    esp_http_client_handle_t c = esp_http_client_init(&conf);
    if (c == NULL) {
        return NULL;
    }

    if (corpo != NULL) {
        esp_http_client_set_header(c, "Content-Type", "application/json");
        esp_http_client_set_post_field(c, corpo, strlen(corpo));
    }

    char *resposta = NULL;
    esp_err_t e = esp_http_client_open(c, corpo ? strlen(corpo) : 0);
    if (e != ESP_OK) {
        ESP_LOGW(TAG, "nao consegui falar com %s: %s", url, esp_err_to_name(e));
        goto fim;
    }
    if (corpo != NULL && esp_http_client_write(c, corpo, strlen(corpo)) < 0) {
        goto fim;
    }

    esp_http_client_fetch_headers(c);
    *status = esp_http_client_get_status_code(c);

    resposta = malloc(RESPOSTA_MAXIMA);
    if (resposta == NULL) {
        goto fim;
    }
    const int lidos = esp_http_client_read_response(c, resposta, RESPOSTA_MAXIMA - 1);
    resposta[lidos > 0 ? lidos : 0] = '\0';

fim:
    esp_http_client_close(c);
    esp_http_client_cleanup(c);
    return resposta;
}

/* ------------------------------------------------------- ler um codigo */

static void tarefa_de_ler(void *arg)
{
    (void)arg;

    char caminho[64];
    snprintf(caminho, sizeof(caminho), "/api/impressoras/scan/%s", codigo_pedido);

    int status = 0;
    char *corpo = pedir(caminho, "GET", NULL, &status);
    const char *erro = NULL;

    memset(&lido, 0, sizeof(lido));

    if (corpo == NULL) {
        erro = servidor[0] ? "servidor nao respondeu" : "sem servidor configurado";
    } else if (status == 404) {
        erro = "codigo desconhecido";
    } else if (status != 200) {
        erro = "o servidor recusou";
    } else {
        cJSON *j = cJSON_Parse(corpo);
        if (j == NULL) {
            erro = "resposta ilegivel";
        } else {
            const cJSON *tipo = cJSON_GetObjectItem(j, "type");

            /*
             * So o pedido tem lista para marcar. Os outros dois codigos sao
             * validos e nao servem AQUI -- dizer isso e melhor que um "codigo
             * invalido" que faria a pessoa procurar defeito no papel.
             */
            if (!cJSON_IsString(tipo) || strcmp(tipo->valuestring, "pedido") != 0) {
                erro = "este QR nao e de uma lista de producao";
            } else {
                const cJSON *id = cJSON_GetObjectItem(j, "id");
                if (cJSON_IsString(id)) {
                    snprintf(lido.id, sizeof(lido.id), "%s", id->valuestring);
                }

                /*
                 * O estado do PEDIDO, que nao e a soma dos estados dos itens:
                 * um pedido com tudo marcado continua aberto ate alguem
                 * fecha-lo. A tela do fim precisa saber disso para nao
                 * oferecer fechar o que ja esta fechado.
                 */
                const cJSON *estado = cJSON_GetObjectItem(j, "status");
                if (cJSON_IsString(estado)) {
                    snprintf(lido.estado, sizeof(lido.estado), "%s", estado->valuestring);
                }

                const cJSON *itens = cJSON_GetObjectItem(j, "items");
                const int quantos = cJSON_IsArray(itens) ? cJSON_GetArraySize(itens) : 0;

                for (int i = 0; i < quantos && lido.quantos < ITENS_MAXIMOS; i++) {
                    const cJSON *it = cJSON_GetArrayItem(itens, i);
                    ItemDoPedido *d = &lido.itens[lido.quantos];

                    const cJSON *v;
                    if ((v = cJSON_GetObjectItem(it, "itemId") ) && cJSON_IsString(v))
                        snprintf(d->id, sizeof(d->id), "%s", v->valuestring);
                    if ((v = cJSON_GetObjectItem(it, "task")) && cJSON_IsString(v))
                        snprintf(d->tarefa, sizeof(d->tarefa), "%s", v->valuestring);
                    if ((v = cJSON_GetObjectItem(it, "machineName")) && cJSON_IsString(v))
                        snprintf(d->maquina, sizeof(d->maquina), "%s", v->valuestring);
                    if ((v = cJSON_GetObjectItem(it, "calandraStatus")) && cJSON_IsString(v))
                        snprintf(d->status, sizeof(d->status), "%s", v->valuestring);
                    if ((v = cJSON_GetObjectItem(it, "printLength")) && cJSON_IsNumber(v))
                        d->metros = (float)v->valuedouble;

                    lido.quantos++;
                }

                if (quantos > ITENS_MAXIMOS) {
                    ESP_LOGW(TAG, "o pedido tem %d itens; mostrando %d",
                             quantos, ITENS_MAXIMOS);
                }
                ESP_LOGI(TAG, "pedido %s -- %d item(ns)", lido.id, lido.quantos);
            }
            cJSON_Delete(j);
        }
    }

    free(corpo);
    if (aviso_do_pedido != NULL) {
        aviso_do_pedido(erro ? NULL : &lido, erro);
    }
    vTaskDelete(NULL);
}

void optmize_ler_codigo(const char *codigo, void (*aviso)(const Pedido *, const char *))
{
    snprintf(codigo_pedido, sizeof(codigo_pedido), "%s", codigo);
    aviso_do_pedido = aviso;
    xTaskCreate(tarefa_de_ler, "optmize-ler", 8192, NULL, 4, NULL);
}

/* --------------------------------------------------------- marcar item */

static void tarefa_de_marcar(void *arg)
{
    (void)arg;

    char caminho[160];
    snprintf(caminho, sizeof(caminho), "/api/impressoras/pedidos/%s/items/%s/result",
             marcar_pedido, marcar_item);

    /*
     * O motivo só vai quando há um. Mandar `"reason":null` seria o mesmo que
     * não mandar, e mandar `""` gravaria vazio no lugar de nada -- a tela de
     * Pedidos mostraria "erro: " com dois pontos e silêncio depois.
     */
    char corpo[160];
    if (marcar_motivo[0] != 0) {
        snprintf(corpo, sizeof(corpo), "{\"status\":\"%s\",\"reason\":\"%s\"}",
                 marcar_status, marcar_motivo);
    } else {
        snprintf(corpo, sizeof(corpo), "{\"status\":\"%s\"}", marcar_status);
    }

    int status = 0;
    char *resposta = pedir(caminho, "POST", corpo, &status);
    const char *erro = NULL;

    if (resposta == NULL) {
        erro = "servidor nao respondeu";
    } else if (status != 200) {
        erro = "o servidor recusou a marca";
    }

    ESP_LOGI(TAG, "item %s -> %s (%s)", marcar_item, marcar_status, erro ? erro : "ok");

    free(resposta);
    if (aviso_da_marca != NULL) {
        aviso_da_marca(marcar_item, erro);
    }
    vTaskDelete(NULL);
}

void optmize_marcar(const char *pedido_id, const char *item_id, bool passou,
                    const char *motivo, void (*aviso)(const char *, const char *))
{
    snprintf(marcar_pedido, sizeof(marcar_pedido), "%s", pedido_id);
    snprintf(marcar_item, sizeof(marcar_item), "%s", item_id);
    snprintf(marcar_status, sizeof(marcar_status), "%s", passou ? "ok" : "erro");
    snprintf(marcar_motivo, sizeof(marcar_motivo), "%s", motivo ? motivo : "");
    aviso_da_marca = aviso;
    xTaskCreate(tarefa_de_marcar, "optmize-marcar", 8192, NULL, 4, NULL);
}

/* ------------------------------------------------------- concluir */

static char concluir_pedido[48];
static void (*aviso_do_fim)(const char *erro);

static void tarefa_de_concluir(void *arg)
{
    (void)arg;

    char caminho[96];
    snprintf(caminho, sizeof(caminho), "/api/impressoras/pedidos/%s/status", concluir_pedido);

    int status = 0;
    char *resposta = pedir(caminho, "PATCH", "{\"status\":\"concluido\"}", &status);
    const char *erro = NULL;

    if (resposta == NULL) {
        erro = "servidor nao respondeu";
    } else if (status != 200) {
        erro = "o servidor recusou fechar o pedido";
    }

    ESP_LOGI(TAG, "pedido %s concluido (%s)", concluir_pedido, erro ? erro : "ok");

    free(resposta);
    if (aviso_do_fim != NULL) {
        aviso_do_fim(erro);
    }
    vTaskDelete(NULL);
}

void optmize_concluir(const char *pedido_id, void (*aviso)(const char *))
{
    snprintf(concluir_pedido, sizeof(concluir_pedido), "%s", pedido_id);
    aviso_do_fim = aviso;
    xTaskCreate(tarefa_de_concluir, "optmize-fim", 8192, NULL, 4, NULL);
}

/* ------------------------------------------------------ baixar a imagem */

/*
 * UM PEDIDO DE IMAGEM DE CADA VEZ, e por isso um bloco proprio na memoria.
 *
 * As outras duas conversas guardam os argumentos em variaveis fixas la em cima.
 * Funciona porque quem toca um item espera a resposta antes de tocar outro.
 * Aqui nao vale o mesmo: a imagem demora, e quem esta esperando pode fechar a
 * tela e abrir a de outro item. Com variaveis fixas, a segunda chamada trocaria
 * o alvo da primeira debaixo dela.
 */
typedef struct {
    char pedido[48];
    char item[48];
    int  largura;
    void (*aviso)(uint8_t *jpeg, size_t bytes, const char *erro);
} PedidoDeImagem;

/*
 * Teto de 3 MB. A rota do servidor limita a largura a 1024, e uma arte de
 * calandra e comprida: a que usamos para testar tem 800 por 1292. Tres
 * megabytes cobrem folgado o pior caso realista, e existem para que uma
 * resposta errada -- um HTML de erro gigante, um proxy no meio -- nao vire um
 * malloc que come a PSRAM inteira.
 */
#define IMAGEM_MAXIMA (3 * 1024 * 1024)

static void tarefa_da_imagem(void *arg)
{
    PedidoDeImagem *p = arg;
    uint8_t *dados = NULL;
    const char *erro = NULL;
    size_t bytes = 0;

    char url[224];
    snprintf(url, sizeof(url), "http://%s/api/impressoras/pedidos/%s/items/%s/imagem?w=%d",
             servidor, p->pedido, p->item, p->largura);

    esp_http_client_config_t conf = {
        .url = url,
        .method = HTTP_METHOD_GET,
        .timeout_ms = 15000,   /* mais que as outras: sao centenas de KB */
        .disable_auto_redirect = true,
    };

    esp_http_client_handle_t c = servidor[0] ? esp_http_client_init(&conf) : NULL;
    if (c == NULL) {
        erro = servidor[0] ? "nao consegui abrir a conexao" : "sem servidor configurado";
        goto fim;
    }

    if (esp_http_client_open(c, 0) != ESP_OK) {
        erro = "servidor nao respondeu";
        goto fecha;
    }

    /*
     * O tamanho vem do cabecalho, e nao de ler ate acabar. Sem ele seria
     * preciso crescer o buffer no meio do caminho -- realocar meio megabyte de
     * PSRAM varias vezes, com a memoria ja fragmentada pelo resto do programa.
     */
    const int total = esp_http_client_fetch_headers(c);
    const int status = esp_http_client_get_status_code(c);

    if (status == 404) {
        erro = "sem imagem para este item";
        goto fecha;
    }
    if (status != 200) {
        erro = "o servidor recusou";
        goto fecha;
    }
    if (total <= 0) {
        erro = "o servidor nao disse o tamanho";
        goto fecha;
    }
    if (total > IMAGEM_MAXIMA) {
        erro = "imagem grande demais";
        goto fecha;
    }

    dados = heap_caps_malloc((size_t)total, MALLOC_CAP_SPIRAM);
    if (dados == NULL) {
        erro = "sem memoria para a imagem";
        goto fecha;
    }

    while (bytes < (size_t)total) {
        const int lidos = esp_http_client_read(c, (char *)dados + bytes, total - (int)bytes);
        if (lidos <= 0) {
            break;   /* conexao caiu no meio */
        }
        bytes += (size_t)lidos;
    }

    if (bytes < (size_t)total) {
        free(dados);
        dados = NULL;
        bytes = 0;
        erro = "a imagem veio pela metade";
    } else {
        ESP_LOGI(TAG, "imagem do item %s: %u bytes", p->item, (unsigned)bytes);
    }

fecha:
    esp_http_client_close(c);
    esp_http_client_cleanup(c);
fim:
    if (erro != NULL) {
        ESP_LOGW(TAG, "imagem do item %s: %s", p->item, erro);
    }
    if (p->aviso != NULL) {
        p->aviso(dados, bytes, erro);
    } else {
        free(dados);
    }
    free(p);
    vTaskDelete(NULL);
}

void optmize_baixar_imagem(const char *pedido_id, const char *item_id, int largura,
                           void (*aviso)(uint8_t *, size_t, const char *))
{
    PedidoDeImagem *p = calloc(1, sizeof(*p));
    if (p == NULL) {
        if (aviso != NULL) {
            aviso(NULL, 0, "sem memoria");
        }
        return;
    }
    snprintf(p->pedido, sizeof(p->pedido), "%s", pedido_id);
    snprintf(p->item, sizeof(p->item), "%s", item_id);
    p->largura = largura;
    p->aviso = aviso;

    if (xTaskCreate(tarefa_da_imagem, "optmize-img", 8192, p, 4, NULL) != pdPASS) {
        free(p);
        if (aviso != NULL) {
            aviso(NULL, 0, "sem memoria");
        }
    }
}
