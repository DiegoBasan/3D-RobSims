import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { GUI } from 'lil-gui';

const MODEL_URL = 'models/roboarm_lowpoly.fbx';
const MAX_INSTANCES = 6;
const INSTANCE_SPACING = 3.4;
const SELECTION_COLOR = 0x3ea6ff;

// Industrial "KUKA-style" yellow: bright, saturated, high metalness / low roughness
// so the environment map reads back as sharp, hot reflections on the arm segments.
const ROBOT_PARAMS = {
  yellowColor: '#f5c400',
  darkColor: '#141414',
  roughness: 0.26,
  metalness: 1.0,
  clearcoat: 0.4,
  clearcoatRoughness: 0.2,
  envMapIntensity: 1.3,
};

const state = {
  clock: new THREE.Clock(),
  autoRotate: false,
  playing: true,
  timeScale: 1,
};

init();

function init() {
  const canvas = document.getElementById('scene-canvas');

  // antialias:false on purpose — SMAAPass below already resolves edges, so
  // running MSAA *and* SMAA at once would pay for anti-aliasing twice.
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
  });
  // Capping at 1.5x instead of the full devicePixelRatio is the single
  // biggest win for smoothness on high-DPI screens (2x DPR = 4x the pixels
  // for every pass: PBR shading, shadows, bloom, SMAA).
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // --- Warm, light studio backdrop (instead of the dark void) -------------
  const BG_COLOR = 0xe9dcc3;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG_COLOR);
  scene.fog = new THREE.Fog(BG_COLOR, 20, 42);

  // --- Image-based lighting: a soft studio room environment gives the
  // metallic PBR material real reflections/highlights instead of flat shading.
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  pmremGenerator.dispose();

  // --- Isometric orthographic camera -----------------------------------
  // position (d, d, d) looking at the origin yields the classic ~35.264°
  // elevation / 45° azimuth true-isometric projection.
  const isoDistance = 14;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(isoDistance, isoDistance, isoDistance);

  const target = new THREE.Vector3(0, 1.4, 0);
  updateOrthoFrustum(camera, target.y);
  camera.lookAt(target);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minZoom = 0.3;
  controls.maxZoom = 3.2;
  controls.minPolarAngle = THREE.MathUtils.degToRad(20);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(75);
  controls.enablePan = true;
  controls.update();

  // --- Lighting (warm key + warm sky/ground fill) --------------------------
  const keyLight = new THREE.DirectionalLight(0xfff2d6, 2.0);
  keyLight.position.set(6, 10, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1536, 1536);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 34;
  keyLight.shadow.camera.left = -14;
  keyLight.shadow.camera.right = 14;
  keyLight.shadow.camera.top = 14;
  keyLight.shadow.camera.bottom = -14;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.radius = 3;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xffe3b0, 0.6);
  rimLight.position.set(-8, 5, -6);
  scene.add(rimLight);

  const fillLight = new THREE.HemisphereLight(0xfff3e0, 0x5b4a34, 0.8);
  scene.add(fillLight);

  // --- Ground: warm glossy PBR disc that receives shadows and picks up
  // the environment reflection for grounded, believable contact.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(20, 96),
    new THREE.MeshStandardMaterial({
      color: 0xcdbe9d,
      roughness: 0.55,
      metalness: 0.15,
      envMapIntensity: 0.6,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const gridHelper = new THREE.GridHelper(20, 40, 0xb3a077, 0xc9b98e);
  gridHelper.position.y = 0.002;
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.5;
  scene.add(gridHelper);

  // --- Post-processing: bloom for hot metal highlights + SMAA for crisp
  // edges (orthographic PBR reflections alias hard without extra AA).
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.3,
    0.35,
    0.94
  );
  composer.addPass(bloomPass);

  const smaaPass = new SMAAPass(
    window.innerWidth * renderer.getPixelRatio(),
    window.innerHeight * renderer.getPixelRatio()
  );
  composer.addPass(smaaPass);
  composer.addPass(new OutputPass());

  // --- Gizmo: move / rotate / scale whichever model is selected ------------
  const transformControls = new TransformControls(camera, renderer.domElement);
  transformControls.size = 0.85;
  scene.add(transformControls.getHelper());
  transformControls.addEventListener('dragging-changed', (event) => {
    controls.enabled = !event.value;
  });

  const selectionHighlight = new THREE.BoxHelper(new THREE.Object3D(), SELECTION_COLOR);
  selectionHighlight.visible = false;
  scene.add(selectionHighlight);

  // --- Multi-instance robot management --------------------------------------
  const instances = [];
  const instancesById = new Map();
  let nextInstanceId = 1;
  let selected = null;

  function tagAndMaterializeMeshes(root) {
    root.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;

      const original = Array.isArray(child.material) ? child.material[0] : child.material;
      const origColor = original && original.color ? original.color : new THREE.Color(1, 1, 1);
      const luminance = origColor.r * 0.299 + origColor.g * 0.587 + origColor.b * 0.114;
      const isDark = luminance < 0.25;

      child.userData.isRobotSurface = true;
      child.userData.isDark = isDark;

      child.material = new THREE.MeshPhysicalMaterial({
        color: isDark ? ROBOT_PARAMS.darkColor : ROBOT_PARAMS.yellowColor,
        roughness: isDark ? ROBOT_PARAMS.roughness + 0.15 : ROBOT_PARAMS.roughness,
        metalness: ROBOT_PARAMS.metalness,
        clearcoat: ROBOT_PARAMS.clearcoat,
        clearcoatRoughness: 0.15,
        envMapIntensity: ROBOT_PARAMS.envMapIntensity,
      });
    });
  }

  function normalizeAndPlace(root, offsetX) {
    // Fit the arm to a consistent size and rest it on the ground plane,
    // centered on its own footprint, then lay it out along X so multiple
    // instances don't spawn on top of each other.
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = maxDim > 0 ? 6 / maxDim : 1;
    root.scale.setScalar(scale);

    const scaledBox = new THREE.Box3().setFromObject(root);
    root.position.x -= (scaledBox.min.x + scaledBox.max.x) / 2;
    root.position.z -= (scaledBox.min.z + scaledBox.max.z) / 2;
    root.position.y -= scaledBox.min.y;
    root.position.x += offsetX;
  }

  function registerInstance(root) {
    // A back-reference to `instance` (which itself holds `root`) would make
    // root.userData circular, and THREE.Object3D.copy() JSON-serializes
    // userData when cloning — so we index by a plain numeric id instead.
    const id = nextInstanceId++;
    const instance = { id, root, mixer: null, actions: [] };
    root.userData.instanceId = id;
    instancesById.set(id, instance);

    if (root.animations && root.animations.length > 0) {
      instance.mixer = new THREE.AnimationMixer(root);
      instance.actions = root.animations.map((clip) => instance.mixer.clipAction(clip));
      instance.actions.forEach((action) => {
        action.setLoop(THREE.LoopRepeat);
        action.play();
      });
    }

    instances.push(instance);
    scene.add(root);
    selectInstance(instance);
    return instance;
  }

  function selectInstance(instance) {
    selected = instance;
    transformControls.attach(instance.root);
    selectionHighlight.visible = true;
  }

  function deselectInstance() {
    selected = null;
    transformControls.detach();
    selectionHighlight.visible = false;
  }

  function disposeInstanceObject(root) {
    root.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry?.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => m?.dispose());
    });
  }

  function removeInstance(instance) {
    const idx = instances.indexOf(instance);
    if (idx === -1) return;
    instances.splice(idx, 1);
    instancesById.delete(instance.id);
    scene.remove(instance.root);
    disposeInstanceObject(instance.root);
    if (selected === instance) deselectInstance();
  }

  function duplicateInstance(instance) {
    if (instances.length >= MAX_INSTANCES) {
      flashMessage(`Máximo ${MAX_INSTANCES} modelos a la vez (por rendimiento).`);
      return;
    }
    const clonedRoot = cloneSkeleton(instance.root);
    clonedRoot.animations = instance.root.animations;
    clonedRoot.position.copy(instance.root.position);
    clonedRoot.position.x += INSTANCE_SPACING;
    registerInstance(clonedRoot);
  }

  function addModelFromFBX(fbx) {
    if (instances.length >= MAX_INSTANCES) {
      flashMessage(`Máximo ${MAX_INSTANCES} modelos a la vez (por rendimiento).`);
      return;
    }
    tagAndMaterializeMeshes(fbx);
    normalizeAndPlace(fbx, instances.length * INSTANCE_SPACING);
    registerInstance(fbx);
  }

  function applyRobotMaterials() {
    instances.forEach(({ root }) => {
      root.traverse((child) => {
        if (child.isMesh && child.userData.isRobotSurface) {
          const mat = child.material;
          mat.color.set(child.userData.isDark ? ROBOT_PARAMS.darkColor : ROBOT_PARAMS.yellowColor);
          mat.roughness = child.userData.isDark
            ? Math.min(1, ROBOT_PARAMS.roughness + 0.15)
            : ROBOT_PARAMS.roughness;
          mat.metalness = ROBOT_PARAMS.metalness;
          mat.clearcoat = ROBOT_PARAMS.clearcoat;
          mat.clearcoatRoughness = 0.15;
          mat.envMapIntensity = ROBOT_PARAMS.envMapIntensity;
          mat.needsUpdate = true;
        }
      });
    });
  }

  // --- GUI -----------------------------------------------------------------
  const gui = new GUI({ title: 'RobSims — Controles' });
  const matFolder = gui.addFolder('Material del brazo');
  matFolder.addColor(ROBOT_PARAMS, 'yellowColor').name('Amarillo').onChange(applyRobotMaterials);
  matFolder.add(ROBOT_PARAMS, 'roughness', 0, 1, 0.01).name('Rugosidad').onChange(applyRobotMaterials);
  matFolder.add(ROBOT_PARAMS, 'metalness', 0, 1, 0.01).name('Metalicidad').onChange(applyRobotMaterials);
  matFolder.add(ROBOT_PARAMS, 'clearcoat', 0, 1, 0.01).name('Barniz (clearcoat)').onChange(applyRobotMaterials);
  matFolder.add(ROBOT_PARAMS, 'envMapIntensity', 0, 3, 0.05).name('Intensidad reflejo').onChange(applyRobotMaterials);

  const sceneFolder = gui.addFolder('Escena');
  sceneFolder.add(renderer, 'toneMappingExposure', 0.2, 2.5, 0.01).name('Exposición');
  sceneFolder.add(bloomPass, 'strength', 0, 2, 0.01).name('Bloom');
  sceneFolder.add(state, 'autoRotate').name('Auto-rotar').onChange((v) => (controls.autoRotate = v));
  controls.autoRotateSpeed = 1.6;

  const animFolder = gui.addFolder('Animación');
  animFolder.add(state, 'playing').name('Reproducir');
  animFolder.add(state, 'timeScale', 0, 2, 0.05).name('Velocidad');

  const gizmoState = { mode: 'translate' };
  const modelsFolder = gui.addFolder('Modelos (clic para seleccionar)');
  const modeController = modelsFolder
    .add(gizmoState, 'mode', { 'Mover (G)': 'translate', 'Rotar (R)': 'rotate', 'Escalar (S)': 'scale' })
    .name('Modo gizmo')
    .onChange((mode) => transformControls.setMode(mode));
  modelsFolder.add({ fn: () => selected && duplicateInstance(selected) }, 'fn').name('Duplicar seleccionado');
  modelsFolder
    .add({ fn: () => selected && removeInstance(selected) }, 'fn')
    .name('Eliminar seleccionado (Supr)');

  function setGizmoMode(mode) {
    gizmoState.mode = mode;
    transformControls.setMode(mode);
    modeController.updateDisplay();
  }

  // --- Load the bundled robot as the first instance -------------------------
  const loadingScreen = document.getElementById('loading-screen');
  const loadingText = document.getElementById('loading-text');
  const loader = new FBXLoader();

  const stallTimeout = setTimeout(() => {
    loadingText.textContent =
      'Esto está tardando más de lo normal — revisa la consola (F12) o prueba a importar tu propio .fbx arriba.';
  }, 12000);

  loader.load(
    MODEL_URL,
    (fbx) => {
      clearTimeout(stallTimeout);
      tagAndMaterializeMeshes(fbx);
      normalizeAndPlace(fbx, 0);
      registerInstance(fbx);
      loadingScreen.classList.add('hidden');
    },
    (progress) => {
      if (progress.total) {
        const pct = Math.round((progress.loaded / progress.total) * 100);
        loadingText.textContent = `Cargando modelo 3D… ${pct}%`;
      }
    },
    (error) => {
      clearTimeout(stallTimeout);
      console.error('Error cargando el FBX:', error);
      loadingText.textContent = 'Error al cargar el modelo. Prueba a importar tu propio .fbx arriba.';
    }
  );

  let flashTimeoutId = null;
  function flashMessage(text) {
    clearTimeout(flashTimeoutId);
    loadingText.textContent = text;
    loadingScreen.classList.remove('hidden');
    flashTimeoutId = setTimeout(() => loadingScreen.classList.add('hidden'), 1800);
  }

  // --- Importar/agregar un FBX local (no reemplaza los existentes) ---------
  const fileInput = document.getElementById('model-file-input');
  fileInput?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (instances.length >= MAX_INSTANCES) {
      flashMessage(`Máximo ${MAX_INSTANCES} modelos a la vez (por rendimiento).`);
      fileInput.value = '';
      return;
    }

    loadingText.textContent = `Leyendo ${file.name}…`;
    loadingScreen.classList.remove('hidden');

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const fbx = new FBXLoader().parse(reader.result, '');
        addModelFromFBX(fbx);
        loadingScreen.classList.add('hidden');
      } catch (err) {
        console.error('Error al parsear el FBX importado:', err);
        loadingText.textContent = 'No se pudo leer ese archivo como FBX. Revisa la consola.';
      }
    };
    reader.onerror = () => {
      console.error('Error leyendo el archivo:', reader.error);
      loadingText.textContent = 'Error leyendo el archivo local.';
    };
    reader.readAsArrayBuffer(file);
    fileInput.value = '';
  });

  // --- Click-to-select (skips clicks that start a gizmo drag) --------------
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();

  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (transformControls.dragging) return;
    if (event.button !== 0) return;

    const rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(
      instances.map((inst) => inst.root),
      true
    );

    if (hits.length === 0) {
      deselectInstance();
      return;
    }

    let obj = hits[0].object;
    while (obj && obj.userData.instanceId === undefined) obj = obj.parent;
    if (obj) selectInstance(instancesById.get(obj.userData.instanceId));
  });

  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement) return;
    switch (event.key.toLowerCase()) {
      case 'g':
        setGizmoMode('translate');
        break;
      case 'r':
        setGizmoMode('rotate');
        break;
      case 's':
        setGizmoMode('scale');
        break;
      case 'delete':
      case 'backspace':
        if (selected) removeInstance(selected);
        break;
      default:
        break;
    }
  });

  window.addEventListener('resize', () => onResize(camera, renderer, composer, target));

  renderer.setAnimationLoop(() => {
    const delta = state.clock.getDelta();

    if (state.playing) {
      instances.forEach(({ mixer }) => mixer?.update(delta * state.timeScale));
    }

    if (selected) selectionHighlight.setFromObject(selected.root);

    controls.update();
    composer.render();
  });
}

function updateOrthoFrustum(camera, targetY = 0) {
  const aspect = window.innerWidth / window.innerHeight;
  const viewSize = 9;
  camera.left = (-viewSize * aspect) / 2;
  camera.right = (viewSize * aspect) / 2;
  camera.top = viewSize / 2 + targetY * 0.4;
  camera.bottom = -viewSize / 2 + targetY * 0.4;
  camera.updateProjectionMatrix();
}

function onResize(camera, renderer, composer, target) {
  updateOrthoFrustum(camera, target.y);
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}
