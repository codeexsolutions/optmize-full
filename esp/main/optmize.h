/*
 * ===========================================================================
 * O OPTMIZE — o que a placa precisa saber do servidor
 * ===========================================================================
 *
 * Ver `optmize.c` para o porquê de cada coisa. Aqui só as formas.
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include "esp_err.h"

/*
 * Quantos itens de um pedido cabem na tela.
 *
 * Vinte porque é o que uma tela de 1024x600 mostra sem virar lista de rolar --
 * e porque um pedido maior que isso, marcado item a item por um dedo, é uma
 * tarefa que ninguém termina em pé na frente da calandra. Se aparecerem
 * pedidos maiores, o certo não é aumentar o número: é paginar.
 */
#define ITENS_MAXIMOS 20

typedef struct {
    char  id[48];        /* o itemId, que a rota de marcar exige */
    char  tarefa[96];    /* o nome do arquivo impresso */
    char  maquina[32];
    char  status[16];    /* pendente | ok | erro */
    float metros;
} ItemDoPedido;

typedef struct {
    char id[48];
    char estado[16];     /* aberto | pausado | concluido -- do PEDIDO, nao do item */
    int  quantos;
    ItemDoPedido itens[ITENS_MAXIMOS];
} Pedido;

/* Lê o endereço do servidor da NVS. Chamar uma vez, na partida. */
void optmize_iniciar(void);

const char *optmize_servidor(void);
esp_err_t optmize_guardar_servidor(const char *endereco);

/*
 * Traduz um código de QR em pedido. Devolve pelo `aviso`, de uma tarefa de
 * fundo -- a chamada espera a rede, e esperar a rede na tarefa do LVGL congela
 * a tela.
 *
 * No aviso, `p` é o pedido e `erro` é NULL quando deu certo; ao contrário,
 * `p` é NULL e `erro` diz o que houve, em palavras de quem está olhando.
 */
void optmize_ler_codigo(const char *codigo, void (*aviso)(const Pedido *p, const char *erro));

/*
 * Marca um item como passado (`true`) ou não (`false`).
 *
 * `motivo` só faz sentido quando não passou, e vai como está para o servidor --
 * é ele que aparece depois na tela de Pedidos, ao lado do item. Pode ser NULL.
 */
void optmize_marcar(const char *pedido_id, const char *item_id, bool passou,
                    const char *motivo,
                    void (*aviso)(const char *item_id, const char *erro));

/*
 * Fecha o pedido: a conferencia inteira terminou.
 *
 * So faz sentido depois de TODOS os itens terem sido marcados -- e por isso
 * quem chama e a tela do fim, e nao o botao do ultimo item. Um pedido fechado
 * com item pendente esconderia trabalho que ninguem fez.
 */
void optmize_concluir(const char *pedido_id, void (*aviso)(const char *erro));

/*
 * Baixa a imagem de um item -- o preview da impressora, que e a arte que saiu
 * de verdade. O servidor ja entrega redimensionada e em JPEG de linha de base,
 * porque e o unico formato que o decodificador desta placa le (ver a rota
 * `/imagem` do lado de la).
 *
 * `largura` e um pedido, nao uma garantia: imagem menor que isso vem como esta.
 *
 * O BUFFER DO AVISO E DE QUEM RECEBE. Quem trata tem de chamar `free` nele --
 * sao centenas de quilobytes de PSRAM, e esquecer isso derruba a placa depois
 * de algumas imagens, longe de onde o erro foi cometido.
 *
 * Em caso de erro, `jpeg` e NULL e `erro` diz o que houve.
 */
void optmize_baixar_imagem(const char *pedido_id, const char *item_id, int largura,
                           void (*aviso)(uint8_t *jpeg, size_t bytes, const char *erro));

/* ---------------------------------------------------------------- o ponto */

/*
 * Quantas pessoas cabem na tela de escolher o nome.
 *
 * Quarenta porque e o que uma grafica tem, e porque a tela mostra oito por vez
 * com rolagem. Se um dia passar disso, o certo nao e aumentar o numero: e
 * procurar por nome, e ai a tela e outra.
 */
#define FUNCIONARIOS_MAXIMOS 40

typedef struct {
    int  id;
    char nome[48];
} Funcionario;

typedef struct {
    char nome[48];
    char tipo[20];    /* entrada | almoco_saida | almoco_volta | saida | extra */
    char hora[6];     /* HH:MM, tirado do relogio daqui */
    float nota;       /* o quanto o rosto bateu; 0 quando foi escolhido na tela */
} Batida;

/*
 * Manda a foto e pede para bater o ponto de quem estiver nela.
 *
 * A FOTO PASSA A SER DESTA FUNCAO, que a libera quando terminar. Quem chamou
 * deve soltar o ponteiro na mesma linha: guardar uma copia dele e convidar a
 * liberar meio megabyte debaixo de quem ainda esta mandando os bytes.
 *
 * No aviso: `b` preenchido e `erro` NULL quando reconheceu e bateu; ao
 * contrario, `b` e NULL e `erro` diz o que houve em palavras de quem esta
 * olhando. "Nao te reconheci" e "o servidor nao respondeu" levam a telas
 * diferentes, e por isso `nao_reconheceu` vem separado.
 */
void optmize_bater_por_rosto(uint8_t *jpeg, size_t bytes,
                             void (*aviso)(const Batida *b, const char *erro,
                                           bool nao_reconheceu));

/*
 * Quem trabalha aqui, para a tela de escolher o nome quando o rosto falha.
 *
 * Devolve quantos couberam em `lista`, ou -1 se nao deu para perguntar.
 * BLOQUEIA: chame de uma tarefa propria, nunca da do LVGL.
 */
void optmize_listar_funcionarios(void (*aviso)(const Funcionario *lista, int quantos,
                                               const char *erro));

/* Bate o ponto de alguem que escolheu o proprio nome na tela. */
void optmize_bater_pelo_nome(int funcionario_id,
                             void (*aviso)(const Batida *b, const char *erro));

/*
 * Guarda mais um rosto de alguem que JA EXISTE no Optmize.
 *
 * O terminal nao cria pessoa: isso exige nome completo, matricula e teclado, e
 * nome de gente digitado com o dedo, de pe, vira um "Jsoe" que ninguem conserta
 * depois -- ele so reaparece como "o sistema nao me acha". Criar fica na tela de
 * Funcionarios do Optmize, onde ha teclado de verdade.
 *
 * O que so o terminal pode fazer e a FOTO, no lugar onde as pessoas estao.
 *
 * A FOTO PASSA A SER DESTA FUNCAO, como na de bater.
 *
 * `erro` e NULL quando deu certo; ao
 * contrario, traz a frase do servidor -- "nao achei nenhum rosto" e "achei 2
 * rostos" pedem coisas diferentes de quem esta na frente da camera.
 */
void optmize_cadastrar_rosto(int funcionario_id, uint8_t *jpeg, size_t bytes,
                             void (*aviso)(const char *erro));
