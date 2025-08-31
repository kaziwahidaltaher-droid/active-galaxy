/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';

interface PlanetData {
  visualization: {
    color1: string;
    color2: string;
    atmosphereColor: string;
    hasRings: boolean;
  };
}

@customElement('axee-visuals-3d')
export class AxeeVisuals3D extends LitElement {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private composer!: EffectComposer;
  private starfield!: THREE.Points;
  private star!: THREE.Mesh;
  private planet: THREE.Group | null = null;
  private clock = new THREE.Clock();

  @property({type: Object})
  planetData: PlanetData | null = null;

  @property({type: Boolean})
  isScanning = false;

  static styles = css`
    canvas {
      width: 100% !important;
      height: 100% !important;
      position: absolute;
      inset: 0;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
  }

  private init() {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    this.camera.position.set(0, 5, 20);
    this.camera.lookAt(0, 0, 0);

    const canvas = this.shadowRoot!.querySelector(
      'canvas',
    ) as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({canvas, antialias: true});
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    // Starfield
    const starVertices = [];
    for (let i = 0; i < 10000; i++) {
      const x = THREE.MathUtils.randFloatSpread(2000);
      const y = THREE.MathUtils.randFloatSpread(2000);
      const z = THREE.MathUtils.randFloatSpread(2000);
      starVertices.push(x, y, z);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(starVertices, 3),
    );
    const starMaterial = new THREE.PointsMaterial({color: 0xaaaaaa, size: 0.7});
    this.starfield = new THREE.Points(starGeometry, starMaterial);
    this.scene.add(this.starfield);

    // Star
    const starGeometry3D = new THREE.IcosahedronGeometry(3, 15);
    const starMaterial3D = new THREE.MeshBasicMaterial({color: 0xfffde1});
    this.star = new THREE.Mesh(starGeometry3D, starMaterial3D);
    this.scene.add(this.star);

    // Lights
    const pointLight = new THREE.PointLight(0xffffff, 3, 300);
    this.scene.add(pointLight);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    this.scene.add(ambientLight);

    // Post-processing
    const renderPass = new RenderPass(this.scene, this.camera);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.5,
      0.4,
      0.85,
    );
    bloomPass.threshold = 0;
    bloomPass.strength = 1.2;
    bloomPass.radius = 0.5;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(renderPass);
    this.composer.addPass(bloomPass);

    window.addEventListener('resize', this.onWindowResize.bind(this));
    // FIX: Renamed `animate` to `_animate` to avoid conflict with HTMLElement.animate
    this._animate();
  }

  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  willUpdate(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('planetData') && this.planetData) {
      this.createPlanet(this.planetData);
    }
    if (changedProperties.has('planetData') && !this.planetData) {
      this.removePlanet();
    }
  }

  private createPlanet(data: PlanetData) {
    this.removePlanet();

    this.planet = new THREE.Group();
    const planetGeometry = new THREE.SphereGeometry(1, 32, 32);
    // Simple procedural texture
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const context = canvas.getContext('2d')!;
    const gradient = context.createLinearGradient(0, 0, 256, 0);
    gradient.addColorStop(0, data.visualization.color1);
    gradient.addColorStop(1, data.visualization.color2);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 128);
    const texture = new THREE.CanvasTexture(canvas);

    const planetMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.8,
      metalness: 0.1,
    });
    const planetMesh = new THREE.Mesh(planetGeometry, planetMaterial);
    this.planet.add(planetMesh);

    // Atmosphere
    const atmosphereGeometry = new THREE.SphereGeometry(1.05, 32, 32);
    const atmosphereMaterial = new THREE.MeshStandardMaterial({
      color: data.visualization.atmosphereColor,
      transparent: true,
      opacity: 0.3,
      side: THREE.BackSide,
    });
    const atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    this.planet.add(atmosphereMesh);

    if (data.visualization.hasRings) {
      const ringGeometry = new THREE.RingGeometry(1.5, 2, 64);
      const pos = ringGeometry.attributes.position as THREE.BufferAttribute;
      const v3 = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v3.fromBufferAttribute(pos, i);
        (ringGeometry.attributes.uv as THREE.BufferAttribute).setXY(
          i,
          v3.length() < 1.75 ? 0 : 1,
          1,
        );
      }

      const ringMaterial = new THREE.MeshBasicMaterial({
        color: data.visualization.color2,
        opacity: 0.6,
        transparent: true,
        side: THREE.DoubleSide,
      });
      const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
      ringMesh.rotation.x = Math.PI * 0.5;
      this.planet.add(ringMesh);
    }

    this.planet.position.x = 10;
    this.scene.add(this.planet);
  }

  private removePlanet() {
    if (this.planet) {
      this.scene.remove(this.planet);
      // Proper disposal would be better but this is fine for now
      this.planet = null;
    }
  }

  // FIX: Renamed `animate` to `_animate` to avoid conflict with HTMLElement.animate
  private _animate() {
    requestAnimationFrame(this._animate.bind(this));

    const delta = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    this.starfield.rotation.y += delta * 0.01;
    this.star.rotation.y += delta * 0.1;

    if (this.planet) {
      this.planet.rotation.y += delta * 0.5;
      this.planet.position.set(
        Math.cos(elapsed * 0.2) * 10,
        0,
        Math.sin(elapsed * 0.2) * 10,
      );
    }

    if (this.isScanning) {
      // Pulse the star during scan
      const pulse = Math.sin(elapsed * 5) * 0.1 + 1;
      this.star.scale.set(pulse, pulse, pulse);
    } else {
      this.star.scale.set(1, 1, 1);
    }

    this.composer.render();
  }

  protected firstUpdated() {
    this.init();
  }

  protected render() {
    return html`<canvas></canvas>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'axee-visuals-3d': AxeeVisuals3D;
  }
}
