# Exportação sem peças omitidas

A montagem não ignora mais artes ausentes, ilegíveis ou com falha de desenho.
Todas as chaves das posições são conferidas antes da geração. O PDF é montado
em arquivo temporário e só é disponibilizado depois de concluir a gravação;
falhas retornam uma mensagem em vez de um PDF parcialmente preenchido.
A cota só é solicitada depois da montagem bem-sucedida.

As artes continuam em disco, sem acumular o PDF inteiro em memória. A validade
da sessão é renovada a cada envio e exportação; sessões em uso não expiram.
O arquivo temporário de saída é removido após o download ou em caso de erro.

Validação: `node bancada/conferir-pdf-completo.cjs` cobre cópias repetidas,
arte ausente, arte corrompida, envio por mais de dez minutos, reutilização
entre bancadas e limpeza das sessões. `node bancada/conferir-pdf.js` confere
dimensões, páginas, transparência e preservação dos pixels.
