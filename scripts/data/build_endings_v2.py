#!/usr/bin/env python3
"""data/endings.json (v2) 를 만든다. 손으로 고치지 않는다.

입력: docs/gdd/v2/endings_v2_map.csv (원인·조건·단서·글) + docs/gdd/v2/endings_direction.csv (그림 연출)
      + 아래 PATCHES(GDD_v2 4.8 조건 패치 표)
출력: data/endings.json
실행: python3 scripts/data/build_endings_v2.py   (저장소 루트에서)

검사(하나라도 어긋나면 실패): 200개 / 번호 중복 없음 / 조건의 키가 meta.stats 에 있음 /
원인+조건 문자열이 같은 쌍 없음 / 원인마다 조건 0개 엔딩 1개 이상 / 연출 200줄이 모두 짝이 있음.
"""
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAP = ROOT / "docs/gdd/v2/endings_v2_map.csv"
DIR = ROOT / "docs/gdd/v2/endings_direction.csv"
OUT = ROOT / "data/endings.json"

CAUSES = ["LIQ", "TIP", "SHARK", "BANK", "UPKEEP", "SEIZE", "FRIEND", "LEGACY"]

# 사채(SHARK)의 기본 엔딩은 CSV 가 둘로 나눠 놓았다(조건 'lastLender = shark1' / 'lastLender = shark2').
# 원인 SHARK 자체가 마지막 연체처를 오소리·독사로 한정하므로 둘이 합쳐 조건 0개와 같다. base 표시만 붙인다.
SHARK_BASE_PAIR = {"END-041": "shark1", "END-097": "shark2"}

# GDD_v2 4.8 조건 패치: id -> (CSV 조건 문자열, 패치 뒤 조건 문자열)
PATCHES = {
    "END-131": ("econ in slump|crash", "econ in slump|crash & mineConcentration >= 80"),
    "END-183": ("walletDrawdown >= 30 & walletShare >= 50", "walletDrawdown >= 30 & walletShare >= 50 & walletTopShare >= 80"),
}

# 통계 키 목록 (GDD_v2 4.10 + 새 키). key: (뜻, 범위, 종류)
# 범위: moment 파산 순간 / run 이번 세대 누적 / family 가문 누적.  종류: number bool enum set
S = {}
def s(scope, typ, *items):
    for k, label in items:
        S[k] = {"label": label, "scope": scope, "type": typ}

s("moment", "number",
  ("house", "집 단계"), ("netWorthAtMove", "마지막 이사 때 순자산"), ("settleNo", "이번 세대 정산 횟수"),
  ("minSinceFamilyRecord", "가문 최고 재산을 갱신한 뒤 지난 분"),
  ("debt.bank", "조합 원금"), ("debt.capital", "캐피탈 원금"), ("debt.shark1", "오소리 원금"), ("debt.shark2", "독사 원금"),
  ("sharkDebt", "사채 원금 합"), ("lastLenderPrincipal", "마지막 연체처 원금"), ("ltv", "조합 원금 / 집 평가액(%)"),
  ("shortfall", "마지막 미납액"), ("shortfallPct", "미납액 / 청구액(%)"), ("credit", "신용점수(파생)"),
  ("assetsOwned", "지금 가진 설비 수"), ("tagged", "딱지 붙은 설비 수"),
  ("walletDrawdown", "지갑 평가액의 세대 중 고점 대비 하락(%)"), ("walletShare", "지갑 / (현금+지갑+설비)(%)"),
  ("walletTopShare", "지갑에서 가장 큰 종목의 비중(%)"), ("mineConcentration", "켜진 설비 캐는 값 중 최대 종목 비중(%)"),
  ("wheelsOwned", "종목 쳇바퀴 수"), ("pawnedHeirloomAge", "유품을 맡긴 뒤 지난 정산"),
  ("estateNet", "물려받은 순재산"), ("stage", "진행 단계"), ("acctAgeSettles", "선물 계좌를 연 뒤 지난 정산"),
  ("levCap", "배율 상한"), ("han", "가진 한"), ("grudgeCount", "원한 품은 채권처 수"),
  ("lev", "마지막 포지션 배율"), ("holdSettles", "마지막 포지션을 든 정산 수"), ("adds", "추가 진입 횟수"),
  ("margin", "마지막 포지션 증거금"), ("marginPct", "진입 때 현금 대비 증거금(%)"), ("maxRoe", "마지막 포지션의 최고 ROE"),
  ("roeLowMin", "ROE -70% 아래에 머문 분"), ("posFundingPaid", "마지막 포지션이 낸 펀딩비"),
  ("revengeWithinSettles", "청산 뒤 다시 들어가기까지의 정산 수"), ("marginLocked", "파산 때 증거금에 묶인 돈"),
  ("posCount", "열린 포지션 수"), ("openPosLev", "열린 포지션 배율"), ("openPosHoldHours", "열린 포지션을 든 시간"),
  ("lossRecord", "한 건 최대 손실 갱신"), ("lastLoss", "마지막 손실"), ("tipAgree", "같은 방향을 말한 출처 수"),
  ("brokenWithinSettles", "세 번째 절교까지 걸린 정산"), ("cashAtBreak", "절교 순간 현금"),
  ("awayHours", "자리를 비운 시간"),
  ("friendDebtAtBreak", "절교 순간 그 친구 빚(식에만 쓰임)"), ("sharkBorrowed", "사채로 빌린 합(식에만 쓰임)"),
  ("posMargin", "마지막 포지션 증거금(식에만 쓰임)"), ("tp", "마지막 포지션 익절 ROE(식에만 쓰임)"))
S["lossRecord"]["type"] = "bool"
s("run", "number",
  ("nightTaps", "밤 회차의 탭 수"), ("od.shark2", "독사 연체 횟수"), ("odInstitution", "제도권 연체 횟수"), ("odTotal", "연체 횟수 합"),
  ("borrow.shark2", "독사 대출 횟수"), ("flyerLoans", "전단지로 빌린 횟수"), ("upfrontPaid", "떼인 선이자 합"),
  ("capitalizedInterest", "원금에 얹힌 미납 이자 합"), ("interestOnlyStreak", "도장 없이 이자만 낸 연속 정산"),
  ("rollovers", "이자 미루기 횟수"), ("collectionTrustLoss", "추심으로 깎인 신뢰 합"), ("bankRefusals", "조합 거절 횟수"),
  ("refi", "돌려막기 횟수"), ("refi.friend_to_friend", "친구->친구 돌려막기"), ("refi.friend_to_lender", "친구->채권처 돌려막기"),
  ("refi.shark2_to_shark1", "독사->오소리 돌려막기"), ("stamps", "도장 횟수"), ("stamps.shark2", "독사 도장 횟수"),
  ("lastStampAmount", "마지막 도장 금액"), ("assetsEver", "가져 본 설비 수"), ("assetsSeized", "압류 횟수"),
  ("garnished", "가압류로 떼인 합"), ("forcedSold", "급매 합"), ("laborTaps", "줍기·채굴 탭 수"), ("soldForTax", "세금 때문에 팔린 수"),
  ("pawned", "전당 잡힌 유품 수"), ("upgradesBought", "산 업그레이드 단계 합"), ("trades", "끝난 거래 수"),
  ("lev200Trades", "200배 거래 수"), ("nonLev200Trades", "200배 아닌 거래 수"), ("liqStreak", "연속 청산"),
  ("liqsThisCycle", "이번 정산의 청산 수"), ("flips", "정리 뒤 한 정산 안에 반대로 진입한 횟수"), ("winStreak", "연승"),
  ("marginCalls", "마진콜 횟수"), ("fundingPaid", "펀딩비 합"), ("watchSec", "포지션을 연 채 거래 탭을 본 시간"),
  ("tipsIgnored", "보고 따르지 않은 정보 수"), ("tipTrades", "정보를 따른 거래 수"), ("leadroomFollowed", "리딩방을 따른 횟수"),
  ("borrowedThenTraded", "빌리고 60초 안에 진입한 횟수"), ("fundedByFriends", "친구 돈으로 진입한 횟수"),
  ("friendsBroken", "절교한 친구 수"), ("friendOd", "친구 빚 연체 횟수"), ("friendDebt", "친구 빚 합"),
  ("friendStamps", "친구 도장 횟수"), ("friendStamps.raccoon", "너구리 도장 횟수"), ("friendsBorrowed", "빌린 친구 수"),
  ("friendBorrows", "친구에게 빌린 횟수"), ("claimsSold", "채권 양도 합"), ("inheritedDebt.shark", "승계 사채"),
  ("inheritedPaid", "승계 빚에 찍은 도장 합"), ("termsOpened.shark2", "독사 약관을 펼친 횟수"), ("visitsSinceOverdue.bank", "연체 뒤 조합 방문 횟수"))
s("run", "bool",
  ("contacts", "연락처 제출 여부"), ("houseInherited", "물려받은 집에 사는가"), ("seizedBoughtWithLoan", "빌리고 60초 안에 산 설비가 압류됐는가"),
  ("offline", "자리를 비운 사이 파산했는가"), ("hasLong", "롱이 열려 있는가"), ("hasShort", "숏이 열려 있는가"),
  ("sl", "손절을 걸었는가(set/none)"), ("viaJump", "급변으로 청산됐는가"), ("viaFunding", "펀딩비로 청산됐는가"),
  ("entryAtHigh", "고점 근처 진입"), ("entryAtLow", "저점 근처 진입"), ("tipWasRight", "정보 방향이 맞았는가"),
  ("fadedWire", "속보와 반대로 들어갔는가"))
S["sl"]["type"] = "enum"
S["tp"]["type"] = "enum"
S["tp"]["label"] = "익절을 걸었는가(set/none)"
s("moment", "enum",
  ("time", "하루 시각(아침/낮/저녁/밤)"), ("econ", "경기(normal/slump/crash/boom)"), ("event", "진행 중인 사건"),
  ("last", "사건 기록의 마지막 종류"), ("lastLender", "마지막 연체처"), ("lastBroken", "마지막 절교 친구"),
  ("dir", "마지막 포지션 방향(long/short)"), ("fundedBy", "마지막 포지션 자금 출처"), ("tipSource", "마지막 포지션 정보 출처"),
  ("newsAfterEntry", "진입 뒤 속보 방향"), ("revengeDir", "청산 뒤 재진입 방향(same/opposite)"),
  ("inherit", "상속 방식"), ("branch", "상속 방식(inherit 와 같음)"), ("parentInherit", "부모의 상속 방식"),
  ("parentCause", "부모가 망한 원인"), ("mineTopCoin", "캐는 값이 가장 큰 종목"))
s("moment", "set",
  ("last3", "사건 기록의 마지막 세 종류"), ("tagBy", "딱지 붙인 곳"), ("seized", "압류된 설비 id"), ("broken", "절교한 친구들"),
  ("offerTaken", "받아들인 제안 id"), ("grudge", "원한 품은 채권처"))
s("family", "number",
  ("fam.bankruptcies", "가문 파산 수"), ("fam.bankruptcies.TIP", "가문 낚임 파산 수"), ("fam.sameCauseStreak.FRIEND", "관계 연속 파산"),
  ("fam.sameCauseStreak.SHARK", "사채 연속 파산"), ("fam.simpleStreak", "연속 단순승인"), ("fam.liqs", "가문 청산 수"),
  ("fam.taps", "가문 탭 수"), ("fam.collected", "모은 엔딩 수"), ("fam.brokenTotal", "가문 절교 합"))

COND_RE = re.compile(r"^(\S+) (=|!=|>=|<=|>|<|has|in) (.+)$")
NUM_RE = re.compile(r"^-?\d+(\.\d+)?$")


def parse_value(op, raw):
    raw = raw.strip()
    if op == "in":
        m = re.match(r"^(-?\d+)\.\.(-?\d+)$", raw)
        if m:
            return {"min": int(m.group(1)), "max": int(m.group(2))}
        return raw.split("|")
    if NUM_RE.match(raw):
        return float(raw) if "." in raw else int(raw)
    if raw in ("true", "false"):
        return raw == "true"
    if " " in raw or raw in S:  # 식("0.2 * margin") 이거나 다른 통계 키
        return {"expr": raw}
    return raw


def parse_conditions(text):
    if not text:
        return []
    out = []
    for part in text.split(" & "):
        m = COND_RE.match(part.strip())
        if not m:
            raise SystemExit(f"조건을 읽지 못함: {part!r}")
        key, op, raw = m.groups()
        if key not in S:
            raise SystemExit(f"meta.stats 에 없는 키: {key} ({part!r})")
        val = parse_value(op, raw)
        if isinstance(val, dict) and "expr" in val:
            for tok in re.findall(r"[A-Za-z][\w.]*", val["expr"]):
                if tok not in S:
                    raise SystemExit(f"식의 키가 meta.stats 에 없음: {tok} ({part!r})")
        out.append([key, op, val])
    return out


def main():
    rows = list(csv.DictReader(open(MAP, encoding="utf-8-sig")))
    dirs = {r["id"]: r for r in csv.DictReader(open(DIR, encoding="utf-8-sig"))}
    if len(rows) != 200:
        raise SystemExit(f"엔딩 {len(rows)}개 (200개여야 함)")
    endings = []
    for r in rows:
        eid = r["id"]
        mods = r["modifiers"]
        if eid in PATCHES:
            before, after = PATCHES[eid]
            if mods != before:
                raise SystemExit(f"{eid} 패치 전 조건이 다름: {mods!r} != {before!r}")
            mods = after
        conds = parse_conditions(mods)
        rarity = int(r["rarity"])
        d = dirs.get(eid)
        if d is None:
            raise SystemExit(f"{eid} 연출 줄 없음")
        endings.append({
            "id": eid,
            "no": int(eid.split("-")[1]),
            "title": r["title_v2"],
            "line": r["line_v2"],
            "causes": r["cause"].split("|"),
            "conditions": conds,
            "rarity": rarity,
            "clue": r["clue"],
            "hiddenCondIndex": 0 if rarity == 3 and conds else None,
            "foreshadow": r["foreshadow"],
            "trace": r["next_gen_trace"],
            "direction": {
                "pose": d["pose"], "expression": d["expression"], "expressionRef": d["expression_ref"] or None,
                "shot": d["shot"], "props": d["props"], "background": d["background_time"], "action": d["action"],
                "sceneType": d["scene_type"], "deathImplied": d["death_implied"] == "Y",
                "eternalLabor": d["eternal_labor"] == "Y", "risk": d["risk"], "promptEn": d["prompt_en"],
            },
            "illustration": None,
            "textStatus": r["text"],
            "v1Category": r["v1_category"],
        })
    # 검사
    ids = [e["id"] for e in endings]
    if len(set(ids)) != 200:
        raise SystemExit("번호 중복")
    seen = {}
    for e in endings:
        k = ("|".join(sorted(e["causes"])), json.dumps(e["conditions"], ensure_ascii=False, sort_keys=True))
        if k in seen:
            raise SystemExit(f"원인+조건이 같은 쌍: {seen[k]} / {e['id']}")
        seen[k] = e["id"]
    for e in endings:
        e["base"] = (not e["conditions"]) or e["id"] in SHARK_BASE_PAIR
    for c in CAUSES:
        if not any(c in e["causes"] and e["base"] for e in endings):
            raise SystemExit(f"원인 {c} 에 기본 엔딩이 없음")
    for eid, lender in SHARK_BASE_PAIR.items():
        e = next(x for x in endings if x["id"] == eid)
        if e["conditions"] != [["lastLender", "=", lender]]:
            raise SystemExit(f"{eid} 는 lastLender = {lender} 하나여야 함")
    doc = {
        "meta": {"version": 2, "count": 200, "causes": CAUSES, "stats": S},
        "endings": endings,
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(endings)} endings, {len(S)} stat keys")


if __name__ == "__main__":
    sys.exit(main())
