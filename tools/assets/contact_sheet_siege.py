"""Generates a contact sheet of the siege assets (catapult, arm, wall courses, crenellations, rubble)
with a 10px grid and anchors marked.
"""

import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "assets"
MANIFEST = ROOT / "src" / "data" / "assets.json"
ARTIFACT_DIR = Path("/home/lapiana/.gemini/antigravity/brain/f74493a5-04cc-4591-9c12-2387dc9c2bf7")

manifest = {e["id"]: e for e in json.loads(MANIFEST.read_text())}

font = ImageFont.load_default()

# Canvas layout
sheet_w = 640
sheet_h = 480
sheet = Image.new("RGBA", (sheet_w, sheet_h), (24, 26, 32, 255))
draw = ImageDraw.Draw(sheet)

title = "SIEGE ASSETS CONTACT SHEET (B4: Catapult & Wall | 10px grid | pivot: cyan, bucket: orange)"
draw.text((20, 15), title, fill=(240, 240, 240), font=font)


def draw_grid_cell(im: Image.Image, x0: int, y0: int, title: str, points: dict = None, scale: int = 2) -> tuple[int, int]:
    """Draws a sprite enlarged by `scale` with a 10px (in original pixels) grid and marked points."""
    w, h = im.size
    dw, dh = w * scale, h * scale

    # Cell frame
    draw.rectangle([x0, y0, x0 + dw + 8, y0 + dh + 22], fill=(34, 36, 44), outline=(60, 65, 78))
    draw.text((x0 + 4, y0 + 3), title, fill=(255, 220, 100), font=font)

    # 10px grid underlay in sprite area
    bx0, by0 = x0 + 4, y0 + 18
    for gx in range(0, w, 10):
        draw.line([bx0 + gx * scale, by0, bx0 + gx * scale, by0 + dh], fill=(45, 50, 60))
    for gy in range(0, h, 10):
        draw.line([bx0, by0 + gy * scale, bx0 + dw, by0 + gy * scale], fill=(45, 50, 60))

    # Paste scaled sprite
    im_scaled = im.resize((dw, dh), Image.NEAREST)
    sheet.paste(im_scaled, (bx0, by0), im_scaled)

    # Draw anchor points
    if points:
        for name, pt in points.items():
            px = bx0 + int(pt[0] * scale)
            py = by0 + int(pt[1] * scale)
            color = (0, 255, 255) if name == "pivot" else (255, 160, 40)
            draw.ellipse([px - 3, py - 3, px + 3, py + 3], fill=color, outline=(0, 0, 0))
            draw.text((px + 5, py - 4), name, fill=color, font=font)

    return dw + 16, dh + 28


# 1. Catapult Frame & Arm
y_cur = 45
draw.text((20, y_cur), "--- CATAPULT & ARM (scale 2x) ---", fill=(180, 200, 220), font=font)
y_cur += 20

# Catapult Frame
cat_entry = manifest.get("catapult", {})
cat_im = Image.open(OUT / "catapult.png").convert("RGBA")
dw1, dh1 = draw_grid_cell(cat_im, 20, y_cur, f"catapult ({cat_im.width}x{cat_im.height})", cat_entry.get("points"), scale=2)

# Catapult Arm
arm_entry = manifest.get("catapult_arm", {})
arm_im = Image.open(OUT / "catapult_arm.png").convert("RGBA")
dw2, dh2 = draw_grid_cell(arm_im, 20 + dw1 + 10, y_cur, f"catapult_arm ({arm_im.width}x{arm_im.height})", arm_entry.get("points"), scale=2)

# Assembled Catapult preview
arm_p = arm_entry.get("points", {}).get("pivot", [0, 0])
cat_p = cat_entry.get("points", {}).get("pivot", [0, 0])
assembled_w = cat_im.width + 30
assembled_h = cat_im.height + 20
assembled = Image.new("RGBA", (assembled_w, assembled_h), (0, 0, 0, 0))
# Paste frame
frame_x = 10
frame_y = 10
assembled.paste(cat_im, (frame_x, frame_y), cat_im)
# Paste arm pivoted
arm_x = frame_x + cat_p[0] - arm_p[0]
arm_y = frame_y + cat_p[1] - arm_p[1]
assembled.paste(arm_im, (arm_x, arm_y), arm_im)
draw_grid_cell(assembled, 20 + dw1 + dw2 + 20, y_cur, "assembled preview", scale=2)

y_cur += max(dh1, dh2) + 25

# 2. Wall Courses (4 rows x 3 states)
draw.text((20, y_cur), "--- WALL COURSES (rows 0..3, states: 0=whole, 1=cracked, 2=broken | scale 2x) ---", fill=(180, 200, 220), font=font)
y_cur += 20

col_x = 20
for r in range(4):
    for st in range(3):
        fid = f"wall_course_{r}_{st}"
        w_im = Image.open(OUT / f"{fid}.png").convert("RGBA")
        lbl = f"r{r}_s{st}"
        draw_grid_cell(w_im, col_x, y_cur, lbl, scale=2)
        col_x += 52
    col_x += 10

# Crenellations
cren_im = Image.open(OUT / "wall_crenellations.png").convert("RGBA")
draw_grid_cell(cren_im, col_x, y_cur, "crenel", scale=2)

y_cur += 75

# 3. Wall Rubble
draw.text((20, y_cur), "--- WALL RUBBLE (fallen: 0=1 course, 1=2 courses, 2=3 courses, 3=4 courses | scale 2x) ---", fill=(180, 200, 220), font=font)
y_cur += 20

col_x = 20
for f in range(4):
    fid = f"wall_rubble_{f}"
    rub_im = Image.open(OUT / f"{fid}.png").convert("RGBA")
    dw, dh = draw_grid_cell(rub_im, col_x, y_cur, f"fallen_{f+1}", scale=2)
    col_x += dw + 10

# Save contact sheet
out_path = ROOT / "tools" / "assets" / "contact_sheet_siege.png"
sheet.save(out_path)
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
sheet.save(ARTIFACT_DIR / "contact_sheet_siege.png")
print("Saved contact sheet to", out_path)
