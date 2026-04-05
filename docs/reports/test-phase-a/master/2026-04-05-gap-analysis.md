# Phase A マスター テストギャップ分析 — 総合レポート

**日付**: 2026-04-05
**フェーズ**: A（既存テスト検証・補完: protocol, config, schema, rules-core）
**状態**: ✅ **実装完了 — 全178テストパス (2026-04-05)**

→ 詳細: [implementation-report.md](./2026-04-05-implementation-report.md)

---

## エグゼクティブサマリー

| パッケージ | ソース | テスト | テスト数 | カバレッジ品質 | 必要なアクション |
|---|---|---|---|---|---|---|
| protocol | 7 | 2 | 6 | 🟡 エクスポート表面のみ | 強化 + 新規仕様整合テスト |
| config | 4 + 5 JSON | 1 | 5 | 🟡 正常系重視; バリデーションが狭い | 書き換え + バリデーション拡張 |
| schema | 8クラス + 5 utils | 3 | ~22 | 🟡 良好なスモーク; **reset/erosion ドリフト** | 契約修正 + パッチテスト追加 |
| rules-core | 19 | 18 | ~70 | 🟡 広い広範囲; **3つの矛盾** | leveling/drop/dig ギャップ修正 |

### 主要数字
- **既存テスト合計**: 4パッケージで約103件
- **維持**: ~15 | **強化**: ~12 | **書き換え**: ~5 | **削除**: ~1
- **新規必要テスト**: 60+（推定） |
- **実装をブロックする人間の判断**: **6件**（下記）

---

## ⚠️ あなたの判断が必要な矛盾

### 🔴 高優先度（実装をブロックする）

---

#### 決定 #1: evacuation の意味論 (config)

- **パッケージ**: config
- **場所**: `items.json` の evacuation 説明 vs `api.md`
- **A**: api.md が正しい → ランダムな生存プレイヤーの近くへテレポート（リスポーン配置ロジック）。items.json の説明を更新。
- **B**: items.json が正しい → 現在のリスポーン地点へ瞬間移動。api.md を更新。
- **影響**: サーバーー側 evacuation ロジック、UI ヘルプテキスト、クライアント表示
- **推奨**: **A** — api.md が最終権威であり、「生存プレイヤーの近く」という mechanic の方がゲーム的に面白い。

---

#### 決定 #2: フロア遷移時の EXP 永続 (schema × rules-core)

- **パッケージ**: schema + rules-core（クロスパッケージ！）
- **場所**: `resetPlayersForNewFloor()` が exp=0 にリセット; api.md は累積 EXP を示唆
- **A**: EXP は**累積的** — フロア間で永続。現在のコードはバグ。reset を修正 + leveling テストを書き換え。
- **B**: EXP は**フロア毎にリセット**。api.md の「累積」はフロア内のみの蓄積を意味する。現在のコードは正しい。
- **影響**: 進行システム、レベルアップ閾値、スコアリング、報酬資格、UI EXP 表示
- **推奨**: **A** — 累積 EXP は標準 RPG コンベェンションであり、マルチフロア進行に意味を持たせる。`exp_gained.totalEvent` フィールド名も強く累積を示唆している。

---

#### 決定 #5: Dig alive-state 検証 (rules-core)

- **パッケージ**: rules-core
- **場所**: resolveDig() は DIG_NOT_ALIVE エラーコードが存在するのに actor.lifeState を決してチェックしない
- **A**: resolveDig() に lifeState チェックを追加。防御の多重化; 純粋関数自らが検証。
- **B**: 現状維持; サーバー CommandHandler が責任を担う。resolveDig() は純粋関数のまま。
- **影響: Dig コマンドハンドラ設計、テストの範囲境界
- **推奨**: **A** — 関数は既に範囲とターゲタイプを検証している; lifeState は同じカテゴリの事前条件。低コスト、高安全性。

---

#### 決定 #6: Drop deadPlayerExists ルール (rules-core)

- **パッケージ**: rules-core
- **場所**: rollGroundDrop() は deadPlayerExists パラメータを受け取るが完全に無視
- **A**: rollGroundDrop() でルールを実装。コアエコノミックメカニック。
- **B): Phase B (TDD) へ意図的に延期。現行動作が不完全であることを文書化。
- **C**: 使用されないならパラメータを署名から削除。
- **影響: ドップ経済、カムバックメカニック、ゲームバランス
- **推奨**: **B** — これはビジネスロジック機能であり、実装と同時にテストすべき。後付けで修正するのは不自然。

---

### 🟡 中優先度（合理的デフォルトで進められる可能性）

---

#### 決定 #3: Schema ユーティリ API 規約 (coord vs index)

- **パッケージ**: schema
- **shared-dev-plan.md** は coord-based (`GridCoord`) シグネチャを指定
- **実装** は index-based (`number`) シグネチャを使用
- **A**: 実装（index-based）に従う。ドキュメントを更新。テストはコードに従う。
- **B**: 仕様（coord-based）に従う。ユーティリティをリファクタリング。
- **推奨**: **A** — 実装は既に動作しており、ドキュメントは希望的目標。コードを直さずドキュメントを直す。

---

#### 決定 #4: clearAllErosionWarnings が warningCellKeys もクリアすべきか

- **パッケージ**: schema
- **仕様** `(grid, erosionState)` — erosionState も含むことを示唆
- **コード** `(grid)` のみ — warningCellKeys が陳腐したまま
- **A**: warningCellKeys = [] もクリアするよう修正。
- **B**: グリッドセルブーリアンクリアのみ十分; warningCellKeys は呼び出し側が管理。
- **推奨**: **A** — 陳腐データはバグの温床。クリアする。

---

## 📊 テスト品質サマリー（カテゴリ別）

### うまく動いているもの ✅
- Protocol: 重複名検出、バレルエクスポート表面
- Rules-core: skill-modifiers（実データ）、collision（強力）、facing（妥当）
- Schema: フィールド数検証（全8クラス通過）、ラウンドトリップシリアライゼーション
- Config: root/gameParams/board の deep-freeze、オーバーライドマージ基本パス

### 壊れている/不足しているもの 🔴
1. **Protocol**: 正確な列挙値テストが 0/15 列挙で存在しない
2. **Config**: バリデーションが仕様の約40%のみカバー; アイテム/スキル/ステージ意味論はほぼ未テスト
3. **Schema**: resetPlayersForNewFloor が EXP をゼロにする（おそらく誤り）; clearAllErosionWarnings が警告データを陳腐させたまま
4. **Rules-core**:
   - resolveDig に alive-check 欠落（セキュリティギャップ）
   - rollGroundDrop が deadPlayerExists を完全に無視（エコノミーギャップ）
   - leveling モデルが累積 EXP 仕様と矛盾する可能性
   - **統合テストが 0 件** ← 最大のギャップ

### カバレッジ分布

```
正常系:       ████████████████████  ~85% カバー済み
境界値:         ████░░░░░░░░░░░░░░░  ~20% カバー済み
無効入力:       ██░░░░░░░░░░░░░░░  ~10% カバー済み
禁止操作:       ░░░░░░░░░░░░░░░░░   ~5% カバー済み
統合テスト:     ░░░░░░░░░░░░░░░░░   ~0% カバー済み  ← 最大のギャップ
不変条件:       █░░░░░░░░░░░░░░░░   ~5% カバー済み
```

---

## 推奨実装順序

6つの判断をいただいた後:

### Wave 1: 人間判断依存（ブロッカー）
1. 決定 #2 (EXP 永続) → schema reset 修正 + rules-core leveling 修正
2. 決定 #5 (dig alive-check) → resolveDig に追加
3. 決定 #6 (drop deadPlayer) → 延期 or 文書化
4. 決定 #1 (evacuation) → items.json or api.md を修正

### Wave 2: 高インパクト、ブロッカーなし
5. Protocol: 正確な列挙整合性テスト（15列挙 × 各〜5値）
6. Protocol: 正確なコマンド/イベント/タイマー形状テスト
7. Rules-core: dig 統合チェーン (dig→flood-fill→EXP→drop)
8. Rules-core: flood-fill 境界拡張
9. Schema: 侵食警告クリア + テスト
10. Schema: 増分シリアライゼーション + 複エントリ MapSchema テスト

### Wave 3: 中インパクト
11. Config: バリデーション拡張（アイテム/スキル/ステージ意味論）
12. Config: データ整合性クロスファイルテスト
13. Rules-core: ドープ境界テスト（空プール、ゼロ重み）
14. Rules-core: CP 半径/正確境界テスト
15. Rules-core: スキル修正値 → 速度計算統合

### Wave 4: 仕上げ
16. 残りの ENHANCE 項目を全て実施
17. 統合チェーンテスト I-1 〜 I-5
18. 不変条件/プロパティベーステスト（コアループ）

---

## 決定ログ索引

| # | タイトル | カテゴリ | 状態 | 判決 |
|---|---|---|---|---|
| 1 | evacuation 意味論 | 矛盾 | ✅ **C (統合)** | リスポーン位置決定関数を活用し、ランダム生存プレイヤーから最も近い安全マスへ |
| **2** | **フロア間 EXP 永続** | **矛盾** | ✅ **A** | **EXP は累積的** — resetコード修正 + levelingテスト書き換え |
| 3 | Helper API coord vs index | 仕様ドリフト | ✅ **A** | **index-based実装に従う** — ドキュメント更新、テストはコード準拠 |
| 4 | clearAllErosionWarnings の範囲 | 実装ギャップ | ✅ **A** | **warningCellKeysもクリア** — 陳腐データ防止 |
| 5 | Dig alive-state 検証 | 実装ギャップ | ✅ **A** | **resolveDig()にlifeStateチェック追加** — 防御多重化 |
| 6 | Drop deadPlayerExists ルール | 実装ギャップ | ✅ **B** | **Phase B (TDD) へ延期** — 不完全であることを文書化 |

---

### 決定 #1 詳細: evacuation の意味論
- **日付**: 2026-04-05
- **カテゴリ**: 矛盾（config × api.md）
- **人間の判断**: **C — 両者を統合**
- **内容**: 「どちらも部分的に情報が不足しており、部分的にあっている。今リスポーンするとしたらどこにリスポーンするか決める関数があって、それを活用してどこにevacするか決定する。その場所決定アルゴリズムの内容が、ランダムな生存プレイヤーから最も近い安全マスである」
- **適用先**: items.json の説明更新 + api.md の説明更新（両方を統合されたアルゴリズム記述へ）

### 決定 #2 詳細: フロア遷移時の EXP 永続
- **日付**: 2026-04-05
- **カテゴリ**: 矛盾（schema × rules-core）
- **人間の判断**: **A — EXP は累積的**
- **内容**: `resetPlayersForNewFloor()` の exp=0 リセットはバグ。フロア間でEXP維持。
- **適用先**: schema reset.ts 修正 + rules-core leveling テスト書き換え

### 決定 #3 詳細: Schema Helper API 規約
- **日付**: 2026-04-05
- **カテゴリ**: 仕様ドリフト
- **人間の判断**: **A — index-based 実装に従う**
- **内容**: shared-dev-plan.md の GridCoord 指定は希望的目標。実装(number)を正とする。
- **適用先**: shared-dev-plan.md ドキュメント更新 + テストはindex-basedで記述

### 決定 #4 詳細: clearAllErosionWarnings の範囲
- **日付**: 2026-04-05
- **カテゴリ**: 実装ギャップ
- **人間の判断**: **A — warningCellKeys もクリア**
- **内容**: `clearAllErosionWarnings()` に `erosionState.warningCellKeys = []` 追加。
- **適用先**: schema utils/reset.ts 修正 + テスト追加

### 決定 #5 詳細: Dig alive-state 検証
- **日付**: 2026-04-05
- **カテゴリ**: 実装ギャップ
- **人間の判断**: **A — resolveDig() に lifeState チェック追加**
- **内容**: `DIG_NOT_ALIVE` エラーコードが存在する以上、関数自ら検証すべき。
- **適用先**: rules-core dig/resolve-dig.ts 修正 + テスト追加

### 決定 #6 詳細: Drop deadPlayerExists ルール
- **日付**: 2026-04-05
- **カテゴリ**: 実装ギャップ
- **人間の判断**: **B — Phase B (TDD) へ延期**
- **内容**: ビジネスロジック機能として実装と同時にTDDで開発。現行動作を不完全であると文書化。
- **適用先**: roll-drop.ts に TODO コメント追加 + Phase B タスク登録

---

*本レポートは4つの並列分析エージェントによって自動生成されました。各パッケージの詳細レポートはそれぞれのディレクトリにあります。*
*決定ログ: 2026-04-05 に全6件受理・記録完了。*
