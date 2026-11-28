// 라이트 모드의 만화 시퀀스를 거는 곳: 대부에게 처음 빌리는 순간(빚의 유혹), 파산(엔딩 카드 뒤 절망의 표제지). 숫자는 엔진 값 그대로.
import { useGame } from '../../../store/gameStore';
import { lenderById } from '../../../engine/data';
import { nextBorrowRate, lenderLimit, totalDebt } from '../../../engine/selectors';
import { comma } from '../../../engine/util';
import { RETIRE_CAUSE } from '../../../engine/act1';
import { lifeNo } from '../model';
import { pushSeq } from './liteStore';
import { useUI } from '../../uiStore';
import { temptPanels, despairPanel, rebirthPanels } from './manga';
import type { GameState, LenderId } from '../../../engine/types';

/** 빌리기 직전의 판으로 그 대출의 숫자를 센다(빌린 뒤에 부른다). 이번 생 처음 빌리는 곳이면 유혹의 만화 */
export function temptOnBorrow(before: GameState, id: LenderId, got: number): void {
  if (id === 'bank') return;
  const first = ((before.run.stats[`borrow.${id}`] as number | undefined) ?? 0) === 0;
  if (!first) return;
  const l = lenderById[id];
  const unit = Math.min(l.borrowUnit!, Math.max(0, lenderLimit(before, id) - before.run.debts[id].principal));
  const rate = nextBorrowRate(before, id);
  pushSeq({ id: 'tempt_' + id, label: '빚의 유혹', panels: temptPanels({ lender: id, unit, got: got || Math.floor(unit * (1 - (l.upfront ?? 0))), perSettle: Math.ceil(unit * rate - 1e-9), ratePct: Math.round(rate * 1000) / 10 }) });
}

/** 파산한 생(사용자 결정 2026-11-28): 엔딩 카드를 먼저 보이고, 그다음 절망의 표제지(진짜 숫자)에서 [환생하기]. 은퇴는 표제지 없이 바로 */
export function despairThenRebirth(g: GameState, rebirth: () => void): void {
  const run = g.run;
  if (!run.bankruptcy || g.pendingEnding?.cause === RETIRE_CAUSE) { rebirth(); return; }
  // 장면 D: 프롤로그 4쪽(절망의 표제지)을 진짜 숫자와 함께. 숫자 상자 = 빌린 돈(지금 빚 전부) / 남은 돈(손의 돈)
  // 판을 쥔 채 이자를 못 내 파산했으면 그 돈도 적는다(걸어 둔 증거금은 압류되지도, 이자로 나가지도 않는다)
  const onTable = Object.values(run.positions).reduce((a, p) => a + p.margin, 0);
  const nar: [string, string] = [`빌린 돈 ${comma(Math.round(totalDebt(run)))}`, `남은 돈 ${comma(Math.max(0, Math.floor(run.cash)))}${onTable >= 1000 ? `, 판에 걸려 있던 돈 ${comma(Math.round(onTable))}` : ''}`];
  pushSeq({ id: 'broke', label: '파산', panels: [despairPanel({ sub: `제${lifeNo(g)}화 파산`, nar })], endBtn: '환생하기', onEnd: rebirth });
}

/** 장면 E: 새 생이 열리면 「다시, 어느 날」 */
export function rebirthSeq(): void {
  pushSeq({ id: 'reborn', label: '다시, 어느 날', panels: rebirthPanels() });
  useUI.getState().setTrade({ market: 'FLY' }); // 새 생도 날다람쥐코인부터
}
