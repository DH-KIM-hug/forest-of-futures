// 선물의 숲 엔진 타입 (GDD_v2 5.1). 이 폴더는 React/DOM/네트워크/시계를 쓰지 않는다.
export type LenderId = 'bank' | 'capital' | 'shark1' | 'shark2';
export type DebtId = LenderId | 'tax';
export type PayId = DebtId | 'upkeep';
export type CoinId = 'DTC' | 'BTH' | 'SMS' | 'MDT';
export type MarketId = CoinId | 'JQQ';
export type Dir = 1 | -1;
export type Branch = 'forced' | 'simple' | 'limited' | 'renounce' | 'gift';
export type MarketStatus = 'open' | 'delayed' | 'halted';
export type DayTime = 0 | 1 | 2 | 3; // 아침 낮 저녁 밤

export interface EventLogItem {
  kind: string;
  at: { tick: number; settleNo: number; time: DayTime };
  text: string;
  amount?: number;
}

export interface Notice {
  id: string;
  kind: 'wire' | 'settle' | 'warn' | 'bubble' | 'info';
  text: string;
  tick: number;
}

export interface DebtState {
  principal: number;
  inherited: number; // 승계 빚(원금 중 물려받은 몫). 통계 `inheritedDebt.*`
  overdue: number;
  graceLeft: number; // 남은 이자 유예 정산 수
  rateCap?: number | null; // 승계 몫(inherited)에만 적용되는 금리 상한(단순승인 4%)
}

export interface FriendState {
  trust: number;
  debt: number;
  broken: boolean;
  dueAt: number | null; // 갚기로 한 날(run.settleNo 기준)
  everBorrowed: boolean;
  maxedOut: boolean;
}

export interface CoinWheelState {
  on: boolean;
  autoSell: boolean;
  tagBy: LenderId | 'tax' | null;
}

export interface EquipmentUnit {
  uid: string;
  tier: string;
  coin: CoinId;
  on: boolean;
  cost: number; // 낸 값(구매가). 평가·공매·가압류 계산의 기준
  tagBy: LenderId | 'tax' | null;
  boughtWithLoan: boolean;
  inheritedSign: boolean;
  boughtTick: number;
}

export interface UpgradeState {
  body: Record<string, number>;
  run: Record<string, number>;
  coinWheel: Record<string, Record<string, number>>; // 종목 id -> { oil, spokes, power }
  tier: Record<string, number>; // 설비 단계 id -> 단계
}

export interface Position {
  market: string;
  kind: 'perp'; // 2단계(옵션)에서 'option' 이 붙는다
  dir: Dir;
  lev: number;
  margin: number; // 지금 증거금(펀딩비 차감 후)
  margin0: number; // 넣은 증거금 합
  notional: number;
  entry: number;
  openTick: number;
  openSettle: number;
  slRoe: number | null; // %
  tpRoe: number | null; // %
  adds: number;
  marginPct: number; // 진입 때 현금 대비 증거금(%)
  feesPaid: number;
  fundingPaid: number;
  peakRoe: number; // %
  roeLowSec: number; // ROE -80% 아래에 머문 초
  marginCalled: boolean;
  fundedBy: string | null;
  tipSource: string | null;
  tipAgree: number;
  entryAtHigh: boolean;
  entryAtLow: boolean;
  fadedWire: boolean;
  newsAfterEntry: 'up' | 'down' | null;
  closeReserved: boolean; // 시장 지연 중 예약된 정리
  reservedStops: { sl: number | null; tp: number | null } | null;
  revenge: { dir: 'same' | 'opposite'; within: number } | null; // 청산 뒤 다시 들어간 포지션
}

/** 끝난 마지막 포지션(손실이면 우선)의 기록. 엔딩 조건 `lev`·`dir`... 이 읽는다. */
export interface LastPos {
  market: string;
  dir: Dir;
  lev: number;
  margin0: number;
  marginPct: number;
  holdSettles: number;
  holdTicks: number;
  sl: 'none' | 'set';
  tp: 'none' | 'set';
  tpRoe: number | null;
  adds: number;
  viaJump: boolean;
  viaFunding: boolean;
  fundedBy: string | null;
  tipSource: string | null;
  tipWasRight: boolean;
  tipAgree: number;
  revenge: { dir: 'same' | 'opposite'; within: number } | null;
  entryAtHigh: boolean;
  entryAtLow: boolean;
  fadedWire: boolean;
  newsAfterEntry: 'up' | 'down' | null;
  maxRoe: number;
  roeLowMin: number;
  fundingPaid: number;
  pnl: number; // 실현 손익(수수료 포함, 청산이면 -증거금)
  ended: 'liq' | 'sl' | 'tp' | 'close';
  settleNo: number;
  tick: number;
}

export interface TipRecord {
  id: string;
  source: string;
  market: string;
  dir: 0 | 1 | -1;
  tick: number;
  settleNo: number;
  base: number; // 말한 때의 가격
  counted: boolean;
  fact: boolean;
  result: 'hit' | 'miss' | null;
}

export interface SettleBar {
  n: number;
  o: number;
  h: number;
  l: number;
  c: number;
  vol: number; // 평소 = 1
  buy: number; // 매수 체결 비율
  jump: boolean;
}

export interface MarketAvg {
  vol180: number;
  range180: number;
  range300s: number;
}

export interface AwayEntry {
  tick: number;
  kind: string;
  text: string;
  amount?: number;
  market?: string;
}

export interface AwayReport {
  awayHours: number;
  awaySec: number;
  fromTick: number;
  toTick: number;
  economySettlements: number;
  openAtLeave: { market: string; dir: Dir; lev: number; margin: number }[];
  entries: AwayEntry[];
  bankrupt: boolean;
  settlementSummary: { mined: number; power: number; interest: number };
}

export interface ActiveEffect {
  id: string;
  type: 'rateMultiplier' | 'appraisalMultiplier';
  multiplier: number;
  remaining: number; // 남은 정산 회차
}

export interface PendingEvent {
  id: string;
  startsIn: number; // 이 값이 0 이 되는 정산에서 효과가 시작
}

export interface OfferState {
  id: string; // offers.list 의 id
  from: number; // 생긴 정산 번호
  by: string;
}

export interface PromoLoan {
  amount: number;
  n: number; // 대출 뒤 지난 정산 수
}

export interface RecentBorrow {
  src: string;
  kind: 'lender' | 'friend';
  tick: number;
  counted: boolean;
}

export interface Bankruptcy {
  cause: string; // LIQ TIP SHARK BANK UPKEEP SEIZE FRIEND LEGACY
  lastLender: PayId | null;
  shortfall: number;
  tick: number;
  settleNo: number;
  immediate: boolean;
  offline: boolean;
}

export interface FamilyState {
  generation: number;
  han: number; // 영구 재화(legacyPoints). 표시 이름은 data/legacy.json
  hanSpent: number;
  tree: Record<string, number>;
  pending: { peakNetWorth: number; minedValue: number; endingPoints: number; simpleStreak: number };
  ledger: Record<string, { count: number; holders: { gen: number; name: string }[]; firstAt: number; scenes: EventLogItem[] }>;
  peakNetWorth: number;
  barehandPeak: number;
  tipBook: Record<string, { said: number; hit: number }>;
  heirlooms: Record<string, { level: number; pawnedTo: string | null; lostCount?: number }>;
  traits: string[]; // 최대 2 (기질 id)
  deepBlood: boolean;
  lenderRelations: Record<string, 'tie' | 'grudge' | null>;
  traces: string[];
  lineage: { gen: number; name: string; endedBy: string; branch: string; peak: number }[];
  stats: Record<string, number>;
  retireStreak: number;
  chainBroken: boolean;
}

export interface FuturesState {
  open: boolean;
  edu: number; // 본 사전교육 장 수
  mock: boolean; // 모의거래를 마쳤는가
  defaultLev: number;
  openedAtSettle: number | null;
  levCap: number;
  closedTrades: number;
  waiver: boolean;
}

export interface SettlementReport {
  settleNo: number;
  mined: number; // 캔 값(시가 도토리)
  power: number; // 전기세
  interest: number;
  living: number;
  tax: number;
  paid: number;
  unpaid: number;
  forcedSold: number;
}

export interface RunState {
  seed: number;
  rng: number;
  startTick: number;
  refPrice: Record<string, number>; // 세대 시작가(종목별, 고정)
  prices: Record<string, number>; // 지금 가격(틱마다 갱신, 런타임에서 들어옴)
  marketStatus: MarketStatus;
  branch: Branch;
  tick: number;
  settleIn: number;
  settleNo: number;
  cash: number;
  cashLocked: 0;
  wallet: Record<string, { qty: number; locked: 0 }>;
  walletTagBy: LenderId | 'tax' | null;
  walletPeakValue: number;
  coinWheels: Record<string, CoinWheelState>; // 키 = 종목 id (DTC ...)
  equipment: EquipmentUnit[];
  upgrades: UpgradeState;
  riding: CoinId | null;
  acornTaps: number;
  acornFrac: number;
  minedValue: number; // 이번 세대 누적 채굴(세대 시작가 기준 도토리어치)
  futures: FuturesState;
  debts: Record<DebtId, DebtState>;
  taxDueIn: number | null;
  upkeepArrears: number;
  upkeepOverdue: number;
  friends: Record<string, FriendState>;
  house: number;
  positions: Record<string, Position>;
  effects: ActiveEffect[];
  pendingEvents: PendingEvent[];
  offers: OfferState[];
  offerSeen: Record<string, number>; // 제안 id -> 마지막으로 나온 정산 번호(쿨다운)
  shark2Open: boolean;
  eventLog: EventLogItem[];
  tradeLog: unknown[];
  recentTips: TipRecord[];
  mkt: { cur: Record<string, SettleBar & { ticks: number }>; bars: Record<string, SettleBar[]>; avg: Record<string, MarketAvg>; avgFromServer: boolean };
  lastPos: LastPos | null;
  lastClose: { market: string; dir: Dir; settleNo: number; tick: number; liq: boolean } | null;
  tipCooldown: Record<string, number>;
  reserved: { kind: 'close'; market: string }[];
  view: { tab: 'village' | 'trade' };
  report: AwayEntry[] | null;
  recentBorrows: RecentBorrow[];
  stats: Record<string, any>;
  peakNetWorth: number;
  lastSeenTick: number;
  over: boolean;
  // 엔진 내부 상태
  uidSeq: number;
  tapsThisTick: number;
  garnishAcc: Record<string, number>; // 가압류로 모은 소수(채권처별)
  rolloverPending: Record<string, boolean>;
  waivePending: Record<string, boolean>;
  promos: Record<string, PromoLoan[]>;
  subsidyUsed: boolean;
  surplusAnnounced: boolean;
  firstWheelHintShown: boolean;
  notices: Notice[];
  bankruptcy: Bankruptcy | null;
  lastSettlement: SettlementReport | null;
}

export interface PendingEnding {
  id: string; // END-xxx
  cause: string;
  isNew: boolean;
  via: 'normal' | 'repeat';
  nth: number; // 이 엔딩을 얻은 횟수(이번 포함)
  title: string;
  line: string; // {laborTaps} 등을 채운 대사
  lastThree: EventLogItem[];
  nearMisses: { id: string; hint: string; missing: string }[]; // 한 끗 차이(최대 2)
  nextGen: { trait: string | null; trace: string; heirloom: string | null };
  collected: number; // 장부에 모은 수(이번 포함)
  peakNetWorth: number;
  settleNo: number;
  offline: boolean;
  awayHours: number | null;
  snapshot: Record<string, any>;
}

export interface Settings {
  name: string;
  priceColors: 'kr' | 'intl';
  prologueSeen: boolean;
  guides: Record<string, boolean>;
}

/** 세대가 끝난 뒤 엔딩 카드 -> 재산 명세서 -> 가문 특성 트리 -> 다음 세대 시작. 저장되므로 어디서 꺼도 이어진다(AC-v2-148). */
export interface HanCalc {
  peak: number; mined: number; endingPoints: number; peakTerm: number; minedTerm: number; score: number;
  ledgerMul: number; repeatMul: number; crestMul: number; branchMul: number; award: number;
}
export interface Estate {
  kind: 'bankrupt' | 'retire';
  step: 'card' | 'statement' | 'tree';
  chosen: Branch | null;
  award: number;
  calc: HanCalc | null;
  maxim: string | null;
  simpleStreakBefore: number;
  cause: string;
  surplus: number; // 상속 개시 때 경매 잉여금(한정승인 현금)
}

export interface GameState {
  version: 2;
  savedAt: number;
  deviceId: string;
  family: FamilyState;
  run: RunState;
  settings: Settings;
  pendingEnding: PendingEnding | null;
  estate: Estate | null;
}

/** 행동의 결과. s 는 항상 새 상태(실패하면 원래 상태 그대로). */
export interface R {
  s: GameState;
  ok: boolean;
  code?: string;
  msg?: string;
  paid?: number;
  cleared?: boolean;
  amount?: number;
}

/** 내부용: 제자리 수정 함수의 결과. */
export interface Res {
  ok: boolean;
  code?: string;
  msg?: string;
  paid?: number;
  cleared?: boolean;
  amount?: number;
}
