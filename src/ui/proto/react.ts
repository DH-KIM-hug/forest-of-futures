// 세상이 내가 한 일에 반응한다(U-38): 끝난 거래 하나, 정산 한 번을 보고 누가 무슨 말을 할지 고른다.
// 순수 함수다(엔진·저장소를 부르지 않는다). 숫자는 전부 부르는 쪽이 엔진 값으로 채운다. 말투: 추심원 "~요오", 오소리 대부 웃으며 무서운 존댓말, 주인공은 속마음 한 줄.
import type { Who } from './protoStore';

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
    return (t.allIn && c.cashAfter < 1000 ? R('liqAllIn', 'boss', ['전부 거셨군요. 전부 가져갔습니다.', '돈이 필요하시면 사무소는 늘 열려 있습니다.'], true) : null)
      ?? (t.fundedBy ? R('liqFunded', 'collector', [`빌린 돈이 ${held(t.heldSec)} 만에 거래소로 갔네요오.`, '이자는 그대로예요오.'], true) : null)
      ?? (c.liqs === 3 ? R('liq3', 'collector', ['청산 세 번째네요오. 장부엔 안 적어요오. 그냥 세어 봤어요오.']) : null)
      ?? R('liqFirst', 'boss', [c.feeFree ? '청산이네요. 수수료는 공짜였는데, 증거금은 거래소가 가져갔고요.' : '청산이네요. 거래소는 수수료를 벌었고요.'])
      ?? (c.liqs % 2 ? R('liqA', 'collector', ['또 사라졌네요오. 이자는 안 사라져요오.'], false, false) : R('liqB', 'boss', ['다음엔 맞히시겠죠. 다들 그렇게 말해요.'], false, false));
  }
  if (t.pnl >= claim * 3) { const r = R('bigWin', 'boss', ['크게 따셨네요. 축하드립니다.', '갚으러 오실 거죠? 다들 그 돈으로 한 번 더 걸더라고요.'], true); if (r) return r; }
  if (t.pnl >= claim) { const w = wheelWorth(t.pnl, c.wheelNet); return R('winClaim', 'boss', [`이자 한 번 치를 버셨네요.${w ? ` ${w}입니다.` : ''}`], false, false); }
  if (t.pnl <= -claim) return R('lossClaim', 'collector', ['이자 한 번 치를 잃으셨네요오. 저는 그래도 제때 와요오.'], false, false);
  if (c.tinyStreak >= 3 && c.feesLife >= 1) { const r = R('feeBleed', 'collector', [`수수료만 ${n(c.feesLife)} 내셨어요오. 거래소가 좋아해요오.`]); if (r) return r; }
  if (t.pnl > 0 && t.pnl >= claim * 0.1) { const r = R('firstWin', 'boss', ['거 보세요. 쳇바퀴보다 빠르죠?']); if (r) return r; }
  if (t.pnl < 0 && -t.pnl >= claim * 0.1) { const r = R('firstLoss', 'collector', ['…그냥 지나가다 들렀어요오.']); if (r) return r; }
  if (c.tinyStreak >= 3 && c.feesLife < 1) { const r = R('flatFree', 'boss', ['세 판째 본전이시네요. 수수료가 공짜라 저도 드릴 말씀이 없습니다. 안 움직이는 코인에 거셨어요.']); if (r) return r; }
  if (c.winStreak === 3) return R('win3', 'hero', ['…감 잡았다. 이번엔 진짜다.']);
  if (c.lossStreak === 3) return R('loss3', 'hero', ['…다음엔 딴다. 다음엔.']);
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
}
const rot = (nth: number, ...v: string[]): string => v[((nth % v.length) + v.length) % v.length];
/** 정산 알림 한 줄. 추심원은 오소리 대부의 이자만 걷는다. 다른 곳 이자는 자동이체로 적는다. */
export function settleRemark(c: SettleCtx): string {
  const sum = `(내 정산 ${c.net >= 0 ? '+' : '−'}${n(c.net)})`;
  const auto = c.other > 0 ? ` 다른 곳 이자 ${n(c.other)}은 자동이체.` : '';
  if (c.interest <= 0) return c.other > 0 ? `[자동이체] 이자 ${n(c.other)} 출금${c.overdue ? ' 실패 · 연체' : ''}. ${sum}` : `땡! 정산 ${sum}`;
  const iv = n(c.interest);
  let line: string;
  if (c.overdue) line = `이자 ${iv}… 모자라네요오.`;
  else {
    const runway = c.nextNet < 0 ? Math.floor(c.cashAfter / -c.nextNet) : null;
    if (runway !== null && runway <= 0) line = `이자 ${iv} 수금 완료요오. 다음엔 모자라겠네요오.`;
    else if (runway !== null && runway <= 3) line = `이자 ${iv} 수금 완료요오. 이대로면 ${runway}번 뒤에 바닥이에요오.`;
    else if (c.firstPositive) line = `이자 ${iv} 수금 완료요오. 남기 시작했네요오. 원금에 쓰셔도 돼요오.`;
    else if (c.negStreak === 3) line = `이자 ${iv} 수금 완료요오. 세 번째 적자네요오. 제 일은 아니지만요오.`;
    else if (c.posOpen) {
      // 정산을 넘겨 들고 있는 포지션을 추심원이 흘끗 본다(U-39 ①): 크기는 이번 이자에 견준다
      const p = c.posPnl ?? 0, big = Math.abs(p) >= Math.max(1, c.interest) * 0.3;
      line = `이자 ${iv} 수금 완료요오. ${big && p > 0 ? `폰에 +${n(p)}이 떠 있네요오. 아직 도토리는 아니에요오.` : big && p < 0 ? `폰에 −${n(p)}이 떠 있네요오. 저는 못 본 걸로 할게요오.` : rot(c.nth ?? 0, '거래 중이시네요오. 이자는 이자대로 가요오.', '폰 보고 계시네요오. 저는 장부만 봐요오.', '아직 들고 계시네요오. 저는 다음에 또 와요오.')}`;
    }
    else line = rot(c.nth ?? 0, `이자 ${iv} 수금 완료요오.`, `이자 ${iv}, 잘 받았어요오.`, `이자 ${iv} 수금 완료요오. 쳇바퀴 소리가 좋네요오.`, `이자 ${iv}, 장부에 적었어요오.`);
  }
  return `추심원: ${line}${auto} ${sum}`;
}
