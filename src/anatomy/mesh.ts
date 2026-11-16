import {schematicHraConduction} from './hraConduction';
import {pathProgress} from './geometry';
import {atlasConductionPaths} from './pathCoordinates';
import { computeNormals, type Mesh, type Vector } from './render'

export const atlasUrl = '/anatomy/heart.glb'

export const myocardiumUrl='/anatomy/heart-hra.glb';

const tissue: Vector = [0.62, 0.22, 0.16]
export function colorFor(id: string): Vector {
  if (/node|bundle|purkinje|conduction|accessory/.test(id)) return [0.99, 0.71, 0.28]
  if (/valve/.test(id)) return [0.91, 0.74, 0.60]
  if (/cava|vein|pulmonary-trunk/.test(id)) return [0.40, 0.29, 0.40]
  if (/aorta|coronary|artery/.test(id)) return [0.76, 0.27, 0.19]
  if (/papillary/.test(id)) return [0.77, 0.36, 0.26]
  if (/left/.test(id)) return [0.70, 0.27, 0.20]
  return tissue
}

type Accessor = { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string; sparse?: unknown }
type BufferView = { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number; extensions?: unknown }
type Glb = {
  accessors: Accessor[]
  bufferViews: BufferView[]
  nodes: { name?: string; mesh?: number; children?: number[]; matrix?: number[]; translation?: Vector; rotation?: number[]; scale?: Vector }[]
  meshes: { name?: string; primitives: { attributes: { POSITION: number; NORMAL?: number }; indices?: number; mode?: number }[] }[]
  scenes: { nodes: number[] }[]
  scene?: number
}
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
function transformNode(node: Glb['nodes'][number]) {
  if (node.matrix) return node.matrix
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale ?? [1, 1, 1]
  const [tx, ty, tz] = node.translation ?? [0, 0, 0]
  return [
    sx * (1 - 2 * (y * y + z * z)), 2 * sx * (x * y + z * w), 2 * sx * (x * z - y * w), 0,
    2 * sy * (x * y - z * w), sy * (1 - 2 * (x * x + z * z)), 2 * sy * (y * z + x * w), 0,
    2 * sz * (x * z + y * w), 2 * sz * (y * z - x * w), sz * (1 - 2 * (x * x + y * y)), 0,
    tx, ty, tz, 1,
  ]
}
function multiply(a: number[], b: number[]) {
  return identity.map((_, index) => {
    const col = index & 12
    const row = index & 3
    return a[row] * b[col] + a[4 + row] * b[col + 1] + a[8 + row] * b[col + 2] + a[12 + row] * b[col + 3]
  })
}
function positionAt(matrix: number[], x: number, y: number, z: number): Vector {
  return [
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  ]
}

export function decodeAtlas(data: ArrayBuffer,source:'atlas'|'hra'='atlas'): Mesh[] {
  const bytes = new DataView(data)
  if (data.byteLength < 24 || bytes.getUint32(0, true) !== 0x46546c67 || bytes.getUint32(4, true) !== 2) {
    throw new Error('Invalid GLB')
  }
  const jsonLength = bytes.getUint32(12, true)
  const binStart = 28 + jsonLength
  if (binStart >= data.byteLength || bytes.getUint32(binStart - 4, true) !== 0x004e4942) throw new Error('Invalid binary chunk')
  const model = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, jsonLength))) as Glb
  function read(index: number) {
    const accessor = model.accessors[index]
    const view = model.bufferViews[accessor.bufferView]
    const componentSize = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType]
    if (accessor.sparse || view.extensions || view.buffer !== 0 || !componentSize) throw new Error('Unsupported GLB encoding')
    const components = accessor.type === 'VEC3' ? 3 : accessor.type === 'SCALAR' ? 1 : 0
    if (!components) throw new Error('Unsupported GLB accessor')
    const stride = view.byteStride ?? components * componentSize
    const start = binStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
    const output = accessor.componentType === 5126 ? new Float32Array(accessor.count * components) :
      accessor.componentType === 5125 ? new Uint32Array(accessor.count * components) : new Uint16Array(accessor.count * components)
    for (let i = 0; i < accessor.count; i++) {
      for (let j = 0; j < components; j++) {
        const p = start + i * stride + j * componentSize
        output[i * components + j] = accessor.componentType === 5126 ? bytes.getFloat32(p, true) :
          accessor.componentType === 5125 ? bytes.getUint32(p, true) :
          accessor.componentType === 5123 ? bytes.getUint16(p, true) : bytes.getUint8(p)
      }
    }
    return output
  }
  const meshes: Mesh[] = []
  const seen = new Set<number>()
  function visit(index: number, parent: number[]) {
    if (seen.has(index)) return
    seen.add(index)
    const node = model.nodes[index]
    const matrix = multiply(parent, transformNode(node))
    if (node.mesh !== undefined) {
      const object = model.meshes[node.mesh]
      const sourceId=node.name || object.name || 'heart'
      const hraNames:Record<string,string>={VH_M_mitral_valve:'mitral-valve',VH_M_tricuspid_valve:'tricuspid-valve',VH_M_aortic_valve:'aortic-valve',VH_M_pulmonary_valve:'pulmonary-valve',VH_M_papillary_muscle_of_heart_anterior:'left-papillary-anterior',VH_M_papillary_muscle_of_heart_anterolateral:'left-papillary-anterolateral',VH_M_papillary_muscle_of_heart_medial:'right-papillary-septal',VH_M_papillary_muscle_of_heart_posterior:'right-papillary-posterior',VH_M_papillary_muscle_of_heart_posteromedial:'left-papillary-posteromedial',VH_M_left_cardiac_atrium:'left-atrium',VH_M_right_cardiac_atrium:'right-atrium',VH_M_heart_right_ventricle:'right-ventricle',VH_M_interventricular_septum:'interventricular-septum',VH_M_heart_left_ventricle:'left-ventricle'};
      const id=source==='hra'?(hraNames[sourceId]??sourceId):sourceId
      for (const primitive of object.primitives) {
        if (primitive.mode !== undefined && primitive.mode !== 4) continue
        const positions = read(primitive.attributes.POSITION)
        if (!(positions instanceof Float32Array) || !positions.length || positions.length % 3 !== 0) continue
        for (let i = 0; i < positions.length; i += 3) positions.set(positionAt(matrix, positions[i], positions[i + 1], positions[i + 2]), i)
        const indices = primitive.indices === undefined ? Uint32Array.from({ length: positions.length / 3 }, (_, i) => i) : read(primitive.indices)
        if (indices instanceof Float32Array || indices.length % 3 !== 0) continue
        if (indices.some(value => value >= positions.length / 3)) throw new Error('Invalid mesh index')
        meshes.push({ id, positions, indices, normals: computeNormals(positions, indices), color: colorFor(id) })
      }
    }
    for (const child of node.children ?? []) visit(child, matrix)
  }
  for (const index of model.scenes[model.scene ?? 0].nodes) visit(index, identity)
  if (!meshes.length) throw new Error('No meshes in atlas')
  if(source==='hra')meshes.push(...schematicHraConduction());
  // Source paths and surfaces share coordinates before normalization.
  for(const mesh of meshes) {
    const paths=source==='atlas'?atlasConductionPaths[mesh.id]:undefined;if(!paths)continue;
    mesh.activation=Float32Array.from({length:mesh.positions.length/3},(_,i)=>pathProgress([mesh.positions[i*3],mesh.positions[i*3+1],mesh.positions[i*3+2]],paths));
  }
  normalizeMeshes(meshes)
  return meshes
}

export function normalizeMeshes(meshes: Mesh[]) {
  const min: Vector = [Infinity, Infinity, Infinity]
  const max: Vector = [-Infinity, -Infinity, -Infinity]
  for (const mesh of meshes) {
    for (let i = 0; i < mesh.positions.length; i++) {
      const axis = i % 3
      min[axis] = Math.min(min[axis], mesh.positions[i])
      max[axis] = Math.max(max[axis], mesh.positions[i])
    }
  }
  const span = Math.max(...max.map((value, axis) => value - min[axis]))
  if (!Number.isFinite(span) || span <= 0) throw new Error('Invalid anatomical bounds')
  // Rotate around the heart proper, not the long inferior vena cava.
  const core=meshes.filter(mesh=>/atrium|ventric|valve|papillary|wall/.test(mesh.id));
  const center = max.map((value, axis) => {
    let low=Infinity,high=-Infinity;
    for(const mesh of core)for(let i=axis;i<mesh.positions.length;i+=3){low=Math.min(low,mesh.positions[i]);high=Math.max(high,mesh.positions[i]);}
    return Number.isFinite(low)?(low+high)/2:(value+min[axis])/2;
  })
  for (const mesh of meshes) {
    for (let i = 0; i < mesh.positions.length; i++) {
      mesh.positions[i] = (mesh.positions[i] - center[i % 3]) * 2.3 / span
    }
  }
}
