# 라이트 그림 아이콘 (U-67)

손으로 그린 작은 SVG 를 캐릭터, 코인과 같은 그림체의 그림 아이콘으로 바꾼다.
U-66 이후 라이트만 보이므로 라이트 화면에 보이는 것만 다룬다.

- 원본 판: `docs/art/v5/icons/sheet1.png` (codex, 4x3, 투명). 프롬프트 `docs/art/v5/prompts/icons_sheet1.txt`, 참고 그림 `golden/coins/DTC.png`, `golden/hero_phone.png`
- 오리기: `python3 docs/art/v5/mkweb_icons.py <repo>` → `src/ui/proto/img/icons/*.webp` (긴 쪽 96px 이하, 모든 칸 같은 배율이라 켬/끔, 잠김/열림 짝의 크기가 같다)
- 쓰는 법: `src/ui/proto/icons.tsx` 의 `<GIcon name size />`, innerHTML 자리는 `iconHtml(name, size)`. 크기 규칙은 `icons.css`

## 바꾼 것 (첫 판 12개)

| 그림 | 자리 | 코드 |
|---|---|---|
| phone | 아래 탭 「거래소」 (본편 탭도 같은 부품) | `art.tsx` RowIcon 'phone' |
| loan | 아래 탭 「대출」 | `ProtoApp.tsx` (LiteLoan.tsx 의 LoanIcon 은 그대로 두고 탭에서만 바꿔 끼움) |
| board, book, news | 머리의 전광판, 엔딩 도감, 도토리일보 | `lite/LiteHud.tsx` HudIcons. 잠긴 전광판은 회색조 |
| sound_on, sound_off | 소리 단추 | `AudioUi.tsx` Speaker |
| acorn | 손의 돈, 날아가는 도토리, 도토리 비 | `art.tsx` Acorn, acornSvg. 공유 카드(캔버스)만 `acornVecSvg` 로 예전 SVG |
| lock | 거래소 잠김 상자, 배율 칸의 잠김 | `Trade.tsx` Lock |
| lock, unlock | 전광판 자물쇠 판, 첫 완납 축하 | `ranking.css` `.lock` (CSS 로 그리던 것을 그림으로) |
| dice | 서명지 별명 「섞기」 | `NameSign.tsx` (🎲 이모지) |
| fruit | 나무 열매, 날아가는 열매 | `lite/Fruit.tsx` FRUIT_SVG |

## 두 번째 판으로 미룬 것

- 발도장 두 곳: 반전 카드, 서명지
- 나무 칩의 잎

## 그대로 둔 것

- ▲▼ 세모, 꺾쇠, 체크, 닫기 X: 9~14px 기능 글리프이고 오르내림에 따라 글자색을 따라가야 한다
- 정보 「i」 배지: 글자다
- 돌풍 막대: 세기를 보여 주는 게이지다
- 폰 고리 리본: 흔들리는 소품이고 색을 CSS 로 바꾼다
- 차트, 심전도 줄, 반신 그림, 말풍선: 범위 밖
- 숲 게시판: SVG 아이콘이 없다. 얼굴은 이미 그림이다
