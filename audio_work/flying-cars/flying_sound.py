# Sound for "The Day Everyone Got a Flying Car": every effect synthesized here (numpy), an original bouncy score in
# F major (116 bpm) that follows the picture's sections, and the mix: voice unchanged, music ducked under speech,
# standard levels (music +3 dB, SFX -6 dB relative to the base bed), master to -14 LUFS, true peak <= -1 dBTP.
# Timing comes from events.json (scripts/fly_events.mjs dumps it from story.ts) and voice/words.json.
# usage: python flying_sound.py   -> out/mix.wav, out/stem_{voice,music,sfx}.wav, out/cues.md
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from dsp import (SR, TAU, ns, tt, rng, lp, hp, bp, peq, colored, smooth_noise, fades, phase, modal, pan, st, place, widen, make_ir, convolve_st,
                 integrated, momentary, true_peak, read_wav, write_wav, dbg, reson)
import instruments as I
import sfx_gen as G

EV = json.load(open(os.path.join(HERE, "events.json")))
WORDS = json.load(open(os.path.join(HERE, "voice", "words.json")))
FPS, TOTAL = EV["FPS"], EV["TOTAL"]
DUR = TOTAL / FPS
N = ns(DUR)
fr = lambda f: f / FPS
W = lambda i: fr(EV["words"][i])           # onset of word i (s)
SH = {s["id"]: (fr(s["a"]), fr(s["b"]), s["light"]) for s in EV["shots"]}
cut_set = set(EV["cuts"])
CUTS = [fr(f) for f in EV["cuts"] if (f - 1) not in cut_set and (f + 1) not in cut_set]
GLIDES = [fr(f) for f in EV["cuts"] if (f - 1) not in cut_set and (f + 1) in cut_set]
R = rng(7)
cues = []


def cue(t, name, note=""):
    cues.append((t, name, note))


# ================================================================ synth effects
def horn(r, dur=None, f=None, kind="car"):
    """two-tone car horn: band-limited square pair, scoop up, bandpassed"""
    dur = dur or r.uniform(0.18, 0.42)
    f = f or r.uniform(330, 470)
    n = ns(dur + 0.05)
    t = np.arange(n) / SR
    y = np.zeros(n)
    for ff in (f, f * 1.26):
        fi = ff * (1 - 0.03 * np.exp(-t / 0.02))
        ph = phase(fi)
        for k in range(1, 14, 2):
            y += np.sin(k * ph) / k
    y = bp(y, 250, 3200, 2)
    env = np.clip(t / 0.008, 0, 1) * np.clip((dur - t) / 0.02 + 1, 0, 1)
    return fades(np.tanh(1.6 * y * env) * 0.6, 0.002, 0.03)


def hover(dur, r, f0=52.0, level=1.0, bright=900):
    """hover hum: low rotor drone + whirr band, slow AM"""
    n = ns(dur)
    t = np.arange(n) / SR
    am = 0.8 + 0.2 * np.sin(TAU * r.uniform(5, 8) * t + r.uniform(0, 6))
    y = (np.sin(phase(f0 * (1 + 0.01 * smooth_noise(n, r, 0.5)))) + 0.4 * np.sin(2 * phase(f0)) + 0.2 * np.sin(3.01 * phase(f0))) * am
    y += 0.5 * bp(colored(n, r, 0.5), 300, bright, 2) * am
    return fades(y * level, 0.2, 0.3)


def turbine(dur, r, f_lo=260, f_hi=1500, rise=0.6):
    """take-off: whine sweeping up + thrust rumble + air"""
    n = ns(dur)
    t = np.arange(n) / SR
    k = np.clip(t / (dur * rise), 0, 1) ** 0.7
    f = f_lo + (f_hi - f_lo) * k
    env = np.clip(t / 0.05, 0, 1) * np.clip((dur - t) / (dur * 0.35), 0, 1)
    whine = (np.sin(phase(f)) + 0.3 * np.sin(phase(2.01 * f))) * 0.35
    rum = lp(colored(n, r, 1.2), 220, 2) * 2.0 + bp(colored(n, r, 0.4), 600, 3500, 1) * 0.6 * k
    return fades((whine + rum) * env, 0.01, 0.1)


def prop_plane(dur, r, f0=82.0):
    n = ns(dur)
    t = np.arange(n) / SR
    ph = phase(f0 * (1 + 0.006 * np.sin(TAU * 0.4 * t)))
    y = sum(np.sin(k * ph) / k ** 0.8 for k in range(1, 18))
    y = lp(y, 2200) * (0.75 + 0.25 * np.sin(TAU * f0 * 2 * t))
    y += 0.4 * lp(colored(n, r, 1.0), 900)
    return fades(y * 0.25, 0.3, 0.4)


def jet_roar(dur, r):
    n = ns(dur)
    t = np.arange(n) / SR
    y = lp(colored(n, r, 1.0), 900, 2) * 1.6 + 0.4 * bp(colored(n, r, 0.3), 1500, 6000, 1)
    y += 0.12 * np.sin(phase(2400 + 60 * np.sin(TAU * 0.3 * t)))
    return fades(y, 0.4, 0.5)


def click_beep(r):
    n = ns(0.3)
    t = np.arange(n) / SR
    y = hp(r.standard_normal(n), 2000) * np.exp(-t / 0.002) * 0.6
    y += np.sin(TAU * 1320 * t) * np.clip((t - 0.04) / 0.005, 0, 1) * np.exp(-np.maximum(t - 0.04, 0) / 0.06) * 0.5
    return fades(y, 0.0005, 0.02)


def reverse_beeps(dur, r, f=1050):
    n = ns(dur)
    t = np.arange(n) / SR
    gate = (np.mod(t, 0.5) < 0.24).astype(float)
    y = np.sin(TAU * f * t) * lp(gate, 120, 1)
    return y * 0.4


def thunk(r, f=85, metal=0.6):
    """car bump: body thump + dented panel modes"""
    n = ns(0.6)
    t = np.arange(n) / SR
    y = np.sin(phase(f * (1 + 0.4 * np.exp(-t / 0.02)))) * np.exp(-t / 0.08)
    y += metal * modal(0.6, [(310, 0.6, 0.12), (523, 0.5, 0.09), (870, 0.35, 0.07), (1460, 0.25, 0.05), (2210, 0.15, 0.04)], r)
    y += lp(r.standard_normal(n), 1800) * np.exp(-t / 0.01) * 0.6
    return fades(y, 0.0005, 0.05)


def plastic_tok(r, f=620):
    n = ns(0.25)
    t = np.arange(n) / SR
    y = modal(0.25, [(f, 1.0, 0.03), (f * 2.3, 0.5, 0.02), (f * 3.9, 0.3, 0.015)], r)
    y += bp(r.standard_normal(n), 800, 4000, 1) * np.exp(-t / 0.004) * 0.5
    return fades(y, 0.0005, 0.03)


def splat(r, dur=0.35):
    n = ns(dur)
    t = np.arange(n) / SR
    y = bp(r.standard_normal(n), 300, 2500, 2) * np.exp(-t / 0.05)
    for k in range(5):
        tk = r.uniform(0.05, dur - 0.05)
        i = ns(tk)
        m = min(n - i, ns(0.04))
        y[i:i + m] += np.sin(phase(np.linspace(900, 1600, m))) * np.exp(-np.arange(m) / SR / 0.01) * 0.4
    return fades(y, 0.001, 0.05)


def squawk(r, dur=None, base=None):
    """angry bird: harsh FM squawk with a falling tail"""
    dur = dur or r.uniform(0.14, 0.28)
    base = base or r.uniform(1100, 1800)
    n = ns(dur)
    t = np.arange(n) / SR
    f = base * (1.15 - 0.4 * t / dur)
    mod = np.sin(phase(f * 0.5)) * 2.2
    y = np.sin(phase(f) + mod) + 0.3 * bp(r.standard_normal(n), 1500, 5000, 1)
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 0.6
    return fades(np.tanh(1.4 * y * env) * 0.5, 0.002, 0.02)


def flaps(dur, r, rate=9.0):
    n = ns(dur)
    t = np.arange(n) / SR
    g = (0.5 + 0.5 * np.sin(TAU * rate * t)) ** 6
    return bp(r.standard_normal(n), 400, 3000, 1) * g * 0.5


def bonk(r):
    n = ns(0.4)
    t = np.arange(n) / SR
    y = np.sin(phase(900 * np.exp(-t / 0.07) + 260)) * np.exp(-t / 0.12)
    y += hp(r.standard_normal(n), 1500) * np.exp(-t / 0.002) * 0.6
    return fades(y, 0.0005, 0.05)


def radio(dur, r):
    """tower radio chatter: band-limited babble, squelch clicks, hiss"""
    n = ns(dur)
    y = np.zeros(n)
    tm = 0.1
    while tm < dur - 0.6:
        L = r.uniform(0.7, 1.6)
        b = G.babble(L, r, r.uniform(110, 170), r.uniform(0.95, 1.1), rate=5.5, active=0.95)
        b = bp(b, 450, 2800, 2)
        G._place_mono(y, b, tm)
        sq = hp(r.standard_normal(ns(0.03)), 2000) * 0.25
        G._place_mono(y, sq, tm + L)
        tm += L + r.uniform(0.25, 0.7)
    y += hp(colored(n, r, 0.0), 3000) * 0.02
    return np.tanh(2.0 * y) * 0.6


def crowd(dur, r, people=14, level=1.0):
    n = ns(dur)
    out = np.zeros((2, n))
    for k in range(people):
        b = G.babble(dur, r, r.uniform(95, 230), r.uniform(0.9, 1.15), rate=r.uniform(3.6, 5.0), active=r.uniform(0.5, 0.8), fmax=3000)
        out += pan(b, r.uniform(-0.8, 0.8)) * r.uniform(0.4, 1.0)
    return out * level / np.sqrt(people)


def jetpack(dur, r):
    n = ns(dur)
    t = np.arange(n) / SR
    y = bp(colored(n, r, 0.6), 200, 4000, 1) * (0.8 + 0.2 * smooth_noise(n, r, 9))
    y += lp(colored(n, r, 1.2), 160, 2) * 1.5
    env = np.clip(t / 0.15, 0, 1) * np.clip((dur - t) / 0.3, 0, 1)
    return fades(y * env, 0.01, 0.1)


def sputter(dur, r, rate=7.0, pops=True):
    """old engine coughing: irregular low pops through an exhaust resonance"""
    n = ns(dur)
    x = np.zeros(n)
    tm = 0.02
    while tm < dur:
        x[ns(tm)] += r.uniform(0.5, 1.0)
        tm += (1 / rate) * r.uniform(0.6, 1.8)
    y = reson(lp(x, 900), 95, 6) * 0.08 + reson(x, 340, 9) * 0.03 + hp(x, 1500) * 0.4
    if pops:
        for k in range(2):
            G._place_mono(y, hp(r.standard_normal(ns(0.05)), 300) * np.exp(-tt(0.05) / 0.01) * 0.9, r.uniform(0.0, max(0.01, dur - 0.1)))
    return np.tanh(3 * y) * 0.6


def fall_whistle(dur, f0=1900.0, f1=320.0):
    n = ns(dur)
    t = np.arange(n) / SR
    f = f0 * (f1 / f0) ** (t / dur)
    y = np.sin(phase(f)) * (0.6 + 0.4 * np.sin(TAU * 6 * t)) * np.clip(t / 0.05, 0, 1)
    return fades(y * 0.4, 0.01, 0.03)


def big_thud(r):
    n = ns(1.4)
    t = np.arange(n) / SR
    y = np.sin(phase(52 * (1 + 0.8 * np.exp(-t / 0.03)))) * np.exp(-t / 0.25) * 1.2
    y += lp(r.standard_normal(n), 1200) * np.exp(-t / 0.06) * 0.9               # dirt crunch
    y += 0.5 * thunk(r, 70, 1.0)[:n] if n <= ns(0.6) else 0.5 * np.pad(thunk(r, 70, 1.0), (0, n - ns(0.6)))
    for k in range(6):                                                          # clods
        G._place_mono(y, plastic_tok(r, r.uniform(160, 320)) * 0.4, r.uniform(0.15, 0.9))
    return fades(np.tanh(1.3 * y), 0.0005, 0.2)


def shimmer(dur, r, notes=(77, 81, 84, 88, 89, 93, 96)):
    out = np.zeros((2, ns(dur + 2)))
    k = 0
    tm = 0.0
    while tm < dur:
        m = notes[k % len(notes)] + (12 if k % 5 == 4 else 0)
        place(out, pan(I.glock(I.m2f(m), r.uniform(0.35, 0.6), r, 1.6), r.uniform(-0.6, 0.6)), tm)
        tm += r.uniform(0.07, 0.13)
        k += 1
    n = out.shape[1]
    out += st(hp(colored(n, r, 0.2), 5000) * 0.05 * np.exp(-np.arange(n) / SR / max(dur, 0.5)))
    return out


def siren_whoop(r, dur=0.7):
    n = ns(dur)
    t = np.arange(n) / SR
    f = 650 + 950 * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 0.8
    ph = phase(f)
    y = sum(np.sin(k * ph) / k for k in range(1, 9, 2))
    return fades(bp(y, 400, 4000, 2) * 0.5, 0.01, 0.06)


def chime(r, f=1046.5):
    a, b = I.glock(f, 0.6, r, 1.2), 0.6 * I.glock(f * 1.5, 0.4, r, 1.2)
    n = min(len(a), len(b))
    return a[:n] + b[:n]


def popper(r):
    n = ns(0.9)
    t = np.arange(n) / SR
    y = lp(r.standard_normal(n), 3000) * np.exp(-t / 0.008) * 1.2
    y += bp(r.standard_normal(n), 3000, 9000, 1) * np.exp(-t / 0.35) * 0.25 * (0.6 + 0.4 * np.sin(TAU * 23 * t))
    return fades(y, 0.0003, 0.1)


def rotor(dur, r):
    n = ns(dur)
    t = np.arange(n) / SR
    y = np.sin(phase(np.full(n, 190.0))) * (0.6 + 0.4 * np.sin(TAU * 38 * t)) + 0.3 * bp(colored(n, r, 0.3), 800, 5000, 1)
    return fades(y * 0.3, 0.1, 0.2)


# ================================================================ SFX stem
S = np.zeros((2, N))
r = rng(11)


def ev(x, t, gain_db=0.0, p=0.0, name="", wide=False):
    if t >= DUR:
        return
    x = np.asarray(x, float)
    if x.ndim == 1:
        x = widen(x, r, 9, 0.5) if wide else pan(x, p)
    place(S, x, t, dbg(gain_db))
    if name:
        cue(t, name)


def bed(x, t0, t1, gain_db, fin=0.25, fout=0.35, name=""):
    """an ambience bed between t0 and t1 with fades"""
    x = st(x)
    n = min(x.shape[1], ns(t1 - t0))
    y = x[:, :n].copy()
    a, b = min(ns(fin), n // 2), min(ns(fout), n // 2)
    if a: y[:, :a] *= np.linspace(0, 1, a)
    if b: y[:, n - b:] *= np.linspace(1, 0, b)
    place(S, y, t0, dbg(gain_db))
    if name:
        cue(t0, name, f"bed to {t1:.2f} s")


# --- shot 1: the jam in the sky (flash-forward)
a, b, _ = SH[1]
bed(hover(b - a + 0.5, r, 50), a, b, -6, 0.02, 0.1, "hover hum (jam)")
bed(G.breeze(b - a + 0.5, r, 0.7, 0.3, 1500), a, b, -14, 0.02, 0.1)
for k in range(22):                                           # the jam honks, thicker on "traffic jam"
    tk = a + r.uniform(0.05, b - a - 0.3)
    dense = W(12) - 0.3 < tk < W(15) + 0.4
    if k % 2 and not dense:
        continue
    ev(horn(r), tk, -9 + r.uniform(-6, 0), r.uniform(-0.8, 0.8))
ev(horn(r, 0.5, 400), W(12) - 0.05, -5, 0.2, "your horn on 'traffic'")
ev(horn(r, 0.25, 380), W(13) + 0.02, -6, 0.2)
for tc in [c for c in CUTS if a < c < b]:
    ev(G.whoosh(0.5, r, 0.18, 400, 2600), tc - 0.18, -11, 0, "cut whoosh")
# --- flash
ev(G.whoosh(0.7, r, 0.12, 900, 6000, tail=0.3), fr(EV["FLASH"]) - 0.12, -6, 0, "flash whoosh", wide=True)
# --- shot 2: Monday morning
a, b, _ = SH[2]
bed(G.bird_chirps(b - a + 4, r, 1.4, "sparrow"), a, SH[3][1] - 1.6, -15, 0.3, 0.6, "morning birds")
bed(G.bird_chirps(b - a + 4, r, 0.6, "blackbird"), a, SH[3][0] + 1.0, -18, 0.3, 0.6)
bed(G.breeze(SH[3][1] - a, r, 0.5, 0.15, 800), a, SH[3][1], -20)
# --- shot 3: the button, take-off, everyone else's
ev(click_beep(r), W(22) - 0.04, -8, 0.1, "dashboard button")
ev(turbine(3.0, r), W(25) - 0.12, -5, 0.15, "your take-off")
ev(G.whoosh(1.0, r, 0.35, 250, 1600, tail=0.4), W(25) + 0.1, -10, 0.0, wide=True)
for k in range(14):                                            # the whole street lifts
    ev(turbine(2.6, r, r.uniform(200, 300), r.uniform(1100, 1700)), W(28) - 0.2 + k * r.uniform(0.04, 0.09), -14 + r.uniform(-4, 0), r.uniform(-0.9, 0.9))
cue(W(28), "every driveway lifts")
# --- shot 4: congratulations + the swarm
a, b, _ = SH[4]
ev(popper(r), W(32) - 0.06, -5, -0.2, "party popper on 'Congratulations'")
ev(G.hurrah(r, 140, 1.0), W(32) + 0.25, -14, 0.3)
bed(hover(b - a + 0.5, r, 60, bright=1200), a, b, -9, 0.05, 0.2, "flying hum")
for k in range(6):
    ev(G.whoosh(1.2, r, 0.5, 300, 1800, tail=0.4), a + 0.6 + k * 0.85, -16, r.uniform(-0.8, 0.8))
bed(sum(hover(b - fr(EV["cuts"][3]) + 0.5, r, 50 + 9 * k, level=0.6) for k in range(4)), fr(EV["cuts"][3]), b, -10, 0.15, 0.2, "the swarm drone")
# --- shot 5: the little plane
a, b, _ = SH[5]
bed(prop_plane(b - a + 0.5, r), a, b, -6, 0.1, 0.25, "prop plane")
bed(G.breeze(b - a + 0.5, r, 1.0, 0.3, 1800), a, b, -14)
# --- shot 6: the driving test
a, b, _ = SH[6]
bed(G.bird_chirps(b - a + 2, r, 0.8), a, b, -20)
bed(sputter(b - a + 0.5, r, 16, False) * 0.25, a, b, -18, 0.2, 0.2, "idling engine")
bmp = fr(EV["BUMP6"])
bed(reverse_beeps(bmp - W(65) + 0.3, r), W(65) - 0.1, bmp, -14, 0.02, 0.02, "reverse beeps")
ev(thunk(r, 80, 0.8), bmp, 1, 0.0, "the bump")
ev(plastic_tok(r), bmp - 0.12, -9, -0.3, "cone clipped")
ev(plastic_tok(r, 480), bmp + 0.12, -12, -0.4)
ev(G.oof(r, "oh", 170, 1.1), bmp + 0.1, -12, 0.3, "examiner gasp")
# --- shot 7: the turn-signal guy
a, b, _ = SH[7]
bed(hover(b - a + 0.5, r, 56, bright=1300), a, b, -9, 0.05, 0.2)
bed(G.breeze(b - a + 0.5, r, 1.0, 0.3, 1600), a, b, -15)
for w in (75, 80, 81, 82, 85):
    ev(G.whoosh(0.8, r, 0.28, 350, 2400, tail=0.3), W(w) - 0.25, -8, 0.4 if w % 2 else -0.4, f"swerve whoosh w{w}")
    ev(horn(r), W(w) + 0.15, -10, r.uniform(-0.8, 0.8))
_wt, _wx = I.whistle([(0.0, 0.25, 84, 0.7), (0.3, 0.2, 81, 0.6), (0.55, 0.45, 86, 0.8), (1.1, 0.3, 84, 0.6), (1.45, 0.5, 79, 0.7)], r)
ev(_wx, W(72) + 0.3 + _wt, -14, 0.2, "the guy whistles")
# --- shot 8: road rage gets altitude
a, b, _ = SH[8]
bed(hover(b - a + 0.5, r, 62), a, b, -9, 0.05, 0.15)
ev(turbine(1.8, r, 300, 900), W(89) - 0.1, -10, 0, "climb")
for k in range(5):
    ev(G.babble(0.7, r, 95 + 30 * (k % 2), 1.0, rate=7, active=1.0), a + 0.1 + k * 0.32, -14, -0.5 if k % 2 else 0.5)
    ev(horn(r, 0.2), a + 0.25 + k * 0.4, -11, -0.4 if k % 2 else 0.4)
cue(a, "road-rage grumbles + horns")
# --- shot 9: honking from above
a, b, _ = SH[9]
bed(G.breeze(b - a + 0.5, r, 0.6, 0.2, 900), a, b, -18)
bed(hover(b - a + 0.5, r, 48), a, b, -12)
for k in range(6):
    ev(horn(r, r.uniform(0.25, 0.5), r.uniform(360, 460)), W(92) + k * 0.33 + r.uniform(0, 0.1), -9, r.uniform(-0.7, 0.7))
ev(horn(r, 0.7, 330), W(100) - 0.15, -2, 0.0, "the big honk from above")
ev(splat(r), W(100) + 0.02, -8, 0.2, "coffee splash")
# --- shot 10: the birds are furious
a, b, _ = SH[10]
bed(flaps(b - a + 0.5, r, 11), a, b, -10, 0.05, 0.1, "wing flaps")
for k in range(9):
    ev(squawk(r), a + 0.15 + k * (b - a - 0.3) / 9 + r.uniform(0, 0.05), -10 + (4 if W(104) - 0.1 < a + 0.15 + k * (b - a - 0.3) / 9 else 0), r.uniform(-0.6, 0.6))
ev(squawk(r, 0.4, 1200), W(104), -5, 0, "FURIOUS squawk")
# --- shot 11: the airliner and the bird
a, b, _ = SH[11]
bed(jet_roar(b - a + 0.5, r), a, b, -6, 0.1, 0.2, "jet roar")
hit = fr(EV["words"][107] - 1)
ev(bonk(r), hit, -4, 0.1, "BONK")
ev(squawk(r, 0.3, 2000), hit + 0.04, -9, 0.1)
ev(G.whoosh(0.5, r, 0.06, 1200, 5000, tail=0.2), hit + 0.02, -13, 0.2, "feathers")
for k in range(8):
    ev(squawk(r), W(109) + k * 0.2, -14, r.uniform(-0.8, 0.8))
# --- shot 12: cousin Kevin
a, b, _ = SH[12]
bed(hover(b - a + 0.5, r, 58, bright=1200), a, b, -10)
bed(flaps(b - a + 0.5, r, 13), a, b, -13)
for k in range(7):
    ev(squawk(r), a + 0.2 + k * 0.29, -12, r.uniform(-0.8, 0.8))
ev(G.hurrah(r, 125, 1.05), W(121) - 0.05, -10, 0.2, "Kevin whoops")
# --- shot 13: landing straight down
a, b, _ = SH[13]
bed(G.bird_chirps(b - a + 2, r, 0.9), a, b, -20)
bed(hover(W(127) - a + 0.2, r, 58), a, W(127) + 0.1, -9, 0.1, 0.12, "descent hum")
ev(G.whoosh(0.9, r, 0.6, 250, 900, tail=0.25), W(127) - 0.6, -12)
ev(thunk(r, 110, 0.2), W(127) - 0.02, -12, 0, "soft touch-down")
ev(chime(r), W(128) + 0.05, -18, 0.3, "ding")
# --- shot 14: the parking cube
a, b, _ = SH[14]
bed(hover(b - a + 0.5, r, 54), a, b, -9)
for w in (134, 137):
    ev(thunk(r, 95, 1.0), W(w) - 0.03, -4, 0.1, f"bump w{w}")
    ev(G.oof(r, "ugh", 120), W(w) + 0.08, -12, 0.3)
    ev(horn(r, 0.3), W(w) + 0.25, -11, -0.4)
# --- shot 15: wait, why?
a, b, _ = SH[15]
bed(hover(b - a + 0.5, r, 52), a, b, -12)
bed(jet_roar(b - a + 0.5, r) * 0.5, W(144) - 0.5, b, -16, 0.8, 0.3, "distant jet")
# --- shot 16-17: airfield, tower, lanes (golden)
a, b, _ = SH[16]
bed(G.breeze(SH[17][1] - a + 0.5, r, 1.0, 0.25, 1200), a, SH[17][1], -16, 0.3, 0.3, "airfield wind")
a, b, _ = SH[17]
bed(radio(fr(EV["words"][164]) - a + 0.3, r), a, W(164) - 0.05, -12, 0.05, 0.1, "tower radio chatter")
ev(shimmer(1.6, r), W(164) - 0.05, -10, 0, "lanes shimmer")
bed(jet_roar(b - W(164) + 0.5, r) * 0.6, W(164), b, -14, 0.3, 0.3)
ev(chime(r, 1396.9), W(169), -14, 0, "lane chime")
ev(chime(r, 1568.0), W(171), -14, 0, "altitude chime")
# --- shot 18-19: food court, jetpacks
a, b, _ = SH[18]
bed(crowd(SH[19][1] - a + 0.5, r, 16), a, SH[19][1], -10, 0.1, 0.25, "food court murmur")
for k in range(10):
    ev(G.clink(r), a + r.uniform(0.1, b - a), -16, r.uniform(-0.8, 0.8))
a, b, _ = SH[19]
for k in range(10):
    t0 = W(181) + k * 0.12 + r.uniform(0, 0.08)
    ev(jetpack(b - t0 + 0.3, r), t0, -14, r.uniform(-0.8, 0.8))
cue(W(181), "jetpacks ignite")
for w in (183, 185):
    ev(thunk(r, 120, 0.5), W(w) - 0.03, -8, 0.3, f"jetpack collision w{w}")
    ev(G.whoa(r, 160), W(w) + 0.05, -10, -0.3)
for k in range(6):
    ev(G.whoa(r, r.uniform(120, 230)), W(182) + k * 0.28, -14, r.uniform(-0.8, 0.8))
# --- shot 20: the old car breaks down
a, b, _ = SH[20]
bed(sputter(b - a + 0.5, r, 11), a, b, -9, 0.1, 0.4, "old engine")
ev(sputter(0.6, r, 4, True), W(190) - 0.05, -6, 0, "breaks down (cough)")
bed(lp(colored(ns(b - W(193) + 0.5), r, 1.0), 500) * 0.6, W(193), fr(EV["words"][196]) + 0.6, -14, 0.1, 0.5, "tyres rolling to the shoulder")
ev(I.brass(I.m2f(34), 0.5, 0.6, r, "tuba"), W(196) + 0.35, -14, 0, "tuba sigh")
# --- shot 21: the lawn dart
a, b, _ = SH[21]
fall, hitd = fr(EV["DART_FALL"]), fr(EV["DART_HIT"])
bed(hover(fall - a + 0.3, r, 60), a, fall, -9, 0.05, 0.02)
ev(sputter(fall - W(199) + 0.1, r, 9, True), W(199) - 0.05, -6, 0, "flying engine sputters")
ev(turbine(0.5, r, 900, 200, 1.0), fall - 0.05, -10, 0, "engines die")
ev(fall_whistle(hitd - fall), fall, -7, 0, "falling whistle")
ev(big_thud(r), hitd, -1, 0, "LAWN DART impact")
ev(G.oof(r, "oh", 175, 1.12), hitd + 0.2, -11, -0.4, "neighbour")
bed(G.bird_chirps(b - hitd + 2, r, 1.0), hitd + 0.6, b, -19)
# --- shot 22: the fix
a, b, _ = SH[22]
bed(hover(b - a + 0.5, r, 55), a, b, -11)
ev(shimmer(1.4, r), W(211) - 0.05, -8, 0, "invisible roads appear")
ev(siren_whoop(r), W(216) - 0.05, -6, -0.3, "police whoop")
ev(siren_whoop(r, 0.5), W(216) + 0.75, -9, -0.3)
bed(rotor(b - W(218) + 0.3, r), W(218) - 0.1, b, -14, 0.1, 0.2, "drone rotors")
ev(chime(r, 880.0), fr(EV["LIGHT_AMBER"]), -14, 0, "light amber")
ev(chime(r, 659.3), fr(EV["LIGHT_RED"]), -11, 0, "light red")
ev(G.whoosh(0.5, r, 0.25, 1500, 5000, tail=0.2), fr(EV["TICKET"]), -10, 0.2, "ticket flies")
ev(G.oof(r, "ugh", 135), fr(EV["TICKET"]) + 0.4, -12, 0.0, "you groan")
# --- shots 23-24: the road in the sky, the pothole
a, b, _ = SH[23]
bed(G.breeze(DUR - a + 0.5, r, 1.2, 0.3, 1400), a, DUR, -12, 0.3, 0.4, "high wind")
bed(sputter(DUR - a + 0.5, r, 18, False) * 0.3, a, DUR, -18)
for k in range(14):
    ev(horn(r), a + 0.2 + k * (SH[24][0] - a - 0.4) / 14 + r.uniform(0, 0.1), -12 + r.uniform(-4, 0), r.uniform(-0.8, 0.8))
ev(horn(r, 0.8, 400), W(230) - 0.1, -7, 0.1, "your long honk")
pot = fr(EV["words"][240] + 1)
ev(thunk(r, 70, 0.7), pot, 0, 0.15, "pothole clunk")
ev(G.whoosh(2.2, r, 1.6, 300, 1500, tail=0.6), W(243) - 0.3, -10, 0, "falling-away wind", wide=True)
for tc in [c for c in GLIDES]:
    ev(G.whoosh(0.6, r, 0.3, 350, 2200), tc - 0.05, -16, 0)

# ================================================================ music (original, F major, 116 bpm)
M = np.zeros((2, N))
rm = rng(23)
Q = 60 / 116
F_ = I.m2f
CH = {"F": [53, 57, 60], "Dm": [50, 53, 57], "Bb": [46, 50, 53], "C": [48, 52, 55], "Gm": [43, 46, 50], "Am": [45, 48, 52], "C7": [48, 52, 55, 58]}
ROOT = {"F": 41, "Dm": 38, "Bb": 34, "C": 36, "Gm": 31, "Am": 33, "C7": 36}
PROG = ["F", "Dm", "Bb", "C"]
MOTIF = [(0, 72, 0.5), (0.5, 74, 0.5), (1, 76, 1), (2, 77, 0.5), (2.5, 76, 0.5), (3, 72, 1)]   # beats in a bar


def kick(vel):
    t = tt(0.35)
    return fades(np.sin(phase(55 * (1 + 2.5 * np.exp(-t / 0.03)))) * np.exp(-t / 0.12) * vel, 0.0005, 0.05)


def mput(x, t, db=0.0, p=0.0):
    if t < DUR:
        place(M, pan(x, p) if np.asarray(x).ndim == 1 else x, t, dbg(db))


def groove(t0, t1, style="bounce", gain=0.0, key_shift=0, prog=PROG, melody=True, drums=True):
    """bars of the theme between t0 and t1 (quantized to bars from t0)"""
    bar = 4 * Q
    nb = int((t1 - t0) / bar + 0.999)
    for k in range(nb):
        tb = t0 + k * bar
        ch = prog[k % len(prog)]
        root = ROOT[ch] + key_shift
        if style == "golden":
            mput(I.pad([F_(m + key_shift) for m in CH[ch]], bar, 0.55, rm, att=0.4, rel=0.8), tb, gain - 6)
            for j, m in enumerate(CH[ch] + [CH[ch][0] + 12]):
                mput(I.musicbox(F_(m + 24 + key_shift), 0.5, rm, 1.6), tb + j * Q, gain - 9, 0.3 * (j - 1.5))
            mput(I.pluck(F_(root), 0.6, rm, 1.2, 0.3), tb, gain - 4)
            continue
        if style == "tuba":
            for j in range(4):
                if tb + j * Q * 1.2 < t1:
                    mput(I.brass(F_(root + [0, 7, 12, 7][j]), Q * 0.9, 0.55, rm, "tuba"), tb + j * Q * 1.2, gain - 4)
            continue
        # bounce: pizz bass on 1 + 3, offbeat pluck chords, glock motif, kick/brush
        for j, m in ((0, root), (2, root + 7)):
            mput(I.pluck(F_(m), 0.75, rm, 0.8, 0.35), tb + j * Q, gain - 2)
        for j in (1, 3):
            for m in CH[ch]:
                mput(I.pluck(F_(m + 12 + key_shift), 0.35, rm, 0.35, 0.6), tb + j * Q + 0.01 * rm.standard_normal(), gain - 9, rm.uniform(-0.4, 0.4))
        if melody:
            for bt, m, L in MOTIF:
                mm = m + key_shift + (2 if k % 4 == 1 else -1 if k % 4 == 2 else 0)
                mput(I.glock(F_(mm + 12), 0.45, rm, 1.0) if k % 2 == 0 else I.pluck(F_(mm), 0.5, rm, L * Q + 0.2, 0.7), tb + bt * Q, gain - 8, 0.25)
        if drums:
            for j in range(4):
                mput(kick(0.8) if j % 2 == 0 else I.brush(0.5, rm, 0.25), tb + j * Q, gain - (5 if j % 2 == 0 else 10))
            if style == "busy":
                for j in range(8):
                    mput(I.brush(0.25, rm, 0.12), tb + j * Q / 2 + Q / 4, gain - 16, 0.3)


def stab(t, chord="F", gain=-4.0):
    for m in CH[chord]:
        mput(I.brass(F_(m + 12), 0.35, 0.7, rm, "stab"), t, gain - 6)
    mput(I.cymbal(0.5, rm, 1.6), t, gain - 10)


# sections (seconds), following the picture
T_ = lambda s: SH[s][0]
groove(0.0, T_(2), "busy", -2)                               # hook
stab(0.0, "F", -2)
groove(T_(2), W(25) - 0.05, "bounce", -4, drums=False)        # morning: light
mput(I.cymbal(0.45, rm, 2.0), W(25) - 0.6, -14)               # swell into the take-off
groove(W(25), T_(5), "bounce", -3)                            # up we go
groove(T_(5), fr(EV["BUMP6"]), "bounce", -6, key_shift=-5, prog=["Bb", "Gm", "F", "C"], drums=False)  # sneaky test
groove(fr(EV["BUMP6"]) + 0.6, T_(13), "busy", -3)             # sky chaos
stab(T_(7) + 0.02, "C", -6)
groove(T_(13), T_(14), "bounce", -6, drums=False)             # luckily (sweet)
groove(T_(14), T_(15), "bounce", -6, prog=["Dm", "Am", "Bb", "C"], melody=False)  # unluckily (minor)
groove(T_(15), T_(16), "bounce", -9, prog=["Dm", "C"], melody=False, drums=False)  # wait...
groove(T_(16), T_(18), "golden", -4, prog=["F", "Am", "Bb", "C"])   # the explanation
groove(T_(18), W(181), "bounce", -6, drums=False)             # food court
groove(W(181), T_(20), "busy", -3, key_shift=2)               # jetpacks!
groove(T_(20), T_(21), "tuba", -9, prog=["F", "C"])            # the old car rolls to a stop
groove(T_(21), fr(EV["DART_FALL"]), "bounce", -6, drums=False)
# (silence through the fall and the impact)
groove(fr(EV["DART_HIT"]) + 0.8, T_(22), "bounce", -10, drums=False, melody=False)
groove(T_(22), T_(23), "bounce", -4, prog=["F", "Bb", "C", "F"])   # the fix: orderly
groove(T_(23), DUR - 1.2, "golden", -7, prog=["F", "Dm", "Bb", "C"])
stab(W(245) + 0.05, "F", -7)                                   # button on "down"
mput(I.timpani(F_(41), 0.7, rm, 2.2), W(245) + 0.05, -11)

# light room on the music
ir = make_ir(0.9, 5, hf=0.6)
M = 0.85 * M + 0.18 * convolve_st(M, ir)[:, :N]

# ================================================================ mix
v, vsr = read_wav(os.path.join(HERE, "voice", "voice.wav"))
assert vsr == SR, vsr
V = np.zeros((2, N))
vv = st(v)[:, :N]
V[:, :vv.shape[1]] = vv
# duck the music while the voice speaks (key = words.json), 60 ms attack, 250 ms release
spk = np.zeros(N)
for w in WORDS:
    spk[ns(w["s"]):ns(w["e"] + 0.05)] = 1
duck = np.ones(N)
g = 1.0
a_k, r_k = np.exp(-1 / (0.06 * SR)), np.exp(-1 / (0.25 * SR))
tgt_d = dbg(-3.0)
for i in range(N):
    tg = tgt_d if spk[i] else 1.0
    k = a_k if tg < g else r_k
    g = tg + (g - tg) * k
    duck[i] = g
M *= duck[None, :]
vI = integrated(V)
# base levels: music bed 12 LU and SFX 2 LU under the voice; standard mix then music +3 dB, SFX -6 dB
mI, sI = integrated(M), integrated(S)
M *= dbg((vI - 12) - mI + 3.0)
S *= dbg((vI - 2) - sI - 6.0)
mix = V + M + S
# master: integrated -14 LUFS, then a soft limiter to -1 dBTP
mix *= dbg(-14.0 - integrated(mix))
lim = dbg(-1.2)
# look-ahead peak limiter: per-sample gain, held over a 5 ms window, smoothed 10 ms
peak = np.abs(mix).max(0)
gain = np.minimum(1.0, lim / np.maximum(peak, 1e-9))
from scipy.ndimage import minimum_filter1d
gh = minimum_filter1d(gain, ns(0.005) * 2 + 1)
kern = np.hanning(ns(0.01) | 1); kern /= kern.sum()
gs = np.minimum(np.convolve(gh, kern, "same"), gh)
mix *= gs[None, :]
os.makedirs(os.path.join(HERE, "out"), exist_ok=True)
O = lambda n: os.path.join(HERE, "out", n)
write_wav(O("mix.wav"), mix)
sc = mix.std() / max((V + M + S).std(), 1e-9) # stems at mix gain (pre-limiter)
write_wav(O("stem_voice.wav"), V * sc)
write_wav(O("stem_music.wav"), M * sc)
write_wav(O("stem_sfx.wav"), S * sc)
stats = dict(length_s=N / SR, frames=TOTAL, mix_I=integrated(mix), mix_TP=true_peak(mix), voice_I=integrated(V), music_I=integrated(M), sfx_I=integrated(S))
with open(O("cues.md"), "w") as fh:
    fh.write("# Flying cars: sound cues\n\n")
    fh.write("Mix: voice unchanged (gain only), music ducked -3 dB under speech (words.json), standard levels (music +3 dB, SFX -6 dB), "
             "master -14 LUFS integrated, limiter at -1.2 dBFS.\n\n")
    for k, vv2 in stats.items():
        fh.write(f"- {k}: {vv2:.2f}\n")
    fh.write("\n| time s | frame | cue | note |\n|---|---|---|---|\n")
    for t, n, nt in sorted(cues):
        fh.write(f"| {t:.2f} | {round(t * FPS)} | {n} | {nt} |\n")
print({k: round(float(x), 2) for k, x in stats.items()})
