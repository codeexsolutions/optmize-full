/*
 * ===========================================================================
 * A INTERFACE — o que cada parte precisa saber das outras
 * ===========================================================================
 *
 * O programa e uma casca com tres apps. A casca cuida da barra de cima, do
 * relogio e do voltar; cada app cuida so do seu conteudo.
 *
 * Um app aqui e simples de proposito: uma funcao que MONTA seu conteudo dentro
 * de um objeto que a casca entrega, e outra que DESMONTA quando alguem sai.
 * Montar e desmontar em vez de esconder porque o app de Producao segura a
 * camera -- e camera ligada atras de uma tela que ninguem esta vendo e gasto de
 * memoria e de barramento por nada.
 */
#pragma once

#include "esp_err.h"
#include "lvgl.h"

/* ------------------------------------------------------------ a casca */

/* Sobe a casca: barra de cima, relogio e a tela inicial. */
void interface_iniciar(void);

/* Volta para a tela inicial, desmontando o app aberto. */
void interface_voltar_ao_inicio(void);

/* ------------------------------------------------------------- a voz */

/*
 * A placa fala pelo alto-falante da saida SPK. Quem transforma texto em som e
 * o SERVIDOR (ver `servidor/voz.js`); aqui so chegam amostras prontas.
 *
 * Uma fala nova CORTA a anterior -- quem passa rapido por tres itens nao quer
 * ouvir os tres em fila, muito depois de ja estar olhando o quarto.
 */
esp_err_t voz_iniciar(void);
void voz_falar(const char *texto);
void voz_falar_o_item(const char *item_id);
void voz_calar(void);

/* O volume da voz, de 0 a 100. Guardado na NVS; ajustavel em Ajustes. */
int  voz_volume(void);
void voz_guardar_volume(int novo);
bool voz_esta_falando(void);

/* ---------------------------------------------------- o descanso */

/*
 * A tela de hora que entra sozinha depois de tres minutos parados, e sai ao
 * primeiro toque (ver `descanso.c`).
 *
 * `descanso_conferir` e chamado a cada segundo pela casca e cuida de tudo:
 * decide quando entrar, e mantem a hora andando enquanto estiver de pe.
 */
void descanso_conferir(void);
void descanso_acordar(void);
bool descanso_esta_na_frente(void);

/* ------------------------------------------------------------- os apps */

/*
 * Cada app implementa estas duas. `montar` recebe a area util -- ja abaixo da
 * barra -- e desenha dentro dela; `desmontar` solta o que tiver segurado.
 *
 * A casca apaga os objetos sozinha ao trocar de app, entao `desmontar` cuida
 * so do que NAO e objeto de tela: a camera, uma tarefa, um buffer.
 */
void app_producao_montar(lv_obj_t *area);
void app_producao_desmontar(void);

void app_pontos_montar(lv_obj_t *area);
void app_pontos_desmontar(void);

void app_ajustes_montar(lv_obj_t *area);
void app_ajustes_desmontar(void);

/* ------------------------------------------------------------- a rede */

esp_err_t rede_iniciar(void);
esp_err_t rede_conectar(const char *nome, const char *senha);
esp_err_t rede_guardar(const char *nome, const char *senha);
bool rede_conectada(void);
bool rede_tem_hora(void);
const char *rede_endereco(void);
const char *rede_nome_da_rede(void);

/*
 * Varre o ar e devolve quantos nomes coube em `nomes`. BLOQUEIA por alguns
 * segundos -- chame de uma tarefa propria, nunca da do LVGL.
 */
int rede_procurar(char nomes[][33], int cabem);

/*
 * Por que a ultima tentativa nao deu, em palavras. NULL quando nunca falhou.
 *
 * Sem isto a tela so pode dizer "conectando..." para sempre, e a pessoa fica
 * diante de algo que parece estar trabalhando quando a senha esta errada.
 */
const char *rede_por_que_nao(void);

/* ---------------------------------------------------------- as cores */

/* Um lugar so para elas, porque tres apps as repetiriam. */
#define COR_FUNDO     lv_color_hex(0x11131a)
#define COR_CARTAO    lv_color_hex(0x1b1e29)
#define COR_BORDA     lv_color_hex(0x2b3040)
#define COR_TEXTO     lv_color_hex(0xe6e8ef)
#define COR_APOIO     lv_color_hex(0x7c839a)
#define COR_DESTAQUE  lv_color_hex(0xff6b3d)
#define COR_CERTO     lv_color_hex(0x3ddc84)
