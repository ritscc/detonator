# Detonator (仮)

ブラウザで動く協力型ローグライクマインスイーパーのパーティゲーム。1〜10人でリアルタイム対戦・協力プレイができる。

## 技術スタック

- フロントエンド: Phaser 3 + Vite 5 + TypeScript
- バックエンド: Colyseus 0.17 + Node.js 20 LTS
- モノレポ管理: pnpm 9 + Turborepo 2

## クイックスタート

```bash
pnpm install
pnpm dev
```

## ディレクトリ構成

```
.
├── apps/
│   ├── client/       # Phaser 3 フロントエンド (Vite)
│   └── server/       # Colyseus ゲームサーバー
└── packages/
    ├── protocol/     # クライアント・サーバー間メッセージ定義
    ├── config/       # 共通設定
    ├── schema/       # Colyseus スキーマ定義
    └── rules-core/   # ゲームルールのコアロジック
```

## ドキュメント

- [全体設計](docs/plans/detonator.md)
- [技術スタック詳細](docs/plans/tech-stack.md)
- [API 設計](docs/plans/api.md)
- [共有パッケージ開発計画](docs/plans/shared-dev-plan.md)
- [フロントエンド](docs/plans/front/)
- [バックエンド](docs/plans/back/)
