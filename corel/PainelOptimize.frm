VERSION 5.00
Begin {C62A69F0-16DC-11CE-9E98-00AA00574A9B} PainelOptimize
   Caption         =   "Optimize - nome e numero"
   ClientHeight    =   5100
   ClientLeft      =   45
   ClientTop       =   375
   ClientWidth     =   6600
   StartUpPosition =   1  'CenterOwner
End
Attribute VB_Name = "PainelOptimize"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
'===============================================================================
' O PAINEL
'===============================================================================
'
' POR QUE ELE MONTA OS PROPRIOS CONTROLES.
'
' Um UserForm normal guarda os controles num arquivo .frx, que e binario. Dois
' arquivos, um deles ilegivel, e nenhum dos dois se escreve a mao - nao da para
' versionar direito num repositorio nem para conferir o que mudou.
'
' Este nasce vazio e monta tudo em `UserForm_Initialize`, com `Controls.Add`.
' Sai um arquivo de texto so, que o Corel importa sem companhia e que qualquer
' um consegue ler e mexer. O preco e a posicao de cada controle estar escrita em
' numero aqui embaixo em vez de arrastada com o mouse.
'
' Os controles que respondem a clique sao declarados `WithEvents`: e o que faz
' `btnMontar_Click` disparar mesmo o botao tendo nascido em tempo de execucao.
'
' SEM ACENTO, pelo mesmo motivo do Optimize.bas: o editor do Corel le ANSI.
'===============================================================================

Option Explicit

Private WithEvents btnMontar As MSForms.CommandButton
Private WithEvents btnFechar As MSForms.CommandButton

Private txtLista As MSForms.TextBox
Private txtFonte As MSForms.TextBox
Private txtAlturaNome As MSForms.TextBox
Private txtAlturaNumero As MSForms.TextBox
Private txtLarguraMax As MSForms.TextBox
Private txtEspaco As MSForms.TextBox
Private txtCentroX As MSForms.TextBox
Private txtBaseY As MSForms.TextBox
Private lblRecado As MSForms.Label


' Um rotulo, so para nao repetir seis linhas iguais.
Private Function Rotulo(ByVal texto As String, ByVal x As Single, ByVal y As Single, _
                        ByVal larg As Single) As MSForms.Label
    Dim l As MSForms.Label
    Set l = Me.Controls.Add("Forms.Label.1", "lbl" & Replace(Replace(texto, " ", ""), "(", ""), True)
    l.Caption = texto
    l.Left = x
    l.Top = y
    l.Width = larg
    l.Height = 12
    l.Font.Size = 8
    Set Rotulo = l
End Function

' Uma caixa de texto de uma linha.
Private Function Caixa(ByVal nome As String, ByVal x As Single, ByVal y As Single, _
                       ByVal larg As Single, ByVal valor As String) As MSForms.TextBox
    Dim t As MSForms.TextBox
    Set t = Me.Controls.Add("Forms.TextBox.1", nome, True)
    t.Left = x
    t.Top = y
    t.Width = larg
    t.Height = 16
    t.Text = valor
    Set Caixa = t
End Function


Private Sub UserForm_Initialize()
    Dim xDir As Single
    Dim yDir As Single

    Me.Caption = "Optimize - nome e numero"
    Me.Width = 440
    Me.Height = 360

    ' ---------- coluna da esquerda: a lista ----------
    Rotulo "Jogadores - uma linha por camisa, NOME;NUMERO", 10, 8, 250
    Set txtLista = Me.Controls.Add("Forms.TextBox.1", "txtLista", True)
    txtLista.Left = 10
    txtLista.Top = 22
    txtLista.Width = 250
    txtLista.Height = 250
    txtLista.MultiLine = True
    txtLista.EnterKeyBehavior = True
    txtLista.ScrollBars = fmScrollBarsVertical
    txtLista.Text = "GABRIEL;10" & vbCrLf & "SA;7" & vbCrLf & "GONCALVES;23"

    ' ---------- coluna da direita: as medidas ----------
    ' Elas comecam com o que esta escrito no Optimize.bas, entao o painel abre
    ' com o padrao da casa e so muda o que a pessoa mexer.
    xDir = 275
    yDir = 8

    Rotulo "Fonte", xDir, yDir, 150
    Set txtFonte = Caixa("txtFonte", xDir, yDir + 12, 150, PadraoFonte())
    yDir = yDir + 40

    Rotulo "Altura do nome (cm)", xDir, yDir, 150
    Set txtAlturaNome = Caixa("txtAlturaNome", xDir, yDir + 12, 60, PadraoAlturaNome())
    yDir = yDir + 40

    Rotulo "Altura do numero (cm)", xDir, yDir, 150
    Set txtAlturaNumero = Caixa("txtAlturaNumero", xDir, yDir + 12, 60, PadraoAlturaNumero())
    yDir = yDir + 40

    Rotulo "Largura maxima do nome (cm)", xDir, yDir, 150
    Set txtLarguraMax = Caixa("txtLarguraMax", xDir, yDir + 12, 60, PadraoLarguraMax())
    yDir = yDir + 40

    Rotulo "Espaco entre nome e numero (cm)", xDir, yDir, 150
    Set txtEspaco = Caixa("txtEspaco", xDir, yDir + 12, 60, PadraoEspaco())
    yDir = yDir + 40

    Rotulo "Centro X (cm)", xDir, yDir, 70
    Set txtCentroX = Caixa("txtCentroX", xDir, yDir + 12, 60, PadraoCentroX())
    Rotulo "Base Y (cm)", xDir + 80, yDir, 70
    Set txtBaseY = Caixa("txtBaseY", xDir + 80, yDir + 12, 60, PadraoBaseY())
    yDir = yDir + 40

    ' ---------- recado e botoes ----------
    Set lblRecado = Me.Controls.Add("Forms.Label.1", "lblRecado", True)
    lblRecado.Left = 10
    lblRecado.Top = 278
    lblRecado.Width = 250
    lblRecado.Height = 50
    lblRecado.Font.Size = 8
    lblRecado.Caption = ""

    Set btnMontar = Me.Controls.Add("Forms.CommandButton.1", "btnMontar", True)
    btnMontar.Caption = "Montar"
    btnMontar.Left = xDir
    btnMontar.Top = 290
    btnMontar.Width = 70
    btnMontar.Height = 22
    btnMontar.Default = True

    Set btnFechar = Me.Controls.Add("Forms.CommandButton.1", "btnFechar", True)
    btnFechar.Caption = "Fechar"
    btnFechar.Left = xDir + 80
    btnFechar.Top = 290
    btnFechar.Width = 70
    btnFechar.Height = 22
    btnFechar.Cancel = True
End Sub


Private Sub btnFechar_Click()
    Unload Me
End Sub


Private Sub btnMontar_Click()
    Dim recado As String

    If Len(Trim(txtLista.Text)) = 0 Then
        lblRecado.Caption = "Cole a lista de jogadores primeiro."
        Exit Sub
    End If

    btnMontar.Enabled = False
    lblRecado.Caption = "Montando..."
    DoEvents

    ' O desenho mora no modulo, nao aqui: o painel so junta o que a pessoa
    ' digitou e entrega. Assim a mesma rotina serve ao painel e a qualquer outra
    ' chamada, e o formulario nao vira o lugar onde a regra da camisa mora.
    recado = MontarCamisas(txtLista.Text, txtFonte.Text, _
                           ParaNumero(txtAlturaNome.Text, 6), _
                           ParaNumero(txtAlturaNumero.Text, 22), _
                           ParaNumero(txtLarguraMax.Text, 38), _
                           ParaNumero(txtEspaco.Text, 2), _
                           ParaNumero(txtCentroX.Text, 25), _
                           ParaNumero(txtBaseY.Text, 20))

    lblRecado.Caption = recado
    btnMontar.Enabled = True
End Sub
