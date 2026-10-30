"""Generates an animated GIF of the joust pass with the new Blender renders."""

import json
import math
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "assets"
MANIFEST = ROOT / "src" / "data" / "assets.json"
ARTIFACT_DIR = Path("/home/lapiana/.gemini/antigravity/brain/6e54a29b-9bb4-41cd-b2d1-15757b8ac74d")

manifest = {e["id"]: e for e in json.loads(MANIFEST.read_text())}

joust_bg = Image.open(OUT / "joust.png").convert("RGBA")
lance_img = Image.open(OUT / "lance.png").convert("RGBA")

# Tilt barrier polygon matching JoustScene.ts
# [VANISH.x - 1, VANISH.y, VANISH.x + 2, VANISH.y, 274, HEIGHT, 246, HEIGHT]
HORIZON = 180
VANISH = (322, HORIZON)
IMPACT = (240, 225)
START_SCALE = 0.08
IMPACT_SCALE = 1.0
HEIGHT = 400
WIDTH = 640
LANCE_BASE = (600, 430)
LANCE_BUTT = (37, 356)
LANCE_POINT_Y = 2

# Colors
RED_LORD = (180, 45, 45)
BLUE_LORD = (45, 90, 180)

def draw_tilt_barrier(im: Image.Image) -> None:
    draw = ImageDraw.Draw(im)
    poly = [(VANISH[0] - 1, VANISH[1]), (VANISH[0] + 2, VANISH[1]), (274, HEIGHT), (246, HEIGHT)]
    draw.polygon(poly, fill=(200, 160, 96), outline=(90, 58, 26))

def get_tinted(key: str, color: tuple[int, int, int]) -> Image.Image:
    base = Image.open(OUT / f"{key}.png").convert("RGBA")
    tint_path = OUT / f"{key}_tint.png"
    if tint_path.exists():
        tint = Image.open(tint_path).convert("RGBA")
        t_arr = np.array(tint)
        r = (t_arr[..., 0] * (color[0] / 255.0)).astype(np.uint8)
        g = (t_arr[..., 1] * (color[1] / 255.0)).astype(np.uint8)
        b = (t_arr[..., 2] * (color[2] / 255.0)).astype(np.uint8)
        a = t_arr[..., 3]
        tinted = Image.fromarray(np.dstack([r, g, b, a]), "RGBA")
        return Image.alpha_composite(base, tinted)
    return base

def draw_lance(canvas: Image.Image, tip_x: float, tip_y: float) -> None:
    # Rotate and scale lance to reach from LANCE_BASE to tip
    angle = math.atan2(tip_y - LANCE_BASE[1], tip_x - LANCE_BASE[0]) + math.pi / 2
    deg = math.degrees(angle)
    length = math.hypot(tip_x - LANCE_BASE[0], tip_y - LANCE_BASE[1])
    orig_len = LANCE_BUTT[1] - LANCE_POINT_Y
    scale_y = length / orig_len
    scale_x = 0.8
    w, h = lance_img.size
    scaled = lance_img.resize((max(1, round(w * scale_x)), max(1, round(h * scale_y))), Image.Resampling.BILINEAR)
    # Rotate around butt
    rotated = scaled.rotate(-deg, expand=True, resample=Image.Resampling.BILINEAR)
    rw, rh = rotated.size
    # Center butt at LANCE_BASE
    canvas.paste(rotated, (round(LANCE_BASE[0] - rw / 2), round(LANCE_BASE[1] - rh / 2)), rotated)

def render_scene_frame(knight_key: str, knight_pos: tuple[float, float], scale: float,
                       lord_color: tuple[int, int, int], angle: float = 0.0, alpha: float = 1.0) -> Image.Image:
    frame = joust_bg.copy()
    draw_tilt_barrier(frame)

    # Knight sprite
    entry = manifest[knight_key]
    shield_pt = entry["points"]["shield"]
    knight_im = get_tinted(knight_key, lord_color)
    kw, kh = knight_im.size
    new_w = max(1, round(kw * scale))
    new_h = max(1, round(kh * scale))
    scaled_knight = knight_im.resize((new_w, new_h), Image.Resampling.BILINEAR)
    
    if angle != 0.0 or alpha < 1.0:
        if alpha < 1.0:
            arr = np.array(scaled_knight)
            arr[..., 3] = (arr[..., 3] * alpha).astype(np.uint8)
            scaled_knight = Image.fromarray(arr, "RGBA")
        if angle != 0.0:
            scaled_knight = scaled_knight.rotate(-angle, expand=True, resample=Image.Resampling.BILINEAR)

    # Position centered on shield point
    sh_x = round(shield_pt[0] * scale)
    sh_y = round(shield_pt[1] * scale)
    kx = round(knight_pos[0] - sh_x)
    ky = round(knight_pos[1] - sh_y)
    frame.paste(scaled_knight, (kx, ky), scaled_knight)

    # Player lance aimed at shield
    draw_lance(frame, knight_pos[0], knight_pos[1])
    return frame

frames = []
durations = []

# Sequence 1: Charge (Red Lord)
# 20 frames of charging
num_charge_frames = 20
for step in range(num_charge_frames):
    t = step / (num_charge_frames - 1)
    scale = START_SCALE + (IMPACT_SCALE - START_SCALE) * (t ** 2.2)
    f = (scale - START_SCALE) / (IMPACT_SCALE - START_SCALE)
    kx = VANISH[0] + (IMPACT[0] - VANISH[0]) * f
    ky = VANISH[1] + (IMPACT[1] - VANISH[1]) * f
    frame_idx = step % 4
    key = f"joust_knight_charge_{frame_idx}"
    im = render_scene_frame(key, (kx, ky), scale, RED_LORD)
    frames.append(im)
    durations.append(90)

# Sequence 2: Impact & Unhorsed (3 struck frames with fall tween)
struck_steps = [
    ("joust_knight_struck_0", 0.0, 1.0, 0),
    ("joust_knight_struck_0", -5.0, 1.0, 10),
    ("joust_knight_struck_1", -15.0, 0.95, 25),
    ("joust_knight_struck_1", -25.0, 0.90, 45),
    ("joust_knight_struck_2", -38.0, 0.85, 65),
    ("joust_knight_struck_2", -48.0, 0.65, 85),
    ("joust_knight_struck_2", -58.0, 0.35, 105),
]
for key, ang, alp, dy in struck_steps:
    kx, ky = IMPACT[0], IMPACT[1] + dy
    im = render_scene_frame(key, (kx, ky), IMPACT_SCALE, RED_LORD, angle=ang, alpha=alp)
    frames.append(im)
    durations.append(130)

# Sequence 3: Charge & Thunders Past (Blue Lord)
for step in range(num_charge_frames):
    t = step / (num_charge_frames - 1)
    scale = START_SCALE + (IMPACT_SCALE - START_SCALE) * (t ** 2.2)
    f = (scale - START_SCALE) / (IMPACT_SCALE - START_SCALE)
    kx = VANISH[0] + (IMPACT[0] - VANISH[0]) * f
    ky = VANISH[1] + (IMPACT[1] - VANISH[1]) * f
    frame_idx = step % 4
    key = f"joust_knight_charge_{frame_idx}"
    im = render_scene_frame(key, (kx, ky), scale, BLUE_LORD)
    frames.append(im)
    durations.append(90)

# Thunders past (glance/miss)
thunders_steps = [
    ("joust_knight_struck_0", IMPACT[0], IMPACT[1], IMPACT_SCALE, 1.0),
    ("joust_knight_struck_0", IMPACT[0] - 60, IMPACT[1], IMPACT_SCALE * 1.1, 0.9),
    ("joust_knight_struck_0", IMPACT[0] - 140, IMPACT[1], IMPACT_SCALE * 1.25, 0.7),
    ("joust_knight_struck_0", IMPACT[0] - 240, IMPACT[1], IMPACT_SCALE * 1.4, 0.3),
]
for key, kx, ky, sc, alp in thunders_steps:
    im = render_scene_frame(key, (kx, ky), sc, BLUE_LORD, alpha=alp)
    frames.append(im)
    durations.append(100)

gif_out = OUT / "joust_pass.gif"
frames[0].save(gif_out, save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True)
print("Saved joust GIF to:", gif_out)

if ARTIFACT_DIR.exists():
    art_gif = ARTIFACT_DIR / "joust_pass.gif"
    frames[0].save(art_gif, save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True)
    print("Saved joust GIF to artifact:", art_gif)
