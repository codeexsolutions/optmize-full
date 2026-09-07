Attribute VB_Name = "Optimize"
'===============================================================================
' OPTIMIZE - nome e numero para camisa de time, dentro do CorelDRAW
'===============================================================================
'
' O que ela faz: recebe uma lista de "nome;numero" e monta uma pagina por
' jogador, com o nome em cima e o numero embaixo, na fonte e nas medidas do
' time. Nome comprido e CONDENSADO - esmagado na horizontal, mantendo a altura.
'
' POR QUE CONDENSAR E NAO DIMINUIR. Altura de numero e de nome e regra de
' uniforme, nao e escolha de estetica. Diminuir a fonte de "GONCALVES" para ela
' caber deixaria a camisa dele com letra menor que a do "SA", e as duas lado a
' lado na quadra denunciam. Condensando, todas tem letra da mesma altura e so a
' largura acompanha o nome.
'
' SEM ACENTO DE PROPOSITO. Arquivo .bas e lido como ANSI pelo editor do Corel, e
' um arquivo salvo em UTF-8 aparece la com os acentos quebrados. Como ele vai
' viajar entre maquinas, sai mais barato escrever sem acento nenhum do que
' depender de todo mundo acertar a codificacao. Isto vale so para este arquivo.
'
' ELA SO ABRE COM O OPTIMIZE LIGADO. Ver `SistemaEstaLigado`.
'
' Como instalar:
'   1. No Corel: Ferramentas > Macros > Editor de macros (Alt+F11).
'   2. Arquivo > Importar arquivo... e escolha este .bas.
'   3. Ferramentas > Macros > Executar macro > Optimize.NomesENumeros.
'
'===============================================================================

Option Explicit

'==================== O QUE VOCE VAI QUERER AJUSTAR ====================
'
' Tudo que muda de time para time esta aqui em cima. O resto do arquivo nao
' precisa ser tocado.

' A fonte do nome e a do numero. Se o time usa a mesma, repita.
Public Const FONTE_NOME As String = "Arial Black"
Public Const FONTE_NUMERO As String = "Arial Black"

' Alturas, em centimetros. Sao as medidas de verdade da camisa.
Public Const ALTURA_NOME_CM As Double = 6#
Public Const ALTURA_NUMERO_CM As Double = 22#

' A largura maxima que o nome pode ocupar. Passando disso, ele condensa.
'
' 38 cm, e o numero saiu de medir no proprio Corel, nao de palpite. Arial Black
' a 6 cm de altura desenha assim:
'
'   BRUNO         5 letras   31,8 cm     cabe inteiro
'   GABRIEL       7 letras   39,5 cm     96% da largura
'   GONCALVES     9 letras   55,2 cm     69%
'   NASCIMENTO   10 letras   59,9 cm     63%
'   VASCONCELOS  11 letras   67,5 cm     56%
'
' O primeiro valor que eu tinha posto aqui era 30, e ele reprovava GONCALVES
' (54%, abaixo do piso) - um sobrenome comum disparando aviso a toa. Com 38, o
' pior caso de onze letras ainda passa raspando, e nome maior que isso avisa,
' que e o comportamento certo: doze letras numa camisa realmente e problema.
'
' Se a sua camisa tem outra largura util, meca a sua e troque aqui.
Public Const LARGURA_MAX_NOME_CM As Double = 38#

' O espaco entre a base do nome e o topo do numero.
Public Const ESPACO_ENTRE_CM As Double = 2#

' Ate onde o nome pode ser esmagado. 0.55 quer dizer "pode chegar a 55% da
' largura natural". Abaixo disso a letra vira risco vertical e ninguem le da
' arquibancada, entao a macro avisa em vez de entregar calada.
'
' O par (38 cm, 55%) foi escolhido junto: ele aceita ate onze letras e reclama
' da decima segunda. Mexer num sem olhar o outro tira o sentido dos dois.
Public Const CONDENSA_MINIMA As Double = 0.55

' Onde o bloco fica na pagina, medido do canto de baixo a esquerda.
Public Const CENTRO_X_CM As Double = 25#
Public Const BASE_Y_CM As Double = 20#

' O endereco do Optimize nesta maquina.
Private Const ENDERECO_SISTEMA As String = _
    "http://localhost:8000/api/encaixe/guardado?chave=macro-corel"


'==================== O PADRAO DA CASA, PARA O PAINEL ====================
'
' O painel (PainelOptimize.frm) abre com estes valores nas caixas. Eles vem
' daqui e nao estao repetidos la: um dia alguem troca a altura do numero e nao
' pode ter que lembrar de trocar em dois lugares.

Public Function PadraoFonte() As String
    PadraoFonte = FONTE_NOME
End Function
Public Function PadraoAlturaNome() As String
    PadraoAlturaNome = CStr(ALTURA_NOME_CM)
End Function
Public Function PadraoAlturaNumero() As String
    PadraoAlturaNumero = CStr(ALTURA_NUMERO_CM)
End Function
Public Function PadraoLarguraMax() As String
    PadraoLarguraMax = CStr(LARGURA_MAX_NOME_CM)
End Function
Public Function PadraoEspaco() As String
    PadraoEspaco = CStr(ESPACO_ENTRE_CM)
End Function
Public Function PadraoCentroX() As String
    PadraoCentroX = CStr(CENTRO_X_CM)
End Function
Public Function PadraoBaseY() As String
    PadraoBaseY = CStr(BASE_Y_CM)
End Function

' Numero digitado a mao, com a virgula que o teclado brasileiro produz e o
' ponto que copiar-e-colar traz. Vazio ou torto cai no padrao em vez de derrubar
' a macro no meio da lista.
Public Function ParaNumero(ByVal texto As String, ByVal padrao As Double) As Double
    Dim t As String
    t = Replace(Trim(texto), ".", ",")
    If Not IsNumeric(t) Then
        ParaNumero = padrao
    Else
        ParaNumero = CDbl(t)
    End If
End Function


'==================== A TRAVA: O SISTEMA TEM QUE ESTAR NO PC ====================
'
' A macro pergunta ao Optimize se ele esta de pe. Sem resposta, ela nao abre.
'
' O QUE ISTO E: uma trava contra copia casual. A macro sozinha, copiada para
' outra maquina, nao roda.
'
' O QUE ISTO NAO E: protecao contra quem sabe o que esta fazendo. Um GET a
' localhost e facil de forjar. Se um dia precisar valer de verdade, o caminho e
' a macro depender do sistema para alguma coisa que ela nao saiba fazer sozinha
' - e nao de uma pergunta que ela mesma poderia responder.

Private Function SistemaEstaLigado() As Boolean
    Dim http As Object
    On Error GoTo SemSistema

    Set http = CreateObject("WinHttp.WinHttpRequest.5.1")
    ' Curto de proposito: se o servico esta na maquina, ele responde na hora. Um
    ' tempo longo de espera so serve para travar o Corel quando ele nao esta.
    http.SetTimeouts 1000, 1000, 1000, 2000
    http.Open "GET", ENDERECO_SISTEMA, False
    http.Send

    ' 200 com o JSON do encaixe guardado: nao e so "tem alguem na porta 8000",
    ' e este servidor.
    SistemaEstaLigado = (http.Status = 200 And InStr(http.ResponseText, "guardado") > 0)
    Exit Function

SemSistema:
    SistemaEstaLigado = False
End Function


'==================== A LISTA DE JOGADORES ====================
'
' Uma linha por jogador, "nome;numero". O separador pode ser ponto e virgula,
' virgula ou tabulacao - quem cola de uma planilha traz tabulacao, e quem digita
' a mao costuma usar ponto e virgula.
'
' Linha em branco e pulada. Linha sem numero entra so com o nome, que e o caso
' da camisa de comissao tecnica.

Private Function SeparaLinha(ByVal linha As String, ByRef nome As String, _
                             ByRef numero As String) As Boolean
    Dim onde As Long
    Dim sep As Variant
    Dim achou As Long

    linha = Trim(linha)
    If Len(linha) = 0 Then
        SeparaLinha = False
        Exit Function
    End If

    achou = 0
    For Each sep In Array(";", vbTab, ",")
        onde = InStr(linha, CStr(sep))
        If onde > 0 Then
            achou = onde
            Exit For
        End If
    Next sep

    If achou = 0 Then
        nome = linha
        numero = ""
    Else
        nome = Trim(Left(linha, achou - 1))
        numero = Trim(Mid(linha, achou + 1))
    End If

    SeparaLinha = (Len(nome) > 0 Or Len(numero) > 0)
End Function


'==================== O DESENHO ====================

' Cria um texto ja na altura pedida, centrado no x.
Private Function TextoNaAltura(ByVal texto As String, ByVal fonte As String, _
                               ByVal alturaCm As Double, ByVal centroX As Double, _
                               ByVal baseY As Double) As Shape
    Dim s As Shape

    Set s = ActiveLayer.CreateArtisticText(0, 0, texto)
    s.Text.Story.Font = fonte
    s.Text.Story.Alignment = cdrCenterAlignment

    ' A altura vem da CAIXA do texto desenhado, e nao do corpo da fonte: duas
    ' fontes de mesmo corpo desenham alturas diferentes, e o que a camisa exige
    ' e a letra medida com a regua, nao o numero que esta na caixinha da fonte.
    If s.SizeHeight > 0 Then
        s.SetSize s.SizeWidth * (alturaCm / s.SizeHeight), alturaCm
    End If

    s.CenterX = centroX
    s.PositionY = baseY
    Set TextoNaAltura = s
End Function


' Esmaga o texto na horizontal ate caber na largura, mantendo a altura.
' Devolve quanto ele ficou da largura natural (1 = nao precisou).
Private Function Condensa(ByVal s As Shape, ByVal larguraMaxCm As Double, _
                          ByVal centroX As Double) As Double
    Dim altura As Double

    If s.SizeWidth <= larguraMaxCm Or s.SizeWidth <= 0 Then
        Condensa = 1
        Exit Function
    End If

    Condensa = larguraMaxCm / s.SizeWidth
    altura = s.SizeHeight
    ' Largura nova, altura intacta: o esmagamento e so na horizontal.
    s.SetSize larguraMaxCm, altura
    s.CenterX = centroX
End Function


'==================== A REGRA, PARAMETRIZADA ====================
'
' Aqui mora o desenho da camisa. Ela recebe tudo por parametro em vez de ler as
' constantes, e por isso serve tanto ao painel quanto ao ponto de entrada
' simples. Devolve um recado pronto para mostrar.

Public Function MontarCamisas(ByVal lista As String, ByVal fonte As String, _
                              ByVal alturaNome As Double, ByVal alturaNumero As Double, _
                              ByVal larguraMax As Double, ByVal espaco As Double, _
                              ByVal centroX As Double, ByVal baseY As Double) As String
    Dim doc As Document
    Dim linhas As Variant
    Dim i As Long
    Dim nome As String
    Dim numero As String
    Dim prontos As Long
    Dim apertados As String
    Dim quanto As Double
    Dim sNome As Shape
    Dim sNumero As Shape
    Dim baseDoNome As Double

    Set doc = ActiveDocument
    If doc Is Nothing Then
        MontarCamisas = "Abra um documento antes."
        Exit Function
    End If
    If Len(Trim(fonte)) = 0 Then fonte = FONTE_NOME

    doc.Unit = cdrCentimeter

    ' Uma operacao so: o Corel desfaz tudo com um Ctrl+Z, e nao linha por linha.
    doc.BeginCommandGroup "Optimize: nomes e numeros"
    On Error GoTo Falhou

    linhas = Split(Replace(lista, vbCrLf, vbLf), vbLf)
    prontos = 0
    apertados = ""

    For i = LBound(linhas) To UBound(linhas)
        If SeparaLinha(CStr(linhas(i)), nome, numero) Then
            ' Uma pagina por jogador. A primeira aproveita a que ja esta aberta
            ' quando ela esta vazia; do contrario nasce uma nova, para a macro
            ' nunca escrever por cima do que a pessoa ja tinha desenhado.
            If prontos > 0 Or doc.ActivePage.Shapes.Count > 0 Then
                doc.AddPages 1
                doc.Pages(doc.Pages.Count).Activate
            End If
            doc.ActivePage.Name = nome & IIf(Len(numero) > 0, " " & numero, "")

            baseDoNome = baseY
            If Len(numero) > 0 Then
                Set sNumero = TextoNaAltura(numero, fonte, alturaNumero, centroX, baseY)
                baseDoNome = baseY + alturaNumero + espaco
            End If

            If Len(nome) > 0 Then
                Set sNome = TextoNaAltura(nome, fonte, alturaNome, centroX, baseDoNome)
                quanto = Condensa(sNome, larguraMax, centroX)
                If quanto < CONDENSA_MINIMA Then
                    apertados = apertados & vbCrLf & "   " & nome & _
                                " (" & Format(quanto * 100, "0") & "% da largura)"
                End If
            End If

            prontos = prontos + 1
        End If
    Next i

    doc.EndCommandGroup

    If Len(apertados) > 0 Then
        MontarCamisas = prontos & " camisa(s) prontas. Ficaram apertados alem do " & _
                        "limite de " & Format(CONDENSA_MINIMA * 100, "0") & "%:" & apertados
    Else
        MontarCamisas = prontos & " camisa(s) prontas."
    End If
    Exit Function

Falhou:
    doc.EndCommandGroup
    MontarCamisas = "Parou na linha " & (i + 1) & ": " & Err.Description & _
                    " - o que ja foi feito continua no documento, e um Ctrl+Z desfaz tudo."
End Function


'==================== OS PONTOS DE ENTRADA ====================
'
' Dois, de proposito.
'
' `Painel` abre a tela (PainelOptimize.frm) e e o caminho normal.
'
' `NomesENumeros` faz a mesma coisa por InputBox, sem tela nenhuma. Ele fica
' porque o painel e um UserForm, e UserForm depende de o import ter dado certo
' na maquina; enquanto o do painel nao for confirmado, este aqui sempre roda.
' Os dois chamam a MESMA `MontarCamisas`, entao nao ha duas regras da camisa.
'
' Sao tambem os dois nomes que aparecem em Ferramentas > Opcoes >
' Personalizacao > Comandos > Macros, para virar botao de barra ou atalho.

Public Sub Painel()
    If Not SistemaEstaLigado() Then
        MsgBox "O Optimize precisa estar aberto nesta maquina para esta macro rodar." & _
               vbCrLf & vbCrLf & "Abra o programa e tente de novo.", _
               vbExclamation, "Optimize nao encontrado"
        Exit Sub
    End If
    PainelOptimize.Show
End Sub

Public Sub NomesENumeros()
    Dim lista As String

    If Not SistemaEstaLigado() Then
        MsgBox "O Optimize precisa estar aberto nesta maquina para esta macro rodar." & _
               vbCrLf & vbCrLf & "Abra o programa e tente de novo.", _
               vbExclamation, "Optimize nao encontrado"
        Exit Sub
    End If

    lista = InputBox("Cole a lista, uma linha por jogador:" & vbCrLf & vbCrLf & _
                     "GABRIEL;10" & vbCrLf & "SA;7" & vbCrLf & "GONCALVES;23", _
                     "Nomes e numeros")
    If Len(Trim(lista)) = 0 Then Exit Sub

    MsgBox MontarCamisas(lista, FONTE_NOME, ALTURA_NOME_CM, ALTURA_NUMERO_CM, _
                         LARGURA_MAX_NOME_CM, ESPACO_ENTRE_CM, CENTRO_X_CM, BASE_Y_CM), _
           vbInformation, "Optimize"
End Sub
