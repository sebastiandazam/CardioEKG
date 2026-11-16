import { useEffect, useRef } from 'react'

const vertex = `
  attribute vec2 position;
  void main() { gl_Position = vec4(position, 0.0, 1.0); }
`

// A local fragment shader. No images, requests, or account are required.
const fragment = `
  precision mediump float;
  uniform vec2 resolution;
  uniform float time;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i+vec2(1.,0.)),u.x),
      mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);
  }
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    float t = time * .125;
    vec2 p = vec2(uv.x * 1.5, uv.y);
    vec2 w = p + vec2(
      .15 * sin(3.5*p.y + 1.1*p.x + t),
      .19 * sin(2.7*p.x - 1.9*p.y - t)
    );
    float drift = noise(w * 3.3 + vec2(t*.45, -t*.34));
    float ridge = abs(w.y - (.20 + .35*w.x + .14*sin(w.x*3.8 + t*.7)));
    float ribbon = exp(-ridge*ridge*15.0);
    float edge = smoothstep(.02,.82,uv.x);
    vec3 color = mix(vec3(.105,.023,.044), vec3(.42,.032,.043), smoothstep(.2,1.25,w.x));
    color = mix(color, vec3(.89,.12,.078), clamp(ribbon*(.25 + edge*.68)*(.7+drift*.43),0.,1.));
    float light = exp(-dot((w-vec2(1.12,.43))*vec2(1.25,1.85),(w-vec2(1.12,.43))*vec2(1.25,1.85))*3.2);
    color = mix(color,vec3(1.,.45,.21),light*edge*(.45 + .38*drift));
    color *= .84 + .16*smoothstep(0.,.55,uv.y);
    color += (hash(gl_FragCoord.xy)-.5)*.055;
    gl_FragColor = vec4(color,1.);
  }
`

export function Gradient() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const target = canvas.current
    if (!target) return
    let gl: WebGLRenderingContext | null
    try {
      gl = target.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' })
    } catch {
      return
    }
    if (!gl) return
    function compile(type: number, source: string) {
      const shader = gl!.createShader(type)
      if (!shader) return null
      gl!.shaderSource(shader, source)
      gl!.compileShader(shader)
      if (gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) return shader
      gl!.deleteShader(shader)
      return null
    }
    const vs = compile(gl.VERTEX_SHADER, vertex)
    const fs = compile(gl.FRAGMENT_SHADER, fragment)
    const program = gl.createProgram()
    const buffer = gl.createBuffer()
    const release = () => {
      if (vs) gl.deleteShader(vs)
      if (fs) gl.deleteShader(fs)
      if (program) gl.deleteProgram(program)
      if (buffer) gl.deleteBuffer(buffer)
    }
    if (!vs || !fs || !program || !buffer) return release
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return release
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    const resolution = gl.getUniformLocation(program, 'resolution')
    const time = gl.getUniformLocation(program, 'time')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let visible = true
    let frame = 0
    let lastPaint = -100
    const started = performance.now()
    function paint(now: number) {
      const ratio = Math.min(window.devicePixelRatio, 1.15, 1152 / Math.max(1, target!.clientWidth))
      const width = Math.max(1, Math.round(target!.clientWidth * ratio))
      const height = Math.max(1, Math.round(target!.clientHeight * ratio))
      if (target!.width !== width) target!.width = width
      if (target!.height !== height) target!.height = height
      gl!.viewport(0, 0, width, height)
      gl!.uniform2f(resolution, width, height)
      gl!.uniform1f(time, reduced.matches ? 0 : (now - started) / 1000)
      gl!.drawArrays(gl!.TRIANGLES, 0, 3)
      target!.style.opacity = '1'
    }
    function tick(now: number) {
      if (now - lastPaint > 37) {
        paint(now)
        lastPaint = now
      }
      frame = requestAnimationFrame(tick)
    }
    function refresh() {
      cancelAnimationFrame(frame)
      if (!visible || document.hidden) return
      paint(performance.now())
      if (!reduced.matches) frame = requestAnimationFrame(tick)
    }
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      refresh()
    })
    observer?.observe(target)
    const resize = () => paint(performance.now())
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', refresh)
    reduced.addEventListener('change', refresh)
    refresh()
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', refresh)
      reduced.removeEventListener('change', refresh)
      release()
    }
  }, [])
  return <canvas ref={canvas} aria-hidden="true" className="landing-shader"/>
}
