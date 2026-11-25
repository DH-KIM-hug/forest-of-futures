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

## M1 엔진 코어 (오프라인, 가짜 시세)

구조: `src/engine/` — `game.ts`(`createGame`, `step(state,input)` 순수 / `stepMut` 제자리), `actions.ts`(행동 20종), `settlement.ts`(3.1 순서), `mining.ts`·`equipment.ts`·`upgrades.ts`·`progression.ts`·`seizure.ts`·`loans.ts`·`friends.ts`·`housing.ts`·`events.ts`·`offers.ts`·`bankruptcy.ts`·`offline.ts`(경제 부분), `feed/`(Tick·Bar·SimFeed·ReplayFeed). 디버그 화면은 `src/App.tsx`(+`src/store/gameStore.ts`, 임시).

### 해석한 것 (가장 글자 그대로의 읽기)
- **이자 반올림**: 3.1 의 `round(...)` 와 머리말의 "이자는 올림" 이 다르다. 머리말(올림)을 따랐다(`ceilS`). 테스트 숫자는 모두 정수라 어느 쪽이든 같다.
- **`time`**: `settleNo mod 4` 이고 `settleNo` 는 정산이 끝날 때 +1. 시작은 아침, 정산 3번 뒤가 밤(조합·세무서 닫힘).
- **탭 속도**: 한 틱 = 1초. 틱과 틱 사이 12번까지 인정, 13번째부터 무시(`tapsThisTick`, 틱마다 0). 시계를 읽지 않는다.
- **줍기 소수**: 업그레이드·특성으로 생긴 소수는 `acornFrac` 에 쌓아 1이 넘을 때 현금에 더한다. 채굴 탭의 '캐는 즉시 팔기'는 탭마다 `floor(값 × (1−수수료))`(AC-31 의 floor(값×0.995)).
- **가압류 비율**: 딱지를 붙인 채권처마다 `garnishRate`(30% − 3%p×`exempt`)를 따로 뗀다(합 100% 상한). 딱지가 두 곳이면 60%. 줍기·탭·정산 채굴 모두에 적용. 딱지는 그 채권처 연체가 0 이 되거나 원금이 0 이 되면 사라지고, 연체 1회 이상인데 딱지가 없으면 정산 때 하나 붙인다(`ensureTag`). 소수는 `garnishAcc` 에 쌓아 1 단위로 원금에서 깎는다.
- **딱지 자리**: 설비가 있으면 설비(채권처 취향순, 같은 단계는 지금 순수입이 큰 종목), 없으면 종목 쳇바퀴(싼 것부터), 없으면 지갑(`walletTagBy`). 조합은 헛간 이상 설비에만(없으면 안 붙임).
- **압류 대상 고르기**: 지갑(평가액 ≥ 1,000, 전부, 시가의 90%) → 설비(그 채권처가 딱지 붙인 것 먼저, 없으면 채권처 취향순에서 아무거나. 조합도 아무 설비나 가져간다) → 설비가 붙지 않은 종목 쳇바퀴(싼 것부터). 가져간 값은 원금을 넘지 않게 자른다. 압류 뒤 연체는 한도 − 1.
- **AC-69 시험 방식**: 정산 5단계 급매가 먼저 지갑을 팔아 이자를 내므로, 지갑이 남은 채 연체가 한도에 닿는 상황은 정산으로는 만들 수 없다. 그래서 압류 순서(지갑 → 설비 → 쳇바퀴)는 `seizeFor` 를 직접 불러 시험하고, 정산 경로는 설비·연체 한도 시험으로 따로 확인했다.
- **즉시 팔기 종목의 전기세**: 그 종목은 지갑에 코인이 쌓이지 않으므로 전기세 전액을 현금(청구액의 6번 '생활비·전기세')으로 낸다. 다른 종목 지갑에서 끌어오지 않는다.
- **끈 쳇바퀴의 탭**: 쳇바퀴 스위치를 꺼도 손으로 누르는 탭은 된다(설비·관성 바퀴·전기세만 멈춤).
- **텐트의 미납**: 생활비·전기세 미납분은 캐피탈 원금으로(한도 무관, 연체 아님). 오두막 이상은 `upkeepArrears` 에 쌓이고 다음 정산 청구에 합쳐진다. 연속 3회 미납이면 UPKEEP 파산.
- **세금**: `taxDueIn` 이 정산마다 -1, 0 이 되는 정산에 원금 전액이 청구된다. 모자란 만큼 비싼 설비부터 공매(구매가 50%), 공매 대금이 필요한 금액보다 크면 남은 돈은 현금으로. 그래도 모자라면 캐피탈 원금. 조합과 마찬가지로 세무서도 밤에 닫힌다(도장 불가).
- **이자 미루기**: 제안 말고도 오소리·독사 창구에서 언제든 쓸 수 있는 행동 `rollover` 로 만들었다(독사는 3번째부터 거절, `rollover_refused`). 효과는 다음 정산의 그 이자를 0 으로 하고 `ceil(이자 × 1.1)` 을 원금에 더한다. 제안 목록에도 `rollover` 가 있어 수락하면 같은 효과.
- **제안**: 정산 뒤 20%, 항목마다 정산 5회 쿨다운, 한 번에 하나(다음 정산에 사라짐). 오소리 `waive` 는 5만 도장을 찍으면 70% 로 다음 이자 면제, 독사 `fake_waive` 는 2만을 받고 면제는 없다. `promo` 는 5만 대출 + 그 5만의 이자 3회 반값/3회 2배. `flyer` 는 독사 골목을 연다. 확률·금액은 `data/lenders.json`.
- **사건**: `rate_hike` 는 예고 1정산 뒤 시작해 2정산, 나머지는 바로. 같은 사건이 진행·예고 중이면 다시 뽑지 않는다. `subsidy` 는 순자산 < 0 이고 세대당 1번(바로 현금 +30,000).
- **독사 골목 열림**: 연체 1회 이상 / 총부채 ≥ 50만 / 채권 양도 / 전단지 / 기질 `debtTolerance`. 행동 뒤마다 확인.
- **팻말**: 줍기 200회에 한 번 서면(`stats.signSeen`) 쳇바퀴를 잃어 줍기 수가 부족해져도 다시 살 수 있다는 뜻으로 `wheelStatus` 가 기억한다. 2세대(`branch: forced`) 첫 플레이에서만 말풍선 `hint:firstWheel` 이 한 번.
- **흑자 전환**: 쳇바퀴나 설비가 있고 다음 정산 예상 수지(지금 시세)가 ≥ 0 이 되는 첫 순간 한 번(세대당). 
- **오프라인(경제 부분만)**: `economyCatchUp` 은 단계 0 은 0회, 그 밖은 `2 + idle` 회를 현재 가격으로 돌리고 연체가 (한도 − 1) 이 되는 정산 앞에서 멈춘다. 봉·포지션 처리는 M2.
- **통계 키**: M1 에서 쓰는 것만 `run.stats` 에 쌓는다(`bump`). 4.10 전체와 `buildSnapshot` 은 M3.

### 연기한 AC (M1 범위지만 선물이 필요한 부분)
- **AC-v2-45**: 지갑 평가액(-5% → 95,000)만 시험. 숏 평가익·"숏으로 지킨 비율"은 M2.
- **AC-v2-61**: `fundedByAt`(빌린 뒤 60초 이내 판정)을 시험. 포지션에 꼬리표를 붙이는 쪽은 M2(진입 구현).
- **AC-v2-72**: `checkLiquidationWipeout` 을 직접 시험(빚 있음/쳇바퀴 1대/0대/빚 0). 실제 청산에서 부르는 배선은 M2.
- **AC-v2-125 의 "엔진 통계에 있음" 절반**은 M3.

### 지운 v1 테스트 (GDD_v2 가 없앤·바꾼 규칙)
`tests/engine/ac_start_labor`(일자리·급여·자루 노동), `ac_trading_settlement`(v1 정산·v1 시세 모델·전 종목 포지션·크레딧), `ac_loans_friends_housing`(v1 한도·집 유지비·일자리 해금), `ac_endings_misc`(v1 엔딩 판정·도감), `fuzz`(v1 엔진), `heroPose`·`ui_smoke`(v1 화면). 규칙이 남은 것(대출·친구·집·정산 순서·시작 상태·퍼즈)은 숫자를 v2 로 고쳐 `tests/engine/ac_*` 로 옮겼다. 선물 거래식·엔딩 판정 테스트는 M2·M3 에서 새 엔진에 맞춰 다시 쓴다.

## M2 거래·진행·정보·오프라인

새 파일: `futures.ts`(진입·추가·정리·청산·손절익절·펀딩비·`processBar`·`levCapNow`·`shortInsurance`), `market.ts`(틱 -> 정산 봉), `tips.ts`(11개 출처·꼬리표·수첩 적중), `progression.ts`(선물 계좌 조건·`tradeGate`), `offline.ts`(`catchUp` 포지션 전 구간 + 경제 상한, `replayTicks`, `onBackground`). 행동: `eduPage` `mockTrade` `openAccount` `signWaiver` `open` `add` `close` `stops` `view` `visit` `background` `foreground`, 입력: `hello`(서버의 '평소' 값).

### 해석·벗어난 것
- **정산 봉을 상태에 둔다**: GDD 5.2 는 시세 기록을 저장하지 않는 런타임으로 두지만, 순수 엔진(`step`)이 결정적이려면 정보 규칙이 읽는 정산 봉(최근 40개)과 '평소' 값이 상태에 있어야 한다. `run.mkt` 로 두었다(저장해도 작다). '평소' 값은 서버 `hello` 가 없으면 `data/tips.json` `defaultAvg`(σ√n×1.6, 고가-저가 폭)를 쓴다.
- **ROE 는 최초 증거금 기준**: `ROE = PnL / margin0`(펀딩비로 줄기 전). 손절·익절가 `진입가 × (1 + 방향 × ROE / 배율)` 도 같은 기준. 청산가만 펀딩비를 뺀 현재 증거금으로 계산한다(3.10 공식 그대로).
- **정리 금액**: `floor(max(0, 증거금 + 손익 − ceil(명목 × 0.04%)))`. 진입 수수료도 올림. 청산은 돌려받는 돈 0, 수수료 없음.
- **시장 지연**: 진입 막힘, 정리·손절익절 변경은 예약(`closeReserved`, `reservedStops`)하고 시장이 다시 열린 첫 틱에 처리. 지연 중 청산·손절은 가격이 얼어 있으므로 따로 막지 않는다. 정지: 손익·청산·펀딩비 모두 건너뛰고 정산(경제)은 계속.
- **배율 상한**: `futures.levCap` 은 '바닥'(개설 직후 10, 집안 내력·한 방 체질이면 그 값), 실제 상한은 `levCapNow`(끝난 거래 3건 -> 50, 10건 + `waiver` -> 200). 한 방 체질은 기본 배율(`futures.defaultLev`)도 50. 청산도 끝난 거래로 센다.
- **모의거래**는 플래그일 뿐(손익 없음). 사전교육 장 수·모의거래 필요 횟수는 `prep` 5단계면 0.
- **정보 출처 방향**: `wire_break`·`wire_flow` 는 방향이 있어 수첩에 센다(`counted: true`로 바꿈, 토끼·다람쥐·`wire_vol` 은 방향 없음). `mom5`·`weasel`·`bear` 의 '15분 기준 폭'은 `range180 × √5`, 임계 배수는 `tips.json` params(`riseMul` 1.0, `dropMul` 1.5, 리딩방 `prob` 0.15)에 넣었다. `weasel` 의 한도 상향·`viper` 의 선이자 대출 묶음은 문구만 있고 효과는 연결하지 않았다(M4 이후 [제안] 항목).
- **꼬리표**: 진입 20초 안의 같은 종목·같은 방향 정보 중 마지막 출처가 `tipSource`(친구는 `friend:fox` 식). 반대 방향 속보(fact)는 `fadedWire`. `fundedBy` 는 `fundedByAt`(60초) 결과(`friend` 도 포함).
- **경제 정산과 펀딩비(오프라인)**: `catchUp` 의 경제 정산은 `settle(g,{skipFunding:true})` 로 돌고 펀딩비는 봉 처리가 유효 틱 180마다 따로 붙인다(정지 봉은 유효 틱에 안 센다). 정산 시각은 떠난 틱 + 180×k, 그때까지 처리된 봉의 종가 시세로 돈다. 연체 보호는 한 정산을 복제해 먼저 돌려 보고(`probe`) 연체가 한도-1 이 되거나 파산이면 그 앞에서 멈춘다.
- **파산 원인 2번(LIQ/TIP)**: 이번·직전 정산의 거래 실현 손실 합(`liqLossCur+Prev`)이 마지막 미납액 이상이면, 그 정산들의 가장 큰 손실 포지션에 `tipSource` 가 있으면 TIP.
- **디버그 화면**: 선물 계좌 조건 표시·교육/모의/개설·종목별 롱/숏 10배·정리·확인서 버튼만 추가.

### 닫은 연기 항목
AC-v2-45(숏 보험), AC-v2-61(포지션 꼬리표), AC-v2-72(실제 청산에서 즉시 파산 호출)를 `tests/engine/ac_i_futures.test.ts` 에서 시험한다.

## M3 엔딩 엔진

새 파일: `snapshot.ts`(`buildSnapshot`: `meta.stats` 의 키 전부를 만든다), `endings.ts`(조건 평가·`candidatesFor`·`chooseEnding`·`previewEnding`(등불)·`nearMisses`(한 끗 차이)·`archiveEntry`(기록관 표시)·`finalizeEnding`(장부·계보·가문 통계·`pendingEnding`)). `declareBankruptcy` 가 원인을 고른 뒤 `finalizeEnding` 을 부르고 나서 'bankrupt' 기록을 남긴다(그래서 "마지막 세 장면"에 파산 줄이 끼지 않는다).

### 해석·벗어난 것
- **값을 모르는 키는 null, null 과 비교하는 조건은 거짓**: 예) 이사한 적이 없으면 `netWorthAtMove` 는 null 이라 `<= 0` 이 거짓. 한 번도 포지션이 끝나지 않았으면 `lev`·`dir` 등도 null.
- **마지막 포지션 키**: 끝난 포지션 가운데 손실이면 가장 최근 손실, 손실이 없으면 가장 최근 것(`run.lastPos`). 열린 포지션만 있고 끝난 것이 없으면 null.
- **`credit`**: GDD 에 정의가 없어 `max(1, 10 − 연체 누적 횟수)` 로 두었다(END-028 "연체 누적 9회 이상 = 1점"에 맞춤). `ltv` 는 조합 원금 ÷ 집 평가액(%), 집이 없으면 null.
- **`last3` 별칭**: 오소리·독사 도장·대출 기록은 `stamp:shark`/`borrow:shark` 도 함께 들어간다(CSV 조건이 그 이름을 쓴다). 제안 수락은 `promo_loan`(족제비 반값)·`discount_today`(오소리·독사 이자 감면)으로 `offerTaken` 에 쌓는다.
- **`lastLender in grudge`**: 값 `grudge` 는 '원한 품은 채권처 집합에 든다'로 읽는다(`family.lenderRelations`, 채워지는 곳은 M4).
- **`tp` 식**: `maxRoe >= 0.9 * tp` 의 `tp` 는 마지막 포지션의 익절 ROE(%) 숫자(`_tpRoe`), 조건 `tp = set` 의 `tp` 는 걸었는지(`set`/`none`).
- **가문 통계**: `fam.*` 는 `family.stats`(숫자만) + 이번 세대 몫. `fam.bankruptcies` 는 이번 파산을 포함, `fam.collected` 는 이번 엔딩을 넣기 전 장부 수. 연속 같은 원인은 `sameCause.<원인>`.
- **M4 가 채울 키(지금은 null/0)**: `parentInherit`, `parentCause`, `estateNet`, `pawned`, `pawnedHeirloomAge`, `inheritedPaid`, 원한(`grudge`), `houseInherited`.
- **이대로 가면**: 지금 파산한다면의 마지막 연체처 = 연체가 가장 깊은 채권처(없으면 유지비 연체, 그것도 없으면 독사 > 오소리 > 캐피탈 > 조합 중 빚이 있는 곳), 미납액 = 다음 정산 예상 이자 + 생활비. 상태를 바꾸지 않는다.
- **한 끗 차이**: 같은 원인의 미수집 엔딩 가운데 조건이 정확히 하나만 거짓인 것, 희귀도 높은 순·번호 순으로 2개. `missing` 에 거짓인 조건 문자열.
- **기록관 ★3**: 조건 하나(`hiddenCondIndex`)가 `키 ?` 로 보이고 `clueVisible=false`. 같은 원인이면서 조건 키를 하나라도 함께 쓰는 엔딩(`neighborsOf`)을 하나 모으면 열린다.
- **`firstAt`**: 장부에 처음 올린 때는 시계를 읽지 않기 위해 세대 번호를 넣는다(표시용 날짜는 화면 쪽이 저장 시각으로 채울 수 있다).
- **디버그 화면**: 이대로 가면(등불)·엔딩 카드 데이터를 한 줄씩 보여 준다.

### 닫은 연기 항목
AC-v2-125 의 "엔진 통계에 있음"(`missingKeys(buildSnapshot) = []`), 엔딩 200개 각각이 "조건을 만족하는 상태를 만들면 후보에 든다"(`tests/data/endings_generated.test.ts`, 원인 여러 개면 원인마다).

## M4 세대·가훈·가문 특성·저장 v2

새 파일: `generation.ts`(한 계산·세 갈래·다음 세대 만들기·명세서 미리보기·트리 구매·은퇴·전당·고리 끊기), `estate.ts`(경매 잉여금), `save.ts`(저장 v2·어댑터·마이그레이션). 행동: `retire` `estateNext` `inherit` `buyTree` `nextGeneration` `pawn`. 흐름: 파산 → `estate.step` 카드 → 명세서 → 트리 → 다음 세대(`GameState.estate`, 저장되므로 어디서 꺼도 이어짐, AC-v2-148). 은퇴는 명세서에서 시작.

### 해석·벗어난 것
- **`GameState.estate`**: GDD 5.1 의 `SaveV2` 에 없던 칸. `{kind, step, chosen, award, calc, maxim, simpleStreakBefore, cause, surplus}`. 엔딩 카드 → 명세서 → 트리 단계를 저장하려고 `pendingEnding` 옆에 두었다.
- **GDD 의 `tree_`(가계도)는 코드에서 `lineage`** (M0 때부터). 저장 키는 코드 이름 그대로.
- **다음 세대의 `tick`은 이어진다**: 새 판의 `run.tick`·`lastSeenTick`·`mkt`(정산 봉)는 부모에서 이어받는다(정보 규칙의 봉 번호가 어긋나지 않게). `settleNo`·정산 카운트다운·사건·제안은 새로. 세대 시작가(`refPrice`)는 그때의 시세.
- **AC-v2-110 과 3.14 표의 충돌**: 표는 한정승인만 "사전교육 1장", AC 는 상속포기도 1장. AC 를 따라 둘 다 `balance.inheritance.edu` = 1장.
- **갈래가 고르는 순서**: `chooseBranch` 가 가문(가훈·이월·기질·유품·원한/연줄)을 바꾸고 `step:'tree'`, `startNextGeneration` 이 새 판을 만든다(트리에서 산 `seed`·`heirwheel` 이 시작에 반영되도록). 명세서 카드는 `previewBranch` 가 상태를 복제해 같은 경로를 돌린 값이라 고른 결과와 같다.
- **2세대 이후 갈래**: 파산 뒤 포기·한정·단순, 은퇴는 증여만. 2세대(첫 플레이)가 끝나는 때에도 같은 명세서(3세대부터 고른다 = 3세대의 시작을 고른다).
- **쌓인 성과의 최고 순자산**: `max(이월분, 이번 판 최고, 지금 순자산)`, 0 아래로 내려가지 않는다. 단순승인·증여는 `pending` 에 최댓값·합을 남기고 `simpleStreak`(단순만 +1, 증여는 그대로).
- **경매(한정승인·상속포기)**: 현금 + 포지션(시가 정리값) + 지갑 90% + 설비·쳇바퀴 50% + 집 70% 를 모아 `payOrder`(독사 → 오소리 → 캐피탈 → 조합)대로 갚는다. 못 갚은 채권처 = 원한. 한정승인은 남는 돈이 현금(`잉여금`), 상속포기는 갚을 만큼만 갚고 끝(현금은 7만 고정). 친구 빚은 세대가 바뀌면 지워진다(승계하지 않는다). 한정승인이 지키는 설비는 가장 낮은 단계 1대(가장 싼 것)이고 도토코인 쳇바퀴로 옮겨 붙인다.
- **단순승인 빚**: 조합·캐피탈은 원금 그대로, 오소리·독사는 `원금 − 연체로 얹힌 이자`(`stats['capInt.<id>']`, 정산의 이자 연체·이자 미루기가 쌓는다). 합이 상한(30만 × min(3, 1 + 연속 단순승인))을 넘으면 비율대로 줄이고 각각 반올림. 승계 몫(`inherited`)에만 금리 상한 4%(`DebtState.rateCap`, `interestDue` 가 승계 몫과 새 몫을 나눠 계산), 이자 유예 3회, 연줄(`tie`). 세금: 순재산(현금 + 지갑 + 설비·쳇바퀴 평가 80% + 집 평가 90% − 승계 빚)의 30만 초과분 × 30% + 부모의 남은 세금 빚, 기한 8회. 합이 20만에 못 미치면 학자금(캐피탈)으로 채운다. 연줄의 "첫 대출의 첫 이자 면제"와 원한의 "독사 전단지 두 배"는 연결하지 않았다(문구만).
- **증여(은퇴)**: 오두막 이상 + 총부채 0(세무서 포함). 현금은 그대로(+3만 없음), 도토코인 쳇바퀴·가업 간판을 **더하지 않는다**(단순승인만 더한다). 기질 '금수저'(원인 코드 `GIFT`). 은퇴한 판은 `run.over = true` 이고 `pendingEnding` 이 없다.
- **기질**: 부모 원인의 기질 1개 + 이전 부모의 기질(조부모) 1개, 같은 원인이 이어지면 하나만 두고 `deepBlood`. 새 판이 시작되기 전(`chooseBranch`)에 가문에 반영된다. 기질 효과 가운데 `hideStatementLine`(명세서 한 줄 가림)은 `statement().hiddenLine` 플래그만, `showTipHitRate`·`friendTipHalf`·`tagEarly`·`feeMulAtLev100`·`keepAll` 은 연결하지 않았다(화면·후속). `brokenStartTrust`(외톨이)는 연결: 부모 때 절교한 친구가 신뢰 60에서 시작.
- **유품**: `family.heirlooms[id] = {level, pawnedTo, lostCount?}`. 세대가 끝날 때 장부의 원인별 엔딩 수로 단계를 다시 계산한다. 전당(`pawn`)은 한도와 별개로 5만/15만/40만을 오소리·독사 원금에 얹고(독사는 골목이 열려 있어야), 그 채권처의 원금이 0이 되면 돌아온다. 맡긴 채 파산하면 0단계(`lostCount` = 그때 장부 수, 그 원인의 엔딩이 하나 더 모이면 다시 올라간다).
- **고리 끊기(AC-v2-117)**: 장부(엔딩 id 만 들어가는 곳)에 넣을 수 없어 `family.chainBroken = true` + 흔적 `chain_broken`. 조건: 이번 판의 갈래가 증여이고 `retireStreak ≥ 2` 인 판에서 세금이 기한 안에 0 이 되는 순간(도장으로 완납하거나, 기한 정산에 현금으로 다 냄).
- **`estateNet`(엔딩 조건)**: 부모가 망하는 순간 경매 잉여금(`estateSurplus`, 음수 가능). `parentInherit`(부모가 시작한 갈래)·`parentCause`·`houseInherited`(이사하면 꺼짐)·`inheritedPaid`(승계 빚에 찍은 도장 합)·`pawned`·`pawnedHeirloomAge`(전당 뒤 정산 수)를 채웠다. `grudge`·연줄은 `family.lenderRelations`.
- **트리 효과 숫자**: `grip`(+10%)·`craft`(+5%) 등 일부는 M1 부터 코드에 상수로 들어 있다(data 의 `effect` 와 같은 값). 시뮬로 값을 바꾸려면 코드 상수도 함께 고쳐야 한다.
- **가훈 문구**: `maxims.byCause[원인]` 의 줄을 `generation % 줄 수` 로 고르고 `{points}` 를 받은 가훈(0이면 쌓인 성과)으로 채워 `estate.maxim` 에 둔다. 문구는 M1 때의 임시 1줄씩 그대로.
- **저장 v2**: `fof.save.v2`. `StorageAdapter` 는 비동기(`get/set/remove`)라 `preferencesAdapter(Preferences)` 로 Capacitor 에 그대로 붙는다. 버전 사슬은 `MIGRATIONS[0]`(없음 → v2, 모자란 칸은 기본값으로 채움). 깨진 저장은 `fof.save.broken` + 새 시작 + 안내 한 줄, v1 저장은 `encyclopedia` 에서 엔딩 id 만 장부로(세대 표시 "옛 기록" = gen 0). `savedAt` 은 호출한 쪽이 시각을 넘긴다(엔진은 시계를 읽지 않는다). 디버그 스토어는 행동 직후와 정산마다 저장하고 시작할 때 읽는다.
- **디버그 화면**: 은퇴 버튼, 엔딩 카드 → 명세서(세 갈래 카드와 [상속포기][한정승인][단순승인] 버튼) → 가훈 트리 구매 → [다음 세대 시작]. 버튼만.

## sim_v3 결과

실행: `npm run sim:v3 -- --runs 12 [--gen 72] [--hold 6] [--hours 336] [--set balance.inheritance.renounceCash=100000 ...]` (또는 `node scripts/sim/sim_v3.mjs`). 엔진(`src/engine/*`)을 `stepMut`·`catchUp`·`declareBankruptcy`·상속 액션으로 그대로 호출한다(재구현 없음). 시세는 `hl_3m.json` 을 ReplayFeed 로 1초 틱으로 푼 것(런마다 기록 안 시작 위치가 다름), 하루 5번 × 6~9분 접속, 자리 비운 사이는 1분 봉 + `catchUp`(경제는 2 + idle 정산). 전체 표는 `docs/gdd/v2/sim/SIM_v3.md`, 원자료는 `docs/gdd/v2/sim/out/results_v3.json`. `--set` 은 메모리의 data 값만 바꿔 시험한다(파일은 그대로). 시뮬 코드는 TypeScript(`sim_v3_lib.ts`, `sim_v3.ts`)이고 엔진이 TS 라 `vite-node` 로 돈다(`sim_v3.mjs` 는 그 실행기) — GDD 10장의 `.mjs` 와 다른 점.

**플레이어(스크립트)**: `engine_normal` = 초당 1.5탭, 도토코인 쳇바퀴를 사고 캐는 즉시 팔기, 살 수 있는 것 중 순수입/값이 가장 큰 설비를(이자율보다 높을 때) 산다, 설비 수입 − 전기세가 이자 + 생활비의 1.6배를 넘으면(흑자 전환) 그 뒤로는 빚부터 갚는다(SIM_v2 정책), 조건이 되면 선물 계좌를 연다(거래는 안 함). 세대는 빚을 다 갚고 6시간 뒤 그리고 세대 시작 72시간 뒤 첫 접속에서 끝낸다(스크립트로 `declareBankruptcy` 를 부른다 — 한이 쌓일 만큼 세대가 길어야 해서). 한은 3.14 (5)의 순서(`grip 2, seed 1, heirwheel 1, craft 2, prep 2, idle 1, haggle 2, grip 5, heirwheel 3, …`)로 쓴다. 런 12회.

| 항목 | 목표 | 측정(중앙) | 판정 |
|---|---|---|---|
| 첫 쳇바퀴까지(접속 시간) | 3~6분 | 2.3분 | 목표보다 빠름(GDD 2.4 의 계산은 "약 2분 15초", 일치) |
| 선물 계좌 | 첫날, 2~4번째 접속 | 3번째 접속, 15시간, 첫날 안 100% | 범위 안 |
| 첫 세대 3일 생존(engine_normal) | 거의 전부 | 100% (engine_casual 100%, idle 100% 파산, 쳇바퀴를 안 산 labor 33% 파산) | 범위 안 |
| 빚 청산 1세대 | 36시간 (25~47) | 47시간 | 가장자리(너무 느림) |
| 빚 청산 2세대 | 26시간 (18~34) | 24시간 | 범위 안 |
| 빚 청산 3세대 | 16시간 (11~21) | 18시간 | 범위 안 |
| 빚 청산 4세대 | 9시간 (6.3~12) | 15시간 | 너무 느림 |
| 빚 청산 5세대 | 5시간 (3.5~6.5) | 12시간 | 너무 느림 |
| 받은 가훈(1세대 끝, 포기) | 15~25 | 27 | 약간 많음 |
| 한정승인·단순승인 반복의 청산 | (목표 없음) | 한정 0시간, 단순 0.1시간(둘째 세대부터) | 아래 참고 |

**읽는 법**
- 청산 시간은 접속 일정(하루 5번)에 걸려 12 / 16 / 24시간 같은 계단으로 나온다. 4·5세대가 12시간 아래로 못 내려가는 것은 둘째 접속(약 4시간 뒤) 안에 빚 20만을 갚으려면 첫 접속 한 번에 수십만을 벌어야 해서다. 쳇바퀴만 물려받는(`heirwheel`) 포기로는 어렵다.
- **한정승인·단순승인이 너무 강하게 나온다**(둘째 세대부터 청산 0시간): 이 시뮬의 세대 끝은 스크립트라 부모에게 재산이 남아 있고(실제 파산은 압류로 재산이 줄어 있다), 한정승인의 잉여금(경매 현금)이 시작 빚 20만보다 훨씬 커서 첫 접속에 빚이 사라진다. 실제 파산한 부모로는 이보다 훨씬 약할 것이다. 자연 파산(청산·연체)에서의 갈래 결과는 이 시뮬로는 못 낸다(플레이어가 자연 파산하지 않았다) — 자연 파산 시뮬은 M4 이후.
- 1세대 47시간은 봇의 정책(설비 선택·저축)에 민감하다(처음 봇은 파산했다). 범위(47)의 가장자리다.

**제안하는 데이터 변경(적용하지 않음 — 기계적 오류가 아니라 밸런스 판단)**. 각 값은 `--set` 으로 시험했다(둘째~다섯째 세대 청산 중앙값, 시간):
1. `data/legacy.json` `seed` 의 `effect.addValue` 20,000 → 40,000: 16 / 16 / 12 / 12 (현재 24 / 18 / 15 / 12). 시작 현금이 초반 복리의 씨앗이다.
2. `data/balance.json` `inheritance.renounceCash` 70,000 → 100,000: 16 / 16 / 12 / 12. 1·2번을 같이 하면 15 / 14 / 12 / 8.2 로 4·5세대가 목표에 가까워지지만 둘째 세대(26 목표)는 너무 빨라진다 — 둘 중 하나만.
3. 한정승인 잉여금에 상한을 둔다(`balance.inheritance` 에 `limitedSurplusCap`, 예: 30만; 코드 한 줄 필요). 지금은 부모의 재산 전부가 현금이 되어 "빚 없이 시작하지 않는다"는 규칙이 첫 접속에 무력해진다.
`heirwheel` 3단계에 알바 칩멍크를 더하는 안은 시험했지만 효과가 거의 없었다(24 / 18 / 15 / 12 그대로).

## M5 서버 릴레이 (`server/`)

실행: `npm run server:install`(처음 한 번) → `npm run server`(= `server/` 의 `npm run dev`, 파일이 바뀌면 다시 뜸). 기본 포트 8787. 앱은 다른 터미널에서 `npm run dev`. 환경 변수: `PORT`·`HOST`(기본 0.0.0.0)·`DB_PATH`(기본 `server/data/fof.sqlite`)·`TICK_EPOCH`(초, 처음 한 번만 DB 에 고정)·`SOURCES_PATH`·`MARKETS_PATH`·`PRIMARY_URL`·`DISABLE_SECONDARY=1`·`CORS_ORIGIN`·`QUIET=1`. 테스트는 루트 `npm test` 가 `server/tests` 까지 돈다(`server/` 에서 `npm test` 도 됨). `cd server && npm run typecheck` 로 서버 타입 검사.

**벗어난 곳·고른 해석**
- **SQLite = `node:sqlite`(Node 내장)**. `better-sqlite3` 대신. 이 Mac 은 Node 24 라 내장 모듈이 있고 네이티브 빌드가 필요 없다(의존성은 `ws` 하나). 실험 모듈이라 실행에 `--disable-warning=ExperimentalWarning` 을 붙인다. vitest 2(vite 5)가 `node:sqlite` 를 못 찾아서 `createRequire` 로 부른다. `engines.node >= 22.18`(타입 제거 실행 때문).
- **TypeScript 를 컴파일하지 않고 Node 의 타입 제거로 바로 실행**(`node src/index.ts`). 그래서 `.ts` 확장자 import, enum·생성자 파라미터 프로퍼티 금지(`erasableSyntaxOnly`). 빌드 산출물 없음. 배포 때 번들이 필요하면 그때 추가.
- **저장 형식**: `ticks.p` 는 가격·거래량 지수·매수 비율을 JSON 텍스트 한 칸에(GDD 는 열 15개). 읽기는 틱 번호 범위뿐이라 충분하다. `raw_ticks` 에는 원본 mid·체결 금액(서버 안에서만). `bars_180.avg60` 칸 = 정산 봉의 마지막 60틱 평균(11장 자리).
- **틱 번호 기준 `epoch`**: 처음 가동한 시각 −1초를 DB `meta.tickEpoch` 에 고정(운영에서 정하려면 `TICK_EPOCH`). 프로토콜의 `epoch`(주 1회 가격대 재설정 자리)는 항상 1 이고 hello 의 `ts` 는 `n + tickEpoch`(초). `hello` 는 마지막 틱 `n` 을 준다.
- **봉**: `vol`·`buy` 는 틱 평균(엔진의 `SettleBar` 와 같은 뜻). 정지(`halted`) 틱은 OHLC 에서 빼고, 전부 정지인 봉은 직전 가격의 납작한 봉 `st=2`. 봉 상태 코드 0 open / 1 delayed / 2 halted. `/v1/bars` 의 "20,000개" 는 **시간 칸 수**(종목이 5개여도 칸 20,000개 = 응답 봉 10만 개). 응답 모양 `{res, from, to, markets, bars:{종목:[[n0,o,h,l,c,vol,buy,st]…]}, next?}`, 틱은 `{from,to,ticks:[{n,ts,st,p}]}`(최대 600).
- **'평소' 값(`avg`)**: `vol180` = 최근 정산 봉 vol 평균, `range180` = 정산 봉 (고−저)/시가 평균, `range300s` = 연속 1분 봉 5개 묶음의 (고−저)/시가 평균(24시간). 봉이 없으면 GDD 예시값(0.0021 / 0.0026). hello 는 30초 캐시.
- **거래량 지수**: 초당 체결 금액 ÷ 지수 이동 평균(반감기 1시간, 시작은 단순 평균, 재시작 때 `raw_ticks` 최근 1시간으로 시드), 상한 50. 지수 JQQ 는 구성원 평균.
- **전환 규칙**: GDD 6.3 대로(5초 조용 → 보조, 60초 정상 → 복귀, 수익률 0.5%p 이상 30초 → 보조 + 알림 로그). 복귀·전환·정지 해제 때는 모두 새 mid 로 앵커를 다시 잡아 **이어 붙인다**. GDD 는 `halted` 뒤만 "멈춘 동안 움직임 버림"이라 했지만 `delayed`(5~60초) 뒤에도 같이 버린다(한 틱에 5~60초치 움직임이 튀는 것을 막으려는 해석).
- **재시작**: 저장된 마지막 틱의 가격에서 이어 가고, 꺼져 있던 초(5초 넘게)는 `halted` 틱으로 채워 틱 번호에 구멍이 없게 한다. 진행 중이던 봉은 저장된 틱으로 복원.
- **보조 출처**: `DexAdapterStub.start()` 가 `NotImplementedError` 를 던지고, 릴레이는 보조를 "없음"으로 표시한다(그동안 주 출처가 죽으면 곧바로 `delayed` → `halted`). 전환 로직은 가짜 보조로 시험(AC-v2-136). 실제 RPC 는 M10.
- **구독 수**: 종목마다 `bbo` + `trades` = 10개(제한 10 이내). ping 15초, 5초 무소식이면 소켓을 끊고 백오프 재연결(1→2→4…30초, ±20%, 데이터가 오면 초기화).
- **랭킹**: `/v1/rank*` 는 501(M10). `/healthz` 는 출처를 `A`/`B` 로만 말한다.
- 서버 시작 직후 hello 의 `st` 는 첫 표본이 오기까지 `delayed`(5초 안에 `open`).

**AC 대응(서버 테스트 `server/tests/ac_m_*.test.ts`)**: AC-v2-133~140 모두(138 은 서버가 내는 hello·k·REST 직렬화에 원본 가격 문자열·종목 이름·출처 주소가 없음을 검사; 앱 번들 쪽은 M6). 141(랭킹)·136 의 실제 어댑터는 M10. "기록한 원본 메시지 재생 테스트"는 가짜 소켓·가짜 시계 시나리오로 대신했고 "실제 연결 1시간 무중단"은 하지 않았다(아래 20초 연결만).

**실연결 스모크(20초, `cd server && npm run smoke -- 20`, 인메모리 DB, 로컬 ws 클라이언트)** — 가상 값과 개수만:
```
hello: markets=DTC,BTH,SMS,MDT,JQQ warmBarsDTC=0 st=delayed
ws messages=21 ticks=20 hello=true
hl: connects=1 messages=755
first: n+0 st=open DTC=68000 BTH=3400 SMS=78.5 MDT=210 JQQ=520
last : n+19 st=open DTC=68014.43 BTH=3400.82833 SMS=78.5219757 MDT=210.032855 JQQ=520.082602
healthz: {"ok":true,"st":"open","source":"A","lastTickAgeSec":0,"ticks":21}
rest ticks returned=20
```
(Hyperliquid 에서 20초 동안 755개 메시지, 재연결 없음, 틱 20개가 끊김 없이 방송·REST 로 조회됨.)
