"""Deterministic landing photo for Backcross (docs/adr/0009, amended 2026-09-29).

Usage:  py -3 scripts/process-hero.py <source.jpg> <out.webp>

Crops the source to 2:1 anchored 4 % above the bottom edge (plots and treeline,
a band of sky), resizes to 1200 x 600, and maps luminance onto a duotone from
soil-900 #2e2419 through #8a785e to parchment-100 #f3ecdc, so the photograph
is built from the chrome's own tokens and never competes with the Okabe-Ito
class colours. Requires Pillow (py -3 -m pip install pillow); no other tool.
Source: USDA ARS image D4630-1, photo by Anna Locke, public domain,
https://www.ars.usda.gov/ARSUserFiles/oc/images/photos/300dpi/kesa/D4630-1.jpg
"""
import sys
from PIL import Image, ImageOps

src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
w, h = im.size
nh = w // 2
top = h - nh - int(0.04 * h)
im = im.crop((0, top, w, top + nh))
grey = ImageOps.autocontrast(ImageOps.grayscale(im), cutoff=1)
duo = ImageOps.colorize(grey, black=(0x2E, 0x24, 0x19), white=(0xF3, 0xEC, 0xDC),
                        mid=(0x8A, 0x78, 0x5E), midpoint=128)
duo = duo.resize((1200, 600), Image.LANCZOS)
duo.save(out, "WEBP", quality=78, method=6)
print(out, duo.size)
