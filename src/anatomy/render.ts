import {clipVector} from './geometry';
import type {ClipPlane} from './geometry';
export type Vector = [number, number, number]
export type Mesh = {
  id: string
  positions: Float32Array
  normals: Float32Array
  indices: Uint16Array | Uint32Array
  color: Vector
  activation?: Float32Array
}
export type Camera = { yaw: number; pitch: number; zoom: number }
export type Mode = 'surface' | 'inside' | 'conduction' | 'axis'
export type Layer = { color: Vector; opacity?: number; light?: number; emission?: number; wave?: number; reverse?: boolean; waveColor?: Vector; disorganized?: boolean }
type Matrix = Float32Array

function multiply(a: Matrix, b: Matrix): Matrix {
  const output = new Float32Array(16)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) output[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k]
    }
  }
  return output
}

function cameraMatrix(camera: Camera, aspect: number): Matrix {
  const ratio = Math.max(aspect, 0.1)
  const focal = 1 / Math.tan(Math.PI / 10)
  const projection = new Float32Array([
    focal / ratio, 0, 0, 0,
    0, focal, 0, 0,
    0, 0, -1.02, -1,
    0, 0, -0.2, 0,
  ])
  const translation = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -3.75 / camera.zoom, 1])
  return multiply(projection, translation)
}

function rotation({ yaw, pitch }: Camera): Matrix {
  const cx = Math.cos(pitch)
  const sx = Math.sin(pitch)
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  return new Float32Array([
    cy, sx * sy, -cx * sy, 0,
    0, cx, sx, 0,
    sy, -sx * cy, cx * cy, 0,
    0, 0, 0, 1,
  ])
}

export function project(point: Vector, camera: Camera, aspect: number): [number, number] {
  const matrix = multiply(cameraMatrix(camera, aspect), rotation(camera))
  const [x, y, z] = point
  const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15]
  return [
    50 * (1 + (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / w),
    50 * (1 - (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / w),
  ]
}

const vertex = `#version 300 es
in vec3 position;
in vec3 normal;
in float activationPosition;
uniform mat4 model;
uniform mat4 camera;
out vec3 surfaceNormal;
out vec3 tissuePosition;
out float pathPosition;
void main() {
  surfaceNormal = mat3(model) * normal;
  tissuePosition = position;
  pathPosition = activationPosition;
  gl_Position = camera * model * vec4(position, 1.0);
}`

const fragment = `#version 300 es
precision highp float;
in vec3 surfaceNormal;
in vec3 tissuePosition;
in float pathPosition;
uniform vec4 clipPlane;
uniform float clipping;
uniform vec3 pigment;
uniform float opacity;
uniform float emission;
uniform float detail;
uniform float wave;
uniform vec2 waveBounds;
uniform vec3 waveColor;
uniform float waveReverse;
uniform float disorganized;
out vec4 result;
void main() {
  if(clipping > .5 && dot(vec4(tissuePosition,1.0),clipPlane)<0.0) discard;
  vec3 N = normalize(surfaceNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 key = normalize(vec3(-0.55, 0.65, 0.82));
  float diffuse = max(0.0, dot(N, key));
  float bounce = max(0.0, dot(N, normalize(vec3(0.84, -0.16, -0.53))));
  float gloss = pow(max(dot(N, normalize(key + vec3(0.0, 0.0, 1.0))), 0.0), 22.0);
  float rim = pow(1.0 - abs(N.z), 3.0);
  vec3 lit = pigment * (0.42 + diffuse * 0.57 + bounce * 0.20 + emission)
      + vec3(0.90, 0.67, 0.58) * (0.12 * gloss + 0.04 * rim) * detail;
  float location = clamp(pathPosition,0.0,1.0);
  location = mix(location,1.0-location,waveReverse);
  float activation = wave < 0.0 ? 0.0 : exp(-pow((location-wave)/.16,2.0));
  if(disorganized>.5)activation=.5+.5*sin(tissuePosition.x*29.0+sin(tissuePosition.y*23.0+wave*15.0)+tissuePosition.z*21.0+wave*31.0);
  lit = mix(lit,waveColor,activation*.85);
  result = vec4(clamp(lit, 0.0, 1.0), opacity);
}`

function program(gl: WebGL2RenderingContext) {
  const shaders = [vertex, fragment].map((source, index) => {
    const shader = gl.createShader(index === 0 ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader)
      gl.deleteShader(shader)
      throw new Error(info || 'Heart shader could not compile')
    }
    return shader
  })
  const target = gl.createProgram()!
  for (const shader of shaders) gl.attachShader(target, shader)
  gl.linkProgram(target)
  for (const shader of shaders) gl.deleteShader(shader)
  if (!gl.getProgramParameter(target, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(target)
    gl.deleteProgram(target)
    throw new Error(info || 'Heart shader could not link')
  }
  return target
}

export function createHeartRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl2', { alpha: true, antialias: true })
  if (!gl) throw new Error('WebGL 2 unavailable')
  const shader = program(gl)
  const uniform = Object.fromEntries(
    ['model', 'camera', 'pigment', 'opacity', 'emission', 'detail', 'wave', 'waveBounds', 'waveColor', 'waveReverse', 'clipPlane', 'clipping', 'disorganized'].map(name => [name, gl.getUniformLocation(shader, name)]),
  )
  let objects: { mesh: Mesh; vao: WebGLVertexArrayObject; buffers: WebGLBuffer[]; bounds: [number,number]; center: Vector }[] = []
  function clear() {
    for (const object of objects) {
      gl!.deleteVertexArray(object.vao)
      for (const buffer of object.buffers) gl!.deleteBuffer(buffer)
    }
    objects = []
  }
  return {
    setMeshes(meshes: Mesh[]) {
      clear()
      for (const mesh of meshes) {
        const vao = gl.createVertexArray()!
        gl.bindVertexArray(vao)
        const buffers = [
          ['position', mesh.positions] as const,
          ['normal', mesh.normals] as const,
          ['activationPosition',mesh.activation??(()=>{
            let low=Infinity,high=-Infinity;for(let i=1;i<mesh.positions.length;i+=3){low=Math.min(low,mesh.positions[i]);high=Math.max(high,mesh.positions[i]);}
            return Float32Array.from({length:mesh.positions.length/3},(_,i)=>(mesh.positions[i*3+1]-low)/(high-low||1));
          })()] as const,
        ].map(([name, data]) => {
          const buffer = gl.createBuffer()!
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
          gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
          const attribute = gl.getAttribLocation(shader, name)
          gl.enableVertexAttribArray(attribute)
          gl.vertexAttribPointer(attribute, name==='activationPosition'?1:3, gl.FLOAT, false, 0, 0)
          return buffer
        })
        const indices = gl.createBuffer()!
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices)
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW)
        let low=Infinity,high=-Infinity;const center:Vector=[0,0,0];
        for(let i=0;i<mesh.positions.length;i+=3){low=Math.min(low,mesh.positions[i+1]);high=Math.max(high,mesh.positions[i+1]);for(let j=0;j<3;j++)center[j]+=mesh.positions[i+j]/(mesh.positions.length/3)}
        objects.push({ mesh, vao, buffers: [...buffers, indices],bounds:[low,high],center })
      }
      gl.bindVertexArray(null)
    },
    draw(camera: Camera, layers: (mesh: Mesh) => Layer | null, clip:ClipPlane|null=null) {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.round(canvas.clientWidth * ratio)
      const height = Math.round(canvas.clientHeight * ratio)
      if (width <= 0 || height <= 0 || gl.isContextLost()) return
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      gl.viewport(0, 0, width, height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
      gl.enable(gl.DEPTH_TEST)
      gl.useProgram(shader)
      gl.uniform4fv(uniform.clipPlane,clipVector(clip))
      gl.uniform1f(uniform.clipping,clip?1:0)
      gl.uniformMatrix4fv(uniform.model, false, rotation(camera))
      gl.uniformMatrix4fv(uniform.camera, false, cameraMatrix(camera, width / height))
      const model=rotation(camera)
      const visible = objects.flatMap(object => {
        const layer = layers(object.mesh)
        return layer ? [{ ...object, layer, depth:model[2]*object.center[0]+model[6]*object.center[1]+model[10]*object.center[2] }] : []
      })
      const draw = (transparent: boolean) => {
        gl.depthMask(!transparent)
        if (transparent) {
          gl.enable(gl.BLEND)
          gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
          gl.enable(gl.CULL_FACE)
          gl.cullFace(gl.BACK)
        } else {
          gl.disable(gl.BLEND)
          gl.disable(gl.CULL_FACE)
        }
        for (const object of transparent?[...visible].sort((a,b)=>a.depth-b.depth):visible) {
          const opacity = object.layer.opacity ?? 1
          if ((opacity < 1) !== transparent) continue
          gl.uniform3fv(uniform.pigment, object.layer.color)
          gl.uniform1f(uniform.opacity, opacity)
          gl.uniform1f(uniform.emission, object.layer.emission ?? 0)
          gl.uniform1f(uniform.detail, object.layer.light ?? 1)
          gl.uniform1f(uniform.wave, object.layer.wave ?? -1)
          gl.uniform2fv(uniform.waveBounds,object.bounds)
          gl.uniform1f(uniform.waveReverse,object.layer.reverse?1:0)
          gl.uniform1f(uniform.disorganized,object.layer.disorganized?1:0)
          gl.uniform3fv(uniform.waveColor,object.layer.waveColor??[1,.83,.25])
          gl.bindVertexArray(object.vao)
          gl.drawElements(
            gl.TRIANGLES, object.mesh.indices.length,
            object.mesh.indices instanceof Uint16Array ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT, 0,
          )
        }
      }
      draw(false)
      draw(true)
      gl.depthMask(true)
      gl.bindVertexArray(null)
    },
    dispose() {
      clear()
      gl.deleteProgram(shader)
    },
  }
}

export function computeNormals(positions: Float32Array, indices: Uint16Array | Uint32Array) {
  const normals = new Float32Array(positions.length)
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3
    const b = indices[i + 1] * 3
    const c = indices[i + 2] * 3
    const ux = positions[b] - positions[a]
    const uy = positions[b + 1] - positions[a + 1]
    const uz = positions[b + 2] - positions[a + 2]
    const vx = positions[c] - positions[a]
    const vy = positions[c + 1] - positions[a + 1]
    const vz = positions[c + 2] - positions[a + 2]
    for (const j of [a, b, c]) {
      normals[j] += uy * vz - uz * vy
      normals[j + 1] += uz * vx - ux * vz
      normals[j + 2] += ux * vy - uy * vx
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1
    for (let coordinate = 0; coordinate < 3; coordinate++) normals[i + coordinate] /= length
  }
  return normals
}
