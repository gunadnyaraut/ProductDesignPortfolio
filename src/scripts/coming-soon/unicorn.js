/* ============================================
   Unicorn - free-floating viewport companion.

   Drag physics, deliberately not a 1:1 pointer
   mapping:
     - non-linear resistance: stiffness ramps in
       with a smoothstep curve as lag builds, so
       small nudges feel soft/elastic and fast
       flicks still catch up
     - momentum: release velocity carries into a
       friction-based coast, clamped so flicks
       don't fling unrealistically far
     - a lightly underdamped "settle" spring gives
       a soft one-time bounce when it comes to rest
     - velocity-driven tilt/squash on the sprite for
       a sense of weight while it's in motion

   Free to roam the full viewport - not tied to any
   path or fixed decorative element.
============================================ */

import { Spring2D, clamp, lerp } from "./spring.js";
import { spawnTrailParticle, spawnBurst } from "./particles.js";

var DRAG_NEAR = { stiffness: 95, damping: 17 }; // gentle resistance, barely lagging
var DRAG_FAR = { stiffness: 300, damping: 28 }; // firmer catch-up once lag builds
var DRAG_LAG_RANGE = 170; // px of lag over which resistance ramps

var SETTLE_SPRING = { stiffness: 150, damping: 13 }; // slight underdamped bounce on landing
var WANDER_SPRING = { stiffness: 18, damping: 9 };

var FRICTION = 2.5; // inertia decay rate (per second, exponential)
var MAX_RELEASE_SPEED = 1600; // px/s - caps unrealistic flicks
var SETTLE_SPEED = 12; // px/s below which inertia hands off to the settle spring
var SETTLE_HANDOFF_SPEED = 4; // px/s below which settle hands off to idle wander

var TILT_MAX = 14; // degrees
var TILT_FACTOR = 0.026; // degrees per px/s of horizontal velocity
var SCALE_MAX_BOOST = 0.15; // extra scale at high speed
var SCALE_SPEED_RANGE = 900; // px/s for the full scale boost
var FEEDBACK_SMOOTH = 0.22; // per-frame-at-60fps smoothing for tilt/scale

export function initUnicorn({ button, img, hero }) {
  if (!button) return;

  var isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;

  var half = button.offsetWidth / 2 || 32;
  var spring = null;
  var mode = "idle"; // idle | dragging | inertia | settling
  var lastTime = 0;
  var nextWanderAt = 0;
  var nextHopAt = 0;
  var lastTrailAt = 0;
  var dragOffset = { x: 0, y: 0 };
  var tilt = 0;
  var scale = 1;

  function bounds() {
    var pad = half + 8;
    return {
      minX: pad,
      maxX: window.innerWidth - pad,
      minY: pad,
      maxY: window.innerHeight - pad,
    };
  }

  function clampToViewport(x, y) {
    var b = bounds();
    return { x: clamp(x, b.minX, b.maxX), y: clamp(y, b.minY, b.maxY) };
  }

  function paint() {
    // transform-only update - compositor-driven, no layout thrash at 60fps
    button.style.transform =
      "translate(" + spring.x + "px, " + spring.y + "px) translate(-50%, -50%)";
  }

  // Velocity-driven tilt + squash/stretch, smoothed frame-to-frame so it
  // reads as weight and lag rather than a value glued to the pointer.
  function updateFeedback(dt) {
    if (!img) return;
    var frameFactor = Math.min(1, FEEDBACK_SMOOTH * (dt * 60));
    var speed = Math.hypot(spring.vx, spring.vy);
    var targetTilt = clamp(spring.vx * TILT_FACTOR, -TILT_MAX, TILT_MAX);
    var targetScale = 1 + Math.min(1, speed / SCALE_SPEED_RANGE) * SCALE_MAX_BOOST;
    tilt += (targetTilt - tilt) * frameFactor;
    scale += (targetScale - scale) * frameFactor;
    img.style.transform = "scale(" + scale.toFixed(3) + ") rotate(" + tilt.toFixed(2) + "deg)";
  }

  function clearFeedback() {
    tilt = 0;
    scale = 1;
    if (img) img.style.transform = "";
  }

  function initialPosition() {
    var vw = window.innerWidth,
      vh = window.innerHeight;
    if (hero) {
      var r = hero.getBoundingClientRect();
      return clampToViewport(r.left + r.width * 0.22, r.top + r.height * 0.3);
    }
    return clampToViewport(vw * 0.22, vh * 0.32);
  }

  function scheduleWander(now) {
    nextWanderAt = now + 2600 + Math.random() * 2600;
  }
  function scheduleHop(now) {
    nextHopAt = now + 6000 + Math.random() * 6000;
  }

  function wander(now) {
    var radius = 46 + Math.random() * 30;
    var angle = Math.random() * Math.PI * 2;
    var target = clampToViewport(
      spring.x + Math.cos(angle) * radius,
      spring.y + Math.sin(angle) * radius,
    );
    spring.setStiffness(WANDER_SPRING.stiffness, WANDER_SPRING.damping);
    spring.setTarget(target.x, target.y);
    scheduleWander(now);
  }

  function hop() {
    if (mode !== "idle") return;
    button.classList.add("is-hopping");
    setTimeout(function () {
      button.classList.remove("is-hopping");
    }, 500);
  }

  function settleIntoIdle(now) {
    mode = "idle";
    button.classList.remove("is-moving");
    spring.setStiffness(WANDER_SPRING.stiffness, WANDER_SPRING.damping);
    spring.vx = spring.vy = 0;
    clearFeedback();
    scheduleWander(now);
    scheduleHop(now);
  }

  function tick(now) {
    var dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
    lastTime = now;

    if (mode === "idle") {
      if (now > nextWanderAt) wander(now);
      if (now > nextHopAt) {
        hop();
        scheduleHop(now);
      }
      spring.step(dt);
      var c = clampToViewport(spring.x, spring.y);
      spring.x = c.x;
      spring.y = c.y;
    } else if (mode === "dragging") {
      // Non-linear resistance: stiffness ramps in with a smoothstep curve
      // as the lag between pointer target and visual position grows, so
      // small nudges feel gently elastic while fast flicks still catch up.
      var dx = spring.tx - spring.x;
      var dy = spring.ty - spring.y;
      var dist = Math.hypot(dx, dy);
      var t = Math.min(1, dist / DRAG_LAG_RANGE);
      var eased = t * t * (3 - 2 * t); // smoothstep
      spring.setStiffness(
        lerp(DRAG_NEAR.stiffness, DRAG_FAR.stiffness, eased),
        lerp(DRAG_NEAR.damping, DRAG_FAR.damping, eased),
      );
      spring.step(dt);
      updateFeedback(dt);

      if (now - lastTrailAt > 12) {
        spawnTrailParticle(spring.x, spring.y);
        spawnTrailParticle(spring.x, spring.y);
        lastTrailAt = now;
      }
    } else if (mode === "inertia") {
      var decay = Math.exp(-FRICTION * dt);
      spring.vx *= decay;
      spring.vy *= decay;
      spring.x += spring.vx * dt;
      spring.y += spring.vy * dt;
      updateFeedback(dt);

      var b = bounds();
      if (spring.x < b.minX) {
        spring.x = b.minX;
        spring.vx = 0;
      } else if (spring.x > b.maxX) {
        spring.x = b.maxX;
        spring.vx = 0;
      }
      if (spring.y < b.minY) {
        spring.y = b.minY;
        spring.vy = 0;
      } else if (spring.y > b.maxY) {
        spring.y = b.maxY;
        spring.vy = 0;
      }

      if (Math.hypot(spring.vx, spring.vy) < SETTLE_SPEED) {
        mode = "settling";
        spring.setStiffness(SETTLE_SPRING.stiffness, SETTLE_SPRING.damping);
        spring.setTarget(spring.x, spring.y);
      }
    } else if (mode === "settling") {
      // Slightly underdamped - the resting point gets a small, natural
      // overshoot/wobble instead of stopping dead.
      spring.step(dt);
      updateFeedback(dt);
      var cs = clampToViewport(spring.x, spring.y);
      spring.x = cs.x;
      spring.y = cs.y;

      var speed = Math.hypot(spring.vx, spring.vy);
      var distToTarget = Math.hypot(spring.tx - spring.x, spring.ty - spring.y);
      if (speed < SETTLE_HANDOFF_SPEED && distToTarget < 1) {
        settleIntoIdle(now);
      }
    }

    paint();
    requestAnimationFrame(tick);
  }

  function setCursorLabel(text) {
    var t = document.getElementById("cursorLabelText");
    if (t) t.textContent = text || "Guest";
  }

  var hintHidden = false;
  function hideHint() {
    if (hintHidden) return;
    hintHidden = true;
    var hint = document.getElementById("csHint");
    if (hint) {
      hint.style.transition = "opacity .4s ease";
      hint.style.opacity = "0";
    }
    hideUnicornTip();
  }

  var tipHidden = false;
  function hideUnicornTip() {
    if (tipHidden) return;
    tipHidden = true;
    var tip = document.getElementById("csUnicornTip");
    if (tip) tip.classList.remove("is-visible");
  }
  function showUnicornTip() {
    if (tipHidden) return;
    var tip = document.getElementById("csUnicornTip");
    if (!tip) return;
    tip.classList.add("is-visible");
  }

  function onPointerDown(e) {
    mode = "dragging";
    button.classList.add("is-dragging", "is-moving");
    document.body.classList.add("is-dragging-unicorn");
    hideHint();
    if (button.setPointerCapture) {
      try {
        button.setPointerCapture(e.pointerId);
      } catch (err) {
        /* ignore */
      }
    }
    // Preserve where on the sprite the user actually grabbed, so drag
    // doesn't start with a snap to the pointer's exact position.
    dragOffset.x = spring.x - e.clientX;
    dragOffset.y = spring.y - e.clientY;
    spring.setStiffness(DRAG_NEAR.stiffness, DRAG_NEAR.damping);
    spring.setTarget(spring.x, spring.y);
    lastTrailAt = 0;
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (mode !== "dragging") return;
    var c = clampToViewport(e.clientX + dragOffset.x, e.clientY + dragOffset.y);
    spring.setTarget(c.x, c.y);
  }

  function onPointerUp() {
    if (mode !== "dragging") return;
    button.classList.remove("is-dragging");
    document.body.classList.remove("is-dragging-unicorn");
    setCursorLabel(null);

    // spring.vx/vy already reflect the recent chase velocity - clamp so
    // a hard flick still coasts believably rather than flying off
    var speed = Math.hypot(spring.vx, spring.vy);
    if (speed > MAX_RELEASE_SPEED) {
      var s = MAX_RELEASE_SPEED / speed;
      spring.vx *= s;
      spring.vy *= s;
    }
    mode = "inertia";
  }

  button.addEventListener("pointerdown", onPointerDown);
  button.addEventListener("pointermove", onPointerMove);
  button.addEventListener("pointerup", onPointerUp);
  button.addEventListener("pointercancel", onPointerUp);

  if (!isCoarsePointer) {
    button.addEventListener("pointerenter", function () {
      if (mode !== "dragging") button.classList.add("is-hover");
    });
    button.addEventListener("pointerleave", function () {
      button.classList.remove("is-hover");
    });
  }

  var playfulAnims = ["anim-jump", "anim-spin", "anim-bounce", "anim-burst"];
  button.addEventListener("dblclick", function () {
    if (mode === "dragging") return;
    hideHint();
    var pick = playfulAnims[(Math.random() * playfulAnims.length) | 0];

    if (pick === "anim-burst") {
      spawnBurst(spring.x, spring.y);
      return;
    }

    button.classList.add(pick);
    var onEnd = function () {
      button.classList.remove(pick);
      img && img.removeEventListener("animationend", onEnd);
    };
    (img || button).addEventListener("animationend", onEnd);
  });

  window.addEventListener("resize", function () {
    half = button.offsetWidth / 2 || half;
    var c = clampToViewport(spring.x, spring.y);
    spring.x = spring.tx = c.x;
    spring.y = spring.ty = c.y;
  });

  /* ---- init ---- */
  var start = initialPosition();
  spring = new Spring2D(start.x, start.y, WANDER_SPRING);
  paint();

  requestAnimationFrame(function (t) {
    lastTime = t;
    scheduleWander(t);
    scheduleHop(t);
    button.classList.add("is-ready");
    requestAnimationFrame(tick);
  });

  setTimeout(showUnicornTip, 1400);
}
