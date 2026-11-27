// 가진 돈(도토리) 숫자가 "촤르르" 굴러 올라간다(U-43 사용자: "내 가진 돈이 촤르르 올라가는 시각화").
// 엔진에 없는 숫자는 보여 주지 않는다: 지금 보이는 값에서 엔진의 값으로 굴러갈 뿐이다. 엔진은 캐는 돈을 틱(1초)마다 넣고, 화면은 그 사이를 0.1초 걸음으로 잇는다.
//   - 조금씩 들어오는 돈(알바): 1초에 열 걸음으로 고르게 오른다
//   - 한꺼번에 들어오는 돈(익절 · 대출 · 코인 판 돈): 더 빨리, 더 크게 구른다(자릿수마다 구르는 숫자 + 반짝)
//   - 나가는 돈(정산 · 손실): 붉게, 아래로 구른다. 소리는 더 무겁다
//   - 동작 줄이기: 구르지 않고 바로 바뀐다
import { useEffect, useRef, useState } from 'react';
import { comma } from '../../engine/util';
import { play } from './audio';
import { reduced } from './fx';

/** 한 걸음(ms). 0.1초마다 숫자가 바뀐다 */
export const ROLL_STEP_MS = 100;
/** 지금 값 cur 에서 목표 to 로 가는 다음 걸음의 값. left = 남은 걸음 수(작은 변화는 1초 = 10걸음, 큰 변화는 더 많은 걸음을 빨리) */
export function rollNext(cur: number, to: number, left: number): number {
  if (cur === to || left <= 1) return to;
  const d = (to - cur) / left;
  const step = d > 0 ? Math.max(1, Math.round(d)) : Math.min(-1, Math.round(d));
  const nx = cur + step;
  return d > 0 ? Math.min(to, nx) : Math.max(to, nx);
}
/** 변화의 크기에 따른 걸음 수: 조금(알바의 1초어치) = 10걸음(1초), 크게 = 14~22걸음(1.4~2.2초 — 큰돈은 길게 구른다) */
export const rollSteps = (diff: number, trickle: number): number => {
  const a = Math.abs(diff);
  if (a <= Math.max(3, trickle * 2.5)) return 10;
  return a < 5_000 ? 14 : a < 50_000 ? 18 : 22;
};

/** 숫자 한 자리: 0~9 가 세로로 놓인 띠를 그 숫자만큼 밀어 올린다(CSS 가 굴린다) */
function Digit({ d }: { d: number }) {
  return <span className="od-d" aria-hidden="true"><i style={{ transform: `translateY(${-d * 10}%)` }}>0<br />1<br />2<br />3<br />4<br />5<br />6<br />7<br />8<br />9</i></span>;
}

export function Money({ value, perSec }: { value: number; /** 지금 초당 들어오는 돈(조금씩 들어오는 변화를 가르는 데 쓴다) */ perSec: number }) {
  const target = Math.floor(value);
  const [shown, setShown] = useState(target);
  const cur = useRef(target), to = useRef(target), left = useRef(0), dir = useRef<'up' | 'down' | null>(null);
  const [fx, setFx] = useState<{ k: number; kind: 'up' | 'down' | 'big' } | null>(null);
  const lastTick = useRef(0);
  useEffect(() => {
    if (target === to.current) return;
    const diff = target - cur.current;
    to.current = target;
    if (reduced()) { cur.current = target; setShown(target); return; }
    const trickle = Math.max(1, Math.abs(perSec));
    left.current = rollSteps(diff, trickle);
    dir.current = diff > 0 ? 'up' : 'down';
    const big = Math.abs(diff) > Math.max(3, trickle * 2.5);
    if (big) setFx((f) => ({ k: (f?.k ?? 0) + 1, kind: diff < 0 ? 'down' : Math.abs(diff) >= 5_000 ? 'big' : 'up' }));
    if (big && diff < 0) play('buy', { vol: 0.22, rate: 0.72 }); // 나가는 돈: 낮고 무거운 소리 한 번
  }, [target, perSec]);
  useEffect(() => {
    const t = window.setInterval(() => {
      if (cur.current === to.current) return;
      const nx = rollNext(cur.current, to.current, left.current);
      left.current = Math.max(1, left.current - 1);
      const up = nx > cur.current;
      cur.current = nx;
      setShown(nx);
      // 딸깍 소리: 큰돈이 구를 때는 초당 여덟 번까지, 조금씩 오를 때는 2초에 한 번 아주 작게(귀가 피곤하지 않게)
      const now = performance.now();
      const burst = left.current > 10 || Math.abs(to.current - nx) > 30;
      if (up && now - lastTick.current >= (burst ? 125 : 2000)) { lastTick.current = now; play('acorn_arrive', { vol: burst ? 0.16 : 0.05, rate: burst ? 1.05 + Math.random() * 0.2 : 1.3 }); }
    }, ROLL_STEP_MS);
    return () => window.clearInterval(t);
  }, []);
  const txt = comma(Math.max(0, shown));
  const rolling = shown !== target;
  return (
    <span key={fx?.k ?? 0} className={'v od' + (fx ? ' n-' + fx.kind : '') + (rolling ? ' rolling ' + (dir.current ?? 'up') : '')} data-money={target} data-shown={shown} aria-label={`도토리 ${comma(target)}`}>
      {shown < 0 && '−'}
      {txt.split('').map((ch, i) => (ch === ',' ? <span key={'c' + (txt.length - i)} className="od-c" aria-hidden="true">,</span> : <Digit key={'d' + (txt.length - i)} d={+ch} />))}
    </span>
  );
}
