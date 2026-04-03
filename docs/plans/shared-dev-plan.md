# 共有パッケージ開発プラン

## 1. 設計前提

### 1.1 Colyseus / schema 制約を最上位前提に置く

- `@type()` フィールドは **1 クラス最大 64 個**。`packages/schema` は 1 クラス 1 責務を守り、`GameState` 直下へ過剰に状態を積まない。
- `@colyseus/schema` は **多次元配列非対応**。`GridState.cells` は `ArraySchema<CellState>` のフラット配列とし、アクセス規約は常に `index = y * width + x` に統一する。
- `MapSchema` キーは **文字列のみ**。`players`, `groundItems`, `checkpoints` はそれぞれ `sessionId`, `groundItemId`, `cpId` をキーとする。
- **Private State は schema に載せない**。インベントリ、保留報酬オファー、スキルスタック、一時効果、入力バッファは `packages/schema` の責務外とする。

### 1.2 `RewardOption` は discriminated union で固定する

```ts
export type RewardOption = SkillRewardOption | ItemRewardOption;
```

- `reward_offer` は `options: RewardOption[]` を返す。
- `claim_reward` は `offerId` と `optionIndex` を受け取り、server/rules-core 側で保留中オファー照合と候補確定を行う。
- `packages/config/rewards.json` は item / skill を同じプールで混ぜず、**生成時点では別プール**、提示時点では union へ正規化する。

### 1.3 パッケージ依存順は `protocol → (config / schema 並行) → rules-core`

- `packages/protocol` が **最初の基盤**。文字列リテラル、enum、command/event/timer payload をここで確定させる。
- `packages/config` は `packages/protocol` の enum / interface を参照して JSON を型付けする。
- `packages/schema` も `packages/protocol` の enum / shared types を参照するが、**`rules-core` の後段ではない**。
- `packages/rules-core` は `protocol` と `config` を使って純粋関数群を組み立てる。`schema` への compile-time 依存は持たせない。

### 1.4 通信モデルはサーバー権威のみ

- `docs/plans/tech-stack.md` に残る「クライアント予測 + サーバー調整」は **旧案**として破棄する。
- `packages/protocol` / `packages/schema` / `packages/rules-core` は全て **server authoritative** を前提に設計する。
- `move` も「予測結果の確定」ではなく「入力送信 → サーバー計算 → patch 反映」の流れに固定する。

### 1.5 Cat's Eye は「未回収 CP のチーム共有表示」

- `cats_eye` は **全未回収 CP を一時的にチーム全体へ共有表示**する。
- CP 座標自体は `GameState.checkpoints` に常時全量同期済みなので、Cat's Eye は「座標秘匿解除」ではなく、**クライアント描画フラグの一時上書き**を通知するイベントである。
- `CatsEyeActivatedEvent.revealedCpIds` は未回収 CP の ID のみを返し、回収済み CP を混ぜない。

### 1.6 `packages/config` は MVP の実データを持つ

- `items.json` には **14 種アイテム全件**を持たせる。
- `skills.json` には **14 種スキル全件**を持たせる。
- `stages.json` は **フロア定義 + ステージ定義 + CP 候補 + Hole 座標 + 初期スポーン群**を持つ。
- `game-params.json` は `api.md` の「主要パラメータ初期値」を完全に受ける起点ファイルとする。
- `rewards.json` はレベルアップ報酬の提示重み・除外条件・floor/level 帯ごとのプール切替を持つ。

### 1.7 `packages/rules-core` に lifecycle / reward を追加する

- 追加責務は以下。
  - `lifecycle/`: `spawn-selection`, `respawn-placement`, `floor-transition`
  - `reward/`: `reward-offer`, `reward-apply`, `inventory-mutation`
- これにより `apps/server` は「検証 / オーケストレーション / queue 管理 / event 送信」に集中し、ルール計算の本体は共有 package 側へ閉じる。

### 1.8 ドキュメント優先順位

1. `docs/plans/api.md`
2. `docs/plans/detonator.md`
3. 旧記述（`tech-stack.md` 旧案など）は採用しない

---

## 2. パッケージ依存関係図

```text
packages/protocol
├── defines: enum / shared interface / command / event / timer / constants
├──> packages/config
│     └── defines: game params / items / skills / stages / rewards JSON
├──> packages/schema
│     └── defines: Colyseus shared state classes
└──> packages/rules-core
      └── uses protocol enums and payload shapes

packages/config ────────────────> packages/rules-core
packages/schema -- no compile-time dependency --> packages/rules-core

apps/server uses: protocol + config + schema + rules-core
apps/client uses: protocol + schema(+ read-only helpers)
```

### 2.1 依存マトリクス

| package | 直接依存 | 依存理由 | 禁止依存 |
|---|---|---|---|
| `packages/protocol` | なし（TS 標準のみ） | 最小基盤として独立させる | `config`, `schema`, `rules-core` |
| `packages/config` | `packages/protocol` | `ItemType`, `SkillType`, `CellType` 等で JSON を型付けする | `schema`, `rules-core` |
| `packages/schema` | `packages/protocol`, `@colyseus/schema` | enum 整合と同期状態定義 | `config`, `rules-core` |
| `packages/rules-core` | `packages/protocol`, `packages/config` | pure rules を enum/設定値駆動にする | `schema` |

### 2.2 この依存順が必要な理由

- `protocol` 未確定のまま `config` を始めると、JSON キー文字列が実装ごとにずれる。
- `protocol` 未確定のまま `schema` を始めると、`PlayerState.lifeState` などの enum 数値意味が後で壊れる。
- `config` 未確定のまま `rules-core` を進めると、スキル倍率・侵食間隔・報酬重みをコードに焼き込んでしまう。
- `schema` を `rules-core` 後段扱いすると、server 実装時に shared/public state の形が後追いになり、`apps/server` の room 基盤が先に固まらない。

---

## 3. 並行可能な大枠

### 3.1 開発レーン

| レーン | 対象 | 着手条件 | 主成果物 | ブロッカー |
|---|---|---|---|---|
| レーンA | `packages/protocol` | なし | enum / interface / payload / constants | 最初の全体ブロッカー |
| レーンB | `packages/config` | `protocol` の enum 確定後 | JSON と型、検証器 | `protocol` ブロッカー |
| レーンC | `packages/schema` | `protocol` の enum 確定後 | `GameState` 以下全 schema | `protocol` ブロッカー |
| レーンD | `packages/rules-core/grid/progression` | `protocol` と `config types` 確定後 | 盤面・掘削・EXP・drop の pure rules | `config` ブロッカー |
| レーンE | `packages/rules-core/detonate/erosion` | `protocol`, `config`, grid DTO 確定後 | 爆発・侵食 rules | D の DTO 安定化が必要 |
| レーンF | `packages/rules-core/lifecycle/reward` | `protocol`, `config`, progression/inventory DTO 確定後 | spawn / floor transition / reward apply | D の inventory / progression ブロッカー |

### 3.2 明示的ブロッカー

- **ブロッカーP1**: `packages/protocol` が終わるまで `config` / `schema` / `rules-core` は本実装に入れない。
- **ブロッカーC1**: `packages/config/src/types.ts` と `game-params.json` が固まるまで、`rules-core` は数式・係数実装を固定できない。
- **ブロッカーS1**: `schema` の `CellState` / `GridState` / `GameState` が固まるまで、server 側は public state の patch 点を設計しづらい。
- **ブロッカーR1**: `rules-core/reward` 完了前は `claim_reward` と `level_up` 周りのサーバー実装を閉じられない。
- **ブロッカーR2**: `rules-core/lifecycle` 完了前は途中参加・リスポーン・floor clear 遷移の server 側 facade を閉じられない。

### 3.3 並行可能な実施単位

- `protocol.commands.ts` と `protocol.events.ts` は `types.ts` の後に並行。
- `config.items.json` と `config.skills.json` は `config.types.ts` の後に並行。
- `schema` の各 class ファイルは `shared enum` を読み込むだけなので並行。
- `rules-core` は以下の 3 レーンに分割できる。
  - レーン1: `grid/`, `dig/`, `drop/`, `progression/`
  - レーン2: `detonate/`, `explosion/`, `erosion/`
  - レーン3: `lifecycle/`, `reward/`, `scoring/`

---

## 4. `packages/protocol`

### 4.1 役割と責務

- room 間・app 間で共有する **単一の契約 source of truth**。
- **command 名 / event 名 / room 名 / timer queue entry 名**の衝突防止。
- API 仕様書の TypeScript 表現を提供し、`apps/server`, `apps/client`, `packages/config`, `packages/rules-core` が同じ型を見るようにする。
- `schema` と違い、ここは **同期状態を持たない**。純粋に静的型と定数のみを持つ。
- private/public の境界もここで見えるようにする。`InventoryUpdatedEvent` は private、`CpCollectedEvent` は broadcast というように event contract を package の時点で固定する。

### 4.2 推奨ディレクトリ構成

```text
packages/protocol/
  package.json
  tsconfig.json
  src/
    index.ts
    types.ts
    commands.ts
    events.ts
    timers.ts
    constants.ts
  test/
    protocol.constants.test.ts
    protocol.type-exports.test.ts
```

### 4.3 ファイル構成テーブル

| ファイル | 責務 |
|---|---|
| `src/index.ts` | barrel export。consumer はここだけを import すればよい構成にする |
| `src/types.ts` | enum / shared interface / `RewardOption` union / 補助 map interface |
| `src/commands.ts` | client→server 7 command payload 定義 |
| `src/events.ts` | server→client 38 event payload 定義 |
| `src/timers.ts` | server runtime queue entry 7 型定義 |
| `src/constants.ts` | room / command / event 名文字列、一覧配列、型ガード向け const |
| `test/protocol.constants.test.ts` | event/command/room 名の重複がないことを検証 |
| `test/protocol.type-exports.test.ts` | public export surface の破壊変更検知 |

### 4.4 `types.ts`

#### 4.4.1 enum 定義（`api.md` から正確に転記）

```ts
export enum CellType {
  Safe           = 0,
  SafeMine       = 1,
  DangerousMine  = 2,
  Wasteland      = 3,
  Hole           = 4,
}

export enum GamePhase {
  Playing               = 0,
  FloorClearTransition  = 1,
  Rest                  = 2,
  GameOver              = 3,
}

export enum PlayerLifeState {
  Alive         = 0,
  Ghost         = 1,
  Disconnected  = 2,
}

export enum Facing8 {
  N  = 0,
  NE = 1,
  E  = 2,
  SE = 3,
  S  = 4,
  SW = 5,
  W  = 6,
  NW = 7,
}

export enum Facing4 {
  N = 0,
  E = 1,
  S = 2,
  W = 3,
}

export enum DeathCause {
  UnmanagedExplosion = 0,
  Erosion            = 1,
  Event              = 2,
}

export enum ItemType {
  RelayPoint        = "relay_point",
  Dash              = "dash",
  ForceIgnition     = "force_ignition",
  MineRemoverCheap  = "mine_remover_cheap",
  MineRemoverNormal = "mine_remover_normal",
  MineRemoverHigh   = "mine_remover_high",
  CatsEye           = "cats_eye",
  Evacuation        = "evacuation",
  TakeABreath       = "take_a_breath",
  ShortBreak        = "short_break",
  Bridge            = "bridge",
  DisposableLife    = "disposable_life",
  NineLives         = "nine_lives",
  Purify            = "purify",
}

export enum SkillType {
  Chord                      = "chord",
  RespawnTimeReduction       = "respawn_time_reduction",
  MovementSpeedBoost         = "movement_speed_boost",
  DetonateCooldownReduction  = "detonate_cooldown_reduction",
  ExpGainBoost               = "exp_gain_boost",
  ComboMultiplierBoost       = "combo_multiplier_boost",
  ErosionCooldownIncrease    = "erosion_cooldown_increase",
  ItemDropRateBoost          = "item_drop_rate_boost",
  ItemPickupRangeBoost       = "item_pickup_range_boost",
  ItemSlotIncrease           = "item_slot_increase",
  CpDetectionRangeBoost      = "cp_detection_range_boost",
  ErosionForewarning         = "erosion_forewarning",
  DeathItemKeepChance        = "death_item_keep_chance",
  WastelandSpeedReduction    = "wasteland_speed_reduction",
}

export enum LeaveReason {
  Voluntary = "voluntary",
  Timeout   = "timeout",
}

export enum FuseCancelReason {
  SourceRemoved = "source_removed",
  MineRemoved   = "mine_removed",
  FlagRemoved   = "flag_removed",
  FloorCleared  = "floor_cleared",
}

export enum ErosionWarningCancelReason {
  TakeABreath  = "take_a_breath",
  ShortBreak   = "short_break",
  FloorCleared = "floor_cleared",
}

export enum ExpSource {
  Dig            = "dig",
  DetonateCombo  = "detonate_combo",
}

export enum ItemDestroyReason {
  UnmanagedExplosion = "unmanaged_explosion",
  Erosion            = "erosion",
}

export enum GameOverReason {
  AllDead         = "all_dead",
  Floor10Cleared  = "floor_10_cleared",
}

export enum ErrorCode {
  DigOutOfRange          = "DIG_OUT_OF_RANGE",
  DigInvalidTarget       = "DIG_INVALID_TARGET",
  DigNotAlive            = "DIG_NOT_ALIVE",
  FlagOutOfRange         = "FLAG_OUT_OF_RANGE",
  FlagInvalidTarget      = "FLAG_INVALID_TARGET",
  FlagNotAlive           = "FLAG_NOT_ALIVE",
  DetonateCooldown       = "DETONATE_COOLDOWN",
  DetonateInvalidTarget  = "DETONATE_INVALID_TARGET",
  DetonateNotAlive       = "DETONATE_NOT_ALIVE",
  UseItemEmptySlot       = "USE_ITEM_EMPTY_SLOT",
  UseItemInvalidTarget   = "USE_ITEM_INVALID_TARGET",
  UseItemConditionNotMet = "USE_ITEM_CONDITION_NOT_MET",
  UseItemNotAlive        = "USE_ITEM_NOT_ALIVE",
  DiscardEmptySlot       = "DISCARD_EMPTY_SLOT",
  ClaimNoPendingReward   = "CLAIM_NO_PENDING_REWARD",
  ClaimInvalidOfferId    = "CLAIM_INVALID_OFFER_ID",
  ClaimInvalidOption     = "CLAIM_INVALID_OPTION",
}
```

#### 4.4.2 interface / union 定義

| 型名 | 種別 | フィールド |
|---|---|---|
| `Vec2` | API shared interface | `x: number`, `y: number` |
| `GridCoord` | API shared interface | `x: number`, `y: number` |
| `RoomOptions` | API shared interface | `displayName: string` |
| `JoinOptions` | API shared interface | `displayName: string` |
| `InventorySlot` | API shared interface | `slotIndex: number`, `itemType: ItemType \| null`, `stackCount: number` |
| `SkillRewardOption` | API shared interface | `type: "skill"`, `skillType: SkillType`, `effectValue: number` |
| `ItemRewardOption` | API shared interface | `type: "item"`, `itemType: ItemType`, `stackCount: number` |
| `ProtocolCommandNameMap` | package helper interface | `move: "move"`, `dig: "dig"`, `flag: "flag"`, `detonate: "detonate"`, `use_item: "use_item"`, `discard_item: "discard_item"`, `claim_reward: "claim_reward"` |
| `ProtocolRoomNameMap` | package helper interface | `LobbyRoom: "LobbyRoom"`, `DetonatorRoom: "DetonatorRoom"` |

```ts
export type RewardOption = SkillRewardOption | ItemRewardOption;
```

> `api.md` の Shared Types 節にある interface は 7 件。上表では実運用で必要になる protocol 補助 interface 2 件も合わせて `types.ts` に置く前提とする。

### 4.5 `commands.ts`

#### 4.5.1 7 command payload 定義

```ts
export interface MovePayload {
  vx: number;
  vy: number;
}

export interface DigPayload {
  x: number;
  y: number;
}

export interface FlagPayload {
  x: number;
  y: number;
}

export interface DetonatePayload {
  x: number;
  y: number;
}

export interface UseItemPayload {
  slotIndex: number;
  targetCoord?: GridCoord;
}

export interface DiscardItemPayload {
  slotIndex: number;
}

export interface ClaimRewardPayload {
  offerId: string;
  optionIndex: number;
}
```

#### 4.5.2 command 補足

| command | payload | 送信者制約 | server 側の主検証 |
|---|---|---|---|
| `move` | `MovePayload` | Alive / Ghost | 有限数、必要なら正規化、`Playing` 以外は無視 |
| `dig` | `DigPayload` | Alive のみ | Chebyshev 距離 1、地雷原セル限定 |
| `flag` | `FlagPayload` | Alive のみ | Chebyshev 距離 1、地雷原セル限定 |
| `detonate` | `DetonatePayload` | Alive のみ | flag 地雷 or relay point、CT 確認 |
| `use_item` | `UseItemPayload` | Alive のみ | slot, targetCoord, 使用条件 |
| `discard_item` | `DiscardItemPayload` | Alive のみ | slot 有効性 |
| `claim_reward` | `ClaimRewardPayload` | pending offer 所持者 | `offerId`, `optionIndex`, 提示済み候補照合 |

### 4.6 `events.ts`

#### 4.6.1 汎用 / プレイヤー存在イベント

| event 名 | interface | フィールド | scope | 送信タイミング |
|---|---|---|---|---|
| `error` | `ErrorEvent` | `code: ErrorCode`, `message: string` | private | command バリデーション失敗時 |
| `player_joined` | `PlayerJoinedEvent` | `sessionId: string`, `displayName: string`, `isMidGame: boolean` | room | `onJoin` 完了時 |
| `player_left` | `PlayerLeftEvent` | `sessionId: string`, `reason: LeaveReason` | room | `onLeave` 完了時 |
| `player_disconnected` | `PlayerDisconnectedEvent` | `sessionId: string`, `reconnectDeadline: number` | room | `onDrop` 直後 |
| `player_reconnected` | `PlayerReconnectedEvent` | `sessionId: string` | room | `onReconnect` 完了時 |

#### 4.6.2 Detonate（管理爆発）イベント

| event 名 | interface | フィールド | scope | 送信タイミング |
|---|---|---|---|---|
| `detonate_preview` | `DetonatePreviewEvent` | `sourceCoord: GridCoord`, `provisionalPath: GridCoord[]`, `fuseEndsAt: number` | room | `detonate` 受付直後 |
| `detonate_fuse_scheduled` | `DetonateFuseScheduledEvent` | `sourceCoord: GridCoord`, `fuseEndsAt: number`, `initiatorSessionId: string` | room | fuse queue 登録直後 |
| `detonate_fuse_canceled` | `DetonateFuseCanceledEvent` | `sourceCoord: GridCoord`, `reason: FuseCancelReason` | room | 起爆源消失 / 旗除去 / 地雷除去 / floor clear |
| `detonate_chain_step` | `DetonateChainStepEvent` | `sourceCoord: GridCoord`, `coord: GridCoord`, `cellTypeBefore: CellType`, `wasRelayPoint: boolean`, `remainingPath: GridCoord[]` | room | 125ms ごとの各セル処理時 |
| `detonate_resolved` | `DetonateResolvedEvent` | `sourceCoord: GridCoord`, `processedCells: GridCoord[]`, `safeMineCellsConverted: number`, `dangerousMineCellsConverted: number` | room | MST 全ノード処理完了時 |

#### 4.6.3 管理外爆発イベント

| event 名 | interface | フィールド | scope | 送信タイミング |
|---|---|---|---|---|
| `unmanaged_explosion_triggered` | `UnmanagedExplosionTriggeredEvent` | `epicenterCoord: GridCoord`, `triggerSessionId: string`, `blastCoords: GridCoord[]`, `wastelandCoords: GridCoord[]` | room | DangerousMine 誤掘り直後 |
| `unmanaged_chain_step` | `UnmanagedChainStepEvent` | `epicenterCoord: GridCoord`, `coord: GridCoord`, `chainDepth: number`, `blastCoords: GridCoord[]`, `wastelandCoords: GridCoord[]` | room | 125ms ごとの各連鎖処理時 |
| `unmanaged_explosion_resolved` | `UnmanagedExplosionResolvedEvent` | `originCoord: GridCoord`, `totalChainsTriggered: number` | room | BFS キュー枯渇時 |

#### 4.6.4 侵食イベント

| event 名 | interface | フィールド | scope | 送信タイミング |
|---|---|---|---|---|
| `erosion_warning` | `ErosionWarningEvent` | `targetCoords: GridCoord[]`, `warningEndsAt: number` | room | `erosion_warn` 到達時 |
| `erosion_warning_canceled` | `ErosionWarningCanceledEvent` | `canceledCoords: GridCoord[]`, `reason: ErosionWarningCancelReason` | room | 停止アイテム使用時 / floor clear |
| `erosion_applied` | `ErosionAppliedEvent` | `convertedSafeMineCoords: GridCoord[]`, `convertedDangerousMineCoords: GridCoord[]`, `updatedAdjacentCoords: GridCoord[]` | room | `erosion_convert` 実行時 |

#### 4.6.5 CP イベント

| event 名 | interface | フィールド | scope | 送信タイミング |
|---|---|---|---|---|
| `cats_eye_activated` | `CatsEyeActivatedEvent` | `sessionId: string`, `revealedCpIds: string[]`, `expiresAt: number` | room | `cats_eye` 使用直後 |
| `cats_eye_expired` | `CatsEyeExpiredEvent` | `sessionId: string` | room | `expiresAt` 到達時 |
| `cp_collected` | `CpCollectedEvent` | `cpId: string`, `coord: GridCoord`, `collectorSessionId: string`, `remainingCount: number` | room | CP 回収確定時 |

#### 4.6.6 EXP / レベルアップ / 報酬イベント

| event 名 | interface | フィールド | scope | 送信タイミング |
|---|---|---|---|---|
| `exp_gained` | `ExpGainedEvent` | `sessionId: string`, `amount: number`, `comboMultiplier: number`, `source: ExpSource`, `totalExp: number` | private | dig / flood-fill / detonate combo 後 |
| `level_up` | `LevelUpEvent` | `sessionId: string`, `newLevel: number`, `pendingRewardCount: number` | room + private 詳細別送 | level 閾値超過時 |
| `reward_offer` | `RewardOfferEvent` | `offerId: string`, `options: RewardOption[]` | private | `level_up` 直後 |

#### 4.6.7 アイテム / インベントリイベント

| event 名 | interface | フィールド | scope | 送信タイミング |
|---|---|---|---|---|
| `item_dropped` | `ItemDroppedEvent` | `groundItemId: string`, `itemType: ItemType`, `coord: GridCoord`, `stackCount: number`, `expiresAt: number` | room | dig drop 成功時 / discard 生成時 |
| `item_picked_up` | `ItemPickedUpEvent` | `groundItemId: string`, `pickerSessionId: string`, `itemType: ItemType`, `stackCount: number`, `usedNewSlot: boolean` | room | 自動取得成功時 |
| `item_expired` | `ItemExpiredEvent` | `groundItemId: string` | room | `item_expiry` 到達時 |
| `item_used` | `ItemUsedEvent` | `sessionId: string`, `itemType: ItemType`, `slotIndex: number`, `targetCoord?: GridCoord` | room | manual item 使用成功時 |
| `item_auto_triggered` | `ItemAutoTriggeredEvent` | `sessionId: string`, `itemType: ItemType` | room | `disposable_life` / `nine_lives` 自動発動時 |
| `item_destroyed` | `ItemDestroyedEvent` | `groundItemId: string`, `reason: ItemDestroyReason` | room | unmanaged explosion / erosion で消滅時 |
| `inventory_updated` | `InventoryUpdatedEvent` | `slots: InventorySlot[]`, `maxSlots: number` | private | pickup / use / discard / death（全ロスト） / floor start / reconnect |

#### 4.6.8 死亡 / リスポーンイベント

| event 名 | interface | フィールド | scope | 送信タイミング |
|---|---|---|---|---|
| `player_death` | `PlayerDeathEvent` | `sessionId: string`, `cause: DeathCause`, `coord: GridCoord`, `respawnAt: number`, `lostItems: ItemType[]` | room | 死亡確定時 |
| `death_avoided` | `DeathAvoidedEvent` | `sessionId: string`, `cause: DeathCause`, `itemUsed: ItemType` | room | 死亡回避成立時 |
| `player_ghost` | `PlayerGhostEvent` | `sessionId: string`, `respawnAt: number` | room | ghost 遷移完了時 |
| `player_respawned` | `PlayerRespawnedEvent` | `sessionId: string`, `spawnCoord: GridCoord` | room | respawn 位置確定時 |
| `game_over` | `GameOverEvent` | `finalFloor: number`, `finalScore: number`, `reason: GameOverReason` | room | AllDead / Floor10Cleared |

#### 4.6.9 フロア / スコアイベント

| event 名 | interface | フィールド | scope | 送信タイミング |
|---|---|---|---|---|
| `floor_cleared` | `FloorClearedEvent` | `floorNumber: number`, `clearedAt: number`, `clearTimeMs: number` | room | 最後の CP 回収直後 |
| `rest_phase_started` | `RestPhaseStartedEvent` | `floorNumber: number` | room | 全員復活 + 初期位置復帰完了後 |
| `next_floor_started` | `NextFloorStartedEvent` | `floorNumber: number`, `stageId: string`, `gridWidth: number`, `gridHeight: number` | room | 新フロア生成完了時 |
| `score_updated` | `ScoreUpdatedEvent` | `totalScore: number`, `floorScore: number`, `timeBonusMultiplier: number` | room | フロアスコア確定直後 |

### 4.7 `timers.ts`

#### 4.7.1 7 timer queue entry 型

```ts
export interface DetonateFuseEntry {
  type: "detonate_resolve";
  sourceCoord: GridCoord;
  initiatorSessionId: string;
  scheduledAt: number;
}

export interface UnmanagedChainEntry {
  type: "unmanaged_chain";
  coord: GridCoord;
  scheduledAt: number;
  chainDepth: number;
}

export interface ErosionPhaseEntry {
  type: "erosion_warn" | "erosion_convert";
  scheduledAt: number;
}

export interface ItemExpiryEntry {
  type: "item_expiry";
  groundItemId: string;
  scheduledAt: number;
}

export interface RespawnEntry {
  type: "respawn";
  sessionId: string;
  scheduledAt: number;
}

export interface EffectExpiryEntry {
  type: "effect_expiry";
  sessionId: string;
  effectType: string;
  scheduledAt: number;
}

export interface FutureEventEntry {
  type: "future_event";
  scheduledAt: number;
}
```

#### 4.7.2 queue 型 export 方針

```ts
export type QueueEntry =
  | DetonateFuseEntry
  | UnmanagedChainEntry
  | ErosionPhaseEntry
  | ItemExpiryEntry
  | RespawnEntry
  | EffectExpiryEntry
  | FutureEventEntry;
```

### 4.8 `constants.ts`

```ts
export const ROOM_NAMES = {
  LobbyRoom: "LobbyRoom",
  DetonatorRoom: "DetonatorRoom",
} as const;

export const COMMAND_NAMES = {
  move: "move",
  dig: "dig",
  flag: "flag",
  detonate: "detonate",
  use_item: "use_item",
  discard_item: "discard_item",
  claim_reward: "claim_reward",
} as const;

export const EVENT_NAMES = {
  error: "error",
  player_joined: "player_joined",
  player_left: "player_left",
  player_disconnected: "player_disconnected",
  player_reconnected: "player_reconnected",
  detonate_preview: "detonate_preview",
  detonate_fuse_scheduled: "detonate_fuse_scheduled",
  detonate_fuse_canceled: "detonate_fuse_canceled",
  detonate_chain_step: "detonate_chain_step",
  detonate_resolved: "detonate_resolved",
  unmanaged_explosion_triggered: "unmanaged_explosion_triggered",
  unmanaged_chain_step: "unmanaged_chain_step",
  unmanaged_explosion_resolved: "unmanaged_explosion_resolved",
  erosion_warning: "erosion_warning",
  erosion_warning_canceled: "erosion_warning_canceled",
  erosion_applied: "erosion_applied",
  cats_eye_activated: "cats_eye_activated",
  cats_eye_expired: "cats_eye_expired",
  cp_collected: "cp_collected",
  exp_gained: "exp_gained",
  level_up: "level_up",
  reward_offer: "reward_offer",
  item_dropped: "item_dropped",
  item_picked_up: "item_picked_up",
  item_expired: "item_expired",
  item_used: "item_used",
  item_auto_triggered: "item_auto_triggered",
  item_destroyed: "item_destroyed",
  inventory_updated: "inventory_updated",
  player_death: "player_death",
  death_avoided: "death_avoided",
  player_ghost: "player_ghost",
  player_respawned: "player_respawned",
  game_over: "game_over",
  floor_cleared: "floor_cleared",
  rest_phase_started: "rest_phase_started",
  next_floor_started: "next_floor_started",
  score_updated: "score_updated",
} as const;

export const ALL_COMMAND_NAMES = Object.values(COMMAND_NAMES);
export const ALL_EVENT_NAMES = Object.values(EVENT_NAMES);
export const ALL_ROOM_NAMES = Object.values(ROOM_NAMES);
```

### 4.9 実装ステップ

| 順序 | ステップ | 依存 | 並行/ブロッカー | 成果物 |
|---|---|---|---|---|
| 1 | package 雛形、`package.json`, `tsconfig.json`, `src/index.ts` 作成 | なし | ブロッカー | package 公開面の骨格 |
| 2 | `types.ts` の enum / shared interface / `RewardOption` 追加 | 1 | ブロッカー | 後続 package 全体の基礎 |
| 3 | `commands.ts` 実装 | 2 | `events.ts` と並行可 | 7 command payload |
| 4 | `events.ts` 実装 | 2 | `commands.ts` と並行可 | 38 event payload |
| 5 | `timers.ts` 実装 | 2 | 3,4 と並行可 | 7 queue entry 型 |
| 6 | `constants.ts` 実装 | 3,4,5 | 名前凍結が必要 | room/command/event 定数 |
| 7 | `index.ts` barrel export と import path 整理 | 3,4,5,6 | ブロッカー | consumer import を安定化 |
| 8 | export surface / name collision test 追加 | 7 | 最終確認 | package 破壊変更検知 |

### 4.10 protocol 実装時の注意点

- 文字列は **snake_case** で固定し、room 名だけ `LobbyRoom`, `DetonatorRoom` の PascalCase にする。
- event/command 名は `constants.ts` 由来でしか参照しない方針に寄せ、アプリ側で裸文字列を増やさない。
- `RewardOption` は union type のまま export し、class 化しない。
- timer queue 型は public API ではないが、server と rules facade 間で共有するため protocol に置く。

---

## 5. `packages/config`

### 5.1 役割と責務

- `api.md` と GDD にある**可変パラメータをコードから追い出す** package。
- 式係数、duration、倍率、重み、ステージ座標群、報酬テーブルを JSON 化する。
- `rules-core` は「式を解く関数」は持つが、「値そのもの」はここから読む。
- `apps/server` は room 作成時に一度ロードし、以後は immutable runtime config として使う。
- `items.json` / `skills.json` / `rewards.json` は **RewardOption 生成の元データ**、`stages.json` は **フロアと地形 authoring データ**、`game-params.json` は **横断パラメータ**を持つ。

### 5.2 推奨ディレクトリ構成

```text
packages/config/
  package.json
  tsconfig.json
  src/
    index.ts
    types.ts
    loadConfig.ts
    validateConfig.ts
  data/
    game-params.json
    items.json
    skills.json
    stages.json
    rewards.json
  test/
    validateConfig.test.ts
    reward-pool-shape.test.ts
```

### 5.3 ファイル構成テーブル

| ファイル | 責務 |
|---|---|
| `src/index.ts` | 全 JSON と型をまとめて export |
| `src/types.ts` | JSON schema に対応する TS interface 定義 |
| `src/loadConfig.ts` | JSON 読み込みと freeze / normalize |
| `src/validateConfig.ts` | enum 値整合、stage 重複、reward pool 不整合検証 |
| `data/game-params.json` | `api.md` の主要パラメータ初期値を完全保持 |
| `data/items.json` | 14 アイテム定義 |
| `data/skills.json` | 14 スキル定義 |
| `data/stages.json` | floor→stage 割当、stage authoring data |
| `data/rewards.json` | reward pool / weight / offer generation ルール |

### 5.4 `types.ts`: 全 TS interface のフィールド定義

#### 5.4.1 ルート config interface

| interface | フィールド |
|---|---|
| `SharedGameConfig` | `gameParams: GameParamsConfig`, `items: Record<ItemType, ItemDefinition>`, `skills: Record<SkillType, SkillDefinition>`, `stages: StagesConfig`, `rewards: RewardsConfig` |

#### 5.4.2 `game-params.json` 用 interface

| interface | フィールド |
|---|---|
| `GameParamsConfig` | `board: BoardParams`, `mines: MineParams`, `erosion: ErosionParams`, `progression: ProgressionParams`, `respawn: RespawnParams`, `detonate: DetonateParams`, `drop: DropParams`, `checkpoint: CheckpointParams`, `scoring: ScoringParams`, `movement: MovementParams`, `room: RoomParams`, `inventory: InventoryParams`, `itemEffects: ItemEffectParams` |
| `BoardParams` | `sizeFormula: string`, `minWidth: number`, `minHeight: number`, `maxWidth: number`, `maxHeight: number`, `initialSafeZoneWidth: number`, `initialSafeZoneHeight: number` |
| `MineParams` | `safeMineRatio: number`, `dangerousMineRatio: number`, `mineDensity: number`, `erosionSafeMineRatio: number`, `erosionDangerousMineRatio: number` |
| `ErosionParams` | `baseIntervalSec: number`, `basePowerCells: number`, `warningFixedDurationSec: number`, `warningIntervalThresholdSec: number`, `warningShortIntervalMultiplier: number`, `intervalFormula: string`, `powerFormula: string`, `takeABreathPauseMs: number`, `shortBreakPauseMs: number` |
| `ProgressionParams` | `levelExpBase: number`, `levelExpGrowth: number`, `comboMultiplierBase: number`, `comboMultiplierPerChain: number` |
| `RespawnParams` | `baseRespawnSec: number`, `shortenDropWeightRatioWhenDeadExists: number`, `respawnTimeFormula: string` |
| `DetonateParams` | `baseCooldownSec: number`, `fuseMs: number`, `chainIntervalMs: number`, `cooldownFormula: string` |
| `DropParams` | `baseDropRate: number`, `itemLifetimeMs: number`, `dropRateFormula: string` |
| `CheckpointParams` | `detectionRadiusCells: number`, `countFormula: string` |
| `ScoringParams` | `timeBonusBaseSeconds: number`, `minimumTimeBonusMultiplier: number`, `roundingMode: "round"`, `formula: string` |
| `MovementParams` | `baseCellsPerSec: number`, `wastelandSpeedMultiplier: number`, `dashSpeedMultiplier: number`, `dashDurationMs: number` |
| `RoomParams` | `reconnectGraceSec: number`, `patchRateHz: number`, `maxPlayers: number`, `seatReservationTimeoutSec: number` |
| `InventoryParams` | `baseSlots: number`, `maxSlots: number` |
| `ItemEffectParams` | `catsEyeDurationMs: number`, `disposableLifeDurationMs: number`, `mineRemoverRefs: Record<"cheap" \| "normal" \| "high", string>`, `purifyForwardRangeCells: number`, `bridgeTargetCellType: CellType`, `relayPointPlacementCellType: CellType` |

#### 5.4.3 `items.json` 用 interface

| interface | フィールド |
|---|---|
| `ItemDefinition` | `itemType: ItemType`, `displayName: string`, `manualUse: boolean`, `autoTriggerOnDeath: boolean`, `stackable: boolean`, `maxStack: number`, `targeting: ItemTargeting`, `allowedTargetCellTypes: CellType[]`, `effectKind: ItemEffectKind`, `effectRef?: string`, `durationMs?: number`, `description: string` |
| `ItemTargeting` | `mode: "none" \| "self" \| "grid_coord_required" \| "grid_coord_optional"`, `usesFacingCorrection: boolean`, `requiresLineOfSight: boolean` （Facing4 補正が必要なアイテムは `grid_coord_optional` + `usesFacingCorrection: true` を使用） |

#### 5.4.4 `skills.json` 用 interface

| interface | フィールド |
|---|---|
| `SkillDefinition` | `skillType: SkillType`, `displayName: string`, `rarity: "common" \| "rare"`, `uniquePerRun: boolean`, `stackLimit: number`, `effectKind: SkillEffectKind`, `valueRoll: SkillValueRoll`, `description: string` |
| `SkillValueRoll` | `min: number`, `max: number`, `unit: "seconds" \| "percent" \| "multiplier" \| "cells" \| "flat"`, `notes?: string` |

#### 5.4.5 `stages.json` 用 interface

| interface | フィールド |
|---|---|
| `StagesConfig` | `floors: FloorDefinition[]`, `stages: Record<string, StageDefinition>` |
| `FloorDefinition` | `floorNumber: number`, `stageId: string`, `displayName: string` |
| `StageDefinition` | `stageId: string`, `displayName: string`, `boardProfile: StageBoardProfile`, `holeCoords: GridCoord[]`, `cpCandidateCoords: GridCoord[]`, `spawnGroups: SpawnGroupDefinition[]`, `notes?: string` |
| `StageBoardProfile` | `sizeRuleRef: string`, `mineDensityOverride?: number`, `safeMineRatioOverride?: number`, `dangerousMineRatioOverride?: number`, `cpCountFormulaRef: string`, `erosionFrontlineWidthCap?: number` |
| `SpawnGroupDefinition` | `groupId: string`, `coords: GridCoord[]` |

#### 5.4.6 `rewards.json` 用 interface

| interface | フィールド |
|---|---|
| `RewardsConfig` | `levelUp: LevelUpRewardConfig`, `itemPool: RewardPoolEntry<ItemType>[]`, `skillPool: RewardPoolEntry<SkillType>[]` |
| `LevelUpRewardConfig` | `optionCount: number`, `allowOfferCarryOver: boolean`, `filterFullInventoryItems: boolean`, `filterStackCappedSkills: boolean` |
| `RewardPoolEntry<T>` | `kind: "item" \| "skill"`, `id: T`, `weight: number`, `minFloor?: number`, `maxFloor?: number`, `minLevel?: number`, `maxLevel?: number`, `requiresFreeSlot?: boolean`, `uniquePerRun?: boolean` |

### 5.5 `game-params.json`: 主要パラメータ初期値を完全に受ける JSON 構造

> 以下は説明用 `jsonc`。実ファイルはコメントなし JSON にする。

- `erosion.baseIntervalSec` は **基礎値 10 秒**で、実際の侵食インターバルはフロア数・ステージ特性・プレイヤースキル・アイテム効果を含む `intervalFormula` で算出する。
- `erosion.basePowerCells` は **基礎値 3**で、各フェーズの侵食力は `powerFormula` で算出する。
- 警告時間は `warningIntervalThresholdSec = 4` を境に、4 秒以上なら `warningFixedDurationSec = 3` 秒固定、4 秒未満なら `warningShortIntervalMultiplier = 0.75` を掛ける。

```jsonc
{
  "board": {
    "sizeFormula": "f(playerCount)",
    "minWidth": 20,
    "minHeight": 20,
    "maxWidth": 40,
    "maxHeight": 40,
    "initialSafeZoneWidth": 5,
    "initialSafeZoneHeight": 5
  },
  "mines": {
    "safeMineRatio": 3,
    "dangerousMineRatio": 1,
    "mineDensity": 0.2,
    "erosionSafeMineRatio": 7,
    "erosionDangerousMineRatio": 3
  },
  "erosion": {
    "baseIntervalSec": 10,
    "basePowerCells": 3,
    "warningFixedDurationSec": 3,
    "warningIntervalThresholdSec": 4,
    "warningShortIntervalMultiplier": 0.75,
    "intervalFormula": "shortenByFloorAndMitigateBySkills",
    "powerFormula": "increaseByFloor",
    "takeABreathPauseMs": 0, // 未確定 — 実装時に確定
    "shortBreakPauseMs": 0   // 未確定 — 実装時に確定
  },
  "progression": {
    "levelExpBase": 100,
    "levelExpGrowth": 1.3,
    "comboMultiplierBase": 1.0,
    "comboMultiplierPerChain": 0.1
  },
  "respawn": {
    "baseRespawnSec": 40,
    "shortenDropWeightRatioWhenDeadExists": 0.9,
    "respawnTimeFormula": "baseModifiedByPlayerCountAndSkills"
  },
  "detonate": {
    "baseCooldownSec": 10,
    "fuseMs": 3000,
    "chainIntervalMs": 125,
    "cooldownFormula": "baseModifiedByPlayerCountAndSkills"
  },
  "drop": {
    "baseDropRate": 0.1,
    "itemLifetimeMs": 15000,
    "dropRateFormula": "baseModifiedBySkillsAndRunState"
  },
  "checkpoint": {
    "detectionRadiusCells": 3,
    "countFormula": "stageBasePlusPlayerAdjustment"
  },
  "scoring": {
    "timeBonusBaseSeconds": 600,
    "minimumTimeBonusMultiplier": 1.0,
    "roundingMode": "round",
    "formula": "round(max(minimumTimeBonusMultiplier, timeBonusBaseSeconds / clearTimeSeconds) * floorExp)"
  },
  "movement": {
    "baseCellsPerSec": 2,
    "wastelandSpeedMultiplier": 0.4,
    "dashSpeedMultiplier": 1.5,
    "dashDurationMs": 15000
  },
  "room": {
    "reconnectGraceSec": 60,
    "patchRateHz": 30,
    "maxPlayers": 10,
    "seatReservationTimeoutSec": 15
  },
  "inventory": {
    "baseSlots": 3,
    "maxSlots": 10
  },
  "itemEffects": {
    "catsEyeDurationMs": 0,        // 未確定 — 実装時に確定
    "disposableLifeDurationMs": 0, // 未確定 — 実装時に確定
    "mineRemoverRefs": {
      "cheap": "mine_remover_cheap",
      "normal": "mine_remover_normal",
      "high": "mine_remover_high"
    },
    "purifyForwardRangeCells": 1,
    "bridgeTargetCellType": 4,
    "relayPointPlacementCellType": 0
  }
}
```

### 5.6 `items.json`: 14 種アイテムの完全定義

> 説明用 `jsonc`。数値未確定項目は `effectRef` / `durationMs` で JSON 側に逃がし、rules-core にハードコードしない。

```jsonc
{
  "relay_point": {
    "itemType": "relay_point",
    "displayName": "中継地点",
    "manualUse": true,
    "autoTriggerOnDeath": false,
    "stackable": true,
    "maxStack": 99,
    "targeting": { "mode": "grid_coord_required", "usesFacingCorrection": false, "requiresLineOfSight": false },
    "allowedTargetCellTypes": [0],
    "effectKind": "relay_point_place",
    "description": "Safe セルに Relay Point を設置し、MST 中継ノード兼 detonate 始点を追加する。"
  },
  "dash": {
    "itemType": "dash",
    "displayName": "ダッシュ",
    "manualUse": true,
    "autoTriggerOnDeath": false,
    "stackable": true,
    "maxStack": 99,
    "targeting": { "mode": "self", "usesFacingCorrection": false, "requiresLineOfSight": false },
    "allowedTargetCellTypes": [],
    "effectKind": "dash_buff",
    "durationMs": 15000,
    "description": "15 秒間、移動速度を 1.5 倍にする。"
  },
  "force_ignition": {
    "itemType": "force_ignition",
    "displayName": "強制点火",
    "manualUse": true,
    "autoTriggerOnDeath": false,
    "stackable": true,
    "maxStack": 99,
    "targeting": { "mode": "self", "usesFacingCorrection": false, "requiresLineOfSight": false },
    "allowedTargetCellTypes": [],
    "effectKind": "force_ignition_arm",
    "description": "次回 detonate の CT を 1 回だけ無視する。"
  },
  "mine_remover_cheap": {
    "itemType": "mine_remover_cheap",
    "displayName": "地雷除去機（安い）",
    "manualUse": true,
    "autoTriggerOnDeath": false,
    "stackable": true,
    "maxStack": 99,
    "targeting": { "mode": "grid_coord_optional", "usesFacingCorrection": true, "requiresLineOfSight": false },
    "allowedTargetCellTypes": [1, 2],
    "effectKind": "mine_remover",
    "effectRef": "cheap",
    "description": "Facing 4 方向補正後の前方地雷原を Safe 化する（安価版）。"
  },
  "mine_remover_normal": {
    "itemType": "mine_remover_normal",
    "displayName": "地雷除去機（普通）",
    "manualUse": true,
    "autoTriggerOnDeath": false,
    "stackable": true,
    "maxStack": 99,
    "targeting": { "mode": "grid_coord_optional", "usesFacingCorrection": true, "requiresLineOfSight": false },
    "allowedTargetCellTypes": [1, 2],
    "effectKind": "mine_remover",
    "effectRef": "normal",
    "description": "Facing 4 方向補正後の前方地雷原を Safe 化する（通常版）。"
  },
  "mine_remover_high": {
    "itemType": "mine_remover_high",
    "displayName": "地雷除去機（高い）",
    "manualUse": true,
    "autoTriggerOnDeath": false,
    "stackable": true,
    "maxStack": 99,
    "targeting": { "mode": "grid_coord_optional", "usesFacingCorrection": true, "requiresLineOfSight": false },
    "allowedTargetCellTypes": [1, 2],
    "effectKind": "mine_remover",
    "effectRef": "high",
    "description": "Facing 4 方向補正後の前方地雷原を Safe 化する（高価版）。"
  },
  "cats_eye": {
    "itemType": "cats_eye",
    "displayName": "キャッツアイ",
    "manualUse": true,
    "autoTriggerOnDeath": false,
    "stackable": true,
    "maxStack": 99,
    "targeting": { "mode": "self", "usesFacingCorrection": false, "requiresLineOfSight": false },
    "allowedTargetCellTypes": [],
    "effectKind": "cats_eye_reveal",
    "durationMs": 0, // 未確定 — 実装時に確定
    "description": "全未回収 CP を一時的にチーム全体へ共有表示する。"
  },
  "evacuation": {
    "itemType": "evacuation",
    "displayName": "緊急脱出",
    "manualUse": true,
    "autoTriggerOnDeath": false,
    "stackable": true,
    "maxStack": 99,
    "targeting": { "mode": "self", "usesFacingCorrection": false, "requiresLineOfSight": false },
    "allowedTargetCellTypes": [],
    "effectKind": "teleport_to_respawn",
    "description": "現在のリスポーン地点へ瞬間移動する。"
  },
  "take_a_breath": {
    "itemType": "take_a_breath",
    "displayName": "一息",
    "manualUse": true,
    "autoTriggerOnDeath": false,
    "stackable": true,
    "maxStack": 99,
    "targeting": { "mode": "self", "usesFacingCorrection": false, "requiresLineOfSight": false },
    "allowedTargetCellTypes": [],
    "effectKind": "erosion_pause",
    "durationMs": 0, // 未確定 — 実装時に確定
    "effectRef": "takeABreathPauseMs",
    "description": "侵食を短時間停止する。"
  },
  "short_break": {
    "itemType": "short_break",
    "displayName": "休憩",
    "manualUse": true,
    "autoTriggerOnDeath": false,
    "stackable": true,
    "maxStack": 99,
    "targeting": { "mode": "self", "usesFacingCorrection": false, "requiresLineOfSight": false },
    "allowedTargetCellTypes": [],
    "effectKind": "erosion_pause",
    "durationMs": 0, // 未確定 — 実装時に確定
    "effectRef": "shortBreakPauseMs",
    "description": "侵食を長時間停止する。"
  },
  "bridge": {
    "itemType": "bridge",
    "displayName": "ブリッジ",
    "manualUse": true,
    "autoTriggerOnDeath": false,
    "stackable": true,
    "maxStack": 99,
    "targeting": { "mode": "grid_coord_required", "usesFacingCorrection": false, "requiresLineOfSight": false },
    "allowedTargetCellTypes": [4],
    "effectKind": "bridge_place",
    "description": "指定 Hole セルを Safe 化する。"
  },
  "disposable_life": {
    "itemType": "disposable_life",
    "displayName": "使い捨て命",
    "manualUse": true,
    "autoTriggerOnDeath": true,
    "stackable": true,
    "maxStack": 99,
    "targeting": { "mode": "self", "usesFacingCorrection": false, "requiresLineOfSight": false },
    "allowedTargetCellTypes": [],
    "effectKind": "death_avoidance_buff",
    "durationMs": 0, // 未確定 — 実装時に確定
    "description": "手動使用で一定時間バフを付与し、その間の死亡判定 1 回を回避する。"
  },
  "nine_lives": {
    "itemType": "nine_lives",
    "displayName": "九死に一生",
    "manualUse": false,
    "autoTriggerOnDeath": true,
    "stackable": true,
    "maxStack": 99,
    "targeting": { "mode": "none", "usesFacingCorrection": false, "requiresLineOfSight": false },
    "allowedTargetCellTypes": [],
    "effectKind": "death_avoidance_stock",
    "description": "手動使用なし。死亡判定時に自動消費して死亡を回避する。"
  },
  "purify": {
    "itemType": "purify",
    "displayName": "除染",
    "manualUse": true,
    "autoTriggerOnDeath": false,
    "stackable": true,
    "maxStack": 99,
    "targeting": { "mode": "grid_coord_optional", "usesFacingCorrection": true, "requiresLineOfSight": false },
    "allowedTargetCellTypes": [3],
    "effectKind": "purify_wasteland",
    "effectRef": "purifyForwardRangeCells",
    "description": "Facing 4 方向補正後の前方 1 マスの Wasteland を Safe 化する。"
  }
}
```

### 5.7 `skills.json`: 14 種スキルの完全定義

```jsonc
{
  "chord": {
    "skillType": "chord",
    "displayName": "和音",
    "rarity": "rare",
    "uniquePerRun": true,
    "stackLimit": 1,
    "effectKind": "rare_global_modifier",
    "valueRoll": { "min": 1, "max": 1, "unit": "flat", "notes": "取得は 1 ラン 1 回のみ" },
    "description": "レアスキル。取得後は常時有効。"
  },
  "respawn_time_reduction": {
    "skillType": "respawn_time_reduction",
    "displayName": "蘇生高速化",
    "rarity": "common",
    "uniquePerRun": false,
    "stackLimit": 0,
    "effectKind": "respawn_time_reduction",
    "valueRoll": { "min": 1, "max": 3, "unit": "seconds" },
    "description": "リスポーン時間を短縮する。"
  },
  "movement_speed_boost": {
    "skillType": "movement_speed_boost",
    "displayName": "脚力強化",
    "rarity": "common",
    "uniquePerRun": false,
    "stackLimit": 0,
    "effectKind": "movement_speed_multiplier",
    "valueRoll": { "min": 2, "max": 6, "unit": "percent" },
    "description": "移動速度を上昇させる。"
  },
  "detonate_cooldown_reduction": {
    "skillType": "detonate_cooldown_reduction",
    "displayName": "点火短縮",
    "rarity": "common",
    "uniquePerRun": false,
    "stackLimit": 0,
    "effectKind": "detonate_cooldown_reduction",
    "valueRoll": { "min": 0.5, "max": 1, "unit": "seconds" },
    "description": "Detonate CT を短縮する。"
  },
  "exp_gain_boost": {
    "skillType": "exp_gain_boost",
    "displayName": "経験値増幅",
    "rarity": "common",
    "uniquePerRun": false,
    "stackLimit": 0,
    "effectKind": "exp_gain_multiplier",
    "valueRoll": { "min": 5, "max": 20, "unit": "percent" },
    "description": "経験値獲得量を増やす。"
  },
  "combo_multiplier_boost": {
    "skillType": "combo_multiplier_boost",
    "displayName": "コンボ強化",
    "rarity": "common",
    "uniquePerRun": false,
    "stackLimit": 0,
    "effectKind": "combo_multiplier_bonus",
    "valueRoll": { "min": 0.05, "max": 0.2, "unit": "multiplier" },
    "description": "Detonate コンボ倍率を増やす。"
  },
  "erosion_cooldown_increase": {
    "skillType": "erosion_cooldown_increase",
    "displayName": "侵食遅延",
    "rarity": "common",
    "uniquePerRun": false,
    "stackLimit": 0,
    "effectKind": "erosion_interval_extension",
    "valueRoll": { "min": 5, "max": 10, "unit": "percent" },
    "description": "侵食インターバルを延長する。"
  },
  "item_drop_rate_boost": {
    "skillType": "item_drop_rate_boost",
    "displayName": "ドロップ強化",
    "rarity": "common",
    "uniquePerRun": false,
    "stackLimit": 0,
    "effectKind": "drop_rate_bonus",
    "valueRoll": { "min": 2, "max": 4, "unit": "percent" },
    "description": "アイテムドロップ率を上げる。"
  },
  "item_pickup_range_boost": {
    "skillType": "item_pickup_range_boost",
    "displayName": "吸着範囲強化",
    "rarity": "common",
    "uniquePerRun": false,
    "stackLimit": 0,
    "effectKind": "pickup_radius_bonus",
    "valueRoll": { "min": 0.2, "max": 0.5, "unit": "cells" },
    "description": "地上アイテムの自動取得半径を広げる。"
  },
  "item_slot_increase": {
    "skillType": "item_slot_increase",
    "displayName": "所持枠拡張",
    "rarity": "common",
    "uniquePerRun": false,
    "stackLimit": 7,
    "effectKind": "inventory_slot_bonus",
    "valueRoll": { "min": 1, "max": 1, "unit": "flat" },
    "description": "インベントリ所持枠を +1 する。"
  },
  "cp_detection_range_boost": {
    "skillType": "cp_detection_range_boost",
    "displayName": "CP 感知拡張",
    "rarity": "common",
    "uniquePerRun": false,
    "stackLimit": 0,
    "effectKind": "cp_detection_radius_bonus",
    "valueRoll": { "min": 0.5, "max": 0.5, "unit": "cells" },
    "description": "CP 検知範囲を拡張する。"
  },
  "erosion_forewarning": {
    "skillType": "erosion_forewarning",
    "displayName": "侵食予知",
    "rarity": "common",
    "uniquePerRun": false,
    "stackLimit": 0,
    "effectKind": "erosion_warning_bonus",
    "valueRoll": { "min": 0.5, "max": 0.5, "unit": "seconds" },
    "description": "侵食警告表示を早める。"
  },
  "death_item_keep_chance": {
    "skillType": "death_item_keep_chance",
    "displayName": "遺失物保持",
    "rarity": "common",
    "uniquePerRun": false,
    "stackLimit": 0,
    "effectKind": "death_item_keep_chance",
    "valueRoll": { "min": 5, "max": 5, "unit": "percent" },
    "description": "死亡時のアイテム保持確率を上げる。"
  },
  "wasteland_speed_reduction": {
    "skillType": "wasteland_speed_reduction",
    "displayName": "荒地適応",
    "rarity": "common",
    "uniquePerRun": false,
    "stackLimit": 0,
    "effectKind": "wasteland_penalty_reduction",
    "valueRoll": { "min": 2, "max": 5, "unit": "percent" },
    "description": "荒地移動速度ペナルティを軽減する。"
  }
}
```

### 5.8 `stages.json`: フロア / ステージ定義の JSON 構造

```jsonc
{
  "floors": [
    { "floorNumber": 1, "stageId": "floor01_intro", "displayName": "Floor 1" },
    { "floorNumber": 2, "stageId": "floor02_cross", "displayName": "Floor 2" },
    { "floorNumber": 3, "stageId": "floor03_split", "displayName": "Floor 3" },
    { "floorNumber": 4, "stageId": "floor04_ring", "displayName": "Floor 4" },
    { "floorNumber": 5, "stageId": "floor05_bridge", "displayName": "Floor 5" },
    { "floorNumber": 6, "stageId": "floor06_pockets", "displayName": "Floor 6" },
    { "floorNumber": 7, "stageId": "floor07_wide", "displayName": "Floor 7" },
    { "floorNumber": 8, "stageId": "floor08_labyrinth", "displayName": "Floor 8" },
    { "floorNumber": 9, "stageId": "floor09_pressure", "displayName": "Floor 9" },
    { "floorNumber": 10, "stageId": "floor10_finale", "displayName": "Floor 10" }
  ],
  "stages": {
    "floor01_intro": {
      "stageId": "floor01_intro",
      "displayName": "Intro Grid",
      "boardProfile": {
        "sizeRuleRef": "board.sizeFormula",
        "cpCountFormulaRef": "checkpoint.countFormula",
        "erosionFrontlineWidthCap": 4
      },
      "holeCoords": [{ "x": 15, "y": 10 }, { "x": 16, "y": 10 }],
      "cpCandidateCoords": [{ "x": 8, "y": 3 }, { "x": 3, "y": 8 }, { "x": 12, "y": 14 }],
      "spawnGroups": [
        { "groupId": "g1", "coords": [{ "x": 2, "y": 2 }, { "x": 3, "y": 2 }] },
        { "groupId": "g2", "coords": [{ "x": 2, "y": 3 }, { "x": 3, "y": 3 }, { "x": 4, "y": 3 }] }
      ],
      "notes": "MVP では floor ごとに stage 1 件固定。各 stage は Hole, CP 候補, spawn groups を authoring する。"
    },
    "floor02_cross": { "stageId": "floor02_cross", "displayName": "Cross", "boardProfile": { "sizeRuleRef": "board.sizeFormula", "cpCountFormulaRef": "checkpoint.countFormula" }, "holeCoords": [], "cpCandidateCoords": [], "spawnGroups": [] },
    "floor03_split": { "stageId": "floor03_split", "displayName": "Split", "boardProfile": { "sizeRuleRef": "board.sizeFormula", "cpCountFormulaRef": "checkpoint.countFormula" }, "holeCoords": [], "cpCandidateCoords": [], "spawnGroups": [] },
    "floor04_ring": { "stageId": "floor04_ring", "displayName": "Ring", "boardProfile": { "sizeRuleRef": "board.sizeFormula", "cpCountFormulaRef": "checkpoint.countFormula" }, "holeCoords": [], "cpCandidateCoords": [], "spawnGroups": [] },
    "floor05_bridge": { "stageId": "floor05_bridge", "displayName": "Bridge", "boardProfile": { "sizeRuleRef": "board.sizeFormula", "cpCountFormulaRef": "checkpoint.countFormula" }, "holeCoords": [], "cpCandidateCoords": [], "spawnGroups": [] },
    "floor06_pockets": { "stageId": "floor06_pockets", "displayName": "Pockets", "boardProfile": { "sizeRuleRef": "board.sizeFormula", "cpCountFormulaRef": "checkpoint.countFormula" }, "holeCoords": [], "cpCandidateCoords": [], "spawnGroups": [] },
    "floor07_wide": { "stageId": "floor07_wide", "displayName": "Wide", "boardProfile": { "sizeRuleRef": "board.sizeFormula", "cpCountFormulaRef": "checkpoint.countFormula" }, "holeCoords": [], "cpCandidateCoords": [], "spawnGroups": [] },
    "floor08_labyrinth": { "stageId": "floor08_labyrinth", "displayName": "Labyrinth", "boardProfile": { "sizeRuleRef": "board.sizeFormula", "cpCountFormulaRef": "checkpoint.countFormula" }, "holeCoords": [], "cpCandidateCoords": [], "spawnGroups": [] },
    "floor09_pressure": { "stageId": "floor09_pressure", "displayName": "Pressure", "boardProfile": { "sizeRuleRef": "board.sizeFormula", "cpCountFormulaRef": "checkpoint.countFormula" }, "holeCoords": [], "cpCandidateCoords": [], "spawnGroups": [] },
    "floor10_finale": { "stageId": "floor10_finale", "displayName": "Finale", "boardProfile": { "sizeRuleRef": "board.sizeFormula", "cpCountFormulaRef": "checkpoint.countFormula" }, "holeCoords": [], "cpCandidateCoords": [], "spawnGroups": [] }
  }
}
```

### 5.9 `rewards.json`: 報酬テーブルの JSON 構造

```jsonc
{
  "levelUp": {
    "optionCount": 3, // 初期値。最終調整は playtest で見直し可
    "allowOfferCarryOver": true,
    "filterFullInventoryItems": true, // true の場合、アイテム報酬は「新規スロットが必要だが空きがない、かつ同種スタックも満杯」のとき候補から除外する
    "filterStackCappedSkills": true
  },
  "itemPool": [
    { "kind": "item", "id": "relay_point", "weight": 1 },
    { "kind": "item", "id": "dash", "weight": 1 },
    { "kind": "item", "id": "force_ignition", "weight": 1, "minFloor": 3 },
    { "kind": "item", "id": "mine_remover_cheap", "weight": 1 },
    { "kind": "item", "id": "mine_remover_normal", "weight": 1 },
    { "kind": "item", "id": "mine_remover_high", "weight": 1, "minFloor": 5 },
    { "kind": "item", "id": "cats_eye", "weight": 1 },
    { "kind": "item", "id": "evacuation", "weight": 1 },
    { "kind": "item", "id": "take_a_breath", "weight": 1 },
    { "kind": "item", "id": "short_break", "weight": 1 },
    { "kind": "item", "id": "bridge", "weight": 1, "minFloor": 2 },
    { "kind": "item", "id": "disposable_life", "weight": 1 },
    { "kind": "item", "id": "nine_lives", "weight": 1, "minLevel": 3 },
    { "kind": "item", "id": "purify", "weight": 1 }
  ],
  "skillPool": [
    { "kind": "skill", "id": "chord", "weight": 1, "uniquePerRun": true, "minFloor": 5 },
    { "kind": "skill", "id": "respawn_time_reduction", "weight": 1 },
    { "kind": "skill", "id": "movement_speed_boost", "weight": 1 },
    { "kind": "skill", "id": "detonate_cooldown_reduction", "weight": 1, "minLevel": 2 },
    { "kind": "skill", "id": "exp_gain_boost", "weight": 1 },
    { "kind": "skill", "id": "combo_multiplier_boost", "weight": 1, "minFloor": 3 },
    { "kind": "skill", "id": "erosion_cooldown_increase", "weight": 1 },
    { "kind": "skill", "id": "item_drop_rate_boost", "weight": 1 },
    { "kind": "skill", "id": "item_pickup_range_boost", "weight": 1 },
    { "kind": "skill", "id": "item_slot_increase", "weight": 1, "minLevel": 2 },
    { "kind": "skill", "id": "cp_detection_range_boost", "weight": 1 },
    { "kind": "skill", "id": "erosion_forewarning", "weight": 1, "minFloor": 4 },
    { "kind": "skill", "id": "death_item_keep_chance", "weight": 1 },
    { "kind": "skill", "id": "wasteland_speed_reduction", "weight": 1 }
  ]
}
```

### 5.10 config 実装ステップ

| 順序 | ステップ | 依存 | 並行/ブロッカー | 補足 |
|---|---|---|---|---|
| 1 | package 雛形、`types.ts`, `loadConfig.ts`, `validateConfig.ts` 作成 | `protocol` | ブロッカー | enum ベースの型定義を先に固める |
| 2 | `game-params.json` 実装 | 1 | ブロッカー | `api.md` の主要パラメータ初期値を完全反映 |
| 3 | `items.json` 実装 | 1,2 | `skills.json` と並行可 | 14 アイテム全件 |
| 4 | `skills.json` 実装 | 1,2 | `items.json` と並行可 | 14 スキル全件 |
| 5 | `stages.json` の shape 実装 | 1,2 | `rewards.json` と並行可 | floor→stage 割当と stage authoring slot |
| 6 | `rewards.json` 実装 | 1,3,4 | `stages.json` と並行可 | offer 生成プール |
| 7 | `validateConfig.ts` で enum / 重複 / 参照整合チェック | 2,3,4,5,6 | ブロッカー | `effectRef`, `stageId`, `reward id` を検証 |
| 8 | immutable loader / deep freeze / consumer export 整備 | 7 | 最終確認 | server と rules-core から同一形を読む |

### 5.11 config 実装時の依存とブロッカー

- **ブロッカーC2**: `ItemType`, `SkillType`, `CellType` が `protocol` に存在しないと JSON validation が書けない。
- **ブロッカーC3**: `rewards.json` は `items.json` / `skills.json` 完了前に確定できない。
- **並行可能**: `stages.json` authoring shape と `rewards.json` shape は独立。
- **server 連携上の注意**: 未確定数値は JSON 内に残し、`rules-core` 側で default fallback を持たない。

---

## 6. `packages/schema`

### 6.1 役割と責務

- Colyseus で **全員に同期する public gameplay state** を定義する。
- `api.md` の Shared Schema 節をそのまま class 化する。
- `Private State` は持たない。inventory / pending reward / skill stacks / timers / input buffer は schema 外。
- room patch の単位を最小化しつつ、`apps/client` が描画に必要な値を十分に持てる形にする。
- utility は「schema class の利用補助」に限り、ルール計算本体は `rules-core` へ寄せる。

### 6.2 推奨ディレクトリ構成

```text
packages/schema/
  package.json
  tsconfig.json
  src/
    index.ts
    CellState.ts
    GridState.ts
    FloorState.ts
    ErosionState.ts
    CheckpointState.ts
    GroundItemState.ts
    PlayerState.ts
    GameState.ts
    utils/
      coords.ts
      cells.ts
      checkpoints.ts
      collections.ts
      reset.ts
  test/
    serialization.test.ts
    schema-utils.test.ts
```

### 6.3 ファイル構成テーブル

| ファイル | 責務 |
|---|---|
| `src/CellState.ts` | 1 セルの公開同期状態 |
| `src/GridState.ts` | width / height / flat cells 配列 |
| `src/FloorState.ts` | 現フロアのメタ情報 |
| `src/ErosionState.ts` | 侵食 warning / active 状態 |
| `src/CheckpointState.ts` | CP 1 件 |
| `src/GroundItemState.ts` | 地上ドロップ 1 件 |
| `src/PlayerState.ts` | プレイヤー公開状態 |
| `src/GameState.ts` | room の root schema |
| `src/utils/coords.ts` | 座標⇔index / key 変換 |
| `src/utils/cells.ts` | grid access 補助 |
| `src/utils/checkpoints.ts` | checkpoint map 補助 |
| `src/utils/collections.ts` | MapSchema / ArraySchema 更新補助 |
| `src/utils/reset.ts` | floor clear / floor start 向け public state reset 補助 |

### 6.4 各 class の完全な `@type()` フィールド定義

#### 6.4.1 `CellState`

```ts
export class CellState extends Schema {
  @type("number")
  cellType: number;

  @type("number")
  adjacentMineCount: number;

  @type("boolean")
  flagged: boolean = false;

  @type("boolean")
  hasRelayPoint: boolean = false;

  @type("boolean")
  erosionWarning: boolean = false;
}
```

- フィールド数: **5**
- 爆発・侵食でセル変化する際、`flagged` と `hasRelayPoint` は同時に落とす。

#### 6.4.2 `GridState`

```ts
export class GridState extends Schema {
  @type("number")
  width: number;

  @type("number")
  height: number;

  @type([CellState])
  cells: ArraySchema<CellState> = new ArraySchema();
}
```

- フィールド数: **3**
- 多次元配列禁止のため flat array 固定。

#### 6.4.3 `FloorState`

```ts
export class FloorState extends Schema {
  @type("string")
  stageId: string;

  @type("number")
  floorStartedAt: number;

  @type("number")
  cpTotal: number;

  @type("number")
  cpCollected: number;
}
```

- フィールド数: **4**

#### 6.4.4 `ErosionState`

```ts
export class ErosionState extends Schema {
  @type("boolean")
  active: boolean = true;

  @type("number")
  nextWarningAt: number;

  @type("number")
  nextConversionAt: number;

  @type(["string"])
  warningCellKeys: ArraySchema<string> = new ArraySchema();
}
```

- フィールド数: **4**

#### 6.4.5 `CheckpointState`

```ts
export class CheckpointState extends Schema {
  @type("string")
  cpId: string;

  @type("number")
  x: number;

  @type("number")
  y: number;

  @type("boolean")
  collected: boolean = false;

  @type("string")
  collectedBySessionId: string = "";
}
```

- フィールド数: **5**
- CP 座標は非秘密扱いなので常時同期する。

#### 6.4.6 `GroundItemState`

```ts
export class GroundItemState extends Schema {
  @type("string")
  groundItemId: string;

  @type("string")
  itemType: string;

  @type("number")
  x: number;

  @type("number")
  y: number;

  @type("number")
  stackCount: number = 1;

  @type("number")
  expiresAt: number;
}
```

- フィールド数: **6**

#### 6.4.7 `PlayerState`

```ts
export class PlayerState extends Schema {
  @type("string")
  sessionId: string;

  @type("string")
  displayName: string;

  @type("number")
  x: number;

  @type("number")
  y: number;

  @type("number")
  facing: number;

  @type("number")
  lifeState: number;

  @type("number")
  respawnAt: number;

  @type("number")
  level: number = 1;

  @type("number")
  exp: number = 0;

  @type("number")
  pendingRewardCount: number = 0;
}
```

- フィールド数: **10**
- inventory を載せないことが重要。private state をここへ戻さない。

#### 6.4.8 `GameState`

```ts
export class GameState extends Schema {
  @type("number")
  phase: number;

  @type("number")
  floorNumber: number;

  @type(FloorState)
  floor: FloorState;

  @type(GridState)
  grid: GridState;

  @type(ErosionState)
  erosion: ErosionState;

  @type("number")
  totalScore: number = 0;

  @type({ map: PlayerState })
  players: MapSchema<PlayerState> = new MapSchema();

  @type({ map: GroundItemState })
  groundItems: MapSchema<GroundItemState> = new MapSchema();

  @type({ map: CheckpointState })
  checkpoints: MapSchema<CheckpointState> = new MapSchema();
}
```

- フィールド数: **9**
- `MapSchema` キーは文字列のみ。

### 6.5 `utils/` の各ファイルと具体的シグネチャ

#### 6.5.1 `utils/coords.ts`

```ts
export function coordToIndex(x: number, y: number, width: number): number;
export function indexToCoord(index: number, width: number): GridCoord;
export function toCellKey(coord: GridCoord): string;
export function fromCellKey(cellKey: string): GridCoord;
export function isInBounds(x: number, y: number, width: number, height: number): boolean;
```

#### 6.5.2 `utils/cells.ts`

```ts
export function getCell(grid: GridState, coord: GridCoord): CellState | undefined;
export function requireCell(grid: GridState, coord: GridCoord): CellState;
export function setCellFlags(cell: CellState, next: Pick<CellState, "flagged" | "hasRelayPoint" | "erosionWarning">): void;
export function clearCellTransientMarks(cell: CellState): void;
```

#### 6.5.3 `utils/checkpoints.ts`

```ts
export function createCheckpointState(input: { cpId: string; coord: GridCoord }): CheckpointState;
export function markCheckpointCollected(checkpoint: CheckpointState, collectorSessionId: string): void;
export function listRemainingCheckpointIds(checkpoints: MapSchema<CheckpointState>): string[];
```

#### 6.5.4 `utils/collections.ts`

```ts
export function upsertPlayerState(gameState: GameState, player: PlayerState): void;
export function upsertGroundItemState(gameState: GameState, groundItem: GroundItemState): void;
export function resetStringArray(target: ArraySchema<string>, values: string[]): void;
```

#### 6.5.5 `utils/reset.ts`

```ts
export function clearAllFlagsAndRelayPoints(grid: GridState): void;
export function clearAllErosionWarnings(grid: GridState, erosionState: ErosionState): void;
export function convertAllMineCellsToSafe(grid: GridState): void;
export function resetPlayersForNewFloor(players: MapSchema<PlayerState>, spawnBySessionId: Map<string, GridCoord>): void;
```

### 6.6 schema 実装ステップ

| 順序 | ステップ | 依存 | 並行/ブロッカー | 補足 |
|---|---|---|---|---|
| 1 | package 雛形、`index.ts` 作成 | `protocol` | ブロッカー | `@colyseus/schema` 依存もここで追加 |
| 2 | leaf schema (`CellState`, `FloorState`, `ErosionState`, `CheckpointState`, `GroundItemState`, `PlayerState`) 実装 | 1 | 並行可 | 64 フィールド制約に注意 |
| 3 | `GridState`, `GameState` 実装 | 2 | ブロッカー | ルート構造を確定 |
| 4 | `utils/coords.ts` と `utils/cells.ts` 実装 | 3 | `checkpoints.ts` と並行可 | flat array 規約を固定 |
| 5 | `utils/checkpoints.ts`, `collections.ts`, `reset.ts` 実装 | 3 | 並行可 | server の定型更新を簡略化 |
| 6 | serialize / patch safety test 追加 | 2,3,4,5 | 最終確認 | room 実装前に破綻を検出 |

### 6.7 schema 実装のブロッカーと注意点

- `GridState.cells` の flat array 規約は **最初に固定**し、途中で `cells[y][x]` 的 helper を入れない。
- `PlayerState` に inventory を入れないことが最大のガードレール。
- `warningCellKeys` は `ArraySchema<string>` のため、`"x,y"` の key format を `utils/coords.ts` で固定する。
- `CellState.adjacentMineCount` は **すべての Safe セルに対して内部的には常に保持**し、描画時のみ `0` を非表示にする前提で扱う。
- `GameState.checkpoints` は Cat's Eye の有無に関係なく常時全量同期する。

---

## 7. `packages/rules-core`

### 7.1 役割と責務

- pure function だけを持つ **ゲームルールの中核 package**。
- `schema` に依存せず、plain object / DTO を入力に受けて DTO を返す。
- `apps/server` の room / services はこの結果を public state 反映・private send・queue 操作へ変換する。
- deterministic な tie-break と seed 制御をここに閉じる。
- `protocol` で定義した enum / shared type を使用し、`config` の JSON を引数で受け取って数式を解く。

### 7.2 推奨ディレクトリ構成

```text
packages/rules-core/
  package.json
  tsconfig.json
  src/
    index.ts
    types.ts
    random/
      SeededRng.ts
    grid/
      coords.ts
      neighbors.ts
      adjacent-mine-count.ts
      flood-fill.ts
      frontline.ts
    movement/
      speed.ts
      facing.ts
      collision.ts
    dig/
      resolve-dig.ts
    detonate/
      build-preview.ts
      resolve-detonate.ts
    explosion/
      resolve-unmanaged.ts
    erosion/
      plan-warning.ts
      apply-conversion.ts
    checkpoint/
      placement.ts
      detection.ts
    drop/
      roll-drop.ts
    progression/
      exp.ts
      leveling.ts
      skill-modifiers.ts
    scoring/
      score.ts
    lifecycle/
      spawn-selection.ts
      respawn-placement.ts
      floor-transition.ts
    reward/
      reward-offer.ts
      reward-apply.ts
      inventory-mutation.ts
  test/
    golden/
      detonate/*.json
      erosion/*.json
      floor-transition/*.json
```

### 7.3 ファイル構成テーブル

| ファイル | 責務 |
|---|---|
| `src/types.ts` | rules-core 内で共通利用する DTO と result 型 |
| `src/random/SeededRng.ts` | seed 固定テスト用 RNG wrapper |
| `src/grid/coords.ts` | index / key / distance 補助 |
| `src/grid/neighbors.ts` | 4 近傍 / 8 近傍 / BFS 補助 |
| `src/grid/adjacent-mine-count.ts` | Safe セルの数字再計算 |
| `src/grid/flood-fill.ts` | SafeMine dig 後のゼロ領域開放 |
| `src/grid/frontline.ts` | erosion frontline 抽出（8近傍ベース） |
| `src/movement/speed.ts` | 移動速度式 |
| `src/movement/facing.ts` | facing 更新 / 4 方向補正 |
| `src/movement/collision.ts` | Alive プレイヤーの AABB 衝突解決 |
| `src/dig/resolve-dig.ts` | dig の pure resolution |
| `src/detonate/build-preview.ts` | provisional MST preview |
| `src/detonate/resolve-detonate.ts` | fuse 到達時の rooted Prim + chain step 計画 |
| `src/explosion/resolve-unmanaged.ts` | DangerousMine 誤掘り爆発と BFS 連鎖 |
| `src/erosion/plan-warning.ts` | warning 対象選定 |
| `src/erosion/apply-conversion.ts` | erosion convert 適用結果 |
| `src/checkpoint/placement.ts` | CP 配置座標選定 |
| `src/checkpoint/detection.ts` | 検知半径計算 / overlap 判定 |
| `src/drop/roll-drop.ts` | dig / discard / respawn-shorten 抽選 |
| `src/progression/exp.ts` | dig / detonate combo EXP 算出 |
| `src/progression/leveling.ts` | level 閾値 / level up 解決 |
| `src/progression/skill-modifiers.ts` | skill stacks 集約と補正値算出 |
| `src/scoring/score.ts` | floor score / total score |
| `src/lifecycle/spawn-selection.ts` | initial spawn / mid-game join spawn |
| `src/lifecycle/respawn-placement.ts` | respawn 座標 / shorten 計算 |
| `src/lifecycle/floor-transition.ts` | floor clear → rest → next floor の純粋遷移計画 |
| `src/reward/reward-offer.ts` | reward offer 生成と候補フィルタ |
| `src/reward/reward-apply.ts` | claim_reward の効果適用 |
| `src/reward/inventory-mutation.ts` | item add/remove/stack/consume 純粋関数 |

### 7.4 rules-core 共通 DTO（`src/types.ts`）

| 型名 | 主要フィールド |
|---|---|
| `RulesCell` | `cellType: CellType`, `adjacentMineCount: number`, `flagged: boolean`, `hasRelayPoint: boolean`, `erosionWarning: boolean` |
| `RulesGrid` | `width: number`, `height: number`, `cells: RulesCell[]` |
| `RulesPlayer` | `sessionId: string`, `position: Vec2`, `facing: Facing8`, `lifeState: PlayerLifeState`, `respawnAt: number`, `level: number`, `exp: number`, `pendingRewardCount: number` |
| `SkillStackEntry` | `skillType: SkillType`, `effectValue: number` |
| `RulesInventory` | `slots: InventorySlot[]`, `maxSlots: number` |
| `GroundItemDropModel` | `groundItemId: string`, `itemType: ItemType`, `coord: GridCoord`, `stackCount: number`, `expiresAt: number` |
| `CheckpointModel` | `cpId: string`, `coord: GridCoord`, `collected: boolean`, `collectedBySessionId?: string` |
| `TransitionTimerSnapshot` | `pendingDetonates: string[]`, `pendingUnmanagedCount: number`, `pendingErosionWarning: boolean`, `pendingErosionConvert: boolean`, `pendingRespawns: string[]`, `pendingItemExpiries: string[]`, `pendingEffectExpiries: string[]`, `pendingFutureEvents: boolean` |

### 7.5 各ファイルの具体的関数シグネチャと入出力型

#### 7.5.1 grid /

```ts
export function linearIndexOf(coord: GridCoord, width: number): number;
export function coordOf(index: number, width: number): GridCoord;
export function chebyshevDistance(a: GridCoord, b: GridCoord): number;
export function manhattanDistance(a: GridCoord, b: GridCoord): number;
export function euclideanDistanceSquared(a: GridCoord, b: GridCoord): number;
```

```ts
export function getNeighbors4(coord: GridCoord, grid: RulesGrid): GridCoord[];
export function getNeighbors8(coord: GridCoord, grid: RulesGrid): GridCoord[];
export function bfs<T>(input: { start: GridCoord[]; visit: (coord: GridCoord) => T | null }): T[];
```

```ts
export function recomputeAdjacentMineCount(grid: RulesGrid, coord: GridCoord): number;
export function recomputeAdjacentMineCounts(grid: RulesGrid, coords: GridCoord[]): GridCoord[];
```

```ts
export function floodRevealFromSafeCell(input: {
  grid: RulesGrid;
  startCoord: GridCoord;
}): {
  revealedCoords: GridCoord[];
  updatedGrid: RulesGrid;
};
```

```ts
export function extractFrontlineCoords(grid: RulesGrid): GridCoord[];
export function selectFrontlineTargets(input: {
  grid: RulesGrid;
  frontline: GridCoord[];
  targetCount: number;
  widthCap: number;
  rng: SeededRng;
}): GridCoord[];
```

#### 7.5.2 movement /

```ts
export function calculateMovementSpeed(input: {
  config: GameParamsConfig;
  onWasteland: boolean;
  dashActive: boolean;
  movementSpeedBoostRatio: number;
  wastelandPenaltyReductionRatio: number;
}): number;
```

```ts
export function resolveFacing8(input: {
  previousFacing: Facing8;
  vx: number;
  vy: number;
}): Facing8;

export function projectFacingToAxis4(facing: Facing8): Facing4;
```

```ts
export function resolveAlivePlayerCollisions(input: {
  alivePlayers: Array<{ sessionId: string; position: Vec2 }>;
  radius: Vec2;
}): Map<string, Vec2>;
```

#### 7.5.3 dig /

```ts
export function resolveDig(input: {
  grid: RulesGrid;
  actor: RulesPlayer;
  target: GridCoord;
  config: GameParamsConfig;
}):
  | { kind: "invalid"; errorCode: ErrorCode }
  | {
      kind: "safe_dig";
      updatedGrid: RulesGrid;
      revealedCoords: GridCoord[];
      adjacentUpdatedCoords: GridCoord[];
    }
  | {
      kind: "dangerous_trigger";
      epicenterCoord: GridCoord;
    };
```

#### 7.5.4 detonate /

```ts
export function buildDetonatePreview(input: {
  grid: RulesGrid;
  sourceCoord: GridCoord;
}): {
  sourceCoord: GridCoord;
  provisionalPath: GridCoord[];
};
```

```ts
export function resolveDetonateChain(input: {
  grid: RulesGrid;
  sourceCoord: GridCoord;
  initiatorSessionId: string;
  chainIntervalMs: number;
}): {
  updatedGrid: RulesGrid;
  processedCells: GridCoord[];
  chainSteps: Array<{
    atOffsetMs: number;
    coord: GridCoord;
    cellTypeBefore: CellType;
    wasRelayPoint: boolean;
    remainingPath: GridCoord[];
  }>;
  safeMineCellsConverted: number;
  dangerousMineCellsConverted: number;
};
```

#### 7.5.5 explosion /

```ts
export function triggerUnmanagedExplosion(input: {
  grid: RulesGrid;
  epicenterCoord: GridCoord;
  chainIntervalMs: number;
}): {
  initialBlastCoords: GridCoord[];
  initialWastelandCoords: GridCoord[];
  updatedGrid: RulesGrid;
  chainEntries: Array<{ coord: GridCoord; chainDepth: number; atOffsetMs: number }>;
};
```

```ts
export function resolveUnmanagedChainStep(input: {
  grid: RulesGrid;
  coord: GridCoord;
  chainDepth: number;
}): {
  updatedGrid: RulesGrid;
  blastCoords: GridCoord[];
  wastelandCoords: GridCoord[];
  nextDangerousCoords: GridCoord[];
};
```

#### 7.5.6 erosion /

```ts
export function planErosionWarning(input: {
  grid: RulesGrid;
  targetCount: number;
  widthCap: number;
  rng: SeededRng;
}): {
  targetCoords: GridCoord[];
};
```

- `extractFrontlineCoords()` は、**地雷原または荒地が周囲八マス以内に存在する Safe セル**を返す。
- `selectFrontlineTargets()` は frontline からランダムに 1 マスを起点選択し、左右探索で `targetCount` ぶんの Safe セルを選ぶ。
- 左右探索が stage ごとの `widthCap` に達したら、地雷原・荒地・今回選定済み Safe セルが周囲八マス以内にあり、かつ直前探索で frontline ではなかった Safe セル群を新 frontline として再探索する。
- 以後も新 frontline からランダムに 1 マスを起点選択し、左右探索を繰り返す。
- 直前に frontline だったが選定されなかったセルは同一フェーズ内では再探索しない。探索回数は `targetCount` を超えない。
- `planErosionWarning()` が返す `targetCoords` は、**左右探索で選定された Safe セル**に、**その時点で盤面上に存在する全 Wasteland セル**を加えた warning / convert 対象の和集合とする。
- `erosion_warn` を処理した時点で、現在 warning 中の `erosion_convert` だけでなく、**次インターバル分の次回 `erosion_warn` も同時に予約**する。警告と次インターバルは並行して進行する。

```ts
export function applyErosionConversion(input: {
  grid: RulesGrid;
  targetCoords: GridCoord[];
  safeMineRatio: number;
  dangerousMineRatio: number;
  rng: SeededRng;
}): {
  updatedGrid: RulesGrid;
  convertedSafeMineCoords: GridCoord[];
  convertedDangerousMineCoords: GridCoord[];
  updatedAdjacentCoords: GridCoord[];
};
```

- `applyErosionConversion()` は `targetCoords` に含まれる **Wasteland + 選定済み Safe セル**を `SafeMine` / `DangerousMine` へ再配置し、周囲八マスの Safe セルで `adjacentMineCount` を再計算する。これにより `0 -> 非0` の更新が起こりうる。

#### 7.5.7 checkpoint /

```ts
export function selectCheckpointCoords(input: {
  candidateCoords: GridCoord[];
  holeCoords: GridCoord[];
  initialSafeZoneCoords: GridCoord[];
  cpCount: number;
  rng: SeededRng;
}): GridCoord[];
```

```ts
export function detectCheckpointsInRange(input: {
  playerCoord: Vec2;
  checkpoints: CheckpointModel[];
  detectionRadius: number;
}): string[];

export function collectCheckpointOnOverlap(input: {
  playerCoord: Vec2;
  checkpoints: CheckpointModel[];
}): CheckpointModel | null;
```

#### 7.5.8 drop /

```ts
export function rollGroundDrop(input: {
  rng: SeededRng;
  dropRate: number;
  rewardsConfig: RewardsConfig;
  itemsConfig: Record<ItemType, ItemDefinition>;
  deadPlayerExists: boolean;
}): { itemType: ItemType; stackCount: number } | null;
```

#### 7.5.9 progression /

```ts
export function calculateDigExp(input: {
  revealedCellCount: number;
  expGainBoostRatio: number;
}): number;

export function calculateDetonateComboExp(input: {
  dangerousMineCellsConverted: number;
  comboMultiplier: number;
  expGainBoostRatio: number;
}): number;
```

```ts
export function requiredExpForLevel(level: number, config: GameParamsConfig): number;
export function resolveLevelProgression(input: {
  currentLevel: number;
  currentExp: number;
  gainedExp: number;
  config: GameParamsConfig;
}): {
  newLevel: number;
  totalExp: number;
  leveledUpCount: number;
};
```

```ts
export function aggregateSkillModifiers(stacks: SkillStackEntry[]): {
  movementSpeedBoostRatio: number;
  detonateCooldownReductionSec: number;
  expGainBoostRatio: number;
  comboMultiplierBonus: number;
  erosionCooldownIncreaseRatio: number;
  itemDropRateBoostRatio: number;
  itemPickupRangeBoostCells: number;
  itemSlotIncreaseCount: number;
  cpDetectionRangeBoostCells: number;
  erosionForewarningSec: number;
  deathItemKeepChanceRatio: number;
  wastelandPenaltyReductionRatio: number;
  respawnReductionSec: number;
  chordOwned: boolean;
};
```

#### 7.5.10 scoring /

```ts
export function calculateFloorScore(input: {
  floorExp: number;
  clearTimeSeconds: number;
  config: GameParamsConfig;
}): {
  floorScore: number;
  timeBonusMultiplier: number;
};
```

#### 7.5.11 lifecycle /

```ts
export function pickInitialSpawnAssignments(input: {
  spawnGroups: SpawnGroupDefinition[];
  sessionIds: string[];
  rng: SeededRng;
}): Map<string, GridCoord>;

export function pickMidGameJoinSpawn(input: {
  grid: RulesGrid;
  alivePlayers: RulesPlayer[];
  rng: SeededRng;
}): GridCoord;
```

```ts
export function pickRespawnPlacement(input: {
  grid: RulesGrid;
  alivePlayers: RulesPlayer[];
  rng: SeededRng;
}): {
  spawnCoord: GridCoord;
  usedFallbackWasteland: boolean;
};

export function shortenRespawnSchedule(input: {
  currentRespawnAt: number;
  shortenMs: number;
  now: number;
}): number;
```

```ts
export function buildFloorClearTransition(input: {
  grid: RulesGrid;
  players: RulesPlayer[];
  checkpoints: CheckpointModel[];
  timers: TransitionTimerSnapshot;
  spawnAssignments: Map<string, GridCoord>;
}): {
  clearedGrid: RulesGrid;
  revivedPlayers: RulesPlayer[];
  canceledTimerKinds: Array<"detonate_resolve" | "unmanaged_chain" | "erosion_warn" | "erosion_convert" | "respawn" | "item_expiry" | "effect_expiry" | "future_event">;
};

export function buildNextFloorStartPlan(input: {
  nextStage: StageDefinition;
  playerCount: number;
  sessionIds: string[];
  config: GameParamsConfig;
  rng: SeededRng;
}): {
  generatedGrid: RulesGrid;
  checkpoints: CheckpointModel[];
  spawnAssignments: Map<string, GridCoord>;
};
```

#### 7.5.12 reward /

```ts
export function buildRewardOffer(input: {
  rewards: RewardsConfig;
  items: Record<ItemType, ItemDefinition>;
  skills: Record<SkillType, SkillDefinition>;
  inventory: RulesInventory;
  skillStacks: SkillStackEntry[];
  floorNumber: number;
  playerLevel: number;
  rng: SeededRng;
}): {
  offerId: string;
  options: RewardOption[];
};
```

```ts
export function applyRewardSelection(input: {
  selectedOption: RewardOption;
  inventory: RulesInventory;
  skillStacks: SkillStackEntry[];
}): {
  inventory: RulesInventory;
  skillStacks: SkillStackEntry[];
  addedItem?: { itemType: ItemType; stackCount: number };
  addedSkill?: SkillStackEntry;
};
```

```ts
export function canAddItemToInventory(input: {
  inventory: RulesInventory;
  itemType: ItemType;
  stackCount: number;
  items: Record<ItemType, ItemDefinition>;
}): boolean;

export function addItemToInventory(input: {
  inventory: RulesInventory;
  itemType: ItemType;
  stackCount: number;
  items: Record<ItemType, ItemDefinition>;
}): {
  inventory: RulesInventory;
  usedNewSlot: boolean;
};

export function consumeInventorySlot(input: {
  inventory: RulesInventory;
  slotIndex: number;
  count?: number;
}): RulesInventory;

export function discardInventorySlot(input: {
  inventory: RulesInventory;
  slotIndex: number;
}): {
  inventory: RulesInventory;
  droppedItem: { itemType: ItemType; stackCount: number };
};
```

### 7.6 `lifecycle/` の詳細

#### 7.6.1 `spawn-selection.ts`

- 初期スポーンは **単一点ではなく spawn group** ベースで割り当てる。
- 途中参加は `GamePhase.Playing` 中でも許可し、**ランダムな生存プレイヤー周辺の非地雷マス**を起点にする。
- 近傍安全マスがなければ荒地 fallback を返せる pure result にしておく。

#### 7.6.2 `respawn-placement.ts`

- `player_respawned` 用の `spawnCoord` はここで確定する。
- `shortenRespawnSchedule()` は shortening drop / effect の適用先計算のみ担当し、queue 更新そのものは server が行う。
- 死亡中全員へ均等適用、floor clear 時は即時 respawn 扱い、というルールの計算根拠をここへ寄せる。

#### 7.6.3 `floor-transition.ts`

- API 指定順序 `全 CP → タイマー停止 → 地雷原消滅 → 保留キャンセル → 全員復活 → 初期位置 → 休憩 → 次フロア` を pure plan として返す。
- rules-core は queue を直接消さず、`canceledTimerKinds` や `spawnAssignments` のような **適用計画**を返す。
- `next_floor_started` に必要な `stageId`, `gridWidth`, `gridHeight` はここで生成結果から取れるようにする。

### 7.7 `reward/` の詳細

#### 7.7.1 `reward-offer.ts`

- レベルアップ時に即生成する `reward_offer` の候補をここで作る。
- 除外条件:
  - inventory 満杯で新規 slot 必須 item は候補から除外
  - stack limit 到達 skill は候補から除外
  - `Chord` は uniquePerRun かつ 1 ラン 1 回のみ
- 出力は `RewardOption[]`。server は offerId 付与と private send だけする。

#### 7.7.2 `reward-apply.ts`

- `claim_reward` 成功時の state mutation をここに閉じる。
- item 報酬なら inventory mutation、skill 報酬なら stack 追加。
- `pendingRewardCount` 自体の増減は server / schema 側で public state に反映するが、option の実適用は pure function で返す。

#### 7.7.3 `inventory-mutation.ts`

- pickup / reward / discard / use / death loss の共通ロジックを統一する。
- stackable item と new slot item の分岐をサーバー各 service に散らさない。
- `items.json` の `stackable`, `maxStack`, `manualUse`, `autoTriggerOnDeath` をここで参照する。

### 7.8 rules-core 実装ステップ

| 順序 | ステップ | 依存 | 並行/ブロッカー | 主成果物 |
|---|---|---|---|---|
| 1 | `types.ts`, `SeededRng.ts`, `grid/coords.ts`, `grid/neighbors.ts` | `protocol`, `config types` | ブロッカー | 共通 DTO と補助基盤 |
| 2 | `grid/adjacent-mine-count.ts`, `grid/flood-fill.ts`, `dig/resolve-dig.ts` | 1, `game-params` | レーン1 | dig 基盤 |
| 3 | `progression/exp.ts`, `progression/leveling.ts`, `drop/roll-drop.ts` | 1,2, `items/rewards config` | レーン1 | dig 後の進行解決 |
| 4 | `progression/skill-modifiers.ts`, `reward/inventory-mutation.ts` | 1, `skills/items config` | レーン3 | inventory / skill 集約 |
| 5 | `detonate/build-preview.ts`, `detonate/resolve-detonate.ts` | 1,2,4 | レーン2 | manage explosion |
| 6 | `explosion/resolve-unmanaged.ts` | 1,2 | レーン2 | DangerousMine 誤掘り爆発 |
| 7 | `erosion/plan-warning.ts`, `erosion/apply-conversion.ts` | 1,2 | レーン2 | frontline / convert |
| 8 | `checkpoint/placement.ts`, `checkpoint/detection.ts` | 1, `stages/game-params` | レーン1 | CP 配置 / overlap |
| 9 | `lifecycle/spawn-selection.ts`, `lifecycle/respawn-placement.ts` | 1, `stages`, 4 | レーン3 | join / respawn |
| 10 | `reward/reward-offer.ts`, `reward/reward-apply.ts` | 3,4, `rewards config` | レーン3 | level-up reward |
| 11 | `scoring/score.ts`, `lifecycle/floor-transition.ts` | 3,7,8,9,10 | ブロッカー | clear transition 完了 |
| 12 | golden test 追加（detonate / erosion / transition / reward） | 全部 | 最終ブロッカー | deterministic 品質保証 |

### 7.9 rules-core 実装時のブロッカー

- **R3**: `reward/inventory-mutation.ts` 完了前は pickup / discard / claim_reward / death loss が別実装になってしまう。
- **R4**: `progression/skill-modifiers.ts` 完了前は speed / CT / drop / detection / respawn の式を統一できない。
- **R5**: `lifecycle/floor-transition.ts` 完了前は floor clear 順序が server 側分散ロジックになる。
- **R6**: `detonate/resolve-detonate.ts` と `explosion/resolve-unmanaged.ts` は別パイプライン。1 ファイルへ混ぜない。

---

## 8. パッケージ横断の実装順（推奨）

| フェーズ | 対象 | 内容 | 依存 | 完了条件 |
|---|---|---|---|---|
| 1 | `packages/protocol` | enum / interfaces / commands / events / timers / constants | なし | 全共有名と payload が固定 |
| 2A | `packages/config` | `types.ts`, `game-params.json` | 1 | 全式係数参照キーが固定 |
| 2B | `packages/schema` | class skeleton と root state | 1 | public shared state が固定 |
| 3A | `packages/config` | `items.json`, `skills.json`, `rewards.json`, `stages.json` | 2A | gameplay data が全部 JSON 化 |
| 3B | `packages/schema` | utils / reset helpers / serialization tests | 2B | server 側 update helper が使用可能 |
| 4 | `packages/rules-core` 基盤 | DTO, grid, dig, progression, inventory mutation | 1,3A | 掘削→EXP→pickup の pure flow が閉じる |
| 5 | `packages/rules-core` 爆発/侵食 | detonate / unmanaged / erosion | 4 | 爆発・侵食 pure rules が閉じる |
| 6 | `packages/rules-core` lifecycle/reward/score | spawn / respawn / floor transition / reward / score | 4,5 | run progression が閉じる |
| 7 | shared package integration review | export surface / config validation / golden tests | 全部 | server 実装へ渡せる状態 |

### 8.1 推奨 PR 粒度

1. `protocol` 一式
2. `config` 型 + `game-params.json`
3. `schema` 一式
4. `config` data 一式（items / skills / stages / rewards）
5. `rules-core` grid / dig / progression / inventory
6. `rules-core` detonate / unmanaged / erosion
7. `rules-core` lifecycle / reward / score

### 8.2 この順序を推奨する理由

- `protocol` を最初に終えると、以後の議論が「文字列名の調整」ではなく「仕様の実装」に集中できる。
- `schema` を早期に終えることで、server / client の公開同期前提が安定する。
- `config` を `rules-core` より前に具体化することで、ルール関数が設定駆動になる。
- `rules-core` は dig / progression / inventory を先に終えると、後続の reward / death / floor flow が綺麗につながる。

---

## 9. 並行可能 / ブロッカーステップ一覧

### 9.1 並行可能ステップ一覧

| 区分 | 並行可能な組み合わせ | 理由 |
|---|---|---|
| protocol | `commands.ts` と `events.ts` と `timers.ts` | `types.ts` 確定後は独立 |
| config | `items.json` と `skills.json` | 互いに enum 共有だけで独立 |
| config | `stages.json` と `rewards.json` | stage authoring と reward table は分離可能 |
| schema | `CellState` / `FloorState` / `ErosionState` / `CheckpointState` / `GroundItemState` / `PlayerState` | leaf schema は相互依存が薄い |
| rules-core | `detonate/*` と `explosion/*` | 管理爆発と管理外爆発は別パイプライン |
| rules-core | `checkpoint/*` と `reward/*` | CP と reward はデータ依存が薄い |
| rules-core | `lifecycle/spawn-selection.ts` と `scoring/score.ts` | spawn 計算と score 計算は独立 |

### 9.2 ブロッカーステップ一覧

| ID | ブロッカー | 止まるもの | 解消条件 |
|---|---|---|---|
| B1 | `packages/protocol` 未完 | config / schema / rules-core 全部 | enum / payload / constants 固定 |
| B2 | `config/game-params.json` 未完 | movement / detonate / erosion / respawn / score | 式係数と duration の JSON 化 |
| B3 | `config/items.json` 未完 | inventory mutation / item reward / item effect dispatch | 14 item complete entries |
| B4 | `config/skills.json` 未完 | skill modifiers / skill reward / level-up tuning | 14 skill complete entries |
| B5 | `schema/GameState` 未完 | server room 基盤の public state wiring | root schema class 完成 |
| B6 | `rules-core/inventory-mutation.ts` 未完 | pickup / discard / claim_reward / death loss | inventory 共通 pure API 完成 |
| B7 | `rules-core/lifecycle/floor-transition.ts` 未完 | clear transition / rest / next floor | transition plan 出力 API 完成 |
| B8 | `rules-core/reward/reward-offer.ts` 未完 | `level_up` → `reward_offer` → `claim_reward` | offer generation API 完成 |

### 9.3 イベント送信タイミングを shared package 側で固定しておくべき箇所

| event 群 | shared package 側で固定すべきこと |
|---|---|
| `detonate_*` | preview はコマンド受付直後、chain_step は 125ms 各セル、resolved は全処理後 |
| `unmanaged_*` | triggered は誤掘り直後、chain_step は 125ms 各連鎖、resolved は queue 枯渇時 |
| `erosion_*` | warning は warn 到達時、canceled は stop item / floor clear、applied は convert 実行時 |
| `cats_eye_*` | activated は使用直後、expired は `expiresAt` 到達時 |
| `exp_gained` / `level_up` / `reward_offer` | gained → level_up → reward_offer の順を維持 |
| `inventory_updated` | pickup / use / discard / death / next floor / reconnect の 6 契機を固定 |
| `player_death` / `death_avoided` / `player_ghost` / `player_respawned` | avoidance は death より前、ghost は death 直後、respawned は spawn 確定後 |
| `floor_cleared` / `rest_phase_started` / `next_floor_started` / `game_over` | clear transition 順を API と一致させる |

### 9.4 最終到達状態

- `packages/protocol` が **API 仕様書の TS 契約**になっている。
- `packages/config` が **調整可能な JSON データの唯一ソース**になっている。
- `packages/schema` が **Colyseus 公開同期状態の唯一ソース**になっている。
- `packages/rules-core` が **server から呼ぶ pure gameplay rules の唯一ソース**になっている。
- 以後の `apps/server` 実装は「ルーム起動」「queue」「private send」「schema patch」に集中できる。

この順序なら、shared package 群だけで「契約が固まる → データが固まる → 公開状態が固まる → ルールが閉じる」という依存の流れを崩さず進められる。
