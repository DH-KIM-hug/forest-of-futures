// 파산 소식(U-59, 「오늘 망한 자들」): 시세로 검증하지 않는 재미용 기록. 모양과 범위만 본다.
import { cleanName, knownMarket, LIMITS } from './verify';

export const CAUSES = ['liq', 'interest', 'overdue', 'noLender'] as const;
export type Cause = (typeof CAUSES)[number];
export interface BustEvent {
  deviceId: string; name: string; cause: Cause;
  coin: string | null; dir: 1 | -1 | null; lev: number | null;
  loss: number; peak: number; ending: string | null; lite: boolean;
}
export const EVENT_LIMITS = {
  /** 한 기기에서 소식 사이(파산은 아무리 빨라도 몇 분에 한 번) */
  minIntervalMs: 60_000,
  maxLoss: 3e9,
  minPeak: -1e9,
  maxPeak: 3e9,
  endingMax: 24,
  recentMax: 50,
  /** 이보다 오래된 소식은 신문에 안 싣는다 */
  keepMs: 3 * 24 * 3600e3,
};

const clampNum = (v: unknown, lo: number, hi: number): number | null => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.max(lo, Math.min(hi, n)));
};

export function parseEvent(body: unknown): { ok: true; e: BustEvent } | { ok: false; why: string } {
  const b = body as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return { ok: false, why: 'body' };
  const deviceId = typeof b.deviceId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(b.deviceId) ? b.deviceId : null;
  if (!deviceId) return { ok: false, why: 'deviceId' };
  const name = cleanName(b.name);
  if (!name) return { ok: false, why: 'name' };
  const cause = b.cause as Cause;
  if (!CAUSES.includes(cause)) return { ok: false, why: 'cause' };
  let coin: string | null = null;
  if (b.coin !== null && b.coin !== undefined) { if (typeof b.coin !== 'string' || !knownMarket(b.coin)) return { ok: false, why: 'coin' }; coin = b.coin; }
  let dir: 1 | -1 | null = null;
  if (b.dir !== null && b.dir !== undefined) { if (b.dir !== 1 && b.dir !== -1) return { ok: false, why: 'dir' }; dir = b.dir; }
  let lev: number | null = null;
  if (b.lev !== null && b.lev !== undefined) { const l = Number(b.lev); if (!(l >= 1 && l <= LIMITS.maxLev)) return { ok: false, why: 'lev' }; lev = Math.round(l); }
  const loss = clampNum(b.loss ?? 0, 0, EVENT_LIMITS.maxLoss);
  if (loss === null) return { ok: false, why: 'loss' };
  const peak = clampNum(b.peak ?? 0, EVENT_LIMITS.minPeak, EVENT_LIMITS.maxPeak);
  if (peak === null) return { ok: false, why: 'peak' };
  let ending: string | null = null;
  if (b.ending !== null && b.ending !== undefined) {
    if (typeof b.ending !== 'string') return { ok: false, why: 'ending' };
    const t = b.ending.normalize('NFC').replace(/[\u0000-\u001f\u007f<>]/g, '').trim();
    ending = t ? [...t].slice(0, EVENT_LIMITS.endingMax).join('') : null;
  }
  return { ok: true, e: { deviceId, name, cause, coin, dir, lev, loss, peak, ending, lite: b.lite === true } };
}

/** 한 기기의 소식 간격(서버 시각) */
export const eventTooSoon = (lastAt: number | null, now: number): boolean => lastAt !== null && now - lastAt < EVENT_LIMITS.minIntervalMs;
