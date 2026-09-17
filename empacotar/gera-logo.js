/*
 * ===========================================================================
 * A MARCA DO OPTMIZE PARA O TERMINAL — `esp/main/logo.c`
 * ===========================================================================
 *
 * O terminal não tem sistema de arquivos para carregar um PNG: a marca vai
 * gravada dentro do programa, como um vetor de bytes. Este script produz esse
 * vetor a partir da MESMA `estatico/icone.png` que o programa de computador
 * usa — e é isso que garante que as duas telas mostrem a mesma marca quando
 * alguém trocar o ícone.
 *
 *     node empacotar/gera-logo.js
 *
 * ---------------------------------------------------------------------------
 * POR QUE MAPA DE ALFA, E NÃO IMAGEM COLORIDA
 * ---------------------------------------------------------------------------
 *
 * A marca é de uma cor só. Guardar os canais de cor seria repetir o mesmo
 * laranja em cada pixel — quatro bytes onde um basta, e 64×64 pixels viram
 * 16 KB em vez de 4 KB.
 *
 * O ganho maior não é espaço, é tema: guardando só a opacidade, quem desenha
 * escolhe a cor (`lv_obj_set_style_image_recolor`). A marca segue o tema em vez
 * de carregar a própria cor, e aparece em cinza na barra e em laranja na tela
 * inicial sem virar dois arquivos.
 *
 * ---------------------------------------------------------------------------
 * OS DOIS TAMANHOS
 * ---------------------------------------------------------------------------
 *
 * 28 para a barra do topo, 64 para a tela inicial e o sobre. São gerados
 * separadamente, e não um reduzido do outro em tempo de execução, porque
 * reduzir 64 para 28 na placa borraria as bordas: o redutor do LVGL é uma
 * média simples, sem o filtro que o `sharp` aplica aqui.
 */

/* CommonJS como os vizinhos de `empacotar/`: o pacote nao e do tipo module. */
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const sharp = require('sharp')

const raiz = join(__dirname, '..')

const ORIGEM = join(raiz, 'estatico', 'icone.png')
const DESTINO = join(raiz, 'esp', 'main', 'logo.c')
const TAMANHOS = [28, 64]

/* Os bytes de um tamanho: só o canal alfa, uma linha por vez. */
async function alfaDe (tamanho) {
  const { data, info } = await sharp(ORIGEM)
    .resize(tamanho, tamanho, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  if (info.channels !== 4) {
    throw new Error(`esperava 4 canais, veio ${info.channels}`)
  }

  const alfa = Buffer.alloc(tamanho * tamanho)
  for (let i = 0; i < alfa.length; i++) {
    alfa[i] = data[i * 4 + 3]
  }
  return alfa
}

/*
 * Dezesseis bytes por linha, como o `lv_font_conv` também escreve.
 *
 * A última linha sai SEM a vírgula final. Ela seria válida em C, e a diferença
 * é invisível no resultado — mas sem isso o script deixa de reproduzir o
 * `logo.c` que já está versionado, e reproduzir byte a byte é a única prova de
 * que este gerador é mesmo o que produziu aquele arquivo.
 */
function emC (bytes) {
  const linhas = []
  for (let i = 0; i < bytes.length; i += 16) {
    const fatia = [...bytes.subarray(i, i + 16)]
    const ultima = i + 16 >= bytes.length
    linhas.push('    ' + fatia.map((b) => '0x' + b.toString(16).padStart(2, '0')).join(', ') +
                (ultima ? '' : ','))
  }
  return linhas.join('\n')
}

const cabecalho = `/*
 * ===========================================================================
 * A LOGO DO OPTMIZE — a mesma imagem do painel, em mapa de alfa
 * ===========================================================================
 *
 * Gerado de \`estatico/icone.png\` por \`gera-logo.js\`. Nao editar a mao.
 *
 * E UM MAPA DE ALFA, e nao uma imagem colorida. A marca e de uma cor so:
 * guardar os canais de cor seria repetir o mesmo laranja em cada pixel, quatro
 * bytes onde um basta. Assim o LVGL pinta a forma com a cor do estilo -- e a
 * logo segue o tema em vez de carregar a propria cor.
 *
 * Dois tamanhos porque sao os dois lugares onde ela aparece: 28 na barra do
 * topo, 64 na tela inicial e no sobre.
 */

#include "lvgl.h"
`

async function principal () {
  let saida = cabecalho

  for (const tamanho of TAMANHOS) {
    const bytes = await alfaDe(tamanho)
    saida += `
static const uint8_t bytes_da_logo_${tamanho}[] = {
${emC(bytes)}
};

const lv_image_dsc_t logo_${tamanho} = {
    .header = {
        .magic = LV_IMAGE_HEADER_MAGIC,
        .cf = LV_COLOR_FORMAT_A8,
        .w = ${tamanho},
        .h = ${tamanho},
        .stride = ${tamanho},
    },
    .data_size = sizeof(bytes_da_logo_${tamanho}),
    .data = bytes_da_logo_${tamanho},
};
`
  }

  /*
   * Se nada mudou, não reescreve: assim rodar o script não suja o `git status`
   * com um arquivo idêntico e uma data nova.
   */
  let antes = ''
  try { antes = readFileSync(DESTINO, 'utf8') } catch { /* primeira vez */ }

  if (antes === saida) {
    console.log('logo.c já está igual — nada a fazer')
  } else {
    writeFileSync(DESTINO, saida)
    console.log(`logo.c gerado (${TAMANHOS.join(' e ')} px)`)
  }
}

principal().catch((erro) => {
  console.error(erro.message)
  process.exit(1)
})
