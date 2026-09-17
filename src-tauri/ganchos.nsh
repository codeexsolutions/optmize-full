; ===========================================================================
; GANCHOS DO INSTALADOR
; ===========================================================================
;
; O Tauri costura este arquivo dentro do `installer.nsi` que ele gera (é o
; `nsis.installerHooks` do tauri.conf.json). Só existe o gancho de depois da
; instalação, e ele existe por um motivo só.
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
