import type * as ThreeNS from 'three'
import type { World } from '../sim/world'
import { buildLuts, type Palette } from './palettes'
import { buildSurfaceMesh, surfaceFor, type SurfaceMesh, type Vec3 } from './surfaces'
import { eyePosition, fitDistance, type Orbit } from './orbit'

/**
 * Draws the world on the shape its topology actually makes, rather than on a
 * flat rectangle with the gluing annotated.
 *
 * Three.js is loaded through a dynamic `import()`, so none of it reaches the
 * bundle unless the 3D view is opened. Everything worth testing already lives
 * in `surfaces.ts` and `orbit.ts`, which stay free of it; this file is the
 * part that can only be checked by looking at it.
 *
 * The cells are not geometry. They are sampled from a texture in the fragment
 * shader, which keeps mesh resolution independent of world size — a 400x300
 * board and a 1600x1200 board draw the same 256x128 quads — and means a step
 * costs one texture upload rather than a rebuilt mesh.
 */

type Three = typeof ThreeNS

/** Fine enough for a smooth silhouette; cells come from the texture, not here. */
const MESH_COLS = 256
const MESH_ROWS = 128

const FOV = 45

/** Dead space is see-through, so the far side of the shape reads through it. */
const EMPTY_ALPHA = 0.1
const TRAIL_ALPHA = 0.55

const VERTEX_SHADER = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vec4 eye = modelViewMatrix * vec4(position, 1.0);
  vView = normalize(-eye.xyz);
  gl_Position = projectionMatrix * eye;
}
`

const FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D uCells;
uniform sampler2D uHeat;
uniform sampler2D uPalette;
uniform vec3 uBackground;
uniform vec2 uGrid;
uniform vec2 uTexSize;
uniform float uWire;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vView;

void main() {
  // The cell arrays carry a one-cell halo, so the interior starts one texel in.
  vec2 texel = (vUv * uGrid + 1.0) / uTexSize;
  float alive = texture2D(uCells, texel).r;
  float heat = texture2D(uHeat, texel).r;

  // Two ramps in one 256x2 texture: trails on the lower row, living cells on
  // the upper one, exactly as the 2D renderer's lookup tables are built.
  float row = alive > 0.002 ? 0.75 : 0.25;
  vec3 colour = texture2D(uPalette, vec2((heat * 255.0 + 0.5) / 256.0, row)).rgb;

  float alpha = alive > 0.002 ? 1.0 : (heat > 0.002 ? TRAIL_ALPHA_CONST : EMPTY_ALPHA_CONST);
  if (alive < 0.002 && heat < 0.002) colour = uBackground;

  // The surface is non-orientable, so a normal has no consistent outward
  // sense. Taking the magnitude shades both faces alike and still darkens the
  // silhouette, which is what gives the shape its form.
  float facing = abs(dot(normalize(vNormal), normalize(vView)));
  colour *= 0.55 + 0.45 * facing;

  // Cell boundaries, straight from the texture coordinates rather than as
  // geometry. Fades out once a cell is down to about a pixel, so a large world
  // does not turn into a solid sheet of grid lines.
  vec2 g = vUv * uGrid;
  vec2 width = fwidth(g) * 1.5;
  vec2 edge = smoothstep(1.0 - width, vec2(1.0), abs(fract(g) - 0.5) * 2.0);
  float legible = 1.0 - smoothstep(0.2, 0.7, max(width.x, width.y));
  float line = max(edge.x, edge.y) * legible * uWire;

  colour = mix(colour, vec3(1.0), line * 0.55);
  alpha = max(alpha, line * 0.5);

  gl_FragColor = vec4(colour, alpha);
}
`
  .replace(/TRAIL_ALPHA_CONST/g, TRAIL_ALPHA.toFixed(3))
  .replace(/EMPTY_ALPHA_CONST/g, EMPTY_ALPHA.toFixed(3))

function hexToVec3(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255]
}

/** The two 256-entry ramps, unpacked into one RGBA texture two rows tall. */
function paletteBytes(palette: Palette): Uint8Array {
  const { alive, trail } = buildLuts(palette)
  const bytes = new Uint8Array(256 * 2 * 4)
  for (let i = 0; i < 256; i++) {
    // Row 0 is the trail ramp, row 1 the living one.
    for (const [row, lut] of [
      [0, trail],
      [1, alive],
    ] as const) {
      const packed = lut[i]
      const at = (row * 256 + i) * 4
      bytes[at] = packed & 0xff
      bytes[at + 1] = (packed >> 8) & 0xff
      bytes[at + 2] = (packed >> 16) & 0xff
      bytes[at + 3] = 255
    }
  }
  return bytes
}

export class Surface3DRenderer {
  private renderer: ThreeNS.WebGLRenderer
  private scene: ThreeNS.Scene
  private camera: ThreeNS.PerspectiveCamera
  private geometry: ThreeNS.BufferGeometry | null = null
  private meshes: ThreeNS.Mesh[] = []
  private uniforms: Record<string, { value: unknown }>
  private cellTexture: ThreeNS.DataTexture | null = null
  private heatTexture: ThreeNS.DataTexture | null = null
  private paletteTexture: ThreeNS.DataTexture

  private shapeId = ''
  private meshKey = ''
  private textureKey = ''
  private framing: { center: Vec3; radius: number } = { center: [0, 0, 0], radius: 1 }
  private aspect = 1

  private constructor(
    private three: Three,
    canvas: HTMLCanvasElement,
    palette: Palette,
  ) {
    const { WebGLRenderer, Scene, PerspectiveCamera, DataTexture } = three
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false })
    this.scene = new Scene()
    this.camera = new PerspectiveCamera(FOV, 1, 0.01, 200)

    this.paletteTexture = new DataTexture(paletteBytes(palette), 256, 2)
    this.paletteTexture.needsUpdate = true

    this.uniforms = {
      uCells: { value: null },
      uHeat: { value: null },
      uPalette: { value: this.paletteTexture },
      uBackground: { value: hexToVec3(palette.background) },
      uGrid: { value: new three.Vector2(1, 1) },
      uTexSize: { value: new three.Vector2(1, 1) },
      uWire: { value: 1 },
    }
    this.renderer.setClearColor(palette.background, 1)
  }

  static async create(canvas: HTMLCanvasElement, palette: Palette): Promise<Surface3DRenderer> {
    const three = await import('three')
    return new Surface3DRenderer(three, canvas, palette)
  }

  setPalette(palette: Palette): void {
    this.paletteTexture.image.data = paletteBytes(palette)
    this.paletteTexture.needsUpdate = true
    this.uniforms.uBackground.value = hexToVec3(palette.background)
    this.renderer.setClearColor(palette.background, 1)
  }

  /** Which immersion to draw the current topology on. */
  setShape(id: string): void {
    this.shapeId = id
  }

  setWireframe(show: boolean): void {
    this.uniforms.uWire.value = show ? 1 : 0
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.renderer.setPixelRatio(dpr)
    // The third argument must not be false. It suppresses the canvas's CSS
    // size, leaving the element to lay out at its attribute size - the backing
    // buffer, so `dpr` times too big - inside a clipping container, which puts
    // the middle of the picture in the corner of the viewport.
    this.renderer.setSize(cssWidth, cssHeight, true)
    this.aspect = cssHeight > 0 ? cssWidth / cssHeight : 1
    this.camera.aspect = this.aspect
    this.camera.updateProjectionMatrix()
  }

  /** Where the shape sits, so the camera can be clamped and framed against it. */
  getFraming(): { center: Vec3; radius: number } {
    return this.framing
  }

  /** The distance at which the whole shape is in frame. */
  fitDistance(): number {
    return fitDistance(this.framing.radius, FOV, this.aspect)
  }

  private rebuildMesh(world: World): void {
    const key = `${world.topology}:${this.shapeId}`
    if (key === this.meshKey) return
    const surface = surfaceFor(world.topology, this.shapeId)
    if (!surface) return
    this.meshKey = key

    const mesh: SurfaceMesh = buildSurfaceMesh(surface, MESH_COLS, MESH_ROWS)
    this.framing = { center: mesh.center, radius: mesh.radius }

    this.disposeMesh()
    const { BufferGeometry, BufferAttribute, ShaderMaterial, Mesh, FrontSide, BackSide } = this.three
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3))
    geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3))
    geometry.setAttribute('uv', new BufferAttribute(mesh.uvs, 2))
    geometry.setIndex(new BufferAttribute(mesh.indices, 1))
    this.geometry = geometry

    // Back faces first, then front. A closed surface drawn this way sorts
    // itself well enough to be read, without paying for a per-triangle sort
    // every frame - which at this vertex count would not fit in a frame.
    this.meshes = [BackSide, FrontSide].map((side, order) => {
      const material = new ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        side,
      })
      const object = new Mesh(geometry, material)
      object.renderOrder = order
      this.scene.add(object)
      return object
    })
  }

  private rebuildTextures(world: World): void {
    const key = `${world.width}x${world.height}`
    if (key === this.textureKey) return
    this.textureKey = key

    const { DataTexture, RedFormat, UnsignedByteType, NearestFilter, ClampToEdgeWrapping } =
      this.three
    this.cellTexture?.dispose()
    this.heatTexture?.dispose()

    const width = world.stride
    const height = world.height + 2
    const make = (data: Uint8Array) => {
      const texture = new DataTexture(data, width, height, RedFormat, UnsignedByteType)
      texture.minFilter = NearestFilter
      texture.magFilter = NearestFilter
      texture.wrapS = ClampToEdgeWrapping
      texture.wrapT = ClampToEdgeWrapping
      // Rows of a one-byte-per-texel image are not four-byte aligned unless
      // the stride happens to be a multiple of four, and it usually is not.
      texture.unpackAlignment = 1
      texture.needsUpdate = true
      return texture
    }
    this.cellTexture = make(world.cells)
    this.heatTexture = make(world.heat)
    this.uniforms.uCells.value = this.cellTexture
    this.uniforms.uHeat.value = this.heatTexture
    this.uniforms.uGrid.value = new this.three.Vector2(world.width, world.height)
    this.uniforms.uTexSize.value = new this.three.Vector2(width, height)
  }

  /**
   * Build the mesh and textures for this world without drawing one, so the
   * camera can be framed against the shape before the first frame rather than
   * lurching into place after it.
   */
  prepare(world: World): void {
    this.rebuildMesh(world)
    this.rebuildTextures(world)
  }

  draw(world: World, orbit: Orbit): void {
    this.prepare(world)
    if (!this.cellTexture || !this.heatTexture || this.meshes.length === 0) return

    // The world ping-pongs its cell arrays every step, so the texture has to be
    // pointed at whichever buffer is current rather than holding a reference
    // taken when it was built. No copy: the halo padding means the arrays go
    // to the GPU exactly as they are, and the shader steps over the border.
    this.cellTexture.image.data = world.cells
    this.heatTexture.image.data = world.heat
    this.cellTexture.needsUpdate = true
    this.heatTexture.needsUpdate = true

    const { center } = this.framing
    const eye = eyePosition(orbit, center)
    this.camera.position.set(eye[0], eye[1], eye[2])
    this.camera.lookAt(center[0], center[1], center[2])
    this.renderer.render(this.scene, this.camera)
  }

  private disposeMesh(): void {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh)
      ;(mesh.material as ThreeNS.Material).dispose()
    }
    this.meshes = []
    this.geometry?.dispose()
    this.geometry = null
  }

  dispose(): void {
    this.disposeMesh()
    this.cellTexture?.dispose()
    this.heatTexture?.dispose()
    this.paletteTexture.dispose()
    this.renderer.dispose()
  }
}
