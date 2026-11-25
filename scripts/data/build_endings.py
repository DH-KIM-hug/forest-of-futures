#!/usr/bin/env python3
"""data/endings.json 을 만든다.

입력: docs/gdd/sources/endings-catalogue-200-2.md (사용자가 확정한 200종 카탈로그 원본 사본)
출력: data/endings.json, docs/gdd/sources/endings-text-changes.md (원문에서 바꾼 곳 목록)
실행: python3 scripts/data/build_endings.py   (저장소 루트에서)

원문 표를 읽고 → 오타·수치·톤 수정(OVERRIDES)을 입히고 → 엔진이 평가할 trigger(TRIGGERS)를 붙인다.
문구나 조건을 고치려면 이 파일의 표를 고치고 다시 실행한다. endings.json 을 손으로 고치지 않는다.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "docs/gdd/sources/endings-catalogue-200-2.md"
OUT = ROOT / "data/endings.json"
CHANGES = ROOT / "docs/gdd/sources/endings-text-changes.md"

CATS = {
    "CAT-A": ("1금융·부동산", range(1, 41)),
    "CAT-B": ("사채·추심", range(41, 101)),
    "CAT-C": ("친구·관계", range(101, 151)),
    "CAT-D": ("선물·청산", range(151, 201)),
}
BASE_PRIORITY = {"CAT-D": 400, "CAT-B": 300, "CAT-C": 200, "CAT-A": 100}

# ── 1. 전체에 적용하는 치환 (오타, 종 변경, 최대 배율 200배) ─────────────────────
GLOBAL = [
    ("접급 금지", "접근 금지", "오타"),
    ("무조권", "무조건", "오타"),
    ("소증 서류", "서류", "오타"),
    ("다음 주르", "다음 주로", "오타"),
    ("쇠판에刻인", "쇠판에 새긴", "오타(한자)"),
    ("MARIN CALL", "MARGIN CALL", "오타"),
    ("고나치고", "지나치고", "오타"),
    ("벙뜬", "벙찐", "오타"),
    ("메세지", "메시지", "오타"),
    ("수경 경비원", "경비원", "오타"),
    ("표딱지", "딱지", "오타"),
    ("뽀록났습니다", "들통났습니다", "속어"),
    ("50배", "200배", "최대 배율 200배 확정에 맞춤"),
    ("다람쥐", "칩멍크", "주인공 종 변경"),
]

# ── 2. 엔딩별 수정. why: tone(톤 규칙) / scale(화폐·수치) / story(스토리 정합) / system(게임 규칙 정합) / typo ──
O = {}
def ov(no, why, **kw):
    O[no] = {"why": why, **kw}

ov(1, "system", condition="텐트 거주, 1금융 대출 없음, 정산 연체로 파산",
   line="은행 문턱도 못 넘고 이자를 못 내서 나뭇잎 이불까지 압류당했습니다.")
ov(2, "scale", condition="황금 저택 보유, 유지비 3회 연속 미납",
   line="5,000만 도토리짜리 저택에 살면서 유지비 50만 도토리를 못 내 경매로 쫓겨났습니다. 하우스푸어의 정석.")
ov(5, "tone", title="호숫가 별장 경매 사건", condition="호숫가 별장 보유, 유지비 3회 연속 미납",
   line="아름다운 호수 뷰를 보며 여유를 즐기다 유지비 독촉장이 쌓여 별장이 경매로 넘어갔습니다.",
   motif="경매 안내문이 붙은 별장을 호수 건너편에서 바라보는 칩멍크")
ov(6, "system", condition="1금융 이자 3회 연속 미납")
ov(12, "tone", line="부엉이 은행장이 돋보기를 고쳐 쓰며 말했습니다. '손님, 담보부터 가져오세요.'")
ov(13, "typo", line="팔려고 한 순간 경매가 끝났습니다. 손가락이 0.1초만 빨랐어도 덜 날아갔을 텐데.")
ov(16, "scale", condition="정산 때 모자란 금액이 500 도토리 이하",
   line="단돈 500 도토리가 모자라 이자가 이체되지 않았고, 그대로 연체 파산했습니다.",
   motif="화면에 떠오른 '잔액 부족 (500 도토리 부족)' 안내")
ov(17, "tone", line="착하게 은행 빚부터 갚다가, 사채 이자에 마지막 한 톨까지 털렸습니다.",
   motif="1금융 감사장과 사채 독촉장 뭉치가 나란히 놓인 장면")
ov(18, "tone", line="연체 이자가 눈덩이처럼 굴러가더니 마침내 길을 통째로 막아버렸습니다.",
   motif="거대한 원금+이자 눈덩이 앞에 선 작은 칩멍크")
ov(25, "tone", motif="치솟는 금리 화살표를 올려다보는 칩멍크")
ov(34, "system", condition="순자산 0 이하 상태에서 빚으로 집을 산 직후 파산",
   line="자기 자본 0으로 집을 샀던 기적, 그 기적은 딱 정산 한 번 동안 유지되었습니다.",
   motif="정산 타이머가 0이 되는 순간 압류 딱지가 붙는 집")
ov(37, "tone", condition="1금융 독촉을 계속 외면한 끝에 강제 집행",
   line="부엉이 지점장의 전화 20통을 받지 않았더니, 법원 집행관이 열쇠공과 함께 문을 열었습니다.",
   motif="열린 현관문 앞에 선 집행관과 열쇠공")
ov(39, "system", condition="유지비 3회 연속 미납으로 집을 잃음")
ov(40, "scale", condition="1,000 도토리 이하로 남은 빚을 방치",
   line="빚 다 갚은 줄 알고 잔치를 벌였는데, 남은 1 도토리에 이자가 붙어 파산했습니다.",
   motif="축하 음료를 들다가 잔액 안내서를 받고 굳은 칩멍크")
ov(43, "scale", condition="사채 2단계 대출 직후 파산",
   line="20만 도토리를 빌렸는데 선이자 8만을 떼이고 12만만 받았습니다. 빚은 그대로 20만입니다.",
   motif="12만 도토리를 들고 망연자실한 칩멍크와 혀를 낼름거리는 뱀")
ov(44, "tone", title="급여 양도 각서 나뭇잎 서명", condition="오소리 차압을 겪은 뒤 사채 2단계 연체",
   line="앞으로 벌 모든 도토리의 수령 권리를 넘긴다는 각서에 서명했습니다. 월급날이 남의 날이 되었습니다.",
   motif="각서에 발도장을 찍고 빈 주머니를 내려다보는 칩멍크")
ov(45, "tone", condition="사채 2단계 잔액 100만 도토리 이상, 사채 2단계 연체 누적 3회 이상",
   line="상환 실패. 이름 모를 외딴 건물에서 헤드셋을 끼고 밤새 전화를 겁니다.")
ov(46, "tone", title="밤길 추심 피하기", condition="밤 10시 이후 사채 연체 파산",
   line="밤마다 추심원의 손전등을 피해 골목을 돌다가 막차도 일자리도 놓쳤습니다.",
   motif="손전등 불빛을 피해 담벼락에 붙어 선 칩멍크")
ov(47, "tone", title="인감 도장 착오", condition="사채 2단계 대출 3회 이상 후 연체",
   line="한 번 찍은 인감은 거짓말을 하지 않습니다. 독사 대부가 마지막 한 톨까지 징수했습니다.",
   motif="붉은 인주 도장이 찍힌 차용증과 넋이 나간 칩멍크")
ov(49, "tone", title="독사 대부의 심야 독촉 전화", condition="새벽(0~4시)에 사채 2단계 연체 파산",
   line="새벽 3시마다 울리는 독촉 전화에 잠도 일도 잃었습니다.",
   motif="침대 옆에서 울리는 스마트폰과 이불을 뒤집어쓴 칩멍크")
ov(52, "tone", condition="텐트 거주 중 사채 1단계 연체",
   line="내 유일한 이동 수단인 도토리 수레를 오소리 소장이 압류해 갔습니다.",
   motif="바퀴에 압류 딱지가 붙은 나무 수레")
ov(53, "tone", title="행동대장 곰의 방문 추심", condition="사채 2단계 연체 누적 6회 이상",
   line="독사 대부의 행동대장 곰이 찾아와 집 안의 서랍을 전부 뒤집어 놓고 갔습니다.",
   motif="뒤집힌 서랍과 문 앞에 선 거대한 곰 그림자")
ov(54, "tone", line="손가락이 닳도록 주운 도토리가 주머니에 들어오기도 전에 차압당했습니다.")
ov(55, "story", title="고향 집에 찾아간 사채업자", condition="연락처 제출 후 사채 2단계 연체",
   line="고향 할머니 댁까지 독사 대부가 찾아갔습니다. 손주는 고개를 들지 못합니다.",
   motif="시골집 마당에서 고개 숙여 사과하는 칩멍크")
ov(56, "tone", line="빚을 빚으로 꺾었더니 꺾인 건 내 통장이었습니다. 끝없는 채무 연쇄.")
ov(57, "system", condition="약관을 한 번도 펼쳐 보지 않고 사채 2단계 파산",
   line="깨알 같은 약관 제99조: '본 계약서 사본은 100부 보관하며, 채무자의 모든 도토리는 변제에 우선 충당한다.'")
ov(58, "tone", title="숲속 드럼통 헛소문", condition="연락처 제출 후 친구와 절교한 상태에서 사채 2단계 파산",
   line="'안 갚으면 호수에 간다더라'는 헛소문이 돌았습니다. 소문만으로 일자리와 셋방을 모두 잃었습니다.",
   motif="수군거리는 마을 주민들과 호숫가에 덩그러니 놓인 빈 나무 통")
ov(59, "tone", line="독사 대부의 도장을 몰래 찍으려다 현장에서 들켰습니다.",
   motif="책상 위 도장에 손을 뻗다 굳어 버린 칩멍크와 뒤에 선 독사 대부")
ov(62, "scale", condition="직접 빌린 적 없이 사채 2단계 빚이 생겨 파산",
   line="신원 나뭇잎을 잃어버렸더니, 어느새 내 이름 앞으로 사채 빚이 더 얹혀 있었습니다.")
ov(63, "tone", line="오소리 소장의 친절한 미소 뒤에 숨겨진 5장의 각서가 한꺼번에 돌아왔습니다.")
ov(64, "tone", motif="버튼을 누르는 순간 등 뒤에서 문이 닫히는 연출")
ov(70, "scale", condition="선이자로 떼인 금액 누적 40만 도토리 이상",
   line="100만 도토리를 빌리면 100만을 주는 줄 알았죠? 손에 들어온 건 60만뿐입니다.")
ov(71, "tone", motif="거대한 숫자 기둥 아래 작게 서 있는 칩멍크")
ov(72, "tone", title="굴착 현장 선불 계약", condition="노동 500회 이상 하고도 사채 1단계 파산",
   line="빚 대신 굴착 현장 일당을 통째로 넘기는 계약서에 서명했습니다. 삽질 시작.")
ov(73, "tone", title="탕감 도장 헛손질", condition="도장을 30번 넘게 찍고도 사채 2단계 파산",
   line="탕감 도장을 몰래 찍으려다 들켜, 서류에는 '상환 계획 없음' 도장이 찍혔습니다.",
   motif="'상환 계획 없음' 빨간 도장이 찍힌 서류를 든 칩멍크")
ov(78, "tone", title="추심원의 주머니 검사", condition="오소리 차압 중 사채 1단계 파산",
   line="추심원이 가방 안쪽 주머니에 숨겨 둔 비상금 도토리 2개까지 찾아냈습니다.",
   motif="뒤집힌 가방과 굴러 나온 도토리 2개")
ov(81, "tone", condition="1금융·2금융·사채 1단계·사채 2단계 빚을 모두 진 채 파산",
   line="가진 모든 것에 담보가 잡혔습니다. 이제 무소유의 삶을 삽니다.",
   motif="살림살이마다 담보 딱지가 붙은 방 한가운데의 칩멍크")
ov(86, "tone", condition="매월 13일(독사 대부 생일)에 사채 2단계 연체 파산",
   line="하필 독사 대부 생일에 이자를 연체했습니다. 생일상 앞에서 장부가 다시 펼쳐졌습니다.",
   motif="생일 모자를 쓴 독사 대부가 장부를 펼치는 장면")
ov(90, "system", condition="사채 2단계를 3번 넘게 쓴 직후 파산",
   line="100배 이자율에 서명하는 순간, 계좌 잔고가 음수의 한계를 돌파했습니다.")
ov(92, "tone", title="도토리 가공 공장 선불 계약", condition="노동 1,000회 이상 하고도 사채 파산",
   line="빚을 못 갚아 도토리 가공 공장과 선불 계약을 맺었습니다. 하루 18시간, 급여는 전액 상계.")
ov(93, "tone", line="취소 버튼을 누르려 했는데 서류는 이미 접수되어 있었습니다.",
   motif="'접수 완료' 도장이 찍힌 신청서와 취소 버튼 위에 멈춘 손")
ov(98, "tone", line="이자를 다음 주로 이월하고 또 이월했더니 이월 폭탄이 한꺼번에 터졌습니다.")
ov(100, "tone", condition="사채 2단계 잔액 500만 도토리 돌파",
   line="당신은 독사 대부의 최우수 고객이 되었습니다. 전설의 채무자 등극.",
   motif="독사 대부의 책상 앞, 'VIP 채무자' 명패 옆에 앉은 칩멍크")
ov(101, "scale", title="우정의 가격은 5만 도토리", condition="친구 빚을 갚지 않아 3명 이상과 절교")
ov(109, "tone", line="친구의 마지막 비상금 도토리까지 빌려 쓰고 탕진했습니다. 친구는 아무 말도 하지 않았습니다.")
ov(110, "tone", line="무이자라고 계속 미루다가 친구가 내용증명을 들고 찾아왔습니다.",
   motif="내용증명 봉투를 들고 문 앞에 선 친구")
ov(114, "story", condition="친구 돈을 빌리자마자 선물 거래에 넣었다가 절교",
   line="급한 병원비라고 돈을 빌려놓고 선물 거래를 하다 걸렸습니다. 신뢰 파산.")
ov(123, "scale", line="모임 회비 5,000 도토리를 빚 갚는 데 썼다가 모임에서 내보내졌습니다.")
ov(125, "tone", motif="빈 장난감 상자 앞에 선 어린 너구리")
ov(127, "tone", condition="한 번도 갚지 않고 친구에게 3번 이상 빌림",
   line="차용증을 찢으며 '우리 사이에 이런 게 필요하냐' 했더니, 친구가 말없이 사본을 꺼냈습니다.",
   motif="찢어진 차용증과 친구 손에 들린 사본")
ov(77, "tone", condition="\"이자만 갚으세요\" 말에 원금은 그대로 둔 채 20회 넘게 이자만 냄")
ov(143, "scale", condition="10만 도토리 빌리고 5만만 갚으며 생색내다 파산", line="10만 도토리를 빌리고 5만만 갚으면서 '반이나 갚았잖아' 했다가 친구를 잃었습니다.",
   motif="5만 도토리를 내미는 칩멍크와 어이없어하는 친구")
ov(144, "story", condition="단짝 다람쥐와 절교",
   line="가장 아끼던 단짝 다람쥐마저 눈물을 흘리며 당신의 손을 놓았습니다.",
   motif="서로 손을 놓으며 눈물을 흘리는 칩멍크와 다람쥐")
ov(146, "story", condition="여우 선배와 절교",
   line="성공한 여우 선배의 저택에 찾아갔다가 경비원에게 정중히 돌려보내졌습니다.",
   motif="거대한 저택 철문 밖에 혼자 서 있는 칩멍크")
ov(147, "story", condition="단짝 다람쥐가 빚을 탕감해 주고 절교")
ov(151, "system", condition="레버리지 200배, 진입 3초 안에 강제 청산")
ov(153, "tone", condition="차트만 100초 넘게 지켜보다 200배 숏으로 청산",
   line="1초마다 요동치는 차트를 지켜보다 눈이 침침해져 200배 숏을 잘못 눌렀습니다.",
   motif="충혈된 눈으로 차트를 노려보는 칩멍크")
ov(154, "tone", motif="기다란 바늘 모양의 차트 꼬리 옆에 주저앉은 칩멍크")
ov(155, "tone", condition="추가 진입(물타기) 후 청산",
   line="물타기로 평단을 낮췄지만, 물이 너무 깊어서 계좌가 통째로 잠겼습니다.",
   motif="차트 물속 깊이 가라앉는 계좌 통장")
ov(156, "tone", motif="벼락 모양 장대 양봉 앞에서 굳어 버린 칩멍크")
ov(157, "system", condition="추가 진입 2회 이상 후 청산",
   line="손절해야 하는데 추가 진입 버튼을 두 번이나 눌러버렸습니다. 아...")
ov(158, "tone", title="숲속 냇가 뗏목 살이")
ov(159, "tone", condition="노동 300회 이상, 거래 없이 이자 감당 불가 파산",
   line="손가락이 닳도록 도토리를 주웠지만 이자 올라가는 속도를 못 잡았습니다.",
   motif="쌓여 있는 도토리 껍데기와 지친 칩멍크")
ov(164, "system", condition="앱을 꺼 둔 사이 청산",
   line="자리를 비운 사이 차트가 폭락했습니다. 돌아와 보니 화면에는 결과만 남아 있었습니다.",
   motif="'자리를 비운 사이' 안내창 뒤로 폭락한 차트")
ov(167, "tone", condition="ROE -80% 아래에서 10초 넘게 버티다 청산",
   line="-99%에서 1%만 올라오면 산다! 도파민만 남기고 계좌가 멈췄습니다.",
   motif="눈을 번쩍이며 차트를 노려보는 칩멍크")
ov(168, "tone", title="숲속 트레이딩 룸 살이", condition="사채 빚을 진 채 거래 30회 이상 후 청산",
   line="선물 거래로 갚으라며 사채업자가 차트 방 월세 계약서까지 대신 써 주었습니다. 끝없는 매매.")
ov(169, "tone", motif="미끄러지며 주문 가격을 놓치는 칩멍크")
ov(172, "system", line="롱과 숏 둘 다 잡아서 안심했더니 정산마다 나가는 펀딩비에 계좌가 녹아내렸습니다.")
ov(174, "tone", line="펀딩비 정산 타임인 줄 모르고 홀딩했다가 펀딩비로 전 재산이 빠져나갔습니다.",
   motif="펀딩비 청구서에 줄줄이 빠져나가는 통장 잔고")
ov(175, "tone", title="만 번 주운 도토리의 최후", condition="누적 노동 1만 회 후 200배 청산",
   line="손가락이 닳도록 주운 돈이 200배 버튼 한 번에 지워졌습니다.",
   motif="멍하니 빈 화면을 바라보는 칩멍크")
ov(177, "typo", line="지하실 바닥인 줄 알고 숏 쳤더니 지하 2층은 없었고, 옥상까지 반등했습니다.",
   motif="발밑에서 솟구치는 장대 양봉을 바라보는 칩멍크")
ov(179, "tone", motif="스마트폰을 거꾸로 들고 고개를 갸웃하는 칩멍크")
ov(182, "scale", condition="증거금 1만 도토리 이하의 마지막 포지션 청산",
   line="100% 수익 공식을 가르쳐 준다는 여우의 강의를 듣고, 남은 1만 도토리마저 청산당했습니다.")
ov(184, "scale", line="9번 이겨서 불린 돈이, 10번째 200배 올인으로 1초 만에 0이 되었습니다.",
   motif="잔고가 순식간에 0으로 바뀌는 통장")
ov(187, "tone", line="롱 쳐서 청산, 숏으로 갈아타서 또 청산. 왕복 수수료까지 내고 계좌가 비었습니다.",
   motif="양쪽으로 꺾이는 차트 사이에서 어지러워하는 칩멍크")
ov(188, "tone", motif="동전 몇 개를 줍다가 지갑을 통째로 떨어뜨리는 연출")
ov(189, "system", condition="한 정산 회차 안에 포지션 2개 이상 청산",
   line="포지션 하나 지키겠다고 다른 포지션까지 줄줄이 열었다가 지갑 속 비상금까지 다 날아갔습니다.")
ov(191, "system", condition="손절을 걸어 뒀지만 급등락이 손절가를 건너뜀",
   line="차트가 한 번에 건너뛰어 손절가를 지나쳤고, 그대로 청산되었습니다.")
ov(192, "tone", title="숲속 선물 방송 따라 하기", condition="속보 직후 고배율로 따라 들어갔다가 청산",
   line="인기 방송인 너구리를 따라 200배를 쳤다가 시청자 모두의 계좌가 비었습니다.")
ov(194, "system", title="200배 첫 개방의 참극", condition="생애 첫 200배 거래에서 청산",
   line="200배 레버리지 첫 개방! 누르는 순간 계좌가 사라졌습니다.",
   motif="200배 버튼이 번쩍이며 터지는 연출")
ov(195, "tone", line="세력 족제비가 다 털고 나간 차트의 설거지를 대신 하다가 빈 접시만 남았습니다.",
   motif="빈 그릇 더미 앞에 앉은 칩멍크")

# ── 3. 판정 조건. causes: None이면 원인 무관 ─────────────────────────────────
UP, BANK, CAP, S1, S2, FR, LQ = ("overdue_upkeep", "overdue_bank", "overdue_capital", "overdue_shark1",
                                 "overdue_shark2", "friends", "liquidation")
A = [UP, BANK, CAP]
SH = [S1, S2]
OD = [UP, BANK, CAP, S1, S2]
T = {}
def rule(no, causes, *conds):
    T[no] = {"type": "rule", "causes": causes, "all": [list(c) for c in conds]}
def proxy(no, causes, note, *conds):
    T[no] = {"type": "proxy", "causes": causes, "all": [list(c) for c in conds], "note": note}

# CAT-A
rule(1, None, ("houseStage", "==", 0), ("debtBank", "==", 0))
rule(2, [UP], ("houseStage", "==", 4))
rule(3, [BANK], ("houseStage", "==", 1))
rule(4, [BANK, UP], ("houseStage", "==", 2), ("ltvPct", ">", 100))
rule(5, [UP], ("houseStage", "==", 3))
rule(6, [BANK])
rule(7, None, ("houseStage", "==", 0), ("bankRefusals", ">=", 10))
rule(8, [BANK], ("houseStage", "==", 1), ("cyclesSinceBankBorrow", "<=", 3))
rule(9, [CAP], ("borrowCapital", ">=", 3))
rule(10, A, ("houseStage", "==", 2), ("lastMoveDir", "==", "up"), ("cyclesSinceMove", "<=", 3))
rule(11, [UP, BANK], ("debtBank", ">", 0), ("stUpkeep", ">=", 1), ("stBank", ">=", 1))
rule(12, A, ("houseStage", ">=", 1), ("bankRefusals", ">=", 3))
proxy(13, A, "경매 직전 매각 타이밍 판정은 없다. 파산 순간 마을에서 '내 집'을 보고 있었으면 준다.", ("houseStage", ">=", 1), ("location", "==", "home"))
rule(14, A, ("houseStage", "==", 4), ("housingSlumpActive", "==", True))
rule(15, [BANK], ("houseStage", "==", 2))
rule(16, OD, ("shortfall", "<=", 500))
rule(17, SH, ("stampsBank", ">=", 3))
rule(18, [CAP])
rule(19, [BANK], ("houseStage", ">=", 1), ("bankRefusals", ">=", 1), ("ltvPct", ">=", 95))
proxy(20, A, "신용 회복 프로그램은 없다. 노동을 거의 하지 않고(100회 미만) 5회 이상 정산을 버틴 경우로 대신한다.", ("laborTaps", "<", 100), ("cycles", ">=", 5))
rule(21, [BANK], ("houseStage", "==", 4))
proxy(22, OD, "부정 수급 적발은 없다. 서민금융 지원금 속보를 받은 회차에 연체 파산하면 준다.", ("subsidyCount", ">=", 1))
rule(23, A, ("lifeOdTotal", ">=", 10))
proxy(24, A, "보증 제도는 없다. 10회 이상 정산을 버틴 뒤의 1·2금융 파산에 준다.", ("cycles", ">=", 10))
rule(25, A, ("rateHikeActive", "==", True))
rule(26, [BANK], ("houseStage", ">=", 1), ("auctionSurplus", "<=", 0))
rule(27, A, ("ltvPct", ">=", 120))
rule(28, OD, ("creditScore", "<=", 1))
proxy(29, A, "집행관 방문 이벤트는 없다. 기기 시각이 오전 5~9시일 때의 파산으로 대신한다.", ("localHour", ">=", 5), ("localHour", "<=", 9))
proxy(30, None, "피싱 문자 이벤트는 없다. 텐트에서 1금융에 5번 이상 거절당한 뒤 파산하면 준다.", ("houseStage", "==", 0), ("bankRefusals", ">=", 5))
rule(31, OD, ("equityCoversShortfall", "==", True))
proxy(32, [CAP, BANK], "유예 제도는 없다. 원금에 붙은 미납 이자가 5만 도토리 이상이면 준다.", ("capitalizedInterest", ">=", 50000))
rule(33, [BANK], ("housingSlumpActive", "==", True), ("houseStage", "<=", 3))
rule(34, A, ("lastMoveDir", "==", "up"), ("cyclesSinceMove", "<=", 1), ("netWorthAtMove", "<=", 0))
proxy(35, [BANK], "은행 영업시간은 없다. 기기 시각이 오후 4시 이후일 때의 1금융 파산으로 대신한다.", ("localHour", ">=", 16))
proxy(36, A, "중개 수수료 미납 판정은 없다. 집을 줄여 이사한 뒤 2회 정산 안에 파산하면 준다.", ("lastMoveDir", "==", "down"), ("cyclesSinceMove", "<=", 2))
proxy(37, [BANK], "독촉 전화는 없다. 도장을 한 번도 찍지 않고 1금융 파산하면 준다.", ("stamps", "==", 0))
proxy(38, [BANK], "서류 위조는 없다. 집이 있는데도 1금융에 5번 이상 거절당한 뒤 파산하면 준다.", ("bankRefusals", ">=", 5), ("houseStage", ">=", 1))
rule(39, [UP])
rule(40, OD, ("minNonzeroDebt", "<=", 1000))
# CAT-B
rule(41, [S1])
rule(42, [S2], ("contactsSeized", "==", True))
rule(43, [S2], ("cyclesSinceShark2Borrow", "<=", 2))
proxy(44, [S2], "각서 서명 절차는 없다. 오소리 차압을 겪은 회차의 사채 2단계 파산으로 대신한다.", ("garnished", ">", 0))
rule(45, [S2], ("debtShark2", ">=", 1000000), ("lifeOdShark2", ">=", 3))
proxy(46, SH, "추심 피하기 미니게임은 없다. 기기 시각이 밤 10시 이후일 때의 사채 파산으로 대신한다.", ("localHour", ">=", 22))
proxy(47, [S2], "도장 종류 선택은 없다. 사채 2단계 3회 이상 이용으로 대신한다.", ("borrowShark2", ">=", 3))
proxy(48, [S2], "주 100% 상품은 없다. 시작 후 7회 정산 안의 사채 2단계 파산으로 대신한다.", ("cycles", "<=", 7))
proxy(49, [S2], "전화 받기는 없다. 기기 시각이 0~4시일 때의 사채 2단계 파산으로 대신한다.", ("localHour", "<=", 4))
rule(50, SH, ("borrowSharks", ">=", 3))
proxy(51, [S1], "현관 훼손 연출은 엔딩 그림으로만 있다. 집이 있는 상태의 사채 1단계 파산에 준다.", ("houseStage", ">=", 1))
proxy(52, [S1], "수레는 따로 없다. 텐트 상태의 사채 1단계 파산에 준다.", ("houseStage", "==", 0))
proxy(53, [S2], "협박 레벨은 없다. 사채 2단계 연체 누적(전체 회차) 6회 이상으로 대신한다.", ("lifeOdShark2", ">=", 6))
rule(54, SH, ("garnished", ">", 0), ("laborTaps", ">=", 100))
proxy(55, [S2], "연좌 이벤트는 없다. 연락처를 냈지만 친구에게는 빌리지 않은 경우로 대신한다.", ("contactsSeized", "==", True), ("friendsBorrowed", "==", 0))
rule(56, [S2], ("refiShark2ToShark1", ">=", 1))
rule(57, [S2], ("termsViewedShark2", "==", False))
proxy(58, [S2], "연출 모달은 없다. 연락처 제출 + 절교 1명 이상인 사채 2단계 파산에 준다.", ("contactsSeized", "==", True), ("friendsBroken", ">=", 1))
proxy(59, [S2], "도둑질 행동은 없다. 독사 대부 도장을 10번 이상 찍고도 파산하면 준다.", ("stampsShark2", ">=", 10))
proxy(60, [S2], "차용증 폐기 행동은 없다. 독사 대부 도장을 한 번도 안 찍고 파산하면 준다.", ("stampsShark2", "==", 0))
proxy(61, SH, "이자 감면 제안은 없다. 돌려막기(빌린 직후 다른 곳 상환) 2회 이상으로 대신한다.", ("refiAny", ">=", 2))
rule(62, [S2], ("claimsSold", ">", 0), ("borrowShark2", "==", 0))
rule(63, [S1], ("borrowShark1", ">=", 5))
rule(64, [S2], ("borrowShark2", "==", 1), ("lifeBorrowShark2", "<=", 1))
proxy(65, SH, "야반도주 선택지는 없다. 집을 줄여 이사한 뒤 3회 정산 안의 사채 파산으로 대신한다.", ("lastMoveDir", "==", "down"), ("cyclesSinceMove", "<=", 3))
rule(66, [S1], ("houseStage", ">=", 1), ("debtBank", ">", 0))
rule(67, [S2], ("contactsSeized", "==", True), ("trustMin", "<=", 40))
rule(68, [S2], ("shortfall", "<=", 5000))
proxy(69, SH, "화면을 막는 추심 NPC는 없다. 노동도 거래도 하지 않은 정산이 2회 이어진 뒤의 사채 파산으로 대신한다.", ("idleStreak", ">=", 2))
rule(70, [S2], ("upfrontPaid", ">=", 400000))
rule(71, SH, ("capitalizedInterest", ">=", 300000))
proxy(72, [S1], "훈련소 이벤트는 없다. 노동 500회 이상으로 대신한다.", ("laborTaps", ">=", 500))
proxy(73, [S2], "탕감 성공률은 없다. 도장 30회 이상으로 대신한다.", ("stamps", ">=", 30))
proxy(74, [S1], "길거리 조우 이벤트는 없다. 친구에게 빌린 적이 있는 사채 1단계 파산에 준다.", ("friendsBorrowed", ">=", 1))
rule(75, [S2], ("lifeOdShark2", ">=", 10))
proxy(76, SH, "도박장은 없다. 10초 안에 청산당한 적이 있는 회차의 사채 파산으로 대신한다.", ("liqs", ">=", 1), ("lastHoldSec", "<=", 10))
rule(77, [S1], ("cycles", ">=", 20), ("stampsShark1", "==", 0))
proxy(78, [S1], "수색 연출은 없다. 차압 중이고 노동 100회 미만인 사채 1단계 파산에 준다.", ("garnished", ">", 0), ("laborTaps", "<", 100))
proxy(79, [S2], "신고 버튼은 없다. 누적 파산 10회 이상으로 대신한다.", ("lifeBankruptcies", ">=", 10))
proxy(80, SH, "야간 노동 구분은 없다. 차압 중 기기 시각 0~6시의 사채 파산으로 대신한다.", ("garnished", ">", 0), ("localHour", "<=", 6))
rule(81, [S2], ("debtBank", ">", 0), ("debtCapital", ">", 0), ("debtShark1", ">", 0))
proxy(82, SH, "할인 쿠폰은 없다. 금리 인상 속보가 진행 중일 때의 사채 파산으로 대신한다.", ("rateHikeActive", "==", True))
proxy(83, [S2], "비상금 항아리는 없다. 이번 회차 최고 순자산이 100만 도토리를 넘었던 경우로 대신한다.", ("peakNetWorth", ">=", 1000000))
proxy(84, SH, "광고판 이벤트는 없다. 사채 1단계 연체 누적(전체 회차) 6회 이상으로 대신한다.", ("lifeOdShark1", ">=", 6))
proxy(85, [S2], "추심 앱은 없다. 차압 + 연락처 제출 상태로 대신한다.", ("garnished", ">", 0), ("contactsSeized", "==", True))
proxy(86, [S2], "생일은 기기 날짜 매월 13일로 정했다.", ("localDay", "==", 13))
rule(87, [S1], ("houseStage", ">=", 2))
proxy(88, SH, "피해자 모임은 없다. 텐트 상태 + 누적 파산 5회 이상으로 대신한다.", ("houseStage", "==", 0), ("lifeBankruptcies", ">=", 5))
proxy(89, [S2], "차용증 소각 행동은 없다. 2회 이상 빌리고 한 번도 안 갚은 경우로 대신한다.", ("stampsShark2", "==", 0), ("borrowShark2", ">=", 2))
proxy(90, [S2], "100배 이자 상품은 없다. 3회 이상 빌린 직후(2회 정산 안) 파산으로 대신한다.", ("cyclesSinceShark2Borrow", "<=", 2), ("borrowShark2", ">=", 3))
rule(91, [S2], ("location", "==", "shark2"))
proxy(92, SH, "작업장 이송은 없다. 노동 1,000회 이상으로 대신한다.", ("laborTaps", ">=", 1000))
proxy(93, [S2], "강제 서명 연출은 없다. 탭 전환 20회 이상(망설임)으로 대신한다.", ("tabSwitches", ">=", 20))
proxy(94, [S1], "새벽 방문 이벤트는 없다. 기기 시각 4~6시의 사채 1단계 파산으로 대신한다.", ("localHour", ">=", 4), ("localHour", "<=", 6))
proxy(95, [S1], "탕감 실패 판정은 없다. 오소리 도장 20회 이상 찍고도 파산한 경우로 대신한다.", ("stampsShark1", ">=", 20))
proxy(96, [S1], "명의 차용은 없다. 절교한 친구가 있는 사채 1단계 파산으로 대신한다.", ("friendsBroken", ">=", 1))
rule(97, [S2])
rule(98, SH, ("odTotal", ">=", 5))
proxy(99, [S2], "보석 담보는 없다. 별장 이상에 살면서 사채 2단계 파산한 경우로 대신한다.", ("houseStage", ">=", 3))
rule(100, [S2], ("debtShark2", ">=", 5000000))
# CAT-C
rule(101, [FR])
rule(102, None, ("friendsBorrowed", ">=", 5), ("odFriends", ">=", 1))
rule(103, None, ("odFriends", ">=", 2), ("trustAvg", "<=", 30))
proxy(104, [FR], "결혼식 이벤트는 없다. 기기 요일이 토·일일 때의 관계 파산으로 대신한다.", ("localWeekday", "in", [0, 6]))
rule(105, None, ("lifeFriendsBroken", ">=", 10), ("friendsBroken", ">=", 1))
rule(106, [FR], ("friendRepayStamps", ">=", 1))
proxy(107, A, "보증 부탁은 없다. 절교한 친구가 있는 1·2금융 파산으로 대신한다.", ("friendsBroken", ">=", 1))
proxy(108, [FR], "동창회는 없다. 3명 이상에게 빌리고 한 번도 안 갚은 경우로 대신한다.", ("friendsBorrowed", ">=", 3), ("friendRepayStamps", "==", 0))
rule(109, None, ("friendMaxedOut", ">=", 1), ("odFriends", ">=", 1))
rule(110, None, ("odFriends", ">=", 5))
rule(111, [LQ], ("lastFundedBy", "==", "friend"), ("lastLev", ">=", 100))
proxy(112, [FR], "중고 거래는 없다. 노동 300회 이상 한 회차의 관계 파산으로 대신한다.", ("laborTaps", ">=", 300))
rule(113, [FR, S2], ("claimsSold", ">", 0))
rule(114, None, ("friendsBroken", ">=", 1), ("fundedByFriendTrades", ">=", 1))
rule(115, [LQ], ("fundedByFriendTrades", ">=", 1), ("friendsBorrowed", ">=", 3), ("lastDir", "==", "long"), ("lastLev", ">=", 100))
proxy(116, [FR], "1초 지연 판정은 없다. 이웃 토끼와 절교한 관계 파산으로 대신한다.", ("brokenFriendIds", "has", "rabbit"))
proxy(117, [FR], "생일 파티는 없다. 파산 순간 친구네 골목에 있었으면 준다.", ("location", "==", "friends"))
rule(118, None, ("stamps", ">=", 100), ("friendsBroken", ">=", 1))
proxy(119, None, "SNS는 없다. 연락처 제출 + 절교 2명 이상으로 대신한다.", ("contactsSeized", "==", True), ("friendsBroken", ">=", 2))
proxy(120, [FR], "몰래 대출은 없다. 친구에게 8번 이상 빌린 경우로 대신한다.", ("borrowFriends", ">=", 8))
proxy(121, [FR], "품앗이는 없다. 노동 50회 미만으로 대신한다.", ("laborTaps", "<", 50))
proxy(122, None, "사탕 이벤트는 없다. 친구에게 3번 이상 거절당한 회차의 파산으로 대신한다.", ("friendRefusals", ">=", 3))
proxy(123, None, "모임 회비는 없다. 친구 돈으로 금융 빚을 갚은(돌려막기) 뒤 절교한 경우로 대신한다.", ("refiFriendToLender", ">=", 1), ("friendsBroken", ">=", 1))
rule(124, [S2, FR], ("contactsSeized", "==", True), ("friendsBroken", ">=", 3))
proxy(125, SH, "친구 물건 담보는 없다. 친구 빚이 남은 채 사채 파산한 경우로 대신한다.", ("debtFriends", ">", 0))
proxy(126, [FR], "방송 이벤트는 없다. 절교 누적(전체 회차) 6명 이상으로 대신한다.", ("lifeFriendsBroken", ">=", 6))
proxy(127, [FR], "차용증 찢기 행동은 없다. 3번 이상 빌리고 한 번도 안 갚은 경우로 대신한다.", ("friendRepayStamps", "==", 0), ("borrowFriends", ">=", 3))
proxy(128, None, "귀농 친구는 없다. 친구에게 5번 이상 거절당한 경우로 대신한다.", ("friendRefusals", ">=", 5))
rule(129, None, ("refiFriendToFriend", ">=", 1))
proxy(130, SH, "이웃 민원은 없다. 집이 있고 절교한 친구가 있는 사채 파산으로 대신한다.", ("houseStage", ">=", 1), ("friendsBroken", ">=", 1))
proxy(131, [FR], "벼룩시장은 없다. 집을 줄여 이사한 회차의 관계 파산으로 대신한다.", ("lastMoveDir", "==", "down"))
rule(132, None, ("friendsBroken", ">=", 1))
proxy(133, [S2], "수레 대여는 없다. 친구 빚이 남은 채 사채 2단계 파산한 경우로 대신한다.", ("debtFriends", ">", 0))
rule(134, None, ("trustAvg", "<=", 10))
rule(135, [FR], ("friendsBorrowed", ">=", 5))
proxy(136, [FR], "축제는 없다. 기기 날짜가 9~11월일 때의 관계 파산으로 대신한다.", ("localMonth", "in", [9, 10, 11]))
proxy(137, [FR], "유예 부탁 행동은 없다. 거절 1회 + 친구 연체 3회 이상으로 대신한다.", ("friendRefusals", ">=", 1), ("odFriends", ">=", 3))
proxy(138, [FR], "쉼터는 없다. 텐트 상태의 관계 파산으로 대신한다.", ("houseStage", "==", 0))
proxy(139, [FR, LQ], "펀딩 모집은 없다. 친구 돈으로 연 포지션 3건 이상으로 대신한다.", ("fundedByFriendTrades", ">=", 3))
proxy(140, [FR], "선행상은 없다. 누적 10회차 이상으로 대신한다.", ("lifeRuns", ">=", 10))
proxy(141, [FR], "절도 행동은 없다. 친구 3명의 한도를 끝까지 빌린 경우로 대신한다.", ("friendMaxedOut", ">=", 3))
proxy(142, [FR], "기념비는 없다. 절교 4명 이상으로 대신한다.", ("friendsBroken", ">=", 4))
rule(143, None, ("friendRepayStamps", ">=", 1), ("odFriends", ">=", 1), ("friendsBroken", ">=", 1))
rule(144, None, ("brokenFriendIds", "has", "squirrel"))
proxy(145, [FR], "친구 이자 청구는 없다. 친구 연체 4회 이상으로 대신한다.", ("odFriends", ">=", 4))
proxy(146, None, "저택 방문 이벤트는 없다. 여우 선배와 절교한 회차의 파산으로 대신한다.", ("brokenFriendIds", "has", "fox"))
rule(147, [FR], ("brokenFriendIds", "has", "squirrel"))
proxy(148, None, "이사 간 동네는 없다. 3회차 이상이고 절교 누적 3명 이상인데 또 절교한 경우로 대신한다.", ("friendsBroken", ">=", 1), ("lifeFriendsBroken", ">=", 3), ("lifeRuns", ">=", 3))
rule(149, [FR, S2], ("odFriends", ">=", 8))
rule(150, [FR], ("friendsBroken", ">=", 5))
# CAT-D
rule(151, [LQ], ("lastLev", "==", 200), ("lastHoldSec", "<=", 3))
rule(152, [LQ], ("lastDir", "==", "long"), ("lastHoldSec", "<=", 15))
proxy(153, [LQ], "틱 차트 관람 횟수는 없다. 포지션 없이 거래 탭을 100초 이상 본 뒤 고배율 숏 청산으로 대신한다.", ("chartWatchSec", ">=", 100), ("lastDir", "==", "short"), ("lastLev", ">=", 100))
rule(154, [LQ], ("lastViaJump", "==", True), ("lastHadSL", "==", False))
rule(155, [LQ], ("lastAdds", ">=", 1))
rule(156, [LQ], ("lastDir", "==", "short"), ("lastLev", ">=", 100), ("lastViaJump", "==", True))
rule(157, [LQ], ("lastAdds", ">=", 2))
rule(158, [LQ])
rule(159, OD, ("laborTaps", ">=", 300), ("trades", "==", 0))
rule(160, [LQ], ("lastLev", "==", 10))
rule(161, [LQ], ("lastLiqByFunding", "==", True))
proxy(162, [LQ], "보조 지표는 없다. 포지션 없이 거래 탭을 300초 이상 본 회차의 청산으로 대신한다.", ("chartWatchSec", ">=", 300))
rule(163, [LQ], ("lastAfterNewsSec", "<=", 15), ("lastNewsFake", "==", True))
rule(164, [LQ], ("offline", "==", True))
rule(165, [LQ], ("lastLev", "==", 200), ("lastDir", "==", "short"), ("lastMarginPct", ">=", 95))
rule(166, [LQ], ("lastFundedBy", "==", "shark2"), ("lastLev", ">=", 100))
rule(167, [LQ], ("lastNearLiqSec", ">=", 10))
proxy(168, [LQ], "감금 이벤트는 없다. 사채 빚이 있는 채 거래 30회 이상으로 대신한다.", ("trades", ">=", 30), ("debtSharks", ">", 0))
rule(169, [LQ], ("lastViaJump", "==", True), ("lastHoldSec", "<=", 5))
rule(170, [LQ], ("lev200Trades", ">=", 5), ("lowLevTrades", "==", 0))
rule(171, [LQ], ("lastHeldCycles", ">=", 3))
rule(172, [LQ], ("hedgedEver", "==", True), ("fundingPaid", ">", 0))
rule(173, [LQ], ("wasLocalBest", "==", True))
rule(174, [LQ], ("fundingPaid", ">=", 50000))
rule(175, [LQ], ("lifeLaborTaps", ">=", 10000), ("lastLev", "==", 200))
rule(176, [LQ], ("lastEntryAtExtreme", "==", "high"), ("lastDir", "==", "long"))
rule(177, [LQ], ("lastEntryAtExtreme", "==", "low"), ("lastDir", "==", "short"))
proxy(178, [LQ], "기기 파손은 없다. 청산 직후 3초 안에 화면을 8번 이상 두드린 경우로 대신한다(즉시 파산이 아닌 청산만).", ("immediate", "==", False), ("lastPostLiqTaps", ">=", 8))
proxy(179, [LQ], "화면 방향 감지는 쓰지 않는다. 하락 추세에 전액 롱으로 들어간 경우로 대신한다.", ("lastAgainstTrend", "==", True), ("lastDir", "==", "long"), ("lastMarginPct", ">=", 95))
rule(180, [LQ], ("marginCalls", ">=", 3), ("lastHadSL", "==", False))
proxy(181, [LQ], "호가창은 없다. 고배율 롱을 30초 안에 청산당한 경우로 대신한다.", ("lastDir", "==", "long"), ("lastHoldSec", "<=", 30), ("lastLev", ">=", 50))
rule(182, [LQ], ("lastMargin", "<=", 10000))
rule(183, [LQ], ("againstTrendLosses", ">=", 3), ("lastDir", "==", "long"))
rule(184, [LQ], ("winStreakBeforeLiq", ">=", 9), ("lastMarginPct", ">=", 95))
rule(185, [LQ], ("lastTpNearMiss", "==", True))
proxy(186, [LQ], "자동 매매 봇은 없다. 앱을 꺼 둔 사이 포지션 2개 이상이 청산된 경우로 대신한다.", ("offline", "==", True), ("liqsThisCycle", ">=", 2))
rule(187, [LQ], ("flips", ">=", 2), ("lastFlip", "==", True))
proxy(188, [LQ], "펀딩비 수취는 없다(항상 낸다). 고배율 포지션을 정산 2회 이상 넘겨 들고 있다가 청산된 경우로 대신한다.", ("lastHeldCycles", ">=", 2), ("lastLev", ">=", 50))
proxy(189, [LQ], "교차 마진은 없다(격리만). 한 회차 안에 포지션 2개 이상 청산으로 대신한다.", ("liqsThisCycle", ">=", 2))
rule(190, [LQ] + OD, ("grossPnl", ">", 0), ("realizedPnl", "<", 0), ("trades", ">=", 5))
rule(191, [LQ], ("lastViaJump", "==", True), ("lastHadSL", "==", True))
proxy(192, [LQ], "방송 시청은 없다. 진짜 속보 직후 15초 안에 고배율로 따라 들어갔다 청산된 경우로 대신한다.", ("lastAfterNewsSec", "<=", 15), ("lastNewsFake", "==", False), ("lastLev", ">=", 100))
rule(193, [LQ], ("liqStreak", ">=", 5), ("lastLev", "==", 200))
rule(194, [LQ], ("lastLev", "==", 200), ("lifeLev200Trades", "<=", 1))
proxy(195, [LQ], "상장 폐지는 없다. 빔이 가장 큰 SQ하이넛츠 롱 청산으로 대신한다.", ("lastMarket", "==", "SQH"), ("lastDir", "==", "long"))
rule(196, [LQ], ("offline", "==", True), ("lastLev", ">=", 100))
rule(197, [LQ], ("lifeLiqs", ">=", 100))
rule(198, [UP], ("trades", ">=", 10))
rule(199, [LQ], ("lastLoss", ">=", 5000000))
rule(200, [LQ], ("lifeBankruptcies", ">=", 50), ("lifeCollected", ">=", 150), ("lastLev", ">=", 100))
BONUS = {200: 500, 151: 30, 1: -60}

# ── 4. 통계 사전 (엔진이 추적해야 하는 값. GDD 11장과 같다) ─────────────────────
S = {}
def st(key, label, scope, how):
    S[key] = {"label": label, "scope": scope, "update": how}
M, R, L = "moment", "run", "life"
st("cause", "파산 원인", M, "bankruptcy.triggers 참고")
st("immediate", "청산 즉시 파산 여부", M, "liquidationWipeout이면 true")
st("causeLender", "연체 한도에 닿은 채권처", M, "원인이 liquidation으로 바뀐 경우에도 원래 채권처를 남긴다. 없으면 null")
st("houseStage", "집 단계", M, "housing.json stage")
st("cash", "현금", M, ""); st("totalDebt", "총부채", M, "금융 4곳 + 친구")
st("netWorth", "순자산", M, "현금 + 포지션 평가액 + 집 평가액×sellRate - 총부채")
st("debtBank", "1금융 원금", M, ""); st("debtCapital", "2금융 원금", M, ""); st("debtShark1", "사채 1단계 원금", M, "")
st("debtShark2", "사채 2단계 원금", M, ""); st("debtSharks", "사채 원금 합", M, "shark1 + shark2"); st("debtFriends", "친구 빚 합", M, "")
st("ltvPct", "담보 대비 1금융 대출 비율(%)", M, "debtBank / 현재 담보 평가액 × 100. 집이 없으면 0")
st("housingSlumpActive", "부동산 하락 속보 진행 중", M, "events.json"); st("rateHikeActive", "금리 인상 속보 진행 중", M, "events.json")
st("positionsEquity", "열린 포지션 평가액 합", M, "Σ max(0, margin + pnl)")
st("shortfall", "이번 정산 미납 총액", M, "정산 4단계에서 계산. 청산 즉시 파산이면 0")
st("equityCoversShortfall", "포지션에 묶인 돈이 미납액 이상", M, "positionsEquity >= shortfall 이고 shortfall > 0")
st("auctionSurplus", "경매 후 남는 돈", M, "현재 담보 평가액 × auctionRate - debtBank")
st("minNonzeroDebt", "0이 아닌 빚 중 가장 작은 원금", M, "빚이 없으면 null")
st("creditScore", "신용점수", M, "balance.json credit")
st("location", "마을에서 보고 있던 장소", M, "work|home|bank|capital|shark1|shark2|friends|archive|board. 거래 탭이어도 마지막 장소 유지")
st("localHour", "기기 시각(시)", M, "0~23"); st("localDay", "기기 날짜(일)", M, "1~31"); st("localWeekday", "기기 요일", M, "0=일 … 6=토"); st("localMonth", "기기 월", M, "1~12")
st("offline", "오프라인 따라잡기 중 발생", M, "")
st("stBank", "1금융 연속 연체", M, ""); st("stUpkeep", "유지비 연속 연체", M, "")
st("trustMin", "친구 신뢰 최솟값", M, "절교는 0으로 계산"); st("trustAvg", "친구 신뢰 평균", M, "5명 평균, 절교는 0")
st("cycles", "버틴 정산 횟수", R, "정산 8단계에서 +1")
st("odTotal", "연체 횟수 합(금융 4곳 + 유지비)", R, "미납이 생길 때마다 +1"); st("odFriends", "친구 빚 연체 횟수", R, "friends.json overdue")
st("capitalizedInterest", "원금에 붙은 미납 이자 합", R, "")
st("borrowCapital", "2금융 대출 횟수", R, ""); st("borrowShark1", "사채 1단계 대출 횟수", R, ""); st("borrowShark2", "사채 2단계 대출 횟수", R, "")
st("borrowSharks", "사채 대출 횟수 합", R, ""); st("borrowFriends", "친구 대출 횟수", R, "")
st("bankRefusals", "1금융 거절 횟수", R, ""); st("friendRefusals", "친구 거절 횟수", R, "")
st("contactsSeized", "연락처 제출 여부", R, ""); st("upfrontPaid", "선이자로 떼인 금액 합", R, ""); st("claimsSold", "친구가 넘긴 채권 금액 합", R, "")
st("friendsBorrowed", "빌린 친구 수", R, "서로 다른 친구"); st("friendsBroken", "절교한 친구 수", R, ""); st("brokenFriendIds", "절교한 친구 목록", R, "id 배열")
st("friendMaxedOut", "한도까지 빌린 친구 수", R, "잔액이 maxLoan에 닿은 적 있는 친구"); st("friendRepayStamps", "친구 빚 도장 횟수", R, "")
st("laborTaps", "노동 횟수", R, ""); st("garnished", "차압당한 금액 합", R, "")
st("stamps", "도장 횟수 합", R, "금융 + 친구"); st("stampsBank", "1금융 도장 횟수", R, ""); st("stampsShark1", "사채 1단계 도장 횟수", R, ""); st("stampsShark2", "사채 2단계 도장 횟수", R, "")
st("lastMoveDir", "마지막 이사 방향", R, "up|down|null"); st("cyclesSinceMove", "마지막 이사 뒤 정산 횟수", R, "이사한 적 없으면 null"); st("netWorthAtMove", "마지막 이사 순간 순자산", R, "")
st("cyclesSinceBankBorrow", "마지막 1금융 대출 뒤 정산 횟수", R, "없으면 null"); st("cyclesSinceShark2Borrow", "마지막 사채 2단계 대출 뒤 정산 횟수", R, "없으면 null")
st("refiAny", "돌려막기 횟수", R, "어디서든 빌린 뒤 60초 안에 다른 곳에 도장을 찍으면 +1(한 번 빌린 것당 1회)")
st("refiShark2ToShark1", "독사에게 빌려 오소리 갚기 횟수", R, ""); st("refiFriendToFriend", "친구에게 빌려 다른 친구 갚기 횟수", R, ""); st("refiFriendToLender", "친구에게 빌려 금융 빚 갚기 횟수", R, "")
st("termsViewedShark2", "독사 대부 약관을 펼쳐 봤는지", R, "약관 줄을 누르면 true")
st("idleStreak", "아무것도 안 한 정산 연속 횟수", R, "그 회차에 노동 0회 + 진입 0건이면 +1, 아니면 0")
st("subsidyCount", "지원금 수령 횟수", R, ""); st("tabSwitches", "탭 전환 횟수", R, ""); st("chartWatchSec", "포지션 없이 거래 탭을 본 시간(초)", R, "")
st("peakNetWorth", "이번 회차 최고 순자산", R, ""); st("wasLocalBest", "이번 회차에 내 최고 기록을 넘었는지", R, "")
st("trades", "진입 횟수", R, "추가 진입 제외"); st("liqs", "청산 횟수", R, ""); st("liqStreak", "연속 청산 횟수", R, "청산이 아닌 정리로 끝나면 0"); st("liqsThisCycle", "이번 정산 회차의 청산 횟수", R, "정산 때 0으로")
st("winStreakBeforeLiq", "마지막 청산 직전 연승 수", R, "이익 정리 연속 횟수"); st("lev200Trades", "200배 진입 횟수", R, ""); st("lowLevTrades", "5배 이하 진입 횟수", R, "")
st("flips", "손실 직후 반대 방향 진입 횟수", R, "같은 종목에서 손실·청산 뒤 flipWindowSec 안에 반대 방향 진입"); st("marginCalls", "마진콜 경고 횟수", R, "ROE가 marginCallRoe 아래로 내려갈 때마다 +1")
st("againstTrendLosses", "추세 반대로 들어가 잃은 횟수", R, ""); st("fundedByFriendTrades", "친구에게 빌린 직후 연 포지션 수", R, "빌린 뒤 60초 안 진입")
st("hedgedEver", "롱과 숏을 동시에 든 적 있는지", R, "서로 다른 종목"); st("fundingPaid", "펀딩비 합", R, ""); st("grossPnl", "수수료·펀딩비 빼기 전 실현 손익 합", R, ""); st("realizedPnl", "실현 손익 합(수수료·펀딩비 포함)", R, "")
st("lastLev", "마지막 청산 포지션의 배율", R, "아래 last* 는 모두 가장 최근에 강제 청산된 포지션 기준. 없으면 null")
st("lastDir", "마지막 청산 포지션의 방향", R, "long|short"); st("lastMarket", "마지막 청산 포지션의 종목", R, "")
st("lastHoldSec", "마지막 청산 포지션의 보유 시간(초)", R, ""); st("lastHeldCycles", "마지막 청산 포지션이 넘긴 정산 횟수", R, "")
st("lastMargin", "마지막 청산 포지션의 증거금", R, ""); st("lastMarginPct", "진입 때 현금 대비 증거금 비율(%)", R, "")
st("lastViaJump", "급등락 틱에 청산됐는지", R, ""); st("lastHadSL", "손절을 걸어 뒀는지", R, ""); st("lastAdds", "추가 진입 횟수", R, "")
st("lastNearLiqSec", "ROE가 nearLiqRoe 아래였던 시간(초)", R, ""); st("lastTpNearMiss", "익절가의 90%까지 갔다가 못 닿았는지", R, "최고 ROE >= 익절 ROE × 0.9")
st("lastEntryAtExtreme", "최근 고점/저점에서 진입했는지", R, "진입가가 최근 120틱 고가(저가)의 ±0.1% 안이면 high(low)")
st("lastAgainstTrend", "추세 반대로 진입했는지", R, "최근 60틱 수익률 부호와 반대"); st("lastFlip", "손실 직후 반대 방향 진입이었는지", R, "")
st("lastAfterNewsSec", "속보 뒤 몇 초 만에 진입했는지", R, "events.json newsStats. 해당 없으면 null"); st("lastNewsFake", "그 속보가 가짜였는지", R, "")
st("lastFundedBy", "진입 직전(60초 안) 돈을 빌린 곳", R, "bank|capital|shark1|shark2|friend|null")
st("lastLiqByFunding", "펀딩비 차감으로 청산됐는지", R, ""); st("lastLoss", "마지막 청산으로 잃은 증거금", R, ""); st("lastPostLiqTaps", "청산 뒤 3초 안에 화면을 누른 횟수", R, "")
st("lifeBankruptcies", "누적 파산 횟수", L, "이번 파산 포함"); st("lifeCollected", "수집한 엔딩 수", L, "이번 엔딩을 주기 전 기준"); st("lifeRuns", "누적 회차 수", L, "이번 회차 포함")
st("lifeLiqs", "누적 청산 횟수", L, ""); st("lifeLaborTaps", "누적 노동 횟수", L, ""); st("lifeOdTotal", "누적 연체 횟수", L, "")
st("lifeOdShark1", "누적 사채 1단계 연체 횟수", L, ""); st("lifeOdShark2", "누적 사채 2단계 연체 횟수", L, ""); st("lifeBorrowShark2", "누적 사채 2단계 대출 횟수", L, "")
st("lifeFriendsBroken", "누적 절교 횟수", L, ""); st("lifeLev200Trades", "누적 200배 진입 횟수", L, "")

CAUSE_LABEL = {UP: "유지비 연체", BANK: "1금융 연체", CAP: "2금융 연체", S1: "사채 1단계 연체", S2: "사채 2단계 연체", FR: "친구 3명 이상과 절교", LQ: "강제 청산"}
OP_TXT = {"==": "=", "!=": "≠", ">=": "≥", "<=": "≤", ">": ">", "<": "<", "has": "에 포함:", "in": "∈"}
VAL_TXT = {True: "예", False: "아니오", "long": "롱", "short": "숏", "up": "더 좋은 집으로", "down": "더 싼 집으로", "high": "고점", "low": "저점",
           "home": "내 집", "shark2": "독사 골목", "friends": "친구네 골목", "friend": "친구", "rabbit": "이웃 토끼", "squirrel": "단짝 다람쥐", "fox": "여우 선배"}

def hint(tr):
    parts = []
    if tr["causes"]:
        parts.append("원인: " + " 또는 ".join(CAUSE_LABEL[c] for c in tr["causes"]))
    for stat, op, val in tr["all"]:
        v = VAL_TXT.get(val, val) if not isinstance(val, list) and not isinstance(val, (int, float)) or isinstance(val, bool) else val
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            v = f"{v:,}"
        parts.append(f"{S[stat]['label']} {OP_TXT[op]} {v}")
    return " · ".join(parts) if parts else "조건 없음"

def main():
    rows = []
    for line in SRC.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\| \*\*END-(\d{3})\*\* \|(.*)\|\s*$", line)
        if not m:
            continue
        cols = [c.strip() for c in m.group(2).split("|")]
        assert len(cols) == 4, (m.group(1), cols)
        rows.append((int(m.group(1)), cols))
    assert [r[0] for r in rows] == list(range(1, 201)), "카탈로그 번호가 1~200이 아님"
    assert set(T) == set(range(1, 201)), sorted(set(range(1, 201)) - set(T))
    for tr in T.values():
        for c in tr["all"]:
            assert c[0] in S, c

    endings, changes = [], []
    for no, (title, cond, line, motif) in rows:
        line = line.strip('"').strip("“”")
        orig = {"title": title, "condition": cond, "line": line, "motif": motif}
        cur = dict(orig)
        reasons = []
        for a, b, why in GLOBAL:
            for k in cur:
                if a in cur[k]:
                    cur[k] = cur[k].replace(a, b)
                    reasons.append(why)
        if no in O:
            for k, v in O[no].items():
                if k != "why":
                    cur[k] = v
            reasons.append({"tone": "톤 규칙(신체 훼손·조롱·수위)", "scale": "화폐 단위·수치를 게임 규칙에 맞춤", "story": "스토리 정합",
                            "system": "게임 규칙 정합", "typo": "오타·문장"}[O[no]["why"]])
        for k in cur:  # 마지막: 남은 '숫자+원' 표기를 도토리로
            fixed = re.sub(r"(\d)원", r"\1 도토리", cur[k])
            if fixed != cur[k]:
                cur[k] = fixed
                reasons.append("화폐 단위·수치를 게임 규칙에 맞춤")
        cat = next(c for c, (_, rng) in CATS.items() if no in rng)
        tr = T[no]
        prio = BASE_PRIORITY[cat] + 10 * len(tr["all"]) - (50 if tr["type"] == "proxy" else 0) + BONUS.get(no, 0)
        e = {"id": f"END-{no:03d}", "no": no, "category": cat, "categoryName": CATS[cat][0], "title": cur["title"],
             "condition": cur["condition"], "line": cur["line"], "motif": cur["motif"],
             "trigger": tr, "priority": prio, "hint": hint(tr), "illustration": None}
        endings.append(e)
        diff = [k for k in orig if orig[k] != cur[k]]
        if diff:
            changes.append((e["id"], diff, sorted(set(reasons)), orig, cur))

    meta = {
        "version": 1,
        "source": "docs/gdd/sources/endings-catalogue-200-2.md (200-2.md 사본). scripts/data/build_endings.py 가 만든 파일이므로 직접 고치지 않는다.",
        "count": len(endings),
        "categories": {c: {"name": n, "from": rng[0], "to": rng[-1]} for c, (n, rng) in CATS.items()},
        "causes": CAUSE_LABEL,
        "triggerSpec": {
            "type": "rule = 카탈로그 조건을 게임 통계로 그대로 옮긴 것. proxy = 게임에 없는 사건이라 단순한 대용 조건으로 바꾼 것(note에 설명).",
            "causes": "배열 중 하나가 파산 원인과 같아야 한다. null이면 원인 무관.",
            "all": "[통계, 연산자, 값] 조건을 모두 만족해야 한다. 통계 값이 null이면 그 조건은 거짓.",
            "ops": ["==", "!=", ">=", "<=", ">", "<", "has(배열에 값이 있음)", "in(값이 배열 안에 있음)"],
            "priority": "분류 기본값(CAT-D 400, B 300, C 200, A 100) + 조건 수×10 - proxy 50 + 보정. 클수록 먼저.",
            "selection": ["1 원인과 조건이 맞는 엔딩을 모두 모은다", "2 아직 수집하지 않은 것이 있으면 그중 priority가 가장 큰 것(같으면 번호가 작은 것)",
                          "3 전부 수집했으면: 새 엔딩 없는 파산이 pity.dryStreak번 이어졌을 때 원인이 맞는 미수집 proxy 엔딩 중 번호가 가장 작은 것",
                          "4 그래도 없으면 이미 수집한 후보 중 priority가 가장 큰 것을 다시 보여 준다", "5 후보가 하나도 없으면 balance.json endings.fallbackId"],
        },
        "stats": S,
    }
    OUT.write_text(json.dumps({"meta": meta, "endings": endings}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    lab = {"title": "엔딩명", "condition": "발동 조건", "line": "대사", "motif": "그림 모티프"}
    out = ["# 엔딩 카탈로그 원문에서 바꾼 곳", "", "> scripts/data/build_endings.py 가 만든 목록. 원문: docs/gdd/sources/endings-catalogue-200-2.md",
           f"> 바뀐 엔딩 {len(changes)}개 / 200개. 번호(END-001~200)와 분류는 하나도 바꾸지 않았다.", ""]
    for eid, diff, reasons, orig, cur in changes:
        out.append(f"## {eid} — {', '.join(reasons)}")
        for k in diff:
            out.append(f"- {lab[k]}: ~~{orig[k]}~~ → {cur[k]}")
        out.append("")
    CHANGES.write_text("\n".join(out), encoding="utf-8")
    n_rule = sum(1 for e in endings if e["trigger"]["type"] == "rule")
    print(f"엔딩 {len(endings)}개 (rule {n_rule}, proxy {len(endings) - n_rule}), 원문 수정 {len(changes)}개, 통계 {len(S)}개")

if __name__ == "__main__":
    main()
