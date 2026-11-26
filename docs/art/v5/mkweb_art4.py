# 회차 4 그림(U-41) 8장을 웹용으로 만든다. 생성 아님: raw/ 의 원본을 오려 내고 줄여 webp 로 저장한다(회차 3 의 mkweb_art.py 와 같은 방식).
# 사용법: python3 mkweb_art4.py <repo>
import sys, os
from PIL import Image
repo = sys.argv[1]
RAW = repo + '/docs/art/v5/raw/'
OUT = repo + '/src/ui/proto/img/v5/'
sizes = {}
def cut(name, h, q=88):
    im = Image.open(RAW + name + '.png').convert('RGBA')
    bb = im.split()[-1].point(lambda v: 255 if v > 8 else 0).getbbox()
    im = im.crop(bb)
    im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
    im.save(OUT + name + '.webp', 'WEBP', quality=q, method=6)
    sizes[name] = im.size
def full(name, w, q=80):
    im = Image.open(RAW + name + '.png').convert('RGB')
    im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    im.save(OUT + name + '.webp', 'WEBP', quality=q, method=6)
    sizes[name] = im.size
for n in ['i_wheel_empty', 'c_hero_walk_empty', 'c_hero_frozen']: cut(n, 300)
for n in ['e_retire1', 'e_retire2', 'e_retire3', 'e_retire4']: full(n, 640, 82)
full('m_village2', 780)
tot = 0
for n, s in sizes.items():
    b = os.path.getsize(OUT + n + '.webp'); tot += b
    print(f"  {n}: {{ w: {s[0]}, h: {s[1]} }},  // {b // 1024}KB")
print('total KB', tot // 1024)
