# 회차 6 그림(U-46): 생성 아님 — 걷기 두 걸음(A = 이미 쓰는 그림, B = 반대 발, raw/*_b.png)의 웹 사본.
# B 는 A 와 같은 판에 같은 크기로 맞춘다: 두 그림의 알파 테두리 상자(머리 위 · 가로 가운데)를 맞춰 옮긴 뒤 A 의 테두리 상자로 오린다
# → 두 webp 의 크기 · 배율 · 발 기준선(아래 가운데)이 같아 번갈아 껴도 떨리지 않는다. A 는 예전과 같은 셈으로 다시 만든다(크기 그대로).
# walk_empty_b 는 A 보다 조금 밝다: 털(외곽선이 아닌 불투명 칸)의 채널별 평균 · 표준편차를 A 에 맞춘다.
# 사용법: python3 mkweb_art6.py <repo>
import sys
import numpy as np
from PIL import Image
repo = sys.argv[1]
RAW = repo + '/docs/art/v5/raw/'
OUT = repo + '/src/ui/proto/img/v5/'
H = 300
def bbox(im): return im.split()[-1].point(lambda v: 255 if v > 8 else 0).getbbox()
def fur(a): lum = a[..., 0] * 0.3 + a[..., 1] * 0.59 + a[..., 2] * 0.11; return (a[..., 3] > 200) & (lum > 110)
def match(b, a):
    """b 의 털 색을 a 에 맞춘다(채널마다 평균 · 표준편차). 외곽선 · 투명은 그대로"""
    fa, fb = fur(a), fur(b)
    out = b.copy()
    for c in range(3):
        ma, sa = a[..., c][fa].mean(), a[..., c][fa].std()
        mb, sb = b[..., c][fb].mean(), b[..., c][fb].std()
        ch = (b[..., c] - mb) * (sa / max(sb, 1e-6)) + ma
        out[..., c] = np.where(fb, ch, b[..., c])
    return out.clip(0, 255)
for n, norm in [('c_hero_walk_back', False), ('c_hero_walk_front', False), ('c_hero_walk_empty', True)]:
    A = Image.open(RAW + n + '.png').convert('RGBA'); B = Image.open(RAW + n + '_b.png').convert('RGBA')
    ba, bb = bbox(A), bbox(B)
    dx = round(((ba[0] + ba[2]) - (bb[0] + bb[2])) / 2); dy = ba[1] - bb[1]   # 머리 위 · 가로 가운데를 맞춘다
    B2 = Image.new('RGBA', B.size, (0, 0, 0, 0)); B2.paste(B, (dx, dy), B)
    if norm:
        B2 = Image.fromarray(match(np.array(B2).astype(np.float32), np.array(A).astype(np.float32)).astype('uint8'), 'RGBA')
    k = H / (ba[3] - ba[1])
    for im, name in [(A, n), (B2, n + '_b')]:
        c = im.crop(ba); c = c.resize((round(c.width * k), H), Image.LANCZOS)
        c.save(OUT + name + '.webp', 'WEBP', quality=88, method=6)
        print(f'  {name}: {c.size} (옮김 {dx},{dy})' if name.endswith('_b') else f'  {name}: {c.size}')
