/**
 * Shader de dibujo de capa sobre la composición (alfa premultiplicado).
 * - uExpand > 1 agranda el quad (relleno de bordes en espejo/mosaico; el
 *   modo de repetición lo da el wrap de la textura).
 * - uTiles repite la imagen dentro de la capa.
 * - uClip (píxeles de proyecto → espacio de la capa en reposo) recorta el
 *   relleno al marco de la capa cuando uUseClip = 1.
 */
export const LAYER_VS = /* glsl */ `#version 300 es
in vec2 aPos;
uniform mat3 uProj;   // píxeles de proyecto → clip space
uniform mat3 uModel;  // quad unitario → píxeles de proyecto
uniform mat3 uUv;     // uv de visualización → uv de textura
uniform float uExpand;
uniform float uTiles;
out vec2 vUv;
out vec2 vWorld;
void main() {
  vec2 q = aPos * uExpand;
  vec3 w = uModel * vec3(q, 1.0);
  vWorld = w.xy;
  vec3 p = uProj * w;
  gl_Position = vec4(p.xy, 0.0, 1.0);
  vec2 uv = (q + 0.5 - 0.5) * uTiles + 0.5;
  vUv = (uUv * vec3(uv, 1.0)).xy;
}`

export const LAYER_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vWorld;
uniform sampler2D uTex;
uniform float uOpacity;
uniform mat3 uClip;
uniform float uUseClip;
out vec4 outColor;
void main() {
  if (uUseClip > 0.5) {
    vec2 r = (uClip * vec3(vWorld, 1.0)).xy;
    if (abs(r.x) > 0.5 || abs(r.y) > 0.5) discard;
  }
  outColor = texture(uTex, vUv) * uOpacity;
}`
