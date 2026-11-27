// 시제품 전용 장면 건너뛰기: ?proto=1&pdev=<장면>. 기존 dev.ts 의 장면 조립을 재사용한다(엔진 규칙은 건드리지 않는다).
import { applyPostTutorial } from '../../engine/act1Start';
import { useGame, persistFlag } from '../../store/gameStore';
import { buildScenario } from '../dev';
import { useProto, type Tab } from './protoStore';
import { createGame, clone, stepMut, newRun } from '../../engine/game';
import { settleSec } from '../../engine/pace';
import { netWorth } from '../../engine/selectors';
import { prologueSeen } from './Prologue';
import { KNOWN_AFTER_FIRST_LIFE } from './protoStore';
import { balance, eventById, marketById } from '../../engine/data';
import { pdev } from './config';
import { resetGuide, setGuideOff, tips, MOMENT, type Moment } from './guide';
import { tipArgs, firstVisitSec } from './model';
import { applyBirth } from '../../engine/skilltree';
import { catchUp } from '../../engine/offline';
import { retireAct1 } from '../../engine/act1Retire';
import type { Bar } from '../../engine/feed/types';
import type { GameState } from '../../engine/types';
import { useUI } from '../uiStore';
import { historyOf, markLive } from '../priceHistory';
import { forecast } from '../../engine/settlement';
import { exitFee } from '../../engine/futures';
import { acornStops } from './stops';
import { ctxOfPosition, plans } from './exitPlan';
import type { Action } from '../../engine/actions';

const q = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
/** 프롤로그를 보여 줄까: 처음 실행이면 보여 준다. &prologue=1 은 다시 보기, &prologue=0 과 장면 건너뛰기(pdev)는 생략. */
export const wantPrologue = (): boolean => !pdev && q.get('prologue') !== '0' && (q.get('prologue') === '1' || !prologueSeen());

/** 첫 생의 새 판. 정산 간격 덮어쓰기는 이 앞에서 끝나 있어야 한다. */
export function freshGame(): ReturnType<typeof createGame> {
  const st = useGame.getState();
  const g = createGame({ seed: (Date.now() & 0xffff) | 1, prices: st.g.run.prices });
  g.settings.prologueSeen = true;
  // 첫 생의 튜토리얼 동안은 정산이 20초다(U-47). 튜토리얼이 끝나면(전표를 넣는다) 60초가 된다(pace.ts endIntro)
  g.run.intro = true;
  g.run.settleIn = firstVisitSec(settleSec(g.run));
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
  // 화면 확인용: &pguide=<때> 는 그 때의 설명 장면을 바로 띄운다(예: pdev=cabin0&guide=1&pguide=hamster)
  const pg = q.get('pguide') as Moment | null;
  if (pg && pg in MOMENT) window.setTimeout(() => useProto.getState().pushScene({ id: 'guide_' + pg, again: true, lines: tips(pg, tipArgs(useGame.getState().g)) }), 400);
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
  applyBirth(g); // 스킬트리: 지난 생까지 산 노드가 이번 생에 켜진다
  applyPostTutorial(g); // U-46: 새 생은 첫 생의 튜토리얼이 끝난 자리에서(손에 10만 · 빚 50만 · 쳇바퀴 둘 · 알바 둘 · 폰)
  run.peakNetWorth = netWorth(run);
  st.setGame(g);
}

/** 1막 그대로의 중반 살림(화면 확인용, U-39): 오소리에게 두 번 빌려 빚 50만 · 폰 · 쳇바퀴 두 대에 알바 둘 · 끝난 거래 3건(50배). 전부 엔진 행동으로 만든다. */
function midgame(base: GameState, o: { cash?: number; closed?: number; waiver?: boolean; wheels?: number } = {}): GameState {
  const g = clone(base);
  const A = (action: Action) => stepMut(g, { type: 'action', action });
  A({ type: 'borrow', lender: 'shark1' });
  A({ type: 'openAccount', sponsor: true });
  A({ type: 'borrow', lender: 'shark1' });
  A({ type: 'hire', coin: 'DTC' });
  g.run.cash = 400_000;
  for (let i = 0; i < (o.wheels ?? 1); i++) A({ type: 'buyEquip', tier: 'wheel2', coin: 'DTC' });
  g.run.equipment.forEach((u) => A({ type: 'hire', uid: u.uid }));
  g.run.futures.closedTrades = o.closed ?? 3;
  if (o.waiver) g.run.futures.waiver = true;
  g.run.cash = o.cash ?? 100_000;
  g.run.settleNo = 4;
  g.run.settleIn = balance.settlement.intervalSec;
  return g;
}
/** 자리를 비운 사이(화면 확인용): 지금 시세에서 조금씩 걸어가는 1분 봉을 만들어 엔진의 따라잡기(catchUp)에 그대로 먹인다. down = 열린 포지션에 불리한 쪽으로 가는 폭(%) */
export function devAway(minutes: number, downPct: number): void {
  const st = useGame.getState();
  const g = clone(st.g);
  const from = g.run.lastSeenTick + 1;
  const bars: Bar[] = [];
  for (let k = 0; k < minutes; k++) for (const [m, px] of Object.entries(g.run.prices)) {
    const dir = g.run.positions[m]?.dir ?? 1;
    const at = (i: number) => px * (1 - dir * (downPct / 100) * (i / minutes));
    const o = at(k), c = at(k + 1);
    bars.push({ market: m, n0: from + k * 60, o, h: Math.max(o, c) * 1.0002, l: Math.min(o, c) * 0.9998, c, vol: 0, buy: 0 });
  }
  const report = catchUp(g, bars, minutes * 60);
  st.setGame(g);
  useGame.setState((s) => ({ net: { ...s.net, away: report } }));
}

function scene(name: string, base: ReturnType<typeof createGame>) {
  const P = useProto.getState();
  const un = { lot: true, phone: true, map: true } as const;
  const seen = Object.fromEntries([...KNOWN_AFTER_FIRST_LIFE, 'firstSettle', 'office'].map((k) => [k, true]));
  P.patch({ seen, cutCount: 1, loanTaken: true, tutorial: 'done' });
  base.run.intro = false; // 장면 건너뛰기는 튜토리얼이 끝난 판이다(정산 60초)
  base.run.settleIn = balance.settlement.intervalSec;
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
    case 'broke': case 'rebirth': case 'tree': {
      const g = buildScenario('ending', base);
      P.patch({ everUnlocked: { ...un } });
      // 화면 확인용: 황금 도토코인 12개에 뿌리·단골 수수료 Lv2·한 손 정리·확인서 단골을 가진 가문
      if (name === 'tree') { g.family.gold = q.get('pgold') ? +q.get('pgold')! : 12; g.family.skill = { R: 1, A1: 2, A2: 1, B1: 1 }; if (g.estate) g.estate.gold = 3; g.run.stats['repaid.shark1'] = 150_000; }
      if (name !== 'broke') { stepMut(g, { type: 'action', action: { type: 'estateNext' } }); stepMut(g, { type: 'action', action: { type: 'inherit', branch: 'renounce' } }); }
      return g;
    }
    case 'cabin0': case 'cabin1': case 'cabin2': case 'cabin3': {
      // 집 그림 확인용: 쳇바퀴와 알바가 늘어난 방(0 = 폰만 받음, 1 = 첫 쳇바퀴에 알바 + 빈 쳇바퀴 하나, 2 = 세 대, 3 = 꽉 참)
      const g = clone(base);
      const n = name === 'cabin0' ? 0 : name === 'cabin1' ? 1 : name === 'cabin2' ? 2 : 5;
      P.patch({ everUnlocked: { ...un }, visited: { ...un } });
      g.run.cash = 500_000;
      stepMut(g, { type: 'action', action: { type: 'borrow', lender: 'shark1' } });
      stepMut(g, { type: 'action', action: { type: 'openAccount', sponsor: true } });
      if (name !== 'cabin0') stepMut(g, { type: 'action', action: { type: 'hire', coin: 'DTC' } });
      for (let i = 0; i < n; i++) stepMut(g, { type: 'action', action: { type: 'buyEquip', tier: 'wheel2', coin: 'DTC' } });
      g.run.equipment.forEach((u, i) => { if (name !== 'cabin1' && (name === 'cabin3' || i < 1)) stepMut(g, { type: 'action', action: { type: 'hire', uid: u.uid } }); });
      g.run.cash = name === 'cabin0' ? 91_240 : 31_240;
      g.run.settleIn = balance.settlement.intervalSec;
      return clone(g);
    }
    // ── U-39 화면 확인용(1막 그대로의 살림) ──
    case 'mid': P.patch({ everUnlocked: { ...un }, visited: { ...un }, seen: { ...seen, capitalSms: true } }); return midgame(base);
    case 'hold': case 'hold200': case 'squeeze': case 'awaypos': {
      // 포지션을 들고 있다: hold = 50배 절반, hold200 = 200배 4분의 1, squeeze = 50배 전부(정산 때 낼 돈이 묶여 있다)
      P.patch({ everUnlocked: { ...un }, visited: { ...un }, tab: 'phone', seen: { ...seen, capitalSms: true } });
      let g = midgame(base, { closed: name === 'hold200' ? 10 : 3, waiver: name === 'hold200' });
      // squeeze 는 10배 전부(청산이 멀어 정산을 넘길 때까지 살아 있다), awaypos 는 50배 전부(비운 사이 청산된다)
      stepMut(g, { type: 'action', action: { type: 'open', market: 'DTC', dir: 1, lev: name === 'hold200' ? 200 : name === 'squeeze' ? 10 : 50, marginPct: name === 'squeeze' || name === 'awaypos' ? 100 : name === 'hold200' ? 25 : 50, sl: null, tp: null } });
      g.run.settleIn = name === 'squeeze' ? Math.min(48, balance.settlement.intervalSec - 2) : Math.round(balance.settlement.intervalSec * 0.7);
      g = clone(g);
      if (name === 'awaypos') window.setTimeout(() => devAway(12, 2.2), 2600); // 12분 비움: 50배 전부가 청산되고, 정산은 두 번만 돈다
      return g;
    }
    case 'multi': case 'multihome': {
      // U-47 여러 종목을 함께 든다: 도토코인 롱 50배, 밤더리움 숏 25배, 날다람쥐코인 롱 200배(발도장을 찍은 생)
      P.patch({ everUnlocked: { ...un }, visited: { ...un }, tab: name === 'multi' ? 'phone' : 'lot', seen: { ...seen, capitalSms: true, flyNews: true } });
      const g = midgame(base, { cash: 160_000, waiver: true, wheels: 2 });
      stepMut(g, { type: 'action', action: { type: 'open', market: 'DTC', dir: 1, lev: 50, margin: 30_000, sl: null, tp: null } });
      stepMut(g, { type: 'action', action: { type: 'open', market: 'BTH', dir: -1, lev: 25, margin: 30_000, sl: null, tp: null } });
      stepMut(g, { type: 'action', action: { type: 'open', market: 'FLY', dir: 1, lev: 200, margin: 20_000, sl: null, tp: null } });
      g.run.settleIn = Math.round(balance.settlement.intervalSec * 0.7);
      return clone(g);
    }
    case 'away': {
      P.patch({ everUnlocked: { ...un }, visited: { ...un }, seen: { ...seen, capitalSms: true } });
      window.setTimeout(() => devAway(12, 0.1), 2600);
      return midgame(base);
    }
    case 'clear': {
      // 빚이 1만 남았다: 지도에서 [전부]를 누르면 완납 장면 → 은퇴할지 고른다
      P.patch({ everUnlocked: { ...un }, visited: { ...un }, tab: 'map', seen: { ...seen, capitalSms: true, repay: true, ledger_repeatCleared: true, ledger_firstCleared: true, ledger_mom20: true, ledger_mom10: true } });
      const g = midgame(base, { cash: 61_240, wheels: q.get('pwheels') ? +q.get('pwheels')! : 1 });
      const d = g.run.debts.shark1;
      d.principal = 10_000; d.inherited = 10_000; d.tranches = [];
      g.run.stats['repaid.shark1'] = 490_000; g.run.stats.stamps = 49;
      if (q.get('p200')) g.run.stats.lev200Trades = 2;
      return clone(g);
    }
    case 'retired': {
      P.patch({ everUnlocked: { ...un } });
      const g = midgame(base, { cash: 61_240 });
      const d = g.run.debts.shark1;
      d.principal = 0; d.inherited = 0; d.tranches = [];
      g.run.stats['repaid.shark1'] = 500_000;
      (balance as { act1?: unknown }).act1 ??= { friends: false };
      retireAct1(g);
      return clone(g);
    }
    // ── U-40 화면 확인용 ──
    case 'feeend': {
      // 오픈 기념이 끝나는 정산 직전(스무 번째 정산이 3초 뒤)
      P.patch({ everUnlocked: { ...un }, visited: { ...un }, seen: { ...seen, capitalSms: true, feeEventSms: true } });
      const g = midgame(base);
      g.run.settleNo = 19; g.run.settleIn = 3;
      g.run.stats.eventNotional = 31_000_000; g.run.stats.trades = 14;
      return clone(g);
    }
    case 'cont': {
      // 빚을 다 갚고 [계속한다]를 고른 생: 모은 돈의 고비가 목표다
      P.patch({ everUnlocked: { ...un }, visited: { ...un }, seen: { ...seen, capitalSms: true, feeEventSms: true, continued: true, clear: true, act2Hook: true } });
      const g = midgame(base, { cash: q.get('pcash') ? +q.get('pcash')! : 96_400, wheels: 3 });
      const d = g.run.debts.shark1;
      d.principal = 0; d.inherited = 0; d.tranches = [];
      g.run.stats['repaid.shark1'] = 500_000;
      return clone(g);
    }
    case 'rate': {
      // 금리 인상 속보: 엄마 빚은 그대로
      P.patch({ everUnlocked: { ...un }, visited: { ...un }, seen: { ...seen, capitalSms: true } });
      // 화면이 뜬 뒤에 속보가 온다(엔진이 사건을 예고할 때와 같은 꼴: 알림 한 줄 + 다음 정산부터 시작)
      window.setTimeout(() => {
        const g = clone(useGame.getState().g);
        g.run.notices.push({ id: 'event:rate_hike', tick: g.run.tick, text: eventById.rate_hike.text, kind: 'wire' });
        g.run.pendingEvents.push({ id: 'rate_hike', startsIn: 1 });
        useGame.getState().setGame(g);
      }, 1500);
      return midgame(base);
    }
    // ── U-41 화면 확인용 ──
    case 'ac': case 'post': case 'acq': {
      // 출구를 도토리로: 200배가 열린 살림에서 주문 판(ac = 오픈 기념 중, post = 이벤트가 끝난 뒤의 생 — 수수료 0.02%)
      P.patch({ everUnlocked: { ...un }, visited: { ...un }, tab: 'phone', seen: { ...seen, capitalSms: true, feeEventSms: true, dayNoteHint: true } });
      const g = midgame(base, { closed: 10, waiver: true, cash: 110_000 });
      if (name === 'post') g.run.settleNo = 22;
      useUI.getState().setTrade({ lev: 200, pct: 50, tpK: q.get('pk') === '0' ? null : 1, slK: q.get('pk') === '0' ? null : 1 });
      if (name === 'acq') {
        // 조용한 장(U-42 화면 확인용): 지난 5분의 가장 큰 폭이 0.1% 쯤인 기록을 채우고 시계를 멈춘다 → 한 번 누르기가 "지난 5분 최대 폭 기준"으로 줄어든다
        useUI.getState().setTrade({ tpK: null, slK: null });
        const fill = () => { const px = useGame.getState().g.run.prices.DTC; const h = historyOf('DTC'); h.splice(0, h.length, ...Array.from({ length: 300 }, (_, i) => px * (1 + 0.0005 * Math.sin(i / 23) + 0.00012 * Math.sin(i / 3.1))), px); markLive('DTC'); };
        window.setTimeout(() => { useGame.getState().setSpeed(0); fill(); useGame.setState((st0) => ({ g: { ...st0.g } })); }, 1500);
      }
      return clone(g);
    }
    case 'win': case 'winhold': case 'winrun': case 'lossrun': {
      // 한 판에 이자 한 번 치: 200배 절반에 익절 = 이자 한 번 치를 걸어 둔 포지션. win = 다음 틱에 익절가를 넘어 있다(엔진이 익절로 닫는다 → 장면 · 집의 잔치). winhold = 아직 들고 있다(정산이 가깝다)
      P.patch({ everUnlocked: { ...un }, visited: { ...un }, tab: 'phone', seen: { ...seen, capitalSms: true, feeEventSms: true, dayNoteHint: true }, tradeLife: 4_200, closes: 6, wins: 4, paidLife: 24_400 });
      let g = midgame(base, { closed: 10, waiver: true, cash: 120_000, wheels: 2 });
      stepMut(g, { type: 'action', action: { type: 'stamp', lender: 'shark1', mult: 1 } }); // 한 번 갚아 본 살림: 목표 막대가 금박 도장(5만)이다
      P.patch({ goalIdx: 5, everOpened: true, seen: { ...useProto.getState().seen, repay: true, momClue_frame: true, momClue_reason: true } });
      stepMut(g, { type: 'action', action: { type: 'open', market: 'DTC', dir: 1, lev: 200, marginPct: 50, sl: null, tp: null } });
      const p = g.run.positions.DTC;
      const due = Math.round(forecast(g).interest + forecast(g).living);
      const st = acornStops(ctxOfPosition(g.run, p), due, due);
      plans.DTC = { tp: due, sl: due };
      p.tpRoe = st.tp; p.slRoe = st.sl;
      const px = g.run.prices.DTC;
      // 진입가를 옮긴다(화면 확인용): win = 이미 익절가를 넉넉히 넘었다(익절 폭의 세 배 — 연습 시세의 첫 틱이 내려도 익절로 닫힌다. 닫히는 값은 익절가라 손익은 같다), winhold = 익절까지 7할
      // winrun = 이미 한 판에 이자를 번 생의 두 번째 익절(연달아 딴 장면) · lossrun = 이미 이자 한 번 치를 잃은 생의 두 번째 손절(연달아 잃은 장면, U-42)
      if (name === 'winrun') P.patch({ claimWins: 1, claimWinRun: 1, claimRunSum: due, tradeLife: 4_200 + due, seen: { ...useProto.getState().seen, winClaim1: true } });
      if (name === 'lossrun') P.patch({ claimLossRun: 1, claimRunSum: -due, tradeLife: 4_200 - due, lossStreak: 1 });
      if (name === 'lossrun') { p.tpRoe = null; plans.DTC = { tp: null, sl: due }; } // 손절만 남긴다: 연습 시세의 첫 틱이 크게 올라도 익절로 닫히지 않게
      p.entry = name === 'lossrun' ? px / (1 + ((st.sl ?? 0) / 100 / p.lev) * 2.2) : px / (1 + ((st.tp ?? 0) / 100 / p.lev) * (name === 'winhold' ? 0.7 : 3));
      if (name === 'winhold') g.run.settleIn = Math.min(50, balance.settlement.intervalSec - 2);
      g = clone(g);
      return g;
    }
    case 'frozen': {
      // 굳은 주인공(화면 확인용): 25배 포지션의 청산가가 0.8% 앞이다. 시계를 멈춰 둔다(연습 시세는 빨라서 몇 초면 청산된다)
      P.patch({ everUnlocked: { ...un }, visited: { ...un }, tab: 'lot', seen: { ...seen, capitalSms: true, feeEventSms: true } });
      const g = midgame(base, { closed: 11, waiver: true, cash: 80_000 });
      stepMut(g, { type: 'action', action: { type: 'open', market: 'DTC', dir: 1, lev: 25, marginPct: 25, sl: null, tp: null } });
      const p = g.run.positions.DTC;
      p.entry = (g.run.prices.DTC * 0.992) / (1 - p.margin / p.notional + (balance.trading.maintenanceRate as number));
      useGame.getState().setSpeed(0);
      return clone(g);
    }
    case 'cheer': {
      // 크게 딴 뒤의 집: 알바가 뛰고 쳇바퀴에 불이 켜진다
      P.patch({ everUnlocked: { ...un }, visited: { ...un }, tab: 'lot', seen: { ...seen, capitalSms: true, feeEventSms: true }, tradeLife: 21_900, claimWins: 1, closes: 7, wins: 5, paidLife: 24_400, cheer: { at: Date.now(), amount: 15_812, worth: 1.02 } });
      const g = midgame(base, { closed: 11, waiver: true, cash: 136_000, wheels: 3 });
      stepMut(g, { type: 'action', action: { type: 'stamp', lender: 'shark1', mult: 1 } });
      P.patch({ goalIdx: 5, everOpened: true, seen: { ...useProto.getState().seen, repay: true } });
      if (q.get('pidle')) { g.run.equipment[2].staffed = false; }
      return clone(g);
    }
    default: return base;
  }
}
