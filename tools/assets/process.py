"""Turns the Gemini originals in raw-assets/ into game-ready images in public/assets/.

Usage: tools/assets/.venv/bin/python tools/assets/process.py [id ...]

Reads tools/assets/prompts.yaml for each asset's kind and size, writes
public/assets/<id>.png (plus <id>_tint.png for tintable sprites) and the
manifest src/data/assets.json that BootScene loads from.
"""

import json
import sys
from pathlib import Path

import numpy as np
import yaml
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "raw-assets"
OUT = ROOT / "public" / "assets"
MANIFEST = ROOT / "src" / "data" / "assets.json"


def cover(im: Image.Image, w: int, h: int) -> Image.Image:
    """Scales to cover w x h and crops the centre."""
    scale = max(w / im.width, h / im.height)
    sw, sh = round(im.width * scale), round(im.height * scale)
    im = im.resize((sw, sh), Image.LANCZOS)
    left, top = (sw - w) // 2, (sh - h) // 2
    return im.crop((left, top, left + w, top + h))


def reduce_palette(rgb: Image.Image, colors: int) -> Image.Image:
    return rgb.quantize(colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).convert("RGB")


def key_magenta(im: Image.Image) -> np.ndarray:
    """RGBA array with the magenta background made transparent and its fringe despilled."""
    a = np.asarray(im.convert("RGB")).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    magenta = np.minimum(r, b) - g
    alpha = np.where(magenta > 80, 0, 255).astype(np.int16)
    # Fringe pixels keep their alpha but lose the pink cast.
    fringe = (magenta > 25) & (alpha > 0)
    cap = g + 25
    a[..., 0] = np.where(fringe, np.minimum(r, cap), r)
    a[..., 2] = np.where(fringe, np.minimum(b, cap), b)
    return np.dstack([a, alpha]).clip(0, 255).astype(np.uint8)


def split_tint(rgba: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Moves the bright green areas into a greyscale layer to tint in game."""
    r, g, b = (rgba[..., i].astype(np.int16) for i in range(3))
    green = (g - np.maximum(r, b) > 50) & (rgba[..., 3] > 0)
    shade = np.clip(g * 1.15, 0, 255).astype(np.uint8)
    tint = np.zeros_like(rgba)
    tint[..., 0] = tint[..., 1] = tint[..., 2] = shade
    tint[..., 3] = np.where(green, 255, 0)
    base = rgba.copy()
    grey = (shade * 0.5).astype(np.uint8)
    for i in range(3):
        base[..., i] = np.where(green, grey, base[..., i])
    return base, tint


def fit_sprite(rgba: np.ndarray, height: int, box: tuple[int, int, int, int] | None = None) -> Image.Image:
    im = Image.fromarray(rgba, "RGBA")
    if box is not None:
        im = im.crop(box)
    w = max(1, round(im.width * height / im.height))
    # Premultiply so transparent pixels don't bleed colour into the edges.
    return im.convert("RGBa").resize((w, height), Image.LANCZOS).convert("RGBA")


def finish_sprite(im: Image.Image, colors: int | None) -> Image.Image:
    rgb = im.convert("RGB")
    if colors:
        rgb = reduce_palette(rgb, colors)
    alpha = im.getchannel("A").point(lambda v: 255 if v >= 128 else 0)
    rgb.putalpha(alpha)
    return rgb


def bbox(rgba: np.ndarray) -> tuple[int, int, int, int]:
    """Bounding box of the opaque pixels, ignoring stray specks."""
    solid = rgba[..., 3] > 0
    rows = np.where(solid.sum(axis=1) > 2)[0]
    cols = np.where(solid.sum(axis=0) > 2)[0]
    return int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1


def process(asset: dict, default_colors: int) -> dict:
    aid, kind = asset["id"], asset["kind"]
    src = next(RAW.glob(f"{aid}.*"))
    im = Image.open(src)
    colors = asset.get("colors", default_colors)
    entry = {"id": aid}

    if kind in ("bg", "tile"):
        out = reduce_palette(cover(im.convert("RGB"), *asset["size"]), colors)
        out.save(OUT / f"{aid}.png", optimize=True)
        entry["size"] = list(out.size)
    elif kind == "sprite":
        rgba = key_magenta(im)
        box = bbox(rgba)
        if asset.get("tint"):
            base, tint = split_tint(rgba)
            tint_im = fit_sprite(tint, asset["height"], box)
            finish_sprite(tint_im, None).save(OUT / f"{aid}_tint.png", optimize=True)
            rgba = base
            entry["tint"] = True
        out = finish_sprite(fit_sprite(rgba, asset["height"], box), colors)
        out.save(OUT / f"{aid}.png", optimize=True)
        entry["size"] = list(out.size)
    else:
        raise ValueError(f"{aid}: unknown kind {kind}")
    return entry


def main() -> None:
    spec = yaml.safe_load((Path(__file__).parent / "prompts.yaml").read_text())
    only = set(sys.argv[1:])
    OUT.mkdir(parents=True, exist_ok=True)
    old = {e["id"]: e for e in json.loads(MANIFEST.read_text())} if MANIFEST.exists() else {}
    for asset in spec["assets"]:
        if only and asset["id"] not in only:
            continue
        if not any(RAW.glob(f"{asset['id']}.*")):
            print(f"skip {asset['id']}: no raw image")
            continue
        old[asset["id"]] = process(asset, spec["colors"])
        print(f"{asset['id']}: {old[asset['id']]}")
    order = [a["id"] for a in spec["assets"]]
    entries = sorted(old.values(), key=lambda e: order.index(e["id"]))
    MANIFEST.write_text(json.dumps(entries, indent=2) + "\n")


if __name__ == "__main__":
    main()
