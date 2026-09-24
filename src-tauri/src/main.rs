// Sem console preto atrás da janela na versão instalada. No build de
// desenvolvimento o console fica, que é onde o servidor cospe os erros dele.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! ===========================================================================
//! OPTIMIZE — a casca de janela do sistema
//! ===========================================================================
//!
//! O sistema continua sendo o mesmo servidor Node + página web de sempre. Este
//! programa só faz três coisas:
//!
//!   1. sobe o `server.js` numa porta livre, com o Node que veio junto no
//!      instalador (o cliente não precisa ter Node instalado);
//!   2. espera essa porta atender e abre a janela nela;
//!   3. mata o servidor quando a janela fecha — senão o `node.exe` ficaria
//!      pendurado no Gerenciador de Tarefas depois de cada uso.
//!
//! Os dados NÃO ficam ao lado do programa. `C:\Program Files` é somente-leitura
//! para quem usa, então o banco e as imagens vão para a pasta de dados do
//! usuário, passada ao servidor em `OPTIMIZE_DADOS` (ver `caminhos.js`).

use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

/// Quanto esperar o servidor atender antes de desistir. O primeiro arranque é
/// o demorado: o Windows ainda está lendo do disco o Node e o node_modules
/// recém-instalados, e o SQLite cria o banco do zero.
const ESPERA_MAXIMA: Duration = Duration::from_secs(45);

/// O `node.exe` filho, guardado para ser morto na saída.
///
/// É `Arc` porque duas partes o alcançam: a saída do app, para matá-lo, e a
/// thread que espera o servidor subir, para desistir cedo se ele morreu.
struct Servidor(Arc<Mutex<Option<Child>>>);

/// Uma porta que ninguém está usando.
///
/// Pedir a porta 0 ao sistema e ler qual ele deu é o único jeito sem corrida:
/// escolher um número fixo e torcer para estar livre falha na máquina em que
/// alguma outra coisa já ocupou aquela porta.
fn porta_livre() -> std::io::Result<u16> {
    let ouvinte = TcpListener::bind("127.0.0.1:0")?;
    let porta = ouvinte.local_addr()?.port();
    drop(ouvinte);
    Ok(porta)
}

/// Bate na porta até o servidor atender. `false` = desistiu.
///
/// Também desiste na hora se o processo do servidor morreu — sem isso, um erro
/// de arranque do Node viraria 45 segundos de janela parada antes do aviso.
fn esperar_servidor(porta: u16, filho: &Mutex<Option<Child>>) -> bool {
    let limite = Instant::now() + ESPERA_MAXIMA;
    while Instant::now() < limite {
        if TcpStream::connect(("127.0.0.1", porta)).is_ok() {
            return true;
        }
        if let Ok(mut guarda) = filho.lock() {
            if let Some(processo) = guarda.as_mut() {
                if matches!(processo.try_wait(), Ok(Some(_))) {
                    return false;
                }
            }
        }
        std::thread::sleep(Duration::from_millis(80));
    }
    false
}

/// Sobe o `servidor/server.js` com o Node que veio junto.
fn subir_servidor(pasta: &PathBuf, dados: &PathBuf, porta: u16) -> std::io::Result<Child> {
    let mut comando = Command::new(pasta.join("node.exe"));
    comando
        .arg(pasta.join("servidor").join("server.js"))
        .current_dir(pasta)
        .env("PORT", porta.to_string())
        .env("OPTIMIZE_DADOS", dados);

    // A versão instalada não tem console (ver o atributo no topo do
    // arquivo), e um processo sem console não tem saída padrão válida para
    // o filho herdar. Sem isto o Node morre na largada tentando escrever
    // num identificador que não existe — silencioso, sem log nenhum — e a
    // janela fica presa em "abrindo" para sempre, porque a porta nunca
    // chega a atender. Redirigir para arquivo dá um identificador de
    // verdade e ainda deixa rastro para a próxima vez que algo travar assim.
    //
    // No build de desenvolvimento o processo que abre TEM console (quem
    // chama é `cargo`/`tauri dev`, de um terminal de verdade), e herdar dele
    // continua sendo o mais direto: é onde o servidor cospe os erros dele
    // enquanto se desenvolve.
    #[cfg(not(debug_assertions))]
    {
        use std::fs::File;
        use std::process::Stdio;
        comando
            .stdin(Stdio::null())
            .stdout(Stdio::from(File::create(dados.join("servidor-saida.log"))?))
            .stderr(Stdio::from(File::create(dados.join("servidor-erro.log"))?));
    }

    // CREATE_NO_WINDOW: sem isso o Node abre um console preto do lado da
    // janela toda vez que o app é aberto.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        comando.creation_flags(0x0800_0000);
    }

    comando.spawn()
}

/// Responde sozinho à caixa de permissão que o Chromium levanta no Exportar.
///
/// O Exportar em tamanho real pede a pasta de saída com `showDirectoryPicker`
/// (ver `escolherPastaDeSaida`, em src/producao/controlador.js). No navegador
/// isso são dois passos: a caixa do Windows, onde a pessoa escolhe a pasta, e
/// logo depois uma barra do próprio Chromium perguntando se aquela página pode
/// gravar ali. A segunda existe porque no navegador a página vem de um site
/// qualquer, e o Chromium não tem como saber de quem é.
///
/// Aqui ela não faz sentido nenhuma: a página é o próprio programa, servida do
/// 127.0.0.1 pelo servidor que este executável acabou de subir, e a pasta já
/// foi escolhida à mão na caixa do sistema no segundo anterior. O que sobra é
/// uma pergunta sobre "permissões do navegador" dentro de um programa que, para
/// quem usa, não tem navegador nenhum — e que aparece TODA vez que se exporta.
///
/// Então o WebView2 é respondido aqui, e não pela pessoa. Note o que isto NÃO
/// faz: não escolhe pasta, não abre arquivo e não dá acesso a nada que a caixa
/// do sistema não tenha entregado — quem aponta o destino continua sendo quem
/// está na frente da tela. Por isso a resposta é dada só a estas duas:
///
///   FILE_READ_WRITE              — gravar na pasta que a pessoa acabou de
///                                  escolher;
///   MULTIPLE_AUTOMATIC_DOWNLOADS — o mesmo Exportar, quando cai na pasta de
///                                  downloads: um rolo vira uma dezena de PDFs,
///                                  e a partir do segundo o Chromium pergunta
///                                  de novo.
///
/// Câmera, microfone, localização e o resto continuam sem resposta daqui, que é
/// o mesmo que continuarem perguntando.
#[cfg(windows)]
fn responder_permissoes(janela: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PERMISSION_KIND, COREWEBVIEW2_PERMISSION_KIND_FILE_READ_WRITE,
        COREWEBVIEW2_PERMISSION_KIND_MULTIPLE_AUTOMATIC_DOWNLOADS,
        COREWEBVIEW2_PERMISSION_STATE_ALLOW,
    };
    use webview2_com::PermissionRequestedEventHandler;

    let _ = janela.with_webview(|webview| unsafe {
        let Ok(nucleo) = webview.controller().CoreWebView2() else {
            return; // sem o núcleo não há o que assinar; a caixa volta a aparecer
        };
        let mut token = 0i64;
        let _ = nucleo.add_PermissionRequested(
            &PermissionRequestedEventHandler::create(Box::new(|_, argumentos| {
                let Some(argumentos) = argumentos else {
                    return Ok(());
                };
                let mut tipo = COREWEBVIEW2_PERMISSION_KIND::default();
                argumentos.PermissionKind(&mut tipo)?;
                if tipo == COREWEBVIEW2_PERMISSION_KIND_FILE_READ_WRITE
                    || tipo == COREWEBVIEW2_PERMISSION_KIND_MULTIPLE_AUTOMATIC_DOWNLOADS
                {
                    argumentos.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                }
                Ok(())
            })),
            &mut token,
        );
    });
}

/// Dá à janela o ícone GRANDE, que é o da barra de tarefas e do Alt+Tab.
///
/// O Windows guarda DOIS ícones por janela: o pequeno (`ICON_SMALL`), que vai
/// na barra de título, e o grande (`ICON_BIG`), que é o que a barra de tarefas
/// e o Alt+Tab desenham. São separados, e quem põe um não põe o outro.
///
/// O Tauri põe só o pequeno. A biblioteca de janela que ele usa por baixo tem
/// duas funções, `set_window_icon` e `set_taskbar_icon`, e só a primeira é
/// chamada — a segunda o Tauri nem expõe. Medido nesta janela, com o programa
/// aberto: `ICON_SMALL` trazia o logo certo, `ICON_BIG` e o ícone da classe
/// vinham zerados. Por isso o desenho aparecia no instalador e no arquivo, mas
/// não embaixo, com o programa rodando.
///
/// O ícone vem do recurso 32512 do próprio executável — o mesmo que o Explorer
/// lê para desenhar o `optimize.exe` e o atalho, posto ali pelo `tauri-build` a
/// partir do `icons/icon.ico`. Buscá-lo daí, e não de um arquivo ao lado,
/// garante que os dois nunca discordem: é um desenho só, num lugar só.
///
/// Os dois tamanhos são pedidos ao sistema (`SM_CXICON` e `SM_CXSMICON`) em vez
/// de fixados em 32 e 16, porque num monitor com escala eles não são 32 e 16 —
/// e pedir o tamanho certo faz o `.ico` entregar a imagem desenhada naquele
/// tamanho, em vez de uma esticada a partir de outra.
#[cfg(windows)]
fn icone_da_barra(janela: &tauri::WebviewWindow) {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, LoadImageW, SendMessageW, HICON, ICON_BIG, ICON_SMALL, IMAGE_ICON,
        LR_DEFAULTCOLOR, SM_CXICON, SM_CXSMICON, SM_CYICON, SM_CYSMICON, SYSTEM_METRICS_INDEX,
        WM_SETICON,
    };

    /// O `32512 ICON` do resource.rc que o tauri-build gera (é o IDI_APPLICATION).
    const RECURSO_DO_ICONE: PCWSTR = PCWSTR(32512 as *const u16);

    let Ok(hwnd) = janela.hwnd() else { return };

    unsafe {
        let Ok(modulo) = GetModuleHandleW(PCWSTR::null()) else {
            return;
        };

        let pendurar = |qual: u32, largura: SYSTEM_METRICS_INDEX, altura: SYSTEM_METRICS_INDEX| {
            let imagem = LoadImageW(
                Some(modulo.into()),
                RECURSO_DO_ICONE,
                IMAGE_ICON,
                GetSystemMetrics(largura),
                GetSystemMetrics(altura),
                LR_DEFAULTCOLOR,
            );
            if let Ok(imagem) = imagem {
                SendMessageW(
                    HWND(hwnd.0),
                    WM_SETICON,
                    Some(WPARAM(qual as usize)),
                    Some(LPARAM(HICON(imagem.0).0 as isize)),
                );
            }
        };

        pendurar(ICON_BIG, SM_CXICON, SM_CYICON);
        // O pequeno o Tauri já pôs, mas esticando o mesmo desenho de 32 px. Este
        // pede ao `.ico` a imagem de 16, que é desenhada para esse tamanho.
        pendurar(ICON_SMALL, SM_CXSMICON, SM_CYSMICON);
    }
}

/// Quanto tempo esperar o servidor de atualização responder.
///
/// A busca acontece com a tela de abertura na frente, então ela está no
/// caminho de quem quer usar o programa. Oito segundos é o bastante para uma
/// internet ruim de gráfica responder, e pouco o bastante para que um DNS
/// bloqueado ou um cabo solto não vire um programa que não abre.
///
/// Estourando o tempo, a busca falha e o Optmize abre na versão instalada —
/// que é a resposta certa: quem tem trabalho para entregar não pode ficar
/// parado porque o Railway não respondeu.
const ESPERA_DO_SERVIDOR_DE_VERSOES: Duration = Duration::from_secs(8);

/// Escreve um recado na tela de abertura.
///
/// A tela tem uma linha de texto ("Abrindo o sistema…") e uma função para
/// trocá-la (ver `empacotar/janela/index.html`). É por aqui que a busca de
/// versão nova conta o que está fazendo, em vez de deixar a pessoa olhando
/// uma marca parada sem saber por quê.
fn recado(janela: &tauri::WebviewWindow, texto: &str) {
    /*
     * O TEXTO VIRA UM LITERAL JSON, e não um pedaço de JavaScript montado à
     * mão.
     *
     * Parte do que passa por aqui vem DO SERVIDOR — o número da versão sai da
     * resposta do atualizador —, e isto é um `eval`. Escapar à mão a barra e
     * a aspa simples parecia bastar e não basta: falta a quebra de linha, que
     * encerra a instrução, e faltam `U+2028` e `U+2029`, que o JavaScript
     * trata como quebra de linha dentro de string.
     *
     * `serde_json::to_string` cobre os três e todo o resto, porque é a mesma
     * regra que o JSON usa — e JSON válido é expressão JavaScript válida.
     */
    let Ok(seguro) = serde_json::to_string(texto) else { return };
    let _ = janela.eval(&format!("window.recado && window.recado({seguro})"));
}


/// Procura versão nova e instala, ANTES de o sistema aparecer.
///
/// ---------------------------------------------------------------------------
/// POR QUE SÓ NA ABERTURA
/// ---------------------------------------------------------------------------
///
/// Aqui houve um laço que perguntava de cinco em cinco minutos com o programa
/// aberto, e uma rodada que instalava quinze segundos DEPOIS de a tela já estar
/// na cara da pessoa. O resultado era o pior dos dois mundos: o Optmize abria,
/// a pessoa começava a trabalhar, e então ele fechava para instalar.
///
/// Agora é como todo programa que se atualiza bem (o Discord é o exemplo que a
/// gráfica conhece): a busca acontece na tela de abertura, antes de existir
/// qualquer trabalho na tela. Se há versão nova, ela entra ali — não há nada
/// para perder. Se não há, o programa segue abrindo, e não se pergunta mais
/// nada até a próxima vez que alguém abrir o Optmize.
///
/// O QUE ISSO CUSTA: quem deixa o programa aberto a semana inteira fica na
/// versão instalada até fechar. É o preço de nunca interromper o expediente —
/// e a maioria fecha no fim do dia, e abre atualizada no dia seguinte.
///
/// ---------------------------------------------------------------------------
/// A ASSINATURA É QUEM MANDA
/// ---------------------------------------------------------------------------
///
/// O plugin confere a assinatura minisign do instalador com a `pubkey` do
/// `tauri.conf.json` e recusa o que não bate. O servidor diz ONDE está o
/// instalador; quem diz se ele é legítimo é a chave compilada dentro deste
/// binário.
///
/// Devolve `Ok(true)` quando instalou — e aí o programa já se encerrou para o
/// instalador trabalhar, e esta função não chega a devolver nada.
fn atualizar_na_abertura(
    app: &tauri::AppHandle,
    janela: &tauri::WebviewWindow,
) -> Result<bool, Box<dyn std::error::Error>> {
    use tauri_plugin_updater::UpdaterExt;

    recado(janela, "Buscando atualizações…");

    let updater = app
        .updater_builder()
        .timeout(ESPERA_DO_SERVIDOR_DE_VERSOES)
        .build()?;

    let Some(atualizacao) = tauri::async_runtime::block_on(updater.check())? else {
        return Ok(false); // nada novo — o caso de quase sempre
    };

    recado(
        janela,
        &format!("Atualizando para a versão {}…", atualizacao.version),
    );

    /*
     * O PROGRESSO VAI PARA A TELA.
     *
     * São ~96 MB, e numa internet de gráfica isso pode levar um minuto. Sem
     * número na tela, um minuto de marca parada é indistinguível de travado —
     * e é nesse minuto que alguém desliga o computador no botão, justamente no
     * meio de uma instalação.
     */
    let total_baixado = std::cell::Cell::new(0u64);
    let janela_do_progresso = janela.clone();

    /*
     * BAIXAR E INSTALAR SÃO DOIS PASSOS, e não o `download_and_install`.
     *
     * No Windows o `install` do plugin abre o instalador e encerra o programa
     * na hora, com `std::process::exit(0)`. Isso pula o `RunEvent::Exit` lá
     * embaixo — o único lugar que matava o `node.exe` filho. Era aqui o
     * "conflito" de toda atualização: o Node ficava órfão, segurando os
     * arquivos de `servidor\`, e o instalador não conseguia sobrescrevê-los.
     * O `app.restart()` que vinha depois nunca chegava a rodar.
     *
     * Separando os passos, o servidor morre entre um e outro, com o download
     * já conferido pela assinatura.
     */
    let pacote = tauri::async_runtime::block_on(atualizacao.download(
        |pedaco: usize, total: Option<u64>| {
            total_baixado.set(total_baixado.get() + pedaco as u64);
            let Some(total) = total.filter(|t| *t > 0) else { return };
            let por_cento = (total_baixado.get() * 100 / total).min(100);
            recado(
                &janela_do_progresso,
                &format!("Baixando a atualização… {por_cento}%"),
            );
        },
        || {},
    ))?;

    recado(janela, "Instalando… o Optmize reabre sozinho em instantes");

    if let Some(processo) = app.state::<Servidor>().0.lock().unwrap().as_mut() {
        let _ = processo.kill();
        let _ = processo.wait();
    }

    /*
     * Um instante para o recado ser lido. Depois do `install` a janela some e
     * o instalador trabalha em silêncio por alguns segundos antes de reabrir o
     * programa; sem aviso, a pessoa clica no ícone de novo no meio disso.
     */
    std::thread::sleep(Duration::from_millis(1500));

    // Não volta: abre o instalador (`/S /UPDATE /R`) e encerra o processo.
    atualizacao.install(pacote)?;
    Ok(true)
}

fn main() {
    let processo: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        /*
         * O PLUGIN DE DIÁLOGO CONTINUA REGISTRADO, e de propósito.
         *
         * A única caixa nativa que existia era a de atualizar, e ela saiu. O
         * plugin fica porque é ele que serve `open`/`save` — o seletor de
         * arquivo que uma tela vai pedir no dia em que precisar —, e tirá-lo
         * para economizar alguns KB significaria devolvê-lo (e mexer nas
         * capabilities) na primeira vez que alguém quiser escolher uma pasta.
         */
        .plugin(tauri_plugin_dialog::init())
        .manage(Servidor(processo.clone()))
        .setup(move |app| {
            // `resource_dir()`/`app_data_dir()` no Windows vêm no formato de
            // caminho estendido (`\\?\C:\...`, para driblar o limite de 260
            // caracteres). `dunce::simplified` devolve o mesmo lugar no
            // formato de sempre — sem isto o Node.js recebe `server.js` como
            // argumento e quebra tentando resolver o "C:" sozinho como se
            // fosse uma pasta, porque a lógica dele de caminho não reconhece
            // o prefixo estendido.
            let recursos = dunce::simplified(
                &app.path().resource_dir().expect("pasta de recursos"),
            )
            .to_path_buf();
            let pasta = recursos.join("servidor");

            let dados = dunce::simplified(
                &app.path().app_data_dir().expect("pasta de dados"),
            )
            .to_path_buf();
            std::fs::create_dir_all(&dados)?;

            let porta = porta_livre()?;
            processo
                .lock()
                .unwrap()
                .replace(subir_servidor(&pasta, &dados, porta)?);

            // A janela abre já, com o aviso de "abrindo", e troca para o
            // sistema quando o servidor responder. Abrir só no fim deixava
            // vários segundos de nada na tela — parecia que não tinha aberto.
            WebviewWindowBuilder::new(app, "principal", WebviewUrl::default())
                .title("Optimize")
                .inner_size(1360.0, 900.0)
                .min_inner_size(1024.0, 640.0)
                .center()
                /*
                 * MAXIMIZADA DESDE O PRIMEIRO QUADRO.
                 *
                 * Antes ela nascia com 1360x900 e o `maximize()` vinha lá na
                 * frente, junto com a navegação: a janela aparecia num tamanho,
                 * ficava alguns segundos assim e então pulava para a tela
                 * inteira ao mesmo tempo em que o conteúdo trocava. Eram duas
                 * mudanças bruscas no mesmo instante. Nascendo já maximizada não
                 * há pulo nenhum — e o `inner_size` acima continua valendo para
                 * quando a pessoa restaurar a janela.
                 */
                .maximized(true)
                /*
                 * NASCE ESCONDIDA, E APARECE QUANDO JÁ TEM O QUE MOSTRAR.
                 *
                 * Uma janela criada visível é desenhada pelo Windows antes de o
                 * WebView ter pintado qualquer coisa — é o lampejo de um
                 * retângulo vazio que se via no arranque. Escondida, o primeiro
                 * quadro que existe já é a marca. Quem a mostra é o
                 * `on_page_load` logo abaixo.
                 */
                .visible(false)
                /*
                 * O fundo da janela e do WebView, igual ao `--bg` do sistema e
                 * ao da tela de abertura. Enquanto o HTML não pintou, quem
                 * responde pelo pixel é esta cor — e sem ela o padrão é branco,
                 * que num programa escuro é um flash na cara de quem abre.
                 */
                .background_color(tauri::window::Color(0x0b, 0x0b, 0x0c, 0xff))
                // Sem isto, arrastar arquivo para dentro da janela não faz
                // nada: o Tauri intercepta o arrastar-e-soltar do Windows
                // antes da página, e os eventos `drop` do HTML nunca chegam
                // ao Encaixe nem ao Vetor. Desligado, quem recebe o arquivo é
                // a página — do mesmo jeito que no navegador.
                .disable_drag_drop_handler()
                /*
                 * Mostrar a janela quando a página termina de carregar, e não
                 * antes. Vale para a tela de abertura (é a primeira a carregar)
                 * e é inofensivo nas seguintes: mostrar o que já está visível
                 * não faz nada. Se por algum motivo este evento não vier, a
                 * thread de espera mostra a janela assim mesmo — uma janela
                 * escondida para sempre seria um programa que não abre.
                 */
                .on_page_load(|janela, carga| {
                    if carga.event() == tauri::webview::PageLoadEvent::Finished {
                        let _ = janela.show();
                    }
                })
                .build()?;

            // Depois de a janela existir: é ela que carrega o WebView2 a quem
            // as permissões são respondidas.
            #[cfg(windows)]
            if let Some(janela) = app.get_webview_window("principal") {
                responder_permissoes(&janela);
                icone_da_barra(&janela);
            }

            // A espera vai para outra thread de propósito: esperar aqui dentro
            // seguraria o `setup`, e o loop de eventos só começa quando ele
            // termina — a tela de "abrindo" ficaria branca, sem pintar, que é
            // exatamente o que ela existe para evitar.
            let app = app.handle().clone();
            let abriu_em = Instant::now();
            std::thread::spawn(move || {
                /*
                 * A BUSCA DE VERSÃO NOVA VEM ANTES DE TUDO.
                 *
                 * Antes de esperar o Node, antes de navegar: é o único momento
                 * em que não há trabalho na tela para perder. Se houver versão
                 * nova, o programa instala e reinicia aqui mesmo — e a pessoa
                 * vê a tela de abertura contando o que está acontecendo, em vez
                 * de ver o Optmize abrir e fechar sozinho um minuto depois.
                 *
                 * Falhou? Segue em frente. Sem internet ou com o servidor fora
                 * do ar, o Optmize abre na versão instalada — parar a produção
                 * por causa de uma atualização seria o erro maior.
                 */
                if let Some(janela) = app.get_webview_window("principal") {
                    match atualizar_na_abertura(&app, &janela) {
                        Ok(true) => return, // reiniciando; nada mais a fazer
                        Ok(false) => {}
                        Err(erro) => eprintln!("[atualizacao] {erro}"),
                    }
                    recado(&janela, "Abrindo o sistema…");
                }

                let pronto = esperar_servidor(porta, &processo);
                let Some(janela) = app.get_webview_window("principal") else {
                    return; // fecharam antes de abrir; não há o que mostrar
                };

                // A rede de segurança do `.visible(false)`: se o `on_page_load`
                // não veio, a janela aparece agora de qualquer jeito.
                let _ = janela.show();

                if !pronto {
                    /*
                     * Deu errado. A tela de erro é um texto para ler, não um
                     * painel de trabalho — em tela cheia ela fica um parágrafo
                     * perdido no meio do monitor. E não há o que suavizar aqui:
                     * quem está esperando o programa abrir precisa do recado
                     * agora, não de mais um terço de segundo de animação.
                     */
                    let _ = janela.unmaximize();
                    // A navegação exige URL absoluta. Resolver a página na
                    // origem da abertura funciona tanto no app quanto no dev.
                    if let Ok(abertura) = janela.url() {
                        if let Ok(url) = abertura.join("erro.html") {
                            let _ = janela.navigate(url);
                        }
                    }
                    return;
                }

                /*
                 * O PISO DE TEMPO DA ABERTURA.
                 *
                 * Numa máquina rápida o servidor atende em menos de meio
                 * segundo, e a tela de abertura era cortada no meio da própria
                 * entrada: a marca mal aparecia e já sumia. O efeito é pior do
                 * que não ter animação nenhuma — lê-se como um piscar, como se
                 * algo tivesse dado errado e sido refeito.
                 *
                 * Então a abertura tem um piso: se o servidor chega antes,
                 * espera-se o resto. Este número é o custo consciente de ter uma
                 * abertura bonita numa máquina boa; numa máquina lenta ele não
                 * cobra nada, porque o servidor demora mais do que ele de todo
                 * jeito. É aqui que se mexe para encurtar ou alongar.
                 */
                const ABERTURA_MINIMA: Duration = Duration::from_millis(1150);
                if let Some(resto) = ABERTURA_MINIMA.checked_sub(abriu_em.elapsed()) {
                    std::thread::sleep(resto);
                }

                /*
                 * A troca em si.
                 *
                 * Sem o aviso, `navigate` é um corte seco: a tela de abertura
                 * some no meio do que estiver fazendo e o sistema aparece de uma
                 * vez. O `encerrar()` dá a ela o tempo de se apagar, e como o
                 * fundo das duas é o mesmo `--bg`, o que se vê é o conteúdo
                 * trocando sobre um fundo parado.
                 *
                 * Os 340 ms são os `.34s` das transições do `index.html`, e os
                 * dois têm que andar juntos: menos aqui corta a saída pela
                 * metade, mais deixa um vazio no fim dela.
                 */
                let _ = janela.eval("window.encerrar && window.encerrar()");
                std::thread::sleep(Duration::from_millis(340));

                if let Ok(url) = format!("http://127.0.0.1:{porta}/").parse() {
                    let _ = janela.navigate(url);
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("erro ao montar o Optimize")
        .run(|app, evento| {
            // A janela fechou: o servidor vai junto. `kill` em processo que já
            // morreu devolve erro, e é um erro que não interessa a ninguém.
            if let RunEvent::Exit = evento {
                if let Some(processo) = app.state::<Servidor>().0.lock().unwrap().as_mut() {
                    let _ = processo.kill();
                    let _ = processo.wait();
                }
            }
        });
}
