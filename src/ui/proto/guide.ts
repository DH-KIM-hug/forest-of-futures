// 튜토리얼 대사 v1(DECISIONS_LOG U-32, docs/gdd/STORY_ACT1.md "튜토리얼 대사 v1").
// 처음 하는 사람이 그것이 처음 필요해지는 순간에 한 줄씩 듣는 설명. 인물의 말투로 말하고, 설명하는 화면 조각을 비춘다(data-hl).
// 한 줄(tip)은 평생 한 번만 나온다: 본 줄은 localStorage 에 적어 두고, &prologue=1 이나 &guide=1 로 지운다. &guide=0 은 전부 끈다.
// 숫자는 엔진 값을 받아 끼운다(TipArgs = model.ts tipArgs). 이 파일은 엔진·저장소를 부르지 않는다(시험이 그대로 읽는다).
import type { Line, Tab, Who } from './protoStore';

/** 비출 수 있는 화면 조각: 화면 쪽에 data-hl="<이름>" 이 붙어 있다. tab 이 있으면 그 탭에서만 보인다(다른 탭이면 그 탭으로 넘긴다).
 *  panel 이 있으면 집 아래 판을 그 상태로 맞춘다(U-34: closed = 접힌 채 세상이 크게, open = 쳇바퀴 자리 칸이 펴진 채). */
export const HL = {
  rig: { tab: 'lot', panel: 'closed', label: '채굴기(U-43)' },
  acorn: { label: '가진 도토리 숫자' },
  goal: { tab: 'lot', panel: 'closed', label: '목표 막대' },
  debt: { label: '빚 칩(빚, 이자, 생활비)' },
  ps: { label: '초당 수입 칩(1초마다 들어오는 돈만)' },
  office: { tab: 'map', label: '오소리 사무소 카드' },
  borrow: { tab: 'map', label: '빌리기 단추' },
  pay: { tab: 'map', label: '갚기 단추' },
  tileFirst: { tab: 'lot', panel: 'open', label: '엄마의 쳇바퀴 칸(알바 부르기)' },
  tileEmpty: { tab: 'lot', panel: 'open', label: '빈 자리 칸(쳇바퀴 놓기)' },
  orders: { tab: 'phone', label: '롱, 숏 단추' },
  mg: { tab: 'phone', label: '증거금 비율 칩' },
  ruler: { tab: 'phone', label: '배율 눈금' },
  risk: { tab: 'phone', label: '증거금, 청산 줄' },
  cond: { tab: 'phone', label: '손절, 익절 줄' },
  posNet: { tab: 'phone', label: '내 포지션의 손익(수수료 포함)' },
  posLiq: { tab: 'phone', label: '내 포지션의 청산까지' },
} satisfies Record<string, { tab?: Tab; panel?: 'open' | 'closed'; label: string }>;
export type HlKey = keyof typeof HL;
export const hlSel = (k: HlKey): string => `[data-hl="${k}"]`;
export const hlTab = (k: HlKey): Tab | undefined => (HL[k] as { tab?: Tab }).tab;
export const hlPanel = (k: HlKey): 'open' | 'closed' | undefined => (HL[k] as { panel?: 'open' | 'closed' }).panel;

/** 대사에 끼우는 숫자(전부 엔진 값) */
export interface TipArgs {
  /** 탭 한 번에 캐는 값 */ tap: number;
  /** 다음 정산에 걷어 갈 돈(이자 + 생활비) */ claim: number;
  /** 생활비 */ living: number;
  /** 알바 일당 */ wage: number;
  /** 쳇바퀴 한 대 값 */ wheel: number;
  /** 사무소에서 한 번에 빌려주는 돈 */ lend: number;
  /** 그 돈의 정산당 금리(%) */ rate: number;
  /** 지금 빚 */ debt: number;
  /** 튜토리얼 거래 배율 */ lev: number;
}

export type Moment = 'home' | 'hud' | 'map' | 'hamster' | 'exchange' | 'goal' | 'position';
/** 그 설명이 나오는 때(문서 표와 보고에 쓴다) */
export const MOMENT: Record<Moment, string> = {
  home: '프롤로그가 끝나고 집 화면이 처음 뜰 때',
  hud: '쳇바퀴를 12번 굴린 뒤',
  map: '지도 탭을 처음 열었을 때(빌리기 전)',
  hamster: '폰을 받은 뒤 첫 정산 직후(족제비 상인)',
  exchange: '거래소 탭을 처음 열었을 때',
  goal: '첫 주문 전표(뒷면)를 닫은 직후(통화가 끝난 뒤)',
  position: '첫 실전 판이 닫힌 뒤 다음 포지션을 열었을 때',
};

const n = (x: number) => Math.round(x).toLocaleString('ko-KR');
const man = (x: number) => (x % 10000 === 0 ? `${x / 10000}만` : n(x));
/** 1~10 은 셈말로("두 알"), 그 밖은 숫자 */
export const count = (x: number): string => ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열'][x] ?? n(x);
const num = (x: number): string => ['', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열'][x] ?? n(x);

interface TipDef { moment: Moment; who: Who; hl?: HlKey; mood?: Line['mood']; text: (o: TipArgs) => string }
const t = (moment: Moment, who: Who, text: TipDef['text'], hl?: HlKey, mood?: Line['mood']): TipDef => ({ moment, who, text, hl, mood });

/** 튜토리얼 대사 전부. 적힌 순서가 곧 나오는 순서다. */
export const TIPS = {
  // ── 집: 쳇바퀴가 무엇인가, 정산이 무엇인가(추심원이 문간에서) ──
  'home.tap': t('home', 'collector', () => '저기 불 들어왔죠? 바퀴 밟는 동안에만 저놈이 코인을 캐요.', 'rig'),
  'home.acorn': t('home', 'collector', (o) => `${count(o.tap)} 알 들어왔죠? 어머님이 캐는 대로 팔리게 해 두셨어요.`, 'acorn'),
  'home.claim': t('home', 'collector', (o) => `이자 ${n(o.claim - o.living)}, 생활비 ${n(o.living)}. 종 치면 ${n(o.claim)} 가지러 올게요.`, 'goal'),
  'home.go': t('home', 'hero', (o) => `한 번에 ${num(o.tap)}. …일단 밟자.`),
  // ── 집: 빚 칸과 초당(추심원이 떠난 뒤, 숫자 곁의 도움말) ──
  'hud.debt': t('hud', 'note', (o) => `이자만 내면 원금 ${man(o.debt)}은 그대로다. 원금을 갚으면 이 숫자가 줄어든다.`, 'debt'),
  'hud.ps': t('hud', 'note', () => '초당은 알바가 버는 돈. 「정산 때」는 종이 울릴 때 한꺼번에 낼 돈.', 'ps'),
  // ── 지도: 빌리고 갚는 곳 ──
  'map.office': t('map', 'note', () => '사무소 문이 열린다. 대부가 맞은편 의자에서 장부를 들어 자리를 내준다.', 'office'),
  'map.borrow': t('map', 'note', (o) => `빌리는 돈 +${n(o.lend)}, 이자 ${o.rate}%. 오늘부터 정산마다 +${n((o.lend * o.rate) / 100)}.`, 'borrow'),
  'map.pay': t('map', 'note', () => '갚을 때는 금리가 높은 빚부터 줄어요.', 'pay'),
  // ── 알바 햄스터, 쳇바퀴(족제비 상인) ──
  'ham.what': t('hamster', 'weasel', () => '맡기시면 손 떼셔도 돼요. 한 바퀴에 한 마리씩.', 'tileFirst', 'smile'),
  'ham.quit': t('hamster', 'weasel', () => '품삯이 밀리면 제가 데리러 와요. 얘들도 먹고살아야죠.', 'tileFirst', 'smile'),
  'ham.wheel': t('hamster', 'weasel', (o) => `보조 쳇바퀴를 놓으면 한 마리 더 쓰실 수 있어요. 한 대 ${n(o.wheel)}.`, 'tileEmpty', 'smile'),
  // ── 거래소: 첫 주문(사무소에 건 전화) ──
  'fx.lev': t('exchange', 'boss', (o) => `배율은 ${o.lev}배로 걸려 있어요. 1% 움직이면 거신 돈은 ${o.lev}% 움직여요.`, 'ruler', 'smile'),
  'fx.liq': t('exchange', 'boss', (o) => `반대로 약 ${Math.round(100 / o.lev)}% 움직이면 거신 돈을 모두 잃어요.`, 'risk', 'smile'),
  'fx.ask': t('exchange', 'hero', () => '그럼 내가 골랐을 때보다 값이 떨어지면요?'),
  'fx.dir': t('exchange', 'boss', () => '더 내린다 싶으면 숏 누르세요. 도로 오르겠다 싶으면 롱.', 'orders', 'smile'),
  // ── 통화가 끝난 뒤(진짜 시세): 이제 직접 고르는 것 ──
  'goal.real': t('goal', 'hero', () => '이번엔 수금할 돈부터 빼 두자.'),
  'fx.margin': t('goal', 'note', () => '「정산 빼고」는 다음 정산에 낼 돈을 남겨 두고 나머지를 걸어요.', 'mg'),
  'fx.stops': t('goal', 'note', () => '손절과 익절: 손실을 끊을 가격과 이익을 챙길 가격을 미리 정할 수 있어요.', 'cond'),
  // ── 첫 진짜 포지션 ──
  // U-55: 첫 실전 판은 설명 없이 지켜본다. 이 두 줄은 그 판이 닫힌 뒤 다음 포지션에서(네 줄 → 두 줄)
  'pos.net': t('position', 'note', () => '큰 숫자는 지금 [정리하기]를 누르면 남는 손익. 수수료까지 뺐다.', 'posNet'),
  'pos.liq': t('position', 'note', () => '청산까지 남은 거리. 점이 차오를수록 가깝고, 0이면 건 돈이 다 사라진다.', 'posLiq'),
} satisfies Record<string, TipDef>;
export type TipId = keyof typeof TIPS;
export const TIP_IDS = Object.keys(TIPS) as TipId[];

/** 설명 한 줄(대사). 이미 본 줄은 장면에 넣을 때 걸러진다(protoStore pushScene). */
export function T(id: TipId, o: TipArgs): Line {
  const d: TipDef = TIPS[id];
  return { who: d.who, text: d.text(o), mood: d.mood, tip: id, hl: d.hl };
}
/** 한 때(moment)의 설명 전부 */
export const tipsOf = (m: Moment): TipId[] => TIP_IDS.filter((id) => (TIPS[id] as TipDef).moment === m);
export const tips = (m: Moment, o: TipArgs): Line[] => tipsOf(m).map((id) => T(id, o));

// ── 본 줄 기록(평생 한 번) ──────────────────────────────────────────────────
export const GUIDE_KEY = 'fof.proto.guide.v1';
let seen: Set<string> | null = null;
let off = false;
function load(): Set<string> {
  if (seen) return seen;
  seen = new Set();
  try { const raw = localStorage.getItem(GUIDE_KEY); if (raw) for (const k of JSON.parse(raw) as string[]) seen.add(k); } catch { /* 저장소 없음·막힘: 이번 실행 동안만 기억한다 */ }
  return seen;
}
export const tipSeen = (id: string): boolean => off || load().has(id);
export function markTip(id: string): void {
  const s = load();
  if (s.has(id)) return;
  s.add(id);
  try { localStorage.setItem(GUIDE_KEY, JSON.stringify([...s])); } catch { /* 저장소 막힘 */ }
}
/** 그 때의 설명 중 아직 안 본 줄이 남았는가 */
export const tipsLeft = (m: Moment): boolean => !off && tipsOf(m).some((id) => !load().has(id));
/** 설명을 처음부터 다시(&prologue=1, &guide=1) */
export function resetGuide(): void {
  seen = new Set();
  try { localStorage.removeItem(GUIDE_KEY); } catch { /* 저장소 막힘 */ }
}
/** 설명을 전부 끈다(&guide=0, 장면 건너뛰기 pdev) */
export function setGuideOff(v: boolean): void { off = v; }
