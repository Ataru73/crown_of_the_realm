"""Builds the joust opponent in Blender, animates him and renders his frames.

A caparisoned horse and a knight in a great helm, seen from the player's saddle: a
perspective camera at a mounted rider's eye height, across the tilt barrier, looking
down the lists, so the knight comes at the camera slightly off-axis. The camera sits
high enough that the horse's head sits below the knight's chest, leaving the
tint-green heater shield on his left arm in clear view.

Run it inside Blender (the MCP's execute_blender_code, or `blender -b -P joust.py`).
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

import bmesh
import bpy
from mathutils import Matrix, Vector

import rig
from swordsman import add_outline, blob, dome, lathe, mesh_object, setup_materials_and_lighting

rig.COLOURS.update({
    "horse": (122, 76, 46),
    "mane": (52, 34, 24),
})

RES = (520, 520)

# The player's eye: mounted, across the barrier (+Y), down the lists (+X).
CAMERA = Vector((5.6, 0.75, 2.40))
CAMERA_TARGET = Vector((0.15, 0.05, 1.40))

# Rider's right hand, couching the lance, and where the lance points: the player's chest.
HAND = Vector((0.24, -0.26, 1.70))
AIM = Vector((5.6, 0.75, 1.95))
LANCE_DIR = (AIM - HAND).normalized()
LANCE_TIP = 2.9  # metres ahead of the hand
LANCE_BUTT = -0.75

# Heater shield on the left arm, its face turned to the player.
SHIELD_C = Vector((0.34, 0.40, 1.82))
SHIELD_N = (CAMERA - SHIELD_C).normalized()
SHIELD_X = Vector((0, 0, 1)).cross(SHIELD_N).normalized()  # across the face, towards -Y
SHIELD_UP = SHIELD_N.cross(SHIELD_X).normalized()
SHIELD_W = 0.30  # half width, the radius the game scores against
SHIELD_TOP, SHIELD_BOTTOM = 0.33, -0.46

BONES = {
    # Horse
    "root": ((-0.1, 0, 1.22), (0.2, 0, 1.22), None),
    "neck": ((0.55, 0, 1.36), (0.92, 0, 1.74), "root"),
    "head": ((0.92, 0, 1.74), (1.10, 0, 1.34), "neck"),
    "tail": ((-0.80, 0, 1.30), (-0.95, 0, 0.80), "root"),
    "upper.FN": ((0.50, -0.16, 1.00), (0.52, -0.16, 0.52), "root"),
    "lower.FN": ((0.52, -0.16, 0.52), (0.52, -0.16, 0.08), "upper.FN"),
    "upper.FF": ((0.50, 0.16, 1.00), (0.52, 0.16, 0.52), "root"),
    "lower.FF": ((0.52, 0.16, 0.52), (0.52, 0.16, 0.08), "upper.FF"),
    "upper.HN": ((-0.62, -0.16, 1.05), (-0.58, -0.16, 0.55), "root"),
    "lower.HN": ((-0.58, -0.16, 0.55), (-0.64, -0.16, 0.08), "upper.HN"),
    "upper.HF": ((-0.62, 0.16, 1.05), (-0.58, 0.16, 0.55), "root"),
    "lower.HF": ((-0.58, 0.16, 0.55), (-0.64, 0.16, 0.08), "upper.HF"),
    # Rider, seated on the saddle
    "rider": ((0.0, 0, 1.52), (0.0, 0, 2.00), "root"),
    "rider_head": ((0.0, 0, 2.02), (0.0, 0, 2.36), "rider"),
    "thigh.N": ((0.02, -0.20, 1.56), (0.20, -0.36, 1.24), "rider"),
    "shin.N": ((0.20, -0.36, 1.24), (0.10, -0.38, 0.94), "thigh.N"),
    "thigh.F": ((0.02, 0.20, 1.56), (0.20, 0.36, 1.24), "rider"),
    "shin.F": ((0.20, 0.36, 1.24), (0.10, 0.38, 0.94), "thigh.F"),
    "upperarm.N": ((0.0, -0.26, 1.96), (-0.04, -0.32, 1.72), "rider"),
    "forearm.N": ((-0.04, -0.32, 1.72), tuple(HAND), "upperarm.N"),
    "lance": (tuple(HAND), tuple(HAND + LANCE_DIR * 0.4), "forearm.N"),
    "upperarm.F": ((0.0, 0.26, 1.96), (0.10, 0.36, 1.76), "rider"),
    "forearm.F": ((0.10, 0.36, 1.76), (0.26, 0.36, 1.80), "upperarm.F"),
    "shield": ((0.26, 0.36, 1.80), tuple(SHIELD_C + SHIELD_N * 0.2), "forearm.F"),
}


# --- Horse ---

def build_horse(r: bpy.types.Object) -> None:
    # Body under the caparison: only the chest and rump tops really show
    blob(r, "root", (-0.10, 0, 1.24), (0.74, 0.30, 0.31), "horse", outline=True)
    blob(r, "root", (0.46, 0, 1.20), (0.28, 0.30, 0.33), "horse", outline=True)
    blob(r, "root", (-0.60, 0, 1.28), (0.32, 0.31, 0.31), "horse", outline=True)

    # Caparison: a fitted cover over the back and a skirt to the knees all round
    blob(r, "root", (-0.10, 0, 1.27), (0.80, 0.34, 0.31), "tint", outline=True)
    blob(r, "root", (0.48, 0, 1.18), (0.30, 0.34, 0.34), "tint", outline=True)
    lathe(r, "root", (-0.12, 0, 0.58), (-0.12, 0, 1.22), [(0, 0.40), (1, 0.33)], "tint",
          segs=40, scale=(2.35, 1.0))
    # Gold hem round the skirt
    lathe(r, "root", (-0.12, 0, 0.56), (-0.12, 0, 0.61), [(0, 0.405), (1, 0.405)], "gold",
          segs=40, scale=(2.35, 1.0), outline=False)
    # Saddle cantle and pommel either side of the rider
    blob(r, "root", (-0.20, 0, 1.56), (0.06, 0.20, 0.10), "leather", outline=True)
    blob(r, "root", (0.20, 0, 1.54), (0.05, 0.16, 0.07), "leather", outline=True)

    # Neck under a tint crinet, mane along its crest
    lathe(r, "neck", (0.55, 0, 1.30), (0.94, 0, 1.76), [(0, 0.19), (0.6, 0.15), (1, 0.12)], "horse", segs=20)
    lathe(r, "neck", (0.58, 0, 1.34), (0.90, 0, 1.72), [(0, 0.205), (0.6, 0.165), (1, 0.13)], "tint", segs=20)
    lathe(r, "neck", (0.50, 0, 1.52), (0.86, 0, 1.86), [(0, 0.05), (1, 0.035)], "mane", segs=10)

    # Head with a steel chanfron down its face, ears pricked
    lathe(r, "head", (0.92, 0, 1.78), (1.13, 0, 1.30), [(0, 0.115), (0.5, 0.095), (1, 0.075)], "horse", segs=20)
    blob(r, "head", (0.95, 0, 1.70), (0.10, 0.14, 0.11), "horse", outline=True)  # broad forehead
    blob(r, "head", (1.08, 0, 1.36), (0.08, 0.085, 0.08), "horse", outline=True)  # muzzle
    for y in (-1, 1):
        blob(r, "head", (1.11, 0.045 * y, 1.31), (0.02, 0.02, 0.015), "mane")  # nostrils
        blob(r, "head", (0.97, 0.125 * y, 1.66), (0.025, 0.02, 0.025), "mane")  # eyes
        rig.cone(r, "head", (0.90, 0.08 * y, 1.86), 0.035, 0.13, "horse", top=0.008)
    # Steel chanfron down the face, a tint plume on the poll
    lathe(r, "head", (1.03, 0, 1.74), (1.17, 0, 1.40), [(0, 0.12), (0.6, 0.08), (1, 0.06)], "steel",
          segs=16, scale=(0.3, 1.0))
    blob(r, "head", (0.92, 0, 1.92), (0.04, 0.03, 0.08), "tint", outline=True)

    # Legs below the skirt, dark hooves
    for leg, (x, x_knee, x_hoof) in {"F": (0.50, 0.52, 0.52), "H": (-0.62, -0.58, -0.64)}.items():
        for side, y in (("N", -0.16), ("F", 0.16)):
            lathe(r, f"upper.{leg}{side}", (x, y, 1.00), (x_knee, y, 0.52), [(0, 0.085), (1, 0.06)], "horse", segs=14)
            lathe(r, f"lower.{leg}{side}", (x_knee, y, 0.52), (x_hoof, y, 0.12), [(0, 0.055), (0.8, 0.045), (1, 0.05)],
                  "horse", segs=14)
            lathe(r, f"lower.{leg}{side}", (x_hoof, y, 0.13), (x_hoof + 0.01, y, 0.02), [(0, 0.055), (1, 0.065)],
                  "mane", segs=14)

    lathe(r, "tail", (-0.80, 0, 1.30), (-0.95, 0, 0.80), [(0, 0.05), (0.5, 0.08), (1, 0.03)], "mane", segs=12)


# --- Rider ---

def build_rider(r: bpy.types.Object) -> None:
    # Mail body and the surcoat over it, skirt spread over the saddle and thighs
    lathe(r, "rider", (0, 0, 1.50), (0, 0, 2.00), [(0, 0.17), (0.5, 0.18), (0.85, 0.20), (1, 0.15)], "mail",
          segs=24, scale=(0.8, 1.15))
    lathe(r, "rider", (0, 0, 1.40), (0, 0, 1.94), [(0, 0.27), (0.25, 0.20), (0.5, 0.19), (0.9, 0.21), (1, 0.17)],
          "tint", segs=24, scale=(0.82, 1.18))
    lathe(r, "rider", (0, 0, 1.58), (0, 0, 1.63), [(0, 0.205), (1, 0.205)], "leather", segs=24,
          scale=(0.82, 1.18), outline=False)
    # Steel pauldrons give the shoulders their width
    for y in (-0.24, 0.24):
        blob(r, "rider", (0.0, y, 1.97), (0.10, 0.11, 0.08), "steel", outline=True)

    # Great helm: a flat-topped steel barrel, eye slit, gold cross, a tint crest
    blob(r, "rider_head", (0.0, 0, 2.00), (0.10, 0.14, 0.05), "mail", outline=True)
    lathe(r, "rider_head", (0.01, 0, 2.03), (0.01, 0, 2.31), [(0, 0.14), (0.7, 0.135), (1, 0.12)], "steel", segs=24,
          scale=(1.0, 0.95))
    lathe(r, "rider_head", (0.01, 0, 2.31), (0.01, 0, 2.36), dome(0.12, 4), "steel", segs=24, scale=(1.0, 0.95))
    rig.box(r, "rider_head", (0.145, 0, 2.20), (0.02, 0.22, 0.022), "dark_steel")
    rig.box(r, "rider_head", (0.148, 0, 2.15), (0.012, 0.03, 0.22), "gold")
    rig.box(r, "rider_head", (0.148, 0, 2.20), (0.012, 0.25, 0.018), "gold")
    blob(r, "rider_head", (-0.02, 0, 2.43), (0.13, 0.03, 0.08), "tint", outline=True)

    # Legs in mail down the horse's flanks, feet in the stirrups
    for side, y in (("N", -1), ("F", 1)):
        lathe(r, f"thigh.{side}", (0.02, 0.20 * y, 1.56), (0.20, 0.36 * y, 1.24), [(0, 0.09), (1, 0.07)], "mail", segs=16)
        lathe(r, f"shin.{side}", (0.20, 0.36 * y, 1.24), (0.10, 0.38 * y, 0.96), [(0, 0.065), (1, 0.055)], "mail", segs=16)
        blob(r, f"shin.{side}", (0.16, 0.38 * y, 0.93), (0.10, 0.05, 0.045), "boot", outline=True)
        rig.box(r, f"shin.{side}", (0.13, 0.38 * y, 0.88), (0.12, 0.08, 0.02), "steel")

    # Arms: the right couches the lance, the left holds the shield up
    lathe(r, "upperarm.N", (0.0, -0.26, 1.96), (-0.04, -0.32, 1.72), [(0, 0.075), (1, 0.065)], "mail", segs=14)
    lathe(r, "forearm.N", (-0.04, -0.32, 1.72), HAND, [(0, 0.065), (1, 0.055)], "mail", segs=14)
    blob(r, "forearm.N", HAND, (0.06, 0.055, 0.055), "leather", outline=True)
    lathe(r, "upperarm.F", (0.0, 0.26, 1.96), (0.10, 0.36, 1.76), [(0, 0.075), (1, 0.065)], "mail", segs=14)
    lathe(r, "forearm.F", (0.10, 0.36, 1.76), (0.26, 0.36, 1.80), [(0, 0.065), (1, 0.055)], "mail", segs=14)


def shield_half_width(z: float) -> float:
    """The heater's half width at height z: straight sides, then curving to its point."""
    if z >= 0.0:
        return SHIELD_W
    return SHIELD_W * max(1 - (z / SHIELD_BOTTOM) ** 2, 0.0) ** 0.55


def build_shield(r: bpy.types.Object) -> None:
    rows, cols, thick = 24, 12, 0.015
    zs = [SHIELD_TOP - (SHIELD_TOP - SHIELD_BOTTOM) * i / (rows - 1) for i in range(rows)]

    def point(sx: float, z: float, depth: float) -> Vector:
        # The face bows out a little across its width
        bow = 0.05 * (1 - (sx / SHIELD_W) ** 2)
        return SHIELD_C + SHIELD_X * sx + SHIELD_UP * z + SHIELD_N * (depth + bow)

    def sheet(scale: float, depth_front: float, depth_back: float, mat: str, outline: bool) -> None:
        bm = bmesh.new()
        grid = {}
        for face, depth in (("f", depth_front), ("b", depth_back)):
            grid[face] = []
            for z in zs:
                hw = max(shield_half_width(z), 0.004) * scale
                grid[face].append([bm.verts.new(point(-hw + 2 * hw * j / (cols - 1), z * scale, depth))
                                   for j in range(cols)])
        f, b = grid["f"], grid["b"]
        for i in range(rows - 1):
            for j in range(cols - 1):
                bm.faces.new((f[i][j], f[i][j + 1], f[i + 1][j + 1], f[i + 1][j]))
                bm.faces.new((b[i][j], b[i + 1][j], b[i + 1][j + 1], b[i][j + 1]))
            bm.faces.new((f[i][0], f[i + 1][0], b[i + 1][0], b[i][0]))
            bm.faces.new((f[i][-1], b[i][-1], b[i + 1][-1], f[i + 1][-1]))
        for j in range(cols - 1):
            bm.faces.new((f[0][j], b[0][j], b[0][j + 1], f[0][j + 1]))
            bm.faces.new((f[-1][j], f[-1][j + 1], b[-1][j + 1], b[-1][j]))
        ob = mesh_object(r, "shield", bm, mat, outline=outline)
        ob.name = f"shield_{mat}"

    # A steel rim showing round a painted face
    sheet(1.06, -0.004, -0.02, "steel", True)
    sheet(1.0, thick, -0.004, "tint", False)
    blob(r, "shield", SHIELD_C + SHIELD_N * 0.07 + SHIELD_UP * 0.04, (0.05, 0.05, 0.05), "gold", outline=True)


def build_lance(r: bpy.types.Object) -> None:
    butt, tip = HAND + LANCE_DIR * LANCE_BUTT, HAND + LANCE_DIR * LANCE_TIP
    lathe(r, "lance", butt, tip, [(0, 0.035), (0.25, 0.045), (1, 0.022)], "wood", segs=12)
    # Vamplate guarding the hand, and the blunt crown-shaped coronel at the point
    lathe(r, "lance", HAND + LANCE_DIR * 0.04, HAND + LANCE_DIR * 0.22, [(0, 0.15), (0.3, 0.12), (1, 0.04)],
          "steel", segs=20)
    lathe(r, "lance", tip, tip + LANCE_DIR * 0.10, [(0, 0.04), (1, 0.065)], "steel", segs=12)


# --- Posing ---

def turn(r: bpy.types.Object, bone: str, pitch: float = 0.0, roll: float = 0.0, yaw: float = 0.0) -> None:
    """Rotates a bone relative to its parent, in armature axes: pitch about Y (forward
    is +, as rig.swing), roll about X (the line of sight; + topples it to the viewer's
    left), yaw about Z."""
    rest = r.data.bones[bone].matrix_local.to_3x3()
    m = (Matrix.Rotation(math.radians(yaw), 3, "Z") @ Matrix.Rotation(math.radians(-pitch), 3, "Y")
         @ Matrix.Rotation(math.radians(roll), 3, "X"))
    r.pose.bones[bone].rotation_quaternion = (rest.inverted() @ m @ rest).to_quaternion()


def shift(r: bpy.types.Object, bone: str, offset) -> None:
    """Moves a bone by an offset in armature axes."""
    rest = r.data.bones[bone].matrix_local.to_3x3()
    r.pose.bones[bone].location = rest.inverted() @ Vector(offset)


def pose(r, body=0.0, neck=0.0, head=0.0, head_yaw=0.0, tail=-20.0, legs=None, lift=0.0,
         rider=0.0, rider_roll=0.0, rider_shift=(0, 0, 0), helm=0.0,
         arm_n=(0.0, 0.0), arm_f=(0.0, 0.0), shield=(0.0, 0.0, 0.0), lance=None, holds_lance=True) -> None:
    for pb in r.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
    turn(r, "root", pitch=body)
    turn(r, "neck", pitch=neck, yaw=head_yaw)
    turn(r, "head", pitch=head)
    turn(r, "tail", pitch=tail)
    for leg, (upper, knee) in (legs or {}).items():
        turn(r, f"upper.{leg}", pitch=upper)
        turn(r, f"lower.{leg}", pitch=-knee)
    turn(r, "rider", pitch=rider, roll=rider_roll)
    shift(r, "rider", rider_shift)
    turn(r, "rider_head", pitch=helm, roll=-rider_roll * 0.3)
    turn(r, "upperarm.N", pitch=arm_n[0], roll=arm_n[1])
    turn(r, "upperarm.F", pitch=arm_f[0], roll=arm_f[1])
    turn(r, "shield", pitch=shield[0], roll=shield[1], yaw=shield[2])
    # Unless told otherwise, the lance stays couched and level whatever the body does
    turn(r, "lance", *(lance if lance is not None else (-(body + rider), 0.0, 0.0)))
    for ob in r.children:
        if ob.parent_bone == "lance":
            ob.hide_render = not holds_lance
    rig.ground(r, foot_bones=("lower.FN", "lower.FF", "lower.HN", "lower.HF"), foot_offset=0.02, root="root")
    if lift:
        r.pose.bones["root"].location += r.data.bones["root"].matrix_local.to_3x3().inverted() @ Vector((0, 0, lift))
        bpy.context.view_layer.update()


# A four-beat gallop: (body pitch, neck, head, lift, legs as {leg: (upper, knee)}).
GALLOP = [
    (-3, -4, 4, 0.03, {"HN": (24, 30), "HF": (14, 26), "FN": (-18, 10), "FF": (-26, 8)}),
    (3, 2, -2, 0.00, {"HN": (6, 16), "HF": (-10, 12), "FN": (14, 50), "FF": (22, 56)}),
    (1, 4, -4, 0.06, {"HN": (-26, 10), "HF": (-20, 14), "FN": (30, 20), "FF": (24, 26)}),
    (-4, -3, 3, 0.01, {"HN": (-12, 34), "HF": (-20, 30), "FN": (24, 12), "FF": (14, 10)}),
]


def charge_pose(r: bpy.types.Object, i: int) -> None:
    """Galloping head-on, lance couched, shield up; the rider rides the horse's rhythm."""
    body, neck, head, lift, legs = GALLOP[i]
    pose(r, body=body, neck=neck, head=head, legs=legs, lift=lift, tail=-30 + 6 * (i % 2),
         rider=8 - body * 0.5, rider_roll=(-2, 1, 2, -1)[i], helm=-4)


def struck_pose(r: bpy.types.Object, i: int) -> None:
    """The lance takes him on the shield, he's thrown back, flinging his lance away, and
    falls off to his right."""
    body, neck, head, lift, legs = GALLOP[(1, 2, 3)[i]]
    if i == 0:
        pose(r, body=body + 3, neck=neck + 10, head=head - 12, head_yaw=8, legs=legs, lift=lift,
             rider=-22, rider_roll=12, helm=16, arm_f=(-10, 18), shield=(-20, 25, -15),
             lance=(30, -10, 25))
    elif i == 1:
        pose(r, body=body + 4, neck=neck + 14, head=head - 16, head_yaw=14, legs=legs, lift=lift,
             rider=-38, rider_roll=38, rider_shift=(-0.05, -0.18, 0.12), helm=22, arm_n=(40, -30),
             arm_f=(-30, 45), shield=(-35, 40, -25), lance=(25, -10, 60))
    else:
        pose(r, body=body, neck=neck + 8, head=head - 8, head_yaw=10, legs=legs, lift=lift,
             rider=-30, rider_roll=78, rider_shift=(-0.1, -0.50, -0.30), helm=20, arm_n=(70, -40),
             arm_f=(-50, 60), shield=(-45, 50, -30), holds_lance=False)


def joust_anchors(r: bpy.types.Object, i: int) -> dict:
    """The shield's centre, a point on its edge (the scoring radius), the lance tip, and
    `horse`, the ground under the horse, which stays put while the rider falls."""
    m = bpy.data.objects["shield_tint"].matrix_world
    tip = r.matrix_world @ r.pose.bones["lance"].matrix @ r.data.bones["lance"].matrix_local.inverted()
    root = r.matrix_world @ r.pose.bones["root"].head
    return {
        "shield": m @ SHIELD_C,
        "shield_r": m @ (SHIELD_C + SHIELD_X * SHIELD_W),
        "lance_tip": tip @ (HAND + LANCE_DIR * (LANCE_TIP + 0.1)),
        "horse": Vector((root.x, root.y, 0.0)),
    }


ANIMS = {
    "charge": (4, charge_pose),
    "struck": (3, struck_pose),
}


def setup_camera(cam: bpy.types.Object, res, px_per_m) -> None:
    cam.data.type = "PERSP"
    cam.data.lens = 50
    cam.location = CAMERA
    cam.rotation_euler = (CAMERA_TARGET - CAMERA).to_track_quat("-Z", "Y").to_euler()


def main() -> tuple[bpy.types.Object, bpy.types.Object]:
    rig.clear()
    r = rig.build_armature(BONES, name="joust_rig")
    setup_materials_and_lighting()
    build_horse(r)
    build_rider(r)
    build_shield(r)
    build_lance(r)
    cam = rig.setup_render(res=RES, camera=setup_camera)
    sun = bpy.data.objects["render_sun"]
    sun.data.energy = 2.6
    # From high behind the player's right shoulder, so the shield face catches it
    sun.rotation_euler = (CAMERA_TARGET - Vector((8, 3, 9))).to_track_quat("-Z", "Y").to_euler()
    return r, cam


if __name__ == "__main__":
    r, cam = main()
    rig.render(r, cam, ANIMS, prefix="joust_knight", res=RES, anchor_fn=joust_anchors)
