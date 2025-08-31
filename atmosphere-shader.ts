/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const vs = `
  varying vec3 vNormal;
  varying vec3 vViewDirection;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    
    vNormal = normalize(normalMatrix * normal);
    vViewDirection = normalize(cameraPosition - worldPosition.xyz);
    
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const fs = `
  varying vec3 vNormal;
  varying vec3 vViewDirection;
  
  uniform vec3 uAtmosphereColor;

  void main() {
    // Calculate the fresnel effect
    float fresnel = 1.0 - dot(vNormal, vViewDirection);
    fresnel = pow(fresnel, 4.0); // Power controls the falloff sharpness
    
    // Use smoothstep for a softer edge
    float alpha = smoothstep(0.0, 1.0, fresnel);

    gl_FragColor = vec4(uAtmosphereColor, alpha);
  }
`;
