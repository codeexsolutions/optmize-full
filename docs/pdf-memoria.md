# Memória na leitura e exportação de PDFs

A prévia de trabalho usa no máximo 3072 pixels no maior lado. As medidas físicas continuam vindo da página do PDF ou da resolução do arquivo de imagem. A exportação reabre o original: PDFs continuam em 300 dpi e imagens mantêm seus pixels originais.

As leituras de PDF passam por uma fila para não manter vários decodificadores de imagens grandes ativos ao mesmo tempo. Cada leitura libera seu canvas e aguarda o encerramento da tarefa do PDF.js, inclusive se houver erro.

Na exportação, o PDF vai como veio (vetor) com o `giro`, e o servidor o aplica. Só quando o servidor não abre o arquivo entra a reserva `desenharPecaGirada`: o PDF é desenhado já na rotação final e devolve apenas o PNG, com `giro: 0`, sem criar um bitmap e outro canvas do mesmo tamanho. Imagens e artes sem fundo continuam sem giro na reserva, com o giro por conta do servidor.

## Verificação

Execute `node bancada/conferir-pdf-memoria.cjs`. O teste usa Vite e Puppeteer locais e verifica recuperação após PDF inválido, leituras concorrentes, medidas de uma página com rotação própria, os quatro giros da reserva, a preparação das artes (vetor e giro total), cores, transparência e descarte dos canvases. Não acessa o banco de produção.

Execute também `npm run tipos`, `npm run front`, `npm run bancada:pdf` e `npm run bancada:arte`. Bancadas que carregam o servidor devem usar `OPTIMIZE_DADOS` apontando para uma pasta de teste.
