/**
 * Campus Life Game — ゲームバランス検証シミュレーター
 *
 * 使い方:
 *   node scripts/simulate.mjs [オプション]
 *
 * オプション:
 *   --runs    N     シミュレーション回数 (デフォルト: 1000)
 *   --players N     1回あたりのプレイヤー数 (デフォルト: 5)
 *   --strategy      persona (デフォルト) / random / spread
 *   --temperature F ペルソナの選択ぶれ幅。小さいほど価値観に忠実 (デフォルト: 2.0)
 *   --verbose       各ランの詳細を出力
 *   --json          JSON 形式で出力 (CI等での機械読み取り用)
 */

import { TIMELINE_EVENTS } from "../server/timelineEvents.js";
import {
  createTimelinePlayer,
  applyTimelineChoice,
  generateTimelineResults,
  LIFE_TRAIT_KEYS,
} from "../server/timelineGame.js";

// ─── CLI 引数パース ─────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return defaultVal;
  return args[idx + 1] ?? defaultVal;
}
function hasFlag(name) { return args.includes(`--${name}`); }

const RUNS        = parseInt(getArg("runs", "1000"), 10);
const PLAYERS_PER_RUN = parseInt(getArg("players", "5"), 10);
const STRATEGY    = getArg("strategy", "persona");
const TEMPERATURE = parseFloat(getArg("temperature", "2.0"));
const VERBOSE     = hasFlag("verbose");
const AS_JSON     = hasFlag("json");

// ─── ペルソナ定義 ───────────────────────────────────────────────────
// weights: 各トレイトに対する重み。正 = 欲しい、負 = 避ける
// 合計を一定にしていないが、相対的な優先度として機能する

const PERSONAS = [
  {
    type: "真面目な優等生",
    description: "単位と将来を最優先。安定した生活を好む。",
    weights: {
      academic: 4, stability: 2, wellbeing: 1,
      relationships: 0, freedom: -1, challenge: 0,
      career: 2, memory: 0, selfhood: 1,
    },
    // 体力・安定が極端に下がったら警戒する
    stressThresholds: { wellbeing: 3, stability: 2 },
  },
  {
    type: "社交的なムードメーカー",
    description: "友達と思い出を作ることが大事。ノリを大切にする。",
    weights: {
      academic: 0, stability: -1, wellbeing: 1,
      relationships: 4, freedom: 1, challenge: 1,
      career: 0, memory: 3, selfhood: 0,
    },
    stressThresholds: { wellbeing: 2, academic: 3 },
  },
  {
    type: "自由な一匹狼",
    description: "自分のペースで生きたい。縛られることを嫌う。",
    weights: {
      academic: -1, stability: -2, wellbeing: 1,
      relationships: -1, freedom: 4, challenge: 1,
      career: 0, memory: 1, selfhood: 4,
    },
    stressThresholds: { wellbeing: 2, academic: 2 },
  },
  {
    type: "就活ガチ勢",
    description: "将来のキャリアに全集中。インターンや資格を積極的に取る。",
    weights: {
      academic: 2, stability: 1, wellbeing: -1,
      relationships: 1, freedom: -1, challenge: 3,
      career: 4, memory: 0, selfhood: 0,
    },
    stressThresholds: { wellbeing: 1, academic: 3 },
  },
  {
    type: "自分探し中の放浪者",
    description: "何をしたいかわからないが、挑戦し続ける。安定より変化を求める。",
    weights: {
      academic: 0, stability: -2, wellbeing: 0,
      relationships: 1, freedom: 3, challenge: 3,
      career: 0, memory: 1, selfhood: 4,
    },
    stressThresholds: { wellbeing: 2, academic: 2 },
  },
  {
    type: "コミュ力お化け",
    description: "人脈と挑戦を重視。無茶も厭わないタイプ。",
    weights: {
      academic: 0, stability: -1, wellbeing: -1,
      relationships: 4, freedom: 0, challenge: 3,
      career: 1, memory: 3, selfhood: 0,
    },
    stressThresholds: { wellbeing: 1, academic: 3 },
  },
  {
    type: "ほどほど生活者",
    description: "特に尖らず、バランスよく大学生活を送る。大きな失敗も成功もしない。",
    weights: {
      academic: 1, stability: 2, wellbeing: 2,
      relationships: 1, freedom: 1, challenge: 1,
      career: 1, memory: 1, selfhood: 1,
    },
    stressThresholds: { wellbeing: 3, stability: 3 },
  },
];

// ─── ペルソナベースの選択ロジック ─────────────────────────────────

/**
 * ソフトマックス: スコア → 確率分布
 * temperature が高いほどランダム寄り、低いほど価値観に忠実
 */
function softmax(scores, temperature) {
  const maxScore = Math.max(...scores);
  const exps = scores.map((s) => Math.exp((s - maxScore) / temperature));
  const total = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / total);
}

/**
 * ストレス補正: 特定のトレイトが低いとき、それを回復する選択肢にボーナスを加える
 */
function stressBonus(choice, player, persona) {
  let bonus = 0;
  const traits = player.traits;
  const thresholds = persona.stressThresholds ?? {};
  const effects = choice.effects ?? {};
  for (const [trait, threshold] of Object.entries(thresholds)) {
    if ((traits[trait] ?? 6) <= threshold) {
      // このトレイトが危険水域 → 回復する選択にボーナス
      bonus += (effects[trait] ?? 0) * 2;
    }
  }
  return bonus;
}

function pickChoiceByPersona(event, player, persona, temperature) {
  const choices = event.choices;
  if (choices.length === 0) return null;

  const scores = choices.map((choice) => {
    const effects = choice.effects ?? {};
    let score = 0;
    for (const trait of LIFE_TRAIT_KEYS) {
      score += (persona.weights[trait] ?? 0) * (effects[trait] ?? 0);
    }
    // ストレス補正（危機的な状態なら多少価値観から外れた行動もする）
    score += stressBonus(choice, player, persona);
    return score;
  });

  const probs = softmax(scores, temperature);
  let rand = Math.random();
  for (let i = 0; i < choices.length; i++) {
    rand -= probs[i];
    if (rand <= 0) return choices[i];
  }
  return choices[choices.length - 1];
}

// ─── その他の選択戦略 ────────────────────────────────────────────────

function pickChoiceRandom(event) {
  const choices = event.choices;
  return choices[Math.floor(Math.random() * choices.length)] ?? null;
}

function pickChoiceSpread(event, playerIndex) {
  const choices = event.choices;
  return choices[playerIndex % choices.length] ?? null;
}

// ─── 1回のシミュレーション ──────────────────────────────────────────

const PLAYER_NAMES = [
  "Aoi", "Riku", "Hana", "Sora", "Kai",
  "Mio", "Ren", "Yuki", "Hiro", "Nana",
  "Tomo", "Shun", "Emi", "Kenji", "Sakura",
];

function runSimulation(runIndex) {
  const numPlayers = Math.min(PLAYERS_PER_RUN, PLAYER_NAMES.length);

  // ペルソナをランダム割り当て（重複なし、足りなければ再利用）
  const shuffledPersonas = [...PERSONAS].sort(() => Math.random() - 0.5);
  const assignedPersonas = Array.from({ length: numPlayers }, (_, i) =>
    shuffledPersonas[i % shuffledPersonas.length]
  );

  let players = Array.from({ length: numPlayers }, (_, i) =>
    createTimelinePlayer(`p${i}`, PLAYER_NAMES[(runIndex * numPlayers + i) % PLAYER_NAMES.length])
  );

  const choiceLog = [];

  for (const event of TIMELINE_EVENTS) {
    players = players.map((player, playerIndex) => {
      let choice;
      if (STRATEGY === "random") {
        choice = pickChoiceRandom(event);
      } else if (STRATEGY === "spread") {
        choice = pickChoiceSpread(event, playerIndex);
      } else {
        // persona (default)
        choice = pickChoiceByPersona(event, player, assignedPersonas[playerIndex], TEMPERATURE);
      }
      if (!choice) return player;
      choiceLog.push({
        eventId: event.id,
        choiceId: choice.id,
        choiceLabel: choice.label,
        playerIndex,
        personaType: assignedPersonas[playerIndex]?.type ?? "random",
      });
      return applyTimelineChoice(player, event, choice);
    });
  }

  const results = generateTimelineResults(players);
  return { results, choiceLog, assignedPersonas };
}

// ─── 統計ヘルパー ────────────────────────────────────────────────────

function mean(arr) {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}
function stddev(arr) {
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
}
function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor((p / 100) * (sorted.length - 1))] ?? 0;
}
function shannonEntropy(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  return -Object.values(counts)
    .filter((c) => c > 0)
    .reduce((sum, c) => sum + (c / total) * Math.log2(c / total), 0);
}
function maxEntropy(n) { return n > 1 ? Math.log2(n) : 0; }

// ─── choiceMode 事前検証 ──────────────────────────────────────────

function verifyChoiceModes() {
  const issues = [];
  for (const event of TIMELINE_EVENTS) {
    if (event.choiceMode !== undefined &&
        event.choiceMode !== "simultaneous" &&
        event.choiceMode !== "sequential") {
      issues.push(`Event ${event.id}: 不明な choiceMode "${event.choiceMode}"`);
    }
    if (event.choices.length === 0) {
      issues.push(`Event ${event.id}: 選択肢なし`);
    }
  }
  const modeCount = { simultaneous: 0, sequential: 0, unset: 0 };
  for (const event of TIMELINE_EVENTS) {
    if (event.choiceMode === "simultaneous") modeCount.simultaneous++;
    else if (event.choiceMode === "sequential") modeCount.sequential++;
    else modeCount.unset++;
  }
  return { issues, modeCount };
}

// ─── メイン ──────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  const { issues: modeIssues, modeCount } = verifyChoiceModes();

  // 集計バッファ
  const academicCounts   = {};
  const archetypeCounts  = {};
  const storyAwardCounts = {};
  const traitSamples     = Object.fromEntries(LIFE_TRAIT_KEYS.map((k) => [k, []]));
  const storyTagCounts   = {};
  const choiceCounts     = {};
  const storyTagsPerPlayer = [];
  const uniqueArchetypesPerRun = [];

  // ペルソナ別の結果追跡
  const personaStats = Object.fromEntries(
    PERSONAS.map((p) => [p.type, { academic: {}, archetype: {}, traitSamples: Object.fromEntries(LIFE_TRAIT_KEYS.map((k) => [k, []])), count: 0 }])
  );

  for (const event of TIMELINE_EVENTS) {
    choiceCounts[event.id] = {};
    for (const choice of event.choices) {
      choiceCounts[event.id][choice.id] = { count: 0, label: choice.label };
    }
  }

  let totalPlayers = 0;

  for (let i = 0; i < RUNS; i++) {
    const { results, choiceLog, assignedPersonas } = runSimulation(i);

    for (const log of choiceLog) {
      if (choiceCounts[log.eventId]?.[log.choiceId]) {
        choiceCounts[log.eventId][log.choiceId].count++;
      }
    }

    const archetypesThisRun = new Set();

    for (let pi = 0; pi < results.length; pi++) {
      const result = results[pi];
      const persona = assignedPersonas[pi];
      totalPlayers++;

      const academicKey  = result.academicStatus?.title ?? "不明";
      const archetypeKey = result.lifeArchetype?.title  ?? "不明";
      const awardKey     = result.storyAward?.title     ?? "なし";

      academicCounts[academicKey]   = (academicCounts[academicKey]   ?? 0) + 1;
      archetypeCounts[archetypeKey] = (archetypeCounts[archetypeKey] ?? 0) + 1;
      storyAwardCounts[awardKey]    = (storyAwardCounts[awardKey]    ?? 0) + 1;
      archetypesThisRun.add(archetypeKey);

      for (const key of LIFE_TRAIT_KEYS) {
        traitSamples[key].push(result.traits[key] ?? 0);
      }
      for (const tag of result.storyTags ?? []) {
        storyTagCounts[tag] = (storyTagCounts[tag] ?? 0) + 1;
      }
      storyTagsPerPlayer.push(result.storyTags?.length ?? 0);

      // ペルソナ別集計
      if (persona) {
        const ps = personaStats[persona.type];
        if (ps) {
          ps.count++;
          ps.academic[academicKey] = (ps.academic[academicKey] ?? 0) + 1;
          ps.archetype[archetypeKey] = (ps.archetype[archetypeKey] ?? 0) + 1;
          for (const key of LIFE_TRAIT_KEYS) {
            ps.traitSamples[key].push(result.traits[key] ?? 0);
          }
        }
      }

      if (VERBOSE && i < 2) {
        const personaLabel = persona?.type ?? "random";
        console.error(`[run ${i + 1}] ${result.playerName} (${personaLabel}): ${archetypeKey} / ${academicKey}`);
      }
    }

    uniqueArchetypesPerRun.push(archetypesThisRun.size);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  // ─── JSON 出力 ─────────────────────────────────────────────────
  if (AS_JSON) {
    const output = {
      meta: { runs: RUNS, playersPerRun: PLAYERS_PER_RUN, strategy: STRATEGY, temperature: TEMPERATURE, totalPlayers, elapsedSec: parseFloat(elapsed) },
      choiceModeVerification: { issues: modeIssues, modeCount },
      academicResults: Object.fromEntries(
        Object.entries(academicCounts).map(([k, v]) => [k, { count: v, pct: ((v / totalPlayers) * 100).toFixed(1) }])
      ),
      archetypeDistribution: Object.fromEntries(
        Object.entries(archetypeCounts).sort(([, a], [, b]) => b - a).map(([k, v]) => [k, { count: v, pct: ((v / totalPlayers) * 100).toFixed(1) }])
      ),
      traitStats: Object.fromEntries(
        LIFE_TRAIT_KEYS.map((k) => [k, {
          mean: mean(traitSamples[k]).toFixed(2),
          stddev: stddev(traitSamples[k]).toFixed(2),
          min: Math.min(...traitSamples[k]),
          max: Math.max(...traitSamples[k]),
          p10: percentile(traitSamples[k], 10),
          p90: percentile(traitSamples[k], 90),
        }])
      ),
      personaResults: Object.fromEntries(
        Object.entries(personaStats).map(([type, ps]) => [type, {
          count: ps.count,
          academicDistribution: Object.fromEntries(
            Object.entries(ps.academic).map(([k, v]) => [k, { count: v, pct: ((v / ps.count) * 100).toFixed(1) }])
          ),
          archetypeDistribution: Object.fromEntries(
            Object.entries(ps.archetype).map(([k, v]) => [k, { count: v, pct: ((v / ps.count) * 100).toFixed(1) }])
          ),
          traitMeans: Object.fromEntries(
            LIFE_TRAIT_KEYS.map((k) => [k, mean(ps.traitSamples[k]).toFixed(2)])
          ),
        }])
      ),
      choiceCoverage: choiceCounts,
      diversity: {
        archetypeEntropy: shannonEntropy(archetypeCounts).toFixed(3),
        archetypeMaxEntropy: maxEntropy(Object.keys(archetypeCounts).length).toFixed(3),
        avgStoryTagsPerPlayer: mean(storyTagsPerPlayer).toFixed(2),
        avgUniqueArchetypesPerRun: mean(uniqueArchetypesPerRun).toFixed(2),
      },
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // ─── 人間向け出力 ───────────────────────────────────────────────
  const HR = "─".repeat(58);

  console.log(`\n${"═".repeat(58)}`);
  console.log("  Campus Life Game シミュレーション結果");
  console.log(`${"═".repeat(58)}`);
  console.log(`  実行: ${RUNS.toLocaleString()}回  |  ${PLAYERS_PER_RUN}人/回  |  戦略: ${STRATEGY}  |  temperature: ${TEMPERATURE}`);
  console.log(`  総プレイヤー: ${totalPlayers.toLocaleString()}  |  処理時間: ${elapsed}s`);
  console.log();

  // choiceMode 検証
  console.log("【choiceMode 検証】");
  console.log(`  simultaneous: ${modeCount.simultaneous}  sequential: ${modeCount.sequential}  未設定: ${modeCount.unset}`);
  if (modeIssues.length === 0) {
    console.log("  ✅ 問題なし");
  } else {
    for (const issue of modeIssues) console.log(`  ⚠️  ${issue}`);
  }
  console.log();

  // 学業結果
  console.log("【学業結果】");
  for (const [label, count] of Object.entries(academicCounts).sort(([, a], [, b]) => b - a)) {
    const pct = ((count / totalPlayers) * 100).toFixed(1);
    console.log(`  ${label.padEnd(22)} ${pct.padStart(5)}%  ${"█".repeat(Math.round(parseFloat(pct) / 2))}`);
  }
  console.log();

  // アーキタイプ分布
  const arcEnt = shannonEntropy(archetypeCounts);
  const arcMax = maxEntropy(Object.keys(archetypeCounts).length);
  const arcBal = arcMax > 0 ? (arcEnt / arcMax * 100).toFixed(0) : "N/A";
  console.log(`【人生アーキタイプ分布】  均等度: ${arcBal}%  (エントロピー: ${arcEnt.toFixed(2)} / 最大: ${arcMax.toFixed(2)})`);
  for (const [label, count] of Object.entries(archetypeCounts).sort(([, a], [, b]) => b - a)) {
    const pct = ((count / totalPlayers) * 100).toFixed(1);
    console.log(`  ${label.padEnd(24)} ${pct.padStart(5)}%  ${"█".repeat(Math.round(parseFloat(pct) / 2))}`);
  }
  console.log(`  平均アーキタイプ種類数/ラン: ${mean(uniqueArchetypesPerRun).toFixed(1)} / ${PLAYERS_PER_RUN}人`);
  console.log();

  // ペルソナ別結果
  console.log("【ペルソナ別 結果サマリー】");
  console.log(`  ${HR}`);
  for (const [type, ps] of Object.entries(personaStats)) {
    if (ps.count === 0) continue;
    const topAcademic  = Object.entries(ps.academic).sort(([, a], [, b]) => b - a)[0];
    const topArchetype = Object.entries(ps.archetype).sort(([, a], [, b]) => b - a)[0];
    const topAcademicPct  = topAcademic  ? ((topAcademic[1]  / ps.count) * 100).toFixed(0) : "?";
    const topArchetypePct = topArchetype ? ((topArchetype[1] / ps.count) * 100).toFixed(0) : "?";
    const avgAcademic = mean(ps.traitSamples.academic).toFixed(1);
    console.log(`  ${type}`);
    console.log(`    学業: ${topAcademic?.[0] ?? "?"} ${topAcademicPct}%  /  archetype: ${topArchetype?.[0] ?? "?"} ${topArchetypePct}%  /  academic trait 平均: ${avgAcademic}`);
  }
  console.log();

  // トレイト最終値
  console.log("【トレイト最終値統計】");
  console.log(`  ${"トレイト".padEnd(14)} ${"平均".padStart(5)}  ${"±".padStart(1)}${"SD".padStart(4)}  ${"最小".padStart(4)}  ${"最大".padStart(4)}  P10-P90`);
  console.log(`  ${HR}`);
  for (const key of LIFE_TRAIT_KEYS) {
    const s = traitSamples[key];
    const m = mean(s).toFixed(1);
    const sd = stddev(s).toFixed(1);
    const mn = Math.min(...s);
    const mx = Math.max(...s);
    const p10 = percentile(s, 10);
    const p90 = percentile(s, 90);
    // 平均が低すぎ or 高すぎる場合に警告
    const meanF = parseFloat(m);
    const flag = meanF <= 3 ? " 🔴低" : meanF >= 17 ? " 🟡高" : "";
    console.log(`  ${key.padEnd(14)} ${m.padStart(5)}  ±${sd.padStart(4)}  ${String(mn).padStart(4)}  ${String(mx).padStart(4)}  ${p10}–${p90}${flag}`);
  }
  console.log();

  // 選択肢使用率 (偏りチェック)
  console.log("【選択肢使用率 (偏りチェック)】");
  let biasFound = false;
  for (const event of TIMELINE_EVENTS) {
    const ec = choiceCounts[event.id];
    const total = Object.values(ec).reduce((a, { count }) => a + count, 0);
    if (total === 0) continue;
    const pcts = Object.values(ec).map(({ count }) => (count / total) * 100);
    const maxP = Math.max(...pcts);
    const minP = Math.min(...pcts);
    const isBiased = maxP - minP > 25;
    if (isBiased) biasFound = true;
    const modeLabel = event.choiceMode === "simultaneous" ? "一斉" : event.choiceMode === "sequential" ? "個別" : "未設定";
    const biasFlag = isBiased ? " ⚠️ 偏り" : "";
    console.log(`  ${event.label ?? event.id} [${modeLabel}]${biasFlag}`);
    for (const [, { label, count }] of Object.entries(ec)) {
      const pct = ((count / total) * 100).toFixed(1);
      const bar = "▪".repeat(Math.round(parseFloat(pct) / 5));
      console.log(`    ${label.padEnd(30)} ${pct.padStart(5)}%  ${bar}`);
    }
  }
  if (!biasFound) console.log("  ✅ 大きな偏りなし");
  console.log();

  // ストーリータグ多様性
  console.log("【ストーリータグ多様性】");
  console.log(`  プレイヤーあたり平均タグ数: ${mean(storyTagsPerPlayer).toFixed(1)}  (min: ${Math.min(...storyTagsPerPlayer)}, max: ${Math.max(...storyTagsPerPlayer)})`);
  const topTags = Object.entries(storyTagCounts).sort(([, a], [, b]) => b - a).slice(0, 12);
  console.log("  頻出 top12:");
  for (const [tag, count] of topTags) {
    const pct = ((count / totalPlayers) * 100).toFixed(1);
    console.log(`    ${tag.padEnd(16)} ${pct.padStart(5)}%`);
  }
  console.log();

  // ストーリーアワード
  console.log("【ストーリーアワード分布】");
  for (const [label, count] of Object.entries(storyAwardCounts).sort(([, a], [, b]) => b - a)) {
    const pct = ((count / totalPlayers) * 100).toFixed(1);
    console.log(`  ${label.padEnd(26)} ${pct.padStart(5)}%`);
  }
  console.log();

  // 総評
  console.log("【バランス総評】");
  const arcBalNum = parseFloat(arcBal);
  console.log(arcBalNum >= 70 ? "  ✅ アーキタイプ分布は均等" : arcBalNum >= 50 ? `  🟡 アーキタイプにやや偏り (${arcBal}%)` : `  🔴 アーキタイプに大きな偏り (${arcBal}%) — 要調整`);
  if (modeIssues.length === 0) console.log("  ✅ choiceMode フィールドに問題なし");
  else console.log(`  🔴 choiceMode に ${modeIssues.length} 件の問題`);
  const lowTraits = LIFE_TRAIT_KEYS.filter((k) => mean(traitSamples[k]) <= 3);
  const highTraits = LIFE_TRAIT_KEYS.filter((k) => mean(traitSamples[k]) >= 17);
  if (lowTraits.length > 0) console.log(`  🔴 慢性的に低いトレイト: ${lowTraits.join(", ")}`);
  if (highTraits.length > 0) console.log(`  🟡 上限張り付きトレイト: ${highTraits.join(", ")}`);
  if (lowTraits.length === 0 && highTraits.length === 0) console.log("  ✅ トレイトのバランスに大きな問題なし");
  console.log();
  console.log(`${"═".repeat(58)}\n`);
}

main().catch((err) => {
  console.error("シミュレーション失敗:", err);
  process.exit(1);
});
