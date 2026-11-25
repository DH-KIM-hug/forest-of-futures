// 서버 코드 중 시제품(브라우저 직결 시세, src/net/hlDirect)이 그대로 쓰는 부분의 단일 출입구.
// 앱 소스(src)에는 출처 이름이 한 글자도 없어야 해서(AC-v2-138) 이름을 바꿔 내보낸다. Node 전용 모듈(sqlite 등)은 여기서 가져오지 않는다.
export { HyperliquidAdapter as PrimaryAdapter } from './hyperliquid.ts';
export type { SocketLike, SocketFactory } from './hyperliquid.ts';
export { Sampler, VolumeNorm } from './sampler.ts';
export { Rebaser } from './transform.ts';
export { SourceSelector } from './selector.ts';
export { computeAvg } from './bars.ts';
export type { RawEvent, BarRecord } from './types.ts';
