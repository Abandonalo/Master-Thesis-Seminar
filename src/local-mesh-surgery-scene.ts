import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

interface LocalSurgeryStage {
  title: string;
}

const STAGES: LocalSurgeryStage[] = [
  { title: "Triangle mesh" },
  { title: "Exact OBB cut" },
  { title: "Fit replacement" },
  { title: "Zipper weld" },
  { title: "Reconstruct appearance" },
  { title: "Seam check" }
];

const BASE_WIDTH = 4;
const BASE_HEIGHT = 2.6;
const BASE_DEPTH = 3;
const SOURCE_ROOF_WIDTH = 4.45;
const SOURCE_ROOF_DEPTH = 3.42;
const SOURCE_ROOF_HEIGHT = 1.45;
const REPLACEMENT_WIDTH = 3.68;
const REPLACEMENT_DEPTH = 2.76;
const TRANSITION_HEIGHT = 0.2;

/**
 * Reuses one procedural house to explain every phase of local mesh surgery.
 * The scene is intentionally illustrative: its geometry mirrors the source loop,
 * inset replacement loop, and unequal-count zipper used by the Unity implementation.
 */
export class LocalMeshSurgeryScene {
  private readonly slide: HTMLElement;
  private readonly container: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly statusText: HTMLElement;
  private readonly stateIndex: HTMLElement;
  private readonly stateTitle: HTMLElement;
  private readonly buttons: HTMLButtonElement[];
  private readonly resizeObserver: ResizeObserver;

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 80);
  private renderer: THREE.WebGLRenderer | null = null;
  private controls: OrbitControls | null = null;
  private animationFrame = 0;
  private isActive = false;
  private stageIndex = 0;
  private triangleHighlightsVisible = false;
  private pointerStart: THREE.Vector2 | null = null;
  private replacementTargetY = BASE_HEIGHT + TRANSITION_HEIGHT;

  private readonly modelRoot = new THREE.Group();
  private readonly baseGroup = new THREE.Group();
  private readonly sourceRoofGroup = new THREE.Group();
  private readonly replacementGroup = new THREE.Group();
  private readonly transitionGroup = new THREE.Group();
  private readonly obbGroup = new THREE.Group();
  private readonly sourceLoopGroup = new THREE.Group();
  private readonly replacementLoopGroup = new THREE.Group();
  private readonly finalLoopGroup = new THREE.Group();
  private readonly triangleExplanationGroup = new THREE.Group();
  private readonly projectionGroup = new THREE.Group();

  private readonly replacementMaterial = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.76,
    metalness: 0,
    flatShading: true,
    side: THREE.DoubleSide
  });
  private readonly transitionMaterial = new THREE.MeshStandardMaterial({
    color: 0x0e9f6e,
    roughness: 0.72,
    metalness: 0,
    flatShading: true,
    side: THREE.DoubleSide
  });

  private constructor(
    slide: HTMLElement,
    container: HTMLElement,
    canvas: HTMLCanvasElement
  ) {
    this.slide = slide;
    this.container = container;
    this.canvas = canvas;
    this.statusText = this.requireDescendant("[data-local-surgery-status-text]");
    this.stateIndex = this.requireDescendant("[data-local-surgery-state-index]");
    this.stateTitle = this.requireDescendant("[data-local-surgery-state-title]");
    this.buttons = Array.from(
      slide.querySelectorAll<HTMLButtonElement>("[data-local-surgery-step]")
    );
    this.resizeObserver = new ResizeObserver(() => this.resize());
  }

  static mount(): LocalMeshSurgeryScene | null {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-local-surgery-scene]");
    const container = canvas?.closest<HTMLElement>("[data-local-surgery-viewport]");
    const slide = canvas?.closest<HTMLElement>(".refinement-locality-slide");
    return canvas && container && slide
      ? new LocalMeshSurgeryScene(slide, container, canvas)
      : null;
  }

  initialize(): void {
    this.bindLifecycle();
    this.bindStepControls();
    this.resizeObserver.observe(this.container);

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        preserveDrawingBuffer: true
      });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.03;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

      this.buildScene();
      this.setupControls();
      this.setStage(0);
      this.container.dataset.state = "ready";
      this.resize();
      this.renderer.render(this.scene, this.camera);
    } catch (error) {
      console.error("Unable to create the local mesh surgery scene.", error);
      this.container.dataset.state = "error";
      this.statusText.textContent = "Interactive 3D is unavailable in this browser.";
    }
  }

  private bindLifecycle(): void {
    this.slide.addEventListener("slide:enter", () => this.start());
    this.slide.addEventListener("slide:leave", () => this.stop());
  }

  private bindStepControls(): void {
    this.buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const requested = Number.parseInt(button.dataset.localSurgeryStep || "0", 10);
        const nextStage = Number.isFinite(requested) ? requested : 0;
        if (nextStage !== 0) this.triangleHighlightsVisible = false;
        this.setStage(nextStage);
        if (nextStage === 0) this.revealTriangleExplanation();
        button.blur();
      });
    });
  }

  private setupControls(): void {
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.set(0, 2.05, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enableRotate = true;
    this.controls.enableZoom = true;
    this.controls.enablePan = false;
    this.controls.autoRotate = false;
    this.controls.minDistance = 4.8;
    this.controls.maxDistance = 16;
    this.controls.minPolarAngle = 0.28;
    this.controls.maxPolarAngle = 1.5;
    this.controls.update();
    this.controls.saveState();

    this.canvas.addEventListener("dblclick", () => {
      this.controls?.reset();
    });

    this.canvas.addEventListener("pointerdown", (event) => {
      this.pointerStart = new THREE.Vector2(event.clientX, event.clientY);
    });

    this.canvas.addEventListener("pointerup", (event) => {
      if (!this.pointerStart) return;
      const movement = this.pointerStart.distanceTo(
        new THREE.Vector2(event.clientX, event.clientY)
      );
      this.pointerStart = null;
      if (movement <= 6 && this.stageIndex === 0) this.revealTriangleExplanation();
    });

    this.canvas.addEventListener("pointercancel", () => {
      this.pointerStart = null;
    });
  }

  private revealTriangleExplanation(): void {
    if (this.stageIndex !== 0 || this.triangleHighlightsVisible) return;
    this.triangleHighlightsVisible = true;
    this.triangleExplanationGroup.visible = true;
    if (!this.isActive && this.renderer) this.renderer.render(this.scene, this.camera);
  }

  private buildScene(): void {
    this.scene.background = new THREE.Color(0xf4f7fb);
    this.camera.position.set(-7.5, 5.5, 5);
    this.camera.lookAt(0, 2.05, 0);

    const hemisphere = new THREE.HemisphereLight(0xeaf3ff, 0x756654, 2.25);
    this.scene.add(hemisphere);

    const key = new THREE.DirectionalLight(0xfff4e4, 3.15);
    key.position.set(-5.2, 9, 6.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 24;
    key.shadow.bias = -0.0004;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xb9d1ec, 1.05);
    fill.position.set(6, 4, -5);
    this.scene.add(fill);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 9),
      new THREE.MeshStandardMaterial({ color: 0xe7edf4, roughness: 1, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(12, 24, 0xaebdcd, 0xcfdae5);
    grid.position.y = -0.012;
    const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMaterials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.32;
      material.depthWrite = false;
    });
    this.scene.add(grid);

    this.modelRoot.rotation.y = -0.52;
    this.scene.add(this.modelRoot);
    this.buildBase();
    this.buildRoofs();
    this.buildBoundaryLoops();
    this.buildTransition();
    this.buildObb();
    this.buildTriangleExplanation();
    this.buildProjectionArrows();

    this.modelRoot.add(
      this.baseGroup,
      this.sourceRoofGroup,
      this.replacementGroup,
      this.transitionGroup,
      this.obbGroup,
      this.sourceLoopGroup,
      this.replacementLoopGroup,
      this.finalLoopGroup,
      this.triangleExplanationGroup,
      this.projectionGroup
    );
  }

  private buildBase(): void {
    const sourceMaterial = new THREE.MeshStandardMaterial({
      color: 0xaabdd0,
      roughness: 0.82,
      metalness: 0,
      flatShading: true,
      side: THREE.DoubleSide
    });
    const wireMaterial = new THREE.LineBasicMaterial({
      color: 0x365a7d,
      transparent: true,
      opacity: 0.55
    });

    const addWall = (
      geometry: THREE.BufferGeometry,
      position: THREE.Vector3,
      rotation: THREE.Euler
    ): void => {
      const mesh = new THREE.Mesh(geometry, sourceMaterial);
      mesh.position.copy(position);
      mesh.rotation.copy(rotation);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geometry), wireMaterial);
      wire.renderOrder = 3;
      mesh.add(wire);
      this.baseGroup.add(mesh);
    };

    addWall(
      new THREE.PlaneGeometry(BASE_WIDTH, BASE_HEIGHT, 5, 3),
      new THREE.Vector3(0, BASE_HEIGHT / 2, BASE_DEPTH / 2),
      new THREE.Euler(0, 0, 0)
    );
    addWall(
      new THREE.PlaneGeometry(BASE_WIDTH, BASE_HEIGHT, 5, 3),
      new THREE.Vector3(0, BASE_HEIGHT / 2, -BASE_DEPTH / 2),
      new THREE.Euler(0, Math.PI, 0)
    );
    addWall(
      new THREE.PlaneGeometry(BASE_DEPTH, BASE_HEIGHT, 4, 3),
      new THREE.Vector3(BASE_WIDTH / 2, BASE_HEIGHT / 2, 0),
      new THREE.Euler(0, Math.PI / 2, 0)
    );
    addWall(
      new THREE.PlaneGeometry(BASE_DEPTH, BASE_HEIGHT, 4, 3),
      new THREE.Vector3(-BASE_WIDTH / 2, BASE_HEIGHT / 2, 0),
      new THREE.Euler(0, -Math.PI / 2, 0)
    );

    const bottomGeometry = new THREE.PlaneGeometry(BASE_WIDTH, BASE_DEPTH, 5, 4);
    addWall(
      bottomGeometry,
      new THREE.Vector3(0, 0, 0),
      new THREE.Euler(Math.PI / 2, 0, 0)
    );
  }

  private buildRoofs(): void {
    const sourceMaterial = new THREE.MeshStandardMaterial({
      color: 0x8fa9c2,
      roughness: 0.8,
      metalness: 0,
      flatShading: true,
      side: THREE.DoubleSide
    });
    const sourceGeometry = this.createGableRoofGeometry(
      SOURCE_ROOF_WIDTH,
      SOURCE_ROOF_DEPTH,
      SOURCE_ROOF_HEIGHT
    );
    const sourceRoof = new THREE.Mesh(sourceGeometry, sourceMaterial);
    sourceRoof.castShadow = true;
    const sourceWire = new THREE.LineSegments(
      new THREE.WireframeGeometry(sourceGeometry),
      new THREE.LineBasicMaterial({ color: 0x365a7d, transparent: true, opacity: 0.7 })
    );
    sourceRoof.add(sourceWire);
    this.sourceRoofGroup.position.y = BASE_HEIGHT;
    this.sourceRoofGroup.add(sourceRoof);

    const replacementGeometry = this.createGableRoofGeometry(
      REPLACEMENT_WIDTH,
      REPLACEMENT_DEPTH,
      1.7
    );
    const replacement = new THREE.Mesh(replacementGeometry, this.replacementMaterial);
    replacement.castShadow = true;
    replacement.name = "ReplacementRoof";
    const replacementWire = new THREE.LineSegments(
      new THREE.WireframeGeometry(replacementGeometry),
      new THREE.LineBasicMaterial({ color: 0x8e4d09, transparent: true, opacity: 0.6 })
    );
    replacement.add(replacementWire);
    this.replacementGroup.position.y = BASE_HEIGHT + TRANSITION_HEIGHT;
    this.replacementGroup.add(replacement);
  }

  private buildBoundaryLoops(): void {
    const sourcePoints = this.createRectLoop(BASE_WIDTH, BASE_DEPTH, BASE_HEIGHT, 4);
    const replacementPoints = this.createRectLoop(
      REPLACEMENT_WIDTH,
      REPLACEMENT_DEPTH,
      BASE_HEIGHT + TRANSITION_HEIGHT,
      3
    );

    this.sourceLoopGroup.add(this.createLoop(sourcePoints, 0x1d4ed8));
    this.replacementLoopGroup.add(this.createLoop(replacementPoints, 0xd97706));
    this.finalLoopGroup.add(this.createLoop(sourcePoints, 0x0e9f6e));
    this.finalLoopGroup.add(this.createLoop(replacementPoints, 0x0e9f6e));
  }

  private buildTransition(): void {
    const sourcePoints = this.createRectLoop(BASE_WIDTH, BASE_DEPTH, BASE_HEIGHT, 4);
    const replacementPoints = this.createRectLoop(
      REPLACEMENT_WIDTH,
      REPLACEMENT_DEPTH,
      BASE_HEIGHT + TRANSITION_HEIGHT,
      3
    );
    const geometry = this.createZipperGeometry(sourcePoints, replacementPoints);
    const transition = new THREE.Mesh(geometry, this.transitionMaterial);
    transition.castShadow = true;
    transition.name = "TransitionStrip";
    transition.add(new THREE.LineSegments(
      new THREE.WireframeGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x087451, transparent: true, opacity: 0.88 })
    ));
    this.transitionGroup.add(transition);
  }

  private buildObb(): void {
    const geometry = new THREE.BoxGeometry(5.15, 2.35, 4.05);
    const volume = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: 0xdc2626,
        transparent: true,
        opacity: 0.035,
        depthWrite: false
      })
    );
    volume.position.y = BASE_HEIGHT + 1.03;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0xdc2626, transparent: true, opacity: 0.8 })
    );
    edges.position.copy(volume.position);
    this.obbGroup.add(volume, edges);
  }

  private buildTriangleExplanation(): void {
    const x = SOURCE_ROOF_WIDTH / 2;
    const z = SOURCE_ROOF_DEPTH / 2;
    const frontLeft = new THREE.Vector3(-x, 0, z);
    const frontRight = new THREE.Vector3(x, 0, z);
    const frontRidge = new THREE.Vector3(0, SOURCE_ROOF_HEIGHT, z);
    const backRidge = new THREE.Vector3(0, SOURCE_ROOF_HEIGHT, -z);

    const frontNormal = new THREE.Triangle(frontLeft, frontRight, frontRidge)
      .getNormal(new THREE.Vector3());
    const adjacentRoofNormal = new THREE.Triangle(frontLeft, frontRidge, backRidge)
      .getNormal(new THREE.Vector3());
    const faceOffset = 0.026;
    const offset = (point: THREE.Vector3, normal: THREE.Vector3): THREE.Vector3 =>
      point.clone().addScaledVector(normal, faceOffset);

    const frontFace = this.createTriangle(
      offset(frontLeft, frontNormal),
      offset(frontRight, frontNormal),
      offset(frontRidge, frontNormal),
      0x1d4ed8
    );
    const adjacentRoofFace = this.createTriangle(
      offset(frontLeft, adjacentRoofNormal),
      offset(frontRidge, adjacentRoofNormal),
      offset(backRidge, adjacentRoofNormal),
      0xd97706
    );

    const edgeOffset = frontNormal.clone().add(adjacentRoofNormal).normalize().multiplyScalar(0.045);
    const sharedEdgeStart = frontLeft.clone().add(edgeOffset);
    const sharedEdgeEnd = frontRidge.clone().add(edgeOffset);
    const sharedEdge = this.createBoldEdge(sharedEdgeStart, sharedEdgeEnd, 0x0e9f6e);

    frontFace.renderOrder = 8;
    adjacentRoofFace.renderOrder = 8;
    sharedEdge.renderOrder = 10;
    this.triangleExplanationGroup.position.y = BASE_HEIGHT;
    this.triangleExplanationGroup.add(frontFace, adjacentRoofFace, sharedEdge);
  }

  private buildProjectionArrows(): void {
    const target = new THREE.Vector3(0, BASE_HEIGHT + 0.95, 0);
    const origins = [
      new THREE.Vector3(0, 3.75, 5.4),
      new THREE.Vector3(0, 3.75, -5.4),
      new THREE.Vector3(5.4, 3.75, 0),
      new THREE.Vector3(-5.4, 3.75, 0)
    ];
    const colours = [0x1d4ed8, 0x1d4ed8, 0xd97706, 0xd97706];
    origins.forEach((origin, index) => {
      const direction = target.clone().sub(origin).normalize();
      const arrow = new THREE.ArrowHelper(direction, origin, 2.15, colours[index], 0.24, 0.12);
      this.projectionGroup.add(arrow);
    });
  }

  private createGableRoofGeometry(width: number, depth: number, height: number): THREE.BufferGeometry {
    const x = width / 2;
    const z = depth / 2;
    const frontLeft = new THREE.Vector3(-x, 0, z);
    const frontRight = new THREE.Vector3(x, 0, z);
    const frontRidge = new THREE.Vector3(0, height, z);
    const backLeft = new THREE.Vector3(-x, 0, -z);
    const backRight = new THREE.Vector3(x, 0, -z);
    const backRidge = new THREE.Vector3(0, height, -z);
    const faces = [
      frontLeft, frontRight, frontRidge,
      backRight, backLeft, backRidge,
      frontLeft, frontRidge, backRidge,
      frontLeft, backRidge, backLeft,
      frontRidge, frontRight, backRight,
      frontRidge, backRight, backRidge
    ];
    const positions = new Float32Array(faces.flatMap((point) => [point.x, point.y, point.z]));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  private createRectLoop(
    width: number,
    depth: number,
    y: number,
    segmentsPerSide: number
  ): THREE.Vector3[] {
    const x = width / 2;
    const z = depth / 2;
    const corners = [
      new THREE.Vector3(-x, y, z),
      new THREE.Vector3(x, y, z),
      new THREE.Vector3(x, y, -z),
      new THREE.Vector3(-x, y, -z)
    ];
    const points: THREE.Vector3[] = [];
    for (let side = 0; side < corners.length; side += 1) {
      const start = corners[side];
      const end = corners[(side + 1) % corners.length];
      for (let segment = 0; segment < segmentsPerSide; segment += 1) {
        points.push(start.clone().lerp(end, segment / segmentsPerSide));
      }
    }
    return points;
  }

  private createLoop(points: THREE.Vector3[], colour: number): THREE.Group {
    const group = new THREE.Group();
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: colour })
    );
    const pointCloud = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.PointsMaterial({ color: colour, size: 0.085, sizeAttenuation: true })
    );
    line.renderOrder = 7;
    pointCloud.renderOrder = 8;
    group.add(line, pointCloud);
    return group;
  }

  private createTriangle(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    colour: number
  ): THREE.Mesh {
    const geometry = new THREE.BufferGeometry().setFromPoints([a, b, c]);
    geometry.setIndex([0, 1, 2]);
    geometry.computeVertexNormals();
    return new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: colour,
        transparent: true,
        opacity: 0.66,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
  }

  private createBoldEdge(start: THREE.Vector3, end: THREE.Vector3, colour: number): THREE.Mesh {
    const direction = end.clone().sub(start);
    const length = direction.length();
    const edge = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, length, 12, 1, false),
      new THREE.MeshBasicMaterial({ color: colour })
    );
    edge.position.copy(start).add(end).multiplyScalar(0.5);
    edge.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize()
    );
    return edge;
  }

  private createZipperGeometry(
    outer: THREE.Vector3[],
    inner: THREE.Vector3[]
  ): THREE.BufferGeometry {
    const vertices = [...outer, ...inner];
    const indices: number[] = [];
    const outerProgress = this.arcProgress(outer);
    const innerProgress = this.arcProgress(inner);
    let outerIndex = 0;
    let innerIndex = 0;

    while (outerIndex < outer.length || innerIndex < inner.length) {
      const nextOuter = outerIndex < outer.length
        ? outerProgress[outerIndex + 1]
        : Number.POSITIVE_INFINITY;
      const nextInner = innerIndex < inner.length
        ? innerProgress[innerIndex + 1]
        : Number.POSITIVE_INFINITY;
      const outerCurrent = outerIndex % outer.length;
      const innerCurrent = outer.length + (innerIndex % inner.length);

      if (Math.abs(nextOuter - nextInner) <= 1e-6) {
        const outerNext = (outerIndex + 1) % outer.length;
        const innerNext = outer.length + ((innerIndex + 1) % inner.length);
        indices.push(outerCurrent, innerCurrent, outerNext);
        indices.push(outerNext, innerCurrent, innerNext);
        outerIndex += 1;
        innerIndex += 1;
      } else if (nextOuter < nextInner) {
        indices.push(outerCurrent, innerCurrent, (outerIndex + 1) % outer.length);
        outerIndex += 1;
      } else {
        indices.push(
          outerCurrent,
          innerCurrent,
          outer.length + ((innerIndex + 1) % inner.length)
        );
        innerIndex += 1;
      }
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(vertices);
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  private arcProgress(loop: THREE.Vector3[]): number[] {
    const progress = new Array<number>(loop.length + 1).fill(0);
    for (let index = 0; index < loop.length; index += 1) {
      progress[index + 1] = progress[index] + loop[index].distanceTo(loop[(index + 1) % loop.length]);
    }
    const perimeter = progress[progress.length - 1];
    return perimeter > 0 ? progress.map((distance) => distance / perimeter) : progress;
  }

  private setStage(requestedIndex: number): void {
    this.stageIndex = Math.max(0, Math.min(requestedIndex, STAGES.length - 1));
    const stage = STAGES[this.stageIndex];
    this.stateIndex.textContent = `${String(this.stageIndex + 1).padStart(2, "0")} / 06`;
    this.stateTitle.textContent = stage.title;

    this.buttons.forEach((button, index) => {
      const isActive = index === this.stageIndex;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    this.sourceRoofGroup.visible = this.stageIndex === 0;
    this.triangleExplanationGroup.visible = this.stageIndex === 0 && this.triangleHighlightsVisible;
    this.obbGroup.visible = this.stageIndex === 1 || this.stageIndex === 2;
    this.sourceLoopGroup.visible = this.stageIndex === 1 || this.stageIndex === 2 || this.stageIndex === 3;
    this.replacementLoopGroup.visible = this.stageIndex === 2 || this.stageIndex === 3;
    this.replacementGroup.visible = this.stageIndex >= 2;
    this.transitionGroup.visible = this.stageIndex >= 3;
    this.projectionGroup.visible = this.stageIndex === 4;
    this.finalLoopGroup.visible = this.stageIndex === 5;

    this.replacementTargetY = this.stageIndex === 2
      ? BASE_HEIGHT + TRANSITION_HEIGHT + 0.52
      : BASE_HEIGHT + TRANSITION_HEIGHT;
    this.replacementMaterial.color.setHex(this.stageIndex >= 4 ? 0xd88daa : 0xd97706);
    this.transitionMaterial.color.setHex(this.stageIndex === 4 ? 0xb46f92 : 0x0e9f6e);

    if (!this.isActive && this.renderer) {
      this.replacementGroup.position.y = this.replacementTargetY;
      this.renderer.render(this.scene, this.camera);
    }
  }

  private start(): void {
    if (!this.renderer || this.isActive) return;
    this.isActive = true;
    if (this.controls) this.controls.enabled = true;
    this.resize();
    this.render();
  }

  private stop(): void {
    this.isActive = false;
    if (this.controls) this.controls.enabled = false;
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
  }

  private render = (): void => {
    if (!this.isActive || !this.renderer) return;
    this.replacementGroup.position.y = THREE.MathUtils.lerp(
      this.replacementGroup.position.y,
      this.replacementTargetY,
      0.12
    );
    this.controls?.update();
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(this.render);
  };

  private resize(): void {
    if (!this.renderer) return;
    const width = Math.max(1, Math.round(this.container.clientWidth));
    const height = Math.max(1, Math.round(this.container.clientHeight));
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    if (!this.isActive) this.renderer.render(this.scene, this.camera);
  }

  private requireDescendant<T extends HTMLElement>(selector: string): T {
    const element = this.slide.querySelector<T>(selector);
    if (!element) throw new Error(`Slide 10 is missing ${selector}.`);
    return element;
  }
}
