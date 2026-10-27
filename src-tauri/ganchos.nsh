; ===========================================================================
; GANCHOS DO INSTALADOR
; ===========================================================================
;
; O Tauri costura este arquivo dentro do `installer.nsi` que ele gera (é o
; `nsis.installerHooks` do tauri.conf.json). São dois motivos: o ícone, logo
; abaixo, e o Node que segura os arquivos, mais adiante.
;
; O WINDOWS GUARDA ÍCONE POR CAMINHO DE ARQUIVO, E NÃO OLHA O ARQUIVO DE NOVO.
;
; Aconteceu aqui, e custou uma investigação inteira: a marca do programa mudou,
; o `optimize.exe` novo foi instalado no MESMO caminho de sempre
; (`%LOCALAPPDATA%\Optimize\optimize.exe`), e a área de trabalho continuou
; mostrando o ícone antigo — o "OP" num quadrado laranja, de uma versão de
; semanas atrás. O executável estava certo: lendo os recursos dele vinha a marca
; nova, e pedindo ao próprio Windows para extrair o ícone do arquivo também. O
; que estava errado era o banco de cache do Explorer, que respondia pelo caminho
; sem nunca reabrir o arquivo.
;
; Quem instala não tem como saber disso, nem tem por que aprender a apagar
; `iconcache_*.db` à mão. Então quem avisa é o instalador, aqui, nas duas
; formas que o Windows entende:
;
;   SHChangeNotify  — o recado oficial de "as associações mudaram, reveja os
;                     ícones". É o que todo instalador sério manda.
;   ie4uinit -show  — o encarregado do cache de ícones no Windows 10 e 11.
;                     Faz o Explorer soltar o que guardou e repintar.
;
; Os dois são baratos e não pedem nada de quem está instalando. Rodar os dois e
; não só o primeiro é de propósito: nesta máquina o `SHChangeNotify` sozinho
; não bastou para o atalho já existente.

; ---------------------------------------------------------------------------
; O NODE DO PROGRAMA MORRE ANTES DE OS ARQUIVOS SEREM TROCADOS
; ---------------------------------------------------------------------------
;
; Era o "conflito" de toda atualização. O atualizador do Tauri encerra o
; `optimize.exe` com um `exit` seco, que não passa pelo código que matava o
; `node.exe` filho. O Node ficava órfão, com `servidor\` aberto, e o instalador
; não conseguia sobrescrever os arquivos. O Tauri só fecha o `optimize.exe`;
; o Node, com outro nome, ele não enxerga.
;
; Desde 2026-10-27 o Node nasce num Job Object do `optimize.exe` (ver
; `amarrar_ao_programa`, em main.rs): o Windows o encerra junto com o programa,
; seja qual for o jeito de o programa sair. Para quem já está nessa versão,
; fechar o `optimize.exe` basta.
;
; Este gancho fica para quem instala por cima de uma versão ANTERIOR aberta,
; em que o Node ainda não tinha job: `taskkill /T` derruba o `optimize.exe` e
; a árvore dele, e o Node é filho dele. Um Node que a pessoa use para outra
; coisa fica em paz — não é filho do Optimize.
;
; ATÉ 2026-10-27 ISTO ERA UM POWERSHELL, com `-ExecutionPolicy Bypass`, que
; achava o Node pelo caminho do executável. Funcionava, e era também o retrato
; falado de um instalador malicioso: antivírus olha com lupa instalador que
; chama PowerShell escondido furando a política de execução. O `taskkill` é
; ferramenta do próprio Windows, feita para isto.
;
; NA ATUALIZAÇÃO PELO PROGRAMA (`/UPDATE`) ELE NÃO RODA, e é de propósito:
; ali quem abre o instalador é o próprio `optimize.exe`, e o `/T` derrubaria o
; instalador junto, como filho dele. Nem precisa — desde a 1.2 o programa
; encerra o Node antes de chamar o instalador (ver `instalar`, em main.rs).
;
; O que se perde: um Node que JÁ estava órfão antes de o instalador abrir (o
; programa antigo caiu) não é filho de ninguém, e o `/T` não o alcança. É raro,
; e um reinício do Windows resolve.
!include "FileFunc.nsh"
!include "LogicLib.nsh"

!macro OPTMIZE_ENCERRA_O_PROGRAMA
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /T /IM "optimize.exe"'
  Pop $0
  ; O Windows solta os arquivos de um processo morto logo depois, não no mesmo
  ; instante.
  Sleep 700
!macroend

!macro NSIS_HOOK_PREINSTALL
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/UPDATE" $R1
  ${If} ${Errors}
    !insertmacro OPTMIZE_ENCERRA_O_PROGRAMA
  ${EndIf}
!macroend

; Quem desinstala nunca é aberto pelo programa: aqui não há `/UPDATE` a olhar.
!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro OPTMIZE_ENCERRA_O_PROGRAMA
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; SHCNE_ASSOCCHANGED (0x08000000), sem lista de itens e sem caminho: vale
  ; para o shell inteiro, que é o alcance certo — o atalho da área de trabalho,
  ; o do menu iniciar e a barra de tarefas são três lugares diferentes.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'

  ; `ie4uinit` é do sistema e está sempre lá; ainda assim, se não estiver, o
  ; `SHChangeNotify` acima já foi — e uma instalação não pode falhar por causa
  ; de um ícone.
  ${If} ${FileExists} "$SYSDIR\ie4uinit.exe"
    ExecWait '"$SYSDIR\ie4uinit.exe" -show'
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Pelo mesmo motivo do de cima, do outro lado: sem isto o ícone de um
  ; programa que não existe mais fica no cache até alguém repintar.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
!macroend
