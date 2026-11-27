// 1막의 새 생은 튜토리얼이 끝난 그 자리에서 눈을 뜬다(U-46 사용자: "환생할 때 딱 튜토리얼 끝난 시점으로 환생해야 하지 않을까. 알바도 있고 돈도 그때고.").
// 첫 생의 튜토리얼 사슬을 엔진 행동 그대로 다시 밟는다(숫자를 짐작해 적지 않는다): 오소리에게 빌린다(1.3%) → 중고폰(FRX 계좌) → 엄마의 쳇바퀴에 알바
// → 쳇바퀴 하나를 놓고 알바 → 첫 주문에 가진 것 전부를 잃는다(손에 0) → 오소리에게 한 번 더 빌린다(2%). 손에 꼭 100,000, 빚 50만.
// 다른 점은 둘뿐이다: 정산 시계와 오픈 기념(정산 60번)은 새로 시작한다 — 첫 생에서 튜토리얼 전에 지나간 정산 한 번은 이 생에는 없다. 거래 기록(튜토리얼의 청산)은 남기지 않는다.
import { act } from './actions';
import { settleSec } from './pace';
import type { GameState } from './types';

const EXTRA_WHEEL = 'wheel2';
/** 튜토리얼이 끝난 살림으로 맞춘다. 새 생의 run(빚 30만 · 쳇바퀴 한 대 · 현금 0)에 부른다 */
export function applyPostTutorial(g: GameState): void {
  const run = g.run;
  // 1막에는 대물림 · 채권처와의 사이(원한 · 연)가 없다: 지난 생의 파산 갈래가 오소리의 한도 · 금리를 바꾸지 않게 비운다(첫 생과 같은 숫자)
  g.family.lenderRelations = {};
  const must = (r: { ok: boolean; msg?: string }, what: string) => { if (!r.ok) throw new Error(`applyPostTutorial: ${what} — ${r.msg ?? ''}`); };
  must(act(g, { type: 'borrow', lender: 'shark1' }), '첫 대출');
  if (!run.futures.open) must(act(g, { type: 'openAccount', sponsor: true }), '중고폰');
  must(act(g, { type: 'hire', coin: 'DTC' }), '엄마의 쳇바퀴 알바');
  must(act(g, { type: 'buyEquip', tier: EXTRA_WHEEL, coin: 'DTC' }), '쳇바퀴 놓기');
  const uid = run.equipment.find((u) => u.tier === EXTRA_WHEEL)!.uid;
  must(act(g, { type: 'hire', uid }), '둘째 쳇바퀴 알바');
  run.cash = 0; // 첫 주문(체험용 시세)에 가진 것 전부를 걸고 잃었다
  must(act(g, { type: 'borrow', lender: 'shark1' }), '두 번째 대출');
  run.settleIn = settleSec(run);
}
