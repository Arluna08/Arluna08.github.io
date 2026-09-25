#!/usr/bin/env python3
"""Synthesises the reel's 15 s soundtrack from scratch (numpy + scipy, no samples).

128 BPM, 8 bars in F minor. Every sound effect is placed on the same beat grid as the
visuals, so the ball hops, letter drops, morph waves and impacts are all scored.

    python3 tools/soundtrack.py audio/soundtrack.wav
"""
import sys
import numpy as np
import scipy.signal as ss
from scipy.io import wavfile

SR = 48000
BPM = 128
BEAT = 60 / BPM
DUR = 15.0
N = int(SR * (DUR + 3.0))  # room for tails, trimmed at the end
rng = np.random.default_rng(2026)


def T(b):
    return b * BEAT


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(dur):
    return np.arange(int(dur * SR)) / SR


def noise(n):
    return rng.standard_normal(n)


# ------------------------------------------------------------------ filters
def butter(x, fc, kind='low', order=2):
    fc = np.clip(np.atleast_1d(fc), 20, SR / 2 * 0.95)
    sos = ss.butter(order, fc / (SR / 2) if len(fc) > 1 else fc[0] / (SR / 2), btype=kind, output='sos')
    return ss.sosfilt(sos, x)


def biquad(kind, fc, q):
    w = 2 * np.pi * np.clip(fc, 20, SR * 0.45) / SR
    c, s = np.cos(w), np.sin(w)
    a = s / (2 * q)
    if kind == 'lp':
        b0, b1, b2 = (1 - c) / 2, 1 - c, (1 - c) / 2
    elif kind == 'hp':
        b0, b1, b2 = (1 + c) / 2, -(1 + c), (1 + c) / 2
    else:  # band-pass, constant peak gain
        b0, b1, b2 = a, 0.0, -a
    a0, a1, a2 = 1 + a, -2 * c, 1 - a
    return np.array([b0, b1, b2]) / a0, np.array([1, a1 / a0, a2 / a0])


def tv_filter(x, fc, kind='lp', q=0.8, block=64):
    """Time-varying biquad, coefficients updated every `block` samples (state carried)."""
    fc = np.broadcast_to(fc, x.shape)
    y = np.empty_like(x)
    zi = np.zeros(2)
    for i in range(0, len(x), block):
        b, a = biquad(kind, float(fc[i]), q)
        y[i:i + block], zi = ss.lfilter(b, a, x[i:i + block], zi=zi)
    return y


# ------------------------------------------------------------------ oscillators
def saw_ph(ph, dt):
    """PolyBLEP sawtooth from a phase array (cycles) and per-sample increment."""
    t = ph % 1.0
    y = 2 * t - 1
    m = t < dt
    x = t[m] / dt[m]
    y[m] -= x + x - x * x - 1
    m = t > 1 - dt
    x = (t[m] - 1) / dt[m]
    y[m] -= x * x + x + x + 1
    return y


def saw(freq, n, phase=0.0):
    f = np.broadcast_to(np.asarray(freq, float), (n,))
    dt = f / SR
    ph = phase + np.cumsum(dt)
    return saw_ph(ph, dt)


def supersaw(freq, n, voices=7, detune=0.16):
    offs = np.linspace(-1, 1, voices) * detune
    L = np.zeros(n)
    R = np.zeros(n)
    for i, o in enumerate(offs):
        v = saw(freq * 2 ** (o / 12), n, phase=rng.random())
        pan = (i / (voices - 1)) * 2 - 1
        L += v * np.sqrt((1 - pan) / 2)
        R += v * np.sqrt((1 + pan) / 2)
    return np.stack([L, R]) / voices * 1.6


# ------------------------------------------------------------------ mixer
class Bus:
    def __init__(self):
        self.x = np.zeros((2, N))

    def add(self, sig, t0, gain=1.0, pan=0.0):
        sig = np.asarray(sig, float)
        if sig.ndim == 1:
            pan = np.broadcast_to(np.asarray(pan, float), sig.shape)
            sig = np.stack([sig * np.sqrt((1 - pan) / 2), sig * np.sqrt((1 + pan) / 2)]) * np.sqrt(2)
        # 5 ms fade at the end of every event so nothing ever clicks when it is cut
        nf = min(240, sig.shape[1])
        sig = sig.copy()
        sig[:, -nf:] *= np.linspace(1, 0, nf)
        i = int(round(t0 * SR))
        if i < 0:
            sig = sig[:, -i:]
            i = 0
        n = min(sig.shape[1], N - i)
        if n > 0:
            self.x[:, i:i + n] += sig[:, :n] * gain


drums, bass_bus, music, fx, verb_send, delay_send = Bus(), Bus(), Bus(), Bus(), Bus(), Bus()


def send(sig, t0, gain, pan=0.0, verb=0.0, delay=0.0, bus=None):
    (bus or fx).add(sig, t0, gain, pan)
    if verb:
        verb_send.add(sig, t0, gain * verb, pan)
    if delay:
        delay_send.add(sig, t0, gain * delay, pan)


# ------------------------------------------------------------------ instruments
def kick(punch=1.0):
    t = tt(0.55)
    f = 43 + 120 * np.exp(-t * 26) + 60 * np.exp(-t * 90) * punch
    y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 8.5)
    y *= np.minimum(1, t / 0.0012)
    click = butter(noise(len(t)), 3000, 'high') * np.exp(-t * 500) * 0.3 * punch
    return np.tanh((y + click) * 1.8) / np.tanh(1.8)


def clap():
    t = tt(0.45)
    nz = butter(noise(len(t)), [900, 2600], 'band')
    env = sum(np.exp(-np.maximum(t - k * 0.0085, 0) * 150) * (t >= k * 0.0085) for k in range(3)) * 0.7
    env += np.exp(-np.maximum(t - 0.024, 0) * 14) * (t >= 0.024) * 0.8
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 32) * 0.35
    return nz * env * 0.6 + body


def hat(open_=False):
    t = tt(0.35 if open_ else 0.08)
    nz = butter(noise(len(t)), 7500, 'high', 4)
    return nz * np.exp(-t * (11 if open_ else 70)) * 0.5


def bass_note(midi, dur):
    t = tt(dur + 0.04)
    f = mtof(midi)
    y = 0.65 * saw(f, len(t)) + 0.55 * np.sin(2 * np.pi * f * t)
    fc = 160 + 1500 * np.exp(-t * 16)
    y = tv_filter(y, fc, 'lp', q=1.1)
    env = np.minimum(1, t / 0.004) * np.where(t < dur, 1.0, np.exp(-(t - dur) * 120))
    return np.tanh(y * env * 1.6) * 0.8


def sub(midi, dur):
    t = tt(dur + 0.05)
    env = np.minimum(1, t / 0.01) * np.where(t < dur, 1.0, np.exp(-(t - dur) * 60))
    return np.sin(2 * np.pi * mtof(midi) * t) * env


def pluck(midi, dur=0.6, bright=1.0):
    t = tt(dur)
    f = mtof(midi)
    mod = np.sin(2 * np.pi * f * 2 * t) * 2.6 * bright * np.exp(-t * 16)
    return np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 7) * np.minimum(1, t / 0.002)


def bell(midi, dur=2.4, bright=1.0):
    t = tt(dur)
    f = mtof(midi)
    mod = np.sin(2 * np.pi * f * 3.5 * t) * 3.2 * bright * np.exp(-t * 2.8)
    y = np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 1.7)
    y += 0.25 * np.sin(2 * np.pi * f * 2.01 * t) * np.exp(-t * 3.2)
    return y * np.minimum(1, t / 0.002)


def pop(f0, dur=0.12):
    t = tt(dur)
    f = f0 * (1 + 1.4 * np.exp(-t * 55))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 32) * np.minimum(1, t / 0.001)


def tick(f=3200, dur=0.02):
    t = tt(dur)
    return np.sin(2 * np.pi * f * t) * np.exp(-t * 420) + butter(noise(len(t)), 5000, 'high') * np.exp(-t * 900) * 0.25


def stab(chord, dur=0.24, cutoff=4200):
    n = int((dur + 0.1) * SR)
    t = np.arange(n) / SR
    y = sum(supersaw(mtof(m), n, voices=5, detune=0.12) for m in chord) / len(chord) * 1.4
    env = np.minimum(1, t / 0.003) * np.exp(-t * 7.5) * np.where(t < dur, 1.0, np.exp(-(t - dur) * 40))
    fc = 700 + cutoff * np.exp(-t * 9)
    return np.stack([tv_filter(y[c], fc, 'lp', 0.9) for c in range(2)]) * env


def pad(chord, dur, attack=0.5, release=0.9, cutoff=1500):
    n = int((dur + release) * SR)
    t = np.arange(n) / SR
    y = sum(supersaw(mtof(m), n, voices=7, detune=0.2) for m in chord) / len(chord)
    y = np.stack([butter(y[c], cutoff, 'low') for c in range(2)])
    env = np.minimum(1, t / attack) * np.where(t < dur, 1.0, np.exp(-(t - dur) * (5 / release)))
    return y * env


def riser(dur, f0=300, f1=9000, gain_curve=2.2):
    t = tt(dur)
    p = t / dur
    fc = f0 * (f1 / f0) ** p
    y = tv_filter(noise(len(t)), fc, 'bp', q=2.2) * 1.8
    tone = np.sin(2 * np.pi * np.cumsum(180 * (8 ** p)) / SR) * 0.12
    return (y + tone) * p ** gain_curve


def whoosh(dur=0.35, f0=500, f1=5000, peak=0.55, q=1.4):
    t = tt(dur)
    p = t / dur
    fc = f0 * (f1 / f0) ** p
    y = tv_filter(noise(len(t)), fc, 'bp', q=q) * 2.0
    env = np.where(p < peak, (p / peak) ** 2, ((1 - p) / (1 - peak)) ** 1.5)
    return y * env


def impact(big=1.0):
    t = tt(1.6)
    boom = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-t * 7)) / SR) * np.exp(-t * 4.5)
    burst = butter(noise(len(t)), 1100, 'low') * np.exp(-t * 9) * 0.7
    crack = butter(noise(len(t)), 2500, 'high') * np.exp(-t * 45) * 0.45
    return np.tanh((boom * 1.1 + burst + crack) * 1.3 * big) * 0.9


def revcym(dur=0.8):
    t = tt(dur)
    y = butter(noise(len(t)), 5000, 'high', 2) * (t / dur) ** 3
    return y * 0.8


def boing(dur=0.9):
    t = tt(dur)
    osc = np.exp(-t * 5.5) * np.cos(2 * np.pi * 7.5 * t)
    f = 260 * (1 + 0.55 * osc) * (1 + 0.3 * (1 - np.exp(-t * 8)))
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph + 1.2 * np.sin(ph * 2) * np.exp(-t * 6))
    return y * np.exp(-t * 3.5) * np.minimum(1, t / 0.004)


def shimmer(f0, f1, dur):
    t = tt(dur)
    f = f0 * (f1 / f0) ** (t / dur)
    ph = 2 * np.pi * np.cumsum(f) / SR
    y = np.sin(ph) + 0.5 * np.sin(ph * 2.0 + 0.3) + 0.25 * np.sin(ph * 3.01)
    return y * np.sin(np.pi * t / dur) ** 2 * 0.4


# ------------------------------------------------------------------ harmony (F minor)
CHORDS = {
    0: (41, [56, 60, 63, 67]),     # Fm9
    1: (41, [53, 56, 60, 63]),     # Fm7
    2: (37, [56, 60, 61, 65]),     # Dbmaj7
    3: (44, [56, 60, 63, 67]),     # Abmaj7
    4: (39, [55, 58, 61, 63]),     # Eb7
    5: (41, [56, 60, 63, 67]),     # Fm9 (breakdown)
    6: (37, [56, 60, 61, 65]),     # Db -> Eb (second half)
    7: (41, [56, 60, 63, 67, 72]), # Fm9 (end)
}


def chord_at(b):
    bar = int(b // 4)
    if bar == 6 and b % 4 >= 2:
        return 39, [55, 58, 63, 67]
    return CHORDS[min(bar, 7)]


# ------------------------------------------------------------------ arrangement
kicks = []


def build():
    # --- bar 1: boot-up ticks, ball hops, iris
    for i, t0 in enumerate([0.05, 0.1, 0.16, 0.22, 0.3, 0.38, 0.45]):
        send(tick(2600 + 400 * (i % 3)), t0, 0.12, pan=-0.6 + 0.2 * i)
    send(pad([56, 60, 63, 67], T(3.5), attack=1.2, release=0.3, cutoff=1300), 0.0, 0.24, bus=music)
    for b, m in zip([1.5, 2.0, 2.5], [72, 75, 79]):
        send(pluck(m, 0.7, 0.9), T(b), 0.34, pan=-0.4 + (b - 1.5) * 0.8, verb=0.3, delay=0.18)
        send(pop(420 + 80 * (b - 1.5) * 4), T(b), 0.18)
    send(bell(84, 2.2), T(3.0), 0.28, verb=0.5, delay=0.2)
    send(pluck(79, 0.6), T(3.0), 0.18, pan=0.3, verb=0.3)
    send(riser(T(0.5)), T(3.5), 0.5)
    send(revcym(T(0.6)), T(3.4), 0.35, verb=0.2)

    # --- drums: four on the floor from the drop (beat 4); breakdown in bar 6
    for b in np.arange(4, 32, 1.0):
        if 20 <= b < 24 and b not in (20.0, 22.0):
            continue
        if b >= 28 and b not in (28.0, 30.0, 31.0):
            continue
        punch = 1.3 if b in (4.0, 12.0, 24.0, 28.0) else 1.0
        drums.add(kick(punch), T(b), 0.8 if b < 28 else 0.65)
        kicks.append(T(b))
    for b in np.arange(4, 28, 1.0):
        if b % 2 == 1 and not (20 <= b < 24):
            drums.add(clap(), T(b), 0.42, pan=0.05)
            verb_send.add(clap(), T(b), 0.12)
    for b in np.arange(4, 28, 0.5):
        if 20 <= b < 22:
            continue
        if b % 1 == 0.5:
            drums.add(hat(True), T(b), 0.13, pan=0.25)
        else:
            drums.add(hat(False), T(b), 0.085, pan=-0.2)
    for b in np.arange(8, 28, 0.25):
        if 20 <= b < 22 or b % 0.5 == 0:
            continue
        drums.add(hat(False), T(b), 0.045, pan=0.4)

    # --- bass: offbeat eighths + sub on the beat grid (sidechained later)
    for b in np.arange(4, 28, 0.5):
        if 20 <= b < 24:
            continue
        root, _ = chord_at(b)
        if b % 1 == 0.5:
            bass_bus.add(bass_note(root + 12, T(0.42)), T(b), 0.46)
        bass_bus.add(sub(root + 12, T(0.48)), T(b), 0.2)
    # breakdown: long sub pedal
    bass_bus.add(sub(53, T(3.9)), T(20), 0.3)

    # --- stabs (syncopated), bars 2-5 and 7
    for bar in [1, 2, 3, 4, 6]:
        for off in [0.5, 1.75, 2.5, 3.25]:
            b = bar * 4 + off
            _, ch = chord_at(b)
            music.add(stab(ch, cutoff=5200), T(b), 0.5)
            delay_send.add(stab(ch), T(b), 0.07)

    # --- bar 2: TIMING drops, SPACING whoosh, EASING boing, "feeling" shimmer
    send(impact(1.0), T(4), 0.55, verb=0.3)
    for i in range(6):
        send(tick(1500 - 120 * i, 0.05), T(4 + i * 0.125), 0.45, pan=-0.5 + 0.2 * i)
        send(pop(180 - 10 * i, 0.09), T(4 + i * 0.125), 0.35, pan=-0.5 + 0.2 * i)
    send(whoosh(T(0.62), 6000, 700, peak=0.15), T(5.0), 0.5, pan=0)
    send(boing(1.0), T(6.0), 0.3, verb=0.2)
    send(bell(80, 1.6, 0.6), T(7.0), 0.22, pan=0.3, verb=0.6)
    send(shimmer(1400, 2600, T(0.8)), T(7.0), 0.25, verb=0.4)
    for i in range(3):
        send(whoosh(T(0.4), 700, 3500, peak=0.8), T(7.5 + i * 0.07), 0.45, pan=np.linspace(-0.8 if i % 2 == 0 else 0.8, 0.8 if i % 2 == 0 else -0.8, int(T(0.4) * SR)))

    # --- bar 3: shapes pop in, morph waves zip across
    for k in range(14):
        send(pop(500 + 60 * k + 40 * rng.random(), 0.1), T(8.0 + k * 0.03), 0.16, pan=rng.uniform(-0.8, 0.8))
    for wave_b, base, direction in [(9.0, 72, 1), (10.0, 75, 1), (11.0, 79, -1)]:
        for k in range(10):
            m = base + [0, 3, 7, 10, 12, 15, 19, 22, 24, 27][k] * direction
            send(pluck(m, 0.25, 0.7), T(wave_b + k * 0.045), 0.15, pan=(k / 9 * 2 - 1) * (0.8 if wave_b != 10.0 else 0.3), delay=0.2)
    send(revcym(T(0.55)), T(11.45), 0.45)
    send(riser(T(0.5), 200, 6000, 3), T(11.5), 0.4)

    # --- bar 4: explosion, flow wash, converge, sweep, peel into the sphere
    send(impact(1.3), T(12), 0.8, verb=0.4)
    send(whoosh(T(1.4), 300, 1800, peak=0.3, q=0.7), T(12.05), 0.35, verb=0.3)
    arp = [68, 72, 75, 79, 80, 79, 75, 72]
    for i, b in enumerate(np.arange(12.5, 16, 0.25)):
        m = arp[i % len(arp)] + (12 if b >= 15 else 0)
        send(pluck(m, 0.3, 0.8), T(b), 0.15, pan=0.5 if i % 2 else -0.5, delay=0.3)
    send(riser(T(0.7), 800, 10000, 2), T(13.3), 0.35)
    send(impact(0.7), T(14), 0.45, verb=0.4)
    send(shimmer(2000, 5200, T(0.6)), T(14.35), 0.3, pan=np.linspace(-0.8, 0.8, int(T(0.6) * SR)))
    send(shimmer(700, 3000, T(1.0)), T(15.0), 0.25, verb=0.4)

    # --- bar 5: ring sweeps, sphere wobbles, fly-in riser
    send(impact(0.6), T(16), 0.35, verb=0.3)
    for b in [17, 18, 19]:
        send(whoosh(T(0.5), 400, 2400, peak=0.35), T(b), 0.3, pan=np.linspace(0.8, -0.8, int(T(0.5) * SR)))
    for b in [18, 18.5, 19]:
        send(sub(29, 0.3) * 0.9 + 0.2 * np.tanh(4 * sub(41, 0.3)), T(b), 0.35)
    send(riser(T(1.0), 300, 12000, 2.5), T(19.0), 0.6)
    send(revcym(T(0.9)), T(19.1), 0.4)

    # --- bar 6: flash, breakdown pad + glass bells for the lenses, snare roll build
    send(impact(1.1), T(20), 0.7, verb=0.5)
    music.add(pad([56, 60, 63, 67], T(3.8), attack=0.25, release=0.4, cutoff=2400), T(20), 0.32)
    for b, m in [(20.25, 84), (21.0, 79), (22.0, 87), (22.5, 84), (23.0, 91)]:
        send(bell(m, 1.6, 0.7), T(b), 0.13, pan=rng.uniform(-0.6, 0.6), verb=0.6, delay=0.25)
    roll = list(np.arange(22.0, 23.0, 0.5)) + list(np.arange(23.0, 23.5, 0.25)) + list(np.arange(23.5, 23.875, 0.125))
    for i, b in enumerate(roll):
        drums.add(clap(), T(b), 0.12 + 0.3 * i / len(roll), pan=0.1)
    send(riser(T(1.9), 250, 11000, 2.8), T(22.0), 0.5)

    # --- bar 7: drop two; every beat the grid re-flows
    send(impact(1.2), T(24), 0.7, verb=0.3)
    for b in [25, 26, 27]:
        send(whoosh(T(0.3), 3000, 600, peak=0.2), T(b - 0.05), 0.3, pan=rng.uniform(-0.5, 0.5))
        send(tick(2200, 0.03), T(b), 0.3, pan=-0.3)
    for b in np.arange(24.5, 28, 1.0):
        send(tick(4200, 0.015), T(b), 0.22, pan=0.4)
    send(whoosh(T(0.5), 6000, 250, peak=0.85, q=1.1), T(27.5), 0.6)
    send(revcym(T(0.5)), T(27.5), 0.4)

    # --- bar 8: end card
    send(impact(1.4), T(28), 0.85, verb=0.6)
    music.add(pad([56, 60, 63, 67, 72], T(3.6), attack=0.08, release=1.2, cutoff=2800), T(28), 0.36)
    for i, b in enumerate(np.arange(28.5, 29.2, 0.0875)):
        send(pluck([72, 75, 79, 80, 84, 87, 91, 92][i % 8], 0.35, 0.7), T(b), 0.12, pan=-0.6 + i * 0.15, delay=0.25)
    send(bell(84, 3.0), T(29.5), 0.3, verb=0.6, delay=0.2)
    send(pop(300, 0.12), T(29.5), 0.3)
    send(whoosh(T(0.4), 1500, 4000, peak=0.3), T(29.55), 0.18)
    for i in range(22):
        send(tick(2000 + 300 * (i % 4), 0.015), T(29.95) + i * T(0.9) / 22, 0.08, pan=-0.3 + 0.03 * i)
    send(bell(72, 3.0, 0.6), T(31), 0.3, verb=0.7)
    send(bell(79, 3.0, 0.5), T(31), 0.18, pan=0.3, verb=0.7)


def reverb_ir(seconds=2.2, predelay=0.018):
    t = tt(seconds)
    ir = np.zeros((2, len(t) + int(predelay * SR)))
    for c in range(2):
        tail = noise(len(t)) * np.exp(-t * 6.9 / seconds)
        tail = butter(tail, 6000, 'low')
        ir[c, int(predelay * SR):] = tail
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


def main(out):
    build()
    # sidechain: everything melodic ducks under the kick
    t = np.arange(N) / SR
    duck = np.ones(N)
    for k in kicks:
        i = int(k * SR)
        seg = t[i:] - k
        duck[i:] *= 1 - 0.72 * np.exp(-seg * 9)
    bass_bus.x *= duck
    music.x *= 0.35 + 0.65 * duck

    # ping-pong delay (dotted eighth)
    d = int(T(0.75) * SR)
    dl = np.zeros((2, N))
    src = delay_send.x
    fb = 0.42
    for k in range(1, 6):
        g = fb ** (k - 1)
        ch = k % 2
        dl[ch, d * k:] += butter(src.sum(0), 5000, 'low')[: N - d * k] * g * 0.5
    ir = reverb_ir()
    wet = np.stack([ss.fftconvolve(verb_send.x[c] + dl[c] * 0.3, ir[c])[:N] for c in range(2)]) * 0.22

    mix = drums.x * 1.0 + bass_bus.x * 0.9 + music.x * 1.0 + fx.x * 1.0 + dl * 0.55 + wet
    mix = np.stack([butter(mix[c], 28, 'high') for c in range(2)])
    # gentle high shelf: blend in a 1st-order low-pass to take the edge off the top octave
    mix = np.stack([0.55 * mix[c] + 0.45 * butter(mix[c], 7000, 'low', 1) for c in range(2)])
    # glue: slow RMS compressor on the sum
    rms = np.sqrt(ss.lfilter([0.002], [1, -0.998], (mix ** 2).mean(0)) + 1e-9)
    gain = np.minimum(1.0, (0.28 / np.maximum(rms, 1e-6)) ** 0.35)
    mix *= gain
    mix = mix[:, : int(DUR * SR)]
    fade = np.ones(mix.shape[1])
    nf = int(0.25 * SR)
    fade[-nf:] = np.linspace(1, 0, nf) ** 1.5
    mix *= fade
    mix /= np.max(np.abs(mix)) + 1e-9
    mix = np.tanh(mix * 1.5) / np.tanh(1.5)
    mix *= 10 ** (-1.0 / 20)
    wavfile.write(out, SR, mix.T.astype(np.float32))
    peak = 20 * np.log10(np.max(np.abs(mix)))
    rms_db = 20 * np.log10(np.sqrt(np.mean(mix ** 2)))
    print(f'wrote {out}: peak {peak:.2f} dBFS, rms {rms_db:.2f} dBFS')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'audio/soundtrack.wav')
