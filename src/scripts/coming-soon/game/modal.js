/* ============================================
   Dunk Shot - Modal shell + lifecycle.

   Owns everything around the canvas engine:
     - the blurred-backdrop centered modal DOM
     - Start / Game-Over panels, HUD, buttons
     - input wiring (click / tap / Space)
     - high-score persistence (localStorage)
     - confetti on a new best
     - responsive resizing (ResizeObserver)

   Crucially, open() creates the whole UI and close()
   tears ALL of it down again - every listener,
   observer, timer, rAF and DOM node created here is
   released so nothing leaks after the modal closes.
============================================ */

import { DunkShot } from "./engine.js";

var HI_KEY = "gunadnya_unicorn_dunk_hi";
var CONFETTI_HUES = [0, 32, 52, 145, 205, 275];

function readHigh() {
  try {
    return parseInt(localStorage.getItem(HI_KEY), 10) || 0;
  } catch (e) {
    return 0;
  }
}
function writeHigh(v) {
  try {
    localStorage.setItem(HI_KEY, String(v));
  } catch (e) {
    /* private mode - ignore */
  }
}

export class GameModal {
  /**
   * @param {object} opts
   * @param {string} opts.imgSrc            path to the unicorn sprite
   * @param {() => void} [opts.onClose]     called after teardown completes
   */
  constructor(opts) {
    opts = opts || {};
    this.imgSrc = opts.imgSrc;
    this.onClose = opts.onClose || function () {};
    this.reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    this.high = readHigh();
    this.game = null;
    this.ro = null;
    this._open = false;
    this._listeners = []; // [target, type, handler, opts]
    this._timers = [];
    this._prevOverflow = "";

    // Pre-bind so add/removeEventListener reference the same fn.
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onResize = this._onResize.bind(this);
    this._onBackdropClick = this._onBackdropClick.bind(this);
  }

  /* ---- small tracked helpers so teardown is exhaustive ---- */
  _on(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this._listeners.push([target, type, handler, options]);
  }
  _later(fn, ms) {
    var id = setTimeout(fn, ms);
    this._timers.push(id);
    return id;
  }

  /* ---- open ---- */
  open() {
    if (this._open) return;
    this._open = true;

    this._prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    this._buildDOM();
    this._loadSprite();

    this.game = new DunkShot({
      canvas: this.canvas,
      playerImg: this.sprite,
      reducedMotion: this.reducedMotion,
      onScore: this._onScore.bind(this),
      onGameOver: this._onGameOver.bind(this),
    });

    // Size to the freshly-laid-out canvas, then start rendering the
    // idle "ready" frame behind the Start panel.
    requestAnimationFrame(() => {
      if (!this._open) return;
      this.game.resize();
      this.game.run();
    });

    this._wireInput();
    this._showPanel("start");

    // Entrance transition.
    requestAnimationFrame(() => {
      if (this.root) this.root.classList.add("is-open");
    });
  }

  /* ---- close (complete teardown) ---- */
  close() {
    if (!this._open) return;
    this._open = false;

    // Remove every tracked listener.
    for (var i = 0; i < this._listeners.length; i++) {
      var l = this._listeners[i];
      l[0].removeEventListener(l[1], l[2], l[3]);
    }
    this._listeners.length = 0;

    // Clear every tracked timer.
    for (var t = 0; t < this._timers.length; t++) clearTimeout(this._timers[t]);
    this._timers.length = 0;

    if (this.ro) {
      this.ro.disconnect();
      this.ro = null;
    }
    if (this.game) {
      this.game.destroy();
      this.game = null;
    }
    if (this.sprite) {
      this.sprite.onload = null;
      this.sprite = null;
    }
    if (this.root && this.root.parentNode) {
      this.root.parentNode.removeChild(this.root);
    }
    this.root = this.canvas = this.hud = null;
    this.startPanel = this.overPanel = this.confettiLayer = null;

    document.body.style.overflow = this._prevOverflow;
    this.onClose();
  }

  /* ---- DOM ---- */
  _buildDOM() {
    var root = document.createElement("div");
    root.className = "cs-game";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Unicorn Dunk Shot mini game");

    root.innerHTML = [
      '<div class="cs-game-backdrop"></div>',
      '<div class="cs-game-card" role="document">',
      '  <button class="cs-game-close" type="button" aria-label="Close game">&times;</button>',
      '  <div class="cs-game-hud">',
      '    <span class="cs-game-hud-best">Best 0</span>',
      '    <span class="cs-game-hud-score">0</span>',
      "  </div>",
      '  <div class="cs-game-stage">',
      '    <canvas class="cs-game-canvas"></canvas>',
      '    <div class="cs-game-panel cs-game-start">',
      '      <div class="cs-game-emoji">🦄</div>',
      '      <h2 class="cs-game-title">Unicorn Dunk Shot</h2>',
      '      <button class="cs-game-btn cs-game-play" type="button">Click to Start</button>',
      '      <p class="cs-game-sub">Pull back and release to sling the ball into the next hoop. Clean swishes catch <b>fire</b> for double points.</p>',
      "    </div>",
      '    <div class="cs-game-panel cs-game-over" hidden>',
      '      <p class="cs-game-badge" hidden>New best! ✦</p>',
      '      <h2 class="cs-game-title">Game Over</h2>',
      '      <p class="cs-game-scoreline"><span class="cs-game-final">0</span><span class="cs-game-scoreline-label">score</span></p>',
      '      <p class="cs-game-sub cs-game-bestline">Best 0</p>',
      '      <div class="cs-game-actions">',
      '        <button class="cs-game-btn cs-game-restart" type="button">Play Again</button>',
      '        <button class="cs-game-btn cs-game-btn--ghost cs-game-close-btn" type="button">Close</button>',
      "      </div>",
      "    </div>",
      '    <div class="cs-game-confetti" aria-hidden="true"></div>',
      "  </div>",
      "</div>",
    ].join("");

    document.body.appendChild(root);

    this.root = root;
    this.canvas = root.querySelector(".cs-game-canvas");
    this.hud = root.querySelector(".cs-game-hud-best");
    this.scoreEl = root.querySelector(".cs-game-hud-score");
    this.startPanel = root.querySelector(".cs-game-start");
    this.overPanel = root.querySelector(".cs-game-over");
    this.confettiLayer = root.querySelector(".cs-game-confetti");
    this.badge = root.querySelector(".cs-game-badge");
    this.finalEl = root.querySelector(".cs-game-final");
    this.bestlineEl = root.querySelector(".cs-game-bestline");

    this.hud.textContent = "Best " + this.high;
  }

  _loadSprite() {
    var img = new Image();
    img.src = this.imgSrc;
    // Re-render once the sprite is ready even if the loop already started.
    img.onload = () => {
      if (this.game) this.game.playerImg = img;
    };
    this.sprite = img;
  }

  /* ---- input ---- */
  _wireInput() {
    this._on(window, "keydown", this._onKeyDown);
    // Slingshot: press to anchor, drag to aim, release to fling. Pointer
    // capture keeps the drag alive even if it wanders off the canvas.
    this._on(this.canvas, "pointerdown", this._onPointerDown);
    this._on(this.canvas, "pointermove", this._onPointerMove);
    this._on(this.canvas, "pointerup", this._onPointerUp);
    this._on(this.canvas, "pointercancel", this._onPointerUp);

    this._on(this.root.querySelector(".cs-game-close"), "click", () =>
      this.close(),
    );
    this._on(this.root.querySelector(".cs-game-close-btn"), "click", () =>
      this.close(),
    );
    this._on(this.root.querySelector(".cs-game-backdrop"), "click",
      this._onBackdropClick,
    );
    // "Click to Start" - the button or anywhere on the start screen.
    this._on(this.startPanel, "click", () => this._startRun());
    this._on(this.root.querySelector(".cs-game-restart"), "click", () =>
      this._startRun(),
    );

    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(this._onResize);
      this.ro.observe(this.canvas);
    } else {
      this._on(window, "resize", this._onResize);
    }
  }

  _onKeyDown(e) {
    if (e.key === "Escape") {
      this.close();
      return;
    }
    if (e.code === "Space" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault(); // never scroll the page behind the modal
      // Space is a convenience to kick off a run; shooting needs a drag.
      if (this.game && this.game.mode === "ready") this._startRun();
    }
  }

  // Canvas coordinates in CSS pixels, matching the engine's world scale.
  _relPoint(e) {
    var rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  _onPointerDown(e) {
    if (!this.game) return;
    e.preventDefault();
    if (this.game.mode === "ready") {
      this._startRun();
      return;
    }
    var p = this._relPoint(e);
    this.game.beginAim(p.x, p.y);
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      /* capture unsupported - drag still works via canvas events */
    }
  }

  _onPointerMove(e) {
    if (!this.game || !this.game.aiming) return;
    e.preventDefault();
    var p = this._relPoint(e);
    this.game.updateAim(p.x, p.y);
  }

  _onPointerUp(e) {
    if (!this.game) return;
    if (this.game.aiming) {
      e.preventDefault();
      if (e.type === "pointercancel") this.game.cancelAim();
      else this.game.releaseAim();
    }
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch (err) {
      /* nothing captured */
    }
  }

  _onBackdropClick() {
    this.close();
  }

  _onResize() {
    if (this.game) this.game.resize();
  }

  /* ---- run flow ---- */
  _startRun() {
    if (!this.game || this.game.isPlaying()) return; // ignore bubbled/again mid-run
    this._clearConfetti();
    this.scoreEl.textContent = "0";
    this._showPanel(null);
    this.game.start();
  }

  _onScore(score) {
    // Live HUD score with a quick pop each time it changes.
    this.scoreEl.textContent = String(score);
    this.scoreEl.classList.remove("is-pop");
    // Force reflow so the animation restarts every score.
    void this.scoreEl.offsetWidth;
    this.scoreEl.classList.add("is-pop");
  }

  _onGameOver(score) {
    var isBest = score > this.high;
    if (isBest) {
      this.high = score;
      writeHigh(score);
    }

    // Let the crash animation breathe before the panel slides in.
    this._later(() => {
      if (!this._open) return;
      this.finalEl.textContent = String(score);
      this.hud.textContent = "Best " + this.high;
      this.bestlineEl.textContent = "Best " + this.high;
      this.badge.hidden = !isBest;
      this._showPanel("over");
      if (isBest && !this.reducedMotion) this._confetti();
    }, 650);
  }

  /* ---- panels ---- */
  _showPanel(which) {
    if (this.startPanel) this.startPanel.hidden = which !== "start";
    if (this.overPanel) this.overPanel.hidden = which !== "over";
    // Drives HUD-score visibility (only shown while playing) via CSS.
    if (this.root) this.root.dataset.state = which || "playing";
  }

  /* ---- confetti (new high score) ---- */
  _confetti() {
    var layer = this.confettiLayer;
    if (!layer) return;
    var n = 70;
    for (var i = 0; i < n; i++) {
      var piece = document.createElement("i");
      piece.className = "cs-game-confetti-bit";
      var hueVal = CONFETTI_HUES[(Math.random() * CONFETTI_HUES.length) | 0];
      piece.style.left = Math.random() * 100 + "%";
      piece.style.background = "hsl(" + hueVal + ",92%,60%)";
      piece.style.setProperty("--cx", (Math.random() * 160 - 80).toFixed(0) + "px");
      piece.style.setProperty("--cd", (0.9 + Math.random() * 0.9).toFixed(2) + "s");
      piece.style.setProperty("--cdl", (Math.random() * 0.35).toFixed(2) + "s");
      piece.style.setProperty("--cr", (Math.random() * 720 - 360).toFixed(0) + "deg");
      piece.addEventListener("animationend", function () {
        this.remove();
      });
      layer.appendChild(piece);
    }
  }

  _clearConfetti() {
    if (this.confettiLayer) this.confettiLayer.innerHTML = "";
  }
}
