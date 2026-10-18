import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { finishIntro } from "../../lib/intro.js";

// First visit: the Earth at night (NASA Black Marble 2016) spins down while the camera closes in on the
// United States, fades to black, and the black lifts off the map page.
// Timeline, in seconds after the texture is on the GPU:
const IN = 0.9;          // up from black
const SPIN = 6.6;        // spin slows to a stop as the camera arrives over the US
const FADE = 0.8;        // to black, still pushing in (starts a little before SPIN ends)
const HOLD = 0.35;       // a beat of pure black
const REVEAL = 0.9;      // the black lifts off the page
const T_FADE = SPIN - 0.35;
const T_BLACK = T_FADE + FADE;
const T_REVEAL = T_BLACK + HOLD;
const T_END = T_REVEAL + REVEAL;

const US = { lat: 38.5, lon: -97.5 };
const TURNS = 0.9;       // how far it still has to spin when the camera starts in
const LOAD_LIMIT = 9000; // ms; a slow connection gets the page instead of a long black screen

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const outCubic = (x) => 1 - (1 - x) ** 3;
const inOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const inOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;
const lerp = (a, b, t) => a + (b - a) * t;
const RAD = Math.PI / 180;
// three's sphere puts longitude -90 facing +z; this turns any longitude to face the camera
const faceLon = (lon) => -(lon * RAD + Math.PI / 2);

const EARTH_V = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;
const EARTH_F = /* glsl */ `
  uniform sampler2D map;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec3 c = texture2D(map, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    // city light: warmer and a little hotter, so it reads as sodium-yellow and feeds the bloom
    float city = smoothstep(0.015, 0.45, l);
    vec3 col = c + vec3(1.0, 0.68, 0.26) * city * l * 0.9;
    // moonlit land and sea stay faint; the disc darkens toward its edge
    float ndv = clamp(dot(vN, vV), 0.0, 1.0);
    col *= mix(0.45, 1.0, pow(ndv, 0.6));
    // thin blue airglow where the atmosphere is seen edge-on
    col += vec3(0.03, 0.08, 0.22) * pow(1.0 - ndv, 4.0);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const AIR_F = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  uniform float uK;
  void main() {
    // back faces of a slightly larger shell: brightest just off the limb, gone at the shell's own edge
    float t = clamp(-dot(vN, vV) / uK, 0.0, 1.0);
    float a = pow(t, 5.0);
    gl_FragColor = vec4(vec3(0.2, 0.42, 1.0) * a * 0.32, 1.0);
    #include <colorspace_fragment>
  }
`;
const STAR_V = /* glsl */ `
  attribute float aSize;
  attribute float aSeed;
  uniform float uTime;
  uniform float uPx;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vA = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed * 1.7) + aSeed * 40.0);
    gl_PointSize = aSize * uPx;
    gl_Position = projectionMatrix * mv;
  }
`;
const STAR_F = /* glsl */ `
  varying float vA;
  uniform float uFade;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    float a = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * a * vA * uFade, 1.0);
  }
`;

function makeStars(n) {
  const pos = new Float32Array(n * 3), size = new Float32Array(n), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 60 + Math.random() * 30;
    const s = Math.sqrt(1 - u * u);
    pos.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th)], i * 3);
    const b = Math.random();
    size[i] = b > 0.985 ? 3.2 : b > 0.9 ? 2.1 : 1.1 + Math.random() * 0.6;
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  return g;
}

export default function EarthIntro({ onGone }) {
  const rootRef = useRef(null);
  const canvasRef = useRef(null);
  const blackRef = useRef(null);
  const skipRef = useRef(() => {});

  useEffect(() => {
    const root = rootRef.current, canvas = canvasRef.current, black = blackRef.current;
    const html = document.documentElement;
    const prevOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    window.scrollTo(0, 0);

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    } catch {
      renderer = null;
    }
    let alive = true, raf = 0, released = false;
    const release = () => {               // the page underneath takes over: unlock scroll, start the hero
      if (released) return;
      released = true;
      html.style.overflow = prevOverflow;
      finishIntro();
    };
    if (!renderer) {
      release();
      onGone();
      return () => {};
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(dpr);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setClearColor(0x000000, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 200);
    const tilt = new THREE.Group();            // latitude: tips the US toward the camera
    const spin = new THREE.Group();            // longitude: the Earth turning on its axis
    tilt.add(spin);
    scene.add(tilt);

    const earthMat = new THREE.ShaderMaterial({ uniforms: { map: { value: null } }, vertexShader: EARTH_V, fragmentShader: EARTH_F });
    const earthGeo = new THREE.SphereGeometry(1, 192, 128);
    spin.add(new THREE.Mesh(earthGeo, earthMat));

    const AIR_R = 1.018;
    const airMat = new THREE.ShaderMaterial({
      uniforms: { uK: { value: Math.sqrt(1 - 1 / (AIR_R * AIR_R)) } },
      vertexShader: EARTH_V,
      fragmentShader: AIR_F,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const airGeo = new THREE.SphereGeometry(AIR_R, 128, 96);
    tilt.add(new THREE.Mesh(airGeo, airMat));

    const starGeo = makeStars(5200);
    const starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPx: { value: dpr }, uFade: { value: 1 } },
      vertexShader: STAR_V,
      fragmentShader: STAR_F,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    scene.add(new THREE.Points(starGeo, starMat));

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.32, 0.22);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const resize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    // big screens get the 8k map (the US is ~1300 px wide in it); phones and older GPUs the 4k one
    const big = renderer.capabilities.maxTextureSize >= 8192 && Math.max(window.innerWidth, window.innerHeight) > 900;
    let tex = null, t0 = null, skipAt = null;

    const frame = (now) => {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      if (t0 == null) return;
      let t = (now - t0) / 1000;
      if (skipAt != null) t = Math.max(t, T_BLACK);

      const p = clamp01(t / SPIN);
      spin.rotation.y = faceLon(US.lon) - TURNS * Math.PI * 2 * (1 - outCubic(p));
      tilt.rotation.x = lerp(14, US.lat, inOutSine(p)) * RAD;
      // whole Earth to the US filling the view, then on into it while the screen goes dark
      const push = clamp01((t - T_FADE) / FADE);
      camera.position.set(0, 0, lerp(8.4, 1.92, inOutCubic(p)) - 0.42 * push * push);
      camera.lookAt(0, 0, 0);
      starMat.uniforms.uTime.value = t;
      starMat.uniforms.uFade.value = 1 - clamp01((p - 0.55) / 0.45) * 0.6;

      if (t < T_BLACK) composer.render();
      else if (!root.classList.contains("is-clearing")) {
        // fully black: drop the globe, and let the page show through as the black lifts
        canvas.style.visibility = "hidden";
        root.classList.add("is-clearing");
      }
      black.style.opacity = t < IN ? String(1 - outCubic(t / IN)) : t < T_FADE ? "0" : t < T_REVEAL ? String(clamp01((t - T_FADE) / FADE)) : String(1 - inOutCubic(clamp01((t - T_REVEAL) / REVEAL)));

      if (t >= T_END) {
        // the Earth is over and the overlay is gone: only now does the page (the laser, the wordmark) start
        alive = false;
        release();
        onGone();
      }
    };
    raf = requestAnimationFrame(frame);

    const start = () => {
      if (!alive || t0 != null) return;
      t0 = performance.now();
    };
    const limit = setTimeout(() => { if (t0 == null) { t0 = performance.now(); skipAt = 0; } }, LOAD_LIMIT);
    new THREE.TextureLoader().load(
      big ? "/earth/night-8k.jpg" : "/earth/night-4k.jpg",
      (tx) => {
        if (!alive) { tx.dispose(); return; }
        tx.colorSpace = THREE.SRGBColorSpace;
        tx.anisotropy = renderer.capabilities.getMaxAnisotropy();
        earthMat.uniforms.map.value = tx;
        tex = tx;
        renderer.initTexture(tx);            // upload now so the first frames don't stall
        clearTimeout(limit);
        requestAnimationFrame(start);
      },
      undefined,
      () => { clearTimeout(limit); t0 = performance.now(); skipAt = 0; }
    );

    // skip ends the intro at once: no spin, no black, no lift; the page is there immediately
    skipRef.current = () => {
      if (!alive) return;
      alive = false;
      cancelAnimationFrame(raf);
      release();
      onGone();
    };
    const onKey = (e) => { if (e.key === "Escape") skipRef.current(); };
    window.addEventListener("keydown", onKey);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(limit);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      release();
      tex?.dispose();
      [earthGeo, airGeo, starGeo].forEach((g) => g.dispose());
      [earthMat, airMat, starMat].forEach((m) => m.dispose());
      composer.dispose();
      renderer.dispose();
    };
  }, [onGone]);

  return (
    <div className="intro" ref={rootRef}>
      <canvas className="intro-gl" ref={canvasRef} aria-hidden="true" />
      <div className="intro-black" ref={blackRef} aria-hidden="true" />
      <button type="button" className="intro-skip" onClick={() => skipRef.current()}>Skip intro</button>
    </div>
  );
}
