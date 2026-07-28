import * as THREE from "three";
import { NOISE_GLSL } from "./noise.js";

const TEAL_MID = new THREE.Color("#1e4f52");
const TEAL_LIGHT = new THREE.Color("#5fa39c");
const TEAL_LINE = new THREE.Color("#7fbdb5");

function buildRibbonGeometry() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.5, -3.0, 0.35),
    new THREE.Vector3(0.65, -1.8, -0.45),
    new THREE.Vector3(-0.55, -0.6, 0.55),
    new THREE.Vector3(0.55, 0.6, -0.5),
    new THREE.Vector3(-0.6, 1.9, 0.45),
    new THREE.Vector3(0.5, 3.0, -0.35),
  ]);

  const geometry = new THREE.TubeGeometry(curve, 260, 0.58, 64, false);

  // Vertex-color gradient along the ribbon's length, oscillating between
  // the two teal accents with occasional near-white bands where specular
  // highlights will read as bright "destellos".
  const uv = geometry.attributes.uv;
  const colors = new Float32Array(uv.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const band = Math.sin(u * Math.PI * 5.0) * 0.5 + 0.5;
    tmp.copy(TEAL_MID).lerp(TEAL_LIGHT, u);
    tmp.lerp(TEAL_LINE, band * 0.35);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  return geometry;
}

function createMaterial() {
  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.34,
    metalness: 0.08,
    clearcoat: 0.65,
    clearcoatRoughness: 0.22,
    side: THREE.DoubleSide,
  });

  const shaderRef = { current: null };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uAmp = { value: 0.13 };
    shader.uniforms.uFreq = { value: 0.42 };

    shader.vertexShader = NOISE_GLSL + "\nvarying vec3 vHeroViewPos;\n" + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vec3 curlPos = position * uFreq + vec3(0.0, 0.0, uTime * 0.06);
      vec3 curl = curlNoise(curlPos, uTime * 0.12);
      transformed += curl * uAmp;
      transformed += normal * (snoise(position * uFreq * 1.6 + uTime * 0.08) * uAmp * 0.18);`
    );

    shader.vertexShader = shader.vertexShader.replace(
      "#include <project_vertex>",
      `#include <project_vertex>
      vHeroViewPos = -mvPosition.xyz;`
    );

    shader.fragmentShader =
      "varying vec3 vHeroViewPos;\n" + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      `#include <normal_fragment_begin>
      {
        vec3 fdx = dFdx(vHeroViewPos);
        vec3 fdy = dFdy(vHeroViewPos);
        vec3 flatNormal = normalize(cross(fdx, fdy));
        if (dot(normal, flatNormal) < 0.0) flatNormal = -flatNormal;
        normal = normalize(mix(normal, flatNormal, 0.22));
      }`
    );

    shaderRef.current = shader;
  };

  return { material, shaderRef };
}

export function initHeroScene({ canvas, container, reducedMotion, onReady }) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 7.6);

  scene.add(new THREE.HemisphereLight(0xdff2ef, 0x081f22, 0.55));

  const key = new THREE.DirectionalLight(0xf4f4f2, 2.4);
  key.position.set(3.2, 4, 5.2);
  scene.add(key);

  const fill = new THREE.PointLight(0x5fa39c, 1.6, 24);
  fill.position.set(-4, -1.5, 3);
  scene.add(fill);

  const rim = new THREE.PointLight(0x7fbdb5, 1.3, 24);
  rim.position.set(2, -3.5, -4);
  scene.add(rim);

  const geometry = buildRibbonGeometry();
  const { material, shaderRef } = createMaterial();
  const mesh = new THREE.Mesh(geometry, material);

  const group = new THREE.Group();
  group.add(mesh);
  group.rotation.set(THREE.MathUtils.degToRad(8), THREE.MathUtils.degToRad(18), THREE.MathUtils.degToRad(-10));
  group.scale.setScalar(1.3);
  group.position.set(0.9, 0, 0);
  scene.add(group);

  // Gentle mouse parallax tilt (~6deg range), damped so it never feels jittery.
  const maxTilt = THREE.MathUtils.degToRad(6);
  const pointer = { x: 0, y: 0 };
  const target = { x: 0, y: 0 };
  function onPointerMove(event) {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
  }
  if (!reducedMotion) {
    window.addEventListener("pointermove", onPointerMove, { passive: true });
  }

  const baseRotation = group.rotation.clone();
  const clock = new THREE.Clock();
  const frozenTime = clock.getElapsedTime();
  let frameId = null;
  let running = false;

  function resize() {
    const { clientWidth, clientHeight } = container;
    if (!clientWidth || !clientHeight) return;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
    // A resize always repaints, even when the animation loop is not
    // running (reduced-motion), so the frozen frame never goes stale.
    if (!running) renderFrame();
  }
  resize();

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  function renderFrame() {
    const elapsed = reducedMotion ? frozenTime : clock.getElapsedTime();
    if (shaderRef.current) {
      shaderRef.current.uniforms.uTime.value = elapsed;
    }

    if (!reducedMotion) {
      target.x += (pointer.x - target.x) * 0.04;
      target.y += (pointer.y - target.y) * 0.04;
      group.rotation.y = baseRotation.y + target.x * maxTilt;
      group.rotation.x = baseRotation.x - target.y * maxTilt * 0.7;
    }

    renderer.render(scene, camera);
  }

  function loop() {
    if (!running) return;
    renderFrame();
    frameId = requestAnimationFrame(loop);
  }

  function start() {
    if (running) return;
    running = true;
    frameId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (frameId) cancelAnimationFrame(frameId);
    frameId = null;
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stop();
    } else if (!reducedMotion) {
      start();
    }
  });

  // First frame always renders so the ribbon appears immediately,
  // then either loops forever or stays frozen for reduced-motion users.
  renderFrame();
  onReady?.();
  if (!reducedMotion) {
    start();
  }
}
