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

        private const double CentroXCm = 25.0;
        private const double BaseYCm = 20.0;

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

                    // Uma pagina por jogador. A primeira aproveita a que ja esta
                    // aberta quando ela esta vazia; do contrario nasce uma nova,
                    // para a macro nunca escrever por cima do que a pessoa ja
                    // tinha desenhado.
                    if (prontos > 0 || doc.ActivePage.Shapes.Count > 0)
                    {
                        doc.AddPages(1);
                        doc.Pages[doc.Pages.Count].Activate();
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

            if (apertados.Length > 0)
            {
                return prontos + " camisa(s) prontas. Ficaram apertados alem do limite de "
                    + Math.Round(CondensaMinima * 100) + "%:" + apertados;
            }
            return prontos + " camisa(s) prontas.";
        }


        // ==================== O PAINEL ====================
        //
        // WinForms montado em codigo, sem arquivo de designer: um .cs so, que da
        // para ler e versionar. Ver a nota do topo sobre System.Drawing - por
        // isso so `Left`, `Top`, `Width` e `Height` aparecem aqui.
        private Form MontarPainel(out TextBox lista, out TextBox fonte, out TextBox altNome,
                                  out TextBox altNumero, out TextBox largMax, out TextBox espaco,
                                  out TextBox centroX, out TextBox baseY, out Label recado,
                                  out Button montar)
        {
            var f = new Form();
            f.Text = "Optimize - nome e numero";
            f.Width = 620;
            f.Height = 470;
            f.FormBorderStyle = FormBorderStyle.FixedDialog;
            f.MaximizeBox = false;
            f.MinimizeBox = false;
            f.StartPosition = FormStartPosition.CenterScreen;

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

            int x = 370;
            int y = 10;
            fonte = Campo(f, "Fonte", x, ref y, 210, FonteCamisa);
            altNome = Campo(f, "Altura do nome (cm)", x, ref y, 90, Texto(AlturaNomeCm));
            altNumero = Campo(f, "Altura do numero (cm)", x, ref y, 90, Texto(AlturaNumeroCm));
            largMax = Campo(f, "Largura maxima do nome (cm)", x, ref y, 90, Texto(LarguraMaxNomeCm));
            espaco = Campo(f, "Espaco entre nome e numero (cm)", x, ref y, 90, Texto(EspacoEntreCm));
            centroX = Campo(f, "Centro X (cm)", x, ref y, 90, Texto(CentroXCm));
            baseY = Campo(f, "Base Y (cm)", x, ref y, 90, Texto(BaseYCm));

            recado = new Label();
            recado.Left = 12; recado.Top = 368; recado.Width = 340; recado.Height = 55;
            recado.Text = "";
            f.Controls.Add(recado);

            montar = new Button();
            montar.Text = "Montar";
            montar.Left = x; montar.Top = 375; montar.Width = 100; montar.Height = 28;
            f.Controls.Add(montar);
            f.AcceptButton = montar;

            var fechar = new Button();
            fechar.Text = "Fechar";
            fechar.Left = x + 110; fechar.Top = 375; fechar.Width = 100; fechar.Height = 28;
            fechar.Click += delegate { f.Close(); };
            f.Controls.Add(fechar);
            f.CancelButton = fechar;

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
        private static TextBox Campo(Form f, string rotulo, int x, ref int y, int larg, string valor)
        {
            f.Controls.Add(Rotulo(rotulo, x, y, 220));
            var t = new TextBox();
            t.Left = x; t.Top = y + 16; t.Width = larg;
            t.Text = valor;
            f.Controls.Add(t);
            y += 45;
            return t;
        }

        private static string Texto(double v)
        {
            return v.ToString(CultureInfo.InvariantCulture);
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

            TextBox lista, fonte, altNome, altNumero, largMax, espaco, centroX, baseY;
            Label recado;
            Button montar;

            using (Form painel = MontarPainel(out lista, out fonte, out altNome, out altNumero,
                                              out largMax, out espaco, out centroX, out baseY,
                                              out recado, out montar))
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

                    recado.Text = MontarCamisas(
                        lista.Text, fonte.Text,
                        ParaNumero(altNome.Text, AlturaNomeCm),
                        ParaNumero(altNumero.Text, AlturaNumeroCm),
                        ParaNumero(largMax.Text, LarguraMaxNomeCm),
                        ParaNumero(espaco.Text, EspacoEntreCm),
                        ParaNumero(centroX.Text, CentroXCm),
                        ParaNumero(baseY.Text, BaseYCm));

                    montar.Enabled = true;
                };

                painel.ShowDialog();
            }
        }
    }
}
