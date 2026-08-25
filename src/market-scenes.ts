import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import marketModelUrl from "../assets/market-scene/market.gltf.glb";
import wallGateModelUrl from "../assets/market-scene/wall_gate.gltf.glb";
import wellModelUrl from "../assets/market-scene/well.gltf.glb";

export type MarketSceneVariant = "intended" | "guessed";

export interface MarketSceneConfig {
  variant: MarketSceneVariant;
  background: number;
  routeColor: number;
  accentColor: number;
}

export interface MarketAssetSet {
  market: THREE.Group;
  well: THREE.Group;
  gate: THREE.Group;
}

export interface MarketSceneViewport {
  variant: MarketSceneVariant;
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  status: HTMLElement;
  statusText: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer | null;
  controls: OrbitControls | null;
}

const MARKET_CONFIGS: Record<MarketSceneVariant, MarketSceneConfig> = {
  intended: {
    variant: "intended",
    background: 0xf4f3ef,
    routeColor: 0x4f8f98,
    accentColor: 0x1f6670
  },
  guessed: {
    variant: "guessed",
    background: 0xf7f1ef,
    routeColor: 0xb05a4e,
    accentColor: 0x9c3a2e
  }
};

const INITIAL_CAMERA_POSITION = new THREE.Vector3(8.6, 7.7, 10.6);
const INITIAL_CAMERA_TARGET = new THREE.Vector3(0, 0.65, 0.35);

/**
 * Manages the paired market scenes on the problem slide. The two renderers are
 * independent, while their OrbitControls remain locked to one camera pose.
 */
export class MarketSceneComparison {
  private readonly slide: HTMLElement;
  private readonly viewports: Record<MarketSceneVariant, MarketSceneViewport>;
  private readonly resizeObserver: ResizeObserver;

  private assetsReady = false;
  private isActive = false;
  private isSynchronizing = false;
  private activeControlVariant: MarketSceneVariant = "intended";
  private animationFrame = 0;

  private constructor(slide: HTMLElement, intendedCanvas: HTMLCanvasElement, guessedCanvas: HTMLCanvasElement) {
    this.slide = slide;
    this.viewports = {
      intended: this.createViewport("intended", intendedCanvas),
      guessed: this.createViewport("guessed", guessedCanvas)
    };
    this.resizeObserver = new ResizeObserver(() => this.resizeViewports());
  }

  static mount(): MarketSceneComparison | null {
    const intendedCanvas = document.querySelector<HTMLCanvasElement>(
      "canvas[data-market-scene='intended']"
    );
    const guessedCanvas = document.querySelector<HTMLCanvasElement>(
      "canvas[data-market-scene='guessed']"
    );
    const slide = intendedCanvas?.closest<HTMLElement>(".slide");

    if (!intendedCanvas || !guessedCanvas || !slide) return null;
    return new MarketSceneComparison(slide, intendedCanvas, guessedCanvas);
  }

  initialize(): void {
    this.bindLifecycle();
    this.bindInteractionGuards();
    this.bindSynchronizedControls();
    this.resizeObserver.observe(this.viewports.intended.container);
    this.resizeObserver.observe(this.viewports.guessed.container);

    const resetButton = this.slide.querySelector<HTMLButtonElement>("[data-market-scene-reset]");
    resetButton?.addEventListener("click", () => this.resetView());

    if (!this.viewports.intended.renderer || !this.viewports.guessed.renderer) return;
    void this.loadAssets();
  }

  private createViewport(
    variant: MarketSceneVariant,
    canvas: HTMLCanvasElement
  ): MarketSceneViewport {
    const container = canvas.closest<HTMLElement>("[data-market-scene-viewport]");
    const status = container?.querySelector<HTMLElement>("[data-market-scene-status]");
    const statusText = status?.querySelector<HTMLElement>("[data-market-scene-status-text]");

    if (!container || !status || !statusText) {
      throw new Error(`The ${variant} market viewport is missing its status UI.`);
    }

    const config = MARKET_CONFIGS[variant];
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(config.background);

    const camera = new THREE.PerspectiveCamera(37, 16 / 9, 0.1, 80);
    camera.position.copy(INITIAL_CAMERA_POSITION);
    camera.lookAt(INITIAL_CAMERA_TARGET);

    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer: true
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setClearColor(config.background, 1);

      controls = new OrbitControls(camera, canvas);
      controls.target.copy(INITIAL_CAMERA_TARGET);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.enableZoom = true;
      controls.autoRotate = false;
      controls.minDistance = 4.5;
      controls.maxDistance = 18;
      controls.minPolarAngle = 0.42;
      controls.maxPolarAngle = 1.3;
      controls.update();
      controls.saveState();

      this.addLighting(scene);
      this.addSharedEnvironment(scene, config);
    } catch (error) {
      console.error(`Unable to create the ${variant} WebGL scene.`, error);
      container.dataset.state = "error";
      statusText.textContent = "Interactive 3D is unavailable in this browser.";
    }

    return {
      variant,
      container,
      canvas,
      status,
      statusText,
      scene,
      camera,
      renderer,
      controls
    };
  }

  private addLighting(scene: THREE.Scene): void {
    const hemisphere = new THREE.HemisphereLight(0xdceafa, 0x665442, 2.25);
    scene.add(hemisphere);

    const key = new THREE.DirectionalLight(0xfff5e4, 3.1);
    key.position.set(-4.5, 9.5, 6.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -7;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 24;
    key.shadow.bias = -0.0004;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xbfd4e7, 1.15);
    fill.position.set(7, 5, -6);
    scene.add(fill);
  }

  private addSharedEnvironment(scene: THREE.Scene, config: MarketSceneConfig): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 8.8),
      new THREE.MeshStandardMaterial({ color: 0xe6e1d7, roughness: 1, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.035;
    ground.receiveShadow = true;
    scene.add(ground);

    const route = new THREE.Mesh(
      new THREE.PlaneGeometry(8.5, 1.2),
      new THREE.MeshStandardMaterial({
        color: config.routeColor,
        roughness: 0.92,
        transparent: true,
        opacity: config.variant === "intended" ? 0.46 : 0.35,
        depthWrite: false
      })
    );
    route.rotation.x = -Math.PI / 2;
    route.position.set(0, 0.012, 3.1);
    route.renderOrder = 1;
    scene.add(route);

    const routeClearance = new THREE.Mesh(
      new THREE.BoxGeometry(8.5, 0.52, 1.2),
      new THREE.MeshBasicMaterial({
        color: config.routeColor,
        transparent: true,
        opacity: config.variant === "intended" ? 0.055 : 0.035,
        depthWrite: false
      })
    );
    routeClearance.position.set(0, 0.26, 3.1);
    routeClearance.renderOrder = 2;
    scene.add(routeClearance);

    const grid = new THREE.GridHelper(11, 22, 0x9d9b94, 0xc7c3ba);
    grid.position.y = 0.002;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.24;
      material.depthWrite = false;
    });
    scene.add(grid);
  }

  private async loadAssets(): Promise<void> {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => {
      const percentage = total > 0 ? Math.round((loaded / total) * 100) : 0;
      this.setViewportState("loading", `Loading medieval assets · ${percentage}%`);
    };
    manager.onError = (url) => console.warn("A market-scene asset could not be loaded:", url);

    const loader = new GLTFLoader(manager);
    let assets: MarketAssetSet;
    let usedFallback = false;

    try {
      const [market, well, gate] = await Promise.all([
        this.loadGroundedAsset(loader, marketModelUrl, 2.6),
        this.loadGroundedAsset(loader, wellModelUrl, 1.55),
        this.loadGroundedAsset(loader, wallGateModelUrl, 3.4)
      ]);
      assets = { market, well, gate };
    } catch (error) {
      console.error("Using procedural market assets because the GLBs failed to load.", error);
      assets = this.createFallbackAssets();
      usedFallback = true;
    }

    this.populateScene(this.viewports.intended.scene, assets, "intended");
    this.populateScene(this.viewports.guessed.scene, assets, "guessed");
    this.assetsReady = true;
    this.setViewportState(
      usedFallback ? "fallback" : "ready",
      usedFallback ? "GLB unavailable · schematic fallback" : "3D comparison ready"
    );
    this.resizeViewports();

    if (this.isActive) this.startRendering();
  }

  private async loadGroundedAsset(
    loader: GLTFLoader,
    url: string,
    normalizedHorizontalSize: number
  ): Promise<THREE.Group> {
    const gltf = await loader.loadAsync(url);
    const content = gltf.scene;

    content.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });

    content.updateMatrixWorld(true);
    const originalBounds = new THREE.Box3().setFromObject(content);
    const originalSize = originalBounds.getSize(new THREE.Vector3());
    const horizontalSize = Math.max(originalSize.x, originalSize.z);
    if (!Number.isFinite(horizontalSize) || horizontalSize <= 0) {
      throw new Error("A market GLB has invalid bounds.");
    }

    content.scale.multiplyScalar(normalizedHorizontalSize / horizontalSize);
    content.updateMatrixWorld(true);

    const groundedBounds = new THREE.Box3().setFromObject(content);
    const center = groundedBounds.getCenter(new THREE.Vector3());
    content.position.x -= center.x;
    content.position.y -= groundedBounds.min.y;
    content.position.z -= center.z;
    content.updateMatrixWorld(true);

    const wrapper = new THREE.Group();
    wrapper.add(content);
    return wrapper;
  }

  private populateScene(
    scene: THREE.Scene,
    assets: MarketAssetSet,
    variant: MarketSceneVariant
  ): void {
    if (variant === "intended") {
      this.addAssetInstance(scene, assets.market, [-2.4, 0, -1.2], Math.PI / 2);
      this.addAssetInstance(scene, assets.market, [2.4, 0, -1.2], -Math.PI / 2);
      this.addAssetInstance(scene, assets.well, [0, 0, 0.3], 0);
      this.addAssetInstance(scene, assets.gate, [4.4, 0, 3.1], 0);
      scene.add(this.createCrate(-3.25, 0.25, 0.35, 0.02));
      scene.add(this.createCrate(-2.68, 0.25, 0.45, -0.08));
      return;
    }

    this.addAssetInstance(
      scene,
      assets.market,
      [-1.8, 0, 2.4],
      Math.PI / 2,
      1.55
    );
    this.addAssetInstance(
      scene,
      assets.market,
      [1.1, 0, 0.2],
      THREE.MathUtils.degToRad(25)
    );
    this.addAssetInstance(scene, assets.well, [1.3, 0, 0.25], 0);
    this.addAssetInstance(scene, assets.gate, [4.4, 0, 3.1], 0);

    const crateA = this.createCrate(3.05, 0.25, 3.05, 0.08);
    const crateB = this.createCrate(3.62, 0.25, 3.16, -0.1);
    scene.add(crateA, crateB);

    this.addObstructionVolume(scene, new THREE.Vector3(1.22, 0.65, 0.22), new THREE.Vector3(1.4, 1.3, 1.35));
    this.addObstructionVolume(scene, new THREE.Vector3(3.34, 0.5, 3.1), new THREE.Vector3(1.45, 1, 1.15));
  }

  private addAssetInstance(
    scene: THREE.Scene,
    source: THREE.Group,
    position: [number, number, number],
    yaw: number,
    scale = 1
  ): THREE.Group {
    const instance = source.clone(true);
    instance.position.set(...position);
    instance.rotation.y = yaw;
    instance.scale.setScalar(scale);
    scene.add(instance);
    return instance;
  }

  private createCrate(x: number, y: number, z: number, yaw: number): THREE.Group {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xaa7442, roughness: 0.9, metalness: 0 })
    );
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(body.geometry),
      new THREE.LineBasicMaterial({ color: 0x684327, transparent: true, opacity: 0.8 })
    );
    group.add(edges);
    group.position.set(x, y, z);
    group.rotation.y = yaw;
    return group;
  }

  private addObstructionVolume(
    scene: THREE.Scene,
    position: THREE.Vector3,
    size: THREE.Vector3
  ): void {
    const volume = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshBasicMaterial({
        color: 0xb34336,
        transparent: true,
        opacity: 0.11,
        depthWrite: false
      })
    );
    volume.position.copy(position);
    volume.renderOrder = 5;
    scene.add(volume);
  }

  private createFallbackAssets(): MarketAssetSet {
    return {
      market: this.createFallbackMarket(),
      well: this.createFallbackWell(),
      gate: this.createFallbackGate()
    };
  }

  private createFallbackMarket(): THREE.Group {
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x9d6337, roughness: 0.9 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0xd6a35f, roughness: 0.8 });
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.75, 1.25), wood);
    counter.position.y = 0.375;
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.18, 1.55), cloth);
    canopy.position.y = 1.65;
    group.add(counter, canopy);
    [-1.05, 1.05].forEach((x) => {
      [-0.58, 0.58].forEach((z) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.55, 0.11), wood);
        post.position.set(x, 0.86, z);
        group.add(post);
      });
    });
    this.enableFallbackShadows(group);
    return group;
  }

  private createFallbackWell(): THREE.Group {
    const group = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: 0x8ea2a8, roughness: 0.95 });
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.84, 0.48, 20), stone);
    rim.position.y = 0.24;
    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 0.03, 20),
      new THREE.MeshStandardMaterial({ color: 0x4d95ad, roughness: 0.3, metalness: 0.05 })
    );
    water.position.y = 0.49;
    group.add(rim, water);
    this.enableFallbackShadows(group);
    return group;
  }

  private createFallbackGate(): THREE.Group {
    const group = new THREE.Group();
    const stone = new THREE.MeshStandardMaterial({ color: 0x8c8172, roughness: 1 });
    [-1.3, 1.3].forEach((x) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.58, 2.75, 0.72), stone);
      post.position.set(x, 1.375, 0);
      group.add(post);
    });
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.62, 0.72), stone);
    lintel.position.y = 2.5;
    group.add(lintel);
    this.enableFallbackShadows(group);
    return group;
  }

  private enableFallbackShadows(group: THREE.Group): void {
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
  }

  private bindLifecycle(): void {
    this.slide.addEventListener("slide:enter", () => {
      this.isActive = true;
      this.resizeViewports();
      if (this.assetsReady) this.startRendering();
    });
    this.slide.addEventListener("slide:leave", () => {
      this.isActive = false;
      this.stopRendering();
      this.freezeCameraMomentum();
    });
  }

  private freezeCameraMomentum(): void {
    const activeViewport = this.viewports[this.activeControlVariant];
    const passiveVariant: MarketSceneVariant = this.activeControlVariant === "intended"
      ? "guessed"
      : "intended";
    const controls = activeViewport.controls;
    if (!controls) return;

    const cameraPosition = activeViewport.camera.position.clone();
    const cameraQuaternion = activeViewport.camera.quaternion.clone();
    const cameraZoom = activeViewport.camera.zoom;
    const controlTarget = controls.target.clone();
    const dampingWasEnabled = controls.enableDamping;

    this.isSynchronizing = true;
    controls.enableDamping = false;
    controls.update();
    activeViewport.camera.position.copy(cameraPosition);
    activeViewport.camera.quaternion.copy(cameraQuaternion);
    activeViewport.camera.zoom = cameraZoom;
    activeViewport.camera.updateProjectionMatrix();
    activeViewport.camera.updateMatrixWorld();
    controls.target.copy(controlTarget);
    controls.enableDamping = dampingWasEnabled;
    this.isSynchronizing = false;

    this.synchronizeCamera(activeViewport, this.viewports[passiveVariant]);
    this.updateCameraDiagnostics();
  }

  private bindInteractionGuards(): void {
    (Object.values(this.viewports) as MarketSceneViewport[]).forEach((viewport) => {
      viewport.canvas.addEventListener("pointerdown", () => {
        this.activeControlVariant = viewport.variant;
      });
      ["click", "dblclick", "wheel", "touchstart", "touchmove", "touchend"].forEach((eventName) => {
        viewport.canvas.addEventListener(eventName, (event) => {
          this.activeControlVariant = viewport.variant;
          event.stopPropagation();
        }, {
          passive: eventName === "wheel" || eventName.startsWith("touch")
        });
      });
    });
  }

  private bindSynchronizedControls(): void {
    const intendedControls = this.viewports.intended.controls;
    const guessedControls = this.viewports.guessed.controls;
    if (!intendedControls || !guessedControls) return;

    intendedControls.addEventListener("change", () => {
      this.synchronizeCamera(this.viewports.intended, this.viewports.guessed);
    });
    guessedControls.addEventListener("change", () => {
      this.synchronizeCamera(this.viewports.guessed, this.viewports.intended);
    });
  }

  private synchronizeCamera(source: MarketSceneViewport, destination: MarketSceneViewport): void {
    if (this.isSynchronizing || !source.controls || !destination.controls) return;

    this.isSynchronizing = true;
    destination.camera.position.copy(source.camera.position);
    destination.camera.quaternion.copy(source.camera.quaternion);
    destination.camera.zoom = source.camera.zoom;
    destination.camera.updateProjectionMatrix();
    destination.camera.updateMatrixWorld();
    destination.controls.target.copy(source.controls.target);
    this.updateCameraDiagnostics();
    this.isSynchronizing = false;
  }

  private resetView(): void {
    this.isSynchronizing = true;
    (Object.values(this.viewports) as MarketSceneViewport[]).forEach((viewport) => {
      if (!viewport.controls) return;
      const dampingWasEnabled = viewport.controls.enableDamping;
      viewport.controls.enableDamping = false;
      viewport.controls.reset();
      viewport.controls.enableDamping = dampingWasEnabled;
    });
    this.isSynchronizing = false;
    this.synchronizeCamera(this.viewports.intended, this.viewports.guessed);
    this.activeControlVariant = "intended";
    this.updateCameraDiagnostics();
    if (this.isActive && this.assetsReady) this.renderFrame();
  }

  private resizeViewports(): void {
    (Object.values(this.viewports) as MarketSceneViewport[]).forEach((viewport) => {
      if (!viewport.renderer) return;
      const width = Math.max(1, Math.round(viewport.canvas.clientWidth));
      const height = Math.max(1, Math.round(viewport.canvas.clientHeight));
      const drawingBuffer = new THREE.Vector2();
      viewport.renderer.getSize(drawingBuffer);

      if (drawingBuffer.x !== width || drawingBuffer.y !== height) {
        viewport.renderer.setSize(width, height, false);
        viewport.camera.aspect = width / height;
        viewport.camera.updateProjectionMatrix();
      }
    });

    if (this.isActive && this.assetsReady) this.renderFrame();
  }

  private startRendering(): void {
    if (this.animationFrame || !this.isActive || !this.assetsReady) return;

    const loop = (): void => {
      if (!this.isActive) {
        this.animationFrame = 0;
        return;
      }
      this.renderFrame();
      this.animationFrame = window.requestAnimationFrame(loop);
    };
    this.animationFrame = window.requestAnimationFrame(loop);
    this.setRenderingDiagnostic(true);
  }

  private stopRendering(): void {
    if (this.animationFrame) window.cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    this.setRenderingDiagnostic(false);
  }

  private renderFrame(): void {
    const activeViewport = this.viewports[this.activeControlVariant];
    const passiveVariant: MarketSceneVariant = this.activeControlVariant === "intended"
      ? "guessed"
      : "intended";
    const passiveViewport = this.viewports[passiveVariant];

    activeViewport.controls?.update();
    this.synchronizeCamera(activeViewport, passiveViewport);

    (Object.values(this.viewports) as MarketSceneViewport[]).forEach((viewport) => {
      viewport.renderer?.render(viewport.scene, viewport.camera);
    });
    this.updateCameraDiagnostics();
  }

  private setViewportState(state: "loading" | "ready" | "fallback", message: string): void {
    (Object.values(this.viewports) as MarketSceneViewport[]).forEach((viewport) => {
      viewport.container.dataset.state = state;
      viewport.statusText.textContent = message;
    });
  }

  private setRenderingDiagnostic(isRendering: boolean): void {
    (Object.values(this.viewports) as MarketSceneViewport[]).forEach((viewport) => {
      viewport.canvas.dataset.rendering = String(isRendering);
    });
  }

  private updateCameraDiagnostics(): void {
    (Object.values(this.viewports) as MarketSceneViewport[]).forEach((viewport) => {
      const p = viewport.camera.position;
      const q = viewport.camera.quaternion;
      const t = viewport.controls?.target ?? INITIAL_CAMERA_TARGET;
      viewport.canvas.dataset.cameraState = [
        p.x, p.y, p.z,
        q.x, q.y, q.z, q.w,
        viewport.camera.zoom,
        t.x, t.y, t.z
      ].map((value) => value.toFixed(4)).join(",");
    });
  }
}
