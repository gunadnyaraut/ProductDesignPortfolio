/* ============================================
   Background - ambient stars + a light cursor
   parallax on the glow/star layers for a touch
   of cinematic depth. Independent of the arc
   and unicorn.
============================================ */

export function initBackground({ stage, starsEl, glowEl }) {
  if (!starsEl) return;

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var isFinePointer = window.matchMedia("(pointer: fine)").matches;

  var glitterVariants = ["cs-star--a", "cs-star--b", "cs-star--c"];
  var pointVariants = ["cs-star--pt4", "cs-star--pt6", "cs-star--pt8"];

  function buildStars() {
    var n = window.innerWidth < 700 ? 16 : 32;
    starsEl.innerHTML = "";
    var frag = document.createDocumentFragment();
    for (var i = 0; i < n; i++) {
      var s = document.createElement("span");
      var glitter = glitterVariants[(Math.random() * glitterVariants.length) | 0];
      var points = pointVariants[(Math.random() * pointVariants.length) | 0];
      s.className = "cs-star " + glitter + " " + points;
      s.style.left = (Math.random() * 100).toFixed(2) + "%";
      s.style.top = (Math.random() * 62).toFixed(2) + "%";
      // Natural variation: size, brightness and a fixed random rotation
      // per star, independent of each other.
      var size = (2 + Math.random() * 5).toFixed(1) + "px";
      s.style.width = size;
      s.style.height = size;
      s.style.setProperty("--star-o", (0.25 + Math.random() * 0.55).toFixed(2));
      s.style.setProperty("--star-rot", (Math.random() * 360).toFixed(1) + "deg");
      // Random delay/duration on top of the already-irregular keyframe
      // shape, so no two stars glitter in sync.
      s.style.animationDelay = "-" + (Math.random() * 6).toFixed(2) + "s";
      s.style.animationDuration = (2.2 + Math.random() * 3.6).toFixed(2) + "s";
      frag.appendChild(s);
    }
    starsEl.appendChild(frag);
  }

  buildStars();

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(buildStars, 150);
  });

  // Subtle parallax: glow/stars drift a few px opposite the cursor,
  // desktop-only, skipped entirely under reduced motion.
  if (isFinePointer && !reducedMotion && stage) {
    var px = 0, py = 0, tx = 0, ty = 0;
    var raf = null;

    stage.addEventListener("pointermove", function (e) {
      var rect = stage.getBoundingClientRect();
      var nx = (e.clientX - rect.left) / rect.width - 0.5; // -0.5..0.5
      var ny = (e.clientY - rect.top) / rect.height - 0.5;
      tx = nx * -10;
      ty = ny * -8;
    });
    stage.addEventListener("pointerleave", function () {
      tx = 0;
      ty = 0;
    });

    (function tick() {
      px += (tx - px) * 0.06;
      py += (ty - py) * 0.06;
      var t = "translate(" + px.toFixed(2) + "px, " + py.toFixed(2) + "px)";
      if (glowEl) glowEl.style.transform = t;
      starsEl.style.transform = t;
      raf = requestAnimationFrame(tick);
    })();
  }
}
