'use strict';

/**
 * Derive target row and column sums from gridNumbers and answerMap.
 * Guarantees mathematical consistency between targetRows and targetCols.
 *
 * @param {number[][]} gridNumbers
 * @param {number[][]} answerMap
 * @returns {{ targetRows: number[], targetCols: number[] }}
 */
function deriveTargets(gridNumbers, answerMap) {
  const rowCount = gridNumbers.length;
  const colCount = rowCount > 0 ? gridNumbers[0].length : 0;

  const targetRows = Array.from({ length: rowCount }, (_, r) =>
    gridNumbers[r].reduce(
      (sum, value, c) => sum + (answerMap[r][c] === 1 ? value : 0),
      0
    )
  );

  const targetCols = Array.from({ length: colCount }, (_, c) =>
    gridNumbers.reduce(
      (sum, row, r) => sum + (answerMap[r][c] === 1 ? row[c] : 0),
      0
    )
  );

  return { targetRows, targetCols };
}

/**
 * Calculate the current selected sums for each row and column.
 *
 * @param {number[][]} gridNumbers
 * @param {boolean[][]} selectedGrid
 * @returns {{ currentRowsSum: number[], currentColsSum: number[] }}
 */
function calculateCurrentSums(gridNumbers, selectedGrid) {
  const rowCount = gridNumbers.length;
  const colCount = rowCount > 0 ? gridNumbers[0].length : 0;

  const currentRowsSum = Array.from({ length: rowCount }, (_, r) =>
    gridNumbers[r].reduce(
      (sum, value, c) => sum + (selectedGrid[r][c] ? value : 0),
      0
    )
  );

  const currentColsSum = Array.from({ length: colCount }, (_, c) =>
    gridNumbers.reduce(
      (sum, row, r) => sum + (selectedGrid[r][c] ? row[c] : 0),
      0
    )
  );

  return { currentRowsSum, currentColsSum };
}

/**
 * Determine whether all row and column sums match their targets.
 *
 * @param {number[]} currentRowsSum
 * @param {number[]} currentColsSum
 * @param {number[]} targetRows
 * @param {number[]} targetCols
 * @returns {boolean}
 */
function checkIsCleared(currentRowsSum, currentColsSum, targetRows, targetCols) {
  const rowsMatch = currentRowsSum.every((sum, r) => sum === targetRows[r]);
  const colsMatch = currentColsSum.every((sum, c) => sum === targetCols[c]);
  return rowsMatch && colsMatch;
}

/**
 * Build a validated stage object with derived targets.
 */
function createStage({ id, name, icon, accentColor, gridNumbers, answerMap }) {
  const { targetRows, targetCols } = deriveTargets(gridNumbers, answerMap);
  return {
    id,
    name,
    icon,
    accentColor,
    gridNumbers,
    answerMap,
    targetRows,
    targetCols,
  };
}

const STAGES = [
  createStage({
    id: 'heart',
    name: 'ハート',
    icon: '❤️',
    accentColor: '#FF4D4D',
    gridNumbers: [
      [1, 3, 2, 3, 5],
      [4, 7, 1, 9, 2],
      [5, 2, 8, 1, 6],
      [9, 1, 5, 4, 3],
      [2, 6, 2, 7, 1],
    ],
    answerMap: [
      [0, 1, 0, 1, 0],
      [1, 1, 1, 1, 1],
      [0, 1, 1, 1, 0],
      [0, 0, 1, 0, 0],
      [0, 0, 0, 0, 0],
    ],
  }),
  createStage({
    id: 'star',
    name: 'スター',
    icon: '⭐',
    accentColor: '#F59E0B',
    gridNumbers: [
      [4, 8, 5, 9, 3],
      [7, 2, 6, 3, 8],
      [1, 4, 2, 7, 3],
      [6, 9, 1, 4, 5],
      [8, 5, 7, 6, 2],
    ],
    answerMap: [
      [0, 0, 1, 0, 0],
      [0, 1, 1, 1, 0],
      [1, 1, 1, 1, 1],
      [0, 1, 1, 1, 0],
      [1, 0, 0, 0, 1],
    ],
  }),
  createStage({
    id: 'smile',
    name: 'スマイル',
    icon: '😊',
    accentColor: '#10B981',
    gridNumbers: [
      [6, 3, 9, 4, 8],
      [5, 7, 8, 2, 6],
      [4, 9, 6, 7, 5],
      [1, 8, 9, 7, 3],
      [9, 2, 5, 4, 8],
    ],
    answerMap: [
      [0, 1, 0, 1, 0],
      [0, 1, 0, 1, 0],
      [0, 0, 0, 0, 0],
      [1, 0, 0, 0, 1],
      [0, 1, 1, 1, 0],
    ],
  }),
];

/**
 * Lightweight Web Audio synthesizer for zero-asset tactile sound effects.
 */
class SoundEffects {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  ensureContext() {
    if (this.muted || typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playTone(freqStart, freqEnd, durationSec, type = 'sine', gainPeak = 0.08, delaySec = 0) {
    try {
      const ctx = this.ensureContext();
      if (!ctx) return;

      const startTime = ctx.currentTime + delaySec;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, startTime);
      if (freqEnd !== freqStart) {
        osc.frequency.exponentialRampToValueAtTime(freqEnd, startTime + durationSec);
      }

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + durationSec + 0.01);
    } catch {
      // Ignore audio errors on restricted environments.
    }
  }

  select() {
    this.playTone(480, 660, 0.055, 'sine', 0.075);
  }

  deselect() {
    this.playTone(360, 260, 0.05, 'sine', 0.06);
  }

  mark() {
    this.playTone(250, 210, 0.035, 'triangle', 0.05);
  }

  lineMatch() {
    this.playTone(783.99, 783.99, 0.07, 'sine', 0.06, 0.02);
    this.playTone(1046.5, 1046.5, 0.11, 'sine', 0.07, 0.08);
  }

  clear() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      this.playTone(freq, freq, 0.16, 'triangle', 0.08, idx * 0.075);
    });
  }
}

function createEmptyGrid(rows, cols, value = false) {
  return Array.from({ length: rows }, () => Array(cols).fill(value));
}

function initGame() {
  const stageTabsEl = document.getElementById('stage-tabs');
  const boardEl = document.getElementById('game-board');
  const clearBannerEl = document.getElementById('clear-banner');
  const clearBannerTextEl = document.getElementById('clear-banner-text');
  const modeToggleBtn = document.getElementById('mode-toggle-btn');
  const resetBtn = document.getElementById('reset-btn');
  const soundToggleBtn = document.getElementById('sound-toggle-btn');
  const statusHintEl = document.getElementById('status-hint');

  if (!boardEl || !stageTabsEl) return;

  const sfx = new SoundEffects();

  const state = {
    stageIndex: 0,
    mode: 'fill', // 'fill' | 'mark'
    selectedGrid: [],
    xMarkGrid: [],
    isCleared: false,
    prevMatchedRows: [],
    prevMatchedCols: [],
    dragSession: null, // { type: 'fill' | 'mark', targetValue: boolean, visited: Set<string> }
    ignoreClickUntil: 0,
  };

  let rowHeaderEls = [];
  let colHeaderEls = [];
  let cellEls = [];

  function getStage() {
    return STAGES[state.stageIndex];
  }

  function loadStage(index) {
    state.stageIndex = index;
    const stage = getStage();
    const rows = stage.gridNumbers.length;
    const cols = stage.gridNumbers[0].length;

    state.selectedGrid = createEmptyGrid(rows, cols, false);
    state.xMarkGrid = createEmptyGrid(rows, cols, false);
    state.isCleared = false;
    state.prevMatchedRows = stage.targetRows.map((t) => t === 0);
    state.prevMatchedCols = stage.targetCols.map((t) => t === 0);
    state.dragSession = null;

    document.documentElement.style.setProperty('--stage-accent', stage.accentColor);
    renderStageTabs();
    buildBoardDOM();
    updateBoardUI({ suppressSounds: true });
  }

  function renderStageTabs() {
    stageTabsEl.textContent = '';
    STAGES.forEach((stage, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'stage-tab';
      if (idx === state.stageIndex) {
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', 'true');
      } else {
        btn.setAttribute('aria-pressed', 'false');
      }
      btn.textContent = `${stage.icon} ${stage.name}`;
      btn.addEventListener('click', () => loadStage(idx));
      stageTabsEl.appendChild(btn);
    });
  }

  function buildBoardDOM() {
    const stage = getStage();
    const rows = stage.gridNumbers.length;
    const cols = stage.gridNumbers[0].length;

    boardEl.textContent = '';
    boardEl.style.setProperty('--grid-cols', String(cols));
    rowHeaderEls = [];
    colHeaderEls = [];
    cellEls = Array.from({ length: rows }, () => Array(cols));

    // Top-left corner cell
    const corner = document.createElement('div');
    corner.className = 'board-corner';
    corner.setAttribute('aria-hidden', 'true');
    corner.textContent = stage.icon;
    boardEl.appendChild(corner);

    // Column headers
    for (let c = 0; c < cols; c++) {
      const header = document.createElement('div');
      header.className = 'header-cell col-header';
      header.innerHTML = `<span class="target-val">${stage.targetCols[c]}</span><span class="current-val">(0)</span>`;
      boardEl.appendChild(header);
      colHeaderEls.push(header);
    }

    // Rows: row header + grid cells
    for (let r = 0; r < rows; r++) {
      const rowHeader = document.createElement('div');
      rowHeader.className = 'header-cell row-header';
      rowHeader.innerHTML = `<span class="target-val">${stage.targetRows[r]}</span><span class="current-val">(0)</span>`;
      boardEl.appendChild(rowHeader);
      rowHeaderEls.push(rowHeader);

      for (let c = 0; c < cols; c++) {
        const num = stage.gridNumbers[r][c];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'grid-cell';
        btn.dataset.row = String(r);
        btn.dataset.col = String(c);
        btn.setAttribute('aria-label', `${r + 1}行 ${c + 1}列 数字 ${num}`);
        btn.setAttribute('aria-pressed', 'false');
        btn.innerHTML = `<span class="cell-num">${num}</span><span class="cell-x" aria-hidden="true">×</span>`;

        btn.addEventListener('pointerdown', (e) => handleCellPointerDown(e, r, c));
        btn.addEventListener('click', (e) => handleCellClick(e, r, c));
        btn.addEventListener('contextmenu', (e) => handleCellContextMenu(e, r, c));
        btn.addEventListener('keydown', (e) => handleCellKeyDown(e, r, c));

        boardEl.appendChild(btn);
        cellEls[r][c] = btn;
      }
    }
  }

  function applyCellAction(r, c, actionType, forceValue = null) {
    if (state.isCleared) return null;

    if (actionType === 'fill') {
      const next = forceValue !== null ? forceValue : !state.selectedGrid[r][c];
      if (state.selectedGrid[r][c] === next) return null;
      state.selectedGrid[r][c] = next;
      if (next) {
        state.xMarkGrid[r][c] = false;
      }
      if (next) {
        sfx.select();
      } else {
        sfx.deselect();
      }
      updateBoardUI();
      return next;
    }

    if (actionType === 'mark') {
      const next = forceValue !== null ? forceValue : !state.xMarkGrid[r][c];
      if (state.xMarkGrid[r][c] === next) return null;
      state.xMarkGrid[r][c] = next;
      if (next) {
        state.selectedGrid[r][c] = false;
      }
      sfx.mark();
      updateBoardUI();
      return next;
    }

    return null;
  }

  function handleCellPointerDown(e, r, c) {
    if (state.isCleared) return;
    // Only handle primary button or touch/pen on pointerdown.
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    // Release implicit touch capture so elementFromPoint tracks dragging across cells.
    if (typeof e.currentTarget.releasePointerCapture === 'function') {
      try {
        if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore if not captured.
      }
    }

    state.ignoreClickUntil = performance.now() + 500;
    const actionType = state.mode;
    const appliedVal = applyCellAction(r, c, actionType);
    if (appliedVal !== null) {
      state.dragSession = {
        type: actionType,
        targetValue: appliedVal,
        visited: new Set([`${r},${c}`]),
      };
    }
  }

  function handlePointerMove(e) {
    if (!state.dragSession || state.isCleared) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const cellBtn = target?.closest?.('.grid-cell');
    if (!cellBtn) return;

    const r = Number(cellBtn.dataset.row);
    const c = Number(cellBtn.dataset.col);
    const key = `${r},${c}`;
    if (state.dragSession.visited.has(key)) return;

    state.dragSession.visited.add(key);
    applyCellAction(r, c, state.dragSession.type, state.dragSession.targetValue);
  }

  function endDragSession() {
    if (state.dragSession) {
      state.dragSession = null;
      state.ignoreClickUntil = performance.now() + 120;
    }
  }

  function handleCellClick(e, r, c) {
    // Pointer interactions already took effect immediately on pointerdown.
    if (e.detail > 0 || performance.now() < state.ignoreClickUntil) {
      return;
    }
    applyCellAction(r, c, state.mode);
  }

  function handleCellContextMenu(e, r, c) {
    e.preventDefault();
    if (state.isCleared) return;
    applyCellAction(r, c, 'mark');
  }

  function handleCellKeyDown(e, r, c) {
    const stage = getStage();
    const maxR = stage.gridNumbers.length - 1;
    const maxC = stage.gridNumbers[0].length - 1;

    if (e.key === ' ' || e.key === 'Enter') {
      state.ignoreClickUntil = 0;
      return;
    }

    if (e.key === 'x' || e.key === 'X') {
      e.preventDefault();
      applyCellAction(r, c, 'mark');
      return;
    }

    let nextR = r;
    let nextC = c;
    switch (e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        nextR = Math.max(0, r - 1);
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        nextR = Math.min(maxR, r + 1);
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        nextC = Math.max(0, c - 1);
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        nextC = Math.min(maxC, c + 1);
        break;
      default:
        return;
    }

    e.preventDefault();
    cellEls[nextR]?.[nextC]?.focus();
  }

  function updateHeaderElement(el, current, target) {
    const isMatched = current === target;
    const isExceeded = current > target;
    el.classList.toggle('is-matched', isMatched);
    el.classList.toggle('is-exceeded', isExceeded);
    const currentSpan = el.querySelector('.current-val');
    if (currentSpan) {
      currentSpan.textContent = `(${current})`;
    }
  }

  function updateBoardUI({ suppressSounds = false } = {}) {
    const stage = getStage();
    const { currentRowsSum, currentColsSum } = calculateCurrentSums(
      stage.gridNumbers,
      state.selectedGrid
    );

    const cleared = checkIsCleared(
      currentRowsSum,
      currentColsSum,
      stage.targetRows,
      stage.targetCols
    );

    const newlyCleared = cleared && !state.isCleared;
    state.isCleared = cleared;

    // Update headers and detect newly matched lines
    let anyNewLineMatch = false;
    stage.targetRows.forEach((target, r) => {
      const matched = currentRowsSum[r] === target;
      if (matched && !state.prevMatchedRows[r]) {
        anyNewLineMatch = true;
      }
      state.prevMatchedRows[r] = matched;
      updateHeaderElement(rowHeaderEls[r], currentRowsSum[r], target);
    });

    stage.targetCols.forEach((target, c) => {
      const matched = currentColsSum[c] === target;
      if (matched && !state.prevMatchedCols[c]) {
        anyNewLineMatch = true;
      }
      state.prevMatchedCols[c] = matched;
      updateHeaderElement(colHeaderEls[c], currentColsSum[c], target);
    });

    // Update cells
    for (let r = 0; r < stage.gridNumbers.length; r++) {
      for (let c = 0; c < stage.gridNumbers[r].length; c++) {
        const btn = cellEls[r][c];
        const isSelected = state.selectedGrid[r][c];
        const isMarked = state.xMarkGrid[r][c];

        btn.classList.toggle('is-selected', isSelected);
        btn.classList.toggle('is-marked', isMarked);
        btn.classList.toggle('is-cleared-art', cleared && isSelected);
        btn.setAttribute('aria-pressed', String(isSelected));
      }
    }

    boardEl.classList.toggle('is-cleared', cleared);

    if (clearBannerEl && clearBannerTextEl) {
      clearBannerEl.hidden = !cleared;
      if (cleared) {
        clearBannerTextEl.textContent = `${stage.icon} STAGE CLEARED! 「${stage.name}」が完成しました！ ${stage.icon}`;
      }
    }

    if (statusHintEl) {
      statusHintEl.textContent = cleared
        ? 'クリアおめでとうございます！次のステージも遊べます。'
        : '左クリック/タップで選択、ドラッグで連続塗りつぶし、右クリックまたは✖️モードでメモ';
    }

    if (!suppressSounds) {
      if (newlyCleared) {
        sfx.clear();
      } else if (anyNewLineMatch) {
        sfx.lineMatch();
      }
    }
  }

  function updateModeButton() {
    if (!modeToggleBtn) return;
    const isMark = state.mode === 'mark';
    modeToggleBtn.classList.toggle('is-mark-mode', isMark);
    modeToggleBtn.setAttribute('aria-pressed', String(isMark));
    modeToggleBtn.textContent = isMark ? '✖️ メモ中 (切替)' : '✏️ 塗りつぶし中 (切替)';
  }

  function updateSoundButton() {
    if (!soundToggleBtn) return;
    soundToggleBtn.setAttribute('aria-pressed', String(!sfx.muted));
    soundToggleBtn.textContent = sfx.muted ? '🔇 音声OFF' : '🔊 音声ON';
  }

  window.addEventListener('pointermove', handlePointerMove, { passive: true });
  window.addEventListener('pointerup', endDragSession);
  window.addEventListener('pointercancel', endDragSession);

  modeToggleBtn?.addEventListener('click', () => {
    state.mode = state.mode === 'fill' ? 'mark' : 'fill';
    updateModeButton();
  });

  resetBtn?.addEventListener('click', () => {
    sfx.deselect();
    loadStage(state.stageIndex);
  });

  soundToggleBtn?.addEventListener('click', () => {
    sfx.muted = !sfx.muted;
    updateSoundButton();
    if (!sfx.muted) {
      sfx.select();
    }
  });

  updateModeButton();
  updateSoundButton();
  loadStage(0);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGame);
  } else {
    initGame();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    STAGES,
    deriveTargets,
    calculateCurrentSums,
    checkIsCleared,
  };
}
