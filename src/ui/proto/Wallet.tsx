// 콜드월렛 시트: 캔 코인이 쌓이는 곳. 팔면 도토리, '캐면 바로 팔기'를 켜 두면 캘 때마다 도토리로 바뀐다.
import { useRef } from 'react';
import { useGame } from '../../store/gameStore';
import { useProto } from './protoStore';
import { ownedCoins, price, refPrice, walletValue, walletValueOf } from '../../engine/selectors';
import { sellFeeRate } from '../../engine/mining';
import { wheelByCoin } from '../../engine/data';
import { comma } from '../../engine/util';
import { Acorn } from './art';
import { coinSvg, flyAcorns } from './fx';
import { play } from './audio';
import { say } from './watch';
import type { CoinId } from '../../engine/types';

const pct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`;
const qtyTxt = (q: number) => q.toLocaleString('ko-KR', { maximumFractionDigits: q >= 100 ? 1 : q >= 1 ? 2 : 4 });

export function WalletSheet() {
  const open = useProto((s) => s.wallet);
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const root = useRef<HTMLDivElement>(null);
  if (!open) return null;
  const run = g.run;
  const coins = ownedCoins(run);
  const fee = sellFeeRate(run);
  const close = () => useProto.getState().patch({ wallet: false });
  const sell = (coin: CoinId, part: 'all' | 'half', el: HTMLElement) => {
    const r = act({ type: 'sell', coin, part });
    if (!r.ok) { say('팔 코인이 없다'); return; }
    play('close_profit');
    flyAcorns(el.getBoundingClientRect(), 4);
  };
  return (
    <div ref={root} className="pr-wal-back" onClick={close}>
      <section className="pr-wal" role="dialog" aria-label="콜드월렛" onClick={(e) => e.stopPropagation()}>
        <div className="wtop">
          <div className="ttl"><b>콜드월렛</b><span>캔 코인이 쌓이는 곳</span></div>
          <button className="x" onClick={close} aria-label="닫기">✕</button>
        </div>
        <div className="sum"><small>지갑 전체</small><b>{comma(Math.round(walletValue(run)))}</b><Acorn size={22} /></div>
        {coins.length === 0 && <p className="none">아직 쳇바퀴가 없다.</p>}
        {coins.map((c) => {
          const w = run.wallet[c];
          const qty = w?.qty ?? 0;
          const val = walletValueOf(run, c);
          const ch = price(run, c) / refPrice(run, c) - 1;
          const auto = run.coinWheels[c].autoSell;
          const half = Math.floor((val / 2) * (1 - fee));
          const all = Math.floor(val * (1 - fee));
          return (
            <div key={c} className="wcoin">
              <div className="hd">
                <i className="ic" dangerouslySetInnerHTML={{ __html: coinSvg(30) }} />
                <div className="nm"><b>{wheelByCoin[c].name.replace(' 쳇바퀴', '')}</b><span>{qtyTxt(qty)} 개</span></div>
                <div className="vl"><b>{comma(Math.round(val))}<Acorn size={16} /></b><span className={ch >= 0 ? 'up' : 'dn'}>시작가 대비 {pct(ch)}</span></div>
              </div>
              <div className="btns">
                <button className="sb2" disabled={qty <= 0} onClick={(e) => sell(c, 'half', e.currentTarget)}><span>반 팔기</span><small>+{comma(half)}</small></button>
                <button className="sb2 on" disabled={qty <= 0} onClick={(e) => sell(c, 'all', e.currentTarget)}><span>다 팔기</span><small>+{comma(all)}</small></button>
              </div>
              <button className={'auto' + (auto ? ' on' : '')} role="switch" aria-checked={auto} onClick={() => act({ type: 'autoSell', coin: c, on: !auto })}>
                <span className="tg"><i /></span>
                <span className="tx"><b>캐면 바로 팔기</b><small>{auto ? '켜짐 · 캘 때마다 도토리로' : '꺼짐 · 코인으로 모아 둔다'}</small></span>
              </button>
            </div>
          );
        })}
        <p className="fee">팔 때 수수료 {(fee * 100).toFixed(1)}% 가 붙는다</p>
      </section>
    </div>
  );
}
