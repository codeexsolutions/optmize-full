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
use std::sync::atomic::{AtomicBool, Ordering};
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

    /*
     * O NODE NÃO HERDA CONFIGURAÇÃO DE FORA.
     *
     * `NODE_OPTIONS=--require C:\qualquer.js`, posto nas variáveis do Windows,
     * faria o Node carregar um script alheio antes do servidor — e esse script
     * poderia remendar a trava da conta sem tocar em arquivo nenhum da
     * instalação, passando ao largo da conferência de integridade. O mesmo
     * vale para `NODE_EXTRA_CA_CERTS` (um certificado falso para fingir ser o
     * backend) e para as variáveis do próprio Optmize, como `OPTMIZE_BACKEND`.
     * Nenhuma delas tem uso na máquina do cliente: saem todas, e entram só as
     * que este programa define logo abaixo.
     */
    for (nome, _) in std::env::vars_os() {
        let maiusculo = nome.to_string_lossy().to_uppercase();
        if maiusculo.starts_with("NODE_")
            || maiusculo.starts_with("OPTMIZE_")
            || maiusculo.starts_with("OPTIMIZE_")
        {
            comando.env_remove(&nome);
        }
    }

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

/// Os argumentos do WebView2, iguais em TODAS as janelas.
///
/// As janelas do programa dividem o mesmo ambiente do WebView2, e o ambiente
/// nasce com os argumentos da PRIMEIRA janela criada. Uma segunda janela com
/// argumentos diferentes não abre. O lançador nasce primeiro, então ele leva
/// a mesma lista que a janela principal precisa (ver o comentário dela).
const ARGUMENTOS_DO_NAVEGADOR: &str =
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection \
     --force-prefers-no-reduced-motion";

/// O fundo de toda janela, igual ao `--bg` do sistema: sem ele o primeiro
/// quadro, antes de a página pintar, é branco.
const FUNDO: tauri::window::Color = tauri::window::Color(0x0b, 0x0b, 0x0c, 0xff);

/// O último estado mandado ao lançador, em JSON.
///
/// Guardado porque o Rust costuma falar ANTES de a página terminar de
/// carregar — e um `eval` numa página que ainda não existe se perde. Quando
/// ela carrega, recebe este estado e começa já no ponto certo.
static ESTADO_DO_LANCADOR: Mutex<String> = Mutex::new(String::new());

/// A janela principal já tomou o lugar do lançador?
///
/// O `on_page_load` dela roda a cada navegação (o login, um F5). Só a
/// PRIMEIRA carga fecha o lançador: depois disso, um lançador aberto é o da
/// instalação, e fechá-lo seria tirar o aviso da frente de quem espera.
static PRINCIPAL_ASSUMIU: AtomicBool = AtomicBool::new(false);

/// Mostra um estado no lançador (`empacotar/janela/lancador.html`).
///
/// O estado vira JSON, e não JavaScript montado à mão: parte dele vem do
/// servidor (o número da versão) e isto é um `eval`. JSON válido é expressão
/// JavaScript válida, com quebras de linha e aspas já escapadas.
fn lancador(app: &tauri::AppHandle, estado: serde_json::Value) {
    let texto = estado.to_string();
    *ESTADO_DO_LANCADOR.lock().unwrap() = texto.clone();
    if let Some(janela) = app.get_webview_window("lancador") {
        let _ = janela.eval(&format!("window.lancador && window.lancador({texto})"));
    }
}

/// Abre o lançador: a janelinha sem borda, no meio da tela, que aparece antes
/// do programa e na hora de instalar uma versão nova.
///
/// Nasce escondido e só aparece com a página pintada — o primeiro quadro que
/// existe já é a marca, e não um retângulo vazio.
fn abrir_lancador(app: &tauri::AppHandle) -> tauri::Result<()> {
    if let Some(janela) = app.get_webview_window("lancador") {
        let _ = janela.show();
        let _ = janela.set_focus();
        return Ok(());
    }
    let janela = WebviewWindowBuilder::new(app, "lancador", WebviewUrl::App("lancador.html".into()))
        .title("Optimize")
        .inner_size(640.0, 380.0)
        .resizable(false)
        .maximizable(false)
        .decorations(false)
        .shadow(true)
        .center()
        .visible(false)
        .background_color(FUNDO)
        .additional_browser_args(ARGUMENTOS_DO_NAVEGADOR)
        .on_page_load(|janela, carga| {
            if carga.event() == tauri::webview::PageLoadEvent::Finished {
                let estado = ESTADO_DO_LANCADOR.lock().unwrap().clone();
                if !estado.is_empty() {
                    let _ = janela.eval(&format!("window.lancador && window.lancador({estado})"));
                }
                let _ = janela.show();
                // Com o programa aberto ele nasce atrás da janela maximizada;
                // a pergunta de atualizar tem de vir para a frente.
                let _ = janela.set_focus();
            }
        })
        .build()?;
    #[cfg(windows)]
    icone_da_barra(&janela);
    #[cfg(not(windows))]
    let _ = janela;
    Ok(())
}

/// Abre a janela principal em `url` e, quando ela tiver pintado, fecha o
/// lançador.
///
/// `cheia` é o sistema, maximizado. As páginas de erro (`erro.html`,
/// `alterado.html`) abrem no tamanho normal: são um texto para ler, e em tela
/// cheia ficariam um parágrafo perdido no meio do monitor.
fn abrir_principal(app: &tauri::AppHandle, url: WebviewUrl, cheia: bool) -> tauri::Result<()> {
    let janela = WebviewWindowBuilder::new(app, "principal", url)
        .title("Optimize")
        /*
         * SEM A BARRA DO WINDOWS no programa (`cheia`): o nome já está na
         * barra lateral, e minimizar, maximizar e fechar moram na barra
         * própria do topo (`src/casca/BarraDaJanela.tsx`), que fala com a
         * janela pelas permissões de `capabilities/principal.json`. As
         * páginas de erro mantêm a borda: elas não têm a barra própria, e
         * sem borda ninguém conseguiria fechá-las.
         */
        .decorations(!cheia)
        .inner_size(1360.0, 900.0)
        .min_inner_size(1024.0, 640.0)
        .center()
        /*
         * MAXIMIZADA DESDE O PRIMEIRO QUADRO, e escondida até pintar: nascer
         * num tamanho e pular para a tela inteira depois eram duas mudanças
         * bruscas no mesmo instante.
         */
        .maximized(cheia)
        .visible(false)
        .background_color(FUNDO)
        // Sem isto, arrastar arquivo para dentro da janela não faz nada: o
        // Tauri intercepta o arrastar-e-soltar do Windows antes da página, e os
        // eventos `drop` do HTML nunca chegam ao Encaixe nem ao Vetor.
        .disable_drag_drop_handler()
        /*
         * AS ANIMAÇÕES NÃO DEPENDEM DE UMA CAIXA DO WINDOWS.
         *
         * O WebView2 responde `prefers-reduced-motion: reduce` sempre que
         * "Mostrar animações no Windows" está desligado — e no Windows 10 isso
         * vem desligado em muita máquina que ninguém escolheu. O programa
         * inteiro ficava parado. `--force-prefers-no-reduced-motion` faz a
         * página ver "sem preferência"; as outras três são as que o wry já
         * passa por conta própria — definir a lista substitui a dele.
         */
        .additional_browser_args(ARGUMENTOS_DO_NAVEGADOR)
        .on_page_load(|janela, carga| {
            if carga.event() != tauri::webview::PageLoadEvent::Finished {
                return;
            }
            let _ = janela.show();
            if !PRINCIPAL_ASSUMIU.swap(true, Ordering::SeqCst) {
                let _ = janela.set_focus();
                if let Some(lancador) = janela.app_handle().get_webview_window("lancador") {
                    let _ = lancador.close();
                }
            }
        })
        .build()?;

    // Depois de a janela existir: é ela que carrega o WebView2 a quem as
    // permissões são respondidas.
    #[cfg(windows)]
    {
        responder_permissoes(&janela);
        icone_da_barra(&janela);
    }
    #[cfg(not(windows))]
    let _ = janela;
    Ok(())
}

/// O que mudou desde a última abertura: `"primeira"`, `"atualizado"` ou nada.
///
/// Guarda a versão de cada abertura num arquivo da pasta de dados. É o que
/// deixa o lançador dizer "Atualizado da 1.2.0 para a 1.2.1" na volta de uma
/// instalação, em vez de o programa simplesmente reabrir sem explicar.
fn novidade_da_abertura(dados: &std::path::Path, atual: &str) -> (Option<&'static str>, Option<String>) {
    let arquivo = dados.join("ultima-versao.txt");
    let anterior = std::fs::read_to_string(&arquivo).ok().map(|t| t.trim().to_string());
    let _ = std::fs::write(&arquivo, atual);
    match anterior {
        None => (Some("primeira"), None),
        Some(v) if v != atual && !v.is_empty() => (Some("atualizado"), Some(v)),
        _ => (None, None),
    }
}

type Falha = Box<dyn std::error::Error>;

/// Pergunta ao servidor se há versão nova. `None` é o caso de quase sempre.
///
/// A ASSINATURA É QUEM MANDA: o plugin confere a assinatura minisign do
/// instalador com a `pubkey` do `tauri.conf.json` e recusa o que não bate. O
/// servidor diz ONDE está o instalador; quem diz se ele é legítimo é a chave
/// compilada dentro deste binário.
fn buscar_versao_nova(
    app: &tauri::AppHandle,
    espera: Duration,
) -> Result<Option<tauri_plugin_updater::Update>, Falha> {
    use tauri_plugin_updater::UpdaterExt;
    let mut construtor = app.updater_builder().timeout(espera);
    /*
     * SÓ MÁQUINA VINCULADA A UMA CONTA RECEBE ATUALIZAÇÃO.
     *
     * O servidor responde "está atualizado" a quem não manda o token da
     * máquina (ver `releases.routes.ts`, no backend). O token é o mesmo que o
     * servidor local guarda ao entrar na conta. Sem ele — primeira abertura,
     * conta que saiu —, a busca segue sem cabeçalho e não acha nada; quem
     * entrar na conta recebe a versão nova na busca seguinte.
     */
    if let Some(token) = token_da_maquina(app) {
        construtor = construtor.header("Authorization", format!("Bearer {token}"))?;
    }
    let updater = construtor.build()?;
    Ok(tauri::async_runtime::block_on(updater.check())?)
}

/// O token da máquina, como o servidor local o gravou (`servidor/sessao.js`).
///
/// O arquivo e o campo `token` são contrato com aquele arquivo. Qualquer
/// problema — não existe, não é JSON, não tem token — é o mesmo que não ter
/// entrado na conta.
fn token_da_maquina(app: &tauri::AppHandle) -> Option<String> {
    let dados = dunce::simplified(&app.path().app_data_dir().ok()?).to_path_buf();
    let texto = std::fs::read_to_string(dados.join("sessao").join("sessao.json")).ok()?;
    let json: serde_json::Value = serde_json::from_str(&texto).ok()?;
    let token = json.get("token")?.as_str()?;
    // Só o que pode ir num cabeçalho: um token de verdade é base64url.
    let limpo = token
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    (limpo && !token.is_empty()).then(|| token.to_string())
}

/// A impressão digital dos arquivos do instalador, gerada no build por
/// `empacotar/integridade.js`. Uma linha por arquivo: `<sha256> <caminho>`.
#[cfg(not(debug_assertions))]
const INTEGRIDADE: &str = include_str!("../integridade.txt");

/// Os arquivos de código da instalação são os que saíram no instalador?
///
/// É o que impede a trava da conta de ser tirada remendando um arquivo: o
/// servidor em bytecode, uma dependência, o próprio `node.exe`. Para burlar,
/// seria preciso remendar ESTE executável, que é código nativo — e não um
/// arquivo ao lado dele.
///
/// `Err` traz o arquivo que não bateu (ou que sumiu), para o log.
#[cfg(not(debug_assertions))]
fn conferir_integridade(pasta: &std::path::Path) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    use std::io::Read;

    let mut pedaco = vec![0u8; 1 << 20];
    for linha in INTEGRIDADE.lines() {
        let Some((esperado, relativo)) = linha.split_once(' ') else {
            continue;
        };
        let mut arquivo =
            std::fs::File::open(pasta.join(relativo)).map_err(|_| relativo.to_string())?;
        let mut soma = Sha256::new();
        loop {
            let lidos = arquivo.read(&mut pedaco).map_err(|_| relativo.to_string())?;
            if lidos == 0 {
                break;
            }
            soma.update(&pedaco[..lidos]);
        }
        let obtido: String = soma.finalize().iter().map(|b| format!("{b:02x}")).collect();
        if obtido != esperado {
            return Err(relativo.to_string());
        }
    }
    Ok(())
}

/// Baixa o instalador, avisando a porcentagem a cada número novo.
///
/// O aviso recebe `None` quando o servidor não diz o tamanho total — aí a
/// tela mostra uma barra correndo, em vez de um número inventado. Só chama
/// quando o número MUDA: o plugin entrega pedaços de poucos KB, e um `eval`
/// por pedaço seriam milhares de repinturas por um download.
fn baixar(
    atualizacao: &tauri_plugin_updater::Update,
    mut aviso: impl FnMut(Option<u64>),
) -> Result<Vec<u8>, Falha> {
    let mut baixado = 0u64;
    let mut ultimo: Option<Option<u64>> = None;
    let pacote = tauri::async_runtime::block_on(atualizacao.download(
        |pedaco: usize, total: Option<u64>| {
            baixado += pedaco as u64;
            let por_cento = total.filter(|t| *t > 0).map(|t| (baixado * 100 / t).min(100));
            if ultimo != Some(por_cento) {
                ultimo = Some(por_cento);
                aviso(por_cento);
            }
        },
        || {},
    ))?;
    Ok(pacote)
}

/// Desliga o servidor e entrega a vez ao instalador. Não volta.
///
/// BAIXAR E INSTALAR SÃO DOIS PASSOS, e não o `download_and_install`. No
/// Windows o `install` do plugin abre o instalador e encerra o programa na
/// hora, com `std::process::exit(0)`. Isso pula o `RunEvent::Exit` lá embaixo
/// — o único lugar que matava o `node.exe` filho. Era esse o "conflito" de
/// toda atualização: o Node ficava órfão, segurando os arquivos de
/// `servidor\`, e o instalador não conseguia sobrescrevê-los.
///
/// O instalador roda em silêncio (`/S /UPDATE /R`) e reabre o programa.
fn instalar(
    app: &tauri::AppHandle,
    atualizacao: &tauri_plugin_updater::Update,
    pacote: Vec<u8>,
) -> Result<(), Falha> {
    if let Some(processo) = app.state::<Servidor>().0.lock().unwrap().as_mut() {
        let _ = processo.kill();
        let _ = processo.wait();
    }
    atualizacao.install(pacote)?;
    Ok(())
}

/// O estado `base` com os campos de `extra` por cima.
fn com(base: &serde_json::Value, extra: serde_json::Value) -> serde_json::Value {
    let mut e = base.clone();
    if let (Some(e), Some(extra)) = (e.as_object_mut(), extra.as_object()) {
        for (chave, valor) in extra {
            e.insert(chave.clone(), valor.clone());
        }
    }
    e
}

/// Onde a resposta do lançador chega: `true` é "Atualizar agora".
///
/// Existe só enquanto há uma pergunta na tela. Um clique fora de hora (duplo
/// clique, a página recarregada) encontra o lugar vazio e não faz nada.
static RESPOSTA: Mutex<Option<std::sync::mpsc::Sender<bool>>> = Mutex::new(None);

/// Os botões do lançador chamam isto (`responder` em `lancador.html`).
///
/// Só o lançador alcança este comando: ele é a única janela servida pelo
/// próprio Tauri. A janela do sistema vem de `http://127.0.0.1`, uma origem
/// remota, e não fala com o IPC.
#[tauri::command]
fn responder_atualizacao(agora: bool) {
    if let Some(resposta) = RESPOSTA.lock().unwrap().take() {
        let _ = resposta.send(agora);
    }
}

/// O tamanho do lançador: maior enquanto pergunta, para caber a lista do que
/// mudou; o de sempre nas outras fases.
fn medir_lancador(app: &tauri::AppHandle, perguntando: bool) {
    if let Some(janela) = app.get_webview_window("lancador") {
        let alto = if perguntando { 560.0 } else { 380.0 };
        let _ = janela.set_size(tauri::LogicalSize::new(640.0, alto));
        let _ = janela.center();
    }
}

/// Mostra no lançador a versão nova, as correções e as adições, e espera a
/// pessoa escolher entre "Atualizar agora" e "Depois".
///
/// SEMPRE PERGUNTA. Atualizar reinicia o programa, e quem decide a hora de
/// parar é quem está trabalhando — na abertura e com o programa aberto. As
/// notas vêm do servidor (`notes` da release), escritas pelo lançamento a
/// partir dos commits (ver `empacotar/notas-do-lancamento.js`).
///
/// Lançador fechado sem resposta (Alt+F4) conta como "Depois".
fn perguntar(
    app: &tauri::AppHandle,
    base: &serde_json::Value,
    atualizacao: &tauri_plugin_updater::Update,
) -> bool {
    use std::sync::mpsc::{channel, RecvTimeoutError};

    let (envia, recebe) = channel();
    *RESPOSTA.lock().unwrap() = Some(envia);

    lancador(
        app,
        com(base, serde_json::json!({
            "fase": "pergunta",
            "versaoNova": atualizacao.version,
            "notas": atualizacao.body,
        })),
    );
    if abrir_lancador(app).is_err() {
        RESPOSTA.lock().unwrap().take();
        return false;
    }
    medir_lancador(app, true);

    let agora = loop {
        match recebe.recv_timeout(Duration::from_millis(500)) {
            Ok(agora) => break agora,
            Err(RecvTimeoutError::Timeout) if app.get_webview_window("lancador").is_some() => {}
            Err(_) => break false,
        }
    };
    RESPOSTA.lock().unwrap().take();
    medir_lancador(app, false);
    agora
}

/// Baixa e instala, contando o progresso no lançador. Não volta quando dá
/// certo: o programa se encerra para o instalador trabalhar.
fn baixar_e_instalar(
    app: &tauri::AppHandle,
    base: &serde_json::Value,
    atualizacao: &tauri_plugin_updater::Update,
) -> Result<(), Falha> {
    let nova = atualizacao.version.clone();

    /*
     * O PROGRESSO VAI PARA A TELA. São dezenas de MB, e numa internet de
     * gráfica isso pode levar um minuto. Sem número na tela, um minuto de
     * marca parada é indistinguível de travado — e é nesse minuto que alguém
     * desliga o computador no botão, no meio de uma instalação.
     */
    lancador(app, com(base, serde_json::json!({ "fase": "baixando", "versaoNova": nova })));
    let pacote = baixar(atualizacao, |por_cento| {
        lancador(
            app,
            com(base, serde_json::json!({ "fase": "baixando", "versaoNova": nova, "porcento": por_cento })),
        );
    })?;

    lancador(app, com(base, serde_json::json!({ "fase": "instalando", "versaoNova": nova })));
    // Um instante para o aviso ser lido: depois do `install` a janela some, e
    // sem aviso a pessoa clica no ícone de novo no meio da instalação.
    std::thread::sleep(Duration::from_millis(1500));

    instalar(app, atualizacao, pacote)
}

/// Procura versão nova ANTES de o sistema aparecer e, havendo, pergunta.
///
/// Devolve `Ok(true)` quando instalou — e aí o programa já se encerrou para o
/// instalador trabalhar, e esta função não chega a devolver nada. "Depois"
/// devolve `Ok(false)` e o Optmize abre na versão instalada; a pergunta volta
/// na próxima abertura.
fn atualizar_na_abertura(app: &tauri::AppHandle, base: &serde_json::Value) -> Result<bool, Falha> {
    lancador(app, com(base, serde_json::json!({ "fase": "verificando" })));

    let Some(atualizacao) = buscar_versao_nova(app, ESPERA_DO_SERVIDOR_DE_VERSOES)? else {
        return Ok(false);
    };
    if !perguntar(app, base, &atualizacao) {
        return Ok(false);
    }
    baixar_e_instalar(app, base, &atualizacao)?;
    Ok(true)
}

/// De quanto em quanto tempo o programa aberto pergunta se há versão nova.
///
/// A abertura já perguntou; isto é para quem deixa o Optmize aberto o dia
/// inteiro. Vinte minutos põem a pergunta na tela no mesmo expediente em que
/// a versão foi lançada, sem que o servidor seja consultado a toda hora.
const INTERVALO_DA_BUSCA: Duration = Duration::from_secs(20 * 60);

/// Com o programa aberto a busca não segura a abertura de ninguém, então pode
/// esperar mais pelo servidor do que a busca da tela de abertura.
const ESPERA_EM_SEGUNDO_PLANO: Duration = Duration::from_secs(30);

/// Com o programa aberto, achou versão nova: o lançador aparece por cima,
/// com o que mudou, e pergunta.
///
/// "Depois" fecha o lançador e a pessoa segue trabalhando; a mesma versão não
/// é perguntada de novo nesta sessão (`recusada`) — volta na próxima
/// abertura, ou antes, se sair uma versão mais nova ainda. "Atualizar agora"
/// esconde o sistema e o lançador conta o download até o programa reabrir.
fn atualizar_com_o_programa_aberto(
    app: &tauri::AppHandle,
    janela: &tauri::WebviewWindow,
    recusada: &mut Option<String>,
) -> Result<(), Falha> {
    let Some(atualizacao) = buscar_versao_nova(app, ESPERA_EM_SEGUNDO_PLANO)? else {
        return Ok(());
    };
    if recusada.as_deref() == Some(atualizacao.version.as_str()) {
        return Ok(());
    }

    let base = serde_json::json!({ "versao": app.package_info().version.to_string() });
    if !perguntar(app, &base, &atualizacao) {
        *recusada = Some(atualizacao.version.clone());
        if let Some(lancador) = app.get_webview_window("lancador") {
            let _ = lancador.close();
        }
        return Ok(());
    }

    let _ = janela.hide();
    baixar_e_instalar(app, &base, &atualizacao)
}

/// O laço que atende quem fica com o programa aberto. Não volta.
///
/// Uma falha (sem internet, servidor fora, download cortado) devolve o
/// sistema à tela e espera a próxima rodada: atualização nenhuma pode virar
/// erro na cara de quem está trabalhando.
fn vigiar_atualizacoes(app: tauri::AppHandle) {
    let mut recusada: Option<String> = None;
    loop {
        std::thread::sleep(INTERVALO_DA_BUSCA);
        let Some(janela) = app.get_webview_window("principal") else {
            return;
        };
        if let Err(erro) = atualizar_com_o_programa_aberto(&app, &janela, &mut recusada) {
            eprintln!("[atualizacao] {erro}");
            let _ = janela.show();
            if let Some(lancador) = app.get_webview_window("lancador") {
                let _ = lancador.close();
            }
        }
    }
}

fn main() {
    let processo: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        /*
         * O PLUGIN DE DIÁLOGO CONTINUA REGISTRADO, e de propósito.
         *
         * A pergunta de atualizar mora no lançador, e não numa caixa nativa. O
         * plugin fica porque é ele que serve `open`/`save` — o seletor de
         * arquivo que uma tela vai pedir no dia em que precisar —, e tirá-lo
         * para economizar alguns KB significaria devolvê-lo (e mexer nas
         * capabilities) na primeira vez que alguém quiser escolher uma pasta.
         */
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![responder_atualizacao])
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

            /*
             * A CONFERÊNCIA DOS ARQUIVOS corre em paralelo com tudo o mais —
             * são uns 150 MB para ler, e a busca de atualização e a subida do
             * Node levam esse tempo de qualquer jeito. O resultado é esperado
             * logo antes de mostrar o sistema.
             */
            #[cfg(not(debug_assertions))]
            let integridade = {
                let pasta = pasta.clone();
                std::thread::spawn(move || conferir_integridade(&pasta))
            };

            let porta = porta_livre()?;
            processo
                .lock()
                .unwrap()
                .replace(subir_servidor(&pasta, &dados, porta)?);

            /*
             * O LANÇADOR ABRE PRIMEIRO, já com a versão e a novidade (primeira
             * abertura, ou a volta de uma atualização). A janela do sistema só
             * nasce quando o servidor atende — e é ela que fecha o lançador.
             */
            let versao = app.package_info().version.to_string();
            let (novidade, anterior) = novidade_da_abertura(&dados, &versao);
            let base = serde_json::json!({
                "versao": versao,
                "novidade": novidade,
                "anterior": anterior,
            });
            lancador(app.handle(), {
                let mut e = base.clone();
                e["fase"] = "verificando".into();
                e
            });
            abrir_lancador(app.handle())?;

            // A espera vai para outra thread de propósito: esperar aqui dentro
            // seguraria o `setup`, e o loop de eventos só começa quando ele
            // termina — o lançador ficaria branco, sem pintar.
            let app = app.handle().clone();
            let abriu_em = Instant::now();
            std::thread::spawn(move || {
                let fase = |nome: &str| {
                    let mut e = base.clone();
                    e["fase"] = nome.into();
                    e
                };

                /*
                 * A BUSCA DE VERSÃO NOVA VEM ANTES DE TUDO: é o único momento
                 * em que não há trabalho na tela para perder.
                 *
                 * Falhou? Segue em frente. Sem internet ou com o servidor fora
                 * do ar, o Optmize abre na versão instalada — parar a produção
                 * por causa de uma atualização seria o erro maior.
                 */
                match atualizar_na_abertura(&app, &base) {
                    Ok(true) => return, // reiniciando; nada mais a fazer
                    Ok(false) => {}
                    Err(erro) => eprintln!("[atualizacao] {erro}"),
                }
                lancador(&app, fase("abrindo"));

                #[cfg(not(debug_assertions))]
                {
                    let alterado = match integridade.join() {
                        Ok(Ok(())) => None,
                        Ok(Err(arquivo)) => Some(arquivo),
                        Err(_) => Some(String::from("(a conferência falhou)")),
                    };
                    if let Some(arquivo) = alterado {
                        eprintln!("[integridade] arquivo diferente do instalador: {arquivo}");
                        // Sem servidor: um arquivo alterado não atende pedido nenhum.
                        if let Some(filho) = processo.lock().unwrap().as_mut() {
                            let _ = filho.kill();
                            let _ = filho.wait();
                        }
                        let _ = abrir_principal(&app, WebviewUrl::App("alterado.html".into()), false);
                        return;
                    }
                }

                let pronto = esperar_servidor(porta, &processo);

                if !pronto {
                    let _ = abrir_principal(&app, WebviewUrl::App("erro.html".into()), false);
                    return;
                }

                /*
                 * O PISO DE TEMPO DO LANÇADOR.
                 *
                 * Numa máquina rápida o servidor atende em menos de meio
                 * segundo, e o lançador piscava: aparecia e sumia antes de a
                 * marca terminar de entrar. Lê-se como algo que deu errado e
                 * foi refeito. Numa máquina lenta este piso não cobra nada,
                 * porque o servidor demora mais do que ele de todo jeito.
                 */
                const ABERTURA_MINIMA: Duration = Duration::from_millis(1800);
                if let Some(resto) = ABERTURA_MINIMA.checked_sub(abriu_em.elapsed()) {
                    std::thread::sleep(resto);
                }

                // A barra enche antes da troca: o fim tem de ser visto.
                lancador(&app, fase("pronto"));
                std::thread::sleep(Duration::from_millis(450));

                if let Ok(url) = format!("http://127.0.0.1:{porta}/").parse() {
                    if let Err(erro) = abrir_principal(&app, WebviewUrl::External(url), true) {
                        eprintln!("[janela] {erro}");
                    }
                }

                // Daqui em diante esta thread só cuida das versões novas que
                // saírem com o programa aberto.
                vigiar_atualizacoes(app);
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
