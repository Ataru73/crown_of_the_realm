"""Generates a contact sheet of the swordsmen frames with 10px grid and anchors marked."""

import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "assets"
MANIFEST = ROOT / "src" / "data" / "assets.json"
ARTIFACT_DIR = Path("/home/lapiana/.gemini/antigravity/brain/ae2ffbd3-21ba-408b-b115-36b3b3101591")

manifest = {e["id"]: e for e in json.loads(MANIFEST.read_text())}

ANIMS = [
    ("idle", 2),
    ("step", 4),
    ("windup", 2),
    ("strike", 2),
    ("parry", 2),
    ("hit", 2),
    ("fall", 4),
]

FIGHTERS = ["swordsman_hero", "swordsman_guard"]

# Cell size: max frame width is ~165, max height is ~165
CELL_W = 180
CELL_H = 180
HEADER_H = 30
COLS = 6
ROWS = 6  # 3 rows for hero (18 frames), 3 rows for guard (18 frames)

sheet_w = COLS * CELL_W
sheet_h = ROWS * (CELL_H + HEADER_H) + 60
sheet = Image.new("RGBA", (sheet_w, sheet_h), (28, 30, 36, 255))
draw = ImageDraw.Draw(sheet)

y_offset = 10
font = ImageFont.load_default()

# Title
draw.text((sheet_w // 2 - 120, y_offset), "SWORDSMEN CONTACT SHEET (10px grid, feet:green, hand:blue, tip:red)", fill=(240, 240, 240), font=font)
y_offset += 30

for fighter_idx, fighter in enumerate(FIGHTERS):
    frame_idx = 0
    draw.text((20, y_offset + 5), f"--- {fighter.upper()} ---", fill=(255, 220, 100), font=font)
    y_offset += 25
    for anim, count in ANIMS:
        for i in range(count):
            fid = f"{fighter}_{anim}_{i}"
            col = frame_idx % COLS
            row = frame_idx // COLS
            x0 = col * CELL_W
            y0 = y_offset + row * (CELL_H + HEADER_H)

            # Draw cell box & background
            draw.rectangle([x0 + 2, y0 + 2, x0 + CELL_W - 3, y0 + CELL_H + HEADER_H - 3], fill=(38, 40, 48), outline=(60, 65, 75))

            # Header text
            draw.text((x0 + 8, y0 + 6), f"{anim}_{i}", fill=(200, 200, 200), font=font)

            # Load frame
            entry = manifest.get(fid)
            if entry and (OUT / f"{fid}.png").exists():
                im = Image.open(OUT / f"{fid}.png").convert("RGBA")
                fw, fh = im.size
                fx = x0 + (CELL_W - fw) // 2
                fy = y0 + HEADER_H + (CELL_H - fh) // 2

                # Draw 10px grid behind sprite
                for gx in range(fx, fx + fw + 1, 10):
                    draw.line([(gx, fy), (gx, fy + fh)], fill=(50, 55, 65, 255), width=1)
                for gy in range(fy, fy + fh + 1, 10):
                    draw.line([(fx, gy), (fx + fw, gy)], fill=(50, 55, 65, 255), width=1)

                # Paste sprite
                sheet.paste(im, (fx, fy), im)

                # Draw anchors
                points = entry.get("points", {})
                if "feet" in points:
                    px, py = points["feet"]
                    ax, ay = fx + px, fy + py
                    draw.ellipse([ax - 4, ay - 4, ax + 4, ay + 4], outline=(50, 230, 50), width=2)
                    draw.line([(ax - 6, ay), (ax + 6, ay)], fill=(50, 230, 50), width=1)
                    draw.line([(ax, ay - 6), (ax, ay + 6)], fill=(50, 230, 50), width=1)

                if "hand" in points:
                    px, py = points["hand"]
                    ax, ay = fx + px, fy + py
                    draw.ellipse([ax - 4, ay - 4, ax + 4, ay + 4], outline=(50, 150, 255), width=2)
                    draw.line([(ax - 6, ay), (ax + 6, ay)], fill=(50, 150, 255), width=1)
                    draw.line([(ax, ay - 6), (ax, ay + 6)], fill=(50, 150, 255), width=1)

                if "tip" in points:
                    px, py = points["tip"]
                    ax, ay = fx + px, fy + py
                    draw.ellipse([ax - 4, ay - 4, ax + 4, ay + 4], outline=(255, 60, 60), width=2)
                    draw.line([(ax - 6, ay), (ax + 6, ay)], fill=(255, 60, 60), width=1)
                    draw.line([(ax, ay - 6), (ax, ay + 6)], fill=(255, 60, 60), width=1)

            frame_idx += 1
    y_offset += 3 * (CELL_H + HEADER_H) + 10

out_file = ARTIFACT_DIR / "swordsman_contact_sheet.png"
sheet.save(out_file)
print(f"Contact sheet saved to {out_file}")
