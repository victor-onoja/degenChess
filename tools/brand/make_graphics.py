"""Brand graphics for DegenChess, built with the level-1 image generator skill (code-drawn, no image model).

  python3 tools/brand/make_graphics.py

Writes public/brand/title-card.png (16:9, for video intros and slides) and
public/brand/poster.png (9:16, for stories and reels).
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, ".claude/skills/level-1-image-generator/lib"))
from render import Design  # noqa: E402

INK = (6, 9, 8)
BULL = (0, 255, 102)
BEAR = (255, 51, 85)
GOLD = (255, 210, 63)
WHITE = (255, 255, 255)
MUTED = (150, 175, 160)


def candles(d, x0, x1, base_y, height, seed, count):
    """A row of candlesticks: the market the two armies fight over."""
    state = seed
    price = 0.5
    step = (x1 - x0) / count
    for i in range(count):
        state = (state * 16807) % 2147483647
        delta = ((state % 1000) / 1000 - 0.47) * 0.34
        new_price = min(max(price + delta, 0.08), 0.95)
        up = new_price >= price
        color = BULL if up else BEAR
        top = base_y - max(price, new_price) * height
        bottom = base_y - min(price, new_price) * height
        if bottom - top < 0.012:
            bottom = top + 0.012
        cx = x0 + step * (i + 0.5)
        d.line(cx, top - 0.03, cx, bottom + 0.03, 3, color)
        d.rect(cx - step * 0.3, top, cx + step * 0.3, bottom, color, radius=4, glow={"color": color})
        price = new_price


def board(d, cx, cy, size, squares=8):
    """A flat chessboard, half lit green and half red, fading out."""
    cell = size / squares
    for row in range(squares):
        for col in range(squares):
            if (row + col) % 2:
                continue
            x = cx - size / 2 + col * cell
            y = cy - size / 2 + row * cell * d.W / d.H
            shade = 26 + int(22 * (1 - row / squares))
            tint = (shade // 3, shade, shade // 2) if col < squares / 2 else (shade, shade // 3, shade // 2)
            d.rect(x, y, x + cell, y + cell * d.W / d.H, tint)


def title_card():
    d = Design("16:9")
    d.fill(INK)
    d.mesh_gradient([
        (0.12, 0.85, (0, 70, 34), 0.38),
        (0.88, 0.85, (90, 12, 30), 0.38),
        (0.5, 0.1, (8, 14, 11), 0.6),
    ])
    candles(d, 0.04, 0.96, 0.97, 0.2, seed=11, count=34)
    d.vignette(strength=0.55)
    d.write(0.5, 0.2, "D E G E N C H E S S", role="pixel", size=34, color=BULL, align="center", glow={"color": BULL})
    size = d.fit_size("Every capture", 0.7, role="grotesque", weight="bold")
    d.write(0.5, 0.45, "Every capture", role="grotesque", weight="bold", size=size, color=WHITE, align="center", shadow=True)
    d.write(0.5, 0.45 + size / d.H * 1.02, "pays.", role="grotesque", weight="bold", size=size, align="center",
            gradient=[(0, GOLD), (0.55, (61, 255, 139)), (1, (0, 217, 87))], glow={"color": (61, 255, 139)})
    d.write(0.5, 0.9, "STAKED CHESS ON MONAD   /   ONE PASSKEY, NO WALLET   /   REFEREED BY CHAINLINK",
            role="mono", size=22, color=MUTED, align="center", tracking=2, shadow=True)
    out = os.path.join(ROOT, "public/brand/title-card.png")
    d.save(out, grain=5, chroma=2, saturation=1.08)
    return out


def poster():
    d = Design("9:16")
    d.fill(INK)
    d.mesh_gradient([
        (0.1, 0.62, (0, 80, 38), 0.45),
        (0.9, 0.62, (100, 14, 34), 0.45),
        (0.5, 0.08, (8, 14, 11), 0.5),
    ])
    candles(d, 0.06, 0.94, 0.86, 0.2, seed=29, count=16)
    d.vignette(strength=0.5)
    d.write(0.5, 0.1, "D E G E N C H E S S", role="pixel", size=30, color=BULL, align="center", glow={"color": BULL})
    size = d.fit_size("capture", 0.82, role="grotesque", weight="bold")
    y = 0.3
    for line, color in (("Every", WHITE), ("capture", WHITE)):
        d.write(0.5, y, line, role="grotesque", weight="bold", size=size, color=color, align="center", shadow=True)
        y += size / d.H * 0.98
    d.write(0.5, y, "pays.", role="grotesque", weight="bold", size=size, align="center",
            gradient=[(0, GOLD), (0.55, (61, 255, 139)), (1, (0, 217, 87))], glow={"color": (61, 255, 139)})
    d.write(0.5, 0.925, "Take a piece. Take its value.", role="grotesque", size=40, color=WHITE, align="center", shadow=True)
    d.write(0.5, 0.96, "DEGEN-CHESS.VERCEL.APP", role="mono", size=24, color=MUTED, align="center", tracking=3)
    out = os.path.join(ROOT, "public/brand/poster.png")
    d.save(out, grain=5, chroma=2, saturation=1.08)
    return out


if __name__ == "__main__":
    for path in (title_card(), poster()):
        print("wrote", os.path.relpath(path, ROOT))
