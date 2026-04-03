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

- 持ち越し: **スキル、アイテム**。
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

## Ambiguities / TODO(confirm)

本文へ取り込める GDD 由来ルールは反映済み。以下のみ、GDD 上でも未確定または API 表現に追加の設計判断が必要なため保留とする。

| 項目 | 本文の該当箇所 | 現在の状態 |
|---|---|---|
| アイテム / スキル JSON の最終数値 | アイテム・報酬・Private State | 各スキルのスタック上限・効果量レンジは確定済み。各フロアの具体的な盤面パラメータ（サイズ・地雷比率・CP数等）は実装時に決定。 |
