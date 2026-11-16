/** Shader base de capa: dibuja una textura transformada con opacidad (alfa premultiplicado). */
export const LAYER_VS = /* glsl */ `#version 300 es
in vec2 aPos;
uniform mat3 uMvp;   // píxeles de capa → clip space
uniform mat3 uUv;    // uv de visualización → uv de textura (rotación de metadatos)
out vec2 vUv;
void main() {
  vec3 p = uMvp * vec3(aPos, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
  vUv = (uUv * vec3(aPos + 0.5, 1.0)).xy;
}`

export const LAYER_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform float uOpacity;
out vec4 outColor;
void main() {
  outColor = texture(uTex, vUv) * uOpacity;
}`
