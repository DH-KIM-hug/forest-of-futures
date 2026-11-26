// 시제품 전용 장면 건너뛰기: ?proto=1&pdev=<장면>. 기존 dev.ts 의 장면 조립을 재사용한다(엔진 규칙은 건드리지 않는다).
import { useGame, persistFlag } from '../../store/gameStore';
import { buildScenario } from '../dev';
import { useProto, type Tab } from './protoStore';
import { createGame, clone, stepMut, newRun } from '../../engine/game';
import { netWorth } from '../../engine/selectors';
import { prologueSeen } from './Prologue';
import { KNOWN_AFTER_FIRST_LIFE } from './protoStore';
import { balance, marketById } from '../../engine/data';
import { pdev } from './config';
import { resetGuide, setGuideOff } from './guide';

const q = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
/** 프롤로그를 보여 줄까: 처음 실행이면 보여 준다. &prologue=1 은 다시 보기, &prologue=0 과 장면 건너뛰기(pdev)는 생략. */
export const wantPrologue = (): boolean => !pdev && q.get('prologue') !== '0' && (q.get('prologue') === '1' || !prologueSeen());

/** 첫 생의 새 판. 정산 간격 덮어쓰기는 이 앞에서 끝나 있어야 한다. */
export function freshGame(): ReturnType<typeof createGame> {
  const st = useGame.getState();
  const g = createGame({ seed: (Date.now() & 0xffff) | 1, prices: st.g.run.prices });
  g.settings.prologueSeen = true;
  g.run.settleIn = balance.settlement.intervalSec;
  return g;
}

/** 새 게임으로 시작(저장 읽기 없음). */
export function bootProto(): void {
  persistFlag.on = false;
  const st = useGame.getState();
  let g = freshGame();
  // 튜토리얼 설명(guide.ts): &prologue=1 이나 &guide=1 이면 처음부터 다시, &guide=0 이나 장면 건너뛰기(pdev)에서는 끈다
  if (q.get('prologue') === '1' || q.get('guide') === '1') resetGuide();
  setGuideOff(q.get('guide') === '0' || (!!pdev && q.get('guide') !== '1'));
  if (pdev) g = scene(pdev, g);
  if (wantPrologue()) { useProto.getState().patch({ prologue: true }); st.setSpeed(0); }
  st.setGame(g);
  const t = q.get('ptab');
  if (t) useProto.getState().setTab(t as Tab);
}

/** 프롤로그가 끝났다: 판을 새로 깔고(프롤로그 동안 흐른 시세·시계를 버린다) 시계를 돌린다. 첫 탭 한 번은 프롤로그에서 쳇바퀴를 굴린 그 탭이다. */
export function endPrologue(): void {
  const st = useGame.getState();
  st.setGame(freshGame());
  useProto.getState().patch({ prologue: false });
  st.setSpeed(1);
  st.act({ type: 'tap' });
}

/** 환생(T-1·T-3): 엔진은 아직 상속(상속포기 갈래)으로 다음 판을 만든다. 시제품은 그 판을 첫 생과 같은 새 판(엄마 빚 30만 · 현금 0 · 엄마의 쳇바퀴 한 대, balance.start)으로 덮는다.
 *  남기는 것: 가문 기록(황금 도토코인, 엔딩 장부, 세대 번호)과 시세·시계. 지우는 것: 상속의 흔적(학자금·연대보증 빚, 원한, 기질, 사전교육 1장). */
export function rebirthOverride(): void {
  const st = useGame.getState();
  const g = clone(st.g);
  const old = g.run;
  const run = newRun(old.seed, old.prices);
  run.refPrice = { ...old.refPrice };
  run.prices = { ...old.prices };
  run.tick = old.tick; run.startTick = old.tick; run.lastSeenTick = old.lastSeenTick; run.marketStatus = old.marketStatus; run.mkt = old.mkt; run.uidSeq = old.uidSeq;
  run.settleIn = balance.settlement.intervalSec;
  g.run = run;
  g.family.traits = []; g.family.deepBlood = false; g.family.lenderRelations = {};
  run.peakNetWorth = netWorth(run);
  st.setGame(g);
}

function scene(name: string, base: ReturnType<typeof createGame>) {
  const P = useProto.getState();
  const un = { lot: true, phone: true, map: true } as const;
  const seen = Object.fromEntries([...KNOWN_AFTER_FIRST_LIFE, 'firstSettle', 'office'].map((k) => [k, true]));
  P.patch({ seen, cutCount: 1, loanTaken: true, tutorial: 'done' });
  const ready = () => {
    const g = buildScenario('trade', base);
    g.run.settleIn = balance.settlement.intervalSec;
    P.patch({ everUnlocked: { ...un }, visited: { ...un } });
    return g;
  };
  switch (name) {
    case 'ready': return ready();
    case 'pos': case 'near': case 'liq': {
      let g = ready();
      const px = g.run.prices.DTC;
      stepMut(g, { type: 'action', action: { type: 'open', market: 'DTC', dir: 1, lev: name === 'pos' ? 50 : 25, marginPct: 25, sl: null, tp: null } });
      if (name === 'liq') g.run.positions.DTC.entry = px * 1.08; // 다음 틱에 강제 청산(화면 확인용)
      if (name === 'near') {
        const p = g.run.positions.DTC;
        // 청산가까지 약 3%가 되게 진입가를 옮긴다(화면 확인용)
        p.entry = px * (1 - 0.0094);
      }
      g = clone(g);
      return g;
    }
    case 'profit': {
      const g = ready();
      P.patch({ wins: 2, closes: 3, profit: { coin: marketById.DTC.name, dir: 1, lev: 50, roe: 128.4, pnl: 38520, entry: 0.8421, exit: 0.8441, heldSec: 187, wins: 2, closes: 3, gen: 2, date: new Date() } });
      return g;
    }
    case 'wallet': {
      // 지갑 시트 확인용: 도토코인 쳇바퀴 + 코인 몇 가지를 들고 있다(바로 팔기는 끔)
      const g = ready();
      g.run.cash = 12_480;
      for (const c of ['DTC', 'MDT', 'BTH']) {
        g.run.coinWheels[c] ??= { on: true, autoSell: false, tagBy: null };
        g.run.wallet[c] = { qty: c === 'DTC' ? 0.0418 : c === 'MDT' ? 12.25 : 0.368, locked: 0 };
      }
      g.run.coinWheels.DTC.autoSell = true;
      P.patch({ tab: 'lot', wallet: new URLSearchParams(window.location.search).get('pwal') === '1' });
      return clone(g);
    }
    case 'debt': { const g = ready(); g.run.settleIn = 2; return g; }
    case 'broke': case 'rebirth': {
      const g = buildScenario('ending', base);
      P.patch({ everUnlocked: { ...un } });
      if (name === 'rebirth') { stepMut(g, { type: 'action', action: { type: 'estateNext' } }); stepMut(g, { type: 'action', action: { type: 'inherit', branch: 'renounce' } }); }
      return g;
    }
    case 'cabin1': case 'cabin2': case 'cabin3': {
      // 오두막 그림 확인용: 쳇바퀴와 알바가 늘어난 방(1 = 첫 쳇바퀴에 알바 + 빈 쳇바퀴 하나, 2 = 세 대, 3 = 꽉 참)
      const g = clone(base);
      const n = name === 'cabin1' ? 1 : name === 'cabin2' ? 2 : 5;
      P.patch({ everUnlocked: { ...un }, visited: { ...un } });
      g.run.cash = 500_000;
      stepMut(g, { type: 'action', action: { type: 'borrow', lender: 'shark1' } });
      stepMut(g, { type: 'action', action: { type: 'openAccount', sponsor: true } });
      stepMut(g, { type: 'action', action: { type: 'hire', coin: 'DTC' } });
      for (let i = 0; i < n; i++) stepMut(g, { type: 'action', action: { type: 'buyEquip', tier: 'wheel2', coin: 'DTC' } });
      g.run.equipment.forEach((u, i) => { if (name !== 'cabin1' && (name === 'cabin3' || i < 1)) stepMut(g, { type: 'action', action: { type: 'hire', uid: u.uid } }); });
      g.run.cash = 31_240;
      g.run.settleIn = balance.settlement.intervalSec;
      return clone(g);
    }
    default: return base;
  }
}
