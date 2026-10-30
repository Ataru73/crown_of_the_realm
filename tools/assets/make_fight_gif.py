"""Generates a short animated GIF of the sword fight with the new Blender renders."""

import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageOps
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "assets"
MANIFEST = ROOT / "src" / "data" / "assets.json"
ARTIFACT_DIR = Path("/home/lapiana/.gemini/antigravity/brain/ae2ffbd3-21ba-408b-b115-36b3b3101591")

manifest = {e["id"]: e for e in json.loads(MANIFEST.read_text())}

corridor = Image.open(OUT / "corridor.png").convert("RGBA")

# Colors
SAXON_COLOR = (43, 130, 55)   # Lord green
NORMAN_COLOR = (150, 40, 40)  # Lord red

FLOOR_Y = 328
HERO_X = 250
GUARD_X = 390
ENTER_FROM_X = 700

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

def draw_spark(im: Image.Image, x: int, y: int, r: int = 8, color=(255, 240, 160)):
    draw = ImageDraw.Draw(im)
    draw.ellipse([x - r, y - r, x + r, y + r], fill=(*color, 255))
    draw.line([(x - r * 2, y), (x + r * 2, y)], fill=(255, 255, 255, 255), width=2)
    draw.line([(x, y - r * 2), (x, y + r * 2)], fill=(255, 255, 255, 255), width=2)

def composite_frame(hero_key: str, guard_key: str, guard_x: int, hero_x: int = HERO_X, spark_pt=None) -> Image.Image:
    frame = corridor.copy()

    # Draw hero (faces right)
    hero_im = get_tinted(hero_key, SAXON_COLOR)
    h_feet = manifest[hero_key]["points"]["feet"]
    frame.paste(hero_im, (round(hero_x - h_feet[0]), round(FLOOR_Y - h_feet[1])), hero_im)

    # Draw guard (faces left)
    guard_im = get_tinted(guard_key, NORMAN_COLOR)
    guard_im = ImageOps.mirror(guard_im)
    g_feet = manifest[guard_key]["points"]["feet"]
    g_w = manifest[guard_key]["size"][0]
    frame.paste(guard_im, (round(guard_x - (g_w - g_feet[0])), round(FLOOR_Y - g_feet[1])), guard_im)

    if spark_pt:
        draw_spark(frame, spark_pt[0], spark_pt[1])

    return frame.convert("RGB")

frames = []
durations = []

# Sequence:
# 1. Guard enters (steps 0, 1, 2, 3, 0, 1, 2, 3)
for i in range(8):
    t = i / 7.0
    gx = ENTER_FROM_X + (GUARD_X - ENTER_FROM_X) * t
    g_anim = f"swordsman_guard_step_{i % 4}"
    h_anim = f"swordsman_hero_idle_{i % 2}"
    frames.append(composite_frame(h_anim, g_anim, gx))
    durations.append(100)

# 2. Facing each other (ready idle)
for i in range(4):
    g_anim = f"swordsman_guard_idle_{i % 2}"
    h_anim = f"swordsman_hero_idle_{i % 2}"
    frames.append(composite_frame(h_anim, g_anim, GUARD_X))
    durations.append(150)

# 3. Guard winds up, hero holds ready
for i in range(2):
    g_anim = f"swordsman_guard_windup_{i}"
    h_anim = f"swordsman_hero_idle_{i}"
    frames.append(composite_frame(h_anim, g_anim, GUARD_X))
    durations.append(200)

# 4. Hero lunges forward and strikes!
for i in range(2):
    g_anim = f"swordsman_guard_windup_1"
    h_anim = f"swordsman_hero_strike_{i}"
    # Calculate spark point at blade tip
    spark = None
    if i == 1:
        h_tip = manifest[h_anim]["points"]["tip"]
        h_feet = manifest[h_anim]["points"]["feet"]
        spark = (round(HERO_X + (h_tip[0] - h_feet[0])), round(FLOOR_Y + (h_tip[1] - h_feet[1])))
    frames.append(composite_frame(h_anim, g_anim, GUARD_X, spark_pt=spark))
    durations.append(160)

# 5. Guard hit and staggered back!
for i in range(3):
    g_anim = f"swordsman_guard_hit_{min(1, i)}"
    h_anim = "swordsman_hero_idle_0"
    gx = GUARD_X + (12 if i > 0 else 6)
    frames.append(composite_frame(h_anim, g_anim, gx))
    durations.append(180)

# 6. Guard falls!
for i in range(4):
    g_anim = f"swordsman_guard_fall_{i}"
    h_anim = f"swordsman_hero_idle_{i % 2}"
    gx = GUARD_X + 16
    frames.append(composite_frame(h_anim, g_anim, gx))
    durations.append(220)

# 7. Final pose (victory)
for i in range(3):
    g_anim = "swordsman_guard_fall_3"
    h_anim = f"swordsman_hero_idle_{i % 2}"
    frames.append(composite_frame(h_anim, g_anim, GUARD_X + 16))
    durations.append(200)

gif_path = ARTIFACT_DIR / "swordfight.gif"
frames[0].save(
    gif_path,
    save_all=True,
    append_images=frames[1:],
    duration=durations,
    loop=0,
    optimize=False,
)
print(f"Saved animated fight GIF to {gif_path} ({len(frames)} frames)")
