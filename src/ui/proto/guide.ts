// 튜토리얼 대사 v1(DECISIONS_LOG U-32, docs/gdd/STORY_ACT1.md "튜토리얼 대사 v1").
// 처음 하는 사람이 그것이 처음 필요해지는 순간에 한 줄씩 듣는 설명. 인물의 말투로 말하고, 설명하는 화면 조각을 비춘다(data-hl).
// 한 줄(tip)은 평생 한 번만 나온다: 본 줄은 localStorage 에 적어 두고, &prologue=1 이나 &guide=1 로 지운다. &guide=0 은 전부 끈다.
// 숫자는 엔진 값을 받아 끼운다(TipArgs = model.ts tipArgs). 이 파일은 엔진·저장소를 부르지 않는다(시험이 그대로 읽는다).
import type { Line, Tab, Who } from './protoStore';

/** 비출 수 있는 화면 조각: 화면 쪽에 data-hl="<이름>" 이 붙어 있다. tab 이 있으면 그 탭에서만 보인다(다른 탭이면 그 탭으로 넘긴다). */
export const HL = {
  tap: { tab: 'lot', label: '쳇바퀴 굴리기 줄' },
  acorn: { label: '가진 도토리 숫자' },
  settle: { tab: 'lot', label: '정산 막대' },
  goal: { tab: 'lot', label: '목표 막대' },
  debt: { label: '빚 칩(빚 · 이자 · 생활비)' },
  ps: { label: '초당 수입 칩' },
  wallet: { label: '지갑(콜드월렛) 칩' },
  tabMap: { label: '지도 탭' },
  office: { tab: 'map', label: '오소리 사무소 카드' },
  borrow: { tab: 'map', label: '빌리기 단추' },
  pay: { tab: 'map', label: '갚기 단추' },
  rowFirst: { tab: 'lot', label: '엄마의 쳇바퀴 줄(알바 부르기)' },
  rowEmpty: { tab: 'lot', label: '빈 자리 줄(쳇바퀴 놓기)' },
  sum: { tab: 'lot', label: '버는 돈 < > 나가는 돈 줄' },
  coins: { tab: 'phone', label: '거래소 종목 줄' },
  chart: { tab: 'phone', label: '거래소 차트' },
  orders: { tab: 'phone', label: '롱 · 숏 단추' },
  mg: { tab: 'phone', label: '증거금 비율 칩' },
  ruler: { tab: 'phone', label: '배율 눈금' },
  risk: { tab: 'phone', label: '증거금 · 청산 줄' },
  cond: { tab: 'phone', label: '손절 · 익절 줄' },
  posLiq: { tab: 'phone', label: '내 포지션의 청산까지' },
  closeBtn: { tab: 'phone', label: '정리하기 단추' },
} satisfies Record<string, { tab?: Tab; label: string }>;
export type HlKey = keyof typeof HL;
export const hlSel = (k: HlKey): string => `[data-hl="${k}"]`;
export const hlTab = (k: HlKey): Tab | undefined => (HL[k] as { tab?: Tab }).tab;

/** 대사에 끼우는 숫자(전부 엔진 값) */
export interface TipArgs {
  /** 탭 한 번에 캐는 값 */ tap: number;
  /** 다음 정산에 걷어 갈 돈(이자 + 생활비) */ claim: number;
  /** 생활비 */ living: number;
  /** 알바 일당 */ wage: number;
  /** 쳇바퀴 한 대 값 */ wheel: number;
  /** 사무소에서 한 번에 빌려주는 돈 */ lend: number;
  /** 지금 빚 */ debt: number;
  /** 튜토리얼 거래 배율 */ lev: number;
}

export type Moment = 'home' | 'hud' | 'come' | 'map' | 'office' | 'settle' | 'hamster' | 'exchange' | 'liquidated' | 'goal' | 'position';
/** 그 설명이 나오는 때(문서 표와 보고에 쓴다) */
export const MOMENT: Record<Moment, string> = {
  home: '프롤로그가 끝나고 집 화면이 처음 뜰 때',
  hud: '쳇바퀴를 12번 굴린 뒤',
  come: '첫 정산 직전, 추심원이 왔는데 돈이 모자랄 때',
  map: '지도 탭을 처음 열었을 때(빌리기 전)',
  office: '오소리 사무소에서 처음 빌렸을 때',
  settle: '빌린 뒤 첫 정산',
  hamster: '폰을 받은 뒤 첫 정산 직후(족제비 상인)',
  exchange: '거래소 탭을 처음 열었을 때',
  liquidated: '튜토리얼 거래가 청산된 직후',
  goal: '"튜토리얼 끝" 알림을 닫은 직후',
  position: '진짜 시세로 첫 포지션을 열었을 때',
};

const n = (x: number) => Math.round(x).toLocaleString('ko-KR');
const man = (x: number) => (x % 10000 === 0 ? `${x / 10000}만` : n(x));

interface TipDef { moment: Moment; who: Who; hl?: HlKey; mood?: Line['mood']; text: (o: TipArgs) => string }
const t = (moment: Moment, who: Who, text: TipDef['text'], hl?: HlKey, mood?: Line['mood']): TipDef => ({ moment, who, text, hl, mood });

/** 튜토리얼 대사 전부. 적힌 순서가 곧 나오는 순서다. */
export const TIPS = {
  // ── 집: 쳇바퀴가 무엇인가, 정산이 무엇인가 ──
  'home.tap': t('home', 'collector', () => '가기 전에 하나만요오. 여기를 누르면 쳇바퀴가 돌아요오.', 'tap'),
  'home.mine': t('home', 'collector', () => '돌면 전기가 생기고, 그 전기로 도토코인을 캐요오.', 'tap'),
  'home.tiny': t('home', 'collector', (o) => `한 번 누르면 ${n(o.tap)}어치. 혼자 굴리면 그 정도예요오.`, 'tap', 'flat'),
  'home.acorn': t('home', 'collector', () => '캔 코인은 바로 팔려서 도토리가 돼요오. 이게 가진 돈.', 'acorn'),
  'home.settle': t('home', 'collector', () => '이 막대가 다 차면 정산이에요오. 제가 걷으러 와요오.', 'settle'),
  'home.claim': t('home', 'collector', (o) => `이자에 생활비까지 ${n(o.claim)}. 그때까지 모아 두세요오.`, 'goal'),
  'home.overdue': t('home', 'collector', () => '못 내면 연체. 쳇바퀴에 딱지 붙이고, 다음엔 실어 가요오.', 'goal', 'flat'),
  'home.go': t('home', 'hero', (o) => `…한 번에 ${n(o.tap)}. 일단 굴리자.`),
  // ── 집: 빚 칩 · 초당 · 지갑 ──
  'hud.debt': t('hud', 'collector', () => '아, 하나 깜빡했네요오. 이 빨간 숫자가 빚이에요오.', 'debt'),
  'hud.notcash': t('hud', 'collector', () => '갚을 돈이지 쓸 돈이 아니에요오. 쓸 수 있는 건 도토리뿐.', 'debt', 'flat'),
  'hud.interest': t('hud', 'collector', () => '그 밑이 정산마다 낼 이자. 빚이 늘면 이자도 늘어요오.', 'debt'),
  'hud.ps': t('hud', 'collector', () => "'초당'은 1초에 남는 돈. 빨간색이면 새는 중이에요오.", 'ps'),
  'hud.wallet': t('hud', 'collector', () => '지갑은 코인을 안 팔고 모으는 곳. 지금은 바로 팔려서 0.', 'wallet'),
  // ── 추심원이 왔다: 왜 모자란가, 왜 사무소에 가는가 ──
  'come.why': t('come', 'collector', () => '혼자 굴려서는 원래 안 돼요오. 다들 일꾼을 써요오.', undefined, 'flat'),
  'come.loan': t('come', 'collector', () => '빌린 돈으로 일꾼을 부르면 숨통이 트여요오. 이자는 늘지만요.', undefined, 'smile'),
  'come.away': t('come', 'collector', () => '돌려보내셔도 돼요오. 그럼 연체. 쳇바퀴에 딱지 붙어요오.', undefined, 'flat'),
  // ── 지도: 빌리고 갚는 곳 ──
  'map.tab': t('map', 'note', () => '지도 탭이 열렸다. 돈을 빌리거나 갚을 때 여기로 온다.', 'tabMap'),
  'map.office': t('map', 'note', (o) => `오소리 사무소. 엄마가 남긴 빚 ${man(o.debt)}이 이곳 장부에 있다.`, 'office'),
  'map.borrow': t('map', 'note', (o) => `[빌리기]를 누르면 ${man(o.lend)}을 받는다. 빚과 이자도 그만큼 는다.`, 'borrow'),
  'map.pay': t('map', 'note', () => '[갚기]는 원금을 줄인다. 원금이 줄면 이자도 준다.', 'pay'),
  // ── 사무소 ──
  'office.rule': t('office', 'boss', () => '빌릴수록 이자가 늘고, 갚으면 줍니다. 여기 적혀 있죠?', 'debt', 'smile'),
  // ── 첫 정산 ──
  'settle.what': t('settle', 'collector', (o) => `생활비 ${n(o.living)}도 같이 걷었어요오. 막대가 차면 또 와요오.`, 'settle'),
  // ── 알바 햄스터 · 쳇바퀴 ──
  'ham.what': t('hamster', 'weasel', () => '햄스터가 쳇바퀴에 들어가면, 손을 떼도 혼자 돌아요~', 'rowFirst', 'smile'),
  'ham.quit': t('hamster', 'weasel', () => '대신 일당을 못 받으면 말없이 나가요~ 깔끔하죠~', 'rowFirst', 'smile'),
  'ham.wheel': t('hamster', 'weasel', (o) => `쳇바퀴는 한 대 ${n(o.wheel)}. 사 두면 사장님 재산이에요~`, 'rowEmpty', 'smile'),
  'ham.pair': t('hamster', 'weasel', () => '단, 쳇바퀴 한 대에 햄스터 한 마리. 빈 쳇바퀴는 안 돌아요~', 'rowEmpty', 'smile'),
  'ham.sum': t('hamster', 'weasel', () => '이 줄만 보세요~ 왼쪽이 버는 돈, 오른쪽이 나가는 돈이에요~', 'sum', 'smile'),
  'ham.live': t('hamster', 'weasel', () => '왼쪽이 더 크면 가만있어도 살아요~ 아니면 굴리셔야죠~', 'sum', 'smile'),
  // ── 거래소 ──
  'fx.coins': t('exchange', 'boss', () => '도토코인, 밤더리움… 숲의 코인들입니다. 값이 쉬지 않고 움직여요.', 'coins', 'smile'),
  'fx.what': t('exchange', 'boss', () => '선물은 내기입니다. 값이 오를지 내릴지에 도토리를 걸어요.', 'chart', 'smile'),
  'fx.dir': t('exchange', 'boss', () => '오를 것 같으면 롱, 내릴 것 같으면 숏. 맞히면 법니다.', 'orders', 'smile'),
  'fx.margin': t('exchange', 'boss', () => '증거금은 거는 돈입니다. 가진 도토리의 몇 %를 걸지 고르세요.', 'mg', 'smile'),
  'fx.lev': t('exchange', 'boss', (o) => `배율은 판을 키웁니다. ${o.lev}배면 1% 움직일 때 ${o.lev}%를 벌거나 잃어요.`, 'ruler', 'smile'),
  'fx.liq': t('exchange', 'boss', (o) => `${o.lev}배면 ${Math.round(100 / o.lev)}% 반대로 가면 넣은 돈이 다 사라져요. 그게 청산.`, 'risk', 'smile'),
  'fx.stops': t('exchange', 'boss', () => '손절·익절은 미리 정해 두는 출구입니다. 닿으면 알아서 나와요.', 'cond', 'smile'),
  // ── 청산 직후 ──
  'liq.why': t('liquidated', 'boss', (o) => `${o.lev}배였죠. 값이 ${Math.round(100 / o.lev)}% 반대로 가서 증거금이 0이 된 겁니다.`, undefined, 'smile'),
  'liq.safe': t('liquidated', 'boss', () => '잃는 건 건 돈까지입니다. 쳇바퀴와 알바는 그대로예요.', undefined, 'smile'),
  'liq.truth': t('liquidated', 'boss', () => '솔직히 여기선 잃는 분이 더 많습니다. 덕분에 제가 먹고살죠.', undefined, 'smile'),
  // ── 튜토리얼 끝: 목표 ──
  'goal.real': t('goal', 'boss', () => '이제부터 시세는 진짜입니다. 저도 어디로 갈지 몰라요.', undefined, 'smile'),
  'goal.repay': t('goal', 'boss', (o) => `끝내는 법은 하나. 빚 ${man(o.debt)}을 다 갚는 겁니다. 지도의 사무소에서요.`, 'tabMap', 'smile'),
  'goal.order': t('goal', 'boss', () => '갚으면 이자가 줄어요. 비싼 이자부터 지워 드립니다.', 'debt', 'smile'),
  'goal.fail': t('goal', 'boss', () => '끝내 못 갚으시면 파산입니다. …그래도 장부는 안 없어져요.', undefined, 'smile'),
  'goal.hero': t('goal', 'hero', () => '…쳇바퀴를 늘리든, 거래로 따든. 갚아야 끝난다.'),
  // ── 첫 진짜 포지션 ──
  'pos.liq': t('position', 'note', () => "'청산까지'는 남은 거리다. 0이 되면 넣은 돈이 사라진다.", 'posLiq'),
  'pos.close': t('position', 'note', () => '[정리하기]를 누르면 지금 손익 그대로 끝낸다.', 'closeBtn'),
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
