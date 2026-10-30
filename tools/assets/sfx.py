"""Synthesizes the game's sound effects into public/assets/sfx/ (.ogg and .mp3).

Every effect is built here from noise and sine partials, so the sounds are
original and need no licence. Run with:
    tools/assets/.venv/bin/python tools/assets/sfx.py [id ...]
Needs ffmpeg on the PATH for the encoding.
"""

import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

RATE = 22050
OUT = Path(__file__).resolve().parents[2] / "public/assets/sfx"
rng = np.random.default_rng(1149)


def t(seconds: float) -> np.ndarray:
    return np.arange(int(RATE * seconds)) / RATE


def decay(seconds: float, rate: float) -> np.ndarray:
    return np.exp(-t(seconds) * rate)


def noise(seconds: float) -> np.ndarray:
    return rng.uniform(-1, 1, int(RATE * seconds))


def lowpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    """One-pole low-pass filter."""
    a = np.exp(-2 * np.pi * cutoff / RATE)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def bandpass(x: np.ndarray, low: float, high: float) -> np.ndarray:
    return lowpass(x, high) - lowpass(x, low)


def partials(seconds: float, freqs: list[float], rate: float) -> np.ndarray:
    tt = t(seconds)
    return sum(np.sin(2 * np.pi * f * tt) * np.exp(-tt * rate * (1 + i * 0.4)) for i, f in enumerate(freqs))


def place(length: float, *parts: tuple[float, np.ndarray]) -> np.ndarray:
    """Mixes sounds, each starting at its offset in seconds."""
    out = np.zeros(int(RATE * length))
    for start, s in parts:
        i = int(RATE * start)
        n = min(len(s), len(out) - i)
        out[i : i + n] += s[:n]
    return out


def sword_clash() -> np.ndarray:
    ring = partials(0.6, [1870, 2930, 4410, 5960], 9)
    return ring * 0.5 + noise(0.6) * decay(0.6, 60) * 0.6


def sword_hit() -> np.ndarray:
    thud = np.sin(2 * np.pi * 95 * t(0.3)) * decay(0.3, 18)
    return thud * 0.9 + lowpass(noise(0.3), 1200) * decay(0.3, 25) * 1.5


def swing() -> np.ndarray:
    tt = t(0.25)
    env = np.sin(np.pi * tt / 0.25) ** 2
    return bandpass(noise(0.25), 600, 2500) * env * 1.4


def lance_hit() -> np.ndarray:
    crack = bandpass(noise(0.5), 500, 3000) * decay(0.5, 30) * 2
    thump = np.sin(2 * np.pi * 70 * t(0.5)) * decay(0.5, 10)
    return crack + thump


def gallop() -> np.ndarray:
    """Two seconds of hoofbeats, meant to loop."""
    beat = lowpass(noise(0.08), 400) * decay(0.08, 50) * 3 + np.sin(2 * np.pi * 60 * t(0.08)) * decay(0.08, 40)
    hits = [(bar * 0.5 + off, beat) for bar in range(4) for off in (0, 0.11, 0.2)]
    return place(2.0, *hits)


def catapult() -> np.ndarray:
    creak = np.sin(2 * np.pi * (180 + 60 * np.sin(2 * np.pi * 9 * t(0.3))) * t(0.3)) * decay(0.3, 8) * 0.3
    tt = t(0.7)
    whoosh = bandpass(noise(0.7), 300, 1500) * np.sin(np.pi * tt / 0.7) ** 2
    return place(0.9, (0, creak), (0.15, whoosh * 1.2), (0, np.sin(2 * np.pi * 50 * t(0.2)) * decay(0.2, 20)))


def impact() -> np.ndarray:
    rumble = lowpass(noise(1.0), 300) * decay(1.0, 4) * 3
    boom = np.sin(2 * np.pi * 45 * t(1.0)) * decay(1.0, 6)
    debris = place(1.0, *((0.05 + 0.08 * i, bandpass(noise(0.05), 800, 3000) * decay(0.05, 60)) for i in range(8)))
    return rumble + boom + debris * 0.5


def fire() -> np.ndarray:
    roar = lowpass(noise(1.5), 500) * 1.5 * decay(1.5, 1.5)
    pops = place(1.5, *((rng.uniform(0, 1.4), bandpass(noise(0.02), 1500, 5000) * 2) for _ in range(25)))
    return roar + pops * decay(1.5, 1.5)


def cheer() -> np.ndarray:
    tt = t(2.5)
    env = np.minimum(1, tt / 0.3) * np.minimum(1, (2.5 - tt) / 1.2)
    crowd = sum(
        bandpass(noise(2.5), f * 0.8, f * 1.2) * (1 + 0.5 * np.sin(2 * np.pi * rng.uniform(3, 7) * tt + rng.uniform(0, 6)))
        for f in (400, 700, 1100, 1600)
    )
    return crowd * env * 1.2


def groan() -> np.ndarray:
    """The crowd's disappointed murmur."""
    tt = t(1.6)
    pitch = 1 - 0.3 * tt / 1.6
    voice = sum(np.sin(2 * np.pi * f * pitch * tt + rng.uniform(0, 6)) for f in (180, 230, 270, 330)) / 4
    return (voice * 0.6 + bandpass(noise(1.6), 200, 800)) * np.sin(np.pi * tt / 1.6) * 0.8


def coins() -> np.ndarray:
    ping = lambda f: partials(0.35, [f, f * 2.76, f * 5.4], 14)  # noqa: E731
    return place(0.9, *((0.07 * i + rng.uniform(0, 0.03), ping(rng.uniform(2600, 3600))) for i in range(8)))


def drum() -> np.ndarray:
    tt = t(0.6)
    body = np.sin(2 * np.pi * (90 - 30 * tt) * tt) * decay(0.6, 7)
    return body + lowpass(noise(0.6), 900) * decay(0.6, 30)


def horn() -> np.ndarray:
    """A short call to arms on a straight horn: two notes rising."""

    def note(f: float, seconds: float) -> np.ndarray:
        tt = t(seconds)
        env = np.minimum(1, tt / 0.05) * np.minimum(1, (seconds - tt) / 0.15)
        vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * tt)
        return sum(np.sin(2 * np.pi * f * k * vib * tt) / k ** 1.3 for k in range(1, 7)) * env

    return place(1.3, (0, note(233, 0.35)), (0.35, note(349, 0.9)))


def click() -> np.ndarray:
    return bandpass(noise(0.04), 1500, 5000) * decay(0.04, 120) * 2 + partials(0.04, [900], 80) * 0.4


SOUNDS = {
    "sword_clash": sword_clash,
    "sword_hit": sword_hit,
    "swing": swing,
    "lance_hit": lance_hit,
    "gallop": gallop,
    "catapult": catapult,
    "impact": impact,
    "fire": fire,
    "cheer": cheer,
    "groan": groan,
    "coins": coins,
    "drum": drum,
    "horn": horn,
    "click": click,
}


def save(name: str, x: np.ndarray) -> None:
    x = x / max(1e-6, np.abs(x).max()) * 0.8
    pcm = (x * 32767).astype("<i2").tobytes()
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / f"{name}.wav"
        with wave.open(str(wav), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(pcm)
        for ext, codec in (("ogg", ["-c:a", "libvorbis", "-q:a", "4"]), ("mp3", ["-c:a", "libmp3lame", "-q:a", "5"])):
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), *codec, str(OUT / f"{name}.{ext}")],
                check=True,
            )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    only = set(sys.argv[1:])
    for name, make in SOUNDS.items():
        if only and name not in only:
            continue
        save(name, make())
        print(name)


if __name__ == "__main__":
    main()
