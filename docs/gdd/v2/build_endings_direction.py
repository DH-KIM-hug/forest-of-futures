#!/usr/bin/env python3
"""선물의 숲 v2 — 엔딩 연출표를 만든다.
실행: python3 docs/gdd/v2/build_endings_direction.py → docs/gdd/v2/endings_direction.csv
손으로 쓴 원본은 endings_direction_data.py (장면 틀 ARCH, 엔딩별 D, 위험 RISK, 죽음 DEATH, 영원한 노역 ETERNAL).
원칙 [사용자 확정 2026-11-25]: 그림은 결과가 이미 벌어진 뒤의 삶을 보여 준다. 서류가 주인공인 장면 5% 이하. 무표정 15% 이하. 죽음은 암시로만.
"""
import csv, os, sys
from collections import Counter
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from endings_direction_data import ARCH, D, RISK, DEATH, ETERNAL
EXPR = {  # 번호: (이름, 영문 묘사, 기준 그림)
 1: ('눈물 고인 점 눈(그렁그렁)', 'dot eyes each with a big teardrop welling at the lower rim, tiny wobbling mouth', 'docs/art/style-bold/despair/d1_tears.png'),
 2: ('눈 밑 그늘', 'dot eyes with dark hatched shadows beneath, mouth a short line pulled down at both ends', ''),
 3: ('텅 빈 흰 눈', 'blank white circle eyes with no pupils, small slack mouth', 'docs/art/style-bold/despair/d2_hollow.png'),
 4: ('벌어진 입', 'dot eyes shrunk to pinpoints, mouth dropped open in a tall oval', ''),
 5: ('떨리는 입선', 'dot eyes, mouth drawn as a wavy trembling line, cheeks tight', ''),
 6: ('통곡(눈물·콧물)', 'tears streaming in two lines, a small drop of snot, mouth wide open in a wail', 'docs/art/style-bold/despair/d4_wail.png'),
 7: ('식은땀 여러 방울', 'dot eyes wide, three or four cold-sweat drops on forehead and cheek, mouth a tight tiny line', ''),
 8: ('억지웃음(백기)', 'forced upturned smile with brows slanted down and one teardrop, a tiny white flag in its paw', 'docs/art/style-bold/despair/d3_forced.png'),
 9: ('꾹 감은 눈', 'eyes squeezed shut as two short downward arcs, teeth-clenched small mouth, a tear at the corner', ''),
 10: ('넋 나간 무표정', 'plain dot eyes staring at nothing, a tiny flat mouth', ''),
 0: ('보이지 않음(처진 귀·꼬리·어깨로)', 'face not visible; despair shown by drooped ears, limp tail and sagging shoulders', ''),
}
SHOT = {'C': ('가까이', 'close-up'), 'M': ('중간', 'medium shot'), 'F': ('멀리', 'wide shot, small figure')}
FAR = {'ST', 'LV', 'AL', 'WN', 'SH', 'SB', 'IS', 'TC', 'AU', 'VD', 'EM', 'DG', 'RF', 'GX'}
titles = {int(r['id'][4:]): r for r in csv.DictReader(open(os.path.join(HERE, 'endings_v2_map.csv'), encoding='utf-8-sig'))}
# 장면 크기를 고르게: 중간으로 적어 둔 것 가운데 멀리 어울리는 틀은 멀리로, 나머지는 가까이로 번갈아 옮긴다(목표: 셋이 비슷하게)
shots = {no: D[no][4] for no in D}
target = len(D) // 3
for no in sorted(D):
    c = Counter(shots.values())
    if shots[no] != 'M' or c['M'] <= target + 1: continue
    if D[no][0] in FAR and c['F'] < target: shots[no] = 'F'
    elif D[no][0] not in FAR and c['C'] < target: shots[no] = 'C'
for no in sorted(D):
    c = Counter(shots.values())
    if shots[no] == 'M' and c['M'] > target + 1: shots[no] = 'F' if c['F'] < c['C'] else 'C'
rows = []
for no in range(1, 201):
    arch, det, det_en, ex, _ = D[no]; pose, bg, act, act_en = ARCH[arch]; t = titles[no]; sh = shots[no]
    child = arch == 'KD'; empty = arch == 'VD'
    turn = {'WN': 'face seen reflected in the window glass: ', 'LV': 'glancing back over its shoulder, face: ', 'DR': 'head turned back toward the viewer, face: ', 'AU': 'seen in three-quarter view, face: '}.get(arch, 'face: ')
    face = '' if empty else (f"{turn}{EXPR[ex][1]}; " if ex else f"{EXPR[0][1]}; ")
    who = 'no chipmunk in frame' if empty else ('a small child chipmunk' if child else 'a cute round chipmunk with dot eyes')
    prompt = (f"{SHOT[sh][1]}; {who}; {act_en}; {det_en}; {face}"
              "bold black outline style, character in warm colors against a cold desaturated background; no blood, no wounds, no text")
    rows.append({'id': t['id'], 'title': t['title_v2'], 'cause': t['cause_name'], 'pose': pose, 'expression': EXPR[ex][0], 'expression_ref': EXPR[ex][2],
                 'shot': SHOT[sh][0], 'props': det, 'background_time': bg, 'action': f"{act}. {det}",
                 'scene_type': {'GX': '사채업자 처리 직전', 'VD': '빈자리(죽음 암시)', 'KD': '대물림(아이)', 'WH': '영원한 노역', 'SB': '영원한 노역', 'SH': '영원한 노역'}.get(arch, '결과 뒤의 삶'),
                 'death_implied': 'Y' if no in DEATH else '', 'eternal_labor': 'Y' if no in ETERNAL else '', 'risk': RISK.get(no, ''), 'prompt_en': prompt})
with open(os.path.join(HERE, 'endings_direction.csv'), 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
n = len(rows)
print('rows', n)
print('shot', dict(Counter(r['shot'] for r in rows)))
print('pose', dict(Counter(r['pose'] for r in rows).most_common()))
print('expression', dict(Counter(r['expression'] for r in rows).most_common()))
print('deadpan %', round(100 * sum(r['expression'].startswith('넋') for r in rows) / n, 1), '| 서류가 주인공 %', round(100 * sum(D[i][0] == 'PP' or i in (44, 47, 81) for i in D) / n, 1), '| 서서 서류만 드는 장면', sum(D[i][0] == 'PP' for i in D))
print('죽음 암시', len(DEATH), f'({100 * len(DEATH) / n}%)', '| 처리 직전', sum(D[i][0] == 'GX' for i in D), '| 위험 높음', sum(v.startswith('높음') for v in RISK.values()))
shark = [int(r['id'][4:]) for r in rows if titles[int(r['id'][4:])]['cause'].split('|')[0] == 'SHARK']
gx = [i for i in shark if D[i][0] == 'GX' or i in (58, 64)]
print('사채 원인 엔딩', len(shark), '그중 처리 직전·흔적', len(gx), '영원한 노역', len([i for i in shark if i in ETERNAL]))
