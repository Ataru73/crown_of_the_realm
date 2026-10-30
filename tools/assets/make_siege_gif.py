"""Generates an animated GIF of the siege scene featuring the rendered catapult, arm, wall courses, crenellations, and rubble."""

import json
import math
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "assets"
MANIFEST = ROOT / "src" / "data" / "assets.json"
ARTIFACT_DIR = Path("/home/lapiana/.gemini/antigravity/brain/f74493a5-04cc-4591-9c12-2387dc9c2bf7")

manifest = {e["id"]: e for e in json.loads(MANIFEST.read_text())}

backdrop = Image.open(OUT / "siege.png").convert("RGBA")
catapult_im = Image.open(OUT / "catapult.png").convert("RGBA")
arm_im = Image.open(OUT / "catapult_arm.png").convert("RGBA")
cren_im = Image.open(OUT / "wall_crenellations.png").convert("RGBA")
keep_im = Image.open(OUT / "keep.png").convert("RGBA")
hut_im = Image.open(OUT / "hut.png").convert("RGBA")

# Geometry constants matching SiegeScene.ts
GROUND_Y = 318
CATAPULT_X = 56
SCALE = 4
WALL_THICKNESS = 5
ROW_HEIGHT = 5
DISTANCE = 85  # Metres

sx = lambda m: int(CATAPULT_X + m * SCALE)
sy = lambda m: int(GROUND_Y - m * SCALE)

wall_front = sx(DISTANCE)
wall_back = sx(DISTANCE + WALL_THICKNESS)
wall_width = wall_back - wall_front

# Catapult anchors
cat_pivot = manifest["catapult"]["points"]["pivot"]
arm_pivot = manifest["catapult_arm"]["points"]["pivot"]
arm_bucket = manifest["catapult_arm"]["points"]["bucket"]

CAT_SCALE = 0.6
cat_w = int(catapult_im.width * CAT_SCALE)
cat_h = int(catapult_im.height * CAT_SCALE)
cat_scaled = catapult_im.resize((cat_w, cat_h), Image.NEAREST)

# Position of frame: origin (0.5, 1.0) at (CATAPULT_X - 4, GROUND_Y + 2)
frame_x = (CATAPULT_X - 4) - cat_w // 2
frame_y = (GROUND_Y + 2) - cat_h

# Pivot in screen coords
scene_pivot_x = (CATAPULT_X - 4) + int((cat_pivot[0] - catapult_im.width * 0.5) * CAT_SCALE)
scene_pivot_y = (GROUND_Y + 2) + int((cat_pivot[1] - catapult_im.height * 1.0) * CAT_SCALE)

arm_dist = math.hypot(arm_bucket[0] - arm_pivot[0], arm_bucket[1] - arm_pivot[1]) * CAT_SCALE


def draw_catapult_arm(base_img: Image.Image, theta_deg: float) -> tuple[int, int]:
    """Draws the arm rotated by theta_deg (degrees above horizon, winding back towards 165)."""
    # Rotate arm image around its pivot
    # In Pillow, rotate rotates counterclockwise around center
    theta_rad = math.radians(theta_deg)
    # Target rotation in Pillow: -theta_deg
    rot_deg = -theta_deg

    # Expanded canvas for rotation
    max_dim = int(max(arm_im.width, arm_im.height) * 2.5 * CAT_SCALE)
    arm_canvas = Image.new("RGBA", (max_dim, max_dim), (0, 0, 0, 0))

    # Place arm with pivot at canvas center
    cx, cy = max_dim // 2, max_dim // 2
    arm_scaled = arm_im.resize((int(arm_im.width * CAT_SCALE), int(arm_im.height * CAT_SCALE)), Image.NEAREST)
    scaled_pivot_x = int(arm_pivot[0] * CAT_SCALE)
    scaled_pivot_y = int(arm_pivot[1] * CAT_SCALE)

    arm_canvas.paste(arm_scaled, (cx - scaled_pivot_x, cy - scaled_pivot_y), arm_scaled)
    rotated = arm_canvas.rotate(-rot_deg, resample=Image.NEAREST, center=(cx, cy))

    # Paste onto base image aligned to scene_pivot
    base_img.paste(rotated, (scene_pivot_x - cx, scene_pivot_y - cy), rotated)

    # Calculate bucket position
    bucket_x = scene_pivot_x + int(math.cos(theta_rad) * arm_dist)
    bucket_y = scene_pivot_y - int(math.sin(theta_rad) * arm_dist)
    return bucket_x, bucket_y


def draw_wall_state(base_img: Image.Image, standing: int, row_states: list[int]):
    # Courses
    for r in range(4):
        if r < standing:
            st = row_states[r]
            course_im = Image.open(OUT / f"wall_course_{r}_{st}.png").convert("RGBA")
            top = sy((r + 1) * ROW_HEIGHT)
            base_img.paste(course_im, (wall_front, top), course_im)

    # Crenellations
    if standing > 0:
        top = sy(standing * ROW_HEIGHT)
        base_img.paste(cren_im, (wall_front, top - cren_im.height), cren_im)

    # Rubble
    fallen = 4 - standing
    if fallen > 0:
        rub_im = Image.open(OUT / f"wall_rubble_{fallen - 1}.png").convert("RGBA")
        rx = wall_front + wall_width // 2 - rub_im.width // 2
        ry = GROUND_Y - rub_im.height
        base_img.paste(rub_im, (rx, ry), rub_im)


def render_scene(theta_deg: float, shot_pos: tuple[int, int] | None, standing: int, row_states: list[int], puff_pos: tuple[int, int] | None = None) -> Image.Image:
    im = backdrop.copy()

    # Bailey keep and huts
    keep_x = sx(DISTANCE + WALL_THICKNESS + 14)
    keep_w = (32 - 14) * SCALE
    keep_h = 34 * SCALE
    keep_scaled = keep_im.resize((keep_w, keep_h), Image.NEAREST)
    im.paste(keep_scaled, (keep_x, GROUND_Y - keep_h), keep_scaled)

    hut_scaled = hut_im.resize((int(hut_im.width * 0.55), int(hut_im.height * 0.55)), Image.NEAREST)
    for m in (4, 10):
        hx = sx(DISTANCE + WALL_THICKNESS + m)
        im.paste(hut_scaled, (hx - hut_scaled.width // 2, GROUND_Y + 2 - hut_scaled.height), hut_scaled)

    # Rubble apron
    draw = ImageDraw.Draw(im)
    draw.rectangle([wall_front - 4, GROUND_Y - 3, wall_back + 4, GROUND_Y], fill=(106, 100, 90))

    # Wall
    draw_wall_state(im, standing, row_states)

    # Catapult Frame
    im.paste(cat_scaled, (frame_x, frame_y), cat_scaled)

    # Catapult Arm
    bx, by = draw_catapult_arm(im, theta_deg)

    # Stone in bucket or in flight
    if shot_pos is not None:
        sx_pos, sy_pos = shot_pos
        draw.ellipse([sx_pos - 3, sy_pos - 3, sx_pos + 3, sy_pos + 3], fill=(106, 100, 96), outline=(40, 38, 36))
    elif theta_deg > 50:
        # Stone in bucket while charging
        draw.ellipse([bx - 3, by - 3, bx + 3, by + 3], fill=(106, 100, 96), outline=(40, 38, 36))

    # Impact puff
    if puff_pos:
        px, py = puff_pos
        for dx, dy, r, col in [(-6, -4, 8, (176, 168, 152)), (8, -8, 10, (154, 148, 136)), (0, -12, 12, (200, 195, 185))]:
            draw.ellipse([px + dx - r, py + dy - r, px + dx + r, py + dy + r], fill=(*col, 200))

    return im


frames = []
durations = []

# Sequence:
# 1. Aim: rest at 45 deg, intact wall (standing 4, states [0, 0, 0, 0])
for _ in range(3):
    frames.append(render_scene(45, None, 4, [0, 0, 0, 0]))
    durations.append(150)

# 2. Wind up / charge: swing from 45 back to 155
for th in np.linspace(45, 155, 6):
    frames.append(render_scene(th, None, 4, [0, 0, 0, 0]))
    durations.append(80)

# 3. Release: fling arm from 155 forward to 45
for th in [120, 80, 50, 45]:
    frames.append(render_scene(th, None, 4, [0, 0, 0, 0]))
    durations.append(50)

# 4. Shot 1 flight: arcs toward row 3 (top)
launch_x = CATAPULT_X
launch_y = sy(4)
target_x = wall_front - 2
target_y = sy(17)

t_steps = 8
for t in np.linspace(0, 1, t_steps):
    curr_x = int(launch_x + (target_x - launch_x) * t)
    # Parabolic arc
    curr_y = int(launch_y + (target_y - launch_y) * t - 90 * math.sin(t * math.pi))
    frames.append(render_scene(45, (curr_x, curr_y), 4, [0, 0, 0, 0]))
    durations.append(60)

# 5. Impact 1: hits row 3 -> cracks row 3!
for _ in range(4):
    frames.append(render_scene(45, None, 4, [0, 0, 0, 1], (target_x, target_y)))
    durations.append(100)

# 6. Wind up shot 2
for th in np.linspace(45, 160, 5):
    frames.append(render_scene(th, None, 4, [0, 0, 0, 1]))
    durations.append(70)

# 7. Release shot 2
for th in [110, 65, 45]:
    frames.append(render_scene(th, None, 4, [0, 0, 0, 1]))
    durations.append(50)

# 8. Shot 2 flight: hits row 3 again -> collapse row 3!
target_y2 = sy(16)
for t in np.linspace(0, 1, t_steps):
    curr_x = int(launch_x + (target_x - launch_x) * t)
    curr_y = int(launch_y + (target_y2 - launch_y) * t - 85 * math.sin(t * math.pi))
    frames.append(render_scene(45, (curr_x, curr_y), 4, [0, 0, 0, 1]))
    durations.append(60)

# 9. Collapse 1: row 3 collapses -> standing 3, rubble 1!
for _ in range(5):
    frames.append(render_scene(45, None, 3, [0, 0, 0, 0], (target_x, target_y2)))
    durations.append(100)

# 10. Pause on broken wall with rubble
for _ in range(5):
    frames.append(render_scene(45, None, 3, [0, 0, 0, 0]))
    durations.append(150)

out_gif = ROOT / "tools" / "assets" / "siege_test.gif"
frames[0].save(out_gif, save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True)
frames[0].save(ARTIFACT_DIR / "siege_test.gif", save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True)
print("Saved siege animation GIF to", out_gif)
