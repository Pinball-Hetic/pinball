#!/usr/bin/env python3
"""Quantifie une image en frame ASCII palette .:#@! pour les clips DMD.

Usage:
    python3 tools/ascii-quantize.py <image> <cols>
    # → stdout : frame palette .:#@! (52 cols recommandés pour la grille 96×32)

Palette de sortie :
    '.' éteint   ':' dim   '#' mid   '@' full   '!' accent (rouge saturé)

Dépendances : pillow + numpy
    pip install pillow numpy

L'équipe peut générer d'autres frames (nouveaux boss, logos…) puis les
coller dans apps/dmd/src/dmd/clips/ comme template literal — voir
demogorgonHero.ts. Les animations (revealRadial, dissolve) se dérivent
procéduralement d'une frame statique.
"""
from PIL import Image
import numpy as np, sys

src, cols = sys.argv[1], int(sys.argv[2])
img = Image.open(src).convert('RGB')
w, h = img.size
img = img.crop((0, 0, w, int(h * 0.91)))   # drop watermark bas
w, h = img.size
rows = max(1, round(h / w * cols * 0.5))
img = img.resize((cols, rows), Image.LANCZOS)
a = np.asarray(img).astype(float)
r, g, b = a[...,0], a[...,1], a[...,2]
lum = 0.299*r + 0.587*g + 0.114*b
bg = (lum > 215) & (abs(r-g) < 18) & (abs(g-b) < 18)
red = (r > 90) & (r > g*1.35) & (r > b*1.35) & ~bg
dark = 255 - lum
out = []
for y in range(rows):
    line = []
    for x in range(cols):
        if bg[y,x]: line.append('.')
        elif red[y,x]: line.append('!')
        else:
            d = dark[y,x]
            line.append('.' if d < 40 else ':' if d < 90 else '#' if d < 150 else '@')
    out.append(''.join(line))
print('\n'.join(out))
