const mainCounterEl = document.querySelector("#main-counter");
const mainBackgroundEl = document.querySelector(".main-background");
const mainStartedAt = performance.now();
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

localStorage.removeItem("measuredName");
localStorage.removeItem("measuredAge");

if (mainBackgroundEl) {
  const sourceWidth = 1920;
  const sourceHeight = 1080;
  const cellWidth = 29.54;
  const cellHeight = 120;
  const rows = [120, 240, 360, 480, 600, 720, 840, 960];
  const sourceMinX = cellWidth;
  const sourceMaxX = sourceWidth;
  const sourceMinY = rows[0];
  const sourceMaxY = sourceHeight;
  const sourceSpanX = sourceMaxX - sourceMinX;
  const sourceSpanY = sourceMaxY - sourceMinY;
  const fragment = document.createDocumentFragment();

  rows.forEach((y, rowIndex) => {
    for (let column = 1; column <= 64; column += 1) {
      if ((column + rowIndex) % 2 === 0) continue;

      const rect = document.createElement("span");
      const x = cellWidth * column;

      rect.style.setProperty("--x", `${((x - sourceMinX) / sourceSpanX) * 100}%`);
      rect.style.setProperty("--y", `${((y - sourceMinY) / sourceSpanY) * 100}%`);
      rect.style.setProperty("--w", `${(cellWidth / sourceSpanX) * 100}%`);
      rect.style.setProperty("--h", `${(cellHeight / sourceSpanY) * 100}%`);
      fragment.append(rect);
    }
  });

  mainBackgroundEl.append(fragment);
}

function formatMainCounter(seconds) {
  const whole = Math.floor(seconds);
  const decimals = Math.floor((seconds - whole) * 100);
  const wholeText = whole.toLocaleString("en-US", {
    minimumIntegerDigits: 6,
    useGrouping: true,
  });

  return `${wholeText}.${decimals.toString().padStart(2, "0")}`;
}

function updateMainCounter(now) {
  if (!mainCounterEl) return;

  const elapsedSeconds = (now - mainStartedAt) / 1000;
  mainCounterEl.textContent = formatMainCounter(elapsedSeconds);
  requestAnimationFrame(updateMainCounter);
}

requestAnimationFrame(updateMainCounter);

let memoryNumber = "";

document.querySelectorAll(".main-card").forEach((card) => {
  function toggleCard() {
    const isFlipped = card.classList.toggle("is-flipped");
    card.setAttribute("aria-pressed", String(isFlipped));
  }

  card.addEventListener("click", (event) => {
    if (!card.classList.contains("is-flipped")) {
      toggleCard();
      return;
    }

    if (event.target.closest(".answer-card h2, .name-label")) {
      toggleCard();
    }
  });

  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (card.classList.contains("is-flipped")) return;

    event.preventDefault();
    toggleCard();
  });
});

document.querySelectorAll(".question-block").forEach((question) => {
  question.querySelectorAll(".choice").forEach((choice) => {
    choice.addEventListener("click", (event) => {
      event.stopPropagation();
      question
        .querySelectorAll(".choice")
        .forEach((item) => item.classList.remove("is-selected"));
      choice.classList.add("is-selected");
    });
  });
});

document.querySelectorAll(".answer-card-submit").forEach((card) => {
  const clickLabel = card.querySelector(".click-label");
  let hasShownNumber = false;

  clickLabel?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (hasShownNumber) return;

    hasShownNumber = true;
    clickLabel.classList.add("is-number");
    memoryNumber = Math.floor(Math.random() * 1000000)
      .toString()
      .padStart(6, "0");
    clickLabel.textContent = memoryNumber;

    window.setTimeout(() => {
      clickLabel.textContent = "000000";
      clickLabel.classList.remove("is-number");
      clickLabel.classList.add("is-hidden");
    }, 3000);
  });

  card.querySelector(".submit-button")?.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  card.querySelectorAll(".answer-input").forEach((input) => {
    input.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
    });
  });
});

document.querySelectorAll(".draw-canvas").forEach((canvas) => {
  const context = canvas.getContext("2d");
  let isDrawing = false;
  canvas.drawPoints = [];

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;

    canvas.width = Math.round(rect.width * scale);
    canvas.height = Math.round(rect.height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 3;
    context.strokeStyle = "#B700FF";
  }

  function getPoint(event) {
    const rect = canvas.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  canvas.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    isDrawing = true;
    canvas.setPointerCapture(event.pointerId);

    const point = getPoint(event);
    canvas.drawPoints.push(point);
    context.beginPath();
    context.moveTo(point.x, point.y);
  });

  canvas.addEventListener("pointermove", (event) => {
    event.stopPropagation();
    if (!isDrawing) return;

    const point = getPoint(event);
    canvas.drawPoints.push(point);
    context.lineTo(point.x, point.y);
    context.stroke();
  });

  canvas.addEventListener("pointerup", (event) => {
    event.stopPropagation();
    isDrawing = false;
    canvas.releasePointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointercancel", (event) => {
    event.stopPropagation();
    isDrawing = false;
  });

  canvas.addEventListener("click", (event) => {
    event.stopPropagation();
  });
});

function getQuestionAge() {
  const questions = [...document.querySelectorAll(".question-block")];

  if (questions.every((question) => !question.querySelector(".choice.is-selected"))) {
    return 37;
  }

  return questions.reduce(
    (total, question) => {
      const selected = question.querySelector(".choice.is-selected");
      return total + Number(selected?.dataset.age || 0);
    },
    0
  );
}

function getMemoryAge() {
  const answer = document.querySelector(".number-input")?.value.trim() || "";
  const target = memoryNumber || "000000";
  let misses = 0;

  for (let index = 0; index < 6; index += 1) {
    if (answer[index] !== target[index]) misses += 1;
  }

  return misses * 3;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", reject, { once: true });
    image.src = src;
  });
}

async function getDrawingAge() {
  const canvas = document.querySelector(".draw-canvas");
  const outline = document.querySelector(".answer-head-outline");

  if (!canvas || !outline || !canvas.drawPoints?.length) return 15;

  const canvasRect = canvas.getBoundingClientRect();
  const outlineRect = outline.getBoundingClientRect();
  const width = Math.max(1, Math.round(canvasRect.width));
  const height = Math.max(1, Math.round(canvasRect.height));
  const targetCanvas = document.createElement("canvas");
  const targetContext = targetCanvas.getContext("2d");
  const image = await loadImage(outline.src);

  targetCanvas.width = width;
  targetCanvas.height = height;
  targetContext.drawImage(
    image,
    outlineRect.left - canvasRect.left,
    outlineRect.top - canvasRect.top,
    outlineRect.width,
    outlineRect.height
  );

  const imageData = targetContext.getImageData(0, 0, width, height).data;
  const targetPoints = [];

  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const offset = (y * width + x) * 4;
      if (imageData[offset + 3] > 20) targetPoints.push({ x, y });
    }
  }

  if (!targetPoints.length) return 15;

  const maxDistance = canvas.drawPoints.reduce((largestDistance, point) => {
    const nearest = targetPoints.reduce((best, target) => {
      const distance = Math.hypot(point.x - target.x, point.y - target.y);
      return Math.min(best, distance);
    }, Infinity);

    return Math.max(largestDistance, nearest);
  }, 0);

  if (maxDistance <= 8) return 0;
  if (maxDistance <= 20) return 5;
  if (maxDistance <= 50) return 10;
  return 15;
}

document.querySelector(".submit-button")?.addEventListener("click", async (event) => {
  event.stopPropagation();

  const baseAge = 20;
  const measuredAge =
    baseAge + getQuestionAge() + getMemoryAge() + (await getDrawingAge());
  const measuredName = document.querySelector(".name-input")?.value.trim() || "";

  localStorage.setItem("measuredName", measuredName);
  localStorage.setItem("measuredAge", String(measuredAge));
  sessionStorage.setItem("showResult", "true");
  window.location.href = "index.html";
});
