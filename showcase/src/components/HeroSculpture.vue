<!--
 * 用途：在首页铺满舞台的透明画布中展示银色结形雕塑，与前后两层姓名文字穿插遮挡。
 * 职责：创建程序化反射环境，按画面比例放置雕塑，叠加缓慢自转与指针俯仰，并根据滚动进度让相机穿过结心；管理可见性与 WebGL 资源。
 * 关键导出：HeroSculpture 默认组件；接收 progress（0–1 的首屏滚动进度），尺寸由父容器决定，无外部素材或事件。
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  TorusKnotGeometry,
  Vector3,
  WebGLRenderer,
  type WebGLRenderTarget,
} from "three";

const props = withDefaults(defineProps<{ progress?: number }>(), {
  progress: 0,
});
const container = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const isReady = ref(false);

let renderer: WebGLRenderer | undefined;
let scene: Scene | undefined;
let camera: PerspectiveCamera | undefined;
let sculpture: Group | undefined;
let geometry: TorusKnotGeometry | undefined;
let material: MeshPhysicalMaterial | undefined;
let environment: WebGLRenderTarget | undefined;
let resizeObserver: ResizeObserver | undefined;
let intersectionObserver: IntersectionObserver | undefined;
let motionPreference: MediaQueryList | undefined;
let frame = 0;
let lastFrameTime = 0;
let isVisible = true;
let hasSize = false;
let isDisposed = false;
let contextLost = false;
let currentX = 0;
let currentY = 0;
let targetX = 0;
let targetY = 0;
let spin = 0;
let baseDistance = 9.6;
const baseOffset = new Vector3();

const restingRotation = { x: 0.34, y: -0.3, z: -0.22 };
// 结的外径约 4.1 个单位；结心留有约 0.2 的空隙，相机沿 z 轴推进时恰好穿过。
const KNOT_SIZE = 4.1;
const FIELD_OF_VIEW = 33;
const FLY_END = -2.6;
const tanHalfFov = Math.tan(MathUtils.degToRad(FIELD_OF_VIEW / 2));

/** 平滑阶梯函数，把滚动进度映射为两端缓入缓出的权重。 */
function smoothstep(from: number, to: number, value: number) {
  const t = MathUtils.clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
}

/** 在内存中布置亮暗摄影棚反射面，生成金属所需的宽高光与深色轮廓。 */
function createEnvironment(activeRenderer: WebGLRenderer): WebGLRenderTarget {
  const studio = new Scene();
  const surfaces: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  const origin = new Vector3();
  studio.background = new Color(0.13, 0.15, 0.2);

  function addPanel(
    width: number,
    height: number,
    position: [number, number, number],
    color: Color,
  ) {
    const panel = new Mesh(
      new PlaneGeometry(width, height),
      new MeshBasicMaterial({ color, side: DoubleSide, toneMapped: false }),
    );
    panel.position.set(...position);
    panel.lookAt(origin);
    studio.add(panel);
    surfaces.push(panel);
  }

  addPanel(4.5, 9, [-5, 2, 3], new Color(5.8, 5.8, 5.8));
  addPanel(2.2, 8, [5, 1, 2], new Color(4.3, 4.5, 5.1));
  addPanel(8, 3, [0, 6, -1], new Color(4.8, 4.8, 4.8));
  addPanel(7, 5, [0, 2, -6], new Color(0.42, 0.5, 0.8));
  addPanel(10, 10, [0, -5, 0], new Color(0.04, 0.05, 0.09));
  addPanel(3, 8, [-4, -1, -3], new Color(0.015, 0.02, 0.035));

  const generator = new PMREMGenerator(activeRenderer);

  // 反射纹理生成后即可释放摄影棚与生成器，保留最终渲染目标直到组件销毁。
  try {
    return generator.fromScene(studio, 0.04, 0.1, 30);
  } finally {
    surfaces.forEach((surface) => {
      surface.geometry.dispose();
      surface.material.dispose();
    });
    studio.clear();
    generator.dispose();
  }
}

/**
 * 按父容器尺寸调整画布，并按比例确定雕塑占比和位置：
 * 横屏让结占画面高度约 74%、偏右放置，与整行姓名交叠；竖屏按宽度缩放并上移，与姓名下缘交叠，给底部介绍留出空间。
 */
function resize() {
  if (!container.value || !renderer || !camera || isDisposed) return;

  const { width, height } = container.value.getBoundingClientRect();
  hasSize = width > 0 && height > 0;
  if (!hasSize) {
    stopFrame();
    return;
  }

  // 画布铺满首屏，像素比上限低于局部画布，避免物理材质在高分屏上过度占用 GPU。
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  if (camera.aspect >= 1) {
    const visibleHeight = KNOT_SIZE / 0.74;
    baseDistance = visibleHeight / 2 / tanHalfFov;
    baseOffset.set(visibleHeight * camera.aspect * 0.11, -visibleHeight * 0.02, 0);
  } else {
    const visibleHeight = KNOT_SIZE / 0.8 / camera.aspect;
    baseDistance = visibleHeight / 2 / tanHalfFov;
    baseOffset.set(0, visibleHeight * 0.08, 0);
  }
  camera.updateProjectionMatrix();
  requestFrame();
}

/** 只在可见时绘制；允许动态时保持缓慢自转，减少动态偏好下静止后停止循环。 */
function requestFrame() {
  if (
    frame ||
    isDisposed ||
    contextLost ||
    !renderer ||
    !hasSize ||
    !isVisible ||
    document.hidden
  )
    return;

  frame = requestAnimationFrame(render);
}

function stopFrame() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  lastFrameTime = 0;
}

/**
 * 使用与帧率无关的阻尼；滚动进度分两段生效：
 * 0–0.45 雕塑回到画面中心、结心正对相机，0.3–0.85 相机沿 z 轴加速穿过结心并越过雕塑。
 * 减少动态偏好下保持固定姿态，只在尺寸或进度变化时重绘。
 */
function render(time: number) {
  frame = 0;
  if (!renderer || !scene || !camera || !sculpture || isDisposed || contextLost)
    return;

  const elapsed = lastFrameTime
    ? Math.min((time - lastFrameTime) / 1000, 0.05)
    : 1 / 60;
  const damping = 1 - Math.exp(-8 * elapsed);
  lastFrameTime = time;
  const reduced = motionPreference?.matches ?? false;

  if (reduced) {
    currentX = 0;
    currentY = 0;
  } else {
    currentX += (targetX - currentX) * damping;
    currentY += (targetY - currentY) * damping;
    spin += elapsed * 0.16;
  }

  const progress = MathUtils.clamp(props.progress, 0, 1);
  const settle = smoothstep(0, 0.45, progress);
  const fly = Math.pow(smoothstep(0.3, 0.85, progress), 1.6);
  sculpture.position.copy(baseOffset).multiplyScalar(1 - settle);
  sculpture.rotation.set(
    MathUtils.lerp(restingRotation.x + currentX + Math.sin(spin * 0.7) * 0.05, 0, settle),
    MathUtils.lerp(restingRotation.y + currentY, 0, settle),
    restingRotation.z + spin + progress * Math.PI * 0.9,
  );
  camera.position.z = MathUtils.lerp(baseDistance, FLY_END, fly);
  renderer.render(scene, camera);
  isReady.value = true;

  if (!reduced) {
    requestFrame();
  } else {
    lastFrameTime = 0;
  }
}

/**
 * 指针仅影响很小的俯仰角；画布位于姓名与介绍文字下层，因此在窗口上监听并按画布范围换算。
 * 指针离开画布范围时回到静止姿态；触屏滚动与减少动态设置不参与此交互。
 */
function onPointerMove(event: PointerEvent) {
  if (
    !container.value ||
    !isVisible ||
    event.pointerType === "touch" ||
    motionPreference?.matches
  )
    return;
  const bounds = container.value.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  if (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  ) {
    resetPointer();
    return;
  }
  targetX = ((event.clientY - bounds.top) / bounds.height - 0.5) * 0.28;
  targetY = ((event.clientX - bounds.left) / bounds.width - 0.5) * 0.42;
  requestFrame();
}

function resetPointer() {
  targetX = 0;
  targetY = 0;
  requestFrame();
}

function onVisibilityChange() {
  if (document.hidden) stopFrame();
  else requestFrame();
}

function onMotionPreferenceChange() {
  resetPointer();
  requestFrame();
}

/** 显卡上下文丢失时使用静态替代图，恢复后由 Three.js 重建资源并重新绘制。 */
function onContextLost(event: Event) {
  event.preventDefault();
  contextLost = true;
  isReady.value = false;
  stopFrame();
}

function onContextRestored() {
  contextLost = false;
  if (!renderer || !scene || isDisposed) return;
  try {
    // 渲染目标没有可重新上传的图片源，上下文恢复后必须重新生成反射纹理。
    environment?.dispose();
    environment = createEnvironment(renderer);
    scene.environment = environment.texture;
    resize();
  } catch {
    detachObserversAndEvents();
    disposeGraphics();
    isReady.value = false;
  }
}

/** 初始化中途失败与正常卸载都执行同一套清理，避免残留观察器和事件监听器。 */
function detachObserversAndEvents() {
  resizeObserver?.disconnect();
  intersectionObserver?.disconnect();
  window.removeEventListener("pointermove", onPointerMove);
  document.documentElement.removeEventListener("pointerleave", resetPointer);
  canvas.value?.removeEventListener("webglcontextlost", onContextLost);
  canvas.value?.removeEventListener("webglcontextrestored", onContextRestored);
  motionPreference?.removeEventListener("change", onMotionPreferenceChange);
  document.removeEventListener("visibilitychange", onVisibilityChange);
}

/** 统一释放成功初始化及中途失败的资源，允许无 WebGL 环境直接显示替代图。 */
function disposeGraphics() {
  stopFrame();
  if (scene) {
    scene.environment = null;
    scene.clear();
  }
  geometry?.dispose();
  material?.dispose();
  environment?.dispose();
  renderer?.dispose();
  renderer?.forceContextLoss();
  geometry = undefined;
  material = undefined;
  environment = undefined;
  renderer = undefined;
  sculpture = undefined;
  scene = undefined;
  camera = undefined;
}

onMounted(() => {
  if (!canvas.value || !container.value) return;
  motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

  try {
    renderer = new WebGLRenderer({
      canvas: canvas.value,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    scene = new Scene();
    camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, 0.05, 40);
    camera.position.set(0, 0, baseDistance);

    environment = createEnvironment(renderer);
    scene.environment = environment.texture;
    geometry = new TorusKnotGeometry(1.12, 0.34, 240, 40, 2, 3);
    material = new MeshPhysicalMaterial({
      color: "#d8dce5",
      metalness: 1,
      roughness: 0.17,
      clearcoat: 0.45,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.18,
    });

    sculpture = new Group();
    sculpture.add(new Mesh(geometry, material));
    scene.add(sculpture);

    const keyLight = new DirectionalLight("#ffffff", 2.4);
    keyLight.position.set(4, 5, 6);
    const rimLight = new DirectionalLight("#91a7ff", 1.2);
    rimLight.position.set(-4, -1, 3);
    scene.add(keyLight, rimLight);

    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container.value);
    intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry?.isIntersecting ?? false;
        if (isVisible) requestFrame();
        else stopFrame();
      },
      { threshold: 0 },
    );
    intersectionObserver.observe(container.value);

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", resetPointer);
    canvas.value.addEventListener("webglcontextlost", onContextLost);
    canvas.value.addEventListener("webglcontextrestored", onContextRestored);
    motionPreference.addEventListener("change", onMotionPreferenceChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    resize();
  } catch {
    detachObserversAndEvents();
    disposeGraphics();
    isReady.value = false;
  }
});

// 滚动进度只在渲染循环停止（减少动态或首次绘制前）时需要主动唤醒绘制。
watch(
  () => props.progress,
  () => requestFrame(),
);

onBeforeUnmount(() => {
  isDisposed = true;
  detachObserversAndEvents();
  disposeGraphics();
});
</script>

<template>
  <div ref="container" class="hero-sculpture" aria-hidden="true">
    <div v-if="!isReady" class="hero-sculpture__fallback">
      <span class="hero-sculpture__ring hero-sculpture__ring--first" />
      <span class="hero-sculpture__ring hero-sculpture__ring--second" />
      <span class="hero-sculpture__ring hero-sculpture__ring--third" />
    </div>
    <canvas
      ref="canvas"
      class="hero-sculpture__canvas"
      :class="{ 'is-ready': isReady }"
    />
  </div>
</template>

<style scoped>
.hero-sculpture {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  isolation: isolate;
}

.hero-sculpture__canvas {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity 400ms ease;
}

.hero-sculpture__canvas.is-ready {
  opacity: 1;
}

/* 替代图与三维雕塑落在同一位置：横屏偏右、竖屏居中略高。 */
.hero-sculpture__fallback {
  position: absolute;
  left: 61%;
  top: 48%;
  width: min(74vh, 46vw);
  aspect-ratio: 1;
  translate: -50% -50%;
  perspective: 650px;
  rotate: -20deg;
  pointer-events: none;
}

@media (max-aspect-ratio: 1/1) {
  .hero-sculpture__fallback {
    left: 50%;
    top: 47%;
    width: 80vw;
  }
}

/* 用银色环形叠层维持无 WebGL 时的空间感，避免影响页面内容与布局。 */
.hero-sculpture__ring {
  position: absolute;
  inset: 12% 5%;
  border: clamp(18px, 4vw, 48px) solid #d1d5df;
  border-radius: 50%;
  background: transparent;
  box-shadow:
    inset 8px 5px 9px rgb(255 255 255 / 90%),
    inset -10px -7px 12px rgb(26 32 54 / 80%),
    8px 8px 10px rgb(12 28 96 / 30%);
}

.hero-sculpture__ring--first {
  transform: rotateY(53deg) rotateX(20deg);
}

.hero-sculpture__ring--second {
  transform: rotateY(-53deg) rotateX(-20deg);
}

.hero-sculpture__ring--third {
  transform: rotateX(65deg) rotateZ(18deg);
}

@media (prefers-reduced-motion: reduce) {
  .hero-sculpture__canvas {
    transition: none;
  }
}
</style>
