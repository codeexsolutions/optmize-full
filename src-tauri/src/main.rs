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

/// Sobe o `server.js` com o Node que veio junto.
fn subir_servidor(pasta: &PathBuf, dados: &PathBuf, porta: u16) -> std::io::Result<Child> {
    let mut comando = Command::new(pasta.join("node.exe"));
    comando
        .arg(pasta.join("server.js"))
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

fn main() {
    let processo: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));

    tauri::Builder::default()
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
                // Sem isto, arrastar arquivo para dentro da janela não faz
                // nada: o Tauri intercepta o arrastar-e-soltar do Windows
                // antes da página, e os eventos `drop` do HTML nunca chegam
                // ao Encaixe nem ao Vetor. Desligado, quem recebe o arquivo é
                // a página — do mesmo jeito que no navegador.
                .disable_drag_drop_handler()
                .build()?;

            // A espera vai para outra thread de propósito: esperar aqui dentro
            // seguraria o `setup`, e o loop de eventos só começa quando ele
            // termina — a tela de "abrindo" ficaria branca, sem pintar, que é
            // exatamente o que ela existe para evitar.
            let app = app.handle().clone();
            std::thread::spawn(move || {
                let pronto = esperar_servidor(porta, &processo);
                let Some(janela) = app.get_webview_window("principal") else {
                    return; // fecharam antes de abrir; não há o que mostrar
                };
                let destino = if pronto {
                    format!("http://127.0.0.1:{porta}/")
                } else {
                    "erro.html".to_string()
                };
                if let Ok(url) = destino.parse() {
                    let _ = janela.navigate(url);
                }
                if pronto {
                    let _ = janela.maximize();
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
