# Phase 2: フロントエンド（apps/client）機能別開発プラン

- 対象スタックは **Phaser 3 / Vite 5 / TypeScript 5 / @colyseus/sdk 0.17**。
- 現状リポジトリに `apps/client` は未作成のため、**greenfield 前提**で `apps/client` を設計する。
- クライアントは **サーバー権威の薄い表示層 + 入力送信層** として扱い、ゲームロジック確定・当たり判定・爆発確定・侵食確定は一切持たない。
- 公開状態の唯一の正は `packages/schema` の `GameState`、プライベート状態の唯一の正は `inventory_updated` / `reward_offer` / `cats_eye_activated` / `cats_eye_expired` から構築する runtime store とする。
- `docs/plans/api.md` のイベント名・型名をそのまま使い、独自イベント名（例: `cell_revealed`）は導入しない。
- UI は **スマホ最優先**、ただし PC の操作効率を落とさない。盤面可視領域を最優先し、HUD は最小限・重ね表示前提で設計する。
- `tech-stack.md` に残る「クライアント予測 + サーバー調整」は旧案として扱い、本計画では採用しない。

## 1. 設計前提

### 1.1 決定1: CP可視化仕様

- `GameState.checkpoints` に **全 CP 座標を常時同期**する。CP 位置は秘密情報として扱わない。
- 通常時の描画条件は `dist² ≤ R²` の **Euclidean 距離判定**。`R` はローカルプレイヤーに適用されている検知半径補正値込みの値を使用する。
- 通常時に可視化されるのは **検知者本人のみ**。チームメイトが同じ CP を見えていても、自分の画面では自分の条件で判定する。
- `cats_eye_activated` を受信したら `privateStateStore.catsEyeActive = true` にし、**全未回収 CP をチーム全体共有表示**へ切り替える。
- `cats_eye_expired` を受信したら `privateStateStore.catsEyeActive = false` に戻し、通常の距離判定へ戻す。
- 可視性判定は `src/utils/visibility.ts` に集約する。`CpLayer` は「可視判定済みの CP 一覧」を受けて描画するだけにし、Scene 側へ判定ロジックを漏らさない。
- `src/utils/visibility.ts` は pure function とし、最低限以下を持つ。

```ts
type CheckpointVisibilityInput = {
  checkpoints: CheckpointState[];
  localPlayer: PlayerState | null;
  catsEyeActive: boolean;
  cpDetectionRadius: number;
};

function isCheckpointVisible(input: {
  checkpoint: CheckpointState;
  localPlayer: PlayerState | null;
  catsEyeActive: boolean;
  cpDetectionRadius: number;
}): boolean;

function getVisibleCheckpointIds(input: CheckpointVisibilityInput): string[];
```

- `cpDetectionRadius` 自体の取得責務は `visibility.ts` に持たせず、progression/HUD 側の selector が提供する。これにより CP 可視化ロジックとレベル/報酬 UI ロジックを分離できる。

### 1.2 決定2: 38イベント受信責務表（完全版）

- `api.md` の **全 38 イベント**を 1 行も省略せず受信責務表に記述する。
- イベント名は `error`, `player_joined`, `detonate_preview` のように **api.md の綴りをそのまま転記**する。
- 受信責務は `registerRoomEventHandlers.ts` 配下の domain handler へ分散する。
- 「受信したが未使用」のイベントは作らない。全イベントについて「どのファイルが」「何をするか」を明記する。

### 1.3 決定3: shared schema と privateStateStore の境界

`privateStateStore` に保持する canonical state は次の 3 つだけに限定する。

| キー | 型 | 更新契機 | 用途 |
|---|---|---|---|
| `inventory` | `InventorySlot[]` | `inventory_updated` のみ | インベントリバー、スロット入力、有効/無効判定 |
| `inventoryMaxSlots` | `number` | `inventory_updated` のみ（`maxSlots` フィールド） | 所持枠上限の表示、スロット拡張の反映 |
| `pendingRewardOffers` | `Map<string, RewardOption[]>` | `reward_offer` のみ | 報酬パネル表示、`claim_reward` 送信元データ |
| `catsEyeActive` | `boolean` | `cats_eye_activated` / `cats_eye_expired` のみ | CP 可視化切替 |

> **注**: `catsEyeActive` はサーバー側 private state ではなく、FE ローカルの派生 UI 状態である。`cats_eye_activated` / `cats_eye_expired` は room broadcast イベントであり、private event ではない。

`privateStateStore` に保持しないもの:

- プレイヤー位置
- プレイヤーの `lifeState`, `respawnAt`, `level`, `exp`, `pendingRewardCount`
- フロア番号、phase、ステージ ID、スコア
- 盤面セル状態、侵食警告、CP 座標、地上ドロップ
- 他プレイヤー情報

設計上のルール:

- **shared schema を複製しない。** 画面都合で selector/view model は作ってよいが、source of truth は schema のまま使う。
- `privateStateStore` は **ネットワークイベントから復元可能な最小鏡像**に留める。
- `selectedSlotIndex`, `targetingMode`, `toastQueue`, `connectionState`, `cameraZoom`, `fuseFxCache` などの UI/runtime state は `privateStateStore` に入れず、Scene runtime または module-local store に置く。

### 1.4 決定4: 入力正規化仕様

- `src/input/inputMapper.ts` を **最終共通出口**にする。Keyboard / VirtualJoystick / ActionButtons / InventoryBar は raw intent を発火するだけにする。
- `move` は `{ vx, vy }` の正規化ベクトルを `MovePayload` として送信する。長さが `1.0` を超える場合は正規化し、静止時は `0, 0` を送る。
- Dig / Flag は `src/input/facingResolver.ts` で **最終移動方向から Facing8** を算出し、Facing 方向の Chebyshev 距離 1 の座標を `DigPayload` / `FlagPayload` にする。
- `mine_remover_*` / `purify` は **Facing4**（`packages/protocol` の enum: N=0, E=1, S=2, W=3）を使用する。斜め入力は近い軸へ補正し、その方向の 1 マス先を `UseItemPayload.targetCoord` に入れる。
- PC 入力:

| 操作 | 入力 |
|---|---|
| 移動 | WASD |
| Dig | J |
| Flag | K |
| Detonate | Space |
| アイテム使用 | 数字 1〜0 |

- スマホ入力:

| 操作 | 入力 |
|---|---|
| 移動 | 左下ジョイスティック |
| Dig / Flag / Detonate | 右下仮想ボタン |
| アイテム | スロットタップ / 破棄ボタン |

- `relay_point` / `bridge` のように明示 target が必要なアイテムは、スロット選択後に `TargetingOverlay` を開き、盤面タップで `targetCoord` を確定する。
- `detonate` は Dig / Flag と同様に **Facing8 前方 1 マス**をデフォルト対象にする。PC/スマホともに「前方の旗付き地雷 / Relay Point に点火する」操作へ統一する。

### 1.5 決定5: ロビー遷移・再接続

- 最初の接続は `joinOrCreate("LobbyRoom", { displayName })`。
- ゲーム開始時は `LobbyRoom` から受け取った reservation を `consumeSeatReservation(reservation)` で消費し、`DetonatorRoom` に入る。
- 観戦 / 途中参加は `joinById(roomId, { displayName })` を使う。
- 切断後 60 秒以内は `reconnect(roomId, sessionId)` を試行する。
- `src/net/connection/reconnectController.ts` の責務:
  - socket close / room leave / browser offline を検知
  - 再接続猶予のタイマー表示
  - `reconnect()` のリトライ制御
  - 成功時に scene/runtime cache を安全に再同期
- 再接続成功時は **schema 全量再同期 + `inventory_updated` 再送 + pending `reward_offer` 全件 replay** を前提に UI を再構築する。

## 2. 推奨ディレクトリ構成

```text
apps/client/
  index.html                                  # Vite エントリ HTML
  package.json                                # Phaser/Vite/Colyseus クライアント依存
  tsconfig.json                               # client 用 TypeScript 設定
  vite.config.ts                              # alias, assets, dev server 設定
  public/
    assets/
      tiles/                                  # 盤面タイル画像
      player/                                 # プレイヤースプライト/名前枠
      item/                                   # アイテムアイコン
      cp/                                     # CP アイコン/共有表示アイコン
      ui/                                     # ボタン/HUD 画像
      sfx/                                    # 効果音
      bgm/                                    # BGM
  src/
    main.ts                                   # DOM mount と Phaser 起動
    styles/
      global.css                              # body/canvas/overlay の共通 CSS
    app/
      bootstrapClientApp.ts                   # Client 初期化 + Phaser 起動順制御
      createPhaserGame.ts                     # Phaser.GameConfig 構築
      AppRuntime.ts                           # scene 間で共有する runtime コンテナ
      SceneKeys.ts                            # Scene key 定数
    assets/
      AssetManifest.ts                        # preload 対象のアセット一覧
    scenes/
      BootScene.ts                            # preload, audio unlock 前処理, first route
      LobbyScene.ts                           # 表示名入力、参加一覧、開始待機
      GameScene.ts                            # メインゲームプレイ画面
      RestScene.ts                            # フロア休憩、報酬選択導線
      GameOverScene.ts                        # 勝敗・最終スコア表示
    net/
      createColyseusClient.ts                 # @colyseus/sdk Client 生成
      connection/
        LobbyConnectionService.ts             # joinOrCreate / consumeSeatReservation / joinById
        RoomSessionService.ts                 # current room, sessionId, roomId 管理
        reconnectController.ts                # 切断検知、reconnect 試行、復帰 UI
        sessionStorage.ts                     # roomId/sessionId/displayName の永続化
      schema/
        bindGameState.ts                      # GameState/MapSchema/ArraySchema の監視登録
        createSchemaSelectors.ts              # localPlayer, alivePlayers, currentFloor などの selector
      events/
        registerRoomEventHandlers.ts          # 38イベントの登録口
        handlers/
          errorEvents.ts                      # error -> toast / SFX
          presenceEvents.ts                   # join/left/disconnect/reconnect 通知
          detonateEvents.ts                   # detonate 系 FX 受信
          unmanagedExplosionEvents.ts         # 管理外爆発 FX 受信
          erosionEvents.ts                    # 侵食 warning/apply 受信
          checkpointEvents.ts                 # cats eye / cp_collected 受信
          progressionEvents.ts                # exp/level/reward 受信
          itemEvents.ts                       # item / inventory 受信
          lifeEvents.ts                       # death / ghost / respawn 受信
          floorEvents.ts                      # floor / score / game_over 受信
    state/
      private/
        privateStateTypes.ts                  # inventory/reward/catsEye の型定義
        privateStateStore.ts                  # private event 由来状態ストア
      view/
        createViewModels.ts                   # schema + private store -> UI view model 化
        selectors.ts                          # HUD/board/player 用 selector 群
    render/
      board/
        BoardCoordinateMapper.ts              # world/grid/screen 座標変換
        CellSpriteFactory.ts                  # CellType ごとの tile/sprite 生成
        GridLayer.ts                          # 盤面セル描画
        NumberTextLayer.ts                    # adjacentMineCount の数字描画
        CpLayer.ts                            # CP の可視化制御と描画
        GroundItemLayer.ts                    # GroundItemState の描画同期
        CameraController.ts                   # ローカルプレイヤー追従カメラ
      player/
        PlayerLayer.ts                        # プレイヤー一覧描画管理
        PlayerSprite.ts                       # 本体、向き、ライフ状態表現
        PlayerNameLabel.ts                    # displayName 表示
        LocalPlayerMarker.ts                  # 自分マーカー / 選択リング
      fx/
        FxTimelineStore.ts                    # detonate/unmanaged/erosion の一時 FX キャッシュ
        DetonateFxLayer.ts                    # provisional MST / fuse / chain 演出
        UnmanagedExplosionFxLayer.ts          # 衝撃波 / 荒地化 / 連鎖演出
        ErosionFxLayer.ts                     # 警告 / countdown / 変換演出
        ScreenFxController.ts                 # shake / flash / vignette
    input/
      KeyboardController.ts                  # WASD/J/K/Space/数字入力
      VirtualJoystick.ts                     # 左下アナログジョイスティック
      ActionButtons.ts                       # 右下 Dig/Flag/Detonate ボタン
      targetingController.ts                 # relay_point / bridge の盤面ターゲット選択
      facingResolver.ts                      # Facing8/Facing4 算出
      inputMapper.ts                         # raw input -> 7 commands 変換
      CommandDispatcher.ts                   # room.send の型付き薄ラッパ
    ui/
      hud/
        PlayerHudPanel.ts                    # level / EXP / death 状態表示
        ExpBar.ts                            # EXP ゲージ描画
        InventoryBar.ts                      # 3〜10枠のアイテムバー
        InventorySlotButton.ts               # 個別スロット UI
        RewardOfferPanel.ts                  # reward_offer 表示と claim_reward 送信
        ScorePanel.ts                        # total/floor score 表示
        FloorInfoPanel.ts                    # floor / phase / stage 情報
        NotificationToast.ts                 # エラー/EXP/拾得/状態変化トースト
        MultiplayerNoticePanel.ts            # join/left/disconnect/reconnect 通知
        ConnectionBanner.ts                  # reconnect 中の上部バナー
      lobby/
        DisplayNameForm.ts                   # 表示名入力 UI
        ParticipantList.ts                   # ロビー参加者一覧
        StageInfoPanel.ts                    # ステージ概要/ルール抜粋表示
      overlays/
        TargetingOverlay.ts                  # targetCoord 必須アイテムの照準 UI
        AudioUnlockOverlay.ts                # モバイル初回タップ解禁 UI
        GameOverSummary.ts                   # 最終結果カード
    audio/
      AudioController.ts                     # SFX/BGM の統合窓口
      SfxCatalog.ts                          # event -> SFX key 対応表
      BgmController.ts                       # フロア別 BGM 切替
    utils/
      visibility.ts                          # CP 可視化判定純関数
      worldMath.ts                           # 正規化、距離、cell offset 補助
      disposer.ts                            # listener/Phaser object 解放ユーティリティ
    test/
      setup.ts                               # client unit test 初期化
      fixtures/mockRoom.ts                   # room/send をモックする fixture
      inputMapper.spec.ts                    # 入力正規化テスト
      facingResolver.spec.ts                 # Facing8/Facing4 テスト
      visibility.spec.ts                     # CP 可視化テスト
      privateStateStore.spec.ts              # private state 更新テスト
```

### 共通ファイルの責務

| ファイル | 責務 |
|---|---|
| `src/app/AppRuntime.ts` | `client`, `roomSession`, schema selector, private store, audio, current displayName を scene 間共有するコンテナ |
| `src/net/schema/bindGameState.ts` | `room.state` の差分監視を Phaser layer が扱いやすい selector 更新へ変換 |
| `src/net/events/registerRoomEventHandlers.ts` | 38イベントを一箇所で購読し domain handler へ委譲 |
| `src/state/private/privateStateStore.ts` | inventory / pendingRewardOffers / catsEyeActive の canonical mirror |
| `src/render/fx/FxTimelineStore.ts` | schema に載らない fuse countdown, chain progress, countdown text などの一時 FX 状態 |
| `src/input/inputMapper.ts` | すべての raw input を `MovePayload` 等 7 コマンドへ正規化する唯一の出口 |
| `src/audio/AudioController.ts` | イベント由来 SFX と scene/floor 由来 BGM を一元制御 |
| `src/utils/visibility.ts` | CP 可視判定を純関数化し `CpLayer` から分離 |

## 3. モジュール1: Phaserプロジェクト基盤

### 3.1 役割と責務

- `apps/client` の Vite/Phaser 雛形作成。
- Boot → Lobby → Game → Rest → GameOver の scene ライフサイクル定義。
- Colyseus client 生成、room join/leave/reconnect、session 永続化の整備。
- `GameState` binding と domain event routing の初期化。
- private state store、view model selector、Scene 共有 runtime の整備。
- モバイル初回タップ時の audio unlock とブラウザ再フォーカス時の復帰処理。
- 以後のすべての描画・HUD・入力モジュールの土台になるため、最優先ブロッカー。

### 3.2 ファイル構成テーブル

| ファイル | 実装内容 |
|---|---|
| `src/main.ts` | DOM mount、`bootstrapClientApp()` 呼び出し |
| `src/app/bootstrapClientApp.ts` | `Client` 作成、AppRuntime 初期化、Phaser 起動 |
| `src/app/createPhaserGame.ts` | canvas サイズ、scale mode、scene 登録、input 共通設定 |
| `src/app/AppRuntime.ts` | scene 横断依存の DI コンテナ |
| `src/scenes/BootScene.ts` | アセット preload、audio unlock overlay 表示、初期遷移 |
| `src/scenes/LobbyScene.ts` | LobbyRoom 接続と待機 UI |
| `src/scenes/GameScene.ts` | gameplay 中の layer 組み立て |
| `src/scenes/RestScene.ts` | 休憩フェーズ専用 UI |
| `src/scenes/GameOverScene.ts` | 最終結果 UI |
| `src/net/createColyseusClient.ts` | 接続先 URL と SDK client 生成 |
| `src/net/connection/LobbyConnectionService.ts` | `joinOrCreate`, `consumeSeatReservation`, `joinById` の窓口 |
| `src/net/connection/RoomSessionService.ts` | current room, roomId, sessionId, displayName の保持 |
| `src/net/connection/reconnectController.ts` | 60秒再接続、offline/online 監視、復帰通知 |
| `src/net/connection/sessionStorage.ts` | session 永続化とブラウザ再読込対策 |
| `src/net/schema/bindGameState.ts` | schema 差分監視から selector 更新へ橋渡し |
| `src/net/schema/createSchemaSelectors.ts` | localPlayer, checkpoints, groundItems, floor, phase 等の selector |
| `src/net/events/registerRoomEventHandlers.ts` | 38イベント購読登録 |
| `src/state/private/privateStateStore.ts` | private event 専用 state 更新 |
| `src/state/view/createViewModels.ts` | schema/private store から UI 向け view model を生成 |

### 3.3 実装ステップ

1. `apps/client` を Vite + Phaser + TypeScript で作成し、`packages/protocol`, `packages/schema`, `packages/config` の alias を通す。
2. `BootScene` と `LobbyScene` の最小 shell を作り、表示名入力から `LobbyRoom` へ参加できるようにする。
3. `LobbyConnectionService` で `joinOrCreate("LobbyRoom")`, `consumeSeatReservation()`, `joinById()`, `reconnect()` をラップする。
4. `src/net/connection/RoomSessionService.ts` と `src/net/connection/sessionStorage.ts` を作り、`roomId`, `sessionId`, `displayName` の復元を可能にする。
5. `src/net/schema/bindGameState.ts` で `GameState` 差分監視と selector 更新を実装する。
6. `src/state/private/privateStateStore.ts` と `src/net/events/registerRoomEventHandlers.ts` を作り、private event と public event を分離して購読する。
7. `src/scenes/GameScene.ts`, `src/scenes/RestScene.ts`, `src/scenes/GameOverScene.ts` の scene 遷移骨格を作り、`phase` と `game_over` に応じて切り替える。
8. `src/net/connection/reconnectController.ts` を入れ、切断検知 → バナー表示 → `reconnect()` 試行 → 復帰後 UI 再構築まで通す。

### 3.4 各ステップの詳細（共有パッケージ利用）

- `packages/schema`
  - `GameState`, `GridState`, `FloorState`, `ErosionState`, `CheckpointState`, `GroundItemState`, `PlayerState`
- `packages/protocol`
  - `RoomOptions`, `JoinOptions`
  - 38個すべての event payload interface
  - `InventorySlot`, `RewardOption`, `GamePhase`, `PlayerLifeState`, `LeaveReason`, `GameOverReason`
- `packages/config`
  - UI で表示する item/skill 名称、ステージ名、アイコン key、色テーマ、BGM テーブル

### 3.5 受信イベント、送信コマンド

| 区分 | 内容 |
|---|---|
| 受信イベント | `registerRoomEventHandlers.ts` で **全38イベント**を購読し、各 domain handler へ委譲する |
| 直接扱うイベント | `error`, `player_disconnected`, `player_reconnected`, `inventory_updated`, `reward_offer`, `game_over` |
| 送信コマンド | なし（room join/reconnect は Colyseus lifecycle 操作であり 7コマンドではない） |

### 3.6 並行/ブロッカー

- **ブロッカーA**: `AppRuntime`, `RoomSessionService`, `bindGameState`, `privateStateStore` 完了前は各 layer が room/state を参照できない。
- **ブロッカーB**: `GameScene` の scene shell 完了前は board/player/HUD モジュールを組み込めない。
- 並行可能:
  - scene shell 作成
  - connection service 実装
  - schema selector 実装
  - private state store 実装

## 4. モジュール2: 盤面描画

### 4.1 役割と責務

- `GridState.cells` の authoritative な差分をそのまま Phaser オブジェクトへ反映する。
- 見た目は「安全/危険の内部種別を不用意に露出しない」ことを優先し、**未開放地雷原は SafeMine/DangerousMine を同一スキン**で描く。
- 数字レイヤ、CP レイヤ、地上ドロップレイヤ、侵食 warning レイヤが重なる前提の描画順を固定する。
- ローカルプレイヤー追従カメラを提供し、スマホ UI 被りを考慮したオフセット追従を行う。
- 盤面描画は state-driven、爆発や侵食の一時演出は module 4/5 に切り出す。

### 4.2 ファイル構成テーブル

| ファイル | 実装内容 |
|---|---|
| `src/render/board/BoardCoordinateMapper.ts` | grid <-> world <-> screen の変換 |
| `src/render/board/CellSpriteFactory.ts` | `CellType` ごとのタイル/フレーム決定 |
| `src/render/board/GridLayer.ts` | セルタイル描画と差分更新 |
| `src/render/board/NumberTextLayer.ts` | `adjacentMineCount` 数字描画 |
| `src/render/board/CpLayer.ts` | `visibility.ts` を使った CP 描画 |
| `src/render/board/GroundItemLayer.ts` | `GroundItemState` 同期描画 |
| `src/render/board/CameraController.ts` | プレイヤー追従、dead-zone、ズーム |
| `src/utils/visibility.ts` | CP 可視判定 |

### 4.3 GridLayer の CellType別描画仕様

| `CellType` | 表示 | 追加表現 | 注意点 |
|---|---|---|---|
| `Safe` | 明るい開放タイル | `adjacentMineCount` は NumberTextLayer 側で描画 | CP / Relay Point / player / ground item が重なる基礎レイヤ |
| `SafeMine` | 未開放タイル（閉じた地雷原スキン） | 旗ありなら flag icon、Relay Point ありなら relay marker | `DangerousMine` と**同一見た目**にしてネタバレを避ける |
| `DangerousMine` | 未開放タイル（`SafeMine` と同一） | 追加表現なし | 種別差は FX 時のみ分かる |
| `Wasteland` | ひび割れた荒地タイル | 速度低下を示す鈍い茶色/灰色 | 歩行可だが Dig/Flag 不可を色で示す |
| `Hole` | 黒い穴/奈落タイル | 軽い周辺影 | 移動不可、Bridge 対象であることをターゲティング時にのみ強調 |

描画順:

1. `GridLayer`
2. `NumberTextLayer`
3. `CpLayer`
4. `GroundItemLayer`
5. `PlayerLayer`
6. `FX Layer` 群
7. `HUD`

### 4.4 NumberTextLayer の色分け仕様

- 数字は **`CellType.Safe` かつ `adjacentMineCount > 0`** のセルにだけ描画する。
- `0` は数字を出さず空白にする。
- フォントは視認性優先で太字、スマホでも潰れない outline 付きにする。
- すべての `CellType.Safe` セルは内部的には常に `adjacentMineCount` を持つ前提で扱い、クライアントはその authoritative 値をそのまま使う。
- すべての安全マス（Safe）は内部的に `adjacentMineCount` を保持する。
- `adjacentMineCount === 0` の場合は数字を描画しない。
- `adjacentMineCount > 0` の場合は対応する数字を描画する。
- 侵食後の `adjacentMineCount` 再計算で 0 → 非 0 に変わった場合も、内部値の更新だけで自動的に正しいレンダリングが行われる。

| 数字 | 色 | 用途 |
|---|---|---|
| 1 | `#4FC3F7` | 弱い危険 |
| 2 | `#66BB6A` | 低危険 |
| 3 | `#EF5350` | 中危険 |
| 4 | `#7E57C2` | 中高危険 |
| 5 | `#FF7043` | 高危険 |
| 6 | `#26A69A` | 高危険 |
| 7 | `#AB47BC` | 非常に高危険 |
| 8 | `#ECEFF1` | 最大危険 |

補足:

- `erosionWarning=true` のセルに隣接数字がある場合は outline を黄系に変え、侵食 warning と競合しても読めるようにする。
- 数字自体は shared schema の `adjacentMineCount` を信頼し、クライアント側で再計算しない。
- 侵食後に `adjacentMineCount` が 0 → 非 0 へ変わった Safe セルは、セル種別を変えずに内部値更新だけで数字表示が追従する。

### 4.5 CpLayer の描画仕様と可視性判定委譲（`visibility.ts` 詳細ロジック）

`visibility.ts` の推奨ロジック:

1. `checkpoint.collected === true` の CP は通常描画対象から除外する。
2. `catsEyeActive === true` の場合、**未回収 CP を全件 visible** と判定する。
3. `localPlayer` が `null` もしくは `PlayerLifeState.Disconnected` の間は通常可視判定を止める。
4. 通常時はプレイヤー連続座標 `(player.x, player.y)` と CP セル中心 `(cp.x + 0.5, cp.y + 0.5)` の距離二乗を計算する。
5. `dist² <= cpDetectionRadius²` の場合のみ visible。
6. `cpDetectionRadius` は selector から注入し、`visibility.ts` 自身は radius の導出責務を持たない。

推奨 API:

```ts
function getCheckpointDistanceSq(player: Vec2, cp: GridCoord): number;
function isCheckpointVisible(args: {
  checkpoint: CheckpointState;
  localPlayer: PlayerState | null;
  catsEyeActive: boolean;
  cpDetectionRadius: number;
}): boolean;
function getVisibleCheckpointIds(args: CheckpointVisibilityInput): string[];
```

描画仕様:

- 通常 visible: 白〜青系の薄い発光、本人のみ。
- Cat's Eye 中: チーム共有状態を示す黄系オーラ + 軽い脈動。
- `cp_collected` 受信時: `CpLayer` 本体からは削除しつつ、module 6 の toast と module 8 の SFX で補完する。

### 4.6 GroundItemLayer の同期

- `groundItemId` をキーに `Map<string, Phaser.GameObjects.Container>` を保持する。
- 追加時: `item_dropped` イベントまたは schema 追加で sprite 生成。
- 削除時: `item_picked_up`, `item_expired`, `item_destroyed`, floor transition に応じて該当 sprite を安全に破棄。
- 表示内容:
  - item icon
  - stack count（`stackCount > 1` の場合のみ）
  - expiry が近い場合の点滅
- `GroundItemState.expiresAt` を使って UI countdown を出すかどうかは optional とし、最低限「消える直前の点滅」だけは入れる。

### 4.7 カメラ追従

- `CameraController` はローカルプレイヤー中心追従を行う。
- スマホでは下部ジョイスティック/HUD に視界を奪われるため、**画面中心よりやや上**に local player が来るオフセット追従を採用する。
- 推奨仕様:
  - dead-zone あり（微小移動でカメラ酔いを起こさない）
  - フロア開始/リスポーン時のみ短い easing
  - pinch zoom は MVP 外、固定ズーム + 端末比率に応じた scale 調整に留める
- `lifeState=Ghost` でも自分追従を維持し、観戦移動を妨げない。

### 4.8 実装ステップ

1. `BoardCoordinateMapper` を作り、セルサイズ・ワールド座標・スクリーン座標を統一する。
2. `GridLayer` を先に作り、`CellType` 差分だけで盤面が再描画できる状態にする。
3. `NumberTextLayer` を重ね、`adjacentMineCount` を authoritative 反映する。
4. `visibility.ts` と `CpLayer` を実装し、通常表示 / Cat's Eye 切替を通す。
5. `GroundItemLayer` を作り、地上ドロップ追加・削除を同期する。
6. `CameraController` を結線し、local player 追従と next floor の再センタリングを入れる。

### 4.9 各ステップの詳細（共有パッケージ利用）

- `packages/schema`: `GridState`, `CellState`, `CheckpointState`, `GroundItemState`, `PlayerState`
- `packages/protocol`: `CellType`, `GridCoord`, `PlayerLifeState`, `ItemDroppedEvent`, `ItemPickedUpEvent`, `ItemExpiredEvent`, `ItemDestroyedEvent`, `CpCollectedEvent`, `CatsEyeActivatedEvent`, `CatsEyeExpiredEvent`
- `packages/config`: セルスキン key、数字色、CP アイコン key、カメラズーム初期値

### 4.10 受信イベント、送信コマンド

| 区分 | 内容 |
|---|---|
| 受信イベント | `cats_eye_activated`, `cats_eye_expired`, `cp_collected`, `item_dropped`, `item_picked_up`, `item_expired`, `item_destroyed`, `erosion_warning`, `erosion_applied`, `detonate_chain_step`, `detonate_resolved`, `unmanaged_chain_step`, `unmanaged_explosion_resolved`, `next_floor_started`, `player_respawned` |
| 送信コマンド | なし |

### 4.11 並行/ブロッカー

- **ブロッカーA**: module 1 の `bindGameState.ts` と `createSchemaSelectors.ts` が必要。
- **ブロッカーB**: `BoardCoordinateMapper` 完了前は player/input/fx すべてが座標変換を共有できない。
- 並行可能:
  - `GridLayer` と `GroundItemLayer`
  - `visibility.ts` と `NumberTextLayer`
  - `CameraController` は local player selector さえあれば独立実装可

## 5. モジュール3: プレイヤー描画・操作

### 5.1 役割と責務

- `players: MapSchema<PlayerState>` を authoritative に描画する。
- local player と remote player の見た目差、ghost/disconnected の見た目差を整理する。
- PC/スマホの raw input を吸収し、`inputMapper.ts` だけが 7 コマンドへ変換する構成にする。
- 操作不能フェーズ（Rest, FloorClearTransition, GameOver）では入力受理を止める。
- target required item は `TargetingOverlay` へ遷移し、通常入力と衝突させない。

### 5.2 ファイル構成テーブル

| ファイル | 実装内容 |
|---|---|
| `src/render/player/PlayerLayer.ts` | `sessionId -> PlayerSprite` 管理 |
| `src/render/player/PlayerSprite.ts` | 本体 sprite、向き更新、lifeState 演出 |
| `src/render/player/PlayerNameLabel.ts` | 表示名ラベル |
| `src/render/player/LocalPlayerMarker.ts` | 自分を示すリング/矢印 |
| `src/input/KeyboardController.ts` | WASD/J/K/Space/数字 1〜0 の raw intent 発火 |
| `src/input/VirtualJoystick.ts` | 左下固定のアナログスティック |
| `src/input/ActionButtons.ts` | Dig/Flag/Detonate ボタン |
| `src/input/targetingController.ts` | relay_point / bridge 用 target mode |
| `src/input/facingResolver.ts` | `Facing8` → `Facing4` 射影関数。戻り値型は `packages/protocol` の `Facing4` enum に合わせる |
| `src/input/inputMapper.ts` | raw intent -> `move/dig/flag/detonate/use_item/discard_item/claim_reward` |
| `src/input/CommandDispatcher.ts` | `room.send()` の型安全薄ラッパ |

### 5.3 PlayerSprite の描画仕様

| 要素 | 仕様 |
|---|---|
| 向き | `Facing8` に応じて 8方向フレーム、最低でも左右反転 + 上下差分を持つ |
| 識別色 | `sessionId` から安定ハッシュでチーム内重複しにくい色を割り当てる |
| 名前 | `displayName` を頭上ラベル表示、遠距離でも読める outline 付き |
| local player | 足元リング + 自分用ハイライト |
| `Alive` | 通常不透明 |
| `Ghost` | 半透明（推奨 alpha 0.45）、青白い輪郭、衝突しないことを見た目で示す |
| `Disconnected` | desaturate + 点滅、復帰待ち状態を明示 |

補足:

- `respawnAt > 0` の間は名前ラベル横に countdown を置いてもよいが、最低限 HUD に残り時間を出す。
- `player_joined` 直後はフェードイン、`player_left` 時は即削除ではなく短い fade-out を入れると視認性が高い。

### 5.4 VirtualJoystick の仕様

- 左下固定配置、親指で届く範囲に収める。
- 出力は `{-1.0 .. 1.0}` のアナログベクトル。
- 推奨仕様:
  - dead-zone あり（微振動で move 送信し続けない）
  - 最大半径到達時に長さ 1.0
  - 指を離した瞬間に `(0, 0)` を emit
  - 盤面 UI の上に重ねるが、透過度を高めて盤面可視性を保つ
- `VirtualJoystick` 自身は payload を作らず、`rawMoveVectorChanged(vx, vy)` だけを発火する。

### 5.5 ActionButtons の仕様

- 右下に Dig / Flag / Detonate の 3 ボタンを常設。
- ボタンは片手操作前提で扇形または三角配置。
- 各ボタンは `pressed` 時に raw action を出すだけで、target 解決は `inputMapper.ts` 側。
- `GamePhase.Playing` 以外では disabled 表示にする。
- `detonate` は cooldown 概念がクライアントに確定しないため、押せるが server rejection が来る前提。`error` 受信時に赤フラッシュでフィードバックする。

### 5.6 KeyboardController のキーマップ

| キー | 動作 | 備考 |
|---|---|---|
| W | 上移動 | A/S/D と合成して斜め移動可 |
| A | 左移動 | 同上 |
| S | 下移動 | 同上 |
| D | 右移動 | 同上 |
| J | Dig | Facing8 前方1マス |
| K | Flag | Facing8 前方1マス |
| Space | Detonate | Facing8 前方1マス |
| 1〜0 | アイテム使用 | `slotIndex=0..9` |

### 5.7 inputMapper の正規化フロー

1. `KeyboardController` / `VirtualJoystick` / `ActionButtons` / `InventoryBar` から raw intent を受け取る。
2. 最後の非ゼロ移動ベクトルを `lastMoveVector` として保持する。
3. `move`:
   - `len = sqrt(vx*vx + vy*vy)`
   - `len > 1` なら `(vx/len, vy/len)` へ正規化
   - `len <= deadZone` なら `(0,0)`
   - `MovePayload` を送信
4. Dig / Flag / Detonate:
   - `lastMoveVector` から `Facing8` を求める
   - `worldToCell(localPlayer.x, localPlayer.y)` を基準セルにする
   - Facing8 方向の offset を足して target cell を求める
   - `DigPayload`, `FlagPayload`, `DetonatePayload` を送信
5. `mine_remover_*` / `purify`:
   - `Facing4` を求める
   - 斜めなら絶対値が大きい軸へ補正、同値なら前回の cardinal facing を保持
   - 1マス前方を `UseItemPayload.targetCoord` として送る
6. `relay_point` / `bridge`:
   - スロット選択で `targetingController.enter(slotIndex, itemType)`
   - 盤面タップ時に `UseItemPayload { slotIndex, targetCoord }` を送る

### 5.8 実装ステップ

1. `PlayerLayer` と `PlayerSprite` を実装し、`players` の追加・更新・削除を描画できるようにする。
2. `KeyboardController` を実装し、PC で `move/dig/flag/detonate` が送れるようにする。
3. `VirtualJoystick` と `ActionButtons` を実装し、スマホ入力を通す。
4. `facingResolver.ts` を実装し、Facing8 / Facing4 の判定を unit test で固定する。
5. `inputMapper.ts` と `CommandDispatcher.ts` を実装し、全入力をここ経由に統一する。
6. `targetingController.ts` を追加し、`relay_point` / `bridge` の board tap targeting を完了する。

### 5.9 各ステップの詳細（共有パッケージ利用）

- `packages/schema`: `PlayerState`, `GameState`
- `packages/protocol`:
  - commands: `MovePayload`, `DigPayload`, `FlagPayload`, `DetonatePayload`, `UseItemPayload`, `DiscardItemPayload`
  - enums: `Facing8`, `Facing4`, `PlayerLifeState`, `ItemType`, `GamePhase`
  - interfaces: `GridCoord`
- `packages/config`: プレイヤー色パレット、仮想ボタンレイアウト、dead-zone 値

### 5.10 送信コマンド

| コマンド | 送信元ファイル | 生成条件 |
|---|---|---|
| `move` | `src/input/inputMapper.ts` | WASD / joystick ベクトル更新時 |
| `dig` | `src/input/inputMapper.ts` | J / Dig ボタン押下時 |
| `flag` | `src/input/inputMapper.ts` | K / Flag ボタン押下時 |
| `detonate` | `src/input/inputMapper.ts` | Space / Detonate ボタン押下時 |
| `use_item` | `src/input/inputMapper.ts`, `src/ui/hud/InventoryBar.ts`, `src/input/targetingController.ts` | 数字キー / スロットタップ / target 確定時 |
| `discard_item` | `src/ui/hud/InventoryBar.ts` | スロットの破棄ボタン押下時 |

### 5.11 並行/ブロッカー

- **ブロッカーA**: local player selector がないと camera/input/player marker が成立しない。
- **ブロッカーB**: `BoardCoordinateMapper` 完了前は targeting と facing target が組めない。
- 並行可能:
  - `PlayerLayer` と `KeyboardController`
  - `VirtualJoystick` と `ActionButtons`
  - `facingResolver` と `inputMapper` unit test

## 6. モジュール4: 爆発演出

### 6.1 役割と責務

- 管理爆発（Detonate）と管理外爆発（誤掘り）を **描画面でも完全分離**する。
- いずれも authoritative state を書き換えず、event payload と schema patch を見て一時演出だけを出す。
- 125ms 連鎖テンポ、fuse countdown、cancel handling、画面揺れ/フラッシュを司る。

### 6.2 ファイル構成テーブル

| ファイル | 実装内容 |
|---|---|
| `src/render/fx/FxTimelineStore.ts` | sourceCoord / epicenterCoord ごとの一時 FX 状態管理 |
| `src/render/fx/DetonateFxLayer.ts` | provisional path, fuse, chain 演出 |
| `src/render/fx/UnmanagedExplosionFxLayer.ts` | shockwave, wasteland morph, chain 演出 |
| `src/render/fx/ScreenFxController.ts` | shake / flash / vignette |

### 6.3 DetonateFxLayer 仕様

- `detonate_preview` 受信時:
  - `sourceCoord` を起点に `provisionalPath` を線で描く
  - 線は **「予測」**であると分かるよう点線/半透明にする
  - `fuseEndsAt` を元にカウントダウンを表示する
- `detonate_fuse_scheduled` 受信時:
  - `initiatorSessionId` のプレイヤー足元を薄く点滅
  - source node に fuse アイコンを出す
- `detonate_fuse_canceled` 受信時:
  - provisional 線と countdown を即消去
  - `reason` に応じて色を変えたキャンセル弾けエフェクトを出す
- `detonate_chain_step` 受信時:
  - `coord` に 125ms テンポの発火エフェクト
  - `remainingPath` を使って未処理線を短く更新
  - `wasRelayPoint=true` なら relay 専用色で強調
- `detonate_resolved` 受信時:
  - `processedCells` 全体に短い残光
  - preview/fuse cache を破棄

### 6.4 UnmanagedExplosionFxLayer 仕様

- `unmanaged_explosion_triggered` 受信時:
  - `blastCoords` に強い衝撃波リング
  - `wastelandCoords` に荒地化予兆エフェクト
  - `triggerSessionId` を中心に screen shake 強
- `unmanaged_chain_step` 受信時:
  - `coord` ごとに 125ms 連鎖爆発
  - `chainDepth` を使って音量/明るさを段階調整
  - `blastCoords` と `wastelandCoords` の両方を毎 step 更新
- `unmanaged_explosion_resolved` 受信時:
  - chain batch を閉じ、残り粒子をフェードアウト

### 6.5 ScreenFxController 仕様

- 画面揺れ:
  - Detonate: 小
  - 管理外爆発: 大
  - 侵食適用: 中
- フラッシュ:
  - Detonate: 白系短発光
  - 管理外爆発: 橙〜赤の強 flash
  - 死亡回避: 緑/青の保護 flash
- すべて **モバイルで眩しすぎない強度**に clamp する。

### 6.6 実装ステップ

1. `FxTimelineStore` を作り、sourceCoord/epicenterCoord ごとの一時キャッシュを保持できるようにする。
2. `DetonateFxLayer` を実装し、preview/fuse/cancel/chain/resolved の一連を通す。
3. `UnmanagedExplosionFxLayer` を実装し、triggered/chain/resolved を通す。
4. `ScreenFxController` を追加し、爆発と死亡回避の強弱を統一する。

### 6.7 各ステップの詳細（共有パッケージ利用）

- `packages/protocol`:
  - `DetonatePreviewEvent`
  - `DetonateFuseScheduledEvent`
  - `DetonateFuseCanceledEvent`
  - `DetonateChainStepEvent`
  - `DetonateResolvedEvent`
  - `UnmanagedExplosionTriggeredEvent`
  - `UnmanagedChainStepEvent`
  - `UnmanagedExplosionResolvedEvent`
  - `FuseCancelReason`, `CellType`
- `packages/schema`: `CellState`
- `packages/config`: 爆発色、shake 強度、countdown 表示スタイル

### 6.8 受信イベント、送信コマンド

| 区分 | 内容 |
|---|---|
| 受信イベント | `detonate_preview`, `detonate_fuse_scheduled`, `detonate_fuse_canceled`, `detonate_chain_step`, `detonate_resolved`, `unmanaged_explosion_triggered`, `unmanaged_chain_step`, `unmanaged_explosion_resolved`, `death_avoided` |
| 送信コマンド | なし |

### 6.9 並行/ブロッカー

- **ブロッカーA**: `BoardCoordinateMapper` が必要。
- **ブロッカーB**: module 1 の event handler 登録が必要。
- 並行可能:
  - `DetonateFxLayer` と `UnmanagedExplosionFxLayer`
  - `ScreenFxController` は独立実装可

## 7. モジュール5: 侵食演出

### 7.1 役割と責務

- `erosion_warning` と `erosion_applied` を見た目で明確に分離し、「次に危ない場所」と「変換済み」を即理解できるようにする。
- 可変警告時間 countdown（インターバルが 4 秒以上なら 3 秒、4 秒未満ならその 3/4）、停止アイテム中の pause 表示、warning cancel を扱う。
- 盤面更新そのものは schema patch に任せ、侵食 layer は overlay / countdown / warning emphasis だけを担当する。

### 7.2 ファイル構成テーブル

| ファイル | 実装内容 |
|---|---|
| `src/render/fx/ErosionFxLayer.ts` | warning / countdown / conversion overlay |
| `src/render/fx/ScreenFxController.ts` | 侵食適用時の flash / vignette |

### 7.3 ErosionFxLayer 仕様

- `erosion_warning`:
  - `targetCoords` に黄〜橙の warning overlay（選定済み Safe セル + 盤面上の Wasteland を同列に扱う）
  - `warningEndsAt` までの countdown text を表示
  - countdown は盤面中央のグローバル表示 + 対象セル点滅の二段構え
- `erosion_warning_canceled`:
  - `canceledCoords` の overlay を消す
  - `reason` が `take_a_breath` / `short_break` なら「侵食停止中」表示へ切替
- `erosion_applied`:
  - `convertedSafeMineCoords` / `convertedDangerousMineCoords` を別色で短く発光
  - `updatedAdjacentCoords` で数字が変わるセルは NumberTextLayer を再 tween
- 停止中表示:
  - `ErosionState.active=false` の間は上部に小さな pause badge を出す
  - 再開時に自動で消す

### 7.4 実装ステップ

1. warning overlay と global countdown を作る。
2. `erosion_warning_canceled` で停止表示へ遷移できるようにする。
3. `erosion_applied` で変換アニメーションと数字再強調を入れる。
4. ScreenFx と組み合わせて侵食適用時の圧を出す。

### 7.5 各ステップの詳細（共有パッケージ利用）

- `packages/protocol`:
  - `ErosionWarningEvent`
  - `ErosionWarningCanceledEvent`
  - `ErosionAppliedEvent`
  - `ErosionWarningCancelReason`
- `packages/schema`: `ErosionState`, `CellState`
- `packages/config`: warning 色、countdown テーマ、pause badge 文言

### 7.6 受信イベント、送信コマンド

| 区分 | 内容 |
|---|---|
| 受信イベント | `erosion_warning`, `erosion_warning_canceled`, `erosion_applied` |
| 送信コマンド | なし |

### 7.7 並行/ブロッカー

- **ブロッカーA**: board layer がないと overlay の基準座標が決まらない。
- **ブロッカーB**: module 1 の event bridge が必要。
- 並行可能: countdown UI と conversion flash は別担当で実装可能。

## 8. モジュール6: HUD・インベントリ

### 8.1 役割と責務

- レベル、EXP、死亡状態、スコア、フロア情報、インベントリ、報酬、通知を盤面を邪魔しない形で出す。
- `inventory_updated` / `reward_offer` を canonical source とした private UI を構築する。
- 操作ボタンと情報表示を同居させるが、盤面占有率は最小限に保つ。

### 8.2 ファイル構成テーブル

| ファイル | 実装内容 |
|---|---|
| `src/ui/hud/PlayerHudPanel.ts` | level, lifeState, respawnAt, pendingRewardCount 表示 |
| `src/ui/hud/ExpBar.ts` | EXP ゲージ |
| `src/ui/hud/InventoryBar.ts` | スロット一覧、slot tap, discard ボタン |
| `src/ui/hud/InventorySlotButton.ts` | アイコン、stack、selected/disabled 表示 |
| `src/ui/hud/RewardOfferPanel.ts` | reward option 一覧、claim action |
| `src/ui/hud/ScorePanel.ts` | totalScore / floorScore |
| `src/ui/hud/FloorInfoPanel.ts` | floorNumber / phase / stageId |
| `src/ui/hud/NotificationToast.ts` | エラー/EXP/拾得/死亡などのトースト |
| `src/state/private/privateStateStore.ts` | inventory / reward offer の保持 |

### 8.3 PlayerHudPanel 仕様

- 表示内容:
  - `level`
  - `exp`
  - `pendingRewardCount`
  - `lifeState`
  - `respawnAt` countdown（死亡時のみ）
- `Ghost` 中は HUD に「観戦中 / リスポーンまで N 秒」を出し、入力不能アクションを無効化する。
- `Disconnected` は local player の場合 ConnectionBanner を優先、remote player は multiplayer notice に委譲する。

### 8.4 InventoryBar 仕様

- 3〜10枠を横並び表示。
- 各スロットに以下を表示する。
  - item icon
  - stack count
  - hotkey（PC のみ）
  - discard ボタン
  - target required 時の crosshair マーク
- スロットタップの動作:
  - target 不要 item: そのまま `use_item`
  - `mine_remover_*` / `purify`: 即 `use_item`（target は facingResolver が補完）
  - `relay_point` / `bridge`: `TargetingOverlay` を開く
- `inventory_updated` のたびに **スロット配列全体を canonical 置換**する。局所 patch 推測はしない。

### 8.4.1 アイテム概要ポップアップフィールド

- アイテムスロットを長押し（PC では右クリックまたはホバー）すると、アイテム概要ポップアップを表示する。
- ポップアップ内の構成:
  - アイテム名（`config.items.json` の `displayName`）
  - アイテム説明文（`config.items.json` の `description`）
  - 「使用する」ボタン（対象 item が `manualUse === true` の場合のみ有効）
  - 「捨てる」ボタン（対象 slot が空でない場合のみ有効）
- 閉じ方: ×ボタン、またはポップアップ外をタップ/クリック。
- レスポンシブ設計: デスクトップ・モバイル共通の UI コンポーネントとし、画面幅に応じてポップアップサイズを調整する。
- ポップアップ表示中は盤面入力（移動/Dig/Flag/Detonate）を受け付けない。

### 8.5 RewardOfferPanel 仕様

- `reward_offer` で受け取った `offerId` と `options` をそのまま表示する。
- option 表示内容:
  - 種別（skill / item）
  - 名前
  - 効果量または `stackCount`
  - 選択ボタン
- `claim_reward` 送信中は該当オファーのボタンを disabled にし、重複送信を防ぐ。
- RestScene では自動展開、Playing 中は右上の「報酬 N」ボタンから開閉する。

### 8.6 ScorePanel / FloorInfoPanel / NotificationToast 仕様

- `ScorePanel`
  - `totalScore` 常時表示
  - `score_updated` 受信時に `floorScore` を加点アニメーション
- `FloorInfoPanel`
  - `floorNumber`
  - `phase`
  - `stageId`（内部 ID のまま出さず config 名称へ変換）
- `NotificationToast`
  - `error`: 赤トースト
  - `exp_gained`: 青/緑の加算トースト
  - `item_picked_up`: アイコン付き取得トースト
  - `player_death`: 警告トースト
  - `death_avoided`: 保護トースト
  - `level_up`: 祝福トースト

### 8.7 実装ステップ

1. `PlayerHudPanel` と `ExpBar` を作り、shared schema のみで HUD が更新される状態にする。
2. `privateStateStore` と連動する `InventoryBar` を作る。
3. `RewardOfferPanel` を作り、`reward_offer` と `claim_reward` を通す。
4. `ScorePanel`, `FloorInfoPanel` を追加する。
5. `NotificationToast` で error/exp/item/death 系通知を統一する。

### 8.8 各ステップの詳細（共有パッケージ利用）

- `packages/schema`: `PlayerState`, `GameState`, `FloorState`
- `packages/protocol`:
  - `InventorySlot`, `RewardOption`
  - `InventoryUpdatedEvent`, `RewardOfferEvent`, `ExpGainedEvent`, `LevelUpEvent`, `ItemPickedUpEvent`, `PlayerDeathEvent`, `DeathAvoidedEvent`, `ScoreUpdatedEvent`
  - `ClaimRewardPayload`, `UseItemPayload`, `DiscardItemPayload`
  - `GamePhase`, `PlayerLifeState`, `ItemType`
- `packages/config`: item 名称/説明、skill 名称/説明、toast 文言、phase 名称

### 8.9 受信イベント、送信コマンド

| 区分 | 内容 |
|---|---|
| 受信イベント | `error`, `exp_gained`, `level_up`, `reward_offer`, `inventory_updated`, `item_picked_up`, `item_used`, `item_auto_triggered`, `player_death`, `death_avoided`, `player_respawned`, `score_updated`, `floor_cleared`, `rest_phase_started`, `next_floor_started` |
| 送信コマンド | `use_item`, `discard_item`, `claim_reward` |

### 8.10 並行/ブロッカー

- **ブロッカーA**: `privateStateStore` が必要。
- **ブロッカーB**: `CommandDispatcher` が必要。
- 並行可能:
  - `PlayerHudPanel` と `ScorePanel`
  - `InventoryBar` と `RewardOfferPanel`
  - `NotificationToast` は独立実装可

## 9. モジュール7: マルチプレイUI

### 9.1 役割と責務

- ロビー、休憩、ゲームオーバー、接続通知といった scene レベル UI を扱う。
- ロビーでは displayName 入力、参加者一覧、ステージ概要表示を行う。
- RestScene では「報酬を今取るフェーズ」であることを強調し、GameScene の HUD より大きい panel を出せるようにする。
- MultiplayerNoticePanel で join/left/disconnect/reconnect を盤面上に重ねて通知する。

### 9.2 ファイル構成テーブル

| ファイル | 実装内容 |
|---|---|
| `src/scenes/LobbyScene.ts` | ロビー scene |
| `src/ui/lobby/DisplayNameForm.ts` | 表示名入力 |
| `src/ui/lobby/ParticipantList.ts` | lobby participant list |
| `src/ui/lobby/StageInfoPanel.ts` | ステージ/ルール抜粋 |
| `src/scenes/RestScene.ts` | 休憩 scene |
| `src/scenes/GameOverScene.ts` | ゲーム終了 scene |
| `src/ui/overlays/GameOverSummary.ts` | 最終スコア、勝敗表示 |
| `src/ui/hud/MultiplayerNoticePanel.ts` | join/left/disconnect/reconnect 通知 |
| `src/ui/hud/ConnectionBanner.ts` | reconnect 中バナー |

### 9.3 LobbyScene 仕様

- 表示名入力フォーム
- 参加者一覧
- ステージ情報（人数、フロア構成、基本操作、再接続猶予など）
- 状態:
  - 初回 `joinOrCreate("LobbyRoom")`
  - reservation 待ち
  - `consumeSeatReservation` 中
  - `joinById` 中（途中参加）

### 9.4 RestScene 仕様

- `rest_phase_started` を受けたら GameScene 上の HUD だけで済まさず、**報酬取得導線が明確な専用 scene/overlay** を開く。
- 表示内容:
  - 現在フロア clear 情報
  - 未受取報酬数
  - `RewardOfferPanel` 拡張表示
  - 次フロア開始待ちの説明

### 9.5 GameOverScene 仕様

- `game_over` 受信時に開く。
- 表示内容:
  - `reason`（`all_dead` / `floor_10_cleared`）
  - `finalFloor`
  - `finalScore`
  - リプレイ/ロビー戻り導線（MVP では最低限リロード案内でも可）

### 9.6 MultiplayerNoticePanel 仕様

- `player_joined`: 参加通知
- `player_left`: 離脱通知
- `player_disconnected`: 切断 + 復帰猶予表示
- `player_reconnected`: 復帰通知
- `player_joined.isMidGame=true` なら「途中参加」を明示する。

### 9.7 実装ステップ

1. `LobbyScene` と `DisplayNameForm` を作る。
2. `ParticipantList` と `StageInfoPanel` を追加する。
3. `MultiplayerNoticePanel` と `ConnectionBanner` を GameScene 共通 HUD として実装する。
4. `RestScene` を作り、報酬選択導線を GameScene から分離する。
5. `GameOverScene` を作る。

### 9.8 各ステップの詳細（共有パッケージ利用）

- `packages/protocol`:
  - `PlayerJoinedEvent`, `PlayerLeftEvent`, `PlayerDisconnectedEvent`, `PlayerReconnectedEvent`
  - `RestPhaseStartedEvent`, `NextFloorStartedEvent`, `GameOverEvent`, `FloorClearedEvent`
  - `LeaveReason`, `GameOverReason`
- `packages/schema`: `GameState`, `PlayerState`
- `packages/config`: ステージ表示名、ロビー説明文、勝敗文言

### 9.9 受信イベント、送信コマンド

| 区分 | 内容 |
|---|---|
| 受信イベント | `player_joined`, `player_left`, `player_disconnected`, `player_reconnected`, `floor_cleared`, `rest_phase_started`, `next_floor_started`, `game_over`, `score_updated` |
| 送信コマンド | なし |

### 9.10 並行/ブロッカー

- **ブロッカーA**: module 1 の scene 遷移基盤が必要。
- **ブロッカーB**: `RewardOfferPanel` 完了前は RestScene の主価値が不足する。
- 並行可能:
  - Lobby UI
  - MultiplayerNoticePanel
  - GameOver UI

## 10. モジュール8: サウンド・演出

### 10.1 役割と責務

- すべての event/UI action に対して一貫した SFX/BGM を付与する。
- モバイルブラウザの audio unlock 制約を吸収する。
- Scene/floor 変化に応じた BGM 切替を行う。

### 10.2 ファイル構成テーブル

| ファイル | 実装内容 |
|---|---|
| `src/audio/AudioController.ts` | SFX/BGM 再生の統一窓口 |
| `src/audio/SfxCatalog.ts` | event/UI action -> sound key の対応表 |
| `src/audio/BgmController.ts` | floor/scene 切替時の BGM 管理 |
| `src/ui/overlays/AudioUnlockOverlay.ts` | 初回タップで audio context 解禁 |

### 10.3 SFXマッピング

| トリガー | SFX |
|---|---|
| `error` | UI エラー音 |
| `player_joined` | 参加ポップ |
| `player_left` | 離脱ダウンチャイム |
| `player_disconnected` | 切断警告チャイム |
| `player_reconnected` | 復帰チャイム |
| `detonate_preview` / `detonate_fuse_scheduled` | 点火 fuse 音 |
| `detonate_chain_step` | 軽い連鎖破裂音 |
| `detonate_resolved` | 収束音 |
| `unmanaged_explosion_triggered` | 重い爆発音 |
| `unmanaged_chain_step` | 連続爆発音 |
| `erosion_warning` | 警告アラーム |
| `erosion_applied` | 侵食スイープ音 |
| `cats_eye_activated` | 発見系チャイム |
| `cats_eye_expired` | 効果終了音 |
| `cp_collected` | 回収成功音 |
| `exp_gained` | 小さな加算音 |
| `level_up` | レベルアップファンファーレ |
| `reward_offer` | 選択肢提示音 |
| `item_picked_up` | 取得音 |
| `item_used` | 使用音 |
| `item_auto_triggered` | 自動発動保護音 |
| `player_death` | ダウン音 |
| `death_avoided` | 保護反射音 |
| `player_respawned` | 復帰音 |
| `floor_cleared` | クリアジングル |
| `rest_phase_started` | 休憩開始ジングル |
| `next_floor_started` | 次フロア開始ジングル |
| `game_over` | 勝利/敗北エンディング |

### 10.4 BGM切替

- `LobbyScene`: ロビー用軽い待機曲
- `GameScene`
  - Floor 1〜3: ベース探索曲
  - Floor 4〜6: 緊張感のある中盤曲
  - Floor 7〜9: 高圧曲
  - Floor 10: 最終フロア曲
- `RestScene`: 短い休憩ループ
- `GameOverScene`: victory / defeat で分岐

### 10.5 モバイル初回タップ解禁

- `BootScene` で `AudioUnlockOverlay` を表示。
- 初回タップ前は SFX/BGM 再生要求を queue し、unlock 後に flush する。
- unlock 未完了でもゲーム開始は可能だが、バナーで「音声を有効化」を再案内する。

### 10.6 実装ステップ

1. `AudioController` と `SfxCatalog` を作る。
2. `AudioUnlockOverlay` を入れる。
3. 爆発・侵食・CP・HUD 主要イベントへ SFX を割り当てる。
4. `BgmController` を実装し、scene/floor で切り替える。

### 10.7 並行/ブロッカー

- **ブロッカーA**: BootScene が必要。
- **ブロッカーB**: event bridge が必要。
- 並行可能:
  - SFX マッピング
  - BGM ルーティング
  - audio unlock overlay

## 11. 38イベント受信責務表（完全版、省略なし）

| イベント名 | 受信ファイル | アクション |
|---|---|---|
| `error` | `src/net/events/handlers/errorEvents.ts` | `ErrorCode` に応じたエラートーストを出し、無効入力 SFX を再生する |
| `player_joined` | `src/net/events/handlers/presenceEvents.ts` | 参加通知を `MultiplayerNoticePanel` と `ParticipantList` に流し、途中参加ならその旨を表示する |
| `player_left` | `src/net/events/handlers/presenceEvents.ts` | 離脱通知を表示し、ロビー/ゲーム中の参加一覧から離脱状態を反映する |
| `player_disconnected` | `src/net/events/handlers/presenceEvents.ts` | 切断通知と復帰猶予を表示し、対象プレイヤーを一時的に disconnected 表示へ切り替える |
| `player_reconnected` | `src/net/events/handlers/presenceEvents.ts` | disconnected 表示を解除し、復帰通知を出す |
| `detonate_preview` | `src/net/events/handlers/detonateEvents.ts` | `DetonateFxLayer` に provisional MST 線と fuse countdown を登録する |
| `detonate_fuse_scheduled` | `src/net/events/handlers/detonateEvents.ts` | fuse タイマー UI を確定し、点火中ノード強調を開始する |
| `detonate_fuse_canceled` | `src/net/events/handlers/detonateEvents.ts` | provisional path と countdown を破棄し、キャンセル理由に応じた FX を出す |
| `detonate_chain_step` | `src/net/events/handlers/detonateEvents.ts` | 125ms chain step を再生し、残り経路表示を更新する |
| `detonate_resolved` | `src/net/events/handlers/detonateEvents.ts` | 爆発演出を終了し、sourceCoord に紐づく一時キャッシュを破棄する |
| `unmanaged_explosion_triggered` | `src/net/events/handlers/unmanagedExplosionEvents.ts` | 初回衝撃波・荒地化予兆・強い screen shake を発火する |
| `unmanaged_chain_step` | `src/net/events/handlers/unmanagedExplosionEvents.ts` | chainDepth 付きの 125ms 連鎖爆発を再生する |
| `unmanaged_explosion_resolved` | `src/net/events/handlers/unmanagedExplosionEvents.ts` | 管理外爆発 batch をクローズし、残粒子をフェードアウトさせる |
| `erosion_warning` | `src/net/events/handlers/erosionEvents.ts` | 対象セル warning overlay と countdown を表示する |
| `erosion_warning_canceled` | `src/net/events/handlers/erosionEvents.ts` | warning overlay を外し、停止アイテム由来なら pause badge を表示する |
| `erosion_applied` | `src/net/events/handlers/erosionEvents.ts` | 侵食変換アニメーションを再生し、数字更新セルを強調する |
| `cats_eye_activated` | `src/net/events/handlers/checkpointEvents.ts` | `privateStateStore.catsEyeActive=true` にして全未回収 CP を共有表示へ切り替える |
| `cats_eye_expired` | `src/net/events/handlers/checkpointEvents.ts` | `privateStateStore.catsEyeActive=false` に戻し、距離判定ベースの可視化へ戻す |
| `cp_collected` | `src/net/events/handlers/checkpointEvents.ts` | CP 回収エフェクト、残数表示更新、回収トースト/SFX を発火する |
| `exp_gained` | `src/net/events/handlers/progressionEvents.ts` | EXP 加算トーストと EXP バーの tween を出す |
| `level_up` | `src/net/events/handlers/progressionEvents.ts` | レベルアップ HUD 演出と pendingRewardCount 表示更新を行う |
| `reward_offer` | `src/net/events/handlers/progressionEvents.ts` | `pendingRewardOffers` に `offerId -> options` を登録し、RewardOfferPanel を開く |
| `item_dropped` | `src/net/events/handlers/itemEvents.ts` | 地上ドロップ生成演出を出し `GroundItemLayer` へ反映する |
| `item_picked_up` | `src/net/events/handlers/itemEvents.ts` | 対象 ground item を消し、取得トーストと取得 SFX を出す |
| `item_expired` | `src/net/events/handlers/itemEvents.ts` | 対象 ground item を寿命切れとして消去する |
| `item_used` | `src/net/events/handlers/itemEvents.ts` | 使用トーストと item 使用 SFX、必要なら targeting 終了を行う |
| `item_auto_triggered` | `src/net/events/handlers/itemEvents.ts` | 自動発動バナーと保護系 SFX を出す |
| `item_destroyed` | `src/net/events/handlers/itemEvents.ts` | ground item を爆発/侵食理由付きで消し、破壊 FX を出す |
| `inventory_updated` | `src/net/events/handlers/itemEvents.ts` | `privateStateStore.inventory` を canonical 置換し、InventoryBar を再描画する |
| `player_death` | `src/net/events/handlers/lifeEvents.ts` | 死亡通知、HUD 状態更新、死亡位置 FX を発火する |
| `death_avoided` | `src/net/events/handlers/lifeEvents.ts` | 回避成功トースト、保護 flash、SFX を再生する |
| `player_ghost` | `src/net/events/handlers/lifeEvents.ts` | 対象プレイヤーを ghost 表示へ切り替え、respawn countdown を HUD に反映する |
| `player_respawned` | `src/net/events/handlers/lifeEvents.ts` | 復帰 burst と HUD 状態解除を行う |
| `game_over` | `src/net/events/handlers/floorEvents.ts` | GameOverScene へ遷移し、最終スコアと勝敗を表示する |
| `floor_cleared` | `src/net/events/handlers/floorEvents.ts` | フロアクリア演出を出し、入力を一時停止する |
| `rest_phase_started` | `src/net/events/handlers/floorEvents.ts` | RestScene へ切り替え、報酬選択導線を強調する |
| `next_floor_started` | `src/net/events/handlers/floorEvents.ts` | 盤面/layer を再初期化し、GameScene へ戻して BGM を切り替える |
| `score_updated` | `src/net/events/handlers/floorEvents.ts` | `ScorePanel` の total/floor score をアニメーション更新する |

## 12. 7コマンド送信一覧

| コマンド | 主送信ファイル | トリガー | payload | 送信条件 |
|---|---|---|---|---|
| `move` | `src/input/inputMapper.ts` | WASD / ジョイスティック変化 | `MovePayload { vx, vy }` | room 接続済み、ローカル入力が変化、`inputMapper` で正規化済み。Ghost 中も移動入力可（観戦用）。Disconnected 中は不可 |
| `dig` | `src/input/inputMapper.ts` | J / Dig ボタン | `DigPayload { x, y }` | `Facing8` 前方 1 マスが解決できる、phase が local UI 上で `Playing`、targeting mode でない、`lifeState === Alive` |
| `flag` | `src/input/inputMapper.ts` | K / Flag ボタン | `FlagPayload { x, y }` | `Facing8` 前方 1 マスが解決できる、phase が local UI 上で `Playing`、targeting mode でない、`lifeState === Alive` |
| `detonate` | `src/input/inputMapper.ts` | Space / Detonate ボタン | `DetonatePayload { x, y }` | `Facing8` 前方 1 マスが解決できる、phase が local UI 上で `Playing`、targeting mode でない、`lifeState === Alive` |
| `use_item` | `src/input/inputMapper.ts`, `src/ui/hud/InventoryBar.ts`, `src/input/targetingController.ts` | 数字 1〜0 / スロットタップ / ターゲット確定 | `UseItemPayload { slotIndex, targetCoord? }` | 対象 slot が空でない、target 必須 item は `targetCoord` 解決済み、`lifeState === Alive` |
| `discard_item` | `src/ui/hud/InventoryBar.ts` | スロットの × ボタン | `DiscardItemPayload { slotIndex }` | 対象 slot が空でない、claim/reconnect overlay 中でない、`lifeState === Alive` |
| `claim_reward` | `src/ui/hud/RewardOfferPanel.ts` | 報酬候補ボタンタップ | `ClaimRewardPayload { offerId, optionIndex }` | `pendingRewardOffers` に `offerId` が存在し、送信中ロックされていない。lifeState は不問（Ghost / Alive どちらでも送信可能） |

## 13. Private State管理方針

### 13.1 最小構造

```ts
type PrivateClientState = {
  inventory: InventorySlot[];
  inventoryMaxSlots: number;
  pendingRewardOffers: Map<string, RewardOption[]>;
  catsEyeActive: boolean;
};
```

### 13.2 更新ルール

| キー | canonical 更新イベント | 補足 |
|---|---|---|
| `inventory` | `inventory_updated` | スロット配列は差分推測せず全置換 |
| `inventoryMaxSlots` | `inventory_updated` | `maxSlots` フィールドから更新。スキルによる枠拡張を反映 |
| `pendingRewardOffers` | `reward_offer` | `offerId` を key に追加/上書き。UI 側の送信中フラグは別管理 |
| `catsEyeActive` | `cats_eye_activated`, `cats_eye_expired` | bool のみ保持し、CP 座標自体は shared schema 参照 |

### 13.3 保持しないもの

- `players`, `grid`, `groundItems`, `checkpoints`, `erosion`, `floorNumber`, `phase`, `score`
- `level`, `exp`, `pendingRewardCount`, `lifeState`
- local/remote player position

### 13.4 selector 方針

- HUD / board / input は store を直接読むのではなく selector 経由で読む。
- selector は `schema + private store` を合成して以下を返す。
  - `localPlayerViewModel`
  - `inventoryViewModel`
  - `rewardPanelViewModel`
  - `checkpointVisibilityViewModel`
  - `connectionBannerViewModel`

### 13.5 reconnect 時の扱い

- schema は room 再接続後に再同期される。
- `inventory` は `inventory_updated` 再送を受けて再構築する。
- `pendingRewardOffers` は replay された `reward_offer` 群で再構築する。
- `catsEyeActive` は reconnect 後に再送されない可能性に備え、切断時に一旦 false へ落とし、再度 `cats_eye_activated` を受けたときだけ true にする実装でもよい。より厳密にするなら reconnect 時の scene 再初期化で visibility cache を全クリアする。

## 14. 入力正規化仕様

### 14.1 入力レイヤ分離

| レイヤ | 責務 |
|---|---|
| `KeyboardController.ts` | PC キー入力を raw intent 化 |
| `VirtualJoystick.ts` | 左下アナログ移動入力 |
| `ActionButtons.ts` | Dig/Flag/Detonate ボタン |
| `InventoryBar.ts` | スロット使用/破棄、target mode 入口 |
| `targetingController.ts` | targetCoord 必須 item の盤面タップ確定 |
| `inputMapper.ts` | 最終 payload 生成と `CommandDispatcher` 呼び出し |

### 14.2 move 正規化

```ts
len = Math.sqrt(vx * vx + vy * vy)
if (len <= deadZone) return { vx: 0, vy: 0 }
if (len > 1) return { vx: vx / len, vy: vy / len }
return { vx, vy }
```

- `move` はアナログ量を保持する。
- キーボード斜め入力 `W + D` は `(1, -1)` から正規化して送る。
- raw 入力機器ごとの差は `inputMapper` で吸収し、server 側には常に `MovePayload` だけを送る。

### 14.3 Facing8 判定

- 入力ベクトルの角度から 45 度刻みで octant を決める。
- 零ベクトル時は最後の有効 facing を保持する。
- 対応表:

| 方向 | offset |
|---|---|
| `N` | `(0, -1)` |
| `NE` | `(1, -1)` |
| `E` | `(1, 0)` |
| `SE` | `(1, 1)` |
| `S` | `(0, 1)` |
| `SW` | `(-1, 1)` |
| `W` | `(-1, 0)` |
| `NW` | `(-1, -1)` |

- Dig / Flag / Detonate はこの offset を現在セルへ足す。

### 14.4 Facing4 判定

- `Facing4` は `packages/protocol` の enum（N=0, E=1, S=2, W=3）を使用する。クライアント側で独自定義はしない。
- `abs(vx)` と `abs(vy)` を比較し、大きい軸を採用する。
- 同値時は前回の cardinal facing を優先して jitter を防ぐ。
- 対応表:

| 方向 | offset |
|---|---|
| `N` | `(0, -1)` |
| `E` | `(1, 0)` |
| `S` | `(0, 1)` |
| `W` | `(-1, 0)` |

- `mine_remover_*` / `purify` はこの offset を `UseItemPayload.targetCoord` に入れる。

### 14.5 targetCoord 必須 item

| item | 解決方法 |
|---|---|
| `relay_point` | スロット選択後に Safe セルを盤面タップ（`targetCoord` 必須） |
| `bridge` | スロット選択後に Hole セルを盤面タップ（`targetCoord` 必須） |
| `mine_remover_*` | `targetCoord` 省略可。省略時は `facingResolver.ts` が Facing4 から前方1マスを算出して補完する |
| `purify` | `targetCoord` 省略可。省略時は `facingResolver.ts` が Facing4 から前方1マスを算出して補完する |

### 14.6 phase / UI ガード

- `GamePhase.Playing` 以外では `move/dig/flag/detonate/use_item/discard_item` を local UI で無効化する。
- `claim_reward` の UI 側送信条件:
  - Playing / Rest のどちらでも送信可能。
  - `pendingRewardOffers` に該当 `offerId` が存在すること。
  - lifeState は不問（Ghost 中でも報酬選択可能）。
  - **サーバー側実行条件**（api.md 参照）: `offerId` / `optionIndex` の有効性、提示済み候補との照合。Playing 以外の phase での実行可否はサーバー側で判定するため、クライアントは UI 側ガードのみを行う。
- target mode 中は通常の Dig/Flag/Detonate を止め、誤送信を防ぐ。

## 15. 実装ロードマップ（推奨順序）

### Phase A: 基盤と接続

1. `apps/client` 雛形、Vite/Phaser/TS 設定
2. `BootScene`, `LobbyScene`, `AppRuntime`
3. `LobbyConnectionService`, `RoomSessionService`, `reconnectController`
4. `bindGameState.ts`, selector, `privateStateStore`
5. `registerRoomEventHandlers.ts`

**完了条件**: ロビー参加、reservation 消費、GameScene 入場、切断/再接続骨格が動く。

### Phase B: コア盤面と操作

1. `BoardCoordinateMapper`, `GridLayer`, `NumberTextLayer`
2. `PlayerLayer`, `PlayerSprite`, `CameraController`
3. `KeyboardController`, `VirtualJoystick`, `ActionButtons`
4. `facingResolver`, `inputMapper`, `CommandDispatcher`
5. `CpLayer`, `visibility.ts`, `GroundItemLayer`

**完了条件**: 移動、Dig、Flag、Detonate、CP 可視化、地上ドロップ表示まで通る。

### Phase C: フィードバックと HUD

1. `PlayerHudPanel`, `ExpBar`, `ScorePanel`, `FloorInfoPanel`
2. `InventoryBar`, `RewardOfferPanel`, `TargetingOverlay`
3. `NotificationToast`, `MultiplayerNoticePanel`, `ConnectionBanner`
4. `DetonateFxLayer`, `UnmanagedExplosionFxLayer`, `ErosionFxLayer`, `ScreenFxController`
5. `AudioController`, `SfxCatalog`, `BgmController`

**完了条件**: イベント受信に対する見た目/音のフィードバックが一通り揃う。

### Phase D: フロー完成と磨き込み

1. `RestScene`, `GameOverScene`
2. reconnect 後の UI 再同期確認
3. スマホ UI 密度調整
4. 数字色/FX 強度/BGM 切替の調整
5. unit test（`visibility`, `facingResolver`, `inputMapper`, `privateStateStore`）

**完了条件**: Lobby → Game → Rest → Next Floor → Game Over の全フローが閉じる。

## 16. 並行開発チーム分け例

### 16.1 4人構成

| 担当 | 主責務 | 先行ブロッカー |
|---|---|---|
| A | module 1（基盤、接続、schema binding、reconnect） | なし |
| B | module 2 + module 3 前半（board, player render, camera） | A の selector/scene shell |
| C | module 3 後半 + module 6（input, inventory, reward, HUD） | A の dispatcher/private store |
| D | module 4 + module 5 + module 8 + module 7 後半（FX, sound, notices, game over/rest） | A の event bridge、B の座標基盤 |

### 16.2 6人構成

| レーン | 担当範囲 | 依存 |
|---|---|---|
| レーン1 | 基盤/接続/reconnect | なし |
| レーン2 | 盤面描画/カメラ | レーン1 |
| レーン3 | プレイヤー描画/入力 | レーン1,2 |
| レーン4 | HUD/インベントリ/報酬 | レーン1 |
| レーン5 | 爆発/侵食 FX | レーン1,2 |
| レーン6 | ロビー/休憩/GameOver/サウンド | レーン1,4,5 |

### 16.3 共通レビュー観点

- event 名が `api.md` と完全一致しているか
- shared schema を private store に複製していないか
- `inputMapper.ts` 以外から直接 `room.send()` していないか（HUD の `claim_reward` / `discard_item` など exception は `CommandDispatcher` 経由に統一）
- `visibility.ts` に CP 可視判定が集約されているか
- 盤面描画が SafeMine/DangerousMine の内部差を見た目で漏らしていないか

---

この順序なら、常に「接続できる → 盤面が見える → 操作できる → 演出が付く → フローが閉じる」の順で確認できる。FE 側は server authority を崩さず、`GameState` と 38イベントの受信責務を明示した状態で段階的に完成へ進められる。
