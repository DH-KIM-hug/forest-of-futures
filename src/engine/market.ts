// 틱에서 정산 봉을 쌓는다(정보 규칙·급변 판정용). 저장하는 쪽은 최근 `barsKept` 개만(결정적 재현을 위해 상태에 둔다).
import { balance, marketDefs, tipsData } from './data';
import type { RunState, SettleBar } from './types';
import type { Tick } from './feed/types';

export function updateBars(run: RunState, t: Tick): void {
  for (const m of marketDefs) {
    const cell = t.p[m.id];
    if (!cell) continue;
    const [p, vol, buy] = cell;
    let c = run.mkt.cur[m.id];
    if (!c) {
      c = { n: t.n, o: p, h: p, l: p, c: p, vol: 0, buy: 0, jump: false, ticks: 0 };
      run.mkt.cur[m.id] = c;
    }
    c.h = Math.max(c.h, p);
    c.l = Math.min(c.l, p);
    c.c = p;
    c.vol += vol;
    c.buy += buy;
    c.ticks += 1;
  }
}

/** 정산이 끝날 때 지금까지 쌓은 봉을 닫고 다음 봉을 시작한다. */
export function closeBars(run: RunState): void {
  for (const m of marketDefs) {
    const c = run.mkt.cur[m.id];
    if (!c || c.ticks === 0) continue;
    const avg = run.mkt.avg[m.id];
    const bar: SettleBar = {
      n: c.n, o: c.o, h: c.h, l: c.l, c: c.c, vol: c.vol / c.ticks, buy: c.buy / c.ticks,
      jump: (c.h - c.l) / c.o > balance.trading.jumpSigma * avg.range180,
    };
    const arr = (run.mkt.bars[m.id] ??= []);
    arr.push(bar);
    while (arr.length > tipsData.barsKept) arr.shift();
    run.mkt.cur[m.id] = { n: c.n + c.ticks, o: c.c, h: c.c, l: c.c, c: c.c, vol: 0, buy: 0, jump: false, ticks: 0 };
  }
}

/** 서버 hello 의 '평소' 값을 넣는다. */
export function setAvg(run: RunState, avg: Record<string, { vol180: number; range180: number; range300s: number }>): void {
  for (const [k, v] of Object.entries(avg)) run.mkt.avg[k] = { ...v };
  run.mkt.avgFromServer = true;
}

/** 지금 정산 봉이 평소의 3배 넘게 움직였는가(급변). */
export function inJump(run: RunState, market: string): boolean {
  const c = run.mkt.cur[market];
  if (!c) return false;
  return (c.h - c.l) / c.o > balance.trading.jumpSigma * run.mkt.avg[market].range180;
}
