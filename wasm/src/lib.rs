//! O laço de posicionamento do encaixe, em WebAssembly.
//!
//! Por que existe
//! -------------
//! Medindo a busca, 96% do tempo estava numa função só: achar onde uma peça
//! encosta no relevo do que já foi posicionado. É um laço de conta inteira
//! sobre vetores — exatamente o tipo de coisa em que o WebAssembly ganha do
//! JavaScript, porque não precisa conferir o limite de cada acesso a vetor.
//!
//! Medido antes de escrever isto: o mesmo laço em Rust nativo roda 3,1x mais
//! rápido que a versão em JS, com resultado idêntico. O WASM fica um pouco
//! atrás do nativo, e é essa diferença que se espera ganhar aqui.
//!
//! O que roda aqui
//! ---------------
//! A rodada inteira de posicionamento, não só o laço de dentro. O motivo é o
//! custo de atravessar a fronteira: chamando por peça, o relevo do tecido teria
//! que ser copiado para cá 21 mil vezes por busca. Passando a rodada toda, o
//! relevo nasce e morre deste lado, e o JavaScript só manda a ordem das peças e
//! recebe onde cada uma parou.
//!
//! O JavaScript é dono do arranjo da memória: ele escreve as formas e a ordem,
//! e passa um cabeçalho dizendo onde cada coisa está. Aqui nada é alocado.
//!
//! A regra que não pode ser quebrada: este arquivo tem que dar exatamente o
//! mesmo resultado que a versão em JS (encaixe-motor.js). Qualquer diferença é
//! erro, e existe um teste que confere posição por posição.

#![no_std]

use core::panic::PanicInfo;

#[panic_handler]
fn ao_entrar_em_panico(_: &PanicInfo) -> ! {
    // Sem sistema operacional para avisar; o laço vazio é o fim da linha.
    // Na prática não acontece: nada aqui aloca nem indexa fora do combinado.
    loop {}
}

/// Onde cada coisa está na memória, em índices de i32 a partir do começo.
///
/// A ordem dos campos é a mesma do lado do JavaScript (encaixe-wasm.js);
/// mexer aqui obriga a mexer lá.
const CAB_FORMA_COLS: usize = 0; // vetor: colunas de cada forma
const CAB_FORMA_NCOLS: usize = 1; // vetor: colunas realmente ocupadas
const CAB_FORMA_SOMATOPO: usize = 2; // vetor: soma dos topos
const CAB_FORMA_MAXBASE: usize = 3; // vetor: a coluna que desce mais
const CAB_FORMA_NSONDAS: usize = 4; // vetor: quantas colunas-sonda
const CAB_FORMA_TOPO: usize = 5; // vetor: onde começa o topo[] de cada forma
const CAB_FORMA_BASE: usize = 6; // vetor: onde começa o base[] de cada forma
const CAB_FORMA_SONDAS: usize = 7; // vetor: onde começam as sondas de cada forma
const CAB_UNID_INICIO: usize = 8; // vetor: primeira forma de cada unidade
const CAB_UNID_QTD: usize = 9; // vetor: quantas formas cada unidade tem
const CAB_ORDEM: usize = 10; // vetor: as unidades, na ordem de entrada
const CAB_N_ORDEM: usize = 11; // quantas unidades entram
const CAB_PERFIL: usize = 12; // o relevo do tecido, uma altura por coluna
const CAB_COLS_TECIDO: usize = 13;
const CAB_USA_VAZIO: usize = 14; // 1 = heurística "vazio", 0 = "fundo"
const CAB_PULO: usize = 15; // de quanto em quanto a varredura anda
const CAB_ACUMULADO: usize = 16; // rascunho: soma acumulada do relevo (i64)
const CAB_SAIDA: usize = 17; // saída: 4 números por unidade da ordem
const CAB_LINHAS_BANCADA: usize = 18; // comprimento da bancada em células; 0 = rolo sem fim

#[inline(always)]
unsafe fn ler(base: *const i32, indice: i32) -> i32 {
    *base.offset(indice as isize)
}

/// Onde a peça pousa de verdade, respeitando a linha da bancada.
///
/// Cópia exata de `empurrarParaBancada`, em encaixe-motor.js — ver o cabeçalho
/// de lá para o porquê. Aqui vale a mesma regra do arquivo inteiro: qualquer
/// diferença entre os dois é erro, e o teste de paridade a pega.
#[inline(always)]
fn empurrar_para_bancada(y: i32, altura: i32, linhas: i32) -> i32 {
    if linhas <= 0 {
        return y;
    }
    let dentro = y % linhas;
    if dentro + altura <= linhas {
        y
    } else {
        y - dentro + linhas
    }
}

/// Uma rodada de posicionamento: percorre as unidades na ordem dada, encaixa
/// cada uma no relevo atual e devolve o ponto mais baixo alcançado.
///
/// A saída traz, para cada unidade da ordem, quatro números:
///   0: qual forma venceu (índice global), ou -1 se a unidade não coube
///   1: x       2: y       3: o buraco morto que a colocação deixou acima
///
/// O quarto número é o `vazio` da posição escolhida — a mesma medida que a
/// heurística "vazio" usa. Ele volta porque é dele que a busca tira a
/// **pior unidade** da tentativa, e é essa unidade que o reparo guiado
/// (`repararPior`, em encaixe-motor.js) mira na tentativa seguinte. Sem ele o
/// reparo ficava desligado sempre que o WASM estava ligado — ou seja, sempre.
///
/// Devolve o fundo máximo — o comprimento de tecido usado, em células.
#[no_mangle]
pub unsafe extern "C" fn encaixar(cabecalho: *const i32) -> i32 {
    // Os campos do cabeçalho são **índices de i32 contados do endereço zero**
    // da memória linear, e não deslocamentos a partir do cabeçalho. Por isso o
    // ponteiro base é o próprio zero: `zero.offset(i)` chega no byte i*4.
    let zero = 0 as *mut i32;
    let cab = cabecalho;
    let p_forma_cols = zero.offset(ler(cab, CAB_FORMA_COLS as i32) as isize);
    let p_forma_ncols = zero.offset(ler(cab, CAB_FORMA_NCOLS as i32) as isize);
    let p_forma_somatopo = zero.offset(ler(cab, CAB_FORMA_SOMATOPO as i32) as isize);
    let p_forma_maxbase = zero.offset(ler(cab, CAB_FORMA_MAXBASE as i32) as isize);
    let p_forma_nsondas = zero.offset(ler(cab, CAB_FORMA_NSONDAS as i32) as isize);
    let p_forma_topo = zero.offset(ler(cab, CAB_FORMA_TOPO as i32) as isize);
    let p_forma_base = zero.offset(ler(cab, CAB_FORMA_BASE as i32) as isize);
    let p_forma_sondas = zero.offset(ler(cab, CAB_FORMA_SONDAS as i32) as isize);
    let p_unid_inicio = zero.offset(ler(cab, CAB_UNID_INICIO as i32) as isize);
    let p_unid_qtd = zero.offset(ler(cab, CAB_UNID_QTD as i32) as isize);
    let p_ordem = zero.offset(ler(cab, CAB_ORDEM as i32) as isize);
    let n_ordem = ler(cab, CAB_N_ORDEM as i32);
    let perfil = zero.offset(ler(cab, CAB_PERFIL as i32) as isize);
    let cols_tecido = ler(cab, CAB_COLS_TECIDO as i32);
    let usa_vazio = ler(cab, CAB_USA_VAZIO as i32) != 0;
    let pulo = if ler(cab, CAB_PULO as i32) < 1 { 1 } else { ler(cab, CAB_PULO as i32) };
    let linhas_bancada = ler(cab, CAB_LINHAS_BANCADA as i32);
    let acumulado = (zero.offset(ler(cab, CAB_ACUMULADO as i32) as isize)) as *mut i64;
    let saida = zero.offset(ler(cab, CAB_SAIDA as i32) as isize);

    // O relevo começa zerado: tecido novo.
    for c in 0..cols_tecido {
        *perfil.offset(c as isize) = 0;
    }

    let mut fundo_max = 0i32;

    for k in 0..n_ordem {
        let unidade = *p_ordem.offset(k as isize);
        let primeira_forma = *p_unid_inicio.offset(unidade as isize);
        let quantas_formas = *p_unid_qtd.offset(unidade as isize);

        // A soma acumulada do relevo, para a nota "vazio" sair em uma conta só.
        // Refeita a cada peça porque o relevo mudou.
        if usa_vazio {
            *acumulado.offset(0) = 0;
            for c in 0..cols_tecido {
                *acumulado.offset((c + 1) as isize) =
                    *acumulado.offset(c as isize) + *perfil.offset(c as isize) as i64;
            }
        }

        let mut tem_melhor = false;
        let mut melhor_forma = -1i32;
        let mut melhor_x = 0i32;
        let mut melhor_y = 0i32;
        let mut melhor_p1 = 0i64;
        let mut melhor_p2 = 0i64;

        for f in 0..quantas_formas {
            let forma = primeira_forma + f;
            let cols = *p_forma_cols.offset(forma as isize);
            if cols > cols_tecido {
                continue;
            }
            let n_cols = *p_forma_ncols.offset(forma as isize) as i64;
            let soma_topo = *p_forma_somatopo.offset(forma as isize) as i64;
            let max_base = *p_forma_maxbase.offset(forma as isize);
            // Forma mais comprida que a bancada não cabe em bancada nenhuma.
            if linhas_bancada > 0 && max_base + 1 > linhas_bancada {
                continue;
            }
            let n_sondas = *p_forma_nsondas.offset(forma as isize);
            let topo = zero.offset(*p_forma_topo.offset(forma as isize) as isize);
            let sondas = zero.offset(*p_forma_sondas.offset(forma as isize) as isize);
            let ultimo_x = cols_tecido - cols;
            let pode_cortar = !usa_vazio || n_cols == cols as i64;

            let mut local_x = -1i32;
            let mut local_p1 = 0i64;
            let mut local_p2 = 0i64;

            // Uma posição: mede e, se valer, guarda. Devolve nada; mexe nos
            // acumuladores de fora.
            macro_rules! avaliar {
                ($x:expr) => {{
                    let x = $x;
                    let janela: i64 = if pode_cortar && usa_vazio {
                        *acumulado.offset((x + cols) as isize) - *acumulado.offset(x as isize)
                    } else {
                        0
                    };

                    // A nota que esta posição teria com um dado y. As duas
                    // heurísticas só pioram quando o y sobe, e é isso que
                    // deixa cortar cedo.
                    macro_rules! nota_com {
                        ($y:expr) => {
                            if usa_vazio {
                                ($y as i64) * n_cols + soma_topo - janela
                            } else {
                                ($y + max_base + 1) as i64
                            }
                        };
                    }

                    let mut pular_esta = false;

                    // 1) o palpite barato, só com as colunas-sonda
                    if tem_melhor && pode_cortar {
                        let mut piso = 0i32;
                        for i in 0..n_sondas {
                            let c = *sondas.offset(i as isize);
                            let encosta = *perfil.offset((x + c) as isize) - *topo.offset(c as isize);
                            if encosta > piso {
                                piso = encosta;
                            }
                        }
                        if nota_com!(piso) > melhor_p1 {
                            pular_esta = true;
                        }
                    }

                    if !pular_esta {
                        // 2) a medida de verdade, colunas em ordem
                        let mut y = 0i32;
                        let mut soma_perfil = 0i64;
                        let mut cortada = false;
                        for c in 0..cols {
                            let t = *topo.offset(c as isize);
                            if t < 0 {
                                continue;
                            }
                            let altura = *perfil.offset((x + c) as isize);
                            soma_perfil += altura as i64;
                            let encosta = altura - t;
                            if encosta <= y {
                                continue;
                            }
                            y = encosta;
                            if tem_melhor && pode_cortar && nota_com!(y) > melhor_p1 {
                                cortada = true;
                                break;
                            }
                        }

                        if !cortada {
                            // A gravidade disse onde ela encosta; a bancada diz
                            // se ela pode ficar ali. Antes das notas, para o
                            // buraco que o empurrão deixa contar como o
                            // desperdício que é.
                            let y = empurrar_para_bancada(y, max_base + 1, linhas_bancada);
                            let vazio = (y as i64) * n_cols + soma_topo - soma_perfil;
                            let fundo = (y + max_base + 1) as i64;
                            let (p1, p2) = if usa_vazio { (vazio, fundo) } else { (fundo, vazio) };

                            if local_x < 0 || p1 < local_p1 || (p1 == local_p1 && p2 < local_p2) {
                                local_x = x;
                                local_p1 = p1;
                                local_p2 = p2;
                            }
                            if !tem_melhor || p1 < melhor_p1 || (p1 == melhor_p1 && p2 < melhor_p2) {
                                tem_melhor = true;
                                melhor_forma = forma;
                                melhor_x = x;
                                melhor_y = y;
                                melhor_p1 = p1;
                                melhor_p2 = p2;
                            }
                        }
                    }
                }};
            }

            if pulo <= 1 {
                let mut x = 0i32;
                while x <= ultimo_x {
                    avaliar!(x);
                    x += 1;
                }
            } else {
                let mut x = 0i32;
                while x <= ultimo_x {
                    avaliar!(x);
                    x += pulo;
                }
                if ultimo_x % pulo != 0 {
                    avaliar!(ultimo_x);
                }
                if local_x >= 0 {
                    let de = if local_x - pulo + 1 < 0 { 0 } else { local_x - pulo + 1 };
                    let ate = if local_x + pulo - 1 > ultimo_x { ultimo_x } else { local_x + pulo - 1 };
                    let mut x = de;
                    while x <= ate {
                        if x != local_x {
                            avaliar!(x);
                        }
                        x += 1;
                    }
                }
            }
        }

        let s = saida.offset((k * 4) as isize);
        if !tem_melhor {
            *s.offset(0) = -1;
            *s.offset(1) = 0;
            *s.offset(2) = 0;
            *s.offset(3) = 0;
            continue;
        }

        // Assenta: o relevo de cada coluna passa a ser a base da peça ali.
        let cols = *p_forma_cols.offset(melhor_forma as isize);
        let topo = zero.offset(*p_forma_topo.offset(melhor_forma as isize) as isize);
        let base_f = zero.offset(*p_forma_base.offset(melhor_forma as isize) as isize);
        let mut fundo = 0i32;
        for c in 0..cols {
            if *topo.offset(c as isize) < 0 {
                continue;
            }
            let ate = melhor_y + *base_f.offset(c as isize) + 1;
            *perfil.offset((melhor_x + c) as isize) = ate;
            if ate > fundo {
                fundo = ate;
            }
        }
        if fundo > fundo_max {
            fundo_max = fundo;
        }

        // As duas notas guardadas são (vazio, fundo) ou (fundo, vazio),
        // conforme a heurística — o vazio é sempre uma das duas.
        let vazio = if usa_vazio { melhor_p1 } else { melhor_p2 };

        *s.offset(0) = melhor_forma;
        *s.offset(1) = melhor_x;
        *s.offset(2) = melhor_y;
        *s.offset(3) = vazio as i32;
    }

    fundo_max
}
