/* ============================================
   Unicorn Dunk Shot - Canvas engine.

   A slingshot basket game in the spirit of "Dunk Shot":
   the unicorn rides a basketball that rests inside a
   hoop. Drag anywhere to pull back - a dotted arc
   previews the shot and the pull length sets the power -
   then release to fling the ball. Gravity arcs it toward
   the next hoop above; the ball bounces off the side
   walls, the rim knobs and the backboards. Drop cleanly
   down through the next hoop to score, and it becomes
   the new launch pad while a fresh hoop appears higher
   up. Clean swishes (no rim / wall / board touch) build a
   FIRE streak worth double points. Miss the hoop and fall
   off the bottom of the screen and the run ends.

   Physics run on a FIXED timestep (accumulator) so the
   feel is identical regardless of frame-rate and the
   fast-moving ball can't tunnel through a thin rim.
   Rendering then happens once per animation frame.

   Everything lives in WORLD coordinates; a smoothly
   scrolling camera (this.cam) keeps the active hoop in
   the lower third of the view. The engine owns no DOM;
   the modal drives it through a small method surface and
   tears it down cleanly.
============================================ */

import { Ball, Hoop, Cloud, clamp } from "./entities.js";
import { Particles } from "./particles.js";

var FIXED = 1 / 120; // physics substep (s)
var MAX_SUBSTEPS = 8; // guard against spiral-of-death after a stall
var VIEW_ANCHOR = 0.66; // active hoop sits this far down the screen

export class DunkShot {
  constructor(opts) {
    this.canvas = opts.canvas;
    this.ctx = this.canvas.getContext("2d");
    this.playerImg = opts.playerImg || null;
    this.onScore = opts.onScore || function () {};
    this.onGameOver = opts.onGameOver || function () {};
    this.onCombo = opts.onCombo || function () {};
    this.reducedMotion = !!opts.reducedMotion;

    this.dpr = 1;
    this.w = 0;
    this.h = 0;

    this.mode = "ready"; // ready | aim | flying | dead
    this.score = 0;
    this.combo = 0; // consecutive perfect (swish) baskets
    this.onFire = false;
    this.acc = 0; // physics accumulator
    this.shake = 0;
    this.cam = 0; // world-y mapped to the top of the screen
    this.rafId = 0;
    this.lastTime = 0;
    this.running = false;

    // Slingshot aim state.
    this.aiming = false;
    this.aimStart = null;
    this.aimNow = null;
    this.touched = false; // did the current shot graze a rim / wall / board?

    this.particles = new Particles();
    this.clouds = [];
    this.ball = null;
    this.home = null; // hoop the ball is launching from
    this.target = null; // hoop we're aiming to reach

    this._tick = this._tick.bind(this);
    this.resize();
  }

  /* -------------------------------------------- sizing / tuning */
  resize() {
    var rect = this.canvas.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width));
    var h = Math.max(1, Math.round(rect.height));
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);

    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this._tune();

    if (this.clouds.length === 0) {
      var n = Math.max(3, Math.round(w / 140));
      for (var i = 0; i < n; i++) this.clouds.push(new Cloud(w, h));
    } else {
      for (var j = 0; j < this.clouds.length; j++) {
        this.clouds[j].W = w;
        this.clouds[j].H = h;
      }
    }

    if (!this.ball) {
      this._resetState();
    } else {
      // Keep the ball sized to the new resolution and re-anchor the camera.
      this.ball.r = this.r;
      if (this.home) this.home.r = this.r;
      if (this.target) this.target.r = this.r;
      this._snapCam();
    }
  }

  // Size-relative tuning so play feels identical at any resolution.
  _tune() {
    this.r = clamp(Math.min(this.w, this.h) * 0.045, 14, 26);
    this.gravity = this.h * 2.0; // floatier -> easier to control
    this.maxV = this.h * 2.3;
    this.maxLaunch = this.h * 1.9; // top launch speed
    // Full power needs a long pull, so each bit of finger travel changes the
    // shot less - much finer, less twitchy aiming.
    this.pullK = this.maxLaunch / (this.h * 0.62);
    this.minPull = this.r * 0.7; // ignore accidental taps
  }

  /* -------------------------------------------- state */
  _resetState() {
    this.score = 0;
    this.combo = 0;
    this.onFire = false;
    this.acc = 0;
    this.shake = 0;
    this.touched = false;
    this.aiming = false;
    this.aimStart = null;
    this.aimNow = null;
    this.particles.clear();

    this.home = this._makeHome();
    this.target = this._makeHoop(this.home);
    this.ball = new Ball(this.home.x, this.home.y, this.r);
    this.mode = "ready";
    this._snapCam();
  }

  _snapCam() {
    if (this.home) this.cam = this.home.y - this.h * VIEW_ANCHOR;
  }

  /* -------------------------------------------- hoop factory */
  _makeHome() {
    var r = this.r;
    return new Hoop({
      x: this.w * 0.5,
      y: 0,
      side: "left",
      angle: 0,
      rimGap: r * 4.0,
      knobR: r * 0.26,
      r: r,
      hue: 285,
      moveAmp: 0,
    });
  }

  // Build the next target hoop above `prev`, ramping difficulty with score.
  _makeHoop(prev) {
    var r = this.r;
    var w = this.w;

    // Modest vertical gap; the challenge is the sideways distance, not height.
    var spacing = clamp(this.h * (0.28 + this.score * 0.003), this.h * 0.28, this.h * 0.38);
    var y = prev.y - spacing;

    // Wide left/right zig-zag so hoops sit far apart across the court.
    var margin = r * 2 + w * 0.05;
    var hmag = clamp(w * (0.34 + this.score * 0.01), w * 0.34, w * 0.55);
    var dir = prev.x < w * 0.5 ? 1 : -1;
    var x = prev.x + dir * hmag;
    if (x < margin || x > w - margin) {
      dir = -dir;
      x = prev.x + dir * hmag;
    }
    x = clamp(x, margin, w - margin);

    // Tilt the rim only later, and never too steeply.
    var tilt =
      this.score >= 6
        ? clamp((this.score - 6) * 0.035, 0, 0.42) * (Math.random() < 0.5 ? -1 : 1)
        : 0;

    // Sliding hoops much later on - clamped so they never leave the court.
    var moveAmp = this.score >= 12 ? clamp(w * (this.score - 12) * 0.004, 0, w * 0.1) : 0;
    moveAmp = Math.min(moveAmp, x - margin, w - margin - x);

    // Keep the opening generous - shrinks slowly and stays wide.
    var rimGap = clamp(r * (4.0 - this.score * 0.012), r * 3.2, r * 4.0);

    return new Hoop({
      x: x,
      y: y,
      side: x < w * 0.5 ? "left" : "right",
      angle: tilt,
      rimGap: rimGap,
      knobR: r * 0.26,
      r: r,
      hue: (this.score * 40) % 360,
      moveAmp: moveAmp,
      moveFreq: 0.7 + Math.random() * 0.7,
    });
  }

  /* -------------------------------------------- lifecycle */
  start() {
    this._resetState();
    this.mode = "aim";
    if (!this.reducedMotion) this.particles.sparkle(this.ball.x, this.ball.y, 8, 150);
  }

  run() {
    if (this.running) return;
    this.running = true;
    this.lastTime = 0;
    this.acc = 0;
    this.rafId = requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  destroy() {
    this.stop();
    this.playerImg = null;
    this.ball = this.home = this.target = null;
    this.clouds = null;
    if (this.particles) this.particles.clear();
    this.particles = null;
  }

  isPlaying() {
    return this.mode === "aim" || this.mode === "flying";
  }

  /* -------------------------------------------- aim / slingshot input
     Pointer coordinates are in CSS pixels relative to the canvas
     top-left, matching this.w / this.h. */
  beginAim(px, py) {
    if (this.mode !== "aim") return;
    this.aiming = true;
    this.aimStart = { x: px, y: py };
    this.aimNow = { x: px, y: py };
  }

  updateAim(px, py) {
    if (!this.aiming) return;
    this.aimNow = { x: px, y: py };
  }

  releaseAim() {
    if (!this.aiming) return;
    this.aiming = false;
    var v = this._launchVec();
    if (!v) return; // pull too small - treat as a cancel
    this.touched = false;
    this.ball.launch(v.vx, v.vy);
    this.mode = "flying";
    if (!this.reducedMotion) this.particles.sparkle(this.ball.x, this.ball.y, 7, 170);
  }

  cancelAim() {
    this.aiming = false;
  }

  // Pull back to aim: launch opposite the drag, power set by drag length.
  _launchVec() {
    if (!this.aimStart || !this.aimNow) return null;
    var dx = this.aimStart.x - this.aimNow.x;
    var dy = this.aimStart.y - this.aimNow.y;
    var len = Math.hypot(dx, dy);
    if (len < this.minPull) return null;
    var speed = Math.min(len * this.pullK, this.maxLaunch);
    return { vx: (dx / len) * speed, vy: (dy / len) * speed };
  }

  /* -------------------------------------------- loop */
  _tick(now) {
    if (!this.running) return;
    if (!this.lastTime) this.lastTime = now;
    var frame = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (frame > 0.1) frame = 0.1; // clamp big gaps (tab switch)

    this._updateAmbient(frame);

    if (this.mode === "flying") {
      this.acc += frame;
      var steps = 0;
      while (this.acc >= FIXED && steps < MAX_SUBSTEPS) {
        this._physics(FIXED);
        this.acc -= FIXED;
        steps++;
        if (this.mode !== "flying") {
          this.acc = 0;
          break;
        }
      }
    } else if (this.mode === "aim") {
      // Ball rides the (possibly sliding) home hoop, waiting to be flung.
      this.ball.x = this.home.x;
      this.ball.y = this.home.y;
    } else if (this.mode === "ready") {
      // Gentle idle bob behind the Start screen.
      this.ball.x = this.home.x;
      this.ball.y = this.home.y + Math.sin(now / 420) * this.h * 0.012;
      this.ball.angle = Math.sin(now / 900) * 0.2;
    } else if (this.mode === "dead") {
      this._deadPhysics(frame);
    }

    // Smoothly chase the camera toward the active hoop.
    var target = this.home.y - this.h * VIEW_ANCHOR;
    this.cam += (target - this.cam) * Math.min(1, frame * 6);

    this.shake = Math.max(0, this.shake - frame * 55);
    this._draw();
    this.rafId = requestAnimationFrame(this._tick);
  }

  _updateAmbient(dt) {
    for (var i = 0; i < this.clouds.length; i++) this.clouds[i].update(dt);
    this.particles.update(dt);
    if (this.home) this.home.update(dt);
    if (this.target) this.target.update(dt);
  }

  /* -------------------------------------------- physics (fixed step) */
  _physics(h) {
    var b = this.ball;
    b.integrate(h, this.gravity, this.maxV);

    // Side walls: elastic bounce with a little energy loss.
    if (b.x - b.r < 0) {
      b.x = b.r;
      b.vx = Math.abs(b.vx) * 0.86;
      this._graze(b.r, b.y, 1);
    } else if (b.x + b.r > this.w) {
      b.x = this.w - b.r;
      b.vx = -Math.abs(b.vx) * 0.86;
      this._graze(this.w - b.r, b.y, 1);
    }

    // Collide + score against the single active target hoop.
    this._collideHoop(b, this.target);
    if (this.mode !== "flying") return;
    this._checkScore(b, this.target);
    if (this.mode !== "flying") return;

    // Fell off the bottom of the view = a miss.
    if (b.y - this.cam > this.h + b.r * 4) {
      this._die("miss");
    }
  }

  _graze(x, y, squashDir) {
    this.touched = true;
    this.ball.squash = 0.4;
    this.ball.squashDir = squashDir;
    if (!this.reducedMotion) this.particles.sparkle(x, y, 5, 130);
  }

  // Bounce off the two rim knobs and the backboard segment.
  _collideHoop(b, hoop) {
    var g = hoop.geom();

    this._hitKnob(b, g.left.x, g.left.y, hoop.knobR);
    this._hitKnob(b, g.right.x, g.right.y, hoop.knobR);

    // Backboard: segment from the mount knob straight up (local -n).
    var ax = g.mount.x;
    var ay = g.mount.y;
    var bx = g.mount.x - g.nx * hoop.boardH;
    var by = g.mount.y - g.ny * hoop.boardH;
    this._hitSegment(b, ax, ay, bx, by);
  }

  _hitKnob(b, kx, ky, knobR) {
    var dx = b.x - kx;
    var dy = b.y - ky;
    var rad = b.r + knobR;
    var d2 = dx * dx + dy * dy;
    if (d2 >= rad * rad || d2 < 1e-6) return;
    var d = Math.sqrt(d2);
    var nx = dx / d;
    var ny = dy / d;
    b.x = kx + nx * rad;
    b.y = ky + ny * rad;
    var vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      var j = 1.55 * vn;
      b.vx -= j * nx;
      b.vy -= j * ny;
    }
    this._graze(kx, ky, 1);
  }

  _hitSegment(b, ax, ay, bx, by) {
    var ex = bx - ax;
    var ey = by - ay;
    var len2 = ex * ex + ey * ey || 1;
    var t = clamp(((b.x - ax) * ex + (b.y - ay) * ey) / len2, 0, 1);
    var cx = ax + ex * t;
    var cy = ay + ey * t;
    var dx = b.x - cx;
    var dy = b.y - cy;
    var d2 = dx * dx + dy * dy;
    if (d2 >= b.r * b.r || d2 < 1e-6) return;
    var d = Math.sqrt(d2);
    var nx = dx / d;
    var ny = dy / d;
    b.x = cx + nx * b.r;
    b.y = cy + ny * b.r;
    var vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      var j = 1.5 * vn;
      b.vx -= j * nx;
      b.vy -= j * ny;
    }
    this._graze(cx, cy, 0);
  }

  // Score when the ball passes down through the rim opening.
  _checkScore(b, hoop) {
    var g = hoop.geom();
    var dPrev = (b.prevX - g.cx) * g.nx + (b.prevY - g.cy) * g.ny;
    var dNow = (b.x - g.cx) * g.nx + (b.y - g.cy) * g.ny;
    if (dPrev > 0 || dNow <= 0) return; // not crossing to the "score" side

    var proj = (b.x - g.cx) * g.ux + (b.y - g.cy) * g.uy;
    var velN = b.vx * g.nx + b.vy * g.ny;
    if (Math.abs(proj) < g.half * 0.98 && velN > 0) {
      this._score(g, proj);
    }
  }

  _score(g, proj) {
    var perfect = !this.touched;
    this.combo = perfect ? this.combo + 1 : 0;
    this.onFire = this.combo >= 2;

    var points = this.onFire ? 2 : 1;
    this.score += points;

    this.target.swish(perfect ? 26 : 16);
    if (!this.reducedMotion) {
      this.particles.burst(g.cx, g.cy, perfect ? 26 : 18, perfect ? 300 : 240);
    }
    if (this.onFire && !this.reducedMotion) {
      this.particles.confetti(this.w, 24 + this.combo * 4, this.cam);
      this.onCombo(this.combo);
    }

    this.onScore(this.score, this.combo);

    // The hoop we just sank becomes the new launch pad; spawn a fresh one.
    this.home = this.target;
    this.target = this._makeHoop(this.home);

    // Lock the ball back into the (new) home hoop, ready to be flung again.
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.ball.x = this.home.x;
    this.ball.y = this.home.y;
    this.mode = "aim";
  }

  _die(cause) {
    if (this.mode !== "flying") return;
    this.mode = "dead";
    this.combo = 0;
    this.onFire = false;
    this.shake = this.reducedMotion ? 0 : 12;
    if (!this.reducedMotion) this.particles.burst(this.ball.x, this.ball.y, 30, 320);
    this.onGameOver(this.score);
  }

  _deadPhysics(dt) {
    var b = this.ball;
    b.vy = Math.min(b.vy + this.gravity * dt, this.maxV);
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.angle += dt * 5;
    if (b.x - b.r < 0 || b.x + b.r > this.w) b.vx *= -0.6;
  }

  /* -------------------------------------------- rendering */
  _draw() {
    var ctx = this.ctx;
    this._drawSky(ctx);
    this._drawClouds(ctx);

    ctx.save();
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    ctx.translate(0, -this.cam); // enter world space

    this.target.draw(ctx);
    this.home.draw(ctx);
    if (this.aiming) this._drawAim(ctx);
    this._drawCharacter(ctx);
    this.particles.draw(ctx);

    ctx.restore();
  }

  _drawSky(ctx) {
    var sky = ctx.createLinearGradient(0, 0, 0, this.h);
    sky.addColorStop(0, "#F6E6FF");
    sky.addColorStop(0.5, "#E6F0FF");
    sky.addColorStop(1, "#FFF0E8");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  _drawClouds(ctx) {
    ctx.save();
    ctx.translate(0, -this.cam * 0.12); // gentle parallax
    for (var i = 0; i < this.clouds.length; i++) this.clouds[i].draw(ctx);
    ctx.restore();
  }

  // Dotted arc previewing the current shot (helps aiming without giving it away).
  _drawAim(ctx) {
    var v = this._launchVec();
    if (!v) return;
    var x = this.ball.x;
    var y = this.ball.y;
    var vx = v.vx;
    var vy = v.vy;
    var dt = 0.04;
    var maxSteps = 120; // simulate the whole flight, all the way down
    var bottom = this.cam + this.h + this.r * 2;
    ctx.save();
    ctx.fillStyle = "#6b4b8a";
    for (var i = 0; i < maxSteps; i++) {
      vy += this.gravity * dt;
      x += vx * dt;
      y += vy * dt;
      if (x - this.r < 0) {
        x = this.r;
        vx = Math.abs(vx) * 0.86;
      } else if (x + this.r > this.w) {
        x = this.w - this.r;
        vx = -Math.abs(vx) * 0.86;
      }
      if (y > bottom) break; // left the view - stop drawing the arc
      // Fade gently along the path but keep the whole arc readable.
      var a = Math.max(0.16, 1 - i / 90);
      ctx.globalAlpha = 0.55 * a;
      var rr = this.r * 0.2 * (0.7 + a * 0.5);
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawCharacter(ctx) {
    var b = this.ball;
    if (!b) return;
    var r = b.r;

    // Fiery aura while on a swish streak.
    if (this.onFire && this.mode !== "dead") {
      var glow = ctx.createRadialGradient(b.x, b.y, r * 0.4, b.x, b.y, r * 2.4);
      glow.addColorStop(0, "rgba(255,150,60,0.5)");
      glow.addColorStop(1, "rgba(255,150,60,0)");
      ctx.save();
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Squash / stretch aligned to the last impulse direction.
    var sq = b.squash;
    var sx = 1 + (b.squashDir === 1 ? -sq : sq) * 0.5;
    var sy = 1 + (b.squashDir === 1 ? sq : -sq) * 0.5;

    ctx.save();
    ctx.translate(b.x, b.y);

    // --- basketball (physics body) ---
    ctx.save();
    ctx.scale(sx, sy);
    ctx.rotate(b.angle);
    this._drawBasketball(ctx, r);
    ctx.restore();

    // --- unicorn riding on top of the ball ---
    var img = this.playerImg;
    var tilt =
      clamp(b.vx / (this.w * 1.2), -0.4, 0.4) + clamp(b.vy / (this.h * 1.6), -0.3, 0.3);
    ctx.save();
    ctx.translate(0, -r * 0.95);
    ctx.rotate(tilt);
    if (img && img.complete && img.naturalWidth) {
      var uw = r * 2.1;
      var uh = uw * (img.naturalHeight / img.naturalWidth);
      ctx.drawImage(img, -uw / 2, -uh * 0.62, uw, uh);
    } else {
      ctx.fillStyle = "#EDEDE8";
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  }

  _drawBasketball(ctx, r) {
    var grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r);
    grad.addColorStop(0, "#FFB570");
    grad.addColorStop(1, "#E8792B");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Seams.
    ctx.strokeStyle = "rgba(60,30,10,0.6)";
    ctx.lineWidth = Math.max(1.2, r * 0.08);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.moveTo(0, -r);
    ctx.lineTo(0, r);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.5, r, 0, 0, Math.PI * 2);
    ctx.ellipse(0, 0, r, r * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}
