// Three.js reference: https://threejs.org/docs/#api/en/materials/ShaderMaterial
//
// Why a ShaderMaterial (not onBeforeCompile on a built-in material): the look comes
// entirely from the shader: either a stylized lighting pass recolored by a gradient map
// (lit), or the palette painted along the height (painted), plus wrap, occlusion and grain.
// There are no scene lights (the key light is a uniform). A built-in material would bring
// the whole lighting pipeline only for us to override nearly all of it, and onBeforeCompile
// patches internal shader chunks by string replacement, which breaks silently between
// Three.js versions.
import {
  DataTexture,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  RedFormat,
  RepeatWrapping,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
} from 'three'
import { lightDirection, materialStops, MAX_STOPS, type PaletteStop } from '../material'
import type { MaterialSettings } from '../types'
import { MAX_ETCH_LINES, MAX_ETCHES, type EtchShape } from './etch'
import { MAX_TEXTURES, type TextureShape } from './texture'
import { MAX_PATTERNS, patternPlacement, type HeightMap, type SolidPattern } from './pattern'
import { MAX_TWISTS, type TwistShape } from './twist'

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
  /** The renderer's drawing-buffer px per CSS (frame) px, so the grain is sized in frame
   *  px whatever the zoom or export resolution. */
  setPixelRatio(ratio: number): void
  /** World position of the solid's origin (its group's position). */
  setSolidOrigin(origin: Vector3): void
  /** Twist nodes' flutes (up to MAX_TWISTS) over a solid from `top` down `height` (its own
   *  space), for per-pixel normals; none = the mesh's normals. */
  setTwists(twists: readonly TwistShape[], top: number, height: number): void
  /** Etch nodes' engraved lines (up to MAX_ETCHES); none = no etching. */
  setEtches(etches: readonly EtchShape[]): void
  /** Texture nodes' rough finishes (up to MAX_TEXTURES); none = a smooth surface. */
  setTextures(textures: readonly TextureShape[]): void
  /** Pattern nodes' ornament (up to MAX_PATTERNS): each map is uploaded once (when it's a
   *  new map), the placement every call. `surfaceAt(from)` gives the surface coordinate at
   *  a strip's top (a share of the height), where patterns following the surface start. */
  setPatterns(patterns: readonly SolidPattern[], surfaceAt: (from: number) => number): void
  /** Free the pattern textures (the materials are disposed with the scene). */
  dispose(): void
}

/** The pattern slots (0 … MAX_PATTERNS − 1): each needs its own sampler, written out. */
const PATTERN_SLOTS = Array.from({ length: MAX_PATTERNS }, (_, i) => i)

const vertexShader = /* glsl */ `
  attribute float aLedge;
  // The undeformed profile normal (x = outward, y = up), on twisted solids.
  attribute vec2 aProfileNormal;
  // The surface coordinate (lathe.ts surfaceCoordinates), for patterns following the surface.
  attribute float aSurface;

  // The solid's own origin in world space (on the axis, at its vertical center), so caps
  // and the lathe share one coordinate system whatever their mesh rotation.
  uniform vec3 uSolidOrigin;

  varying vec3 vSolidPosition;
  varying vec3 vSolidNormal;
  varying vec3 vViewPosition;
  varying vec3 vViewNormal;
  varying float vLedge;
  varying vec2 vProfileNormal;
  varying float vSurface;

  void main() {
    vProfileNormal = aProfileNormal;
    vSurface = aSurface;
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
  #define MAX_TWISTS ${MAX_TWISTS}
  #define MAX_ETCHES ${MAX_ETCHES}
  #define MAX_ETCH_LINES ${MAX_ETCH_LINES}
  #define MAX_PATTERNS ${MAX_PATTERNS}
  #define MAX_TEXTURES ${MAX_TEXTURES}

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
  uniform float uGrainSize;
  uniform float uPixelRatio;
  uniform float uFlat;
  uniform float uShading;
  uniform vec3 uLightDir;
  uniform float uAmbient;
  uniform float uSoftness;
  uniform float uHighlight;
  uniform float uHighlightSize;
  // Twist nodes (TwistShape in twist.ts): (flutes, depth, turn, rotate),
  // (exponent, from, to, endSize), (round, curve, grooves, -); over the solid's top/height.
  uniform int uTwistCount;
  uniform vec4 uTwistA[MAX_TWISTS];
  uniform vec4 uTwistB[MAX_TWISTS];
  uniform vec4 uTwistC[MAX_TWISTS];
  uniform float uTwistTop;
  uniform float uTwistHeight;
  // Etch nodes (EtchShape in etch.ts): (from, to, bundles, lines), (gap, width, slant,
  // cross), (style: 0 cut, +1 bright inlay, -1 dark inlay; strength, layout, waves),
  // (fade, top depth, bottom depth, -). Layout: 0 diagonal, 1 vertical, 2 horizontal,
  // 3 zigzag, 4 wave (ETCH_LAYOUTS).
  uniform int uEtchCount;
  uniform vec4 uEtchA[MAX_ETCHES];
  uniform vec4 uEtchB[MAX_ETCHES];
  uniform vec4 uEtchC[MAX_ETCHES];
  uniform vec4 uEtchD[MAX_ETCHES];
  // Pattern nodes (render3d/pattern.ts): height maps, and (from, to, repeats, style),
  // (strength, fade, top depth, bottom depth), (scale, shape scale, follows the surface,
  // surface coordinate at the strip's top), (map width / height, angle, spin, -). Style: 0 raised, 1 cut, 2 bright inlay, 3 dark inlay.
  uniform int uPatternCount;
${PATTERN_SLOTS.map((i) => `  uniform sampler2D uPatternMap${i};`).join('\n')}
  uniform vec4 uPatternA[MAX_PATTERNS];
  uniform vec4 uPatternB[MAX_PATTERNS];
  uniform vec4 uPatternC[MAX_PATTERNS];
  uniform vec4 uPatternD[MAX_PATTERNS];
  // Texture nodes (TextureShape in texture.ts): (from, to, fade, style), (scale, strength,
  // angle, seed), (top depth, bottom depth, -, -). Style: 0 rough, 1 hammered, 2 brushed.
  uniform int uTextureCount;
  uniform vec4 uTextureA[MAX_TEXTURES];
  uniform vec4 uTextureB[MAX_TEXTURES];
  uniform vec4 uTextureC[MAX_TEXTURES];

  varying vec3 vSolidPosition;
  varying vec3 vSolidNormal;
  varying vec3 vViewPosition;
  varying vec3 vViewNormal;
  varying float vLedge;
  varying vec2 vProfileNormal;
  varying float vSurface;

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

  // Grain ---------------------------------------------------------------------------------

  // A well-distributed hash of a 2D lattice point to 0..1 ("hash without sine", Hoskins).
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // Gaussian-ish white noise at a lattice point: the sum of three uniform samples
  // (Irwin–Hall), scaled to unit standard deviation.
  float gaussian(vec2 cell) {
    float sum = hash12(cell) + hash12(cell + vec2(37.1, 17.3)) + hash12(cell + vec2(91.7, 53.9));
    return (sum - 1.5) * 2.0;
  }

  // Monochrome Gaussian grain, like Photoshop's Add Noise (Gaussian, monochromatic): an
  // independent value per grain (white noise: no structure, so it stays even and doesn't
  // alias at any zoom), smoothly interpolated between grains so sizes above a pixel read as
  // soft clumps. Grains are uGrainSize frame px, so the export matches the preview. Added
  // to the color (no blend mode), a little stronger in the midtones, like film grain.
  vec3 applyGrain(vec3 color, float amount) {
    vec2 q = gl_FragCoord.xy / uPixelRatio / max(uGrainSize, 0.05);
    vec2 cell = floor(q);
    vec2 f = fract(q);
    f = f * f * (3.0 - 2.0 * f);
    float n = mix(
      mix(gaussian(cell), gaussian(cell + vec2(1.0, 0.0)), f.x),
      mix(gaussian(cell + vec2(0.0, 1.0)), gaussian(cell + vec2(1.0, 1.0)), f.x),
      f.y);
    // Interpolating averages neighbors (less contrast mid-cell); bring it back up.
    n *= 1.35;
    float luma = dot(clamp(color, 0.0, 1.0), vec3(0.299, 0.587, 0.114));
    float midtones = mix(0.65, 1.0, 4.0 * luma * (1.0 - luma));
    return color + n * amount * 0.11 * midtones;
  }

  // Twist ---------------------------------------------------------------------------------

  // Mirrors twistScale() in twist.ts (one twist's radius scale at height share v).
  float twistOne(vec4 a, vec4 b, vec4 c, float v, float phi) {
    if ((b.y > 0.0 && v <= b.y) || (b.z < 1.0 && v >= b.z) || a.y <= 0.0) return 1.0;
    bool ends = b.w > 0.0;
    float d = min((b.y > 0.0 || ends) ? v - b.y : 1e6, (b.z < 1.0 || ends) ? b.z - v : 1e6);
    float vb = clamp((v - b.y) / max(b.z - b.y, 1e-6), 0.0, 1.0);
    float t = a.x * (phi - a.w + a.z * (vb - c.y * (vb - vb * vb)));
    float end = max(b.w, 0.015);
    float fade = smoothstep(0.0, c.x > 0.5 ? end * 0.2 : end, d);
    float e = d / end;
    float width = (c.x > 0.5 && e < 1.0) ? sqrt(max(0.0, 1.0 - (1.0 - e) * (1.0 - e))) : 1.0;
    float fromCrease = t - 3.14159265;
    float delta = abs(fromCrease - 6.28318531 * floor(fromCrease / 6.28318531 + 0.5));
    float x = delta / max(width, 1e-4);
    if (x >= 3.14159265) return 1.0;
    float cut = c.z > 0.5 ? pow(cos(x * 0.5), b.x) : 1.0 - pow(sin(x * 0.5), b.x);
    return 1.0 - a.y * fade * cut;
  }

  // All twists' radius scale at the lathe's angle phi and height y (solid space).
  float twistScale(float phi, float y) {
    float v = (uTwistTop - y) / max(uTwistHeight, 1e-6);
    float m = 1.0;
    for (int i = 0; i < MAX_TWISTS; i++) {
      if (i >= uTwistCount) break;
      m *= twistOne(uTwistA[i], uTwistB[i], uTwistC[i], v, phi);
    }
    return m;
  }

  // The twisted surface's normal at p (solid space), per pixel, so creases stay crisp
  // wherever they cross the mesh: the cross product of its slopes around the axis and along
  // the profile (as lathe.ts), with m's slopes by central differences.
  vec3 twistedNormal(vec3 p, vec2 profileNormal, vec3 fallback) {
    float radius = length(p.xz);
    if (radius < 1e-3 || dot(profileNormal, profileNormal) < 1e-8) return fallback;
    // The lathe places a point at (r sin phi, y, r cos phi).
    float phi = atan(p.x, p.z);
    float m = twistScale(phi, p.y);
    const float hPhi = 1e-3;
    const float hY = 0.5;
    float mPhi = (twistScale(phi + hPhi, p.y) - twistScale(phi - hPhi, p.y)) / (2.0 * hPhi);
    float mY = (twistScale(phi, p.y + hY) - twistScale(phi, p.y - hY)) / (2.0 * hY);
    float r = radius / max(m, 1e-4);
    vec2 pn = normalize(profileNormal);
    float dr = -pn.y;
    float dy = pn.x;
    float sn = sin(phi);
    float cs = cos(phi);
    float rPhi = r * mPhi;
    float rS = dr * m + r * mY * dy;
    float bx = rPhi * sn + radius * cs;
    float bz = rPhi * cs - radius * sn;
    vec3 o = vec3(-bz * dy, bz * rS * sn - bx * rS * cs, bx * dy);
    float len = length(o);
    return len > 1e-6 ? o / len : fallback;
  }

  // Etch ----------------------------------------------------------------------------------

  // How deep a strip's relief (etch lines, pattern) is at height share v (0–1): easing from
  // 'top' depth at the strip's top to 'bottom' depth at its bottom (smoothstep), and to 0 at
  // its edges over 'fade' of the strip (smootherstep), with at least a pixel's
  // antialiasing. It scales the relief only, never adds its own slope.
  float stripDepth(float from, float to, float fade, float top, float bottom, float v, float edge) {
    float band = max(to - from, 1e-6);
    float soft = max(fade * band, edge);
    float t = clamp(min(v - from, to - v) / soft, 0.0, 1.0);
    float mask = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
    float u = clamp((v - from) / band, 0.0, 1.0);
    return mask * mix(top, bottom, u * u * (3.0 - 2.0 * u));
  }

  // The signed distance (bundle periods) from a point (bundle-period coordinate q) to the
  // nearest of a bundle's lines, as nearestLine() in etch.ts (which gives its size).
  float etchNearest(float q, float lines, float gap) {
    float f = fract(q);
    float nearest = 1.0;
    for (int k = 0; k < MAX_ETCH_LINES; k++) {
      if (float(k) >= lines) break;
      float center = 0.5 + (float(k) - (lines - 1.0) * 0.5) * gap;
      float d = f - center;
      d -= floor(d + 0.5);
      if (abs(d) < abs(nearest)) nearest = d;
    }
    return nearest;
  }

  // How far around a line has turned at strip share vb (as etchOffset() in etch.ts), and
  // that turn's slope per strip share: diagonal, zigzag, wave; vertical/horizontal none.
  vec2 etchTurn(float arrangement, float slant, float waves, float vb) {
    if (arrangement < 0.5) return vec2(slant * vb, slant);
    if (arrangement > 2.5 && arrangement < 3.5) {
      float x = vb * waves;
      float f = x - floor(x) - 0.5;
      return vec2(slant * (1.0 - 2.0 * abs(f)), -2.0 * slant * waves * sign(f));
    }
    if (arrangement > 3.5) {
      float a = 6.28318531 * waves;
      return vec2(slant * 0.5 * sin(a * vb), slant * 0.5 * a * cos(a * vb));
    }
    return vec2(0.0);
  }

  // The etch nodes' lines at p (solid space). Lines are a fixed width on the frame (screen-
  // space slopes; the angle's taken from two cuts of the circle so its slope never sees
  // atan's jump), their depth easing over the strip (stripDepth). Inlaid styles (bright/
  // dark) give 'overlay' (coverage × strength × depth, tone ±1); cut grooves give 'slope',
  // the screen-space slope of a V-groove's height (frame px per drawing-buffer px) for
  // perturbNormal, and 'cut', how much of the pixel is groove.
  void etchAt(vec3 p, out vec2 overlay, out vec2 slope, out float cut) {
    overlay = vec2(0.0, 1.0);
    slope = vec2(0.0);
    cut = 0.0;
    float span = max(uHeightRange.y - uHeightRange.x, 1e-5);
    float v = (uHeightRange.y - p.y) / span;
    float phi = atan(p.x, p.z);
    float phi2 = atan(-p.x, -p.z);
    vec2 d1 = vec2(dFdx(phi), dFdy(phi));
    vec2 d2 = vec2(dFdx(phi2), dFdy(phi2));
    vec2 dPhi = vec2(abs(d1.x) < abs(d2.x) ? d1.x : d2.x, abs(d1.y) < abs(d2.y) ? d1.y : d2.y);
    vec2 dV = vec2(dFdx(v), dFdy(v));
    float edge = abs(dV.x) + abs(dV.y);
    float deepest = 0.0;
    for (int i = 0; i < MAX_ETCHES; i++) {
      if (i >= uEtchCount) break;
      vec4 a = uEtchA[i];
      vec4 b = uEtchB[i];
      vec4 c = uEtchC[i];
      vec4 e = uEtchD[i];
      float depth = stripDepth(a.x, a.y, e.x, e.y, e.z, v, edge);
      float band = max(a.y - a.x, 1e-6);
      float vb = clamp((v - a.x) / band, 0.0, 1.0);
      float perPeriod = a.z / 6.28318531;
      bool rings = c.z > 1.5 && c.z < 2.5;
      for (int dir = 0; dir < 2; dir++) {
        if (dir == 1 && b.w < 0.5) break;
        float s = dir == 0 ? 1.0 : -1.0;
        float q;
        vec2 dq;
        if (rings && dir == 0) {
          // Horizontal: rings, 'bundles' of them across the strip.
          q = vb * a.z;
          dq = dV / band * a.z;
        } else {
          // Around (horizontal's crossing set: straight vertical lines).
          vec2 turn = rings ? vec2(0.0) : etchTurn(c.z, b.z, c.w, vb) * s;
          q = (phi - turn.x) * perPeriod;
          dq = (dPhi - turn.y * dV / band) * perPeriod;
        }
        float fw = max(abs(dq.x) + abs(dq.y), 1e-7);
        float halfWidth = 0.5 * b.y * uPixelRatio * fw;
        float d = etchNearest(q, a.w, b.x);
        float cover = (1.0 - smoothstep(halfWidth - 0.5 * fw, halfWidth + 0.5 * fw, abs(d))) * depth;
        if (abs(c.x) < 0.5) {
          // Cut: a V-groove, deepest on the line, its walls 'strength' steep (×1.5), as deep
          // as the strip's depth there; the deepest groove sets the slope (where lines cross).
          float groove = clamp(1.0 - abs(d) / max(halfWidth, 1e-7), 0.0, 1.0) * depth;
          // A groove a pixel or two wide on screen can't show both walls (each pixel lands on
          // one, so the line breaks into dashes): until it's a few pixels wide it blends from
          // wall shading to a soft shaded line.
          float walls = smoothstep(1.5, 4.0, 2.0 * halfWidth / fw);
          if (groove > deepest) {
            deepest = groove;
            // dh/dq over the groove (in frame px), times q's screen slope.
            slope = sign(d) * c.y * 1.5 * depth * walls / (uPixelRatio * fw) * dq;
          }
          cut = max(cut, cover * c.y * (2.5 - 1.5 * walls));
        } else if (cover * c.y > overlay.x) {
          overlay = vec2(cover * c.y, c.x);
        }
      }
    }
  }

  // Pattern ------------------------------------------------------------------------------

  // A pattern's depth at height share v: its strip's (stripDepth), from its fade and its
  // top and bottom depths.
  float patternDepth(vec4 a, vec4 b, float v, float edge) {
    return stripDepth(a.x, a.y, b.y, b.z, b.w, v, edge);
  }

  // A pattern's map (0–1) at p: wrapped 'repeats' times around and stretched over the strip,
  // sampled with seam-safe slopes (as the etch's angle), so mipmapping never sees atan's
  // jump. Sampled everywhere (its screen slopes need every pixel's value); patternDepth
  // confines it to the strip.
  float patternHeight(sampler2D map, vec4 a, vec4 c, vec4 d, float phi, vec2 dPhi, float v, vec2 dV, float surface, vec2 dSurface) {
    float scale = c.x;
    float shapeScale = c.y;
    float aspect = d.x;
    float angle = d.y;
    // Spun around the trophy: the whole pattern turned about the axis.
    phi -= d.z;
    bool turned = abs(angle) > 1e-4;
    vec2 uv;
    vec2 dx;
    vec2 dy;
    if (c.z > 0.5) {
      // Following the surface: down the trophy in the surface coordinate, which is in the
      // same units as the angle around, so the ornament keeps its proportions (map width /
      // height) wherever it is, in rows from the strip's top.
      float rows = a.z / 6.28318531 * aspect;
      uv = vec2(phi / 6.28318531 * a.z, (surface - c.w) * rows);
      dx = vec2(dPhi.x / 6.28318531 * a.z, dSurface.x * rows);
      dy = vec2(dPhi.y / 6.28318531 * a.z, dSurface.y * rows);
    } else {
      // Over the strip: scaled about its middle line (smaller stacks rows, larger crops).
      float band = max(a.y - a.x, 1e-6) * max(scale, 1e-3);
      // (Turned, the rows run on past the strip's edges instead of clamping.)
      float vb = (v - a.x) / max(a.y - a.x, 1e-6);
      float across = 0.5 + ((turned ? vb : clamp(vb, 0.0, 1.0)) - 0.5) / max(scale, 1e-3);
      uv = vec2(phi / 6.28318531 * a.z, across);
      dx = vec2(dPhi.x / 6.28318531 * a.z, dV.x / band);
      dy = vec2(dPhi.y / 6.28318531 * a.z, dV.y / band);
    }
    // Turned: the map's coordinates rotated in its own proportions (a tile is 'aspect' rows
    // wide), so the ornament turns without shearing; its slopes turn with them. (Around the
    // back, where the angle wraps, a turned lattice can't meet itself: out of a front view.)
    if (turned) {
      vec2 k = vec2(aspect, 1.0);
      float cs = cos(angle);
      float sn = sin(angle);
      mat2 turn = mat2(cs, sn, -sn, cs);
      uv = (turn * (uv * k)) / k;
      dx = (turn * (dx * k)) / k;
      dy = (turn * (dy * k)) / k;
    }
    // Each motif scaled in its own cell (one repeat around, one row across) about the cell's
    // middle: smaller leaves plain surface around it, larger crops into it. Explicit slopes,
    // so the cells' edges never confuse mipmapping.
    float k = max(shapeScale, 1e-3);
    vec2 cell = fract(uv);
    vec2 local = (cell - 0.5) / k + 0.5;
    // Outside the shrunk motif: plain surface, its edges feathered (8% of it, at least a
    // pixel) so it sinks into the surface rather than ending in a hard frame.
    vec2 pixel = vec2(abs(dx.x) + abs(dy.x), abs(dx.y) + abs(dy.y)) / k;
    vec2 feather = max(pixel, vec2(0.08));
    vec2 inside = smoothstep(vec2(0.0), feather, local) * smoothstep(vec2(0.0), feather, 1.0 - local);
    float h = textureGrad(map, clamp(local, 0.0, 1.0) + floor(uv), dx / k, dy / k).r;
    return k < 1.0 ? h * inside.x * inside.y : h;
  }

  // One pattern's part at a point, from its height there (h) and its screen slope: relief
  // (raised or cut, up to 10 frame px × strength × the strip's depth) bends 'slope' and
  // shades the ground or the cut; inlays recolor through 'overlay'.
  void applyPattern(float h, vec2 gradient, vec4 a, vec4 b, float v, float edge, inout vec2 overlay, inout vec2 slope, inout float shade) {
    float depth = patternDepth(a, b, v, edge) * b.x;
    if (a.w < 1.5) {
      float direction = a.w < 0.5 ? 1.0 : -1.0;
      slope += direction * depth * 10.0 * gradient;
      shade = max(shade, (a.w < 0.5 ? 1.0 - h : h) * depth * 0.3);
    } else if (h * depth > overlay.x) {
      overlay = vec2(h * depth, a.w < 2.5 ? 1.0 : -1.0);
    }
  }

  // The pattern nodes at p: inlays give 'overlay' (coverage × strength, tone ±1); relief gives
  // 'slope' (its height's screen-space slope, frame px per drawing-buffer px, for
  // perturbNormal) and 'shade' (the ground between raised ornament, or the cut-in ornament,
  // a touch darker).
  void patternAt(vec3 p, out vec2 overlay, out vec2 slope, out float shade) {
    overlay = vec2(0.0, 1.0);
    slope = vec2(0.0);
    shade = 0.0;
    float span = max(uHeightRange.y - uHeightRange.x, 1e-5);
    float v = (uHeightRange.y - p.y) / span;
    float phi = atan(p.x, p.z);
    float phi2 = atan(-p.x, -p.z);
    vec2 d1 = vec2(dFdx(phi), dFdy(phi));
    vec2 d2 = vec2(dFdx(phi2), dFdy(phi2));
    vec2 dPhi = vec2(abs(d1.x) < abs(d2.x) ? d1.x : d2.x, abs(d1.y) < abs(d2.y) ? d1.y : d2.y);
    vec2 dV = vec2(dFdx(v), dFdy(v));
    float edge = abs(dV.x) + abs(dV.y);
    vec2 dSurface = vec2(dFdx(vSurface), dFdy(vSurface));
    // Each map sampled in uniform control flow, with its screen slopes (one sampler each, so
    // written out per slot).
${PATTERN_SLOTS.map(
  (i) => `    if (uPatternCount > ${i}) {
      float h${i} = patternHeight(uPatternMap${i}, uPatternA[${i}], uPatternC[${i}], uPatternD[${i}], phi, dPhi, v, dV, vSurface, dSurface);
      applyPattern(h${i}, vec2(dFdx(h${i}), dFdy(h${i})), uPatternA[${i}], uPatternB[${i}], v, edge, overlay, slope, shade);
    }`,
).join('\n')}
  }

  // Texture ------------------------------------------------------------------------------

  // Well-distributed hashes of a lattice point ("hash without sine", Hoskins): to 0..1, and
  // to 0..1 in each of three channels.
  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec3 hash33(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yxx) * p3.zyx);
  }

  // Value noise (0..1) and its exact gradient (Quilez), with quintic easing between lattice
  // points so its slopes are smooth too (no grid in the shading).
  vec4 noiseGradient(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    vec3 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
    float a = hash13(i);
    float b = hash13(i + vec3(1.0, 0.0, 0.0));
    float c = hash13(i + vec3(0.0, 1.0, 0.0));
    float d = hash13(i + vec3(1.0, 1.0, 0.0));
    float e = hash13(i + vec3(0.0, 0.0, 1.0));
    float f1 = hash13(i + vec3(1.0, 0.0, 1.0));
    float g = hash13(i + vec3(0.0, 1.0, 1.0));
    float h = hash13(i + vec3(1.0, 1.0, 1.0));
    float k1 = b - a;
    float k2 = c - a;
    float k3 = e - a;
    float k4 = a - b - c + d;
    float k5 = a - c - e + g;
    float k6 = a - b - e + f1;
    float k7 = -a + b + c - d + e - f1 - g + h;
    float value = a + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z
      + k6 * u.z * u.x + k7 * u.x * u.y * u.z;
    vec3 gradient = du * vec3(
      k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z,
      k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x,
      k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y);
    return vec4(value, gradient);
  }

  // Hammered: the squared distance to the nearest of jittered points, one per cell (Worley),
  // so each point sits at the bottom of a round dent and dents meet in ridges; with its
  // gradient (twice the offset from the point).
  vec4 dentsGradient(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    float nearest = 8.0;
    vec3 offset = vec3(0.0);
    for (int cz = -1; cz <= 1; cz++) {
      for (int cy = -1; cy <= 1; cy++) {
        for (int cx = -1; cx <= 1; cx++) {
          vec3 cell = vec3(float(cx), float(cy), float(cz));
          vec3 d = f - cell - (0.1 + 0.8 * hash33(i + cell));
          float distance2 = dot(d, d);
          if (distance2 < nearest) {
            nearest = distance2;
            offset = d;
          }
        }
      }
    }
    return vec4(nearest, 2.0 * offset);
  }

  // The texture nodes at p (solid space, frame px): 'slope', the relief's screen-space slope
  // (frame px per drawing-buffer px, for perturbNormal), and 'shade', how much darker the
  // pits (rough, hammered) or the streaks (brushed) are. Each height comes with its exact
  // gradient, projected on the screen through p's screen slopes, so the relief is smooth per
  // pixel; detail smaller than a couple of pixels on screen fades out instead of shimmering.
  // The relief's height is up to half the feature size × strength, so its steepness holds at
  // any scale.
  void surfaceTextureAt(vec3 p, out vec2 slope, out float shade) {
    slope = vec2(0.0);
    shade = 0.0;
    float span = max(uHeightRange.y - uHeightRange.x, 1e-5);
    float v = (uHeightRange.y - p.y) / span;
    vec2 dV = vec2(dFdx(v), dFdy(v));
    float edge = abs(dV.x) + abs(dV.y);
    vec3 px = dFdx(p);
    vec3 py = dFdy(p);
    // Frame px per drawing-buffer px: how small a feature gets on screen.
    float footprint = max(0.5 * (length(px) + length(py)), 1e-5);
    // Around the axis (brushed): seam-safe angle slopes, as the etch's.
    float phi = atan(p.x, p.z);
    float phi2 = atan(-p.x, -p.z);
    vec2 d1 = vec2(dFdx(phi), dFdy(phi));
    vec2 d2 = vec2(dFdx(phi2), dFdy(phi2));
    vec2 dPhi = vec2(abs(d1.x) < abs(d2.x) ? d1.x : d2.x, abs(d1.y) < abs(d2.y) ? d1.y : d2.y);
    for (int i = 0; i < MAX_TEXTURES; i++) {
      if (i >= uTextureCount) break;
      vec4 a = uTextureA[i];
      vec4 b = uTextureB[i];
      vec4 c = uTextureC[i];
      float depth = stripDepth(a.x, a.y, a.z, c.x, c.y, v, edge) * b.y;
      if (depth <= 0.0) continue;
      float scale = max(b.x, 1e-3);
      vec3 seed = b.w * vec3(13.0, 7.0, 11.0);
      float h = 0.0;
      vec2 hSlope = vec2(0.0);
      float tone = 0.0;
      if (a.w < 0.5) {
        // Rough: four octaves of noise, each half the size and height of the last.
        float total = 0.0;
        float amplitude = 1.0;
        float size = scale;
        for (int k = 0; k < 4; k++) {
          float lod = smoothstep(1.0, 3.0, size / footprint);
          vec4 n = noiseGradient(p / size + seed + float(k) * 17.0);
          h += amplitude * lod * n.x;
          vec3 gradient = n.yzw / size;
          hSlope += amplitude * lod * vec2(dot(gradient, px), dot(gradient, py));
          total += amplitude;
          amplitude *= 0.5;
          size *= 0.5;
        }
        h /= total;
        hSlope /= total;
        tone = 0.35 * (1.0 - h);
      } else if (a.w < 1.5) {
        // Hammered: one dent per cell.
        float lod = smoothstep(1.5, 4.0, scale / footprint);
        vec4 n = dentsGradient(p / scale + seed);
        h = min(n.x, 1.0) * lod;
        vec3 gradient = n.x < 1.0 ? n.yzw / scale : vec3(0.0);
        hSlope = lod * vec2(dot(gradient, px), dot(gradient, py));
        tone = 0.2 * (1.0 - h) * lod;
      } else {
        // Brushed: noise stretched 16× along the streaks, in (around, down) frame px, the
        // around coordinate at the solid's half height as radius (so its slope is exact),
        // turned by the angle.
        float radius = 0.5 * span;
        float cs = cos(b.z);
        float sn = sin(b.z);
        vec2 at = vec2(phi * radius, -p.y);
        vec2 dAtX = vec2(dPhi.x * radius, -px.y);
        vec2 dAtY = vec2(dPhi.y * radius, -py.y);
        vec2 along = vec2(cs, sn);
        vec2 across = vec2(-sn, cs);
        float lod = smoothstep(1.0, 3.0, scale / footprint);
        vec2 q = vec2(dot(at, along) / (16.0 * scale), dot(at, across) / scale);
        vec4 n = noiseGradient(vec3(q, 0.0) + seed);
        vec4 n2 = noiseGradient(vec3(q * 2.0, 5.0) + seed);
        h = (n.x + 0.5 * n2.x) / 1.5 * lod;
        // d h / d (around, down), then on the screen.
        vec2 g = (n.yz + n2.yz) / 1.5;
        vec2 dAt = g.x * along / (16.0 * scale) + g.y * across / scale;
        hSlope = lod * vec2(dot(dAt, dAtX), dot(dAt, dAtY));
        tone = 0.45 * h;
      }
      float height = 0.5 * scale * depth;
      slope += height * hSlope;
      shade = max(shade, tone * depth);
    }
  }

  // Bends the normal by a surface height's screen-space slope (derivative bump mapping, as
  // Three's bumpmap_pars_fragment perturbNormalArb).
  vec3 perturbNormal(vec3 position, vec3 normal, vec2 slope, float facing) {
    vec3 sigmaX = dFdx(position);
    vec3 sigmaY = dFdy(position);
    vec3 r1 = cross(sigmaY, normal);
    vec3 r2 = cross(normal, sigmaX);
    float det = dot(sigmaX, r1) * facing;
    if (abs(det) < 1e-12) return normal;
    vec3 gradient = sign(det) * (slope.x * r1 + slope.y * r2);
    return normalize(abs(det) * normal - gradient);
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

    // Twisted (twist nodes): the exact normal per pixel. The solid has no rotation, so its
    // own space is world space's orientation.
    vec3 solidNormal = normalize(vSolidNormal);
    vec3 viewNormal = normalize(vViewNormal);
    if (!flatFace && uTwistCount > 0) {
      solidNormal = twistedNormal(vSolidPosition, vProfileNormal, solidNormal);
      viewNormal = normalize(mat3(viewMatrix) * solidNormal);
    }

    // Two-sided: flip normals on back faces (the inside of an open, partial sweep).
    float facing = gl_FrontFacing ? 1.0 : -1.0;
    vec3 n = viewNormal * facing;

    // Etched lines (etch nodes), on the surface only: cut grooves bend the normal (so they
    // catch the light on one wall and fall into shade on the other); inlays recolor below.
    vec2 etchOverlay = vec2(0.0, 1.0);
    vec2 etchSlope = vec2(0.0);
    float etchCut = 0.0;
    if (!flatFace && uEtchCount > 0) etchAt(vSolidPosition, etchOverlay, etchSlope, etchCut);
    // Pattern nodes: relief bends the normal the same way; inlays recolor below.
    vec2 patternOverlay = vec2(0.0, 1.0);
    vec2 patternSlope = vec2(0.0);
    float patternShade = 0.0;
    if (!flatFace && uPatternCount > 0) patternAt(vSolidPosition, patternOverlay, patternSlope, patternShade);
    // Texture nodes: fine relief bending the normal too; pits or streaks a touch darker.
    vec2 textureSlope = vec2(0.0);
    float textureShade = 0.0;
    if (!flatFace && uTextureCount > 0) surfaceTextureAt(vSolidPosition, textureSlope, textureShade);
    if (!flatFace && (uEtchCount > 0 || uPatternCount > 0 || uTextureCount > 0)) {
      // (Slopes are per drawing-buffer px; positions' screen slopes match them.)
      n = perturbNormal(vViewPosition, n, etchSlope + patternSlope + textureSlope, facing);
    }
    etchCut = max(etchCut, patternShade);
    if (patternOverlay.x > etchOverlay.x) etchOverlay = patternOverlay;

    // Fresnel: 0 facing the viewer, 1 at the silhouette. The view direction is constant
    // for the orthographic camera, per-fragment for the perspective one.
    vec3 viewDir = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(-vViewPosition);
    float fresnel = pow(1.0 - clamp(abs(dot(n, viewDir)), 0.0, 1.0), 1.6);

    // Ledges: downward faces and the band just beneath an overhang (vLedge, precomputed
    // along the profile); the inside of an open sweep reads as shade. Caps get none.
    float up = solidNormal.y * facing;
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
      // Cut grooves are a touch darker at the bottom; inlays: bright toward the map's
      // highlight, dark toward its shadow.
      lum *= 1.0 - 0.2 * etchCut;
      lum *= 1.0 - textureShade;
      lum = mix(lum, etchOverlay.y > 0.0 ? 1.1 : 0.0, etchOverlay.x);
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
      color *= 1.0 - 0.2 * etchCut;
      color *= 1.0 - textureShade;
      color = mix(color, etchOverlay.y > 0.0 ? vec3(1.0) : color * 0.2, etchOverlay.x);
    }

    if (!flatFace && uGrain > 0.0) color = applyGrain(color, uGrain);

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
  // Pattern textures: a blank stand-in until a map arrives, then one per map (uploaded once).
  const blankMap = heightTexture({ data: new Uint8Array(1), width: 1, height: 1 })
  const patternTextures: Array<{ map: HeightMap; texture: DataTexture } | null> = Array.from(
    { length: MAX_PATTERNS },
    () => null,
  )
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
    uGrainSize: { value: 0.6 },
    /** Drawing-buffer px per frame px, so the grain is sized in frame px. */
    uPixelRatio: { value: 1 },
    uShading: { value: 1 },
    uLightDir: { value: new Vector3(0, 0, 1) },
    uAmbient: { value: 0 },
    uSoftness: { value: 0 },
    uHighlight: { value: 0 },
    uHighlightSize: { value: 0.5 },
    uTwistCount: { value: 0 },
    uTwistA: { value: Array.from({ length: MAX_TWISTS }, () => new Vector4()) },
    uTwistB: { value: Array.from({ length: MAX_TWISTS }, () => new Vector4()) },
    uTwistC: { value: Array.from({ length: MAX_TWISTS }, () => new Vector4()) },
    uTwistTop: { value: 0 },
    uTwistHeight: { value: 1 },
    uEtchCount: { value: 0 },
    uEtchA: { value: Array.from({ length: MAX_ETCHES }, () => new Vector4()) },
    uEtchB: { value: Array.from({ length: MAX_ETCHES }, () => new Vector4()) },
    uEtchC: { value: Array.from({ length: MAX_ETCHES }, () => new Vector4()) },
    uEtchD: { value: Array.from({ length: MAX_ETCHES }, () => new Vector4()) },
    uTextureCount: { value: 0 },
    uTextureA: { value: Array.from({ length: MAX_TEXTURES }, () => new Vector4()) },
    uTextureB: { value: Array.from({ length: MAX_TEXTURES }, () => new Vector4(1, 0, 0, 0)) },
    uTextureC: { value: Array.from({ length: MAX_TEXTURES }, () => new Vector4()) },
    uPatternCount: { value: 0 },
    ...Object.fromEntries(PATTERN_SLOTS.map((i) => [`uPatternMap${i}`, { value: blankMap }])),
    uPatternA: { value: Array.from({ length: MAX_PATTERNS }, () => new Vector4()) },
    uPatternB: { value: Array.from({ length: MAX_PATTERNS }, () => new Vector4()) },
    uPatternC: { value: Array.from({ length: MAX_PATTERNS }, () => new Vector4(1, 1, 0, 0)) },
    uPatternD: { value: Array.from({ length: MAX_PATTERNS }, () => new Vector4(1, 0, 0, 0)) },
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
      uniforms.uGrainSize.value = look.grainSize
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
    setPixelRatio(ratio) {
      uniforms.uPixelRatio.value = ratio
    },
    setPatterns(patterns, surfaceAt) {
      const used = patterns.slice(0, MAX_PATTERNS)
      uniforms.uPatternCount.value = used.length
      used.forEach(({ map, params }, i) => {
        let slot = patternTextures[i]
        if (!slot || slot.map !== map) {
          slot?.texture.dispose()
          slot = { map, texture: heightTexture(map) }
          patternTextures[i] = slot
        }
        const uniform = (uniforms as Record<string, { value: unknown }>)[`uPatternMap${i}`]
        if (uniform) uniform.value = slot.texture
        const p = patternPlacement(params)
        uniforms.uPatternA.value[i]?.set(p.from, p.to, p.repeats, p.style)
        uniforms.uPatternB.value[i]?.set(p.strength, p.fade, p.depthTop, p.depthBottom)
        uniforms.uPatternC.value[i]?.set(p.scale, p.shapeScale, p.surface, surfaceAt(p.from))
        uniforms.uPatternD.value[i]?.set(map.width / Math.max(map.height, 1), p.angle, p.spin, 0)
      })
    },
    dispose() {
      for (const slot of patternTextures) slot?.texture.dispose()
      blankMap.dispose()
    },
    setEtches(etches) {
      const used = etches.slice(0, MAX_ETCHES)
      uniforms.uEtchCount.value = used.length
      used.forEach((e, i) => {
        uniforms.uEtchA.value[i]?.set(e.from, e.to, e.bundles, e.lines)
        uniforms.uEtchB.value[i]?.set(e.gap, e.width, e.slant, e.cross)
        uniforms.uEtchC.value[i]?.set(e.style, e.strength, e.layout, e.waves)
        uniforms.uEtchD.value[i]?.set(e.fade, e.depthTop, e.depthBottom, 0)
      })
    },
    setTextures(textures) {
      const used = textures.slice(0, MAX_TEXTURES)
      uniforms.uTextureCount.value = used.length
      used.forEach((t, i) => {
        uniforms.uTextureA.value[i]?.set(t.from, t.to, t.fade, t.style)
        uniforms.uTextureB.value[i]?.set(t.scale, t.strength, t.angle, t.seed)
        uniforms.uTextureC.value[i]?.set(t.depthTop, t.depthBottom, 0, 0)
      })
    },
    setTwists(twists, top, height) {
      const used = twists.slice(0, MAX_TWISTS)
      uniforms.uTwistCount.value = used.length
      uniforms.uTwistTop.value = top
      uniforms.uTwistHeight.value = height
      used.forEach((t, i) => {
        uniforms.uTwistA.value[i]?.set(t.flutes, t.depth, t.turn, t.rotate)
        uniforms.uTwistB.value[i]?.set(t.exponent, t.from, t.to, t.endSize)
        uniforms.uTwistC.value[i]?.set(t.round, t.curve, t.grooves, 0)
      })
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

/** A height map as a single-channel texture: repeating around and across (rows, when the
 *  pattern is scaled down), mipmapped so it stays smooth when the trophy is small on screen. */
function heightTexture(map: HeightMap): DataTexture {
  const texture = new DataTexture(map.data, map.width, map.height, RedFormat, UnsignedByteType)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  // Rows are 1 byte wide each; don't assume 4-byte alignment.
  texture.unpackAlignment = 1
  texture.needsUpdate = true
  return texture
}
