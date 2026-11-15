"""Measure a static seated GLB against a selected chair and optional footrest."""

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("manifest", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
spec = json.loads(args.manifest.read_text())
for key in ("pose", "chair"):
    source = spec[key]
    if hashlib.sha256(Path(source["path"]).read_bytes()).hexdigest() != source["sha256"]:
        parser.error(f"{key} SHA-256 mismatch")

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def import_model(path):
    previous = set(scene.objects)
    if "FINISHED" not in bpy.ops.import_scene.gltf(filepath=str(Path(path).resolve())):
        raise RuntimeError(f"Could not import {path}")
    return sorted(set(scene.objects) - previous, key=lambda obj: obj.name)

def named(objects, name):
    return next(obj for obj in objects if obj.name == name)

def place(objects, transform):
    world = {obj: transform @ obj.matrix_world for obj in objects}
    for obj in objects:
        obj.parent = None
        obj.matrix_world = world[obj]
    bpy.context.view_layer.update()

pose = import_model(spec["pose"]["path"])
chair = import_model(spec["chair"]["path"])
root = named(chair, spec["chair"]["root"])
parts = [obj for obj in root.children_recursive if obj.type == "MESH"]
if root.type == "MESH":
    parts.append(root)
seat = named(parts, spec["chair"]["seat"])
place(parts, Matrix.Translation(spec["chair"]["offset"])
      @ Matrix.Rotation(math.radians(spec["chair"]["yawDegrees"]), 4, "Z")
      @ Matrix.Translation(-root.matrix_world.translation))
for obj in chair:
    if obj not in parts:
        bpy.data.objects.remove(obj, do_unlink=True)
place(pose, Matrix.Translation(spec["pose"]["offset"]))
pants = named(pose, spec["pose"]["trousers"])

def vertices(obj):
    return [obj.matrix_world @ v.co for v in obj.data.vertices]

def surface(obj):
    return BVHTree.FromPolygons(vertices(obj), [tuple(f.vertices) for f in obj.data.polygons])

seat_tree = surface(seat)
pairs = surface(pants).overlap(seat_tree)
crossing = [pants.matrix_world @ pants.data.vertices[i].co
            for face, _ in pairs for i in pants.data.polygons[face].vertices]
seat_points = vertices(seat)
ray_z = max(v.z for v in seat_points) + 1
gaps = []
for p in vertices(pants):
    hit, _, _, _ = seat_tree.ray_cast(Vector((p.x, p.y, ray_z)), Vector((0, 0, -1)))
    if hit is not None:
        gaps.append(p.z - hit.z)

footrest = spec.get("footrest")
support_z = 0
if footrest:
    x, y, support_z = footrest["topCentre"]
    width, depth = footrest["size"]
    if min(width, depth, support_z) <= 0:
        parser.error("Footrest width, depth and height must be positive")
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, support_z / 2))
    step = bpy.context.object
    step.name = "Diagnostic footrest"
    step.dimensions = (width, depth, support_z)

soles = {}
for name in spec["pose"]["soles"]:
    points = vertices(named(pose, name))
    low = min(p.z for p in points)
    on_support = [p for p in points if p.z <= low + .003]
    inside = not footrest or all(abs(p.x-x) <= width/2 and abs(p.y-y) <= depth/2
                                 for p in on_support)
    soles[name] = {"gap": low - support_z, "contactPatchInside": inside,
                   "supported": inside and abs(low-support_z) <= .003}

args.output.mkdir()
report = {"inputs": spec, "blender": bpy.app.version_string, "seatSurfacePairs": len(pairs),
          "crossingBounds": {axis: [min(getattr(p, axis) for p in crossing),
                                    max(getattr(p, axis) for p in crossing)]
                             for axis in "xyz"} if crossing else None,
          "seatGap": min(gaps) if gaps else None, "soles": soles}

mesh_points = [v for obj in scene.objects if obj.type == "MESH" for v in vertices(obj)]
lo = Vector(min(v[i] for v in mesh_points) for i in range(3))
hi = Vector(max(v[i] for v in mesh_points) for i in range(3))
center = (lo + hi) / 2
span = max(hi - lo)
scene.render.engine = "CYCLES"
scene.cycles.samples = 16
scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = 640
scene.render.resolution_percentage = 100
world = bpy.data.worlds.new("Chair fit world")
world.color = (.25, .25, .25)
scene.world = world
for location, energy in (((2, -3, 4), 450), ((-2, 1, 3), 250)):
    data = bpy.data.lights.new("Area", "AREA")
    data.energy, data.shape, data.size = energy, "DISK", 3
    light = bpy.data.objects.new("Area", data)
    scene.collection.objects.link(light)
    light.location = location
    light.rotation_euler = (center-light.location).to_track_quat("-Z", "Y").to_euler()
data = bpy.data.cameras.new("Chair fit camera")
data.type = "ORTHO"
data.ortho_scale = 1.25 * span
camera = bpy.data.objects.new("Chair fit camera", data)
scene.collection.objects.link(camera)
scene.camera = camera
for name, direction in (("side", (1, 0, 0)), ("three-quarter", (1, -1, .15))):
    camera.location = center + Vector(direction).normalized() * span * 4
    camera.rotation_euler = (center-camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str((args.output / f"{name}.png").resolve())
    if "FINISHED" not in bpy.ops.render.render(write_still=True):
        raise RuntimeError(f"Could not render {name}")

(args.output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
