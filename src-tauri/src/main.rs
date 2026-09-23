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

/// Quanto esperar antes da PRIMEIRA ida ao servidor.
///
/// Eram noventa segundos, e agora são quinze. A espera longa nasceu de duas
/// preocupações, e só uma delas se sustenta:
///
///   O ARRANQUE OCUPADO — o Node subindo, o SQLite abrindo o banco, o WebView
///   pintando a primeira tela. Isso dura segundos, não um minuto e meio;
///   quinze já deixam a consulta de rede fora do caminho de quem está
///   esperando a tela aparecer.
///
///   A TRAVA DA INSTALAÇÃO SOZINHA — esta continua sendo a razão de haver
///   QUALQUER espera aqui. A rodada da abertura instala sem perguntar, e o
///   tempo de programa vivo é o que prova que a versão instalada ABRE: sem
///   ele, uma versão quebrada a ponto de não subir instalaria a seguinte por
///   cima de um programa que nunca funcionou, e a loja entraria num laço de se
///   reinstalar sem ninguém para dizer não.
///
/// Quinze segundos ainda provam o que interessa: um programa que quebra no
/// arranque quebra nos primeiros segundos, antes do WebView pintar. O que se
/// perde é a prova contra uma quebra que aparece no minuto seguinte — e essa
/// nenhuma espera razoável pega.
const PRIMEIRA_CHECAGEM: Duration = Duration::from_secs(15);

/// De quanto em quanto tempo perguntar de novo.
///
/// O programa de uma produção fica aberto o dia inteiro — sem este laço, quem
/// nunca fecha o Optimize nunca receberia correção nenhuma.
///
/// Eram duas horas; agora são cinco minutos, para uma correção publicada
/// alcançar a gráfica enquanto ela ainda é a correção do problema que a pessoa
/// acabou de relatar ao telefone.
///
/// O QUE PAGA ESSA FREQUÊNCIA É A RESPOSTA VAZIA. Quando não há versão nova, o
/// servidor devolve `204 No Content` (ver `/app/update/tauri/...`, no backend):
/// nenhum corpo, nenhuma consulta ao Storage, nenhum byte de instalador. É uma
/// pergunta a cada cinco minutos, não um download.
///
/// E a caixa de perguntar NÃO volta a cada rodada: quem responde "agora não"
/// não é interrompido de novo pela mesma versão — ver `ULTIMA_RECUSADA`.
const INTERVALO_CHECAGEM: Duration = Duration::from_secs(5 * 60);

/// A versão que a pessoa dispensou.
///
/// Sem isto, perguntar de cinco em cinco minutos seria perseguição: quem
/// clicou "agora não" no meio de um encaixe levaria a mesma caixa na cara doze
/// vezes por hora, e a terceira já seria motivo para desligar a atualização
/// automática no grito.
///
/// Guardada a VERSÃO, e não um horário: dispensar a 1.1.160 cala o programa
/// sobre a 1.1.160 — e só sobre ela. A 1.1.161 pergunta de novo, porque é
/// outra decisão. E, de qualquer forma, a próxima abertura do programa instala
/// sozinha o que estiver pendente, sem caixa nenhuma.
static ULTIMA_RECUSADA: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

/// Procura versão nova e instala.
///
/// `perguntar` decide se a pessoa é consultada antes. É `false` na primeira
/// rodada, logo depois de abrir, e `true` de duas em duas horas dali em diante
/// — o porquê está em `cuidar_das_atualizacoes`.
///
/// Devolve `Ok(true)` quando a atualização foi instalada e o programa vai
/// reiniciar — aí não há por que continuar perguntando.
///
/// A CONFERÊNCIA DA ASSINATURA É DO PLUGIN, não daqui. Ele compara o que baixou
/// com a `pubkey` do `tauri.conf.json` e recusa o que não bate. É por isso que
/// esta função pode confiar no que o servidor respondeu: o servidor diz ONDE
/// está o instalador, mas quem diz se ele é legítimo é a chave compilada dentro
/// deste binário.
fn procurar_atualizacao(
    app: &tauri::AppHandle,
    perguntar: bool,
) -> Result<bool, Box<dyn std::error::Error>> {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
    use tauri_plugin_updater::UpdaterExt;

    let Some(atualizacao) = tauri::async_runtime::block_on(app.updater()?.check())? else {
        return Ok(false); // nada novo — o caso de quase sempre
    };

    /*
     * JÁ DISPENSARAM ESTA VERSÃO? Então não se pergunta de novo.
     *
     * A checagem é de cinco em cinco minutos; a pergunta, uma por versão.
     * Sem esta porta, quem responde "agora não" seria interrompido doze vezes
     * por hora pela mesma caixa.
     */
    if perguntar {
        let recusada = ULTIMA_RECUSADA.lock().unwrap();
        if recusada.as_deref() == Some(atualizacao.version.as_str()) {
            return Ok(false);
        }
    }

    /*
     * NA ABERTURA, INSTALA SEM PERGUNTAR.
     *
     * A pergunta existe porque reiniciar perde o que está na tela. Recém-aberto,
     * não há nada na tela para perder — e uma pergunta feita nesse instante só
     * adia a atualização para a próxima vez em que alguém disser "agora não".
     *
     * O instalador do Windows é `passive` (ver `tauri.conf.json`): mostra a
     * própria barra de progresso e não pede nada a ninguém. Quem abriu o
     * programa vê o arranque virar uma instalação curta e o programa voltar já
     * atualizado.
     */
    if !perguntar {
        tauri::async_runtime::block_on(atualizacao.download_and_install(|_, _| {}, || {}))?;
        app.restart();
    }

    /*
     * PERGUNTA, não instala por conta própria.
     *
     * Atualizar reinicia o programa, e reiniciar no meio de um encaixe perde o
     * que estava na tela. Quem está no meio de um trabalho precisa poder dizer
     * "depois" — e vai poder dizer de novo daqui a duas horas, que é o laço
     * chamando outra vez. Uma atualização que interrompe o serviço do cliente
     * é pior que uma que chega uma tarde mais tarde.
     *
     * E ESTA CAIXA NÃO MOSTRA MAIS AS NOTAS DA VERSÃO.
     *
     * Elas eram os títulos dos commits desde o lançamento anterior — texto
     * escrito por quem programa, para quem programa. Na tela de uma gráfica
     * viravam frases como "o lançamento hospeda o instalador na release do
     * GitHub": ninguém do outro lado sabe o que é uma release, e a frase só
     * fazia a atualização parecer coisa de outro mundo. O que a pessoa precisa
     * saber cabe em duas linhas: há versão nova, e atualizar reabre o
     * programa. O detalhe continua no histórico, onde ele serve para alguma
     * coisa.
     */
    let aceitou = app
        .dialog()
        .message(format!(
            "A versão {} do Optimize está pronta.\n\nAtualizar agora leva alguns segundos e reabre o programa.",
            atualizacao.version
        ))
        .title("Atualização disponível")
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Atualizar agora".to_string(),
            "Agora não".to_string(),
        ))
        .blocking_show();

    if !aceitou {
        // Cala a caixa para ESTA versão. A próxima pergunta é de outra versão,
        // ou da próxima vez que o programa abrir — que instala sem perguntar.
        *ULTIMA_RECUSADA.lock().unwrap() = Some(atualizacao.version.clone());
        return Ok(false);
    }

    // Baixa e roda o instalador. Os dois fechamentos são o progresso e o fim do
    // download; não há barra para alimentar, então ficam vazios de propósito.
    tauri::async_runtime::block_on(atualizacao.download_and_install(|_, _| {}, || {}))?;

    /*
     * O servidor Node PRECISA morrer antes do reinício.
     *
     * `restart()` derruba o processo do Tauri, e o `RunEvent::Exit` lá embaixo é
     * quem mata o `node.exe` filho. Sem passar por ele, o instalador tentaria
     * sobrescrever arquivos que um Node ainda vivo mantém abertos — e no
     * Windows isso não é um aviso, é a instalação falhando pela metade.
     */
    app.restart();
}

/// Põe a checagem para rodar em segundo plano, para sempre.
///
/// Numa thread própria e não numa tarefa assíncrona: a caixa de pergunta é
/// modal e bloqueia quem a mostra até alguém responder. Bloquear uma thread do
/// runtime assíncrono do Tauri por cinco minutos, enquanto a pessoa está no
/// banheiro, seguraria tudo o mais que passa por ele.
///
/// ---------------------------------------------------------------------------
/// A PRIMEIRA RODADA NÃO PERGUNTA; AS SEGUINTES, SIM
/// ---------------------------------------------------------------------------
///
/// São dois momentos com respostas diferentes para a mesma pergunta — "posso
/// reiniciar agora?".
///
///   ABRINDO: pode. Não há encaixe na tela, nem pedido pela metade. Perguntar
///   aqui só serve para alguém responder "agora não" por reflexo e a loja ficar
///   na versão velha mais um dia. Então instala e volta sozinho — que é o que
///   faz uma correção alcançar TODA loja que reabre o programa, sem depender
///   de ninguém clicar em nada.
///
///   COM O PROGRAMA ABERTO HÁ HORAS: não pode. Ali existe trabalho na tela, e
///   uma atualização que interrompe o serviço do cliente é pior que uma que
///   chega meia hora mais tarde. Continua perguntando — uma vez por versão,
///   não uma vez por checagem.
fn cuidar_das_atualizacoes(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(PRIMEIRA_CHECAGEM);

        // A rodada da abertura: instala calada. Se falhar — sem internet, o
        // servidor fora do ar —, cai no laço de baixo e tenta de novo daqui a
        // cinco minutos, aí perguntando.
        match procurar_atualizacao(&app, false) {
            Ok(true) => return,
            Ok(false) => {}
            Err(erro) => eprintln!("[atualizacao] {erro}"),
        }

        loop {
            std::thread::sleep(INTERVALO_CHECAGEM);
            match procurar_atualizacao(&app, true) {
                // Instalou: o `restart()` acima não devolve, então isto não
                // chega a acontecer — fica pelo compilador e por quem lê.
                Ok(true) => return,
                Ok(false) => {}
                /*
                 * FALHAR AQUI NÃO PODE INCOMODAR NINGUÉM.
                 *
                 * Sem internet, servidor fora do ar, DNS da gráfica bloqueando:
                 * nada disso tem a ver com o trabalho que a pessoa está fazendo
                 * na tela. Vai para o console (visível no build de
                 * desenvolvimento) e a próxima rodada tenta de novo.
                 */
                Err(erro) => eprintln!("[atualizacao] {erro}"),
            }
        }
    });
}

fn main() {
    let processo: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            // A partir daqui o programa se mantém sozinho: pergunta ao
            // servidor por versão nova, hoje e de duas em duas horas.
            cuidar_das_atualizacoes(app.handle().clone());

            let app = app.handle().clone();
            let abriu_em = Instant::now();
            std::thread::spawn(move || {
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
