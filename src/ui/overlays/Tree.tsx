import { useGame } from '../../store/gameStore';
import { treeModel } from '../vm/records';
import { comma } from '../../engine/util';

/** 가문 특성 트리: 가진 가훈, 줄마다 단계·값·사기, 살 수 있는 줄에 초록 점. */
export function TreeView({ onNext, onClose }: { onNext?: () => void; onClose?: () => void }) {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const m = treeModel(g);
  return (
    <div className="tree">
      <div className="thead">
        <span className="stat">가진 {m.name} <b>{comma(m.han)}</b></span>
        <span className="sub">쓴 {comma(m.spent)}</span>
      </div>
      <div className="list">
        {m.rows.map((t) => (
          <div key={t.id} className="item row sb">
            <span className="nm">{t.name}<span className="sub block">{t.level}/{t.max}단계 · {t.seenAs}</span></span>
            <span className="inl">
              {t.canBuy && <i className="dot" aria-label="살 수 있습니다" />}
              <button className={t.canBuy ? 'act' : ''} disabled={!t.canBuy} onClick={() => act({ type: 'buyTree', id: t.id })}>{t.cost === null ? '최고' : comma(t.cost)}</button>
            </span>
          </div>
        ))}
      </div>
      {onNext && <button className="act wide" onClick={onNext}>다음 세대 시작</button>}
      {onClose && <button className="wide" onClick={onClose}>닫기</button>}
    </div>
  );
}
