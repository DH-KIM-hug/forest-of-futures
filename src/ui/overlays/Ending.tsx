import { useGame } from '../../store/gameStore';
import { Art } from '../common/Art';
import { heroArt } from '../assets';
import { comma } from '../../engine/util';
import { endingCardModel } from '../vm/records';

/** 엔딩 카드(8.7): 정적 → 붉은 '파산' 도장 → 수집 카드. 귀여운 것은 그림 속 다로미뿐이고 문구와 수치는 꾸미지 않는다. */
export function EndingCard() {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const m = endingCardModel(g);
  if (!m) return null;
  return (
    <div className="ending" role="dialog" aria-label="엔딩 카드">
      <div className="static" aria-hidden="true" />
      <div className="stampbig" aria-hidden="true">파산</div>
      <div className={'ecard fade' + (m.isNew ? ' new' : '')}>
        <div className="ebar" style={{ background: m.color }}><span>{m.no}</span><b>{m.causeLabel}</b>{m.offline && <i>자리를 비운 사이</i>}</div>
        <div className="epic" style={{ background: m.color }}>
          {m.illustration ? <img src={m.illustration} alt="" /> : <><Art id={heroArt('dazed')} className="ehero" alt="" /><p>{m.action}</p></>}
        </div>
        <h1>{m.title}</h1>
        <p className="eline">{m.line}</p>
        <section className="blk" aria-label="마지막 세 장면">
          <h4>마지막 세 장면</h4>
          {m.scenes.length === 0 && <p className="sub2">기록이 없습니다.</p>}
          {m.scenes.map((s, i) => (
            <div key={i} className="sc"><time>{s.when}</time><span>{s.text}</span>{s.amount !== null && <b>{s.amount >= 0 ? '+' : '−'}{comma(Math.abs(s.amount))}</b>}</div>
          ))}
        </section>
        {m.misses.length > 0 && (
          <section className="blk" aria-label="한 끗 차이">
            <h4>한 끗 차이</h4>
            {m.misses.map((x) => <p key={x.id} className="miss">{x.text}</p>)}
          </section>
        )}
        <section className="blk" aria-label="다음 세대에 남는 것">
          <h4>다음 세대에 남는 것</h4>
          {m.next.trait && <p>기질 · {m.next.trait}</p>}
          <p>{m.next.trace}</p>
          {m.next.heirloom && <p>유품 · {m.next.heirloom}</p>}
        </section>
        <p className="estat"><span className={'nb' + (m.isNew ? ' new' : '')}>{m.status}</span> 장부 {m.ledger}</p>
      </div>
      <button className="act fade2" onClick={() => act({ type: 'estateNext' })}>{m.cta}</button>
    </div>
  );
}
