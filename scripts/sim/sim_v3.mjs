#!/usr/bin/env node
// sim_v3 실행기: TypeScript 엔진을 vite-node 로 그대로 불러 돌린다. 사용: node scripts/sim/sim_v3.mjs [--runs 12] [--hold 6] [--hours 336]
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const r = spawnSync('npx', ['vite-node', join(dir, 'sim_v3.ts'), '--', ...process.argv.slice(2)], { stdio: 'inherit', cwd: join(dir, '..', '..') });
process.exit(r.status ?? 1);
