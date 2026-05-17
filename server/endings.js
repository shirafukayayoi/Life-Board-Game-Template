// ─── Score Calculation ───────────────────────────────────────────
// Plain JS mirror of src/endings.ts for Node.js server

const EXPERIENCE_KEYS = [
  "intellect",
  "connections",
  "work_tolerance",
  "action_power",
  "romance_exp",
];

const EXPERIENCE_WEIGHTS = {
  intellect: 3,
  connections: 3,
  work_tolerance: 2,
  action_power: 2,
  romance_exp: 1,
};

export function calculateScore(player) {
  return calculateScoreBreakdown(player).total;
}

export function calculateScoreBreakdown(player) {
  const exp = player.experience;
  const res = player.resources;

  let experience = 0;

  // Weighted experience sum
  for (const key of EXPERIENCE_KEYS) {
    experience += exp[key] * EXPERIENCE_WEIGHTS[key];
  }

  // Resource contributions
  const health = res.health * 1;
  const money = res.money * 0.5;

  // Credit bonus / penalty (卒業要件: 124単位)
  let credits = -10;
  if (res.credits >= 140) {
    credits = 15;
  } else if (res.credits >= 124) {
    credits = 10;
  } else if (res.credits >= 100) {
    credits = 3;
  }

  return {
    experience,
    health,
    money,
    credits,
    total: experience + health + money + credits,
  };
}

// ─── Ending Data ─────────────────────────────────────────────────

const ENDINGS = {
  jobless: {
    id: "jobless",
    title: "無職エンド",
    emoji: "😶",
    description: "計画通りにはいかなかった。次の一手はまだ残っている。",
    flavorText: "肩書きが空白でも、選び直す余白だけは残った。",
  },
  ryuunen: {
    id: "ryuunen",
    title: "留年エンド",
    emoji: "🔄",
    description: "まだキャンパスにいる。もう1周。",
    flavorText: "足りなかった単位は、次の作戦会議の材料になる。",
  },
  therapy: {
    id: "therapy",
    title: "療養エンド",
    emoji: "🏥",
    description: "頑張りすぎた。まずは休もう。",
    flavorText: "止まることも、長く走るための選択だった。",
  },
  realist: {
    id: "realist",
    title: "稼ぐ現実主義者",
    emoji: "💰",
    description: "金の力を知った学生時代。投資もう始めてそう。",
    flavorText: "現実を見る力は、想像以上に強い武器になった。",
  },
  balanced: {
    id: "balanced",
    title: "バランス最強の理想型",
    emoji: "⭐",
    description: "何でもできる。器用貧乏とも言う。",
    flavorText: "全部を少しずつ守った結果、ちゃんと自分の形になった。",
  },
  void: {
    id: "void",
    title: "虚無…だが自由",
    emoji: "😴",
    description: "何もしなかった。でも後悔はない…たぶん。",
    flavorText: "空白に見えた時間にも、自分だけの速度があった。",
  },
  scholar: {
    id: "scholar",
    title: "学究の道",
    emoji: "📚",
    description: "知を追い求めた4年間。研究者か、それに近い何か。",
    flavorText: "問い続けた時間が、そのまま進路になった。",
  },
  popular: {
    id: "popular",
    title: "愛されキャンパス王",
    emoji: "🤝",
    description: "誰からも慕われる存在。人脈が最大の財産。",
    flavorText: "名前を呼んでくれる人の多さが、卒業後の地図になる。",
  },
  worker: {
    id: "worker",
    title: "プロ社会人",
    emoji: "💼",
    description: "即戦力。上司が泣いて喜ぶ新人。",
    flavorText: "地味な積み重ねが、社会に出る前の筋肉になった。",
  },
  adventurer: {
    id: "adventurer",
    title: "冒険者タイプ",
    emoji: "🚀",
    description: "誰もやらないことをやった。起業か、旅か、革命か。",
    flavorText: "正解の外側に踏み出した分だけ、景色が広がった。",
  },
  romantic: {
    id: "romantic",
    title: "恋に生きた4年間",
    emoji: "💕",
    description: "恋愛経験値MAX。結婚式のスピーチが長い。",
    flavorText: "心が動いた場面の多さが、この4年間の熱量だった。",
  },
};

// ─── Ending Determination ────────────────────────────────────────

const EXPERIENCE_TO_ENDING = {
  intellect: "scholar",
  connections: "popular",
  work_tolerance: "worker",
  action_power: "adventurer",
  romance_exp: "romantic",
};

export function determineEnding(player) {
  const exp = player.experience;
  const res = player.resources;

  // 1. Career failure overrides the other endings.
  if (player.flags?.career_failed) {
    return ENDINGS.jobless;
  }

  // 2. Credits too low → ryuunen (卒業要件: 124単位)
  if (res.credits < 124) {
    return ENDINGS.ryuunen;
  }

  // 3. Health depleted -> therapy
  if (res.health <= 1) {
    return ENDINGS.therapy;
  }

  // 4. Rich and work-hardened -> realist
  if (res.money >= 15 && exp.work_tolerance >= 7) {
    return ENDINGS.realist;
  }

  // 5. Balanced build -> balanced
  const expValues = EXPERIENCE_KEYS.map((k) => exp[k]);
  const expMax = Math.max(...expValues);
  const expMin = Math.min(...expValues);
  if (expMax - expMin <= 2 && expValues.every((v) => v >= 4)) {
    return ENDINGS.balanced;
  }

  // 6. All axes low -> void
  if (expValues.every((v) => v < 3)) {
    return ENDINGS.void;
  }

  // 7. Highest axis determines ending
  let highestKey = EXPERIENCE_KEYS[0];
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

export function generateResults(players) {
  const scored = players.map((player) => ({
    player,
    score: calculateScore(player),
    scoreBreakdown: calculateScoreBreakdown(player),
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
    scoreBreakdown: entry.scoreBreakdown,
    resources: entry.player.resources,
    experience: entry.player.experience,
    flags: entry.player.flags,
    flagHistory: entry.player.flagHistory,
    choiceHistory: entry.player.choiceHistory ?? [],
  }));
}
