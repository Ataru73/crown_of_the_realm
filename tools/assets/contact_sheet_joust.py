"""Generates a contact sheet of the joust knight frames with 10px grid and anchors marked."""

import json
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "assets"
MANIFEST = ROOT / "src" / "data" / "assets.json"
ARTIFACT_DIR = Path("/home/lapiana/.gemini/antigravity/brain/6e54a29b-9bb4-41cd-b2d1-15757b8ac74d")

manifest = {e["id"]: e for e in json.loads(MANIFEST.read_text())}

ANIMS = [
    ("charge", 4),
    ("struck", 3),
]

# Cell dimensions: struck is 225x324, charge is 89x240
CELL_W = 260
CELL_H = 350
HEADER_H = 30
COLS = 4
ROWS = 2

sheet_w = COLS * CELL_W
sheet_h = ROWS * (CELL_H + HEADER_H) + 80
sheet = Image.new("RGBA", (sheet_w, sheet_h), (28, 30, 36, 255))
draw = ImageDraw.Draw(sheet)

y_offset = 15
font = ImageFont.load_default()

# Title
title = "JOUST KNIGHT CONTACT SHEET (10px grid | shield center: green, shield rim: cyan, lance tip: red)"
draw.text((sheet_w // 2 - 280, y_offset), title, fill=(240, 240, 240), font=font)
y_offset += 35

for row_idx, (anim, count) in enumerate(ANIMS):
    for i in range(count):
        fid = f"joust_knight_{anim}_{i}"
        col = i
        row = row_idx
        x0 = col * CELL_W
        y0 = y_offset + row * (CELL_H + HEADER_H)

        # Draw cell box & background
        draw.rectangle([x0 + 4, y0 + 4, x0 + CELL_W - 5, y0 + CELL_H + HEADER_H - 5], fill=(36, 38, 46), outline=(55, 60, 72))

        # Header text
        entry = manifest.get(fid)
        header_text = f"{anim}_{i}"
        if entry:
            pts = entry.get("points", {})
            if "shield" in pts and "shield_r" in pts:
                s, sr = pts["shield"], pts["shield_r"]
                r = math.hypot(s[0] - sr[0], s[1] - sr[1])
                header_text += f" (shield r={r:.1f}px)"
        draw.text((x0 + 10, y0 + 8), header_text, fill=(255, 220, 100), font=font)

        # Load frame
        frame_path = OUT / f"{fid}.png"
        if entry and frame_path.exists():
            im = Image.open(frame_path).convert("RGBA")
            fw, fh = im.size
            fx = x0 + (CELL_W - fw) // 2
            fy = y0 + HEADER_H + (CELL_H - fh) // 2

            # Draw 10px grid behind sprite
            for gx in range(fx, fx + fw + 1, 10):
                draw.line([(gx, fy), (gx, fy + fh)], fill=(48, 52, 62, 255), width=1)
            for gy in range(fy, fy + fh + 1, 10):
                draw.line([(fx, gy), (fx + fw, gy)], fill=(48, 52, 62, 255), width=1)

            # Paste sprite
            sheet.paste(im, (fx, fy), im)

            # Draw anchors
            points = entry.get("points", {})
            if "shield" in points:
                px, py = points["shield"]
                ax, ay = fx + px, fy + py
                draw.ellipse([ax - 4, ay - 4, ax + 4, ay + 4], outline=(50, 230, 50), width=2)
                draw.line([(ax - 6, ay), (ax + 6, ay)], fill=(50, 230, 50), width=1)
                draw.line([(ax, ay - 6), (ax, ay + 6)], fill=(50, 230, 50), width=1)

            if "shield_r" in points:
                px, py = points["shield_r"]
                ax, ay = fx + px, fy + py
                draw.ellipse([ax - 3, ay - 3, ax + 3, ay + 3], outline=(60, 200, 255), width=2)
                draw.line([(ax - 5, ay), (ax + 5, ay)], fill=(60, 200, 255), width=1)
                draw.line([(ax, ay - 5), (ax, ay + 5)], fill=(60, 200, 255), width=1)

            # If both shield and shield_r exist, draw the hit circle!
            if "shield" in points and "shield_r" in points:
                sx, sy = points["shield"]
                srx, sry = points["shield_r"]
                rad = math.hypot(sx - srx, sy - sry)
                c_ax, c_ay = fx + sx, fy + sy
                draw.ellipse([c_ax - rad, c_ay - rad, c_ax + rad, c_ay + rad], outline=(60, 200, 255, 120), width=1)

            if "lance_tip" in points:
                px, py = points["lance_tip"]
                ax, ay = fx + px, fy + py
                if 0 <= ax < sheet_w and 0 <= ay < sheet_h:
                    draw.ellipse([ax - 4, ay - 4, ax + 4, ay + 4], outline=(255, 60, 60), width=2)
                    draw.line([(ax - 6, ay), (ax + 6, ay)], fill=(255, 60, 60), width=1)
                    draw.line([(ax, ay - 6), (ax, ay + 6)], fill=(255, 60, 60), width=1)

# Save contact sheet
out_path = OUT / "contact_sheet_joust.png"
sheet.save(out_path)
print("Saved contact sheet to:", out_path)

if ARTIFACT_DIR.exists():
    art_path = ARTIFACT_DIR / "contact_sheet_joust.png"
    sheet.save(art_path)
    print("Saved contact sheet to artifact:", art_path)
