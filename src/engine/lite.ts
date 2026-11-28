// 라이트 모드(?proto=1&lite=1)의 생: 선물과 빚만 남긴다. 쳇바퀴, 알바, 채굴, 집이 없다. 돈은 빌리기와 거래로만 들어온다.
// 숫자는 data/lite.json(공용 balance.json 은 그대로). 라이트가 아닌 생은 이 파일의 어떤 것도 지나지 않는다.
// 압류: 실어 갈 쳇바퀴도 지갑도 없다. 걸어 둔 증거금은 압류되지 않는다(U-56). 그래서 연체가 한도에 닿으면 seizeFor 가 null 을 돌려주고 그날로 파산이다.
import liteJson from '../../data/lite.json';
import { act } from './actions';
import { createGame, type NewGameOpts } from './game';
import { settleSec } from './pace';
import { netWorth } from './selectors';
import type { GameState, RunState } from './types';

export interface LiteData {
  start: { cash: number; debts: Record<string, number>; rateCap: Record<string, number> };
  livingPerSettle: number;
  firstVisitSec: number;
  rebirthLoans: number;
}
export const LITE = liteJson as unknown as LiteData;

/** 새 run 을 라이트의 시작으로 바꾼다: 손에 0, 코인 빚 30만(오소리 사무소, 정산마다 1%), 쳇바퀴 없음 */
export function liteStartRun(run: RunState): void {
  run.lite = true;
  run.intro = false;
  run.coinWheels = {};
  run.wallet = {};
  run.equipment = [];
  run.riding = null;
  run.cash = LITE.start.cash;
  for (const id of Object.keys(run.debts) as (keyof RunState['debts'])[]) {
    const p = LITE.start.debts[id] ?? 0;
    const cap = LITE.start.rateCap[id];
    run.debts[id] = { principal: p, inherited: cap != null && p > 0 ? p : 0, overdue: 0, graceLeft: 0, ...(cap != null && p > 0 ? { rateCap: cap } : {}) };
  }
  run.peakNetWorth = netWorth(run);
}

/** 라이트의 새 게임. 첫 추심원은 firstVisitSec 뒤에 온다 */
export function createLiteGame(opts: NewGameOpts = {}): GameState {
  const g = createGame(opts);
  liteStartRun(g.run);
  g.run.settleIn = Math.min(settleSec(g.run), LITE.firstVisitSec);
  return g;
}

/** 라이트의 다음 생: 첫 대출을 받은 자리(빚 40만, 손에 10만, 폰의 FRX 앱이 열림). 엔진 행동 그대로 밟는다 */
export function liteAfterLoan(g: GameState): void {
  const run = g.run;
  g.family.lenderRelations = {};
  const must = (r: { ok: boolean; msg?: string }, what: string) => { if (!r.ok) throw new Error(`liteAfterLoan: ${what}: ${r.msg ?? ''}`); };
  for (let i = 0; i < LITE.rebirthLoans; i++) must(act(g, { type: 'borrow', lender: 'shark1' }), '대출');
  if (!run.futures.open) must(act(g, { type: 'openAccount', sponsor: true }), 'FRX 계좌');
  run.settleIn = settleSec(run);
}
