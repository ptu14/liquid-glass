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

// ── Poisson-disk blur (13 taps) ─────────────────────
vec3 blurBg(vec2 center, float radius) {
  // 13-tap Poisson disk, pre-normalized
  vec3 acc = sampleBg(center);
  vec2 px = 1.0 / u_res;
  vec2 offsets[12];
  offsets[0]  = vec2(-0.326, -0.406);
  offsets[1]  = vec2(-0.840, -0.074);
  offsets[2]  = vec2(-0.696,  0.457);
  offsets[3]  = vec2(-0.203,  0.621);
  offsets[4]  = vec2( 0.962, -0.195);
  offsets[5]  = vec2( 0.473, -0.480);
  offsets[6]  = vec2( 0.519,  0.767);
  offsets[7]  = vec2( 0.185, -0.893);
  offsets[8]  = vec2( 0.507,  0.064);
  offsets[9]  = vec2(-0.321,  0.932);
  offsets[10] = vec2(-0.792, -0.598);
  offsets[11] = vec2( 0.326,  0.406);
  for (int i = 0; i < 12; i++) {
    acc += sampleBg(center + offsets[i] * px * radius);
  }
  return acc / 13.0;
}

void main() {
  vec2 uv    = v_uv;
  vec2 px    = v_uv * u_res;
  vec2 pxDOM = vec2(px.x, u_res.y - px.y); // DOM space (Y=0 at top)

  // 1. Metaball SDF in DOM space
  float field = 1e9;
  for (int i = 0; i < MAX_BTNS; i++) {
    if (i >= u_btnCount) break;
    vec2 center = u_btns[i].xy + u_btns[i].zw * 0.5;
    vec2 half_size = u_btns[i].zw * 0.5;
    float s = sdRoundedRect(pxDOM - center, half_size, u_radii[i]);
    float k = u_blendK[i];
    field = (k < 0.5) ? min(field, s) : smin(field, s, k);
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

  // 2. SDF normal (numerical, DOM space)
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
    float k  = u_blendK[i];
    if (k < 0.5) {
      f_r = min(f_r, sr); f_l = min(f_l, sl);
      f_u = min(f_u, su); f_d = min(f_d, sd);
    } else {
      f_r = smin(f_r, sr, k); f_l = smin(f_l, sl, k);
      f_u = smin(f_u, su, k); f_d = smin(f_d, sd, k);
    }
  }
  vec2 nDOM = normalize(vec2(f_r - f_l, f_d - f_u));
  vec2 nUV  = vec2(nDOM.x, -nDOM.y); // DOM -> UV

  // 3. Edge-only displacement (refraction)
  float edgePx   = 5.0 * u_dispStr * 15.0;
  float edgeMask = smoothstep(edgePx, 0.0, abs(field));

  vec2 dispUV = uv + nUV * edgeMask * u_dispStr * u_refr;
  dispUV = clamp(dispUV, 0.001, 0.999);

  // 4. Frosted glass blur
  float blurRadius = 2.0;
  float glassMask  = smoothstep(2.0, -4.0, field);

  vec3 col = blurBg(dispUV, blurRadius * glassMask);

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

  // 7. Subtle surface grain (frosted texture)
  float grain = (hash(pxDOM + fract(u_time * 0.5)) - 0.5) * 0.04 * tintMask;
  col += grain;

  // 8. Rim highlight at shape boundary
  float rim = smoothstep(2.5, 0.0, abs(field));
  col += rim * 0.18;

  // 9. Inner shadow at top edge — gentle gradient darkening
  float innerShadow = smoothstep(0.0, -18.0, field) * (1.0 - smoothstep(-18.0, -40.0, field));
  col -= innerShadow * 0.06 * thickness;

  // 10. Alpha with subpixel AA
  float fw    = fwidth(field);
  float alpha = smoothstep(fw, -fw, field);

  gl_FragColor = vec4(col, alpha);
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
