"""Turns the Gemini originals in raw-assets/ into game-ready images in public/assets/.

Usage: tools/assets/.venv/bin/python tools/assets/process.py [id ...]

Reads tools/assets/prompts.yaml for each asset's kind and size, writes
public/assets/<id>.png (plus <id>_tint.png for tintable sprites), or one
<id>_<frame>.png per pose of a sheet, and the manifest src/data/assets.json
that BootScene loads from.
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


def finish_sprite(im: Image.Image, colors: int | None, cutoff: int = 128) -> Image.Image:
    """Palette-reduces and makes the alpha binary: pixels at least `cutoff` opaque stay.
    A lower cutoff keeps thin lines (a spear shaft) that shrinking leaves half-covered."""
    rgb = im.convert("RGB")
    if colors:
        rgb = reduce_palette(rgb, colors)
    alpha = im.getchannel("A").point(lambda v: 255 if v >= cutoff else 0)
    rgb.putalpha(alpha)
    return rgb


def bbox(rgba: np.ndarray) -> tuple[int, int, int, int]:
    """Bounding box of the opaque pixels, ignoring stray specks."""
    solid = rgba[..., 3] > 0
    rows = np.where(solid.sum(axis=1) > 2)[0]
    cols = np.where(solid.sum(axis=0) > 2)[0]
    return int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1


def components(solid: np.ndarray) -> np.ndarray:
    """Labels the 8-connected regions of `solid` (0 is background)."""
    labels = np.zeros(solid.shape, np.int32)
    h, w = solid.shape
    count = 0
    for y0, x0 in zip(*np.nonzero(solid)):
        if labels[y0, x0]:
            continue
        count += 1
        labels[y0, x0] = count
        stack = [(y0, x0)]
        while stack:
            y, x = stack.pop()
            for ny in (y - 1, y, y + 1):
                for nx in (x - 1, x, x + 1):
                    if 0 <= ny < h and 0 <= nx < w and solid[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = count
                        stack.append((ny, nx))
    return labels


def split_frames(rgba: np.ndarray, n: int) -> list[np.ndarray]:
    """Masks of the `n` poses on a one-row sheet, left to right. The `n` largest
    regions are the poses; every smaller piece (a loose strap, a speck) joins the
    pose whose bounding box is nearest."""
    labels = components(rgba[..., 3] > 0)
    sizes = np.bincount(labels.ravel())
    sizes[0] = 0
    order = np.argsort(sizes)[::-1]
    poses = [int(i) for i in order[:n] if sizes[i] > 0]
    if len(poses) < n or sizes[poses[-1]] < sizes[poses[0]] / 20:
        raise ValueError(f"found {len(poses)} poses on the sheet, expected {n}; are some touching?")

    def box(mask: np.ndarray) -> tuple[int, int, int, int]:
        ys, xs = np.nonzero(mask)
        return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1

    masks = {p: labels == p for p in poses}
    boxes = {p: box(m) for p, m in masks.items()}
    for i in order[n:]:
        if sizes[i] == 0:
            break
        x0, y0, x1, y1 = box(labels == i)
        def distance(p: int) -> int:
            bx0, by0, bx1, by1 = boxes[p]
            return max(bx0 - x1, x0 - bx1, 0) + max(by0 - y1, y0 - by1, 0)
        masks[min(poses, key=distance)] |= labels == i
    return [masks[p] for p in sorted(poses, key=lambda p: boxes[p][0] + boxes[p][2])]


def process(asset: dict, default_colors: int) -> list[dict]:
    aid, kind = asset["id"], asset["kind"]
    if kind == "render":
        return process_render(asset, asset.get("colors", default_colors))
    src = next(RAW.glob(f"{aid}.*"))
    im = Image.open(src)
    colors = asset.get("colors", default_colors)
    entry = {"id": aid}

    if kind == "sheet":
        return process_sheet(asset, im, colors)
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
    return [entry]


def process_sheet(asset: dict, im: Image.Image, colors: int) -> list[dict]:
    """Cuts a sheet of poses into one sprite per frame, all at the same scale:
    the first pose is `height` tall and the others keep their size relative to it."""
    rgba = key_magenta(im)
    tint = None
    if asset.get("tint"):
        rgba, tint = split_tint(rgba)
    masks = split_frames(rgba, len(asset["frames"]))
    cutoff = asset.get("alpha_cutoff", 128)
    scale = None
    entries = []
    for name, mask in zip(asset["frames"], masks):
        fid = f"{asset['id']}_{name}"
        # Only this pose's pixels, so a neighbour reaching into its box is left out.
        alone = rgba.copy()
        alone[..., 3] = np.where(mask, rgba[..., 3], 0)
        box = bbox(alone)
        scale = scale or asset["height"] / (box[3] - box[1])
        height = max(1, round((box[3] - box[1]) * scale))
        entry = {"id": fid}
        if tint is not None:
            tint_alone = tint.copy()
            tint_alone[..., 3] = np.where(mask, tint[..., 3], 0)
            finish_sprite(fit_sprite(tint_alone, height, box), None, cutoff).save(OUT / f"{fid}_tint.png", optimize=True)
            entry["tint"] = True
        out = finish_sprite(fit_sprite(alone, height, box), colors, cutoff)
        out.save(OUT / f"{fid}.png", optimize=True)
        entry["size"] = list(out.size)
        entries.append(entry)
    return entries


def process_render(asset: dict, colors: int) -> list[dict]:
    """Turns the frames a Blender script rendered (raw-assets/<id>/<n>.png, all from one
    camera) into one sprite per frame. Every frame is shrunk by the same `scale` and
    cropped to the same box, so the figure doesn't jump between frames, and the points
    in anchors.json move with them into the manifest."""
    src = RAW / asset["id"]
    anchors = json.loads((src / "anchors.json").read_text())
    cutoff = asset.get("alpha_cutoff", 128)

    raw_images = [np.asarray(Image.open(src / f"{i}.png").convert("RGBA")) for i in range(len(anchors["frames"]))]

    if "scale" in asset:
        scale = asset["scale"]
    elif "height" in asset:
        solid_raw = np.zeros(raw_images[0].shape[:2], bool)
        for rgba in raw_images:
            solid_raw |= rgba[..., 3] >= cutoff
        ys = np.nonzero(solid_raw)[0]
        raw_h = int(ys.max()) + 1 - int(ys.min()) if len(ys) > 0 else raw_images[0].shape[0]
        scale = raw_h / asset["height"]
    else:
        raise ValueError(f"{asset['id']}: render requires either 'scale' or 'height'")

    frames = []
    for rgba in raw_images:
        tint = None
        if asset.get("tint", False):
            rgba, tint = split_tint(rgba)
        h, w = round(rgba.shape[0] / scale), round(rgba.shape[1] / scale)
        frames.append([fit_sprite(layer, h) if layer is not None else None for layer in (rgba, tint)])
        assert frames[-1][0].width == w
    # One box around every frame's solid pixels.
    solid = np.zeros((h, w), bool)
    for im, _ in frames:
        solid |= np.asarray(im.getchannel("A")) >= cutoff
    ys, xs = np.nonzero(solid)
    box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    entries = []
    for i, ((im, tint_im), points) in enumerate(zip(frames, anchors["frames"])):
        fid = f"{asset['id']}_{i}"
        entry = {"id": fid}
        if tint_im is not None:
            finish_sprite(tint_im.crop(box), None, cutoff).save(OUT / f"{fid}_tint.png", optimize=True)
            entry["tint"] = True
        out = finish_sprite(im.crop(box), colors, cutoff)
        out.save(OUT / f"{fid}.png", optimize=True)
        entry["size"] = list(out.size)
        entry["points"] = {k: [round(x / scale - box[0]), round(y / scale - box[1])] for k, (x, y) in points.items()}
        entries.append(entry)
    return entries


def output_ids(asset: dict) -> list[str]:
    if asset["kind"] == "render":
        return [f"{asset['id']}_{i}" for i in range(asset["frames"])]
    if asset["kind"] == "sheet":
        return [f"{asset['id']}_{f}" for f in asset["frames"]]
    return [asset["id"]]


def main() -> None:
    spec = yaml.safe_load((Path(__file__).parent / "prompts.yaml").read_text())
    only = set(sys.argv[1:])
    OUT.mkdir(parents=True, exist_ok=True)
    old = {e["id"]: e for e in json.loads(MANIFEST.read_text())} if MANIFEST.exists() else {}
    for asset in spec["assets"]:
        if only and asset["id"] not in only:
            continue
        if not any(RAW.glob(f"{asset['id']}.*")) and not (RAW / asset["id"]).is_dir():
            print(f"skip {asset['id']}: no raw image")
            continue
        for entry in process(asset, spec["colors"]):
            old[entry["id"]] = entry
            print(f"{entry['id']}: {entry}")
    order = [i for a in spec["assets"] for i in output_ids(a)]
    # Entries no longer in the spec (a sprite replaced by a sheet) are dropped.
    entries = sorted((e for e in old.values() if e["id"] in order), key=lambda e: order.index(e["id"]))
    MANIFEST.write_text(json.dumps(entries, indent=2) + "\n")


if __name__ == "__main__":
    main()
