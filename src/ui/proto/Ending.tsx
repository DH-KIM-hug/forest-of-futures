import { useEffect } from 'react';
import { useGame } from '../../store/gameStore';
import { endingCardModel } from '../vm/records';
import { comma } from '../../engine/util';
import { lifeNo } from './model';
import { rebirthOverride } from './dev';
import { Room, Wheel, C } from './art';
import heroSit from './img/hero_sit.png';
import heroFront from './img/hero_front.png';

/** 폴라로이드 속 마지막 사진: 색을 뺀 빈 오두막(§10.3 엔딩은 색을 뺀다). 주인공은 앉아서 폰을 본다. */
function Photo() {
  return (
    <svg className="photo" viewBox="0 0 300 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="300" height="220" fill="#8D8A84" />
      <Room cx={150} cy={236} hw={170} h={120} wall="#D9B98A" floor="#E3C9A0" />
      <g opacity={0.55}><Wheel cx={206} cy={176} w={56} col={C.dtc} /></g>
      <image href={heroSit} x={98} y={128} width={74} height={67} />
    </svg>
  );
}

/** 엔딩 카드 → 환생(상속포기 갈래 자동) → 다음 생. 가훈 값은 엔진 값(황금 실물 도토코인으로 표기). */
export function EndingFlow() {
  const g = useGame((s) => s.g);
  const act = useGame((s) => s.act);
  const e = g.estate;
  useEffect(() => {
    // 명세서 단계에서 꺼졌다 켜진 경우: 가장 단순한 길(상속포기)로 자동 진행
    if (e && e.step === 'statement') act({ type: 'inherit', branch: 'renounce' });
  }, [e?.step]);
  if (!e) return null;
  if (e.step === 'card') {
    const m = endingCardModel(g);
    if (!m) return null;
    return (
      <div className="pr-end" role="dialog" aria-label="엔딩">
        <figure className="polaroid">
          <Photo />
          <figcaption>{m.title}</figcaption>
          <div className="stamp" aria-label="파산">파산</div>
        </figure>
        <div className="card">
          <div className="cause" style={{ background: m.color }}>{m.no} · {m.causeLabel}</div>
          <p className="line">{m.line}</p>
          <div className="blk"><h4>마지막 세 장면</h4>
            {m.scenes.length === 0 && <p className="sub">기록이 없습니다.</p>}
            {m.scenes.map((s, i) => <div key={i} className="sc"><span>{s.text}</span>{s.amount !== null && <b className={s.amount >= 0 ? 'up' : 'dn'}>{s.amount >= 0 ? '+' : '−'}{comma(Math.abs(s.amount))}</b>}</div>)}
          </div>
          <p className="sub">{m.status} · 장부 {m.ledger}</p>
        </div>
        <button className="go" data-rebirth onClick={() => act({ type: 'estateNext' })}>환생하기</button>
      </div>
    );
  }
  if (e.step === 'statement') return <div className="pr-end"><p className="sub">…</p></div>;
  const total = g.family.han + g.family.hanSpent;
  return (
    <div className="pr-end re" role="dialog" aria-label="환생">
      <div className="re-hero"><div className="sun" aria-hidden="true" /><img src={heroFront} alt="" width={96} height={93} /></div>
      <div className="card">
        <h2>다시 눈을 뜬다</h2>
        <p className="line">폰 고리의 리본이 빛난다. 눈을 뜨면 다시 그 오두막, 그날이다.<br />엄마의 빚 30만도, 빈 주머니도, 쳇바퀴 하나도 그대로다.</p>
        <div className="award"><i className="coin" aria-hidden="true" /><span>황금 실물 도토코인</span><b>+{comma(e.award)}</b></div>
        <div className="stats">
          <div><small>누적</small><b>{comma(total)}개</b></div>
          <div><small>지나간 생</small><b>{lifeNo(g)}번</b></div>
          {e.calc && <div><small>최고 순자산</small><b>{comma(Math.round(e.calc.peak))}</b></div>}
          {e.calc && <div><small>누적 채굴</small><b>{comma(Math.round(e.calc.mined))}</b></div>}
        </div>
        {e.maxim && <p className="maxim">「{e.maxim}」</p>}
      </div>
      <button className="go" data-next-life onClick={() => { if (act({ type: 'nextGeneration' }).ok) rebirthOverride(); }}>{lifeNo(g) + 1}번째 생 시작</button>
    </div>
  );
}
