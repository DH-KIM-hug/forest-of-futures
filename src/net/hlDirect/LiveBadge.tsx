// HUD 의 작은 시세 표시: 실시간이면 초록 점 "실시간", 연습 시세로 내려갔으면 "연습 시세", 끊겼으면 노란 점.
import { useGame } from '../../store/gameStore';

export function LiveBadge() {
  const net = useGame((s) => s.net);
  if (net.source !== 'hl' && !net.fallback) return null;
  const practice = !!net.fallback;
  const live = !practice && net.conn === 'open' && net.market === 'open';
  const label = practice ? '연습 시세' : live ? '실시간' : net.conn === 'connecting' ? '연결 중' : net.market === 'halted' ? '시세 정지' : '시세 끊김';
  const col = practice ? '#9a8f7a' : live ? '#3fae5a' : '#d9a226';
  return (
    <span aria-label={label} title={practice ? '실시간 시세에 연결하지 못해 연습 시세로 돌고 있어요' : undefined} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 6, fontSize: 10, lineHeight: 1, opacity: 0.85, verticalAlign: 'middle' }}>
      <i style={{ width: 7, height: 7, borderRadius: '50%', background: col, boxShadow: live ? `0 0 5px ${col}` : 'none', display: 'inline-block' }} />{label}
    </span>
  );
}
