// FRX 의뢰판의 사례금(U-65, 사용자 결정 「의뢰로는 돈을 좀 받을까」): 의뢰를 끝내면 의뢰인이 손에 돈을 쥐여 준다.
// 화면(quests.ts)이 셈해 넣고, 엔진은 한 번의 크기와 한 생의 합만 막는다. 랭킹 검사(ranking/src/verify.ts LIFE.questMaxPerLife)와 같은 숫자.
import type { GameState, Res } from './types';
import { bump } from './stats';
import { logEvent } from './util';

export const QUEST_TIP = {
  /** 한 번의 사례금 상한 */ max: 30_000,
  /** 한 생에 받는 사례금 합의 상한 */ lifeMax: 150_000,
};

/** 한 생에 아직 받을 수 있는 사례금 */
export const tipRoom = (g: GameState): number => Math.max(0, QUEST_TIP.lifeMax - ((g.run.stats.questTip as number | undefined) ?? 0));

export function questTip(g: GameState, amount: number, who = ''): Res {
  if (g.run.over) return { ok: false, code: 'over', msg: '' } as Res;
  const n = Math.max(0, Math.min(QUEST_TIP.max, tipRoom(g), Math.floor(amount) || 0));
  if (n <= 0) return { ok: false, code: 'cap', msg: '' } as Res;
  g.run.cash += n;
  bump(g.run, 'questTip', n);
  logEvent(g.run, 'questTip', `${who || '의뢰인'} 사례금`, n);
  return { ok: true, amount: n } as Res;
}
