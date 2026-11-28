# 원본 PNG → 게임 웹 사본. 엔딩: 640x800(4:5) src/ui/proto/img/endings/{id}.webp, 새 만화 컷: 1080x720 src/ui/proto/img/manga/cut_{k}.webp
import os, glob
from PIL import Image, ImageOps
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../../..'))
os.makedirs(f'{ROOT}/src/ui/proto/img/endings', exist_ok=True)
n = 0
for f in sorted(glob.glob(f'{ROOT}/docs/art/v5/endings_lite/LE*.png')):
    if f.endswith('.raw.png'): continue
    im = ImageOps.fit(Image.open(f).convert('RGB'), (640, 800), Image.LANCZOS)
    im.save(f'{ROOT}/src/ui/proto/img/endings/{os.path.basename(f)[:-4]}.webp', 'WEBP', quality=70, method=6); n += 1
for k in ['knock', 'sign', 'streak', 'read', 'lev100']:
    f = f'{ROOT}/docs/art/v5/manga/c_{k}.png'
    if not os.path.exists(f): continue
    im = ImageOps.fit(Image.open(f).convert('RGB'), (1080, 720), Image.LANCZOS)
    im.save(f'{ROOT}/src/ui/proto/img/manga/cut_{k}.webp', 'WEBP', quality=82, method=6); n += 1
print(n, 'webp')
