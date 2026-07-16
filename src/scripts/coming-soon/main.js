/* ============================================
   Coming Soon - entry point
   Wires up the independent pieces: background
   (stars/parallax), arc (decorative glow horizon),
   particles (used by unicorn) and unicorn (the
   free-floating draggable companion).
============================================ */

import { initBackground } from "./background.js";
import { initArc } from "./arc.js";
import { initUnicorn } from "./unicorn.js";
import { initUnicornGame } from "./game/index.js";

function boot() {
  var hero = document.getElementById("hero");
  var stage = hero; // .cs-stage === #hero
  var starsEl = document.getElementById("csStars");
  var glowEl = stage ? stage.querySelector(".cs-glow") : null;
  var arcEl = document.getElementById("csArc");
  var unicornBtn = document.getElementById("csUnicorn");
  var unicornImg = document.getElementById("csUnicornImg");

  initBackground({ stage: stage, starsEl: starsEl, glowEl: glowEl });

  initArc({
    stage: stage,
    arcEl: arcEl,
    isLight: function () {
      return document.documentElement.getAttribute("data-theme") === "light";
    },
  });

  initUnicorn({ button: unicornBtn, img: unicornImg, hero: hero });

  // Double-click the mascot to open the Dunk Shot mini-game. This only
  // adds a listener - the unicorn's own drag/wander/dblclick behaviour is
  // left completely untouched.
  initUnicornGame({
    trigger: unicornBtn,
    imgSrc: unicornImg ? unicornImg.getAttribute("src") : "src/assets/unicorn.svg",
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
