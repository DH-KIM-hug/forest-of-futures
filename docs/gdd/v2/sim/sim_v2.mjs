#!/usr/bin/env node
// 선물의 숲 v2 — 경제 시뮬레이션 (개정 5: 정산 3분 · 포지션 방치 · 사람의 접속 패턴)
// 실행: node docs/gdd/v2/sim/sim_v2.mjs [--runs 2000] [--only exp1|exp2|exp3|exp4]
// 입력: docs/gdd/v2/balance_v2.draft.json, docs/gdd/v2/sim/data/hl_3m.json (Hyperliquid 3분봉, 다섯 종목 × 5,000개 ≈ 10.4일, 같은 시각)
// 출력: 표준 출력(마크다운 표) + docs/gdd/v2/sim/out/results_v2.json
//
// 시간: 1틱 = 정산 1회 = 실제 3분. 시세는 실제 그대로(증폭·보정 없음). 포지션의 청산·손절·익절은 그 3분봉의 고가·저가로 판정한다.
// 접속: 하루 5번, 한 번에 6~9분(2~3틱). 나머지는 오프라인.
// 오프라인: 포지션은 전 구간 계속 돈다(청산·손절·익절·펀딩비). 경제(자산 수입·이자·생활비)는 자리를 비운 뒤 정산 N회까지만 돌고 멈춘다.
//          연체가 한도 - 1에 닿으면 그 전에 멈춘다(자는 사이 연체로는 파산하지 않는다). 노동·구매·도장·진입은 접속 중에만.
// 넣지 않은 것: 조합(1금융), 친구, 채권처 제안, 유품, 시장 정지·출처 전환.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const B = JSON.parse(readFileSync(join(DIR, '..', 'balance_v2.draft.json'), 'utf8'));
const HL = JSON.parse(readFileSync(join(DIR, 'data', 'hl_3m.json'), 'utf8'));
const args = process.argv.slice(2);
const argv = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? Number(args[i + 1]) : d; };
const RUNS = argv('runs', 2000);
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
function mulberry32(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- 시세 ----------
const T = B.trading, A = B.assets, L = B.lenders, TIP = B.tips, H = B.housing, E = B.economy, OFF = B.offline, HP = B.humanPattern;
const TICKS_PER_DAY = 480, SEC = B.settlement.intervalSec;
const NAMES = ['도토코인', '밤더리움', '삼솔전자', '멍도토', '다섯째 종목(지수 계산용)'];
const COINS = Object.entries(HL.coins).map(([id, c], ci) => {
  const M = c.c.length, f = (a) => Float64Array.from(a, (x) => x / 1e6);
  const o = f(c.o), h = f(c.h), l = f(c.l), cl = f(c.c), vol = Float64Array.from(c.v), r2 = new Float64Array(M + 1), cv = new Float64Array(M + 1);
  for (let m = 0; m < M; m++) { const r = m > 0 ? cl[m] - cl[m - 1] : 0; r2[m + 1] = r2[m] + r * r; cv[m + 1] = cv[m] + vol[m]; }
  return { id, name: NAMES[ci], M, o, h, l, close: cl, vol, r2, cv, sd: Math.sqrt(r2[M] / M) };
});
const M = COINS[0].M;
const IDX = (() => { const close = new Float64Array(M), r2 = new Float64Array(M + 1); for (let m = 0; m < M; m++) { let a = 0; for (const p of COINS) a += p.close[m]; close[m] = a / COINS.length; const r = m > 0 ? close[m] - close[m - 1] : 0; r2[m + 1] = r2[m] + r * r; }
  const sigma = (m) => { const a = Math.max(1, m - E.sigmaWindowTicks); return Math.sqrt((r2[m + 1] - r2[a]) / Math.max(1, m + 1 - a) * E.windowTicks) || 1e-6; }; // 평소의 15분 변동 폭
  return { close, sigma }; })();
const TRADABLE = COINS.slice(0, 4);
const econMul = (m) => { const z = (IDX.close[m] - IDX.close[m - E.windowTicks]) / IDX.sigma(m - 1); return z <= E.crashBelowSigma ? [E.crashMul, 'crash'] : z <= E.slumpBelowSigma ? [E.slumpMul, 'slump'] : z >= E.boomAboveSigma ? [E.boomMul, 'boom'] : [1, 'normal']; };

// ---------- 정보 규칙: 방금 끝난 정산(3분봉)까지의 값만 본다 ----------
const sdN = (p, m) => Math.sqrt((p.r2[m + 1] - p.r2[m - 39]) / 40) || 1e-6; // 최근 2시간의 3분 변동성
const vAvg = (p, m) => (p.cv[m] - p.cv[m - 40]) / 40 || 1;
const ret = (p, m, k) => p.close[m] - p.close[m - k];
const RULE = {
  breakout: (p, m) => { if (p.vol[m] < 2.5 * vAvg(p, m)) return 0; let hi = -1e9, lo = 1e9; for (let u = m - 5; u < m; u++) { if (p.close[u] > hi) hi = p.close[u]; if (p.close[u] < lo) lo = p.close[u]; } return p.close[m] > hi ? 1 : p.close[m] < lo ? -1 : 0; },
  flow: (p, m) => { if (p.vol[m] < 3 * vAvg(p, m)) return 0; const x = ret(p, m, 1), th = sdN(p, m); return x > th ? 1 : x < -th ? -1 : 0; },
  mom1: (p, m) => { const x = ret(p, m, 1), th = 2 * sdN(p, m); return x > th ? 1 : x < -th ? -1 : 0; },
  mom5: (p, m) => { const x = ret(p, m, 5), th = 1.5 * sdN(p, m) * Math.sqrt(5); return x > th ? 1 : x < -th ? -1 : 0; },
  chaseLong: (p, m) => (RULE.mom5(p, m) > 0 ? 1 : 0),
  dipBuy: (p, m) => (ret(p, m, 5) < -2 * sdN(p, m) * Math.sqrt(5) ? 1 : 0),
  flowFade: (p, m) => -RULE.flow(p, m),
  random: (p, m, rnd) => (rnd() < 0.15 ? (rnd() < 0.5 ? 1 : -1) : 0),
};

// ---------- 가상의 플레이어 ----------
const POL = {
  idle:           { label: '접속만 하고 아무것도 안 함', tps: 0 },
  labor_normal:   { label: '쳇바퀴만(접속 중 초당 1.5회, 설비 없음), 캐는 즉시 팔고 남는 돈은 도장', tps: 1.5, repay: true },
  engine_casual:  { label: '채굴 + 바로 팔기: 쳇바퀴(초당 1회) + 설비, 흑자 전환 뒤 빚부터', tps: 1, repay: true, buy: true },
  engine_normal:  { label: '채굴 + 바로 팔기: 쳇바퀴(초당 1.5회) + 설비, 흑자 전환 뒤 빚부터', tps: 1.5, repay: true, buy: true },
  engine_day1:    { label: '첫날만 접속(노동 1.5회 + 자산), 그 뒤 안 옴', tps: 1.5, repay: true, buy: true, quitAfterDay: 1 },
  mine_hold:      { label: '채굴 + 보유: 노동(1.5회) + 설비. 캔 코인을 팔지 않고 쥔다(지출에 필요한 만큼만 팖). 빚 도장은 안 찍음', tps: 1.5, buy: true, hold: true },
  mine_hold_doge: { label: '채굴 + 보유(멍도토): 위와 같되 멍도토를 캠', tps: 1.5, buy: true, hold: true, mineCoin: 3 },
  mine_hold_hedge:{ label: '채굴 + 보유 + 숏 보험: 위(도토코인)와 같되 지갑 평가액만큼 캐는 종목 10배 숏을 걸어 둔다(8시간마다 다시 맞춤)', tps: 1.5, buy: true, hold: true,
                    trade: { lev: 10, pct: 1, sl: null, tp: null, hold: 160, max: 1, follow: 'hedge' }, tradeBank: 0 },
  expander:       { label: '확장형: 노동(1회) + 캐피탈 담보 대출로 자산을 늘림(불경기에도 이자를 낼 수 있을 때만)', tps: 1, repay: true, buy: true, leverage: 'stress' },
  mixed_reader:   { label: '혼합: 노동(1.5회) + 자산. 수지가 맞으면 3만 + 번 돈을 밑천으로, 속보 두 가지만 따라 100배(손절-50/익절+150), 포지션 2개까지, 8시간 보유', tps: 1.5, repay: true, buy: true,
                    tradeBank: 30000, trade: { lev: 100, pct: 0.8, sl: -50, tp: 150, hold: 160, max: 2, follow: 'reliable' } },
  mixed_bold:     { label: '혼합·과감: 위와 같되 모든 말을 따라 200배(손절 없음/익절+200), 포지션 4개까지, 밤새 둠', tps: 1.5, repay: true, buy: true,
                    tradeBank: 30000, trade: { lev: 200, pct: 0.8, sl: null, tp: 200, hold: 480, max: 4, follow: 'all' } },
  trader_swing:   { label: '거래만·느긋: 자산 없이 현금 전부가 밑천. 속보를 따라 50배(손절-50/익절+150), 포지션 4개까지, 8시간 보유', tps: 1.5, repay: true, bankFromStart: true,
                    tradeBank: 1e12, trade: { lev: 50, pct: 0.8, sl: -50, tp: 150, hold: 160, max: 4, follow: 'reliable' } },
  trader_only:    { label: '거래만: 자산 없이 현금 전부가 밑천. 모든 말을 따라 100배(손절-50/익절+150), 포지션 4개까지, 8시간 보유', tps: 1.5, repay: true, bankFromStart: true,
                    tradeBank: 1e12, trade: { lev: 100, pct: 0.8, sl: -50, tp: 150, hold: 160, max: 4, follow: 'all' } },
  trader_200:     { label: '거래만·200배: 위와 같되 200배, 손절 없음/익절+200, 하루까지 둠', tps: 1.5, repay: true, bankFromStart: true,
                    tradeBank: 1e12, trade: { lev: 200, pct: 0.8, sl: null, tp: 200, hold: 480, max: 4, follow: 'all' } },
  tip_believer:   { label: '맹신: 노동(1회) + 자산. 수지가 맞으면 3만 + 번 돈을 밑천으로 모든 말을 따라 100배(손절 없음/익절+150), 포지션 4개까지, 밤새 둠', tps: 1, repay: true, buy: true,
                    tradeBank: 30000, trade: { lev: 100, pct: 0.8, sl: null, tp: 150, hold: 480, max: 4, follow: 'all' } },
  reckless_200:   { label: '200배 한 방: 정산 두 번 낼 돈만 남기고 전부(무작위 방향, 손절 없음/익절+100), 걸어 두고 나감. 노동 없음', tps: 0, trade: { lev: 200, pct: 1, sl: null, tp: 100, hold: 1e9, max: 1, follow: 'random' }, tradeBank: 1e12, bankFromStart: true },
  greedy:         { label: '욕심: 노동(1회) + 빚내서 자산 + 벌이를 안 따지고 집부터. 수지가 맞으면 현금의 80%를 밑천으로 모든 말을 따라 200배(손절 없음/익절+200), 포지션 4개까지, 밤새 둠', tps: 1, repay: true, buy: true, leverage: 'any', vanity: true,
                    tradeBank: 1e12, bankShare: 0.8, trade: { lev: 200, pct: 1, sl: null, tp: 200, hold: 480, max: 4, follow: 'all' } },
};
const PAY = ['tax', 'shark2', 'shark1', 'capital'];

// 사람의 접속 패턴: 하루 5번(8·12·16·20·23시 ± 30분), 한 번에 2~3틱(6~9분)
function schedule(rnd, HOR, quitAfterDay) {
  const on = new Uint8Array(HOR + 2);
  for (let d = 0; d * TICKS_PER_DAY < HOR; d++) { if (quitAfterDay && d >= quitAfterDay) break;
    for (const hr of HP.sessionHours) { const st = d * TICKS_PER_DAY + Math.round(((hr - HP.sessionHours[0]) * 60 + (rnd() - 0.5) * HP.jitterMinutes) / 3), len = HP.sessionTicks[0] + Math.floor(rnd() * (HP.sessionTicks[1] - HP.sessionTicks[0] + 1));
      for (let u = Math.max(1, st + 1); u <= st + len && u <= HOR; u++) on[u] = 1; } }
  on[1] = 1; on[2] = 1; return on;
}

function runGen(pol, start, seed, opt = {}) {
  const rnd = mulberry32(seed), HOR = opt.horizon ?? HP.generationDays * TICKS_PER_DAY;
  const off = 45 + Math.floor(rnd() * (M - HOR - 50));
  const on = schedule(rnd, HOR, pol.quitAfterDay);
  const s = { cash: start.cash, debt: { capital: 0, shark1: 0, shark2: 0, tax: 0, ...start.debt }, streak: { capital: 0, shark1: 0, shark2: 0, tax: 0 }, upStreak: 0,
    units: [...(start.units ?? A.tiers.map(() => 0))], house: start.house ?? 0, maxTier: -1, seized: 0, taxSold: 0, capInt: { capital: 0, shark1: 0, shark2: 0, tax: 0 },
    pos: [], liqs: 0, liqsOffline: 0, trades: 0, tipTrades: 0, tradePnl: 0, tradeLossCycle: 0, tipLossCycle: 0, lastSeizeSettle: -99, settles: 0, srcCd: {}, wasBlack: false, blackSeen: false, offCredit: 0 };
  for (let i = 0; i < s.units.length; i++) if (s.units[i] > 0) s.maxTier = i;
  const regular = 1 + (start.regular ?? 0), tapTrait = start.trait === 'silver' ? 0.5 : 1;
  // 채굴: 캔 코인은 지갑(s.w = 기준가 가치 단위)에 쌓인다. 지금 가치 = s.w × px(m)
  const mc = TRADABLE[pol.mineCoin ?? 0], MN = B.mining, shock = opt.shock ?? 0, px = (m) => Math.exp(mc.close[m] - mc.close[off]) * (1 + shock * Math.min(1, (m - off) / (opt.horizon ?? HP.generationDays * TICKS_PER_DAY))); // shock: 가정 실험용(3일에 걸쳐 그만큼 더 내림. 채굴·지갑 가치에만 적용)
  s.w = 0; let soldForced = 0;
  const sellValue = (v, m, fee) => { const val = Math.min(v, s.w * px(m)); if (val <= 0) return 0; s.w -= val / px(m); s.cash += val * (1 - fee); return val; };
  const payCash = (x, m) => { if (s.cash < x && s.w > 0) sellValue((x - s.cash) / (1 - MN.sellFee), m, MN.sellFee); s.cash -= x; };
  const out = { bankruptAt: null, cause: null, offlineEnd: false, debtFreeAt: null, blackAt: null, peak: -Infinity, endNW: 0 };
  const totalDebt = () => s.debt.capital + s.debt.shark1 + s.debt.shark2 + s.debt.tax;
  const power = () => gross() / (1 - A.powerShare) * A.powerShare; // 전기세: 기준 매출의 70%(도토리 값). 정산 때 지갑 코인에서 시가로 먼저 뗀다
  let powerShort = 0;
  const upkeep = () => B.living.byHouse[s.house] + powerShort;
  const due = () => PAY.reduce((a, id) => a + s.debt[id] * L[id].rate, 0) + upkeep();
  const gross = () => { let v = 0; for (let i = 0; i < A.tiers.length; i++) v += s.units[i] * A.tiers[i].perSettle; return v * regular; };
  const rigMined = () => gross() / (1 - A.powerShare); // 설비가 정산마다 캐는 코인(기준가 가치)
  const assetValue = () => A.tiers.reduce((a, tr, i) => a + s.units[i] * tr.cost * A.appraisalRate, 0);
  const unitCost = (i) => Math.round(A.tiers[i].cost * Math.pow(A.costGrowth, s.units[i]));
  const capRoom = () => Math.max(0, L.capital.limitByHouse[s.house] + A.collateralLtvCapital * assetValue() - s.debt.capital); // (지갑 담보는 가상 플레이어가 쓰지 않는다)
  const posEquity = (m) => s.pos.reduce((a, q) => a + Math.max(0, q.margin + q.dir * (Math.exp(q.p.close[m] - q.entry) - 1) * q.notional), 0);
  const settle = (q, back, liquidated, online) => {
    const pnl = back - q.margin0 - q.fee; s.cash += back; s.tradePnl += pnl;
    if (pnl < 0) { s.tradeLossCycle += -pnl; if (q.tip) s.tipLossCycle += -pnl; }
    if (liquidated) { s.liqs++; if (!online) s.liqsOffline++; }
  };

  for (let t = 1; t <= HOR; t++) {
    const m = off + t, online = on[t] === 1;
    if (online) s.offCredit = OFF.maxSettlements; // 접속할 때마다 오프라인 정산 몫이 다시 찬다
    // 1) 포지션: 접속 여부와 무관하게 그 3분의 고가·저가로 판정
    if (s.pos.length) {
      const keep = [];
      for (const q of s.pos) {
        q.margin -= q.notional * T.fundingRate;
        const adv = q.dir > 0 ? q.p.l[m] : q.p.h[m], fav = q.dir > 0 ? q.p.h[m] : q.p.l[m];
        const rAdv = q.dir * (Math.exp(adv - q.entry) - 1), rFav = q.dir * (Math.exp(fav - q.entry) - 1), rC = q.dir * (Math.exp(q.p.close[m] - q.entry) - 1);
        const liqRet = q.margin / q.notional - T.maintenanceRate, feeOut = q.notional * T.feeRate;
        if (rAdv <= -liqRet) settle(q, 0, true, online);
        else if (q.sl !== null && rAdv * q.notional / q.margin0 * 100 <= q.sl) settle(q, Math.max(0, q.margin + (q.sl / 100) * q.margin0 - feeOut), false, online);
        else if (q.tp !== null && rFav * q.notional / q.margin0 * 100 >= q.tp) settle(q, Math.max(0, q.margin + (q.tp / 100) * q.margin0 - feeOut), false, online);
        else if (online && (t >= q.until || (pol.trade.follow !== 'random' && s.cash < due()))) settle(q, Math.max(0, q.margin + rC * q.notional - feeOut), false, online); // 기한이 됐거나 정산 낼 돈이 없으면 정리
        else keep.push(q);
      }
      s.pos = keep;
      if (!s.pos.length && s.cash < T.wipeoutBelow && totalDebt() > 0 && s.units.every((u) => u === 0) && s.tradeLossCycle > 0) { // 청산으로 빈손
        out.bankruptAt = t; out.cause = s.tipLossCycle >= 0.5 * s.tradeLossCycle ? 'TIP' : 'LIQ'; out.offlineEnd = !online; break;
      }
    }
    // 2) 경제를 돌릴지: 접속 중이면 돈다. 오프라인이면 몫이 남았고 연체가 한도 - 1에 닿지 않았을 때만
    let econRuns = online;
    if (!online && s.offCredit > 0) { const danger = PAY.some((id) => s.debt[id] > 0 && s.streak[id] >= L[id].maxOverdue - 1) || s.upStreak >= H.upkeepMaxOverdue - 1; if (!danger) { econRuns = true; s.offCredit--; } }
    if (econRuns) {
      // 수입
      let mined = rigMined();
      if (online && pol.tps > 0) mined += pol.tps * SEC * (B.labor.basePerTap + B.labor.autoShare * gross() / SEC) * tapTrait;
      for (const id of PAY) if (s.streak[id] >= 1 && s.debt[id] > 0) { const g = Math.min(s.debt[id], mined * px(m) * B.seizure.garnishRate); s.debt[id] -= g; mined -= g / px(m); }
      s.w += mined;
      { const pv = power(), fromW = Math.min(pv, s.w * px(m)); s.w -= fromW / px(m); powerShort = pv - fromW; } // 전기세: 지갑에서 떼고, 모자라면 생활비와 함께 현금으로
      if (online) { if (!pol.hold) sellValue(1e18, m, MN.sellFee); else if (s.cash < 4 * due()) sellValue((4 * due() - s.cash) / (1 - MN.sellFee), m, MN.sellFee); } // 보유형도 다음 접속까지 낼 돈(정산 4회분)은 제값에 팔아 둔다
      // 3) 접속 중의 결정: 거래, 자산, 도장, 집
      if (online) {
        const autoNet = rigMined() * px(m) - power(), fixed = due() - powerShort; const isBlack = autoNet >= 1.6 * fixed; if (isBlack) s.wasBlack = true; if (autoNet >= fixed) s.blackSeen = true; // 흑자 전환: 설비가 캐는 값 - 전기세 ≥ 이자 + 생활비
        const flowOk = pol.bankFromStart || s.blackSeen;
        const bank = pol.trade && flowOk ? (pol.bankShare ? pol.bankShare * s.cash : (pol.tradeBank ?? 0) + Math.max(0, s.tradePnl)) : 0;
        if (pol.trade && (flowOk || pol.trade.follow === 'hedge') && s.pos.length < pol.trade.max) {
          const tr = pol.trade, cands = [];
          if (tr.follow === 'random') cands.push([TRADABLE[Math.floor(rnd() * 4)], rnd() < 0.5 ? 1 : -1, null]);
          else if (tr.follow === 'hedge') { if (s.w * px(m) >= 20000) cands.push([mc, -1, null]); }
          else for (let ci = 0; ci < TRADABLE.length; ci++) { if (s.pos.some((q) => q.p === TRADABLE[ci])) continue;
            for (const src of TIP.sources) { const cd = src.id + ci; if ((s.srcCd[cd] ?? 0) > t) continue; const d = RULE[src.rule](TRADABLE[ci], m, rnd); if (!d) continue; s.srcCd[cd] = t + TIP.sourceCooldownTicks;
              if (tr.follow === 'all' || (tr.follow === 'reliable' && src.reliable)) { cands.push([TRADABLE[ci], d, src.id]); break; } } }
          for (const [p, dir, tip] of cands) {
            if (s.pos.length >= tr.max) break;
            if (tr.follow === 'hedge') { const want = Math.floor(s.w * px(m) / tr.lev * 1.1); if (s.cash < want + 1.2 * due()) sellValue((want + 1.2 * due() - s.cash) / (1 - MN.sellFee), m, MN.sellFee); }
            const avail = tr.follow === 'hedge' ? Math.floor(s.w * px(m) / tr.lev) : Math.min(s.cash, bank >= 1e11 ? s.cash : bank);
            let margin = Math.floor(Math.min(avail * tr.pct / (tr.max - s.pos.length), Math.max(0, s.cash - (tr.pct >= 1 && tr.max === 1 ? 0 : 1.2 * due()))));
            if (tr.pct >= 1 && tr.max === 1) margin = Math.floor(Math.max(0, s.cash - 2.2 * due()) / (1 + tr.lev * T.feeRate)); // 한 방: 정산 두 번 낼 돈만 남기고 전부
            margin = Math.min(margin, Math.floor(T.maxNotional / tr.lev));
            const notional = margin * tr.lev, fee = notional * T.feeRate;
            if (margin >= T.minMargin && s.cash >= margin + fee) { s.cash -= margin + fee; s.trades++; if (tip) s.tipTrades++; s.pos.push({ p, dir, entry: p.close[m], margin, margin0: margin, notional, fee, sl: tr.sl, tp: tr.tp, tip, until: t + tr.hold }); }
          }
        }
        const locked = pol.trade && flowOk && !pol.bankShare ? Math.min(bank, 1e12) : 0;
        const keep = 1.5 * due() + (locked >= 1e11 ? 1e12 : locked), keepRepay = B.policyReserve.repayKeepSettlements * due() + (locked >= 1e11 ? 1e12 : locked);
        if (pol.buy && (pol.leverage || !s.wasBlack || totalDebt() <= 0)) {
          const topRate = s.debt.tax > 0 ? 1 : Math.max(...PAY.map((id) => (s.debt[id] > 0 ? L[id].rate : 0)));
          let bought = true;
          while (bought) { bought = false; let best = -1, bestY = Math.max(topRate, 0), bestLoan = 0;
            for (let i = 0; i < A.tiers.length; i++) { if (s.units[i] >= A.maxUnits || A.tiers[i].needHouse > s.house) continue;
              const c = unitCost(i), have = Math.max(0, s.cash + (pol.hold ? s.w * px(m) * (1 - MN.sellFee) : 0) - keep); let loan = 0;
              if (have < c) { if (!pol.leverage || s.debt.tax > 0) continue; loan = Math.ceil((c - Math.max(0, s.cash - 1.5 * due())) / 50000) * 50000; if (loan > capRoom() || loan <= 0) continue;
                if (pol.leverage === 'stress' && (gross() + A.tiers[i].perSettle * regular) * 0.33 < 1.2 * (due() - powerShort + loan * L.capital.rate)) continue; } // 코인 값이 20% 빠져도(순수입 3분의 1) 이자를 낼 수 있나
              const y = A.tiers[i].perSettle * regular / c; if (y > bestY) { bestY = y; best = i; bestLoan = loan; } }
            if (best >= 0) { if (bestLoan > 0) { s.debt.capital += bestLoan; s.cash += bestLoan; } payCash(unitCost(best), m); s.units[best]++; s.maxTier = Math.max(s.maxTier, best); bought = true; } }
        }
        if (pol.bankFromStart && totalDebt() > 0 && !s.pos.length && s.cash - 1.5 * due() >= totalDebt()) { s.cash -= totalDebt(); for (const id of PAY) s.debt[id] = 0; }
        if (pol.repay && totalDebt() > 0) for (const id of PAY) { if (pol.leverage && id === 'capital') continue;
          const pay = Math.min(s.debt[id], Math.floor((s.cash - keepRepay) / 10000) * 10000); if (pay > 0) { s.cash -= pay; s.debt[id] -= pay; }
          if (s.debt[id] > 0 && s.debt[id] < 10000 && s.cash - keepRepay >= s.debt[id]) { s.cash -= s.debt[id]; s.debt[id] = 0; } }
        const clean = pol.leverage ? s.debt.tax + s.debt.shark1 + s.debt.shark2 <= 0 : totalDebt() <= 0;
        if (pol.buy && clean && s.house < 4) { const cost = H.price[s.house + 1] - H.price[s.house] * H.sellRate, nu = B.living.byHouse[s.house + 1];
          if (pol.vanity ? s.cash >= cost + nu : (s.cash >= cost + 3 * nu && gross() >= 2 * nu)) { s.cash -= cost; s.house++; } }
      }
      if (out.debtFreeAt === null && totalDebt() <= 0) out.debtFreeAt = t;
      if (out.blackAt === null && rigMined() * px(m) - power() >= due() - powerShort) out.blackAt = t;
      // 4) 정산
      s.settles++; const sn = s.settles; let bankrupt = null, shortfall = 0;
      if (sn === L.tax.deadlineSettlements && s.debt.tax > 0) { const pay = Math.min(s.debt.tax, Math.max(0, s.cash)); s.cash -= pay; s.debt.tax -= pay;
        for (let i = s.units.length - 1; i >= 0 && s.debt.tax > 0; i--) while (s.units[i] > 0 && s.debt.tax > 0) { s.units[i]--; s.taxSold++; const got = A.tiers[i].cost * A.auctionRate, use = Math.min(got, s.debt.tax); s.debt.tax -= use; s.cash += got - use; }
        if (s.debt.tax > 0) { s.debt.capital += s.debt.tax; s.debt.tax = 0; } }
      const grace = sn <= (start.graceSettlements ?? 0);
      { const need = (grace ? 0 : PAY.reduce((a, id) => a + s.debt[id] * L[id].rate, 0)) + upkeep(); // 현금이 모자라면 지갑에서 급매(수수료 3%)
        if (s.cash < need && s.w > 0) soldForced += sellValue((need - s.cash) / (1 - MN.forcedSellFee), m, MN.forcedSellFee); }
      for (const id of PAY) { if (s.debt[id] <= 0) { s.streak[id] = 0; continue; }
        const d = grace ? 0 : s.debt[id] * L[id].rate, pay = Math.min(d, Math.max(0, s.cash)); s.cash -= pay;
        if (pay + 1e-9 < d) { shortfall += d - pay; s.debt[id] += d - pay; s.capInt[id] += d - pay; s.streak[id]++;
          if (s.streak[id] >= L[id].maxOverdue) { let pick = -1;
            if (id === 'shark1') { for (let i = 0; i < s.units.length; i++) if (s.units[i] > 0) { pick = i; break; } } else for (let i = s.units.length - 1; i >= 0; i--) if (s.units[i] > 0) { pick = i; break; }
            if (pick < 0) { if (!bankrupt) bankrupt = id; } else { s.units[pick]--; s.seized++; s.lastSeizeSettle = sn; s.debt[id] = Math.max(0, s.debt[id] - A.tiers[pick].cost * A.auctionRate); s.streak[id] = L[id].maxOverdue - 1; } }
        } else s.streak[id] = 0; }
      { const d = upkeep(), pay = Math.min(d, Math.max(0, s.cash)); s.cash -= pay;
        if (pay + 1e-9 < d) { if (s.house === 0) s.debt.capital += d - pay; else { shortfall += d - pay; s.upStreak++; if (s.upStreak >= H.upkeepMaxOverdue && !bankrupt) bankrupt = 'upkeep'; } } else s.upStreak = 0; }
      if (bankrupt) { out.bankruptAt = t;
        // 원인: 거래 손실(마지막으로 다 낸 정산 뒤에 쌓인 것)이 미납액 이상이면 청산·낚임
        out.cause = s.tradeLossCycle >= shortfall && s.tradeLossCycle > 0 ? (s.tipLossCycle >= 0.5 * s.tradeLossCycle ? 'TIP' : 'LIQ')
          : sn - s.lastSeizeSettle <= 3 ? 'SEIZE' : bankrupt === 'upkeep' ? 'UPKEEP' : bankrupt === 'capital' ? 'BANK' : bankrupt === 'tax' ? 'LEGACY' : 'SHARK';
        break; }
      if (shortfall === 0) { s.tradeLossCycle = 0; s.tipLossCycle = 0; }
    }
    const nw = s.cash + s.w * px(m) + posEquity(m) + assetValue() + H.price[s.house] * H.sellRate - totalDebt();
    if (nw > out.peak) out.peak = nw; out.endNW = nw;
  }
  out.coinRet = px(off + Math.min(HOR, out.bankruptAt ?? HOR)) - 1; out.soldForced = soldForced;
  out.estate = { cash: Math.max(0, s.cash + (out.bankruptAt === null ? posEquity(off + HOR) + s.w * px(off + HOR) * (1 - MN.sellFee) : 0)), units: [...s.units], maxTier: s.maxTier, house: s.house, bankrupt: out.bankruptAt !== null,
    debt: { capital: s.debt.capital + s.debt.tax, shark1: Math.max(0, s.debt.shark1 - s.capInt.shark1), shark2: Math.max(0, s.debt.shark2 - s.capInt.shark2) } };
  Object.assign(out, { trades: s.trades, liqs: s.liqs, liqsOffline: s.liqsOffline, seized: s.seized, taxSold: s.taxSold, tradePnl: s.tradePnl, settles: s.settles });
  return out;
}

// ---------- 집계 ----------
const median = (a) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const q = (a, f) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * f))]; };
const pct = (x) => Math.round(x * 1000) / 10;
const fmtD = (ticks) => { if (ticks === null || ticks === undefined) return '-'; const min = ticks * 3; return min < 120 ? `${min}분` : min < 2880 ? `${(min / 60).toFixed(1)}시간` : `${(min / 1440).toFixed(1)}일`; };
const won = (x) => (x === null || x === undefined ? '-' : Math.round(x).toLocaleString('en-US'));
const GEN2 = () => ({ cash: B.start.cash, debt: { ...B.start.debts }, house: 0 });
const results = { runs: RUNS, exp1: [], exp2: [], exp3: [], exp4: [] };

if (!ONLY || ONLY === 'exp1') {
  console.log(`# 실험 1 — 2세대(현금 10만, 빚 30만), 실제 ${HP.generationDays}일, 하루 ${HP.sessionHours.length}번 접속(한 번에 6~9분), 각 ${RUNS}회\n`);
  console.log('| 플레이 방식 | 첫날 안 파산 % | 3일 안 파산 % | 파산 시각 10%·중앙·90% | 3일 안 빚 청산 % | 빚 청산 중앙값 | 흑자 전환 % | 흑자 전환 중앙값 | 생존자 순자산 중앙값 | 순자산 100만 % | 거래 건수·손익(중앙값) | 청산 건수(평균) · 그중 자리 비운 사이 % | 파산 원인 % | 자리 비운 사이 끝난 파산 % |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const k of Object.keys(POL)) {
    const rs = []; for (let i = 0; i < RUNS; i++) rs.push(runGen(POL[k], GEN2(), 1000003 * (i + 1) + k.length * 104729));
    const bk = rs.filter((r) => r.bankruptAt !== null), df = rs.filter((r) => r.debtFreeAt !== null && (r.bankruptAt === null || r.debtFreeAt < r.bankruptAt)), alive = rs.filter((r) => r.bankruptAt === null), bl = rs.filter((r) => r.blackAt !== null);
    const causes = {}; for (const r of bk) causes[r.cause] = (causes[r.cause] ?? 0) + 1; const liqs = rs.reduce((a, r) => a + r.liqs, 0), liqsOff = rs.reduce((a, r) => a + r.liqsOffline, 0);
    const row = { policy: k, bankruptDay1: pct(bk.filter((r) => r.bankruptAt <= TICKS_PER_DAY).length / RUNS), bankrupt: pct(bk.length / RUNS), bkQ: [q(bk.map((r) => r.bankruptAt), 0.1), median(bk.map((r) => r.bankruptAt)), q(bk.map((r) => r.bankruptAt), 0.9)],
      debtFree: pct(df.length / RUNS), medDebtFree: median(df.map((r) => r.debtFreeAt)), black: pct(bl.length / RUNS), medBlack: median(bl.map((r) => r.blackAt)), medEndNWAlive: alive.length ? median(alive.map((r) => r.endNW)) : null,
      rich1m: pct(rs.filter((r) => r.peak >= 1e6).length / RUNS), medTrades: median(rs.map((r) => r.trades)), medTradePnl: median(rs.map((r) => r.tradePnl)), liqsPerRun: +(liqs / RUNS).toFixed(2), liqsOfflinePct: liqs ? pct(liqsOff / liqs) : null,
      causes: Object.fromEntries(Object.entries(causes).map(([c, n]) => [c, pct(n / RUNS)])), offlineEnd: bk.length ? pct(bk.filter((r) => r.offlineEnd).length / bk.length) : null };
    results.exp1.push(row);
    console.log(`| ${k} | ${row.bankruptDay1} | ${row.bankrupt} | ${row.bkQ.map(fmtD).join(' · ')} | ${row.debtFree} | ${fmtD(row.medDebtFree)} | ${row.black} | ${fmtD(row.medBlack)} | ${won(row.medEndNWAlive)} | ${row.rich1m} | ${row.medTrades ? `${row.medTrades}건 ${won(row.medTradePnl)}` : '-'} | ${row.liqsPerRun ? `${row.liqsPerRun} · ${row.liqsOfflinePct}` : '-'} | ${Object.entries(row.causes).map(([c, n]) => `${c} ${n}`).join(', ') || '-'} | ${row.offlineEnd ?? '-'} |`);
  }
  // 캐는 종목이 내린 세대 / 오른 세대로 나눠 본다
  console.log('\n## 캐는 종목의 3일 등락별 (내린 3분의 1 · 가운데 · 오른 3분의 1)\n');
  console.log('| 플레이 방식 | 구간 | 그 구간의 종목 등락 중앙값 % | 파산 % | 3일 뒤 순자산 중앙값(생존자) | 급매로 판 금액 중앙값 |'); console.log('|---|---|---|---|---|---|');
  for (const k of ['engine_normal', 'mine_hold', 'mine_hold_hedge', 'mine_hold_doge']) {
    const rs = []; for (let i = 0; i < RUNS; i++) rs.push(runGen(POL[k], GEN2(), 1000003 * (i + 1) + k.length * 104729));
    rs.sort((a, b) => a.coinRet - b.coinRet); const third = Math.floor(rs.length / 3);
    [['내린 3분의 1', rs.slice(0, third)], ['가운데', rs.slice(third, 2 * third)], ['오른 3분의 1', rs.slice(2 * third)]].forEach(([name, g]) => {
      const alive = g.filter((r) => r.bankruptAt === null); const row = { policy: k, bucket: name, coinRet: +(median(g.map((r) => r.coinRet)) * 100).toFixed(1), bankrupt: pct(g.filter((r) => r.bankruptAt !== null).length / g.length), medNW: alive.length ? median(alive.map((r) => r.endNW)) : null, forced: median(g.map((r) => r.soldForced)) };
      (results.exp1b ??= []).push(row); console.log(`| ${k} | ${name} | ${row.coinRet} | ${row.bankrupt} | ${won(row.medNW)} | ${won(row.forced)} |`); });
  }
  // 가정 실험: 기록에는 큰 폭락이 없어서, 캐는 종목이 3일에 걸쳐 추가로 20% / 35% / 50% 내린다고 치고 다시 돌린다(채굴·지갑 가치에만 적용, 숏 보험의 이익은 반영 못 함)
  console.log('\n## 가정 실험 — 캐는 종목이 3일에 걸쳐 더 내린다면\n');
  console.log('| 플레이 방식 | 추가 하락 | 3일 안 파산 % | 3일 안 빚 청산 % | 생존자 순자산 중앙값 |'); console.log('|---|---|---|---|---|');
  for (const k of ['engine_normal', 'engine_casual', 'mine_hold']) for (const shock of [-0.2, -0.35, -0.5]) {
    const rs = []; for (let i = 0; i < RUNS; i++) rs.push(runGen(POL[k], GEN2(), 1000003 * (i + 1) + k.length * 104729, { shock }));
    const bk = rs.filter((r) => r.bankruptAt !== null), alive = rs.filter((r) => r.bankruptAt === null), df = rs.filter((r) => r.debtFreeAt !== null && (r.bankruptAt === null || r.debtFreeAt < r.bankruptAt));
    const row = { policy: k, shock, bankrupt: pct(bk.length / RUNS), debtFree: pct(df.length / RUNS), medNW: alive.length ? median(alive.map((r) => r.endNW)) : null };
    (results.exp1c ??= []).push(row); console.log(`| ${k} | ${shock * 100}% | ${row.bankrupt} | ${row.debtFree} | ${won(row.medNW)} |`);
  }
  console.log('\n플레이 방식 설명'); for (const [k, v] of Object.entries(POL)) console.log(`- ${k}: ${v.label}`);
}

if (!ONLY || ONLY === 'exp2') {
  console.log(`\n# 실험 2 — 출처별 거래 1건 (100배, 손절 -50% / 익절 +150%, 보유 최대 8시간, 수수료·펀딩비 포함. 네 종목 × ${(M * 3 / 1440).toFixed(1)}일)\n`);
  console.log('| 출처 | 말하는 규칙 | 건수 | 이긴 비율 % | 청산·손절로 끝난 비율 % | 1건 평균 ROE % | 앞 절반 | 뒤 절반 | 거꾸로 했을 때 |'); console.log('|---|---|---|---|---|---|---|---|---|');
  const lev = 100, sl = -50, tp = 150, hold = 160, rnd = mulberry32(4242);
  const one = (p, m0, d) => { let margin = 1; const fee = lev * T.feeRate; for (let m = m0 + 1; m <= m0 + hold; m++) { margin -= lev * T.fundingRate; const adv = d > 0 ? p.l[m] : p.h[m], fav = d > 0 ? p.h[m] : p.l[m];
    const rA = d * (Math.exp(adv - p.close[m0]) - 1), rF = d * (Math.exp(fav - p.close[m0]) - 1);
    if (rA <= -(margin / lev - T.maintenanceRate)) return [-100 - fee * 100, 1]; if (rA * lev * 100 <= sl) return [sl - (1 - margin) * 100 - 2 * fee * 100, 1]; if (rF * lev * 100 >= tp) return [tp - (1 - margin) * 100 - 2 * fee * 100, 0]; }
    return [d * (Math.exp(p.close[m0 + hold] - p.close[m0]) - 1) * lev * 100 - (1 - margin) * 100 - 2 * fee * 100, 0]; };
  for (const src of [...TIP.sources, { id: 'none', name: '정보 없이 무작위 진입', rule: 'random', ruleText: '-' }]) {
    const acc = [[], []], rev = []; let stopped = 0;
    TRADABLE.forEach((p) => { for (let m = 45; m < M - hold - 2; m++) { const d = RULE[src.rule](p, m, rnd); if (!d) continue; const [roe, st] = one(p, m, d); acc[m < M / 2 ? 0 : 1].push(roe); stopped += st; rev.push(one(p, m, -d)[0]); m += TIP.sourceCooldownTicks; } });
    const all = [...acc[0], ...acc[1]], mean = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null);
    const row = { id: src.id, name: src.name, n: all.length, win: pct(all.filter((x) => x > 0).length / all.length), stopped: pct(stopped / all.length), roe: mean(all), first: mean(acc[0]), second: mean(acc[1]), reverse: mean(rev) };
    results.exp2.push(row); console.log(`| ${src.name} | ${src.ruleText} | ${row.n} | ${row.win} | ${row.stopped} | ${row.roe} | ${row.first} | ${row.second} | ${row.reverse} |`);
  }
}

if (!ONLY || ONLY === 'exp3') {
  console.log(`\n# 실험 3 — 방치한 포지션이 청산될 확률 (증폭 없음, 무작위 시점·방향, 손절 없음, 펀딩비 포함, 각 3,000회)\n`);
  console.log('| 종목 | 3분 변동성 % | 배율 | 30분 안 | 2시간 안 | 8시간 안(자고 일어나면) | 24시간 안 | 청산 시각 중앙값 |'); console.log('|---|---|---|---|---|---|---|---|');
  for (const p of TRADABLE) for (const lev of [25, 50, 100, 200]) {
    const rnd = mulberry32(99 + lev * 131 + p.id.charCodeAt(1)), n = 3000, times = [];
    for (let i = 0; i < n; i++) { const m0 = 45 + Math.floor(rnd() * (M - 45 - 482)), d = rnd() < 0.5 ? 1 : -1; let margin = 1; for (let u = 1; u <= 480; u++) { margin -= lev * T.fundingRate; const adv = d > 0 ? p.l[m0 + u] : p.h[m0 + u]; if (d * (Math.exp(adv - p.close[m0]) - 1) <= -(margin / lev - T.maintenanceRate)) { times.push(u); break; } } }
    const within = (k) => pct(times.filter((x) => x <= k).length / n), row = { coin: p.name, lev, m30: within(10), h2: within(40), h8: within(160), h24: within(480), med: median(times) };
    results.exp3.push(row); console.log(`| ${p.name} | ${(p.sd * 100).toFixed(3)} | ${lev}배 | ${row.m30}% | ${row.h2}% | ${row.h8}% | ${row.h24}% | ${fmtD(row.med)} |`);
  }
}

function heir(est, mode, chain) {
  const I = B.inheritance, units = A.tiers.map(() => 0);
  const appraised = (u) => u.reduce((a, n, i) => a + n * A.tiers[i].cost * A.appraisalRate, 0), houseVal = H.price[est.house] * H.sellRate;
  const taxOn = (netv) => Math.round(I.taxRate * Math.max(0, netv - I.taxDeduction)), reg = Math.min(I.regularMax, (chain.regular ?? 0) + I.regularPerGen);
  const fill = (d) => { const sum = Object.values(d).reduce((a, b) => a + b, 0); if (sum < I.minStartDebt) d.capital = (d.capital ?? 0) + I.minStartDebt - sum; return d; };
  const own = () => ({ capital: I.studentLoan, shark1: Math.max(I.guaranteeMin, Math.min(I.guaranteeMax, I.guaranteeShareOfParentShark * (est.debt.shark1 + est.debt.shark2))) });
  if (mode === 'gift') return { mode, cash: est.cash, debt: fill({ tax: taxOn(est.cash + appraised(est.units) + houseVal) }), units: [...est.units], regular: reg, house: est.house, trait: 'silver' };
  if (mode === 'renounce') return { mode, cash: I.renounceCash, debt: own(), units, regular: 0, house: 0 };
  const raw = est.debt.capital + est.debt.shark1 + est.debt.shark2, auction = est.units.reduce((a, u, i) => a + u * A.tiers[i].cost * A.auctionRate, 0) + est.cash + H.price[est.house] * H.auctionRate;
  if (mode === 'limited') return { mode, cash: I.limitedCash + Math.max(0, auction - raw), debt: own(), units, regular: 0, house: est.house >= 2 ? 1 : 0 };
  let debt = raw, house = est.house; if (est.bankrupt && house > 0) { debt = Math.max(0, debt - H.price[house] * H.auctionRate); house = 0; }
  const cap = I.simpleDebtCapBase * Math.min(I.simpleDebtCapMaxMul, 1 + chain.simpleStreak), k = debt > cap ? cap / debt : 1, u2 = [...est.units];
  if (est.maxTier >= 1 && u2[est.maxTier - 1] < A.maxUnits) u2[est.maxTier - 1]++;
  const share = raw > 0 ? est.debt.capital / raw : 1;
  return { mode, cash: est.cash + I.simpleCash, debt: fill({ capital: debt * k * share, shark1: debt * k * (1 - share), shark2: 0, tax: taxOn(est.cash + appraised(est.units) + H.price[house] * H.sellRate - debt * k) }), units: u2, regular: reg, graceSettlements: I.graceSettlements, house };
}
if (!ONLY || ONLY === 'exp4') {
  const GENS = 6, N = Math.min(RUNS, 500), KEYS = ['engine_casual', 'mine_hold', 'mine_hold_hedge', 'expander', 'mixed_bold', 'trader_only', 'greedy'];
  console.log(`\n# 실험 4 — 세대 사슬 (2세대 → ${GENS + 1}세대, 한 세대 최대 실제 ${HP.generationDays}일, 각 ${N}가문)\n`);
  console.log('세대가 끝나는 방식: 파산 → 고른 상속 방식 / 3일 뒤 빚 0 → 증여 / 3일 뒤 빚이 남음 → 자산·집·빚을 든 채 고른 상속 방식.\n');
  console.log('| 플레이어 | 상속 방식 | 시작 방식별 세대당 파산율 % (세대 수) | 파산 원인 % (파산한 세대 가운데) | 자리 비운 사이 끝난 파산 % | 가문 최고 재산 중앙값 | 상위 10% | 시작 빚 최솟값 · 승계 빚 최댓값 |'); console.log('|---|---|---|---|---|---|---|---|');
  for (const polKey of KEYS) for (const mode of ['simple', 'renounce', 'smart']) {
    const byStart = {}, causes = {}, famPeak = []; let maxInherited = 0, minStart = Infinity, bkTotal = 0, offEnd = 0;
    for (let f = 0; f < N; f++) { let st = { ...GEN2(), mode: '2세대' }; const chain = { simpleStreak: 0, regular: 0 }; let fp = -Infinity;
      for (let g = 0; g < GENS; g++) { const sd = Object.values(st.debt).reduce((a, b) => a + b, 0); maxInherited = Math.max(maxInherited, sd - (st.debt.tax ?? 0)); minStart = Math.min(minStart, sd);
        const r = runGen(POL[polKey], st, 7919 * (f + 1) + 104729 * (g + 1) + polKey.length * 31); fp = Math.max(fp, r.peak);
        const e = r.estate, debtNow = e.debt.capital + e.debt.shark1 + e.debt.shark2, bs = (byStart[st.mode] ??= { n: 0, b: 0 }); bs.n++;
        if (r.bankruptAt !== null) { bs.b++; bkTotal++; causes[r.cause] = (causes[r.cause] ?? 0) + 1; if (r.offlineEnd) offEnd++; }
        let m2; if (r.bankruptAt === null && debtNow <= 0) m2 = 'gift';
        else if (mode === 'smart') { const cap = B.inheritance.simpleDebtCapBase * Math.min(B.inheritance.simpleDebtCapMaxMul, 1 + chain.simpleStreak); const worth = e.units.reduce((a, u, i) => a + u * A.tiers[i].cost, 0) + (e.maxTier >= 1 ? A.tiers[e.maxTier - 1].cost : 0) + e.cash + (e.bankrupt ? 0 : H.price[e.house]); m2 = worth >= 0.5 * Math.min(cap, debtNow) ? 'simple' : 'renounce'; }
        else m2 = mode;
        if (m2 === 'simple') chain.simpleStreak++; else chain.simpleStreak = 0; st = heir(e, m2, chain); chain.regular = st.regular ?? 0; }
      famPeak.push(fp); }
    const row = { policy: polKey, mode, byStart: Object.fromEntries(Object.entries(byStart).map(([k, v]) => [k, { n: v.n, bankrupt: pct(v.b / v.n) }])), causes: Object.fromEntries(Object.entries(causes).map(([k, v]) => [k, pct(v / bkTotal)])), bankruptGens: bkTotal, offlineEnd: bkTotal ? pct(offEnd / bkTotal) : null, famPeakMed: median(famPeak), famPeakP90: q(famPeak, 0.9), minStart, maxInherited };
    results.exp4.push(row);
    console.log(`| ${polKey} | ${mode} | ${Object.entries(row.byStart).map(([k, v]) => `${k} ${v.bankrupt} (${v.n})`).join(' / ')} | ${Object.entries(row.causes).map(([k, v]) => `${k} ${v}`).join(', ') || '-'} | ${row.offlineEnd ?? '-'} | ${won(row.famPeakMed)} | ${won(row.famPeakP90)} | ${won(minStart)} · ${won(maxInherited)} |`);
  }
}
mkdirSync(join(DIR, 'out'), { recursive: true });
if (!ONLY) { writeFileSync(join(DIR, 'out', 'results_v2.json'), JSON.stringify(results, null, 1)); console.log('\n결과 저장: docs/gdd/v2/sim/out/results_v2.json'); }
