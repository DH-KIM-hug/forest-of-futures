// 디버그 화면: 시세 출처와 연결 상태 (M6).
import { useGame } from './store/gameStore';

const CONN: Record<string, string> = { idle: '대기', connecting: '연결 중', open: '연결됨', down: '끊김(재연결 중)', local: '서버 없음 · 기기 시계' };
const MARKET: Record<string, string> = { open: '시장 열림', delayed: '시세 지연', halted: '시장 정지' };

export function NetBadge() {
  const net = useGame((s) => s.net);
  const run = useGame((s) => s.g.run);
  const bad = (net.source === 'server' || net.source === 'hl') && (net.conn !== 'open' || run.marketStatus !== 'open');
  return (
    <p style={{ margin: '4px 0', padding: '4px 8px', background: bad ? '#fde8e8' : '#e8f3ea', borderRadius: 4 }}>
      시세 출처: <b>{net.source === 'server' ? '게임 서버' : net.source === 'sim' ? (net.fallback ? '난수(SimFeed, 실시간 연결 실패)' : '난수(SimFeed)') : net.source === 'hl' ? '실시간(브라우저 직결)' : '기록 재생(ReplayFeed)'}</b>
      {net.url && <> ({net.url})</>} · 연결: <b>{CONN[net.conn] ?? net.conn}</b> · 시장: <b>{MARKET[run.marketStatus]}</b>
      {net.stale && <b style={{ color: 'crimson' }}> · 틱이 안 옴</b>}
      {net.source === 'server' && net.conn === 'local' && <span> · 시장에 연결할 수 없습니다(포지션 얼림)</span>}
      {net.away && <span> · 따라잡기: 경제 {net.away.economySettlements}회{net.away.bankrupt ? ' · 파산' : ''}</span>}
      <span> · 틱 {run.lastSeenTick}</span>
    </p>
  );
}
