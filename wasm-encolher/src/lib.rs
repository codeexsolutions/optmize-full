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
//!
//! OS AJUSTES (2026-11-12)
//!
//! O último argumento, opcional, é um JSON com ajustes do sparrow — os que o
//! laboratório (`bancada/laboratorio-sparrow.js`) mede braço contra braço:
//! simplificação dos polígonos, profundidade da quadtree, amostras, limites do
//! separador, passos de encolher. Sem ele, ou com um campo ausente, vale o
//! padrão de sempre (`DEFAULT_SPARROW_CONFIG`). Ajuste nenhum mexe na
//! validade: a volta continua conferida pela trava do motor.
//!
//! AS ESTATÍSTICAS
//!
//! `estatisticas()` devolve, em JSON, o que a última chamada de `encolher`
//! fez de verdade: quantas separações tentou e quantas resolveram, quantas
//! avaliações geométricas (posições testadas) e movimentos custaram, e o
//! tempo de cada fase. É daí que sai a "qualidade por avaliação" — quanto
//! tecido cada mil avaliações compraram —, e não só a qualidade por segundo.

use jagua_rs::io::import::Importer;
use jagua_rs::probs::spp::entities::{SPInstance, SPSolution};
use jagua_rs::probs::spp::io::ext_repr::{ExtSPInstance, ExtSPSolution};
use rand::SeedableRng;
use rand::rngs::Xoshiro256PlusPlus;
use serde_json::Value;
use sparrow::EPOCH;
use sparrow::config::{DEFAULT_SPARROW_CONFIG, SparrowConfig};
use sparrow::optimizer::optimize;
use sparrow::optimizer::separator::SeparatorConfig;
use sparrow::util::listener::{OptimizationPhase, ReportType, SeparationResult, SolutionListener};
use sparrow::util::terminator::{BasicTerminator, Terminator};
use std::cell::{Cell, RefCell};
use std::time::Duration;
use wasm_bindgen::prelude::*;

/// O que a última chamada de `encolher` fez (ver "AS ESTATÍSTICAS").
#[derive(Default, Clone)]
struct Estatisticas {
    separacoes: u64,
    separacoes_resolvidas: u64,
    avaliacoes: u64,
    movimentos: u64,
    iteracoes: u64,
    segundos_separando: f64,
    encolhidas_na_exploracao: u64,
    encolhidas_na_compressao: u64,
    ms_ate_compressao: f64,
    ms_total: f64,
    /// Vértices das formas como chegaram e como o detector de colisão as usa
    /// (depois da simplificação), somados por tipo de peça.
    vertices_originais: u64,
    vertices_colisao: u64,
    /// A área das peças (com as cópias) como chegaram e como o detector as
    /// usa: a razão é o quanto a simplificação engordou as peças.
    area_original: f64,
    area_colisao: f64,
}

thread_local! {
    static ESTATISTICAS: RefCell<Estatisticas> = RefCell::new(Estatisticas::default());
}

/// As estatísticas da última chamada de `encolher`, em JSON.
#[wasm_bindgen]
pub fn estatisticas() -> String {
    ESTATISTICAS.with(|e| {
        let e = e.borrow();
        serde_json::json!({
            "separacoes": e.separacoes,
            "separacoesResolvidas": e.separacoes_resolvidas,
            "avaliacoes": e.avaliacoes,
            "movimentos": e.movimentos,
            "iteracoes": e.iteracoes,
            "segundosSeparando": e.segundos_separando,
            "encolhidasNaExploracao": e.encolhidas_na_exploracao,
            "encolhidasNaCompressao": e.encolhidas_na_compressao,
            "msAteCompressao": e.ms_ate_compressao,
            "msTotal": e.ms_total,
            "verticesOriginais": e.vertices_originais,
            "verticesColisao": e.vertices_colisao,
            "areaOriginal": e.area_original,
            "areaColisao": e.area_colisao,
        })
        .to_string()
    })
}

/// Repassa ao JavaScript cada encaixe VÁLIDO que encurtou o rolo.
///
/// O sparrow também relata encaixes inválidos (com sobreposição, no meio da
/// busca). Esses ficam aqui: do lado de lá ninguém tem o que fazer com eles.
struct RelatarAoJs<'a> {
    relatar: &'a js_sys::Function,
    melhor: f32,
    inicio: jagua_rs::Instant,
}

impl SolutionListener for RelatarAoJs<'_> {
    fn report(&mut self, tipo: ReportType, solucao: &SPSolution, instancia: &SPInstance) {
        let valido = matches!(tipo, ReportType::ExplFeas | ReportType::CmprFeas | ReportType::Final);
        if !valido {
            return;
        }
        ESTATISTICAS.with(|e| {
            let mut e = e.borrow_mut();
            match tipo {
                ReportType::ExplFeas => e.encolhidas_na_exploracao += 1,
                ReportType::CmprFeas => e.encolhidas_na_compressao += 1,
                _ => {}
            }
        });
        let largura = solucao.strip_width();
        if largura >= self.melhor {
            return;
        }
        self.melhor = largura;
        let ext = jagua_rs::probs::spp::io::export(instancia, solucao, *EPOCH);
        if let Ok(json) = serde_json::to_string(&ext) {
            // Erro do lado de lá não derruba a busca: o relato é um aviso, e o
            // resultado final ainda volta pelo retorno da função. O terceiro
            // número diz de onde veio: 1 exploração, 2 compressão, 3 o final.
            let origem = match tipo {
                ReportType::ExplFeas => 1.0,
                ReportType::CmprFeas => 2.0,
                _ => 3.0,
            };
            let _ = self.relatar.call3(
                &JsValue::NULL,
                &JsValue::from_str(&json),
                &JsValue::from_f64(f64::from(largura)),
                &JsValue::from_f64(origem),
            );
        }
    }

    fn report_phase(&mut self, fase: OptimizationPhase) {
        if fase == OptimizationPhase::Compression {
            let ms = self.inicio.elapsed().as_secs_f64() * 1000.0;
            ESTATISTICAS.with(|e| e.borrow_mut().ms_ate_compressao = ms);
        }
    }

    fn report_separation_result(&mut self, r: SeparationResult) {
        ESTATISTICAS.with(|e| {
            let mut e = e.borrow_mut();
            e.separacoes += 1;
            if r.success {
                e.separacoes_resolvidas += 1;
            }
            e.avaliacoes += r.total_evals as u64;
            e.movimentos += r.total_moves as u64;
            e.iteracoes += r.iterations as u64;
            e.segundos_separando += f64::from(r.elapsed_seconds);
        });
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
            // Aviso, e não ordem: erro do lado de lá não para a busca. O
            // segundo número são as avaliações geométricas até aqui (quem só
            // lê as voltas ignora o resto).
            let avaliacoes = ESTATISTICAS.with(|e| e.borrow().avaliacoes);
            let _ = self.andamento.call2(
                &JsValue::NULL,
                &JsValue::from_f64(voltas as f64),
                &JsValue::from_f64(avaliacoes as f64),
            );
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

// ==================== OS AJUSTES ====================

fn num(v: &Value, campo: &str) -> Option<f64> {
    v.get(campo).and_then(Value::as_f64)
}

/// Um par `[a, b]` de números (o `split_guiado`: probabilidade e expoente).
fn par(v: &Value, campo: &str) -> Option<(f32, f32)> {
    let a = v.get(campo)?.as_array()?;
    if a.len() != 2 {
        return None;
    }
    Some((a[0].as_f64()? as f32, a[1].as_f64()? as f32))
}

/// Os ajustes de um separador (o da exploração ou o da compressão).
fn ajustar_separador(cfg: &mut SeparatorConfig, v: &Value) {
    if let Some(x) = num(v, "iter_no_imprv_limit") {
        cfg.iter_no_imprv_limit = x.max(1.0) as usize;
    }
    if let Some(x) = num(v, "strike_limit") {
        cfg.strike_limit = x.max(1.0) as usize;
    }
    if let Some(x) = num(v, "n_container_samples") {
        cfg.sample_config.n_container_samples = x.max(0.0) as usize;
    }
    if let Some(x) = num(v, "n_focussed_samples") {
        cfg.sample_config.n_focussed_samples = x.max(0.0) as usize;
    }
    if let Some(x) = num(v, "n_coord_descents") {
        cfg.sample_config.n_coord_descents = x.max(1.0) as usize;
    }
}

/// Aplica o JSON de ajustes por cima da configuração (ver "OS AJUSTES").
fn aplicar_ajustes(config: &mut SparrowConfig, json: &str) -> Result<(), JsValue> {
    let v: Value = serde_json::from_str(json).map_err(erro)?;
    match v.get("poly_simpl_tolerance") {
        Some(Value::Null) => config.poly_simpl_tolerance = None,
        Some(x) => {
            if let Some(t) = x.as_f64() {
                config.poly_simpl_tolerance = Some(t as f32);
            }
        }
        None => {}
    }
    match v.get("narrow_concavity") {
        Some(Value::Null) => config.narrow_concavity_cutoff_ratio = None,
        Some(Value::Array(a)) if a.len() == 2 => {
            if let (Some(d), Some(r)) = (a[0].as_f64(), a[1].as_f64()) {
                config.narrow_concavity_cutoff_ratio = Some((d as f32, r as f32));
            }
        }
        _ => {}
    }
    if let Some(x) = num(&v, "quadtree_depth") {
        config.cde_config.quadtree_depth = x.clamp(1.0, 12.0) as u8;
    }
    if let Some(x) = num(&v, "cd_threshold") {
        config.cde_config.cd_threshold = x.clamp(1.0, 255.0) as u8;
    }
    if let Some(e) = v.get("expl") {
        if let Some(x) = num(e, "shrink_step") {
            config.expl_cfg.shrink_step = x as f32;
        }
        if let Some(x) = num(e, "solution_pool_distribution_stddev") {
            config.expl_cfg.solution_pool_distribution_stddev = x as f32;
        }
        if let Some(x) = num(e, "large_item_ch_area_cutoff_percentile") {
            config.expl_cfg.large_item_ch_area_cutoff_percentile = x as f32;
        }
        config.expl_cfg.split_guiado = par(e, "split_guiado").or(config.expl_cfg.split_guiado);
        ajustar_separador(&mut config.expl_cfg.separator_config, e);
    }
    if let Some(c) = v.get("cmpr") {
        if let Some(x) = num(c, "shrink_max") {
            config.cmpr_cfg.shrink_range.0 = x as f32;
        }
        if let Some(x) = num(c, "shrink_min") {
            config.cmpr_cfg.shrink_range.1 = x as f32;
        }
        config.cmpr_cfg.split_guiado = par(c, "split_guiado").or(config.cmpr_cfg.split_guiado);
        ajustar_separador(&mut config.cmpr_cfg.separator_config, c);
    }
    Ok(())
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
/// - `andamento(voltas, avaliacoes)`: quantas voltas o sparrow já deu e
///   quantas avaliações geométricas fez, umas quatro vezes por segundo.
/// - `ajustes`: JSON opcional com ajustes do sparrow (ver "OS AJUSTES").
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
    ajustes: Option<String>,
) -> Result<String, JsValue> {
    // O relógio da chamada inteira começa aqui, antes de importar e montar.
    let inicio = jagua_rs::Instant::now();
    ESTATISTICAS.with(|e| *e.borrow_mut() = Estatisticas::default());
    let ext_instancia: ExtSPInstance = serde_json::from_str(instancia).map_err(erro)?;

    let mut config = DEFAULT_SPARROW_CONFIG;
    config.min_item_separation = (separacao > 0.0).then_some(separacao as f32);
    let n = trabalhadores.max(1) as usize;
    config.expl_cfg.separator_config.n_workers = n;
    config.cmpr_cfg.separator_config.n_workers = n;
    if let Some(json) = ajustes.as_deref().filter(|j| !j.trim().is_empty()) {
        aplicar_ajustes(&mut config, json)?;
    }
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
    ESTATISTICAS.with(|e| {
        let mut e = e.borrow_mut();
        for (item, qtd) in &inst.items {
            let q = *qtd as f64;
            e.vertices_originais += item.shape_orig.shape.n_vertices() as u64;
            e.vertices_colisao += item.shape_cd.n_vertices() as u64;
            e.area_original += f64::from(item.shape_orig.shape.area) * q;
            e.area_colisao += f64::from(item.shape_cd.area) * q;
        }
    });
    let inicial = match partida {
        Some(json) => {
            let ext: ExtSPSolution = serde_json::from_str(&json).map_err(erro)?;
            Some(jagua_rs::probs::spp::io::import_solution(&inst, &ext))
        }
        None => None,
    };

    let rng = Xoshiro256PlusPlus::seed_from_u64(semente.max(0.0) as u64);
    let mut ouvinte = RelatarAoJs { relatar, melhor: f32::INFINITY, inicio };
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

    ESTATISTICAS.with(|e| e.borrow_mut().ms_total = inicio.elapsed().as_secs_f64() * 1000.0);
    let ext = jagua_rs::probs::spp::io::export(&inst, &solucao, *EPOCH);
    serde_json::to_string(&ext).map_err(erro)
}
