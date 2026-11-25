import { clone, retire as retireRaw, startNewLife } from './game';
import { openPosition, closePosition, setStops } from './trading';
import type { OpenParams, Res } from './trading';
import { borrow, stamp } from './loans';
import type { Mult, StampRes } from './loans';
import { borrowFriend, stampFriend } from './friends';
import { moveTo } from './housing';
import { labor } from './labor';
import type { GameState, LenderId } from './types';
import { refreshLatches } from './selectors';

export type Out<X = Res> = X & { s: GameState };

function run<X extends Res>(s: GameState, fn: (g: GameState) => X): Out<X> {
  const g = clone(s);
  const r = fn(g);
  refreshLatches(g.run);
  return { ...r, s: g };
}

export const doLabor = (s: GameState, nowMs: number) => run(s, (g) => labor(g, nowMs));
export const doBorrow = (s: GameState, id: LenderId, consent = false) => run(s, (g) => borrow(g, id, consent));
export const doStamp = (s: GameState, id: LenderId, mult: Mult = 1) => run<StampRes>(s, (g) => stamp(g, id, mult));
export const doBorrowFriend = (s: GameState, id: string) => run(s, (g) => borrowFriend(g, id));
export const doStampFriend = (s: GameState, id: string, mult: Mult = 1) => run<StampRes>(s, (g) => stampFriend(g, id, mult));
export const doMove = (s: GameState, stage: number) => run(s, (g) => moveTo(g, stage));
export const doOpen = (s: GameState, p: OpenParams) => run(s, (g) => openPosition(g, p));
export const doClose = (s: GameState, market: string) => run(s, (g) => closePosition(g, market));
export const doStops = (s: GameState, market: string, sl: number | null, tp: number | null) => run(s, (g) => setStops(g, market, sl, tp));
export const doViewTerms = (s: GameState, id: string) =>
  run(s, (g) => {
    if (id === 'shark2') g.run.stats.termsViewedShark2 = true;
    return { ok: true };
  });
export const doView = (s: GameState, v: { tab?: 'village' | 'trade'; location?: string }) =>
  run(s, (g) => {
    if (v.tab && v.tab !== g.run.view.tab) {
      g.run.view.tab = v.tab;
      g.run.stats.tabSwitches += 1;
    }
    if (v.location) g.run.view.location = v.location;
    return { ok: true };
  });
export const doRetire = (s: GameState) => {
  const r = retireRaw(s);
  return { s: r.s, ok: r.ok, msg: r.msg } as Out;
};
export const doNewLife = (s: GameState) => startNewLife(s);
export const doRename = (s: GameState, name: string) => {
  const g = clone(s);
  g.settings.name = name.trim().slice(0, 8) || g.settings.name;
  return g;
};
export const doSettings = (s: GameState, patch: Partial<GameState['settings']>) => {
  const g = clone(s);
  Object.assign(g.settings, patch);
  return g;
};
