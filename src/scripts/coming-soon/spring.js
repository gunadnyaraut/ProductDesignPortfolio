/* ============================================
   Spring - tiny critically-damped-ish spring
   integrator for "Apple quality" fluid motion.
   Used by the unicorn for drag-follow, idle
   wander and inertia settling.
============================================ */

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export class Spring2D {
  /**
   * @param {number} x initial x
   * @param {number} y initial y
   * @param {{stiffness?: number, damping?: number}} [opts]
   */
  constructor(x, y, opts) {
    opts = opts || {};
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.tx = x;
    this.ty = y;
    this.stiffness = opts.stiffness || 170;
    this.damping = opts.damping || 26;
  }

  setTarget(x, y) {
    this.tx = x;
    this.ty = y;
  }

  setStiffness(stiffness, damping) {
    this.stiffness = stiffness;
    this.damping = damping;
  }

  /** Snap position + target together, zero velocity. */
  reset(x, y) {
    this.x = this.tx = x;
    this.y = this.ty = y;
    this.vx = this.vy = 0;
  }

  /** Advance one simulation step. dt in seconds. */
  step(dt) {
    dt = Math.min(dt, 0.05); // guard against long tab-switch gaps
    var ax = (this.tx - this.x) * this.stiffness - this.vx * this.damping;
    var ay = (this.ty - this.y) * this.stiffness - this.vy * this.damping;
    this.vx += ax * dt;
    this.vy += ay * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
}
