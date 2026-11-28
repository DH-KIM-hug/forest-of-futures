# docs/gdd/LITE_ENDINGS.md 의 엔딩 표를 data/endings_lite.json 에서 다시 쓴다(<!-- table --> 사이)
import json, os, re
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../../..'))
data = json.load(open(f'{ROOT}/data/endings_lite.json'))['endings']
rows = ['| id | 제목 | 글 | 무게(1 + 맞는 꼬리표) | 그림 |', '|---|---|---|---|---|']
for e in data:
    w = ', '.join(f'{k} +{v}' for k, v in e['w'].items())
    txt = '<br>'.join(e['lines']).replace('|', '\\|')
    rows.append(f'| {e["id"]}{" (죽음 암시)" if e.get("death") else ""} | {e["title"]} | {txt} | {w} | `src/ui/proto/img/endings/{e["id"]}.webp` (원본 `docs/art/v5/endings_lite/{e["id"]}.png`) |')
p = f'{ROOT}/docs/gdd/LITE_ENDINGS.md'
s = open(p).read()
s = re.sub(r'<!-- table -->.*<!-- /table -->', '<!-- table -->\n' + '\n'.join(rows) + '\n<!-- /table -->', s, flags=re.S)
open(p, 'w').write(s)
print('ok')
