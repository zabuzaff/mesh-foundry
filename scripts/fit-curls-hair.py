"""Break up the regular curl rows on the pinned Curls glasses-fit study."""

import argparse
import hashlib
import json
from pathlib import Path
import random
import sys

import bpy

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path)
parser.add_argument("sha256")
parser.add_argument("output", type=Path)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
if hashlib.sha256(args.source.read_bytes()).hexdigest() != args.sha256:
    parser.error("Source hash mismatch")
bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()), use_scripts=False)
curls = sorted(
    (o for o in bpy.context.scene.objects if o.name == "Rounded curl"
     or o.name.startswith("Rounded curl.")),
    key=lambda o: o.name,
)
if not curls or any(o.type != "MESH" or o.parent for o in curls):
    raise RuntimeError("Expected editable Curls hair meshes")

rng = random.Random(14)
for obj in curls:
    if obj.location.y < -.12 and obj.location.z < 1.75:
        continue
    # Stagger the rows and vary curl size, retaining the underlying hair cap.
    obj.location.z += rng.uniform(-.047, .047)
    size = rng.uniform(.88, 1.12)
    obj.scale *= size
    obj.rotation_euler.x += rng.uniform(-.3, .3)

args.output.mkdir()
blend = args.output / "kairo-curls.blend"
glb = args.output / "kairo-curls.glb"
if "FINISHED" not in bpy.ops.wm.save_as_mainfile(filepath=str(blend.resolve())):
    raise RuntimeError("Blender save failed")
if "FINISHED" not in bpy.ops.export_scene.gltf(
    filepath=str(glb.resolve()), export_format="GLB", export_apply=True
):
    raise RuntimeError("GLB export failed")
(args.output / "hair-fit.json").write_text(json.dumps({
    "sourceSha256": args.sha256,
    "seed": 14,
    "curlCount": len(curls),
    "blender": bpy.app.version_string,
    "outputs": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (blend, glb)},
}, indent=2) + "\n")
