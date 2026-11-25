// 전체 화면 겹침: 자리를 비운 사이 > 엔딩·상속 > 기록관·전광판·가문 트리.
import { useGame } from '../../store/gameStore';
import { useUI } from '../uiStore';
import { AwayOverlay } from './Away';

export function Overlays() {
  const away = useGame((s) => s.net.away);
  const awayAt = useUI((s) => s.awayAt);
  const dismissed = useUI((s) => s.awayDismissed);
  if (away && awayAt > dismissed) return <AwayOverlay />;
  return null;
}
