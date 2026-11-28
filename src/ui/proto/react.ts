// 세상이 내가 한 일에 반응한다(U-38): 끝난 거래 하나, 정산 한 번을 보고 누가 무슨 말을 할지 고른다.
// 순수 함수다(엔진, 저장소를 부르지 않는다). 숫자는 전부 부르는 쪽이 엔진 값으로 채운다. 말투(개정 대본): 추심원은 금액을 정확히, 오소리 대부는 반쯤만 답하는 존댓말, 다로미는 혼잣말 한마디.
import type { Who } from './protoStore';
import { josa } from '../../engine/util';
import { MOOD_BIG_ROE } from './tension';

const n = (x: number) => Math.round(Math.abs(x)).toLocaleString('ko-KR');

/** 끝난 거래 하나 */
export interface TradeEnd {
  /** 넣은 돈에 더해지거나 빠진 돈(수수료 포함) */ pnl: number;
  margin: number; lev: number; liq: boolean; heldSec: number;
  /** 빌린 지 60초 안에 들어간 포지션이면 빌린 곳 */ fundedBy: string | null;
  /** 가진 돈을 전부 걸었다 */ allIn: boolean;
}
/** 그 거래가 끝난 때의 살림. 반응의 크기는 넣은 돈에 견준 %(ROE)로 잰다(11-28 결정): 정산 청구액(이자 + 생활비)은 쓰지 않는다 */
export interface TradeCtx {
  /** 알바가 도는 쳇바퀴 한 대가 정산마다 남기는 돈 */ wheelNet: number;
  cashAfter: number;
  /** 이번 생의 청산 수(이 거래 포함) */ liqs: number;
  /** 잇따라 딴 수 · 잃은 수 · 본전치기 수(이 거래 포함) */ winStreak: number; lossStreak: number; tinyStreak: number;
  /** 이번 생에 낸 거래 수수료 합 */ feesLife: number;
  /** 이번 생에 이미 나온 반응 */ seen: Record<string, boolean>;
  /** 이 거래에 수수료가 한 푼도 안 들었다(오픈 기념, U-40): 수수료를 말하는 줄은 거짓이 된다 */ feeFree?: boolean;
  /** 이번 생에 넣은 돈만큼 넘게 딴 판(ROE +100% 이상)의 수(이 거래 포함, U-41 → 11-28 결정) */ bigWins?: number;
  /** 오소리 빚(원금, [갚으러 간다]가 갚는 곳). 0 이면 갚으라는 줄은 거짓이라 빠진다. 없으면 빚이 남은 것으로 본다 */ debt?: number;
}
export interface Reaction { key: string; who: Who; lines: string[]; /** true = 컷인 장면, false = 한 줄 알림 */ scene: boolean; /** 이번 생에 한 번만 */ once: boolean }

/** 반응의 문턱(사용자 결정 11-28): 넣은 돈에 견준 %(ROE). 「이자 한 번 치」(정산 청구액)는 반응을 정하지 않는다
 *  big = 넣은 돈만큼 넘게 땄다(두 배): 추심원과 다로미의 장면, 집의 잔치, 연달아 딴 판
 *  huge = 오소리 대부의 장면, bigLoss = 반 넘게 잃었다(청산 포함): 연달아 잃은 판
 *  tiny = 본전치기(연달아 딴 판, 잃은 판을 끊지 않는다), first = 첫 이익, 첫 손실 한마디, cert = 수익 인증서 */
export const REACT_ROE = { big: 100, huge: 300, bigLoss: -50, tiny: 5, first: 10, cert: 50 } as const;
/** 끝난 거래의 ROE(%): 수수료까지 넣은 손익 ÷ 넣은 돈. 청산이면 −100 */
export const roeOf = (t: { pnl: number; margin: number; liq?: boolean }): number => (t.liq ? -100 : (t.pnl / Math.max(1, t.margin)) * 100);
/** 본전치기: 넣은 돈의 5%도 안 움직였다 */
export const isTiny = (roe: number): boolean => Math.abs(roe) < REACT_ROE.tiny;
/** 크게 딴 판: 넣은 돈만큼 넘게 땄다(+100% 이상) */
export const isBigWin = (roe: number): boolean => roe >= REACT_ROE.big;
/** 크게 잃은 판: 넣은 돈의 반 넘게(청산이면 −100) */
export const isBigLoss = (roe: number): boolean => roe <= REACT_ROE.bigLoss;
/** 돈을 "쳇바퀴 한 대가 정산 몇 번 돈 값"으로. 너무 작으면 null("쳇바퀴 백 날 굴리는 것보다 빨라요"를 숫자로 보여 준다) */
export function wheelWorth(amount: number, wheelNet: number): string | null {
  if (wheelNet <= 0) return null;
  const k = Math.abs(amount) / wheelNet;
  if (k < 0.2) return null;
  return `쳇바퀴 한 대 ${k < 10 ? k.toFixed(1) : n(k)}정산치`;
}
const held = (sec: number) => (sec < 60 ? `${Math.max(1, Math.round(sec))}초` : `${Math.round(sec / 60)}분`);
const KO_TIMES = ['', '', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉'];
/** 딴 돈이 넣은 돈의 몇 배인가(ROE +100% 이상에서 부른다): 「거신 돈만큼」 「거신 돈의 세 배를」 「거신 돈의 12배를」 */
export const madeTimes = (roe: number): string => {
  const x = Math.floor(roe / 100);
  return x <= 1 ? '거신 돈만큼' : `거신 돈의 ${x < 10 ? `${KO_TIMES[x]} 배` : `${x}배`}를`;
};

export function tradeReaction(t: TradeEnd, c: TradeCtx): Reaction | null {
  const R = (key: string, who: Who, lines: string[], scene = false, once = true): Reaction | null => (once && c.seen[key] ? null : { key, who, lines, scene, once });
  const roe = roeOf(t);
  if (t.liq) {
    return (t.allIn && c.cashAfter < 1000 ? R('liqAllIn', 'boss', ['다 넣으셨군요.', '급하시면 들르세요. 저 아직 사무소에 있어요.'], true) : null)
      // fundedBy = 빌리고 60초 안에 들어간 포지션(엔진이 붙인다): 빌린 때와 건 때 사이를 짚는다
      ?? (t.fundedBy ? R('liqFunded', 'collector', ['빌리고 1분도 안 돼서 거셨네요.', '그 돈 이자는 그대로 나갑니다.'], true) : null)
      ?? (c.liqs === 3 ? R('liq3', 'collector', ['이번이 세 번째네요. 오늘 수금은 예정대로 갑니다.']) : null)
      ?? R('liqFirst', 'boss', [c.feeFree ? '이번 건 수수료도 없었어요. 거셨던 돈이 다 나간 거예요.' : '수수료도 나갔어요. 내역 맨 아래 보세요.'])
      ?? (c.liqs % 2 ? R('liqA', 'collector', ['오늘 수금 시간은 아시죠?'], false, false) : R('liqB', 'boss', ['돈 더 필요하시면 이 번호로 연락 주세요.'], false, false));
  }
  // 갚을 오소리 빚이 남았는가: 없으면 「장부에서 지워 드릴까요」 「오늘 갚으실 거면」은 거짓이라 건너뛴다
  const owes = (c.debt ?? 1) > 0;
  if (owes && roe >= REACT_ROE.huge) { const r = R('bigWin', 'boss', [`${madeTimes(roe)} 버셨네요. 그중에 얼마쯤 장부에서 지워 드릴까요?`], true); if (r) return r; }
  if (isBigWin(roe)) {
    // 넣은 돈만큼 넘게 땄다(11-28 결정): 이번 생 처음은 장면(추심원, 다로미), 그 뒤로는 번갈아 한 줄. 열쇠 이름(winClaim…)은 저장된 seen 과 맞추려고 그대로 둔다
    // 첫마디는 돈의 크기가 아니라 넣은 돈의 몇 배인지(넣은 돈 1,000 에 +1,000 이어도 참인 말)
    const first = R('winClaim1', 'collector', [`${madeTimes(roe)} 버셨네요. 종 칠 때 들를게요.`], true);
    if (first) return first;
    const k = c.bigWins ?? 2;
    const pick = k % 3;
    return pick === 2 && owes ? R('winClaim', 'boss', ['오늘 갚으실 거면 제가 아직 사무소에 있어요.'], false, false)
      : pick === 0 ? R('winClaimC', 'collector', ['오늘은 웃으시네요. 종은 예정대로 쳐요.'], false, false)
      : R('winClaimH', 'hero', [c.wheelNet > 0 ? '바퀴는 아직 한 바퀴도 안 돌았는데.' : '손가락 한 번에 이만큼.'], false, false);
  }
  if (isBigLoss(roe)) return R('lossClaim', 'collector', ['아까운 돈이네요. 종은 예정대로 쳐요.'], false, false);
  if (c.tinyStreak >= 3 && c.feesLife >= 1) { const r = R('feeBleed', 'collector', [`지금까지 수수료만 ${josa(n(c.feesLife), '이', '가')} 나갔어요.`]); if (r) return r; }
  if (t.pnl > 0 && roe >= REACT_ROE.first) { const r = R('firstWin', 'boss', [c.wheelNet > 0 ? '바퀴로 벌 때보다 손맛이 있죠?' : '숫자가 한 번에 바뀌죠? 그게 손맛이에요.']); if (r) return r; }
  if (t.pnl < 0 && -roe >= REACT_ROE.first) { const r = R('firstLoss', 'collector', ['오늘은 종 칠 때 들를게요.']); if (r) return r; }
  if (c.tinyStreak >= 3 && c.feesLife < 1) { const r = R('flatFree', 'boss', ['세 번이나 사고파셨는데 본전이네요. 지금 수수료 안 받을 때라 다행이죠.']); if (r) return r; }
  if (c.winStreak === 3) return R('win3', 'hero', ['세 번이면 우연은 아니겠지?']);
  if (c.lossStreak === 3) return R('loss3', 'hero', ['손가락이 자꾸 같은 데로 간다.']);
  return null;
}

/** 크게 연달아 딴 판, 잃은 판(U-42 → 11-28 결정): 이어진 수와 그 합. 본전치기(±5% 안)는 끊지 않고, 그 밖의 판은 끊는다 */
export interface BigRun { winRun: number; lossRun: number; runSum: number }
export function nextBigRun(r: BigRun, pnl: number, roe: number): BigRun & { bigWin: boolean; bigLoss: boolean; tiny: boolean } {
  const bigWin = isBigWin(roe), bigLoss = isBigLoss(roe), tiny = isTiny(roe);
  const winRun = bigWin ? r.winRun + 1 : tiny ? r.winRun : 0;
  const lossRun = bigLoss ? r.lossRun + 1 : tiny ? r.lossRun : 0;
  const runSum = (bigWin && winRun > 1) || (bigLoss && lossRun > 1) ? r.runSum + pnl : bigWin || bigLoss ? pnl : tiny ? r.runSum : 0;
  return { bigWin, bigLoss, tiny, winRun, lossRun, runSum };
}
/** 닫힌 판 뒤의 고르는 장면: winClaim1 = 이번 생 처음 넣은 돈만큼 넘게 딴 판, winRun = 그런 판이 두 판째, lossRun = 반 넘게 잃은 판이 두 판째(둘 다 이번 생 한 번). 아니면 null.
 *  winRun 은 「첫 판 끝났을 땐 갚으려고 했는데」의 장면이라 갚을 오소리 빚이 남았을 때만(owes) */
export function closeScene(re: Reaction | null, run: { bigWin: boolean; bigLoss: boolean; winRun: number; lossRun: number }, seen: Record<string, boolean>, owes = true): 'winClaim1' | 'winRun' | 'lossRun' | null {
  if (re?.key === 'winClaim1') return 'winClaim1';
  if (owes && run.bigWin && run.winRun === 2 && !seen.react_winRun) return 'winRun';
  if (run.bigLoss && run.lossRun === 2 && !seen.react_lossRun) return 'lossRun';
  return null;
}
/** [갚으러 간다] [쥐고 있는다]는 오소리 빚이 남았을 때만. 다 갚았으면 장면은 줄만 보인다 */
export const offersRepay = (debt: number): boolean => debt > 0;

/** 수익 인증서를 물어볼 만한 이익인가: 넣은 돈의 절반 이상을 땄을 때만(ROE +50%, 잔돈 이익마다 묻지 않는다. 11-28 결정: 청구액 갈래는 뺐다) */
export const worthCertificate = (pnl: number, margin: number): boolean => pnl > 0 && pnl >= Math.max(1, margin) * (REACT_ROE.cert / 100);

/** 정산 한 번 */
export interface SettleCtx {
  /** 오소리 대부 이자(추심원이 걷는 돈) */ interest: number;
  /** 다른 곳 이자(캐피탈·조합·뒷골목): 추심원이 걷지 않는다 */ other: number;
  /** 내 정산 합계 */ net: number;
  cashAfter: number;
  /** 다음 정산에 걷어 갈 돈 */ nextClaim: number;
  /** 다음 정산의 예상 합계(알바 수입 − 일당 − 이자 − 생활비) */ nextNet: number;
  overdue: boolean; posOpen: boolean;
  /** 열린 포지션의 지금 손익 합(정리하면 더해지거나 빠지는 돈). 없으면 0 */ posPnl?: number;
  /** 열린 포지션에 넣은 돈의 합(margin0). 걸어 둔 건의 크기는 이것에 견준 %로 잰다(11-28 결정). 없으면 0 */ posMargin?: number;
  /** 잇따른 적자 정산 수(이번 포함) */ negStreak: number;
  /** 이번 생에 처음으로 남은 정산 */ firstPositive: boolean;
  /** 이번 생의 정산 순번(같은 줄이 되풀이되지 않게 번갈아 쓴다, U-40). 없으면 0 */ nth?: number;
  /** 연체면 모자란 돈(엔진 lastSettlement.unpaid) */ short?: number;
}
const rot = (nth: number, ...v: string[]): string => v[((nth % v.length) + v.length) % v.length];
/** 이야기가 없는 정산 한 줄인가(U-53): 연체, 곧 밀린다는 경고, 처음 남은 정산, 세 번째 적자는 이야기다. 나머지("이자 받았어요")는 되풀이라
 *  연습 속도(정산 20초)에서는 말 자리를 자주 차지한다 — 그런 줄은 ROUTINE_GAP_MS 안에 한 번만 말한다(종소리와 추심원 그림은 그대로) */
export function remarkIsRoutine(c: SettleCtx): boolean {
  if (c.overdue || c.firstPositive || c.negStreak === 3) return false;
  const runway = c.nextNet < 0 ? Math.floor(c.cashAfter / -c.nextNet) : null;
  return !(runway !== null && runway <= 3);
}
export const ROUTINE_GAP_MS = 55_000;
/** 정산 알림 한 줄. 추심원은 오소리 대부의 이자만 걷는다. 다른 곳 이자는 자동이체로 적는다. */
export function settleRemark(c: SettleCtx): string {
  const sum = `이번 정산 ${c.net >= 0 ? '+' : '−'}${n(c.net)}`;
  const auto = c.other > 0 ? ` 다른 곳 이자 ${n(c.other)} 자동이체.` : '';
  if (c.interest <= 0) return c.other > 0 ? `[자동이체] ${c.overdue ? '잔액 부족, 연체' : `이자 ${n(c.other)} 출금`}. ${sum}` : `정산 완료. ${sum}`;
  const iv = n(c.interest);
  let line: string;
  if (c.overdue) line = `다시 세 봐도 ${n(c.short ?? c.interest)} 모자라요.`;
  else {
    const runway = c.nextNet < 0 ? Math.floor(c.cashAfter / -c.nextNet) : null;
    if (runway !== null && runway <= 0) line = `이자 ${iv} 받았습니다. 다음번엔 오늘만큼 못 내시겠는데요.`;
    else if (runway !== null && runway <= 3) line = `이자 ${iv} 받았습니다. 이 속도면 ${runway}번 뒤엔 밀려요.`;
    else if (c.firstPositive) line = `오늘은 내고도 남네요. 이자 ${iv} 받았어요.`;
    else if (c.negStreak === 3) line = `오늘도 모아 두신 데서 냈네요. 이번이 세 번째예요. 이자 ${iv} 받았습니다.`;
    else if (c.posOpen) {
      // 정산을 넘겨 들고 있는 포지션을 추심원이 흘끗 본다: 크기는 넣은 돈에 견준 %(주인공이 들썩이고 서성이는 문턱과 같은 25%, 11-28 결정. 이번 이자에 견주지 않는다)
      const p = c.posPnl ?? 0, m = c.posMargin ?? 0, big = m > 0 && (Math.abs(p) / m) * 100 >= MOOD_BIG_ROE;
      line = big ? `이자 ${iv} 받았습니다. 걸어 두신 건 아직 ${p > 0 ? '+' : '−'}${josa(n(p), '이네요', '네요')}.` : rot(c.nth ?? 0, '폰 보고 계세요. 영수증은 여기 둘게요.', '아직 들고 계시네요.', `이자 ${iv} 받았어요.`);
    }
    else line = rot(c.nth ?? 0, `이자 ${iv} 받았어요.`, `여기 영수증이요. 이자 ${iv}.`, `오늘 날짜에 도장 찍었어요. 이자 ${iv}.`);
  }
  return `추심원: ${line}${auto} ${sum}`;
}
