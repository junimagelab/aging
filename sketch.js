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
const youngerTotalCostEl = document.querySelector("#younger-total-cost");
const agingOptionEls = document.querySelectorAll(".aging-option");
const roughSkinDisplacementEl = document.querySelector("#rough-skin-displacement");

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
let lastRoughScaleValue = null;
let lastRoughScaleTimestamp = 0;
const maxTimeSpeed = yearSeconds * 2;
const roughScaleFrameMs = 160;
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
};
const wipTextLayerEl = document.createElement("div");

wipTextLayerEl.className = "wip-text-layer";
fontTesterMaskEl?.append(wipTextLayerEl);

function setAgingAxis(ageValue) {
  const axisMax = agingFonts[activeAgingFont]?.axisMax || agingFonts.skin.axisMax;
  const axisValue = Math.min(
    axisMax,
    Math.max(0, ((ageValue - 20) / 70) * axisMax)
  );
  if (activeAgingFont === "wrinkle") {
    updateWrinkleFrame(null, axisValue);
    return;
  }

  if (activeAgingFont !== "rough") {
    const nextFontAgingValue = axisValue.toFixed(2);

    if (nextFontAgingValue !== lastFontAgingValue) {
      document.documentElement.style.setProperty("--font-aging", nextFontAgingValue);
      lastFontAgingValue = nextFontAgingValue;
    }

    return;
  }

  if (!roughSkinDisplacementEl) return;

  const now = performance.now();
  const nextRoughScaleValue = Math.round(axisValue / 2) * 2;
  if (
    nextRoughScaleValue !== lastRoughScaleValue &&
    now - lastRoughScaleTimestamp >= roughScaleFrameMs
  ) {
    roughSkinDisplacementEl.setAttribute("scale", String(nextRoughScaleValue));
    lastRoughScaleValue = nextRoughScaleValue;
    lastRoughScaleTimestamp = now;
  }
}

function selectAgingFont(fontName) {
  if (!agingFonts[fontName] || !fontTesterEl) return;

  activeAgingFont = fontName;
  fontTesterEl.dataset.agingFont = fontName;
  lastRoughScaleTimestamp = 0;

  agingOptionEls.forEach((option) => {
    const isActive = option.dataset.agingFont === fontName;
    option.classList.toggle("is-active", isActive);
    option.setAttribute("aria-pressed", String(isActive));
    option.querySelector(".purple-dot")?.classList.toggle("is-hidden", !isActive);
  });

  fontTesterMaskEl?.classList.toggle("is-wrinkle", activeAgingFont === "wrinkle");
  fontTesterMaskEl?.classList.toggle(
    "is-wip",
    activeAgingFont !== "wrinkle" && currentAgeYears >= 100
  );
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
  updateWrinkleFrame(fontTesterEl?.textContent || "ABCDEFGHIJKLMNOPQRSTUVWXYZ", null);
}

function updateAgeClock(now) {
  const deltaSeconds = Math.max(0, (now - lastClockTimestamp) / 1000);
  acceleratedSeconds += deltaSeconds * timeSpeed;
  lastClockTimestamp = now;

  const totalSeconds = Math.max(0, initialAgeSeconds + acceleratedSeconds + ageOffsetSeconds);
  currentAgeYears = totalSeconds / yearSeconds;
  const secondDecimals = Math.floor((totalSeconds % 1) * 100)
    .toString()
    .padStart(2, "0");

  ageYearsEl.textContent = `${Math.floor(currentAgeYears)}y/o`;
  ageDaysEl.textContent = formatCount(totalSeconds / 86400);
  ageHoursEl.textContent = formatCount(totalSeconds / 3600);
  ageSecondsEl.textContent = formatCount(totalSeconds);
  ageSecondDecimalsEl.textContent = secondDecimals;
  setAgingAxis(currentAgeYears);
  fontTesterMaskEl?.classList.toggle("is-wrinkle", activeAgingFont === "wrinkle");
  fontTesterMaskEl?.classList.toggle(
    "is-wip",
    activeAgingFont !== "wrinkle" && currentAgeYears >= 100
  );

  requestAnimationFrame(updateAgeClock);
}

updateWipTextLayer();
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

fontTesterEl?.addEventListener("paste", (event) => {
  event.preventDefault();
  const text = event.clipboardData.getData("text/plain").toUpperCase();
  document.execCommand("insertText", false, text);
  window.setTimeout(() => {
    updateWipTextLayer();
    updateWrinkleText();
  }, 0);
});

fontTesterEl?.addEventListener("input", () => {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const endOffset = range?.endOffset || 0;
  const upperText = fontTesterEl.textContent.toUpperCase();

  if (fontTesterEl.textContent === upperText) {
    updateWipTextLayer();
    updateWrinkleText();
    return;
  }

  fontTesterEl.textContent = upperText;
  updateWipTextLayer();
  updateWrinkleText();

  if (!selection) return;

  const textNode = fontTesterEl.firstChild;
  const nextRange = document.createRange();
  nextRange.setStart(textNode || fontTesterEl, Math.min(endOffset, upperText.length));
  nextRange.collapse(true);
  selection.removeAllRanges();
  selection.addRange(nextRange);
});

fontTesterEl?.addEventListener("keyup", () => {
  updateWipTextLayer();
  updateWrinkleText();
});

scaleSliderEl?.addEventListener("input", (event) => {
  document.documentElement.style.setProperty(
    "--tester-size",
    `${event.target.value}vh`
  );
  if (activeAgingFont === "wrinkle") {
    window.WrinkleLetters?.refreshLayout();
  }
});
