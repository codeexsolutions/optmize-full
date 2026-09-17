#!/bin/sh
#
# ===========================================================================
# REGERA AS QUATRO FONTES DA INTERFACE
# ===========================================================================
#
# As fontes do terminal sao arquivos .c gerados: `main/fonte-16.c` e os irmaos
# dele. Eles nascem daqui, e este script existe porque antes NAO NASCIAM DE
# LUGAR NENHUM -- o .ttf estava so nesta maquina, o comando so no historico de
# um terminal, e acrescentar um simbolo a interface teria sido impossivel para
# quem clonasse o repositorio.
#
# Rode de dentro de `esp/`:
#
#     sh fontes/gerar.sh
#
# Precisa do `lv_font_conv`, que vem do npm e nao do ESP-IDF:
#
#     npm install -g lv_font_conv
#
# ---------------------------------------------------------------------------
# AS DUAS FONTES QUE VIRAM UMA
# ---------------------------------------------------------------------------
#
# Cada arquivo gerado junta DOIS arquivos de origem:
#
#   SpaceGrotesk-Medium.ttf   as letras, que sao a cara do Optmize
#   FontAwesome5 (do LVGL)    os simbolos -- o wi-fi, o certo, a lupa
#
# Juntar os dois num arquivo so, em vez de manter a fonte de simbolos separada,
# e o que permite escrever LV_SYMBOL_WIFI no meio de uma frase. Com duas fontes
# separadas, cada simbolo precisaria de um rotulo proprio, posicionado a mao ao
# lado do texto -- e realinhado toda vez que o texto mudasse de tamanho.
#
# A lista de simbolos e comprida e parece arbitraria: e a lista dos codigos que
# o LVGL define como LV_SYMBOL_*. Tirar os nao usados economizaria flash, mas
# quebraria a proxima tela que usasse um deles, com um quadrado vazio na tela e
# nenhuma pista do motivo.
#
# ---------------------------------------------------------------------------
# POR QUE --no-compress
# ---------------------------------------------------------------------------
#
# Comprimido, o desenho de cada letra e descompactado na hora de desenhar. Numa
# tela de 1024x600 que redesenha texto a cada quadro, isso troca flash (que
# sobra) por tempo de CPU (que nao sobra).
#

set -e

TTF="fontes/SpaceGrotesk-Medium.ttf"
FA="managed_components/lvgl__lvgl/scripts/built_in_font/FontAwesome5-Solid+Brands+Regular.woff"

# As letras: ASCII, o suplemento latino (os acentos do portugues) e o marcador.
LETRAS="0x20-0x7F,0xA0-0xFF,0x2022"

# Os LV_SYMBOL_* do LVGL, em decimal, como o proprio lv_font_conv os escreve.
SIMBOLOS="61441,61448,61451,61452,61452,61453,61457,61459,61461,61465,61468,61473,61478,61479,61480,61502,61507,61512,61515,61516,61517,61521,61522,61523,61524,61543,61544,61550,61552,61553,61556,61559,61560,61561,61563,61587,61589,61636,61637,61639,61641,61664,61671,61674,61683,61724,61732,61787,61931,62016,62017,62018,62019,62020,62087,62099,62212,62189,62810,63426,63650"

if [ ! -f "$TTF" ]; then
    echo "nao achei $TTF -- rode de dentro de esp/" >&2
    exit 1
fi

if [ ! -f "$FA" ]; then
    echo "nao achei a fonte de simbolos do LVGL em $FA." >&2
    echo "ela vem com o componente: rode 'idf.py build' uma vez antes." >&2
    exit 1
fi

for TAMANHO in 16 22 28 48; do
    SAIDA="main/fonte-${TAMANHO}.c"
    echo "gerando $SAIDA"

    lv_font_conv \
        --bpp 4 --size "$TAMANHO" --no-compress --no-prefilter \
        --font "$TTF"  -r "$LETRAS" \
        --font "$FA"   -r "$SIMBOLOS" \
        --format lvgl --force-fast-kern-format \
        -o "$SAIDA"

    #
    # O lv_font_conv escreve `#include "lvgl/lvgl.h"`, que nao existe neste
    # projeto: aqui o componente se inclui como "lvgl.h". Sem esta troca, os
    # quatro arquivos nao compilam -- e o erro aponta para a linha do include,
    # nao para o gerador, que e onde o defeito esta.
    #
    sed -i 's|#include "lvgl/lvgl.h"|#include "lvgl.h"|' "$SAIDA"
done

echo
echo "pronto. as quatro fontes estao em main/."
