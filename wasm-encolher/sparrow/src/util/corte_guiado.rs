//! [Optmize] O CORTE GUIADO PELO DESPERDÍCIO (2026-11-12)
//!
//! Para encolher a faixa, o sparrow escolhe uma posição `x` e desloca para a
//! esquerda todas as peças cujo centro está à direita dela; as peças dos dois
//! lados do corte passam a se sobrepor, e o separador tenta desfazer isso. No
//! original, a exploração corta sempre no MEIO da faixa e a compressão num
//! ponto SORTEADO por igual.
//!
//! A sobreposição criada depende de quanto tecido está ocupado perto do corte:
//! cortar onde a faixa está cheia empurra peça contra peça; cortar onde há
//! vazio sobrando é quase de graça. Aqui o corte é sorteado com peso maior
//! onde a faixa está mais vazia — o perfil de ocupação ao longo de `x`, em
//! fatias, com a área de cada peça espalhada pela largura da caixa dela.
//!
//! Com probabilidade `1 - p` o corte continua sendo o original (o meio, ou o
//! sorteio uniforme): o guiado não pode virar a única vizinhança.

use jagua_rs::probs::spp::entities::SPProblem;
use rand::{Rng, RngExt};

/// Quantas fatias o perfil de ocupação tem.
const FATIAS: usize = 256;

/// A posição do corte, ou `None` para o chamador seguir a regra original.
///
/// `guiado = Some((p, gamma))`: com probabilidade `p`, sorteia a fatia com
/// peso `(1 - ocupação)^gamma` e um ponto dentro dela.
pub fn posicao_do_corte(prob: &SPProblem, rng: &mut impl Rng, guiado: Option<(f32, f32)>) -> Option<f32> {
    let (p, gamma) = guiado?;
    if rng.random::<f32>() >= p {
        return None;
    }
    let largura = prob.strip_width();
    let altura = prob.layout.container.outer_cd.bbox.height();
    if !(largura > 0.0) || !(altura > 0.0) {
        return None;
    }
    let passo = largura / FATIAS as f32;
    let mut ocupado = [0f32; FATIAS];
    for (_, pi) in prob.layout.placed_items.iter() {
        let caixa = pi.shape.bbox;
        let (x0, x1) = (caixa.x_min.max(0.0), caixa.x_max.min(largura));
        let w = caixa.x_max - caixa.x_min;
        if !(x1 > x0) || !(w > 0.0) {
            continue;
        }
        let por_unidade = pi.shape.area / w;
        let f0 = ((x0 / passo) as usize).min(FATIAS - 1);
        let f1 = ((x1 / passo) as usize).min(FATIAS - 1);
        for f in f0..=f1 {
            let de = (f as f32 * passo).max(x0);
            let ate = ((f + 1) as f32 * passo).min(x1);
            if ate > de {
                ocupado[f] += por_unidade * (ate - de);
            }
        }
    }
    let area_da_fatia = passo * altura;
    let mut pesos = [0f32; FATIAS];
    let mut total = 0.0;
    for f in 0..FATIAS {
        let densidade = (ocupado[f] / area_da_fatia).clamp(0.0, 1.0);
        // Um piso pequeno: fatia cheia ainda pode ser escolhida.
        pesos[f] = (1.0 - densidade).powf(gamma) + 1e-3;
        total += pesos[f];
    }
    let mut r = rng.random::<f32>() * total;
    for f in 0..FATIAS {
        if r < pesos[f] {
            return Some((f as f32 + rng.random::<f32>()) * passo);
        }
        r -= pesos[f];
    }
    Some(largura * 0.5)
}
