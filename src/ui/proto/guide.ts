// 튜토리얼 대사 v1(DECISIONS_LOG U-32, docs/gdd/STORY_ACT1.md "튜토리얼 대사 v1").
// 처음 하는 사람이 그것이 처음 필요해지는 순간에 한 줄씩 듣는 설명. 인물의 말투로 말하고, 설명하는 화면 조각을 비춘다(data-hl).
// 한 줄(tip)은 평생 한 번만 나온다: 본 줄은 localStorage 에 적어 두고, &prologue=1 이나 &guide=1 로 지운다. &guide=0 은 전부 끈다.
// 숫자는 엔진 값을 받아 끼운다(TipArgs = model.ts tipArgs). 이 파일은 엔진·저장소를 부르지 않는다(시험이 그대로 읽는다).
import type { Line, Tab, Who } from './protoStore';

/** 비출 수 있는 화면 조각: 화면 쪽에 data-hl="<이름>" 이 붙어 있다. tab 이 있으면 그 탭에서만 보인다(다른 탭이면 그 탭으로 넘긴다).
 *  panel 이 있으면 집 아래 판을 그 상태로 맞춘다(U-34: closed = 접힌 채 세상이 크게, open = 쳇바퀴 자리 칸이 펴진 채). */
export const HL = {
  wheel: { tab: 'lot', panel: 'closed', label: '집 안의 쳇바퀴(누르면 구른다)' },
  cables: { tab: 'lot', panel: 'closed', label: '쳇바퀴에서 채굴기로 가는 전선(U-43)' },
  rig: { tab: 'lot', panel: 'closed', label: '채굴기(U-43)' },
  walletDev: { tab: 'lot', panel: 'closed', label: '집 안의 콜드월렛 기기(U-43)' },
  acorn: { label: '가진 도토리 숫자' },
  settle: { tab: 'lot', panel: 'closed', label: '정산 막대' },
  goal: { tab: 'lot', panel: 'closed', label: '목표 막대' },
  debt: { label: '빚 칩(빚 · 이자 · 생활비)' },
  ps: { label: '초당 수입 칩(1초마다 들어오는 돈만)' },
  tabMap: { label: '지도 탭' },
  office: { tab: 'map', label: '오소리 사무소 카드' },
  borrow: { tab: 'map', label: '빌리기 단추' },
  pay: { tab: 'map', label: '갚기 단추' },
  tileFirst: { tab: 'lot', panel: 'open', label: '엄마의 쳇바퀴 칸(알바 부르기)' },
  tileEmpty: { tab: 'lot', panel: 'open', label: '빈 자리 칸(쳇바퀴 놓기)' },
  strip: { tab: 'lot', panel: 'closed', label: '접힌 판의 한 줄(초당 들어오는 돈 / 정산 때 낼 돈, 정산까지)' },
  coins: { tab: 'phone', label: '거래소 종목 줄' },
  orders: { tab: 'phone', label: '롱 · 숏 단추' },
  mg: { tab: 'phone', label: '증거금 비율 칩' },
  ruler: { tab: 'phone', label: '배율 눈금' },
  risk: { tab: 'phone', label: '증거금 · 청산 줄' },
  cond: { tab: 'phone', label: '손절 · 익절 줄' },
  posNet: { tab: 'phone', label: '내 포지션의 손익(수수료 포함)' },
  posLiq: { tab: 'phone', label: '내 포지션의 청산까지' },
  posTense: { tab: 'phone', label: '청산까지의 거리를 지난 1분 폭에 견준 줄' },
  closeBtn: { tab: 'phone', label: '정리하기 단추' },
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
  /** 지금 빚 */ debt: number;
  /** 튜토리얼 거래 배율 */ lev: number;
}

export type Moment = 'home' | 'hud' | 'come' | 'map' | 'settle' | 'hamster' | 'exchange' | 'liquidated' | 'goal' | 'position';
/** 그 설명이 나오는 때(문서 표와 보고에 쓴다) */
export const MOMENT: Record<Moment, string> = {
  home: '프롤로그가 끝나고 집 화면이 처음 뜰 때',
  hud: '쳇바퀴를 12번 굴린 뒤',
  come: '첫 정산 직전, 추심원이 왔는데 돈이 모자랄 때',
  map: '지도 탭을 처음 열었을 때(빌리기 전)',
  settle: '빌린 뒤 첫 정산',
  hamster: '폰을 받은 뒤 첫 정산 직후(족제비 상인)',
  exchange: '거래소 탭을 처음 열었을 때',
  liquidated: '튜토리얼 거래가 청산된 직후',
  goal: '첫 주문 전표(뒷면)를 닫은 직후',
  position: '진짜 시세로 첫 포지션을 열었을 때',
};

const n = (x: number) => Math.round(x).toLocaleString('ko-KR');
const man = (x: number) => (x % 10000 === 0 ? `${x / 10000}만` : n(x));

interface TipDef { moment: Moment; who: Who; hl?: HlKey; mood?: Line['mood']; text: (o: TipArgs) => string }
const t = (moment: Moment, who: Who, text: TipDef['text'], hl?: HlKey, mood?: Line['mood']): TipDef => ({ moment, who, text, hl, mood });

/** 튜토리얼 대사 전부. 적힌 순서가 곧 나오는 순서다. */
export const TIPS = {
  // ── 집: 쳇바퀴가 무엇인가, 정산이 무엇인가 ──
  'home.tap': t('home', 'collector', () => '여기를 누르면 쳇바퀴가 돌아요오.', 'wheel'),
  'home.cable': t('home', 'collector', () => '전기가 이 전선을 타고요오.', 'cables'),
  'home.mine': t('home', 'collector', () => '채굴기가 도토코인을 캐요오.', 'rig'),
  'home.wallet': t('home', 'collector', () => '코인은 콜드월렛에서 바로 팔려요오.', 'walletDev'),
  'home.acorn': t('home', 'collector', () => '판 돈은 도토리로 여기 쌓이고요오.', 'acorn'),
  'home.settle': t('home', 'collector', () => '이 막대가 차면 제가 걷으러 와요오.', 'settle'),
  'home.claim': t('home', 'collector', (o) => `이자에 생활비까지 ${n(o.claim)}이에요오.`, 'goal'),
  'home.overdue': t('home', 'collector', () => '못 내시면 딱지 붙이고, 다음엔 실어 가요오.', 'goal', 'flat'),
  'home.go': t('home', 'hero', (o) => `…한 번에 ${n(o.tap)}. 일단 굴리자.`),
  // ── 집: 빚 칩 · 초당 ──
  'hud.debt': t('hud', 'collector', () => '참, 이 빨간 숫자가 빚이에요오.', 'debt'),
  'hud.notcash': t('hud', 'collector', () => '갚을 돈이지 쓸 돈이 아니에요오.', 'debt', 'flat'),
  'hud.interest': t('hud', 'collector', () => '밑에 건 정산마다 낼 이자고요오.', 'debt'),
  'hud.ps': t('hud', 'collector', () => '초당은 1초마다 들어오는 돈이에요오. 낼 돈은 정산 때 한 번에요오.', 'ps'),
  // ── 추심원이 왔다: 왜 모자란가, 왜 사무소에 가는가 ──
  'come.why': t('come', 'collector', () => '혼자 굴려선 원래 안 돼요오. 다들 일꾼을 써요오.', undefined, 'flat'),
  'come.away': t('come', 'collector', () => '돌려보내시면 연체예요오. 쳇바퀴에 딱지 붙고요오.', undefined, 'flat'),
  // ── 지도: 빌리고 갚는 곳 ──
  'map.office': t('map', 'note', (o) => `엄마 빚 ${man(o.debt)}이 적힌 장부가 여기 있다.`, 'office'),
  'map.borrow': t('map', 'note', (o) => `[빌리기]는 ${man(o.lend)}. 빚도 이자도 그만큼 는다.`, 'borrow'),
  'map.pay': t('map', 'note', () => '[갚기]는 원금을 줄인다. 이자도 같이 준다.', 'pay'),
  // ── 첫 정산 ──
  'settle.what': t('settle', 'collector', (o) => `생활비 ${n(o.living)}도 같이요오. 막대가 차면 또 와요오.`, 'settle'),
  // ── 알바 햄스터 · 쳇바퀴 ──
  'ham.what': t('hamster', 'weasel', () => '햄스터가 들어가면 손을 떼도 혼자 돌아요~', 'tileFirst', 'smile'),
  'ham.trickle': t('hamster', 'weasel', () => '캔 돈은 1초마다 들어와요~', 'acorn', 'smile'),
  'ham.mine': t('hamster', 'weasel', () => '알바가 든 쳇바퀴는 사장님이 못 굴려요~ 한 대에 한 명~', 'tileFirst', 'smile'),
  'ham.quit': t('hamster', 'weasel', () => '일당 밀리면 햄스터는 제가 데려가요~', 'tileFirst', 'smile'),
  'ham.sum': t('hamster', 'weasel', () => '초록은 1초마다 들어오는 돈, 빨강은 정산 때 낼 돈이에요~', 'strip', 'smile'),
  'ham.wheel': t('hamster', 'weasel', (o) => `쳇바퀴는 한 대 ${n(o.wheel)}, 사장님 재산이에요~`, 'tileEmpty', 'smile'),
  // ── 거래소 ──
  'fx.coins': t('exchange', 'boss', () => '도토코인, 밤더리움… 값이 쉬지 않고 움직여요.', 'coins', 'smile'),
  'fx.dir': t('exchange', 'boss', () => '오를 것 같으면 롱, 내릴 것 같으면 숏.', 'orders', 'smile'),
  'fx.lev': t('exchange', 'boss', (o) => `배율 ${o.lev}배면 1% 움직일 때 ${o.lev}%를 벌거나 잃어요.`, 'ruler', 'smile'),
  'fx.liq': t('exchange', 'boss', (o) => `${Math.round(100 / o.lev)}% 반대로 가면 넣은 돈이 다 사라져요. 그게 청산.`, 'risk', 'smile'),
  // ── 청산 직후 ──
  'liq.safe': t('liquidated', 'boss', () => '쳇바퀴와 알바는 그대로입니다.', undefined, 'smile'),
  'liq.truth': t('liquidated', 'boss', () => '여기선 잃는 분이 더 많습니다. 덕분에 먹고살죠.', undefined, 'smile'),
  // ── 첫 주문 전표가 닫힌 뒤(진짜 시세): 목표와, 이제 직접 고르는 것 ──
  'goal.real': t('goal', 'boss', () => '이제부터 시세는 짜 둔 게 아닙니다. 저도 몰라요.', undefined, 'smile'),
  'fx.margin': t('goal', 'boss', () => '증거금, 얼마를 걸지 이제 직접 고르세요.', 'mg', 'smile'),
  'fx.stops': t('goal', 'boss', () => '출구를 걸어 두시면 닿을 때 알아서 나와요.', 'cond', 'smile'),
  'goal.repay': t('goal', 'boss', (o) => `빚 ${man(o.debt)}, 사무소에 오셔서 갚으시면 됩니다.`, 'tabMap', 'smile'),
  'goal.order': t('goal', 'boss', () => '비싼 이자부터 지워 드릴게요.', 'debt', 'smile'),
  'goal.fail': t('goal', 'boss', () => '끝내 못 갚으시면 파산입니다. …그래도 장부는 안 없어져요.', undefined, 'smile'),
  // ── 첫 진짜 포지션 ──
  'pos.net': t('position', 'note', () => '큰 숫자는 지금 닫으면 남는 손익. 수수료까지 뺐다.', 'posNet'),
  'pos.liq': t('position', 'note', () => '청산까지가 0이 되면 넣은 돈이 사라진다.', 'posLiq'),
  'pos.tense': t('position', 'note', () => '점이 찰수록 청산이 가깝다.', 'posTense'),
  'pos.close': t('position', 'note', () => '[정리하기]는 지금 손익 그대로 끝낸다.', 'closeBtn'),
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
