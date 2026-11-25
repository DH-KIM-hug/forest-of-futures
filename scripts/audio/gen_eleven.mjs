#!/usr/bin/env node
// ElevenLabs 효과음·음악 생성 + ffmpeg 다듬기. 키는 ~/.config/elevenlabs/key (출력·기록 금지).
// 사용: node scripts/audio/gen_eleven.mjs [--dry] [--only id,id] [--polish-only] [--redo]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const RAW = path.join(root, 'assets_src/audio/raw');
const OUT = path.join(root, 'src/ui/proto/audio');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const { settings, jobs } = JSON.parse(fs.readFileSync(path.join(root, 'scripts/audio/sfx_jobs.json'), 'utf8'));
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

const key = () => fs.readFileSync(path.join(os.homedir(), '.config/elevenlabs/key'), 'utf8').trim();
const hash = (j) => crypto.createHash('sha1').update([j.prompt, j.dur, j.kind, j.loop ? 1 : 0, j.kind === 'sfx' ? settings.sfxModel + settings.promptInfluence : settings.musicModel].join('|')).digest('hex').slice(0, 8);
const ff = (a) => execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...a], { stdio: ['ignore', 'pipe', 'pipe'] });
const probe = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
function measure(f) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', f, '-af', 'volumedetect,ebur128', '-f', 'null', '-'], { encoding: 'utf8' });
  const t = r.stderr;
  const max = parseFloat((t.match(/max_volume: (-?[\d.inf]+) dB/) || [])[1]);
  const mean = parseFloat((t.match(/mean_volume: (-?[\d.inf]+) dB/) || [])[1]);
  const lufsAll = [...t.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop();
  return { max, mean, lufs: lufsAll ? parseFloat(lufsAll[1]) : NaN };
}
import { spawnSync } from 'node:child_process';

async function generate(j, rawPath) {
  const k = key();
  let res;
  if (j.kind === 'sfx') {
    res = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
      method: 'POST', headers: { 'xi-api-key': k, 'content-type': 'application/json' },
      body: JSON.stringify({ text: j.prompt, duration_seconds: j.dur, prompt_influence: settings.promptInfluence, model_id: settings.sfxModel, ...(j.loop ? { loop: true } : {}) }),
    });
  } else {
    res = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
      method: 'POST', headers: { 'xi-api-key': k, 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: j.prompt, music_length_ms: Math.round(j.dur * 1000), model_id: settings.musicModel, force_instrumental: true }),
    });
  }
  if (!res.ok) throw new Error(`${j.id}: HTTP ${res.status} ${(await res.text()).slice(0, 300).replace(k, '***')}`);
  fs.writeFileSync(rawPath, Buffer.from(await res.arrayBuffer()));
}

function polish(j, rawPath, outPath) {
  const tmp = outPath + '.tmp.wav';
  const isMusic = j.kind === 'music';
  // 0) seam 곡: 소리 모양이 가장 닮은 두 지점을 찾아 그 사이만 쓴다(도입부·끝맺음 버림, 40ms 이음). FOF_PY=numpy·scipy 있는 python
  if (isMusic && j.seam) {
    const cut = outPath + '.cut.wav';
    const r = execFileSync(process.env.FOF_PY || 'python3', [path.join(root, 'scripts/audio/loop_music.py'), rawPath, cut], { encoding: 'utf8' });
    console.log(`  loop ${j.id}: ${r.trim()}`);
    const tmp2 = outPath + '.tmp.wav';
    ff(['-i', cut, '-ar', '44100', '-ac', '2', tmp2]); fs.unlinkSync(cut);
    return finish(j, tmp2, outPath, true);
  }
  // 1) 앞 무음 자르기 (SFX 는 즉시 반응해야 하므로 -50dB 이하만 제거)
  const base = ['-i', rawPath, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB:start_duration=0.01,asetpts=PTS-STARTPTS', '-ar', '44100', ...(isMusic ? ['-ac', '2'] : ['-ac', '1'])];
  ff([...base, tmp]);
  return finish(j, tmp, outPath, false);
}
function finish(j, tmp, outPath, seamDone) {
  const isMusic = j.kind === 'music';
  let cur = tmp;
  // 2) 루프 이음매: 꼬리를 머리에 교차 페이드
  if (j.loop && !seamDone) {
    const D = probe(cur);
    const X = isMusic ? 2.5 : Math.min(0.25, D / 6);
    const loopf = outPath + '.loop.wav';
    ff(['-i', cur, '-filter_complex',
      `[0:a]atrim=${(D - X).toFixed(3)}:${D.toFixed(3)},asetpts=PTS-STARTPTS[t];[0:a]atrim=0:${X.toFixed(3)},asetpts=PTS-STARTPTS[h];[0:a]atrim=${X.toFixed(3)}:${(D - X).toFixed(3)},asetpts=PTS-STARTPTS[r];[t][h]acrossfade=d=${X.toFixed(3)}:c1=qsin:c2=qsin[x];[x][r]concat=n=2:v=0:a=1[o]`,
      '-map', '[o]', loopf]);
    fs.unlinkSync(cur); cur = loopf;
  }
  // 3) 소리 크기: 음악 -20 LUFS, 긴 SFX -16 LUFS, 짧은 SFX(<1.5s) 봉우리 -3 dBFS
  const D = probe(cur);
  const m = measure(cur);
  let gain, limit;
  if (!isMusic && D < 1.5) { gain = -3 - m.max; limit = 0.708; }
  else { gain = (isMusic ? -20 : -16) - m.lufs; limit = isMusic ? 0.89 : 0.84; }
  const fades = isMusic && !j.loop ? `,afade=t=out:st=${(D - 3).toFixed(2)}:d=3` : (!isMusic && !j.loop ? `,afade=t=out:st=${Math.max(0, D - 0.04).toFixed(3)}:d=0.04` : '');
  const br = isMusic ? '128k' : '96k';
  ff(['-i', cur, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=${limit}:level=disabled:attack=1:release=50${fades}`, '-c:a', 'libmp3lame', '-b:a', br, outPath]);
  fs.unlinkSync(cur);
}

const manifestPath = path.join(OUT, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
const subBefore = async () => (await (await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key() } })).json()).character_count;

const todo = jobs.filter((j) => !only || only.includes(j.id));
let made = 0;
const before = flag('--dry') ? 0 : await subBefore();
for (const j of todo) {
  const h = hash(j);
  const rawPath = path.join(RAW, `${j.id}_${h}.mp3`);
  const outName = `${j.id}_${h}.mp3`;
  const outPath = path.join(OUT, outName);
  const needGen = !fs.existsSync(rawPath);
  const needPolish = flag('--redo') || !fs.existsSync(outPath);
  if (flag('--dry')) { console.log(j.id, h, needGen ? 'GEN' : 'raw ok', needPolish ? 'POLISH' : 'done'); continue; }
  if (needGen && !flag('--polish-only')) {
    process.stdout.write(`gen ${j.id} ... `);
    for (let t = 0; t < 3; t++) {
      await generate(j, rawPath); made++;
      const mx = measure(rawPath).max;
      if (mx > -30) { console.log(`ok (max ${mx} dB)`); break; }
      console.log(`too quiet (${mx} dB), retry`);
      if (t === 2) { fs.unlinkSync(rawPath); throw new Error(`${j.id}: silent output`); }
    }
  }
  if (!fs.existsSync(rawPath)) continue;
  if (needPolish) polish(j, rawPath, outPath);
  // 이전 해시 파일 정리
  for (const f of fs.readdirSync(OUT)) if (f.startsWith(j.id + '_') && f !== outName && /^[0-9a-f]{8}\.mp3$/.test(f.slice(j.id.length + 1))) fs.unlinkSync(path.join(OUT, f));
  const m = measure(outPath);
  manifest[j.id] = { file: outName, kind: j.kind, loop: !!j.loop, dur: +probe(outPath).toFixed(2), prompt: j.prompt, max: m.max, lufs: m.lufs, date: new Date().toISOString().slice(0, 10) };
}
if (!flag('--dry')) {
  const ordered = {};
  for (const j of jobs) if (manifest[j.id]) ordered[j.id] = manifest[j.id];
  fs.writeFileSync(manifestPath, JSON.stringify(ordered, null, 1));
  const rows = Object.entries(ordered).map(([id, m]) => `| ${m.file} | ElevenLabs ${m.kind === 'music' ? 'Music (' + settings.musicModel + ')' : 'Sound Effects (' + settings.sfxModel + ')'} | ${m.prompt.replace(/\|/g, '/')} | ${m.dur}s${m.loop ? ' loop' : ''} | ${m.date} | Creator, 상업 이용 가능 |`);
  fs.writeFileSync(path.join(OUT, 'CREDITS.md'), ['# 소리 출처', '', '모든 소리는 ElevenLabs 로 생성했다(요금제: Creator, 상업 이용 가능). 원본은 assets_src/audio/raw/(git 제외), 다듬은 파일이 이 폴더. 생성 스크립트: scripts/audio/gen_eleven.mjs, 작업표: scripts/audio/sfx_jobs.json.', '', '| 파일 | 만든 곳 | 프롬프트 | 길이 | 생성일 | 요금제 |', '|---|---|---|---|---|---|', ...rows, ''].join('\n'));
  const after = await subBefore();
  console.log(`generated ${made}; credits used this run: ${after - before}`);
}
