# O formato `.ads` da Audaces

Formato fechado, sem documentação pública. Este documento é o contrato do
leitor (`src/motores/audacesAds.js`): **campo que não está aqui não é lido.**
Cada campo diz onde fica, o tipo, o que quer dizer e em que arquivos foi
conferido.

Arquivos de conferência (da fábrica, fora do git, em `D:\uso de teste`):
`SAIA BABADO CURTO.ads`, `SHORT TACTEL.ads`, `PIJAMA INF. (M).ADS`,
`PIJAMA INF. (G).ADS`.

Números são little-endian. Textos são Windows-1252 (o "Ó" de "CÓS" é `0xD3`).
Coordenadas são `double` (8 bytes), em centímetros.

## Cabeçalho

| Posição | Tipo | O que é | Conferido em |
|---|---|---|---|
| `0x00`–`0x0a` | texto, 11 bytes | `"CADZ vs6.0 "` — assinatura e versão | os 4 |
| `0x0b` | `u8` | `0x1a` | os 4 |
| `0x0c` | `u32` | número de peças (saia 4, short 6, pijama M 8, pijama G 8) | os 4, contra as fichas |
| `0x26` | `u16` | tamanho do nome do molde | os 4 |
| `0x28` | texto | nome do molde ("SAIA BABADO CURTO", "PIJAMA INF(G)") | os 4 |
| depois do nome | 6 bytes | **não decifrado** | — |
| depois dos 6 bytes | `u32` | tamanho da miniatura, em bytes | os 4 |
| em seguida | JPEG | miniatura (`FF D8 FF …`), o molde desenhado pela Audaces | os 4, aberta |

Depois da miniatura começam os blocos de dados; o primeiro tem a etiqueta
`LIG`.

Versão diferente de `vs6.0` é **recusada** pelo leitor.

## Textos

`u16` com o tamanho + os bytes do texto.

**Ficha da peça:** o nome da peça com a quantidade no fim ("COSTA 2X",
"FAIXA DE CABELO 2X"), e logo depois outro texto com um rótulo livre
("SAIA BABADO CURTO ", " PIJAMA INF. G"). No short, "VIEIS 1X" vem sem
rótulo. O número de fichas é o número de peças do cabeçalho nos 4 arquivos.

## Tabela de tamanhos

Uma por peça, registros de **20 bytes** seguidos:

| Deslocamento | Tipo | O que é |
|---|---|---|
| 0 | 3 × `u8` | cor R, G, B |
| 3 | `u8` | 0 |
| 4 | `u32` | ativo (1 = em uso) |
| 8 | `u8` | 1 |
| 9 | 3 bytes | nome do tamanho, completado com zero (`P\0\0`, `GG\0`) |
| 12 | 8 bytes | **não decifrado**; `ef 1a 77 00 0c 3f 7d 00` nos 4 arquivos — o leitor usa como assinatura do registro |

Depois do último registro vem outro bloco (`05 00 02 00` na saia, `06 00 00 00`
no pijama G) — **não decifrado**.

| Arquivo | Tamanhos (cor, ativo) |
|---|---|
| Saia, Short | P `#00ff00`, M `#ff0000`, G `#00ffff`, GG `#ff8000` — todos ativos |
| Pijama M | M `#ff0000` |
| Pijama G | G `#ff0000` (na saia o G é ciano: a cor é escolhida por arquivo) |

## Não decifrado ainda

- O desenho de cada tamanho (contorno por tamanho, ou regra por ponto).
- Os trechos retos do contorno (os curvos já saem: `u16 tipo, u16 n, n pares
  de double`, conferidos contra a miniatura da saia) e a peça retangular
  (BARRA da saia).
- Piques e fio.
- Qual tamanho é o base.
- Os 6 bytes depois do nome, os 8 bytes do fim de cada registro de tamanho e o
  bloco depois da tabela.

A sondagem (`bancada/audaces/sondar.mjs`) é o caminho para fechar estes itens.
