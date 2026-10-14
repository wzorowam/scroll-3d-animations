const NOISE = /* glsl */ `
float dissolveHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float dissolveNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = dissolveHash(i);
  float n100 = dissolveHash(i + vec3(1.0, 0.0, 0.0));
  float n010 = dissolveHash(i + vec3(0.0, 1.0, 0.0));
  float n110 = dissolveHash(i + vec3(1.0, 1.0, 0.0));
  float n001 = dissolveHash(i + vec3(0.0, 0.0, 1.0));
  float n101 = dissolveHash(i + vec3(1.0, 0.0, 1.0));
  float n011 = dissolveHash(i + vec3(0.0, 1.0, 1.0));
  float n111 = dissolveHash(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
}
float dissolveField(vec3 p) {
  return dissolveNoise(p) * 0.72 + dissolveNoise(p * 2.05) * 0.28;
}
`;

export function createDissolveUniform(cut = 0, edge = 0.07) {
  return {
    uCut: { value: cut },
    uEdge: { value: edge },
  };
}

/**
 * Binds a dissolve onto a MeshStandard / MeshPhysical material.
 * mode "conceal" discards where noise is below the cut (rust retreats).
 * mode "reveal" discards where noise is above the cut (polish arrives).
 * The cut is object-space so the pattern stays on the metal as it spins.
 */
export function applyDissolve(material, uniforms, mode) {
  const reveal = mode === 'reveal' ? 1 : 0;
  material.customProgramCacheKey = () => `studio-dissolve-${mode}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCut = uniforms.uCut;
    shader.uniforms.uEdge = uniforms.uEdge;
    shader.uniforms.uMode = { value: reveal };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vDissolveLocal;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vDissolveLocal = transformed;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vDissolveLocal;
        uniform float uCut;
        uniform float uEdge;
        uniform float uMode;
        ${NOISE}`,
      )
      .replace(
        '#include <opaque_fragment>',
        `
        float dField = dissolveField(vDissolveLocal * 4.6);
        if (uMode < 0.5) {
          if (dField < uCut) discard;
          float edge = 1.0 - smoothstep(uCut, uCut + uEdge, dField);
          outgoingLight += vec3(1.0, 0.38, 0.1) * edge * 2.1;
        } else {
          if (dField > uCut) discard;
          float edge = 1.0 - smoothstep(uCut - uEdge, uCut, dField);
          outgoingLight += vec3(1.0, 0.78, 0.48) * edge * 1.15;
        }
        #include <opaque_fragment>
        `,
      );
  };
  return material;
}
