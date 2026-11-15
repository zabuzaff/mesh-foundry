"""Blender-backed seated deformation proof for the Curls elbow rig."""

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Quaternion, Vector

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path)
parser.add_argument("sha256")
parser.add_argument("output", type=Path)
parser.add_argument("--trouser-correction", action="store_true")
parser.add_argument("--knee-relief", type=float, default=0)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
if not 0 <= args.knee_relief <= 1 or (args.knee_relief and not args.trouser_correction):
    parser.error("Knee relief requires trouser correction and a value in [0, 1]")
if hashlib.sha256(args.source.read_bytes()).hexdigest() != args.sha256:
    parser.error("Source hash mismatch")
bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()), use_scripts=False)
scene = bpy.context.scene
scene.frame_set(1)
rig = scene.objects["Elbow proof"]
pants = scene.objects["Continuous trousers and hips"]
shoes = [obj for obj in scene.objects if obj.name.split(".")[0] in {"Shoe upper", "Shoe sole"}]
if len(shoes) != 4:
    raise RuntimeError("Expected four shoe meshes")
args.output.mkdir()

bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
bones = rig.data.edit_bones
pelvis = bones.new("Pelvis")
pelvis.head, pelvis.tail = (0, 0, .56), (0, 0, .76)
for side, x in (("L", .164), ("R", -.164)):
    parent = pelvis
    for label, head, tail in (
        ("Thigh", (x, .008, .56), (x, .008, .34)),
        ("Shin", (x, .008, .34), (x, .008, .15)),
        ("Foot", (x, .008, .15), (x, -.19, .15)),
    ):
        bone = bones.new(f"{label}.{side}")
        bone.head, bone.tail, bone.parent = head, tail, parent
        parent = bone
bpy.ops.object.mode_set(mode="OBJECT")

def bind(obj, names):
    modifier = obj.modifiers.new("Seat proof", "ARMATURE")
    modifier.object = rig
    modifier.use_deform_preserve_volume = True
    return {name: obj.vertex_groups.new(name=name) for name in names}

def smooth(value):
    t = max(0, min(1, value))
    return t*t*(3-2*t)

groups = bind(pants, ["Pelvis", "Thigh.L", "Shin.L", "Thigh.R", "Shin.R"])
for vertex in pants.data.vertices:
    x, _, z = pants.matrix_world @ vertex.co
    left = smooth(.5 + x/.16)
    leg = smooth((.67-z)/.23)
    shin = smooth((.42-z)/.16)
    weights = (1-leg, leg*(1-shin)*left, leg*shin*left,
               leg*(1-shin)*(1-left), leg*shin*(1-left))
    for group, weight in zip(groups.values(), weights):
        if weight > 0:
            group.add([vertex.index], weight, "REPLACE")
for shoe in shoes:
    side = "L" if shoe.location.x > 0 else "R"
    name = f"Foot.{side}"
    bind(shoe, [name])[name].add(list(range(len(shoe.data.vertices))), 1, "REPLACE")

if args.trouser_correction:
    pants.shape_key_add(name="Basis")
    correction = pants.shape_key_add(name="Seated trouser fit")
    world = pants.matrix_world.copy()
    local = world.inverted()
    for vertex in correction.data:
        point = world @ vertex.co
        hip = smooth((point.z - .27) / .24)
        point.y = .008 + (point.y - .008) * (1 - .27 * hip)
        knee = smooth(1 - abs(point.z - .34) / .16)
        point.y -= args.knee_relief * knee * max(0, point.y - .008)
        vertex.co = local @ point
    for frame in (1, 25, 32, 37, 49):
        correction.value = float(frame == 37)
        correction.keyframe_insert(data_path="value", frame=frame)

for frame in (1, 25, 32, 37, 49):
    # Preserve the existing elbow action and hold the legs neutral through frame 25.
    seated = frame == 37
    for side in ("L", "R"):
        for label, angle in (("Thigh", -90), ("Shin", 90)):
            bone = rig.pose.bones[f"{label}.{side}"]
            axis = bone.bone.matrix_local.to_quaternion().inverted() @ Vector((1, 0, 0))
            bone.rotation_mode = "QUATERNION"
            bone.rotation_quaternion = Quaternion(axis, math.radians(angle if seated else 0))
            bone.keyframe_insert(data_path="rotation_quaternion", frame=frame)
    for obj in [o for o in scene.objects if o.type == "MESH"]:
        z = obj.location.z
        obj.delta_location.z = -.22 if seated else 0
        obj.keyframe_insert(data_path="delta_location", frame=frame)
        assert obj.location.z == z
    rig.delta_location.z = -.22 if seated else 0
    rig.keyframe_insert(data_path="delta_location", frame=frame)

scene.frame_end = 49
scene.frame_set(1)
blend = args.output / "seat-proof.blend"
if "FINISHED" not in bpy.ops.wm.save_as_mainfile(filepath=str(blend.resolve())):
    raise RuntimeError("Could not save seat proof")
report = {"sourceSha256": args.sha256, "kneeRelief": args.knee_relief, "poses": {}}
for name, frame in (("neutral", 1), ("seated", 37)):
    bpy.ops.wm.open_mainfile(filepath=str(blend.resolve()), use_scripts=False)
    scene = bpy.context.scene
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    sole_z = [
        min((obj.matrix_world @ v.co).z for v in obj.evaluated_get(deps).data.vertices)
        for obj in scene.objects if obj.name.split(".")[0] == "Shoe sole"
    ]
    if len(sole_z) != 2 or any(abs(z) > .003 for z in sole_z):
        raise RuntimeError(f"Feet off ground at {name}: {sole_z}")
    report["poses"][name] = {"frame": frame, "soleMinZ": sole_z}
    for obj in list(scene.objects):
        for modifier in list(obj.modifiers):
            if modifier.type != "ARMATURE":
                continue
            if obj.data.shape_keys:
                bpy.context.view_layer.objects.active = obj
                bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
                bpy.context.view_layer.update()
            points = [v.co.copy() for v in obj.evaluated_get(deps).data.vertices]
            bpy.context.view_layer.objects.active = obj
            if "FINISHED" not in bpy.ops.object.modifier_apply(modifier=modifier.name):
                raise RuntimeError(f"Could not bake {obj.name}")
            baked = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).data.vertices
            if len(points) != len(baked) or any(
                (v.co-p).length > 1e-5 for v, p in zip(baked, points)
            ):
                raise RuntimeError(f"Baked pose differs for {obj.name}")
    bpy.data.objects.remove(scene.objects["Elbow proof"], do_unlink=True)
    for obj in scene.objects:
        if obj.type == "MESH":
            world = obj.matrix_world.copy()
            obj.animation_data_clear()
            obj.delta_location = (0, 0, 0)
            obj.matrix_world = world
    bpy.context.view_layer.update()
    if "FINISHED" not in bpy.ops.export_scene.gltf(
        filepath=str((args.output / f"{name}.glb").resolve()),
        export_format="GLB", export_apply=True, export_animations=False,
    ):
        raise RuntimeError(f"Could not export {name}")
(args.output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
