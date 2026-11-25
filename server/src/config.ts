import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface SourcesConfig {
  primary: { kind: string; url: string; coins: Record<string, string> };
  secondary: { kind: string; pools: Record<string, string> };
  index: { id: string; primaryMembers: string[]; secondaryMembers: string[] };
  volumeKeys: string[];
}
export interface MarketCfg {
  id: string;
  startPrice: number;
  index?: boolean;
}
export interface Config {
  port: number;
  host: string;
  dbPath: string;
  tickEpoch: number | null; // 초. null 이면 DB 에 저장된 값(없으면 지금 기준 고정값)
  sourcesPath: string;
  marketsPath: string;
  primaryUrl: string | null;
  disableSecondary: boolean;
  corsOrigin: string;
  log: boolean;
}

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

/** 환경 변수에서 설정을 읽는다. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    port: Number(env.PORT ?? 8787),
    host: env.HOST ?? '0.0.0.0',
    dbPath: env.DB_PATH ?? here('../data/fof.sqlite'),
    tickEpoch: env.TICK_EPOCH ? Number(env.TICK_EPOCH) : null,
    sourcesPath: env.SOURCES_PATH ?? here('../config/sources.json'),
    marketsPath: env.MARKETS_PATH ?? here('../../data/markets.json'),
    primaryUrl: env.PRIMARY_URL ?? null,
    disableSecondary: env.DISABLE_SECONDARY === '1',
    corsOrigin: env.CORS_ORIGIN ?? '*',
    log: env.QUIET !== '1',
  };
}

export function loadSources(path: string): SourcesConfig {
  return JSON.parse(readFileSync(path, 'utf8'));
}
export function loadMarkets(path: string): MarketCfg[] {
  const j = JSON.parse(readFileSync(path, 'utf8'));
  return j.markets.map((m: any) => ({ id: m.id, startPrice: m.startPrice, index: !!m.index }));
}
