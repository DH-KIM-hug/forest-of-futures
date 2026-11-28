// 라이트 모드의 만화 시퀀스 줄(빚의 유혹 등). 저장하지 않는다. 떠 있는 동안 게임 시계를 멈춘다(읽는 사이 정산이 지나가지 않게).
import { create } from 'zustand';
import { useGame } from '../../../store/gameStore';
import type { Panel } from './manga';

export interface Seq { k: number; id: string; label: string; panels: Panel[]; onEnd?: () => void; /** 마지막 쪽에 찍는 단추(예: 환생하기). 없으면 「눌러서 닫기」 */ endBtn?: string }
interface S { seq: Seq | null; queue: Seq[]; speedBefore: number | null }
export const useLite = create<S>(() => ({ seq: null, queue: [], speedBefore: null }));

let k = 0;
export function pushSeq(s: Omit<Seq, 'k'>): void {
  const full = { ...s, k: ++k };
  const st = useLite.getState();
  if (st.seq) { useLite.setState({ queue: [...st.queue, full] }); return; }
  const sp = useGame.getState().speed;
  useGame.getState().setSpeed(0);
  useLite.setState({ seq: full, speedBefore: sp });
}
export function endSeq(): void {
  const st = useLite.getState();
  const done = st.seq;
  const [nx, ...rest] = st.queue;
  if (nx) useLite.setState({ seq: nx, queue: rest });
  else { useLite.setState({ seq: null, queue: [] }); useGame.getState().setSpeed(st.speedBefore ?? 1); }
  done?.onEnd?.();
}
