# Detonator API 仕様書

> バージョン: 0.1.0-draft
> 最終更新: 2026-04-02
> 対象: Colyseus 0.17 / @colyseus/schema 4.x / @colyseus/sdk (クライアント)

## 目次

- [概要](#概要)
- [Room Lifecycle](#room-lifecycle)
- [Client→Server Commands](#clientserver-commands)
  - [1. move](#1-move--移動入力)
  - [2. dig](#2-dig--セル掘削)
  - [3. flag](#3-flag--旗設置撤去)
  - [4. detonate](#4-detonate--点火管理爆発開始)
  - [5. use_item](#5-use_item--アイテム使用)
  - [6. discard_item](#6-discard_item--アイテム破棄)
  - [7. claim_reward](#7-claim_reward--レベルアップ報酬選択)
- [Server→Client Events](#serverclient-events)
  - [1. 汎用 / エラーイベント](#1-汎用--エラーイベント)
  - [2. プレイヤー存在イベント](#2-プレイヤー存在イベント)
  - [3. Detonate（管理爆発）イベント](#3-detonate管理爆発イベント)
  - [4. 管理外爆発イベント](#4-管理外爆発イベント)
  - [5. 侵食イベント](#5-侵食イベント)
  - [6. チェックポイント（CP）イベント](#6-チェックポイントcpイベント)
  - [7. EXP / レベルアップ / 報酬イベント](#7-exp--レベルアップ--報酬イベント)
  - [8. アイテム / インベントリイベント](#8-アイテム--インベントリイベント)
  - [9. 死亡 / リスポーンイベント](#9-死亡--リスポーンイベント)
  - [10. フロアイベント](#10-フロアイベント)
  - [11. スコアイベント](#11-スコアイベント)
- [Shared Schema (同期状態)](#shared-schema-同期状態)
- [Private State (プライベート状態)](#private-state-プライベート状態)
- [Timers and Event Queue](#timers-and-event-queue)
- [共有型定義 (Shared Types)](#共有型定義-shared-types)
- [Ambiguities / TODO(confirm)](#ambiguities--todoconfirm)

---

## 概要

### プロトコル方針

**REST エンドポイントは存在しない。** 全通信は Colyseus ルームの WebSocket セッションを通じて行う。

- **サーバー権威のみ。** クライアント予測は採用しない。
- `docs/plans/tech-stack.md` Phase 2 に残る「クライアント予測 + サーバー調整」の記述は旧案であり、本仕様では採用しない。
- クライアントはコマンドを送信し、サーバーが状態を更新してスキーマパッチとして全クライアントへ同期する。
- 一時的なトリガー通知（爆発開始、死亡など）はスキーマ同期とは別に `client.send` / `this.broadcast` で届ける。
- 同 tick 内に複数入力や複数保留イベントがある場合、**処理順は順不同（実装依存）** とする。必要ならテスト時のみ seed 固定で再現性を担保する。
- チャット / Ping / マーキング等のコミュニケーション機能は **MVP では実装しない**。

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

### MVP 範囲外だが枠組みを残すもの

- ランダムイベントの**具体実装は 0 種**とする。
- ただし将来拡張のため、イベント定義は JSON で管理できる前提を維持する。
- 将来イベントは「発生条件」「警告有無」「対抗手段」を JSON で持ち、**同時発生上限は 1** とする。

### 用語定義

| 用語 | 定義 |
|---|---|
| CT (Charge Time) | 点火のコストタイム。**ベース 10 秒**で、人数・スキルにより式駆動で変動する。 |
| MST (Minimum Spanning Tree) | 最小全域木。Detonate の連鎖経路決定に使用する。 |
| BFS (Breadth-First Search) | 幅優先探索。管理外爆発の連鎖に使用する。 |
| AABB (Axis-Aligned Bounding Box) | 軸並行バウンディングボックス。生存プレイヤー同士の衝突判定に使用する。 |
| Fuse | 導火線。点火から爆発評価までの待機時間。**3.0 秒**。 |
| Frontline | 侵食の起点候補。地雷原または荒地マスが周囲八マス以内に存在する安全マス群。 |

### 主要パラメータ初期値（実装中調整予定）

以下は実装時の初期値。最終値は `packages/config` の JSON で管理し、実装中に調整する。

| パラメータ | 初期値 | 備考 |
|---|---|---|
| 盤面サイズ | `f(playerCount)` | 人数連動。最小 20×20、最大 40×40 を想定 |
| 初期安全ゾーン | 5×5 | 中心に配置 |
| SafeMine:DangerousMine 比率 | 3:1 | SafeMine 75%、DangerousMine 25% |
| 地雷密度 | 20% | 全マスに対する地雷原マスの割合 |
| 侵食インターバル（初期） | 10 秒 | フロア数・ステージ特性・スキル・アイテムで式駆動変動 |
| 侵食力（初期） | 3 マス/回 | フロア経過で増加 |
| 侵食 SafeMine:DangerousMine 比率 | 7:3 | 侵食変換時の比率 |
| 侵食警告時間 | 3 秒（固定） | インターバル ≥ 4秒なら 3秒固定、< 4秒なら インターバル × 3/4 |
| レベルアップ必要EXP（初期） | 100 | 指数増加（×1.3/レベル） |
| リスポーン時間（ベース） | 40 秒 | 人数・スキルで変動 |
| CT（ベース） | 10 秒 | 人数・スキルで変動 |
| ドロップ率（ベース） | 10% | 式補正あり |
| 蘇生短縮ドロップ比率 | 90% | 死亡者いる場合 |
| CP 検知半径 | 3 マス | Euclidean 判定 |
| コンボ倍率（初期） | ×1.0 | detonate チェーン 1 回あたり +0.1x |
| スコア係数 | 600 / クリアタイム(秒) | 最小値 1.0、四捨五入 |
| 基礎移動速度 | 2 セル/秒 | Wasteland 上は ×0.4 |
| Dash 効果 | 15 秒間 ×1.5 速度 | |
| Fuse | 3.0 秒 | detonate 爆発までの待機 |
| 連鎖速度 | 1/8 秒 (125ms) | detonate / 管理外共通 |
| アイテム寿命 | 15 秒 | 地上ドロップ |
| 再接続猶予 | 60 秒 | |
| patchRate | 30 Hz | |
| 最大プレイヤー数 | 10 | |
| インベントリベース枠 | 3 | 最大 10（スキル拡張） |

> 上記は開発開始時の初期値であり、プレイテストに基づいて随時調整する。

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
  onDrop(client: Client, code: number): void | Promise<void> { ... }
  onReconnect(client: Client): void { ... }
  onLeave(client: Client, code: number): void { ... }
  onDispose(): void { ... }
}
```

| フック | タイミング | 主な処理 |
|---|---|---|
| `onCreate` | ルーム作成時（最初のクライアント接続前） | `GameState` 初期化、タイマー登録、`maxClients` 設定 |
| `onJoin` | クライアント接続確立後 | `PlayerState` 追加、途中参加処理 |
| `onDrop` | クライアント切断検知直後（`onLeave` より先） | `allowReconnection(client, seconds)` 呼び出し、プレイヤーを `Disconnected` 状態へ |
| `onReconnect` | `allowReconnection` 猶予内に再接続成功 | `sessionId` / `auth` / `userData` / `view` を復元、危険位置なら安全マスへ補正 |
| `onLeave` | 完全退出（タイムアウトまたは意図的切断） | `PlayerState` 削除または離脱状態確定 |
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
- 再接続猶予は **60 秒固定** とする。

### ルーム設定値

```ts
// onCreate 内
this.maxClients = 10;        // ハードキャップ
this.patchRate = 1000 / 30;  // 30 Hz（約 33.3ms ごとに差分パッチ送信）
this.seatReservationTimeout = 15; // 秒（LobbyRoom -> DetonatorRoom の予約席保持時間）
```

### フロア生成と初期配置

- 初期安全ゾーンは **5x5** を基準とし、式で拡縮可能とする。
- 初期安全ゾーン内には **地雷を生成しない**。
- 初期安全ゾーン内には **CP を生成しない**。
- 初期スポーンは単一点ではなく **複数スポーン群** を採用する（例: `2+3` のような群分け）。
- ステージは盤面サイズ・地雷比率・CP 数などのベース値を持ち、生成順は **ステージベース値 → 人数補正** とする。
- MVP では各フロアに 1 つの固定ステージを対応付ける。アーキテクチャ上は将来、フロアごとのステージプールから選出可能とする。
- CP は候補座標群から生成し、Hole 座標は候補から除外する。詳細は [Shared Schema > `CheckpointState`](#checkpointstateチェックポイント-1-個) を参照。

### 途中参加ルール

- `GamePhase.Playing` 中でも参加を許可する。
- 途中参加プレイヤーは **レベル 1・アイテムなし・スキルなし・インベントリ空** で開始する。
- スポーン位置は**ランダムな生存プレイヤー周囲の非地雷マス**を起点に決める。
- 起点候補が危険なら近傍安全マスを再探索する。
- 近傍に安全マスがない場合は**荒地リスポーンを許容**する。

### ゲーム開始条件

- MVP では **ホスト（最初の参加者）の明示的開始操作** でゲームを開始する。
- 最小参加人数の制約は設けない（1 人でも開始可能）。
- `LobbyRoom` はゲーム開始時に `DetonatorRoom` の seat reservation を生成し、各参加クライアントに配布する。

### クリア遷移ルール

フロアクリア後のサーバー処理順は以下で固定する。

1. 全 CP 回収で即時クリア
2. 各種タイマー停止
3. 地雷原消滅（安全化）
4. 保留イベント（fuse 中点火・侵食など）キャンセル
5. 全員復活

   > 注: `PlayerLifeState.Disconnected` のプレイヤーは復活の対象に含めない。再接続猶予内に復帰した場合は、復帰時の盤面状態に応じて通常リスポーン位置へ配置される。

6. 全員を各自の初期スポーン位置へ移動
7. 休憩フェーズ開始
8. 全員が初期スポーン位置へ到達したら次フロア開始

詳細なイベント通知は [Server→Client Events > 10. フロアイベント](#10-フロアイベント) を参照。

---

## Client→Server Commands

コマンドは `this.onMessage(type, handler)` で受け付ける。命名はすべて **snake_case** に統一する。

```ts
// サーバー側登録例
this.onMessage("move", (client, payload: MovePayload) => { ... });
this.onMessage("use_item", (client, payload: UseItemPayload) => { ... });
```

バリデーション失敗時は `client.send("error", { code, message })` を返す。

---

### 1. move — 移動入力

**送信タイミング**: クライアントの入力ループごと（仮想ジョイスティック / WASD）。

**形式確定**: 正規化済みアナログベクトル `{ vx, vy }` を送信する。

```ts
// packages/protocol/src/commands.ts
export interface MovePayload {
  /** 正規化済み X 方向移動ベクトル。静止時は 0。 */
  vx: number;

  /** 正規化済み Y 方向移動ベクトル。静止時は 0。 */
  vy: number;
}
```

| 項目 | 内容 |
|---|---|
| 送信者 | `PlayerLifeState.Alive` / `PlayerLifeState.Ghost` |
| バリデーション | `vx`, `vy` が有限数値であること。大きさが 1.0 を超える場合は正規化。 |
| 拒否ケース | `GamePhase` が `Playing` でない場合は無視。 |

**サーバー処理**:

- 速度合成は `base × wasteland(0.4) × dash(1.5) × (1 + skillStack)` の乗算とする。
- 基礎速度は **2 セル/秒**。
- Facing は最終移動方向で更新する。
- **生存プレイヤー同士は AABB コリジョンで押し合い / ブロック**され、物理的に重ならない。
- ゴーストは AABB 判定を受けず、他プレイヤーをすり抜ける。

---

### 2. dig — セル掘削

**送信タイミング**: プレイヤーが Dig ボタンを押したとき。

```ts
export interface DigPayload {
  /** 掘削対象セルの X 座標。GridCoord と同じ意味を持つ。 */
  x: number;

  /** 掘削対象セルの Y 座標。GridCoord と同じ意味を持つ。 */
  y: number;
}
```

**送信例**: `{ x: 12, y: 8 }`

| 項目 | 内容 |
|---|---|
| 送信者 | `PlayerLifeState.Alive` のみ |
| リーチ | Chebyshev 距離 1 以内 |
| 対象セル | `SafeMine` または `DangerousMine` のみ |
| 拒否ケース | リーチ外 / `Safe` / `Wasteland` / `Hole` / フェーズが `Playing` でない |

**サーバー処理**:

- `SafeMine` の場合: `Safe` に変換し、flood-fill で隣接ゼロ領域を連鎖開放する。
- EXP は各セル独立で発生し、flood-fill 由来分も含めて**起点となった掘削者 1 名のみに付与**する。
- ドロップ抽選は各セル独立で実施し、基本ドロップ率は **10%（式補正あり）**。
- `DangerousMine` の場合: 管理外爆発パイプラインを起動する。

→ 関連: `DangerousMine` を掘った場合は [Server→Client Events > 4. 管理外爆発イベント](#4-管理外爆発イベント)

**エラーコード**:

| コード | 説明 |
|---|---|
| `DIG_OUT_OF_RANGE` | リーチ外 |
| `DIG_INVALID_TARGET` | 対象セルが掘削不可 |
| `DIG_NOT_ALIVE` | 送信者が生存状態でない |

---

### 3. flag — 旗設置/撤去

**送信タイミング**: プレイヤーが Flag ボタンを押したとき。

```ts
export interface FlagPayload {
  /** 旗操作対象セルの X 座標。GridCoord と同じ意味を持つ。 */
  x: number;

  /** 旗操作対象セルの Y 座標。GridCoord と同じ意味を持つ。 */
  y: number;
}
```

**送信例**: `{ x: 5, y: 3 }`

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

### 4. detonate — 点火（管理爆発開始）

**送信タイミング**: プレイヤーが Detonate ボタンを押したとき。

```ts
export interface DetonatePayload {
  /** 点火ノードの X 座標。GridCoord と同じ意味を持つ。 */
  x: number;

  /** 点火ノードの Y 座標。GridCoord と同じ意味を持つ。 */
  y: number;
}
```

**送信例**: `{ x: 7, y: 4 }`

| 項目 | 内容 |
|---|---|
| 送信者 | `PlayerLifeState.Alive` のみ |
| 対象 | 旗付き地雷セル、または Relay Point が設置されたセル |
| CT チェック | 通常は CT が 0 以下であること。CT は**ベース 10 秒**で、人数・スキルにより式駆動で変動する。Force Ignition 使用時は CT を無視できる。 |
| リーチ | Chebyshev 距離 1 以内（Facing8 前方マスをデフォルト対象とする） |
| 拒否ケース | CT 残あり（Force Ignition なし） / 対象が点火不可 / フェーズが `Playing` でない |

**サーバー処理**:

1. `detonate_preview` と `detonate_fuse_scheduled` を即時ブロードキャストする。
2. イベントキューに `{ type: "detonate_resolve", sourceCoord, scheduledAt: now + 3000 }` を登録する。
3. **3.0 秒**後、爆発時点スナップショットで Rooted Prim-MST を再計算し、MST の親子関係に沿って連鎖を適用する。
4. `DangerousMine` 到達時は爆発して**子へ伝播継続**する。
5. `SafeMine` 到達時は爆発して `Safe` 化するが、**その枝は停止**する。
6. `Relay Point` 到達時は中継ノードとして扱い、**子へ伝播継続**する。
7. 経路上の旗と Relay Point は除去する。
8. 連鎖速度は **1/8 秒 / セル（125ms）** とする。

- タイブレーク規則: 距離が同じ場合は、線形インデックス（`y * width + x`）の昇順で決定。つまり Y 座標が小さいものを優先し、同 Y では X 座標が小さいものを優先する。

→ 関連イベント: `detonate_preview` / `detonate_fuse_scheduled` / `detonate_chain_step` / `detonate_resolved`（[Server→Client Events > 3. Detonate（管理爆発）イベント](#3-detonate管理爆発イベント)）

**エラーコード**:

| コード | 説明 |
|---|---|
| `DETONATE_OUT_OF_RANGE` | リーチ外 |
| `DETONATE_COOLDOWN` | CT 残あり |
| `DETONATE_INVALID_TARGET` | 点火不可なノード |
| `DETONATE_NOT_ALIVE` | 送信者が生存状態でない |

---

### 5. use_item — アイテム使用

**送信タイミング**: プレイヤーがインベントリスロットを操作したとき。

```ts
export interface UseItemPayload {
  /** 使用するインベントリスロット番号（0-indexed）。 */
  slotIndex: number;

  /** 対象座標を必要とするアイテム向けのグリッド座標。`evacuation` ではサーバー側で配置座標を算出するため、クライアント指定は無視される。 */
  targetCoord?: GridCoord;
}
```

**送信例（relay_point 設置）**: `{ slotIndex: 0, targetCoord: { x: 10, y: 6 } }`

**送信例（dash 使用）**: `{ slotIndex: 2 }`

| 項目 | 内容 |
|---|---|
| 送信者 | `PlayerLifeState.Alive` のみ |
| バリデーション | `slotIndex` が有効範囲内で、対象スロットにアイテムが存在すること |
| 対象座標必須 | `relay_point`（Safe セル座標必須）、`bridge`（Hole セル座標必須） |
| 対象座標省略可 | `mine_remover_*` / `purify`（省略時は Facing から 4 方向補正して算出）、`evacuation`（サーバー側で配置座標を算出するため、クライアント指定は無視される） |
| 拒否ケース | スロット空 / 使用条件未達 / フェーズが `Playing` でない |

**アイテム別サーバー処理概要**:

| アイテム ID | 効果 |
|---|---|
| `relay_point` | 指定 Safe セルに Relay Point を設置する。MST 中継ノードになり、点火始点にもできる。 |
| `dash` | 送信者に **15 秒間** のダッシュバフ（速度 1.5 倍）を付与する。 |
| `force_ignition` | 送信者の次回 `detonate` の CT を無視するフラグを付与する。 |
| `mine_remover_cheap` | Facing 4 方向補正後の前方地雷原を Safe 化する（安価版）。 |
| `mine_remover_normal` | Facing 4 方向補正後の前方地雷原を Safe 化する（通常版）。 |
| `mine_remover_high` | Facing 4 方向補正後の前方地雷原を Safe 化する（高価版）。 |
| `purify` | Facing 4 方向補正後の前方 1 マスの Wasteland を Safe に変換する。 |
| `cats_eye` | 全未回収 CP を一定時間チーム共有表示する。持続時間は `packages/config` の `game-params.json > itemEffects.catsEyeDurationMs` で管理する（実装時に確定）。効果開始/終了は `cats_eye_activated` / `cats_eye_expired` で通知する。 |
| `evacuation` | 送信者を**ランダムな生存プレイヤー周囲の非地雷マス**へ瞬間移動させる。配置アルゴリズムはリスポーンと同じ（`packages/rules-core/lifecycle/spawn-selection.ts` の関数を使用）。 |
| `take_a_breath` | 侵食を短時間停止する。停止時間は `packages/config` の `game-params.json > erosion.takeABreathPauseMs` で管理する（実装時に確定）。 |
| `short_break` | 侵食を長時間停止する。停止時間は `packages/config` の `game-params.json > erosion.shortBreakPauseMs` で管理する（実装時に確定）。 |
| `bridge` | 指定 Hole セルを Safe 化する（後の侵食で再び地雷化されうる）。 |
| `disposable_life` | **手動使用**で一定時間バフを付与し、そのバフ有効中に死亡判定が来た場合だけ**自動消費**して死亡を回避する。持続時間は `packages/config` の `game-params.json > itemEffects.disposableLifeDurationMs` で管理する（実装時に確定）。優先消費順位は 1 位。 |

> **地雷除去機の効果範囲**: Facing 4 方向補正後の前方 **1 マス**の地雷原セルを Safe 化する。複数マスを一度に除去するわけではない。`cheap` / `normal` / `high` の差分は**ドロップレート・スタック数・報酬重み**にあり、効果範囲は共通（1 マス）。

> **チーム効果アイテム**: `take_a_breath`、`short_break`、`cats_eye` の効果は使用プレイヤー個人ではなく**チーム全体**に適用される。`disposable_life`、`nine_lives`、`dash`、`force_ignition`、`evacuation` は**使用者個人**にのみ適用される。

`nine_lives` は手動使用ではなく**自動発動**のみとする。

**エラーコード**:

| コード | 説明 |
|---|---|
| `USE_ITEM_EMPTY_SLOT` | スロットが空 |
| `USE_ITEM_INVALID_TARGET` | 対象座標が無効 |
| `USE_ITEM_CONDITION_NOT_MET` | 使用条件未達（例: 対象が Safe でない） |
| `USE_ITEM_NOT_ALIVE` | 送信者が生存状態でない |

---

### 6. discard_item — アイテム破棄

**送信タイミング**: プレイヤーがインベントリの × ボタンを押したとき。

```ts
export interface DiscardItemPayload {
  /** 破棄するインベントリスロット番号（0-indexed）。 */
  slotIndex: number;
}
```

**送信例**: `{ slotIndex: 1 }`

| 項目 | 内容 |
|---|---|
| 送信者 | `PlayerLifeState.Alive` のみ |
| バリデーション | `slotIndex` が有効範囲内で、対象スロットにアイテムが存在すること |
| 拒否ケース | スロット空 / フェーズ不正 |

**サーバー処理**: 対象スロットのアイテムをプレイヤー現在位置へ `GroundItemState` としてドロップし、他プレイヤーも通常の地上ドロップと同様に拾得できる。

**エラーコード**:

| コード | 説明 |
|---|---|
| `DISCARD_EMPTY_SLOT` | スロットが空 |

---

### 7. claim_reward — レベルアップ報酬選択

**送信タイミング**: プレイヤーが画面上の報酬ボタンをタップしたとき。フロア中いつでも受け付ける。

```ts
export interface ClaimRewardPayload {
  /** `reward_offer` と照合する報酬オファー ID。 */
  offerId: string;

  /** `reward_offer.options: RewardOption[]` 内の候補インデックス（0-indexed）。 */
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

**補足**: 報酬オファーはレベルアップ時に即生成し、未受取オファーとして保持する。`claim_reward` は保留済みオファーに対する選択確定のみを担当する。

**エラーコード**:

| コード | 説明 |
|---|---|
| `CLAIM_NO_PENDING_REWARD` | 保留報酬がない |
| `CLAIM_INVALID_OFFER_ID` | `offerId` が一致しない |
| `CLAIM_INVALID_OPTION` | インデックスが無効または候補が無効 |

---

## Server→Client Events

> 1. [汎用 / エラーイベント](#1-汎用--エラーイベント) | 2. [プレイヤー存在イベント](#2-プレイヤー存在イベント) | 3. [Detonate イベント](#3-detonate管理爆発イベント) | 4. [管理外爆発イベント](#4-管理外爆発イベント) | 5. [侵食イベント](#5-侵食イベント) | 6. [CP イベント](#6-チェックポイントcpイベント) | 7. [EXP / レベルアップ / 報酬イベント](#7-exp--レベルアップ--報酬イベント) | 8. [アイテム / インベントリイベント](#8-アイテム--インベントリイベント) | 9. [死亡 / リスポーンイベント](#9-死亡--リスポーンイベント) | 10. [フロアイベント](#10-フロアイベント) | 11. [スコアイベント](#11-スコアイベント)

スコープ表記:

| 表記 | 説明 |
|---|---|
| **ルーム全体** | `this.broadcast(type, payload)` — 全クライアントへ送信 |
| **チーム** | 現時点では全員が 1 チームのため、ルーム全体と同義 |
| **プライベート** | `client.send(type, payload)` — 特定クライアントのみへ送信 |

---

### 1. 汎用 / エラーイベント

#### `error`

コマンドが拒否された場合に送信者へ返す汎用エラーイベント。

```ts
export interface ErrorEvent {
  /** ErrorCode enum 値。 */
  code: ErrorCode;

  /** 人間が読める説明。主にデバッグ用。 */
  message: string;
}
```

スコープ: **プライベート**

トリガー: コマンドバリデーション失敗時

---

### 2. プレイヤー存在イベント

#### `player_joined`

```ts
export interface PlayerJoinedEvent {
  /** 参加したプレイヤーの sessionId。 */
  sessionId: string;

  /** 参加したプレイヤーの表示名。 */
  displayName: string;

  /** `true` の場合は Playing 中の途中参加。 */
  isMidGame: boolean;
}
```

スコープ: **ルーム全体**

トリガー: `onJoin` 完了時

---

#### `player_left`

```ts
export interface PlayerLeftEvent {
  /** 離脱したプレイヤーの sessionId。 */
  sessionId: string;

  /** 離脱理由。 */
  reason: LeaveReason;
}
```

スコープ: **ルーム全体**

トリガー: `onLeave` 完了時

---

#### `player_disconnected`

```ts
export interface PlayerDisconnectedEvent {
  /** 切断したプレイヤーの sessionId。 */
  sessionId: string;

  /** 再接続猶予の締切 UNIX ミリ秒。 */
  reconnectDeadline: number;
}
```

スコープ: **ルーム全体**

トリガー: `onDrop` で `allowReconnection` を呼んだ直後

---

#### `player_reconnected`

```ts
export interface PlayerReconnectedEvent {
  /** 再接続に成功したプレイヤーの sessionId。 */
  sessionId: string;
}
```

スコープ: **ルーム全体**

トリガー: `onReconnect` 完了時

---

### 3. Detonate（管理爆発）イベント

#### `detonate_preview`

点火コマンド受付後、provisional MST をクライアントに渡すためのイベント。fuse 中に旗や地形が変化すると実際の爆発経路と異なる場合があるため、クライアントは「provisional（予測）」として表示する。

```ts
export interface DetonatePreviewEvent {
  /** 点火源のグリッド座標。 */
  sourceCoord: GridCoord;

  /** provisional MST の伝播順。 */
  provisionalPath: GridCoord[];

  /** fuse 終了予定時刻の UNIX ミリ秒。 */
  fuseEndsAt: number;
}
```

スコープ: **ルーム全体**

トリガー: `detonate` コマンド受付時

---

#### `detonate_fuse_scheduled`

fuse イベントがキューに登録されたことを通知する。`detonate_preview` と同時に送信する。

```ts
export interface DetonateFuseScheduledEvent {
  /** 点火源のグリッド座標。 */
  sourceCoord: GridCoord;

  /** fuse 終了予定時刻の UNIX ミリ秒。 */
  fuseEndsAt: number;

  /** 点火したプレイヤーの sessionId。 */
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
  /** キャンセル対象だった点火源の座標。 */
  sourceCoord: GridCoord;

  /** キャンセル理由。 */
  reason: FuseCancelReason;
}
```

スコープ: **ルーム全体**

トリガー: 起爆源消失 / 旗除去 / 地雷除去機による除去 / フロアクリア時

---

#### `detonate_chain_step`

管理爆発の連鎖が 1 セル処理されるたびに送信する。

```ts
export interface DetonateChainStepEvent {
  /** 元の点火源座標。 */
  sourceCoord: GridCoord;

  /** 今回処理されたノード座標。 */
  coord: GridCoord;

  /** 処理前のセル型。 */
  cellTypeBefore: CellType;

  /** 今回処理ノードに Relay Point が存在したか。 */
  wasRelayPoint: boolean;

  /** 再計算後の残り予定経路。 */
  remainingPath: GridCoord[];
}
```

スコープ: **ルーム全体**

トリガー: **1/8 秒（125ms）**ごとの各セル処理時

補足:

- `DangerousMine` は爆発して子へ伝播継続する。
- `SafeMine` は爆発するがその枝で停止する。
- `Relay Point` は中継して子へ伝播継続する。

---

#### `detonate_resolved`

管理爆発の連鎖が全て完了したことを通知する。

```ts
export interface DetonateResolvedEvent {
  /** 元の点火源座標。 */
  sourceCoord: GridCoord;

  /** 今回の Detonate で処理した全座標。 */
  processedCells: GridCoord[];

  /** SafeMine から Safe へ変換したセル数。 */
  safeMineCellsConverted: number;

  /** DangerousMine から Safe へ変換したセル数。 */
  dangerousMineCellsConverted: number;
}
```

スコープ: **ルーム全体**

トリガー: MST 上の全ノード処理完了時

---

### 4. 管理外爆発イベント

#### `unmanaged_explosion_triggered`

`DangerousMine` の誤掘りで管理外爆発が発生したことを通知する。

```ts
export interface UnmanagedExplosionTriggeredEvent {
  /** 最初の爆発震源座標。 */
  epicenterCoord: GridCoord;

  /** 誤掘りしたプレイヤーの sessionId。 */
  triggerSessionId: string;

  /** 衝撃波範囲。Chebyshev 半径 1（中心含む最大 9 マス）。 */
  blastCoords: GridCoord[];

  /** 荒地化範囲。Manhattan 半径 2。 */
  wastelandCoords: GridCoord[];
}
```

スコープ: **ルーム全体**

トリガー: `DangerousMine` の `dig` 処理時

補足:

- 衝撃波範囲内プレイヤーは **Wasteland 上でも致死**。
- 荒地化範囲では SafeMine・旗・Relay Point・地上ドロップが除去 / 消滅する。

---

#### `unmanaged_chain_step`

管理外爆発の連鎖が 1 セル進んだことを通知する。

```ts
export interface UnmanagedChainStepEvent {
  /** この連鎖爆発の震源座標。 */
  epicenterCoord: GridCoord;

  /** 今回連鎖した DangerousMine の座標。 */
  coord: GridCoord;

  /** 連鎖の深さ。最初の爆発が 0。 */
  chainDepth: number;

  /** この爆発による衝撃波範囲。 */
  blastCoords: GridCoord[];

  /** この爆発による荒地化範囲。 */
  wastelandCoords: GridCoord[];
}
```

スコープ: **ルーム全体**

トリガー: **1/8 秒（125ms）**ごとの各連鎖セル処理時

---

#### `unmanaged_explosion_resolved`

管理外爆発の連鎖が全て終了したことを通知する。

```ts
export interface UnmanagedExplosionResolvedEvent {
  /** 最初の爆発震源座標。 */
  originCoord: GridCoord;

  /** 連鎖で処理した爆発ノード総数。 */
  totalChainsTriggered: number;
}
```

スコープ: **ルーム全体**

トリガー: 連鎖 BFS キューが空になったとき

---

### 5. 侵食イベント

#### `erosion_warning`

次の侵食フェーズで変換されるセルを事前通知する。

```ts
export interface ErosionWarningEvent {
  /** 次フェーズで地雷化される予定のセル群。 */
  targetCoords: GridCoord[];

  /** 変換実行予定時刻の UNIX ミリ秒。 */
  warningEndsAt: number;
}
```

スコープ: **ルーム全体**

トリガー: 侵食フェーズの警告時刻到達時

補足:

- 侵食警告時間は、侵食インターバルが **4 秒以上なら 3 秒固定**、**4 秒未満ならインターバル時間の 3/4 秒**とする。
- 警告対象は、そのフェーズで選定された **安全マス** と、その時点で既に存在する **荒地（Wasteland）マス** である。選定アルゴリズムは [Timers and Event Queue > 侵食タイマー](#侵食タイマー) を参照。

---

#### `erosion_warning_canceled`

保留中の侵食警告がキャンセルされたことを通知する。

```ts
export interface ErosionWarningCanceledEvent {
  /** キャンセルされた警告対象セル群。 */
  canceledCoords: GridCoord[];

  /** キャンセル理由。 */
  reason: ErosionWarningCancelReason;
}
```

スコープ: **ルーム全体**

トリガー: 侵食停止アイテム使用時 / フロアクリア時

---

#### `erosion_applied`

侵食変換が実行されたことを通知する。`SafeMine:DangerousMine` 比は式駆動で決まり、対象セル群へその比率でランダム配置する。

```ts
export interface ErosionAppliedEvent {
  /** 今回 SafeMine へ変換された座標群。 */
  convertedSafeMineCoords: GridCoord[];

  /** 今回 DangerousMine へ変換された座標群。 */
  convertedDangerousMineCoords: GridCoord[];

  /** `adjacentMineCount` を再計算したセル群。 */
  updatedAdjacentCoords: GridCoord[];
}
```

スコープ: **ルーム全体**

トリガー: 侵食フェーズ変換実行時

補足:

- 各フェーズの侵食力（変換マス数）は**基礎値 3**を起点に、フロア数・ステージ特性・プレイヤースキル・アイテム効果を含む**式駆動**で算出する。
- 変換時、警告対象だった **荒地マス** と **選定済み安全マス** を、パラメータで決まる `SafeMine:DangerousMine` 比率に従ってランダムに再配置する。
- 変換時、セル上の**旗 / Relay Point は除去**され、地上アイテムは消滅する。
- 変換対象セル上のプレイヤーは即死する。
- **スポーン地点セルも侵食対象になりうる**。
- `bridge` で Safe 化した元 Hole セルも侵食対象になりうる。

---

### 6. チェックポイント（CP）イベント

CP はセル属性と独立した座標オブジェクトとしてサーバー権威で管理する。ゲームルールとしては以下を満たす。

- 配置元はステージ定義の候補座標群。
- **Hole 座標は候補除外**。
- **初期安全ゾーン内は生成不可**。
- 1 フロアあたり CP 数は**式駆動**（ステージ定義 + 人数依存）。
- 通常の可視化は Euclidean 距離検知（`dist² ≤ R²`、`R` は式駆動）。
- 侵食でセル種類が変わっても **CP 自体は消滅しない**。
- **CP 座標は非秘密扱いとする。** 全 CP 位置を `GameState` の `MapSchema<CheckpointState>` に常時全量同期し、可視性（検知済みかどうか）の描画制御はクライアント側で行う。
- **Cat's Eye** 使用時は全未回収 CP を一時的にチーム全体に共有表示する。サーバーは `cats_eye_activated` / `cats_eye_expired` イベントを broadcast し、クライアント側で一時全表示のフラグを管理する。

#### `cats_eye_activated`

Cat's Eye 使用により全未回収 CP の一時公開を通知する。

```ts
export interface CatsEyeActivatedEvent {
  /** Cat's Eye を使用したプレイヤーの sessionId。 */
  sessionId: string;

  /** 公開される未回収 CP の ID 一覧。 */
  revealedCpIds: string[];

  /** 効果終了予定時刻（UNIX ミリ秒）。0 で永続（現行仕様では永続はない）。 */
  expiresAt: number;
}
```

スコープ: **ルーム全体**

トリガー: プレイヤーが `use_item` で `cats_eye` を使用した直後

---

#### `cats_eye_expired`

Cat's Eye の一時公開効果が終了したことを通知する。

```ts
export interface CatsEyeExpiredEvent {
  /** Cat's Eye を使用したプレイヤーの sessionId。 */
  sessionId: string;
}
```

スコープ: **ルーム全体**

トリガー: `CatsEyeActivatedEvent.expiresAt` に到達した時

---

#### `cp_collected`

プレイヤーが CP を回収したことを通知する。

```ts
export interface CpCollectedEvent {
  /** 回収された CP の ID。 */
  cpId: string;

  /** 回収された CP の座標。 */
  coord: GridCoord;

  /** 回収したプレイヤーの sessionId。 */
  collectorSessionId: string;

  /** 回収後の未回収 CP 残数。 */
  remainingCount: number;
}
```

スコープ: **ルーム全体**

トリガー: プレイヤーが CP 座標に到達した瞬間（同 tick 同時到達時はサーバー処理順で先着 1 名のみ）

---

### 7. EXP / レベルアップ / 報酬イベント

#### `exp_gained`

EXP を獲得したことをプレイヤーに通知する。

```ts
export interface ExpGainedEvent {
  /** EXP を得たプレイヤーの sessionId。 */
  sessionId: string;

  /** 今回加算された EXP 量。 */
  amount: number;

  /** 適用されたコンボ倍率。1.0 はコンボなし。 */
  comboMultiplier: number;

  /** EXP の発生源。 */
  source: ExpSource;

  /** 加算後の累積 EXP。 */
  totalExp: number;
}
```

スコープ: **プライベート**（当該プレイヤーのみ）

トリガー: `SafeMine` dig 完了時 / flood-fill 各セル完了時 / detonate コンボ計算時

補足:

- flood-fill 連鎖開放で追加発生した EXP も、起点となった掘削者 1 名のみに加算する。
- 点火コンボ倍率は **式駆動**で決定する。

---

#### `level_up`

プレイヤーがレベルアップしたことを通知する。

```ts
export interface LevelUpEvent {
  /** レベルアップしたプレイヤーの sessionId。 */
  sessionId: string;

  /** 更新後のレベル。 */
  newLevel: number;

  /** 現在の未受取報酬オファー数。 */
  pendingRewardCount: number;
}
```

スコープ: **ルーム全体**（告知） + **プライベート**（報酬詳細は `reward_offer` で別送）

トリガー: 累積 EXP が閾値を超えたとき

補足:

- 必要 EXP は**指数増加の式駆動**とする。
- レベルアップ専用フェーズは作らず、オファーは保留できる。

---

#### `reward_offer`

報酬の選択肢をプレイヤーに提示する。

```ts
export interface RewardOfferEvent {
  /** `claim_reward` と照合する報酬オファー ID。 */
  offerId: string;

  /** 提示される報酬候補一覧。 */
  options: RewardOption[];
}

// RewardOption の定義は「共有型定義 (Shared Types)」セクションを参照。
```

スコープ: **プライベート**

トリガー: `level_up` 処理完了直後（その時点でオファーを生成し、保留状態に積む）

---

### 8. アイテム / インベントリイベント

#### `item_dropped`

地上にアイテムドロップが生成されたことを通知する。

```ts
export interface ItemDroppedEvent {
  /** 生成された地上ドロップの ID。 */
  groundItemId: string;

  /** ドロップしたアイテム種別。 */
  itemType: ItemType;

  /** ドロップ座標。 */
  coord: GridCoord;

  /** ドロップしたスタック数。 */
  stackCount: number;

  /** 失効予定時刻の UNIX ミリ秒。生成後 15 秒。 */
  expiresAt: number;
}
```

スコープ: **ルーム全体**

トリガー: `SafeMine` 開放時のドロップ抽選成功 / `discard_item` による地面ドロップ生成時

補足:

- ドロップ抽選の基本確率は **10%**、最終値は式補正あり。
- 死亡者が 1 人以上いる場合、**蘇生短縮系ドロップ比率は既定 90%** まで高める（式補正可）。
- 地上ドロップ寿命は **15 秒**。

---

#### `item_picked_up`

プレイヤーが地上ドロップを取得したことを通知する。

```ts
export interface ItemPickedUpEvent {
  /** 取得された地上ドロップの ID。 */
  groundItemId: string;

  /** 取得したプレイヤーの sessionId。 */
  pickerSessionId: string;

  /** 取得されたアイテム種別。 */
  itemType: ItemType;

  /** 取得されたスタック数。 */
  stackCount: number;

  /** 新規スロット消費なら `true`、既存スタック加算なら `false`。 */
  usedNewSlot: boolean;
}
```

スコープ: **ルーム全体**

トリガー: プレイヤーがドロップ座標に重なった瞬間（自動取得）

補足:

- ベースの所持枠は **3**、スキル拡張込みの最大は **10**。
- 空き枠がない場合、新規取得は失敗する。
- ただし**同種スタック可能アイテム**は、空き枠なしでも既存スタックへ加算できる。
- 取得失敗時は `item_picked_up` を送らず、地上ドロップは残す。

---

#### `item_expired`

地上ドロップの寿命が切れたことを通知する。

```ts
export interface ItemExpiredEvent {
  /** 寿命切れになった地上ドロップ ID。 */
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
  /** 使用者の sessionId。 */
  sessionId: string;

  /** 使用されたアイテム種別。 */
  itemType: ItemType;

  /** 消費元インベントリスロット番号。 */
  slotIndex: number;

  /** 対象座標を持つアイテムで使われた座標。 */
  targetCoord?: GridCoord;
}
```

スコープ: **ルーム全体**

トリガー: `use_item` コマンドの処理完了時

補足:

- `purify` を含む手動使用アイテムはすべてこのイベントで通知する。

---

#### `item_auto_triggered`

自動発動アイテムが発動したことを通知する。

```ts
export interface ItemAutoTriggeredEvent {
  /** 自動発動したプレイヤーの sessionId。 */
  sessionId: string;

  /** 発動した自動消費アイテム種別。 */
  itemType: ItemType;
}
```

スコープ: **ルーム全体**

トリガー: 死亡判定直前に `disposable_life` バフまたは `nine_lives` 在庫が発動したとき

---

#### `item_destroyed`

アイテムが爆発・侵食などで消滅したことを通知する。

```ts
export interface ItemDestroyedEvent {
  /** 消滅した地上ドロップ ID。 */
  groundItemId: string;

  /** 消滅理由。 */
  reason: ItemDestroyReason;
}
```

スコープ: **ルーム全体**

トリガー: 管理外爆発荒地化範囲 / 侵食変換セル上のドロップ消滅時

---

#### `inventory_updated`

インベントリ内容が変化したことをプレイヤー本人に通知する。

```ts
export interface InventoryUpdatedEvent {
  /** 現在のスロット一覧。 */
  slots: InventorySlot[];

  /** 現在の所持可能スロット上限。 */
  maxSlots: number;
}

// InventorySlot の定義は「共有型定義 (Shared Types)」セクションを参照。
```

スコープ: **プライベート**

トリガー: アイテム取得 / 使用 / 破棄 / 死亡（全ロスト） / フロア開始時 / 再接続時

---

### 9. 死亡 / リスポーンイベント

#### `player_death`

プレイヤーが死亡したことを通知する。

```ts
export interface PlayerDeathEvent {
  /** 死亡したプレイヤーの sessionId。 */
  sessionId: string;

  /** 死亡原因。 */
  cause: DeathCause;

  /** 死亡位置の座標。 */
  coord: GridCoord;

  /** リスポーン予定時刻の UNIX ミリ秒。 */
  respawnAt: number;

  /** 死亡によりロストした全アイテム一覧。 */
  lostItems: ItemType[];
}
```

スコープ: **ルーム全体**

トリガー: 管理外爆発致死判定 / 侵食変換判定 / 将来イベント致死判定

補足:

- 通常死亡時は**所持アイテム全ロスト**。
- リスポーン時間は**ベース 40 秒**で、人数や補正により式駆動で変動する。

---

#### `death_avoided`

死亡回避アイテムが発動し、死亡が回避されたことを通知する。

優先消費順位: `disposable_life` → `nine_lives`

```ts
export interface DeathAvoidedEvent {
  /** 死亡回避したプレイヤーの sessionId。 */
  sessionId: string;

  /** 回避対象だった死亡原因。 */
  cause: DeathCause;

  /** 回避に使われたアイテム種別。 */
  itemUsed: ItemType;
}
```

スコープ: **ルーム全体**

トリガー: 死亡判定で `disposable_life` または `nine_lives` が発動したとき

補足:

- 回避時は**死亡扱いにならない**。
- 回避時は**アイテム全ロストは発生しない**。

---

#### `player_ghost`

プレイヤーがゴースト状態に遷移したことを通知する。

```ts
export interface PlayerGhostEvent {
  /** ゴースト化したプレイヤーの sessionId。 */
  sessionId: string;

  /** リスポーン予定時刻の UNIX ミリ秒。 */
  respawnAt: number;
}
```

スコープ: **ルーム全体**

トリガー: `player_death` 送信後、ゴースト遷移完了時

補足:

- ゴーストは他プレイヤーと衝突せず、AABB 判定なしですり抜ける。
- ゴーストは**Ping / マーク等の情報支援を行えない**。

---

#### `player_respawned`

プレイヤーがリスポーンしたことを通知する。

```ts
export interface PlayerRespawnedEvent {
  /** リスポーンしたプレイヤーの sessionId。 */
  sessionId: string;

  /** 最終的に確定したリスポーン座標。 */
  spawnCoord: GridCoord;
}
```

スコープ: **ルーム全体**

トリガー: リスポーンタイマー満了後、スポーン位置確定時

補足:

- リスポーン位置は**ランダムな生存プレイヤー周囲の非地雷マス**を起点に選ぶ。
- 候補が危険なら近傍安全マスを再探索する。
- 近傍に安全マスがない場合は**荒地リスポーンを許容**する。

---

#### `game_over`

ランの終了が確定したことを通知する。全滅敗北とフロア10クリア勝利の両方で使用する。

```ts
export interface GameOverEvent {
  /** 終了時点の最終フロア番号。 */
  finalFloor: number;

  /** 終了時点の最終スコア。 */
  finalScore: number;

  /** ゲーム終了理由。 */
  reason: GameOverReason;
}
```

スコープ: **ルーム全体**

トリガー: 生存プレイヤー数が 0 になったとき / フロア10クリアが確定したとき

補足:

- Floor10Cleared の場合、`score_updated` を `game_over` に先立ち送信する。

---

### 10. フロアイベント

> 10フロア構成。フロア10クリアでゲーム勝利（`GameOverReason.Floor10Cleared`）。フロア10以降のエンドレスモードは存在しない。

#### `floor_cleared`

フロアが全 CP 回収によりクリアされたことを通知する。

```ts
export interface FloorClearedEvent {
  /** クリアしたフロア番号。 */
  floorNumber: number;

  /** クリア確定時刻の UNIX ミリ秒。 */
  clearedAt: number;

  /** フロア開始からのクリア時間（ミリ秒）。 */
  clearTimeMs: number;
}
```

スコープ: **ルーム全体**

トリガー: 最後の CP が回収されたとき

補足:

- このイベントを起点に、**タイマー停止 → 地雷原消滅 → 保留イベントキャンセル → 全員復活 → 初期位置復帰**までを同一遷移で進める。

---

#### `rest_phase_started`

休憩フェーズが開始されたことを通知する。

```ts
export interface RestPhaseStartedEvent {
  /** 休憩に入ったフロア番号。 */
  floorNumber: number;
}
```

スコープ: **ルーム全体**

トリガー: `floor_cleared` 後、全員復活と初期位置復帰まで完了した時点

補足:

- 休憩フェーズは報酬選択のための時間である。
- `ready` コマンドではなく、**全プレイヤーが各自の初期スポーン地点へ到達した時点**で休憩フェーズを終了し、次フロア生成に移行する。次フロア生成完了後に `next_floor_started` を送信する。

---

#### `next_floor_started`

次のフロアが開始されたことを通知する。

```ts
export interface NextFloorStartedEvent {
  /** 開始したフロア番号。 */
  floorNumber: number;

  /** 割り当てられたステージ ID。 */
  stageId: string;

  /** 盤面幅。 */
  gridWidth: number;

  /** 盤面高さ。 */
  gridHeight: number;
}
```

スコープ: **ルーム全体**

トリガー: 全プレイヤーが各自の初期スポーン地点に到達し、新フロア生成完了時

補足:

- 持ち越し: **スキル、アイテム、EXP/レベル**（累積モデル）。
- リセット: **フラグ、地形、プレイヤー位置、CT、バフ、一時効果**。
- クリア遷移全体は「全 CP → タイマー停止 → 地雷原消滅 → 保留キャンセル → 全員復活 → 初期位置 → 休憩 → 次フロア」の順で進む。
- フロア10クリア時は `next_floor_started` へ進まず、`game_over`（`reason: GameOverReason.Floor10Cleared`）で終了する。

---

### 11. スコアイベント

#### `score_updated`

スコアが更新されたことを通知する。

```ts
export interface ScoreUpdatedEvent {
  /** 累積総スコア。 */
  totalScore: number;

  /** 今回フロアで加算されたスコア。 */
  floorScore: number;

  /** 適用されたタイムボーナス係数。 */
  timeBonusMultiplier: number;
}
```

スコープ: **ルーム全体**

トリガー: フロアクリア時のスコア確定後

補足:

- スコア基準式は **EXP × タイムボーナス係数**。
- タイムボーナス係数の基準は **`600 秒 / クリアタイム`**（ステージ基準値は将来 JSON 化可能）。
- `floorScore` は最小値境界を適用後に**四捨五入**して確定する。

---

## Shared Schema (同期状態)

> `CellState` → `GridState` → `FloorState` → `ErosionState` → `CheckpointState` → `GroundItemState` → `PlayerState` → `GameState`

`@colyseus/schema` 4.x を使用する。`@type()` デコレータを付与したフィールドのみが差分同期される。トランジェントな値（入力キュー・タイマーハンドル・キャッシュ）には `@type()` を付与しない。

1 つの Schema クラスに付与できる `@type()` フィールドは最大 64 個。

依存の浅い型から順に記載する。

---

### `CellState`（セル 1 マス）

```ts
export class CellState extends Schema {
  /** CellType enum 値。 */
  @type("number")
  cellType: number;

  /** 周囲地雷数。0〜8。地雷原 / 荒地では未使用。 */
  @type("number")
  adjacentMineCount: number;

  /** 旗が置かれている場合は `true`。 */
  @type("boolean")
  flagged: boolean = false;

  /** Relay Point が置かれている場合は `true`。 */
  @type("boolean")
  hasRelayPoint: boolean = false;

  /** 侵食警告中セルである場合は `true`。 */
  @type("boolean")
  erosionWarning: boolean = false;
}
```

補足:

- セル変化（爆発・侵食）時、**旗と Relay Point は即除去**される。

---

### `GridState`（盤面）

多次元配列は `@colyseus/schema` でサポートされないため、フラット配列 + width/height で表現する。

```ts
export class GridState extends Schema {
  /** 盤面の横幅。 */
  @type("number")
  width: number;

  /** 盤面の縦幅。 */
  @type("number")
  height: number;

  /** `y * width + x` でアクセスする CellState のフラット配列。 */
  @type([CellState])
  cells: ArraySchema<CellState> = new ArraySchema();
}
```

---

### `FloorState`（現在フロアのメタ情報）

```ts
export class FloorState extends Schema {
  /** 現在フロアのステージ ID。MVP では各フロア 1 ステージ固定（将来はプールからランダム選出）。 */
  @type("string")
  stageId: string;

  /** フロア開始時刻の UNIX ミリ秒。 */
  @type("number")
  floorStartedAt: number;

  /** このフロアに生成された CP 総数。 */
  @type("number")
  cpTotal: number;

  /** 既に回収された CP 数。 */
  @type("number")
  cpCollected: number;
}
```

補足:

- MVP では各フロア 1 ステージ固定。将来はステージプールからの選出に拡張可能とする。
- 初期安全ゾーンは **5x5 基準**で、地雷なし・CP 生成なし。
- 初期スポーンは**複数群**を採用する。

---

### `ErosionState`（侵食状態）

```ts
export class ErosionState extends Schema {
  /** 停止アイテム中でなければ `true`。 */
  @type("boolean")
  active: boolean = true;

  /** 次の警告開始時刻の UNIX ミリ秒。 */
  @type("number")
  nextWarningAt: number;

  /** 次の変換実行時刻の UNIX ミリ秒。 */
  @type("number")
  nextConversionAt: number;

  /** 警告中セルのキー一覧（`"x,y"` 形式）。 */
  @type(["string"])
  warningCellKeys: ArraySchema<string> = new ArraySchema();
}
```

---

### `CheckpointState`（チェックポイント 1 個）

```ts
export class CheckpointState extends Schema {
  /** CP の一意 ID。 */
  @type("string")
  cpId: string;

  /** CP の X 座標。 */
  @type("number")
  x: number;

  /** CP の Y 座標。 */
  @type("number")
  y: number;

  /** 回収済みなら `true`。 */
  @type("boolean")
  collected: boolean = false;

  /** 回収者の sessionId。未回収時は空文字列。 */
  @type("string")
  collectedBySessionId: string = "";
}
```

**配置ルール**:

- CP はステージ定義の候補座標から生成する。
- **Hole は候補から除外**する。
- **初期安全ゾーン内は生成不可**とする。
- 1 フロアの CP 数は**式駆動**（ステージ定義 + 人数依存）とする。

**検知 / 存続ルール**:

- 通常の検知半径は Euclidean 判定 `dist² ≤ R²` を使う。
- `R` は**式駆動**の検知半径パラメータ。
- CP はセル属性と独立であり、**侵食では消滅しない**。

---

### `GroundItemState`（地上ドロップ 1 個）

```ts
export class GroundItemState extends Schema {
  /** 地上ドロップの一意 ID。 */
  @type("string")
  groundItemId: string;

  /** ItemType 文字列 enum 値。 */
  @type("string")
  itemType: string;

  /** ドロップの X 座標。 */
  @type("number")
  x: number;

  /** ドロップの Y 座標。 */
  @type("number")
  y: number;

  /** スタック数。 */
  @type("number")
  stackCount: number = 1;

  /** 失効予定時刻の UNIX ミリ秒。 */
  @type("number")
  expiresAt: number;
}
```

補足:

- 地上ドロップ寿命は **15 秒**。

---

### `PlayerState`（プレイヤーごと）

```ts
export class PlayerState extends Schema {
  /** プレイヤーの sessionId。 */
  @type("string")
  sessionId: string;

  /** プレイヤーの表示名。 */
  @type("string")
  displayName: string;

  /** 連続座標 X。 */
  @type("number")
  x: number;

  /** 連続座標 Y。 */
  @type("number")
  y: number;

  /** Facing8 enum 値。 */
  @type("number")
  facing: number;

  /** PlayerLifeState enum 値。 */
  @type("number")
  lifeState: number;

  /** リスポーン予定時刻の UNIX ミリ秒。生存中は 0。 */
  @type("number")
  respawnAt: number;

  /** 現在レベル。 */
  @type("number")
  level: number = 1;

  /** 現在累積 EXP。 */
  @type("number")
  exp: number = 0;

  /** 未受取報酬オファー数。 */
  @type("number")
  pendingRewardCount: number = 0;

  // インベントリは本人専用の Private State として管理し、@type() フィールドには含めない。
}
```

補足:

- 生存プレイヤー同士は**AABB コリジョンあり**。
- ゴーストはコリジョンなし・情報支援なし。

---

### `GameState`（ルート状態）

```ts
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class GameState extends Schema {
  /** GamePhase enum 値を入れる数値フィールド。 */
  @type("number")
  phase: number;

  /** 現在フロア番号（1〜10）。 */
  @type("number")
  floorNumber: number;

  /** 現在フロアのメタ情報。 */
  @type(FloorState)
  floor: FloorState;

  /** 現在盤面。 */
  @type(GridState)
  grid: GridState;

  /** 現在の侵食状態。 */
  @type(ErosionState)
  erosion: ErosionState;

  /** 累積総スコア。 */
  @type("number")
  totalScore: number = 0;

  /** `sessionId -> PlayerState` のプレイヤー一覧。 */
  @type({ map: PlayerState })
  players: MapSchema<PlayerState> = new MapSchema();

  /** `groundItemId -> GroundItemState` の地上ドロップ一覧。 */
  @type({ map: GroundItemState })
  groundItems: MapSchema<GroundItemState> = new MapSchema();

  /** `cpId -> CheckpointState` のチェックポイント一覧。全クライアントに常時同期される（非秘密扱い）。 */
  @type({ map: CheckpointState })
  checkpoints: MapSchema<CheckpointState> = new MapSchema();
}
```

> `MapSchema` のキーは文字列のみ。数値キーは使用不可。

> CP 座標は非秘密扱いのため、`GameState` 直下に全量配置する。可視性（検知半径内かどうか）の描画制御は各クライアントが自律的に行う。

---

## Private State (プライベート状態)

以下のデータは全プレイヤーに公開せず、特定クライアントのみに届ける。

---

### 保留報酬オファー（Pending Reward Offers）

レベルアップ時に生成される報酬選択肢は、対象プレイヤーのみへ送る。

- スキーマには含めない。
- `PlayerState.pendingRewardCount` だけをスキーマに持ち、他プレイヤーには「報酬が N 個待ち」とだけ伝える。
- 詳細は `reward_offer` イベント（プライベート）で届ける。

---

### インベントリ

インベントリ状態は `inventory_updated` イベント（プライベート）で管理する。スキーマには含めず、所有者本人のみが参照できる。

- ベース所持枠は **3**。
- スキル拡張込みの上限は **10**。
- 空き枠がない場合、新規アイテム取得は失敗する。
- ただし同種スタック可能アイテムは、空き枠なしでも既存スタックへ加算できる。

`inventory_updated` 送信タイミング:

| トリガー | 説明 |
|---|---|
| アイテム取得時 | 拾得処理完了後 |
| アイテム使用後 | `use_item` 処理完了後 |
| アイテム破棄後 | `discard_item` 処理完了後 |
| 死亡時（全ロスト） | `player_death` イベントと同時 |
| フロア開始時 | `next_floor_started` と同時（持ち越し確認用） |
| 再接続時 | `onReconnect` 完了後（状態復元） |

---

## Timers and Event Queue

タイマーは全てサーバー側の絶対 UNIX ミリ秒タイムスタンプで管理する。クライアントへもこの値を送信し、クライアントはローカル時刻との差分でカウントダウン表示する。

---

### Detonate fuse（3.0 秒）

→ 関連コマンド: `detonate`（[Client→Server Commands > 4. detonate](#4-detonate--点火管理爆発開始)）

```ts
// イベントキューエントリ（スキーマ外、サーバー内部データ）
interface DetonateFuseEntry {
  /** エントリ種別。 */
  type: "detonate_resolve";

  /** 点火源座標。 */
  sourceCoord: GridCoord;

  /** 点火者の sessionId。 */
  initiatorSessionId: string;

  /** 実行予定時刻の UNIX ミリ秒。コマンド受信時刻 + 3000。 */
  scheduledAt: number;
}
```

- `detonate` コマンド受信時にキューへ登録する。
- **3.0 秒 fuse** 後に爆発評価する。
- サーバーのゲームループ（各 tick）でキューを走査し、`scheduledAt <= now` のエントリをバッチで取り出す。
- 同 tick に複数の detonate エントリがある場合は**順不同**で逐次処理する。各爆発後に盤面を再計算し、後続エントリへ反映する。異種タイマー間（detonate vs erosion など）の競合ルールは be-dev-plan §12.1 を参照。
- タイブレークは **§4 detonate コマンド** に記載の決定的規則（`y * width + x` の昇順）に従う。
- キャンセル条件: 起爆源消失 / 旗除去 / 地雷除去機による除去 / フロアクリア。

---

### 管理外爆発連鎖（1/8 秒/セル）

```ts
interface UnmanagedChainEntry {
  /** エントリ種別。 */
  type: "unmanaged_chain";

  /** 次に処理する爆発座標。 */
  coord: GridCoord;

  /** 実行予定時刻の UNIX ミリ秒。 */
  scheduledAt: number;

  /** 連鎖深度。 */
  chainDepth: number;
}
```

- BFS キューに追加する際、`scheduledAt = prevProcessedAt + 125` とする。
- 連鎖速度は **1/8 秒（125ms）/ セル**。
- フロアクリア時に全キューをフラッシュする。

---

### 侵食タイマー

```ts
interface ErosionPhaseEntry {
  /** エントリ種別。 */
  type: "erosion_warn" | "erosion_convert";

  /** 実行予定時刻の UNIX ミリ秒。 */
  scheduledAt: number;
}
```

- 侵食インターバルは**基礎値 10 秒**を起点に、フロア数・ステージ特性・プレイヤースキル・アイテム効果を含む式で算出する。
- **各フェーズで侵食力（変換マス数）を、基礎値 3**を起点とした式で算出する。
- 警告時間は、侵食インターバルが **4 秒以上なら 3 秒固定**、**4 秒未満ならインターバル時間の 3/4 秒**とする。
- `erosion_warn` 到達時:
  1. frontline 候補（地雷原または荒地マスが周囲八マス以内に存在する安全マス群）を、その時点の盤面から再探索する。
  2. frontline から**ランダムに 1 マス**を選び、そのマスを中心に**左右へ frontline 探索**を進め、浸食力ぶんの安全マスを選定する。
  3. 左右探索の**横幅上限**はステージ特性で決まる。上限に達したら、地雷原・荒地・今回選定された安全マスが周囲八マスにあり、かつ**直前の探索で frontline ではなかった**安全マス群を新たな frontline として再探索する。
  4. 直前に frontline だったが今回選定されなかったマスは「幅超過が証明済み」とみなし、同一フェーズ内では再探索しない。
  5. 以後も新 frontline からランダムに 1 マスを選び、左右探索を繰り返す。探索回数は浸食力 `n` に対して `n` 回を超えない。
  6. 警告対象は**そのフェーズで選定された安全マス**と、**その時点で盤面上に存在する荒地（Wasteland）マス**とする。
  7. `erosion_warning` を送信し、`ErosionState.warningCellKeys` を更新する。
  8. **警告開始と同時に次インターバルを開始**し、次回 `erosion_warn` をキューへ積む。警告中も次インターバルは並行して進行する。
- `erosion_convert` 到達時:
  1. `SafeMine:DangerousMine` 比を式から算出する。
  2. 警告対象だった **荒地マス** と **選定済み安全マス** を、その比率でランダム配置しつつ変換する。
  3. 旗 / Relay Point / 地上アイテムを除去する。
  4. 対象セル上プレイヤーを即死させる。
  5. 選定された各マスの周囲八マスを探索し、影響を受ける安全マスの `adjacentMineCount` を再計算する。元が 0 だった安全マスにも新たに数字が表示されうる。
- **スポーン地点セルも侵食対象になりうる**。
- `bridge` で Safe 化した元 Hole セルも侵食対象になりうる。
- 停止アイテム使用時は `ErosionState.active = false` とし、キュー内の `erosion_*` を一時停止する。

---

### 地上ドロップ寿命（15 秒）

```ts
interface ItemExpiryEntry {
  /** エントリ種別。 */
  type: "item_expiry";

  /** 失効対象の地上ドロップ ID。 */
  groundItemId: string;

  /** 実行予定時刻の UNIX ミリ秒。生成時刻 + 15000。 */
  scheduledAt: number;
}
```

- `scheduledAt` 到達時、`GroundItemState` を `groundItems` から削除し、`item_expired` をブロードキャストする。

---

### リスポーンタイマー（ベース 40 秒）

```ts
interface RespawnEntry {
  /** エントリ種別。 */
  type: "respawn";

  /** リスポーン対象プレイヤーの sessionId。 */
  sessionId: string;

  /** 実行予定時刻の UNIX ミリ秒。 */
  scheduledAt: number;
}
```

- リスポーン時間は**ベース 40 秒**で、式補正後の値を `scheduledAt` に使う。
- 蘇生短縮アイテムが適用された場合、対象 `RespawnEntry` の `scheduledAt` を更新する。
- 蘇生短縮は**死亡中の全プレイヤーへ均等適用**する。
- フロアクリア時は全員即リスポーン（タイマー無視）。

---

### 効果期限タイマー

```ts
interface EffectExpiryEntry {
  /** エントリ種別。 */
  type: "effect_expiry";

  /** 効果所持者の sessionId。 */
  sessionId: string;

  /** 効果種別（例: "dash", "cats_eye", "disposable_life", "erosion_pause"）。 */
  effectType: string;

  /** 実行予定時刻の UNIX ミリ秒。 */
  scheduledAt: number;
}
```

- dash / Cat's Eye / Disposable Life / 侵食 pause など持続時間付き効果の終了時刻を管理する。
- `scheduledAt` 到達時に該当効果を解除し、必要に応じてクライアントへ通知する。
- floor clear / death 時は `CancellationIndex` を経由して一括キャンセルする。

---

### 将来イベント枠（MVP は枠組みのみ）

```ts
interface FutureEventEntry {
  /** エントリ種別。 */
  type: "future_event";

  /** 実行予定時刻の UNIX ミリ秒。 */
  scheduledAt: number;
}
```

- MVP では no-op stub。enqueue 時に既存エントリがあれば拒否する singleton 枠。
- floor clear / game over で flush 対象。

- MVP ではランダムイベントの**具体イベント送信は実装しない**。
- 将来は JSON 定義からイベント内容を読み込む。
- 同時発生上限は **1**。

---

## 共有型定義 (Shared Types)

> Enum 定義 | Interface 定義

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

// 向き（4 方向 / cardinal）
export enum Facing4 {
  N = 0,
  E = 1,
  S = 2,
  W = 3,
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
  /** 除染。Facing 4 方向補正後の前方 1 マスの Wasteland を Safe に変換する。 */
  Purify            = "purify",
}

/** スキル種別。Chord はレアスキル（1ランにつき1回取得、常時有効）。それ以外はパッシブ自動適用、効果量は取得時ランダム、スタック上限は JSON 設定。 */
export enum SkillType {
  /** 和音（レアスキル）。1ランにつき取得は1回、取得後は常時有効。効果内容は実装時に確定（全プレイヤーへのバフ付与などを検討中）。 */
  Chord                      = "chord",
  /** リスポーン時間減少。1〜3秒。スタック可。 */
  RespawnTimeReduction       = "respawn_time_reduction",
  /** 移動速度上昇。2〜6%。スタック可。 */
  MovementSpeedBoost         = "movement_speed_boost",
  /** 点火クールダウン減少。0.5〜1秒。スタック可。 */
  DetonateCooldownReduction  = "detonate_cooldown_reduction",
  /** 経験値獲得増加。5〜20%。スタック可。 */
  ExpGainBoost               = "exp_gain_boost",
  /** コンボ倍率。+0.05x〜+0.2x。スタック可。 */
  ComboMultiplierBoost       = "combo_multiplier_boost",
  /** 侵食クールダウン増加。5〜10%（侵食間隔を延長）。スタック可。 */
  ErosionCooldownIncrease    = "erosion_cooldown_increase",
  /** アイテムドロップ率増加。+2〜4%。スタック可。 */
  ItemDropRateBoost          = "item_drop_rate_boost",
  /** アイテム吸収半径増加。+0.2〜0.5マス。スタック可。 */
  ItemPickupRangeBoost       = "item_pickup_range_boost",
  /** アイテムスロット増加。+1。スタック可。 */
  ItemSlotIncrease           = "item_slot_increase",
  /** チェックポイント検知範囲増加。+0.5マス。スタック可。 */
  CpDetectionRangeBoost      = "cp_detection_range_boost",
  /** 侵食予知。警告表示が0.5秒早まる。スタック可。 */
  ErosionForewarning         = "erosion_forewarning",
  /** 死亡時アイテム保持確率。+5%。スタック可。 */
  DeathItemKeepChance        = "death_item_keep_chance",
  /** 荒地移動速度ペナルティ軽減。2〜5%。スタック可。 */
  WastelandSpeedReduction    = "wasteland_speed_reduction",
}

// プレイヤー離脱理由
export enum LeaveReason {
  Voluntary = "voluntary",
  Timeout   = "timeout",
}

// Detonate fuse キャンセル理由
export enum FuseCancelReason {
  SourceRemoved = "source_removed",
  MineRemoved   = "mine_removed",
  FlagRemoved   = "flag_removed",
  FloorCleared  = "floor_cleared",
}

// 侵食警告キャンセル理由
export enum ErosionWarningCancelReason {
  TakeABreath  = "take_a_breath",
  ShortBreak   = "short_break",
  FloorCleared = "floor_cleared",
}

// EXP 発生源
export enum ExpSource {
  Dig            = "dig",
  DetonateCombo  = "detonate_combo",
}

// 地上ドロップ消滅理由
export enum ItemDestroyReason {
  UnmanagedExplosion = "unmanaged_explosion",
  Erosion            = "erosion",
  FloorCleared       = "floor_cleared",
}

// ゲーム終了理由
export enum GameOverReason {
  AllDead         = "all_dead",
  Floor10Cleared  = "floor_10_cleared",
}

// 汎用エラーコード
export enum ErrorCode {
  DigOutOfRange          = "DIG_OUT_OF_RANGE",
  DigInvalidTarget       = "DIG_INVALID_TARGET",
  DigNotAlive            = "DIG_NOT_ALIVE",
  FlagOutOfRange         = "FLAG_OUT_OF_RANGE",
  FlagInvalidTarget      = "FLAG_INVALID_TARGET",
  FlagNotAlive           = "FLAG_NOT_ALIVE",
  DetonateOutOfRange     = "DETONATE_OUT_OF_RANGE",
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

---

### Interface 定義

```ts
// 連続座標（プレイヤー位置など）
export interface Vec2 {
  /** X 座標。 */
  x: number;

  /** Y 座標。 */
  y: number;
}

// グリッド座標（整数、セル指定）
export interface GridCoord {
  /** セルの X 座標。 */
  x: number;

  /** セルの Y 座標。 */
  y: number;
}

// ルーム作成・参加オプション（joinOrCreate / joinById の第 2 引数）
export interface RoomOptions {
  /** 参加者表示名。 */
  displayName: string;
}

// onJoin の第 2 引数（サーバー側）
export interface JoinOptions {
  /** 参加者表示名。 */
  displayName: string;
}

// インベントリスロット
export interface InventorySlot {
  /** スロット番号（0-indexed）。 */
  slotIndex: number;

  /** 所持アイテム種別。空スロットの場合は `itemType` が `null`、`stackCount` は `0` とする。 */
  itemType: ItemType | null;

  /** 現在スタック数。 */
  stackCount: number;
}

/** スキル報酬オプション。 */
export interface SkillRewardOption {
  type: "skill";

  /** 取得するスキルの種別。 */
  skillType: SkillType;

  /** ランダム決定された効果量。スタック上限は JSON 設定で制御。 */
  effectValue: number;
}

/** アイテム報酬オプション。 */
export interface ItemRewardOption {
  type: "item";

  /** 取得するアイテムの種別。 */
  itemType: ItemType;

  /** スタック数（通常 1）。同種スタック可能アイテムは加算。 */
  stackCount: number;
}

/** レベルアップ報酬の選択肢。type で判別する。 */
export type RewardOption = SkillRewardOption | ItemRewardOption;
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
};
```

---

### イベントペイロード 型エクスポート

```ts
// packages/protocol/src/events.ts
export type {
  ErrorEvent,
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
  CatsEyeActivatedEvent,
  CatsEyeExpiredEvent,
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
};
```

---

## ゲームルール詳細仕様（rules-core 契約定義）

> 本セクションは `packages/rules-core` が提供する各計算モジュールの正式な契約を定義する。
> テストはこの仕様のみから期待値を導出できなければならない。実装がこの仕様から逸脱した場合はバグである。

---

### § 速度計算詳細

#### 定義

プレイヤーの最終移動速度 `finalSpeed`（セル/秒）は以下の式で決定する。

```
S_base = movement.baseCellsPerSec              （デフォルト: 2）
R_boost = movementSpeedBoostRatio              （スキルスタックから集約された移動速度ブースト比率）
M_wasteland = movement.wastelandSpeedMultiplier （デフォルト: 0.4）
R_reduction = wastelandPenaltyReductionRatio   （スキルスタックから集約された荒地ペナルティ軽減比率）
M_dash = movement.dashSpeedMultiplier           （デフォルト: 1.5）
```

#### 計算手順

1. **速度ブースト適用**: `speed = S_base × (1 + R_boost)`
2. **荒地ペナルティ適用**（プレイヤーが荒地上にいる場合のみ）:
   ```
   effectiveMultiplier = M_wasteland + (1 − M_wasteland) × R_reduction
   speed = speed × effectiveMultiplier
   ```
   - `R_reduction = 0` のとき `effectiveMultiplier = M_wasteland`（ペナルティ最大）
   - `R_reduction = 1` のとき `effectiveMultiplier = 1`（ペナルティ完全無効化）
3. **ダッシュ適用**（ダッシュアクティブ時のみ）: `speed = speed × M_dash`

#### 乗算順序

乗算は必ず上記の順序（ブースト → 荒地 → ダッシュ）で適用する。荒地とダッシュは条件付きであり、条件を満たさない場合は各倍率が `1` として扱われるのではなく、乗算自体がスキップされる。

#### 検証例

| 条件 | R_boost | R_reduction | 荒地 | ダッシュ | 期待速度 |
|---|---|---|---|---|---|
| 素の状態 | 0 | 0 | × | × | 2.0 |
| 荒地のみ | 0 | 0 | ○ | × | 0.8 |
| 全修飾子適用 | 0.5 | 0.5 | ○ | ○ | 3.15 |
| 荒地ペナルティ完全無効化 | 0.25 | 1.0 | ○ | × | 2.5 |

---

### § スキル集約と単位変換

#### 概要

スキルスタック（`SkillStackEntry[]`）は集約関数によって各スキルタイプごとの合計効果値に統合され、最終的にゲームシステムが消費するモディファイアセットに変換される。

#### 集約ルール

1. **同一スキルタイプの加算**: 同じ `skillType` を持つ複数の `SkillStackEntry` の `effectValue` は加算される。
2. **単位変換**: 加算後の合計値を、スキル定義（`skills.json`）の `valueRoll.unit` に基づき変換する。

#### 単位変換規則

| unit | 変換式 | 例 |
|---|---|---|
| `"percent"` | `value / 100` → ratio | effectValue=6, unit="percent" → 0.06 |
| `"seconds"` | そのまま | effectValue=1.5 → 1.5 秒 |
| `"multiplier"` | そのまま | effectValue=0.15 → 0.15 |
| `"cells"` | そのまま | effectValue=0.5 → 0.5 セル |
| `"flat"` | そのまま | effectValue=1 → 1 |

#### スキルタイプと出力フィールドの対応

| SkillType | 出力フィールド | unit |
|---|---|---|
| `movement_speed_boost` | `movementSpeedBoostRatio` | percent |
| `detonate_cooldown_reduction` | `detonateCooldownReductionSec` | seconds |
| `exp_gain_boost` | `expGainBoostRatio` | percent |
| `combo_multiplier_boost` | `comboMultiplierBonus` | multiplier |
| `erosion_cooldown_increase` | `erosionCooldownIncreaseRatio` | percent |
| `item_drop_rate_boost` | `itemDropRateBoostRatio` | percent |
| `item_pickup_range_boost` | `itemPickupRangeBoostCells` | cells |
| `item_slot_increase` | `itemSlotIncreaseCount` | flat |
| `cp_detection_range_boost` | `cpDetectionRangeBoostCells` | cells |
| `erosion_forewarning` | `erosionForewarningSec` | seconds |
| `death_item_keep_chance` | `deathItemKeepChanceRatio` | percent |
| `wasteland_speed_reduction` | `wastelandPenaltyReductionRatio` | percent |
| `respawn_time_reduction` | `respawnReductionSec` | seconds |
| `chord` | `chordOwned = true` | （boolean、effectValue 無視） |

#### デフォルト値

スキルスタックが空の場合、すべての数値フィールドは `0`、`chordOwned` は `false` を返す。

#### エラー条件

- スキル定義（`skills.json`）に存在しない `skillType` がスタック内にある場合、エラーを送出する。

#### 速度計算との統合例

`MovementSpeedBoost(effectValue=6)` → unit="percent" → `6/100 = 0.06`
→ `speed = 2 × (1 + 0.06) = 2.12`

`MovementSpeedBoost(effectValue=2)` + `MovementSpeedBoost(effectValue=6)` → 合計 `8`
→ `8/100 = 0.08` → `speed = 2 × (1 + 0.08) = 2.16`（荒地・ダッシュなし時）

---

### § 経験値計算詳細

#### Dig EXP

セル掘削による EXP 獲得量:

```
digExp = floor(revealedCellCount × baseExpPerCell × (1 + expGainBoostRatio))
```

- `baseExpPerCell`: 設定値（デフォルト: `1`）
- `revealedCellCount`: フラッドフィルにより開示されたセル数
- `expGainBoostRatio`: スキル集約から得られるEXPブースト比率
- `floor`: 小数点以下切り捨て

#### Detonate Combo EXP

管理爆発チェーンによる EXP 獲得量:

```
comboExp = floor(dangerousMineCellsConverted × baseExpPerCell × comboMultiplier × (1 + expGainBoostRatio))
```

- `dangerousMineCellsConverted`: 爆発により変換された危険地雷セル数
- `comboMultiplier`: コンボ倍率（初期値 `progression.comboMultiplierBase = 1.0`、チェーンごとに `+progression.comboMultiplierPerChain = 0.1`）

#### 境界条件

- `revealedCellCount = 0` → `digExp = 0`（ブースト比率に関わらず）
- `dangerousMineCellsConverted = 0` → `comboExp = 0`（コンボ倍率・ブースト比率に関わらず）

---

### § レベルアップ詳細

#### レベルアップ必要 EXP

レベル `L` からレベル `L+1` に昇格するために必要な EXP:

```
requiredExp(L) = floor(levelExpBase × levelExpGrowth ^ (L − 1))
```

- `levelExpBase`: デフォルト `100`
- `levelExpGrowth`: デフォルト `1.5`（※テストファイルでは 1.3 または 2.0 を使用）

#### レベル進行アルゴリズム

入力: `currentLevel`, `currentExp`, `gainedExp`
出力: `newLevel`, `totalExp`, `leveledUpCount`

```
totalExp = currentExp + gainedExp
leveledUpCount = 0
newLevel = currentLevel

while totalExp >= requiredExp(newLevel + 1):
    totalExp -= requiredExp(newLevel + 1)
    newLevel += 1
    leveledUpCount += 1

return { newLevel, totalExp, leveledUpCount }
```

#### 状態遷移モデル

- EXP はフロア遷移時にリセットされない（累積モデル）。
- 1回の `gainedExp` 加算で複数レベルアップが発生しうる。
- 余剰 EXP は次のレベルに繰り越される。
- EXP が次レベルの必要量未満の場合、レベルは変化せず `totalExp` にそのまま保持される。

---

### § フラッドフィル（BFS 開示）詳細

#### 前提条件

- 開示対象は `CellType.SafeMine` のみ。`CellType.DangerousMine`、`CellType.Safe`、その他のセルタイプは開示されない。
- 開示されたセルは `CellType.SafeMine` から `CellType.Safe` に変換される。

#### アルゴリズム

1. 開始セルが `CellType.SafeMine` でない場合、空の結果を返す（開示なし）。
2. 開始セルを `Safe` に変換し、開示リストとキューに追加する。
3. キューから順にセルを取り出す:
   a. そのセルの `adjacentMineCount ≠ 0` の場合、そのセルからの拡散をスキップする（そのセル自体は既に開示済み）。
   b. `adjacentMineCount = 0` の場合、8近傍の各セルについて:
      - セルがグリッド範囲内かつ `CellType.SafeMine` であれば、`Safe` に変換し開示リスト・キューに追加する。

#### 不変条件

- **入力グリッド不変**: 入力として渡されたグリッドは一切変更されない。出力は常にクローン（ディープコピー）されたグリッドである。
- **冪等性**: 既に `CellType.Safe` のセルを開始点にした場合、開示リストは空で、出力グリッドは入力と等しい（ただし異なるオブジェクト参照）。
- **DangerousMine 不可侵**: `CellType.DangerousMine` は拡散により開示・変換されることはない。
- **非ゼロセルの境界性**: `adjacentMineCount > 0` の `SafeMine` セルは開示されるが、そこからの拡散は行われない（境界として機能する）。

#### 境界条件

- 1×1 グリッドの SafeMine: 開始セル 1 つのみ開示。
- 全近傍が DangerousMine: 開始セル 1 つのみ開示。
- 全セルが `adjacentMineCount=0` の SafeMine: 全セルが開示される。
- グリッド端: 座標が `0 ≤ x < width`, `0 ≤ y < height` の範囲外はスキップ（ラッピングなし）。

---

### § 8近傍・4近傍の走査順序

#### 4近傍（getNeighbors4）

走査順序は **N → E → S → W**（時計回り、北起点）:

```
offsets_4 = [(0,-1), (1,0), (0,1), (-1,0)]
```

#### 8近傍（getNeighbors8）

走査順序は **N → NE → E → SE → S → SW → W → NW**（時計回り、北起点）:

```
offsets_8 = [(0,-1), (1,-1), (1,0), (1,1), (0,1), (-1,1), (-1,0), (-1,-1)]
```

#### 境界処理

- 隣接セルの座標が `0 ≤ x < grid.width` かつ `0 ≤ y < grid.height` の範囲外の場合、その方向は結果に含めない。
- グリッド端のラッピング（トーラス接続）は行わない。

---

### § AABB コリジョン解決

#### 衝突判定

2 プレイヤー間の衝突は以下の条件で発生する:

```
overlapX = radius.x × 2 − |right.x − left.x|
overlapY = radius.y × 2 − |right.y − left.y|

衝突あり ⟺ overlapX > 0 かつ overlapY > 0
```

- `radius` は全プレイヤー共通の AABB 半径ベクトル `{x, y}`。

#### 解決アルゴリズム

反復法により全ペアの衝突を解消する:

1. 最大反復回数: `max(1, N² × 4)` （N = プレイヤー数）
2. 各反復で全プレイヤーペ `(i, j)` where `i < j` を評価:
   a. 衝突なし → スキップ
   b. **最短軸の選択**: `overlapX ≤ overlapY` の場合は X 軸で押し出し、それ以外は Y 軸で押し出す
   c. **押し出し方向**: 差分が正なら正方向、負なら負方向。**差分が 0 の場合は正方向（`+1`）を選択**する（決定的タイブレーカー）。
   d. **押し出し量**: オーバーラップの半分を各プレイヤーに均等分配
3. 反復中に一切の変更が発生しなかった場合、早期終了する。

#### タイブレーカー規則

- **X 軸 vs Y 軸**: `overlapX ≤ overlapY` → X 軸（X 軸が優先）
- **完全重複** (`dx=0, dy=0`): X 軸が選択され、direction=+1 → left は左へ、right は右へ分離

#### 出力

- 移動が発生したプレイヤーのみを `Map<sessionId, Vec2>` として返す。
- 位置が変化しなかったプレイヤーは結果に含まれない。

---

### § ドロップ判定詳細

#### 判定フロー

```
1. ドロップ判定: rng.nextFloat() を呼び出す
   - result >= dropRate → ドロップなし (null)
   - result < dropRate  → アイテム選択へ
2. アイテム選択（重み付きランダム）:
   a. itemPool から weight > 0 のエントリのみをフィルタ
   b. フィルタ結果が空 → ドロップなし (null)
   c. totalWeight = 全エントリの weight 合計
   d. totalWeight ≤ 0 → ドロップなし (null)
   e. roll = rng.nextFloat() × totalWeight を計算
   f. cumulativeWeight を 0 から加算し、roll < cumulativeWeight となった最初のエントリを選択
   g. roll がどのエントリでも条件を満たさない場合、最後のエントリをフォールバックとして選択
3. 選択されたアイテムの定義が itemsConfig に存在しない → エラーを送出
4. 結果: { itemType: 選択されたアイテムID, stackCount: 1 }
```

#### RNG 消費パターン

- ドロップ判定失敗時: RNG 1 回消費（ドロップ判定のみ）
- ドロップ判定成功時: RNG 2 回消費（ドロップ判定 + アイテム選択）

#### deadPlayerExists パラメータ

現時点では `deadPlayerExists` は使用されない（Phase B で経済設計と合わせて実装予定）。TODO(Phase-B): 実装。

---

### § 向き（Facing）解決詳細

#### `resolveFacing8` — 移動ベクトルから Facing8 へのマッピング

入力: `{ previousFacing: Facing8, vx: number, vy: number }`
出力: `Facing8`

1. **零ベクトル** (`vx === 0 && vy === 0`) → `previousFacing` をそのまま返す（向き不変）
2. **非零ベクトル** → `atan2(vy, vx)` で角度を算出し、π/4 (45°) ごとのセクターに丸める
   - セクター計算: `sector = round(atan2(vy, vx) / (π/4))`
   - 正規化: `normalizedSector = ((sector % 8) + 8) % 8`
3. セクター→Facing8 対応表（角度基準: 0 = 東、反時計回り）:

| normalizedSector | Facing8 | 角度範囲（概算） |
|---|---|---|
| 0 | E | -22.5° ~ 22.5° |
| 1 | SE | 22.5° ~ 67.5° |
| 2 | S | 67.5° ~ 112.5° |
| 3 | SW | 112.5° ~ 157.5° |
| 4 | W | 157.5° ~ 202.5° |
| 5 | NW | 202.5° ~ 247.5° |
| 6 | N | 247.5° ~ 292.5° |
| 7 | NE | 292.5° ~ 337.5° |

#### `projectFacingToAxis4` — Facing8 から Facing4 への射影

対角線方向を最近接の主方位（cardinal direction）へ射影する:

| 入力 (Facing8) | 出力 (Facing4) |
|---|---|
| N, NW | N |
| NE, E | E |
| SE, S | S |
| SW, W | W |

> **設計意図**: 対角線は「右寄り」に射影する（NW→N ではなく N/NW→N、NE→E ではなく NE/E→E）。

---

### § 最前線（Frontline）抽出・選択詳細

#### `extractFrontlineCoords` — 最前線座標の抽出

定義: **安全マス（Safe）のうち、周囲8近傍にハザード（SafeMine / DangerousMine / Wasteland）が存在するマス**

アルゴリズム:
1. グリッドを線形走査（index 0 → width×height-1）
2. 各セルが `CellType.Safe` かつ 8近傍にハザードが存在する場合 → frontline に追加
3. ハザード判定: `isFrontlineHazard(t) = t ∈ {SafeMine, DangerousMine, Wasteland}`
4. 出力配列は走査順（index 昇順）を保持

#### `selectFrontlineTargets` — 最前線からのターゲット選択

入力: `{ grid, frontline, targetCount, widthCap, rng }`
出力: `GridCoord[]`（選択された座標リスト）

**事前条件**: `targetCount > 0 && widthCap > 0`。満たさない場合は空配列を返す。

アルゴリズム:
1. **正規化**: 入力 frontline から既選択・除外済み・非Safeマスを除去
2. **シード選択**: 正規化済み frontline から `rng.nextInt(frontline.length)` で1マスをランダム選択
3. **連結成分収集**: シードを起点に、正規化 frontline 内で8近傍連結しているマス群を BFS で収集
4. **幅制限選択**: 連結成分内でシードからの列（x座標）拡張順に選択:
   - 列の順序: シード列 → 左1列 → 右1列 → 左2列 → 右2列 → …（交互）
   - 各列内: シードに最も近い y 座標順（|dy| 昇順、同値時 y 昇順）
   - 幅制約: 選択範囲の `(maxX - minX + 1) > widthCap` になった時点で打ち切り
5. **フロントライン更新**: 未選択の現在 frontline メンバーを「除外」マーク
6. **新 frontline 構築**: 全グリッド再走査で、選択済みでも除外でもない Safe マスのうち、選択済みまたはハザードが8近傍に存在するものを新 frontline とする
7. **反復**: targetCount に達するか、frontline が空になるか、探索回数が targetCount を超えるまで 2–6 を繰り返し

**不変性**: 入力 grid および frontline は変更しない。

---

### § インベントリ操作詳細

#### スロット選択ポリシー

インベントリ操作は以下の優先順位でスロットを探索する:

1. **スタック可能アイテムの追加** (`addItemToInventory`):
   - **第一優先**: 同一 itemType を持つスロットを先頭（index 0）から探索 → `stackCount + 追加数 ≤ maxStack` ならそこに加算（`usedNewSlot = false`）
   - **第二優先**: 空スロット（`itemType === null`）を先頭から探索 → 新規格納（`usedNewSlot = true`）
   - どちらも見つからない → 失敗（スロット満杯）

2. **スタック不可アイテム** (`stackable = false`):
   - 常に新規スロットを消費する（既存スタックへの加算を行わない）

3. **`canAddItemToInventory`**:
   - 上記と同じロジックで可能性を判定のみ行う（状態変更なし）

#### 消費 (`consumeInventorySlot`)

- `count` 指定あり: `stackCount -= count`。結果 ≤ 0 ならスロットクリア（`itemType = null, stackCount = 0`）
- `count` 省略: スロット全体をクリア

#### 破棄 (`discardInventorySlot`)

- 対象スロットをクリアし、破棄されたアイテム情報（`{ itemType, stackCount }`）を返す
- 空スロットの破棄はエラー

#### 不変性

すべての操作は**入力 inventory の shallow copy** を作成して操作する。元の inventory オブジェクトは変更しない。

---

### § Reward Offer Generation 詳細

#### 1. 発火条件

- 報酬オファーは、EXP 加算後のレベル進行解決で `leveledUpCount > 0` になった時点で**即時生成**する。
- 1 回の EXP 加算で複数レベルアップした場合、**レベルアップ 1 回につき 1 オファー**を生成する。
- `rewards.json > levelUp.allowOfferCarryOver = true` のため、未受取オファーは持ち越され、同一プレイヤーは複数の保留オファーを同時に持てる。
- 各生成ごとに対象プレイヤーの保留オファー一覧へ 1 件追加し、`PlayerState.pendingRewardCount` は**保留件数そのもの**を表す。
- `reward_offer` は**レベルアップしたプレイヤー本人にのみ** `client.send` で送る。ルーム全体には `level_up` のみ通知する。
- オファーに有効期限は設けない。MVP では**生成後から claim 成功まで失効しない**。再接続時は未受取オファーをそのまま再送してよい。

#### 2. 報酬プール構成

- 1 オファーの目標候補数は `rewards.json > levelUp.optionCount` に従い、**現行設定では常に 3 件**とする。
- アイテム候補母集団は `packages/config/data/rewards.json > itemPool`、スキル候補母集団は `skillPool` を使用する。
- 各エントリは、まず以下のゲートを満たす場合にのみ候補化される。
  - `minFloor` がある場合: `floorNumber >= minFloor`
  - `maxFloor` がある場合: `floorNumber <= maxFloor`
  - `minLevel` がある場合: `playerLevel >= minLevel`
  - `maxLevel` がある場合: `playerLevel <= maxLevel`
- フロア番号は上記 `minFloor` / `maxFloor` のみで候補可否に影響する。**stageId による報酬プール分岐は行わない**。
- 現行データ例:
  - `ItemType.Bridge` は `minFloor: 2`
  - `ItemType.ForceIgnition` は `minFloor: 3`
  - `ItemType.MineRemoverHigh` と `SkillType.Chord` は `minFloor: 5`
  - `ItemType.NineLives` は `minLevel: 3`
  - `SkillType.DetonateCooldownReduction` と `SkillType.ItemSlotIncrease` は `minLevel: 2`
- ゲート通過後の item / skill は 1 つの重み付き候補列へ正規化し、**1 オファー内で item と skill は混在してよい**。
- 除外後の有効候補数が 3 未満の場合、`options.length` はその有効候補数とし、重複やダミー値で 3 件に埋めない。

#### 3. 除外規則（この順で適用）

1. **Full inventory exclusion**
   - `type: "item"` 候補に対して適用する。
   - 「インベントリ満杯」とは、`InventoryUpdatedEvent.maxSlots` の範囲で利用中の全スロットに空きがなく、かつ対象 `ItemType` を既存スタックへ加算できない状態を指す。
   - 判定は `§ インベントリ操作詳細` の `canAddItemToInventory` と同一契約で行う。
   - したがって、空き枠がなくても、同一 `itemType` の既存スロットに `stackCount + 付与量 <= items[itemType].maxStack` で積める場合は除外しない。
   - 例: `ItemType.Dash` は `stackable: true`, `maxStack: 99` なので、満杯でも既存 `Dash` が 98 個なら候補に残り、99 個到達済みで空き枠がなければ候補から除外する。
2. **Stack limit reached**
   - `type: "skill"` 候補に対して適用する。
   - 現在スタック数は、当該 `SkillType` を持つ `SkillStackEntry` の**件数**で数える。`effectValue` の合計値では数えない。
   - `skills[skillType].stackLimit === 0` は無制限を意味し、この除外を行わない。
   - `stackLimit > 0` かつ現在スタック数 `>= stackLimit` の場合は除外する。
   - 例: `SkillType.ItemSlotIncrease` は `stackLimit: 7`、`SkillType.Chord` は `stackLimit: 1`。
3. **Chord uniquePerRun**
   - `SkillType.Chord` は `uniquePerRun: true` であり、**1 ラン中に 1 回しか出現してはならない**。
   - サーバーは run-level の `uniqueRewardSet`（server-only 状態）を持ち、`SkillType.Chord` を含むオファーを生成した時点でこの集合へ登録する。
   - 以後、そのランでは未受取・既受取を問わず `SkillType.Chord` を全プレイヤーの将来オファー候補から除外する。
4. **Duplicate option prevention**
   - 同一オファー内で同じ候補を 2 回出してはならない。
   - `type: "item"` は `itemType` が同じなら重複、`type: "skill"` は `skillType` が同じなら重複とみなす。
   - したがって、同一 `SkillType` を `effectValue` だけ変えて 2 枠提示することも禁止する。

#### 4. オプション生成アルゴリズム

1. `itemPool` / `skillPool` から floor / level ゲートを満たすエントリを抽出する。
2. 上記の除外規則を順に適用して有効候補列を作る。
3. item / skill を 1 つの候補列へ正規化し、各エントリの `weight` を共通の重みとして扱う。
4. `options.length < optionCount` かつ候補列が空でない間、以下を繰り返す。
   - `totalWeight` を計算する。
   - `roll = rng.nextFloat() * totalWeight` を 1 回消費し、累積重みで 1 候補を選ぶ。
   - 選ばれた候補を `RewardOption` へ具体化する。
   - 具体化した候補と同一の item / skill は候補列から取り除く（オファー内重複禁止）。
5. `type: "item"` の具体化:
   - `ItemRewardOption = { type: "item", itemType, stackCount: 1 }`
   - 現行 `rewards.json` では報酬アイテムの付与数は全て 1 とする。
6. `type: "skill"` の具体化:
   - `SkillRewardOption = { type: "skill", skillType, effectValue }`
   - `effectValue` は `skills.json > valueRoll` から決定する。
   - `min === max` の場合は固定値を使い、追加 RNG は消費しない。
   - `min !== max` かつ `min`, `max` がともに整数の場合は `rng.nextInt(max - min + 1) + min` で**両端含み一様整数抽選**する。
   - それ以外は `min + rng.nextFloat() * (max - min)` で**連続一様抽選**する。
   - 例: `SkillType.RespawnTimeReduction` は 1〜3 秒の整数抽選、`SkillType.DetonateCooldownReduction` は 0.5〜1.0 秒の連続抽選。
- 重みは rarity 名ではなく `RewardPoolEntry.weight` の数値のみを使う。現行 `rewards.json` では全エントリ `weight: 1` のため、同時点で有効な候補同士は等確率で選ばれる。
- `offerId` は `claim_reward` と照合する**一意文字列**で、形式は小文字ハイフン区切り UUID v4 (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) とする。`offerId` 生成は gameplay RNG の消費に含めない。
- `options` の配列順は上記抽選順そのものであり、`ClaimRewardPayload.optionIndex` はこの順序を参照する。

#### 5. `reward_offer` ペイロード構造

- `reward_offer` の正式 payload は既存定義どおり次のみとする。

```ts
export interface RewardOfferEvent {
  offerId: string;
  options: RewardOption[];
}
```

- 各 option の正式 shape:

```ts
type RewardOption =
  | { type: "item"; itemType: ItemType; stackCount: number }
  | { type: "skill"; skillType: SkillType; effectValue: number };
```

- `displayName` / `description` / `playerId` / `createdAt` / `expiresAt` は `reward_offer` payload に含めない。
- クライアント表示に必要な名称・説明は `itemType` / `skillType` をキーに `packages/config/data/items.json` / `skills.json` を参照して解決する。

---

### § Reward Apply 詳細

#### 1. `claim_reward` の検証順序

- `claim_reward` は**保留オファー確定専用**コマンドであり、新規オファー生成は行わない。
- 送信者は接続中クライアントであればよく、`PlayerLifeState.Alive` であることは要求しない。Ghost 中でも claim してよい。
- 検証は必ず以下の順で行う。
  1. 当該プレイヤーの保留オファー件数が 0 → `CLAIM_NO_PENDING_REWARD`
  2. `offerId` と一致する保留オファーが存在しない → `CLAIM_INVALID_OFFER_ID`
  3. `optionIndex` が `0 <= optionIndex < offer.options.length` を満たさない → `CLAIM_INVALID_OPTION`
  4. 選択された `RewardOption` を**現在の状態**で再検証し、適用不能なら `CLAIM_INVALID_OPTION`
- オファーの有効期限はないため、MVP に「expired」エラーケースは存在しない。
- 既に claim 済みのオファーは保留一覧から削除済みである。
  - その結果、再送時の扱いは上記 1 または 2 に従う。
- 検証失敗時、オファーは消費されず保留のまま残る。

#### 2. `type: "item"` 適用規約

- item 報酬は `§ インベントリ操作詳細` の `addItemToInventory` 契約をそのまま使って適用する。
- 適用入力は `itemType = selectedOption.itemType`, `stackCount = selectedOption.stackCount` とする。
- スロット探索順序:
  1. `items[itemType].stackable === true` かつ既存同種スロットへ全量積める場合、その先頭スロットへ加算する。
  2. それが不可能なら、先頭の空スロットへ全量を新規格納する。
  3. どちらも不可能なら適用失敗として `CLAIM_INVALID_OPTION`。
- `usedNewSlot` の意味:
  - 既存スタックへ加算した場合 `false`
  - 新規スロットを消費した場合 `true`
- `items[itemType].stackable === false` のアイテムは、同一 `itemType` の既存所持があっても積まず、常に新規スロットを要求する。
- `maxStack` 超過時の扱い:
  - **部分加算や自動分割は行わない**。
  - 既存スタックに全量入らない場合はそのスタックを使わず、空スロットへ全量を入れられるかだけを見る。
  - 空スロットも無い場合は claim を拒否する。
- 現行の報酬 item は `stackCount: 1` 固定である。
- 例:
  - `ItemType.Dash` (`maxStack: 99`) を 98 個所持中に claim → 同一スロットが 99 になり `usedNewSlot = false`
  - `ItemType.Dash` を 99 個所持中で空き枠なし → `CLAIM_INVALID_OPTION`
- item 報酬適用成功時は、更新後 inventory を使って本人へ `inventory_updated` を private send する。

#### 3. `type: "skill"` 適用規約

- skill 報酬は既存スキルを上書きせず、`SkillStackEntry` を **1 件 append** して表現する。

```ts
type SkillStackEntry = {
  skillType: SkillType;
  effectValue: number;
};
```

- append 前に、`skills[skillType].stackLimit` と現在件数を比較して再検証する。
  - `stackLimit === 0` は無制限
  - `stackLimit > 0` かつ現在件数 `>= stackLimit` の場合は `CLAIM_INVALID_OPTION`
- `SkillType.Chord` は `stackLimit: 1` かつ `uniquePerRun` であり、**そのオファーが run-level の唯一予約済み Chord オファーである場合にのみ claim できる**。
- `effectValue` は offer 生成時に確定した値をそのまま保存し、claim 時に再抽選しない。
- claim 後のゲーム内効果は `aggregateSkillModifiers` による合算結果で即時反映される。
- スキルはすべてパッシブであり、claim 時に active / passive 分岐は行わない。
- `SkillType.ItemSlotIncrease` のように `InventoryUpdatedEvent.maxSlots` を変化させるスキルを claim した場合は、更新後 `maxSlots` を反映するため `inventory_updated` を private send する。
- それ以外の skill claim 成功時は、専用の success event は送らない。

#### 4. claim 成功後の状態更新

- claim 成功時のみ、対象オファーを保留一覧から削除し、`PlayerState.pendingRewardCount` を **1 減算**する。
- 1 つの `offerId` から claim できるのは 1 回のみであり、同一オファーの複数 option を同時取得することはできない。
- `claim_reward` 自体でスコアは変動しない。`score_updated` を送る条件にもならない。
- 成功時に送るイベントは以下のみとする。
  - item 報酬または `SkillType.ItemSlotIncrease` claim に伴う `inventory_updated`（private）
  - それ以外は public/private ともに追加イベントなし

---

### § Floor Score 詳細

#### 1. `floorExp` の定義

- `floorExp` は、**そのフロア開始後からフロアクリア確定までに、ルーム全体で実際に加算された EXP 量の総和**である。
- 集計対象は `exp_gained.amount` の実加算値であり、現在の `ExpSource` では以下の両方を含む。
  - `ExpSource.Dig`
  - `ExpSource.DetonateCombo`
- `floorExp` は**プレイヤー個別値ではなくチーム共有値**である。
- `PlayerState.exp` の現在値（レベルアップ後の繰越残量）とは無関係であり、累積 total EXP でもない。
- `floorExp` は `next_floor_started` の開始時に 0 へリセットし、フロアごとに独立集計する。
- 例: 同フロア中に A が Dig で 40 EXP、B が Detonate Combo で 15 EXP を得たなら、そのフロアの `floorExp = 55`。

#### 2. `calculateFloorScore` の正式計算式

- 入力:
  - `floorExp`
  - `clearTimeSeconds`
  - `config.scoring`
- `clearTimeSeconds` は `FloorState.floorStartedAt` から、最後の `cp_collected` によりフロアクリアが確定した時刻までの経過秒数とする。
  - すなわち `clearTimeSeconds = FloorClearedEvent.clearTimeMs / 1000`
  - `calculateFloorScore` への入力前提として `clearTimeSeconds > 0` を要求する。
- タイムボーナス係数は以下で決定する。

```
timeBonusMultiplier = max(
  config.scoring.minimumTimeBonusMultiplier,
  config.scoring.timeBonusBaseSeconds / clearTimeSeconds,
)
```

- 現行設定では `timeBonusBaseSeconds = 600`, `minimumTimeBonusMultiplier = 1.0` である。
- したがって、クリアが速いほど係数は大きく、遅いほど 1.0 に近づく。減衰関数は**線形ではなく反比例（inverse）**である。
- フロアスコアは以下で確定する。

```
floorScore = round(floorExp × timeBonusMultiplier)
```

- 丸めは `config.scoring.roundingMode = "round"` に従い、**四捨五入**を行う。
- 例:
  - `floorExp = 120`, `clearTimeSeconds = 300` → `timeBonusMultiplier = 2.0` → `floorScore = 240`
  - `floorExp = 120`, `clearTimeSeconds = 900` → `timeBonusMultiplier = 1.0` → `floorScore = 120`

#### 3. スコア更新タイミング

- `score_updated` は**フロアクリア確定直後**に送る。休憩フェーズ開始や次フロア開始まで待たない。
- イベント順序は以下で固定する。
  1. 最後の `cp_collected`
  2. `floor_cleared`
  3. `floorExp` と `clearTimeSeconds` から `floorScore` を計算
  4. `GameState.totalScore += floorScore`
  5. `score_updated`
  6. その後、通常のフロアクリア遷移（タイマー停止、地雷原消滅、保留イベントキャンセル、全員復活、休憩フェーズ）
- `totalScore` は**各フロアの `floorScore` の単純総和**である。他の補正値・順位点・ボーナス項目を含めない。
- `score_updated.floorScore` は今回フロアぶんのみ、`score_updated.totalScore` は更新後の累積値を表す。
- `score_updated` はフロアクリア時にのみ送る。`GameOverReason.AllDead` では途中フロアの部分点を精算しない。

#### 4. Floor 10 の特例

- Floor 10 のスコア計算式は他フロアと同一であり、**特別な倍率・固定ボーナス・最終階補正は付けない**。
- Floor 10 クリア時も、まず通常どおり `floorScore` を計算して `totalScore` に加算し、`score_updated` を送る。
- その直後に `game_over` を `reason: GameOverReason.Floor10Cleared` で送る。
- `game_over.finalScore` は `score_updated.totalScore` と同じ値でなければならない。

---

### § Detonate MST 詳細

関連: `detonate` コマンド L376、Detonate イベント L661、Detonate fuse L1905、`CellState` L1571、8近傍・4近傍の走査順序 L2606

本節は `buildDetonatePreview()` と `resolveDetonateChain()` が共有で従う **Rooted Prim-MST + 幅優先連鎖** の正式仕様を定義する。

#### 1. グラフモデル

Detonate が扱うノード集合 `V` は、**評価時点スナップショット**の盤面から次表で決定する。

| ノード種別 | 採用条件 | ノードに含むか | 備考 |
|---|---|---|---|
| 起爆根 (`sourceCoord`) | 点火評価が有効であること | 必ず含む | `flagged=true` の `SafeMine` / `DangerousMine`、または `hasRelayPoint=true` の `Safe` のいずれかでなければ fuse は解決されずキャンセルされる |
| 旗付き地雷ノード | `flagged=true` かつ `cellType ∈ {SafeMine, DangerousMine}` | 含む | `flag` コマンド L342 により旗は地雷セルにのみ置ける |
| Relay ノード | `hasRelayPoint=true` かつ `cellType = Safe` | 含む | Relay Point は `use_item` L456 により Safe セル上にのみ存在する |
| 非旗地雷 | `flagged=false` の `SafeMine` / `DangerousMine` | 含まない | Detonate 経路には参加しない |
| 通常 Safe | `hasRelayPoint=false` の `Safe` | 含まない | 伝播中継しない |
| `Wasteland` / `Hole` | 任意 | 含まない | 点火ノードにも中継ノードにもなれない |

- ノード集合は**重複なし**とし、`sourceCoord` が上記ノード条件を満たしていても 1 ノードとして数える。
- ノード列挙順は **線形インデックス `y * width + x` 昇順**で正規化する。

#### 2. 辺定義と重み

- グラフは `V` 上の**完全無向グラフ**とする。
- 任意の 2 ノード `a`, `b` (`a ≠ b`) の辺重み `w(a,b)` は次式とする。

```
w(a, b) = max(|a.x - b.x|, |a.y - b.y|)
```

- すなわち重みは **Chebyshev 距離**である。
- 辺の有無は中間マスのセル種別に依存しない。`Safe` / `Wasteland` / `Hole` が間にあっても、**ノード間の幾何学距離のみ**で辺を張る。

#### 3. Rooted Prim の根・親・追加順

根付き木 `T` は `sourceCoord` を根として構築する。

**再計算タイミング**:

| タイミング | 使用関数 | 盤面スナップショット |
|---|---|---|
| 点火コマンド受理直後 | `buildDetonatePreview()` | 受理時点の盤面 |
| fuse 終了時（3.0 秒後） | `resolveDetonateChain()` | `scheduledAt <= now` になった tick の盤面 |

- fuse は **3.0 秒固定**（主要パラメータ L110、Detonate fuse L1905）。
- preview 用 MST と fuse 解決用 MST は**別物**であり、fuse 中に旗や Relay Point やセル種別が変化した場合、後者を正とする。
- `resolveDetonateChain()` 開始後は、**その Detonate について MST を再計算しない**。125ms ごとの chain step 中に盤面が変化しても、その Detonate の経路は解決開始時に固定された木と走査順を使い切る。

Prim の各選択は次の辞書式タイブレークで完全決定する。

1. **各未訪問ノードの親候補選択**: 既訪問ノード集合 `S` に対し、未訪問ノード `u` の親 `parent(u)` は `S` 内で `tuple = (w(parent,u), parentIndex)` が最小のノード。
2. **次に木へ追加する子ノード選択**: 未訪問ノードのうち `tuple = (bestWeight(u), childIndex, parentIndex(u))` が最小のノードを追加する。

ここで:

- `parentIndex = parent.y * width + parent.x`
- `childIndex = u.y * width + u.x`

したがって、同一重みなら **子ノードの線形インデックス昇順**が優先され、同じ子に対する親競合では **親の線形インデックス昇順**で決まる。

#### 4. 伝播順（`provisionalPath` / `remainingPath`）

`T` から実際の連鎖順配列 `path` を次手順で構築する。

1. 幅優先探索（FIFO）を使う。
2. 初期キューは `[root]`。
3. ノード `n` を dequeue したら `path` へ追加する。
4. `n` の子は **子ノード線形インデックス昇順**で queue へ enqueue する。
5. ただし `n` が `SafeMine` の場合、そのノードで枝刈りが発生するため**子を enqueue しない**。
6. `DangerousMine` と Relay ノード（`Safe` + `hasRelayPoint=true`）は子 enqueue を行う。

この `path` の意味をイベントへ次のように写像する。

| 名称 | 定義 |
|---|---|
| `provisionalPath` | preview 構築時点スナップショットから作った `path`。**先頭に `sourceCoord` 自身を含む** |
| `resolvedPath` | fuse 解決時点スナップショットから作った `path`。実際の chain step はこれに従う |
| `remainingPath` | `resolvedPath` から**今回処理したノードを除いた残りの suffix**。chain 中に再計算しない |

- `remainingPath` は `detonate_chain_step` L729 の `coord` 処理**後**の残経路であり、`resolvedPath[i]` を処理した step では `resolvedPath[(i+1)...]` を返す。
- `provisionalPath` / `remainingPath` は**BFS 順を保持する配列**であり、線形インデックス順には並べ替えない。

#### 5. chain step の時刻

- 連鎖速度は **1/8 秒 = 125ms / ノード**（主要パラメータ L111、Detonate fuse L1905）。
- `resolvedPath[i]` の処理時刻は `fuseEndsAt + i * 125ms` とする。
- よって **最初の step（root）は fuse 満了と同時刻、オフセット 0ms** で実行される。以後 125ms ごとに 1 ノードずつ処理する。

#### 6. ノード種別ごとの step 変異

各 step は、対象ノード 1 個に対して次表の処理を行う。

| 処理前セル | ノード条件 | 変異 | 枝の扱い | カウント |
|---|---|---|---|---|
| `DangerousMine` | `flagged=true` または source | `cellType = Safe`、`flagged = false`、`hasRelayPoint = false` | 継続 | `dangerousMineCellsConverted += 1` |
| `SafeMine` | `flagged=true` または source | `cellType = Safe`、`flagged = false`、`hasRelayPoint = false` | **停止** | `safeMineCellsConverted += 1` |
| `Safe` + Relay | `hasRelayPoint=true` | `cellType` は `Safe` のまま、`flagged = false`、`hasRelayPoint = false` | 継続 | 変換数加算なし |

補足:

- `adjacentMineCount` は `Safe` 化後もそのセルの数値として保持してよい。Detonate は `adjacentMineCount` を再計算しない。
- 同一セルに `flagged` と `hasRelayPoint` が同時に立っていた場合、両方とも除去する。
- `cellTypeBefore` は上表の**変異前**セル種別を `detonate_chain_step` に入れる。
- `wasRelayPoint` は変異前の `hasRelayPoint` 値である。

#### 7. Detonate が処理しないセル

次のセルは Detonate の `path` に入らず、chain step でも処理されない。

| セル | 扱い |
|---|---|
| `flagged=false` の `SafeMine` / `DangerousMine` | 完全にスキップ |
| Relay Point のない `Safe` | 完全にスキップ |
| `Wasteland` | 完全にスキップ |
| `Hole` | 完全にスキップ |

したがって、「経路上の旗と Relay Point を除去する」とは、**実際に `path` 上で処理されたノードに付随する `flagged` / `hasRelayPoint` を除去する**ことを意味する。中間マスを線描画のように辿って消す処理は行わない。

#### 8. 同一深度内の順序

同じ BFS 深度に複数ノードが存在する場合、step 順は次で一意に決まる。

1. 親ノードが `resolvedPath` に現れる順
2. 同一親の子同士は **`y * width + x` 昇順**

よって chain step 順序の決定規則は、Detonate コマンド L411 のタイブレークと一致する。

#### 9. fuse キャンセルとの相互作用

`CancellationIndex` により fuse エントリがキャンセルされた場合の仕様は次のとおり。

| キャンセル理由 | 条件 | 結果 |
|---|---|---|
| `source_removed` | source セルが点火源要件を失った | pending `detonate_resolve` を削除し、`detonate_fuse_canceled` を送信 |
| `mine_removed` | source と同一地雷が地雷除去機等で除去された | 同上 |
| `flag_removed` | source が旗付き地雷だったが fuse 中に旗が外れた | 同上 |
| `floor_cleared` | フロアクリアで pending fuse をフラッシュした | 同上 |

- キャンセル時、preview で配った `provisionalPath` は**以後無効**とみなす。サーバーは preview を保持しない。
- キャンセルされた fuse からは `detonate_chain_step` / `detonate_resolved` を一切送らない。
- fuse キャンセルは**解決開始前**にのみ起こる。最初の chain step 開始後に部分ロールバックは存在しない。

#### 10. 決定性と不変条件

- Detonate MST / path 構築は **RNG を一切消費しない**。
- 「同一入力」とは、少なくとも次が完全一致することをいう。
  - `grid.width`, `grid.height`
  - 各セルの `cellType`, `adjacentMineCount`, `flagged`, `hasRelayPoint`, `erosionWarning`
  - `sourceCoord`
- 上記が一致する 2 つの入力では、`provisionalPath`、`processedCells`、`remainingPath`、変換数は常に一致しなければならない。
- `buildDetonatePreview()` / `resolveDetonateChain()` は **入力グリッドを直接変更しない**。返り値 `updatedGrid` が必要な場合はクローンに対して変異を適用する。

---

### § Unmanaged Explosion BFS 詳細

関連: `dig` コマンド L300、管理外爆発イベント L790、管理外爆発連鎖 L1935、`item_destroyed` L1256、8近傍・4近傍の走査順序 L2606、`CellState` L1571

本節は `triggerUnmanagedExplosion()` と `resolveUnmanagedChainStep()` が従う **即時爆発 + BFS 連鎖** の正式仕様を定義する。

#### 1. 発火条件と震源

- 管理外爆発は、`dig` L300 が受理され、対象セルの**処理前 `cellType = DangerousMine`** であった場合にのみ発生する。
- リーチ外・対象セル不正・非生存・非 Playing フェーズなどで `dig` が拒否された場合、管理外爆発は発生しない。
- 震源 `epicenterCoord` は**誤掘りした `DangerousMine` の座標そのもの**である。
- 最初の爆発（深度 0）は `dig` 処理の同 tick で即時適用し、`unmanaged_explosion_triggered` L792 を送る。

#### 2. 爆風・荒地化半径

各爆発ノード `c` に対し、影響座標は次の 2 集合で定義する。いずれも**グリッド内座標のみ**を採用し、重複を除去したうえで **線形インデックス昇順**に正規化する。

| 名称 | 定義 | 中心含有 |
|---|---|---|
| `blastCoords` | `max(|dx|, |dy|) <= 1` | 含む |
| `wastelandCoords` | `|dx| + |dy| <= 2` | 含む |

- `blastCoords` は **Chebyshev 半径 1**、`wastelandCoords` は **Manhattan 半径 2**。
- 常に `blastCoords ⊆ wastelandCoords` である。
- **震源セル自身は `blastCoords` と `wastelandCoords` の両方に必ず含まれる。**

#### 3. BFS 隣接定義

- BFS の「隣接 DangerousMine」とは、**現在爆発しているノードの `blastCoords` 内に存在する、未訪問の `DangerousMine` セル**を指す。
- したがって BFS の隣接判定は **8 方向（Chebyshev 距離 1）**である。
- `wastelandCoords` に含まれていても `blastCoords` に入っていない `DangerousMine` は、その step からは連鎖しない。
- 自分自身（現在爆発中の座標）は隣接候補から除外する。

#### 4. 初期キュー状態

深度 0 の爆発適用後、初期キュー `Q` は次で構築する。

1. source の `blastCoords` から、source 自身を除く `DangerousMine` を抽出する。
2. **線形インデックス昇順**で整列する。
3. 各座標を `chainDepth = 1` として FIFO キューへ enqueue する。

初期 visited 集合には以下を入れる。

- source 自身
- 初期キューへ入れた全 DangerousMine

これにより同一セルの二重 enqueue を防ぐ。

#### 5. キュー処理アルゴリズム

- データ構造は **FIFO**。
- 1 エントリは `{ coord, chainDepth }` を持つ。
- 連鎖速度は **125ms / dequeue 1 回**である。source の即時爆発を step 0 とし、その後の queue 先頭を 125ms ごとに 1 件ずつ処理する。
- `chainDepth` は**親の `chainDepth + 1`** で増加する。最初の誤掘り爆発は深度 0、初期キューの要素は深度 1。
- DangerousMine は **enqueue 時に visited へ登録**する。dequeue 時登録ではない。
- したがって 1 つの DangerousMine が複数の爆風に同時に入っても、最初に enqueue された 1 回だけ処理される。
- `atOffsetMs` は queue の実 dequeue 順に従い、source を除く 1 件目が 125、2 件目が 250、以後 `125 * dequeueSequence` とする。

#### 6. 1 step 内の厳密な処理順序

深度 0 の初回爆発と、深度 1 以降の `resolveUnmanagedChainStep()` は**同じ順序**で処理する。現在処理ノードを `currentCoord`、その step 開始時の盤面を「処理前スナップショット」と呼ぶ。

1. `blastCoords` / `wastelandCoords` を処理前スナップショットから計算する。
2. `blastCoords` 内の未訪問 `DangerousMine`（`currentCoord` 自身を除く）を `nextDangerousCoords` として抽出し、線形インデックス昇順で queue 末尾へ enqueue する。
3. `wastelandCoords` を線形インデックス昇順で走査し、下表の terrain mutation を適用する。
4. `wastelandCoords` 上の地上ドロップを即時破壊する。
5. **この step で mine / non-mine 状態が変化した座標**の周囲 8 近傍にある `Safe` セルの `adjacentMineCount` を再計算する。
6. 深度 0 なら `unmanaged_explosion_triggered`、深度 1 以上なら `unmanaged_chain_step` を送信する。
7. キューが空になった時点で `unmanaged_explosion_resolved` を送信する。

#### 7. terrain mutation 規則

`wastelandCoords` に属する各セルの変異は次表に従う。

| 条件 | 変異 |
|---|---|
| `coord === currentCoord`（現在爆発している DangerousMine） | 必ず `cellType = Wasteland`、`flagged = false`、`hasRelayPoint = false` |
| その他の `DangerousMine` | **この step では `cellType` を変えない**。ただし `flagged = false`、`hasRelayPoint = false` は適用する |
| `SafeMine` | `cellType = Wasteland`、`flagged = false`、`hasRelayPoint = false` |
| `Safe` | `cellType = Wasteland`、`flagged = false`、`hasRelayPoint = false` |
| 既に `Wasteland` | `Wasteland` のまま。`flagged = false`、`hasRelayPoint = false` |
| `Hole` | 変更しない |

補足:

- 周辺の `DangerousMine` を即座に `Wasteland` 化しないのは、そのセルが後続 queue step の爆発源になるためである。
- 旗と Relay Point の除去規則は `CellState` 補足 L1599 と整合する。

#### 8. `adjacentMineCount` の更新

- `adjacentMineCount` を持つ意味があるのは `Safe` セルのみ（`CellState` L1579）。
- 各 step 後、**この step で mine / non-mine 状態が変化した座標**の周囲 8 近傍にある `Safe` セルだけを再計算する。全盤面再計算は行わない。
- `SafeMine -> Wasteland` と `DangerousMine -> Wasteland` は、どちらも「周囲地雷数を 1 減らしうる変化」である。
- `SafeMine` と `DangerousMine` はいずれも「地雷 1 個」として数えるため、後続 step で `DangerousMine` が爆発するまで、そのセルは近傍 count 上は mine のまま扱われる。

#### 9. 連鎖停止条件

- 停止条件は **FIFO キュー枯渇のみ**であり、最大深度は設けない。
- source 爆発後に `nextDangerousCoords` が 0 件であれば、深度 0 の初回爆発直後に解決完了となる。
- 最終 resolved 状態とは、以下をすべて満たす状態である。
  - queue が空
  - visited 済み DangerousMine はすべて 1 回だけ爆発処理済み
  - 爆発済みノードは `Wasteland`
  - `item_destroyed` 対象ドロップはすべて消去済み

#### 10. 地上ドロップとの相互作用

- `wastelandCoords` に存在した地上ドロップは**その step で即時破壊**する。
- 公開イベントは `item_destroyed` L1256 **のみ**であり、`item_picked_up` を取り消すための別イベントは存在しない。
- 破壊されたドロップに紐づく `item_expiry` は後から発火してはならない。よってサーバーは expiry エントリを同時に無効化する。
- `ItemDestroyReason` は必ず `unmanaged_explosion` とする（`packages/protocol/src/types.ts` L103）。

#### 11. 決定性と不変条件

- 管理外爆発 BFS は **RNG を一切消費しない**。
- 同一入力（`grid` の全セル状態、`epicenterCoord`、queue 内容、visited 内容）が一致するなら、`blastCoords` / `wastelandCoords` / `nextDangerousCoords` / queue 進行結果は常に一致する。
- pure rules 関数は入力グリッドを直接変更せず、返却する `updatedGrid` へ変異を適用する。

---

### § Erosion Conversion 詳細

関連: 主要パラメータ L86、侵食イベント L872、`ErosionState` L1655、侵食タイマー L1959、最前線抽出・選択 L2740、8近傍・4近傍の走査順序 L2606

本節は `planErosionWarning()` と `applyErosionConversion()` が従う **frontline 選定 + 比率変換** の正式仕様を定義する。

#### 1. `widthCap` の権威値

`widthCap` は「1 回の左右探索で選択範囲が取りうる最大横幅（列数）」である。

| 項目 | 仕様 |
|---|---|
| 権威的な設定単位 | **ステージ単位** |
| 設定フィールド | stage の `boardProfile.erosionFrontlineWidthCap` |
| MVP 既定値 | **4** |
| floor 1 の値 | **4** |

- `rules-core` の pure 関数は `widthCap` を**引数として受け取る**。どの数値を渡すかの権威は現在フロアの stage 定義にある。
- stage に明示値がない場合も、MVP では **4** を用いる。
- `widthCap <= 0` は不正値として扱い、`selectFrontlineTargets()` は空配列を返す（§最前線 L2757 と一致）。
- `widthCap` が利用可能な frontline 列数より大きい場合、**存在する分だけ選んで終了**し、埋め草やラップアラウンドは行わない。

#### 2. frontline 抽出の権威定義

frontline 抽出そのものは §最前線 L2740 を正とする。要点のみ再掲すると次のとおり。

- frontline は **`Safe` セルのうち、周囲 8 近傍に `SafeMine` / `DangerousMine` / `Wasteland` のいずれかが存在するセル**である。
- 走査は全盤面を線形インデックス昇順で行い、返却順もその順を保持する。

侵食文脈での補足:

| ケース | 扱い |
|---|---|
| `bridge` により `Hole -> Safe` になったセル | `Safe` であれば frontline 候補になりうる |
| スポーン地点セル | `Safe` であれば除外しない |
| 既存 `Wasteland` | frontline 候補ではないが、warning/convert 対象へ後段で常に加える |

#### 3. warning 対象選定アルゴリズム

`planErosionWarning({ grid, targetCount, widthCap, rng })` は次手順で `targetCoords` を構築する。

##### 3-1. Safe 対象の選定

1. `frontline = extractFrontlineCoords(grid)` を取得する（§最前線 L2740）。
2. `selectedSafeCoords = []`、`selectedKeys = ∅`、`excludedKeys = ∅` で開始する。
3. `currentFrontline = normalize(frontline)` を作る。ここでは以下を除外する。
   - 範囲外座標
   - 現在 `Safe` でない座標
   - 重複座標
   - `selectedKeys` または `excludedKeys` に入っている座標
4. 以後、次の停止条件のいずれかに達するまで pass を繰り返す。
   - `selectedSafeCoords.length >= targetCount`
   - `currentFrontline.length === 0`
   - pass 回数 `>= targetCount`

##### 3-2. 各 pass の手順

各 pass では次を行う。

1. **RNG 消費**: `rng.nextInt(currentFrontline.length)` を **1 回だけ**呼び、seed 1 マスを選ぶ。
2. `currentFrontline` 内で seed と 8 近傍連結している成分を BFS で収集する。
3. その成分を列単位で分解し、列順を次のように固定する。

```
seed.x,
seed.x - 1,
seed.x + 1,
seed.x - 2,
seed.x + 2,
...
```

4. 各列内のセル順は次の辞書式順序とする。
   - seed 自身がその列にあるなら最優先
   - それ以外は `|y - seed.y|` 昇順
   - 同値なら `y` 昇順
   - さらに同値なら `x` 昇順
5. 列を 1 本ずつ採用していく。採用後の横幅 `maxX - minX + 1` が `widthCap` を超える列は**採用せず、その pass を即終了**する。
6. pass 中に採用されたセルを `selectedSafeCoords` へ追加する（既選択重複は無視）。
7. `currentFrontline` のうち今回選ばれなかったセルは、**同一フェーズ内で再探索しない**ため `excludedKeys` へ入れる。
8. まだ `targetCount` に達していなければ、新 frontline を全盤面線形走査で再構築する。新 frontline 条件は以下の両方を満たす `Safe` セル。
   - `selectedKeys` にも `excludedKeys` にも入っていない
   - 周囲 8 近傍に、`selectedKeys` 済みセルまたはハザード（`SafeMine` / `DangerousMine` / `Wasteland`）が存在する

##### 3-3. `targetCoords` の構築

- `selectedSafeCoords` は**上記 pass 順・列順・列内順を保持**する。
- `wastelandCoords` は、warning 計画時点の盤面に存在する全 `Wasteland` を**線形インデックス昇順**で列挙したものとする。
- 最終 `targetCoords` は次の連結とする。

```
targetCoords = selectedSafeCoords ++ wastelandCoords
```

#### 4. RNG 消費と決定性（warning 計画）

- warning 計画で RNG を消費するのは**各 pass の seed 選択 1 回のみ**である。
- よって RNG 消費回数は `0 .. targetCount` 回であり、実際の回数は「成功した pass 数」に等しい。
- 同一入力グリッド・同一 `targetCount`・同一 `widthCap`・同一 RNG 状態からは、常に同一の `targetCoords` を返さなければならない。

#### 5. SafeMine / DangerousMine 変換対象の正規化

`applyErosionConversion({ grid, targetCoords, safeMineRatio, dangerousMineRatio, rng })` は、まず `targetCoords` を次の規則で正規化する。

1. 範囲外座標を除外
2. 重複座標を除外（最初の出現だけ採用）
3. 現在 `cellType ∈ {Safe, Wasteland}` の座標だけを conversion 対象として採用

したがって:

| 現在セル種別 | conversion 対象に含むか | 備考 |
|---|---|---|
| `Safe` | 含む | warning で選ばれた通常対象 |
| `Wasteland` | 含む | 常時 warning/convert 対象 |
| `SafeMine` / `DangerousMine` | 含まない | 本来 warning 計画で入らない。誤入力時も **skip** し、再抽選しない |
| `Hole` | 含まない | 侵食変換しない |

以後、正規化後の件数を `N` とする。

#### 6. 比率から変換数を決める方法

- `safeMineRatio` と `dangerousMineRatio` は、server がそのフェーズの式から解決した**非負整数重み**である。
- MVP の既定値は主要パラメータ L98 の **7:3**。
- 有効条件は `safeMineRatio + dangerousMineRatio > 0`。和が 0 の場合は不正入力とする。

変換数は以下で決定する。

```
sum = safeMineRatio + dangerousMineRatio
exactSafe = N * safeMineRatio / sum
exactDanger = N * dangerousMineRatio / sum
baseSafe = floor(exactSafe)
baseDanger = floor(exactDanger)
remaining = N - baseSafe - baseDanger
```

`remaining` の配分規則:

1. 小数部 `fracSafe = exactSafe - baseSafe`, `fracDanger = exactDanger - baseDanger` を比べる
2. 大きい方へ 1 枠ずつ配る
3. 小数部同値なら **SafeMine を優先**する

結果として `safeMineCount + dangerousMineCount = N` を満たす。

#### 7. ランダム配置アルゴリズム

変換先タイプの座標割り当ては、正規化済み対象配列に対する **Fisher-Yates shuffle** で決定する。

1. 正規化済み対象配列を現在順（`targetCoords` 正規化後の順）で用意する。
2. `for i = N-1 downto 1` の順に次を実行する。
   - `j = rng.nextInt(i + 1)`
   - `coords[i]` と `coords[j]` を swap する
3. shuffle 後の先頭 `safeMineCount` 個を `SafeMine`、残りを `DangerousMine` にする。

したがって:

- conversion 用 RNG 消費回数は **`max(0, N - 1)` 回**である。
- 同一 seed / 同一入力なら、どの座標が `SafeMine` / `DangerousMine` になるかは常に一致する。

#### 8. 各変換セルの mutation

各対象セルには次を適用する。

| 項目 | 変異 |
|---|---|
| `cellType` | 割り当て結果に応じて `SafeMine` または `DangerousMine` |
| `flagged` | `false` |
| `hasRelayPoint` | `false` |
| `erosionWarning` | `false` |
| `adjacentMineCount` | `0` に正規化してよい（地雷セルでは未使用） |

#### 9. `adjacentMineCount` 再計算範囲

- 再計算対象は**全盤面ではなく局所**である。
- 具体的には、今回変換した全座標の**周囲 8 近傍**にある全 `Safe` セルを収集し、重複除去後に `adjacentMineCount` を再計算する。
- `updatedAdjacentCoords` は「再計算した結果、値が実際に変わった `Safe` セル座標」のみを**線形インデックス昇順**で返す。
- `SafeMine` と `DangerousMine` はどちらも「地雷 1 個」として数えるため、`SafeMine` / `DangerousMine` の別は**近傍 count 値には影響しない**。影響するのは「そのセルが地雷化されたか否か」のみである。

#### 10. pause / resume

侵食停止アイテム（`take_a_breath` / `short_break`。`use_item` L465-L466）の効果中は次を満たす。

| 項目 | pause 中の仕様 |
|---|---|
| `ErosionState.active` | `false` |
| 画面上に出ている warning | **即時キャンセル**。`erosion_warning_canceled` を送ったうえで、公開状態の `warningCellKeys` と各セル `erosionWarning` は消す |
| 現在 warning に対応する pending `erosion_convert` | **保持して defer**。対象座標・比率は再抽選しない |
| future の pending `erosion_warn` | **defer**。pause 中に新 warning を開始しない |

resume 時の仕様:

- `ErosionState.active = true` に戻す。
- pause 中に due だった `erosion_warn` / `erosion_convert` は、**再計算や再抽選を行わず**、resume 後の最初の tick で元の `scheduledAt` 順に処理する。
- pause で消した warning を自動再表示しない。したがって、pause 中に保留された `erosion_convert` は resume 後に**追加 warning なしで**実行されうる。

#### 11. floor clear flush

フロアクリア時は、侵食に関して次を**同一フラッシュ処理**として行う。

1. `clearAllErosionWarnings(grid, erosionState)` を現在フロアの `grid` と `erosionState` に対して呼ぶ
2. queue 内の pending `erosion_warn` / `erosion_convert` を全削除する
3. warning が可視状態だった場合のみ、`erosion_warning_canceled` を `reason = floor_cleared` で送る

フラッシュ後の事後条件:

- 全セルで `erosionWarning = false`
- `erosionState.warningCellKeys` は**空**
- そのフロア由来の `erosion_warn` / `erosion_convert` は後続 tick で発火しない

#### 12. 決定性と不変条件

- `planErosionWarning()` と `applyErosionConversion()` は**入力グリッドを直接変更しない**。返却側の `updatedGrid` へ変異を反映する。
- warning 計画と conversion の RNG 消費パターンは本節で定義した回数・順序以外を許さない。
- 同一入力グリッド、同一 `targetCount` / `widthCap` / ratio、同一 RNG 状態からは、`targetCoords`、`convertedSafeMineCoords`、`convertedDangerousMineCoords`、`updatedAdjacentCoords` が常に一致しなければならない。

---

### § Spawn Assignment 詳細

#### `SpawnGroupDefinition` の正式契約

`stages.json` の `spawnGroups` は、各ステージにおける**初期スポーン候補集合**を表す。MVP の正式な 1 要素の形は以下で固定する。

| フィールド | 型 | 必須 | 契約 |
|---|---|---|---|
| `groupId` | `string` | 必須 | ステージ内で一意。空文字不可。グループ順序の決定に使用する。 |
| `coords` | `GridCoord[]` | 必須 | 長さ 1 以上。各要素は整数座標。グループ内重複禁止。 |
| `count` | — | 不使用 | MVP 契約外。入力に含まれても `pickInitialSpawnAssignments` は参照してはならない。 |
| `priority` | — | 不使用 | MVP 契約外。入力に含まれても `pickInitialSpawnAssignments` は参照してはならない。 |
| `id` | — | 不可 | 識別子の正式フィールド名は `groupId` のみとする。 |

ステージ単位の追加制約:

- `spawnGroups.length >= 1` を満たさないステージは不正入力とする。
- 全 `coords` の**ステージ全体での重複は禁止**する。同一座標が複数グループに属してはならない。
- 全 `coords` は `0 ≤ x < grid.width` かつ `0 ≤ y < grid.height` を満たさなければならない。
- 全 `coords` はフロア開始時点の `CellType.Safe` へ対応しなければならない。`SafeMine` / `DangerousMine` / `Wasteland` / `Hole` は不可。
- 1 人のプレイヤーが複数グループに属することはない。割り当て結果は常に **`sessionId -> 1 座標`** である。

#### `pickInitialSpawnAssignments` の入力 / 出力

- 入力:
  - `sessionIds: string[]`
  - `spawnGroups: SpawnGroupDefinition[]`
  - `gridWidth: number`
  - `gridHeight: number`
- 出力:
  - `Map<string, GridCoord>`

#### `pickInitialSpawnAssignments` の決定的アルゴリズム

1. `sessionIds` を**文字列昇順**でソートする。
2. `spawnGroups` を `groupId` の**文字列昇順**でソートする。
3. 各グループの `coords` は**配列 index 順をそのまま使用**する。並べ替えは行わない。
4. 以下の**ラウンドロビン展開**で、グループ群から 1 本のスロット列 `orderedSlots` を構築する。
   - `coordIndex = 0, 1, 2, ...` を昇順に進める。
   - 各 `coordIndex` ごとに、ソート済み `spawnGroups` を先頭から順に走査する。
   - そのグループに `coords[coordIndex]` が存在する場合のみ `orderedSlots` に追加する。
   - すべてのグループで該当 index が存在しなくなった時点で終了する。
5. `sessionIds.length > orderedSlots.length` の場合、**座標重複でのあふれ吸収は行わずエラー**とする。
6. `i` 番目の `sessionId` に `orderedSlots[i]` を割り当てる。

展開例（`g1=[a,b]`, `g2=[c,d,e]`）:

| `orderedSlots` の順序 | 生成元 |
|---|---|
| 1 | `g1.coords[0] = a` |
| 2 | `g2.coords[0] = c` |
| 3 | `g1.coords[1] = b` |
| 4 | `g2.coords[1] = d` |
| 5 | `g2.coords[2] = e` |

境界条件:

- `sessionIds.length = 0` の場合、空 `Map` を返す。
- `sessionIds.length < spawnGroups.length` の場合、後半グループは**空のまま残りうる**。
- 同距離・同価値といった概念は初期スポーン割り当てには存在しない。順序は **`sessionId` 昇順 → `groupId` 昇順 → `coords` 配列 index 順**のみで決まる。

#### `sessionId ↔ GridCoord` 対応の安定性

- 同一フロア・同一 `spawnGroups`・同一 `sessionId` 集合であれば、**入力配列順に関係なく**同じ割り当てを返さなければならない。
- `sessionId` 集合が変化した場合は、その集合全体に対して再計算する。既存プレイヤーの座標維持は保証しない。
- この安定性は**現在フロア内**でのみ保証する。フロア遷移後は次フロアの `spawnGroups` に対して**再計算**する。
- `buildFloorClearTransition` の Step 6 で使用する「初期スポーン位置」は、そのフロア開始時に確定した `spawnAssignments` をそのまま再利用する。フロア途中で再抽選してはならない。
- 座標一意性は、`spawnGroups` のステージ全体重複禁止と、`sessionIds.length <= orderedSlots.length` の 2 条件で保証する。
- `GridCoord` を `PlayerState.x / y` に実適用するときは、セル中心 `(coord.x + 0.5, coord.y + 0.5)` を使用する。

#### `pickMidGameJoinSpawn` の入力 / 出力

- 入力:
  - `grid: GridState`
  - `alivePlayers: PlayerState[]`（`lifeState = PlayerLifeState.Alive` のみを対象とする）
  - `rng`
- 出力:
  - `GridCoord`

#### `pickMidGameJoinSpawn` の選定規則

1. `alivePlayers.length = 0` の場合はエラーとする。
2. `alivePlayers` を `sessionId` 文字列昇順にソートする。
3. `anchorIndex = rng.nextInt(alivePlayers.length)` でアンカーとなる生存プレイヤーを 1 人選ぶ。
4. アンカープレイヤーの現在セルは `anchorCell = { x: floor(player.x), y: floor(player.y) }` とする。
5. 「周囲」は **Chebyshev 距離 2 以下**（5x5 領域）と定義する。
6. 近傍候補の探索順は以下で固定する。
   - 距離 `d = 0 → 1 → 2`
   - 同一距離内では `y` 昇順、同値時 `x` 昇順（行優先）
7. 近傍 `Safe` 候補探索:
   - 条件: in-bounds、`CellType.Safe`、かつ任意の生存プレイヤーの現在セルと一致しない
   - 最初に候補が見つかった距離 `d` の候補集合だけを採用し、`rng.nextInt(candidateCount)` で 1 つ選ぶ
8. 近傍 `Safe` が 1 つもない場合、同じ探索順・同じ占有除外で `CellType.Wasteland` を探索する。
9. 近傍 `Wasteland` もない場合、グリッド全体を行優先（`y` 昇順 → `x` 昇順）で走査し、まず `CellType.Safe`、なければ `CellType.Wasteland` から `rng.nextInt(candidateCount)` で 1 つ選ぶ。
10. `Safe` / `Wasteland` のいずれもグリッド上に存在しない場合はエラーとする。

補足:

- `SafeMine` / `DangerousMine` / `Hole` は途中参加スポーン先として常に不許可。
- 同距離候補のタイブレークは**RNG 抽選**であり、RNG 入力が同一なら出力も同一でなければならない。
- 同一 `grid`・同一 `alivePlayers`・同一 RNG 状態では、`pickMidGameJoinSpawn` は必ず同じ座標を返す。

#### 途中参加時の初期状態（テスト前提）

- 途中参加プレイヤーの `level` は **1**。
- 途中参加プレイヤーの `exp` は **0**。
- 途中参加プレイヤーの `pendingRewardCount` は **0**。
- 途中参加プレイヤーの inventory は**空**。
- 途中参加プレイヤーの skill stack は**空**。
- 途中参加プレイヤーの一時効果（dash / cats_eye / disposable_life / forceIgnition / erosion pause など）は**未付与**。
- `pickInitialSpawnAssignments` / `pickMidGameJoinSpawn` により確定した座標は、いずれも**in-bounds かつ walkable**（`Safe`、fallback 時のみ `Wasteland`）でなければならない。

---

### § Respawn Placement 詳細

#### `pickRespawnPlacement` の入力 / 出力

- 入力:
  - `grid: GridState`
  - `alivePlayers: PlayerState[]`（`lifeState = PlayerLifeState.Alive` のみ）
  - `rng`
- 出力:
  - `spawnCoord: GridCoord`
  - `usedFallbackWasteland: boolean`

#### アンカー選択

- `alivePlayers.length = 0` の場合はエラーとする。
- `alivePlayers` は `sessionId` 文字列昇順にソートしてから扱う。
- `anchorIndex = rng.nextInt(alivePlayers.length)` によりアンカーを 1 人選ぶ。
- アンカー位置のセル化は `anchorCell = { x: floor(player.x), y: floor(player.y) }` とする。
- 同一入力・同一 RNG 状態では、アンカー選択結果も必ず一致しなければならない。

#### 「周囲」の正式定義と探索順

- 「周囲」は **Chebyshev 距離 2 以下**とする。
- 探索順は `pickMidGameJoinSpawn` と同一で、**距離昇順 → 同距離内は `y` 昇順 → `x` 昇順**とする。
- 同距離候補が複数ある場合は、その距離リングの候補集合に対して `rng.nextInt(candidateCount)` を 1 回だけ消費して選ぶ。

#### セル種別フィルタ

| 段階 | 許可セル | 禁止セル | `usedFallbackWasteland` |
|---|---|---|---|
| 第1候補 | `Safe` | `SafeMine`, `DangerousMine`, `Wasteland`, `Hole` | `false` |
| 第2候補 | `Wasteland` | `SafeMine`, `DangerousMine`, `Hole` | `true` |
| 全体 fallback | 近傍に候補がない場合のみ、グリッド全体から `Safe` → `Wasteland` の順で探索 | 同上 | 選ばれたセルが `Wasteland` のとき `true` |

追加制約:

- 任意の生存プレイヤーの現在セルと一致する座標は respawn 候補から除外する。
- `Hole` へのリスポーンは常に禁止する。
- `SafeMine` / `DangerousMine` へのリスポーンは常に禁止する。

#### `pickRespawnPlacement` の完全手順

1. アンカー周囲の `Safe` を探索する。
2. 最初に見つかった距離リングの `Safe` 候補集合から 1 つ選ぶ。
3. `Safe` 候補が 0 件なら、同じ探索規則で `Wasteland` を探索する。
4. 近傍 `Wasteland` も 0 件なら、グリッド全体を行優先で走査し、`Safe` があればその集合から 1 つ選ぶ。
5. グリッド全体の `Safe` も 0 件なら、グリッド全体の `Wasteland` から 1 つ選ぶ。
6. `Safe` / `Wasteland` がどちらも存在しなければエラーとする。

#### Wasteland fallback の厳密条件

- `usedFallbackWasteland = true` になるのは、**最終選択セルの `cellType` が `Wasteland` の場合のみ**である。
- fallback への遷移条件は「近傍 `Safe` 候補が 0 件」であり、試行回数ベースではない。
- `Wasteland` リスポーンに専用 sprite / 専用無敵 / 専用スコア補正は存在しない。
- `Wasteland` リスポーンの追加ペナルティは存在しない。適用される差分は、そのセルが `Wasteland` であることによる**通常の移動速度ペナルティのみ**である。

#### `shortenAllPendingRespawns` / `shortenRespawnSchedule` の契約

サーバー側の一括短縮処理 `shortenAllPendingRespawns` は、各保留 `RespawnEntry` に対して pure 関数 `shortenRespawnSchedule` を適用して再時刻化する。

- トリガー: **蘇生短縮アイテムまたは蘇生短縮効果が実際に発動した瞬間のみ**。
- 非トリガー: 他プレイヤー死亡時 / timer tick / floor clear。
- 対象: その時点で `scheduledAt > now` を持つ**死亡中全プレイヤーの全 `RespawnEntry`**。
- 計算式: `newScheduledAt = max(now, currentRespawnAt - shortenMs)`
- 最小値床: `now`。`now` より前の時刻にはならない。
- 効果は**死亡中全プレイヤーへ均等適用**する。プレイヤーごとの差は許可しない。
- queue 更新は server の責務だが、更新後の `scheduledAt` は上記式と完全一致しなければならない。

#### リスポーン後状態

- 位置は `spawnCoord` のセル中心 `(x + 0.5, y + 0.5)` に配置する。
- `lifeState = PlayerLifeState.Alive` に遷移する。
- `respawnAt = 0` に戻す。
- `player_respawned.spawnCoord` には、実際に配置したセルの `GridCoord` をそのまま送る。
- リスポーン無敵時間は存在しない。
- 死亡時に失った inventory は**復元しない**。死亡後の inventory は空のまま維持する。
- death 確定時に cancel された `effect_expiry` は復元しない。dash / cats_eye / disposable_life / forceIgnition / erosion pause などの一時効果は**非アクティブ**状態で再開する。
- skill stack は死亡・リスポーンで失われない。

---

### § Floor Transition Plan 詳細

#### `buildFloorClearTransition` の入力 / 出力

`buildFloorClearTransition` は、フロアクリア後の**現フロア後始末**と**次フロア開始準備**を 1 つの純粋な遷移計画として返す。

入力:

- `grid`: 現フロア盤面
- `erosionState`: 現フロア侵食状態
- `players`: 現在在籍プレイヤー一覧
- `checkpoints`: 現フロアの CP 一覧
- `timers`: 保留タイマーのスナップショット
- `spawnAssignments`: 現フロア開始時に確定した `sessionId -> GridCoord`
- `nextStage`: 次フロアの `StageDefinition`。Floor10 クリア時は `null` を許可する。
- `config`, `rng`: `nextFloorStartPlan` を同時計算する場合のみ使用する

出力:

- `clearedGrid`: Step 3 適用後の現フロア盤面
- `clearedErosionState`: warning を空にした現フロア侵食状態
- `revivedPlayers`: Step 5 で `Alive` へ戻す `sessionId[]`。**文字列昇順**で返す。
- `repositionBySessionId`: Step 6 で各プレイヤーを戻す `sessionId -> GridCoord`
- `canceledTimerKinds`: 以下**固定順・固定内容**の配列
  1. `"detonate_resolve"`
  2. `"unmanaged_chain"`
  3. `"erosion_warn"`
  4. `"erosion_convert"`
  5. `"respawn"`
  6. `"item_expiry"`
  7. `"effect_expiry"`
  8. `"future_event"`
- `nextFloorStartPlan`: 次フロア開始に必要な生成結果。`nextStage = null` の場合は `null`。

前提条件:

- `checkpoints` は**全件 `collected = true`**でなければならない。1 件でも未回収ならエラーとする。
- `spawnAssignments` は `players` 内の**非 `Disconnected` 全員**に対して存在しなければならない。
- `SimulationLoop` の停止はこの pure 関数の返り値には含めない。これは caller 側の適用責務であり、`canceledTimerKinds` にも含めない。

#### Step Sequence（契約順序・変更内容）

本契約の適用順序は次で固定する。**前後入替は禁止**。

| Step | 処理 | 変更対象 | イベント | エラー条件 |
|---|---|---|---|---|
| 1 | 全 Checkpoint を回収済みとして正規化 | `checkpoints` の `collected` / `collectedBySessionId` | なし（`floor_cleared` は既に送信済み前提） | 未回収 CP があれば即エラー |
| 2 | 全タイマー処理を停止（SimulationLoop 一時停止） | caller 側 runtime | なし | caller が停止しないまま Step 3 以降を適用してはならない |
| 3 | `SafeMine` / `DangerousMine` を全 `Safe` に変換 | `grid` | なし | grid 不正参照 |
| 4 | 保留中タイマーを全キャンセル | queue / `erosionState` / warning 表示 | 必要に応じて `detonate_fuse_canceled`, `erosion_warning_canceled` | timer snapshot 不正 |
| 5 | 全死亡プレイヤーを復活 | `players` | なし | player state 不正 |
| 6 | 各プレイヤーを初期スポーン位置へ配置 | `players` | なし | `spawnAssignments` 欠落 |
| 7 | 休憩フェーズへ遷移 | `GamePhase` | `rest_phase_started` | Step 1〜6 未完了 |
| 8 | 次フロア開始準備 | 次フロア plan | 次フロア適用時に `next_floor_started` | `nextStage` 欠落（Floor10 以外） |

各 Step の厳密仕様:

**Step 1: 全 Checkpoint を回収済みとしてマーク**

- `checkpoints.every(cp => cp.collected === true)` を満たさない場合、以降の Step を一切実行せずエラーとする。
- valid input ではこの Step は**正規化専用**であり、純粋出力の差分を必須としない。

**Step 2: 全タイマーを停止（SimulationLoop 一時停止）**

- これは queue 取消しより先に行う。
- 目的は Step 3〜8 の適用中に detonate / unmanaged / erosion / respawn / expiry が進行しないことの保証である。
- rules-core の返却値はこの停止命令自体を表現しない。caller は本仕様どおりに停止しなければならない。

**Step 3: 地雷原セルを全て通常セルに変換**

- すべての `SafeMine` / `DangerousMine` を `Safe` に変換する。
- 変換対象セルでは `flagged = false`, `hasRelayPoint = false` にする。
- 変換後の盤面に対して、全 `Safe` セルの `adjacentMineCount` を再計算する。結果として現フロアに地雷原が 0 件であれば、全 `Safe` セルの `adjacentMineCount = 0` になる。
- `Wasteland` と `Hole` はこの Step では変換しない。

**Step 4: 保留中のタイマーを全てキャンセル**

- `canceledTimerKinds` は pending 件数に関係なく、前述の 8 種を**固定順で全件**返す。
- `detonate_resolve` をキャンセルした実エントリごとに、server は `detonate_fuse_canceled` を `reason: FloorCleared` で送信しなければならない。
- 侵食 warning が可視状態だった場合、server は `erosion_warning_canceled` を `reason: FloorCleared` で送信しなければならない。
- `clearedErosionState.warningCellKeys` は空配列にする。
- `clearedErosionState.nextWarningAt = 0`, `clearedErosionState.nextConversionAt = 0` とする。
- `grid` 上の全 `erosionWarning` フラグを `false` にする。
- `respawn` cancel により floor clear 時の通常リスポーンタイマーは**無効化**される。復活は必ず Step 5 で行う。

**Step 5: 全死亡プレイヤーを復活**

- 入力時点で `lifeState = PlayerLifeState.Ghost` のプレイヤーのみを対象とする。
- `lifeState = PlayerLifeState.Disconnected` は対象外とする。
- 対象プレイヤーは `lifeState = PlayerLifeState.Alive`, `respawnAt = 0` に変更する。
- `level`, `exp`, `pendingRewardCount` は変更しない。
- inventory は死亡時点の状態をそのまま維持する。通常死亡で空なら空のまま、死亡回避で保持済みならそのまま。
- `player_respawned` は送信しない。floor clear 復活は通常リスポーンとは別経路である。

**Step 6: 各プレイヤーを初期スポーン位置に配置**

- 対象は入力時点で `Disconnected` ではない全プレイヤーとする。
- 使用する座標は**そのフロア開始時に確定した `spawnAssignments`** であり、再抽選しない。
- 位置反映時の `PlayerState.x / y` はセル中心 `(spawnCoord.x + 0.5, spawnCoord.y + 0.5)` とする。
- `repositionBySessionId` は `sessionId` 文字列昇順で解釈可能でなければならない。

**Step 7: 休憩フェーズへ遷移**

- Step 1〜6 が完了するまでは `GamePhase.Rest` にしてはならない。
- Step 7 完了時に `rest_phase_started` を 1 回だけ送信する。
- この時点では `floorNumber` はまだ「クリアしたフロア番号」のままである。

**Step 8: 次フロア開始準備**

- `currentFloor < 10` の場合のみ `nextFloorStartPlan` を生成する。
- `currentFloor = 10` の場合、`nextFloorStartPlan = null` とし、caller は `next_floor_started` ではなく `game_over(reason: Floor10Cleared)` へ進む。
- `nextFloorStartPlan` の適用と `next_floor_started` 送信は、Step 7 完了後にのみ行ってよい。

#### EXP / Level / Skill Stack 持ち越し

- フロア遷移前後で `exp` は**1 も変化してはならない**。
- フロア遷移前後で `level` は**1 も変化してはならない**。
- skill stack は**完全保持**する。
- inventory は floor transition 自体では変更しない。死亡済みプレイヤーの inventory が空なのは**死亡ルールの結果**であり、フロア遷移の副作用ではない。
- `pendingRewardCount` は保持する。

#### `buildNextFloorStartPlan` の契約

入力:

- `nextStage`
- 次フロア参加対象 `sessionIds`
- `playerCount`
- `config`
- `rng`

出力:

- `generatedGrid`
- `checkpoints`
- `spawnAssignments`

規則:

- `generatedGrid` は `nextStage` の `boardProfile`, `holeCoords`, 設定値から再生成する。現フロア `grid` を流用してはならない。
- `checkpoints` は `nextStage.cpCandidateCoords` から再選定する。
- `spawnAssignments` は `nextStage.spawnGroups` に対して **`pickInitialSpawnAssignments` を再実行して決定**する。
- `sessionIds` は caller の入力順ではなく、`pickInitialSpawnAssignments` 内のソート規則に従って扱う。
- `buildFloorClearTransition` が `nextFloorStartPlan` を内包して返す場合と、caller が Step 7 後に `buildNextFloorStartPlan` を別途呼ぶ場合で、**同じ入力なら同じ結果**にならなければならない。

#### エッジケース

| ケース | 契約 |
|---|---|
| プレイヤーが遷移中に切断 | `Disconnected` は `revivedPlayers` に含めない。`repositionBySessionId` の適用対象にも含めない。再接続処理自体は Room Lifecycle の契約に従い、この関数では扱わない。 |
| 侵食 warning / convert が進行中 | Step 2 で進行停止し、Step 4 で `erosion_warn` / `erosion_convert` を cancel し、warning 表示を全消去する。 |
| Detonate fuse が進行中 | Step 4 で `detonate_resolve` を cancel する。実エントリごとに `detonate_fuse_canceled(reason: FloorCleared)` の送信対象となる。 |
| 地上ドロップが地雷原セル上に存在 | Step 3 の safe 化それ自体では `GroundItemState` を変更しない。旧フロアの `groundItems` は `next_floor_started` 適用時に新フロア状態へ持ち越してはならない。 |
| `spawnAssignments` 欠落 / 重複 | Step 6 適用前にエラーとする。欠落補完や再抽選は行わない。 |

---

## Ambiguities / TODO(confirm)

本文へ取り込める GDD 由来ルールは反映済み。以下のみ、GDD 上でも未確定または API 表現に追加の設計判断が必要なため保留とする。

| 項目 | 本文の該当箇所 | 現在の状態 |
|---|---|---|
| アイテム / スキル JSON の最終数値 | アイテム・報酬・Private State | 各スキルのスタック上限・効果量レンジは確定済み。各フロアの具体的な盤面パラメータ（サイズ・地雷比率・CP数等）は実装時に決定。 |
