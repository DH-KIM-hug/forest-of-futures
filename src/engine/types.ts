// 선물의 숲 엔진 타입. 이 폴더는 React/DOM 을 쓰지 않는다.
export type LenderId = 'bank' | 'capital' | 'shark1' | 'shark2';
export type PayId = LenderId | 'upkeep';
export type Dir = 1 | -1;

export interface MarketState {
  id: string;
  price: number;
  prev: number;
  regime: -1 | 0 | 1;
  jumped: boolean;
  hist: number[]; // 최근 틱 가격(오래된 것 먼저)
  volMult: number;
  volUntil: number;
}

export interface Position {
  market: string;
  dir: Dir;
  lev: number;
  margin: number; // 현재 증거금(펀딩비 차감 후)
  margin0: number; // 넣은 증거금 합
  notional: number;
  entry: number;
  openTick: number;
  openCycle: number;
  slRoe: number | null;
  tpRoe: number | null;
  adds: number;
  marginPct: number;
  feesPaid: number;
  peakRoe: number;
  nearLiqSec: number;
  marginCalled: boolean;
  againstTrend: boolean;
  entryExtreme: 'high' | 'low' | null;
  flip: boolean;
  afterNewsSec: number | null;
  newsFake: boolean | null;
  fundedBy: string | null;
}

export interface FriendState {
  trust: number;
  debt: number;
  broken: boolean;
  dueAt: number | null;
  everBorrowed: boolean;
  maxedOut: boolean;
}

export interface ActiveEffect {
  id: string;
  type: 'rateMultiplier' | 'appraisalMultiplier';
  multiplier: number;
  remaining: number; // 남은 정산 회차
}

export interface PendingItem {
  at: number; // run.tick
  kind: 'event' | 'jump' | 'followUp';
  eventId?: string;
  market?: string;
  dir?: number;
  size?: number;
  text?: string;
}

export interface RecentBorrow {
  src: string; // lender id or friend id
  kind: 'lender' | 'friend';
  tick: number;
  counted: boolean;
}

export interface LastNews {
  market: string;
  headlineDir: number;
  fake: boolean;
  tick: number;
}

export interface LiqRecord {
  tick: number;
  dir: Dir;
  loss: boolean;
}

export interface Ticker {
  text: string;
  tick: number;
  kind: 'news' | 'settle' | 'warn' | 'job' | 'trade' | 'info';
}

export interface Digest {
  cycles: number;
  wage: number;
  interest: number;
  notes: string[];
}

export interface SettlementLog {
  cycle: number;
  wage: number;
  interest: number;
  text: string;
}

export interface TradeFlash {
  tick: number;
  kind: 'tp' | 'sl' | 'liq' | 'close';
  market: string;
  amount: number;
}

export interface RunState {
  seed: number;
  rng: number;
  tick: number;
  settleIn: number;
  cycles: number;
  cash: number;
  debts: Record<LenderId, number>;
  streak: Record<PayId, number>;
  upkeepArrears: number;
  friends: Record<string, FriendState>;
  houseStage: number;
  jobId: string;
  markets: Record<string, MarketState>;
  positions: Record<string, Position>;
  effects: ActiveEffect[];
  pending: PendingItem[];
  subsidyUsed: boolean;
  shark2Open: boolean;
  tapTimes: number[];
  recentBorrows: RecentBorrow[];
  lastNews: LastNews | null;
  lastLiq: Record<string, LiqRecord>;
  stats: Record<string, any>;
  // 회차 내 임시 값
  cycleRealized: number;
  cycleTapCount: number;
  cycleEntries: number;
  winStreak: number;
  postLiq: { tick: number; taps: number } | null;
  creditScore: number;
  peakNetWorth: number;
  view: { tab: 'village' | 'trade'; location: string };
  ticker: Ticker | null;
  lastSettlement: SettlementLog | null;
  tradeFlash: TradeFlash | null;
  stampFlash: { lender: string; tick: number } | null;
  offline: boolean;
  digest: Digest | null;
  over: boolean;
}

export interface Snapshot {
  [key: string]: any;
}

export interface PendingEnding {
  id: string;
  isNew: boolean;
  via: 'normal' | 'pity' | 'repeat' | 'fallback';
  nth: number; // 이 엔딩을 얻은 횟수(이번 포함)
  snapshot: Snapshot;
  lastLev: number | null;
  cycles: number;
  cash: number;
  totalDebt: number;
  collected: number; // 도감 진척(이번 포함)
}

export interface LifeStats {
  lifeRuns: number;
  lifeBankruptcies: number;
  lifeLiqs: number;
  lifeLaborTaps: number;
  lifeOdTotal: number;
  lifeOdShark1: number;
  lifeOdShark2: number;
  lifeBorrowShark2: number;
  lifeFriendsBroken: number;
  lifeLev200Trades: number;
  dryStreak: number;
}

export interface EncEntry {
  firstAt: number;
  count: number;
  snapshot: Snapshot;
}

export interface RecordEntry {
  peakNetWorth: number;
  cycles: number;
  endedBy: string; // END-xxx | 'retire'
  at: number;
}

export interface Settings {
  name: string;
  priceColors: 'kr' | 'intl';
  prologueSeen: boolean;
}

export interface GameState {
  version: number;
  savedAt: number;
  run: RunState;
  life: LifeStats;
  encyclopedia: Record<string, EncEntry>;
  records: RecordEntry[];
  settings: Settings;
  pending: PendingEnding | null;
}

export interface R {
  s: GameState;
  ok: boolean;
  msg?: string;
  code?: string;
}
