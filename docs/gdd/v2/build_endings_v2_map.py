#!/usr/bin/env python3
"""선물의 숲 v2 — 엔딩 200종을 '원인 × 상황' 틀로 다시 묶는 표를 만든다.
실행: python3 docs/gdd/v2/build_endings_v2_map.py  → docs/gdd/v2/endings_v2_map.csv
제목·대사 원문은 data/endings.json 에서 읽는다(이 스크립트는 data/ 를 고치지 않는다).

행 형식: 번호: (원인, 상황 조건, 도감 단서, 희귀도, 글 처리, 메모)
 - 원인: LIQ 청산 / TIP 낚임 / SHARK 사채 / BANK 제도권 / UPKEEP 유지비 / SEIZE 압류 연쇄 / FRIEND 관계 / LEGACY 대물림. 여러 개면 '|'.
 - 상황 조건: 'key op value' 를 ' & ' 로 잇는다. 키 목록은 SKELETON_v2.md 7장.
 - 글 처리: keep 제목·대사 그대로 / tweak 낱말·숫자만 손봄(line_v2 비어 있음, 글 작업 대기) / rewrite 대사를 새 조건에 맞게 다시 씀(line_v2에 있음) / moved 2차 재배치로 원인을 옮기고 제목·대사·그림을 다시 씀
"""
import csv, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
src = {e['no']: e for e in json.load(open(os.path.join(ROOT, 'data', 'endings.json'), encoding='utf-8'))['endings']}

M = {
# ── 1금융·부동산 (001~040) ──
1: ('BANK|SHARK', 'house = 0 & assetsEver = 0', '텐트에 살면서 방치 자산을 한 번도 사지 않고 연체로 파산', 1, 'keep', ''),
2: ('UPKEEP', 'house = 4', '황금 저택의 유지비를 3회 연속 못 냄', 3, 'keep', ''),
3: ('BANK', 'house = 1 & lastLender = bank', '오두막을 담보로 잡힌 채 조합 연체로 파산', 2, 'keep', ''),
4: ('BANK', 'house = 2 & ltv > 100', '창고에 사는데 부동산 하락 속보로 조합 빚이 집값보다 커진 채 파산', 3, 'keep', ''),
5: ('UPKEEP', 'house = 3', '호숫가 별장의 유지비를 3회 연속 못 냄', 3, 'keep', ''),
6: ('BANK', 'lastLender = bank', '조합(1금융) 이자를 3회 연속 못 냄', 2, 'keep', '조합 연체의 기본 엔딩'),
7: ('BANK|SHARK', 'house = 0 & bankRefusals >= 10', '집 없이 조합 대출 창구를 10번 두드린 세대가 파산', 1, 'keep', ''),
8: ('BANK', 'house = 1 & last3 has borrow:bank', '오두막 담보 대출을 받은 직후(마지막 세 행동 안) 파산', 2, 'keep', ''),
9: ('BANK', 'lastLender = capital & refi >= 3', '빌린 돈으로 60초 안에 다른 빚을 갚는 돌려막기를 3번 넘게 하고 캐피탈 연체로 파산', 2, 'keep', ''),
10: ('UPKEEP|BANK', 'house = 2 & last3 has move_up', '창고로 이사한 직후 파산', 2, 'keep', ''),
11: ('LEGACY', 'lastLender = tax', '물려받은 재산의 세금을 기한(정산 8회) 안에 못 내 공매당하고 파산', 2, 'tweak', '지방세 → 상속세·증여세'),
12: ('BANK|SHARK', 'last = refused:bank', '마지막 행동이 조합 대출 거절인 채 파산', 1, 'keep', ''),
13: ('SEIZE', 'last = sell_blocked', '가압류 딱지가 붙은 자산을 팔려다 막힌 뒤 파산', 2, 'keep', 'v1 대용 조건 → 가압류 규칙'),
14: ('BANK|UPKEEP', 'house = 4 & event = housing_crash', '황금 저택에 사는 동안 부동산 거품 붕괴 속보가 진행 중일 때 파산', 3, 'keep', ''),
15: ('BANK', 'house = 2 & lastLender = bank', '창고가 조합 담보권 실행으로 넘어감', 2, 'keep', ''),
16: ('BANK|SHARK|UPKEEP', 'shortfall <= 500', '마지막 정산에서 모자란 돈이 500 도토리 이하', 3, 'keep', ''),
17: ('SHARK', 'last3 has stamp:bank', '사채가 남았는데 조합 빚에 도장을 찍은 직후 사채 연체로 파산', 2, 'keep', ''),
18: ('BANK', '', '캐피탈(2금융)·조합 이자를 3회 연속 못 냄', 1, 'keep', '제도권 연체의 기본 엔딩'),
19: ('BANK', 'tagged >= 3', '자산 세 곳 이상에 가압류 딱지가 붙은 채 제도권 연체로 파산', 3, 'keep', ''),
20: ('BANK', 'laborTaps < 100 & assetsEver = 0', '거의 일하지 않고(노동 100회 미만) 자산도 없이 캐피탈 연체로 파산', 1, 'tweak', 'v1 대용 조건 → 노동 횟수'),
21: ('BANK', 'house = 4 & lastLender = bank', '황금 저택이 조합 담보권 실행으로 넘어감', 3, 'keep', ''),
22: ('BANK|SHARK', 'last3 has subsidy & last3 has stamp:shark', '서민금융 지원금을 받은 직후 그 돈으로 사채에 도장을 찍고 파산', 2, 'keep', 'v1 대용 조건 → 지원금 속보 + 도장'),
23: ('BANK', 'odInstitution >= 10', '한 세대에 조합·캐피탈 연체를 합쳐 10번 넘김', 2, 'keep', ''),
24: ('LEGACY', '', '물려받은 빚이나 세금이 남은 빚의 절반을 넘는 채로 파산', 1, 'rewrite', '대물림의 기본 엔딩. 순록 보증 → 읽지 않고 도장 찍은 상속 서류'),
25: ('BANK', 'event = rate_hike', '기준금리 인상 속보가 진행 중일 때 제도권 연체로 파산', 2, 'keep', ''),
26: ('BANK', 'house >= 1 & estateNet in 0..1000', '집을 경매로 넘기고 빚을 갚은 뒤 남은 돈이 0~1,000 도토리', 3, 'keep', ''),
27: ('BANK', 'ltv >= 120', '조합 빚이 집 평가액의 120%를 넘은 채 파산', 3, 'keep', ''),
28: ('BANK|SHARK', 'credit = 1', '신용점수 1점(연체 누적 9회 이상)으로 파산', 2, 'keep', ''),
29: ('SEIZE', 'time = 아침', '아침 정산에 자산이 압류되며 파산', 2, 'keep', 'v1 기기 시각 → 게임 속 하루(정산 4회)'),
30: ('TIP', 'tipSource = wire_unsourced & marginPct = 100', "출처 없는 속보('관계자에 따르면')를 믿고 전액을 넣었다가 청산", 2, 'rewrite', '보이스피싱 문자 → 출처 없는 속보'),
31: ('BANK', 'lastLender = bank & marginLocked >= shortfall', '거래 증거금에 묶인 돈이 모자란 이자보다 많은데 조합 연체로 파산', 2, 'keep', ''),
32: ('LEGACY', 'inherit = simple & settleNo <= 6', '단순승인 뒤 이자 유예(정산 3회)가 끝나고 정산 3회 안에 파산', 2, 'keep', 'v1 대용 조건 → 승계 빚 유예'),
33: ('BANK', 'house >= 1 & lastLender = bank & event = housing_slump', '부동산 시세 하락 속보 중에 조합 담보 대출 연체로 파산', 2, 'keep', ''),
34: ('BANK|UPKEEP', 'last3 has move_up & netWorthAtMove <= 0', '순자산이 0 이하인 채 빚으로 집을 산 직후 파산', 3, 'keep', ''),
35: ('BANK', 'time = 밤 & last = closed:bank', '밤에 문 닫힌 조합에 도장을 찍으러 갔다가 그 정산에 파산', 2, 'keep', 'v1 기기 시각 → 게임 속 밤'),
36: ('BANK|UPKEEP', 'last3 has move_down', '집을 줄여 이사한 돈으로도 못 막고 파산', 2, 'tweak', '복비 → 집을 줄여도 모자람'),
37: ('BANK', 'lastLender = bank & visitsSinceOverdue.bank = 0', '조합 연체가 시작된 뒤 조합 건물에 한 번도 가지 않고 파산', 2, 'keep', 'v1 대용 조건 → 방문 기록'),
38: ('LIQ', 'fundedBy = bank', '조합에서 빌리고 60초 안에 그 돈으로 진입한 포지션이 청산', 2, 'rewrite', '서류 위조 → 담보 대출금 용도 외 사용'),
39: ('UPKEEP', '', '집 유지비를 3회 연속 못 냄', 1, 'keep', '유지비의 기본 엔딩'),
40: ('BANK|SHARK', 'lastLenderPrincipal <= 1000', '원금이 1,000 도토리 이하로 남은 빚의 이자를 못 내 파산', 3, 'keep', ''),
# ── 사채·추심 (041~100) ──
41: ('SHARK', 'lastLender = shark1', '오소리 대부 이자를 2회 연속 못 내고 압류할 자산도 없음', 1, 'keep', '사채 1단계의 기본 엔딩'),
42: ('SHARK', 'lastLender = shark2 & contacts = true', '지인 연락처를 낸 뒤 독사 대부 연체로 파산', 2, 'keep', ''),
43: ('SHARK', 'last3 has borrow:shark2', '독사 대부에게 빌린 직후(마지막 세 행동 안) 파산', 2, 'keep', ''),
44: ('SHARK', 'lastLender = shark2 & garnished > 0', '오소리 가압류로 수입을 떼인 적이 있는 세대가 독사 연체로 파산', 2, 'keep', ''),
45: ('SHARK', 'debt.shark2 >= 1000000 & od.shark2 >= 3', '독사 빚 100만 이상, 독사 연체 누적 3회 이상', 3, 'keep', ''),
46: ('SHARK', 'time = 밤', '밤 정산에 사채 연체로 파산', 1, 'keep', 'v1 기기 시각 → 게임 속 밤'),
47: ('SHARK', 'lastLender = shark2 & borrow.shark2 >= 3', '독사 대부를 3번 이상 쓰고 독사 연체로 파산', 2, 'keep', ''),
48: ('SHARK', 'sharkDebt >= 2 * sharkBorrowed', '사채 빚이 실제로 빌린 돈의 2배를 넘김(연체 이자가 원금에 얹힘)', 3, 'keep', ''),
49: ('SHARK', 'time = 밤 & lastLender = shark2 & contacts = false', '연락처를 내지 않은 채 밤 정산에 독사 연체로 파산', 2, 'keep', 'v1 기기 시각 → 게임 속 밤'),
50: ('SHARK', 'flyerLoans >= 3', "속보 띠의 '당일 대출' 전단지로 3번 넘게 빌리고 파산", 2, 'keep', ''),
51: ('SHARK', 'lastLender = shark1 & house >= 1', '집이 있는데 오소리 대부 연체로 파산', 2, 'keep', ''),
52: ('SEIZE', 'seized has generator & lastLender = shark1', '오소리 대부에게 소형 발전기를 압류당하고 파산', 1, 'keep', ''),
53: ('SHARK', 'od.shark2 >= 6', '독사 연체 누적 6회 이상', 3, 'keep', ''),
54: ('SHARK|SEIZE', 'garnished >= 50000', '가압류 딱지로 떼인 수입이 한 세대에 5만 도토리를 넘김', 2, 'keep', ''),
55: ('LEGACY|SHARK', 'grudge has shark2 & lastLender = shark2', '상속포기로 독사 빚을 떼어 낸 가문이 다시 독사 연체로 파산', 3, 'keep', 'v1 대용 조건 → 가문의 원한 기록'),
56: ('SHARK', 'refi.shark2_to_shark1 >= 1', '독사에게 빌려 60초 안에 오소리 빚에 도장을 찍은 세대가 사채 파산', 2, 'keep', ''),
57: ('SHARK', 'lastLender = shark2 & termsOpened.shark2 = 0', '독사 대부 약관을 한 번도 펼쳐 보지 않고 독사 연체로 파산', 1, 'keep', ''),
58: ('SHARK', 'lastLender = shark2 & contacts = true & friendsBroken >= 1', '연락처를 내고 친구와 절교까지 한 상태에서 독사 연체로 파산', 3, 'keep', ''),
59: ('SHARK', 'last = stamp_fail:shark2 x5', '현금이 모자란데 독사 대부 도장 버튼을 5번 연달아 누른 뒤 파산', 2, 'tweak', '도둑질 → 헛도장 연타'),
60: ('SHARK', 'lastLender = shark2 & stamps.shark2 = 0 & rollovers >= 1', "독사 빚에 도장을 한 번도 안 찍고 '이자 미루기'만 쓰다 파산", 2, 'tweak', ''),
61: ('SHARK', 'offerTaken has discount_today', "사채업자의 '오늘 갚으면 이자 감면' 제안을 받아들인 세대가 사채 파산", 2, 'keep', 'v1 대용 조건 → 채권처 제안'),
62: ('LEGACY', 'borrow.shark2 = 0 & inheritedDebt.shark > 0', '독사에게 직접 빌린 적 없이, 물려받은 사채 빚으로 파산', 2, 'keep', ''),
63: ('SHARK', 'borrowStreak.shark1 >= 5', '오소리 대부에게만 연달아 5번 빌리고 파산', 2, 'keep', ''),
64: ('SHARK', 'lastLender = shark2 & borrow.shark2 = 1', '독사 대부를 딱 한 번 쓰고 독사 연체로 파산', 1, 'keep', ''),
65: ('SHARK', 'last3 has move_to_tent', '집을 팔고 텐트로 옮긴 직후 사채 연체로 파산', 2, 'keep', 'v1 대용 조건 → 텐트로 이사'),
66: ('SEIZE|BANK', 'tagBy has bank & tagBy has shark1', '조합과 오소리 대부의 가압류 딱지가 동시에 붙은 채 파산', 3, 'keep', ''),
67: ('FRIEND', 'contacts = true & collectionTrustLoss >= 150', '독사의 지인 추심으로 깎인 신뢰가 150을 넘어 친구 셋과 절교', 2, 'keep', ''),
68: ('SHARK', 'lastLender = shark2 & shortfallPct <= 5', '독사 이자를 95% 넘게 냈지만 조금 모자라 파산', 3, 'keep', ''),
69: ('SEIZE', 'assetsOwned >= 3 & tagged = assetsOwned', '가진 자산(3개 이상) 전부에 가압류 딱지가 붙은 채 파산', 3, 'tweak', '화면을 막는 추심원 → 전 자산 딱지'),
70: ('SHARK', 'upfrontPaid >= 400000', '선이자로 떼인 돈이 한 세대에 40만 도토리 이상', 2, 'keep', ''),
71: ('SHARK', 'capitalizedInterest >= 500000', '연체로 원금에 얹힌 이자가 50만 도토리 이상', 3, 'keep', ''),
72: ('SHARK', 'lastLender = shark1 & laborTaps >= 500 & assetsEver = 0', '자산 없이 노동만 500회 넘게 하고 오소리 연체로 파산', 1, 'keep', ''),
73: ('SHARK', 'lastLender = shark2 & stamps >= 30', '도장을 30번 넘게 찍고도 독사 연체로 파산', 2, 'keep', ''),
74: ('SHARK', 'garnishedThisCycle >= shortfall', '마지막 회차에 가압류로 떼인 돈이 모자란 이자보다 많음', 3, 'tweak', '축의금 → 가압류로 떼인 돈'),
75: ('SHARK', 'odTotal >= 10', '한 세대 연체 누적 10회', 2, 'keep', ''),
76: ('TIP', 'tipSource = viper_sure & holdSec <= 10', "독사 대부의 '확실한 정보'를 따라 들어가 10초 안에 청산", 2, 'keep', 'v1 대용 조건 → 독사의 정보'),
77: ('SHARK', 'interestOnlyStreak >= 20', '도장 없이 이자만 20회 연속 내다가 파산', 2, 'keep', ''),
78: ('SHARK', 'lastLender = shark1 & garnished > 0 & assetsOwned = 0', '오소리 가압류로 수입을 떼이다 자산이 하나도 없이 파산', 1, 'keep', ''),
79: ('LEGACY|SHARK', 'grudgeCount >= 2', '원한을 품은 채권처가 둘 이상인 가문이 사채 파산', 3, 'rewrite', '경찰 신고 → 채권처끼리 장부를 돌려 봄'),
80: ('SHARK', 'time = 아침 & nightTaps >= 50 & garnished > 0', '밤 회차에 50번 넘게 일하고 아침 정산에 가압류당하며 파산', 3, 'keep', 'v1 기기 시각 → 게임 속 밤·아침'),
81: ('SHARK', 'debt.bank > 0 & debt.capital > 0 & debt.shark1 > 0 & debt.shark2 > 0', '조합·캐피탈·오소리·독사 빚을 모두 진 채 파산', 3, 'keep', ''),
82: ('BANK', 'offerTaken has promo_loan & lastLender = capital', "족제비 대표의 '첫 3회 이자 반값' 대출을 쓰고 캐피탈 연체로 파산", 2, 'tweak', '쿠폰 → 반값 뒤 2배 프로모션 대출'),
83: ('SHARK', 'pawned >= 1 & lastLender = shark2', '유품을 독사 대부에게 맡긴 채 파산(유품은 돌아오지 않음)', 2, 'tweak', '비상금 항아리 = 유품'),
84: ('SHARK', 'fam.bankruptcies.SHARK >= 3', '가문에서 세 번째 사채 파산', 2, 'keep', 'v1 대용 조건 → 가문 누적'),
85: ('SEIZE', 'garnished >= 100000 & lastLender = shark2', '독사 가압류로 수입 10만 도토리 이상을 떼이고 파산', 2, 'tweak', '추심 앱 → 가압류'),
86: ('SHARK', 'lastLender = shark2 & settleNo = 13', '세대의 13번째 정산에 독사 연체로 파산', 3, 'keep', 'v1 기기 날짜 → 13번째 정산'),
87: ('SEIZE', '', '자산이 압류되어 수입이 끊기고 파산', 1, 'keep', '압류 연쇄의 기본 엔딩'),
88: ('SHARK', 'fam.sameCauseStreak.SHARK >= 3', '3대 연속 사채 파산', 3, 'keep', 'v1 대용 조건 → 세대 연속'),
89: ('LEGACY|SHARK|BANK', 'parentInherit = limited & lastLender in grudge', '한정승인으로 빚을 끊어 낸 채권처에 다시 빚을 져 파산', 3, 'keep', 'v1 대용 조건 → 한정승인 기록'),
90: ('SHARK', 'borrow.shark2 >= 4 & last3 has borrow:shark2', '독사 대부를 4번째 이상 쓴 직후 파산', 3, 'keep', ''),
91: ('SHARK', 'last = rollover_refused', "독사 대부에게 '이자 미루기'를 거절당한 직후 파산", 2, 'keep', ''),
92: ('SHARK', 'laborTaps >= 1000 & assetsEver = 0', '자산 없이 노동만 1,000회 넘게 하고 사채 파산', 2, 'keep', ''),
93: ('SHARK', 'doubleBorrow.shark2 >= 1', '독사 대출 버튼을 2초 안에 두 번 눌러 두 건이 접수된 세대가 파산', 2, 'tweak', ''),
94: ('SHARK', 'time = 아침 & lastLender = shark1 & od.shark1 >= 4', '오소리 연체 누적 4회 이상, 아침 정산에 파산', 2, 'keep', 'v1 기기 시각 → 게임 속 아침'),
95: ('SHARK', 'last = stamp:shark1 & lastStampAmount < 1000', '마지막 행동이 오소리 빚에 1,000 도토리 미만 도장', 2, 'keep', ''),
96: ('SHARK', 'refi.friend_to_shark2 >= 1', '친구에게 빌려 60초 안에 독사 빚에 도장을 찍은 세대가 사채 파산', 2, 'tweak', '명의 차용 → 친구 돈으로 사채 갚기'),
97: ('SHARK', 'lastLender = shark2', '독사 대부 이자를 2회 연속 못 내고 압류할 자산도 없음', 1, 'keep', '사채 2단계의 기본 엔딩'),
98: ('SHARK', 'rollovers >= 5', "'이자 미루기'를 한 세대에 5번 씀", 2, 'keep', ''),
99: ('SHARK', 'pawned >= 1 & pawnedHeirloomAge >= 2', '2대 이상 내려온 유품을 사채에 맡긴 채 파산', 3, 'keep', 'v1 대용 조건 → 유품 전당'),
100: ('SHARK', 'debt.shark2 >= 5000000', '독사 빚 500만 도토리 돌파', 3, 'keep', ''),
# ── 친구·관계 (101~150) ──
101: ('FRIEND', '', '친구 셋과 절교', 1, 'keep', '관계의 기본 엔딩'),
102: ('FRIEND', 'friendsBorrowed = 5', '친구 다섯 모두에게 빌린 세대가 관계 파산', 2, 'keep', ''),
103: ('FRIEND', 'brokenWithinSettles <= 3', '정산 3회 안에 세 친구와 연달아 절교', 2, 'keep', ''),
104: ('FRIEND', 'broken has raccoon & friendStamps.raccoon = 0', '절친 너구리에게 한 번도 갚지 않고 절교', 2, 'tweak', '축의금 → 한 번도 안 갚음'),
105: ('FRIEND', 'fam.brokenTotal >= 10', '가문 누적 절교 10번', 3, 'keep', ''),
106: ('FRIEND', 'friendStamps >= 10', '친구 빚에 도장을 10번 넘게 찍고도 관계 파산', 2, 'keep', ''),
107: ('BANK|SHARK', 'last = refused:friend', '마지막 행동이 친구에게 빌리기 거절인 채 연체로 파산', 2, 'keep', 'v1 대용 조건 → 친구 거절'),
108: ('FRIEND', 'broken has parentBroken', '부모가 절교했던 친구(시작 신뢰 60)와 또 절교', 3, 'keep', 'v1 대용 조건 → 가문의 관계 기록'),
109: ('FRIEND', 'broken has maxedFriend', '한도 끝까지 빌린 친구와 절교', 2, 'keep', ''),
110: ('FRIEND', 'friendOd >= 5', '갚기로 한 날을 5번 넘긴 세대가 관계 파산', 2, 'keep', ''),
111: ('LIQ', 'fundedBy = friend & lev = 200', '친구에게 빌리고 60초 안에 200배로 진입한 포지션이 청산', 2, 'keep', ''),
112: ('FRIEND', 'last3 has sell_asset', '자산을 판 직후 관계 파산', 2, 'tweak', ''),
113: ('SHARK', 'lastLender = shark2 & claimsSold > 0 & borrow.shark2 = 0', '독사에게 직접 빌린 적 없이, 친구가 넘긴 채권으로 독사 연체 파산', 2, 'keep', ''),
114: ('FRIEND', 'borrowedThenTraded >= 1', '친구에게 빌리고 60초 안에 거래에 넣은 적이 있는 세대가 관계 파산', 1, 'keep', ''),
115: ('LIQ', 'fundedByFriends >= 3', '친구 세 명 이상의 돈이 들어간 포지션이 청산', 3, 'keep', ''),
116: ('FRIEND', 'lastBroken = rabbit', '세 번째로 절교한 친구가 이웃 토끼', 2, 'keep', 'v1 대용 조건 → 마지막 절교 상대'),
117: ('FRIEND', 'last = refused:friend', '연체 중인 친구에게 또 빌리려다 거절당한 직후 관계 파산', 2, 'keep', 'v1 대용 조건 → 친구 거절'),
118: ('FRIEND', 'stamps >= 100', '도장을 100번 넘게 찍은 세대가 관계 파산', 3, 'keep', ''),
119: ('FRIEND', 'friendsBroken >= 4', '친구 넷과 절교', 2, 'keep', 'v1 대용 조건 → 절교 수'),
120: ('FRIEND', 'broken has profitedTipFriend', '소문으로 돈을 벌게 해 준 친구와 절교', 3, 'rewrite', '몰래 대출 → 은혜를 원수로'),
121: ('FRIEND', 'laborTaps >= 1000', '노동 1,000회를 넘긴 세대가 관계 파산', 2, 'tweak', ''),
122: ('FRIEND', 'friendRefusals >= 3', '친구에게 빌리기를 3번 넘게 거절당한 세대가 관계 파산', 1, 'keep', ''),
123: ('FRIEND', 'refi.friend_to_lender >= 1', '친구에게 빌려 60초 안에 다른 빚에 도장을 찍은 세대가 관계 파산', 2, 'keep', ''),
124: ('FRIEND', 'contacts = true & borrow.shark2 >= 3', '연락처를 내고 독사 대부를 3번 넘게 쓴 세대가 관계 파산', 3, 'keep', ''),
125: ('FRIEND', 'pawned >= 1', '유품을 사채에 맡긴 채 관계 파산', 3, 'rewrite', '친구의 팽이 → 가문의 유품'),
126: ('FRIEND', 'fam.bankruptcies.FRIEND >= 3', '가문에서 세 번째 관계 파산', 3, 'keep', 'v1 대용 조건 → 가문 누적'),
127: ('FRIEND', 'friendBorrows >= 3 & friendStamps = 0', '친구에게 3번 넘게 빌리고 한 번도 갚지 않음', 1, 'keep', ''),
128: ('FRIEND', 'lastBroken = bear', '세 번째로 절교한 친구가 곰 형', 2, 'keep', 'v1 대용 조건 → 마지막 절교 상대'),
129: ('FRIEND', 'refi.friend_to_friend >= 1', '친구에게 빌려 60초 안에 다른 친구 빚을 갚은 적이 있음', 2, 'keep', ''),
130: ('SHARK', 'house >= 1 & broken has rabbit', '집이 있고 이웃 토끼와 절교한 상태에서 사채 파산', 2, 'keep', ''),
131: ('FRIEND', 'assetsOwned >= 3', '자산을 3개 이상 가진 채 관계 파산', 2, 'tweak', '가진 게 있는데 안 갚음'),
132: ('FRIEND', 'lastBroken = raccoon', '세 번째로 절교한 친구가 절친 너구리', 1, 'keep', ''),
133: ('SEIZE', 'seized has generator & friendDebt > 0', '친구 빚이 남은 채 소형 발전기를 압류당하고 파산', 2, 'keep', ''),
134: ('FRIEND', 'trustSum <= 50', '다섯 친구의 신뢰 합계가 50 이하', 2, 'keep', ''),
135: ('FRIEND', 'friendsBroken = 5', '친구 다섯 모두와 절교', 3, 'keep', ''),
136: ('FRIEND', 'econ = boom', '호황(가게 수입 ×1.3)일 때 관계 파산', 3, 'keep', 'v1 기기 날짜 → 경기'),
137: ('FRIEND', 'last3 has stamp:friend', '친구 빚에 도장을 찍은 직후 관계 파산', 2, 'keep', ''),
138: ('FRIEND', 'house = 0 & assetsOwned = 0', '텐트에 살고 자산도 없이 관계 파산', 1, 'keep', ''),
139: ('FRIEND', 'borrowedThenTraded >= 3', '친구 돈을 3번 넘게 거래에 넣은 세대가 관계 파산', 3, 'keep', ''),
140: ('LEGACY|BANK|SHARK|LIQ|TIP', 'inherit = gift', '빚 없이 은퇴한 부모에게 증여받은 세대가 파산', 3, 'rewrite', '선행상 → 부모가 쌓은 이름'),
141: ('FRIEND', 'cashAtBreak >= friendDebtAtBreak', '갚을 현금이 있었는데 갚지 않아 절교', 2, 'rewrite', '항아리 절도 → 있는 돈을 안 갚음'),
142: ('FRIEND', 'broken has squirrel & broken has raccoon & broken has rabbit', '단짝 다람쥐·절친 너구리·이웃 토끼와 절교', 2, 'keep', ''),
143: ('FRIEND', 'broken has halfPaidFriend', '빚을 절반 넘게 갚은 친구와 절교', 2, 'keep', ''),
144: ('FRIEND', 'broken has squirrel', '단짝 다람쥐와 절교', 1, 'keep', ''),
145: ('SHARK', 'claimsSold >= 300000', '친구들이 독사에게 넘긴 채권이 30만 도토리 이상', 3, 'tweak', ''),
146: ('FRIEND', 'broken has fox', '여우 선배와 절교', 1, 'keep', ''),
147: ('FRIEND', 'lastBroken = squirrel', '세 번째로 절교한 친구가 단짝 다람쥐(빚은 탕감됨)', 2, 'keep', ''),
148: ('LEGACY|BANK|SHARK', 'inherit = renounce & last = refused:grudge', '상속포기한 세대가 원한 품은 채권처에서 거절당한 직후 파산', 3, 'keep', 'v1 대용 조건 → 원한 기록'),
149: ('FRIEND', 'friendOd >= 10', '갚기로 한 날을 10번 넘김', 2, 'keep', ''),
150: ('FRIEND', 'fam.sameCauseStreak.FRIEND >= 2', '2대 연속 관계 파산', 3, 'keep', ''),
# ── 선물·청산 (151~200) ──
151: ('LIQ', 'lev = 200 & holdSec <= 3', '200배로 들어가 3초 안에 청산', 1, 'keep', ''),
152: ('LIQ', 'dir = long & viaJump = true & holdSec <= 10', '롱 진입 10초 안에 급락 틱으로 청산', 2, 'keep', ''),
153: ('LIQ', 'lev = 200 & dir = short & watchSec >= 100', '거래 탭에서 100초 넘게 지켜보기만 하다 200배 숏으로 청산', 2, 'keep', ''),
154: ('LIQ', 'viaJump = true & sl = none', '손절 없이 급변 틱 하나에 청산', 2, 'keep', ''),
155: ('LIQ', 'adds >= 1', '추가 진입(물타기)한 포지션이 청산', 1, 'keep', ''),
156: ('LIQ', 'lev = 200 & dir = short & newsAfterEntry = up', '200배 숏을 잡은 뒤 그 종목에 호재 속보가 뜨고 청산', 3, 'keep', ''),
157: ('LIQ', 'adds >= 2', '추가 진입을 2번 넘게 한 포지션이 청산', 2, 'keep', ''),
158: ('LIQ', '', '강제 청산으로 현금이 바닥나 파산', 1, 'keep', '청산의 기본 엔딩'),
159: ('BANK|SHARK', 'laborTaps >= 300 & trades = 0 & assetsEver = 0', '거래도 자산도 없이 노동만 300회 넘게 하고 연체로 파산', 1, 'keep', ''),
160: ('LIQ', 'lev <= 10', '10배 이하 포지션이 청산', 3, 'keep', ''),
161: ('LIQ', 'viaFunding = true', '펀딩비가 증거금을 깎아 청산', 3, 'keep', ''),
162: ('LIQ', 'tipsIgnored >= 10 & tipTrades = 0', '정보 10건을 모두 흘려보내고 자기 판단으로만 거래하다 청산', 2, 'keep', 'v1 대용 조건 → 정보 무시 횟수'),
163: ('TIP', '', '속보·추천·소문을 따라 들어간 포지션이 청산되어 파산', 1, 'keep', '낚임의 기본 엔딩'),
164: ('LIQ', 'offline = true', '앱을 꺼 둔 사이 청산', 2, 'keep', ''),
165: ('LIQ', 'lev = 200 & dir = short & marginPct = 100', '전액 200배 숏이 청산', 2, 'keep', ''),
166: ('LIQ', 'fundedBy = shark2 & lev = 200', '독사에게 빌리고 60초 안에 200배로 진입한 포지션이 청산', 2, 'keep', ''),
167: ('LIQ', 'roeLowSec >= 10', 'ROE -80% 아래에서 10초 넘게 버티다 청산', 2, 'keep', ''),
168: ('LIQ', 'sharkDebt > 0 & trades >= 30', '사채 빚을 진 채 30번 넘게 거래하다 청산', 2, 'keep', ''),
169: ('LIQ', 'viaJump = true & holdSec <= 2', '진입 2초 안에 급변 틱으로 청산', 3, 'keep', ''),
170: ('LIQ', 'lev200Trades >= 5 & nonLev200Trades = 0', '한 세대 내내 200배로만 5번 넘게 거래하다 청산', 2, 'keep', ''),
171: ('LIQ', 'viaGap = true', '주식형 종목을 밤에 들고 있다가 아침 개장 갭에 청산', 2, 'tweak', '만기일 → 장 마감 갭'),
172: ('LIQ|BANK|SHARK', 'hasLong = true & hasShort = true & fundingPaid >= 0.2 * margin', '롱과 숏을 동시에 든 채 펀딩비가 증거금의 20%를 넘기고 파산', 3, 'keep', ''),
173: ('LIQ|TIP', 'secSinceFamilyRecord <= 60', '가문 최고 재산 기록을 새로 쓴 지 60초 안에 청산 파산', 3, 'tweak', '랭킹 1위 → 가문 기록 갱신'),
174: ('LIQ', 'posFundingPaid >= 0.3 * posMargin', '한 포지션의 펀딩비가 그 증거금의 30%를 넘긴 뒤 청산', 3, 'keep', ''),
175: ('LIQ', 'fam.taps >= 10000 & lev = 200', '가문 누적 노동 1만 회 뒤 200배 청산', 3, 'keep', ''),
176: ('LIQ', 'dir = long & entryAtHigh = true', '최근 120초 최고가에서 롱 진입한 포지션이 청산', 2, 'keep', ''),
177: ('LIQ', 'dir = short & entryAtLow = true', '최근 120초 최저가에서 숏 진입한 포지션이 청산', 2, 'keep', ''),
178: ('LIQ', 'revengeWithin10s = same', '청산 10초 안에 같은 방향으로 다시 들어가 또 청산', 2, 'keep', 'v1 대용 조건 → 재진입 기록'),
179: ('LIQ', 'fadedReliable = true', '출처 있는 속보와 반대로 들어간 포지션이 청산', 2, 'keep', 'v1 대용 조건 → 정보 반대 진입'),
180: ('LIQ', 'marginCalls >= 3', '마진콜 경고를 3번 넘기고 청산', 2, 'keep', ''),
181: ('TIP', 'tipSource = capital_pick', '족제비 대표의 추천 종목을 따라 들어갔다 청산', 1, 'tweak', '호가창 벽 → 캐피탈 추천'),
182: ('TIP', 'tipSource = friend:fox & margin <= 10000', '여우 선배의 소문을 따라 증거금 1만 이하의 마지막 포지션이 청산', 3, 'keep', ''),
183: ('LIQ', 'dir = long & econ = slump & sameDirStreak >= 3', '불경기(최근 5분 -2.5%)에 롱만 3번 연달아 잡다 청산', 2, 'keep', ''),
184: ('LIQ', 'winStreak >= 9 & marginPct = 100', '9연승 뒤 전액 포지션이 청산', 3, 'keep', ''),
185: ('LIQ', 'tp = set & maxRoe >= 0.9 * tp', '익절선의 90%까지 갔다가 돌아서 청산', 3, 'keep', ''),
186: ('LIQ', 'offline = true & posCount >= 2', '포지션 둘 이상을 열어 둔 채 앱을 끄고 청산', 3, 'tweak', '자동 매매 → 열어 두고 자리 비움'),
187: ('LIQ', 'flips >= 2', '청산 10초 안에 반대 방향으로 갈아타기를 2번 넘게 하고 청산', 2, 'keep', ''),
188: ('BANK|SHARK', 'openPosLev <= 5 & openPosHoldSec >= 600', '5배 이하 포지션을 10분 넘게 든 채 연체로 파산', 3, 'keep', 'v1 대용 조건 → 저배율 장기 보유'),
189: ('LIQ', 'liqsThisCycle >= 2', '한 정산 회차에 포지션 2개 이상 청산', 2, 'keep', ''),
190: ('LIQ|BANK|SHARK', 'grossPnl >= 0 & fees > grossPnl & lev200Trades >= 1', '거래 손익은 플러스인데 수수료·펀딩비가 더 커서 파산', 3, 'keep', ''),
191: ('LIQ', 'sl = set & viaJump = true', '손절을 걸었지만 급변 틱이 손절가를 건너뛰어 청산', 2, 'keep', ''),
192: ('TIP', 'tipSource = friend:raccoon & lev = 200', '절친 너구리의 소문을 따라 200배로 들어갔다 청산', 2, 'keep', ''),
193: ('LIQ', 'liqStreak >= 5 & lev = 200', '200배로 5번 연속 청산', 3, 'keep', ''),
194: ('LIQ', 'lev = 200 & lev200Trades = 1', '이번 세대의 첫 200배 거래가 청산', 1, 'keep', ''),
195: ('TIP', 'tipSource = leadroom & leadroomFollowed >= 4', '리딩방 전단지를 4번째 이상 따라 들어갔다 청산', 2, 'keep', 'v1 대용 조건 → 리딩방(처음 3번은 맞음)'),
196: ('LIQ', 'offline = true & lev = 200', '200배 포지션을 열어 둔 채 앱을 끄고 청산', 3, 'keep', ''),
197: ('LIQ', 'fam.liqs >= 100', '가문 누적 청산 100번째', 3, 'keep', ''),
198: ('UPKEEP', 'house >= 1 & trades >= 20', '20번 넘게 거래한 세대가 집 유지비를 못 내 파산', 2, 'keep', ''),
199: ('LIQ|TIP', 'lossRecord = true & lastLoss >= 1000000', '한 번의 청산 손실이 100만 도토리 이상이고 가문 최대 기록', 3, 'keep', ''),
200: ('LIQ|TIP', 'fam.bankruptcies >= 50 & fam.collected >= 150 & lev >= 100', '가문 누적 파산 50번, 장부 150쪽을 채운 뒤 100배 이상 청산', 3, 'keep', '맨 마지막 엔딩'),
}
assert sorted(M) == list(range(1, 201)), 'rows 1..200 필요'

# ── 2차 재배치 [사용자 확정 2026-11-25] ──
# 사채·관계에서 내용이 겹치는 24개를 낚임·압류 연쇄·대물림·유지비로 옮기고 제목·대사·그림을 다시 쓴다(번호 유지).
# 값: (원인, 상황 조건, 도감 단서, 희귀도, 새 제목, 새 대사, 새 그림 모티프)
MOVE = {
 # 낚임 8
 74: ('TIP', 'tipSource = friend:bear', '곰 형의 소문을 따라 들어간 포지션이 청산', 1, '곰 형의 확실한 소식', '곰 형이 이번에는 진짜 바닥이라고 했습니다. 지난번에도 그렇게 말했습니다.', '차트 앞에서 엄지를 든 곰 형과, 그 뒤에서 굳은 칩멍크'),
 122: ('TIP', 'tipSource = wire_flow', "'대량 체결' 속보를 따라 들어간 포지션이 청산", 1, '큰손을 따라 들어가다', '큰손이 샀다는 속보를 보고 따라 샀습니다. 큰손은 그 사이에 팔았습니다.', '속보 띠를 올려다보는 칩멍크와 텅 빈 주문 화면'),
 119: ('TIP', 'tipAgree >= 3', '세 출처 이상이 같은 방향을 말할 때 따라 들어간 포지션이 청산', 3, '모두가 같은 말을 한 날', '속보도, 족제비 대표도, 곰 형도 오른다고 했습니다. 전부 틀렸습니다.', '같은 쪽을 가리키는 말풍선 셋과 반대로 꺾인 차트'),
 93: ('TIP', 'tipSource = viper & fundedBy = shark2', "독사 대부의 '확실한 정보'를 듣고, 독사에게 빌린 돈으로 들어간 포지션이 청산", 3, '정보와 대출을 한 창구에서', '독사 대부가 종목과 돈을 함께 내밀었습니다. 종목은 틀렸고 빚은 그대로입니다.', '등불 아래 나란히 놓인 종목 쪽지와 차용증'),
 59: ('TIP', 'tipWasRight = true & lev >= 100', '정보가 가리킨 방향이 맞았는데도 100배 이상이라 그 전에 청산', 2, '방향은 맞았다', '정보가 가리킨 방향은 맞았습니다. 100배 포지션은 그 전에 청산되었습니다.', '청산 표시 뒤로 뒤늦게 솟는 차트'),
 126: ('TIP', 'fam.bankruptcies.TIP >= 3', '가문에서 세 번째 낚임 파산', 3, '3대째 귀가 얇은 집', '윗대도 남의 말을 듣고 들어갔습니다. 정보 수첩의 그 칸에는 빗나간 표시만 늘었습니다.', '빗금으로 가득한 정보 수첩을 넘기는 칩멍크'),
 84: ('TIP', 'tipSource = wire_break & marginPct = 100', "'고가·저가 갱신' 속보를 믿고 전액을 넣었다가 청산", 2, '속보는 사실이었다', '고가를 넘었다는 속보는 사실이었습니다. 넘은 뒤에 더 오른다는 말은 속보에 없었습니다.', '고가 선 바로 위에서 꺾인 차트와 빈 지갑'),
 136: ('TIP', 'tipSource = weasel & fundedBy = capital', '족제비 대표의 추천을 듣고, 캐피탈에서 빌린 돈으로 들어간 포지션이 청산', 2, '추천과 한도를 함께 받다', '족제비 대표가 종목을 추천하며 한도를 올려 주었습니다. 종목은 내렸고 한도는 빚이 되었습니다.', '웃는 족제비 대표의 명함과 한도 상향 안내문'),
 # 압류 연쇄 7
 51: ('SEIZE', 'seized has wheel2', '보조 쳇바퀴를 쳇바퀴째 압류당하고 파산', 1, '자루부터 가져갑니다', '오소리 소장은 싼 것부터 가져갑니다. 첫 번째는 도토리 자루였습니다.', '자루를 메고 가는 오소리 소장의 뒷모습'),
 78: ('SEIZE', 'seized has helper', '알바 햄스터의 쳇바퀴를 압류당하고 파산', 2, '알바 햄스터의 마지막 출근', '알바 햄스터의 근로 계약이 채권처로 넘어갔습니다. 내일부터 다른 가게로 출근합니다.', '작업모를 벗어 두고 나가는 햄스터'),
 94: ('SEIZE', 'seized has row', '쳇바퀴 줄을 압류당하고 파산', 2, '좌판 자리의 새 주인', '길목 좌판에 압류 딱지가 붙었습니다. 다음 날 같은 자리에 다른 좌판이 섰습니다.', '딱지 붙은 좌판과 그 옆에 새로 펴지는 파라솔 잎'),
 112: ('SEIZE', 'seized has shed', '채굴 헛간 이상의 설비를 압류당하고 파산', 3, '간판은 그대로, 주인만 바뀌다', '가공점이 공매로 넘어갔습니다. 새 주인은 간판을 바꾸지 않았습니다.', '같은 간판 아래 낯선 주인이 문을 여는 가게'),
 131: ('SEIZE', 'econ in slump|crash', '불경기나 공황에 자산이 압류되며 파산', 2, '불경기에는 딱지가 빨리 붙는다', '손님이 줄어 수입이 반 토막 났습니다. 이자는 줄지 않았습니다.', '손님 없는 가게 문에 붙은 가압류 딱지'),
 65: ('SEIZE', 'assetsSeized >= 3', '한 세대에 자산을 3개 이상 압류당하고 파산', 2, '압류 수레 세 번', '압류 수레가 세 번 다녀갔습니다. 네 번째에는 실을 것이 없었습니다.', '빈 일터 앞에 멈춘 빈 수레'),
 121: ('SEIZE', 'seizedBoughtWithLoan = true', '빚을 내어 산 자산을 압류당하고 파산', 2, '빚으로 산 가게', '빚을 내어 가게를 샀습니다. 가게는 넘어갔고 빚은 남았습니다.', '대출 서류와 압류 딱지가 나란히 붙은 문'),
 # 대물림 6
 63: ('LEGACY', 'inherit = simple & fam.simpleStreak >= 3', '3대 연속 단순승인한 세대가 대물림 파산', 3, '3대째 같은 도장', '3대가 같은 서류에 같은 도장을 찍었습니다. 빚의 주인만 바뀌었습니다.', '도장 자국 세 개가 나란히 찍힌 나뭇잎 서류'),
 108: ('LEGACY', 'inherit = simple & seized has inheritedSign', '물려받은 가업 간판이 압류되고 대물림 파산', 3, '간판만 남았던 가업', '물려받은 가업의 간판이 압류 수레에 실렸습니다. 이번에는 간판도 남지 않았습니다.', '수레에 실려 가는 낡은 간판'),
 96: ('LEGACY', 'inherit = gift & soldForTax >= 1', '증여세를 내려고 자산을 판(또는 공매당한) 세대가 파산', 2, '세금 내려고 판 가게', '세금을 내려고 가게를 팔았습니다. 가게가 없으니 다음에 낼 돈을 벌 곳도 없었습니다.', '세무서 창구 앞에 놓인 가게 열쇠'),
 142: ('LEGACY', 'inherit = simple & inheritedPaid = 0', '물려받은 빚에 도장을 한 번도 찍지 못하고 파산', 2, '한 톨도 줄지 않은 유산', '물려받은 빚은 처음 그대로였습니다. 이자만 내다가 끝났습니다.', '숫자가 그대로인 장부와 닳은 도장'),
 149: ('LEGACY', 'parentCause = LEGACY', '부모도 대물림으로 파산했는데 또 대물림 파산', 3, '장부의 두 쪽이 똑같다', '부모와 같은 자리에서 같은 방식으로 끝났습니다. 가문 장부의 두 쪽이 똑같습니다.', '펼친 장부의 양쪽에 같은 그림'),
 86: ('LEGACY', 'inherit = simple & lastLender = tax', '단순승인으로 받은 재산의 상속세를 못 내 파산', 3, '받은 것이 많아 낼 것도 많다', '빚보다 재산이 많은 상속이었습니다. 세금은 현금으로만 받았습니다.', '가게와 집 그림 위에 놓인 세금 고지서'),
 # 유지비 3
 138: ('UPKEEP', 'house = 1', '통나무 오두막의 생활비·유지비를 3회 연속 못 냄', 1, '오두막의 관리비', '통나무 오두막에 사는 값을 세 번 내지 못했습니다. 텐트에서는 들지 않던 돈입니다.', '오두막 문에 붙은 공고와 접어 든 텐트'),
 134: ('UPKEEP', 'houseInherited = true', '물려받은 집의 생활비·유지비를 3회 연속 못 냄', 2, '물려받은 집의 값', '집은 물려받았습니다. 그 집에 사는 값은 물려받지 못했습니다.', '큰 집 대문 앞의 작은 칩멍크와 우편함의 독촉장'),
 73: ('UPKEEP', 'house >= 1 & assetsOwned = 0', '방치 자산이 하나도 없이 집 유지비를 못 내 파산', 2, '집은 있고 벌이는 없다', '집을 사는 데 전부 썼습니다. 벌어 줄 것은 하나도 남기지 않았습니다.', '텅 빈 일터와 번듯한 집'),
}
# 1차에서 '대사를 다시 써야 함'으로 표시한 8개와, 실시간 시세로 조건이 바뀐 것의 새 글
# 값: (새 제목 또는 None, 새 대사, 새 그림 모티프)
REWRITE = {
 24: ('읽지 않은 상속 서류', '석 달 안에 포기하지 않으면 전부 받은 것으로 본다는 조항을 아무도 읽어 주지 않았습니다.', '우편함에 꽂힌 채 석 달이 지난 나뭇잎 통지서'),
 30: ('리딩방의 적중 내역', "전단지에는 지난 적중 내역이 빼곡했습니다. 전부 지나간 뒤에 적은 것이었습니다.", '적중 표시로 가득한 전단지와 빈 지갑'),
 38: ('담보 대출금 용도 외 사용', '집을 담보로 빌린 돈을 차트에 넣었습니다. 돈은 사라졌고 담보는 남아 있습니다.', '담보 대출 서류 위에 놓인 청산 통지'),
 79: ('채권처끼리 돌려 보는 장부', '떼인 채권처들은 서로 장부를 돌려 봅니다. 이 가문의 이름에는 줄이 두 번 그어져 있었습니다.', '창구마다 같은 쪽이 펼쳐진 장부'),
 120: ('소문 값도 못 치르다', '그 친구의 소문으로 돈을 벌었습니다. 그 친구에게 빌린 돈은 갚지 않았습니다.', '닫힌 문 앞에 놓인 정보 수첩'),
 125: ('유품과 우정을 함께 맡기다', '윗대가 남긴 유품은 전당 창고에 있고, 친구들의 문은 닫혔습니다.', '전당 딱지가 붙은 유품 상자와 닫힌 문 세 개'),
 140: ('부모가 쌓은 이름', '빚 없이 물려받은 집안이었습니다. 한 세대 만에 독촉장이 다시 왔습니다.', '금빛 테두리 가계도 옆에 꽂힌 독촉장'),
 141: ('있는 돈을 갚지 않다', '갚을 돈은 주머니에 있었습니다. 친구는 그것을 알고 있었습니다.', '불룩한 지갑을 든 칩멍크와 돌아선 친구'),
}
M[30] = ('TIP', 'tipSource = leadroom & marginPct = 100', "리딩방 전단지의 '적중 내역'을 믿고 전액을 넣었다가 청산", 2, 'rewrite', '보이스피싱 문자 → 리딩방 전단지'),
M[30] = M[30][0]
M[76] = ('TIP', 'tipSource = viper & holdSec <= 10', "독사 대부의 '확실한 정보'를 따라 들어가 10초 안에 청산", 2, 'keep', 'v1 대용 조건 → 독사의 정보')
M[156] = ('LIQ', 'lev = 200 & dir = short & newsAfterEntry = up', "200배 숏을 잡은 뒤 그 종목에 '고가 갱신' 속보가 뜨고 청산", 3, 'keep', '')
M[171] = ('LIQ', 'time = 밤 & secToSettle <= 5', '밤 정산 5초 전 안에 청산', 2, 'tweak', '만기일 → 밤 정산 직전. 실시간 코인 시세는 장 마감이 없어 갭 규칙을 뺐다')
M[179] = ('LIQ', 'fadedWire = true', "'고가·저가 갱신'·'대량 체결' 속보와 반대로 들어간 포지션이 청산", 2, 'keep', 'v1 대용 조건 → 속보 반대 진입')
M[181] = ('TIP', 'tipSource = weasel', '족제비 대표의 추천 종목을 따라 들어갔다 청산', 1, 'tweak', '호가창 벽 → 캐피탈 추천')
M[183] = ('LIQ', 'dir = long & econ in slump|crash & sameDirStreak >= 3', '불경기·공황(최근 5분 -2.5% 이하)에 롱만 3번 연달아 잡다 청산', 2, 'keep', '')
M[195] = ('TIP', 'tipSource = leadroom & leadroomFollowed >= 4', '리딩방 전단지를 한 세대에 4번째 이상 따라 들어갔다 청산', 2, 'keep', 'v1 대용 조건 → 리딩방')
M[136 if False else 162] = ('LIQ', 'tipsIgnored >= 10 & tipTrades = 0', '정보 10건을 모두 흘려보내고 자기 판단으로만 거래하다 청산', 2, 'keep', 'v1 대용 조건 → 정보 무시 횟수')
# ── 시간 조건 고침 [사용자 확정 2026-11-25: 정산 3분 · 포지션 방치 · 증폭 없음] ──
# 초 단위 조건 13개를 '정산 횟수(3분)·분·시간' 단위로 바꾼다. viaJump = 한 정산(3분) 동안 평소의 3배 넘게 움직임.
M[76] = ('TIP', 'tipSource = viper & holdSettles <= 1', "독사 대부의 '확실한 정보'를 따라 들어가 그 정산(3분) 안에 청산", 3, 'keep', '시간 단위 고침: 10초 → 정산 1회')
M[151] = ('LIQ', 'lev = 200 & holdSettles <= 1', '200배로 들어가 그 정산(3분) 안에 청산', 2, 'tweak', "시간 단위 고침: 3초 → 정산 1회. 제목의 '1초'는 '3분'으로")
M[152] = ('LIQ', 'dir = long & viaJump = true & holdSettles <= 2', '롱 진입 뒤 정산 2회(6분) 안에 급락으로 청산', 2, 'keep', '시간 단위 고침')
M[153] = ('LIQ', 'lev = 200 & dir = short & watchSec >= 300', '거래 탭에서 5분 넘게 지켜보기만 하다 200배 숏으로 청산', 2, 'keep', '시간 단위 고침: 100초 → 5분')
M[154] = ('LIQ', 'viaJump = true & sl = none', '손절 없이, 한 정산에 평소의 3배 넘게 움직인 급변에 청산', 2, 'keep', '급변의 뜻을 정산 단위로')
M[167] = ('LIQ', 'roeLowMin >= 30', 'ROE -80% 아래에서 30분 넘게 버티다 청산', 2, 'keep', '시간 단위 고침: 10초 → 30분')
M[169] = ('LIQ', 'viaJump = true & holdSettles <= 1 & lev <= 100', '100배 이하로 들어간 그 정산(3분) 안에 급변으로 청산', 3, 'keep', '시간 단위 고침')
M[171] = ('LIQ', 'time = 밤 & offline = true & awayHours <= 1', '마을의 밤 회차에 포지션을 걸어 두고 나갔다가 1시간 안에 청산', 2, 'tweak', '만기일 → 밤에 걸어 두고 나감')
M[173] = ('LIQ|TIP', 'minSinceFamilyRecord <= 30', '가문 최고 재산 기록을 새로 쓴 지 30분 안에 청산 파산', 3, 'tweak', '시간 단위 고침: 60초 → 30분')
M[178] = ('LIQ', 'revengeWithinSettles <= 1 & revengeDir = same', '청산 뒤 정산 1회 안에 같은 방향으로 다시 들어가 또 청산', 2, 'keep', '시간 단위 고침')
M[187] = ('LIQ', 'flips >= 2', '청산 뒤 정산 1회 안에 반대 방향으로 갈아타기를 2번 넘게 하고 청산', 2, 'keep', '시간 단위 고침')
M[188] = ('BANK|SHARK', 'openPosLev <= 5 & openPosHoldHours >= 8', '5배 이하 포지션을 8시간 넘게 든 채 연체로 파산', 3, 'keep', '시간 단위 고침: 10분 → 8시간')
M[191] = ('LIQ', 'sl = set & viaJump = true', '손절을 걸었지만 한 정산의 급변이 손절가를 건너뛰어 청산', 2, 'keep', '급변의 뜻을 정산 단위로')
# 포지션 방치(자리를 비운 사이)에 맞춘 것
M[164] = ('LIQ', 'offline = true', '포지션을 걸어 두고 앱을 꺼 둔 사이 청산(포지션은 꺼져 있어도 계속 돈다)', 1, 'keep', '포지션 방치')
M[186] = ('LIQ', 'offline = true & posCount >= 2', '포지션 둘 이상을 걸어 두고 나간 사이 청산', 2, 'tweak', '자동 매매 → 걸어 두고 자리 비움')
M[196] = ('LIQ', 'offline = true & lev = 200 & awayHours >= 6', '200배 포지션을 걸어 두고 6시간 넘게 자리를 비운 사이 청산(자고 일어나니)', 2, 'keep', '포지션 방치')
# ── 잔혹 수위 재검토 [사용자 확정 2026-11-25: 17세 이상, "사회적 잔혹 최대" — docs/TONE_AND_MANNER.md 8-1] ──
# 너무 순하게 눙친 결말은 현실 결과가 드러나게 강화하고, 금지(피·상처·신체 훼손·시신 직접 묘사, 자살·자해의 묘사와 암시, 피해자 조롱)에 걸리는 표현은 고친다.
# 값: (새 제목 또는 None, 새 대사 또는 None, 새 그림 또는 None, 이유)
TONE = {
 21: (None, '어제는 황금 저택, 오늘은 길바닥 텐트. 낙찰자가 대문 열쇠를 바꿨습니다.', None, '강화: 쫓겨난 결과를 구체로(열쇠 교체). 집 이름도 게임 것으로'),
 44: ('신체포기각서 나뭇잎 서명', '급여 양도 각서의 다음 장은 신체포기각서였습니다. 읽기도 전에 도장 자리가 접혀 있었습니다.', '등불 아래 두 장짜리 각서와, 도장을 쥔 칩멍크의 뒷모습', '강화: v1에서 뺀 신체포기각서를 서류로만 되살림(허용: 서류와 암시)'),
 45: (None, '빚 대신 팔려 간 곳은 창문 없는 건물의 콜센터였습니다. 갚은 돈은 통화 건수로 세고, 장부는 그쪽이 씁니다.', '창문 없는 방, 줄지어 앉은 뒷모습들 가운데 번호표 붙은 헤드셋을 쓴 칩멍크', '강화: 팔려 가는 노동임을 드러냄'),
 47: (None, '한 번 찍은 인감은 백지 위임장에도 찍혀 있었습니다. 내 이름으로 된 것은 이제 내 것이 아닙니다.', '인감이 찍힌 백지 여러 장과 빈 도장집을 든 칩멍크', '강화: 인감·백지 위임의 현실 결과'),
 53: (None, '독사 대부의 행동대장 곰이 일터로 찾아왔습니다. 그날로 일자리가 없어졌습니다.', '가게 문 앞에 선 거대한 곰 그림자와 앞치마를 벗어 든 칩멍크', '강화: 직장으로 찾아오는 추심'),
 55: (None, '독사 대부가 고향 할머니 댁 마루에 앉아 기다렸습니다. 할머니는 집을 내놓았고, 손주에게는 연락하지 않았습니다.', "'매매' 팻말이 꽂힌 시골집 마당과 대문 밖에 선 칩멍크", '강화: 가족에게 간 추심과 가족 해체'),
 56: (None, None, '꺾인 화살표 모양으로 이어진 차용증들 한가운데의 칩멍크', "고침: 그림의 '묶인' 몸 → 서류에 둘러싸임"),
 64: (None, '단 한 번의 호기심으로 독사 대부의 문을 열었습니다. 장부에 오른 이름은 지워지지 않습니다.', None, "고침: '인생이 끝났습니다'는 죽음으로 읽힐 수 있어 삭제"),
 72: ('염전 섬 선불 계약', '선불금을 받고 배를 탔습니다. 섬에서 나오는 배는 빚을 다 갚은 사람만 탑니다.', '멀어지는 부두와 배 난간에 선 작은 뒷모습', '강화: 섬 노동(허용 소재)'),
 81: (None, '가진 모든 것에 담보 딱지가 붙었습니다. 목록의 마지막 줄에는 물건이 아닌 것이 적혀 있었습니다.', '딱지로 뒤덮인 방 한가운데의 칩멍크와 그 앞에 남은 딱지 한 장', '강화: 신체 담보를 목록의 한 줄로만 암시'),
 88: (None, '사채 피해자 모임에 나갔습니다. 3대째 같은 얼굴들이 냇가 텐트촌에 모여 삽니다.', '냇가 텐트촌에서 도토리 국수를 나눠 먹는 동물들', '강화: 대물림과 노숙. 조건(3대 연속 사채 파산)과 맞춤'),
 92: ('원양어선 선불 계약', '선불금은 독사 대부가 받았고 배는 칩멍크가 탔습니다. 돌아오는 날짜는 계약서에 없습니다.', '새벽 항구, 어선 갑판의 작업복 차림 칩멍크와 부두에서 서류를 접는 독사 대부의 그림자', '강화: 원양어선(허용 소재)'),
 100: (None, '독사 대부의 최우수 고객이 되었습니다. 계약은 평생 갱신이고, 다음 계약자 칸에는 자식의 이름이 적혀 있습니다.', "'VIP 채무자' 명패와 서명란이 하나 더 있는 계약서 앞의 칩멍크", '강화: 평생 채무와 대물림'),
 150: (None, '마을 명부에서 이름이 지워졌습니다. 아무도 살지 않는 웅덩이 섬에서 혼자 겨울을 납니다.', '눈 내리는 웅덩이 섬의 나뭇잎 한 장 위, 혼자 앉은 칩멍크', '강화: 쓸쓸한 결말을 구체로'),
 156: ('숏 포지션 벼락 롱빔', None, None, "고침: 제목의 '폭사' 삭제"),
 158: (None, '전부 걸었다가 청산당했습니다. 주소지는 냇가의 뗏목이고, 우편물은 받을 수 없습니다.', '냇가 뗏목 위에서 젖은 독촉장을 말리는 칩멍크', '강화: 노숙의 현실 결과(주소 없음)'),
 162: (None, None, '모니터 가득 찬 지표선에 둘러싸인 칩멍크', "고침: 그림의 '꽁꽁 묶인' 몸 → 둘러싸임"),
 168: (None, '사채업자가 차트 방을 얻어 주었습니다. 문은 밖에서 잠기고, 수익은 방세와 이자로 먼저 나갑니다.', '밖에서 자물쇠가 걸린 문과 모니터 불빛 아래의 칩멍크', '강화: 빚 때문에 묶인 노동'),
 180: (None, None, "'MARGIN CALL' 빨간 경고 창을 끄는 손과 그 뒤에서 0이 되는 잔고", "고침: 그림의 '폭사' 삭제"),
}
assert not (set(TONE) & set(MOVE)) and not (set(TONE) & set(REWRITE))
# ── 한 번 더 어둡게 [사용자 확정 2026-11-25: "표정이 더 절망적이어야… 내용도", "상황도 절망적이어야지", 죽음의 암시, 사채업자 처리 장면] ──
# 글은 '통지가 왔다'가 아니라 '그 결과 지금 이렇게 산다'로. 원본은 endings_direction_data.py 의 DARK.
import sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from endings_direction_data import DARK, DEATH, RISK
# ── 쳇바퀴 채굴 [사용자 확정 2026-11-25]: 자산 이름과 채굴·지갑·전기세 조건 ──
# 새 엔딩을 늘리지 않고 기존 것에 배정한다.
M[131] = ('SEIZE', 'powerNegative = true', '코인 값이 내려 설비가 역마진(캔 값 < 전기세)인 채 압류되며 파산', 2, 'moved', '2차 재배치 + 채굴: 불경기 → 전기세 역마진')
M[183] = ('BANK|SHARK|SEIZE', 'walletDrawdown >= 30 & walletShare >= 50', '지갑의 코인을 고점에서 팔지 않고 쥐다가 평가액이 30% 넘게 빠진 채 파산(재산의 절반 이상이 지갑)', 2, 'rewrite', '채굴: 하락장에 롱 고집 → 지갑을 쥐고 버팀')
M[159] = ('BANK|SHARK', 'laborTaps >= 300 & trades = 0 & assetsEver = 0', '거래도 설비도 없이 쳇바퀴만 300번 넘게 돌리고 연체로 파산', 1, 'tweak', '줍기 → 쳇바퀴')
M[190] = ('LIQ|BANK|SHARK', 'forcedSold >= 100000', '급매(수수료 3%)로 판 코인이 한 세대에 10만 도토리어치를 넘김', 3, 'rewrite', '채굴: 수수료 청산 → 급매 수수료')
V1CAUSE = {no: M[no][0] for no in MOVE}
for no, (cause, mods, clue, rarity, t2, l2, m2) in MOVE.items():
    M[no] = (cause, mods, clue, rarity, 'moved', f'2차 재배치: {V1CAUSE[no]} → {cause}')

CAUSE = {'LIQ': '청산', 'TIP': '낚임', 'SHARK': '사채', 'BANK': '제도권', 'UPKEEP': '유지비', 'SEIZE': '압류 연쇄', 'FRIEND': '관계', 'LEGACY': '대물림'}
SIGN_CAUSE = {
    'LIQ': '포지션 줄이 깜빡이고(ROE -70%) 칩멍크 얼굴에 식은땀',
    'TIP': "포지션 줄에 '정보 따라 진입: 출처' 꼬리표",
    'SHARK': '사채 건물의 연체 딱지 1/2, 수입 30% 가압류 안내',
    'BANK': '조합·캐피탈·세무서 건물의 연체 딱지 n/3, 창구의 독촉 대사',
    'UPKEEP': '내 집 우편함에 쌓이는 독촉장 n/3',
    'SEIZE': '자산 위의 가압류 딱지 → 압류 수레가 실어 감',
    'FRIEND': '친구 집 문 색이 바래고 말이 짧아짐, 절교 n/3',
    'LEGACY': "HUD 빚 알약의 '물려받은 빚' 띠, 세무서 기한 타이머",
}
TRACE = {
    'LIQ': "유품 '찢어진 주문서'. 기질 '한 방 체질'(배율 기본값 50배, 100배 이상 수수료 절반)",
    'TIP': "유품 '구겨진 전단지'. 기질 '의심병'(정보마다 출처 적중률이 보임, 속보가 3초 늦게 뜸)",
    'SHARK': "채권처 원한 또는 연줄. 기질 '빚 내성'(독사 골목이 처음부터 열림, 선이자 30%)",
    'BANK': "신용 기록 '기한이익 상실'. 기질 '서류 체질'(담보인정비율 +5%p, 금리 인상 속보 때 이자 +50%)",
    'UPKEEP': "마을에 빈 집터. 기질 '허세'(집 유지비 +20%, 집 단계별 한도 +20%)",
    'SEIZE': "일터에 남의 간판. 기질 '장사꾼 피'(자산 수입 +10%, 가압류 딱지가 연체 1회 일찍 붙음)",
    'FRIEND': "절교한 친구의 시작 신뢰 60. 기질 '외톨이'(노동 수입 +10%, 친구 소문이 절반만 들림)",
    'LEGACY': "가문 장부에 '3대째' 표시. 기질 '굳은살'(노동 수입 +15%, 상속 재산 명세서가 한 줄 가려짐)",
}
KEYSIGN = [
    ('house', '마을의 집 외형'), ('tagged', '자산 위 가압류 딱지 수'), ('tagBy', '딱지 색(채권처별)'), ('seized', '압류 수레'), ('garnish', "'수입 30% 가압류 중' 안내"),
    ('contacts', '독사 창구의 연락처 동의 칸'), ('pawned', '유품 칸의 전당 딱지'), ('time', '마을 하늘 색(아침·낮·저녁·밤)'), ('settleNo', 'HUD 정산 회차'),
    ('event', '속보 띠의 진행 중 속보'), ('econ', '일터의 손님 수(경기)'), ('tipSource', '포지션 줄의 출처 꼬리표'), ('lev', '배율 눈금자의 붉은 칸'),
    ('fundedBy', "포지션 줄의 '빌린 돈' 꼬리표"), ('offline', "나갈 때 '열어 둔 포지션 n개, 청산가까지 x%' 안내 → 돌아오면 '자리를 비운 사이' 시간표"), ('viaJump', '차트의 급변 틱 표시'), ('fam.', '가문 장부의 누적 기록'),
    ('inherit', '세대 시작 때 고른 상속 방식'), ('grudge', '건물 문패의 원한 표시'), ('friend', '친구 집 문과 신뢰 막대'), ('broken', '친구 집 문의 X'), ('rollover', "사채 창구의 '이자 미루기' 횟수"),
    ('refi', "HUD의 '돌려막기' 꼬리표"), ('awayHours', "나갈 때의 '열어 둔 포지션' 안내와 복귀 화면의 시간표"), ('holdSettles', '포지션 줄의 보유 시간'), ('tipAgree', '같은 방향 말풍선 수'), ('tipWasRight', '정보 수첩의 적중 표시'), ('secToSettle', 'HUD 정산 타이머'), ('last', '엔딩 화면의 마지막 세 장면'), ('laborTaps', '일터의 노동 횟수'), ('ltv', '조합 창구의 담보 비율'), ('od', '건물의 연체 딱지'),
]

def signs(cause, mods):
    out = [SIGN_CAUSE[cause.split('|')[0]]]
    for k, s in KEYSIGN:
        if k in mods and s not in out:
            out.append(s)
        if len(out) >= 3:
            break
    return ' / '.join(out)

rows = []
for no in range(1, 201):
    cause, mods, clue, rarity, flag, note = M[no]
    e = src[no]
    for c in cause.split('|'):
        assert c in CAUSE, (no, c)
    rows.append({
        'id': e['id'], 'title': (MOVE[no][4] if no in MOVE else (REWRITE[no][0] or e['title']) if no in REWRITE else (TONE[no][0] or e['title']) if no in TONE else e['title']), 'v1_category': e['categoryName'], 'v1_trigger': e['trigger']['type'],
        'cause': cause, 'cause_name': '·'.join(CAUSE[c] for c in cause.split('|')),
        'modifiers': mods, 'modifier_count': 0 if not mods else mods.count('&') + 1,
        'clue': clue, 'rarity': rarity, 'text': flag,
        'foreshadow': signs(cause, mods), 'next_gen_trace': TRACE[cause.split('|')[0]],
        'note': note,
        'title_v2': (MOVE[no][4] if no in MOVE else (REWRITE[no][0] or e['title']) if no in REWRITE else (TONE[no][0] or e['title']) if no in TONE else e['title']),
        'line_v2': DARK[no] if no in DARK else (MOVE[no][5] if no in MOVE else REWRITE[no][1] if no in REWRITE else (TONE[no][1] or e['line']) if no in TONE else '' if flag == 'tweak' else e['line']),
        'dark_pass': ('죽음 암시' if no in DEATH else '어둡게') if no in DARK else '',
        'motif_v2': (MOVE[no][6] if no in MOVE else REWRITE[no][2] if no in REWRITE else (TONE[no][2] or '') if no in TONE else ''),
        'tone_pass': ('강화·고침: ' + TONE[no][3]) if no in TONE else '',
        'title_v1': e['title'], 'line_v1': e['line'],
    })

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'endings_v2_map.csv')
with open(out, 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    w.writeheader(); w.writerows(rows)

# 원문 보존 + 변경 대조표 (docs/gdd/sources/endings-v2-text-changes.md)
src_dir = os.path.join(ROOT, 'docs', 'gdd', 'sources')
L = ['# 엔딩 글 v2 변경 대조표 (2026-11-25)', '',
     '- 근거: 사용자 확정 2026-11-25 "엔딩 글 재배치: 한다. 원문은 sources에 보존하고 변경 대조표를 남긴다."',
     '- 이 파일은 `docs/gdd/v2/build_endings_v2_map.py`가 만든다. 원문 전체는 `data/endings.json`(v1)과 `docs/gdd/sources/endings-catalogue-200-2.md`에 그대로 있다. 아래에는 바뀌는 엔딩의 v1 원문(제목·조건·대사·그림)을 다시 적어 보존한다.',
     '- 톤 규칙: 사실 그대로 한 줄, 피해자를 놀리지 않는다, 피·신체 훼손 묘사 없음. 새 글은 모두 "일어난 일 + 그 일의 아이러니" 두 문장 안쪽이다.',
     '- `data/endings.json`에는 아직 반영하지 않았다(설계 문서만 수정).', '',
     f'## 1. 2차 재배치 {len(MOVE)}개 — 원인을 옮기고 제목·대사·그림을 다시 씀', '',
     '| 번호 | v1 원인 → v2 원인 | v1 제목 | v1 조건 | v1 대사 | v1 그림 | v2 제목 | v2 단서(조건) | v2 대사 | v2 그림 |', '|---|---|---|---|---|---|---|---|---|---|']
esc = lambda x: str(x).replace('|', '/')
for no in sorted(MOVE):
    e = src[no]; c, mods, clue, rar, t2, l2, m2 = MOVE[no]
    L.append(f"| {e['id']} | {CAUSE[V1CAUSE[no].split('|')[0]]} → {CAUSE[c]} | {esc(e['title'])} | {esc(e['condition'])} | {esc(e['line'])} | {esc(e['motif'])} | {t2} | {esc(clue)} | {l2} | {m2} |")
L += ['', f'## 2. 조건이 바뀌어 대사를 다시 쓴 {len(REWRITE)}개 (원인은 1차 재설계 때 정한 그대로)', '',
      '| 번호 | v2 원인 | v1 제목 | v1 조건 | v1 대사 | v1 그림 | v2 제목 | v2 단서(조건) | v2 대사 | v2 그림 |', '|---|---|---|---|---|---|---|---|---|---|']
for no in sorted(REWRITE):
    e = src[no]; t2, l2, m2 = REWRITE[no]
    L.append(f"| {e['id']} | {'·'.join(CAUSE[c] for c in M[no][0].split('|'))} | {esc(e['title'])} | {esc(e['condition'])} | {esc(e['line'])} | {esc(e['motif'])} | {t2} | {esc(M[no][2])} | {l2} | {m2} |")
L += ['', f'## 2-1. 잔혹 수위 재검토로 바꾼 {len(TONE)}개 (17세 이상, 사회적 잔혹 최대 — TONE_AND_MANNER 8-1)', '',
      '- 200개 전체(제목·대사·그림, v2에서 새로 쓴 32개 포함)를 금지어 목록으로 훑고, v1에서 톤 때문에 순하게 바꿨던 결말을 다시 읽었다. 바뀐 것만 적는다. 나머지는 그대로다.',
      '- 강화 = 눙친 결말을 현실 결과가 드러나게. 고침 = 금지(피·상처·신체 훼손·시신 직접 묘사, 자살·자해의 묘사와 암시, 피해자 조롱)에 걸리는 표현 삭제.', '',
      '| 번호 | v1 제목 | v1 대사 | v1 그림 | v2 제목 | v2 대사 | v2 그림 | 이유 |', '|---|---|---|---|---|---|---|---|']
for no in sorted(TONE):
    e = src[no]; t2, l2, m2, why = TONE[no]
    L.append(f"| {e['id']} | {esc(e['title'])} | {esc(e['line'])} | {esc(e['motif'])} | {t2 or '(그대로)'} | {l2 or '(그대로)'} | {m2 or '(그대로)'} | {why} |")
prev = lambda no: (MOVE[no][5] if no in MOVE else REWRITE[no][1] if no in REWRITE else (TONE[no][1] or src[no]['line']) if no in TONE else src[no]['line'])
L += ['', f'## 2-2. 한 번 더 어둡게 쓴 {len(DARK)}개 (결과가 벌어진 뒤의 삶 · 죽음의 암시 {len(DEATH)}개 · 사채업자의 처리 직전 장면)', '',
      '- 원칙: 글은 "통지가 왔다"가 아니라 "그 결과 지금 이렇게 산다"로 쓴다. 잃은 것, 남은 것, 다음 세대로 넘어가는 것을 구체로.',
      '- 죽음은 암시로만(빈자리, 주인 없는 물건, 돌아오지 않은 배, "그 뒤로 본 이는 없다"). 결은 과로·사고·병·고독사·실종·사채 쪽 소문뿐이고, 스스로 택한 죽음으로 읽힐 여지를 두지 않는다. 죽음 엔딩은 장부가 자식에게 넘어가는 것으로 잇는다.',
      "- 사채 엔딩의 '처리 직전' 장면은 직전 순간이나 흔적만 쓴다. 깡패가 하는 일임이 글에서 분명하고, 깡패의 무심한 행동 하나를 넣는다. 피·부상·결과는 쓰지 않는다.",
      '- END-054의 `{laborTaps}`는 그 세대의 노동 횟수로 바꿔 보여 준다.', '',
      '| 번호 | 제목 | 앞의 대사(v1 또는 2·2-1장에서 고친 것) | 새 대사 | 구분 | 위험 메모 |', '|---|---|---|---|---|---|']
for no in sorted(DARK):
    L.append(f"| {src[no]['id']} | {esc(rows[no-1]['title_v2'])} | {esc(prev(no))} | {esc(DARK[no])} | {'죽음 암시' if no in DEATH else '어둡게'} | {RISK.get(no, '')} |")
tw = [r for r in rows if r['text'] == 'tweak']
L += ['', f'## 3. 낱말·숫자만 손볼 {len(tw)}개 (글 작업 대기)', '', '| 번호 | 제목 | v1 대사 | 손볼 곳 |', '|---|---|---|---|']
for r in tw: L.append(f"| {r['id']} | {esc(r['title_v1'])} | {esc(r['line_v1'])} | {esc(r['note'])} |")
open(os.path.join(src_dir, 'endings-v2-text-changes.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
print('moved', len(MOVE), 'rewritten', len(REWRITE), 'toned', len(TONE), 'tweak', len(tw))

# 요약(문서에 옮겨 적는 숫자)
from collections import Counter
print('rows', len(rows))
print('first cause', dict(Counter(r['cause'].split('|')[0] for r in rows)))
print('any cause', dict(Counter(c for r in rows for c in r['cause'].split('|'))))
print('rarity', dict(Counter(r['rarity'] for r in rows)))
print('text', dict(Counter(r['text'] for r in rows)))
print('proxy→', dict(Counter(r['text'] for r in rows if r['v1_trigger'] == 'proxy')), 'proxy total', sum(r['v1_trigger'] == 'proxy' for r in rows))
print('modifier_count', dict(Counter(r['modifier_count'] for r in rows)))
dup = [k for k, v in Counter((r['cause'], r['modifiers']) for r in rows).items() if v > 1]
print('duplicate combos', dup)
keys = sorted({re.split(r'\s*(?:<=|>=|=|<|>| has | in | x)', m.strip())[0].strip() for r in rows for m in r['modifiers'].split('&') if m.strip()})
print('keys', len(keys), ', '.join(keys))
