# 라이트 엔딩 40개 연락 시트(docs/gdd/fun_log/lite_endings.png): 그림과 번호, 제목
import json, os
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../../..'))
data = json.load(open(f'{ROOT}/data/endings_lite.json'))['endings']
F = '/System/Library/Fonts/AppleSDGothicNeo.ttc'
ft = ImageFont.truetype(F, 22, index=6); fs = ImageFont.truetype(F, 15, index=0); fh = ImageFont.truetype(F, 34, index=6)
W, H, T, C = 320, 400, 64, 8
rows = (len(data) + C - 1) // C
o = Image.new('RGB', (C * (W + 12) + 12, 70 + rows * (H + T + 12)), '#1D1B19'); d = ImageDraw.Draw(o)
d.text((14, 16), f'선물의 숲 라이트 배드 엔딩 {len(data)}개', font=fh, fill='#F3E7C6')
for i, e in enumerate(data):
    x = 12 + (i % C) * (W + 12); y = 70 + (i // C) * (H + T + 12)
    f = f'{ROOT}/docs/art/v5/endings_lite/{e["id"]}.png'
    if os.path.exists(f):
        im = Image.open(f).convert('RGB'); im = im.resize((W, int(im.height * W / im.width)))
        o.paste(im.crop((0, 0, W, min(H, im.height))), (x, y))
    else: d.rectangle((x, y, x + W, y + H), fill='#3a332b')
    tag = ' 죽음 암시' if e.get('death') else ''
    d.text((x + 2, y + H + 6), f'{e["id"]}{tag}', font=fs, fill='#FFD84A' if tag else '#bfb39f')
    d.text((x + 2, y + H + 28), e['title'], font=ft, fill='#FFFFFF')
os.makedirs(f'{ROOT}/docs/gdd/fun_log', exist_ok=True)
o = o.resize((o.width * 2 // 3, o.height * 2 // 3), Image.LANCZOS).quantize(256, method=Image.Quantize.MEDIANCUT)
o.save(f'{ROOT}/docs/gdd/fun_log/lite_endings.png', optimize=True)
print('ok', o.size)
