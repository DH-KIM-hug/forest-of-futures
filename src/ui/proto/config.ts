// 시제품(?proto=1) 설정. 주소 값을 한 번 읽는다.
//   ?proto=1            시제품 화면
//   &fast=1             정산 20초(튜토리얼 뒤에도. 튜토리얼 동안은 원래 20초)
//   &cheat=1            개발 단추(+10만 도토리, 정산 지금)
//   &feed=sim|server    시세 출처(시제품은 feed 가 없으면 sim)
//   &pdev=<장면>        장면 건너뛰기(dev.ts)
//   &lite=1             라이트 모드(선물과 빚만, 만화 인트로)
import { balance } from '../../engine/data';

const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
export const isProto = q.get('proto') === '1';
export const isFast = q.get('fast') === '1';
export const isCheat = q.get('cheat') === '1';
/** 라이트 모드(&lite=1): 선물과 빚만 남긴다. 쳇바퀴 · 알바 · 집이 없고, 첫 화면은 만화다(ui/proto/lite) */
export const isLite = isProto && q.get('lite') === '1';
export const FAST_INTERVAL = 20;

/** 불러온 balance 값을 덮어쓴다(data/*.json 파일은 그대로). 게임을 만들기 전에 불러야 한다. */
export function applyFastOverride(): void {
  if (isProto && isFast) (balance as any).settlement.intervalSec = FAST_INTERVAL;
  // 1막 시제품에는 인맥이 없다(U-29): 친구 규칙(연락처 추심·절교·친구 파산)을 끈다(U-38)
  if (isProto) (balance as any).act1 = { friends: false };
}
export const pdev = q.get('pdev');
