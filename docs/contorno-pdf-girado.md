# Contorno dos PDFs e grade girada

A grade arredonda a largura e a altura para cima. Ao girá-la, a sobra passava
para a esquerda ou para cima, mas a arte gira pela dimensão física da página.
Isso deslocava a silhueta em até uma célula em relação à impressão. Uma falha
de folga na conferência fazia a tela refazer o encaixe pelo retângulo.

As máscaras agora descontam essa sobra nos deslocamentos de 90, 180 e 270 graus.
Os pixels da máscara e o engorde de segurança não mudam. A identidade do trabalho
passa a f5 para não restaurar posições calculadas com o deslocamento antigo.

Remover o fundo também descarta o reforço retangular anterior, permitindo que
a imagem modificada tenha o contorno reavaliado. A conferência de segurança
continua ativa e pode recusar o novo encaixe normalmente.

Teste determinístico: `node bancada/conferir-contorno-girado.cjs`.
Regressão de folga: `node bancada/conferir-folga-real.js`.
