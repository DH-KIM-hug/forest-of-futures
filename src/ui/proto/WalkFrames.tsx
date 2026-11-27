// 두 걸음 걷기(U-46): 첫 걸음 · 반대 발 그림을 번갈아 끼우고, 발이 닿을 때 살짝 내려앉고 지나갈 때 뜬다. 동작 줄이기면 첫 걸음 그림만(미끄러지기만 한다).
import { sprite, WALK_PAIR, type SpriteId } from './sprites';

export function WalkFrames({ id, x, y, w, h, period }: { id: SpriteId; x: number; y: number; w: number; h: number; /** 두 걸음의 길이(초) */ period: number }) {
  const a = sprite(id)!;
  const bid = WALK_PAIR[id];
  const b = bid ? sprite(bid) : null;
  if (!b) return <image href={a.src} x={x} y={y} width={w} height={h} data-art={id} />;
  const style = { ['--wp' as string]: `${period.toFixed(3)}s`, ['--wb' as string]: `${(h * 0.025).toFixed(2)}px` };
  return (
    <g className="pa-walkcyc" style={style} data-walkcyc={id}>
      <image className="wf a" href={a.src} x={x} y={y} width={w} height={h} data-art={id} />
      <image className="wf b" href={b.src} x={x} y={y} width={w} height={h} data-art={bid} />
    </g>
  );
}
