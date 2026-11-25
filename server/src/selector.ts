// 자동 전환과 시장 상태 (GDD_v2 6.3). 시계는 밖에서 넣는다(테스트는 가짜 시계).
import type { MarketStatus, SourceId } from './types.ts';

export interface SelectorOpts {
  silentMs: number; // 5000: 이만큼 조용하면 끊김
  haltMs: number; // 60000: 두 출처가 이만큼 조용하면 정지
  returnMs: number; // 60000: 주 출처가 이만큼 정상이면 복귀
  divergeThreshold: number; // 0.005 (0.5%p)
  divergeMs: number; // 30000
}
export const DEFAULT_SELECTOR: SelectorOpts = {
  silentMs: 5000, haltMs: 60000, returnMs: 60000, divergeThreshold: 0.005, divergeMs: 30000,
};

export interface Health {
  lastAt: number | null;
  unavailable?: boolean;
}
export interface SelectorOut {
  active: SourceId;
  status: MarketStatus;
  switched: boolean;
  reason?: 'silent' | 'divergence' | 'return' | 'secondary-failed';
}

export class SourceSelector {
  active: SourceId = 'primary';
  status: MarketStatus = 'delayed';
  private opts: SelectorOpts;
  private startedAt: number;
  private primaryHealthySince: number | null = null;
  private divergentSince: number | null = null;
  onAlert: (msg: string) => void = () => {};

  constructor(startedAt: number, opts: Partial<SelectorOpts> = {}) {
    this.startedAt = startedAt;
    this.opts = { ...DEFAULT_SELECTOR, ...opts };
  }

  private quietMs(h: Health, now: number): number {
    if (h.unavailable) return Infinity;
    return now - (h.lastAt ?? this.startedAt);
  }

  /** 1초마다. divergent = 이번 초 두 출처의 수익률이 임계 이상 어긋났는가. */
  update(now: number, p: Health, s: Health, divergent: boolean): SelectorOut {
    const o = this.opts;
    const pSilent = this.quietMs(p, now) >= o.silentMs;
    const sSilent = this.quietMs(s, now) >= o.silentMs;
    this.divergentSince = divergent ? (this.divergentSince ?? now) : null;
    const divergedLong = this.divergentSince !== null && now - this.divergentSince >= o.divergeMs;
    let switched = false;
    let reason: SelectorOut['reason'];

    if (this.active === 'primary') {
      if (pSilent && !sSilent) {
        this.active = 'secondary'; switched = true; reason = 'silent';
      } else if (divergedLong && !sSilent) {
        this.active = 'secondary'; switched = true; reason = 'divergence';
        this.onAlert('divergence: primary vs secondary');
      }
      this.primaryHealthySince = null;
    } else {
      this.primaryHealthySince = !pSilent ? (this.primaryHealthySince ?? now) : null;
      if (sSilent && !pSilent) {
        this.active = 'primary'; switched = true; reason = 'secondary-failed';
      } else if (this.primaryHealthySince !== null && now - this.primaryHealthySince >= o.returnMs && !divergentNow(divergent)) {
        this.active = 'primary'; switched = true; reason = 'return';
      }
    }
    if (switched) this.primaryHealthySince = null;

    const act = this.active === 'primary' ? p : s;
    const actSilent = this.active === 'primary' ? pSilent : sSilent;
    let status: MarketStatus = 'open';
    if (actSilent) {
      const quiet = Math.min(this.quietMs(p, now), this.quietMs(s, now));
      status = quiet >= o.haltMs ? 'halted' : 'delayed';
    } else if (act.lastAt === null) {
      status = 'delayed'; // 아직 한 번도 못 받았다(시작 직후 5초 이내)
    }
    this.status = status;
    return { active: this.active, status, switched, reason };
  }
}
const divergentNow = (d: boolean) => d;

/** 두 출처의 이번 초 수익률 차(공통 종목 중 최대 절댓값). 공통이 없으면 0. */
export function maxReturnDiff(a: Record<string, number>, b: Record<string, number>): number {
  let m = 0;
  for (const k of Object.keys(a)) if (k in b) m = Math.max(m, Math.abs(a[k] - b[k]));
  return m;
}
