let oracleFont;
let wrinkleAmount = 100;
let amountSlider;
let amountLabel;
let maskLayer;
let clipLayer;
let wrinkleLayer;
let glyphs = [];
let wrinkleSegments = [];
let rebuildTimer = 0;
const wrinkleGlyphCache = new Map();

const GLYPH_SIZE = 172;
const WRINKLE_WEIGHT_MULTIPLIER = 0.8;
const REBUILD_DELAY_MS = 120;
const SUPPORTED_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ!?";
const DEFAULT_LETTERS = SUPPORTED_LETTERS.split("");
const FONT_PATH = "libraries/ABCOracle-Bold.otf";
const WRINKLE_HOST_SELECTOR = ".font-tester-mask";
const FONT_TESTER_SELECTOR = ".font-tester";
let letters = DEFAULT_LETTERS;
let currentGlyphSize = GLYPH_SIZE;
let currentLetterSpacing = 0;
let currentLineHeight = GLYPH_SIZE * 1.05;
let wrinkleHostEl;

function preload() {
  oracleFont = loadFont(FONT_PATH);
}

function setup() {
  wrinkleHostEl = document.querySelector(WRINKLE_HOST_SELECTOR);
  const { width: canvasWidth, height: canvasHeight } = getCanvasSize();
  const canvas = createCanvas(canvasWidth, canvasHeight);
  canvas.class("wrinkle-canvas");
  canvas.parent(wrinkleHostEl);
  pixelDensity(1);
  noLoop();

  textFont(oracleFont);
  configureFromUrl();
  rebuildLetters();
  exposeLetterApi();
}

function draw() {
  clear();

  drawGlyph();
  drawWrinkleLayer(wrinkleAmount / 100);
}

function setupControls() {
  const panel = createDiv();
  panel.class("control-panel");

  const label = createDiv(`Wrinkle ${wrinkleAmount}`);
  label.class("control-label");
  amountLabel = label;

  amountSlider = createSlider(0, 100, wrinkleAmount, 1);
  amountSlider.class("wrinkle-slider");
  amountSlider.input(() => {
    wrinkleAmount = round(amountSlider.value());
    amountLabel.html(`Wrinkle ${wrinkleAmount}`);
    redraw();
  });

  panel.child(label);
  panel.child(amountSlider);
}

function configureFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const textParam = params.get("text");
  const amountParam = params.get("amount");

  if (textParam) {
    letters = sanitizeLetters(textParam);
  }

  if (amountParam !== null) {
    wrinkleAmount = constrain(Number(amountParam) || 0, 0, 100);
  }
}

function exposeLetterApi() {
  window.WrinkleLetters = {
    setText(value) {
      const nextLetters = sanitizeLetters(value);
      letters = nextLetters;
      rebuildLetters();
    },
    setAmount(value) {
      const nextAmount = round(constrain(Number(value) || 0, 0, 100));
      if (nextAmount === wrinkleAmount) return;
      wrinkleAmount = nextAmount;
      if (amountSlider) amountSlider.value(wrinkleAmount);
      if (amountLabel) amountLabel.html(`Wrinkle ${wrinkleAmount}`);
      redraw();
    },
    getText() {
      return letters.join("");
    },
    refreshLayout() {
      scheduleRebuild();
    },
    supported: SUPPORTED_LETTERS,
  };
}

function sanitizeLetters(value) {
  const cleaned = String(value || "")
    .toUpperCase()
    .split("")
    .filter((letter) => SUPPORTED_LETTERS.includes(letter) || letter === " " || letter === "\n");

  return cleaned.length ? cleaned : DEFAULT_LETTERS.slice();
}

function rebuildLetters() {
  buildGlyphs();
  buildWrinkleSystem();
  redraw();
}

function scheduleRebuild(delay = REBUILD_DELAY_MS) {
  window.clearTimeout(rebuildTimer);
  rebuildTimer = window.setTimeout(() => {
    rebuildLetters();
  }, delay);
}

function windowResized() {
  scheduleRebuild(80);
}

function syncLayoutMetrics() {
  const tester = document.querySelector(FONT_TESTER_SELECTOR);
  const computed = tester ? getComputedStyle(tester) : null;
  currentGlyphSize = computed
    ? Number.parseFloat(computed.fontSize) || GLYPH_SIZE
    : GLYPH_SIZE;
  currentLetterSpacing = computed
    ? Number.parseFloat(computed.letterSpacing) || 0
    : 0;
  currentLineHeight = computed
    ? Number.parseFloat(computed.lineHeight) || currentGlyphSize * 1.05
    : currentGlyphSize * 1.05;

  const { width: nextWidth, height: nextHeight } = getCanvasSize();
  if (width !== nextWidth || height !== nextHeight) {
    resizeCanvas(nextWidth, nextHeight);
  }
}

function getCanvasSize() {
  const host = wrinkleHostEl || document.querySelector(WRINKLE_HOST_SELECTOR);
  const rect = host?.getBoundingClientRect();

  return {
    width: max(1, floor(rect?.width || 1)),
    height: max(1, floor(rect?.height || 1)),
  };
}

function buildGlyphs() {
  syncLayoutMetrics();
  glyphs = [];
  wrinkleLayer = createGraphics(width, height);
  wrinkleLayer.pixelDensity(1);

  maskLayer = createGraphics(width, height);
  maskLayer.pixelDensity(1);
  maskLayer.background(0);
  maskLayer.fill(255);
  maskLayer.noStroke();
  maskLayer.textFont(oracleFont);
  maskLayer.textSize(currentGlyphSize);
  maskLayer.textAlign(LEFT, BASELINE);

  clipLayer = createGraphics(width, height);
  clipLayer.pixelDensity(1);
  clipLayer.clear();
  clipLayer.fill(255);
  clipLayer.noStroke();
  clipLayer.textFont(oracleFont);
  clipLayer.textSize(currentGlyphSize);
  clipLayer.textAlign(LEFT, BASELINE);
  textFont(oracleFont);
  textSize(currentGlyphSize);

  let cursorX = 0;
  let cursorY = 0;

  for (let i = 0; i < letters.length; i++) {
    const letter = letters[i];
    if (letter === "\n") {
      cursorX = 0;
      cursorY += currentLineHeight;
      continue;
    }

    if (letter === " ") {
      cursorX += currentGlyphSize * 0.55 + currentLetterSpacing;
      continue;
    }

    const bbox = oracleFont.textBounds(letter, 0, 0, currentGlyphSize);
    const advance = textWidth(letter);
    const layoutAdvance = getLayoutAdvance(bbox, advance);
    if (cursorX > 0 && cursorX + layoutAdvance > width) {
      cursorX = 0;
      cursorY += currentLineHeight;
    }

    if (cursorY > height) break;

    addGlyphFromBox(letter, cursorX, cursorY);
    cursorX += layoutAdvance;
  }

  maskLayer.loadPixels();
}

function getLayoutAdvance(bbox, advance) {
  return advance + currentLetterSpacing;
}

function addGlyphFromBox(letter, boxX, boxY) {
  const bbox = oracleFont.textBounds(letter, 0, 0, currentGlyphSize);
  const baselineX = boxX - bbox.x;
  const baselineY = boxY - bbox.y;
  const glyph = {
    letter,
    x: baselineX + bbox.x,
    y: baselineY + bbox.y,
    w: bbox.w,
    h: bbox.h,
    baselineX,
    baselineY,
    clip: {
      x: baselineX + bbox.x - 10,
      y: baselineY + bbox.y - 10,
      w: bbox.w + 20,
      h: bbox.h + 20,
    },
  };

  glyphs.push(glyph);
  maskLayer.text(letter, baselineX, baselineY);
  clipLayer.text(letter, baselineX, baselineY);
}

function buildWrinkleSystem() {
  randomSeed(42);
  noiseSeed(42);

  wrinkleSegments = [];

  for (const glyph of glyphs) {
    buildGlyphWrinkles(glyph);
  }

  wrinkleSegments.sort((a, b) => a.start - b.start);
}

function buildGlyphWrinkles(b) {
  const cacheKey = getWrinkleCacheKey(b);
  const cachedSegments = wrinkleGlyphCache.get(cacheKey);
  if (cachedSegments) {
    appendCachedGlyphWrinkles(cachedSegments, b);
    return;
  }

  const segmentStart = wrinkleSegments.length;
  const seed = getCacheSeed(cacheKey);
  randomSeed(seed);
  noiseSeed(seed);
  const skeleton = computeGlyphSkeleton(b);
  if (!skeleton) {
    wrinkleGlyphCache.set(cacheKey, []);
    return;
  }

  addScanlineCenterCreases(skeleton);
  addSkeletonCreases(skeleton);

  const markers = extractSkeletonMarkers(skeleton);
  const centerSamples = fpSample(skeleton.points, 18);
  const anchors = fpSample([...markers, ...centerSamples], 16);
  const fallback = fpSample(skeleton.points, 12);
  const nodes = anchors.length ? anchors : fallback;

  for (let i = 0; i < nodes.length; i++) {
    const p = nodes[i];
    const baseAngle = skeletonTangentAngle(skeleton, p.x, p.y);
    const angles = branchAnglesFromTangent(baseAngle);
    addBranchCluster({
      x: p.globalX,
      y: p.globalY,
      start: map(i, 0, max(1, nodes.length - 1), 0.08, 0.48),
      radius: max(b.w, b.h) * random(0.12, 0.22),
      angles,
      clip: b.clip,
    });
  }

  wrinkleGlyphCache.set(
    cacheKey,
    wrinkleSegments.slice(segmentStart).map((segment) => ({
      points: segment.points.map((point) => ({
        x: point.x - b.x,
        y: point.y - b.y,
      })),
      start: segment.start,
      end: segment.end,
      weight: segment.weight,
      kind: segment.kind,
      glyphSize: currentGlyphSize,
    }))
  );
}

function getWrinkleCacheKey(glyph) {
  return glyph.letter;
}

function getCacheSeed(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function appendCachedGlyphWrinkles(cachedSegments, glyph) {
  for (const segment of cachedSegments) {
    const scale = currentGlyphSize / (segment.glyphSize || GLYPH_SIZE);
    wrinkleSegments.push({
      points: segment.points.map((point) => ({
        x: glyph.x + point.x * scale,
        y: glyph.y + point.y * scale,
      })),
      start: segment.start,
      end: segment.end,
      weight: segment.weight,
      clip: glyph.clip,
      kind: segment.kind,
    });
  }
}

function drawGlyph() {
  noStroke();
  fill(16);
  textFont(oracleFont);
  textSize(currentGlyphSize);
  textAlign(LEFT, BASELINE);

  for (const glyph of glyphs) {
    text(glyph.letter, glyph.baselineX, glyph.baselineY);
  }
}

function drawWrinkleLayer(amount) {
  wrinkleLayer.clear();
  if (amount <= 0) return;

  wrinkleLayer.strokeCap(ROUND);
  wrinkleLayer.strokeJoin(ROUND);

  for (const segment of wrinkleSegments) {
    const local = smoothstep(segment.start, segment.end, amount);
    if (local <= 0) continue;
    drawPolylinePartialOnLayer(
      wrinkleLayer,
      segment,
      local,
      color(255),
      getWrinkleWeight(segment.weight)
    );
  }

  const ctx = wrinkleLayer.drawingContext;
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  wrinkleLayer.image(clipLayer, 0, 0);
  ctx.restore();

  image(wrinkleLayer, 0, 0);
}

function getWrinkleWeight(weight) {
  const sizeScale = max(1, currentGlyphSize / GLYPH_SIZE);
  return weight * 1.45 * WRINKLE_WEIGHT_MULTIPLIER * sizeScale;
}

function drawInterface() {
  noStroke();
  fill(20);
  textFont("system-ui");
  textSize(12);
  textAlign(CENTER, CENTER);
  text("0", width / 2 - 157, height - 31);
  text("100", width / 2 + 165, height - 31);
}

function makePolyline(anchors, stepsPerSegment, amp, phase) {
  const points = [];

  for (let i = 0; i < anchors.length - 1; i++) {
    const a = createVector(anchors[i][0], anchors[i][1]);
    const b = createVector(anchors[i + 1][0], anchors[i + 1][1]);
    const dir = p5.Vector.sub(b, a);
    const normal = createVector(-dir.y, dir.x).normalize();

    for (let s = 0; s < stepsPerSegment; s++) {
      const t = s / stepsPerSegment;
      const p = p5.Vector.lerp(a, b, t);
      const n = noise(p.x * 0.012 + phase * 10, p.y * 0.012 - phase * 7);
      const ripple = sin((t + phase) * TAU * 2.3) * 0.45;
      const offset = (n - 0.5 + ripple) * amp;
      points.push({ x: p.x + normal.x * offset, y: p.y + normal.y * offset });
    }
  }

  const last = anchors[anchors.length - 1];
  points.push({ x: last[0], y: last[1] });
  return points;
}

function addCrease(anchors, start, weight, amp, phase) {
  wrinkleSegments.push({
    points: makePolyline(anchors, 24, amp, phase),
    start,
    end: min(1, start + 0.32),
    weight,
  });
}

function computeGlyphSkeleton(glyph) {
  const pad = 8;
  const x0 = max(0, floor(glyph.x) - pad);
  const y0 = max(0, floor(glyph.y) - pad);
  const w = min(width - x0, ceil(glyph.w) + pad * 2);
  const h = min(height - y0, ceil(glyph.h) + pad * 2);
  if (w < 8 || h < 8) return null;

  const binary = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      binary[y * w + x] = pointInGlyph(x0 + x, y0 + y) ? 1 : 0;
    }
  }

  const skel = zhangSuen(binary, w, h);

  const points = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (!skel[y * w + x]) continue;
      points.push({ x, y, globalX: x0 + x, globalY: y0 + y });
    }
  }

  return { x0, y0, w, h, binary, skel, points, clip: glyph.clip };
}

function addSkeletonCreases(skeleton) {
  const { skel, w, h, x0, y0, clip } = skeleton;
  const used = new Set();
  const starts = extractSkeletonMarkers(skeleton);
  const allStarts = starts.length ? starts : fpSample(skeleton.points, 8);

  for (const start of allStarts) {
    const key = start.y * w + start.x;
    if (used.has(key)) continue;
    const path = walkSkeletonPath(skel, w, h, start.x, start.y, used, 160);
    if (path.length < 8) continue;

    const points = path.map((p) => ({ x: x0 + p.x, y: y0 + p.y }));
    wrinkleSegments.push({
      points: simplifyPolyline(points, 3),
      start: 0.02,
      end: 0.38,
      weight: 1.15,
      clip,
      kind: "center",
    });
  }
}

function addScanlineCenterCreases(skeleton) {
  const verticalStems = buildRunCenterPaths(skeleton, "row");
  const horizontalStems = buildRunCenterPaths(skeleton, "column");
  const paths = [...verticalStems, ...horizontalStems]
    .sort((a, b) => b.length - a.length)
    .slice(0, 18);

  for (const path of paths) {
    if (path.length < 5) continue;
    wrinkleSegments.push({
      points: smoothPath(path.map((p) => ({ x: skeleton.x0 + p.x, y: skeleton.y0 + p.y }))),
      start: 0.01,
      end: 0.34,
      weight: 1.25,
      clip: skeleton.clip,
      kind: "center",
    });
  }
}

function buildRunCenterPaths(skeleton, direction) {
  const { binary, w, h } = skeleton;
  const stride = 4;
  const minRun = max(14, floor(min(w, h) * 0.08));
  const maxJump = max(18, floor(max(w, h) * 0.16));
  let active = [];
  const finished = [];

  const majorLimit = direction === "row" ? h : w;
  const minorLimit = direction === "row" ? w : h;

  for (let major = 1; major < majorLimit - 1; major += stride) {
    const centers = [];
    let start = -1;

    for (let minor = 1; minor < minorLimit - 1; minor++) {
      const x = direction === "row" ? minor : major;
      const y = direction === "row" ? major : minor;
      const inside = binary[y * w + x] === 1;

      if (inside && start < 0) start = minor;
      if ((!inside || minor === minorLimit - 2) && start >= 0) {
        const end = inside && minor === minorLimit - 2 ? minor : minor - 1;
        if (end - start >= minRun) {
          const mid = (start + end) * 0.5;
          centers.push(direction === "row" ? { x: mid, y: major } : { x: major, y: mid });
        }
        start = -1;
      }
    }

    const nextActive = [];
    const used = new Set();

    for (const path of active) {
      const last = path[path.length - 1];
      let bestIndex = -1;
      let bestDistance = Infinity;

      for (let i = 0; i < centers.length; i++) {
        if (used.has(i)) continue;
        const d = dist(last.x, last.y, centers[i].x, centers[i].y);
        if (d < bestDistance) {
          bestDistance = d;
          bestIndex = i;
        }
      }

      if (bestIndex >= 0 && bestDistance <= maxJump) {
        used.add(bestIndex);
        path.push(centers[bestIndex]);
        nextActive.push(path);
      } else {
        finished.push(path);
      }
    }

    for (let i = 0; i < centers.length; i++) {
      if (!used.has(i)) nextActive.push([centers[i]]);
    }

    active = nextActive;
  }

  finished.push(...active);
  return finished.filter((path) => path.length >= 5);
}

function smoothPath(points) {
  if (points.length < 3) return points;
  let smoothed = points;

  for (let iter = 0; iter < 2; iter++) {
    const next = [smoothed[0]];
    for (let i = 1; i < smoothed.length - 1; i++) {
      const prev = smoothed[i - 1];
      const curr = smoothed[i];
      const after = smoothed[i + 1];
      next.push({
        x: prev.x * 0.25 + curr.x * 0.5 + after.x * 0.25,
        y: prev.y * 0.25 + curr.y * 0.5 + after.y * 0.25,
      });
    }
    next.push(smoothed[smoothed.length - 1]);
    smoothed = next;
  }

  return smoothed;
}

function extractSkeletonMarkers(skeleton) {
  const { skel, w, h, x0, y0 } = skeleton;
  const endpoints = [];
  const others = [];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (!skel[y * w + x]) continue;
      const nbrs = skeletonNeighbors(skel, w, h, x, y);

      if (nbrs.length === 1) {
        endpoints.push({ x, y, globalX: x0 + x, globalY: y0 + y });
      } else if (nbrs.length >= 3) {
        others.push({ x, y, globalX: x0 + x, globalY: y0 + y });
      } else if (nbrs.length === 2) {
        const a = walkSkeletonDirection(skel, w, h, nbrs[0], { x, y }, 4);
        const b = walkSkeletonDirection(skel, w, h, nbrs[1], { x, y }, 4);
        const v1x = a.x - x;
        const v1y = a.y - y;
        const v2x = b.x - x;
        const v2y = b.y - y;
        const dot = v1x * v2x + v1y * v2y;
        const len = sqrt((v1x * v1x + v1y * v1y) * (v2x * v2x + v2y * v2y));
        if (len > 0 && dot / len > -0.45) {
          others.push({ x, y, globalX: x0 + x, globalY: y0 + y });
        }
      }
    }
  }

  return [...endpoints, ...fpSample(others, max(0, 10 - endpoints.length))];
}

function skeletonNeighbors(skel, w, h, x, y) {
  const nbrs = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (skel[ny * w + nx]) nbrs.push({ x: nx, y: ny });
    }
  }
  return nbrs;
}

function walkSkeletonDirection(skel, w, h, start, from, steps) {
  let current = { x: start.x, y: start.y };
  let previous = { x: from.x, y: from.y };

  for (let i = 0; i < steps; i++) {
    const nexts = skeletonNeighbors(skel, w, h, current.x, current.y)
      .filter((p) => p.x !== previous.x || p.y !== previous.y);
    if (!nexts.length) break;
    previous = current;
    current = nexts[0];
  }

  return current;
}

function walkSkeletonPath(skel, w, h, sx, sy, used, maxSteps) {
  const path = [{ x: sx, y: sy }];
  let current = { x: sx, y: sy };
  let previous = null;

  for (let i = 0; i < maxSteps; i++) {
    used.add(current.y * w + current.x);
    const nexts = skeletonNeighbors(skel, w, h, current.x, current.y)
      .filter((p) => !previous || p.x !== previous.x || p.y !== previous.y)
      .filter((p) => !used.has(p.y * w + p.x));

    if (!nexts.length) break;

    let next = nexts[0];
    if (previous && nexts.length > 1) {
      const vx = current.x - previous.x;
      const vy = current.y - previous.y;
      let best = -Infinity;
      for (const candidate of nexts) {
        const score = vx * (candidate.x - current.x) + vy * (candidate.y - current.y);
        if (score > best) {
          best = score;
          next = candidate;
        }
      }
    }

    previous = current;
    current = next;
    path.push(current);
  }

  return path;
}

function skeletonTangentAngle(skeleton, x, y) {
  const nbrs = skeletonNeighbors(skeleton.skel, skeleton.w, skeleton.h, x, y);
  if (nbrs.length < 1) return random(TAU);
  const a = nbrs[0];
  const b = nbrs[nbrs.length - 1];
  return atan2(b.y - a.y, b.x - a.x);
}

function branchAnglesFromTangent(angle) {
  const normal = angle + HALF_PI;
  return [
    degrees(normal - 0.9),
    degrees(normal - 0.35),
    degrees(normal + 0.35),
    degrees(normal + 0.9),
    degrees(angle - 0.55),
    degrees(angle + PI + 0.55),
  ];
}

function simplifyPolyline(points, step) {
  const out = [];
  for (let i = 0; i < points.length; i += step) {
    out.push(points[i]);
  }
  if (points.length && out[out.length - 1] !== points[points.length - 1]) {
    out.push(points[points.length - 1]);
  }
  return out;
}

function fpSample(pts, n) {
  if (pts.length <= n) return pts.slice();
  const selected = [0];
  const minDist = new Array(pts.length).fill(Infinity);

  for (let i = 0; i < pts.length; i++) {
    minDist[i] = sq(pts[i].x - pts[0].x) + sq(pts[i].y - pts[0].y);
  }

  while (selected.length < n) {
    let bestI = -1;
    let bestD = -1;
    for (let i = 0; i < pts.length; i++) {
      if (selected.includes(i)) continue;
      if (minDist[i] > bestD) {
        bestD = minDist[i];
        bestI = i;
      }
    }
    if (bestI < 0) break;
    selected.push(bestI);
    for (let i = 0; i < pts.length; i++) {
      const d = sq(pts[i].x - pts[bestI].x) + sq(pts[i].y - pts[bestI].y);
      minDist[i] = min(minDist[i], d);
    }
  }

  return selected.map((i) => pts[i]);
}

function pruneTinySkeletonEnds(skel, binary, w, h) {
  const result = new Uint8Array(skel);
  const maxPrune = 5;

  for (let pass = 0; pass < maxPrune; pass++) {
    const remove = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!result[i]) continue;
        const nbrs = skeletonNeighbors(result, w, h, x, y);
        if (nbrs.length !== 1) continue;
        if (edgeDistance(binary, w, h, x, y, 2)) remove.push(i);
      }
    }
    if (!remove.length) break;
    for (const i of remove) result[i] = 0;
  }

  return result;
}

function edgeDistance(binary, w, h, x, y, radius) {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (!binary[ny * w + nx]) return true;
    }
  }
  return false;
}

function addBranchCluster(node) {
  const angleJitter = 10;
  const origin = nearestGlyphPoint(node.x, node.y, node.radius, node.clip);

  for (let i = 0; i < node.angles.length; i++) {
    const angle = radians(node.angles[i] + random(-angleJitter, angleJitter));
    const length = node.radius * random(0.42, 0.95);
    const branch = makeBranch(origin.x, origin.y, angle, length, 8, random(100));
    const start = node.start + i * 0.018 + random(0.02);

    wrinkleSegments.push({
      points: branch,
      start,
      end: min(1, start + random(0.28, 0.46)),
      weight: random(0.55, 1.15),
      clip: node.clip,
      kind: "branch",
    });

    const splitCount = floor(random(1, 4));
    for (let s = 0; s < splitCount; s++) {
      const splitIndex = floor(random(branch.length * 0.35, branch.length * 0.82));
      const splitPoint = branch[splitIndex];
      const splitAngle = angle + radians(random([-1, 1]) * random(28, 64));
      const splitLength = length * random(0.22, 0.42);

      wrinkleSegments.push({
        points: makeBranch(splitPoint.x, splitPoint.y, splitAngle, splitLength, 6, random(100)),
        start: start + random(0.08, 0.18),
        end: min(1, start + random(0.32, 0.52)),
        weight: random(0.35, 0.75),
        clip: node.clip,
        kind: "branch",
      });
    }
  }
}

function makeBranch(x, y, angle, length, steps, phase) {
  const points = [];
  const normal = createVector(cos(angle + HALF_PI), sin(angle + HALF_PI));
  const direction = createVector(cos(angle), sin(angle));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const taper = sin(t * PI);
    const wander = (noise(phase + t * 2.8, x * 0.005, y * 0.005) - 0.5) * length * 0.2 * taper;
    const wave = sin((t + phase) * TAU * 1.7) * length * 0.035 * taper;
    points.push({
      x: x + direction.x * length * t + normal.x * (wander + wave),
      y: y + direction.y * length * t + normal.y * (wander + wave),
    });
  }

  return points;
}

function drawMaskedPolyline(points, strokeColor, weight, dx = 0, dy = 0) {
  stroke(strokeColor);
  strokeWeight(weight);

  let drawing = false;
  for (let i = 0; i < points.length - 1; i++) {
    const a = { x: points[i].x + dx, y: points[i].y + dy };
    const b = { x: points[i + 1].x + dx, y: points[i + 1].y + dy };
    const inside = pointInGlyph(a.x, a.y) && pointInGlyph(b.x, b.y);

    if (inside && !drawing) {
      beginShape();
      vertex(a.x, a.y);
      drawing = true;
    }

    if (inside) {
      vertex(b.x, b.y);
    } else if (drawing) {
      endShape();
      drawing = false;
    }
  }

  if (drawing) endShape();
}

function drawMaskedPolylinePartial(segment, progress, strokeColor, weight) {
  const points = segment.points;
  const maxIndex = max(1, floor((points.length - 1) * progress));
  stroke(strokeColor);
  strokeWeight(weight);

  let drawing = false;
  for (let i = 0; i < maxIndex; i++) {
    const a = points[i];
    const b = points[i + 1];
    const margin = segment.kind === "center" ? 8 : 12;
    const inside = segmentInGlyphInterior(a, b, segment.clip, margin + weight * 0.5);

    if (inside && !drawing) {
      beginShape();
      vertex(a.x, a.y);
      drawing = true;
    }

    if (inside) {
      vertex(b.x, b.y);
    } else if (drawing) {
      endShape();
      drawing = false;
    }
  }

  if (drawing) endShape();
}

function drawPolylinePartialOnLayer(g, segment, progress, strokeColor, weight) {
  const points = segment.points;
  const maxIndex = max(1, floor((points.length - 1) * progress));
  g.stroke(strokeColor);
  g.strokeWeight(weight);
  g.noFill();

  g.beginShape();
  for (let i = 0; i <= maxIndex; i++) {
    const p = points[i];
    g.vertex(p.x, p.y);
  }
  g.endShape();
}

function pointInGlyph(x, y, clip) {
  if (clip && !pointInClip(x, y, clip)) return false;
  const ix = floor(constrain(x, 0, width - 1));
  const iy = floor(constrain(y, 0, height - 1));
  const idx = 4 * (iy * width + ix);
  return maskLayer.pixels[idx] > 10;
}

function pointInGlyphStrict(x, y, clip) {
  if (clip && !pointInClip(x, y, clip)) return false;
  const ix = floor(constrain(x, 0, width - 1));
  const iy = floor(constrain(y, 0, height - 1));
  const idx = 4 * (iy * width + ix);
  return maskLayer.pixels[idx] > 220;
}

function segmentInGlyphInterior(a, b, clip, margin) {
  const length = dist(a.x, a.y, b.x, b.y);
  const steps = max(2, ceil(length / 2));

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = lerp(a.x, b.x, t);
    const y = lerp(a.y, b.y, t);
    if (!pointInGlyphInterior(x, y, clip, margin)) return false;
  }

  return true;
}

function pointInGlyphInterior(x, y, clip, margin) {
  if (!pointInGlyphStrict(x, y, clip)) return false;

  for (let dy = -margin; dy <= margin; dy++) {
    for (let dx = -margin; dx <= margin; dx++) {
      if (dx * dx + dy * dy > margin * margin) continue;
      if (!pointInGlyphStrict(x + dx, y + dy, clip)) return false;
    }
  }

  return true;
}

function pointInClip(x, y, clip) {
  return x >= clip.x && x <= clip.x + clip.w && y >= clip.y && y <= clip.y + clip.h;
}

function nearestGlyphPoint(x, y, radius, clip) {
  if (pointInGlyph(x, y, clip)) return { x, y };

  for (let r = 4; r <= radius; r += 4) {
    for (let a = 0; a < 360; a += 24) {
      const px = x + cos(radians(a)) * r;
      const py = y + sin(radians(a)) * r;
      if (pointInGlyph(px, py, clip)) {
        return { x: px, y: py };
      }
    }
  }

  return { x, y };
}

function zhangSuen(src, w, h) {
  const p = new Uint8Array(src);

  function neighbors(x, y) {
    return [
      p[(y - 1) * w + x],
      p[(y - 1) * w + (x + 1)],
      p[y * w + (x + 1)],
      p[(y + 1) * w + (x + 1)],
      p[(y + 1) * w + x],
      p[(y + 1) * w + (x - 1)],
      p[y * w + (x - 1)],
      p[(y - 1) * w + (x - 1)],
    ];
  }

  function transitions(nb) {
    let count = 0;
    for (let i = 0; i < 8; i++) {
      if (nb[i] === 0 && nb[(i + 1) % 8] === 1) count++;
    }
    return count;
  }

  let changed = true;
  while (changed) {
    changed = false;

    const del1 = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (!p[y * w + x]) continue;
        const nb = neighbors(x, y);
        const b = nb.reduce((sum, value) => sum + value, 0);
        if (b < 2 || b > 6) continue;
        if (transitions(nb) !== 1) continue;
        const [p2, , p4, , p6, , p8] = nb;
        if (p2 * p4 * p6 !== 0) continue;
        if (p4 * p6 * p8 !== 0) continue;
        del1.push(y * w + x);
      }
    }
    if (del1.length) {
      for (const i of del1) p[i] = 0;
      changed = true;
    }

    const del2 = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (!p[y * w + x]) continue;
        const nb = neighbors(x, y);
        const b = nb.reduce((sum, value) => sum + value, 0);
        if (b < 2 || b > 6) continue;
        if (transitions(nb) !== 1) continue;
        const [p2, , p4, , p6, , p8] = nb;
        if (p2 * p4 * p8 !== 0) continue;
        if (p2 * p6 * p8 !== 0) continue;
        del2.push(y * w + x);
      }
    }
    if (del2.length) {
      for (const i of del2) p[i] = 0;
      changed = true;
    }
  }

  return p;
}

function smoothstep(edge0, edge1, x) {
  const t = constrain((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
