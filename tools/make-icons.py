#!/usr/bin/env python3
"""make-icons.py — génère les icônes de 5ud0ku (grille de sudoku 3x3 blocs avec quelques chiffres).

Usage : python tools/make-icons.py   (depuis la racine du dépôt ; nécessite Pillow)
Écrit icon-180.png, icon-192.png, icon-512.png et icon-maskable-512.png (zone de sécurité de 80 %).
Licence : GPL-3.0-or-later (voir LICENSE.txt).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

BG = (36, 86, 184)      # bleu de l'accent
PAPER = (245, 246, 248)
INK = (28, 31, 38)
DIGITS = {(0, 0): "5", (1, 4): "3", (2, 8): "9", (4, 2): "7", (5, 6): "1", (7, 1): "4", (8, 5): "8", (6, 7): "2", (3, 3): "6"}


def font(size):
    for name in ("arialbd.ttf", "DejaVuSans-Bold.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def draw(size, margin_ratio):
    img = Image.new("RGB", (size, size), BG)
    d = ImageDraw.Draw(img)
    m = int(size * margin_ratio)
    side = size - 2 * m
    cell = side / 9
    d.rounded_rectangle([m, m, m + side, m + side], radius=int(side * 0.06), fill=PAPER)
    for i in range(10):
        w = max(2, int(side * (0.018 if i % 3 == 0 else 0.006)))
        pos = m + i * cell
        d.line([(pos, m), (pos, m + side)], fill=INK, width=w)
        d.line([(m, pos), (m + side, pos)], fill=INK, width=w)
    f = font(int(cell * 0.72))
    for (r, c), ch in DIGITS.items():
        cx = m + (c + 0.5) * cell
        cy = m + (r + 0.5) * cell
        d.text((cx, cy), ch, fill=INK, font=f, anchor="mm")
    return img


def main():
    root = Path(__file__).resolve().parent.parent
    for name, size, margin in (("icon-180.png", 180, 0.07), ("icon-192.png", 192, 0.07), ("icon-512.png", 512, 0.07), ("icon-maskable-512.png", 512, 0.16)):
        draw(size, margin).save(root / name)
        print("écrit", name)


if __name__ == "__main__":
    main()
