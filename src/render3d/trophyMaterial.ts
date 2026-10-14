// Three.js reference: https://threejs.org/docs/#api/en/materials/ShaderMaterial
//
// Why a ShaderMaterial (not onBeforeCompile on a built-in material): the look comes
// entirely from the shader: either a stylized lighting pass recolored by a gradient map
// (lit), or the palette painted along the height (painted), plus wrap, occlusion and grain.
// There are no scene lights (the key light is a uniform). A built-in material would bring
// the whole lighting pipeline only for us to override nearly all of it, and onBeforeCompile
// patches internal shader chunks by string replacement, which breaks silently between
// Three.js versions.
import { DoubleSide, ShaderMaterial, Vector2, Vector3 } from 'three'
import { lightDirection, materialStops, MAX_STOPS, type PaletteStop } from '../material'
import type { MaterialSettings } from '../types'

export interface TrophyMaterial {
  /** For the revolved surface. Double-sided: an open (partial) sweep shows its inside. */
  surface: ShaderMaterial
  /** For the flat caps that close a partial sweep. Shares every uniform with `surface`,
   *  but skips wobble, ledge and grain, so at the start of the sweep it matches the 2D
   *  shape (exactly when painted; closely when lit). */
  cap: ShaderMaterial
  /** Apply the look (palette, gradient, shading amounts) to the uniforms. */
  setLook(look: MaterialSettings): void
  /** The solid's height range in its own space (y up), for normalizing the gradient. */
  setHeightRange(min: number, max: number): void
  /** World position of the solid's origin (its group's position). */
  setSolidOrigin(origin: Vector3): void
}

const vertexShader = /* glsl */ `
  attribute float aLedge;

  // The solid's own origin in world space (on the axis, at its vertical center), so caps
  // and the lathe share one coordinate system whatever their mesh rotation.
  uniform vec3 uSolidOrigin;

  varying vec3 vSolidPosition;
  varying vec3 vSolidNormal;
  varying vec3 vViewPosition;
  varying vec3 vViewNormal;
  varying float vLedge;

  void main() {
    vSolidPosition = (modelMatrix * vec4(position, 1.0)).xyz - uSolidOrigin;
    vSolidNormal = normalize(mat3(modelMatrix) * normal);
    vLedge = aLedge;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = mvPosition.xyz;
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const fragmentShader = /* glsl */ `
  #define MAX_STOPS ${MAX_STOPS}

  uniform vec3 uStopColors[MAX_STOPS];
  uniform float uStopPositions[MAX_STOPS];
  uniform int uStopCount;
  uniform vec2 uHeightRange;
  uniform float uGradientOffset;
  uniform float uGradientScale;
  uniform float uTilt;
  uniform float uBanding;
  uniform float uEdgeHue;
  uniform float uWobble;
  uniform float uEdgeDepth;
  uniform float uLedgeShadow;
  uniform float uGrain;
  uniform float uFlat;
  uniform float uShading;
  uniform vec3 uLightDir;
  uniform float uAmbient;
  uniform float uSoftness;
  uniform float uHighlight;
  uniform float uHighlightSize;

  varying vec3 vSolidPosition;
  varying vec3 vSolidNormal;
  varying vec3 vViewPosition;
  varying vec3 vViewNormal;
  varying float vLedge;

  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float valueNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x),
          mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x),
          mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }

  // Low-frequency noise: two octaves, centered on 0 (range about -0.5..0.5).
  float lowNoise(vec3 p) {
    return 0.65 * valueNoise(p) + 0.35 * valueNoise(p * 2.03 + 7.1) - 0.5;
  }

  // Mirrors samplePalette() in material/gradient.ts.
  vec3 samplePalette(float t) {
    float x = clamp(t, 0.0, 1.0);
    vec3 color = uStopColors[0];
    for (int i = 1; i < MAX_STOPS; i++) {
      if (i >= uStopCount) break;
      float a = uStopPositions[i - 1];
      float b = uStopPositions[i];
      float u = clamp((x - a) / max(b - a, 1e-5), 0.0, 1.0);
      float eased = u * u * (3.0 - 2.0 * u);
      color = mix(color, uStopColors[i], mix(u, eased, uBanding));
    }
    return color;
  }

  // Mirrors hueRotate() in material/gradient.ts: rotation about the gray axis.
  vec3 hueRotate(vec3 c, float degrees) {
    float a = radians(degrees);
    const float k = 0.57735027;
    float gray = (c.r + c.g + c.b) / 3.0 * (1.0 - cos(a));
    vec3 cross_kc = k * vec3(c.b - c.g, c.r - c.b, c.g - c.r);
    return clamp(c * cos(a) + cross_kc * sin(a) + gray, 0.0, 1.0);
  }

  void main() {
    bool flatFace = uFlat > 0.5;

    // Shared by both modes ---------------------------------------------------------------

    // Two-sided: flip normals on back faces (the inside of an open, partial sweep).
    float facing = gl_FrontFacing ? 1.0 : -1.0;
    vec3 n = normalize(vViewNormal) * facing;

    // Fresnel: 0 facing the viewer, 1 at the silhouette. The view direction is constant
    // for the orthographic camera, per-fragment for the perspective one.
    vec3 viewDir = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(-vViewPosition);
    float fresnel = pow(1.0 - clamp(abs(dot(n, viewDir)), 0.0, 1.0), 1.6);

    // Ledges: downward faces and the band just beneath an overhang (vLedge, precomputed
    // along the profile); the inside of an open sweep reads as shade. Caps get none.
    float up = normalize(vSolidNormal).y * facing;
    float ledge = 0.0;
    if (!flatFace) {
      float under = smoothstep(0.2, 0.9, -up);
      float inside = gl_FrontFacing ? 0.0 : 0.65;
      ledge = clamp(max(max(under, vLedge), inside), 0.0, 1.0);
    }

    // Band coordinate (mirrors bandCoord() in material/gradient.ts): depth from the top
    // (0 = top, 1 = bottom) plus tilt × distance from the axis, in units of the height.
    float height = max(uHeightRange.y - uHeightRange.x, 1e-5);
    float t = (uHeightRange.y - vSolidPosition.y) / height + uTilt * vSolidPosition.x / height;

    // Low-frequency noise around the revolve (seamless via cos/sin of the angle) and along
    // the height: wobbly band transitions (painted) or airbrushed unevenness (lit).
    float noise = 0.0;
    if (!flatFace) {
      float angle = atan(vSolidPosition.z, vSolidPosition.x);
      noise = lowNoise(vec3(cos(angle) * 1.2, sin(angle) * 1.2, t * 2.2));
    }

    vec3 color;
    if (uShading > 0.5) {
      // Lit -----------------------------------------------------------------------------
      // A grayscale lighting pass recolored through the palette as a gradient map (darkest
      // stop = shadow, lightest = highlight), like Illustrator's 3D Revolve shading under a
      // Photoshop Gradient Map. Mirrors litLuminance() in material/lighting.ts.
      vec3 l = normalize(uLightDir);
      float diffuse = clamp((dot(n, l) + uSoftness) / (1.0 + uSoftness), 0.0, 1.0);
      vec3 h = normalize(l + viewDir);
      float shininess = mix(200.0, 6.0, uHighlightSize);
      float spec = pow(max(dot(n, h), 0.0), shininess) * uHighlight;
      float lum = (uAmbient + (1.0 - uAmbient) * diffuse) * (1.0 - fresnel * uEdgeDepth * 0.5);
      // Shadows tucked under ledges (they also keep highlights out of the crevices).
      lum *= 1.0 - ledge * uLedgeShadow * 0.85;
      lum += uWobble * 0.25 * noise;
      lum += spec * (1.0 - ledge * uLedgeShadow);
      // Mirrors gradientCoord(): offset/scale move and stretch the map along the light.
      float g = 0.5 + (lum - 0.5 - uGradientOffset) / max(uGradientScale, 1e-3);
      color = samplePalette(g);
    } else {
      // Painted --------------------------------------------------------------------------
      // The palette painted along the height in diagonal, wobbly bands.
      t += uWobble * 0.6 * noise;
      // Mirrors gradientCoord() in material/gradient.ts.
      float g = 0.5 + (t - 0.5 - uGradientOffset) / max(uGradientScale, 1e-3);
      color = samplePalette(g);

      // The "deep" tone: darker and more saturated (squaring pushes the dominant channel
      // ahead of the others). Used for the wrap toward the silhouette and for occlusion.
      vec3 deep = color * color * 0.85;
      // At the silhouette the deep tone also shifts hue (lavender → blue, orange → crimson).
      vec3 edgeTone = hueRotate(deep, uEdgeHue);
      color = mix(color, edgeTone, clamp(fresnel * uEdgeDepth * 1.3, 0.0, 1.0));

      color = mix(color, deep * 0.8, ledge * uLedgeShadow);
      if (!flatFace) {
        // Upward tops read a touch lighter than the sides.
        float top = smoothstep(0.3, 0.95, up);
        color = mix(color, color + (1.0 - color) * 0.22, top * uLedgeShadow);
      }
    }

    if (!flatFace) {
      // Subtle screen-space grain.
      float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      color += grain * uGrain * 0.14;
    }

    // Always dither by ±½ of an 8-bit step (invisible on its own), so long, slow gradients
    // (dark bands, wide rims) don't break into visible steps even with grain at 0.
    float dither = fract(sin(dot(gl_FragCoord.xy, vec2(41.37, 289.13))) * 23421.631) - 0.5;
    color += dither / 255.0;

    // Colors are sRGB in and out: no colorspace_fragment, so they match the 2D canvas.
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`

/** Create the trophy's surface and cap materials, sharing one set of uniforms. */
export function createTrophyMaterial(): TrophyMaterial {
  // Colors are passed as plain sRGB Vector3s, not THREE.Color: Color would convert them to
  // linear, and the shader outputs without converting back.
  const uniforms = {
    uStopColors: { value: Array.from({ length: MAX_STOPS }, () => new Vector3()) },
    uStopPositions: { value: new Array<number>(MAX_STOPS).fill(1) },
    uStopCount: { value: 1 },
    uHeightRange: { value: new Vector2(0, 1) },
    uSolidOrigin: { value: new Vector3() },
    uGradientOffset: { value: 0 },
    uGradientScale: { value: 1 },
    uTilt: { value: 0 },
    uBanding: { value: 1 },
    uEdgeHue: { value: 0 },
    uWobble: { value: 0 },
    uEdgeDepth: { value: 0 },
    uLedgeShadow: { value: 0 },
    uGrain: { value: 0 },
    uShading: { value: 1 },
    uLightDir: { value: new Vector3(0, 0, 1) },
    uAmbient: { value: 0 },
    uSoftness: { value: 0 },
    uHighlight: { value: 0 },
    uHighlightSize: { value: 0.5 },
  }

  const surface = new ShaderMaterial({
    uniforms: { ...uniforms, uFlat: { value: 0 } },
    vertexShader,
    fragmentShader,
    side: DoubleSide,
  })
  // Spreading keeps the same { value } objects, so both materials update together.
  const cap = new ShaderMaterial({
    uniforms: { ...uniforms, uFlat: { value: 1 } },
    vertexShader,
    fragmentShader,
    side: DoubleSide,
  })

  return {
    surface,
    cap,
    setLook(look) {
      setStops(materialStops(look))
      uniforms.uGradientOffset.value = look.gradientOffset
      uniforms.uGradientScale.value = look.gradientScale
      uniforms.uTilt.value = look.tilt
      uniforms.uBanding.value = look.banding
      uniforms.uEdgeHue.value = look.edgeHue
      uniforms.uWobble.value = look.wobble
      uniforms.uEdgeDepth.value = look.edgeDepth
      uniforms.uLedgeShadow.value = look.ledgeShadow
      uniforms.uGrain.value = look.grain
      uniforms.uShading.value = look.shading === 'lit' ? 1 : 0
      const light = lightDirection(look.lightAngle, look.lightHeight)
      uniforms.uLightDir.value.set(light.x, light.y, light.z)
      uniforms.uAmbient.value = look.ambient
      uniforms.uSoftness.value = look.softness
      uniforms.uHighlight.value = look.highlight
      uniforms.uHighlightSize.value = look.highlightSize
    },
    setHeightRange(min, max) {
      uniforms.uHeightRange.value.set(min, max)
    },
    setSolidOrigin(origin) {
      uniforms.uSolidOrigin.value.copy(origin)
    },
  }

  function setStops(stops: PaletteStop[]) {
    const used = stops.slice(0, MAX_STOPS)
    uniforms.uStopCount.value = Math.max(1, used.length)
    uniforms.uStopColors.value.forEach((v, i) => {
      const stop = used[Math.min(i, used.length - 1)]
      if (stop) v.set(...stop.color)
    })
    uniforms.uStopPositions.value = uniforms.uStopPositions.value.map(
      (_, i) => used[Math.min(i, used.length - 1)]?.position ?? 1,
    )
  }
}
