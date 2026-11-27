// 게임 상태 변화를 보고 시제품 화면 사건(추심원·정산 컷인·탭 해금·목표)을 만든다. 규칙은 엔진의 것만 쓴다.
import { useGame } from '../../store/gameStore';
import { useProto, type Scene } from './protoStore';
import { currentGoal, lifeNo, officeOffer, claim, hamsterMath, tipArgs, interestNow, interestAfterHike, fixedInterestNow } from './model';
import { holdBeat, tensionOf } from './tension';
import { awayCard, type AwayPurse } from './away';
import { historyOf, liveHistoryOf } from '../priceHistory';
import { canRoll, holdKey, rolledFor } from './roll';
import { rollTarget } from '../../engine/mining';
import { nextTierCost } from '../../engine/equipment';
import { EXTRA_WHEEL } from './model';
import { positionView } from '../vm/trade';
import { balance } from '../../engine/data';
import { tips, tipsLeft, type Moment } from './guide';
import { STORY, WHO_NAME } from './text';
import { comma } from '../../engine/util';
import { DEBT_IDS, eventById, lenderById, marketById } from '../../engine/data';
import { levCapNow } from '../../engine/progression';
import { forecast } from '../../engine/settlement';
import { tradeReaction, settleRemark, isTiny, worthCertificate } from './react';
import { dayBars, dayNote, noteToast } from './daynote';
import { STAMP_STEP } from './ledger';
import { reapplyAllPlans } from './exitPlan';
import { ledgerBeat, goldStamps, ledgerRows, momClueDue, repaidOffice, repayBuys } from './ledger';
import { lenderLimit, nextBorrowRate } from '../../engine/selectors';
import { useUI } from '../uiStore';
import { callLoanCut, defaultSl, treeAward } from '../../engine/skilltree';
import { ownedCoins, lenderDebtTotal, interestDue, totalDebt } from '../../engine/selectors';
import { settle } from '../../engine/settlement';
import { clone } from '../../engine/game';
import { fx } from './fx';
import { play, later } from './audio';
import { closeBack, exitFee, roePct } from '../../engine/futures';
import { exitFeeMul, feeEventLeft, openingEvent, feeRate } from '../../engine/skilltree';
import { recentRange } from './tension';
import { allQuiet, liveliest, sessionOpen, sessionHoursKst, SESSIONS, feeSaved, LIVELY_PCT, QUIET_PCT, openHeadsUp, spanText, untilHourMin } from './market';
import type { GameState, Position } from '../../engine/types';

/** 포지션이 닫힌 것을 보고 이번 생 승률을 올리고, 이익이면 수익 인증서 물음을 띄운다(한 번 닫을 때 한 번). */
export function noteClose(c: { market: string; dir: 1 | -1; lev: number; roe: number; pnl: number; margin: number; claim: number; entry: number; exit: number; heldSec: number; gen: number; gold?: boolean }): void {
  const P = useProto.getState();
  const win = c.pnl > 0;
  const wins = P.wins + (win ? 1 : 0);
  const closes = P.closes + 1;
  // 인증서 물음은 볼 만한 이익에만(잔돈 이익마다 뜨지 않는다, U-38)
  const card = win && worthCertificate(c.pnl, c.margin, c.claim);
  P.patch({ wins, closes, profit: card ? { coin: marketById[c.market]?.name ?? c.market, dir: c.dir, lev: c.lev, roe: c.roe, pnl: c.pnl, entry: c.entry, exit: c.exit, heldSec: c.heldSec, wins, closes, gen: c.gen, date: new Date(), gold: c.gold } : P.profit });
}

const overdueSum = (g: GameState): number => DEBT_IDS.reduce((a, id) => a + g.run.debts[id].overdue, 0);
const FULL_CUTINS = 5;
let toastTimer: number | undefined;
let cheerTimer: number | undefined;
/** 크게 딴 뒤 집이 들썩이는 시간(ms) */
export const CHEER_MS = 45_000;
let collTimer: number | undefined;
/** 집의 잔치를 (다시) 켠다: 한 판에 이자 한 번 치를 벌었다. 장면이 떠 있던 동안 지나간 시간은 세지 않게, 장면이 끝날 때 다시 부른다(U-42 ⑤) */
export function cheerOn(amount: number, worth: number): void {
  useProto.getState().patch({ cheer: { at: Date.now(), amount: Math.round(amount), worth } });
  window.clearTimeout(cheerTimer);
  cheerTimer = window.setTimeout(() => useProto.getState().patch({ cheer: null }), CHEER_MS);
}
/** 도토리일보의 한 줄(조용한 장에서, 받은 시세에서 센 것만): 지난 하루에 가장 시끄러웠던 시간대와 그때까지 남은 시간. 기록이 모자라면 null(연습 시세 판) */
export function loudNoteLine(now = Date.now()): string | null {
  const ms = Object.values(marketById).filter((m) => m.tradable).map((m) => ({ id: m.id, name: m.name }));
  const note = dayNote(ms, Object.fromEntries(ms.map((m) => [m.id, dayBars(m.id)])), now);
  const loud = note.rows.filter((r) => r.loudHour !== null && r.loud1m !== null);
  if (!loud.length) return null;
  const top = loud.reduce((a, b) => (b.loud1m! > a.loud1m! ? b : a));
  const left = untilHourMin(top.loudHour!, new Date(now));
  return `[도토리일보] 지난 하루 가장 출렁인 때는 ${top.loudHour}시 무렵 ${top.name}, 1분에 ${top.loud1m!.toFixed(2)}%. ${left === 0 ? '지금이 그 시각이다.' : `그 시각까지 ${spanText(left)}.`}`;
}
const openSaid = new Set<string>();

export function say(text: string, ms = 3000): void {
  useProto.getState().patch({ toast: text });
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => useProto.getState().patch({ toast: null }), ms);
}

/** 이야기 장면을 줄 세운다(이번 생에 이미 본 것은 다시 나오지 않는다). */
function scene(sc: Scene): void { useProto.getState().pushScene(sc); }

/** 중고폰이 울린다: 오소리 대부가 폰의 FRX 앱을 켜 보라고 한다(U-43). 끝나면 튜토리얼 거래를 걸 때까지 거래소 탭(앱)만 열 수 있고 정산 시계가 멈춘다(그동안 나쁜 일이 없다). */
export function phoneRing(): void {
  const P = useProto.getState();
  P.patch({ seen: { ...P.seen, phoneRung: true } }); // 장면 이름(phoneRing)과 다른 열쇠: 장면은 본 뒤에 seen[phoneRing] 이 적힌다
  play('phone_open');
  scene({
    id: 'phoneRing', hold: true, lines: STORY.phoneRing(repaidOffice(useGame.getState().g)),
    onEnd: () => { useProto.getState().patch({ forceTrade: true, pointTab: 'phone' }); useGame.getState().setSpeed(0); },
  });
}

/** 급하지 않은 장면(문자·속보·족제비): 포지션이 열려 있는 동안에는 띄우지 않고 기다린다 — 정리 단추를 가리지 않게. */
const calm: Scene[] = [];
function sceneCalm(sc: Scene): void {
  if (Object.keys(useGame.getState().g.run.positions).length === 0) scene(sc);
  else if (!calm.some((x) => x.id === sc.id)) calm.push(sc);
}
function flushCalm(): void {
  if (!calm.length || Object.keys(useGame.getState().g.run.positions).length > 0) return;
  for (const sc of calm.splice(0)) scene(sc);
}

/** 급한 장면(연체·압류·미납 문자)도, 포지션을 열어 둔 채 거래소를 보고 있는 동안에는 기다린다 — [정리하기]를 가리지 않게(U-39 ②).
 *  그 사이에는 한 줄 알림으로만 알리고, 포지션을 닫거나 거래소 탭을 떠나면 뜬다. */
const held: Scene[] = [];
const busyTrading = (): boolean => Object.keys(useGame.getState().g.run.positions).length > 0 && useProto.getState().tab === 'phone' && !useGame.getState().g.run.over;
function sceneHeld(sc: Scene, toast?: string): void {
  if (!busyTrading()) { scene(sc); return; }
  if (!held.some((x) => x.id === sc.id)) held.push(sc);
  if (toast) say(toast, 6000);
}
function flushHeld(): void {
  if (!held.length || busyTrading()) return;
  for (const sc of held.splice(0)) scene(sc);
}

/** 이 거래로 지금까지 늘거나 준 돈: 지금 정리하면 돌려받는 돈 − 넣은 돈 − 들어갈 때 낸 수수료(결과 카드와 같은 셈). */
export const tradeNet = (p: { margin0: number; feesPaid: number }, back: number): number => back - p.margin0 - p.feesPaid;

/** 방금 닫힌 포지션 p 의 셈. 결과 카드(Trade.tsx)와 세상의 반응이 같은 숫자를 쓴다.
 *  pnl = 이 거래로 늘거나 준 돈(들어갈 때·나올 때 수수료 포함, 청산이면 돌려받은 환급 포함). move = 시세로 번 돈, fees = 낸 수수료. */
export function closedMath(run: GameState['run'], p: Position): { kind: 'liq' | 'sl' | 'tp' | 'close'; exit: number; pnl: number; fees: number; move: number; refund: number } {
  const log = ([...run.tradeLog] as { market: string; price: number; kind: string }[]).reverse().find((l) => l.market === p.market && l.kind !== 'entry' && l.kind !== 'add');
  const kind = (log?.kind ?? 'close') as 'liq' | 'sl' | 'tp' | 'close';
  const exit = log?.price ?? run.prices[p.market];
  const liq = kind === 'liq';
  const refund = liq ? run.eventLog.slice(-4).filter((e) => e.kind === 'liq:refund' && e.at.tick === run.tick).reduce((a, e) => a + (e.amount ?? 0), 0) : 0;
  const mul = exitFeeMul(run, kind === 'sl' ? 'sl' : 'close');
  const xfee = liq ? 0 : exitFee(p, mul);
  const pnl = liq ? refund - p.margin0 - p.feesPaid : closeBack(p, exit, mul) - p.margin0 - p.feesPaid;
  const fees = Math.round(p.feesPaid + xfee);
  return { kind, exit, pnl, fees, move: pnl + fees - refund, refund };
}

/** 빚을 다 갚은 생을 닫는다(은퇴): 엔진이 엔딩 카드를 띄운다. */
export function retireNow(): void {
  const r = useGame.getState().act({ type: 'retireAct1' });
  if (!r.ok) say(r.msg ?? '아직 닫을 수 없다');
}

// ── 포지션을 들고 있는 동안(U-39 ①): 주인공의 속마음 ─────────────────────
interface Hold { openTick: number; seen: Record<string, boolean>; peakPnl: number; lowRoe: number; settle0: number; lastAt: number }
const holds: Record<string, Hold> = {};
let thinkTimer: number | undefined;
/** 정산 몇 초 전에 추심원이 미리 말하는가 */
export const headsUpSec = (): number => Math.min(30, Math.floor(balance.settlement.intervalSec * 0.4));
function holdTick(g: GameState): void {
  const P = useProto.getState();
  const run = g.run;
  for (const m of Object.keys(holds)) if (!run.positions[m] || run.positions[m].openTick !== holds[m].openTick) delete holds[m];
  if (P.tutorial !== 'done' || run.over) return;
  const c = claim(g).total;
  let short: boolean | null = null;
  for (const p of Object.values(run.positions)) {
    const h = (holds[p.market] ??= { openTick: p.openTick, seen: {}, peakPnl: 0, lowRoe: 0, settle0: run.settleNo, lastAt: -99 });
    const v = positionView(g, p.market);
    if (!v) continue;
    const pnl = tradeNet(p, v.back);
    const roe = (pnl / Math.max(1, p.margin0)) * 100; // 수수료까지 넣은 비율(화면의 큰 숫자와 같다)
    h.peakPnl = Math.max(h.peakPnl, pnl);
    h.lowRoe = Math.min(h.lowRoe, roe);
    if (P.scenes.length > 0 || run.tick - h.lastAt < 9) continue;
    // 걸어 둔 익절이 멀다(U-41, 실시간 판에서 본 것): 정산이 두 번 지나가도록 익절까지 절반도 못 갔으면 한 번 — 낮출지 기다릴지는 내가 정한다
    if (p.tpRoe !== null && !h.seen.tpFar && run.settleNo - h.settle0 >= 2 && p.peakRoe < p.tpRoe * 0.5) {
      h.seen.tpFar = true; h.lastAt = run.tick;
      useProto.getState().patch({ think: { text: '…정산이 두 번 지나갔다. 익절이 멀다.', k: run.tick } });
      window.clearTimeout(thinkTimer);
      thinkTimer = window.setTimeout(() => useProto.getState().patch({ think: null }), 6500);
      return;
    }
    const thinkNow = (text: string) => {
      h.lastAt = run.tick;
      useProto.getState().patch({ think: { text: Object.keys(run.positions).length > 1 ? `[${marketById[p.market]?.name ?? p.market}] ${text}` : text, k: run.tick } });
      window.clearTimeout(thinkTimer);
      thinkTimer = window.setTimeout(() => useProto.getState().patch({ think: null }), 6500);
    };
    // 진짜로 일어난 일(U-42): 지난 몇 분의 가장 높은 값 · 가장 낮은 값을 방금 넘었다. 시세에서 센 것이다 — 꾸민 출렁임이 아니다. 포지션마다 쪽마다 한 번
    {
      const hs = historyOf(p.market);
      if (hs.length >= 240 && run.tick - p.openTick >= 20) {
        const cur = hs[hs.length - 1], past = hs.slice(0, -4).filter((x) => x > 0);
        const hi = Math.max(...past), lo = Math.min(...past);
        const mins = Math.max(1, Math.round(hs.length / 60));
        if (lo > 0 && ((hi - lo) / lo) * 100 >= QUIET_PCT) {
          if (cur > hi && !h.seen.hi10) { h.seen.hi10 = true; thinkNow(`…지난 ${mins}분의 가장 높은 값을 방금 넘었다. ${p.dir === 1 ? '내 쪽이다.' : '반대쪽이다.'}`); return; }
          if (cur < lo && !h.seen.lo10) { h.seen.lo10 = true; thinkNow(`…지난 ${mins}분의 가장 낮은 값을 방금 깼다. ${p.dir === -1 ? '내 쪽이다.' : '반대쪽이다.'}`); return; }
        }
      }
    }
    // 손이 심심하다(U-42): 45초를 들고 있었는데 숫자가 거의 안 움직였고 쳇바퀴도 안 굴렸다 — 이번 생에 한 번, 할 일을 떠올린다(정산 낼 돈은 쳇바퀴에서 나온다)
    if (!P.seen.idleHands && canRoll() && run.tick - p.openTick >= 45 && Math.abs(roe) < 12 && rolledFor(holdKey()) < 1 && !run.over) {
      P.patch({ seen: { ...useProto.getState().seen, idleHands: true } });
      thinkNow('…쳇바퀴라도 굴릴까.');
      return;
    }
    const squeezed = run.settleIn <= 60 && run.settleIn > 2 && (short ??= wouldBeShort(g));
    // 같은 줄이 판마다 되풀이되지 않게 포지션 순번으로 번갈아 쓴다. 포지션이 둘 이상이면 어느 종목 얘기인지 앞에 붙인다(U-40)
    const b = holdBeat({ pnl, roe, heldSec: run.tick - p.openTick, claim: c, reach: tensionOf(v.liqDistPct, liveHistoryOf(p.market)).reach, peakPnl: h.peakPnl, lowRoe: h.lowRoe, settles: run.settleNo - h.settle0, squeezed, feesPaid: p.feesPaid, rolled: rolledFor(holdKey()) }, h.seen, (run.stats.tradesOpened as number | undefined) ?? 0);
    if (!b) continue;
    h.seen[b.key] = true;
    h.lastAt = run.tick;
    const many = Object.keys(run.positions).length > 1;
    useProto.getState().patch({ think: { text: many ? `[${marketById[p.market]?.name ?? p.market}] ${b.text}` : b.text, k: run.tick } });
    window.clearTimeout(thinkTimer);
    thinkTimer = window.setTimeout(() => useProto.getState().patch({ think: null }), 6500);
    return; // 한 틱에 한 마디
  }
}

// ── 장이 조용한가 · 본장이 열리고 닫히는가(U-40): 있는 그대로를 말한다. 가짜 출렁임은 없다 ─────────────
const mk = { quietFor: 0, lastLineAt: -9999, wasQuiet: false, n: 0, sess: {} as Record<string, boolean> };
const QUIET_HERO = ['…다섯 종목이 다 자고 있다.', '…아무것도 안 움직인다.'];
function marketTick(g: GameState): void {
  const P = useProto.getState();
  const run = g.run;
  if (P.tutorial !== 'done' || run.over || !run.futures.open) return;
  // 본장 개장 · 마감(삼솔전자 · 잣스닥): 거래소를 보고 있을 때만 한 줄
  if (run.tick % 5 === 0) {
    const now = new Date();
    for (const id of Object.keys(SESSIONS)) {
      const open = !!sessionOpen(id, now);
      if (mk.sess[id] !== undefined && mk.sess[id] !== open && P.tab === 'phone') say(open ? `[FRX 숲거래소] ${marketById[id]?.name ?? id} 본장 개장 (${sessionHoursKst(id, now)})` : `[FRX 숲거래소] ${marketById[id]?.name ?? id} 본장 마감`, 6000);
      mk.sess[id] = open;
    }
  }
  // 본장이 곧 열린다(U-42): 달력으로 아는 것만 — 30분 · 10분 · 1분 전에 한 줄(어느 탭에서든). 조용한 시간에 기다릴 까닭이 생긴다
  if (run.tick % 5 === 0 && P.scenes.length === 0) {
    const now = new Date();
    for (const id of Object.keys(SESSIONS)) {
      const hu = openHeadsUp(id, now, openSaid);
      if (!hu) continue;
      openSaid.add(hu.key);
      say(`[도토리일보] ${marketById[id]?.name ?? id} 본장 개장 ${hu.min}분 전 (${(sessionHoursKst(id, now) ?? '').split('~')[0]}). 휴장일이면 조용하다.`, 7000);
      break;
    }
  }
  // 도토리일보 시세면(U-41): 이번 생에 거래소를 처음 펴 보고 조금 지난 뒤, 지난 몇 시간의 머리기사를 한 줄로(기록이 30분은 있어야 싣는다)
  if (P.tab === 'phone' && P.scenes.length === 0 && !P.seen.dayNoteHint && P.seen.feeEventSms && !P.toast && Object.keys(run.positions).length === 0) {
    const ms = Object.values(marketById).filter((m) => m.tradable).map((m) => ({ id: m.id, name: m.name }));
    const note = dayNote(ms, Object.fromEntries(ms.map((m) => [m.id, dayBars(m.id)])), Date.now());
    if (note.spanMin >= 30) { P.patch({ seen: { ...useProto.getState().seen, dayNoteHint: true } }); say(`${noteToast(note)} (「지금 장」을 누르면 펴진다)`, 8000); return; }
  }
  if (P.tab !== 'phone' || P.scenes.length > 0 || Object.keys(run.positions).length > 0) { mk.quietFor = 0; return; }
  const ranges = Object.values(marketById).filter((m) => m.tradable).map((m) => ({ id: m.id, r: recentRange(liveHistoryOf(m.id)) }));
  const quiet = allQuiet(ranges.map((x) => x.r));
  mk.quietFor = quiet ? mk.quietFor + 1 : 0;
  // 전부 조용한 지 45초: 주인공이 그렇다고 말한다(4분에 한 번). 이번 생 처음이면 오소리 대부도 한 줄
  if (quiet && mk.quietFor >= 45 && run.tick - mk.lastLineAt >= 240) {
    mk.lastLineAt = run.tick; mk.wasQuiet = true;
    useProto.getState().patch({ think: { text: QUIET_HERO[mk.n++ % QUIET_HERO.length], k: run.tick } });
    window.clearTimeout(thinkTimer);
    thinkTimer = window.setTimeout(() => useProto.getState().patch({ think: null }), 6500);
    if (!P.seen.quietBoss) { P.patch({ seen: { ...useProto.getState().seen, quietBoss: true } }); later(7000, () => say('오소리 대부: 장이 조용하네요. 이런 날엔 쳇바퀴가 제일 시끄럽죠.', 5500)); }
    // 두 번째로 조용한 때부터(U-42): 신문이 "지난 하루에 언제가 시끄러웠는지"를 한 줄로 — 기다릴지 말지는 내가 정한다
    else if (!P.seen.loudNote) { const ln = loudNoteLine(); if (ln) { P.patch({ seen: { ...useProto.getState().seen, loudNote: true } }); later(7000, () => say(ln, 8000)); } }
    return;
  }
  // 조용하던 장에서 한 종목이 깨어났다
  const top = liveliest(ranges);
  if (mk.wasQuiet && top && top.r >= LIVELY_PCT) {
    mk.wasQuiet = false;
    useProto.getState().patch({ think: { text: `…${marketById[top.id]?.name ?? top.id} 쪽이 깨어났다. 1분에 ${top.r.toFixed(2)}%.`, k: run.tick } });
    window.clearTimeout(thinkTimer);
    thinkTimer = window.setTimeout(() => useProto.getState().patch({ think: null }), 6500);
  }
}

/** 빚 없는 생을 이어 가는 동안([계속한다], U-40)의 모은 돈 고비 */
export const SAVINGS_STEPS = [100_000, 300_000, 1_000_000];
/** 다음 고비의 번호(다 넘었으면 SAVINGS_STEPS.length). seen = 이번 생에 본 장면 */
export const savingsStep = (seen: Record<string, boolean>): number => { let k = 0; while (k < SAVINGS_STEPS.length && seen['savings' + k]) k++; return k; };

/** 지금 이대로 정산하면 못 내는 돈이 생기는가: 엔진의 정산을 복사본에 돌려 본다(추측하지 않는다). */
export function wouldBeShort(g: GameState): boolean {
  const p = clone(g);
  settle(p);
  return (p.run.lastSettlement?.unpaid ?? 0) > 0;
}

/** 추심원을 돌려보낸다: 시계가 다시 돌고 이번 정산은 엔진 규칙대로 연체가 된다. */
export function sendAway(): void {
  const g = useGame.getState().g;
  useProto.getState().patch({ waiting: false, sentAwayAt: g.run.settleNo });
  useGame.getState().setSpeed(1);
  say('추심원: 그럼 연체로 적을게요오.', 3500);
}

/** 오소리 사무소에서 이번 생 처음 빌렸다(Tabs.tsx 가 엔진 borrow 가 성공한 뒤 부른다): 중고폰 = 선물 계좌(엔진 sponsor 개설) + 거래소 탭. */
export function onFirstOfficeLoan(before: GameState): void {
  const st = useGame.getState();
  const P = useProto.getState();
  if (P.loanTaken) return;
  const oldInterest = interestDue(before, 'shark1');
  const o = officeOffer(before);
  const hadPhone = before.run.futures.open;
  if (!hadPhone) st.act({ type: 'openAccount', sponsor: true });
  const g = useGame.getState().g;
  P.patch({ loanTaken: true, tutorial: P.tutorial === 'none' ? 'await' : P.tutorial });
  scene({
    id: 'office', unlock: 'phone',
    lines: STORY.office({ lend: o.lend, ratePct: o.ratePct, oldInterest, newInterest: interestDue(g, 'shark1'), debt: g.run.debts.shark1.principal, hadPhone }, tipArgs(g)),
    // 대화가 끝나면 기다리던 추심원이 오늘 이자를 떼어 간다(시계가 다시 돈다)
    onEnd: () => { if (useProto.getState().waiting) { useProto.getState().patch({ waiting: false }); useProto.getState().setTab('lot'); } useGame.getState().setSpeed(1); },
  });
}

/** 설명 장면(guide.ts): 그 화면을 처음 보는 순간에 한 번. 다른 장면이 떠 있으면 기다린다. 줄마다 평생 한 번이라 다음 생·다음 접속에는 안 나온다. */
export function guideCheck(): void {
  const P = useProto.getState();
  const g = useGame.getState().g;
  const run = g.run;
  if (P.prologue || run.over || P.scenes.length > 0 || g.family.generation !== P.gen) return;
  const push = (m: Moment): boolean => { if (!tipsLeft(m)) return false; scene({ id: 'guide_' + m, again: true, lines: tips(m, tipArgs(g)) }); return true; };
  if (P.tab === 'lot' && !P.waiting && run.settleIn > 2) {
    // 집: 쳇바퀴·정산 → (조금 굴린 뒤) 빚 칩·초당·지갑
    if (!P.loanTaken && run.settleNo === 0 && push('home')) return;
    if (!tipsLeft('home') && (run.stats.laborTaps ?? 0) >= HUD_TIP_TAPS && push('hud')) return;
  }
  if (P.tab === 'map' && !P.loanTaken && push('map')) return;
  if (P.tab === 'phone' && P.tutorial === 'done' && Object.keys(run.positions).length > 0) push('position');
}
/** 빚 칩 설명은 쳇바퀴를 이만큼 굴려 본 뒤에 */
export const HUD_TIP_TAPS = 12;

let started = false;
export function startWatch(): void {
  if (started) return;
  started = true;
  useProto.subscribe(() => { flushHeld(); guideCheck(); });
  // 자리를 비운 사이(U-39 ④): 떠날 때의 살림을 적어 두었다가, 돌아와 엔진이 따라잡은 뒤의 살림과 견준다
  let purse: AwayPurse | null = null;
  const purseOf = (g: GameState): AwayPurse => ({ cash: g.run.cash, debt: totalDebt(g.run) });
  document.addEventListener('visibilitychange', () => { if (document.hidden) purse = purseOf(useGame.getState().g); });
  let prevAway = useGame.getState().net.away;
  let prev = useGame.getState().g;
  useProto.getState().patch({ gen: prev.family.generation });
  useGame.subscribe((s) => {
    const g = s.g;
    if (s.net.away !== prevAway) {
      prevAway = s.net.away;
      if (s.net.away && !g.run.over && !useProto.getState().prologue) {
        const names = Object.fromEntries(Object.values(marketById).map((m) => [m.id, m.name]));
        useProto.getState().patch({ away: awayCard(s.net.away, purse ?? purseOf(prev), purseOf(g), { names, openNow: Object.keys(g.run.positions).length, interval: balance.settlement.intervalSec }) });
        play('settle_bell');
      }
      purse = null;
    }
    if (useProto.getState().prologue) { prev = g; return; }
    // 자리를 비운 사이 엔진이 한꺼번에 따라잡았다(시계가 30초 넘게 뛰었다): 그 사이의 정산·청산은 보고서 한 장이 말한다.
    // 하나하나에 컷인·도장·반응을 다시 띄우지 않는다(파산했으면 엔딩 카드가 그대로 뜬다).
    if (g.family.generation === prev.family.generation && g.run.tick - prev.run.tick > 30) {
      purse ??= purseOf(prev);
      prev = g;
      return;
    }
    if (g.family.generation !== useProto.getState().gen) {
      calm.length = 0; held.length = 0;
      useProto.getState().resetLife(g.family.generation, lifeNo(g) <= 1);
      // 거래 화면에서 고른 배율·증거금·손절은 지난 생의 것이다(새 생에는 잠긴 배율이 골라져 있지 않게)
      useUI.getState().setTrade({ market: 'DTC', lev: null, pct: 25, sl: null, tp: null, tpK: null, slK: null, acAuto: false, keep: false });
      if (lifeNo(g) > 1) scene({ id: 'reborn', lines: STORY.reborn(g.run.futures.open), auto: 6000 });
      // 스킬트리 뿌리 '손에 익은 앱': 리본 묶인 폰을 쥔 채 눈을 뜬다 → 거래소 탭이 처음부터 열려 있고, 알바도 부를 수 있다
      if (g.run.futures.open) useProto.getState().patch({ everUnlocked: { ...useProto.getState().everUnlocked, phone: true }, visited: { ...useProto.getState().visited, phone: false } });
      const sl = defaultSl(g);
      if (sl !== null) useUI.getState().setTrade({ sl });
      prev = g;
      return;
    }
    const run = g.run;
    const sameLife = g.family.generation === prev.family.generation;
    const settled = run.settleNo > prev.run.settleNo && !!run.lastSettlement && !run.over && sameLife;

    // ── 알바를 다 들였다 → 중고폰이 울린다(U-43 사용자: "알바 고용하고 거래소 강제로 가게 하는 게 없음") ──
    // 알바를 들여 쳇바퀴마다 알바가 든 순간(주인공이 굴릴 쳇바퀴가 없다) — 빌린 돈으로 쳇바퀴를 더 놓았거나 더 놓을 돈이 없을 때. 엄마의 쳇바퀴 하나에만 알바를 들이고 돈이 남았으면 아직 울리지 않는다(쳇바퀴를 놓을 차례). 튜토리얼 거래를 아직 안 했을 때만.
    {
      const P = useProto.getState();
      const staffedN = (r: typeof run) => (r.coinWheels.DTC?.staffed ? 1 : 0) + r.equipment.filter((u) => u.staffed).length;
      if (sameLife && !run.over && P.tutorial === 'await' && !P.seen.phoneRung && !P.seen.phoneRing && !P.forceTrade && run.futures.open && staffedN(run) > staffedN(prev.run)
        && rollTarget(run) === null && (run.equipment.length > 0 || run.cash < nextTierCost(run, EXTRA_WHEEL))) {
        phoneRing();
      }
    }

    // ── 정산 직전: 추심원이 걷으러 왔는데 낼 돈이 없다(아직 사무소에서 빌린 적 없는 생) ──
    // 시계를 멈추고 기다린다. 사무소에서 빌리면 거기서 이자를 떼고, 돌려보내면 엔진 규칙대로 연체.
    {
      const P = useProto.getState();
      if (!run.over && sameLife && run.settleIn <= 1 && s.speed !== 0 && !P.waiting && !P.loanTaken && P.sentAwayAt !== run.settleNo && officeOffer(g).lend > 0 && wouldBeShort(g)) {
        useGame.getState().setSpeed(0);
        P.patch({ waiting: true });
        play('collector_steps');
        const c = claim(g);
        scene({
          id: `come${run.settleNo}`, unlock: 'map', again: true,
          lines: STORY.collectorCome({ interest: c.interest, cash: Math.floor(run.cash), lend: officeOffer(g).lend, again: P.sentAwayAt >= 0, reborn: lifeNo(g) > 1 }, tipArgs(g)),
          choices: [
            { id: 'go', label: '사무소로 간다', sub: '지도가 열린다', primary: true, run: () => { useProto.getState().patch({ mapFocus: 'shark1' }); useProto.getState().setTab('map'); } },
            { id: 'away', label: '돌려보낸다', sub: '연체로 적힌다', run: sendAway },
          ],
        });
      }
    }

    // ── 정산이 가까운데 낼 돈이 모자라다: 추심원이 미리 말한다(돈이 포지션에 묶여 있으면 그렇다고) ──
    if (!run.over && sameLife && run.settleIn === headsUpSec() && prev.run.settleIn !== run.settleIn && useProto.getState().loanTaken && useProto.getState().tutorial === 'done' && wouldBeShort(g)) {
      const due = claim(g).total;
      const locked = Object.values(run.positions).reduce((a, p) => a + p.margin0, 0);
      play('collector_steps', { vol: 0.5 });
      say(locked > 0
        ? `추심원: 곧 가요오. 낼 돈 ${comma(due)}, 손에 ${comma(Math.floor(run.cash))}이에요오. 나머지는 거래소에 묶여 있네요오.`
        : `추심원: 곧 가요오. 낼 돈 ${comma(due)}인데 손에 ${comma(Math.floor(run.cash))}이에요오.`, 6500);
    }
    // 정산이 끝났다
    if (settled) {
      const r = run.lastSettlement!;
      const od = overdueSum(g) > overdueSum(prev);
      const net = Math.round(r.mined - r.power - (r.wages ?? 0) - r.interest - r.living);
      play('settle_bell');
      useProto.getState().patch({ paidLife: useProto.getState().paidLife + Math.round(r.paid) });
      // 정산의 펀딩비가 증거금에서 빠졌다: 도토리로 건 출구를 같은 돈이 되게 다시 건다(U-41). 구독 안에서 엔진 행동을 겹쳐 부르지 않게 한 박자 뒤에
      if (Object.keys(run.positions).length > 0) window.setTimeout(reapplyAllPlans, 0);
      // 포지션을 든 채 처음 넘긴 정산(U-41): 무슨 일이 있었는지 한 줄(손에서 나간 돈 · 포지션은 그대로 · 펀딩비)
      if (!od && Object.keys(run.positions).length > 0 && Object.keys(prev.run.positions).length > 0 && !useProto.getState().seen.carried && useProto.getState().tutorial === 'done') {
        useProto.getState().patch({ seen: { ...useProto.getState().seen, carried: true } });
        const funding = Math.max(0, ((run.stats.fundingPaid as number | undefined) ?? 0) - ((prev.run.stats.fundingPaid as number | undefined) ?? 0));
        later(5000, () => say(STORY.carried({ paid: r.paid, funding }), 6500));
      }
      if (r.mined > 0) fx.emit({ kind: 'settle', mined: r.mined, sold: ownedCoins(run).some((c) => run.coinWheels[c].autoSell) });
      if (net < 0) useProto.getState().patch({ negSettles: useProto.getState().negSettles + 1 });
      // 일당을 못 받은 알바가 나간다: 이번 생 처음은 족제비가 데리러 온다(장면), 그 뒤로는 한 줄
      if ((r.quit ?? 0) > 0) {
        if (!useProto.getState().seen.quit) sceneCalm({ id: 'quit', lines: STORY.hamstersQuit(r.quit!) });
        else later(1500, () => say(`족제비 상인: 일당이 밀려서 햄스터 ${r.quit}마리, 데려갈게요~`, 5000));
      }
      // 추심원은 오소리 대부의 이자만 걷는다. 다른 곳(캐피탈·뒷골목·조합)의 이자는 자동이체다.
      const badger = interestDue(prev, 'shark1');
      const other = Math.max(0, Math.round(r.interest - badger));
      const P0 = useProto.getState();
      const firstPositive = net > 0 && !P0.seen.posSettle;
      if (firstPositive) P0.patch({ seen: { ...P0.seen, posSettle: true } });
      const fcN = forecast(g);
      const posPnl = Object.values(run.positions).reduce((a, p) => { const v = positionView(g, p.market); return a + (v ? tradeNet(p, v.back) : 0); }, 0);
      const remark = () => settleRemark({ nth: run.settleNo, interest: badger, other, net, cashAfter: run.cash, nextClaim: fcN.interest + fcN.living, nextNet: fcN.net, overdue: od, posOpen: Object.keys(run.positions).length > 0, posPnl, negStreak: net < 0 ? useProto.getState().negRun : 0, firstPositive });
      useProto.getState().patch({ negRun: net < 0 ? useProto.getState().negRun + 1 : 0 });
      if (r.interest > 0 && badger > 0) {
        useProto.getState().patch({ collector: { interest: badger, fill: od ? Math.min(0.85, r.paid / Math.max(1, r.interest)) : 1, overdue: od, at: Date.now() } });
        later(700, () => play('collector_steps'));
        later(2400, () => play(od ? 'overdue_stamp' : 'collector_paid'));
        window.clearTimeout(collTimer);
        collTimer = window.setTimeout(() => useProto.getState().patch({ collector: null }), 9000);
        const P = useProto.getState();
        const no = P.cutCount + 1;
        P.patch({ cutCount: no });
        const meta = { net, interest: badger, win: !od, no };
        const tagged = !!run.coinWheels.DTC?.tagBy;
        // 못 낸 생활비가 어디에 얹혔는가(엔진 settlement.ts): 오소리 장부(캐피탈을 모르는 생) 또는 숲속 캐피탈 대납
        const upk = run.eventLog.filter((e) => e.kind === 'overdue:upkeep' && e.at.tick === run.tick);
        const lv = upk.filter((e) => /오소리/.test(e.text)).reduce((a, e) => a + (e.amount ?? 0), 0);
        const lvCap = upk.filter((e) => /캐피탈/.test(e.text)).reduce((a, e) => a + (e.amount ?? 0), 0);
        if (od && !P.loanTaken) scene({ id: `refused${run.settleNo}`, lines: STORY.refused(badger, tagged, lv), settle: meta });
        // 빌린 뒤의 연체는 번번이 장면이다: 몇 번째인지, 무엇이 붙었는지, 다음에 무엇을 잃는지(U-38)
        else if (od) {
          // 돈이 포지션에 묶여 있었는가
          const locked = Object.values(run.positions).reduce((a, p) => a + p.margin0, 0);
          sceneHeld({ id: `overdue${run.settleNo}`, again: true, lines: STORY.overdue({ interest: badger, nth: (useProto.getState().odSeen += 1), tagged, seized: (run.stats.assetsSeized ?? 0) > (prev.run.stats.assetsSeized ?? 0), nothingLeft: run.equipment.length === 0 && ownedCoins(run).length === 0, living: lv, livingCapital: lvCap, locked }), settle: meta },
            `추심원: 이자 ${comma(badger)}… 연체로 적었어요오. 나머지는 포지션 닫으시면요오.`);
        }
        else if (no === 1) scene({ id: 'firstSettle', lines: lifeNo(g) <= 1 ? STORY.firstSettle(badger, tipArgs(g)) : STORY.rebornSettle(badger), settle: meta });
        else if (no <= FULL_CUTINS && Object.keys(run.positions).length === 0 && P.tab !== 'phone') scene({ id: `settle${run.settleNo}`, lines: STORY.settleWin(badger), settle: meta, auto: 4000 });
        else say(remark(), 4500);
        // 빌린 뒤에도 이자를 못 낸 정산: 사채 문자
        if (od && P.loanTaken) { sceneHeld({ id: 'sms', lines: STORY.sms(officeOffer(g).lend) }); if (!useProto.getState().seen.sms) useProto.getState().patch({ visited: { ...useProto.getState().visited, map: false } }); }
        // 폰을 받은 뒤 첫 정산: 족제비가 알바를 권한다(막지 않는 한 줄)
        if (P.loanTaken && !od) scene({ id: 'hamsterHint', lines: STORY.hamsterHint(hamsterMath(g).wage, tipArgs(g)), auto: 5000 });
      } else say(remark(), 4500);
      // ── FRX 숲거래소 오픈 기념(U-40): 끝나기 세 번 전에 한 줄, 끝난 정산에 문자와 오소리 대부 ──
      if (openingEvent()) {
        const left = feeEventLeft(run), was = feeEventLeft(prev.run);
        if (was > 0 && left === 0) {
          const ev = openingEvent()!;
          const trades = Math.max(0, ((run.stats.trades as number | undefined) ?? 0) - (lifeNo(g) <= 1 ? 1 : 0)); // 첫 생의 튜토리얼 거래는 세지 않는다
          sceneCalm({ id: 'feeEventEnd', lines: STORY.feeEventEnd({ ratePct: +(feeRate(g, 10) * 100).toFixed(3), trades, saved: feeSaved((run.stats.eventNotional as number | undefined) ?? 0, ev.afterFeeRate), lev: Math.max(10, levCapNow(run)) }) });
        } else if (was === 4 && left === 3) later(5200, () => say('[FRX 숲거래소] 오픈 기념 수수료 무료, 정산 3번 남았습니다.', 6000));
      }
      // ── 마을의 다른 돈줄은 사건으로 열린다(U-22 의 원칙을 지도에도, U-38) ──
      {
        const P = useProto.getState();
        // 숲속 캐피탈: 튜토리얼이 끝나고 한 번 더 정산을 치른 뒤 문자가 온다
        if (P.loanTaken && P.tutorial === 'done' && !P.seen.capitalSms && run.settleNo >= 3 && !od) {
          sceneCalm({ id: 'capitalSms', lines: STORY.capitalSms() });
          P.patch({ visited: { ...useProto.getState().visited, map: false } });
        }
        // 뒷골목: 오소리가 더는 안 빌려주는데 연체가 생겼거나, 캐피탈 한도까지 다 썼을 때 모르는 번호로 문자가 온다
        const room = (id: 'shark1' | 'capital') => Math.max(0, lenderLimit(g, id) - run.debts[id].principal);
        if (P.loanTaken && run.shark2Open && !P.seen.viperSms && room('shark1') <= 0 && (overdueSum(g) > 0 || (!!P.seen.capitalSms && room('capital') <= 0))) {
          sceneCalm({ id: 'viperSms', lines: STORY.viperSms() });
          P.patch({ visited: { ...useProto.getState().visited, map: false } });
        }
      }
    }
    // 엔진의 마을 사건(금리 인상·지원금 등)은 속보 한 장으로 알린다. 모르는 사이에 이자가 바뀌지 않게.
    if (sameLife) {
      const had = new Set(prev.run.notices.map((x) => x.id + '@' + x.tick));
      for (const x of run.notices) {
        if (!x.id.startsWith('event:') || had.has(x.id + '@' + x.tick)) continue;
        if (x.id.includes('housing') && run.house <= 0) continue; // 딱지 붙은 빈 오두막에 사는 처지에 집값 소식은 남의 일
        const def = eventById[x.id.replace(/^event:/, '')] as { effect?: { type: string; value: number; settlements: number } } | undefined;
        // 금리 인상은 한 장면으로: 이자가 얼마에서 얼마가 되는지, 몇 번인지(모르는 사이에 돈이 새지 않게, U-38)
        if (def?.effect?.type === 'rateMultiplier') { const from = interestNow(g); sceneCalm({ id: `rate${run.settleNo}`, again: true, lines: STORY.rateHike({ text: x.text, from, to: interestAfterHike(g, def.effect.value), times: def.effect.settlements, fixed: fixedInterestNow(g) }) }); }
        else later(5200, () => say(`[도토리일보 속보] ${x.text}`, 6500));
      }
    }
    // 압류: 실려 가는 것의 이름을 부르는 장면(집에서 그 물건이 사라진다)
    if (sameLife && (run.stats.assetsSeized ?? 0) > (prev.run.stats.assetsSeized ?? 0)) {
      const ev = [...run.eventLog].reverse().find((e) => e.kind.startsWith('seize:'));
      const what = ev?.kind.startsWith('seize:wheel:') ? 'mom' : ev?.kind === 'seize:wallet' ? 'wallet' : 'wheel';
      later(1200, () => play('overdue_stamp'));
      sceneHeld({ id: `seize${run.stats.assetsSeized}`, again: true, lines: STORY.seize({ what, off: Math.abs(ev?.amount ?? 0) }) }, what === 'mom' ? '추심원: …어머님 쳇바퀴, 실어 갈게요오.' : '추심원: 실어 갈게요오. 집에 가 보세요오.');
    }
    // 강제 청산: 흔들림 + 도장
    const lc = run.lastClose;
    const closedNow = !!lc && (!prev.run.lastClose || prev.run.lastClose.tick !== lc.tick || prev.run.lastClose.market !== lc.market);
    if (lc && lc.liq && closedNow) {
      play('liquidation');
      fx.emit({ kind: 'liq', market: marketById[lc.market]?.name ?? lc.market });
    }
    // 포지션이 닫혔다(청산 제외 이익 판정은 noteClose 가 한다)
    if (lc && closedNow && sameLife) {
      const p = prev.run.positions[lc.market];
      if (p && !run.positions[lc.market]) {
        const { exit, pnl, kind: endKind } = closedMath(run, p);
        const tut = useProto.getState().tutorial === 'run';
        // 걸어 둔 출구에 닿아 닫혔는데 거래소를 보고 있지 않았다(U-41): 어디서든 한 줄로 알린다(결과 카드는 거래소 탭에만 뜬다)
        const autoOut = !tut && (endKind === 'tp' || endKind === 'sl') && useProto.getState().tab !== 'phone';
        if (autoOut) { play(pnl > 0 ? 'close_profit' : 'close_loss'); say(`[FRX 숲거래소] ${marketById[lc.market]?.name ?? lc.market} ${p.dir === 1 ? '롱' : '숏'} ${p.lev}배 ${endKind === 'tp' ? '익절' : '손절'} ${pnl >= 0 ? '+' : '−'}${comma(Math.abs(Math.round(pnl)))}`, 5000); }
        // 튜토리얼 거래는 승률·인증서·반응에 넣지 않는다
        if (!tut) {
          const c = claim(prev).total;
          noteClose({ market: lc.market, dir: p.dir, lev: p.lev, roe: lc.liq ? -100 : roePct(p, exit), pnl, margin: p.margin0, claim: c, entry: p.entry, exit, heldSec: lc.tick - p.openTick, gen: lifeNo(g), gold: !!run.skill?.B4 });
          // 세상이 그 거래에 반응한다(react.ts): 크기는 다음 청구액에 견준다
          const P = useProto.getState();
          const tiny = isTiny(pnl, c);
          const st = { winStreak: pnl > 0 && !tiny ? P.winStreak + 1 : 0, lossStreak: pnl < 0 && !tiny ? P.lossStreak + 1 : 0, tinyStreak: tiny ? P.tinyStreak + 1 : 0, feesLife: P.feesLife + p.feesPaid * (lc.liq ? 1 : 2) }; // 들어갈 때 낸 수수료 + 나올 때(같은 크기로 어림)
          // 이번 생에 거래가 벌어 온 돈 · 한 판에 이자 한 번 치를 번 횟수(U-41: 집 판과 장부의 한 줄)
          const bigOne = c > 0 && pnl >= c;
          const claimWins = P.claimWins + (bigOne ? 1 : 0);
          const re = tradeReaction({ pnl, margin: p.margin0, lev: p.lev, liq: !!lc.liq, heldSec: lc.tick - p.openTick, fundedBy: p.fundedBy, allIn: p.marginPct >= 100 },
            { feeFree: p.feesPaid === 0, claim: c, wheelNet: hamsterMath(g).net, cashAfter: run.cash, liqs: (run.stats.liqCount as number | undefined) ?? 0, ...st, seen: P.seen, claimWins });
          P.patch({ ...st, tradeLife: P.tradeLife + pnl, claimWins, seen: re?.once ? { ...P.seen, [re.key]: true } : P.seen,
            // 한 판에 이자 한 번 치: 집이 들썩인다(알바가 뛰고 쳇바퀴에 불이 켜진다)
          });
          if (bigOne) { later(500, () => play('goal_complete')); cheerOn(pnl, pnl / c); }
          // 이자 한 번 치를 연달아 딴 · 잃은 판(U-42): 본전치기는 끊지 않는다. 두 판째에 이번 생 한 번씩 장면
          const bigLoss = c > 0 && pnl <= -c;
          const winRun = bigOne ? P.claimWinRun + 1 : tiny ? P.claimWinRun : 0, lossRun = bigLoss ? P.claimLossRun + 1 : tiny ? P.claimLossRun : 0;
          const runSum = (bigOne && winRun > 1) || (bigLoss && lossRun > 1) ? P.claimRunSum + pnl : bigOne || bigLoss ? pnl : tiny ? P.claimRunSum : 0;
          useProto.getState().patch({ claimWinRun: winRun, claimLossRun: lossRun, claimRunSum: runSum });
          const wn = hamsterMath(g).net;
          const debt = run.debts.shark1.principal;
          // [갚으러 간다]가 사는 것(U-42 ⑤): 다음 정산에 낼 돈은 남기고 갚으면 이자가 얼마 줄고 금박 도장이 어디까지 차는가. 두 단추 가운데 어느 쪽도 밀지 않는다
          const fcW = forecast(g);
          const buys = repayBuys(g, fcW.interest + fcW.living + fcW.wages);
          const repayChoices = (keepSub: string) => (debt > 0 ? [
            { id: 'repay', label: '갚으러 간다', sub: buys ? buys.text : '지도 → 오소리 사무소', run: () => { cheerOn(pnl, pnl / c); useProto.getState().patch({ mapFocus: 'shark1' }); useProto.getState().setTab('map'); } },
            { id: 'keep', label: '쥐고 있는다', sub: keepSub, run: () => { cheerOn(pnl, pnl / c); } },
          ] : undefined);
          if (re?.key === 'winClaim1') {
            // 이번 생 처음: 장면 + 고르기(갚으러 간다 / 쥐고 있는다). 숫자는 그 거래와 지금 장부의 것. 떠 있는 동안 시계가 멈춘다(정산도 잔치도 기다린다)
            const toNext = debt > 0 ? Math.min(debt, STAMP_STEP - (((run.stats['repaid.shark1'] as number | undefined) ?? 0) % STAMP_STEP)) : null;
            scene({ id: 'react_winClaim1', again: true, hold: true, lines: STORY.winClaim({ boss: re.lines[0], pnl, claim: c, spins: wn > 0 ? Math.round(pnl / wn) : null, stampLeft: toNext, momLeft: debt }),
              choices: repayChoices(`다음 판 밑천 ${comma(Math.floor(run.cash))}`) });
          }
          else if (bigOne && winRun === 2 && !P.seen.react_winRun) {
            scene({ id: 'react_winRun', hold: true, lines: STORY.winRun({ sum: runSum, stampPct: debt > 0 ? Math.round((runSum / STAMP_STEP) * 100) : null }),
              choices: repayChoices(`세 번째 판 밑천 ${comma(Math.floor(run.cash))}`) });
          }
          else if (bigLoss && lossRun === 2 && !P.seen.react_lossRun) {
            if (re?.scene) scene({ id: 'react_' + re.key, again: true, lines: re.lines.map((text) => ({ who: re.who, text })) });
            scene({ id: 'react_lossRun', hold: true, lines: STORY.lossRun({ sum: Math.abs(runSum), spins: wn > 0 ? Math.round(Math.abs(runSum) / wn) : null, cash: Math.floor(run.cash), claim: claim(g).total }),
              choices: [
                { id: 'home', label: '쳇바퀴로 간다', sub: '집으로', run: () => { useProto.getState().setTab('lot'); } },
                { id: 'stay', label: '폰을 계속 본다', sub: `손에 ${comma(Math.floor(run.cash))}`, run: () => { /* 그대로 */ } },
              ] });
          }
          else if (re?.scene) scene({ id: 'react_' + re.key, again: true, lines: re.lines.map((text) => ({ who: re.who, text })) });
          else if (re) later(lc.liq ? 2200 : autoOut ? 3200 : 900, () => say(`${WHO_NAME[re.who].replace(' (속마음)', '')}: ${re.lines[0]}`, 4500));
        }
      }
    }
    // 마진콜 전화(스킬트리 B2): 청산이 코앞일 때 한 번, 오소리 대부가 전화한다. 받는 동안 시계가 멈춘다.
    if (sameLife && !run.over && run.marginCall && !prev.run.marginCall) {
      const mk = run.marginCall.market;
      const p = run.positions[mk];
      if (p) {
        const put = Math.min(Math.floor(run.cash), Math.round(p.margin0 * 0.5));
        const lend = officeOffer(g).lend;
        const done = () => { useGame.getState().act({ type: 'marginCallDone' }); };
        const add = (amt: number) => { const r = useGame.getState().act({ type: 'addMargin', market: mk, amount: amt }); play(r.ok ? 'buy' : 'insufficient'); say(r.ok ? `증거금 +${comma(amt)}. 청산가가 멀어졌다.` : r.msg ?? '넣지 못했다', 4000); done(); };
        scene({
          id: `call${run.marginCall.tick}`, again: true, hold: true, lines: STORY.marginCall({ name: marketById[mk]?.name ?? mk, dir: p.dir, lev: p.lev, broke: put < 1000 && lend <= 0 }),
          choices: [
            ...(put >= 1000 ? [{ id: 'put', label: '넣는다', sub: `증거금 +${comma(put)}`, primary: true, run: () => add(put) }] : []),
            ...(lend > 0 ? [{ id: 'loan', label: '빌려서 넣는다', sub: `+${comma(lend)}, 금리 ${+(Math.max(lenderById.shark1.rate, nextBorrowRate(g, 'shark1') - callLoanCut(run)) * 100).toFixed(1)}%`, run: () => { const b = useGame.getState().act({ type: 'borrow', lender: 'shark1', call: true }); if (b.ok) add(b.amount ?? lend); else done(); } }] : []),
            { id: 'hang', label: '끊는다', sub: '그대로 둔다', run: done },
          ],
        });
      }
    }
    // 배율이 열렸다 · 확인서에 도장을 찍었다
    if (sameLife && !run.over) {
      if (levCapNow(run) >= 50 && levCapNow(prev.run) < 50 && prev.run.futures.open) later(600, () => say('오소리 대부: 손에 익으셨네요. 50배까지 열어 드렸습니다.', 4500));
      if (run.futures.waiver && !prev.run.futures.waiver) scene({ id: 'waiver', lines: STORY.waiver() });
    }
    // ── 이야기 사건 ──
    if (!run.over && sameLife) {
      // 오소리 장부: 처음 갚은 날, 그리고 줄이 지워질 때마다(ledger.ts)
      if (run.debts.shark1.principal < prev.run.debts.shark1.principal && (run.stats.stamps ?? 0) > (prev.run.stats.stamps ?? 0)) {
        const beat = ledgerBeat(prev, g);
        // 첫 상환 장면의 빈 못이 이번 방문의 단서다: 엄마 이야기의 다른 단서는 다음 방문으로 미룬다(한 번 들를 때 하나, U-44)
        if (!(prev.run.stats.stamps > 0) && beat !== 'momCleared') { scene({ id: 'repay', lines: STORY.repay() }); useProto.getState().patch({ clueAt: run.settleNo }); }
        if (beat === 'firstCleared') useProto.getState().patch({ clueAt: run.settleNo });
        // 5만을 갚을 때마다 장부에 금박 도장이 하나 찍힌다(환생 때 황금 실물 도토코인이 된다 — 그 생에 갚은 만큼은 남는다)
        const gs = goldStamps(g);
        if (gs > goldStamps(prev)) { play('goal_complete'); later(400, () => say(`장부에 ${gs}번째 금박 도장이 찍혔다.`, 4500)); }
        if (beat) scene({ id: 'ledger_' + beat, lines: STORY.ledger(beat, { cut: (() => { const r = ledgerRows(prev).find((x) => x.key === 'repeat'); return r ? Math.round((r.start * r.ratePct) / 100) : 0; })(), otherDebt: lenderDebtTotal(run), frame: !!useProto.getState().seen.momClue_frame }) });
      }
      // 모든 빚 0: 이 생을 닫을지 고른다(U-39 ⑧). 은퇴 = 엔딩 카드(도감에 남는다) → 환생, 계속 = 2막의 문턱 장면 하나 뒤에 그대로 이어 간다
      // 엄마 이야기의 단서(U-39 ⑫): 사무소에서 갚거나 빌린 바로 그때, 한 번에 하나만(같은 정산 사이에 두 번 들러도 하나)
      {
        const paid = run.debts.shark1.principal < prev.run.debts.shark1.principal && (run.stats.stamps ?? 0) > (prev.run.stats.stamps ?? 0);
        const reborrowed = ((run.stats['borrow.shark1'] as number | undefined) ?? 0) > ((prev.run.stats['borrow.shark1'] as number | undefined) ?? 0) && repaidOffice(prev) > 0;
        if (paid || reborrowed) {
          const P1 = useProto.getState();
          const k = momClueDue(g, { reason: !!P1.seen.momClue_reason, mirror: !!P1.seen.momClue_mirror, frame: !!P1.seen.momClue_frame }, { reborrowed, shownThisVisit: P1.clueAt === run.settleNo });
          if (k) { P1.patch({ clueAt: run.settleNo }); scene({ id: 'momClue_' + k, lines: STORY.momClue(k) }); }
        }
      }
      if (lenderDebtTotal(run) === 0 && lenderDebtTotal(prev.run) > 0) scene({ id: 'clear', lines: STORY.clear(), hold: true, choices: [
        { id: 'retire', label: '은퇴한다', sub: `이 생을 닫는다, 황금 +${treeAward(run)}`, run: retireNow },
        { id: 'continue', label: '계속한다', sub: '빚 없이 더 산다', primary: true, run: () => { useProto.getState().patch({ seen: { ...useProto.getState().seen, continued: true } }); scene({ id: 'act2Hook', lines: STORY.act2Hook() }); } },
      ] });
    }
    // 오픈 기념 문자: 진짜 시세로 거래소를 처음 보는 때(생마다 한 번 — 새 생은 새 계좌다)
    if (sameLife && !run.over && openingEvent() && feeEventLeft(run) > 0 && run.futures.open && useProto.getState().tutorial === 'done' && useProto.getState().tab === 'phone' && !useProto.getState().seen.feeEventSms && !useProto.getState().away && !s.net.away && Object.keys(run.positions).length === 0)
      sceneCalm({ id: 'feeEventSms', lines: STORY.feeEventSms({ left: feeEventLeft(run), reborn: lifeNo(g) > 1 }) });
    // 빚 없는 생을 이어 가는 동안: 모은 돈이 고비를 넘을 때마다 누군가 한마디 한다(U-40)
    if (sameLife && !run.over && useProto.getState().seen.continued && lenderDebtTotal(run) === 0) {
      const k = savingsStep(useProto.getState().seen);
      if (k < SAVINGS_STEPS.length && run.cash >= SAVINGS_STEPS[k]) { play('goal_complete'); sceneCalm({ id: 'savings' + k, lines: STORY.savings(k) }); }
    }
    const P = useProto.getState();
    const everOpened = P.everOpened || Object.keys(run.positions).length > 0;
    if (everOpened !== P.everOpened) P.patch({ everOpened });
    const gi = currentGoal(g, useProto.getState().goalIdx, { everOpened, waiting: useProto.getState().waiting, loanTaken: useProto.getState().loanTaken });
    if (gi !== useProto.getState().goalIdx) { if (gi > useProto.getState().goalIdx) play('goal_complete'); useProto.getState().patch({ goalIdx: gi }); }
    if (sameLife && g.run.tick !== prev.run.tick) { holdTick(g); marketTick(g); }
    flushHeld(); // 급한 것(연체·압류)이 먼저
    flushCalm();
    guideCheck();
    prev = g;
  });
}
