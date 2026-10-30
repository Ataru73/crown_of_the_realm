"""Builds the battle foot soldier in Blender, animates it and renders its frames.

Run it inside Blender (the MCP's execute_blender_code, or `blender -b -P soldier.py`).
"""

import math
import os
import sys
from pathlib import Path

# The repository root, or the repo seen from Blender on Windows when exec'd.
try:
    ROOT = Path(__file__).resolve().parents[3]
except NameError:
    ROOT = Path(os.environ.get("CROWN_ROOT", r"\\wsl.localhost\Ubuntu-24.04\home\lapiana\git\doc"))

BLENDER_DIR = ROOT / "tools" / "assets" / "blender"
if str(BLENDER_DIR) not in sys.path:
    sys.path.insert(0, str(BLENDER_DIR))

import bpy
from mathutils import Vector
import rig

# Bone: (head, tail, parent). Near side at y = -0.1 (legs) and -0.22 (arms).
BONES = {
    "root": ((0, 0, 0.95), (0, 0, 1.05), None),
    "spine": ((0, 0, 1.0), (0, 0, 1.45), "root"),
    "head": ((0, 0, 1.5), (0, 0, 1.78), "spine"),
    "thigh.N": ((0, -0.1, 0.95), (0, -0.1, 0.52), "root"),
    "shin.N": ((0, -0.1, 0.52), (0, -0.1, 0.09), "thigh.N"),
    "thigh.F": ((0, 0.1, 0.95), (0, 0.1, 0.52), "root"),
    "shin.F": ((0, 0.1, 0.52), (0, 0.1, 0.09), "thigh.F"),
    "upperarm.N": ((0, -0.24, 1.42), (0, -0.24, 1.14), "spine"),
    "forearm.N": ((0, -0.24, 1.14), (0, -0.24, 0.88), "upperarm.N"),
    "spear": ((0, -0.24, 0.86), (0, -0.24, 1.2), "forearm.N"),
    "upperarm.F": ((0, 0.24, 1.42), (0, 0.24, 1.14), "spine"),
    "forearm.F": ((0, 0.24, 1.14), (0, 0.24, 0.88), "upperarm.F"),
}


def build_body(r: bpy.types.Object) -> None:
    # Torso: mail shirt under a long sleeveless tunic in the lord's colour, belted,
    # its skirt flaring to the knees like the painted soldiers'.
    rig.limb(r, "spine", (0, 0, 0.98), (0, 0, 1.46), 0.15, "mail", scale=(1.05, 1.2))
    rig.limb(r, "spine", (0, 0, 1.0), (0, 0, 1.42), 0.17, "tint", scale=(1.05, 1.2))
    rig.cone(r, "root", (0, 0, 0.75), 0.24, 0.5, "tint", top=0.18, scale=(1.05, 1.15))
    rig.limb(r, "root", (0, 0, 0.94), (0, 0, 1.0), 0.19, "leather", scale=(1.05, 1.2))
    # Head, big enough to read at sprite size: face, mail coif, conical helmet, nasal.
    rig.ball(r, "head", (0.03, 0, 1.6), 0.12, "skin")
    rig.ball(r, "head", (-0.03, 0, 1.6), 0.135, "mail", scale=(1, 1, 1.1))
    rig.cone(r, "head", (0, 0, 1.76), 0.15, 0.24, "steel")
    rig.box(r, "head", (0.15, 0, 1.64), (0.03, 0.035, 0.12), "steel")
    for side, y in (("N", -0.1), ("F", 0.1)):
        rig.limb(r, f"thigh.{side}", (0, y, 0.95), (0, y, 0.5), 0.095, "hose")
        rig.limb(r, f"shin.{side}", (0, y, 0.52), (0, y, 0.16), 0.08, "hose")
        rig.limb(r, f"shin.{side}", (0.01, y, 0.0), (0.01, y, 0.22), 0.085, "boot")
        rig.box(r, f"shin.{side}", (0.08, y, 0.035), (0.16, 0.11, 0.07), "boot")
    for side, y in (("N", -0.24), ("F", 0.24)):
        rig.limb(r, f"upperarm.{side}", (0, y, 1.44), (0, y, 1.13), 0.075, "mail")
        rig.limb(r, f"forearm.{side}", (0, y, 1.14), (0, y, 0.9), 0.065, "mail")
        rig.ball(r, f"forearm.{side}", (0, y, 0.86), 0.055, "skin")
    # The spear stands upright in the near hand: shaft below and above the grip.
    rig.limb(r, "spear", (0, -0.27, -0.1), (0, -0.27, 2.0), 0.035, "wood", verts=6)
    rig.cone(r, "spear", (0, -0.27, 2.1), 0.06, 0.22, "steel")


def pose(r: bpy.types.Object, lean: float, legs: dict, near_arm: tuple, spear: float, far_arm: tuple, head: float = -2.0) -> None:
    """Sets a whole pose from absolute angles in `swing`'s sense: the spine, head and spear
    from upright (negative tips them forward), the limbs from hanging down. `legs` is
    {side: (thigh, knee bend)}; each arm is (upper arm, forearm)."""
    rig.swing(r, "spine", -lean)
    rig.swing(r, "head", head + lean)
    for side, (thigh, knee) in legs.items():
        rig.swing(r, f"thigh.{side}", thigh)
        rig.swing(r, f"shin.{side}", -knee)
    for side, (upper, fore) in (("N", near_arm), ("F", far_arm)):
        rig.swing(r, f"upperarm.{side}", upper + lean)
        rig.swing(r, f"forearm.{side}", fore - upper)
    rig.swing(r, "spear", spear - near_arm[1])
    rig.ground(r)


def stand_pose(r: bpy.types.Object, i: int) -> None:
    pose(r, 2, {"N": (3, 4), "F": (-3, 4)}, (10, 65), 2, (0, 15))


def walk_pose(r: bpy.types.Object, i: int) -> None:
    p = 2 * math.pi * i / 8
    # Each knee bends most as its leg swings through, and stays a little bent on the ground.
    legs = {
        "N": (26 * math.sin(p), 8 + 45 * max(0.0, math.cos(p))),
        "F": (-26 * math.sin(p), 8 + 45 * max(0.0, -math.cos(p))),
    }
    # The near hand carries the spear upright in front; the far arm swings against the far leg.
    upper = 10 + 3 * math.sin(p)
    far = 22 * math.sin(p)
    pose(r, 6, legs, (upper, upper + 55), 3, (far, far + 25))


def thrust_pose(r: bpy.types.Object, i: int) -> None:
    """Spear levelled, drawn back, then driven forward in a lunge."""
    lean, legs, near, spear, far = [
        (10, {"N": (18, 20), "F": (-18, 8)}, (-10, 55), -88, (25, 80)),
        (4, {"N": (14, 18), "F": (-22, 6)}, (-40, 40), -90, (5, 60)),
        (20, {"N": (40, 35), "F": (-35, 0)}, (55, 85), -92, (45, 85)),
    ][i]
    pose(r, lean, legs, near, spear, far)


def soldier_anchors(r: bpy.types.Object, i: int) -> dict:
    bones = {b: r.matrix_world @ r.pose.bones[b].tail for b in ("shin.N", "shin.F", "forearm.N")}
    root = r.matrix_world @ r.pose.bones["root"].head
    return {
        "feet": Vector((root.x, root.y, 0)),
        "foot_near": bones["shin.N"],
        "foot_far": bones["shin.F"],
        "hand": bones["forearm.N"],
    }


# Each animation: its frame count and pose. Rendered to raw-assets/soldier_<name>/.
ANIMS = {"stand": (1, stand_pose), "walk": (8, walk_pose), "thrust": (3, thrust_pose)}


def main() -> tuple[bpy.types.Object, bpy.types.Object]:
    rig.clear()
    r = rig.build_armature(BONES, name="soldier_rig")
    build_body(r)
    cam = rig.setup_render()
    return r, cam


if __name__ == "__main__":
    r, cam = main()
    rig.render(r, cam, ANIMS, prefix="soldier", res=rig.RES, anchor_fn=soldier_anchors)
