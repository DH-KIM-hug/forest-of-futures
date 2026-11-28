# 거래소 화면 그림(GPT, codex)의 웹 사본: docs/art/v5/ui/*.png → src/ui/proto/img/ui/*.webp
# 둘씩 그린 그림(pair_*)은 투명한 세로 틈에서 갈라 왼쪽, 오른쪽으로 나눈다. 투명 그림은 알파 테두리 상자로 오린다.
# 판(9조각) 그림은 오린 뒤 가로 폭만 맞춘다(테두리 두께는 CSS border-image 에서 px 로 정한다).
# 사용법: python3 mkweb_ui.py <repo>
import sys
import numpy as np
from PIL import Image

repo = sys.argv[1]
RAW = repo + '/docs/art/v5/ui/'
OUT = repo + '/src/ui/proto/img/ui/'


def bbox(im, th=12):
    return im.split()[-1].point(lambda v: 255 if v > th else 0).getbbox()


def trim(im):
    return im.crop(bbox(im))


def split2(im):
    """알파가 빈 세로 띠 중 가운데에 가장 가까운 것에서 둘로 가른다"""
    a = np.array(im)[..., 3] > 12
    cols = a.any(axis=0)
    w = len(cols)
    gaps = [x for x in range(w) if not cols[x]]
    # 그림 사이의 빈 칸들: 양쪽에 그림이 있는 것만
    first, last = np.argmax(cols), w - 1 - np.argmax(cols[::-1])
    inner = [x for x in gaps if first < x < last]
    if not inner:
        raise SystemExit('pair split failed')
    mid = min(inner, key=lambda x: abs(x - (first + last) / 2))
    L = trim(im.crop((0, 0, mid, im.height)))
    R = trim(im.crop((mid, 0, w, im.height)))
    return L, R


def save(im, name, width=None, height=None, q=82):
    if width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    elif height:
        im = im.resize((round(im.width * height / im.height), height), Image.LANCZOS)
    im.save(OUT + name + '.webp', 'WEBP', quality=q, method=6)
    print(f'  {name}: {im.size}')


def load(n):
    return Image.open(RAW + n + '.png').convert('RGBA')


import os
os.makedirs(OUT, exist_ok=True)

# 불투명 그림
save(load('bg_desk').convert('RGB'), 'bg_desk', width=720, q=72)
p = load('screen_paper').convert('RGB')
s = min(p.size); p = p.crop(((p.width - s) // 2, (p.height - s) // 2, (p.width + s) // 2, (p.height + s) // 2))
# 숫자가 잘 읽히게 종이를 크림 쪽으로 반쯤 섞는다(무늬는 남고 노란 기가 빠진다)
p = Image.blend(p, Image.new('RGB', p.size, (255, 249, 233)), 0.55)
save(p, 'screen_paper', width=512, q=70)

# 판(9조각)
save(trim(load('plaque_header')), 'plaque_header', width=520)
save(trim(load('board_chart')), 'board_chart', width=640)
save(trim(load('panel_note')), 'panel_note', width=640)
save(trim(load('plaque_result')), 'plaque_result', width=640)
save(trim(load('ruler_track')), 'ruler_track', width=640)

# 둘씩
for n, a, b, w in [('pair_coin', 'coin_plate', 'coin_plate_on', 120), ('pair_long', 'btn_long', 'btn_long_down', 380),
                   ('pair_short', 'btn_short', 'btn_short_down', 380), ('pair_chip', 'chip', 'chip_on', 180)]:
    L, R = split2(load(n))
    save(L, a, width=w); save(R, b, width=w)
L, R = split2(load('pair_knob'))
save(L, 'knob_acorn', height=96); save(R, 'peg', height=36)
L, R = split2(load('pair_icons'))
save(L, 'tab_map', height=128); save(R, 'tab_phone', height=128)

# 종목 소개 카드(회차 추가 요청): 세로 종이 카드, 9조각
save(trim(load('info_card')), 'info_card', width=560)
