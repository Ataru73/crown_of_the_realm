"""Builds the joust opponent in Blender, animates him and renders his frames.

Perspective camera at the player's eye height, looking down the lists, so the
knight charges toward the camera slightly off-axis.

Run it inside Blender (the MCP's execute_blender_code, or `blender -b -P joust.py`).
"""

import json
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

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector
import rig

# Resolution for raw renders: plenty of margin so rearing/unhorsed frames don't clip
RES = (480, 460)

# Aim direction for the lance: couched under near arm (-Y), aimed across the tilt barrier
# toward the oncoming player's horse / shield (+Y)
LANCE_HAND = Vector((0.24, -0.24, 1.42))
AIM_TARGET = Vector((4.70, 0.60, 1.65))
LANCE_DIR = (AIM_TARGET - LANCE_HAND).normalized()
LANCE_TIP_LOCAL = 2.65
LANCE_BUTT_LOCAL = -0.65

# Shield orientation: facing oncoming player along the lists
SHIELD_POS = Vector((0.28, 0.18, 1.50))
SHIELD_NORMAL = (Vector((4.70, 0.60, 1.95)) - SHIELD_POS).normalized()
SHIELD_UP = Vector((0, 0, 1))
SHIELD_X = SHIELD_UP.cross(SHIELD_NORMAL).normalized()

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
    # Right arm & lance (near side, -Y)
    "upperarm.N": ((0.0, -0.24, 1.76), (0.06, -0.24, 1.48), "rider_spine"),
    "forearm.N": ((0.06, -0.24, 1.48), (0.24, -0.24, 1.42), "upperarm.N"),
    "lance": (tuple(LANCE_HAND), tuple(LANCE_HAND + LANCE_DIR * 0.35), "forearm.N"),
    # Left arm & shield (far side, +Y)
    "upperarm.F": ((0.0, 0.24, 1.76), (0.10, 0.22, 1.50), "rider_spine"),
    "forearm.F": ((0.10, 0.22, 1.50), (0.26, 0.16, 1.52), "upperarm.F"),
    "shield": (tuple(SHIELD_POS), tuple(SHIELD_POS + SHIELD_NORMAL * 0.20), "forearm.F"),
    # Rider legs & stirrups
    "thigh.RN": ((0.02, -0.22, 1.32), (0.16, -0.24, 1.04), "rider_spine"),
    "shin.RN": ((0.16, -0.24, 1.04), (0.12, -0.24, 0.76), "thigh.RN"),
    "thigh.RF": ((0.02, 0.22, 1.32), (0.16, 0.24, 1.04), "rider_spine"),
    "shin.RF": ((0.16, 0.24, 1.04), (0.12, 0.24, 0.76), "thigh.RF"),
}


def build_heater_shield(r: bpy.types.Object, bone: str = "shield") -> bpy.types.Object:
    """Builds a heraldic heater shield attached to the shield bone."""
    bm = bmesh.new()
    rows = 20
    cols = 10
    zs = [0.22 - (0.22 + 0.26) * i / (rows - 1) for i in range(rows)]

    def half_width(z: float) -> float:
        if z >= 0.02:
            return 0.19
        return 0.19 * math.sqrt(max(0.0, 1.0 - (-(z - 0.02) / 0.28) ** 2))

    def face_point(y_ratio: float, z: float, depth: float) -> Vector:
        hw = half_width(z)
        sx = -hw + 2 * hw * y_ratio
        # Convex curve across the face to deflect blows
        curve = 0.025 * (1.0 - (sx / 0.20) ** 2 if hw > 0.01 else 0.0)
        return SHIELD_POS + SHIELD_X * sx + SHIELD_UP * z + SHIELD_NORMAL * (depth + curve)

    thick = 0.012
    grid_front = []
    grid_back = []
    for z in zs:
        row_f = [bm.verts.new(face_point(j / (cols - 1), z, thick)) for j in range(cols)]
        row_b = [bm.verts.new(face_point(j / (cols - 1), z, -thick)) for j in range(cols)]
        grid_front.append(row_f)
        grid_back.append(row_b)

    for i in range(rows - 1):
        for j in range(cols - 1):
            bm.faces.new([grid_front[i][j], grid_front[i][j + 1], grid_front[i + 1][j + 1], grid_front[i + 1][j]])
            bm.faces.new([grid_back[i][j], grid_back[i + 1][j], grid_back[i + 1][j + 1], grid_back[i][j + 1]])

    for i in range(rows - 1):
        bm.faces.new([grid_front[i][0], grid_front[i + 1][0], grid_back[i + 1][0], grid_back[i][0]])
        bm.faces.new([grid_front[i][cols - 1], grid_back[i][cols - 1], grid_back[i + 1][cols - 1], grid_front[i + 1][cols - 1]])
    for j in range(cols - 1):
        bm.faces.new([grid_front[0][j], grid_back[0][j], grid_back[0][j + 1], grid_front[0][j + 1]])
        bm.faces.new([grid_front[rows - 1][j], grid_front[rows - 1][j + 1], grid_back[rows - 1][j + 1], grid_back[rows - 1][j]])

    mesh = bpy.data.meshes.new("heater_shield_mesh")
    bm.to_mesh(mesh)
    bm.free()
    shield_ob = bpy.data.objects.new("heater_shield", mesh)
    bpy.context.collection.objects.link(shield_ob)
    for p in shield_ob.data.polygons:
        p.use_smooth = True
    rig.attach(shield_ob, r, bone, "tint")

    # Gold rim around the perimeter of the shield
    bm_rim = bmesh.new()
    rim_w = 0.02
    for z in zs:
        hw = half_width(z)
        if hw < 0.01:
            continue
        p_left = face_point(0, z, thick + 0.003)
        p_right = face_point(1, z, thick + 0.003)
        for p, sign in ((p_left, -1), (p_right, 1)):
            v0 = bm_rim.verts.new(p)
            v1 = bm_rim.verts.new(p + SHIELD_X * (sign * rim_w) - SHIELD_NORMAL * 0.005)
            v2 = bm_rim.verts.new(p + SHIELD_X * (sign * rim_w) - SHIELD_NORMAL * 0.015)
            v3 = bm_rim.verts.new(p - SHIELD_NORMAL * 0.015)
            bm_rim.faces.new([v0, v1, v2, v3])

    mesh_rim = bpy.data.meshes.new("shield_rim_mesh")
    bm_rim.to_mesh(mesh_rim)
    bm_rim.free()
    rim_ob = bpy.data.objects.new("shield_rim", mesh_rim)
    bpy.context.collection.objects.link(rim_ob)
    rig.attach(rim_ob, r, bone, "gold")

    # Central golden boss & rivets
    boss_c = SHIELD_POS + SHIELD_NORMAL * (thick + 0.025)
    rig.ball(r, bone, boss_c, 0.045, "gold", scale=(0.5, 1, 1))
    rig.ball(r, bone, boss_c + SHIELD_NORMAL * 0.01, 0.02, "steel", scale=(0.5, 1, 1))

    # Studs on rim
    for angle in range(0, 360, 45):
        rad = math.radians(angle)
        sy = 0.16 * math.cos(rad)
        sz = 0.16 * math.sin(rad)
        if sz < -0.18:
            continue
        stud_pos = SHIELD_POS + SHIELD_X * sy + SHIELD_UP * sz + SHIELD_NORMAL * (thick + 0.008)
        rig.ball(r, bone, stud_pos, 0.009, "gold")

    # Leather straps on the back
    rig.limb(r, bone, SHIELD_POS - SHIELD_NORMAL * 0.02 - SHIELD_UP * 0.03,
             SHIELD_POS - SHIELD_NORMAL * 0.02 + SHIELD_UP * 0.03, 0.02, "leather", verts=6)

    return shield_ob


def build_lance(r: bpy.types.Object, bone: str = "lance") -> bpy.types.Object:
    """Builds the jousting lance: couched under right arm, pointing forward across lists."""
    hand = LANCE_HAND
    aim_dir = LANCE_DIR
    butt = hand + aim_dir * LANCE_BUTT_LOCAL
    tip = hand + aim_dir * LANCE_TIP_LOCAL

    # Shaft: wooden tapered cylinder
    rig.limb(r, bone, butt, tip, 0.032, "wood", verts=8)

    # Vamplate handguard (flared cone protecting hand)
    vamplate_pos = hand + aim_dir * 0.08
    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.14, radius2=0.045, depth=0.16, location=vamplate_pos)
    vamp_ob = bpy.context.object
    vamp_ob.rotation_euler = aim_dir.to_track_quat("Z", "Y").to_euler()
    rig.attach(vamp_ob, r, bone, "steel")

    # Steel tournament cronel at tip
    cronel_base = tip - aim_dir * 0.12
    rig.limb(r, bone, cronel_base, tip, 0.045, "steel", verts=8)
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=0.045, radius2=0.015, depth=0.06, location=tip + aim_dir * 0.03)
    tip_ob = bpy.context.object
    tip_ob.name = "lance_tip_mesh"
    tip_ob.rotation_euler = aim_dir.to_track_quat("Z", "Y").to_euler()
    rig.attach(tip_ob, r, bone, "steel")

    return tip_ob


def build_great_helm(r: bpy.types.Object, bone: str = "rider_head") -> None:
    """Builds a chivalric Great Helm with gold cross and horizontal eye slit."""
    # Main steel helm barrel
    rig.cone(r, bone, (0.02, 0, 1.98), 0.155, 0.28, "steel", top=0.14)
    rig.ball(r, bone, (0.02, 0, 2.12), 0.14, "steel", scale=(1.0, 0.95, 0.4))

    # Dark horizontal eye visor slit
    rig.box(r, bone, (0.165, 0, 2.01), (0.02, 0.16, 0.025), "dark_steel")

    # Brass/gold reinforcing cross on face
    rig.box(r, bone, (0.168, 0, 1.98), (0.015, 0.025, 0.22), "gold")
    rig.box(r, bone, (0.168, 0, 2.03), (0.015, 0.17, 0.02), "gold")

    # Lower breathing holes / perforations
    for y_off in (-0.05, -0.025, 0.025, 0.05):
        for z_off in (-0.03, -0.06):
            rig.ball(r, bone, (0.168, y_off, 1.95 + z_off), 0.005, "dark_steel")


def build_body(r: bpy.types.Object) -> None:
    """Builds the full horse, rider, great helm, heater shield and lance."""
    # --- Horse Body & Caparison ---
    rig.limb(r, "root", (-0.68, 0, 1.25), (0.46, 0, 1.28), 0.28, "tint", verts=10, scale=(1.0, 0.85))
    rig.box(r, "root", (-0.46, 0, 1.08), (0.64, 0.50, 0.44), "tint")
    rig.ball(r, "root", (-0.68, 0, 1.25), 0.28, "tint", scale=(1.1, 0.88, 0.95))

    rig.box(r, "spine", (0.32, 0, 1.10), (0.46, 0.48, 0.42), "tint")
    rig.ball(r, "spine", (0.48, 0, 1.26), 0.27, "tint", scale=(0.95, 0.88, 0.95))

    # Saddle & tail
    rig.box(r, "root", (0.0, 0, 1.36), (0.34, 0.42, 0.08), "leather")
    rig.limb(r, "tail", (-0.72, 0, 1.25), (-0.92, 0, 0.65), 0.065, "boot", verts=6)

    # Neck with tint green crinet
    rig.limb(r, "neck", (0.48, 0, 1.35), (0.76, 0, 1.72), 0.16, "leather", verts=8, scale=(1.2, 0.8))
    rig.limb(r, "neck", (0.50, 0, 1.37), (0.72, 0, 1.66), 0.18, "tint", verts=8, scale=(1.22, 0.82))

    # Horse head: jaw, muzzle and ears
    rig.ball(r, "head", (0.76, 0, 1.70), 0.13, "leather", scale=(1.1, 0.8, 1.0))
    rig.limb(r, "head", (0.76, 0, 1.70), (1.04, 0, 1.48), 0.11, "leather", verts=8, scale=(1.2, 0.75))
    rig.cone(r, "head", (0.78, -0.07, 1.80), 0.035, 0.11, "leather", top=0.01)
    rig.cone(r, "head", (0.78, 0.07, 1.80), 0.035, 0.11, "leather", top=0.01)

    # Horse legs & hooves
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

    # Head: mail coif under Great Helm
    rig.ball(r, "rider_head", (0.0, 0, 1.95), 0.135, "mail", scale=(1, 1, 1.1))
    build_great_helm(r, "rider_head")

    # Legs: hose, boot, stirrup
    for side, y in (("N", -0.24), ("F", 0.24)):
        rig.limb(r, f"thigh.R{side}", (0.02, y, 1.32), (0.16, y, 1.04), 0.09, "hose")
        rig.limb(r, f"shin.R{side}", (0.16, y, 1.04), (0.12, y, 0.78), 0.08, "boot")
        rig.box(r, f"shin.R{side}", (0.17, y, 0.76), (0.13, 0.08, 0.07), "boot")
        rig.box(r, f"shin.R{side}", (0.17, y, 0.72), (0.15, 0.10, 0.025), "steel")

    # Arms
    # Right arm: holds lance
    rig.limb(r, "upperarm.N", (0.0, -0.24, 1.76), (0.06, -0.24, 1.48), 0.075, "mail")
    rig.limb(r, "forearm.N", (0.06, -0.24, 1.48), (0.24, -0.24, 1.42), 0.065, "mail")
    rig.ball(r, "forearm.N", (0.24, -0.24, 1.42), 0.055, "leather")

    # Left arm: holds heater shield
    rig.limb(r, "upperarm.F", (0.0, 0.24, 1.76), (0.10, 0.22, 1.50), 0.075, "mail")
    rig.limb(r, "forearm.F", (0.10, 0.22, 1.50), (0.26, 0.16, 1.52), 0.065, "mail")
    rig.ball(r, "forearm.F", (0.26, 0.16, 1.52), 0.055, "leather")

    # Equipment
    build_heater_shield(r, "shield")
    build_lance(r, "lance")


def rotate_bone(r: bpy.types.Object, bone: str, pitch: float = 0.0, roll: float = 0.0, yaw: float = 0.0) -> None:
    """Rotates a bone relative to rest: pitch (Y, forward/back), roll (X), yaw (Z)."""
    rest = r.data.bones[bone].matrix_local.to_3x3()
    Ry = Matrix.Rotation(math.radians(-pitch), 3, "Y")
    Rx = Matrix.Rotation(math.radians(roll), 3, "X")
    Rz = Matrix.Rotation(math.radians(yaw), 3, "Z")
    turn = Rz @ Ry @ Rx
    r.pose.bones[bone].rotation_quaternion = (rest.inverted() @ turn @ rest).to_quaternion()


def pose(
    r: bpy.types.Object,
    body_pitch: float,
    body_roll: float,
    neck_tilt: float,
    head_tilt: float,
    tail_swing: float,
    legs: dict,
    rider_pitch: float,
    rider_roll: float,
    rider_head: float,
    shield_rot: tuple[float, float, float] = (0, 0, 0),
    lance_rot: tuple[float, float, float] = (0, 0, 0),
    lift: float = 0.0,
) -> None:
    """Sets a full joust pose."""
    rotate_bone(r, "root", pitch=body_pitch, roll=body_roll)
    rotate_bone(r, "spine", pitch=body_pitch, roll=body_roll)
    rotate_bone(r, "neck", pitch=neck_tilt)
    rotate_bone(r, "head", pitch=head_tilt)
    rotate_bone(r, "tail", pitch=tail_swing)

    for leg, (thigh, knee) in legs.items():
        rotate_bone(r, f"upper.{leg}", pitch=thigh)
        rotate_bone(r, f"lower.{leg}", pitch=-knee)

    rotate_bone(r, "rider_spine", pitch=rider_pitch, roll=rider_roll)
    rotate_bone(r, "rider_head", pitch=rider_head, roll=-rider_roll * 0.5)

    rotate_bone(r, "shield", pitch=shield_rot[0], roll=shield_rot[1], yaw=shield_rot[2])
    rotate_bone(r, "lance", pitch=lance_rot[0], roll=lance_rot[1], yaw=lance_rot[2])

    foot_bones = ("lower.HN", "lower.HF", "lower.FN", "lower.FF")
    rig.ground(r, foot_bones=foot_bones, foot_offset=0.06, root="root")
    if lift != 0.0:
        r.pose.bones["root"].location.z += lift
        bpy.context.view_layer.update()


def charge_pose(r: bpy.types.Object, i: int) -> None:
    """4-frame galloping charge seen head-on."""
    p = [
        # Frame 0: Gather - hind legs reach forward, chest rising, rider braced
        (
            -3.0,
            0.5,
            -4.0,
            6.0,
            -25.0,
            {"HN": (28, 38), "HF": (18, 32), "FN": (-20, 14), "FF": (-28, 10)},
            14.0,
            -1.0,
            (2.0, -1.0, 1.5),
            0.02,
        ),
        # Frame 1: Foreleg extension - near foreleg stretching forward, horse head dipping
        (
            4.0,
            -1.0,
            3.0,
            -2.0,
            -20.0,
            {"HN": (8, 20), "HF": (-12, 14), "FN": (12, 45), "FF": (20, 50)},
            12.0,
            1.5,
            (1.0, -0.5, 1.0),
            0.0,
        ),
        # Frame 2: Mid-stride landing - near foreleg planted, far foreleg reaching, lowest point
        (
            2.0,
            1.5,
            4.0,
            -4.0,
            -32.0,
            {"HN": (-30, 12), "HF": (-24, 16), "FN": (36, 16), "FF": (28, 24)},
            15.0,
            -1.5,
            (3.0, -1.5, 2.0),
            -0.03,
        ),
        # Frame 3: Foreleg push-off - far foreleg plants, transitioning into gather
        (
            -4.0,
            -0.5,
            -3.0,
            4.0,
            -28.0,
            {"HN": (-16, 38), "HF": (-22, 32), "FN": (28, 15), "FF": (18, 12)},
            16.0,
            1.0,
            (2.0, -1.0, 1.5),
            0.01,
        ),
    ][i]

    b_pitch, b_roll, neck, head, tail, legs, r_pitch, r_roll, shield, lift = p
    # Compensate lance pitch so it stays firmly couched and aimed level at oncoming player
    total_pitch = b_pitch * 2 + r_pitch
    lance_rot = (-total_pitch, 0.0, 0.0)

    pose(
        r,
        body_pitch=b_pitch,
        body_roll=b_roll,
        neck_tilt=neck,
        head_tilt=head,
        tail_swing=tail,
        legs=legs,
        rider_pitch=r_pitch,
        rider_roll=r_roll,
        rider_head=-3.0,
        shield_rot=shield,
        lance_rot=lance_rot,
        lift=lift,
    )


def struck_pose(r: bpy.types.Object, i: int) -> None:
    """3 frames: the hit, thrown back, falling."""
    if i == 0:
        # Frame 0: The hit - lance strikes shield, rider jolted back, shield shoved outward, horse rears
        pose(
            r,
            body_pitch=8.0,
            body_roll=-2.0,
            neck_tilt=12.0,
            head_tilt=-10.0,
            tail_swing=-15.0,
            legs={"HN": (-12, 16), "HF": (-16, 12), "FN": (18, 30), "FF": (14, 35)},
            rider_pitch=-18.0,
            rider_roll=6.0,
            rider_head=15.0,
            shield_rot=(-15.0, 12.0, -18.0),
            lance_rot=(15.0, -10.0, 8.0),
            lift=0.06,
        )
    elif i == 1:
        # Frame 1: Thrown back - rider hurled backward out of saddle, lance flying, horse rearing high
        pose(
            r,
            body_pitch=16.0,
            body_roll=-4.0,
            neck_tilt=18.0,
            head_tilt=-14.0,
            tail_swing=-10.0,
            legs={"HN": (-22, 20), "HF": (-24, 18), "FN": (32, 45), "FF": (28, 50)},
            rider_pitch=-48.0,
            rider_roll=18.0,
            rider_head=25.0,
            shield_rot=(-30.0, 24.0, -35.0),
            lance_rot=(35.0, -20.0, 15.0),
            lift=0.12,
        )
    else:
        # Frame 2: Falling - rider slipping backward & sideways off horse, completely unhorsed
        pose(
            r,
            body_pitch=6.0,
            body_roll=-6.0,
            neck_tilt=8.0,
            head_tilt=-6.0,
            tail_swing=-18.0,
            legs={"HN": (-10, 12), "HF": (-8, 14), "FN": (8, 12), "FF": (4, 15)},
            rider_pitch=-78.0,
            rider_roll=36.0,
            rider_head=30.0,
            shield_rot=(-45.0, 40.0, -50.0),
            lance_rot=(50.0, -30.0, 25.0),
            lift=0.0,
        )


def joust_anchors(r: bpy.types.Object, i: int) -> dict:
    """Exports world coordinates of shield center, shield rim radius point, and lance tip."""
    shield_ob = bpy.data.objects["heater_shield"]
    shield_center = shield_ob.matrix_world @ SHIELD_POS
    shield_rim = shield_ob.matrix_world @ (SHIELD_POS + SHIELD_X * 0.19)

    lance_tip_ob = bpy.data.objects.get("lance_tip_mesh")
    if lance_tip_ob:
        lance_tip = lance_tip_ob.matrix_world @ Vector((0, 0, 0.03))
    else:
        lance_tip = r.matrix_world @ (LANCE_HAND + LANCE_DIR * LANCE_TIP_LOCAL)

    return {
        "shield": shield_center,
        "shield_r": shield_rim,
        "lance_tip": lance_tip,
    }


ANIMS = {
    "charge": (4, charge_pose),
    "struck": (3, struck_pose),
}


def setup_joust_camera(cam: bpy.types.Object, res: tuple[int, int], px_per_m: float) -> None:
    """Places the perspective camera at the player's eye height looking down the lists."""
    cam.data.type = "PERSP"
    cam.data.lens = 52
    # Player's eye height mounted on horse: ~1.95m
    # Placed 4.7m down the list in +X, offset across the tilt barrier at Y = 0.60m
    cam.location = Vector((4.70, 0.60, 1.95))
    target = Vector((0.15, 0.05, 1.48))
    direction = target - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def main() -> tuple[bpy.types.Object, bpy.types.Object]:
    rig.clear()
    r = rig.build_armature(BONES, name="joust_rig")
    build_body(r)
    cam = rig.setup_render(res=RES, camera=setup_joust_camera)

    # Adjust sun light to shine from viewer's upper-left
    sun = bpy.data.objects.get("render_sun")
    if sun:
        sun.data.energy = 2.5
        sun.rotation_euler = (math.radians(55), math.radians(20), math.radians(-35))

    return r, cam


if __name__ == "__main__":
    r, cam = main()
    rig.render(r, cam, ANIMS, prefix="joust_knight", res=RES, anchor_fn=joust_anchors)
