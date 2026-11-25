// data/*.json 로더. 엔진은 숫자를 코드에 적지 않고 여기서 읽는다.
import balanceJson from '../../data/balance.json';
import marketsJson from '../../data/markets.json';
import equipmentJson from '../../data/equipment.json';
import upgradesJson from '../../data/upgrades.json';
import legacyJson from '../../data/legacy.json';
import lendersJson from '../../data/lenders.json';
import friendsJson from '../../data/friends.json';
import housingJson from '../../data/housing.json';
import tipsJson from '../../data/tips.json';
import eventsJson from '../../data/events.json';
import traitsJson from '../../data/traits.json';
import heirloomsJson from '../../data/heirlooms.json';
import endingsJson from '../../data/endings.json';

export interface MarketDef {
  id: string;
  name: string;
  startPrice: number;
  decimals: number;
  tradable: boolean;
  minable: boolean;
  index?: boolean;
  color: string;
}
export interface CoinWheelDef {
  id: string;
  coin: string;
  name: string;
  cost: number;
  yieldMul: number;
  powerMul: number;
  tapMul: number;
  unlock: { acornTaps?: number; minedValue?: number; house?: number };
  sign: string;
  color: string;
}
export interface TierDef {
  id: string;
  name: string;
  cost: number;
  grossPerSettle: number;
  netPerSec: number;
  needHouse: number;
  bankCollateral: boolean;
  seenAs: string;
}
export interface UpgradeTrack {
  id: string;
  scope: 'body' | 'coinWheel' | 'tier' | 'run';
  names: any;
  effect: { stat: string; addPct?: number; addValue?: number; addPctPoint?: number };
  maxLevel: number;
  baseCost?: number;
  baseCostOfWheel?: number;
  baseCostOfTier?: number;
  r: number;
  lookAt?: number[];
}
export interface TreeDef {
  id: string;
  name: string;
  effect: any;
  maxLevel: number;
  baseCost: number;
  r: number;
  seenAs: string;
}
export interface LenderDef {
  id: string;
  name: string;
  npc: string;
  rate: number;
  maxOverdue: number;
  ltv?: number;
  limitByHouse?: number[];
  borrowUnit?: number;
  stampUnit: number;
  upfront: number;
  requiresHouse?: boolean;
  closedAtNight?: boolean;
  contactsFromNth?: number;
  tagOrder: 'cheapFirst' | 'expensiveFirst' | 'bankCollateralOnly';
  deadlineSettlements?: number;
  terms: string;
  lines: Record<string, string>;
}
export interface FriendDef {
  id: string;
  name: string;
  species: string;
  relation: string;
  maxLoan: number;
  borrowUnit: number;
  stampUnit: number;
  onBreak: 'forgive' | 'sellClaim';
  breakLine: string;
  tipRole: string;
}
export interface HouseDef {
  stage: number;
  id: string;
  name: string;
  exterior: string;
  villageMood: string;
  placeholderColor: string;
}
export interface EventDef {
  id: string;
  weight: number;
  text: string;
  announceBefore?: number;
  cond?: { stat: string; op: string; value: number };
  oncePerRun?: boolean;
  effect: { type: 'rateMultiplier' | 'appraisalMultiplier' | 'cash'; value: number; settlements: number };
}
export interface OfferDef {
  id: string;
  by: string;
  cooldownSettlements: number;
  effect: any;
  text: string;
  log: string;
}
export interface TraitDef {
  cause: string;
  id: string;
  name: string;
  good: { stat: string; value: number };
  bad: { stat: string; value: number };
  extra?: Record<string, number>;
}
export interface Cond {
  0: string;
  1: string;
  2: any;
}
export interface EndingDef {
  id: string;
  no: number;
  title: string;
  line: string;
  causes: string[];
  conditions: [string, string, any][];
  rarity: 1 | 2 | 3;
  clue: string;
  hiddenCondIndex: number | null;
  foreshadow: string;
  trace: string;
  base: boolean;
  direction: Record<string, any>;
  illustration: string | null;
  textStatus: string;
  v1Category: string;
}

export const balance = balanceJson as any;
export const marketDefs = marketsJson.markets as MarketDef[];
export const simFeedCfg = marketsJson.simFeed as any;
export const replayMap = marketsJson.replayMap as any;
export const coinWheelDefs = equipmentJson.coinWheels as CoinWheelDef[];
export const tierDefs = equipmentJson.tiers as TierDef[];
export const upgradeTracks = upgradesJson.tracks as unknown as UpgradeTrack[];
export const upgradesMeta = upgradesJson as any;
export const legacy = legacyJson as any;
export const treeDefs = legacyJson.tree as unknown as TreeDef[];
export const lenderDefs = lendersJson.lenders as unknown as LenderDef[];
export const lendersMeta = lendersJson as any;
export const offerDefs = lendersJson.offers.list as unknown as OfferDef[];
export const friendDefs = friendsJson.friends as unknown as FriendDef[];
export const friendRules = friendsJson.rules as any;
export const houseDefs = housingJson.stages as unknown as HouseDef[];
export const housePrice = (housingJson as any).price as number[];
export const housingRules = (housingJson as any).rules as any;
export const tipsData = tipsJson as any;
export const eventDefs = eventsJson.events as unknown as EventDef[];
export const eventsMeta = eventsJson as any;
export const traitDefs = traitsJson.traits as unknown as TraitDef[];
export const traitsMeta = traitsJson as any;
export const heirloomDefs = heirloomsJson.heirlooms as any[];
export const endings = endingsJson.endings as unknown as EndingDef[];
export const endingsMeta = endingsJson.meta as any;

export const marketById = Object.fromEntries(marketDefs.map((m) => [m.id, m])) as Record<string, MarketDef>;
export const wheelByCoin = Object.fromEntries(coinWheelDefs.map((w) => [w.coin, w])) as Record<string, CoinWheelDef>;
export const wheelById = Object.fromEntries(coinWheelDefs.map((w) => [w.id, w])) as Record<string, CoinWheelDef>;
export const tierById = Object.fromEntries(tierDefs.map((t) => [t.id, t])) as Record<string, TierDef>;
export const trackById = Object.fromEntries(upgradeTracks.map((t) => [t.id, t])) as Record<string, UpgradeTrack>;
export const treeById = Object.fromEntries(treeDefs.map((t) => [t.id, t])) as Record<string, TreeDef>;
export const lenderById = Object.fromEntries(lenderDefs.map((l) => [l.id, l])) as Record<string, LenderDef>;
export const friendById = Object.fromEntries(friendDefs.map((f) => [f.id, f])) as Record<string, FriendDef>;
export const eventById = Object.fromEntries(eventDefs.map((e) => [e.id, e])) as Record<string, EventDef>;
export const offerById = Object.fromEntries(offerDefs.map((o) => [o.id, o])) as Record<string, OfferDef>;
export const traitById = Object.fromEntries(traitDefs.map((t) => [t.id, t])) as Record<string, TraitDef>;
export const endingById = Object.fromEntries(endings.map((e) => [e.id, e])) as Record<string, EndingDef>;

export const COINS = coinWheelDefs.map((w) => w.coin) as import('./types').CoinId[]; // 채굴 가능 종목
export const MARKET_IDS = marketDefs.map((m) => m.id);
export const LENDER_IDS = ['bank', 'capital', 'shark1', 'shark2'] as const;
export const DEBT_IDS = ['bank', 'capital', 'shark1', 'shark2', 'tax'] as const;
