#!/usr/bin/env python3
"""음악 생성물에서 이음매 없는 반복 구간을 찾아 자른다(numpy, scipy 필요).
사용: loop_music.py in.mp3 out.wav [--report]
원리: 곡 앞쪽 시작점 s 와 뒤쪽 끝점 e 중, s 앞뒤 ±1초의 소리 모양(로그 스펙트럼)이 e 앞뒤와 가장 닮은 쌍을 고른다.
  → 같은 박·같은 마디 자리가 되고, 첫 도입부와 끝맺음은 버려진다. 이음매는 e 직전 40ms 를 s 직전 소리와 등출력 교차 페이드해서 이어 준다.
"""
import subprocess, sys, json
import numpy as np
from scipy.signal import stft

src, dst = sys.argv[1], sys.argv[2]
SR = 44100
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
a = np.frombuffer(raw, np.float32).reshape(-1, 2).copy()
mono = a.mean(1)
D = len(mono) / SR

# 특징: 22.05k 로 내려 40 개 로그 대역
m22 = mono[::2]
HOP = 512
f, t, Z = stft(m22, 22050, nperseg=2048, noverlap=2048 - HOP)
mag = np.abs(Z)
edges = np.geomspace(60, 9000, 41)
bands = np.stack([mag[(f >= lo) & (f < hi)].sum(0) for lo, hi in zip(edges[:-1], edges[1:])], 1)
F = np.log(bands + 1e-4)
F -= F.mean(1, keepdims=True)  # 소리 크기 차이는 무시하고 모양만
fps = 22050 / HOP

# 박 길이(참고용): 온셋 포락선 자기상관
on = np.maximum(0, np.diff(bands.sum(1)))
on -= on.mean()
ac = np.correlate(on, on, 'full')[len(on) - 1:]
lo_, hi_ = int(fps * 60 / 140), int(fps * 60 / 60)
beat = (lo_ + int(np.argmax(ac[lo_:hi_]))) / fps
bpm = 60 / beat

offs = np.arange(-40, 41, 4)
s_idx = np.arange(int(4 * fps), int(24 * fps))
e_lo, e_hi = int(36 * fps), len(F) - 41
best = (1e9, 0, 0)
for s in s_idx:
    es = np.arange(s + e_lo, e_hi - 0)
    if len(es) == 0: continue
    S = F[s + offs]  # (O, 40)
    E = F[es[:, None] + offs[None, :]]  # (N, O, 40)
    d = ((E - S[None]) ** 2).mean((1, 2))
    k = int(np.argmin(d))
    if d[k] < best[0]: best = (float(d[k]), int(s), int(es[k]))
dist, s, e = best
s_t, e_t = s / fps, e / fps
# 나머지 쌍의 평균 거리(비교용)
rng = np.random.default_rng(0)
rs = rng.integers(s_idx[0], s_idx[-1], 400); re = rng.integers(e_lo + s_idx[0], e_hi, 400)
base = float(np.mean([((F[x + offs] - F[y + offs]) ** 2).mean() for x, y in zip(rs, re) if y + 40 < len(F)]))

# 시작점을 가까운 영교차 + 박 단위로 미세 조정은 하지 않고(이미 소리 모양으로 맞춤) 샘플 단위로 s 를 고정
si, ei = int(round(s_t * SR)), int(round(e_t * SR))
X = int(0.04 * SR)
loop = a[si:ei].copy()
tail = a[ei - X:ei]
pre = a[si - X:si]
w = np.linspace(0, np.pi / 2, X)[:, None]
loop[-X:] = tail * np.cos(w) + pre * np.sin(w)
pcm = (np.clip(loop, -1, 1) * 32767).astype('<i2')
import wave
with wave.open(dst, 'wb') as wf:
    wf.setnchannels(2); wf.setsampwidth(2); wf.setframerate(SR); wf.writeframes(pcm.tobytes())
print(json.dumps({'in': round(D, 2), 'start': round(s_t, 2), 'end': round(e_t, 2), 'len': round((ei - si) / SR, 2), 'bpm_est': round(bpm, 1), 'bars_of_4': round((ei - si) / SR / (beat * 4), 2), 'dist': round(dist, 3), 'random_dist': round(base, 3)}))
