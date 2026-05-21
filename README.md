# Campus Life Game

大学4年間を48か月で進める、マルチプレイ対応のキャンパス生活ゲームです。

このゲームの目的は、単に点数を最大化することではありません。大学生活っぽい迷い、友人同士のツッコミ、卒業できる安心感、選択によって生活タイプが変わる感覚を同時に作ることを重視しています。

## 体験方針

- プレイ中は、そのターンに起きているイベントへ集中する
- 選択肢には数値効果を表示しない
- 明らかな正解・明らかなハズレだけの選択肢にしない
- 通常選択肢は効果合計が原則 `+3`
- 条件付き・危機・閾値イベントは必要に応じて `+5` まで許容
- 単位は原則マイナスにしない
- 卒業要件は `124単位`
- ランダムでも破綻しないが、意識して選ぶと生活タイプが分岐する

## 起動方法

### 必要なもの

- Node.js 20以上
- npm

### インストール

```bash
npm install
```

### 本番モード

```bash
npm run build
npm run start
```

デフォルトでは `http://localhost:4173` で起動します。

別ポートで起動する場合:

```bash
PORT=4181 STATIC_DIR=dist node server/index.js
```

運営用の起動補助:

```bash
# ローカルWi-Fiで遊ぶ
npm run game -- --port 4181

# 学外・別回線の参加者にも共有する
npm run game:tunnel -- --port 4181
```

`game:tunnel` は Cloudflare Tunnel の公開URLをホスト画面へ通知し、参加者向けQRも公開URLを優先して表示します。

### 開発モード

ターミナルを2つ開いて実行します。

```bash
# フロントエンド
npm run dev

# ゲームサーバー
npm run dev:server
```

- Vite dev server: `http://localhost:5173`
- Game server: `http://localhost:4173`

## 画面

- Host: `http://localhost:4173/`
- Display: `http://localhost:4173/display.html?host=http://localhost:4173`
- Controller: `http://localhost:4173/controller.html?host=http://localhost:4173`

ホスト画面からディスプレイ用URLとQRコードを出し、参加者はスマホのコントローラーで参加します。

Cloudflare Tunnel で起動した場合、ホスト画面のQRとURLは `https://...trycloudflare.com` を優先します。

## 主なゲームモード

### 48か月ボード

メインのゲームモードです。大学4年間を48か月として進めます。

- 1か月ごとにイベントが発生
- プレイ中は現在のイベントだけを大きく見せる
- 1年、2年、3年の終わりに年末recapを表示
- 年末recap後に、次の年の方針選択が入る
- 4年終了時は最終結果へ進む

### 人生マップ

もう一つのプレイ形式です。16シーズンを道のように進み、ルート選択の結果をマップ上で見せます。

48か月ボードとは別の体験として残しています。

## 回答方式

ホスト画面で回答方式を切り替えられます。

- `2人ずつ`: 2人が同じターンでそれぞれ選ぶ
- `全員一斉`: 参加者全員が同じタイミングで選ぶ

2人ずつの場合、奇数人数なら最後だけ1人で進みます。途中参加・途中削除・オフラインがあっても、次のターン対象は再計算されます。

## ホスト操作

ホストは進行中に以下の操作ができます。

- プレイヤー削除
- ゲーム終了
- 回答方式の変更
- fallback mode のON/OFF
- スマホ側で操作できない時の代理選択

fallback mode では、メインディスプレイやホスト画面からも選択肢を選べます。スマホの操作ミスや接続問題が起きた時に、ゲームを止めずに進めるための機能です。

## 選択と結果

各プレイヤーの結果は、最終ステータスだけではなく選択履歴から決まります。

結果は主に3層です。

- `academicStatus`: 卒業、卒業は持ち越し、進路保留、休む判断
- `lifeArchetype`: 研究・学び型、人間関係の中心、恋愛も大事にした人、進路を作った人、制作・挑戦型、生活を守った人
- `storyAward`: 4年間を象徴する代表エピソード

選択履歴には `intentTags` が保存されます。

主なタグ:

- `study`
- `research`
- `social`
- `community`
- `romance`
- `career`
- `work`
- `creative`
- `adventure`
- `rest`
- `risk`

例: 知力が高いだけでは「研究・学び型」になりません。研究、授業、ゼミ、卒論などの選択履歴が必要です。

コントローラーの結果画面では、共有テキストに加えて結果カード画像を生成できます。SNSや振り返りで使いやすいように、生活タイプ、プレイヤー名、代表タグを1枚にまとめます。

## 単位と卒業

- 卒業要件は `124単位`
- 学期末に基礎単位が入る
- 通常イベントでも少しずつ単位が入る
- 単位が遅れていると `単位回収チャンス` が出る
- 単位回収は便利だが、ゲーム全体を支配しないように `+3` 扱い

ランダム選択でも多くのプレイヤーは卒業できますが、完全に単位を無視すると持ち越しになる可能性があります。

## 救済イベント

ステータスがマイナスになった場合、次のターンで救済イベントが出ることがあります。

例:

- お金がマイナスになったら、時間などを使って0まで戻す
- 救済を受けず、本来のイベントへ進む選択肢も残す
- 同じ救済が連続しないよう cooldown がある
- 年間上限がある

救済はゲームを壊さないための安全装置であり、主役ではありません。

## 状態矛盾の防止

イベントや選択肢には `requiredFlags` / `excludedFlags` を使います。

例:

- 恋人がいない人に恋人前提イベントを出さない
- 一人暮らしではない人に一人暮らし前提イベントを出さない
- 免許がない人に免許前提イベントを出さない
- 留学、休学、ゼミ、進路なども状態に合わせて制御する

## イベントデータ

主なイベントデータは `data/events/` にあります。

```text
data/events/
├─ main.json         # 48か月ボードの通常イベント
├─ randomPool.json   # ランダムイベント
├─ vacationPool.json # 夏休み・春休みイベント
├─ threshold.json    # 危機・救済・単位回収などの閾値イベント
└─ timeline.json     # 人生マップ用イベント
```

イベント編集後は必ずチェックします。

```bash
npm run events:check
```

## 検証

基本の検証:

```bash
npm run events:check
node --test server/*.test.js
npm run build
npm run lint
```

ランダムプレイシミュレーション:

```bash
npm run sim:random -- --runs 100 --players 4 --turn-mode pair --seed 20260518 --timeout-ms 120000
```

afterバランスの合格判定付き:

```bash
npm run sim:random -- --runs 100 --players 4 --turn-mode pair --seed 20260518 --timeout-ms 120000 --enforce-after
```

このチェックでは、卒業率、生活タイプ分布、恋愛型、留学、休学、救済頻度、48回の選択履歴、ターン飛ばしや重複がないことを確認します。

## ディレクトリ構成

```text
.
├─ data/
│  └─ events/
├─ docs/
├─ public/
├─ scripts/
│  ├─ random-playthrough.mjs
│  └─ validate-events.mjs
├─ server/
│  ├─ board.js
│  ├─ effectBudget.js
│  ├─ endings.js
│  ├─ events.js
│  ├─ index.js
│  ├─ intentTags.js
│  └─ timelineGame.js
├─ src/
│  ├─ domain/
│  │  ├─ endings.ts
│  │  └─ gameShared.ts
│  └─ pages/
│     ├─ controller.tsx
│     ├─ controllerPlay.tsx
│     ├─ display.tsx
│     └─ host.tsx
├─ controller.html
├─ controller-play.html
├─ display.html
└─ index.html
```

## 開発時の注意

- ライブで遊んでいる `PORT=4180` は触らない
- 開発確認は別worktreeや別ポートで行う
- 選択肢に数値効果を表示しない
- `any` キャストでTypeScriptエラーを黙らせない
- 仕様外のリファクタリングを混ぜない
