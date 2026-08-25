import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GUI } from 'lil-gui';

const MODEL_URL = 'models/roboarm_lowpoly.fbx';

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
  mixer: null,
  actions: [],
  clock: new THREE.Clock(),
  autoRotate: false,
  playing: true,
  timeScale: 1,
};

init();

function init() {
  const canvas = document.getElementById('scene-canvas');

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0c10);
  scene.fog = new THREE.Fog(0x0a0c10, 18, 40);

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
  controls.minZoom = 0.4;
  controls.maxZoom = 3.2;
  controls.minPolarAngle = THREE.MathUtils.degToRad(20);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(75);
  controls.enablePan = false;
  controls.update();

  // --- Lighting ----------------------------------------------------------
  const keyLight = new THREE.DirectionalLight(0xfff2d6, 2.0);
  keyLight.position.set(6, 10, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 30;
  keyLight.shadow.camera.left = -10;
  keyLight.shadow.camera.right = 10;
  keyLight.shadow.camera.top = 10;
  keyLight.shadow.camera.bottom = -10;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.radius = 3;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x8fd3ff, 0.7);
  rimLight.position.set(-8, 5, -6);
  scene.add(rimLight);

  const fillLight = new THREE.HemisphereLight(0x445566, 0x0a0a0a, 0.6);
  scene.add(fillLight);

  // --- Ground: dark glossy PBR disc that receives shadows and picks up
  // the environment reflection for grounded, believable contact.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(14, 96),
    new THREE.MeshStandardMaterial({
      color: 0x0c0d10,
      roughness: 0.35,
      metalness: 0.55,
      envMapIntensity: 0.8,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const gridHelper = new THREE.GridHelper(14, 28, 0x2a2e38, 0x14161c);
  gridHelper.position.y = 0.002;
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

  let robotRoot = null;

  function applyRobotMaterials() {
    if (!robotRoot) return;
    robotRoot.traverse((child) => {
      if (child.isMesh && child.userData.isRobotSurface) {
        const mat = child.material;
        mat.color.set(child.userData.isDark ? ROBOT_PARAMS.darkColor : ROBOT_PARAMS.yellowColor);
        mat.roughness = child.userData.isDark ? Math.min(1, ROBOT_PARAMS.roughness + 0.15) : ROBOT_PARAMS.roughness;
        mat.metalness = ROBOT_PARAMS.metalness;
        mat.clearcoat = ROBOT_PARAMS.clearcoat;
        mat.clearcoatRoughness = 0.15;
        mat.envMapIntensity = ROBOT_PARAMS.envMapIntensity;
        mat.needsUpdate = true;
      }
    });
  }

  // --- Load the robot ------------------------------------------------------
  const loadingScreen = document.getElementById('loading-screen');
  const loadingText = document.getElementById('loading-text');
  const loader = new FBXLoader();

  loader.load(
    MODEL_URL,
    (fbx) => {
      robotRoot = fbx;

      fbx.traverse((child) => {
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

      // Normalize scale/position: fit the arm to a consistent size and
      // rest it on the ground plane, centered on the turntable.
      const box = new THREE.Box3().setFromObject(fbx);
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);

      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 6 / maxDim;
      fbx.scale.setScalar(scale);

      const scaledBox = new THREE.Box3().setFromObject(fbx);
      fbx.position.x -= (scaledBox.min.x + scaledBox.max.x) / 2;
      fbx.position.z -= (scaledBox.min.z + scaledBox.max.z) / 2;
      fbx.position.y -= scaledBox.min.y;

      scene.add(fbx);

      if (fbx.animations && fbx.animations.length > 0) {
        state.mixer = new THREE.AnimationMixer(fbx);
        state.actions = fbx.animations.map((clip) => state.mixer.clipAction(clip));
        state.actions.forEach((action) => {
          action.setLoop(THREE.LoopRepeat);
          action.play();
        });
      }

      loadingScreen.classList.add('hidden');
    },
    (progress) => {
      if (progress.total) {
        const pct = Math.round((progress.loaded / progress.total) * 100);
        loadingText.textContent = `Cargando modelo 3D… ${pct}%`;
      }
    },
    (error) => {
      console.error('Error cargando el FBX:', error);
      loadingText.textContent = 'Error al cargar el modelo. Revisa la consola.';
    }
  );

  window.addEventListener('resize', () => onResize(camera, renderer, composer, target));

  renderer.setAnimationLoop(() => {
    const delta = state.clock.getDelta();

    if (state.mixer && state.playing) {
      state.mixer.update(delta * state.timeScale);
    }

    controls.update();
    composer.render();
  });
}

function updateOrthoFrustum(camera, targetY = 0) {
  const aspect = window.innerWidth / window.innerHeight;
  const viewSize = 7.5;
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
