"""Local one-sleeve deformation proof for the pinned Curls hair study."""

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
parser.add_argument("--elbow-z", type=float, default=.79)
parser.add_argument("--blend-width", type=float, default=.24)
parser.add_argument("--loop", action="store_true", help="Add a release and export the 45-degree pose")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
if not .70 <= args.elbow_z <= .88 or not .10 <= args.blend_width <= .32:
    parser.error("Elbow height or blend width outside the Curls sleeve")
if hashlib.sha256(args.source.read_bytes()).hexdigest() != args.sha256:
    parser.error("Source hash mismatch")
bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()), use_scripts=False)
scene = bpy.context.scene
sleeve = scene.objects["Continuous torso and sleeves"]
hands = [o for o in scene.objects if o.name.split(".")[0] in {"Hand", "Thumb"} and o.location.x > 0]
if len(hands) != 2:
    raise RuntimeError("Expected two positive-X hand pieces")
args.output.mkdir()

def export_obj(name):
    path = args.output / name
    if "FINISHED" not in bpy.ops.export_scene.gltf(
        filepath=str(path.resolve()), export_format="GLB", export_apply=True,
        export_animations=False,
    ):
        raise RuntimeError(f"Export failed: {name}")

armature = bpy.data.armatures.new("Elbow proof")
rig = bpy.data.objects.new("Elbow proof", armature)
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
shoulder, elbow, wrist = (.27, 0, 1.06), (.35, 0, args.elbow_z), (.42, -.012, .62)
upper = armature.edit_bones.new("Upper arm")
upper.head, upper.tail = shoulder, elbow
forearm = armature.edit_bones.new("Forearm")
forearm.head, forearm.tail = elbow, wrist
forearm.parent = upper
forearm.use_connect = True
bpy.ops.object.mode_set(mode="OBJECT")

def bind(obj):
    mod = obj.modifiers.new("Elbow proof", "ARMATURE")
    mod.object = rig
    mod.use_deform_preserve_volume = True
    return obj.vertex_groups.new(name="Upper arm"), obj.vertex_groups.new(name="Forearm")

upper_group, fore_group = bind(sleeve)
weights = 0
for v in sleeve.data.vertices:
    x, _, z = sleeve.matrix_world @ v.co
    arm = max(0, min(1, (x - .23) / .12))
    bend = max(0, min(1, .5 + (args.elbow_z - z) / args.blend_width))
    weight = arm * bend * bend * (3 - 2 * bend)
    upper_group.add([v.index], 1 - weight, "REPLACE")
    if weight:
        fore_group.add([v.index], weight, "REPLACE")
        weights += 1
for hand in hands:
    _, group = bind(hand)
    group.add(list(range(len(hand.data.vertices))), 1, "REPLACE")

def snapshot():
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    return [[obj.matrix_world @ v.co for v in obj.evaluated_get(deps).data.vertices]
            for obj in [sleeve, *hands]]

neutral = snapshot()
for obj, points in zip([sleeve, *hands], neutral):
    assert len(obj.data.vertices) == len(points)
    assert max((obj.matrix_world @ v.co - p).length for v, p in zip(obj.data.vertices, points)) < 1e-5
bone = rig.pose.bones["Forearm"]
axis = bone.bone.matrix_local.to_quaternion().inverted() @ Vector((1, 0, 0))
bone.rotation_mode = "QUATERNION"
keys = [(1, 0), (25, -90)]
poses = [(1, "neutral"), (25, "bent")]
if args.loop:
    keys = [(1, 0), (13, -45), (25, -90), (37, -45), (49, 0)]
    poses.insert(1, (13, "midpoint"))
for frame, angle in keys:
    bone.rotation_quaternion = Quaternion(axis, math.radians(angle))
    bone.keyframe_insert(data_path="rotation_quaternion", frame=frame)
scene.frame_end = keys[-1][0]
scene.frame_set(1)
path = args.output / "elbow-proof.blend"
if "FINISHED" not in bpy.ops.wm.save_as_mainfile(filepath=str(path.resolve())):
    raise RuntimeError("Could not save rig source")

mesh_names = [obj.name for obj in [sleeve, *hands]]
for frame, label in poses:
    # Bake only in memory, then reload the editable rig for the second pose.
    bpy.ops.wm.open_mainfile(filepath=str(path.resolve()), use_scripts=False)
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    for name in mesh_names:
        obj = bpy.context.scene.objects[name]
        bpy.context.view_layer.objects.active = obj
        points = [v.co.copy() for v in obj.evaluated_get(deps).data.vertices]
        if "FINISHED" not in bpy.ops.object.modifier_apply(modifier="Elbow proof"):
            raise RuntimeError(f"Could not bake {name} at frame {frame}")
        if len(points) != len(obj.data.vertices) or any(
            (v.co - p).length > 1e-5 for v, p in zip(obj.data.vertices, points)
        ):
            raise RuntimeError(f"Baked pose differs for {name} at frame {frame}")
    bpy.data.objects.remove(bpy.context.scene.objects["Elbow proof"], do_unlink=True)
    export_obj(label + ".glb")

(args.output / "report.json").write_text(json.dumps({
    "sourceSha256": args.sha256, "shoulder": shoulder, "elbow": elbow, "wrist": wrist,
    "blendWidth": args.blend_width, "sleeveVerticesWithForearmWeight": weights,
    "keys": keys,
    "neutralFrame": 1, "bentFrame": 25, "bendDegrees": 90,
}, indent=2) + "\n")
