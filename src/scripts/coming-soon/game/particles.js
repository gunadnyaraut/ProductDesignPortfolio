/* ============================================
   Unicorn Dunk - particle system.

   Lightweight canvas particles used by the game for
   jump/bounce sparkles, swish bursts and combo
   confetti. Kept separate from the site's DOM
   particle emitter so the game owns its own,
   fully-disposable pool.
============================================ */

// Soft pastel + rainbow mix that matches the court art.
var PALETTE = [
  "#FF9EC4", // pink
  "#FFC07A", // peach
  "#FFE9A6", // butter
  "#A8EFC6", // mint
  "#9AD0FF", // sky
  "#CBB2FF", // lilac
];

function pick(arr) {
  return arr[(Math.random() * arr.length) | 0];
}

export class Particles {
  constructor() {
    this.items = [];
  }

  clear() {
    this.items.length = 0;
  }

  /** Small radial sparkle (jump / wall bounce). */
  sparkle(x, y, n, spread) {
    n = n || 6;
    spread = spread || 130;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = spread * (0.3 + Math.random() * 0.7);
      this.items.push({
        type: "dot",
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        g: 260,
        life: 0,
        max: 0.4 + Math.random() * 0.35,
        r: 1.6 + Math.random() * 2.6,
        color: pick(PALETTE),
      });
    }
  }

  /** Bright burst on a successful dunk. */
  burst(x, y, n, spread) {
    n = n || 20;
    spread = spread || 260;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      var sp = spread * (0.4 + Math.random() * 0.6);
      this.items.push({
        type: "star",
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        g: 220,
        life: 0,
        max: 0.6 + Math.random() * 0.5,
        r: 2.5 + Math.random() * 3,
        color: pick(PALETTE),
      });
    }
  }

  /** Confetti raining from the top (combo celebration).
      topY places the spawn line in the same (world) space the pool is
      drawn in, so it rains from the top of the view even when the scene
      is translated by the camera. */
  confetti(width, n, topY) {
    n = n || 60;
    topY = topY || 0;
    for (var i = 0; i < n; i++) {
      this.items.push({
        type: "rect",
        x: Math.random() * width,
        y: topY - 10 - Math.random() * 40,
        vx: (Math.random() - 0.5) * 90,
        vy: 120 + Math.random() * 160,
        g: 120,
        life: 0,
        max: 1.4 + Math.random() * 0.9,
        r: 3 + Math.random() * 3,
        color: pick(PALETTE),
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 10,
      });
    }
  }

  update(dt) {
    var out = [];
    for (var i = 0; i < this.items.length; i++) {
      var p = this.items[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.vr) p.rot += p.vr * dt;
      out.push(p);
    }
    this.items = out;
  }

  draw(ctx) {
    for (var i = 0; i < this.items.length; i++) {
      var p = this.items[i];
      var alpha = 1 - p.life / p.max;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = p.color;
      if (p.type === "rect") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);
        ctx.fillRect(-p.r, -p.r * 1.4, p.r * 2, p.r * 2.8);
        ctx.restore();
      } else if (p.type === "star") {
        this._star(ctx, p.x, p.y, p.r * (0.6 + alpha * 0.6));
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.5 + alpha * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  _star(ctx, cx, cy, r) {
    ctx.beginPath();
    for (var i = 0; i < 8; i++) {
      var ang = (i / 8) * Math.PI * 2;
      var rad = i % 2 === 0 ? r : r * 0.45;
      var x = cx + Math.cos(ang) * rad;
      var y = cy + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
}
