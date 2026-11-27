/// <reference types="vite/client" />
// 시제품 소리: 효과음(Web Audio, 낮은 지연) + 배경음(교차 페이드) 관리자.
// 파일은 scripts/audio/gen_eleven.mjs 가 만든 audio/*.mp3 (Vite 가 주소를 붙인다 → GitHub Pages 하위 경로에서도 동작).
// 첫 탭 전에는 소리를 내지 않는다(iOS 잠금 해제 + 사용자 약속). 시뮬레이션은 건드리지 않는다.
import manifestJson from './audio/manifest.json';
import spriteJson from './audio/babble.json';
import { planSpeech, voiceOf, type Speech } from './babble';

export type SoundId = string;
interface Meta { file: string; kind: 'sfx' | 'music'; loop: boolean; dur: number; prompt: string }
export const manifest = manifestJson as unknown as Record<SoundId, Meta>;
const urls = import.meta.glob('./audio/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
/** 웅얼거림 음절 묶음(U-36): 목록(manifest)에 없는 한 파일 + 구간표 {이름: [시작, 길이]} */
const BABBLE = 'babble';
const SPRITE = spriteJson as unknown as Record<string, [number, number]>;
const urlOf = (id: SoundId): string | undefined => { if (id === BABBLE) return urls['./audio/babble.mp3']; const m = manifest[id]; return m ? urls[`./audio/${m.file}`] : undefined; };

/** 소리마다 기본 크기(등급 소/중/대, game-feel). 파일은 모두 같은 크기로 다듬어져 있어 여기서 맞춘다. */
const VOL: Record<string, number> = {
  tap_gather_a: 0.45, tap_gather_b: 0.45, tap_gather_c: 0.45, acorn_arrive: 0.3, ui_tap: 0.35, insufficient: 0.5,
  buy: 0.7, unlock_tab: 0.8, new_equipment: 0.85, goal_complete: 0.75, settle_bell: 0.6,
  collector_steps: 0.6, collector_paid: 0.8, overdue_stamp: 0.9, cutin_whoosh: 0.55, phone_open: 0.6,
  order_long: 0.65, order_short: 0.65, close_profit: 0.85, close_loss: 0.8, near_liq_heartbeat: 0.5,
  liquidation: 1, ending_bankrupt_stamp: 1, rebirth: 0.9, shutter: 0.7,
  // U-49 새 소리
  win_coins: 0.8, win_fanfare: 0.85, win_jackpot: 0.95, liq_gavel: 1, saved_phew: 0.8, paw_stamp: 0.85, news_alarm: 0.6, milestone_up: 0.7, hamster_cheer: 0.6,
};
const MUSIC_VOL: Record<string, number> = { bgm_lot_day_a: 0.5, bgm_lot_day_b: 0.5, bgm_lot_day_c: 0.5, bgm_lot_night_a: 0.5, bgm_lot_night_b: 0.5, bgm_trade_a: 0.45, bgm_trade_b: 0.45, bgm_ending: 0.55 };
const MIN_GAP: Record<string, number> = { tap_gather: 55, acorn_arrive: 110, ui_tap: 80, insufficient: 250, default: 40 };

const PREF_KEY = 'fof_audio_v1';
interface Prefs { sfx: boolean; music: boolean }
function loadPrefs(): Prefs {
  try { const p = JSON.parse(localStorage.getItem(PREF_KEY) ?? ''); return { sfx: p.sfx !== false, music: p.music !== false }; } catch { return { sfx: true, music: true }; }
}
function savePrefs(p: Prefs): void { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* 저장소 막힘 */ } }

let ctx: AudioContext | null = null;
let sfxBus: GainNode, musicBus: GainNode, duckBus: GainNode;
let prefs = loadPrefs();
let unlocked = false;
const buffers = new Map<SoundId, AudioBuffer>();
const loading = new Map<SoundId, Promise<AudioBuffer | null>>();
const lastAt = new Map<string, number>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

const bytes = (url: string) => new Promise<ArrayBuffer>((res, rej) => { const x = new XMLHttpRequest(); x.open('GET', url); x.responseType = 'arraybuffer'; x.onload = () => (x.status < 400 || x.status === 0 ? res(x.response as ArrayBuffer) : rej(new Error(String(x.status)))); x.onerror = () => rej(new Error('net')); x.send(); });
function load(id: SoundId): Promise<AudioBuffer | null> {
  const have = buffers.get(id);
  if (have) return Promise.resolve(have);
  const pend = loading.get(id);
  if (pend) return pend;
  const url = urlOf(id);
  if (!url || !ctx) return Promise.resolve(null);
  const c = ctx;
  // 같은 출처의 정적 파일만 읽는다(앱의 네트워크 연결은 서버 하나뿐이라는 점검에 걸리지 않게 XHR).
  const p = bytes(url).then((ab) => new Promise<AudioBuffer>((res, rej) => c.decodeAudioData(ab, res, rej)))
    .then((b) => { buffers.set(id, b); return b; }).catch(() => null);
  loading.set(id, p);
  return p;
}

/** 첫 사용자 동작에서 부른다. 컨텍스트를 만들고 자주 쓰는 소리를 미리 읽는다. */
export function unlock(): void {
  if (unlocked) { if (ctx?.state === 'suspended') void ctx.resume(); return; }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  sfxBus = ctx.createGain(); musicBus = ctx.createGain(); duckBus = ctx.createGain();
  sfxBus.connect(ctx.destination);
  musicBus.connect(duckBus); duckBus.connect(ctx.destination);
  sfxBus.gain.value = prefs.sfx ? 1 : 0;
  musicBus.gain.value = prefs.music ? 1 : 0;
  void ctx.resume();
  unlocked = true;
  ['tap_gather_a', 'tap_gather_b', 'tap_gather_c', 'acorn_arrive', 'buy', 'ui_tap', 'insufficient', BABBLE].forEach((i) => void load(i));
  applyMusic();
  applyHeartbeat();
  notify();
}
/** 처음 한 번만 걸어 두는 전역 첫 탭 감지. */
export function armUnlock(): () => void {
  const f = () => unlock();
  window.addEventListener('pointerdown', f, { passive: true });
  window.addEventListener('keydown', f);
  return () => { window.removeEventListener('pointerdown', f); window.removeEventListener('keydown', f); };
}

export interface PlayOpts { vol?: number; rate?: number; delay?: number }
export function play(id: SoundId, o: PlayOpts = {}): void {
  if (!ctx || !unlocked || !prefs.sfx) return;
  const grp = id.startsWith('tap_gather') ? 'tap_gather' : id;
  const now = performance.now();
  if (now - (lastAt.get(grp) ?? -1e9) < (MIN_GAP[grp] ?? MIN_GAP.default)) return;
  lastAt.set(grp, now);
  const c = ctx;
  void load(id).then((b) => {
    if (!b) return;
    const s = c.createBufferSource();
    s.buffer = b;
    if (o.rate) s.playbackRate.value = o.rate;
    const g = c.createGain();
    g.gain.value = (o.vol ?? 1) * (VOL[id] ?? 0.7);
    s.connect(g); g.connect(sfxBus);
    s.start(c.currentTime + (o.delay ?? 0));
  });
}
/** 탭 소리: 3가지 중 하나 + 살짝 다른 음높이(반복 피로 줄이기). */
let lastTap = -1;
export function playTap(): void {
  let i = Math.floor(Math.random() * 3);
  if (i === lastTap) i = (i + 1) % 3;
  lastTap = i;
  play(['tap_gather_a', 'tap_gather_b', 'tap_gather_c'][i], { rate: 0.93 + Math.random() * 0.16 });
}
export const later = (ms: number, f: () => void): number => window.setTimeout(f, ms);

// ---- 배경음 ----
let wantMusic: SoundId | null = null;
let curMusic: { id: SoundId; src: AudioBufferSourceNode; gain: GainNode } | null = null;
const XFADE = 1.6;
function applyMusic(): void {
  if (!ctx || !unlocked) return;
  const id = wantMusic;
  if (curMusic && curMusic.id === id) return;
  const c = ctx;
  const old = curMusic;
  curMusic = null;
  if (old) {
    const t = c.currentTime;
    old.gain.gain.cancelScheduledValues(t);
    old.gain.gain.setValueAtTime(old.gain.gain.value, t);
    old.gain.gain.linearRampToValueAtTime(0, t + XFADE);
    try { old.src.stop(t + XFADE + 0.05); } catch { /* 이미 멈춤 */ }
  }
  if (!id) return;
  void load(id).then((b) => {
    if (!b || wantMusic !== id || curMusic) return;
    const s = c.createBufferSource();
    s.buffer = b;
    s.loop = !!manifest[id]?.loop;
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(MUSIC_VOL[id] ?? 0.5, t + (old ? XFADE : 0.8));
    s.connect(g); g.connect(musicBus);
    s.start();
    curMusic = { id, src: s, gain: g };
  });
}
export function setMusic(id: SoundId | null): void { wantMusic = id; applyMusic(); }

/** 컷인 등 사건 동안 배경음을 낮춘다. */
export function duck(on: boolean): void {
  if (!ctx) return;
  const t = ctx.currentTime;
  duckBus.gain.cancelScheduledValues(t);
  duckBus.gain.setValueAtTime(duckBus.gain.value, t);
  duckBus.gain.linearRampToValueAtTime(on ? 0.3 : 1, t + (on ? 0.2 : 0.8));
}

// ---- 청산 임박 심장박동(겹쳐 깔림) ----
let wantBeat = false;
let beatRate = 1;
let beat: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
function applyHeartbeat(): void {
  if (!ctx || !unlocked) return;
  const c = ctx;
  if (wantBeat && !beat && prefs.sfx) {
    void load('near_liq_heartbeat').then((b) => {
      if (!b || !wantBeat || beat) return;
      const s = c.createBufferSource(); s.buffer = b; s.loop = true; s.playbackRate.value = beatRate;
      const g = c.createGain(); g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(VOL.near_liq_heartbeat, c.currentTime + 0.6);
      s.connect(g); g.connect(sfxBus); s.start();
      beat = { src: s, gain: g };
    });
  } else if ((!wantBeat || !prefs.sfx) && beat) {
    const b = beat; beat = null;
    const t = c.currentTime;
    b.gain.gain.setValueAtTime(b.gain.gain.value, t);
    b.gain.gain.linearRampToValueAtTime(0, t + 0.4);
    try { b.src.stop(t + 0.45); } catch { /* 이미 멈춤 */ }
  }
}
/** danger 0~1(청산까지 얼마나 왔나): 가까울수록 심장이 빨라진다(U-49, 1배 → 1.6배) */
export function setHeartbeat(on: boolean, danger = 0): void {
  wantBeat = on;
  beatRate = 1 + 0.6 * Math.max(0, Math.min(1, danger));
  if (beat && ctx) beat.src.playbackRate.setTargetAtTime(beatRate, ctx.currentTime, 0.3);
  applyHeartbeat();
}

// ---- 웅얼거림 대사(U-36) ----
/** 효과음보다 조금 작게(효과음 버스를 지나므로 효과음 끄기를 그대로 따른다) */
const BABBLE_VOL = 0.5;
/** 음절마다 소리 조각 하나: 빠르기 = 높이, 6ms 로 올리고 12ms 로 내린다. from 초보다 앞선 음절은 건너뛴다(늦게 읽힌 경우). */
function scheduleBabble(c: BaseAudioContext, out: AudioNode, buf: AudioBuffer, sp: Speech, t0: number, from = 0): AudioBufferSourceNode[] {
  const srcs: AudioBufferSourceNode[] = [];
  for (const b of sp.blips) {
    const seg = SPRITE[b.name];
    if (!seg || b.at < from) continue;
    const s = c.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = b.rate;
    const g = c.createGain();
    const t = t0 + b.at;
    g.gain.value = 0;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(b.gain, t + 0.006);
    g.gain.setValueAtTime(b.gain, t + b.dur - 0.012);
    g.gain.linearRampToValueAtTime(0, t + b.dur);
    s.connect(g); g.connect(out);
    s.start(t, seg[0], Math.min(b.dur * b.rate, seg[1]));
    s.stop(t + b.dur + 0.005);
    srcs.push(s);
  }
  return srcs;
}
let speaking: { out: GainNode; srcs: AudioBufferSourceNode[]; until: number } | null = null;
const hush = () => { /* 낼 소리 없음 */ };
/** 대사 한 줄을 웅얼거린다(한 번에 한 줄: 새 줄이 오면 앞 줄은 끊긴다). 돌려주는 함수를 부르면 그 줄이 멈춘다. 첫 탭 전·효과음 끔이면 소리 없음. */
export function speak(sp: Speech, delay = 0): () => void {
  if (!ctx || !unlocked || !prefs.sfx || !sp.blips.length) return hush;
  stopSpeaking();
  const c = ctx;
  const out = c.createGain();
  out.gain.value = BABBLE_VOL;
  out.connect(sfxBus);
  const t0 = c.currentTime + delay + 0.02;
  const me = { out, srcs: [] as AudioBufferSourceNode[], until: t0 + sp.total };
  speaking = me;
  void load(BABBLE).then((b) => { if (b && speaking === me) me.srcs = scheduleBabble(c, out, b, sp, t0, c.currentTime - t0); });
  return () => { if (speaking === me) stopSpeaking(); };
}
export function stopSpeaking(): void {
  const me = speaking;
  if (!me || !ctx) return;
  speaking = null;
  const t = ctx.currentTime;
  me.out.gain.setValueAtTime(me.out.gain.value, t);
  me.out.gain.linearRampToValueAtTime(0, t + 0.03);
  me.srcs.forEach((s) => { try { s.stop(t + 0.04); } catch { /* 이미 멈춤 */ } });
  window.setTimeout(() => me.out.disconnect(), 120);
}
/** 검증용(개발 서버): 같은 예약 코드로 한 줄을 소리 없이 그려 본다 → 16비트 표본 */
async function renderBabble(text: string, who: string): Promise<{ sr: number; sec: number; peak: number; rms: number; blips: number; pcm: number[] } | null> {
  const v = voiceOf(who);
  if (!v) return null;
  const sp = planSpeech(text, v);
  const sr = 44100;
  const oc = new OfflineAudioContext(1, Math.ceil(sp.total * sr), sr);
  const ab = await bytes(urlOf(BABBLE) as string);
  const buf = await oc.decodeAudioData(ab);
  const out = oc.createGain(); out.gain.value = BABBLE_VOL; out.connect(oc.destination);
  scheduleBabble(oc, out, buf, sp, 0);
  const d = (await oc.startRendering()).getChannelData(0);
  let peak = 0, sq = 0;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sq += d[i] * d[i]; }
  return { sr, sec: d.length / sr, peak, rms: Math.sqrt(sq / d.length), blips: sp.blips.length, pcm: Array.from(d, (x) => Math.round(Math.max(-1, Math.min(1, x)) * 32767)) };
}

// ---- 켜고 끄기 ----
export const getPrefs = (): Prefs & { unlocked: boolean } => ({ ...prefs, unlocked });
export function setPrefs(p: Partial<Prefs>): void {
  prefs = { ...prefs, ...p };
  savePrefs(prefs);
  if (ctx) {
    const t = ctx.currentTime;
    sfxBus.gain.setTargetAtTime(prefs.sfx ? 1 : 0, t, 0.05);
    musicBus.gain.setTargetAtTime(prefs.music ? 1 : 0, t, 0.05);
  }
  if (!prefs.sfx) stopSpeaking();
  applyHeartbeat();
  notify();
}
export function subscribe(f: () => void): () => void { listeners.add(f); return () => { listeners.delete(f); }; }

// ---- 시청(오디션 페이지용): 켜기/끄기 설정과 상관없이 한 번 들려준다 ----
let prev: AudioBufferSourceNode | null = null;
export function preview(id: SoundId): void {
  unlock();
  if (!ctx) return;
  const c = ctx;
  try { prev?.stop(); } catch { /* 이미 멈춤 */ }
  setMusic(null);
  void load(id).then((b) => {
    if (!b) return;
    const s = c.createBufferSource(); s.buffer = b;
    const g = c.createGain(); g.gain.value = manifest[id].kind === 'music' ? (MUSIC_VOL[id] ?? 0.5) : (VOL[id] ?? 0.7);
    s.connect(g); g.connect(c.destination); s.start();
    prev = s;
  });
}
export function stopPreview(): void { try { prev?.stop(); } catch { /* 이미 멈춤 */ } prev = null; }

if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __audio?: unknown }).__audio = { buffers, setHeartbeat, renderBabble, speaking: () => !!speaking && !!ctx && speaking.srcs.length > 0 && ctx.currentTime < speaking.until, state: () => ({ ctx: ctx?.state, music: curMusic?.id, beat: !!beat, unlocked }) };
