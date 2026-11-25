// 시세 피드의 모양 (GDD_v2 6.6, 7.3). 엔진은 Tick/Bar 만 받는다. 실제 가격·종목 이름·출처는 여기에 없다.
import type { MarketStatus } from '../types';

/** [가상 가격, 거래량 지수(평소 = 1), 매수 체결 비율 0~1] */
export type PriceCell = [number, number, number];

export interface Tick {
  n: number; // 서버 틱 번호(초)
  st: MarketStatus;
  p: Record<string, PriceCell>;
}

export interface Bar {
  market: string;
  n0: number; // 봉이 시작한 틱
  o: number;
  h: number;
  l: number;
  c: number;
  vol: number;
  buy: number;
  st?: MarketStatus;
}

export interface Feed {
  subscribe(cb: (t: Tick) => void): () => void;
  bars(res: 60 | 180, from: number, to: number): Promise<Bar[]>;
  now(): Promise<{ n: number; st: MarketStatus }>;
}
