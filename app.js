'use strict';

const appData =
  typeof require === 'function' && typeof module !== 'undefined' && module.exports
    ? require('./stages.js')
    : typeof window !== 'undefined'
    ? window.NUMSUM_DATA
    : { DIFFICULTIES: [], STAGES_BY_DIFFICULTY: {}, deriveTargets: () => ({ targetRows: [], targetCols: [] }) };

const STAGES = Object.values(appData.STAGES_BY_DIFFICULTY).flat();

const STORAGE_KEY = 'numsum_picross_progress_v1';

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
 * Create default progression state (Stage 1 unlocked per difficulty).
 */
function createInitialProgress() {
  const progress = {};
  for (const diff of appData.DIFFICULTIES) {
    progress[diff.id] = {
      unlockedCount: 1,
      clearedIds: [],
    };
  }
  return progress;
}

/**
 * Normalize loaded progression object safely against current DIFFICULTIES.
 */
function normalizeProgress(raw) {
  const base = createInitialProgress();
  if (!raw || typeof raw !== 'object') return base;

  for (const diff of appData.DIFFICULTIES) {
    const entry = raw[diff.id];
    const maxCount = (appData.STAGES_BY_DIFFICULTY[diff.id] || []).length;
    if (entry && typeof entry === 'object') {
      const unlocked = Number.isInteger(entry.unlockedCount) ? entry.unlockedCount : 1;
      const cleared = Array.isArray(entry.clearedIds)
        ? entry.clearedIds.filter((id) => typeof id === 'string')
        : [];
      base[diff.id] = {
        unlockedCount: Math.max(1, Math.min(maxCount || 1, unlocked)),
        clearedIds: Array.from(new Set(cleared)),
      };
    }
  }
  return base;
}

/**
 * Pure transition: record a cleared stage and unlock the next stage if applicable.
 */
function applyStageClear(progress, difficultyId, stageIndex, stageId, totalStages) {
  const nextProgress = {};
  for (const key of Object.keys(progress)) {
    nextProgress[key] = {
      unlockedCount: progress[key].unlockedCount,
      clearedIds: [...progress[key].clearedIds],
    };
  }

  const current = nextProgress[difficultyId] || { unlockedCount: 1, clearedIds: [] };
  const newlyCleared = !current.clearedIds.includes(stageId);
  if (newlyCleared) {
    current.clearedIds.push(stageId);
  }

  const nextUnlockTarget = Math.min(totalStages, stageIndex + 2);
  const newlyUnlocked = nextUnlockTarget > current.unlockedCount;
  if (newlyUnlocked) {
    current.unlockedCount = nextUnlockTarget;
  }

  nextProgress[difficultyId] = current;
  return { nextProgress, newlyCleared, newlyUnlocked };
}

/**
 * Solve a single row or column using human-friendly deduction rules only:
 * 1. remTarget === 0 -> all remaining unknowns are 0 (×)
 * 2. cell > remTarget -> that cell is 0 (×)
 * 3. k <= 5 and remTarget === remFullSum -> all remaining unknowns are 1
 * 4. k <= 4 -> intersection of subsets of <= 4 remaining cells summing to remTarget
 */
function ultraHumanSolveLine(numbers, known, target, lineLabel = '') {
  const n = numbers.length;
  const unknownIdx = [];
  let fixedSum = 0;
  for (let i = 0; i < n; i++) {
    if (known[i] === 1) fixedSum += numbers[i];
    else if (known[i] === -1) unknownIdx.push(i);
  }
  const remTarget = target - fixedSum;
  if (remTarget < 0) return { valid: false, forced: [] };
  const k = unknownIdx.length;
  if (k === 0) return { valid: remTarget === 0, forced: [] };

  const remFullSum = unknownIdx.reduce((a, idx) => a + numbers[idx], 0);
  if (remTarget > remFullSum) return { valid: false, forced: [] };

  const forced = [];
  for (const idx of unknownIdx) {
    if (remTarget === 0) {
      forced.push({
        idx,
        value: 0,
        reason: `${lineLabel}の合計が目標(${target})に一致済みのため、残りは×`,
      });
    } else if (numbers[idx] > remTarget) {
      forced.push({
        idx,
        value: 0,
        reason: `${lineLabel}の残り目標(${remTarget})より数字(${numbers[idx]})が大きいため×`,
      });
    }
  }
  if (forced.length > 0) return { valid: true, forced };

  if (k <= 5 && remTarget === remFullSum) {
    for (const idx of unknownIdx) {
      forced.push({
        idx,
        value: 1,
        reason: `${lineLabel}の残り${k}マスをすべて足すと残り目標(${remTarget})になるため塗る`,
      });
    }
    return { valid: true, forced };
  }

  if (k <= 4) {
    let allOnes = (1 << k) - 1;
    let allZeros = (1 << k) - 1;
    let anyValid = false;
    const limit = 1 << k;
    for (let mask = 0; mask < limit; mask++) {
      let s = 0;
      for (let j = 0; j < k; j++) {
        if (mask & (1 << j)) s += numbers[unknownIdx[j]];
      }
      if (s === remTarget) {
        anyValid = true;
        allOnes &= mask;
        allZeros &= (~mask) & (limit - 1);
      }
    }
    if (!anyValid) return { valid: false, forced: [] };
    for (let j = 0; j < k; j++) {
      if (allOnes & (1 << j)) {
        forced.push({
          idx: unknownIdx[j],
          value: 1,
          reason: `${lineLabel}の残り${k}マスから合計${remTarget}を作る組合せで塗るマスが確定`,
        });
      } else if (allZeros & (1 << j)) {
        forced.push({
          idx: unknownIdx[j],
          value: 0,
          reason: `${lineLabel}の残り${k}マスから合計${remTarget}を作る組合せで×が確定`,
        });
      }
    }
  }
  return { valid: true, forced };
}

/**
 * Verify that a stage is 100% solvable by human-scale line deduction and return the deduction trace.
 */
function verifyHumanSolvable(gridNumbers, answerMap) {
  const N = gridNumbers.length;
  const { targetRows, targetCols } = appData.deriveTargets(gridNumbers, answerMap);
  const resultGrid = Array.from({ length: N }, () => Array(N).fill(-1));
  const trace = [];
  let changed = true;
  let steps = 0;

  while (changed) {
    changed = false;
    steps++;
    for (let r = 0; r < N; r++) {
      const res = ultraHumanSolveLine(gridNumbers[r], resultGrid[r], targetRows[r], `${r + 1}行目`);
      if (!res.valid) return { solved: false, steps, resultGrid, trace };
      for (const item of res.forced) {
        if (resultGrid[r][item.idx] === -1) {
          resultGrid[r][item.idx] = item.value;
          trace.push({ r, c: item.idx, value: item.value, reason: item.reason });
          changed = true;
        }
      }
    }
    for (let c = 0; c < N; c++) {
      const colNums = gridNumbers.map((row) => row[c]);
      const colState = resultGrid.map((row) => row[c]);
      const res = ultraHumanSolveLine(colNums, colState, targetCols[c], `${c + 1}列目`);
      if (!res.valid) return { solved: false, steps, resultGrid, trace };
      for (const item of res.forced) {
        if (resultGrid[item.idx][c] === -1) {
          resultGrid[item.idx][c] = item.value;
          trace.push({ r: item.idx, c, value: item.value, reason: item.reason });
          changed = true;
        }
      }
    }
  }

  const solved = resultGrid.every((row) => row.every((v) => v !== -1));
  return { solved, steps, resultGrid, trace };
}

/**
 * Pure helper: find one cell to fix or reveal for the Hint button.
 * Prioritizes fixing an erroneously selected cell, then revealing an unselected answer cell.
 */
function findHintCell(answerMap, selectedGrid) {
  for (let r = 0; r < answerMap.length; r++) {
    for (let c = 0; c < answerMap[r].length; c++) {
      if (selectedGrid[r][c] && answerMap[r][c] === 0) {
        return { r, c, action: 'unselect' };
      }
    }
  }
  for (let r = 0; r < answerMap.length; r++) {
    for (let c = 0; c < answerMap[r].length; c++) {
      if (!selectedGrid[r][c] && answerMap[r][c] === 1) {
        return { r, c, action: 'select' };
      }
    }
  }
  return null;
}

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

  hint() {
    this.playTone(587.33, 880, 0.09, 'sine', 0.07);
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

function loadProgressFromStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialProgress();
    return normalizeProgress(JSON.parse(raw));
  } catch {
    return createInitialProgress();
  }
}

function saveProgressToStorage(progress) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Ignore storage quota or restricted environments.
  }
}

function initGame() {
  const homeScreenEl = document.getElementById('home-screen');
  const stagesScreenEl = document.getElementById('stages-screen');
  const gameScreenEl = document.getElementById('game-screen');

  const difficultyListEl = document.getElementById('difficulty-list');
  const stagesTitleEl = document.getElementById('stages-title');
  const stagesProgressTextEl = document.getElementById('stages-progress-text');
  const stagesProgressFillEl = document.getElementById('stages-progress-fill');
  const playNextBtn = document.getElementById('play-next-btn');
  const stageGridEl = document.getElementById('stage-grid');

  const gameDifficultyBadgeEl = document.getElementById('game-difficulty-badge');
  const gameStageTitleEl = document.getElementById('game-stage-title');
  const boardEl = document.getElementById('game-board');
  const clearBannerEl = document.getElementById('clear-banner');
  const clearBannerTextEl = document.getElementById('clear-banner-text');
  const clearUnlockTextEl = document.getElementById('clear-unlock-text');
  const nextStageBtn = document.getElementById('next-stage-btn');
  const clearToListBtn = document.getElementById('clear-to-list-btn');

  const modeToggleBtn = document.getElementById('mode-toggle-btn');
  const hintBtn = document.getElementById('hint-btn');
  const resetBtn = document.getElementById('reset-btn');
  const soundToggleBtn = document.getElementById('sound-toggle-btn');
  const statusHintEl = document.getElementById('status-hint');

  const backToHomeBtn = document.getElementById('back-to-home-btn');
  const backToStagesBtn = document.getElementById('back-to-stages-btn');

  const rulesDialog = document.getElementById('rules-dialog');
  const openRulesBtns = [
    document.getElementById('open-rules-home-btn'),
    document.getElementById('open-rules-stages-btn'),
    document.getElementById('open-rules-game-btn'),
  ].filter(Boolean);
  const closeRulesBtn = document.getElementById('close-rules-btn');
  const confirmRulesBtn = document.getElementById('confirm-rules-btn');
  const resetProgressBtn = document.getElementById('reset-progress-btn');

  if (!homeScreenEl || !boardEl) return;

  const sfx = new SoundEffects();

  const state = {
    view: 'home', // 'home' | 'stages' | 'game'
    difficultyId: appData.DIFFICULTIES[0]?.id || 'easy',
    stageIndex: 0,
    mode: 'fill', // 'fill' | 'mark'
    selectedGrid: [],
    xMarkGrid: [],
    isCleared: false,
    newlyUnlockedIndex: null,
    prevMatchedRows: [],
    prevMatchedCols: [],
    dragSession: null,
    ignoreClickUntil: 0,
    progress: loadProgressFromStorage(),
  };

  let rowHeaderEls = [];
  let colHeaderEls = [];
  let cellEls = [];

  function getDifficultyMeta(diffId = state.difficultyId) {
    return appData.DIFFICULTIES.find((d) => d.id === diffId) || appData.DIFFICULTIES[0];
  }

  function getStagesForDifficulty(diffId = state.difficultyId) {
    return appData.STAGES_BY_DIFFICULTY[diffId] || [];
  }

  function getStage() {
    return getStagesForDifficulty()[state.stageIndex];
  }

  function switchView(nextView) {
    state.view = nextView;
    state.dragSession = null;
    homeScreenEl.hidden = nextView !== 'home';
    stagesScreenEl.hidden = nextView !== 'stages';
    gameScreenEl.hidden = nextView !== 'game';

    if (nextView === 'home') {
      renderHomeScreen();
    } else if (nextView === 'stages') {
      renderStageSelectScreen();
    }
  }

  function renderHomeScreen() {
    difficultyListEl.textContent = '';

    for (const diff of appData.DIFFICULTIES) {
      const stages = getStagesForDifficulty(diff.id);
      const prog = state.progress[diff.id] || { unlockedCount: 1, clearedIds: [] };
      const clearedCount = prog.clearedIds.length;

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'difficulty-card';
      card.style.setProperty('--card-color', diff.themeColor);

      const title = document.createElement('span');
      title.className = 'difficulty-card-title';
      title.textContent = `${diff.label} (${diff.size} × ${diff.size})`;

      const sub = document.createElement('span');
      sub.className = 'difficulty-card-sub';
      sub.textContent = diff.subtitle;

      const progBadge = document.createElement('span');
      progBadge.className = 'difficulty-card-progress';
      progBadge.textContent =
        clearedCount >= stages.length
          ? `🏆 コンプリート！ (${clearedCount}/${stages.length}問)`
          : `解放: ${prog.unlockedCount}/${stages.length}問 ・ クリア: ${clearedCount}/${stages.length}問`;

      card.append(title, sub, progBadge);
      card.addEventListener('click', () => {
        state.difficultyId = diff.id;
        switchView('stages');
      });

      difficultyListEl.appendChild(card);
    }
  }

  function getNextPlayableIndex(diffId) {
    const stages = getStagesForDifficulty(diffId);
    const prog = state.progress[diffId] || { unlockedCount: 1, clearedIds: [] };
    for (let i = 0; i < prog.unlockedCount && i < stages.length; i++) {
      if (!prog.clearedIds.includes(stages[i].id)) {
        return i;
      }
    }
    return 0;
  }

  function renderStageSelectScreen() {
    const diff = getDifficultyMeta();
    const stages = getStagesForDifficulty();
    const prog = state.progress[diff.id] || { unlockedCount: 1, clearedIds: [] };
    const clearedSet = new Set(prog.clearedIds);
    const clearedCount = clearedSet.size;
    const pct = stages.length > 0 ? Math.round((clearedCount / stages.length) * 100) : 0;

    document.documentElement.style.setProperty('--diff-accent', diff.themeColor);
    stagesTitleEl.textContent = `${diff.label} (${diff.size} × ${diff.size})`;
    stagesProgressTextEl.textContent = `クリア: ${clearedCount} / ${stages.length}問 （解放済み: ${prog.unlockedCount}問）`;
    stagesProgressFillEl.style.inlineSize = `${pct}%`;

    const nextIdx = getNextPlayableIndex(diff.id);
    playNextBtn.textContent =
      clearedCount >= stages.length
        ? '▶ 最初からもう一度遊ぶ (Q.1)'
        : `▶ つづきから遊ぶ (Q.${nextIdx + 1})`;

    stageGridEl.textContent = '';

    stages.forEach((stage, idx) => {
      const isUnlocked = idx < prog.unlockedCount;
      const isCleared = clearedSet.has(stage.id);
      const isCurrent = isUnlocked && !isCleared && idx === nextIdx;

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'stage-card';
      card.setAttribute('role', 'listitem');

      if (isCleared) card.classList.add('is-cleared');
      else if (isCurrent) card.classList.add('is-current');
      else if (!isUnlocked) card.classList.add('is-locked');

      card.disabled = !isUnlocked;

      const numEl = document.createElement('span');
      numEl.className = 'stage-card-num';
      numEl.textContent = `Q.${stage.number}`;

      const iconEl = document.createElement('span');
      iconEl.className = 'stage-card-icon';
      iconEl.textContent = !isUnlocked ? '🔒' : isCleared ? stage.icon : '❓';

      const nameEl = document.createElement('span');
      nameEl.className = 'stage-card-name';
      nameEl.textContent = !isUnlocked ? '未解放' : isCleared ? stage.name : '???';

      const badgeEl = document.createElement('span');
      badgeEl.className = 'stage-card-badge';
      badgeEl.textContent = isCleared ? 'CLEAR' : isUnlocked ? 'PLAY' : 'LOCK';

      card.append(numEl, iconEl, nameEl, badgeEl);
      if (isUnlocked) {
        card.addEventListener('click', () => {
          loadStage(idx);
          switchView('game');
        });
      }

      stageGridEl.appendChild(card);
    });
  }

  function loadStage(index) {
    const diff = getDifficultyMeta();
    const stages = getStagesForDifficulty();
    state.stageIndex = index;
    const stage = getStage();
    const rows = stage.gridNumbers.length;
    const cols = stage.gridNumbers[0].length;

    state.selectedGrid = createEmptyGrid(rows, cols, false);
    state.xMarkGrid = createEmptyGrid(rows, cols, false);
    state.isCleared = false;
    state.newlyUnlockedIndex = null;
    state.prevMatchedRows = stage.targetRows.map((t) => t === 0);
    state.prevMatchedCols = stage.targetCols.map((t) => t === 0);
    state.dragSession = null;

    document.documentElement.style.setProperty('--diff-accent', diff.themeColor);
    document.documentElement.style.setProperty('--stage-accent', stage.accentColor);

    gameDifficultyBadgeEl.textContent = `${diff.label} ${diff.size}×${diff.size}`;
    updateGameStageHeading();

    buildBoardDOM();
    updateBoardUI({ suppressSounds: true });
  }

  function updateGameStageHeading() {
    const stage = getStage();
    const prog = state.progress[state.difficultyId];
    const alreadyCleared = prog?.clearedIds.includes(stage.id);
    if (state.isCleared || alreadyCleared) {
      gameStageTitleEl.textContent = `Q.${stage.number} ${stage.icon} ${stage.name}`;
    } else {
      gameStageTitleEl.textContent = `Q.${stage.number} ???`;
    }
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

    const corner = document.createElement('div');
    corner.className = 'board-corner';
    corner.setAttribute('aria-hidden', 'true');
    corner.textContent = '∑';
    boardEl.appendChild(corner);

    for (let c = 0; c < cols; c++) {
      const header = document.createElement('div');
      header.className = 'header-cell col-header';
      header.innerHTML = `<span class="target-val">${stage.targetCols[c]}</span><span class="current-val">(0)</span>`;
      boardEl.appendChild(header);
      colHeaderEls.push(header);
    }

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
        if (cols === 10 && c === 4) btn.classList.add('is-guide-right');
        if (rows === 10 && r === 4) btn.classList.add('is-guide-bottom');
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
    if (state.isCleared || state.view !== 'game') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

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
    if (!state.dragSession || state.isCleared || state.view !== 'game') return;
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
    el.classList.toggle('is-matched', current === target);
    el.classList.toggle('is-exceeded', current > target);
    const currentSpan = el.querySelector('.current-val');
    if (currentSpan) {
      currentSpan.textContent = `(${current})`;
    }
  }

  function updateBoardUI({ suppressSounds = false } = {}) {
    const stage = getStage();
    const stages = getStagesForDifficulty();
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

    if (newlyCleared) {
      const transition = applyStageClear(
        state.progress,
        state.difficultyId,
        state.stageIndex,
        stage.id,
        stages.length
      );
      state.progress = transition.nextProgress;
      saveProgressToStorage(state.progress);
      if (transition.newlyUnlocked) {
        state.newlyUnlockedIndex = state.stageIndex + 1;
      }
      updateGameStageHeading();
    }

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

    const cornerEl = boardEl.querySelector('.board-corner');
    if (cornerEl) {
      cornerEl.textContent = cleared ? stage.icon : '∑';
    }

    clearBannerEl.hidden = !cleared;
    if (cleared) {
      clearBannerTextEl.textContent = `${stage.icon} STAGE CLEARED! 「${stage.name}」が完成しました！`;
      if (state.newlyUnlockedIndex !== null) {
        clearUnlockTextEl.hidden = false;
        clearUnlockTextEl.textContent = `🔓 新しい問題「Q.${state.newlyUnlockedIndex + 1}」が解放されました！`;
      } else {
        clearUnlockTextEl.hidden = true;
      }

      const hasNext = state.stageIndex + 1 < stages.length;
      nextStageBtn.hidden = !hasNext;
      if (hasNext) {
        nextStageBtn.textContent = `次の問題へ (Q.${state.stageIndex + 2}) →`;
      }
      clearToListBtn.textContent = hasNext
        ? 'ステージ一覧へ'
        : '🎉 全問コンプリート！一覧へ';
    }

    if (hintBtn) {
      hintBtn.disabled = cleared;
    }

    if (statusHintEl) {
      statusHintEl.textContent = cleared
        ? 'クリアおめでとうございます！「次の問題へ」で進めます。'
        : '左クリック/タップで塗りつぶし（ドラッグ可）・右クリック/✖️モードでメモ';
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
    soundToggleBtn.textContent = sfx.muted ? '🔇' : '🔊';
  }

  function openRulesModal() {
    if (!rulesDialog) return;
    if (typeof rulesDialog.showModal === 'function') {
      rulesDialog.showModal();
    } else {
      rulesDialog.setAttribute('open', '');
    }
  }

  function closeRulesModal() {
    if (!rulesDialog) return;
    if (typeof rulesDialog.close === 'function') {
      rulesDialog.close();
    } else {
      rulesDialog.removeAttribute('open');
    }
  }

  window.addEventListener('pointermove', handlePointerMove, { passive: true });
  window.addEventListener('pointerup', endDragSession);
  window.addEventListener('pointercancel', endDragSession);

  backToHomeBtn?.addEventListener('click', () => switchView('home'));
  backToStagesBtn?.addEventListener('click', () => switchView('stages'));
  clearToListBtn?.addEventListener('click', () => switchView('stages'));

  playNextBtn?.addEventListener('click', () => {
    const idx = getNextPlayableIndex(state.difficultyId);
    loadStage(idx);
    switchView('game');
  });

  nextStageBtn?.addEventListener('click', () => {
    const stages = getStagesForDifficulty();
    if (state.stageIndex + 1 < stages.length) {
      loadStage(state.stageIndex + 1);
    }
  });

  modeToggleBtn?.addEventListener('click', () => {
    state.mode = state.mode === 'fill' ? 'mark' : 'fill';
    updateModeButton();
  });

  hintBtn?.addEventListener('click', () => {
    if (state.isCleared) return;
    const stage = getStage();
    const basicHint = findHintCell(stage.answerMap, state.selectedGrid);
    let targetR = null;
    let targetC = null;
    let hintMessage = '';

    if (basicHint && basicHint.action === 'unselect') {
      targetR = basicHint.r;
      targetC = basicHint.c;
      state.selectedGrid[targetR][targetC] = false;
      hintMessage = `💡 ヒント (${targetR + 1}行${targetC + 1}列): 塗らないマスなので選択を解除しました！`;
    } else {
      const solvedTrace = verifyHumanSolvable(stage.gridNumbers, stage.answerMap).trace;
      const nextStep = solvedTrace.find(
        (step) =>
          (step.value === 1 && !state.selectedGrid[step.r][step.c]) ||
          (step.value === 0 && !state.xMarkGrid[step.r][step.c])
      );

      if (nextStep) {
        targetR = nextStep.r;
        targetC = nextStep.c;
        if (nextStep.value === 1) {
          state.selectedGrid[targetR][targetC] = true;
          state.xMarkGrid[targetR][targetC] = false;
        } else {
          state.xMarkGrid[targetR][targetC] = true;
          state.selectedGrid[targetR][targetC] = false;
        }
        hintMessage = `💡 ヒント (${targetR + 1}行${targetC + 1}列): ${nextStep.reason}`;
      } else if (basicHint) {
        targetR = basicHint.r;
        targetC = basicHint.c;
        state.selectedGrid[targetR][targetC] = true;
        state.xMarkGrid[targetR][targetC] = false;
        hintMessage = `💡 ヒント (${targetR + 1}行${targetC + 1}列): 正解のマスを1つ塗りました！`;
      }
    }

    if (targetR === null || targetC === null) return;

    sfx.hint();
    updateBoardUI();
    if (!state.isCleared && statusHintEl && hintMessage) {
      statusHintEl.textContent = hintMessage;
    }

    const cell = cellEls[targetR]?.[targetC];
    if (cell) {
      cell.classList.remove('is-hint-flash');
      void cell.offsetWidth;
      cell.classList.add('is-hint-flash');
    }
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

  for (const btn of openRulesBtns) {
    btn.addEventListener('click', openRulesModal);
  }
  closeRulesBtn?.addEventListener('click', closeRulesModal);
  confirmRulesBtn?.addEventListener('click', closeRulesModal);
  rulesDialog?.addEventListener('click', (e) => {
    if (e.target === rulesDialog) {
      closeRulesModal();
    }
  });

  resetProgressBtn?.addEventListener('click', () => {
    const ok = window.confirm('すべてのクリア履歴と解放状況を初期化しますか？');
    if (!ok) return;
    state.progress = createInitialProgress();
    saveProgressToStorage(state.progress);
    closeRulesModal();
    switchView('home');
  });

  updateModeButton();
  updateSoundButton();
  switchView('home');
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
    DIFFICULTIES: appData.DIFFICULTIES,
    STAGES_BY_DIFFICULTY: appData.STAGES_BY_DIFFICULTY,
    STAGES,
    deriveTargets: appData.deriveTargets,
    calculateCurrentSums,
    checkIsCleared,
    createInitialProgress,
    applyStageClear,
    findHintCell,
    ultraHumanSolveLine,
    verifyHumanSolvable,
  };
}
