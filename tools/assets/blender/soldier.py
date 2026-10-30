"""Builds the battle foot soldier in Blender, animates it and renders its frames.

Run it inside Blender (the MCP's execute_blender_code, or `blender -b -P soldier.py`).
It clears the scene, so use an empty file. Writes raw-assets/soldier_<anim>/<frame>.png
for each animation in ANIMS, one fixed-size image per frame with a transparent
background, and anchors.json with
each frame's points (feet, spear hand) in those images' pixels. process.py turns them
into sprites.

The figure faces +X and the camera looks along +Y, so the near limbs are at -Y.
Every joint swings in the side-view plane, so a pose is just an angle per bone.
"""

import json
import math
import os
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

# The script's own path, or the repo seen from Blender on Windows when exec'd.
try:
    ROOT = Path(__file__).resolve().parents[3]
except NameError:
    ROOT = Path(os.environ.get("CROWN_ROOT", r"\\wsl.localhost\Ubuntu-24.04\home\lapiana\git\doc"))
RAW = ROOT / "raw-assets"

# Render pixels per metre; process.py shrinks by `scale` (10) to about 9 px per metre,
# the size of the painted battle sprites.
PX_PER_M = 88
RES = (400, 320)

# sRGB, picked from the painted sprites so the two sit together on the battlefield.
COLOURS = {
    "mail": (120, 123, 124),
    "steel": (84, 96, 112),
    "skin": (170, 112, 82),
    "hose": (96, 50, 40),
    "boot": (50, 40, 34),
    "leather": (72, 46, 32),
    "wood": (118, 58, 44),
    # Pure green so process.py moves it into the lord's-colour layer; dark enough that
    # the light doesn't clip it, since its shading becomes the tint layer's.
    "tint": (0, 165, 0),
}


def linear(c: int) -> float:
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

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


def clear() -> None:
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.armatures, bpy.data.cameras, bpy.data.lights, bpy.data.actions):
        for block in list(coll):
            if block.users == 0:
                coll.remove(block)


def material(name: str) -> bpy.types.Material:
    mat = bpy.data.materials.get(f"soldier_{name}") or bpy.data.materials.new(f"soldier_{name}")
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*(linear(c) for c in COLOURS[name]), 1)
    bsdf.inputs["Roughness"].default_value = 0.3 if name == "steel" else 0.9
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Specular IOR Level"].default_value = 0.8 if name == "steel" else 0.2
    return mat


def build_armature() -> bpy.types.Object:
    arm = bpy.data.armatures.new("soldier_rig")
    rig = bpy.data.objects.new("soldier_rig", arm)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (head, tail, parent) in BONES.items():
        b = arm.edit_bones.new(name)
        b.head, b.tail = head, tail
        if parent:
            b.parent = arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return rig


def attach(ob: bpy.types.Object, rig: bpy.types.Object, bone: str, mat: str) -> None:
    ob.data.materials.append(material(mat))
    bpy.context.view_layer.update()
    world = ob.matrix_world.copy()
    ob.parent = rig
    ob.parent_type = "BONE"
    ob.parent_bone = bone
    bpy.context.view_layer.update()
    ob.matrix_world = world


def limb(rig, bone, a, b, r, mat, verts=8, scale=(1, 1)) -> None:
    """A cylinder from point a to point b."""
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d.length, location=(a + b) / 2)
    ob = bpy.context.object
    ob.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    ob.scale = (scale[0], scale[1], 1)
    attach(ob, rig, bone, mat)


def ball(rig, bone, at, r, mat, scale=(1, 1, 1)) -> None:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=r, location=at)
    ob = bpy.context.object
    ob.scale = scale
    attach(ob, rig, bone, mat)


def box(rig, bone, at, size, mat) -> None:
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    ob = bpy.context.object
    ob.scale = size
    attach(ob, rig, bone, mat)


def cone(rig, bone, at, r, depth, mat, top=0.0, scale=(1, 1)) -> None:
    """A cone or, with a `top` radius, a frustum, standing upright."""
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=r, radius2=top, depth=depth, location=at)
    ob = bpy.context.object
    ob.scale = (scale[0], scale[1], 1)
    attach(ob, rig, bone, mat)


def build_body(rig) -> None:
    # Torso: mail shirt under a long sleeveless tunic in the lord's colour, belted,
    # its skirt flaring to the knees like the painted soldiers'.
    limb(rig, "spine", (0, 0, 0.98), (0, 0, 1.46), 0.15, "mail", scale=(1.05, 1.2))
    limb(rig, "spine", (0, 0, 1.0), (0, 0, 1.42), 0.17, "tint", scale=(1.05, 1.2))
    cone(rig, "root", (0, 0, 0.75), 0.24, 0.5, "tint", top=0.18, scale=(1.05, 1.15))
    limb(rig, "root", (0, 0, 0.94), (0, 0, 1.0), 0.19, "leather", scale=(1.05, 1.2))
    # Head, big enough to read at sprite size: face, mail coif, conical helmet, nasal.
    ball(rig, "head", (0.03, 0, 1.6), 0.12, "skin")
    ball(rig, "head", (-0.03, 0, 1.6), 0.135, "mail", scale=(1, 1, 1.1))
    cone(rig, "head", (0, 0, 1.76), 0.15, 0.24, "steel")
    box(rig, "head", (0.15, 0, 1.64), (0.03, 0.035, 0.12), "steel")
    for side, y in (("N", -0.1), ("F", 0.1)):
        limb(rig, f"thigh.{side}", (0, y, 0.95), (0, y, 0.5), 0.095, "hose")
        limb(rig, f"shin.{side}", (0, y, 0.52), (0, y, 0.16), 0.08, "hose")
        limb(rig, f"shin.{side}", (0.01, y, 0.0), (0.01, y, 0.22), 0.085, "boot")
        box(rig, f"shin.{side}", (0.08, y, 0.035), (0.16, 0.11, 0.07), "boot")
    for side, y in (("N", -0.24), ("F", 0.24)):
        limb(rig, f"upperarm.{side}", (0, y, 1.44), (0, y, 1.13), 0.075, "mail")
        limb(rig, f"forearm.{side}", (0, y, 1.14), (0, y, 0.9), 0.065, "mail")
        ball(rig, f"forearm.{side}", (0, y, 0.86), 0.055, "skin")
    # The spear stands upright in the near hand: shaft below and above the grip.
    limb(rig, "spear", (0, -0.27, -0.1), (0, -0.27, 2.0), 0.035, "wood", verts=6)
    cone(rig, "spear", (0, -0.27, 2.1), 0.06, 0.22, "steel")


def swing(rig, bone: str, degrees: float) -> None:
    """Turns a bone forward (+) or back in the side-view plane, relative to its parent.
    Forward means its tip moves towards +X when the bone hangs down."""
    rest = rig.data.bones[bone].matrix_local.to_3x3()
    turn = Matrix.Rotation(math.radians(-degrees), 3, "Y")
    rig.pose.bones[bone].rotation_quaternion = (rest.inverted() @ turn @ rest).to_quaternion()


def pose(rig, lean, legs, near_arm, spear, far_arm, head=-2.0) -> None:
    """Sets a whole pose from absolute angles in `swing`'s sense: the spine, head and spear
    from upright (negative tips them forward), the limbs from hanging down. `legs` is
    {side: (thigh, knee bend)}; each arm is (upper arm, forearm)."""
    swing(rig, "spine", -lean)
    swing(rig, "head", head + lean)
    for side, (thigh, knee) in legs.items():
        swing(rig, f"thigh.{side}", thigh)
        swing(rig, f"shin.{side}", -knee)
    for side, (upper, fore) in (("N", near_arm), ("F", far_arm)):
        swing(rig, f"upperarm.{side}", upper + lean)
        swing(rig, f"forearm.{side}", fore - upper)
    swing(rig, "spear", spear - near_arm[1])
    ground(rig)


def stand_pose(rig, i: int) -> None:
    pose(rig, 2, {"N": (3, 4), "F": (-3, 4)}, (10, 65), 2, (0, 15))


def walk_pose(rig, i: int) -> None:
    p = 2 * math.pi * i / 8
    # Each knee bends most as its leg swings through, and stays a little bent on the ground.
    legs = {
        "N": (26 * math.sin(p), 8 + 45 * max(0.0, math.cos(p))),
        "F": (-26 * math.sin(p), 8 + 45 * max(0.0, -math.cos(p))),
    }
    # The near hand carries the spear upright in front; the far arm swings against the far leg.
    upper = 10 + 3 * math.sin(p)
    far = 22 * math.sin(p)
    pose(rig, 6, legs, (upper, upper + 55), 3, (far, far + 25))


def thrust_pose(rig, i: int) -> None:
    """Spear levelled, drawn back, then driven forward in a lunge."""
    lean, legs, near, spear, far = [
        (10, {"N": (18, 20), "F": (-18, 8)}, (-10, 55), -88, (25, 80)),
        (4, {"N": (14, 18), "F": (-22, 6)}, (-40, 40), -90, (5, 60)),
        (20, {"N": (40, 35), "F": (-35, 0)}, (55, 85), -92, (45, 85)),
    ][i]
    pose(rig, lean, legs, near, spear, far)


# Each animation: its frame count and pose. Rendered to raw-assets/soldier_<name>/.
ANIMS = {"stand": (1, stand_pose), "walk": (8, walk_pose), "thrust": (3, thrust_pose)}


def ground(rig) -> None:
    """Moves the body down or up so the lower foot stands on z = 0: the walk's bob."""
    root = rig.pose.bones["root"]
    root.location = (0, 0, 0)
    bpy.context.view_layer.update()
    lowest = min((rig.matrix_world @ rig.pose.bones[f"shin.{s}"].tail).z for s in "NF")
    rest = rig.data.bones["root"].matrix_local.to_3x3()
    root.location = rest.inverted() @ Vector((0, 0, -lowest + 0.09))
    bpy.context.view_layer.update()


def setup_render() -> bpy.types.Object:
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = RES
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"

    cam = bpy.data.objects.new("soldier_cam", bpy.data.cameras.new("soldier_cam"))
    bpy.context.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = RES[0] / PX_PER_M
    # A little above the side view, so the far limbs show behind the near ones.
    tilt = math.radians(10)
    cam.rotation_euler = (math.pi / 2 - tilt, 0, 0)
    cam.location = Vector((0.3, 0, 1.25)) + Vector((0, -math.cos(tilt), math.sin(tilt))) * 10
    scene.camera = cam

    sun = bpy.data.objects.new("soldier_sun", bpy.data.lights.new("soldier_sun", "SUN"))
    bpy.context.collection.objects.link(sun)
    sun.data.energy = 2.2
    sun.rotation_euler = (math.radians(50), math.radians(-25), math.radians(-20))
    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs["Color"].default_value = (0.5, 0.5, 0.55, 1)
    bg.inputs["Strength"].default_value = 1
    return cam


def pixel(cam, point: Vector) -> list[float]:
    """Where a world point lands in the rendered image, in pixels from the top left."""
    scene = bpy.context.scene
    v = world_to_camera_view(scene, cam, point)
    return [round(v.x * RES[0], 1), round((1 - v.y) * RES[1], 1)]


def render(rig, cam) -> None:
    scene = bpy.context.scene
    for n, (name, (count, pose_fn)) in enumerate(ANIMS.items()):
        out = RAW / f"soldier_{name}"
        out.mkdir(parents=True, exist_ok=True)
        anchors = {"size": list(RES), "frames": []}
        for i in range(count):
            frame = 1 + 10 * n + i
            pose_fn(rig, i)
            for pb in rig.pose.bones:
                pb.keyframe_insert("rotation_quaternion", frame=frame)
                pb.keyframe_insert("location", frame=frame)
            # Render the frame just keyed, or the animation overrides the pose.
            scene.frame_set(frame)
            bones = {b: rig.matrix_world @ rig.pose.bones[b].tail for b in ("shin.N", "shin.F", "forearm.N")}
            root = rig.matrix_world @ rig.pose.bones["root"].head
            anchors["frames"].append({
                # The point on the ground under the hips, where the figure stands.
                "feet": pixel(cam, Vector((root.x, root.y, 0))),
                "foot_near": pixel(cam, bones["shin.N"]),
                "foot_far": pixel(cam, bones["shin.F"]),
                "hand": pixel(cam, bones["forearm.N"]),
            })
            scene.render.filepath = str(out / f"{i}.png")
            bpy.ops.render.render(write_still=True)
        (out / "anchors.json").write_text(json.dumps(anchors, indent=1))
    scene.frame_start, scene.frame_end = 1, 10 * len(ANIMS)
    scene.render.fps = 8


def main() -> None:
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    clear()
    rig = build_armature()
    build_body(rig)
    cam = setup_render()
    return rig, cam


if __name__ == "__main__":
    rig, cam = main()
    render(rig, cam)
