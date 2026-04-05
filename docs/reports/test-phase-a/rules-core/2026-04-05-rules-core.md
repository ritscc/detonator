# Rules-Core パッケージ テストギャップ分析

**日付**: 2026-04-05
**パッケージ**: `@detonator/rules-core`
**フェーズ**: A（既存テスト検証・補完）
**分析エージェント**: explore agent (ses_2a3d24991ffeexhNIshVMDZ52a)

---

## 1. スコープ

対象:
- **19ソースファイル**（20ではない — index.ts + types.ts + 17モジュールファイル）
- **18テストファイル**（モジュール別網羅的カバレッジ）
- 権威: `api.md`（最終ゲームルール）, `shared-dev-plan.md` §7（DTO/シグネチャ）, `be-dev-plan.md`（サーバー側構成）

> これは **最高優先度パッケージ** — 全ゲームロジックを含む。

---

## 2. 権威チェーン

| 優先 | ドキュメント | セ�ション |
|---|---|---|
| 1（最終） | `api.md` | Dig ルル、移動、EXP、ドロップ、CP、インベントリ、スコアリング |
| 2 | `shared-dev-plan.md` | §7.4 (DTO), §7.5 (関数シグネチャ) |
| 3 | `be-dev-plan.md` | rules-core 関数のサーバー側構成 |

---

## 3. モジュール別カバレッジ目録

### Types / 公開サーフィス
- **テスト**: `types.test.ts`（1ケース — DTO 形状スモーク）
- **判定**: 🟡 **維持** — 良好なベースライン、バレルエクスポート回帰テストなし

### A. SeededRng (`src/random/SeededRng.ts`)
- **テスト**: 3ケース（決定性、差分、範囲）
- **判定**: 🟡 **強化**
- **不足**: `nextInt(1)`, 非常に大きい max、負の seed、安定性ソーク

### B. Grid Coords (`src/grid/coords.ts`)
- **テスト**: 3ケース（ラウンドトリップ、インデックス 0/39, (0,0)→(3,4) の距離）
- **判定**: 🟡 **強化**
- **不足**: 複数幅上の全コーナー、width=1、負/oob 座標、全ラウンドトリップスイープ

### C. Neighbors & BFS (`src/grid/neighbors.ts`)
- **テスト`: 4ケース（4方向順序、8方向順序、BFS 重複排除、BFS 対角）
- **判定**: 🟡 **強化**
- **不足**: 空開始、1×1グリッド、visitor-null 終了契約

### D. Adjacent Mine Count (`src/grid/adjacent-mine-count.ts`)
- **テスト**: 4ケース（両地雷タイプ、ゼロ近傍、全8方向、古い座標報告）
- **判定**: 🟡 **強化**
- **不足**: oob 候候候補内、明示的不変性アサーション、flood-fill 後統合

### E. Flood-Fill (`src/grid/flood-fill.ts`) ⚠️ **コアメカニック**
- **テスト**: 4ケース（単一セル、全ゼロ領域、危険地雷停止、不変性）
- **判定**: 🟡 **強化**
- **不足**: oob 開始、空グリッド、全安全グリッド、全地雷グリッド、大規模パフォーマンス、変換クリアアップアサーション

### F. Frontline (`src/grid/frontline.ts`)
- **テスト**: 5ケース（地雷抽出、荒地抽出、空結果、幅キャップ、対象なし）
- **判定**: 🟡 **強化**
- **不足**: targetCount≤0, widthCap≤0, SeededRng による再現性

### G1. Movement Speed (`src/movement/speed.ts`)
- **テスト**: 4ケース（基本、荒地ペナルティ、dash+スキル、完全無効化）
- **判定**: 🟡 **強化**
- **不足**: dash のみ、負の比率、クランプ動作、スキル修正値→速度統合

### G2. Movement Facing (`src/movement/facing.ts`)
- **テスト**: 2ケース（移動なしで維持、全8方向+4方向投影）
- **判定**: ✅ **維持** — 関数サイズに対して妥当なカバー

### G3. Movement Collision (`src/movement/collision.ts`)
- **テスト**: 5ケース（非重複、ペアワイズ押出、x軸タイブレーク、連鎖、端接触非衝突）
- **判定**: ✅ **維持** — リスクに対して強力

### H1. Progression EXP (`src/progression/exp.ts`)
- **テスト**: 7ケース（ゼロ/基本/カスタム dig EXP、ゼロ/基本/カスタム combo EXP）
- **判定**: 🟡 **強化**
- **不足**: 切り捨て動作、負の入力、dig→flood-fill→EXP チェーン

### H2. Progression Leveling (`src/progression/leveling.ts`) ⚠️
- **テスト**: 5ケース（基本要求、指数関数、レベルアップなし、単一、複数）
- **判定**: 🔴 **書き換え**
- **理由**: テストが api.md の累積 EXP モ�定と矛盾する可能性のあるセマンティクスを固定化している

### H3. Skill Modifiers (`src/progression/skill-modifiers.ts`)
- **テスト**: 4ケース（空デフォルト、%→比率変換、マルチスタック合計、実データマッピング）
- **判定**: ✅ **維持** — パッケージ内最強力; 実データカバレッジが価値あり
- **注**: skills.json を直接インポート（建築上の懸念だがテストの懸念ではない）

### I1. CP Detection (`src/checkpoint/detection.ts`)
- **テスト**: 3ケース（範囲内フィルタリング、正確なオーバーラップで最初を返す、null）
- **判定**: 🟡 **強化**
- **不足**: 正確半径境界 (dist²==R²)、小数点位置、先着優先

### I2. CP Placement (`src/checkpoint/placement.ts`)
- **テスト**: 2ケース（hole+セーフゾーン除外、供給超で全て返す）
- **判定**: 🟡 **強化**
- **不足**: cpCount≤0、重複排除動作、決定的 seed 選択

### J. Dig Resolution (`src/dig/resolve-dig.ts`) ⚠️⚠️ **最重要関数**
- **テスト**: 5ケース（oob、到達距離>1、無効ターゲット、安全掘削+flood、危険トリガー）
- **判定**: 🔴 **強化**（最高優先度）
- **不足**:
  - **lifeState !== Alive → DIG_NOT_ALIVE**（仕様要求、実装はチェックしない）**
  - 明示的な Safe/Wasteland/Hole ターゲット → DIG_INVALID_TARGET
  - 統合: dig → flood-fill → EXP → drop チェーン
  - Chebyshev 境界における小数点位置
  - 掘掘後の隣接数正確性

### K. Drop Rolling (`src/drop/roll-drop.ts`) ⚠️
- **テスト**: 3ケース（レート失敗、確定ドロップ、重み付け選択）
- **判定**: 🔴 **書き換え**
- **理由**: **実装が deadPlayerExists パラメータを完全に無視** — api.md の重要ビジネスルール未実装・未テスト

### L. Inventory Mutation (`src/reward/inventory-mutation.ts`)
- **テスト**: 9ケース（新規スロット追加、スタック、満杯時、オーバーフロースタック、非スタック可能、部分消費、全消費、全消費、破棄）
- **判定**: 🟡 **強化**
- **不足**: 空スロット消費/oob スロット、maxSlots=10 動動、スタック可能な既存アイテム pickup 時

---

## 4. 重要度分析

`(複雑さ × リスク) ÷ カバレッジ` で順位付け:

| 順位 | モジュール | リスク理由 |
|---|---|---|
| **1** | **dig/resolve-dig** | 最高のゲームプレイ影; alive-state ルール欠落; 統合テストなし |
| **2** | **grid/flood-fill** | コアマインスイーパーメ mechanic; 端エッジカバーが薄い |
| **3** | **drop/roll-drop** | deadPlayerExists ルールを完全に無視; エコノミー影響 |
| **4** | **progression/leveling** | 累積 EXP モ�定との矛盾 |
| **5** | grid/frontline | 複雑な選択アルゴリズム; シナリオ少なすぎる |
| **6** | reward/inventory-mutation | 基盤 private state ロジック; ガード不足 |

---

## 5. 矛盾レポート ⚠️

| # | 問題 | 仕様 | 実装 | 重大度 |
|---|---|---|---|---|
| **RC-1** | **レベル進行モデル** | 初期必要 EXP=100; totalExp は**フロア間で累積** | resolveLevelProgression() は EXP をレベル1からの使い捨て可能プールとして扱う | **📋 高 — 人間の判断が必要** |
| **RC-2** | **Dig alive-state 検証** | 送信者は Alive 必須; DIG_NOT_ALIVE エラーコードが存在 | resolveDig() は **actor.lifeState を決してチェックしない** | 高 — 挙る挙動の乖離 |
| **RC-3** | **死亡プレイヤーのドロップ重み付け** | 死亡プレイヤーはリスポーン短縮ドロップ率を増加 | rollGroundDrop() は **deadPlayerExists パラメータを完全に無視** | 高 — エコノミー機能未実装 |
| RC-4 | スキル修正値コンフィグソース | 注入された config で駆動される純粋関数 | skill-modifiers.ts が skills.json を**直接インポート** | 中 — 建築上のドリフト |

---

## 6. 曖昧点レポート ❓

| # | 質問 |
|---|---|
| RA-1 | CP オーバーラップ: 正確 Vec2===GridCoordか、フロアリングセルか、AABB 占有か？ |
| RA-2 | Dig 範囲: 小数点位置から floor vs round vs 真の連続 Chebyshev か？ |
| RA-3 | 「リスポーン短縮」ドロップサブセットとは？ items/rewards データにラベル付けされていない |
| RA-4 | flood-fill は開示後のセルの隣接数を再計算しない — 事前計算されたデータは意味があるか？ |
| RA-5 | インベェントリ: 動的に拡張するか、maxSlots までの事前割り当てか？ |
| RA-6 | スキルスタック上限: aggregateSkillModifiers で強制か、上位で強制か？ |

---

## 7 | 補完優先度マトリックス

### P0 — 人間の判断が必要

| rule_id | テスト | 依存判断 |
|---|---|---|
| RC-TEST-01 | Dig: 非Alive アクター → DIG_NOT_ALIVE | なし（resolveDig に追加） |
| RC-TEST-02 | Dig: 明示的な Safe/Wasteland/Hole → DIG_INVALID_TARGET | なし |
| RC-TEST-03 | Dig → flood-fill → EXP → drop 統合チェーン | なし |
| **RC-TEST-04** | **Leveling: 累積 EXP セマンティクスが api.md と一致** | **📋 決定 #2 (EXP 永続)** |
| RC-TEST-05 | Drop: deadPlayerExists が選択に実質的に影響 | なし（rollGroundDrop 修正 or 文書化で意図的なスキップ） |

### P1 — 独立して進められるもの

| rule_id | テスト | 工数 |
|---|---|---|
| RC-TEST-06 | Flood-fill: oob/空/全安全/全地雷 境界ケース | S |
| RC-TEST-07 | Flood-fill: 大規模グリッドのクラッシュ/パフォーマンス sanity | S |
| RC-TEST-08 | Drop: 空プール → null; ゼロ重みのみプール → null | S |
| RC-TEST-09 | CP 検知: 正確半径 dist²==R² 境界 | S |
| RC-TEST-10 | CP 配置: cpCount≤0, 決定性 | S |
| RC-TEST-11 | Frontline: SeededRng による再現性 | S |
| RC-TEST-12 | Speed: aggregateSkillModifiers → calculateMovementSpeed 統合 | S |
| RC-TEST-13 | Inventory: 空スロット/oob スロットガード | S |
| RC-TEST-14 BFS: 空開始 / visitor-null 終了 | S |

### P2 — あると望ましい

| rule_id | テスト |
|---|---|
| RC-TEST-15 | Coords: 複数幅での全コーナースイープ |
| RC-TEST-16 | SeededRng: nextInt(1)、非常に大きな max |
| RC-TEST-17 | CP: movement tick 統合での先着勝利テスト |

---

## 8. 既存テスト品質判定

| テスト/ファイル | 判定 | 理由 |
|---|---|---|
| types.test.ts | **維持** | 良好な DTO スモーク |
| random/SeededRng.test.ts | **強化** | 境界/安定性が不足 |
| grid/coords.test.ts | **強化** | 正常系のみ |
| grid/neighbors.test.ts | **強化** | 終了契約エッジケースが不足 |
| grid/adjacent-mine-count.test.ts | **強化** | 不変性 + oob が不足 |
| grid/flood-fill.test.ts | **強化** | コア mechanic に対して軽すぎ |
| grid/frontline.test.ts | **強化** | シナリオが少なすぎる |
| movement/facing.test.ts | **維持** | 関数サイズに見合ったカバー |
| movement/collision.test.ts | **維持** | リスク比で強力 |
| movement/speed.test.ts | **強化** | 極端な比率テストなし |
| progression/exp.test.ts | **強化** | 統合チェーンなし |
| progression/leveling.test.ts | **書き換え** | api.md と矛盾 |
| progression/skill-modifiers.test.ts | **維持** | パッケージ内最強 |
| checkpoint/detection.test.ts | **強化** | 半径境界が不足 |
| checkpoint/placement.test.ts | **強化** | 浅すぎる |
| dig/resolve-dig.test.ts | **強化** | 最重要; alive チェック + 統合なし |
| drop/roll-drop.test.ts | **書き換え** | dead-player ルールを完全に見逃している |
| reward/inventory-mutation.test.ts | **強化** | ガード不足 |

**サマリー**: 7 维持 / 9 強化 / 2 書き換え / 0 削除

---

## 9. 統合ギャップ（存在すべきがまだないもの）

| # | チェーン | なぜ重要か |
|---|---|---|
| I-1 | **dig → flood-fill → exp → drop → 隣接数リフレッシュ** | 最高価値の未テスト; 完全アクションライフサイクルを検証 |
| I-2 | **movement → CP 検知 → オーバーラップ収集** | 連続位置セマンティクス; 先着優先 |
| I-3 | **スキル修正値 → 速度計算** | 受動スタックが速度式に正しく供給されるか |
| I-4 | **スキル修正値 → CP 検知半径** | 明示的サポートがあるのに未テスト |
| I-5 | **ドロップ pickup → インベェントリ add/stack** | スロット満でもスタック可能な成功経路の検証 |

---

## 決定ログ

### 決定 #2 (schema レポートより繰返し): フロア間 EXP の永続
- **クロスパッケージ影響**: rules-core leveling + schema resetPlayersForNewFloor + サーバーフロア遷移ロジック
- **詳細は schema レポート Decision #2 を参照**

### 決定 #5: Dig alive-state 検証
- **日付**: 2026-04-05
- **カテゴリ**: 実装ギャップ
- **文脈**: api.md は送信者が Alive であることを要求; ErrorCode DIG_NOT_ALIVE が存在。resolveDig() は lifeState を決してチェックしない。
- **選択肢**:
  - **A**: resolveDig() に lifeState チェックを追加。呼び出し側だけのゲキープリングでは不十分 — 防御の多重化。
  - **B**: 現状維持; サーバー CommandHandler が責任を担う。resolveDig() は純粋関数のまま。
- **人間の判断**: *(待定)*
- **適用先**: RC-TEST-01, サーバーコマンドハンドラ設計

### 決定 #6: Drop deadPlayerExists ルール
- **日付**: 2026-04-05
- **カテゴリ**: 実装ギャップ
- **文脈**: api.md は死亡プレイヤーがリスポーン短縮ドロップ率を増加すると記述。rollGroundDrop() は deadPlayerExists パラメータを受け取るが完全に無視。
- **選択肢**:
  - **A**: rollGroundDrop() でルールを実装。コアエコノミックメカニック。
  - **B): Phase B (TDD) へ意図的に延期。現在の動作が不完全であることを文書化。
  - **C**: 使用されないならパラメータを署名から削除。
- **人間の判断**: *(待定)*
- **適用先**: RC-TEST-05, roll-drop 書き換え、エコノミーバランス
