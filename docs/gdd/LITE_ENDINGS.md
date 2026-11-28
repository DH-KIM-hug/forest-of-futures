# 라이트 모드 배드 엔딩과 거래 중 만화 컷 2탄

주인 요청(2026-11-28): "곳곳에 지금처럼 만화있으면 좋겠고. 단순화한만큼 큰 조건없이 아주 다양한 배드엔딩 재설계하고 지피티로 이미지 각각 뽑기"

- 주소: `?proto=1&lite=1` 의 파산. 라이트가 아닌 생의 엔딩 200개(data/endings.json)와 1막 글(data/endings_act1.json)은 그대로다.
- 데이터: `data/endings_lite.json`. 엔진: `src/engine/liteEndings.ts`(`finalizeEnding` 의 첫 줄이 라이트 생만 이리 보낸다). 카드와 도감: `src/ui/proto/lite/LiteEnding.tsx`. 시험: `tests/engine/liteEndings.test.ts`.
- 연락 시트: `docs/gdd/fun_log/lite_endings.png`.

## 흐름

파산 → 절망의 표제지 다시(장면 D, 진짜 빚과 남은 돈) → 엔딩 카드(그림 한 장, 제목, 글 1~3줄, 처음이면 「새 엔딩!」, 엔딩 도감 n / 40) → [환생하기] → 거래의 나무 → 다음 생(「다시, 사흘 전」).

카드의 [엔딩 도감]은 40칸 격자다. 본 엔딩은 그림과 제목, 못 본 것은 번호와 ????. 누르면 크게 보고 몇 번 봤는지.

## 고르는 법(조건 퍼즐 없음)

죽은 생에서 읽기 쉬운 사실을 꼬리표로 뽑는다.

| 꼬리표 | 뜻 |
|---|---|
| `mode:liq` | 빌릴 곳을 다 쓴 뒤 몰빵 청산으로 그 자리 파산 |
| `mode:locked` | 판을 쥔 채(증거금 1,000 이상) 이자를 못 내 파산 |
| `mode:overdue` | 그 밖의 연체 한도 파산 |
| `maxed` | 만난 대부업체의 남은 한도가 모두 0 |
| `lender:shark1` `shark2` `capital` `bank` | 빚(원금)이 가장 많은 곳 |
| `coin:FLY` `DTC` `BTH` `MDT` `SMS` `JQQ` | 마지막 판의 종목(열린 판이 있으면 가장 크게 건 것) |
| `dir:long` `dir:short` | 마지막 판의 방향 |
| `lev:low`(20배 이하) `mid` `high`(100배 이상) | 마지막 판의 배율 |
| `life:short`(5분 안) `mid` `long`(20분 넘게) | 생의 길이 |
| `clock:dawn`(0~5시) `morning`(6~11) `day`(12~17) `night`(18~23) | 기기 시계 |
| `peak:high` | 한때 순자산이 시작(−30만)보다 20만 넘게 올랐다(높이 탔다가 떨어짐) |

엔딩마다 무게 = 1 + 맞는 꼬리표의 무게. 이미 본 엔딩은 × 0.3. 그 무게대로 제비를 뽑는다(씨앗, 세대, 틱, 분으로 섞은 수). 그래서 사실이 맞는 엔딩이 몇 배 자주 나오지만 어느 엔딩이든 나올 수 있고, 새 엔딩이 자주 보인다(시험: 20개를 본 뒤에도 새 엔딩이 65% 넘게).

도감은 `family.liteBook`(엔딩 id → 본 횟수, 처음 본 세대)에 남는다. 생과 저장을 넘어 남고, 옛 저장은 빈 도감으로 읽힌다. 200개 엔딩 장부(`family.ledger`)에는 적지 않는다. 가문 기록(`lineage.endedBy`)에는 라이트 엔딩 id 가 들어가고, 기록 화면은 라이트 제목으로 읽는다.

## 글과 그림의 규칙

- 결과 뒤의 삶, 절망 한가운데. 편지나 통보를 받는 장면이 아니다.
- 얼굴: 눈물 고인 눈, 텅 빈 눈, 억지 웃음, 오열.
- 옛 만화식 사채 '처리 직전' 장면이 많다(시멘트 신발, 드럼통, 바위와 바다, 모이 분쇄기, 뒷산 구덩이, 얼음 창고). 웃음은 깡패의 무관심(하품, 장부, 시가, 빨대)에서 나온다. 깡패가 하는 일임이 그림에서 분명하다.
- 죽음의 암시는 3개(7.5%): 빈 부두의 드럼통과 빨간 리본, 돌아오지 않은 배, 뒷산의 새싹. 빈자리와 남은 물건으로만.
- 금지: 피, 상처, 부상, 시신, 죽는 순간, 자살이나 자해로 읽힐 것. 시험이 금지어와 가운데점을 거른다.
- 그림: sprite-gen codex, 컬러 만화(첫째 참고 `docs/art/v5/manga/p1_color.png`, 둘째 `docs/art/v5/golden/hero_phone.png`, 대부업자가 나오면 `docs/art/v5/raw/c_*.png`). 세로 4:5, 글씨 없음. 프롬프트 `docs/art/v5/prompts/endings_lite/LE*.txt`(만드는 스크립트 `make_prompts.py`, 이어 뽑기 `run_jobs.sh`, 웹 사본 `to_webp.py` 640×800, 연락 시트 `make_sheet.py`, 이 표 `make_doc.py`).
- 오소리 대부 v2 (2026-11-28): 대부가 나오는 LE01, LE04, LE07, LE14, LE21, LE25, LE32, LE33 은 `docs/art/v5/golden/BOSS_V2.md` 의 생김새로 다시 그렸다(구도는 예전 그림을 첫째 참고로). 프롬프트 `docs/art/v5/prompts/boss_v2/LE*.txt`, 뽑기 `prompts/boss_v2/run.sh`, 예전 그림 `docs/art/v5/endings_lite/boss_v1/`.

## 엔딩 40개

<!-- table -->
| id | 제목 | 글 | 무게(1 + 맞는 꼬리표) | 그림 |
|---|---|---|---|---|
| LE01 | 부두의 시멘트 신발 | 밤 부두. 발이 굳는 데 십 분이면 된다고 했다.<br>추심원은 그동안 장부에 줄을 그었다. | lender:shark1 +3, clock:night +2, mode:overdue +1 | `src/ui/proto/img/endings/LE01.webp` (원본 `docs/art/v5/endings_lite/LE01.png`) |
| LE02 | 딱 맞는 드럼통 | 독사가 줄자로 드럼통 안쪽을 재더니 고개를 끄덕였다.<br>"딱 맞네." | lender:shark2 +4, maxed +2 | `src/ui/proto/img/endings/LE02.webp` (원본 `docs/art/v5/endings_lite/LE02.png`) |
| LE03 | 새벽 배의 바위 | 새벽 배는 조용했다. 바위 하나, 다로미 하나, 하품하는 독사 하나.<br>"수영은 할 줄 알아? 상관은 없는데." | lender:shark2 +2, clock:dawn +3, coin:FLY +1 | `src/ui/proto/img/endings/LE03.webp` (원본 `docs/art/v5/endings_lite/LE03.png`) |
| LE04 | 모이 분쇄기 위의 설명회 | 모이 분쇄기 위에 거꾸로 매달린 채, 다로미는 200배가 왜 좋은지 설명했다.<br>대부는 빨대로 음료를 끝까지 빨았다. | lev:high +3, lender:shark1 +2 | `src/ui/proto/img/endings/LE04.webp` (원본 `docs/art/v5/endings_lite/LE04.png`) |
| LE05 | 뒷산 구덩이 | 뒷산 구덩이는 생각보다 깊었다. 삽은 다로미에게 쥐여 줬다.<br>추심원이 손전등을 비췄다. "조금만 더." | life:long +2, lender:shark1 +1, clock:night +1 | `src/ui/proto/img/endings/LE05.webp` (원본 `docs/art/v5/endings_lite/LE05.png`) |
| LE06 (죽음 암시) | 빨간 리본 | 부두에 뚜껑 닫힌 드럼통 하나와 빨간 리본만 남았다.<br>그 뒤로 다로미를 본 이는 없다. | mode:liq +2, lev:high +2, maxed +1 | `src/ui/proto/img/endings/LE06.webp` (원본 `docs/art/v5/endings_lite/LE06.png`) |
| LE07 (죽음 암시) | 돌아오지 않은 숲속 7호 | 원양어선 숲속 7호는 그해 겨울 돌아오지 않았다.<br>대부는 장부의 이름 옆에 작게 '정리'라고 적었다. | lender:shark1 +2, life:long +1, mode:overdue +1 | `src/ui/proto/img/endings/LE07.webp` (원본 `docs/art/v5/endings_lite/LE07.png`) |
| LE08 (죽음 암시) | 뒷산의 새싹 | 봄이 되자 뒷산 그 자리에 도토리 싹이 하나 났다.<br>독사는 그 옆에서 시가를 껐다. | lender:shark2 +3, clock:dawn +1 | `src/ui/proto/img/endings/LE08.webp` (원본 `docs/art/v5/endings_lite/LE08.png`) |
| LE09 | 쳇바퀴 공장 17번 | 대부의 쳇바퀴 공장 17번 바퀴. 돌리는 만큼 이자가 깎인다.<br>계산해 보니 2,340년 남았다. | lender:shark1 +2, life:long +1, mode:overdue +1 | `src/ui/proto/img/endings/LE09.webp` (원본 `docs/art/v5/endings_lite/LE09.png`) |
| LE10 | 원양어선의 안테나 | 원양어선에 실렸다. 그물을 당기다 말고 폰을 하늘로 든다.<br>바다 한가운데선 시세가 안 잡힌다. | mode:locked +2, clock:dawn +1 | `src/ui/proto/img/endings/LE10.webp` (원본 `docs/art/v5/endings_lite/LE10.png`) |
| LE11 | 밤시장 설거지 | 숲 밤시장 국밥집 설거지. 그릇 하나에 빚이 1원 준다.<br>손님이 말했다. "그 코인, 나도 탔었는데." | clock:night +3, life:mid +1 | `src/ui/proto/img/endings/LE11.webp` (원본 `docs/art/v5/endings_lite/LE11.png`) |
| LE12 | 꼬리털 한 근 | 꼬리털은 근으로 달아 팔았다.<br>독사가 저울 눈금을 꼬리 끝으로 슬쩍 눌렀다. | lender:shark2 +2, mode:overdue +1 | `src/ui/proto/img/endings/LE12.webp` (원본 `docs/art/v5/endings_lite/LE12.png`) |
| LE13 | 거래소 앞 상자집 | FRX 거래소 입구 앞 상자집. 금 간 폰으로 차트를 새로고침한다.<br>"이번엔 진짜 오른다니까." | coin:FLY +2, peak:high +2, mode:locked +2 | `src/ui/proto/img/endings/LE13.webp` (원본 `docs/art/v5/endings_lite/LE13.png`) |
| LE14 | 대부의 빨대 담당 | 오소리 대부의 음료 심부름꾼이 됐다.<br>빨대 각도가 틀리면 이자가 붙는다. | lender:shark1 +3, mode:overdue +1 | `src/ui/proto/img/endings/LE14.webp` (원본 `docs/art/v5/endings_lite/LE14.png`) |
| LE15 | 시청자 세 명 | "200배 트레이딩 비법" 생방송. 시청자 3명.<br>그중 둘은 추심원이다. | lev:high +3, peak:high +1, clock:night +1 | `src/ui/proto/img/endings/LE15.webp` (원본 `docs/art/v5/endings_lite/LE15.png`) |
| LE16 | 햄스터 노조 막내 | 햄스터 노조가 받아 줬다. 막내라서 바퀴 기름칠과 회의록과 커피.<br>위원장이 말했다. "빚은 개인 사정이고." | life:long +2, mode:overdue +1, lev:low +1 | `src/ui/proto/img/endings/LE16.webp` (원본 `docs/art/v5/endings_lite/LE16.png`) |
| LE17 | 지장 열두 번 | 너구리가 서류 열두 장을 내밀었다. "여기, 여기, 여기 지장이요 ♥"<br>꼬리 항목에도 찍었다. | lender:capital +4 | `src/ui/proto/img/endings/LE17.webp` (원본 `docs/art/v5/endings_lite/LE17.png`) |
| LE18 | 최저 기록 축하 | 조합 회의실. 부엉이 지점장이 다로미의 신용 점수를 소리 내어 읽었다.<br>직원들이 박수를 쳤다. 개점 이래 최저였다. | lender:bank +5 | `src/ui/proto/img/endings/LE18.webp` (원본 `docs/art/v5/endings_lite/LE18.png`) |
| LE19 | 날다람쥐 탈 | FRX 앞에서 날다람쥐코인 인형 탈을 쓰고 전단을 돌린다.<br>탈 속에서 운다. 탈은 웃고 있다. | coin:FLY +4 | `src/ui/proto/img/endings/LE19.webp` (원본 `docs/art/v5/endings_lite/LE19.png`) |
| LE20 | 뒷산 짐꾼 | 뒷산 짐꾼이 됐다. 하루에 오르막 아홉 번.<br>오르막만 보면 입에서 "롱… 롱…" 소리가 난다. | dir:long +3, life:mid +1 | `src/ui/proto/img/endings/LE20.webp` (원본 `docs/art/v5/endings_lite/LE20.png`) |
| LE21 | 숏폼 춤 | 빚을 갚으려고 숏폼 춤을 춘다. 조회수 12.<br>대부가 '좋아요'를 눌렀다. 이자는 그대로다. | dir:short +3, clock:night +1 | `src/ui/proto/img/endings/LE21.webp` (원본 `docs/art/v5/endings_lite/LE21.png`) |
| LE22 | 다람쥐 경매 | 숲 경매장. "다람쥐 한 마리, 일 잘함, 빚 있음." 시작가 300원.<br>아무도 손을 들지 않았다. | lender:capital +2, maxed +2 | `src/ui/proto/img/endings/LE22.webp` (원본 `docs/art/v5/endings_lite/LE22.png`) |
| LE23 | 새벽 네 시의 계산대 | 숲 편의점 야간 알바. 계산대 아래에서 몰래 차트를 본다.<br>점장은 오소리다. 다 보고 있다. | clock:dawn +3, clock:night +1 | `src/ui/proto/img/endings/LE23.webp` (원본 `docs/art/v5/endings_lite/LE23.png`) |
| LE24 | 걸어 다니는 광고판 | "오소리 대부, 당일 대출" 광고판을 메고 빗속에 서 있다.<br>자기가 빌린 곳을 광고한다. | lender:shark1 +2, mode:overdue +1 | `src/ui/proto/img/endings/LE24.webp` (원본 `docs/art/v5/endings_lite/LE24.png`) |
| LE25 | 대부의 의자 다리 | 대부의 의자 다리 하나가 부러졌다.<br>그날부터 다로미가 그 다리다. | lender:shark1 +2, maxed +1 | `src/ui/proto/img/endings/LE25.webp` (원본 `docs/art/v5/endings_lite/LE25.png`) |
| LE26 | 처리 대기 번호표 | 드럼통 앞 대기 줄. 앞의 토끼가 물었다. "몇 배였어요?"<br>"200배요." "아, 저도요." | mode:liq +2, lev:high +2 | `src/ui/proto/img/endings/LE26.webp` (원본 `docs/art/v5/endings_lite/LE26.png`) |
| LE27 | 바위 다섯 개 | 빚 10만에 바위 하나. 배는 다섯 개째에서 기우뚱했다.<br>독사는 부두에서 손수건을 흔들었다. | maxed +3, lender:shark2 +1 | `src/ui/proto/img/endings/LE27.webp` (원본 `docs/art/v5/endings_lite/LE27.png`) |
| LE28 | 얼음 창고의 점심시간 | 얼음 창고 의자에 묶였다. 숨이 차트처럼 하얗게 오르내린다.<br>추심원은 그 앞에서 도시락을 먹었다. 반찬은 안 나눠 줬다. | life:mid +1, mode:overdue +1, lender:shark1 +1 | `src/ui/proto/img/endings/LE28.webp` (원본 `docs/art/v5/endings_lite/LE28.png`) |
| LE29 | 꼴찌 상담원 | 이제 다로미가 전화를 건다. "고객님, 200배 해 보셨어요?"<br>숲속 캐피탈 콜센터, 실적 꼴찌. | lender:capital +3, clock:morning +1 | `src/ui/proto/img/endings/LE29.webp` (원본 `docs/art/v5/endings_lite/LE29.png`) |
| LE30 | 딱 한 번만요 | 파산 다음 날, 다로미는 독사의 문을 다시 두드렸다. "딱 한 번만요."<br>독사는 하품을 하고 문을 열었다. | maxed +2, lender:shark2 +2, mode:liq +1 | `src/ui/proto/img/endings/LE30.webp` (원본 `docs/art/v5/endings_lite/LE30.png`) |
| LE31 | 지갑 속 잔고 | 제일 높았을 때의 잔고 화면을 인쇄해 지갑에 넣고 다닌다.<br>지갑에는 그것만 있다. | peak:high +5 | `src/ui/proto/img/endings/LE31.webp` (원본 `docs/art/v5/endings_lite/LE31.png`) |
| LE32 | 5분 내기 | 계좌를 연 지 몇 분. 오소리 직원들 사이에서 돈이 오갔다.<br>"거봐, 5분 안 간다니까." | life:short +5 | `src/ui/proto/img/endings/LE32.webp` (원본 `docs/art/v5/endings_lite/LE32.png`) |
| LE33 | 우수 고객 감사패 | 오래 버텼다. 그래서 이자도 오래 냈다.<br>대부가 감사패를 줬다. 우수 고객. | life:long +4 | `src/ui/proto/img/endings/LE33.webp` (원본 `docs/art/v5/endings_lite/LE33.png`) |
| LE34 | 활공장 착지 매트 | 숏을 친 순간 날다람쥐가 날아올랐다.<br>지금은 날다람쥐 활공장에서 착지 매트를 깐다. | dir:short +2, coin:FLY +2 | `src/ui/proto/img/endings/LE34.webp` (원본 `docs/art/v5/endings_lite/LE34.png`) |
| LE35 | 거북이 택배 조수 | 10배면 안전하다고 생각했다. 안전하게, 천천히 다 잃었다.<br>이제 거북이 택배 조수다. 역시 천천히 간다. | lev:low +4, lev:mid +1 | `src/ui/proto/img/endings/LE35.webp` (원본 `docs/art/v5/endings_lite/LE35.png`) |
| LE36 | 밤 줍기 일당 | 밤더리움을 믿었던 다로미는 이제 밤을 줍는다.<br>한 자루에 30원. 가시는 공짜다. | coin:BTH +5 | `src/ui/proto/img/endings/LE36.webp` (원본 `docs/art/v5/endings_lite/LE36.png`) |
| LE37 | 삼솔 공장 라인 | 삼솔전자 조립 라인. 숏 쳤던 그 폰을 하루 800개 조립한다.<br>폰은 잘 팔린다고 한다. | coin:SMS +5 | `src/ui/proto/img/endings/LE37.webp` (원본 `docs/art/v5/endings_lite/LE37.png`) |
| LE38 | 잣나무 꼭대기 | 잣 따기 일꾼. 잣나무 꼭대기에서 내려다보면<br>숲 전체가 빨간 봉처럼 보인다. | coin:JQQ +5 | `src/ui/proto/img/endings/LE38.webp` (원본 `docs/art/v5/endings_lite/LE38.png`) |
| LE39 | 도토리 껍질 천 개 | 도토리 껍질 까기 부업. 천 개에 50원.<br>도토코인도 멍도토도 결국 도토리였다. | coin:DTC +4, coin:MDT +4 | `src/ui/proto/img/endings/LE39.webp` (원본 `docs/art/v5/endings_lite/LE39.png`) |
| LE40 | 평일 오후 세 시 | 평일 오후 세 시. 정장을 입고 공원 벤치에 앉아 있다.<br>출근할 곳은 없다. 비둘기만 단골이다. | clock:day +4 | `src/ui/proto/img/endings/LE40.webp` (원본 `docs/art/v5/endings_lite/LE40.png`) |
<!-- /table -->

## 거래 중 만화 컷 2탄 (`src/ui/proto/lite/LiteCuts.tsx`)

그림은 같은 컬러 만화 컷(3:2, `docs/art/v5/manga/c_*.png` → `src/ui/proto/img/manga/cut_*.webp`), 효과음과 숫자는 화면이 얹는다. 모두 화면 위쪽에 뜨고 그림만 눌린다(누르면 닫힘). 그림 바깥은 누름이 지나가서 [정리하기]와 주문 단추를 가리지 않는다. 다른 만화 컷이 떠 있으면 건너뛴다. 서로 25초 간격. 움직임 줄이기면 흔들지 않는다.

| 컷 | 뜨는 때 | 그림 | 얹는 글 | 길이 |
|---|---|---|---|---|
| knock 똑똑똑 | 낼 수 없는 정산(손의 돈 < 이자 + 생활비) 10초 전, 정산마다 한 번 | `c_knock` 문 창에 붙은 추심원 얼굴, 이불 속 다로미 | 똑 똑 똑…, 정산까지 남은 초(진짜 카운트다운), 「이자 {이자+생활비} / 손에 {손의 돈}」 | 정산이 지나가거나 10초 |
| sign 한 번만 더 | 청산 뒤 90초 안에 또 빌림, 생마다 한 번 | `c_sign` 떨리는 손의 서명, 너구리 손 | 덜덜덜, 슥…, 「…한 번만 더.」 | 2.4초 |
| streak 연승 | 세 판 내리 이김(청산이나 손실이 끊는다), 3분에 한 번 | `c_streak` 선글라스 다로미 | 후훗…, {n}연승, 나… 천재인가? | 2.4초 |
| read 읽었다 | 날다람쥐 판을 이겼고, 들고 있는 사이 교과서 모양이 그 판의 쪽으로 끝났다(flyWind 의 끝난 모양, 속임수가 아닌 것), 3분에 한 번 | `c_read` 번뜩이는 눈과 쌍바닥 | 읽었다…!, 번뜩, 모양 이름(「쌍바닥 완성」 등) | 2.4초 |
| lev100 100배 | 이 기기에서 처음으로 100배 넘게 건다(그때는 「간다…!」 대신) | `c_lev100` 레버를 끝까지 미는 다로미 | {배율}배…!, 우우웅, 이제 돌이킬 수 없다 | 2.2초 |

확인용: `&pdev=lite_end&pend=LE04`(그 엔딩 카드), `&pdev=lite_book`(도감 14칸 찬 채), 아무 pdev 에서 `window.__liteCut({ kind: 'streak', n: 3 })`.

## 열매: 도감이 곧 성장 (U-62)

사용자 결정 「황금 도토코인 없애기」. 라이트의 거래의 나무는 황금 대신 열매로 자란다. 데이터 `data/endings_lite.json` 의 `fruit` 와 엔딩마다의 `gift`, 엔진 `src/engine/liteFruit.ts`, 시험 `tests/engine/liteFruit.test.ts`.

- **새 엔딩마다 열매 1개.** 다시 본 엔딩은 0(카드에 「n번째로 본 엔딩. 열매는 처음 볼 때만 열린다.」).
- **카드**: 「새 엔딩!」 아래에 열매 +n, 공짜 가지(「「한 번 버티기」 가지가 열렸다」와 한 줄), 도감 보상, 「다음 보상까지 n」.
- **환생 화면**: 「이번 생에 새 엔딩 n개 → 열매 +n」, 없으면 「새 엔딩 없음」과 「다른 데서 망해 보자. 다른 코인, 다른 배율, 다른 돈줄, 다른 시각.」
- **도감 화면**: 보상 다섯 칸의 막대, 다음 보상까지 몇 개와 무엇, 열매 수, 가지가 열리는 엔딩의 「가지」 표, 맨 아래 「특별한 결말」 두 칸.

### 공짜 가지(처음 볼 때 그 가지를 연다, 가졌으면 한 레벨)

| 엔딩 | 가지 | 카드의 한 줄 |
|---|---|---|
| LE02 딱 맞는 드럼통 | 한 번 버티기 | 드럼통 안에서 배웠다. 한 번은 버텨야 한다. |
| LE15 시청자 세 명(200배 비법) | 고배율 축하금 | 시청자 셋 중 하나가 후원을 눌렀다. 추심원이었다. |
| LE33 우수 고객 감사패(오래 버팀) | 마진콜 전화(빌려 넣는 돈의 금리) | 감사패 뒤에 대부의 직통 번호가 적혀 있었다. |
| LE32 5분 내기 | 손에 익은 앱 | 5분 만에 망했지만, 앱 위치는 외웠다. |
| LE31 지갑 속 잔고(높이 탔다가) | 손절 습관(따라가는 손절) | 꼭대기에서 잠갔어야 했다. 지갑이 알려 줬다. |
| LE35 거북이 택배 조수(10배로 천천히) | 단골 수수료 | 천천히 잃는 동안 수수료가 제일 많이 가져갔다. |
| LE30 딱 한 번만요 | 물타기 | 딱 한 번만 더 넣으면 된다는 걸, 이번엔 단추로 만들었다. |
| LE23 새벽 네 시의 계산대 | 초봉 차트 | 계산대 아래 작은 화면으로 차트를 오래 보는 법을 익혔다. |
| LE13 거래소 앞 상자집 | 하루 한도 | 상자집 문에 「오늘은 여기까지」라고 써 붙였다. |
| LE06 빨간 리본 | 비상금 주머니 | 드럼통 옆에 남은 빨간 리본. 그거라도 챙겼다. |

짝 가지(3단계)가 공짜로 열리면 그 생부터 그쪽이 켜진다. 다 자랄 수 없는 노드는 없지만, 혹시 다 자랐으면 열매 1개로 준다.

### 도감 보상(배드 엔딩 40개 가운데 본 수)

| 수 | 이름 | 덤 | 열매 |
|---|---|---|---|
| 5 | 단골 용돈 | 새 생마다 손에 +10,000 | +1 |
| 10 | 단골 금리 | 코인 빚 30만의 이자 −10%(1% → 0.9%) | +2 |
| 20 | 먹선 케이스 | 새싹 등급의 폰 케이스가 만화 먹선 케이스로 | +3 |
| 30 | 드럼통 감별사 | 칭호(카드의 「제n화 끝」 옆, 도감 머리) | +4 |
| 40 | 도감 완성 | 특별한 결말 「도감 완성」이 같이 적힌다(열매 1개 더) | +5 |

전광판 검사(`ranking/src/verify.ts` LIFE.liteStart)는 단골 용돈을 넣어 −29만에서 잰다.

### 특별한 결말(40 에 세지 않는다)

- **LX01 완납 영수증**: 빚을 다 갚고 「은퇴한다」. 황금 대신 이것이 도감에 적힌다(처음이면 열매 1개). 「은퇴한다」 밑 글은 「이번 생 마치기, 도감에 「완납 영수증」, 열매 +1」, 두 번째부터 「완납 영수증 한 장 더」. 카드는 라이트 카드, 도장은 금색 「완납」, 그림은 대부의 책상.
- **LX02 도감 완성**: 마흔 번째 엔딩과 함께 적힌다. 「마흔 가지로 망했다. 숲에서 처음이라고 했다.」

### 옛 저장

라이트 저장에 열매 칸이 없으면 한 번 옮긴다: 남은 황금 도토코인 1개 = 열매 1개(올림), 이미 본 엔딩마다 열매 1개와 공짜 가지, 닿은 도감 보상의 열매, 완납 영수증이 있으면 1개. 황금은 0 이 된다. 본편 저장은 건드리지 않는다.

확인용: `&pdev=lite_end&pend=LE02&pseen=9`(10개째 보상과 공짜 가지), `&prepeat=1`(다시 본 엔딩), `lite_book`, `lite_retire`(완납 영수증), `lite_rebirth&pfruit=6`(나무).
