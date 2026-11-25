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
  // M2 에서 채운다 (선물 엔진). 자리만 둔다.
  market: string;
  kind: 'perp';
  dir: Dir;
  lev: number;
  margin: number;
  notional: number;
  entry: number;
  openTick: number;
  fundedBy: string | null;
  tipSource: string | null;
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
  heirlooms: Record<string, { level: number; pawnedTo: string | null }>;
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
  openedAtSettle: number | null;
  levCap: 10 | 50 | 200;
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
  recentTips: unknown[];
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
  // M3 에서 채운다.
  id: string;
}

export interface Settings {
  name: string;
  priceColors: 'kr' | 'intl';
  prologueSeen: boolean;
  guides: Record<string, boolean>;
}

export interface GameState {
  version: 2;
  savedAt: number;
  deviceId: string;
  family: FamilyState;
  run: RunState;
  settings: Settings;
  pendingEnding: PendingEnding | null;
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
