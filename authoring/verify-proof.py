"""Run against the saved .blend to prove reopen and a targeted source edit."""
import bpy, sys, json
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1]).resolve()
assert bpy.data.objects.get('human_rig_v1')
assert {'neutral','walk','fishing_idle'} <= set(bpy.data.actions.keys())
assert len(bpy.data.objects['human_rig_v1'].data.bones)==14
shirt=bpy.data.materials['shirt']
shirt.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.32,.23,.16,1)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'human-edited.blend'))
bpy.ops.export_scene.gltf(filepath=str(out/'human-edited.glb'),export_format='GLB',
    export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True)
(out/'reopen-check.json').write_text(json.dumps({'reopened':True,'edit':'shirt colour',
 'bones':14,'clips':sorted(a.name for a in bpy.data.actions)})+'\n')
