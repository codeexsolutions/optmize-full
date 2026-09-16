# SEM `REQUIRES`. O componente `main` recebe todos os outros por padrao no
# ESP-IDF; declarar requisitos aqui RESTRINGE a essa lista, e o build passa a
# nao achar nem `lvgl.h` nem `bsp/esp-bsp.h`.
idf_component_register(
    SRCS "tela.c"
         "interface.c"
         "descanso.c"
         "sobre.c"
         "logo.c"
         "mira.c"
         "ajuda.c"
         "fonte-16.c"
         "fonte-22.c"
         "fonte-28.c"
         "fonte-48.c"
         "rede.c"
         "voz.c"
         "optmize.c"
         "app-producao.c"
         "imagem-da-producao.c"
         "app-pontos.c"
         "app-ajustes.c"
         "video-da-camera.c"
         "leitor-de-qr.c"
         "prova-de-painel.c"
         "prova-de-camera.c"
         "prova-de-audio.c"
    INCLUDE_DIRS ".")
