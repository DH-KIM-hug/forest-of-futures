// 날다람쥐코인 길잡이(라이트, 프롤로그 바로 뒤). 오소리 대부가 빨대를 물고 자기 거래소를 보여 준다.
// 순수한 걸음표: 걸음 순서, 대사(엔진 값을 받아 끼운다), 행동 걸음이 끝났는지, 판이 닫히면 어디로 뛰는지, 건너뛰기를 보여도 되는지.
// 화면(FlyTutorial.tsx)은 이 표를 읽어 말풍선과 스포트라이트를 그리고, 비춘 단추 하나만 눌리게 한다.
// 시세는 짜지 않는다: 진짜 날다람쥐 값 그대로 가고, 판이 지고 있으면 대부도 지고 있다고 말한다.
import { FLY_FAKE_RATE } from '../../../engine/feed/fly';

/** 대부와 다로미. 얼굴 그림은 sprites 의 boss, hero */
export type FtWho = 'boss' | 'hero';
/** text = 아무 데나 누르면 다음. act = 비춘 단추를 진짜로 눌러야 다음. wait = 판이 닫힐 때까지(익절, 손절, 정리하기) */
export type FtKind = 'text' | 'act' | 'wait';
/** pre = 주문 전, hold = 판을 들고 있는 동안, post = 판이 닫힌 뒤 */
export type FtPhase = 'pre' | 'hold' | 'post';

/** 비출 곳. 화면이 선택자로 찾는다(FlyTutorial.tsx TARGETS) */
export type FtTarget =
  | 'flyTab' | 'quote' | 'wind' | 'chart' | 'orders' | 'lev50' | 'lev200' | 'mg25' | 'firstGo' | 'orderBtns'
  | 'posNet' | 'posLiq' | 'close' | 'settle' | 'loan';

/** 대사에 끼우는 값(전부 엔진 값이거나 화면이 지금 본 값) */
export interface FtCtx {
  /** 첫 판 배율 */ lev: number;
  /** 그 배율로 반대로 이만큼(%) 가면 청산 */ liqPct: number;
  /** 다음 정산의 이자와 생활비 */ interest: number; living: number;
  /** 첫 판 익절, 손절 폭(도토리) = 이자 한 번 치 */ claim: number;
  /** 지금 날다람쥐가 기준가보다 올랐나(null = 모름) */ up: boolean | null;
  /** 값 색 규칙: kr = 오르면 빨강, intl = 오르면 초록 */ pc: 'kr' | 'intl';
  /** 차트가 봉(캔들)으로 그려져 있나 */ candles: boolean;
  /** 들고 있는 판의 지금 손익(수수료 포함). 판이 없으면 null */ net: number | null;
  /** 닫힌 판 */ closed: { kind: 'tp' | 'sl' | 'close' | 'liq'; pnl: number } | null;
  /** 길잡이가 도는 사이 정산이 한 번 지나갔다 */ settled: boolean;
}

export interface FtStep {
  id: string; kind: FtKind; phase: FtPhase; who: FtWho; target?: FtTarget;
  /** 말풍선 옆에 붙는 효과음(빨대 소리 등) */ sfx?: string;
  /** 차트에 청산선을 미리 그린다 */ ghostLiq?: boolean;
  line: (c: FtCtx) => string;
}

const n = (x: number) => Math.round(Math.abs(x)).toLocaleString('ko-KR');
const pctTxt = (x: number) => (Math.round(x * 10) / 10).toString();
const tenth = ['', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉'][Math.round(FLY_FAKE_RATE * 10)] ?? String(Math.round(FLY_FAKE_RATE * 10));
const upWord = (c: FtCtx) => (c.pc === 'intl' ? '초록' : '빨강');
const downWord = (c: FtCtx) => (c.pc === 'intl' ? '빨강' : '파랑');

/** 첫 판: 50배, 넣는 돈 25%, 익절과 손절은 이자 한 번 치(FRX 첫 실전 카드와 같은 값) */
export const FT_LEV = 50;
export const FT_PCT = 25;
export const FT_SHOW_LEV = 200;

/** 걸음 전부. 적힌 순서가 나오는 순서다. */
export const FT_STEPS: FtStep[] = [
  // ── 1. 날다람쥐코인이 무엇인가 ──
  { id: 'hi', kind: 'text', phase: 'pre', who: 'boss', line: () => '어서 와요, 다로미 씨. 제 거래소 구경 좀 하죠.' },
  { id: 'fly', kind: 'text', phase: 'pre', who: 'boss', target: 'flyTab', line: () => '이게 날다람쥐코인이에요.' },
  { id: 'fake', kind: 'text', phase: 'pre', who: 'boss', target: 'quote', line: () => '요즘 숲에서 제일 핫한 코인이에요. 누구나 벌 수 있어요.' },
  { id: 'shape', kind: 'text', phase: 'pre', who: 'boss', target: 'wind', line: () => `빠르고, 교과서 모양을 그려요. 열에 ${tenth}은 속임수지만.` },
  // ── 2. 차트 읽기 ──
  { id: 'chart', kind: 'text', phase: 'pre', who: 'boss', target: 'chart', line: (c) => (c.candles ? '봉 하나가 잠깐 동안의 값. 오른쪽 끝이 지금 값이에요.' : '이 선이 값이에요. 오른쪽 끝 점이 지금 값.') },
  { id: 'color', kind: 'text', phase: 'pre', who: 'boss', target: 'quote', line: (c) => `오르면 ${upWord(c)} ▲, 내리면 ${downWord(c)} ▼.${c.up === null ? '' : c.up ? ` 지금은 ${upWord(c)}이네요.` : ` 지금은 ${downWord(c)}이네요.`}` },
  // ── 3. 롱과 숏 ──
  { id: 'dir', kind: 'text', phase: 'pre', who: 'boss', target: 'orders', line: () => '오를 것 같으면 롱. 내릴 것 같으면 숏.' },
  { id: 'dirQ', kind: 'text', phase: 'pre', who: 'hero', target: 'orders', line: () => '내려가도 돈을 번다고요?' },
  { id: 'dirA', kind: 'text', phase: 'pre', who: 'boss', target: 'orders', sfx: '쪼옥', line: () => '맞히기만 하면요.' },
  // ── 4. 배율과 청산선 ──
  { id: 'lev', kind: 'act', phase: 'pre', who: 'boss', target: 'lev50', line: (c) => `배율은 ${c.lev}배로 하죠. 눌러 봐요.` },
  { id: 'lev200', kind: 'text', phase: 'pre', who: 'boss', target: 'lev200', line: () => `${FT_SHOW_LEV}배도 있어요. 발도장 하나면 열려요. 그건 나중에.` },
  { id: 'liq', kind: 'text', phase: 'pre', who: 'boss', target: 'chart', ghostLiq: true, line: (c) => `빨간 줄이 청산선. ${c.lev}배면 반대로 ${pctTxt(c.liqPct)}%만 가도 건 돈이 다 사라져요.` },
  { id: 'liqQ', kind: 'text', phase: 'pre', who: 'hero', target: 'chart', ghostLiq: true, line: () => '사라진 돈은 어디로 가요?' },
  { id: 'liqA', kind: 'text', phase: 'pre', who: 'boss', target: 'chart', ghostLiq: true, sfx: '쪼옥', line: () => '…….' },
  // ── 5. 증거금 ──
  { id: 'mg', kind: 'act', phase: 'pre', who: 'boss', target: 'mg25', line: () => `넣을 돈은 ${FT_PCT}%만. 전부 거는 손님은 제가 제일 좋아하고요.` },
  // ── 6. 익절과 손절 ──
  { id: 'stops', kind: 'act', phase: 'pre', who: 'boss', target: 'firstGo', line: (c) => `익절 손절은 한 번에. +${n(c.claim)}에 나오고, −${n(c.claim)}에 나와요.` },
  // ── 7. 주문하고 지켜보기 ──
  { id: 'order', kind: 'act', phase: 'pre', who: 'boss', target: 'orderBtns', line: () => '이제 롱이나 숏. 감 가는 쪽으로.' },
  { id: 'pnl', kind: 'text', phase: 'hold', who: 'boss', target: 'posNet', line: (c) => (c.net === null ? '이 숫자가 지금 손익이에요.' : c.net >= 0 ? `이 숫자가 지금 손익. 벌써 +${n(c.net)}이네요.` : `이 숫자가 지금 손익. −${n(c.net)}. 그런 날도 있죠.`) },
  { id: 'posLiq', kind: 'text', phase: 'hold', who: 'boss', target: 'posLiq', line: () => '청산까지 남은 거리. 이게 0이 되면 끝이에요.' },
  // ── 8. 닫기(한 번 누르기, 아니면 익절 손절이 알아서) ──
  { id: 'wait', kind: 'wait', phase: 'hold', who: 'boss', target: 'close', line: (c) => `익절이나 손절에 닿으면 알아서 닫혀요. 급하면 정리하기 한 번.${c.net === null ? '' : c.net >= 0 ? ` 지금 +${n(c.net)}.` : ` 지금 −${n(c.net)}. 그런 날도 있죠.`}` },
  { id: 'result', kind: 'text', phase: 'post', who: 'boss', line: resultLine },
  { id: 'resultHero', kind: 'text', phase: 'post', who: 'hero', line: (c) => (c.closed && c.closed.pnl > 0 ? '이거… 되는데?' : '…다음 판은 다르다.') },
  // ── 9. 정산과 빚 ──
  { id: 'settle', kind: 'text', phase: 'post', who: 'boss', target: 'settle', line: (c) => (c.settled ? `방금 한 번 걷어 갔죠. 1분마다 이자 ${n(c.interest)}, 생활비 ${n(c.living)}.` : `이 막대가 차면 정산. 1분마다 이자 ${n(c.interest)}, 생활비 ${n(c.living)}.`) },
  { id: 'loan', kind: 'text', phase: 'post', who: 'boss', target: 'loan', line: () => '빚 갚기와 더 빌리기는 여기, 대출에서요.' },
  { id: 'bye', kind: 'text', phase: 'post', who: 'boss', sfx: '쪼옥', line: () => '그럼 마음대로 해 봐요.' },
];

function resultLine(c: FtCtx): string {
  const r = c.closed;
  if (!r) return '닫혔네요.';
  if (r.kind === 'liq') return '청산. 건 돈은… 잘 받았어요.';
  if (r.kind === 'tp') return `익절. +${n(r.pnl)}. 이자 한 번 치 벌었네요.`;
  if (r.kind === 'sl') return `손절. −${n(r.pnl)}. 그런 날도 있죠. 딱 정한 만큼만.`;
  return r.pnl >= 0 ? `정리. +${n(r.pnl)}. 챙길 땐 챙기는 거죠.` : `정리. −${n(r.pnl)}. 그런 날도 있죠.`;
}

export const FT_IDS = FT_STEPS.map((s) => s.id);
export const ftIndex = (id: string): number => FT_IDS.indexOf(id);
export const FT_FIRST_HOLD = ftIndex('pnl');
export const FT_RESULT = ftIndex('result');

/** 행동 걸음의 화면 상태 */
export interface FtUi { lev: number | null; pct: number; keep: boolean; tpK: number | null; slK: number | null; hasPos: boolean; closed: boolean }

/** 행동 걸음이 끝났는가: 비춘 단추를 진짜로 눌렀고(tapped), 그 결과가 화면에 들어갔다. wait 는 판이 닫히면(누르지 않아도) 끝 */
export function ftActDone(id: string, u: FtUi, tapped: boolean): boolean {
  switch (id) {
    case 'lev': return tapped && u.lev === FT_LEV;
    case 'mg': return tapped && u.pct === FT_PCT && !u.keep;
    case 'stops': return tapped && u.tpK === 1 && u.slK === 1;
    case 'order': return u.hasPos || u.closed; // 누르는 순간 판이 열린다(눌린 단추만 받으니 tapped 와 같다)
    case 'wait': return u.closed;
    default: return true;
  }
}

/** 지금 걸음 다음은 어디인가. 판이 닫혔는데 아직 들고 있는 걸음이면 결과로 뛴다. 끝이면 -1 */
export function ftNext(i: number, closed: boolean): number {
  const st = FT_STEPS[i];
  if (!st) return -1;
  if (closed && st.phase === 'hold') return FT_RESULT;
  return i + 1 < FT_STEPS.length ? i + 1 : -1;
}

/** 판이 지금 닫혀 있는데 들고 있는 걸음에 있으면 결과로(아무 때나 부른다) */
export function ftJump(i: number, closed: boolean): number {
  return closed && FT_STEPS[i]?.phase === 'hold' ? FT_RESULT : i;
}

/** 다시 열었을 때(새로 고침) 어디서부터: 판을 들고 있으면 손익부터, 아니면 처음부터 */
export const ftResume = (hasPos: boolean): number => (hasPos ? FT_FIRST_HOLD : 0);

// ── 끝까지 본 적(이 기기). 그때부터 [건너뛰기]가 보인다 ──────────────────────
export const FT_SEEN_KEY = 'fof.lite.flytut.v1';
export const ftSeenBefore = (): boolean => { try { return localStorage.getItem(FT_SEEN_KEY) === '1'; } catch { return false; } };
export const markFtSeen = (): void => { try { localStorage.setItem(FT_SEEN_KEY, '1'); } catch { /* 저장이 막힌 창 */ } };

/** 저장 칸(useProto.flyTut, PROTO_KEEP): off = 안 돈다, run = 도는 중, done = 끝까지 봤다, skip = 건너뛰었다 */
export type FlyTutState = 'off' | 'run' | 'done' | 'skip';
