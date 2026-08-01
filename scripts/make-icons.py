#!/usr/bin/env python3
"""
產生擴充功能圖示。

設計上刻意呼應產品本身：背景是 backgrounds.ts 的 sunset 調色盤做的 mesh 漸層，
前景是一個代表「卡片」的圓角白框——這正是這個擴充功能在做的事（把推文放進一張
有漸層背景的卡片裡）。不是隨便挑一個字母當 logo。

在大尺寸與 16px 都要能辨識，所以卡片框的線條隨尺寸等比加粗，小尺寸時省略內部
細節，只留輪廓。
"""
from PIL import Image, ImageDraw, ImageFilter
import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "icons"
SIZES = [16, 32, 48, 128]

# backgrounds.ts 的 sunset 調色盤
C1, C2, C3, BASE = (0xFF, 0x7A, 0x45), (0xFF, 0x3D, 0x71), (0xFF, 0xB3, 0x47), (0x2B, 0x0F, 0x14)


def radial(img_size, center, radius, color):
    """畫一層徑向漸層，回傳 RGBA 圖層。"""
    layer = Image.new("RGBA", (img_size, img_size), color + (0,))
    px = layer.load()
    cx, cy = center
    for y in range(img_size):
        for x in range(img_size):
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            a = max(0.0, 1.0 - d / radius)
            px[x, y] = color + (int(255 * a * a),)
    return layer


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def build(size):
    # 用 4 倍超取樣再縮小，邊緣才乾淨
    S = size * 4
    img = Image.new("RGBA", (S, S), BASE + (255,))
    for center, radius, color in [
        ((S * 0.25, S * 0.30), S * 0.85, C1),
        ((S * 0.80, S * 0.22), S * 0.75, C2),
        ((S * 0.62, S * 0.88), S * 0.80, C3),
    ]:
        img.alpha_composite(radial(S, center, radius, color))

    d = ImageDraw.Draw(img)
    # 前景：代表推文卡片的圓角白框
    pad = S * 0.22
    stroke = max(2, int(S * 0.052))
    d.rounded_rectangle(
        [pad, pad * 1.15, S - pad, S - pad * 1.15],
        radius=S * 0.11, outline=(255, 255, 255, 235), width=stroke,
    )
    # 16px 以下放不進內部細節，只留輪廓
    if size >= 32:
        # 卡片內的兩條文字線，暗示「這裡面是一則推文」
        line_h = max(1, int(S * 0.035))
        x0, x1 = pad + S * 0.10, S - pad - S * 0.10
        for i, frac in enumerate([0.42, 0.58]):
            w = (x1 - x0) * (1.0 if i == 0 else 0.62)
            y = S * frac
            d.rounded_rectangle([x0, y, x0 + w, y + line_h], radius=line_h / 2, fill=(255, 255, 255, 200))

    img = img.filter(ImageFilter.GaussianBlur(S * 0.004))
    img = img.resize((size, size), Image.LANCZOS)
    img.putalpha(rounded_mask(size, max(2, int(size * 0.22))))
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for s in SIZES:
        p = OUT / f"icon{s}.png"
        build(s).save(p, "PNG", optimize=True)
        print(f"{p.name:14} {p.stat().st_size:>6} bytes")


if __name__ == "__main__":
    main()
