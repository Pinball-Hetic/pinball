#!/usr/bin/env python3
"""Dump la bounding box monde (taille/centre) de chaque mesh d'un GLB et
suggère un rôle selon les seuils de PlayfieldTrimeshBuilder.

Usage: python3 scripts/dump-glb-meshes.py [chemin.glb]
Défaut: apps/playfield/public/playfield/Strangerthings.glb

Outil de dev pour préparer un ré-export GLB conventionné (cf.
docs/MAP_AUTHORING.md). N'utilise que les min/max des accessors POSITION
(pas de décodage du buffer) transformés par la matrice monde du nœud.
Python pur, aucune dépendance.
"""
import json
import struct
import sys

RAIL_MIN_PHYS_DIM = 0.025  # 25 mm — seuil rail vs décor (PlayfieldTrimeshBuilder)

path = sys.argv[1] if len(sys.argv) > 1 else "apps/playfield/public/playfield/Strangerthings.glb"

with open(path, "rb") as f:
    data = f.read()

struct.unpack("<III", data[:12])  # magic, version, length
off = 12
clen, _ = struct.unpack("<II", data[off:off + 8])
off += 8
gltf = json.loads(data[off:off + clen])

nodes = gltf.get("nodes", [])
meshes = gltf.get("meshes", [])
accessors = gltf.get("accessors", [])


def ident():
    return [[1.0 if r == c else 0.0 for c in range(4)] for r in range(4)]


def matmul(a, b):
    return [[sum(a[r][k] * b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]


def transform(m, p):
    x, y, z = p
    return [
        m[0][0] * x + m[0][1] * y + m[0][2] * z + m[0][3],
        m[1][0] * x + m[1][1] * y + m[1][2] * z + m[1][3],
        m[2][0] * x + m[2][1] * y + m[2][2] * z + m[2][3],
    ]


def local_matrix(node):
    if "matrix" in node:
        m = node["matrix"]  # column-major → transpose
        return [[m[c * 4 + r] for c in range(4)] for r in range(4)]
    t = node.get("translation", [0, 0, 0])
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    s = node.get("scale", [1, 1, 1])
    T = ident(); T[0][3], T[1][3], T[2][3] = t
    R = [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w),     2 * (x * z + y * w),     0],
        [2 * (x * y + z * w),     1 - 2 * (x * x + z * z), 2 * (y * z - x * w),     0],
        [2 * (x * z - y * w),     2 * (y * z + x * w),     1 - 2 * (x * x + y * y), 0],
        [0, 0, 0, 1],
    ]
    S = ident(); S[0][0], S[1][1], S[2][2] = s
    return matmul(matmul(T, R), S)


parent = {}
for i, n in enumerate(nodes):
    for c in n.get("children", []):
        parent[c] = i

world = [None] * len(nodes)


def world_matrix(i):
    if world[i] is not None:
        return world[i]
    lm = local_matrix(nodes[i])
    world[i] = lm if i not in parent else matmul(world_matrix(parent[i]), lm)
    return world[i]


def node_name(i):
    return nodes[i].get("name", f"node_{i}")


rows = []
for i, n in enumerate(nodes):
    if "mesh" not in n:
        continue
    wm = world_matrix(i)
    mins = [float("inf")] * 3
    maxs = [float("-inf")] * 3
    found = False
    for prim in meshes[n["mesh"]].get("primitives", []):
        ai = prim.get("attributes", {}).get("POSITION")
        if ai is None:
            continue
        acc = accessors[ai]
        if "min" not in acc or "max" not in acc:
            continue
        found = True
        lo, hi = acc["min"], acc["max"]
        for cx in (lo[0], hi[0]):
            for cy in (lo[1], hi[1]):
                for cz in (lo[2], hi[2]):
                    p = transform(wm, (cx, cy, cz))
                    for k in range(3):
                        mins[k] = min(mins[k], p[k])
                        maxs[k] = max(maxs[k], p[k])
    if not found:
        continue
    size = [maxs[k] - mins[k] for k in range(3)]
    center = [(maxs[k] + mins[k]) / 2 for k in range(3)]
    dims = sorted(size)
    pid = parent.get(i)
    pname = node_name(pid) if pid is not None else "-"
    if dims[0] < RAIL_MIN_PHYS_DIM and dims[1] < RAIL_MIN_PHYS_DIM:
        role = "vis_   (décor < 25mm)"
    else:
        role = "wall_  (structurel)"
    rows.append((node_name(i), pname, size, center, role))

print(f"GLB: {path}")
print(f"{'mesh':<16}{'parent':<16}{'taille (mm)':<20}{'centre (m)':<26}rôle suggéré")
print("-" * 100)
for name, pname, size, center, role in rows:
    sz = f"{size[0]*1000:.0f}x{size[1]*1000:.0f}x{size[2]*1000:.0f}"
    ct = f"{center[0]:+.3f},{center[1]:+.3f},{center[2]:+.3f}"
    print(f"{name:<16}{pname:<16}{sz:<20}{ct:<26}{role}")

print(f"\n{len(rows)} meshes. Seuil rail/décor = {RAIL_MIN_PHYS_DIM*1000:.0f}mm.")
print("Note: Mesh_0 = sol (physique analytique, pas trimesh), Mesh_1 = mur single-sided.")
