# Phase B テスト設計ガイド

> **作成日**: 2026-04-05
> **目的**: Phase B (Tasks 10-43) のテストを設計・実装するエージェントが参照するマスタードキュメント
> **前提**: Phase A 完了 (188 tests, 4 packages, api.md 15セクション追加)

---

## 0. Oracle 方針 (確定事項)

> **2026-04-05 ユーザー判断記録**

### Decision #7: 絶対オラクルの範囲確定
- **Date**: 2026-04-05
- **Category**: scope / oracle-policy
- **Options**:
  - A: api.md + detonator.md + be-dev-plan + fe-dev-plan を全てオラクルとして使用 → 柔軟性が高いが、矛盾リスクあり
  - B: **api.md + detonator.md のみを絶対オラクルとし、他は参考に留める** → 厳格だが一貫性が保証される
- **Human Decision**: **B**
- **適用先**: 全 Phase B テスト + 全 Phase B 実装

**詳細ルール**:

| ドキュメント | 使用目的 | テスト assertion に使えるか？ |
|---|---|---|
| `docs/plans/api.md` | **絶対オラクル** | ✅ YES — 全 assertion の唯一の権威 |
| `docs/plans/detonator.md` | **絶対オラクル** | ✅ YES — ゲーム全体設計の権威 |
| `.sisyphus/plans/detonator-implementation.md` | 開発順序・機能方針の参照 | ❌ NO — 仮コードは例示のみ。開発順序のみ参照 |
| `docs/plans/shared-dev-plan.md` | パッケージ構造・インターフェース形状の参照 | ❌ NO — シグネチャ確認のみ。アルゴリズム仕様は api.md へ昇格済み |
| `docs/plans/back/be-dev-plan.md` | サーバーアーキテクチャの理解補助 | ❌ NO — オーケストレーション理解のみ。キュー優先順等は api.md へ必要 |
| `docs/plans/front/fe-dev-plan.md` | クライアントアーキテクチャの理解補助 | ❌ NO — UI レイアウト理解のみ。data-testid 等は api.md へ必要 |

**実装時のドキュメント階層**:
```
┌─────────────────────────────────┐
│  api.md + detonator.md          │ ← テスト = ここから only
│  (絶対仕様)                    │
├─────────────────────────────────┤
│  implementation.md               │ ← 開発順序・機能一覧 (仮コードは例)
│  shared-dev / be-dev / fe-dev   │ ← アーキテクチャ理解補助
├─────────────────────────────────┤
│  テスト (spec-driven)            │ ← api.md から導出
├─────────────────────────────────┤
│  実装                            │ ← api.md + テスト を参照
└─────────────────────────────────┘
```

### Decision #8: S1-S9 仕様追加の実行方法
- **Date**: 2026-04-05
- **Category**: execution
- **Options**:
  - A: 手動で api.md に 9 セクションを書く
  - B: エージェント委託で api.md に 9 セクションを追加
- **Human Decision**: **B**

### Decision #9: プラン修正のタイミング
- **Date**: 2026-04-05
- **Category**: execution
- **Options**:
  - A: テスト実装と並行でプラン修正
  - B: 今すぐ反映
- **Human Decision**: **B**

---

## 目次

1. [実行サマリー](#1-実行サマリー)
2. [プラン構造分析](#2-プラン構造分析)
3. [仕様カバレッジ監査 (api.md)](#3-仕様カバレッジ監査-apimd)
4. [Phase A 教訓 — アンチパターンとベストプラクティス](#4-phase-a-教訓)
5. [統合クラスタテスト戦略](#5-統合クラスタテスト戦略)
6. [Task 別テストオラクル一覧](#6-task-別テストオラクル一覧)
7. [api.md に必要な仕様追加リスト](#7-apimd-に必要な仕様追加リスト)
8. [プラン修正勧告](#8-プラン修正勧告)
9. [テスト設計チェックリスト](#9-テスト設計チェックリスト)

---

## 1. 実行サマリー

### 結論

**Phase B テスト実装を開始する前に、以下の 3 つの準備作業が必須:**

| 優先度 | 作業 | 影響範囲 |
|---|---|---|
| 🔴 **BLOCKER** | api.md への 11 セクション追加 (T10-T14 + server/client ギャップ) | T10-T14 は現在 api.md 単独で TDD 不可能 |
| 🟡 **WARNING** | プランの Critical Path 修正 + Wave 境界調整 | テスト順序と統合計画が不正確 |
| 🟡 **WARNING** | 依存関係の欠落を 7 箇所補完 | T21/T27/T38/T39 でクロスタスクテストが必要 |

### 数値サマリー

| 指標 | 値 |
|---|---|
| 分析対象 Task | 34 (T10-T43) |
| BLOCKER 問題 | 4 (Critical Path 不正, Wave 15 矛盾, T10-T14 仕様不足, TEST_MODE 未定義) |
| WARNING 問題 | 12 (Wave 過剰直列化×6, 依存欠落×4, メタデータ不整合×2) |
| api.md PRIMARY な Task | 13 (T21,T23,T24,T28-T33,T36,T37,T29) |
| be-dev-plan PRIMARY な Task | 6 (T16,T18,T20,T27,T38,T42) |
| fe-dev-plan PRIMARY な Task | 9 (T19,T22,T25,T26,T30,T34,T35,T39-T41) |
| 仕様ギップ (MISSING) な Task | 2 (T17 CI, T43 E2E selectors) |
| 統合クラスタ数 | 4 (Server Gameplay / Lifecycle / Client Interaction / Shared Contract) |

---

## 2. プラン構造分析

### 2.1 依存関係グラフ検証結果

**✅ 循環なし**: 全 Task の依存は低番号→高番号のみ（DAG 確認）

**❌ Critical Path 不正**: プランに記載の Critical Path は `Blocked By` フィールドと矛盾:

```
[計上の CP] 1→2→3→7→8→10→13→14→16→18→21→23→24→27→32→36→37→38→40→F1-F4
[実際の CP] 2→3→5→7→8→10→13→15→18→20→23→24→31→32→42 (server path)
             2→3→5→7→8→10→13→19→22→30→39→40→43 (client path)
```

**無効エッジ** (計上 CP にあるが Blocked By に存在しない):
- `1→2` — T1 はモノレポセットアップ。T2 の blocker だが CP 上では T1 自体が省略されている
- `13→14` — T14 は T10-12 にも依存。T13→T14 の直接エッジは存在するが、CP は T13 を経由
- `24→27` — T27 は T21+T22 にブロック。T24 は blocker ではない
- `27→32` — T32 は T24+T28+T31 にブロック。T27 は blocker ではない
- `32→36` — T36 は T23+T24+T27+T28 にブロック。T32 は blocker ではない
- `36→37` — T37 は T33 のみにブロック
- `37→38` — T38 は T20+T31 にブロック
- `38→40` — T40 は T19+T39 にブロック

### 2.2 Wave 境界問題

| Wave | 問題 | 詳細 | 対処 |
|---|---|---|---|
| **Wave 9** | ⚠️ 過剰直列化 | T19 は T1-14 のみに依存 → Wave 8 から開始可能 | T19 を Wave 8 に移動可能 |
| **Wave 12** | ⚠️ 過剰直列化 | T27/T28/T30 は Wave 10 出力のみに依存 → Wave 11 から開始可能 | 並列化機会 |
| **Wave 13** | ⚠️ 過剰直列化 | T34/T35 は T22+25 のみ → Wave 12 から開始可能 | 並列化機会 |
| **Wave 14** | ⚠️ 過剰直列化 | T36/T39 は Wave 13 から開始可能。compact note に T40 を "with 36-40" と誤記 | メタデータ修正要 |
| **Wave 15** | 🔴 **矛盾** | T43 は全 client task (T40/T41 含む) に依存しているのに、T40/T41 と**並列**スケジュール | **T43 を単独最後タスクにするか、T40/T41 の依存を再定義** |
| **Wave 15** | ⚠️ 過剰直列化 | T41 は T19+35 のみ → Wave 14 から開始可能 | Audio を前倒し可能 |

### 2.3 欠落依存関係 (7 箇所)

| # | Task | 欠落している依存先 | なぜ問題か | 推奨修正 |
|---|---|---|---|---|
| D1 | T21 | **T23** (DropService), **T27** (UnmanagedExplosionService) | T21 の dig handler は drop 生成 + unmanaged trigger を行うが、これらの service が未実装 | T21 の Acceptance Criteria に「stub/mock を使用」注記を追加、または T21 を T23/T27 後に移動 |
| D2 | T27 | **T23** (DropService) | 爆発時の ground item 破壊/cancel hook は DropService と連携 | T27 の Must NOT Do に「DropService fixture 必須」を明記 |
| D3 | T38 | **T32** (FloorTransitionService), **T33** (RewardService) | Full flow テストに floor transition + reward replay が必要 | T38 の Blocked By に T32, T33 を追加 |
| D4 | T31 | T24 の記述形式が compact inline のみ | Metadata 整合性のため正式フィールドへ昇格 | 形式統一 |
| D5 | T37 | **T20** (handleDiscardItem), **T23** (InventoryService) | discard は command handler + inventory 双方と連携 | T37 の Blocked By に T20, T23 を追加 |
| D6 | T39 | **T29** (targetingController) | TargetingOverlay は inputMapper/targetingController の出力に依存 | T39 の Blocked By に T29 を追加 |
| D7 | T42 | 「all server tasks」という曖昧な表現 | 具体的な blocker リストに置換 | T16,T18,T20,T21,T23,T24,T27,T28,T31,T32,T33,T36,T37,T38 と明記 |

### 2.4 タスク粒度分析

#### 大規模タスク (>8 files) — リスク: HIGH

| Task | 推定ファイル数 | リスク |
|---|---|---|
| **T16** | ~16 files | 最高リスク: EventQueue, CancellationIndex, QueueProcessor, PrivateStateStore, RoomContext... 1 コミットで多すぎる |
| **T19** | ~20 files | Phaser 初期化 + 5 scenes + connection + reconnect |
| **T22** | ~18 files | 38 event handler 骨格 + selector + private store |
| **T20** | ~12 files | 7 command handlers + JoinService + ReconnectService + guards |
| **T36** | ~13 files | 13 item effect 各ファイル + ItemEffectService |

#### 小規模タスク (<3 files) — リスク: LOW (glue/task 性質)

| Task | 特徴 |
|---|---|
| T17 | CI 設定ファイル更新のみ |
| T31 | RespawnService のみ (DeathService 補完は小規模) |
| T37 | claim/discard の接続のみ |
| T42, T43 | 統合テストのみ |

### 2.5 クロスパッケージ依存マップ

| Task | 触れるパッケージ | テスト設計リスク |
|---|---|---|
| T15 | protocol + config + schema + rules-core | **最高**: 4 パッケージ横断統合 |
| T16 | apps/server + config + rules-core | **高**: server/shared 境界 |
| T18 | apps/server + rules-core | **中高**: Room bootstrap / floor lifecycle seam |
| T19 | apps/client + protocol + schema + config | **高**: client/shared 境界 |
| T36 | apps/server + rules-core | **中高**: item-effect integration |
| T43 | apps/client + apps/server + all shared | **最高**: E2E |

---

## 3. 仕様カバレッジ監査 (api.md)

### 3.1 rules-core 新機能 (Tasks 10-14)

> **総評**: api.md 単独では TDD 不可能。全 5 タスクに blocking gap あり。

#### Task 10 — Detonate (Rooted Prim-MST)

| 状態 | 内容 |
|---|---|
| ✅ EXISTS | 用語定義 (MST/Fuse)、パラメータ (Fuse=3.0s, 連鎖速度=125ms)、detonate イベントペイロード、旗/RelayPoint 除去、combo EXP 式 |
| ⚠️ PARTIAL | "Rooted Prim-MST を再計算" とあるが MST の構築アルゴリズム未定義。provisionalPath / remainingPath の意味はあるが生成規則なし |
| ❌ MISSING | **MST ノード集合** (何を頂点に含めるか)、**エッジ重み定義**、**Rooted Prim の開始点と parent 決定規則**、**同コスト tie-break 以外の比較順序**、**親→複数子への連鎖順序**、**remainingPath 再構成ルール**、**fuse 中の MST 変更時の縮退期待値** |

**推奨**: `§ Detonate MST 詳細` セクション新規追加 — グラフモデル、tie-break レイヤー、path/event 順序、per-step mutation ルール

#### Task 11 — Unmanaged Explosion (BFS Chain)

| 状態 | 内容 |
|---|---|
| ✅ EXISTS | DangerousMine での起動条件、unmanaged_explosion_triggered/chain_step/resolved イベント、BFS + 125ms 間隔、地上アイテム破壊 |
| ⚠️ PARTIAL | blast/wasteland 範囲概念はあるが距離定義が曖昧 |
| ❌ MISSING | **BFS 隣接定義** (4近傍/8近傍/爆風内 DangerousMine)、**初期キュー投入規則**、**enqueue 順序/tie-break**、**visited/再訪防止**、**chainDepth 増分定義**、**震源セル自身の変換順**、**1ステップ内の処理順序** (blast→death→wasteland→queue?)、**adjacentMineCount 再計算有無** |

**推奨**: `§ Unmanaged Explosion BFS 詳細` セクション新規追加 — 近傍ルール、queue アルゴリズム、radii 適用順序、mutation/death timing

#### Task 12 — Erosion (Warning + Conversion)

| 状態 | 内容 |
|---|---|
| ✅ EXISTS | Frontline 定義、基礎パラメータ (警告時間/侵食比率)、erosion_warning/applied イベント、タイマーサイクル、widthCap 概念、左右探索、SafeMine/DangerousMine 比率配置 |
| ⚠️ PARTIAL | widthCap 概念はあるが **authoritative value/source が api.md 内にない**。比率配置は「式駆動」とあるが式がない |
| ❌ MISSING | **widthCap の api.md 内权威値**、**stage ごとの取得方法**、**SafeMine/DangerousMine 配分丸め規則**、**RNG 消費順**、**侵食力・比率の具体式** |

**二次オラクル**: `shared-dev-plan.md:711-712` (erosionFrontlineWidthCap 定义), `:1179-1182` (stage 例: widthCap=4)

**推奨**: api.md に widthCap 权威値と変換比率の具体式を追加

#### Task 13 — Lifecycle (Spawn/Respawn/Floor Transition)

| 状態 | 内容 |
|---|---|
| ✅ EXISTS | フロア生成/初期配置、途中参加ルール、クリア遷移ルール、player_respawned/floor_cleared/rest_phase_started/next_floor_started イベント、初期スポーン複数群 |
| ⚠️ PARTIAL | "複数スポーン群" はあるが割当アルゴリズムなし。"ランダム生存プレイヤー周囲" はあるが探索規則なし |
| ❌ MISSING | **spawnGroups データ形状**、**初期スポーン群選択/配員アルゴリズム**、**sessionId ↔ spawn coords 対応決定規則**、**respawn anchor 選択方法**、**"周囲"探索半径/近傍順/tie-break**、**安全マス再探索順**、**fallback wasteland 条件の厳密定義**、**全員復活後の初期位置復元元** |

**二次オラクル**: `shared-dev-plan.md:1175-1189` (spawnGroups 実例), `:2011-2064` (lifecycle 関数シグネチャ), `:2135-2149` (lifecycle 意図)

**推奨**: `§ Spawn Assignment`, `§ Respawn Placement`, `§ Floor Transition Plan` の 3 セクション追加

#### Task 14 — Reward (Offer + Apply + Scoring)

| 状態 | 内容 |
|---|---|
| ✅ EXISTS | claim_reward コマンド、level_up/reward_offer イベント、inventory full vs stack-add、private inventory ルール、RewardOption shapes、inventory mutation ルール、score_updated イベント |
| ⚠️ PARTIAL | exclusion (full inventory/stack cap) はあるが offer 生成アルゴリズムなし。score formula は部分的 |
| ❌ MISSING | **reward offer 生成アルゴリズム**、**option count**、**reward pool/weights/floor-level gating**、**重複 option ポリシー**、**Chord uniquePerRun 除外**、**skill stackLimit / item maxStack 权威値**、**claim_reward apply semantics** (item→inventory, skill→stack)、**scoring formula の EXP basis** (floorExp? total EXP?) |

**二次オラクル**: `shared-dev-plan.md:1208-1245` (reward config/pools/filters), `:1998-2005` (calculateFloorScore), `:2069-2166` (buildRewardOffer/applyRewardSelection)

**推奨**: `§ Reward Offer Generation`, `§ Reward Apply`, `§ Floor Score` の 3 セクション追加

### 3.2 Server Tasks (T16-T38)

| Task | 一次オラクル | api.md 専用セクション？ | テストライターのギップ |
|---|---|---|---|
| T16 foundation | **be-dev-plan** | Partial | QueueProcessor priority, runtime/private split, CancellationIndex 構造が api.md にない |
| T17 CI/CD | **MISSING** | ❌ | oracle は tech-stack.md / task prose のみ |
| T18 LobbyRoom/DetonatorRoom | **be-dev-plan** | Partial | Floor bootstrap 分解 + death-entry wiring は BE plan。**TEST_MODE hook は impl-plan のみ** |
| T20 Join/Reconnect/Commands | **be-dev-plan** | Yes/Partial | Replay rules, command guard ownership, registration completeness は BE plan |
| T21 Move/Dig/Flag gameplay | **api.md** | ✅ Yes | "schema patch only" vs event timing の詳細のみ BE plan 要 |
| T23 Inventory/Drop/EXP | **api.md** | ✅ Yes | 加重 drop table / 未解決数値は config 由来 |
| T24 DeathService+CP | **api.md** | ✅ Yes | CancellationIndex cleanup は BE plan のみ明示 |
| T27 DetonateService | **be-dev-plan** | Yes (外部契約) | CancellationIndex keys, cancel hooks, due-batch orchestration は BE plan |
| T28 ErosionService | **api.md** | ✅ Yes | Pause/defer と他 queue との競合は BE plan 要 |
| T29 InputMapper | **api.md** | ✅ Yes | dead-zone policy, targeting mode は FE plan 要 |
| T31 RespawnService | **api.md** | ✅ Yes | Effect-expiry cleanup on death は BE plan で具現化 |
| T32 FloorTransition | **api.md** | ✅ Yes | Carry-over/reset matrix は BE plan 要 |
| T33 Reward/Skill | **api.md** | ✅ Yes | Chord behavior は未指定。reward weighting/exclusion edge は config/plan |
| T36 13 item effects | **api.md** | ✅ Yes | Duration 数値は config bind。nine_lives 所有権は plan-only |
| T37 Claim/Discard | **api.md** | ✅ Yes | Orchestration through services のみ |
| T38 Mid-game join+Reconnect | **be-dev-plan** | Partial | reward_offer replay, no inventory_updated on mid-game join, runtime init |

### 3.3 Client Tasks (T19-T43)

| Task | 一次オラクル | api.md 専用セクション？ | テストライターのギップ |
|---|---|---|---|
| T19 Client foundation | **fe-dev-plan** | Partial | Scene/runtime architecture は FE plan のみ |
| T22 Schema binding | **fe-dev-plan** | Partial | Selector boundaries, 38-handler ownership は FE plan |
| T25 Board rendering | **fe-dev-plan** | ❌ No | Colors, skins, draw-order, camera offset は FE のみ |
| T26 PlayerLayer+Input | **fe-dev-plan** | Partial | Sprite states, control layout は FE のみ |
| T30 HUD | **fe-dev-plan** | Partial | HUD binding rules は FE のみ。**data-testid="player-hud-panel" は impl-plan のみ** |
| T34 CpLayer+Visibility | **fe-dev-plan** | Partial | Visibility formula は api.md にあり。Layer behavior は FE plan |
| T35 FX layers | **fe-dev-plan** | Partial | Event timing は api.md。Visual meaning は FE のみ |
| T39 Reward/Targeting/Toast | **fe-dev-plan** | Partial | Reward contract は api.md。UI behavior/toast taxonomy は FE のみ |
| T40 Scenes (Lobby/Rest/GameOver) | **fe-dev-plan** | Partial | Scene triggers は api.md。Scene contents は FE のみ。**data-testid 属性は impl-plan のみ** |
| T41 Audio | **fe-dev-plan** | ❌ No | Event→SFX, scene/floor→BGM mapping は FE のみ |
| T43 Integration+E2E | **MISSING** | Partial | Unit test targets はカバー。**Playwright selectors と TEST_MODE 依存は impl-plan のみ** |

### 3.4 仕様ギップ要約 (MISSING = 安定仕様なし)

| ギップ | 影響 Task | 所在 | 推奨対処 |
|---|---|---|---|
| TEST_MODE auto game_over hook | T18 | impl-plan prose のみ | api.md §Testing または be-dev-plan §Testing に正式記述 |
| data-testid="player-hud-panel" | T30, T43 | impl-plan prose のみ | fe-dev-plan に E2E testing セクションとして追加 |
| data-testid="display-name-input" | T40, T43 | impl-plan prose のみ | 同上 |
| data-testid="start-button" | T40, T43 | impl-plan prose のみ | 同上 |
| data-testid="game-over-summary" | T40, T43 | impl-plan prose のみ | 同上 |
| Chord skill 効果詳細 | T33 | 未定義 | api.md または skills.json に効果定義を追加 |
| CI pipeline 仕様 | T17 | tech-stack.md のみ | be-dev-plan に CI section 追加 or 独立 docs |

---

## 4. Phase A 教訓

### 4.1 アンチパターン (絶対に避けること)

#### A. Mirror Test (実装鏡映テスト)
**定義**: 実装コードから expected value を導出するテスト。

**Phase A 事例**:
- `exp.test.ts` — 実装と同じ計算式をテスト内で再実装
- `leveling.test.ts` — 実装の while-loop ロジックをそのままコピー
- `collision.test.ts` — 実装の AABB 分解ロジックを mirror
- `neighbors.test.ts` — 実装の offset 配列をそのまま assert
- `schema-utils.test.ts` — 実装の reset ロジックを mirror

**回避策**:
- SUT と同じアルゴリズム形状をテスト内で再使用しない (api.md に明示された式を除く)
- 実装ソースを「ルール発見」のために読まない

**許容例外**: api.md に明示的な公式/表として書かれた計算の直接的転写 (例: `requiredExp(L) = floor(100 × 1.5^(L-1))`)

#### B. Mixed Test (混合テスト)
**定義**: 一部 assertion は spec 由来、一部は実装挙動由来。

**Phase A 事例**:
- `flood-fill.test.ts` (rewrite 前) — BFS ロジックは spec 由来だが境界値選択は実装由来
- `roll-drop.test.ts` (rewrite 前) — 成功パスは spec 由来、失敗パスは実装由来
- `facing.test.ts` (rewrite 前) — 一部 sector マッピングは spec、一部は実装の atan2 結果をそのまま使用

**症状**:
- 汎用的な test 名 (`"should work correctly"` 等)
- `describe` に spec セクション名がない
- 実装の挙動から選ばれた境界値 (spec テキストにはない)

#### C. Specless Test (仕様なしテスト)
**根因**: api.md に十分な形式仕様がない状態でテストを書く。

**ルール**: api.md 行を引用できない assertion は書いてはならない。

#### D. Happy-Path Only (正常系のみ)
**Phase A の最大の偏り**: 正常系カバレージは強いが、boundary / invalid / prohibited / invariant / integration カバレージが極めて弱かった。

**ルール**: 非自明なテストファイルは最低 1 つの boundary case + 1 つの invalid/prohibited case + 1 つの invariant check を含むこと。

#### E. Implementation-Coupled Internals (実装内部結合)
**避けるべき assertion**:
- private helper 呼び出し順序
- spec で定義されていない偶発的反復順序
- 契約で保証されていない中間状態

**順序を assert してよいケース (spec で明示的に定義されているときのみ)**:
- frontier linear scan order (api.md §最前線)
- neighbor traversal order (api.md §8近傍)
- floor transition order (api.md §フロア遷移)

#### F. Deferred TODO の完成動作としてテスト
**Phase A 事例**: `deadPlayerExists` は "Phase B TODO" と明記。

**ルール**: spec が "deferred" / "TODO" なら、現在文書化された契約をテストすること。想像上の最終挙動をテストしてはならない。

### 4.2 良いテストの特徴 (Phase A ベストプラクティス)

#### `flood-fill.test.ts` (rewite 後) の良い点
- アルゴリズム + 境界 + 不変性を網羅
- 出力だけでなく **immutability** を検証
- "DangerousMine は開放されない" を明示的に確認
- **非ゼロ境界停止** を検証
- シナリオ形状が api.md §フラッドフィル詳細 の bullet に直接対応

#### `facing.test.ts` (rewrite 後) の良い点
- `describe` 名が **正確な spec セクション** を引用
- test 名が **番号付き spec ルール/表** にマップ
- expected value は **文書化されたマッピング表** 由来 (実装の癖ではない)

#### `frontline.test.ts` (rewrite 後) の良い点
- **決定的論的 RNG stub**
- precondition を明示的にテスト
- spec で定義されているため **order と widthCap 挙動**をテスト
- **input immutability** をテスト

#### `inventory-mutation.test.ts` (rewrite 後) の良い点
- **ルール順序** をポリシー順通りにテスト
- 挙動と非変異の両方を assert
- stackable/non-stackable/maxStack/consume/discard を **独立した契約条項** として区別

### 4.3 テスト構造テンプレート (全 Phase B ファイル必須)

```ts
/**
 * 仕様ソース: docs/plans/api.md §<セクション名>
 * 関数/サービス: <関数またはサービス名>
 */
describe("docs/plans/api.md §<セクション名> / <関数またはサービス>", () => {
  describe("preconditions / invalid / prohibited", () => {
    it("<spec 条件> の場合 <文書化された error> を返す", () => {});
  });

  describe("core contract", () => {
    it("ルール 1: <spec 文>", () => {});
    it("ルール 2: <spec 文>", () => {});
  });

  describe("boundary conditions", () => {
    it("<spec からの min/max/empty/singleton/edge case>", () => {});
  });

  describe("invariants", () => {
    it("入力 state を変更しない", () => {});
    it("<文書化された不変条件> を保持する", () => {});
  });

  describe("integration chain", () => {
    it("<spec で約束されたクロスモジュール契約>", () => {});
  });
});
```

**強制規約**:
- `describe` は **spec セクション名** を含むこと
- `it` タイトルは **ルール文のように読める** こと (曖昧な behavior label でない)
- **決定的論的 double のみ**: 固定 RNG, fake clock, 明示的 fixture
- local builder は OK だが setup を簡略化するためであり、ルールの意味を隠してはならない
- 人間の判断に依存するテストは `// Decision #N: <理由>` コメントを付ける

### 4.4 Spec Derivation Checklist (assertion 書く前の必須確認)

- [ ] この assertion を正当化する **api.md の正確な行** はどこか？
- [ ] このルールは **公式/表/順序付きアルゴリズム/不変条件/error code** のどれで記述されているか？
- [ ] **契約をテスト** しているか、現在の実装形状をテストしていないか？
- [ ] 順序が必要な場合、その順序は **明示的に文書化** されているか？
- [ ] 正確な数値が必要な場合、その数値は **spec の明示的な公式/表** から来ているか？
- [ ] spec が不在または矛盾する場合、**一旦停止して decision log を更新** したか？
- [ ] ルールが人間によって決定された場合、その判断を **test 内で引用** したか？
- [ ] boundary / invalid / prohibited / invariant カバレージを適切に含めたか？
- [ ] **非自明な assertion** (実装が drift したら fail するもの) を少なくとも 1 つ含めたか？

### 4.5 Phase A の 3 つ警告を Phase B に引き継ぐ

| Warning | 根因 | Phase B で必須なテスト |
|---|---|---|
| **W1: EXP/level 保持** | 旧メンタルモデル: フロアごとリセットと思っていた | フロア遷移後の exp/level 不変テスト (Task 13 + Task 32) |
| **W2: Alive-check 重複** | commandGuards (汎用) と resolveDig (ドメイン固有) の二重チェック | 両層の error code 一貫性テスト (Task 20) |
| **W3: Erosion floor-clear flush** | grid warning クリア時に erosionState の warningCellKeys が残る | clearAllErosionWarnings(grid, erosionState) 呼び出しテスト (Task 12 + Task 28) |

### 4.6 一言ルール

> **api.md または記録された判断を引用できない assertion を書く準備ができていないなら、そのテストを書いてはならない。**

---

## 5. 統合クラスタテスト戦略

> Phase B のテストは「1 Task = 1 孤立テストスイート」では**不十分**。
> 以下の 4 クラスターを単位としてテストを設計すること。

### Cluster 1: Server Gameplay (サーバーゲームプレイ連鎖)

```
T20 → T21 → T23 → T24 → T27
```

**構成要素**:
- T20: Command guards + handler registration (入口)
- T21: MovementSystem + dig/flag gameplay (コアループ)
- T23: InventoryService + DropService + ExpService (副作用)
- T24: DeathService completion + CheckpointService (終了条件)
- T27: DetonateService + UnmanagedExplosionService (爆発システム)

**テスト戦略**:
- T20-T21: Unit test (各 handler の入出力)
- T21-T23: Integration test (dig → EXP → drop chain)
- T23-T24: Integration test (death → inventory loss → checkpoint)
- T21-T27: Integration test (dig → unmanaged explosion → death chain)
- **Cluster 最終確認**: 2P で move + dig + detonate + unmanaged + death が一貫して動く

**最大リスク**: T21 が T23/T27 の stub に依存。T21 単体では dig→unmanaged trigger のみを stub で検証。

### Cluster 2: Lifecycle (ライフサイクル)

```
T31 ← T24, T27, T28
T32 ← T24, T28, T31
T38 ← T20, T31, T32, T33
```

**構成要素**:
- T31: RespawnService + DeathService effect cleanup
- T32: FloorTransitionService + ScoreService
- T38: Mid-game join + Reconnect completion

**テスト戦略**:
- T31: Unit (respawn scheduling + effect cancellation)
- T32: Unit (floor clear sequence ordering — API 指定順の 8 ステップ)
- T38: Integration (full flow: join → dig → death → respawn → reconnect → resync)
- **Cluster 最終確認**: Floor 1→Clear→Rest→Floor 2 の完全ライフサイクル

**最大リスク**: T38 が T32 (floor transition) と T33 (reward) に依存しているが、Blocked By に記載なし (⚠️ D3)

### Cluster 3: Client Interaction (クライアント相互作用)

```
T19 → T22 → {T25,T26} → {T29,T30} → {T34,T35,T39} → T40 → T43
```

**構成要素**:
- T19: Foundation (Phaser + scenes + connection)
- T22: Schema binding + selectors + private store + 38 handlers
- T25/T26: Board + Player rendering + raw input
- T29/T30: Input normalization + HUD
- T34/T35: CP/ground item visibility + FX
- T39: Reward panel + targeting + toast
- T40: Full scenes (Lobby/Rest/GameOver)
- T43: E2E via Playwright

**テスト戦略**:
- T19-T22: Infrastructure test (connection lifecycle, state binding)
- T22-T26: Rendering test (grid → player → camera pipeline)
- T29-T30: Input→HUD pipeline test
- T39-T40: UI interaction test (reward selection, scene transitions)
- T43: **Full E2E** (TEST_MODE 依存)

**最大リスク**: T43 が T40/T41 と並列になっているが、実際は T40 の data-testid と T30 の HUD に依存 (🔴 Wave 15 矛盾)

### Cluster 4: Shared Contract (共有パッケージ契約検証)

```
T15 (全 4 パッケージ統合)
T16 (server ↔ rules-core 境界)
T19 (client ↔ shared 境界)
```

**テスト戦略**:
- T15: Cross-package data flow (config → rules-core, protocol → server/client)
- T16: RulesFacade wrapper correctness (全 rules-core 関数の型安全 wrap)
- T19: Protocol/schema 型整合性 (client が server の state schema を正しく解釈)

---

## 6. Task 別テストオラクル一覧

### ルール: どのドキュメントを信頼するか

| Task | 一次オラクル | 二次オラクル | テスト設計上の注意 |
|---|---|---|---|
| **T10** | ⚠️ api.md (不足) | be-dev-plan §5.4.1 | **api.md に §Detonate MST 詳細 追加まで TDD 不可** |
| **T11** | ⚠️ api.md (不足) | be-dev-plan §5 | **api.md に §Unmanaged BFS 詳細 追加まで TDD 不可** |
| **T12** | ⚠️ api.md (不足) | shared-dev-plan §7.5.6 + be-dev-plan §6 | widthCap 値を api.md に確定させること |
| **T13** | ⚠️ api.md (不足) | shared-dev-plan §7.5.11 + be-dev-plan §7 | spawn/respawn アルゴリズムを api.md に追加 |
| **T14** | ⚠️ api.md (不足) | shared-dev-plan §7.5.12 | offer generation + score formula を api.md に追加 |
| **T15** | api.md + shared-dev-plan §8 | — | Golden test: cross-package snapshot |
| **T16** | be-dev-plan §1, §11, §12 | api.md (queue types) | Infrastructure unit: EventQueue, CancellationIndex, QueueProcessor |
| **T17** | tech-stack.md | — | CI pipeline pass のみ |
| **T18** | be-dev-plan §3, §7, §9 | api.md (room lifecycle) | **TEST_MODE hook を api.md または be-dev-plan に正式化** |
| **T19** | fe-dev-plan §2-3, §1.5 | api.md (lobby/reconnect basics) | Mock room fixture の設計が鍵 |
| **T20** | be-dev-plan §4, §4.2.1, §10 | api.md (commands/errors) | Defense-in-depth alive check (Phase A Decision #5) |
| **T21** | api.md (dig/move/flag) | be-dev-plan §4.7 | **T23/T27 stub 要。dig→unmanaged trigger のみ検証可** |
| **T22** | fe-dev-plan §1.2, §1.3, §11, §13 | api.md (events/private-state) | 38 handler 骨格 — 空ハンドラの登録検証 |
| **T23** | api.md (items/exp) | shared-dev-plan §7.5.8-9 | Stack logic + autopickup + level-up trigger |
| **T24** | api.md (death/checkpoint) | be-dev-plan §9 | CancellationIndex effect cleanup |
| **T25** | fe-dev-plan §4 | — | Coordinate round-trip, CellType sprite selection |
| **T26** | fe-dev-plan §5 | api.md (facing/life-state) | Sprite state transitions, joystick dead-zone |
| **T27** | be-dev-plan §5 | api.md (detonate events) | **T23 DropService fixture 必須** |
| **T28** | api.md (erosion) | be-dev-plan §6 | Parallel warn/convert cycle |
| **T29** | api.md (facing/input) | fe-dev-plan §14 | Move normalization, Facing8 octant |
| **T30** | fe-dev-plan §8 | — | **data-testid="player-hud-panel" を fe-dev-plan に追加** |
| **T31** | api.md (respawn) | be-dev-plan §9 | Effect-expiry batch cancel |
| **T32** | api.md (floor transition) | be-dev-plan §7 | **8 ステップ順序の完全検証** |
| **T33** | api.md (reward/skill) | shared-dev-plan §8 | **Chord behavior が未定義** |
| **T34** | fe-dev-plan §4.5-6 | api.md (visibility formula) | Euclidean dist² ≤ R² |
| **T35** | fe-dev-plan §6-7 | api.md (event timing) | FX timeline cache management |
| **T36** | api.md (item effects) | shared-dev-plan §8.8 | **13 effects × duration/target/dispatch** |
| **T37** | api.md (claim/discard) | — | Claim validation + discard→ground flow |
| **T38** | be-dev-plan §10 | api.md (join/reconnect) | **⚠️ T32/T33 を Blocked By に追加要** |
| **T39** | fe-dev-plan §8 | api.md (reward/targeting) | **⚠️ T29 を Blocked By に追加要** |
| **T40** | fe-dev-plan §9 | api.md (scene triggers) | **data-testid 属性を fe-dev-plan に追加** |
| **T41** | fe-dev-plan §10 | — | SFX catalog completeness, BGM floor mapping |
| **T42** | be-dev-plan §14 | api.md (all game rules) | 2P full flow, mid-game join, reconnect |
| **T43** | **MISSING** | impl-plan prose のみ | **Playwright selectors + TEST_MODE を安定仕様に昇格** |

---

## 7. api.md に必要な仕様追加リスト

> **以下の 11 セクションを api.md に追加することで、T10-T14 + server/client ギャップを解消できる。**

### 優先度 🔴 (T10-T14 ブロック解除に必須)

| # | セクション名 | 対象 Task | 必須内容 | 参考ソース (転記元) |
|---|---|---|---|---|
| S1 | **§ Detonate MST 詳細** | T10 | グラフモデル (ノード集合/エッジ重み/root/parent)、tie-break レイヤー、path/event 順序、per-step mutation、remainingPath 再計算 | be-dev-plan §5.4.1 (L352-376) |
| S2 | **§ Unmanaged Explosion BFS 詳細** | T11 | 隣接定義 (4/8近傍)、queue init/enqueue/deduce、chainDepth 定義、1ステップ内処理順序、adjacentMineCount 再計算 | be-dev-plan §5 (L319-340) |
| S3 | **§ Erosion Conversion 詳細** | T12 | widthCap 权威値、SafeMine/DangerousMine 配分丸め/RNG 消費順、侵食力・比率の具体式 | shared-dev-plan §7.5.6 (L1872-1908) + be-dev-plan §6 (L407-442) |
| S4 | **§ Spawn Assignment 詳細** | T13 | spawnGroups データ形状、配員アルゴリズム (deterministic)、sessionId↔coords 対応 | shared-dev-plan §7.5.11 (L2008-2030) |
| S5 | **§ Respawn Placement 詳細** | T13 | anchor 選択、"周囲"探索半径/近傍順/tie-break、wasteland fallback 条件 | shared-dev-plan §7.5.11 (L2030-2045) |
| S6 | **§ Floor Transition Plan 詳細** | T13 | buildFloorClearTransition 入出力 (canceledTimerKinds 完全リスト)、buildNextFloorStartPlan 入出力、全員復活後の位置復元元 | shared-dev-plan §7.5.11 (L2047-2065) + api.md §フロア遷移 |
| S7 | **§ Reward Offer Generation 詳細** | T14 | 生成アルゴリズム (pool/weights/gating)、option count、重複 policy、除外条件 (full/stack/Chord) | shared-dev-plan §7.5.12 (L2067-2096) |
| S8 | **§ Reward Apply 詳細** | T14 | item option→inventory mutation semantics、skill option→stack append semantics、apply 後の private sync | shared-dev-plan §7.5.12 (L2098-2129) |
| S9 | **§ Floor Score 詳細** | T14 | calculateFloorScore 式の完全定義、floorExp の定義 (total EXP? dig EXP only?)、timeBonusMultiplier | shared-dev-plan §7.5.10 (L1995-2006) |

### 優先度 🟡 (Server/Client ギャップ解消)

| # | セクション名 | 対象 Task | 必須内容 |
|---|---|---|---|
| S10 | **§ Testing Hooks** | T18, T43 | TEST_MODE 環境変数の挙動 (auto game_over AllDead 5s)、Playwright data-testid 属性の一覧 (player-hud-panel, display-name-input, start-button, game-over-summary) |
| S11 | **§ Queue Orchestration 詳細** | T16, T27, T28 | 7 種 queue の優先順序帯 (flush > convert > blast > death > expiry)、同 tick 複数 due 処理ルール、CancellationIndex reverse lookup 規則、pause/defer セマンティクス | be-dev-plan §12.1 |

---

## 8. プラン修正勧告

### 8.1 必須修正 (BLOCKER)

| # | 修正内容 | 理由 | 影響ファイル |
|---|---|---|---|
| M1 | **Critical Path を actual blockers から再計算** | 現在の CP は不正。テスト優先順位が間違う | implementation.md L15 (TL;DR), L194 (Execution Strategy) |
| M2 | **T43 を Wave 15 から独立最終タスクに移動** | T43 は T40/T41 に依存しているのに並列は不可能 | implementation.md L186 (Wave 15) |
| M3 | **api.md に S1-S9 (9セクション) を追加** | T10-T14 が api.md 単独 TDD 不可能 | docs/plans/api.md (ゲームルール詳細仕様セクション末尾) |

### 8.2 推奨修正 (WARNING)

| # | 修正内容 | 理由 |
|---|---|---|
| W1 | T19 を Wave 8 に移動 (T1-14 のみに依存) | 過剰直列化解 |
| W2 | T27/T28/T30 を Wave 11 に移動可能か検討 | 過剰直列化解 |
| W3 | T34/T35/T36/T39 を Wave 12-13 に前方移動可能か検討 | 過剰直列化解 |
| W4 | T41 を Wave 14 に移動可能か検討 | 過剰直列化解 |
| W5 | D1-D7 の 7 件の欠落依存を implementation.md に反映 | テスト設計の正確性確保 |
| W6 | T31-T43 の metadata 形式を T1-T10 と統一 (正式 Blocked By フィールド) | 自動抽出可能性向上 |

---

## 9. テスト設計チェックリスト

### Phase B テスト実装前ゲート (Pre-TDD Gate)

以下の全項目が ✓ になって初めて T10 のテスト実装を開始できる:

- [ ] **api.md S1-S9 追加完了** (T10-T14 仕様充足)
- [ ] **api.md S10-S11 追加完了** (Testing hooks + Queue orchestration)
- [ ] **プラン M1-M3 修正完了** (Critical Path + Wave 15 + 仕様)
- [ ] **Phase A テスト全件 GREEN** (188 tests baseline 確保)

### 各 Task テスト実装時チェックリスト

#### 共通 (全 Task):
- [ ] `describe` に api.md セクション名を含んでいる
- [ ] 全ての assertion に api.md 行番号コメントがある (or Decision #N 引用)
- [ ] Boundary case ≥ 1, Invalid/Prohibited case ≥ 1, Invariant ≥ 1
- [ ] Non-vacuous assertion ≥ 1 (impl drift で fail するもの)
- [ ] 決定的論的 double のみ使用 (固定 RNG / fake clock)
- [ ] Pre-commit test コマンドが PASS する

#### rules-core (T10-T14) 追加:
- [ ] 同一 seed で同一結果 (deterministic) テストがある
- [ ] 入力 immutability テストがある (pure function 契約)
- [ ] Golden test (fixture → expected snapshot) がある

#### Server (T16-T38) 追加:
- [ ] Mock の契約が api.md/be-dev-plan で裏付けられている
- [ ] Private state sync (inventory_updated, reward_offer) のタイミングを検証
- [ ] Error code が ErrorCode enum と一致する
- [ ] CancellationIndex 操作が be-dev-plan §12 に準拠

#### Client (T19-T43) 追加:
- [ ] Fixture state が protocol/schema 型と整合
- [ ] Event handler が 38 種全て登録されている (T22)
- [ ] data-testid 属性が E2E test で使用可能 (T30/T40/T43)
- [ ] Render テストは visual diff ではなく contract check を優先

#### Integration (T15/T42/T43) 追加:
- [ ] Cross-package data flow が検証されている (T15)
- [ ] 2P full flow が検証されている (T42)
- [ ] Playwright E2E が TEST_MODE に依存していることが明記されている (T43)

---

## 付録

### A. Phase A ベストテストファイル参照

| ファイル | 特徴 | 模範とする点 |
|---|---|---|
| `rules-core/test/grid/flood-fill.test.ts` | アルゴリズム+境界+不変性 | Spec bullet との 1:1 対応 |
| `rules-core/test/movement/facing.test.ts` | Spec table からの expected value | ルール番号マッピング |
| `rules-core/test/grid/frontline.test.ts` | Deterministic RNG + order 検証 | WidthCap + 左右探索 |
| `rules-core/test/reward/inventory-mutation.test.ts` | ポリシー順テスト | Stackable/non-stackable 分離 |

### B. 用語集

| 用語 | 定義 |
|---|---|
| **Oracle (オラクル)** | テストの expected value の権威ある情報源 |
| **Primary Oracle** | 最も信頼される仕様ソース (このプロジェクトでは api.md) |
| **Secondary Oracle** | Primary で不足する場合に参照する補助ソース (shared-dev-plan, be-dev-plan, fe-dev-plan) |
| **Spec-driven** | 全 assertion が api.md (or recorded decision) から導出可能 |
| **Mirror test** | 実装コードから expected value を導出するテスト (禁止) |
| **Mixed test** | 一部 spec 由来 + 一部 impl 由来のテスト (禁止) |
| **Vacuous passing** | 何も検証していないのに通るテスト |
| **Golden test** | 入力 fixture → 期待出力 snapshot を比較するテスト |
| **Deterministic double** | 固定 seed RNG / fake clock など、常に同じ結果を返すテスト代替品 |

---

*この文書は 4 つの並列分析エージェントの出力を合成して生成された。*
