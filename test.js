'use strict';

const assert = require('node:assert/strict');
const {
  STAGES,
  deriveTargets,
  calculateCurrentSums,
  checkIsCleared,
} = require('./app.js');

function sumArray(arr) {
  return arr.reduce((acc, n) => acc + n, 0);
}

// 1. Verify Stage 1 matches the specification's 5x5 Heart gridNumbers & answerMap
const heartStage = STAGES[0];
assert.equal(heartStage.id, 'heart');
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

// 2-4. Verify invariants and clear conditions across all stages
for (const stage of STAGES) {
  const derived = deriveTargets(stage.gridNumbers, stage.answerMap);
  assert.deepEqual(
    stage.targetRows,
    derived.targetRows,
    `${stage.id}: targetRows mismatch`
  );
  assert.deepEqual(
    stage.targetCols,
    derived.targetCols,
    `${stage.id}: targetCols mismatch`
  );
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

console.log(`ALL TESTS PASSED (${STAGES.length} stages verified)`);
