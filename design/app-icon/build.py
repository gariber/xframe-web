"""PostCard App icon：產生淺色、深色兩份 SVG 原稿，再用 Chrome 輸出 1024px PNG，放進 Xcode 的 AppIcon。

定稿是「兩色一卡＋圓 p＋順著斜線的郵戳波浪」（2026-11-04 使用者挑選）。
深色版把卡片上半塊換成米白、p 換成墨色——原本的墨黑上半塊放在深色底上會整塊消失。

    python3 design/app-icon/build.py
"""
from pathlib import Path
import subprocess, tempfile

ROOT = Path(__file__).resolve().parent
APPICON = ROOT.parents[1] / 'ios/App/App/Assets.xcassets/AppIcon.appiconset'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

INK, CLAY, CREAM = '#1C1B1F', '#E5533D', '#F6EFE2'
CARD = 'x="322" y="172" width="380" height="680" rx="64"'
TOP = '300,150 730,150 730,400 300,590'
BOTTOM = '300,590 730,400 730,880 300,880'


def p_mark(cx, cy, r, w, desc, color, tilt=-8):
    """圓潤的小寫 p：圓環當肚子、圓頭的豎當尾巴。"""
    return (f'<g transform="rotate({tilt} {cx} {cy})" fill="none" stroke="{color}" stroke-width="{w}" stroke-linecap="round">'
            f'<circle cx="{cx}" cy="{cy}" r="{r}"/><path d="M{cx - r} {cy - r * 0.15:g}V{cy + r + desc}"/></g>')


def wave(x0, x1, y, amp, period):
    d, x, i = f'M{x0} {y}', x0, 0
    while x < x1 - 1:
        d += f' Q{x + period / 4:g} {y + (amp if i % 2 else -amp) * 2} {x + period / 2:g} {y}'
        x += period / 2
        i += 1
    return d


def icon(bg, top, p_color, wave_color):
    waves = ''.join(f'<path d="{wave(400, 640, y, 11, 54)}"/>' for y in (680, 730, 780))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs><clipPath id="card"><rect {CARD}/></clipPath></defs>
  <rect width="1024" height="1024" fill="{bg}"/>
  <g clip-path="url(#card)">
    <polygon points="{BOTTOM}" fill="{CLAY}"/>
    <polygon points="{TOP}" fill="{top}"/>
    <g transform="rotate(-24 512 720)" fill="none" stroke="{wave_color}" stroke-width="15" stroke-linecap="round">{waves}</g>
  </g>
  {p_mark(470, 316, 70, 40, 74, p_color)}
</svg>
'''


VARIANTS = {
    'light': icon(bg=CREAM, top=INK, p_color=CREAM, wave_color=CREAM),
    'dark': icon(bg='#141416', top=CREAM, p_color=INK, wave_color=CREAM),
}


def render(svg_path: Path, png_path: Path):
    with tempfile.TemporaryDirectory() as tmp:
        html = Path(tmp) / 'icon.html'
        html.write_text(f'<html><body style="margin:0">{svg_path.read_text()}</body></html>')
        shot = Path(tmp) / 'shot.png'
        subprocess.run([CHROME, '--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
                        '--window-size=1024,1024', f'--screenshot={shot}', html.as_uri()],
                       check=True, capture_output=True)
        # App Store 不收帶 alpha 的 icon：轉一次 JPEG 再轉回 PNG，把 alpha 通道拿掉。
        jpg = Path(tmp) / 'flat.jpg'
        subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '100', str(shot), '--out', str(jpg)], check=True, capture_output=True)
        subprocess.run(['sips', '-s', 'format', 'png', str(jpg), '--out', str(png_path)], check=True, capture_output=True)


if __name__ == '__main__':
    for name, svg in VARIANTS.items():
        svg_path = ROOT / f'postcard-{name}.svg'
        svg_path.write_text(svg)
        render(svg_path, ROOT / f'postcard-{name}.png')
    (APPICON / 'AppIcon-512@2x.png').write_bytes((ROOT / 'postcard-light.png').read_bytes())
    (APPICON / 'AppIcon-dark.png').write_bytes((ROOT / 'postcard-dark.png').read_bytes())
    print('done')
