/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const vs = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const fs = `
  uniform float uTime;
  uniform sampler2D uAudioData;
  uniform int uState; // 0: idle, 1: listening, 2: speaking

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPosition;

  float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
  }

  void main() {
    // Fresnel effect for a nice rim light
    float fresnel = 1.0 - dot(normalize(vViewPosition), vNormal);
    fresnel = pow(fresnel, 2.5);

    // Calculate overall audio level from the frequency data texture
    float audioLevel = 0.0;
    const int samples = 32; // Use a subset of samples for performance
    for(int i = 0; i < samples; i++) {
        audioLevel += texture(uAudioData, vec2(float(i) / float(samples), 0.5)).r;
    }
    audioLevel /= float(samples);

    // Create glowing bands based on UV coordinates and audio frequencies
    float bandFrequency = 20.0;
    float bandSpeed = -1.5;
    float highFreq = texture(uAudioData, vec2(0.8, 0.5)).r; // Sample high frequencies
    float lowFreq = texture(uAudioData, vec2(0.1, 0.5)).r;  // Sample low frequencies
    
    float bands = sin(vUv.y * (bandFrequency + lowFreq * 10.0) + uTime * bandSpeed);
    bands = smoothstep(0.0, 1.0, bands);
    bands *= (0.5 + highFreq * 2.5);

    vec3 baseColor = vec3(0.1, 0.5, 1.0); // Default idle color (cyan)
    float pulse = 1.0;
    if (uState == 1) { // Listening
        baseColor = vec3(0.2, 0.8, 1.0); // Brighter cyan/blue
    } else if (uState == 2) { // Speaking
        baseColor = vec3(0.2, 1.0, 0.5); // Green
        pulse = 1.0 + sin(uTime * 8.0) * 0.15; // Add a subtle, quick pulse effect
    }
    
    vec3 glowColor = mix(baseColor * 0.5, vec3(0.5, 1.0, 1.0), bands);

    // Combine effects
    vec3 finalColor = glowColor * (0.2 + audioLevel * 1.5);
    finalColor += fresnel * baseColor * (0.5 + audioLevel * 2.0);
    finalColor *= pulse; // Apply the pulse to the combined color
    finalColor += rand(vUv + uTime * 0.01) * 0.05; // Subtle noise

    // Final alpha based on fresnel and audio level for a soft look
    float alpha = fresnel * (0.3 + audioLevel * 0.7);
    alpha = clamp(alpha, 0.0, 1.0);

    gl_FragColor = vec4(finalColor, alpha);
  }
`;
