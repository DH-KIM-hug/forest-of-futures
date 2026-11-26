// 1막: 빚을 다 갚은 생을 닫는다(DECISIONS_LOG U-39 ⑧). 파산이 아니라 은퇴지만, 흐름은 같다 — 엔딩 카드 → 환생(거래의 나무).
// 황금 실물 도토코인은 평소대로(갚은 원금 5만당 1개 + 완납 +2). 본 게임의 은퇴(증여, generation.ts retire)와는 다른 길이다: 집이 없어도 된다.
import { act1On, act1Text, RETIRE_CAUSE, specialEndings } from './act1';
import { chooseEnding, evalAll, fillLine } from './endings';
import { buildSnapshot } from './snapshot';
import { openEstate } from './generation';
import { grantAward } from './skilltree';
import { lenderDebtTotal, netWorth } from './selectors';
import { logEvent } from './util';
import type { GameState, PendingEnding, Res } from './types';

export const canRetireAct1 = (g: GameState): boolean => act1On() && !g.run.over && lenderDebtTotal(g.run) === 0 && ((g.run.stats['repaid.shark1'] as number | undefined) ?? 0) > 0;

export function retireAct1(g: GameState): Res {
  if (!canRetireAct1(g)) return { ok: false, code: 'retire', msg: '빚이 남아 있으면 은퇴할 수 없습니다.' };
  const run = g.run;
  const f = g.family;
  // 열린 포지션은 그대로 둔 채 떠난다(환생하면 사라진다). 장부에는 은퇴로 적는다.
  logEvent(run, 'retire', '빚을 다 갚고 그 생을 닫았다');
  const snap = buildSnapshot(g, { cause: RETIRE_CAUSE, lastLender: null, shortfall: 0 });
  const cands = specialEndings.filter((e) => e.causes.includes(RETIRE_CAUSE) && evalAll(e, snap));
  const { ending, via } = chooseEnding(cands.length ? cands : specialEndings.filter((e) => e.base), new Set(Object.keys(f.ledger)));
  const prev = f.ledger[ending.id];
  const lastThree = run.eventLog.slice(-3);
  if (!prev) f.ledger[ending.id] = { count: 1, holders: [{ gen: f.generation, name: g.settings.name }], firstAt: f.generation, scenes: lastThree };
  else { prev.count += 1; prev.holders.push({ gen: f.generation, name: g.settings.name }); }
  const nw = Math.max(run.peakNetWorth, netWorth(run));
  f.peakNetWorth = Math.max(f.peakNetWorth, nw);
  f.lineage.push({ gen: f.generation, name: g.settings.name, endedBy: ending.id, branch: run.branch, peak: nw });
  f.stats.retires = (f.stats.retires ?? 0) + 1;
  const txt = act1Text(ending);
  const pending: PendingEnding = {
    id: ending.id, cause: RETIRE_CAUSE, isNew: !prev, via, nth: f.ledger[ending.id].count, title: txt.title, line: fillLine(txt.line, snap), lastThree,
    nearMisses: [], nextGen: { trait: null, trace: '', heirloom: null }, collected: Object.keys(f.ledger).length, peakNetWorth: nw, settleNo: run.settleNo,
    offline: false, awayHours: null, snapshot: snap,
  };
  g.pendingEnding = pending;
  run.over = true;
  g.estate = openEstate('bankrupt', RETIRE_CAUSE); // 카드 → (상속포기 갈래 자동) → 나무. 파산과 같은 길을 탄다
  grantAward(g);
  return { ok: true };
}
