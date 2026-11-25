#!/usr/bin/env node
// 선물의 숲 — 경제 시뮬레이션
// 실행: node scripts/sim/sim.mjs [--runs 2000] [--horizon 1800]
// data/*.json 을 그대로 읽는다(숫자의 원본은 data/). 결과는 표준 출력(마크다운 표)과 scripts/sim/out/results.json.
//
// 단순화(문서 SIM_RESULTS.md 에도 적음):
//  - 종목은 도토코인(DTC) 하나만 거래한다. 종목별 청산 속도는 실험 3에서 따로 잰다.
//  - 속보, 친구 대출, 이사, 오프라인 진행은 넣지 않았다. 시작 빚(캐피탈·오소리)만 있다.
//  - 플레이어는 정해진 규칙대로만 움직이는 가상의 사람이다.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (f) => JSON.parse(readFileSync(join(ROOT, 'data', f), 'utf8'));
const balance = load('balance.json');
const loans = load('loans.json');
const jobsData = load('jobs.json');
const marketsData = load('markets.json');

const args = process.argv.slice(2);
const argv = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const RUNS = argv('runs', 2000);
const HORIZON = argv('horizon', 1800); // 초 (30분)
// 탐색용 덮어쓰기: 모든 종목의 추세 세기·추세 전환 확률, 노동 수입 배율. 주지 않으면 data 값 그대로.
const OV_DRIFT = argv('driftRatio', null), OV_SWITCH = argv('switchProb', null), OV_TAP = argv('tapMul', 1);
if (OV_DRIFT !== null) for (const m of marketsData.markets) m.driftSigmaRatio = OV_DRIFT;
if (OV_SWITCH !== null) for (const m of marketsData.markets) m.switchProbPerTick = OV_SWITCH;
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null; // exp1|exp2|exp3|exp4

// ---------- 난수 ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rnd) {
  let u = 0; while (u === 0) u = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

// ---------- 시세 ----------
function makeMarket(m, rnd) {
  const w = marketsData.priceModel.regimeWeights;
  const pickRegime = () => { const r = rnd(); return r < w.up ? 1 : r < w.up + w.down ? -1 : 0; };
  const st = { price: m.startPrice, regime: pickRegime(), jumped: false };
  const logAnchor = Math.log(m.startPrice);
  st.step = () => {
    if (rnd() < m.switchProbPerTick) st.regime = pickRegime();
    let d = st.regime * m.driftSigmaRatio * m.sigmaPerTick + m.sigmaPerTick * gauss(rnd);
    st.jumped = false;
    if (rnd() < m.jump.probPerTick) {
      const size = (m.jump.minSigma + rnd() * (m.jump.maxSigma - m.jump.minSigma)) * m.sigmaPerTick;
      d += (rnd() < 0.5 ? -1 : 1) * size; st.jumped = true;
    }
    const lp = Math.log(st.price);
    st.price = Math.exp(lp + d - m.meanReversionK * (lp - logAnchor));
    return st.price;
  };
  return st;
}

// ---------- 가상의 플레이어 ----------
const T = balance.trading;
const SCENARIOS = {
  idle:           { label: '방치(아무것도 안 함)', tapsPerSec: 0,   repay: false },
  labor_casual:   { label: '노동만·느슨(초당 1회)', tapsPerSec: 1,   repay: true, reserveMul: 2 },
  labor_diligent: { label: '노동만·성실(초당 2.5회)', tapsPerSec: 2.5, repay: true, reserveMul: 2 },
  labor_normal:   { label: '노동만·보통(초당 1.5회)', tapsPerSec: 1.5, repay: true, reserveMul: 2 },
  trader_cautious:{ label: '신중한 거래: 오소리 빚부터 다 갚고 나서 거래(25배·현금 50%·손절-25/익절+50, 추세 추종) + 보통 노동(초당 1.5회)', tapsPerSec: 1.5, repay: true, reserveMul: 2, tradeBank: 60000,
                    trade: { lev: 25, pct: 0.5, sl: -25, tp: 50, mode: 'trend', startWhenShark1Paid: true } },
  trader_bold:    { label: '과감한 거래: 처음부터 거래(50배·현금 50%·손절-50/익절+100, 추세 추종) + 느슨한 노동(초당 1회)', tapsPerSec: 1, repay: true, reserveMul: 2, tradeBank: 100000,
                    trade: { lev: 50, pct: 0.5, sl: -50, tp: 100, mode: 'trend' } },
  reckless_200:   { label: '무모한 200배 전액(무작위 방향, 익절+100, 손절 없음), 노동 없음', tapsPerSec: 0, repay: false,
                    trade: { lev: 200, pct: 1, sl: null, tp: 100, mode: 'random' } },
};

const lender = Object.fromEntries(loans.lenders.map((l) => [l.id, l]));
const PAY_ORDER = balance.settlement.payOrder.filter((id) => id !== 'upkeep');
const jobs = [...jobsData.jobs].sort((a, b) => a.order - b.order);

function runOne(scn, intervalSec, seed, opt = {}) {
  const rnd = mulberry32(seed);
  const tapMul = (opt.tapMul ?? 1) * OV_TAP;
  const mk = makeMarket(marketsData.markets[0], rnd);
  const hist = new Float64Array(T.trendWindowTicks + 1).fill(mk.price);
  let hi = 0;
  const s = {
    cash: balance.start.cash,
    debt: { ...balance.start.debts },
    streak: { bank: 0, capital: 0, shark1: 0, shark2: 0 },
    taps: 0, tapAcc: 0, pos: null, cooldown: 0,
    liqs: 0, trades: 0, laborEarned: 0, interestPaid: 0,
  };
  const out = { bankruptAt: null, cause: null, debtFreeAt: null, solventAt: null, endNetWorth: 0, peak: -Infinity, liqs: 0, trades: 0, taps: 0 };
  const totalDebt = () => s.debt.bank + s.debt.capital + s.debt.shark1 + s.debt.shark2;
  const nextDue = () => PAY_ORDER.reduce((a, id) => a + s.debt[id] * lender[id].ratePerSettlement, 0);
  const job = () => { // laborTaps 조건만 본다(이사는 시뮬레이션 범위 밖)
    let j = jobs[0];
    for (const c of jobs) if (c.unlock.type === 'stat' && c.unlock.stat === 'laborTaps' && s.taps >= c.unlock.value) j = c;
    return j;
  };
  const earn = (amount) => {
    if (s.streak.shark1 >= 1 && s.debt.shark1 > 0) {
      const g = Math.min(s.debt.shark1, amount * jobsData.rules.garnishRate);
      s.debt.shark1 -= g; amount -= g;
    }
    s.cash += amount; s.laborEarned += amount;
  };
  const closePos = (price, liquidated) => {
    const p = s.pos; s.pos = null; s.cooldown = 5;
    if (liquidated) { s.liqs++; return; }
    const pnl = p.dir * (price - p.entry) / p.entry * p.notional;
    s.cash += Math.max(0, p.margin + pnl - p.notional * T.feeRate);
  };

  for (let t = 1; t <= HORIZON; t++) {
    const price = mk.step();
    hi = (hi + 1) % hist.length; const old = hist[hi]; hist[hi] = price;

    // 포지션 판정
    if (s.pos) {
      const p = s.pos;
      const hitLiq = p.dir > 0 ? price <= p.liq : price >= p.liq;
      if (hitLiq) {
        closePos(price, true);
        if (balance.bankruptcy.liquidationWipeout.enabled && s.cash < balance.bankruptcy.liquidationWipeout.equityBelow && totalDebt() > 0) {
          out.bankruptAt = t; out.cause = 'liquidation'; break;
        }
      } else if (p.slP !== null && (p.dir > 0 ? price <= p.slP : price >= p.slP)) {
        closePos(mk.jumped ? price : p.slP, false);
      } else if (p.tpP !== null && (p.dir > 0 ? price >= p.tpP : price <= p.tpP)) {
        closePos(mk.jumped ? price : p.tpP, false);
      }
    }

    // 노동
    if (scn.tapsPerSec > 0) {
      s.tapAcc += scn.tapsPerSec;
      const n = Math.floor(s.tapAcc); s.tapAcc -= n;
      if (n > 0) { const j = job(); s.taps += n; earn(n * j.payPerTap * tapMul); }
    }

    // 거래 진입
    const tradingOn = scn.trade && (!scn.trade.startWhenShark1Paid || s.debt.shark1 <= 0);
    if (tradingOn && !s.pos) {
      if (s.cooldown > 0) s.cooldown--;
      else {
        const tr = scn.trade;
        let dir = 0;
        if (tr.mode === 'random') dir = rnd() < 0.5 ? 1 : -1;
        else {
          const ret = price / old - 1;
          const thr = 0.5 * marketsData.markets[0].sigmaPerTick * Math.sqrt(T.trendWindowTicks);
          if (ret > thr) dir = 1; else if (ret < -thr) dir = -1;
        }
        if (dir !== 0) {
          const margin = tr.pct >= 1 ? Math.floor(s.cash / (1 + tr.lev * T.feeRate)) : Math.floor(s.cash * tr.pct);
          const notional = margin * tr.lev; const fee = notional * T.feeRate;
          if (margin >= T.minMargin && s.cash >= margin + fee) {
            s.cash -= margin + fee; s.trades++;
            const liq = dir > 0 ? price * (1 - 1 / tr.lev + T.maintenanceRate) : price * (1 + 1 / tr.lev - T.maintenanceRate);
            const slP = tr.sl === null ? null : price * (1 + dir * (tr.sl / 100) / tr.lev);
            const tpP = tr.tp === null ? null : price * (1 + dir * (tr.tp / 100) / tr.lev);
            s.pos = { dir, entry: price, margin, notional, liq, slP, tpP };
          }
        }
      }
    }

    // 원금 탕감 도장: 이자율 높은 곳부터
    if (scn.repay && totalDebt() > 0) {
      const keep = Math.max(scn.reserveMul * nextDue(), tradingOn ? (scn.tradeBank ?? 0) : 0);
      for (const id of PAY_ORDER) {
        const unit = lender[id].stampUnit;
        while (s.debt[id] > 0 && s.cash - keep >= Math.min(unit, s.debt[id])) {
          const pay = Math.min(unit, s.debt[id]); s.cash -= pay; s.debt[id] -= pay;
        }
      }
    }
    if (out.debtFreeAt === null && totalDebt() <= 0) out.debtFreeAt = t;

    // 정산
    if (t % intervalSec === 0) {
      earn(job().wagePerSettlement);
      if (s.pos) { // 펀딩비
        const p = s.pos; p.margin -= p.notional * T.fundingRatePerSettlement;
        const pnl = p.dir * (price - p.entry) / p.entry * p.notional;
        if (p.margin + pnl <= p.notional * T.maintenanceRate) closePos(price, true);
        else p.liq = p.dir > 0 ? p.entry * (1 - p.margin / p.notional + T.maintenanceRate) : p.entry * (1 + p.margin / p.notional - T.maintenanceRate);
      }
      let dead = null;
      for (const id of PAY_ORDER) {
        if (s.debt[id] <= 0) { s.streak[id] = 0; continue; }
        const due = s.debt[id] * lender[id].ratePerSettlement;
        const pay = Math.min(due, Math.max(0, s.cash));
        s.cash -= pay; s.interestPaid += pay;
        if (pay + 1e-9 < due) { s.debt[id] += due - pay; s.streak[id]++; if (s.streak[id] >= lender[id].maxOverdueStreak && !dead) dead = id; }
        else s.streak[id] = 0;
      }
      if (dead) { out.bankruptAt = t; out.cause = `overdue_${dead}`; break; }
    }

    const eq = s.pos ? Math.max(0, s.pos.margin + s.pos.dir * (price - s.pos.entry) / s.pos.entry * s.pos.notional) : 0;
    const nw = s.cash + eq - totalDebt();
    if (nw > out.peak) out.peak = nw;
    if (out.solventAt === null && nw >= 0) out.solventAt = t;
    out.endNetWorth = nw;
  }
  out.liqs = s.liqs; out.trades = s.trades; out.taps = s.taps;
  return out;
}

// ---------- 집계 ----------
const median = (a) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const pct = (x) => Math.round(x * 1000) / 10;
function cell(scnKey, intervalSec, opt) {
  const scn = SCENARIOS[scnKey];
  const rs = [];
  for (let i = 0; i < RUNS; i++) rs.push(runOne(scn, intervalSec, 1000003 * (i + 1) + intervalSec * 7919 + scnKey.length * 104729, opt));
  const bk = rs.filter((r) => r.bankruptAt !== null);
  const df = rs.filter((r) => r.debtFreeAt !== null);
  const alive = rs.filter((r) => r.bankruptAt === null);
  return {
    scenario: scnKey, intervalSec,
    bankrupt5: pct(bk.filter((r) => r.bankruptAt <= 300).length / RUNS),
    bankrupt10: pct(bk.filter((r) => r.bankruptAt <= 600).length / RUNS),
    bankrupt30: pct(bk.length / RUNS),
    medBankruptSec: median(bk.map((r) => r.bankruptAt)),
    debtFree30: pct(df.length / RUNS),
    medDebtFreeSec: median(df.map((r) => r.debtFreeAt)),
    solvent30: pct(rs.filter((r) => r.solventAt !== null).length / RUNS),
    medSolventSec: median(rs.filter((r) => r.solventAt !== null).map((r) => r.solventAt)),
    medEndNetWorthAll: Math.round(median(rs.map((r) => (r.bankruptAt === null ? r.endNetWorth : -1e9)))),
    medEndNetWorthAlive: alive.length ? Math.round(median(alive.map((r) => r.endNetWorth))) : null,
    rich1m: pct(rs.filter((r) => r.peak >= 1000000).length / RUNS),
    medTaps: median(rs.map((r) => r.taps)),
    medTrades: median(rs.map((r) => r.trades)),
  };
}

// 미리 정한 목표(결과를 보기 전에 정함). 문서 SIM_RESULTS.md 2장과 같다.
function score(byScn, intervalSec) {
  const c = [];
  const idle = byScn.idle, cas = byScn.labor_casual, nor = byScn.labor_normal, dil = byScn.labor_diligent, cau = byScn.trader_cautious, rk = byScn.reckless_200;
  c.push(['C1 방치하면 4~10분 사이에 파산', idle.medBankruptSec !== null && idle.medBankruptSec >= 240 && idle.medBankruptSec <= 600]);
  c.push(['C2 느슨한 노동만: 10분 안 파산 10% 이하, 빚 청산은 20분보다 늦음(또는 30분 안에 못 함)', cas.bankrupt10 <= 10 && (cas.medDebtFreeSec === null || cas.medDebtFreeSec >= 1200)]);
  c.push(['C3 성실한 노동만: 파산 5% 미만, 빚 청산 중앙값 8~20분', dil.bankrupt30 < 5 && dil.debtFree30 >= 50 && dil.medDebtFreeSec >= 480 && dil.medDebtFreeSec <= 1200]);
  c.push(['C4 신중한 거래: 파산 20% 이하, 30분 뒤 순자산 중앙값이 같은 노동량의 노동만 플레이보다 큼', cau.bankrupt30 <= 20 && cau.medEndNetWorthAll > nor.medEndNetWorthAll]);
  c.push(['C5 무모한 200배: 5분 안 파산 80% 이상, 순자산 100만 달성 0.5~5%', rk.bankrupt5 >= 80 && rk.rich1m >= 0.5 && rk.rich1m <= 5]);
  const perSession = 240 / intervalSec;
  c.push(['C6 4분 세션에 정산 3~6회', perSession >= 3 && perSession <= 6]);
  return c;
}

const results = { runs: RUNS, horizonSec: HORIZON, exp1: [], exp1Scores: {}, exp2: [], exp3: [], exp4: [] };
const fmtT = (sec) => (sec === null ? '-' : `${Math.floor(sec / 60)}분 ${String(sec % 60).padStart(2, '0')}초`);

if (!ONLY || ONLY === 'exp1') {
console.log(`# 실험 1 — 정산 주기 후보별 결과 (각 칸 ${RUNS}회, ${HORIZON / 60}분)\n`);
for (const iv of balance.settlement.simCandidatesSec) {
  const by = {};
  console.log(`## 정산 주기 ${iv}초\n`);
  console.log('| 플레이 방식 | 5분 안 파산 % | 10분 안 파산 % | 30분 안 파산 % | 파산 시각 중앙값 | 30분 안 빚 청산 % | 빚 청산 시각 중앙값 | 순자산 0 돌파 시각 중앙값 | 생존자 30분 순자산 중앙값 | 순자산 100만 달성 % |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const k of Object.keys(SCENARIOS)) {
    const r = cell(k, iv); by[k] = r; results.exp1.push(r);
    console.log(`| ${k} | ${r.bankrupt5} | ${r.bankrupt10} | ${r.bankrupt30} | ${fmtT(r.medBankruptSec)} | ${r.debtFree30} | ${fmtT(r.medDebtFreeSec)} | ${fmtT(r.medSolventSec)} | ${r.medEndNetWorthAlive ?? '-'} | ${r.rich1m} |`);
  }
  const sc = score(by, iv); results.exp1Scores[iv] = sc.map(([name, ok]) => ({ name, ok }));
  console.log(`\n목표 충족: ${sc.filter((x) => x[1]).length}/${sc.length} — ` + sc.map(([n, ok]) => `${ok ? 'O' : 'X'} ${n.split(' ')[0]}`).join(', ') + '\n');
  if (iv === balance.settlement.simCandidatesSec[0]) results.targets = sc.map(([n]) => n);
}

}

const chosen = balance.settlement.intervalSec;
if (!ONLY || ONLY === 'exp2') {
console.log(`# 실험 2 — 정산 주기 ${chosen}초에서 노동 수입 배율 민감도\n`);
console.log('| 노동 수입 배율 | 플레이 방식 | 10분 안 파산 % | 30분 안 파산 % | 30분 안 빚 청산 % | 빚 청산 시각 중앙값 |');
console.log('|---|---|---|---|---|---|');
for (const tapMul of [0.5, 0.75, 1, 1.25, 1.5, 2]) {
  for (const k of ['labor_casual', 'labor_normal', 'labor_diligent', 'trader_cautious']) {
    const r = cell(k, chosen, { tapMul }); results.exp2.push({ tapMul, ...r });
    console.log(`| ${tapMul} | ${k} | ${r.bankrupt10} | ${r.bankrupt30} | ${r.debtFree30} | ${fmtT(r.medDebtFreeSec)} |`);
  }
}

}

if (!ONLY || ONLY === 'exp3') {
console.log(`\n# 실험 3 — 종목·배율별 청산까지 걸리는 시간 (무작위 방향, 손절·익절 없음, 최대 10분, 각 2000회)\n`);
console.log('| 종목 | 배율 | 청산가까지 거리 % | 10분 안 청산 % | 청산 시각 중앙값(초) | 1분 안 청산 % |');
console.log('|---|---|---|---|---|---|');
for (const m of marketsData.markets) {
  for (const lev of [5, 10, 25, 50, 100, 200]) {
    const times = []; let within60 = 0; const n = 2000;
    for (let i = 0; i < n; i++) {
      const rnd = mulberry32(7 * (i + 1) + lev * 131 + m.id.charCodeAt(0) * 17);
      const mk = makeMarket(m, rnd); for (let w = 0; w < 30; w++) mk.step();
      const dir = rnd() < 0.5 ? 1 : -1; const entry = mk.price;
      const liq = dir > 0 ? entry * (1 - 1 / lev + T.maintenanceRate) : entry * (1 + 1 / lev - T.maintenanceRate);
      for (let t = 1; t <= 600; t++) { const p = mk.step(); if (dir > 0 ? p <= liq : p >= liq) { times.push(t); if (t <= 60) within60++; break; } }
    }
    const row = { market: m.id, lev, distPct: Math.round((1 / lev - T.maintenanceRate) * 10000) / 100, liq10min: pct(times.length / n), medSec: median(times), liq1min: pct(within60 / n) };
    results.exp3.push(row);
    console.log(`| ${m.name} | ${lev}배 | ${row.distPct} | ${row.liq10min} | ${row.medSec ?? '-'} | ${row.liq1min} |`);
  }
}
}

// 실험 4 — 거래 규칙별 기대 수익(도토코인). 빚·노동 없이 거래 1건씩만 본다.
if (!ONLY || ONLY === 'exp4') {
console.log(`\n# 실험 4 — 거래 규칙별 1건당 결과 (도토코인, 각 4000건, 수수료·펀딩비 포함)\n`);
console.log('| 진입 방식 | 배율 | 손절 ROE | 익절 ROE | 이긴 비율 % | 청산 비율 % | 1건 평균 ROE % | 보유 시간 중앙값(초) |');
console.log('|---|---|---|---|---|---|---|---|');
const m0 = marketsData.markets[0];
for (const [mode, lev, sl, tp] of [['random', 5, -25, 50], ['trend', 5, -25, 50], ['random', 10, -25, 50], ['trend', 10, -25, 50], ['random', 25, -25, 50], ['trend', 25, -25, 50], ['random', 50, -50, 100], ['trend', 50, -50, 100], ['trend', 100, -50, 100], ['random', 200, null, 100], ['trend', 200, null, 100], ['trend', 200, -50, 100]]) {
  const n = 4000; let wins = 0, liqs = 0, sum = 0; const holds = [];
  for (let i = 0; i < n; i++) {
    const rnd = mulberry32(31 * (i + 1) + lev * 977 + (mode === 'trend' ? 5 : 3));
    const mk = makeMarket(m0, rnd); const W = T.trendWindowTicks; const h = [];
    let dir = 0, guard = 0;
    while (dir === 0 && guard++ < 3000) {
      h.push(mk.step());
      if (h.length <= W) continue;
      if (mode === 'random') dir = rnd() < 0.5 ? 1 : -1;
      else { const ret = h[h.length - 1] / h[h.length - 1 - W] - 1; const thr = 0.5 * m0.sigmaPerTick * Math.sqrt(W); if (ret > thr) dir = 1; else if (ret < -thr) dir = -1; }
    }
    const entry = mk.price; let margin = 1; const N = lev; const openFee = N * T.feeRate;
    const slP = sl === null ? null : entry * (1 + dir * (sl / 100) / lev), tpP = tp === null ? null : entry * (1 + dir * (tp / 100) / lev);
    let roe = null, t = 0;
    while (roe === null && t < 3600) {
      t++; const p = mk.step();
      if (t % chosen === 0) margin -= N * T.fundingRatePerSettlement;
      const liq = dir > 0 ? entry * (1 - margin / N + T.maintenanceRate) : entry * (1 + margin / N - T.maintenanceRate);
      const fin = (px) => ((Math.max(0, margin + dir * (px - entry) / entry * N - N * T.feeRate) - 1 - openFee) * 100);
      if (dir > 0 ? p <= liq : p >= liq) { roe = (0 - 1 - openFee) * 100; liqs++; }
      else if (slP !== null && (dir > 0 ? p <= slP : p >= slP)) roe = fin(mk.jumped ? p : slP);
      else if (tpP !== null && (dir > 0 ? p >= tpP : p <= tpP)) roe = fin(mk.jumped ? p : tpP);
      else if (t === 3600) roe = fin(p);
    }
    if (roe > 0) wins++; sum += roe; holds.push(t);
  }
  const row = { mode, lev, sl, tp, winPct: pct(wins / n), liqPct: pct(liqs / n), meanRoe: Math.round(sum / n * 10) / 10, medHoldSec: median(holds) };
  results.exp4.push(row);
  console.log(`| ${mode === 'trend' ? '추세 추종' : '무작위'} | ${lev}배 | ${sl ?? '없음'} | ${tp} | ${row.winPct} | ${row.liqPct} | ${row.meanRoe} | ${row.medHoldSec} |`);
}
}

mkdirSync(join(ROOT, 'scripts', 'sim', 'out'), { recursive: true });
if (!ONLY) {
  writeFileSync(join(ROOT, 'scripts', 'sim', 'out', 'results.json'), JSON.stringify(results, null, 1));
  console.log('\n결과 저장: scripts/sim/out/results.json');
}
