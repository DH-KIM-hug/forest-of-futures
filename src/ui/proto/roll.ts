// 쳇바퀴 굴리기 한 번(엔진의 tap 행동 그대로)을 집 화면과 거래소의 포지션 카드가 같이 쓴다(U-42, 회차 5).
// 포지션을 들고 있는 동안 굴려 번 돈은 따로 센다 — 기다리는 동안 손이 한 일이 숫자로 남는다(정산 낼 돈은 거기서 나온다).
import { useGame } from '../../store/gameStore';
import { useProto } from './protoStore';
import { ownedCoins, stage } from '../../engine/selectors';
import { rollTarget } from '../../engine/mining';
import { tapValue } from '../../engine/equipment';

export interface Roll { ok: boolean; /** nowheel = 쳇바퀴가 없다 · rate = 이번 초에 더 못 굴린다 · staffed = 쳇바퀴마다 알바가 돈다(주인공이 굴릴 빈 쳇바퀴가 없다, U-43) */ why?: 'nowheel' | 'rate' | 'staffed'; /** 손에 들어온 도토리(바로 팔기) */ gain: number; /** 캔 코인의 값 */ worth: number; sold: boolean }
/** 포지션을 든 채 굴려 번 돈을 세는 열쇠: 가장 먼저 연 포지션의 틱. 포지션이 없으면 null */
export function holdKey(): number | null {
  const ps = Object.values(useGame.getState().g.run.positions);
  return ps.length ? Math.min(...ps.map((p) => p.openTick)) : null;
}
export function rollWheel(): Roll {
  const st = useGame.getState();
  const g0 = st.g;
  const coin0 = g0.run.riding ?? ownedCoins(g0.run)[0];
  if (!(stage(g0.run) > 0 && !!coin0)) return { ok: false, why: 'nowheel', gain: 0, worth: 0, sold: false };
  if (rollTarget(g0.run) === null) return { ok: false, why: 'staffed', gain: 0, worth: 0, sold: false };
  const before = g0.run.cash;
  const worth = Math.round(tapValue(g0, coin0));
  const r = st.act({ type: 'tap' });
  if (!r.ok) return { ok: false, why: 'rate', gain: 0, worth, sold: false };
  const gain = useGame.getState().g.run.cash - before;
  const sold = !!g0.run.coinWheels[coin0]?.autoSell;
  const key = holdKey();
  if (key !== null) {
    const P = useProto.getState();
    const same = P.rolledKey === key;
    P.patch({ rolledKey: key, rolled: (same ? P.rolled : 0) + (sold ? gain : worth), rolledTaps: (same ? P.rolledTaps : 0) + 1 });
  }
  return { ok: true, gain, worth, sold };
}
/** 이 포지션(들)을 들고 있는 동안 굴려 번 돈. 열쇠가 다르면(지난 판의 것) 0 */
export const rolledFor = (key: number | null): number => { const P = useProto.getState(); return key !== null && P.rolledKey === key ? P.rolled : 0; };
/** 주인공이 지금 굴릴 수 있는 쳇바퀴가 있는가(알바가 없는 쳇바퀴) */
export const canRoll = (): boolean => rollTarget(useGame.getState().g.run) !== null;

/** 알바가 쳇바퀴를 다 돌리는데 세상을 눌렀다(U-43 사용자: "알바 고용하면 그때부터 탭은 안 되어야 하는데 되네?"): 버는 것은 없다.
 *  이번 생에 처음이면 주인공이 속으로 한 줄 하고 거래소 탭을 가리킨다. 그 뒤로는 거래소 탭만 잠깐 가리킨다. */
export const STAFFED_THINK = '아, 내릴 필요 없어. 내가 비켜 줄게.';
let pointTimer: number | undefined, thinkTimer: number | undefined;
export function staffedTap(): void {
  const P = useProto.getState();
  const phone = useGame.getState().g.run.futures.open;
  if (!P.seen.staffedTap) {
    P.patch({ think: { text: STAFFED_THINK, k: Date.now() }, seen: { ...P.seen, staffedTap: true } });
    window.clearTimeout(thinkTimer);
    thinkTimer = window.setTimeout(() => { if (useProto.getState().think?.text === STAFFED_THINK) useProto.getState().patch({ think: null }); }, 5200);
  }
  if (!phone) return;
  useProto.getState().patch({ pointTab: 'phone' });
  window.clearTimeout(pointTimer);
  pointTimer = window.setTimeout(() => { if (!useProto.getState().forceTrade) useProto.getState().patch({ pointTab: null }); }, P.seen.staffedTap ? 1600 : 5200);
}

/** 중고폰이 울린 뒤(U-43) 다른 데를 누르면 나오는 한 줄 */
export const FORCE_NUDGE = '폰에 도토코인 값이 떠 있다. FRX 앱부터 열어 보자.';
