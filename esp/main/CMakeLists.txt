# SEM `REQUIRES`. O componente `main` recebe todos os outros por padrao no
# ESP-IDF; declarar requisitos aqui RESTRINGE a essa lista, e o build passa a
# nao achar nem `lvgl.h` nem `bsp/esp-bsp.h`.
idf_component_register(
    SRCS "tela.c"
         "interface.c"
         "descanso.c"
         "rede.c"
         "optmize.c"
         "app-producao.c"
         "imagem-da-producao.c"
         "app-pontos.c"
         "app-ajustes.c"
         "video-da-camera.c"
         "leitor-de-qr.c"
         "prova-de-painel.c"
         "prova-de-camera.c"
    INCLUDE_DIRS ".")
