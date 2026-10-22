//! ===========================================================================
//! ENCOLHER O ROLO — o sparrow em WebAssembly
//! ===========================================================================
//!
//! O motor de encaixe monta o encaixe peça por peça, sacudindo a ordem da fila.
//! Esse jeito de encaixar chegou num platô: em 2026-09-21 o pedido de produção
//! (`producao-avulsa`, 175 peças, 179 cm, 4 mm) deu 32,300 m com 3 s por fatia
//! e os MESMOS 32,300 m com 300 s — mais busca não comprava um centímetro.
//!
//! O sparrow (github.com/JeroenGar/sparrow, licença MIT) encaixa de outro
//! jeito: pega um encaixe pronto, encurta o rolo, deixa as peças que ficaram
//! de fora entrarem por cima das outras e vai empurrando e virando peça até a
//! sobreposição sumir. Conseguiu, encurta de novo. Medido no mesmo pedido, com
//! as peças EXATAMENTE como o motor as enxerga (as máscaras em escada, em
//! células), ele fechou em 31,394 m: 2,8% a menos, com zero sobreposição pela
//! trava da produção.
//!
//! Esta crate é só a ponte. Uma função atravessa a fronteira, `encolher`: entra
//! a instância e, se houver, o encaixe de partida — os dois no MESMO JSON que o
//! executável do sparrow lê (o formato do jagua-rs) — e sai o melhor encaixe
//! válido, no mesmo formato. Quem traduz máscara em polígono e posição em
//! célula é o JavaScript (`src/motores/encaixeEncolher.js`); aqui não se sabe o
//! que é uma peça de roupa.
//!
//! O QUE VOLTA NO CAMINHO
//!
//! A cada encaixe válido e mais curto, a função `relatar` do JavaScript é
//! chamada com ele. É isso que deixa a tela ver a metragem cair — e é isso que
//! salva o trabalho quando o worker é encerrado de fora. Esta chamada é
//! SÍNCRONA e dura o tempo pedido inteiro: o worker não lê mensagem nenhuma
//! enquanto ela roda, então o botão de parar encerra o worker à força, e o que
//! já foi relatado é o que fica.
//!
//! O QUE MAIS VOLTA: O ANDAMENTO
//!
//! Melhora é rara — umas poucas por fase —, e entre uma e outra a tela não
//! tinha o que mostrar: o contador de tentativas congelava e parecia que a
//! busca tinha parado. O terminador (`Terminador`, abaixo) é consultado em
//! cada volta dos laços do sparrow, e é ele que conta as voltas e chama
//! `andamento(voltas)` umas quatro vezes por segundo.
//!
//! O PRAZO É DURO
//!
//! O sparrow só arma o relógio de cada fase DEPOIS de montar o encaixe de
//! partida, e cada fase recebe o seu pedaço inteiro. Somados, passavam do
//! tempo pedido — medido: 72 s pedidos, 90 s na tela. O terminador também
//! guarda a hora-limite da chamada inteira, e diz "pare" quando ela chega,
//! seja qual for a fase.
//!
//! UMA THREAD SÓ
//!
//! O sparrow reparte o trabalho com o rayon. Em wasm32 sem threads o rayon
//! cai sozinho para a thread atual (`rayon-core`, "fall back to using the
//! current thread alone"), e o separador do sparrow já usa a piscina global
//! quando está em wasm32. Ou seja: aqui ele roda em uma thread, e o paralelo
//! fica por conta dos workers do motor, cada um com o seu sorteio.

use jagua_rs::io::import::Importer;
use jagua_rs::probs::spp::entities::{SPInstance, SPSolution};
use jagua_rs::probs::spp::io::ext_repr::{ExtSPInstance, ExtSPSolution};
use rand::SeedableRng;
use rand::rngs::Xoshiro256PlusPlus;
use sparrow::EPOCH;
use sparrow::config::DEFAULT_SPARROW_CONFIG;
use sparrow::optimizer::optimize;
use sparrow::util::listener::{ReportType, SolutionListener};
use sparrow::util::terminator::{BasicTerminator, Terminator};
use std::cell::Cell;
use std::time::Duration;
use wasm_bindgen::prelude::*;

/// Repassa ao JavaScript cada encaixe VÁLIDO que encurtou o rolo.
///
/// O sparrow também relata encaixes inválidos (com sobreposição, no meio da
/// busca). Esses ficam aqui: do lado de lá ninguém tem o que fazer com eles.
struct RelatarAoJs<'a> {
    relatar: &'a js_sys::Function,
    melhor: f32,
}

impl SolutionListener for RelatarAoJs<'_> {
    fn report(&mut self, tipo: ReportType, solucao: &SPSolution, instancia: &SPInstance) {
        let valido = matches!(tipo, ReportType::ExplFeas | ReportType::CmprFeas | ReportType::Final);
        if !valido {
            return;
        }
        let largura = solucao.strip_width();
        if largura >= self.melhor {
            return;
        }
        self.melhor = largura;
        let ext = jagua_rs::probs::spp::io::export(instancia, solucao, *EPOCH);
        if let Ok(json) = serde_json::to_string(&ext) {
            // Erro do lado de lá não derruba a busca: o relato é um aviso, e o
            // resultado final ainda volta pelo retorno da função.
            let _ = self.relatar.call2(
                &JsValue::NULL,
                &JsValue::from_str(&json),
                &JsValue::from_f64(f64::from(largura)),
            );
        }
    }
}

/// O terminador do sparrow com duas coisas a mais: o prazo da chamada inteira
/// e a contagem das voltas, avisada ao JavaScript (ver o cabeçalho).
struct Terminador<'a> {
    fase: BasicTerminator,
    prazo: jagua_rs::Instant,
    voltas: Cell<u64>,
    ultimo_aviso: Cell<jagua_rs::Instant>,
    andamento: &'a js_sys::Function,
}

/// De quanto em quanto tempo o andamento atravessa para o JavaScript.
const INTERVALO_DO_ANDAMENTO: Duration = Duration::from_millis(250);

impl Terminator for Terminador<'_> {
    fn kill(&self) -> bool {
        let voltas = self.voltas.get() + 1;
        self.voltas.set(voltas);
        let agora = jagua_rs::Instant::now();
        if agora.duration_since(self.ultimo_aviso.get()) >= INTERVALO_DO_ANDAMENTO {
            self.ultimo_aviso.set(agora);
            // Aviso, e não ordem: erro do lado de lá não para a busca.
            let _ = self.andamento.call1(&JsValue::NULL, &JsValue::from_f64(voltas as f64));
        }
        agora > self.prazo || self.fase.kill()
    }

    fn new_timeout(&mut self, timeout: Duration) {
        self.fase.new_timeout(timeout);
    }

    fn timeout_at(&self) -> Option<jagua_rs::Instant> {
        // O que chegar primeiro: o fim da fase ou o da chamada.
        Some(self.fase.timeout_at().map_or(self.prazo, |t| t.min(self.prazo)))
    }
}

fn erro(e: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&e.to_string())
}

/// Encolhe o rolo.
///
/// - `instancia`: JSON do jagua-rs (`ExtSPInstance`).
/// - `partida`: JSON de um encaixe (`ExtSPSolution`) de onde começar, ou nada
///   para o sparrow montar o dele.
/// - `tempo_ms`: o relógio inteiro; `fracao_compressao` dele vai para a fase
///   final de compressão (o sparrow usa 0,2 por padrão).
/// - `semente`: o sorteio. Cada worker recebe uma diferente.
/// - `separacao`: distância mínima entre peças, nas unidades da instância. A
///   folga do tecido já vem dentro da máscara; isto é só a margem que torna
///   seguro arredondar a posição para a célula (ver `encaixeEncolher.js`).
/// - `trabalhadores`: os "workers" do separador do sparrow. Em wasm32 eles se
///   revezam numa thread só.
/// - `relatar(json, largura)`: chamada a cada encaixe válido mais curto.
/// - `andamento(voltas)`: quantas voltas o sparrow já deu, umas quatro vezes
///   por segundo.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn encolher(
    instancia: &str,
    partida: Option<String>,
    tempo_ms: f64,
    fracao_compressao: f64,
    semente: f64,
    separacao: f64,
    trabalhadores: u32,
    relatar: &js_sys::Function,
    andamento: &js_sys::Function,
) -> Result<String, JsValue> {
    // O relógio da chamada inteira começa aqui, antes de importar e montar.
    let inicio = jagua_rs::Instant::now();
    let ext_instancia: ExtSPInstance = serde_json::from_str(instancia).map_err(erro)?;

    let mut config = DEFAULT_SPARROW_CONFIG;
    config.min_item_separation = (separacao > 0.0).then_some(separacao as f32);
    let n = trabalhadores.max(1) as usize;
    config.expl_cfg.separator_config.n_workers = n;
    config.cmpr_cfg.separator_config.n_workers = n;
    let total = Duration::from_millis(tempo_ms.max(0.0) as u64);
    let fracao = fracao_compressao.clamp(0.0, 1.0) as f32;
    config.expl_cfg.time_limit = total.mul_f32(1.0 - fracao);
    config.cmpr_cfg.time_limit = total.mul_f32(fracao);

    let importador = Importer::new(
        config.cde_config,
        config.poly_simpl_tolerance,
        config.min_item_separation,
        config.narrow_concavity_cutoff_ratio,
    );
    let inst = jagua_rs::probs::spp::io::import_instance(&importador, &ext_instancia).map_err(erro)?;
    let inicial = match partida {
        Some(json) => {
            let ext: ExtSPSolution = serde_json::from_str(&json).map_err(erro)?;
            Some(jagua_rs::probs::spp::io::import_solution(&inst, &ext))
        }
        None => None,
    };

    let rng = Xoshiro256PlusPlus::seed_from_u64(semente.max(0.0) as u64);
    let mut ouvinte = RelatarAoJs { relatar, melhor: f32::INFINITY };
    let mut terminador = Terminador {
        fase: BasicTerminator::new(),
        prazo: inicio + total,
        voltas: Cell::new(0),
        ultimo_aviso: Cell::new(inicio),
        andamento,
    };
    let solucao = optimize(
        inst.clone(),
        rng,
        &mut ouvinte,
        &mut terminador,
        &config.expl_cfg,
        &config.cmpr_cfg,
        inicial.as_ref(),
    )
    .map_err(erro)?;

    let ext = jagua_rs::probs::spp::io::export(&inst, &solucao, *EPOCH);
    serde_json::to_string(&ext).map_err(erro)
}
