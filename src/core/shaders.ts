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
uniform float u_time;
uniform int u_btnCount;
uniform vec4 u_btns[MAX_BTNS];
uniform float u_blendK[MAX_BTNS];
uniform float u_radii[MAX_BTNS];
uniform float u_thickness[MAX_BTNS];
uniform float u_pressed[MAX_BTNS];
uniform vec3 u_tintColor[MAX_BTNS];
uniform float u_blend;
uniform float u_dispStr;
uniform float u_aberr;
uniform float u_refr;
uniform float u_flipBg; // 1.0 = flip Y (canvas texture), 0.0 = no flip (FBO texture)

varying vec2 v_uv;

// ── Noise ────────────────────────────────────────────
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// ── SDF ──────────────────────────────────────────────
float sdRoundedRect(vec2 p, vec2 half_size, float r) {
  vec2 d = abs(p) - half_size + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// ── Background sampling with Y-flip ─────────────────
vec3 sampleBg(vec2 uv) {
  float sy = mix(uv.y, 1.0 - uv.y, u_flipBg);
  return texture2D(u_bg, vec2(uv.x, sy)).rgb;
}


void main() {
  vec2 uv    = v_uv;
  vec2 px    = v_uv * u_res;
  vec2 pxDOM = vec2(px.x, u_res.y - px.y); // DOM space (Y=0 at top)

  // 1. Metaball SDF in DOM space
  // Per-pixel localK: only pixels near an unlocked component use smin.
  // Pixels far from any unlocked component stay sharp (min).
  float localK = 0.0;
  for (int i = 0; i < MAX_BTNS; i++) {
    if (i >= u_btnCount) break;
    float k = u_blendK[i];
    if (k < 0.5) continue;
    vec2 center = u_btns[i].xy + u_btns[i].zw * 0.5;
    vec2 half_size = u_btns[i].zw * 0.5;
    float s = sdRoundedRect(pxDOM - center, half_size, u_radii[i]);
    if (s < k * 2.0) localK = max(localK, k);
  }
  float field = 1e9;
  for (int i = 0; i < MAX_BTNS; i++) {
    if (i >= u_btnCount) break;
    vec2 center = u_btns[i].xy + u_btns[i].zw * 0.5;
    vec2 half_size = u_btns[i].zw * 0.5;
    float s = sdRoundedRect(pxDOM - center, half_size, u_radii[i]);
    field = (localK < 0.5) ? min(field, s) : smin(field, s, localK);
  }

  // Early discard for pixels far from any component
  if (field > 8.0) discard;

  // 1b. Find nearest component for per-pixel thickness
  float nearestDist = 1e9;
  float thickness = 1.0;
  for (int i = 0; i < MAX_BTNS; i++) {
    if (i >= u_btnCount) break;
    vec2 ctr = u_btns[i].xy + u_btns[i].zw * 0.5;
    vec2 hs  = u_btns[i].zw * 0.5;
    float ds = sdRoundedRect(pxDOM - ctr, hs, u_radii[i]);
    if (ds < nearestDist) {
      nearestDist = ds;
      thickness = u_thickness[i];
    }
  }

  // 2. SDF normal (numerical, DOM space) — uses same localK
  float e = 1.5;
  float f_r = 1e9, f_l = 1e9, f_u = 1e9, f_d = 1e9;
  for (int i = 0; i < MAX_BTNS; i++) {
    if (i >= u_btnCount) break;
    vec2 c = u_btns[i].xy + u_btns[i].zw * 0.5;
    vec2 h = u_btns[i].zw * 0.5;
    float sr = sdRoundedRect(pxDOM + vec2( e, 0) - c, h, u_radii[i]);
    float sl = sdRoundedRect(pxDOM + vec2(-e, 0) - c, h, u_radii[i]);
    float su = sdRoundedRect(pxDOM + vec2(0, -e) - c, h, u_radii[i]);
    float sd = sdRoundedRect(pxDOM + vec2(0,  e) - c, h, u_radii[i]);
    if (localK < 0.5) {
      f_r = min(f_r, sr); f_l = min(f_l, sl);
      f_u = min(f_u, su); f_d = min(f_d, sd);
    } else {
      f_r = smin(f_r, sr, localK); f_l = smin(f_l, sl, localK);
      f_u = smin(f_u, su, localK); f_d = smin(f_d, sd, localK);
    }
  }
  vec2 nDOM = normalize(vec2(f_r - f_l, f_d - f_u));
  vec2 nUV  = vec2(nDOM.x, -nDOM.y); // DOM -> UV

  // 3. Edge-only displacement (refraction)
  float edgePx   = 5.0 * u_dispStr * 15.0;
  float edgeMask = smoothstep(edgePx, 0.0, abs(field));

  vec2 dispUV = uv + nUV * edgeMask * u_dispStr * u_refr;
  dispUV = clamp(dispUV, 0.001, 0.999);

  // 4. Frosted glass — bg is already pre-blurred via two-pass Gaussian
  float glassMask = smoothstep(1.0, -3.0, field);

  vec3 col = sampleBg(dispUV);

  // 5. Chromatic aberration on edges
  vec2 aber = nUV * u_aberr * edgeMask;
  float sY_r = mix(dispUV.y + aber.y, 1.0 - (dispUV.y + aber.y), u_flipBg);
  float sY_b = mix(dispUV.y - aber.y, 1.0 - (dispUV.y - aber.y), u_flipBg);
  vec2 sUV_r = vec2(dispUV.x + aber.x, sY_r);
  vec2 sUV_b = vec2(dispUV.x - aber.x, sY_b);
  // Blend aberration only on edges
  col.r = mix(col.r, texture2D(u_bg, sUV_r).r, edgeMask);
  col.b = mix(col.b, texture2D(u_bg, sUV_b).b, edgeMask);

  // 6. Apple-style tinting: thin = bright, thick = dark
  //    thin (0.35): lighten — overlay white at ~12%
  //    regular (1.0): darken — multiply down + slight cool tint
  float tintMask = glassMask;
  float darkAmount   = thickness;           // 0..1
  float brightAmount = 1.0 - thickness;     // 1..0

  // Darken (thick / regular material)
  col *= mix(1.0, 0.72, darkAmount * tintMask);
  // Cool tint for thick glass
  col += vec3(-0.01, 0.0, 0.02) * darkAmount * tintMask;

  // Brighten (thin material) — add white overlay
  col += vec3(0.14) * brightAmount * tintMask;

  // 6b. Per-component tint — always visible at base, darkens on press
  float tintInf = 0.0;
  vec3 tintCol = vec3(0.0);
  for (int i = 0; i < MAX_BTNS; i++) {
    if (i >= u_btnCount) break;
    float tintSum = u_tintColor[i].r + u_tintColor[i].g + u_tintColor[i].b;
    if (tintSum < 0.01) continue;
    vec2 pc = u_btns[i].xy + u_btns[i].zw * 0.5;
    vec2 ph = u_btns[i].zw * 0.5;
    float ps = sdRoundedRect(pxDOM - pc, ph, u_radii[i]);
    float inf = smoothstep(30.0, -10.0, ps);
    // Base strength + boosted on press
    float strength = mix(0.25, 0.55, u_pressed[i]);
    float w = inf * strength;
    if (w > tintInf) {
      tintInf = w;
      tintCol = u_tintColor[i];
    }
  }
  // Darken more on press: 0.88 at rest → 0.62 pressed
  float tintDark = mix(0.88, 0.62, tintInf);
  col = mix(col, col * tintDark + tintCol * tintInf * 0.55, step(0.001, tintInf) * glassMask);

  // 7. (grain removed — Gaussian blur provides sufficient frost)

  // 8. Rim highlight at shape boundary
  float rim = smoothstep(2.5, 0.0, abs(field));
  col += rim * 0.18;

  // 9. Inner shadow at top edge — gentle gradient darkening
  float innerShadow = smoothstep(0.0, -18.0, field) * (1.0 - smoothstep(-18.0, -40.0, field));
  col -= innerShadow * 0.06 * thickness;

  // 10. Alpha with subpixel AA (1.5× width for smoother edges on high-DPI)
  float fw    = fwidth(field) * 1.5;
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
