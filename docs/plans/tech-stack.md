# Detonator プロジェクト 技術スタック選定レポート

**プロジェクト概要**  
- 名称: Detonator  
- ジャンル: 協力型ローグライクマインスイーパーパーティーゲーム  
- プラットフォーム: ブラウザ (モバイルファースト、PC対応)  
- プレイヤー数: 1～10人リアルタイムマルチプレイヤー  
- 開発体制: 小規模学生チーム、AI支援開発  
- 用途: イベント使用 (非収益)  

---

## 推奨構成 (最終決定)

### 1 技術スタックサマリー

```
【フロントエンド】
- エンジン: Phaser 3.x (TypeScript)
- ビルド: Vite 5.x
- UI: Phaser内蔵UI
- 状態管理: Colyseusクライアント
- デプロイ: 静的サイト (Netlify/Vercel/Cloudflare Pages)

【バックエンド】
- フレームワーク: Colyseus 0.17
- ランタイム: Node.js 20 LTS
- 状態同期: @colyseus/schema
- デプロイ: Docker on VM (DigitalOcean ~$4/月)

【モノレポ管理】
- パッケージマネージャー: pnpm 9.x
- ビルドオーケストレーション: Turborepo 2.x
- 共有パッケージ: protocol, schema, rules-core, config

【開発ツール】
- 言語: TypeScript 5.x
- Linter: Biome
- Formatter: Biome
- CI/CD: GitHub Actions (lint + typecheck + test)
```

### 2 意思決定マトリックス

| 決定項目 | 選択 | 主な理由 |
|----------|------|----------|
| アーキテクチャ分離 | ✅ 分離 (FE/BE) | サーバー権威型必須、デプロイ独立性 |
| モノレポ採用 | ✅ 採用 | 型共有、アトミックな変更、小規模チーム向き |
| フロントエンドエンジン | Phaser 3 | Colyseus統合◎、AI効率◎、実績◎ |
| バックエンド | Colyseus | リアルタイム同期専用設計、軽量 |
| TypeScript | ✅ 全面採用 | 型安全性、AI生成精度向上 |
| UI層 | Phaser内蔵 | HUD最小限、複雑さ回避 |
| ビルドツール | Vite | 高速HMR、最適化ビルド |
| ランタイム | Node.js 20 | 公式サポート、安定性 |

### 3 開発フェーズ別の焦点

**Phase 1: プロトタイプ (MVP)**

- Phaserでグリッド描画 + タッチ操作
- Colyseusで基本的な状態同期
- 1人モード動作確認
- 妥協レベル: **高** (動けばOK)

**Phase 2: マルチプレイヤー実装**

- 複数プレイヤー同期
- 再接続処理
- クライアント予測 + サーバー調整
- 妥協レベル: **中** (コア機能は妥協なし)

**Phase 3: 体験の洗練**

- パフォーマンス最適化
- UI/UXブラッシュアップ
- バグ修正
- 妥協レベル: **低** (可能な限り改善)

---

## 実装開始時のチェックリスト

### セットアップ手順

- [ ] モノレポ初期化 (pnpm + Turborepo)
- [ ] TypeScript設定 (共有tsconfig)
- [ ] Biome 設定
- [ ] apps/client: Vite + Phaser 3プロジェクト作成
- [ ] apps/server: Colyseus + Node.js 20プロジェクト作成
- [ ] packages/protocol: 共有型定義
- [ ] packages/schema: Colyseusスキーマ
- [ ] CI/CD: GitHub Actions (lint + typecheck)
- [ ] 開発環境確認 (localhost動作)

### 学習リソース

- Phaser 3公式ドキュメント: https://photonstorm.github.io/phaser3-docs/
- Phaser 3サンプル集: https://phaser.io/examples
- Colyseus公式ドキュメント: https://docs.colyseus.io/
- Phaser + Colyseusチュートリアル: https://docs.colyseus.io/getting-started/phaser-client/
- Turborepoドキュメント: https://turbo.build/repo/docs

---
