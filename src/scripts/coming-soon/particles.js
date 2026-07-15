/* ============================================
   Particles - magical trail + burst emitter.
   Viewport-fixed dots (stars/sparkles/soft dots)
   spawned at page-coordinate x/y. Self-cleans via
   animationend; capped so a fast drag can't flood
   the DOM.
============================================ */

var MAX_ACTIVE = 140;
var active = 0;
var colors = ["#FF3D00", "#FF7A5C", "#FFD166", "#8AF3C3", "#8EC5FF", "#D8A7FF"];
var variants = ["cs-particle--sparkle", "cs-particle--star", "cs-particle--dot"];

function pick(arr) {
  return arr[(Math.random() * arr.length) | 0];
}

function attach(el) {
  active++;
  document.body.appendChild(el);
  el.addEventListener("animationend", function () {
    active--;
    el.remove();
  });
}

/** A single trail particle at viewport coords (x, y). */
export function spawnTrailParticle(x, y) {
  if (active >= MAX_ACTIVE) return;
  var el = document.createElement("span");
  var size = 4 + Math.random() * 6;
  var dur = (1 + Math.random()).toFixed(2); // 1s - 2s fade
  el.className = "cs-particle cs-particle-trail " + pick(variants);
  el.style.width = el.style.height = size + "px";
  el.style.left = x + (Math.random() * 26 - 13) + "px";
  el.style.top = y + (Math.random() * 26 - 13) + "px";
  el.style.color = pick(colors);
  el.style.background = el.classList.contains("cs-particle--dot")
    ? pick(colors)
    : el.style.color;
  el.style.setProperty("--px", (Math.random() * 34 - 17).toFixed(1) + "px");
  el.style.setProperty("--py", (Math.random() * 14).toFixed(1) + "px");
  el.style.setProperty("--p-o", (0.65 + Math.random() * 0.35).toFixed(2));
  el.style.setProperty("--pdur", dur + "s");
  attach(el);
}

/** A radiating burst of particles at viewport coords (x, y). */
export function spawnBurst(x, y, count) {
  count = count || 26;
  for (var i = 0; i < count; i++) {
    if (active >= MAX_ACTIVE) break;
    var angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    var dist = 50 + Math.random() * 90;
    var el = document.createElement("span");
    var size = 5 + Math.random() * 6;
    el.className = "cs-particle cs-particle-burst " + pick(variants);
    el.style.width = el.style.height = size + "px";
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.color = pick(colors);
    el.style.background = el.classList.contains("cs-particle--dot")
      ? pick(colors)
      : el.style.color;
    el.style.setProperty("--px", (Math.cos(angle) * dist).toFixed(1) + "px");
    el.style.setProperty("--py", (Math.sin(angle) * dist).toFixed(1) + "px");
    attach(el);
  }
}
