# O terminal de chão de fábrica

Uma tela de 7 polegadas com toque, câmera e Wi‑Fi para pôr na parede da
gráfica. Lê o QR da ordem de serviço, mostra o que há nela, e conversa com o
Optmize pela rede.

Este diretório é o programa que roda **na placa**. O Optmize continua sendo o
servidor; a placa é um cliente dele.

---

## A placa, e por que isso importa mais do que parece

**Waveshare ESP32‑P4‑WIFI6‑Touch‑LCD‑7B, revisão 1.1.** Está serigrafado nela,
junto com `1024x600 Pixels`.

**Ela não é a ESP32‑P4‑Function‑EV‑Board da Espressif**, e confundir as duas
custou um dia inteiro de trabalho. O firmware que vem de fábrica se chama
`phone_p4_function_ev_board` e leva a crer que o hardware é o da Espressif. É o
contrário: alguém pegou o projeto da Espressif e o **adaptou** para esta placa —
por isso a versão dele termina em `-dirty`.

O BSP oficial (`espressif/esp32_p4_function_ev_board`) tem os pinos de outra
placa. Com ele, tudo sobe sem um único erro no log — `Display initialized`,
`1024x600`, toque respondendo, luz de fundo em 100% — **e a tela fica preta**.

O que muda:

| | BSP da Espressif | esta placa |
|---|---|---|
| Reset do painel | GPIO 27 | **GPIO 33** |
| Luz de fundo | GPIO 26 | **GPIO 32** |
| Polaridade da luz | acende em nível alto | **acende em nível baixo** |
| Lanes MIPI‑DSI | 1000 Mbps | **900 Mbps** |

O reset é o que mais importa: no pino errado o painel nunca sai do estado
inicial e ignora tudo que chega pelo DSI — inclusive o padrão de barras gerado
pelo próprio silício, que foi o sintoma que mais confundiu. E a polaridade
invertida explica por que forçar o GPIO 32 em nível alto nunca acendia nada.

Os valores corretos vieram do projeto [xiaozhi‑esp32][xz], que dá suporte de
verdade a esta placa, em
`main/boards/waveshare/esp32-p4-wifi6-touch-lcd/config.h`.

[xz]: https://github.com/78/xiaozhi-esp32

**A lição:** identificar a placa pela serigrafia antes de escolher BSP. Uma foto
resolveu em dois minutos o que oito horas de teste não resolveram.

### O chip também é antigo

O P4 desta placa é revisão **v1.3**, anterior ao ECO5. O ESP‑IDF v5.5.5 assume
v3.1+ por padrão e gera um binário que o próprio esptool recusa gravar. Daí, no
`sdkconfig.defaults`:

    CONFIG_ESP32P4_SELECTS_REV_LESS_V3=y
    CONFIG_ESP32P4_REV_MIN_100=y

O `REV_MIN_100` (v1.0) e não `REV_MIN_0`: a revisão mínima manda o IDF compilar
os contornos de silício de todas as revisões a partir dela, e os do v0.x mexem
em coisas que no v1.3 já estão certas.

---

## Onde está cada coisa

```
esp/
  main/
    tela.c                 sobe o hardware na ordem certa e entrega à casca
    interface.c / .h       a barra de cima, o relógio e a troca de app
    rede.c                 Wi-Fi pelo ESP32-C6, e a hora por SNTP
    app-producao.c         câmera + leitura de QR
    app-pontos.c           em construção
    app-ajustes.c          rede, brilho, ganho do microfone
    video-da-camera.c      USB → JPEG → imagem do LVGL
    leitor-de-qr.c         acha e decodifica QR no quadro
    prova-de-painel.c      DIAGNÓSTICO: o painel recebe pixel?
    prova-de-camera.c      sobe a pilha USB e lista o que a câmera oferece
  components/
    esp32_p4_function_ev_board/   o BSP, copiado e corrigido — ver abaixo
  sdkconfig.defaults       PSRAM, cache, partições, revisão do chip
  particoes.csv
  idf.ps1                  carrega o ESP-IDF nesta máquina
```

### Por que o BSP está em `components/` e não como dependência

Porque as correções vivem **dentro** do código dele — pinos, polaridade, taxa
das lanes. E `managed_components/` é pasta gerada: o gerenciador confere o hash
dos arquivos e **restaura o original** no primeiro `reconfigure`, levando as
correções junto.

Isso aconteceu. A tela voltava a ficar preta sem explicação, e o motivo era uma
pasta que se reescreve sozinha. Dentro de `components/` as correções são nossas
e ficam.

Pelo mesmo motivo, **todas as faixas de versão estão fechadas** no
`idf_component.yml`. Faixa aberta foi a origem de boa parte do tempo perdido:

- um `*` trouxe o BSP feito para outra revisão de placa;
- o `^2` que o BSP usa para o `esp_lvgl_port` resolve hoje para uma versão que
  nem compila com o LVGL que ele próprio exige.

---

## O que já funciona

### A tela

1024x600, girada 180 graus porque a placa está montada de ponta‑cabeça. O giro
acontece **no painel** (`esp_lcd_panel_mirror`), não no LVGL — pelo LVGL
custaria um terceiro buffer de desenho inteiro, 1,2 MB, e foi exatamente o que
faltou quando o leitor de QR entrou e a placa passou a reiniciar em laço.

Como o giro é no painel, **o toque não acompanha sozinho**: o GT911 mede o vidro
físico, que não girou. Ele é espelhado à parte, em `tela.c`.

### A casca e os três apps

Barra no topo com relógio, estado da rede e botão de voltar. Tela inicial com
três cartões grandes.

Trocar de app **apaga os objetos do anterior e chama o `desmontar` dele** — não
esconde. O app de Produção segura a câmera, dois buffers de quadro e o leitor de
QR: quase 3 MB. Deixar isso vivo atrás de uma tela que ninguém olha é gasto de
memória e de barramento por nada.

### A câmera e o vídeo

Câmera **USB (UVC)**, na porta USB‑OTG (a tipo A). Não é a do conector flat
MIPI‑CSI — esse está vazio.

MJPEG 800x600 a 30 fps, decodificado pelo **hardware de JPEG do P4** direto em
RGB565, que é o formato da tela. Medido: **300 de 302 quadros chegam à tela**,
com um descarte e um defeito no total.

Quatro obstáculos até chegar lá, todos com conserto documentado no código:

1. **Buffer de controle USB pequeno** — 256 bytes é o bastante para um mouse,
   não para uma webcam, que declara dezenas de combinações de formato. A
   enumeração morria antes de a câmera se apresentar.
   (`CONFIG_USB_HOST_CONTROL_TRANSFER_MAX_SIZE=4096`)

2. **Bit EOH exigido** — o driver recusava todo pacote porque esta câmera não
   marca o bit de "fim de cabeçalho". Fora da especificação, mas comum.
   (`CONFIG_UVC_CHECK_PAYLOAD_HEADER_EOH=n`)

3. **Decodificação no callback do driver** — travava a tarefa do USB por 20 ms
   a cada quadro e o cão de guarda derrubava o sistema. Foi para uma tarefa
   própria, com fila de **uma vaga**: vídeo ao vivo prefere perder quadro a
   acumular atraso.

4. **Buffer oito linhas curto** — JPEG trabalha em blocos de 16 pixels de
   altura, então 600 linhas viram **608** na saída. As oito últimas são sobra
   que ninguém mostra, mas **são escritas**.

### A leitura de QR

Biblioteca `quirc`, sobre a imagem **que já foi decodificada para a tela** —
não há segunda decodificação. O decodificador do P4 não converte cor em cinza
(só entrega cinza se a origem já for cinza), então a conversão é nossa: extrai o
verde do RGB565, que tem 6 bits contra 5 dos outros e é o canal mais próximo do
brilho que o olho percebe.

Varre em **meia resolução** (400x304) e **um quadro a cada seis** — cinco
leituras por segundo. Procurar QR é caro: a biblioteca varre a imagem inteira
atrás dos quadrados de alinhamento antes de decodificar qualquer coisa, e
ninguém aponta um código e o tira em 33 milissegundos.

Um erro que vale registrar: as estruturas `quirc_code` e `quirc_data` somam mais
de 13 KB e estavam declaradas **na pilha** de uma tarefa de 5 KB. Estouraram na
primeira leitura, com `Stack protection fault` e a placa reiniciando em laço.

### A rede

O P4 **não tem rádio**. Quem tem é o ESP32‑C6 ao lado dele, e os dois conversam
por SDIO — `esp_hosted` faz o transporte, `esp_wifi_remote` põe por cima a API
de sempre. Os pinos vieram do firmware de fábrica, que os imprime no boot:
CLK 18, CMD 19, D0‑D3 em 14‑17, reset do C6 no 54.

Nome e senha ficam na **NVS**, escolhidos numa lista do que está no ar. Senha em
código obrigaria recompilar para trocar de roteador, e numa gráfica quem troca o
roteador não tem compilador.

A hora vem por **SNTP**, e só existe depois que o Wi‑Fi conectar — o relógio
mostra `--:--` até lá. A placa não tem relógio próprio em uso: ligada do zero,
ela acha que é 1970, e um relógio marcando hora de 1970 com ar de certeza é pior
que um que assume não saber.

**Pendência conhecida:** o boot registra
`eh_init_evt: major version mismatch ??? OTA coprocessor from host`. O firmware
do ESP32‑C6 que a Waveshare gravou é de versão diferente da que o `esp_hosted`
3.0.7 espera. Pode impedir o Wi‑Fi de funcionar; se acontecer, o caminho é
atualizar o firmware do C6 pela própria placa.

---

## O que ainda não existe

- **App de Pontos** — tela dizendo "em construção", de propósito. Um cartão que
  leva a uma tela explicando vale mais que um cartão ausente.
- **Entrada de áudio** — o controle de ganho do microfone existe em Ajustes,
  mostra o número e **não chega ao codec**. Está anotado no código onde ele sai
  quando o áudio entrar. Melhor isso do que um controle que finge funcionar.
- **A ligação com o Optmize** — a placa lê o QR e mostra o conteúdo cru. O que
  ela faz com ele depende do formato dos QR que o sistema gera, que ainda não
  definimos.

---

## Como compilar e gravar

O ESP‑IDF **não sobe sozinho nesta máquina**, por dois motivos: o instalador pôs
as ferramentas em `C:\Espressif` e o `export.ps1` procura em `~\.espressif`; e o
nome do ambiente Python vem da versão que estiver no `PATH` (3.12 no sistema,
3.11 no instalado). O `idf.ps1` resolve os dois:

```powershell
. .\esp\idf.ps1
cd esp
idf.py -p COM5 -b 460800 flash monitor
```

**A porta alterna entre COM4 e COM5** quando o USB reenumera — confira antes. E
use **460800 baud**: a 921600 o USB caiu no meio de uma gravação.

### Se a tela ficar preta

1. Confira se as correções do BSP ainda estão lá:
   `components/esp32_p4_function_ev_board/include/bsp/esp32_p4_function_ev_board.h`
   deve dizer `GPIO_NUM_32` (luz) e `GPIO_NUM_33` (reset).
2. Ponha `DESVIAR_PARA_A_PROVA` em `1` no `tela.c`. A prova de painel pinta cor
   sólida sem LVGL e responde "o painel recebe pixel?" sem nada no meio.

### O firmware de fábrica

Há um backup verificado dos 32 MB originais, **fora deste repositório** (é
binário grande demais para o Git), em:

    D:\servidores\novo\esp32-p4\backup\p4-brookesia-flash-completo.bin
    SHA-256 5940B08B1DCE22832A25A4321BC09660A3FBB5C354DF24FE335439B16805E665

Para voltar ao demo de fábrica:

```
esptool --port COM5 --baud 460800 --chip esp32p4 write_flash 0x0 <arquivo>
```
