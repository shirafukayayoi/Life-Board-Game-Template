import type {
  Player,
  Ending,
  PlayerResult,
  ExperienceKey,
} from "./gameShared";
import { EXPERIENCE_KEYS } from "./gameShared";

// ─── Score Calculation ───────────────────────────────────────────

const EXPERIENCE_WEIGHTS: Record<ExperienceKey, number> = {
  intellect: 3,
  connections: 3,
  work_tolerance: 2,
  action_power: 2,
  romance_exp: 1,
};

export function calculateScore(player: Player): number {
  const exp = player.experience;
  const res = player.resources;

  let total = 0;

  // Weighted experience sum
  for (const key of EXPERIENCE_KEYS) {
    total += exp[key] * EXPERIENCE_WEIGHTS[key];
  }

  // Resource contributions
  total += res.health * 1;
  total += res.money * 0.5;

  // Credit bonus / penalty (卒業要件: 124単位)
  if (res.credits >= 140) {
    total += 15;
  } else if (res.credits >= 124) {
    total += 10;
  } else if (res.credits >= 100) {
    total += 3;
  } else {
    total -= 10;
  }

  return total;
}

// ─── Ending Data ─────────────────────────────────────────────────

const ENDINGS: Record<string, Ending> = {
  ryuunen: {
    id: "ryuunen",
    title: "留年エンド",
    emoji: "🔄",
    description: "まだキャンパスにいる。もう1周。",
  },
  therapy: {
    id: "therapy",
    title: "療養エンド",
    emoji: "🏥",
    description: "頑張りすぎた。まずは休もう。",
  },
  realist: {
    id: "realist",
    title: "稼ぐ現実主義者",
    emoji: "💰",
    description: "金の力を知った学生時代。投資もう始めてそう。",
  },
  balanced: {
    id: "balanced",
    title: "バランス最強の理想型",
    emoji: "⭐",
    description: "何でもできる。器用貧乏とも言う。",
  },
  void: {
    id: "void",
    title: "虚無…だが自由",
    emoji: "😴",
    description: "何もしなかった。でも後悔はない…たぶん。",
  },
  scholar: {
    id: "scholar",
    title: "学究の道",
    emoji: "📚",
    description: "知を追い求めた4年間。研究者か、それに近い何か。",
  },
  popular: {
    id: "popular",
    title: "愛されキャンパス王",
    emoji: "🤝",
    description: "誰からも慕われる存在。人脈が最大の財産。",
  },
  worker: {
    id: "worker",
    title: "プロ社会人",
    emoji: "💼",
    description: "即戦力。上司が泣いて喜ぶ新人。",
  },
  adventurer: {
    id: "adventurer",
    title: "冒険者タイプ",
    emoji: "🚀",
    description: "誰もやらないことをやった。起業か、旅か、革命か。",
  },
  romantic: {
    id: "romantic",
    title: "恋に生きた4年間",
    emoji: "💕",
    description: "恋愛経験値MAX。結婚式のスピーチが長い。",
  },
};

// ─── Ending Determination ────────────────────────────────────────

const EXPERIENCE_TO_ENDING: Record<ExperienceKey, string> = {
  intellect: "scholar",
  connections: "popular",
  work_tolerance: "worker",
  action_power: "adventurer",
  romance_exp: "romantic",
};

export function determineEnding(player: Player): Ending {
  const exp = player.experience;
  const res = player.resources;

  // 1. Credits too low → ryuunen (卒業要件: 124単位)
  if (res.credits < 124) {
    return ENDINGS.ryuunen;
  }

  // 2. Health depleted → therapy
  if (res.health <= 1) {
    return ENDINGS.therapy;
  }

  // 3. Rich and work-hardened → realist
  if (res.money >= 15 && exp.work_tolerance >= 7) {
    return ENDINGS.realist;
  }

  // 4. Balanced build → balanced
  const expValues = EXPERIENCE_KEYS.map((k) => exp[k]);
  const expMax = Math.max(...expValues);
  const expMin = Math.min(...expValues);
  if (expMax - expMin <= 2 && expValues.every((v) => v >= 4)) {
    return ENDINGS.balanced;
  }

  // 5. All axes low → void
  if (expValues.every((v) => v < 3)) {
    return ENDINGS.void;
  }

  // 6. Highest axis determines ending (first key in EXPERIENCE_KEYS order wins ties)
  let highestKey: ExperienceKey = EXPERIENCE_KEYS[0];
  let highestVal = exp[highestKey];
  for (const key of EXPERIENCE_KEYS) {
    if (exp[key] > highestVal) {
      highestVal = exp[key];
      highestKey = key;
    }
  }

  return ENDINGS[EXPERIENCE_TO_ENDING[highestKey]];
}

// ─── Generate Results ────────────────────────────────────────────

export function generateResults(players: Player[]): PlayerResult[] {
  const scored = players.map((player) => ({
    player,
    score: calculateScore(player),
    ending: determineEnding(player),
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored.map((entry, index) => ({
    playerId: entry.player.id,
    playerName: entry.player.name,
    score: entry.score,
    rank: index + 1,
    ending: entry.ending,
    resources: entry.player.resources,
    experience: entry.player.experience,
    flags: entry.player.flags,
    flagHistory: entry.player.flagHistory,
  }));
}
