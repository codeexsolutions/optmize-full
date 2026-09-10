<?xml version="1.0"?>
<!--
  Poe o item no menu Janela > Dockers.

  O GUID do commandBar (3eaa9bbe-...) e do proprio Corel: e o menu de dockers.
  O guidRef e o do nosso botao, declarado no AppUI.xslt.
-->

<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:frmwrk="Corel Framework Data">
  <xsl:output method="xml" encoding="UTF-8" indent="yes"/>

  <frmwrk:uiconfig>
    <frmwrk:applicationInfo userConfiguration="true" />
    <frmwrk:compositeNode xPath="/uiConfig/commandBars/commandBarData[@guid='3eaa9bbe-28fd-4672-9128-02974ee96332']"/>
    <frmwrk:compositeNode xPath="/uiConfig/frame"/>
  </frmwrk:uiconfig>

  <xsl:template match="node()|@*">
    <xsl:copy>
      <xsl:apply-templates select="node()|@*"/>
    </xsl:copy>
  </xsl:template>

  <xsl:template match="commandBarData[@guid='3eaa9bbe-28fd-4672-9128-02974ee96332']/menu">
    <xsl:copy>
      <xsl:apply-templates select="node()|@*"/>
      <!--
        Um item so.

        Vale lembrar, para nao cair de novo: isto aqui roda UMA vez por
        workspace. O framework migra o menu para a configuracao do usuario e
        depois nao mescla mais nada - acrescentar um segundo item neste
        arquivo nao faz ele aparecer num workspace que ja foi migrado. Por
        isso o teste do `browserEdge` e feito trocando o `type` no AppUI, e
        nao registrando um docker novo aqui.
      -->
      <xsl:if test="not(./item[@guidRef='571f7f95-9776-4a77-88be-bb910617c913'])">
        <item guidRef="571f7f95-9776-4a77-88be-bb910617c913"/>
      </xsl:if>
    </xsl:copy>
  </xsl:template>
</xsl:stylesheet>
