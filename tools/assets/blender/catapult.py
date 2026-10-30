"""Builds the catapult frame and arm in Blender, renders them and exports anchors.

Run it inside Blender (the MCP's execute_blender_code, or `blender -b -P catapult.py`).
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

PX_PER_M = 50
RES = (400, 260)


def setup_catapult_cam(cam, res, px_per_m):
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = res[0] / px_per_m
    tilt = math.radians(10)
    cam.rotation_euler = (math.pi / 2 - tilt, 0, 0)
    # Centered at (0.35, 0, 0.85)
    cam.location = Vector((0.35, 0, 0.85)) + Vector((0, -math.cos(tilt), math.sin(tilt))) * 10


def add_box(name: str, at: Vector, size: Vector, mat: str) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    ob = bpy.context.object
    ob.name = name
    ob.scale = size
    ob.data.materials.append(rig.material(mat))
    return ob


def add_cylinder(name: str, at: Vector, r: float, depth: float, rot: tuple, mat: str, verts: int = 12) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=at, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    ob.data.materials.append(rig.material(mat))
    return ob


def add_strut(name: str, a: Vector, b: Vector, thickness: float, mat: str) -> bpy.types.Object:
    d = b - a
    mid = (a + b) / 2
    bpy.ops.mesh.primitive_cube_add(size=1, location=mid)
    ob = bpy.context.object
    ob.name = name
    ob.scale = (thickness, thickness, d.length)
    ob.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    ob.data.materials.append(rig.material(mat))
    return ob


def build_catapult_frame() -> Vector:
    """Builds the catapult chassis, wheels, A-frame uprights, buffer, and winch.
    Pivot is placed at Z = 1.00m so that when scaled to 56px height, the pivot
    lands at ~18px above ground in SiegeScene (matching sy(4) = 302)."""
    pivot_pos = Vector((0.25, 0.0, 1.00))

    # Longitudinal timber rails
    for y in (-0.30, 0.30):
        add_box(f"rail_{y}", Vector((0.05, y, 0.22)), Vector((2.6, 0.15, 0.15)), "wood")

    # Cross transoms
    for x in (-1.1, -0.35, 0.45, 1.2):
        add_box(f"transom_{x}", Vector((x, 0.0, 0.22)), Vector((0.14, 0.74, 0.13)), "wood_dark")

    # Wheels (radius 0.22, thickness 0.08)
    for x in (-0.95, 1.05):
        # Axle bar
        add_cylinder(f"axle_{x}", Vector((x, 0.0, 0.22)), 0.055, 0.90, (math.pi / 2, 0, 0), "iron", verts=8)
        for y in (-0.40, 0.40):
            # Wooden disc
            add_cylinder(f"wheel_{x}_{y}", Vector((x, y, 0.22)), 0.22, 0.07, (math.pi / 2, 0, 0), "wood", verts=16)
            # Iron rim / tire
            add_cylinder(f"rim_{x}_{y}", Vector((x, y, 0.22)), 0.23, 0.05, (math.pi / 2, 0, 0), "iron", verts=16)
            # Hub cap
            add_cylinder(f"hub_{x}_{y}", Vector((x, y + (0.04 if y > 0 else -0.04), 0.22)), 0.075, 0.03, (math.pi / 2, 0, 0), "dark_steel", verts=8)

    # A-frame uprights on near and far sides
    for y in (-0.30, 0.30):
        # Rear diagonal strut
        add_strut(f"strut_rear_{y}", Vector((-0.25, y, 0.28)), Vector((0.25, y, 1.00)), 0.13, "wood")
        # Front diagonal strut
        add_strut(f"strut_front_{y}", Vector((0.75, y, 0.28)), Vector((0.25, y, 1.00)), 0.13, "wood")
        # Vertical center strut
        add_strut(f"strut_mid_{y}", Vector((0.25, y, 0.28)), Vector((0.25, y, 1.00)), 0.12, "wood_dark")
        # Iron apex reinforcement bracket
        add_box(f"apex_iron_{y}", Vector((0.25, y, 1.00)), Vector((0.20, 0.15, 0.20)), "dark_steel")

    # Pivot axle connecting upright apexes
    add_cylinder("pivot_axle", pivot_pos, 0.065, 0.82, (math.pi / 2, 0, 0), "iron", verts=12)
    # Torsion skein rope bundles
    for y in (-0.16, 0.16):
        add_cylinder(f"torsion_{y}", Vector((0.25, y, 1.00)), 0.10, 0.16, (math.pi / 2, 0, 0), "rope", verts=10)

    # Front buffer / stop crossbar
    add_box("buffer_bar", Vector((0.58, 0.0, 1.25)), Vector((0.16, 0.80, 0.16)), "wood_dark")
    # Buffer rope wrapping padding
    add_cylinder("buffer_pad", Vector((0.58, 0.0, 1.25)), 0.12, 0.46, (math.pi / 2, 0, 0), "rope", verts=10)
    # Buffer support struts
    for y in (-0.30, 0.30):
        add_strut(f"buffer_strut_{y}", Vector((0.25, y, 1.00)), Vector((0.58, y, 1.25)), 0.11, "wood")

    # Rear windlass winch drum
    add_cylinder("winch_drum", Vector((-0.80, 0.0, 0.38)), 0.08, 0.60, (math.pi / 2, 0, 0), "wood_dark", verts=10)
    add_cylinder("winch_rope", Vector((-0.80, 0.0, 0.38)), 0.10, 0.30, (math.pi / 2, 0, 0), "rope", verts=10)
    # Winch ratchet wheel
    add_cylinder("ratchet", Vector((-0.80, -0.34, 0.38)), 0.12, 0.03, (math.pi / 2, 0, 0), "iron", verts=10)
    # Winch handle
    add_box("winch_crank", Vector((-0.80, -0.38, 0.44)), Vector((0.035, 0.03, 0.16)), "iron")

    return pivot_pos


def build_catapult_arm() -> tuple[Vector, Vector]:
    """Builds the throwing arm: spar, pivot sleeve, counter-lever, and bucket."""
    pivot_pos = Vector((0.25, 0.0, 1.00))
    # Bucket center: length ~1.55m from pivot
    bucket_pos = Vector((1.80, 0.0, 1.08))

    # Main spar extending along +X from pivot to bucket
    spar_len = 1.55
    add_box("arm_spar", Vector((0.25 + spar_len / 2, 0.0, 1.00)), Vector((spar_len, 0.12, 0.12)), "wood")

    # Short counter-lever behind pivot
    rear_len = 0.42
    add_box("arm_rear", Vector((0.25 - rear_len / 2, 0.0, 1.00)), Vector((rear_len, 0.14, 0.14)), "wood_dark")
    # Iron counterweight block on rear end
    add_box("counterweight", Vector((0.25 - rear_len + 0.05, 0.0, 1.00)), Vector((0.13, 0.18, 0.18)), "dark_steel")

    # Pivot collar / iron sleeve
    add_cylinder("arm_collar", pivot_pos, 0.11, 0.20, (math.pi / 2, 0, 0), "iron", verts=12)
    # Iron reinforcing straps along the spar
    for x in (0.6, 1.05, 1.45):
        add_box(f"strap_{x}", Vector((x, 0.0, 1.00)), Vector((0.045, 0.14, 0.14)), "dark_steel")

    # Stone bucket / cup at the tip
    # Cup base
    add_cylinder("bucket_base", Vector((1.80, 0.0, 1.04)), 0.14, 0.05, (0, 0, 0), "wood_dark", verts=12)
    # Hollow bucket rim (frustum cone)
    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.17, radius2=0.12, depth=0.15, location=Vector((1.80, 0.0, 1.13)))
    cup = bpy.context.object
    cup.name = "bucket_cup"
    cup.data.materials.append(rig.material("wood"))
    # Iron reinforcing rim on bucket
    add_cylinder("bucket_rim", Vector((1.80, 0.0, 1.20)), 0.175, 0.025, (0, 0, 0), "iron", verts=12)

    return pivot_pos, bucket_pos


def render_asset(prefix: str, build_fn, anchor_keys: list[str]) -> None:
    rig.clear()
    cam = rig.setup_render(res=RES, px_per_m=PX_PER_M, camera=setup_catapult_cam)
    res_points = build_fn()
    if isinstance(res_points, Vector):
        world_pts = {"pivot": res_points}
    else:
        world_pts = {"pivot": res_points[0], "bucket": res_points[1]}

    out = rig.RAW / prefix
    out.mkdir(parents=True, exist_ok=True)
    frame_anchors = {k: rig.pixel(cam, world_pts[k], RES) for k in anchor_keys if k in world_pts}
    anchors = {"size": list(RES), "frames": [frame_anchors]}

    bpy.context.scene.render.filepath = str(out / "0.png")
    bpy.ops.render.render(write_still=True)
    (out / "anchors.json").write_text(rig.json.dumps(anchors, indent=1))
    print(f"Rendered {prefix} with anchors {frame_anchors}")


def main():
    render_asset("catapult", build_catapult_frame, ["pivot"])
    render_asset("catapult_arm", build_catapult_arm, ["pivot", "bucket"])


if __name__ == "__main__":
    main()
