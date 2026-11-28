// 라이트의 소개(U-65, 사용자 결정): 정산에 그 돈줄의 이자를 못 내면 연체 대신 추심원이 다음 돈줄을 소개한다.
// 오소리(이자와 생활비) → 숲속 캐피탈 → 반짝 전당포 까마귀(불법 사채, 엔진 자리 shark2, 선이자). 다음 돈줄이 모자란 만큼 빌려 그 자리에서 대신 낸다. 앞의 돈줄은 깨끗하다.
// 소개가 곧 봐주기다(사용자 결정 「연체하면 다른 캐피탈 알려 주잖아? 그럼 그다음에 바로 연체하면 끝임」): 까마귀를 못 내거나, 다음 돈줄의 한도가 모자라 소개가 안 되면 연체 없이 그 정산에 파산.
import liteJson from '../../data/lite.json';
import { lenderById } from './data';
import { ceilS } from './rng';
import { lenderLimit } from './selectors';
import { bump } from './stats';
import { logEvent } from './util';
import type { GameState, SettlementReport } from './types';

type From = 'shark1' | 'capital';
type To = 'capital' | 'shark2';
const REFERRAL = ((liteJson as { referral?: Record<string, string> }).referral ?? {}) as Partial<Record<From, To>>;

/** 그 돈줄이 need 를 대신 내 줄 수 있으면 장부에 적고 true. 장부에 적히는 돈은 선이자만큼 크다 */
function cover(g: GameState, rep: SettlementReport, from: From, need: number): boolean {
  const run = g.run;
  const to = REFERRAL[from];
  if (!to || need <= 0) return false;
  const up = lenderById[to].upfront ?? 0;
  const signed = ceilS(need / (1 - up));
  if (signed > lenderLimit(g, to) - run.debts[to].principal) return false;
  const first = ((run.stats[`borrow.${to}`] as number | undefined) ?? 0) === 0;
  run.debts[to].principal += signed;
  bump(run, `borrow.${to}`, 1);
  bump(run, `refer.${to}`, 1);
  bump(run, 'upfrontPaid', signed - need);
  if (to === 'shark2') { bump(run, 'sharkBorrowed', signed); run.shark2Open = true; }
  logEvent(run, `refer:${from}`, `${lenderById[to].name}에서 빌려 ${lenderById[from].name}에 냄`, need);
  (rep.refer ??= []).push({ from, to, paid: need, signed, first });
  rep.paid += need;
  return true;
}

/** settle 이 낸 뒤 못 낸 돈(unpaid)을 소개로 메운다. 메운 몫은 unpaid 에서 0 이 된다. rep.unpaid(모자랐던 돈)는 그대로 둔다.
 *  돌려주는 값: 소개로도 못 메운 돈줄(있으면 그 정산에 파산), 없으면 null */
export function liteRefer(g: GameState, unpaid: Record<string, number>, rep: SettlementReport): { lastLender: 'shark1' | 'capital' | 'shark2'; shortfall: number } | null {
  if (!g.run.lite) return null;
  // 오소리 추심원은 이자와 생활비를 같이 걷는다
  const badger = (unpaid.shark1 ?? 0) + (unpaid.upkeep ?? 0);
  if (cover(g, rep, 'shark1', badger)) { unpaid.shark1 = 0; unpaid.upkeep = 0; }
  if (cover(g, rep, 'capital', unpaid.capital ?? 0)) unpaid.capital = 0;
  // 까마귀가 먼저(넘길 곳이 없다), 그다음 소개가 막힌 곳
  for (const id of ['shark2', 'capital', 'shark1'] as const) if ((unpaid[id] ?? 0) > 0) return { lastLender: id, shortfall: unpaid[id] + (id === 'shark1' ? unpaid.upkeep ?? 0 : 0) };
  return null;
}
