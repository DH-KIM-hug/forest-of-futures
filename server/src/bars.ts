// 봉 만들기 (GDD_v2 6.5): 1분 봉(60틱)과 정산 봉(180틱). 경계는 n 의 배수.
// 정지 틱은 OHLC 에서 뺀다(전부 정지면 직전 가격의 납작한 봉, st=2). vol·buy 는 틱 평균(엔진의 SettleBar 와 같은 뜻).
import type { BarRecord, Cell, TickRecord } from './types.ts';

interface Acc {
  n0: number; o: number; h: number; l: number; c: number;
  volSum: number; buySum: number; ticks: number; live: number; halted: number; delayed: number;
  last: number[]; // 이 봉의 가격 열(마지막 60개만 평균에 쓴다)
  flat: number;
}

export class BarBuilder {
  readonly res: number;
  private cur: Record<string, Acc> = {};
  constructor(res: number) {
    this.res = res;
  }

  /** 틱 하나를 넣는다. 봉이 닫히면 닫힌 봉들을 돌려준다. */
  add(t: TickRecord): BarRecord[] {
    const n0 = Math.floor(t.n / this.res) * this.res;
    const closed: BarRecord[] = [];
    for (const [id, cell] of Object.entries(t.p) as [string, Cell][]) {
      let a = this.cur[id];
      if (a && a.n0 !== n0) {
        closed.push(this.close(id, a));
        a = undefined as unknown as Acc;
      }
      if (!a) {
        a = { n0, o: NaN, h: -Infinity, l: Infinity, c: NaN, volSum: 0, buySum: 0, ticks: 0, live: 0, halted: 0, delayed: 0, last: [], flat: cell[0] };
        this.cur[id] = a;
      }
      a.ticks += 1;
      a.flat = cell[0];
      if (t.st === 'halted') {
        a.halted += 1;
      } else {
        if (t.st === 'delayed') a.delayed += 1;
        a.live += 1;
        if (Number.isNaN(a.o)) a.o = cell[0];
        a.h = Math.max(a.h, cell[0]);
        a.l = Math.min(a.l, cell[0]);
        a.c = cell[0];
        a.volSum += cell[1];
        a.buySum += cell[2];
        a.last.push(cell[0]);
        if (a.last.length > 60) a.last.shift();
      }
    }
    return closed;
  }

  private close(id: string, a: Acc): BarRecord {
    const allHalted = a.live === 0;
    const p = a.flat;
    const b: BarRecord = allHalted
      ? { market: id, n0: a.n0, o: p, h: p, l: p, c: p, vol: 0, buy: 0.5, st: 2 }
      : {
          market: id, n0: a.n0, o: a.o, h: a.h, l: a.l, c: a.c,
          vol: a.volSum / a.live, buy: a.buySum / a.live,
          st: a.delayed === a.live ? 1 : 0,
        };
    if (this.res === 180) b.avg60 = a.last.length ? a.last.reduce((x, y) => x + y, 0) / a.last.length : p;
    return b;
  }

  /** 지금 진행 중인 봉(아직 안 닫힘)의 n0. */
  openN0(): number | null {
    const k = Object.keys(this.cur)[0];
    return k ? this.cur[k].n0 : null;
  }
}

/** 최근 봉들에서 '평소' 값(hello.avg)을 계산한다. */
export function computeAvg(
  bars180: BarRecord[],
  bars60: BarRecord[],
): { vol180: number; range180: number; range300s: number } {
  const live = bars180.filter((b) => b.st !== 2);
  const vol180 = live.length ? live.reduce((a, b) => a + b.vol, 0) / live.length : 1;
  const range180 = live.length ? live.reduce((a, b) => a + (b.h - b.l) / b.o, 0) / live.length : 0.0021;
  // 300초 범위: 연속한 5개의 1분 봉(정지 아님)의 고저 폭을 겹치지 않게 묶어 평균
  const l60 = bars60.filter((b) => b.st !== 2).sort((a, b) => a.n0 - b.n0);
  const rs: number[] = [];
  for (let i = 0; i + 5 <= l60.length; i += 5) {
    const g = l60.slice(i, i + 5);
    if (g[4].n0 - g[0].n0 !== 240) continue;
    rs.push((Math.max(...g.map((x) => x.h)) - Math.min(...g.map((x) => x.l))) / g[0].o);
  }
  const range300s = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0.0026;
  return { vol180: vol180 || 1, range180, range300s };
}
