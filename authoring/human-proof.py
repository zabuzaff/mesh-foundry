"""Disposable authoring fixture, not a visually accepted game asset.
Run with Blender --background --python-exit-code 1 --python this.py -- OUTPUT_DIR.
"""
import bpy, math, sys, json
from pathlib import Path
from mathutils import Vector
out = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
out.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.render.fps = 24
scene.frame_start, scene.frame_end = 0, 48

def material(name, color):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = .85
    return m
skin = material('skin', (.56,.34,.23))
shirt = material('shirt', (.18,.29,.25))
pants = material('trousers', (.19,.22,.28))
hair = material('hair', (.08,.06,.05))
eye = material('eyes', (.035,.03,.025))
# Forward is Blender -Y, height Z, metres; GLB exporter converts to Y-up.
bones = {
 'root': ((0,0,0),(0,0,.15),None),
 'hips': ((0,0,.82),(0,0,1.0),'root'),
 'spine': ((0,0,1.0),(0,0,1.4),'hips'),
 'head': ((0,0,1.4),(0,0,1.85),'spine'),
}
for side, sign in [('L',1),('R',-1)]:
    x = .14*sign
    bones['thigh.'+side] = ((x,0,.87),(x,0,.47),'hips')
    bones['shin.'+side] = ((x,0,.47),(x,0,.09),'thigh.'+side)
    bones['foot.'+side] = ((x,0,.09),(x,-.19,.06),'shin.'+side)
    bones['upper_arm.'+side] = ((.25*sign,0,1.35),(.40*sign,0,1.08),'spine')
    bones['forearm.'+side] = ((.40*sign,0,1.08),(.46*sign,-.025,.84),'upper_arm.'+side)
arm_data = bpy.data.armatures.new('human_rig_v1')
rig = bpy.data.objects.new('human_rig_v1', arm_data)
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name,(head,tail,parent) in bones.items():
    b = arm_data.edit_bones.new(name); b.head=head; b.tail=tail
    if parent: b.parent=arm_data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
rig.select_set(False)

def part(name, center, scale, mat, bone):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, location=center)
    obj=bpy.context.object; obj.name=name; obj.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    obj.data.materials.append(mat)
    obj['logical_part_id']=name
    group=obj.vertex_groups.new(name=bone)
    group.add(list(range(len(obj.data.vertices))),1,'REPLACE')
    mod=obj.modifiers.new('skin','ARMATURE'); mod.object=rig
    obj.parent=rig
    return obj
part('torso',(0,0,1.18),(.27,.155,.30),shirt,'spine')
part('pelvis',(0,0,.87),(.23,.15,.15),pants,'hips')
part('head',(0,-.012,1.64),(.19,.17,.23),skin,'head')
part('hair',(0,.025,1.80),(.195,.16,.10),hair,'head')
for sign in [-1,1]:
    part('eye_'+str(sign),(.065*sign,-.175,1.66),(.018,.012,.016),eye,'head')
part('nose',(0,-.18,1.60),(.035,.035,.045),skin,'head')
for side, sign in [('L',1),('R',-1)]:
    part('thigh_'+side,(.14*sign,0,.67),(.105,.12,.23),pants,'thigh.'+side)
    part('shin_'+side,(.14*sign,0,.28),(.075,.08,.22),pants,'shin.'+side)
    part('shoe_'+side,(.14*sign,-.07,.075),(.095,.17,.075),hair,'foot.'+side)
    for name,mat,radius in [('upper_arm',shirt,.085),('forearm',skin,.065)]:
        a,b,_=bones[name+'.'+side]; a,b=Vector(a),Vector(b)
        obj=part(name+'_'+side,(a+b)/2,(radius,radius,(b-a).length/2+.025),mat,name+'.'+side)
        obj.rotation_mode='QUATERNION'; obj.rotation_quaternion=(b-a).to_track_quat('Z','Y')
        bpy.context.view_layer.objects.active=obj
        bpy.ops.object.transform_apply(location=False,rotation=True,scale=False)
    part('hand_'+side,(.46*sign,-.025,.83),(.065,.065,.085),skin,'forearm.'+side)
# Rigidly weighted segmented fixture proves skeleton/clip transport. It does not
# establish production-quality joint deformation or automatic skin weighting.
rig.animation_data_create()
for clip in ['neutral','walk','fishing_idle']:
    action=bpy.data.actions.new(clip)
    rig.animation_data.action=action
    for frame in range(0,49,4):
        phase=2*math.pi*frame/48
        for bone in rig.pose.bones:
            bone.rotation_mode='XYZ'; bone.rotation_euler=(0,0,0)
        if clip=='walk':
            for side,sign in [('L',1),('R',-1)]:
                rig.pose.bones['thigh.'+side].rotation_euler.x=.4*math.sin(phase)*sign
                rig.pose.bones['shin.'+side].rotation_euler.x=max(0,-math.sin(phase)*sign)*.5
                rig.pose.bones['upper_arm.'+side].rotation_euler.x=-.25*math.sin(phase)*sign
        elif clip=='fishing_idle':
            for side,sign in [('L',1),('R',-1)]:
                rig.pose.bones['upper_arm.'+side].rotation_euler.x=-.65
                rig.pose.bones['forearm.'+side].rotation_euler.x=-.55+.04*math.sin(phase)
            rig.pose.bones['spine'].rotation_euler.x=.025*math.sin(phase)
        for bone in rig.pose.bones: bone.keyframe_insert('rotation_euler',frame=frame,group=bone.name)
    track=rig.animation_data.nla_tracks.new(); track.name=clip
    track.strips.new(clip,0,action)
    track.mute=True
rig.animation_data.action=None
for bone in rig.pose.bones: bone.rotation_euler=(0,0,0)
scene.frame_set(0)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'human.blend'))
# Export one animation per action; muted NLA tracks retain action ownership.
bpy.ops.export_scene.gltf(filepath=str(out/'human.glb'), export_format='GLB',
    export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True)
manifest={'fixture':True,'visual_acceptance':False,'blender':bpy.app.version_string,
          'rig':'human_rig_v1','clips':['neutral','walk','fishing_idle'],
          'fps':24,'units':'metres','source_forward':'-Y','source_up':'Z',
          'limitations':['Segmented rigid skinning; joint deformation not production-ready',
                        'Fishing idle has no rod/contact constraint', 'No visual design acceptance']}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
