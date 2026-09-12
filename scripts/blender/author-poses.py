"""
Author held fox poses as real clips on the Khronos fox rig, using Blender IK so
paws stay planted and legs fold naturally. Run headless:

  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
    --python scripts/blender/author-poses.py -- \
    --src public/models/fox.glb --poses Sleep --render /tmp/fox-poses [--export out.glb]

Blender world after glTF import: +Z up, fox forward is -Y, the fox's left is +X.
Units are the model's own (about centimetres). Each pose is built with
world-space rotations and IK, baked to a one-frame action, rendered from three
angles, and optionally exported with the original Survey, Walk and Run clips.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def opt(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default


SRC = os.path.abspath(opt('--src', 'public/models/fox.glb'))
RENDER = opt('--render')
EXPORT = opt('--export')
POSES = opt('--poses', 'Sleep').split(',')

bpy.ops.wm.read_factory_settings(use_empty=True)
# TEMPERANCE points each bone's tail at its child joint, so tail IK moves the real paw.
bpy.ops.import_scene.gltf(filepath=SRC, bone_heuristic='TEMPERANCE')
scene = bpy.context.scene
view = bpy.context.view_layer
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
mesh = next(o for o in bpy.data.objects if o.type == 'MESH')
if arm.animation_data:
    arm.animation_data.action = None

UP = Vector((0, 0, 1))
TO_ARM = arm.matrix_world.inverted()


def pb(name):
    return arm.pose.bones[name]


def head_w(name):
    return arm.matrix_world @ pb(name).head


def tail_w(name):
    return arm.matrix_world @ pb(name).tail


def rotate(name, axis_world, degrees):
    """Rotate a bone (and so its children) about a world axis through its head."""
    bone = pb(name)
    m = bone.matrix.copy()
    pivot = m.to_translation()
    axis = (TO_ARM.to_3x3() @ Vector(axis_world)).normalized()
    bone.matrix = Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(degrees), 4, axis) @ Matrix.Translation(-pivot) @ m
    view.update()


def yaw(name, degrees):
    """Positive turns the bone toward the fox's left (+X) when it points forward."""
    rotate(name, UP, degrees)


def direction(name):
    """Joint-to-joint direction. glTF has no bone tails, so the importer's tails are guesses."""
    bone = pb(name)
    if bone.children:
        return (arm.matrix_world @ bone.children[0].head - head_w(name)).normalized()
    return (head_w(name) - arm.matrix_world @ bone.parent.head).normalized()


def nod(name, degrees):
    """Positive tips the bone's far end down."""
    d = direction(name)
    lateral = d.cross(UP)
    if lateral.length < 1e-4:
        lateral = Vector((1, 0, 0))
    rotate(name, lateral.normalized(), -degrees)


def move(name, offset_world):
    bone = pb(name)
    delta = TO_ARM.to_3x3() @ Vector(offset_world)
    bone.matrix = Matrix.Translation(delta) @ bone.matrix
    view.update()


def ik(name, target_world, chain, use_tail=True):
    """IK the bone's tail (its child joint, with the TEMPERANCE heuristic) onto the target."""
    empty = bpy.data.objects.new(f'ik_{name}', None)
    scene.collection.objects.link(empty)
    empty.location = Vector(target_world)
    constraint = pb(name).constraints.new('IK')
    constraint.target = empty
    constraint.use_tail = use_tail
    constraint.chain_count = chain
    view.update()


def reset():
    if arm.animation_data:
        arm.animation_data.action = None
    for bone in arm.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
        for c in list(bone.constraints):
            bone.constraints.remove(c)
    for o in [o for o in bpy.data.objects if o.name.startswith('ik_')]:
        bpy.data.objects.remove(o, do_unlink=True)
    view.update()


def plant(foot_bone, chain, forward, side_out=0.0, height=1.0):
    """IK the bone's tail joint to the ground, `forward` units ahead (-Y) of where it is now."""
    tip = tail_w(foot_bone)
    side = 1 if tip.x > 0 else -1
    ik(foot_bone, (tip.x + side * side_out, tip.y - forward, height), chain)


def lowest_z():
    depsgraph = bpy.context.evaluated_depsgraph_get()
    depsgraph.update()
    evaluated = mesh.evaluated_get(depsgraph)
    lowest = min((evaluated.matrix_world @ v.co).z for v in evaluated.to_mesh().vertices)
    evaluated.to_mesh_clear()
    return lowest


def settle(tolerance=0.2, contact=1.0, rounds=24):
    """Move the hips until the lowest vertex rests on the floor: never below -tolerance,
    never floating more than `contact` above it. IK keeps the paws on their targets.
    Raising takes the full error; lowering takes half, so the loop cannot overshoot back under."""
    history = []
    for _ in range(rounds):
        low = lowest_z()
        history.append(round(low, 2))
        if low < -tolerance:
            move('b_Hip_01', (0, 0, -low + tolerance * 0.5))
        elif low > contact:
            move('b_Hip_01', (0, 0, -(low - contact) * 0.5))
        else:
            break
    print(f'SETTLE rounds {history}')
    return lowest_z()


def pole(name, position_world, angle=-90.0):
    """Aim the knee of an IK chain toward a point."""
    empty = bpy.data.objects.new(f'ik_pole_{name}', None)
    scene.collection.objects.link(empty)
    empty.location = Vector(position_world)
    constraint = next(c for c in pb(name).constraints if c.type == 'IK')
    constraint.pole_target = empty
    constraint.pole_angle = math.radians(angle)
    view.update()


def pose_sleep():
    # Belly down. The hips are settled onto the floor at the end, never the legs pushed through it.
    move('b_Hip_01', (0, 0, -json.loads(os.environ.get('SLEEP', '{}')).get('hip_drop', 26)))
    # Curl toward the fox's left: spine, neck and head swing back along the flank, head resting low.
    yaw('b_Spine01_02', 16)
    yaw('b_Spine02_03', 24)
    yaw('b_Neck_04', 46)
    yaw('b_Head_05', 38)
    nod('b_Neck_04', 26)
    nod('b_Head_05', 12)
    # The tail rests at a downward slope; level each segment, then sweep it round to the nose.
    nod('b_Tail01_012', -22)
    nod('b_Tail02_013', -18)
    nod('b_Tail03_014', -14)
    yaw('b_Tail01_012', -48)
    yaw('b_Tail02_013', -52)
    yaw('b_Tail03_014', -46)
    # Legs are folded with direct joint rotations about the body's own lateral axis
    # (IK left them straight and the settle step then lifted the body to standing height).
    # SLEEP='{"thigh": 70, "shin": -130, "foot": 60, "upper": -35, "fore": 110, "knee_out": 12}'
    params = {'thigh': 70, 'shin': -130, 'foot': 60, 'upper': -35, 'fore': 110, 'knee_out': 12, 'hip_drop': 26, 'front_yaw': 0}
    params.update(json.loads(os.environ.get('SLEEP', '{}')))
    hind_lateral = (head_w('b_LeftLeg01_015') - head_w('b_RightLeg01_019')).normalized()
    front_lateral = (head_w('b_LeftUpperArm_09') - head_w('b_RightUpperArm_06')).normalized()
    hind_forward = UP.cross(hind_lateral).normalized()
    for side, leg1, leg2, foot in ((1, 'b_LeftLeg01_015', 'b_LeftLeg02_016', 'b_LeftFoot01_017'),
                                   (-1, 'b_RightLeg01_019', 'b_RightLeg02_020', 'b_RightFoot01_021')):
        rotate(leg1, hind_lateral, -params['thigh'])
        rotate(leg1, hind_forward, side * params['knee_out'])
        rotate(leg2, hind_lateral, -params['shin'])
        rotate(foot, hind_lateral, -params['foot'])
    for upper, fore in (('b_LeftUpperArm_09', 'b_LeftForeArm_010'), ('b_RightUpperArm_06', 'b_RightForeArm_07')):
        rotate(upper, front_lateral, -params['upper'])
        rotate(fore, front_lateral, -params['fore'])
        # Turn the forelegs toward the inside of the curl so the paws lie under the tucked head.
        rotate(upper, UP, params['front_yaw'])
    print(f'SETTLE Sleep params {params} lowest z {round(settle(), 2)} hip z {round(head_w("b_Hip_01").z, 1)}')


BUILDERS = {'Sleep': pose_sleep}


def report(label):
    """Print how far each IK paw is from its target and the lowest mesh point."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    depsgraph.update()
    evaluated_arm = arm.evaluated_get(depsgraph)
    for o in [o for o in bpy.data.objects if o.name.startswith('ik_') and not o.name.startswith('ik_pole_')]:
        bone_name = o.name[3:]
        tip = evaluated_arm.matrix_world @ evaluated_arm.pose.bones[bone_name].tail
        chain = [b.name for b in [evaluated_arm.pose.bones[bone_name]] + list(evaluated_arm.pose.bones[bone_name].parent_recursive)[:2]]
        lengths = [round(evaluated_arm.pose.bones[n].length, 1) for n in chain]
        print(f'IK {label} {bone_name}: tip {tuple(round(c, 1) for c in tip)} target {tuple(round(c, 1) for c in o.location)} miss {round((tip - o.location).length, 1)} chain {chain} lengths {lengths}')
    evaluated = mesh.evaluated_get(depsgraph)
    world = [(evaluated.matrix_world @ v.co, i) for i, v in enumerate(evaluated.to_mesh().vertices)]
    evaluated.to_mesh_clear()
    below = [(co, i) for co, i in world if co.z < -1.0]
    by_bone = {}
    for co, i in below:
        groups = mesh.data.vertices[i].groups
        if groups:
            top = max(groups, key=lambda g: g.weight)
            name = mesh.vertex_groups[top.group].name
            by_bone[name] = min(by_bone.get(name, 0.0), round(co.z, 1))
    lowest = min(co.z for co, _ in world)
    print(f'IK {label} lowest mesh z {round(lowest, 1)} hip head z {round(head_w("b_Hip_01").z, 1)} below-ground by bone {by_bone}')


def bake(name):
    report('before-bake')
    view.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.select_all(action='SELECT')
    bpy.ops.nla.bake(frame_start=1, frame_end=2, only_selected=False, visual_keying=True,
                     clear_constraints=True, use_current_action=False, bake_types={'POSE'})
    bpy.ops.object.mode_set(mode='OBJECT')
    action = arm.animation_data.action
    action.name = name
    scene.frame_set(1)
    report('after-bake')
    return action


def setup_render():
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 720
    scene.render.resolution_y = 540
    world = bpy.data.worlds.new('w')
    world.color = (0.03, 0.03, 0.03)
    scene.world = world
    for rot, energy in (((50, 0, 30), 3.0), ((60, 0, 210), 1.2)):
        light = bpy.data.objects.new('light', bpy.data.lights.new('light', 'SUN'))
        light.data.energy = energy
        light.rotation_euler = tuple(math.radians(r) for r in rot)
        scene.collection.objects.link(light)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def render_views(cam, name):
    scene.frame_set(1)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = mesh.evaluated_get(depsgraph)
    points = [evaluated.matrix_world @ v.co for v in evaluated.to_mesh().vertices]
    evaluated.to_mesh_clear()
    centre = sum(points, Vector()) / len(points)
    size = max((p - centre).length for p in points)
    # endcard: low, about 15 degrees above the floor, three-quarter from the front (S11 camera).
    views = {
        'side': Vector((1, 0, 0.15)),
        'threequarter': Vector((0.7, -0.7, 0.35)),
        'top': Vector((0.01, 0.02, 1)),
        'endcard': Vector((0.6, -0.8, math.tan(math.radians(15)))),
    }
    for view_name, direction in views.items():
        cam.location = centre + direction.normalized() * size * 3.2
        cam.rotation_euler = (centre - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(RENDER, f'{name}-{view_name}.png')
        bpy.ops.render.render(write_still=True)
    print(f'POSE {name}: centre {tuple(round(c, 1) for c in centre)} lowest z {round(min(p.z for p in points), 1)}')


cam = setup_render() if RENDER else None
authored = []
for name in POSES:
    reset()
    BUILDERS[name]()
    action = bake(name)
    authored.append(action)
    if RENDER:
        os.makedirs(RENDER, exist_ok=True)
        render_views(cam, name)
    arm.animation_data.action = None

if EXPORT:
    for action in authored:
        action.use_fake_user = True
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(EXPORT), export_format='GLB', export_animation_mode='ACTIONS',
                              export_yup=True, export_skins=True, export_texcoords=True, export_normals=True)
    print('EXPORTED', EXPORT)
