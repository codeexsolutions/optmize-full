<?xml version="1.0"?>
<!--
  SONDA DO OPTIMIZE - registro dos dockers

  O QUE ESTA SENDO TESTADO
  ========================
  A primeira corrida da sonda mostrou que `type="browser"` e o Internet
  Explorer 11 (Trident/7.0, documentMode 11, sem ES6 e sem WebAssembly).

  Mas o CRLFRMWK.dll - o framework que le este arquivo e monta os dockers -
  registra DUAS fabricas de controle de navegador:

      browser_factory
      browserEdge_factory

  E a convencao de nomes bate exatamente com os `type` daqui: `checkButton`
  tem `checkButton_factory`, `container` tem `container_factory`, e assim por
  diante. Ou seja, `type="browserEdge"` deve existir e deve ser o controle
  moderno (Edge/WebView2), que e de onde vem os 150 simbolos de
  ICoreWebView2 que estao naquele mesmo DLL.

  Este arquivo esta com o docker apontado para `browserEdge`.

  O ENDERECO AGORA E O PROPRIO SERVIDOR
  =====================================
  O `href` aponta para `http://localhost:8000/sonda.html`, servido pelo
  Optimize a partir de `estatico/`. Isso resolve dois problemas de uma vez, e
  os dois foram medidos:

  1. CAMINHO. A primeira tentativa com `browserEdge` usava o `href` que
     funciona no controle antigo:

         href="[VGAppAddonsDir]/OptimizeSonda/sonda.html?tipo=browserEdge"

     e o docker abriu em ERR_FILE_NOT_FOUND - mensagem do Chromium, nao do
     IE, o que ja provou que o controle novo tinha subido. Ou o token
     `[VGAppAddonsDir]` so e expandido pelo controle antigo, ou o `?tipo=`
     atrapalha a resolucao de um `file:`. Servindo por HTTP, nao ha token nem
     caminho de disco para interpretar.

  2. CORS. Com a pagina em `file:` e a API em `http://localhost:8000`, o
     Chromium bloqueia a chamada (status 0) - o IE nao bloqueava, e por isso
     o problema so apareceu depois da troca de motor. Servida pelo proprio
     Optimize, a pagina fica na MESMA origem da API e nao ha o que liberar.
     Nenhuma regra de CORS precisou ser afrouxada no servidor.

  E este, alias, e o desenho definitivo: o docker de verdade vai apontar para
  `http://localhost:8000/app/encaixe`. Caminho de arquivo sai de cena.

  O preco: com o Optimize fora do ar o docker mostra erro de conexao. Para um
  docker que so serve para falar com o Optimize, isso e a mensagem certa.

  UMA TENTATIVA QUE NAO DEU CERTO, E POR QUE
  ==========================================
  Antes disto, a sonda registrava um SEGUNDO docker, com botao proprio, para
  o Edge - a ideia era ter os dois lado a lado e comparar numa reinicializacao
  so. O botao nunca apareceu no menu.

  A culpa nao era do `browserEdge`: e do `UserUI.xslt`, que so e aplicado UMA
  vez por workspace. O framework migra o menu de dockers para a configuracao
  do usuario e, dali em diante, e ela que manda. Conferido abrindo o
  `_default.cdws` (que e um ZIP) e lendo `content/workspace.xml`: o menu tem o
  botao do eCut e o nosso do IE, e nao tem o do Edge.

  Dai o desenho de agora: um docker so, e o teste feito trocando o `type` do
  controle que ja esta registrado. Este arquivo e relido a cada abertura do
  Corel; o UserUI, nao.

  Esqueleto vindo do exemplo oficial de addon da Corel
  (community.coreldraw.com/sdk/w/articles/173), sob licenca que permite
  trabalho derivado. Todos os GUIDs abaixo sao novos, gerados para o Optimize.

  Os dois GUIDs que NAO sao meus ficam como estavam, porque sao endereco fixo
  do proprio Corel: `dynamicCategory` e, no UserUI, o commandBar do menu
  Janela > Dockers.
-->

<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:frmwrk="Corel Framework Data">
  <xsl:output method="xml" encoding="UTF-8" indent="yes"/>

  <frmwrk:uiconfig>
    <frmwrk:applicationInfo userConfiguration="true" />
  </frmwrk:uiconfig>

  <!-- Copia tudo o que ja estava -->
  <xsl:template match="node()|@*">
    <xsl:copy>
      <xsl:apply-templates select="node()|@*"/>
    </xsl:copy>
  </xsl:template>

  <xsl:template match="uiConfig/items">
    <xsl:copy>
      <xsl:apply-templates select="node()|@*"/>

      <!-- ============ 1. O DOCKER DO IE (grupo de controle) ============ -->

      <itemData guid="571f7f95-9776-4a77-88be-bb910617c913" noBmpOnMenu="true"
                type="checkButton"
                check="*Docker('457681d6-c236-4285-bce2-759efa56b601')"
                dynamicCategory="2cc24a3e-fe24-4708-9a74-9c75406eebcd"
                userCaption="Optimize (sonda IE)"
                enable="true"/>

      <!--
        AQUI ESTA O TESTE, E ELE MUDOU DE LUGAR

        A tentativa anterior registrava um SEGUNDO docker, com botao proprio,
        para o Edge. O botao nunca apareceu no menu - e nao por culpa do
        `browserEdge`.

        O motivo esta no workspace do usuario. O `UserUI.xslt` so e aplicado
        UMA vez: o framework migra o menu de dockers para a configuracao do
        usuario e, a partir dai, e ela que manda. Conferido abrindo o
        `_default.cdws` (que e um ZIP) e lendo o `content/workspace.xml`: o
        menu tem o botao do eCut e o nosso do IE, e nao tem o do Edge. O item
        novo simplesmente nao foi mesclado.

        Entao o teste passa a ser feito no controle que JA esta registrado. O
        `AppUI.xslt` e relido a cada abertura do Corel, ao contrario do
        UserUI: trocando so o `type` aqui, o botao e o docker continuam os
        mesmos (e continuam no menu), e o que muda e o motor de navegador
        dentro deles.

        Se abrir e a pagina disser Chrome/Edge no userAgent, `browserEdge` e
        o controle moderno e a tela do Optimize pode morar aqui.
        Se abrir em branco, ou nao abrir, o tipo nao serve - e volta para
        `type="browser"`, que sabemos que funciona.
      -->
      <!--
        DE VOLTA PARA `browser` (o IE), E DE PROPOSITO.

        A medicao fechou assim:

          type="browser"      Trident/IE11. Sem ES6, sem WebAssembly.
                              MAS `window.external.Application` funciona -
                              versao 26.2.0.170, documento ativo, selecao.

          type="browserEdge"  Chromium 152. ES6, WASM, Workers, 6 nucleos.
                              MAS sem acesso nenhum ao desenho:
                              `hostObjects` e `hostObjects.sync` vazios (so
                              `prototype`), e `window.external` e o esqueleto
                              padrao do Chromium (AddSearchProvider,
                              IsSearchProviderInstalled). A Corel nao
                              registrou objeto algum no controle novo.

        Entre um motor bom sem acesso ao desenho e um motor velho com acesso,
        o que serve para uma macro de encaixe e o segundo: o trabalho pesado
        vai para o servidor de qualquer jeito, e o que o docker precisa saber
        fazer e ler as curvas e devolver as posicoes - o que o IE faz.

        O `href` continua no servidor, e nao em `file:`. E o que faz o IE e o
        Optimize ficarem na MESMA origem, sem CORS para contornar.
      -->
      <itemData guid="b3c7dae8-67cf-42ca-a942-7e68ce8220aa"
                type="browser"
                href="http://localhost:8000/sonda.html"
                enable="true"
                appStyles="false" />

    </xsl:copy>
  </xsl:template>

  <xsl:template match="uiConfig/dockers">
    <xsl:copy>
      <xsl:apply-templates select="node()|@*"/>

      <dockerData guid="457681d6-c236-4285-bce2-759efa56b601"
                  userCaption="Optimize (sonda IE)"
                  wantReturn="true"
                  focusStyle="noThrow">
        <container>
          <item dock="fill" margin="0,0,0,0" guidRef="b3c7dae8-67cf-42ca-a942-7e68ce8220aa"/>
        </container>
      </dockerData>
    </xsl:copy>
  </xsl:template>
</xsl:stylesheet>
