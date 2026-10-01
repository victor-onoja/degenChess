"""Pack a Mixamo-rigged character and its animations into one game-ready .glb.

Reads <dir>/rig.fbx (with skin) plus idle/walk/attack/death.fbx (without skin) and writes a
single GLB whose animations are named after the clips. Optionally renders a preview PNG.

Usage (Blender 4.4+ / 5.x):
  Blender -b -P tools/blender/build_piece.py -- art/bulls/pawn public/models/bulls-pawn.glb [preview.png]
Run for every piece with: npm run models
"""

import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
if len(argv) < 2:
    sys.exit("usage: blender -b -P build_piece.py -- <art dir> <out.glb> [preview.png]")
src_dir, out_path = argv[0], argv[1]
preview_path = argv[2] if len(argv) > 2 else None

CLIPS = ["idle", "walk", "attack", "death"]
TEXTURE_SIZE = 1024


def find(name):
    """Case-insensitive lookup (Mixamo downloads get renamed by hand)."""
    for f in os.listdir(src_dir):
        if f.lower() == f"{name}.fbx":
            return os.path.join(src_dir, f)
    return None


def import_fbx(path):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    return [o for o in bpy.context.scene.objects if o not in before]


bpy.ops.wm.read_factory_settings(use_empty=True)

rig_path = find("rig")
if not rig_path:
    sys.exit(f"{src_dir}: rig.fbx not found")
rig_objects = import_fbx(rig_path)
armature = next(o for o in rig_objects if o.type == "ARMATURE")
bone_names = {b.name for b in armature.data.bones}

# The rig download carries a 1-frame T-pose action we don't want as a clip.
if armature.animation_data and armature.animation_data.action:
    bpy.data.actions.remove(armature.animation_data.action)
armature.animation_data_create()

actions = {}
for clip in CLIPS:
    path = find(clip)
    if not path:
        print(f"WARN {src_dir}: {clip}.fbx missing, skipping")
        continue
    imported = import_fbx(path)
    donor = next((o for o in imported if o.type == "ARMATURE"), None)
    if not donor or not donor.animation_data or not donor.animation_data.action:
        print(f"WARN {src_dir}: {clip}.fbx has no animation, skipping")
    else:
        if {b.name for b in donor.data.bones} != bone_names:
            print(f"WARN {src_dir}: {clip}.fbx skeleton differs from rig.fbx (exported from another character?)")
        action = donor.animation_data.action
        action.name = clip
        action.use_fake_user = True
        actions[clip] = action
    for o in imported:
        bpy.data.objects.remove(o, do_unlink=True)

# One NLA track per clip: the glTF exporter turns each track into a named animation.
for clip, action in actions.items():
    track = armature.animation_data.nla_tracks.new()
    track.name = clip
    strip = track.strips.new(clip, int(action.frame_range[0]), action)
    if hasattr(strip, "action_slot") and len(action.slots):
        strip.action_slot = action.slots[0]

for image in bpy.data.images:
    if image.size[0] > TEXTURE_SIZE or image.size[1] > TEXTURE_SIZE:
        image.scale(TEXTURE_SIZE, TEXTURE_SIZE)

os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=out_path,
    export_format="GLB",
    export_animations=True,
    export_animation_mode="NLA_TRACKS",
    export_force_sampling=True,
    export_optimize_animation_size=True,
    export_image_format="WEBP",
    export_image_quality=80,
)
size_kb = os.path.getsize(out_path) // 1024
print(f"OK {src_dir} -> {out_path}: clips {list(actions)} , {size_kb} KB")

if preview_path:
    # Pose a few frames into the idle clip so the preview shows the rig actually deforming the mesh.
    pose = actions.get("idle") or next(iter(actions.values()), None)
    for track in armature.animation_data.nla_tracks:
        track.mute = True
    if pose:
        armature.animation_data.action = pose
        if hasattr(armature.animation_data, "action_slot") and len(pose.slots):
            armature.animation_data.action_slot = pose.slots[0]
    scene = bpy.context.scene
    scene.frame_set(20)

    cam_data = bpy.data.cameras.new("cam")
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (1.6, -4.4, 1.5)
    direction = Vector((0, 0, 0.9)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam

    for name, energy, rot in [("key", 4.0, (50, 0, 30)), ("fill", 1.5, (60, 0, -120))]:
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, "SUN"))
        light.data.energy = energy
        light.rotation_euler = tuple(math.radians(a) for a in rot)
        scene.collection.objects.link(light)
    world = bpy.data.worlds.new("w")
    world.color = (0.18, 0.18, 0.2)
    scene.world = world

    scene.render.engine = "CYCLES"
    scene.cycles.samples = 24
    scene.cycles.device = "CPU"
    scene.render.resolution_x, scene.render.resolution_y = 360, 480
    scene.render.filepath = preview_path
    bpy.ops.render.render(write_still=True)
