const stage = document.querySelector("#glassStage");
const sourceLayer = document.querySelector("#sourceLayer");
const targetLayer = document.querySelector("#targetLayer");
const targetViewport = document.querySelector("#targetViewport");
const targetContent = document.querySelector("#targetContent");
const refractCanvas = document.querySelector("#refractCanvas");
const frostLayer = document.querySelector("#frostLayer");
const lensOutline = document.querySelector("#lensOutline");
const mapImage = document.querySelector("#mapImage");
const mapMatrix = document.querySelector("#mapMatrix");
const sourceBlur = document.querySelector("#sourceBlur");
const lensMask = document.querySelector("#lensMask");
const specMatrix = document.querySelector("#specMatrix");
const stats = document.querySelector("#stats");
const perfReadout = document.querySelector("#perfReadout");
const filter = document.querySelector("#glass-filter");
const fastFilter = document.querySelector("#glass-filter-fast");
const targetFilter = document.querySelector("#glass-filter-target");
const fastMapImage = document.querySelector("#fastMapImage");
const fastMapMatrix = document.querySelector("#fastMapMatrix");
const fastLensMask = document.querySelector("#fastLensMask");
const fastDisp = document.querySelector("#fastDisp");
const targetMapImage = document.querySelector("#targetMapImage");
const targetMapMatrix = document.querySelector("#targetMapMatrix");
const targetSourceBlur = document.querySelector("#targetSourceBlur");
const targetLensMask = document.querySelector("#targetLensMask");
const targetSpecMatrix = document.querySelector("#targetSpecMatrix");
const dispR = document.querySelector(".disp-r");
const dispG = document.querySelector(".disp-g");
const dispB = document.querySelector(".disp-b");
const targetDispR = document.querySelector(".target-disp-r");
const targetDispG = document.querySelector(".target-disp-g");
const targetDispB = document.querySelector(".target-disp-b");

targetContent.innerHTML = sourceLayer.innerHTML;

const refractCtx = refractCanvas.getContext("2d", { alpha: true });
const sceneCanvas = document.createElement("canvas");
const sceneCtx = sceneCanvas.getContext("2d", { alpha: false });
const sceneImage = new Image();
sceneImage.src =
  "/artifacts/raw/aave.com/design/demo/videos/cosmos-flowers-in-the-field-18491376/placeholder.webp";
sceneImage.addEventListener("load", () => {
  state.sceneKey = "";
  scheduleApply("scene-image");
});

const controls = {
  targetMode: document.querySelector("#targetMode"),
  safariRefresh: document.querySelector("#safariRefresh"),
  fullDragFilter: document.querySelector("#fullDragFilter"),
  dragFrost: document.querySelector("#dragFrost"),
  debugLogs: document.querySelector("#debugLogs"),
  lensW: document.querySelector("#lensW"),
  lensH: document.querySelector("#lensH"),
  radius: document.querySelector("#radius"),
  scaleX: document.querySelector("#scaleX"),
  scaleY: document.querySelector("#scaleY"),
  chroma: document.querySelector("#chroma"),
  depth: document.querySelector("#depth"),
  dome: document.querySelector("#dome"),
  splay: document.querySelector("#splay"),
  glow: document.querySelector("#glow"),
  edge: document.querySelector("#edge"),
  blur: document.querySelector("#blur"),
};

const state = {
  x: 0.58,
  y: 0.48,
  mapSize: 256,
  version: 0,
  isSafari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
  filterId: "glass-filter",
  fastFilterId: "glass-filter-fast",
  targetFilterId: "glass-filter-target",
  dragging: false,
  dragOffsetX: 0,
  dragOffsetY: 0,
  lastMapKey: "",
  frame: 0,
  pendingReason: "init",
  mapPixels: null,
  scenePixels: null,
  sceneKey: "",
  metrics: {
    applyCount: 0,
    pointerMoves: 0,
    idRefreshes: 0,
    lastApplyMs: 0,
    lastMapMs: 0,
    lastFrameGapMs: 0,
    fps: 0,
    lastFrameAt: 0,
    lastLogAt: 0,
    lastUiAt: 0,
    activeFilter: "full",
    lastReason: "init",
  },
};

const mapCanvas = document.createElement("canvas");
const mapCtx = mapCanvas.getContext("2d", { willReadFrequently: true });

function number(id) {
  return Number(controls[id].value);
}

function lensParams() {
  return {
    lensW: number("lensW"),
    lensH: number("lensH"),
    radius: number("radius"),
    scaleX: number("scaleX"),
    scaleY: number("scaleY"),
    chroma: number("chroma"),
    depth: number("depth"),
    dome: number("dome"),
    splay: number("splay"),
    glow: number("glow"),
    edge: number("edge"),
    blur: number("blur"),
    mapSize: state.mapSize,
    targetMode: controls.targetMode.checked,
    safariRefresh: controls.safariRefresh.checked,
    fullDragFilter: controls.fullDragFilter.checked,
    dragFrost: controls.dragFrost.checked,
    debugLogs: controls.debugLogs.checked,
  };
}

function erfApprox(x) {
  return Math.tanh(1.7724538509 * x);
}

function integrateDome(radius, half) {
  let sum = 0;
  for (let i = 0; i <= 200; i++) {
    const x = (i / 200) * half;
    const slope = x / Math.sqrt(radius * radius - x * x);
    sum += (i === 0 || i === 200 ? 0.5 : 1) * slope;
  }
  return sum / 200;
}

function computeDomeConstants(depth, halfW, halfH) {
  const safeDepth = Math.min(
    Math.max(depth, 0.01),
    Math.max(Math.min(halfW, halfH) - 1, 0.01),
  );
  const rx = (halfW * halfW + safeDepth * safeDepth) / (2 * safeDepth);
  const ry = (halfH * halfH + safeDepth * safeDepth) / (2 * safeDepth);
  const ix = integrateDome(rx, halfW);
  const iy = integrateDome(ry, halfH);
  return {
    rx,
    ry,
    scaleX: ix > 0 ? 0.5 / ix : 1,
    scaleY: iy > 0 ? 0.5 / iy : 1,
  };
}

function domeGradient(value, radius, scale) {
  const x = Math.min(value, 0.999 * radius);
  return (x / Math.sqrt(radius * radius - x * x)) * scale;
}

function roundedRectSdf(x, y, halfW, halfH, radius) {
  const qx = Math.abs(x) - halfW + radius;
  const qy = Math.abs(y) - halfH + radius;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - radius;
}

function generateDisplacementMap(params) {
  const size = params.mapSize;
  const halfW = params.lensW / 2;
  const halfH = params.lensH / 2;
  const radius = Math.min(params.radius, halfW, halfH);
  const depth = Math.max(0, params.depth);
  const innerHalfW = Math.max(0, halfW - depth);
  const innerHalfH = Math.max(0, halfH - depth);
  const innerRadius = Math.max(0, Math.min(radius, innerHalfW, innerHalfH));
  const invSigma = depth > 0 ? 1 / (depth * Math.SQRT2) : 1e6;
  const dome =
    params.dome > 0 ? computeDomeConstants(params.dome, halfW, halfH) : null;
  const splay = Math.max(0.001, params.splay);
  const splayActive = splay < 0.999;
  const edgeRange = 3;
  const glowSpread = Math.min(2, Math.max(0.05, params.glowSpread ?? 0.62));
  const glowExponent = Math.min(8, Math.max(0.1, params.glowExponent ?? 1.5));
  const edgeExponent = Math.min(8, Math.max(0.1, params.edgeExponent ?? 1.2));
  const specularRotation = Math.min(
    360,
    Math.max(-360, params.specularRotation ?? 45),
  );
  const glowThreshold = (1 - glowSpread) * Math.SQRT2;
  const glowRange = glowSpread * Math.SQRT2;
  const specRotation = (specularRotation * Math.PI) / 180;
  const specX = Math.cos(specRotation);
  const specY = Math.sin(specRotation);
  const minHalf = Math.max(1, Math.min(halfW, halfH));

  if (mapCanvas.width !== size || mapCanvas.height !== size) {
    mapCanvas.width = size;
    mapCanvas.height = size;
  }

  const image = mapCtx.createImageData(size, size);
  const data = image.data;
  const halfSize = Math.ceil(size / 2);

  function writePixel(px, py, r, g, b) {
    const i = (py * size + px) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }

  function writeSymmetricPixels(px, py, r, g, b00, b10, b01, b11, neutral) {
    const pxR = size - 1 - px;
    const pyB = size - 1 - py;
    writePixel(px, py, r, g, b00);
    if (pxR !== px) writePixel(pxR, py, neutral ? r : 255 - r, g, b10);
    if (pyB !== py) writePixel(px, pyB, r, neutral ? g : 255 - g, b01);
    if (pxR !== px && pyB !== py) {
      writePixel(pxR, pyB, neutral ? r : 255 - r, neutral ? g : 255 - g, b11);
    }
  }

  // Blue/specular is NOT invariant under single-axis mirroring, so it is
  // evaluated per mirrored pixel from that pixel's own normalized coords.
  function specByte(nx, ny, falloff, edgeMask) {
    const highlightAxis = Math.abs(nx * specX + ny * specY);
    let spec = 0;
    if (params.glow > 0) {
      const t = Math.min(
        1,
        Math.max(0, (highlightAxis - glowThreshold) / glowRange),
      );
      spec += params.glow * Math.pow(t, glowExponent) * falloff;
    }
    if (params.edge > 0) {
      spec += params.edge * edgeMask * Math.pow(highlightAxis, edgeExponent);
    }
    return Math.round(128 + 127 * Math.min(1, spec));
  }

  for (let py = 0; py < halfSize; py++) {
    const y = ((py + 0.5) / size) * (2 * halfH) - halfH;
    const gyBase = dome
      ? Math.sign(y) * domeGradient(Math.abs(y), dome.ry, dome.scaleY)
      : Math.max(-1, Math.min(1, y / halfH));
    const edgeY = splayActive
      ? Math.max(0, 1 - (halfH - Math.abs(y)) / minHalf) * (1 - splay)
      : 0;
    const baseNy = Math.max(-1, Math.min(1, y / halfH));

    for (let px = 0; px < halfSize; px++) {
      const x = ((px + 0.5) / size) * (2 * halfW) - halfW;
      const outer = roundedRectSdf(x, y, halfW, halfH, radius);

      if (outer >= 0) {
        writeSymmetricPixels(px, py, 128, 128, 128, 128, 128, 128, true);
        continue;
      }

      let gx = dome
        ? Math.sign(x) * domeGradient(Math.abs(x), dome.rx, dome.scaleX)
        : Math.max(-1, Math.min(1, x / halfW));
      let gy = gyBase;

      if (splayActive) {
        const edgeX =
          Math.max(0, 1 - (halfW - Math.abs(x)) / minHalf) * (1 - splay);
        const originalLength = Math.hypot(gx, gy);
        gx *= 1 - edgeY;
        gy *= 1 - edgeX;
        const nextLength = Math.hypot(gx, gy);
        if (nextLength > 0.001) {
          gx *= originalLength / nextLength;
          gy *= originalLength / nextLength;
        }
      }

      const inner = roundedRectSdf(x, y, innerHalfW, innerHalfH, innerRadius);
      const falloff = 0.5 * (1 + erfApprox(inner * invSigma));
      const r = Math.round((0.5 - 0.5 * gx * falloff) * 255);
      const g = Math.round((0.5 - 0.5 * gy * falloff) * 255);

      const baseNx = Math.max(-1, Math.min(1, x / halfW));
      const edgeMask = outer < 0 ? Math.max(0, 1 + outer / edgeRange) : 0;

      writeSymmetricPixels(
        px,
        py,
        Math.max(0, Math.min(255, r)),
        Math.max(0, Math.min(255, g)),
        specByte(baseNx, baseNy, falloff, edgeMask),
        specByte(-baseNx, baseNy, falloff, edgeMask),
        specByte(baseNx, -baseNy, falloff, edgeMask),
        specByte(-baseNx, -baseNy, falloff, edgeMask),
        false,
      );
    }
  }

  mapCtx.putImageData(image, 0, 0);
  state.mapPixels = image;
  return mapCanvas.toDataURL("image/png");
}

function mapKey(params) {
  return [
    params.lensW,
    params.lensH,
    params.radius,
    params.depth,
    params.dome,
    params.splay,
    params.glow,
    params.edge,
    params.glowSpread ?? 0.62,
    params.glowExponent ?? 1.5,
    params.edgeExponent ?? 1.2,
    params.specularRotation ?? 45,
    params.mapSize,
  ].join("|");
}

function colorMatrixForScale(scaleX, scaleY) {
  const base = Math.max(scaleX, scaleY);
  const rx = base > 0 ? scaleX / base : 0;
  const ry = base > 0 ? scaleY / base : 0;
  return `${rx} 0 0 0 ${0.5 * (1 - rx)}  0 ${ry} 0 0 ${0.5 * (1 - ry)}  0 0 1 0 0  0 0 0 1 0`;
}

function targetBleed(params) {
  // 3 sigma of Gaussian blur so the filter region fully covers the blur tail.
  return Math.ceil(
    Math.max(params.scaleX, params.scaleY) * (1 + 0.2 * params.chroma) +
      params.blur * 3 +
      4,
  );
}

function setAttr(el, name, value) {
  const next = String(value);
  if (el.getAttribute(name) !== next) el.setAttribute(name, next);
}

function setStyle(el, name, value) {
  if (el.style[name] !== value) el.style[name] = value;
}

function resizeCanvas(canvas, width, height) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function drawCoverImage(ctx, image, width, height) {
  if (!image.complete || !image.naturalWidth || !image.naturalHeight) return;
  const scale =
    Math.max(width / image.naturalWidth, height / image.naturalHeight) * 1.04;
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function fillRoundRect(ctx, x, y, width, height, radius, fill, stroke) {
  roundRectPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function rectInStage(el, stageRect) {
  const r = el.getBoundingClientRect();
  return {
    x: r.left - stageRect.left,
    y: r.top - stageRect.top,
    width: r.width,
    height: r.height,
  };
}

function cssColor(el, prop) {
  return getComputedStyle(el).getPropertyValue(prop);
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
  const words = text.trim().split(/\s+/);
  let line = "";
  let lines = 0;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      lines += 1;
      line = word;
      if (lines >= maxLines) return;
    } else {
      line = next;
    }
  }
  if (line && lines < maxLines) ctx.fillText(line, x, y + lines * lineHeight);
}

function fontForElement(el) {
  const style = getComputedStyle(el);
  return `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

function lineHeightForElement(el) {
  const style = getComputedStyle(el);
  const parsed = Number.parseFloat(style.lineHeight);
  if (Number.isFinite(parsed)) return parsed;
  return Number.parseFloat(style.fontSize) * 1.2;
}

function drawElementText(ctx, el, stageRect, options = {}) {
  if (!el) return;
  const r = rectInStage(el, stageRect);
  const style = getComputedStyle(el);
  ctx.save();
  ctx.fillStyle = options.color || style.color;
  ctx.font = options.font || fontForElement(el);
  ctx.textBaseline = "top";
  const text = options.text || el.textContent || "";
  const lineHeight = options.lineHeight || lineHeightForElement(el);
  if (options.wrap) {
    drawWrappedText(
      ctx,
      text,
      r.x,
      r.y,
      options.maxWidth || r.width,
      lineHeight,
      options.maxLines || 3,
    );
  } else if (options.lines) {
    options.lines.forEach((line, index) => {
      ctx.fillText(line, r.x, r.y + index * lineHeight);
    });
  } else {
    ctx.fillText(text.trim(), r.x, r.y);
  }
  ctx.restore();
}

function renderSceneCanvas(rect) {
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  const sourceRects = Array.from(
    sourceLayer.querySelectorAll(".dashboard-grid article"),
  )
    .map((el) => {
      const r = el.getBoundingClientRect();
      return `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
    })
    .join(";");
  const key = `${width}x${height}:${sceneImage.complete}:${sceneImage.naturalWidth}:${sourceRects}`;
  if (state.sceneKey === key && state.scenePixels) return;

  resizeCanvas(sceneCanvas, width, height);
  const stageRect = stage.getBoundingClientRect();
  sceneCtx.clearRect(0, 0, width, height);
  sceneCtx.fillStyle = "#101216";
  sceneCtx.fillRect(0, 0, width, height);
  drawCoverImage(sceneCtx, sceneImage, width, height);
  const bg = sceneCtx.createLinearGradient(0, 0, width, 0);
  bg.addColorStop(0, "rgba(13,15,18,.8)");
  bg.addColorStop(1, "rgba(13,15,18,.25)");
  sceneCtx.fillStyle = bg;
  sceneCtx.fillRect(0, 0, width, height);

  function panel(el) {
    const r = rectInStage(el, stageRect);
    fillRoundRect(
      sceneCtx,
      r.x,
      r.y,
      r.width,
      r.height,
      8,
      cssColor(el, "background-color"),
      cssColor(el, "border-color"),
    );
    return r;
  }

  const heroEl = sourceLayer.querySelector(".hero-panel");
  const chartEl = sourceLayer.querySelector(".chart-panel");
  const tableEl = sourceLayer.querySelector(".table-panel");
  const codeEl = sourceLayer.querySelector(".code-panel");
  const hero = panel(heroEl);
  const chart = panel(chartEl);
  const table = panel(tableEl);
  const code = panel(codeEl);

  drawElementText(sceneCtx, heroEl.querySelector(".eyebrow"), stageRect);
  const h1 = heroEl.querySelector("h1");
  const h1Rect = rectInStage(h1, stageRect);
  const h1LineHeight = lineHeightForElement(h1);
  drawElementText(sceneCtx, h1, stageRect, {
    lines:
      h1Rect.height > h1LineHeight * 1.35
        ? ["Liquidity", "Risk"]
        : ["Liquidity Risk"],
    lineHeight: h1LineHeight,
  });
  drawElementText(sceneCtx, heroEl.querySelector("p"), stageRect, {
    wrap: true,
    maxLines: 3,
  });

  for (const metric of heroEl.querySelectorAll(".metric-stack div")) {
    const metricRect = rectInStage(metric, stageRect);
    fillRoundRect(
      sceneCtx,
      metricRect.x,
      metricRect.y,
      metricRect.width,
      metricRect.height,
      8,
      cssColor(metric, "background-color"),
      cssColor(metric, "border-color"),
    );
    drawElementText(sceneCtx, metric.querySelector("span"), stageRect);
    drawElementText(sceneCtx, metric.querySelector("strong"), stageRect);
  }

  drawElementText(
    sceneCtx,
    chartEl.querySelector(".panel-title span"),
    stageRect,
  );
  drawElementText(
    sceneCtx,
    chartEl.querySelector(".panel-title strong"),
    stageRect,
  );
  for (const bar of chartEl.querySelectorAll(".bars span")) {
    const barRect = rectInStage(bar, stageRect);
    const grad = sceneCtx.createLinearGradient(
      0,
      barRect.y,
      0,
      barRect.y + barRect.height,
    );
    grad.addColorStop(0, "#61d7e8");
    grad.addColorStop(1, "#e687b9");
    fillRoundRect(
      sceneCtx,
      barRect.x,
      barRect.y,
      barRect.width,
      barRect.height,
      5,
      grad,
    );
  }

  drawElementText(
    sceneCtx,
    tableEl.querySelector(".panel-title span"),
    stageRect,
  );
  drawElementText(
    sceneCtx,
    tableEl.querySelector(".panel-title strong"),
    stageRect,
  );
  for (const row of tableEl.querySelectorAll(".asset-row")) {
    const rowRect = rectInStage(row, stageRect);
    sceneCtx.strokeStyle = cssColor(row, "border-top-color");
    sceneCtx.beginPath();
    sceneCtx.moveTo(rowRect.x, rowRect.y);
    sceneCtx.lineTo(rowRect.x + rowRect.width, rowRect.y);
    sceneCtx.stroke();
    drawElementText(sceneCtx, row.querySelector("span"), stageRect);
    drawElementText(sceneCtx, row.querySelector("b"), stageRect);
    drawElementText(sceneCtx, row.querySelector("em"), stageRect);
  }

  sceneCtx.fillStyle = "#c8f2d6";
  sceneCtx.font = "14px SFMono-Regular, Consolas, monospace";
  const codeLines = [
    "const lens = generateMap({",
    "  width: 180,",
    "  height: 112,",
    "  depth: 9,",
    "  chroma: 0.38,",
    "  edgeFalloff: true",
    "});",
  ];
  const codeStartY =
    code.y + code.height / 2 - (codeLines.length * 23) / 2 + 16;
  for (let i = 0; i < codeLines.length; i++) {
    sceneCtx.fillText(codeLines[i], code.x + 18, codeStartY + i * 23);
  }

  state.scenePixels = sceneCtx.getImageData(0, 0, width, height);
  state.sceneKey = key;
}

function roundedRectInside(x, y, width, height, radius) {
  const rx = Math.min(radius, width / 2);
  const ry = Math.min(radius, height / 2);
  const px = x < rx ? rx - x : x > width - rx ? x - (width - rx) : 0;
  const py = y < ry ? ry - y : y > height - ry ? y - (height - ry) : 0;
  return px * px + py * py <= rx * ry;
}

function sampleScene(data, width, height, x, y, channel) {
  const sx = Math.max(0, Math.min(width - 1, x));
  const sy = Math.max(0, Math.min(height - 1, y));
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = sx - x0;
  const ty = sy - y0;
  const i00 = (y0 * width + x0) * 4 + channel;
  const i10 = (y0 * width + x1) * 4 + channel;
  const i01 = (y1 * width + x0) * 4 + channel;
  const i11 = (y1 * width + x1) * 4 + channel;
  const a = data[i00] * (1 - tx) + data[i10] * tx;
  const b = data[i01] * (1 - tx) + data[i11] * tx;
  return a * (1 - ty) + b * ty;
}

function drawCanvasLens(rect, params, left, top, radius) {
  renderSceneCanvas(rect);
  if (!state.scenePixels || !state.mapPixels) return;
  resizeCanvas(refractCanvas, rect.width, rect.height);
  refractCtx.clearRect(0, 0, refractCanvas.width, refractCanvas.height);

  const lensW = Math.round(params.lensW);
  const lensH = Math.round(params.lensH);
  const out = refractCtx.createImageData(lensW, lensH);
  const outData = out.data;
  const scene = state.scenePixels.data;
  const sceneW = state.scenePixels.width;
  const sceneH = state.scenePixels.height;
  const map = state.mapPixels.data;
  const mapSize = state.mapPixels.width;
  const canvasStrength = 0.62;
  const rawBaseScale = Math.max(params.scaleX, params.scaleY);
  const baseScale = rawBaseScale * canvasStrength;
  const ratioX = rawBaseScale > 0 ? params.scaleX / rawBaseScale : 0;
  const ratioY = rawBaseScale > 0 ? params.scaleY / rawBaseScale : 0;
  const scaleR = baseScale * (1 + 0.2 * params.chroma);
  const scaleG = baseScale * (1 + 0.1 * params.chroma);
  const scaleB = baseScale;

  for (let y = 0; y < lensH; y++) {
    for (let x = 0; x < lensW; x++) {
      const outIndex = (y * lensW + x) * 4;
      if (!roundedRectInside(x + 0.5, y + 0.5, lensW, lensH, radius)) {
        outData[outIndex + 3] = 0;
        continue;
      }
      const mx = Math.max(
        0,
        Math.min(mapSize - 1, Math.floor((x / lensW) * mapSize)),
      );
      const my = Math.max(
        0,
        Math.min(mapSize - 1, Math.floor((y / lensH) * mapSize)),
      );
      const mapIndex = (my * mapSize + mx) * 4;
      const mapDx = (map[mapIndex] / 255 - 0.5) * ratioX;
      const mapDy = (map[mapIndex + 1] / 255 - 0.5) * ratioY;
      const dxR = mapDx * scaleR;
      const dyR = mapDy * scaleR;
      const dxG = mapDx * scaleG;
      const dyG = mapDy * scaleG;
      const dxB = mapDx * scaleB;
      const dyB = mapDy * scaleB;
      const gx = left + x;
      const gy = top + y;
      outData[outIndex] = sampleScene(
        scene,
        sceneW,
        sceneH,
        gx + dxR,
        gy + dyR,
        0,
      );
      outData[outIndex + 1] = sampleScene(
        scene,
        sceneW,
        sceneH,
        gx + dxG,
        gy + dyG,
        1,
      );
      outData[outIndex + 2] = sampleScene(
        scene,
        sceneW,
        sceneH,
        gx + dxB,
        gy + dyB,
        2,
      );
      outData[outIndex + 3] = 255;

      const spec = Math.max(0, map[mapIndex + 2] - 128) / 127;
      if (spec > 0) {
        const a = Math.min(0.52, spec * 0.52);
        outData[outIndex] = Math.round(outData[outIndex] * (1 - a) + 255 * a);
        outData[outIndex + 1] = Math.round(
          outData[outIndex + 1] * (1 - a) + 255 * a,
        );
        outData[outIndex + 2] = Math.round(
          outData[outIndex + 2] * (1 - a) + 255 * a,
        );
      }
    }
  }

  refractCtx.putImageData(out, Math.round(left), Math.round(top));
}

function clearCanvasLens() {
  if (refractCanvas.width && refractCanvas.height) {
    refractCtx.clearRect(0, 0, refractCanvas.width, refractCanvas.height);
  }
}

function updateControlLabels(params) {
  for (const [key, input] of Object.entries(controls)) {
    if (input.type === "checkbox") continue;
    const label = input.closest("label")?.querySelector("span");
    if (!label) continue;
    const name = label.textContent.split("  ")[0];
    const value = Number(input.value);
    label.textContent = `${name}  ${Number.isInteger(value) ? value : value.toFixed(2)}`;
  }
  stats.textContent = `${params.targetMode ? "target" : "source"} / ${state.metrics.activeFilter}${!params.targetMode && params.safariRefresh ? " / high cost" : ""}`;
}

function snapshotDebug(params) {
  const rect = stage.getBoundingClientRect();
  const lensPx = params.lensW * params.lensH;
  const sourcePx = Math.round(rect.width * rect.height);
  const canvasTarget = params.targetMode && state.isSafari;
  const filteredPx = canvasTarget ? lensPx : sourcePx;
  const footprintRatio = lensPx > 0 ? sourcePx / lensPx : 0;
  const expensiveSourcePath = !params.targetMode && params.safariRefresh;
  return {
    dragging: state.dragging,
    isSafari: state.isSafari,
    mode: params.targetMode ? "target" : "source",
    warning: expensiveSourcePath
      ? "Safari source mode refreshes a full-stage SVG filter every frame"
      : "",
    activeFilter: state.metrics.activeFilter,
    safariRefresh: params.safariRefresh,
    fullDragFilter: params.fullDragFilter,
    dragFrost: params.dragFrost,
    x: Number(state.x.toFixed(4)),
    y: Number(state.y.toFixed(4)),
    stage: {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    footprint: {
      sourcePx,
      lensPx,
      filteredPx,
      sourceToLens: Number(footprintRatio.toFixed(1)),
      filterPasses: canvasTarget
        ? 1
        : state.metrics.activeFilter === "full"
          ? 11
          : 6,
      estimatedPassPx: Math.round(
        filteredPx *
          (canvasTarget ? 1 : state.metrics.activeFilter === "full" ? 11 : 6),
      ),
    },
    metrics: {
      applyMs: Number(state.metrics.lastApplyMs.toFixed(2)),
      mapMs: Number(state.metrics.lastMapMs.toFixed(2)),
      frameGapMs: Number(state.metrics.lastFrameGapMs.toFixed(2)),
      fps: Number(state.metrics.fps.toFixed(1)),
      pointerMoves: state.metrics.pointerMoves,
      applyCount: state.metrics.applyCount,
      idRefreshes: state.metrics.idRefreshes,
      reason: state.metrics.lastReason,
    },
    filter: {
      target: targetLayer.style.filter,
      targetViewport: targetViewport.style.filter,
      source: sourceLayer.style.filter,
      canvas: refractCanvas.width && refractCanvas.height ? "active" : "",
      units: (params.targetMode ? targetFilter : filter).getAttribute(
        "filterUnits",
      ),
      mapX: (params.targetMode ? targetMapImage : mapImage).getAttribute("x"),
      mapY: (params.targetMode ? targetMapImage : mapImage).getAttribute("y"),
      mapW: (params.targetMode ? targetMapImage : mapImage).getAttribute(
        "width",
      ),
      mapH: (params.targetMode ? targetMapImage : mapImage).getAttribute(
        "height",
      ),
      clipPath: targetLayer.style.clipPath,
      targetBounds: {
        x: targetLayer.style.transform,
        viewportX: targetViewport.style.transform,
        w: targetLayer.style.width,
        h: targetLayer.style.height,
      },
    },
  };
}

function updatePerfReadout(params) {
  const snapshot = snapshotDebug(params);
  perfReadout.textContent = [
    `mode        ${snapshot.mode}`,
    `filter      ${snapshot.activeFilter}`,
    `dragging    ${snapshot.dragging}`,
    snapshot.warning ? `warning     ${snapshot.warning}` : "",
    `apply       ${snapshot.metrics.applyMs}ms`,
    `map regen   ${snapshot.metrics.mapMs}ms`,
    `frame gap   ${snapshot.metrics.frameGapMs}ms / ${snapshot.metrics.fps}fps`,
    `moves       ${snapshot.metrics.pointerMoves}`,
    `id refresh  ${snapshot.metrics.idRefreshes}`,
    `source px   ${snapshot.footprint.sourcePx}`,
    `lens px     ${snapshot.footprint.lensPx}`,
    `filter px   ${snapshot.footprint.filteredPx}`,
    `src/lens    ${snapshot.footprint.sourceToLens}x`,
    `pass px est ${snapshot.footprint.estimatedPassPx}`,
    `units       ${snapshot.filter.units}`,
    `map xywh    ${snapshot.filter.mapX}, ${snapshot.filter.mapY}, ${snapshot.filter.mapW}, ${snapshot.filter.mapH}`,
  ]
    .filter(Boolean)
    .join("\n");

  if (params.debugLogs) {
    const now = performance.now();
    if (now - state.metrics.lastLogAt > 500) {
      state.metrics.lastLogAt = now;
      console.log("[glass:perf]", snapshot);
    }
  }
}

window.__glassDebug = {
  snapshot: () => snapshotDebug(lensParams()),
};

function scheduleApply(reason = "unknown") {
  state.pendingReason = reason;
  if (state.frame) return;
  state.frame = requestAnimationFrame((now) => {
    if (state.metrics.lastFrameAt) {
      const gap = now - state.metrics.lastFrameAt;
      state.metrics.lastFrameGapMs = gap;
      const instantFps = gap > 0 ? 1000 / gap : 0;
      state.metrics.fps = state.metrics.fps
        ? state.metrics.fps * 0.82 + instantFps * 0.18
        : instantFps;
    }
    state.metrics.lastFrameAt = now;
    state.frame = 0;
    applyLens();
  });
}

function applyLens() {
  const applyStarted = performance.now();
  const params = lensParams();
  state.metrics.applyCount += 1;
  state.metrics.lastReason = state.pendingReason;
  const rect = stage.getBoundingClientRect();
  const lensW = params.lensW;
  const lensH = params.lensH;
  const radius = Math.max(0, Math.min(params.radius, lensW / 2, lensH / 2));
  const left = state.x * rect.width - lensW / 2;
  const top = state.y * rect.height - lensH / 2;
  const targetMode = params.targetMode;
  const useCanvasTarget = targetMode && state.isSafari;
  const bleed = targetMode ? targetBleed(params) : 0;
  const filterX = targetMode ? Math.max(0, left - bleed) : 0;
  const filterY = targetMode ? Math.max(0, top - bleed) : 0;
  const filterRight = targetMode
    ? Math.min(rect.width, left + lensW + bleed)
    : rect.width;
  const filterBottom = targetMode
    ? Math.min(rect.height, top + lensH + bleed)
    : rect.height;
  const filterUnits = "userSpaceOnUse";
  const filterW = filterRight - filterX;
  const filterH = filterBottom - filterY;
  const mapX = left;
  const mapY = top;
  const mapW = lensW;
  const mapH = lensH;
  const maskX = left;
  const maskY = top;
  const maskW = lensW;
  const maskH = lensH;

  const key = mapKey(params);
  const mapChanged = key !== state.lastMapKey;
  if (mapChanged) {
    const mapStarted = performance.now();
    const mapUrl = generateDisplacementMap(params);
    state.metrics.lastMapMs = performance.now() - mapStarted;
    setAttr(mapImage, "href", mapUrl);
    setAttr(fastMapImage, "href", mapUrl);
    setAttr(targetMapImage, "href", mapUrl);
    state.lastMapKey = key;
  }

  const filterGeometryChanged =
    state.metrics.lastReason !== "pointermove" || !targetMode || mapChanged;
  if ((params.safariRefresh && filterGeometryChanged) || mapChanged) {
    state.version += 1;
    state.filterId = `glass-filter-${state.version}`;
    state.fastFilterId = `glass-filter-fast-${state.version}`;
    state.targetFilterId = `glass-filter-target-${state.version}`;
    filter.id = state.filterId;
    fastFilter.id = state.fastFilterId;
    targetFilter.id = state.targetFilterId;
    state.metrics.idRefreshes += 1;
  }

  for (const filterEl of [filter, fastFilter]) {
    setAttr(filterEl, "x", filterX);
    setAttr(filterEl, "y", filterY);
    setAttr(filterEl, "width", filterW);
    setAttr(filterEl, "height", filterH);
    setAttr(filterEl, "filterUnits", filterUnits);
    setAttr(filterEl, "primitiveUnits", filterUnits);
  }
  setAttr(targetFilter, "x", "0");
  setAttr(targetFilter, "y", "0");
  setAttr(targetFilter, "width", rect.width);
  setAttr(targetFilter, "height", rect.height);
  setAttr(targetFilter, "filterUnits", filterUnits);
  setAttr(targetFilter, "primitiveUnits", filterUnits);

  for (const imageEl of [mapImage, fastMapImage, targetMapImage]) {
    setAttr(imageEl, "x", mapX);
    setAttr(imageEl, "y", mapY);
    setAttr(imageEl, "width", mapW);
    setAttr(imageEl, "height", mapH);
  }
  for (const maskEl of [lensMask, fastLensMask, targetLensMask]) {
    setAttr(maskEl, "x", maskX);
    setAttr(maskEl, "y", maskY);
    setAttr(maskEl, "width", maskW);
    setAttr(maskEl, "height", maskH);
  }

  const matrix = colorMatrixForScale(params.scaleX, params.scaleY);
  setAttr(mapMatrix, "values", matrix);
  setAttr(fastMapMatrix, "values", matrix);
  setAttr(targetMapMatrix, "values", matrix);
  const useFullFilter = targetMode || !state.dragging || params.fullDragFilter;
  const blur = useFullFilter ? params.blur * 0.18 : 0;
  setAttr(sourceBlur, "stdDeviation", String(blur));
  setAttr(targetSourceBlur, "stdDeviation", String(blur));

  const baseScale = Math.max(params.scaleX, params.scaleY);
  setAttr(dispR, "scale", baseScale * (1 + 0.2 * params.chroma));
  setAttr(dispG, "scale", baseScale * (1 + 0.1 * params.chroma));
  setAttr(dispB, "scale", baseScale);
  setAttr(fastDisp, "scale", baseScale);
  setAttr(targetDispR, "scale", baseScale * (1 + 0.2 * params.chroma));
  setAttr(targetDispG, "scale", baseScale * (1 + 0.1 * params.chroma));
  setAttr(targetDispB, "scale", baseScale);

  const specStrength = 1.8;
  setAttr(
    specMatrix,
    "values",
    `0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 ${specStrength} 0 ${-0.5 * specStrength}`,
  );
  setAttr(specMatrix, "x", maskX);
  setAttr(specMatrix, "y", maskY);
  setAttr(specMatrix, "width", maskW);
  setAttr(specMatrix, "height", maskH);
  setAttr(targetSpecMatrix, "values", specMatrix.getAttribute("values"));
  setAttr(targetSpecMatrix, "x", maskX);
  setAttr(targetSpecMatrix, "y", maskY);
  setAttr(targetSpecMatrix, "width", maskW);
  setAttr(targetSpecMatrix, "height", maskH);

  const transform = `translate3d(${left}px, ${top}px, 0)`;
  for (const el of [frostLayer, lensOutline]) {
    setStyle(el, "transform", transform);
    setStyle(el, "width", `${lensW}px`);
    setStyle(el, "height", `${lensH}px`);
    setStyle(el, "borderRadius", `${radius}px`);
  }
  stage.classList.toggle("drag-frost", state.dragging && params.dragFrost);
  const frostBlur =
    !state.dragging || params.dragFrost
      ? `blur(${state.dragging ? Math.min(params.blur, 1.2) : params.blur}px)`
      : "none";
  setStyle(frostLayer, "backdropFilter", frostBlur);
  frostLayer.style.setProperty("-webkit-backdrop-filter", frostBlur);

  stage.classList.toggle("target-mode", targetMode);
  stage.classList.toggle("canvas-mode", useCanvasTarget);
  stage.classList.toggle("source-warning", !targetMode && params.safariRefresh);
  const activeFilterId = useFullFilter ? state.filterId : state.fastFilterId;
  const activeTargetFilterId = state.targetFilterId;
  state.metrics.activeFilter = useCanvasTarget
    ? "canvas"
    : useFullFilter
      ? "full"
      : "fast";
  if (useCanvasTarget) {
    drawCanvasLens(rect, params, left, top, radius);
    setStyle(sourceLayer, "filter", "");
    setStyle(targetLayer, "filter", "");
    setStyle(targetLayer, "clipPath", "");
    setStyle(targetLayer, "transform", "");
    setStyle(targetLayer, "width", "");
    setStyle(targetLayer, "height", "");
    setStyle(targetLayer, "borderRadius", "");
    setStyle(targetViewport, "filter", "");
    setStyle(targetViewport, "transform", "");
    setStyle(targetViewport, "width", "");
    setStyle(targetViewport, "height", "");
    setStyle(targetContent, "width", "");
    setStyle(targetContent, "height", "");
    setStyle(targetContent, "transform", "");
  } else if (targetMode) {
    clearCanvasLens();
    setStyle(targetLayer, "transform", "");
    setStyle(targetLayer, "width", `${rect.width}px`);
    setStyle(targetLayer, "height", `${rect.height}px`);
    setStyle(targetLayer, "borderRadius", "");
    setStyle(targetLayer, "filter", "");
    setStyle(targetLayer, "clipPath", "");
    setStyle(targetViewport, "transform", "");
    setStyle(targetViewport, "width", `${rect.width}px`);
    setStyle(targetViewport, "height", `${rect.height}px`);
    setStyle(targetViewport, "filter", `url(#${activeTargetFilterId})`);
    setStyle(targetContent, "width", `${rect.width}px`);
    setStyle(targetContent, "height", `${rect.height}px`);
    setStyle(targetContent, "transform", "");
    setStyle(sourceLayer, "filter", "");
  } else {
    clearCanvasLens();
    setStyle(sourceLayer, "filter", `url(#${activeFilterId})`);
    setStyle(targetLayer, "filter", "");
    setStyle(targetLayer, "clipPath", "");
    setStyle(targetLayer, "transform", "");
    setStyle(targetLayer, "width", "");
    setStyle(targetLayer, "height", "");
    setStyle(targetLayer, "borderRadius", "");
    setStyle(targetViewport, "filter", "");
    setStyle(targetViewport, "transform", "");
    setStyle(targetViewport, "width", "");
    setStyle(targetViewport, "height", "");
    setStyle(targetContent, "width", "");
    setStyle(targetContent, "height", "");
    setStyle(targetContent, "transform", "");
  }

  state.metrics.lastApplyMs = performance.now() - applyStarted;
  const now = performance.now();
  const shouldUpdateUi = !state.dragging || now - state.metrics.lastUiAt > 120;
  if (shouldUpdateUi) {
    state.metrics.lastUiAt = now;
    updateControlLabels(params);
    updatePerfReadout(params);
  }
}

function pointerPosition(event) {
  const rect = stage.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height,
  };
}

function clampLens() {
  const params = lensParams();
  const rect = stage.getBoundingClientRect();
  const minX = params.lensW / 2 / rect.width;
  const maxX = 1 - minX;
  const minY = params.lensH / 2 / rect.height;
  const maxY = 1 - minY;
  state.x = Math.max(minX, Math.min(maxX, state.x));
  state.y = Math.max(minY, Math.min(maxY, state.y));
}

stage.addEventListener("pointerdown", (event) => {
  const pos = pointerPosition(event);
  state.dragging = true;
  state.metrics.pointerMoves = 0;
  stage.classList.add("is-dragging");
  state.dragOffsetX = pos.x - state.x;
  state.dragOffsetY = pos.y - state.y;
  stage.setPointerCapture(event.pointerId);
  scheduleApply("pointerdown");
});

stage.addEventListener("pointermove", (event) => {
  if (!state.dragging) return;
  state.metrics.pointerMoves += 1;
  const pos = pointerPosition(event);
  state.x = pos.x - state.dragOffsetX;
  state.y = pos.y - state.dragOffsetY;
  clampLens();
  scheduleApply("pointermove");
});

stage.addEventListener("pointerup", (event) => {
  state.dragging = false;
  stage.classList.remove("is-dragging");
  stage.releasePointerCapture(event.pointerId);
  scheduleApply("pointerup");
});

stage.addEventListener("pointercancel", () => {
  state.dragging = false;
  stage.classList.remove("is-dragging");
  scheduleApply("pointercancel");
});

for (const input of Object.values(controls)) {
  input.addEventListener("input", () => {
    clampLens();
    scheduleApply(input.id);
  });
}

new ResizeObserver(() => {
  clampLens();
  scheduleApply("resize");
}).observe(stage);

applyLens();
