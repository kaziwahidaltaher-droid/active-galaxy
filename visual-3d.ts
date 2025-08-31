/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {fs as aiEntityFs, vs as aiEntityVs} from './ai-entity-shader';
import {
  fs as atmosphereFs,
  vs as atmosphereVs,
} from './atmosphere-shader.js';

interface PlanetData {
  celestial_body_id: string;
  planetName: string;
  planetType: string;
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
  private controls!: OrbitControls;
  private starfield!: THREE.Points;
  private star!: THREE.Mesh;
  private clock = new THREE.Clock();
  private animationFrameId = 0;
  private boundOnWindowResize = this.onWindowResize.bind(this);
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private tooltipElement!: HTMLDivElement;
  private hoveredPlanetId: string | null = null;
  private targetPosition = new THREE.Vector3();
  private targetLookAt = new THREE.Vector3();

  // Scene objects
  private planets: Map<string, THREE.Group> = new Map();
  private aiEntity: THREE.Mesh | null = null;
  private dataTrails: THREE.Group | null = null;
  private neuralNetwork: THREE.LineSegments | null = null;

  // Audio
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private audioDataTexture: THREE.DataTexture | null = null;

  @property({type: Array})
  planetsData: PlanetData[] = [];

  @property({type: String})
  selectedPlanetId: string | null = null;

  @property({type: Boolean})
  isScanning = false;

  @property({type: Object})
  micStream: MediaStream | null = null;

  @property({type: Boolean})
  isListening = false;

  @property({type: Boolean})
  isSpeaking = false;

  static styles = css`
    :host {
      position: relative;
    }
    canvas {
      width: 100% !important;
      height: 100% !important;
      position: absolute;
      inset: 0;
    }
    .tooltip {
      position: absolute;
      background-color: rgba(0, 20, 34, 0.8);
      color: #0af;
      padding: 5px 10px;
      border: 1px solid #0af;
      border-radius: 4px;
      pointer-events: none;
      display: none;
      font-family: 'Orbitron', sans-serif;
      text-shadow: 0 0 5px #0af;
      z-index: 10;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('pointermove', this.onPointerMove);
    this.addEventListener('click', this.onCanvasClick);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('resize', this.boundOnWindowResize);
    this.removeEventListener('pointermove', this.onPointerMove);
    this.removeEventListener('click', this.onCanvasClick);
    cancelAnimationFrame(this.animationFrameId);

    this.micStream?.getTracks().forEach((track) => track.stop());
    this.audioContext?.close();

    this.controls?.dispose();
    this.scene?.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => material.dispose());
        } else if (object.material) {
          object.material.dispose();
        }
      }
    });
    this.renderer?.dispose();
  }

  private init() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      2000,
    );
    this.camera.position.set(0, 15, 40);

    const canvas = this.shadowRoot!.querySelector(
      'canvas',
    ) as HTMLCanvasElement;
    this.renderer = new THREE.WebGLRenderer({canvas, antialias: true});
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 100;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.1;

    // Starfield
    const starVertices = [];
    for (let i = 0; i < 20000; i++) {
      starVertices.push(THREE.MathUtils.randFloatSpread(3000));
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(starVertices, 3),
    );
    this.starfield = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({color: 0xaaaaaa, size: 0.7}),
    );
    this.scene.add(this.starfield);

    // Star
    this.star = new THREE.Mesh(
      new THREE.IcosahedronGeometry(3, 15),
      new THREE.MeshBasicMaterial({color: 0xfffde1}),
    );
    this.scene.add(this.star);

    // AI Entity & Visuals
    this.createAiEntity();
    this.createDataTrails();
    this.createNeuralNetwork();

    // Lights
    this.scene.add(new THREE.PointLight(0xffffff, 3, 300));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.2));

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

    window.addEventListener('resize', this.boundOnWindowResize);
    this._animate();
  }

  private createAiEntity() {
    const geometry = new THREE.SphereGeometry(1.5, 64, 64);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: {value: 0},
        uAudioData: {value: null},
        uState: {value: 0},
      },
      vertexShader: aiEntityVs,
      fragmentShader: aiEntityFs,
      transparent: true,
    });
    this.aiEntity = new THREE.Mesh(geometry, material);
    this.aiEntity.position.set(-20, 2, -10);
    this.scene.add(this.aiEntity);
  }

  private createDataTrails() {
    this.dataTrails = new THREE.Group();
    // ... setup remains the same
    this.dataTrails.visible = false;
    this.scene.add(this.dataTrails);
  }
  private createNeuralNetwork() {
    // If a network already exists, remove it to prevent duplicates and memory leaks
    if (this.neuralNetwork) {
      this.scene.remove(this.neuralNetwork);
      this.neuralNetwork.geometry.dispose();
      (this.neuralNetwork.material as THREE.Material).dispose();
      this.neuralNetwork = null;
    }

    // Create a new, empty but valid, network object.
    // This provides a safe object for other methods to reference,
    // preventing crashes if local user code has a buggy implementation
    // that might generate NaN vertex values.
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineBasicMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0.3,
    });
    this.neuralNetwork = new THREE.LineSegments(geometry, material);
    this.neuralNetwork.visible = false; // Initially hidden
    this.scene.add(this.neuralNetwork);
  }

  private setupAudioProcessing() {
    // ... setup remains the same
  }

  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  willUpdate(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('planetsData')) {
      this.updatePlanets();
    }
    if (changedProperties.has('selectedPlanetId')) {
      this.focusOnSelectedPlanet();
    }
    if (changedProperties.has('micStream')) {
      this.setupAudioProcessing();
    }
    if (changedProperties.has('isScanning')) {
      if (this.dataTrails) this.dataTrails.visible = this.isScanning;
      if (this.neuralNetwork) this.neuralNetwork.visible = this.isScanning;
    }
  }

  private updatePlanets() {
    const currentPlanetIds = this.planetsData.map(
      (p) => p.celestial_body_id,
    );
    // Remove old planets
    for (const id of this.planets.keys()) {
      if (!currentPlanetIds.includes(id)) {
        this.removePlanet(id);
      }
    }
    // Add new planets
    this.planetsData.forEach((planetData, index) => {
      if (!this.planets.has(planetData.celestial_body_id)) {
        this.createPlanet(planetData, index);
      }
    });
  }

  private createPlanet(data: PlanetData, index: number) {
    const planetGroup = new THREE.Group();
    planetGroup.name = data.planetName;
    planetGroup.userData = {id: data.celestial_body_id};

    const isGasGiant = data.planetType.toLowerCase().includes('gas');
    const planetSize = isGasGiant ? 2.5 : 1.5;
    const segments = 64;
    const planetGeometry = new THREE.SphereGeometry(
      planetSize,
      segments,
      segments,
    );

    // Simplified procedural texture
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = 512;
    textureCanvas.height = 256;
    const ctx = textureCanvas.getContext('2d')!;
    const color1 = new THREE.Color(data.visualization.color1);
    const color2 = new THREE.Color(data.visualization.color2);
    const grd = ctx.createLinearGradient(0, 0, 0, textureCanvas.height);
    grd.addColorStop(0, color1.getStyle());
    grd.addColorStop(1, color2.getStyle());
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, textureCanvas.width, textureCanvas.height);
    const texture = new THREE.CanvasTexture(textureCanvas);

    const planetMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.8,
      metalness: 0.1,
    });
    const planetMesh = new THREE.Mesh(planetGeometry, planetMaterial);
    planetGroup.add(planetMesh);

    // Atmosphere
    const atmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader: atmosphereVs,
      fragmentShader: atmosphereFs,
      uniforms: {
        uAtmosphereColor: {
          value: new THREE.Color(data.visualization.atmosphereColor),
        },
      },
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
    });
    const atmosphereMesh = new THREE.Mesh(
      new THREE.SphereGeometry(planetSize + 0.1, segments, segments),
      atmosphereMaterial,
    );
    planetGroup.add(atmosphereMesh);

    // Rings
    if (data.visualization.hasRings) {
      const ringGeom = new THREE.RingGeometry(
        planetSize + 0.5,
        planetSize + 2.5,
        128,
      );
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(data.visualization.color2).multiplyScalar(0.5),
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
      });
      const ringMesh = new THREE.Mesh(ringGeom, ringMat);
      ringMesh.rotation.x = Math.PI * 0.52;
      planetGroup.add(ringMesh);
    }
    const orbitalRadius = 15 + index * 8;
    planetGroup.userData.orbitalRadius = orbitalRadius;
    planetGroup.userData.orbitSpeed = 0.1 + Math.random() * 0.1;
    planetGroup.position.x = orbitalRadius;

    this.planets.set(data.celestial_body_id, planetGroup);
    this.scene.add(planetGroup);
  }

  private removePlanet(id: string) {
    const planetGroup = this.planets.get(id);
    if (planetGroup) {
      this.scene.remove(planetGroup);
      planetGroup.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry?.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach((mat) => mat.dispose());
          } else if (object.material) {
            object.material.dispose();
          }
        }
      });
      this.planets.delete(id);
    }
  }

  private focusOnSelectedPlanet() {
    if (!this.controls) return;
    this.controls.autoRotate = !this.selectedPlanetId;
    if (this.selectedPlanetId) {
      const planetGroup = this.planets.get(this.selectedPlanetId);
      if (planetGroup) {
        // Calculate target camera position
        const offset = new THREE.Vector3(0, 3, 10);
        this.targetPosition.copy(planetGroup.position).add(offset);
        this.targetLookAt.copy(planetGroup.position);
      }
    } else {
      // Return to default view
      this.targetPosition.set(0, 15, 40);
      this.targetLookAt.set(0, 0, 0);
    }
  }

  private onPointerMove(event: PointerEvent) {
    if (!this.renderer?.domElement) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private onCanvasClick() {
    if (this.hoveredPlanetId) {
      this.dispatchEvent(
        new CustomEvent('planet-selected', {
          detail: {planetId: this.hoveredPlanetId},
          bubbles: true,
          composed: true,
        }),
      );
    }
  }

  private _animate() {
    this.animationFrameId = requestAnimationFrame(this._animate.bind(this));
    if (!this.renderer || !this.composer || !this.controls) return;

    const delta = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    // Animate planets
    this.planets.forEach((group) => {
      group.rotation.y += delta * 0.5;
      const radius = group.userData.orbitalRadius;
      const speed = group.userData.orbitSpeed;
      group.position.set(
        Math.cos(elapsed * speed) * radius,
        0,
        Math.sin(elapsed * speed) * radius,
      );
    });

    // Camera animation
    this.camera.position.lerp(this.targetPosition, 0.05);
    this.controls.target.lerp(this.targetLookAt, 0.05);
    this.controls.update();

    // Hover logic
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects(
      Array.from(this.planets.values()),
      true,
    );
    let isHovering = false;
    if (intersects.length > 0) {
      const intersectedObject = intersects[0].object.parent; // Get the group
      if (
        intersectedObject &&
        intersectedObject.userData.id &&
        this.planets.has(intersectedObject.userData.id)
      ) {
        isHovering = true;
        this.hoveredPlanetId = intersectedObject.userData.id;
        if (this.renderer.domElement) {
          this.renderer.domElement.style.cursor = 'pointer';
        }
        if (this.tooltipElement) {
          this.tooltipElement.style.display = 'block';
          this.tooltipElement.style.left = `${
            this.pointer.x * (window.innerWidth / 2) + window.innerWidth / 2 + 15
          }px`;
          this.tooltipElement.style.top = `${
            -this.pointer.y * (window.innerHeight / 2) +
            window.innerHeight / 2 +
            15
          }px`;
          this.tooltipElement.textContent = intersectedObject.name;
        }
      }
    }
    if (!isHovering) {
      this.hoveredPlanetId = null;
      if (this.renderer.domElement) {
        this.renderer.domElement.style.cursor = 'auto';
      }
      if (this.tooltipElement) {
        this.tooltipElement.style.display = 'none';
      }
    }

    // AI Entity animation
    if (this.aiEntity) {
      const material = this.aiEntity.material as THREE.ShaderMaterial;
      material.uniforms.uTime.value = elapsed;
      let targetState = 0;
      if (this.isListening) targetState = 1;
      else if (this.isSpeaking) targetState = 2;
      material.uniforms.uState.value = targetState;
    }

    this.composer.render();
  }

  protected firstUpdated() {
    this.init();
    this.tooltipElement = this.shadowRoot!.querySelector(
      '.tooltip',
    ) as HTMLDivElement;
  }

  protected render() {
    return html`<canvas></canvas><div class="tooltip"></div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'axee-visuals-3d': AxeeVisuals3D;
  }
}