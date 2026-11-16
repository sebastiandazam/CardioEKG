import { cardiacReference } from './offlineMesh'
import { colorFor, normalizeMeshes } from './mesh'
import { computeNormals, type Mesh, type Vector } from './render'

const regions = [
  'ventricular-wall',
  'left-atrium',
  'left-ventricle',
  'right-atrium',
  'right-ventricle',
  'aorta',
  'pulmonary-trunk',
] as const

// Source coordinates are normalized LPS. Convert to Y-up with anterior +Z.
function orient([x, y, z]: Vector): Vector {
  return [x, z, -y]
}

function direction(vector: Vector): Vector {
  const length = Math.hypot(...vector) || 1
  return [vector[0] / length, vector[1] / length, vector[2] / length]
}

function cross([x, y, z]: Vector, [a, b, c]: Vector): Vector {
  return [y * c - z * b, z * a - x * c, x * b - y * a]
}

function tube(id: string, points: Vector[], radius: number): Mesh {
  const sides = 10
  const positions: number[] = []
  const indices: number[] = []
  points.forEach((point, index) => {
    const before = points[Math.max(0, index - 1)]
    const after = points[Math.min(points.length - 1, index + 1)]
    const tangent = direction([after[0] - before[0], after[1] - before[1], after[2] - before[2]])
    const first = direction(cross(tangent, Math.abs(tangent[2]) < 0.8 ? [0, 0, 1] : [0, 1, 0]))
    const second = cross(tangent, first)
    for (let side = 0; side < sides; side++) {
      const angle = 2 * Math.PI * side / sides
      const ring = first.map((value, axis) => point[axis] + radius * (value * Math.cos(angle) + second[axis] * Math.sin(angle))) as Vector
      positions.push(...orient(ring))
      if (!index) continue
      const start = (index - 1) * sides + side
      const end = (index - 1) * sides + (side + 1) % sides
      indices.push(start, end, end + sides, start, end + sides, start + sides)
    }
  })
  const vertices = Float32Array.from(positions)
  const triangles = Uint16Array.from(indices)
  return { id, positions: vertices, indices: triangles, normals: computeNormals(vertices, triangles), color: colorFor(id) }
}

function node(id: string, [x, y, z]: Vector, radius: number): Mesh {
  const points: Vector[] = []
  for (let i = 0; i < 9; i++) points.push([x, y, z + (i - 4) * radius / 5])
  const shape = tube(id, points, radius)
  for (let i = 0; i < 9; i++) {
    const scale = Math.sqrt(1 - ((i - 4) / 4.02) ** 2)
    for (let j = 0; j < 10; j++) {
      const offset = (i * 10 + j) * 3
      shape.positions[offset] = x + (shape.positions[offset] - x) * scale
      shape.positions[offset + 2] = -y + (shape.positions[offset + 2] + y) * scale
    }
  }
  shape.normals = computeNormals(shape.positions, shape.indices)
  return shape
}

// Approximate placements against the reference chamber surfaces. These are
// explanatory overlays and are kept separate from the image-derived mesh.
function conduction(): Mesh[] {
  return [
    node('sa-node', [0.30, 0.544, 0.638], 0.012),
    node('av-node', [0.485, 0.518, 0.535], 0.010),
    tube('bundle-of-his', [[0.486, 0.515, 0.534], [0.505, 0.487, 0.525], [0.528, 0.47, 0.511]], 0.006),
    tube('left-bundle-branch', [[0.528, 0.47, 0.511], [0.57, 0.467, 0.468], [0.622, 0.443, 0.421], [0.67, 0.434, 0.374]], 0.005),
    tube('right-bundle-branch', [[0.528, 0.47, 0.511], [0.544, 0.434, 0.481], [0.58, 0.406, 0.425], [0.608, 0.392, 0.36]], 0.005),
    tube('purkinje-left', [[0.67, 0.434, 0.374], [0.703, 0.465, 0.368], [0.73, 0.503, 0.397], [0.747, 0.533, 0.434]], 0.0038),
    tube('purkinje-left', [[0.67, 0.434, 0.374], [0.664, 0.465, 0.366], [0.639, 0.511, 0.389], [0.61, 0.532, 0.421]], 0.0038),
    tube('purkinje-right', [[0.608, 0.392, 0.36], [0.602, 0.353, 0.352], [0.565, 0.328, 0.376], [0.53, 0.329, 0.416]], 0.0038),
    tube('purkinje-right', [[0.608, 0.392, 0.36], [0.567, 0.416, 0.344], [0.522, 0.43, 0.367], [0.485, 0.444, 0.418]], 0.0038),
  ]
}

let cache: Mesh[] | null = null
export function localMeshes(): Mesh[] {
  if (cache) return cache
  const data = Uint8Array.from(atob(cardiacReference), char => char.charCodeAt(0))
  const view = new DataView(data.buffer)
  const vertexCount = view.getUint32(0, true)
  const regionCount = view.getUint32(4, true)
  if (regionCount !== regions.length || vertexCount < 3) throw new Error('Invalid local heart model')
  const source = new Float32Array(vertexCount * 3)
  let cursor = 8
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    source.set(orient([0, 2, 4].map(offset => view.getUint16(cursor + offset, true) / 65_535) as Vector), vertex * 3)
    cursor += 6
  }
  const meshes: Mesh[] = []
  for (const id of regions) {
    const count = view.getUint32(cursor, true)
    cursor += 4
    const remap = new Map<number, number>()
    const subset: number[] = []
    const indices = new Uint16Array(count)
    for (let i = 0; i < count; i++) {
      const sourceIndex = view.getUint16(cursor, true)
      cursor += 2
      if (!remap.has(sourceIndex)) {
        remap.set(sourceIndex, remap.size)
        subset.push(source[sourceIndex * 3], source[sourceIndex * 3 + 1], source[sourceIndex * 3 + 2])
      }
      indices[i] = remap.get(sourceIndex)!
    }
    const positions = Float32Array.from(subset)
    meshes.push({ id, positions, normals: computeNormals(positions, indices), indices, color: colorFor(id) })
  }
  if (cursor !== data.length) throw new Error('Unexpected local model length')
  meshes.push(...conduction())
  normalizeMeshes(meshes)
  cache = meshes
  return meshes
}
