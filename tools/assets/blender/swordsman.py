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

# Colours the swordsmen add to rig.COLOURS (sRGB).
rig.COLOURS.update({
    "eye": (222, 214, 196),
    "pupil": (30, 22, 20),
    "linen": (168, 150, 112),
})

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


# --- Mesh helpers ---
# Everything is smooth-shaded and higher-poly than rig's primitives, so the renders
# shade like painted forms rather than facets.

# The torso and hips are turned this far toward the camera (matching the shoulder
# and hip joints in BONES), the head a little further.
BODY_YAW = math.radians(-24)
HEAD_YAW = math.radians(-30)
HEAD = Vector((0.0, 0.0, 1.62))


def mesh_object(r, bone, bm, mat, at=(0, 0, 0), rot=(0, 0, 0), outline=True, thickness=-0.007):
    """Turns a bmesh into a smooth-shaded object attached to a bone."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(f"mesh_{bone}")
    bm.to_mesh(mesh)
    bm.free()
    ob = bpy.data.objects.new(f"ob_{bone}", mesh)
    bpy.context.collection.objects.link(ob)
    ob.location = at
    ob.rotation_euler = rot
    for p in ob.data.polygons:
        p.use_smooth = True
    rig.attach(ob, r, bone, mat)
    if outline:
        add_outline(ob, thickness)
    return ob


def lathe(r, bone, a, b, profile, mat, segs=20, scale=(1.0, 1.0), yaw=0.0, outline=True):
    """A surface of revolution from a to b; profile is [(t along a→b, radius)].
    scale squashes the rings into ellipses, turned by yaw about the axis."""
    a, b = Vector(a), Vector(b)
    d = b - a
    bm = bmesh.new()
    rings = []
    for t, rad in profile:
        z = (t - 0.5) * d.length
        ring = []
        for i in range(segs):
            ang = 2 * math.pi * i / segs
            x, y = rad * math.cos(ang) * scale[0], rad * math.sin(ang) * scale[1]
            ring.append(bm.verts.new((x * math.cos(yaw) - y * math.sin(yaw), x * math.sin(yaw) + y * math.cos(yaw), z)))
        rings.append(ring)
    for k in range(len(rings) - 1):
        for i in range(segs):
            j = (i + 1) % segs
            bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    return mesh_object(r, bone, bm, mat, (a + b) / 2, d.to_track_quat("Z", "Y").to_euler(), outline)


def blob(r, bone, at, radii, mat, rot=(0, 0, 0), outline=False, segs=24, rings=12):
    """A smooth ellipsoid."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2]))
    return mesh_object(r, bone, bm, mat, Vector(at), rot, outline)


def profile_radius(profile: list, t: float) -> float:
    """A lathe profile's radius at t, interpolated."""
    for (t0, r0), (t1, r1) in zip(profile, profile[1:]):
        if t0 <= t <= t1:
            return r0 + (r1 - r0) * (t - t0) / (t1 - t0)
    return profile[-1][1]


def dome(rad: float, n: int = 8) -> list:
    """A quarter-ellipse lathe profile: a bowl from its rim (t=0) to its crown."""
    return [(i / n, max(rad * math.sqrt(1 - (i / n) ** 2), 0.004)) for i in range(n + 1)]


def head_point(fwd: float, side: float, up: float) -> Vector:
    """A point in the head's frame: forward along the gaze, side towards its left (away
    from the camera), up."""
    f = Vector((math.cos(HEAD_YAW), math.sin(HEAD_YAW), 0))
    s = Vector((-math.sin(HEAD_YAW), math.cos(HEAD_YAW), 0))
    return HEAD + f * fwd + s * side + Vector((0, 0, up))


def body_point(fwd: float, side: float, z: float) -> Vector:
    """A point on the turned torso: forward of the spine, side towards its left, at height z."""
    f = Vector((math.cos(BODY_YAW), math.sin(BODY_YAW), 0))
    s = Vector((-math.sin(BODY_YAW), math.cos(BODY_YAW), 0))
    return f * fwd + s * side + Vector((0, 0, z))


def basis_euler(x: Vector, z: Vector) -> Euler:
    """The rotation whose local X and Z axes point along x and z."""
    x, z = x.normalized(), z.normalized()
    y = z.cross(x)
    return Matrix((x, y, z)).transposed().to_euler()


# --- Head ---

def build_head(r: bpy.types.Object, is_norman: bool = False) -> None:
    hy = (0, 0, HEAD_YAW)
    # Mail coif: a collar over the shoulders rising into a hood around the face
    lathe(r, "head", (0, 0, 1.33), (0, 0, 1.56), [(0, 0.20), (0.3, 0.15), (0.65, 0.105), (1, 0.095)], "mail", segs=24)
    blob(r, "head", head_point(-0.02, 0, 0.0), (0.125, 0.118, 0.14), "mail", rot=hy, outline=True)

    # The face pokes out of the hood's front, so the coif frames it in an oval
    blob(r, "head", head_point(0.03, 0, -0.015), (0.10, 0.088, 0.112), "skin", rot=hy, outline=True)
    blob(r, "head", head_point(0.128, 0, -0.002), (0.03, 0.018, 0.036), "skin", rot=hy)  # nose
    for side in (-0.038, 0.038):
        blob(r, "head", head_point(0.110, side, 0.028), (0.011, 0.018, 0.012), "eye", rot=hy, segs=12, rings=8)
        blob(r, "head", head_point(0.119, side, 0.027), (0.006, 0.009, 0.010), "pupil", rot=hy, segs=12, rings=8)
        blob(r, "head", head_point(0.116, side, 0.050), (0.012, 0.027, 0.008), "hair", rot=hy, segs=12, rings=8)

    if not is_norman:
        # Saxon: full beard and drooping moustache
        blob(r, "head", head_point(0.07, 0, -0.08), (0.065, 0.075, 0.065), "hair", rot=hy, outline=True)
        blob(r, "head", head_point(0.10, 0, -0.115), (0.04, 0.045, 0.045), "hair", rot=hy)
        for side in (-0.026, 0.026):
            blob(r, "head", head_point(0.122, side, -0.038), (0.014, 0.032, 0.012), "hair",
                 rot=(0, math.radians(20 if side < 0 else -20), HEAD_YAW), segs=12, rings=8)
    else:
        # Norman: clean-shaven, a firm jaw and a mouth line
        blob(r, "head", head_point(0.07, 0, -0.075), (0.06, 0.07, 0.06), "skin", rot=hy, outline=True)
        blob(r, "head", head_point(0.128, 0, -0.052), (0.004, 0.022, 0.004), "pupil", rot=hy, segs=12, rings=8)

    # Helmet
    rim = HEAD + Vector((0, 0, 0.055))
    band = "gold" if not is_norman else "dark_steel"
    if not is_norman:
        # Spangenhelm: a steel bowl with gilt brow band, crest and cross bands
        lathe(r, "head", rim, rim + Vector((0, 0, 0.14)), dome(0.132), "steel", segs=28, scale=(1.0, 0.94), yaw=HEAD_YAW)
        lathe(r, "head", rim, rim + Vector((0, 0, 0.146)), dome(0.138), "gold", segs=28, scale=(1.0, 0.13), yaw=HEAD_YAW, outline=False)
        lathe(r, "head", rim, rim + Vector((0, 0, 0.146)), dome(0.138), "gold", segs=28, scale=(0.13, 0.98), yaw=HEAD_YAW, outline=False)
        blob(r, "head", rim + Vector((0, 0, 0.148)), (0.022, 0.022, 0.018), "gold")
    else:
        # Conical nasal helmet
        lathe(r, "head", rim, rim + Vector((0, 0, 0.22)),
              [(0, 0.136), (0.15, 0.132), (0.4, 0.105), (0.7, 0.058), (0.92, 0.016), (1, 0.004)],
              "steel", segs=28, scale=(1.0, 0.95), yaw=HEAD_YAW)
    lathe(r, "head", rim - Vector((0, 0, 0.004)), rim + Vector((0, 0, 0.026)), [(0, 0.139), (1, 0.139)], band,
          segs=28, scale=(1.0, 0.95), yaw=HEAD_YAW)
    # Nasal bar down over the nose, and rivets along the brow band
    blob(r, "head", head_point(0.138, 0, 0.012), (0.011, 0.019 if not is_norman else 0.024, 0.055), band, rot=hy, outline=True)
    for ang in (-70, -35, 35, 70):
        a = HEAD_YAW + math.radians(ang)
        blob(r, "head", rim + Vector((math.cos(a) * 0.141, math.sin(a) * 0.141 * 0.95, 0.011)), (0.009, 0.009, 0.009),
             "gold" if not is_norman else "steel", segs=10, rings=6)


# --- Body ---

def pleated(r, bone, top_z, bot_z, top_r, bot_r, mat, depth=0.02, folds=10, segs=40, scale=(1.15, 1.25), outline=True):
    """A flared, pleated skirt around the turned hips, open at both ends."""
    bm = bmesh.new()
    rows = []
    for z, rad, amp in ((top_z, top_r, depth * 0.4), (bot_z, bot_r, depth)):
        row = []
        for i in range(segs):
            ang = 2 * math.pi * i / segs
            rr = rad + amp * math.cos(ang * folds)
            x, y = rr * math.cos(ang) * scale[0], rr * math.sin(ang) * scale[1]
            row.append(bm.verts.new((x * math.cos(BODY_YAW) - y * math.sin(BODY_YAW),
                                     x * math.sin(BODY_YAW) + y * math.cos(BODY_YAW), z)))
        rows.append(row)
    for i in range(segs):
        j = (i + 1) % segs
        bm.faces.new((rows[0][i], rows[0][j], rows[1][j], rows[1][i]))
    ob = mesh_object(r, bone, bm, mat, outline=outline)
    # A "fallen" shape key draws the hem in around the legs, so a body lying on its
    # back doesn't fan the skirt up like a lampshade (see drape).
    ob.shape_key_add(name="Basis")
    key = ob.shape_key_add(name="fallen")
    for v in key.data:
        # Measured from the waist, so the skirt layers and the hem band draw in together
        k = 1 - 0.45 * (0.96 - v.co.z) / 0.30
        v.co.x, v.co.y = v.co.x * k, v.co.y * k
    return ob


def drape(r: bpy.types.Object, fallen: float) -> None:
    """Sets how far the skirts hug the legs, from standing (0) to lying down (1)."""
    for ob in r.children_recursive:
        keys = ob.data.shape_keys if ob.type == "MESH" else None
        if keys and "fallen" in keys.key_blocks:
            keys.key_blocks["fallen"].value = fallen


def build_torso(r: bpy.types.Object, is_norman: bool = False) -> None:
    by = BODY_YAW
    # Mail hauberk: waist, broad chest, sloping shoulders
    lathe(r, "spine", (0, 0, 0.90), (0, 0, 1.42),
          [(0, 0.165), (0.25, 0.16), (0.55, 0.18), (0.8, 0.19), (0.92, 0.16), (1, 0.10)],
          "mail", segs=28, scale=(0.78, 1.25), yaw=by)
    # Sleeveless tunic over it, with gilt trim at the neck
    lathe(r, "spine", (0, 0, 0.94), (0, 0, 1.37),
          [(0, 0.188), (0.4, 0.192), (0.75, 0.205), (0.9, 0.198), (1, 0.172)],
          "tint", segs=28, scale=(0.82, 1.28), yaw=by)
    lathe(r, "spine", (0, 0, 1.355), (0, 0, 1.385), [(0, 0.15), (1, 0.13)], "gold", segs=28, scale=(0.82, 1.28), yaw=by, outline=False)

    # Belt with buckle and a hanging strap end
    lathe(r, "root", (0, 0, 0.93), (0, 0, 1.0), [(0, 0.197), (1, 0.197)], "leather", segs=28, scale=(0.84, 1.28), yaw=by)
    buckle = body_point(0.168, -0.02, 0.965)
    blob(r, "root", buckle, (0.012, 0.035, 0.04), "gold", rot=(0, 0, by), outline=True, segs=12, rings=8)
    lathe(r, "root", body_point(0.17, 0.02, 0.95), body_point(0.175, 0.03, 0.80), [(0, 0.016), (1, 0.016)], "leather",
          segs=8, scale=(0.4, 1.0), yaw=0)
    blob(r, "root", body_point(0.176, 0.03, 0.795), (0.008, 0.018, 0.016), "gold", rot=(0, 0, by), segs=10, rings=6)

    # Mail skirt of the hauberk, then the tunic skirt over it with a gilt hem
    hem = 0.66 if not is_norman else 0.62
    pleated(r, "root", 0.95, hem - 0.10, 0.155, 0.28, "mail", depth=0.012, folds=7)
    pleated(r, "root", 0.96, hem, 0.17, 0.30, "tint", depth=0.022, folds=8)
    pleated(r, "root", hem + 0.035, hem - 0.002, 0.292, 0.302, "gold", depth=0.022, folds=8, outline=False)

    # Scabbard on the far (left) hip, hanging back behind the far leg so it doesn't
    # read as a third leg between the feet
    lathe(r, "root", (-0.08, 0.24, 0.96), (-0.40, 0.24, 0.42), [(0, 0.04), (0.9, 0.034), (1, 0.03)], "leather",
          segs=12, scale=(1.0, 0.35))
    blob(r, "root", (-0.08, 0.24, 0.95), (0.03, 0.03, 0.025), "gold", segs=12, rings=8)
    blob(r, "root", (-0.41, 0.24, 0.40), (0.035, 0.02, 0.035), "gold", segs=12, rings=8)


def build_limbs(r: bpy.types.Object, is_norman: bool = False) -> None:
    legs = "mail" if is_norman else "hose"
    for side, (hip, knee, ankle) in {
        "N": ((0.06, -0.12, 0.90), (0.18, -0.14, 0.48), (0.24, -0.14, 0.08)),
        "F": ((-0.06, 0.12, 0.90), (-0.22, 0.12, 0.50), (-0.28, 0.12, 0.08)),
    }.items():
        hip, knee, ankle = Vector(hip), Vector(knee), Vector(ankle)
        lathe(r, f"thigh.{side}", hip.lerp(knee, 0.2), knee, [(0, 0.09), (0.25, 0.1), (0.7, 0.088), (1, 0.075)], legs, segs=18)
        blob(r, f"shin.{side}", knee, (0.075, 0.072, 0.075), legs, outline=True, segs=16, rings=10)
        # Leg wraps crossing the shin (Saxon) or straps holding the chausses (Norman),
        # each band a little proud of the shin's surface
        shin = [(0, 0.074), (0.3, 0.084), (0.75, 0.06), (1, 0.052)]
        lathe(r, f"shin.{side}", knee, ankle, shin, "mail" if is_norman else "linen", segs=18)
        d = ankle - knee
        for k, t in enumerate((0.22, 0.4, 0.58, 0.76, 0.92) if not is_norman else (0.3, 0.75)):
            c = knee + d * t
            tilt = Vector((0.012 if k % 2 else -0.012, 0, 0)) if not is_norman else Vector()
            rad = profile_radius(shin, t) + 0.006
            lathe(r, f"shin.{side}", c - d.normalized() * 0.01 + tilt, c + d.normalized() * 0.01 - tilt,
                  [(0, rad), (1, rad)], "leather", segs=18, outline=False)
        # Turnshoe: a pointed leather shoe with an ankle cuff
        blob(r, f"shin.{side}", ankle + Vector((0.07, 0, -0.04)), (0.125, 0.055, 0.048), "boot", outline=True)
        lathe(r, f"shin.{side}", ankle + Vector((0, 0, -0.03)), ankle + Vector((0, 0, 0.03)), [(0, 0.06), (1, 0.056)], "boot", segs=16)

    for side, (shoulder, elbow, wrist) in {
        "N": ((-0.06, -0.22, 1.36), (-0.14, -0.20, 1.10), (0.16, -0.18, 1.14)),
        "F": ((0.12, 0.18, 1.36), (0.26, 0.14, 1.16), (0.36, 0.06, 1.18)),
    }.items():
        shoulder, elbow, wrist = Vector(shoulder), Vector(elbow), Vector(wrist)
        # Rounded mail shoulder, sleeve to the elbow, then a padded forearm and leather cuff
        blob(r, f"upperarm.{side}", shoulder + Vector((0, 0, -0.01)), (0.088, 0.082, 0.08), "mail", outline=True)
        lathe(r, f"upperarm.{side}", shoulder, elbow, [(0, 0.085), (0.4, 0.09), (0.85, 0.074), (1, 0.07)], "mail", segs=18)
        blob(r, f"forearm.{side}", elbow, (0.07, 0.068, 0.07), "mail", outline=True, segs=16, rings=10)
        mid = elbow.lerp(wrist, 0.55)
        lathe(r, f"forearm.{side}", elbow, mid, [(0, 0.07), (1, 0.064)], "mail" if is_norman else "hose", segs=18)
        lathe(r, f"forearm.{side}", mid, wrist, [(0, 0.066), (0.8, 0.06), (1, 0.064)], "leather", segs=18)
    # Shield hand, mostly behind the shield
    blob(r, "forearm.F", (0.37, 0.05, 1.18), (0.05, 0.045, 0.05), "leather", outline=True)


# --- Sword ---

def build_sword_mesh(r: bpy.types.Object, is_norman: bool = False) -> None:
    head = Vector((0.16, -0.18, 1.14))
    tip = Vector((0.68, -0.18, 1.76))
    u = (tip - head).normalized()
    v = u.cross(Vector((0, 1, 0))).normalized()  # across the blade, in the view plane
    w = Vector((0, -1, 0))  # towards the camera
    hilt = "gold" if not is_norman else "dark_steel"

    guard = head + u * 0.03
    blade_start = guard + u * 0.012

    # Blade: diamond section, tapering, with a dark fuller down the face
    bm = bmesh.new()
    rings = []
    for t, hw, ht in ((0.0, 0.027, 0.0075), (0.8, 0.02, 0.006), (0.94, 0.012, 0.004)):
        c = blade_start.lerp(tip, t)
        rings.append([bm.verts.new(p) for p in (c + v * hw, c + w * ht, c - v * hw, c - w * ht)])
    point = bm.verts.new(tip)
    for k in range(len(rings) - 1):
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
    for i in range(4):
        bm.faces.new((rings[-1][i], rings[-1][(i + 1) % 4], point))
    bm.faces.new(list(reversed(rings[0])))
    mesh_object(r, "sword", bm, "steel", thickness=-0.004)

    bm = bmesh.new()
    a, b = blade_start + u * 0.02, blade_start.lerp(tip, 0.72)
    f = [bm.verts.new(p + w * 0.0085) for p in (a - v * 0.006, a + v * 0.006, b + v * 0.004, b - v * 0.004)]
    bm.faces.new(f)
    mesh_object(r, "sword", bm, "dark_steel", outline=False)

    # Crossguard tapering to knobbed ends
    lathe(r, "sword", guard - v * 0.125, guard + v * 0.125,
          [(0, 0.011), (0.12, 0.014), (0.5, 0.019), (0.88, 0.014), (1, 0.011)], hilt, segs=12)
    for e in (-1, 1):
        blob(r, "sword", guard + v * 0.128 * e, (0.017, 0.017, 0.017), hilt, segs=12, rings=8)

    # Grip, wrapped, and a lobed pommel
    pommel = head - u * 0.105
    lathe(r, "sword", pommel + u * 0.02, guard - u * 0.01, [(0, 0.017), (0.5, 0.02), (1, 0.017)], "leather", segs=12)
    blob(r, "sword", pommel, (0.044, 0.024, 0.03), hilt, rot=basis_euler(v, u), outline=True, segs=16, rings=10)

    # Gloved fist around the grip, with the thumb over the fingers; it follows the
    # sword bone so the hand stays on the hilt as the wrist turns
    blob(r, "sword", head - u * 0.035 + w * 0.006, (0.05, 0.048, 0.058), "leather", rot=basis_euler(v, u), outline=True)
    blob(r, "sword", head - u * 0.005 + w * 0.04 + v * 0.012, (0.016, 0.016, 0.03), "leather", rot=basis_euler(v, u))


# --- Shields ---

def build_shield(r: bpy.types.Object, is_norman: bool = False) -> None:
    # Held out in front, its face turned mostly to the camera
    n = Vector((0.25, -0.97, 0)).normalized()
    x = Vector((0, 0, 1)).cross(n).normalized() * -1  # across the face, towards +X
    up = Vector((0, 0, 1))
    if not is_norman:
        c = Vector((0.33, -0.03, 1.18))
        # Painted board, rawhide-bound rim, iron boss on a riveted flange
        lathe(r, "shield", c - n * 0.012, c + n * 0.012, [(0, 0.27), (1, 0.27)], "tint", segs=40)
        bpy.ops.mesh.primitive_torus_add(major_radius=0.272, minor_radius=0.016, major_segments=48, minor_segments=8,
                                         location=c, rotation=n.to_track_quat("Z", "Y").to_euler())
        rim = bpy.context.object
        for p in rim.data.polygons:
            p.use_smooth = True
        rig.attach(rim, r, "shield", "leather")
        add_outline(rim)
        lathe(r, "shield", c + n * 0.012, c + n * 0.016, [(0, 0.1), (1, 0.1)], "steel", segs=24, outline=False)
        lathe(r, "shield", c + n * 0.014, c + n * 0.09, dome(0.075), "steel", segs=24)
        for k in range(6):
            a = 2 * math.pi * k / 6 + 0.3
            blob(r, "shield", c + n * 0.017 + (x * math.cos(a) + up * math.sin(a)) * 0.088, (0.009, 0.009, 0.009),
                 "gold", segs=10, rings=6)
        # Ring of studs near the rim
        for k in range(12):
            a = 2 * math.pi * k / 12
            blob(r, "shield", c + n * 0.013 + (x * math.cos(a) + up * math.sin(a)) * 0.235, (0.008, 0.008, 0.008),
                 "gold", segs=10, rings=6)
    else:
        c = Vector((0.33, -0.04, 1.12))
        kite(r, c, n, x, up, 1.0, 0.012, "tint")
        kite(r, c - n * 0.006, n, x, up, 1.08, 0.008, "steel")
        # Boss and studs along the edge
        lathe(r, "shield", c + n * 0.006, c + n * 0.07, dome(0.06), "steel", segs=24)
        for y in (0.30, 0.15, 0.0, -0.15, -0.30):
            for e in (-1, 1):
                hw = kite_half_width(y) * 0.86
                blob(r, "shield", kite_point(c, n, x, up, e * hw, y, 0.014), (0.009, 0.009, 0.009), "gold", segs=10, rings=6)


def kite_half_width(y: float) -> float:
    """The kite shield's half width at height y: a rounded top over a long point."""
    if y >= 0.30:
        return 0.225 * math.sqrt(max(1 - ((y - 0.30) / 0.07) ** 2, 0.0))
    return 0.225 * ((y + 0.52) / 0.82) ** 0.75


def kite_point(c, n, x, up, sx, y, depth):
    """A point on the kite's face, which curves back around its vertical axis."""
    return c + x * sx + up * y + n * (depth - 0.9 * sx * sx)


def kite(r, c, n, x, up, size, thick, mat):
    bm = bmesh.new()
    rows, cols = 26, 10
    ys = [0.37 - (0.37 + 0.52) * i / (rows - 1) for i in range(rows)]
    grid = {}
    for face, depth in (("front", thick), ("back", -thick)):
        grid[face] = []
        for y in ys:
            hw = max(kite_half_width(y), 0.004) * size
            grid[face].append([bm.verts.new(kite_point(c, n, x, up, -hw + 2 * hw * j / (cols - 1), y * size, depth))
                               for j in range(cols)])
    for face in ("front", "back"):
        g = grid[face]
        for i in range(rows - 1):
            for j in range(cols - 1):
                bm.faces.new((g[i][j], g[i][j + 1], g[i + 1][j + 1], g[i + 1][j]))
    f, b = grid["front"], grid["back"]
    border = [(f[0][j], b[0][j]) for j in range(cols)] + [(f[i][-1], b[i][-1]) for i in range(1, rows)] + \
        [(f[-1][j], b[-1][j]) for j in range(cols - 2, -1, -1)] + [(f[i][0], b[i][0]) for i in range(rows - 2, 0, -1)]
    for k in range(len(border)):
        (f0, b0), (f1, b1) = border[k], border[(k + 1) % len(border)]
        bm.faces.new((f0, f1, b1, b0))
    mesh_object(r, "shield", bm, mat)


def build_hero(r: bpy.types.Object) -> None:
    setup_materials_and_lighting()
    build_head(r, is_norman=False)
    build_torso(r, is_norman=False)
    build_limbs(r, is_norman=False)
    build_sword_mesh(r, is_norman=False)
    build_shield(r, is_norman=False)
    add_dramatic_lighting()


def build_guard(r: bpy.types.Object) -> None:
    setup_materials_and_lighting()
    build_head(r, is_norman=True)
    build_torso(r, is_norman=True)
    build_limbs(r, is_norman=True)
    build_sword_mesh(r, is_norman=True)
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
    drape(r, 0.0)
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


def lie(r: bpy.types.Object, swings: dict, shield_flat: float, target_z: float, fallen: float = 1.0) -> None:
    """Poses a falling body by relative swings, optionally laying the shield face down."""
    r.pose.bones["root"].location = (0, 0, 0)
    for bone in ("root", "spine", "head", "thigh.N", "shin.N", "thigh.F", "shin.F",
                 "upperarm.N", "forearm.N", "sword", "upperarm.F", "forearm.F", "shield"):
        rig.swing(r, bone, swings.get(bone, 0.0))
    if shield_flat:
        # Tip the shield about its own X axis so it lies on the floor instead of through it.
        pb = r.pose.bones["shield"]
        pb.rotation_quaternion = pb.rotation_quaternion @ Matrix.Rotation(math.radians(shield_flat), 3, "X").to_quaternion()
    drape(r, fallen)
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
                "upperarm.N": -40, "forearm.N": 20, "sword": 20, "upperarm.F": -30, "forearm.F": 20}, 0, 0.10, fallen=0.4)
    elif i == 2:
        # Hitting the floor, the shield slipping off the arm
        lie(r, {"root": 78, "spine": -6, "head": 6, "thigh.N": -20, "shin.N": 25, "thigh.F": -5, "shin.F": 15,
                "upperarm.N": -40, "forearm.N": 30, "sword": 70, "upperarm.F": -60, "forearm.F": 20}, 60, 0.13, fallen=0.85)
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
