// HlDirectFeed 와 엔진을 잇는 풀. session.ts(서버 판)와 같은 일을 한다: 틱 → stepMut, 긴 공백 → catchUp, 평소 값·준비 봉 → applyHello.
import { clone, stepMut } from '../../engine/game';
import { catchUp, onBackground, onForeground } from '../../engine/offline';
import type { Tick } from '../../engine/feed/types';
import type { GameState } from '../../engine/types';
import { applyHello, type Host } from '../session';
import type { HlDirectFeed, Warm } from './feed';

export interface HlSession {
  detach(): void;
  background(): void;
  foreground(): void;
}

export function attachHlFeed(feed: HlDirectFeed, host: Host, onHistory?: (h: Record<string, number[]>, day?: Warm['day']) => void): HlSession {
  let alive = true;
  const patch = (fn: (g: GameState) => void) => {
    const g = clone(host.get());
    fn(g);
    host.set(g);
  };

  const off = feed.subscribe((t: Tick) => {
    if (host.paused?.() || feed.resuming) return;
    patch((g) => {
      if (g.run.tick === 0 && Object.keys(g.run.positions).length === 0) {
        // 세대 시작가 = 그 세대가 시작한 틱의 가격
        for (const [id, c] of Object.entries(t.p)) { g.run.refPrice[id] = c[0]; g.run.prices[id] = c[0]; }
      }
      stepMut(g, { type: 'tick', tick: t, frozen: !!host.frozen?.(t.n) }); // U-58: 가려진 동안의 틱은 정산 시계를 멈춘 채
    });
  });

  feed.gapHandler = (from, to, bars) => {
    const use = bars.filter((b) => b.n0 >= from);
    if (!use.length) return;
    const g = clone(host.get());
    g.run.lastSeenTick = from - 1;
    const report = catchUp(g, use, to - from + 1);
    host.set(g);
    host.onAway?.(report);
  };

  // 시작할 때 최근 봉(평소 값, 정산 봉, 차트 기록). 못 받으면 기본값으로 간다.
  void feed.loadWarm().then((w) => {
    if (!alive || !w) return;
    patch((g) => { applyHello(g, w.hello); });
    onHistory?.(w.history, w.day);
  }).catch(() => {});

  return {
    detach() { alive = false; off(); feed.gapHandler = null; },
    background() { patch((g) => { onBackground(g); }); },
    foreground() {
      patch((g) => { onForeground(g); });
      feed.kick();
    },
  };
}
