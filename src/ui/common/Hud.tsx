import { useGame } from '../../store/gameStore';
import { netWorth, totalDebt, nextOutflow } from '../../engine/selectors';
import { balance } from '../../engine/data';
import { fmt } from './format';

const sizeCls = (s: string, a: number, b: number) => (s.length > b ? ' xs' : s.length > a ? ' sm' : '');

/** 장면 위에 떠 있는 알약 3개(현금·빚·정산) + 내용이 있을 때만 내려오는 속보 띠. */
export function Hud() {
  const g = useGame((s) => s.g);
  const run = g.run;
  const net = netWorth(run);
  const out = nextOutflow(run);
  const total = balance.settlement.intervalSec as number;
  const left = run.settleIn;
  const warn = left <= balance.settlement.warnAtSec;
  const cashS = fmt(run.cash);
  const debtS = fmt(totalDebt(run));
  const lack = run.cash < out;
  const C = 2 * Math.PI * 17;
  const prog = Math.max(0, Math.min(1, (total - left) / total));
  const od = Object.values(run.streak).some((x) => x > 0);
  return (
    <div className="pills" role="status" aria-label="상태 표시">
      <div className="pill cash">
        <img className="ic" src="/ui/icons/acorn.webp" alt="" draggable={false} />
        <span className={'big' + sizeCls(cashS, 8, 11)} aria-label={`현금 ${cashS} 도토리`}>{cashS}</span>
        <span className={'sub2' + (net < 0 ? ' neg' : '')}>순자산 {fmt(net)}</span>
      </div>
      <div className="pill debt">
        <img className="ic" src="/ui/icons/debt.webp" alt="" draggable={false} />
        <span className={'mid' + sizeCls(debtS, 8, 11)} aria-label={`빚 ${debtS}`}>빚 {debtS}</span>
        {od && (
          <span className="od-sticker" aria-hidden="true">
            <img src="/ui/icons/overdue.webp" alt="" />
            <b>연체</b>
          </span>
        )}
      </div>
      <div className={'pill timer' + (warn ? ' warn' : '')} aria-label={`다음 정산까지 ${left}초`}>
        <svg className="ring" viewBox="0 0 42 42" aria-hidden="true">
          <circle className="bg" cx="21" cy="21" r="17" />
          <circle className="fg" cx="21" cy="21" r="17" transform="rotate(-90 21 21)" strokeDasharray={C} strokeDashoffset={C * (1 - prog)} />
        </svg>
        <img className="bell" src="/ui/icons/bell.webp" alt="" draggable={false} />
        <span className="big">{left}초</span>
        <span className={'sub2' + (lack ? ' lack' : '')}>-{fmt(out)}{lack ? ' 부족' : ''}</span>
      </div>
    </div>
  );
}

const KIND: Record<string, string> = { news: '속보', settle: '정산', warn: '경고' };

export function Ticker() {
  const run = useGame((s) => s.g.run);
  const saveFailed = useGame((s) => s.ui.saveFailed);
  const t = run.ticker;
  const show = t && run.tick - t.tick < 14;
  return (
    <div aria-live="polite" style={{ display: 'contents' }}>
      {saveFailed && (
        <div className="ticker warn"><img src="/ui/icons/news.webp" alt="" /><span>저장하지 못했습니다. 저장 공간을 확인하세요.</span></div>
      )}
      {show && (
        <div className={'ticker k-' + t!.kind} data-kind={KIND[t!.kind] ?? ''}>
          <img src="/ui/icons/news.webp" alt="" />
          <span>{t!.text}</span>
        </div>
      )}
    </div>
  );
}
