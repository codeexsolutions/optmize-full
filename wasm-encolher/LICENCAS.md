# Licenças do que vai dentro do `encolher_bg.wasm`

O `src/motores/encolher/encolher_bg.wasm` é código de terceiros compilado, e vai
dentro do programa instalado. As licenças abaixo pedem duas coisas de quem
distribui: manter os avisos de copyright (MIT) e dizer onde está o código-fonte
do que é MPL. Os dois estão aqui.

## sparrow — MIT

github.com/JeroenGar/sparrow, commit `7f0e10f946f70a86138d3938548a13ee46464f39`,
usado sem modificação.

```
MIT License

Copyright (c) 2025 Jeroen Gardeyn, KU Leuven

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## jagua-rs 0.8.3 — MPL-2.0

A base de detecção de colisão do sparrow. Usada **sem modificação**; o
código-fonte desta versão está em https://crates.io/crates/jagua-rs/0.8.3 e em
https://github.com/JeroenGar/jagua-rs. A MPL-2.0 vale arquivo por arquivo: ela
não se estende ao resto do programa. Se um dia algum arquivo do jagua-rs for
alterado, a alteração tem de ser publicada sob a mesma licença.

## O resto das dependências

rand, serde, wasm-bindgen, rayon e as demais são MIT e/ou Apache-2.0 (mais uma
Zlib e uma Unicode-3.0), todas permissivas. A lista exata, com a licença de
cada uma, sai de:

```
cd wasm-encolher
cargo tree --target wasm32-unknown-unknown -e normal --prefix none --format "{p} {l}"
```
