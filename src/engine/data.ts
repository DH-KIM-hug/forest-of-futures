import balanceJson from '../../data/balance.json';
import loansJson from '../../data/loans.json';
import friendsJson from '../../data/friends.json';
import housingJson from '../../data/housing.json';
import jobsJson from '../../data/jobs.json';
import marketsJson from '../../data/markets.json';
import eventsJson from '../../data/events.json';
import endingsJson from '../../data/endings.json';

export type Cond = [string, string, any];
export interface EndingDef {
  id: string;
  no: number;
  category: string;
  categoryName: string;
  title: string;
  condition: string;
  line: string;
  motif: string;
  trigger: { type: 'rule' | 'proxy'; causes: string[] | null; all: Cond[]; note?: string };
  priority: number;
  hint: string;
  illustration: string | null;
}
export interface LenderDef {
  id: 'bank' | 'capital' | 'shark1' | 'shark2';
  tier: number;
  name: string;
  kind: string;
  npc: string;
  building: string;
  requiresCollateral: boolean;
  limitRule: string;
  limitByHouseStage: number[] | null;
  borrowUnit: number;
  ratePerSettlement: number;
  upfrontRate: number;
  stampUnit: number;
  maxOverdueStreak: number;
  refuseLines: string[];
  terms: string;
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
}
export interface HouseDef {
  stage: number;
  id: string;
  name: string;
  price: number;
  collateralValue: number;
  upkeepPerSettlement: number;
  exterior: string;
  villageMood: string;
  placeholderColor: string;
}
export interface JobDef {
  id: string;
  order: number;
  name: string;
  buttonLabel: string;
  payPerTap: number;
  wagePerSettlement: number;
  unlock: { type: string; stat?: string; op?: string; value?: number };
}
export interface MarketDef {
  id: string;
  name: string;
  short: string;
  ticker: string;
  startPrice: number;
  decimals: number;
  sigmaPerTick: number;
  driftSigmaRatio: number;
  switchProbPerTick: number;
  jump: { probPerTick: number; minSigma: number; maxSigma: number };
  meanReversionK: number;
}
export interface EventDef {
  id: string;
  weight: number;
  headline: string;
  effect: any;
  fake?: boolean;
  followUpHeadline?: string;
  condition?: { stat: string; op: string; value: number };
  oncePerRun?: boolean;
  statFlag?: string;
  statCounter?: string;
}

export const balance = balanceJson as any;
export const lenders = loansJson.lenders as unknown as LenderDef[];
export const loansMeta = loansJson as any;
export const friendDefs = friendsJson.friends as unknown as FriendDef[];
export const friendRules = friendsJson.rules as any;
export const houses = housingJson.stages as unknown as HouseDef[];
export const housingRules = housingJson.rules as any;
export const jobs = [...(jobsJson.jobs as unknown as JobDef[])].sort((a, b) => a.order - b.order);
export const jobRules = jobsJson.rules as any;
export const marketDefs = marketsJson.markets as unknown as MarketDef[];
export const marketModel = marketsJson.priceModel as any;
export const eventDefs = eventsJson.events as unknown as EventDef[];
export const eventRules = eventsJson as any;
export const endings = endingsJson.endings as unknown as EndingDef[];
export const endingsMeta = endingsJson.meta as any;

export const lenderById = Object.fromEntries(lenders.map((l) => [l.id, l])) as Record<string, LenderDef>;
export const friendById = Object.fromEntries(friendDefs.map((f) => [f.id, f])) as Record<string, FriendDef>;
export const marketById = Object.fromEntries(marketDefs.map((m) => [m.id, m])) as Record<string, MarketDef>;
export const endingById = Object.fromEntries(endings.map((e) => [e.id, e])) as Record<string, EndingDef>;
export const T = balance.trading;
