#!/usr/bin/env python3
"""Dump the world bounding box (size/center) of each mesh in a GLB and
suggest a role from PlayfieldTrimeshBuilder thresholds.

Usage: python3 scripts/dump-glb-meshes.py [path.glb]
Default: apps/playfield/public/playfield/Strangerthings.glb

Dev tool to prepare a conventioned GLB re-export (cf. docs/MAP_AUTHORING.md).
Uses only the min/max of POSITION accessors (no buffer decode) transformed by
the node's world matrix. Pure Python, no dependency.
"""
import json
import struct
import sys

RAIL_MIN_PHYS_DIM = 0.025  # 25 mm — rail vs decor threshold (PlayfieldTrimeshBuilder)

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


# Prefix conventions — mirror of MeshRoleResolver (TS).
PREFIXES = ["vis_", "floor_", "wall_", "flipper_", "bumper_",
            "slingshot_", "target_", "sensor_", "lane_"]


def normalize(name):
    out = name.lower()
    for ch in (" ", ".", "-"):
        out = out.replace(ch, "_")
    return out


def resolve_ancestry(i):
    """Walk up the hierarchy (mesh → root), first prefix wins. Like
    MeshRoleResolver.resolveFromAncestry."""
    cur = i
    while cur is not None:
        norm = normalize(node_name(cur))
        for p in PREFIXES:
            if norm.startswith(p):
                return p.rstrip("_"), norm[len(p):]
        cur = parent.get(cur)
    return None, None


def chain(i):
    out = []
    cur = i
    while cur is not None:
        out.append(node_name(cur))
        cur = parent.get(cur)
    return " < ".join(out)


rows = []
unresolved = []
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
    role, rid = resolve_ancestry(i)
    rows.append((node_name(i), size, role, rid))
    if role is None:
        unresolved.append((node_name(i), chain(i)))

print(f"GLB: {path}")
print(f"{'mesh':<18}{'taille (mm)':<20}rôle résolu (via hiérarchie)")
print("-" * 80)
for name, size, role, rid in rows:
    sz = f"{size[0]*1000:.0f}x{size[1]*1000:.0f}x{size[2]*1000:.0f}"
    label = f"{role}_{rid}" if role else "⚠ NON RÉSOLU (aucune physique + warn)"
    print(f"{name:<18}{sz:<20}{label}")

print(f"\n{len(rows)} meshes — {len(unresolved)} non résolus.")
if unresolved:
    print("Meshes sans rôle (ni préfixe ni vis_) → ignorés côté physique :")
    for name, ch in unresolved:
        print(f"  • {ch}")
