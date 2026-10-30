"""Turns the Lyria takes in raw-assets/music/ into game music in public/assets/music/.

Looping tracks get their tail crossfaded into their head so they repeat without a
seam; stings are trimmed and faded out. Everything is loudness-normalised and
exported as .ogg and .mp3, and src/data/music.json lists the tracks that exist.
Run with:
    tools/assets/.venv/bin/python tools/assets/music.py [id ...]
Needs ffmpeg on the PATH.
"""

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import yaml

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "raw-assets/music"
OUT = ROOT / "public/assets/music"
MANIFEST = ROOT / "src/data/music.json"
RATE = 44100
CROSSFADE = 3.0
# Lyria takes run about three minutes; a shorter loop keeps the download small.
MAX_LOOP = 90.0
STING_FADE = 1.5
LOUDNESS = "loudnorm=I=-16:TP=-1.5:LRA=11"


def decode(path: Path) -> np.ndarray:
    """The track as float32 stereo samples, loudness-normalised."""
    raw = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", str(path), "-af", LOUDNESS,
         "-ac", "2", "-ar", str(RATE), "-f", "f32le", "-"],
        check=True, capture_output=True,
    ).stdout
    return np.frombuffer(raw, dtype="<f4").reshape(-1, 2).copy()


def trim_silence(x: np.ndarray, threshold: float = 0.01) -> np.ndarray:
    loud = np.where(np.abs(x).max(axis=1) > threshold)[0]
    return x[loud[0] : loud[-1] + 1] if len(loud) else x


def make_loop(x: np.ndarray) -> np.ndarray:
    """Crossfades the last CROSSFADE seconds into the first, so the end flows into the start."""
    n = int(CROSSFADE * RATE)
    ramp = np.linspace(0, 1, n)[:, None]
    head = x[:n] * np.sqrt(ramp) + x[-n:] * np.sqrt(1 - ramp)
    return np.concatenate([head, x[n:-n]])


def make_sting(x: np.ndarray, seconds: float) -> np.ndarray:
    x = x[: int(seconds * RATE)].copy()
    n = min(len(x), int(STING_FADE * RATE))
    x[-n:] *= np.linspace(1, 0, n)[:, None]
    return x


def encode(x: np.ndarray, name: str) -> None:
    pcm = np.clip(x, -1, 1).astype("<f4").tobytes()
    for ext, codec in (("ogg", ["-c:a", "libvorbis", "-q:a", "4"]), ("mp3", ["-c:a", "libmp3lame", "-q:a", "4"])):
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "f32le", "-ar", str(RATE), "-ac", "2",
             "-i", "-", *codec, str(OUT / f"{name}.{ext}")],
            input=pcm, check=True,
        )


def main() -> None:
    spec = yaml.safe_load((Path(__file__).parent / "music-prompts.yaml").read_text())
    only = set(sys.argv[1:])
    OUT.mkdir(parents=True, exist_ok=True)
    for track in spec["tracks"]:
        tid = track["id"]
        if only and tid not in only:
            continue
        src = next(RAW.glob(f"{tid}.*"), None)
        if src is None:
            print(f"skip {tid}: no raw take")
            continue
        x = trim_silence(decode(src))
        x = make_loop(x[: int((MAX_LOOP + CROSSFADE) * RATE)]) if track["loop"] else make_sting(x, track["seconds"])
        encode(x, tid)
        print(f"{tid}: {len(x) / RATE:.1f}s")
    order = [t["id"] for t in spec["tracks"]]
    present = [tid for tid in order if (OUT / f"{tid}.ogg").exists()]
    MANIFEST.write_text(json.dumps(present) + "\n")


if __name__ == "__main__":
    main()
