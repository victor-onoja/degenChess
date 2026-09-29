"""Turn an AI-generated .glb character into an .fbx that Mixamo can auto-rig.

Joins all meshes, removes empties, reduces the triangle count, stands the character
on the origin at 1.8 m tall, and exports an FBX with its textures embedded.

Usage (Blender 4.x, no UI needed):
  /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/blender/prepare_for_mixamo.py -- \
      art/bulls/pawn/generated.glb art/bulls/pawn/for-mixamo.fbx [target_triangles]
"""

import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
if len(argv) < 2:
    sys.exit("usage: blender -b -P prepare_for_mixamo.py -- input.glb output.fbx [target_triangles]")
src, dst = argv[0], argv[1]
target_tris = int(argv[2]) if len(argv) > 2 else 20000
HEIGHT_M = 1.8

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if not meshes:
    sys.exit(f"no mesh found in {src}")

# Unparent (keeping world transforms), join into one mesh, and drop everything else.
bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
if len(meshes) > 1:
    bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
body.name = "Character"
for o in list(bpy.context.scene.objects):
    if o is not body:
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

tris_before = sum(len(p.vertices) - 2 for p in body.data.polygons)
if tris_before > target_tris:
    mod = body.modifiers.new("Reduce", "DECIMATE")
    mod.ratio = target_tris / tris_before
    bpy.ops.object.modifier_apply(modifier=mod.name)
tris_after = sum(len(p.vertices) - 2 for p in body.data.polygons)

# Feet on the origin, centred, fixed height.
corners = [body.matrix_world @ Vector(c) for c in body.bound_box]
min_z = min(v.z for v in corners)
height = max(v.z for v in corners) - min_z
cx = (min(v.x for v in corners) + max(v.x for v in corners)) / 2
cy = (min(v.y for v in corners) + max(v.y for v in corners)) / 2
body.location = (-cx, -cy, -min_z)
bpy.ops.object.transform_apply(location=True)
scale = HEIGHT_M / height
body.scale = (scale, scale, scale)
bpy.ops.object.transform_apply(scale=True)

bpy.ops.export_scene.fbx(
    filepath=dst,
    path_mode="COPY",
    embed_textures=True,
    add_leaf_bones=False,
    apply_scale_options="FBX_SCALE_ALL",
)
print(f"OK {src} -> {dst}: {tris_before} -> {tris_after} triangles, {HEIGHT_M} m tall")
