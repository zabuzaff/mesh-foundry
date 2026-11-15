"""Experimental local authoring operation for the Curls spectacle meshes."""

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils.bvhtree import BVHTree

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path, help="Verified Curls .blend")
parser.add_argument("concept", type=Path, help="Verified approved turnaround")
parser.add_argument("output", type=Path, help="New output directory")
parser.add_argument("--source-sha256", required=True)
parser.add_argument("--concept-sha256", required=True)
parser.add_argument("--setback", type=float, required=True, help="Positive Blender units toward the head")
parser.add_argument("--nose-relief", type=float, default=0, help="Maximum forward offset at the inner rim")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
if not math.isfinite(args.setback) or not 0 < args.setback <= .06:
    parser.error("Setback must be in (0, 0.06] Blender units")

if not math.isfinite(args.nose_relief) or not 0 <= args.nose_relief <= .10:
    parser.error("Nose relief must be in [0, 0.10] Blender units")

for path, expected in ((args.source, args.source_sha256), (args.concept, args.concept_sha256)):
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        parser.error(f"SHA-256 mismatch for {path}")

bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()), use_scripts=False)
targets = []
relief_meshes = []
for label, count in (("Round spectacle rim", 2), ("Standard spectacle arm with ear hook", 2), ("Spectacle bridge", 1)):
    matches = [
        obj for obj in bpy.context.scene.objects
        if obj.type == "MESH" and (obj.name == label or obj.name.startswith(label + "."))
    ]
    if len(matches) != count or any(obj.parent or obj.constraints for obj in matches):
        raise RuntimeError(f"Expected {count} unparented, unconstrained Curls meshes for {label}")
    targets.extend(matches)
    if label in ("Round spectacle rim", "Spectacle bridge"):
        relief_meshes.extend(matches)

def surface(obj):
    return BVHTree.FromPolygons(
        [obj.matrix_world @ v.co for v in obj.data.vertices],
        [tuple(face.vertices) for face in obj.data.polygons],
    )

def contacts():
    nose = surface(bpy.context.scene.objects["Nose"])
    bridge = surface(bpy.context.scene.objects["Spectacle bridge"])
    result = {}
    for obj in relief_meshes:
        if not obj.name.startswith("Round spectacle rim"):
            continue
        rim = surface(obj)
        result[obj.name] = {
            "noseFacePairs": len(rim.overlap(nose)),
            "bridgeFacePairs": len(rim.overlap(bridge)),
        }
    return result

before_contacts = contacts()
args.output.mkdir()
for obj in targets:
    obj.location.y += args.setback
bpy.context.view_layer.update()
for obj in relief_meshes:
    if not args.nose_relief:
        continue
    obj.data = obj.data.copy()
    world = obj.matrix_world.copy()
    local = world.inverted()
    for vertex in obj.data.vertices:
        point = world @ vertex.co
        # Feather the depth change out before reaching the outer half.
        t = max(0.0, min(1.0, (.16 - abs(point.x)) / .12))
        point.y -= args.nose_relief * t * t * (3 - 2 * t)
        vertex.co = local @ point
    obj.data.update()
bpy.context.view_layer.update()
after_contacts = contacts()
blend = args.output / "kairo-curls.blend"
glb = args.output / "kairo-curls.glb"
if "FINISHED" not in bpy.ops.wm.save_as_mainfile(filepath=str(blend.resolve())):
    raise RuntimeError("Blender save failed")
if "FINISHED" not in bpy.ops.export_scene.gltf(
    filepath=str(glb.resolve()),
    export_format="GLB",
    export_apply=True,
):
    raise RuntimeError("GLB export failed")
(args.output / "fit.json").write_text(json.dumps({
    "sourceSha256": args.source_sha256,
    "conceptSha256": args.concept_sha256,
    "setbackBlenderUnits": args.setback,
    "noseReliefBlenderUnits": args.nose_relief,
    "axis": "+Y (toward the face on the pinned Curls source)",
    "objects": sorted(obj.name for obj in targets),
    "blender": bpy.app.version_string,
    "contacts": {"before": before_contacts, "after": after_contacts},
    "outputs": {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in (blend, glb)},
}, indent=2) + "\n")
