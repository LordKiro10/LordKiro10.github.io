#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera assets/img/og-qr3d.png (1200x630), la tarjeta social del sitio.
Paleta de ATLAS VALUE: blanco, azul #2563EB y verde #15803D.
Sin dependencias: escribe el PNG a mano (zlib + struct) y dibuja el texto con
una tipografia de mapa de bits 5x7 incluida aqui. Ejecutar desde la raiz:

    python scripts/generar-og.py
"""
import os
import struct
import zlib

W, H = 1200, 630
BG = (246, 248, 252)      # --bg
INK = (15, 23, 42)        # --ink
ACCENT = (37, 99, 235)    # azul de marca
GREEN = (21, 128, 61)     # verde de validado
MUTED = (86, 101, 121)    # --muted
WHITE = (255, 255, 255)
LINE = (227, 233, 243)

FONT = {
    "A": "01110 10001 10001 11111 10001 10001 10001",
    "B": "11110 10001 10001 11110 10001 10001 11110",
    "C": "01110 10001 10000 10000 10000 10001 01110",
    "D": "11110 10001 10001 10001 10001 10001 11110",
    "E": "11111 10000 10000 11110 10000 10000 11111",
    "F": "11111 10000 10000 11110 10000 10000 10000",
    "G": "01110 10001 10000 10111 10001 10001 01111",
    "H": "10001 10001 10001 11111 10001 10001 10001",
    "I": "11111 00100 00100 00100 00100 00100 11111",
    "J": "00111 00010 00010 00010 00010 10010 01100",
    "K": "10001 10010 10100 11000 10100 10010 10001",
    "L": "10000 10000 10000 10000 10000 10000 11111",
    "M": "10001 11011 10101 10101 10001 10001 10001",
    "N": "10001 11001 10101 10011 10001 10001 10001",
    "O": "01110 10001 10001 10001 10001 10001 01110",
    "P": "11110 10001 10001 11110 10000 10000 10000",
    "Q": "01110 10001 10001 10001 10101 10010 01101",
    "R": "11110 10001 10001 11110 10100 10010 10001",
    "S": "01111 10000 10000 01110 00001 00001 11110",
    "T": "11111 00100 00100 00100 00100 00100 00100",
    "U": "10001 10001 10001 10001 10001 10001 01110",
    "V": "10001 10001 10001 10001 10001 01010 00100",
    "W": "10001 10001 10001 10101 10101 11011 10001",
    "X": "10001 01010 00100 00100 00100 01010 10001",
    "Y": "10001 01010 00100 00100 00100 00100 00100",
    "Z": "11111 00001 00010 00100 01000 10000 11111",
    "0": "01110 10001 10011 10101 11001 10001 01110",
    "1": "00100 01100 00100 00100 00100 00100 01110",
    "2": "01110 10001 00001 00010 00100 01000 11111",
    "3": "11111 00010 00100 00010 00001 10001 01110",
    "4": "00010 00110 01010 10010 11111 00010 00010",
    "5": "11111 10000 11110 00001 00001 10001 01110",
    "6": "00110 01000 10000 11110 10001 10001 01110",
    "7": "11111 00001 00010 00100 01000 01000 01000",
    "8": "01110 10001 10001 01110 10001 10001 01110",
    "9": "01110 10001 10001 01111 00001 00010 01100",
    " ": "00000 00000 00000 00000 00000 00000 00000",
    ".": "00000 00000 00000 00000 00000 00000 00100",
    "-": "00000 00000 00000 11111 00000 00000 00000",
    "*": "00000 00000 00100 01110 00100 00000 00000",
}


class Canvas(object):
    def __init__(self, w, h, bg):
        self.w, self.h = w, h
        self.px = bytearray(bg * w * h)

    def rect(self, x0, y0, x1, y1, color):
        x0, y0 = max(0, int(x0)), max(0, int(y0))
        x1, y1 = min(self.w, int(x1)), min(self.h, int(y1))
        row = bytes(color) * max(0, x1 - x0)
        for y in range(y0, y1):
            o = (y * self.w + x0) * 3
            self.px[o:o + len(row)] = row

    def text(self, s, x, y, scale, color, spacing=1):
        cx = x
        for ch in s.upper():
            glyph = FONT.get(ch)
            if glyph is None:
                cx += (5 + spacing) * scale
                continue
            rows = glyph.split(" ")
            for r, bits in enumerate(rows):
                for c, b in enumerate(bits):
                    if b == "1":
                        self.rect(cx + c * scale, y + r * scale,
                                  cx + (c + 1) * scale, y + (r + 1) * scale, color)
            cx += (5 + spacing) * scale
        return cx

    def text_width(self, s, scale, spacing=1):
        return len(s) * (5 + spacing) * scale - spacing * scale

    def write(self, path):
        raw = bytearray()
        stride = self.w * 3
        for y in range(self.h):
            raw.append(0)                                  # filtro "None"
            raw += self.px[y * stride:(y + 1) * stride]

        def chunk(tag, data):
            return (struct.pack(">I", len(data)) + tag + data +
                    struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))

        png = (b"\x89PNG\r\n\x1a\n" +
               chunk(b"IHDR", struct.pack(">IIBBBBB", self.w, self.h, 8, 2, 0, 0, 0)) +
               chunk(b"IDAT", zlib.compress(bytes(raw), 9)) +
               chunk(b"IEND", b""))
        with open(path, "wb") as f:
            f.write(png)
        return len(png)


def fake_qr(cv, x, y, size, n, dark, light):
    """Dibuja un patron con aspecto de QR (decorativo, solo para la tarjeta)."""
    m = size / float(n)
    cv.rect(x, y, x + size, y + size, light)
    seed = 20260831

    def rnd():
        nonlocal seed
        seed = (seed * 1103515245 + 12345) & 0x7fffffff
        return seed / float(0x7fffffff)

    def finder(fx, fy):
        cv.rect(x + fx * m, y + fy * m, x + (fx + 7) * m, y + (fy + 7) * m, dark)
        cv.rect(x + (fx + 1) * m, y + (fy + 1) * m, x + (fx + 6) * m, y + (fy + 6) * m, light)
        cv.rect(x + (fx + 2) * m, y + (fy + 2) * m, x + (fx + 5) * m, y + (fy + 5) * m, dark)

    for r in range(n):
        for c in range(n):
            in_finder = ((r < 8 and c < 8) or (r < 8 and c >= n - 8) or (r >= n - 8 and c < 8))
            mid = (n // 2 - 2 <= r <= n // 2 + 2) and (n // 2 - 2 <= c <= n // 2 + 2)
            if in_finder or mid:
                continue
            if rnd() < 0.47:
                cv.rect(x + c * m, y + r * m, x + (c + 1) * m, y + (r + 1) * m, dark)
    finder(0, 0)
    finder(n - 7, 0)
    finder(0, n - 7)
    # hueco central, como cuando se pone un logo
    cv.rect(x + (n // 2 - 2) * m, y + (n // 2 - 2) * m,
            x + (n // 2 + 3) * m, y + (n // 2 + 3) * m, light)
    cv.rect(x + (n // 2 - 1) * m, y + (n // 2 - 1) * m,
            x + (n // 2 + 2) * m, y + (n // 2 + 2) * m, ACCENT)


def main():
    cv = Canvas(W, H, BG)
    # filo superior: azul y, al final, el verde de la marca
    cv.rect(0, 0, W, 12, ACCENT)
    cv.rect(int(W * 0.72), 0, W, 12, GREEN)

    # ---- tarjeta derecha con el codigo ----
    card_x, card_y, card_s = 706, 112, 396
    cv.rect(card_x - 4, card_y - 4, card_x + card_s + 4, card_y + card_s + 4, LINE)
    cv.rect(card_x, card_y, card_x + card_s, card_y + card_s, WHITE)
    fake_qr(cv, card_x + 30, card_y + 30, card_s - 60, 29, INK, WHITE)

    # sombra/relieve: una copia desplazada en el color de acento
    cv.rect(card_x + card_s + 4, card_y + 22, card_x + card_s + 22, card_y + card_s + 4, ACCENT)
    cv.rect(card_x + 22, card_y + card_s + 4, card_x + card_s + 22, card_y + card_s + 22, ACCENT)

    # ---- texto izquierda ----
    x = 84
    cv.text("3DQRGENERATOR", x, 84, 5, ACCENT, spacing=2)
    cv.rect(x, 132, x + 445, 139, ACCENT)

    cv.text("QR PARA", x, 184, 9, INK, spacing=2)
    cv.text("IMPRIMIR", x, 260, 9, INK, spacing=2)
    cv.text("EN 3D", x, 336, 9, GREEN, spacing=2)

    cv.text("3MF A DOS COLORES . PNG . SVG", x, 432, 3, MUTED, spacing=1)
    cv.text("GRATIS Y SIN REGISTRO", x, 466, 3, MUTED, spacing=1)
    cv.text("POR KIRO INVERSIONES", x, 508, 3, ACCENT, spacing=1)

    out = os.path.join("assets", "img", "og-qr3d.png")
    if not os.path.isdir(os.path.dirname(out)):
        os.makedirs(os.path.dirname(out))
    n = cv.write(out)
    print("OK %s (%d bytes, %dx%d)" % (out, n, W, H))


if __name__ == "__main__":
    main()
