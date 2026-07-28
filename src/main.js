const nav = document.getElementById("site-nav");

function onScroll() {
  nav.classList.toggle("is-scrolled", window.scrollY > 8);
}
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

/* -----------------------------------------------------------------
   Hero 3D stage — orchestration only.
   The heavy Three.js scene lives in ./hero/scene.js and is loaded
   lazily so it never competes with the hero text for the LCP.
------------------------------------------------------------------ */
const stage = document.getElementById("hero-stage");
const fallback = document.getElementById("hero-fallback");
const canvas = document.getElementById("hero-canvas");

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isSmallViewport = window.matchMedia("(max-width: 800px)").matches;
const cores = navigator.hardwareConcurrency || 4;
const isLikelyLowEnd = cores <= 2;

function supportsWebGL2() {
  try {
    const testCanvas = document.createElement("canvas");
    return !!testCanvas.getContext("webgl2");
  } catch {
    return false;
  }
}

// Mobile and low-power devices skip WebGL entirely and keep the
// lightweight CSS gradient fallback that is already painted.
const shouldUseWebGL = !isSmallViewport && !isLikelyLowEnd && supportsWebGL2();

function idle(callback) {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(callback, { timeout: 2000 });
  } else {
    window.setTimeout(callback, 200);
  }
}

if (shouldUseWebGL) {
  window.addEventListener(
    "load",
    () => {
      idle(async () => {
        try {
          const { initHeroScene } = await import("./hero/scene.js");
          initHeroScene({
            canvas,
            container: stage,
            reducedMotion: prefersReducedMotion,
            onReady() {
              canvas.classList.add("is-ready");
              fallback.classList.add("is-hidden");
            },
          });
        } catch (err) {
          console.warn("Continental Media hero: WebGL scene failed, keeping CSS fallback.", err);
        }
      });
    },
    { once: true }
  );
}
