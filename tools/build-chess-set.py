"""Builds public/set/staunton.gltf from Poly Haven's CC0 "Chess Set" (polyhaven.com/a/chess_set).

Keeps one mesh per piece type, rescaled so the king stands 1.62 board squares tall, and prints
each piece's front profile so eye and core positions can be chosen.

  python3 tools/build-chess-set.py <folder with chess_set_1k.gltf and chess_set.bin>
"""
import json, struct, sys, os

src = sys.argv[1]
doc = json.load(open(os.path.join(src, "chess_set_1k.gltf")))
blob = open(os.path.join(src, "chess_set.bin"), "rb").read()
KINDS = {"p": "piece_pawn_white_01", "r": "piece_rook_white_01", "n": "piece_knight_white_01", "b": "piece_bishop_white_01", "q": "piece_queen_white", "k": "piece_king_white"}
SCALE = 1.62 / 0.0951
SIZES = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
FORMATS = {5126: "f", 5123: "H", 5125: "I"}

def read(index):
    acc = doc["accessors"][index]
    view = doc["bufferViews"][acc["bufferView"]]
    n, fmt = SIZES[acc["type"]], FORMATS[acc["componentType"]]
    stride = view.get("byteStride") or struct.calcsize(fmt) * n
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    return [struct.unpack_from("<" + fmt * n, blob, start + i * stride) for i in range(acc["count"])], acc["type"]

out = bytearray()
views, accessors, meshes, nodes = [], [], [], []

def write(rows, kind, fmt, target=None, bounds=False):
    while len(out) % 4: out.append(0)
    start = len(out)
    for row in rows: out.extend(struct.pack("<" + fmt * len(row), *row))
    view = {"buffer": 0, "byteOffset": start, "byteLength": len(out) - start}
    if target: view["target"] = target
    views.append(view)
    acc = {"bufferView": len(views) - 1, "componentType": {"f": 5126, "H": 5123}[fmt], "count": len(rows), "type": kind}
    if bounds:
        acc["min"] = [min(r[i] for r in rows) for i in range(3)]
        acc["max"] = [max(r[i] for r in rows) for i in range(3)]
    accessors.append(acc)
    return len(accessors) - 1

for kind, name in KINDS.items():
    node = next(n for n in doc["nodes"] if n["name"] == name)
    prim = doc["meshes"][node["mesh"]]["primitives"][0]
    pos, _ = read(prim["attributes"]["POSITION"])
    pos = [tuple(c * SCALE for c in p) for p in pos]
    nor, _ = read(prim["attributes"]["NORMAL"])
    uv, _ = read(prim["attributes"]["TEXCOORD_0"])
    idx, _ = read(prim["indices"])
    attrs = {"POSITION": write(pos, "VEC3", "f", 34962, True), "NORMAL": write(nor, "VEC3", "f", 34962), "TEXCOORD_0": write(uv, "VEC2", "f", 34962)}
    meshes.append({"name": kind, "primitives": [{"attributes": attrs, "indices": write(idx, "SCALAR", "H", 34963)}]})
    nodes.append({"name": kind, "mesh": len(meshes) - 1})
    height = max(p[1] for p in pos)
    print(f"{kind}: height {height:.2f}, {len(idx) // 3} triangles")
    for step in range(int(height / 0.06) + 1):
        y = step * 0.06
        band = [p for p in pos if abs(p[1] - y) < 0.04]
        front = max((p[2] for p in band if abs(p[0]) < 0.06), default=0)
        side = max((p[0] for p in band), default=0)
        print(f"   y {y:.2f}  front z {front:.3f}  side x {side:.3f}")

gltf = {"asset": {"version": "2.0", "generator": "tools/build-chess-set.py", "copyright": "Chess Set by Riley Queen, Poly Haven, CC0"},
        "scene": 0, "scenes": [{"nodes": list(range(len(nodes)))}], "nodes": nodes, "meshes": meshes,
        "accessors": accessors, "bufferViews": views, "buffers": [{"uri": "staunton.bin", "byteLength": len(out)}]}
json.dump(gltf, open("public/set/staunton.gltf", "w"))
open("public/set/staunton.bin", "wb").write(out)
print("wrote public/set/staunton.gltf,", len(out), "bytes of geometry")
