"""Shared rig, primitive-building, camera and render foundations for Blender assets.

All units face +X with the camera looking along +Y, so near limbs are at -Y.
Joints swing in the side-view plane (around Y) via swing().
"""

import json
import math
import os
import sys
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector

# The repository root, or the repo seen from Blender on Windows when exec'd.
try:
    ROOT = Path(__file__).resolve().parents[3]
except NameError:
    ROOT = Path(os.environ.get("CROWN_ROOT", r"\\wsl.localhost\Ubuntu-24.04\home\lapiana\git\doc"))
RAW = ROOT / "raw-assets"

# Default render pixels per metre; process.py shrinks by `scale` (e.g. 10) to about
# 9 px per metre, the size of the painted battle sprites.
PX_PER_M = 88
RES = (400, 320)

# sRGB, picked from the painted sprites so renders sit together with them.
COLOURS = {
    "mail": (120, 123, 124),
    "steel": (84, 96, 112),
    "skin": (170, 112, 82),
    "hose": (96, 50, 40),
    "boot": (50, 40, 34),
    "leather": (72, 46, 32),
    "wood": (118, 58, 44),
    "gold": (180, 140, 45),
    "dark_steel": (62, 70, 80),
    "hair": (80, 50, 30),
    # Pure green so process.py moves it into the lord's-colour layer; dark enough that
    # the light doesn't clip it, since its shading becomes the tint layer's.
    "tint": (0, 165, 0),
}


def linear(c: int) -> float:
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def clear() -> None:
    """Removes all objects and unused data-blocks from the scene."""
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.armatures,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.actions,
    ):
        for block in list(coll):
            if block.users == 0:
                coll.remove(block)


def material(name: str) -> bpy.types.Material:
    """Creates or returns a principled BSDF material for the given named colour."""
    mat = bpy.data.materials.get(f"mat_{name}") or bpy.data.materials.new(f"mat_{name}")
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*(linear(c) for c in COLOURS[name]), 1)
    is_metal = name in ("steel", "gold", "dark_steel")
    bsdf.inputs["Roughness"].default_value = 0.3 if is_metal else 0.9
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Specular IOR Level"].default_value = 0.8 if is_metal else 0.2
    return mat


def build_armature(bones: dict, name: str = "rig") -> bpy.types.Object:
    """Builds an armature object from a dict of {name: (head, tail, parent)}."""
    arm = bpy.data.armatures.new(f"{name}_data")
    rig = bpy.data.objects.new(name, arm)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for b_name, (head, tail, parent) in bones.items():
        b = arm.edit_bones.new(b_name)
        b.head, b.tail = head, tail
        if parent:
            b.parent = arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return rig


def attach(ob: bpy.types.Object, rig: bpy.types.Object, bone: str, mat: str) -> None:
    """Attaches a mesh object to a specific bone on the armature."""
    ob.data.materials.append(material(mat))
    bpy.context.view_layer.update()
    world = ob.matrix_world.copy()
    ob.parent = rig
    ob.parent_type = "BONE"
    ob.parent_bone = bone
    bpy.context.view_layer.update()
    ob.matrix_world = world


def limb(rig, bone: str, a, b, r: float, mat: str, verts: int = 8, scale=(1, 1)) -> None:
    """A cylinder from point a to point b, attached to a bone."""
    a, b = Vector(a), Vector(b)
    d = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d.length, location=(a + b) / 2)
    ob = bpy.context.object
    ob.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    ob.scale = (scale[0], scale[1], 1)
    attach(ob, rig, bone, mat)


def ball(rig, bone: str, at, r: float, mat: str, scale=(1, 1, 1)) -> None:
    """A UV sphere at a point, attached to a bone."""
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=r, location=at)
    ob = bpy.context.object
    ob.scale = scale
    attach(ob, rig, bone, mat)


def box(rig, bone: str, at, size, mat: str) -> None:
    """A cube of given size dimensions at a point, attached to a bone."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    ob = bpy.context.object
    ob.scale = size
    attach(ob, rig, bone, mat)


def cone(rig, bone: str, at, r: float, depth: float, mat: str, top: float = 0.0, scale=(1, 1)) -> None:
    """A cone or, with a `top` radius, a frustum, standing upright, attached to a bone."""
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=r, radius2=top, depth=depth, location=at)
    ob = bpy.context.object
    ob.scale = (scale[0], scale[1], 1)
    attach(ob, rig, bone, mat)


def swing(rig, bone: str, degrees: float) -> None:
    """Turns a bone forward (+) or back in the side-view plane, relative to its parent.
    Forward means its tip moves towards +X when the bone hangs down."""
    rest = rig.data.bones[bone].matrix_local.to_3x3()
    turn = Matrix.Rotation(math.radians(-degrees), 3, "Y")
    rig.pose.bones[bone].rotation_quaternion = (rest.inverted() @ turn @ rest).to_quaternion()


def ground(rig, foot_bones=("shin.N", "shin.F"), foot_offset: float = 0.09, root: str = "root") -> None:
    """Moves the body down or up so the lowest foot stands on z = 0: the walk's bob."""
    root_bone = rig.pose.bones[root]
    root_bone.location = (0, 0, 0)
    bpy.context.view_layer.update()
    lowest = min((rig.matrix_world @ rig.pose.bones[b].tail).z for b in foot_bones)
    rest = rig.data.bones[root].matrix_local.to_3x3()
    root_bone.location = rest.inverted() @ Vector((0, 0, -lowest + foot_offset))
    bpy.context.view_layer.update()


def setup_render(
    res: tuple[int, int] = RES,
    px_per_m: float = PX_PER_M,
    camera="ortho_side",
) -> bpy.types.Object:
    """Configures EEVEE render settings, background lighting and camera."""
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"

    cam = bpy.data.objects.new("render_cam", bpy.data.cameras.new("render_cam"))
    bpy.context.collection.objects.link(cam)
    scene.camera = cam

    if callable(camera):
        camera(cam, res, px_per_m)
    elif camera == "ortho_side":
        # Orthographic side view (battle, sword, siege): slightly above (+10 deg) so far limbs show
        cam.data.type = "ORTHO"
        cam.data.ortho_scale = res[0] / px_per_m
        tilt = math.radians(10)
        cam.rotation_euler = (math.pi / 2 - tilt, 0, 0)
        cam.location = Vector((0.3, 0, 1.25)) + Vector((0, -math.cos(tilt), math.sin(tilt))) * 10
    elif camera == "perspective_joust":
        # Perspective head-on view for jousting: at player's eye height looking down lists
        cam.data.type = "PERSP"
        cam.data.lens = 50
        cam.location = Vector((0, -5, 1.5))
        cam.rotation_euler = (math.radians(85), 0, 0)
    else:
        raise ValueError(f"Unknown camera preset: {camera}")

    sun = bpy.data.objects.new("render_sun", bpy.data.lights.new("render_sun", "SUN"))
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


def pixel(cam: bpy.types.Object, point: Vector, res: tuple[int, int] = RES) -> list[float]:
    """Where a world point lands in the rendered image, in pixels from the top left."""
    scene = bpy.context.scene
    v = world_to_camera_view(scene, cam, point)
    return [round(v.x * res[0], 1), round((1 - v.y) * res[1], 1)]


def render(
    rig: bpy.types.Object,
    cam: bpy.types.Object,
    anims: dict,
    prefix: str,
    res: tuple[int, int] = RES,
    anchor_fn=None,
    raw_dir: Path = RAW,
    fps: int = 8,
) -> None:
    """Keys each animation pose, renders frames and writes anchors.json with projected point coordinates."""
    scene = bpy.context.scene
    for n, (name, anim_data) in enumerate(anims.items()):
        if len(anim_data) == 3:
            count, pose_fn, anim_anchor_fn = anim_data
        else:
            count, pose_fn = anim_data
            anim_anchor_fn = anchor_fn

        out = raw_dir / f"{prefix}_{name}"
        out.mkdir(parents=True, exist_ok=True)
        anchors = {"size": list(res), "frames": []}
        for i in range(count):
            frame = 1 + 10 * n + i
            ret_points = pose_fn(rig, i)
            for pb in rig.pose.bones:
                pb.keyframe_insert("rotation_quaternion", frame=frame)
                pb.keyframe_insert("location", frame=frame)
            # Render the frame just keyed, or the animation overrides the pose.
            scene.frame_set(frame)

            world_points = {}
            if isinstance(ret_points, dict):
                world_points = ret_points
            elif anim_anchor_fn is not None:
                world_points = anim_anchor_fn(rig, i)

            frame_anchors = {}
            for k, pt in world_points.items():
                if isinstance(pt, (Vector, tuple, list)) and len(pt) == 3:
                    frame_anchors[k] = pixel(cam, Vector(pt), res)
                else:
                    frame_anchors[k] = pt
            anchors["frames"].append(frame_anchors)

            scene.render.filepath = str(out / f"{i}.png")
            bpy.ops.render.render(write_still=True)
        (out / "anchors.json").write_text(json.dumps(anchors, indent=1))
    scene.frame_start, scene.frame_end = 1, 10 * len(anims)
    scene.render.fps = fps
