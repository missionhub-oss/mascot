// SPDX-FileCopyrightText: Copyright (c) 2026 MissionHub Open Source Community
// SPDX-License-Identifier: Apache-2.0

// Zero-dependency standalone ES module runtime for the MissionHub-chan desktop pet.
// Designed for Web, Electron, Tauri, and WebView Agent desktop clients.
//
// Usage:
//   import { createMissionHubPet } from './missionhub-pet.mjs';
//   const pet = createMissionHubPet(document.body, {
//     atlasUrl: '../atlas/pet-sprites.webp',
//     size: 132,
//     floorOffset: 24,
//   });
//   pet.setAgentState('thinking'); // idle | thinking | working | tool_call | success | error | waiting | sleeping
//   pet.trigger('strike');         // jump | strike | wave | happy
//   pet.destroy();

const CELL = 256;
const COLS = 5;
const STYLE_ID = 'missionhub-pet-runtime-style';

const FRAME = {
  idle: 0,
  idle_blink: 1,
  curious: 2,
  idle_wave: 3,
  happy: 4,
  happy2: 5,
  walk1: 6,
  walk_pass1: 7,
  walk2: 8,
  walk_pass2: 9,
  crouch: 10,
  jump: 11,
  fall: 12,
  swing_windup: 13,
  swing: 14,
  swing_follow: 15,
  dangling: 16,
  dangling2: 17,
  sleep: 18,
  sleep2: 19,
};

const WALK_SEQ = ['walk1', 'walk_pass1', 'walk2', 'walk_pass2'];

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.mh-pet-layer {
  position: fixed;
  inset: 0;
  z-index: 9000;
  pointer-events: none;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
}
.mh-pet-layer.is-contained {
  position: absolute;
}
.mh-pet-layer.is-dragging {
  z-index: 9100;
}
.mh-pet-shadow {
  position: absolute;
  left: 0;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(17, 17, 17, 0.42) 0%, rgba(17, 17, 17, 0.12) 55%, transparent 74%);
  transform-origin: center center;
  will-change: transform, opacity;
  pointer-events: none;
}
.mh-pet-mover {
  position: absolute;
  left: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  will-change: transform;
  pointer-events: none;
}
.mh-pet-body {
  pointer-events: auto;
  position: relative;
  padding: 0;
  border: 0;
  background: transparent;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  cursor: grab;
  touch-action: none;
  transform-origin: center bottom;
  will-change: transform;
}
.mh-pet-body:focus-visible {
  outline: 2px solid #E00818;
  outline-offset: 6px;
  border-radius: 16px;
}
.mh-pet-layer.is-dragging .mh-pet-body {
  cursor: grabbing;
}
.mh-pet-canvas {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
  filter: drop-shadow(0 6px 12px rgba(17, 17, 17, 0.22));
  transition: filter 180ms ease-out;
}
.mh-pet-body:hover .mh-pet-canvas {
  filter: drop-shadow(0 10px 18px rgba(224, 8, 24, 0.26));
}
.mh-pet-fx {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: visible;
  z-index: 3;
}
.mh-pet-spark {
  position: absolute;
  font-size: 16px;
  font-weight: 700;
  color: #E00818;
  text-shadow: 0 2px 6px rgba(255, 255, 255, 0.92);
  pointer-events: none;
  animation: mh-pet-spark-fly 780ms cubic-bezier(0.2, 0.7, 0.2, 1) forwards;
}
.mh-pet-spark:nth-child(even) { color: #E84C22; }
.mh-pet-spark:nth-child(3n) { color: #D98A1A; }
.mh-pet-zzz {
  position: absolute;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px;
  font-weight: 700;
  color: #555;
  text-shadow: 0 1px 4px rgba(255, 255, 255, 0.9);
  pointer-events: none;
  animation: mh-pet-zzz-float 1550ms ease-out forwards;
}
@keyframes mh-pet-spark-fly {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.45); }
  22% { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
  100% { opacity: 0; transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) rotate(var(--rot)) scale(0.82); }
}
@keyframes mh-pet-zzz-float {
  0% { opacity: 0; transform: translate(-50%, 0) scale(0.75); }
  25% { opacity: 0.9; }
  100% { opacity: 0; transform: translate(calc(-50% + 16px), -42px) scale(1.15); }
}`;
  document.head.appendChild(style);
}

export function createMissionHubPet(container = document.body, options = {}) {
  injectStyles();

  const atlasUrl = options.atlasUrl || new URL('../atlas/pet-sprites.webp', import.meta.url).href;
  const size = Math.max(64, Number(options.size) || 132);
  const floorOffset = Number.isFinite(options.floorOffset) ? options.floorOffset : 20;
  const contained = container !== document.body && container !== document.documentElement;
  const ariaLabel = options.ariaLabel || 'MissionHub-chan Desktop Pet';

  const layer = document.createElement('div');
  layer.className = `mh-pet-layer${contained ? ' is-contained' : ''}`;
  layer.setAttribute('aria-label', ariaLabel);

  const shadow = document.createElement('div');
  shadow.className = 'mh-pet-shadow';
  shadow.setAttribute('aria-hidden', 'true');
  shadow.style.width = `${size}px`;
  shadow.style.height = `${Math.round(size * 0.12)}px`;
  shadow.style.bottom = `${Math.max(0, floorOffset - 5)}px`;

  const mover = document.createElement('div');
  mover.className = 'mh-pet-mover';
  mover.style.width = `${size}px`;
  mover.style.height = `${size}px`;
  mover.style.bottom = `${floorOffset}px`;

  const fxLayer = document.createElement('div');
  fxLayer.className = 'mh-pet-fx';
  fxLayer.setAttribute('aria-hidden', 'true');

  const body = document.createElement('button');
  body.type = 'button';
  body.className = 'mh-pet-body';
  body.style.width = `${size}px`;
  body.style.height = `${size}px`;
  body.setAttribute('aria-label', ariaLabel);

  const canvas = document.createElement('canvas');
  canvas.className = 'mh-pet-canvas';
  canvas.width = CELL;
  canvas.height = CELL;
  canvas.setAttribute('aria-hidden', 'true');

  body.appendChild(canvas);
  mover.appendChild(fxLayer);
  mover.appendChild(body);
  layer.appendChild(shadow);
  layer.appendChild(mover);
  container.appendChild(layer);

  const ctx = canvas.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const GRAVITY = 1580;
  const EDGE_PAD = 16;

  function boundsWidth() {
    return contained ? container.clientWidth || window.innerWidth : window.innerWidth;
  }
  function boundsHeight() {
    return contained ? container.clientHeight || window.innerHeight : window.innerHeight;
  }
  function maxX() {
    return Math.max(EDGE_PAD, boundsWidth() - size - EDGE_PAD);
  }
  function clampX(val) {
    return Math.min(maxX(), Math.max(EDGE_PAD, val));
  }

  // Sprite atlas loader
  const atlas = new Image();
  let atlasReady = false;
  let lastDrawn = -1;
  let currentFrame = 'idle';

  function drawFrame(name) {
    const idx = FRAME[name] ?? 0;
    layer.dataset.pose = name;
    if (!atlasReady || idx === lastDrawn || !ctx) return;
    lastDrawn = idx;
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    ctx.clearRect(0, 0, CELL, CELL);
    ctx.drawImage(atlas, col * CELL, row * CELL, CELL, CELL, 0, 0, CELL, CELL);
  }

  atlas.onload = () => {
    atlasReady = true;
    lastDrawn = -1;
    drawFrame(currentFrame);
  };
  atlas.src = atlasUrl;

  let x = clampX(boundsWidth() - size - 36);
  let y = 0;
  let vx = 0;
  let vy = 0;
  let facing = -1;

  let agentState = 'idle';
  let state = 'idle';
  let stateStartedAt = performance.now();
  let stateUntil = 0;
  let nextAiAt = performance.now() + 3000;
  let lastInteractAt = performance.now();
  let nextBlinkAt = performance.now() + 2600;
  let blinkUntil = 0;
  let hoverWaveCooldown = 0;

  let walkTargetX = x;
  let walkPhase = 0;
  let spinDeg = 0;
  let spinSpeed = 0;
  let tiltDeg = 0;
  let targetTiltDeg = 0;
  let scaleX = 1;
  let scaleY = 1;
  let targetScaleX = 1;
  let targetScaleY = 1;
  let pendingJump = null;
  let landEmote = 'happy';
  let queuedHop = false;
  let strikeSparked = false;
  let actionIndex = 0;
  let rapidClicks = 0;
  let rapidTimer = 0;
  let fxPulseAt = 0;

  const pointer = { x: -9999, y: -9999, active: false, lastMove: 0 };
  let patLastX = null;
  let patDir = 0;
  let patFlips = 0;
  let patResetTimer = 0;
  let patCooldownUntil = 0;

  let pointerDown = false;
  let dragMoved = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOriginX = 0;
  let dragOriginY = 0;
  let lastDragClientX = 0;
  let lastDragClientY = 0;
  let lastDragTime = 0;
  let dragVx = 0;
  let dragVy = 0;

  let rafId = 0;
  let lastNow = 0;
  let destroyed = false;

  function setFrame(name) {
    currentFrame = name;
    drawFrame(name);
  }

  function triggerSquash(sx, sy) {
    scaleX = sx;
    scaleY = sy;
  }

  function spawnFx(symbols, count = 4, offsetY = -Math.round(size * 0.56), driftUp = true) {
    if (reducedMotion.matches) return;
    for (let i = 0; i < count; i++) {
      const node = document.createElement('span');
      node.className = driftUp ? 'mh-pet-spark' : 'mh-pet-zzz';
      node.textContent = symbols[i % symbols.length];
      const spread = (i - (count - 1) / 2) * 18 + (Math.random() - 0.5) * 12;
      node.style.left = `calc(50% + ${spread.toFixed(1)}px)`;
      node.style.top = `${offsetY + (Math.random() - 0.5) * 10}px`;
      node.style.setProperty('--dx', `${((Math.random() - 0.5) * 44).toFixed(1)}px`);
      node.style.setProperty('--dy', `${(-38 - Math.random() * 26).toFixed(1)}px`);
      node.style.setProperty('--rot', `${((Math.random() - 0.5) * 30).toFixed(1)}deg`);
      fxLayer.appendChild(node);
      window.setTimeout(() => node.remove(), driftUp ? 820 : 1600);
    }
  }

  function enterIdle(now, delayMin = 3000, delayMax = 6400) {
    state = 'idle';
    stateStartedAt = now;
    vx = 0;
    vy = 0;
    y = 0;
    spinDeg = 0;
    spinSpeed = 0;
    targetTiltDeg = 0;
    queuedHop = false;
    pendingJump = null;
    setFrame('idle');
    nextAiAt = now + delayMin + Math.random() * (delayMax - delayMin);
  }

  function enterEmote(kind, durationMs, now) {
    state = 'emote';
    stateStartedAt = now;
    stateUntil = now + durationMs;
    vx = 0;
    layer.dataset.emote = kind;
    setFrame(kind === 'wave' ? 'idle_wave' : kind);
  }

  function startJumpArc(now, jumpVy, horizontalVx = 0, withSpin = false, onLand = 'happy', skipCrouch = false) {
    landEmote = onLand;
    if (skipCrouch) {
      state = 'jump';
      stateStartedAt = now;
      vy = jumpVy;
      vx = horizontalVx;
      spinDeg = 0;
      spinSpeed = withSpin ? (facing < 0 ? -780 : 780) : 0;
      setFrame('jump');
      triggerSquash(0.84, 1.18);
      return;
    }
    state = 'crouch_takeoff';
    stateStartedAt = now;
    stateUntil = now + 85;
    pendingJump = { jumpVy, horizontalVx, withSpin };
    setFrame('crouch');
    triggerSquash(1.16, 0.84);
  }

  function startKendoStrike(now, lungeVx = 0) {
    state = 'strike';
    stateStartedAt = now;
    stateUntil = now + 780;
    vx = lungeVx;
    strikeSparked = false;
    setFrame('swing_windup');
    triggerSquash(1.08, 0.92);
  }

  function setAgentState(next) {
    const valid = ['idle', 'thinking', 'working', 'tool_call', 'success', 'error', 'waiting', 'sleeping'];
    agentState = valid.includes(next) ? next : 'idle';
    layer.dataset.agentState = agentState;
    const now = performance.now();
    lastInteractAt = now;

    if (state === 'drag') return;

    if (agentState === 'idle') {
      enterIdle(now, 2400, 5200);
    } else if (agentState === 'thinking') {
      state = 'agent_thinking';
      stateStartedAt = now;
      vx = 0;
      y = 0;
      setFrame('curious');
      fxPulseAt = now + 400;
    } else if (agentState === 'working') {
      state = 'stroll';
      stateStartedAt = now;
      walkPhase = 0;
      walkTargetX = x > boundsWidth() * 0.5 ? clampX(x - 200) : clampX(x + 200);
      facing = walkTargetX >= x ? 1 : -1;
    } else if (agentState === 'tool_call') {
      facing = x > boundsWidth() * 0.6 ? -1 : 1;
      startKendoStrike(now, facing * 190);
    } else if (agentState === 'success') {
      startJumpArc(now, 470, 0, false, 'happy', false);
      spawnFx(['✦', '♪', '♥'], 6);
    } else if (agentState === 'error') {
      startJumpArc(now, 420, -facing * 60, false, 'strike', true);
      setFrame('dangling');
      spawnFx(['!', '✦'], 5);
    } else if (agentState === 'waiting') {
      state = 'agent_waiting';
      stateStartedAt = now;
      vx = 0;
      y = 0;
      setFrame('idle_wave');
      spawnFx(['♪'], 2);
    } else if (agentState === 'sleeping') {
      state = 'sleep';
      stateStartedAt = now;
      vx = 0;
      y = 0;
      setFrame('sleep');
      triggerSquash(1.1, 0.9);
      fxPulseAt = now + 700;
    }
  }

  function trigger(action) {
    const now = performance.now();
    lastInteractAt = now;
    if (action === 'jump') startJumpArc(now, 500, 0, false, 'happy', false);
    else if (action === 'strike') startKendoStrike(now, facing * 200);
    else if (action === 'wave') enterEmote('wave', 1500, now);
    else if (action === 'happy') {
      enterEmote('happy', 1800, now);
      spawnFx(['♥', '✦', '♪'], 5);
    }
  }

  function performClick(now) {
    lastInteractAt = now;
    rapidClicks += 1;
    clearTimeout(rapidTimer);
    rapidTimer = window.setTimeout(() => {
      rapidClicks = 0;
    }, 2200);

    if (reducedMotion.matches) {
      const order = ['idle', 'idle_wave', 'curious', 'happy', 'swing', 'sleep'];
      setFrame(order[(order.indexOf(currentFrame) + 1) % order.length]);
      return;
    }

    if (rapidClicks >= 5) {
      rapidClicks = 0;
      queuedHop = false;
      startJumpArc(now, 520, (Math.random() - 0.5) * 140, false, 'strike', true);
      setFrame('dangling');
      spawnFx(['!', '✦', '★'], 7);
      return;
    }

    const step = actionIndex % 4;
    actionIndex += 1;
    queuedHop = false;

    if (step === 0) {
      startJumpArc(now, 515, 0, false, 'happy', false);
      spawnFx(['✦', '♪', '♥'], 5);
    } else if (step === 1) {
      facing = x > boundsWidth() * 0.65 ? -1 : 1;
      startKendoStrike(now, facing * 220);
    } else if (step === 2) {
      startJumpArc(now, 505, facing * 75, true, 'wave', false);
      spawnFx(['★', '✦', '♪'], 5);
    } else {
      queuedHop = true;
      startJumpArc(now, 355, facing * 26, false, 'happy', false);
      spawnFx(['♥', '♪', '✦'], 5);
    }
  }

  /* ---------- Event Listeners ---------- */
  const onWindowPointerMove = event => {
    if (event.pointerType !== 'mouse') return;
    const rect = contained ? container.getBoundingClientRect() : { left: 0, top: 0 };
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    pointer.active = true;
    pointer.lastMove = performance.now();

    if (state === 'sleep' && agentState !== 'sleeping') {
      const cx = x + size * 0.5;
      const cy = boundsHeight() - floorOffset - size * 0.5;
      if (Math.hypot(pointer.x - cx, pointer.y - cy) < 170) {
        lastInteractAt = pointer.lastMove;
        startJumpArc(pointer.lastMove, 310, 0, false, 'wave', false);
        spawnFx(['✦', '♪'], 3);
      }
    }
  };

  const onBodyEnter = event => {
    if (event.pointerType !== 'mouse' || pointerDown || reducedMotion.matches) return;
    const now = performance.now();
    if (state === 'idle' && agentState === 'idle' && now > hoverWaveCooldown) {
      hoverWaveCooldown = now + 4500;
      lastInteractAt = now;
      enterEmote('wave', 1200, now);
      spawnFx(['♪'], 2);
    }
  };

  const onBodyMove = event => {
    if (pointerDown) {
      const dx = event.clientX - dragStartX;
      const dy = event.clientY - dragStartY;
      const now = performance.now();
      if (!dragMoved && Math.hypot(dx, dy) > 6) {
        dragMoved = true;
        state = 'drag';
        stateStartedAt = now;
        queuedHop = false;
        pendingJump = null;
        lastInteractAt = now;
        layer.classList.add('is-dragging');
        setFrame('dangling');
        triggerSquash(0.9, 1.12);
      }
      if (!dragMoved) return;
      const dt = Math.max(0.008, (now - lastDragTime) / 1000);
      const stepX = event.clientX - lastDragClientX;
      const stepY = event.clientY - lastDragClientY;
      dragVx = dragVx * 0.55 + (stepX / dt) * 0.45;
      dragVy = dragVy * 0.55 + (-stepY / dt) * 0.45;
      lastDragClientX = event.clientX;
      lastDragClientY = event.clientY;
      lastDragTime = now;

      x = clampX(dragOriginX + dx);
      const maxY = Math.max(0, boundsHeight() - floorOffset - size - 12);
      y = Math.min(maxY, Math.max(0, dragOriginY - dy));
      if (Math.abs(stepX) > 1.5) facing = stepX > 0 ? 1 : -1;
      targetTiltDeg = Math.max(-24, Math.min(24, -dragVx * 0.022));
      return;
    }

    if (event.pointerType !== 'mouse' || reducedMotion.matches) return;
    const rect = body.getBoundingClientRect();
    const relY = (event.clientY - rect.top) / Math.max(1, rect.height);
    if (relY > 0.55) return;

    const now = performance.now();
    if (now < patCooldownUntil) return;
    if (patLastX !== null) {
      const delta = event.clientX - patLastX;
      if (Math.abs(delta) >= 6) {
        const dir = delta > 0 ? 1 : -1;
        if (patDir !== 0 && dir !== patDir) {
          patFlips += 1;
          clearTimeout(patResetTimer);
          patResetTimer = window.setTimeout(() => {
            patFlips = 0;
            patDir = 0;
          }, 1100);
          if (patFlips >= 3) {
            patFlips = 0;
            patDir = 0;
            patCooldownUntil = now + 1800;
            lastInteractAt = now;
            triggerSquash(1.18, 0.84);
            enterEmote('happy', 2000, now);
            spawnFx(['♥', '✦', '♪'], 6);
          }
        }
        patDir = dir;
        patLastX = event.clientX;
      }
    } else {
      patLastX = event.clientX;
    }
  };

  const onBodyLeave = () => {
    patLastX = null;
    patDir = 0;
    patFlips = 0;
  };

  const onBodyDown = event => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    pointerDown = true;
    dragMoved = false;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragOriginX = x;
    dragOriginY = y;
    lastDragClientX = event.clientX;
    lastDragClientY = event.clientY;
    lastDragTime = performance.now();
    dragVx = 0;
    dragVy = 0;
    body.setPointerCapture?.(event.pointerId);
  };

  const onBodyUp = event => {
    if (!pointerDown) return;
    pointerDown = false;
    if (event.pointerId != null) {
      try {
        body.releasePointerCapture?.(event.pointerId);
      } catch {
        // Ignore capture release errors.
      }
    }
    if (!dragMoved) return;

    layer.classList.remove('is-dragging');
    const now = performance.now();
    lastInteractAt = now;
    targetTiltDeg = 0;

    if (y > 4 && !reducedMotion.matches) {
      state = 'fall';
      stateStartedAt = now;
      vx = Math.max(-540, Math.min(540, dragVx * 0.45));
      vy = Math.max(-220, Math.min(480, dragVy * 0.35));
      landEmote = 'happy';
      setFrame(vy > 140 ? 'jump' : 'fall');
    } else {
      y = 0;
      state = 'crouch_land';
      stateStartedAt = now;
      stateUntil = now + 95;
      landEmote = 'happy';
      setFrame('crouch');
      triggerSquash(1.18, 0.84);
      spawnFx(['✦', '♪'], 4);
    }
  };

  const onBodyClick = () => {
    if (dragMoved) {
      dragMoved = false;
      return;
    }
    performClick(performance.now());
  };

  const onBodyKeyDown = event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      performClick(performance.now());
    }
  };

  const onResize = () => {
    x = clampX(x);
  };

  const onVisibility = () => {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    } else if (!destroyed && !rafId) {
      lastNow = 0;
      rafId = requestAnimationFrame(tick);
    }
  };

  window.addEventListener('pointermove', onWindowPointerMove, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  body.addEventListener('pointerenter', onBodyEnter);
  body.addEventListener('pointermove', onBodyMove);
  body.addEventListener('pointerleave', onBodyLeave);
  body.addEventListener('pointerdown', onBodyDown);
  body.addEventListener('pointerup', onBodyUp);
  body.addEventListener('pointercancel', onBodyUp);
  body.addEventListener('click', onBodyClick);
  body.addEventListener('keydown', onBodyKeyDown);

  /* ---------- 60 FPS Main Loop ---------- */
  function tick(now) {
    if (destroyed) return;
    const dt = lastNow ? Math.min(0.045, (now - lastNow) / 1000) : 0.016;
    lastNow = now;

    if (!reducedMotion.matches) {
      const petCenterX = x + size * 0.5;
      const floorY = boundsHeight() - floorOffset;
      const nearPointer =
        pointer.active &&
        now - pointer.lastMove < 1800 &&
        pointer.y > boundsHeight() * 0.4;
      const pointerDx = pointer.x - petCenterX;
      const pointerDist = Math.hypot(pointerDx, pointer.y - (floorY - size * 0.5));

      if (state === 'idle') {
        vx *= Math.pow(0.001, dt);
        if (nearPointer && pointerDist < 320 && agentState === 'idle') {
          facing = pointerDx >= 0 ? 1 : -1;
          targetTiltDeg = Math.max(-5.5, Math.min(5.5, pointerDx * 0.018));
          if (pointerDist > 120 && pointerDist < 280 && pointer.y > boundsHeight() * 0.62) {
            state = 'follow';
            walkPhase = 0;
          } else {
            setFrame('curious');
          }
        } else {
          targetTiltDeg = 0;
          if (now >= nextBlinkAt) {
            blinkUntil = now + 135;
            nextBlinkAt = now + (Math.random() < 0.22 ? 320 : 2800 + Math.random() * 3200);
          }
          setFrame(now < blinkUntil ? 'idle_blink' : 'idle');
        }

        targetScaleX = 1 + Math.sin(now * 0.0032) * 0.014;
        targetScaleY = 1 - Math.sin(now * 0.0032) * 0.018;

        if (agentState === 'idle' && now - lastInteractAt > 16000) {
          state = 'sleep';
          stateStartedAt = now;
          setFrame('sleep');
          triggerSquash(1.1, 0.9);
          fxPulseAt = now + 900;
        } else if (agentState === 'idle' && now >= nextAiAt && state === 'idle') {
          const roll = Math.random();
          if (roll < 0.65) {
            const span = Math.min(340, Math.max(100, boundsWidth() * 0.35));
            walkTargetX = clampX(x + (Math.random() < 0.5 ? -1 : 1) * (80 + Math.random() * span));
            facing = walkTargetX >= x ? 1 : -1;
            walkPhase = 0;
            state = 'stroll';
          } else if (roll < 0.85) {
            startKendoStrike(now, facing * 90);
          } else {
            enterEmote('wave', 1400, now);
            spawnFx(['♪'], 2);
          }
        }
      } else if (state === 'agent_thinking') {
        y = 0;
        targetTiltDeg = Math.sin(now * 0.0025) * 4;
        targetScaleX = 1 + Math.sin(now * 0.003) * 0.012;
        targetScaleY = 1 - Math.sin(now * 0.003) * 0.015;
        if (now >= nextBlinkAt) {
          blinkUntil = now + 130;
          nextBlinkAt = now + 3200;
        }
        setFrame(now < blinkUntil ? 'idle_blink' : 'curious');
        if (now >= fxPulseAt) {
          fxPulseAt = now + 1700;
          spawnFx(['…', '✦'], 1, -Math.round(size * 0.65), false);
        }
      } else if (state === 'agent_waiting') {
        const elapsed = now - stateStartedAt;
        setFrame(Math.floor(elapsed / 380) % 2 === 0 ? 'idle_wave' : 'idle');
        y = 0;
        targetTiltDeg = Math.sin(elapsed * 0.008) * 3.5;
        targetScaleX = 1;
        targetScaleY = 1;
      } else if (state === 'stroll' || state === 'follow') {
        let destX = walkTargetX;
        let maxSpeed = agentState === 'working' ? 132 : 96;

        if (state === 'follow') {
          if (!nearPointer || pointerDist > 360) {
            enterIdle(now, 2400, 4800);
          } else {
            destX = clampX(pointer.x - size * 0.5 - Math.sign(pointerDx || 1) * 82);
            maxSpeed = 144;
          }
        }

        if (state === 'stroll' || state === 'follow') {
          const diff = destX - x;
          const absDiff = Math.abs(diff);
          if (absDiff <= 6) {
            if (agentState === 'working') {
              // Keep patrolling back and forth while Agent is actively working
              walkTargetX = x > boundsWidth() * 0.5 ? clampX(EDGE_PAD + 40) : clampX(maxX() - 40);
              facing = walkTargetX >= x ? 1 : -1;
            } else {
              vx = 0;
              y = 0;
              if (state === 'follow') {
                facing = pointerDx >= 0 ? 1 : -1;
                enterEmote('happy', 1350, now);
                spawnFx(['✦', '♪'], 2);
              } else {
                enterIdle(now, 3200, 6800);
              }
            }
          } else {
            const dir = Math.sign(diff);
            facing = dir;
            const brake = Math.min(1, absDiff / 48);
            const desiredVx = dir * maxSpeed * Math.max(0.28, brake);
            vx += (desiredVx - vx) * Math.min(1, dt * 11);
            x = clampX(x + vx * dt);
            walkPhase += Math.abs(vx) * dt * 0.085;
            setFrame(WALK_SEQ[Math.floor(walkPhase) % WALK_SEQ.length]);
            y = Math.abs(Math.sin(walkPhase * Math.PI * 0.5)) * 5.2;
            targetTiltDeg = (vx / maxSpeed) * 4.5 + Math.sin(walkPhase * Math.PI) * 1.8;
            targetScaleX = 1.015;
            targetScaleY = 0.985;
          }
        }
      } else if (state === 'crouch_takeoff') {
        y = 0;
        targetTiltDeg = 0;
        targetScaleX = 1.12;
        targetScaleY = 0.88;
        if (now >= stateUntil && pendingJump) {
          const { jumpVy, horizontalVx, withSpin } = pendingJump;
          pendingJump = null;
          startJumpArc(now, jumpVy, horizontalVx, withSpin, landEmote, true);
        }
      } else if (state === 'crouch_land') {
        y = 0;
        vx = 0;
        targetTiltDeg = 0;
        targetScaleX = 1.1;
        targetScaleY = 0.9;
        if (now >= stateUntil) {
          if (queuedHop) {
            queuedHop = false;
            facing = -facing;
            startJumpArc(now, 365, facing * 24, false, 'happy', true);
            spawnFx(['✦', '♪'], 3);
          } else if (landEmote === 'strike') {
            startKendoStrike(now, facing * 130);
          } else {
            enterEmote(landEmote || 'happy', 1450, now);
          }
        }
      } else if (state === 'strike') {
        const elapsed = now - stateStartedAt;
        if (elapsed < 135) {
          setFrame('swing_windup');
          targetTiltDeg = -facing * 4;
          targetScaleX = 1.04;
          targetScaleY = 0.96;
        } else if (elapsed < 275) {
          setFrame('swing');
          x = clampX(x + vx * dt);
          vx *= Math.pow(0.18, dt);
          y = Math.sin(((elapsed - 135) / 140) * Math.PI) * 10;
          targetTiltDeg = facing * 6;
          targetScaleX = 1.08;
          targetScaleY = 0.94;
          if (!strikeSparked) {
            strikeSparked = true;
            spawnFx(['✦', '★', '✦'], 6);
          }
        } else {
          setFrame('swing_follow');
          x = clampX(x + vx * dt);
          vx *= Math.pow(0.015, dt);
          y = 0;
          targetTiltDeg = facing * 2;
          targetScaleX = 1;
          targetScaleY = 1;
        }
        if (now >= stateUntil) {
          if (agentState === 'tool_call') startKendoStrike(now, facing * 90);
          else enterIdle(now, 3000, 6400);
        }
      } else if (state === 'emote') {
        const elapsed = now - stateStartedAt;
        const kind = layer.dataset.emote || 'happy';
        if (kind === 'happy') {
          setFrame(Math.floor(elapsed / 240) % 2 === 0 ? 'happy' : 'idle_wave');
          const phase = elapsed * 0.014;
          y = Math.abs(Math.sin(phase)) * 4.5;
          targetTiltDeg = Math.sin(phase) * 4.2;
        } else {
          setFrame(Math.floor(elapsed / 320) % 2 === 0 ? 'idle_wave' : 'idle');
          y = 0;
          targetTiltDeg = Math.sin(elapsed * 0.01) * 3.5;
        }
        targetScaleX = 1;
        targetScaleY = 1;
        if (now >= stateUntil) {
          if (agentState === 'success') agentState = 'idle';
          enterIdle(now, 3000, 6400);
        }
      } else if (state === 'jump' || state === 'fall') {
        vy -= GRAVITY * dt;
        x += vx * dt;
        y += vy * dt;
        if (currentFrame !== 'dangling') {
          setFrame(vy > 45 ? 'jump' : 'fall');
        }
        if (x < EDGE_PAD) {
          x = EDGE_PAD;
          vx = Math.abs(vx) * 0.55;
          facing = 1;
        } else if (x > maxX()) {
          x = maxX();
          vx = -Math.abs(vx) * 0.55;
          facing = -1;
        }
        if (spinSpeed) {
          spinDeg += spinSpeed * dt;
          if (Math.abs(spinDeg) >= 360) {
            spinDeg = 0;
            spinSpeed = 0;
          }
        } else {
          targetTiltDeg = Math.max(-16, Math.min(16, vx * 0.024));
        }
        targetScaleX = vy > 0 ? 0.92 : 0.96;
        targetScaleY = vy > 0 ? 1.09 : 1.04;
        if (y <= 0) {
          y = 0;
          const impact = Math.abs(vy);
          vx = 0;
          vy = 0;
          spinDeg = 0;
          spinSpeed = 0;
          targetTiltDeg = 0;
          state = 'crouch_land';
          stateStartedAt = now;
          stateUntil = now + 95;
          setFrame('crouch');
          triggerSquash(1.22, 0.78);
          if (impact > 340) spawnFx(['✦', '♪'], 4, -24);
        }
      } else if (state === 'sleep') {
        const elapsed = now - stateStartedAt;
        setFrame(Math.floor(elapsed / 1150) % 2 === 0 ? 'sleep' : 'sleep2');
        y = 0;
        targetTiltDeg = Math.sin(now * 0.0018) * 1.8;
        targetScaleX = 1 + Math.sin(now * 0.0024) * 0.018;
        targetScaleY = 1 - Math.sin(now * 0.0024) * 0.02;
        if (now >= fxPulseAt) {
          fxPulseAt = now + 1850;
          spawnFx(['z', 'Z'], 1, -Math.round(size * 0.58), false);
        }
      } else if (state === 'drag') {
        const elapsed = now - stateStartedAt;
        setFrame(Math.floor(elapsed / 170) % 2 === 0 ? 'dangling' : 'dangling2');
        targetScaleX = 0.95;
        targetScaleY = 1.05;
        targetTiltDeg *= Math.pow(0.08, dt);
      }

      scaleX += (targetScaleX - scaleX) * Math.min(1, dt * 14);
      scaleY += (targetScaleY - scaleY) * Math.min(1, dt * 14);
      tiltDeg += (targetTiltDeg - tiltDeg) * Math.min(1, dt * 12);
    }

    const flip = -facing;
    mover.style.transform = `translate3d(${x.toFixed(1)}px, ${(-y).toFixed(1)}px, 0)`;
    body.style.transform = `rotate(${(tiltDeg + spinDeg).toFixed(1)}deg) scale(${(scaleX * flip).toFixed(3)}, ${scaleY.toFixed(3)})`;

    const heightRatio = Math.max(0.32, 1 - y / 340);
    shadow.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0) scaleX(${heightRatio.toFixed(3)}) scaleY(${(0.75 + heightRatio * 0.25).toFixed(3)})`;
    shadow.style.opacity = (0.14 + heightRatio * 0.28).toFixed(3);

    rafId = requestAnimationFrame(tick);
  }

  layer.dataset.pose = 'idle';
  layer.dataset.agentState = 'idle';
  rafId = requestAnimationFrame(tick);

  return {
    element: layer,
    setAgentState,
    trigger,
    getState: () => ({ agentState, state, pose: currentFrame }),
    destroy() {
      destroyed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      body.removeEventListener('pointerenter', onBodyEnter);
      body.removeEventListener('pointermove', onBodyMove);
      body.removeEventListener('pointerleave', onBodyLeave);
      body.removeEventListener('pointerdown', onBodyDown);
      body.removeEventListener('pointerup', onBodyUp);
      body.removeEventListener('pointercancel', onBodyUp);
      body.removeEventListener('click', onBodyClick);
      body.removeEventListener('keydown', onBodyKeyDown);
      layer.remove();
    },
  };
}
