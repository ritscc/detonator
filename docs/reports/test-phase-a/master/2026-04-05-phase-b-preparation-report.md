# Phase A → Phase B 準備レポート: クロスリファレンス監査

**日付**: 2026-04-05
**対象ブランチ**: master
**監査範囲**: Phase A 全変更 (4ファイル) × 実装計画 43タスク × API仕様 15セクション

---

## 1. Phase A 変更サマリ

| # | ファイル | 変更内容 | 影響範囲 |
|---|---------|---------|---------|
| A1 | `packages/schema/src/utils/reset.ts` | `resetPlayersForNewFloor()` から `exp = defaults.exp` を削除（累積EXPモデル） | フロア遷移、レベリング、スコアリング |
| A2 | `packages/schema/src/utils/reset.ts` | `clearAllErosionWarnings()` にオプショナル `erosionState?` パラメータを追加 | 侵食システム、フロアクリア処理 |
| A3 | `packages/rules-core/src/dig/resolve-dig.ts` | `PlayerLifeState.Alive` チェックを追加（`ErrorCode.DigNotAlive`） | 掘削コマンド、サーバー側ハンドラ |
| A4 | `packages/rules-core/src/drop/roll-drop.ts` | `deadPlayerExists` パラメータを `void` で無視 + `TODO(Phase-B)` コメント | ドロップシステム |
| A5 | `packages/config/data/items.json` | evacuation description をスポーン選択アルゴリズムに更新 | アイテム表示テキストのみ |

---

## 2. 監査結果

### 2.1 Concern A: EXP 累積モデル × Tasks 13 / 20 / 23 / 32

#### 変更内容

`resetPlayersForNewFloor()` は `exp` と `level` をリセットしなくなった（`reset.ts` L33-42）。テスト（`schema-utils.test.ts` L172-199）は `player.exp = 900`, `player.level = 8` がフロア遷移後も保持されることを検証済み。

#### 影響を受けるタスク

**Task 13 — `buildFloorClearTransition` (L1098)**

> 「全CP→タイマー停止→地雷原消滅→保留キャンセル→全員復活→初期位置」

- 🟢 **問題なし** — `buildFloorClearTransition` は rules-core の純関数で、`canceledTimerKinds` と `revivedPlayers` のプランを返すだけ。EXP/level のリセットロジックは含まない。schema 側の `resetPlayersForNewFloor()` が呼ばれる箇所で EXP が保持されるため、矛盾なし。

**根拠**:
- api.md L1521-1522: 「持ち越し: スキル、アイテム」 — EXP は持ち越しリストに明示されていないが、api.md L2567 で「EXP はフロア遷移時にリセットされない（累積モデル）」と明記。
- `leveling.test.ts` L9-11 のドキュメントコメント: "EXP is cumulative across floor transitions (Decision #2, 2026-04-05)" — 設計決定として記録済み。
- `leveling.test.ts` L84-120: フロア遷移後の累積モデルを直接テスト（L84 "carries over remaining exp after floor transition (cumulative model)"、L103 "handles multi-level carry across floor boundary"）。

**Task 20 — `createMidGamePlayer` (L1629)**

> 「Lv1 / item なし / skill なし 初期化」

- 🟡 **注意** — 途中参加プレイヤーは `Lv1 / exp = 0` で開始される（L1629, L1670）。累積EXPモデルでは、途中参加者と既存プレイヤーの間に大きなレベル差が生じる可能性がある。これは**仕様通り**だが、Task 20 の受け入れ基準（L1676）は「JoinService.createMidGamePlayer が Lv1 / 空 inventory / 空 skill stacks を返す」のみで、途中参加者のEXP不利に関するバランスチェックは含まれていない。

**影響**: 実装上の矛盾ではなく**設計レベルの考慮事項**。Phase B 以降のバランス調整で対応可能。

**Task 23 — `ExpService` (L1860)**

> 「EXP 加算 (dig / detonate combo)、閾値判定、`level_up` event 送信」

- 🟢 **問題なし** — `ExpService` は `currentExp` に `gainedExp` を加算し、`resolveLevelProgression` を呼ぶ。累積モデルでは `currentExp` がフロア間で引き継がれるため、`resolveLevelProgression` の入力が大きくなるだけ。`exp.test.ts` と `leveling.test.ts` の両方が累積値での動作を検証済み。

**Task 32 — `FloorTransitionService` (L2294-2330)**

> 「runFloorClearTransition (API 指定順序)」

- 🟡 **注意** — `FloorTransitionService` は `resetPlayersForNewFloor()` を呼ぶ必要がある。Phase A の変更により、この関数は EXP/level をリセットしない。Task 32 の受け入れ基準（L2311）は「floor clear が API 指定順序で進行する」のみで、EXP 保持の検証テストが明示されていない。

**推奨**: Task 32 の TDD テストに「**フロア遷移後に全プレイヤーの EXP/level が保持されることを検証**」を追加する。

---

### 2.2 Concern B: Dig Alive Check × Task 21

#### 変更内容

`resolveDig()` の先頭に `input.actor.lifeState !== PlayerLifeState.Alive` チェックを追加（`resolve-dig.ts` L34-36）。Ghost と Disconnected の両方を `ErrorCode.DigNotAlive` で拒否。テスト（`resolve-dig.test.ts` L97-152）で Ghost/Disconnected/Alive の3パターンを検証済み。

#### 影響を受けるタスク

**Task 20 — `commandGuards.ts` (L1632)**

> 「phase / alive / slot / range / finite number 共通検証」

- 🟡 **注意（重複チェック）** — `commandGuards` が `alive` ガードを実施する場合、`resolveDig` 内の alive チェックと**二重検証**になる。二重検証自体は安全だが、エラーコードの不一致リスクがある。

**詳細分析**:
- `commandGuards` は汎用ガードで `phase / alive` を一括チェック（L1632）。ここで alive でないプレイヤーの dig を拒否した場合、`resolveDig` まで到達しない。
- `resolveDig` の alive チェック（L34-36）は **defense-in-depth** として機能。rules-core は server に依存しない純関数なので、独自のバリデーションを持つのは設計的に正しい。
- **リスク**: `commandGuards` が独自の ErrorCode（例: `CommandRejectedNotAlive`）を返し、`resolveDig` が `ErrorCode.DigNotAlive` を返す場合、クライアント側のエラーハンドリングが 2 種の ErrorCode を処理する必要がある。

**推奨**: Task 20 実装時に `commandGuards` の alive ガードと `resolveDig` の alive チェックの ErrorCode を統一するか、`commandGuards` が先にフィルタする場合は `resolveDig` の alive チェックが到達不能コードにならないことをテストで確認する。

**Task 21 — `handleDig` (L1714)**

> 「handleDig → rules-core resolveDig 接続」

- 🟢 **問題なし** — `handleDig` は `resolveDig` の結果を受け取り、`kind: "invalid"` の場合はエラーを返す。Phase A で追加された alive チェックは `resolveDig` の内部で処理されるため、`handleDig` のインターフェースに変更なし。`resolveDig` が返す `kind: "invalid"` + `errorCode: DigNotAlive` は既存の error handling パスで自然に処理される。

---

### 2.3 Concern C: `clearAllErosionWarnings` のシグネチャ変更 × Task 28

#### 変更内容

`clearAllErosionWarnings(grid: GridState, erosionState?: ErosionState)` — 第2引数が追加された（`reset.ts` L15）。オプショナルなので後方互換性あり。テスト（`schema-utils.test.ts` L126-140, L142-170）で `erosionState` ありなし両方を検証済み。

#### 影響を受けるタスク

**Task 28 — `ErosionService` (L2108-2153)**

> 「floor clear flush」

- 🟢 **問題なし** — `ErosionService` は `clearAllErosionWarnings` を呼ぶ際に `ErosionState` を渡すことが期待される。Phase A の変更はオプショナルパラメータの追加なので、既存の呼び出し元（`erosionState` なし）は壊れない。ただし、`ErosionService` が `ErosionState` を保持している場合は渡すことで `warningCellKeys` の一括クリアが可能になる。

**推奨**: Task 28 の `floor clear flush` テストで、`clearAllErosionWarnings(grid, erosionState)` の 2引数呼び出しが `warningCellKeys` を空にすることを検証する。これにより、警告状態とセル状態の一貫性が保証される。

**Task 32 — `FloorTransitionService` (L2297)**

> 「地雷原消滅」ステップで grid をリセットする際

- 🟢 **問題なし** — `FloorTransitionService` は API 指定順序の「地雷原消滅」ステップで `clearAllErosionWarnings` を呼ぶ可能性がある。オプショナルパラメータなので、`erosionState` を渡さなくても動作する。ただし、`ErosionService` が `FloorTransitionService` に `erosionState` 参照を提供できれば、より完全なクリーンアップが可能。

---

### 2.4 Concern D: `deadPlayerExists` パラメータ × Task 23

#### 変更内容

`rollGroundDrop` は `deadPlayerExists` パラメータを受け取るが、`void input.deadPlayerExists` で無視する（`roll-drop.ts` L54-59）。テスト（`roll-drop.test.ts` L163-190）で `deadPlayerExists: true` と `false` が同じ結果を返すことを検証済み。

#### 影響を受けるタスク

**Task 23 — `DropService` (L1859)**

> 「ground item lifecycle (dig drop / discard drop / expiry / pickup / explosion destruction / erosion destruction)」

- 🟢 **問題なし** — `DropService` は `rollGroundDrop` を呼ぶ際に `deadPlayerExists` を渡す必要がある。現時点では `void` で無視されるが、インターフェースとして存在するため、`DropService` は「死亡プレイヤーが存在するか」の情報を渡す実装が必要。これは Phase B での経済設計（respawn.shortenDropWeightRatioWhenDeadExists）に備えた設計。

**根拠**:
- api.md L2695-2697: 「現時点では `deadPlayerExists` は使用されない（Phase B で経済設計と合わせて実装予定）」
- `leveling.test.ts` の `createConfig()` L185: `shortenDropWeightRatioWhenDeadExists: 0.9` — config には既に値が定義済み。

**Task 31 — `DeathService` (間接影響)**

- 🟢 **問題なし** — `DeathService` は死亡イベントを管理するが、`deadPlayerExists` フラグの更新は `DropService` の責務。Phase A では `deadPlayerExists` が無視されるため、`DeathService` → `DropService` の連携は Phase B まで不要。

---

### 2.5 Concern E: API 仕様セクションの整合性

Phase A で api.md に 15 のフォーマル仕様セクションが追加された:

| # | セクション | 対応タスク |
|---|-----------|----------|
| 1 | § 速度合成 | Task 10 (完了済み) |
| 2 | § スキルモディファイア集約 | Task 10 (完了済み) |
| 3 | § EXP 計算 | Task 10 (完了済み) |
| 4 | § レベルアップ判定 | Task 10 (完了済み) |
| 5 | § フラッドフィル | Task 10 (完了済み) |
| 6 | § 8近傍・4近傍 | Task 10 (完了済み) |
| 7 | § AABB 衝突判定 | Task 10 (完了済み) |
| 8 | § ドロップ抽選 | Task 10 (完了済み) |
| 9 | § 向き解決 | Task 10 (完了済み) |
| 10 | § 前線抽出 | Task 10 (完了済み) |
| 11 | § インベントリ操作 | Task 10 (完了済み) |
| 12 | § 掘削解決 (resolve-dig) | (Phase A 追加) |
| 13 | § チェックポイント検知 | (既存参照) |
| 14 | § 侵食サイクル | (既存参照) |
| 15 | § フロア遷移順序 | (既存参照) |

#### 影響を受けるタスク

**Tasks 10-14 — rules-core 実装 (Wave 5-7)**

- 🟢 **問題なし** — Phase A で追加された仕様セクションは、これらのタスクが参照する api.md の内容と完全に一致する。仕様が**正式化**されただけで、内容自体は変更されていない。

**Task 21 — `handleDig` (L1714)**

- 🟢 **問題なし** — api.md に追加された `§ 掘削解決` セクションは、Phase A の `resolveDig` 変更（alive チェック追加）を含む完全な仕様。Task 21 の `handleDig → rules-core resolveDig 接続` は、この正式仕様に従えばよい。

**Tasks 23-43 — サーバー/クライアント実装**

- 🟢 **問題なし** — api.md のフォーマルセクション追加は、各タスクの References に記載された api.md 参照をより正確にする。セクション名が明示されたことで、「api.md §フロア遷移」のような曖昧な参照が `§ フロア遷移順序` として特定可能になった。

---

### 2.6 テスト書き換えの影響確認

Phase A で 12 のテストファイルが書き換えられた。これらが実装計画の受け入れ基準に影響を与えるか確認する。

| テストファイル | 関連タスク | 影響 |
|-------------|----------|------|
| `speed.test.ts` | Task 10 (完了) | 🟢 なし — 完了済みタスク |
| `exp.test.ts` | Task 10 (完了), Task 23 | 🟢 なし — `calculateDigExp`/`calculateDetonateComboExp` のインターフェース不変 |
| `leveling.test.ts` | Task 10 (完了), Task 23, 32 | 🟡 注意 — 累積モデルのテストが追加。Task 23/32 はこれに準拠する必要あり |
| `collision.test.ts` | Task 10 (完了) | 🟢 なし — 完了済みタスク |
| `neighbors.test.ts` | Task 10 (完了) | 🟢 なし — 完了済みタスク |
| `flood-fill.test.ts` | Task 10 (完了) | 🟢 なし — 完了済みタスク |
| `schema-utils.test.ts` | Task 13, 28, 32 | 🟡 注意 — `resetPlayersForNewFloor` と `clearAllErosionWarnings` のテストが更新済み。後続タスクはこのテスト仕様に従う必要あり |
| `roll-drop.test.ts` | Task 23 | 🟢 なし — `deadPlayerExists` 無視のテストが追加されたが、インターフェース不変 |
| `detection.test.ts` | Task 13 | 🟢 なし — checkpoint detection のインターフェース不変 |
| `facing.test.ts` | Task 10 (完了) | 🟢 なし — 完了済みタスク |
| `frontline.test.ts` | Task 12, 28 | 🟢 なし — frontline のインターフェース不変 |
| `inventory-mutation.test.ts` | Task 23 | 🟢 なし — inventory mutation のインターフェース不変 |
| `resolve-dig.test.ts` | Task 21 | 🟢 なし — alive チェックのテスト追加。handleDig 接続はこの仕様に従えばよい |

---

## 3. 問題一覧（重要度順）

### 🟡 WARNING-1: Task 32 の受け入れ基準に EXP 保持テストが欠如

**対象**: Task 32 — `FloorTransitionService`
**Phase A 変更**: `resetPlayersForNewFloor()` が EXP/level をリセットしない
**問題**: Task 32 の TDD テスト (L2310-2314) に「フロア遷移後の EXP/level 保持」の検証が含まれていない
**リスク**: FloorTransitionService の実装者が EXP リセット前提のコードを書く可能性（低確率だが、明示テストがないと見逃す）
**推奨アクション**: Task 32 の TDD テストに以下を追加

```
- [ ] Test: フロア遷移後に全プレイヤーの exp/level が保持される（累積EXPモデル）
```

### 🟡 WARNING-2: Task 20 の commandGuards alive チェックと resolveDig の alive チェックの重複

**対象**: Task 20 — `commandGuards.ts` / Task 21 — `handleDig`
**Phase A 変更**: `resolveDig` に `PlayerLifeState.Alive` チェックを追加
**問題**: `commandGuards` が汎用 alive ガードを実施する場合、dig コマンドで二重チェックが発生。ErrorCode の不一致リスク。
**リスク**: クライアントが 2 種のエラーコードを処理する必要が生じる可能性
**推奨アクション**: Task 20 実装時に以下のいずれかを選択

1. `commandGuards` の alive ガードを dig に適用し、`resolveDig` の alive チェックは defense-in-depth として残す（ErrorCode 統一を確認）
2. dig コマンドの alive チェックを `resolveDig` に一任し、`commandGuards` からは除外する

### 🟡 WARNING-3: Task 28 の floor clear flush テストに erosionState 引数の検証が欠如

**対象**: Task 28 — `ErosionService`
**Phase A 変更**: `clearAllErosionWarnings()` にオプショナル `erosionState?` パラメータを追加
**問題**: Task 28 の TDD テスト (L2134-2138) に `clearAllErosionWarnings(grid, erosionState)` の 2引数呼び出しの検証が含まれていない
**リスク**: `ErosionService` が `erosionState` なしで呼び出し、`warningCellKeys` が残留する
**推奨アクション**: Task 28 の TDD テストに以下を追加

```
- [ ] Test: floor clear flush で clearAllErosionWarnings が erosionState を渡し warningCellKeys が空になる
```

### ✅ WARNING-4 (RESOLVED): api.md L1521-1522 の持ち越しリストに EXP が未記載

**対象**: api.md §フロア遷移
**Phase A 変更**: 累積EXPモデル採用
**問題**: ~~api.md L1521 は「持ち越し: スキル、アイテム」と記載。EXP/level は持ち越し対象だが、このリストに含まれていない~~
**✅ 修正済み (2026-04-05)**: api.md L1521 を「持ち越し: **スキル、アイテム、EXP/レベル**（累積モデル）」に更新済み。

---

## 4. 問題なし確認（Clean Areas）

以下の領域は Phase A 変更と実装計画の間に矛盾がないことを確認した:

| 領域 | 確認結果 |
|------|---------|
| **Task 10-12 (完了済み rules-core)** | 🟢 Phase A テスト書き換えは完了済みタスクの成果物を更新しただけ。後続タスクへの影響なし |
| **Task 13 — checkpoint + lifecycle** | 🟢 `buildFloorClearTransition` は EXP 操作を行わない純関数。累積EXPモデルと矛盾なし |
| **Task 14 — reward + scoring** | 🟢 スコア計算は `floorExp × timeBonus` で、累積 EXP 自体ではなくフロア内獲得 EXP を使用 |
| **Task 21 — handleDig → resolveDig** | 🟢 インターフェース不変。alive チェック結果は `kind: "invalid"` で自然に処理される |
| **Task 23 — DropService** | 🟢 `rollGroundDrop` のインターフェース不変。`deadPlayerExists` は渡すが無視される |
| **Task 27 — DetonateService** | 🟢 Phase A 変更の影響なし |
| **Task 28 — ErosionService** | 🟢 `clearAllErosionWarnings` は後方互換。オプショナルパラメータ追加のみ |
| **Tasks 15-18 — Server インフラ** | 🟢 Phase A 変更はゲームロジック層。サーバーインフラに影響なし |
| **Tasks 19, 22, 25-26 — Client** | 🟢 Phase A 変更はサーバー/rules-core 層。クライアント描画・入力に影響なし |
| **Tasks 29-30, 34-43 — 後続 Client/Server** | 🟢 Phase A 変更の直接的影響なし |
| **依存関係グラフ（Wave 構造）** | 🟢 Phase A はタスク依存関係を変更していない。全 Wave の並列実行可能性は維持 |
| **items.json description 更新** | 🟢 表示テキストのみの変更。ゲームロジックに影響なし |

---

## 5. クリティカルパス検証

Phase A の変更が実装計画のクリティカルパスに与える影響:

```
Task 1-9 (完了) → Task 10-12 (完了) → Task 13-14 (Wave 7) → Task 15-18 (Wave 8-9)
→ Task 19-22 (Wave 10) → Task 23-26 (Wave 11) → Task 27-30 (Wave 12)
→ Task 31-35 (Wave 13) → Task 36-40 (Wave 14) → Task 41-43 (Wave 15)
```

**結論**: 🟢 クリティカルパスは Phase A 変更により影響を受けない。全タスクの依存関係、ブロック関係、並列グループは維持されている。

---

## 6. 総括

| 重要度 | 件数 | 内容 |
|--------|------|------|
| 🔴 BLOCKER | 0 | なし |
| 🟡 WARNING | 3 | テスト基準の補強が必要 (WARNING-1,2,3)。WARNING-4 は ✅ 修正済み |
| 🟢 INFO (問題なし) | 12 | 全クリーン領域で矛盾なし確認済み |

**Phase A の変更は実装計画 43 タスクを破壊しない。**

3 件の WARNING はいずれも「テスト基準の明示化」の問題であり、実装計画への反映を完了済み。WARNING-4（api.md 持ち越しリスト）は修正済み。

---

*生成元*: Phase A クロスリファレンス監査（2026-04-05）
*参照ファイル*: `reset.ts`, `resolve-dig.ts`, `roll-drop.ts`, `items.json`, `detonator-implementation.md` (2886行), `api.md` (2814行), テストファイル12件
