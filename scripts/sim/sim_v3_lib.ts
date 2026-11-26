// sim_v3 — 엔진을 그대로 불러(src/engine/*) 시나리오 플레이어를 돌린다. 시뮬레이션용 재구현이 없다.
// 시세: docs/gdd/v2/sim/data/hl_3m.json 을 ReplayFeed 로 1초 틱으로 풀어 한 번 캐시한다(세션은 그 틱을, 자리 비운 사이는 거기서 만든 1분 봉을 catchUp 에 넣는다).
// 시간: 하루 5번 접속(07:30·11:30·15:30·19:30·23:00 ± 15분), 한 번에 6~9분. 나머지는 오프라인(경제는 2 + idle 정산만).
import { createGame, stepMut } from '../../src/engine/game';
import type { Action } from '../../src/engine/actions';
import { ReplayFeed, type Recording } from '../../src/engine/feed/replayFeed';
import type { Bar, Tick } from '../../src/engine/feed/types';
import { catchUp } from '../../src/engine/offline';
import { declareBankruptcy } from '../../src/engine/bankruptcy';
import { forecast } from '../../src/engine/settlement';
import { lenderLimit, netWorth, ownedCoins, totalDebt } from '../../src/engine/selectors';
import { futuresGate, wheelStatus } from '../../src/engine/progression';
import { affordableUpgrades } from '../../src/engine/upgrades';
import { nextTierCost, tierBlockReason } from '../../src/engine/equipment';
import { levCapNow } from '../../src/engine/futures';
import { statement } from '../../src/engine/generation';
import { eventsMeta, lenderById, lendersMeta, marketDefs, tierDefs, treeById, COINS } from '../../src/engine/data';
import type { GameState } from '../../src/engine/types';

// ── 시세 캐시 ──────────────────────────────────────────────────────────
export interface Cache {
  L: number;
  ids: string[];
  px: Record<string, Float64Array>;
  vol: Record<string, Float32Array>;
}
export function buildCache(rec: Recording): Cache {
  const feed = new ReplayFeed(rec, 0, 0);
  const L = feed.length;
  const ids = marketDefs.map((m) => m.id);
  const px: Record<string, Float64Array> = {};
  const vol: Record<string, Float32Array> = {};
  for (const id of ids) {
    px[id] = new Float64Array(L);
    vol[id] = new Float32Array(L);
  }
  for (let i = 0; i < L; i++) {
    const t = feed.next();
    for (const id of ids) {
      px[id][i] = t.p[id][0];
      vol[id][i] = t.p[id][1];
    }
  }
  return { L, ids, px, vol };
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 플레이어 ───────────────────────────────────────────────────────────
export type BranchPolicy = 'renounce' | 'limited' | 'simple';
export interface Archetype {
  id: string;
  label: string;
  tps: number; // 접속 중 초당 탭
  engine: boolean; // 쳇바퀴·설비·업그레이드·빚 갚기
  futures?: boolean; // 조건이 되면 계좌 개설
  trade?: { lev: number; pct: number; sl: number | null; tp: number | null; max: number };
  maxGens: number; // 이 수의 세대까지만 시뮬레이션
}
export const ARCHETYPES: Archetype[] = [
  { id: 'idle', label: '접속만 하고 아무것도 안 함', tps: 0, engine: false, maxGens: 1 },
  { id: 'labor', label: '쳇바퀴만 굴림(초당 1.5회, 빌리지 않음), 남는 돈은 도장', tps: 1.5, engine: false, maxGens: 1 },
  { id: 'engine_casual', label: '채굴 + 바로 팔기(초당 1회), 흑자 전환 뒤 빚부터', tps: 1, engine: true, futures: true, maxGens: 1 },
  { id: 'engine_normal', label: '채굴 + 바로 팔기(초당 1.5회), 흑자 전환 뒤 빚부터', tps: 1.5, engine: true, futures: true, maxGens: 5 },
  { id: 'trader_mild', label: 'engine_normal + 속보를 따라 10배(손절 -50 / 익절 +100), 포지션 2개까지', tps: 1.5, engine: true, futures: true, trade: { lev: 10, pct: 25, sl: -50, tp: 100, max: 2 }, maxGens: 1 },
  { id: 'gambler', label: 'engine_normal + 모든 속보를 따라 상한 배율·증거금 100%·손절 없음', tps: 1.5, engine: true, futures: true, trade: { lev: 200, pct: 100, sl: null, tp: 200, max: 4 }, maxGens: 1 },
];

/** 한을 쓰는 순서(3.14 (5) 목표 곡선의 '주로 산 것'). [특성, 목표 단계] 를 앞에서부터, 못 사면 모은다. */
export const HAN_PLAN: [string, number][] = [
  ['grip', 2], ['seed', 1], ['heirwheel', 1], ['craft', 2], ['prep', 2], ['idle', 1], ['haggle', 2], ['grip', 5],
  ['heirwheel', 3], ['idle', 3], ['craft', 6], ['seed', 3], ['prep', 5], ['grip', 8], ['craft', 10], ['haggle', 5], ['idle', 4], ['nerve', 1], ['grip', 10], ['seed', 5],
];

export interface GenRec {
  played: number; // 1 = 첫 플레이 세대(2세대)
  family: number;
  branch: string;
  startH: number;
  endH: number | null;
  firstWheelOnlineSec: number | null;
  futuresH: number | null; // 세대 시작부터 선물 계좌가 열릴 때까지(실제 시간)
  futuresSession: number | null; // 몇 번째 접속에서
  debtFreeH: number | null;
  startDebt: number;
  startCash: number;
  startStage: number;
  endedBy: 'script' | 'bankrupt' | 'cap' | null;
  cause: string | null;
  peak: number;
  han: number; // 이 세대 끝에 받은 가훈
  hanBank: number; // 끝난 뒤 가진 가훈(쓰기 전)
  treeAfter: Record<string, number>;
  survived72h: boolean;
  sessions: number;
  trades: number;
  liqs: number;
  equipEnd: number;
}

export interface SimOpts {
  archetype: Archetype;
  seed: number;
  offsetSec: number; // 기록 안 시작 위치
  branch: BranchPolicy;
  holdHours: number; // 빚을 다 갚은 뒤 이만큼 더 하고 세대를 끝낸다(스크립트)
  genHours: number; // 세대는 적어도 이만큼(실제 시간) 이어진다(GDD 2.2: 한 세대는 실제 1~3일)
  maxHours: number;
  trace?: (g: GameState, T: number) => void; // 정산마다 부르는 관찰용
}

const HOURS = 3600;
const SESSION_HOURS = [7.5, 11.5, 15.5, 19.5, 23];

export async function simulate(cache: Cache, o: SimOpts): Promise<GenRec[]> {
  // 무작위 사건·제안은 그대로 둔다(엔진이 시드로 추첨).
  const rnd = mulberry(o.seed * 7919 + 17);
  const L = cache.L;
  const idxOf = (n: number) => (n + o.offsetSec - 1) % L;
  const tickAt = (n: number): Tick => {
    const i = idxOf(n);
    const p: Tick['p'] = {};
    for (const id of cache.ids) p[id] = [cache.px[id][i], cache.vol[id][i], 0.5];
    return { n, st: 'open', p };
  };
  const first: Record<string, number> = {};
  for (const id of cache.ids) first[id] = cache.px[id][idxOf(1)];
  const g = createGame({ seed: o.seed, prices: first });
  const recs: GenRec[] = [];
  let T = 0; // 실제 시각(초). 틱 번호 n = T
  let cur = newRec(g, 1, 0);
  let sessionNo = 0; // 세대 안 접속 횟수
  let onlineSec = 0;
  let acc = 0;
  let debtFreeSince: number | null = null;
  let lastSettle = -1;
  let wasBlack = false;
  recs.push(cur);

  function newRec(gg: GameState, played: number, startT: number): GenRec {
    const r = gg.run;
    return {
      played, family: gg.family.generation, branch: r.branch, startH: startT / HOURS, endH: null, firstWheelOnlineSec: ownedCoins(r).length ? 0 : null,
      futuresH: r.futures.open ? 0 : null, futuresSession: r.futures.open ? 0 : null, debtFreeH: null,
      startDebt: totalDebt(r), startCash: r.cash, startStage: ownedCoins(r).length ? (r.futures.open ? 2 : 1) : 0, endedBy: null, cause: null, peak: 0, han: 0, hanBank: 0, treeAfter: {},
      survived72h: true, sessions: 0, trades: 0, liqs: 0, equipEnd: 0,
    };
  }
  const act = (a: Action) => stepMut(g, { type: 'action', action: a });

  function endGen(kind: 'script' | 'bankrupt') {
    cur.endedBy = kind;
    cur.endH = T / HOURS - 0;
    cur.endH = T / HOURS;
    cur.peak = Math.max(g.run.peakNetWorth, netWorth(g.run));
    cur.cause = g.run.bankruptcy?.cause ?? null;
    cur.trades = g.run.stats.trades ?? 0;
    cur.liqs = g.run.stats.liqCount ?? 0;
    cur.equipEnd = g.run.equipment.length;
    if (kind === 'bankrupt' && cur.endH - cur.startH <= 72) cur.survived72h = false;
    act({ type: 'estateNext' });
    // 갈래: 정책 고정. 단순승인은 같은 갈래 연속을 그대로 따른다.
    const card = statement(g).cards.find((c) => c.branch === o.branch)!;
    const r = act({ type: 'inherit', branch: o.branch });
    if (!r.ok) throw new Error(`inherit failed ${JSON.stringify(r)}`);
    cur.han = card.han;
    cur.hanBank = g.family.han;
    // 한 쓰기: 계획 순서대로, 못 사는 것을 만나면 멈춘다
    for (const [id, target] of HAN_PLAN) {
      let lv = g.family.tree[id] ?? 0;
      let stuck = false;
      while (lv < target && lv < treeById[id].maxLevel) {
        const rr = act({ type: 'buyTree', id });
        if (!rr.ok) { stuck = true; break; }
        lv += 1;
      }
      if (stuck) break;
    }
    cur.treeAfter = { ...g.family.tree };
    act({ type: 'nextGeneration' });
    cur = newRec(g, cur.played + 1, T);
    recs.push(cur);
    sessionNo = 0;
    onlineSec = 0;
    acc = 0;
    debtFreeSince = null;
    wasBlack = false;
  }

  // ── 한 틱의 행동 ──
  function tapsNow(a: Archetype) {
    acc += a.tps;
    const n = Math.floor(acc);
    acc -= n;
    for (let i = 0; i < n; i++) act({ type: 'tap' });
  }
  function think(a: Archetype) {
    const run = g.run;
    if (a.engine && ownedCoins(run).length === 0 && wheelStatus(g, 'DTC').canBuy) act({ type: 'buyWheel', coin: 'DTC' });
    if (!a.engine) {
      // 줍기만: 현금이 남으면 빚 도장
      if (a.tps > 0 && run.cash > 40000) payDebt(run.cash - 40000);
      return;
    }
    for (const c of ownedCoins(run)) if (!run.coinWheels[c].autoSell) act({ type: 'autoSell', coin: c, on: true });
    if (ownedCoins(run).length === 0) return;
    // U-29·U-30: 오소리에서 빌리면 중고폰(선물 계좌)이 따라온다. 폰이 있어야 알바를 부른다. 빈 쳇바퀴마다 알바를 들인다(일당 1,800).
    if (!run.futures.open && (run.stats.sharkBorrowed ?? 0) > 0 && run.debts.shark1.principal > 0) act({ type: 'openAccount', sponsor: true });
    if (run.futures.open) {
      for (const c of ownedCoins(run)) if (!run.coinWheels[c].staffed) act({ type: 'hire', coin: c });
      for (const u of run.equipment) if (u.staffed === false) act({ type: 'hire', uid: u.uid });
    }
    if (a.futures) {
      const gate = futuresGate(g);
      if (gate.buttonVisible && !run.futures.open) {
        while (run.futures.edu < 3 && act({ type: 'eduPage' }).ok);
        if (!run.futures.mock) act({ type: 'mockTrade' });
        act({ type: 'openAccount' });
      }
    }
    const f = forecast(g);
    const fixed = f.interest + f.living;
    const due = fixed + f.power;
    // 흑자 전환(설비 수입 − 전기세 ≥ 이자 + 생활비의 1.6배)을 한 번 넘으면 그 뒤로는 빚부터 갚는다(SIM_v2 정책)
    if (f.mined - f.power >= 1.6 * fixed && fixed > 0) wasBlack = true;
    const debt = totalDebt(run);
    // U-29: 시작 현금은 0 이고 탭만으로는 이자를 못 낸다. 정산 직전에 모자라면 빌려서 낸다(추심원의 권유를 받는 것과 같다).
    if (run.settleIn <= 3 && run.cash < due) borrowUpTo(due - run.cash);
    // 자산은 빚으로 산다: 흑자 전환 전에는 이자율보다 많이 버는 설비를 빌려서 들인다.
    if (!wasBlack) leverage(due);
    if (!wasBlack || debt <= 0) invest(run.cash - 0.5 * due, f);
    else payDebt(run.cash - 3 * due);
    if (a.trade && run.futures.open) trade(a);
  }
  function payDebt(spend: number) {
    for (const id of ['shark2', 'shark1', 'capital', 'bank', 'tax'] as const) {
      for (let k = 0; k < 40 && spend > 0 && g.run.debts[id].principal > 0; k++) {
        const unit = id === 'bank' ? 50000 : id === 'capital' ? 10000 : id === 'tax' ? 10000 : id === 'shark1' ? 10000 : 20000;
        const mult = spend >= unit * 10 ? 10 : spend >= unit ? 1 : 0;
        if (!mult) break;
        const r = act({ type: 'stamp', lender: id, mult: mult as 1 | 10 });
        if (!r.ok) break;
        spend -= r.paid ?? 0;
      }
    }
  }
  /** 한도 안에서 need 만큼 빌린다(캐피탈 2%, 오소리 4%). 받은 돈을 돌려준다. */
  function borrowUpTo(need: number, maxRate = 1): number {
    let got = 0;
    // 폰(알바를 부르는 길)은 오소리 돈에 딸려 온다: 아직 폰이 없으면 오소리부터, 그 뒤로는 싼 곳부터
    const order = g.run.futures.open ? (['capital', 'shark1'] as const) : (['shark1', 'capital'] as const);
    for (const id of order) {
      if (lenderById[id].rate > maxRate) continue;
      for (let k = 0; k < 20 && got < need; k++) {
        if (lenderLimit(g, id) - g.run.debts[id].principal <= 0) break;
        const r = act({ type: 'borrow', lender: id });
        if (!r.ok) break;
        got += r.amount ?? 0;
      }
    }
    return got;
  }
  /** 빌린 돈의 이자보다 많이 버는 설비가 있으면(순수입/값 > 금리 × 1.25) 그 값만큼 빌려 산다. 다음 청구액은 남긴다. */
  function leverage(due: number) {
    const run = g.run;
    let best: { tier: string; cost: number; eff: number } | null = null as { tier: string; cost: number; eff: number } | null;
    for (const t of tierDefs) {
      if (run.equipment.filter((u) => u.tier === t.id).length >= 3) continue;
      const why = tierBlockReason(g, t.id, 'DTC');
      if (why && why !== '현금 부족') continue;
      const cost = nextTierCost(run, t.id);
      const eff = (t.netPerSec * 180) / cost;
      if (!best || eff > best.eff) best = { tier: t.id, cost, eff };
    }
    if (!best) return;
    const need = best.cost + 0.5 * due - run.cash;
    if (need <= 0) return; // invest 가 산다
    const room = (id: 'capital' | 'shark1') => (lenderById[id].rate * 1.25 < best!.eff ? Math.max(0, lenderLimit(g, id) - run.debts[id].principal) : 0);
    if (room('capital') + room('shark1') < need) return;
    borrowUpTo(need, best.eff / 1.25);
  }
  function invest(spend: number, f: { interest: number }) {
    const run = g.run;
    // 가장 효율 좋은 설비(순수입/값). 빚 이자율보다 낮으면 사지 않는다.
    const topRate = run.debts.tax.principal > 0 ? 1 : Math.max(0, ...(['bank', 'capital', 'shark1', 'shark2'] as const).map((id) => (run.debts[id].principal > 0 ? lenderById[id].rate : 0)));
    void f;
    let best: { tier: string; cost: number; eff: number } | null = null as { tier: string; cost: number; eff: number } | null;
    for (const t of tierDefs) {
      const units = run.equipment.filter((u) => u.tier === t.id).length;
      if (units >= 3) continue;
      const cost = nextTierCost(run, t.id);
      const why = tierBlockReason(g, t.id, 'DTC');
      if (why && why !== '현금 부족') continue;
      const eff = (t.netPerSec * 180) / cost;
      if (cost <= spend && eff > topRate && (!best || eff > best.eff)) best = { tier: t.id, cost, eff };
    }
    if (best) {
      act({ type: 'buyEquip', tier: best.tier, coin: 'DTC' });
      return;
    }
    // 업그레이드: 살 수 있는 설비가 없을 때 가장 싼 것
    const ups = affordableUpgrades(run).filter((u) => u.cost <= spend).sort((x, y) => x.cost - y.cost);
    if (ups.length) act({ type: 'upgrade', track: ups[0].track, target: ups[0].target });
  }
  function trade(a: Archetype) {
    const run = g.run;
    const t = a.trade!;
    if (Object.keys(run.positions).length >= t.max) return;
    for (let i = run.recentTips.length - 1; i >= 0 && i >= run.recentTips.length - 4; i--) {
      const tip = run.recentTips[i];
      if (!tip.counted || tip.dir === 0 || run.tick - tip.tick > 20 || run.positions[tip.market] || !COINS.includes(tip.market as any)) continue;
      const lev = Math.min(t.lev, levCapNow(run));
      act({ type: 'open', market: tip.market, dir: tip.dir as 1 | -1, lev, marginPct: t.pct, sl: t.sl, tp: t.tp });
      break;
    }
  }

  // ── 접속 일정 ──
  const maxT = o.maxHours * HOURS;
  for (let k = 0; ; k++) {
    const start = Math.floor(k / 5) * 86400 + Math.round((SESSION_HOURS[k % 5] + (rnd() - 0.5) * 0.5) * HOURS);
    if (k === 0 && start > 0) {
      T = 0; // 첫 접속은 바로(시계 0)
    } else {
      if (start >= maxT) break;
      // 자리를 비운 사이
      if (!g.run.over && start > T) {
        const from = T + 1;
        const bars = awayBars(cache, idxOf, from, start);
        catchUp(g, bars, start - T);
        T = start;
        if (g.run.over) endGen('bankrupt');
      } else T = Math.max(T, start);
    }
    const dur = 360 + Math.floor(rnd() * 181);
    cur.sessions = (sessionNo += 1);
    for (let s = 0; s < dur; s++) {
      T += 1;
      onlineSec += 1;
      stepMut(g, { type: 'tick', tick: tickAt(T) });
      if (g.run.over) {
        endGen('bankrupt');
        if (cur.played > o.archetype.maxGens) return recs.slice(0, -1);
      }
      if (o.trace && g.run.settleNo !== lastSettle) {
        lastSettle = g.run.settleNo;
        o.trace(g, T);
      }
      tapsNow(o.archetype);
      if (s % 3 === 0) think(o.archetype);
      // 측정
      if (cur.firstWheelOnlineSec === null && ownedCoins(g.run).length) cur.firstWheelOnlineSec = onlineSec;
      if (cur.futuresH === null && g.run.futures.open) {
        cur.futuresH = T / HOURS - cur.startH;
        cur.futuresSession = sessionNo;
      }
      if (cur.debtFreeH === null && totalDebt(g.run) === 0) {
        cur.debtFreeH = T / HOURS - cur.startH;
        debtFreeSince = T;
        if (o.archetype.maxGens === 1) { cur.endedBy = 'cap'; cur.endH = T / HOURS; return recs; }
      }
      if (debtFreeSince !== null && T - debtFreeSince >= o.holdHours * HOURS && T / HOURS - cur.startH >= o.genHours && !g.run.over) {
        declareBankruptcy(g, { lastLender: 'capital', shortfall: 1000 });
        endGen('script');
        if (cur.played > o.archetype.maxGens) return recs.slice(0, -1);
      }
    }
    if (cur.endedBy === null) cur.peak = Math.max(cur.peak, g.run.peakNetWorth);
    if (T >= maxT) break;
  }
  // 시간 끝: 열려 있는 세대 기록 마무리
  cur.endH = T / HOURS;
  cur.peak = Math.max(g.run.peakNetWorth, netWorth(g.run));
  cur.endedBy = cur.endedBy ?? 'cap';
  if (cur.played > o.archetype.maxGens) recs.pop();
  return recs;
}

/** 자리 비운 사이(from..to 초)의 1분 봉. 캐시에서 직접 만든다. */
function awayBars(cache: Cache, idxOf: (n: number) => number, from: number, to: number): Bar[] {
  const out: Bar[] = [];
  for (let n0 = Math.floor(from / 60) * 60; n0 <= to; n0 += 60) {
    const a = Math.max(from, n0);
    const b = Math.min(to, n0 + 59);
    if (b < a) continue;
    for (const id of cache.ids) {
      const px = cache.px[id];
      const vol = cache.vol[id];
      let h = -Infinity;
      let l = Infinity;
      let v = 0;
      for (let n = a; n <= b; n++) {
        const i = idxOf(n);
        const p = px[i];
        if (p > h) h = p;
        if (p < l) l = p;
        v += vol[i];
      }
      out.push({ market: id, n0, o: px[idxOf(a)], h, l, c: px[idxOf(b)], vol: v, buy: 0.5, st: 'open' });
    }
  }
  return out;
}

export function quiet() {
  eventsMeta.rollProbPerSettlement = eventsMeta.rollProbPerSettlement; // 사건은 그대로 켠다
  void lendersMeta;
}

// ── 통계 ───────────────────────────────────────────────────────────────
export function quantile(xs: number[], q: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (i - lo);
}
export const median = (xs: number[]) => quantile(xs, 0.5);
