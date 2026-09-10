<#
    ===========================================================================
    Instala (ou remove) a sonda do Optimize como addon do CorelDRAW.
    ===========================================================================

    O addon e uma PASTA dentro de `Programs64\Addons\` da instalacao do Corel.
    Nao ha registro do Windows nem nada a mexer: o Corel varre essa pasta ao
    subir, ve o arquivo marcador `Coreldrw.addon`, le os dois `.xslt` e monta o
    docker. Instalar e copiar; desinstalar e apagar.

    PRECISA DE ADMINISTRADOR
    ------------------------
    `Programs64\Addons\` mora em `C:\Program Files\`, que o Windows protege.
    Sem elevacao a copia falha - e falha de um jeito util, com mensagem, em vez
    de o addon simplesmente nao aparecer depois.

    O CORELDRAW TEM QUE ESTAR FECHADO
    ---------------------------------
    A configuracao de interface e lida uma vez, quando o programa sobe. Copiar
    com ele aberto nao quebra nada, mas o docker so aparece no proximo boot -
    e a pessoa fica procurando um menu que ainda nao existe. O script confere e
    avisa.

    USO
    ---
      .\instalar-sonda.ps1              instala em toda versao do Corel que achar
      .\instalar-sonda.ps1 -Remover     desinstala
      .\instalar-sonda.ps1 -Versao 26   so numa versao
#>

param(
    [switch]$Remover,
    [string]$Versao = ""
)

$ErrorActionPreference = "Stop"

$NOME_DA_PASTA = "OptimizeSonda"
$origem = $PSScriptRoot

function Escrever($texto, $cor = "Gray") {
    Write-Host $texto -ForegroundColor $cor
}

# ---------------------------------------------------------------------------
# Sou administrador?
# ---------------------------------------------------------------------------
$identidade = [Security.Principal.WindowsIdentity]::GetCurrent()
$papel = New-Object Security.Principal.WindowsPrincipal($identidade)
$ehAdmin = $papel.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $ehAdmin) {
    Escrever "Este script precisa de administrador para escrever em Program Files." "Yellow"
    Escrever ""
    Escrever "Abra o PowerShell como administrador e rode de novo:" "Yellow"
    Escrever "  cd '$origem'" "White"
    Escrever "  .\instalar-sonda.ps1" "White"
    exit 1
}

# ---------------------------------------------------------------------------
# O Corel esta aberto?
# ---------------------------------------------------------------------------
$abertos = @(Get-Process -Name "CorelDRW" -ErrorAction SilentlyContinue)
if ($abertos.Count -gt 0) {
    Escrever "AVISO: o CorelDRAW esta aberto." "Yellow"
    Escrever "A copia funciona, mas o docker so aparece depois de fechar e abrir." "Yellow"
    Escrever ""
}

# ---------------------------------------------------------------------------
# Onde o Corel esta instalado
#
# Cada versao e uma pasta numerada ("25", "26"). Pegamos todas, porque quem tem
# duas versoes normalmente usa as duas, e instalar so numa e a receita para o
# "aqui nao aparece".
# ---------------------------------------------------------------------------
$raiz = "C:\Program Files\Corel\CorelDRAW Graphics Suite"
if (-not (Test-Path $raiz)) {
    Escrever "Nao achei o CorelDRAW em: $raiz" "Red"
    exit 1
}

$versoes = Get-ChildItem -Path $raiz -Directory | Where-Object { $_.Name -match '^\d+$' }
if ($Versao -ne "") {
    $versoes = $versoes | Where-Object { $_.Name -eq $Versao }
}

if (-not $versoes -or @($versoes).Count -eq 0) {
    Escrever "Nenhuma versao do Corel encontrada em $raiz" "Red"
    exit 1
}

# ---------------------------------------------------------------------------
# Copiar ou apagar
# ---------------------------------------------------------------------------
$quantas = 0

foreach ($v in $versoes) {
    # Instalacao de verdade, ou resto de desinstalacao?
    #
    # Nesta maquina a pasta "25" existe com `Draw\GMS` e `Programs64\Addons`
    # dentro, mas sem programa nenhum: o Corel 2024 saiu e o instalador do eCut
    # escreveu nas duas assim mesmo. Sem esta conferencia o script diria
    # "instalado na versao 25" e a pessoa iria procurar um docker que nunca vai
    # aparecer, porque nao ha CorelDRAW ali para abrir.
    #
    # Quem responde e o executavel: sem ele, nao e instalacao.
    $executavel = Join-Path $v.FullName "Programs64\CorelDRW.exe"
    if (-not (Test-Path $executavel)) {
        Escrever "versao $($v.Name): resto de instalacao (sem CorelDRW.exe), pulando" "DarkGray"
        continue
    }

    $addons = Join-Path $v.FullName "Programs64\Addons"
    if (-not (Test-Path $addons)) {
        Escrever "versao $($v.Name): sem pasta Addons, pulando" "DarkGray"
        continue
    }

    $destino = Join-Path $addons $NOME_DA_PASTA

    if ($Remover) {
        if (Test-Path $destino) {
            Remove-Item -Path $destino -Recurse -Force
            Escrever "versao $($v.Name): removido" "Green"
            $quantas++
        } else {
            Escrever "versao $($v.Name): nao estava instalado" "DarkGray"
        }
        continue
    }

    # Instalar e substituir por inteiro: a pasta e so nossa, entao nao ha nada
    # de terceiro para preservar (ao contrario do .CgsAddon das macros VSTA,
    # onde acrescentar sem destruir e a regra).
    if (Test-Path $destino) { Remove-Item -Path $destino -Recurse -Force }
    New-Item -ItemType Directory -Path $destino -Force | Out-Null

    foreach ($arquivo in @("Coreldrw.addon", "AppUI.xslt", "UserUI.xslt", "sonda.html")) {
        $de = Join-Path $origem $arquivo
        if (-not (Test-Path $de)) {
            Escrever "FALTA o arquivo $arquivo em $origem" "Red"
            exit 1
        }
        Copy-Item -Path $de -Destination (Join-Path $destino $arquivo) -Force
    }

    # Nada a reescrever no AppUI.xslt.
    #
    # Houve aqui um passo que trocava um marcador pelo caminho absoluto da
    # pagina em forma de `file:///C:/Program%20Files/...`. Saiu quando o
    # docker passou a apontar para `http://localhost:8000/sonda.html`: sem
    # caminho de disco no `href`, nao ha o que calcular na instalacao. Ver o
    # comentario do AppUI.xslt para o porque da mudanca.
    #
    # O `sonda.html` continua sendo copiado para ca junto com o resto. Ele
    # nao e mais o que o docker abre - quem serve a pagina e o Optimize, de
    # `estatico/` -, mas fica como copia do que foi instalado.

    Escrever "versao $($v.Name): instalado em $destino" "Green"
    $quantas++
}

Escrever ""
if ($quantas -eq 0) {
    Escrever "Nada foi feito." "Yellow"
    exit 0
}

if ($Remover) {
    Escrever "Pronto. Feche e abra o CorelDRAW para o docker sumir." "Cyan"
} else {
    Escrever "Pronto. Agora:" "Cyan"
    Escrever "  1. Feche o CorelDRAW, se estiver aberto." "White"
    Escrever "  2. Abra de novo." "White"
    Escrever "  3. Janela > Dockers (ou Encaixar janelas) > 'Optimize (sonda)'." "White"
    Escrever ""
    Escrever "Copie o texto da caixa de baixo do docker e mande para o Claude." "Cyan"
}
