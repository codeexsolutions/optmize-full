"""
As imagens do instalador (NSIS): a faixa da lateral e o cabeçalho.

O assistente do Windows é cinza e genérico; estas duas imagens são o que o
deixa com cara de Optmize, no mesmo desenho do lançador
(`empacotar/janela/lancador.html`): fundo escuro, a marca grande cortada pela
borda e o nome em tipo grande.

O NSIS só aceita BMP, e em tamanho fixo:
    lateral    164 x 314  (boas-vindas e fim da instalação)
    cabeçalho  150 x 57   (as páginas do meio)

Rodar de novo só quando a marca mudar:
    python empacotar/imagens-do-instalador.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
MARCA = Image.open(RAIZ / "public" / "icone.png").convert("RGBA")
SAIDA = RAIZ / "src-tauri" / "icons"

FUNDO = (13, 13, 15)
TEXTO = (244, 242, 239)
APAGADO = (143, 137, 131)
FONTES = Path("C:/Windows/Fonts")


def fonte(nome: str, tamanho: int) -> ImageFont.FreeTypeFont:
    try:
        return ImageFont.truetype(str(FONTES / nome), tamanho)
    except OSError:
        return ImageFont.load_default()


def marca(tamanho: int) -> Image.Image:
    return MARCA.resize((tamanho, tamanho), Image.LANCZOS)


def lateral() -> None:
    # Desenhada em 2x e reduzida: o texto sai mais limpo do que desenhado no
    # tamanho final.
    e = 2
    img = Image.new("RGB", (164 * e, 314 * e), FUNDO)
    grande = marca(250 * e)
    img.paste(grande, (54 * e, 150 * e), grande)

    d = ImageDraw.Draw(img)
    pequena = marca(16 * e)
    img.paste(pequena, (18 * e, 22 * e), pequena)
    d.text((40 * e, 22 * e), "CodeEx", font=fonte("segoeui.ttf", 11 * e), fill=APAGADO)
    d.text((16 * e, 58 * e), "Optmize", font=fonte("seguisb.ttf", 30 * e), fill=TEXTO)
    d.text((18 * e, 100 * e), "Moldes, encaixe", font=fonte("segoeui.ttf", 11 * e), fill=APAGADO)
    d.text((18 * e, 115 * e), "e impressão", font=fonte("segoeui.ttf", 11 * e), fill=APAGADO)

    img.resize((164, 314), Image.LANCZOS).save(SAIDA / "instalador-lateral.bmp")


def cabecalho() -> None:
    e = 2
    img = Image.new("RGB", (150 * e, 57 * e), FUNDO)
    m = marca(70 * e)
    img.paste(m, (96 * e, 10 * e), m)
    d = ImageDraw.Draw(img)
    d.text((12 * e, 16 * e), "Optmize", font=fonte("seguisb.ttf", 18 * e), fill=TEXTO)
    img.resize((150, 57), Image.LANCZOS).save(SAIDA / "instalador-cabecalho.bmp")


if __name__ == "__main__":
    lateral()
    cabecalho()
    print("imagens do instalador em", SAIDA)
