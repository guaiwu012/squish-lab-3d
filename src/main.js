import * as THREE from 'three';

const canvas = document.getElementById('squishCanvas');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MAX_DEFORMATION_POINTS = 32;

// The catalog is intentionally data-driven: adding a new scene or material only
// requires a registry entry, not another branch in the navigation markup.
const SCENES = {
  all: { label: '全部场景' },
  studio: { label: '材质实验室' },
  kitchen: { label: '厨房触感' }
};

const MATERIALS = {
  foam: {
    index: '01', scene: 'studio', soundProfile: 'sticky-foam', zh: '起泡胶', tag: '3D FOAM', title: ['Foam', 'Slime.'],
    copy: '封闭的柔软球体，气泡揉进表面。<br>揪住一点，整块胶会牵连变形。', feel: '蓬松',
    defaults: [78, 48, 68], color: 0xa9eb2e,
    physics: { response: 38, release: 5.2, damping: 6.4, wobble: .72 },
    aria: '真正的三维起泡胶球体。拖动表面局部塑形，拖动外圈旋转，双指拉伸。'
  },
  fruit: {
    index: '02', scene: 'kitchen', soundProfile: 'sugar-peel', zh: '水果', tag: '3D JUICY', title: ['Soft', 'Fruit.'],
    copy: '透明糖衣包住完整果肉，光线沿弧面滑动。<br>先敲碎糖衣，再慢慢拉开果肉。', feel: '多汁',
    defaults: [52, 66, 46], color: 0xe7244f,
    physics: { response: 58, release: 8.4, damping: 8.2, wobble: .48 },
    aria: '真正的三维软水果。拖动表面局部塑形，拖动外圈旋转。'
  },
  bubble: {
    index: '03', scene: 'studio', soundProfile: 'plastic-pop', zh: '泡泡纸', tag: '3D POP', title: ['Bubble', 'Wrap.'],
    copy: '透明底板有真实厚度，每颗泡泡独立隆起。<br>点破一颗，看它向板内塌下。', feel: '清脆',
    defaults: [34, 88, 80], color: 0xbbefff,
    physics: { response: 72, release: 16, damping: 12, wobble: .18 },
    aria: '三维泡泡纸。点击立体气泡将它按破，拖动外圈旋转。'
  },
  jelly: {
    index: '04', scene: 'kitchen', soundProfile: 'wet-jelly', zh: '果冻', tag: '3D WOBBLE', title: ['Slow', 'Jelly.'],
    copy: '半透明体积会折射高光，也能看见背面。<br>松开手，重量还会多晃几拍。', feel: 'Q弹',
    defaults: [88, 42, 36], color: 0xf348a7,
    physics: { response: 30, release: 3.8, damping: 4.2, wobble: 1.32 },
    aria: '真正的三维半透明果冻。拖动表面局部塑形，拖动外圈旋转。'
  }
};

const state = {
  material: 'foam', scene: 'all', presses: 0, sound: true, audio: null, audioBus: null,
  lastSound: -1, soundEvent: 0, pointerId: null, mode: '', moved: false,
  startX: 0, startY: 0, lastX: 0, lastY: 0, lastMoveTime: 0, gestureSpeed: 0,
  rotationMode: false, rotationX: -.08, rotationY: .18, targetRotationX: -.08, targetRotationY: .18,
  rotationXVelocity: 0, rotationYVelocity: 0,
  grabDir: new THREE.Vector3(0, 0, 1), grabPoint: new THREE.Vector3(0, 0, 1.18), grabUv: new THREE.Vector2(.5, .5), currentPull: new THREE.Vector3(),
  targetPull: new THREE.Vector3(), pullVelocity: new THREE.Vector3(),
  press: 0, targetPress: 0, pressVelocity: 0, wobble: 0,
  touchPoints: new Map(), pinchStartDistance: 0, pinchStartPull: 0, pinchStartAngle: 0, pinchStartRotationY: 0,
  deformationPoints: [], dualGrips: [],
  wheelTimer: 0, lastFrame: 0, popped: Array(42).fill(false), particles: [],
  bubbleCandidate: -1, fruitShellCracked: false, fruitShellHits: 0,
  gestureCount: 0, releaseCount: 0, cancelCount: 0, activeAudioOutputs: 0, renderErrorReported: false
};

const els = {
  tabs: [...document.querySelectorAll('.tab')], sceneFilter: document.getElementById('sceneFilter'), materialOptions: document.getElementById('materialOptions'), title: document.getElementById('materialTitle'),
  number: document.getElementById('materialNumber'), copy: document.getElementById('materialCopy'),
  count: document.getElementById('pressCount'), feel: document.getElementById('feelLabel'),
  controlTitle: document.getElementById('controlTitle'), chip: document.getElementById('materialChip'),
  footerIndex: document.getElementById('footerIndex'), status: document.getElementById('interactionStatus'),
  hint: document.getElementById('gestureHint'), reset: document.getElementById('resetButton'),
  soundToggle: document.getElementById('soundToggle'), soundTop: document.getElementById('soundTop'),
  rotateToggle: document.getElementById('rotateToggle'), stage: document.querySelector('.object-stage'),
  sliders: ['softness', 'bounce', 'texture'].map(id => document.getElementById(id))
};

function renderMaterialCatalog(sceneKey = state.scene) {
  if (!els.sceneFilter || !els.materialOptions) return;
  state.scene = SCENES[sceneKey] ? sceneKey : 'all';
  els.sceneFilter.innerHTML = Object.entries(SCENES).map(([key, scene]) =>
    `<button class="scene-button${key === state.scene ? ' is-active' : ''}" data-scene="${key}" type="button" aria-pressed="${key === state.scene}">${scene.label}</button>`
  ).join('');
  const entries = Object.entries(MATERIALS).filter(([, material]) => state.scene === 'all' || material.scene === state.scene);
  els.materialOptions.innerHTML = entries.map(([key, material]) =>
    `<button class="tab${key === state.material ? ' is-active' : ''}" data-material="${key}" type="button" aria-pressed="${key === state.material}">${material.zh}</button>`
  ).join('');
  els.tabs = [...els.materialOptions.querySelectorAll('.tab')];
  els.tabs.forEach(tab => tab.addEventListener('click', () => setMaterial(tab.dataset.material)));
  els.sceneFilter.querySelectorAll('.scene-button').forEach(button => button.addEventListener('click', () => {
    const nextScene = button.dataset.scene;
    renderMaterialCatalog(nextScene);
    const visible = Object.entries(MATERIALS).find(([, material]) => nextScene === 'all' || material.scene === nextScene);
    if (visible && !((MATERIALS[state.material]?.scene === nextScene) || nextScene === 'all')) setMaterial(visible[0]);
  }));
}

renderMaterialCatalog();

let statusHideTimer = 0;
function clearInteractionStatus() {
  if (!els.status) return;
  clearTimeout(statusHideTimer);
  els.status.textContent = '';
  els.status.classList.remove('is-visible');
}

if (els.status && typeof MutationObserver !== 'undefined') {
  const statusObserver = new MutationObserver(() => {
    if (!els.status.textContent.trim()) {
      clearTimeout(statusHideTimer);
      els.status.classList.remove('is-visible');
      return;
    }
    els.status.classList.add('is-visible');
    clearTimeout(statusHideTimer);
    statusHideTimer = setTimeout(() => els.status.classList.remove('is-visible'), 2200);
  });
  statusObserver.observe(els.status, { childList: true, characterData: true, subtree: true });
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
} catch (error) {
  canvas.setAttribute('aria-label', '此设备无法启动三维渲染。');
  els.status.textContent = '此设备暂时不支持三维渲染';
  throw error;
}

renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, .1, 30);
camera.position.set(0, .08, 5.5);
camera.lookAt(0, 0, 0);

const hemi = new THREE.HemisphereLight(0xfffdf5, 0x56613c, 2.25);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 4.2);
key.position.set(-1.2, 5.8, 4.8); key.castShadow = true;
key.shadow.mapSize.set(1024, 1024); key.shadow.camera.near = 1; key.shadow.camera.far = 12; key.shadow.radius = 5; key.shadow.blurSamples = 20;
scene.add(key);
const rim = new THREE.PointLight(0xc9ff69, 16, 9, 2);
rim.position.set(3.2, 1.2, 2.5); scene.add(rim);
const fill = new THREE.PointLight(0xff9cce, 8, 8, 2);
fill.position.set(-3, -1.4, 2.4); scene.add(fill);

const modelRoot = new THREE.Group();
modelRoot.rotation.order = 'YXZ';
modelRoot.position.x = -.08;
scene.add(modelRoot);
const particlesRoot = new THREE.Group(); scene.add(particlesRoot);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(7, 7),
  new THREE.ShadowMaterial({ color: 0x453f30, opacity: .14, transparent: true })
);
ground.rotation.x = -Math.PI / 2; ground.position.y = -1.48; ground.receiveShadow = true;
scene.add(ground);

const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
let surfaceMesh = null;
let surfaceMaterial = null;
let basePositions = null;
let bubbleMeshes = [];
let interactiveMeshes = [];
let bubbleSheet = null;
let fruitShell = null;
let fruitShellDamageCanvas = null;
let fruitShellDamageContext = null;
let fruitShellDamageTexture = null;
let fruitShellChips = [];
let fruitCrown = null;
let fruitCracks = [];
let jellyInclusions = [];
const MAX_FRUIT_SHELL_CHIPS = 24;

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function values() { return els.sliders.map(slider => Number(slider.value) / 100); }

// A sound gesture should follow the amount of mesh that is currently displaced,
// not just the fact that a pointer moved. This keeps tiny scrubs quiet and makes
// a long, fast pull noticeably wetter and denser.
function activeStrain() {
  const amounts = [state.currentPull.length(), state.targetPull.length()];
  state.dualGrips.forEach(field => amounts.push(field.current.length(), field.target.length()));
  amounts.sort((a, b) => b - a);
  return clamp((amounts[0] || 0) + (amounts[1] || 0) * .35, 0, .58) / .58;
}

function dragSoundForce(base = .18) {
  const strain = activeStrain();
  const motion = clamp(state.gestureSpeed / 2.6, 0, 1);
  return clamp(base + strain * .58 + motion * .2, .12, 1.12);
}

function releaseSoundForce(base = .28) {
  return clamp(base + activeStrain() * .68 + state.press * .16, .2, 1.12);
}

function updateSlider(slider) {
  const value = Number(slider.value);
  slider.style.setProperty('--fill', `${((value - Number(slider.min)) / (Number(slider.max) - Number(slider.min))) * 100}%`);
  document.getElementById(`${slider.id}Value`).value = value;
}

function makeBubbleBumpTexture(kind) {
  const size = 512; const texCanvas = document.createElement('canvas'); texCanvas.width = texCanvas.height = size;
  const context = texCanvas.getContext('2d'); context.fillStyle = '#777'; context.fillRect(0, 0, size, size);
  const count = kind === 'foam' ? 72 : 420;
  let seed = kind === 'foam' ? 417 : 981;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < count; i++) {
    const x = random() * size; const y = random() * size;
    const radius = kind === 'foam' ? 5 + random() * 15 : 1 + random() * 3;
    const gradient = context.createRadialGradient(x - radius * .28, y - radius * .28, 1, x, y, radius);
    gradient.addColorStop(0, '#f8f8f8'); gradient.addColorStop(.45, '#ababab'); gradient.addColorStop(1, '#494949');
    context.fillStyle = gradient; context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
  }
  const texture = new THREE.CanvasTexture(texCanvas); texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(kind === 'foam' ? 1.8 : 2.7, kind === 'foam' ? 1.25 : 2.7);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); return texture;
}

const foamBump = makeBubbleBumpTexture('foam');
const fruitBump = makeBubbleBumpTexture('fruit');

function disposeObject(object) {
  object.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(material => material.dispose());
    }
  });
}

function clearModel() {
  while (modelRoot.children.length) {
    const child = modelRoot.children[0]; modelRoot.remove(child); disposeObject(child);
  }
  surfaceMesh = null; surfaceMaterial = null; basePositions = null;
  bubbleMeshes = []; interactiveMeshes = []; bubbleSheet = null; fruitShell = null;
  if (fruitShellDamageTexture) fruitShellDamageTexture.dispose();
  fruitShellDamageCanvas = null; fruitShellDamageContext = null; fruitShellDamageTexture = null; fruitShellChips = [];
  fruitCrown = null; fruitCracks = []; jellyInclusions = [];
}

function makeSurfaceMaterial(keyName) {
  if (keyName === 'foam') return new THREE.MeshPhysicalMaterial({
    color: MATERIALS.foam.color, roughness: .3, metalness: 0, clearcoat: .58, clearcoatRoughness: .24,
    bumpMap: foamBump, bumpScale: .085
  });
  if (keyName === 'fruit') return new THREE.MeshPhysicalMaterial({
    color: MATERIALS.fruit.color, roughness: .32, clearcoat: .72, clearcoatRoughness: .16,
    bumpMap: fruitBump, bumpScale: .028
  });
  return new THREE.MeshPhysicalMaterial({
    color: MATERIALS.jelly.color, roughness: .08, metalness: 0, transmission: .42, thickness: 1.05,
    transparent: true, opacity: .66, ior: 1.36, clearcoat: 1, clearcoatRoughness: .1,
    side: THREE.DoubleSide, depthWrite: false
  });
}

function buildSphere(keyName) {
  const geometry = new THREE.SphereGeometry(1.18, 72, 52);
  const positions = geometry.attributes.position;
  const temp = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    temp.fromBufferAttribute(positions, i);
    if (keyName === 'fruit') {
      const direction = temp.clone().normalize();
      const irregular = 1 + Math.sin(direction.x * 7 + direction.y * 4) * .014 + Math.sin(direction.z * 9) * .01;
      temp.multiplyScalar(irregular);
      if (temp.y > .72) temp.y -= (temp.y - .72) * .18;
    } else if (keyName === 'jelly') {
      temp.x *= 1.04; temp.z *= 1.04; temp.y *= .96;
      if (temp.y < -.73) temp.y = -.73 + (temp.y + .73) * .18;
    }
    positions.setXYZ(i, temp.x, temp.y, temp.z);
  }
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  basePositions = new Float32Array(positions.array);
  surfaceMaterial = makeSurfaceMaterial(keyName);
  surfaceMesh = new THREE.Mesh(geometry, surfaceMaterial);
  surfaceMesh.castShadow = true; surfaceMesh.receiveShadow = true; surfaceMesh.userData.surface = true;
  modelRoot.add(surfaceMesh); interactiveMeshes = [surfaceMesh];

  if (keyName === 'fruit') {
    fruitShellDamageCanvas = document.createElement('canvas'); fruitShellDamageCanvas.width = 1024; fruitShellDamageCanvas.height = 512;
    fruitShellDamageContext = fruitShellDamageCanvas.getContext('2d');
    fruitShellDamageContext.fillStyle = '#ffffff'; fruitShellDamageContext.fillRect(0, 0, 1024, 512);
    fruitShellDamageTexture = new THREE.CanvasTexture(fruitShellDamageCanvas);
    fruitShellDamageTexture.colorSpace = THREE.NoColorSpace; fruitShellDamageTexture.needsUpdate = true;
    const shellMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffc477, roughness: .08, clearcoat: 1, clearcoatRoughness: .035,
      transmission: .18, thickness: .16, transparent: true, opacity: .56,
      alphaMap: fruitShellDamageTexture, alphaTest: .015, depthWrite: true, side: THREE.FrontSide
    });
    fruitShell = new THREE.Mesh(geometry, shellMaterial);
    fruitShell.scale.setScalar(1.035); fruitShell.userData.fruitShell = true; fruitShell.renderOrder = 2;
    modelRoot.add(fruitShell);
    fruitCrown = new THREE.Group(); fruitCrown.userData.fruitCrown = true; modelRoot.add(fruitCrown);
    const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x4c2f18, roughness: .82 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.055, .085, .34, 16), stemMaterial);
    stem.position.set(.02, 1.27, -.03); stem.rotation.z = -.13; stem.castShadow = true; fruitCrown.add(stem);
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(.2, 20, 12),
      new THREE.MeshPhysicalMaterial({ color: 0x477e25, roughness: .56, clearcoat: .22 })
    );
    leaf.scale.set(1.45, .16, .62); leaf.position.set(.22, 1.24, .02); leaf.rotation.set(.22, -.25, -.38);
    leaf.castShadow = true; fruitCrown.add(leaf);
  }

  if (keyName === 'jelly') {
    const core = new THREE.Mesh(
      geometry.clone(),
      new THREE.MeshPhysicalMaterial({ color: 0xffabd4, transparent: true, opacity: .12, roughness: .04, side: THREE.BackSide })
    );
    core.scale.setScalar(.91); core.userData.followsSurface = true; modelRoot.add(core);
    const inclusionColors = [0xffd66b, 0x7ee3d1, 0xb79cff, 0xff8a9a, 0xffffff];
    const inclusionData = [
      [-.38, .28, .38, .14], [.34, .18, .3, .11], [-.18, -.26, .46, .095],
      [.4, -.3, .15, .13], [.02, .42, -.28, .075], [-.46, -.08, -.2, .1]
    ];
    inclusionData.forEach(([x, y, z, size], index) => {
      const material = new THREE.MeshPhysicalMaterial({
        color: inclusionColors[index % inclusionColors.length], roughness: .28, metalness: .02,
        transmission: 0, transparent: true, opacity: .94, depthWrite: false, clearcoat: .45, clearcoatRoughness: .16
      });
      const inclusion = new THREE.Mesh(new THREE.IcosahedronGeometry(size * 1.22, 2), material);
      inclusion.position.set(x, y, z); inclusion.rotation.set(index * .7, index * .45, index * .24);
      inclusion.userData.basePosition = inclusion.position.clone(); inclusion.userData.phase = index * .9; inclusion.userData.inclusion = true; inclusion.renderOrder = 4;
      inclusion.castShadow = true; modelRoot.add(inclusion); jellyInclusions.push(inclusion);
    });
  }
}

function buildBubbleWrap() {
  const sheetMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xcdf5ff, transparent: true, opacity: .42, roughness: .12, transmission: .18,
    clearcoat: 1, clearcoatRoughness: .08, side: THREE.DoubleSide, depthWrite: false
  });
  bubbleSheet = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.32, .09, 20, 16, 1), sheetMaterial);
  bubbleSheet.castShadow = true; bubbleSheet.receiveShadow = true; bubbleSheet.userData.sheet = true;
  modelRoot.add(bubbleSheet); interactiveMeshes.push(bubbleSheet);
  const bubbleGeometry = new THREE.SphereGeometry(.17, 20, 14);
  const bubbleMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xd7f8ff, transparent: true, opacity: .62, roughness: .08, transmission: .22,
    clearcoat: 1, clearcoatRoughness: .05, depthWrite: false
  });
  for (let row = 0; row < 6; row++) for (let col = 0; col < 7; col++) {
    const index = row * 7 + col; const bubble = new THREE.Mesh(bubbleGeometry, bubbleMaterial);
    bubble.position.set(-1.17 + col * .39, .96 - row * .385, .105);
    bubble.scale.set(1, 1, .58); bubble.castShadow = true; bubble.userData.bubbleIndex = index;
    bubble.userData.targetZ = .58; modelRoot.add(bubble); bubbleMeshes.push(bubble); interactiveMeshes.push(bubble);
  }
}

function buildMaterial(keyName) {
  clearModel();
  if (keyName === 'bubble') buildBubbleWrap(); else buildSphere(keyName);
  modelRoot.rotation.set(state.rotationX, state.rotationY, 0);
}

function registerPress() {
  state.presses++; els.count.textContent = String(state.presses).padStart(2, '0');
  els.hint.classList.add('is-hidden');
}

function resetPhysics(resetRotation = true) {
  state.pointerId = null; state.mode = ''; state.moved = false; state.targetPress = state.press = state.pressVelocity = 0;
  state.currentPull.set(0, 0, 0); state.targetPull.set(0, 0, 0); state.pullVelocity.set(0, 0, 0);
  state.grabDir.set(0, 0, 1); state.grabUv.set(.5, .5);
  state.deformationPoints.length = 0; state.dualGrips.length = 0;
  state.touchPoints.clear(); state.pinchStartDistance = 0; state.pinchStartPull = 0; state.pinchStartAngle = 0; state.pinchStartRotationY = 0;
  clearTimeout(state.wheelTimer); state.wheelTimer = 0; state.wobble = 0;
  if (resetRotation) {
    state.rotationX = state.targetRotationX = -.08; state.rotationY = state.targetRotationY = .18;
    state.rotationXVelocity = state.rotationYVelocity = 0;
  }
}

function setMaterial(keyName, announce = true) {
  resetPhysics(true); clearParticles(); state.fruitShellCracked = false; state.fruitShellHits = 0; state.material = keyName; state.popped.fill(false); state.bubbleCandidate = -1;
  const material = MATERIALS[keyName];
  els.tabs.forEach(tab => {
    const active = tab.dataset.material === keyName; tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-pressed', String(active));
  });
  els.number.textContent = material.index;
  els.title.innerHTML = `<span>${material.title[0]}</span><em>${material.title[1]}</em>`;
  els.copy.innerHTML = material.copy; els.feel.textContent = material.feel;
  els.controlTitle.textContent = material.zh; els.chip.textContent = material.tag;
  els.footerIndex.textContent = `${material.index} / ${String(Object.keys(MATERIALS).length).padStart(2, '0')}`; canvas.setAttribute('aria-label', material.aria);
  els.sliders.forEach((slider, index) => { slider.value = material.defaults[index]; updateSlider(slider); });
  buildMaterial(keyName); state.wobble = .4;
  if (announce) els.status.textContent = `已切换到三维${material.zh}`;
}

function resetMaterial() {
  resetPhysics(true); clearParticles(); clearFruitCracks(); clearFruitShellChips(); state.fruitShellCracked = false; state.fruitShellHits = 0;
  if (fruitShellDamageContext) { fruitShellDamageContext.globalCompositeOperation = 'source-over'; fruitShellDamageContext.fillStyle = '#ffffff'; fruitShellDamageContext.fillRect(0, 0, 1024, 512); }
  if (fruitShellDamageTexture) fruitShellDamageTexture.needsUpdate = true;
  if (fruitShell) fruitShell.material.opacity = .56;
  if (fruitShell) { fruitShell.visible = true; fruitShell.position.set(0, 0, 0); }
  state.popped.fill(false); state.presses = 0; els.count.textContent = '00';
  bubbleMeshes.forEach(bubble => { bubble.userData.targetZ = .58; bubble.scale.z = .58; bubble.position.z = .105; });
  els.status.textContent = `${MATERIALS[state.material].zh}已完整复原`;
}

function toggleSound(value = !state.sound) {
  state.sound = value; els.soundToggle.setAttribute('aria-checked', String(value));
  els.soundTop.setAttribute('aria-pressed', String(value));
  els.soundTop.querySelector('span').textContent = value ? '声音开启' : '声音关闭';
  els.status.textContent = value ? '声音已开启' : '声音已关闭';
}

function toggleRotation(value = !state.rotationMode) {
  state.rotationMode = value; els.rotateToggle.setAttribute('aria-pressed', String(value));
  canvas.classList.toggle('is-rotate-mode', value);
  els.status.textContent = value ? '三维旋转模式已开启' : '旋转模式已关闭';
}

function initAudio() {
  if (!state.sound) return null;
  if (!state.audio) {
    state.audio = new (window.AudioContext || window.webkitAudioContext)();
    const compressor = state.audio.createDynamicsCompressor();
    compressor.threshold.value = -24; compressor.knee.value = 18; compressor.ratio.value = 5;
    compressor.attack.value = .004; compressor.release.value = .22;
    state.audioBus = state.audio.createGain(); state.audioBus.gain.value = .62;
    state.audioBus.connect(compressor).connect(state.audio.destination);
  }
  if (state.audio.state === 'suspended') state.audio.resume(); return state.audio;
}

function noiseBuffer(audio, duration = .12) {
  const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate);
  const data = buffer.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function audioOutput(audio, force, pan) {
  const output = audio.createGain(); output.gain.value = .16 * clamp(force, .12, 1.15);
  let panner = null;
  if (audio.createStereoPanner) {
    panner = audio.createStereoPanner(); panner.pan.value = clamp(pan, -.68, .68);
    output.connect(panner).connect(state.audioBus);
  } else output.connect(state.audioBus);
  state.activeAudioOutputs++;
  setTimeout(() => {
    try { output.disconnect(); if (panner) panner.disconnect(); } catch (_) {}
    state.activeAudioOutputs = Math.max(0, state.activeAudioOutputs - 1);
  }, 1900);
  return output;
}

function tone(audio, output, start, end, duration, gainValue, type = 'sine', delay = 0) {
  // Keep legacy material calls, but never synthesize a pitched hit. A gently
  // filtered noise cloud gives the same body without the drum-like thump.
  const at = audio.currentTime + delay; const source = audio.createBufferSource();
  source.buffer = noiseBuffer(audio, duration + .04);
  const filter = audio.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = .35;
  filter.frequency.setValueAtTime(clamp(Math.max(start, end) * 2.1, 120, 2200), at);
  filter.frequency.exponentialRampToValueAtTime(clamp(Math.min(start, end) * 1.7, 90, 1600), at + duration);
  const gain = audio.createGain(); const level = gainValue * .24;
  gain.gain.setValueAtTime(.0001, at); gain.gain.linearRampToValueAtTime(level, at + Math.min(.028, duration * .22));
  gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
  source.connect(filter).connect(gain).connect(output); source.start(at); source.stop(at + duration + .04);
}

function noise(audio, output, duration, gainValue, filterType, frequency, q = .8, delay = 0) {
  const at = audio.currentTime + delay; const source = audio.createBufferSource(); source.buffer = noiseBuffer(audio, duration + .02);
  const filter = audio.createBiquadFilter(); filter.type = filterType; filter.frequency.value = frequency; filter.Q.value = q;
  const gain = audio.createGain(); const attack = filterType === 'lowpass' ? .026 : .014;
  gain.gain.setValueAtTime(.0001, at); gain.gain.linearRampToValueAtTime(gainValue, at + Math.min(attack, duration * .3));
  gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
  source.connect(filter).connect(gain).connect(output); source.start(at); source.stop(at + duration + .025);
}

function modulatedNoise(audio, output, duration, gainValue, frequency, depth, rate, delay = 0) {
  const at = audio.currentTime + delay; const source = audio.createBufferSource(); source.buffer = noiseBuffer(audio, duration + .04);
  const filter = audio.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = .62; filter.frequency.value = frequency;
  const lfo = audio.createOscillator(); const lfoGain = audio.createGain(); lfo.type = 'sine'; lfo.frequency.value = rate; lfoGain.gain.value = depth;
  lfo.connect(lfoGain).connect(filter.frequency);
  const gain = audio.createGain(); gain.gain.setValueAtTime(.0001, at); gain.gain.linearRampToValueAtTime(gainValue, at + Math.min(.04, duration * .22));
  gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
  source.connect(filter).connect(gain).connect(output); lfo.start(at); source.start(at); lfo.stop(at + duration + .05); source.stop(at + duration + .05);
}

function microCrackles(audio, output, count, brightness, strength) {
  for (let index = 0; index < count; index++) {
    noise(audio, output, .012 + Math.random() * .018, strength * (.55 + Math.random() * .45), 'bandpass', brightness * (.72 + Math.random() * .55), 3.2, .018 + Math.random() * .13);
  }
}

function sound(kind, force = 1) {
  const audio = initAudio(); if (!audio) return; const now = audio.currentTime; const grain = values()[2];
  const motion = clamp(state.gestureSpeed / 2.6, 0, 1);
  const slowMaterial = state.material === 'jelly' || state.material === 'fruit';
  const cooldown = kind === 'drag'
    ? (slowMaterial ? .3 + (1 - grain) * .2 + (1 - motion) * .32 : state.material === 'bubble' ? .22 + (1 - grain) * .18 : .068 + (1 - grain) * .12)
    : kind === 'rotate' ? .14 : .045;
  if (kind !== 'release' && kind !== 'crack' && kind !== 'peel' && now - state.lastSound < cooldown) return; state.lastSound = now;
  const pan = pointerNdc.x || 0; const master = audioOutput(audio, force, pan);
  state.soundEvent++; canvas.dataset.soundEvent = String(state.soundEvent); canvas.dataset.soundProfile = `${state.material}-${kind}`;
  if (state.material === 'bubble') {
    if (kind === 'rotate') { noise(audio, master, .07, .12, 'highpass', 2400 + grain * 2600); return; }
    if (kind === 'drag') {
      const variation = Math.random();
      // Stretching the sheet is a quiet plastic rub, not a stream of pops.
      // Only the explicit press path below is allowed to produce a crack/pop.
      noise(audio, master, .032 + variation * .024, .045 + force * (.028 + variation * .025), 'highpass', 1800 + grain * 1800 + variation * 900, 1.2 + variation * .8);
      if (variation > .64) microCrackles(audio, master, 1, 2800 + grain * 1900 + variation * 900, .016 + force * .012);
      return;
    }
    const pop = Math.random();
    noise(audio, master, .03 + pop * .04, .38 + pop * .3, 'bandpass', 1300 + grain * 1800 + pop * 1500, 1.15 + pop * 2.1);
    microCrackles(audio, master, 2 + Math.floor(Math.random() * 4), 2400 + grain * 2200 + pop * 1800, .07 + pop * .06);
    tone(audio, master, 250 + pop * 260, 88 + pop * 90, .055 + pop * .045, .1 + pop * .09);
    return;
  }
  if (state.material === 'jelly') {
    const release = kind === 'release';
    const strain = activeStrain();
    const motion = clamp(state.gestureSpeed / 2.6, 0, 1);
    if (kind === 'drag') {
      // Bilibili jelly ASMR is sparse: one wet, low wobble per slow pull,
      // with a tiny skin-rub only when the stretch is genuinely large.
      const bodyCut = 92 + grain * 48 + strain * 82;
      const bodyLength = .22 + strain * .26 + motion * .06;
      modulatedNoise(audio, master, bodyLength, .052 + strain * .065 + force * .012, bodyCut, 18 + strain * 42, .38 + motion * .32);
      if (strain > .28 && motion > .18) noise(audio, master, .026 + strain * .018, .009 + strain * .014, 'bandpass', 620 + grain * 260 + strain * 260, 1.1, .075);
      return;
    }
    if (kind === 'press') {
      modulatedNoise(audio, master, .2 + strain * .12, .045 + strain * .045, 105 + grain * 55 + strain * 65, 20 + strain * 32, .52);
      return;
    }
    if (release) {
      // A long, quiet suction tail replaces the old drum-like mid-band hit.
      const tail = .62 + strain * .68;
      modulatedNoise(audio, master, tail, .055 + strain * .08, 78 + grain * 42 + strain * 92, 24 + strain * 48, .32 + motion * .16);
      noise(audio, master, .045 + strain * .035, .008 + strain * .018, 'highpass', 880 + strain * 420, 1.25, tail * .34);
      return;
    }
    modulatedNoise(audio, master, .2, .035 + strain * .025, 105 + grain * 55 + strain * 75, 18, .42);
  } else if (state.material === 'fruit') {
    const release = kind === 'release';
    const strain = activeStrain();
    if (kind === 'peel') {
      // Egg-shell peeling: one dry lift, a soft membrane scrape, then silence.
      const lift = Math.random();
      noise(audio, master, .022 + lift * .018, .11 + force * .055, 'bandpass', 1850 + grain * 1300 + lift * 900, 2.4);
      noise(audio, master, .075 + lift * .045, .018 + force * .018, 'highpass', 3200 + grain * 1500 + lift * 900, 1.5, .024);
      noise(audio, master, .12 + lift * .08, .012 + force * .012, 'lowpass', 180 + grain * 80 + lift * 70, .7, .05);
      return;
    }
    if (kind === 'drag') {
      // Fruit is a dense juicy body with a faint peel rub on top.
      modulatedNoise(audio, master, .3 + strain * .22, .065 + strain * .07 + force * .018, 180 + grain * 120 + strain * 190, 42 + strain * 80, .9 + motion * .5);
      noise(audio, master, .1 + strain * .09, .014 + strain * .035 + motion * .02, 'bandpass', 380 + grain * 250 + strain * 380, 1.05, .05);
      noise(audio, master, .05 + strain * .04, .008 + strain * .018, 'highpass', 1500 + grain * 800 + strain * 1100, .7, .08);
      return;
    }
    const body = release ? .36 + strain * .24 : .25 + strain * .12;
    modulatedNoise(audio, master, body, release ? .075 + strain * .08 : .055 + strain * .035, 175 + grain * 120 + strain * 170, 38 + strain * 70, release ? .68 : .9);
    noise(audio, master, release ? .12 + strain * .08 : .07, .015 + strain * .04, 'bandpass', 410 + grain * 280 + strain * 360, 1.05, release ? .1 : .05);
  } else {
    const release = kind === 'release';
    if (kind === 'drag') { tone(audio, master, 126 + grain * 35, 42, .2, .14 + force * .05, 'triangle'); noise(audio, master, .24, .17 + force * .05, 'lowpass', 250 + grain * 360); microCrackles(audio, master, Math.max(1, Math.round(grain * 4)), 1500 + grain * 1900, .028 + grain * .03); return; }
    tone(audio, master, release ? 168 : 112, release ? 52 : 42, release ? .34 : .22, .22, 'triangle');
    noise(audio, master, release ? .32 : .2, .2, 'lowpass', 270 + grain * 430); microCrackles(audio, master, 1 + Math.round(grain * 4), 1700 + grain * 1800, .035 + grain * .025);
  }
}

function resize() {
  const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
  renderer.setSize(rect.width, rect.height, false); camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix();
  canvas.dataset.renderer = 'webgl-3d'; canvas.dataset.depth = String(renderer.capabilities.isWebGL2 ? 'webgl2' : 'webgl1');
}

function updatePointer(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);
}

function hitTest(clientX, clientY) {
  updatePointer(clientX, clientY);
  return raycaster.intersectObjects(interactiveMeshes, false).find(hit => hit.object.visible) || null;
}

function setGrabFromHit(hit) {
  if (!surfaceMesh || !hit) { state.grabDir.set(0, 0, 1); state.grabPoint.set(0, 0, 1.18); state.grabUv.set(.5, .5); return; }
  const local = surfaceMesh.worldToLocal(hit.point.clone()); state.grabPoint.copy(local); state.grabDir.copy(local).normalize();
  if (hit.uv) state.grabUv.copy(hit.uv);
}

function localDirectionAt(clientX, clientY, hit = hitTest(clientX, clientY)) {
  if (surfaceMesh && hit?.point) return surfaceMesh.worldToLocal(hit.point.clone()).normalize();
  updatePointer(clientX, clientY);
  const direction = new THREE.Vector3(pointerNdc.x * .92, pointerNdc.y * .92, .68).normalize();
  return direction.applyQuaternion(modelRoot.quaternion.clone().invert()).normalize();
}

function preserveCurrentPull() {
  const retainedPull = state.currentPull.lengthSq() >= state.targetPull.lengthSq() ? state.currentPull : state.targetPull;
  if (retainedPull.lengthSq() < .00001) return;
  rememberDeformationField({
    grab: state.grabDir.clone(), current: retainedPull.clone(), target: new THREE.Vector3(),
    velocity: state.pullVelocity.clone(), idle: 0
  });
  state.currentPull.set(0, 0, 0); state.targetPull.set(0, 0, 0); state.pullVelocity.set(0, 0, 0);
}

function rememberDeformationField(field) {
  state.deformationPoints.push(field);
  if (state.deformationPoints.length > MAX_DEFORMATION_POINTS) {
    state.deformationPoints.splice(0, state.deformationPoints.length - MAX_DEFORMATION_POINTS);
  }
}

function releaseActiveGesture() {
  if (state.mode) state.cancelCount++;
  if (state.mode === 'grab' || (state.mode === 'pinch' && !state.dualGrips.length)) preserveCurrentPull();
  state.dualGrips.forEach(field => { field.target.set(0, 0, 0); field.idle = 0; });
  state.dualGrips.length = 0; state.mode = ''; state.pointerId = null;
  state.targetPress = 0; state.targetPull.set(0, 0, 0); state.touchPoints.clear();
  state.moved = false; state.bubbleCandidate = -1; state.gestureSpeed = 0;
  if (MATERIALS[state.material]) els.status.textContent = `${MATERIALS[state.material].zh}正在慢慢回弹`;
}

function startsOutsideObject(clientX, clientY) {
  const rect = canvas.getBoundingClientRect(); const dx = clientX - rect.left - rect.width / 2; const dy = clientY - rect.top - rect.height / 2;
  const radius = Math.min(rect.width, rect.height) * (state.material === 'bubble' ? .31 : .25);
  return Math.hypot(dx, dy) > radius;
}

function beginRotation(event) {
  state.mode = 'rotate'; state.pointerId = event.pointerId; state.lastX = event.clientX; state.lastY = event.clientY;
  state.lastMoveTime = performance.now(); try { canvas.setPointerCapture(event.pointerId); } catch (_) {} els.hint.classList.add('is-hidden');
  els.status.textContent = '正在三维旋转'; sound('rotate', .34);
}

function beginGrab(event, hit) {
  state.mode = 'grab'; state.pointerId = event.pointerId; state.startX = state.lastX = event.clientX; state.startY = state.lastY = event.clientY;
  state.lastMoveTime = performance.now(); state.moved = false; state.targetPress = state.material === 'bubble' ? 0 : 1;
  state.bubbleCandidate = hit?.object?.userData?.bubbleIndex ?? -1; setGrabFromHit(hit);
  try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
  if (state.material !== 'bubble') { registerPress(); spawnFruitDrops(); }
  sound('press', .72);
}

function pointerDown(event) {
  event.preventDefault(); initAudio(); updatePointer(event.clientX, event.clientY);
  state.gestureCount++;
  if (event.pointerType === 'touch') {
    state.touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, field: null });
    if (state.touchPoints.size >= 2) { beginTouchPinch(); return; }
  }
  const hit = hitTest(event.clientX, event.clientY);
  if (state.rotationMode || event.altKey || event.button === 2 || (!hit && startsOutsideObject(event.clientX, event.clientY))) beginRotation(event);
  else if (hit) beginGrab(event, hit);
  else beginRotation(event);
}

function screenPullToLocal(dx, dy) {
  const rect = canvas.getBoundingClientRect(); const scale = 2.3 / Math.max(280, Math.min(rect.width, rect.height));
  const world = new THREE.Vector3(dx * scale, -dy * scale, 0);
  const inverseRotation = modelRoot.quaternion.clone().invert(); world.applyQuaternion(inverseRotation);
  return world.clampLength(0, .5);
}

function pointerMove(event) {
  if (event.pointerType === 'touch' && state.touchPoints.has(event.pointerId)) {
    const touch = state.touchPoints.get(event.pointerId); touch.x = event.clientX; touch.y = event.clientY;
    if (state.touchPoints.size >= 2) { updateTouchPinch(); return; }
  }
  if (state.pointerId !== event.pointerId) {
    const hit = hitTest(event.clientX, event.clientY); canvas.style.cursor = state.rotationMode ? 'alias' : hit ? 'grab' : 'crosshair'; return;
  }
  const now = performance.now(); const elapsed = Math.max(12, now - state.lastMoveTime);
  const step = Math.hypot(event.clientX - state.lastX, event.clientY - state.lastY);
  state.gestureSpeed = state.gestureSpeed * .65 + step / elapsed * 16 * .35;
  if (state.mode === 'rotate') {
    state.targetRotationY += (event.clientX - state.lastX) * .009;
    state.targetRotationX = clamp(state.targetRotationX + (event.clientY - state.lastY) * .008, -1.3, 1.3);
    sound('rotate', clamp(.24 + state.gestureSpeed * .05, .24, .7));
  } else if (state.mode === 'grab') {
    const totalX = event.clientX - state.startX; const totalY = event.clientY - state.startY;
    if (Math.hypot(totalX, totalY) > 5) { state.moved = true; state.targetPress = 0; }
    if (state.moved && surfaceMesh) {
      if (state.material === 'fruit' && !state.fruitShellCracked) {
        state.targetPull.set(0, 0, 0); els.status.textContent = '糖衣很硬，先敲碎它';
      } else {
        state.targetPull.copy(screenPullToLocal(totalX, totalY));
        els.status.textContent = '正在改变三维网格'; sound('drag', dragSoundForce(.16));
      }
    } else if (state.moved && state.material === 'bubble') {
      state.targetRotationY += (event.clientX - state.lastX) * .006;
      state.targetRotationX = clamp(state.targetRotationX + (event.clientY - state.lastY) * .005, -1.3, 1.3);
    }
  }
  state.lastX = event.clientX; state.lastY = event.clientY; state.lastMoveTime = now;
}

function popBubble(index) {
  if (index < 0 || state.popped[index]) return;
  state.popped[index] = true; bubbleMeshes[index].userData.targetZ = .07; registerPress(); sound('press', 1.05);
  state.wobble = .32; els.status.textContent = `按破了第 ${state.presses} 个立体气泡`;
}

function releasePointer(event) {
  if (event.pointerType === 'touch') {
    state.touchPoints.delete(event.pointerId);
    if (state.mode === 'pinch' && state.touchPoints.size < 2) { state.releaseCount++; endPinch(); return; }
  }
  if (state.pointerId !== event.pointerId) return;
  state.releaseCount++;
  if (state.material === 'bubble' && state.mode === 'grab' && !state.moved) popBubble(state.bubbleCandidate);
  const shellTap = state.material === 'fruit' && state.mode === 'grab' && !state.moved;
  if (shellTap) {
    const releaseHit = hitTest(event.clientX, event.clientY);
    if (releaseHit) setGrabFromHit(releaseHit);
    crackFruitShell(state.grabDir, state.grabUv);
  }
  const wasMode = state.mode; const releaseForce = releaseSoundForce();
  if (wasMode === 'grab' || (wasMode === 'pinch' && !state.dualGrips.length)) preserveCurrentPull();
  state.mode = ''; state.pointerId = null; state.targetPress = 0; state.targetPull.set(0, 0, 0);
  state.wobble = .25 + values()[1] * (1.1 + MATERIALS[state.material].physics.wobble * .9); if (!shellTap) sound('release', releaseForce);
  els.status.textContent = shellTap ? '' : state.material === 'fruit' && !state.fruitShellCracked && wasMode === 'grab' && state.moved
    ? '糖衣很硬，先敲碎它'
    : wasMode === 'rotate' ? `${MATERIALS[state.material].zh}已转到新角度` : `${MATERIALS[state.material].zh}正在慢慢回弹`;
  if (shellTap) clearInteractionStatus();
  try { canvas.releasePointerCapture(event.pointerId); } catch (_) {}
}

function touchGesture() {
  const points = [...state.touchPoints.values()]; if (points.length < 2) return null;
  return {
    distance: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y),
    x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2,
    angle: Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x)
  };
}

function shortestAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function beginTouchPinch() {
  const gesture = touchGesture(); if (!gesture) return;
  if (state.mode === 'grab') preserveCurrentPull();
  state.mode = 'pinch'; state.pointerId = null; state.targetPress = 0; state.targetPull.set(0, 0, 0);
  state.currentPull.set(0, 0, 0); state.pullVelocity.set(0, 0, 0);
  state.pinchStartDistance = Math.max(1, gesture.distance);
  state.dualGrips.length = 0;
  [...state.touchPoints.values()].slice(0, 2).forEach(touch => {
    const hit = hitTest(touch.x, touch.y); const field = {
      grab: localDirectionAt(touch.x, touch.y, hit), current: new THREE.Vector3(), target: new THREE.Vector3(),
      velocity: new THREE.Vector3(), idle: 0
    };
    touch.field = field; state.dualGrips.push(field); rememberDeformationField(field);
  });
  state.pinchStartAngle = gesture.angle; state.pinchStartRotationY = state.targetRotationY;
  registerPress(); sound('drag', .35);
}

function updateTouchPinch() {
  const gesture = touchGesture(); if (!gesture) return;
  if (state.mode !== 'pinch') beginTouchPinch();
  const angleDelta = shortestAngle(gesture.angle - state.pinchStartAngle);
  state.targetRotationY = state.pinchStartRotationY + angleDelta * .9;
  [...state.touchPoints.values()].slice(0, 2).forEach(touch => {
    if (!touch.field) return;
    touch.field.target.copy(screenPullToLocal(touch.x - touch.startX, touch.y - touch.startY)).multiplyScalar(1.18).clampLength(0, .48);
  });
  sound('drag', dragSoundForce(.14));
}

function endPinch() {
  const releaseForce = releaseSoundForce();
  state.dualGrips.forEach(field => { field.target.set(0, 0, 0); field.idle = 0; });
  if (!state.dualGrips.length) preserveCurrentPull();
  state.dualGrips.length = 0; state.mode = ''; state.targetPull.set(0, 0, 0);
  state.wobble = .25 + values()[1] * 1.45; sound('release', releaseForce);
  els.status.textContent = `${MATERIALS[state.material].zh}正在慢慢回弹`;
}

function trackpadPinch(event) {
  if (!event.ctrlKey || !els.stage.contains(event.target)) return;
  event.preventDefault(); initAudio(); const hit = hitTest(event.clientX, event.clientY); if (hit) setGrabFromHit(hit);
  const next = clamp(state.targetPull.dot(state.grabDir) + (-event.deltaY) * .006, -.16, .48);
  state.targetPull.copy(state.grabDir).multiplyScalar(next); state.mode = 'pinch'; sound('drag', dragSoundForce(.14));
  clearTimeout(state.wheelTimer); state.wheelTimer = setTimeout(endPinch, 130);
}

function keyboardPress(event) {
  const rotating = event.code === 'KeyQ' || event.code === 'KeyE';
  const direction = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code);
  const squeezing = event.code === 'Space' || event.code === 'Enter';
  if (!rotating && !direction && !squeezing) return; event.preventDefault();
  if (rotating && event.type === 'keydown' && !event.repeat) {
    state.targetRotationY += event.code === 'KeyQ' ? -.24 : .24; sound('rotate', .38); return;
  }
  if (direction && event.type === 'keydown') {
    const vectors = { ArrowUp: [0, .12, 0], ArrowDown: [0, -.12, 0], ArrowLeft: [-.12, 0, 0], ArrowRight: [.12, 0, 0] };
    const vector = new THREE.Vector3(...vectors[event.code]).applyQuaternion(modelRoot.quaternion.clone().invert());
    state.grabDir.set(0, 0, 1).applyQuaternion(modelRoot.quaternion.clone().invert());
    state.targetPull.add(vector).clampLength(0, .45); sound('drag', .4); return;
  }
  if (direction && event.type === 'keyup') { state.targetPull.set(0, 0, 0); sound('release', .5); return; }
  if (squeezing && event.type === 'keydown' && !event.repeat) {
    if (state.material === 'bubble') popBubble(state.popped.findIndex(value => !value));
    else { state.grabDir.set(0, 0, 1); state.targetPress = 1; registerPress(); sound('press', .75); }
  } else if (squeezing && event.type === 'keyup') { state.targetPress = 0; state.wobble = .25 + values()[1] * 1.35; sound('release', .65); }
}

function springScalar(value, velocity, target, stiffness, damping, dt, maxVelocity = 10) {
  const acceleration = (target - value) * stiffness - velocity * damping;
  velocity = clamp(velocity + acceleration * dt, -maxVelocity, maxVelocity); value += velocity * dt;
  if (Math.abs(target - value) < .0001 && Math.abs(velocity) < .001) return [target, 0]; return [value, velocity];
}

function springVector(current, velocity, target, stiffness, damping, dt) {
  const acceleration = target.clone().sub(current).multiplyScalar(stiffness).addScaledVector(velocity, -damping);
  velocity.addScaledVector(acceleration, dt); if (velocity.length() > 5) velocity.setLength(5); current.addScaledVector(velocity, dt);
  if (current.distanceToSquared(target) < .000001 && velocity.lengthSq() < .00001) { current.copy(target); velocity.set(0, 0, 0); }
}

function deformationFields() {
  const fields = [];
  if ((state.mode === 'grab' || state.mode === 'pinch' || state.currentPull.lengthSq() > .00001) && state.currentPull.lengthSq() > .00001) {
    fields.push({ grab: state.grabDir, current: state.currentPull });
  }
  state.deformationPoints.forEach(field => { if (field.current.lengthSq() > .000001) fields.push(field); });
  return fields;
}

function deformationOffsetAt(direction) {
  const [softness] = values(); const sigma = .045 + softness * .19; const pullGain = .78 + softness * .52;
  const offset = new THREE.Vector3();
  deformationFields().forEach(field => {
    const pull = field.current; const pullLength = pull.length(); if (pullLength < .0001) return;
    const grab = field.grab; const angular = 1 - clamp(direction.dot(grab), -1, 1);
    const weight = Math.exp(-angular / sigma); const ring = Math.exp(-Math.pow(angular - sigma * 1.55, 2) / (sigma * sigma * .72));
    const outward = pullLength * (.48 + softness * .55);
    offset.addScaledVector(pull, pullGain * weight).addScaledVector(grab, outward * weight).addScaledVector(direction, -pullLength * ring * .08);
  });
  const angular = 1 - clamp(direction.dot(state.grabDir), -1, 1);
  const pressWeight = Math.exp(-angular / sigma); const pressRing = Math.exp(-Math.pow(angular - sigma * 1.55, 2) / (sigma * sigma * .72));
  offset.addScaledVector(direction, state.press * (-.24 * pressWeight + .05 * pressRing));
  return offset;
}

function deformSurface() {
  if (!surfaceMesh || !basePositions) return;
  const geometry = surfaceMesh.geometry; const attribute = geometry.attributes.position; const array = attribute.array;
  const [softness, , texture] = values();
  // Softness changes both the size of the affected patch and how far the material follows the finger.
  const sigma = .045 + softness * .19; const pullGain = .78 + softness * .52; const direction = new THREE.Vector3();
  const shellLocked = state.material === 'fruit' && !state.fruitShellCracked;
  const fields = shellLocked ? [] : deformationFields();
  let changed = false;
  for (let index = 0; index < attribute.count; index++) {
    const offset = index * 3; const bx = basePositions[offset]; const by = basePositions[offset + 1]; const bz = basePositions[offset + 2];
    direction.set(bx, by, bz).normalize(); let px = bx; let py = by; let pz = bz;
    fields.forEach(field => {
      const pull = field.current; const pullLength = pull.length(); if (pullLength < .0001) return;
      const grab = field.grab; const angular = 1 - clamp(direction.dot(grab), -1, 1);
      const weight = Math.exp(-angular / sigma); const ring = Math.exp(-Math.pow(angular - sigma * 1.55, 2) / (sigma * sigma * .72));
      const outward = pullLength * (.48 + softness * .55);
      px += (pull.x * pullGain + grab.x * outward) * weight - direction.x * pullLength * ring * .08;
      py += (pull.y * pullGain + grab.y * outward) * weight - direction.y * pullLength * ring * .08;
      pz += (pull.z * pullGain + grab.z * outward) * weight - direction.z * pullLength * ring * .08;
      changed ||= weight > .001;
    });
    const angular = 1 - clamp(direction.dot(state.grabDir), -1, 1); const pressWeight = Math.exp(-angular / sigma);
    const pressRing = Math.exp(-Math.pow(angular - sigma * 1.55, 2) / (sigma * sigma * .72));
    const effectivePress = shellLocked ? 0 : state.press;
    const dent = effectivePress * .24 * pressWeight; const bulge = effectivePress * .05 * pressRing;
    array[offset] = px + direction.x * (-dent + bulge);
    array[offset + 1] = py + direction.y * (-dent + bulge);
    array[offset + 2] = pz + direction.z * (-dent + bulge);
    changed ||= effectivePress > .0005;
  }
  attribute.needsUpdate = true;
  if (changed || state.pressVelocity || state.pullVelocity.lengthSq() > .00001) geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  if (surfaceMaterial?.bumpMap) surfaceMaterial.bumpScale = state.material === 'foam' ? .06 + texture * .14 : .012 + texture * .035;
  canvas.dataset.deformedVertices = String(attribute.count); canvas.dataset.closedMesh = 'true';
}

function spawnFruitDrops() {
  if (reducedMotion || state.material !== 'fruit' || state.presses % 3) return;
  const origin = state.grabDir.clone().multiplyScalar(1.15).applyQuaternion(modelRoot.quaternion);
  for (let index = 0; index < 6; index++) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(.035 + Math.random() * .025, 10, 8), new THREE.MeshBasicMaterial({ color: index % 2 ? 0xff9e37 : 0xff315d }));
    mesh.position.copy(origin); particlesRoot.add(mesh);
    state.particles.push({ mesh, velocity: new THREE.Vector3((Math.random() - .5) * 1.1, .7 + Math.random() * .9, .2 + Math.random() * .5), life: 1 });
  }
}

function paintFruitShellDamage(direction, radius = .14, uv = state.grabUv) {
  if (!fruitShellDamageContext || !fruitShellDamageTexture) return;
  const local = direction.clone().normalize();
  const width = fruitShellDamageCanvas.width; const height = fruitShellDamageCanvas.height;
  const u = clamp(uv?.x ?? (.5 + Math.atan2(local.z, local.x) / (Math.PI * 2)), 0, 1) * width;
  const v = clamp(uv?.y ?? Math.acos(clamp(local.y, -1, 1)) / Math.PI, 0, 1) * height;
  const pixelRadius = radius * width * .52;
  const drawHole = x => {
    const gradient = fruitShellDamageContext.createRadialGradient(x, v, 0, x, v, pixelRadius);
    gradient.addColorStop(0, 'rgba(0,0,0,1)'); gradient.addColorStop(.72, 'rgba(0,0,0,.94)'); gradient.addColorStop(1, 'rgba(0,0,0,0)');
    fruitShellDamageContext.fillStyle = gradient; fruitShellDamageContext.beginPath(); fruitShellDamageContext.arc(x, v, pixelRadius, 0, Math.PI * 2); fruitShellDamageContext.fill();
  };
  fruitShellDamageContext.save(); fruitShellDamageContext.globalCompositeOperation = 'destination-out';
  drawHole(u); if (u < pixelRadius) drawHole(u + width); if (u > width - pixelRadius) drawHole(u - width);
  fruitShellDamageContext.restore(); fruitShellDamageTexture.needsUpdate = true;
}

function dropFruitSugarChip(direction, anchor = null) {
  const localDirection = direction.clone().normalize();
  const radius = 1.18 * 1.035; const patchAngle = .26 + Math.random() * .08;
  const geometry = new THREE.SphereGeometry(radius, 14, 10, -patchAngle / 2, patchAngle, Math.PI / 2 - patchAngle / 2, patchAngle);
  geometry.translate(-radius, 0, 0);
  const patchQuaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), localDirection);
  geometry.applyQuaternion(patchQuaternion);
  modelRoot.updateMatrixWorld(true);
  const material = new THREE.MeshPhysicalMaterial({ color: 0xffc477, roughness: .08, clearcoat: 1, clearcoatRoughness: .035, transmission: .12, side: THREE.DoubleSide });
  const chip = new THREE.Group();
  const shellPiece = new THREE.Mesh(geometry, material);
  shellPiece.rotation.z = (Math.random() - .5) * .16;
  chip.add(shellPiece);
  // A pale membrane rim makes this read as a lifted egg shell, rather than a
  // circular hole or a flat sticker. It falls away with the sugar-glaze piece.
  const edgeGeometry = new THREE.RingGeometry(radius * (.038 + Math.random() * .012), radius * (.061 + Math.random() * .016), 13);
  edgeGeometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), localDirection));
  edgeGeometry.scale(1.05 + Math.random() * .18, .76 + Math.random() * .18, 1);
  const edgeMaterial = new THREE.MeshPhysicalMaterial({ color: 0xffedcf, roughness: .48, clearcoat: .18, transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false });
  const peelEdge = new THREE.Mesh(edgeGeometry, edgeMaterial);
  peelEdge.position.copy(localDirection).multiplyScalar(.014);
  peelEdge.userData.fruitPeelEdge = true;
  chip.add(peelEdge);
  // Anchor the falling piece to the exact ray-hit point. Using only the
  // normalized direction placed shards at the ideal sphere radius, which
  // drifted away from the tapped spot after scale, wobble, or deformation.
  const localAnchor = anchor?.clone() || localDirection.clone().multiplyScalar(radius);
  chip.position.copy(modelRoot.localToWorld(localAnchor));
  chip.userData.fruitSugarChip = true; chip.userData.peelStyle = 'egg-shell';
  chip.quaternion.copy(modelRoot.getWorldQuaternion(new THREE.Quaternion())); chip.scale.copy(modelRoot.getWorldScale(new THREE.Vector3()));
  chip.renderOrder = 5; particlesRoot.add(chip); fruitShellChips.push(chip);
  if (fruitShellChips.length > MAX_FRUIT_SHELL_CHIPS) {
    const oldest = fruitShellChips.shift();
    const particleIndex = state.particles.findIndex(particle => particle.mesh === oldest);
    if (particleIndex >= 0) state.particles.splice(particleIndex, 1);
    particlesRoot.remove(oldest); disposeObject(oldest);
  }
  if (reducedMotion) { particlesRoot.remove(chip); fruitShellChips.pop(); disposeObject(chip); return; }
  const velocity = new THREE.Vector3((Math.random() - .5) * .42, -.28 - Math.random() * .38, (Math.random() - .5) * .42).addScaledVector(localDirection, .1);
  state.particles.push({ mesh: chip, velocity: velocity.applyQuaternion(modelRoot.quaternion), angularVelocity: new THREE.Vector3((Math.random() - .5) * 2.4, (Math.random() - .5) * 2.4, (Math.random() - .5) * 2.4), life: 1.7 + Math.random() * .7 });
}

function crackFruitShell(direction = state.grabDir, uv = state.grabUv) {
  if (state.material !== 'fruit' || !fruitShell) return;
  state.fruitShellHits++;
  const normal = direction.clone().normalize();
  // Keep each sugar-glaze break local. Growing the hole with hit count made
  // the last few taps erase the whole shell instead of dropping one shard.
  const damageRadius = clamp(.078 + Math.random() * .026 + Math.min(state.fruitShellHits, 8) * .002, .078, .12);
  paintFruitShellDamage(normal, damageRadius, uv);
  fruitShell.material.opacity = Math.max(.4, .56 - state.fruitShellHits * .026);
  dropFruitSugarChip(normal, state.grabPoint);
  sound('peel', .66 + state.fruitShellHits * .045);
  const remaining = Math.max(0, 6 - state.fruitShellHits);
  if (!state.fruitShellCracked && !remaining) state.fruitShellCracked = true;
  clearInteractionStatus();
}

function clearFruitShellChips() {
  fruitShellChips.forEach(chip => {
    if (chip.parent) chip.parent.remove(chip);
    disposeObject(chip);
  });
  fruitShellChips.length = 0;
}

function clearFruitCracks() {
  fruitCracks.forEach(crack => { modelRoot.remove(crack); disposeObject(crack); });
  fruitCracks.length = 0;
}

function updateParticles(dt) {
  state.particles = state.particles.filter(particle => {
    particle.velocity.y -= 2.8 * dt; particle.mesh.position.addScaledVector(particle.velocity, dt); particle.life -= dt * 1.35;
    if (particle.angularVelocity) {
      particle.mesh.rotation.x += particle.angularVelocity.x * dt;
      particle.mesh.rotation.y += particle.angularVelocity.y * dt;
      particle.mesh.rotation.z += particle.angularVelocity.z * dt;
    }
    particle.mesh.scale.setScalar(Math.max(.01, particle.life));
    if (particle.life <= 0) {
      particlesRoot.remove(particle.mesh);
      if (particle.mesh.userData.fruitSugarChip) {
        const chipIndex = fruitShellChips.indexOf(particle.mesh); if (chipIndex >= 0) fruitShellChips.splice(chipIndex, 1);
      }
      disposeObject(particle.mesh); return false;
    } return true;
  });
}

function clearParticles() {
  state.particles.forEach(particle => { particlesRoot.remove(particle.mesh); disposeObject(particle.mesh); });
  state.particles.length = 0;
}

function updateBubbleMeshes(dt) {
  bubbleMeshes.forEach((bubble, index) => {
    const target = state.popped[index] ? .07 : .58; bubble.userData.targetZ = target;
    bubble.scale.z += (target - bubble.scale.z) * Math.min(1, dt * (state.popped[index] ? 18 : 9));
    bubble.position.z += ((state.popped[index] ? .035 : .105) - bubble.position.z) * Math.min(1, dt * 12);
  });
  canvas.dataset.closedMesh = 'true'; canvas.dataset.deformedVertices = '42';
}

function animate(time) {
  requestAnimationFrame(animate);
  try {
    const dt = state.lastFrame ? Math.min((time - state.lastFrame) / 1000, 1 / 30) : 1 / 60; state.lastFrame = time;
    const [softness, bounce] = values(); const physics = MATERIALS[state.material].physics;
    const active = state.mode === 'grab' || state.mode === 'pinch';
    const activeStiffness = physics.response * (.62 + softness * .82);
    const activeDamping = physics.damping * (.72 + softness * .44) + 1.6;
    // Release is deliberately slower than the grab response: the material should
    // settle back into its volume instead of snapping to the base mesh.
    const releaseStiffness = physics.release * (.10 + bounce * .46);
    const releaseDamping = 4.4 + (1 - bounce) * 8.2;
    const currentIsHeld = state.targetPull.lengthSq() > .00001 || active;
    springVector(state.currentPull, state.pullVelocity, state.targetPull, reducedMotion ? 95 : (currentIsHeld ? activeStiffness : releaseStiffness), reducedMotion ? 20 : (currentIsHeld ? activeDamping : releaseDamping), dt);
    state.deformationPoints.forEach(field => {
      const fieldIsHeld = field.target.lengthSq() > .00001;
      springVector(field.current, field.velocity, field.target, reducedMotion ? 95 : (fieldIsHeld ? activeStiffness : releaseStiffness), reducedMotion ? 20 : (fieldIsHeld ? activeDamping : releaseDamping), dt);
      if (field.target.lengthSq() < .00001 && field.current.lengthSq() < .00002 && field.velocity.lengthSq() < .00002) field.idle += dt; else field.idle = 0;
    });
    state.deformationPoints = state.deformationPoints.filter(field => field.idle < 1.8);
    [state.press, state.pressVelocity] = springScalar(state.press, state.pressVelocity, state.targetPress, state.targetPress ? activeStiffness : releaseStiffness * .9, state.targetPress ? activeDamping : releaseDamping, dt, 5);
    [state.rotationX, state.rotationXVelocity] = springScalar(state.rotationX, state.rotationXVelocity, state.targetRotationX, reducedMotion ? 90 : 44, 13, dt, 8);
    [state.rotationY, state.rotationYVelocity] = springScalar(state.rotationY, state.rotationYVelocity, state.targetRotationY, reducedMotion ? 90 : 44, 13, dt, 8);
    modelRoot.rotation.x = state.rotationX; modelRoot.rotation.y = state.rotationY;
    if (fruitCrown) {
      const crownOffset = state.material === 'fruit' ? deformationOffsetAt(new THREE.Vector3(0, 1, 0)) : new THREE.Vector3();
      if (state.material === 'fruit') deformationFields().forEach(field => crownOffset.addScaledVector(field.current, .34));
      crownOffset.multiplyScalar(.92);
      fruitCrown.position.lerp(crownOffset, clamp(dt * 14, 0, 1));
      fruitCrown.rotation.z += (clamp(-crownOffset.x * .18, -.12, .12) - fruitCrown.rotation.z) * Math.min(1, dt * 10);
      fruitCrown.rotation.x += (clamp(crownOffset.z * .14, -.1, .1) - fruitCrown.rotation.x) * Math.min(1, dt * 10);
    }
    if (state.material === 'jelly') jellyInclusions.forEach((inclusion, index) => {
      const phase = inclusion.userData.phase || index;
      const basePosition = inclusion.userData.basePosition;
      const localDirection = basePosition.clone().normalize();
      const inclusionOffset = deformationOffsetAt(localDirection).multiplyScalar(.58);
      deformationFields().forEach(field => inclusionOffset.addScaledVector(field.current, .14));
      const targetPosition = basePosition.clone().add(inclusionOffset);
      targetPosition.y += Math.sin(time * .0011 + phase) * .026;
      inclusion.position.lerp(targetPosition, clamp(dt * 8, 0, 1));
      inclusion.rotation.x += dt * (.18 + index * .015); inclusion.rotation.y += dt * (.24 + index * .02);
    });
    state.wobble *= reducedMotion ? .55 : .94 + bounce * .045;
    const wobble = reducedMotion ? 0 : Math.sin(time * (.006 + bounce * .006)) * state.wobble * (.028 + bounce * .085);
    const shellLocked = state.material === 'fruit' && !state.fruitShellCracked;
    const effectivePress = shellLocked ? 0 : state.press;
    const compression = 1 - effectivePress * (.12 + values()[0] * .12);
    modelRoot.scale.set((1 / Math.sqrt(compression)) * (1 + wobble * .35), compression * (1 - wobble), (1 / Math.sqrt(compression)) * (1 + wobble * .2));
    if (state.material === 'bubble') updateBubbleMeshes(dt); else deformSurface();
    updateParticles(dt); renderer.render(scene, camera);
    const hasDeformation = state.mode === 'grab' || state.mode === 'pinch' || state.currentPull.lengthSq() > .00001 || state.press > .001 || state.deformationPoints.some(field => field.current.lengthSq() > .00002 || field.target.lengthSq() > .00002);
    els.stage.classList.toggle('is-overlaying', hasDeformation);
    canvas.classList.toggle('is-overlaying', hasDeformation);
    canvas.dataset.rotationX = state.rotationX.toFixed(2); canvas.dataset.rotationY = state.rotationY.toFixed(2);
    canvas.dataset.pull = state.currentPull.length().toFixed(3); canvas.dataset.renderer = 'webgl-3d';
    canvas.dataset.interactionMode = state.mode || 'idle';
    canvas.dataset.scene = MATERIALS[state.material]?.scene || 'unknown';
    canvas.dataset.materialProfile = MATERIALS[state.material]?.soundProfile || 'unknown';
    canvas.dataset.deformationPoints = String(state.deformationPoints.length);
    canvas.dataset.deformationPointCap = String(MAX_DEFORMATION_POINTS);
    canvas.dataset.dualPoints = String(state.dualGrips.length);
    canvas.dataset.gestureCount = String(state.gestureCount);
    canvas.dataset.releaseCount = String(state.releaseCount);
    canvas.dataset.cancelCount = String(state.cancelCount);
    canvas.dataset.activeAudioOutputs = String(state.activeAudioOutputs);
    canvas.dataset.fruitShell = state.material === 'fruit' ? (state.fruitShellCracked ? 'cracked' : 'intact') : 'n/a';
    canvas.dataset.fruitShellHits = state.material === 'fruit' ? String(state.fruitShellHits) : '0';
    canvas.dataset.fruitShellChips = state.material === 'fruit' ? String(fruitShellChips.length) : '0';
    canvas.dataset.fruitShellChipCap = String(MAX_FRUIT_SHELL_CHIPS);
    canvas.dataset.fruitCrownY = fruitCrown ? fruitCrown.position.y.toFixed(3) : '0';
    canvas.dataset.jellyInclusions = state.material === 'jelly' ? String(jellyInclusions.length) : '0';
    canvas.dataset.jellyInclusionY = state.material === 'jelly' && jellyInclusions[0] ? jellyInclusions[0].position.y.toFixed(3) : '0';
    canvas.dataset.triangles = String(renderer.info.render.triangles); canvas.dataset.renderError = 'false'; state.renderErrorReported = false;
  } catch (error) {
    releaseActiveGesture();
    canvas.dataset.renderError = 'true';
    if (!state.renderErrorReported) { els.status.textContent = '三维渲染异常，已结束当前手势'; console.error('三维材质已自动复原', error); state.renderErrorReported = true; }
  }
}

els.sliders.forEach(slider => { updateSlider(slider); slider.addEventListener('input', () => updateSlider(slider)); });
els.reset.addEventListener('click', resetMaterial);
els.soundToggle.addEventListener('click', () => toggleSound()); els.soundTop.addEventListener('click', () => toggleSound());
els.rotateToggle.addEventListener('click', () => toggleRotation());
canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointermove', pointerMove);
canvas.addEventListener('pointerup', releasePointer); canvas.addEventListener('pointercancel', releasePointer);
window.addEventListener('pointerup', releasePointer); window.addEventListener('pointercancel', releasePointer);
['gesturestart', 'gesturechange', 'gestureend'].forEach(type => canvas.addEventListener(type, event => event.preventDefault(), { passive: false }));
canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); releaseActiveGesture(); els.status.textContent = '三维渲染暂时中断，正在恢复'; });
canvas.addEventListener('webglcontextrestored', () => { resize(); els.status.textContent = '三维渲染已恢复'; });
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('lostpointercapture', () => { if (state.mode && state.mode !== 'pinch') releaseActiveGesture(); });
canvas.addEventListener('keydown', keyboardPress); canvas.addEventListener('keyup', keyboardPress);
window.addEventListener('wheel', trackpadPinch, { passive: false, capture: true });
window.addEventListener('blur', releaseActiveGesture);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseActiveGesture(); });
window.addEventListener('resize', resize, { passive: true });

function registerWebMCP() {
  const context = document.modelContext; if (!context?.registerTool) return;
  const allowed = Object.keys(MATERIALS);
  Promise.resolve(context.registerTool({
    name: 'select_material', title: '选择三维捏捏材质', description: '切换当前三维材质。',
    inputSchema: { type: 'object', properties: { material: { type: 'string', enum: allowed } }, required: ['material'], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input) { if (!input || !allowed.includes(input.material)) throw new Error('不支持的材质'); setMaterial(input.material); return { material: input.material, renderer: 'webgl-3d' }; }
  })).catch(() => {});
  Promise.resolve(context.registerTool({
    name: 'configure_material', title: '调整三维材质参数', description: '调整柔软度、回弹和声音颗粒。',
    inputSchema: { type: 'object', properties: { softness: { type: 'number', minimum: 20, maximum: 100 }, bounce: { type: 'number', minimum: 20, maximum: 100 }, texture: { type: 'number', minimum: 10, maximum: 100 } }, additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input) {
      if (!input || typeof input !== 'object' || !Object.keys(input).length) throw new Error('请至少提供一个参数');
      for (const [keyName, value] of Object.entries(input)) {
        const control = document.getElementById(keyName); if (!control || typeof value !== 'number' || value < Number(control.min) || value > Number(control.max)) throw new Error(`参数 ${keyName} 无效`);
        control.value = value; updateSlider(control);
      }
      return { softness: Number(els.sliders[0].value), bounce: Number(els.sliders[1].value), texture: Number(els.sliders[2].value) };
    }
  })).catch(() => {});
  Promise.resolve(context.registerTool({
    name: 'reset_material', title: '复原三维材质', description: '清除形变、旋转和泡泡状态。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute() { resetMaterial(); return { material: state.material, reset: true, renderer: 'webgl-3d' }; }
  })).catch(() => {});
}

setMaterial('foam', false); resize(); registerWebMCP(); requestAnimationFrame(animate);
