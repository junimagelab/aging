const magenta100 = [0, 0, 0];
let ampSlider, nSlider, freqSlider;
let myFont;
let baseContours = [];
let fillMode = false;
let modeBtn;
let waveMode = 'oddFourier';
let waveBtns = {};
let coordAxis = 'x'; // 'x' or 'y'
let axisBtnX, axisBtnY;
let bounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 };
let textInput;
let displayText = 'aPlusT';

function preload() {
  myFont = loadFont('libraries/ABCOracle-Medium-Trial.otf');
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(2);
  createFourierControls();
  extractContours();
}

function draw() {
  background(255);
  drawLetters();
  drawWaveform();
}

// ─── 폰트 아웃라인 추출 ────────────────────────────────────────────────────────

function extractContours() {
  baseContours = [];
  let str = displayText.trim();
  if (!str) {
    bounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    return;
  }
  let fontSize = min(width, height) * 0.32;

  // p5.js textBounds로 중앙 정렬 origin 계산
  let b = myFont.textBounds(str, 0, 0, fontSize);
  let ox = width  / 2 - b.x - b.w / 2;
  let oy = height / 2 - b.y - b.h / 2;

  // glyph별 path를 먼저 받은 뒤, outline을 충분히 촘촘하게 샘플링한다.
  let glyphPaths = myFont.font.getPaths ? myFont.font.getPaths(str, ox, oy, fontSize) : [myFont.font.getPath(str, ox, oy, fontSize)];

  for (let otPath of glyphPaths) {
    let current = [];
    for (let cmd of otPath.commands) {
      if (cmd.type === 'M') {
        if (current.length > 1) baseContours.push(current);
        current = [{ x: cmd.x, y: cmd.y }];

      } else if (cmd.type === 'L') {
        let p0 = current[current.length - 1];
        let dx = cmd.x - p0.x;
        let dy = cmd.y - p0.y;
        let steps = Math.max(2, ceil(Math.sqrt(dx * dx + dy * dy) / 2));
        for (let i = 1; i <= steps; i++) {
          let t = i / steps;
          current.push({
            x: p0.x + t * dx,
            y: p0.y + t * dy
          });
        }

      } else if (cmd.type === 'C') {
        let p0 = current[current.length - 1];
        let approxLen = dist(p0.x, p0.y, cmd.x1, cmd.y1) + dist(cmd.x1, cmd.y1, cmd.x2, cmd.y2) + dist(cmd.x2, cmd.y2, cmd.x, cmd.y);
        let steps = Math.max(12, ceil(approxLen / 2));
        for (let i = 1; i <= steps; i++) {
          let t = i / steps;
          let m = 1 - t;
          current.push({
            x: m * m * m * p0.x + 3 * m * m * t * cmd.x1 + 3 * m * t * t * cmd.x2 + t * t * t * cmd.x,
            y: m * m * m * p0.y + 3 * m * m * t * cmd.y1 + 3 * m * t * t * cmd.y2 + t * t * t * cmd.y
          });
        }

      } else if (cmd.type === 'Q') {
        let p0 = current[current.length - 1];
        let approxLen = dist(p0.x, p0.y, cmd.x1, cmd.y1) + dist(cmd.x1, cmd.y1, cmd.x, cmd.y);
        let steps = Math.max(10, ceil(approxLen / 2));
        for (let i = 1; i <= steps; i++) {
          let t = i / steps;
          let m = 1 - t;
          current.push({
            x: m * m * p0.x + 2 * m * t * cmd.x1 + t * t * cmd.x,
            y: m * m * p0.y + 2 * m * t * cmd.y1 + t * t * cmd.y
          });
        }

      } else if (cmd.type === 'Z') {
        if (current.length > 1) {
          let first = current[0];
          let last = current[current.length - 1];
          if (first.x !== last.x || first.y !== last.y) {
            current.push({ x: first.x, y: first.y });
          }
          baseContours.push(current);
        }
        current = [];
      }
    }
    if (current.length > 1) baseContours.push(current);
  }

  // 전체 글자 bounding box 계산
  let allPts = baseContours.flat();
  if (!allPts.length) {
    bounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 };
    return;
  }
  bounds.minX = Math.min(...allPts.map(p => p.x));
  bounds.maxX = Math.max(...allPts.map(p => p.x));
  bounds.minY = Math.min(...allPts.map(p => p.y));
  bounds.maxY = Math.max(...allPts.map(p => p.y));
}

// ─── Fourier 변형 ─────────────────────────────────────────────────────────────

function fourierDeform(angle, amp, N, freq) {
  let d = 0;
  for (let k = 1; k <= N; k++) {
    d += sin((2 * k + 1) * angle * freq) / (2 * k + 1);
  }
  return amp * d;
}

// 윤곽선 각 점을 법선 방향으로 Fourier 변형
// angle = 컨투어 호 길이(arc-length) 기반 → 수직/수평/곡선 모두 균일하게 톱니 생성
function applyFourierToContour(contour, amp, N, freq) {
  let n = contour.length;
  if (n < 3) return contour;

  // 부호 면적으로 컨투어 방향 판별
  // screen coords(y↓): CW = 양수, CCW = 음수
  let area = 0;
  for (let i = 0; i < n; i++) {
    let j = (i + 1) % n;
    area += contour[i].x * contour[j].y - contour[j].x * contour[i].y;
  }
  // CW(외곽) → 바깥 법선 = (ty, -tx)
  // CCW(구멍) → 바깥 법선 = (-ty,  tx)
  let cw = area > 0;

  // 누적 호 길이 계산
  let arcLen = [0];
  for (let i = 1; i < n; i++) {
    let dx = contour[i].x - contour[i-1].x;
    let dy = contour[i].y - contour[i-1].y;
    arcLen.push(arcLen[i-1] + Math.sqrt(dx*dx + dy*dy));
  }
  if (arcLen[arcLen.length - 1] < 0.001) return contour;

  // totalLen으로 나누면 짧은 엣지(수직 직선)는 파형의 일부만 통과 → 한 방향 이동
  // 해결: 픽셀 절대값 기준 주기 사용 → 엣지 길이와 방향 무관하게 항상 완전한 주기
  // periodPx = freq가 1일 때 75px마다 파형 1주기 → 120px 수직선 = 1.6주기 = 좌우 번갈아 톱니
  let periodPx = 75 / freq;

  let result = [];
  for (let i = 0; i < n; i++) {
    let prev = contour[(i - 1 + n) % n];
    let next = contour[(i + 1) % n];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    let tlen = Math.sqrt(tx*tx + ty*ty);

    if (tlen < 0.001) {
      result.push({ x: contour[i].x, y: contour[i].y });
      continue;
    }

    // 절대 픽셀 기반 angle: 75/freq 픽셀마다 1주기 → 수직/수평/대각 모두 동일하게 양방향 톱니
    let angle = (arcLen[i] / periodPx) * TWO_PI;
    let d = waveMode === 'oddFourier'
      ? getWaveValue(angle, amp, N, 1)
      : getWaveValue(angle, amp, N, freq);

    let nx = cw ?  ty / tlen : -ty / tlen;
    let ny = cw ? -tx / tlen :  tx / tlen;
    result.push({
      x: contour[i].x + nx * d,
      y: contour[i].y + ny * d
    });
  }
  return result;
}

// ─── 글자 그리기 ──────────────────────────────────────────────────────────────

function drawLetters() {
  let amp  = float(ampSlider.value());
  let N    = int(nSlider.value());
  let freq = float(freqSlider.value());

  if (!baseContours.length) return;

  let all = baseContours.map(c => applyFourierToContour(c, amp, N, freq));

  push();
  blendMode(BLEND);

  if (fillMode) {
    // even-odd fill — 'a', 'P' 등 내부 구멍 자동 처리
    noStroke();
    drawingContext.beginPath();
    for (let pts of all) {
      if (pts.length < 2) continue;
      drawingContext.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        drawingContext.lineTo(pts[i].x, pts[i].y);
      }
      drawingContext.closePath();
    }
    drawingContext.fillStyle = `rgba(${magenta100[0]},${magenta100[1]},${magenta100[2]},0.78)`;
    drawingContext.fill('evenodd');
  } else {
    noFill();
    stroke(...magenta100, 200);
    strokeWeight(1.5);
    for (let pts of all) {
      beginShape();
      for (let p of pts) vertex(p.x, p.y);
      endShape(CLOSE);
    }
  }

  blendMode(BLEND);
  pop();
}

// ─── 파형 뷰어 ────────────────────────────────────────────────────────────────

function drawWaveform() {
  let amp  = float(ampSlider.value());
  let N    = int(nSlider.value());
  let freq = float(freqSlider.value());

  let pts = 400;
  let values = [];
  for (let i = 0; i <= pts; i++) {
    let angle = (i / pts) * TWO_PI;
    values.push(getWaveValue(angle, amp, N, freq));
  }

  let peak = 0;
  for (let v of values) peak = max(peak, abs(v));
  let halfH = max(peak + 10, 20);

  let margin = 24;
  let ww = width / 4;
  let ox = margin;
  let oy = margin;
  let cy = oy + halfH;
  let waveColor = [0, 0, 0];

  push();
  noStroke();
  fill(255, 255, 255, 220);
  rect(ox - 4, oy - 4, ww + 8, halfH * 2 + 8, 6);

  stroke(...waveColor, 40);
  strokeWeight(0.5);
  line(ox, cy, ox + ww, cy);

  blendMode(BLEND);
  stroke(...waveColor, 210);
  strokeWeight(1.4);
  noFill();
  beginShape();
  for (let i = 0; i <= pts; i++) {
    vertex(ox + (i / pts) * ww, cy - values[i]);
  }
  endShape();

  blendMode(BLEND);
  pop();
}

function getWaveValue(angle, amp, N, freq) {
  if (waveMode === 'sumTwoSines') {
    let shifted = angle - radians(30);
    return amp * (sin(shifted) + sin(0.9 * shifted));
  }

  if (waveMode === 'weightedHarmonics') {
    let sum = 0;
    for (let n = 1; n <= 7; n++) {
      sum += 1.5 / sqrt(n) * sin(n * angle * freq);
    }
    return amp * sum;
  }

  return fourierDeform(angle, amp, N, freq);
}

// ─── 컨트롤 패널 ──────────────────────────────────────────────────────────────

function createFourierControls() {
  let panel = createDiv('');
  panel.id('fourier-panel');

  let textGroup = createDiv('');
  textGroup.parent(panel);
  textGroup.class('slider-group');
  createDiv('Text').parent(textGroup).class('slider-label');
  textInput = createInput(displayText);
  textInput.parent(textGroup);
  textInput.attribute('id', 'text-input');
  textInput.attribute('placeholder', 'Type text');
  textInput.input(() => {
    displayText = textInput.value();
    extractContours();
  });

  function makeGroup(label, mn, mx, def, step, id) {
    let g = createDiv('');
    g.parent(panel);
    g.class('slider-group');
    createDiv(label + ': <span id="' + id + '-val">' + def + '</span>')
      .parent(g).class('slider-label');
    let sl = createSlider(mn, mx, def, step);
    sl.parent(g);
    sl.attribute('id', id);
    sl.input(function () {
      let v = this.value();
      select('#' + id + '-val').html(step < 1 ? parseFloat(v).toFixed(1) : parseInt(v));
    });
    return sl;
  }

  ampSlider  = makeGroup('Amplitude (px)', 0, 300, 80,  1,   'amp');
  nSlider    = makeGroup('Harmonics N',    1, 24,  12,  1,   'nval');
  freqSlider = makeGroup('Frequency',      0.1, 5, 1.0, 0.1, 'freq');

  let waveGroup = createDiv('');
  waveGroup.parent(panel);
  waveGroup.class('slider-group');
  createDiv('Wave').parent(waveGroup).class('slider-label');

  let waveBtnsWrap = createDiv('');
  waveBtnsWrap.parent(waveGroup);
  waveBtnsWrap.class('wave-btns');

  function setWaveMode(mode) {
    waveMode = mode;
    for (let key in waveBtns) {
      if (key === mode) {
        waveBtns[key].addClass('active');
      } else {
        waveBtns[key].removeClass('active');
      }
    }
  }

  waveBtns.oddFourier = createButton('Odd Fourier');
  waveBtns.oddFourier.parent(waveBtnsWrap);
  waveBtns.oddFourier.class('wave-btn active');
  waveBtns.oddFourier.mousePressed(() => setWaveMode('oddFourier'));

  waveBtns.sumTwoSines = createButton('2 Sines');
  waveBtns.sumTwoSines.parent(waveBtnsWrap);
  waveBtns.sumTwoSines.class('wave-btn');
  waveBtns.sumTwoSines.mousePressed(() => setWaveMode('sumTwoSines'));

  waveBtns.weightedHarmonics = createButton('Weighted Σ');
  waveBtns.weightedHarmonics.parent(waveBtnsWrap);
  waveBtns.weightedHarmonics.class('wave-btn');
  waveBtns.weightedHarmonics.mousePressed(() => setWaveMode('weightedHarmonics'));

  // 라인 / 면 토글 버튼
  let btnGroup = createDiv('');
  btnGroup.parent(panel);
  btnGroup.class('slider-group');
  createDiv('Mode').parent(btnGroup).class('slider-label');
  modeBtn = createButton('Line');
  modeBtn.parent(btnGroup);
  modeBtn.id('mode-btn');
  modeBtn.mousePressed(() => {
    fillMode = !fillMode;
    modeBtn.html(fillMode ? 'Fill' : 'Line');
  });

  // X / Y 축 선택
  let axisGroup = createDiv('');
  axisGroup.parent(panel);
  axisGroup.class('slider-group');
  createDiv('Axis').parent(axisGroup).class('slider-label');

  let axisBtns = createDiv('');
  axisBtns.parent(axisGroup);
  axisBtns.class('axis-btns');

  axisBtnX = createButton('X');
  axisBtnX.parent(axisBtns);
  axisBtnX.class('axis-btn active');
  axisBtnX.mousePressed(() => {
    coordAxis = 'x';
    axisBtnX.addClass('active');
    axisBtnY.removeClass('active');
  });

  axisBtnY = createButton('Y');
  axisBtnY.parent(axisBtns);
  axisBtnY.class('axis-btn');
  axisBtnY.mousePressed(() => {
    coordAxis = 'y';
    axisBtnY.addClass('active');
    axisBtnX.removeClass('active');
  });
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  extractContours();
}
