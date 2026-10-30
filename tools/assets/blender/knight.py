"""Builds the battle knight in Blender, animates it and renders its frames.

Run it inside Blender (the MCP's execute_blender_code, or `blender -b -P knight.py`).
"""

import math
import os
import sys
from pathlib import Path

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

# Bone definitions: (head, tail, parent)
BONES = {
    # Horse spine & head
    "root": ((-0.05, 0, 1.25), (-0.05, 0, 1.35), None),
    "spine": ((-0.05, 0, 1.35), (0.48, 0, 1.38), "root"),
    "tail": ((-0.72, 0, 1.25), (-0.92, 0, 0.65), "root"),
    "neck": ((0.48, 0, 1.35), (0.76, 0, 1.72), "spine"),
    "head": ((0.76, 0, 1.72), (1.04, 0, 1.48), "neck"),
    # Hind legs (parented to root)
    "upper.HN": ((-0.58, -0.20, 1.20), (-0.54, -0.20, 0.65), "root"),
    "lower.HN": ((-0.54, -0.20, 0.65), (-0.60, -0.20, 0.07), "upper.HN"),
    "upper.HF": ((-0.58, 0.20, 1.20), (-0.54, 0.20, 0.65), "root"),
    "lower.HF": ((-0.54, 0.20, 0.65), (-0.60, 0.20, 0.07), "upper.HF"),
    # Fore legs (parented to spine)
    "upper.FN": ((0.44, -0.18, 1.20), (0.44, -0.18, 0.65), "spine"),
    "lower.FN": ((0.44, -0.18, 0.65), (0.44, -0.18, 0.07), "upper.FN"),
    "upper.FF": ((0.44, 0.18, 1.20), (0.44, 0.18, 0.65), "spine"),
    "lower.FF": ((0.44, 0.18, 0.65), (0.44, 0.18, 0.07), "upper.FF"),
    # Rider bones
    "rider_spine": ((0.0, 0, 1.36), (0.0, 0, 1.80), "spine"),
    "rider_head": ((0.0, 0, 1.84), (0.0, 0, 2.12), "rider_spine"),
    "upperarm.N": ((0.0, -0.24, 1.76), (0.0, -0.24, 1.48), "rider_spine"),
    "forearm.N": ((0.0, -0.24, 1.48), (0.0, -0.24, 1.22), "upperarm.N"),
    "lance": ((0.0, -0.26, 1.20), (0.0, -0.26, 1.65), "forearm.N"),
    "upperarm.F": ((0.0, 0.24, 1.76), (0.0, 0.24, 1.48), "rider_spine"),
    "forearm.F": ((0.0, 0.24, 1.48), (0.0, 0.24, 1.22), "upperarm.F"),
    "thigh.RN": ((0.02, -0.22, 1.32), (0.16, -0.24, 1.04), "rider_spine"),
    "shin.RN": ((0.16, -0.24, 1.04), (0.12, -0.24, 0.76), "thigh.RN"),
    "thigh.RF": ((0.02, 0.22, 1.32), (0.16, 0.24, 1.04), "rider_spine"),
    "shin.RF": ((0.16, 0.24, 1.04), (0.12, 0.24, 0.76), "thigh.RF"),
}


def build_body(r: bpy.types.Object) -> None:
    # --- Horse Body & Caparison ---
    # Barrel body covered in caparison (tint green)
    rig.limb(r, "root", (-0.68, 0, 1.25), (0.46, 0, 1.28), 0.28, "tint", verts=10, scale=(1.0, 0.85))

    # Rear caparison drape over flanks and rump
    rig.box(r, "root", (-0.46, 0, 1.08), (0.64, 0.50, 0.44), "tint")
    rig.ball(r, "root", (-0.68, 0, 1.25), 0.28, "tint", scale=(1.1, 0.88, 0.95))

    # Front caparison drape over shoulders and chest
    rig.box(r, "spine", (0.32, 0, 1.10), (0.46, 0.48, 0.42), "tint")
    rig.ball(r, "spine", (0.48, 0, 1.26), 0.27, "tint", scale=(0.95, 0.88, 0.95))

    # Saddle in leather
    rig.box(r, "root", (0.0, 0, 1.36), (0.34, 0.42, 0.08), "leather")

    # Tail in dark leather/boot
    rig.limb(r, "tail", (-0.72, 0, 1.25), (-0.92, 0, 0.65), 0.065, "boot", verts=6)

    # Neck in leather with tint green crinet/trapper
    rig.limb(r, "neck", (0.48, 0, 1.35), (0.76, 0, 1.72), 0.16, "leather", verts=8, scale=(1.2, 0.8))
    rig.limb(r, "neck", (0.50, 0, 1.37), (0.72, 0, 1.66), 0.18, "tint", verts=8, scale=(1.22, 0.82))

    # Head: jaw, muzzle and ears
    rig.ball(r, "head", (0.76, 0, 1.70), 0.13, "leather", scale=(1.1, 0.8, 1.0))
    rig.limb(r, "head", (0.76, 0, 1.70), (1.04, 0, 1.48), 0.11, "leather", verts=8, scale=(1.2, 0.75))
    rig.cone(r, "head", (0.78, -0.07, 1.80), 0.035, 0.11, "leather", top=0.01)
    rig.cone(r, "head", (0.78, 0.07, 1.80), 0.035, 0.11, "leather", top=0.01)

    # Horse legs and hooves
    for side, y in (("N", -0.20), ("F", 0.20)):
        # Hind leg
        rig.limb(r, f"upper.H{side}", (-0.58, y, 1.20), (-0.54, y, 0.65), 0.09, "leather", scale=(1.2, 0.9))
        rig.limb(r, f"lower.H{side}", (-0.54, y, 0.65), (-0.60, y, 0.12), 0.06, "leather")
        rig.box(r, f"lower.H{side}", (-0.59, y, 0.06), (0.13, 0.09, 0.09), "boot")

        # Fore leg
        rig.limb(r, f"upper.F{side}", (0.44, y, 1.20), (0.44, y, 0.65), 0.085, "leather")
        rig.limb(r, f"lower.F{side}", (0.44, y, 0.65), (0.44, y, 0.12), 0.055, "leather")
        rig.box(r, f"lower.F{side}", (0.45, y, 0.06), (0.12, 0.08, 0.09), "boot")

    # --- Rider Mesh ---
    # Torso: mail shirt, tint surcoat, leather belt
    rig.limb(r, "rider_spine", (0.0, 0, 1.38), (0.0, 0, 1.80), 0.15, "mail", scale=(1.05, 1.2))
    rig.limb(r, "rider_spine", (0.0, 0, 1.40), (0.0, 0, 1.78), 0.17, "tint", scale=(1.05, 1.2))
    rig.limb(r, "rider_spine", (0.0, 0, 1.44), (0.0, 0, 1.48), 0.185, "leather", scale=(1.05, 1.2))

    # Head: skin face, mail coif, conical steel helmet, nasal
    rig.ball(r, "rider_head", (0.03, 0, 1.95), 0.12, "skin")
    rig.ball(r, "rider_head", (-0.03, 0, 1.95), 0.135, "mail", scale=(1, 1, 1.1))
    rig.cone(r, "rider_head", (0.0, 0, 2.11), 0.15, 0.24, "steel")
    rig.box(r, "rider_head", (0.15, 0, 1.99), (0.03, 0.035, 0.12), "steel")

    # Legs: hose, boot, steel stirrup
    for side, y in (("N", -0.24), ("F", 0.24)):
        rig.limb(r, f"thigh.R{side}", (0.02, y, 1.32), (0.16, y, 1.04), 0.09, "hose")
        rig.limb(r, f"shin.R{side}", (0.16, y, 1.04), (0.12, y, 0.78), 0.08, "boot")
        rig.box(r, f"shin.R{side}", (0.17, y, 0.76), (0.13, 0.08, 0.07), "boot")
        rig.box(r, f"shin.R{side}", (0.17, y, 0.72), (0.15, 0.10, 0.025), "steel")

    # Arms
    for side, y in (("N", -0.24), ("F", 0.24)):
        rig.limb(r, f"upperarm.{side}", (0.0, y, 1.78), (0.0, y, 1.48), 0.075, "mail")
        rig.limb(r, f"forearm.{side}", (0.0, y, 1.48), (0.0, y, 1.24), 0.065, "mail")
        rig.ball(r, f"forearm.{side}", (0.0, y, 1.20), 0.055, "skin")

    # Lance in near hand
    rig.limb(r, "lance", (0.0, -0.26, 0.90), (0.0, -0.26, 2.80), 0.035, "wood", verts=6)
    rig.cone(r, "lance", (0.0, -0.26, 1.30), 0.12, 0.16, "steel", top=0.04)
    rig.cone(r, "lance", (0.0, -0.26, 2.92), 0.055, 0.25, "steel")


def pose(
    r: bpy.types.Object,
    body_lean: float,
    neck_tilt: float,
    head_tilt: float,
    tail_swing: float,
    legs: dict,
    rider_lean: float,
    rider_head: float,
    near_arm: tuple,
    lance_angle: float,
    far_arm: tuple,
    lift: float = 0.0,
) -> None:
    """Sets a knight pose from angles (in swing's sense)."""
    rig.swing(r, "root", -body_lean)
    rig.swing(r, "spine", -body_lean)
    rig.swing(r, "neck", neck_tilt)
    rig.swing(r, "head", head_tilt)
    rig.swing(r, "tail", tail_swing)

    for leg, (thigh, knee) in legs.items():
        rig.swing(r, f"upper.{leg}", thigh)
        rig.swing(r, f"lower.{leg}", -knee)

    rig.swing(r, "rider_spine", -(rider_lean - body_lean))
    rig.swing(r, "rider_head", rider_head + (rider_lean - body_lean))

    for side, (upper, fore) in (("N", near_arm), ("F", far_arm)):
        rig.swing(r, f"upperarm.{side}", upper + rider_lean)
        rig.swing(r, f"forearm.{side}", fore - upper)

    rig.swing(r, "lance", lance_angle - near_arm[1])

    foot_bones = ("lower.HN", "lower.HF", "lower.FN", "lower.FF")
    rig.ground(r, foot_bones=foot_bones, foot_offset=0.06, root="root")
    if lift != 0.0:
        r.pose.bones["root"].location.z += lift
        bpy.context.view_layer.update()


def rest_pose(r: bpy.types.Object, i: int) -> None:
    legs = {
        "HN": (-4, 8),
        "HF": (2, 6),
        "FN": (2, 4),
        "FF": (-2, 4),
    }
    pose(
        r,
        body_lean=0,
        neck_tilt=0,
        head_tilt=-5,
        tail_swing=-5,
        legs=legs,
        rider_lean=2,
        rider_head=-2,
        near_arm=(15, 65),
        lance_angle=-8,
        far_arm=(25, 60),
        lift=0.0,
    )


def gallop_pose(r: bpy.types.Object, i: int) -> None:
    """A four-beat gallop cycle over 6 frames."""
    # (body_lean, neck, head, tail, legs, rider_lean, near_arm, lance, far_arm, lift)
    p = [
        # Frame 0: Gather - hind legs reach forward under body, forelegs push back
        (
            -4,
            -6,
            8,
            -25,
            {"HN": (28, 38), "HF": (18, 32), "FN": (-22, 14), "FF": (-30, 10)},
            16,
            (50, 75),
            -82,
            (45, 80),
            0.0,
        ),
        # Frame 1: Hind plant & push - forelegs tucked, body tips up
        (
            5,
            2,
            0,
            -20,
            {"HN": (6, 18), "HF": (-14, 12), "FN": (10, 48), "FF": (18, 52)},
            14,
            (52, 76),
            -84,
            (42, 78),
            0.0,
        ),
        # Frame 2: Airborne suspension - hind legs trail, forelegs reach forward
        (
            2,
            5,
            -4,
            -35,
            {"HN": (-35, 12), "HF": (-28, 15), "FN": (38, 16), "FF": (30, 22)},
            15,
            (54, 78),
            -86,
            (44, 80),
            0.12,
        ),
        # Frame 3: Foreleg landing - far foreleg hits ground, hind legs gathering in air
        (
            -3,
            -2,
            2,
            -30,
            {"HN": (-18, 40), "HF": (-24, 35), "FN": (32, 15), "FF": (22, 10)},
            16,
            (53, 77),
            -85,
            (43, 79),
            0.0,
        ),
        # Frame 4: Near foreleg weight bearing - lowest point of forehand
        (
            -6,
            -8,
            8,
            -22,
            {"HN": (10, 48), "HF": (4, 45), "FN": (-4, 8), "FF": (-15, 12)},
            18,
            (51, 75),
            -83,
            (41, 77),
            0.0,
        ),
        # Frame 5: Foreleg push-off - transitioning to next gather
        (
            -2,
            -4,
            4,
            -26,
            {"HN": (32, 28), "HF": (24, 32), "FN": (-32, 12), "FF": (-24, 18)},
            17,
            (50, 74),
            -82,
            (42, 78),
            0.04,
        ),
    ][i]

    body_lean, neck, head, tail, legs, r_lean, near, lance, far, lift = p
    pose(
        r,
        body_lean=body_lean,
        neck_tilt=neck,
        head_tilt=head,
        tail_swing=tail,
        legs=legs,
        rider_lean=r_lean,
        rider_head=-4,
        near_arm=near,
        lance_angle=lance,
        far_arm=far,
        lift=lift,
    )


def attack_pose(r: bpy.types.Object, i: int) -> None:
    """Raise, strike, recover."""
    p = [
        # Frame 0: Raise - horse rears slightly, lance raised back
        (
            10,
            6,
            -8,
            -16,
            {"HN": (-8, 14), "HF": (-14, 10), "FN": (20, 32), "FF": (14, 38)},
            10,
            (32, 54),
            -65,
            (35, 70),
            0.05,
        ),
        # Frame 1: Strike - plunge forward, lance driven level at enemy height
        (
            -4,
            -6,
            4,
            -28,
            {"HN": (-25, 8), "HF": (-20, 10), "FN": (-5, 10), "FF": (-12, 15)},
            24,
            (65, 88),
            -92,
            (40, 75),
            0.0,
        ),
        # Frame 2: Recover - settling back to ready stance
        (
            0,
            0,
            -4,
            -10,
            {"HN": (-6, 8), "HF": (0, 8), "FN": (5, 6), "FF": (-2, 6)},
            6,
            (22, 66),
            -45,
            (30, 65),
            0.0,
        ),
    ][i]

    body_lean, neck, head, tail, legs, r_lean, near, lance, far, lift = p
    pose(
        r,
        body_lean=body_lean,
        neck_tilt=neck,
        head_tilt=head,
        tail_swing=tail,
        legs=legs,
        rider_lean=r_lean,
        rider_head=-2,
        near_arm=near,
        lance_angle=lance,
        far_arm=far,
        lift=lift,
    )


def knight_anchors(r: bpy.types.Object, i: int) -> dict:
    hand = r.matrix_world @ r.pose.bones["forearm.N"].tail
    root = r.matrix_world @ r.pose.bones["root"].head
    return {
        "feet": Vector((root.x, root.y, 0)),
        "hand": hand,
    }


ANIMS = {
    "rest": (1, rest_pose),
    "gallop": (6, gallop_pose),
    "attack": (3, attack_pose),
}


def main() -> tuple[bpy.types.Object, bpy.types.Object]:
    rig.clear()
    r = rig.build_armature(BONES, name="knight_rig")
    build_body(r)
    cam = rig.setup_render()
    return r, cam


if __name__ == "__main__":
    r, cam = main()
    rig.render(r, cam, ANIMS, prefix="knight", res=rig.RES, anchor_fn=knight_anchors)
