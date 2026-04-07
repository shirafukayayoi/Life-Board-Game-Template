# Campus Life Game - Game Design Document

Based on MTG notes (2026-04-07)

---

## 1. Core Concept

"What do you prioritize in your 4 years of university?"

A party-style board game where players make trade-off decisions throughout
university life. No single correct path — your choices shape who you become.
Played on a shared monitor with smartphones as controllers.

---

## 2. Parameter System

### 2.1 Basic Resources (visible, always tracked)

| Parameter | Description | Starting Value | Range |
|-----------|-------------|----------------|-------|
| **time** | Free time / schedule capacity | 10 | 0-12 |
| **money** | Cash on hand | 3 | 0-99 |
| **credits** | Accumulated course credits | 0 | 0-124 |
| **health** | Physical & mental wellness | 10 | 0-12 |

### 2.2 Experience Axes (growth stats, unlock late-game options)

| Parameter | Description | Starting Value | Range |
|-----------|-------------|----------------|-------|
| **intellect** | Academic ability, critical thinking | 1 | 0-10 |
| **connections** | Network, friends, social capital | 1 | 0-10 |
| **work_tolerance** | Labor endurance, professional skills | 0 | 0-10 |
| **action_power** | Initiative, courage, independence | 1 | 0-10 |
| **romance_exp** | Romantic experience & emotional maturity | 0 | 0-10 |

### 2.3 Threshold Rules

| Condition | Effect |
|-----------|--------|
| time < 6 | Probability of 留年(held back) event increases each turn |
| time < 4 | Probability of 緊急入院(hospitalization) event triggers |
| money < 0 | Forced 金欠(broke) event next turn |
| health < 3 | Random negative events become more severe |
| credits < threshold at checkpoints | Risk of 留年 |

Credit checkpoints:
- End of Year 1 (round 4): need >= 20 credits
- End of Year 2 (round 8): need >= 50 credits
- End of Year 3 (round 12): need >= 80 credits
- Graduation (round 16): need >= 110 credits

### 2.4 Special State Flags

These are persistent states that change available choices going forward:

| Flag | How to get | Effect |
|------|-----------|--------|
| `living_alone` | Choose at game start or #2 | +action_power growth, costs money each round |
| `has_partner` | Romance events | Happiness events unlock, but time/money cost |
| `has_license` | #16 event | Some events become available, action_power+ |
| `studying_abroad` | #17 event | Skip 2 turns, big intellect/action_power boost |
| `on_leave` | #23 event | Pause credits, special choices open |
| `in_seminar` | #25 event | Thesis required, intellect boost path |
| `club_type` | #4 event | circle / team / none / community → affects events |
| `job_type` | #7 event | food_service / tutor / retail / intern / side_biz |

---

## 3. Game Structure

### 3.1 Timeline

16 rounds = 4 years × 4 seasons each

| Round | Period | Theme |
|-------|--------|-------|
| 1 | 1年 春 | Orientation, first choices |
| 2 | 1年 夏 | Summer break, first adventures |
| 3 | 1年 秋 | Settling in, routines form |
| 4 | 1年 冬 | First exams, credit check |
| 5 | 2年 春 | Deeper involvement |
| 6 | 2年 夏 | Ambition or drift |
| 7 | 2年 秋 | Midpoint identity |
| 8 | 2年 冬 | Credit check, career awareness |
| 9 | 3年 春 | Specialization begins |
| 10 | 3年 夏 | Internships, study abroad |
| 11 | 3年 秋 | Job hunting starts |
| 12 | 3年 冬 | Credit check, thesis prep |
| 13 | 4年 春 | Final push |
| 14 | 4年 夏 | Last summer |
| 15 | 4年 秋 | Wrapping up |
| 16 | 4年 冬 | Graduation & beyond |

### 3.2 Board Layout

32 main squares + 3 branch points with parallel routes

```
Main track: #1 ──── #8 ── #9(branch1) ── #16 ── #17(branch2) ── #24 ── #25 ── #26(branch3) ── #32

Branch 1 (#9): 2 routes × 2 squares each, rejoin at #12
  Route A (circle/team): #9A-1, #9A-2
  Route B (solo/community): #9B-1, #9B-2

Branch 2 (#17): 3 routes × 3 squares each, rejoin at #21
  Route A (study_abroad): #17A-1, #17A-2, #17A-3
  Route B (career_focus): #17B-1, #17B-2, #17B-3
  Route C (explore): #17C-1, #17C-2, #17C-3

Branch 3 (#26): 2 routes × 2 squares each, rejoin at #29
  Route A (safe_path): #26A-1, #26A-2
  Route B (challenge): #26B-1, #26B-2

Total: 32 main + 4 + 9 + 4 = 49 event squares
```

---

## 4. Main Track Events (#1-#32)

### Year 1: The Beginning (#1-#8)

#### #1 初めての授業
> 大学初日。大きな講義室に座る。隣の人が話しかけてきた。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 真面目にノートを取る | — | — | +3 | — | +1 | — | — | — | — |
| B: 隣の人と仲良くなる | — | — | +1 | — | — | +2 | — | — | — |
| C: 寝る（昨夜ゲームしすぎた） | +1 | — | — | -1 | — | — | — | — | — |

#### #2 一人暮らし or 実家暮らし
> 春、住む場所を決める時が来た。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 一人暮らしを始める | -1 | -3 | — | — | — | — | +1 | +2 | — |
| B: 実家から通う | +1 | +1 | — | +1 | — | — | — | -1 | — |

Flag: A → `living_alone = true`

Note: `living_alone` costs money -1 per round (maintenance) but action_power gains +1 bonus on relevant events.

#### #3 履修登録
> 時間割を組む。友達に合わせるか、自分の興味で攻めるか。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 友達と同じ授業を取る | — | — | +2 | — | — | +2 | — | — | — |
| B: 興味のある授業を攻める | -1 | — | +3 | — | +2 | — | — | — | — |
| C: 全休を作る | +2 | — | +1 | +1 | -1 | — | — | — | — |
| D: 教職課程を取る | -2 | — | +4 | -1 | +2 | — | — | — | — |

#### #4 サークル・部活・ノンサー・地域活動 (BRANCH POINT 1)
> 新歓の季節。ビラの山。どう過ごす？

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: サークルに入る | -1 | -1 | — | — | — | +2 | — | +1 | +1 |
| B: 部活に入る（ガチ） | -3 | -1 | — | +2 | — | +2 | +1 | +1 | — |
| C: ノンサーで自由に | +2 | — | — | — | — | -1 | — | — | — |
| D: 地域活動を始める | -1 | — | — | — | — | +2 | — | +2 | — |

Flag: sets `club_type`
Determines Branch 1 route: A/B → Route A (group), C/D → Route B (solo/community)

#### #5 友達ができる
> 少しずつ大学に慣れてきた。どんな付き合い方をする？

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 浅く広く — 顔が広い人になる | -1 | -1 | — | — | — | +3 | — | — | +1 |
| B: 少数精鋭 — 深い関係を築く | — | — | — | +1 | — | +1 | — | — | +1 |
| C: 一匹狼 — 自分の時間を大事にする | +1 | — | — | — | +1 | -1 | — | +1 | — |

#### #6 1限がキツくなる
> 朝が来るのが早すぎる。布団が離してくれない。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 気合いで起きる | -1 | — | +2 | -1 | +1 | — | +1 | — | — |
| B: 友達にモーニングコールを頼む | — | — | +1 | — | — | +1 | — | — | — |
| C: 1限を切り始める | +1 | — | -2 | +1 | — | — | — | — | — |

#### #7 バイトを探す
> 金がない。働かなければ。でもどこで？

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 飲食バイト | -2 | +3 | — | -1 | — | +1 | +2 | — | — |
| B: 塾講師 | -2 | +3 | — | — | +1 | — | +1 | — | — |
| C: 小売・接客業 | -2 | +2 | — | -1 | — | +1 | +2 | — | — |
| D: 長期インターン | -3 | +2 | — | -1 | +1 | +2 | +2 | +1 | — |
| E: 副業系（アフィ・動画等） | -1 | +1 | — | — | +1 | — | — | +2 | — |

Flag: sets `job_type`

#### #8 金欠になる
> 月末。財布が薄い。口座も薄い。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: シフトを増やして耐える | -2 | +3 | — | -1 | — | — | +1 | — | — |
| B: 親に泣きつく | — | +2 | — | — | — | — | — | -1 | — |
| C: 食費を削る（もやし生活） | — | +1 | — | -2 | — | — | +1 | — | — |

---

### Branch 1 Routes (after #9, determined by #4)

#### Route A: Group Path (circle/team)

##### #9A-1 新歓で盛り上がる
> サークルの新歓。先輩がやたら優しい。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 全力で参加して顔を売る | -1 | -2 | — | — | — | +3 | — | — | +1 |
| B: 様子見で控えめに | — | -1 | — | — | — | +1 | — | — | — |

##### #9A-2 合宿・練習の日々
> 夏合宿。キツいが楽しい。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 全力投球 | -2 | -2 | — | -1 | — | +2 | +1 | +1 | — |
| B: 程よくやる | -1 | -1 | — | — | — | +1 | — | — | — |
| C: フェードアウトする | +2 | — | — | — | — | -2 | — | — | — |

#### Route B: Solo/Community Path (non-circle / community)

##### #9B-1 自分の時間の使い方
> 組織に属さない自由がある。何をする？

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 読書・勉強に没頭 | -1 | — | +1 | — | +3 | — | — | — | — |
| B: 地域のイベントに顔を出す | -1 | — | — | — | — | +2 | — | +2 | — |
| C: ひたすらゲーム・趣味 | — | -1 | — | +1 | — | — | — | — | — |

##### #9B-2 孤独か自由か
> 周りがサークルで忙しそうだ。自分は…

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 自分のペースに自信を持つ | — | — | — | +1 | — | — | — | +2 | — |
| B: 今からでもどこかに入る | -1 | -1 | — | — | — | +2 | — | — | — |
| C: SNSで繋がりを探す | — | — | — | — | — | +1 | — | — | +1 |

---

### Year 2: Settling In (#9-#16)

(#9 is the branch point above — players rejoin the main track at #10)

#### #10 飲み会に行きすぎる
> 誘われるがまま飲みに行く日々。気づいたら週3。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 楽しいから全部行く | -2 | -3 | — | -2 | — | +3 | — | — | +1 |
| B: 週1に絞る | -1 | -1 | — | — | — | +1 | — | — | — |
| C: 飲み会は断る派になる | +1 | +1 | — | +1 | — | -1 | — | — | — |

#### #11 終電を逃す
> 気づいたら最終電車が行ってしまった。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: タクシーで帰る | — | -2 | — | — | — | — | — | — | — |
| B: カラオケでオール | -1 | -1 | — | -2 | — | +2 | — | — | +1 |
| C: ネカフェで夜を明かす | — | -1 | — | -1 | — | — | +1 | — | — |

Conditional: if `living_alone` and near campus → "歩いて帰れる" (no penalty, action_power +1)

#### #12 落単寸前
> テスト前日。ノートがない。何もわからない。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 徹夜で勉強する | -1 | — | +2 | -2 | +1 | — | +1 | — | — |
| B: 友達にノートを借りる | — | — | +1 | — | — | +1 | — | — | — |
| C: 諦めて寝る | +1 | — | -2 | +1 | — | — | — | — | — |

Conditional: if connections >= 5 → B gives +2 credits instead

#### #13 学園祭・オーキャン運営
> 大学祭の準備が始まる。やる？

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 実行委員をやる | -3 | -1 | — | -1 | — | +3 | +1 | +2 | — |
| B: サークルで出店する | -2 | -1 | — | — | — | +2 | — | +1 | +1 |
| C: 客として楽しむ | — | -1 | — | — | — | — | — | — | +1 |
| D: オーキャンスタッフをやる | -2 | — | — | — | — | +2 | +1 | +1 | — |

#### #14 恋の入り口
> 気になる人ができた…かもしれない。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: サークル内で距離を縮める | -1 | -1 | — | — | — | +1 | — | — | +2 |
| B: バイト先の人を誘ってみる | -1 | -2 | — | — | — | — | — | +1 | +2 |
| C: 合コンに行く | -1 | -2 | — | — | — | +1 | — | — | +2 |
| D: マッチングアプリを始める | — | -1 | — | — | — | — | — | +1 | +1 |
| E: 恋愛は今はいい | +1 | — | +1 | — | — | — | — | — | — |

Conditional: A/B/C/D with romance_exp >= 2 → 50% chance `has_partner = true`

#### #15 資格を取る
> 何か形に残るものが欲しい。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: TOEIC | -2 | -1 | — | — | +2 | — | — | — | — |
| B: 簿記 | -2 | -1 | — | — | +2 | — | +1 | — | — |
| C: ITパスポート | -1 | -1 | — | — | +2 | — | — | — | — |
| D: 宅建 | -3 | -2 | — | -1 | +3 | — | — | — | — |
| E: 秘書検定 | -1 | -1 | — | — | +1 | +1 | +1 | — | — |
| F: 今は取らない | +1 | — | — | — | — | — | — | — | — |

#### #16 車の免許
> 免許、取る？

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 合宿で一気に取る | -2 | -5 | — | -1 | — | +1 | — | +2 | — |
| B: 通いでゆっくり取る | -3 | -4 | — | — | — | — | — | +1 | — |
| C: 取らない | — | — | — | — | — | — | — | — | — |

Flag: A/B → `has_license = true`
Conditional: if money < 4 → A/B unavailable (money not enough)

---

### Year 3: Branching Out (#17-#24)

#### #17 留学・キャリア・探索 (BRANCH POINT 2)
> 3年目。将来が気になり始めた。

Requires: different experience thresholds to unlock routes

Route A (study_abroad): intellect >= 4 required
Route B (career_focus): work_tolerance >= 3 required
Route C (explore): always available (default)

If requirements not met, falls to Route C.

#### Branch 2 Routes

##### Route A: Study Abroad Path

###### #17A-1 留学準備
> 書類、ビザ、語学スコア…やることだらけ。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 交換留学（費用抑えめ） | -2 | -3 | +2 | — | +2 | — | — | +1 | — |
| B: 私費留学（自由度高い） | -2 | -6 | — | — | +2 | — | — | +2 | — |

Flag: `studying_abroad = true`

###### #17A-2 異国の日々
> 言葉も文化も違う世界で暮らす。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 現地の学生と積極的に交流 | -1 | -2 | +2 | — | +2 | +3 | — | +2 | — |
| B: 日本人コミュニティで過ごす | — | -1 | +1 | — | +1 | +1 | — | — | — |
| C: 一人で旅をしまくる | -1 | -3 | — | -1 | +1 | — | — | +3 | — |

###### #17A-3 帰国後
> 帰ってきた。日本が狭く感じる。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 留学経験を就活に活かす | — | — | — | — | +1 | +1 | +1 | — | — |
| B: もう一度行きたい…ワーホリを考える | -1 | -2 | — | — | — | — | — | +2 | — |
| C: 留学ロスで何も手につかない | -1 | — | -1 | -1 | — | — | — | — | — |

##### Route B: Career Focus Path

###### #17B-1 インターンに行く
> 3年になったら就活…その前にインターン。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 大手の夏インターン | -3 | +1 | — | -1 | +1 | +2 | +2 | — | — |
| B: スタートアップで武者修行 | -3 | +1 | — | -2 | +1 | +1 | +2 | +2 | — |
| C: 短期で様子見 | -1 | — | — | — | +1 | +1 | +1 | — | — |

###### #17B-2 ビジネスの世界を覗く
> 名刺交換、プレゼン、ビジネスマナー。大人の世界。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 積極的に学ぶ | -1 | — | — | — | +1 | +2 | +2 | — | — |
| B: 言われたことだけやる | — | +1 | — | — | — | — | +1 | — | — |

###### #17B-3 将来像が見えてくる
> なんとなく自分の向き不向きがわかってきた。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: このまま就活に突き進む | -1 | — | — | -1 | — | +1 | +1 | — | — |
| B: やりたいことを考え直す | — | — | — | — | +1 | — | — | +1 | — |
| C: 大学院も視野に入れる | — | — | +2 | — | +2 | — | — | — | — |

##### Route C: Exploration Path

###### #17C-1 夏休み、新しいことを始めてみる
> 何かを変えたい気分。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: ボランティアに参加する | -1 | — | — | — | — | +2 | — | +2 | — |
| B: プログラミングを学ぶ | -2 | -1 | — | — | +2 | — | +1 | — | — |
| C: ダラダラ過ごす | +2 | — | — | +1 | — | — | — | -1 | — |

###### #17C-2 意識高い系の動画に感化される
> YouTubeで起業家の動画を見て火がついた。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 翼を広げる会（イベント）に参加する | -1 | -2 | — | — | — | +1 | — | +2 | — |
| B: 同世代の学生起業家と会ってみる | -1 | -1 | — | — | +1 | +2 | — | +2 | — |
| C: 冷静になる。自分のペースでいい。 | — | — | — | +1 | — | — | — | — | — |

Conditional: A → 20% chance of 壺を買わされる (money -3, action_power -1)

###### #17C-3 何者かになりたい
> みんな何かしら始めてる。焦る。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 資格に走る | -2 | -1 | — | — | +2 | — | — | — | — |
| B: 団体を立ち上げる | -2 | -1 | — | -1 | — | +2 | — | +3 | — |
| C: 自分探しの旅に出る | -1 | -2 | — | — | — | — | — | +2 | — |

---

### Year 3 continued (main track after branch 2, rejoin at #18)

#### #18 実習 / 教職の現実
> 教職を取ってた人は実習。取ってない人は別イベント。

Conditional on #3 choice D (教職):
| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 実習を全力でやる | -3 | — | +4 | -2 | +2 | +1 | +2 | — | — |
| B: なんとか乗り切る | -2 | — | +2 | -1 | +1 | — | +1 | — | — |

If not 教職:
| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 地域活動を始める | -1 | — | — | — | — | +2 | — | +2 | — |
| B: 料理にハマる | -1 | +1 | — | +2 | — | — | — | — | — |
| C: スピリチュアルに目覚める | — | -2 | — | — | — | — | — | — | — |

#### #19 バ畜になる
> バイトに支配される生活。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: もっとシフトを入れる（金が要る） | -3 | +4 | — | -2 | — | — | +2 | — | — |
| B: シフトを減らして学業に戻る | +2 | -1 | +2 | +1 | +1 | — | — | — | — |
| C: バイトを変える | -1 | — | — | — | — | +1 | — | +1 | — |

#### #20 追いコン
> 先輩たちが卒業していく。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 盛大に送り出す | -1 | -2 | — | — | — | +2 | — | — | +1 |
| B: 先輩にキャリア相談する | — | -1 | — | — | — | +2 | — | — | — |
| C: 行かない | — | — | — | — | — | -1 | — | — | — |

#### #21 タバコ・酒・夜遊び
> 大学生活にも慣れすぎた。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 夜の世界を満喫する | -2 | -3 | — | -2 | — | +2 | — | — | +2 |
| B: 程よく楽しむ | -1 | -1 | — | -1 | — | +1 | — | — | +1 |
| C: 健康的な生活を送る | — | — | — | +2 | — | — | — | — | — |

#### #22 休学する？
> ふと立ち止まる。本当にこのままでいいのか。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 休学して自分を見つめ直す | +3 | -2 | -4 | +1 | — | — | — | +2 | — |
| B: 休学してワーホリに行く | +1 | -5 | -4 | — | +1 | +1 | +1 | +3 | — |
| C: 休学せず前に進む | — | — | +2 | — | — | — | — | — | — |

Flag: A/B → `on_leave = true` (next round credits gain halved, but special choices open)

#### #23 ミスコン・ミスターコンに出る
> 友達にノリで推薦された。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 出る | -2 | -2 | — | -1 | — | +3 | — | +2 | +2 |
| B: 裏方で支える | -1 | -1 | — | — | — | +2 | +1 | — | — |
| C: 辞退する | — | — | — | — | — | — | — | — | — |

#### #24 単位を落とす？（進級チェック）
> 3年終了。単位は足りてる？

This is a checkpoint event. Outcome depends on accumulated credits.
- credits >= 80: Safe. Choice below.
- credits < 80: Forced 留年 risk.

Safe:
| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 余裕がある。4年は自由に使える | +2 | — | — | +1 | — | — | — | — | — |
| B: ギリギリだが通過。気を引き締める | — | — | +2 | — | +1 | — | — | — | — |

Danger (credits < 80):
| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 死ぬ気で取り返す | -3 | — | +6 | -2 | +1 | — | +1 | — | — |
| B: 留年を受け入れる | +2 | -3 | +2 | -1 | — | — | — | — | — |

---

### Year 4: The Finale (#25-#32)

#### #25 ゼミに入る (BRANCH POINT 3 setup)
> 卒論が必要なゼミ、自由なゼミ、入らない選択。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: ガチゼミに入る（卒論必須） | -2 | — | +3 | -1 | +3 | +1 | — | — | — |
| B: ゆるいゼミに入る | -1 | — | +2 | — | +1 | +1 | — | — | — |
| C: ゼミに入らない | +1 | — | +1 | — | — | — | — | — | — |

Flag: A → `in_seminar = true` (thesis required)

#### #26 卒論 / 就活 / 進学 (BRANCH POINT 3)
> 4年の岐路。

Route A (safe_path): 就活メイン
Route B (challenge): 起業 / 院進 / 独自路線

Conditional: action_power >= 6 AND (intellect >= 5 OR connections >= 5) → Route B available
Otherwise: Route A only

##### Route A: Safe Path

###### #26A-1 就活戦線
> エントリーシート、面接、お祈りメール。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 大手を狙う | -3 | -2 | — | -2 | +1 | +1 | +1 | — | — |
| B: 中小・ベンチャーを攻める | -2 | -1 | — | -1 | — | +1 | +1 | +1 | — |
| C: 公務員試験 | -3 | -1 | — | -2 | +2 | — | +1 | — | — |

###### #26A-2 内定
> ついに。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 第一志望に決まった！ | — | — | — | +2 | — | — | — | — | — |
| B: 妥協したけど決まった | — | — | — | — | — | — | +1 | — | — |
| C: まだ決まってない… | -2 | -1 | — | -3 | — | — | — | — | — |

Conditional: work_tolerance >= 5 AND connections >= 4 → A probability up

##### Route B: Challenge Path

###### #26B-1 独自の道
> 普通の就活には収まらない。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 起業する | -3 | -5 | — | -2 | +1 | +2 | +1 | +3 | — |
| B: 大学院に進学する | -2 | -3 | +4 | -1 | +3 | +1 | — | — | — |
| C: フリーランスで生きる | -2 | +1 | — | -1 | +1 | — | +1 | +2 | — |

###### #26B-2 挑戦の結果
> 賭けた結果が出始める。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 手応えがある。突き進む | -1 | — | — | -1 | +1 | +1 | — | +2 | — |
| B: 苦しいが仲間がいる | -1 | -2 | — | -1 | — | +2 | +1 | +1 | — |
| C: 失敗。でも経験になった | +1 | -1 | — | -1 | +1 | — | +1 | +1 | — |

---

### Finale (main track, after branch 3 rejoin)

#### #27 卒論を書く
> in_seminar の人は避けられない。

Conditional on `in_seminar`:
| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 魂を込めて書く | -3 | — | +5 | -2 | +3 | — | +1 | — | — |
| B: なんとか書き上げる | -2 | — | +3 | -1 | +1 | — | — | — | — |
| C: 教授に泣きつく | -1 | — | +2 | — | — | +1 | — | — | — |

Not in seminar:
| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 空いた時間で最後の挑戦 | -1 | -1 | — | — | +1 | — | — | +2 | — |
| B: のんびり過ごす | +1 | — | — | +2 | — | — | — | — | — |

#### #28 恋人との関係
> 大学4年間の恋愛の結末。

Conditional on `has_partner`:
| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 結婚を考える | -1 | -2 | — | +1 | — | +2 | — | — | +3 |
| B: 遠距離になるけど続ける | — | -1 | — | — | — | +1 | — | +1 | +1 |
| C: 別れる | +1 | — | — | -2 | — | -1 | — | — | +1 |

No partner:
| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 最後のチャンスに賭ける | -1 | -1 | — | — | — | +1 | — | +1 | +2 |
| B: 友情を大事にする | — | -1 | — | — | — | +2 | — | — | — |
| C: 一人の時間を楽しむ | — | — | — | +1 | +1 | — | — | — | — |

#### #29 初任給・初ボーナス / 研修
> 社会人の入り口が見えてきた。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 仕事に全力投球 | -2 | +4 | — | -1 | +1 | +1 | +2 | — | — |
| B: ワークライフバランス重視 | — | +2 | — | +1 | — | +1 | +1 | — | — |
| C: まだ社会人じゃない（院進・留学中） | — | — | +2 | — | +2 | — | — | +1 | — |

#### #30 追いコン・卒業旅行
> 最後の思い出作り。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 卒業旅行に全力 | -2 | -4 | — | — | — | +3 | — | +1 | +2 |
| B: 追いコンで泣く | -1 | -2 | — | — | — | +2 | — | — | +1 |
| C: 静かに大学生活を振り返る | — | — | — | +2 | +1 | — | — | — | — |

#### #31 別れと旅立ち
> 4年間が終わる。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: みんなに感謝を伝える | — | — | — | +1 | — | +2 | — | — | +1 |
| B: 後輩に何かを残す | — | — | — | — | +1 | +1 | — | +1 | — |
| C: 黙って去る（カッコつけ） | — | — | — | — | — | — | — | +1 | — |

#### #32 ゴール — あなたの大学生活
> 4年間の結果が出る。

This is the result square. No choices — results are calculated.

---

## 5. Random Events (triggered by threshold rules)

These override the normal square event when conditions are met.

### 留年危機 (time < 6)
> 出席日数が足りない。教務課から呼び出し。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 生活を立て直す | +2 | -1 | +2 | — | — | — | — | — | — |
| B: もう無理…留年する | +3 | -3 | -8 | -1 | — | -1 | — | — | — |

### 緊急入院 (time < 4)
> 倒れた。病院のベッドで天井を見つめる。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: おとなしく休む | +3 | -2 | -2 | +3 | — | — | — | — | — |
| B: 点滴打ちながらレポートを書く | +1 | -2 | +1 | +1 | +1 | — | +1 | — | — |

### 金欠イベント (money < 0)
> 口座残高がマイナス。生活ができない。

| Choice | time | money | credits | health | intellect | connections | work_tolerance | action_power | romance_exp |
|--------|------|-------|---------|--------|-----------|-------------|----------------|--------------|-------------|
| A: 日払いバイトで食いつなぐ | -2 | +3 | — | -1 | — | — | +1 | — | — |
| B: 友達に借りる | — | +2 | — | — | — | -1 | — | — | — |
| C: 奨学金を申請する | -1 | +4 | — | — | +1 | — | — | — | — |

### 無灯火運転で捕まる (has_license, random 10%)
> 自転車の無灯火で警察に止められた。

Effect: money -1 (fixed, no choice)

---

## 6. Ending System

### 6.1 Score Calculation

Final score = weighted sum of all parameters:

```
total = (intellect × 3) + (connections × 3) + (work_tolerance × 2)
      + (action_power × 2) + (romance_exp × 1)
      + (health × 1) + (money × 0.5)
      + credit_bonus
```

credit_bonus:
- credits >= 124: +10 (卒業確定)
- credits >= 110: +5 (ギリギリ卒業)
- credits < 110: -10 (留年確定)

### 6.2 Ending Types

Based on highest experience axis:

| Condition | Ending Title | Description |
|-----------|-------------|-------------|
| intellect is highest | 📚 学究の道 | 知を追い求めた4年間。研究者か、それに近い何か。 |
| connections is highest | 🤝 愛されキャンパス王 | 誰からも慕われる存在。人脈が最大の財産。 |
| work_tolerance is highest | 💼 社畜予備軍…じゃなくてプロ社会人 | 即戦力。上司が泣いて喜ぶ新人。 |
| action_power is highest | 🚀 冒険者タイプ | 誰もやらないことをやった。起業か、旅か、革命か。 |
| romance_exp is highest | 💕 恋に生きた4年間 | 恋愛経験値MAX。結婚式のスピーチが長い。 |
| all axes balanced (within 2) | ⭐ バランス最強の理想型 | 何でもできる。器用貧乏とも言う。 |
| all axes low (all < 3) | 😴 虚無…だが自由 | 何もしなかった。でも後悔はない…たぶん。 |
| credits < 110 | 🔄 留年エンド | まだキャンパスにいる。もう1周。 |
| health <= 1 | 🏥 療養エンド | 頑張りすぎた。まずは休もう。 |
| money >= 15 AND work_tolerance >= 7 | 💰 稼ぐ現実主義者 | 金の力を知った学生時代。投資もう始めてそう。 |

### 6.3 Result Screen

Display for each player:
1. Player name
2. Ending title + description
3. Radar chart of 5 experience axes
4. Key life events recap (flags collected)
5. Total score + ranking

---

## 7. Special Event Ideas (from MTG)

These are flavor events that can be sprinkled into the random event pool:

| Event | Description | Effect |
|-------|-------------|--------|
| 壺を売りつけられる | 怪しいセミナーで壺を買わされそうになる | money -3 or action_power +1 (断る) |
| スピリチュアルにハマる | パワーストーンとか… | money -2, health +1 (精神的に) |
| 4Uで24時を越える | カラオケで夜を越える | health -1, connections +2, romance_exp +1 |
| トップファンに入る | 推し活が加速 | money -3, health +1 |
| 検定を受ける | なんとなく受けてみた | money -1, intellect +1 |

---

## 8. Implementation Priority

### Phase 1: Minimum Playable
- [ ] Parameter system (resources + experience axes)
- [ ] 32 main track events with choices
- [ ] Turn-based play with dice
- [ ] Basic score calculation
- [ ] Simple ending screen

### Phase 2: Branches & Depth
- [ ] 3 branch points with parallel routes
- [ ] Special state flags affecting events
- [ ] Conditional choices (locked/unlocked based on stats)
- [ ] Threshold random events

### Phase 3: Polish
- [ ] Radar chart on result screen
- [ ] Life event recap
- [ ] Sound effects / animations
- [ ] Better mobile UI
- [ ] Flavor random events (壺, スピ, etc.)

---

## 9. Design Principles

1. **No correct answer** — Every choice has trade-offs
2. **Time is the heaviest resource** — You can't do everything
3. **Experience unlocks options** — Past choices shape future possibilities
4. **Characters emerge from play** — The fun is in seeing what kind of person you became
5. **Keep it fast** — Each turn should take 15-30 seconds per player
6. **Conversation catalyst** — Events should make people laugh and discuss
