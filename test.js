'use strict';

const assert = require('node:assert/strict');
const {
  DIFFICULTIES,
  STAGES_BY_DIFFICULTY,
  STAGES,
  deriveTargets,
  calculateCurrentSums,
  checkIsCleared,
  createInitialProgress,
  applyStageClear,
  findHintCell,
} = require('./app.js');

function sumArray(arr) {
  return arr.reduce((acc, n) => acc + n, 0);
}

// 1. Verify difficulty counts and grid sizes
assert.equal(DIFFICULTIES.length, 3);
assert.equal(STAGES_BY_DIFFICULTY.easy.length, 12);
assert.equal(STAGES_BY_DIFFICULTY.normal.length, 13);
assert.equal(STAGES_BY_DIFFICULTY.hard.length, 13);
assert.equal(STAGES.length, 38);

// 2. Verify Stage 1 (easy-01 Heart) exact specification
const heartStage = STAGES_BY_DIFFICULTY.easy[0];
assert.equal(heartStage.id, 'easy-01');
assert.deepEqual(heartStage.gridNumbers, [
  [1, 3, 2, 3, 5],
  [4, 7, 1, 9, 2],
  [5, 2, 8, 1, 6],
  [9, 1, 5, 4, 3],
  [2, 6, 2, 7, 1],
]);
assert.deepEqual(heartStage.answerMap, [
  [0, 1, 0, 1, 0],
  [1, 1, 1, 1, 1],
  [0, 1, 1, 1, 0],
  [0, 0, 1, 0, 0],
  [0, 0, 0, 0, 0],
]);
assert.deepEqual(heartStage.targetRows, [6, 23, 11, 5, 0]);
assert.deepEqual(heartStage.targetCols, [4, 12, 14, 13, 2]);

// 3. Verify invariants and clear conditions across all 38 stages
for (const diff of DIFFICULTIES) {
  const stages = STAGES_BY_DIFFICULTY[diff.id];
  for (const stage of stages) {
    assert.equal(stage.gridNumbers.length, diff.size, `${stage.id}: row count`);
    assert.equal(stage.answerMap.length, diff.size, `${stage.id}: answerMap row count`);
    for (let r = 0; r < diff.size; r++) {
      assert.equal(stage.gridNumbers[r].length, diff.size, `${stage.id}: col count`);
      assert.equal(stage.answerMap[r].length, diff.size, `${stage.id}: answerMap col count`);
      for (const val of stage.gridNumbers[r]) {
        assert.ok(val >= 1 && val <= 9, `${stage.id}: cell digit out of range: ${val}`);
      }
    }

    const derived = deriveTargets(stage.gridNumbers, stage.answerMap);
    assert.deepEqual(stage.targetRows, derived.targetRows, `${stage.id}: targetRows mismatch`);
    assert.deepEqual(stage.targetCols, derived.targetCols, `${stage.id}: targetCols mismatch`);
    assert.equal(
      sumArray(stage.targetRows),
      sumArray(stage.targetCols),
      `${stage.id}: row total must equal col total`
    );

    const emptyGrid = stage.gridNumbers.map((row) => row.map(() => false));
    const emptySums = calculateCurrentSums(stage.gridNumbers, emptyGrid);
    assert.equal(
      checkIsCleared(
        emptySums.currentRowsSum,
        emptySums.currentColsSum,
        stage.targetRows,
        stage.targetCols
      ),
      false,
      `${stage.id}: empty grid must not be cleared`
    );

    const solvedGrid = stage.answerMap.map((row) => row.map((v) => v === 1));
    const solvedSums = calculateCurrentSums(stage.gridNumbers, solvedGrid);
    assert.deepEqual(solvedSums.currentRowsSum, stage.targetRows);
    assert.deepEqual(solvedSums.currentColsSum, stage.targetCols);
    assert.equal(
      checkIsCleared(
        solvedSums.currentRowsSum,
        solvedSums.currentColsSum,
        stage.targetRows,
        stage.targetCols
      ),
      true,
      `${stage.id}: answerMap selection must clear stage`
    );
  }
}

// 4. Verify progressive unlocking transitions
let prog = createInitialProgress();
assert.equal(prog.easy.unlockedCount, 1);
assert.deepEqual(prog.easy.clearedIds, []);

let step = applyStageClear(prog, 'easy', 0, 'easy-01', 12);
assert.equal(step.newlyCleared, true);
assert.equal(step.newlyUnlocked, true);
assert.equal(step.nextProgress.easy.unlockedCount, 2);
assert.deepEqual(step.nextProgress.easy.clearedIds, ['easy-01']);

// Re-clearing stage 1 should not duplicate clearedIds or unlock past 2
step = applyStageClear(step.nextProgress, 'easy', 0, 'easy-01', 12);
assert.equal(step.newlyCleared, false);
assert.equal(step.newlyUnlocked, false);
assert.equal(step.nextProgress.easy.unlockedCount, 2);
assert.deepEqual(step.nextProgress.easy.clearedIds, ['easy-01']);

// Clearing the last stage caps unlockedCount at totalStages
step = applyStageClear(step.nextProgress, 'easy', 11, 'easy-12', 12);
assert.equal(step.nextProgress.easy.unlockedCount, 12);
assert.equal(step.newlyUnlocked, true);

// 5. Verify findHintCell behavior
const wrongGrid = heartStage.answerMap.map((row) => row.map((v) => v === 1));
wrongGrid[0][0] = true; // wrong cell (answerMap[0][0] === 0)
assert.deepEqual(findHintCell(heartStage.answerMap, wrongGrid), {
  r: 0,
  c: 0,
  action: 'unselect',
});

const partialGrid = heartStage.answerMap.map((row) => row.map((v) => v === 1));
partialGrid[0][1] = false; // missing cell (answerMap[0][1] === 1)
assert.deepEqual(findHintCell(heartStage.answerMap, partialGrid), {
  r: 0,
  c: 1,
  action: 'select',
});

const fullGrid = heartStage.answerMap.map((row) => row.map((v) => v === 1));
assert.equal(findHintCell(heartStage.answerMap, fullGrid), null);

console.log(`ALL TESTS PASSED (${STAGES.length} stages verified across ${DIFFICULTIES.length} difficulties)`);
