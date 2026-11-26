// 마을·일터 화면의 읽기 전용 모델(저장하지 않는 파생값). 화면은 이것만 읽는다. 시험은 tests/ui.
import {
  balance, COINS, friendDefs, houseDefs, lenderById, offerById, tierDefs, trackById, upgradeTracks, wheelByCoin,
} from '../../engine/data';
import { forecast } from '../../engine/settlement';
import { garnishRate } from '../../engine/seizure';
import {
  friendDebtTotal, houseValue, interestDue, lenderLimit, livingDue, netWorth, ownedCoins, price, refPrice, stage, totalDebt, walletValue, walletValueOf,
} from '../../engine/selectors';
import { equipNetNow, isActive, isReverseMargin, mineConcentration, nextTierCost, tierBlockReason, unitsOfTier } from '../../engine/equipment';
import { upgradeCost, upgradeLevel, upgradeTargetOk, affordableUpgrades } from '../../engine/upgrades';
import { wheelStatus } from '../../engine/progression';
import { closedNow } from '../../engine/loans';
import { moveBlockReason, moveCost } from '../../engine/housing';
import { abbrev, comma, isNight, timeOfDay } from '../../engine/util';
import type { CoinId, DebtId, GameState, LenderId } from '../../engine/types';
import type { HeroPose } from '../assets';

export const TIME_LABEL = ['아침', '낮', '저녁', '밤'] as const;

/** 줄여 쓰기: 10,000 미만은 그대로, 그 이상은 1.2만. */
export const short = abbrev;
export const signed = (n: number): string => (n >= 0 ? '+' : '−') + comma(Math.abs(n));
/** 상승·하락은 색 말고도 ▲▼ 와 +/− 로 구분한다(AC-v2-150). */
export const pctStr = (x: number, d = 1): string => `${x >= 0 ? '▲+' : '▼−'}${Math.abs(x).toFixed(d)}%`;

// ── HUD ─────────────────────────────────────────────────────────────────
export interface HudModel {
  cash: number;
  net: number;
  wallet: { show: boolean; value: number; pct: number };
  debt: { total: number; inherited: boolean; garnish: { pct: number; by: string[] } | null; overdue: boolean };
  settle: { left: number; total: number; warn: boolean; mined: number; power: number; out: number; net: number; lack: boolean; surplus: boolean };
  han: number;
  gen: number;
}

export function hudModel(g: GameState): HudModel {
  const run = g.run;
  const f = forecast(g);
  const out = f.power + f.interest + f.living;
  // 지갑 등락 = 코인별 (지금 가격 ÷ 세대 시작가 − 1)을 평가액 비중으로 가중
  let wv = 0;
  let wc = 0;
  for (const c of COINS) {
    const v = walletValueOf(run, c);
    wv += v;
    wc += v / (price(run, c) / refPrice(run, c));
  }
  const pct = wc > 0 ? (wv / wc - 1) * 100 : 0;
  const tagged = new Set<string>();
  for (const u of run.equipment) if (u.tagBy) tagged.add(u.tagBy);
  for (const c of ownedCoins(run)) if (run.coinWheels[c].tagBy) tagged.add(run.coinWheels[c].tagBy!);
  if (run.walletTagBy) tagged.add(run.walletTagBy);
  const garn = tagged.size ? { pct: Math.min(100, Math.round(garnishRate(g) * 100 * tagged.size)), by: [...tagged] } : null;
  const inherited = (['bank', 'capital', 'shark1', 'shark2', 'tax'] as DebtId[]).some((d) => run.debts[d].inherited > 0) || run.debts.tax.principal > 0;
  const overdue = Object.values(run.debts).some((d) => d.overdue > 0) || run.upkeepOverdue > 0;
  return {
    cash: run.cash,
    net: netWorth(run),
    wallet: { show: stage(run) >= 1, value: walletValue(run), pct },
    debt: { total: totalDebt(run), inherited, garnish: garn, overdue },
    settle: {
      left: run.settleIn, total: balance.settlement.intervalSec, warn: run.settleIn <= 10,
      mined: f.mined, power: f.power, out, net: f.net, lack: run.cash < out, surplus: f.net >= 0 && (run.equipment.length > 0 || ownedCoins(run).length > 0),
    },
    han: g.family.han,
    gen: g.family.generation,
  };
}

// ── 영웅 자세 ───────────────────────────────────────────────────────────
export interface PoseInput {
  over: boolean; overdueNear: boolean; nearLiq: boolean; tapping: boolean; stage: 0 | 1 | 2; flashJoy: boolean; greedy: boolean;
}
/** 우선순위: 파산 > 위험(식은땀) > 기쁨 > 일하기(줍기/달리기) > 탐욕 > 평소 */
export function heroPose(i: PoseInput): HeroPose {
  if (i.over) return 'dazed';
  if (i.overdueNear || i.nearLiq) return 'sweat';
  if (i.flashJoy) return 'joy';
  if (i.tapping) return i.stage === 0 ? 'pick' : 'run';
  if (i.greedy) return 'greed';
  return 'idle';
}

// ── 일터 무대 ───────────────────────────────────────────────────────────
export interface WheelView {
  coin: CoinId;
  name: string;
  short: string;
  color: string;
  sign: string;
  on: boolean;
  riding: boolean;
  autoSell: boolean;
  reverse: boolean; // 역마진 딱지
  tagBy: string | null;
  units: number;
  netNow: number;
  pct: number; // 세대 시작가 대비
}
export interface StageModel {
  stage: 0 | 1 | 2;
  wheels: WheelView[];
  /** 0단계(쳇바퀴를 잃었을 때) 다시 살 수 있는 쳇바퀴. */
  offer: { coin: CoinId; cost: number; canBuy: boolean; reason: string | null } | null;
  signUp: boolean;
  props: string[]; // 설비 최고 단계 소품
}
const PROP: Record<string, string> = { helper: '호루라기', generator: '안전모', shed: '작업복', powerroom: '조끼', farm: '넥타이' };

export function stageModel(g: GameState): StageModel {
  const run = g.run;
  const st = stage(run);
  const wheels: WheelView[] = ownedCoins(run).map((c) => {
    const w = wheelByCoin[c];
    const units = run.equipment.filter((u) => u.coin === c);
    const reverse = units.some((u) => isActive(run, u) && isReverseMargin(g, u));
    return {
      coin: c, name: w.name, short: w.name.replace(' 쳇바퀴', ''), color: w.color, sign: w.sign,
      on: run.coinWheels[c].on, riding: run.riding === c, autoSell: run.coinWheels[c].autoSell, reverse,
      tagBy: run.coinWheels[c].tagBy, units: units.length, netNow: units.reduce((a, u) => a + equipNetNow(g, u), 0),
      pct: (price(run, c) / refPrice(run, c) - 1) * 100,
    };
  });
  const ws = wheelStatus(g, 'DTC');
  const signUp = st === 0 && ws.unlocked;
  const props: string[] = [];
  let top = -1;
  for (const u of run.equipment) top = Math.max(top, tierDefs.findIndex((t) => t.id === u.tier));
  if (top >= 0) {
    const id = tierDefs[top].id;
    if (PROP[id]) props.push(PROP[id]);
  }
  return {
    stage: st, wheels, offer: signUp ? { coin: 'DTC', cost: wheelByCoin.DTC.cost, canBuy: ws.canBuy, reason: ws.reason } : null,
    signUp, props,
  };
}

// ── 일터 패널 ───────────────────────────────────────────────────────────
export interface WalletRow { coin: CoinId; name: string; qty: number; value: number; pct: number; autoSell: boolean }
export interface TierRow {
  id: string; name: string; units: number; max: number; nextCost: number | null; seenAs: string;
  targets: { coin: CoinId; short: string; reason: string | null; net: number }[];
}
export interface WheelSlotRow { coin: CoinId; name: string; owned: boolean; cost: number; canBuy: boolean; reason: string | null; progress: { current: number; need: number } | null }
export interface UpgradeRow {
  key: string; track: string; target?: string; name: string; scope: string; level: number; max: number;
  cost: number | null; effect: string; can: boolean; afford: boolean; targetLabel: string | null;
}
export interface WorkModel {
  wallet: { rows: WalletRow[]; concentration: { pct: number; coin: CoinId | null; text: string } };
  slots: WheelSlotRow[];
  tiers: TierRow[];
  equipment: { uid: string; tier: string; name: string; coin: CoinId; coinShort: string; on: boolean; net: number; reverse: boolean; tagBy: string | null }[];
  upgrades: UpgradeRow[];
  affordableDot: boolean;
}

function effectText(trackId: string, level: number): string {
  const t = trackById[trackId];
  const e = t.effect;
  const f = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, ''));
  const fmt = (lv: number) => {
    if (e.addPct !== undefined) return `${e.addPct * lv >= 0 ? '+' : ''}${f(e.addPct * lv)}%`;
    if (e.addValue !== undefined) return `+${comma(e.addValue * lv)}`;
    if (e.addPctPoint !== undefined) return `${f(e.addPctPoint * lv)}%p`;
    return '';
  };
  return level >= t.maxLevel ? `${fmt(level)} (최고)` : `${fmt(level)} → ${fmt(level + 1)}`;
}
const bandName = (names: any, lv: number, max: number): string => (Array.isArray(names) ? names[Math.min(names.length - 1, Math.floor(lv / (max / names.length)))] : String(names));

export function workModel(g: GameState): WorkModel {
  const run = g.run;
  const rows: WalletRow[] = ownedCoins(run).map((c) => ({
    coin: c, name: wheelByCoin[c].name.replace(' 쳇바퀴', ''), qty: run.wallet[c]?.qty ?? 0, value: walletValueOf(run, c),
    pct: (price(run, c) / refPrice(run, c) - 1) * 100, autoSell: run.coinWheels[c].autoSell,
  }));
  const conc = mineConcentration(g);
  const concText = conc.coin
    ? `캐는 값 비중: ${wheelByCoin[conc.coin].name.replace(' 쳇바퀴', '')} ${conc.pct}%`
    : '캐는 값 비중: 설비가 없습니다';
  const slots: WheelSlotRow[] = COINS.map((c) => {
    const s = wheelStatus(g, c);
    return { coin: c, name: wheelByCoin[c].name, owned: s.owned, cost: wheelByCoin[c].cost, canBuy: s.canBuy, reason: s.reason, progress: s.progress };
  });
  const coins = ownedCoins(run);
  const tiers: TierRow[] = tierDefs.map((t) => {
    const n = unitsOfTier(run, t.id);
    const max = balance.assets.maxUnits as number;
    return {
      id: t.id, name: t.name, units: n, max, nextCost: n >= max ? null : nextTierCost(run, t.id), seenAs: t.seenAs,
      targets: coins.map((c) => ({ coin: c, short: wheelByCoin[c].name.replace(' 쳇바퀴', ''), reason: tierBlockReason(g, t.id, c), net: 0 })),
    };
  });
  const equipment = run.equipment.map((u) => ({
    uid: u.uid, tier: u.tier, name: tierDefs.find((t) => t.id === u.tier)!.name, coin: u.coin, coinShort: wheelByCoin[u.coin].name.replace(' 쳇바퀴', ''),
    on: u.on, net: equipNetNow(g, u), reverse: isReverseMargin(g, u), tagBy: u.tagBy,
  }));
  const ups: UpgradeRow[] = [];
  for (const t of upgradeTracks) {
    const targets: (string | undefined)[] =
      t.scope === 'coinWheel' ? coins : t.scope === 'tier' ? Object.keys(t.names as object).filter((id) => upgradeTargetOk(run, 'tier', id)) : [undefined];
    for (const target of targets) {
      if (!upgradeTargetOk(run, t.id, target)) continue;
      const lv = upgradeLevel(run, t.id, target);
      const cost = upgradeCost(run, t.id, target);
      const nm = t.scope === 'tier' ? (t.names as Record<string, string>)[target!] : bandName(t.names, lv, t.maxLevel);
      ups.push({
        key: t.id + (target ? ':' + target : ''), track: t.id, target, name: nm, scope: t.scope, level: lv, max: t.maxLevel, cost,
        effect: effectText(t.id, lv), can: cost !== null, afford: cost !== null && run.cash >= cost,
        targetLabel: t.scope === 'coinWheel' ? wheelByCoin[target!].name.replace(' 쳇바퀴', '') : t.scope === 'tier' ? tierDefs.find((x) => x.id === target)!.name : null,
      });
    }
  }
  return { wallet: { rows, concentration: { pct: conc.pct, coin: conc.coin, text: concText } }, slots, tiers, equipment, upgrades: ups, affordableDot: affordableUpgrades(run).length > 0 };
}

// ── 창구 ────────────────────────────────────────────────────────────────
export interface LenderModel {
  id: LenderId;
  name: string;
  npc: string;
  greet: string;
  line: string; // 지금 하는 말(연체면 독촉)
  principal: number;
  limit: number;
  interest: number;
  rate: number;
  overdue: number;
  maxOverdue: number;
  closed: boolean;
  locked: boolean; // 독사 골목 닫힘
  unit: number;
  stampUnit: number;
  terms: string;
  grudge: boolean;
  tie: boolean;
  upfront: number;
  needsContacts: boolean;
  canRollover: boolean;
  tagged: boolean;
  tax: { principal: number; dueIn: number | null; closed: boolean } | null;
  inherited: number;
}

export function lenderModel(g: GameState, id: LenderId): LenderModel {
  const run = g.run;
  const l = lenderById[id];
  const d = run.debts[id];
  const rel = g.family.lenderRelations[id];
  const od = d.overdue;
  const closed = closedNow(g, id);
  const tagged = run.equipment.some((u) => u.tagBy === id) || ownedCoins(run).some((c) => run.coinWheels[c].tagBy === id) || run.walletTagBy === id;
  const line = closed ? (l.lines.closed ?? l.lines.greet) : od > 0 ? l.lines.dun : l.lines.greet;
  const taxD = run.debts.tax;
  return {
    id, name: l.name, npc: l.npc, greet: l.lines.greet, line: rel === 'grudge' && !closed ? '…용건만 말씀하시죠.' : rel === 'tie' && od === 0 ? '오, 또 오셨군요. 반갑습니다.' : line,
    principal: d.principal, limit: lenderLimit(g, id), interest: interestDue(g, id), rate: l.rate, overdue: od, maxOverdue: l.maxOverdue,
    closed, locked: id === 'shark2' && !run.shark2Open, unit: l.borrowUnit ?? 0, stampUnit: l.stampUnit, terms: l.terms,
    grudge: rel === 'grudge', tie: rel === 'tie', upfront: l.upfront, needsContacts: id === 'shark2' && (run.stats['borrow.shark2'] ?? 0) >= (l.contactsFromNth ?? 2) - 1,
    canRollover: (id === 'shark1' || id === 'shark2') && d.principal > 0, tagged,
    tax: id === 'bank' && taxD.principal > 0 ? { principal: taxD.principal, dueIn: run.taxDueIn, closed: closedNow(g, 'tax') } : null,
    inherited: d.inherited,
  };
}

/** 건물 이름표의 원금 줄임 + 연체 딱지. */
export function buildingBadge(g: GameState, id: string): { debt: string | null; od: string | null } {
  const run = g.run;
  if (id === 'friends') {
    const d = friendDebtTotal(run);
    return { debt: d > 0 ? short(d) : null, od: null };
  }
  if (id === 'bank' || id === 'capital' || id === 'shark1' || id === 'shark2') {
    const d = run.debts[id];
    const taxOd = id === 'bank' ? run.debts.tax.overdue : 0;
    const dd = d.principal + (id === 'bank' ? run.debts.tax.principal : 0);
    const o = Math.max(d.overdue, taxOd);
    return { debt: dd > 0 ? short(dd) : null, od: o > 0 ? `연체 ${o}/${lenderById[id].maxOverdue}` : null };
  }
  if (id === 'home' && run.upkeepOverdue > 0) return { debt: null, od: `연체 ${run.upkeepOverdue}` };
  return { debt: null, od: null };
}

export const anyOverdue = (g: GameState): boolean => buildingIds.some((b) => buildingBadge(g, b).od !== null);
const buildingIds = ['bank', 'capital', 'shark1', 'shark2', 'home'];

// ── 친구·집 ─────────────────────────────────────────────────────────────
export interface FriendView { id: string; name: string; species: string; trust: number; debt: number; maxLoan: number; broken: boolean; unit: number; stampUnit: number; canBorrow: boolean; dueIn: number | null }
export function friendViews(g: GameState): FriendView[] {
  const run = g.run;
  return friendDefs.map((f) => {
    const s = run.friends[f.id];
    return {
      id: f.id, name: f.name, species: f.species, trust: s.trust, debt: s.debt, maxLoan: f.maxLoan, broken: s.broken, unit: f.borrowUnit, stampUnit: f.stampUnit,
      canBorrow: !s.broken && s.debt + f.borrowUnit <= f.maxLoan, dueIn: s.dueAt !== null ? s.dueAt - run.settleNo : null,
    };
  });
}
export interface HouseRow { stage: number; name: string; current: boolean; cost: number; reason: string | null; living: number }
export function houseRows(g: GameState): HouseRow[] {
  const run = g.run;
  return houseDefs.map((h) => {
    const cur = run.house === h.stage;
    const saved = run.house;
    run.house = h.stage;
    const living = livingDue(g);
    run.house = saved;
    return { stage: h.stage, name: h.name, current: cur, cost: moveCost(g, h.stage), reason: cur ? null : moveBlockReason(g, h.stage), living };
  });
}

// ── 채권자의 방문(제안) ─────────────────────────────────────────────────
export interface VisitModel { id: string; by: string; npcArt: string; name: string; text: string; accept: string; decline: string; key: string }
const ACCEPT: Record<string, string> = { promo: '받는다', waive: '갚는다', fake_waive: '갚는다', rollover: '미룬다', flyer: '받는다' };
export function visitModel(g: GameState): VisitModel | null {
  const o = g.run.offers[0];
  if (!o) return null;
  const def = offerById[o.id];
  if (!def) return null;
  const by = def.by;
  return {
    id: o.id, by, npcArt: by === 'wire' ? 'npc_weasel' : by, name: lenderById[by]?.npc ?? '전단지', text: def.text,
    accept: ACCEPT[o.id] ?? '받는다', decline: '거절', key: `${o.id}:${o.from}`,
  };
}

/** 연체 직전 단계에서 일터 앞에 서 있는 채권자. */
export function standingCreditors(g: GameState): LenderId[] {
  const out: LenderId[] = [];
  for (const id of ['shark1', 'shark2'] as LenderId[]) {
    const d = g.run.debts[id];
    if (d.principal > 0 && d.overdue >= lenderById[id].maxOverdue - 1 && d.overdue > 0) out.push(id);
  }
  return out;
}

export const isNightNow = (g: GameState): boolean => isNight(g.run);
export const timeIdx = (g: GameState): number => timeOfDay(g.run);
export { houseValue };

/** 속보 띠에 지금 보여 줄 알림 하나(최근 14틱 안, 말풍선 제외). */
export function tickerNotice(run: GameState['run']) {
  return [...run.notices].reverse().find((x) => run.tick - x.tick < 14 && x.kind !== 'bubble') ?? null;
}
