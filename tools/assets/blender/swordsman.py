"""Builds high-detail swordsmen (hero and guard) in Blender, animates them across
all 7 combat phases, and renders frames with pixel-perfect anchor points.

Run inside Blender via execute_blender_code or `blender -b -P swordsman.py`.
"""

import math
import os
import sys
from pathlib import Path

ROOT = Path(os.environ.get("CROWN_ROOT", r"\\wsl.localhost\Ubuntu-24.04\home\lapiana\git\doc"))
BLENDER_DIR = ROOT / "tools" / "assets" / "blender"
if str(BLENDER_DIR) not in sys.path:
    sys.path.insert(0, str(BLENDER_DIR))

import bpy
import bmesh
from mathutils import Vector, Matrix, Euler
import rig

# Render resolution & scale:
# Target sprite height: ~150 px.
# At px_per_m = 162, a 1.85m human is 300 px tall raw; scale 2.0 produces exactly 150 px.
RES = (640, 500)
PX_PER_M = 162.0

# 3/4 fencer posture:
# Character faces +X, angled ~25 degrees toward the camera (-Y).
# Near arm (sword) held bent with elbow back, opening the chest.
# Far arm (shield) holding shield forward.
BONES = {
    "root": ((0, 0, 0.90), (0, 0, 1.00), None),
    "spine": ((0, 0, 0.96), (0, 0, 1.40), "root"),
    "head": ((0, 0, 1.42), (0.02, -0.04, 1.76), "spine"),
    # Near leg (right leg) forward in fencer lunge
    "thigh.N": ((0.06, -0.12, 0.90), (0.18, -0.14, 0.48), "root"),
    "shin.N": ((0.18, -0.14, 0.48), (0.24, -0.14, 0.08), "thigh.N"),
    # Far leg (left leg) braced back
    "thigh.F": ((-0.06, 0.12, 0.90), (-0.22, 0.12, 0.50), "root"),
    "shin.F": ((-0.22, 0.12, 0.50), (-0.28, 0.12, 0.08), "thigh.F"),
    # Near arm (right arm) elbow back, hand forward
    "upperarm.N": ((-0.06, -0.22, 1.36), (-0.14, -0.20, 1.10), "spine"),
    "forearm.N": ((-0.14, -0.20, 1.10), (0.16, -0.18, 1.14), "upperarm.N"),
    "sword": ((0.16, -0.18, 1.14), (0.68, -0.18, 1.76), "forearm.N"),
    # Far arm (left arm) forward holding shield
    "upperarm.F": ((0.12, 0.18, 1.36), (0.26, 0.14, 1.16), "spine"),
    "forearm.F": ((0.26, 0.14, 1.16), (0.36, 0.06, 1.18), "upperarm.F"),
    "shield": ((0.32, -0.02, 1.18), (0.44, -0.02, 1.18), "forearm.F"),
}


def add_outline(ob: bpy.types.Object, thickness: float = -0.007) -> None:
    mat_out = bpy.data.materials.get("mat_outline")
    if not mat_out:
        mat_out = bpy.data.materials.new("mat_outline")
        mat_out.use_backface_culling = True
        mat_out.use_nodes = True
        bsdf = next(n for n in mat_out.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Base Color"].default_value = (0.04, 0.04, 0.06, 1.0)
        bsdf.inputs["Roughness"].default_value = 1.0
        bsdf.inputs["Specular IOR Level"].default_value = 0.0

    if mat_out.name not in [m.name for m in ob.data.materials if m]:
        ob.data.materials.append(mat_out)
    mat_idx = [m.name for m in ob.data.materials if m].index(mat_out.name)

    mod = ob.modifiers.get("Outline") or ob.modifiers.new("Outline", "SOLIDIFY")
    mod.thickness = thickness
    mod.material_offset = mat_idx
    mod.use_flip_normals = True


def setup_materials_and_lighting() -> None:
    # 1. Chainmail with procedural ring specular pattern
    mat_m = rig.material("mail")
    nodes = mat_m.node_tree.nodes
    links = mat_m.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.32, 0.34, 0.38, 1.0)
    bsdf.inputs["Metallic"].default_value = 0.55
    bsdf.inputs["Roughness"].default_value = 0.22
    bsdf.inputs["Specular IOR Level"].default_value = 0.95

    if "TexVoronoi" not in [n.type for n in nodes]:
        vor = nodes.new("ShaderNodeTexVoronoi")
        vor.inputs["Scale"].default_value = 140.0
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.75
        bump.inputs["Distance"].default_value = 0.04
        links.new(vor.outputs["Distance"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    # 2. Steel with high specular sheen
    mat_s = rig.material("steel")
    bsdf_s = next(n for n in mat_s.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf_s.inputs["Base Color"].default_value = (0.55, 0.60, 0.68, 1.0)
    # Rough enough that the Norman cone helmet doesn't blow out to white
    bsdf_s.inputs["Metallic"].default_value = 0.6
    bsdf_s.inputs["Roughness"].default_value = 0.38
    bsdf_s.inputs["Specular IOR Level"].default_value = 0.6

    # 3. Tint fabric with weave bump
    mat_t = rig.material("tint")
    bsdf_t = next(n for n in mat_t.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    if "TexNoise" not in [n.type for n in mat_t.node_tree.nodes]:
        t_nodes = mat_t.node_tree.nodes
        t_links = mat_t.node_tree.links
        noise = t_nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 150.0
        bump_t = t_nodes.new("ShaderNodeBump")
        bump_t.inputs["Strength"].default_value = 0.35
        bump_t.inputs["Distance"].default_value = 0.025
        t_links.new(noise.outputs["Fac"], bump_t.inputs["Height"])
        t_links.new(bump_t.outputs["Normal"], bsdf_t.inputs["Normal"])


def add_dramatic_lighting() -> None:
    """Adds key directional light and warm torch bounce matching the corridor torches."""
    sun = bpy.data.objects.get("render_sun")
    if sun:
        sun.data.energy = 2.8
        sun.rotation_euler = (math.radians(45), math.radians(-30), math.radians(-15))

    torch_light = bpy.data.objects.get("torch_light")
    if not torch_light:
        t_data = bpy.data.lights.new("torch_light", "POINT")
        t_data.energy = 80.0
        t_data.color = (1.0, 0.68, 0.28)
        t_data.shadow_soft_size = 0.2
        torch_light = bpy.data.objects.new("torch_light", t_data)
        bpy.context.collection.objects.link(torch_light)
    torch_light.location = (0.6, -1.8, 0.8)


def create_muscle_limb(rig_ob, bone_name, a, b, r_profile, mat_name, scale=(1.0, 1.0), outline=True):
    a, b = Vector(a), Vector(b)
    d = b - a
    length = d.length

    bm = bmesh.new()
    segments = 16
    rings = len(r_profile)

    verts_per_ring = []
    for t, r in r_profile:
        z = -length / 2 + t * length
        ring_verts = []
        for i in range(segments):
            angle = 2 * math.pi * i / segments
            x = r * math.cos(angle) * scale[0]
            y = r * math.sin(angle) * scale[1]
            ring_verts.append(bm.verts.new((x, y, z)))
        verts_per_ring.append(ring_verts)

    for r_idx in range(rings - 1):
        for i in range(segments):
            next_i = (i + 1) % segments
            v1 = verts_per_ring[r_idx][i]
            v2 = verts_per_ring[r_idx][next_i]
            v3 = verts_per_ring[r_idx + 1][next_i]
            v4 = verts_per_ring[r_idx + 1][i]
            bm.faces.new((v1, v2, v3, v4))

    bm.faces.new(verts_per_ring[0])
    bm.faces.new(list(reversed(verts_per_ring[-1])))

    mesh = bpy.data.meshes.new(f"mesh_{bone_name}")
    bm.to_mesh(mesh)
    bm.free()

    ob = bpy.data.objects.new(f"ob_{bone_name}", mesh)
    bpy.context.collection.objects.link(ob)

    ob.location = (a + b) / 2
    ob.rotation_euler = d.to_track_quat("Z", "Y").to_euler()

    for p in ob.data.polygons:
        p.use_smooth = True

    rig.attach(ob, rig_ob, bone_name, mat_name)
    if outline:
        add_outline(ob)
    return ob


def build_head(r: bpy.types.Object, is_norman: bool = False) -> None:
    # 1. Neck with chain mail coif
    rig.limb(r, "head", (0, 0, 1.42), (0.02, -0.04, 1.56), 0.125, "mail", verts=16)
    add_outline(bpy.context.object)

    # 2. Cranium base (mail coif extending over back of skull)
    rig.ball(r, "head", (-0.01, 0.01, 1.62), 0.138, "mail", scale=(1.05, 0.98, 1.05))
    add_outline(bpy.context.object)

    # 3. 3/4 Face (skin tone) - tilted forward and facing (+X, -Y)
    rig.ball(r, "head", (0.07, -0.07, 1.60), 0.115, "skin", scale=(1.12, 0.92, 0.96))

    # Prominent nose pointing forward-right
    rig.cone(r, "head", (0.17, -0.09, 1.61), 0.032, 0.08, "skin", top=0.01)
    bpy.context.object.rotation_euler = (math.radians(-75), math.radians(20), 0)

    # Brow ridge & eye socket shadow
    rig.box(r, "head", (0.14, -0.10, 1.65), (0.03, 0.08, 0.025), "dark_steel")
    rig.ball(r, "head", (0.145, -0.11, 1.64), 0.015, "skin")
    rig.ball(r, "head", (0.148, -0.115, 1.64), 0.008, "dark_steel")

    # Mouth / mustache
    rig.box(r, "head", (0.13, -0.09, 1.55), (0.04, 0.08, 0.04), "hair" if not is_norman else "skin")

    # Mail coif framing the face: chin wrap and cheek covers
    rig.limb(r, "head", (0.05, -0.04, 1.53), (0.05, 0.06, 1.53), 0.12, "mail", verts=16, scale=(1.0, 0.5))
    add_outline(bpy.context.object)

    if not is_norman:
        # Saxon helmet: steel bowl with spangenhelm bands and rivets
        rig.ball(r, "head", (0.01, 0.01, 1.68), 0.155, "steel", scale=(1.06, 0.98, 1.02))
        add_outline(bpy.context.object)
        rig.limb(r, "head", (0.01, 0.01, 1.64), (0.01, 0.01, 1.67), 0.162, "gold", verts=20, scale=(1.06, 0.98))
        rig.box(r, "head", (0.01, 0.01, 1.76), (0.33, 0.035, 0.02), "gold")
        rig.box(r, "head", (0.01, 0.01, 1.76), (0.035, 0.31, 0.02), "gold")
        rig.ball(r, "head", (0.01, 0.01, 1.78), 0.025, "gold")
    else:
        # Norman helmet: conical steel helmet with nasal bar
        rig.cone(r, "head", (0.01, 0.01, 1.78), 0.16, 0.32, "steel", top=0.02, scale=(1.05, 0.98))
        # Smooth the facets so the sun doesn't flash one of them white
        for p in bpy.context.object.data.polygons:
            p.use_smooth = True
        add_outline(bpy.context.object)
        rig.limb(r, "head", (0.01, 0.01, 1.64), (0.01, 0.01, 1.67), 0.164, "steel", verts=20, scale=(1.06, 0.98))
        rig.box(r, "head", (0.17, -0.08, 1.62), (0.035, 0.035, 0.14), "steel")
        add_outline(bpy.context.object)


def build_torso(r: bpy.types.Object, is_norman: bool = False) -> None:
    # 1. Chain mail hauberk torso
    rig.limb(r, "spine", (0, 0, 0.96), (0, 0, 1.40), 0.17, "mail", scale=(1.15, 1.25), verts=20)
    add_outline(bpy.context.object)

    # 2. Green sleeveless tunic with chest volume
    rig.limb(r, "spine", (0, -0.04, 1.00), (0, -0.04, 1.36), 0.19, "tint", scale=(1.12, 1.22), verts=20)
    add_outline(bpy.context.object)

    # 3. Leather belt with gold buckle and hanging strap
    rig.limb(r, "root", (0, -0.04, 0.94), (0, -0.04, 1.01), 0.21, "leather", scale=(1.12, 1.24), verts=20)
    rig.box(r, "root", (0.16, -0.16, 0.975), (0.03, 0.08, 0.05), "gold")
    rig.box(r, "root", (0.14, -0.20, 0.84), (0.018, 0.045, 0.22), "leather")

    # 4. Flared tunic skirt with deep pleated folds and shadow
    skirt_bm = bmesh.new()
    segs = 24
    top_z, bot_z = 0.97, 0.68 if not is_norman else 0.62
    top_r, bot_r = 0.20, 0.29 if not is_norman else 0.28

    top_verts, bot_verts = [], []
    for i in range(segs):
        ang = 2 * math.pi * i / segs
        pleat = 0.02 * math.cos(ang * 8)
        tx = (top_r + pleat) * math.cos(ang) * 1.12
        ty = ((top_r + pleat) * math.sin(ang) - 0.04) * 1.22
        bx = (bot_r + pleat * 2.2) * math.cos(ang) * 1.12
        by = ((bot_r + pleat * 2.2) * math.sin(ang) - 0.04) * 1.22
        top_verts.append(skirt_bm.verts.new((tx, ty, top_z)))
        bot_verts.append(skirt_bm.verts.new((bx, by, bot_z)))

    for i in range(segs):
        next_i = (i + 1) % segs
        skirt_bm.faces.new((top_verts[i], top_verts[next_i], bot_verts[next_i], bot_verts[i]))

    skirt_mesh = bpy.data.meshes.new("skirt_mesh")
    skirt_bm.to_mesh(skirt_mesh)
    skirt_bm.free()

    skirt_ob = bpy.data.objects.new("skirt_ob", skirt_mesh)
    bpy.context.collection.objects.link(skirt_ob)
    for p in skirt_ob.data.polygons:
        p.use_smooth = True
    rig.attach(skirt_ob, r, "root", "tint")
    add_outline(skirt_ob)

    # Scabbard on the far (left) hip, hanging back behind the far leg so it doesn't
    # read as a third leg between the feet
    rig.limb(r, "root", (-0.08, 0.24, 0.96), (-0.40, 0.24, 0.42), 0.04, "leather", verts=8, scale=(1.0, 0.35))
    rig.box(r, "root", (-0.08, 0.24, 0.95), (0.05, 0.05, 0.04), "gold")
    rig.ball(r, "root", (-0.41, 0.24, 0.40), 0.035, "gold", scale=(1.0, 0.5, 1.0))


def build_limbs(r: bpy.types.Object) -> None:
    # Near Leg (right leg forward in fencer stance)
    create_muscle_limb(
        r, "thigh.N",
        (0.06, -0.12, 0.90), (0.18, -0.14, 0.48),
        [(0.0, 0.128), (0.35, 0.140), (0.7, 0.115), (1.0, 0.098)],
        "mail", scale=(1.05, 1.1)
    )
    create_muscle_limb(
        r, "shin.N",
        (0.18, -0.14, 0.48), (0.24, -0.14, 0.10),
        [(0.0, 0.098), (0.25, 0.122), (0.6, 0.092), (0.9, 0.078), (1.0, 0.076)],
        "mail", scale=(1.05, 1.05)
    )
    # Pointed leather turnshoe
    rig.box(r, "shin.N", (0.30, -0.14, 0.05), (0.22, 0.11, 0.08), "boot")
    add_outline(bpy.context.object)

    # Far Leg (left leg back)
    create_muscle_limb(
        r, "thigh.F",
        (-0.06, 0.12, 0.90), (-0.22, 0.12, 0.50),
        [(0.0, 0.128), (0.35, 0.140), (0.7, 0.115), (1.0, 0.098)],
        "mail", scale=(1.05, 1.1)
    )
    create_muscle_limb(
        r, "shin.F",
        (-0.22, 0.12, 0.50), (-0.28, 0.12, 0.10),
        [(0.0, 0.098), (0.25, 0.122), (0.6, 0.092), (0.9, 0.078), (1.0, 0.076)],
        "mail", scale=(1.05, 1.05)
    )
    rig.box(r, "shin.F", (-0.22, 0.12, 0.05), (0.22, 0.11, 0.08), "boot")
    add_outline(bpy.context.object)

    # Near Arm (right arm, sword arm - pulled back to open chest)
    create_muscle_limb(
        r, "upperarm.N",
        (-0.06, -0.22, 1.36), (-0.14, -0.20, 1.10),
        [(0.0, 0.105), (0.4, 0.118), (0.8, 0.098), (1.0, 0.088)],
        "mail"
    )
    create_muscle_limb(
        r, "forearm.N",
        (-0.14, -0.20, 1.10), (0.16, -0.18, 1.14),
        [(0.0, 0.088), (0.3, 0.098), (0.7, 0.078), (1.0, 0.068)],
        "mail"
    )
    rig.ball(r, "forearm.N", (0.16, -0.18, 1.14), 0.065, "leather", scale=(1.1, 0.9, 0.9))
    rig.box(r, "forearm.N", (0.18, -0.20, 1.14), (0.05, 0.035, 0.08), "leather")

    # Far Arm (left arm holding shield forward)
    create_muscle_limb(
        r, "upperarm.F",
        (0.12, 0.18, 1.36), (0.26, 0.14, 1.16),
        [(0.0, 0.105), (0.4, 0.118), (0.8, 0.098), (1.0, 0.088)],
        "mail"
    )
    create_muscle_limb(
        r, "forearm.F",
        (0.26, 0.14, 1.16), (0.36, 0.06, 1.18),
        [(0.0, 0.088), (0.3, 0.098), (0.7, 0.078), (1.0, 0.068)],
        "mail"
    )
    rig.ball(r, "forearm.F", (0.36, 0.06, 1.18), 0.065, "leather")


def build_sword_mesh(r: bpy.types.Object) -> None:
    head = Vector((0.16, -0.18, 1.14))
    tail = Vector((0.68, -0.18, 1.76))
    d = tail - head
    axis = d.normalized()

    # Pommel
    p_pos = head - axis * 0.08
    rig.ball(r, "sword", p_pos, 0.04, "gold", scale=(1.1, 0.8, 1.1))
    add_outline(bpy.context.object)

    # Leather wrapped grip
    rig.limb(r, "sword", p_pos, head + axis * 0.02, 0.024, "leather", verts=12)

    # Crossguard
    guard_pos = head + axis * 0.03
    rig.box(r, "sword", guard_pos, (0.035, 0.24, 0.025), "gold")
    add_outline(bpy.context.object)

    # Blade with fuller groove
    blade_start = guard_pos + axis * 0.02
    blade_end = tail - axis * 0.06

    blade_bm = bmesh.new()
    b_len = (blade_end - blade_start).length
    w, th = 0.055, 0.016
    v1 = blade_bm.verts.new((0, -w / 2, -b_len / 2))
    v2 = blade_bm.verts.new((th / 2, 0, -b_len / 2))
    v3 = blade_bm.verts.new((0, w / 2, -b_len / 2))
    v4 = blade_bm.verts.new((-th / 2, 0, -b_len / 2))

    w_tip, th_tip = 0.038, 0.012
    v5 = blade_bm.verts.new((0, -w_tip / 2, b_len / 2))
    v6 = blade_bm.verts.new((th_tip / 2, 0, b_len / 2))
    v7 = blade_bm.verts.new((0, w_tip / 2, b_len / 2))
    v8 = blade_bm.verts.new((-th_tip / 2, 0, b_len / 2))

    blade_bm.faces.new((v1, v2, v6, v5))
    blade_bm.faces.new((v2, v3, v7, v6))
    blade_bm.faces.new((v3, v4, v8, v7))
    blade_bm.faces.new((v4, v1, v5, v8))

    v_pt = blade_bm.verts.new((0, 0, b_len / 2 + 0.06))
    blade_bm.faces.new((v5, v6, v_pt))
    blade_bm.faces.new((v6, v7, v_pt))
    blade_bm.faces.new((v7, v8, v_pt))
    blade_bm.faces.new((v8, v5, v_pt))

    blade_mesh = bpy.data.meshes.new("blade_mesh")
    blade_bm.to_mesh(blade_mesh)
    blade_bm.free()

    blade_ob = bpy.data.objects.new("blade_ob", blade_mesh)
    bpy.context.collection.objects.link(blade_ob)
    blade_ob.location = (blade_start + blade_end) / 2
    blade_ob.rotation_euler = axis.to_track_quat("Z", "Y").to_euler()

    for p in blade_ob.data.polygons:
        p.use_smooth = True

    rig.attach(blade_ob, r, "sword", "steel")
    add_outline(blade_ob, thickness=-0.005)


def build_shield(r: bpy.types.Object, is_norman: bool = False) -> None:
    if not is_norman:
        center = Vector((0.32, -0.02, 1.18))
        rig.limb(r, "shield", center + Vector((-0.01, 0.02, 0)), center - Vector((-0.01, 0.02, 0)), 0.28, "steel", verts=24)
        add_outline(bpy.context.object)
        rig.limb(r, "shield", center + Vector((-0.01, 0.015, 0)), center - Vector((-0.01, 0.025, 0)), 0.265, "tint", verts=24)
        rig.ball(r, "shield", center - Vector((-0.01, 0.035, 0)), 0.085, "steel", scale=(1, 0.5, 1))
        add_outline(bpy.context.object)
    else:
        center = Vector((0.32, -0.02, 1.16))
        rig.limb(r, "shield", center + Vector((-0.01, 0.02, 0.12)), center - Vector((-0.01, 0.02, -0.12)), 0.23, "steel", verts=20, scale=(1.0, 0.35))
        add_outline(bpy.context.object)
        rig.limb(r, "shield", center + Vector((-0.01, 0.015, 0.12)), center - Vector((-0.01, 0.025, -0.12)), 0.215, "tint", verts=20, scale=(1.0, 0.35))
        rig.cone(r, "shield", center - Vector((-0.01, 0.01, 0.18)), 0.215, 0.62, "tint", top=0.215, scale=(1.0, 0.35))
        add_outline(bpy.context.object)
        rig.box(r, "shield", center - Vector((-0.01, 0.025, 0.05)), (0.035, 0.035, 0.68), "steel")
        rig.ball(r, "shield", center - Vector((-0.01, 0.035, -0.05)), 0.08, "steel", scale=(1, 0.5, 1))
        add_outline(bpy.context.object)


def build_hero(r: bpy.types.Object) -> None:
    setup_materials_and_lighting()
    build_head(r, is_norman=False)
    build_torso(r, is_norman=False)
    build_limbs(r)
    build_sword_mesh(r)
    build_shield(r, is_norman=False)
    add_dramatic_lighting()


def build_guard(r: bpy.types.Object) -> None:
    setup_materials_and_lighting()
    build_head(r, is_norman=True)
    build_torso(r, is_norman=True)
    build_limbs(r)
    build_sword_mesh(r)
    build_shield(r, is_norman=True)
    add_dramatic_lighting()


def pose(
    r: bpy.types.Object,
    spine: float = 0.0,
    head: float = 0.0,
    thigh_n: float = 0.0,
    shin_n: float = 0.0,
    thigh_f: float = 0.0,
    shin_f: float = 0.0,
    upperarm_n: float = 0.0,
    forearm_n: float = 0.0,
    sword: float = 0.0,
    upperarm_f: float = 0.0,
    forearm_f: float = 0.0,
    shield: float = 0.0,
) -> None:
    """Sets a pose using forward/back swings around Y relative to the fencer rest pose.
    Parent rotational compounding is subtracted so arguments represent intuitive world deltas."""
    r.pose.bones["root"].location = (0, 0, 0)
    rig.swing(r, "root", 0)
    rig.swing(r, "spine", spine)
    rig.swing(r, "head", head - spine)
    # Legs:
    rig.swing(r, "thigh.N", thigh_n)
    rig.swing(r, "shin.N", shin_n - thigh_n)
    rig.swing(r, "thigh.F", thigh_f)
    rig.swing(r, "shin.F", shin_f - thigh_f)
    # Near arm (sword arm):
    rig.swing(r, "upperarm.N", upperarm_n - spine)
    rig.swing(r, "forearm.N", forearm_n - upperarm_n)
    rig.swing(r, "sword", sword - forearm_n)
    # Far arm (shield arm):
    rig.swing(r, "upperarm.F", upperarm_f - spine)
    rig.swing(r, "forearm.F", forearm_f - upperarm_f)
    if "shield" in r.pose.bones:
        rig.swing(r, "shield", shield - forearm_f)
    rig.ground(r, foot_offset=0.08)


def ground_fall(r: bpy.types.Object, target_z: float = 0.14) -> None:
    """Grounds a fallen body so its lowest body bone rests on target_z."""
    bpy.context.view_layer.update()
    body_bones = ["root", "spine", "head", "thigh.N", "shin.N", "thigh.F", "shin.F"]
    min_z = min(
        min((r.matrix_world @ r.pose.bones[b].head).z for b in body_bones),
        min((r.matrix_world @ r.pose.bones[b].tail).z for b in body_bones),
    )
    rest = r.data.bones["root"].matrix_local.to_3x3()
    r.pose.bones["root"].location = rest.inverted() @ Vector((0, 0, -min_z + target_z))
    bpy.context.view_layer.update()


# --- Animations ---

def idle_pose(r: bpy.types.Object, i: int) -> None:
    """Breathing bob (2 frames): ready combat guard stance."""
    if i == 0:
        pose(r)
    else:
        # Subtle breathing dip: slight spine drop, slight sword bob
        pose(
            r,
            spine=1.5,
            head=-1.0,
            thigh_n=2.0,
            shin_n=1.0,
            thigh_f=-1.0,
            shin_f=0.5,
            upperarm_n=-1.0,
            forearm_n=-2.0,
            sword=-2.0,
        )


def step_pose(r: bpy.types.Object, i: int) -> None:
    """4-frame footwork cycle for advancing / guard entering corridor."""
    if i == 0:
        # Lead foot lifts to stride
        pose(
            r,
            spine=2.0,
            thigh_n=14.0,
            shin_n=18.0,
            thigh_f=-10.0,
            shin_f=-8.0,
            sword=2.0,
        )
    elif i == 1:
        # Front foot landing forward in deep stride
        pose(
            r,
            spine=5.0,
            thigh_n=24.0,
            shin_n=8.0,
            thigh_f=-20.0,
            shin_f=-12.0,
            sword=3.0,
        )
    elif i == 2:
        # Back foot lifting / passing
        pose(
            r,
            spine=3.0,
            thigh_n=10.0,
            shin_n=-6.0,
            thigh_f=6.0,
            shin_f=22.0,
            sword=1.0,
        )
    else:
        # Settling back into ready stance
        pose(
            r,
            spine=1.0,
            thigh_n=4.0,
            shin_n=-2.0,
            thigh_f=-4.0,
            shin_f=4.0,
            sword=-1.0,
        )


def windup_pose(r: bpy.types.Object, i: int) -> None:
    """2 frames: coiling back, raising blade high for a heavy cut."""
    if i == 0:
        # Sword arm rising, blade lifting past the head
        pose(
            r,
            spine=-6.0,
            head=4.0,
            thigh_n=-4.0,
            shin_n=4.0,
            thigh_f=-12.0,
            shin_f=-8.0,
            upperarm_n=90.0,
            forearm_n=60.0,
            sword=60.0,
            shield=5.0,
        )
    else:
        # Cocked: elbow above the shoulder, blade laid back over the head
        pose(
            r,
            spine=-12.0,
            head=8.0,
            thigh_n=-10.0,
            shin_n=8.0,
            thigh_f=-18.0,
            shin_f=-14.0,
            upperarm_n=150.0,
            forearm_n=100.0,
            sword=100.0,
            upperarm_f=10.0,
            shield=10.0,
        )


def strike_pose(r: bpy.types.Object, i: int) -> None:
    """2 frames: lunging forward with a slashing blow."""
    if i == 0:
        # Stepping in, blade coming down from high in front
        pose(
            r,
            spine=10.0,
            head=-4.0,
            thigh_n=20.0,
            shin_n=10.0,
            thigh_f=-22.0,
            shin_f=-14.0,
            upperarm_n=140.0,
            forearm_n=20.0,
            sword=-30.0,
            upperarm_f=-10.0,
            shield=-5.0,
        )
    else:
        # Full lunge: arm straight, blade level at the enemy's chest
        pose(
            r,
            spine=18.0,
            head=-8.0,
            thigh_n=32.0,
            shin_n=16.0,
            thigh_f=-32.0,
            shin_f=-18.0,
            upperarm_n=95.0,
            forearm_n=-10.0,
            sword=-50.0,
            upperarm_f=-20.0,
            shield=-10.0,
        )


def parry_pose(r: bpy.types.Object, i: int) -> None:
    """2 frames: shield thrust up and forward, blade raised upright to catch the blow."""
    if i == 0:
        pose(
            r,
            spine=-3.0,
            head=2.0,
            thigh_n=2.0,
            shin_n=-2.0,
            thigh_f=-6.0,
            shin_f=-4.0,
            upperarm_n=40.0,
            forearm_n=60.0,
            sword=35.0,
            upperarm_f=35.0,
            forearm_f=25.0,
            shield=20.0,
        )
    else:
        pose(
            r,
            spine=-6.0,
            head=4.0,
            thigh_n=-2.0,
            shin_n=-4.0,
            thigh_f=-10.0,
            shin_f=-6.0,
            upperarm_n=60.0,
            forearm_n=90.0,
            sword=50.0,
            upperarm_f=55.0,
            forearm_f=40.0,
            shield=30.0,
        )


def hit_pose(r: bpy.types.Object, i: int) -> None:
    """2 frames: staggered back by an incoming strike."""
    if i == 0:
        # Snap back impact
        pose(
            r,
            spine=-22.0,
            head=-15.0,
            thigh_n=-10.0,
            shin_n=6.0,
            thigh_f=-22.0,
            shin_f=-12.0,
            upperarm_n=-25.0,
            forearm_n=-10.0,
            sword=-20.0,
            upperarm_f=-20.0,
            shield=-15.0,
        )
    else:
        # Reeling / recovering
        pose(
            r,
            spine=-14.0,
            head=-8.0,
            thigh_n=-6.0,
            shin_n=2.0,
            thigh_f=-15.0,
            shin_f=-8.0,
            upperarm_n=-15.0,
            forearm_n=-5.0,
            sword=-10.0,
            upperarm_f=-12.0,
            shield=-8.0,
        )


def lie(r: bpy.types.Object, swings: dict, shield_flat: float, target_z: float) -> None:
    """Poses a falling body by relative swings, optionally laying the shield face down."""
    r.pose.bones["root"].location = (0, 0, 0)
    for bone in ("root", "spine", "head", "thigh.N", "shin.N", "thigh.F", "shin.F",
                 "upperarm.N", "forearm.N", "sword", "upperarm.F", "forearm.F", "shield"):
        rig.swing(r, bone, swings.get(bone, 0.0))
    if shield_flat:
        # Tip the shield about its own X axis so it lies on the floor instead of through it.
        pb = r.pose.bones["shield"]
        pb.rotation_quaternion = pb.rotation_quaternion @ Matrix.Rotation(math.radians(shield_flat), 3, "X").to_quaternion()
    ground_fall(r, target_z=target_z)


def fall_pose(r: bpy.types.Object, i: int) -> None:
    """4 frames: collapsing backwards onto the floor, ending flat on back."""
    r.pose.bones["root"].location = (0, 0, 0)
    if i == 0:
        # Collapsing backwards, knees buckling
        pose(
            r,
            spine=-30.0,
            head=12.0,
            thigh_n=-16.0,
            shin_n=22.0,
            thigh_f=-26.0,
            shin_f=18.0,
            upperarm_n=-30.0,
            forearm_n=-5.0,
            sword=-20.0,
            upperarm_f=-20.0,
            shield=-10.0,
        )
    elif i == 1:
        # Toppling backwards, sword arm flung up
        lie(r, {"root": 40, "spine": -10, "head": 10, "thigh.N": -25, "shin.N": 35, "thigh.F": -10, "shin.F": 30,
                "upperarm.N": -40, "forearm.N": 20, "sword": 20, "upperarm.F": -30, "forearm.F": 20}, 0, 0.10)
    elif i == 2:
        # Hitting the floor, the shield slipping off the arm
        lie(r, {"root": 78, "spine": -6, "head": 6, "thigh.N": -20, "shin.N": 25, "thigh.F": -5, "shin.F": 15,
                "upperarm.N": -40, "forearm.N": 30, "sword": 70, "upperarm.F": -60, "forearm.F": 20}, 60, 0.13)
    else:
        # 3: Flat on back, sword lying on the floor past the head
        lie(r, {"root": 90, "head": 0, "thigh.N": -12, "shin.N": 14, "shin.F": 6,
                "upperarm.N": -50, "forearm.N": 40, "sword": 74, "upperarm.F": -80, "forearm.F": 10}, 80, 0.13)


def swordsman_anchors(r: bpy.types.Object, i: int) -> dict:
    root = r.matrix_world @ r.pose.bones["root"].head
    hand = r.matrix_world @ r.pose.bones["sword"].head
    tip = r.matrix_world @ r.pose.bones["sword"].tail
    return {
        "feet": Vector((root.x, root.y, 0)),
        "hand": hand,
        "tip": tip,
    }


ANIMS = {
    "idle": (2, idle_pose),
    "step": (4, step_pose),
    "windup": (2, windup_pose),
    "strike": (2, strike_pose),
    "parry": (2, parry_pose),
    "hit": (2, hit_pose),
    "fall": (4, fall_pose),
}


def main() -> None:
    rig.clear()
    r = rig.build_armature(BONES, name="swordsman_hero_rig")
    build_hero(r)
    cam = rig.setup_render(res=RES, px_per_m=PX_PER_M)
    rig.render(r, cam, ANIMS, prefix="swordsman_hero", res=RES, anchor_fn=swordsman_anchors)

    rig.clear()
    r = rig.build_armature(BONES, name="swordsman_guard_rig")
    build_guard(r)
    cam = rig.setup_render(res=RES, px_per_m=PX_PER_M)
    rig.render(r, cam, ANIMS, prefix="swordsman_guard", res=RES, anchor_fn=swordsman_anchors)


if __name__ == "__main__":
    main()
