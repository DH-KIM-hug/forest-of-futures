// 튜토리얼 거래(U-31): 거래소를 처음 열면 오소리 대부가 롱이든 숏이든 걸어 보라고 한다.
// 이 한 번은 실시간 시세가 아니라 짜 둔 시세다: 어느 쪽을 골라도 반대로 가서 몇 초 만에 청산된다(청산 판정 자체는 엔진의 processPrice).
// 그 뒤 오소리 대부가 10만을 더 빌려주고(엔진 borrow), "지금부터 실제 시세" 알림이 뜨면 튜토리얼이 끝난다.
import { useGame } from '../../store/gameStore';
import { useProto } from './protoStore';
import { TUT, tutorialPrice, officeOffer } from './model';
import { STORY } from './text';
import { clone } from '../../engine/game';
import { processPrice } from '../../engine/futures';
import { balance } from '../../engine/data';
import { nextBorrowRate } from '../../engine/selectors';
import { pushOne, dropLast } from '../priceHistory';
import { play } from './audio';
import { say } from './watch';

/** 거래소 탭을 처음 열었다: 오소리 대부가 걸어 보라고 한다. */
export function tutorialIntro(): void {
  const P = useProto.getState();
  if (P.tutorial !== 'await' || P.seen.tutIntro) return;
  P.pushScene({ id: 'tutIntro', lines: STORY.tutIntro(tutorialMargin(), TUT.lev) });
}
/** 거는 돈: 정해 둔 3만, 가진 돈이 모자라면 그 4분의 3. 최소 증거금도 안 되면 0(튜토리얼을 건너뛴다). */
export function tutorialMargin(): number {
  const cash = useGame.getState().g.run.cash;
  const m = Math.min(TUT.margin, Math.floor(cash * 0.75));
  return m >= (balance.trading.minMargin as number) ? m : 0;
}

/** 롱/숏을 골랐다. 엔진으로 진짜 포지션을 열고, 시계를 멈춘 채 짜 둔 시세를 엔진에 먹인다. */
export function tutorialOpen(dir: 1 | -1): boolean {
  const st = useGame.getState();
  const margin = tutorialMargin();
  if (margin <= 0) { useProto.getState().patch({ tutorial: 'done' }); return false; }
  const r = st.act({ type: 'open', market: TUT.market, dir, lev: TUT.lev, margin, sl: null, tp: null });
  if (!r.ok) { say(r.msg ?? '들어갈 수 없습니다'); return false; }
  play(dir === 1 ? 'order_long' : 'order_short');
  st.setSpeed(0);
  useProto.getState().patch({ tutorial: 'run' });
  const real = useGame.getState().g.run.prices[TUT.market];
  let k = 0;
  const timer = window.setInterval(() => {
    k += 1;
    const g = clone(useGame.getState().g);
    const px = tutorialPrice(real, dir, k);
    g.run.prices[TUT.market] = px;
    pushOne(TUT.market, px);
    processPrice(g, TUT.market, px);
    useGame.getState().setGame(g);
    if (!g.run.positions[TUT.market] || k >= TUT.maxSteps) {
      window.clearInterval(timer);
      window.setTimeout(() => finish(real, k, margin), 1900);
    }
  }, TUT.stepMs);
  return true;
}

function finish(real: number, steps: number, margin: number): void {
  const st = useGame.getState();
  const g = clone(st.g);
  if (g.run.positions[TUT.market]) { st.act({ type: 'close', market: TUT.market }); }
  // 짜 둔 시세를 걷어 내고 진짜 시세로 돌아간다
  dropLast(TUT.market, steps);
  const g2 = clone(useGame.getState().g);
  g2.run.prices[TUT.market] = real;
  st.setGame(g2);
  const lend = officeOffer(g2).lend;
  useProto.getState().patch({ tutorial: 'lost' });
  useProto.getState().pushScene({
    id: 'tutLost', lines: STORY.tutLost(margin, lend, Math.round(nextBorrowRate(g2, 'shark1') * 100)),
    choices: lend > 0
      ? [{ id: 'borrow', label: '더 빌린다', sub: `+${lend.toLocaleString('ko-KR')} · 금리 ${Math.round(nextBorrowRate(g2, 'shark1') * 100)}%`, primary: true, run: () => { const r = useGame.getState().act({ type: 'borrow', lender: 'shark1' }); play(r.ok ? 'collector_paid' : 'insufficient'); useProto.getState().patch({ tutorial: 'notice' }); } }]
      : [{ id: 'ok', label: '…', primary: true, run: () => useProto.getState().patch({ tutorial: 'notice' }) }],
  });
}

/** "지금부터 실제 시세" 알림을 닫는다: 튜토리얼 끝. 시계가 다시 돈다. */
export function tutorialEnd(): void {
  useProto.getState().patch({ tutorial: 'done' });
  useGame.getState().setSpeed(1);
}
