/* ============================================
   Dunk Shot - public entry.

   Wires a trigger element (the unicorn mascot) to
   open the game modal on double-click. Adds a
   drag-safe double-tap fallback for touch devices,
   where dblclick is unreliable.

   Deliberately does NOT touch the unicorn's own
   behaviour: it only listens, and the mascot keeps
   its existing drag / wander / playful dblclick
   animation untouched (they simply play behind the
   modal's blurred backdrop).
============================================ */

import { GameModal } from "./modal.js";

var DOUBLE_TAP_MS = 320; // max gap between taps
var TAP_MOVE_TOL = 14; // px of movement still counted as a tap (not a drag)

export function initUnicornGame(opts) {
  opts = opts || {};
  var trigger = opts.trigger;
  var imgSrc = opts.imgSrc;
  if (!trigger) return;

  var modal = null;

  function openGame() {
    if (modal) return; // guard against double-open
    modal = new GameModal({
      imgSrc: imgSrc,
      onClose: function () {
        modal = null;
      },
    });
    modal.open();
  }

  // Desktop (and most mobile browsers): native double-click.
  trigger.addEventListener("dblclick", openGame);

  // Touch fallback: detect a genuine double-tap while ignoring drags.
  var lastTapAt = 0;
  var lastTapX = 0;
  var lastTapY = 0;
  var downX = 0;
  var downY = 0;

  trigger.addEventListener(
    "pointerdown",
    function (e) {
      if (e.pointerType === "mouse") return;
      downX = e.clientX;
      downY = e.clientY;
    },
    { passive: true },
  );

  trigger.addEventListener(
    "pointerup",
    function (e) {
      if (e.pointerType === "mouse") return;

      // Ignore this "tap" if the pointer moved far enough to be a drag.
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > TAP_MOVE_TOL) {
        lastTapAt = 0;
        return;
      }

      var now = e.timeStamp || Date.now();
      var near =
        Math.hypot(e.clientX - lastTapX, e.clientY - lastTapY) < 40;
      if (now - lastTapAt < DOUBLE_TAP_MS && near) {
        lastTapAt = 0;
        openGame();
      } else {
        lastTapAt = now;
        lastTapX = e.clientX;
        lastTapY = e.clientY;
      }
    },
    { passive: true },
  );
}
