# 회차 3 그림(U-40)을 웹용으로 만든다. 생성 아님: raw/ 의 원본을 오려 내고 줄여 webp 로 저장한다.
# 사용법: python3 mkweb_art.py <repo> [preview.png]
import sys, os
from PIL import Image
repo = sys.argv[1]
RAW = repo + '/docs/art/v5/raw/'
OUT = repo + '/src/ui/proto/img/v5/'
os.makedirs(OUT, exist_ok=True)
sizes = {}
def cut(name, h, q=88):
    """투명 배경 그림: 알파 테두리로 오려 내고 높이 h 로 줄인다"""
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
for n in ['b_collector', 'b_boss', 'b_weasel', 'b_raccoon', 'b_owl', 'b_snake']: cut(n, 420)
for n in ['c_collector', 'c_boss', 'c_weasel', 'c_raccoon', 'c_owl', 'c_snake', 'c_hamster_wheel', 'c_hero_wheel', 'c_hero_empty', 'c_hero_walk', 'c_hero_sad', 'c_hero_happy', 'h_quit']: cut(n, 300)
for n in ['i_wallet', 'i_goldcoin']: cut(n, 220)
for n in ['p_office', 'p_capital', 'p_bank', 'p_alley', 'm_village', 's_prologue']: full(n, 780)
for n in ['e_bankrupt', 'e_retire']: full(n, 640, 82)
tot = 0
for n, s in sizes.items():
    b = os.path.getsize(OUT + n + '.webp'); tot += b
    print(f"  {n}: {{ w: {s[0]}, h: {s[1]} }},  // {b // 1024}KB")
print('total KB', tot // 1024)
if len(sys.argv) > 2:
    names = [n for n in sizes if n[0] in 'bcih']
    sheet = Image.new('RGB', (6 * 230, ((len(names) + 5) // 6) * 250), (236, 230, 214))
    for i, n in enumerate(names):
        im = Image.open(OUT + n + '.webp').convert('RGBA'); im.thumbnail((220, 220))
        sheet.paste(im, ((i % 6) * 230 + 5, (i // 6) * 250 + 5), im)
    sheet.save(sys.argv[2])
