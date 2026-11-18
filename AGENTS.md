# AGENTS.md

このファイルは、AIエージェントが `C:\dev\test-project`（ナンバーサム・ピクロス）を保守・拡張する際のガイドラインです。

## 1. プロジェクト構成

| ファイル | 役割 |
| --- | --- |
| `index.html` | 難易度選択・ステージ選択・ゲーム盤面・遊び方 `<dialog>` のマークアップ |
| `styles.css` | ダークテーマ基調のレスポンシブ・アクセシビリティ対応スタイルシート |
| `stages.js` | `DIFFICULTIES`、`STAGES_BY_DIFFICULTY`（5×5×12問、8×8×13問、10×10×13問）、`deriveTargets` |
| `app.js` | 計算ロジック、段階解放管理 (`applyStageClear`)、ヒント (`findHintCell`)、画面遷移・入力・Web Audio 制御 |
| `test.js` | 全38問の整合性・段階解放・ヒントを検証する Node.js テストスクリプト |
| `README.md` | プロジェクト概要、ルール、操作方法、テスト実行方法 |

## 2. ステージデータの不変条件 (Invariants)

新しいステージを `stages.js` に追加・編集する際は、以下を必ず守ってください。

1. **ターゲット値は必ず `deriveTargets(gridNumbers, answerMap)` で算出すること**。手計算でハードコードしない。
2. **`sum(targetRows) === sum(targetCols)` が常に成り立つこと**。
3. **盤面の数字は `1〜9` の整数**とし、可能な限り行・列合計から一意に解ける盤面を保つこと。
4. `file:///` で直接開いても動作するよう、`stages.js` と `app.js` は通常スクリプト（非 ES Module）のグローバル連携 + Node.js `module.exports` 両対応を維持する。
5. 変更後は必ず `node C:\dev\test-project\test.js` を実行し、`ALL TESTS PASSED` を確認する。

## 3. UI・ブラウザ実装ポリシー (Modern Web Guidance)

- **ブラウザサポート基準:** 原則として **Baseline Widely Available** の機能を使用する。`dvh` の直前に `100vh` フォールバックを併記する。
- **CSS設計:**
  - 寸法・余白は原則として論理プロパティ（`inline-size`, `block-size`, `padding-inline`, `padding-block`）を使用する。
  - 盤面カードには `container: game-card / inline-size` を設定し、`cqi` と `clamp()` による流動的タイポグラフィで 5×5 / 8×8 / 10×10 のすべてを見やすく保つ。
  - アニメーションはコンポジタ専用プロパティ（`scale`, `transform`, `opacity`）のみを使用し、`@media (prefers-reduced-motion: no-preference)` で保護する。`linear()` スプリングイージングには `ease-out` のフォールバックを先行させる。
- **インタラクション & アクセシビリティ:**
  - ポインタ操作は `pointerdown` で即時反映し、キーボード操作（`Enter`/`Space`/矢印キー/`WASD`/`X`）および `aria-pressed` / `aria-label` / `aria-live="polite"` を維持する。
  - `:focus-visible` のフォーカスリングを削除しない。
  - ルールモーダルはネイティブ `<dialog>`（`.showModal()` / `.close()`）を使用する。
