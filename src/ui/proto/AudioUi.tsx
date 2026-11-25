// 소리 화면 쪽: 첫 탭 해제, 배경음 감독(장면 → 곡), HUD 소리 스티커, 오디션 페이지(?pdev=sounds).
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useGame } from '../../store/gameStore';
import { useProto } from './protoStore';
import { armUnlock, duck, getPrefs, later, manifest, play, preview, setHeartbeat, setMusic, setPrefs, stopPreview, subscribe } from './audio';
import { tintAt, useClock } from './fx';
import { pdev } from './config';

const usePrefs = () => { const [, f] = useState(0); useEffect(() => subscribe(() => f((n) => n + 1)), []); return getPrefs(); };

/** 장면에 따라 곡·심장박동·컷인 소리 낮춤·탭 소리·엔딩/환생 소리를 고른다. */
export function useAudioDirector(near: boolean): void {
  const tab = useProto((s) => s.tab);
  const cutin = useProto((s) => s.cutin);
  const step = useGame((s) => s.g.estate?.step ?? null);
  const night = tintAt(useClock()).night;
  useEffect(() => armUnlock(), []);
  useEffect(() => {
    if (pdev === 'sounds') { setMusic(null); return; }
    setMusic(step === 'card' ? 'bgm_ending' : tab === 'phone' ? 'bgm_trade' : night ? 'bgm_lot_night' : 'bgm_lot_day');
  }, [tab, night, step]);
  useEffect(() => { setHeartbeat(near && !step && pdev !== 'sounds'); }, [near, step]);
  useEffect(() => { duck(!!cutin); }, [cutin]);
  const prevTab = useRef(tab);
  useEffect(() => {
    if (prevTab.current !== tab) play(tab === 'phone' ? 'phone_open' : 'ui_tap');
    prevTab.current = tab;
  }, [tab]);
  useEffect(() => {
    if (step === 'card') { const t = later(650, () => play('ending_bankrupt_stamp')); return () => window.clearTimeout(t); }
    if (step && step !== 'statement') play('rebirth');
  }, [step]);
}

const Speaker = ({ waves, x }: { waves: boolean; x: boolean }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="#4A4640" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="#F3E7C6" />
    {waves && <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />}
    {x && <path d="M16 9.5l5 5M21 9.5l-5 5" />}
  </svg>
);

/** HUD 소리 스티커: 켬 → 음악만 끔 → 효과음만 끔 → 모두 끔 순환. 첫 탭 전에는 꺼진 모양. */
export function SoundBtn() {
  const p = usePrefs();
  const next = () => {
    if (!p.unlocked) return; // 이 누름 자체가 소리를 깨운다
    if (p.music && p.sfx) setPrefs({ music: false });
    else if (!p.music && p.sfx) setPrefs({ music: true, sfx: false });
    else if (p.music && !p.sfx) setPrefs({ music: false });
    else setPrefs({ music: true, sfx: true });
  };
  const label = !p.unlocked ? '탭하면 소리' : p.music && p.sfx ? '소리 켬' : !p.music && p.sfx ? '효과음만' : p.music ? '음악만' : '소리 끔';
  const on = p.unlocked && (p.music || p.sfx);
  return (
    <button className={'pr-snd' + (on ? ' on' : '')} onClick={next} aria-label={`소리 설정: ${label}`}>
      <Speaker waves={on} x={!on} />
      <small>{label}</small>
    </button>
  );
}

/** ?pdev=sounds : 모든 소리를 눌러 들어 보는 페이지 */
export function SoundLab() {
  const [now, setNow] = useState<string | null>(null);
  const ids = Object.keys(manifest);
  const group = (k: 'sfx' | 'music') => ids.filter((i) => manifest[i].kind === k);
  const row = (id: string) => (
    <li key={id} className={now === id ? 'on' : ''}>
      <button onClick={() => { if (now === id) { stopPreview(); setNow(null); } else { preview(id); setNow(id); window.setTimeout(() => setNow((n) => (n === id ? null : n)), manifest[id].dur * 1000); } }} aria-label={`${id} 재생`}>{now === id ? '■' : '▶'}</button>
      <div><b>{id}</b> <i>{manifest[id].dur.toFixed(1)}s{manifest[id].loop ? ' · 반복' : ''}</i><p>{manifest[id].prompt}</p></div>
    </li>
  );
  return (
    <div className="pr-lab" role="dialog" aria-label="소리 오디션">
      <h2>소리 오디션</h2>
      <p className="hint">▶ 를 눌러 들어 보세요. 이름 끝에 _b 가 붙은 것은 같은 자리의 다른 후보입니다.</p>
      <h3>배경음 (ElevenLabs Music)</h3><ul>{group('music').map(row)}</ul>
      <h3>효과음 (ElevenLabs Sound Effects)</h3><ul>{group('sfx').map(row)}</ul>
    </div>
  );
}
