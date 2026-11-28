// 세상이 내가 한 일에 반응한다(U-38): 끝난 거래 하나, 정산 한 번을 보고 누가 무슨 말을 할지 고른다.
// 순수 함수다(엔진, 저장소를 부르지 않는다). 숫자는 전부 부르는 쪽이 엔진 값으로 채운다. 말투(개정 대본): 추심원은 금액을 정확히, 오소리 대부는 반쯤만 답하는 존댓말, 다로미는 혼잣말 한마디.
import type { Who } from './protoStore';
import { josa } from '../../engine/util';

const n = (x: number) => Math.round(Math.abs(x)).toLocaleString('ko-KR');

/** 끝난 거래 하나 */
export interface TradeEnd {
  /** 넣은 돈에 더해지거나 빠진 돈(수수료 포함) */ pnl: number;
  margin: number; lev: number; liq: boolean; heldSec: number;
  /** 빌린 지 60초 안에 들어간 포지션이면 빌린 곳 */ fundedBy: string | null;
  /** 가진 돈을 전부 걸었다 */ allIn: boolean;
}
/** 그 거래가 끝난 때의 살림 */
export interface TradeCtx {
  /** 다음 정산에 걷어 갈 돈(이자 + 생활비) */ claim: number;
  /** 알바가 도는 쳇바퀴 한 대가 정산마다 남기는 돈 */ wheelNet: number;
  cashAfter: number;
  /** 이번 생의 청산 수(이 거래 포함) */ liqs: number;
  /** 잇따라 딴 수 · 잃은 수 · 본전치기 수(이 거래 포함) */ winStreak: number; lossStreak: number; tinyStreak: number;
  /** 이번 생에 낸 거래 수수료 합 */ feesLife: number;
  /** 이번 생에 이미 나온 반응 */ seen: Record<string, boolean>;
  /** 이 거래에 수수료가 한 푼도 안 들었다(오픈 기념, U-40): 수수료를 말하는 줄은 거짓이 된다 */ feeFree?: boolean;
  /** 이번 생에 한 판에 이자 한 번 치를 번 횟수(이 거래 포함, U-41) */ claimWins?: number;
}
export interface Reaction { key: string; who: Who; lines: string[]; /** true = 컷인 장면, false = 한 줄 알림 */ scene: boolean; /** 이번 생에 한 번만 */ once: boolean }

/** 본전치기: 손익이 다음 청구액의 5%에 못 미친다 */
export const isTiny = (pnl: number, claim: number): boolean => Math.abs(pnl) < Math.max(1, claim) * 0.05;
/** 돈을 "쳇바퀴 한 대가 정산 몇 번 돈 값"으로. 너무 작으면 null("쳇바퀴 백 날 굴리는 것보다 빨라요"를 숫자로 보여 준다) */
export function wheelWorth(amount: number, wheelNet: number): string | null {
  if (wheelNet <= 0) return null;
  const k = Math.abs(amount) / wheelNet;
  if (k < 0.2) return null;
  return `쳇바퀴 한 대 ${k < 10 ? k.toFixed(1) : n(k)}정산치`;
}
const held = (sec: number) => (sec < 60 ? `${Math.max(1, Math.round(sec))}초` : `${Math.round(sec / 60)}분`);

export function tradeReaction(t: TradeEnd, c: TradeCtx): Reaction | null {
  const R = (key: string, who: Who, lines: string[], scene = false, once = true): Reaction | null => (once && c.seen[key] ? null : { key, who, lines, scene, once });
  const claim = Math.max(1, c.claim);
  if (t.liq) {
    return (t.allIn && c.cashAfter < 1000 ? R('liqAllIn', 'boss', ['다 넣으셨군요.', '급하시면 들르세요. 저 아직 사무소에 있어요.'], true) : null)
      // fundedBy = 빌리고 60초 안에 들어간 포지션(엔진이 붙인다): 빌린 때와 건 때 사이를 짚는다
      ?? (t.fundedBy ? R('liqFunded', 'collector', ['빌리고 1분도 안 돼서 거셨네요.', '그 돈 이자는 그대로 나갑니다.'], true) : null)
      ?? (c.liqs === 3 ? R('liq3', 'collector', ['이번이 세 번째네요. 오늘 수금은 예정대로 갑니다.']) : null)
      ?? R('liqFirst', 'boss', [c.feeFree ? '이번 건 수수료도 없었어요. 거셨던 돈이 다 나간 거예요.' : '수수료도 나갔어요. 내역 맨 아래 보세요.'])
      ?? (c.liqs % 2 ? R('liqA', 'collector', ['오늘 수금 시간은 아시죠?'], false, false) : R('liqB', 'boss', ['돈 더 필요하시면 이 번호로 연락 주세요.'], false, false));
  }
  if (t.pnl >= claim * 3) { const r = R('bigWin', 'boss', ['많이 버셨네요. 그중에 얼마쯤 장부에서 지워 드릴까요?'], true); if (r) return r; }
  if (t.pnl >= claim) {
    // 한 판에 이자와 생활비 한 번 치: 이번 생 처음은 장면(추심원, 다로미), 그 뒤로는 번갈아 한 줄
    const first = R('winClaim1', 'collector', [`${josa(n(claim), '은', '는')} 따로 두세요. 그럼 이번 이자랑 생활비는 돼요.`], true);
    if (first) return first;
    const k = c.claimWins ?? 2;
    const pick = k % 3;
    return pick === 2 ? R('winClaim', 'boss', ['오늘 갚으실 거면 제가 아직 사무소에 있어요.'], false, false)
      : pick === 0 ? R('winClaimC', 'collector', [`이번 이자랑 생활비 ${n(claim)}, 다 나왔네요.`], false, false)
      : R('winClaimH', 'hero', [c.wheelNet > 0 ? '바퀴는 아직 한 바퀴도 안 돌았는데.' : '손가락 한 번에 이자 한 번.'], false, false);
  }
  if (t.pnl <= -claim) return R('lossClaim', 'collector', ['그 돈이면 이자랑 생활비 한 번 냈겠네요.'], false, false);
  if (c.tinyStreak >= 3 && c.feesLife >= 1) { const r = R('feeBleed', 'collector', [`지금까지 수수료만 ${josa(n(c.feesLife), '이', '가')} 나갔어요.`]); if (r) return r; }
  if (t.pnl > 0 && t.pnl >= claim * 0.1) { const r = R('firstWin', 'boss', [c.wheelNet > 0 ? '바퀴로 벌 때보다 손맛이 있죠?' : '숫자가 한 번에 바뀌죠? 그게 손맛이에요.']); if (r) return r; }
  if (t.pnl < 0 && -t.pnl >= claim * 0.1) { const r = R('firstLoss', 'collector', ['오늘은 종 칠 때 들를게요.']); if (r) return r; }
  if (c.tinyStreak >= 3 && c.feesLife < 1) { const r = R('flatFree', 'boss', ['세 번이나 사고파셨는데 본전이네요. 지금 수수료 안 받을 때라 다행이죠.']); if (r) return r; }
  if (c.winStreak === 3) return R('win3', 'hero', ['세 번이면 우연은 아니겠지?']);
  if (c.lossStreak === 3) return R('loss3', 'hero', ['손가락이 자꾸 같은 데로 간다.']);
  return null;
}

/** 수익 인증서를 물어볼 만한 이익인가: 다음 청구액의 30% 이상이거나 넣은 돈의 절반 이상을 땄을 때만(잔돈 이익마다 묻지 않는다) */
export const worthCertificate = (pnl: number, margin: number, claim: number): boolean => pnl > 0 && (pnl >= claim * 0.3 || pnl >= margin * 0.5);

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
      // 정산을 넘겨 들고 있는 포지션을 추심원이 흘끗 본다: 크기는 이번 이자에 견준다
      const p = c.posPnl ?? 0, big = Math.abs(p) >= Math.max(1, c.interest) * 0.3;
      line = big ? `이자 ${iv} 받았습니다. 걸어 두신 건 아직 ${p > 0 ? '+' : '−'}${josa(n(p), '이네요', '네요')}.` : rot(c.nth ?? 0, '폰 보고 계세요. 영수증은 여기 둘게요.', '아직 들고 계시네요.', `이자 ${iv} 받았어요.`);
    }
    else line = rot(c.nth ?? 0, `이자 ${iv} 받았어요.`, `여기 영수증이요. 이자 ${iv}.`, `오늘 날짜에 도장 찍었어요. 이자 ${iv}.`);
  }
  return `추심원: ${line}${auto} ${sum}`;
}
