# 구현 노트 (GDD_v2 구현 중 모호했던 곳·벗어난 곳)

사용자에게 물을 수 없어서 가장 글자 그대로의 해석을 골랐다. 바꾸려면 아래 "바꾸려면"의 위치를 고친다.

## M0 데이터

- **v1 코드 정리**: `src/engine/*`(rng·util·clock 제외)·`src/ui/*`·`src/store/*`·`src/styles.css`·`tests/*`·`scripts/data/build_endings.py`(v1 엔딩 빌더, 실행하면 v1 endings.json 을 되살려서 지움)는 이 브랜치에서 지웠다. 옛 화면(Chart·TradeScreen·Panels 등)은 M7 에서 옮겨 쓸 때 `git show d0ac6d8:src/ui/...` 로 꺼낸다. 앱은 임시 안내 화면이다(M1 에서 디버그 화면으로 바뀐다).
- **엔딩 기본 엔딩(AC-125)**: GDD 는 "원인마다 조건 0개 엔딩이 하나 이상"이라 쓰지만 CSV 의 사채(SHARK) 기본 엔딩은 END-041(`lastLender = shark1`)과 END-097(`lastLender = shark2`) 둘이다(조건 0개 엔딩이 없다). 원인 SHARK 자체가 마지막 연체처를 오소리·독사로 한정하므로 둘이 합쳐 조건 0과 같다고 보고, CSV 를 고치지 않고 `base: true` 표시를 붙였다. 테스트는 "원인마다 base 엔딩이 있고, 다른 7원인은 조건 0개 엔딩, SHARK 는 041+097 쌍"을 검사한다.
- **엔딩 조건의 값 표기**: `x in a|b` → 문자열 배열, `x in 0..1000` → `{min,max}`, 다른 통계를 가리키는 값(`0.2 * margin`, `assetsOwned` 등)은 `{expr: "..."}`. 식에 쓰이는 보조 키(`friendDebtAtBreak`, `sharkBorrowed`, `posMargin`, `tp`)도 `meta.stats` 에 넣었다.
- **`meta.stats` 의 "엔진 통계에 있음" 절반(AC-125)**: 엔진 통계 계산은 M3(4.10 전부)라서 이 절반은 M3 에서 테스트한다. M0 은 `meta.stats` ⊇ 조건 키만 검사한다.
- **세금 정산 필드**: `data/lenders.json` 의 `tax` 항목은 대출이 아니라 세대 시작 빚이다(`deadlineSettlements: 8`).
- **설비 업그레이드 `tier:*`**: GDD 표의 이름이 6개(알바 교육~공장 3교대)라서 보조 쳇바퀴(`wheel2`)에는 이 줄이 없다(`upgrades.json` `tracks.tier.names` 에 helper..farm 만 있음).
- **숫자 임시값**: [시뮬 필요] 표시 값은 GDD 에 적힌 값 그대로 `data/*.json` 에 있다(M4 sim_v3 로 조정). 새로 만든 키(제안 확률, 전당 값 등)는 각 JSON 의 `_doc` 에 근거를 적었다.
- **영구 재화 이름**: 표시 이름은 `data/legacy.json` `currency.name` = **가훈**(사용자 결정 2026-11-25). 코드 식별자는 `legacy`/`legacyPoints`/`han`(`FamilyState.han`) 그대로. GDD 본문의 '한(恨)'은 가훈으로 읽는다.
- **가훈 문구 연출(자리만)**: `legacy.json` `maxims.byCause[원인코드]` 에 원인별 문구 템플릿 배열(`{points}` 자리표시자)을 마련했다. 세대가 끝날 때 망한 원인에 맞는 한 줄(예: "200배는 잠들기 전에 걸지 않는다 +3")을 고르는 연출용이며 M1 에서는 쓰지 않는다. 지금 문구는 임시 1개씩이다.
- **ReplayFeed**: 기록(`docs/gdd/v2/sim/data/hl_3m.json`, 3분봉 C1..C5)을 1초 틱으로 풀 때 봉 안의 경로를 상승봉 `o→l→h→c`, 하락봉 `o→h→l→c` 로 60초씩 로그 선형 보간한다. `C1..C4 → DTC,BTH,SMS,MDT`, `JQQ` 는 다섯 종목 로그 가격의 평균. 매수 비율은 기록에 없어 0.5 고정.
