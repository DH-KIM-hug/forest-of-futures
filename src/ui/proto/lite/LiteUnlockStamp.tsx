// 라이트 첫 경험(U-68): 무언가 새로 열리면 거래소 위에 작은 만화 도장 하나(「도토코인, 밤더리움, 멍도토 열림!」).
// 길잡이, 장면, 큰 승리 상자가 걷힌 뒤에 하나씩 뜨고 2.6초 뒤 사라진다(누르면 바로). 시작할 때 한 번, 기록이 없는 옛 기기를 맞춘다.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGame } from '../../../store/gameStore';
import { useProto } from '../protoStore';
import { marketById } from '../../../engine/data';
import { lifeNo } from '../model';
import { play } from '../audio';
import { GIcon } from '../icons';
import { liteUnlockBoot, shiftStamp, unlockStamp, useLiteUnlock, type LiteStep } from './liteUnlock';
import './liteUnlock.css';

const STAMP_MS = 2600;

export function LiteUnlockStamp() {
  const head = useLiteUnlock((s) => s.queue[0] ?? null);
  const busy = useProto((s) => s.flyTut === 'run' || s.prologue || s.scenes.length > 0 || !!s.burst);
  const [on, setOn] = useState<LiteStep | null>(null);
  useEffect(() => { liteUnlockBoot({ life: lifeNo(useGame.getState().g), closes: useProto.getState().closes }); }, []);
  useEffect(() => {
    if (!head || busy || on) return;
    const t0 = window.setTimeout(() => { setOn(head); shiftStamp(); play('paw_stamp'); }, 700);
    return () => window.clearTimeout(t0);
  }, [head, busy, on]);
  useEffect(() => {
    if (!on) return;
    const t = window.setTimeout(() => setOn(null), STAMP_MS);
    return () => window.clearTimeout(t);
  }, [on]);
  const root = typeof document !== 'undefined' ? document.querySelector('.pr') : null;
  if (!on || !root) return null;
  const tx = unlockStamp(on, (id) => marketById[id]?.short ?? marketById[id]?.name ?? id);
  return createPortal(
    <div className="lu-stamp" data-lite-unlock={on.id} role="status" onClick={() => setOn(null)}>
      <GIcon name="unlock" size={30} />
      <span><b>{tx.big}</b><small>{tx.small}</small></span>
    </div>,
    root,
  );
}
