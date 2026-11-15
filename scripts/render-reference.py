# Trusted fixed-purpose renderer. Never executes asset scripts.
import bpy, sys, json, math, struct
from mathutils import Vector
from pathlib import Path
args = sys.argv[sys.argv.index("--") + 1:]
source, out, *comparison = args
if len(comparison) > 1:
    raise ValueError("Expected at most one comparison framing argument")
comparison = comparison[0] if comparison else None
out = Path(out)
bpy.ops.wm.read_factory_settings(use_empty=True)
# Remove animation channels before import, so no first-clip evaluation can
# overwrite declared node TRS or morph weights before we establish rest state.
raw = Path(source).read_bytes()
length, kind = struct.unpack_from('<II', raw, 12)
if kind != 0x4E4F534A: raise RuntimeError('GLB JSON chunk required')
model = json.loads(raw[20:20+length])
model.pop('animations', None)
encoded = json.dumps(model, separators=(',', ':')).encode('utf8')
encoded += b' ' * ((-len(encoded)) % 4)
rest = raw[:8] + struct.pack('<I', 20+len(encoded)+len(raw)-20-length) + struct.pack('<II', len(encoded), kind) + encoded + raw[20+length:]
rest_path = out/'rest.glb'
rest_path.write_bytes(rest)
bpy.ops.import_scene.gltf(filepath=str(rest_path))
for obj in list(bpy.context.scene.objects):
    if obj.type in {'LIGHT', 'CAMERA'}:
        bpy.data.objects.remove(obj, do_unlink=True)
# glTF importer converts Y-up into Blender Z-up. Restore rest state explicitly.
for a in bpy.data.actions:
    bpy.data.actions.remove(a)
for obj in bpy.context.scene.objects:
    obj.animation_data_clear()
    if obj.type == 'ARMATURE':
        obj.data.pose_position = 'REST'
        for bone in obj.pose.bones:
            bone.matrix_basis.identity()
bpy.context.view_layer.update()
# Blender's importer creates hidden bone-display meshes. They are not render
# geometry and must not inflate or offset the camera bounds.
def render_objects(collection):
    if collection.hide_render: return set()
    result = {o for o in collection.objects if not o.hide_render}
    for child in collection.children: result.update(render_objects(child))
    return result
meshes = [o for o in render_objects(bpy.context.scene.collection) if o.type == 'MESH']
if not meshes: raise RuntimeError('No geometry')
deps = bpy.context.evaluated_depsgraph_get()
points = [o.matrix_world @ Vector(c) for o in meshes for c in o.evaluated_get(deps).bound_box]
lo = Vector([min(p[i] for p in points) for i in range(3)])
hi = Vector([max(p[i] for p in points) for i in range(3)])
if comparison and comparison != "comparison":
    bounds = json.loads(Path(comparison).read_text())["bounds"]
    lo, hi = Vector(bounds["min"]), Vector(bounds["max"])
C = (lo+hi)/2
D = max(hi-lo)
if not math.isfinite(D) or D <= 0: raise RuntimeError('Invalid rest bounds')
# glTF +Z forward -> Blender -Y, glTF +X right -> Blender +X.
directions = {'front': Vector((0,-1,0)), 'right-side':Vector((1,0,0)), 'three-quarter':Vector((1,-1,0)).normalized()}
if comparison:
    directions["back"] = Vector((0,1,0))
    del directions["three-quarter"]
scale = 0
for d in directions.values():
    right = d.cross(Vector((0,0,1))).normalized()
    xs = [(p-C).dot(right) for p in points]
    zs = [(p-C).z for p in points]
    scale = max(scale, 2*max(abs(x) for x in xs), 2*max(abs(z) for z in zs))
scale *= 1.24
if comparison and comparison != "comparison":
    scale = json.loads(Path(comparison).read_text())["orthoScale"]
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 32
scene.cycles.seed = 0
scene.cycles.use_denoising = False
scene.render.resolution_x = scene.render.resolution_y = 1024
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.film_transparent = False
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
world = bpy.data.worlds.new('Neutral world'); world.use_nodes = True
# World illuminates geometry; the service supplies the exact opaque background.
world.node_tree.nodes['Background'].inputs[0].default_value = (1,1,1,1)
world.node_tree.nodes['Background'].inputs[1].default_value = .2
scene.world = world
scene.render.film_transparent = True
# Service flattens the transparent intermediate onto exact sRGB #777777.
def convert(v): return Vector((v[0],-v[2],v[1]))
lights=[]
for name,offset,size,energy in [('key',(2,3,3),1.5,1000),('fill',(-3,2,1),2,400),('rim',(1,3,-3),1,700)]:
    data=bpy.data.lights.new(name,'AREA'); data.energy=energy*(D/2)**2; data.shape='DISK'; data.size=size*D
    obj=bpy.data.objects.new(name,data); scene.collection.objects.link(obj); obj.location=C+convert(offset)*D
    obj.rotation_euler=(C-obj.location).to_track_quat('-Z','Y').to_euler()
    lights.append({'name':name,'position':list(obj.location),'energy':data.energy,'size':data.size})
cameras={}
for name,d in directions.items():
    data=bpy.data.cameras.new(name); data.type='ORTHO'; data.ortho_scale=scale
    obj=bpy.data.objects.new(name,data); scene.collection.objects.link(obj); obj.location=C+4*D*d
    obj.rotation_euler=(C-obj.location).to_track_quat('-Z','Y').to_euler(); scene.camera=obj
    cameras[name]={'position':list(obj.location),'rotation':list(obj.rotation_euler),'orthoScale':scale}
    scene.render.filepath=str(out/(name+'.png')); bpy.ops.render.render(write_still=True)
(out/'resolved.json').write_text(json.dumps({'blender':bpy.app.version_string,'poseBasis':'GLB declared node transforms/morph weights; animations omitted before import; armatures REST','orientation':'glTF Y-up/+Z-forward; no override','bounds':{'min':list(lo),'max':list(hi),'centre':list(C)},'coordinateSystem':'Blender Z-up, -Y forward','orthoScale':scale,'cameras':cameras,'lights':lights,'engine':'CPU Cycles','samples':32,'seed':0,'denoising':False,'viewTransform':'Standard','look':'None','exposure':0,'gamma':1,'background':'#777777 opaque','worldStrength':.2,'resolution':[1024,1024],'marginPerEdge':.12}))
