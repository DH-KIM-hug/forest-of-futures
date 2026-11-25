import { useGame } from '../../store/gameStore';
import { comma } from '../../engine/util';
import { hudModel, pctStr, short, signed, tickerNotice } from '../vm/village';
import { legacy } from '../../engine/data';
import { useUI } from '../uiStore';

const sizeCls = (s: string, a: number, b: number) => (s.length > b ? ' xs' : s.length > a ? ' sm' : '');

/** 장면 위에 떠 있는 알약: 첫 줄 현금·정산, 둘째 줄 지갑·빚·가훈. */
export function Hud() {
  const g = useGame((s) => s.g);
  const setSheet = useUI((s) => s.open);
  const setOverlay = useUI((s) => s.setOverlay);
  const m = hudModel(g);
  const cashS = comma(m.cash);
  const C = 2 * Math.PI * 17;
  const prog = Math.max(0, Math.min(1, (m.settle.total - m.settle.left) / m.settle.total));
  const down = m.wallet.pct < 0;
  return (
    <>
      <div className="pills" role="status" aria-label="상태 표시">
        <div className="pill cash">
          <img className="ic" src="/ui/icons/acorn.webp" alt="" draggable={false} />
          <span className={'big' + sizeCls(cashS, 8, 11)} aria-label={`현금 ${cashS} 도토리`}>{cashS}</span>
          <span className={'sub2' + (m.net < 0 ? ' neg' : '')}>순자산 {m.net < 0 ? '−' : ''}{comma(Math.abs(m.net))}</span>
        </div>
        <div className={'pill timer' + (m.settle.warn ? ' warn' : '') + (m.settle.surplus ? ' plus' : '')} aria-label={`다음 정산까지 ${m.settle.left}초`}>
          <svg className="ring" viewBox="0 0 42 42" aria-hidden="true">
            <circle className="bg" cx="21" cy="21" r="17" />
            <circle className="fg" cx="21" cy="21" r="17" transform="rotate(-90 21 21)" strokeDasharray={C} strokeDashoffset={C * (1 - prog)} />
          </svg>
          <img className="bell" src="/ui/icons/bell.webp" alt="" draggable={false} />
          <span className="big">{m.settle.left}초</span>
          <span className={'sub2' + (m.settle.lack ? ' lack' : '')} title="캔 값 / 전기세 / 이자·생활비">
            {m.settle.mined > 0 ? `+${short(m.settle.mined)}` : '+0'} / −{short(m.settle.out)}{m.settle.lack ? ' 부족' : ''}
          </span>
        </div>
      </div>
      <div className="pills sub">
        {m.wallet.show && (
          <button className="pill wallet" onClick={() => setSheet({ k: 'work', tab: 'wallet' })} aria-label={`지갑 ${comma(m.wallet.value)} ${pctStr(m.wallet.pct)} 일터 패널 열기`}>
            <span className="mid sm">지갑 {comma(m.wallet.value)}</span>
            <span className={'sub2 ' + (down ? 'down' : 'up')}>{pctStr(m.wallet.pct)} <i>세대 시작 대비</i></span>
          </button>
        )}
        <div className="pill debt">
          <img className="ic" src="/ui/icons/debt.webp" alt="" draggable={false} />
          <span className="mid sm" aria-label={`빚 ${comma(m.debt.total)}`}>빚 {short(m.debt.total)}</span>
          {m.debt.overdue && (
            <span className="od-sticker" aria-hidden="true">
              <img src="/ui/icons/overdue.webp" alt="" />
              <b>연체</b>
            </span>
          )}
        </div>
        <button className="pill han" onClick={() => setOverlay('tree')} aria-label={`${legacy.currency.name} ${m.han}. 가문 특성 열기`}>
          <span className="mid sm">{legacy.currency.name} {m.han}</span>
        </button>
      </div>
      {(m.debt.inherited || m.debt.garnish) && (
        <div className="strip">
          {m.debt.inherited && <span className="tagi">물려받은 빚</span>}
          {m.debt.garnish && <span className="tagi gar">수입 {m.debt.garnish.pct}% 가압류 중</span>}
        </div>
      )}
    </>
  );
}

const KIND: Record<string, string> = { wire: '속보', settle: '정산', warn: '경고', bubble: '말', info: '알림' };

export function Ticker() {
  const run = useGame((s) => s.g.run);
  const n = tickerNotice(run);
  return (
    <div aria-live="polite" style={{ display: 'contents' }}>
      {n && (
        <div className={'ticker k-' + n.kind} key={n.id + n.tick}>
          <img src="/ui/icons/news.webp" alt="" />
          <em>{KIND[n.kind] ?? ''}</em>
          <span>{n.text}</span>
        </div>
      )}
    </div>
  );
}
export { signed };
