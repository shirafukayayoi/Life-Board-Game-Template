/**
 * Campus Life Game — ゲームバランス検証シミュレーター
 *
 * 使い方:
 *   node scripts/simulate.mjs [オプション]
 *
 * オプション:
 *   --runs    N     シミュレーション回数 (デフォルト: 1000)
 *   --players N     1回あたりのプレイヤー数 (デフォルト: 5)
 *   --strategy      選択戦略: random (デフォルト) / spread / all-same
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
function hasFlag(name) {
  return args.includes(`--${name}`);
}

const RUNS = parseInt(getArg("runs", "1000"), 10);
const PLAYERS_PER_RUN = parseInt(getArg("players", "5"), 10);
const STRATEGY = getArg("strategy", "random"); // random | spread | all-same
const VERBOSE = hasFlag("verbose");
const AS_JSON = hasFlag("json");

const PLAYER_NAMES = [
  "Aoi", "Riku", "Hana", "Sora", "Kai",
  "Mio", "Ren", "Yuki", "Hiro", "Nana",
  "Tomo", "Shun", "Emi", "Kenji", "Sakura",
];

// ─── 選択戦略 ───────────────────────────────────────────────────────

/**
 * random: 全プレイヤーが完全ランダムに選ぶ
 * spread: プレイヤーごとに異なる選択肢を割り当て (多様性を最大化)
 * all-same: 全プレイヤーが同じ選択肢を選ぶ (極端なケースのテスト)
 */
function pickChoice(event, playerIndex, strategy) {
  const choices = event.choices;
  if (choices.length === 0) return null;
  if (strategy === "spread") {
    return choices[playerIndex % choices.length];
  }
  if (strategy === "all-same") {
    return choices[0];
  }
  // random (default)
  return choices[Math.floor(Math.random() * choices.length)];
}

// ─── 1回のシミュレーション ──────────────────────────────────────────

function runSimulation(runIndex) {
  const numPlayers = Math.min(PLAYERS_PER_RUN, PLAYER_NAMES.length);
  let players = Array.from({ length: numPlayers }, (_, i) =>
    createTimelinePlayer(`p${i}`, PLAYER_NAMES[(runIndex * numPlayers + i) % PLAYER_NAMES.length])
  );

  const choiceLog = []; // { eventId, choiceId, choiceLabel, playerIndex }[]

  for (const event of TIMELINE_EVENTS) {
    players = players.map((player, playerIndex) => {
      const choice = pickChoice(event, playerIndex, STRATEGY);
      if (!choice) return player;
      choiceLog.push({ eventId: event.id, choiceId: choice.id, choiceLabel: choice.label, playerIndex });
      return applyTimelineChoice(player, event, choice);
    });
  }

  return { results: generateTimelineResults(players), choiceLog };
}

// ─── 統計集計 ───────────────────────────────────────────────────────

function mean(arr) {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr) {
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((x) => (x - m) ** 2)));
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx];
}

/** Shannon entropy (bits): 高いほど分布が均等 */
function shannonEntropy(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  return -Object.values(counts)
    .filter((c) => c > 0)
    .reduce((sum, c) => {
      const p = c / total;
      return sum + p * Math.log2(p);
    }, 0);
}

function maxEntropy(numCategories) {
  return numCategories > 1 ? Math.log2(numCategories) : 0;
}

// ─── メイン ─────────────────────────────────────────────────────────

// choiceMode 検証 (個別モード / 一斉モードの field が正しく設定されているか)
function verifyChoiceModes() {
  const issues = [];
  for (const event of TIMELINE_EVENTS) {
    if (event.choiceMode !== undefined && event.choiceMode !== "simultaneous" && event.choiceMode !== "sequential") {
      issues.push(`Event ${event.id}: unknown choiceMode "${event.choiceMode}"`);
    }
    if (event.choices.length === 0) {
      issues.push(`Event ${event.id}: no choices`);
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

async function main() {
  const startTime = Date.now();

  // choiceMode 事前検証
  const { issues: modeIssues, modeCount } = verifyChoiceModes();

  // 統計カウンター初期化
  const academicCounts = {};
  const archetypeCounts = {};
  const storyAwardCounts = {};
  const traitSamples = Object.fromEntries(LIFE_TRAIT_KEYS.map((k) => [k, []]));
  const storyTagCounts = {};
  const choiceCounts = {}; // eventId -> choiceId -> count
  const storyTagsPerPlayer = [];
  const uniqueArchetypesPerRun = [];

  for (const event of TIMELINE_EVENTS) {
    choiceCounts[event.id] = {};
    for (const choice of event.choices) {
      choiceCounts[event.id][choice.id] = { count: 0, label: choice.label };
    }
  }

  let totalPlayers = 0;

  for (let i = 0; i < RUNS; i++) {
    const { results, choiceLog } = runSimulation(i);

    // 選択ログ集計
    for (const log of choiceLog) {
      if (choiceCounts[log.eventId]?.[log.choiceId]) {
        choiceCounts[log.eventId][log.choiceId].count++;
      }
    }

    const archetypesThisRun = new Set();

    for (const result of results) {
      totalPlayers++;

      // 学業結果
      const academicKey = result.academicStatus?.title ?? "不明";
      academicCounts[academicKey] = (academicCounts[academicKey] ?? 0) + 1;

      // アーキタイプ
      const archetypeKey = result.lifeArchetype?.title ?? "不明";
      archetypeCounts[archetypeKey] = (archetypeCounts[archetypeKey] ?? 0) + 1;
      archetypesThisRun.add(archetypeKey);

      // ストーリーアワード
      const awardKey = result.storyAward?.title ?? "なし";
      storyAwardCounts[awardKey] = (storyAwardCounts[awardKey] ?? 0) + 1;

      // トレイト最終値
      for (const key of LIFE_TRAIT_KEYS) {
        traitSamples[key].push(result.traits[key] ?? 0);
      }

      // ストーリータグ
      for (const tag of result.storyTags ?? []) {
        storyTagCounts[tag] = (storyTagCounts[tag] ?? 0) + 1;
      }
      storyTagsPerPlayer.push(result.storyTags?.length ?? 0);

      if (VERBOSE && i < 3) {
        console.error(`[run ${i + 1}] ${result.playerName}: ${archetypeKey} / ${academicKey} / tags: ${result.storyTags?.slice(0, 4).join(", ")}`);
      }
    }

    uniqueArchetypesPerRun.push(archetypesThisRun.size);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  // ─── 出力 ────────────────────────────────────────────────────────
  if (AS_JSON) {
    const output = {
      meta: { runs: RUNS, playersPerRun: PLAYERS_PER_RUN, strategy: STRATEGY, totalPlayers, elapsedSec: parseFloat(elapsed) },
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

  // ─── 人間向け出力 ────────────────────────────────────────────────
  const hr = "─".repeat(56);

  console.log(`\n${"═".repeat(56)}`);
  console.log(" Campus Life Game シミュレーション結果");
  console.log(`${"═".repeat(56)}`);
  console.log(`  実行回数: ${RUNS.toLocaleString()} 回  |  プレイヤー数/回: ${PLAYERS_PER_RUN}  |  戦略: ${STRATEGY}`);
  console.log(`  総プレイヤー: ${totalPlayers.toLocaleString()}  |  処理時間: ${elapsed}s`);
  console.log();

  // choiceMode 検証
  console.log(`【choiceMode 検証】`);
  console.log(`  simultaneous: ${modeCount.simultaneous}イベント  sequential: ${modeCount.sequential}イベント  未設定: ${modeCount.unset}イベント`);
  if (modeIssues.length === 0) {
    console.log(`  ✅ 問題なし`);
  } else {
    for (const issue of modeIssues) console.log(`  ⚠️  ${issue}`);
  }
  console.log();

  // 学業結果
  console.log(`【学業結果 (留年・卒業)】`);
  const sortedAcademic = Object.entries(academicCounts).sort(([, a], [, b]) => b - a);
  for (const [label, count] of sortedAcademic) {
    const pct = ((count / totalPlayers) * 100).toFixed(1);
    const bar = "█".repeat(Math.round(parseFloat(pct) / 2));
    console.log(`  ${label.padEnd(20)} ${pct.padStart(5)}%  ${bar}`);
  }
  console.log();

  // アーキタイプ分布
  const archetypeEntropy = shannonEntropy(archetypeCounts);
  const archetypeMax = maxEntropy(Object.keys(archetypeCounts).length);
  const archetypeBalance = archetypeMax > 0 ? (archetypeEntropy / archetypeMax * 100).toFixed(0) : "N/A";
  console.log(`【人生アーキタイプ分布】  (均等度: ${archetypeBalance}% / エントロピー: ${archetypeEntropy.toFixed(2)} / 最大: ${archetypeMax.toFixed(2)})`);
  const sortedArchetype = Object.entries(archetypeCounts).sort(([, a], [, b]) => b - a);
  for (const [label, count] of sortedArchetype) {
    const pct = ((count / totalPlayers) * 100).toFixed(1);
    const bar = "█".repeat(Math.round(parseFloat(pct) / 2));
    console.log(`  ${label.padEnd(22)} ${pct.padStart(5)}%  ${bar}`);
  }
  console.log(`  → 1ラン内のアーキタイプ平均種類数: ${mean(uniqueArchetypesPerRun).toFixed(1)} / ${PLAYERS_PER_RUN}人`);
  console.log();

  // トレイト最終値
  console.log(`【トレイト最終値統計 (全プレイヤー)】`);
  console.log(`  ${"トレイト".padEnd(14)} ${"平均".padStart(6)}  ${"標準偏差".padStart(8)}  ${"最小".padStart(4)}  ${"最大".padStart(4)}  P10-P90`);
  console.log(`  ${hr}`);
  for (const key of LIFE_TRAIT_KEYS) {
    const s = traitSamples[key];
    const m = mean(s).toFixed(1);
    const sd = stddev(s).toFixed(1);
    const mn = Math.min(...s);
    const mx = Math.max(...s);
    const p10 = percentile(s, 10);
    const p90 = percentile(s, 90);
    console.log(`  ${key.padEnd(14)} ${m.padStart(6)}  ${sd.padStart(8)}  ${String(mn).padStart(4)}  ${String(mx).padStart(4)}  ${p10}–${p90}`);
  }
  console.log();

  // 選択肢の使用分布 (偏りチェック)
  console.log(`【選択肢使用率 (偏りチェック)】`);
  let hasChoiceBias = false;
  for (const event of TIMELINE_EVENTS) {
    const eventChoices = choiceCounts[event.id];
    const totalForEvent = Object.values(eventChoices).reduce((a, { count }) => a + count, 0);
    if (totalForEvent === 0) continue;
    const pcts = Object.values(eventChoices).map(({ count }) => (count / totalForEvent) * 100);
    const maxPct = Math.max(...pcts);
    const minPct = Math.min(...pcts);
    const isBiased = maxPct - minPct > 30 && STRATEGY === "random";
    if (isBiased) hasChoiceBias = true;

    const modeLabel = event.choiceMode === "simultaneous" ? "[一斉]" : event.choiceMode === "sequential" ? "[個別]" : "[未設定]";
    console.log(`  ${event.label ?? event.id}  ${modeLabel}`);
    for (const [choiceId, { label, count }] of Object.entries(eventChoices)) {
      const pct = ((count / totalForEvent) * 100).toFixed(1);
      const flag = STRATEGY === "random" && parseFloat(pct) > 40 ? " ⚠️ 偏り" : "";
      console.log(`    ${label.padEnd(28)} ${pct.padStart(5)}%${flag}`);
    }
  }
  if (!hasChoiceBias) console.log(`  ✅ 大きな偏りなし`);
  console.log();

  // ストーリータグ多様性
  console.log(`【ストーリータグ多様性】`);
  console.log(`  プレイヤーあたり平均タグ数: ${mean(storyTagsPerPlayer).toFixed(1)} (最小: ${Math.min(...storyTagsPerPlayer)}, 最大: ${Math.max(...storyTagsPerPlayer)})`);
  const topTags = Object.entries(storyTagCounts).sort(([, a], [, b]) => b - a).slice(0, 10);
  console.log(`  頻出トップ10:`);
  for (const [tag, count] of topTags) {
    const pct = ((count / totalPlayers) * 100).toFixed(1);
    console.log(`    ${tag.padEnd(16)} ${pct.padStart(5)}%`);
  }
  console.log();

  // ストーリーアワード分布
  console.log(`【ストーリーアワード分布】`);
  const sortedAwards = Object.entries(storyAwardCounts).sort(([, a], [, b]) => b - a);
  for (const [label, count] of sortedAwards) {
    const pct = ((count / totalPlayers) * 100).toFixed(1);
    console.log(`  ${label.padEnd(24)} ${pct.padStart(5)}%`);
  }
  console.log();

  // サマリー判定
  console.log(`【バランス総評】`);
  const graduationKey = sortedAcademic.find(([k]) => k.includes("卒業") && !k.includes("休学") && !k.includes("留年"));
  const graduationRate = graduationKey ? (academicCounts[graduationKey[0]] / totalPlayers * 100).toFixed(1) : "?";
  console.log(`  卒業率 (推定): ${graduationRate}%`);
  const archetypeBalanceNum = parseFloat(archetypeBalance);
  if (archetypeBalanceNum >= 70) {
    console.log(`  ✅ アーキタイプの分布は均等 (${archetypeBalance}%)`);
  } else if (archetypeBalanceNum >= 50) {
    console.log(`  🟡 アーキタイプにやや偏り (${archetypeBalance}%)`);
  } else {
    console.log(`  🔴 アーキタイプに大きな偏りあり (${archetypeBalance}%) — バランス調整を推奨`);
  }
  if (modeIssues.length === 0) {
    console.log(`  ✅ choiceMode フィールドに問題なし`);
  } else {
    console.log(`  🔴 choiceMode に ${modeIssues.length} 件の問題`);
  }
  console.log();
  console.log(`${"═".repeat(56)}\n`);
}

main().catch((err) => {
  console.error("シミュレーション失敗:", err);
  process.exit(1);
});
