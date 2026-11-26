// 브라우저 직결 시세: 가짜 소켓·가짜 시계·가짜 조회로 틱 표본, 변환, 상태, 공백 메우기를 본다(네트워크 없음).
import { describe, expect, it } from 'vitest';
import { HlDirectFeed } from '../../src/net/hlDirect/feed';
import { toBars, secondsOf } from '../../src/net/hlDirect/candles';
import { COINS } from '../../src/net/hlDirect/config';
import { marketDefs } from '../../src/engine/data';
import type { Tick } from '../../src/engine/feed/types';

class FakeSock {
  onopen: any = null; onmessage: any = null; onclose: any = null; onerror: any = null;
  sent: any[] = [];
  send(d: string) { this.sent.push(JSON.parse(d)); }
  close() {}
  msg(o: unknown) { this.onmessage?.({ data: JSON.stringify(o) }); }
}
const start = (px: Record<string, number>) => {
  let now = 1_700_000_000_000;
  const socks: FakeSock[] = [];
  const posts: any[] = [];
  const feed = new HlDirectFeed({
    socketFactory: () => { const s = new FakeSock(); socks.push(s); return s as any; },
    post: async (_u, b: any) => { posts.push(b); return []; },
    now: () => now,
  });
  const ticks: Tick[] = [];
  feed.subscribe((t) => ticks.push(t));
  feed.connect();
  const s = socks[0];
  s.onopen();
  const bbo = (key: string, mid: number) => s.msg({ channel: 'bbo', data: { coin: COINS[key], time: now, bbo: [{ px: String(mid - 0.5) }, { px: String(mid + 0.5) }] } });
  const trade = (key: string, px: number, sz: number, side: 'B' | 'A') => s.msg({ channel: 'trades', data: [{ coin: COINS[key], px: String(px), sz: String(sz), side, time: now }] });
  const all = (m: number) => { for (const k of Object.keys(px)) bbo(k, px[k] * m); };
  const adv = async (ms: number) => { now += ms; await (feed as any).run(now); };
  return { feed, s, ticks, bbo, trade, all, adv, posts, get now() { return now; } };
};
const PX = { DTC: 60000, BTH: 3000, SMS: 127, MDT: 0.2, IDX_SOL: 150, IDX_XRP: 2 };

describe('HlDirectFeed', () => {
  it('구독: 코인마다 bbo·trades 를 요청한다(서버 어댑터와 같음)', () => {
    const t = start(PX);
    const subs = t.s.sent.filter((m) => m.method === 'subscribe').map((m) => `${m.subscription.type}:${m.subscription.coin}`);
    for (const c of Object.values(COINS)) { expect(subs).toContain(`bbo:${c}`); expect(subs).toContain(`trades:${c}`); }
  });

  it('첫 틱은 가상 시작가, 그 뒤는 실제 변동률만큼 곱해진다. 시세가 없을 땐 delayed', async () => {
    const t = start(PX);
    await t.adv(0);
    expect(t.ticks[0].st).toBe('delayed'); // 아직 한 번도 못 받았다
    t.all(1);
    await t.adv(1000);
    const first = t.ticks[t.ticks.length - 1];
    expect(first.st).toBe('open');
    for (const m of marketDefs) expect(first.p[m.id][0]).toBeCloseTo(m.startPrice, 6);
    t.bbo('DTC', PX.DTC * 1.01);
    await t.adv(1000);
    const nx = t.ticks[t.ticks.length - 1];
    expect(nx.n).toBe(first.n + 1);
    expect(nx.p.DTC[0] / first.p.DTC[0]).toBeCloseTo(1.01, 6);
    expect(nx.p.BTH[0]).toBeCloseTo(first.p.BTH[0], 9); // 안 움직인 종목은 그대로
    expect(nx.p.JQQ[0]).toBeGreaterThan(first.p.JQQ[0]); // 지수는 구성원 평균 수익률
  });

  it('한 초 안의 마지막 mid 가 그 초의 가격, 체결은 매수 비율로 나온다', async () => {
    const t = start(PX);
    t.all(1);
    await t.adv(1000);
    t.bbo('DTC', PX.DTC * 1.002);
    t.bbo('DTC', PX.DTC * 1.004);
    t.trade('DTC', 60000, 0.3, 'B');
    t.trade('DTC', 60000, 0.1, 'A');
    await t.adv(1000);
    const tk = t.ticks[t.ticks.length - 1];
    expect(tk.p.DTC[0] / marketDefs.find((m) => m.id === 'DTC')!.startPrice).toBeCloseTo(1.004, 6);
    expect(tk.p.DTC[2]).toBeCloseTo(0.75, 6);
    expect(tk.p.BTH[2]).toBe(0.5); // 체결이 없으면 중립
  });

  it('조용해지면 5초 뒤 delayed, 60초 뒤 halted, 가격은 얼린다. 다시 오면 끊긴 동안의 움직임은 버리고 이어 붙인다', async () => {
    const t = start(PX);
    t.all(1);
    await t.adv(1000);
    const base = t.ticks[t.ticks.length - 1].p.DTC[0];
    for (let i = 0; i < 6; i++) await t.adv(1000);
    expect(t.ticks[t.ticks.length - 1].st).toBe('delayed');
    expect(t.feed.status.market).toBe('delayed');
    for (let i = 0; i < 60; i++) await t.adv(1000);
    expect(t.ticks[t.ticks.length - 1].st).toBe('halted');
    expect(t.ticks[t.ticks.length - 1].p.DTC[0]).toBeCloseTo(base, 9);
    t.all(1.5); // 돌아왔을 때 가격이 50% 달라져 있어도
    await t.adv(1000);
    const back = t.ticks[t.ticks.length - 1];
    expect(back.st).toBe('open');
    expect(back.p.DTC[0]).toBeCloseTo(base, 6); // 그 사이 움직임은 버린다
    t.all(1.51);
    await t.adv(1000);
    expect(t.ticks[t.ticks.length - 1].p.DTC[0] / base).toBeCloseTo(1.51 / 1.5, 6);
  });

  it('틱 번호는 초마다 하나씩 이어진다(밀린 초는 채운다)', async () => {
    const t = start(PX);
    t.all(1);
    await t.adv(1000);
    await t.adv(3000);
    const ns = t.ticks.map((x) => x.n);
    for (let i = 1; i < ns.length; i++) expect(ns[i]).toBe(ns[i - 1] + 1);
  });

  it('60초 넘게 비면 틱 대신 봉으로 메우고(gapHandler), 가격을 봉 종가에 이어 붙인다', async () => {
    const t = start(PX);
    t.all(1);
    await t.adv(1000);
    const gaps: any[] = [];
    t.feed.gapHandler = (from, to, bars) => { gaps.push({ from, to, bars }); };
    // 조회 응답: 이 구간의 1분 봉(모든 코인 +2%)
    const t0 = Math.floor(t.now / 60000) * 60000;
    (t.feed as any).o.post = async (_u: string, b: any) => {
      const key = Object.keys(COINS).find((k) => COINS[k] === b.req.coin)!;
      const px = (PX as any)[key];
      return Array.from({ length: 6 }, (_, i) => ({ t: t0 + i * 60000, o: px, h: px * 1.03, l: px * 0.99, c: px * 1.02, v: '10' }));
    };
    t.all(1.02);
    await t.adv(300_000);
    expect(gaps.length).toBe(1);
    expect(gaps[0].bars.length).toBeGreaterThan(0);
    const dtc = gaps[0].bars.filter((b: any) => b.market === 'DTC');
    const startP = marketDefs.find((m) => m.id === 'DTC')!.startPrice;
    expect(dtc[0].o).toBeCloseTo(startP, 3); // 같은 배율
    expect(dtc[0].c).toBeCloseTo(startP * 1.02, 3);
    expect(gaps[0].bars.some((b: any) => b.market === 'JQQ')).toBe(true);
    const last = t.ticks[t.ticks.length - 1];
    expect(last.n).toBe(Math.floor(t.now / 1000));
  });
});

describe('봉 변환', () => {
  it('지수 봉: 끝 값을 현재 지수에 맞춘다. secondsOf 는 시가에서 종가까지 이어진다', () => {
    const keys = Object.keys(COINS);
    const cs: any = {};
    keys.forEach((k, i) => { cs[k] = [0, 1, 2].map((j) => ({ t: j * 60000, o: 100, h: 105, l: 95, c: 100 + j * (1 + i), v: 1 })); });
    const bars = toBars(cs, { tradable: { DTC: 'DTC' }, k: { DTC: 2 }, means: {}, anchor: { kind: 'end', end: 1234 } });
    const jqq = bars.filter((b) => b.market === 'JQQ');
    expect(jqq.length).toBe(3);
    expect(jqq[2].c).toBeCloseTo(1234, 6);
    const dtc = bars.filter((b) => b.market === 'DTC');
    expect(dtc[1].c).toBe(202);
    const s = secondsOf(dtc, 120);
    expect(s.length).toBe(120);
    expect(s[s.length - 1]).toBeCloseTo(dtc[2].c, 6);
  });
});
