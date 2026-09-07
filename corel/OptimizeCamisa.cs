// =============================================================================
// OPTIMIZE - nome e numero para camisa de time, dentro do CorelDRAW
// =============================================================================
//
// Isto e uma macro VSTA (C#), que e o motor de macro que o CorelDRAW 2025 usa.
// Ela estende a classe `Main` do projeto VSTAGlobal, que ja existe: `Main` e
// declarada `partial`, entao este arquivo entra ao lado do `Macro.cs` e enxerga
// o campo `app` de la sem precisar recebe-lo.
//
// COMO INSTALAR
//   1. No Corel: Ferramentas > Macros > Editor de macros (Alt+F11).
//   2. No Solution Explorer, com o botao direito no projeto: Add > Existing Item
//      (ou Add > Class e cole este conteudo por cima).
//   3. Salve e feche. A macro aparece em Ferramentas > Macros > Executar macro
//      como `CamisaDeTime`.
//
// O QUE ELA FAZ
//   Recebe uma lista de "nome;numero" e monta uma pagina por jogador, com o nome
//   em cima e o numero embaixo, nas medidas de verdade da camisa.
//
// COM A CAMISA MARCADA
//   Se houver alguma coisa selecionada quando a macro rodar, ela e a camisa: a
//   primeira da lista e escrita em cima dela mesma, e cada jogador seguinte
//   ganha uma COPIA dela numa pagina nova, com o nome e o numero trocados.
//
//   Marcar a camisa serve para duas coisas ao mesmo tempo. Uma e o desenho: as
//   copias saem com a arte junto, e nao so o texto solto. A outra e a MEDIDA -
//   o texto passa a ser posicionado a partir das bordas da camisa marcada, e
//   nao de um ponto fixo da pagina, e as alturas sao multiplicadas por quanto
//   ela e maior ou menor que a camisa de referencia. Marcou uma camisa de
//   crianca, sai tudo proporcional; nao marcou nada, e a pagina em branco de
//   sempre, nos centimetros escritos no painel.
//
//   Nome comprido e CONDENSADO - esmagado na horizontal, mantendo a altura.
//   Altura de nome e de numero e regra de uniforme, nao escolha de estetica:
//   diminuir a fonte de "GONCALVES" para ela caber deixaria a camisa dele com
//   letra menor que a do "SA", e as duas lado a lado na quadra denunciam.
//
// SEM System.Drawing, DE PROPOSITO
//   O .csproj do VSTAGlobal referencia System, System.Core, System.Windows.Forms,
//   System.Xml.Linq, System.Data, Microsoft.CSharp e o Corel.Interop.VGCore - e
//   mais nada. `System.Drawing` NAO esta la, entao `Point`, `Size` e `Font` nao
//   compilam. O painel e montado so com `Left`, `Top`, `Width` e `Height`, que
//   sao inteiros e nao dependem daquele assembly. Se um dia alguem acrescentar a
//   referencia, da para enfeitar; sem ela, isto e o que compila.
// =============================================================================

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Net;
using System.Text;
using System.Windows.Forms;
using Corel.Interop.VGCore;

namespace VSTAGlobal
{
    public partial class Main
    {
        // ==================== O QUE VOCE VAI QUERER AJUSTAR ====================
        //
        // Tudo que muda de time para time esta aqui. O painel abre com estes
        // valores nas caixas e so muda o que a pessoa mexer.

        private const string FonteCamisa = "Arial Black";
        private const double AlturaNomeCm = 6.0;
        private const double AlturaNumeroCm = 22.0;

        // 38 cm, e o numero saiu de medir no proprio Corel, nao de palpite.
        // Arial Black a 6 cm de altura desenha assim:
        //
        //   BRUNO         5 letras   31,8 cm     cabe inteiro
        //   GABRIEL       7 letras   39,5 cm     96% da largura
        //   GONCALVES     9 letras   55,2 cm     69%
        //   NASCIMENTO   10 letras   59,9 cm     63%
        //   VASCONCELOS  11 letras   67,5 cm     56%
        //
        // Com 30 cm - o primeiro valor que eu tinha chutado - "GONCALVES" caia
        // para 54% e disparava o aviso: um sobrenome comum reclamando a toa.
        private const double LarguraMaxNomeCm = 38.0;

        private const double EspacoEntreCm = 2.0;

        // Ate onde o nome pode ser esmagado. Abaixo disso a letra vira risco
        // vertical e ninguem le da arquibancada, entao a macro avisa em vez de
        // entregar calada. O par (38 cm, 55%) foi escolhido junto: aceita ate
        // onze letras e reclama da decima segunda.
        private const double CondensaMinima = 0.55;

        // Onde o texto cai quando NAO ha camisa marcada. Com uma camisa
        // marcada estes dois nao sao usados: o centro vem do centro dela, e a
        // base passa a ser medida a partir da barra dela, e nao da pagina.
        private const double CentroXCm = 25.0;
        private const double BaseYCm = 20.0;

        // ==================== COM A CAMISA MARCADA, A CONTA E SOZINHA ====================
        //
        // Ninguem deveria ter que pensar em centimetro nenhum para montar uma
        // camisa. Com uma camisa marcada, todos os numeros acima deixam de ser
        // digitados e passam a sair DELA, em proporcao - e as proporcoes abaixo
        // sao exatamente os centimetros de cima relidos sobre uma camisa adulta
        // de 70 cm de altura por 50 de largura:
        //
        //   numero    22 / 70 = 31%     da altura da camisa
        //   nome       6 / 70 =  8,6%
        //   espaco     2 / 70 =  2,9%
        //   base      20 / 70 = 29%     acima da barra
        //   folga    ( 50 - 38 ) / 2 / 50 = 12%   de cada lado
        //
        // Marcou uma camisa de crianca, tudo encolhe junto. Marcou uma de
        // adulto, sai o que ja estava afinado. Quem quiser mexer mexe, mas em
        // "Ajustes", e sobre numeros que ja vem prontos.
        private const double ParteAlturaNumero = 0.31;
        private const double ParteAlturaNome = 0.086;
        private const double ParteEspaco = 0.029;
        private const double ParteBase = 0.29;
        private const double ParteFolgaLado = 0.12;

        private const string EnderecoSistema =
            "http://localhost:8000/api/encaixe/guardado?chave=macro-corel";


        // ==================== A TRAVA: O SISTEMA TEM QUE ESTAR NO PC ====================
        //
        // A macro pergunta ao Optimize se ele esta de pe. Sem resposta, nao abre.
        //
        // O QUE ISTO E: uma trava contra copia casual. A macro sozinha, levada
        // para outra maquina, nao roda.
        //
        // O QUE ISTO NAO E: protecao contra quem sabe o que esta fazendo. Uma
        // chamada a localhost e facil de forjar. Se um dia precisar valer de
        // verdade, o caminho e a macro depender do sistema para alguma coisa que
        // ela nao saiba fazer sozinha - e nao de uma pergunta que ela mesma
        // poderia responder.
        private static bool SistemaEstaLigado()
        {
            try
            {
                var pedido = (HttpWebRequest)WebRequest.Create(EnderecoSistema);
                pedido.Method = "GET";
                // Curto de proposito: se o servico esta na maquina, ele responde
                // na hora. Espera longa so serve para travar o Corel quando ele
                // nao esta.
                pedido.Timeout = 1500;
                pedido.ReadWriteTimeout = 1500;

                using (var resposta = (HttpWebResponse)pedido.GetResponse())
                using (var leitor = new StreamReader(resposta.GetResponseStream()))
                {
                    string corpo = leitor.ReadToEnd();
                    // Nao basta "tem alguem na porta 8000": tem que ser este
                    // servidor, respondendo o JSON que so ele responde.
                    return resposta.StatusCode == HttpStatusCode.OK
                        && corpo.IndexOf("guardado", StringComparison.Ordinal) >= 0;
                }
            }
            catch
            {
                return false;
            }
        }


        // ==================== A LISTA DE JOGADORES ====================
        //
        // Uma linha por jogador, "nome;numero". O separador pode ser ponto e
        // virgula, virgula ou tabulacao - quem cola de uma planilha traz
        // tabulacao, e quem digita a mao costuma usar ponto e virgula.
        //
        // Linha em branco e pulada. Linha sem numero entra so com o nome, que e
        // o caso da camisa de comissao tecnica.
        private static bool SeparaLinha(string linha, out string nome, out string numero)
        {
            nome = "";
            numero = "";
            if (linha == null) return false;

            linha = linha.Trim();
            if (linha.Length == 0) return false;

            int onde = linha.IndexOfAny(new[] { ';', '\t', ',' });
            if (onde < 0)
            {
                nome = linha;
            }
            else
            {
                nome = linha.Substring(0, onde).Trim();
                numero = linha.Substring(onde + 1).Trim();
            }
            return nome.Length > 0 || numero.Length > 0;
        }

        // Numero digitado a mao, com a virgula do teclado brasileiro ou o ponto
        // que copiar-e-colar traz. Vazio ou torto cai no padrao, em vez de
        // derrubar a macro no meio da lista.
        private static double ParaNumero(string texto, double padrao)
        {
            if (string.IsNullOrEmpty(texto)) return padrao;
            string t = texto.Trim().Replace(',', '.');
            double v;
            if (!double.TryParse(t, NumberStyles.Any, CultureInfo.InvariantCulture, out v)) return padrao;
            return v;
        }


        // ==================== O DESENHO ====================

        // Cria um texto ja na altura pedida, centrado no x.
        //
        // A altura vem da CAIXA do texto desenhado, e nao do corpo da fonte:
        // duas fontes de mesmo corpo desenham alturas diferentes, e o que a
        // camisa exige e a letra medida com a regua.
        private Shape TextoNaAltura(Document doc, string texto, string fonte,
                                    double alturaCm, double centroX, double baseY)
        {
            Shape s = doc.ActiveLayer.CreateArtisticText(0, 0, texto);
            s.Text.Story.Font = fonte;
            s.Text.Story.Alignment = cdrAlignment.cdrCenterAlignment;

            if (s.SizeHeight > 0)
            {
                s.SetSize(s.SizeWidth * (alturaCm / s.SizeHeight), alturaCm);
            }

            s.CenterX = centroX;
            s.PositionY = baseY;
            return s;
        }

        // Esmaga o texto na horizontal ate caber na largura, mantendo a altura.
        // Devolve quanto ele ficou da largura natural (1 = nao precisou).
        private double Condensa(Shape s, double larguraMaxCm, double centroX)
        {
            if (s.SizeWidth <= larguraMaxCm || s.SizeWidth <= 0) return 1.0;

            double quanto = larguraMaxCm / s.SizeWidth;
            double altura = s.SizeHeight;
            // Largura nova, altura intacta: o esmagamento e so na horizontal.
            s.SetSize(larguraMaxCm, altura);
            s.CenterX = centroX;
            return quanto;
        }


        // ==================== A CAMISA MARCADA ====================
        //
        // O que a pessoa deixou selecionado antes de abrir o painel, mais as
        // medidas que interessam. As medidas sao lidas UMA VEZ, antes de a
        // macro comecar a criar paginas: criar e ativar pagina mexe na selecao,
        // e a partir da segunda camisa os numeros ja nao seriam os mesmos.
        private class Camisa
        {
            public ShapeRange Forma;
            public double CentroX;   // meio dela, na horizontal
            public double Esquerda;  // para recolocar a copia no mesmo ponto
            public double Barra;     // a borda de baixo: e dai que o texto sobe
            public double Largura;
            public double Altura;
        }

        // Os centimetros de verdade que a macro vai usar. Eles nascem prontos da
        // camisa marcada; o painel so os mostra, e aceita que sejam mudados.
        private class Medidas
        {
            public double AlturaNome, AlturaNumero, LarguraNome, Espaco;
            public double CentroX, BaseNumero;
        }

        // Le a selecao. Sem nada marcado devolve null, e a macro segue no modo
        // antigo - pagina em branco, texto nos centimetros do painel.
        private Camisa LerCamisaMarcada(Document doc)
        {
            ShapeRange marcada = doc.SelectionRange;
            if (marcada == null || marcada.Count == 0) return null;

            var c = new Camisa();
            c.Forma = marcada;
            c.CentroX = marcada.CenterX;
            c.Esquerda = marcada.PositionX;
            c.Barra = marcada.PositionY;
            c.Largura = marcada.SizeWidth;
            c.Altura = marcada.SizeHeight;
            return c;
        }

        // As medidas para a camisa marcada - ou, sem nenhuma, os centimetros
        // fixos de sempre, que e o que sobra quando nao ha de onde tirar.
        //
        // Repare que `CentroX` e `BaseNumero` saem daqui como coordenadas
        // ABSOLUTAS, ja somadas a posicao da camisa. E de proposito: assim o
        // resto da macro nao precisa saber que existe camisa marcada para
        // colocar o texto no lugar, e o painel mostra o numero que sera usado
        // de fato, e nao uma proporcao que a pessoa teria que imaginar.
        private Medidas MedidasPara(Camisa c)
        {
            var m = new Medidas();
            if (c == null)
            {
                m.AlturaNome = AlturaNomeCm;
                m.AlturaNumero = AlturaNumeroCm;
                m.LarguraNome = LarguraMaxNomeCm;
                m.Espaco = EspacoEntreCm;
                m.CentroX = CentroXCm;
                m.BaseNumero = BaseYCm;
                return m;
            }
            m.AlturaNome = c.Altura * ParteAlturaNome;
            m.AlturaNumero = c.Altura * ParteAlturaNumero;
            m.Espaco = c.Altura * ParteEspaco;
            m.CentroX = c.CentroX;
            m.BaseNumero = c.Barra + c.Altura * ParteBase;
            // O nome ocupa a largura da camisa menos a folga dos dois lados. E
            // so isso: nao existe largura "maxima" a escolher, existe o espaco
            // que a camisa tem.
            m.LarguraNome = c.Largura * (1.0 - 2.0 * ParteFolgaLado);
            return m;
        }

        // Uma copia da camisa marcada, na pagina que estiver ativa, no mesmo
        // lugar em que a original esta na dela.
        //
        // `Duplicate` nasce na camada da original, entao a copia precisa ser
        // mudada de camada; e como a mudanca de camada pode deslocar a forma, a
        // posicao e reposta a mao logo depois.
        private void CopiarCamisaPara(Camisa camisa, Document doc)
        {
            ShapeRange copia = camisa.Forma.Duplicate(0, 0);
            copia.MoveToLayer(doc.ActivePage.ActiveLayer);
            copia.PositionX = camisa.Esquerda;
            copia.PositionY = camisa.Barra;
        }

        // Uma frase para o painel dizer o que esta marcado, antes de a pessoa
        // clicar em Montar. Sem ela, "marcar a camisa" vira adivinhacao.
        private string DescreverMarcada(Camisa c)
        {
            try
            {
                if (app.ActiveDocument == null) return "Nenhum documento aberto.";
                if (c == null)
                {
                    return "Nada marcado: vai montar so o texto, uma pagina por jogador."
                        + Environment.NewLine
                        + "Para copiar a camisa, feche, selecione a arte dela e rode de novo.";
                }
                return "Camisa marcada: " + Math.Round(c.Largura, 1) + " x "
                    + Math.Round(c.Altura, 1) + " cm, em " + c.Forma.Count + " objeto(s)."
                    + Environment.NewLine
                    + "As medidas do texto ja saem dela - veja em Ajustes.";
            }
            catch (Exception erro)
            {
                return "Nao consegui ler a selecao: " + erro.Message;
            }
        }


        // ==================== A REGRA, PARAMETRIZADA ====================
        //
        // Aqui mora o desenho da camisa. Recebe tudo por parametro em vez de ler
        // as constantes, e por isso serve ao painel e a qualquer outra chamada.
        // Devolve um recado pronto para mostrar.
        public string MontarCamisas(string lista, string fonte, double alturaNome,
                                    double alturaNumero, double larguraMax, double espaco,
                                    double centroX, double baseY)
        {
            Document doc = app.ActiveDocument;
            if (doc == null) return "Abra um documento antes.";
            if (string.IsNullOrEmpty(fonte == null ? null : fonte.Trim())) fonte = FonteCamisa;

            doc.Unit = cdrUnit.cdrCentimeter;

            // Lida antes do primeiro AddPages: dai para frente a selecao ja nao
            // e mais a que a pessoa fez. Aqui ela serve so para COPIAR a arte -
            // onde o texto vai, quem ja decidiu foi o `MedidasPara`, e veio
            // pronto nos parametros.
            Camisa camisa = LerCamisaMarcada(doc);

            // Uma operacao so: o Corel desfaz tudo com um Ctrl+Z, e nao linha
            // por linha.
            doc.BeginCommandGroup("Optimize: nomes e numeros");

            int prontos = 0;
            int linhaAtual = 0;
            var apertados = new StringBuilder();

            try
            {
                string[] linhas = lista.Replace("\r\n", "\n").Split('\n');
                for (int i = 0; i < linhas.Length; i++)
                {
                    linhaAtual = i + 1;
                    string nome, numero;
                    if (!SeparaLinha(linhas[i], out nome, out numero)) continue;

                    // Uma pagina por jogador.
                    //
                    // Com uma camisa marcada, o primeiro jogador e escrito em
                    // cima dela mesma, onde ela ja esta - e por isso que a
                    // pagina dela nao conta como "ja tem desenho". Do segundo em
                    // diante nasce uma pagina nova e a camisa e copiada para la.
                    //
                    // Sem camisa marcada continua valendo a regra antiga: a
                    // primeira aproveita a pagina aberta se ela estiver vazia,
                    // para a macro nunca escrever por cima do que a pessoa ja
                    // tinha desenhado.
                    bool paginaNova = camisa != null
                        ? prontos > 0
                        : (prontos > 0 || doc.ActivePage.Shapes.Count > 0);
                    if (paginaNova)
                    {
                        doc.AddPages(1);
                        doc.Pages[doc.Pages.Count].Activate();
                        if (camisa != null) CopiarCamisaPara(camisa, doc);
                    }
                    doc.ActivePage.Name = numero.Length > 0 ? nome + " " + numero : nome;

                    double baseDoNome = baseY;
                    if (numero.Length > 0)
                    {
                        TextoNaAltura(doc, numero, fonte, alturaNumero, centroX, baseY);
                        baseDoNome = baseY + alturaNumero + espaco;
                    }

                    if (nome.Length > 0)
                    {
                        Shape sNome = TextoNaAltura(doc, nome, fonte, alturaNome, centroX, baseDoNome);
                        double quanto = Condensa(sNome, larguraMax, centroX);
                        if (quanto < CondensaMinima)
                        {
                            apertados.Append(Environment.NewLine + "   " + nome
                                + " (" + Math.Round(quanto * 100) + "% da largura)");
                        }
                    }

                    prontos++;
                }
            }
            catch (Exception erro)
            {
                doc.EndCommandGroup();
                return "Parou na linha " + linhaAtual + ": " + erro.Message
                    + " - o que ja foi feito continua no documento, e um Ctrl+Z desfaz tudo.";
            }

            doc.EndCommandGroup();

            string comQue = camisa == null
                ? " camisa(s) prontas (so o texto)."
                : " camisa(s) prontas, com a arte copiada em cada pagina.";

            if (apertados.Length > 0)
            {
                return prontos + comQue + " Ficaram apertados alem do limite de "
                    + Math.Round(CondensaMinima * 100) + "%:" + apertados;
            }
            return prontos + comQue;
        }


        // ==================== AS FONTES ====================
        //
        // A lista vem do proprio Corel, e nao do Windows. Duas razoes: o
        // `InstalledFontCollection` mora em `System.Drawing`, que nao esta
        // referenciado no projeto VSTA (ver a nota do topo); e a lista do Corel
        // e a certa de qualquer jeito, porque e ela que o documento aceita.
        private string[] ListaDeFontes()
        {
            var nomes = new List<string>();
            try
            {
                // Pelo enumerador, e nao por indice: assim nao importa se a
                // colecao do Corel comeca em 0 ou em 1.
                foreach (object item in app.FontList)
                {
                    string nome = Convert.ToString(item);
                    if (!string.IsNullOrEmpty(nome) && !nomes.Contains(nome)) nomes.Add(nome);
                }
            }
            catch (Exception)
            {
                // Sem a lista o painel ainda tem que abrir. Cai no `if` abaixo.
            }

            nomes.Sort(StringComparer.CurrentCultureIgnoreCase);
            if (nomes.Count == 0) nomes.Add(FonteCamisa);
            return nomes.ToArray();
        }


        // ==================== O PAINEL ====================
        //
        // WinForms montado em codigo, sem arquivo de designer: um .cs so, que da
        // para ler e versionar. Ver a nota do topo sobre System.Drawing - por
        // isso so `Left`, `Top`, `Width` e `Height` aparecem aqui.
        //
        // O QUE FICA A VISTA e a lista de jogadores e a fonte, e mais nada.
        // Montar uma camisa nao deveria exigir que alguem decidisse a altura do
        // numero em centimetros: com a camisa marcada, todos esses numeros ja
        // sairam dela. Eles continuam ali, atras de "Ajustes...", e ja chegam
        // preenchidos com o que vai ser usado de fato - quem quiser conferir ou
        // mexer, confere e mexe; quem nao quiser, nunca precisa abrir.

        // As caixas dos numeros, para o ponto de entrada poder le-las depois.
        private class Ajustes
        {
            public TextBox AlturaNome, AlturaNumero, LarguraNome, Espaco;
            public TextBox CentroX, BaseNumero;
        }

        private Form MontarPainel(Camisa camisa, Medidas medidas,
                                  out TextBox lista, out ComboBox fonte, out Ajustes ajustes,
                                  out Label recado, out Button montar)
        {
            var f = new Form();
            f.Text = "Optimize - nome e numero";
            f.Width = 620;
            f.Height = 560;
            f.FormBorderStyle = FormBorderStyle.FixedDialog;
            f.MaximizeBox = false;
            f.MinimizeBox = false;
            f.StartPosition = FormStartPosition.CenterScreen;

            // ---------- a lista ----------
            f.Controls.Add(Rotulo("Jogadores - uma linha por camisa, NOME;NUMERO", 12, 10, 340));
            lista = new TextBox();
            lista.Left = 12; lista.Top = 30; lista.Width = 340; lista.Height = 330;
            lista.Multiline = true;
            lista.ScrollBars = ScrollBars.Vertical;
            lista.AcceptsReturn = true;
            lista.Text = "GABRIEL;10" + Environment.NewLine
                       + "SA;7" + Environment.NewLine
                       + "GONCALVES;23";
            f.Controls.Add(lista);

            recado = new Label();
            recado.Left = 12; recado.Top = 368; recado.Width = 340; recado.Height = 58;
            recado.Text = "";
            f.Controls.Add(recado);

            montar = new Button();
            montar.Text = "Montar";
            montar.Left = 12; montar.Top = 432; montar.Width = 110; montar.Height = 30;
            f.Controls.Add(montar);
            f.AcceptButton = montar;

            var fechar = new Button();
            fechar.Text = "Fechar";
            fechar.Left = 132; fechar.Top = 432; fechar.Width = 110; fechar.Height = 30;
            fechar.Click += delegate { f.Close(); };
            f.Controls.Add(fechar);
            f.CancelButton = fechar;

            // ---------- a fonte ----------
            int x = 370;
            f.Controls.Add(Rotulo("Fonte", x, 10, 210));
            fonte = new ComboBox();
            fonte.Left = x; fonte.Top = 26; fonte.Width = 210;
            // `DropDownList`: escolher da lista, e nao digitar. Nome de fonte
            // digitado errado nao avisa - o Corel troca por outra calado, e a
            // camisa sai com a letra que ninguem pediu.
            fonte.DropDownStyle = ComboBoxStyle.DropDownList;
            foreach (string nome in ListaDeFontes()) fonte.Items.Add(nome);
            int qual = fonte.Items.IndexOf(FonteCamisa);
            if (qual < 0 && fonte.Items.Count > 0) qual = 0;
            if (qual >= 0) fonte.SelectedIndex = qual;
            f.Controls.Add(fonte);

            // ---------- o que esta marcado ----------
            var oQueEstaMarcado = new Label();
            oQueEstaMarcado.Left = x; oQueEstaMarcado.Top = 62;
            oQueEstaMarcado.Width = 215; oQueEstaMarcado.Height = 56;
            // Dito ANTES de a pessoa clicar em Montar, porque enquanto a macro
            // esta aberta o Corel nao aceita clique: a selecao tem que ter sido
            // feita antes, e so aqui da para saber se foi.
            oQueEstaMarcado.Text = DescreverMarcada(camisa);
            f.Controls.Add(oQueEstaMarcado);

            // ---------- os numeros, guardados ----------
            var abrir = new Button();
            abrir.Text = "Ajustes...";
            abrir.Left = x; abrir.Top = 122; abrir.Width = 110; abrir.Height = 26;
            f.Controls.Add(abrir);

            var caixa = new Panel();
            caixa.Left = x; caixa.Top = 156; caixa.Width = 225; caixa.Height = 285;
            caixa.Visible = false;
            f.Controls.Add(caixa);

            int y = 0;
            ajustes = new Ajustes();
            ajustes.AlturaNome = Campo(caixa, "Altura do nome (cm)", 0, ref y, 90,
                                       Texto(medidas.AlturaNome));
            ajustes.AlturaNumero = Campo(caixa, "Altura do numero (cm)", 0, ref y, 90,
                                         Texto(medidas.AlturaNumero));
            ajustes.LarguraNome = Campo(caixa, "Largura do nome (cm)", 0, ref y, 90,
                                        Texto(medidas.LarguraNome));
            ajustes.Espaco = Campo(caixa, "Espaco entre nome e numero (cm)", 0, ref y, 90,
                                   Texto(medidas.Espaco));
            ajustes.CentroX = Campo(caixa, "Centro do texto (cm)", 0, ref y, 90,
                                    Texto(medidas.CentroX));
            ajustes.BaseNumero = Campo(caixa, "Base do numero (cm)", 0, ref y, 90,
                                       Texto(medidas.BaseNumero));

            abrir.Click += delegate
            {
                caixa.Visible = !caixa.Visible;
                abrir.Text = caixa.Visible ? "Esconder ajustes" : "Ajustes...";
            };

            return f;
        }

        private static Label Rotulo(string texto, int x, int y, int larg)
        {
            var l = new Label();
            l.Text = texto;
            l.Left = x; l.Top = y; l.Width = larg; l.Height = 15;
            return l;
        }

        // Um rotulo e a caixa embaixo dele, empilhados. `y` anda sozinho, para a
        // ordem dos campos ser a ordem das chamadas e nao uma tabela de numeros.
        //
        // Recebe um `Control`, e nao um `Form`, para os campos poderem morar
        // dentro do painel de Ajustes - esconder um painel esconde tudo que esta
        // nele, rotulos junto.
        // Qualificado: `Control` sozinho e ambiguo, como o `Application` la
        // embaixo - `System.Windows.Forms` e `Corel.Interop.VGCore` tem cada um
        // uma classe com esse nome, e os dois estao no `using`.
        private static TextBox Campo(System.Windows.Forms.Control dono, string rotulo,
                                     int x, ref int y,
                                     int larg, string valor)
        {
            dono.Controls.Add(Rotulo(rotulo, x, y, 220));
            var t = new TextBox();
            t.Left = x; t.Top = y + 16; t.Width = larg;
            t.Text = valor;
            dono.Controls.Add(t);
            y += 45;
            return t;
        }

        // Uma casa decimal basta para centimetro de camisa, e um numero curto e
        // conferivel de relance - que e para isso que ele aparece.
        private static string Texto(double v)
        {
            return Math.Round(v, 1).ToString(CultureInfo.InvariantCulture);
        }


        // ==================== O PONTO DE ENTRADA ====================
        //
        // E este nome que aparece em Ferramentas > Macros > Executar macro, e e
        // ele que se arrasta para uma barra em Opcoes > Personalizacao >
        // Comandos > Macros para virar botao ou atalho.
        [CgsAddInMacro]
        public void CamisaDeTime()
        {
            if (!SistemaEstaLigado())
            {
                MessageBox.Show(
                    "O Optimize precisa estar aberto nesta maquina para esta macro rodar."
                    + Environment.NewLine + Environment.NewLine
                    + "Abra o programa e tente de novo.",
                    "Optimize nao encontrado", MessageBoxButtons.OK, MessageBoxIcon.Exclamation);
                return;
            }

            // A camisa marcada e as medidas dela, lidas antes de o painel abrir:
            // e o painel que precisa delas, para chegar com os numeros prontos.
            Camisa camisa = null;
            Document doc = app.ActiveDocument;
            if (doc != null)
            {
                doc.Unit = cdrUnit.cdrCentimeter;
                camisa = LerCamisaMarcada(doc);
            }
            Medidas medidas = MedidasPara(camisa);

            TextBox lista;
            ComboBox fonte;
            Ajustes ajustes;
            Label recado;
            Button montar;

            using (Form painel = MontarPainel(camisa, medidas, out lista, out fonte,
                                              out ajustes, out recado, out montar))
            {
                montar.Click += delegate
                {
                    if (lista.Text.Trim().Length == 0)
                    {
                        recado.Text = "Cole a lista de jogadores primeiro.";
                        return;
                    }

                    montar.Enabled = false;
                    recado.Text = "Montando...";
                    // Qualificado: `Application` sozinho e ambiguo aqui, porque
                    // `System.Windows.Forms` e `Corel.Interop.VGCore` tem cada um
                    // uma classe com esse nome, e os dois estao no `using`.
                    System.Windows.Forms.Application.DoEvents();

                    // O padrao de cada campo e a medida CALCULADA, e nao a
                    // constante do topo: se alguem apagar uma caixa em Ajustes,
                    // o que volta e o valor daquela camisa, e nao o de uma
                    // camisa generica que talvez nem seja esta.
                    recado.Text = MontarCamisas(
                        lista.Text, fonte.Text,
                        ParaNumero(ajustes.AlturaNome.Text, medidas.AlturaNome),
                        ParaNumero(ajustes.AlturaNumero.Text, medidas.AlturaNumero),
                        ParaNumero(ajustes.LarguraNome.Text, medidas.LarguraNome),
                        ParaNumero(ajustes.Espaco.Text, medidas.Espaco),
                        ParaNumero(ajustes.CentroX.Text, medidas.CentroX),
                        ParaNumero(ajustes.BaseNumero.Text, medidas.BaseNumero));

                    montar.Enabled = true;
                };

                painel.ShowDialog();
            }
        }
    }
}
