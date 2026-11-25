// 서버 안에서만 쓰는 모양. 실제 종목·가격은 RawEvent 와 Sampler/Rebaser 안쪽에만 있고, 앱으로 나가는 것은 protocol.ts 가 만든 것뿐이다.
export type MarketStatus = 'open' | 'delayed' | 'halted';
export type SourceId = 'primary' | 'secondary';

/** 출처 어댑터가 내는 원본 사건. key 는 sources.json 의 내부 키(DTC.. 또는 IDX_XRP). */
export type RawEvent =
  | { kind: 'mid'; key: string; mid: number; ts: number }
  | { kind: 'trade'; key: string; notional: number; buy: boolean; ts: number };

export interface SourceAdapter {
  readonly id: SourceId;
  /** 연결을 시작한다. 구현되지 않은 출처는 NotImplementedError 를 던진다. */
  start(): void;
  stop(): void;
  onEvent(cb: (e: RawEvent) => void): void;
}

export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what}: not implemented`);
    this.name = 'NotImplementedError';
  }
}

/** [가상 가격, 거래량 지수(평소 = 1), 매수 체결 비율 0~1] */
export type Cell = [number, number, number];

export interface TickRecord {
  n: number;
  ts: number; // 초
  st: MarketStatus;
  src: SourceId; // 내부 기록용. 앱으로 나가지 않는다.
  p: Record<string, Cell>;
}

export interface BarRecord {
  market: string;
  n0: number;
  o: number;
  h: number;
  l: number;
  c: number;
  vol: number;
  buy: number;
  st: 0 | 1 | 2; // open | delayed | halted
  avg60?: number; // 정산 봉의 마지막 60틱 평균(2단계 옵션 결제가)
}

export const ST_CODE: Record<MarketStatus, 0 | 1 | 2> = { open: 0, delayed: 1, halted: 2 };
