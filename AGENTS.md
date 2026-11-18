# AGENTS.md

このファイルは、AIエージェントが `C:\dev\test-project`（ナンバーサム・ピクロス）を保守・拡張する際のガイドラインです。

## 1. プロジェクト構成

| ファイル | 役割 |
| --- | --- |
| `index.html` | ゲームのマークアップ構造（`<main>`, ステージタブ, ツールバー, 盤面グリッド, クリア通知バナー） |
| `styles.css` | レスポンシブ・アクセシビリティ対応スタイルシート（`color-scheme: light dark`, コンテナクエリ） |
| `app.js` | 純粋なパズル計算ロジック、ステージ定義 (`STAGES`)、UI/ポインタ/キーボード/Web Audio制御（Node.js からの `require('./app.js')` にも対応） |
| `test.js` | `app.js` の計算ロジックと全ステージの整合性を検証する Node.js テストスクリプト |
| `README.md` | プロジェクト概要、ルール、技術選定理由、テスト実行方法 |

## 2. ステージデータの不変条件 (Invariants)

新しいステージを `STAGES` に追加・編集する際は、計算ズレによる「クリア不可能な盤面」を防ぐため、以下を必ず守ってください。

1. **ターゲット値は必ず `deriveTargets(gridNumbers, answerMap)` で算出すること**（`createStage` ヘルパー経由で生成する）。`targetRows` や `targetCols` を手計算でハードコードしない。
2. **`sum(targetRows) === sum(targetCols)` が常に成り立つこと**。
3. ステージ追加後は必ず `node test.js` を実行し、全ステージで空盤面が未クリア・正解盤面がクリアになることを確認する。

## 3. UI・ブラウザ実装ポリシー (Modern Web Guidance)

- **ブラウザサポート基準:** 原則として **Baseline Widely Available** の機能を使用する。`dvh` のような比較的新しい単位を使う場合は、直前に `100vh` 等のフォールバック宣言を併記する。
- **CSS設計:**
  - 寸法・余白は原則として論理プロパティ（`inline-size`, `block-size`, `padding-inline`, `padding-block`）を使用する。
  - 盤面カードには `container: game-card / inline-size` を設定し、`cqi` と `clamp()` による流動的タイポグラフィを維持する。
  - アニメーションはコンポジタ専用プロパティ（`scale`, `transform`, `opacity`）のみを使用し、`@media (prefers-reduced-motion: no-preference)` で保護する。`linear()` スプリングイージングには `ease-out` のフォールバックを先行させる。
- **インタラクション & アクセシビリティ:**
  - クリック・タップの応答性を最優先し、ポインタ操作は `pointerdown` で即時反映する。キーボード操作（`Enter`/`Space`/矢印キー/`WASD`/`X`）およびスクリーンリーダー向けの `aria-pressed` / `aria-label` / `aria-live="polite"` を維持する。
  - `:focus-visible` のフォーカスリング（`CanvasText`）を削除しない。
- **テスト実行:**
  - 変更を加えた後は必ず `node C:\dev\test-project\test.js` を実行し、`ALL TESTS PASSED` を確認する。
