# 회차 5b 그림(U-43): 생성 아님 — raw/ 의 원본을 오려 내고 줄여 webp 로 저장하고(채굴기 · 걷는 주인공 둘),
# 이미 쓰는 쳇바퀴 그림 둘(알바가 도는 쳇바퀴 · 주인공이 굴리는 쳇바퀴)을 "쳇바퀴(안의 달리는 이를 지우고 나무 색으로 메운 것)"와 "달리는 이" 두 겹으로 나눈다(오리기 · 가리기뿐).
# 달리는 이는 그림의 짙은 외곽선으로 둘러싸인 안쪽을 씨앗 점에서 채워 찾는다. 두 겹은 같은 크기의 판이라 그대로 겹치면 원래 그림이 된다.
# 사용법: python3 mkweb_art5.py <repo>
import sys, os
import numpy as np
from PIL import Image, ImageFilter
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
for n in ['i_miner', 'c_hero_walk_back', 'c_hero_walk_front']: cut(n, 300)

def flood(free, seeds):
    """free = 지나갈 수 있는 칸(bool), seeds = [(x, y)] → 닿는 칸"""
    h, w = free.shape
    out = np.zeros_like(free)
    st = [(x, y) for x, y in seeds if free[y, x]]
    for x, y in st: out[y, x] = True
    while st:
        x, y = st.pop()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and free[ny, nx] and not out[ny, nx]: out[ny, nx] = True; st.append((nx, ny))
    return out
def grow(m, r):
    return np.array(Image.fromarray((m * 255).astype('uint8')).filter(ImageFilter.MaxFilter(2 * r + 1))) > 127
def split(name, seeds, dark=118, edge=3, box=None):
    im = Image.open(OUT + name + '.webp').convert('RGBA')
    a = np.array(im).astype(np.float32)
    lum = a[..., 0] * 0.3 + a[..., 1] * 0.59 + a[..., 2] * 0.11
    solid = a[..., 3] > 40
    free = solid & (lum > dark)                      # 외곽선이 아닌 칸
    if box:                                          # 달리는 이가 있을 수 있는 네모 밖으로는 번지지 않는다
        x0, y0, x1, y1 = box; lim = np.zeros_like(free); lim[y0:y1, x0:x1] = True; free &= lim
    body = flood(free, seeds)
    m = grow(body, edge)                             # 외곽선까지
    if box: m &= lim if edge == 0 else grow(lim, edge)
    # 안에 갇힌 구멍(줄무늬 · 머리띠 사이)을 메운다: 바깥에서 닿지 않는 칸은 전부 달리는 이다
    outside = flood(~m, [(0, 0), (m.shape[1] - 1, 0), (0, m.shape[0] - 1), (m.shape[1] - 1, m.shape[0] - 1)])
    m = ~outside
    runner = a.copy(); runner[..., 3] = np.where(m, a[..., 3], 0)
    # 쳇바퀴 겹: 달리는 이 자리를 둘레의 나무 색으로 메운다(둘레 색을 번지게 해서 채운다 — 그리는 것이 아니라 가리는 것)
    hole = grow(m, 5)
    known = solid & ~hole
    col = (a[..., :3] * known[..., None]).clip(0, 255).astype('uint8')
    wgt = (known * 255).astype('uint8')
    fill = np.zeros(col.shape, np.float32); fw = np.zeros(wgt.shape, np.float32)
    for r in (4, 8, 16, 32, 64):
        c = np.stack([np.array(Image.fromarray(col[..., k], 'L').filter(ImageFilter.GaussianBlur(r))).astype(np.float32) for k in range(3)], -1)
        wb = np.array(Image.fromarray(wgt, 'L').filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255
        ok = (fw < 1e-3) & (wb > 0.06)
        fill[ok] = c[ok] / wb[ok][..., None]; fw[ok] = 1
    drum = a.copy()
    drum[..., :3] = np.where(hole[..., None] & solid[..., None], fill, a[..., :3])
    Image.fromarray(runner.clip(0, 255).astype('uint8'), 'RGBA').save(OUT + name + '_runner.webp', 'WEBP', quality=90, method=6)
    Image.fromarray(drum.clip(0, 255).astype('uint8'), 'RGBA').save(OUT + name + '_drum.webp', 'WEBP', quality=88, method=6)
    sizes[name + '_runner'] = im.size; sizes[name + '_drum'] = im.size
    ys, xs = np.nonzero(m)
    print(f'  {name}: 달리는 이 {int(m.sum())}칸 · 네모 x {xs.min()}~{xs.max()} y {ys.min()}~{ys.max()}')
# 씨앗 점(그림 264×300 · 271×300 의 칸): 몸통 · 얼굴 · 귀 · 머리띠 · 발 / 몸통 · 배 · 꼬리 · 귀 · 발
split('c_hamster_wheel', [(150, 150), (120, 170), (175, 170), (150, 125), (105, 135), (190, 185), (140, 195), (125, 110), (165, 105), (150, 132), (100, 135), (96, 150), (180, 130)], dark=98, box=(84, 86, 210, 214))
split('c_hero_wheel', [(145, 110), (150, 170), (115, 150), (160, 60), (140, 70), (180, 130), (170, 200), (130, 195), (120, 165), (85, 150), (75, 140), (165, 90)], dark=98, box=(55, 38, 218, 226))
# 채굴기의 잎 날개 둘: 웹용 그림(261×300)에서 동그랗게 오려 낸다(그 자리에서 돌린다)
def disc(name, out, cx, cy, r):
    im = Image.open(OUT + name + '.webp').convert('RGBA')
    c = im.crop((cx - r, cy - r, cx + r, cy + r))
    yy, xx = np.mgrid[0:2 * r, 0:2 * r]
    a = np.array(c); a[..., 3] = np.where((xx - r + .5) ** 2 + (yy - r + .5) ** 2 <= (r - .5) ** 2, a[..., 3], 0)
    Image.fromarray(a, 'RGBA').save(OUT + out + '.webp', 'WEBP', quality=90, method=6); sizes[out] = (2 * r, 2 * r)
disc('i_miner', 'i_miner_fan1', 58, 215, 20)
disc('i_miner', 'i_miner_fan2', 118, 223, 20)
# 눈 감은 그림(있으면): 눈 뜬 원본과 같은 판 · 같은 자리로 오려야 바꿔 낄 때 흔들리지 않는다 → 눈 뜬 원본의 테두리 상자로 오리고 같은 크기로 줄인다
BLINK = {'hero_phone': (repo + '/docs/art/v5/golden/hero_phone.png', repo + '/src/ui/proto/img/hero_phone.webp'), **{n: (RAW + n + '.png', OUT + n + '.webp') for n in ['c_hero_empty', 'c_collector', 'c_weasel', 'c_raccoon', 'c_owl']}}  # 독사는 색안경을 써서 눈이 안 보인다: 깜빡이지 않는다
BAND = {'c_weasel': (0.10, 0.33), 'c_collector': (0.22, 0.48), 'c_hero_empty': (0.30, 0.66), 'hero_phone': (0.30, 0.66)}
for n, (base, web) in BLINK.items():
    f = RAW + 'blink_' + n + '.png'
    if not os.path.exists(f) or not os.path.exists(base): continue
    b = Image.open(base).convert('RGBA'); bb = b.split()[-1].point(lambda v: 255 if v > 8 else 0).getbbox()
    size = Image.open(web).size
    im = Image.open(f).convert('RGBA')
    # 두 그림의 판이 몇 칸 어긋날 수 있다: 각자의 테두리 상자로 오리고, 눈 뜬 그림과 같은 배율로 줄여, 발(아래 가운데)을 맞춰 같은 크기의 판에 놓는다
    mb = im.split()[-1].point(lambda v: 255 if v > 8 else 0).getbbox()
    k = size[1] / (bb[3] - bb[1])
    c = im.crop(mb); c = c.resize((max(1, round(c.width * k)), max(1, round(c.height * k))), Image.LANCZOS)
    canvas = Image.new('RGBA', size, (0, 0, 0, 0))
    canvas.paste(c, (round((size[0] - c.width) / 2), size[1] - c.height), c)
    # 다시 그린 그림이라 외곽선이 한두 칸씩 다르다: 통째로 바꿔 끼면 테두리가 떤다. 눈 둘레만 남긴다 —
    # 눈 뜬 그림과 크게 다른 칸 가운데 덩어리(눈)만 고르고(가는 선은 침식으로 턴다), 그 둘레만 눈 감은 그림에서 가져온다
    open_im = Image.open(web).convert('RGBA')
    oa = np.array(open_im).astype(int); cb = np.array(canvas).astype(int)
    diff = np.abs(oa[..., :3] - cb[..., :3]).sum(-1) > 150
    lum = lambda x: x[..., 0] * 0.3 + x[..., 1] * 0.59 + x[..., 2] * 0.11
    dark = (lum(oa) < 105) | (lum(cb) < 105)                      # 눈은 짙은 점 · 짙은 선이다
    inner = np.array(open_im.split()[-1].point(lambda v: 255 if v > 200 else 0).filter(ImageFilter.MinFilter(15))) > 0   # 몸 테두리에서 7칸 안쪽만
    hh = oa.shape[0]; band = np.zeros_like(diff); lo, hi = BAND.get(n, (0.10, 0.60)); band[int(hh * lo):int(hh * hi)] = True   # 얼굴이 있는 높이
    eye = diff & dark & inner & band
    blob = Image.fromarray((eye * 255).astype('uint8')).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(1.2))
    ca = np.array(canvas); ca[..., 3] = (ca[..., 3].astype(float) * (np.array(blob).astype(float) / 255)).astype('uint8')
    Image.fromarray(ca, 'RGBA').save(OUT + 'blink_' + n + '.webp', 'WEBP', quality=92, method=6); sizes['blink_' + n] = size
    print(f'     눈 둘레만: {blob.point(lambda v: 255 if v > 40 else 0).getbbox()}')
    print(f'  blink_{n}: 눈 뜬 그림 {bb[2] - bb[0]}×{bb[3] - bb[1]} / 눈 감은 그림 {mb[2] - mb[0]}×{mb[3] - mb[1]} (원본 칸)')
tot = 0
for n, s in sizes.items():
    b = os.path.getsize(OUT + n + '.webp'); tot += b
    print(f"  {n}: {{ w: {s[0]}, h: {s[1]} }},  // {b // 1024}KB")
print('total KB', tot // 1024)
