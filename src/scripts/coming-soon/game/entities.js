/* ============================================
   Unicorn Dunk Shot - game entities.

   Pure, render-capable objects with no knowledge of
   the game loop or input:
     - Ball : the physics body (a basketball the
              unicorn rides), with squash/stretch and a
              remembered previous position so the engine
              can detect a clean pass-through.
     - Hoop : a FREE-FLOATING side-view basketball hoop
              (backboard + horizontal rim + swaying net).
              It can be tilted and can slide side-to-side.
              Knows its own geometry so the engine can
              score/collide against it (Dunk Shot style).
     - Cloud: soft pastel background décor.

   All entity coordinates live in WORLD space; the
   engine translates the scene by the camera before
   drawing, so entities draw at their own coordinates.
============================================ */

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

/* ------------------------------------------------ Ball */
export class Ball {
  constructor(x, y, r) {
    this.x = x;
    this.y = y;
    this.r = r;
    this.vx = 0;
    this.vy = 0;
    this.prevX = x;
    this.prevY = y;
    this.angle = 0; // rolling / spinning rotation
    this.squash = 0; // 0..1, decays; drives squash/stretch
    this.squashDir = 0; // 0 = vertical impulse, 1 = horizontal impulse
  }

  /** Fling the ball with an initial velocity (slingshot release). */
  launch(vx, vy) {
    this.vx = vx;
    this.vy = vy;
    this.squash = 0.4;
    this.squashDir = 0;
  }

  /** One fixed physics substep of free projectile flight. */
  integrate(h, gravity, maxV) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.vy = clamp(this.vy + gravity * h, -maxV, maxV);
    this.x += this.vx * h;
    this.y += this.vy * h;
    // Spin from horizontal travel, plus a little from vertical motion.
    this.angle += (this.vx / this.r) * h;
    // Ease the squash back to round.
    this.squash += (0 - this.squash) * Math.min(1, h * 9);
  }
}

/* ------------------------------------------------ Hoop */
export class Hoop {
  /**
   * @param {object} o
   * @param {number} o.x @param {number} o.y  world centre of the rim opening
   * @param {"left"|"right"} o.side  wall the backboard mounts on
   * @param {number} o.angle    tilt of the rim (radians)
   * @param {number} o.rimGap   width of the scoring opening
   * @param {number} o.knobR    rim-end (bounces the ball) radius
   * @param {number} o.r        ball radius (used for sizing the art)
   * @param {number} o.hue      rainbow base hue
   * @param {number} [o.moveAmp]  horizontal oscillation amplitude
   * @param {number} [o.moveFreq] horizontal oscillation frequency
   */
  constructor(o) {
    this.baseX = o.x;
    this.x = o.x;
    this.y = o.y;
    this.side = o.side;
    this.angle = o.angle || 0;
    this.rimGap = o.rimGap;
    this.knobR = o.knobR;
    this.r = o.r;
    this.hue = o.hue;
    this.moveAmp = o.moveAmp || 0;
    this.moveFreq = o.moveFreq || 0;

    this.phase = Math.random() * Math.PI * 2;
    this.t = 0;

    // Net spring state (sway is the horizontal offset of the net's tip,
    // expressed in the hoop's local frame).
    this.netSway = 0;
    this.netVel = 0;
    this.netDepth = this.r * 2.4;
    this.boardH = this.r * 3.0;

    this.spawnT = 0; // 0..1 pop-in animation
  }

  update(dt) {
    this.t += dt;
    if (this.moveAmp) {
      this.x = this.baseX + Math.sin(this.t * this.moveFreq + this.phase) * this.moveAmp;
    }

    // Underdamped spring pulling the net tip back to centre.
    this.netVel += -this.netSway * 120 * dt;
    this.netVel *= Math.pow(0.015, dt);
    this.netSway += this.netVel * dt;

    if (this.spawnT < 1) this.spawnT = Math.min(1, this.spawnT + dt * 4);
  }

  swish(strength) {
    this.netVel += strength;
  }

  /**
   * Current rim geometry in WORLD space.
   *  u = unit vector along the rim (opening spans ±half along u)
   *  n = through-normal; points to the "score" side (downward at angle 0)
   */
  geom() {
    var a = this.angle;
    var ux = Math.cos(a);
    var uy = Math.sin(a);
    var nx = -uy;
    var ny = ux;
    var half = this.rimGap / 2;
    var left = { x: this.x - ux * half, y: this.y - uy * half };
    var right = { x: this.x + ux * half, y: this.y + uy * half };
    var mount = this.side === "left" ? left : right;
    return {
      cx: this.x,
      cy: this.y,
      ux: ux,
      uy: uy,
      nx: nx,
      ny: ny,
      half: half,
      left: left,
      right: right,
      mount: mount,
    };
  }

  /* -------------------------------------------- drawing (local frame) */
  draw(ctx) {
    var r = this.r;
    var pop = smoothstep(this.spawnT);
    var col = "hsl(" + this.hue + ",85%,64%)";
    var colDeep = "hsl(" + ((this.hue + 28) % 360) + ",78%,52%)";
    var half = this.rimGap / 2;
    var mountX = this.side === "left" ? -half : half;

    ctx.save();
    ctx.globalAlpha = pop;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    // local +x = along the rim, local +y = down through the hoop.

    // Backboard behind the rim (extends "up", local -y).
    var bbW = r * 1.4;
    var bbH = this.boardH;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.strokeStyle = "rgba(120,110,140,0.28)";
    ctx.lineWidth = 2;
    this._round(ctx, mountX - bbW / 2, -bbH, bbW, bbH, 7);
    ctx.fill();
    ctx.stroke();
    // Rainbow target square on the backboard.
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    var sq = r * 0.78;
    this._round(ctx, mountX - sq / 2, -bbH * 0.68, sq, sq, 4);
    ctx.stroke();

    // Animated net hanging below the rim.
    this._drawNet(ctx, half);

    // Rim ring drawn as a shallow ellipse (perspective) in rainbow.
    ctx.lineWidth = Math.max(4, r * 0.24);
    ctx.strokeStyle = colDeep;
    ctx.beginPath();
    ctx.ellipse(0, 0, half, half * 0.2, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Bright front arc of the rim for a glossy pop.
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.beginPath();
    ctx.ellipse(0, 0, half, half * 0.2, 0, 0.05 * Math.PI, 0.95 * Math.PI);
    ctx.stroke();

    // Rim knobs (touching these bounces the ball, breaks a perfect run).
    ctx.fillStyle = col;
    this._knob(ctx, -half, 0, this.knobR);
    this._knob(ctx, half, 0, this.knobR);

    ctx.restore();
  }

  _drawNet(ctx, half) {
    var strands = 8;
    var rimGap = this.rimGap;
    var tipX = this.netSway;
    var tipY = this.netDepth;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1.3;
    for (var i = 0; i <= strands; i++) {
      var f = i / strands;
      var topx = -half + f * rimGap;
      var topy = Math.sin(f * Math.PI) * half * 0.16;
      var botx = tipX + topx * 0.32;
      ctx.beginPath();
      ctx.moveTo(topx, topy);
      ctx.quadraticCurveTo(
        (topx + botx) / 2 + this.netSway * 0.4,
        (topy + tipY) / 2,
        botx,
        tipY,
      );
      ctx.stroke();
    }
    // A couple of horizontal hoops of mesh for depth.
    for (var j = 1; j <= 2; j++) {
      var t = j / 3;
      var yy = t * tipY;
      var rr = half * (1 - t * 0.68);
      ctx.beginPath();
      ctx.ellipse(this.netSway * t, yy, rr, rr * 0.16, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  _knob(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _round(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

/* ------------------------------------------------ Cloud */
export class Cloud {
  constructor(W, H) {
    this.W = W;
    this.H = H;
    this.reset(true);
  }

  reset(initial) {
    this.s = 0.6 + Math.random() * 0.9;
    this.y = Math.random() * this.H * 0.7;
    this.speed = (6 + Math.random() * 12) * this.s;
    this.alpha = 0.5 + Math.random() * 0.35;
    this.x = initial ? Math.random() * this.W : this.W + 60 * this.s;
  }

  update(dt) {
    this.x -= this.speed * dt;
    if (this.x < -80 * this.s) this.reset(false);
  }

  draw(ctx) {
    var s = this.s;
    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = "#ffffff";
    var puffs = [
      [0, 0, 22],
      [20, 4, 17],
      [-20, 5, 16],
      [8, -10, 15],
      [-8, -8, 14],
    ];
    for (var i = 0; i < puffs.length; i++) {
      ctx.beginPath();
      ctx.arc(this.x + puffs[i][0] * s, this.y + puffs[i][1] * s, puffs[i][2] * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
