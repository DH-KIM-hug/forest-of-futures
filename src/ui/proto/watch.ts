// 게임 상태 변화를 보고 시제품 화면 사건(추심원·정산 컷인·탭 해금·목표)을 만든다. 규칙은 엔진의 것만 쓴다.
import { rankCleared } from './rankUnlock';
import { resumeHint, useGame } from '../../store/gameStore';
import { settleSec } from '../../engine/pace';
import { useProto, type Scene } from './protoStore';
import { currentGoal, lifeNo, officeOffer, claim, hamsterMath, tipArgs, interestNow, interestAfterHike, fixedInterestNow, staffedCount } from './model';
import { holdBeat, tensionOf, burstTier } from './tension';
import { awayCard, type AwayPurse } from './away';
import type { AwayReport } from '../../engine/types';
import { historyOf, liveHistoryOf } from '../priceHistory';
import { canRoll, holdKey, rolledFor } from './roll';
import { rollTarget } from '../../engine/mining';
import { nextTierCost } from '../../engine/equipment';
import { EXTRA_WHEEL } from './model';
import { positionView } from '../vm/trade';
import { balance } from '../../engine/data';
import { tips, tipsLeft, type Moment } from './guide';
import { STORY, WHO_NAME } from './text';
import { comma, josa } from '../../engine/util';
import { DEBT_IDS, eventById, lenderById, marketById } from '../../engine/data';
import { levCapNow, tradeGate } from '../../engine/progression';
import { forecast } from '../../engine/settlement';
import { tradeReaction, settleRemark, remarkIsRoutine, ROUTINE_GAP_MS, isTiny, worthCertificate } from './react';
/** 되풀이 정산 한 줄을 마지막으로 말한 때(U-53) */
let routineAt = 0;
import { dayBars, dayNote, noteToast } from './daynote';
import { STAMP_STEP } from './ledger';
import { reapplyAllPlans } from './exitPlan';
import { ledgerBeat, goldStamps, ledgerRows, momClueDue, repaidOffice, repayBuys } from './ledger';
import { lenderLimit, lenderRate, nextBorrowRate } from '../../engine/selectors';
import { temptOnRefer } from './lite/liteBeats';
import { doorKnock, doorLine, owedLenders } from './lite/Collectors';
import { useUI } from '../uiStore';
import { callLoanCut, defaultSl, treeAward } from '../../engine/skilltree';
import { ownedCoins, lenderDebtTotal, interestDue, totalDebt } from '../../engine/selectors';
import { settle } from '../../engine/settlement';
import { clone } from '../../engine/game';
import { fx } from './fx';
import { isLite } from './config';
import { retireSubLite } from './lite/fruitText';
import { pushPop, treePing } from './popBus';
import { forestClose, forestTick, forestNewLife } from './forestWatch';
import { play, later } from './audio';
import { closeBack, exitFee, roePct } from '../../engine/futures';
import { exitFeeMul, feeEventLeft, openingEvent, feeRate } from '../../engine/skilltree';
import { recentRange } from './tension';
import { allQuiet, liveliest, sessionOpen, sessionHoursKst, SESSIONS, feeSaved, LIVELY_PCT, QUIET_PCT, openHeadsUp, spanText, untilHourMin } from './market';
import type { GameState, Position } from '../../engine/types';
import { featureOpen, liteTrades, liteTradeClosed } from './lite/liteUnlock';

/** 포지션이 닫힌 것을 보고 이번 생 승률을 올리고, 이익이면 수익 인증서 물음을 띄운다(한 번 닫을 때 한 번). */
export function noteClose(c: { market: string; dir: 1 | -1; lev: number; roe: number; pnl: number; margin: number; claim: number; entry: number; exit: number; heldSec: number; gen: number; gold?: boolean; /** 이번 생 가장 크게 딴 판 */ record?: boolean }): void {
  const P = useProto.getState();
  const win = c.pnl > 0;
  const wins = P.wins + (win ? 1 : 0);
  const closes = P.closes + 1;
  // 인증서 물음은 볼 만한 이익에만(잔돈 이익마다 뜨지 않는다, U-38)
  // 라이트(LITE_CONTI 컷 C5): 인증서 물음은 대박 이상과 이번 생 신기록에만
  const card = win && (isLite ? (burstTier(c.pnl, c.margin, c.claim)?.lv ?? 0) >= 4 || !!c.record : worthCertificate(c.pnl, c.margin, c.claim));
  // 라이트 첫 경험(U-68): 이 기기에서 닫은 판을 센다(길잡이 판은 빼고). 판 수에 따라 종목, 도토리일보, 의뢰가 열린다
  if (isLite) liteTradeClosed({ tutorial: P.flyTut === 'run' });
  P.patch({ wins, closes, profit: card ? { coin: marketById[c.market]?.name ?? c.market, dir: c.dir, lev: c.lev, roe: c.roe, pnl: c.pnl, entry: c.entry, exit: c.exit, heldSec: c.heldSec, wins, closes, gen: c.gen, date: new Date(), gold: c.gold, market: c.market, margin: c.margin, tier: burstTier(c.pnl, c.margin, c.claim)?.word } : null }); // 뒤에 닫힌 판이 있으면 앞 판의 인증서 물음은 지나간 일이다(U-46: 청산 · 연체 장면 사이에 옛 +117,651 이 다시 뜨던 것)
}

const overdueSum = (g: GameState): number => DEBT_IDS.reduce((a, id) => a + g.run.debts[id].overdue, 0);
const FULL_CUTINS = 5;
let toastTimer: number | undefined;
let cheerTimer: number | undefined;
/** 크게 딴 뒤 집이 들썩이는 시간(ms) */
export const CHEER_MS = 45_000;
/** 크게 닫힌 판(청산, 넣은 돈의 15% 넘게 딴 판, 이번 수금보다 많이 딴 판) 뒤 장면을 미루는 시간(ms, U-48) */
export const BEAT_MS = 2600;
let collTimer: number | undefined;
/** 이긴 판의 소리(U-49 새 소리): 등급이 오를수록 겹이 는다. 짭짤하다 = 도토리 쏟아지는 소리, 한 방 = + 팡파르, 두 배 = 팡파르가 먼저, 대박 · 전설 = 잭팟 */
export function winSound(lv: number): void {
  if (lv >= 4) { play('win_jackpot'); later(150, () => play('win_coins')); return; }
  if (lv >= 3) { play('win_fanfare'); later(200, () => play('win_coins')); return; }
  play('win_coins');
  if (lv >= 2) later(260, () => play('win_fanfare'));
}
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
  return `[도토리일보] 어제 ${top.loudHour}시 무렵 ${josa(top.name, '이', '가')} 제일 크게 뛰었다. ${left === 0 ? '바로 지금 그 시각.' : `${spanText(left)} 뒤가 그 시각.`}`;
}
const openSaid = new Set<string>();
/** 따라가는 손절(U-50): 포지션마다 마지막으로 팝을 띄운 손절(ROE %) */
const trailShown: Record<string, number> = {};

// ── 알림 줄 세우기(U-52): 새 알림이 앞 알림을 덮어 지우지 않는다. 장면(컷인)이 떠 있는 동안에는 기다렸다가 장면이 걷히면 남은 시간만큼 ──
// 회차 10 에서 본 것: 승급 알림이 0.2초 뒤 반응 한 줄에 덮이고, 2.6초 뒤 추심원 장면 밑에 깔렸다.
interface Toast { text: string; ms: number; keep: boolean; shown: number }
const toastQ: Toast[] = [];
let toastCur: Toast | null = null;
let toastLast = 0;
/** 뒤에 기다리는 알림이 있으면 보통 알림은 이만큼 보인 뒤 다음으로 넘어간다 */
export const TOAST_MIN_MS = 2200;
/** 꼭 읽혀야 하는 알림(keep)은 적어도 이만큼 */
export const TOAST_KEEP_MS = 4000;
/** 이긴 판의 상자가 떠 있는 시간(ms, trade.css .pr-burst 의 --out + 0.35초) */
export const burstMs = (lv: number): number => (lv >= 3 ? 3000 : lv >= 2 ? 2500 : 1800) + 200;
/** 장면이 걷히기를 기다리는 이긴 판(가장 최근 하나) */
let burstWait: (() => void) | null = null;
const covered = (): boolean => { const P = useProto.getState(); return P.scenes.length > 0 && Date.now() >= P.beatUntil; };
function toastShow(t: Toast | null): void {
  const P = useProto.getState();
  if (!t) { if (P.toast !== null) P.patch({ toast: null, toastKeep: false }); return; }
  P.patch({ toast: t.text, toastK: P.toastK + 1, toastKeep: t.keep });
}
function toastPump(): void {
  const now = Date.now();
  const dt = Math.min(1000, now - toastLast);
  toastLast = now;
  if (!toastCur) {
    toastCur = toastQ.shift() ?? null;
    if (!toastCur) { window.clearInterval(toastTimer); toastTimer = undefined; return; }
    if (!covered()) toastShow(toastCur);
    return;
  }
  if (covered()) { if (useProto.getState().toast !== null) toastShow(null); return; }
  if (useProto.getState().toast !== toastCur.text) toastShow(toastCur); // 장면이 걷혔다: 다시
  toastCur.shown += dt;
  const need = toastCur.keep ? Math.max(TOAST_KEEP_MS, toastCur.ms) : toastQ.length ? Math.min(toastCur.ms, TOAST_MIN_MS) : toastCur.ms;
  if (toastCur.shown >= need) { toastCur = null; toastShow(null); toastPump(); }
}
/** 한 줄 알림. keep = 승급처럼 꼭 읽혀야 하는 것(뒤 알림에 밀려 짧아지지 않고, 줄이 넘쳐도 버려지지 않는다) */
export function say(text: string, ms = 3000, keep = false): void {
  if (toastCur?.text === text || toastQ.some((x) => x.text === text)) return;
  toastQ.push({ text, ms, keep, shown: 0 });
  // 줄이 길면 오래된 보통 알림부터 버린다
  while (toastQ.length > 3) { const i = toastQ.findIndex((x) => !x.keep); if (i < 0) break; toastQ.splice(i, 1); }
  if (toastTimer === undefined) { toastLast = Date.now(); toastTimer = window.setInterval(toastPump, 150); }
  toastPump();
}

/** 이야기 장면을 줄 세운다(이번 생에 이미 본 것은 다시 나오지 않는다). */
function scene(sc: Scene): void { useProto.getState().pushScene(sc); }

/** 폰에 뜬 영수증과 한 정산의 셈(개정 대본 장면 13): 이번 생에 낸 이자와 생활비, 갚은 원금, 바퀴가 온전히 한 정산 돌았을 때의 예상(엔진 forecast) */
function ringMath(g: GameState): { paid: number; repaid: number; income: number; wages: number; claim: number; net: number; left: number } {
  const f = forecast(g);
  return { paid: useProto.getState().paidLife, repaid: repaidOffice(g), income: Math.round(f.mined), wages: Math.round(f.wages), claim: Math.round(f.interest + f.living), net: Math.round(f.net), left: Math.round(g.run.debts.shark1.principal) };
}
/** 중고폰이 울린다: 오소리 대부가 폰의 FRX 앱을 켜 보라고 한다(U-43). 끝나면 튜토리얼 거래를 걸 때까지 거래소 탭(앱)만 열 수 있고 정산 시계가 멈춘다(그동안 나쁜 일이 없다). */
export function phoneRing(): void {
  const P = useProto.getState();
  P.patch({ seen: { ...P.seen, phoneRung: true } }); // 장면 이름(phoneRing)과 다른 열쇠: 장면은 본 뒤에 seen[phoneRing] 이 적힌다
  play('phone_open');
  scene({
    id: 'phoneRing', hold: true, lines: STORY.phoneRing(ringMath(useGame.getState().g)),
    onEnd: () => { useProto.getState().patch({ forceTrade: true, pointTab: 'phone' }); useGame.getState().setSpeed(0); },
  });
}

/** 청산 도장이 떠 있는 시간(ProtoApp LiqStamp 1.8초). 그동안 승급 카드와 승급 알림은 기다린다 */
export const LIQ_QUIET_MS = 1900;
let liqAt = 0;
/** 청산 도장이 걷히기까지 남은 ms(없으면 0) */
export const liqQuietLeft = (): number => Math.max(0, liqAt + LIQ_QUIET_MS - Date.now());

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
// 회차 14: 쳇바퀴를 다 빼앗겨 거래 화면이 잠기면 가릴 [정리하기]도 없다 — 그때는 기다리지 않는다
const busyTrading = (): boolean => { const g = useGame.getState().g; return Object.keys(g.run.positions).length > 0 && useProto.getState().tab === 'phone' && !g.run.over && tradeGate(g).mode !== 'locked'; };
/** urgent = 압류, 또는 한 번 더 밀리면 파산하는 연체(회차 14: 판을 쥔 채 거래소에 있으면 장면 하나 없이 엔딩으로 갔다). 이런 장면은 기다리지 않는다 */
function sceneHeld(sc: Scene, toast?: string, urgent = false): void {
  if (urgent || !busyTrading()) { scene(sc); return; }
  if (!held.some((x) => x.id === sc.id)) held.push(sc);
  if (toast) say(toast, 6000);
}
function flushHeld(): void {
  if (!held.length || busyTrading()) return;
  // 생이 끝났으면 밀린 연체 문자는 띄우지 않는다: 엔딩이 말한다(회차 15: 닫는 순간 압류, 연체, 파산이 한 묶음으로 이어졌다)
  if (useGame.getState().g.run.over) { held.length = 0; calm.length = 0; return; }
  for (const sc of collapseHeld(held.splice(0))) scene(sc);
}
/** 들고 있는 동안 밀린 장면을 한 번에 풀 때(회차 15 평가): 연체 장면은 가장 마지막 것 하나만(앞의 것은 그 뒤로 묵은 말), 연체 장면이 있으면 사채 문자는 뺀다(같은 말),
 *  압류는 연체보다 먼저(무엇을 잃었는지가 먼저 보이게). 순서는 압류 → 연체 → 그 밖 */
export function collapseHeld(xs: Scene[]): Scene[] {
  const od = xs.filter((x) => x.id.startsWith('overdue'));
  const lastOd = od[od.length - 1];
  const rank = (x: Scene) => (x.id.startsWith('seize') ? 0 : x.id.startsWith('overdue') ? 1 : 2);
  return xs.filter((x) => (!x.id.startsWith('overdue') || x === lastOd) && !(x.id === 'sms' && lastOd)).map((x, i) => ({ x, i })).sort((a, b) => rank(a.x) - rank(b.x) || a.i - b.i).map((o) => o.x);
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
export const headsUpSec = (run: GameState['run']): number => Math.min(30, Math.floor(settleSec(run) * 0.4));
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
      useProto.getState().patch({ think: { text: p.dir === 1 ? '종은 두 번 쳤는데 저 선은 한참 위네.' : '종은 두 번 쳤는데 저 선은 한참 아래네.', k: run.tick } });
      window.clearTimeout(thinkTimer);
      thinkTimer = window.setTimeout(() => useProto.getState().patch({ think: null }), 6500);
      return;
    }
    const thinkNow = (text: string) => {
      h.lastAt = run.tick;
      useProto.getState().patch({ think: { text, k: run.tick, m: Object.keys(run.positions).length > 1 ? p.market : undefined } });
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
          if (cur > hi && !h.seen.hi10) { h.seen.hi10 = true; thinkNow(`${mins}분 동안 제일 높다. ${p.dir === 1 ? '조금만 더.' : '거기서 더 가면 안 되는데.'}`); return; }
          if (cur < lo && !h.seen.lo10) { h.seen.lo10 = true; thinkNow(`${mins}분 동안 제일 낮다. ${p.dir === -1 ? '조금만 더.' : '거기서 더 가면 안 되는데.'}`); return; }
        }
      }
    }
    // 손이 심심하다(U-42): 45초를 들고 있었는데 숫자가 거의 안 움직였고 쳇바퀴도 안 굴렸다 — 이번 생에 한 번, 할 일을 떠올린다(정산 낼 돈은 쳇바퀴에서 나온다)
    if (!P.seen.idleHands && canRoll() && run.tick - p.openTick >= 45 && Math.abs(roe) < 12 && rolledFor(holdKey()) < 1 && !run.over) {
      P.patch({ seen: { ...useProto.getState().seen, idleHands: true } });
      thinkNow('한 손으로 바퀴나 좀 돌릴까.');
      return;
    }
    const squeezed = run.settleIn <= 60 && run.settleIn > 2 && (short ??= wouldBeShort(g));
    // 같은 줄이 판마다 되풀이되지 않게 포지션 순번으로 번갈아 쓴다. 포지션이 둘 이상이면 어느 종목 얘기인지 앞에 붙인다(U-40)
    const b = holdBeat({ pnl, roe, heldSec: run.tick - p.openTick, claim: c, reach: tensionOf(v.liqDistPct, liveHistoryOf(p.market)).reach, peakPnl: h.peakPnl, lowRoe: h.lowRoe, settles: run.settleNo - h.settle0, squeezed, feesPaid: p.feesPaid, rolled: rolledFor(holdKey()) }, h.seen, (run.stats.tradesOpened as number | undefined) ?? 0);
    if (!b) continue;
    h.seen[b.key] = true;
    h.lastAt = run.tick;
    const many = Object.keys(run.positions).length > 1;
    useProto.getState().patch({ think: { text: b.text, k: run.tick, m: many ? p.market : undefined } });
    window.clearTimeout(thinkTimer);
    thinkTimer = window.setTimeout(() => useProto.getState().patch({ think: null }), 6500);
    return; // 한 틱에 한 마디
  }
}

// ── 장이 조용한가 · 본장이 열리고 닫히는가(U-40): 있는 그대로를 말한다. 가짜 출렁임은 없다 ─────────────
const mk = { quietFor: 0, lastLineAt: -9999, wasQuiet: false, n: 0, sess: {} as Record<string, boolean>, flyAt: -9999 };
/** 날다람쥐코인이 1분 새 이만큼(%) 출렁이면 신문 속보 한 줄(U-48). 평소 1분 폭은 0.6%쯤, 하루에 스무 번 남짓 넘는다 */
export const FLY_NEWS_PCT = 3;
/** 속보 사이 최소 간격(틱 = 초) */
export const FLY_NEWS_GAP = 300;
let flyPointT: number | undefined;
const QUIET_HERO = ['어느 줄을 봐도 비슷하네.', '숲이 너무 조용하다.'];
function marketTick(g: GameState): void {
  const P = useProto.getState();
  const run = g.run;
  if (P.tutorial !== 'done' || run.over || !run.futures.open) return;
  // 본장 개장 · 마감(삼솔전자 · 잣스닥): 거래소를 보고 있을 때만 한 줄
  if (run.tick % 5 === 0) {
    const now = new Date();
    for (const id of Object.keys(SESSIONS)) {
      const open = !!sessionOpen(id, now);
      if (mk.sess[id] !== undefined && mk.sess[id] !== open && P.tab === 'phone') say(open ? `[FRX 숲거래소] ${marketById[id]?.name ?? id} 본장 개장, ${sessionHoursKst(id, now)}` : `[FRX 숲거래소] ${marketById[id]?.name ?? id} 본장 마감`, 6000);
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
      say(`[도토리일보] ${marketById[id]?.name ?? id} 본장 개장까지 ${hu.min}분 (${(sessionHoursKst(id, now) ?? '').split('~')[0]})`, 7000);
      break;
    }
  }
  // 날다람쥐코인 급등락 속보(U-48): 값이 정말로 1분 새 크게 출렁였을 때만(시세에서 센 것). 거래소 밖이면 거래소 탭을 잠깐 가리킨다
  if (P.scenes.length === 0 && run.tick - mk.flyAt >= FLY_NEWS_GAP && marketById.FLY?.tradable) {
    const fh = liveHistoryOf('FLY');
    const r = recentRange(fh);
    if (r !== null && r >= FLY_NEWS_PCT) {
      mk.flyAt = run.tick;
      const w = fh.slice(-60);
      const up = w[w.length - 1] >= w[0];
      play('news_alarm');
      say(`[도토리일보 속보] ${marketById.FLY.name}, 크게 출렁인다! 지금은 ${up ? '▲오르는' : '▼내리는'} 쪽`, 6500);
      if (P.tab !== 'phone') { useProto.getState().patch({ pointTab: 'phone' }); window.clearTimeout(flyPointT); flyPointT = window.setTimeout(() => { if (!useProto.getState().forceTrade && useProto.getState().pointTab === 'phone') useProto.getState().patch({ pointTab: null }); }, 4500); }
      return;
    }
  }
  // 도토리일보 시세면(U-41): 이번 생에 거래소를 처음 펴 보고 조금 지난 뒤, 지난 몇 시간의 머리기사를 한 줄로(기록이 30분은 있어야 싣는다)
  // 라이트(U-68): 도토리일보가 열린 뒤에만(첫 판을 닫은 뒤)
  if ((!isLite || featureOpen('news', liteTrades())) && P.tab === 'phone' && P.scenes.length === 0 && !P.seen.dayNoteHint && P.seen.feeEventSms && !P.toast && Object.keys(run.positions).length === 0) {
    const ms = Object.values(marketById).filter((m) => m.tradable).map((m) => ({ id: m.id, name: m.name }));
    const note = dayNote(ms, Object.fromEntries(ms.map((m) => [m.id, dayBars(m.id)])), Date.now());
    if (note.spanMin >= 30) { P.patch({ seen: { ...useProto.getState().seen, dayNoteHint: true } }); say(noteToast(note), 8000); return; }
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
    if (!P.seen.quietBoss) { P.patch({ seen: { ...useProto.getState().seen, quietBoss: true } }); later(7000, () => say('오소리 대부: 조용한 날엔 다들 졸아요. 그러다 한 번에 터지죠.', 5500)); }
    // 두 번째로 조용한 때부터(U-42): 신문이 "지난 하루에 언제가 시끄러웠는지"를 한 줄로 — 기다릴지 말지는 내가 정한다
    else if (!P.seen.loudNote) { const ln = loudNoteLine(); if (ln) { P.patch({ seen: { ...useProto.getState().seen, loudNote: true } }); later(7000, () => say(ln, 8000)); } }
    return;
  }
  // 조용하던 장에서 한 종목이 깨어났다
  const top = liveliest(ranges);
  if (mk.wasQuiet && top && top.r >= LIVELY_PCT) {
    mk.wasQuiet = false;
    useProto.getState().patch({ think: { text: `${marketById[top.id]?.name ?? top.id} 봐. 방금 확 움직였어!`, k: run.tick } });
    window.clearTimeout(thinkTimer);
    thinkTimer = window.setTimeout(() => useProto.getState().patch({ think: null }), 6500);
  }
}

/** 빚 없는 생을 이어 가는 동안([계속한다], U-40)의 모은 돈 고비 */
export const SAVINGS_STEPS = [100_000, 300_000, 1_000_000];
/** 다음 고비의 번호(다 넘었으면 SAVINGS_STEPS.length). seen = 이번 생에 본 장면 */
export const savingsStep = (seen: Record<string, boolean>): number => { let k = 0; while (k < SAVINGS_STEPS.length && seen['savings' + k]) k++; return k; };

/** 지금 이대로 정산하면 못 내는 돈이 생기는가: 엔진의 정산을 복사본에 돌려 본다(추측하지 않는다). */
/** 지금 정산이 온다면 못 내는 돈(0 = 다 낸다) */
export function shortAtSettle(g: GameState): number {
  const p = clone(g);
  settle(p);
  return Math.round(p.run.lastSettlement?.unpaid ?? 0);
}
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
  say('추심원: 그럼 오늘은 못 받은 걸로 쓸게요.', 3500);
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
  // 라이트: 추심원이 오기 전의 지도에서는 사무소 설명을 미룬다(추심원이 먼저 문을 두드린다)
  if (P.tab === 'map' && !P.loanTaken && (!isLite || P.waiting) && push('map')) return;
  // 첫 실전 판(U-55)은 조명 없이 지켜본다: 설명은 실전 판이 하나 닫힌 뒤의 포지션에서
  if (P.tab === 'phone' && P.tutorial === 'done' && P.closes > 0 && Object.keys(run.positions).length > 0) push('position');
}
/** 빚 칩 설명은 쳇바퀴를 이만큼 굴려 본 뒤에 */
export const HUD_TIP_TAPS = 12;

let started = false;
export function startWatch(): void {
  if (started) return;
  started = true;
  useProto.subscribe(() => { flushHeld(); guideCheck(); if (burstWait && !covered()) { const f = burstWait; burstWait = null; f(); } });
  // 자리를 비운 사이(U-39 ④): 떠날 때의 살림을 적어 두었다가, 돌아와 엔진이 따라잡은 뒤의 살림과 견준다
  let purse: AwayPurse | null = null;
  const purseOf = (g: GameState): AwayPurse => ({ cash: g.run.cash, debt: totalDebt(g.run) });
  document.addEventListener('visibilitychange', () => { if (document.hidden) purse = purseOf(useGame.getState().g); });
  let prevAway = useGame.getState().net.away;
  let prev = useGame.getState().g;
  useProto.getState().patch({ gen: prev.family.generation });
  const showAway = (a: AwayReport, from: AwayPurse, g: GameState) => {
    if (g.run.over || useProto.getState().prologue) return;
    const names = Object.fromEntries(Object.values(marketById).map((m) => [m.id, m.name]));
    useProto.getState().patch({ away: awayCard(a, from, purseOf(g), { names, openNow: Object.keys(g.run.positions).length, interval: settleSec(g.run) }) });
    play('settle_bell');
  };
  // 저장에서 이어 간 판(U-55): 켜기 전에 이미 떠난 사이를 메웠으면(연습 시세) 그 보고서를 바로 한 장
  if (prevAway) showAway(prevAway, resumeHint.r?.purse ?? purseOf(prev), prev);
  else if (resumeHint.r) purse = resumeHint.r.purse;
  useGame.subscribe((s) => {
    const g = s.g;
    if (s.net.away !== prevAway) {
      prevAway = s.net.away;
      if (s.net.away) showAway(s.net.away, purse ?? purseOf(prev), g);
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
      useUI.getState().setTrade({ market: lifeNo(g) > 1 && marketById.FLY?.tradable ? 'FLY' : 'DTC', lev: null, pct: 25, sl: null, tp: null, tpK: null, slK: null, keep: false });
      if (lifeNo(g) > 1) scene({ id: 'reborn', lines: STORY.reborn(), auto: 6000 });
      // U-46: 새 생은 튜토리얼이 끝난 자리(engine act1Start.ts) — 사무소에서 이미 빌렸고, 폰 · 지도 · 거래소가 열려 있다
      if (lifeNo(g) > 1) useProto.getState().patch({ loanTaken: true, everUnlocked: { ...useProto.getState().everUnlocked, map: true, phone: true }, visited: { ...useProto.getState().visited, phone: false } });
      else if (g.run.futures.open) useProto.getState().patch({ everUnlocked: { ...useProto.getState().everUnlocked, phone: true }, visited: { ...useProto.getState().visited, phone: false } });
      const sl = defaultSl(g);
      if (sl !== null) useUI.getState().setTrade({ sl });
      prev = g;
      return;
    }
    const run = g.run;
    const sameLife = g.family.generation === prev.family.generation;
    const settled = run.settleNo > prev.run.settleNo && !!run.lastSettlement && !run.over && sameLife;
    // 파산한 순간(회차 15 평가): 줄 서 있던 연체, 압류, 사채 문자는 걷는다 — 엔딩이 그 이야기를 한다. 지금 떠 있는 장면 하나는 그대로
    if (sameLife && run.over && !prev.run.over) {
      held.length = 0; calm.length = 0;
      const sc = useProto.getState().scenes;
      if (sc.length > 1) useProto.getState().patch({ scenes: [sc[0], ...sc.slice(1).filter((x) => !/^(overdue|seize|sms)/.test(x.id))] });
    }

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
          lines: STORY.collectorCome({ interest: c.interest, living: c.living, cash: Math.floor(run.cash), lend: officeOffer(g).lend, again: P.sentAwayAt >= 0, reborn: lifeNo(g) > 1 }, tipArgs(g)),
          choices: [
            { id: 'go', label: '사무소로 간다', sub: '조건 보기', primary: true, run: () => { useProto.getState().patch({ mapFocus: 'shark1' }); useProto.getState().setTab('map'); } },
            { id: 'away', label: '이번엔 돌려보낸다', sub: '연체', run: sendAway },
          ],
        });
      }
    }

    // ── 정산이 가까운데 낼 돈이 모자라다: 추심원이 미리 말한다(돈이 포지션에 묶여 있으면 그렇다고) ──
    if (!run.over && sameLife && run.settleIn === headsUpSec(run) && prev.run.settleIn !== run.settleIn && useProto.getState().loanTaken && useProto.getState().tutorial === 'done' && wouldBeShort(g)) {
      const due = claim(g).total;
      const locked = Object.values(run.positions).reduce((a, p) => a + p.margin0, 0);
      play('collector_steps', { vol: 0.5 });
      say(locked > 0
        ? `추심원: 곧 도착해요. 오늘 받을 돈은 ${comma(due)}이에요. 거래에 건 돈 빼면 지금 ${comma(Math.floor(run.cash))} 있어요.`
        : `추심원: 곧 도착해요. 오늘 ${comma(due)} 받을 건데, 지금 ${comma(Math.floor(run.cash))} 있으시네요.`, 6500);
    }
    // 정산이 끝났다
    if (settled) {
      const r = run.lastSettlement!;
      const od = overdueSum(g) > overdueSum(prev);
      // 라이트의 소개(U-65): 못 낸 돈을 다음 돈줄이 대신 냈다(연체가 아니다)
      const refer = r.refer ?? [];
      const odId = DEBT_IDS.find((id) => g.run.debts[id].overdue > prev.run.debts[id].overdue);
      const net = Math.round(r.mined - r.power - (r.wages ?? 0) - r.interest - r.living);
      play('settle_bell');
      useProto.getState().patch({ paidLife: useProto.getState().paidLife + Math.round(r.paid) });
      // 정산의 펀딩비가 증거금에서 빠졌다: 도토리로 건 출구를 같은 돈이 되게 다시 건다(U-41). 구독 안에서 엔진 행동을 겹쳐 부르지 않게 한 박자 뒤에
      if (Object.keys(run.positions).length > 0) window.setTimeout(reapplyAllPlans, 0);
      // 포지션을 든 채 처음 넘긴 정산(U-41): 무슨 일이 있었는지 한 줄(손에서 나간 돈 · 포지션은 그대로 · 펀딩비)
      if (!od && Object.keys(run.positions).length > 0 && Object.keys(prev.run.positions).length > 0 && !useProto.getState().seen.carried && useProto.getState().tutorial === 'done') {
        useProto.getState().patch({ seen: { ...useProto.getState().seen, carried: true } });
        later(5000, () => say(STORY.carried({ paid: r.paid + (r.wages ?? 0) }), 6500)); // 손에서 나간 돈 = 이자 · 생활비 + 일당(U-46)
      }
      if (r.mined > 0) fx.emit({ kind: 'settle', mined: r.mined, sold: ownedCoins(run).some((c) => run.coinWheels[c].autoSell) });
      if (net < 0) useProto.getState().patch({ negSettles: useProto.getState().negSettles + 1 });
      // 일당을 못 받은 알바가 나간다: 이번 생 처음은 족제비가 데리러 온다(장면), 그 뒤로는 한 줄.
      // 추심원의 연체 장면 뒤에 온다(U-46: 돈이 모자라서 → 일당이 밀려서 → 햄스터가 나간다. 예전에는 족제비가 먼저 왔다)
      const quitNow = () => {
        if ((r.quit ?? 0) <= 0) return;
        if (!useProto.getState().seen.quit) sceneCalm({ id: 'quit', lines: STORY.hamstersQuit(r.quit!) });
        else later(1500, () => say(`일당 미지급. 햄스터 ${r.quit}마리가 일을 마쳤다.`, 5000));
      };
      // 추심원은 오소리 대부의 이자만 걷는다. 다른 곳(캐피탈·뒷골목·조합)의 이자는 자동이체다.
      const badger = interestDue(prev, 'shark1');
      const other = Math.max(0, Math.round(r.interest - badger));
      const P0 = useProto.getState();
      const firstPositive = net > 0 && !P0.seen.posSettle;
      if (firstPositive) P0.patch({ seen: { ...P0.seen, posSettle: true } });
      const fcN = forecast(g);
      const posPnl = Object.values(run.positions).reduce((a, p) => { const v = positionView(g, p.market); return a + (v ? tradeNet(p, v.back) : 0); }, 0);
      const rctx = { nth: run.settleNo, short: r.unpaid, interest: badger, other, net, cashAfter: run.cash, nextClaim: fcN.interest + fcN.living, nextNet: fcN.net, overdue: od, posOpen: Object.keys(run.positions).length > 0, posPnl, negStreak: net < 0 ? useProto.getState().negRun : 0, firstPositive };
      const remark = () => settleRemark(rctx);
      // 되풀이 한 줄은 55초에 한 번(U-53): 연습 속도에서 추심원이 말 자리를 차지하지 않게. 이야기가 있는 줄은 늘
      const sayRemark = () => { if (remarkIsRoutine(rctx)) { if (Date.now() - routineAt < ROUTINE_GAP_MS) return; routineAt = Date.now(); } say(remark(), 4500); };
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
        const meta = { net, interest: badger, win: !od, no, other, living: Math.round(r.living), wages: Math.round(r.wages ?? 0), hamsters: staffedCount(g), mined: Math.round(r.mined) };
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
          sceneHeld({ id: `overdue${run.settleNo}`, again: true, lines: STORY.overdue({ lender: odId, interest: badger, nth: (useProto.getState().odSeen += 1), tagged, seized: (run.stats.assetsSeized ?? 0) > (prev.run.stats.assetsSeized ?? 0), nothingLeft: run.equipment.length === 0 && ownedCoins(run).length === 0, living: lv, livingCapital: lvCap, locked, short: r.unpaid }), settle: meta },
            '이자 미납. 상세 내역은 거래 뒤에 확인',
            // 한 번 더 밀리면 파산(어느 곳이든 연체가 한도 − 1)이거나 방금 무엇을 빼앗겼으면 기다리지 않는다
            (run.stats.assetsSeized ?? 0) > (prev.run.stats.assetsSeized ?? 0) || DEBT_IDS.some((id) => id !== 'tax' && run.debts[id].overdue >= lenderById[id].maxOverdue - 1));
        }
        else if (refer.length) { /* 소개 장면이 아래에서 뜬다 */ }
        else if (no === 1) scene({ id: 'firstSettle', lines: lifeNo(g) <= 1 ? STORY.firstSettle(badger, tipArgs(g)) : STORY.rebornSettle(badger), settle: meta });
        else if (no <= FULL_CUTINS && Object.keys(run.positions).length === 0 && P.tab !== 'phone') scene({ id: `settle${run.settleNo}`, lines: STORY.settleWin(badger), settle: meta, auto: 4000 });
        else sayRemark();
        quitNow();
        // 빌린 뒤에도 이자를 못 낸 정산: 사채 문자
        if (od && P.loanTaken && !isLite) { sceneHeld({ id: 'sms', lines: STORY.sms(officeOffer(g).lend) }); if (!useProto.getState().seen.sms) useProto.getState().patch({ visited: { ...useProto.getState().visited, map: false } }); }
        // 폰을 받은 뒤 첫 정산: 족제비가 알바를 권한다(막지 않는 한 줄)
        if (P.loanTaken && !od) scene({ id: 'hamsterHint', lines: STORY.hamsterHint(hamsterMath(g).wage, tipArgs(g)), auto: 5000 });
      } else if (!refer.length) { sayRemark(); quitNow(); }
      // 소개 장면: 추심원(또는 창구 너구리)이 다음 돈줄을 소개하고, 처음이면 그 돈줄의 유혹 만화(까마귀는 인증 사진). 그 돈줄은 이제 아는 곳
      // 구독 안에서 장면과 만화를 겹쳐 부르지 않게 한 박자 뒤에
      if (refer.length && !run.over) window.setTimeout(() => {
        for (const ref of refer) {
          const P = useProto.getState();
          P.patch({ seen: { ...P.seen, ...(ref.to === 'capital' ? { capitalSms: true } : { capitalSms: true, viperSms: true }) } });
          // 소개 장면을 다 읽으면 그 돈줄의 유혹 만화(처음일 때만)
          sceneHeld({ id: `refer${run.settleNo}${ref.to}`, again: true, lines: STORY.refer(ref), onEnd: () => temptOnRefer(g, ref) }, ref.to === 'capital' ? '숲속 캐피탈이 대신 냈다' : '반짝 전당포가 대신 냈다');
        }
      }, 0);
      // 라이트의 추심원 줄(U-65): 둘 넘게 빚졌으면 정산마다 문 앞에 나란히 서서 제 몫을 한 줄씩(소개, 연체, 파산 장면이 있는 정산은 빼고)
      if (isLite && !run.over && !refer.length && !od) doorKnock(owedLenders(prev).filter((id) => interestDue(prev, id) > 0).map((id) => ({ id, line: doorLine(id, interestDue(prev, id), id === 'shark1' ? r.living : 0) })));
      // 알바를 들인 채 정산을 한 번 넘겼는데 중고폰이 아직 안 울렸다(U-46, 회차 5b 의 남은 흠): 엄마의 쳇바퀴에만 알바를 들이고 돈을 쥔 채 기다린 생. 이 정산 뒤에 울린다
      {
        const P = useProto.getState();
        const staffedN = (x: typeof run) => (x.coinWheels.DTC?.staffed ? 1 : 0) + x.equipment.filter((u) => u.staffed).length;
        if (P.tutorial === 'await' && !P.seen.phoneRung && !P.seen.phoneRing && !P.forceTrade && run.futures.open && staffedN(prev.run) > 0 && staffedN(run) > 0) later(2600, () => { const Q = useProto.getState(); if (Q.tutorial === 'await' && !Q.seen.phoneRung && !Q.forceTrade && !useGame.getState().g.run.over) phoneRing(); });
      }
      // ── FRX 숲거래소 오픈 기념(U-40): 끝나기 세 번 전에 한 줄, 끝난 정산에 문자와 오소리 대부 ──
      if (openingEvent()) {
        const left = feeEventLeft(run), was = feeEventLeft(prev.run);
        if (was > 0 && left === 0) {
          const ev = openingEvent()!;
          const trades = Math.max(0, ((run.stats.trades as number | undefined) ?? 0) - (lifeNo(g) <= 1 ? 1 : 0)); // 첫 생의 튜토리얼 거래는 세지 않는다
          sceneCalm({ id: 'feeEventEnd', lines: STORY.feeEventEnd({ ratePct: +(feeRate(g, 10) * 100).toFixed(3), trades, saved: feeSaved((run.stats.eventNotional as number | undefined) ?? 0, ev.afterFeeRate), lev: Math.max(10, levCapNow(run)) }) });
        } else if (was === 4 && left === 3) later(5200, () => say('[FRX 숲거래소] 수수료 무료 기간이 정산 3회 뒤 끝나요.', 6000));
      }
      // ── 마을의 다른 돈줄은 사건으로 열린다(U-22 의 원칙을 지도에도, U-38) ──
      {
        const P = useProto.getState();
        // 숲속 캐피탈: 튜토리얼이 끝나고 한 번 더 정산을 치른 뒤 문자가 온다
        if (P.loanTaken && P.tutorial === 'done' && !P.seen.capitalSms && run.settleNo >= 3 && !od) {
          sceneCalm({ id: 'capitalSms', lines: STORY.capitalSms({ unit: lenderById.capital.borrowUnit ?? 50000, perUnit: Math.ceil((lenderById.capital.borrowUnit ?? 50000) * lenderRate(g, 'capital') - 1e-9) }) });
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
    // 같은 틱에 파산했으면 압류 장면은 띄우지 않는다(엔딩 카드가 판에 걸려 있던 돈까지 말한다)
    if (sameLife && !run.over && (run.stats.assetsSeized ?? 0) > (prev.run.stats.assetsSeized ?? 0)) {
      const ev = [...run.eventLog].reverse().find((e) => e.kind.startsWith('seize:'));
      const what = ev?.kind.startsWith('seize:wheel:') ? 'mom' : ev?.kind === 'seize:wallet' ? 'wallet' : 'wheel';
      later(1200, () => play('overdue_stamp'));
      sceneHeld({ id: `seize${run.stats.assetsSeized}`, again: true, lines: STORY.seize({ what, off: Math.abs(ev?.amount ?? 0), locked: Object.values(run.positions).reduce((a, p) => a + p.margin0, 0) }) }, what === 'mom' ? '엄마의 쳇바퀴 압류. 집에서 내역 확인' : what === 'wallet' ? '콜드월렛 압류. 집에서 내역 확인' : '보조 쳇바퀴 압류. 집에서 내역 확인', true);
    }
    // 닫힌 포지션(U-47: 여러 종목을 함께 들 수 있다 — 한 틱에 둘 이상 닫혀도 하나씩 다 본다)
    const closedPs = Object.values(prev.run.positions).filter((p) => { const c = run.positions[p.market]; return !c || c.openTick !== p.openTick; });
    // 강제 청산: 흔들림 + 도장(한 틱에 여럿이면 소리는 한 번)
    const liqPs = closedPs.filter((p) => closedMath(run, p).kind === 'liq');
    // 청산(U-49): 둔탁한 의사봉 한 방 + 깨지는 도장(새 소리 liq_gavel 를 앞에)
    if (liqPs.length) { play('liq_gavel'); later(260, () => play('liquidation')); liqAt = Date.now(); }
    // 판이 닫힌 순간의 숨(U-48): 거래소를 보고 있으면 결과 카드, 청산 도장, 축하가 먼저 보이고, 장면(추심원의 말 등)은 그 뒤에 온다
    // U-49: 집이나 지도에 있어도 같다(크게 이긴 판은 어디서든 터진다)
    if (closedPs.length) {
      const big = closedPs.some((p) => { const cmx = closedMath(run, p); return cmx.kind === 'liq' || cmx.pnl / Math.max(1, p.margin0) >= 0.15 || cmx.pnl >= claim(prev).total; });
      useProto.getState().patch({ beatUntil: Date.now() + (big ? BEAT_MS : 700) });
    }
    for (const p of liqPs) fx.emit({ kind: 'liq', market: marketById[p.market]?.name ?? p.market, lost: Math.round(-closedMath(run, p).pnl), lev: p.lev });
    // 포지션이 닫혔다(청산 제외 이익 판정은 noteClose 가 한다)
    for (const p of sameLife ? closedPs : []) {
      const lc = { market: p.market, liq: closedMath(run, p).kind === 'liq', tick: run.tick };
      {
        const { exit, pnl, kind: endKind } = closedMath(run, p);
        const tut = useProto.getState().tutorial === 'run';
        // 걸어 둔 출구에 닿아 닫혔는데 거래소를 보고 있지 않았다(U-41): 어디서든 한 줄로 알린다(결과 카드는 거래소 탭에만 뜬다)
        const autoOut = !tut && (endKind === 'tp' || endKind === 'sl') && useProto.getState().tab !== 'phone';
        // 이긴 판의 등급(U-48 → U-49): 어느 탭에서든 화면이 터진다. 집이면 도토리 비가 집 안으로 쏟아지고 햄스터들이 들썩인다
        const tierB = !tut && endKind !== 'liq' ? burstTier(pnl, p.margin0, claim(prev).total) : null;
        // FRX 회원 등급(U-65)은 예탁금과 거래액으로 forestTick 이 본다. 여기서는 이번 생 가장 크게 딴 판만
        const prevBest = useProto.getState().bestWin;
        if (!tut) {
          // FRX 의뢰판(U-56): 이 판이 의뢰를 끝냈으면 의뢰인의 사례금(U-65)
          forestClose(g, { market: p.market, dir: p.dir, lev: p.lev, margin: p.margin0, pnl, roe: endKind === 'liq' ? -100 : (pnl / Math.max(1, p.margin0)) * 100, heldSec: run.tick - p.openTick, kind: endKind, claim: claim(prev).total, fly: !!marketById[p.market]?.synthetic }, say);
          const P2 = useProto.getState();
          if (pnl > 0 && pnl > P2.bestWin) P2.patch({ bestTrade: { pnl: Math.round(pnl), market: p.market, lev: p.lev, dir: p.dir, roe: (pnl / Math.max(1, p.margin0)) * 100 } });
          P2.patch({ bestWin: Math.max(P2.bestWin, pnl) });
        }
        if (tierB) {
          const P0 = useProto.getState();
          const record = pnl > 0 && prevBest > 0 && pnl > prevBest; // 이번 생 가장 크게 딴 판(첫 이긴 판은 신기록이라 부르지 않는다)
          const c0 = claim(prev).total;
          const fire = () => {
            const P3 = useProto.getState();
            P3.patch({ burst: { k: (P3.burst?.k ?? 0) + 1, tier: tierB, pnl, margin: p.margin0, streak: pnl > 0 ? P0.winStreak + 1 : 0, lev: p.lev, market: p.market, dir: p.dir, name: marketById[p.market]?.name ?? p.market, how: endKind === 'tp' ? 'tp' : endKind === 'sl' ? 'sl' : 'close', record },
              // 큰 등급의 상자는 2.6초보다 오래 남는다(U-52): 장면이 그 꼬리를 덮지 않게 숨을 늘린다
              beatUntil: Math.max(P3.beatUntil, Date.now() + burstMs(tierB.lv)) });
            winSound(tierB.lv);
            if (P3.tab !== 'phone') { cheerOn(pnl, c0 > 0 ? pnl / c0 : 0); later(420, () => play('hamster_cheer')); }
          };
          // 장면(컷인)이 이미 떠 있으면 그 밑에서 터지지 않게 장면이 걷힌 뒤에 터진다(U-52)
          if (covered()) burstWait = fire; else fire();
        }
        // 첫 실전 한 판(U-50, 첫 생): 이긴 판이 터지면 끝, 진 판이면 한 번 덜 남는다
        if (!tut && useProto.getState().firstTry > 0) {
          const P1 = useProto.getState();
          if (tierB && pnl > 0) { P1.patch({ firstTry: 0 }); later(3000, () => say('[FRX 숲거래소] 첫 실전 익절 축하드려요 ♥ 다음 판도 기다릴게요.', 5000)); }
          else if (pnl < 0) P1.patch({ firstTry: P1.firstTry - 1 });
        }
        if (autoOut && !tierB) { play(pnl > 0 ? 'close_profit' : 'close_loss'); say(`[FRX 숲거래소] ${marketById[lc.market]?.name ?? lc.market} ${p.dir === 1 ? '롱' : '숏'} ${p.lev}배 ${endKind === 'tp' ? '익절' : '손절'} ${pnl >= 0 ? '+' : '−'}${comma(Math.abs(Math.round(pnl)))}`, 5000); }
        // 튜토리얼 거래는 승률·인증서·반응에 넣지 않는다
        if (!tut) {
          const c = claim(prev).total;
          noteClose({ record: pnl > 0 && prevBest > 0 && pnl > prevBest, market: lc.market, dir: p.dir, lev: p.lev, roe: lc.liq ? -100 : roePct(p, exit), pnl, margin: p.margin0, claim: c, entry: p.entry, exit, heldSec: lc.tick - p.openTick, gen: lifeNo(g), gold: !!run.skill?.B4 || (!!run.skill?.B3a && p.lev >= 100 && pnl > 0) });
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
          if (bigOne) { if (!tierB) later(500, () => play('goal_complete')); cheerOn(pnl, pnl / c); }
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
            { id: 'repay', label: '갚으러 간다', sub: buys ? buys.text : isLite ? '대출 → 오소리 사무소' : '지도 → 오소리 사무소', run: () => { cheerOn(pnl, pnl / c); useProto.getState().patch({ mapFocus: 'shark1' }); useProto.getState().setTab('map'); } },
            { id: 'keep', label: '쥐고 있는다', sub: keepSub, run: () => { cheerOn(pnl, pnl / c); } },
          ] : undefined);
          if (re?.key === 'winClaim1') {
            // 이번 생 처음: 장면 + 고르기(갚으러 간다 / 쥐고 있는다). 숫자는 그 거래와 지금 장부의 것. 떠 있는 동안 시계가 멈춘다(정산도 잔치도 기다린다)
            const toNext = debt > 0 ? Math.min(debt, STAMP_STEP - (((run.stats['repaid.shark1'] as number | undefined) ?? 0) % STAMP_STEP)) : null;
            scene({ id: 'react_winClaim1', again: true, hold: true, lines: STORY.winClaim({ first: re.lines[0], pnl, claim: c, spins: wn > 0 ? Math.round(pnl / wn) : null, stampLeft: toNext, momLeft: debt }),
              choices: repayChoices(`남겨 둘 돈 ${comma(Math.floor(run.cash))}`) });
          }
          else if (bigOne && winRun === 2 && !P.seen.react_winRun) {
            scene({ id: 'react_winRun', hold: true, lines: STORY.winRun({ sum: runSum, stampPct: debt > 0 ? Math.round((runSum / STAMP_STEP) * 100) : null }),
              choices: repayChoices(`현금 ${comma(Math.floor(run.cash))}`) });
          }
          else if (bigLoss && lossRun === 2 && !P.seen.react_lossRun) {
            if (re?.scene) scene({ id: 'react_' + re.key, again: true, lines: re.lines.map((text) => ({ who: re.who, text })) });
            scene({ id: 'react_lossRun', hold: true, lines: STORY.lossRun({ sum: Math.abs(runSum), spins: wn > 0 ? Math.round(Math.abs(runSum) / wn) : null, cash: Math.floor(run.cash), claim: (() => { const f = forecast(g); return Math.round(f.interest + f.living + f.wages); })() }),
              choices: [
                { id: 'home', label: '집으로 간다', run: () => { useProto.getState().setTab('lot'); } },
                { id: 'stay', label: '폰을 더 본다', sub: `현금 ${comma(Math.floor(run.cash))}`, run: () => { /* 그대로 */ } },
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
        const add = (amt: number) => { const r = useGame.getState().act({ type: 'addMargin', market: mk, amount: amt }); play(r.ok ? 'buy' : 'insufficient'); say(r.ok ? `증거금 +${comma(amt)}. 청산가까지 거리가 늘었다.` : r.msg ?? '넣지 못했다', 4000); done(); };
        scene({
          id: `call${run.marginCall.tick}`, again: true, hold: true, lines: STORY.marginCall({ name: marketById[mk]?.name ?? mk, dir: p.dir, lev: p.lev, broke: put < 1000 && lend <= 0 }),
          choices: [
            ...(put >= 1000 ? [{ id: 'put', label: '내 돈 넣기', sub: `+${comma(put)}`, primary: true, run: () => add(put) }] : []),
            ...(lend > 0 ? [{ id: 'loan', label: '빌려서 넣기', sub: `+${comma(lend)}, 금리 ${+(Math.max(lenderById.shark1.rate, nextBorrowRate(g, 'shark1') - callLoanCut(run)) * 100).toFixed(1)}%`, run: () => { const b = useGame.getState().act({ type: 'borrow', lender: 'shark1', call: true }); if (b.ok) add(b.amount ?? lend); else done(); } }] : []),
            { id: 'hang', label: '전화 끊기', run: done },
          ],
        });
      }
    }
    // 배율이 열렸다 · 확인서에 도장을 찍었다
    if (sameLife && !run.over) {
      // U-47: 처음부터 50배(계좌를 연 순간), 발도장을 찍으면 그 자리에서 200배. 찍은 뒤에는 한 줄만
      // 한 번 버티기(나무 B1): 청산가에 닿은 순간 오소리가 대신 넣었다
      const lh = run.stats.lastHold as { market: string; tick: number; amount: number } | undefined, plh = prev.run.stats.lastHold as typeof lh;
      if (lh && (!plh || plh.tick !== lh.tick || plh.market !== lh.market)) {
        // U-50: 두 번째 숨 — 화면 가득 금빛(SecondWind), 심장이 한 박 멈췄다가 다시 뛴다
        const P0 = useProto.getState();
        P0.patch({ wind: { k: (P0.wind?.k ?? 0) + 1, market: lh.market, amount: lh.amount, name: marketById[lh.market]?.name ?? lh.market } });
        play('paw_stamp'); later(220, () => play('saved_phew'));
        later(900, () => pushPop('오소리가 잡았다!', 'saved', lh.market, undefined, `한 번 버티기 +${comma(lh.amount)}`));
        treePing('B1', `한 번 버티기 +${comma(lh.amount)}`);
        later(2300, () => say(`오소리 대부: 한 번은 잡아 드렸어요. ${marketById[lh.market]?.name ?? lh.market} 증거금 +${comma(lh.amount)}, 정리할 때 돌려주세요.`, 5500));
      }
      // 따라가는 손절(나무 C1, U-50): 손절이 본전 위로 처음 올라온 순간, 그 뒤로는 20%p 를 더 올라올 때마다 팝
      const lt = run.stats.lastTrail as { market: string; tick: number; sl: number; first: boolean } | undefined, plt = prev.run.stats.lastTrail as typeof lt;
      if (lt && (!plt || plt.tick !== lt.tick || plt.market !== lt.market || plt.sl !== lt.sl)) {
        const key = lt.market + ':' + (run.positions[lt.market]?.openTick ?? -1);
        const shown = trailShown[key] ?? -Infinity;
        if (lt.first || lt.sl - shown >= 20) {
          trailShown[key] = lt.sl;
          pushPop(lt.first ? '본전 잠금' : `손절 +${lt.sl}%`, lt.first ? 'saved' : 'up', lt.market, () => play(lt.first ? 'saved_phew' : 'milestone_up'), `따라가는 손절 +${lt.sl}%`);
          treePing('C1', `따라가는 손절 +${lt.sl}%`);
        }
      }
      if (run.futures.waiver && !prev.run.futures.waiver) later(400, () => say('[FRX 숲거래소] 확인서 접수. 이제 200배까지 주문할 수 있어요.', 4500));
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
        if (gs > goldStamps(prev) && !isLite) { play('goal_complete'); later(400, () => say(`장부에 황금 도토코인 ${gs}개째가 찍혔다. 다음 생의 나무에 쓴다.`, 4500)); }
        if (beat) scene({ id: 'ledger_' + beat, lines: STORY.ledger(beat, { cut: (() => { const r = ledgerRows(prev).find((x) => x.key === 'repeat'); return r ? Math.round((r.start * r.ratePct) / 100) : 0; })(), otherDebt: lenderDebtTotal(run), frame: !!useProto.getState().seen.momClue_frame, momLeft: ledgerRows(g).find((x) => x.key === 'mom')?.left ?? 0 }) });
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
      // U-59: 처음 다 갚았으면 전광판이 풀린다(축하는 이 장면의 고르는 줄에서 뜬다, RankUnlockCheer)
      if (lenderDebtTotal(run) === 0 && lenderDebtTotal(prev.run) > 0) rankCleared();
      if (lenderDebtTotal(run) === 0 && lenderDebtTotal(prev.run) > 0) scene({ id: 'clear', lines: STORY.clear(), hold: true, choices: [
        { id: 'retire', label: '은퇴한다', sub: isLite ? retireSubLite(g) : `이번 생 마치기, 황금 도토코인 +${treeAward(run)}`, run: retireNow },
        { id: 'continue', label: isLite ? '한 판 더 산다' : '계속 산다', sub: '빚 없이 이어 하기', primary: true, run: () => { useProto.getState().patch({ seen: { ...useProto.getState().seen, continued: true } }); scene({ id: 'act2Hook', lines: STORY.act2Hook() }); } },
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
    if (!sameLife) forestNewLife();
    if (sameLife && g.run.tick !== prev.run.tick) { holdTick(g); forestTick(g, say); marketTick(g); }
    flushHeld(); // 급한 것(연체·압류)이 먼저
    flushCalm();
    guideCheck();
    prev = g;
  });
}
