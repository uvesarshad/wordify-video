const canvas = document.getElementById("preview-canvas");
const ctx = canvas.getContext("2d");

const scriptInput = document.getElementById("script-input");
const themeSelect = document.getElementById("theme-select");
const chunkSizeInput = document.getElementById("chunk-size");
const paceInput = document.getElementById("pace");
const motionInput = document.getElementById("motion");
const playbackRateSelect = document.getElementById("playback-rate");
const voiceVolumeInput = document.getElementById("voice-volume");

const playButton = document.getElementById("play-button");
const restartButton = document.getElementById("restart-button");
const reshuffleButton = document.getElementById("reshuffle-button");
const avoidOverlapButton = document.getElementById("avoid-overlap-button");
const aiArrangeButton = document.getElementById("ai-arrange-button");
const aiBalanceButton = document.getElementById("ai-balance-button");
const aiAlignButton = document.getElementById("ai-align-button");
const fitAudioButton = document.getElementById("fit-audio-button");
const exportButton = document.getElementById("export-button");

const chunkCount = document.getElementById("chunk-count");
const durationEl = document.getElementById("duration");
const statusEl = document.getElementById("status");
const timelineScrubber = document.getElementById("timeline-scrubber");
const timelineTracks = document.getElementById("timeline-tracks");
const playheadTime = document.getElementById("playhead-time");

const clipList = document.getElementById("clip-list");
const selectedLabel = document.getElementById("selected-label");
const selectedTextInput = document.getElementById("selected-text");
const selectedSizeInput = document.getElementById("selected-size");
const selectedRotationInput = document.getElementById("selected-rotation");
const selectedXInput = document.getElementById("selected-x");
const selectedYInput = document.getElementById("selected-y");
const selectedColorInput = document.getElementById("selected-color");
const selectedAlign = document.getElementById("selected-align");

const voiceoverFileInput = document.getElementById("voiceover-file");
const voiceoverEnabledInput = document.getElementById("voiceover-enabled");
const voiceoverAudio = document.getElementById("voiceover-audio");
const voiceoverStatus = document.getElementById("voiceover-status");
const voiceoverDuration = document.getElementById("voiceover-duration");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;

const INSPECTOR_INPUTS = [
  selectedTextInput,
  selectedSizeInput,
  selectedRotationInput,
  selectedXInput,
  selectedYInput,
  selectedColorInput,
];

// Each entry: style (CSS font-style), weight (CSS font-weight), family
const FONT_DEFS = [
  { style: "",       weight: "900", family: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif' },
  { style: "",       weight: "400", family: '"Bebas Neue", Impact, "Arial Narrow Bold", sans-serif' },
  { style: "",       weight: "400", family: '"Anton", Impact, sans-serif' },
  { style: "",       weight: "700", family: '"Oswald", "Arial Narrow", Arial, sans-serif' },
  { style: "",       weight: "900", family: '"Arial Black", "Arial Bold", Gadget, sans-serif' },
  { style: "italic", weight: "700", family: 'Georgia, "Times New Roman", Times, serif' },
  { style: "",       weight: "700", family: '"Courier New", Courier, monospace' },
  { style: "",       weight: "400", family: '"Permanent Marker", cursive, sans-serif' },
];

const themes = {
  midnight: {
    background: ["#030303", "#080808"],
    accents: ["#d55cff", "#d9ff00", "#f8f8f3", "#ff4d6a", "#00e5ff", "#ff8c00", "#7fff00", "#ff69b4"],
    shadow: "rgba(0, 0, 0, 0.34)",
    flareA: "rgba(213, 92, 255, 0.18)",
    flareB: "rgba(217, 255, 0, 0.14)",
    selection: "#d9ff00",
  },
  paper: {
    background: ["#f4f1ea", "#ffffff"],
    accents: ["#101010", "#cc00cc", "#007700", "#cc2200", "#0044cc", "#ff6600", "#006644", "#880000"],
    shadow: "rgba(0, 0, 0, 0.12)",
    flareA: "rgba(213, 92, 255, 0.12)",
    flareB: "rgba(92, 255, 0, 0.10)",
    selection: "#cc00cc",
  },
  automation: {
    background: ["#247f1d", "#196115"],
    accents: ["#f6f5f0", "#101010", "#d9ff00", "#ff4d6a", "#00cfff", "#ffcc00", "#ffffff", "#ff8c00"],
    shadow: "rgba(0, 0, 0, 0.20)",
    flareA: "rgba(246, 245, 240, 0.10)",
    flareB: "rgba(16, 16, 16, 0.12)",
    selection: "#f6f5f0",
  },
};

// Kept for AI arrange (used with single-item scenes it becomes a no-op offset)
const scenePatterns = {
  1: [[0, 0]],
  2: [[-0.19, -0.03], [0.18, 0.08]],
  3: [[-0.22, -0.11], [0.18, -0.02], [-0.02, 0.19]],
  4: [[-0.22, -0.12], [0.18, -0.08], [-0.18, 0.19], [0.18, 0.17]],
};

const state = {
  seed: Math.floor(Math.random() * 1_000_000),
  timeline: [],
  scenes: [],
  baseDuration: 0,
  duration: 0,
  currentTime: 0,
  playbackStartedAt: 0,
  playbackOrigin: 0,
  playing: false,
  rafId: 0,
  exporting: false,
  fps: 30,
  selectionId: null,
  drag: null,
  rebuildTimer: 0,
  voiceoverUrl: "",
  voiceoverName: "",
  audioDuration: 0,
  camera: {
    x: 0, y: 0, rot: 0, scale: 1,
    tx: 0, ty: 0, trot: 0, tscale: 1,
    nextTargetAt: 0,
  },
};

function createRng(seed) {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return ((value >>> 0) % 1_000_000) / 1_000_000;
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutExpo(t) {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function formatTime(seconds) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const secs = safe - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${secs.toFixed(1).padStart(4, "0")}`;
}

function tokenize(text) {
  return (text.match(/\S+/g) || []).slice(0, 160);
}

function buildChunks(tokens, maxChunkSize, rng) {
  const chunks = [];
  let index = 0;

  while (index < tokens.length) {
    const remaining = tokens.length - index;
    const roll = rng();
    let size = 1;

    if (remaining > 3 && roll > 0.62) {
      size = Math.min(maxChunkSize, 3 + Math.round(rng()));
    } else if (remaining > 1 && roll > 0.18) {
      size = Math.min(maxChunkSize, 2);
    }

    size = clamp(size, 1, Math.min(maxChunkSize, remaining));
    chunks.push(tokens.slice(index, index + size).join(" "));
    index += size;
  }

  return chunks;
}

// Pick a rotation: mostly small angles, occasionally ±45°, sometimes exactly ±90°
function pickRotation(rng) {
  const roll = rng();
  if (roll > 0.88) return Math.PI / 2;
  if (roll > 0.76) return -Math.PI / 2;
  if (roll > 0.60) return (rng() - 0.5) * (Math.PI / 2.2);
  return (rng() - 0.5) * 0.45;
}

function getDisplayFont(fontSize, fontDef) {
  const def = fontDef || FONT_DEFS[0];
  const parts = [def.style, def.weight, `${fontSize}px`, def.family].filter((s) => s);
  return parts.join(" ");
}

function measureTextBlock(text, fontSize, fontDef) {
  ctx.save();
  ctx.font = getDisplayFont(fontSize, fontDef);
  const width = ctx.measureText(text).width;
  ctx.restore();
  return { width, height: fontSize * 0.9 };
}

function refreshItemMetrics(item) {
  const measured = measureTextBlock(item.text, item.fontSize, item.fontDef);
  item.textWidth = measured.width;
  item.textHeight = measured.height;
}

function getLocalBounds(item) {
  if (item.align === "left") {
    return {
      left: 0,
      right: item.textWidth,
      top: -item.textHeight / 2,
      bottom: item.textHeight / 2,
    };
  }

  if (item.align === "right") {
    return {
      left: -item.textWidth,
      right: 0,
      top: -item.textHeight / 2,
      bottom: item.textHeight / 2,
    };
  }

  return {
    left: -item.textWidth / 2,
    right: item.textWidth / 2,
    top: -item.textHeight / 2,
    bottom: item.textHeight / 2,
  };
}

function getStaticBounds(item) {
  const local = getLocalBounds(item);
  return {
    left: item.x + local.left,
    right: item.x + local.right,
    top: item.y + local.top,
    bottom: item.y + local.bottom,
  };
}

function constrainItem(item) {
  refreshItemMetrics(item);
  const bounds = getStaticBounds(item);
  let shiftX = 0;
  let shiftY = 0;

  if (bounds.left < 24) shiftX += 24 - bounds.left;
  if (bounds.right > WIDTH - 24) shiftX -= bounds.right - (WIDTH - 24);
  if (bounds.top < 24) shiftY += 24 - bounds.top;
  if (bounds.bottom > HEIGHT - 24) shiftY -= bounds.bottom - (HEIGHT - 24);

  item.x += shiftX;
  item.y += shiftY;
}

function boxesOverlap(a, b, padding = 24) {
  const boxA = getStaticBounds(a);
  const boxB = getStaticBounds(b);

  return !(
    boxA.right + padding < boxB.left ||
    boxA.left - padding > boxB.right ||
    boxA.bottom + padding < boxB.top ||
    boxA.top - padding > boxB.bottom
  );
}

function getSceneItems(sceneIndex) {
  return state.timeline.filter((item) => item.sceneIndex === sceneIndex);
}

function chooseAlignmentForX(x) {
  if (x < WIDTH * 0.34) return "left";
  if (x > WIDTH * 0.66) return "right";
  return "center";
}

function chooseRotationForItem(item, lane, total) {
  const sideBias = item.x < WIDTH * 0.42 ? -1 : item.x > WIDTH * 0.58 ? 1 : 0;
  const densityBias = total > 1 ? (lane - (total - 1) / 2) * 0.08 : 0;
  const emphasis = item.fontSize > 160 ? 0.65 : 1;
  return clamp((sideBias * 0.11 + densityBias) * emphasis, -0.28, 0.28);
}

function resolveSceneCollisions(sceneIndex, preserveId = null) {
  const items = getSceneItems(sceneIndex);
  if (items.length < 2) return;

  const sorted = [...items].sort((a, b) => {
    if (a.id === preserveId) return -1;
    if (b.id === preserveId) return 1;
    return b.fontSize - a.fontSize;
  });

  const placed = [];

  sorted.forEach((item) => {
    const originX = item.x;
    const originY = item.y;
    refreshItemMetrics(item);
    constrainItem(item);

    let resolved = item.id === preserveId;

    for (let attempt = 0; attempt < 90 && !resolved; attempt += 1) {
      const angle = attempt * 0.83;
      const radius = attempt === 0 ? 0 : 18 + attempt * 7;
      item.x = originX + Math.cos(angle) * radius;
      item.y = originY + Math.sin(angle) * radius * 0.78;
      constrainItem(item);

      const collision = placed.some((other) => boxesOverlap(item, other));
      if (!collision) resolved = true;
    }

    if (!resolved) {
      item.x = originX;
      item.y = originY;
      constrainItem(item);
    }

    placed.push(item);
  });
}

function applySmartAlignment(sceneIndex = null) {
  const targetScenes = sceneIndex === null
    ? state.scenes.map((scene) => scene.index)
    : [sceneIndex];

  targetScenes.forEach((index) => {
    const items = getSceneItems(index);
    items.forEach((item, lane) => {
      item.align = chooseAlignmentForX(item.x);
      item.rotation = chooseRotationForItem(item, lane, items.length);
      constrainItem(item);
    });
    resolveSceneCollisions(index);
  });

  renderClipList();
  renderTimelineBars();
  renderFrame(state.currentTime);
}

function aiArrangeScene(scene) {
  const items = getSceneItems(scene.index).sort((a, b) => b.fontSize - a.fontSize);
  const pattern = scenePatterns[items.length] || scenePatterns[4];

  items.forEach((item, index) => {
    const offset = pattern[index] || [0, 0];
    item.x = scene.anchorX + offset[0] * WIDTH;
    item.y = scene.anchorY + offset[1] * HEIGHT;
    item.align = chooseAlignmentForX(item.x);
    item.rotation = chooseRotationForItem(item, index, items.length);
    constrainItem(item);
  });

  resolveSceneCollisions(scene.index);
}

function applyAiArrange() {
  state.scenes.forEach((scene) => aiArrangeScene(scene));
  setStatus("AI arranged");
  renderClipList();
  renderTimelineBars();
  renderFrame(state.currentTime);
}

function applyAiBalance() {
  const selected = getSelectedItem();
  const targetScene = selected ? selected.sceneIndex : null;
  applySmartAlignment(targetScene);
  setStatus(targetScene === null ? "AI balanced" : `Balanced ${state.scenes[targetScene].label}`);
}

function avoidAllOverlaps() {
  // In subtitle mode, resolve collisions among items visible at current time
  const visible = state.timeline.filter(
    (item) => item.start <= state.currentTime && item.end >= state.currentTime
  );
  if (visible.length < 2) {
    setStatus("Nothing to resolve");
    return;
  }

  const sorted = [...visible].sort((a, b) => {
    if (a.id === state.selectionId) return -1;
    if (b.id === state.selectionId) return 1;
    return b.fontSize - a.fontSize;
  });

  const placed = [];
  sorted.forEach((item) => {
    const originX = item.x;
    const originY = item.y;
    refreshItemMetrics(item);
    constrainItem(item);
    let resolved = item.id === state.selectionId;

    for (let attempt = 0; attempt < 90 && !resolved; attempt += 1) {
      const angle = attempt * 0.83;
      const radius = attempt === 0 ? 0 : 18 + attempt * 7;
      item.x = originX + Math.cos(angle) * radius;
      item.y = originY + Math.sin(angle) * radius * 0.78;
      constrainItem(item);
      if (!placed.some((other) => boxesOverlap(item, other))) resolved = true;
    }

    if (!resolved) {
      item.x = originX;
      item.y = originY;
      constrainItem(item);
    }
    placed.push(item);
  });

  setStatus("Overlaps resolved");
  renderClipList();
  renderTimelineBars();
  renderFrame(state.currentTime);
}

function getVoiceoverEnabled() {
  return voiceoverEnabledInput.checked && Boolean(state.voiceoverUrl);
}

function getCompositeDuration() {
  return Math.max(state.baseDuration, getVoiceoverEnabled() ? state.audioDuration : 0);
}

function updateDuration() {
  state.duration = getCompositeDuration();
  durationEl.textContent = `${state.duration.toFixed(1)}s`;
  updatePlayheadUi();
}

function updateVoiceoverUi() {
  voiceoverStatus.textContent = state.voiceoverName || "None";
  voiceoverDuration.textContent = `${state.audioDuration.toFixed(1)}s`;
}

function syncVoiceoverElement() {
  voiceoverAudio.volume = Number(voiceVolumeInput.value);
  voiceoverAudio.muted = !voiceoverEnabledInput.checked;
  voiceoverAudio.playbackRate = Number(playbackRateSelect.value);
}

function pauseVoiceover() {
  voiceoverAudio.pause();
}

function seekVoiceover(time) {
  if (!getVoiceoverEnabled() || !state.audioDuration) return;
  try {
    voiceoverAudio.currentTime = clamp(time, 0, Math.max(0, state.audioDuration - 0.04));
  } catch (_) {}
}

function startVoiceoverForPreview() {
  if (!getVoiceoverEnabled()) return;
  syncVoiceoverElement();
  seekVoiceover(state.currentTime);
  voiceoverAudio.play().catch(() => setStatus("Voice-over blocked by browser"));
}

function releaseVoiceoverUrl() {
  if (state.voiceoverUrl) {
    URL.revokeObjectURL(state.voiceoverUrl);
    state.voiceoverUrl = "";
  }
  state.voiceoverName = "";
}

function fitTimelineToAudio() {
  if (!state.audioDuration) { setStatus("Load audio first"); return; }
  if (state.baseDuration <= 0) return;

  const currentPace = Number(paceInput.value);
  const targetPace = clamp(currentPace * (state.baseDuration / state.audioDuration), 0.55, 1.8);
  paceInput.value = targetPace.toFixed(2);
  rebuildTimeline();
  setStatus("Timeline fitted to audio");
  playTimeline(true);
}

// ─── Layout engine ──────────────────────────────────────────────────────────
//
// Subtitle kinetic mode: words appear one by one, each with its own lifetime.
// A rolling window of ~4 words is visible at any time. Every word gets a
// random position, size, rotation (including ±90°), font, and color.
//
function createLayout(chunks, themeName, seed) {
  const rng = createRng(seed);
  const theme = themes[themeName];
  const items = [];
  const scenes = [];

  // beat = time between successive words appearing
  const beat = 0.46 / Number(paceInput.value);
  // Each word stays visible for holdFactor × beat → ~4 words on screen at once
  const HOLD_FACTOR = 4.2;
  const motionStrength = Number(motionInput.value);

  let cursor = 0;

  chunks.forEach((chunk, globalIndex) => {
    const start = cursor;
    const holdDuration = beat * HOLD_FACTOR * (0.82 + rng() * 0.36);
    const end = start + holdDuration;

    // Quick snap-in, quick snap-out for subtitle feel
    const intro = clamp(0.18 * motionStrength + rng() * 0.12, 0.10, 0.32);
    const exitWindow = clamp(0.22 * motionStrength + rng() * 0.12, 0.14, 0.40);
    const exitStart = end - exitWindow;

    // Random position across canvas (generous margin so camera pan stays in-bounds)
    const margin = 110;
    const x = margin + rng() * (WIDTH - margin * 2);
    const y = margin + rng() * (HEIGHT - margin * 2);

    // Font size: big range, biased toward large, with rare giants and rare small
    const phraseLen = chunk.replace(/\s/g, "").length;
    let fontSize = clamp(210 - phraseLen * 5.5 + (rng() - 0.5) * 90, 52, 260);
    if (rng() > 0.82) fontSize = clamp(fontSize * 1.55, 110, 300); // occasional giant
    if (rng() > 0.88) fontSize = clamp(fontSize * 0.42, 36, 72);   // occasional tiny

    // Font family: pick randomly from FONT_DEFS
    const fontDef = FONT_DEFS[Math.floor(rng() * FONT_DEFS.length)];

    // Ensure text fits horizontally
    const measured = measureTextBlock(chunk, fontSize, fontDef);
    if (measured.width > WIDTH * 0.82) {
      fontSize *= (WIDTH * 0.82) / measured.width;
    }

    // Rotation: weighted — mostly small, sometimes ±45°, sometimes exactly ±90°
    const rotation = pickRotation(rng);

    // Color: pick from expanded theme palette
    const color = theme.accents[Math.floor(rng() * theme.accents.length)];

    const item = {
      id: `clip-${globalIndex}`,
      order: globalIndex,
      text: chunk,
      sceneIndex: globalIndex, // each word is its own scene entry
      color,
      fontSize,
      fontDef,
      x,
      y,
      align: "center",
      rotation,
      start,
      intro,
      end,
      exitStart,
      fromScale: rng() > 0.5 ? 0.28 : 2.1,
      exitScale: rng() > 0.5 ? 1.22 : 0.72,
      wobble: (rng() - 0.5) * 10,
      floatX: (rng() - 0.5) * 14,
      floatY: (rng() - 0.5) * 10,
    };

    refreshItemMetrics(item);
    item.align = chooseAlignmentForX(item.x);
    constrainItem(item);
    items.push(item);

    scenes.push({
      index: globalIndex,
      start,
      end,
      label: `W${globalIndex + 1}`,
      color,
      anchorX: x,
      anchorY: y,
    });

    // Stagger the next word's appearance (slight irregularity feels natural)
    cursor += beat * (0.80 + rng() * 0.40);
  });

  return {
    items,
    scenes,
    baseDuration: cursor + HOLD_FACTOR * beat + 0.5,
  };
}

// ─── Camera pan system ───────────────────────────────────────────────────────
//
// The camera slowly drifts to random targets, creating a panning/zooming feel
// that makes the whole composition feel alive between word appearances.
//
function resetCamera() {
  const cam = state.camera;
  cam.x = 0; cam.y = 0; cam.rot = 0; cam.scale = 1;
  cam.tx = 0; cam.ty = 0; cam.trot = 0; cam.tscale = 1;
  cam.nextTargetAt = 0;
}

function updateCamera(elapsed) {
  const cam = state.camera;
  const strength = Number(motionInput.value);

  if (elapsed >= cam.nextTargetAt) {
    cam.tx = (Math.random() - 0.5) * 100 * strength;
    cam.ty = (Math.random() - 0.5) * 66 * strength;
    cam.trot = (Math.random() - 0.5) * 0.048 * strength;
    cam.tscale = 1 + (Math.random() - 0.5) * 0.07 * strength;
    cam.nextTargetAt = elapsed + 2.2 + Math.random() * 2.8;
  }

  // Smooth lerp toward target — feels organic, never jumpy
  const s = 0.016;
  cam.x += (cam.tx - cam.x) * s;
  cam.y += (cam.ty - cam.y) * s;
  cam.rot += (cam.trot - cam.rot) * s;
  cam.scale += (cam.tscale - cam.scale) * s;
}

// ─── Selection ───────────────────────────────────────────────────────────────

function getSelectedItem() {
  return state.timeline.find((item) => item.id === state.selectionId) || null;
}

function setInspectorDisabled(disabled) {
  INSPECTOR_INPUTS.forEach((input) => { input.disabled = disabled; });
  selectedAlign.querySelectorAll("button").forEach((button) => { button.disabled = disabled; });
}

function syncInspector() {
  const item = getSelectedItem();
  setInspectorDisabled(!item);

  if (!item) {
    selectedLabel.textContent = "No selection";
    selectedTextInput.value = "";
    selectedSizeInput.value = "96";
    selectedRotationInput.value = "0";
    selectedXInput.value = "640";
    selectedYInput.value = "360";
    return;
  }

  selectedLabel.textContent = `${state.scenes[item.sceneIndex].label} • ${item.id}`;
  selectedTextInput.value = item.text;
  selectedSizeInput.value = String(Math.round(item.fontSize));
  selectedRotationInput.value = String(Math.round((item.rotation * 180) / Math.PI));
  selectedXInput.value = String(Math.round(item.x));
  selectedYInput.value = String(Math.round(item.y));
  selectedColorInput.value = normalizeColor(item.color);

  selectedAlign.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.align === item.align);
  });
}

function normalizeColor(color) {
  if (color.startsWith("#")) return color;

  const temp = document.createElement("div");
  temp.style.color = color;
  document.body.appendChild(temp);
  const computed = getComputedStyle(temp).color;
  document.body.removeChild(temp);
  const parts = computed.match(/\d+/g) || ["255", "255", "255"];
  return `#${parts.slice(0, 3).map((v) => Number(v).toString(16).padStart(2, "0")).join("")}`;
}

function selectItem(id) {
  state.selectionId = id;
  syncInspector();
  renderClipList();
  renderTimelineBars();
  renderFrame(state.currentTime);
}

// ─── UI rendering ─────────────────────────────────────────────────────────────

function renderClipList() {
  clipList.innerHTML = "";
  state.timeline.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `clip-chip${item.id === state.selectionId ? " active" : ""}`;
    button.dataset.itemId = item.id;
    button.textContent = `${state.scenes[item.sceneIndex].label}: ${item.text}`;
    clipList.appendChild(button);
  });
}

function renderTimelineBars() {
  timelineTracks.innerHTML = "";
  state.scenes.forEach((scene) => {
    const row = document.createElement("div");
    row.className = "timeline-row";

    const label = document.createElement("div");
    label.className = "timeline-label";
    label.textContent = scene.label;

    const lane = document.createElement("div");
    lane.className = "timeline-lane";

    getSceneItems(scene.index).forEach((item) => {
      const bar = document.createElement("div");
      bar.className = `timeline-bar${item.id === state.selectionId ? " active" : ""}`;
      bar.style.left = `${(item.start / Math.max(state.duration, 0.001)) * 100}%`;
      bar.style.width = `${Math.max(2, ((item.end - item.start) / Math.max(state.duration, 0.001)) * 100)}%`;
      bar.style.background = item.color;
      bar.dataset.itemId = item.id;
      bar.title = item.text;
      lane.appendChild(bar);
    });

    row.append(label, lane);
    timelineTracks.appendChild(row);
  });
}

function updatePlayheadUi() {
  const max = Math.max(1, Math.round(state.duration * 1000));
  timelineScrubber.max = String(max);
  timelineScrubber.value = String(Math.min(max, Math.round(state.currentTime * 1000)));
  playheadTime.textContent = `${formatTime(state.currentTime)} / ${formatTime(state.duration)}`;
}

function setStatus(message) {
  statusEl.textContent = message;
}

function setCurrentTime(time, options = {}) {
  state.currentTime = clamp(time, 0, state.duration);
  renderFrame(state.currentTime);
  updatePlayheadUi();
  if (options.syncAudio) seekVoiceover(state.currentTime);
}

// ─── Timeline rebuild ─────────────────────────────────────────────────────────

function rebuildTimeline(options = {}) {
  const text = scriptInput.value.trim();
  const tokens = tokenize(text);
  const rng = createRng(state.seed);
  const chunks = buildChunks(tokens, Number(chunkSizeInput.value), rng);
  const previousSelection = state.selectionId;
  const { items, scenes, baseDuration } = createLayout(chunks, themeSelect.value, state.seed + 17);

  state.timeline = items;
  state.scenes = scenes;
  state.baseDuration = baseDuration;

  chunkCount.textContent = String(items.length);
  updateDuration();
  renderClipList();
  renderTimelineBars();

  const nextSelection =
    state.timeline.find((item) => item.id === previousSelection)?.id ||
    state.timeline[0]?.id ||
    null;

  selectItem(nextSelection);

  if (options.restart !== false) {
    setCurrentTime(0, { syncAudio: true });
    return;
  }
  setCurrentTime(Math.min(state.currentTime, state.duration), { syncAudio: true });
}

// ─── Canvas rendering ─────────────────────────────────────────────────────────

function drawBackground(time, themeName) {
  const theme = themes[themeName];
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, theme.background[0]);
  gradient.addColorStop(1, theme.background[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const pulse = Math.sin(time * 0.0012) * 0.5 + 0.5;

  const flareA = ctx.createRadialGradient(WIDTH * 0.24, HEIGHT * 0.22, 0, WIDTH * 0.24, HEIGHT * 0.22, WIDTH * 0.42);
  flareA.addColorStop(0, theme.flareA);
  flareA.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = 0.8 + pulse * 0.14;
  ctx.fillStyle = flareA;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const flareB = ctx.createRadialGradient(WIDTH * 0.78, HEIGHT * 0.74, 0, WIDTH * 0.78, HEIGHT * 0.74, WIDTH * 0.36);
  flareB.addColorStop(0, theme.flareB);
  flareB.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = 0.72 + (1 - pulse) * 0.16;
  ctx.fillStyle = flareB;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.globalAlpha = 1;
}

function getItemVisualState(item, elapsed) {
  if (elapsed < item.start || elapsed > item.end) return null;

  const local = elapsed - item.start;
  const exitSpan = Math.max(0.001, item.end - item.exitStart);
  let opacity = 1;
  let scale = 1;
  let translateY = 0;

  if (local <= item.intro) {
    const t = easeOutBack(local / item.intro);
    scale = item.fromScale + (1 - item.fromScale) * t;
    opacity = clamp(t, 0, 1);
    translateY = (1 - t) * 55;
  } else if (elapsed >= item.exitStart) {
    const t = clamp((elapsed - item.exitStart) / exitSpan, 0, 1);
    const eased = easeInOutCubic(t);
    scale = 1 + (item.exitScale - 1) * eased;
    opacity = 1 - easeOutExpo(t);
    translateY = t * -16;
  } else {
    const holdT = (elapsed - item.start - item.intro) / Math.max(0.001, item.exitStart - item.start - item.intro);
    scale = 1 + Math.sin(holdT * Math.PI) * 0.022;
  }

  const drift = local * 0.16;
  return {
    x: item.x + Math.sin(drift) * item.floatX,
    y: item.y + Math.cos(drift * 0.8) * item.floatY + translateY,
    scale,
    opacity,
    rotation: item.rotation + Math.sin(local * 3.2 + item.wobble) * 0.010,
  };
}

function drawSelectionOutline(item) {
  const bounds = getLocalBounds(item);
  ctx.save();
  ctx.strokeStyle = themes[themeSelect.value].selection;
  ctx.lineWidth = 5;
  ctx.globalAlpha = 0.9;
  const padding = 16;
  ctx.beginPath();
  ctx.roundRect(
    bounds.left - padding,
    bounds.top - padding,
    item.textWidth + padding * 2,
    item.textHeight + padding * 2,
    14
  );
  ctx.stroke();
  ctx.restore();
}

function drawItem(item, elapsed) {
  const visual = getItemVisualState(item, elapsed);
  if (!visual) return;

  ctx.save();
  ctx.translate(visual.x, visual.y);
  ctx.rotate(visual.rotation);
  ctx.scale(visual.scale, visual.scale);
  ctx.globalAlpha = visual.opacity;
  ctx.textAlign = item.align;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.fillStyle = item.color;
  ctx.shadowColor = themes[themeSelect.value].shadow;
  ctx.shadowBlur = 28;
  ctx.font = getDisplayFont(item.fontSize, item.fontDef);
  ctx.fillText(item.text, 0, 0);

  if (!state.exporting && item.id === state.selectionId) {
    drawSelectionOutline(item);
  }

  ctx.restore();
}

// Apply camera transform around canvas center, draw all words, then restore.
// Background is drawn without camera so it always fills the frame.
function renderFrame(elapsed) {
  drawBackground(elapsed * 1000, themeSelect.value);

  const cam = state.camera;
  ctx.save();
  ctx.translate(WIDTH / 2 + cam.x, HEIGHT / 2 + cam.y);
  ctx.rotate(cam.rot);
  ctx.scale(cam.scale, cam.scale);
  ctx.translate(-WIDTH / 2, -HEIGHT / 2);

  state.timeline.forEach((item) => drawItem(item, elapsed));

  ctx.restore();
}

// ─── Playback ─────────────────────────────────────────────────────────────────

function stopPlayback() {
  cancelAnimationFrame(state.rafId);
  state.rafId = 0;
  state.playing = false;
  playButton.textContent = "Play Preview";
  pauseVoiceover();
}

function getPreviewElapsed(now) {
  const playbackRate = Number(playbackRateSelect.value);
  const elapsed = state.playbackOrigin + ((now - state.playbackStartedAt) / 1000) * playbackRate;

  if (getVoiceoverEnabled() && !voiceoverAudio.paused && voiceoverAudio.currentTime < state.audioDuration - 0.05) {
    return voiceoverAudio.currentTime;
  }

  return elapsed;
}

function tick(now) {
  const elapsed = getPreviewElapsed(now);

  if (elapsed >= state.duration) {
    stopPlayback();
    setCurrentTime(state.duration, { syncAudio: true });
    setStatus("Idle");
    return;
  }

  updateCamera(elapsed);
  setCurrentTime(elapsed);
  state.rafId = requestAnimationFrame(tick);
}

function playTimeline(fromStart = false) {
  stopPlayback();

  if (fromStart || state.currentTime >= state.duration - 0.02) {
    setCurrentTime(0, { syncAudio: true });
  }

  state.playbackOrigin = state.currentTime;
  state.playbackStartedAt = performance.now();
  state.playing = true;
  playButton.textContent = "Pause Preview";
  setStatus("Playing");
  startVoiceoverForPreview();
  state.rafId = requestAnimationFrame(tick);
}

// ─── Export ───────────────────────────────────────────────────────────────────

async function exportVideo() {
  if (state.exporting || !state.timeline.length) return;

  if (typeof MediaRecorder === "undefined") {
    setStatus("MediaRecorder unavailable");
    return;
  }

  stopPlayback();
  state.exporting = true;
  exportButton.disabled = true;
  playButton.disabled = true;
  restartButton.disabled = true;
  reshuffleButton.disabled = true;
  setStatus("Exporting");

  const userPlaybackRate = playbackRateSelect.value;

  try {
    const videoStream = canvas.captureStream(state.fps);
    const combinedStream = new MediaStream();
    videoStream.getVideoTracks().forEach((track) => combinedStream.addTrack(track));

    let audioStream = null;
    let exportingAudio = false;

    if (getVoiceoverEnabled() && typeof voiceoverAudio.captureStream === "function") {
      voiceoverAudio.pause();
      syncVoiceoverElement();
      voiceoverAudio.playbackRate = 1;
      seekVoiceover(0);
      audioStream = voiceoverAudio.captureStream();

      try {
        await voiceoverAudio.play();
        audioStream.getAudioTracks().forEach((track) => combinedStream.addTrack(track));
        exportingAudio = audioStream.getAudioTracks().length > 0;
      } catch (_) {
        exportingAudio = false;
      }
    }

    const mimeTypes = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    const mimeType = mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) || "";
    const recordedChunks = [];
    const recorder = new MediaRecorder(combinedStream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunks.push(event.data);
    };

    const recorderStopped = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start(100);

    // Reset camera for export so it starts from center
    resetCamera();

    const videoTrack = videoStream.getVideoTracks()[0];
    const totalFrames = Math.ceil((state.duration + 0.4) * state.fps);
    const frameDelay = 1000 / state.fps;

    for (let frame = 0; frame <= totalFrames; frame += 1) {
      const current = Math.min(frame / state.fps, state.duration);
      updateCamera(current);
      setCurrentTime(current);
      setStatus(`Exporting ${Math.round((frame / totalFrames) * 100)}%`);

      if (videoTrack && typeof videoTrack.requestFrame === "function") {
        videoTrack.requestFrame();
      }

      await new Promise((resolve) => window.setTimeout(resolve, frameDelay));
    }

    recorder.stop();
    await recorderStopped;

    videoStream.getTracks().forEach((track) => track.stop());
    combinedStream.getTracks().forEach((track) => track.stop());

    if (exportingAudio) {
      voiceoverAudio.pause();
      seekVoiceover(0);
    }

    const blob = new Blob(recordedChunks, { type: mimeType || "video/webm" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "wordify-kinetic-video.webm";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);

    setStatus(exportingAudio ? "Exported with voice-over" : "Exported");
  } catch (err) {
    setStatus(`Export failed: ${err.message}`);
  } finally {
    state.exporting = false;
    exportButton.disabled = false;
    playButton.disabled = false;
    restartButton.disabled = false;
    reshuffleButton.disabled = false;
    playbackRateSelect.value = userPlaybackRate;
    syncVoiceoverElement();
    setCurrentTime(0, { syncAudio: true });
  }
}

// ─── Debounced rebuild ────────────────────────────────────────────────────────

function queueRebuild() {
  window.clearTimeout(state.rebuildTimer);
  state.rebuildTimer = window.setTimeout(() => {
    rebuildTimeline();
    playTimeline(true);
  }, 160);
}

// ─── Clip inspector mutations ─────────────────────────────────────────────────

function updateSelectedItem(mutator, options = {}) {
  const item = getSelectedItem();
  if (!item) return;

  mutator(item);
  refreshItemMetrics(item);
  constrainItem(item);

  if (options.smartAlign) {
    item.align = chooseAlignmentForX(item.x);
    item.rotation = chooseRotationForItem(
      item,
      getSceneItems(item.sceneIndex).indexOf(item),
      getSceneItems(item.sceneIndex).length
    );
  }

  resolveSceneCollisions(item.sceneIndex, item.id);
  renderClipList();
  renderTimelineBars();
  syncInspector();
  renderFrame(state.currentTime);
}

// ─── Canvas interaction ───────────────────────────────────────────────────────

// Invert the camera transform so world-space coordinates are returned.
function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = WIDTH / rect.width;
  const scaleY = HEIGHT / rect.height;
  const rawX = (event.clientX - rect.left) * scaleX;
  const rawY = (event.clientY - rect.top) * scaleY;

  const cam = state.camera;
  const cx = WIDTH / 2 + cam.x;
  const cy = HEIGHT / 2 + cam.y;
  const dx = rawX - cx;
  const dy = rawY - cy;
  const cos = Math.cos(-cam.rot);
  const sin = Math.sin(-cam.rot);
  const rotX = (dx * cos - dy * sin) / cam.scale;
  const rotY = (dx * sin + dy * cos) / cam.scale;

  return { x: rotX + WIDTH / 2, y: rotY + HEIGHT / 2 };
}

function hitTestItem(item, point, elapsed) {
  const visual = getItemVisualState(item, elapsed);
  if (!visual) return false;

  const dx = point.x - visual.x;
  const dy = point.y - visual.y;
  const cos = Math.cos(-visual.rotation);
  const sin = Math.sin(-visual.rotation);
  const localX = (dx * cos - dy * sin) / visual.scale;
  const localY = (dx * sin + dy * cos) / visual.scale;
  const bounds = getLocalBounds(item);
  const padding = 14;

  return (
    localX >= bounds.left - padding &&
    localX <= bounds.right + padding &&
    localY >= bounds.top - padding &&
    localY <= bounds.bottom + padding
  );
}

function getTopmostItemAtPoint(point) {
  for (let index = state.timeline.length - 1; index >= 0; index -= 1) {
    const item = state.timeline[index];
    if (hitTestItem(item, point, state.currentTime)) return item;
  }
  return null;
}

canvas.addEventListener("pointerdown", (event) => {
  if (state.exporting) return;

  const point = getCanvasPoint(event);
  const item = getTopmostItemAtPoint(point);
  stopPlayback();

  if (!item) {
    selectItem(null);
    setStatus("Idle");
    return;
  }

  selectItem(item.id);
  const visual = getItemVisualState(item, state.currentTime) || { x: item.x, y: item.y };
  state.drag = {
    pointerId: event.pointerId,
    itemId: item.id,
    offsetX: point.x - visual.x,
    offsetY: point.y - visual.y,
  };
  canvas.classList.add("dragging");
  canvas.setPointerCapture(event.pointerId);
  setStatus(`Dragging ${item.text}`);
});

canvas.addEventListener("pointermove", (event) => {
  if (!state.drag) return;

  const point = getCanvasPoint(event);
  const item = state.timeline.find((entry) => entry.id === state.drag.itemId);
  if (!item) return;

  item.x = point.x - state.drag.offsetX;
  item.y = point.y - state.drag.offsetY;
  constrainItem(item);
  resolveSceneCollisions(item.sceneIndex, item.id);
  syncInspector();
  renderClipList();
  renderFrame(state.currentTime);
});

function endDrag(event) {
  if (!state.drag) return;

  if (event && canvas.hasPointerCapture(state.drag.pointerId)) {
    canvas.releasePointerCapture(state.drag.pointerId);
  }

  canvas.classList.remove("dragging");
  state.drag = null;
  setStatus("Clip repositioned");
}

canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

// ─── Control event listeners ──────────────────────────────────────────────────

scriptInput.addEventListener("input", queueRebuild);
themeSelect.addEventListener("change", () => {
  rebuildTimeline();
  playTimeline(true);
});
chunkSizeInput.addEventListener("input", queueRebuild);
paceInput.addEventListener("input", queueRebuild);
motionInput.addEventListener("input", queueRebuild);

playbackRateSelect.addEventListener("change", () => {
  syncVoiceoverElement();
  setStatus(`Playback ${playbackRateSelect.value}x`);
});

voiceVolumeInput.addEventListener("input", () => { syncVoiceoverElement(); });

voiceoverEnabledInput.addEventListener("change", () => {
  syncVoiceoverElement();
  updateDuration();
  renderTimelineBars();
  setCurrentTime(Math.min(state.currentTime, state.duration), { syncAudio: true });
  setStatus(voiceoverEnabledInput.checked ? "Voice-over enabled" : "Voice-over disabled");
});

voiceoverFileInput.addEventListener("change", () => {
  const file = voiceoverFileInput.files?.[0];
  releaseVoiceoverUrl();
  state.audioDuration = 0;

  if (!file) {
    voiceoverAudio.removeAttribute("src");
    updateVoiceoverUi();
    updateDuration();
    setStatus("Voice-over cleared");
    return;
  }

  state.voiceoverUrl = URL.createObjectURL(file);
  state.voiceoverName = file.name;
  voiceoverAudio.src = state.voiceoverUrl;
  voiceoverAudio.load();
  updateVoiceoverUi();
  setStatus("Loading voice-over");
});

voiceoverAudio.addEventListener("loadedmetadata", () => {
  state.audioDuration = Number.isFinite(voiceoverAudio.duration) ? voiceoverAudio.duration : 0;
  updateVoiceoverUi();
  updateDuration();
  renderTimelineBars();
  setStatus("Voice-over ready");
});

voiceoverAudio.addEventListener("ended", () => {
  if (!state.playing) return;
  if (state.currentTime < state.duration - 0.05) return;
  stopPlayback();
  setStatus("Idle");
});

playButton.addEventListener("click", () => {
  if (state.playing) { stopPlayback(); setStatus("Paused"); return; }
  playTimeline();
});

restartButton.addEventListener("click", () => {
  stopPlayback();
  resetCamera();
  setCurrentTime(0, { syncAudio: true });
  setStatus("Restarted");
});

reshuffleButton.addEventListener("click", () => {
  state.seed = Math.floor(Math.random() * 1_000_000);
  resetCamera();
  rebuildTimeline();
  playTimeline(true);
});

avoidOverlapButton.addEventListener("click", avoidAllOverlaps);
aiArrangeButton.addEventListener("click", applyAiArrange);
aiBalanceButton.addEventListener("click", applyAiBalance);
aiAlignButton.addEventListener("click", () => {
  applySmartAlignment();
  setStatus("Smart alignment applied");
});
fitAudioButton.addEventListener("click", fitTimelineToAudio);
exportButton.addEventListener("click", exportVideo);

timelineScrubber.addEventListener("input", () => {
  stopPlayback();
  setCurrentTime(Number(timelineScrubber.value) / 1000, { syncAudio: true });
  setStatus("Scrubbing");
});

timelineTracks.addEventListener("click", (event) => {
  const bar = event.target.closest(".timeline-bar");
  if (!bar) return;

  const item = state.timeline.find((entry) => entry.id === bar.dataset.itemId);
  if (!item) return;

  stopPlayback();
  selectItem(item.id);
  setCurrentTime(item.start, { syncAudio: true });
  setStatus(`Selected ${item.text}`);
});

clipList.addEventListener("click", (event) => {
  const button = event.target.closest(".clip-chip");
  if (!button) return;

  const item = state.timeline.find((entry) => entry.id === button.dataset.itemId);
  if (!item) return;

  stopPlayback();
  selectItem(item.id);
  setCurrentTime(item.start, { syncAudio: true });
  setStatus(`Selected ${item.text}`);
});

selectedTextInput.addEventListener("input", () => {
  updateSelectedItem((item) => { item.text = selectedTextInput.value || item.text; });
});

selectedSizeInput.addEventListener("input", () => {
  updateSelectedItem((item) => { item.fontSize = Number(selectedSizeInput.value); });
});

selectedRotationInput.addEventListener("input", () => {
  updateSelectedItem((item) => { item.rotation = (Number(selectedRotationInput.value) * Math.PI) / 180; });
});

selectedXInput.addEventListener("input", () => {
  updateSelectedItem((item) => { item.x = Number(selectedXInput.value); });
});

selectedYInput.addEventListener("input", () => {
  updateSelectedItem((item) => { item.y = Number(selectedYInput.value); });
});

selectedColorInput.addEventListener("input", () => {
  updateSelectedItem((item) => { item.color = selectedColorInput.value; });
});

selectedAlign.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-align]");
  if (!button) return;
  updateSelectedItem((item) => { item.align = button.dataset.align; });
});

// ─── Init ─────────────────────────────────────────────────────────────────────

syncVoiceoverElement();
updateVoiceoverUi();
rebuildTimeline({ restart: false });
setStatus("Idle");

// Re-measure text after Google Fonts load (web fonts affect canvas measureText)
document.fonts.ready.then(() => {
  if (state.timeline.length > 0) {
    rebuildTimeline({ restart: false });
  }
});
