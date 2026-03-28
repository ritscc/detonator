# Detonator API 仕様書

> バージョン: 0.1.0-draft
> 最終更新: 2026-03-28
> 対象: Colyseus 0.17 / @colyseus/schema 4.x / @colyseus/sdk (クライアント)

---

## 概要

### プロトコル方針

**REST エンドポイントは存在しない。** 全通信は Colyseus ルームの WebSocket セッションを通じて行う。

- **サーバー権威のみ。** クライアント予測は採用しない。
- `docs/plans/tech-stack.md` Phase 2 に残る「クライアント予測 + サーバー調整」の記述は旧案であり、本仕様では採用しない。
- クライアントはコマンドを送信し、サーバーが状態を更新してスキーマパッチとして全クライアントへ同期する。
- 一時的なトリガー通知（爆発開始、死亡など）はスキーマ同期とは別に `client.send` / `this.broadcast` で届ける。

### 使用パッケージ

| パッケージ | バージョン | 役割 |
|---|---|---|
| `colyseus` | 0.17.x | サーバーサイドルームフレームワーク |
| `@colyseus/sdk` | 0.17.x | クライアントサイド接続 |
| `@colyseus/schema` | 4.x | 状態スキーマ定義・差分同期 |

### モノレポ共有パッケージ

| パッケージ名 | 内容 |
|---|---|
| `packages/protocol` | メッセージ型定義（コマンド・イベントの TypeScript interface） |
| `packages/schema` | `@colyseus/schema` クラス定義 |
| `packages/rules-core` | 爆発計算・侵食計算などゲームロジック |
| `packages/config` | 式係数・JSON 設定値 |

---

## Room Lifecycle

### ルーム種別

| ルーム名 | 説明 |
|---|---|
| `LobbyRoom` | 待機・マッチメイク・参加者確認・ステージ情報提示を担うロビー |
| `DetonatorRoom` | 実際のゲームプレイ処理を担うルーム |

### 接続フロー

```ts
// クライアント側
import { Client } from "@colyseus/sdk";

const client = new Client("ws://localhost:2567");

// まずロビーへ参加
const lobby = await client.joinOrCreate("LobbyRoom", {
  displayName: "PlayerA",
});

// LobbyRoom から受け取った reservation を使ってゲームルームへ移動
const game = await client.consumeSeatReservation<GameState>(reservation);

// ID 指定でゲームルームへ参加（観戦・途中参加）
const room = await client.joinById<GameState>(roomId, {
  displayName: "PlayerB",
});

// 再接続（切断後の復帰）
const room = await client.reconnect<GameState>(roomId, sessionId);
```

- クライアントはまず `LobbyRoom` に入り、待機・マッチメイク・ステージ情報確認を行う。
- ゲーム開始時、`LobbyRoom` は `DetonatorRoom` の seat reservation を配布し、各クライアントは予約席を消費してロビー → ゲームルームへ遷移する。
- 以後のリアルタイム同期は `DetonatorRoom` で行う。

### サーバー側ライフサイクルフック

```ts
class DetonatorRoom extends Room<GameState> {
  onCreate(options: RoomOptions): void { ... }
  onJoin(client: Client, options: JoinOptions): void { ... }
  onDrop(client: Client, code: number): void | allowReconnection { ... }
  onReconnect(client: Client): void { ... }
  onLeave(client: Client, code: number): void { ... }
  onDispose(): void { ... }
}
```

| フック | タイミング | 主な処理 |
|---|---|---|
| `onCreate` | ルーム作成時（最初のクライアント接続前） | `GameState` 初期化、タイマー登録、`maxClients` 設定 |
| `onJoin` | クライアント接続確立後 | `PlayerState` 追加、途中参加処理 |
| `onDrop` | クライアントが切断を検知した直後（`onLeave` より先） | `allowReconnection(client, seconds)` 呼び出し、プレイヤーを `Disconnected` 状態へ |
| `onReconnect` | `allowReconnection` 猶予内に再接続成功 | `sessionId` / `auth` / `userData` / `view` を復元、プレイヤー位置を安全マスへ補正 |
| `onLeave` | 完全退出（タイムアウトまたは意図的切断） | `PlayerState` 削除またはゴースト遷移 |
| `onDispose` | 全クライアント退出後 | タイマー解放、ログ記録 |

`LobbyRoom` も同様のライフサイクルを持ち、`onCreate` で待機状態を初期化し、`onJoin` で参加者を管理し、ゲーム開始時に `DetonatorRoom` を生成して予約席を配布する。

### 再接続

```ts
// onDrop 内
async onDrop(client: Client, code: number) {
  const reconnection = await this.allowReconnection(client, 60);
  // 猶予切れでリジェクトされた場合は onLeave が呼ばれる
}
```

- `allowReconnection` は `sessionId` / `auth` / `userData` / `view` を保持する。
- 猶予時間中、プレイヤーは `PlayerLifeState.Disconnected` として盤面に留まる。
- 再接続後、サーバーは `GameState` 全体を差分なしで送信し直す。
- 位置が危険（地雷原・穴）なら近傍安全マスへ補正する。
- 再接続猶予は 60 秒固定とする。

### ルーム設定値

```ts
// onCreate 内
this.maxClients = 10;        // ハードキャップ
this.patchRate = 1000 / 30;  // 30 Hz（約 33.3ms ごとに差分パッチ送信）
this.seatReservationTimeout = 15; // 秒（LobbyRoom -> DetonatorRoom の予約席保持時間）
```

### 途中参加ルール

- `GamePhase.Playing` 中でも参加を許可する。
- 途中参加プレイヤーはレベル 1・アイテムなし・スキルなし・インベントリ空で開始する。
- スポーン位置はランダムな生存プレイヤー周囲の非地雷マス。

---

## Client→Server Commands

コマンドは `this.onMessage(type, handler)` で受け付ける。

```ts
// サーバー側登録例
this.onMessage("move", (client, payload: MovePayload) => { ... });
```

バリデーション失敗時は `client.send("error", { code, message })` を返す。

---

### 1. `move` — 移動入力

**送信タイミング**: クライアントの入力ループごと（仮想ジョイスティック / WASD）。

**形式確定**: 正規化済みアナログベクトル `{ vx, vy }` を送信する。

```ts
// packages/protocol/src/commands.ts
export interface MovePayload {
  /** 正規化済み移動ベクトル。静止時は { vx: 0, vy: 0 } を送る。 */
  vx: number; // -1.0 ～ 1.0
  vy: number; // -1.0 ～ 1.0
}
```

| 項目 | 内容 |
|---|---|
| 送信者 | `Alive` / `Ghost` 状態のプレイヤー |
| バリデーション | `vx`, `vy` が有限数値であること。大きさが 1.0 を超える場合は正規化。 |
| 拒否ケース | `GamePhase` が `Playing` でない場合は無視。 |

**サーバー処理**: 速度合成 `base × wasteland(0.4) × dash(1.5) × (1 + skillStack)` で位置を更新し、`PlayerState.x` / `PlayerState.y` を変更する。基礎速度は 2 セル/秒。

---

### 2. `dig` — セル掘削

**送信タイミング**: プレイヤーが Dig ボタンを押したとき。

```ts
export interface DigPayload {
  /** 掘削対象セルのグリッド座標 */
  tx: number; // 整数
  ty: number; // 整数
}
```

**送信例**: `{ tx: 12, ty: 8 }`

| 項目 | 内容 |
|---|---|
| 送信者 | `PlayerLifeState.Alive` のみ |
| リーチ | Chebyshev 距離 1 以内 |
| 対象セル | `SafeMine` または `DangerousMine` のみ |
| 拒否ケース | リーチ外 / `Safe` / `Wasteland` / `Hole` / フェーズが `Playing` でない |

**サーバー処理**:
- `SafeMine` の場合: `Safe` に変換、flood-fill で隣接ゼロ領域を連鎖開放、各セルで独立に EXP 付与 + アイテムドロップ抽選を行う。EXP は連鎖開放分を含めて起点となった掘削者のみに加算する。
- `DangerousMine` の場合: 管理外爆発パイプラインを起動する。

**エラーコード**:

| コード | 説明 |
|---|---|
| `DIG_OUT_OF_RANGE` | リーチ外 |
| `DIG_INVALID_TARGET` | 対象セルが掘削不可 |
| `DIG_NOT_ALIVE` | 送信者が生存状態でない |

---

### 3. `flag` — 旗設置／撤去

**送信タイミング**: プレイヤーが Flag ボタンを押したとき。

```ts
export interface FlagPayload {
  /** 対象セルのグリッド座標 */
  tx: number;
  ty: number;
}
```

**送信例**: `{ tx: 5, ty: 3 }`

| 項目 | 内容 |
|---|---|
| 送信者 | `PlayerLifeState.Alive` のみ |
| リーチ | Chebyshev 距離 1 以内 |
| 対象セル | `SafeMine` または `DangerousMine` のみ |
| 動作 | 旗がなければ設置、あれば撤去（トグル） |
| 拒否ケース | リーチ外 / 掘削不可セル / フェーズが `Playing` でない |

**エラーコード**:

| コード | 説明 |
|---|---|
| `FLAG_OUT_OF_RANGE` | リーチ外 |
| `FLAG_INVALID_TARGET` | 対象セルが旗設置不可 |
| `FLAG_NOT_ALIVE` | 送信者が生存状態でない |

---

### 4. `detonate` — 点火（管理爆発開始）

**送信タイミング**: プレイヤーが Detonate ボタンを押したとき。

```ts
export interface DetonatePayload {
  /** 点火ノードのグリッド座標（旗付き地雷 or Relay Point） */
  tx: number;
  ty: number;
}
```

**送信例**: `{ tx: 7, ty: 4 }`

| 項目 | 内容 |
|---|---|
| 送信者 | `PlayerLifeState.Alive` のみ |
| 対象 | 旗付き地雷セル、または Relay Point が設置されたセル |
| CT チェック | 通常: CT が 0 以下であること。Force Ignition アイテム使用時は CT 無視。 |
| 拒否ケース | CT 残あり（Force Ignition なし） / 対象が点火不可 / フェーズが `Playing` でない |

**サーバー処理**:
1. `detonate_preview` イベントと `detonate_fuse_scheduled` イベントを即座にブロードキャストする（provisional MST 含む）。
2. イベントキューに `{ type: "detonate_resolve", sourceCoord, scheduledAt: now + 3000 }` を登録する。
3. 3.0 秒後: 爆発時点スナップショットで Rooted Prim-MST を再計算し、BFS で連鎖を適用する。
4. Rooted Prim-MST の候補選択が同値になった場合は、距離 → ノード ID → Y 座標の順で決定的にタイブレークする。

**エラーコード**:

| コード | 説明 |
|---|---|
| `DETONATE_COOLDOWN` | CT 残あり |
| `DETONATE_INVALID_TARGET` | 点火不可なノード |
| `DETONATE_NOT_ALIVE` | 送信者が生存状態でない |

---

### 5. `useItem` — アイテム使用

**送信タイミング**: プレイヤーがインベントリスロットを操作したとき。

```ts
export interface UseItemPayload {
  /** インベントリスロット番号 (0-indexed) */
  slotIndex: number;

  /** アイテムが対象座標を必要とする場合に指定 */
  targetCoord?: { tx: number; ty: number };
}
```

**送信例（relay_point 設置）**: `{ slotIndex: 0, targetCoord: { tx: 10, ty: 6 } }`
**送信例（dash 使用）**: `{ slotIndex: 2 }`

| 項目 | 内容 |
|---|---|
| 送信者 | `PlayerLifeState.Alive` のみ（自動発動アイテムはコマンド不要） |
| バリデーション | `slotIndex` が有効範囲内かつスロットにアイテムが存在すること |
| 対象座標必須 | `relay_point`（Safe セル座標必須）、`bridge`（Hole セル座標必須） |
| 対象座標省略可 | `mine_remover_*`（省略時は Facing から 4 方向補正して算出） |
| 拒否ケース | スロット空 / 使用条件未達 / フェーズが `Playing` でない |

**アイテム別サーバー処理概要**:

| アイテム ID | 効果 |
|---|---|
| `relay_point` | 指定 Safe セルに Relay Point を設置。MST 中継ノードになる。 |
| `dash` | 送信者に 15 秒間ダッシュバフ（速度 1.5 倍）を付与する。 |
| `force_ignition` | 送信者の次回 `detonate` コマンドの CT を無視するフラグを付与する。 |
| `mine_remover_cheap` | Facing 4 方向補正後の前方地雷原を Safe 化する（安価版）。 |
| `mine_remover_normal` | Facing 4 方向補正後の前方地雷原を Safe 化する（通常版）。 |
| `mine_remover_high` | Facing 4 方向補正後の前方地雷原を Safe 化する（高価版）。 |
| `cats_eye` | 全 CP 座標をチーム全員に一時公開する。座標自体は共有スキーマに存在し、この効果中はクライアントが距離条件を無視して描画する。効果時間は式駆動の設定値に従う。 |
| `evacuation` | 送信者を現在のリスポーン地点へ瞬間移動させる。 |
| `take_a_breath` | 侵食を短時間停止する。 |
| `short_break` | 侵食を長時間停止する。 |
| `bridge` | 指定 Hole セルを Safe 化する（後の侵食で再び地雷化されうる）。 |
| `disposable_life` | 送信者に一時的な死亡回避バフを付与する。優先消費順位: 1 位。 |

**エラーコード**:

| コード | 説明 |
|---|---|
| `USE_ITEM_EMPTY_SLOT` | スロットが空 |
| `USE_ITEM_INVALID_TARGET` | 対象座標が無効 |
| `USE_ITEM_CONDITION_NOT_MET` | 使用条件未達（例: 対象が Safe でない） |
| `USE_ITEM_NOT_ALIVE` | 送信者が生存状態でない |

---

### 6. `discardItem` — アイテム破棄

**送信タイミング**: プレイヤーがインベントリの × ボタンを押したとき。

```ts
export interface DiscardItemPayload {
  /** 破棄するインベントリスロット番号 (0-indexed) */
  slotIndex: number;
}
```

**送信例**: `{ slotIndex: 1 }`

| 項目 | 内容 |
|---|---|
| 送信者 | 全生存プレイヤー |
| バリデーション | `slotIndex` が有効範囲内かつスロットにアイテムが存在すること |
| 拒否ケース | スロット空 |

**サーバー処理**: 対象スロットのアイテムをプレイヤー現在位置へ `GroundItemState` としてドロップし、他プレイヤーも通常の地上ドロップと同様に拾得できる。

**エラーコード**:

| コード | 説明 |
|---|---|
| `DISCARD_EMPTY_SLOT` | スロットが空 |

---

### 7. `claimReward` — レベルアップ報酬選択

**送信タイミング**: プレイヤーが画面上の報酬ボタンをタップしたとき。フロア中いつでも受け付ける。

```ts
export interface ClaimRewardPayload {
  /**
   * 提示された報酬候補のインデックス (0-indexed)。
   * 候補は Private State として届けられる RewardOfferEvent.options の添字。
   */
  offerId: string;    // RewardOfferEvent.offerId と照合する UUID
  optionIndex: number;
}
```

**送信例**: `{ offerId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", optionIndex: 0 }`

| 項目 | 内容 |
|---|---|
| 送信者 | 未受取の報酬オファーを持つプレイヤー |
| バリデーション | `offerId` が保留中のオファーと一致し、`optionIndex` が有効範囲内であること |
| 候補フィルタリング | 満杯・スタック上限到達で無効な候補は提示から除外される |
| 拒否ケース | 保留報酬なし / 無効 `offerId` / 無効インデックス |

**補足**: 報酬オファーはレベルアップ時に即生成し、未受取オファーとして保持する。`claimReward` は保留済みオファーに対する選択確定のみを担当する。

**エラーコード**:

| コード | 説明 |
|---|---|
| `CLAIM_NO_PENDING_REWARD` | 保留報酬がない |
| `CLAIM_INVALID_OFFER_ID` | `offerId` が一致しない |
| `CLAIM_INVALID_OPTION` | インデックスが無効または候補が無効 |

---

### 8. `ready` — 予約済み（MVP では未使用）

**送信タイミング**: 現行仕様では使用しない。休憩フェーズ終了は ready ボタンではなく、全プレイヤーが各自の初期スポーン地点へ移動した時点で自動的に発生する。

```ts
export interface ReadyPayload {
  // 将来拡張用。現行仕様では未使用。
}
```

| 項目 | 内容 |
|---|---|
| 送信者 | 将来拡張用の予約コマンドのため、現行仕様では送信しない |
| フェーズ制限 | なし（サーバー側では実運用しない） |
| 補足 | 次フロア遷移条件は「全員が初期スポーン地点に到達したこと」であり、ready 入力ではない |

---

## Server→Client Events

スコープ表記:

| 表記 | 説明 |
|---|---|
| **ルーム全体** | `this.broadcast(type, payload)` — 全クライアントへ送信 |
| **チーム** | 現時点では全員が 1 チームのため、ルーム全体と同義 |
| **プライベート** | `client.send(type, payload)` — 特定クライアントのみへ送信 |

---

### 1. プレイヤー存在イベント

#### `player_joined`

```ts
export interface PlayerJoinedEvent {
  sessionId: string;
  displayName: string;
  isMidGame: boolean; // 途中参加フラグ
}
```

スコープ: **ルーム全体**
トリガー: `onJoin` 完了時

---

#### `player_left`

```ts
export interface PlayerLeftEvent {
  sessionId: string;
  reason: "voluntary" | "timeout";
}
```

スコープ: **ルーム全体**
トリガー: `onLeave` 完了時

---

#### `player_disconnected`

```ts
export interface PlayerDisconnectedEvent {
  sessionId: string;
  reconnectDeadline: number; // UNIX ミリ秒タイムスタンプ
}
```

スコープ: **ルーム全体**
トリガー: `onDrop` で `allowReconnection` を呼んだ直後

---

#### `player_reconnected`

```ts
export interface PlayerReconnectedEvent {
  sessionId: string;
}
```

スコープ: **ルーム全体**
トリガー: `onReconnect` 完了時

---

### 2. Detonate（管理爆発）イベント

#### `detonate_preview`

点火コマンド受付後、provisional MST をクライアントに渡すためのイベント。fuse 中に旗が変化すると実際の爆発経路と異なる場合がある。クライアントは「provisional（予測）」として表示してよい。

```ts
export interface DetonatePreviewEvent {
  sourceCoord: GridCoord;
  provisionalPath: GridCoord[]; // provisional MST の伝播順（BFS 順）
  fuseEndsAt: number;           // UNIX ミリ秒タイムスタンプ
}
```

スコープ: **ルーム全体**
トリガー: `detonate` コマンド受付時

---

#### `detonate_fuse_scheduled`

fuse イベントがキューに登録されたことを通知する。`detonate_preview` と同時に送信する。

```ts
export interface DetonateFuseScheduledEvent {
  sourceCoord: GridCoord;
  fuseEndsAt: number; // UNIX ミリ秒タイムスタンプ
  initiatorSessionId: string;
}
```

スコープ: **ルーム全体**
トリガー: `detonate` コマンド受付時

---

#### `detonate_fuse_canceled`

保留中の fuse がキャンセルされたことを通知する。

```ts
export interface DetonateFuseCanceledEvent {
  sourceCoord: GridCoord;
  reason: "source_removed" | "mine_removed" | "flag_removed" | "floor_cleared";
}
```

スコープ: **ルーム全体**
トリガー: 起爆源消失 / 旗除去 / 地雷除去機による除去 / フロアクリア時

---

#### `detonate_chain_step`

管理爆発の連鎖が 1 セル処理されるたびに送信する。

```ts
export interface DetonateChainStepEvent {
  sourceCoord: GridCoord;     // 元の点火源座標
  coord: GridCoord;           // 今回処理されたセル
  cellTypeBefore: CellType;
  wasRelayPoint: boolean;
  remainingPath: GridCoord[]; // 残りの予定経路（再計算後）
}
```

スコープ: **ルーム全体**
トリガー: 1/8 秒（125ms）ごとの各セル処理時

---

#### `detonate_resolved`

管理爆発の連鎖が全て完了したことを通知する。

```ts
export interface DetonateResolvedEvent {
  sourceCoord: GridCoord;
  processedCells: GridCoord[];
  safeMineCellsConverted: number;
  dangerousMineCellsConverted: number;
}
```

スコープ: **ルーム全体**
トリガー: MST 上の全ノード処理完了時

---

### 3. 管理外爆発イベント

#### `unmanaged_explosion_triggered`

`DangerousMine` の誤掘りで管理外爆発が発生したことを通知する。

```ts
export interface UnmanagedExplosionTriggeredEvent {
  epicenterCoord: GridCoord;
  triggerSessionId: string;        // 誤掘りしたプレイヤーの sessionId
  blastCoords: GridCoord[];        // 衝撃波範囲（Chebyshev 1、中心含む最大 9 マス）
  wastelandCoords: GridCoord[];    // 荒地化範囲（Manhattan 2）
}
```

スコープ: **ルーム全体**
トリガー: `DangerousMine` の `dig` 処理時

---

#### `unmanaged_chain_step`

管理外爆発の連鎖が 1 セル進んだことを通知する。

```ts
export interface UnmanagedChainStepEvent {
  epicenterCoord: GridCoord;    // 連鎖元（この爆発の震源）
  coord: GridCoord;             // 今回連鎖した DangerousMine の座標
  chainDepth: number;           // 連鎖の深さ（最初の爆発が 0）
  blastCoords: GridCoord[];     // この爆発による衝撃波範囲
  wastelandCoords: GridCoord[]; // この爆発による荒地化範囲
}
```

スコープ: **ルーム全体**
トリガー: 1/8 秒（125ms）ごとの各連鎖セル処理時

---

#### `unmanaged_explosion_resolved`

管理外爆発の連鎖が全て終了したことを通知する。

```ts
export interface UnmanagedExplosionResolvedEvent {
  originCoord: GridCoord;
  totalChainsTriggered: number;
}
```

スコープ: **ルーム全体**
トリガー: 連鎖 BFS キューが空になったとき

---

### 4. 侵食イベント

#### `erosion_warning`

次の侵食フェーズで変換されるセルを事前通知する。

```ts
export interface ErosionWarningEvent {
  targetCoords: GridCoord[]; // 次フェーズで地雷化されるセル群
  warningEndsAt: number;     // 変換実行予定時刻（UNIX ミリ秒）
}
```

スコープ: **ルーム全体**
トリガー: 侵食フェーズのインターバルで警告時刻到達時

---

#### `erosion_warning_canceled`

保留中の侵食警告がキャンセルされたことを通知する。

```ts
export interface ErosionWarningCanceledEvent {
  canceledCoords: GridCoord[];
  reason: "take_a_breath" | "short_break" | "floor_cleared";
}
```

スコープ: **ルーム全体**
トリガー: 侵食停止アイテム使用時 / フロアクリア時

---

#### `erosion_applied`

侵食変換が実行されたことを通知する。`SafeMine:DangerousMine` 比は式駆動（`packages/config` の JSON 設定）で決まり、対象セル群へその比率でランダム配置する。

```ts
export interface ErosionAppliedEvent {
  convertedSafeMineCoords: GridCoord[];
  convertedDangerousMineCoords: GridCoord[];
  /** 隣接数字が更新されたセル（adjacentMineCount 再計算後） */
  updatedAdjacentCoords: GridCoord[];
}
```

スコープ: **ルーム全体**
トリガー: 侵食フェーズ変換実行時

---

### 5. チェックポイント（CP）イベント

CP 座標は `GameState.checkpoints` として全クライアントへ常時共有される。協力ゲームのためサーバー側フィルタリングは行わない。通常時の表示・非表示はクライアントが自プレイヤーとの距離で描画制御し、`cats_eye` 使用中はその距離条件を一時的に無効化して全 CP を表示する。

---

#### `cp_collected`

プレイヤーが CP を回収したことを通知する。

```ts
export interface CpCollectedEvent {
  cpId: string;
  coord: GridCoord;
  collectorSessionId: string;
  remainingCount: number; // 未回収 CP 残数
}
```

スコープ: **ルーム全体**
トリガー: プレイヤーが CP 座標に到達した瞬間（サーバー処理順で先着 1 名のみ）

---

### 6. EXP / レベルアップ / 報酬イベント

#### `exp_gained`

EXP を獲得したことをプレイヤーに通知する。

```ts
export interface ExpGainedEvent {
  sessionId: string;
  amount: number;
  comboMultiplier: number; // 1.0 = コンボなし
  source: "dig" | "detonate_combo";
  totalExp: number;        // 獲得後の累積 EXP
}
```

スコープ: **プライベート**（当該プレイヤーのみ）
トリガー: SafeMine dig 完了時 / flood-fill 各セル完了時

flood-fill 連鎖開放で追加発生した EXP も、起点となった掘削者 1 名のみに加算する。

---

#### `level_up`

プレイヤーがレベルアップしたことを通知する。

```ts
export interface LevelUpEvent {
  sessionId: string;
  newLevel: number;
  pendingRewardCount: number; // 現在未受取の報酬数（累積）
}
```

スコープ: **ルーム全体**（告知） + **プライベート**（報酬詳細は `reward_offer` イベントで別送）
トリガー: 累積 EXP が閾値を超えたとき

---

#### `reward_offer`

報酬の選択肢をプレイヤーに提示する。

```ts
export interface RewardOfferEvent {
  offerId: string; // claimReward の照合用 UUID
  options: RewardOption[];
}

export interface RewardOption {
  optionIndex: number;
  type: "skill" | "item";
  skillType?: SkillType;
  itemType?: ItemType;
  /** スキルの場合: ランダム決定された効果量 */
  effectValue?: number;
  /** アイテムの場合: スタック数 */
  stackCount?: number;
}
```

スコープ: **プライベート**
トリガー: `level_up` 処理完了直後（その時点でオファーを生成し、保留状態に積む）

---

### 7. アイテム / インベントリイベント

#### `item_dropped`

地上にアイテムドロップが生成されたことを通知する。

```ts
export interface ItemDroppedEvent {
  groundItemId: string;
  itemType: ItemType;
  coord: GridCoord;
  stackCount: number;
  expiresAt: number; // UNIX ミリ秒タイムスタンプ（生成後 15 秒）
}
```

スコープ: **ルーム全体**
トリガー: SafeMine dig 時のドロップ抽選成功 / `discardItem` による地面ドロップ生成時

---

#### `item_picked_up`

プレイヤーが地上ドロップを取得したことを通知する。

```ts
export interface ItemPickedUpEvent {
  groundItemId: string;
  pickerSessionId: string;
  itemType: ItemType;
  stackCount: number;
  /** スタック加算の場合は false、新規スロット使用の場合は true */
  usedNewSlot: boolean;
}
```

スコープ: **ルーム全体**
トリガー: プレイヤーがドロップ座標に重なった瞬間（自動取得）

---

#### `item_expired`

地上ドロップの寿命（15 秒）が切れたことを通知する。

```ts
export interface ItemExpiredEvent {
  groundItemId: string;
}
```

スコープ: **ルーム全体**
トリガー: `expiresAt` 時刻到達時

---

#### `item_used`

プレイヤーがアイテムを使用したことを通知する。

```ts
export interface ItemUsedEvent {
  sessionId: string;
  itemType: ItemType;
  slotIndex: number;
  targetCoord?: GridCoord;
}
```

スコープ: **ルーム全体**
トリガー: `useItem` コマンドの処理完了時

---

#### `item_auto_triggered`

自動発動アイテム（九死に一生など）が発動したことを通知する。

```ts
export interface ItemAutoTriggeredEvent {
  sessionId: string;
  itemType: ItemType; // "nine_lives"
}
```

スコープ: **ルーム全体**
トリガー: 死亡判定直前に自動発動条件を満たしたとき

---

#### `item_destroyed`

アイテムが爆発・侵食などで消滅したことを通知する。

```ts
export interface ItemDestroyedEvent {
  groundItemId: string;
  reason: "unmanaged_explosion" | "erosion";
}
```

スコープ: **ルーム全体**
トリガー: 管理外爆発荒地化範囲 / 侵食変換セル上のドロップ消滅時

---

#### `inventory_updated`

インベントリ内容が変化したことをプレイヤー本人に通知する。

```ts
export interface InventoryUpdatedEvent {
  slots: InventorySlot[];
  maxSlots: number;
}

export interface InventorySlot {
  slotIndex: number;
  itemType: ItemType | null;
  stackCount: number;
}
```

スコープ: **プライベート**
トリガー: アイテム取得 / 使用 / 破棄 / 死亡（全ロスト） / フロア開始時 / 再接続時

---

### 8. 死亡 / リスポーンイベント

#### `player_death`

プレイヤーが死亡したことを通知する。

```ts
export interface PlayerDeathEvent {
  sessionId: string;
  cause: DeathCause;
  coord: GridCoord;      // 死亡座標
  respawnAt: number;     // リスポーン予定時刻（UNIX ミリ秒）
  lostItems: ItemType[]; // ロストしたアイテムリスト
}
```

スコープ: **ルーム全体**
トリガー: 管理外爆発致死判定 / 侵食変換判定 / イベント致死判定

---

#### `death_avoided`

死亡回避アイテムが発動し、死亡が回避されたことを通知する。

優先消費順位: `disposable_life` → `nine_lives`。

```ts
export interface DeathAvoidedEvent {
  sessionId: string;
  cause: DeathCause;
  itemUsed: ItemType; // "disposable_life" | "nine_lives"
}
```

スコープ: **ルーム全体**
トリガー: 死亡判定で Disposable Life または Nine Lives が発動したとき

---

#### `player_ghost`

プレイヤーがゴースト状態に遷移したことを通知する。

```ts
export interface PlayerGhostEvent {
  sessionId: string;
  respawnAt: number; // UNIX ミリ秒タイムスタンプ
}
```

スコープ: **ルーム全体**
トリガー: `player_death` イベント送信後、ゴースト遷移完了時

ゴーストは他プレイヤーと衝突せず、AABB 判定なしですり抜ける。表示演出そのものはクライアント実装に委ねる。

---

#### `player_respawned`

プレイヤーがリスポーンしたことを通知する。

```ts
export interface PlayerRespawnedEvent {
  sessionId: string;
  spawnCoord: GridCoord;
}
```

スコープ: **ルーム全体**
トリガー: リスポーンタイマー満了後、スポーン位置確定時

---

#### `game_over`

全プレイヤーが同時に死亡し、ゲームオーバーになったことを通知する。

```ts
export interface GameOverEvent {
  finalFloor: number;
  finalScore: number;
  reason: "all_dead";
}
```

スコープ: **ルーム全体**
トリガー: 生存プレイヤー数が 0 になったとき

---

### 9. フロアイベント

#### `floor_cleared`

フロアが全 CP 回収によりクリアされたことを通知する。

```ts
export interface FloorClearedEvent {
  floorNumber: number;
  clearedAt: number;   // UNIX ミリ秒タイムスタンプ
  clearTimeMs: number; // フロア開始からのクリア時間（ミリ秒）
}
```

スコープ: **ルーム全体**
トリガー: 最後の CP が回収されたとき

---

#### `rest_phase_started`

休憩フェーズが開始されたことを通知する。

```ts
export interface RestPhaseStartedEvent {
  floorNumber: number;
}
```

スコープ: **ルーム全体**
トリガー: `floor_cleared` 処理後、遷移演出完了時

休憩フェーズは、全プレイヤーが各自の初期スポーン地点へ移動した時点で終了する。

---

#### `next_floor_started`

次のフロアが開始されたことを通知する。

```ts
export interface NextFloorStartedEvent {
  floorNumber: number;
  stageId: string;
  gridWidth: number;
  gridHeight: number;
}
```

スコープ: **ルーム全体**
トリガー: 全プレイヤーが各自の初期スポーン地点に到達した後、新フロアの状態生成完了時

---

### 10. スコアイベント

#### `score_updated`

スコアが更新されたことを通知する。

```ts
export interface ScoreUpdatedEvent {
  totalScore: number;
  floorScore: number;
  timeBonusMultiplier: number; // `stageBaseDuration / clearTimeSeconds`
}
```

スコープ: **ルーム全体**
トリガー: フロアクリア時のスコア確定後

---

#### `error`

コマンドが拒否された場合に送信者へ返す汎用エラーイベント。

```ts
export interface ErrorEvent {
  code: string;    // エラーコード文字列（例: "DIG_OUT_OF_RANGE"）
  message: string; // 人間が読める説明（デバッグ用）
}
```

スコープ: **プライベート**
トリガー: コマンドバリデーション失敗時

---

## Shared Schema (同期状態)

`@colyseus/schema` 4.x を使用する。`@type()` デコレータを付与したフィールドのみが差分同期される。トランジェントな値（入力キュー・タイマーハンドル・キャッシュ）には `@type()` を付与しない。

1 つの Schema クラスに付与できる `@type()` フィールドは最大 64 個。

---

### `GameState`（ルート状態）

```ts
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class GameState extends Schema {
  @type("string")       phase: string;         // GamePhase 文字列値
  @type("number")       floorNumber: number;   // 1〜10
  @type("string")       stageId: string;
  @type(FloorState)     floor: FloorState;
  @type(GridState)      grid: GridState;
  @type(ErosionState)   erosion: ErosionState;
  @type("number")       totalScore: number = 0;

  /** sessionId → PlayerState */
  @type({ map: PlayerState })
  players: MapSchema<PlayerState> = new MapSchema();

  /** groundItemId → GroundItemState */
  @type({ map: GroundItemState })
  groundItems: MapSchema<GroundItemState> = new MapSchema();

  /** cpId → CheckpointState */
  @type({ map: CheckpointState })
  checkpoints: MapSchema<CheckpointState> = new MapSchema();
}
```

> `MapSchema` のキーは文字列のみ。数値キーは使用不可。

---

### `PlayerState`（プレイヤーごと）

```ts
export class PlayerState extends Schema {
  @type("string")  sessionId: string;
  @type("string")  displayName: string;
  @type("number")  x: number;              // 連続座標
  @type("number")  y: number;
  @type("number")  facing: number;         // Facing8 enum 値
  @type("number")  lifeState: number;      // PlayerLifeState enum 値
  @type("number")  respawnAt: number;      // UNIX ミリ秒。生存中は 0
  @type("number")  level: number = 1;
  @type("number")  exp: number = 0;
  @type("number")  pendingRewardCount: number = 0;
  // インベントリは本人専用の Private State として管理し、@type() フィールドには含めない。
}
```

---

### `GridState`（盤面）

多次元配列は @colyseus/schema でサポートされないため、フラット配列 + width/height で表現する。

```ts
export class GridState extends Schema {
  @type("number")  width: number;
  @type("number")  height: number;

  /**
   * CellState のフラット配列。
   * インデックス: y * width + x
   */
  @type([CellState])
  cells: ArraySchema<CellState> = new ArraySchema();
}
```

---

### `CellState`（セル 1 マス）

```ts
export class CellState extends Schema {
  @type("number")  cellType: number;          // CellType enum 値
  @type("number")  adjacentMineCount: number; // 0〜8。地雷原/荒地では未使用
  @type("boolean") flagged: boolean = false;
  @type("boolean") hasRelayPoint: boolean = false;
  /**
   * 侵食警告中は true。
   * 警告は transient イベントでも通知するが、
   * スキーマに持たせることで再接続時の状態復元を保証する。
   */
  @type("boolean") erosionWarning: boolean = false;
}
```

---

### `CheckpointState`（チェックポイント 1 個）

```ts
export class CheckpointState extends Schema {
  @type("string")  cpId: string;
  @type("number")  x: number; // グリッド座標
  @type("number")  y: number;
  @type("boolean") collected: boolean = false;
  @type("string")  collectedBySessionId: string = "";
}
```

**CP の可視性**: CP 座標は `MapSchema<CheckpointState>` として全クライアントへ共有する。協力ゲームのためサーバー側で可視情報を絞り込まず、通常時はクライアントが距離に応じて描画制御し、`cats_eye` 使用中は全 CP を一時表示する。

---

### `GroundItemState`（地上ドロップ 1 個）

```ts
export class GroundItemState extends Schema {
  @type("string")  groundItemId: string;
  @type("string")  itemType: string;  // ItemType 文字列値
  @type("number")  x: number;        // グリッド座標
  @type("number")  y: number;
  @type("number")  stackCount: number = 1;
  @type("number")  expiresAt: number; // UNIX ミリ秒（生成後 15 秒）
}
```

---

### `FloorState`（現在フロアのメタ情報）

```ts
export class FloorState extends Schema {
  @type("number")  floorNumber: number;
  @type("string")  stageId: string;
  @type("string")  phase: string;          // GamePhase 文字列値
  @type("number")  floorStartedAt: number; // UNIX ミリ秒
  @type("number")  cpTotal: number;        // このフロアの CP 総数
  @type("number")  cpCollected: number;    // 回収済み CP 数
}
```

---

### `ErosionState`（侵食状態）

```ts
export class ErosionState extends Schema {
  @type("boolean") active: boolean = true;       // 停止アイテム使用中は false
  @type("number")  nextWarningAt: number;        // UNIX ミリ秒
  @type("number")  nextConversionAt: number;     // UNIX ミリ秒

  /**
   * 警告中セルの座標リスト。"x,y" 形式の文字列 ArraySchema。
   * クライアントは split(",") でパースする。
   */
  @type(["string"])
  warningCellKeys: ArraySchema<string> = new ArraySchema();
}
```

---

## Private State (プライベート状態)

以下のデータは全プレイヤーに公開せず、特定クライアントのみに届ける。

---

### 保留報酬オファー（Pending Reward Offers）

レベルアップ時に生成される報酬選択肢は、対象プレイヤーのみへ送る。

- スキーマには含めない。
- `PlayerState.pendingRewardCount` だけをスキーマに持ち、他プレイヤーに「報酬が N 個待ち」と伝える。
- 詳細は `reward_offer` イベント（プライベート）で届ける。

---

### インベントリ

インベントリ状態は `inventory_updated` イベント（プライベート）で管理する。スキーマには含めず、所有者本人のみが参照できる。

`inventory_updated` 送信タイミング:

| トリガー | 説明 |
|---|---|
| アイテム取得時 | 拾得処理完了後 |
| アイテム使用後 | `useItem` 処理完了後 |
| アイテム破棄後 | `discardItem` 処理完了後 |
| 死亡時（全ロスト） | `player_death` イベントと同時 |
| フロア開始時 | `next_floor_started` イベントと同時（持ち越しアイテム確認用） |
| 再接続時 | `onReconnect` 完了後（状態復元） |

---

## Timers and Event Queue

タイマーは全てサーバー側の絶対 UNIX ミリ秒タイムスタンプで管理する。クライアントへもこの値を送信し、クライアントはローカル時刻との差分でカウントダウン表示する。

---

### Detonate fuse（3.0 秒）

```ts
// イベントキューエントリ（スキーマ外、サーバー内部データ）
interface DetonateFuseEntry {
  type: "detonate_resolve";
  sourceCoord: GridCoord;
  initiatorSessionId: string;
  scheduledAt: number; // UNIX ミリ秒（コマンド受信時刻 + 3000）
}
```

- `detonate` コマンド受信時にキューへ登録する。
- サーバーのゲームループ（各 tick）でキューを走査し、`scheduledAt <= now` のエントリをバッチで取り出す。
- 同 tick に複数エントリがある場合、順不同で逐次処理する。各爆発後に盤面を再計算し、後続エントリへ反映する。
- キャンセル条件: 起爆源消失 / 旗除去 / 地雷除去機による除去 / フロアクリア。

---

### 管理外爆発連鎖（1/8 秒/セル）

```ts
interface UnmanagedChainEntry {
  type: "unmanaged_chain";
  coord: GridCoord;
  scheduledAt: number; // 前のセル処理時刻 + 125ms
  chainDepth: number;
}
```

- BFS キューに追加する際、`scheduledAt = prevProcessedAt + 125` とする。
- フロアクリア時に全キューをフラッシュする。

---

### 侵食タイマー

```ts
interface ErosionPhaseEntry {
  type: "erosion_warn" | "erosion_convert";
  scheduledAt: number;
}
```

- 侵食インターバルは式駆動。具体式は `packages/config` の JSON で管理する。
- 警告時間のベースは 3 秒（式で短縮される）。
- `erosion_warn` 到達時: 対象セル計算 + `erosion_warning` イベント送信 + `ErosionState.warningCellKeys` 更新。
- `erosion_convert` 到達時: `SafeMine:DangerousMine` 比を式から算出し、その比率でランダム配置しつつ変換実行 + `erosion_applied` イベント送信 + 次フェーズの `erosion_warn` をキューに追加。
- 停止アイテム使用時: `ErosionState.active = false`、キュー内の `erosion_*` エントリを一時停止。

---

### 地上ドロップ寿命（15 秒）

```ts
interface ItemExpiryEntry {
  type: "item_expiry";
  groundItemId: string;
  scheduledAt: number; // 生成時刻 + 15000
}
```

- `scheduledAt` 到達時: `GroundItemState` を `groundItems` MapSchema から削除し、`item_expired` をブロードキャストする。

---

### リスポーンタイマー（ベース 40 秒）

```ts
interface RespawnEntry {
  type: "respawn";
  sessionId: string;
  scheduledAt: number; // 死亡時刻 + respawnDelay（式補正後）
}
```

- 蘇生短縮アイテムを使用した場合: 対応する `RespawnEntry` の `scheduledAt` を更新する。
- 全死亡プレイヤーへ均等に適用する。
- フロアクリア時: 全員即リスポーン（タイマー無視）。

---

## 共有型定義 (Shared Types)

`packages/protocol/src/types.ts` に定義する。

### Enum 定義

```ts
// セル種別
export enum CellType {
  Safe           = 0,
  SafeMine       = 1,
  DangerousMine  = 2,
  Wasteland      = 3,
  Hole           = 4,
}

// ゲームフェーズ
export enum GamePhase {
  Playing               = 0,
  FloorClearTransition  = 1,
  Rest                  = 2,
  GameOver              = 3,
}

// プレイヤー生存状態
export enum PlayerLifeState {
  Alive         = 0,
  Ghost         = 1,
  Disconnected  = 2,
}

// 向き（8 方向）
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

// 死亡原因
export enum DeathCause {
  UnmanagedExplosion = 0,
  Erosion            = 1,
  Event              = 2, // 将来のランダムイベント用（MVP では未使用）
}

// アイテム種別（現行 GDD 記載分で確定）
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
  // TODO(confirm): 「荒地を安全化するアイテム」の正式名称・ID が未確定
}

// スキル種別
// Chord は確定。その他スキルは後日定義する。
export enum SkillType {
  Chord = "chord", // 和音（レアスキル。1ランにつき取得は 1 回、取得後は常時有効）
  // TODO(confirm): その他スキル一覧は未確定
}
```

---

### Interface 定義

```ts
// 連続座標（プレイヤー位置など）
export interface Vec2 {
  x: number;
  y: number;
}

// グリッド座標（整数、セル指定）
export interface GridCoord {
  x: number;
  y: number;
}

// ルーム作成・参加オプション（joinOrCreate / joinById の第 2 引数）
export interface RoomOptions {
  displayName: string;
}

// onJoin の第 2 引数（サーバー側）
export interface JoinOptions {
  displayName: string;
}

// インベントリスロット
export interface InventorySlot {
  slotIndex: number;
  itemType: ItemType | null;
  stackCount: number;
}

// 報酬選択肢の 1 候補
export interface RewardOption {
  optionIndex: number;
  type: "skill" | "item";
  skillType?: SkillType;
  itemType?: ItemType;
  effectValue?: number;  // スキルのランダム効果量
  stackCount?: number;   // アイテムのスタック数
}
```

---

### コマンドペイロード 型エクスポート

```ts
// packages/protocol/src/commands.ts
export type {
  MovePayload,
  DigPayload,
  FlagPayload,
  DetonatePayload,
  UseItemPayload,
  DiscardItemPayload,
  ClaimRewardPayload,
  ReadyPayload,
};
```

---

### イベントペイロード 型エクスポート

```ts
// packages/protocol/src/events.ts
export type {
  PlayerJoinedEvent,
  PlayerLeftEvent,
  PlayerDisconnectedEvent,
  PlayerReconnectedEvent,
  DetonatePreviewEvent,
  DetonateFuseScheduledEvent,
  DetonateFuseCanceledEvent,
  DetonateChainStepEvent,
  DetonateResolvedEvent,
  UnmanagedExplosionTriggeredEvent,
  UnmanagedChainStepEvent,
  UnmanagedExplosionResolvedEvent,
  ErosionWarningEvent,
  ErosionWarningCanceledEvent,
  ErosionAppliedEvent,
  CpCollectedEvent,
  ExpGainedEvent,
  LevelUpEvent,
  RewardOfferEvent,
  ItemDroppedEvent,
  ItemPickedUpEvent,
  ItemExpiredEvent,
  ItemUsedEvent,
  ItemAutoTriggeredEvent,
  ItemDestroyedEvent,
  InventoryUpdatedEvent,
  PlayerDeathEvent,
  DeathAvoidedEvent,
  PlayerGhostEvent,
  PlayerRespawnedEvent,
  GameOverEvent,
  FloorClearedEvent,
  RestPhaseStartedEvent,
  NextFloorStartedEvent,
  ScoreUpdatedEvent,
  ErrorEvent,
};
```

---

## Ambiguities / TODO(confirm)

インタビューで確認した 20 件の `TODO(confirm)` は解消済みで、本文中の confirm 用 HTML コメントも全て削除済み。以下は confirm 完了後も残る別件の保留事項のみを記載する。

| 項目 | 本文の該当箇所 | 現在の状態 |
|---|---|---|
| ItemType の追加候補の命名 | 共有型定義 | 「荒地を安全化するアイテム」の正式名称・ID は未確定。既存 `ItemType` 列挙子自体は現行 GDD 記載分で確定済み。 |
| SkillType の残りカタログ | 共有型定義 | `Chord` は確定済み。その他スキル一覧は後日定義。 |
