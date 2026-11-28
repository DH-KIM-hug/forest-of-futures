// 라이트의 추심원 줄(U-65, 사용자 결정 「두 군데 하면 추심원 두 명, 세 군데 빌리면 추심원 세 명」).
// 빚이 있는 돈줄마다 추심원 하나: 오소리 사무소 = 오소리 추심원, 숲속 캐피탈 = 창구 너구리, 반짝 전당포(엔진 shark2) = 까마귀 사장의 추심원 독사.
// ① 거래소 머리 오른쪽(돈 아래 빈자리)에 얼굴이 하나씩 붙어 기다린다. 정산 10초 전이면 들썩이며 「똑똑」. 누르는 것은 덮지 않는다(pointer-events 없음)
// ② 빚을 다 갚으면 그 추심원이 「탈출!」 꼬리표를 남기고 빠진다
// ③ 정산에 둘 넘게 와 있으면 문 앞에 나란히 서서 제 몫을 한 줄씩(DoorLine, 누르는 것을 막지 않는 띠, 4초)
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { useGame } from '../../../store/gameStore';
import { useProto } from '../protoStore';
import { comma } from '../../../engine/util';
import type { GameState } from '../../../engine/types';
import bCollector from '../img/v5/b_collector.webp';
import bRaccoon from '../img/v5/b_raccoon.webp';
import bSnake from '../img/v5/b_snake.webp';
import './collectors.css';

export type DebtLender = 'shark1' | 'capital' | 'shark2';
/** 빚 사다리 순서(라이트에는 조합이 없다) */
export const LADDER: DebtLender[] = ['shark1', 'capital', 'shark2'];
/** 돈줄 → 그 추심원(이름, 반신, 얼굴 자리: 반신 그림에서 얼굴이 있는 곳 %) */
export const COLLECTOR_OF: Record<DebtLender, { name: string; src: string; pos: string; size: string }> = {
  shark1: { name: '오소리 추심원', src: bCollector, pos: '38% 8%', size: '160%' },
  capital: { name: '창구 너구리', src: bRaccoon, pos: '48% 14%', size: '165%' },
  shark2: { name: '독사 추심원', src: bSnake, pos: '62% 26%', size: '170%' },
};

/** 지금 빚이 남은 돈줄(사다리 순서). 추심원 수 = 이 길이 */
export function owedLenders(g: GameState): DebtLender[] {
  return LADDER.filter((id) => g.run.debts[id].principal > 0);
}

/** 문 앞 한 줄(정산마다, 제 몫의 이자) */
export function doorLine(id: DebtLender, interest: number, living = 0): string {
  const n = comma(Math.round(interest));
  if (id === 'shark1') return living > 0 ? `이자 ${n}, 생활비 ${comma(Math.round(living))} 받아 갑니다.` : `이자 ${n} 받아 갑니다.`;
  if (id === 'capital') return `${n} 자동이체 됐어요 ♥`;
  return `${n}. 사장님이 반짝이는 걸 기다리세요.`;
}

interface Door { k: number; rows: { id: DebtLender; line: string }[] }
const useDoor = create<{ door: Door | null }>(() => ({ door: null }));
let doorTimer = 0;
/** 정산에 문 앞에 선 추심원들(watch.ts 가 부른다). 4초 뒤 저절로 걷힌다 */
export function doorKnock(rows: Door['rows']): void {
  if (rows.length < 2) return;
  window.clearTimeout(doorTimer);
  useDoor.setState({ door: { k: Date.now(), rows } });
  doorTimer = window.setTimeout(() => useDoor.setState({ door: null }), 4200);
}

const Face = ({ id, cls = '' }: { id: DebtLender; cls?: string }) => {
  const c = COLLECTOR_OF[id];
  return <i className={'cl-face ' + cls} data-lurk-face={id} aria-hidden="true" style={{ backgroundImage: `url(${c.src})`, backgroundPosition: c.pos, backgroundSize: c.size }} />;
};

/** 머리의 추심원 얼굴들. 거래소 탭에서만 */
export function Lurkers() {
  const g = useGame((s) => s.g);
  const tab = useProto((s) => s.tab);
  const run = g.run;
  const owed = owedLenders(g);
  const key = owed.join(',');
  // 빚을 다 갚아 빠지는 추심원(1.8초)
  const prev = useRef<{ ids: DebtLender[]; tick: number }>({ ids: owed, tick: run.tick });
  const [gone, setGone] = useState<DebtLender[]>([]);
  useEffect(() => {
    const p = prev.current;
    const left = run.tick >= p.tick && !run.over ? p.ids.filter((id) => !owed.includes(id)) : [];
    prev.current = { ids: owed, tick: run.tick };
    if (!left.length) return;
    setGone((x) => [...x, ...left]);
    window.setTimeout(() => setGone((x) => x.filter((id) => !left.includes(id))), 1800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (tab !== 'phone' || run.over) return null;
  const show = [...owed, ...gone.filter((id) => !owed.includes(id))];
  if (!show.length) return null;
  const left = Math.max(0, run.settleIn);
  const knock = left > 0 && left <= 10 && owed.length > 0;
  return (
    <div className={'cl-lurk' + (knock ? ' knock' : '')} data-lurkers={owed.length} aria-label={`추심원 ${owed.length}명이 기다린다`} role="img">
      {knock && <b className="cl-knock" data-knock>똑똑</b>}
      {show.map((id, i) => {
        const out = !owed.includes(id);
        return (
          <span key={id} className={'cl-one' + (out ? ' out' : '')} data-lurk={id} style={{ animationDelay: `${i * 0.12}s` }}>
            <Face id={id} />
            {out && <em className="cl-esc" data-lurk-esc={id}>탈출!</em>}
          </span>
        );
      })}
    </div>
  );
}

/** 정산의 문 앞: 추심원들이 나란히 서서 제 몫을 한 줄씩. 누르는 것을 막지 않는다 */
export function DoorLine() {
  const door = useDoor((s) => s.door);
  if (!door) return null;
  return (
    <div className="cl-door" key={door.k} data-door={door.rows.length} role="status" aria-live="polite">
      <div className="cl-door-h">문 앞에 {door.rows.length}명</div>
      {door.rows.map((r, i) => (
        <div className="cl-door-r" key={r.id} data-door-row={r.id} style={{ animationDelay: `${i * 0.18}s` }}>
          <Face id={r.id} cls="big" />
          <p><small>{COLLECTOR_OF[r.id].name}</small>{r.line}</p>
        </div>
      ))}
    </div>
  );
}
