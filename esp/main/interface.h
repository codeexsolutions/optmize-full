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

/* ------------------------------------------------- a mira e o checklist */

/*
 * As duas telas de camera -- apontar o QR e apontar o rosto -- fazem a pessoa
 * resolver o mesmo problema: onde ponho a coisa. Ver `mira.c`.
 */
void mira_desenhar(lv_obj_t *moldura, lv_color_t cor, int32_t folga);
void checklist_linha(lv_obj_t *pai, int32_t y, lv_color_t cor, const char *texto);
void titulo_de_bloco(lv_obj_t *pai, int32_t y, const char *texto);

/*
 * O cartao dos momentos que precisam de peso: borda na cor do estado e um
 * icone grande num circulo. Devolve o cartao, para quem quiser por coisas
 * dentro dele.
 */
lv_obj_t *cartao_de_estado(lv_obj_t *pai, int32_t x, int32_t y, int32_t w, int32_t h,
                           lv_color_t cor, const char *icone);

/* Rotulo a esquerda, valor a direita, com a coluna do rotulo em largura fixa. */
void par_da_ficha(lv_obj_t *pai, int32_t y, const char *rotulo, const char *valor,
                  int32_t largura);

/* ------------------------------------------------- a mira e o checklist */

/*
 * As duas telas de camera -- apontar o QR e apontar o rosto -- fazem a pessoa
 * resolver o mesmo problema: onde ponho a coisa. Ver `mira.c`.
 */
void mira_desenhar(lv_obj_t *moldura, lv_color_t cor, int32_t folga);
void checklist_linha(lv_obj_t *pai, int32_t y, lv_color_t cor, const char *texto);

/* ------------------------------------------------------------ o sobre */

/*
 * A ficha do aparelho: versao, placa, rede, memoria (ver `sobre.c`). Abre pelo
 * circulo no canto da tela inicial.
 */
void sobre_mostrar(lv_obj_t *pai);
void sobre_fechar(void);

/* ------------------------------------------------------------- a ajuda */

/*
 * A lista de sintomas, pelo que a pessoa VE na tela (ver `ajuda.c`).
 *
 * Tudo isto tambem esta no `TELAS.md` do repositorio, e nao adianta: quem esta
 * na calandra as sete da manha nao vai abrir documento num computador de outra
 * sala. A ajuda tem de estar onde o problema esta.
 */
void ajuda_mostrar(lv_obj_t *pai);
void ajuda_fechar(void);

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
/*
 * ===========================================================================
 * AS CORES SAO AS DO OPTMIZE, copiadas dos tokens dele
 * ===========================================================================
 *
 * Nao sao parecidas de memoria: sao os mesmos valores que o painel usa no
 * navegador (`--bg`, `--card-bg`, `--accent` e companhia). Quem olha as duas
 * telas no mesmo dia tem de reconhecer o mesmo sistema.
 *
 * A paleta anterior era AZULADA -- fundo 0x11131a, cartao 0x1b1e29 -- e o
 * Optmize e neutro e quente. Era a diferenca mais visivel entre os dois, e a
 * mais barata de tirar: uma linha por cor, e todas as telas seguem, porque
 * nenhuma escreve cor crua.
 *
 * O LARANJA MUDOU DE TOM: 0xff6b3d virou 0xff531f, que e o `--accent` de
 * verdade. E veio com ele o `--accent-ink`, a cor do TEXTO POR CIMA do
 * laranja: quase preto, e nao preto puro. Texto preto sobre laranja vibra;
 * este nao.
 */

/*
 * ===========================================================================
 * A LETRA E A DO OPTMIZE: Space Grotesk
 * ===========================================================================
 *
 * O painel usa `--font-display: "Space Grotesk"`, e a placa usava Montserrat.
 * Sao duas geometricas parecidas de longe e diferentes de perto: a Space
 * Grotesk tem o "a" de um andar, terminacoes cortadas na reta e numeros mais
 * estreitos. Quem ve as duas telas no mesmo dia nota, sem saber o que notou.
 *
 * OS SIMBOLOS VEM JUNTO, E TINHAM DE VIR. As Montserrat que o LVGL traz
 * embutem os glifos do FontAwesome no mesmo arquivo -- e e de la que sai todo
 * `LV_SYMBOL_OK`, `LV_SYMBOL_WIFI`, `LV_SYMBOL_CLOSE` deste programa. Gerar so
 * a Space Grotesk apagaria todos os icones da interface de uma vez.
 *
 * Por isso cada tamanho e a MISTURA de duas fontes, pela mesma receita que o
 * LVGL usa nas dele: a Space Grotesk no latim, o FontAwesome na faixa dos
 * simbolos.
 *
 * QUATRO TAMANHOS, porque sao os quatro que as telas usam. Cada um custa flash
 * -- 48 sozinha pesa mais que as outras tres juntas --, e um quinto tamanho so
 * entra quando alguma tela precisar dele de verdade.
 */
/*
 * A MARCA DO OPTMIZE, em dois tamanhos.
 *
 * Sao mapas de alfa gerados da propria imagem do painel (ver `logo.c`), e nao
 * um desenho parecido: a forma e exatamente a que esta no navegador. Como sao
 * so alfa, a cor vem do estilo -- `lv_obj_set_style_image_recolor`.
 */
LV_IMAGE_DECLARE(logo_28);
LV_IMAGE_DECLARE(logo_64);

LV_FONT_DECLARE(fonte_16)
LV_FONT_DECLARE(fonte_22)
LV_FONT_DECLARE(fonte_28)
LV_FONT_DECLARE(fonte_48)

/* --- superficies, do fundo para a frente --- */
#define COR_FUNDO           lv_color_hex(0x0b0b0c)   /* --bg */
#define COR_BARRA           lv_color_hex(0x0e0e10)   /* --sidebar-bg */
#define COR_CARTAO          lv_color_hex(0x141416)   /* --card-bg */
#define COR_CARTAO_SUAVE    lv_color_hex(0x1a1a1d)   /* --card-bg-soft */

/* --- linhas --- */
#define COR_BORDA           lv_color_hex(0x2a2a2f)   /* --border */
#define COR_BORDA_SUAVE     lv_color_hex(0x202024)   /* --border-soft */

/* --- texto, do mais forte ao mais discreto --- */
#define COR_TEXTO           lv_color_hex(0xf4f2ef)   /* --text */
#define COR_APOIO           lv_color_hex(0xa09a93)   /* --text-dim */
#define COR_FRACA           lv_color_hex(0x857e76)   /* --text-faint */

/* --- as cores que dizem alguma coisa --- */
#define COR_DESTAQUE        lv_color_hex(0xff531f)   /* --accent */
#define COR_DESTAQUE_CLARO  lv_color_hex(0xff8556)   /* --accent-bright */
#define COR_DESTAQUE_TINTA  lv_color_hex(0x180c02)   /* --accent-ink: texto por cima */
#define COR_CERTO           lv_color_hex(0x4ed18a)   /* --success */
#define COR_ALERTA          lv_color_hex(0xff6b8a)   /* --danger */
#define COR_ATENCAO         lv_color_hex(0xf5b740)   /* --warn */

/*
 * OS DOIS RAIOS DO OPTMIZE, e nao um por tela.
 *
 * 12 para superficie -- cartao, painel, moldura --, 9 para controle -- botao,
 * campo. A diferenca e pequena e proposital: o controle parece assentado
 * DENTRO da superficie em vez de flutuar sobre ela.
 *
 * Antes cada tela escolhia o seu: havia 8, 10, 12, 14 e 18 no mesmo programa.
 */
#define RAIO        12
#define RAIO_MIUDO   9
