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
