use std::path::Path;

fn main() {
    /*
     * A IMPRESSÃO DIGITAL DOS ARQUIVOS DO INSTALADOR (ver
     * `empacotar/integridade.js` e `conferir_integridade`, em src/main.rs).
     *
     * O `main.rs` a embute com `include_str!`, que não compila sem o arquivo.
     * No desenvolvimento ela não existe e não faz falta — a conferência só
     * roda no build de produção —, então nasce vazia aqui.
     *
     * NO BUILD DE PRODUÇÃO, VAZIA É ERRO. Um executável sem impressão digital
     * não confere nada, e sairia para o cliente sem ninguém perceber. O
     * `beforeBuildCommand` do tauri.conf.json a gera antes de chegar aqui.
     */
    let manifesto = Path::new("integridade.txt");
    println!("cargo:rerun-if-changed=integridade.txt");
    if !manifesto.exists() {
        std::fs::write(manifesto, "").expect("criar integridade.txt");
    }
    let producao = std::env::var("PROFILE").as_deref() == Ok("release");
    let vazio = std::fs::read_to_string(manifesto).map(|t| t.trim().is_empty()).unwrap_or(true);
    if producao && vazio {
        panic!(
            "src-tauri/integridade.txt está vazio num build de produção. \
             Rode `node empacotar/integridade.js` depois do compilar.js \
             (o `npm run build:app` já faz isso)."
        );
    }

    tauri_build::build()
}
