# The following five lines of boilerplate have to be in your project's
# CMakeLists in this exact order for cmake to work correctly
cmake_minimum_required(VERSION 3.16)

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
# A VERSAO QUE APARECE NO "SOBRE".
#
# Fica aqui e nao no git porque esta pasta nao e um repositorio -- ela e
# copiada para `esp/` dentro do Optmize, que sim e versionado. Sem isto o
# `esp_app_get_description()->version` responde "1", que nao ajuda ninguem ao
# telefone.
set(PROJECT_VER "1.0")
project(tela)
