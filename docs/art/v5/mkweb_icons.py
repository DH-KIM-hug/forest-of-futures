# 아이콘 판(docs/art/v5/icons/sheet1.png, 4x3, 투명)을 칸마다 오려 src/ui/proto/img/icons/*.webp 로
# 사용법: python3 mkweb_icons.py <repo>
import sys, os
import numpy as np
from PIL import Image

repo = sys.argv[1]
SRC = repo + '/docs/art/v5/icons/sheet1.png'
OUT = repo + '/src/ui/proto/img/icons/'
NAMES = ['phone', 'loan', 'board', 'book', 'news', 'sound_on', 'sound_off', 'acorn', 'lock', 'unlock', 'dice', 'fruit']
SIZE = 96  # 가장 큰 쪽 px(화면 최대 48px 의 2배)

def bands(mask, n):
    """알파가 있는 줄/칸의 덩어리 n 개(틈이 넓은 순으로 갈라)"""
    on = mask
    runs, start = [], None
    for i, v in enumerate(on):
        if v and start is None: start = i
        if not v and start is not None: runs.append([start, i]); start = None
    if start is not None: runs.append([start, len(on)])
    while len(runs) > n:  # 가장 좁은 틈을 메운다
        gaps = [runs[i + 1][0] - runs[i][1] for i in range(len(runs) - 1)]
        k = int(np.argmin(gaps)); runs[k][1] = runs[k + 1][1]; del runs[k + 1]
    assert len(runs) == n, runs
    return runs

im = Image.open(SRC).convert('RGBA')
a = np.array(im)[..., 3] > 16
os.makedirs(OUT, exist_ok=True)
rows = bands(a.any(axis=1), 3)
cells = []
for r0, r1 in rows:
    for c0, c1 in bands(a[r0:r1].any(axis=0), 4):
        cell = im.crop((c0, r0, c1, r1))
        cells.append(cell.crop(cell.split()[-1].point(lambda v: 255 if v > 16 else 0).getbbox()))
# 모든 칸을 같은 배율로(켬/끔, 잠김/열림 짝의 크기가 같게)
s = SIZE / max(max(c.size) for c in cells)
for i, cell in enumerate(cells):
    if True:
        cell = cell.resize((round(cell.width * s), round(cell.height * s)), Image.LANCZOS)
        cell.save(OUT + NAMES[i] + '.webp', 'WEBP', quality=88, method=6)
        print(NAMES[i], cell.size, os.path.getsize(OUT + NAMES[i] + '.webp'))
