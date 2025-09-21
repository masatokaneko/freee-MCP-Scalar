# 📊 Accounting MCP (Freee & QuickBooks)

**会計freee・QuickBooks**から仕訳データやマスタデータを取得し、
統一スキーマで返却する**ローカルMCPサーバー**です。

このプロジェクトを使えば、CFO・経理担当者はAI（Cursor / Claude Code / ChatGPT）に対して
「今月の連結精算表を作って」と指示するだけで、**仕訳取得 → 整形 → 集計 → レポート出力**まで自動化できます。

---

## 🏗 プロジェクト概要

- **目的**
  - 連結財務諸表作成、月次推移表、予実比較、増減要因分析の効率化
  - Freee/QuickBooksからのデータ取得を自動化
  - 借方／貸方・部門・取引先・品目・セグメント・承認情報を含む完全スキーマに統一

- **特徴**
  - ローカル環境で安全に実行（機密データが外部に流出しない）
  - `openapi.yaml` に準拠した統一JSONスキーマ
  - `?detail=true` パラメータで詳細仕訳帳（完全スキーマ）を取得可能
  - 将来的にSAP、Oracle ERP、NetSuiteなどのERP拡張にも対応可能

---

## 📂 ディレクトリ構成

```plaintext
accounting-mcp/
├── README.md
├── .env.example
├── package.json
├── server.js
├── openapi.yaml
│
├── docs/
│   ├── 1_業務要件定義書.md
│   ├── 2_業務フロー.md
│   ├── 3_機能要件定義書.md
│   ├── 4_システム要件定義書.md
│   ├── 5_インターフェース定義書.md
│   ├── 6_仕訳帳完全スキーマ.md
│   └── 仕様変更履歴.md
│
├── src/
│   ├── exporters/      # Excel ワークブック生成ロジック
│   ├── routes/         # Expressルート定義
│   ├── services/       # APIクライアント・OAuthトークン管理
│   ├── transformers/   # Freee → 共通スキーマ変換
│   ├── utils/          # ロガー・レート制御などの共通ユーティリティ
│   └── app.js
│
├── tests/              # 単体テスト
├── scripts/            # CLIスクリプト
└── swagger-ui/         # ローカルAPIドキュメント
```

---

## ⚙️ セットアップ方法

### 1. リポジトリクローン & 依存インストール

```bash
git clone git@github.com:your-org/accounting-mcp.git
cd accounting-mcp
npm install
```

### 2. 環境変数設定

`.env.example` をコピーして `.env` を作成し、以下を設定：

```env
FREEE_COMPANY_ID=123456
FREEE_ACCESS_TOKEN=xxxx
QB_COMPANY_ID=yyyy
QB_ACCESS_TOKEN=zzzz
PORT=3000
```

> 🔑 実運用では refresh_token を使ってアクセストークンを再取得する実装が推奨です。

### 3. サーバー起動

```bash
node server.js
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開くと動作確認可能。

---

## 🔎 使い方

### 1. 仕訳データ取得（通常版）

```bash
curl "http://localhost:3000/journals?start_date=2025-01-01&end_date=2025-01-31"
```

### 2. 仕訳データ取得（詳細版）

```bash
curl "http://localhost:3000/journals?start_date=2025-01-01&end_date=2025-01-31&detail=true"
```

返却例（抜粋）：

```jsonc
{
  "journals": [
    {
      "transaction_date": "2025-01-10",
      "debit_account_code": "500",
      "debit_account_name": "旅費交通費",
      "credit_account_code": "211",
      "credit_account_name": "未払金",
      "amount": 15000,
      "partner_name": "東京交通株式会社",
      "register_method": "支払依頼",
      "approval": {
        "applicant": "経理部A",
        "approval_date": "2025-01-15T10:00:00+09:00"
      }
    }
  ]
}
```

---

## 🧪 テスト

```bash
NODE_OPTIONS=--experimental-vm-modules npm test
```

Jest（ESM）で Freee API クライアントや Excel エクスポートの挙動を TDD で検証しています。

主要テストスイート:
- `test/services/freeeClient.test.js`：API ロギング、リトライ挙動
- `test/exporters/excel.test.js`：レポート種別ごとのワークブック構造

---

## 🧩 開発ルール

* **コード生成**：CursorやClaude Codeに `openapi.yaml` を読ませることで自動生成可能
* **スキーマ更新**：変更時は `docs/6_仕訳帳完全スキーマ.md` と `openapi.yaml` を同期
* **コミットメッセージ**：`docs/仕様変更履歴.md` に仕様変更を必ず記載

---

## 📌 今後の拡張

* QuickBooksエンドポイントの追加
* ページネーション / レート制限対応
* SAP/NetSuite連携
* Swagger UIを組み込み、API仕様をブラウザで閲覧可能にする
* 自動レポート生成スクリプト（連結精算表・予実比較）

---

## 👥 想定ユーザー

* **CFO / 経理担当者**：月次決算、予実管理、監査対応
* **AIエージェント**：Cursor / Claude Code / ChatGPT から自然言語でデータ取得・分析
* **監査法人**：証憑追跡・承認ログの確認

---

このREADMEがあることで：
- 新しいメンバーがすぐ環境を立ち上げられる
- CursorやClaudeに「このリポジトリを読んで開発を続けて」と指示できる
- CFOが直接 `scripts/` からレポート作成を実行できる

次にやるべきは、**scripts/ に「月次仕訳取得＆Excel出力」のサンプルスクリプト**を置いて、CFOがワンコマンドで使える状態にすることです。 
作成しましょうか？（例：`node scripts/fetch_journals.js --month 2025-08` で自動取得 → `output/journal_2025-08.xlsx` に保存）
