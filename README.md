# Campus Life Game

大学4年間をどう過ごすかを競う、マルチプレイ対応のキャンパス人生ゲーム。

> 📋 **開発仕様書（v2）** → [`docs/spec-v2.md`](docs/spec-v2.md)  
> 実装タスクの詳細は GitHub Issues を参照してください。

ホストPCが進行を管理し、参加者はスマホからQRコードで参加。共有モニターに盤面を映して遊びます。

## 起動方法

### 必要なもの

- Node.js 20以上
- npm

### インストール

```bash
npm install
```

### 本番モード（ビルド + サーバー起動）

```bash
npm run build
npm run start
```

http://localhost:4173 をブラウザで開く。

### 開発モード（ホットリロード付き）

ターミナルを2つ開いて：

```bash
# ターミナル1: フロントエンド（変更即反映）
npm run dev

# ターミナル2: ゲームサーバー
npm run dev:server
```

- Vite dev server: http://localhost:5173
- ゲームサーバー: http://localhost:4173

## 遊び方

1. ホスト画面（http://localhost:4173）を開いて「ホストとして開始」
2. 表示されるQRコードを参加者がスマホで読み取って参加
3. 「ディスプレイを開く」でモニター用の盤面表示画面を開く
4. 参加者が揃ったら「ゲームを開始！」
5. 各プレイヤーが順番にサイコロを振り、イベントの選択肢を選ぶ
6. 16ラウンド（大学4年間）を終えると結果発表

### デバッグモード（PC1台でテスト）

ホスト接続後に表示される「デバッグモード」パネルから「全画面を一括オープン」を押すと、ディスプレイ＋コントローラー×2が別ウィンドウで開きます。

## 技術スタック

- **フロントエンド**: React 19 + TypeScript + Vite
- **サーバー**: Express + WebSocket (ws)
- **通信**: WebSocket によるリアルタイム同期
- **その他**: qrcode.react, recharts, canvas-confetti

## ディレクトリ構成

```text
.
├─ docs/                # 仕様書・ゲームデザイン
├─ public/              # 静的アセット
├─ server/              # Express + WebSocket サーバー
│  ├─ index.js          # ゲーム進行のメイン
│  ├─ board.js          # 盤面遷移ロジック
│  ├─ events.js         # JSONイベント読み込み
│  └─ endings.js        # スコアとエンディング判定
├─ data/
│  └─ events/
│     ├─ main.json      # 通常マスイベント（49件）
│     └─ threshold.json # 閾値イベント（4件）
├─ scripts/
│  └─ validate-events.mjs # イベント定義の整合性チェック
├─ src/                 # React クライアント
│  ├─ pages/
│  │  ├─ host.tsx           # ホスト画面
│  │  ├─ controller.tsx     # 参加待機画面
│  │  ├─ controllerPlay.tsx # プレイ画面
│  │  └─ display.tsx        # 共有ディスプレイ画面
│  ├─ components/
│  │  └─ Board.tsx          # 盤面表示コンポーネント
│  ├─ domain/
│  │  ├─ boardData.ts       # 盤面データ
│  │  ├─ endings.ts         # エンディング定義
│  │  └─ gameShared.ts      # 共通型・共通ロジック
│  ├─ main.tsx              # ホスト画面エントリ
│  ├─ App.css
│  └─ index.css
├─ index.html           # ホストエントリ
├─ controller.html      # 参加待機エントリ
├─ controller-play.html # プレイエントリ
└─ display.html         # ディスプレイエントリ
```

## イベント編集

イベント本文の編集は次の2ファイルだけでできます。

- `data/events/main.json`
- `data/events/threshold.json`

編集後は以下で整合性チェック:

```bash
npm run events:check
```

### イベントJSONテンプレート

`data/events/main.json` の1イベント例:

```json
"18": {
  "id": "18",
  "title": "実習 / 教職の現実",
  "description": "教職を取ってた人は実習。取ってない人は別イベント。",
  "category": "学業",
  "choices": [
    {
      "id": "18A",
      "label": "実習を全力でやる",
      "effects": { "time": -3, "credits": 4, "health": -2, "intellect": 2, "connections": 1, "work_tolerance": 2 }
    },
    {
      "id": "18B",
      "label": "なんとか乗り切る",
      "effects": { "time": -2, "credits": 2, "health": -1, "intellect": 1, "work_tolerance": 1 }
    }
  ]
}
```

`conditionalVariants` 付き例:

```json
"27": {
  "id": "27",
  "title": "卒論を書く",
  "description": "in_seminar の人は避けられない。",
  "category": "学業",
  "choices": [],
  "conditionalVariants": [
    {
      "condition": { "requiredFlags": { "in_seminar": true } },
      "description": "ゼミ所属なら卒論イベント",
      "choices": [
        {
          "id": "27A",
          "label": "魂を込めて書く",
          "effects": { "time": -3, "credits": 5, "health": -2, "intellect": 3, "work_tolerance": 1 }
        }
      ]
    }
  ]
}
```

`data/events/threshold.json` の1イベント例:

```json
"金欠": {
  "id": "金欠",
  "title": "金欠イベント",
  "description": "口座残高がマイナス。生活ができない。",
  "category": "危機",
  "choices": [
    {
      "id": "金欠A",
      "label": "日払いバイトで食いつなぐ",
      "effects": { "time": -2, "money": 3, "health": -1, "work_tolerance": 1 }
    }
  ]
}
```

補足:
- `effects` の値は数値のみ（加算/減算）
- 分岐用選択肢は `branchRoute` を指定（例: `"branchRoute": "17A-1"`）
- ランダム効果は `randomChance` と `randomBonusEffects` / `randomPenaltyEffects`
