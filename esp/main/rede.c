/*
 * ===========================================================================
 * A REDE — Wi-Fi pelo ESP32-C6, e a hora certa
 * ===========================================================================
 *
 * O P4 NAO TEM RADIO. Quem tem e o ESP32-C6 que fica ao lado dele na placa, e
 * os dois conversam por SDIO. Duas camadas cuidam disso:
 *
 *   esp_hosted        o transporte -- SDIO, reset do C6, os pinos
 *   esp_wifi_remote   por cima, a API de sempre (`esp_wifi_init`, `connect`)
 *
 * Nada neste arquivo sabe que o radio esta noutro chip, e e de proposito: a
 * diferenca fica toda na configuracao (ver `sdkconfig.defaults`).
 *
 * ---------------------------------------------------------------------------
 * A REDE FICA NA NVS, E NAO NO CODIGO
 * ---------------------------------------------------------------------------
 *
 * Nome e senha sao digitados na tela de Configuracoes e guardados na NVS, que
 * sobrevive a desligar e a regravar o programa.
 *
 * Nao e so conveniencia. Senha em codigo significa recompilar para trocar de
 * rede -- inviavel para um aparelho que vai para a parede de uma grafica, onde
 * quem troca o roteador nao tem compilador. E significa senha no repositorio,
 * que e senha vazada.
 *
 * ---------------------------------------------------------------------------
 * RECONECTAR E OBRIGACAO, NAO GENTILEZA
 * ---------------------------------------------------------------------------
 *
 * O roteador vai reiniciar, o sinal vai cair, alguem vai desligar a tomada
 * errada. Uma placa que conecta uma vez e desiste vira uma tela morta que so um
 * tecnico resolve.
 *
 * Entao a queda e estado normal: tenta de novo, e continua tentando. O
 * intervalo cresce ate um teto, para nao martelar um roteador fora do ar --
 * mas nunca para.
 *
 * ---------------------------------------------------------------------------
 * A HORA
 * ---------------------------------------------------------------------------
 *
 * A placa nao tem relogio proprio em uso: ligada do zero, ela acha que e 1970.
 * A hora vem da rede, por SNTP, e so existe depois que o Wi-Fi conectar -- por
 * isso o relogio da barra mostra tracos ate la, em vez de uma hora inventada.
 */

#include <stdio.h>
#include <string.h>
#include <time.h>
#include <inttypes.h>

#include "esp_check.h"
#include "esp_err.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_netif_sntp.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs.h"
#include "nvs_flash.h"

static const char *TAG = "rede";

/* Comeca em meio segundo e dobra ate trinta. Ver o cabecalho. */
#define ESPERA_INICIAL_MS 500
#define ESPERA_MAXIMA_MS  30000

#define GAVETA "rede"   /* o espaco na NVS onde nome e senha ficam */

static char endereco[16];
static char rede_nome[33];
static bool conectado;
static bool ligada;             /* `esp_wifi_start` ja foi chamado */
static bool hora_certa;
static uint32_t espera_ms = ESPERA_INICIAL_MS;
static uint32_t quedas;
static uint8_t  ultimo_motivo;   /* por que caiu da ultima vez */
static esp_timer_handle_t religar;   /* a proxima tentativa, marcada na queda */

bool rede_conectada(void)   { return conectado; }
bool rede_tem_hora(void)    { return hora_certa; }
const char *rede_endereco(void) { return endereco; }
const char *rede_nome_da_rede(void) { return rede_nome; }

/*
 * POR QUE NAO CONECTOU, em palavras de quem esta olhando a tela.
 *
 * O Wi-Fi tenta de novo para sempre, e sem isto a tela so pode dizer
 * "conectando..." -- para sempre tambem. A pessoa fica diante de uma tela que
 * parece estar trabalhando quando na verdade a senha esta errada.
 *
 * Os tres motivos abaixo cobrem quase tudo que acontece de verdade. O resto vai
 * numerado: e raro, e o numero ao menos da o que procurar.
 */
const char *rede_por_que_nao(void)
{
    static char outro[40];

    switch (ultimo_motivo) {
    case 0:
        return NULL;                       /* nunca caiu */
    case WIFI_REASON_NO_AP_FOUND:
    /* O C6 manda estes tres quando a rede nao aparece na varredura -- e o que
     * chega com o roteador desligado (rssi -128), nao o 201. */
    case WIFI_REASON_NO_AP_FOUND_W_COMPATIBLE_SECURITY:
    case WIFI_REASON_NO_AP_FOUND_IN_AUTHMODE_THRESHOLD:
    case WIFI_REASON_NO_AP_FOUND_IN_RSSI_THRESHOLD:
        return "rede nao encontrada";
    case WIFI_REASON_AUTH_FAIL:
    case WIFI_REASON_HANDSHAKE_TIMEOUT:
    case WIFI_REASON_4WAY_HANDSHAKE_TIMEOUT:
        return "senha errada";
    case WIFI_REASON_AUTH_EXPIRE:
        return "o roteador encerrou a sessao";
    default:
        snprintf(outro, sizeof(outro), "falhou (motivo %u)", ultimo_motivo);
        return outro;
    }
}

/* --------------------------------------------------------- a gaveta */

esp_err_t rede_guardar(const char *nome, const char *senha)
{
    nvs_handle_t g;
    ESP_RETURN_ON_ERROR(nvs_open(GAVETA, NVS_READWRITE, &g), TAG, "a gaveta nao abriu");
    esp_err_t e = nvs_set_str(g, "nome", nome);
    if (e == ESP_OK) {
        e = nvs_set_str(g, "senha", senha);
    }
    if (e == ESP_OK) {
        e = nvs_commit(g);
    }
    nvs_close(g);
    return e;
}

static esp_err_t ler_da_gaveta(char *nome, size_t nome_max, char *senha, size_t senha_max)
{
    nvs_handle_t g;
    ESP_RETURN_ON_ERROR(nvs_open(GAVETA, NVS_READONLY, &g), TAG, "nada guardado ainda");
    esp_err_t e = nvs_get_str(g, "nome", nome, &nome_max);
    if (e == ESP_OK) {
        e = nvs_get_str(g, "senha", senha, &senha_max);
    }
    nvs_close(g);
    return e;
}

/* ------------------------------------------------------------- a hora */

static void a_hora_chegou(struct timeval *tv)
{
    (void)tv;
    hora_certa = true;

    time_t agora = time(NULL);
    struct tm t;
    localtime_r(&agora, &t);
    ESP_LOGI(TAG, "hora acertada: %02d/%02d %02d:%02d",
             t.tm_mday, t.tm_mon + 1, t.tm_hour, t.tm_min);
}

static void acertar_a_hora(void)
{
    /*
     * Horario de Brasilia. O `3` com sinal trocado nao e engano: na notacao do
     * POSIX o numero e quanto se SOMA a hora local para chegar ao UTC, entao
     * UTC-3 se escreve `BRT3`. E onde mais gente erra nesta configuracao.
     */
    setenv("TZ", "BRT3", 1);
    tzset();

    esp_sntp_config_t conf = ESP_NETIF_SNTP_DEFAULT_CONFIG("pool.ntp.org");
    conf.sync_cb = a_hora_chegou;
    conf.start = true;
    conf.server_from_dhcp = true;   /* o roteador costuma saber de um mais perto */

    esp_err_t e = esp_netif_sntp_init(&conf);
    if (e != ESP_OK && e != ESP_ERR_INVALID_STATE) {
        ESP_LOGW(TAG, "o SNTP nao subiu: %s", esp_err_to_name(e));
    }
}

/* ------------------------------------------------------------- eventos */

static void aconteceu(void *ctx, esp_event_base_t base, int32_t id, void *dados)
{
    (void)ctx;

    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
        return;
    }

    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        conectado = false;
        endereco[0] = '\0';
        quedas++;

        /*
         * O motivo vem no evento, e e ele que a tela mostra ("senha errada",
         * "rede nao encontrada"). Ate 2026-09-25 ninguem o guardava: ficava 0,
         * `rede_por_que_nao()` devolvia NULL, e o `%s` do log abaixo lia o
         * endereco zero -- a placa travava e reiniciava a cada queda, e sem a
         * rede por perto isso virava um laco com a tela piscando.
         */
        const wifi_event_sta_disconnected_t *queda = dados;
        ultimo_motivo = queda ? queda->reason : 0;
        const char *porque = rede_por_que_nao();

        /*
         * Espera crescente. Sem ela, um roteador fora do ar recebe uma
         * tentativa a cada poucos milissegundos, e quem paga e o C6.
         */
        ESP_LOGW(TAG, "caiu (%" PRIu32 "a vez, motivo %u: %s), de novo em %" PRIu32 " ms",
                 quedas, ultimo_motivo, porque ? porque : "sem motivo", espera_ms);

        /*
         * A ESPERA E MARCADA, NAO DORMIDA. Isto ja foi um `vTaskDelay` aqui
         * dentro, e aqui dentro e a tarefa dos eventos: enquanto ela dormia (ate
         * 30 s), nenhum outro evento de rede andava, e trocar de rede na tela
         * ficava esperando a soneca acabar. Agora um temporizador de uma vez so
         * chama `esp_wifi_connect` na hora certa, e trocar de rede o cancela
         * (ver `rede_conectar`).
         */
        esp_timer_stop(religar);   /* nao marcado: devolve erro, e tudo bem */
        esp_timer_start_once(religar, (uint64_t)espera_ms * 1000);
        espera_ms = espera_ms * 2 > ESPERA_MAXIMA_MS ? ESPERA_MAXIMA_MS : espera_ms * 2;
        return;
    }

    if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        const ip_event_got_ip_t *e = (const ip_event_got_ip_t *)dados;
        snprintf(endereco, sizeof(endereco), IPSTR, IP2STR(&e->ip_info.ip));
        conectado = true;
        espera_ms = ESPERA_INICIAL_MS;   /* deu certo: recomeca a contagem */
        ultimo_motivo = 0;               /* e o motivo velho deixa de valer */
        ESP_LOGI(TAG, "conectado -- %s", endereco);

        acertar_a_hora();
        return;
    }
}

/* A tentativa marcada na queda. Roda na tarefa do `esp_timer`. */
static void tentar_de_novo(void *arg)
{
    (void)arg;
    esp_wifi_connect();
}

/* ------------------------------------------------------------- subir */

/* Aplica nome e senha e (re)conecta. Usada na partida e pela tela de config. */
esp_err_t rede_conectar(const char *nome, const char *senha)
{
    if (nome == NULL || nome[0] == '\0') {
        return ESP_ERR_INVALID_ARG;
    }

    /*
     * `snprintf` e nao `strncpy`: o segundo pode encher o destino sem deixar o
     * terminador, e o compilador recusa por isso -- com razao, porque uma cadeia
     * sem fim vira leitura fora do lugar na primeira vez que alguem a imprime.
     */
    wifi_config_t conf = {0};
    snprintf((char *)conf.sta.ssid, sizeof(conf.sta.ssid), "%s", nome);
    snprintf((char *)conf.sta.password, sizeof(conf.sta.password), "%s", senha ? senha : "");
    snprintf(rede_nome, sizeof(rede_nome), "%s", nome);

    ESP_RETURN_ON_ERROR(esp_wifi_set_config(WIFI_IF_STA, &conf), TAG, "config falhou");

    if (!ligada) {
        ESP_RETURN_ON_ERROR(esp_wifi_start(), TAG, "esp_wifi_start falhou");
        ligada = true;
    } else {
        /* Ja estava no ar: derruba para subir com a rede nova. A tentativa
         * marcada era para a rede velha. */
        esp_timer_stop(religar);
        esp_wifi_disconnect();
        espera_ms = ESPERA_INICIAL_MS;
        ultimo_motivo = 0;   /* rede nova: o motivo da anterior nao diz nada */
        esp_wifi_connect();
    }

    ESP_LOGI(TAG, "procurando a rede \"%s\"", nome);
    return ESP_OK;
}

esp_err_t rede_iniciar(void)
{
    /*
     * O Wi-Fi guarda calibracao do radio na NVS e nao sobe sem ela. Particao
     * cheia ou de versao velha: apaga e refaz -- e cache, nao dado de valor.
     * (E e a mesma NVS onde nome e senha ficam, entao isto vem primeiro.)
     */
    esp_err_t e = nvs_flash_init();
    if (e == ESP_ERR_NVS_NO_FREE_PAGES || e == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        e = nvs_flash_init();
    }
    ESP_RETURN_ON_ERROR(e, TAG, "a NVS nao subiu");

    ESP_RETURN_ON_ERROR(esp_netif_init(), TAG, "esp_netif_init falhou");
    ESP_RETURN_ON_ERROR(esp_event_loop_create_default(), TAG, "o laco de eventos falhou");
    esp_netif_create_default_wifi_sta();

    const esp_timer_create_args_t marcar = { .callback = tentar_de_novo, .name = "religar" };
    ESP_RETURN_ON_ERROR(esp_timer_create(&marcar, &religar), TAG, "o temporizador nao subiu");

    const wifi_init_config_t inicio = WIFI_INIT_CONFIG_DEFAULT();
    ESP_RETURN_ON_ERROR(esp_wifi_init(&inicio), TAG, "esp_wifi_init falhou");

    ESP_RETURN_ON_ERROR(esp_event_handler_instance_register(
        WIFI_EVENT, ESP_EVENT_ANY_ID, aconteceu, NULL, NULL), TAG, "registro falhou");
    ESP_RETURN_ON_ERROR(esp_event_handler_instance_register(
        IP_EVENT, IP_EVENT_STA_GOT_IP, aconteceu, NULL, NULL), TAG, "registro falhou");

    ESP_RETURN_ON_ERROR(esp_wifi_set_mode(WIFI_MODE_STA), TAG, "modo falhou");

    /*
     * O radio sobe SEMPRE, mesmo sem rede guardada. Nao e desperdicio: sem ele
     * ligado nao ha como VARRER o ar, e a tela de Ajustes precisa listar as
     * redes por perto -- digitar o nome a mao e convite a erro de digitacao, e
     * quem instala nem sempre sabe o nome exato.
     */
    ESP_RETURN_ON_ERROR(esp_wifi_start(), TAG, "esp_wifi_start falhou");
    ligada = true;

    char nome[33] = "", senha[65] = "";
    if (ler_da_gaveta(nome, sizeof(nome), senha, sizeof(senha)) == ESP_OK && nome[0]) {
        /*
         * Reaproveita o mesmo caminho da tela de Ajustes. Repetir a copia aqui
         * seria duas versoes da mesma coisa, e a segunda e sempre a que alguem
         * esquece de corrigir.
         */
        return rede_conectar(nome, senha);
    }

    /*
     * Sem rede guardada nao se tenta conectar: a placa sobe, mostra "sem rede"
     * na barra, e espera alguem escolher uma em Ajustes.
     */
    ESP_LOGW(TAG, "nenhuma rede guardada -- escolha uma em Ajustes");
    return ESP_OK;
}

/* ---------------------------------------------------------- varrer o ar */

/*
 * Varre e devolve os nomes encontrados, do mais forte para o mais fraco.
 *
 * BLOQUEIA por alguns segundos -- o radio precisa passar por cada canal e
 * esperar resposta. Por isso quem chama tem de estar numa tarefa propria, nunca
 * na do LVGL: a tela congelaria enquanto isso.
 *
 * Redes repetidas sao normais (um mesmo nome em dois pontos de acesso, ou em
 * 2,4 e 5 GHz) e sao filtradas aqui: na lista, dois "Grafica" iguais so
 * confundem quem escolhe.
 */
int rede_procurar(char nomes[][33], int cabem)
{
    wifi_scan_config_t conf = { .show_hidden = false };

    esp_err_t e = esp_wifi_scan_start(&conf, true);
    if (e != ESP_OK) {
        ESP_LOGW(TAG, "a varredura falhou: %s", esp_err_to_name(e));
        return 0;
    }

    uint16_t achadas = 0;
    esp_wifi_scan_get_ap_num(&achadas);
    if (achadas == 0) {
        return 0;
    }

    wifi_ap_record_t *lista = calloc(achadas, sizeof(wifi_ap_record_t));
    if (lista == NULL) {
        esp_wifi_clear_ap_list();
        return 0;
    }
    esp_wifi_scan_get_ap_records(&achadas, lista);

    int quantos = 0;
    for (int i = 0; i < achadas && quantos < cabem; i++) {
        const char *nome = (const char *)lista[i].ssid;
        if (nome[0] == 0) {
            continue;                      /* rede sem nome anunciado */
        }
        bool repetida = false;
        for (int j = 0; j < quantos; j++) {
            if (strcmp(nomes[j], nome) == 0) {
                repetida = true;
                break;
            }
        }
        if (repetida) {
            continue;
        }
        snprintf(nomes[quantos], 33, "%s", nome);
        quantos++;
    }

    free(lista);
    ESP_LOGI(TAG, "%d rede(s) por perto", quantos);
    return quantos;
}
