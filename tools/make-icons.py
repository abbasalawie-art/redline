# Turns the icon SVGs into the PNG sizes iOS and Android want.
import pathlib, pymupdf
icons = pathlib.Path(__file__).resolve().parent.parent / "app" / "icons"
def render(svg, out, size):
    doc = pymupdf.open(icons / svg)
    page = doc[0]
    z = size / page.rect.width
    page.get_pixmap(matrix=pymupdf.Matrix(z, z), alpha=False).save(icons / out)
    print(out, size)
render("icon.svg", "icon-180.png", 180)
render("icon.svg", "icon-192.png", 192)
render("icon.svg", "icon-512.png", 512)
render("icon-maskable.svg", "icon-maskable-512.png", 512)
