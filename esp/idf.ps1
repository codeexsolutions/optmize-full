# Carrega o ESP-IDF v5.5.5 nesta sessao do PowerShell.
#
# Duas correcoes que o export.ps1 sozinho nao faz nesta maquina:
#  1. o instalador pos as ferramentas em C:\Espressif, e nao no ~\.espressif
#     que o export.ps1 assume: sem IDF_TOOLS_PATH ele procura o venv no lugar
#     errado;
#  2. o nome do venv leva a versao do Python que estiver no PATH. O do sistema
#     e 3.12, o venv instalado e 3.11 -- entao o Python do IDF tem que vir
#     primeiro, ou ele procura um idf5.5_py3.12_env que nunca existiu.
#
# Uso:  . D:\servidores\novo\esp32-p4\idf.ps1
$env:IDF_TOOLS_PATH = 'C:\Espressif'
$env:PATH = 'C:\Espressif\python_env\idf5.5_py3.11_env\Scripts;' + $env:PATH
. 'C:\Espressif\frameworks\esp-idf-v5.5.5\export.ps1'
