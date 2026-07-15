/* ============================================
   Arc - the hero's dominant visual element: a
   thin horizon line with an intense white glow
   at the apex that fades smoothly to 0% opacity
   at both ends, plus a soft bloom hotspot.

   Purely decorative. It shares no state with the
   unicorn - this module never reads or writes
   unicorn position, and nothing here is a path for
   anything to follow.
============================================ */

var SVG_NS = "http://www.w3.org/2000/svg";

function el(tag, attrs) {
  var node = document.createElementNS(SVG_NS, tag);
  for (var k in attrs) node.setAttribute(k, attrs[k]);
  return node;
}

function stop(offset, color, opacity) {
  return el("stop", { offset: offset, "stop-color": color, "stop-opacity": opacity });
}

export function initArc({ stage, arcEl, isLight }) {
  if (!stage || !arcEl) return;

  var svg = el("svg", { "aria-hidden": "true" });
  var defs = el("defs", {});

  // Glow layers always fade through pure white (light itself has no
  // theme); the crisp core line fades through a theme-adaptive color so
  // it still reads against a light background.
  var glowGradient = el("linearGradient", { id: "csArcGlowFade", gradientUnits: "userSpaceOnUse" });
  var glowStop0 = stop("0%", "#FFFFFF", 0);
  var glowStop50 = stop("50%", "#FFFFFF", 1);
  var glowStop100 = stop("100%", "#FFFFFF", 0);
  glowGradient.appendChild(glowStop0);
  glowGradient.appendChild(glowStop50);
  glowGradient.appendChild(glowStop100);

  var coreGradient = el("linearGradient", { id: "csArcCoreFade", gradientUnits: "userSpaceOnUse" });
  var coreStop0 = stop("0%", "#FFFFFF", 0);
  var coreStop50 = stop("50%", "#FFFFFF", 1);
  var coreStop100 = stop("100%", "#FFFFFF", 0);
  coreGradient.appendChild(coreStop0);
  coreGradient.appendChild(coreStop50);
  coreGradient.appendChild(coreStop100);

  // Vertical fade for the fill: fully opaque right at the arc line,
  // fading out as it goes down, rather than one flat opacity.
  var fillGradient = el("linearGradient", { id: "csArcFillFade", gradientUnits: "userSpaceOnUse" });
  var fillStop0 = el("stop", { offset: "0%" });
  var fillStop100 = el("stop", { offset: "100%" });
  fillStop0.style.stopColor = "var(--bg)";
  fillStop0.style.stopOpacity = "1";
  fillStop100.style.stopColor = "var(--bg)";
  fillStop100.style.stopOpacity = "0";
  fillGradient.appendChild(fillStop0);
  fillGradient.appendChild(fillStop100);

  defs.appendChild(glowGradient);
  defs.appendChild(coreGradient);
  defs.appendChild(fillGradient);

  // Filled "planet body" beneath the arc line, painted in the page
  // background color - this is what stops stars/glow from showing
  // through below the horizon, so the arc reads as an edge rather than
  // just a floating line.
  var fillShape = el("path", { fill: "url(#csArcFillFade)", stroke: "none" });

  // Layer order matters: fill first (behind everything), then
  // widest/softest glow, crisp core last (on top)
  var glowOuter = el("path", { fill: "none", "stroke-linecap": "round", stroke: "url(#csArcGlowFade)" });
  var glowMid = el("path", { fill: "none", "stroke-linecap": "round", stroke: "url(#csArcGlowFade)" });
  var glowTight = el("path", { fill: "none", "stroke-linecap": "round", stroke: "url(#csArcGlowFade)" });
  var core = el("path", { fill: "none", "stroke-linecap": "round", stroke: "url(#csArcCoreFade)" });

  svg.appendChild(defs);
  svg.appendChild(fillShape);
  svg.appendChild(glowOuter);
  svg.appendChild(glowMid);
  svg.appendChild(glowTight);
  svg.appendChild(core);

  var bloom = document.createElement("div");
  bloom.className = "cs-arc-bloom";
  bloom.setAttribute("aria-hidden", "true");

  arcEl.innerHTML = "";
  arcEl.appendChild(svg);
  arcEl.appendChild(bloom);

  function yAt(x, cx, cy, R) {
    var dx = x - cx;
    var inner = Math.max(0, R * R - dx * dx);
    return cy - Math.sqrt(inner);
  }

  function layout() {
    var rect = stage.getBoundingClientRect();
    var W = rect.width;
    var H = rect.height;
    if (!W || !H) return;

    // Arc occupies ~68% of the hero width
    var halfSpan = W * 0.34;
    var cx = W / 2;
    var cy = H;
    // Lower multiplier than before (was H*0.92) so the apex sits further
    // down from the top of the hero instead of touching it.
    var R = Math.max(halfSpan * 1.06, H * 0.75);

    var xMin = cx - halfSpan;
    var xMax = cx + halfSpan;
    var y1 = yAt(xMin, cx, cy, R);
    var y2 = yAt(xMax, cx, cy, R);
    var d =
      "M " + xMin + " " + y1 + " A " + R + " " + R + " 0 0 1 " + xMax + " " + y2;

    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.style.width = W + "px";
    svg.style.height = H + "px";

    [glowOuter, glowMid, glowTight, core].forEach(function (p) {
      p.setAttribute("d", d);
    });

    // Closed shape: same arc, then straight down to the stage bottom and
    // back across, filled solid to occlude anything behind the horizon.
    fillShape.setAttribute(
      "d",
      d + " L " + xMax + " " + H + " L " + xMin + " " + H + " Z",
    );

    // Fade gradients run left-to-right along the arc's own span (a
    // horizontal gradient vector, so color only varies with x) - full
    // brightness at the apex (center), 0% opacity at both ends.
    [glowGradient, coreGradient].forEach(function (g) {
      g.setAttribute("x1", xMin);
      g.setAttribute("y1", 0);
      g.setAttribute("x2", xMax);
      g.setAttribute("y2", 0);
    });

    // Fill fade runs top-to-bottom (vertical vector): 100% right at the
    // arc's apex, fading out toward the bottom of the stage.
    var apexYForFill = yAt(cx, cx, cy, R);
    fillGradient.setAttribute("x1", cx);
    fillGradient.setAttribute("y1", apexYForFill);
    fillGradient.setAttribute("x2", cx);
    fillGradient.setAttribute("y2", H);

    var coreColor = isLight() ? "#0C0C0B" : "#F8F8F4";
    coreStop0.setAttribute("stop-color", coreColor);
    coreStop50.setAttribute("stop-color", coreColor);
    coreStop100.setAttribute("stop-color", coreColor);

    glowOuter.setAttribute("stroke-width", String(Math.max(8, W * 0.005)));
    glowOuter.style.opacity = "0.14";
    glowOuter.style.filter = "blur(10px)";

    glowMid.setAttribute("stroke-width", String(Math.max(4, W * 0.0025)));
    glowMid.style.opacity = "0.28";
    glowMid.style.filter = "blur(5px)";

    glowTight.setAttribute("stroke-width", "2");
    glowTight.style.opacity = "0.5";
    glowTight.style.filter = "blur(1.5px)";

    core.setAttribute("stroke-width", "1.4");
    core.style.opacity = "0.95";
    core.style.filter = "none";

    // Bloom hotspot sits at the apex (x = cx) - small and tight, just
    // enough to softly light the immediate area around the apex
    var bloomSize = Math.max(70, Math.min(130, W * 0.09));
    bloom.style.left = cx + "px";
    bloom.style.top = apexYForFill + "px";
    bloom.style.width = bloomSize + "px";
    bloom.style.height = bloomSize + "px";
  }

  layout();

  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 120);
  });

  // Re-layout on theme toggle (core color depends on it)
  var observer = new MutationObserver(layout);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
}
