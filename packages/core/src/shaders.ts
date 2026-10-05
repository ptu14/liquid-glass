import { MAX_BTNS } from './types'

export const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`

export const FRAGMENT_SHADER = `
#extension GL_OES_standard_derivatives : enable
precision highp float;

#define MAX_BTNS ${MAX_BTNS}

uniform sampler2D u_bg;
uniform vec2 u_res;
uniform int u_btnCount;
uniform vec4 u_btns[MAX_BTNS];
uniform float u_blendK[MAX_BTNS];
uniform float u_radii[MAX_BTNS];
uniform float u_thickness[MAX_BTNS];
uniform float u_pressed[MAX_BTNS];
uniform vec3 u_tintColor[MAX_BTNS];
uniform vec2 u_material[MAX_BTNS]; // x = frost (0..1), y = clear (0/1)
uniform sampler2D u_bgRaw;   // background without lower-layer glass
uniform sampler2D u_bgFrost; // blurred background for the frost material
uniform float u_flipAux;     // orientation of u_bgRaw / u_bgFrost
uniform float u_edgeBlur;    // rim blur strength (0..1)
uniform float u_auxIsBg;     // 1 when u_bg is the plain bg (layer 0), 0 for the layer-1 composite
uniform float u_dispStr;    // Refraction strength
uniform float u_aberr;      // Chromatic aberration
uniform float u_refr;       // Bevel depth
uniform float u_flipBg;
uniform float u_time;
uniform float u_frost;      // Frosted-glass noise multiplier (0 = off)
uniform float u_bezelW;     // Bezel band width (px) — sec.3 + sec.6
uniform float u_specAngle;  // Specular light direction (radians)
uniform float u_specOpacity;// Specular highlight opacity (0..1)

varying vec2 v_uv;

// --- LiquidGL utilities ---
float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

// --- SDF & Blending ---
float sdRoundedRect(vec2 p, vec2 half_size, float r) {
  vec2 d = abs(p) - half_size + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

vec3 sampleBg(vec2 uv) {
  float sy = mix(uv.y, 1.0 - uv.y, u_flipBg);
  return texture2D(u_bg, vec2(uv.x, sy)).rgb;
}

// Material of the nearest component, set in main()
float g_frost = 0.0;
float g_clear = 0.0;

vec3 sampleAux(sampler2D t, vec2 uv) {
  float sy = mix(uv.y, 1.0 - uv.y, u_flipAux);
  return texture2D(t, vec2(uv.x, sy)).rgb;
}

// Clear glass looks through lower layers; frost mixes in the blurred bg
vec3 sampleScene(vec2 uv) {
  vec3 c = g_clear > 0.5 ? sampleAux(u_bgRaw, uv) : sampleBg(uv);
  if (g_frost > 0.0) c = mix(c, sampleAux(u_bgFrost, uv), g_frost);
  return c;
}

float g_thick = 1.0;

// Union of all shapes. Each pair blends with the *smaller* of the two
// blend radii (the running field's owner vs the new shape), so a shape
// with k = 0 (locked or relaxed) never grows a bridge from a neighbour's
// k — and there is no distance gate, so the field stays continuous.
float sceneSDF(vec2 p, bool withMaterial) {
  float field = 1e9;
  float kOwner = 0.0;
  for (int i = 0; i < MAX_BTNS; i++) {
    if (i >= u_btnCount) break;
    vec2 center = u_btns[i].xy + u_btns[i].zw * 0.5;
    float d = sdRoundedRect(p - center, u_btns[i].zw * 0.5, u_radii[i]);
    float ki = u_blendK[i];
    float k = min(kOwner, ki);
    bool owns = d < field;
    field = (i == 0 || k < 0.5) ? min(field, d) : smin(field, d, k);
    if (owns) {
      kOwner = ki;
      if (withMaterial) {
        g_thick = u_thickness[i];
        g_frost = u_material[i].x;
        g_clear = u_material[i].y;
      }
    }
  }
  return field;
}

void main() {
  vec2 uv = v_uv;
  vec2 px = v_uv * u_res;
  vec2 pxDOM = vec2(px.x, u_res.y - px.y);

  // 1. Metaball SDF field (material of the nearest shape lands in globals)
  float thickness = 1.0;
  float field = sceneSDF(pxDOM, true);
  thickness = g_thick;

  if (field > 15.0) discard;

  // 2. SDF normals — central differences of the same field
  float e = 1.0;
  float f_r = sceneSDF(pxDOM + vec2( e, 0.0), false);
  float f_l = sceneSDF(pxDOM + vec2(-e, 0.0), false);
  float f_u = sceneSDF(pxDOM + vec2(0.0, -e), false);
  float f_d = sceneSDF(pxDOM + vec2(0.0,  e), false);
  vec2 nDOM = normalize(vec2(f_r - f_l, f_d - f_u));
  vec2 nUV = vec2(nDOM.x, -nDOM.y);

  // 3. Edge refraction — physical model after kube.io/blog/liquid-glass-css-svg:
  // a convex-squircle bezel y = (1-(1-x)^4)^(1/4) of height = bezel width,
  // light entering vertically refracts (Snell, n = 1.5) toward the centre.
  // Flat interior → no shift; inside the bezel the image is pulled inward,
  // peaking just inside the rim and falling to 0 at the very edge.
  float edge  = 1.0 - smoothstep(0.0, u_bezelW, abs(field));
  float xb    = clamp(max(0.0, -field) / u_bezelW, 0.0, 1.0); // 0 = rim, 1 = flat
  float a     = 1.0 - xb;
  float hgt   = u_bezelW * pow(max(1.0 - a * a * a * a, 0.0), 0.25);
  float slope = a * a * a * pow(max(1.0 - a * a * a * a, 1e-4), -0.75);
  float th1   = atan(slope);                     // incidence vs surface normal
  float th2   = asin(sin(th1) / 1.5);            // refracted (air → glass)
  float dispPx = hgt * tan(th1 - th2) * (u_refr / 3.5) // refr 3.5 = physical
               + edge * u_dispStr * 100.0;             // optional broad extra
  vec2 refractedUV = uv - nUV * dispPx / u_res;  // sample toward the centre

  // 4. Frosted glass (noise jitter from LiquidGL) — gated by u_frost
  float frostStrength = 0.002 * (1.0 - thickness) * u_frost;
  vec2 noise = vec2(random(uv), random(uv + 1.0)) * frostStrength * edge;

  vec3 col = sampleScene(refractedUV + noise);

  // 5. Chromatic aberration
  if (u_aberr > 0.0) {
    float cr = sampleScene(refractedUV + noise + nUV * u_aberr * edge).r;
    float cb = sampleScene(refractedUV + noise - nUV * u_aberr * edge).b;
    col.r = mix(col.r, cr, edge);
    col.b = mix(col.b, cb, edge);
  }

  // 5a. Rim blur — content under the bezel smears toward the blurred bg,
  // strongest at the edge. The blurred source is bg-only, so on the
  // layer-1 composite it's used only by clear glass (which sees raw bg).
  // Wider band than the refraction bezel so the smear reaches further in.
  float rimEdge = 1.0 - smoothstep(0.0, u_bezelW * 1.6, abs(field));
  float rimBlur = u_edgeBlur * rimEdge * mix(g_clear, 1.0, u_auxIsBg);
  if (rimBlur > 0.0) col = mix(col, sampleAux(u_bgFrost, refractedUV), rimBlur);

  // 5b. Frost veil — a faint milky lift on top of the blur
  col = mix(col, vec3(1.0), 0.07 * g_frost);

  // 6. Directional rim specular — 1:1 port from Chris Feijoo's notebook
  // (https://observablehq.com/d/ae521b86b8448743). Coefficient is
  // dotSq * (6 / distFromRim) * (1 - distFromRim/bezelW) — peaks AT the
  // rim with a 1/x curve, then linearly fades to 0 at the inner bezel edge.
  // Composited via overlay blend (top RGB and alpha both = spec gray).
  float distFromRim = max(0.5, -field);                      // px inside, avoid /0
  vec2  lightDir    = vec2(cos(u_specAngle), sin(u_specAngle));
  float dotN        = dot(nDOM, lightDir);
  float coef        = dotN * dotN * (6.0 / distFromRim)
                    * (1.0 - distFromRim / u_bezelW);
  float spec        = clamp(coef * u_specOpacity, 0.0, 1.0);

  // W3C overlay blend: lo = 2*col*t (dark bg -> multiply),
  // hi = 1 - 2*(1-col)*(1-t) (bright bg -> screen).
  // Then composite via src-over with alpha = spec.
  vec3 t        = vec3(spec);
  vec3 ovLo     = 2.0 * col * t;
  vec3 ovHi     = vec3(1.0) - 2.0 * (vec3(1.0) - col) * (vec3(1.0) - t);
  vec3 overlaid = mix(ovLo, ovHi, step(vec3(0.5), col));
  col = mix(col, overlaid, spec);

  // 8. Alpha with AA
  float fw = fwidth(field);
  float alpha = smoothstep(fw, -fw, field);

  gl_FragColor = vec4(col, alpha);
}
`

// Two-pass separable Gaussian blur (15-tap, σ ≈ radius/3)
// u_dir encodes direction + pixel size: (1/w, 0) horizontal, (0, 1/h) vertical
// u_radius controls blur spread in pixels
export const BLUR_FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_dir;
uniform float u_radius;
varying vec2 v_uv;

void main() {
  // 15-tap Gaussian (center + 7 pairs), σ_tap ≈ 2.33
  // Weights normalized so sum = 1.0
  float spread = u_radius / 7.0;

  vec3 sum = texture2D(u_tex, v_uv).rgb * 0.1715;

  vec2 d1 = u_dir * spread * 1.0;
  vec2 d2 = u_dir * spread * 2.0;
  vec2 d3 = u_dir * spread * 3.0;
  vec2 d4 = u_dir * spread * 4.0;
  vec2 d5 = u_dir * spread * 5.0;
  vec2 d6 = u_dir * spread * 6.0;
  vec2 d7 = u_dir * spread * 7.0;

  sum += (texture2D(u_tex, v_uv + d1).rgb + texture2D(u_tex, v_uv - d1).rgb) * 0.1564;
  sum += (texture2D(u_tex, v_uv + d2).rgb + texture2D(u_tex, v_uv - d2).rgb) * 0.1187;
  sum += (texture2D(u_tex, v_uv + d3).rgb + texture2D(u_tex, v_uv - d3).rgb) * 0.0748;
  sum += (texture2D(u_tex, v_uv + d4).rgb + texture2D(u_tex, v_uv - d4).rgb) * 0.0393;
  sum += (texture2D(u_tex, v_uv + d5).rgb + texture2D(u_tex, v_uv - d5).rgb) * 0.0172;
  sum += (texture2D(u_tex, v_uv + d6).rgb + texture2D(u_tex, v_uv - d6).rgb) * 0.0062;
  sum += (texture2D(u_tex, v_uv + d7).rgb + texture2D(u_tex, v_uv - d7).rgb) * 0.0019;

  gl_FragColor = vec4(sum, 1.0);
}
`

// Composite shader: blends original bg with a glass layer FBO result
export const COMPOSITE_FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D u_bg;    // original bg (canvas orientation)
uniform sampler2D u_glass; // glass layer FBO (WebGL orientation)
varying vec2 v_uv;
void main() {
  vec4 bg = texture2D(u_bg, vec2(v_uv.x, 1.0 - v_uv.y));
  vec4 glass = texture2D(u_glass, v_uv);
  gl_FragColor = vec4(mix(bg.rgb, glass.rgb, glass.a), 1.0);
}
`
