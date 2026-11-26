#!/usr/bin/env node
/**
 * Bakes the head models of assets/heads-src (STL, 3MF, OBJ, PLY, glTF/GLB: see assets/heads.config.json) into signed
 * distance grids the shaders can sample: public/heads/<id>.sdf.gz.
 *
 *   node scripts/bake-heads.mjs                 every head
 *   node scripts/bake-heads.mjs tigre loup      some heads
 *   node scripts/bake-heads.mjs --quick tigre   coarse grid + preview only, to tune rot/chin/offset in the config
 *
 * Each head is turned into the frame of the sculpted human head (sdHead in src/scenes/art/lib.glsl.ts): y up,
 * face towards +z, top of the skull at y = TOP and chin at y = CHIN, all heads in the same box. A preview
 * (front, side, three-quarter, ray-marched on the grid itself) is written next to the output, or to --preview-dir.
 *
 * File format (little endian): "SDF1", nx, ny, nz (uint16), pad (uint16), box min xyz, box max xyz (float32),
 * then nx*ny*nz half floats, x fastest. Texel (i, j, k) holds the distance at min + (i + .5, j + .5, k + .5) * size / n.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, gzipSync } from "node:zlib";
import * as THREE from "three";
import { unzipSync } from "three/examples/jsm/libs/fflate.module.js";
import { MeshBVH } from "three-mesh-bvh";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = JSON.parse(readFileSync(join(ROOT, "assets/heads.config.json"), "utf8"));
const SRC = join(ROOT, "assets/heads-src");
const OUT = join(ROOT, "public/heads");

const TOP = 0.78;
const CHIN = -0.6;
/** Exact distances are computed in this band around the surface; further out, a coarse grid is interpolated. */
const BAND = 0.05;
const COARSE = 4;

const args = process.argv.slice(2);
const quick = args.includes("--quick");
const pdIdx = args.indexOf("--preview-dir");
const previewDir = pdIdx >= 0 ? args[pdIdx + 1] : SRC;
const ids = args.filter((a, i) => !a.startsWith("--") && (pdIdx < 0 || i !== pdIdx + 1));
const todo = ids.length ? ids : Object.keys(CONFIG.heads);

// ---------------------------------------------------------------- mesh loading

function readSTL(buf) {
  const n = buf.readUInt32LE(80);
  if (84 + n * 50 === buf.length) {
    const pos = new Float32Array(n * 9);
    for (let t = 0; t < n; t++) {
      const o = 84 + t * 50 + 12;
      for (let k = 0; k < 9; k++) pos[t * 9 + k] = buf.readFloatLE(o + k * 4);
    }
    return pos;
  }
  const v = [...buf.toString("utf8").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].flatMap((m) => [+m[1], +m[2], +m[3]]);
  return new Float32Array(v);
}

function read3MF(buf, objectId) {
  const files = unzipSync(new Uint8Array(buf));
  const name = Object.keys(files).find((f) => f.endsWith(".model"));
  const xml = new TextDecoder().decode(files[name]);
  const objects = [...xml.matchAll(/<object\b[^>]*\bid="(\d+)"[^>]*>([\s\S]*?)<\/object>/g)];
  const obj = objects.find((o) => o[1] === String(objectId ?? objects[0][1]));
  const verts = [...obj[2].matchAll(/<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"/g)].map((m) => [+m[1], +m[2], +m[3]]);
  const tris = [...obj[2].matchAll(/<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"/g)];
  const pos = new Float32Array(tris.length * 9);
  tris.forEach((m, t) => {
    for (let k = 0; k < 3; k++) pos.set(verts[+m[k + 1]], t * 9 + k * 3);
  });
  return pos;
}

/** Wavefront OBJ: its vertices and faces (polygons as fans), "v/vt/vn" and negative (relative) indices. */
function readOBJ(buf) {
  const v = [];
  const out = [];
  for (const line of buf.toString("utf8").split("\n")) {
    if (line.startsWith("v ")) {
      const [, x, y, z] = line.trim().split(/\s+/);
      v.push(+x, +y, +z);
    } else if (line.startsWith("f ")) {
      const ids = line
        .trim()
        .split(/\s+/)
        .slice(1)
        .map((t) => {
          const i = parseInt(t, 10);
          return i < 0 ? v.length / 3 + i : i - 1;
        });
      for (let k = 1; k + 1 < ids.length; k++)
        for (const i of [ids[0], ids[k], ids[k + 1]]) out.push(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]);
    }
  }
  return new Float32Array(out);
}

/** PLY (ascii or binary): the x, y, z of its vertices and its faces (polygons as fans); other properties skipped. */
function readPLY(buf) {
  const end = buf.indexOf("end_header");
  const header = buf.subarray(0, end).toString("latin1").split(/\r?\n/);
  let body = end + "end_header".length;
  while (buf[body] === 0x0d || buf[body] === 0x0a) {
    body++;
    if (buf[body - 1] === 0x0a) break;
  }
  const format = header.find((l) => l.startsWith("format")).split(/\s+/)[1];
  const elements = [];
  for (const l of header) {
    const t = l.trim().split(/\s+/);
    if (t[0] === "element") elements.push({ name: t[1], count: +t[2], props: [] });
    else if (t[0] === "property") elements[elements.length - 1].props.push(t[1] === "list" ? { list: true, count: t[2], type: t[3], name: t[4] } : { type: t[1], name: t[2] });
  }
  const SIZE = { char: 1, uchar: 1, int8: 1, uint8: 1, short: 2, ushort: 2, int16: 2, uint16: 2, int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
  const le = format === "binary_little_endian";
  let o = body;
  const read = (type) => {
    const n = SIZE[type];
    let x;
    if (type === "float" || type === "float32") x = le ? buf.readFloatLE(o) : buf.readFloatBE(o);
    else if (type === "double" || type === "float64") x = le ? buf.readDoubleLE(o) : buf.readDoubleBE(o);
    else if (n === 1) x = type.startsWith("u") ? buf.readUInt8(o) : buf.readInt8(o);
    else if (n === 2) x = type.startsWith("u") ? (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o)) : le ? buf.readInt16LE(o) : buf.readInt16BE(o);
    else x = type.startsWith("u") ? (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o)) : le ? buf.readInt32LE(o) : buf.readInt32BE(o);
    o += n;
    return x;
  };
  let tokens = null;
  let ti = 0;
  if (format === "ascii") tokens = buf.subarray(body).toString("latin1").trim().split(/\s+/);
  const next = (type) => (tokens ? +tokens[ti++] : read(type));
  const verts = [];
  const out = [];
  for (const el of elements) {
    for (let e = 0; e < el.count; e++) {
      const rec = {};
      for (const pr of el.props) {
        if (pr.list) {
          const n = next(pr.count);
          const ids = [];
          for (let k = 0; k < n; k++) ids.push(next(pr.type));
          rec[pr.name] = ids;
        } else rec[pr.name] = next(pr.type);
      }
      if (el.name === "vertex") verts.push(rec.x, rec.y, rec.z);
      else if (el.name === "face") {
        const ids = rec.vertex_indices ?? rec.vertex_index;
        for (let k = 1; k + 1 < ids.length; k++)
          for (const i of [ids[0], ids[k], ids[k + 1]]) out.push(verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]);
      }
    }
  }
  return new Float32Array(out);
}

/**
 * glTF (.gltf with its buffers beside it, or .glb): the triangles of every mesh of its scene, placed by their nodes.
 * Geometry only; a compressed file (Draco, meshopt) has to be decompressed first (gltf-transform).
 */
function readGLTF(buf, file) {
  let json;
  let bin = null;
  if (buf.readUInt32LE(0) === 0x46546c67) {
    let o = 12;
    while (o < buf.length) {
      const len = buf.readUInt32LE(o);
      const type = buf.readUInt32LE(o + 4);
      const chunk = buf.subarray(o + 8, o + 8 + len);
      if (type === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8"));
      else if (type === 0x004e4942) bin = chunk;
      o += 8 + len;
    }
  } else json = JSON.parse(buf.toString("utf8"));
  const used = [...(json.extensionsUsed ?? [])].filter((e) => /draco|meshopt|quantization/i.test(e));
  if (used.length) throw new Error(`${file}: ${used.join(", ")} — decompress it first (npx @gltf-transform/cli copy)`);
  const buffers = (json.buffers ?? []).map((b) => {
    if (!b.uri) return bin;
    if (b.uri.startsWith("data:")) return Buffer.from(b.uri.split(",")[1], "base64");
    return readFileSync(join(SRC, dirname(file), decodeURIComponent(b.uri)));
  });
  const accessor = (i) => {
    const a = json.accessors[i];
    const bv = json.bufferViews[a.bufferView];
    const b = buffers[bv.buffer];
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const size = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
    const stride = bv.byteStride ?? n * size;
    const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const get = (o) =>
      a.componentType === 5126 ? b.readFloatLE(o) : a.componentType === 5125 ? b.readUInt32LE(o) : a.componentType === 5123 ? b.readUInt16LE(o) : b.readUInt8(o);
    const out = new Float64Array(a.count * n);
    for (let e = 0; e < a.count; e++) for (let c = 0; c < n; c++) out[e * n + c] = get(base + e * stride + c * size);
    return out;
  };
  const out = [];
  const v = new THREE.Vector3();
  const visit = (ni, parent) => {
    const node = json.nodes[ni];
    const m = new THREE.Matrix4();
    if (node.matrix) m.fromArray(node.matrix);
    else
      m.compose(
        new THREE.Vector3(...(node.translation ?? [0, 0, 0])),
        new THREE.Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
        new THREE.Vector3(...(node.scale ?? [1, 1, 1])),
      );
    m.premultiply(parent);
    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives) {
        if ((prim.mode ?? 4) !== 4) continue;
        const pos = accessor(prim.attributes.POSITION);
        const idx = prim.indices !== undefined ? accessor(prim.indices) : Array.from({ length: pos.length / 3 }, (_, i) => i);
        for (const i of idx) {
          v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(m);
          out.push(v.x, v.y, v.z);
        }
      }
    }
    for (const c of node.children ?? []) visit(c, m);
  };
  const scene = json.scenes?.[json.scene ?? 0];
  for (const ni of scene ? scene.nodes : json.nodes.map((_, i) => i)) visit(ni, new THREE.Matrix4());
  return new Float32Array(out);
}

function loadMesh(cfg) {
  const buf = readFileSync(join(SRC, cfg.file));
  const ext = cfg.file.toLowerCase().split(".").pop();
  if (ext === "3mf") return read3MF(buf, cfg.object);
  if (ext === "obj") return readOBJ(buf);
  if (ext === "ply") return readPLY(buf);
  if (ext === "glb" || ext === "gltf") return readGLTF(buf, cfg.file);
  return readSTL(buf);
}

/** Rotate, then scale and move so the head lands in the frame of the sculpted head. */
function normalise(pos, cfg) {
  const r = (cfg.rot ?? [0, 0, 0]).map((d) => (d * Math.PI) / 180);
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(r[0], r[1], r[2], "XYZ"));
  const v = new THREE.Vector3();
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    v.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(m);
    pos[i] = v.x;
    pos[i + 1] = v.y;
    pos[i + 2] = v.z;
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
  }
  // top of the skull and chin: fractions of the model's height, from its top (a crown may rise above the skull)
  const h = maxY - minY;
  const topY = maxY - (cfg.top ?? 0) * h;
  const chinY = maxY - (cfg.chin ?? 0.5) * h;
  const s = ((TOP - CHIN) / (topY - chinY)) * (cfg.scale ?? 1);
  const b = new THREE.Box3();
  for (let i = 0; i < pos.length; i += 3) if (pos[i + 1] >= chinY) b.expandByPoint(v.set(pos[i], pos[i + 1], pos[i + 2]));
  const c = b.getCenter(new THREE.Vector3());
  const [dx, dy, dz] = cfg.offset ?? [0, 0, 0];
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = (pos[i] - c.x) * s + dx;
    pos[i + 1] = (pos[i + 1] - topY) * s + TOP + dy;
    pos[i + 2] = (pos[i + 2] - c.z) * s + dz;
  }
  const size = b.getSize(new THREE.Vector3()).multiplyScalar(s);
  return { scale: s, headSize: size };
}

// ---------------------------------------------------------------- distance grid

function bake(pos, voxel, cfg) {
  const box = CONFIG.box;
  const n = [0, 1, 2].map((a) => 2 * Math.round((box.max[a] - box.min[a]) / voxel / 2));
  const cell = [0, 1, 2].map((a) => (box.max[a] - box.min[a]) / n[a]);
  const [nx, ny, nz] = n;
  const N = nx * ny * nz;
  const at = (i, j, k) => i + nx * (j + ny * k);
  const centre = (a, i) => box.min[a] + (i + 0.5) * cell[a];

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const bvh = new MeshBVH(geom);
  const mb = new THREE.Box3().setFromBufferAttribute(geom.attributes.position);

  // Inside or outside: count crossings along rays through every column, on the 3 axes, and take the majority.
  const votes = new Uint8Array(N);
  const ray = new THREE.Ray();
  const axes = [
    [0, 1, 2],
    [1, 0, 2],
    [2, 0, 1],
  ];
  for (const [a, b, c] of axes) {
    const dir = new THREE.Vector3();
    dir.setComponent(a, 1);
    for (let jb = 0; jb < n[b]; jb++) {
      for (let jc = 0; jc < n[c]; jc++) {
        const o = new THREE.Vector3();
        // a tiny jitter keeps rays off shared edges
        o.setComponent(a, mb.min.getComponent(a) - 1);
        o.setComponent(b, centre(b, jb) + 1.3e-5);
        o.setComponent(c, centre(c, jc) - 0.7e-5);
        ray.set(o, dir);
        const hits = bvh.raycast(ray, THREE.DoubleSide).map((h) => h.point.getComponent(a)).sort((x, y) => x - y);
        let h = 0;
        for (let ia = 0; ia < n[a]; ia++) {
          const x = centre(a, ia);
          while (h < hits.length && hits[h] < x) h++;
          if (h % 2 === 1) {
            const idx = [0, 0, 0];
            idx[a] = ia;
            idx[b] = jb;
            idx[c] = jc;
            votes[at(idx[0], idx[1], idx[2])]++;
          }
        }
      }
    }
  }

  // Printable busts are often hollow, open at the bottom (or at the back for wall trophies): everything the
  // outside cannot reach from the top and the sides of the box (nor from the sealed faces) is solid.
  const solid = new Uint8Array(N);
  {
    const reached = new Uint8Array(N);
    const queue = new Int32Array(N);
    let qh = 0;
    let qt = 0;
    const seal = new Set(["bottom", ...(cfg.seal ?? [])]);
    const push = (id) => {
      if (!reached[id] && votes[id] < 2) {
        reached[id] = 1;
        queue[qt++] = id;
      }
    };
    for (let k = 0; k < nz; k++)
      for (let j = 0; j < ny; j++)
        for (let i = 0; i < nx; i++) {
          const face =
            (i === 0 && !seal.has("left")) ||
            (i === nx - 1 && !seal.has("right")) ||
            (j === 0 && !seal.has("bottom")) ||
            (j === ny - 1 && !seal.has("top")) ||
            (k === 0 && !seal.has("back")) ||
            (k === nz - 1 && !seal.has("front"));
          if (face) push(at(i, j, k));
        }
    while (qh < qt) {
      const id = queue[qh++];
      const i = id % nx;
      const j = Math.floor(id / nx) % ny;
      const k = Math.floor(id / (nx * ny));
      if (i > 0) push(id - 1);
      if (i < nx - 1) push(id + 1);
      if (j > 0) push(id - nx);
      if (j < ny - 1) push(id + nx);
      if (k > 0) push(id - nx * ny);
      if (k < nz - 1) push(id + nx * ny);
    }
    for (let id = 0; id < N; id++) solid[id] = reached[id] ? 0 : 1;
  }
  // Distance (in world units) from each voxel to the nearest voxel of the other kind, by a separable EDT.
  const edt = (zeroWhere) => {
    const INF = 1e20;
    const f = new Float64Array(N);
    for (let id = 0; id < N; id++) f[id] = zeroWhere(id) ? 0 : INF;
    const L = Math.max(nx, ny, nz);
    const v = new Int32Array(L);
    const fv = new Float64Array(L);
    const z = new Float64Array(L + 1);
    // lower envelope of the parabolas f(q) + (s (p - q))², skipping the empty samples
    const pass = (len, s, get, put) => {
      const s2 = s * s;
      let kk = -1;
      for (let q = 0; q < len; q++) {
        const fq = get(q);
        if (fq >= INF) continue;
        let x = -INF;
        while (kk >= 0) {
          const r = v[kk];
          x = (fq + s2 * q * q - (fv[kk] + s2 * r * r)) / (2 * s2 * (q - r));
          if (x <= z[kk]) kk--;
          else break;
        }
        if (kk < 0) x = -INF;
        kk++;
        v[kk] = q;
        fv[kk] = fq;
        z[kk] = x;
      }
      if (kk < 0) return;
      z[kk + 1] = INF;
      let m = 0;
      for (let q = 0; q < len; q++) {
        while (z[m + 1] < q) m++;
        put(q, s2 * (q - v[m]) * (q - v[m]) + fv[m]);
      }
    };
    for (let k = 0; k < nz; k++)
      for (let j = 0; j < ny; j++)
        pass(nx, cell[0], (q) => f[at(q, j, k)], (q, x) => (f[at(q, j, k)] = x));
    for (let k = 0; k < nz; k++)
      for (let i = 0; i < nx; i++)
        pass(ny, cell[1], (q) => f[at(i, q, k)], (q, x) => (f[at(i, q, k)] = x));
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++)
        pass(nz, cell[2], (q) => f[at(i, j, q)], (q, x) => (f[at(i, j, q)] = x));
    return f.map(Math.sqrt);
  };
  const toOutside = edt((id) => !solid[id]);
  const toInside = edt((id) => solid[id]);
  const vox = Math.min(...cell);

  // Coarse unsigned distances everywhere, exact ones in a band around the surface.
  const cn = n.map((v) => Math.floor((v - 1) / COARSE) + 2);
  const coarse = new Float32Array(cn[0] * cn[1] * cn[2]);
  const p = new THREE.Vector3();
  const target = {};
  for (let k = 0; k < cn[2]; k++)
    for (let j = 0; j < cn[1]; j++)
      for (let i = 0; i < cn[0]; i++) {
        p.set(centre(0, i * COARSE), centre(1, j * COARSE), centre(2, k * COARSE));
        coarse[i + cn[0] * (j + cn[1] * k)] = bvh.closestPointToPoint(p, target).distance;
      }
  const coarseAt = (i, j, k) => {
    const fi = i / COARSE;
    const fj = j / COARSE;
    const fk = k / COARSE;
    const i0 = Math.min(Math.floor(fi), cn[0] - 2);
    const j0 = Math.min(Math.floor(fj), cn[1] - 2);
    const k0 = Math.min(Math.floor(fk), cn[2] - 2);
    const u = fi - i0;
    const v = fj - j0;
    const w = fk - k0;
    const g = (a, b, c) => coarse[a + cn[0] * (b + cn[1] * c)];
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(g(i0, j0, k0), g(i0 + 1, j0, k0), u), l(g(i0, j0 + 1, k0), g(i0 + 1, j0 + 1, k0), u), v),
      l(l(g(i0, j0, k0 + 1), g(i0 + 1, j0, k0 + 1), u), l(g(i0, j0 + 1, k0 + 1), g(i0 + 1, j0 + 1, k0 + 1), u), v),
      w,
    );
  };

  const sdf = new Float32Array(N);
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        p.set(centre(0, i), centre(1, j), centre(2, k));
        const hit = bvh.closestPointToPoint(p, target, 0, BAND);
        const m = hit ? hit.distance : Math.max(BAND, coarseAt(i, j, k));
        const id = at(i, j, k);
        // the mesh distance is exact near the outer surface; the EDT takes over where it is not (filled cavities, seals)
        sdf[id] = solid[id] ? -Math.min(toOutside[id], Math.max(m, toOutside[id] - vox)) : Math.min(m, toInside[id]);
      }
  // The model is cut flat at the bottom of the box (the shaders add the column below), or higher (cfg.cut, in the
  // frame of the head): under the neck, above a stand.
  const cutY = Math.max(box.min[1] + 1.5 * cell[1], cfg.cut ?? -Infinity);
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const id = at(i, j, k);
        sdf[id] = Math.max(sdf[id], cutY - centre(1, j));
      }
  return { n, cell, sdf, insideCount: solid.reduce((s, v) => s + v, 0) };
}

function encode(grid) {
  const { n, sdf } = grid;
  const head = Buffer.alloc(36);
  head.write("SDF1", 0, "ascii");
  head.writeUInt16LE(n[0], 4);
  head.writeUInt16LE(n[1], 6);
  head.writeUInt16LE(n[2], 8);
  for (let a = 0; a < 3; a++) {
    head.writeFloatLE(CONFIG.box.min[a], 12 + a * 4);
    head.writeFloatLE(CONFIG.box.max[a], 24 + a * 4);
  }
  // Full precision near the surface; further out, a few mantissa bits are enough (truncated towards zero so
  // distances never grow) and the file compresses far better.
  const half = new Uint16Array(sdf.length);
  for (let i = 0; i < sdf.length; i++) {
    const h = THREE.DataUtils.toHalfFloat(sdf[i]);
    const a = Math.abs(sdf[i]);
    half[i] = a < 0.1 ? h : h & (a < 0.4 ? 0xfffc : 0xfff0);
  }
  return gzipSync(Buffer.concat([head, Buffer.from(half.buffer)]), { level: 9 });
}

// ---------------------------------------------------------------- preview (ray-marched on the grid)

function sampler(grid) {
  const { n, cell, sdf } = grid;
  const box = CONFIG.box;
  return (x, y, z) => {
    const f = [x, y, z].map((v, a) => (v - box.min[a]) / cell[a] - 0.5);
    const c = f.map((v, a) => Math.min(Math.max(v, 0), n[a] - 1.001));
    const i0 = c.map(Math.floor);
    const t = c.map((v, a) => v - i0[a]);
    const g = (i, j, k) => sdf[i + n[0] * (j + n[1] * k)];
    const l = (a, b, s) => a + (b - a) * s;
    const [i, j, k] = i0;
    const [u, v, w] = t;
    const d = l(
      l(l(g(i, j, k), g(i + 1, j, k), u), l(g(i, j + 1, k), g(i + 1, j + 1, k), u), v),
      l(l(g(i, j, k + 1), g(i + 1, j, k + 1), u), l(g(i, j + 1, k + 1), g(i + 1, j + 1, k + 1), u), v),
      w,
    );
    const out = Math.hypot(...f.map((v, a) => (v - c[a]) * cell[a]));
    return d + out;
  };
}

function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  const crcTable = new Int32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  const crc = (b) => {
    let c = -1;
    for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Three views (front, side, three-quarter), lit from the upper left, with the box and the chin line. */
function preview(grid, file) {
  const S = 220;
  const views = [0, Math.PI / 2, Math.PI / 4];
  const W = S * views.length;
  const rgb = Buffer.alloc(W * S * 3);
  const d = sampler(grid);
  const box = CONFIG.box;
  const L = new THREE.Vector3(-0.5, 0.7, 0.6).normalize();
  views.forEach((az, vi) => {
    const fwd = new THREE.Vector3(-Math.sin(az), 0, -Math.cos(az));
    const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az));
    for (let py = 0; py < S; py++)
      for (let px = 0; px < S; px++) {
        const u = ((px + 0.5) / S - 0.5) * 2;
        const v = (0.5 - (py + 0.5) / S) * 2;
        const ro = new THREE.Vector3().addScaledVector(right, u).add(new THREE.Vector3(0, v, 0)).addScaledVector(fwd, -2);
        let t = 0;
        let hit = false;
        for (let s = 0; s < 160 && t < 4; s++) {
          const q = ro.clone().addScaledVector(fwd, t);
          const dd = d(q.x, q.y, q.z);
          if (dd < 0.002) {
            hit = true;
            break;
          }
          t += Math.max(dd * 0.9, 0.002);
        }
        let c = [24, 26, 32];
        if (Math.abs(v - CHIN) < 0.004 || Math.abs(v - TOP) < 0.004) c = [90, 60, 60];
        if (Math.abs(v - box.min[1]) < 0.004) c = [60, 60, 110];
        if (hit) {
          const q = ro.clone().addScaledVector(fwd, t);
          const e = 0.01;
          const nrm = new THREE.Vector3(
            d(q.x + e, q.y, q.z) - d(q.x - e, q.y, q.z),
            d(q.x, q.y + e, q.z) - d(q.x, q.y - e, q.z),
            d(q.x, q.y, q.z + e) - d(q.x, q.y, q.z - e),
          ).normalize();
          const l = 0.2 + 0.8 * Math.max(0, nrm.dot(L));
          c = [230 * l, 215 * l, 195 * l];
        }
        const o = (py * W + vi * S + px) * 3;
        rgb[o] = c[0];
        rgb[o + 1] = c[1];
        rgb[o + 2] = c[2];
      }
  });
  writeFileSync(file, png(W, S, rgb));
}

// ---------------------------------------------------------------- main

mkdirSync(OUT, { recursive: true });
mkdirSync(previewDir, { recursive: true });
for (const id of todo) {
  const cfg = CONFIG.heads[id];
  if (!cfg) {
    console.error(`unknown head ${id}`);
    continue;
  }
  const t0 = Date.now();
  const pos = loadMesh(cfg);
  const { scale, headSize } = normalise(pos, cfg);
  const voxel = quick ? 0.03 : CONFIG.voxel;
  const grid = bake(pos, voxel, cfg);
  const fmt = (v) => v.toArray().map((x) => x.toFixed(2)).join(" × ");
  console.log(
    `${id}: ${pos.length / 9} triangles, head ${fmt(headSize)}, scale ${scale.toPrecision(3)}, grid ${grid.n.join("×")}, ` +
      `${((100 * grid.insideCount) / grid.sdf.length).toFixed(1)}% inside, ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  );
  preview(grid, join(previewDir, `${id}${quick ? "-quick" : ""}.png`));
  if (!quick) {
    const data = encode(grid);
    writeFileSync(join(OUT, `${id}.sdf.gz`), data);
    console.log(`  → public/heads/${id}.sdf.gz ${(data.length / 1e6).toFixed(2)} Mo`);
  }
}
