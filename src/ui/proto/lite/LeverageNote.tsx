// 도입 만화 컷 8~9 「배율 공책」(docs/gdd/LITE_CONTI.md): 줄 공책에 먹으로 그린 손그림. 다로미가 깨닫고, 뒷면에서 해맑게 넘긴다.
//   0쪽 같은 이익: 1배는 값이 10% 올라야, 200배는 0.05%만 올라도 같은 돈.
//   1쪽 뒷면: 200배는 반대로 약 0.4%(엔진의 청산 거리 = 1/배율 − 유지 증거금률)만 가도 넣은 돈이 다 날아간다. 날다람쥐코인의 지난 1분 폭은 받은 시세에서 센다.
import { balance, marketById } from '../../../engine/data';
import { liveHistoryOf } from '../../priceHistory';
import { recentRange } from '../tension';
import { josa } from '../../../engine/util';
import faceThink from '../img/manga/face_think.webp';
import faceHappy from '../img/manga/face_happy.webp';

const LEV = 200;
/** 같은 이익의 예: 200배에서 0.05% 오르면 넣은 돈의 10% */
const SMALL = 0.05;
const fmt = (x: number) => (Math.round(x * 100) / 100).toString();
/** 200배의 청산 거리(%): 엔진과 같은 식 */
export const liqPctAt = (lev: number): number => (1 / lev - (balance.trading.maintenanceRate as number)) * 100;

/** 손으로 그린 화살(살짝 휜 선) */
function Arrow({ x1, y1, x2, y2, w = 3, col = '#2A2A55' }: { x1: number; y1: number; x2: number; y2: number; w?: number; col?: string }) {
  const a = Math.atan2(y2 - y1, x2 - x1), h = 14;
  const mx = (x1 + x2) / 2 + 3, my = (y1 + y2) / 2 - 3;
  return (
    <g stroke={col} strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round" filter="url(#ln-rough)">
      <path d={`M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`} />
      <path d={`M${x2 - h * Math.cos(a - 0.45)} ${y2 - h * Math.sin(a - 0.45)} L${x2} ${y2} L${x2 - h * Math.cos(a + 0.45)} ${y2 - h * Math.sin(a + 0.45)}`} />
    </g>
  );
}

export function NotePaper({ page }: { page: 0 | 1 }) {
  const flip = page === 1;
  const liqPct = liqPctAt(LEV);
  const same = SMALL * LEV;
  const fly = recentRange(liveHistoryOf('FLY'));
  const flyName = marketById.FLY?.name ?? '날다람쥐코인';
  return (
    <div className={'ln-paper' + (flip ? ' flip' : '')} data-levnote={page}>
      <svg className="ln-svg" viewBox="0 0 360 240" aria-hidden="true">
        <defs>
          <filter id="ln-rough"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" /><feDisplacementMap in="SourceGraphic" scale="2.6" /></filter>
        </defs>
        {Array.from({ length: 11 }, (_, i) => <line key={i} x1={0} x2={360} y1={20 + i * 22} y2={20 + i * 22} stroke="#B9D3EA" strokeWidth={1} />)}
        <line x1={30} x2={30} y1={0} y2={240} stroke="#E8A0A0" strokeWidth={1.4} />
        {!flip ? <>
          <line x1={40} x2={232} y1={104} y2={104} stroke="#2A2A55" strokeWidth={1.4} strokeDasharray="4 5" filter="url(#ln-rough)" />
          <Arrow x1={50} y1={104} x2={186} y2={22} w={4} />
          <text x={54} y={42} className="ln-t big">1배</text>
          <text x={120} y={86} className="ln-t">값이 {fmt(same)}% 올라야</text>
          <line x1={40} x2={232} y1={208} y2={208} stroke="#2A2A55" strokeWidth={1.4} strokeDasharray="4 5" filter="url(#ln-rough)" />
          <Arrow x1={50} y1={208} x2={118} y2={192} w={4} col="#C8553D" />
          <text x={54} y={182} className="ln-t big red">{LEV}배</text>
          <text x={126} y={226} className="ln-t">{fmt(SMALL)}%만 올라도</text>
          <path d="M212 116 L212 180" stroke="#2A2A55" strokeWidth={3} fill="none" filter="url(#ln-rough)" />
          <path d="M204 126 L212 114 L220 126 M204 170 L212 182 L220 170" stroke="#2A2A55" strokeWidth={3} fill="none" strokeLinecap="round" filter="url(#ln-rough)" />
          <text x={170} y={158} className="ln-t big red" transform="rotate(-6 170 158)">같은 이익!!</text>
        </> : <>
          <line x1={40} x2={232} y1={46} y2={46} stroke="#2A2A55" strokeWidth={1.4} strokeDasharray="4 5" filter="url(#ln-rough)" />
          <Arrow x1={50} y1={46} x2={128} y2={74} w={4} col="#4F7FC0" />
          <text x={54} y={32} className="ln-t big red">{LEV}배</text>
          <text x={134} y={90} className="ln-t">…반대로 {fmt(liqPct)}%만 내려가도</text>
          <text x={46} y={126} className="ln-t big">다 날아간다.</text>
          <g transform="translate(150 140)" filter="url(#ln-rough)" stroke="#2A2A55" strokeWidth={2.6} fill="none" strokeLinejoin="round">
            <path d="M18 42 q-16 -2 -18 -18 q2 -18 20 -20 q18 2 20 20 q-2 16 -18 18 z M2 20 q18 -16 36 0" fill="#E9C99A" />
            <path d="M20 8 l-4 12 l6 6 l-4 12" stroke="#C8553D" />
          </g>
          <text x={46} y={226} className="ln-t sm">{fly !== null ? `${flyName}, 지난 1분에 ${fmt(fly)}% 움직였다` : `${josa(flyName, '은', '는')} 평소 1분에 그쯤 움직인다`}</text>
        </>}
      </svg>
      <b className="ln-vert" aria-hidden="true">{flip ? '안 내려가면 되지.' : '판돈을 늘려서 작은 움직임에도 이익을…!'}</b>
      <img className="ln-face" src={flip ? faceHappy : faceThink} alt="" draggable={false} />
      <span className="ln-sr">{flip ? `${LEV}배는 반대로 ${fmt(liqPct)}% 움직이면 넣은 돈을 전부 잃습니다.` : `1배로 ${fmt(same)}% 오른 이익과 ${LEV}배로 ${fmt(SMALL)}% 오른 이익이 같습니다.`}</span>
    </div>
  );
}
