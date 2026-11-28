# 라이트 글자 체계

라이트 화면에 쓰는 글꼴은 두 개뿐이다. 새 CSS 는 아래 두 변수만 쓴다.

| 변수 | 글꼴 | 쓰는 곳 |
|---|---|---|
| `--font-display` | Jua, 굵기 400 하나 | 큰 숫자(돈, 수익률, 남은 시간), 제목, 단추 글, 효과음, 대사 말풍선, 만화 손글씨 |
| `--font-body` | 기기 글꼴 | 문장, 작은 글씨(이름표, 단위, 계산식, 「눌러서 계속」), 만화 내레이션, tag 글상자, box 글상자 |

정의는 `src/ui/proto/proto.css` 맨 위 `:root` 에 있다.

```css
--font-display: 'Jua', 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif;
--font-body: -apple-system, BlinkMacSystemFont, system-ui, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif;
```

옛 이름 `--dsp` 는 `--font-display` 를 가리키게 남겨 두었다. 새로 쓰지 않는다.

## 규칙

1. 글꼴 이름을 직접 적지 않는다. `-apple-system`, `system-ui`, `sans-serif` 를 규칙 안에 적으면 시험(`tests/ui/lite_type.test.ts`)이 걸린다.
2. Jua 는 굵기가 400 하나뿐이다. `.pr` 에 `font-synthesis: style` 을 두어 브라우저가 가짜 굵기를 입히지 못하게 했다. 그래서 Jua 글자에 `font-weight: 800` 을 주어도 400 으로 그려진다. Jua 에 굵기를 새로 주지 않는다. 강조는 크기나 색으로 한다.
3. 바뀌는 숫자는 `tabular-nums`. `.pr` 전체에 걸어 두었다. 다만 Jua 에는 같은 폭 숫자가 없어서(잰 값: 40px 에서 「1111」 66px, 「8888」 93px, tabular-nums 를 줘도 같음) Jua 로 쓰는 남은 시간, 가격은 자리 폭이 흔들린다. 흔들림이 거슬리는 칸은 `min-width` 를 주거나 `--font-body` 로 바꾼다.
4. 본문 글꼴 맨 앞에 `-apple-system, BlinkMacSystemFont, system-ui` 를 둔다. 맥 크롬은 `-apple-system` 을 모르므로 이것이 없으면 숫자가 Apple SD Gothic Neo 로 나오고, 이 글꼴에는 같은 폭 숫자가 없다.
5. 한 글꼴만 예외: `tradeArt.css` 의 「i」 정보 표시는 Georgia 이탤릭이다. 글이 아니라 아이콘이라 둔다.

## 크기(목표, 아직 다 맞추지 않음)

역할마다 크기를 3~4개로 줄이는 것이 목표다. 지금 화면에서 잰 크기는 이렇다(390×844, 장면 11개, 글이 있는 요소 수).

- Jua: 12.5px 112, 16px 74, 25px 63, 14.5px 53, 14px 46, 15px 38, 12px 32, 17px 26, 18px 24, 13px 22, 30px 18 외 20가지
- 본문: 10px 106, 12.5px 96, 12px 55, 11.5px 51, 10.5px 39, 11px 24, 9px 20, 14px 18 외 6가지

정리할 때 쓸 크기:

| 역할 | 크기 |
|---|---|
| 표시용 큰 숫자 | 32, 25 |
| 표시용 제목, 단추 | 18, 16 |
| 표시용 작은 표(칩, 꼬리표) | 14, 12.5 |
| 본문 | 14, 12.5, 11 |

본문은 11px 아래로 내리지 않는다. 지금 9px, 10px 이 120곳쯤 있어 다음 정리 때 11px 로 올린다(칸 넘침을 같이 본다).

## 글꼴 불러오기

- Jua 는 `src/main.tsx` 에서 `@fontsource/jua` 의 korean-400, latin-400 (woff2, 한글 약 360KB)을 한 번 부른다.
- 예전에는 `src/ui/styles.css` 의 `@font-face` 가 `public/fonts/Jua-Regular.ttf`(2.1MB)를 한 번 더 불렀다. 그 파일과 선언은 뺐다. 라이선스 `public/fonts/OFL.txt` 는 남긴다.
- 라이트가 부르지 않는 글꼴(`Nanum Pen Script` 등)은 적지 않는다. 만화 손글씨(`.lp-w.hand`)는 `--font-display` 다.

## 고친 것(이번 정리)

- `var(--dsp)` 를 `var(--font-display)` 로, 기기 글꼴을 직접 적은 11곳과 `var(--body, inherit)` 3곳을 `var(--font-body)` 로 바꿨다.
- `.pr-wal .x` 의 `font: 700 15px sans-serif` 도 `--font-body`.
- 대사 말풍선은 Jua, 이름표와 「눌러서 계속」은 본문 글꼴로 둔다(작은 글씨 규칙). 정산 막대도 「정산」과 이자 계산식은 본문, 남은 시간은 Jua 로 둔다.
- 가짜 굵기가 들던 곳(바람 꼬리표 「잔바람」, 「3분」, 시세 ▼, 대출 화면 빚 금액 등 32곳)은 이제 Jua 400 으로 그려진다.
