const ageYearsEl = document.querySelector("#age-years");
const resultNameEl = document.querySelector("#result-name");
const ageDaysEl = document.querySelector("#age-days");
const ageHoursEl = document.querySelector("#age-hours");
const ageSecondsEl = document.querySelector("#age-seconds");
const ageSecondDecimalsEl = document.querySelector("#age-second-decimals");
const fontTesterEl = document.querySelector(".font-tester");
const fontTesterMaskEl = document.querySelector(".font-tester-mask");
const scaleSliderEl = document.querySelector(".scale-slider");
const speedSliderEl = document.querySelector(".speed-slider");
const youngerActionEls = document.querySelectorAll(".younger-action");
const rebirthActionEl = document.querySelector(".rebirth-action");
const thesisActionEl = document.querySelector(".thesis-action");
const printActionEl = document.querySelector(".download");
const youngerTotalCostEl = document.querySelector("#younger-total-cost");
const agingOptionEls = document.querySelectorAll(".aging-option");
const inactivityRefreshMs = 3 * 60 * 1000;
let inactivityRefreshTimer = 0;

function resetInactivityRefreshTimer() {
  window.clearTimeout(inactivityRefreshTimer);
  inactivityRefreshTimer = window.setTimeout(() => {
    window.location.reload();
  }, inactivityRefreshMs);
}

["click", "input", "keydown", "pointerdown"].forEach((eventName) => {
  window.addEventListener(eventName, resetInactivityRefreshTimer, { passive: true });
});
resetInactivityRefreshTimer();

const shouldShowResult = sessionStorage.getItem("showResult") === "true";
sessionStorage.removeItem("showResult");

const measuredName = localStorage.getItem("measuredName");
const measuredAge = Number.parseFloat(localStorage.getItem("measuredAge") || "");

if (!shouldShowResult || !Number.isFinite(measuredAge)) {
  localStorage.removeItem("measuredName");
  localStorage.removeItem("measuredAge");
  window.location.replace("main.html");
}

if (measuredName !== null && resultNameEl) {
  resultNameEl.innerHTML = measuredName || "&nbsp;";
}

if (Number.isFinite(measuredAge) && ageYearsEl) {
  ageYearsEl.textContent = `${measuredAge}y/o`;
}

const ageYears = Number.parseFloat(ageYearsEl?.textContent || "55") || 55;
const initialAgeSeconds = ageYears * 365.2425 * 24 * 60 * 60;
const yearSeconds = 365.2425 * 24 * 60 * 60;
let acceleratedSeconds = 0;
let ageOffsetSeconds = 0;
let lastClockTimestamp = performance.now();
let timeSpeed = 1;
let currentAgeYears = ageYears;
let activeAgingFont = "skin";
let totalCost = 0;
let lastFontAgingValue = null;
let lastWrinkleAmount = null;
let lastRoughScaleValue = null;
let lastRough2AgeBucket = null;
let lastRough2Key = "";
let lastRoughScaleTimestamp = 0;
let lastClockDisplayTimestamp = 0;
let lastAgingEffectTimestamp = 0;
let lastAgeDisplayKey = "";
let lastMaskClassKey = "";
let wrinkleTextUpdateTimer = 0;
let activeTextUpdateTimer = 0;
let roughCanvasUpdateTimer = 0;
let isPrintPending = false;
let isPrintDialogPending = false;
let lastPrintDialogTimestamp = -Infinity;
let mathmaticFont = null;
const mathmaticGlyphCache = new Map();
const printImagePaths = Array.from(
  { length: 25 },
  (_, index) => `libraries/1/${index + 1}.png`
);
const printImageCache = new Map();
const maxTimeSpeed = yearSeconds * 2;
const roughScaleFrameMs = 320;
const clockDisplayFrameMs = 33;
const agingEffectFrameMs = 180;
const canvasRenderScale = 1;
const printDialogCooldownMs = 10000;
const agingFonts = {
  wrinkle: {
    axisMax: 100,
  },
  hunched: {
    axisMax: 500,
  },
  skin: {
    axisMax: 50,
  },
  rough: {
    axisMax: 80,
  },
  rough2: {
    axisMax: 1,
  },
};
const wipTextLayerEl = document.createElement("div");
const roughCanvasEl = document.createElement("canvas");

wipTextLayerEl.className = "wip-text-layer";
roughCanvasEl.className = "rough-canvas";
fontTesterMaskEl?.append(wipTextLayerEl);
fontTesterMaskEl?.append(roughCanvasEl);

if (window.p5) {
  new p5((p) => {
    p.preload = () => {
      mathmaticFont = p.loadFont("mathmatic/libraries/ABCOracle-Bold.otf");
    };

    p.setup = () => {
      p.noCanvas();
      lastRough2Key = "";
      if (activeAgingFont === "rough2") {
        drawRoughCanvas();
      }
    };
  });
}

preloadPrintImages();

function setAgingAxis(ageValue) {
  if (isDeathAge(ageValue)) {
    updateWipTextLayer();
    return;
  }

  const activeFont = agingFonts[activeAgingFont] || agingFonts.skin;
  const axisMax = activeFont.axisMax;
  const maxAge = activeFont.maxAge || 90;
  const axisValue = Math.min(
    axisMax,
    Math.max(0, ((ageValue - 20) / (maxAge - 20)) * axisMax)
  );
  if (activeAgingFont === "wrinkle") {
    const nextWrinkleAmount = Math.round(axisValue);
    if (nextWrinkleAmount !== lastWrinkleAmount) {
      lastWrinkleAmount = nextWrinkleAmount;
      updateWrinkleFrame(null, nextWrinkleAmount);
    }
    return;
  }

  if (activeAgingFont === "rough2") {
    const nextRough2AgeBucket = Math.round(ageValue * 2);
    if (nextRough2AgeBucket !== lastRough2AgeBucket) {
      lastRough2AgeBucket = nextRough2AgeBucket;
      drawRoughCanvas();
    }
    return;
  }

  if (!isRoughFont()) {
    const nextFontAgingValue = axisValue.toFixed(2);

    if (nextFontAgingValue !== lastFontAgingValue) {
      document.documentElement.style.setProperty("--font-aging", nextFontAgingValue);
      lastFontAgingValue = nextFontAgingValue;
    }

    return;
  }

  const now = performance.now();
  const nextRoughScaleValue = Math.round(axisValue / 4) * 4;
  if (
    nextRoughScaleValue !== lastRoughScaleValue &&
    now - lastRoughScaleTimestamp >= roughScaleFrameMs
  ) {
    lastRoughScaleValue = nextRoughScaleValue;
    lastRoughScaleTimestamp = now;
    drawRoughCanvas(nextRoughScaleValue);
  }
}

function isRoughFont() {
  return activeAgingFont === "rough" || activeAgingFont === "rough2";
}

function isDeathAge(ageValue = currentAgeYears) {
  return ageValue >= 100;
}

function updateFontMaskClasses(ageValue = currentAgeYears) {
  const showWip = isDeathAge(ageValue);

  if (showWip) updateWipTextLayer();

  fontTesterMaskEl?.classList.toggle("is-wrinkle", activeAgingFont === "wrinkle" && !showWip);
  fontTesterMaskEl?.classList.toggle("is-rough", isRoughFont() && !showWip);
  fontTesterMaskEl?.classList.toggle("is-wip", showWip);
}

function selectAgingFont(fontName) {
  if (!agingFonts[fontName] || !fontTesterEl) return;

  activeAgingFont = fontName;
  fontTesterEl.dataset.agingFont = fontName;
  lastRoughScaleTimestamp = 0;
  lastWrinkleAmount = null;
  lastRough2AgeBucket = null;
  lastMaskClassKey = "";
  lastRough2Key = "";

  agingOptionEls.forEach((option) => {
    const isActive = option.dataset.agingFont === fontName;
    option.classList.toggle("is-active", isActive);
    option.setAttribute("aria-pressed", String(isActive));
    option.querySelector(".purple-dot")?.classList.toggle("is-hidden", !isActive);
  });

  updateFontMaskClasses();
  setAgingAxis(currentAgeYears);
  updateWrinkleText();
}

selectAgingFont(activeAgingFont);

function formatCount(value) {
  return Math.floor(value).toLocaleString("en-US");
}

function updateWipTextLayer() {
  if (!fontTesterEl || !wipTextLayerEl) return;

  const text = fontTesterEl.textContent || "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const fragment = document.createDocumentFragment();

  [...text].forEach((character) => {
    if (character === "\n") {
      fragment.append(document.createElement("br"));
      return;
    }

    if (character === " ") {
      const space = document.createElement("span");
      space.className = "wip-space";
      fragment.append(space);
      return;
    }

    const image = document.createElement("img");
    image.src = "libraries/wip.svg";
    image.alt = "";
    fragment.append(image);
  });

  wipTextLayerEl.replaceChildren(fragment);
}

function drawRoughCanvas(scale = lastRoughScaleValue || 0) {
  if (!fontTesterEl || !fontTesterMaskEl || !roughCanvasEl) return;
  if (activeAgingFont === "rough2") {
    drawMathmaticRoughCanvas();
    return;
  }

  const rect = roughCanvasEl.getBoundingClientRect();
  const fallbackRect = fontTesterMaskEl.getBoundingClientRect();
  const renderScale = canvasRenderScale;
  const canvasWidth = Math.max(1, Math.round((rect.width || fallbackRect.width) * renderScale));
  const canvasHeight = Math.max(1, Math.round((rect.height || fallbackRect.height) * renderScale));

  if (roughCanvasEl.width !== canvasWidth || roughCanvasEl.height !== canvasHeight) {
    roughCanvasEl.width = canvasWidth;
    roughCanvasEl.height = canvasHeight;
  }

  const computed = getComputedStyle(fontTesterEl);
  const rawFontSize = Number.parseFloat(computed.fontSize) || 172;
  const fontSize = rawFontSize * renderScale;
  const letterSpacing = (Number.parseFloat(computed.letterSpacing) || 0) * renderScale;
  const lineHeight =
    (Number.parseFloat(computed.lineHeight) || rawFontSize * 1.05) * renderScale;
  const text = fontTesterEl.textContent || "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const source = document.createElement("canvas");
  const sourceContext = source.getContext("2d");
  const targetContext = roughCanvasEl.getContext("2d");

  source.width = canvasWidth;
  source.height = canvasHeight;
  sourceContext.clearRect(0, 0, canvasWidth, canvasHeight);
  sourceContext.imageSmoothingEnabled = true;
  sourceContext.fillStyle = "#000";
  sourceContext.textAlign = "left";
  sourceContext.textBaseline = "alphabetic";
  sourceContext.font = `700 ${fontSize}px "ABC Oracle Bold", "ABC Oracle Triple", monospace`;

  const metrics = sourceContext.measureText("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  const baselineOffset = metrics.actualBoundingBoxAscent || fontSize * 0.78;
  let cursorX = 0;
  let cursorY = baselineOffset;

  for (const character of text) {
    if (character === "\n") {
      cursorX = 0;
      cursorY += lineHeight;
      continue;
    }

    const advance = character === " " ? fontSize * 0.55 : sourceContext.measureText(character).width;
    if (cursorX > 0 && cursorX + advance > canvasWidth) {
      cursorX = 0;
      cursorY += lineHeight;
    }
    if (cursorY - baselineOffset > canvasHeight) break;

    if (character !== " ") {
      sourceContext.fillText(character, cursorX, cursorY);
    }
    cursorX += advance + letterSpacing;
  }

  targetContext.clearRect(0, 0, canvasWidth, canvasHeight);
  targetContext.imageSmoothingEnabled = true;
  const stripHeight = 1;
  const strength = Math.max(0, scale) * 0.22 * renderScale;

  for (let y = 0; y < canvasHeight; y += stripHeight) {
    const rough =
      smoothNoise(y * 0.045, 17) * 0.55 +
      smoothNoise(y * 0.13, 93) * 0.3 +
      smoothNoise(y * 0.31, 211) * 0.15;
    const dx = rough * strength;
    targetContext.drawImage(
      source,
      0,
      y,
      canvasWidth,
      stripHeight,
      dx,
      y,
      canvasWidth,
      stripHeight
    );
  }
}

function scheduleRoughCanvasUpdate(delay = 90) {
  window.clearTimeout(roughCanvasUpdateTimer);
  roughCanvasUpdateTimer = window.setTimeout(() => {
    drawRoughCanvas();
  }, delay);
}

function smoothNoise(value, seed) {
  const base = Math.floor(value);
  const t = value - base;
  const eased = t * t * (3 - 2 * t);
  return lerpNoise(randomUnit(base, seed), randomUnit(base + 1, seed), eased) * 2 - 1;
}

function randomUnit(value, seed) {
  const x = Math.sin(value * 127.1 + seed * 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

function lerpNoise(a, b, t) {
  return a + (b - a) * t;
}

function drawMathmaticRoughCanvas() {
  if (!fontTesterEl || !fontTesterMaskEl || !roughCanvasEl) return;

  const rect = roughCanvasEl.getBoundingClientRect();
  const fallbackRect = fontTesterMaskEl.getBoundingClientRect();
  const renderScale = canvasRenderScale;
  const canvasWidth = Math.max(1, Math.round((rect.width || fallbackRect.width) * renderScale));
  const canvasHeight = Math.max(1, Math.round((rect.height || fallbackRect.height) * renderScale));

  if (roughCanvasEl.width !== canvasWidth || roughCanvasEl.height !== canvasHeight) {
    roughCanvasEl.width = canvasWidth;
    roughCanvasEl.height = canvasHeight;
  }

  const context = roughCanvasEl.getContext("2d");
  if (!mathmaticFont) {
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    lastRough2Key = "";
    return;
  }

  const computed = getComputedStyle(fontTesterEl);
  const rawFontSize = Number.parseFloat(computed.fontSize) || 172;
  const fontSize = rawFontSize * renderScale;
  const sizeProgress = rawFontSize / 172;
  const ageProgress = clamp01((currentAgeYears - 20) / 70);
  const amp = (1 + ageProgress * 22) * sizeProgress * renderScale;
  const harmonics = 1 + Math.round(ageProgress * 7);
  const freq = 1;
  const text = fontTesterEl.textContent || "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const key = [
    canvasWidth,
    canvasHeight,
    text,
    Math.round(currentAgeYears * 10),
    rawFontSize.toFixed(2),
  ].join("|");

  if (key === lastRough2Key) return;
  lastRough2Key = key;

  const letterSpacing = (Number.parseFloat(computed.letterSpacing) || 0) * renderScale;
  const lineHeight =
    (Number.parseFloat(computed.lineHeight) || rawFontSize * 1.05) * renderScale;
  const metrics = mathmaticFont.textBounds("ABCDEFGHIJKLMNOPQRSTUVWXYZ", 0, 0, fontSize);
  const baselineOffset = -metrics.y || fontSize * 0.78;
  let cursorX = 0;
  let cursorY = baselineOffset;

  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.fillStyle = "#000";

  for (const character of text) {
    if (character === "\n") {
      cursorX = 0;
      cursorY += lineHeight;
      continue;
    }

    const advance = character === " " ? fontSize * 0.55 : mathmaticFont.textBounds(character, 0, 0, fontSize).w;
    if (cursorX > 0 && cursorX + advance > canvasWidth) {
      cursorX = 0;
      cursorY += lineHeight;
    }
    if (cursorY - baselineOffset > canvasHeight) break;

    if (character !== " ") {
      drawMathmaticGlyph(context, character, cursorX, cursorY, fontSize, amp, harmonics, freq);
    }
    cursorX += advance + letterSpacing;
  }
}

function drawMathmaticGlyph(context, character, x, baselineY, fontSize, amp, harmonics, freq) {
  const paths = getMathmaticGlyphPaths(character, fontSize);
  if (!paths.length) return;

  context.beginPath();
  for (const contour of paths) {
    const positioned = contour.map((point) => ({
      x: point.x + x,
      y: point.y + baselineY,
    }));
    const deformed = deformContour(positioned, amp, harmonics, freq);
    if (deformed.length < 2) continue;
    context.moveTo(deformed[0].x, deformed[0].y);
    for (let i = 1; i < deformed.length; i++) {
      context.lineTo(deformed[i].x, deformed[i].y);
    }
    context.closePath();
  }
  context.fill("evenodd");
}

function getMathmaticGlyphPaths(character, fontSize) {
  const cacheKey = `${character}|${Math.round(fontSize * 100)}`;
  const cached = mathmaticGlyphCache.get(cacheKey);
  if (cached) return cached;

  const rawPaths = mathmaticFont.font.getPaths
    ? mathmaticFont.font.getPaths(character, 0, 0, fontSize)
    : [mathmaticFont.font.getPath(character, 0, 0, fontSize)];
  const contours = [];

  for (const rawPath of rawPaths) {
    let current = [];
    for (const cmd of rawPath.commands) {
      if (cmd.type === "M") {
        if (current.length > 1) contours.push(current);
        current = [{ x: cmd.x, y: cmd.y }];
      } else if (cmd.type === "L") {
        appendLinePoints(current, { x: cmd.x, y: cmd.y });
      } else if (cmd.type === "C") {
        appendCubicPoints(current, cmd);
      } else if (cmd.type === "Q") {
        appendQuadraticPoints(current, cmd);
      } else if (cmd.type === "Z") {
        closeContour(current, contours);
        current = [];
      }
    }
    closeContour(current, contours);
  }

  mathmaticGlyphCache.set(cacheKey, contours);
  return contours;
}

function appendLinePoints(points, target) {
  if (!points.length) return;
  const start = points[points.length - 1];
  const distance = Math.hypot(target.x - start.x, target.y - start.y);
  const steps = Math.max(2, Math.ceil(distance / 5));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    points.push({
      x: start.x + (target.x - start.x) * t,
      y: start.y + (target.y - start.y) * t,
    });
  }
}

function appendCubicPoints(points, cmd) {
  if (!points.length) return;
  const start = points[points.length - 1];
  const approxLength =
    Math.hypot(cmd.x1 - start.x, cmd.y1 - start.y) +
    Math.hypot(cmd.x2 - cmd.x1, cmd.y2 - cmd.y1) +
    Math.hypot(cmd.x - cmd.x2, cmd.y - cmd.y2);
  const steps = Math.max(8, Math.ceil(approxLength / 5));

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const m = 1 - t;
    points.push({
      x:
        m * m * m * start.x +
        3 * m * m * t * cmd.x1 +
        3 * m * t * t * cmd.x2 +
        t * t * t * cmd.x,
      y:
        m * m * m * start.y +
        3 * m * m * t * cmd.y1 +
        3 * m * t * t * cmd.y2 +
        t * t * t * cmd.y,
    });
  }
}

function appendQuadraticPoints(points, cmd) {
  if (!points.length) return;
  const start = points[points.length - 1];
  const approxLength =
    Math.hypot(cmd.x1 - start.x, cmd.y1 - start.y) +
    Math.hypot(cmd.x - cmd.x1, cmd.y - cmd.y1);
  const steps = Math.max(6, Math.ceil(approxLength / 5));

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const m = 1 - t;
    points.push({
      x: m * m * start.x + 2 * m * t * cmd.x1 + t * t * cmd.x,
      y: m * m * start.y + 2 * m * t * cmd.y1 + t * t * cmd.y,
    });
  }
}

function closeContour(points, contours) {
  if (points.length <= 1) return;
  const first = points[0];
  const last = points[points.length - 1];
  if (first.x !== last.x || first.y !== last.y) {
    appendLinePoints(points, first);
  }
  contours.push(points);
}

function deformContour(contour, amp, harmonics, freq) {
  const n = contour.length;
  if (n < 3) return contour;

  let area = 0;
  const arcLengths = [0];
  for (let i = 0; i < n; i++) {
    const next = contour[(i + 1) % n];
    area += contour[i].x * next.y - next.x * contour[i].y;
    if (i > 0) {
      arcLengths.push(
        arcLengths[i - 1] + Math.hypot(contour[i].x - contour[i - 1].x, contour[i].y - contour[i - 1].y)
      );
    }
  }

  const clockwise = area > 0;
  const periodPx = 75 / freq;

  return contour.map((point, i) => {
    const prev = contour[(i - 1 + n) % n];
    const next = contour[(i + 1) % n];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const length = Math.hypot(tx, ty);
    if (length < 0.001) return point;

    const angle = (arcLengths[i] / periodPx) * Math.PI * 2;
    const d = oddFourier(angle, amp, harmonics);
    const nx = clockwise ? ty / length : -ty / length;
    const ny = clockwise ? -tx / length : tx / length;

    return {
      x: point.x + nx * d,
      y: point.y + ny * d,
    };
  });
}

function oddFourier(angle, amp, harmonics) {
  let value = 0;
  for (let k = 1; k <= harmonics; k++) {
    const harmonic = 2 * k + 1;
    value += Math.sin(harmonic * angle) / harmonic;
  }
  return amp * value;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function updateWrinkleFrame(textValue, amountValue) {
  const wrinkleApi = window.WrinkleLetters;
  if (!wrinkleApi) return;

  if (textValue !== null) {
    wrinkleApi.setText(textValue || "ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  }

  if (amountValue !== null) {
    wrinkleApi.setAmount(amountValue);
  }
}

function updateWrinkleText() {
  if (activeAgingFont !== "wrinkle") return;
  if (isDeathAge()) {
    updateWipTextLayer();
    return;
  }
  updateWrinkleFrame(fontTesterEl?.textContent || "ABCDEFGHIJKLMNOPQRSTUVWXYZ", null);
}

function scheduleWrinkleTextUpdate(delay = 0) {
  if (activeAgingFont !== "wrinkle") return;
  window.clearTimeout(wrinkleTextUpdateTimer);
  wrinkleTextUpdateTimer = window.setTimeout(updateWrinkleText, delay);
}

function scheduleActiveTextLayerUpdate(delay = 90) {
  window.clearTimeout(activeTextUpdateTimer);
  activeTextUpdateTimer = window.setTimeout(updateActiveTextLayer, delay);
}

function updateActiveTextLayer() {
  if (isDeathAge()) {
    updateWipTextLayer();
    return;
  }

  if (activeAgingFont === "wrinkle") {
    scheduleWrinkleTextUpdate();
    return;
  }

  if (isRoughFont()) {
    drawRoughCanvas();
    return;
  }

  updateWipTextLayer();
}

function updateAgeClock(now) {
  const deltaSeconds = Math.max(0, (now - lastClockTimestamp) / 1000);
  acceleratedSeconds += deltaSeconds * timeSpeed;
  lastClockTimestamp = now;

  const totalSeconds = Math.max(0, initialAgeSeconds + acceleratedSeconds + ageOffsetSeconds);
  currentAgeYears = totalSeconds / yearSeconds;

  if (now - lastClockDisplayTimestamp >= clockDisplayFrameMs) {
    lastClockDisplayTimestamp = now;
    const secondDecimals = Math.floor((totalSeconds % 1) * 100)
      .toString()
      .padStart(2, "0");

    const nextAgeDisplayKey = [
      Math.floor(currentAgeYears),
      Math.floor(totalSeconds / 86400),
      Math.floor(totalSeconds / 3600),
      Math.floor(totalSeconds),
      secondDecimals,
    ].join("|");

    if (nextAgeDisplayKey !== lastAgeDisplayKey) {
      lastAgeDisplayKey = nextAgeDisplayKey;
      ageYearsEl.textContent = `${Math.floor(currentAgeYears)}y/o`;
      ageDaysEl.textContent = formatCount(totalSeconds / 86400);
      ageHoursEl.textContent = formatCount(totalSeconds / 3600);
      ageSecondsEl.textContent = formatCount(totalSeconds);
      ageSecondDecimalsEl.textContent = secondDecimals;
    }
  }

  if (now - lastAgingEffectTimestamp >= agingEffectFrameMs) {
    lastAgingEffectTimestamp = now;
    setAgingAxis(currentAgeYears);
    const nextMaskClassKey = `${activeAgingFont}|${currentAgeYears >= 100}`;
    if (nextMaskClassKey !== lastMaskClassKey) {
      lastMaskClassKey = nextMaskClassKey;
      updateFontMaskClasses();
    }
  }

  requestAnimationFrame(updateAgeClock);
}

function resetToRebirth() {
  acceleratedSeconds = 0;
  ageOffsetSeconds = -initialAgeSeconds;
  lastClockTimestamp = performance.now();
  timeSpeed = 1;
  currentAgeYears = 0;
  totalCost = 0;
  lastFontAgingValue = null;
  lastWrinkleAmount = null;
  lastRoughScaleValue = null;
  lastRough2AgeBucket = null;
  lastRoughScaleTimestamp = 0;
  lastClockDisplayTimestamp = 0;
  lastAgingEffectTimestamp = 0;
  lastAgeDisplayKey = "";
  lastMaskClassKey = "";

  if (speedSliderEl) speedSliderEl.value = "0";
  if (youngerTotalCostEl) youngerTotalCostEl.textContent = "0$";
  updateFontMaskClasses(0);
  setAgingAxis(0);
}

updateWipTextLayer();
if (isRoughFont()) {
  drawRoughCanvas();
  document.fonts?.ready.then(() => drawRoughCanvas());
}
requestAnimationFrame(updateAgeClock);

speedSliderEl?.addEventListener("input", (event) => {
  const value = Number(event.target.value);
  timeSpeed = 1 + (value / 20) * (maxTimeSpeed - 1);
});

agingOptionEls.forEach((option) => {
  option.addEventListener("click", () => {
    selectAgingFont(option.dataset.agingFont);
  });

  option.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;

    event.preventDefault();
    selectAgingFont(option.dataset.agingFont);
  });
});

youngerActionEls.forEach((action) => {
  action.addEventListener("click", () => {
    ageOffsetSeconds -= yearSeconds * Number(action.dataset.years || 0);
    totalCost += Number(action.dataset.cost || 0);
    if (youngerTotalCostEl) youngerTotalCostEl.textContent = `${totalCost}$`;
  });
});

rebirthActionEl?.addEventListener("click", resetToRebirth);
rebirthActionEl?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;

  event.preventDefault();
  resetToRebirth();
});

function openThesisPage() {
  window.location.href = "thesis.html";
}

thesisActionEl?.addEventListener("click", openThesisPage);
thesisActionEl?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;

  event.preventDefault();
  openThesisPage();
});

function printAgedLetter(event) {
  event?.preventDefault();
  event?.stopPropagation();

  if (isPrintPending || isPrintDialogPending) return;

  const now = performance.now();
  if (now - lastPrintDialogTimestamp < printDialogCooldownMs) return;

  const printImage = pickRandomPrintImage();
  if (!printImage) {
    window.alert("Print images are not connected yet.");
    return;
  }

  isPrintPending = true;
  isPrintDialogPending = true;
  lastPrintDialogTimestamp = now;
  openPrintPage(printImage);

  window.setTimeout(() => {
    isPrintPending = false;
    isPrintDialogPending = false;
  }, printDialogCooldownMs);
}

function preloadPrintImages() {
  printImagePaths.forEach((path) => {
    const image = new Image();
    image.src = path;
    printImageCache.set(path, image);
  });
}

function pickRandomPrintImage() {
  if (!printImagePaths.length) return null;

  const path = printImagePaths[Math.floor(Math.random() * printImagePaths.length)];
  const cachedImage = printImageCache.get(path);

  return cachedImage?.complete ? cachedImage : { src: path };
}

function openPrintPage(image) {
  const url = new URL("print.html", window.location.href);
  const meta = getPrintMeta();
  url.searchParams.set("id", `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  url.searchParams.set("src", image.src);
  url.searchParams.set("name", meta.name);
  url.searchParams.set("age", meta.age);
  url.searchParams.set("days", meta.days);
  url.searchParams.set("hours", meta.hours);
  url.searchParams.set("seconds", meta.seconds);

  const popup = window.open(url.toString(), "_blank", "popup,width=420,height=720");
  if (!popup) {
    window.location.href = url.toString();
  }
}

function getPrintMeta() {
  const name = (resultNameEl?.textContent || "").trim() || "Name";
  const age = (ageYearsEl?.textContent || "").trim();
  const days = (ageDaysEl?.textContent || "0").trim();
  const hours = (ageHoursEl?.textContent || "0").trim();
  const seconds = (ageSecondsEl?.textContent || "0").trim();

  return { name, age, days, hours, seconds };
}

window.addEventListener("afterprint", () => {
  window.setTimeout(() => {
    isPrintDialogPending = false;
  }, printDialogCooldownMs);
  isPrintPending = false;
});

printActionEl?.addEventListener("click", printAgedLetter);
printActionEl?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  if (event.repeat) return;

  printAgedLetter(event);
});

fontTesterEl?.addEventListener("paste", (event) => {
  event.preventDefault();
  const text = event.clipboardData.getData("text/plain").toUpperCase();
  document.execCommand("insertText", false, text);
  scheduleActiveTextLayerUpdate(80);
});

fontTesterEl?.addEventListener("input", () => {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const endOffset = range?.endOffset || 0;
  const upperText = fontTesterEl.textContent.toUpperCase();

  if (fontTesterEl.textContent === upperText) {
    scheduleActiveTextLayerUpdate(110);
    return;
  }

  fontTesterEl.textContent = upperText;
  scheduleActiveTextLayerUpdate(110);

  if (!selection) return;

  const textNode = fontTesterEl.firstChild;
  const nextRange = document.createRange();
  nextRange.setStart(textNode || fontTesterEl, Math.min(endOffset, upperText.length));
  nextRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(nextRange);
});

fontTesterEl?.addEventListener("keyup", () => {
  scheduleActiveTextLayerUpdate(110);
});

scaleSliderEl?.addEventListener("input", (event) => {
  document.documentElement.style.setProperty(
    "--tester-size",
    `${event.target.value}vh`
  );
  if (activeAgingFont === "wrinkle") {
    window.WrinkleLetters?.refreshLayout();
  } else if (isRoughFont()) {
    lastRough2Key = "";
    scheduleRoughCanvasUpdate(90);
  }
});
