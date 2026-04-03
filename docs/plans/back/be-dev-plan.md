# Phase 2: バックエンド（apps/server）機能別開発プラン

## 0. 前提と設計原則

- 対象は **Colyseus 0.17 / Node.js 20 LTS / pnpm + Turborepo**。
- 現状リポジトリには `apps/server` が未作成のため、**greenfield 前提**で `apps/server` を設計する。
- 通信は **サーバー権威のみ**。`tech-stack.md` の「クライアント予測 + サーバー調整」は旧案として破棄し、`api.md` を優先する。
- 公開同期状態は `packages/schema` の `GameState` 系のみを使う。
- **Private State（インベントリ、保留報酬オファー）**は `@colyseus/schema` に載せず、`client.send` で個別同期する。**Runtime Player State（skill stack、一時効果、最新入力などの server-only 状態）**は `RoomContext` 配下の別マップで管理し、再送対象に含めない。
- `packages/rules-core` の純粋関数群を、`apps/server` 側の facade で包み、ルームは「検証・オーケストレーション・送信」に集中する。
- `packages/config` の JSON を onCreate 時に読み込み、以後は room context から参照する。

## 1. 推奨ディレクトリ構成

```text
apps/server/
  src/
    index.ts
    config/
      loadRuntimeConfig.ts
    rules/
      rulesFacade.ts
    rooms/
      lobby/
        LobbyRoom.ts
        LobbyCoordinator.ts
        LobbySeatReservationService.ts
      detonator/
        DetonatorRoom.ts
        context/
          RoomContext.ts
          createRoomContext.ts
        messaging/
          publicEventSender.ts
          privateEventSender.ts
          sendError.ts
        private/
          PrivateStateStore.ts
          privateStateTypes.ts
        runtime/
          EventQueue.ts
          QueueTypes.ts
          QueueProcessor.ts
          CancellationIndex.ts
          SimulationLoop.ts
        commands/
          registerCommandHandlers.ts
          handleMove.ts
          handleDig.ts
          handleFlag.ts
          handleDetonate.ts
          handleUseItem.ts
          handleDiscardItem.ts
          handleClaimReward.ts
          commandGuards.ts
        systems/
          movement/
            MovementSystem.ts
            CollisionResolver.ts
          explosion/
            DetonateService.ts
            UnmanagedExplosionService.ts
          erosion/
            ErosionService.ts
          checkpoint/
            CheckpointService.ts
          floor/
            FloorBootstrapService.ts
            FloorTransitionService.ts
            ScoreService.ts
          item/
            DropService.ts
            InventoryService.ts
            ItemEffectService.ts
            effect/
              RelayPointEffect.ts
              DashEffect.ts
              ForceIgnitionEffect.ts
              MineRemoverEffect.ts
              PurifyEffect.ts
              CatsEyeEffect.ts
              EvacuationEffect.ts
              ErosionPauseEffect.ts
              BridgeEffect.ts
              DisposableLifeEffect.ts
          progression/
            ExpService.ts
            RewardService.ts
            SkillService.ts
          life/
            DeathService.ts
            RespawnService.ts
          session/
            JoinService.ts
            ReconnectService.ts
```

### 共通ファイルの責務

| ファイル | 責務 |
|---|---|
| `src/index.ts` | Colyseus サーバー起動、`LobbyRoom` / `DetonatorRoom` 登録 |
| `src/config/loadRuntimeConfig.ts` | `packages/config` 読み込みと room 用設定オブジェクト化 |
| `src/rules/rulesFacade.ts` | `packages/rules-core` の export 差異を吸収する adapter |
| `context/RoomContext.ts` | room 内共有依存（config, queue, private store, `runtimePlayerStateBySessionId`, client map, RNG, now provider） |
| `private/PrivateStateStore.ts` | sessionId 単位の inventory / pending reward offers のみ保持 |
| `private/privateStateTypes.ts` | `PrivatePlayerState` / `RuntimePlayerState` の型定義 |
| `runtime/EventQueue.ts` | detonate / unmanaged / erosion / item expiry / respawn / effect expiry / future_event の絶対時刻キュー |
| `runtime/QueueProcessor.ts` | due エントリの一括取り出し、同 tick 優先順位制御、各 system への dispatch |
| `runtime/CancellationIndex.ts` | detonate / item_expiry / respawn / effect_expiry をまとめて逆引き cancel する共通 index |

> **タイマー型の分類**: `packages/protocol/timers.ts` で 7 種の queue entry 型（`DetonateFuseEntry`, `UnmanagedChainEntry`, `ErosionPhaseEntry`, `ItemExpiryEntry`, `RespawnEntry`, `EffectExpiryEntry`, `FutureEventEntry`）を定義し、server 側 `QueueTypes.ts` はそれらを再 export する形に統一する。`EffectExpiryEntry` は dash / cats_eye / disposable_life / erosion pause の終了を、`FutureEventEntry` は MVP no-op stub（同時発生上限 1）を表す。
| `messaging/publicEventSender.ts` | `this.broadcast` を型安全にまとめる |
| `messaging/privateEventSender.ts` | `client.send` による private event / inventory sync / reward replay |

> `rulesFacade.ts` では、Phase 1 実装済みの関数名が実際にどうなっていても、server 側からは `buildNextFloorStartPlan`, `resolveDig`, `buildDetonatePreview`, `resolveDetonateChain`, `triggerUnmanagedExplosion`, `planErosionWarning`, `applyErosionConversion`, `pickInitialSpawnAssignments`, `pickMidGameJoinSpawn`, `pickRespawnPlacement`, `buildRewardOffer`, `applyRewardSelection`, `addItemToInventory`, `consumeInventorySlot`, `discardInventorySlot`, `calculateDigExp`, `calculateDetonateComboExp`, `resolveLevelProgression`, `calculateFloorScore`, `aggregateSkillModifiers` 相当の安定 API で扱う。

## 2. 全体実装順序（依存関係ベース）

| 順序 | ステップ | 依存 | 並行性 |
|---|---|---|---|
| 1 | `apps/server` 雛形、config loader、rules facade、room context 作成 | なし | ブロッカー |
| 2 | `PrivateStateStore`、runtime player state map、event sender、queue infra、simulation loop、**`DeathService` 入口（`resolveDeathAttempt`, `tryAvoidDeath`）**、**`CheckpointService`** | 1 | ブロッカー |
| 3 | `LobbyRoom` / `DetonatorRoom` 最小起動、onCreate/onDispose、フロア初期生成 | 2 | ブロッカー |
| 4 | `JoinService` / `ReconnectService` / command registration | 3 | 一部並行可 |
| 5 | `MovementSystem`、`move/dig/flag` | 3,4 | 並行可 |
| 6 | `InventoryService`、`DropService`、`ExpService`、`RewardService`、`SkillService` | 2,3 | 並行可 |
| 7 | `DeathService` 仕上げ（inventory loss / ghost / game over 判定） | 5,6 | ブロッカー |
| 8 | `DetonateService` と `UnmanagedExplosionService` | 2,3,5,6,7 | 並行可 |
| 9 | `ErosionService` | 2,3,5,7,8 | 並行可 |
| 10 | `RespawnService`、`FloorTransitionService`、`ScoreService` | 5,6,7,8,9 | ブロッカー |
| 11 | item effect 個別実装、`use_item` / `claim_reward` / `discard_item` 完成 | 6,7,8,9,10 | ブロッカー |
| 12 | 総合結合テスト（途中参加・再接続・フロア遷移・全滅・Floor10） | 全部 | 最終ブロッカー |

### 明示的なブロッカー

- **ブロッカーA**: `RoomContext` / `EventQueue` / `PrivateStateStore` / runtime player state map 完了前は他モジュールに着手しても結線できない。
- **ブロッカーB**: `FloorBootstrapService` 完了前は dig / explosion / erosion / CP / respawn の座標系が固まらない。
- **ブロッカーC**: `InventoryService` 完了前は `use_item`、死亡回避、報酬 item 付与、途中参加 inventory 初期化が止まる。
- **ブロッカーD**: `DeathService.resolveDeathAttempt()` / `tryAvoidDeath()` 完了前は detonate / unmanaged explosion / erosion の致死処理を統一できない。
- **ブロッカーE**: `CheckpointService` 完了前は movement 後の CP 回収と floor clear trigger を閉じられない。
- **ブロッカーF**: `FloorTransitionService` 完了前は CP 回収完了後の進行と queue flush が閉じない。

> **※ DeathService / CheckpointService の前倒し**: これらは dash / cats_eye / disposable_life / erosion pause など多数の item effect や、detonate / erosion の致死判定で参照されるため、§2（基盤レイヤ）で早期に実装する。入口部分（`resolveDeathAttempt`, `tryAvoidDeath`）は §2 で完成させ、inventory loss / ghost 遷移などの仕上げは §7 で行う。

### 並行可能レーン

- レーン1: `LobbyRoom` 系
- レーン2: `MovementSystem` + `move/dig/flag`
- レーン3: `Inventory/Drop/Progression`
- レーン4: `Detonate` + `UnmanagedExplosion`
- レーン5: `Erosion`

---

## 3. モジュール1: ルーム基盤・ライフサイクル

### 3.1 役割と責務

- `LobbyRoom` の待機、参加者管理、ゲーム開始、seat reservation 配布。
- `DetonatorRoom` の生成、`maxClients=10`、`patchRate=30Hz`、`seatReservationTimeout=15s` 設定。
- `onCreate / onJoin / onDrop / onReconnect / onLeave / onDispose` の骨格実装。
- ゲームループ、イベントキュー、Private State、Runtime Player State、共有 state の初期化。

### 3.2 ファイル構成

| ファイル | 実装内容 |
|---|---|
| `apps/server/src/index.ts` | Colyseus server 起動、room 登録 |
| `apps/server/src/rooms/lobby/LobbyRoom.ts` | ロビー lifecycle 本体 |
| `apps/server/src/rooms/lobby/LobbyCoordinator.ts` | 待機参加者管理、開始条件判定 |
| `apps/server/src/rooms/lobby/LobbySeatReservationService.ts` | `DetonatorRoom` 作成と reservation 配布 |
| `apps/server/src/rooms/detonator/DetonatorRoom.ts` | gameplay room lifecycle 本体 |
| `apps/server/src/rooms/detonator/context/RoomContext.ts` | 全 system 共通の依存定義 |
| `apps/server/src/rooms/detonator/context/createRoomContext.ts` | onCreate 時の context 組み立て |
| `apps/server/src/rooms/detonator/runtime/SimulationLoop.ts` | fixed tick 更新と queue processor 呼び出し |
| `apps/server/src/rooms/detonator/runtime/EventQueue.ts` | 絶対時刻キュー |
| `apps/server/src/rooms/detonator/runtime/QueueTypes.ts` | queue entry 型定義 |

### 3.3 実装ステップ

1. `index.ts` に Colyseus 起動と room 登録を実装する。
2. `loadRuntimeConfig.ts` と `rulesFacade.ts` を作り、`packages/config` / `packages/rules-core` の読み出し口を一本化する。
3. `createRoomContext.ts` で `config`, `rulesFacade`, `PrivateStateStore`, `runtimePlayerStateBySessionId`, `EventQueue`, `clientRegistry`, `random`, `clock` を束ねる。
4. `LobbyRoom` の `onCreate/onJoin/onLeave/onDispose` を実装する。
5. `DetonatorRoom` の `onCreate` で `GameState` 初期化、最初のフロア生成、queue/simulation 開始を実装する。
6. `DetonatorRoom` の `onDispose` で simulation/timer/queue を全解放する。

### 3.4 各ステップの詳細（共有パッケージ利用）

- `packages/schema`: `GameState`, `GridState`, `FloorState`, `ErosionState`, `PlayerState`, `CheckpointState`, `GroundItemState`。
- `packages/protocol`: `RoomOptions`, `JoinOptions`, `PlayerJoinedEvent`, `PlayerLeftEvent`, `PlayerDisconnectedEvent`, `PlayerReconnectedEvent`, `GamePhase`, `PlayerLifeState`。
- `packages/rules-core`: 盤面生成関数、初期安全ゾーン生成関数、初期スポーン群決定関数、フロア遷移計画関数。
- `packages/config`: room 定数、ステージ定義、ゲームパラメータ。

### 3.5 並行可能ステップ / ブロッカーステップ

- 並行可能: `LobbyRoom` と `DetonatorRoom` の shell 実装。
- ブロッカー: `RoomContext`、`EventQueue`、`GameState` 初期化。

### 3.6 Private State / Runtime State の管理方針

- `LobbyRoom` では private state を持たず、表示名と reservation metadata のみ server memory に保持。
- `DetonatorRoom` では `PrivateStateStore` を room 単位で保持し、`sessionId` を主キーに inventory / pending rewards のみを格納する。
- skill stacks / effect flags / latest input / cooldown は `RoomContext.runtimePlayerStateBySessionId` の別マップに保持する。
- `client` object 参照は `sessionId -> Client` の registry に持ち、再接続で差し替える。

### 3.7 イベント送信タイミング

| イベント | タイミング |
|---|---|
| `player_joined` | `onJoin` 完了後、public state 反映後 |
| `player_disconnected` | `onDrop` で `allowReconnection(60)` 実行直後 |
| `player_reconnected` | `onReconnect` 完了後、危険位置補正と private resync 完了後 |
| `player_left` | 再接続猶予切れ or voluntary leave 確定後 |

---

## 4. モジュール2: コマンドハンドラ（Client→Server）

### 4.1 役割と責務

- `move`, `dig`, `flag`, `detonate`, `use_item`, `discard_item`, `claim_reward` の全受信口。
- payload 検証、フェーズ制約、alive 制約、距離制約、slot 制約、error 返却。
- 実状態更新は各 system に委譲し、handler 自身は「validate → dispatch → event/send」に限定する。

### 4.2 ファイル構成

| ファイル | 実装内容 |
|---|---|
| `commands/registerCommandHandlers.ts` | 全 `this.onMessage()` 登録 |
| `commands/commandGuards.ts` | phase / alive / slot / range / finite number 検証 |
| `commands/handleMove.ts` | 入力ベクトル受信、正規化、latest input 更新 |
| `commands/handleDig.ts` | 掘削受付、SafeMine / DangerousMine 分岐 |
| `commands/handleFlag.ts` | flag トグル |
| `commands/handleDetonate.ts` | CT/対象検証、preview/fuse enqueue |
| `commands/handleUseItem.ts` | slot 参照、item effect dispatch |
| `commands/handleDiscardItem.ts` | inventory remove → ground drop |
| `commands/handleClaimReward.ts` | pending offer 検証と reward 適用 |
| `messaging/sendError.ts` | `error` event 送信 |

### 4.2.1 全コマンドのバリデーション・拒否ケース・エラーコード（api.md 準拠）

| コマンド | 拒否ケース | エラーコード |
|---|---|---|
| `move` | `GamePhase` が `Playing` でない場合は無視（エラー送信なし） | — |
| `move` | `vx`, `vy` が有限数値でない | 無視（正規化不能） |
| `dig` | リーチ外（Chebyshev 距離 > 1） | `DIG_OUT_OF_RANGE` |
| `dig` | 対象セルが `Safe` / `Wasteland` / `Hole` | `DIG_INVALID_TARGET` |
| `dig` | 送信者が `Alive` でない | `DIG_NOT_ALIVE` |
| `dig` | フェーズが `Playing` でない | 無視 |
| `flag` | リーチ外（Chebyshev 距離 > 1） | `FLAG_OUT_OF_RANGE` |
| `flag` | 対象セルが旗設置不可（`Safe` / `Wasteland` / `Hole`） | `FLAG_INVALID_TARGET` |
| `flag` | 送信者が `Alive` でない | `FLAG_NOT_ALIVE` |
| `flag` | フェーズが `Playing` でない | 無視 |
| `detonate` | CT 残あり（Force Ignition なし） | `DETONATE_COOLDOWN` |
| `detonate` | 対象が点火不可（旗付き地雷・Relay Point 以外） | `DETONATE_INVALID_TARGET` |
| `detonate` | 送信者が `Alive` でない | `DETONATE_NOT_ALIVE` |
| `detonate` | フェーズが `Playing` でない | 無視 |
| `use_item` | スロットが空 | `USE_ITEM_EMPTY_SLOT` |
| `use_item` | 対象座標が無効（`relay_point`: 非 Safe、`bridge`: 非 Hole 等） | `USE_ITEM_INVALID_TARGET` |
| `use_item` | 使用条件未達（例: 対象セルが条件を満たさない） | `USE_ITEM_CONDITION_NOT_MET` |
| `use_item` | 送信者が `Alive` でない | `USE_ITEM_NOT_ALIVE` |
| `use_item` | フェーズが `Playing` でない | 無視 |
| `discard_item` | スロットが空 | `DISCARD_EMPTY_SLOT` |
| `discard_item` | フェーズが `Playing` でない | 無視 |
| `claim_reward` | 保留報酬なし | `CLAIM_NO_PENDING_REWARD` |
| `claim_reward` | `offerId` が一致しない | `CLAIM_INVALID_OFFER_ID` |
| `claim_reward` | `optionIndex` が無効または候補が無効 | `CLAIM_INVALID_OPTION` |

### 4.3 実装ステップ

1. `registerCommandHandlers.ts` を作り、全 7 コマンドを登録する。
2. `commandGuards.ts` で共通バリデーションを先に実装する。
3. `move` を「即移動」ではなく「latest input 更新」にする。
4. `dig` / `flag` を grid 操作 handler として実装する。
5. `detonate` を explosion module へ接続する。
6. `use_item` / `discard_item` / `claim_reward` を private state module へ接続する。

### 4.4 各ステップの詳細（共有パッケージ利用）

- `packages/protocol`
  - commands: `MovePayload`, `DigPayload`, `FlagPayload`, `DetonatePayload`, `UseItemPayload`, `DiscardItemPayload`, `ClaimRewardPayload`
  - enums: `ErrorCode`, `GamePhase`, `PlayerLifeState`, `ItemType`
- `packages/schema`: `PlayerState`, `CellState`, `GameState`
- `packages/rules-core`
  - `move`: 速度合成/向き補正用のスキル計算関数
  - `dig`: flood-fill 掘削、EXP 算出、ドロップ抽選、隣接数字更新
  - `detonate`: provisional MST preview、cooldown 計算
  - `claim_reward`: reward/inventory 適用関数

### 4.5 並行可能ステップ / ブロッカーステップ

- 並行可能: `move`, `dig`, `flag`。
- ブロッカー: `use_item` と `claim_reward` は `InventoryService` / `RewardService` が必要。
- ブロッカー: `detonate` は `DetonateService` 実装前だと完了しない。

### 4.6 Private State / Runtime State の管理方針

- `move`: latest input は `RuntimePlayerState.latestMoveInput` に保持。
- `use_item` / `discard_item`: inventory は `PrivateStateStore` から読み書き。
- `claim_reward`: pending reward offers は `PrivateStateStore` で検証し、確定後に削除する。skill 報酬の適用結果は `RuntimePlayerState.skillStacks` に反映する。

### 4.7 イベント送信タイミング

| コマンド | broadcast / send |
|---|---|
| `move` | 原則イベントなし。`PlayerState.x/y/facing` の schema patch のみ。移動結果で CP 回収や item pickup が起きた場合のみ関連イベント送信。 |
| `dig` | SafeMine 開放時に `exp_gained` / `item_dropped`、DangerousMine 誤掘り時に `unmanaged_explosion_triggered` |
| `flag` | 専用イベントなし。`CellState.flagged` の schema patch のみ |
| `detonate` | 受付直後に `detonate_preview` + `detonate_fuse_scheduled` |
| `use_item` | 成功時に `item_used`、必要に応じて `inventory_updated` / `cats_eye_activated` / `erosion_warning_canceled` など |
| `discard_item` | 成功時に `item_dropped`（broadcast）+ `inventory_updated`（private） |
| `claim_reward` | 成功専用イベントなし。`level/pendingRewardCount` の schema 差分 + private state 更新 |
| 全コマンド | 失敗時は `error` を送信者へ private send |

---

## 5. モジュール3: 爆発システム

### 5.1 役割と責務

- Detonate（管理爆発）と管理外爆発（誤掘り）を完全分離した 2 パイプラインで実装する。
- `detonate_resolve` fuse queue、`unmanaged_chain` queue を処理する。
- 盤面変換、旗/Relay Point 除去、EXP コンボ、地上ドロップ破壊、死亡判定委譲を行う。

### 5.2 ファイル構成

| ファイル | 実装内容 |
|---|---|
| `systems/explosion/DetonateService.ts` | preview 生成、fuse enqueue、resolve batch、chain step 適用 |
| `systems/explosion/UnmanagedExplosionService.ts` | 誤掘り即時爆発、BFS 連鎖、衝撃波/荒地化適用 |
| `runtime/QueueTypes.ts` | `detonate_resolve`, `unmanaged_chain` 型 |
| `runtime/CancellationIndex.ts` | queue 種別ごとの resource key から pending entry を逆引き cancel する共通 index（`DetonateFuseEntry` / `ItemExpiryEntry` / `RespawnEntry` / `EffectExpiryEntry`） |

### 5.3 実装ステップ

1. `DetonateService.scheduleFuse()` を実装し、preview と fuse event を送る。
2. `DetonateService.resolveDueFuses()` で due batch を順不同処理する。
3. `DetonateService.applyChainStep()` で 125ms ごとの chain を実装する。
4. `UnmanagedExplosionService.triggerFromDig()` で誤掘り起点爆発を即時適用する。
5. `UnmanagedExplosionService.processQueue()` で BFS 連鎖を 125ms 間隔で進める。
6. 盤面変換時の旗/Relay Point/groundItem の破壊と cancel hook を結線し、`CancellationIndex` に detonate / item_expiry / respawn / effect_expiry の逆引きを集約する。

### 5.4 各ステップの詳細（共有パッケージ利用）

- `packages/protocol`
  - events: `DetonatePreviewEvent`, `DetonateFuseScheduledEvent`, `DetonateFuseCanceledEvent`, `DetonateChainStepEvent`, `DetonateResolvedEvent`, `UnmanagedExplosionTriggeredEvent`, `UnmanagedChainStepEvent`, `UnmanagedExplosionResolvedEvent`, `ExpGainedEvent`
  - enums: `CellType`, `FuseCancelReason`, `ItemDestroyReason`, `ExpSource`
- `packages/schema`: `CellState`, `GroundItemState`, `PlayerState`
- `packages/rules-core`
  - Rooted Prim-MST preview/resolve 関数
  - deterministic tie-break（`y * width + x`）付きノード選別関数
  - unmanaged explosion の blast/wasteland/BFS chain 計算関数
  - detonate combo EXP 計算関数
  - adjacent mine count 再計算関数
- `CancellationIndex` は queue 種別ごとのキャンセル逆引きを一本化する。
  - `detonate`: `sourceCoord` / `mineCell` → fuse entry キャンセル
  - `item_expiry`: `groundItemId` → expiry entry キャンセル（pickup / explosion / erosion 時）
  - `respawn`: `sessionId` → respawn entry キャンセル（floor clear 時）
  - `effect_expiry`: `sessionId + effectType` → expiry entry キャンセル（floor clear / death 時）

### 5.4.1 Detonate 爆発評価アルゴリズム詳細（api.md §4 準拠）

`DetonateService` の fuse 到達時処理は以下のアルゴリズムに従う:

1. **3.0 秒 fuse** 後、爆発時点の盤面スナップショットで **Rooted Prim-MST** を再計算する。
2. MST の各ノードを **親子関係に沿って連鎖**適用し、**1/8 秒（125ms）** ごとに 1 セル処理する。
3. セル種別ごとの処理:
   - `DangerousMine` → 爆発して **子へ伝播継続**。
   - `SafeMine` → 爆発して `Safe` 化するが、**その枝は停止**。
   - `Relay Point` → 中継ノードとして扱い、**子へ伝播継続**。
4. 経路上の **旗と Relay Point は除去**する。
5. **タイブレーク規則**: 距離が同じ場合は、線形インデックス（`y * width + x`）の昇順で決定。Y 座標が小さいものを優先し、同 Y では X 座標が小さいものを優先する。
6. 各 chain step ごとに `detonate_chain_step` event を broadcast し、全ノード完了時に `detonate_resolved` を送信する。
7. **同 tick に複数 `detonate_resolve` が due の場合**: 順不同で逐次処理し、各爆発後に盤面再計算（adjacent mine count / item destroy / cancel hook）を挟む（api.md §Timers 準拠）。

### 5.5 並行可能ステップ / ブロッカーステップ

- 並行可能: Detonate と unmanaged explosion は別担当で並行実装可能。
- ブロッカー: `DeathService.resolveDeathAttempt()` がないと致死確定処理が閉じない。
- ブロッカー: `CancellationIndex` がないと fuse cancel / expiry cancel を安全に扱えない。

### 5.6 Private State / Runtime State の管理方針

- Detonate CT、Force Ignition 次回無料フラグは `RuntimePlayerState` に保持する。
- preview 自体は private にせず room 全体 broadcast。
- combo 計算に必要な initiator 情報は queue entry に保持し、EXP 付与先のみ private send する。

### 5.7 イベント送信タイミング

| イベント | タイミング |
|---|---|
| `detonate_preview` | `detonate` 受付直後、provisional MST 計算後 |
| `detonate_fuse_scheduled` | `detonate_resolve` enqueue 直後 |
| `detonate_fuse_canceled` | 起爆源消失 / 旗除去 / 地雷除去機除去 / floor clear |
| `detonate_chain_step` | detonate 連鎖の各 125ms step |
| `detonate_resolved` | detonate の全ノード処理完了時 |
| `exp_gained` | detonate combo EXP が発生した本人に private send |
| `unmanaged_explosion_triggered` | DangerousMine 誤掘り直後 |
| `unmanaged_chain_step` | unmanaged BFS 連鎖の各 125ms step |
| `unmanaged_explosion_resolved` | unmanaged queue 枯渇時 |
| `item_destroyed` | unmanaged の荒地化範囲で ground item が消えた瞬間 |

---

## 6. モジュール4: 侵食システム

### 6.1 役割と責務

- `erosion_warn` → `erosion_convert` のサイクル管理と、**警告開始と同時に次インターバルを走らせる**並行進行制御。
- frontline 抽出、ランダム起点 + 左右探索による対象選定、SafeMine:DangerousMine 比率適用。
- warning state と convert state の schema 更新。
- 侵食停止アイテムとの連携、死亡処理委譲。

### 6.2 ファイル構成

| ファイル | 実装内容 |
|---|---|
| `systems/erosion/ErosionService.ts` | warning/convert/pause/resume 一式 |
| `runtime/QueueTypes.ts` | `erosion_warn`, `erosion_convert` 型（`ErosionPhaseEntry`）、`EffectExpiryEntry` |
| `runtime/QueueProcessor.ts` | due erosion event dispatch |

### 6.3 実装ステップ

1. `scheduleInitialErosionCycle()` を onCreate / next floor start に差し込む。
2. `runWarningPhase()` で frontline 抽出・対象選定・`warningCellKeys` 更新を実装する。frontline は「地雷原または荒地が周囲八マス以内に存在する安全マス」とし、ランダム起点 + 左右探索で選定する。横幅上限到達時は stage ごとの新 frontline を再探索し、**探索回数は侵食力 `n` に対して `n` 回を超えない**。`warningCellKeys` には選定済み Safe セルに加えて、その時点で盤面上に存在する **Wasteland** も含める。警告開始と同時に次の `erosion_warn` を enqueue する。
3. `runConvertPhase()` でセル変換、旗/Relay Point/ground item 除去、死亡判定、adjacent 再計算を実装する。警告時間は**侵食インターバルが 4 秒以上なら 3 秒固定、4 秒未満ならインターバル時間の 3/4**とする。
4. `pauseErosion()` / `resumeErosion()` を item effect から呼べるようにする。
5. floor clear 時の warning cancel と queue flush を実装する。

### 6.4 各ステップの詳細（共有パッケージ利用）

- `packages/protocol`
  - events: `ErosionWarningEvent`, `ErosionWarningCanceledEvent`, `ErosionAppliedEvent`, `PlayerDeathEvent`
  - enums: `ErosionWarningCancelReason`, `CellType`, `DeathCause`, `ItemDestroyReason`
- `packages/schema`: `ErosionState`, `CellState`, `PlayerState`
- `packages/rules-core`
  - frontline 抽出関数
  - ランダム起点 + 左右探索の侵食ターゲット選定関数（stage 幅上限・frontline 更新ルール込み）
  - 侵食比率算出関数
  - adjacentMineCount 再計算関数

### 6.5 並行可能ステップ / ブロッカーステップ

- 並行可能: warning selection と convert mutation は同一 service 内だが、pure function 部分は別担当で並行可。
- ブロッカー: `FloorBootstrapService` の grid 初期化。
- ブロッカー: `DeathService` 連携。

### 6.6 Private State / Runtime State の管理方針

- 侵食 warning 対象自体は public schema + broadcast event で管理し、内容は **選定済み Safe セル + 盤面上の Wasteland** の和集合とする。
- 停止アイテムの残り時間は `effect_expiry` queue と `RuntimePlayerState.erosionPauseExpiresAt` に保持し、schema には載せない。

### 6.7 イベント送信タイミング

| イベント | タイミング |
|---|---|
| `erosion_warning` | `erosion_warn` 実行時 |
| `erosion_warning_canceled` | `take_a_breath` / `short_break` 使用時、または floor clear 時 |
| `erosion_applied` | `erosion_convert` 実行完了時 |
| `player_death` / `player_ghost` | 侵食変換対象セル上のプレイヤーが死亡した瞬間 |
| `item_destroyed` | 侵食変換セル上の ground item 消滅時 |

---

## 7. モジュール5: CP・フロー管理

### 7.1 役割と責務

- ステージ候補座標からの CP 配置。
- CP 回収判定、同 tick 先着処理。
- フロアクリア遷移、休憩、次フロア開始、Floor10 完了、スコア確定。

### 7.2 ファイル構成

| ファイル | 実装内容 |
|---|---|
| `systems/floor/FloorBootstrapService.ts` | ステージ選定、grid/CP/initial spawn 構築 |
| `systems/checkpoint/CheckpointService.ts` | CP overlap 検出、回収、残数管理 |
| `systems/floor/FloorTransitionService.ts` | clear → rest → next floor / game over 遷移 |
| `systems/floor/ScoreService.ts` | floor score / total score 算出 |

### 7.3 実装ステップ

1. `FloorBootstrapService.buildFloor()` を作り、`buildNextFloorStartPlan()` を呼び出す。
2. `CheckpointService.collectIfTouched()` を movement tick に接続する。Cat's Eye 効果は「全未回収 CP を一時的にチーム全体に共有表示」として扱い、通常の CP overlap / 回収ロジックとは分離して実装する（`detonator.md` §10 修正済み、`api.md` 準拠）。
3. `onAllCheckpointsCollected()` で floor clear をトリガーする。
4. `FloorTransitionService.runFloorClearTransition()` で API 指定順序を固定する。
5. `ScoreService` で `score_updated` を生成する。
6. Floor10 なら `game_over(reason: Floor10Cleared)` で閉じる。

### 7.4 各ステップの詳細（共有パッケージ利用）

- `packages/protocol`
  - events: `CpCollectedEvent`, `FloorClearedEvent`, `RestPhaseStartedEvent`, `NextFloorStartedEvent`, `ScoreUpdatedEvent`, `GameOverEvent`
  - enums: `GamePhase`, `GameOverReason`
- `packages/schema`: `CheckpointState`, `FloorState`, `GameState`
- `packages/rules-core`
  - CP 配置関数（Hole 除外 / 初期安全ゾーン除外 / playerCount 補正）
  - フロア遷移関数（タイマー停止、地雷原消滅、安全化、初期スポーン再配置）
  - スコア計算関数（EXP × time bonus）
  - spawn group / floor start position 決定関数

### 7.5 並行可能ステップ / ブロッカーステップ

- 並行可能: `CheckpointService` と `ScoreService`。
- ブロッカー: `FloorTransitionService` は death/respawn, queue flush, inventory carry-over の完成待ち。

### 7.6 Private State / Runtime State の管理方針

- CP 自体は非秘密で `GameState.checkpoints` に常時同期。
- floor transition 中も inventory / pending reward offers は `PrivateStateStore` に保持し、**持ち越し**。
- 一方で `RuntimePlayerState` 内では skill stacks を持ち越し、それ以外の CT / dash / disposable_life / forceIgnition / cats_eye / erosion pause / latest input は floor transition で再初期化する。

### 7.7 イベント送信タイミング

| イベント | タイミング |
|---|---|
| `cp_collected` | プレイヤーが CP 座標へ到達し、サーバー先着確定した瞬間 |
| `floor_cleared` | 最後の CP 回収直後 |
| `score_updated` | floor score 確定直後 |
| `rest_phase_started` | 全員復活 + 初期位置復帰完了後 |
| `next_floor_started` | 次フロア生成完了時 |
| `game_over` | Floor10 クリア時、または別モジュールから全滅時 |

---

## 8. モジュール6: アイテム・スキル・EXP

### 8.1 役割と責務

- ドロップ生成、寿命管理、自動取得。
- inventory 管理（3 枠 base、最大 10 枠、stack 判定）。
- 14 種アイテムの manual / auto effect。
- EXP 加算、level up、reward offer 生成、skill 適用。

### 8.2 ファイル構成

| ファイル | 実装内容 |
|---|---|
| `systems/item/DropService.ts` | ドロップ抽選、ground item 生成、expiry、pickup |
| `systems/item/InventoryService.ts` | inventory add/remove/consume/stack、private sync |
| `systems/item/ItemEffectService.ts` | item type ごとの dispatch |
| `systems/item/effect/RelayPointEffect.ts` | relay_point 設置 |
| `systems/item/effect/DashEffect.ts` | 15秒ダッシュ |
| `systems/item/effect/ForceIgnitionEffect.ts` | 次回 detonate CT 無視 |
| `systems/item/effect/MineRemoverEffect.ts` | 3 種 mine remover 共通処理 |
| `systems/item/effect/PurifyEffect.ts` | wasteland → safe |
| `systems/item/effect/CatsEyeEffect.ts` | チーム共有可視、expire |
| `systems/item/effect/EvacuationEffect.ts` | respawn 地点へ瞬間移動 |
| `systems/item/effect/ErosionPauseEffect.ts` | take_a_breath / short_break |
| `systems/item/effect/BridgeEffect.ts` | hole → safe |
| `systems/item/effect/DisposableLifeEffect.ts` | 死亡回避バフ付与 |
| `systems/progression/ExpService.ts` | EXP 加算、閾値判定、level up |
| `systems/progression/RewardService.ts` | reward offer 生成・確定 |
| `systems/progression/SkillService.ts` | passive skill stack と補正値計算 |

### 8.3 実装ステップ

1. `InventoryService` を先に実装する。
2. `DropService` で dig/drop/discard に共通利用する ground item ライフサイクルを実装する。
3. `ExpService` を作り、dig/detonate から加算できるようにする。
4. `RewardService` を作り、level up 時に offer 生成・保留できるようにする。
5. `SkillService` で移動速度、CT、ドロップ率、侵食補正、検知半径などの passive 補正値算出を提供する。
6. `ItemEffectService` と各 effect ファイルを順次実装する。
7. `cats_eye`, `dash`, `disposable_life`, `erosion pause` など duration 持ち効果を `effect_expiry` queue に接続する。

### 8.4 各ステップの詳細（共有パッケージ利用）

- `packages/protocol`
  - enums: `ItemType`, `SkillType`, `ExpSource`
  - interfaces: `InventorySlot`, `RewardOption`
  - events: `ItemDroppedEvent`, `ItemPickedUpEvent`, `ItemExpiredEvent`, `ItemUsedEvent`, `ItemAutoTriggeredEvent`, `ItemDestroyedEvent`, `InventoryUpdatedEvent`, `ExpGainedEvent`, `LevelUpEvent`, `RewardOfferEvent`, `CatsEyeActivatedEvent`, `CatsEyeExpiredEvent`
- `packages/schema`: `GroundItemState`, `PlayerState`, `CheckpointState`
- `packages/rules-core`
  - ドロップ抽選関数
  - inventory apply / consume / stack 判定関数
  - reward offer 生成関数
  - reward apply 関数
  - level threshold 計算関数
  - skill effect 計算関数
  - CP 検知半径・move speed・detonate CT・respawn 時間などの補正関数
- `packages/config`: item definitions, skill definitions, reward tables, reward weights

### 8.5 並行可能ステップ / ブロッカーステップ

- 並行可能: `DropService`, `ExpService`, `RewardService`。
- ブロッカー: `ItemEffectService` は `InventoryService` 完了が前提。
- ブロッカー: `CatsEyeEffect` は `CheckpointService` と連携が必要。
- ブロッカー: `ErosionPauseEffect` は `ErosionService` 完了待ち。

### 8.6 Private State / Runtime State の管理方針

- inventory 本体は `PrivateStateStore.inventoryBySessionId` に保持し、`inventory_updated` のみ private send。
- pending reward offers は `PrivateStateStore.pendingRewardsBySessionId` に保持し、詳細は `reward_offer` private send。
- skill stacks は `RuntimePlayerState.skillStacks` に保持し、必要な見た目が増えるまで schema には載せない。
- `disposableLifeExpiresAt`、`forceIgnitionArmed`、`dashExpiresAt`、`catsEyeExpiresAt`、`erosionPauseExpiresAt` も `RuntimePlayerState` で管理する。`nine_lives` の所持数は `PrivateStateStore` の inventory カウントで管理する。

### 8.7 イベント送信タイミング

| イベント | タイミング |
|---|---|
| `item_dropped` | dig ドロップ抽選成功時 / discard で地面生成時 |
| `item_picked_up` | pickup 成功時 |
| `item_expired` | item expiry queue 到達時 |
| `item_used` | manual item 使用成功時 |
| `item_auto_triggered` | `disposable_life` / `nine_lives` 自動発動時 |
| `item_destroyed` | unmanaged explosion / erosion で ground item 消滅時 |
| `inventory_updated` | pickup / use / discard / death（全ロスト） / floor start / reconnect |
| `exp_gained` | dig / flood-fill / detonate combo ごとに本人へ |
| `level_up` | 閾値超過確定時 |
| `reward_offer` | `level_up` 直後、offer 生成後 |
| `cats_eye_activated` | `cats_eye` 使用直後 |
| `cats_eye_expired` | `cats_eye` 効果時間終了時 |

### 8.8 14種アイテムの実装割当

| ItemType | 実装ファイル | 補足 |
|---|---|---|
| `relay_point` | `RelayPointEffect.ts` | Safe 限定、点火始点にも使用可 |
| `dash` | `DashEffect.ts` | 15秒速度1.5倍 |
| `force_ignition` | `ForceIgnitionEffect.ts` | 次回 detonate で CT 無視 |
| `mine_remover_cheap` | `MineRemoverEffect.ts` | config 差分で効果量切替 |
| `mine_remover_normal` | `MineRemoverEffect.ts` | 同上 |
| `mine_remover_high` | `MineRemoverEffect.ts` | 同上 |
| `purify` | `PurifyEffect.ts` | 前方1マス wasteland を safe 化 |
| `cats_eye` | `CatsEyeEffect.ts` | 全未回収 CP を一時的にチーム全体に共有表示（`api.md` 準拠） |
| `evacuation` | `EvacuationEffect.ts` | 退避先はリスポーン時と同じアルゴリズム（ランダムな生存プレイヤー周囲の非地雷マス）を流用。`rules-core/spawn-selection.ts` の関数を使用。 |
| `take_a_breath` | `ErosionPauseEffect.ts` | 短時間停止 |
| `short_break` | `ErosionPauseEffect.ts` | 長時間停止 |
| `bridge` | `BridgeEffect.ts` | Hole を Safe 化 |
| `disposable_life` | `DisposableLifeEffect.ts` | 手動使用で回避バフ付与 |
| `nine_lives` | `DeathService.ts` | 手動使用なし、自動発動のみ |

---

## 9. モジュール7: 死亡・リスポーン

### 9.1 役割と責務

- unmanaged explosion / erosion による死亡判定統一。
- `disposable_life` → `nine_lives` の優先順による死亡回避。
- ghost 遷移、inventory loss、respawn queue、全滅判定。

### 9.2 ファイル構成

| ファイル | 実装内容 |
|---|---|
| `systems/life/DeathService.ts` | cause 判定、avoidance、inventory loss、ghost 化、game over 判定 |
| `systems/life/RespawnService.ts` | respawn queue、spawn 座標決定、shorten 処理 |
| `runtime/QueueTypes.ts` | `respawn`（`RespawnEntry`）、`EffectExpiryEntry` |

### 9.3 実装ステップ

1. `DeathService.resolveDeathAttempt()` を作り、全致死判定の唯一の入口にする。
2. `tryAvoidDeath()` で `disposable_life` → `nine_lives` の優先順位を実装する。
3. 通常死亡時の inventory 全ロストと `player_death` / `player_ghost` を実装する。
4. `RespawnService.scheduleRespawn()` を実装する。
5. `RespawnService.shortenAllPendingRespawns()` を drop / item から呼べるようにする。
6. `RespawnService.resolveRespawn()` で spawn 補正を実装する。
7. 生存数 0 で `game_over(reason: AllDead)` を送る。

### 9.4 各ステップの詳細（共有パッケージ利用）

- `packages/protocol`
  - enums: `DeathCause`, `GameOverReason`, `PlayerLifeState`, `ItemType`
  - events: `DeathAvoidedEvent`, `ItemAutoTriggeredEvent`, `PlayerDeathEvent`, `PlayerGhostEvent`, `PlayerRespawnedEvent`, `GameOverEvent`, `InventoryUpdatedEvent`
- `packages/schema`: `PlayerState`
- `packages/rules-core`
  - death item keep / respawn time / respawn spawn selection 関数
  - 蘇生短縮適用関数
  - 危険位置補正付きリスポーン配置関数

### 9.5 並行可能ステップ / ブロッカーステップ

- 並行可能: avoidance 判定と respawn queue 実装。
- ブロッカー: `InventoryService` 完了前は death loss と nine_lives 消費ができない。
- ブロッカー: `rulesFacade.pickRespawnPlacement()` 完了前は respawn 確定できない。

### 9.6 Private State / Runtime State の管理方針

- inventory loss は `PrivateStateStore` で消去し、`inventory_updated` を private send。
- pending reward offers は死亡で消さない。
- skill stacks / `disposableLifeExpiresAt` は `RuntimePlayerState` から参照する。`nine_lives` の所持数は `PrivateStateStore` の inventory から参照する。
- death 確定時は `CancellationIndex` を使って本人の `effect_expiry` をまとめて取消し、dash / cats_eye / erosion_pause / disposable_life などの一時状態をリセットする。

### 9.7 イベント送信タイミング

| イベント | タイミング |
|---|---|
| `death_avoided` | 死亡回避が成立した瞬間 |
| `item_auto_triggered` | 回避アイテムを自動消費した瞬間 |
| `player_death` | 回避失敗後、死亡確定時 |
| `inventory_updated` | 死亡時（全ロスト）に本人へ |
| `player_ghost` | `player_death` 直後、ghost 遷移完了時 |
| `player_respawned` | respawn queue 満了、座標補正完了後 |
| `game_over` | 生存プレイヤー数が 0 になった瞬間 |

---

## 10. モジュール8: 途中参加・再接続

### 10.1 役割と責務

- Playing 中の途中参加受付。
- `allowReconnection(60)` ベースの切断復帰。
- 再接続時の private state 再送と危険位置補正。

### 10.2 ファイル構成

| ファイル | 実装内容 |
|---|---|
| `systems/session/JoinService.ts` | 初回 join / mid-game join 初期化 |
| `systems/session/ReconnectService.ts` | drop/reconnect/leave のゲーム固有処理 |
| `rooms/detonator/DetonatorRoom.ts` | lifecycle hook から service 呼び出し |

### 10.3 実装ステップ

1. `JoinService.createFreshPlayer()` を作る。
2. `JoinService.createMidGamePlayer()` で Lv1 / itemなし / skillなし の初期化を実装する。
3. `ReconnectService.handleDrop()` で `PlayerLifeState.Disconnected` と deadline 記録を実装する。
4. `ReconnectService.handleReconnect()` で client registry 差し替え、危険位置補正、private resync を実装する。
5. `ReconnectService.handleFinalLeave()` で voluntary/timeout を確定し、player 削除方針を統一する。

### 10.4 各ステップの詳細（共有パッケージ利用）

- `packages/protocol`
  - events: `PlayerJoinedEvent`, `PlayerDisconnectedEvent`, `PlayerReconnectedEvent`, `PlayerLeftEvent`, `InventoryUpdatedEvent`, `RewardOfferEvent`
  - enums: `PlayerLifeState`, `LeaveReason`, `GamePhase`
  - types: `JoinOptions`
- `packages/schema`: `PlayerState`
- `packages/rules-core`
  - 途中参加スポーン決定関数
  - 再接続危険位置補正関数
  - リスポーン地点周辺安全マス探索関数
- `JoinService.createMidGamePlayer()` 完了後、inventory は空で初期化するが、`inventory_updated` の送信は行わない（api.md §Private State で定義された 6 契機に「途中参加」は含まれていないため）。

### 10.5 並行可能ステップ / ブロッカーステップ

- 並行可能: drop/reconnect の shell 実装と mid-game spawn 実装。
- ブロッカー: `PrivateStateStore` と `InventoryService` 完了前は reconnect resync が閉じない。

### 10.6 Private State / Runtime State の管理方針

- 途中参加時は `PrivateStateStore` に `inventory=[]`, `pendingRewards=[]` を生成する。
- 同時に `RuntimePlayerState` を初期化し、`skillStacks` は空、timers/flags も初期値にする。
- `onDrop` では private state / runtime state を消さず 60 秒保持する。
- `onReconnect` では `inventory_updated` を送信し、未受取 `reward_offer` を全件 replay する。これは private state の再送（状態復元）であり、api.md の「再接続時」契機に対応する。
- `onLeave(timeout)` でのみ private state / runtime state を破棄する。

### 10.7 イベント送信タイミング

| イベント | タイミング |
|---|---|
| `player_joined` | 初回 join / mid-game join 完了時 |
| `player_disconnected` | `onDrop` 直後 |
| `inventory_updated` | 再接続時（`onReconnect` 完了後）に本人へ再送（mid-game join 時は送信しない — api.md の 6 契機に含まれないため） |
| `reward_offer` | reconnect 完了直後、pending offers 全件 replay（private state 再送。api.md trigger の `level_up` 直後とは別） |
| `player_reconnected` | reconnect 復元完了後 |
| `player_left` | 猶予切れ timeout または voluntary leave 確定時 |

---

## 11. Private State 全体方針

### 11.1 `PrivatePlayerState` と `RuntimePlayerState` の分離

```ts
// PrivatePlayerState — クライアントに再送する情報
type PrivatePlayerState = {
  inventory: InventorySlot[];
  inventoryMaxSlots: number;
  pendingRewardOffers: RewardOfferEvent[];
};

// RuntimePlayerState — サーバーのみで保持、再送不要
type RuntimePlayerState = {
  skillStacks: Map<SkillType, number[]>;
  latestMoveInput: { vx: number; vy: number };
  detonateCooldownEndsAt: number;
  forceIgnitionArmed: boolean;
  disposableLifeExpiresAt: number;
  dashExpiresAt: number;
  catsEyeExpiresAt: number;
  erosionPauseExpiresAt: number;
};
```

### 11.2 `PrivateStateStore` の責務

- `PrivateStateStore` には `sessionId -> PrivatePlayerState` だけを入れる。
- 保持対象は **inventory** と **pendingRewardOffers** のみで、どちらも reconnect / mid-game join / reward replay の private resend 対象。
- `inventory_updated` の payload は常に `PrivateStateStore` を source of truth にして送る。
- `reward_offer` replay も `PrivateStateStore.pendingRewardOffers` を source of truth にする。

### 11.3 `RoomContext` 側 runtime map の責務

- `RoomContext` に `runtimePlayerStateBySessionId: Map<string, RuntimePlayerState>` を持たせる。
- skill stack、入力ベクトル、CT、一時バフ、有効期限はすべてこちらで管理する。`nine_lives` の所持数は inventory のカウントで管理し、`RuntimePlayerState` には持たない（api.md 準拠）。
- これらは server-only であり、クライアント再接続時も直接 replay しない。必要なら public schema 差分または dedicated event から再構築させる。
- floor transition では `skillStacks` を持ち越し、それ以外の CT / dash / disposable_life / forceIgnition / cats_eye / erosion_pause / latest input は初期化、death では一時効果をクリア、timeout leave ではエントリ自体を破棄する。

### 11.4 運用ルール

- **schema に載せるのは public gameplay state のみ**。
- **private resend が必要なものだけを `PrivateStateStore` に置く**。
- **再送不要の server-only 計算状態は `RuntimePlayerState` に閉じ込める**。
- reconnect では `inventory_updated` と `reward_offer` replay を必須にする。
- `SkillService` / `MovementSystem` / `DetonateService` / `DeathService` / `ErosionService` は `RuntimePlayerState` を読む前提で設計し、private resend と混同しない。

---

## 12. タイマーキュー処理計画

| キュー種別 | 保持ファイル | 処理責務 | キャンセル条件 |
|---|---|---|---|
| `detonate_resolve` | `runtime/EventQueue.ts` | `DetonateService.resolveDueFuses()` | source removed / flag removed / mine removed / floor cleared |
| `unmanaged_chain` | `runtime/EventQueue.ts` | `UnmanagedExplosionService.processQueue()` | floor cleared |
| `erosion_warn` | `runtime/EventQueue.ts` | `ErosionService.runWarningPhase()` | pause 中は defer、take_a_breath / short_break / floor cleared |
| `erosion_convert` | `runtime/EventQueue.ts` | `ErosionService.runConvertPhase()` | pause 中は defer、floor cleared で flush |
| `item_expiry` | `runtime/EventQueue.ts` | `DropService.expireGroundItem()` | pickup / explosion / erosion で事前削除 |
| `respawn` | `runtime/EventQueue.ts` | `RespawnService.resolveRespawn()` | floor clear 時は即時 respawn 扱い |
| `effect_expiry` | `runtime/EventQueue.ts` | dash / cats_eye / disposable_life / erosion pause の終了処理 | floor clear / death / manual consume |
| `future_event` | `runtime/EventQueue.ts` | MVP では no-op。enqueue 時に既存 `future_event` があれば拒否する singleton 枠 | floor clear / game over |

### 12.1 QueueProcessor の同 tick 競合ルール

同一 tick で複数の due event が出た場合、`QueueProcessor` は以下のルールで処理する。

> **api.md 準拠**: 同一種タイマー内の複数エントリは**順不同（実装依存）**で逐次処理する（例: 同 tick に複数 `detonate_resolve` があっても順序は不定）。優先順位制御が必要なのは**異種タイマー間**の競合のみ。

1. **flush 系**（floor clear, game over）— 最優先。発火した時点で他の pending event を全部キャンセルし、この tick の残処理も打ち切る。
2. **侵食変換** — `erosion_convert` は pause 中なら defer し、pause 解除後の tick に持ち越す。`erosion_warn` も pause 中なら defer する（api.md: 停止アイテム使用時は `erosion_*` を一時停止）。
3. **侵食サイクル継続** — `erosion_warn` を処理した tick で、現在の warning に対応する `erosion_convert` と、**次インターバル用の次回 `erosion_warn`** をそれぞれ別 scheduledAt で登録する。警告中も次インターバルは進行する。
4. **爆発解決** — `detonate_resolve` / `unmanaged_chain` はそれぞれ同種内では順不同で逐次処理する。各爆発後に盤面再計算（adjacent mine count / item destroy / cancel hook）を挟む。
5. **死亡判定系** — blast / erosion 範囲内プレイヤーの致死確認を通し、後段の respawn / expiry より先に生死を確定する。
6. **寿命系**（`item_expiry`, `effect_expiry`, `respawn`）— 最低優先。上位バンドで floor clear / death が確定した場合は cancel / flush の結果に従う。同種内では順不同。

### 12.2 `future_event` の同時発生上限 1 保証

- `future_event` は MVP では no-op stub とする。
- ただし将来拡張で queue の整合性を崩さないよう、**EventQueue に同時発生上限 1 のチェックを組み込む**。
- `QueueProcessor` が `future_event` の enqueue を受けた際、既存の `future_event` エントリがなければ追加し、既にあれば拒否する。
- floor clear / game over では既存 `future_event` も flush 対象に含める。

---

## 13. コマンド・イベント・タイマーのカバレッジマトリクス

### 13.1 コマンド

| コマンド | 主担当ファイル | 二次責務 |
|---|---|---|
| `move` | `commands/handleMove.ts` | `MovementSystem.ts`, `CheckpointService.ts`, `DropService.ts` |
| `dig` | `commands/handleDig.ts` | `ExpService.ts`, `DropService.ts`, `UnmanagedExplosionService.ts` |
| `flag` | `commands/handleFlag.ts` | grid patch only |
| `detonate` | `commands/handleDetonate.ts` | `DetonateService.ts` |
| `use_item` | `commands/handleUseItem.ts` | `ItemEffectService.ts` |
| `discard_item` | `commands/handleDiscardItem.ts` | `InventoryService.ts`, `DropService.ts` |
| `claim_reward` | `commands/handleClaimReward.ts` | `RewardService.ts`, `InventoryService.ts`, `SkillService.ts` |

### 13.2 Server→Client Events

| イベント | scope | trigger | 送信責務ファイル |
|---|---|---|---|
| `error` | private | コマンドバリデーション失敗時 | `messaging/sendError.ts` |
| `player_joined` | room (broadcast) | `onJoin` 完了時 | `JoinService.ts` |
| `player_left` | room (broadcast) | `onLeave` 完了時 | `ReconnectService.ts` |
| `player_disconnected` | room (broadcast) | `onDrop` 直後 | `ReconnectService.ts` |
| `player_reconnected` | room (broadcast) | `onReconnect` 完了時 | `ReconnectService.ts` |
| `detonate_preview` | room (broadcast) | `detonate` コマンド受付時 | `DetonateService.ts` |
| `detonate_fuse_scheduled` | room (broadcast) | `detonate` コマンド受付時 | `DetonateService.ts` |
| `detonate_fuse_canceled` | room (broadcast) | 起爆源消失 / 旗除去 / 地雷除去 / floor clear | `DetonateService.ts` |
| `detonate_chain_step` | room (broadcast) | 125ms ごとの各セル処理時 | `DetonateService.ts` |
| `detonate_resolved` | room (broadcast) | MST 全ノード処理完了時 | `DetonateService.ts` |
| `unmanaged_explosion_triggered` | room (broadcast) | `DangerousMine` 誤掘り直後 | `UnmanagedExplosionService.ts` |
| `unmanaged_chain_step` | room (broadcast) | 125ms ごとの各連鎖処理時 | `UnmanagedExplosionService.ts` |
| `unmanaged_explosion_resolved` | room (broadcast) | BFS キュー枯渇時 | `UnmanagedExplosionService.ts` |
| `erosion_warning` | room (broadcast) | `erosion_warn` 到達時 | `ErosionService.ts` |
| `erosion_warning_canceled` | room (broadcast) | 停止アイテム使用時 / floor clear | `ErosionService.ts` |
| `erosion_applied` | room (broadcast) | `erosion_convert` 実行時 | `ErosionService.ts` |
| `cats_eye_activated` | room (broadcast) | `cats_eye` 使用直後 | `CatsEyeEffect.ts` |
| `cats_eye_expired` | room (broadcast) | `expiresAt` 到達時 | `CatsEyeEffect.ts` |
| `cp_collected` | room (broadcast) | CP 回収確定時 | `CheckpointService.ts` |
| `exp_gained` | private | dig / flood-fill / detonate combo 後 | `ExpService.ts` |
| `level_up` | room (broadcast) + private 詳細別送 | level 閾値超過時 | `ExpService.ts` |
| `reward_offer` | private | `level_up` 直後 | `RewardService.ts` |
| `item_dropped` | room (broadcast) | dig drop 成功時 / discard 生成時 | `DropService.ts` |
| `item_picked_up` | room (broadcast) | 自動取得成功時 | `DropService.ts` |
| `item_expired` | room (broadcast) | `item_expiry` 到達時 | `DropService.ts` |
| `item_used` | room (broadcast) | manual item 使用成功時 | `ItemEffectService.ts` |
| `item_auto_triggered` | room (broadcast) | `disposable_life` / `nine_lives` 自動発動時 | `DeathService.ts` |
| `item_destroyed` | room (broadcast) | unmanaged explosion / erosion で消滅時 | `DropService.ts` |
| `inventory_updated` | private | pickup / use / discard / death（全ロスト） / floor start / reconnect | `InventoryService.ts` |
| `player_death` | room (broadcast) | 死亡確定時 | `DeathService.ts` |
| `death_avoided` | room (broadcast) | 死亡回避成立時 | `DeathService.ts` |
| `player_ghost` | room (broadcast) | ghost 遷移完了時 | `DeathService.ts` |
| `player_respawned` | room (broadcast) | respawn 位置確定時 | `RespawnService.ts` |
| `game_over` | room (broadcast) | AllDead / Floor10Cleared | `DeathService.ts` / `FloorTransitionService.ts` |
| `floor_cleared` | room (broadcast) | 最後の CP 回収直後 | `FloorTransitionService.ts` |
| `rest_phase_started` | room (broadcast) | 全員復活 + 初期位置復帰完了後 | `FloorTransitionService.ts` |
| `next_floor_started` | room (broadcast) | 新フロア生成完了時 | `FloorTransitionService.ts` |
| `score_updated` | room (broadcast) | フロアスコア確定直後 | `ScoreService.ts` |

### 13.3 API 明記タイマー

| タイマー | 主担当ファイル |
|---|---|
| Detonate fuse | `DetonateService.ts` |
| 管理外爆発連鎖 | `UnmanagedExplosionService.ts` |
| 侵食タイマー | `ErosionService.ts` |
| 地上ドロップ寿命 | `DropService.ts` |
| リスポーンタイマー | `RespawnService.ts` |
| 効果期限（dash / Cat's Eye / Disposable Life / 侵食停止） | `runtime/QueueProcessor.ts` |
| 将来ランダムイベント枠組み（同時発生上限1） | `runtime/QueueProcessor.ts`（stub） |

---

## 14. 実装開始時のおすすめ粒度

1. **最初の PR**: server 雛形、room 登録、context、queue、private store、runtime player state map、initial floor bootstrap。
2. **次の PR**: move / dig / flag / checkpoint / inventory / drop / exp。
3. **次の PR**: death entrance（avoidance 含む） / detonate / unmanaged explosion。
4. **次の PR**: erosion / respawn / death completion。
5. **次の PR**: floor flow / score / floor10 clear。
6. **最後の PR**: use_item 全種、mid-game join、reconnect、総合テスト。

この順序なら、常に「部屋が起動する → 掘れる → 爆発する → 侵食する → 進行が閉じる」の順で動作確認できる。
