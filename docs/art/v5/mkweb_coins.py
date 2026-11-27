# 코인 로고(U-40)를 웹용으로 만든다. 생성 아님: 기준 그림(golden/coins/*.png)을 정사각 96px webp 로 줄인다.
# 사용법: python3 mkweb_coins.py <repo>
import sys
from PIL import Image
repo = sys.argv[1]
OUT = repo + '/src/ui/proto/img/coins/'
import os; os.makedirs(OUT, exist_ok=True)
S = 96
for k in ['DTC', 'BTH', 'SMS', 'MDT', 'JQQ', 'FLY']:
    im = Image.open(f'{repo}/docs/art/v5/golden/coins/{k}.png').convert('RGBA')
    bb = im.split()[-1].point(lambda v: 255 if v > 8 else 0).getbbox()
    im = im.crop(bb)
    side = max(im.size)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    sq = sq.resize((S, S), Image.LANCZOS)
    sq.save(OUT + k + '.webp', 'WEBP', quality=90, method=6)
    print(k, os.path.getsize(OUT + k + '.webp'))
