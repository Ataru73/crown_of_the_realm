"""Builds the castle siege wall courses, crenellations, and rubble in Blender.

Generates:
- wall_course_0: footing course (whole, cracked, broken)
- wall_course_1: lower-mid course (whole, cracked, broken)
- wall_course_2: upper-mid course (whole, cracked, broken)
- wall_course_3: top course (whole, cracked, broken)
- wall_crenellations: stone battlements with merlons and embrasure
- wall_rubble: rubble heaps for 1..4 fallen courses
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

PX_PER_M = 40


def setup_course_cam(cam, res, px_per_m):
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 5.0  # 5.0m fits exactly 200px at 40 px/m
    cam.rotation_euler = (math.pi / 2, 0, 0)
    cam.location = Vector((0.0, -10.0, 2.5))


def setup_crenellation_cam(cam, res, px_per_m):
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 5.0
    cam.rotation_euler = (math.pi / 2, 0, 0)
    cam.location = Vector((0.0, -10.0, 0.75))


def setup_rubble_cam(cam, res, px_per_m):
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 11.0  # Fits up to 11m wide rubble mound
    cam.rotation_euler = (math.pi / 2, 0, 0)
    cam.location = Vector((0.0, -10.0, 2.2))


def add_stone_block(name: str, x0: float, x1: float, z0: float, z1: float, mat: str, depth: float = 2.0, y_offset: float = 0.0) -> bpy.types.Object:
    w = x1 - x0
    h = z1 - z0
    cx = (x0 + x1) / 2
    cz = (z0 + z1) / 2
    bpy.ops.mesh.primitive_cube_add(size=1, location=Vector((cx, y_offset, cz)))
    ob = bpy.context.object
    ob.name = name
    # Leave 0.05m gap for mortar
    ob.scale = (w - 0.04, depth, h - 0.04)
    ob.data.materials.append(rig.material(mat))
    return ob


def add_backing_mortar(x0: float, x1: float, z0: float, z1: float, depth: float = 1.9) -> None:
    w = x1 - x0
    h = z1 - z0
    cx = (x0 + x1) / 2
    cz = (z0 + z1) / 2
    bpy.ops.mesh.primitive_cube_add(size=1, location=Vector((cx, 0.0, cz)))
    ob = bpy.context.object
    ob.name = "mortar_core"
    ob.scale = (w, depth, h)
    ob.data.materials.append(rig.material("mortar"))


def build_course(row: int, state: int) -> None:
    """Builds course `row` (0..3) in state `state` (0: whole, 1: cracked, 2: broken)."""
    # Background mortar backing filling the 5x5m block
    add_backing_mortar(-2.5, 2.5, 0.0, 5.0)

    # 4 sub-layers of ashlar stones, staggered
    # Layout of blocks per layer (x0, x1, mat_key)
    layer_schemes = [
        # Sub-layer 0 (Z: 0 to 1.25)
        [(-2.5, -0.3), (-0.3, 2.5)],
        # Sub-layer 1 (Z: 1.25 to 2.5)
        [(-2.5, -1.3), (-1.3, 1.2), (1.2, 2.5)],
        # Sub-layer 2 (Z: 2.5 to 3.75)
        [(-2.5, 0.2), (0.2, 2.5)],
        # Sub-layer 3 (Z: 3.75 to 5.0)
        [(-2.5, -0.9), (-0.9, 1.4), (1.4, 2.5)],
    ]

    mats = {
        0: ["stone_dark", "stone", "stone_dark"],  # Footing: darker
        1: ["stone", "stone_light", "stone"],
        2: ["stone_light", "stone", "stone_light"],
        3: ["stone", "stone_light", "stone_dark"],  # Top course
    }
    course_mats = mats[row]

    for lay_idx, blocks in enumerate(layer_schemes):
        z0 = lay_idx * 1.25
        z1 = (lay_idx + 1) * 1.25

        for b_idx, (x0, x1) in enumerate(blocks):
            mat = course_mats[(lay_idx + b_idx) % len(course_mats)]

            # Check if this block is affected by damage in state 1 or 2
            # Stones impact on the left face (-X, near catapult)
            is_impact_zone = (x0 < -0.5 and 1.25 <= z0 <= 3.75) or (x0 < -1.5)

            if state == 2 and is_impact_zone:
                # Broken state: stones blasted out, rubble core exposed!
                if x1 <= -1.0:
                    # Outer stone completely knocked away! Replace with jagged rubble chunk inside
                    bpy.ops.mesh.primitive_cube_add(size=1, location=Vector(((x0 + x1) / 2 + 0.3, 0.0, (z0 + z1) / 2)))
                    rub = bpy.context.object
                    rub.scale = (0.7, 1.8, 0.8)
                    rub.rotation_euler = (0.2, 0.3, 0.4)
                    rub.data.materials.append(rig.material("rubble"))
                    continue
                else:
                    # Partially blasted away
                    x0_cut = (x0 + x1) / 2
                    add_stone_block(f"block_{lay_idx}_{b_idx}", x0_cut, x1, z0, z1, "stone_dark")
                    # Rubble chunk in the crater
                    bpy.ops.mesh.primitive_cube_add(size=1, location=Vector((x0_cut - 0.2, 0.0, (z0 + z1) / 2)))
                    rub = bpy.context.object
                    rub.scale = (0.5, 1.7, 0.7)
                    rub.data.materials.append(rig.material("rubble"))
            elif state == 1 and is_impact_zone:
                # Cracked state: block is cracked with dark fissure cutting across
                mid_x = (x0 + x1) / 2
                add_stone_block(f"block_{lay_idx}_{b_idx}_a", x0, mid_x - 0.06, z0, z1, mat)
                add_stone_block(f"block_{lay_idx}_{b_idx}_b", mid_x + 0.06, x1, z0, z1, "stone_dark")
                # Fissure line
                bpy.ops.mesh.primitive_cube_add(size=1, location=Vector((mid_x, 0.0, (z0 + z1) / 2)))
                fiss = bpy.context.object
                fiss.scale = (0.08, 2.05, z1 - z0)
                fiss.data.materials.append(rig.material("mortar"))
            else:
                add_stone_block(f"block_{lay_idx}_{b_idx}", x0, x1, z0, z1, mat)


def build_crenellations() -> None:
    """Builds the stone battlements (merlons and embrasures) that top the wall."""
    # Base parapet ledge
    add_stone_block("parapet_ledge", -2.5, 2.5, 0.0, 0.4, "stone_dark", depth=2.2)

    # Left merlon (raised stone block)
    add_stone_block("merlon_left", -2.5, -0.7, 0.4, 1.5, "stone", depth=2.0)
    # Right merlon
    add_stone_block("merlon_right", 0.7, 2.5, 0.4, 1.5, "stone_light", depth=2.0)

    # Coping stones (sloped caps) on top of merlons
    bpy.ops.mesh.primitive_cube_add(size=1, location=Vector((-1.6, 0.0, 1.52)))
    ob1 = bpy.context.object
    ob1.scale = (1.8, 2.1, 0.12)
    ob1.data.materials.append(rig.material("stone_light"))

    bpy.ops.mesh.primitive_cube_add(size=1, location=Vector((1.6, 0.0, 1.52)))
    ob2 = bpy.context.object
    ob2.scale = (1.8, 2.1, 0.12)
    ob2.data.materials.append(rig.material("stone_light"))


def build_rubble(stage: int) -> None:
    """Builds rubble heaps at ground level for stage = 1..4 fallen courses.
    Stage 1: 1 course fallen (width ~6.0m, height ~1.8m)
    Stage 2: 2 courses fallen (width ~7.5m, height ~2.6m)
    Stage 3: 3 courses fallen (width ~9.0m, height ~3.4m)
    Stage 4: 4 courses fallen (width ~10.5m, height ~4.2m)
    """
    params = {
        1: (3.0, 1.8, 12),
        2: (3.8, 2.6, 20),
        3: (4.6, 3.4, 30),
        4: (5.3, 4.2, 42),
    }[stage]
    half_w, max_h, num_blocks = params

    # Base mound of debris/mortar
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=half_w, radius2=half_w * 0.3, depth=max_h, location=Vector((0.0, 0.0, max_h / 2)))
    mound = bpy.context.object
    mound.scale = (1.0, 0.5, 1.0)
    mound.data.materials.append(rig.material("rubble"))

    # Tumbled ashlar stone blocks scattered across the mound
    import random
    rng = random.Random(42 + stage * 100)
    mats = ["stone_dark", "stone", "stone_light", "mortar"]

    for i in range(num_blocks):
        # Position within the triangular/trapezoid profile
        rel_x = rng.uniform(-1.0, 1.0)
        h_at_x = max_h * (1.0 - abs(rel_x) * 0.85)
        bx = rel_x * (half_w - 0.3)
        bz = rng.uniform(0.15, max(0.2, h_at_x))
        by = rng.uniform(-0.4, 0.4)

        sz_x = rng.uniform(0.3, 0.8)
        sz_z = rng.uniform(0.25, 0.6)
        sz_y = rng.uniform(0.3, 0.7)
        mat = mats[i % len(mats)]

        bpy.ops.mesh.primitive_cube_add(size=1, location=Vector((bx, by, bz)))
        ob = bpy.context.object
        ob.scale = (sz_x, sz_y, sz_z)
        ob.rotation_euler = (rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), rng.uniform(-0.8, 0.8))
        ob.data.materials.append(rig.material(mat))


def render_course(row: int) -> None:
    prefix = f"wall_course_{row}"
    out = rig.RAW / prefix
    out.mkdir(parents=True, exist_ok=True)
    res = (200, 200)

    anchors = {"size": list(res), "frames": []}
    for state in range(3):
        rig.clear()
        cam = rig.setup_render(res=res, px_per_m=PX_PER_M, camera=setup_course_cam)
        build_course(row, state)
        bpy.context.scene.render.filepath = str(out / f"{state}.png")
        bpy.ops.render.render(write_still=True)
        anchors["frames"].append({})
        print(f"Rendered {prefix} state {state}")
    (out / "anchors.json").write_text(rig.json.dumps(anchors, indent=1))


def render_crenellations() -> None:
    prefix = "wall_crenellations"
    out = rig.RAW / prefix
    out.mkdir(parents=True, exist_ok=True)
    res = (200, 60)

    rig.clear()
    cam = rig.setup_render(res=res, px_per_m=PX_PER_M, camera=setup_crenellation_cam)
    build_crenellations()
    bpy.context.scene.render.filepath = str(out / "0.png")
    bpy.ops.render.render(write_still=True)
    anchors = {"size": list(res), "frames": [{}]}
    (out / "anchors.json").write_text(rig.json.dumps(anchors, indent=1))
    print(f"Rendered {prefix}")


def render_rubble() -> None:
    prefix = "wall_rubble"
    out = rig.RAW / prefix
    out.mkdir(parents=True, exist_ok=True)
    res = (440, 200)

    anchors = {"size": list(res), "frames": []}
    for stage in range(1, 5):
        rig.clear()
        cam = rig.setup_render(res=res, px_per_m=PX_PER_M, camera=setup_rubble_cam)
        build_rubble(stage)
        idx = stage - 1
        bpy.context.scene.render.filepath = str(out / f"{idx}.png")
        bpy.ops.render.render(write_still=True)
        anchors["frames"].append({})
        print(f"Rendered {prefix} stage {stage} (frame {idx})")
    (out / "anchors.json").write_text(rig.json.dumps(anchors, indent=1))


def main():
    for r in range(4):
        render_course(r)
    render_crenellations()
    render_rubble()


if __name__ == "__main__":
    main()
