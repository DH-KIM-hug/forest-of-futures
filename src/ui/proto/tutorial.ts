// 튜토리얼 거래(U-31): 거래소를 처음 열면 오소리 대부가 롱이든 숏이든 걸어 보라고 한다.
// 이 한 번은 실시간 시세가 아니라 짜 둔 시세다: 어느 쪽을 골라도 반대로 가서 몇 초 만에 청산된다(청산 판정 자체는 엔진의 processPrice).
// 그 뒤 오소리 대부가 10만을 더 빌려주고(엔진 borrow), "지금부터 실제 시세" 알림이 뜨면 튜토리얼이 끝난다.
import { useGame } from '../../store/gameStore';
import { useProto } from './protoStore';
import { TUT, tutorialPrice, officeOffer, tipArgs, ratePct } from './model';
import { tips, tipsLeft } from './guide';
import { STORY } from './text';
import { clone } from '../../engine/game';
import { processPrice } from '../../engine/futures';
import { balance, marketById } from '../../engine/data';
import { useUI } from '../uiStore';
import { marginFromPct } from '../../engine/futures';
import { feeRate } from '../../engine/skilltree';
import { nextBorrowRate } from '../../engine/selectors';
import { pushOne, dropLast, beginScript, endScript } from '../priceHistory';
import { play } from './audio';
import { say } from './watch';

/** 거래소 탭을 처음 열었다: 오소리 대부가 걸어 보라고 한다. */
export function tutorialIntro(): void {
  const P = useProto.getState();
  if (P.tutorial !== 'await' || P.seen.tutIntro) return;
  P.pushScene({ id: 'tutIntro', lines: STORY.tutIntro(tutorialMargin(), TUT.lev, tipArgs(useGame.getState().g)) });
}
/** 거는 돈(U-43 사용자: "걍 전재산 넣으면 되잖아"): 가진 돈 전부(들어갈 때 수수료를 낼 만큼은 뺀다). 최소 증거금도 안 되면 0(튜토리얼을 건너뛴다).
 *  청산되면 손에 0 이 남고, 오소리의 두 번째 10만(2%)이 그다음 걸음이 된다. */
export function tutorialMargin(): number {
  const g = useGame.getState().g;
  const m = marginFromPct(g.run.cash, TUT.lev, 100, feeRate(g, TUT.lev, { allIn: true }));
  return m >= (balance.trading.minMargin as number) ? m : 0;
}

/** 롱/숏을 골랐다. 엔진으로 진짜 포지션을 열고, 시계를 멈춘 채 짜 둔 시세를 엔진에 먹인다. */
export function tutorialOpen(dir: 1 | -1): boolean {
  const st = useGame.getState();
  const margin = tutorialMargin();
  if (margin <= 0) { useProto.getState().patch({ tutorial: 'done' }); st.act({ type: 'endIntro' }); return false; }
  const r = st.act({ type: 'open', market: TUT.market, dir, lev: TUT.lev, margin, sl: null, tp: null });
  if (!r.ok) { say(r.msg ?? '들어갈 수 없습니다'); return false; }
  play(dir === 1 ? 'order_long' : 'order_short');
  st.setSpeed(0);
  useProto.getState().patch({ tutorial: 'run', forceTrade: false, pointTab: null });
  const real = useGame.getState().g.run.prices[TUT.market];
  beginScript(TUT.market);
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
  endScript(TUT.market);
  const g2 = clone(useGame.getState().g);
  g2.run.prices[TUT.market] = real;
  // 전부 걸었다: 손에 남은 것은 1 도토리도 안 되는 끝자리뿐이다(쳇바퀴가 1초씩 넣은 돈의 소수점). 0 으로 적는다
  if (g2.run.cash < 1) g2.run.cash = 0;
  st.setGame(g2);
  const lend = officeOffer(g2).lend;
  useProto.getState().patch({ tutorial: 'lost' });
  useProto.getState().pushScene({
    id: 'tutLost', lines: STORY.tutLost(margin, lend, ratePct(nextBorrowRate(g2, 'shark1')), tipArgs(g2)),
    choices: lend > 0
      ? [{ id: 'borrow', label: `${lend % 10000 === 0 ? `${lend / 10000}만` : lend.toLocaleString('ko-KR')} 더 빌리기`, sub: `빌린 돈 +${lend.toLocaleString('ko-KR')}, 정산 이자 +${Math.round(lend * nextBorrowRate(g2, 'shark1')).toLocaleString('ko-KR')}`, primary: true, run: () => { const r = useGame.getState().act({ type: 'borrow', lender: 'shark1' }); play(r.ok ? 'collector_paid' : 'insufficient'); useProto.getState().patch({ tutorial: 'notice' }); } }]
      : [{ id: 'ok', label: '통화 끝내기', sub: '추가 대출 한도 0', primary: true, run: () => useProto.getState().patch({ tutorial: 'notice' }) }],
  });
}

/** "지금부터 실제 시세" 알림을 닫는다: 튜토리얼 끝. 시계가 다시 돈다. */
export function tutorialEnd(): void {
  useProto.getState().patch({ tutorial: 'done' });
  // 튜토리얼 뒤 거래소는 날다람쥐코인에서 연다(U-57 사용자 결정): 움직임이 큰 종목이 첫 화면. 실제 시세 종목은 탭 한 번 옆
  if (marketById.FLY?.tradable) useUI.getState().setTrade({ market: 'FLY' });
  // 튜토리얼이 끝난 자리에서 목표를 말해 준다: 빚을 다 갚는 것, 못 갚으면 파산(평생 한 번). 시계를 돌리기 전에 줄 세운다 — 오픈 기념 문자(U-40)는 그 뒤에 온다
  if (tipsLeft('goal')) useProto.getState().pushScene({ id: 'guide_goal', again: true, lines: tips('goal', tipArgs(useGame.getState().g)) });
  // 정산이 20초에서 60초가 된다(U-47): 이번 정산 구간의 남은 몫은 그대로, 남은 시간만 늘어난다. 목표 장면을 줄 세운 뒤에 한다(상태가 바뀌면 다른 알림이 먼저 끼어든다)
  useGame.getState().act({ type: 'endIntro' });
  useGame.getState().setSpeed(1);
}
