// ServerFeed 와 엔진을 잇는 풀(glue). 엔진 코드는 건드리지 않고, 엔진의 공개 함수(stepMut·catchUp)만 부른다.
// Host 는 스토어(상태 한 벌)를 감춘 얇은 인터페이스라서 테스트에서는 변수 하나로 갈음한다.
import { balance } from '../engine/data';
import { clone, stepMut } from '../engine/game';
import { catchUp, onBackground, onForeground } from '../engine/offline';
import type { AwayReport, GameState, SettleBar } from '../engine/types';
import type { Tick } from '../engine/feed/types';
import type { HelloMsg } from './protocol';
import type { ServerFeed } from './serverFeed';
import { marketDefs } from '../engine/data';

export interface Host {
  get(): GameState;
  set(g: GameState): void;
  onAway?(r: AwayReport): void;
}

const NINETY_DAYS = 90 * 86400;

/** hello 의 '평소' 값과 준비 봉(정산 봉 480칸)을 엔진에 넣는다. 이미 봉이 쌓인 종목은 건드리지 않는다. */
export function applyHello(g: GameState, h: HelloMsg): void {
  stepMut(g, { type: 'hello', avg: h.avg });
  for (const [m, rows] of Object.entries(h.warm.bars)) {
    const cur = g.run.mkt.bars[m];
    if (cur && cur.length) continue;
    const range = g.run.mkt.avg[m]?.range180 ?? 0.0021;
    g.run.mkt.bars[m] = rows.map((r): SettleBar => ({
      n: r[0], o: r[1], h: r[2], l: r[3], c: r[4], vol: r[5], buy: r[6],
      jump: (r[2] - r[3]) / r[1] > balance.trading.jumpSigma * range,
    }));
  }
}

export interface Session {
  detach(): void;
  /** 서버를 못 만나 기기 시계로 마을을 돌린 적이 있는가. */
  localTicksRan(): boolean;
  /** 앱이 가려졌다. 열린 포지션 알림을 남기고 연결을 닫는다. */
  background(): void;
  /** 앱이 다시 보인다. 마지막으로 본 틱부터 이어 받는다. */
  foreground(): void;
}

export interface SessionOpts {
  localGraceMs?: number; // 서버를 못 만났을 때 기기 시계로 돌기 시작하기까지(기본 3초)
  now?: () => number;
}

export function attachServerFeed(feed: ServerFeed, host: Host, opts: SessionOpts = {}): Session {
  const grace = opts.localGraceMs ?? 3000;
  const now = opts.now ?? (() => Date.now());
  let localRan = false;
  const startedAt = now();
  let started = true;

  const patch = (fn: (g: GameState) => void) => {
    const g = clone(host.get());
    fn(g);
    host.set(g);
  };

  feed.helloHandler = (h) => {
    patch((g) => {
      const seen = g.run.lastSeenTick;
      if (localRan) {
        g.run.lastSeenTick = h.n; // 기기 시계로 돌던 동안의 번호는 서버 번호가 아니다. 지금부터 맞춘다.
        feed.resumeFrom(null);
        localRan = false;
      } else if (feed.lastN === null && seen > 0 && seen <= h.n && h.n - seen < NINETY_DAYS) {
        feed.resumeFrom(seen); // 돌아왔다: 떠난 틱부터 이어 받는다(60틱 이하는 재생, 넘으면 봉)
      } else if (feed.lastN === null) {
        g.run.lastSeenTick = h.n; // 새 게임, 또는 다른 서버·다른 기준의 저장
      }
      applyHello(g, h);
    });
  };

  const off = feed.subscribe((t: Tick) => {
    patch((g) => {
      if (g.run.tick === 0 && Object.keys(g.run.positions).length === 0) {
        // 세대 시작가 = 그 세대가 시작한 틱의 서버 가격 (3.9)
        for (const [id, c] of Object.entries(t.p)) { g.run.refPrice[id] = c[0]; g.run.prices[id] = c[0]; }
      }
      stepMut(g, { type: 'tick', tick: t });
    });
  });

  feed.gapHandler = async (from, to) => {
    let bars;
    try {
      bars = await feed.bars(60, from, to);
    } catch {
      return; // 봉을 못 받았다: 그 구간은 건너뛴다(서버가 돌아오면 다음 틱부터 이어진다)
    }
    const g = clone(host.get());
    g.run.lastSeenTick = from - 1;
    const report = catchUp(g, bars, to - from + 1);
    host.set(g);
    host.onAway?.(report);
  };

  const offStatus = feed.onStatus((s) => {
    if (!s.stale) return;
    const g = host.get();
    if (g.run.marketStatus !== s.market && !g.run.over) patch((x) => { x.run.marketStatus = s.market; });
  });

  // 서버를 못 만난 동안: 마을은 기기 시계의 틱으로 돈다. 시세는 얼린다(halted).
  const clock = setInterval(() => {
    if (!started || feed.status.everConnected || feed.status.conn === 'idle') return;
    if (now() - startedAt < grace) return;
    localRan = true;
    patch((g) => {
      if (g.run.over) return;
      const p: Tick['p'] = {};
      for (const m of marketDefs) p[m.id] = [g.run.prices[m.id], 1, 0.5];
      stepMut(g, { type: 'tick', tick: { n: g.run.lastSeenTick + 1, st: 'halted', p } });
    });
  }, 1000);

  return {
    detach() {
      started = false;
      clearInterval(clock);
      off();
      offStatus();
      feed.helloHandler = null;
      feed.gapHandler = null;
    },
    localTicksRan: () => localRan,
    background() {
      patch((g) => { onBackground(g); });
      feed.disconnect();
    },
    foreground() {
      const g = host.get();
      patch((x) => { onForeground(x); });
      if (!localRan && g.run.lastSeenTick > 0) feed.resumeFrom(g.run.lastSeenTick);
      feed.connect();
    },
  };
}
