# Detonator 全体実装計画

## TL;DR

> **Quick Summary**: ドキュメントのみの状態から、協力型ローグライクマインスイーパーゲーム「Detonator」の全体を実装する。pnpm + Turborepo モノレポ上に 4 つの shared packages (protocol → config → schema → rules-core) を構築し、その上に Colyseus サーバー (apps/server) と Phaser クライアント (apps/client) を実装する。TDD (RED-GREEN-REFACTOR) を全パッケージで適用する。
> 
> **Deliverables**:
> - 動作するモノレプロジェクト (`pnpm install && pnpm dev` で起動)
> - 4 shared packages (protocol, config, schema, rules-core) — テスト付き
> - apps/server (Colyseus 0.17) — 38 イベント・7 コマンド全搭載
> - apps/client (Phaser 3 + Vite 5) — スマホファースト UI
> 
> **Estimated Effort**: XL
> **Parallel Execution**: YES - 16 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 8 → Task 9 → Task 14 → Task 18 → Task 25 → Task 32 → Task 38 → FINAL

---

## Context

### Original Request
開発計画ドキュメント (api.md, detonator.md, shared-dev-plan.md, be-dev-plan.md, fe-dev-plan.md, tech-stack.md) に従って、Detonator プロジェクトの全体実装を行う作業計画を作成する。

### Interview Summary
**Key Discussions**:
- テスト戦略: TDD (RED-GREEN-REFACTOR) を全パッケージで採用
- スコープ: モノレポセットアップから shared packages → server → client まで全体を1計画に
- 実行環境: pnpm 9 + Turborepo 2 + TypeScript 5 + Biome + Vitest
- ドキュメント優先順: api.md > detonator.md > 旧記述

**Research Findings**:
- shared-dev-plan §8 に 7 フェーズのパッケージ横断実装順が定義済み
- be-dev-plan §2 に 12 ステップのサーバー実装順が定義済み
- fe-dev-plan §15 に 4 フェーズ (A-D) のクライアント実装順が定義済み
- 全 38 API イベント・7 コマンド・14 アイテム・14 スキルが BE/FE 計画で完全カバー済み

### Metis Review
**Identified Gaps** (addressed):
- 未解決数値設定 (5項目): api.md で「実装時に確定」と明記済み。テスト用に具体値を設定し、未確定値の一覧は `packages/config/data/TUNING_NOTES.md` に外部化する方針 (`.json` は純 JSON を維持 — shared-dev-plan §7.3 準拠)
- evacuation 挙動矛盾: api.md 優先で解決済み (前セッションで修正済み)
- MVP ステージポリシー: api.md §フロア生成で固定ステージと明記
- 再接続時の catsEyeActive: 切断時に false へリセット、次イベントで再設定の安全リセット方針を採用
- QueueProcessor 同 tick 競合ルール: be-dev-plan §12.1 に明記済み

---

## Work Objectives

### Core Objective
ドキュメントに定義された Detonator ゲームの全体を TDD で実装し、`pnpm dev` で起動する動作する状態にする。

### Concrete Deliverables
- `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build` が全て通る
- 4 shared packages が各々独立でテスト可能
- apps/server が Colyseus ルームを起動し、クライアント接続を受け付ける
- apps/client が Phaser で盤面描画・入力・HUD を表示する
- 2 プレイヤーで Lobby → Game → Floor Clear → Rest → Next Floor → Game Over の全フローが通る

### Definition of Done
- [ ] `pnpm install && pnpm dev` でサーバー+クライアントが起動する
- [ ] 2 プレイヤーでの全フローが完了する (Lobby → Game → Game Over)
- [ ] 全パッケージで `pnpm test` が PASS する
- [ ] `pnpm lint && pnpm typecheck` が PASS する

### Must Have
- サーバー権威アーキテクチャ (クライアント予測なし)
- 全 38 イベント・7 コマンドの実装
- 全 14 アイテム・14 スキルの実装
- 10 フロア構成 (Floor 1〜10)
- 再接続 (60 秒猶予) の実装
- 途中参加の実装
- 侵入的 RNG と注入可能クロックによる rules-core テスト
- Biome によるリント/フォーマット

### Must NOT Have (Guardrails)
- チャット / Ping / マーキング機能 (api.md §概要で MVP 外と明記)
- ランダムイベントの具体実装 (MVP は no-op stub のみ)
- クライアント予測 / ロールバック (tech-stack.md 旧案を破棄)
- ピンチズーム / 高度なカメラ UX (fe-dev-plan §4.7 で MVP 外)
- メタ進行 / アカウント / 永続化システム
- マッチメイキング / 認証 / 管理ツール
- クライアント/サーバー間のビルド不整合サポート
- 将来拡張用の汎化抽象化 (MVP に必要なもの以外は作らない)
- `as any` / `@ts-ignore` / 空 catch / `console.log` (本番コード)
- AI スロップ: 過度なコメント、過剰抽象、汎用名 (data/result/item/temp)

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (greenfield)
- **Automated tests**: YES (TDD)
- **Framework**: Vitest (Vite-native, pnpm 互換, TypeScript ファースト)
- **TDD flow**: Each task follows RED (failing test) → GREEN (minimal impl) → REFACTOR

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Shared packages (protocol/config/schema/rules-core)**: Use Bash (vitest) — unit tests, snapshot tests, golden tests
- **Server (apps/server)**: Use Bash (curl) + tmux — API-level verification, room lifecycle
- **Client (apps/client)**: Use Playwright (playwright skill) — UI rendering, interaction, screenshots
- **Full stack**: Use Playwright + Bash — multi-player smoke tests

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation):
├── Task 1: Monorepo setup + CI [quick]
└── Task 2: packages/protocol [unspecified-high]

Wave 2 (After Wave 1 — shared packages foundation):
├── Task 3: packages/config — types + game-params [unspecified-high]
└── Task 4: packages/schema — all 8 classes [unspecified-high]

Wave 3 (After Wave 2 — config data + schema utils):
├── Task 5: packages/config — items + skills + stages + rewards data [unspecified-high]
└── Task 6: packages/schema — utils + reset helpers + tests [unspecified-high]

Wave 4 (After Wave 3 — rules-core foundation):
└── Task 7: packages/rules-core — types + RNG + grid + movement [unspecified-high]

Wave 5 (After Wave 4 — rules-core base logic):
├── Task 8: packages/rules-core — dig + flood-fill + drop + progression [deep]
└── Task 9: packages/rules-core — skill-modifiers + inventory-mutation [unspecified-high]

Wave 6 (After Wave 5 — rules-core explosive/erosion):
├── Task 10: packages/rules-core — detonate (preview + resolve) [deep]
├── Task 11: packages/rules-core — explosion (unmanaged) [deep]
└── Task 12: packages/rules-core — erosion (warning + conversion) [deep]

Wave 7 (After Wave 6 — rules-core lifecycle/reward):
├── Task 13: packages/rules-core — checkpoint + lifecycle [deep]
└── Task 14: packages/rules-core — reward + scoring [unspecified-high]

Wave 8 (After Wave 7 — integration + app foundations):
├── Task 15: Shared package integration review [unspecified-high]
├── Task 16: apps/server — foundation [unspecified-high]
└── Task 17: CI/CD — lint + typecheck + test pipeline [quick]

Wave 9 (After Wave 8 — room lifecycle + client foundation):
├── Task 18: Server — LobbyRoom + DetonatorRoom shell + floor bootstrap [deep]
└── Task 19: apps/client — foundation + scenes + connection [visual-engineering]

Wave 10 (After Wave 9 — commands + client binding):
├── Task 20: Server — JoinService + ReconnectService + command registration [unspecified-high]
├── Task 21: Server — MovementSystem + move/dig/flag handlers [unspecified-high]
└── Task 22: Client — schema binding + selectors + private state store [unspecified-high]

Wave 11 (After Wave 10 — inventory + rendering):
├── Task 23: Server — InventoryService + DropService + ExpService [unspecified-high]
├── Task 25: Client — board rendering (GridLayer + NumberTextLayer + Camera) [visual-engineering]
└── Task 26: Client — PlayerLayer + input (Keyboard + Joystick + ActionButtons) [visual-engineering]

Wave 12 (After Wave 11 — death + checkpoint + explosion + HUD):
├── Task 24: Server — DeathService (entry + avoidance) + CheckpointService [deep]
├── Task 27: Server — DetonateService + UnmanagedExplosionService [deep]
├── Task 28: Server — ErosionService [deep]
├── Task 29: Client — inputMapper + CommandDispatcher + facingResolver [unspecified-high]
└── Task 30: Client — HUD (PlayerHud + ExpBar + ScorePanel + Inventory) [visual-engineering]

Wave 13 (After Wave 12 — respawn + floor + FX):
├── Task 31: Server — RespawnService + DeathService completion [unspecified-high]
├── Task 33: Server — RewardService + SkillService [unspecified-high]
├── Task 34: Client — CpLayer + visibility + GroundItemLayer [visual-engineering]
└── Task 35: Client — FX (Detonate + Unmanaged + Erosion + ScreenFx) [visual-engineering]

Wave 14 (After Wave 13 — floor transition + item effects + multiplayer UI):
├── Task 32: Server — FloorTransitionService + ScoreService [deep]
├── Task 36: Server — 13 use_item effects + use_item completion [deep]
├── Task 37: Server — claim_reward + discard_item completion [unspecified-high]
├── Task 38: Server — mid-game join + reconnect completion [unspecified-high]
└── Task 39: Client — RewardOfferPanel + TargetingOverlay + NotificationToast [visual-engineering]

Wave 15 (After Wave 14 — scenes + audio + integration):
├── Task 40: Client — Lobby + Rest + GameOver scenes + MultiplayerNotice [visual-engineering]
├── Task 41: Client — Audio (SFX + BGM + AudioUnlock) [visual-engineering]
├── Task 42: Server — integration tests [deep]
└── Task 43: Client — integration + flow testing [deep]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: T1 → T2 → T3 → T7 → T8 → T10 → T13 → T14 → T16 → T18 → T21 → T23 → T24 → T27 → T32 → T36 → T37 → T38 → T40 → F1-F4
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 6 (Waves 12, 14)
```

### Agent Dispatch Summary
- **1**: 2 — T1 → `quick`, T2 → `unspecified-high`
- **2**: 2 — T3 → `unspecified-high`, T4 → `unspecified-high`
- **3**: 2 — T5 → `unspecified-high`, T6 → `unspecified-high`
- **4**: 1 — T7 → `unspecified-high`
- **5**: 2 — T8 → `deep`, T9 → `unspecified-high`
- **6**: 3 — T10 → `deep`, T11 → `deep`, T12 → `deep`
- **7**: 2 — T13 → `deep`, T14 → `unspecified-high`
- **8**: 3 — T15 → `unspecified-high`, T16 → `unspecified-high`, T17 → `quick`
- **9**: 2 — T18 → `deep`, T19 → `visual-engineering`
- **10**: 3 — T20 → `unspecified-high`, T21 → `unspecified-high`, T22 → `unspecified-high`
- **11**: 3 — T23 → `unspecified-high`, T25 → `visual-engineering`, T26 → `visual-engineering`
- **12**: 5 — T24 → `deep`, T27 → `deep`, T28 → `deep`, T29 → `unspecified-high`, T30 → `visual-engineering`
- **13**: 4 — T31 → `unspecified-high`, T33 → `unspecified-high`, T34 → `visual-engineering`, T35 → `visual-engineering`
- **14**: 6 — T32 → `deep`, T36 → `deep`, T37 → `unspecified-high`, T38 → `unspecified-high`, T39 → `visual-engineering`
- **15**: 4 — T40 → `visual-engineering`, T41 → `visual-engineering`, T42 → `deep`, T43 → `deep`
- **FINAL**: 4 — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Monorepo セットアップ + CI パイプライン

  **What to do**:
  - pnpm workspace + Turborepo 2 のモノレポ初期化
  - `apps/client`, `apps/server`, `packages/protocol`, `packages/config`, `packages/schema`, `packages/rules-core` の空パッケージを作成
  - 共有 `tsconfig.json` (strict mode, paths aliases) を設定
  - Biome 設定 (`.biome.json`) をルートに配置
  - Vitest 設定 (`vitest.workspace.ts`) をルートに配置
  - `package.json` scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `format`, `format:check`
  - Turborepo `turbo.json` でビルドパイプライン定義
  - `.gitignore` 更新 (`node_modules/`, `dist/`, `.turbo/` 等)
  - GitHub Actions CI workflow (lint + typecheck + test)
  - ESLint は使用しない (Biome に統一)

  **Must NOT do**:
  - ESLint / Prettier を併用しない
  - 各パッケージに個別の lint/config 設定を作らない
  - Biome の `organizeImports` / `formatter` 以外のルールを過剰に有効化しない

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 標準的なモノレポ初期化であり、ドキュメントに従うだけ
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: コミットは不要、セットアップのみ

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3-43
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `docs/plans/tech-stack.md:83-107` — セットアップチェックリストの完全な手順
  - `README.md` — ディレクトリ構成の定義

  **External References**:
  - Turborepo monorepo setup: https://turbo.build/repo/docs
  - Vitest workspace: https://vitest.dev/guide/workspace

  **WHY Each Reference Matters**:
  - tech-stack.md に具体的なチェックリストがあるため、漏れなくセットアップできる
  - README.md に公式ディレクトリ構成があるため、パッケージ構成を正確に再現できる

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test: workspace に全 6 パッケージが存在することを確認するテスト
  - [ ] `pnpm install` → 成功
  - [ ] `pnpm lint` → 0 errors
  - [ ] `pnpm typecheck` → 0 errors
  - [ ] `pnpm build` → 全パッケージビルド成功

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Clean monorepo bootstrap
    Tool: Bash
    Preconditions: Empty node_modules, no lockfile
    Steps:
      1. rm -rf node_modules pnpm-lock.yaml
      2. pnpm install
      3. pnpm lint
      4. pnpm typecheck
      5. pnpm build
    Expected Result: All commands exit 0
    Failure Indicators: Any command exits non-zero
    Evidence: .sisyphus/evidence/task-1-monorepo-bootstrap.log

  Scenario: Turborepo build pipeline
    Tool: Bash
    Preconditions: pnpm install complete
    Steps:
      1. pnpm build
      2. Verify each package has dist/ output
    Expected Result: Build completes, dist/ exists in each package
    Failure Indicators: Missing dist/ in any package
    Evidence: .sisyphus/evidence/task-1-turbo-build.log
  ```

  **Commit**: YES
  - Message: `chore: initialize monorepo with pnpm + Turborepo + Biome + Vitest`
  - Files: `package.json`, `turbo.json`, `.biome.json`, `vitest.workspace.ts`, `tsconfig.json`, `.gitignore`, `.github/workflows/ci.yml`, `apps/*/package.json`, `packages/*/package.json`
  - Pre-commit: `pnpm lint && pnpm typecheck`

- [x] 2. packages/protocol — enum / interface / command / event / timer / constant 定義

  **What to do**:
   - `src/types.ts`: api.md 共有型定義セクションから全 enum (CellType, GamePhase, PlayerLifeState, Facing8, Facing4, DeathCause, ItemType, SkillType, LeaveReason, FuseCancelReason, ErosionWarningCancelReason, ExpSource, ItemDestroyReason, GameOverReason, ErrorCode) を転記。**api.md §共有型定義 (api.md:2081-2326) を最終権威とし、shared-dev-plan との差異は api.md を優先する** (例: ErrorCode は api.md 準拠の 18 個、ItemDestroyReason は api.md 準拠で FloorCleared を含む)
  - `src/types.ts`: 全 interface (Vec2, GridCoord, RoomOptions, JoinOptions, InventorySlot, SkillRewardOption, ItemRewardOption) と RewardOption union type を定義
  - `src/commands.ts`: 7 command payload (MovePayload, DigPayload, FlagPayload, DetonatePayload, UseItemPayload, DiscardItemPayload, ClaimRewardPayload) を定義
  - `src/events.ts`: 38 event payload interface を全て定義 (shared-dev-plan §4.6 の全表を網羅)
  - `src/timers.ts`: 7 timer queue entry 型 (DetonateFuseEntry, UnmanagedChainEntry, ErosionPhaseEntry, ItemExpiryEntry, RespawnEntry, EffectExpiryEntry, FutureEventEntry) と QueueEntry union type を定義
  - `src/constants.ts`: ROOM_NAMES, COMMAND_NAMES, EVENT_NAMES, ALL_COMMAND_NAMES, ALL_EVENT_NAMES, ALL_ROOM_NAMES を定義
  - `src/index.ts`: barrel export
  - `test/protocol.constants.test.ts`: event/command/room 名の重複がないことを検証
  - `test/protocol.type-exports.test.ts`: public export surface の破壊変更検知

  **Must NOT do**:
  - api.md にない enum や interface を勝手に追加しない
  - enum 値を api.md と異なる値にしない
  - snake_case 命名規則を破らない (room 名は PascalCase のみ例外)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 7 ファイル、38 event interface の大量定義。正確な転記が必須
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Tasks 3, 4, 5, 7-14, 16-43
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `docs/plans/shared-dev-plan.md:175-311` — types.ts の完全な enum 定義と interface 定義テーブル
  - `docs/plans/shared-dev-plan.md:337-371` — commands.ts の 7 command payload
  - `docs/plans/shared-dev-plan.md:386-468` — events.ts の 38 event payload (全表)
  - `docs/plans/shared-dev-plan.md:474-594` — timers.ts の 7 queue entry 型
  - `docs/plans/shared-dev-plan.md:534-594` — constants.ts の全定数

  **API/Type References**:
  - `docs/plans/api.md:2081-2326` — 共有型定義の TS コード (enum + interface) — ここが最終ソース
  - `docs/plans/api.md:2330-2391` — コマンド/イベントの型エクスポート一覧

  **Test References**:
  - `docs/plans/shared-dev-plan.md:598-607` — protocol 実装ステップ §4.9 の export surface test

  **WHY Each Reference Matters**:
  - shared-dev-plan は api.md を正確に TS 表現した唯一のソース。ここを参照すれば api.md との完全一致が保証される
  - api.md §共有型定義は最終権威の TS コード断片。enum 値や interface フィールドを直接コピーする

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test: `ALL_COMMAND_NAMES.length === 7`
  - [ ] Test: `ALL_EVENT_NAMES.length === 38`
  - [ ] Test: `ALL_ROOM_NAMES.length === 2`
  - [ ] Test: 全 ItemType enum 値が api.md と一致 (14 値)
  - [ ] Test: 全 SkillType enum 値が api.md と一致 (14 個)
  - [ ] Test: 全 ErrorCode enum 値が api.md と一致 (18 個)
  - [ ] `pnpm --filter @detonator/protocol test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Protocol export completeness
    Tool: Bash (vitest)
    Preconditions: Task 1 complete
    Steps:
      1. pnpm --filter @detonator/protocol test
      2. Verify all test assertions pass
    Expected Result: All tests pass, 7 commands / 38 events / 14 items / 14 skills exported
    Failure Indicators: Export count mismatch, enum value mismatch
    Evidence: .sisyphus/evidence/task-2-protocol-exports.log

  Scenario: No naming collisions
    Tool: Bash (vitest)
    Preconditions: Task 1 complete
    Steps:
      1. pnpm --filter @detonator/protocol test -- -t "collision"
    Expected Result: No duplicate names found
    Failure Indicators: Duplicate event/command name detected
    Evidence: .sisyphus/evidence/task-2-no-collisions.log
  ```

  **Commit**: YES
  - Message: `feat(protocol): add enum / interface / command / event / timer / constant contracts`
  - Files: `packages/protocol/src/*.ts`, `packages/protocol/test/*.ts`
  - Pre-commit: `pnpm --filter @detonator/protocol test`

- [x] 3. packages/config — 型定義 + game-params.json

  **What to do**:
  - `src/types.ts`: shared-dev-plan §5.4 の全 TS interface を定義 (SharedGameConfig, GameParamsConfig, BoardParams, MineParams, ErosionParams, ProgressionParams, RespawnParams, DetonateParams, DropParams, CheckpointParams, ScoringParams, MovementParams, RoomParams, InventoryParams, ItemEffectParams)
  - `src/types.ts`: items.json 用 interface (ItemDefinition, ItemTargeting), skills.json 用 interface (SkillDefinition, SkillValueRoll), stages.json 用 interface (StagesConfig, FloorDefinition, StageDefinition, StageBoardProfile, SpawnGroupDefinition), rewards.json 用 interface (RewardsConfig, LevelUpRewardConfig, RewardPoolEntry)
  - `src/loadConfig.ts`: JSON 読み込み + deep freeze + normalize
  - `src/validateConfig.ts`: enum 値整合、stage 重複、reward pool 不整合検証
  - `src/index.ts`: barrel export
  - `data/game-params.json`: api.md 主要パラメータ初期値を完全反映 (純 JSON、コメント不可)。未確定値にはテスト用デフォルト値を設定し、未確定値の一覧を `data/TUNING_NOTES.md` に記載 (項目名/現行値/調整対象の理由)
  - 未確定値のデフォルト: `takeABreathPauseMs=5000`, `shortBreakPauseMs=15000`, `catsEyeDurationMs=10000`, `disposableLifeDurationMs=10000`

  **Must NOT do**:
  - api.md のパラメータ初期値と異なる値を設定しない (未確定値以外)
  - rules-core の数式を config にハードコードしない
  - `packages/rules-core` に依存しない

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 多数の interface 定義 + JSON 構造体の正確な構築
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Tasks 5, 7-14
  - **Blocked By**: Task 2 (protocol enums 必須)

  **References**:

  **Pattern References**:
  - `docs/plans/shared-dev-plan.md:668-689` — GameParamsConfig と全サブ params interface
  - `docs/plans/shared-dev-plan.md:694-696` — ItemDefinition interface
  - `docs/plans/shared-dev-plan.md:700-703` — SkillDefinition interface
  - `docs/plans/shared-dev-plan.md:705-713` — stages.json 用 interface
  - `docs/plans/shared-dev-plan.md:716-721` — rewards.json 用 interface
  - `docs/plans/shared-dev-plan.md:723-821` — game-params.json の完全 JSON 構造

  **API/Type References**:
  - `docs/plans/api.md:86-118` — 主要パラメータ初期値テーブル (game-params.json の基準)

  **WHY Each Reference Matters**:
  - shared-dev-plan §5.4 には interface フィールドが完全に列挙されている。これを参照すれば config types の網羅が保証される
  - api.md のパラメータテーブルは game-params.json の基準値となる

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test: GameParamsConfig の全フィールドが正しい型を持つ
  - [ ] Test: `loadConfig()` が deep freeze された config を返す
  - [ ] Test: `validateConfig()` が enum 不整合を検出する
  - [ ] Test: 未確定値に 0 以外のデフォルト値が設定されている
  - [ ] `pnpm --filter @detonator/config test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Config loads and validates
    Tool: Bash (vitest)
    Preconditions: Tasks 1-2 complete
    Steps:
      1. pnpm --filter @detonator/config test
      2. Verify loadConfig returns frozen config
    Expected Result: All tests pass
    Failure Indicators: Missing field, wrong type, unfrozen object
    Evidence: .sisyphus/evidence/task-3-config-load.log
  ```

  **Commit**: YES
  - Message: `feat(config): type definitions and game-params configuration`
  - Files: `packages/config/src/*.ts`, `packages/config/data/game-params.json`
  - Pre-commit: `pnpm --filter @detonator/config test`

- [x] 4. packages/schema — Colyseus shared state クラス 8 種

  **What to do**:
  - `src/CellState.ts`: 5 @type() フィールド (cellType, adjacentMineCount, flagged, hasRelayPoint, erosionWarning)
  - `src/GridState.ts`: width, height, cells (ArraySchema<CellState>)
  - `src/FloorState.ts`: stageId, floorStartedAt, cpTotal, cpCollected
  - `src/ErosionState.ts`: active, nextWarningAt, nextConversionAt, warningCellKeys
  - `src/CheckpointState.ts`: cpId, x, y, collected, collectedBySessionId
  - `src/GroundItemState.ts`: groundItemId, itemType, x, y, stackCount, expiresAt
  - `src/PlayerState.ts`: 10 @type() フィールド (sessionId, displayName, x, y, facing, lifeState, respawnAt, level, exp, pendingRewardCount)
  - `src/GameState.ts`: 9 @type() フィールド (phase, floorNumber, floor, grid, erosion, totalScore, players, groundItems, checkpoints)
  - `src/index.ts`: barrel export

  **Must NOT do**:
  - PlayerState に inventory を追加しない (private state は schema 外)
  - 1 クラスに 64 個以上の @type() フィールドを置かない
  - MapSchema キーに数値を使わない
  - 多次元配列を使わない (flat array + index 規約)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: @colyseus/schema の制約遵守と正確な型定義が必要
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: Tasks 6, 16, 19, 22
  - **Blocked By**: Task 2 (protocol enums 必須)

  **References**:

  **Pattern References**:
  - `docs/plans/shared-dev-plan.md:1326-1597` — §6.4 各 class の完全な @type() フィールド定義
  - `docs/plans/api.md:1559-1853` — Shared Schema セクションの TS コード

  **WHY Each Reference Matters**:
  - shared-dev-plan §6.4 には各 class のフィールド数が明記されている (CellState=5, GridState=3, FloorState=4, ErosionState=4, CheckpointState=5, GroundItemState=6, PlayerState=10, GameState=9)。64 フィールド制約チェックに必須

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test: 各 class の @type() フィールド数が shared-dev-plan §6.4 のカウントと一致
  - [ ] Test: `ArraySchema<CellState>` が正しく flat array として動作
  - [ ] Test: `MapSchema<PlayerState>` が sessionId でアクセス可能
  - [ ] Test: シリアライズ/デシリアライズがラウンドトリップ可能
  - [ ] `pnpm --filter @detonator/schema test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Schema serialization round-trip
    Tool: Bash (vitest)
    Preconditions: Tasks 1-2 complete
    Steps:
      1. pnpm --filter @detonator/schema test
      2. Verify all tests pass
    Expected Result: Serialization/deserialization works correctly
    Failure Indicators: Round-trip data loss, field count mismatch
    Evidence: .sisyphus/evidence/task-4-schema-serialization.log
  ```

  **Commit**: YES
  - Message: `feat(schema): Colyseus shared state classes for game state`
  - Files: `packages/schema/src/*.ts`
  - Pre-commit: `pnpm --filter @detonator/schema test`

- [x] 5. packages/config — items.json + skills.json + stages.json + rewards.json

  **What to do**:
  - `data/items.json`: shared-dev-plan §5.6 の 14 アイテム全件定義を実装 (純 JSON、コメント不可)。未確定 duration 値にはデフォルト値を設定し、未確定値を `data/TUNING_NOTES.md` に記載
  - `data/skills.json`: shared-dev-plan §5.7 の 14 スキル全件定義を実装
  - `data/stages.json`: shared-dev-plan §5.8 のフロア定義 + ステージ定義を実装。stage 2-10 の boardProfile, holeCoords, cpCandidateCoords, spawnGroups を最低限実装 (stage 1 は完全実装済み)
  - `data/rewards.json`: shared-dev-plan §5.9 の報酬テーブルを実装
  - `src/validateConfig.ts` を更新: enum 整合、stage 重複、reward pool 不整合、未確定値 0 チェックの検証を追加
  - `src/index.ts` を更新: 全 JSON を export

  **Must NOT do**:
  - api.md にないアイテム/スキルを追加しない
  - `effectRef` 参照先が config に存在しないアイテムを作らない
  - `stages.json` の stage 2-10 を完全に空にしない (最低限の authoring データを持たせる)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 4 JSON ファイルの正確な構築 + バリデーション拡張
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Parallel Group**: Wave 3 (with Task 6)
  - **Blocks**: Tasks 7-14
  - **Blocked By**: Tasks 3, 4 (config types + schema)

  **References**:

  **Pattern References**:
  - `docs/plans/shared-dev-plan.md:823-1009` — items.json の完全 JSON 構造 (14 アイテム)
  - `docs/plans/shared-dev-plan.md:1011-1156` — skills.json の完全 JSON 構造 (14 スキル)
  - `docs/plans/shared-dev-plan.md:1158-1201` — stages.json の JSON 構造
  - `docs/plans/shared-dev-plan.md:1204-1247` — rewards.json の JSON 構造

  **WHY Each Reference Matters**:
  - shared-dev-plan §5 には各 JSON の完全な構造が定義されている。これを参照すればデータの網羅が保証される

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test: items.json に 14 エントリが存在する
  - [ ] Test: skills.json に 14 エントリが存在する
  - [ ] Test: stages.json に 10 フロア + 10 ステージが存在する
  - [ ] Test: rewards.json の itemPool に 14 エントリ、skillPool に 14 エントリが存在する
  - [ ] Test: `validateConfig()` が全 JSON の整合性を通過する
  - [ ] `pnpm --filter @detonator/config test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Config data completeness
    Tool: Bash (vitest)
    Preconditions: Tasks 1-4 complete
    Steps:
      1. pnpm --filter @detonator/config test
      2. Verify all data files pass validation
    Expected Result: All validation passes
    Failure Indicators: Missing entry, invalid enum reference, duplicate stage ID
    Evidence: .sisyphus/evidence/task-5-config-data.log
  ```

  **Commit**: YES
  - Message: `feat(config): gameplay data for items, skills, stages, and rewards`
  - Files: `packages/config/data/*.json`, `packages/config/src/validateConfig.ts`, `packages/config/src/index.ts`
  - Pre-commit: `pnpm --filter @detonator/config test`

- [x] 6. packages/schema — utility helpers + reset helpers + tests

  **What to do**:
  - `src/utils/coords.ts`: coordToIndex, indexToCoord, toCellKey, fromCellKey, isInBounds
  - `src/utils/cells.ts`: getCell, requireCell, setCellFlags, clearCellTransientMarks
  - `src/utils/checkpoints.ts`: createCheckpointState, markCheckpointCollected, listRemainingCheckpointIds
  - `src/utils/collections.ts`: upsertPlayerState, upsertGroundItemState, resetStringArray
  - `src/utils/reset.ts`: clearAllFlagsAndRelayPoints, clearAllErosionWarnings, convertAllMineCellsToSafe, resetPlayersForNewFloor
  - `test/serialization.test.ts`: schema シリアライゼーションテスト
  - `test/schema-utils.test.ts`: utils 関数のユニットテスト

  **Must NOT do**:
  - utils にルール計算ロジックを入れない (rules-core の責務)
  - `cells[y][x]` 的な多次元アクセス helper を作らない (flat array 規約を守る)
  - schema class 自体を変更しない

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 5 utils ファイル + 2 test ファイルの実装
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)
  - **Parallel Group**: Wave 3 (with Task 5)
  - **Blocks**: Tasks 16, 19, 22, 25, 29, 34
  - **Blocked By**: Tasks 3, 4

  **References**:

  **Pattern References**:
  - `docs/plans/shared-dev-plan.md:1535-1579` — §6.5 各 utils ファイルの具体的シグネチャ
  - `docs/plans/shared-dev-plan.md:1581-1591` — §6.6 schema 実装ステップ

  **WHY Each Reference Matters**:
  - shared-dev-plan §6.5 には各 utils ファイルの関数シグネチャが完全に記載されている。これを参照すれば server/client が依存する helper API が正確に実装できる

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test: coordToIndex/indexToCoord のラウンドトリップが正しい
  - [ ] Test: toCellKey/fromCellKey のラウンドトリップが正しい
  - [ ] Test: isInBounds が境界値を正しく判定
  - [ ] Test: clearAllFlagsAndRelayPoints が全フラグをクリア
  - [ ] Test: convertAllMineCellsToSafe が全地雷原セルを Safe に変換
  - [ ] Test: `pnpm --filter @detonator/schema test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Schema utilities functional
    Tool: Bash (vitest)
    Preconditions: Tasks 1-4 complete
    Steps:
      1. pnpm --filter @detonator/schema test
    Expected Result: All utility and serialization tests pass
    Failure Indicators: Round-trip failure, boundary check error
    Evidence: .sisyphus/evidence/task-6-schema-utils.log
  ```

  **Commit**: YES
  - Message: `feat(schema): utility helpers and reset functions for shared state`
  - Files: `packages/schema/src/utils/*.ts`, `packages/schema/test/*.test.ts`
  - Pre-commit: `pnpm --filter @detonator/schema test`

- [x] 7. packages/rules-core — foundation (types + RNG + grid + movement)

  **What to do**:
  - `src/index.ts`: barrel export
  - `src/types.ts`: 全 DTO 型定義 (RulesCell, RulesGrid, RulesPlayer, SkillStackEntry, RulesInventory, GroundItemDropModel, CheckpointModel, TransitionTimerSnapshot) — shared-dev-plan §7.4 参照
  - `src/random/SeededRng.ts`: seed 固定テスト用 RNG wrapper (linear congruential または mulberry32)
  - `src/grid/coords.ts`: linearIndexOf, coordOf, chebyshevDistance, manhattanDistance, euclideanDistanceSquared
  - `src/grid/neighbors.ts`: getNeighbors4, getNeighbors8, bfs<T>
  - `src/grid/adjacent-mine-count.ts`: recomputeAdjacentMineCount, recomputeAdjacentMineCounts
  - `src/grid/flood-fill.ts`: floodRevealFromSafeCell
  - `src/grid/frontline.ts`: extractFrontlineCoords, selectFrontlineTargets
  - `src/movement/speed.ts`: calculateMovementSpeed
  - `src/movement/facing.ts`: resolveFacing8, projectFacingToAxis4
  - `src/movement/collision.ts`: resolveAlivePlayerCollisions

  **Must NOT do**:
  - `schema` パッケージに compile-time 依存を持たせない
  - ルンダムなグローバル状態や Math.random() を使用しない
  - 速度式・距離計算のハードコードをしない (config から読む設計)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: rules-core 全体の基盤となる DTO + 補助関数群の実装
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run Parallel**: NO (Wave 4, only task)
  - **Parallel Group**: Wave 4 (solo)
  - **Blocks**: Tasks 8, 9
  - **Blocked By**: Tasks 3, 4, 5

  **References**:

  **Pattern References**:
  - `docs/plans/shared-dev-plan.md:1602-1667` — §7.1-7.3 ディレクトリ構成とファイル構成テーブル
  - `docs/plans/shared-dev-plan.md:1703-1714` — §7.4 DTO 型定義テーブル
  - `docs/plans/shared-dev-plan.md:1718-1758` — §7.5.1 grid/ 関数シグネチャ
  - `docs/plans/shared-dev-plan.md:1760-1787` — §7.5.2 movement/ 関数シグネチャ

  **WHY Each Reference Matters**:
  - shared-dev-plan §7.4 には DTO 型のフィールドが完全に列挙されている。server が rules-core を呼ぶ際の入出力型の契約となる
  - §7.5 には全関数シグネチャが記載されており、これに従えば server facade との互換性が保証される

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test: SeededRng が同じ seed で同じ乱数列を生成する (deterministic)
  - [ ] Test: chebyshevDistance が正しい距離を返す
  - [ ] Test: floodRevealFromSafeCell がゼロ領域を正しく開放する
  - [ ] Test: calculateMovementSpeed が config パラメータに基づいて速度を計算
  - [ ] Test: resolveAlivePlayerCollisions が AABB 衝突を解決する
  - [ ] `pnpm --filter @detonator/rules-core test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Rules-core foundation deterministic
    Tool: Bash (vitest)
    Preconditions: Tasks 1-5 complete
    Steps:
      1. pnpm --filter @detonator/rules-core test
      2. Verify deterministic tests pass
    Expected Result: All foundation tests pass
    Failure Indicators: Non-deterministic test failure, type mismatch
    Evidence: .sisyphus/evidence/task-7-rules-core-foundation.log
  ```

  **Commit**: YES
  - Message: `feat(rules-core): foundation types, RNG, grid utilities, and movement`
  - Files: `packages/rules-core/src/index.ts`, `packages/rules-core/src/types.ts`, `packages/rules-core/src/random/*.ts`, `packages/rules-core/src/grid/*.ts`, `packages/rules-core/src/movement/*.ts`
  - Pre-commit: `pnpm --filter @detonator/rules-core test`

- [x] 8. packages/rules-core — dig + flood-fill + drop + progression

  **What to do**:
  - `src/dig/resolve-dig.ts`: resolveDig (safe_dig / dangerous_trigger / invalid の 3 分岐) — shared-dev-plan §7.5.3
  - `src/drop/roll-drop.ts`: rollGroundDrop (ドロップ抽選) — shared-dev-plan §7.5.8
  - `src/progression/exp.ts`: calculateDigExp, calculateDetonateComboExp — shared-dev-plan §7.5.9
  - `src/progression/leveling.ts`: requiredExpForLevel, resolveLevelProgression — shared-dev-plan §7.5.9
  - `src/checkpoint/placement.ts`: selectCheckpointCoords (Hole 除外 / 初期安全ゾーン除外) — shared-dev-plan §7.5.7
  - `src/checkpoint/detection.ts`: detectCheckpointsInRange, collectCheckpointOnOverlap — shared-dev-plan §7.5.7

  **Must NOT do**:
  - dig の結果を直接 schema に反映しない (純粋関数)
  - EXP 計算式を config にハードコードしない

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: dig→EXP→drop の一連のゲームロジックフローを実装。flood-fill の再帰ロジックは複雑
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run Parallel**: YES (Wave 5)
  - **Parallel Group**: Wave 5 (with Task 9)
  - **Blocks**: Tasks 10-14
  - **Blocked By**: Task 7

  **References**:

  **Pattern References**:
  - `docs/plans/shared-dev-plan.md:1789-1809` — §7.5.3 dig/ resolve-dig シグネチャ
  - `docs/plans/shared-dev-plan.md:1936-1945` — §7.5.8 drop/ roll-drop シグネチャ
  - `docs/plans/shared-dev-plan.md:1949-1974` — §7.5.9 progression シグネチャ
  - `docs/plans/shared-dev-plan.md:1911-1933` — §7.5.7 checkpoint シグネチャ

  **Config References**:
  - `docs/plans/shared-dev-plan.md:676-688` — GameParamsConfig (progression/drop パラメータ)

  **WHY Each Reference Matters**:
  - §7.5.3-7.5.9 のシグネチャは、関数の入出力型が完全に定義されている。これに従えば server が rules-core を呼ぶ際のインターフェースが確定する

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test: resolveDig が SafeMine を Safe に変換し flood-fill を実行する
  - [ ] Test: resolveDig が DangerousMine で dangerous_trigger を返す
  - [ ] Test: resolveDig が無効ターゲットで invalid を返す
  - [ ] Test: rollGroundDrop が config の drop rate に基づいて抽選する
  - [ ] Test: calculateDigExp が flood-fill セル数に応じた EXP を返す
  - [ ] Test: resolveLevelProgression が正しく level up を判定する
  - [ ] Test: selectCheckpointCoords が Hole と初期安全ゾーンを除外する
  - [ ] `pnpm --filter @detonator/rules-core test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Dig → EXP → Drop flow
    Tool: Bash (vitest)
    Preconditions: Tasks 1-7 complete
    Steps:
      1. pnpm --filter @detonator/rules-core test
      2. Verify dig/exp/drop tests pass
    Expected Result: Dig chain produces correct EXP and drop results
    Failure Indicators: Wrong EXP calculation, invalid drop rate
    Evidence: .sisyphus/evidence/task-8-dig-progression.log
  ```

  **Commit**: YES
  - Message: `feat(rules-core): dig, flood-fill, drop, progression, and checkpoint logic`
  - Files: `packages/rules-core/src/dig/*.ts`, `packages/rules-core/src/drop/*.ts`, `packages/rules-core/src/progression/*.ts`, `packages/rules-core/src/checkpoint/*.ts`
  - Pre-commit: `pnpm --filter @detonator/rules-core test`

- [x] 9. packages/rules-core — skill-modifiers + inventory-mutation

  **What to do**:
  - `src/progression/skill-modifiers.ts`: aggregateSkillModifiers (13 種スキルのスタック集約と補正値算出) — shared-dev-plan §7.5.9
  - `src/reward/inventory-mutation.ts`: canAddItemToInventory, addItemToInventory, consumeInventorySlot, discardInventorySlot — shared-dev-plan §7.5.12
  - `test/`: skill-modifiers と inventory-mutation のユニットテスト

  **Must NOT do**:
  - スキル効果の具体的な値をハードコードしない (config + skill.json から読む)
  - inventory 操作のロジックを server に散らさない (ここが唯一の実装箇所)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: inventory 操作の共通ロジック + スキル集約。多数のスタックケースを正確に網羅する必要がある
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run Parallel**: YES (Wave 5)
  - **Parallel Group**: Wave 5 (with Task 8)
  - **Blocks**: Tasks 10-14
  - **Blocked By**: Task 7

  **References**:

  **Pattern References**:
  - `docs/plans/shared-dev-plan.md:1976-1993` — §7.5.9 aggregateSkillModifiers シグネチャ (13 補正値の返り型)
  - `docs/plans/shared-dev-plan.md:2098-2129` — §7.5.12 inventory-mutation シグネチャ (4 関数)

  **Config References**:
  - `docs/plans/shared-dev-plan.md:1011-1156` — skills.json (14 スキル定義、effectValue の min/max/unit)
  - `docs/plans/shared-dev-plan.md:823-1009` — items.json (14 アイテム定義、stackable/maxStack)

  **WHY Each Reference Matters**:
  - §7.5.9 の aggregateSkillModifiers は 13 の返り値を持つ複雑な集約関数。各スキルの effectValue レンジは skills.json で定義されているため、両方を参照しないと正確な実装ができない

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test: aggregateSkillModifiers が空スタックでデフォルト値を返す
  - [ ] Test: aggregateSkillModifiers が movementSpeedBoostRatio を正しく計算する (2〜6% per stack)
  - [ ] Test: addItemToInventory が新規スロット消費時に true を返す
  - [ ] Test: addItemToInventory がスタック加算時に false を返す
  - [ ] Test: canAddItemToInventory が満杯 + 非スタックアイテムで false を返す
  - [ ] Test: consumeInventorySlot がスタック数を減らす
  - [ ] Test: discardInventorySlot が droppedItem を返す
  - [ ] `pnpm --filter @detonator/rules-core test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Skill aggregation and inventory operations
    Tool: Bash (vitest)
    Preconditions: Tasks 1-7 complete
    Steps:
      1. pnpm --filter @detonator/rules-core test
    Expected Result: All skill-modifier and inventory tests pass
    Failure Indicators: Wrong modifier calculation, inventory state corruption
    Evidence: .sisyphus/evidence/task-9-skill-inventory.log
  ```

  **Commit**: YES
  - Message: `feat(rules-core): skill modifier aggregation and inventory mutation logic`
  - Files: `packages/rules-core/src/progression/skill-modifiers.ts`, `packages/rules-core/src/reward/inventory-mutation.ts`, `packages/rules-core/test/*.test.ts`
  - Pre-commit: `pnpm --filter @detonator/rules-core test`

- [ ] 10. packages/rules-core — detonate (build-preview + resolve-chain)

  **What to do**:
  - `src/detonate/build-preview.ts`: buildDetonatePreview — Rooted Prim-MST 計算と provisional path 構築 — shared-dev-plan §7.5.4
  - `src/detonate/resolve-detonate.ts`: resolveDetonateChain — MST ノードの連鎖適用 (125ms per step)、セル種別処理 (DangerousMine→伝播継続, SafeMine→Safe化+停止, RelayPoint→中継継続)、旗/RelayPoint 除去、タイブレーク規則 (y * width + x 昇順) — shared-dev-plan §7.5.4
  - `test/detonate.test.ts`: deterministic MST、chain step 順序、旗除去、RelayPoint 伝播の golden test

  **Must NOT do**:
  - unmanaged explosion のロジックを混ぜない (別パイプライン)
  - server の EventQueue / schema 更新を参照しない (純粋関数)
  - fuse timer / cooldown の管理ロジックを入れない

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Rooted Prim-MST アルゴリズム + 連鎖 chain 処理の複雑なゲームロジック
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 6)
  - **Parallel Group**: Wave 6 (with Tasks 11, 12)
  - **Blocks**: Tasks 13, 14, 16-43
  - **Blocked By**: Tasks 7, 8, 9

  **References**:

  **Pattern References**:
  - `docs/plans/shared-dev-plan.md:1811-1842` — §7.5.4 buildDetonatePreview / resolveDetonateChain の完全なシグネチャ
  - `docs/plans/back/be-dev-plan.md:363-376` — §5.4.1 Detonate 爆発評価アルゴリズム詳細 (3.0s fuse, Rooted Prim-MST, 125ms chain, タイブレーク)

  **WHY Each Reference Matters**:
  - §7.5.4 には入出力型が完全に定義されており、chainSteps の返り型 (atOffsetMs, coord, cellTypeBefore, wasRelayPoint, remainingPath) が server が event を生成するための契約となる
  - be-dev-plan §5.4.1 にはアルゴリズムの詳細手順 (MST 再計算タイミング、連鎖停止条件、同 tick 複数 due 処理) が記載されており、実装の正確性を担保する

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test: buildDetonatePreview が正しい provisional path を返す (3x3 grid で deterministic)
  - [ ] Test: resolveDetonateChain が DangerousMine で連鎖継続、SafeMine で停止
  - [ ] Test: resolveDetonateChain が RelayPoint を中継ノードとして扱い子へ伝播
  - [ ] Test: タイブレーク規則 (y * width + x 昇順) が正しく適用される
  - [ ] Test: 旗/RelayPoint が連鎖経路上で除去される
  - [ ] Test: 同一 seed で同一結果 (deterministic)
  - [ ] `pnpm --filter @detonator/rules-core test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Detonate chain with relay points and safe mines
    Tool: Bash (vitest)
    Preconditions: Tasks 1-9 complete
    Steps:
      1. pnpm --filter @detonator/rules-core test -- -t "detonate"
      2. Verify chain stops at SafeMine, continues through RelayPoint
    Expected Result: All detonate tests pass
    Failure Indicators: Wrong chain order, missing relay propagation
    Evidence: .sisyphus/evidence/task-10-detonate-chain.log

  Scenario: Detonate tie-break determinism
    Tool: Bash (vitest)
    Preconditions: Tasks 1-9 complete
    Steps:
      1. pnpm --filter @detonator/rules-core test -- -t "tiebreak"
    Expected Result: Same seed always produces same order
    Failure Indicators: Non-deterministic ordering
    Evidence: .sisyphus/evidence/task-10-detonate-tiebreak.log
  ```

  **Commit**: YES
  - Message: `feat(rules-core): detonate preview and chain resolution`
  - Files: `packages/rules-core/src/detonate/*.ts`, `packages/rules-core/test/detonate.test.ts`
  - Pre-commit: `pnpm --filter @detonator/rules-core test`

- [ ] 11. packages/rules-core — explosion (unmanaged)

  **What to do**:
  - `src/explosion/trigger-unmanaged.ts`: triggerUnmanagedExplosion — 誤掘り起点の即時爆発、衝撃波 (blastCoords) + 荒地化 (wastelandCoords) 適用、BFS 連鎖エントリ生成 — shared-dev-plan §7.5.5
  - `src/explosion/resolve-unmanaged-chain.ts`: resolveUnmanagedChainStep — BFS 1 ステップ処理、blast/wasteland 適用、次段 dangerous coords 返却 — shared-dev-plan §7.5.5
  - `test/unmanaged-explosion.test.ts`: 衝撃波範囲、荒地化、BFS 連鎖深度の golden test

  **Must NOT do**:
  - detonate (管理爆発) のロジックを混ぜない (別パイプライン)
  - 死亡判定をここに入れない (server DeathService に委譲)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: BFS 連鎖 + 衝撃波/荒地化の複雑な空間計算
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 6)
  - **Parallel Group**: Wave 6 (with Tasks 10, 12)
  - **Blocks**: Tasks 13, 14, 16-43
  - **Blocked By**: Tasks 7, 8

  **References**:

  **Pattern References**:
  - `docs/plans/shared-dev-plan.md:1844-1870` — §7.5.5 triggerUnmanagedExplosion / resolveUnmanagedChainStep の完全なシグネチャ
  - `docs/plans/back/be-dev-plan.md:319-404` — §5 爆発システム全体のファイル構成・ステップ・event タイミング

  **WHY Each Reference Matters**:
  - §7.5.5 には blastCoords / wastelandCoords / chainEntries / nextDangerousCoords の返り型が定義されており、server が event 送信時に使うデータ構造の契約となる
  - be-dev-plan §5 には unmanaged explosion の event 送信タイミング (triggered → chain_step → resolved) と CancellationIndex との連携方法が記載されている

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test: triggerUnmanagedExplosion が blastCoords (距離1) と wastelandCoords を正しく返す
  - [ ] Test: resolveUnmanagedChainStep が blast/wasteland を適用し nextDangerousCoords を返す
  - [ ] Test: BFS 連鎖が chainDepth に応じて正しく進行する
  - [ ] Test: 同一 seed で同一結果 (deterministic)
  - [ ] `pnpm --filter @detonator/rules-core test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Unmanaged explosion BFS chain
    Tool: Bash (vitest)
    Preconditions: Tasks 1-8 complete
    Steps:
      1. pnpm --filter @detonator/rules-core test -- -t "unmanaged"
      2. Verify BFS chain depth and blast/wasteland ranges
    Expected Result: Chain proceeds correctly through dangerous neighbors
    Failure Indicators: Wrong blast radius, missing wasteland conversion
    Evidence: .sisyphus/evidence/task-11-unmanaged-explosion.log
  ```

  **Commit**: YES
  - Message: `feat(rules-core): unmanaged explosion trigger and BFS chain resolution`
  - Files: `packages/rules-core/src/explosion/*.ts`, `packages/rules-core/test/unmanaged-explosion.test.ts`
  - Pre-commit: `pnpm --filter @detonator/rules-core test`

- [ ] 12. packages/rules-core — erosion (warning + conversion)

  **What to do**:
  - `src/erosion/plan-warning.ts`: planErosionWarning — frontline 抽出 (地雷原/荒地が周囲8マス以内にある Safe セル)、ランダム起点 + 左右探索による対象選定、widthCap 対応の新 frontline 再探索、Wasteland を加えた和集合返却 — shared-dev-plan §7.5.6
  - `src/erosion/apply-conversion.ts`: applyErosionConversion — Wasteland + 選定済み Safe セルの SafeMine/DangerousMine 再配置、adjacentMineCount 再計算 — shared-dev-plan §7.5.6
  - `test/erosion.test.ts`: frontline 抽出、widthCap 制限、変換比率、adjacent 更新の golden test

  **Must NOT do**:
  - 侵食タイマーのスケジューリングをここに入れない (server ErosionService に委譲)
  - 死亡判定をここに入れない
  - 警告時間の計算 (3秒固定/3/4) をここに入れない (server 側の責務)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: frontline 抽出 + 左右探索 + widthCap 再探索の複雑な空間アルゴリズム
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 6)
  - **Parallel Group**: Wave 6 (with Tasks 10, 11)
  - **Blocks**: Tasks 13, 14, 16-43
  - **Blocked By**: Tasks 7, 8

  **References**:

  **Pattern References**:
  - `docs/plans/shared-dev-plan.md:1872-1908` — §7.5.6 planErosionWarning / applyErosionConversion の完全なシグネチャと詳細アルゴリズム
  - `docs/plans/shared-dev-plan.md:1885-1891` — frontline 抽出ルール (extractFrontlineCoords, selectFrontlineTargets, 左右探索, widthCap, 新 frontline 再探索)
  - `docs/plans/back/be-dev-plan.md:407-464` — §6 侵食システムの warning/convert サイクル管理と event タイミング

  **WHY Each Reference Matters**:
  - §7.5.6 の詳細コメントに frontline の定義 (「地雷原または荒地が周囲八マス以内に存在する Safe セル」) と左右探索ルールが完全に記載されている
  - be-dev-plan §6 には警告開始と同時に次 erosion_warn を enqueue する並行進行制御が記載されており、server 側との契約を理解するために必要

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test: planErosionWarning が frontline から正しく targetCoords を選定する
  - [ ] Test: widthCap に達したとき新 frontline を再探索する
  - [ ] Test: targetCoords に盤面上の Wasteland が含まれる
  - [ ] Test: applyErosionConversion が safeMineRatio / dangerousMineRatio に従って変換する
  - [ ] Test: applyErosionConversion 後の adjacentMineCount が正しく再計算される (0→非0 更新含む)
  - [ ] Test: 同一 seed で同一結果 (deterministic)
  - [ ] `pnpm --filter @detonator/rules-core test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Erosion warning and conversion cycle
    Tool: Bash (vitest)
    Preconditions: Tasks 1-8 complete
    Steps:
      1. pnpm --filter @detonator/rules-core test -- -t "erosion"
      2. Verify warning selection respects widthCap and includes Wasteland
      3. Verify conversion applies correct mine ratios
    Expected Result: All erosion tests pass
    Failure Indicators: WidthCap violation, wrong mine ratio, stale adjacent counts
    Evidence: .sisyphus/evidence/task-12-erosion-cycle.log
  ```

  **Commit**: YES
  - Message: `feat(rules-core): erosion warning planning and conversion application`
  - Files: `packages/rules-core/src/erosion/*.ts`, `packages/rules-core/test/erosion.test.ts`
  - Pre-commit: `pnpm --filter @detonator/rules-core test`

- [ ] 13. packages/rules-core — checkpoint + lifecycle (spawn/respawn/floor-transition)

  **What to do**:
  - `src/checkpoint/placement.ts`: selectCheckpointCoords — Hole 除外 / 初期安全ゾーン除外 / RNG による CP 配置 — shared-dev-plan §7.5.7
  - `src/checkpoint/detection.ts`: detectCheckpointsInRange, collectCheckpointOnOverlap — Euclidean 距離による検知 + overlap 回収 — shared-dev-plan §7.5.7
  - `src/lifecycle/spawn-selection.ts`: pickInitialSpawnAssignments (spawn group ベース割り当て), pickMidGameJoinSpawn (生存プレイヤー周辺ランダム) — shared-dev-plan §7.5.11
  - `src/lifecycle/respawn-placement.ts`: pickRespawnPlacement (ランダム生存プレイヤー周囲 + 荒地 fallback), shortenRespawnSchedule — shared-dev-plan §7.5.11
  - `src/lifecycle/floor-transition.ts`: buildFloorClearTransition (全CP→タイマー停止→地雷原消滅→保留キャンセル→全員復活→初期位置), buildNextFloorStartPlan (次ステージ grid 生成 + CP + spawn) — shared-dev-plan §7.5.11
  - `test/lifecycle.test.ts`: spawn 割り当て、respawn 配置、floor transition の golden test

  **Must NOT do**:
  - queue の直接操作をしない (canceledTimerKinds や spawnAssignments の plan を返すだけ)
  - server の Colyseus lifecycle hook を参照しない
  - floor transition の順序を api.md §フロア遷移と異ならせない

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: floor transition は全ゲームシステムの集約点。API 指定順序の遵守が必須
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 7)
  - **Parallel Group**: Wave 7 (with Task 14)
  - **Blocks**: Tasks 15-43
  - **Blocked By**: Tasks 7, 8, 9, 10, 11, 12

  **References**:

  **Pattern References**:
  - `docs/plans/shared-dev-plan.md:1910-1933` — §7.5.7 checkpoint シグネチャ
  - `docs/plans/shared-dev-plan.md:2008-2065` — §7.5.11 lifecycle 全関数シグネチャ
  - `docs/plans/shared-dev-plan.md:2131-2149` — §7.6 lifecycle 詳細 (spawn-selection, respawn-placement, floor-transition)
  - `docs/plans/back/be-dev-plan.md:467-526` — §7 CP・フロー管理のファイル構成・ステップ・event タイミング
  - `docs/plans/api.md` — §フロア遷移の API 指定順序 (全CP→タイマー停止→地雷原消滅→保留キャンセル→全員復活→初期位置→休憩→次フロア)

  **Config References**:
  - `docs/plans/shared-dev-plan.md:1158-1201` — stages.json (SpawnGroupDefinition, StageBoardProfile)

  **WHY Each Reference Matters**:
  - §7.5.11 には buildFloorClearTransition の canceledTimerKinds が全 8 種列挙されており、server が queue flush を行うための完全なリストとなる
  - api.md のフロア遷移順序は最終権威であり、buildFloorClearTransition のステップ順序を保証する
  - be-dev-plan §7 には CP 回収後の floor clear trigger と ScoreService 連携が記載されている

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test: selectCheckpointCoords が Hole と初期安全ゾーンを除外する
  - [ ] Test: collectCheckpointOnOverlap が重なった CP を正しく回収する
  - [ ] Test: pickInitialSpawnAssignments が spawn group に従って割り当てる
  - [ ] Test: pickMidGameJoinSpawn が生存プレイヤー周辺の安全マスを返す
  - [ ] Test: pickRespawnPlacement が荒地 fallback を返す (安全マスなし時)
  - [ ] Test: buildFloorClearTransition が API 指定順序の canceledTimerKinds を返す
  - [ ] Test: buildNextFloorStartPlan が grid + CP + spawn を返す
  - [ ] Test: shortenRespawnSchedule が正しく短縮する
  - [ ] `pnpm --filter @detonator/rules-core test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Floor clear transition order
    Tool: Bash (vitest)
    Preconditions: Tasks 1-12 complete
    Steps:
      1. pnpm --filter @detonator/rules-core test -- -t "floor-transition"
      2. Verify transition returns all 8 canceledTimerKinds
      3. Verify revivedPlayers includes all dead players
    Expected Result: Transition plan matches API-specified order
    Failure Indicators: Missing timer kind, wrong revive list
    Evidence: .sisyphus/evidence/task-13-floor-transition.log

  Scenario: Checkpoint placement excludes holes
    Tool: Bash (vitest)
    Preconditions: Tasks 1-12 complete
    Steps:
      1. pnpm --filter @detonator/rules-core test -- -t "checkpoint"
    Expected Result: No checkpoint placed on Hole or initial safe zone
    Failure Indicators: CP on invalid cell
    Evidence: .sisyphus/evidence/task-13-checkpoint-placement.log
  ```

  **Commit**: YES
  - Message: `feat(rules-core): checkpoint, spawn, respawn, and floor transition logic`
  - Files: `packages/rules-core/src/checkpoint/*.ts`, `packages/rules-core/src/lifecycle/*.ts`, `packages/rules-core/test/lifecycle.test.ts`
  - Pre-commit: `pnpm --filter @detonator/rules-core test`

- [ ] 14. packages/rules-core — reward (offer + apply) + scoring

  **What to do**:
  - `src/reward/reward-offer.ts`: buildRewardOffer — inventory 満杯除外、stack limit 除外、Chord uniquePerRun 除外、offerId + options[] 生成 — shared-dev-plan §7.5.12
  - `src/reward/reward-apply.ts`: applyRewardSelection — item 報酬 (inventory mutation) / skill 報酬 (stack 追加) の適用 — shared-dev-plan §7.5.12
  - `src/scoring/score.ts`: calculateFloorScore — floorExp × timeBonusMultiplier — shared-dev-plan §7.5.10
  - `test/reward.test.ts`: offer 生成除外条件、apply の state mutation、scoring の golden test

  **Must NOT do**:
  - pendingRewardCount の増減をここで行わない (server/schema 側の責務)
  - private send のロジックを入れない

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: reward の除外条件網羅 + inventory/skill の state mutation。複雑だがアルゴリズム的ではない
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 7)
  - **Parallel Group**: Wave 7 (with Task 13)
  - **Blocks**: Tasks 15-43
  - **Blocked By**: Tasks 7, 8, 9, 10, 11, 12

  **References**:

  **Pattern References**:
  - `docs/plans/shared-dev-plan.md:2067-2096` — §7.5.12 buildRewardOffer / applyRewardSelection の完全なシグネチャ
  - `docs/plans/shared-dev-plan.md:1995-2006` — §7.5.10 calculateFloorScore のシグネチャ
  - `docs/plans/shared-dev-plan.md:2151-2172` — §7.7 reward 詳細 (除外条件、inventory mutation、reward-apply)

  **Config References**:
  - `docs/plans/shared-dev-plan.md:1204-1247` — rewards.json (LevelUpRewardConfig, RewardPoolEntry)
  - `docs/plans/shared-dev-plan.md:823-1009` — items.json (stackable, maxStack, manualUse)
  - `docs/plans/shared-dev-plan.md:1011-1156` — skills.json (SkillDefinition, SkillValueRoll)

  **WHY Each Reference Matters**:
  - §7.7.1 には除外条件 (inventory 満杯、stack limit、Chord uniquePerRun) が完全に列挙されており、offer 生成の網羅性を担保する
  - rewards.json の itemPool / skillPool の構造が buildRewardOffer の入力型を決定する
  - items.json / skills.json の stackable / maxStack が inventory mutation の分岐条件となる

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test: buildRewardOffer が inventory 満杯時に item 報酬を除外する
  - [ ] Test: buildRewardOffer が stack limit 到達 skill を除外する
  - [ ] Test: buildRewardOffer が Chord を uniquePerRun で 1 回のみ許可する
  - [ ] Test: applyRewardSelection が item 報酬で inventory を更新する
  - [ ] Test: applyRewardSelection が skill 報酬で skillStacks に追加する
  - [ ] Test: calculateFloorScore が floorExp と timeBonus を正しく計算する
  - [ ] `pnpm --filter @detonator/rules-core test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Reward offer exclusion and apply
    Tool: Bash (vitest)
    Preconditions: Tasks 1-12 complete
    Steps:
      1. pnpm --filter @detonator/rules-core test -- -t "reward"
      2. Verify full inventory excludes item rewards
      3. Verify apply correctly mutates inventory/skill stacks
    Expected Result: All reward tests pass
    Failure Indicators: Missing exclusion, wrong inventory state
    Evidence: .sisyphus/evidence/task-14-reward.log

  Scenario: Floor score calculation
    Tool: Bash (vitest)
    Preconditions: Tasks 1-12 complete
    Steps:
      1. pnpm --filter @detonator/rules-core test -- -t "score"
    Expected Result: Score matches expected formula
    Failure Indicators: Wrong time bonus, incorrect multiplier
    Evidence: .sisyphus/evidence/task-14-scoring.log
  ```

  **Commit**: YES
  - Message: `feat(rules-core): reward offer/apply and floor scoring`
  - Files: `packages/rules-core/src/reward/*.ts`, `packages/rules-core/src/scoring/*.ts`, `packages/rules-core/test/reward.test.ts`
  - Pre-commit: `pnpm --filter @detonator/rules-core test`

- [ ] 15. Shared package integration review

  **What to do**:
  - 全 4 shared packages の export surface を検証: protocol (7 commands, 38 events, 14 items, 14 skills, 18 error codes), config (types + 5 JSON files), schema (8 classes + utils), rules-core (全 pure functions)
  - `packages/rules-core` から `packages/schema` への compile-time 依存がないことを確認
  - `packages/config` の validateConfig が全 JSON の整合性を通過することを確認
  - cross-package integration test: config → rules-core の data flow が正しく繋がること
  - golden test 追加: detonate / erosion / floor transition / reward の deterministic スナップショットテスト — shared-dev-plan §7.8 step 12

  **Must NOT do**:
  - apps/server / apps/client のコードに触らない
  - 新しい機能を追加しない (検証のみ)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 4 パッケージ横断の検証 + golden test 追加
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 8)
  - **Parallel Group**: Wave 8 (with Tasks 16, 17)
  - **Blocks**: Tasks 18-43
  - **Blocked By**: Tasks 1-14

  **References**:

  **Pattern References**:
  - `docs/plans/shared-dev-plan.md:2174-2188` — §7.8 rules-core 実装ステップ (step 12: golden test)
  - `docs/plans/shared-dev-plan.md:2200-2212` — §8 パッケージ横断実装順フェーズ7 (integration review)

  **WHY Each Reference Matters**:
  - §8 フェーズ7 に shared package integration review の完了条件が記載されており、server 実装へ渡せる状態かを判定する基準となる

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test: `pnpm test` が全 4 shared packages で PASS する
  - [ ] Test: cross-package integration test が config → rules-core の data flow を通す
  - [ ] Test: golden test が detonate / erosion / transition / reward のスナップショットを検証
  - [ ] `pnpm build` が全 4 shared packages で成功する

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full shared package validation
    Tool: Bash
    Preconditions: Tasks 1-14 complete
    Steps:
      1. pnpm test
      2. pnpm build
      3. Verify no cross-package type errors
    Expected Result: All tests pass, all builds succeed
    Failure Indicators: Type error, missing export, golden test mismatch
    Evidence: .sisyphus/evidence/task-15-shared-review.log
  ```

  **Commit**: YES
  - Message: `test(shared): integration review and golden tests for all shared packages`
  - Files: `packages/*/test/*.test.ts`
  - Pre-commit: `pnpm test && pnpm build`

- [ ] 16. apps/server — foundation (雛形 + config + rulesFacade + RoomContext + queue + private store)

  **What to do**:
  - `src/index.ts`: Colyseus server 起動、LobbyRoom / DetonatorRoom 登録
  - `src/config/loadRuntimeConfig.ts`: packages/config 読み込み + room 用設定オブジェクト化
  - `src/rules/rulesFacade.ts`: packages/rules-core の全関数を型安全に wrap する adapter — be-dev-plan §1
  - `src/rooms/detonator/context/RoomContext.ts`: room 内共有依存 (config, rulesFacade, PrivateStateStore, runtimePlayerStateBySessionId, EventQueue, clientRegistry, RNG, now provider)
  - `src/rooms/detonator/context/createRoomContext.ts`: onCreate 時の context 組み立て
  - `src/rooms/detonator/private/PrivateStateStore.ts`: sessionId → PrivatePlayerState (inventory, pendingRewardOffers)
  - `src/rooms/detonator/private/privateStateTypes.ts`: PrivatePlayerState / RuntimePlayerState 型定義 — be-dev-plan §11
  - `src/rooms/detonator/runtime/EventQueue.ts`: 7 種の絶対時刻キュー (detonate_resolve, unmanaged_chain, erosion_warn, erosion_convert, item_expiry, respawn, effect_expiry, future_event)
  - `src/rooms/detonator/runtime/QueueTypes.ts`: queue entry 型再 export
  - `src/rooms/detonator/runtime/CancellationIndex.ts`: detonate / item_expiry / respawn / effect_expiry の逆引き cancel
  - `src/rooms/detonator/runtime/QueueProcessor.ts`: due エントリ一括取り出し、同 tick 優先順位制御 (flush→convert→blast→death→expiry) — be-dev-plan §12.1
  - `src/rooms/detonator/runtime/SimulationLoop.ts`: fixed tick 更新と QueueProcessor 呼び出し
  - `src/rooms/detonator/messaging/publicEventSender.ts`: `this.broadcast` の型安全 wrapper
  - `src/rooms/detonator/messaging/privateEventSender.ts`: `client.send` による private event / inventory sync / reward replay
  - `src/rooms/detonator/messaging/sendError.ts`: error event 送信
  - `test/`: PrivateStateStore, EventQueue, CancellationIndex, QueueProcessor の unit test

  **Must NOT do**:
  - LobbyRoom / DetonatorRoom の gameplay 実装をしない (次タスク)
  - 7 コマンドの handler を登録しない
  - 共有パッケージのコードを変更しない

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 多数のインフラファイルだが各々は薄い wrapper。正確な型定義が必須
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 8)
  - **Parallel Group**: Wave 8 (with Tasks 15, 17)
  - **Blocks**: Tasks 18-43
  - **Blocked By**: Tasks 1-14

  **References**:

  **Pattern References**:
  - `docs/plans/back/be-dev-plan.md:14-96` — §1 ディレクトリ構成と共通ファイル責務テーブル
  - `docs/plans/back/be-dev-plan.md:100-116` — rulesFacade.ts が wrap する関数リスト
  - `docs/plans/back/be-dev-plan.md:765-811` — §11 Private State 全体方針 (PrivatePlayerState / RuntimePlayerState の分離)
  - `docs/plans/back/be-dev-plan.md:814-846` — §12 タイマーキュー処理計画 (7 種キュー + QueueProcessor 同 tick 競合ルール)

  **WHY Each Reference Matters**:
  - §1 に全ファイルの責務が明記されており、server インフラの完全な設計図となる
  - §11 に PrivatePlayerState と RuntimePlayerState の厳密な分離が定義されており、再接続時のリプレイ戦略を決定する
  - §12.1 に QueueProcessor の同 tick 優先順位 (flush→convert→blast→death→expiry) が定義されており、タイマー処理の正確性を担保する

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test: PrivateStateStore が inventory / pendingRewardOffers を正しく保持・削除する
  - [ ] Test: EventQueue が 7 種の entry を enqueue / dequeue できる
  - [ ] Test: CancellationIndex が detonate / item_expiry / respawn / effect_expiry を逆引き cancel する
  - [ ] Test: QueueProcessor が同 tick 優先順位 (flush > convert > blast > death > expiry) を正しく適用する
  - [ ] Test: future_event の同時発生上限 1 を保証する
  - [ ] `pnpm --filter @detonator/server test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Server infrastructure unit tests
    Tool: Bash (vitest)
    Preconditions: Tasks 1-15 complete
    Steps:
      1. pnpm --filter @detonator/server test
      2. Verify all infrastructure tests pass
    Expected Result: EventQueue, CancellationIndex, QueueProcessor, PrivateStateStore tests pass
    Failure Indicators: Missing queue type, wrong priority order, cancellation failure
    Evidence: .sisyphus/evidence/task-16-server-infra.log
  ```

  **Commit**: YES
  - Message: `feat(server): foundation — config, rulesFacade, RoomContext, queue, private store`
  - Files: `apps/server/src/**/*.ts`, `apps/server/test/*.test.ts`
  - Pre-commit: `pnpm --filter @detonator/server test`

- [ ] 17. CI/CD — lint + typecheck + test pipeline

  **What to do**:
  - GitHub Actions CI workflow を更新: lint → typecheck → test (全パッケージ) → build
  - Turborepo の `turbo.json` でパイプライン依存を正しく設定
  - `pnpm lint && pnpm typecheck && pnpm test && pnpm build` が CI で通ることを確認

  **Must NOT do**:
  - デプロイメントパイプラインを作らない (MVP 外)
  - E2E テストを CI に含めない (手動実行)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: CI 設定ファイルの更新のみ
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 8)
  - **Parallel Group**: Wave 8 (with Tasks 15, 16)
  - **Blocks**: Tasks 18-43 (間接: CI が通ることを全タスクの前提とする)
  - **Blocked By**: Tasks 1-14

  **References**:

  **Pattern References**:
  - `docs/plans/tech-stack.md:83-107` — セットアップチェックリスト

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] `pnpm lint` → 0 errors
  - [ ] `pnpm typecheck` → 0 errors
  - [ ] `pnpm test` → all pass
  - [ ] `pnpm build` → all build

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: CI pipeline passes
    Tool: Bash
    Preconditions: Tasks 1-14 complete
    Steps:
      1. pnpm lint && pnpm typecheck && pnpm test && pnpm build
    Expected Result: All commands exit 0
    Failure Indicators: Any non-zero exit
    Evidence: .sisyphus/evidence/task-17-ci-pipeline.log
  ```

  **Commit**: YES
  - Message: `ci: update lint/typecheck/test/build pipeline for all packages`
  - Files: `.github/workflows/ci.yml`, `turbo.json`
  - Pre-commit: `pnpm lint && pnpm typecheck`

- [ ] 18. Server — LobbyRoom + DetonatorRoom shell + FloorBootstrapService

  **What to do**:
  - `src/rooms/lobby/LobbyRoom.ts`: onCreate/onJoin/onLeave/onDispose、待機参加者管理 — be-dev-plan §3
  - `src/rooms/lobby/LobbyCoordinator.ts`: 開始条件判定
  - `src/rooms/lobby/LobbySeatReservationService.ts`: DetonatorRoom 作成と reservation 配布
  - `src/rooms/detonator/DetonatorRoom.ts`: onCreate (GameState 初期化、最初のフロア生成、queue/simulation 開始)、onDispose (simulation/timer/queue 解放) — be-dev-plan §3。**`process.env.TEST_MODE === 'true'` の場合、onCreate で 5 秒後に自動 `game_over(AllDead)` を発火するテストフックを追加すること** (Task 43 Playwright E2E で使用)
  - `src/rooms/detonator/systems/floor/FloorBootstrapService.ts`: buildFloor() — ステージ選定、grid/CP/initial spawn 構築 — be-dev-plan §7
  - `src/rooms/detonator/systems/life/DeathService.ts` (入口): resolveDeathAttempt, tryAvoidDeath (disposable_life → nine_lives 優先順) — be-dev-plan §9
  - `src/rooms/detonator/systems/checkpoint/CheckpointService.ts`: CP overlap 検出、回収、残数管理 — be-dev-plan §7
  - `test/`: LobbyRoom lifecycle, DetonatorRoom onCreate, FloorBootstrap, DeathService entry, TEST_MODE auto game_over の unit test

  **Must NOT do**:
  - 7 コマンドの handler を登録しない (次タスク)
  - SimulationLoop の tick 処理で gameplay を実行しない (骨格のみ)
  - DeathService の inventory loss / ghost / game over 判定は後回し (次タスク以降)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Room lifecycle + FloorBootstrap は全 gameplay の基盤。DeathService 入口は多数の system から参照されるクリティカルパス
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 9)
  - **Parallel Group**: Wave 9 (with Task 19)
  - **Blocks**: Tasks 20-43
  - **Blocked By**: Tasks 15, 16

  **References**:

  **Pattern References**:
  - `docs/plans/back/be-dev-plan.md:156-216` — §3 モジュール1: ルーム基盤・ライフサイクル
  - `docs/plans/back/be-dev-plan.md:467-526` — §7 モジュール5: CP・フロー管理
  - `docs/plans/back/be-dev-plan.md:638-699` — §9 モジュール7: 死亡・リスポーン (入口部分)
  - `docs/plans/back/be-dev-plan.md:134-144` — §2 全体実装順序のブロッカーA-F (FloorBootstrapService = ブロッカーB, DeathService = ブロッカーD, CheckpointService = ブロッカーE)

  **WHY Each Reference Matters**:
  - §3 に LobbyRoom/DetonatorRoom の onCreate/onJoin/onLeave/onDispose 骨格と event 送信タイミングが完全に定義されている
  - §2 のブロッカー図により FloorBootstrapService → CheckpointService → FloorTransitionService の依存順序が確定する

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test: LobbyRoom が onCreate で初期化され onJoin で参加者を管理する
  - [ ] Test: DetonatorRoom.onCreate が GameState + GridState + FloorState を正しく初期化する
  - [ ] Test: FloorBootstrapService.buildFloor() が rules-core の buildNextFloorStartPlan を呼び正しく grid を生成する
  - [ ] Test: DeathService.resolveDeathAttempt が致死判定の唯一の入口として機能する
  - [ ] Test: DeathService.tryAvoidDeath が disposable_life → nine_lives の優先順位を正しく処理する
  - [ ] Test: CheckpointService が CP overlap を検出し回収する
  - [ ] `pnpm --filter @detonator/server test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Room lifecycle and floor bootstrap
    Tool: Bash (vitest)
    Preconditions: Tasks 1-17 complete
    Steps:
      1. pnpm --filter @detonator/server test -- -t "room"
    Expected Result: LobbyRoom + DetonatorRoom + FloorBootstrap tests pass
    Failure Indicators: Missing state initialization, wrong grid dimensions
    Evidence: .sisyphus/evidence/task-18-room-bootstrap.log

  Scenario: Death service entry point
    Tool: Bash (vitest)
    Preconditions: Tasks 1-17 complete
    Steps:
      1. pnpm --filter @detonator/server test -- -t "death"
    Expected Result: resolveDeathAttempt and tryAvoidDeath tests pass
    Failure Indicators: Wrong avoidance priority, missing death cause
    Evidence: .sisyphus/evidence/task-18-death-entry.log
  ```

  **Commit**: YES
  - Message: `feat(server): LobbyRoom, DetonatorRoom shell, FloorBootstrap, DeathService entry, CheckpointService`
  - Files: `apps/server/src/rooms/**/*.ts`, `apps/server/src/rooms/detonator/systems/**/*.ts`, `apps/server/test/*.test.ts`
  - Pre-commit: `pnpm --filter @detonator/server test`

- [ ] 19. apps/client — foundation (Phaser + scenes + connection)

  **What to do**:
  - `apps/client` を Vite + Phaser + TypeScript で初期化 (packages/protocol, schema, config の alias)
  - `src/main.ts`: DOM mount + bootstrapClientApp() 呼び出し
  - `src/app/bootstrapClientApp.ts`: Client 初期化 + AppRuntime 初期化 + Phaser 起動
  - `src/app/createPhaserGame.ts`: canvas サイズ、scale mode、scene 登録
  - `src/app/AppRuntime.ts`: scene 間共有 runtime コンテナ (client, roomSession, selector, private store, audio, displayName)
  - `src/app/SceneKeys.ts`: Scene key 定数
  - `src/assets/AssetManifest.ts`: preload 対象アセット一覧
  - `src/scenes/BootScene.ts`: アセット preload、audio unlock overlay、初期遷移
  - `src/scenes/LobbyScene.ts`: LobbyRoom 接続と待機 UI shell
  - `src/scenes/GameScene.ts`: gameplay layer 組み立ての骨格
  - `src/scenes/RestScene.ts`: 休憩フェーズ骨格
  - `src/scenes/GameOverScene.ts`: 最終結果 UI 骨格
  - `src/net/createColyseusClient.ts`: 接続先 URL と SDK client 生成
  - `src/net/connection/LobbyConnectionService.ts`: joinOrCreate, consumeSeatReservation, joinById
  - `src/net/connection/RoomSessionService.ts`: current room, roomId, sessionId, displayName
  - `src/net/connection/reconnectController.ts`: 60秒再接続、offline/online 監視
  - `src/net/connection/sessionStorage.ts`: session 永続化
  - `src/styles/global.css`: body/canvas/overlay の共通 CSS
  - `test/setup.ts`, `test/fixtures/mockRoom.ts`: client unit test 初期化 + モック

  **Must NOT do**:
  - 盤面描画、HUD、入力モジュールを作らない (後続タスク)
  - Phaser scene に gameplay layer を組み込まない (骨格のみ)
  - アセット画像ファイルを作らない (プレースホルダーのみ)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Phaser/Vite プロジェクト初期化 + scene 遷移 + Colyseus SDK 接続
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: 描画テストは後続タスク
    - `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 9)
  - **Parallel Group**: Wave 9 (with Task 18)
  - **Blocks**: Tasks 20-43
  - **Blocked By**: Tasks 1-14

  **References**:

  **Pattern References**:
  - `docs/plans/front/fe-dev-plan.md:117-244` — §2 推奨ディレクトリ構成と共通ファイル責務
  - `docs/plans/front/fe-dev-plan.md:259-333` — §3 モジュール1: Phaserプロジェクト基盤 (実装ステップ 1-8)
  - `docs/plans/front/fe-dev-plan.md:104-116` — §1.5 ロビー遷移・再接続 (joinOrCreate, consumeSeatReservation, reconnect)

  **WHY Each Reference Matters**:
  - §3 に BootScene → LobbyScene → GameScene の scene 遷移骨格と reconnectController の実装ステップが完全に定義されている
  - AppRuntime は全 scene の依存コンテナであり、後続の board/player/HUD モジュールが参照する基盤となる

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test: mockRoom fixture が room.send / room.state を正しくモックする
  - [ ] Test: AppRuntime が client + roomSession + private store を正しく保持する
  - [ ] `pnpm --filter @detonator/client test` → PASS (infrastructure tests only)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Client build and dev server start
    Tool: Bash
    Preconditions: Tasks 1-14 complete
    Steps:
      1. pnpm --filter @detonator/client build
      2. Verify dist/ output exists
    Expected Result: Vite build succeeds
    Failure Indicators: TypeScript error, missing dependency
    Evidence: .sisyphus/evidence/task-19-client-build.log

  Scenario: Scene transition shell
    Tool: Bash (vitest)
    Preconditions: Tasks 1-14 complete
    Steps:
      1. pnpm --filter @detonator/client test
    Expected Result: Infrastructure tests pass
    Failure Indicators: Mock room failure, runtime init error
    Evidence: .sisyphus/evidence/task-19-client-infra.log
  ```

  **Commit**: YES
  - Message: `feat(client): Phaser foundation, scenes, Colyseus connection, and reconnect`
  - Files: `apps/client/src/**/*.ts`, `apps/client/index.html`, `apps/client/vite.config.ts`, `apps/client/tsconfig.json`, `apps/client/test/*.ts`
  - Pre-commit: `pnpm --filter @detonator/client build`

- [ ] 20. Server — JoinService + ReconnectService + command registration

  **What to do**:
  - `src/rooms/detonator/systems/session/JoinService.ts`: createFreshPlayer, createMidGameJoin (Lv1 / item なし / skill なし 初期化) — be-dev-plan §10
  - `src/rooms/detonator/systems/session/ReconnectService.ts`: handleDrop (PlayerLifeState.Disconnected + 60s deadline), handleReconnect (client registry 差し替え、危険位置補正、private resync), handleFinalLeave (voluntary/timeout 確定、player 削除) — be-dev-plan §10
  - `src/rooms/detonator/commands/registerCommandHandlers.ts`: 全 7 コマンドの `this.onMessage()` 登録 — be-dev-plan §4
  - `src/rooms/detonator/commands/commandGuards.ts`: phase / alive / slot / range / finite number 共通検証 — be-dev-plan §4.2.1
  - `src/rooms/detonator/commands/handleMove.ts`: 入力ベクトル受信、正規化、latest input 更新
  - `src/rooms/detonator/commands/handleDig.ts`: 掘削受付、SafeMine / DangerousMine 分岐
  - `src/rooms/detonator/commands/handleFlag.ts`: flag トグル
  - `src/rooms/detonator/commands/handleDetonate.ts`: CT/対象検証
  - `src/rooms/detonator/commands/handleUseItem.ts`: slot 参照、item effect dispatch
  - `src/rooms/detonator/commands/handleDiscardItem.ts`: inventory remove → ground drop
  - `src/rooms/detonator/commands/handleClaimReward.ts`: pending offer 検証と reward 適用
  - DetonatorRoom の onJoin/onDrop/onReconnect/onLeave を JoinService/ReconnectService に接続
  - `test/`: command guards, JoinService, ReconnectService の unit test

  **Must NOT do**:
  - handleDetonate の DetonateService 接続は次タスク
  - handleUseItem の item effect 実装は後続タスク
  - handleClaimReward の RewardService 接続は次タスク

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 7 コマンド handler + session management の大量のファイル。各 handler は薄いが網羅性が必須
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 10)
  - **Parallel Group**: Wave 10 (with Tasks 21, 22)
  - **Blocks**: Tasks 23-43
  - **Blocked By**: Task 18

  **References**:

  **Pattern References**:
  - `docs/plans/back/be-dev-plan.md:219-316` — §4 モジュール2: コマンドハンドラ (7 コマンド全てのバリデーション・拒否ケース・エラーコード)
  - `docs/plans/back/be-dev-plan.md:702-762` — §10 モジュール8: 途中参加・再接続 (join/reconnect/leave の実装ステップ)
  - `docs/plans/back/be-dev-plan.md:849-905` — §13 コマンド・イベントカバレッジマトリクス

  **WHY Each Reference Matters**:
  - §4.2.1 に全 7 コマンドの拒否ケースとエラーコードの完全テーブルがあり、handler の網羅性を担保する
  - §10 に mid-game join の初期化 (Lv1, 空 inventory, 空 skill stacks) と reconnect の private resync (inventory_updated + reward_offer replay) が定義されている

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test: commandGuards が全拒否ケースを正しく検出する (DIG_OUT_OF_RANGE, FLAG_INVALID_TARGET 等)
  - [ ] Test: JoinService.createMidGamePlayer が Lv1 / 空 inventory / 空 skill stacks を返す
  - [ ] Test: ReconnectService.handleReconnect が private resync を正しく行う
  - [ ] Test: handleMove が非有限数値を無視する
  - [ ] Test: handleDig が Chebyshev 距離 > 1 を DIG_OUT_OF_RANGE で拒否する
  - [ ] `pnpm --filter @detonator/server test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Command validation
    Tool: Bash (vitest)
    Preconditions: Tasks 1-19 complete
    Steps:
      1. pnpm --filter @detonator/server test -- -t "command"
    Expected Result: All command guard tests pass
    Failure Indicators: Missing rejection case, wrong error code
    Evidence: .sisyphus/evidence/task-20-commands.log

  Scenario: Session join and reconnect
    Tool: Bash (vitest)
    Preconditions: Tasks 1-19 complete
    Steps:
      1. pnpm --filter @detonator/server test -- -t "session"
    Expected Result: Join/reconnect tests pass
    Failure Indicators: Wrong initial state, missing resync
    Evidence: .sisyphus/evidence/task-20-session.log
  ```

  **Commit**: YES
  - Message: `feat(server): JoinService, ReconnectService, and 7 command handlers`
  - Files: `apps/server/src/rooms/detonator/systems/session/*.ts`, `apps/server/src/commands/*.ts`, `apps/server/test/*.test.ts`
  - Pre-commit: `pnpm --filter @detonator/server test`

- [ ] 21. Server — MovementSystem + move/dig/flag handlers (gameplay 接続)

  **What to do**:
  - `src/rooms/detonator/systems/movement/MovementSystem.ts`: SimulationLoop tick 内で latestMoveInput を読み、速度合成・向き補正・衝突解決を行い PlayerState.x/y/facing を更新 — be-dev-plan §4
  - handleMove → MovementSystem 接続: latestMoveInput を RuntimePlayerState に保持
  - handleDig → rules-core resolveDig 接続: SafeMine 開放 (flood-fill + EXP + drop) / DangerousMine 誤掘り (UnmanagedExplosionService へ委譲) — be-dev-plan §4
  - handleFlag → CellState.flagged 更新
  - movement tick 後に CheckpointService.collectIfTouched を呼び CP 回収判定
  - movement tick 後に DropService.autopickup を呼び item 取得判定
  - `test/`: MovementSystem, dig flow, flag flow の unit test

  **Must NOT do**:
  - detonate / use_item / claim_reward の gameplay 接続は別タスク
  - MovementSystem 内で CP 回収 / item 取得 の event 送信ロジックを書かない (service に委譲)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: MovementSystem は tick ごとに呼ばれるホットパス。dig → EXP → drop の連鎖フローを正確に接続する必要がある
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 10)
  - **Parallel Group**: Wave 10 (with Tasks 20, 22)
  - **Blocks**: Tasks 23-43
  - **Blocked By**: Task 18

  **References**:

  **Pattern References**:
  - `docs/plans/back/be-dev-plan.md:219-316` — §4 コマンドハンドラ (move/dig/flag の event 送信タイミング)
  - `docs/plans/back/be-dev-plan.md:304-316` — §4.7 イベント送信タイミング (move は schema patch のみ、dig は exp_gained/item_dropped、flag はなし)
  - `docs/plans/back/be-dev-plan.md:126-127` — §2 be-dev-plan step 5: MovementSystem + move/dig/flag

  **WHY Each Reference Matters**:
  - §4.7 に dig の成功/失敗時の event 送信が完全に定義されており、server が正しいタイミングで broadcast/private send を行うための契約となる

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test: MovementSystem が速度合成・向き補正・衝突解決を正しく行う
  - [ ] Test: handleDig が SafeMine で flood-fill + EXP + drop を正しく処理する
  - [ ] Test: handleDig が DangerousMine で unmanaged explosion を trigger する
  - [ ] Test: handleFlag が CellState.flagged を正しくトグルする
  - [ ] Test: CP 回収が movement tick 後に正しく判定される
  - [ ] `pnpm --filter @detonator/server test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Move → Dig → EXP → Drop flow
    Tool: Bash (vitest)
    Preconditions: Tasks 1-19 complete
    Steps:
      1. pnpm --filter @detonator/server test -- -t "movement"
    Expected Result: Movement + dig chain produces correct state changes
    Failure Indicators: Wrong position, missing EXP, wrong drop
    Evidence: .sisyphus/evidence/task-21-movement-dig.log
  ```

  **Commit**: YES
  - Message: `feat(server): MovementSystem, dig/flag gameplay, CP collection, item pickup`
  - Files: `apps/server/src/rooms/detonator/systems/movement/*.ts`, `apps/server/src/commands/handleDig.ts`, `apps/server/src/commands/handleFlag.ts`, `apps/server/test/*.test.ts`
  - Pre-commit: `pnpm --filter @detonator/server test`

- [ ] 22. Client — schema binding + selectors + private state store

  **What to do**:
  - `src/net/schema/bindGameState.ts`: room.state の差分監視 → selector 更新への橋渡し — fe-dev-plan §3
  - `src/net/schema/createSchemaSelectors.ts`: localPlayer, alivePlayers, checkpoints, groundItems, floor, phase 等の selector — fe-dev-plan §3
  - `src/state/private/privateStateTypes.ts`: inventory / pendingRewardOffers / catsEyeActive の型定義 — fe-dev-plan §1.3
  - `src/state/private/privateStateStore.ts`: private event 専用 state 更新 (inventory_updated, reward_offer, cats_eye_activated/expired) — fe-dev-plan §1.3
  - `src/state/view/createViewModels.ts`: schema + private store → UI view model 化
  - `src/state/view/selectors.ts`: HUD/board/player 用 selector 群
  - `src/net/events/registerRoomEventHandlers.ts`: 38 イベントの登録口 — fe-dev-plan §1.2
  - `src/net/events/handlers/errorEvents.ts`: error → toast / SFX
  - `src/net/events/handlers/presenceEvents.ts`: join/left/disconnect/reconnect 通知
  - `src/net/events/handlers/detonateEvents.ts`: detonate 系 FX 受信 (空ハンドラ骨格)
  - `src/net/events/handlers/unmanagedExplosionEvents.ts`: 管理外爆発 FX 受信 (空ハンドラ骨格)
  - `src/net/events/handlers/erosionEvents.ts`: 侵食 warning/apply 受信 (空ハンドラ骨格)
  - `src/net/events/handlers/checkpointEvents.ts`: cats eye / cp_collected 受信
  - `src/net/events/handlers/progressionEvents.ts`: exp/level/reward 受信
  - `src/net/events/handlers/itemEvents.ts`: item / inventory 受信
  - `src/net/events/handlers/lifeEvents.ts`: death / ghost / respawn 受信
  - `src/net/events/handlers/floorEvents.ts`: floor / score / game_over 受信
  - `test/privateStateStore.spec.ts`: private state 更新テスト
  - GameScene で bindGameState + registerRoomEventHandlers を呼び出す

  **Must NOT do**:
  - UI 描画コンポーネントを作らない
  - 空ハンドラ骨格以外の event 処理ロジックを書かない (後続タスク)
  - shared schema を private store に複製しない

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 38 event handler 骨格 + selector + private store の大量のファイル。正確な型定義が必須
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `git-master`: ココミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 10)
  - **Parallel Group**: Wave 10 (with Tasks 20, 21)
  - **Blocks**: Tasks 23-43
  - **Blocked By**: Task 19

  **References**:

  **Pattern References**:
  - `docs/plans/front/fe-dev-plan.md:43-75` — §1.2-1.3 38イベント受信責務表 + shared schema と privateStateStore の境界
  - `docs/plans/front/fe-dev-plan.md:1081-1123` — §11 38イベント受信責務表 (完全版)
  - `docs/plans/front/fe-dev-plan.md:1136-1179` — §13 Private State 管理方針

  **WHY Each Reference Matters**:
  - §11 に全 38 イベントの受信ファイルとアクションが 1 行も省略されず記載されており、handler の網羅性を担保する
  - §1.3 に privateStateStore が保持する 4 つの canonical state が明記されており、shared schema の複製を防ぐ

  **Acceptance Criteria**:

  **TDD Tests:**
  - [ ] Test: privateStateStore が inventory_updated で inventory を canonical 置換する
  - [ ] Test: privateStateStore が reward_offer で pendingRewardOffers に登録する
  - [ ] Test: privateStateStore が cats_eye_activated/expired で catsEyeActive を切替える
  - [ ] Test: createSchemaSelectors が localPlayer を正しく抽出する
  - [ ] Test: registerRoomEventHandlers が全 38 イベントを登録する
  - [ ] `pnpm --filter @detonator/client test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Schema binding and private store
    Tool: Bash (vitest)
    Preconditions: Tasks 1-14, 19 complete
    Steps:
      1. pnpm --filter @detonator/client test
    Expected Result: All binding/store/selector tests pass
    Failure Indicators: Missing event handler, wrong state update
    Evidence: .sisyphus/evidence/task-22-schema-binding.log
  ```

  **Commit**: YES
  - Message: `feat(client): schema binding, selectors, private state store, 38 event handlers`
  - Files: `apps/client/src/net/**/*.ts`, `apps/client/src/state/**/*.ts`, `apps/client/test/*.spec.ts`
  - Pre-commit: `pnpm --filter @detonator/client test`

- [ ] 23. Server — InventoryService + DropService + ExpService

  **What to do**:
  - `src/rooms/detonator/systems/item/InventoryService.ts`: inventory add/remove/consume/stack、private sync (`inventory_updated`) — be-dev-plan §8
  - `src/rooms/detonator/systems/item/DropService.ts`: ground item lifecycle (dig drop / discard drop / expiry / pickup / explosion destruction / erosion destruction)、`item_expiry` queue 管理 — be-dev-plan §8
  - `src/rooms/detonator/systems/progression/ExpService.ts`: EXP 加算 (dig / detonate combo)、閾値判定、`level_up` event 送信 — be-dev-plan §8
  - `test/`: inventory CRUD, stack logic, drop roll, autopickup, EXP threshold, level up trigger

  **Must NOT do**:
  - ItemEffectService dispatch は後続タスク
  - SkillService は後続タスク
  - `reward_offer` 生成は RewardService に委譲

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: inventory/drop/EXP は多数のサービス間連携だが各々は標準的な CRUD + event 送信
  - **Skills**: []
  - **Skills Evaluated but Omitted**: `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 11)
  - **Parallel Group**: Wave 11 (with Tasks 25, 26)
  - **Blocks**: Tasks 27-43
  - **Blocked By**: Tasks 20, 21

  **References**:
  - `docs/plans/back/be-dev-plan.md:529-636` — §8 アイテム・スキル・EXP
  - `docs/plans/shared-dev-plan.md:1936-1974` — §7.5.8-7.5.9 roll-drop / progression

  **Acceptance Criteria**:
  **TDD Tests:**
  - [ ] Test: InventoryService が stackable item をスタック加算し、新規 slot を消費しない
  - [ ] Test: InventoryService が `inventory_updated` を private send する
  - [ ] Test: DropService が dig drop で ground item を生成し `item_dropped` を broadcast する
  - [ ] Test: DropService が autopickup で `item_picked_up` を送信する
  - [ ] Test: ExpService が EXP 閾値超過で `level_up` を送信する
  - [ ] `pnpm --filter @detonator/server test` → PASS

  **QA Scenarios:**
  ```
  Scenario: Inventory + Drop + EXP flow
    Tool: Bash (vitest)
    Steps: pnpm --filter @detonator/server test -- -t "inventory|drop|exp"
    Expected: All service tests pass
    Evidence: .sisyphus/evidence/task-23-inventory-drop-exp.log
  ```

  **Commit**: YES
  - Message: `feat(server): InventoryService, DropService, ExpService`
  - Files: `apps/server/src/rooms/detonator/systems/item/InventoryService.ts`, `DropService.ts`, `apps/server/src/rooms/detonator/systems/progression/ExpService.ts`
  - Pre-commit: `pnpm --filter @detonator/server test`

- [ ] 24. Server — DeathService completion (inventory loss + ghost + game over) + CheckpointService full

  **What to do**:
  - DeathService 仕上げ: inventory 全ロスト + `inventory_updated` private send、`player_death` / `player_ghost` event 送信、生存数 0 で `game_over(reason: AllDead)` — be-dev-plan §9
  - DeathService で CancellationIndex を使い死亡時の `effect_expiry` を一括取消し (dash/cats_eye/erosion_pause/disposable_life クリア) — be-dev-plan §9.6
  - CheckpointService full: onAllCheckpointsCollected で floor clear trigger、残数管理 — be-dev-plan §7
  - `test/`: death inventory clear, ghost transition, all-dead game over, CP collection → floor clear

  **Must NOT do**:
  - RespawnService は次タスク
  - FloorTransitionService は次タスク

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: game_over 判定は全ゲームの終了条件。CancellationIndex との連携が複雑
  - **Skills**: []
  - **Skills Evaluated but Omitted**: `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 12)
  - **Parallel Group**: Wave 12 (with Tasks 27, 28, 29, 30)
  - **Blocks**: Tasks 27-43
  - **Blocked By**: Tasks 21, 23

  **References**:
  - `docs/plans/back/be-dev-plan.md:638-699` — §9 死亡・リスポーン
  - `docs/plans/back/be-dev-plan.md:467-526` — §7 CP・フロー管理

  **Acceptance Criteria**:
  **TDD Tests:**
  - [ ] Test: 死亡時に inventory が全ロストし `inventory_updated` が送信される
  - [ ] Test: `player_death` → `player_ghost` の順で event が送信される
  - [ ] Test: 生存数 0 で `game_over(reason: AllDead)` が送信される
  - [ ] Test: CP 全回収で floor clear が trigger される
  - [ ] `pnpm --filter @detonator/server test` → PASS

  **QA Scenarios:**
  ```
  Scenario: Death and floor clear
    Tool: Bash (vitest)
    Steps: pnpm --filter @detonator/server test -- -t "death|checkpoint"
    Expected: Death flow + floor clear trigger tests pass
    Evidence: .sisyphus/evidence/task-24-death-checkpoint.log
  ```

  **Commit**: YES
  - Message: `feat(server): DeathService completion and CheckpointService full flow`
  - Files: `apps/server/src/rooms/detonator/systems/life/DeathService.ts`, `apps/server/src/rooms/detonator/systems/checkpoint/CheckpointService.ts`
  - Pre-commit: `pnpm --filter @detonator/server test`

- [ ] 25. Client — board rendering (GridLayer + NumberTextLayer + CameraController)

  **What to do**:
  - `src/render/board/BoardCoordinateMapper.ts`: grid ↔ world ↔ screen 座標変換 — fe-dev-plan §4
  - `src/render/board/CellSpriteFactory.ts`: CellType ごとのタイル/フレーム決定 (Safe=明るい開放タイル, SafeMine/DangerousMine=同一閉じた地雷原スキン, Wasteland=ひび割れ, Hole=黒い穴)
  - `src/render/board/GridLayer.ts`: セルタイル描画と CellType 差分更新
  - `src/render/board/NumberTextLayer.ts`: `adjacentMineCount` 数字描画 (1=#4FC3F7, 2=#66BB6A, ..., 8=#ECEFF1)、erosionWarning 時は outline 黄系
  - `src/render/board/CameraController.ts`: ローカルプレイヤー中心追従、dead-zone、スマホ用オフセット (画面中心よりやや上)
  - `test/`: coordinate mapping round-trip, CellType sprite selection, number color mapping

  **Must NOT do**:
  - CpLayer, GroundItemLayer は次タスク
  - PlayerLayer は次タスク
  - FX レイヤーは後続タスク

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Phaser 描画レイヤー + 座標変換の視覚エンジニアリング
  - **Skills**: []
  - **Skills Evaluated but Omitted**: `playwright`: 描画テストは後続; `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 11)
  - **Parallel Group**: Wave 11 (with Tasks 23, 26)
  - **Blocks**: Tasks 27-43
  - **Blocked By**: Task 22

  **References**:
  - `docs/plans/front/fe-dev-plan.md:335-487` — §4 モジュール2: 盤面描画

  **Acceptance Criteria**:
  **TDD Tests:**
  - [ ] Test: BoardCoordinateMapper の grid↔world ラウンドトリップが正しい
  - [ ] Test: CellSpriteFactory が SafeMine と DangerousMine に同一スキンを返す
  - [ ] Test: NumberTextLayer が 0 を描画せず 1-8 を正しい色で描画する
  - [ ] `pnpm --filter @detonator/client test` → PASS

  **QA Scenarios:**
  ```
  Scenario: Board rendering build
    Tool: Bash
    Steps: pnpm --filter @detonator/client build
    Expected: Build succeeds with all render modules
    Evidence: .sisyphus/evidence/task-25-board-render.log
  ```

  **Commit**: YES
  - Message: `feat(client): board rendering — GridLayer, NumberTextLayer, CameraController`
  - Files: `apps/client/src/render/board/*.ts`, `apps/client/test/*.spec.ts`
  - Pre-commit: `pnpm --filter @detonator/client test`

- [ ] 26. Client — PlayerLayer + input (Keyboard + Joystick + ActionButtons)

  **What to do**:
  - `src/render/player/PlayerLayer.ts`: `sessionId → PlayerSprite` 管理
  - `src/render/player/PlayerSprite.ts`: 8方向フレーム、Ghost=0.45 alpha + 青白輪郭、Disconnected=desaturate + 点滅
  - `src/render/player/PlayerNameLabel.ts`: displayName 頭上ラベル (outline 付き)
  - `src/render/player/LocalPlayerMarker.ts`: 自分マーカー / 選択リング
  - `src/input/KeyboardController.ts`: WASD/J/K/Space/数字 1〜0 の raw intent 発火
  - `src/input/VirtualJoystick.ts`: 左下固定アナログジョイスティック (dead-zone あり、最大半径=1.0)
  - `src/input/ActionButtons.ts`: 右下 Dig/Flag/Detonate ボタン (GamePhase.Playing 以外は disabled)
  - `test/`: player sprite state transitions, keyboard key mappings, joystick dead-zone

  **Must NOT do**:
  - inputMapper / CommandDispatcher は次タスク
  - targetingController は次タスク

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Phaser sprite 描画 + 入力デバイス抽象
  - **Skills**: []
  - **Skills Evaluated but Omitted**: `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 11)
  - **Parallel Group**: Wave 11 (with Tasks 23, 25)
  - **Blocks**: Tasks 27-43
  - **Blocked By**: Tasks 19, 22

  **References**:
  - `docs/plans/front/fe-dev-plan.md:488-621` — §5 モジュール3: プレイヤー描画・操作

  **Acceptance Criteria**:
  **TDD Tests:**
  - [ ] Test: PlayerSprite が Alive/Ghost/Disconnected の表示を切り替える
  - [ ] Test: KeyboardController が正しいキー → raw intent マッピングを持つ
  - [ ] Test: VirtualJoystick が dead-zone 内で (0,0) を emit する
  - [ ] `pnpm --filter @detonator/client test` → PASS

  **QA Scenarios:**
  ```
  Scenario: Player rendering and input
    Tool: Bash (vitest)
    Steps: pnpm --filter @detonator/client test -- -t "player|input"
    Expected: All player/input tests pass
    Evidence: .sisyphus/evidence/task-26-player-input.log
  ```

  **Commit**: YES
  - Message: `feat(client): PlayerLayer rendering and input devices (Keyboard + Joystick + Buttons)`
  - Files: `apps/client/src/render/player/*.ts`, `apps/client/src/input/KeyboardController.ts`, `VirtualJoystick.ts`, `ActionButtons.ts`
  - Pre-commit: `pnpm --filter @detonator/client test`

- [ ] 27. Server — DetonateService + UnmanagedExplosionService

  **What to do**:
  - `src/rooms/detonator/systems/explosion/DetonateService.ts`: scheduleFuse (preview + fuse event 送信), resolveDueFuses (due batch 順不同処理), applyChainStep (125ms MST 連鎖), CancellationIndex による fuse cancel — be-dev-plan §5
  - `src/rooms/detonator/systems/explosion/UnmanagedExplosionService.ts`: triggerFromDig (誤掘り即時爆発), processQueue (BFS 連鎖 125ms 間隔) — be-dev-plan §5
  - 盤面変換時の旗/RelayPoint/groundItem 破壊と cancel hook を結線
  - `test/`: fuse scheduling, chain step, BFS chain, death delegation, ground item destruction

  **Must NOT do**:
  - ErosionService は並行タスク

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 2 パイプラインの爆発システムはゲームの核心。chain step の 125ms 順序と同 tick 複数 due 処理が複雑
  - **Skills**: []
  - **Skills Evaluated but Omitted**: `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 12)
  - **Parallel Group**: Wave 12 (with Tasks 28, 29, 30)
  - **Blocks**: Tasks 31-43
  - **Blocked By**: Tasks 21, 22

**References**:
  - `docs/plans/back/be-dev-plan.md:319-404` — §5 爆発システム

  **Acceptance Criteria**:
  **TDD Tests:**
  - [ ] Test: scheduleFuse が preview + fuse event を送信する
  - [ ] Test: resolveDueFuses が 3.0s fuse 後に MST を再計算し chain を処理する
  - [ ] Test: triggerFromDig が誤掘りで即時 blast + wasteland を適用する
  - [ ] Test: 同 tick 複数 due が順不同で逐次処理される
  - [ ] `pnpm --filter @detonator/server test` → PASS

  **QA Scenarios:**
  ```
  Scenario: Explosion systems
    Tool: Bash (vitest)
    Steps: pnpm --filter @detonator/server test -- -t "detonate|explosion"
    Expected: All explosion tests pass
    Evidence: .sisyphus/evidence/task-27-explosion.log
  ```

  **Commit**: YES
  - Message: `feat(server): DetonateService and UnmanagedExplosionService`
  - Files: `apps/server/src/rooms/detonator/systems/explosion/*.ts`
  - Pre-commit: `pnpm --filter @detonator/server test`

- [ ] 28. Server — ErosionService

  **What to do**:
  - `src/rooms/detonator/systems/erosion/ErosionService.ts`: scheduleInitialErosionCycle, runWarningPhase (frontline + left-right search + Wasteland + countdown), runConvertPhase (SafeMine/DangerousMine ratio, 警告時間: 4s以上→3s固定, 4s未満→3/4), pauseErosion/resumeErosion, floor clear flush — be-dev-plan §6
  - 警告開始と同時に次 `erosion_warn` を enqueue する並行進行制御
  - `test/`: warning target selection, conversion ratio, pause/resume, floor clear cancel

  **Must NOT do**:
  - Item effects は後続タスク

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 侵食は frontline 抽出 + 左右探索 + 並行進行制御の複雑なシステム
  - **Skills**: []
  - **Skills Evaluated but Omitted**: `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 12)
  - **Parallel Group**: Wave 12 (with Tasks 27, 29, 30)
  - **Blocks**: Tasks 31-43
  - **Blocked By**: Tasks 21, 22

**References**:
  - `docs/plans/back/be-dev-plan.md:407-464` — §6 侵食システム

  **Acceptance Criteria**:
  **TDD Tests:**
  - [ ] Test: runWarningPhase が frontline から正しく targetCoords を選定する
  - [ ] Test: runConvertPhase が safeMineRatio/dangerousMineRatio を適用する
  - [ ] Test: pauseErosion で warning/convert が defer される
  - [ ] Test: floor clear で全 erosion timer が flush される
  - [ ] `pnpm --filter @detonator/server test` → PASS

  **QA Scenarios:**
  ```
  Scenario: Erosion system
    Tool: Bash (vitest)
    Steps: pnpm --filter @detonator/server test -- -t "erosion"
    Expected: All erosion tests pass
    Evidence: .sisyphus/evidence/task-28-erosion.log
  ```

  **Commit**: YES
  - Message: `feat(server): ErosionService with warning, conversion, and pause control`
  - Files: `apps/server/src/rooms/detonator/systems/erosion/ErosionService.ts`
  - Pre-commit: `pnpm --filter @detonator/server test`

- [ ] 29. Client — inputMapper + CommandDispatcher + facingResolver

  **What to do**:
  - `src/input/facingResolver.ts`: Facing8 判定 (角度→45° octant)、Facing4 射影 (abs 比較 + jitter 防止) — fe-dev-plan §14
  - `src/input/inputMapper.ts`: raw intent → 7 commands 正規化 (move: len>1 normalize, dead-zone; dig/flag/detonate: Facing8 + offset; mine_remover/purify: Facing4; relay_point/bridge: targeting mode) — fe-dev-plan §14.2-14.5
  - `src/input/CommandDispatcher.ts`: `room.send()` の型安全薄ラッパ
  - `src/input/targetingController.ts`: relay_point / bridge の盤面タップ targetCoord 確定
  - `test/facingResolver.spec.ts`, `test/inputMapper.spec.ts`: Facing8/Facing4 判定、move 正規化、command dispatch

  **Must NOT do**:
  - HUD コンポーネントは別タスク

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 入力正規化ロジックは純関数が多く unit test で検証しやすい
  - **Skills**: []
  - **Skills Evaluated but Omitted**: `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 12)
  - **Parallel Group**: Wave 12 (with Tasks 27, 28, 30)
  - **Blocks**: Tasks 31-43
  - **Blocked By**: Tasks 19, 22, 26

  **References**:
  - `docs/plans/front/fe-dev-plan.md:563-621` — §5.7 inputMapper 正規化フロー
  - `docs/plans/front/fe-dev-plan.md:1181-1260` — §14 入力正規化仕様

  **Acceptance Criteria**:
  **TDD Tests:**
  - [ ] Test: move 正規化 (len>1 → normalize, dead-zone → 0,0)
  - [ ] Test: Facing8 が 45° octant を正しく判定 (8 方向)
  - [ ] Test: Facing4 が abs 大きい軸を採用し jitter を防ぐ
  - [ ] Test: targetingController が enter/exit で targeting mode を切り替える
  - [ ] `pnpm --filter @detonator/client test` → PASS

  **QA Scenarios:**
  ```
  Scenario: Input normalization
    Tool: Bash (vitest)
    Steps: pnpm --filter @detonator/client test -- -t "input|facing"
    Expected: All input normalization tests pass
    Evidence: .sisyphus/evidence/task-29-input-normalization.log
  ```

  **Commit**: YES
  - Message: `feat(client): inputMapper, CommandDispatcher, facingResolver, targetingController`
  - Files: `apps/client/src/input/*.ts`, `apps/client/test/*.spec.ts`
  - Pre-commit: `pnpm --filter @detonator/client test`

- [ ] 30. Client — HUD (PlayerHudPanel + ExpBar + ScorePanel + Inventory)

   **What to do**:
   - `src/ui/hud/PlayerHudPanel.ts`: level / lifeState / respawnAt countdown / pendingRewardCount — fe-dev-plan §8.3. **DOM コンテナに `data-testid="player-hud-panel"` を付与すること** (Task 43 Playwright E2E で使用)
   - `src/ui/hud/ExpBar.ts`: EXP ゲージ描画
   - `src/ui/hud/InventoryBar.ts`: 3〜10枠スロット一覧 (icon/stack/hotkey/discard/target mark) — fe-dev-plan §8.4
   - `src/ui/hud/InventorySlotButton.ts`: 個別スロット UI + 長押しポップアップ (item name/description/use/discard)
   - `src/ui/hud/ScorePanel.ts`: totalScore 常時 + floorScore 加算アニメーション
   - `src/ui/hud/FloorInfoPanel.ts`: floorNumber / phase / stageId
   - `test/`: HUD state updates from schema

  **Must NOT do**:
  - RewardOfferPanel は次タスク
  - NotificationToast は次タスク

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Phaser HUD コンポーネント + アニメーション
  - **Skills**: []
  - **Skills Evaluated but Omitted**: `git-master`: コミットは最後

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 12)
  - **Parallel Group**: Wave 12 (with Tasks 27, 28, 29)
  - **Blocks**: Tasks 31-43
  - **Blocked By**: Tasks 19, 22

  **References**:
  - `docs/plans/front/fe-dev-plan.md:783-903` — §8 モジュール6: HUD・インベントリ

  **Acceptance Criteria**:
  **TDD Tests:**
  - [ ] Test: PlayerHudPanel が schema 差分で正しく更新される
  - [ ] Test: InventoryBar が `inventory_updated` で canonical 置換を行う
  - [ ] Test: ScorePanel が `score_updated` でアニメーション更新を行う
  - [ ] `pnpm --filter @detonator/client test` → PASS

  **QA Scenarios:**
  ```
  Scenario: HUD components
    Tool: Bash (vitest)
    Steps: pnpm --filter @detonator/client test -- -t "hud"
    Expected: All HUD tests pass
    Evidence: .sisyphus/evidence/task-30-hud.log
  ```

  **Commit**: YES
  - Message: `feat(client): HUD — PlayerHudPanel, ExpBar, InventoryBar, ScorePanel, FloorInfoPanel`
  - Files: `apps/client/src/ui/hud/*.ts`
  - Pre-commit: `pnpm --filter @detonator/client test`

- [ ] 31. Server — RespawnService + DeathService completion

  **What to do**:
  - `src/rooms/detonator/systems/life/RespawnService.ts`: scheduleRespawn, resolveRespawn (spawn 補正 + `player_respawned` event), shortenAllPendingRespawns — be-dev-plan §9
  - DeathService 完成補完: CancellationIndex で死亡時 `effect_expiry` 一括取消 (dash/cats_eye/erosion_pause/disposable_life クリア)
  - `test/`: respawn scheduling, spawn correction, death effect cleanup, shorten calculation

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: respawn は queue + spawn 配置の標準的なサービス実装
  - **Skills**: []
  - **Parallelization**: Wave 13 (with 33-35), blocked by 24, 27, 28
  - **References**: `docs/plans/back/be-dev-plan.md:638-699` — §9

  **Acceptance Criteria**:
  **TDD Tests:**
  - [ ] Test: scheduleRespawn が `respawn` queue に entry を追加する
  - [ ] Test: resolveRespawn が spawn 座標を決定し `player_respawned` を送信する
  - [ ] Test: shortenAllPendingRespawns が全保留 respawn を短縮する
  - [ ] Test: 死亡時の effect_expiry が CancellationIndex で一括取消される
  - [ ] `pnpm --filter @detonator/server test` → PASS

  **QA Scenarios:**
  ```
  Scenario: Respawn flow
    Tool: Bash (vitest)
    Preconditions: Tasks 1-30 complete
    Steps:
      1. pnpm --filter @detonator/server test -- -t "respawn"
    Expected Result: Respawn + death cleanup tests pass
    Failure Indicators: Missing respawn entry, stale effect after death
    Evidence: .sisyphus/evidence/task-31-respawn.log
  ```

  **Commit**: YES
  - Message: `feat(server): RespawnService and DeathService completion with effect cleanup`
  - Pre-commit: `pnpm --filter @detonator/server test`

- [ ] 32. Server — FloorTransitionService + ScoreService

  **What to do**:
  - `src/rooms/detonator/systems/floor/FloorTransitionService.ts`: runFloorClearTransition (API 指定順序: 全CP→タイマー停止→地雷原消滅→保留キャンセル→全員復活→初期位置→休憩→次フロア) — be-dev-plan §7
  - `src/rooms/detonator/systems/floor/ScoreService.ts`: floor score + time bonus → `score_updated` event
  - Floor10 クリア時: `game_over(reason: Floor10Cleared)` — be-dev-plan §7
  - `test/`: floor clear transition order, score calculation, Floor10 game over

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: floor transition は全ゲームシステムの集約点。API 指定順序の遵守が必須
  - **Skills**: []
  - **Parallelization**: Wave 14 (with 36-40), blocked by 24, 28, 31
  - **References**: `docs/plans/back/be-dev-plan.md:467-526` — §7

**Acceptance Criteria**:
**TDD Tests:**
  - [ ] Test: floor clear が API 指定順序で進行する (CP → timer stop → mine clear → cancel → revive → rest → next)
  - [ ] Test: ScoreService が floorExp × timeBonus を正しく計算する
  - [ ] Test: Floor10 で `game_over(Floor10Cleared)` が送信される
  - [ ] `pnpm --filter @detonator/server test` → PASS

**QA Scenarios:**
  ```
  Scenario: Floor transition and score
    Tool: Bash (vitest)
    Preconditions: Tasks 1-35 complete
    Steps:
      1. pnpm --filter @detonator/server test -- -t "floor|score"
    Expected Result: Floor transition order correct, score calculation accurate
    Failure Indicators: Wrong transition order, incorrect time bonus
    Evidence: .sisyphus/evidence/task-32-floor-transition.log
  ```

  **Commit**: YES
  - Message: `feat(server): FloorTransitionService, ScoreService, and Floor10 game over`
  - Pre-commit: `pnpm --filter @detonator/server test`

- [ ] 33. Server — RewardService + SkillService

  **What to do**:
  - `src/rooms/detonator/systems/progression/RewardService.ts`: level up 時の offer 生成、`reward_offer` private send、claim_reward 検証と適用 — be-dev-plan §8
  - `src/rooms/detonator/systems/progression/SkillService.ts`: passive skill stack 管理、`aggregateSkillModifiers` 呼び出し (CT/speed/drop/detection/respawn 補正値算出) — be-dev-plan §8
  - `test/`: reward offer generation with exclusion, claim validation, skill stack aggregation

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - **Parallelization**: Wave 13 (with 31, 34, 35), blocked by 23, 24
  - **References**: `docs/plans/back/be-dev-plan.md:529-636` — §8

  **Acceptance Criteria**:
  **TDD Tests:**
  - [ ] Test: RewardService が level up で `reward_offer` を生成・送信する
  - [ ] Test: claim_reward が offerId/optionIndex を検証し適用する
  - [ ] Test: SkillService が aggregateSkillModifiers の結果を提供する
  - [ ] `pnpm --filter @detonator/server test` → PASS

  **QA Scenarios:**
  ```
  Scenario: Reward offer and skill service
    Tool: Bash (vitest)
    Preconditions: Tasks 1-32 complete
    Steps:
      1. pnpm --filter @detonator/server test -- -t "reward|skill"
    Expected Result: Offer generation with exclusion conditions, skill modifier aggregation
    Failure Indicators: Missing exclusion, wrong modifier value
    Evidence: .sisyphus/evidence/task-33-reward-skill.log
  ```

  **Commit**: YES
  - Message: `feat(server): RewardService and SkillService`
  - Pre-commit: `pnpm --filter @detonator/server test`

- [ ] 34. Client — CpLayer + visibility + GroundItemLayer

  **What to do**:
  - `src/utils/visibility.ts`: isCheckpointVisible (dist² ≤ R² Euclidean), getVisibleCheckpointIds, catsEyeActive bypass — fe-dev-plan §1.1, §4.5
  - `src/render/board/CpLayer.ts`: 通常=dim glow local-only, Cat's Eye=team-shared yellow aura + pulse — fe-dev-plan §4.5
  - `src/render/board/GroundItemLayer.ts`: groundItemId-keyed sprite 管理 (add/remove/expiry blink) — fe-dev-plan §4.6
  - `test/visibility.spec.ts`: distance check, catsEye bypass

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - **Parallelization**: Wave 13 (with 31, 33, 35), blocked by 22, 25
  - **References**: `docs/plans/front/fe-dev-plan.md:406-446` — §4.5-4.6

  **Acceptance Criteria**:
  **TDD Tests:**
  - [ ] Test: isCheckpointVisible が Euclidean dist² ≤ R² を正しく判定
  - [ ] Test: catsEyeActive=true で全未回収 CP が visible
  - [ ] Test: GroundItemLayer が add/remove を正しく同期
  - [ ] `pnpm --filter @detonator/client test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: CP visibility and ground item sync
    Tool: Bash (vitest)
    Preconditions: Tasks 1-33 complete
    Steps:
      1. pnpm --filter @detonator/client test -- -t "visibility|cp|ground"
    Expected Result: Visibility distance check and ground item sync tests pass
    Failure Indicators: Wrong distance calculation, missing item removal
    Evidence: .sisyphus/evidence/task-34-cp-grounditem.log
  ```

  **Commit**: YES
  - Message: `feat(client): CpLayer, visibility utils, and GroundItemLayer`
  - Pre-commit: `pnpm --filter @detonator/client test`

- [ ] 35. Client — FX (Detonate + Unmanaged + Erosion + ScreenFx)

  **What to do**:
  - `src/render/fx/FxTimelineStore.ts`: sourceCoord/epicenterCoord ごとの一時 FX キャッシュ
  - `src/render/fx/DetonateFxLayer.ts`: provisional path (点線) + fuse countdown + chain step (125ms 発火) + resolved (残光) + fuse canceled (即消去) — fe-dev-plan §6.3
  - `src/render/fx/UnmanagedExplosionFxLayer.ts`: shockwave ring + wasteland morph + chain step (chainDepth で音量/明るさ調整) — fe-dev-plan §6.4
  - `src/render/fx/ErosionFxLayer.ts`: warning overlay (黄〜橙) + countdown + conversion (別色発光) + pause badge — fe-dev-plan §7.3
  - `src/render/fx/ScreenFxController.ts`: shake (Detonate=小, Unmanaged=大, Erosion=中) + flash (white/orange/green) — fe-dev-plan §6.5

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - **Parallelization**: Wave 13 (with 31, 33, 34), blocked by 22, 25
  - **References**: `docs/plans/front/fe-dev-plan.md:623-781` — §6-7

  **Acceptance Criteria**:
  **TDD Tests:**
  - [ ] Test: FxTimelineStore が sourceCoord ごとのキャッシュを管理する
  - [ ] Test: DetonateFxLayer が fuse canceled で即消去する
  - [ ] `pnpm --filter @detonator/client test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: FX timeline cache management
    Tool: Bash (vitest)
    Preconditions: Tasks 1-30 complete
    Steps:
      1. pnpm --filter @detonator/client test -- -t "fx"
    Expected Result: FxTimelineStore cache management tests pass
    Failure Indicators: Cache not cleared on resolved, stale entries
    Evidence: .sisyphus/evidence/task-35-fx-timeline.log

  Scenario: Detonate FX cancel flow
    Tool: Bash (vitest)
    Preconditions: Tasks 1-30 complete
    Steps:
      1. pnpm --filter @detonator/client test -- -t "cancel"
    Expected Result: Fuse canceled clears provisional path and countdown
    Failure Indicators: Leftover FX state after cancel event
    Evidence: .sisyphus/evidence/task-35-fx-cancel.log
  ```

  **Commit**: YES
  - Message: `feat(client): FX layers — Detonate, Unmanaged, Erosion, ScreenFx`
  - Pre-commit: `pnpm --filter @detonator/client test`

- [ ] 36. Server — 13 use_item effects + use_item completion (nine_lives は DeathService 管轄)

  **What to do**:
  - `src/rooms/detonator/systems/item/ItemEffectService.ts`: item type ごとの dispatch — be-dev-plan §8。**nine_lives (ItemType.NineLives) は manualUse=false のため ItemEffectService では扱わない。nine_lives の発動は DeathService.tryAvoidDeath で処理済み (Task 18/24/31 で実装)。ItemEffectService は残り 13 種の use_item を dispatch する**
  - `src/rooms/detonator/systems/item/effect/RelayPointEffect.ts`: Safe 限定、点火始点にも使用可
  - `src/rooms/detonator/systems/item/effect/DashEffect.ts`: 15秒速度1.5倍、`effect_expiry` queue
  - `src/rooms/detonator/systems/item/effect/ForceIgnitionEffect.ts`: 次回 detonate CT 無視
  - `src/rooms/detonator/systems/item/effect/MineRemoverEffect.ts`: 3種 (cheap/normal/high) 共通処理、Facing4 使用
  - `src/rooms/detonator/systems/item/effect/PurifyEffect.ts`: 前方1マス wasteland → safe
  - `src/rooms/detonator/systems/item/effect/CatsEyeEffect.ts`: 全未回収 CP チーム共有表示、`cats_eye_activated/expired` event
  - `src/rooms/detonator/systems/item/effect/EvacuationEffect.ts`: respawn 地点へ瞬間移動 (rules-core spawn-selection 使用)
  - `src/rooms/detonator/systems/item/effect/ErosionPauseEffect.ts`: take_a_breath (短時間) / short_break (長時間)、`erosion_pause` effect
  - `src/rooms/detonator/systems/item/effect/BridgeEffect.ts`: Hole → Safe
  - `src/rooms/detonator/systems/item/effect/DisposableLifeEffect.ts`: 手動使用で死亡回避バフ付与、`effect_expiry` queue
  - `handleUseItem.ts` を ItemEffectService に接続 — be-dev-plan §8.8
  - `test/`: 各 effect の unit test (nine_lives を除く 13 種)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    -     Reason: 13 use_item effect + ItemEffectService dispatch はゲームプレイの大部分を占める。各 effect の target 検証・duration 管理・event 送信が複雑
  - **Skills**: []
  - **Parallelization**: Wave 14 (with 32, 37-40), blocked by 23, 24, 27, 28
  - **References**: `docs/plans/back/be-dev-plan.md:617-636` — §8.8 14種アイテム実装割当 (うち nine_lives は §9 DeathService 管轄)

**Acceptance Criteria**:
**TDD Tests:**
  - [ ] Test: RelayPointEffect が Safe セルにのみ設置される
  - [ ] Test: DashEffect が 15秒間速度を 1.5 倍にする
  - [ ] Test: CatsEyeEffect が `cats_eye_activated` / `cats_eye_expired` を送信する
  - [ ] Test: DisposableLifeEffect が死亡回避バフを付与する
  - [ ] Test: 全 13 use_item effect が target validation を通過/失敗する (nine_lives は除外)
  - [ ] Test: ItemEffectService が NineLives タイプを受け取った場合に何もしない (DeathService 管轄)
  - [ ] `pnpm --filter @detonator/server test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: All 13 use_item effects dispatch
    Tool: Bash (vitest)
    Preconditions: Tasks 1-35 complete
    Steps:
      1. pnpm --filter @detonator/server test -- -t "effect"
      2. Verify each of 13 use_item types has a dispatch test (nine_lives excluded — owned by DeathService)
    Expected Result: All item effect tests pass
    Failure Indicators: Missing effect type, wrong target validation
    Evidence: .sisyphus/evidence/task-36-item-effects.log

  Scenario: Duration-based effects (dash, cats_eye, disposable_life, erosion_pause)
    Tool: Bash (vitest)
    Preconditions: Tasks 1-35 complete
    Steps:
      1. pnpm --filter @detonator/server test -- -t "duration|expiry"
    Expected Result: Effect expiry queue correctly schedules and fires
    Failure Indicators: Effect not expired, wrong expiry time
    Evidence: .sisyphus/evidence/task-36-duration-effects.log
  ```

  **Commit**: YES
  - Message: `feat(server): 13 use_item effects and use_item completion (nine_lives owned by DeathService)`
  - Pre-commit: `pnpm --filter @detonator/server test`

- [ ] 37. Server — claim_reward + discard_item completion

  **What to do**:
  - handleClaimReward を RewardService + InventoryService + SkillService に接続
  - handleDiscardItem を InventoryService + DropService に接続
  - `test/`: claim flow (offer → apply → inventory update), discard flow (remove → ground drop)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - **Parallelization**: Wave 14 (with 32, 36, 38-40), blocked by 33
  - **References**: `docs/plans/back/be-dev-plan.md:529-636` — §8

  **Acceptance Criteria**:
  **TDD Tests:**
  - [ ] Test: claim_reward が offerId/optionIndex を検証し正しく適用する
  - [ ] Test: discard_item が inventory から削除し ground に drop する
  - [ ] `pnpm --filter @detonator/server test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Claim reward flow
    Tool: Bash (vitest)
    Preconditions: Tasks 1-36 complete
    Steps:
      1. pnpm --filter @detonator/server test -- -t "claim"
    Expected Result: Claim validates offer and applies correctly
    Failure Indicators: Invalid offer accepted, wrong inventory mutation
    Evidence: .sisyphus/evidence/task-37-claim-reward.log

  Scenario: Discard item flow
    Tool: Bash (vitest)
    Preconditions: Tasks 1-36 complete
    Steps:
      1. pnpm --filter @detonator/server test -- -t "discard"
    Expected Result: Discard removes from inventory and creates ground drop
    Failure Indicators: Item not removed, no ground item created
    Evidence: .sisyphus/evidence/task-37-discard.log
  ```

  **Commit**: YES
  - Message: `feat(server): claim_reward and discard_item completion`
  - Pre-commit: `pnpm --filter @detonator/server test`

- [ ] 38. Server — mid-game join + reconnect completion

  **What to do**:
  - JoinService.createMidGamePlayer の完全接続 (inventory 初期化、RuntimePlayerState 初期化、player_joined event)
  - ReconnectService.handleReconnect の完全接続 (client registry 差し替え、危険位置補正、`inventory_updated` 再送、pending `reward_offer` 全件 replay、`player_reconnected` event)
  - SimulationLoop で gameplay が動作する全結合テスト
  - `test/`: mid-game join state, reconnect resync, full gameplay integration

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - **Parallelization**: Wave 14 (with 32, 36, 37, 39, 40), blocked by 20, 31
  - **References**: `docs/plans/back/be-dev-plan.md:702-762` — §10

  **Acceptance Criteria**:
  **TDD Tests:**
  - [ ] Test: mid-game join が Lv1 / 空 inventory / 空 skill stacks で初期化
  - [ ] Test: reconnect が `inventory_updated` + pending `reward_offer` を replay
  - [ ] Test: 2 プレイヤーで Lobby → Game → Floor Clear → Rest → Next Floor のフローが通る
  - [ ] `pnpm --filter @detonator/server test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Mid-game join initialization
    Tool: Bash (vitest)
    Preconditions: Tasks 1-37 complete
    Steps:
      1. pnpm --filter @detonator/server test -- -t "mid-game|join"
    Expected Result: Mid-game join creates Lv1 player with empty inventory/skills
    Failure Indicators: Wrong initial state, missing player_joined event
    Evidence: .sisyphus/evidence/task-38-midgame-join.log

  Scenario: Reconnect private state resync
    Tool: Bash (vitest)
    Preconditions: Tasks 1-37 complete
    Steps:
      1. pnpm --filter @detonator/server test -- -t "reconnect"
    Expected Result: Reconnect replays inventory_updated and pending reward_offers
    Failure Indicators: Missing resync data, stale private state
    Evidence: .sisyphus/evidence/task-38-reconnect.log
  ```

  **Commit**: YES
  - Message: `feat(server): mid-game join and reconnect completion`
  - Pre-commit: `pnpm --filter @detonator/server test`

- [ ] 39. Client — RewardOfferPanel + TargetingOverlay + NotificationToast

  **What to do**:
  - `src/ui/hud/RewardOfferPanel.ts`: reward_offer 表示 (item/skill 名、効果量、選択ボタン)、claim_reward 送信 — fe-dev-plan §8.5
  - `src/ui/overlays/TargetingOverlay.ts`: relay_point / bridge の照準 UI (盤面タップで targetCoord 確定) — fe-dev-plan §1.4
  - `src/ui/hud/NotificationToast.ts`: error (赤), exp_gained (青緑), item_picked_up (アイコン付き), player_death (警告), death_avoided (保護), level_up (祝福) — fe-dev-plan §8.6
  - `src/ui/hud/MultiplayerNoticePanel.ts`: join/left/disconnect/reconnect 通知 — fe-dev-plan §9.6
  - `src/ui/hud/ConnectionBanner.ts`: reconnect 中上部バナー

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - **Parallelization**: Wave 14 (with 32, 36-38), blocked by 22, 30
  - **References**: `docs/plans/front/fe-dev-plan.md:783-903` — §8

  **Acceptance Criteria**:
  **TDD Tests:**
  - [ ] Test: RewardOfferPanel が `reward_offer` で正しく表示される
  - [ ] Test: NotificationToast が error/exp/death トーストを出す
  - [ ] `pnpm --filter @detonator/client test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Reward panel display and claim
    Tool: Bash (vitest)
    Preconditions: Tasks 1-38 complete
    Steps:
      1. pnpm --filter @detonator/client test -- -t "reward|toast"
    Expected Result: Reward panel renders options and toast displays correctly
    Failure Indicators: Missing option display, wrong toast type
    Evidence: .sisyphus/evidence/task-39-reward-toast.log
  ```

  **Commit**: YES
  - Message: `feat(client): RewardOfferPanel, TargetingOverlay, NotificationToast, MultiplayerNotice`
  - Pre-commit: `pnpm --filter @detonator/client test`

- [ ] 40. Client — Lobby + Rest + GameOver scenes + MultiplayerNotice

   **What to do**:
   - `src/scenes/LobbyScene.ts` 完成: DisplayNameForm + ParticipantList + StageInfoPanel — fe-dev-plan §9.3
   - `src/scenes/RestScene.ts` 完成: 報酬取得導線 + RewardOfferPanel 拡張表示 — fe-dev-plan §9.4
   - `src/scenes/GameOverScene.ts` 完成: reason / finalFloor / finalScore / リプレイ導線 — fe-dev-plan §9.5
   - `src/ui/lobby/DisplayNameForm.ts`: 表示名入力。**input 要素に `data-testid="display-name-input"` を付与すること** (Task 43 Playwright E2E で使用)
   - `src/ui/lobby/ParticipantList.ts`: 参加者一覧
   - `src/ui/lobby/StageInfoPanel.ts`: ステージ概要
   - `src/ui/overlays/GameOverSummary.ts`: 最終結果カード。**コンテナに `data-testid="game-over-summary"` を付与すること** (Task 43 Playwright E2E で使用)
   - LobbyScene の start ボタンに `data-testid="start-button"` を付与すること (Task 43 Playwright E2E で使用)
   - `test/`: scene transition tests

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - **Parallelization**: Wave 15 (with 41-43), blocked by 19, 39
  - **References**: `docs/plans/front/fe-dev-plan.md:905-997` — §9

  **Acceptance Criteria**:
  **TDD Tests:**
  - [ ] Test: LobbyScene → GameScene 遷移が reservation 消費後に発生
  - [ ] Test: GameOverScene が `game_over` で正しく表示される
  - [ ] `pnpm --filter @detonator/client test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Scene transitions — Lobby → Game → GameOver
    Tool: Bash (vitest)
    Preconditions: Tasks 1-39 complete
    Steps:
      1. pnpm --filter @detonator/client test -- -t "scene|lobby|rest|gameover"
    Expected Result: All scene transition tests pass
    Failure Indicators: Missing transition, wrong scene key
    Evidence: .sisyphus/evidence/task-40-scene-transitions.log
  ```

  **Commit**: YES
  - Message: `feat(client): Lobby, Rest, GameOver scenes complete`
  - Pre-commit: `pnpm --filter @detonator/client test`

- [ ] 41. Client — Audio (SFX + BGM + AudioUnlock)

  **What to do**:
  - `src/audio/AudioController.ts`: SFX/BGM 再生の統一窓口 — fe-dev-plan §10
  - `src/audio/SfxCatalog.ts`: event → SFX key 対応表 (全 38 イベント + UI action) — fe-dev-plan §10.3
  - `src/audio/BgmController.ts`: floor/scene 切替 BGM (Floor 1-3/4-6/7-9/10 + Lobby/Rest/GameOver) — fe-dev-plan §10.4
  - `src/ui/overlays/AudioUnlockOverlay.ts`: モバイル初回タップ解禁 — fe-dev-plan §10.5
  - BootScene に AudioUnlockOverlay 統合
  - `test/`: SFX catalog completeness, BgmController floor mapping

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Phaser audio system + overlay UI
  - **Skills**: []
  - **Parallelization**: Wave 15 (with 40, 42, 43), blocked by 19, 35
  - **References**: `docs/plans/front/fe-dev-plan.md:998-1080` — §10

  **Acceptance Criteria**:
  **TDD Tests:**
  - [ ] Test: SfxCatalog が全 38 イベントに SFX key を持つ
  - [ ] Test: BgmController が floor に応じた BGM を返す
  - [ ] `pnpm --filter @detonator/client test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Audio catalog completeness and BGM mapping
    Tool: Bash (vitest)
    Preconditions: Tasks 1-40 complete
    Steps:
      1. pnpm --filter @detonator/client test -- -t "audio|sfx|bgm"
    Expected Result: SfxCatalog has 38 event mappings, BgmController returns correct floor BGM
    Failure Indicators: Missing SFX key for event, wrong BGM floor mapping
    Evidence: .sisyphus/evidence/task-41-audio.log
  ```

  **Commit**: YES
  - Pre-commit: `pnpm --filter @detonator/client test`

- [ ] 42. Server — integration tests

  **What to do**:
  - 2 プレイヤー結合テスト: Lobby → Game → Floor Clear → Rest → Next Floor → Game Over (Floor10Cleared / AllDead)
  - 途中参加テスト: Playing 中に 3 人目参加
  - 再接続テスト: 切断 → 60 秒内 reconnect → private state 再同期
  - detonate → chain → EXP → reward フロー
  - erosion warning → conversion → death フロー
  - 全滅 → game_over フロー
  - `test/integration/`: 結合テストファイル群

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 全システムの結合テストはゲームの完全な動作確認
  - **Skills**: []
  - **Parallelization**: Wave 15 (with 40, 41, 43), blocked by all server tasks
  - **References**: `docs/plans/back/be-dev-plan.md:920-928` — §14 実装開始時のおすすめ粒度

  **Acceptance Criteria**:
  **TDD Tests:**
  - [ ] Test: 2 プレイヤーで全フローが完了する
  - [ ] Test: 途中参加で 3 人目が正しく初期化される
  - [ ] Test: 再接続で private state が完全に復元される
  - [ ] Test: 全滅で game_over(AllDead) が送信される
  - [ ] `pnpm --filter @detonator/server test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Full server integration — 2P flow and edge cases
    Tool: Bash (vitest)
    Preconditions: Tasks 1-41 complete
    Steps:
      1. pnpm --filter @detonator/server test -- -t "integration|2-player|all-dead"
    Expected Result: 2P full flow completes, mid-game join works, reconnect resyncs, game_over triggers
    Failure Indicators: Flow breaks at any stage, missing event, state corruption
    Evidence: .sisyphus/evidence/task-42-server-integration.log
  ```

  **Commit**: YES
  - Pre-commit: `pnpm --filter @detonator/server test`

- [ ] 43. Client — integration + flow testing

  **What to do**:
  - client unit test 完成: visibility.spec.ts, facingResolver.spec.ts, inputMapper.spec.ts, privateStateStore.spec.ts — fe-dev-plan §15 Phase D
  - Playwright E2E: server 起動 → client 接続 → Lobby → Game → Rest → Game Over の UI フロー確認
  - reconnect UI 再同期確認
  - スマホ viewport での UI 密度確認
  - `test/`: 全 unit test + Playwright 結合テスト

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 全フローの E2E テストはゲーム完成度の最終検証
  - **Skills**: [`playwright`]
  - **Parallelization**: Wave 15 (with 40, 41, 42), blocked by all client tasks
  - **References**: `docs/plans/front/fe-dev-plan.md:1261-1335` — §15 実装ロードマップ Phase D

  **Acceptance Criteria**:
  **TDD Tests:**
  - [ ] Test: visibility.spec.ts が全 CP 可視化パターンを通す
  - [ ] Test: inputMapper.spec.ts が全コマンド正規化を通す
  - [ ] Test: privateStateStore.spec.ts が全更新イベントを通す
  - [ ] Playwright: Lobby → Game → Game Over の全フローが画面遷移する
  - [ ] `pnpm --filter @detonator/client test` → PASS

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Client unit test coverage — visibility, inputMapper, privateStateStore
    Tool: Bash (vitest)
    Preconditions: Tasks 1-42 complete
    Steps:
      1. pnpm --filter @detonator/client test -- -t "visibility|inputMapper|privateState"
    Expected Result: All client unit tests pass (visibility distance check, input normalization, state store update)
    Failure Indicators: Missing test file, broken assertion, state mismatch
    Evidence: .sisyphus/evidence/task-43-client-unit.log

  Scenario: Client E2E — full flow via Playwright
    Tool: Playwright (playwright skill)
    Preconditions: pnpm dev running with TEST_MODE=true (server + client). TEST_MODE は DetonatorRoom で有効化され、自動的に AllDead game_over を 5 秒後に発火するテスト用ルームフック
    Steps:
      1. npx playwright install (first time only)
      2. Navigate to http://localhost:5173
      3. Wait for BootScene → LobbyScene to load (timeout: 30s)
      4. Verify LobbyScene DOM: displayName input exists (`input[data-testid="display-name-input"]`), start button exists (`button[data-testid="start-button"]`)
      5. Fill displayName input with "TestPlayer", click start button
      6. Wait for GameScene to load (timeout: 15s)
      7. Verify canvas is non-blank: take screenshot of `canvas`, assert at least 10% non-white pixels (grid renders colored cells on canvas — no DOM selectors needed)
      8. Verify HUD DOM overlay exists: `div[data-testid="player-hud-panel"]` is present (HUD is DOM overlay per fe-dev-plan §8, NOT canvas)
      9. Wait for TEST_MODE auto-triggered game_over (timeout: 30s — server sends AllDead after 5s in TEST_MODE)
      10. Verify GameOverScene: `div[data-testid="game-over-summary"]` is present, contains "AllDead" or "Floor10Cleared" text
    Expected Result: Full Lobby → Game → Game Over flow completes in browser
    Failure Indicators: Scene stuck, canvas blank (white), missing HUD overlay, game_over not received within timeout, crash on transition
    Evidence: .sisyphus/evidence/task-43-e2e-flow.log
  ```

  **Commit**: YES
  - Pre-commit: `pnpm --filter @detonator/client test`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `pnpm test` + linter + `tsc --noEmit`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill if UI)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy
### **Use jujutsu instead of git**

- **Wave 1**: `chore: monorepo setup with pnpm + Turborepo + Biome + Vitest`
- **Wave 2**: `feat(protocol): enum / interface / command / event / timer / constant contracts`
- **Wave 3**: `feat(config): type definitions and game-params.json` + `feat(schema): Colyseus shared state classes`
- **Wave 4**: `feat(config): gameplay data (items/skills/stages/rewards)` + `feat(schema): utility helpers and tests`
- **Wave 5**: `feat(rules-core): grid / movement / facing / collision foundation`
- **Wave 6**: `feat(rules-core): dig / flood-fill / drop / progression / inventory`
- **Wave 7**: `feat(rules-core): detonate / explosion / erosion systems`
- **Wave 8**: `feat(rules-core): lifecycle / reward / scoring`
- **Wave 9**: `chore: shared package integration review` + `feat(server): room foundation`
- **Wave 10**: `feat(server): LobbyRoom + DetonatorRoom + floor bootstrap`
- **Wave 11**: `feat(server): inventory / EXP / drop services + client board rendering + player layer`
- **Wave 12**: `feat(server): death / checkpoint / detonate / explosion / erosion + client input + HUD`
- **Wave 13**: `feat(server): respawn / reward / skill + client CP / ground item / FX`
- **Wave 14**: `feat(server): floor transition / item effects / claim / discard / reconnect + client reward + targeting + toast`
- **Wave 15**: `feat(client): Lobby / Rest / GameOver scenes + audio` + `test(server): integration tests` + `test(client): integration + E2E`

---

## Success Criteria

### Verification Commands
```bash
pnpm install          # Expected: clean install
pnpm lint            # Expected: 0 errors
pnpm typecheck        # Expected: 0 errors
pnpm test            # Expected: all pass
pnpm build           # Expected: all build
pnpm dev             # Expected: server + client start
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] 2-player full flow completes (Lobby → Game → Game Over)
