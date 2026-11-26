// 세대 끝 -> 재산 명세서 -> 세 갈래(상속포기·한정승인·단순승인, 은퇴=증여) -> 가문 특성 트리 -> 다음 세대 (GDD_v2 3.14).
// 한 계산·이월·기질·원한/연줄·유품 전당·고리 끊기. 숫자는 data/balance.json(inheritance)·legacy.json 에서 읽는다.
import {
  balance, COINS, DEBT_IDS, friendDefs, heirloomDefs, legacy, lenderById, tierById, tierDefs, traitById, traitDefs, treeById, treeDefs, wheelByCoin, wheelById, endingById
} from './data';
import { ceilS, floorS } from './rng';
import { clone, newRun } from './game';
import { auctionPot, lowestEquip, positionsCash } from './estate';
import { createFriends } from './friends';
import { forecast } from './settlement';
import { refreshShark2Open, refuse } from './loans';
import { treeCost, treeLevel, traitVal } from './legacy';
import { equipAppraisalSum, houseValue, netWorth, ownedCoins, stage, totalDebt, wheelAppraisalSum, walletValue } from './selectors';
import { logEvent, notify } from './util';
import { bump } from './stats';
import { applyBirth, grantAward } from './skilltree';
import type { Branch, CoinId, DebtId, Estate, GameState, HanCalc, Res, RunState } from './types';

const INH = balance.inheritance;
const SC = legacy.score;
const MU = legacy.multipliers;

export type ChoiceBranch = 'renounce' | 'limited' | 'simple' | 'gift';
export const BRANCHES_AFTER_BANKRUPT: ChoiceBranch[] = ['renounce', 'limited', 'simple'];

export function openEstate(kind: Estate['kind'], cause: string): Estate {
  return { kind, step: kind === 'retire' ? 'statement' : 'card', chosen: null, award: 0, calc: null, maxim: null, simpleStreakBefore: 0, cause, surplus: 0 };
}

// ── 한 계산 (AC-v2-101~104) ─────────────────────────────────────────────
export function hanCalc(g: GameState, branch: ChoiceBranch): HanCalc {
  const f = g.family;
  const run = g.run;
  const retire = g.estate?.kind === 'retire';
  const pe = g.pendingEnding;
  const peak = Math.max(f.pending.peakNetWorth, run.peakNetWorth, netWorth(run));
  const mined = f.pending.minedValue + run.minedValue;
  const endingPoints = f.pending.endingPoints + (retire ? SC.retire : pe?.isNew ? SC.newEnding : 0);
  const peakTerm = floorS(SC.netWorthCoef * Math.sqrt(Math.max(0, peak) / SC.netWorthUnit));
  const minedTerm = floorS(SC.minedCoef * Math.sqrt(Math.max(0, mined) / SC.minedUnit));
  const score = peakTerm + minedTerm + endingPoints;
  const ledgerMul = 1 + MU.ledgerPerEnding * Object.keys(f.ledger).length;
  const repeatMul = retire || !pe || pe.isNew ? 1 : Math.max(MU.repeatFloor, Math.pow(MU.repeatDecay, pe.nth - 1));
  const crestMul = 1 + MU.crestPerLevel * treeLevel(f, 'crest');
  const branchMul = MU.branch[branch] as number;
  const award = floorS(score * ledgerMul * repeatMul * crestMul * branchMul);
  return { peak, mined, endingPoints, peakTerm, minedTerm, score, ledgerMul, repeatMul, crestMul, branchMul, award };
}

/** 가문이 지금까지 받은 가훈의 총량(문장 단계). */
export const hanTotal = (g: GameState): number => g.family.han + g.family.hanSpent;

// ── 가문 특성 트리 (AC-v2-113) ──────────────────────────────────────────
export function treeStatus(g: GameState) {
  return treeDefs.map((t) => {
    const lv = treeLevel(g.family, t.id);
    const cost = lv >= t.maxLevel ? null : treeCost(t.id, lv);
    return { id: t.id, name: t.name, level: lv, max: t.maxLevel, cost, canBuy: cost !== null && cost <= g.family.han, seenAs: t.seenAs };
  });
}
export function buyTree(g: GameState, id: string): Res {
  const t = treeById[id];
  if (!t) return refuse('unknown', '없는 특성');
  const f = g.family;
  const lv = treeLevel(f, id);
  if (lv >= t.maxLevel) return refuse('max', '최고 단계입니다.');
  const cost = treeCost(id, lv);
  if (f.han < cost) return refuse('han', '가훈이 모자랍니다.');
  f.han -= cost;
  f.hanSpent += cost;
  f.tree[id] = lv + 1;
  return { ok: true, amount: cost };
}

// ── 은퇴(증여) ─────────────────────────────────────────────────────────
export function canRetire(g: GameState): boolean {
  const run = g.run;
  return !run.over && run.house >= INH.retireMinHouse && totalDebt(run) === 0 && run.debts.tax.principal === 0;
}
export function retire(g: GameState): Res {
  if (!canRetire(g)) return refuse('retire', '빚이 없고 통나무집 이상일 때만 은퇴할 수 있습니다.');
  g.run.over = true;
  g.pendingEnding = null;
  g.estate = openEstate('retire', 'GIFT');
  grantAward(g);
  logEvent(g.run, 'retire', '은퇴하고 물려줌');
  return { ok: true };
}

export function estateNext(g: GameState): Res {
  const e = g.estate;
  if (!e || e.step !== 'card') return refuse('step', '넘길 카드가 없습니다.');
  e.step = 'statement';
  return { ok: true };
}

// ── 다음 세대의 빚·재산 만들기 ──────────────────────────────────────────
function addWheel(run: RunState, coin: CoinId): void {
  if (run.coinWheels[coin]) return;
  run.coinWheels[coin] = { on: true, autoSell: false, tagBy: null };
  run.wallet[coin] ??= { qty: 0, locked: 0 };
  if (!run.riding) run.riding = coin;
}
function addEquip(run: RunState, tier: string, coin: CoinId, sign = false): void {
  run.uidSeq += 1;
  run.equipment.push({ uid: `e${run.uidSeq}`, tier, coin, on: true, cost: tierById[tier].cost, tagBy: null, boughtWithLoan: false, inheritedSign: sign, boughtTick: run.tick });
}
/** 가문 특성 '물려받은 쳇바퀴'(heirwheel) 단계의 시작 소지품. 이미 있으면 더하지 않는다. */
function grantHeirwheel(run: RunState, lv: number): void {
  if (lv <= 0) return;
  for (const part of String(treeById.heirwheel.effect.levels[lv - 1]).split('+')) {
    if (part.startsWith('wheel:')) addWheel(run, wheelById[part].coin as CoinId);
    else if (part.startsWith('tier:')) {
      const t = part.slice(5);
      if (!run.equipment.some((u) => u.tier === t)) addEquip(run, t, 'DTC');
    }
  }
}

/** 학자금(캐피탈)과 연대보증(오소리). 부모 사채 잔액의 50%, 5만~15만. */
function studentAndGuarantee(run: RunState, parent: RunState): { student: number; guarantee: number } {
  const sharkParent = parent.debts.shark1.principal + parent.debts.shark2.principal;
  const guarantee = Math.min(INH.guaranteeMax, Math.max(INH.guaranteeMin, floorS(sharkParent * INH.guaranteeShareOfParentShark)));
  run.debts.capital.principal += INH.studentLoan;
  run.debts.shark1.principal += guarantee;
  run.stats.studentLoan = INH.studentLoan;
  run.stats.guarantee = guarantee;
  return { student: INH.studentLoan, guarantee };
}

/** 경매로 못 갚아 떼인 채권처(납부 순서대로 갚는다). */
function unpaidLenders(parent: RunState, pot: number): DebtId[] {
  let left = pot;
  const out: DebtId[] = [];
  for (const id of ['shark2', 'shark1', 'capital', 'bank'] as const) {
    const p = parent.debts[id].principal;
    const pay = Math.min(left, p);
    left -= pay;
    if (p - pay > 0) out.push(id);
  }
  return out;
}

function halfBody(body: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(body)) {
    const h = Math.floor(v * INH.keepBodyHalf);
    if (h > 0) out[k] = h;
  }
  return out;
}

export interface BuildInfo { surplus: number; grudge: DebtId[]; tie: DebtId[]; tax: number; student: number; guarantee: number; inheritedTotal: number; estateNet: number }

/** 부모의 끝난 판(g.run)과 갈래로 다음 세대의 RunState 를 만든다. 가문(g.family)은 이미 반영된 뒤여야 한다. */
export function buildNextRun(g: GameState, branch: Branch): { run: RunState; info: BuildInfo } {
  const f = g.family;
  const parent = clone(g.run);
  parent.cash += positionsCash(parent);
  parent.positions = {};
  const seedCash = treeLevel(f, 'seed') * treeById.seed.effect.addValue;
  const seed = ((parent.rng ^ 0x9e3779b1) + f.generation * 7919) | 0;
  const run = newRun(seed, parent.prices);
  run.tick = parent.tick;
  run.startTick = parent.tick;
  run.lastSeenTick = parent.lastSeenTick;
  run.marketStatus = parent.marketStatus;
  run.mkt = clone(parent.mkt);
  run.branch = branch;
  run.uidSeq = parent.uidSeq;
  for (const id of DEBT_IDS) run.debts[id] = { principal: 0, inherited: 0, overdue: 0, graceLeft: 0 };
  run.cash = 0;
  const info: BuildInfo = { surplus: 0, grudge: [], tie: [], tax: 0, student: 0, guarantee: 0, inheritedTotal: 0, estateNet: 0 };
  // 친구: 모두 새로. 기질 '외톨이'면 부모 때 절교한 친구는 신뢰 60에서 시작
  run.friends = createFriends();
  const brokenStart = f.traits.map((t) => traitById[t]?.extra?.brokenStartTrust).find((v) => v != null);
  if (brokenStart != null) for (const fr of friendDefs) if (parent.friends[fr.id]?.broken) run.friends[fr.id].trust = brokenStart;

  const heirLv = treeLevel(f, 'heirwheel');
  if (branch === 'renounce' || branch === 'limited') {
    run.house = 0;
    run.futures.edu = INH.edu[branch];
    if (branch === 'renounce') {
      run.cash = INH.renounceCash + seedCash;
      info.grudge = unpaidLenders(parent, auctionPot(parent));
    } else {
      const low = lowestEquip(parent);
      const keepWheels: CoinId[] = parent.coinWheels.DTC ? ['DTC'] : [];
      const pot = auctionPot(parent, { uids: low ? [low.uid] : [], wheels: keepWheels });
      info.surplus = Math.max(0, pot - totalDebt(parent));
      run.cash = INH.limitedCash + info.surplus + seedCash;
      info.grudge = unpaidLenders(parent, pot);
      addWheel(run, 'DTC');
      if (parent.coinWheels.DTC) run.upgrades.coinWheel.DTC = { ...(parent.upgrades.coinWheel.DTC ?? {}) };
      if (low) {
        run.uidSeq += 1;
        run.equipment.push({ ...low, uid: `e${run.uidSeq}`, coin: 'DTC', on: true, tagBy: null, boughtWithLoan: false, inheritedSign: false });
        if (parent.upgrades.tier[low.tier]) run.upgrades.tier[low.tier] = parent.upgrades.tier[low.tier];
      }
      const hk = legacy.keep.limited.houseFloorIfParentAtLeast;
      run.house = parent.house >= hk.parent ? hk.keep : 0;
      run.upgrades.body = halfBody(parent.upgrades.body);
    }
    const sg = studentAndGuarantee(run, parent);
    info.student = sg.student;
    info.guarantee = sg.guarantee;
    run.walletPeakValue = 0;
  } else {
    // simple / gift: 남은 것 전부
    run.cash = parent.cash + (branch === 'simple' ? INH.simpleCash : INH.giftCash) + seedCash;
    run.wallet = clone(parent.wallet);
    run.coinWheels = clone(parent.coinWheels);
    for (const w of Object.values(run.coinWheels)) w.tagBy = null;
    run.walletTagBy = null;
    run.equipment = parent.equipment.map((u) => ({ ...u, tagBy: null, boughtWithLoan: false }));
    run.riding = parent.riding;
    run.house = parent.house;
    run.futures = clone(parent.futures);
    if (run.futures.open) run.futures.openedAtSettle = 0;
    run.upgrades = { body: halfBody(parent.upgrades.body), run: {}, coinWheel: clone(parent.upgrades.coinWheel), tier: clone(parent.upgrades.tier) };
    if (branch === 'simple') {
      addWheel(run, 'DTC');
      // 가업 간판: 부모가 가져 본 가장 높은 단계의 한 단계 아래
      const maxEver = parent.stats.maxTierEver ?? -1;
      if (maxEver >= 1) addEquip(run, tierDefs[maxEver - 1].id, 'DTC', true);
      const streak = g.estate?.simpleStreakBefore ?? 0;
      const cap = INH.simpleDebtCapBase * Math.min(INH.simpleDebtCapMaxMul, 1 + streak);
      const real: Partial<Record<DebtId, number>> = {
        bank: parent.debts.bank.principal,
        capital: parent.debts.capital.principal,
        shark1: Math.max(0, parent.debts.shark1.principal - ((parent.stats['capInt.shark1'] as number) ?? 0)),
        shark2: Math.max(0, parent.debts.shark2.principal - ((parent.stats['capInt.shark2'] as number) ?? 0)),
      };
      const total = Object.values(real).reduce((a, b) => a + (b ?? 0), 0);
      const k = total > cap ? cap / total : 1;
      for (const id of ['bank', 'capital', 'shark1', 'shark2'] as const) {
        const v = Math.round((real[id] ?? 0) * k);
        if (v <= 0) continue;
        run.debts[id] = { principal: v, inherited: v, overdue: 0, graceLeft: INH.graceSettlements, rateCap: INH.simpleRateCap };
        info.inheritedTotal += v;
        info.tie.push(id);
      }
    }
  }
  grantHeirwheel(run, heirLv);
  // 세금(단순승인·증여): 순재산의 30만 초과분 × 30%
  if (branch === 'simple' || branch === 'gift') {
    const assets = run.cash + walletValue(run) + equipAppraisalSum(run) + wheelAppraisalSum(run) + houseValue(run) * 0.9;
    const net = assets - info.inheritedTotal;
    info.estateNet = Math.floor(net);
    info.tax = floorS(Math.max(0, net - INH.taxDeduction) * INH.taxRate) + parent.debts.tax.principal;
    if (info.tax > 0) {
      run.debts.tax.principal = info.tax;
      run.taxDueIn = lenderById.tax.deadlineSettlements ?? INH.taxDeadlineSettlements;
    }
    const short = Math.max(0, INH.minStartDebt - info.inheritedTotal - info.tax);
    if (short > 0) {
      run.debts.capital.principal += short;
      info.student = short;
    }
  }
  run.walletPeakValue = walletValue(run);
  run.stats.parentInherit = parent.branch;
  run.stats.parentCause = g.estate?.cause ?? null;
  run.stats.houseInherited = run.house > 0 && branch !== 'renounce';
  run.stats.inheritedPaid = 0;
  run.stats.pawned = 0;
  run.stats.maxTierEver = Math.max(-1, ...run.equipment.map((u) => tierDefs.findIndex((t) => t.id === u.tier)));
  run.peakNetWorth = 0;
  return { run, info };
}

// ── 세 갈래 고르기 ─────────────────────────────────────────────────────
function maximFor(g: GameState, cause: string, points: number): string | null {
  const lines: string[] | undefined = legacy.maxims.byCause[cause];
  if (!lines?.length) return null;
  return lines[g.family.generation % lines.length].replace('{points}', String(points));
}

function updateHeirlooms(g: GameState): void {
  const f = g.family;
  for (const h of heirloomDefs) {
    const count = Object.keys(f.ledger).filter((id) => endingById[id].causes.includes(h.cause)).length;
    const lv = (h.thresholds as number[]).filter((t) => count >= t).length;
    const cur = f.heirlooms[h.id] ?? { level: 0, pawnedTo: null };
    if (cur.pawnedTo) f.heirlooms[h.id] = { level: 0, pawnedTo: null, lostCount: count }; // 맡긴 채 파산 -> 0단계
    else if (cur.lostCount !== undefined && count <= cur.lostCount) f.heirlooms[h.id] = { ...cur, level: 0 };
    else f.heirlooms[h.id] = { level: lv, pawnedTo: null };
  }
}

function updateTraits(g: GameState, cause: string): void {
  const f = g.family;
  const t = traitDefs.find((d) => d.cause === cause);
  if (!t) return;
  const prevCause = f.traits[0] ? traitById[f.traits[0]]?.cause : null;
  if (prevCause === cause) {
    f.traits = [t.id];
    f.deepBlood = true;
  } else {
    f.traits = f.traits[0] ? [t.id, f.traits[0]] : [t.id];
    f.deepBlood = false;
  }
}

/** 갈래를 확정한다(단계 검사 없음 — 미리보기와 공용). 가문(한·이월·기질·관계)을 바꾼다. */
function commit(g: GameState, branch: ChoiceBranch): void {
  const f = g.family;
  const run = g.run;
  const e = g.estate!;
  const calc = hanCalc(g, branch);
  e.calc = calc;
  e.award = calc.award;
  e.chosen = branch;
  e.simpleStreakBefore = f.pending.simpleStreak;
  e.maxim = maximFor(g, e.cause, calc.award > 0 ? calc.award : calc.score);
  f.han += calc.award;
  const carry = branch === 'simple' || branch === 'gift';
  f.pending = carry
    ? { peakNetWorth: Math.max(0, calc.peak), minedValue: calc.mined, endingPoints: calc.endingPoints, simpleStreak: f.pending.simpleStreak + (branch === 'simple' ? 1 : 0) }
    : { peakNetWorth: 0, minedValue: 0, endingPoints: 0, simpleStreak: 0 };
  f.retireStreak = branch === 'gift' ? f.retireStreak + 1 : 0;
  if (e.kind === 'retire') {
    f.lineage.push({ gen: f.generation, name: g.settings.name, endedBy: 'retire', branch: run.branch, peak: Math.max(0, calc.peak) });
    f.stats.retires = (f.stats.retires ?? 0) + 1;
  }
  if (e.kind === 'bankrupt' && g.pendingEnding?.nextGen.trace && !f.traces.includes(g.pendingEnding.nextGen.trace)) f.traces.push(g.pendingEnding.nextGen.trace);
  updateHeirlooms(g);
  updateTraits(g, e.cause);
  const { info } = buildNextRun(g, branch);
  e.surplus = info.surplus;
  const rel: Record<string, 'tie' | 'grudge' | null> = {};
  for (const id of info.grudge) rel[id] = 'grudge';
  for (const id of info.tie) rel[id] = 'tie';
  f.lenderRelations = rel;
  e.step = 'tree';
}

export function chooseBranch(g: GameState, branch: ChoiceBranch): Res {
  const e = g.estate;
  if (!g.run.over || !e || e.step !== 'statement') return refuse('step', '재산 명세서 단계가 아닙니다.');
  const ok = e.kind === 'retire' ? branch === 'gift' : BRANCHES_AFTER_BANKRUPT.includes(branch);
  if (!ok) return refuse('branch', '고를 수 없는 갈래입니다.');
  commit(g, branch);
  return { ok: true, amount: e.award };
}

export function startNextGeneration(g: GameState): Res {
  const e = g.estate;
  if (!g.run.over || !e || e.step !== 'tree' || !e.chosen) return refuse('step', '아직 갈래를 고르지 않았습니다.');
  const branch = e.chosen;
  const { run } = buildNextRun(g, branch);
  g.run = run;
  g.family.generation += 1;
  g.pendingEnding = null;
  g.estate = null;
  applyBirth(g); // 가문의 스킬트리 노드를 새 생에 켠다
  refreshShark2Open(g);
  run.peakNetWorth = netWorth(run);
  notify(run, '세월이 흘렀다. 우편함에 나뭇잎 통지서 한 장 — 상속 개시.', 'info', 'wire:inherit');
  return { ok: true };
}

// ── 재산 명세서(8.8): 세 갈래 카드 ─────────────────────────────────────
export interface BranchCard {
  branch: ChoiceBranch;
  han: number;
  calc: HanCalc;
  keeps: string[];
  startDebt: number; // 세금 제외
  tax: number;
  startCash: number;
  surplus: number;
  firstNet: number;
  stage: 0 | 1 | 2;
  grudge: string[];
  tie: string[];
}
function describeKeeps(run: RunState): string[] {
  const out: string[] = [];
  for (const c of COINS) if (run.coinWheels[c]) out.push(wheelByCoin[c].name);
  const by: Record<string, number> = {};
  for (const u of run.equipment) by[u.tier] = (by[u.tier] ?? 0) + 1;
  for (const [t, n] of Object.entries(by)) out.push(`${tierById[t].name} ${n}대`);
  if (run.equipment.some((u) => u.inheritedSign)) out.push('가업 간판');
  if (run.house > 0) out.push(['', '통나무집', '도토리 창고', '호숫가 별장', '황금 저택'][run.house]);
  if (run.futures.open) out.push(`선물 계좌(상한 ${run.futures.levCap}배)`);
  return out;
}

export function previewBranch(g: GameState, branch: ChoiceBranch): BranchCard {
  const c = clone(g);
  commit(c, branch);
  const { run, info } = buildNextRun(c, branch);
  c.run = run;
  const lenderDebt = DEBT_IDS.filter((d) => d !== 'tax').reduce((a, d) => a + run.debts[d].principal, 0);
  return {
    branch, han: c.estate!.award, calc: c.estate!.calc!, keeps: describeKeeps(run), startDebt: lenderDebt, tax: run.debts.tax.principal,
    startCash: run.cash, surplus: info.surplus, firstNet: forecast(c).net, stage: stage(run),
    grudge: info.grudge, tie: info.tie,
  };
}

export function statement(g: GameState) {
  const run = g.run;
  const e = g.estate;
  const branches: ChoiceBranch[] = e?.kind === 'retire' ? ['gift'] : BRANCHES_AFTER_BANKRUPT;
  return {
    kind: e?.kind ?? null,
    parent: {
      cash: run.cash, wallet: Math.floor(walletValue(run)), coins: ownedCoins(run), equipment: run.equipment.length, house: run.house,
      debts: Object.fromEntries(DEBT_IDS.map((d) => [d, run.debts[d].principal])) as Record<string, number>, friendDebt: totalDebt(run) - DEBT_IDS.reduce((a, d) => a + run.debts[d].principal, 0),
    },
    hiddenLine: traitVal(g, 'hideStatementLine') != null,
    cards: g.run.over && e ? branches.map((b) => previewBranch(g, b)) : [],
  };
}

// ── 유품 전당 (3.5) ────────────────────────────────────────────────────
export function pawn(g: GameState, heirloomId: string, lender: 'shark1' | 'shark2'): Res {
  const run = g.run;
  const f = g.family;
  const h = heirloomDefs.find((x) => x.id === heirloomId);
  if (run.over || !h) return refuse('none', '맡길 수 없습니다.');
  if (lender === 'shark2' && !run.shark2Open) return refuse('locked', '아직 갈 일이 없는 골목입니다.');
  const cur = f.heirlooms[heirloomId] ?? { level: 0, pawnedTo: null };
  if (cur.level < 1) return refuse('level', '맡길 유품이 없습니다.');
  if (cur.pawnedTo) return refuse('pawned', '이미 맡겼습니다.');
  const amount = (h.pawn as number[])[cur.level - 1];
  run.cash += amount;
  run.debts[lender].principal += amount;
  f.heirlooms[heirloomId] = { ...cur, pawnedTo: lender };
  bump(run, 'pawned', 1);
  run.stats.pawnedAtSettle ??= run.settleNo;
  logEvent(run, 'pawn', `${h.name} 전당`, amount);
  refreshShark2Open(g);
  return { ok: true, amount };
}
/** 맡긴 곳의 빚을 다 갚으면 유품이 돌아온다. */
export function returnPawn(g: GameState, lender: string): void {
  if (g.run.debts[lender as DebtId]?.principal > 0) return;
  for (const [id, h] of Object.entries(g.family.heirlooms)) {
    if (h.pawnedTo === lender) {
      h.pawnedTo = null;
      notify(g.run, '맡긴 유품이 돌아왔습니다.', 'info');
      void id;
    }
  }
}

// ── 고리 끊기 (AC-v2-117) ──────────────────────────────────────────────
export function onTaxPaid(g: GameState): void {
  const f = g.family;
  if (g.run.branch !== 'gift' || f.chainBroken || f.retireStreak < INH.chainStreak) return;
  f.chainBroken = true;
  f.traces.push('chain_broken');
  logEvent(g.run, 'chain', '고리 끊기');
  notify(g.run, '장부 맨 뒤에 한 장이 더해졌습니다.', 'info', 'wire:chain');
}

export { ceilS };
