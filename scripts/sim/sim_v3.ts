// 실행: npx vite-node scripts/sim/sim_v3.ts [--runs 12] [--hold 6] [--hours 336]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Recording } from '../../src/engine/feed/replayFeed';
import { ARCHETYPES, buildCache, median, quantile, simulate, type BranchPolicy, type GenRec } from './sim_v3_lib';

const arg = (n: string, d: number) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? Number(process.argv[i + 1]) : d;
};
const RUNS = arg('runs', 12);
const HOLD = arg('hold', 6);
const GEN = arg('gen', 72);
const HOURS = arg('hours', 336);
const root = join(__dirname, '..', '..');
// --set balance.inheritance.studentLoan=100000 처럼 메모리 안의 data 값만 바꿔 본다(파일은 그대로). 제안한 데이터 변경을 시험할 때 쓴다.
import * as data from '../../src/engine/data';
const SETS: string[] = [];
process.argv.forEach((a, i) => { if (a === '--set') SETS.push(process.argv[i + 1]); });
for (const s of SETS) {
  const [path, raw] = s.split('=');
  const keys = path.split('.');
  let o: any = (data as any)[keys[0]];
  for (const k of keys.slice(1, -1)) o = Array.isArray(o) ? o.find((x: any) => x.id === k) : o[k];
  o[keys[keys.length - 1]] = JSON.parse(raw);
}
const rec: Recording = JSON.parse(readFileSync(join(root, 'docs/gdd/v2/sim/data/hl_3m.json'), 'utf8'));

async function main() {
  const t0 = Date.now();
  const cache = buildCache(rec);
  const out: Record<string, GenRec[][]> = {};
  const plan: { key: string; archetype: (typeof ARCHETYPES)[number]; branch: BranchPolicy }[] = [];
  for (const a of ARCHETYPES) plan.push({ key: a.id, archetype: a, branch: 'renounce' });
  const normal = ARCHETYPES.find((a) => a.id === 'engine_normal')!;
  for (const b of ['limited', 'simple'] as const) plan.push({ key: `engine_normal:${b}`, archetype: normal, branch: b });
  for (const p of plan) {
    out[p.key] = [];
    for (let r = 0; r < RUNS; r++) {
      const offset = Math.floor((r / RUNS) * cache.L) + 1;
      out[p.key].push(await simulate(cache, { archetype: p.archetype, seed: r + 1, offsetSec: offset, branch: p.branch, holdHours: HOLD, genHours: GEN, maxHours: HOURS }));
    }
    process.stderr.write(`${p.key} done ${(Date.now() - t0) / 1000}s\n`);
  }
  if (!SETS.length) writeFileSync(join(root, 'docs/gdd/v2/sim/out/results_v3.json'), JSON.stringify({ runs: RUNS, holdHours: HOLD, genHours: GEN, genHours: GEN, maxHours: HOURS, results: out }, null, 0));
  if (!SETS.length) writeFileSync(join(root, 'docs/gdd/v2/sim/SIM_v3.md'), report(out));
  if (SETS.length) console.log(`## 시험 변경: ${SETS.join(', ')}`);
  console.log(report(out));
}

const f1 = (x: number | null) => (x === null ? '-' : x < 10 ? x.toFixed(1) : Math.round(x).toString());
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const col = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null);
const triple = (xs: (number | null)[]) => {
  const c = col(xs);
  return c.length ? `${f1(quantile(c, 0.1))} / ${f1(median(c))} / ${f1(quantile(c, 0.9))} (${c.length}/${xs.length})` : `- (0/${xs.length})`;
};

function report(out: Record<string, GenRec[][]>): string {
  const L: string[] = [];
  L.push('# sim_v3 — 엔진 직접 호출 시뮬레이션 (M4)');
  L.push('');
  L.push(`엔진: \`src/engine/*\` 를 그대로 호출(\`stepMut\`·\`catchUp\`·\`declareBankruptcy\`·상속 액션). 시세: \`hl_3m.json\` ReplayFeed(1초 틱, 기록 안 시작 위치만 런마다 다름). 하루 5번 × 6~9분 접속. 런 ${RUNS}회, 최대 ${HOURS}시간. 빚을 다 갚은 뒤 ${HOLD}시간 더, 그리고 세대 시작부터 ${GEN}시간이 지난 첫 접속에서 세대를 끝낸다(스크립트 — 엔진의 파산 함수 호출).`);
  L.push('');
  const n1 = out.engine_normal.map((r) => r[0]);
  const fw = median(col(n1.map((r) => (r.firstWheelOnlineSec === null ? null : r.firstWheelOnlineSec / 60))));
  const fs = median(col(n1.map((r) => r.futuresSession)));
  const fh = median(col(n1.map((r) => r.futuresH)));
  const day1 = pct(n1.filter((r) => r.futuresH !== null && r.futuresH <= 24).length, n1.length);
  const med = (key: string, p: number) => median(col(out[key].map((r) => r[p - 1]?.debtFreeH ?? null)));
  const T5 = [36, 26, 16, 9, 5];
  const v = (m: number | null, t: number) => (m === null ? '-' : m >= t * 0.7 && m <= t * 1.3 ? '범위 안' : m < t * 0.7 ? '너무 빠름' : '너무 느림');
  L.push('## 0. [시뮬 필요] 목표 대비 (engine_normal, 상속포기 반복)');
  L.push('');
  L.push('| 항목 | 목표 | 측정(중앙) | 판정 |');
  L.push('|---|---|---|---|');
  L.push(`| 첫 쳇바퀴까지(접속 시간) | 3~6분 | ${f1(fw)}분 | ${fw !== null && fw >= 3 && fw <= 6 ? '범위 안' : '목표보다 빠름(GDD 본문 계산은 약 2분 15초)'} |`);
  L.push(`| 선물 계좌 | 첫날, 2~4번째 접속 | ${f1(fs)}번째 접속, ${f1(fh)}시간, 첫날 안 ${day1}% | ${day1 >= 90 && fs !== null && fs >= 2 && fs <= 4 ? '범위 안' : '확인 필요'} |`);
  const alive = pct(out.engine_normal.filter((r) => r[0].survived72h).length, out.engine_normal.length);
  L.push(`| 첫 세대 3일(72h) 생존(engine_normal) | 거의 전부(SIM_v2 99.8%) | ${alive}% | ${alive >= 95 ? '범위 안' : '낮음'} |`);
  L.push(`| 0단계 생존(labor: 쳇바퀴를 안 산 사람) | 36 접속 정산 ≈ 1시간 50분 | 72시간 안 파산 ${pct(out.labor.filter((r) => !r[0].survived72h).length, out.labor.length)}% | 참고 |`);
  for (let p = 1; p <= 5; p++) L.push(`| 빚 청산 시간, 플레이한 ${p}세대 | ${T5[p - 1]}시간 (±30% = ${f1(T5[p - 1] * 0.7)}~${f1(T5[p - 1] * 1.3)}) | ${f1(med('engine_normal', p))}시간 | ${v(med('engine_normal', p), T5[p - 1])} |`);
  L.push('');
  const b = (key: string, p: number) => out[key].map((r) => r[p - 1]).filter(Boolean);
  L.push('### 세 갈래의 결과(둘째 세대, 첫 상속 직후) — 파산 방식이 스크립트(빚을 다 갚고 72시간 뒤 종료)라 부모에게 재산이 남아 있다. 실제 파산은 재산이 압류로 줄어 있으므로 한정·단순의 값은 위쪽 한계다.');
  L.push('');
  L.push('| 갈래 | 시작 빚(중앙) | 시작 현금(중앙) | 시작 단계 | 빚 청산(시간 중앙) | 받은 가훈(첫 상속, 중앙) | 5세대 청산(시간 중앙) |');
  L.push('|---|---|---|---|---|---|---|');
  for (const [k, name] of [['engine_normal', '상속포기'], ['engine_normal:limited', '한정승인'], ['engine_normal:simple', '단순승인']] as const) {
    const g2 = b(k, 2);
    L.push(`| ${name} | ${f1(median(g2.map((r) => r.startDebt)))} | ${f1(median(g2.map((r) => r.startCash)))} | ${f1(median(g2.map((r) => r.startStage)))} | ${f1(median(col(g2.map((r) => r.debtFreeH))))} | ${f1(median(col(b(k, 1).map((r) => r.han))))} | ${f1(median(col(b(k, 5).map((r) => r.debtFreeH))))} |`);
  }
  L.push('');
  L.push('## 1. 첫 세대(2세대) — 플레이 방식별');
  L.push('');
  L.push('| 플레이 방식 | 첫 쳇바퀴(접속 분, 중앙) | 선물 계좌(시간 10/50/90%) | 계좌까지 접속 횟수 중앙 | 첫날(24h) 안에 연 % | 빚 청산 시간(시간 10/50/90%) | 72시간 안 파산 % |');
  L.push('|---|---|---|---|---|---|---|');
  for (const [k, runs] of Object.entries(out)) {
    if (k.includes(':')) continue;
    const g1 = runs.map((r) => r[0]).filter(Boolean);
    const fw = col(g1.map((r) => (r.firstWheelOnlineSec === null ? null : r.firstWheelOnlineSec / 60)));
    L.push(`| ${k} | ${fw.length ? f1(median(fw)) : '-'} | ${triple(g1.map((r) => r.futuresH))} | ${f1(median(col(g1.map((r) => r.futuresSession))))} | ${pct(g1.filter((r) => r.futuresH !== null && r.futuresH <= 24).length, g1.length)} | ${triple(g1.map((r) => r.debtFreeH))} | ${pct(g1.filter((r) => !r.survived72h).length, g1.length)} |`);
  }
  L.push('');
  const TARGET = [36, 26, 16, 9, 5];
  for (const key of ['engine_normal', 'engine_normal:limited', 'engine_normal:simple']) {
    const runs = out[key];
    if (!runs) continue;
    L.push(`## ${key === 'engine_normal' ? '2' : key.endsWith('limited') ? '3' : '4'}. 세대별 빚 청산 시간 — ${key} (${key.split(':')[1] ?? 'renounce'} 반복, 한은 3.14 (5) 순서로 사용)`);
    L.push('');
    L.push('| 플레이한 세대 | 목표(시간) | ±30% 범위 | 중앙값(시간) | 10% ~ 90% | 청산한 런 | 판정 | 시작 빚(중앙) | 시작 단계(중앙) | 받은 가훈(중앙) | 선물 계좌(시간 중앙) | 첫 쳇바퀴(접속 분 중앙) |');
    L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (let p = 1; p <= 5; p++) {
      const gs = runs.map((r) => r[p - 1]).filter(Boolean);
      const df = col(gs.map((r) => r.debtFreeH));
      const m = median(df);
      const tg = TARGET[p - 1];
      const ok = m !== null && m >= tg * 0.7 && m <= tg * 1.3;
      L.push(`| ${p} | ${tg} | ${f1(tg * 0.7)}~${f1(tg * 1.3)} | ${f1(m)} | ${f1(quantile(df, 0.1))} ~ ${f1(quantile(df, 0.9))} | ${df.length}/${gs.length} | ${m === null ? '-' : ok ? '범위 안' : m < tg * 0.7 ? '너무 빠름' : '너무 느림'} | ${f1(median(gs.map((r) => r.startDebt)))} | ${f1(median(gs.map((r) => r.startStage)))} | ${f1(median(col(gs.map((r) => (r.han > 0 || r.endedBy ? r.han : null)))))} | ${f1(median(col(gs.map((r) => r.futuresH))))} | ${f1(median(col(gs.map((r) => (r.firstWheelOnlineSec === null ? null : r.firstWheelOnlineSec / 60)))))} |`);
    }
    L.push('');
    const han = runs.map((r) => r.map((x) => x.hanBank));
    L.push(`가훈 누적(세대 끝에 받은 값, 쓰기 전 가진 가훈 중앙): ${[1, 2, 3, 4, 5].map((p) => `${p}세대 후 ${f1(median(col(han.map((h) => h[p - 1] ?? null))))}`).join(' · ')}`);
    L.push('');
  }
  return L.join('\n');
}

void main();
