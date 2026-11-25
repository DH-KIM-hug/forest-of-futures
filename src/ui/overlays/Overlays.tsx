// 전체 화면 겹침(위가 우선): 프롤로그 > 자리를 비운 사이 > 엔딩·상속(저장되므로 어디서 꺼도 이어진다, AC-v2-148) > 기록관·전광판·가문 특성.
import { useGame } from '../../store/gameStore';
import { useUI } from '../uiStore';
import { AwayOverlay } from './Away';
import { EndingCard } from './Ending';
import { EstateScreen } from './Estate';
import { ArchiveScreen } from './Archive';
import { BoardScreen } from './Board';
import { TreeView } from './Tree';
import { PrologueScreen } from './Prologue';
import { overlayRoute } from '../vm/records';

export function Overlays() {
  const g = useGame((s) => s.g);
  const away = useGame((s) => s.net.away);
  const awayAt = useUI((s) => s.awayAt);
  const dismissed = useUI((s) => s.awayDismissed);
  const overlay = useUI((s) => s.overlay);
  const setOverlay = useUI((s) => s.setOverlay);
  const prologue = useUI((s) => s.prologue);
  const r = overlayRoute(g, { prologue, away: !!away && awayAt > dismissed, overlay });
  if (r === 'prologue') return <PrologueScreen />;
  if (r === 'away') return <AwayOverlay />;
  if (r === 'ending') return <EndingCard />;
  if (r === 'estate') return <EstateScreen />;
  if (r === 'archive') return <ArchiveScreen />;
  if (r === 'board') return <BoardScreen />;
  if (r === 'tree') {
    return (
      <div className="full" role="dialog" aria-label="가문 특성">
        <header><button className="back" onClick={() => setOverlay(null)} aria-label="닫기"><img src="/ui/icons/back.webp" alt="" />닫기</button><h2>가문 특성</h2></header>
        <div className="scroll"><TreeView /></div>
      </div>
    );
  }
  return null;
}
