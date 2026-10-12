"""Synthesize the original background track (no samples, no licensing).

Run from the promo-video folder:  python scripts/generate-music.py
Writes public/music.mp3. Needs numpy and ffmpeg.
"""

import subprocess
import wave
from pathlib import Path

import numpy as np

SR = 44100
BPM = 104
BEAT = 60 / BPM
BARS = 26  # ~60s
rng = np.random.default_rng(7)

# I – vi – IV – V in C, voiced as 7th chords
CHORDS = [
    [48, 55, 59, 64, 67],  # Cmaj7
    [45, 52, 55, 60, 64],  # Am7
    [41, 48, 52, 57, 64],  # Fmaj7
    [43, 50, 53, 59, 62],  # G7sus-ish
]


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


total = int(BARS * 4 * BEAT * SR)
pad = np.zeros(total)
pluck = np.zeros(total)
bass = np.zeros(total)
drums = np.zeros(total)


def add(buf, start, sig):
    end = min(len(buf), start + len(sig))
    buf[start:end] += sig[: end - start]


bar_len = int(4 * BEAT * SR)
for bar in range(BARS):
    chord = CHORDS[bar % 4]
    start = bar * bar_len
    t = np.arange(bar_len + SR) / SR

    # Pad: detuned saws, slow attack/release
    env = np.minimum(1, t / 0.6) * np.clip((bar_len / SR + 0.8 - t) / 0.8, 0, 1)
    sig = np.zeros_like(t)
    for note in chord[1:]:
        for detune in (-0.12, 0.0, 0.12):
            f = hz(note + detune)
            sig += 2 * ((t * f) % 1) - 1
    add(pad, start, sig * env * 0.018)

    # Bass: root on beats 1 and 3 (and the "and" of 4)
    for beat in (0, 2, 3.5):
        n = int(BEAT * 1.4 * SR)
        tt = np.arange(n) / SR
        f = hz(chord[0] - 12)
        s = np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(4 * np.pi * f * tt)
        add(bass, start + int(beat * BEAT * SR), s * np.exp(-tt * 3) * 0.32)

    # Pluck arpeggio in 8ths (after the intro bar)
    if bar >= 1:
        pattern = [1, 2, 3, 4, 3, 2, 4, 3]
        for step, idx in enumerate(pattern):
            n = int(0.6 * SR)
            tt = np.arange(n) / SR
            f = hz(chord[idx] + 12)
            s = np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(6 * np.pi * f * tt)
            add(pluck, start + int(step * BEAT / 2 * SR), s * np.exp(-tt * 9) * 0.07)

    # Drums from bar 2: soft kick, clap-ish snare, hats
    if bar >= 2 and bar < BARS - 1:
        for beat in range(4):
            pos = start + int(beat * BEAT * SR)
            n = int(0.35 * SR)
            tt = np.arange(n) / SR
            kick = np.sin(2 * np.pi * (45 + 90 * np.exp(-tt * 30)) * tt) * np.exp(-tt * 9)
            if beat in (0, 2):
                add(drums, pos, kick * 0.55)
            else:
                noise = rng.standard_normal(n) * np.exp(-tt * 22)
                add(drums, pos, noise * 0.08)
            for half in (0, 1):
                hn = int(0.05 * SR)
                ht = np.arange(hn) / SR
                hat = np.diff(rng.standard_normal(hn + 1)) * np.exp(-ht * 90)
                add(drums, pos + int(half * BEAT / 2 * SR), hat * 0.035)

mix = lowpass(pad, 1800) + pluck + lowpass(bass, 400) + drums

# Fade in/out
t = np.arange(total) / SR
mix *= np.minimum(1, t / 1.5) * np.clip((total / SR - t) / 3.0, 0, 1)

# Simple stereo widening with a short delay on the plucks/pad
left = mix
right = np.concatenate([np.zeros(int(0.012 * SR)), mix])[:total] * 0.9 + mix * 0.1
stereo = np.stack([left, right], axis=1)
stereo /= np.max(np.abs(stereo)) / 0.89

root = Path(__file__).resolve().parent.parent
wav_path = root / "public" / "music.wav"
with wave.open(str(wav_path), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((stereo * 32767).astype(np.int16).tobytes())

subprocess.run(
    ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path), "-b:a", "192k", str(root / "public" / "music.mp3")],
    check=True,
)
wav_path.unlink()
print(f"music.mp3: {total / SR:.1f}s")
